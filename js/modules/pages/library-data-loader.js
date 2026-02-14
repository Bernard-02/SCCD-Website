/**
 * Library Data Loader
 * 負責讀取 Library JSON 資料並渲染到頁面上
 */

export async function loadLibraryData() {
  try {
    const response = await fetch('../data/library.json');
    const data = await response.json();
    const container = document.getElementById('library-list-container');

    if (!container) return;

    container.innerHTML = '';

    const html = data.map(item => `
      <div class="library-card cursor-pointer group" data-pdf="${item.pdfUrl || ''}">
        <div class="library-card-image-wrapper mb-md overflow-hidden bg-gray-2" style="aspect-ratio: 4/5;">
          <img src="${item.image}" alt="${item.titleEn}" loading="lazy" class="library-card-image w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
        </div>
        <div class="text-left">
          <h5>${item.titleEn}</h5>
          <h5>${item.titleZh}</h5>
          <p class="text-p1 mt-xs">${item.year}</p>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;

    // Initialize PDF Viewer Logic
    initPdfViewer();

  } catch (error) {
    console.error('Error loading library data:', error);
  }
}

function initPdfViewer() {
  const container = document.getElementById('library-list-container');
  const modal = document.getElementById('pdf-viewer-modal');
  const iframe = document.getElementById('pdf-iframe');
  const closeBtn = document.getElementById('pdf-close-btn');

  if (!container || !modal || !iframe || !closeBtn) return;

  // Open Modal
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.library-card');
    if (card) {
      let pdfUrl = card.getAttribute('data-pdf');

      // 如果沒有 PDF 連結，使用 Placeholder 進行版面測試
      if (!pdfUrl) {
        pdfUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
          <body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f0f0;color:#666;font-family:sans-serif;">
            <div style="text-align:center;">
              <h3 style="margin-bottom:10px;color:#333;">PDF Placeholder</h3>
              <p>Layout Test Mode (No PDF Source)</p>
            </div>
          </body>
        `);
      } else {
        // 如果有 PDF，加上隱藏工具列的參數
        pdfUrl = `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
      }
        
      if (pdfUrl) {
        iframe.src = pdfUrl;
        modal.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        setTimeout(() => {
          modal.classList.remove('opacity-0');
        }, 10);
        
        // Disable body scroll
        document.body.style.overflow = 'hidden';
      }
    }
  });

  // Close Modal Function
  const closeModal = () => {
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.classList.add('hidden');
      iframe.src = ''; // Clear src to stop loading/playing
      document.body.style.overflow = ''; // Restore body scroll
    }, 300);
  };

  closeBtn.addEventListener('click', closeModal);
  
  // Close when clicking outside the content (on the black background)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}