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
import { prefersReducedMotion } from './reduce-motion.js';

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
  // 排在呼叫端自己的 DOMLoaded（設 viewBox／接角度／換上畫面）之後：拆的是它們處理完的那張 SVG
  if (gpuLogo && !prefersReducedMotion()) anim.addEventListener('DOMLoaded', () => spinOnCompositor(anim));
}

/**
 * logo 交給合成器轉，不讓 Lottie 逐幀畫——**預設關、試用開關**（user 2026-11-12「不影響 pc 的情況下調 iPad 效能」）。
 * logo 的動畫只有三個群組各自等速繞中心轉（JSON＝三個 null layer 的 rotation，字母全靜態、掛在它們底下），Lottie 卻是每一幀
 * 在主執行緒改三十幾個 SVG 節點 → 每幀都要重算樣式／排版／重畫；頁面愈大（library 四萬節點）每畫一幀附帶的成本愈高，
 * 而且主執行緒一忙 logo 就跟著頓。開了之後：Lottie 畫好第 0 格 → 依群組把 SVG 拆成幾張疊著的 SVG、各掛 CSS rotate
 * （navigation.css .logo-spin）→ Lottie 實例 destroy。之後主執行緒每幀零成本。
 * - 疊放順序照 Lottie 的圖層順序切段；字母之間的 multiply／screen 原本靠 svg 根隔離，拆開後改掛在每張 SVG 上、外層 isolate。
 * - 角度由同一個起點時鐘推（animation-delay 負值）＝換 mode／開 lightbox 重載 logo 都接得上，不用再對 frame。
 * - 只認「群組等速繞定點轉、其餘全靜態」的檔；看不懂的結構直接不接手（照舊 Lottie）。
 *   ponytail: 只檢查圖層 transform，沒檢查 shape 內部有沒有動畫——現有四個 logo 檔都沒有，換檔若加了要補。
 * 為什麼先關著：headless Chrome 逐像素比過（靜止完全一樣；轉動中實心版只差邊緣半個像素的柔化，線框版的細線會變淡一點——
 * 合成器是拿點陣圖去轉），但 iOS 的合成器怎麼混色、轉起來多糊，這邊驗不到。網址加 ?gpulogo=1 開（同分頁有效）、?gpulogo=0 關；
 * 實機看過沒問題再把下面的預設改成 SCCDHelpers.isCoarsePointer()。
 */
let gpuLogo = false;
try {
  const q = new URLSearchParams(location.search).get('gpulogo');
  if (q !== null) sessionStorage.setItem('sccd-gpulogo', q);
  gpuLogo = sessionStorage.getItem('sccd-gpulogo') === '1';
} catch (e) { /* 讀不到 storage＝維持關 */ }

let spinEpoch = 0;
const TRANSFORM_KEYS = ['p', 'a', 's', 'r', 'o'];
const isAnimated = (/** @type {any} */ ks, keys = TRANSFORM_KEYS) => !!ks && keys.some(k => ks[k] && ks[k].a === 1);

function spinOnCompositor(/** @type {any} */ anim) {
  const wrap = anim.wrapper, data = anim.animationData, els = anim.renderer && anim.renderer.elements;
  const svg = wrap && wrap.querySelector('svg');
  if (!svg || !data || !els) return;   // 載入中就被後來的換檔作廢（theme-toggle 已 destroy）
  /** @type {Map<number, { sec: number, x: number, y: number }>} null layer 的 ind → 轉一圈幾秒（負＝逆時針）、軸心 */
  const groups = new Map();
  for (const l of data.layers) {
    const r = l.ks && l.ks.r;
    if (l.ty === 3 && l.parent == null && r && r.a === 1 && r.k.length === 2 && !isAnimated(l.ks, ['p', 'a', 's', 'o'])) {
      const k = r.k[0], deg = r.k[1].s[0] - k.s[0];
      const linear = k.i && k.o && k.i.x[0] === k.i.y[0] && k.o.x[0] === k.o.y[0];
      if (!deg || !linear) return;
      groups.set(l.ind, { sec: 360 * (r.k[1].t - k.t) / data.fr / deg, x: l.ks.p.k[0], y: l.ks.p.k[1] });
    } else if (isAnimated(l.ks)) return;
  }
  if (!groups.size) return;
  /** @type {Map<Element, number | undefined>} 圖層的 <g> → 所屬群組 */
  const groupOf = new Map();
  for (let i = 0; i < data.layers.length; i++) {
    const l = data.layers[i];
    if (l.ty === 3) continue;
    const g = els[i] && els[i].getBaseElement && els[i].getBaseElement();
    if (!g || (l.parent != null && !groups.has(l.parent))) return;
    groupOf.set(g, l.parent);
  }
  const root = groupOf.size && [...groupOf.keys()][0].parentNode;
  if (!root) return;

  anim.goToAndStop(0, true);   // 第 0 格＝每個群組都是 0°
  if (!spinEpoch) spinEpoch = performance.now();
  const t = (performance.now() - spinEpoch) / 1000;
  const vb = svg.viewBox.baseVal;
  const stack = document.createElement('div');
  stack.className = 'logo-spin';
  let run = null, runKey;
  for (const g of root.children) {
    const key = groupOf.get(g);
    if (!run || key !== runKey) {   // 同群組的相鄰圖層併一張，疊放順序不變
      run = /** @type {SVGSVGElement} */ (svg.cloneNode(false));
      runKey = key;
      run.style.transform = '';
      run.style.mixBlendMode = /** @type {SVGElement} */ (g).style.mixBlendMode;
      const grp = key != null && groups.get(key);
      if (grp) {
        const T = Math.abs(grp.sec);
        run.style.transformOrigin = `${(grp.x - vb.x) / vb.width * 100}% ${(grp.y - vb.y) / vb.height * 100}%`;
        run.style.animation = `logo-spin ${T}s linear ${-(t % T)}s infinite${grp.sec < 0 ? ' reverse' : ''}`;
      }
      stack.appendChild(run);
    }
    run.appendChild(g.cloneNode(true));
  }
  anim.destroy();   // 退出 lottie 的逐幀迴圈，連它畫的 SVG 一起清掉
  wrap.appendChild(stack);
}
