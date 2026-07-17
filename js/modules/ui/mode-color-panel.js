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
 */
import { DUR, EASE } from './motion.js';
import { setColorHue, getColorHue, startSiteColorLoop, stopSiteColorLoop, isColorLoopRunning } from './theme-toggle.js';

// 手機直向：整個面板白框以 faculty 卡片牆縮圖寬為基準再乘 PANEL_SCALE（每欄 = 50vw − 36，
// container-padding 24 + gap 24；上限 200＝卡片上限）。白框 = 色環 + 2×16 padding，故色環 = 白框 − 32。
// 桌面/橫向 ≥768 維持 72（見 CLAUDE.md landscape gate）。canvas 是點陣，改大要連 WHEEL 一起改讓 buffer 跟著長，純 CSS 放大會糊
const PANEL_SCALE = 0.95;   // 面板整體大小微調鈕：要再大/小改這個數
const WHEEL = window.innerWidth < 768
  ? Math.round(Math.min(200, window.innerWidth * 0.5 - 36) * PANEL_SCALE) - 32
  : 72;   // 色環尺寸，桌面同 create
const DPR = Math.min(window.devicePixelRatio || 1, 3);

let root, pencilBtn, panel, panelMask, canvas, ctx, playBtn, playIcon;
let ringCanvas = null;               // 靜態色環預繪（hue 環不變，畫一次）
let isOpen = false;
let dragging = false;
let redrawRAF = null;
let overFooter = false;
let scrollScheduled = false;
let wheelRot = 0;   // box 隨機微傾角（deg），每次開啟重擲；掛 panel mask 的 CSS rotation，drag 角度要扣回

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

/* ── 靜態色環預繪（360 段弧，同 create drawColorRing 幾何）── */
function buildRing() {
  ringCanvas = document.createElement('canvas');
  ringCanvas.width = WHEEL * DPR;
  ringCanvas.height = WHEEL * DPR;
  const rc = ringCanvas.getContext('2d');
  rc.scale(DPR, DPR);
  const cx = WHEEL / 2, cy = WHEEL / 2;
  const outer = WHEEL * 0.49, inner = outer * 0.54;
  const arcR = (outer + inner) / 2;
  rc.lineWidth = outer - inner;
  rc.lineCap = 'butt';               // SQUARE：段與段不留縫
  for (let a = 0; a < 360; a++) {
    rc.beginPath();
    rc.strokeStyle = `rgb(${hsbToRgb(a, 80, 100).join(',')})`;
    const start = (a - 90 - 0.5) * Math.PI / 180;   // 從頂部順時針，兩端各 +0.5 重疊防縫
    const end = (a - 90 + 1.5) * Math.PI / 180;
    rc.arc(cx, cy, arcR, start, end);
    rc.stroke();
  }
}

function drawWheel() {
  const cx = WHEEL / 2, cy = WHEEL / 2;
  const outer = WHEEL * 0.49, inner = outer * 0.54;
  const hue = getColorHue();
  const shade = hueIsLight(hue) ? '#fff' : '#000';   // 對比 panel 底（=var(--theme-fg) 純黑/白）
  ctx.clearRect(0, 0, WHEEL, WHEEL);
  ctx.drawImage(ringCanvas, 0, 0, WHEEL, WHEEL);   // 環畫正的；整個 wheel box 的旋轉由 CSS transform 做（見 open）
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = shade;
  ctx.beginPath(); ctx.arc(cx, cy, outer, 0, Math.PI * 2); ctx.stroke();  // 外圈
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.stroke();  // 內圈
  const ang = (hue / 360) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
  ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
  ctx.stroke();
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
function tweenHueTo(target) {
  const cur = ((getColorHue() % 360) + 360) % 360;
  const delta = ((target - cur + 540) % 360) - 180;   // 最短路徑 (-180, 180]
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
  downX = e.clientX; downY = e.clientY;
  if (typeof gsap !== 'undefined') tweenHueTo(pointerHue(e));
  else setColorHue(pointerHue(e));
  e.preventDefault();
}
function onWinMove(e) {
  if (!dragging) return;
  // 還在 tween 中且位移未超過閾值 → 視為點擊的微抖，不打斷 tween
  if (hueTween && Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_THRESHOLD) return;
  killHueTween();
  setColorHue(pointerHue(e));
}
function onWinUp() { dragging = false; }

function syncPlayIcon() {
  // running → 顯示 pause（點了會停）；paused → 顯示 play
  playIcon.className = `icon ${isColorLoopRunning() ? 'icon-pause' : 'icon-play'}`;
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
const HANDOFF_DELAY = 0.15;   // 接力延遲：先走者讓位、後手才進場（觀感上的先後呼應）

function open() {
  if (isOpen) return;
  if (!shouldShow()) return;   // 滑出收起的 0.5s 窗口內鉛筆仍可點——gate 中不開
  isOpen = true;
  // 每次開啟隨機微傾「整個 box」：|角| ∈ [1,4]°、隨機正負（排除 0，保證看得出傾斜）
  wheelRot = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3);
  root.classList.add('mcp-open');
  syncPlayIcon();
  redrawLoop();
  if (typeof gsap !== 'undefined') {
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
  document.removeEventListener('pointerdown', onOutside, true);
  if (redrawRAF) { cancelAnimationFrame(redrawRAF); redrawRAF = null; }
  const finish = () => {
    root.classList.remove('mcp-open');
    if (typeof gsap !== 'undefined') {
      gsap.set(panelMask, { clearProps: 'transform' });
      gsap.set(pencilBtn, { xPercent: pencilReturn ? 0 : 100 });
      gsap.set(panel, WHEEL_HIDDEN);   // wheel 回藏起態（遮罩左側外）
    } else {
      panelMask.style.transform = '';
      pencilBtn.style.transform = pencilReturn ? '' : 'translateX(100%)';
      panel.style.transform = 'translateX(calc(100% + 48px))';
    }
    if (opts.onDone) opts.onDone();
  };
  if (instant || typeof gsap === 'undefined') { finish(); return; }
  // 反向接力：wheel 先往左滑回、鉛筆延遲回來（pencilReturn=false 時不回）
  gsap.to(panel, { ...WHEEL_HIDDEN, duration: DUR.medium, ease: EASE.enter, overwrite: true, onComplete: finish });
  if (pencilReturn) {
    gsap.fromTo(pencilBtn, { xPercent: 100 }, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true, delay: HANDOFF_DELAY });
  }
}
function onOutside(e) {
  if (!panel.contains(e.target)) close(false);
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
  if (document.documentElement.classList.contains('has-slide-in')) return false;
  const vid = document.getElementById('video-player-overlay');
  if (vid && vid.style.display === 'flex') return false;                // 自架 video player（無 class，看 inline display）
  if (overFooter) return false;
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
    if (typeof gsap !== 'undefined') {
      gsap.to(pencilBtn, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true });
    } else {
      pencilBtn.style.transform = '';
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
        <i class="fa-solid fa-pencil" aria-hidden="true"></i>
      </button>
    </div>
    <div class="mcp-panel-mask">
      <div class="mcp-panel" role="dialog" aria-label="背景色 Background colour">
        <div class="mcp-wheel-wrap">
          <canvas class="mcp-wheel" width="${WHEEL * DPR}" height="${WHEEL * DPR}"></canvas>
          <button class="mcp-play" type="button" aria-label="播放 / 暫停 背景色循環 Play / pause">
            <span class="icon icon-play" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  pencilBtn = root.querySelector('.mcp-pencil');
  panel = root.querySelector('.mcp-panel');
  panelMask = root.querySelector('.mcp-panel-mask');
  canvas = root.querySelector('.mcp-wheel');
  playBtn = root.querySelector('.mcp-play');
  playIcon = playBtn.querySelector('.icon');
  ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

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

  buildRing();
  drawWheel();

  // 面板初始藏起（滑出遮罩左側外）：必須用 gsap xPercent（同 tween 的分量）；CSS translate% 會被
  // gsap 解析成 px 的 x 分量、跟 xPercent 疊加 → 開場後殘留偏移（實測 x=104 卡死）
  if (typeof gsap !== 'undefined') gsap.set(panel, WHEEL_HIDDEN);
  else panel.style.transform = 'translateX(calc(100% + 48px))';

  pencilBtn.addEventListener('click', open);
  playBtn.addEventListener('click', onPlayClick);
  canvas.addEventListener('pointerdown', onCanvasDown);
  window.addEventListener('pointermove', onWinMove);
  window.addEventListener('pointerup', onWinUp);
}

export function initModeColorPanel() {
  build();

  // gate 觸發：mode 切換 / overlay class / video 的 body|html style / footer 捲動 / header 載入
  window.addEventListener('theme:changed', updateVisibility);
  const mo = new MutationObserver(updateVisibility);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('header:ready', updateVisibility);

  updateOverFooter();
  updateVisibility();
}
