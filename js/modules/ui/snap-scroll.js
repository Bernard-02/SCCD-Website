import { DUR, EASE } from './motion.js';

// 捲完後「hold」住 snap=none，等使用者首次主動捲動/互動才交回 mandatory（見 scrollWindowNoSnap 註解）。
const INTERACT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
let _restoreHandler = null;
// list item 開著期間鎖住 snap=none（不交回 mandatory）：list 需要停在 section 中段自由捲讀 + 程式精準對齊，
// mandatory 會把它吸到 snap 點（section 頂/footer）＝user 報的「對齊後又被吸走」。開 item→lockSnapOff、收合/切 section/換頁→unlockSnap。
let _snapLocked = false;

function cancelHeldRestore() {
  if (_restoreHandler) {
    INTERACT_EVENTS.forEach(t => window.removeEventListener(t, _restoreHandler));
    _restoreHandler = null;
  }
}

// 捲完不還原；掛一次性互動 listener，使用者首次捲動/互動才交回 mandatory（restore 後自我移除）。
// 鎖住期間（item 開著）直接 return：snap 維持 none 由 unlockSnap 才還原，不讓「互動即還原」把鎖打開。
function holdSnapUntilInteract(html) {
  if (_snapLocked) return;
  cancelHeldRestore();
  _restoreHandler = () => { cancelHeldRestore(); html.style.scrollSnapType = ''; };
  INTERACT_EVENTS.forEach(t => window.addEventListener(t, _restoreHandler, { passive: true }));
}

// list item 開啟時呼叫：snap 鎖成 none 直到 unlockSnap。期間自由捲讀、程式對齊都不會被 mandatory 吸走。
export function lockSnapOff() {
  _snapLocked = true;
  cancelHeldRestore();
  document.documentElement.style.scrollSnapType = 'none';
}
// 收合 item / 切 section 時呼叫：解鎖並交回 mandatory（清 inline → CSS .snap-* class 重新生效）。
export function unlockSnap() {
  _snapLocked = false;
  document.documentElement.style.scrollSnapType = '';
}

// 立即交回 mandatory + 清掉 pending 互動 listener + 清鎖。router 換頁時呼叫（清掉上一頁殘留的 hold/lock），
// 否則 inline `none` 蓋過新頁 .snap-* class → 新頁磁吸失效。
export function releaseSnapHold() {
  _snapLocked = false;
  cancelHeldRestore();
  document.documentElement.style.scrollSnapType = '';
}

// 把程式捲動落點上限 clamp 到「footer 仍在視窗外」(viewport 底 ≤ footer 頂)。targetY 通常是「對齊頂部」理想落點；
// 回傳 min(targetY, footer頂−視窗高)＝有空間就對齊頂部、沒空間就停在「footer 剛好貼視窗底」(section 完整捲到底)處。
//
// ★正確用法（user 2026-06-28「有空間就在打開同時對齊頂部」）：**呼叫前先把 item content 撐開**（gsap.set height:auto）
//   讓 footer 已落在「展開後」位置再呼叫 → 落點一次到位、不受 #activities-content-section min-height:100vh 留白騙
//   （短 list 展開不一定推 footer，用 content.scrollHeight 預測會失準＝「先對齊頂部又往下修」的兩步跳）。量完即 set 回
//   height:0（同 tick set→量→set 不繪製不閃）。
// footerShiftPx（signed）：量到的 footer「之後」還會發生的位移。開 item 同時 search bar 收合會把 footer 往上拉
//   → 傳 −searchInner高 補償；bar 已收 / 無 bar / 不撐開＝傳 0。
// 不撐開直接呼叫（curriculum slide-in 不推 footer、ref 按鈕 instant 之後才開）＝用收合態 footer、最保守。
// #site-footer = SPA 各頁容器、#site-footer-static = index；隱藏 footer 的頁(library/atlas/generate)抓不到 → 不 clamp。
export function clampBelowFooter(targetY, footerShiftPx = 0) {
  const footer = document.getElementById('site-footer') || document.getElementById('site-footer-static');
  if (!footer || footer.style.display === 'none') return targetY;
  const footerTop = footer.getBoundingClientRect().top + window.scrollY + footerShiftPx;
  return Math.min(targetY, Math.max(0, Math.round(footerTop - window.innerHeight)));
}

/**
 * 程式捲動 window 到 targetY，全程把 mandatory scroll-snap 設成 none；捲完「不立刻」交回，而是 hold 成 none
 * 直到使用者首次主動捲動/互動才還原 .snap-* class 規則（mandatory）。
 *
 * Why（兩段問題）：
 * 1) 捲動「中」：snap-type:y mandatory（掛 <html>，見 css/layout/scroll-snap.css）會把 smooth scroll 搶回最近 snap
 *    點 → 到不了精準目標、速度被牽制、footer 起步無限抖動。故捲動全程設 none。
 * 2) 捲動「完」：deep-link 落點（如 activities 捲到 list 中某 item，對齊 sticky filter bar 底 ~200px）**不是**
 *    .snap-zone 的 snap 點。原本捲完立刻還原 → 瀏覽器當場 re-snap 把落點吸到最近 snap 點（section 頂）
 *    → item「頂到位後又被吸偏一點才展開」（user 2026-06-28）。需要 scroll 的 item 才中招；前幾個落點≈section 頂的不會。
 *    解法：捲完 hold none，等使用者「首次互動」(wheel/touch/key/pointer) 才交回 snap。磁吸本意是給「使用者捲動」用的，
 *    不該破壞「程式精準落點」；使用者一動就恢復磁吸，落地不動時 snap 本來就沒作用。
 *
 * 換頁要主動 releaseSnapHold()（router 換頁時呼叫）：否則殘留的 inline `none` 會蓋過新頁的 .snap-* class → 新頁磁吸失效。
 *
 * GSAP + ScrollToPlugin 在就用（onComplete/onInterrupt 精準）；否則 native smooth + 依距離估時。
 *
 * @param {number} targetY
 * @param {{ duration?: number, ease?: string, onComplete?: () => void }} [opts]
 */
export function scrollWindowNoSnap(targetY, { duration = DUR.medium, ease = EASE.move, onComplete } = {}) {
  const html = document.documentElement;
  cancelHeldRestore();                 // 上一次捲動若還在 hold，先清掉它的 pending restore（避免兩者打架）
  html.style.scrollSnapType = 'none';
  if (typeof gsap !== 'undefined' && typeof window.ScrollToPlugin !== 'undefined') {
    gsap.to(window, {
      scrollTo: { y: targetY, autoKill: false }, duration, ease,
      onComplete: () => { holdSnapUntilInteract(html); onComplete && onComplete(); },
      onInterrupt: () => { cancelHeldRestore(); html.style.scrollSnapType = ''; },  // 使用者中斷＝正在互動，立即交回磁吸
    });
  } else {
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    // native smooth 無完成事件 → 依距離(px≈ms)估時，夾 0.4~1.2s
    const ms = Math.min(1200, Math.max(400, Math.abs(targetY - window.scrollY)));
    setTimeout(() => { holdSnapUntilInteract(html); onComplete && onComplete(); }, ms);
  }
}
