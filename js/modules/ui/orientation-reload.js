/**
 * Orientation Re-layout（矮橫向 gate 邊界自動重排）
 *
 * 手機轉向（直 ↔ 橫）時自動重排 layout，user 不用手動刷新（user 2026-07-04）。
 *
 * 機制＝router.reloadCurrentRoute()：同頁重新走一次 SPA loadPage（cleanup + swap + init）——
 * 跟點導航連結到同頁一樣，無白屏、header/mode 不動。CSS 端（landscape gate）本來就即時生效，
 * 這一步是把「init 當下定案」的頁面級 JS 狀態（hero timeline、reveal 綁定、slot 座標…）重建乾淨；
 * SPA 的 cleanup registry 架構保證重入安全（每頁天天在走這條路）。
 * ⚠️ 曾用 location.reload()（白屏閃一下），user 打槍「很多網頁都沒有直接 reload」→ 改軟重排。
 *
 * 邊界與例外：
 * - 觸發 = 跨越 landscape gate（同 landscape.css：orientation:landscape + max-height:500px），
 *   且裝置是觸控（pointer:coarse）——桌面拖視窗成矮扁形不誤觸。
 * - /create 例外：SPA 重載會 cleanupCreateApp 重建 p5、使用者畫作會丟；它自帶轉向提示 overlay 自理。
 * - 300ms debounce：等瀏覽器轉向後 viewport 尺寸定案（部分 Android 會連發 change）。
 */

import { reloadCurrentRoute } from '../../router.js';

const GATE = '(orientation: landscape) and (max-height: 500px)';

export function initOrientationReload() {
  const mq = window.matchMedia(GATE);
  let timer = null;
  mq.addEventListener('change', () => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;   // 只在觸控裝置（真手機/平板）
    // /create（route 名 generate、URL /create 或 create.html）不重載：p5 畫作會丟，頁面自理轉向
    if (/create(\.html)?\/?$/.test(location.pathname)) return;
    clearTimeout(timer);
    timer = setTimeout(() => reloadCurrentRoute(), 300);
  });
}
