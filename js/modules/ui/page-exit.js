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
// 🔧 暫時診斷（hero 偶爾不出現查 hang 用，查完移除）：記每個 handler 的註冊位置
const handlerSites = [];

/**
 * Page 在 init 時呼叫，註冊離開該頁的退場動畫。fn 必須 return Promise（或 thenable）。
 */
export function registerPageExit(fn) {
  if (typeof fn !== 'function') return;
  handlers.push(fn);
  // 🔧 暫時診斷：抓註冊呼叫點（stack 第 3 行 ≈ 呼叫 registerPageExit 的那行）
  handlerSites.push((new Error().stack || '').split('\n').slice(2, 4).join('  ↩  ').trim());
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
  const sites = handlerSites.slice();  // 🔧 暫時診斷
  handlers.length = 0;
  handlerSites.length = 0;  // 🔧 暫時診斷
  if (queued.length === 0) return;
  const pending = new Set(queued.map((_, i) => i));  // 🔧 暫時診斷：哪些還沒 resolve
  const all = Promise.all(queued.map(async (fn, i) => {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;  // 🔧
    try {
      await fn(destinationRoute);
    } catch (e) {
      console.error('[page-exit] handler threw:', e);
    } finally {
      // 🔧 暫時診斷：標記完成 + 印出跑超過 1.2s 的慢 handler
      pending.delete(i);
      const dt = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
      if (dt > 1200) console.warn(`[page-exit] 🐢 退場 handler 慢(${Math.round(dt)}ms)：${sites[i]}`);
    }
  }));
  // 安全閥：退場動畫純視覺，絕不能永久卡住換頁。某 handler 的 Promise 靠 GSAP tween 的 onComplete resolve，
  // 若該 tween 在動畫途中被另一處 overwrite/killTweensOf 殺掉，onComplete 永不 fire → Promise 永不 resolve →
  // swap 卡死、新頁（含 hero）永遠不出現（user 2026-06-22「activities 動畫沒跑完就切換，admission hero 卡住不出現」；
  // 同類 hang 見 reference_activities_switching_flag_stuck_across_spa）。2.5s 遠高於最長合法退場（hero/list ~0.5-0.9s、
  // create 倒打字 ~1s），正常情況一定先 resolve；只有真 hang 才會被這條放行。
  let timedOut = false;  // 🔧 暫時診斷
  await Promise.race([all, new Promise(r => setTimeout(() => { timedOut = true; r(); }, 2500))]);
  // 🔧 暫時診斷：valve 觸發＝有 handler 卡住 → 印出卡住者的註冊位置（查到兇手後整段 🔧 標記移除）
  if (timedOut) {
    console.warn(`[page-exit] ⚠️ 2.5s 安全閥觸發（→ ${destinationRoute && destinationRoute.page}）。卡住的退場 handler 註冊位置：`,
      [...pending].map(i => sites[i]));
  }
}
