/**
 * Library Viewer
 * 初始化 lightbox listener 和 PDF viewer modal（供 SPA 路由呼叫）
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';

// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lightboxListenerAdded = false;

function ensureLightboxListener() {
  if (_lightboxListenerAdded) return;
  _lightboxListenerAdded = true;
  document.addEventListener('sccd:open-lightbox', e => {
    const { media, index } = e.detail;
    openLightbox(media, index);
  });
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────

let _pdfListenerAdded = false;

function ensurePdfModal() {
  if (document.getElementById('pdf-viewer-modal')) return;

  const modal = document.createElement('div');
  modal.id        = 'pdf-viewer-modal';
  modal.className = 'fixed inset-0 z-[200] bg-black/90 flex flex-col opacity-0 transition-opacity duration-300';
  modal.style.cssText = 'display:none; padding: var(--header-height) 0 2rem;';
  modal.innerHTML = `
    <button id="pdf-close-btn" class="absolute right-4 md:right-8 text-white transition-colors duration-fast p-2" style="top: calc(var(--header-height) + 1rem);">
      <i class="fa-solid fa-xmark text-h3"></i>
    </button>
    <div class="flex items-center justify-center gap-0 w-full px-16 flex-1 min-h-0">
      <canvas id="pdf-canvas-left"  class="bg-white shadow-2xl block"      style="max-height:100%;max-width:100%;width:auto;height:auto;"></canvas>
      <canvas id="pdf-canvas-right" class="bg-white shadow-2xl hidden md:block" style="max-height:100%;max-width:100%;width:auto;height:auto;"></canvas>
    </div>
    <div class="flex items-center justify-center gap-xl mt-md text-white flex-shrink-0">
      <button id="pdf-prev-btn" class="p-2 disabled:opacity-30 transition-opacity"><i class="fa-solid fa-chevron-left text-p2"></i></button>
      <span   id="pdf-page-info" class="text-p2"></span>
      <button id="pdf-next-btn" class="p-2 disabled:opacity-30 transition-opacity"><i class="fa-solid fa-chevron-right text-p2"></i></button>
    </div>`;
  document.body.appendChild(modal);
}

function initPdfViewer() {
  if (_pdfListenerAdded) return;

  ensurePdfModal();

  // pdf.js worker（cdnjs 版本與 library.html head 的 script 一致）
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const modal    = document.getElementById('pdf-viewer-modal');
  const canvasL  = document.getElementById('pdf-canvas-left');
  const canvasR  = document.getElementById('pdf-canvas-right');
  const prevBtn  = document.getElementById('pdf-prev-btn');
  const nextBtn  = document.getElementById('pdf-next-btn');
  const pageInfo = document.getElementById('pdf-page-info');
  const closeBtn = document.getElementById('pdf-close-btn');
  if (!modal || !canvasL || !canvasR) return;

  let pdfDoc   = null;
  let curPage  = 1;
  let rendering = false;

  function isDesktop() { return window.innerWidth >= 768; }

  async function renderSpread(leftPage) {
    if (!pdfDoc || rendering) return;
    rendering = true;

    const totalPages = pdfDoc.numPages;
    const showTwo = isDesktop() && leftPage + 1 <= totalPages;

    async function renderPage(pageNum, canvas) {
      const page = await pdfDoc.getPage(pageNum);
      const container = modal.querySelector('.flex.items-center');
      const availH = (container ? container.clientHeight : window.innerHeight * 0.8) * 0.75;
      const availW = (container ? container.clientWidth  : window.innerWidth)  * (showTwo ? 0.42 : 0.60);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(availH / base.height, availW / base.width);
      const vp = page.getViewport({ scale });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }

    await renderPage(leftPage, canvasL);
    canvasL.style.display = 'block';

    if (showTwo) {
      await renderPage(leftPage + 1, canvasR);
      canvasR.style.display = 'block';
    } else {
      canvasR.style.display = 'none';
    }

    const rightPage = showTwo ? leftPage + 1 : leftPage;
    pageInfo.textContent = showTwo
      ? `${leftPage} – ${rightPage} / ${totalPages}`
      : `${leftPage} / ${totalPages}`;

    prevBtn.disabled = leftPage <= 1;
    nextBtn.disabled = showTwo ? leftPage + 2 > totalPages : leftPage >= totalPages;
    rendering = false;
  }

  function openModal() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
      if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
      canvasL.getContext('2d').clearRect(0, 0, canvasL.width, canvasL.height);
      canvasR.getContext('2d').clearRect(0, 0, canvasR.width, canvasR.height);
    }, 300);
    document.body.style.overflow = 'hidden';
  }

  _pdfListenerAdded = true;

  document.addEventListener('sccd:open-pdf', async (e) => {
    const { pdfUrl } = e.detail;
    if (!pdfUrl) return;
    // 確保 pdfjsLib 已載入
    if (typeof pdfjsLib === 'undefined') { console.error('pdf.js not loaded'); return; }
    curPage = 1;
    openModal();
    try {
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      renderSpread(curPage);
    } catch (err) {
      console.error('PDF load error:', err);
      closeModal();
    }
  });

  prevBtn.addEventListener('click', () => {
    const step = (isDesktop() && curPage > 2) ? 2 : 1;
    curPage = Math.max(1, curPage - step);
    renderSpread(curPage);
  });

  nextBtn.addEventListener('click', () => {
    const step = isDesktop() ? 2 : 1;
    curPage = Math.min(pdfDoc.numPages, curPage + step);
    renderSpread(curPage);
  });

  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!pdfDoc || modal.style.display === 'none') return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowRight' && !nextBtn.disabled) nextBtn.click();
    if (e.key === 'ArrowLeft'  && !prevBtn.disabled) prevBtn.click();
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export function initLibraryViewer() {
  ensureLightboxListener();
  initPdfViewer();
}
