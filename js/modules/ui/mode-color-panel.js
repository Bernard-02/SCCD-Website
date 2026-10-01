/**
 * Mode-3 背景色編輯浮動面板
 * 只在 mode-color（mode3）＋ header mode-btn 存在時出現；lightbox / slide-in / video player 開啟、
 * 或捲到 footer、或在 /create 頁時隱藏。全域一次性初始化（掛在 <body>，跨 SPA 換頁存活，同 custom-scrollbar）。
 *
 * - 收起＝右下角鉛筆方鈕（48px，同 history 左下 btn）
 * - 展開＝浮空方形面板，內含 create 的色環（72px）＋中央 play/pause
 * - 色環 drag 改 hue、play/pause 控背景色循環：全部接 theme-toggle.js 既有 export，不新增色彩邏輯
 * - 進退場＝hero clip-reveal：mask wrapper overflow:hidden + 本體 xPercent/yPercent 滑動（DUR.medium；
 *   進出同 EASE.enter——出場用 power3.in 起步慢會顯拖，見 feedback_trigger_hide_ease_out_not_in）
 * - 色環是 create 那顆的 Canvas2D 移植（create 版綁死 p5，為一顆小環載 p5 不划算）
 * - 桌面 ≥1200（同 desktop menu gate）改版（user 2026-09-28）：鉛筆＝圓鈕、跟 menu btn 同欄（右 container padding、底 48）；
 *   點開＝圓往左拉長成 capsule，內放 create 手機版同款長條色條（indicator 仍是直線）＋ play/pause，鉛筆換成 chevron（點它收回）。
 *   色環/鉛筆方鈕只剩 <1200。兩套 DOM 都建、CSS 依 gate 顯示其一；open/close 呼叫當下判 isDesk()
 */
import { DUR, EASE } from './motion.js';
import { clipRevealIconSwap, ensureIconClipWrap } from './scroll-animate.js';
import { randomSpinAngle } from './arrow-spin.js';
import { setColorHue, getColorHue, startSiteColorLoop, stopSiteColorLoop, isColorLoopRunning } from './theme-toggle.js';

const isDesk = () => window.matchMedia('(min-width: 1024px) and (min-height: 501px)').matches;
const CAP_H = 48;    // 圓鈕直徑＝capsule 高（同 header mode/menu 鈕 48）
const CAP_W = 268;   // 展開寬＝左圓角留白 20 + 色條 160 + 間距 8 + play 32 + chevron 格 48（css .mcp-cap-row 同步）
const ICON_SWAP = 0.4;   // chevron clipRevealIconSwap 每半段秒數；色條/play 進退場也用同長度
// 色條／play icon 各自四向隨機進退場（user 2026-10-01，同 clipRevealIconSwap 四向）；±110＝整條真的出遮罩
// （色條遮罩外擴 1px 給 indicator，±100 會在邊上留一條 1px）
const REVEAL_DIRS = [{ xPercent: 0, yPercent: -110 }, { xPercent: 0, yPercent: 110 }, { xPercent: -110, yPercent: 0 }, { xPercent: 110, yPercent: 0 }];
const pickRevealDirs = () => capReveal.map(() => REVEAL_DIRS[(Math.random() * 4) | 0]);

// 手機直向：整個面板白框以 faculty 卡片牆縮圖寬為基準再乘 PANEL_SCALE（每欄 = 50vw − 36，
// container-padding 24 + gap 24；上限 200＝卡片上限）。白框 = 色環 + 2×16 padding，故色環 = 白框 − 32。
// 桌面/橫向 ≥768 維持 72（見 CLAUDE.md landscape gate）。色環改 SVG/CSS conic 向量繪製＝任何尺寸/DPR 皆銳利、不需 buffer。
const PANEL_SCALE = 0.95;   // 面板整體大小微調鈕：要再大/小改這個數
const WHEEL = window.innerWidth < 768
  ? Math.round(Math.min(200, window.innerWidth * 0.5 - 36) * PANEL_SCALE) - 32
  : 72;   // 色環尺寸，桌面同 create

let root, pencilBtn, panel, panelMask, canvas, playBtn, playIcon, svgEl, indEl;
let cap, capToggle, capIcon, capPlay, bar, barTrack, barInd, barIndWrap, capReveal, playIcons = [];
let openedDesk = false;   // 開啟時走哪套（close 用它、不重判 isDesk()：開著跨 1200 gate 也收對那套）
let isOpen = false;
let dragging = false;
let redrawRAF = null;
let overFooter = false;
let scrollScheduled = false;
let wheelRot = 0;   // box 隨機微傾角（deg），每次開啟重擲；掛 panel mask 的 CSS rotation，drag 角度要扣回
let toggleDeg = 0;    // 鉛筆格目前的目標角（讀 GSAP 現值會拿到補間中間值）

/* ── HSB→RGB（對齊 create / theme-toggle 的 color(hue,80,100) HSB）── */
function hsbToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
// hue 的相對亮度 > 0.5 ＝亮底（panel 中性灰底同向翻）→ border/indicator 用黑；反之白
function hueIsLight(hue) {
  const [r, g, b] = hsbToRgb(hue, 80, 100);
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.5;
}

// SVG 版：色環是 CSS conic-gradient（畫一次、免逐幀）；此處逐幀只更新 indicator 旋轉角 + 內外圈/指標的對比色。
// indicator line 在 viewBox top（hue 0＝12 點）→ rotate(hue) 順時針對到 conic 的色相；shade 走 currentColor。
function drawWheel() {
  const hue = getColorHue();
  svgEl.style.color = hueIsLight(hue) ? '#fff' : '#000';   // 內外圈 + indicator 描邊對比 panel 底
  indEl.setAttribute('transform', `rotate(${hue} 36 36)`);
  // 色條直線 indicator：hue 0~360 線性對到整條寬（含圓角端，0/360 都是紅）。wrap 走 create 手機 bar 的「循環繪製」：
  // 主線滑出右緣多少、複本就從左緣進來多少（複本永遠在主線的另一側 ±100%），hue 359.9→0 那一幀主線位置＝複本位置
  // ＝無縫接手，不再「到右邊直接跳回左邊」（user 2026-09-29）。.mcp-bar overflow:hidden 負責裁切出界部分。
  const pct = (((hue % 360) + 360) % 360) / 3.6;
  barInd.style.left = `${pct}%`;
  barIndWrap.style.left = `${pct >= 50 ? pct - 100 : pct + 100}%`;
}

function redrawLoop() {
  if (!isOpen) return;
  drawWheel();
  redrawRAF = requestAnimationFrame(redrawLoop);
}

/* ── drag → hue（同 create updateColorFromMouse 桌面分支：atan2 + 90）── */
function pointerHue(e) {
  const r = canvas.getBoundingClientRect();
  const dx = e.clientX - r.left - r.width / 2;
  const dy = e.clientY - r.top - r.height / 2;
  // 扣掉色環的隨機旋轉，drag 才落在「視覺上」游標指的色段
  return (Math.atan2(dy, dx) * 180 / Math.PI + 90 - wheelRot + 360) % 360;
}
// 點擊（tap）→ indicator 從當前 hue 沿最短弧線 tween 到點的顏色（user 2026-07-15）：
// onUpdate 每幀 setColorHue → indicator（redrawLoop 讀 getColorHue）與背景一起沿途掃過中間色。
// 拖曳（真的移動）則 kill tween、恢復 1:1 即時跟手。
let hueTween = null;
let downX = 0, downY = 0;
const DRAG_THRESHOLD = 3;   // px：超過才視為拖曳（觸控微抖不取消 tween）
function killHueTween() {
  if (hueTween) { hueTween.kill(); hueTween = null; }
}
// 色條：整條寬（track 滿版，圓角只裁形狀）＝0~360 線性映射，與 indicator 同一座標；點到條外 clamp 成 0/360
function barHue(e) {
  const r = barTrack.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 360;
}
let dragHue = pointerHue;   // 拖曳中用哪個換算（色環 / 色條）
function tweenHueTo(target, linear = false) {
  const cur = ((getColorHue() % 360) + 360) % 360;
  // 色環走最短弧 (-180, 180]；色條線性直達（直線 indicator 跨 wrap 會兩端跳，同 create 手機 bar）
  const delta = linear ? target - cur : ((target - cur + 540) % 360) - 180;
  const proxy = { h: cur };
  killHueTween();
  hueTween = gsap.to(proxy, {
    h: cur + delta, duration: DUR.base, ease: EASE.enter,
    onUpdate: () => setColorHue(proxy.h),
    onComplete: () => { hueTween = null; },
  });
}
function onCanvasDown(e) {
  const r = canvas.getBoundingClientRect();
  // box 被 CSS 旋轉 → r 是旋轉後的 bbox（比 72 大），但其中心＝canvas 真正中心、distance 旋轉不變，
  // 故半徑用固定 WHEEL 不用 r.width；角度在 pointerHue 扣掉 wheelRot 還原 local
  const dx = e.clientX - r.left - r.width / 2;
  const dy = e.clientY - r.top - r.height / 2;
  const dist = Math.hypot(dx, dy);
  const outer = WHEEL * 0.49, inner = outer * 0.54;
  if (dist < inner || dist > outer) return;   // 只在環帶上起 drag（中央讓給 play btn）
  dragging = true;
  dragHue = pointerHue;
  downX = e.clientX; downY = e.clientY;
  if (typeof gsap !== 'undefined') tweenHueTo(pointerHue(e));
  else setColorHue(pointerHue(e));
  e.preventDefault();
}
function onBarDown(e) {
  dragging = true;
  dragHue = barHue;
  downX = e.clientX; downY = e.clientY;
  if (typeof gsap !== 'undefined') tweenHueTo(barHue(e), true);
  else setColorHue(barHue(e));
  e.preventDefault();
}
function onWinMove(e) {
  if (!dragging) return;
  // 還在 tween 中且位移未超過閾值 → 視為點擊的微抖，不打斷 tween
  if (hueTween && Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_THRESHOLD) return;
  killHueTween();
  setColorHue(dragHue(e));
}
function onWinUp() { dragging = false; }

// #atlas-detail（星雲 hover 說明卡）避讓：發佈鉛筆/色輪佔用的視窗底高度，atlas.css 讀 --mcp-footprint 上移卡片。
// footprint = mask 底距(32) + 元件高（收起鉛筆 48 / 展開色輪 = WHEEL + 2×16 padding）。
const PANEL_BOTTOM = 32;   // .mcp-*-mask bottom（--spacing-lg）
function publishFootprint() {
  if (isDesk()) {   // 圓鈕/capsule：底 48 + 高 48；右 container padding + 寬（留 calc 給 CSS 解，免假設 1rem=16px）
    document.body.style.setProperty('--mcp-footprint', (48 + CAP_H) + 'px');
    document.body.style.setProperty('--mcp-footprint-x', `calc(var(--container-padding) + ${isOpen ? CAP_W : CAP_H}px)`);
    return;
  }
  const h = isOpen ? (WHEEL + 32) : 48;
  document.body.style.setProperty('--mcp-footprint', (PANEL_BOTTOM + h) + 'px');
  // 水平佔用（面板左緣距視窗右緣）：鉛筆貼右緣(right:0)寬 48；色輪 right:32 寬 WHEEL+32。
  // atlas 桌面 mode3 hover 卡讀此值貼到面板左側（見 atlas.css）。
  document.body.style.setProperty('--mcp-footprint-x', (isOpen ? (32 + WHEEL + 32) : 48) + 'px');
}

function syncPlayIcon() {
  // running → 顯示 pause（點了會停）；paused → 顯示 play
  playIcons.forEach(i => { i.className = `icon ${isColorLoopRunning() ? 'icon-pause' : 'icon-play'}`; });
}
function onPlayClick(e) {
  e.stopPropagation();
  if (isColorLoopRunning()) stopSiteColorLoop(); else startSiteColorLoop();
  syncPlayIcon();
}

/* ── open / close：wheel 整顆從畫面右緣外滑入（user 2026-07-17：不再走遮罩內 clip-reveal）──
   panel mask 不再裁切（overflow:visible）；唯一裁切線＝整層 #mode-color-panel(inset:0) 的 overflow:hidden＝視窗右緣。
   wheel 藏起態＝整顆移到視窗外右方 translateX(100%+48px)，開場滑到定位（xPercent/x 皆 0）落在鉛筆左側；關＝反向滑回視窗外。
   開＝鉛筆本體往右滑出視窗＋ wheel 從畫面外右方滑入（鉛筆先讓位、wheel 跟著從右進場）。
   微傾掛 panel mask（hero 慣例：rotation 在 wrapper、slide 在本體，兩者不搶 transform）。 */
// xPercent:100 走 CSS 百分比（免 JS 量測——build 時整層 display:none，panel.offsetWidth=0 會讓 px 算法失效、半藏在邊緣）；
// 疊固定 x:48（= dock 32 + margin）補滿「自身寬 + dock」讓整顆真的出視窗。兩者都由 GSAP 管、各自獨立分量不打架。
const WHEEL_HIDDEN = { xPercent: 100, x: 48, yPercent: 0 };   // wheel 藏起態：整顆移出視窗右緣
const HANDOFF_DELAY = DUR.medium;   // 接力延遲＝先走者的完整 duration：後手要等先走者完全滑出視窗才入場，兩者不重疊

function open() {
  if (isOpen) return;
  if (!shouldShow()) return;   // 滑出收起的 0.5s 窗口內鉛筆仍可點——gate 中不開
  isOpen = true;
  publishFootprint();   // 展開色輪 → 說明卡讓位到色輪之上
  // 每次開啟隨機微傾「整個 box」：|角| ∈ [1,4]°、隨機正負（排除 0，保證看得出傾斜）
  wheelRot = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3);
  root.classList.add('mcp-open');
  syncPlayIcon();
  redrawLoop();
  openedDesk = isDesk();
  if (openedDesk) {
    capPlay.tabIndex = 0;   // 展開才可 Tab 到（收起時 play 在圓外被裁、看不見）
    // 圓往左拉長（mask right 錨定、row 靠右固定寬 → 長出來的部分由右往左露出色條/play）；鉛筆換 chevron
    // 先殺 width：收起那支帶 delay、還沒開跑的縮寬 tween 'auto' 抓不到，不殺＝收起 0.4s 內重開會被它縮回去
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(cap, 'width');
      gsap.to(cap, { width: CAP_W, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto' });
    }
    else cap.style.width = CAP_W + 'px';
    cap.classList.add('is-active');   // 展開中＝反色（css .mcp-cap.is-active）
    clipRevealIconSwap(capIcon, 'icon icon-chevron-right', { duration: ICON_SWAP });
    // 時序（user 2026-09-29）：capsule 長＋chevron 換入（0→2×ICON_SWAP）→ 之後色條＋play icon 才進場；
    // fromTo 立即套起點＝前段期間兩者已藏在各自貼身遮罩下；各自四向隨機（user 2026-10-01）
    if (typeof gsap !== 'undefined') {
      const from = pickRevealDirs();
      gsap.fromTo(capReveal, { xPercent: i => from[i].xPercent, yPercent: i => from[i].yPercent },
        { xPercent: 0, yPercent: 0, duration: ICON_SWAP, ease: 'power2.out', delay: ICON_SWAP * 2, overwrite: true, clearProps: 'transform' });
    }
    capToggle.setAttribute('aria-expanded', 'true');
  } else if (typeof gsap !== 'undefined') {
    gsap.set(panelMask, { rotation: wheelRot });   // 微傾在 mask（drag 用 wheelRot 補償）
    gsap.fromTo(pencilBtn, { xPercent: 0 }, { xPercent: 100, duration: DUR.medium, ease: EASE.enter, overwrite: true });
    gsap.fromTo(panel, WHEEL_HIDDEN, { xPercent: 0, x: 0, yPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true, delay: HANDOFF_DELAY });
  } else {
    pencilBtn.style.transform = 'translateX(100%)';
    panel.style.transform = 'none';
  }
  // 下一 tick 才綁 outside-close，避免開啟的那一下 pointerdown 立刻關回去
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}
// opts.pencilReturn=false：gate 藏起整層時用——wheel 照播滑出，但鉛筆不回場（維持遮罩外，
// 下次 show 由 updateVisibility 滑入）；opts.onDone：收完後回呼（gate 藏起用來 display:none）
function close(instant, opts = {}) {
  if (!isOpen) return;
  const pencilReturn = opts.pencilReturn !== false;
  isOpen = false;
  publishFootprint();   // 收回鉛筆 → 說明卡下移回鉛筆之上
  document.removeEventListener('pointerdown', onOutside, true);
  if (redrawRAF) { cancelAnimationFrame(redrawRAF); redrawRAF = null; }
  const finish = () => {
    root.classList.remove('mcp-open');
    if (typeof gsap !== 'undefined') {
      gsap.set(panelMask, { clearProps: 'transform' });
      // pencilReturn=true 時鉛筆由下面的 delay fromTo 自己收尾，這裡別碰——finish() 在 wheel
      // 完成(t=DUR.medium)先於鉛筆 tween 完成(t=HANDOFF_DELAY+DUR.medium)觸發，硬 set 會搶在
      // 鉛筆動畫跑完前把它瞬移到位、delay 一到 fromTo 又把它彈回 from 值重新滑入 → 閃兩次
      if (!pencilReturn && !wasShown) gsap.set(pencilBtn, { xPercent: 100 });   // 收的途中又 show＝別把鉛筆停在遮罩外
      gsap.set(panel, WHEEL_HIDDEN);   // wheel 回藏起態（遮罩左側外）
    } else {
      panelMask.style.transform = '';
      pencilBtn.style.transform = pencilReturn ? '' : 'translateX(100%)';
      panel.style.transform = 'translateX(calc(100% + 48px))';
    }
    if (opts.onDone) opts.onDone();
  };
  if (openedDesk) {
    capToggle.setAttribute('aria-expanded', 'false');
    capPlay.tabIndex = -1;
    cap.classList.remove('is-active');   // 收起一開始就翻回（跟展開對稱：狀態變了色就變，不等寬度收完）
    if (instant || typeof gsap === 'undefined') {
      if (typeof gsap !== 'undefined') gsap.killTweensOf(capReveal);   // 還在等 delay 的 reveal 別在收合後升起
      capIcon.className = 'icon icon-pencil';
      if (typeof gsap !== 'undefined') gsap.set(cap, { width: CAP_H, xPercent: pencilReturn ? 0 : 100 });
      else cap.style.width = '';
      finish(); return;
    }
    // 展開的反序（user 2026-09-29）：色條＋play icon 先收進遮罩（各自四向隨機）→ 收完 chevron 才換回鉛筆＋capsule 縮
    const to = pickRevealDirs();
    gsap.to(capReveal, { xPercent: i => to[i].xPercent, yPercent: i => to[i].yPercent, duration: ICON_SWAP, ease: 'power2.out', overwrite: true });
    clipRevealIconSwap(capIcon, 'icon icon-pencil', { duration: ICON_SWAP, delay: ICON_SWAP });
    // 收回圓；gate 藏起（pencilReturn=false）＝收完再整顆滑出遮罩
    // 收完才判：收的途中 gate 又翻回 show（捲到 footer 又立刻捲回）＝updateVisibility 已把圓滑回，別再把它送出遮罩
    gsap.to(cap, { width: CAP_H, duration: DUR.medium, ease: EASE.enter, delay: ICON_SWAP, overwrite: 'auto', onComplete: () => {
      if (pencilReturn || wasShown) finish();
      else gsap.to(cap, { xPercent: 100, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto', onComplete: finish });
    } });
    return;
  }
  if (instant || typeof gsap === 'undefined') { finish(); return; }
  // 反向接力：wheel 先往左滑回、鉛筆延遲回來（pencilReturn=false 時不回）
  gsap.to(panel, { ...WHEEL_HIDDEN, duration: DUR.medium, ease: EASE.enter, overwrite: true, onComplete: finish });
  if (pencilReturn) {
    gsap.fromTo(pencilBtn, { xPercent: 100 }, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true, delay: HANDOFF_DELAY });
  }
}
function onOutside(e) {
  if (!panel.contains(e.target) && !cap.contains(e.target)) close(false);
}

/* ── 可見性 gate ── */
function currentPage() {
  return (window.location.pathname.split('/').pop() || '').replace('.html', '') || 'index';
}
function shouldShow() {
  if (!document.body.classList.contains('mode-color')) return false;
  const page = currentPage();
  if (page === 'create' || page === 'generate') return false;          // /create 由頁內 control 控
  if (!document.querySelector('.theme-toggle-btn')) return false;       // mode-btn（header）還沒載入
  if (document.body.classList.contains('lightbox-open')) return false;  // lightbox / slide-in overlay
  if (document.body.classList.contains('idle-standby-inplace')) return false;   // atlas 頁待機＝頁面本身當待機畫面（idle-standby.js）
  if (document.documentElement.classList.contains('has-slide-in')) return false;
  const vid = document.getElementById('video-player-overlay');
  if (vid && vid.style.display === 'flex') return false;                // 自架 video player（無 class，看 inline display）
  if (overFooter) return false;
  // 桌面圓鈕跟 menu 下組（CREATE! 等）同位：menu 開著讓位（html class 由 mobile-menu.js 掛，MutationObserver 觸發）
  if (isDesk() && document.documentElement.classList.contains('mobile-menu-open')) return false;
  return true;
}
// 鉛筆顯隱（user 2026-07-15：footer 捲到也要收起動畫，不能直接跳不見）：所有 gate 轉換一律
// 滑動收展（同 open/close 的鉛筆軸；gsap.to 從當下位置接、快速跨 footer 閾值來回也順）。
// lightbox/slide-in 由 CSS !important 即時硬藏（overlay 蓋住時不該看到滑出過程）。
// 面板開著被 gate 藏＝即時（close(true) 已還原鉛筆，再播滑出會「閃現又滑走」）。
// theme:changed 在 color loop 中 ~5Hz 重發，靠 wasShown 不變 early return 去重。
let wasShown = false;
function updateVisibility() {
  const show = shouldShow();
  if (show === wasShown) return;
  wasShown = show;

  if (show) {
    root.style.display = 'block';
    // 鉛筆方鈕與桌面圓鈕一起動（另一顆 CSS display:none 零成本）：跨 1200 resize 時兩顆狀態不脫鉤。
    // 鉛筆維持 overwrite:true（殺 close 排的延遲回場 tween）；圓鈕 'auto'＝只接管 xPercent、不殺進行中的 width 收合
    if (typeof gsap !== 'undefined') {
      gsap.to(pencilBtn, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true });
      gsap.to(cap, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto' });
    } else {
      pencilBtn.style.transform = cap.style.transform = '';
    }
    return;
  }

  if (isOpen) {
    // wheel 開著被 gate（如捲到 footer）：wheel 播自己的滑出、鉛筆不回場，收完才藏整層（user 2026-07-15）
    close(typeof gsap === 'undefined', {
      pencilReturn: false,
      onDone: () => { if (!wasShown) root.style.display = 'none'; },
    });
    return;
  }
  if (typeof gsap !== 'undefined') {
    gsap.to(cap, { xPercent: 100, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto' });
    gsap.to(pencilBtn, {
      xPercent: 100, duration: DUR.medium, ease: EASE.enter, overwrite: true,
      // 動畫期間若又翻回 show（快速捲回），onComplete 別把剛 reveal 的層藏掉
      onComplete: () => { if (!wasShown) root.style.display = 'none'; },
    });
  } else {
    root.style.display = 'none';
  }
}

// footer 判準（user 2026-07-15 修正）：不能「footer 露出 1px 就藏、完全離開視窗才回來」——
// 鉛筆佔視窗底 32-80px 帶，footer 剛探頭根本沒碰到它，捲回 main 時要等 footer 全離場才回來＝太晚。
// 改成 footer 頂緣「進到鉛筆區附近」才算 over：捲下去 footer 逼近鉛筆才收、捲回 footer 一離開那帶就回場。
const FOOTER_HIDE_GAP = 64;   // 鉛筆帶 32-80 的中段：footer 蓋掉視窗底 64px 時開始算 over
function updateOverFooter() {
  const footer = /** @type {HTMLElement|null} */ (
    [...document.querySelectorAll('footer.footer-shell')].find(f => /** @type {HTMLElement} */(f).offsetHeight > 0));
  overFooter = !!footer && footer.getBoundingClientRect().top < window.innerHeight - FOOTER_HIDE_GAP;
}
function onScroll() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => { scrollScheduled = false; updateOverFooter(); updateVisibility(); });
}

function build() {
  root = document.createElement('div');
  root.id = 'mode-color-panel';
  root.innerHTML = `
    <div class="mcp-pencil-mask">
      <button class="mcp-pencil" type="button" aria-label="編輯背景色 Edit background colour" title="背景色 Colour">
        <!-- 鉛筆 icon 走後台 site_icons（key: pencil）＋本地 website-icons/pencil.svg fallback（2026-09-16 起，CMS 掛也不空鈕） -->
        <span class="icon icon-pencil" aria-hidden="true"></span>
      </button>
    </div>
    <div class="mcp-panel-mask">
      <div class="mcp-panel" role="dialog" aria-label="背景色 Background colour">
        <div class="mcp-wheel-wrap">
          <div class="mcp-wheel">
            <svg class="mcp-wheel-svg" viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="35.28" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
              <circle cx="36" cy="36" r="19.05" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
              <line class="mcp-ind" x1="36" y1="16.95" x2="36" y2="0.72" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <button class="mcp-play" type="button" aria-label="播放 / 暫停 背景色循環 Play / pause">
            <span class="icon icon-play" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
    <div class="mcp-cap-mask">
      <div class="mcp-cap" role="group" aria-label="背景色 Background colour">
        <div class="mcp-cap-row">
          <div class="mcp-bar-mask"><div class="mcp-bar" aria-hidden="true"><div class="mcp-bar-track"><span class="mcp-bar-ind"></span><span class="mcp-bar-ind mcp-bar-ind--wrap"></span></div></div></div>
          <button class="mcp-cap-play" type="button" aria-label="播放 / 暫停 背景色循環 Play / pause">
            <span class="icon icon-play" aria-hidden="true"></span>
          </button>
          <button class="mcp-cap-toggle" type="button" aria-label="編輯背景色 Edit background colour" aria-expanded="false">
            <span class="icon icon-pencil" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  pencilBtn = root.querySelector('.mcp-pencil');
  panel = root.querySelector('.mcp-panel');
  panelMask = root.querySelector('.mcp-panel-mask');
  canvas = root.querySelector('.mcp-wheel');   // hit-test 用（getBoundingClientRect）；色環已改 SVG，非 <canvas>
  svgEl = root.querySelector('.mcp-wheel-svg');
  indEl = root.querySelector('.mcp-ind');
  playBtn = root.querySelector('.mcp-play');
  playIcon = playBtn.querySelector('.icon');
  cap = root.querySelector('.mcp-cap');
  capToggle = root.querySelector('.mcp-cap-toggle');
  capIcon = capToggle.querySelector('.icon');
  bar = root.querySelector('.mcp-bar');
  barTrack = root.querySelector('.mcp-bar-track');
  barInd = root.querySelector('.mcp-bar-ind:not(.mcp-bar-ind--wrap)');
  barIndWrap = root.querySelector('.mcp-bar-ind--wrap');   // wrap 進場複本（drawWheel 定位）
  capPlay = root.querySelector('.mcp-cap-play');
  capPlay.tabIndex = -1;
  playIcons = [playIcon, capPlay.querySelector('.icon')];
  ensureIconClipWrap(playIcons[1]);   // play icon 貼身遮罩（色條的在 HTML .mcp-bar-mask）
  capReveal = [bar, playIcons[1]];

  // 手機放大：CSS 顯示尺寸跟 WHEEL 走（panel = wheel + 2×16 padding）；桌面 72 由 CSS 顧，不覆蓋。
  // play/pause 鈕與 icon 依 WHEEL 等比放大（桌面 72→30/16），維持與色環同比例
  if (WHEEL !== 72) {
    const wrap = root.querySelector('.mcp-wheel-wrap');
    const px = WHEEL + 'px';
    panel.style.width = panel.style.height = (WHEEL + 32) + 'px';
    wrap.style.width = wrap.style.height = px;
    canvas.style.width = canvas.style.height = px;
    playBtn.style.width = playBtn.style.height = Math.round(WHEEL * 24 / 72) + 'px';   // 比桌面(30)再收小
    playIcon.style.fontSize = Math.round(WHEEL * 13 / 72) + 'px';
  }

  drawWheel();   // 初始 indicator 角度 + 對比色（色環本身是 SVG/CSS conic，畫一次、免逐幀）

  // 面板初始藏起（滑出遮罩左側外）：必須用 gsap xPercent（同 tween 的分量）；CSS translate% 會被
  // gsap 解析成 px 的 x 分量、跟 xPercent 疊加 → 開場後殘留偏移（實測 x=104 卡死）
  if (typeof gsap !== 'undefined') { gsap.set(panel, WHEEL_HIDDEN); gsap.set(cap, { xPercent: 100 }); }
  else panel.style.transform = 'translateX(calc(100% + 48px))';

  publishFootprint();   // 初始＝收起鉛筆的 footprint（供 atlas 說明卡讓位）

  pencilBtn.addEventListener('click', open);
  playBtn.addEventListener('click', onPlayClick);
  capPlay.addEventListener('click', onPlayClick);
  capToggle.addEventListener('click', () => (isOpen ? close(false) : open()));
  // 鉛筆／chevron 格 hover 抽角（user 2026-09-29，全站 −4~+6、離開保持）：轉這一格（收起時＝圓鈕本身，圓轉了看不出＝轉 icon），
  // 不轉整顆 .mcp-cap——展開成 268 寬 capsule 一歪兩端就被 .mcp-cap-mask 的 overflow 裁掉。GSAP rotation（mode3 下 CSS transition 不可靠）；
  // 這格沒有別的 GSAP transform（icon 換裝動的是內層 .icon、進退場動的是 .mcp-cap）。
  // 角度一路延續：開／關的 click 不重抽也不回退——icon 換裝的 clip-reveal 與收回後的鉛筆都停在點擊當下的角（user「不是 0°」：
  // 用 bindArrowSpin 時沒 hover 的 click 會重抽、回退鉛筆角又常落在近 0°，看起來像歸零）
  capToggle.addEventListener('mouseenter', () => {
    toggleDeg = randomSpinAngle(toggleDeg);
    if (typeof gsap === 'undefined') { capToggle.style.transform = `rotate(${toggleDeg}deg)`; return; }
    gsap.to(capToggle, { rotation: toggleDeg, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
  });
  bar.addEventListener('pointerdown', onBarDown);
  canvas.addEventListener('pointerdown', onCanvasDown);
  window.addEventListener('pointermove', onWinMove);
  window.addEventListener('pointerup', onWinUp);
}

export function initModeColorPanel() {
  build();

  // gate 觸發：mode 切換 / overlay class / video 的 body|html style / footer 捲動 / header 載入
  window.addEventListener('theme:changed', updateVisibility);
  // 跨 1200/501 gate（旋轉大平板、開關 DevTools）：開著就瞬收（close 走開啟時那套），兩套 DOM 都歸位到當前顯隱，
  // footprint 重發（atlas/about 讀的位置跟著換）。gate 內外各自的動畫狀態不跨套延續
  window.matchMedia('(min-width: 1024px) and (min-height: 501px)').addEventListener('change', () => {
    if (isOpen) close(true);
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf([pencilBtn, cap, panel, capIcon]);
      gsap.set([pencilBtn, cap], { xPercent: wasShown ? 0 : 100 });
      gsap.set(cap, { width: CAP_H });
      gsap.set(capIcon, { clearProps: 'transform' });
      gsap.set(panel, WHEEL_HIDDEN);
    }
    cap.classList.remove('is-active');
    capIcon.className = 'icon icon-pencil';
    capToggle.setAttribute('aria-expanded', 'false');
    capPlay.tabIndex = -1;
    publishFootprint();
  });
  const mo = new MutationObserver(updateVisibility);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('header:ready', updateVisibility);

  updateOverFooter();
  updateVisibility();
}
