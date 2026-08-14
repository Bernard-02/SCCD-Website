// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Library Viewer
 * 初始化 lightbox listener 和 PDF viewer modal（供 SPA 路由呼叫）
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { createRefBtn } from '../lightbox/lightbox-ref-btn.js';
import { applyScreenWatermark, repositionScreenWatermark } from '../lightbox/screen-watermark.js';
import { sitePath } from '../ui/site-base.js';
import { peekPdfCover } from '../ui/pdf-cover.js';
import { awaitLayoutReady } from '../ui/await-layout-ready.js';

// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lightboxListenerAdded = false;

function ensureLightboxListener() {
  if (_lightboxListenerAdded) return;
  _lightboxListenerAdded = true;
  document.addEventListener('sccd:open-lightbox', e => {
    const { media, index, title, color, references, shareUrl } = e.detail;
    // title / color / references / shareUrl 由 caller (library-panels) 帶入；沒帶就 fallback 不顯示對應 UI
    openLightbox(media, index, { title, color, references, shareUrl });
  });
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────

let _pdfListenerAdded = false;
let _pdfjsLoadPromise = null;

// SPA 從沒含 pdf.min.js 的頁面（about / courses 等）navigate 過來時，pdfjsLib 不存在
// → click 一律 early return "pdf.js not loaded"。動態 inject script 補載入，cached idempotent。
function ensurePdfjsLoaded() {
  if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
  if (_pdfjsLoadPromise) return _pdfjsLoadPromise;
  _pdfjsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs-dynamic]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.dataset.pdfjsDynamic = '1';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _pdfjsLoadPromise;
}

function ensurePdfModal() {
  if (document.getElementById('pdf-viewer-modal')) return;

  const modal = document.createElement('div');
  modal.id        = 'pdf-viewer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'PDF 文件檢視器 PDF viewer');
  // 結構對齊 activities-lightbox：X 右上 + prev/next 主區域左右 absolute + 底部資訊條
  // scrollbar gutter 由 lightbox-shell 染 html bg 處理
  // 新增：左下角 title pill（鏡像 album）/ 底部右側 zoom controls / 中央 .pdf-zoom-stage 包 canvases
  modal.className = 'fixed inset-0 z-[9999] bg-black/90 flex flex-col opacity-0 transition-opacity duration-300';
  modal.style.display = 'none';
  modal.innerHTML = `
    <!-- back btn / title / ref btn 都改放到底部 .pdf-bottom-bar 內（見下），才能跟頁碼/zoom 同一水平線置中（user 2026-06-03）-->

    <!-- px-16 md:px-32：desktop padding 加大讓 stage（=zoom mask）邊緣停在 chevron 內側，
         避免 zoom 後 PDF/canvas 視覺貼到 chevron 上。chevron right edge ≈ container-padding + 44 = 68px，
         px-32 = 128px → mask 邊 60px gap。mobile 維持 px-16 -->
    <div class="pdf-main-row flex items-center justify-center w-full px-16 md:px-32 pt-xl pb-md flex-1 min-h-0 relative">
      <!-- chevron 對齊 logo 左/右邊（var(--container-padding)）= 跟 back btn 同 column -->
      <button id="pdf-prev-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20" style="left: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m"></span>
      </button>
      <!-- zoom stage：overflow:hidden 容器，transform 套在 .pdf-canvas-row 上做 zoom + pan -->
      <div class="pdf-zoom-stage" style="position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <div class="pdf-canvas-row flex items-center justify-center gap-0 w-full h-full" style="transform-origin:center;will-change:transform;">
          <div class="pdf-rendered-content" style="position:relative;overflow:hidden;flex-shrink:0;">
            <canvas id="pdf-canvas-left" class="bg-white block" style="user-select:none;"></canvas>
            <div class="pdf-watermark" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;z-index:20;"></div>
          </div>
        </div>
      </div>
      <button id="pdf-next-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20" style="right: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m rotate-180"></span>
      </button>
    </div>

    <!-- PDF 無縮圖列，底部只放頁碼 + zoom controls → 不撐高，讓 PDF stage 盡量往下延伸（user 2026-06-02）。
         （曾為對齊 album .alb-thumbs-wrap 撐到 156px，但 PDF 那段是空的，user 要求拿掉讓 PDF 更高）-->
    <!-- min-height 108px：對齊 album .alb-thumbs-wrap 的 row 高度，讓底部 pill 的 breathing room 跟 album 一致。
         album row = thumb 48px + .alb-thumbs padding 6×2 + pt-md/pb-md 24×2 = 108px；PDF 無縮圖列、自然只 ~72px，
         pill（left bottom 旋轉、兩行 ~57px）在矮 bar 裡離底邊太近顯得比 album 低 → 補 min-height 拉到同高。
         （此處刻意 re-add 之前為衝 stage 高度而移除的 min-height；user 2026-06-03 要 pill 對齊 album，接受 stage 少 ~36px） -->
    <div class="pdf-bottom-bar relative flex items-center justify-center px-xl py-md flex-shrink-0 text-white" style="min-height: 108px;">
      <!-- back btn + title（ref btn 由 JS 插入此 bar）：absolute 靠左 + top:50% translateY(-50%)，
           與頁碼/zoom 同一水平線置中（user 2026-06-03；鏡像 album .alb-topbar 在 thumbs-wrap 內的做法）。
           translateY 套外層定位元素、rotate 套內層 pill → 兩 transform 不衝突。
           rotate 的 transform-origin = left bottom（與 album .alb-close-pill / .alb-title-pill 一致，user 2026-06-03 要求對齊 album）；
           繞左下角轉會讓寬 title pill 右端下沉，跟 album 同樣的視覺（接受） -->
      <button class="pdf-back-btn absolute" style="top: 50%; transform: translateY(-50%); left: var(--container-padding, 1.5rem); z-index: 50;">
        <span class="pdf-back-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;font-size:var(--font-size-s);line-height:1;transform:rotate(0deg);transform-origin:left bottom;box-sizing:border-box;">
          <span class="icon icon-arrow-left icon-m"></span>
        </span>
      </button>
      <div class="pdf-title absolute" style="top: 50%; transform: translateY(-50%); left: 4rem; z-index: 50; display: none;"></div>
      <!-- Share btn：排在 title 之後（鏡像 album lightbox）。caller 帶 shareUrl（library press/files）才顯示；
           data-share-url 由 open-pdf handler 設、全站 share-modal.js [data-share-btn] delegation 接管（QR + 複製）。
           圖示＝返回鍵那顆粗箭頭旋轉 135° 指右上 ↗（與 album share btn 一致，user 2026-06-15）。-->
      <button class="pdf-share-btn absolute" data-share-btn aria-label="分享 Share" style="top: 50%; transform: translateY(-50%); left: 4rem; z-index: 50; display: none;">
        <span class="pdf-share-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;transform-origin:left bottom;box-sizing:border-box;">
          <span class="icon icon-arrow-left icon-m" style="transform: rotate(135deg);"></span>
        </span>
      </button>
      <span id="pdf-page-info" class="text-s"></span>
      <!-- 頁碼 justify-center 置中；zoom controls 靠右 absolute，top:50%+translateY(-50%) 與頁碼同一水平線
           （user 2026-06-03 澄清：頁碼置中、controls 靠右、兩者對齊在同一水平線，不是整組置中）-->
      <div class="pdf-zoom-controls absolute text-white" style="right: var(--container-padding, 1.5rem); top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 12px;">
        <button id="pdf-zoom-out" class="p-2 transition-opacity hover:opacity-60 disabled:opacity-30 disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Zoom out">
          <span class="icon icon-zoom-out icon-m"></span>
        </button>
        <span id="pdf-zoom-pct" class="text-s" style="font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center;">100%</span>
        <button id="pdf-zoom-in" class="p-2 transition-opacity hover:opacity-60 disabled:opacity-30 disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Zoom in">
          <span class="icon icon-zoom-in icon-m"></span>
        </button>
        <!-- Fit Page ↔ Fit Width 雙態 toggle；icon 顯示「下一個動作」：預設 Fit Page → 顯示 fit_width（點了切滿寬）-->
        <button id="pdf-fit-toggle" class="p-2 transition-opacity hover:opacity-60 disabled:opacity-30 disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Fit / zoom toggle">
          <span class="icon icon-fit-width icon-m"></span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// 共用 PDF viewer：library + alumni（會議紀錄）都用，dispatch 'sccd:open-pdf' { detail: {pdfUrl} }
// idempotent：_pdfListenerAdded 防重複，listener / DOM 只建一次
export function initPdfViewer() {
  if (_pdfListenerAdded) return;

  ensurePdfModal();

  // pdf.js worker setup helper（idempotent；ensurePdfjsLoaded resolve 後 call 一次）
  function setupPdfjsWorker() {
    if (typeof pdfjsLib === 'undefined') return;
    if (pdfjsLib.GlobalWorkerOptions.workerSrc) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  setupPdfjsWorker();

  const modal     = document.getElementById('pdf-viewer-modal');
  const canvasL   = document.getElementById('pdf-canvas-left');
  const prevBtn   = document.getElementById('pdf-prev-btn');
  const nextBtn   = document.getElementById('pdf-next-btn');
  const pageInfo  = document.getElementById('pdf-page-info');
  const backBtn   = modal.querySelector('.pdf-back-btn');
  const backPill  = modal.querySelector('.pdf-back-pill');
  const stageEl   = modal.querySelector('.pdf-zoom-stage');
  const rowEl     = modal.querySelector('.pdf-canvas-row');
  const renderedContentEl = modal.querySelector('.pdf-rendered-content');
  const mainRowEl = modal.querySelector('.pdf-main-row');
  const bottomBarEl = modal.querySelector('.pdf-bottom-bar');
  const titleEl   = modal.querySelector('.pdf-title');
  const shareBtnEl = modal.querySelector('.pdf-share-btn');
  const sharePillEl = modal.querySelector('.pdf-share-pill');
  const zoomInBtn  = document.getElementById('pdf-zoom-in');
  const zoomOutBtn = document.getElementById('pdf-zoom-out');
  const zoomPctEl  = document.getElementById('pdf-zoom-pct');
  const fitToggleBtn = document.getElementById('pdf-fit-toggle');
  if (!modal || !canvasL || !stageEl || !rowEl) return;

  // ── 螢幕浮水印 + 禁右鍵下載（user 2026-06-08；2026-06-09 改連續重複斜向版）──────────
  // 浮水印排版（user 指定）：英文一行「整句連續重複」+ 中文一行「整句連續重複」、英中交替數行，整片斜 30°。
  //   作法＝兩個 background layer（EN / ZH 各一個水平 repeat 的 SVG tile）疊在同一 div、垂直交替，
  //   再把整個 div 放大 inset:-50% 後 rotate(-30deg) → 斜向連續文字、邊緣由外層 .pdf-zoom-stage overflow:hidden 裁掉。
  //   ⚠️ 不要回退成「一句一句獨立擺＋整片 rotate 每個 text」：那種長英文 rotate 後會在 tile 接縫被切成半句（踩過）。
  //   ⚠️ 水平無縫關鍵＝每個 tile 寬必須＝「一句＋分隔」實際 advance 寬 → 即時量（字體已載入），寫死像素會在接縫跳位。
  // 在「開啟時」呼叫（見 sccd:open-pdf handler）：字體必載好 → 量測準；依 viewport 給手機較小較密版。
  // 共用 helper（media lightbox 也用同一份）。
  function buildWatermark() {
    applyScreenWatermark(modal.querySelector('.pdf-watermark'));
  }
  // 禁右鍵：PDF 渲染在 <canvas>，右鍵「另存圖片」會存下當頁 → viewer 開著時整個 modal 禁 contextmenu。
  // ⚠️ 只嚇阻隨手下載／截圖；拿到原始 /assets PDF 網址仍是無浮水印原檔（要檔案級保護得後臺處理）。
  modal.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Ref btn（plug-in helper）─────────────────────────────────────
  // 提供「跳轉到 activities 對應 item」的 chip popover；close lightbox 後 SPA 換頁
  const refUi = createRefBtn('#00FF80', () => closeModal());
  refUi.btnEl.classList.add('pdf-ref-btn');
  refUi.btnEl.style.position = 'absolute';
  refUi.btnEl.style.top = '50%';
  refUi.btnEl.style.transform = 'translateY(-50%)';   // 垂直置中於 bar，跟 back/title/頁碼同一水平線
  refUi.btnEl.style.zIndex = '50';
  // left 由 positionRefBtn 動態算（anchor 到 back btn 右緣 + gap）；先給 fallback 避免閃位
  refUi.btnEl.style.left = '4rem';
  (bottomBarEl || modal).appendChild(refUi.btnEl);    // ref btn 進 bar → 跟 back/title/頁碼/zoom 同一水平線
  modal.appendChild(refUi.popoverEl);                 // popover 仍掛 modal（full overlay；positionPopover 用 viewport rect 算）

  let pdfDoc   = null;
  let curPage  = 1;
  let rendering = false;
  let wantWatermark = false;   // 只有 document/files 來源的 PDF 要浮水印（press / 會議紀錄 / charter 不用）
  let openToken = 0;             // 每次 open ++、close 也 ++：作廢慢到的開場墊圖（見 sccd:open-pdf handler）
  let firstPageRendered = false; // 高解析第一頁已上 canvas → 墊圖不得再蓋
  let placeholderShowing = false; // LQIP 墊圖（馬賽克）顯示中 → 第一頁 render 完做 de-pixelate 揭示
  let mosaicTween = null;         // de-pixelate 揭示 tween（close / 重開要 kill）
  const mosaicScratch  = document.createElement('canvas');  // 馬賽克降採樣暫存（reused）
  const mosaicPristine = document.createElement('canvas');  // 揭示前的清晰頁快照（reused）

  // ── Zoom 狀態（對齊 activities-lightbox album viewer 邏輯）────────────────
  // 內部 zoom.scale 恆以「fit-to-stage」為 1（同 album）。
  // 顯示 % = zoom.scale × fitRatio × 100；fitRatio = fitDims/naturalDims = canvas 顯示寬 / PDF 原寸寬
  // 預設打開 = Fit Page (zoom.scale=1 fit-to-stage)，仿 Acrobat「適合頁面」整頁撐滿視窗（user 2026-06-02）
  // actual size (100% PDF 原寸) = zoom.scale = 1/fitRatio，要 zoom out 才到（同 Acrobat Actual Size 是選項非預設）
  // fit-toggle = 回 zoom.scale=1（fit-to-stage / Fit Page）
  const MIN_PCT = 0.10;   // 10% 下限（百分比 = 相對 PDF 原寸）
  const MAX_PCT = 6;      // 600% 上限
  // 渲染品質：每次切換 scale 重渲（不靠 CSS 放大避免高倍模糊；同 album 但 album 用 img naturalDims+CSS scale）
  // PDF 不一樣：CSS scale 放大會糊文字，重渲較慢但清晰；採折衷 RENDER_QUALITY=2 平衡
  const RENDER_QUALITY = 2;
  let zoom = { scale: 1, tx: 0, ty: 0 };
  // fitDims / naturalDims（同 album 命名）：
  // - naturalDims = PDF 原寸 (PDF.js scale=1 的 viewport 寬高 = CSS px @96dpi)
  // - fitDims = 在 stage 內 contain 後的渲染顯示尺寸（CSS px）；永遠 ≤ naturalDims（小 PDF 不放大）
  let fitDims = { w: 0, h: 0 };
  let naturalDims = { w: 0, h: 0 };
  let isDragging = false;
  let dragStart  = { x: 0, y: 0, tx: 0, ty: 0 };
  // wheel 翻頁 debounce：touchpad 一次手勢會 burst 多 events
  let wheelPageLock = 0;
  const WHEEL_PAGE_COOLDOWN = 350;

  function getFitRatio() {
    return naturalDims.w > 0 && fitDims.w > 0 ? fitDims.w / naturalDims.w : 0;
  }
  const fitScale    = () => 1;
  const actualScale = () => { const r = getFitRatio(); return r > 0 ? 1 / r : 1; };
  function minScale() {
    const r = getFitRatio();
    if (r <= 0) return 1;
    return Math.min(fitScale(), MIN_PCT / r);
  }
  function maxScale() {
    const r = getFitRatio();
    if (r <= 0) return 6;
    return Math.max(actualScale(), MAX_PCT / r);
  }
  function isFit() { return Math.abs(zoom.scale - fitScale()) < 0.001; }

  // Fit Width（仿 Acrobat「適合寬度」）：頁面寬度填滿 availW 對應的 scale。
  // portrait 頁比 Fit Page 大（高度溢出 → 垂直 pan）；landscape 頁等於 Fit Page（Fit Page 已填滿寬）。
  function fitWidthScale() {
    if (fitDims.w <= 0) return fitScale();
    const availW = stageEl.clientWidth || window.innerWidth;  // 填滿整個 stage 寬（不再 *0.92；px-32 已留 chevron clearance，user 2026-06-03 要 Fit Width 頂到邊）
    return Math.max(fitScale(), availW / fitDims.w);
  }
  function isFitWidth() {
    const fw = fitWidthScale();
    return fw > fitScale() + 0.001 && Math.abs(zoom.scale - fw) < 0.001;
  }
  // Fit Width 進入時對齊「頁面頂端」（仿 Acrobat 適合寬度：頁高溢出時從頂部開始看，而非顯示中段）。
  // top-align ty = +maxTy（把頁面頂端貼到 stage 頂端）；頁面不溢出（landscape）時 maxTy=0 即整頁置中。
  // user 2026-06-03：點 Fit Width 預設要對齊頂部、不要從中間放大。
  function fitWidthTopTy(scale) {
    const scaledH = fitDims.h * scale;
    return Math.max(0, (scaledH - stageEl.getBoundingClientRect().height) / 2);
  }
  function applyFitWidth(animated = false) {
    zoom.scale = Math.max(minScale(), Math.min(maxScale(), fitWidthScale()));
    zoom.tx = 0;
    zoom.ty = fitWidthTopTy(zoom.scale);
    applyZoom(animated);
  }

  function applyZoom(animated = false) {
    rowEl.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
    rowEl.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
    const canPan = zoom.scale > fitScale() + 0.001;
    rowEl.style.cursor = isDragging
      ? `url('${sitePath('custom-cursor/drag_2.svg')}') 10 10, grabbing`
      : (canPan
          ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
          : `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`);
    updateZoomUI();
  }

  function updateZoomUI() {
    if (!zoomPctEl) return;
    const fitRatio = getFitRatio();
    const displayPct = Math.round(zoom.scale * (fitRatio > 0 ? fitRatio : 1) * 100);
    zoomPctEl.textContent = `${displayPct}%`;
    zoomInBtn.disabled  = zoom.scale >= maxScale() - 0.001;
    zoomOutBtn.disabled = zoom.scale <= minScale() + 0.001;
    // fit-toggle = Fit Page ↔ Fit Width 雙態切換（user 2026-06-02）；不 disable，icon 反映當前模式：
    // 在 Fit Width → fit_width icon；其他（Fit Page / 手動 zoom）→ fit_to_viewport icon
    if (fitToggleBtn) {
      const fitIcon = fitToggleBtn.querySelector('.icon');
      if (fitIcon) {
        // icon 顯示「下一個動作」（user 2026-06-03）：在 Fit Width → fit_to_viewport（點了回 Fit Page）；
        // 否則（Fit Page / 手動 zoom）→ fit_width（點了切 Fit Width）
        const w = isFitWidth();
        fitIcon.classList.toggle('icon-fit-viewport', w);
        fitIcon.classList.toggle('icon-fit-width', !w);
      }
    }
  }

  function clampPan() {
    if (zoom.scale <= fitScale() + 0.001) { zoom.tx = 0; zoom.ty = 0; return; }
    const sr = stageEl.getBoundingClientRect();
    const scaledW = fitDims.w * zoom.scale;
    const scaledH = fitDims.h * zoom.scale;
    const maxTx = Math.max(0, (scaledW - sr.width)  / 2);
    const maxTy = Math.max(0, (scaledH - sr.height) / 2);
    zoom.tx = Math.max(-maxTx, Math.min(maxTx, zoom.tx));
    zoom.ty = Math.max(-maxTy, Math.min(maxTy, zoom.ty));
  }

  // 在 (clientX, clientY) 為焦點縮放（zoom-button 用 stage 中心）— 完全比照 album zoomAt
  function zoomAt(clientX, clientY, factor, animated = false) {
    const sr = stageEl.getBoundingClientRect();
    const cx = clientX - sr.left;
    const cy = clientY - sr.top;
    const sw = sr.width, sh = sr.height;
    const imgX = (cx - sw / 2 - zoom.tx) / zoom.scale;
    const imgY = (cy - sh / 2 - zoom.ty) / zoom.scale;
    const newScale = Math.max(minScale(), Math.min(maxScale(), zoom.scale * factor));
    if (Math.abs(newScale - zoom.scale) < 0.0001) return;
    zoom.tx = cx - sw / 2 - imgX * newScale;
    zoom.ty = cy - sh / 2 - imgY * newScale;
    zoom.scale = newScale;
    clampPan();
    applyZoom(animated);
  }

  function zoomAtStageCenter(factor, animated = false) {
    const r = stageEl.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor, animated);
  }

  function zoomToScale(targetScale, animated = false) {
    targetScale = Math.max(minScale(), Math.min(maxScale(), targetScale));
    if (Math.abs(targetScale - zoom.scale) < 0.0001) return;
    zoomAtStageCenter(targetScale / zoom.scale, animated);
  }

  function resetToFit(animated = false)    { zoomToScale(fitScale(),    animated); }

  // 渲染單頁（一頁一頁翻）；計算 fitDims/naturalDims，保留 wasFit/wasActual 狀態跨頁
  // ── LQIP 馬賽克墊圖（取代 gaussian blur-up；user 2026-08-10）───────────────
  // 業界 pixelation = 最近鄰放大縮圖：把來源降採到 N 格、再 nearest-neighbor 放大回滿版。
  // blocksAcross = 水平格數（越小越糊）。canvasL 尺寸即時讀（墊圖=封面原寸、揭示=高解析頁）。
  function drawMosaic(source, blocksAcross) {
    const w = canvasL.width, h = canvasL.height;
    if (!w || !h) return;
    const n  = Math.max(1, Math.round(blocksAcross));
    const sw = n, sh = Math.max(1, Math.round(n * h / w));
    mosaicScratch.width = sw; mosaicScratch.height = sh;
    const sctx = mosaicScratch.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(source, 0, 0, sw, sh);                     // 降採 → N 格縮圖
    const ctx = canvasL.getContext('2d');
    ctx.imageSmoothingEnabled = false;                        // 關平滑 = 硬邊馬賽克（非模糊）
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(mosaicScratch, 0, 0, sw, sh, 0, 0, w, h);   // 最近鄰放大回滿版
  }

  // 揭示：把「已在 canvasL 上的高解析頁」快照成 pristine，再從粗格→細格 de-pixelate 到清晰。
  // 幾何插值（log 空間等速）＝格子大小視覺上等速縮小，收尾「對焦入場」感。
  function revealMosaic() {
    const w = canvasL.width, h = canvasL.height;
    placeholderShowing = false;
    if (!w || !h || typeof gsap === 'undefined') return;
    mosaicPristine.width = w; mosaicPristine.height = h;
    mosaicPristine.getContext('2d').drawImage(canvasL, 0, 0); // 快照清晰頁（此刻 canvasL 尚未被馬賽克覆蓋）
    const START = 22, END = w, s = { p: 0 };
    drawMosaic(mosaicPristine, START);                        // 同 tick 先蓋粗格，避免先閃一幀清晰
    if (mosaicTween) mosaicTween.kill();
    mosaicTween = gsap.to(s, {
      p: 1, duration: 0.5, ease: 'none',
      onUpdate: () => drawMosaic(mosaicPristine, START * Math.pow(END / START, s.p)),
      onComplete: () => {
        const ctx = canvasL.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mosaicPristine, 0, 0);                 // 收尾補一張 1:1 清晰
        mosaicTween = null;
      },
    });
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || rendering) return;
    rendering = true;

    // 先對齊 logo 下緣（再讀 stageEl.clientHeight，下方讀取會強制 reflow 拿到正確高度）
    positionPdfStageRelativeToLogo();

    const totalPages = pdfDoc.numPages;
    const isFirstRender = naturalDims.w === 0;
    const wasFit      = !isFirstRender && Math.abs(zoom.scale - fitScale())    < 0.001;
    const wasFitWidth = !isFirstRender && isFitWidth();   // 用「舊」fitDims 判斷（此時尚未更新）
    const wasActual   = !isFirstRender && Math.abs(zoom.scale - actualScale()) < 0.001;

    const page = await pdfDoc.getPage(pageNum);
    const availH = stageEl.clientHeight || window.innerHeight * 0.8;
    const availW = stageEl.clientWidth || window.innerWidth;  // 填滿整個 stage 寬（不再 *0.92；px-32 已留 chevron clearance，user 2026-06-03 要 Fit Width 頂到邊）
    const base = page.getViewport({ scale: 1 });
    naturalDims = { w: base.width, h: base.height };
    // Fit Page（仿 Adobe Acrobat「適合頁面」）：整頁塞滿視窗，可放大可縮小，無「不放大」上限。
    // 跟 album 點陣圖不同 — PDF 是向量，放大是重新 render（crisp 不糊，配 RENDER_QUALITY=2）；
    // 小 PDF（A4 595×842 @96dpi）因此能撐滿，而非浮在大黑底中間（user 2026-06-02）。
    const fitFactor = Math.min(availH / base.height, availW / base.width);
    fitDims = { w: base.width * fitFactor, h: base.height * fitFactor };

    // 內部 buffer 多渲 RENDER_QUALITY 倍給 zoom 用；CSS 鎖在 fit 顯示尺寸
    const vp = page.getViewport({ scale: fitFactor * RENDER_QUALITY });
    // 雙緩衝：先渲到暫存 canvas、完成才換上。設 canvas 寬高會立刻清空畫面，
    // 大掃描 PDF 抓頁＋解碼要等，直接渲在可見 canvas 上會讓翻頁白一段（user 2026-08-08）
    const buf = document.createElement('canvas');
    buf.width  = vp.width;
    buf.height = vp.height;
    await page.render({ canvasContext: buf.getContext('2d'), viewport: vp }).promise;
    canvasL.width  = vp.width;
    canvasL.height = vp.height;
    canvasL.style.width  = fitDims.w + 'px';
    canvasL.style.height = fitDims.h + 'px';
    if (renderedContentEl) {
      renderedContentEl.style.width = fitDims.w + 'px';
      renderedContentEl.style.height = fitDims.h + 'px';
    }
    canvasL.getContext('2d').drawImage(buf, 0, 0);

    // 跨頁 state：first render 預設 Fit Page（仿 Acrobat：一打開看到整頁、撐滿視窗）。
    // 之前是 actual-size（同 album）→ A4 太小，user 2026-06-02 改採 Acrobat 邏輯。
    // 之前在 fit/actual → 跟新 page 對齊；其他 zoom 維持 scale 但 clamp 進範圍
    if (isFirstRender || wasFit) {
      zoom.scale = fitScale();
      zoom.tx = 0; zoom.ty = 0;
    } else if (wasFitWidth) {
      zoom.scale = fitWidthScale();   // 用新 fitDims 重算，跨頁維持 Fit Width
      zoom.tx = 0;
      zoom.ty = fitWidthTopTy(zoom.scale);   // 跨頁也對齊新頁頂端（同 applyFitWidth）
    } else if (wasActual) {
      zoom.scale = actualScale();
      zoom.tx = 0; zoom.ty = 0;
    } else {
      zoom.scale = Math.max(minScale(), Math.min(maxScale(), zoom.scale));
      clampPan();
    }
    applyZoom(false);

    pageInfo.textContent = `${pageNum} / ${totalPages}`;
    prevBtn.disabled = pageNum <= 1;
    nextBtn.disabled = pageNum >= totalPages;
    rendering = false;
    // 等新 canvas 已繪製後才換水印位置，避免翻頁時先動一次水印、再出新頁面。
    if (wantWatermark) {
      requestAnimationFrame(() => {
        if (curPage === pageNum) repositionScreenWatermark(modal.querySelector('.pdf-watermark'));
      });
    }
    // 渲染期間又翻了頁（該次 renderPage 被 rendering guard 擋掉、curPage 已前進）→ 補渲染最新目標頁
    if (curPage !== pageNum) renderPage(curPage);
  }

  // 上一/下一頁（一頁一頁翻，邊界自動 clamp）
  function turnPage(dir) {
    if (!pdfDoc) return;
    if (dir > 0 && nextBtn.disabled) return;
    if (dir < 0 && prevBtn.disabled) return;
    curPage = Math.max(1, Math.min(pdfDoc.numPages, curPage + dir));
    renderPage(curPage);
  }

  // 旋轉角度範圍 ±1~±3°（user 偏好 PDF/album lightbox 標題 pill 比 section-btn 角度小）
  function smallRot() { return (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2); }

  // mode3（彩色背景）：去掉三原色，pill 一律白底黑字（對比 lightbox 黑底）。
  // 跟 activities-lightbox.js resolvePillColor 同款 — PDF viewer 也是黑遮罩 host，白 pill 必定可見。
  function resolvePillColor(color) {
    if (document.body.classList.contains('mode-color')) return '#FFFFFF';
    return color || '#00FF80';
  }

  function renderTitle(title, color) {
    if (!titleEl) return;
    if (!title || (!title.en && !title.zh)) {
      titleEl.style.display = 'none';
      titleEl.innerHTML = '';
      if (backPill) backPill.style.height = '';
      return;
    }
    const bg = resolvePillColor(color);
    // 結構：pill > window(overflow:hidden) > track > unit(EN+ZH column-stacked)
    // EN+ZH 為單一 marquee unit 同步捲動（不是兩行各自 marquee 失同步）；max-width 防 Press 長標題撐爆 layout
    titleEl.innerHTML = `
      <span class="pdf-title-pill" style="display:inline-block;background:${bg};color:#000;padding:6px 8px 5px;font-weight:700;font-size:var(--font-size-s);line-height:1.2;transform:rotate(${smallRot()}deg);transform-origin:left bottom;max-width:min(40vw, 360px);box-sizing:border-box;">
        <span class="pdf-title-window" style="display:block;overflow:hidden;">
          <span class="pdf-title-track" style="display:inline-block;white-space:nowrap;will-change:transform;">
            <span class="pdf-title-unit" style="display:inline-flex;flex-direction:column;align-items:flex-start;white-space:nowrap;vertical-align:top;">
              ${title.en ? `<span>${title.en}</span>` : ''}
              ${title.zh ? `<span>${title.zh}</span>` : ''}
            </span>
          </span>
        </span>
      </span>`;
    titleEl.style.display = 'block';
    requestAnimationFrame(() => {
      syncBackBtnHeight();
      positionRefBtn();
      positionTitle();
      positionSharePdf();
      setupTitleMarquee();
    });
  }

  // EN+ZH 整組（unit）為單位 dual-copy seamless loop；同 activities-lightbox.setupTitleMarquee
  function setupTitleMarquee() {
    if (!titleEl) return;
    const win   = titleEl.querySelector('.pdf-title-window');
    const track = /** @type {HTMLElement | null} */ (titleEl.querySelector('.pdf-title-track'));
    if (!win || !track) return;
    if (typeof gsap !== 'undefined') gsap.killTweensOf(track);
    track.style.transform = '';
    while (track.children.length > 1) track.removeChild(track.lastElementChild);
    const unit = /** @type {HTMLElement | null} */ (track.querySelector('.pdf-title-unit'));
    if (!unit) return;
    const unitWidth = unit.getBoundingClientRect().width;
    const winWidth  = /** @type {HTMLElement} */ (win).clientWidth;
    if (unitWidth <= winWidth + 4) return;
    const clone = /** @type {HTMLElement} */ (unit.cloneNode(true));
    clone.style.marginLeft = '24px';
    track.appendChild(clone);
    const distance = unitWidth + 24;
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(track, { x: 0 }, {
        x: -distance, duration: Math.max(3, distance / 80), ease: 'none', repeat: -1,
      });
    }
  }

  function renderBackPill(color) {
    if (!backPill) return;
    const bg = resolvePillColor(color);
    backPill.style.background = bg;
    backPill.style.transform  = `rotate(${smallRot()}deg)`;
    // ref btn 共用同 accent；旋轉角度 0（避免兩 pill 同時亂轉視覺雜訊）
    refUi.setColor(bg);
  }

  // Share btn（library press/files PDF 專用）：caller 帶 shareUrl 才顯示，套全站 share modal（[data-share-btn] delegation）。
  // data-share-url 讓 share-modal.computeShareUrl 直接用此網址（QR + 複製）；底色同 back/ref accent，不旋轉保持端正。
  function renderSharePdf(color, shareUrl) {
    if (!shareBtnEl || !sharePillEl) return;
    if (!shareUrl) {
      shareBtnEl.style.display = 'none';
      delete shareBtnEl.dataset.shareUrl;
      return;
    }
    shareBtnEl.style.display = '';
    shareBtnEl.dataset.shareUrl = shareUrl;
    const pillBg = resolvePillColor(color);
    sharePillEl.style.background = pillBg;
    // 分享卡片底色跟 title 渲染色一致（mode-color 下 = 白，同 title）
    shareBtnEl.dataset.shareBg = pillBg;
  }

  // title pill 高度由 EN+ZH 兩行自然撐，back/ref pill follow title 高度（user 2026-06-01 拍板）
  // 之前曾嘗試 back/ref 鎖 44×44 但同 viewer 內 back 比 title 矮太多視覺不協調 → 改回 sync
  // width = min(44, h)：單行 title（h<44）→ 縮成正方形（以短邊 h 為主、砍左右 padding，user 2026-06-03）；
  //   兩行（h≥44）→ 維持 44 寬（高>寬、跟著 title 拉長）。避免單行時 44寬×33高 變橫向矩形被壓扁。
  // title 隱藏時 reset 回預設 44×44 正方形（顯式寫 '44px' 不用 ''，否則連 HTML inline 預設一起清掉 → 變 icon 高）
  function syncBackBtnHeight() {
    if (!backPill) return;
    const refPill = /** @type {HTMLElement | null} */ (refUi.btnEl.querySelector('.lightbox-ref-btn-pill'));
    const pill = titleEl && titleEl.querySelector('.pdf-title-pill');
    if (!pill || titleEl.style.display === 'none') {
      backPill.style.height = '44px'; backPill.style.width = '44px';
      if (refPill) { refPill.style.height = '44px'; refPill.style.width = '44px'; }
      if (sharePillEl) { sharePillEl.style.height = '44px'; sharePillEl.style.width = '44px'; }
      return;
    }
    // offsetHeight 含 padding，跟 visual bbox 一致（rotation 不影響 offsetHeight）
    const h = /** @type {HTMLElement} */ (pill).offsetHeight;
    if (h > 0) {
      const w = Math.min(44, h);   // 以短邊為主：單行縮成正方形、兩行維持 44 寬
      backPill.style.height = h + 'px'; backPill.style.width = w + 'px';
      if (refPill) { refPill.style.height = h + 'px'; refPill.style.width = w + 'px'; }
      if (sharePillEl) { sharePillEl.style.height = h + 'px'; sharePillEl.style.width = w + 'px'; }
    }
  }

  // 三 pill 統一 gap：back ↔ ref ↔ title 都 PILL_GAP 像素
  const PILL_GAP = 20;

  // ref btn 緊接 back btn 右邊
  function positionRefBtn() {
    if (!backBtn || refUi.btnEl.style.display === 'none') return;
    const backRect = backBtn.getBoundingClientRect();
    refUi.btnEl.style.left = (backRect.right + PILL_GAP) + 'px';
  }

  // title 跟「最右側 pill（ref btn 有就 ref，沒就 back）」固定 gap
  // 不對齊 PDF 本身，避免 PDF 寬度變化時 title 飄
  function positionTitle() {
    if (!titleEl || titleEl.style.display === 'none') return;
    if (!backBtn) return;
    const hasRef = refUi.btnEl.style.display !== 'none';
    const anchorRect = hasRef
      ? refUi.btnEl.getBoundingClientRect()
      : backBtn.getBoundingClientRect();
    titleEl.style.left = (anchorRect.right + PILL_GAP) + 'px';
  }

  // share btn 緊接 title 右邊；title 隱藏時退而錨到 ref / back（保持與 back/ref/title 同 gap）
  function positionSharePdf() {
    if (!shareBtnEl || shareBtnEl.style.display === 'none') return;
    let anchor = null;
    if (titleEl && titleEl.style.display !== 'none') anchor = titleEl;
    else if (refUi.btnEl.style.display !== 'none') anchor = refUi.btnEl;
    else anchor = backBtn;
    if (!anchor) return;
    shareBtnEl.style.left = (anchor.getBoundingClientRect().right + PILL_GAP) + 'px';
  }

  // 把 stage 上緣推到 header logo 底邊以下，鏡像 activities-lightbox positionUIRelativeToLogo
  // （讓 PDF fit 高度 == album fit 高度；user 2026-06-02 拍板「PDF 對齊 album」）。
  // SHELL_PT=24：lightbox-shell padLightboxTops 已給 modal root 加 1.5rem(24px)，這裡扣回避免雙重下推
  // → 淨 gap = logoBottom + ZOOM_GAP(16)。無 logo 時 early return，main row 維持原 py-xl 上緣。
  function positionPdfStageRelativeToLogo() {
    // 手機：單頁置中，padding-top 推到手機 logo 底邊下方（避免頁面上緣被 logo 蓋；控制列在底部 bar 不在此處理）
    if (isMobile()) {
      const mlogo = document.querySelector('#header-logo-mobile');
      const r = mlogo ? mlogo.getBoundingClientRect() : null;
      if (mainRowEl) mainRowEl.style.paddingTop = `${(r && r.height) ? r.bottom + 12 : 88}px`;
      return;
    }
    const logo = document.querySelector('#header-logo');
    if (!logo || !mainRowEl) return;
    const ZOOM_GAP = 16;
    const SHELL_PT = 24;
    mainRowEl.style.paddingTop = `${Math.max(0, logo.getBoundingClientRect().bottom + ZOOM_GAP - SHELL_PT)}px`;
  }

  // ══ 手機版觸控手勢（沿用桌面單頁引擎 renderPage / zoomAt / clampPan / turnPage，不另建渲染路徑）═══════════
  // user 2026-06-10：一次一頁、上下滑換頁、放大時單指拖曳平移、雙指 pinch 縮放（無縮放鈕）；控制列維持底部。
  // 桌面/手機都跑 renderPage（單頁 + transform 縮放），手機只多這層 touch → 既有 zoom/pan/turn 全 reuse。
  const isMobile = () => window.innerWidth < 768;
  const SWIPE_THRESHOLD = 50;   // 換頁所需垂直位移 px（小於此視為點按、不換頁）

  let touchMode = null;         // 'pinch' | 'pan' | 'swipe'（touchstart 依手指數 + 是否已放大決定）
  let pinchStartDist = 0, pinchStartScale = 1;
  let touchPanStart = { x: 0, y: 0, tx: 0, ty: 0 };
  let swipeStartX = 0, swipeStartY = 0;
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchMid  = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

  stageEl.addEventListener('touchstart', (e) => {
    if (!isMobile() || !pdfDoc) return;
    if (e.touches.length === 2) {
      touchMode = 'pinch';
      pinchStartDist = touchDist(e.touches);
      pinchStartScale = zoom.scale;
    } else if (e.touches.length === 1) {
      if (zoom.scale > fitScale() + 0.001) {           // 已放大 → 單指拖曳平移
        touchMode = 'pan';
        touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: zoom.tx, ty: zoom.ty };
      } else {                                          // fit → 記錄起點，touchend 判斷上下滑換頁
        touchMode = 'swipe';
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
      }
    }
  }, { passive: false });

  stageEl.addEventListener('touchmove', (e) => {
    if (!touchMode) return;
    if (touchMode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const target = Math.max(minScale(), Math.min(maxScale(), pinchStartScale * (touchDist(e.touches) / pinchStartDist)));
      const mid = touchMid(e.touches);
      zoomAt(mid.x, mid.y, target / zoom.scale, false);   // 以雙指中點為焦點縮放（沿用桌面 zoomAt 焦點數學）
    } else if (touchMode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      zoom.tx = touchPanStart.tx + (e.touches[0].clientX - touchPanStart.x);
      zoom.ty = touchPanStart.ty + (e.touches[0].clientY - touchPanStart.y);
      clampPan();
      applyZoom(false);
    } else if (touchMode === 'swipe') {
      e.preventDefault();   // 吞掉 iOS overscroll；換頁在 touchend 判定
    }
  }, { passive: false });

  stageEl.addEventListener('touchend', (e) => {
    if (touchMode === 'swipe' && e.changedTouches.length) {
      const dy = e.changedTouches[0].clientY - swipeStartY;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      // 垂直為主且超過門檻才換頁：上滑(dy<0)下一頁、下滑(dy>0)上一頁（同捲動方向，往下讀=往上滑）
      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) turnPage(dy < 0 ? 1 : -1);
    }
    if (e.touches.length === 0) touchMode = null;
    else if (touchMode === 'pinch' && e.touches.length === 1) touchMode = null;  // 雙指剩一指→結束 pinch（不接 pan 免跳動）
  }, { passive: false });

  function openModal() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
    // header bars hide + logo 切 inverse + footer-hide state 清零，全交給 enterLightboxMode
    enterLightboxMode();
  }

  // （2026-07-04 起 ref btn 跳轉不再 await 此函式：關閉 fadeout 與 SPA 換頁並行，統一 ref timing）
  function closeModal() {
    openToken++;   // 作廢還在路上的開場墊圖（close 後才 load 完的 cover 不得畫上）
    modal.style.opacity = '0';
    // exitLightboxMode：show bars + 移除 body.lightbox-open → theme-toggle MutationObserver
    // 自動把 logo 切回 standard/inverse/wireframe（依當前 mode）
    exitLightboxMode();
    // 停 title marquee tween（同 activities-lightbox cleanup）
    if (typeof gsap !== 'undefined' && titleEl) {
      titleEl.querySelectorAll('.pdf-title-track').forEach(el => gsap.killTweensOf(el));
    }
    return new Promise(resolve => {
      setTimeout(() => {
        modal.style.display = 'none';
        touchMode = null;        // 清手機觸控手勢狀態
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        if (mosaicTween) { mosaicTween.kill(); mosaicTween = null; }   // 停 de-pixelate 揭示 tween
        placeholderShowing = false;
        pageInfo.textContent = '';   // 下次 open 等新總頁數，不殘留舊值
        canvasL.getContext('2d').clearRect(0, 0, canvasL.width, canvasL.height);
        // reset 內部狀態（下次 open 重新計 fitDims/naturalDims）
        zoom = { scale: 1, tx: 0, ty: 0 };
        fitDims = { w: 0, h: 0 };
        naturalDims = { w: 0, h: 0 };
        applyZoom(false);
        renderTitle(null);
        refUi.reset();
        resolve();
      }, 300);
    });
  }

  _pdfListenerAdded = true;

  document.addEventListener('sccd:open-pdf', async (e) => {
    const { pdfUrl, title, color, references, shareUrl, watermark } = e.detail || {};
    if (!pdfUrl) return;
    wantWatermark = !!watermark;
    curPage = 1;
    // 重置內部狀態：naturalDims=0 讓 renderPage 視為「初次 render」自動套 actual size
    zoom = { scale: 1, tx: 0, ty: 0 };
    fitDims = { w: 0, h: 0 };
    naturalDims = { w: 0, h: 0 };
    renderTitle(title, color);
    renderBackPill(color);
    // Share btn：caller 帶 shareUrl（library press/files）才顯示；同 accent 底色
    renderSharePdf(color, shareUrl);
    // ref 接口：references 為 array of { section, itemId, labelEn, labelZh, titleEn, titleZh }
    // 無 references 或空 array → ref btn 自動不渲染
    refUi.setReferences(references);
    openModal();
    if (wantWatermark) buildWatermark();   // 只有 document/files PDF 建浮水印（字體必載好 + 依當前 viewport 給手機較小較密版）
    // 等 modal 顯示 + back btn 量到 rect 才 position ref / share btn（與 title 用同一 rAF cadence 對齊）
    requestAnimationFrame(() => { positionRefBtn(); positionSharePdf(); });

    // 頁碼等 getDocument 拿到總頁數才顯示（先清空，避免「舊值→新值」跳兩次，user 2026-08-08）
    pageInfo.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    // 開場墊圖（LQIP blur-up）：files panel 已渲好的封面（快取秒取、絕不額外下載）
    // 先以模糊態鋪上 canvas，高解析第一頁 render 完退模糊（user 2026-08-08 參考 LQIP 文章）
    const myToken = ++openToken;
    firstPageRendered = false;
    placeholderShowing = false;
    if (mosaicTween) { mosaicTween.kill(); mosaicTween = null; }   // 停上一本殘留的揭示 tween
    const cachedCover = peekPdfCover(pdfUrl);
    if (cachedCover) cachedCover.then(dataUrl => {
      if (!dataUrl || firstPageRendered || myToken !== openToken) return;
      const img = new Image();
      img.onload = async () => {
        // 等 stage 佈局停穩再量：modal 剛 display:flex 那幾個 tick stage 尺寸/定位未定，
        // 直接量會把墊圖擺到奇怪位置（user 2026-08-08「多數時候不在畫面中間」）
        await awaitLayoutReady(stageEl, { minWidth: 50, minHeight: 50, stableFrames: 2, maxAttempts: 30, awaitFonts: false });
        if (firstPageRendered || myToken !== openToken) return;
        positionPdfStageRelativeToLogo();
        // 跟 renderPage 同一套 fit 簿記（naturalDims/fitDims + row transform 歸位）→ 同一條置中管線
        const availH = stageEl.clientHeight || window.innerHeight * 0.8;
        const availW = stageEl.clientWidth || window.innerWidth;
        const f = Math.min(availH / img.naturalHeight, availW / img.naturalWidth);
        naturalDims = { w: img.naturalWidth, h: img.naturalHeight };
        fitDims = { w: img.naturalWidth * f, h: img.naturalHeight * f };
        canvasL.width  = img.naturalWidth;
        canvasL.height = img.naturalHeight;
        canvasL.style.width  = fitDims.w + 'px';
        canvasL.style.height = fitDims.h + 'px';
        // wrapper 尺寸必須跟著寫（同 renderPage）：它殘留「上一本」的 fitDims，canvas 貼其左上角
        // → 墊圖偏左上（user 實機 diag 抓到 content 522×746 vs canvas 468×660；首開重現不了的原因）
        if (renderedContentEl) {
          renderedContentEl.style.width  = fitDims.w + 'px';
          renderedContentEl.style.height = fitDims.h + 'px';
        }
        drawMosaic(img, 22);          // 馬賽克墊圖（取代 gaussian blur(14px)；最近鄰放大縮圖）
        placeholderShowing = true;
        zoom = { scale: 1, tx: 0, ty: 0 };
        // 不走 applyZoom：它會 updateZoomUI，墊圖的 % 是封面像素比出來的假值（renderPage 才是真值）
        rowEl.style.transition = 'none';
        rowEl.style.transform = 'translate(0px, 0px) scale(1)';
      };
      img.src = dataUrl;
    });

    try {
      // SPA navigated 進 library 時若 pdfjsLib 沒被頁面 head 載入，動態 inject
      await ensurePdfjsLoaded();
      setupPdfjsWorker();
      // disableAutoFetch + disableStream：走 HTTP Range 只抓「當前頁需要的 chunk」，不整本下載——
      // 大掃描本「點開卡在封面（墊圖）很久」的主因（getDocument 預設會 auto-fetch 整本）。同 pdf-cover.js 封面渲染。
      // 之後翻頁各自 Range 取該頁；正式站同源 Range 生效（跨域 dev 退回整本，與封面同一已知限制）。
      const doc = await pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: true, disableStream: true }).promise;
      // 慢載大本時 user 可能已改開別本：這次開場過期就整段放棄——別讓晚到的 doc 覆寫共用 pdfDoc、
      // 也別 render 進共用 canvas，否則畫面變成「開到別的書」（user 2026-08-11）。
      if (myToken !== openToken) { doc.destroy?.(); return; }
      pdfDoc = doc;
      pageInfo.textContent = `${curPage} / ${pdfDoc.numPages}`;   // 總頁數已確定，一次到位
      // 桌面/手機同走單頁引擎（手機多 touch 手勢層：swipe 換頁 / pinch 縮放）
      renderPage(curPage).then(() => {
        if (myToken !== openToken) return;
        firstPageRendered = true;
        if (placeholderShowing) {
          // 馬賽克墊圖收尾：高解析頁已在 canvas 上（雙緩衝 swap），de-pixelate 揭示即「對焦入場」
          revealMosaic();
        }
      });
    } catch (err) {
      console.error('PDF load error:', err);
      closeModal();
    }
  });

  prevBtn.addEventListener('click', () => turnPage(-1));
  nextBtn.addEventListener('click', () => turnPage( 1));
  if (backBtn) backBtn.addEventListener('click', closeModal);

  zoomInBtn.addEventListener('click',  () => zoomAtStageCenter(1.5, true));
  zoomOutBtn.addEventListener('click', () => zoomAtStageCenter(1 / 1.5, true));
  if (fitToggleBtn) {
    fitToggleBtn.addEventListener('click', () => {
      // 雙態切換（user 2026-06-02）：Fit Page（整頁）↔ Fit Width（滿寬）。
      // 在 Fit Width → 回 Fit Page；其他（Fit Page / 手動 zoom）→ 切 Fit Width。icon 由 updateZoomUI 換。
      if (isFitWidth()) resetToFit(true);
      else applyFitWidth(true);   // 切 Fit Width：對齊頁面頂端（非 stage 中心放大）
    });
  }

  // Wheel：在 fit 時翻頁；放大到「圖填滿 stage」後 pan within viewport
  // touchpad 一次手勢會丟多 events → 翻頁加 cooldown，pan 不需要（連續 delta 直接累加）
  stageEl.addEventListener('wheel', (e) => {
    if (!pdfDoc) return;
    e.preventDefault();
    const canPan = zoom.scale > fitScale() + 0.001;
    if (!canPan) {
      const now = Date.now();
      if (now < wheelPageLock) return;
      wheelPageLock = now + WHEEL_PAGE_COOLDOWN;
      turnPage(e.deltaY > 0 ? 1 : -1);
    } else {
      zoom.tx -= e.deltaX;
      zoom.ty -= e.deltaY;
      clampPan();
      applyZoom(false);
    }
  }, { passive: false });

  // Drag pan（只在 canPan 時啟動）
  stageEl.addEventListener('mousedown', (e) => {
    const canPan = zoom.scale > fitScale() + 0.001;
    if (!canPan || e.button !== 0) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty };
    rowEl.style.cursor = `url('${sitePath('custom-cursor/drag_2.svg')}') 15 15, grabbing`;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    zoom.tx = dragStart.tx + (e.clientX - dragStart.x);
    zoom.ty = dragStart.ty + (e.clientY - dragStart.y);
    clampPan();
    applyZoom(false);
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    const canPan = zoom.scale > fitScale() + 0.001;
    rowEl.style.cursor = canPan
      ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
      : `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!pdfDoc || modal.style.display === 'none') return;
    if (e.key === 'Escape') { closeModal(); return; }
    // 上下左右：圖未填滿 stage 時翻頁；可 pan 時 pan（scroll direction：按右=往右看，圖往左移）
    const isArrow = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const canPan = zoom.scale > fitScale() + 0.001;
    if (isArrow) {
      e.preventDefault();
      if (canPan) {
        const STEP = 80;
        if (e.key === 'ArrowRight') zoom.tx -= STEP;
        if (e.key === 'ArrowLeft')  zoom.tx += STEP;
        if (e.key === 'ArrowDown')  zoom.ty -= STEP;
        if (e.key === 'ArrowUp')    zoom.ty += STEP;
        clampPan();
        applyZoom(true);
      } else {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') turnPage( 1);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   turnPage(-1);
      }
    }
    if (e.key === '+' || e.key === '=') zoomAtStageCenter(1.5, true);
    if (e.key === '-' || e.key === '_') zoomAtStageCenter(1 / 1.5, true);
    if (e.key === '0') resetToFit(true);
  });

  // 手機橫豎切換 / 視窗寬度變化：重新 render 當前頁以重算 fit 尺寸（單頁引擎，renderPage 內會重算 fitDims）。
  // 只認「寬度」變化：手機捲動時 URL bar 顯隱會改高度但不該重渲。
  let _lastViewportW = window.innerWidth;
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    if (w === _lastViewportW) return;
    _lastViewportW = w;
    if (!pdfDoc || modal.style.display === 'none') return;
    if (wantWatermark) buildWatermark();   // 寬度跨過手機斷點時重建浮水印（手機↔桌面尺寸不同）
    renderPage(curPage);
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export function initLibraryViewer() {
  ensureLightboxListener();
  initPdfViewer();
}
