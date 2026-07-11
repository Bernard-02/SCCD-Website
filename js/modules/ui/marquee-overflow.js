/**
 * Marquee Overflow Utility
 *
 * 跑動的文字標題：若 inner 文字寬度 > row 容器寬度，把單份 inner 內容替換成兩份
 * `.marquee-copy`（seamless loop），設 CSS var `--marquee-distance` / `--marquee-duration`，
 * CSS hover 動畫從 translateX(0) → translateX(-copyWidth) 接到第二份無接縫。
 *
 * 之前 atlas / courses-map / library-panels 三檔幾乎一字不差地寫了三遍；
 * atlas 版多了「重 render 時 inner 已是 dual-copy 先還原成單份」reset 邏輯，
 * 是其他兩處的 strict 超集，這裡採用 atlas 版的安全行為。
 *
 * 效能（2026-07-10，user 報矮橫向 library 切分頁卡 18 秒）：
 * 1. 讀寫分段批次：舊版逐行「寫 → 讀 offsetWidth → 寫 innerHTML → 讀 rect」交錯，
 *    每行 ≥2 次 forced reflow；矮橫向 awards 1000+ 行 × 巨大 DOM ＝ 主執行緒鎖 18 秒。
 *    改成 5 段（全寫 reset → 全讀量測 → 全寫 dual-copy → 全讀 copy 寬 → 全寫 vars），
 *    整包固定 ~2 次 reflow，與行數無關。
 * 2. 離屏暫停：溢出行的 infinite 動畫改由 IntersectionObserver 控 animation-play-state，
 *    只有進 viewport 的行才跑（矮橫向 awards 曾同時 568 個動畫常駐 → 持續捲動 jank）。
 *    inline play-state 蓋 CSS shorthand 的 running；桌面 hover-gated marquee 不受影響
 *    （可見時 play-state=running，動畫仍由 :hover 規則決定掛不掛）。
 *
 * 用法：
 *   applyMarqueeOverflow(scope, '.row-selector', '.inner-selector');
 *
 * 動畫常數：speed=80px/s, minDuration=3s（與三檔原值一致）
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { registerPageCleanup } from './page-cleanup.js';

// 離屏暫停 observer：全 util 共用一顆，SPA 換頁 drain 時 disconnect（row 隨 #page-content 銷毀，
// 不 disconnect 會 strong-ref 整批舊 DOM）。row 進出 viewport → 切 inner 的 animation-play-state。
let _viewIO = null;
function viewIO() {
  if (_viewIO) return _viewIO;
  _viewIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      const inner = /** @type {any} */ (e.target)._marqueeInner;
      if (inner) inner.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
    });
  });
  registerPageCleanup(() => { if (_viewIO) { _viewIO.disconnect(); _viewIO = null; } });
  return _viewIO;
}

/**
 * @param {Element} scope - 容器（querySelectorAll 的根）
 * @param {string} rowSelector - 要 marquee 的「行」selector
 * @param {string} innerSelector - row 內部包文字的 inner span selector
 * @param {{speed?: number, minDuration?: number}} [opts]
 */
export function applyMarqueeOverflow(scope, rowSelector, innerSelector, opts = {}) {
  const speed = opts.speed ?? 80;
  const minDuration = opts.minDuration ?? 3;

  const pairs = [];
  scope.querySelectorAll(rowSelector).forEach((rowEl) => {
    const inner = /** @type {HTMLElement | null} */ (rowEl.querySelector(innerSelector));
    if (inner) pairs.push({ row: /** @type {HTMLElement} */ (rowEl), inner });
  });
  if (!pairs.length) return;

  // ① 全寫：reset — SPA 重 render / 轉向重跑時 inner 可能已是 dual-copy，先還原單份再重新偵測
  pairs.forEach(({ row, inner }) => {
    row.classList.remove('is-overflow');
    const first = inner.firstElementChild;
    if (inner.children.length === 2 && first && first.classList.contains('marquee-copy')) {
      inner.innerHTML = first.innerHTML;
    }
  });

  // 減少動態：不啟動跑馬燈循環，靜態顯示（reset 已還原單份，不再加 is-overflow / 不建第二份）
  if (prefersReducedMotion()) return;

  // ② 全讀：量測（本 pass 第一行觸發一次 reflow，之後同 pass 內讀取吃同一份 layout）
  const overflowing = [];
  pairs.forEach(({ row, inner }) => {
    // row.offsetWidth === 0：容器尚未 sized（SPA / deep-link 進場時卡片還沒排版完）→ scrollWidth - 0 必 > 0，
    // 會把沒真溢出的標題誤判溢出。0 寬無法可靠偵測，跳過；caller 的 _XMarqueeInit（panel show 後 rAF 重觸）會補量。
    const rowW = row.offsetWidth;
    if (!rowW) return;
    if (inner.scrollWidth - rowW > 0) overflowing.push({ row, inner, copyWidth: 0 });
  });
  if (!overflowing.length) return;

  // ③ 全寫：建 dual-copy + 掛離屏暫停 observer（先 paused，IO 首次 callback 把可見的翻 running）
  overflowing.forEach(({ row, inner }) => {
    row.classList.add('is-overflow');
    const html = inner.innerHTML;
    inner.innerHTML = `<span class="marquee-copy">${html}</span><span class="marquee-copy">${html}</span>`;
    inner.style.animationPlayState = 'paused';
    /** @type {any} */ (row)._marqueeInner = inner;
    viewIO().observe(row);
  });

  // ④ 全讀：量 copy 寬（第二次 reflow）。getBoundingClientRect 對 inline-block 準確；offsetWidth 某些情境回 0
  overflowing.forEach(o => {
    const copy = /** @type {HTMLElement | null} */ (o.inner.querySelector('.marquee-copy'));
    o.copyWidth = copy ? copy.getBoundingClientRect().width : 0;
  });

  // ⑤ 全寫：set CSS vars
  overflowing.forEach(({ row, copyWidth }) => {
    row.style.setProperty('--marquee-distance', `-${copyWidth}px`);
    row.style.setProperty('--marquee-duration', `${Math.max(minDuration, copyWidth / speed)}s`);
  });
}
