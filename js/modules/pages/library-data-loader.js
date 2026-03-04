/**
 * Library Data Loader
 * 負責讀取 Library JSON 資料並渲染到頁面上
 */

import { animateCards } from '../ui/scroll-animate.js';

export async function loadLibraryData() {
  try {
    const response = await fetch('../data/library.json');
    const data = await response.json();
    const container = document.getElementById('library-list-container');

    if (!container) return;

    container.innerHTML = '';

    const cardColors = ['#FF448A', '#00FF80', '#26BCFF'];
    const html = data.map((item, index) => `
      <div class="library-card cursor-pointer p-[6px]" data-pdf="${item.pdfUrl || ''}" style="--card-color: ${cardColors[index % 3]};">
        <div class="library-card-image-wrapper mb-md overflow-hidden bg-gray-2" style="aspect-ratio: 4/5;">
          <img src="${item.image}" alt="${item.titleEn}" loading="lazy" class="library-card-image w-full h-full object-cover">
        </div>
        <div class="text-left">
          <h5>${item.titleEn}</h5>
          <h5>${item.titleZh}</h5>
          <p class="text-p2 mt-xs">${item.year}</p>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;

    // 卡片進場動畫（位移 + 淡入）
    const cards = container.querySelectorAll('.library-card');
    animateCards(cards, true, { fadeIn: true });

    // Initialize PDF Viewer Logic
    initPdfViewer();

  } catch (error) {
    console.error('Error loading library data:', error);
  }
}

function initPdfViewer() {
  const container = document.getElementById('library-list-container');
  const modal = document.getElementById('pdf-viewer-modal');
  const canvasLeft = document.getElementById('pdf-canvas-left');
  const canvasRight = document.getElementById('pdf-canvas-right');
  const closeBtn = document.getElementById('pdf-close-btn');
  const prevBtn = document.getElementById('pdf-prev-btn');
  const nextBtn = document.getElementById('pdf-next-btn');
  const pageInfo = document.getElementById('pdf-page-info');

  if (!container || !modal || !canvasLeft || !closeBtn) return;

  // PDF.js worker 設定
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  let pdfDoc = null;
  let currentSpread = 1; // 以「跨頁」為單位，桌面顯示兩頁，手機顯示一頁

  const isDesktop = () => window.innerWidth >= 768;

  // 渲染單頁到指定 canvas
  async function renderPage(pageNum, canvas) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    // 等一幀讓 layout 穩定，再讀容器實際高度
    await new Promise(resolve => requestAnimationFrame(resolve));
    const gap = 128; // 左右各留 64px 間距
    const containerH = canvas.parentElement.clientHeight;
    const containerW = (canvas.parentElement.clientWidth - gap) / (isDesktop() ? 2 : 1);
    const scale = Math.min(containerH / viewport.height, containerW / viewport.width);

    const scaledViewport = page.getViewport({ scale });
    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
  }

  // 渲染當前跨頁（桌面：兩頁並排，手機：單頁）
  async function renderSpread() {
    const leftPage = isDesktop() ? currentSpread * 2 - 1 : currentSpread;
    const rightPage = leftPage + 1;
    const totalPages = pdfDoc.numPages;

    await renderPage(leftPage, canvasLeft);
    if (isDesktop() && canvasRight) await renderPage(rightPage, canvasRight);

    // 更新頁碼顯示
    if (isDesktop()) {
      const rightDisplay = rightPage <= totalPages ? `-${rightPage}` : '';
      pageInfo.textContent = `${leftPage}${rightDisplay} / ${totalPages}`;
    } else {
      pageInfo.textContent = `${leftPage} / ${totalPages}`;
    }

    // 更新按鈕狀態
    prevBtn.disabled = currentSpread <= 1;
    const maxSpread = isDesktop() ? Math.ceil(totalPages / 2) : totalPages;
    nextBtn.disabled = currentSpread >= maxSpread;
  }

  // 開啟 Modal 並載入 PDF
  async function openPdf(pdfUrl) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    document.body.style.overflow = 'hidden';

    if (typeof pdfjsLib === 'undefined') {
      console.error('PDF.js 尚未載入');
      return;
    }

    try {
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      currentSpread = 1;
      await renderSpread();
    } catch (err) {
      console.error('PDF 載入失敗:', err);
    }
  }

  // 關閉 Modal
  const closeModal = () => {
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.style.display = 'none';
      pdfDoc = null;
      document.body.style.overflow = '';
      // 清空 canvas
      [canvasLeft, canvasRight].forEach(c => { if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); });
    }, 300);
  };

  // 點擊卡片開啟
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.library-card');
    if (!card) return;
    const pdfUrl = card.getAttribute('data-pdf');
    if (pdfUrl) openPdf(pdfUrl);
    else {
      // 沒有 PDF 時也開啟 modal，顯示提示
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      document.body.style.overflow = 'hidden';
      if (pageInfo) pageInfo.textContent = 'No PDF available';
    }
  });

  // 導航
  prevBtn.addEventListener('click', async () => {
    if (currentSpread > 1) { currentSpread--; await renderSpread(); }
  });
  nextBtn.addEventListener('click', async () => {
    const maxSpread = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
    if (currentSpread < maxSpread) { currentSpread++; await renderSpread(); }
  });

  // 鍵盤導航
  document.addEventListener('keydown', async (e) => {
    if (modal.classList.contains('hidden') || !pdfDoc) return;
    if (e.key === 'ArrowLeft' && currentSpread > 1) { currentSpread--; await renderSpread(); }
    if (e.key === 'ArrowRight') {
      const maxSpread = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
      if (currentSpread < maxSpread) { currentSpread++; await renderSpread(); }
    }
    if (e.key === 'Escape') closeModal();
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // 禁止在 canvas 上右鍵儲存
  [canvasLeft, canvasRight].forEach(c => {
    if (c) c.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}