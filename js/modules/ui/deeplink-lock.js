/**
 * Deep-link 呈現期間的操作鎖（user 2026-10-01「deep link 的時候需要擋掉所有操作，讓 deep link 可以完整呈現」）
 *
 * deep-link 導航（首頁浮動卡／ref 鈕 → 本頁退場 → 換頁 → 切分頁 → 捲到 item → 展開／開 slide-in／highlight）
 * 全程由程式驅動；中途的滾輪／觸控／點擊／hover／捲動鍵會搶捲動、提早觸發 hover、點開別的東西＝呈現被打斷。
 *
 * 鎖＝最上層透明擋板（吃掉 pointer／touch／wheel，底下元素也拿不到 :hover/mouseenter）＋ window capture 鍵盤攔截
 * （帶 Ctrl/Meta/Alt 的瀏覽器快捷鍵與 F 鍵放行＝重整／開發者工具照用）。程式捲動（scrollTo／GSAP／scrollTop）
 * 與程式 click()／dispatchEvent 不受影響。
 *
 * 上鎖：router navigateTo（點下去當下就鎖＝本頁退場也蓋住）、activities 頁內 ref 跳轉。
 * 解鎖：各目標頁的「呈現完成點」（含找不到目標／資料失敗的 fallback）；非使用者導航（popstate／轉向重載）一律解。
 * SAFETY_MS 兜底：任何路徑漏解也不會卡死（Directus 弱機查詢 0.5–7s，正常呈現遠短於此）。
 */

const SAFETY_MS = 10000;

// 擋板吃掉的事件：preventDefault（擋捲動／選字／中鍵自動捲動／右鍵選單）＋ stopPropagation——不冒泡到
// document/window：snap-scroll「首次互動交回磁吸」、外點關閉、hover-dim move-guard 等全域 listener 都不該把它當互動
const SWALLOW = ['wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'mousemove', 'mouseover',
  'click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointermove', 'pointerover'];
const KEY_EVENTS = ['keydown', 'keypress', 'keyup'];

/** @type {HTMLDivElement | null} */
let blocker = null;
let safetyTimer = 0;
let gen = 0;   // 每次上鎖 +1：deepLinkUnlocker 取到的舊序號對不上＝解不開這次的鎖

/** @param {Event} e */
function swallow(e) {
  // pointer* 不 preventDefault：會取消相容 mousedown，而中鍵自動捲動／選字要靠 mousedown 的 preventDefault 擋
  if (e.cancelable && !e.type.startsWith('pointer')) e.preventDefault();
  e.stopPropagation();
}

/** @param {KeyboardEvent} e */
function onKey(e) {
  // isTrusted：程式 dispatch 的鍵盤事件（如 lightbox logo 補發 Escape 關 panel）放行
  if (!e.isTrusted || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

export function lockForDeepLink() {
  gen++;
  clearTimeout(safetyTimer);
  safetyTimer = window.setTimeout(unlockDeepLink, SAFETY_MS);
  if (blocker) return;
  blocker = document.createElement('div');
  blocker.id = 'deeplink-lock';
  blocker.setAttribute('aria-hidden', 'true');
  // touch-action:none＝從擋板起手的觸控不平移/縮放頁面（iOS 舊版另靠 touchmove preventDefault）
  blocker.style.cssText = 'position:fixed;inset:0;z-index:2147483647;touch-action:none;';
  SWALLOW.forEach(t => blocker?.addEventListener(t, swallow, { passive: false }));
  document.body.appendChild(blocker);
  KEY_EVENTS.forEach(t => window.addEventListener(t, onKey, true));
}

export function unlockDeepLink() {
  clearTimeout(safetyTimer);
  if (!blocker) return;
  blocker.remove();
  blocker = null;
  KEY_EVENTS.forEach(t => window.removeEventListener(t, onKey, true));
}

// 目標頁的解鎖鑰匙：換頁 init 當下（main-modular initPageModules，router 已上鎖）／頁內跳轉上鎖後立刻取一支，
// 呈現流程跑完用它解。之後又有新的 deep-link 上鎖＝這支作廢：呈現中途按上一頁、又點別的 deep-link 時，
// 舊頁還在跑完的步驟（捲動 tween／計時器／資料 promise）解不開新鎖（user 2026-10-01）。
// router 自己的解鎖（上一頁／出錯／一般換頁）與 SAFETY_MS 仍用無條件的 unlockDeepLink。回傳的函式忽略參數＝可直接當 callback。
export function deepLinkUnlocker() {
  const g = gen;
  return () => { if (g === gen) unlockDeepLink(); };
}
