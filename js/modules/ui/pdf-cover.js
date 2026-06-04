/**
 * PDF Cover Renderer
 * 用 pdf.js 把 PDF 第一頁 render 成 dataURL，給首頁 floating press 卡用「PDF 本身的封面」。
 * 與 library-viewer 共用同一個 CDN script（data-pdfjs-dynamic 標記）避免重複載入。
 */

const PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let _loadPromise = null;
function ensurePdfjsLoaded() {
  if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs-dynamic]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.dataset.pdfjsDynamic = '1';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _loadPromise;
}

// pdfUrl → dataURL（Promise）快取：同一份 PDF 不重複 render（sample 階段多筆共用 sample.pdf）
const _coverCache = new Map();

/**
 * render PDF 第一頁成 JPEG dataURL；失敗回 null（caller 自行 skip）。
 * @param {string} pdfUrl
 * @param {number} targetWidth render 寬度（floating 卡顯示 140px，預設 2x render 取清晰度）
 * @returns {Promise<string|null>}
 */
export function renderPdfCover(pdfUrl, targetWidth = 280) {
  if (!pdfUrl) return Promise.resolve(null);
  if (_coverCache.has(pdfUrl)) return _coverCache.get(pdfUrl);

  const promise = (async () => {
    try {
      await ensurePdfjsLoaded();
      if (typeof pdfjsLib === 'undefined') return null;
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      }
      const doc  = await pdfjsLib.getDocument(pdfUrl).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp   = page.getViewport({ scale: targetWidth / base.width });

      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      // PDF 透明區填白，否則轉 JPEG 會變黑底
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      doc.destroy?.();
      return dataUrl;
    } catch (_) {
      return null;
    }
  })();

  _coverCache.set(pdfUrl, promise);
  return promise;
}
