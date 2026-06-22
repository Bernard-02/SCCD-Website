/**
 * Page Exit Registry
 *
 * 給單一頁面 register「離開前要跑的退場動畫」，router 在 loadPage 內會先 await
 * 完這個 handler 才走 cleanupPageModules → DOM 替換。
 *
 * 設計：
 * - 支援多 handler（hero exit 是全站共用，page-specific exit 在 hero 之上疊加）；
 *   runPageExit 用 Promise.all 並行 await 所有 handler。
 * - runPageExit 在 await 之前把 array 清空，避免 race（user 連點多次連結時
 *   只跑第一次的退場 anim）。
 * - handler 拋錯不擋換頁，catch + console.error 後繼續。
 */

const handlers = [];

/**
 * Page 在 init 時呼叫，註冊離開該頁的退場動畫。fn 必須 return Promise（或 thenable）。
 */
export function registerPageExit(fn) {
  if (typeof fn !== 'function') return;
  handlers.push(fn);
}

/**
 * Router 在 loadPage 內呼叫，await 完當前頁所有退場動畫（如有）。
 * handlers 不論成功失敗都會被清空，下一頁負責重新 register。
 *
 * @param {object} [destinationRoute] 目的地 route 物件（{ page, htmlFile }），handler 可用來
 *   調整退場視覺（如 /create exit 依下一頁 logo 大小決定 #header-logo 的 snap target）。
 */
export async function runPageExit(destinationRoute) {
  const queued = handlers.slice();
  handlers.length = 0;
  if (queued.length === 0) return;
  const all = Promise.all(queued.map(async fn => {
    try {
      await fn(destinationRoute);
    } catch (e) {
      console.error('[page-exit] handler threw:', e);
    }
  }));
  // 安全閥：退場動畫純視覺，絕不能永久卡住換頁。某 handler 的 Promise 靠 GSAP tween 的 onComplete resolve，
  // 若該 tween 在動畫途中被另一處 overwrite/killTweensOf 殺掉，onComplete 永不 fire → Promise 永不 resolve →
  // swap 卡死、新頁（含 hero）永遠不出現（user 2026-06-22「activities 動畫沒跑完就切換，admission hero 卡住不出現」；
  // 同類 hang 見 reference_activities_switching_flag_stuck_across_spa）。2.5s 遠高於最長合法退場（hero/list ~0.5-0.9s、
  // create 倒打字 ~1s），正常情況一定先 resolve；只有真 hang 才會被這條放行。
  await Promise.race([all, new Promise(r => setTimeout(r, 2500))]);
}
