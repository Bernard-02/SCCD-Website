/**
 * Page Exit Registry
 *
 * 給單一頁面 register「離開前要跑的退場動畫」，router 在 loadPage 內會先 await
 * 完這個 handler 才走 cleanupPageModules → DOM 替換。
 *
 * 設計：
 * - 只保留一個 handler（同一時間只有一個 active 頁）；新頁面 init 直接覆蓋舊的（多餘的舊 handler
 *   即便沒清也會被下一頁的 register 覆蓋）。
 * - runPageExit 在 await handler 之前先把 handler 清為 null，避免 race（user 連點多次連結時
 *   只跑第一次的退場 anim）。
 * - handler 拋錯不擋換頁，catch + console.error 後繼續。
 */

let exitHandler = null;

/**
 * Page 在 init 時呼叫，註冊離開該頁的退場動畫。fn 必須 return Promise（或 thenable）。
 */
export function registerPageExit(fn) {
  exitHandler = fn;
}

/**
 * Router 在 loadPage 內呼叫，await 完當前頁的退場動畫（如有）。
 * handler 不論成功失敗都會被清為 null，下一頁負責重新 register。
 *
 * @param {object} [destinationRoute] 目的地 route 物件（{ page, htmlFile }），handler 可用來
 *   調整退場視覺（如 /create exit 依下一頁 logo 大小決定 #header-logo 的 snap target）。
 */
export async function runPageExit(destinationRoute) {
  const fn = exitHandler;
  exitHandler = null;
  if (typeof fn !== 'function') return;
  try {
    await fn(destinationRoute);
  } catch (e) {
    console.error('[page-exit] handler threw:', e);
  }
}
