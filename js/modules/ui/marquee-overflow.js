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
 * 用法：
 *   applyMarqueeOverflow(scope, '.row-selector', '.inner-selector');
 *
 * 動畫常數：speed=80px/s, minDuration=3s（與三檔原值一致）
 */

/**
 * @param {Element} scope - 容器（querySelectorAll 的根）
 * @param {string} rowSelector - 要 marquee 的「行」selector
 * @param {string} innerSelector - row 內部包文字的 inner span selector
 * @param {{speed?: number, minDuration?: number}} [opts]
 */
import { prefersReducedMotion } from './reduce-motion.js';

export function applyMarqueeOverflow(scope, rowSelector, innerSelector, opts = {}) {
  const speed = opts.speed ?? 80;
  const minDuration = opts.minDuration ?? 3;

  scope.querySelectorAll(rowSelector).forEach((rowEl) => {
    const row = /** @type {HTMLElement} */ (rowEl);
    const inner = /** @type {HTMLElement | null} */ (row.querySelector(innerSelector));
    if (!inner) return;

    // Reset：SPA 重 render 同 panel 時 inner 可能已被替換成 dual-copy；先還原成單份再重新偵測
    row.classList.remove('is-overflow');
    const first = inner.firstElementChild;
    if (inner.children.length === 2 && first && first.classList.contains('marquee-copy')) {
      inner.innerHTML = first.innerHTML;
    }

    // row.offsetWidth === 0：容器尚未 sized（SPA / deep-link 進場時卡片還沒排版完）→ scrollWidth - 0 必 > 0，
    // 會把每個沒真的溢出的標題誤判溢出 → 全部跑 marquee（library awards 多得獎人名字錯位 / 被切掉）。
    // 0 寬無法可靠偵測溢出，直接 bail；caller 的 _XMarqueeInit（panel show 後 rAF 重觸）會在 sized 後重量。
    // 對齊桌面 applyWinnersHMarquee 的 `if (!pairW) return` 護欄。
    if (!row.offsetWidth) return;
    // 減少動態：不啟動跑馬燈循環，靜態顯示（溢出文字回到無 marquee 的 CSS 裁切狀態）。
    // reset 已在上面把 dual-copy 還原成單份，這裡只是不再加 is-overflow / 不建第二份。
    if (prefersReducedMotion()) return;
    const overflow = inner.scrollWidth - row.offsetWidth;
    if (overflow <= 0) return;

    row.classList.add('is-overflow');
    const html = inner.innerHTML;
    inner.innerHTML = `<span class="marquee-copy">${html}</span><span class="marquee-copy">${html}</span>`;
    const copy = /** @type {HTMLElement | null} */ (inner.querySelector('.marquee-copy'));
    if (!copy) return;
    // getBoundingClientRect 對 inline-block 準確；offsetWidth 在某些情境會回 0
    const copyWidth = copy.getBoundingClientRect().width;
    row.style.setProperty('--marquee-distance', `-${copyWidth}px`);
    row.style.setProperty('--marquee-duration', `${Math.max(minDuration, copyWidth / speed)}s`);
  });
}
