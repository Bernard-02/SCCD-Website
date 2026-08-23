/**
 * PDF Cover Renderer
 * 用 pdf.js 把 PDF 第一頁 render 成 dataURL，給首頁 floating press 卡與 library files panel
 * （document 沒設 cover 時）用「PDF 本身的封面」。
 * 與 library-viewer 共用同一個 CDN module（import() 模組快取天然去重）。
 */

// v4+ 只出 ESM build；6.2 開大書比 3.11 快 ~30%（同 flag 實測 2026-08-18）
const PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.2.108/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.2.108/pdf.worker.min.mjs';
// CID 字型用預定義（外部）CMap 的 PDF（常見於中文舊檔）→ pdf.js 要外部 cMap 資料才能把 CID 解成字形，
// 沒給就整段中文渲染成空白（缺字）。cdnjs 不供 cmaps 目錄（403）→ 用 jsdelivr 的 pdfjs-dist cmaps。
const PDFJS_CMAPS  = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/cmaps/';

let _loadPromise = null;
function ensurePdfjsLoaded() {
  if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
  // 掛回 window.pdfjsLib 讓既有 typeof 檢查照用
  if (!_loadPromise) _loadPromise = import(PDFJS_SRC).then(m => { window.pdfjsLib = m; });
  return _loadPromise;
}

// pdfUrl → dataURL（Promise）快取：同一份 PDF 不重複 render（sample 階段多筆共用 sample.pdf）
const _coverCache = new Map();

// 持久快取（IndexedDB）key 版本：render 邏輯改動後 bump，讓舊 session 已快取的壞封面全域失效重渲，
// 免逐使用者手動清 IndexedDB。v2 = 2026-08-20 補 cMapUrl 修中文缺字（見 memory）。
const _CACHE_VER = 'v2';
const _ck = (u) => `${_CACHE_VER}:${u}`;

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

// 持久封面快取：IndexedDB（跨 session 存活，關分頁不清）。dataURL 每本 ~30-80KB、
// 122 本共幾 MB → localStorage 5MB 塞不下，IDB 無實際上限才夠。私密模式/被封鎖 →
// db() resolve null，get/set 全 no-op，降級成「每 session 現渲、只吃記憶體快取」。
// ponytail: 裸 IndexedDB，不引 idb 套件——一個 store 兩個 op 不值得多一個依賴。
const _IDB = { name: 'sccd-pdfcover', store: 'covers' };
let _dbPromise = null;
function _db() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject();
    const req = indexedDB.open(_IDB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  return _dbPromise;
}
async function idbGet(key) {
  const db = await _db();
  if (!db) return null;
  return new Promise(res => {
    try {
      const r = db.transaction(_IDB.store, 'readonly').objectStore(_IDB.store).get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    } catch (_) { res(null); }
  });
}
async function idbSet(key, val) {
  const db = await _db();
  if (!db) return;
  try { db.transaction(_IDB.store, 'readwrite').objectStore(_IDB.store).put(val, key); } catch (_) {}
}

/**
 * render PDF 第一頁成 JPEG dataURL；失敗回 null（caller 自行 skip）。
 * @param {string} pdfUrl
 * @param {number} targetWidth render 寬度（floating 卡顯示 140px，預設 2x render 取清晰度）
 * @returns {Promise<string|null>}
 */
/**
 * 只查快取（記憶體 / IndexedDB），不觸發任何下載——PDF viewer 開場墊圖用。
 * @param {string} pdfUrl
 * @returns {Promise<string|null>|null} 有快取回 Promise，沒有回 null
 */
export function peekPdfCover(pdfUrl, maxAspectRatio = 0) {
  if (!pdfUrl) return null;
  // 跟 renderPdfCover 同一組 key：press 縮圖用裁頂變體（#a1.5）快取，plain key 查不到 → 要帶 aspect
  const cacheKey = maxAspectRatio ? `${pdfUrl}#a${maxAspectRatio}` : pdfUrl;
  if (_coverCache.has(cacheKey)) return _coverCache.get(cacheKey);
  // L2：IndexedDB（跨 session 持久）。未命中 resolve null，caller 已容忍（只 read 不下載）。
  return idbGet(_ck(cacheKey)).then(v => {
    if (!v) return null;
    _coverCache.set(cacheKey, Promise.resolve(v));
    return v;
  });
}

// maxAspectRatio：封面最大高/寬比。0＝不裁（完整第一頁，files/floating 用）；
// >0＝超長頁只取頂部裁到此比例（如網頁長文 PDF：整頁塞進窄縮圖會糊成一團＋容器右側露灰，
// 裁頂 → 顯示文章頭圖/標題、正常比例、清晰。press 面板用）。
export function renderPdfCover(pdfUrl, targetWidth = 280, maxAspectRatio = 0) {
  if (!pdfUrl) return Promise.resolve(null);
  // 裁切變體另存快取（key 帶比例）→ 不與完整封面（files/viewer 墊圖用 plain url）互撞。
  const cacheKey = maxAspectRatio ? `${pdfUrl}#a${maxAspectRatio}` : pdfUrl;
  if (_coverCache.has(cacheKey)) return _coverCache.get(cacheKey);

  const promise = (async () => {
    // 持久快取命中就直接回（跨 session、關分頁不清；每本一生渲一次，之後瞬取）。
    // key 不含 targetWidth——目前 caller 同寬。
    const cached = await idbGet(_ck(cacheKey));
    if (cached) return cached;
    await _acquire();
    try {
      await ensurePdfjsLoaded();
      if (typeof pdfjsLib === 'undefined') return null;
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      }
      // disableAutoFetch + disableStream：改走 HTTP Range，只抓 xref＋第一頁需要的 chunk，
      // 不整本下載（掃描本一本可達數十 MB、封面只需第一頁；stream 開著會背景抓整本）
      // rangeChunkSize 16K：xref/page 物件散布全檔，預設 64K chunk 過抓 3.4×
      // （78MB 專刊實測 13.3MB→3.9MB、時間也最快；CloudFront TTFB 60ms 撐得起多段）
      // _r 唯一 query：同 URL 有 partial cache 時，Chrome 會把 probe 拼成「無 Accept-Ranges 的合成 200」
      // → pdf.js 誤判不支援 range 整本下載（78MB 實測）。CloudFront cache key 不含 query，edge 零損失。
      const bustUrl = pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + '_r=' + Date.now();
      const doc  = await pdfjsLib.getDocument({ url: bustUrl, disableAutoFetch: true, disableStream: true, rangeChunkSize: 16384, cMapUrl: PDFJS_CMAPS, cMapPacked: true }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp   = page.getViewport({ scale: targetWidth / base.width });

      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      // 裁頂：canvas 比 viewport 矮時，page 從 (0,0) 畫、底部超出被裁掉＝保留頂部。
      canvas.height = maxAspectRatio ? Math.min(vp.height, Math.round(vp.width * maxAspectRatio)) : vp.height;
      const ctx = canvas.getContext('2d');
      // PDF 透明區填白，否則轉 JPEG 會變黑底
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      doc.destroy?.();
      idbSet(_ck(cacheKey), dataUrl);
      return dataUrl;
    } catch (_) {
      return null;
    } finally {
      _release();
    }
  })();

  _coverCache.set(cacheKey, promise);
  return promise;
}
