/**
 * Custom Scrollbar Module
 * 取代原生 scrollbar：固定在右側的浮動 thumb，跟隨 window.scrollY 同步、可拖拉。
 *
 * 設計重點：
 * - 不碰 html / body 任何 inline style；只 mutate #custom-scrollbar-thumb 自己
 * - 用 CSS var (--theme-fg) 取色，mode 切換 / mode-color cycling 自動跟隨
 * - ResizeObserver 監聽 documentElement，SPA 換頁 / image lazy load / accordion 展開都會自動重算
 * - 拖拉用 pointer events + setPointerCapture，拖出 thumb 範圍仍持續收事件（跟原生行為一致）
 * - docH <= winH 時自動 hide；mobile / has-slide-in 由 CSS 蓋掉（custom-scrollbar.css）
 * - 真桌面 inner-scroll frame（faculty／curriculum／activities／admission）：內容在右欄內捲、右欄藏原生捲軸 →
 *   長度＝hero（window）＋右欄全部內容接成一條（user 2026-11-04「以 hero 加上下面所有 nav 來算」）：
 *   位置＝window 在 frame 頂之前看 window、到 frame 頂起加右欄 scrollTop；拖拉反向對應（frame 前捲 window、frame 內捲右欄）
 */

const MIN_THUMB_HEIGHT = 40;
const THUMB_ID = 'custom-scrollbar-thumb';

let thumbEl = /** @type {HTMLElement | null} */ (null);
let footerEl = /** @type {HTMLElement | null} */ (null);
let isOverFooter = false;
let dragging = false;
let dragStartClientY = 0;
let dragStartScrollY = 0;
let rafPending = false;
let cachedDocH = 0;
let cachedWinH = 0;
let cachedThumbH = 0;
let cachedMaxThumbTop = 0;
let cachedMaxScrollY = 0;
let resizeObserver = /** @type {ResizeObserver | null} */ (null);
let frameCol = /** @type {HTMLElement | null} */ (null);   // 真桌面 frame 的右欄（有在捲才算）
let frameTop = 0;          // frame section 頂的 window scrollY
let cachedColMax = 0;
let colRO = /** @type {ResizeObserver | null} */ (null);

// 換頁後重找右欄：欄的內容高變了（分頁切換、lazy render、資料晚到）doc 高不一定變 → 另外盯欄的子元素
function syncFrameCol() {
  const col = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .inner-scroll-frame-grid .inner-scroll-scroll-col.no-scrollbar'));
  const scrolls = col && getComputedStyle(col).overflowY !== 'visible' ? col : null;   // 手機／gate 拆 frame＝window 捲
  if (scrolls !== frameCol) {
    colRO?.disconnect();
    colRO = null;
    frameCol = scrolls;
    if (frameCol) {
      frameCol.addEventListener('scroll', onScroll, { passive: true });   // 欄隨換頁 DOM 丟、listener 跟著走
      if (typeof ResizeObserver !== 'undefined') {
        colRO = new ResizeObserver(() => recompute());
        [...frameCol.children].forEach(c => colRO?.observe(c));
      }
    }
  }
  const sec = frameCol?.closest('section');
  frameTop = sec ? sec.getBoundingClientRect().top + window.scrollY : 0;
}
// 一條捲軸上的位置：frame 頂之前＝window；之後＋右欄 scrollTop
function virtualY() {
  const y = window.scrollY;
  return frameCol && y >= frameTop - 1 ? y + frameCol.scrollTop : y;
}
/** @param {number} v */
function scrollToVirtual(v) {
  if (!frameCol || v < frameTop) {
    window.scrollTo(0, v);
    if (frameCol) frameCol.scrollTop = 0;
  } else if (v <= frameTop + cachedColMax) {
    window.scrollTo(0, frameTop);
    frameCol.scrollTop = v - frameTop;
  } else {
    frameCol.scrollTop = cachedColMax;
    window.scrollTo(0, v - cachedColMax);
  }
}

function ensureThumb() {
  if (thumbEl) return thumbEl;
  thumbEl = document.getElementById(THUMB_ID);
  if (!thumbEl) {
    thumbEl = document.createElement('div');
    thumbEl.id = THUMB_ID;
    document.body.appendChild(thumbEl);
  }
  return thumbEl;
}

/** 重新量測 viewport / document 高度，計算 thumb 高度與最大 top */
function recompute() {
  if (!thumbEl) return;
  // footer 可能 SPA / async fetch 後才出現，每次 recompute 重抓
  footerEl = document.querySelector('footer.footer-shell');
  syncFrameCol();
  cachedColMax = frameCol ? Math.max(0, frameCol.scrollHeight - frameCol.clientHeight) : 0;
  const docH = document.documentElement.scrollHeight + cachedColMax;   // 右欄內容接在 frame 後算同一條
  const winH = window.innerHeight;

  if (docH <= winH + 1) {
    // 沒得 scroll → 隱藏
    cachedDocH = docH;
    cachedWinH = winH;
    cachedMaxScrollY = 0;
    thumbEl.style.display = 'none';
    return;
  }

  const thumbH = Math.max(MIN_THUMB_HEIGHT, (winH * winH) / docH);
  const maxThumbTop = winH - thumbH;
  const maxScrollY = docH - winH;

  cachedDocH = docH;
  cachedWinH = winH;
  cachedThumbH = thumbH;
  cachedMaxThumbTop = maxThumbTop;
  cachedMaxScrollY = maxScrollY;

  thumbEl.style.height = thumbH + 'px';
  thumbEl.style.display = 'block';
  updateThumbPosition();
}

/** 根據 window.scrollY 把 thumb 移到對應位置（用 transform 不動 top） */
function updateThumbPosition() {
  if (!thumbEl || cachedMaxScrollY <= 0) return;
  const ratio = Math.max(0, Math.min(1, virtualY() / cachedMaxScrollY));
  const top = ratio * cachedMaxThumbTop;
  thumbEl.style.transform = `translateY(${top}px)`;
  updateOverFooterState(top);
}

/** 檢查 thumb 視覺範圍是否跟 footer 重疊；重疊時加 .is-over-footer 讓 CSS 換成 footer-fg
 *  Why: footer 在 standard/inverse 是反色（黑底白字/白底黑字），mode-color 是互補 hue
 *       thumb 用 var(--theme-fg) 進 footer 後對比消失，要切到 var(--footer-fg) 才能看見 */
function updateOverFooterState(thumbTop) {
  if (!thumbEl) return;
  let over = false;
  if (footerEl) {
    const rect = footerEl.getBoundingClientRect();
    const thumbBottom = thumbTop + cachedThumbH;
    // footer 已進入 viewport 且 thumb 視覺下緣已壓到 footer 頂端 → 視為 over
    // 真桌面 footer 是四周內縮的卡（footer.css）→ 右緣沒碰到視窗右邊＝thumb 在卡外的頁面底色上，不換色
    if (rect.top < thumbBottom && rect.bottom > thumbTop && rect.right >= window.innerWidth - 2) over = true;
  }
  if (over !== isOverFooter) {
    isOverFooter = over;
    thumbEl.classList.toggle('is-over-footer', over);
  }
}

/** scroll handler — 用 rAF debounce */
function onScroll() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    updateThumbPosition();
  });
}

/** 拖拉開始 */
function onPointerDown(e) {
  if (e.button !== 0) return;       // 只接受左鍵
  if (cachedMaxScrollY <= 0) return;
  dragging = true;
  dragStartClientY = e.clientY;
  dragStartScrollY = virtualY();
  thumbEl?.setPointerCapture(e.pointerId);
  thumbEl?.classList.add('is-dragging');
  e.preventDefault();
}

/** 拖拉中：thumb 1px 對應頁面 (maxScrollY / maxThumbTop) px */
function onPointerMove(e) {
  if (!dragging) return;
  const deltaY = e.clientY - dragStartClientY;
  const scrollRatio = cachedMaxThumbTop > 0
    ? cachedMaxScrollY / cachedMaxThumbTop
    : 0;
  scrollToVirtual(dragStartScrollY + deltaY * scrollRatio);   // instant，不要 smooth 避免延遲感
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  thumbEl?.releasePointerCapture(e.pointerId);
  thumbEl?.classList.remove('is-dragging');
}

/** 點 track（thumb 以外的右側 10px 條）跳轉 —— 簡化版：監聽 mousedown 在 thumb 上不做、在 track 區跳轉 */
// (省略：保持單純 thumb 拖拉即可，需要 track-click 再加)

export function initCustomScrollbar() {
  // mobile 完全不啟動（CSS 已隱藏 thumb，JS 也省 ResizeObserver / scroll listener 開銷）；
  // 矮橫向同理（user 2026-07-04「橫向手機不需要 scrollbar」，gate 同 landscape.css）
  if (SCCDHelpers.isMobileLayout()) return;

  ensureThumb();
  if (!thumbEl) return;

  // 初次量測（等 fonts + layout 穩定後再算一次避免 0 高度）
  recompute();
  if (document.fonts?.ready) {
    document.fonts.ready.then(recompute);
  }
  // 多算一次抓 lazy load 圖片 / SPA injected 內容
  requestAnimationFrame(() => requestAnimationFrame(recompute));

  // ── Listeners ──────────────────────────────
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', recompute);

  // 文件高度變化（SPA 換頁、accordion 展開、圖片 lazy load）
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => recompute());
    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);
  }

  // Drag
  thumbEl.addEventListener('pointerdown', onPointerDown);
  thumbEl.addEventListener('pointermove', onPointerMove);
  thumbEl.addEventListener('pointerup', onPointerUp);
  thumbEl.addEventListener('pointercancel', onPointerUp);
  // ResizeObserver + scroll listener 已自動 cover SPA 換頁 / lazy load / accordion 等情境
}
