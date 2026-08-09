/**
 * PDF Cover Renderer
 * 用 pdf.js 把 PDF 第一頁 render 成 dataURL，給首頁 floating press 卡與 library files panel
 * （document 沒設 cover 時）用「PDF 本身的封面」。
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

// 併發閘門：同時最多 3 份 PDF 在抓＋渲。library files 一頁 28+ 本掃描檔全並行
// 會把頻寬＋主執行緒灌爆（refresh 灰卡卡頓的根因，user 2026-08-08）
const MAX_CONCURRENT = 3;
let _active = 0;
const _waiters = [];
function _acquire() {
  if (_active < MAX_CONCURRENT) { _active++; return Promise.resolve(); }
  return new Promise(r => _waiters.push(r));
}
function _release() {
  const next = _waiters.shift();
  if (next) next();   // 名額直接轉讓，_active 不變
  else _active--;
}

/**
 * render PDF 第一頁成 JPEG dataURL；失敗回 null（caller 自行 skip）。
 * @param {string} pdfUrl
 * @param {number} targetWidth render 寬度（floating 卡顯示 140px，預設 2x render 取清晰度）
 * @returns {Promise<string|null>}
 */
/**
 * 只查快取（記憶體 / sessionStorage），不觸發任何下載——PDF viewer 開場墊圖用。
 * @param {string} pdfUrl
 * @returns {Promise<string|null>|null} 有快取回 Promise，沒有回 null
 */
export function peekPdfCover(pdfUrl) {
  if (!pdfUrl) return null;
  if (_coverCache.has(pdfUrl)) return _coverCache.get(pdfUrl);
  try {
    const hit = sessionStorage.getItem('pdfcover:' + pdfUrl);
    if (hit) {
      const p = Promise.resolve(hit);
      _coverCache.set(pdfUrl, p);
      return p;
    }
  } catch (_) {}
  return null;
}

export function renderPdfCover(pdfUrl, targetWidth = 280) {
  if (!pdfUrl) return Promise.resolve(null);
  if (_coverCache.has(pdfUrl)) return _coverCache.get(pdfUrl);

  // refresh 免重抓重渲：dataURL 進 sessionStorage（30 本 × ~60KB ≈ 2MB，quota 內；
  // 爆 quota / 隱私模式炸掉就略過，照常現渲。key 不含 targetWidth——目前兩個 caller 同寬）
  try {
    const hit = sessionStorage.getItem('pdfcover:' + pdfUrl);
    if (hit) {
      const p = Promise.resolve(hit);
      _coverCache.set(pdfUrl, p);
      return p;
    }
  } catch (_) {}

  const promise = (async () => {
    await _acquire();
    try {
      await ensurePdfjsLoaded();
      if (typeof pdfjsLib === 'undefined') return null;
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      }
      // disableAutoFetch + disableStream：改走 HTTP Range，只抓 xref＋第一頁需要的 chunk，
      // 不整本下載（Directus /assets 已驗證回 206；掃描本一本可達數十 MB、封面只需第一頁）
      const doc  = await pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: true, disableStream: true }).promise;
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
      try { sessionStorage.setItem('pdfcover:' + pdfUrl, dataUrl); } catch (_) {}
      return dataUrl;
    } catch (_) {
      return null;
    } finally {
      _release();
    }
  })();

  _coverCache.set(pdfUrl, promise);
  return promise;
}
