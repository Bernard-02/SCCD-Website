/**
 * Page Cleanup Registry
 *
 * SPA 換頁時各模組註冊「離頁要解綁的 listener / interval / observer」清單，
 * router 換頁時 `cleanupPageModules` 統一 drain。
 *
 * 為何：原本 window/document 級 listener 各模組自行 `addEventListener` 但沒有 remove 路徑，
 * SPA 多次進出累積 → user 反映「scroll/resize 變慢」「同一動作觸發 N 次」。
 * 改用 named handler + 註冊 cleanup callback，離頁一次性清乾淨。
 *
 * 用法：
 *   const onScroll = () => { ... };
 *   window.addEventListener('scroll', onScroll);
 *   registerPageCleanup(() => window.removeEventListener('scroll', onScroll));
 *
 * 注意：
 * - 註冊的 cleanup fn 應該 idempotent（重複跑安全），因為 SPA 一次離頁只跑一輪 drain
 * - 不要在 cleanup fn 內 throw，被 try/catch 包住但會 console.warn
 */

const cleanups = [];

/**
 * 註冊一個離頁時要跑的 cleanup callback
 * @param {() => void} fn
 */
export function registerPageCleanup(fn) {
  if (typeof fn === 'function') cleanups.push(fn);
}

/**
 * 跑所有註冊的 cleanups（router cleanupPageModules 開頭呼叫）
 * 清空 registry，下一頁 init 重新累積
 */
export function runPageCleanups() {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try { fn(); } catch (e) { console.warn('[page-cleanup] cleanup fn threw:', e); }
  }
}
