/**
 * Lottie 只在畫面上才跑（user 2026-10-01）。
 * 同一個 SCCD logo 桌面同時跑 3 份：header（看得到）、手機 header（桌面 display:none）、footer（捲在內容區時在畫面外），
 * 看不到的兩份照樣每幀改 SVG＝主執行緒每幀多 ~35%（faculty 掉幀診斷實測）。
 * IntersectionObserver 盯容器：離開畫面或 display:none（沒有 box＝不相交）→ pause；回到畫面 → play，從停住那格續播、不跳角度。
 * - 只恢復自己停的（pausedHere）：IO 對看得到的容器回報「可見」時不去動沒被這裡停過的 anim。
 * - autoplay 一起關：lottie 等 JSON 載完那刻才自動 play，還沒載完時 pause 是 no-op，不關的話載完照樣跑起來。
 * - 呼叫點要放在該處 DOMLoaded listener「之後」：theme-toggle 的 DOMLoaded 會補 play／goToAndPlay（接旋轉角），
 *   lottie 依註冊順序呼叫 listener，排在後面才能再停回去。
 * 只給 loop 的 logo 用（首頁 intro 是 loop:false、播完即停）。
 */
const visible = new WeakMap();      // container → 最近一次判定（還沒判過＝undefined，先照常跑）
const pausedHere = new WeakSet();
let io = null;

function setRunning(anim, on) {
  if (on) {
    if (!pausedHere.delete(anim)) return;
    anim.autoplay = true;
    anim.play();
  } else {
    pausedHere.add(anim);
    anim.autoplay = false;
    anim.pause();
  }
}

/** @param {any} anim lottie.loadAnimation 的回傳值 */
export function runLottieWhenVisible(anim) {
  const el = anim && anim.wrapper;
  if (!el || typeof IntersectionObserver === 'undefined') return;
  if (!io) io = new IntersectionObserver((entries) => entries.forEach((e) => {
    visible.set(e.target, e.isIntersecting);
    // 查 registry 而非自存清單：mode 切換重載後舊 anim 已 destroy、不在 registry，不會被誤 play
    lottie.getRegisteredAnimations()
      .filter((/** @type {any} */ a) => a.wrapper === e.target)
      .forEach((/** @type {any} */ a) => setRunning(a, e.isIntersecting));
  }));
  io.observe(el);   // 同一容器重載新 anim 時再 observe＝no-op，所以下面要自己補判
  const sync = () => { if (visible.get(el) === false) setRunning(anim, false); };
  sync();
  anim.addEventListener('DOMLoaded', sync);
}
