// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Library Viewer
 * 初始化 lightbox listener 和 PDF viewer modal（供 SPA 路由呼叫）
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { createRefBtn } from '../lightbox/lightbox-ref-btn.js';

// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lightboxListenerAdded = false;

function ensureLightboxListener() {
  if (_lightboxListenerAdded) return;
  _lightboxListenerAdded = true;
  document.addEventListener('sccd:open-lightbox', e => {
    const { media, index, title, color, references } = e.detail;
    // title / color / references 由 caller (library-panels) 帶入；沒帶就 fallback 不顯示對應 UI
    openLightbox(media, index, { title, color, references });
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
  // 結構對齊 activities-lightbox：X 右上 + prev/next 主區域左右 absolute + 底部資訊條
  // scrollbar gutter 由 lightbox-shell 染 html bg 處理
  // 新增：左下角 title pill（鏡像 album）/ 底部右側 zoom controls / 中央 .pdf-zoom-stage 包 canvases
  modal.className = 'fixed inset-0 z-[9999] bg-black/90 flex flex-col opacity-0 transition-opacity duration-300';
  modal.style.display = 'none';
  modal.innerHTML = `
    <!-- 左下角：返回按鈕 + title pill 分別 absolute（不用 flex wrapper）
         - back btn 對齊 logo 左邊（left: var(--container-padding)）
         - title 對齊 PDF spread 左邊（fit 時實際 canvas 左緣，JS positionTitle 動態設）
         - 兩者都 transform-origin:left bottom 避免旋轉外溢 -->
    <button class="pdf-back-btn absolute" style="bottom: 2rem; left: var(--container-padding, 1.5rem); z-index: 50;">
      <span class="pdf-back-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;font-size:var(--font-size-p1);line-height:1;transform:rotate(0deg);transform-origin:left bottom;box-sizing:border-box;">
        <span class="icon icon-arrow-left icon-m"></span>
      </span>
    </button>
    <!-- pdf-ref-btn-slot：ref btn 由 createRefBtn 動態插入，位置 absolute，left/bottom 由 positionRefBtn 算 -->
    <div class="pdf-title absolute" style="bottom: 2rem; left: 4rem; z-index: 50; display: none;"></div>

    <!-- px-16 md:px-32：desktop padding 加大讓 stage（=zoom mask）邊緣停在 chevron 內側，
         避免 zoom 後 PDF/canvas 視覺貼到 chevron 上。chevron right edge ≈ container-padding + 44 = 68px，
         px-32 = 128px → mask 邊 60px gap（對齊 user 提供的 album 352% 參考間距）。mobile 維持 px-16 -->
    <div class="flex items-center justify-center w-full px-16 md:px-32 py-xl flex-1 min-h-0 relative">
      <!-- chevron 對齊 logo 左/右邊（var(--container-padding)）= 跟 back btn 同 column；PDF spread 寬度需縮才不貼到 chevron -->
      <button id="pdf-prev-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20" style="left: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m"></span>
      </button>
      <!-- zoom stage：overflow:hidden 容器，transform 套在 .pdf-canvas-row 上做 zoom + pan -->
      <div class="pdf-zoom-stage" style="position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <div class="pdf-canvas-row flex items-center justify-center gap-0 w-full h-full" style="transform-origin:center;will-change:transform;">
          <canvas id="pdf-canvas-left"  class="bg-white shadow-2xl block"            style="user-select:none;"></canvas>
          <canvas id="pdf-canvas-right" class="bg-white shadow-2xl hidden md:block" style="user-select:none;"></canvas>
        </div>
      </div>
      <button id="pdf-next-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20" style="right: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m rotate-180"></span>
      </button>
    </div>

    <div class="relative flex items-center justify-center px-xl py-md flex-shrink-0 text-white">
      <span id="pdf-page-info" class="text-p2"></span>
      <!-- zoom controls：底部右側 absolute（鏡像 album）-->
      <div class="pdf-zoom-controls absolute text-white" style="right: var(--container-padding, 1.5rem); top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 12px;">
        <button id="pdf-zoom-out" class="p-2 transition-opacity hover:opacity-60 disabled:opacity-30" aria-label="Zoom out">
          <span class="icon icon-zoom-out icon-m"></span>
        </button>
        <span id="pdf-zoom-pct" class="text-p2" style="font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center;">100%</span>
        <button id="pdf-zoom-in" class="p-2 transition-opacity hover:opacity-60 disabled:opacity-30" aria-label="Zoom in">
          <span class="icon icon-zoom-in icon-m"></span>
        </button>
        <!-- Fit / 放大 toggle（鏡像 album）：fit 時點 → 放大 2x；zoomed 時點 → 回 fit -->
        <button id="pdf-fit-toggle" class="p-2 transition-opacity hover:opacity-60" aria-label="Fit / zoom toggle">
          <i class="fa-solid fa-expand text-p1"></i>
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
  const canvasR   = document.getElementById('pdf-canvas-right');
  const prevBtn   = document.getElementById('pdf-prev-btn');
  const nextBtn   = document.getElementById('pdf-next-btn');
  const pageInfo  = document.getElementById('pdf-page-info');
  const backBtn   = modal.querySelector('.pdf-back-btn');
  const backPill  = modal.querySelector('.pdf-back-pill');
  const stageEl   = modal.querySelector('.pdf-zoom-stage');
  const rowEl     = modal.querySelector('.pdf-canvas-row');
  const titleEl   = modal.querySelector('.pdf-title');
  const zoomInBtn  = document.getElementById('pdf-zoom-in');
  const zoomOutBtn = document.getElementById('pdf-zoom-out');
  const zoomPctEl  = document.getElementById('pdf-zoom-pct');
  const fitToggleBtn = document.getElementById('pdf-fit-toggle');
  if (!modal || !canvasL || !canvasR || !stageEl || !rowEl) return;

  // ── Ref btn（plug-in helper）─────────────────────────────────────
  // 提供「跳轉到 activities 對應 item」的 chip popover；close lightbox 後 SPA 換頁
  const refUi = createRefBtn('#00FF80', () => closeModal());
  refUi.btnEl.classList.add('pdf-ref-btn');
  refUi.btnEl.style.position = 'absolute';
  refUi.btnEl.style.bottom = '2rem';
  refUi.btnEl.style.zIndex = '50';
  // left 由 positionRefBtn 動態算（anchor 到 back btn 右緣 + gap）；先給 fallback 避免閃位
  refUi.btnEl.style.left = '4rem';
  modal.appendChild(refUi.btnEl);
  modal.appendChild(refUi.popoverEl);

  let pdfDoc   = null;
  let curPage  = 1;
  let rendering = false;

  // ── Zoom 狀態（fit=1，drag pan，wheel 行為依 scale 切換）────────────
  // scale=1 時 wheel 翻頁；scale>1 時 wheel 在 viewport 內 pan。zoom 只能用 +/- 按鈕（與 album 行為不同）。
  const MIN_SCALE = 1;
  const MAX_SCALE = 6;
  // 內部 canvas 多渲一倍像素 fit 用，放大時靠 CSS scale；MAX_SCALE 6 下高倍會略糊但細節仍可讀
  const RENDER_QUALITY = 2;
  let zoom = { scale: 1, tx: 0, ty: 0 };
  let isDragging = false;
  let dragStart  = { x: 0, y: 0, tx: 0, ty: 0 };
  // wheel 翻頁 debounce：touchpad 一次手勢會 burst 多 events
  let wheelPageLock = 0;
  const WHEEL_PAGE_COOLDOWN = 350;

  function isDesktop() { return window.innerWidth >= 768; }

  function applyZoom(animated = false) {
    rowEl.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
    rowEl.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
    rowEl.style.cursor = isDragging
      ? "url('/custom-cursor/drag_2.svg') 10 10, grabbing"
      : (zoom.scale > 1
          ? "url('/custom-cursor/drag_1.svg') 10 10, grab"
          : "url('/custom-cursor/default.svg') 6 1, default");
    updateZoomUI();
  }

  function updateZoomUI() {
    if (zoomPctEl)  zoomPctEl.textContent = `${Math.round(zoom.scale * 100)}%`;
    if (zoomInBtn)  zoomInBtn.disabled  = zoom.scale >= MAX_SCALE - 0.001;
    if (zoomOutBtn) zoomOutBtn.disabled = zoom.scale <= MIN_SCALE + 0.001;
    // fit-toggle 圖示：fit 時 expand（暗示「點擊放大」）；zoomed 時 compress（暗示「點擊縮回 fit」）
    if (fitToggleBtn) {
      const icon = fitToggleBtn.querySelector('i');
      if (icon) icon.className = zoom.scale > 1.001 ? 'fa-solid fa-compress text-p1' : 'fa-solid fa-expand text-p1';
    }
  }

  function clampPan() {
    if (zoom.scale <= 1) { zoom.tx = 0; zoom.ty = 0; return; }
    const sr = stageEl.getBoundingClientRect();
    // 用實際 canvas bbox 算 clamp，不是 row 的 w-full h-full
    // row 是 w-full h-full 但 canvases 因 PDF aspect ≠ stage aspect 有 slack（A4 spread 在寬 stage 裡水平留白）
    // 用 row 算會讓 pan 範圍超過實際 canvas 邊，pan 到極限露 mask 邊外空白（仿 Acrobat：page 邊永遠貼 mask 邊不留白）
    const showTwo = canvasR.style.display !== 'none';
    const contentW = canvasL.offsetWidth + (showTwo ? canvasR.offsetWidth : 0);
    const contentH = Math.max(canvasL.offsetHeight, showTwo ? canvasR.offsetHeight : 0);
    if (!contentW || !contentH) { zoom.tx = 0; zoom.ty = 0; return; }
    const scaledW = contentW * zoom.scale;
    const scaledH = contentH * zoom.scale;
    const maxTx = Math.max(0, (scaledW - sr.width)  / 2);
    const maxTy = Math.max(0, (scaledH - sr.height) / 2);
    zoom.tx = Math.max(-maxTx, Math.min(maxTx, zoom.tx));
    zoom.ty = Math.max(-maxTy, Math.min(maxTy, zoom.ty));
  }

  // 在 (clientX, clientY) 為焦點縮放（zoom-button 用 stage 中心）。對齊 album 數學
  function zoomAt(clientX, clientY, factor, animated = false) {
    const sr = stageEl.getBoundingClientRect();
    const cx = clientX - sr.left;
    const cy = clientY - sr.top;
    const sw = sr.width, sh = sr.height;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, zoom.scale * factor));
    if (newScale === zoom.scale) return;
    const imgX = (cx - sw / 2 - zoom.tx) / zoom.scale;
    const imgY = (cy - sh / 2 - zoom.ty) / zoom.scale;
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

  function resetZoom(animated = false) {
    zoom = { scale: 1, tx: 0, ty: 0 };
    applyZoom(animated);
  }

  async function renderSpread(leftPage) {
    if (!pdfDoc || rendering) return;
    rendering = true;

    const totalPages = pdfDoc.numPages;
    const showTwo = isDesktop() && leftPage + 1 <= totalPages;

    async function renderPage(pageNum, canvas) {
      const page = await pdfDoc.getPage(pageNum);
      // 容器以 stage 為準（zoom 套在 .pdf-canvas-row 上，內部 canvas 不參與 transform 尺寸計算）
      // 雙頁 0.48 each 留 4% 給左右 prev/next 視覺間距；單頁 0.92
      const availH = stageEl.clientHeight || window.innerHeight * 0.8;
      // chevron 改 left:var(--container-padding) 後跟 spread 視覺距離 = stage.left + (stage*(1-2*factor))/2 - chevron.right
      // factor 0.46（雙頁）= 兩 canvas 各側 ~4% 留給 chevron+breathing；單頁 0.92 同理（user 要求縮小 chevron gap）
      const availW = (stageEl.clientWidth || window.innerWidth) * (showTwo ? 0.46 : 0.92);
      const base = page.getViewport({ scale: 1 });
      const fitScale = Math.min(availH / base.height, availW / base.width);
      // 內部 buffer 多渲 RENDER_QUALITY 倍給 zoom 用；CSS style.width/height 鎖在 fitScale display 尺寸
      // — 不依賴 max-width:100% + flex shrink（兩 canvas intrinsic 加總 >100% 時 shrink 不會剛好對齊 fitScale 害 100% 看起來放大）
      const vp = page.getViewport({ scale: fitScale * RENDER_QUALITY });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      canvas.style.width  = (vp.width  / RENDER_QUALITY) + 'px';
      canvas.style.height = (vp.height / RENDER_QUALITY) + 'px';
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

  // 上一/下一頁（spread 模式步進 2，邊界自動 clamp）；翻頁時重置 zoom
  function turnPage(dir) {
    if (!pdfDoc) return;
    if (dir > 0 && nextBtn.disabled) return;
    if (dir < 0 && prevBtn.disabled) return;
    const step = isDesktop() ? 2 : 1;
    if (dir > 0) {
      curPage = Math.min(pdfDoc.numPages, curPage + step);
    } else {
      const back = (isDesktop() && curPage > 2) ? 2 : 1;
      curPage = Math.max(1, curPage - back);
    }
    resetZoom(false);
    renderSpread(curPage);
  }

  // 旋轉角度範圍 ±1~±3°（user 偏好 PDF/album lightbox 標題 pill 比 section-btn 角度小）
  function smallRot() { return (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2); }

  function renderTitle(title, color) {
    if (!titleEl) return;
    if (!title || (!title.en && !title.zh)) {
      titleEl.style.display = 'none';
      titleEl.innerHTML = '';
      if (backPill) backPill.style.height = '';
      return;
    }
    const bg = color || '#00FF80';
    // 結構：pill > window(overflow:hidden) > track > unit(EN+ZH column-stacked)
    // EN+ZH 為單一 marquee unit 同步捲動（不是兩行各自 marquee 失同步）；max-width 防 Press 長標題撐爆 layout
    titleEl.innerHTML = `
      <span class="pdf-title-pill" style="display:inline-block;background:${bg};color:#000;padding:6px 8px 5px;font-weight:700;font-size:var(--font-size-p1);line-height:1.2;transform:rotate(${smallRot()}deg);transform-origin:left bottom;max-width:min(40vw, 360px);box-sizing:border-box;">
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
    const bg = color || '#00FF80';
    backPill.style.background = bg;
    backPill.style.transform  = `rotate(${smallRot()}deg)`;
    // ref btn 共用同 accent；旋轉角度 0（避免兩 pill 同時亂轉視覺雜訊）
    refUi.setColor(bg);
  }

  // title pill 高度由 EN+ZH 兩行自然撐，back/ref pill follow title 高度（user 2026-06-01 拍板）
  // 之前曾嘗試 back/ref 鎖 44×44 但同 viewer 內 back 比 title 矮太多視覺不協調 → 改回 sync
  // title 隱藏時三 pill 全 reset 回 CSS inline 預設 44px
  function syncBackBtnHeight() {
    if (!backPill) return;
    const refPill = /** @type {HTMLElement | null} */ (refUi.btnEl.querySelector('.lightbox-ref-btn-pill'));
    const pill = titleEl && titleEl.querySelector('.pdf-title-pill');
    if (!pill || titleEl.style.display === 'none') {
      backPill.style.height = '';
      if (refPill) refPill.style.height = '';
      return;
    }
    // offsetHeight 含 padding，跟 visual bbox 一致（rotation 不影響 offsetHeight）
    const h = /** @type {HTMLElement} */ (pill).offsetHeight;
    if (h > 0) {
      backPill.style.height = h + 'px';
      if (refPill) refPill.style.height = h + 'px';
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

  function openModal() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
    // header bars hide + logo 切 inverse + footer-hide state 清零，全交給 enterLightboxMode
    enterLightboxMode();
  }

  // closeModal 回 Promise：ref btn 跳轉時要等 fadeout 完才 SPA 換頁，避免 0.3s 黑→新頁的視覺斷層
  function closeModal() {
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
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        canvasL.getContext('2d').clearRect(0, 0, canvasL.width, canvasL.height);
        canvasR.getContext('2d').clearRect(0, 0, canvasR.width, canvasR.height);
        resetZoom(false);
        renderTitle(null);
        refUi.reset();
        resolve();
      }, 300);
    });
  }

  _pdfListenerAdded = true;

  document.addEventListener('sccd:open-pdf', async (e) => {
    const { pdfUrl, title, color, references } = e.detail || {};
    if (!pdfUrl) return;
    curPage = 1;
    resetZoom(false);
    renderTitle(title, color);
    renderBackPill(color);
    // ref 接口：references 為 array of { section, itemId, labelEn, labelZh, titleEn, titleZh }
    // 無 references 或空 array → ref btn 自動不渲染
    refUi.setReferences(references);
    openModal();
    // 等 modal 顯示 + back btn 量到 rect 才 position ref btn（與 title 用同一 rAF cadence 對齊）
    requestAnimationFrame(() => positionRefBtn());
    try {
      // SPA navigated 進 library 時若 pdfjsLib 沒被頁面 head 載入，動態 inject
      await ensurePdfjsLoaded();
      setupPdfjsWorker();
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      renderSpread(curPage);
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
      // zoomed → reset 回 fit；fit → 跳到 2x（中度放大，舒適閱讀；不直接 MAX 避免太爆）
      if (zoom.scale > 1.001) resetZoom(true);
      else zoomAtStageCenter(2, true);
    });
  }

  // Wheel：fit (scale=1) 翻頁；放大時 pan within viewport
  // touchpad 一次手勢會丟多 events → 翻頁加 cooldown，pan 不需要（連續 delta 直接累加）
  stageEl.addEventListener('wheel', (e) => {
    if (!pdfDoc) return;
    e.preventDefault();
    if (zoom.scale <= 1.001) {
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

  // Drag pan（只在 scale>1 時啟動）
  stageEl.addEventListener('mousedown', (e) => {
    if (zoom.scale <= 1 || e.button !== 0) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty };
    rowEl.style.cursor = "url('/custom-cursor/drag_2.svg') 15 15, grabbing";
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
    rowEl.style.cursor = zoom.scale > 1
      ? "url('/custom-cursor/drag_1.svg') 10 10, grab"
      : "url('/custom-cursor/default.svg') 6 1, default";
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!pdfDoc || modal.style.display === 'none') return;
    if (e.key === 'Escape') { closeModal(); return; }
    // 上下左右：fit (scale=1) 時翻頁；放大時 pan（scroll direction：按右=往右看，圖往左移）
    const isArrow = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp';
    if (isArrow) {
      e.preventDefault();
      if (zoom.scale > 1.001) {
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
    if (e.key === '0') resetZoom(true);
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export function initLibraryViewer() {
  ensureLightboxListener();
  initPdfViewer();
}
