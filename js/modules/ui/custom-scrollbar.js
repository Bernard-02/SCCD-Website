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
  const docH = document.documentElement.scrollHeight;
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
  const ratio = Math.max(0, Math.min(1, window.scrollY / cachedMaxScrollY));
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
    if (rect.top < thumbBottom && rect.bottom > thumbTop) over = true;
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
  dragStartScrollY = window.scrollY;
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
  const targetY = dragStartScrollY + deltaY * scrollRatio;
  window.scrollTo(0, targetY);      // instant，不要 smooth 避免延遲感
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
  // mobile 完全不啟動（CSS 已隱藏 thumb，JS 也省 ResizeObserver / scroll listener 開銷）
  if (window.innerWidth < 768) return;

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

  // 開放給其他模組手動 trigger 重算（e.g. lightbox 開關後）
  window.__recomputeScrollbar = recompute;
}
