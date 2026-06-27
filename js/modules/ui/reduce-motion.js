/**
 * Reduce Motion — 偵測使用者「減少動態效果」的系統偏好（WCAG 2.3.3 / 2.2.2）。
 *
 * 由 OS 設定（Windows 視覺效果 / macOS·iOS 減少動態效果 / Android 移除動畫）控制，
 * 站內不放開關 —— 使用者已在系統表明偏好，我們只負責尊重。
 *
 * 用法：在各動畫進入點 early-return 到「終態/靜態」，現有 tween 程式碼不動。
 *   if (prefersReducedMotion()) { gsap.set(el, endState); return; }
 *
 * ponytail: 觸發時讀一次即可，不監聽中途切換（幾乎沒人動畫跑到一半改系統設定，YAGNI）。
 */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 全域開關（user 2026-06-25 拍板）：reduce 模式下把所有「有限」GSAP tween 變成瞬間完成
 * （duration/delay/stagger → 0），讓各頁自有的 GSAP 進場/退場/切換動畫直接到終態，不必逐頁逐函式 gate。
 *
 * - **排除 `repeat: -1` 無限循環**（首頁卡片搖擺、lightbox/檔案室 ticker 的 GSAP 跑馬燈）——
 *   把無限 tween 歸零會變成每秒幾千次亂轉/閃；維持原速（持續裝飾動畫，要停得另外處理）。
 * - 同時 patch standalone（gsap.to/from/fromTo）與 timeline 子 tween（Timeline.prototype.*）。
 *   to/from 的 vars 是 args[1]、fromTo 的 toVars 是 args[2]（timeline 的 position 參數不影響這兩個 index）。
 * - `gsap.set` 不 patch（本就瞬間，用來設隱藏起點）；hide→reveal 的 reveal 被歸零＝立即顯示。
 * - 只在 reduce 時裝一次（idempotent）；非 reduce 完全不碰 GSAP，動畫逐格如常。
 * - CSS transition 類動畫不靠這個——已由 typography.css 的 reduce blanket（duration→0.01ms）處理。
 */
let _gsapReduced = false;
export function installReducedMotionGsap() {
  if (_gsapReduced || !prefersReducedMotion() || typeof gsap === 'undefined') return;
  _gsapReduced = true;

  // ⚠️ scrub 動畫（scrollTrigger.scrub）是「捲動位置驅動」非「時間驅動」：把它的 duration 歸 0
  //    會讓 scrub 映射崩塌、整段 snap 到終態（header logo 捲動縮放、about class-buttons 上滑收起、
  //    bfa-toggle 都中招——class tab btn 一進頁就被推上去+裁掉＝「不見了」）。一律排除 scrub。
  const isScrub = (v) => !!(v && v.scrollTrigger && v.scrollTrigger.scrub);
  const zero = (v) => {
    if (v && typeof v === 'object' && v.repeat !== -1 && !isScrub(v)) {
      v.duration = 0;
      if (v.delay) v.delay = 0;
      if (v.stagger) v.stagger = 0;
    }
  };
  // scrubChild=true：timeline 子 tween 的 scrub 旗標在「父 timeline」上（子 vars 看不到）→ 查 this._rmScrub
  const wrap = (obj, method, varsIndex, scrubChild) => {
    const orig = obj[method];
    if (typeof orig !== 'function') return;
    obj[method] = function (...args) {
      if (!(scrubChild && this && this._rmScrub)) zero(args[varsIndex]);
      return orig.apply(this, args);
    };
  };

  wrap(gsap, 'to', 1, false);
  wrap(gsap, 'from', 1, false);
  wrap(gsap, 'fromTo', 2, false);

  // tag scrub timeline，讓其子 tween（Timeline.prototype.*）跳過歸零
  const origTimeline = typeof gsap.timeline === 'function' ? gsap.timeline.bind(gsap) : null;
  if (origTimeline) {
    gsap.timeline = function (vars) {
      const tl = origTimeline(vars);
      if (isScrub(vars)) { try { tl._rmScrub = true; } catch (e) { /* frozen instance, ignore */ } }
      return tl;
    };
  }
  const TL = gsap.core && gsap.core.Timeline && gsap.core.Timeline.prototype;
  if (TL) {
    wrap(TL, 'to', 1, true);
    wrap(TL, 'from', 1, true);
    wrap(TL, 'fromTo', 2, true);
  }
}
