/**
 * Mode-3 背景色編輯浮動鈕
 * 只在 mode-color（mode3）＋ header mode-btn 存在時出現；lightbox / slide-in / video player 開啟、
 * 或捲到 footer、或在 /create 頁時隱藏。全域一次性初始化（掛在 <body>，跨 SPA 換頁存活，同 custom-scrollbar）。
 *
 * - 收起＝右下角圓鈕（鉛筆）、跟 header menu btn 同欄（右 container padding；底鏡像 header 鈕離頂：手機 32、真桌面 48）
 * - 點開＝圓往左拉長成 capsule，內放 create 手機版同款長條色條（indicator 直線）＋ play/pause，鉛筆換成 chevron（點它收回）
 * - 色條 drag 改 hue、play/pause 控背景色循環：全部接 theme-toggle.js 既有 export，不新增色彩邏輯
 * - 進退場＝hero clip-reveal：mask wrapper overflow:hidden + 本體 xPercent 滑動（DUR.medium；
 *   進出同 EASE.enter——出場用 power3.in 起步慢會顯拖，見 feedback_trigger_hide_ease_out_not_in）
 * - 全尺寸同一套（user 2026-10-29「手機跟桌面對齊」；原 <1024 的鉛筆方鈕＋色環面板已刪）：尺寸差只在 CSS --mcp-h
 *   （真桌面 48／其餘 44，mode-color-panel.css），JS 讀它算 capsule 寬
 */
import { DUR, EASE } from './motion.js';
import { clipRevealIconSwap, ensureIconClipWrap, revealHidden } from './scroll-animate.js';
import { randomSpinAngle } from './arrow-spin.js';
import { setColorHue, getColorHue, startSiteColorLoop, stopSiteColorLoop, isColorLoopRunning } from './theme-toggle.js';

const isDesk = () => window.matchMedia('(min-width: 1024px) and (min-height: 501px)').matches;
// 圓鈕直徑＝capsule 高：CSS --mcp-h（真桌面 48／其餘 44，同 header mode/menu 鈕）；展開寬＝左留白 20 + 色條 160 + 17 + play 20 + chevron 格
//（css .mcp-cap-row 同步；四段間距推導見該處）
const capH = () => parseFloat(getComputedStyle(cap).getPropertyValue('--mcp-h')) || 48;
const capW = () => capH() + 217;
const capBottom = () => isDesk() ? 48 : 32;   // .mcp-cap-mask bottom（css 同步）
const ICON_SWAP = 0.4;   // chevron clipRevealIconSwap 每半段秒數；色條/play 進退場也用同長度
// 色條／play icon 各自四向隨機進退場（user 2026-10-01，同 clipRevealIconSwap 四向）；±110＝整條真的出遮罩
// （色條遮罩外擴 1px 給 indicator，±100 會在邊上留一條 1px）
const pickRevealDirs = () => capReveal.map(() => revealHidden());

let root, cap, capToggle, capIcon, capPlay, playIcon, bar, barTrack, barInd, barIndWrap, capReveal;
let capColorTween = null;   // 收起時底色 active→inactive 的補間（open 要殺掉＋清 inline）
let isOpen = false;
let dragging = false;
let redrawRAF = null;
let overFooter = false;
let scrollScheduled = false;
let toggleDeg = 0;    // 鉛筆格目前的目標角（讀 GSAP 現值會拿到補間中間值）

// 色條直線 indicator：hue 0~360 線性對到整條寬（含圓角端，0/360 都是紅）。wrap 走 create 手機 bar 的「循環繪製」：
// 主線滑出右緣多少、複本就從左緣進來多少（複本永遠在主線的另一側 ±100%），hue 359.9→0 那一幀主線位置＝複本位置
// ＝無縫接手，不再「到右邊直接跳回左邊」（user 2026-09-29）。.mcp-bar overflow:hidden 負責裁切出界部分。
function drawBar() {
  const pct = (((getColorHue() % 360) + 360) % 360) / 3.6;
  barInd.style.left = `${pct}%`;
  barIndWrap.style.left = `${pct >= 50 ? pct - 100 : pct + 100}%`;
}

function redrawLoop() {
  if (!isOpen) return;
  drawBar();
  redrawRAF = requestAnimationFrame(redrawLoop);
}

// 點擊（tap）→ indicator 從當前 hue 線性 tween 到點的顏色（user 2026-07-15）：
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
// 直線 indicator 跨 wrap 會兩端跳 → 線性直達不走最短弧（同 create 手機 bar）
function tweenHueTo(target) {
  const cur = ((getColorHue() % 360) + 360) % 360;
  const proxy = { h: cur };
  killHueTween();
  hueTween = gsap.to(proxy, {
    h: target, duration: DUR.base, ease: EASE.enter,
    onUpdate: () => setColorHue(proxy.h),
    onComplete: () => { hueTween = null; },
  });
}
function onBarDown(e) {
  dragging = true;
  downX = e.clientX; downY = e.clientY;
  if (typeof gsap !== 'undefined') tweenHueTo(barHue(e));
  else setColorHue(barHue(e));
  e.preventDefault();
}
function onWinMove(e) {
  if (!dragging) return;
  // 還在 tween 中且位移未超過閾值 → 視為點擊的微抖，不打斷 tween
  if (hueTween && Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_THRESHOLD) return;
  killHueTween();
  setColorHue(barHue(e));
}
function onWinUp() { dragging = false; }

// #atlas-detail（星雲 hover 說明卡）／about 圖例避讓：發佈圓鈕/capsule 佔用的視窗底高度與右側寬度
//（atlas.css / about-structure.css 讀 --mcp-footprint／--mcp-footprint-x）。
function publishFootprint() {
  document.body.style.setProperty('--mcp-footprint', (capBottom() + capH()) + 'px');
  // 右 container padding + 寬（留 calc 給 CSS 解，免假設 1rem=16px）
  document.body.style.setProperty('--mcp-footprint-x', `calc(var(--container-padding) + ${isOpen ? capW() : capH()}px)`);
}

// running → 顯示 pause（點了會停）；paused → 顯示 play
const playIconClass = () => `icon ${isColorLoopRunning() ? 'icon-pause' : 'icon-play'}`;
function onPlayClick(e) {
  e.stopPropagation();
  if (isColorLoopRunning()) stopSiteColorLoop(); else startSiteColorLoop();
  clipRevealIconSwap(playIcon, playIconClass(), { duration: ICON_SWAP });   // ▶／❚❚ 換圖＝clip-reveal（user 2026-10-26，同 chevron）
}

/* ── open / close ── */
function open() {
  if (isOpen) return;
  if (!shouldShow()) return;   // 滑出收起的 0.5s 窗口內圓鈕仍可點——gate 中不開
  isOpen = true;
  publishFootprint();   // 展開 → 說明卡讓位
  playIcon.className = playIconClass();
  redrawLoop();
  capPlay.tabIndex = 0;   // 展開才可 Tab 到（收起時 play 在圓外被裁、看不見）
  // 圓往左拉長（mask right 錨定、row 靠右固定寬 → 長出來的部分由右往左露出色條/play）；鉛筆換 chevron
  // 先殺 width：收起那支帶 delay、還沒開跑的縮寬 tween 'auto' 抓不到，不殺＝收起 0.4s 內重開會被它縮回去
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(cap, 'width');
    gsap.to(cap, { width: capW(), duration: DUR.medium, ease: EASE.enter, overwrite: 'auto' });
  }
  else cap.style.width = capW() + 'px';
  if (capColorTween) { capColorTween.kill(); capColorTween = null; gsap.set(cap, { clearProps: 'backgroundColor,color' }); }
  cap.classList.remove('no-hover');
  cap.classList.add('is-active');   // 展開中＝反色（css .mcp-cap.is-active）
  clipRevealIconSwap(capIcon, 'icon icon-chevron-right', { duration: ICON_SWAP });
  // 時序（user 2026-09-29）：capsule 長＋chevron 換入（0→2×ICON_SWAP）→ 之後色條＋play icon 才進場；
  // fromTo 立即套起點＝前段期間兩者已藏在各自貼身遮罩下；各自四向隨機（user 2026-10-01）
  if (typeof gsap !== 'undefined') {
    const from = pickRevealDirs();
    gsap.fromTo(capReveal, { xPercent: i => from[i].xPercent, yPercent: i => from[i].yPercent },
      { xPercent: 0, yPercent: 0, duration: ICON_SWAP, ease: EASE.enterSoft, delay: ICON_SWAP * 2, overwrite: true, clearProps: 'transform' });
  }
  capToggle.setAttribute('aria-expanded', 'true');
  // 下一 tick 才綁 outside-close，避免開啟的那一下 pointerdown 立刻關回去
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}
// opts.pencilReturn=false：gate 藏起整層時用——收完圓鈕不回場（整顆滑出遮罩，下次 show 由 updateVisibility 滑入）；
// opts.onDone：收完後回呼（gate 藏起用來 display:none）
function close(instant, opts = {}) {
  if (!isOpen) return;
  const pencilReturn = opts.pencilReturn !== false;
  isOpen = false;
  publishFootprint();   // 收回圓鈕 → 說明卡下移
  document.removeEventListener('pointerdown', onOutside, true);
  if (redrawRAF) { cancelAnimationFrame(redrawRAF); redrawRAF = null; }
  // 收完清 inline width＝回 CSS var（跨 44/48 gate 不殘留舊尺寸）
  const finish = () => {
    if (typeof gsap !== 'undefined') gsap.set(cap, { clearProps: 'width' }); else cap.style.width = '';
    if (opts.onDone) opts.onDone();
  };
  capToggle.setAttribute('aria-expanded', 'false');
  capPlay.tabIndex = -1;
  if (instant || typeof gsap === 'undefined') {
    cap.classList.remove('is-active');
    if (typeof gsap !== 'undefined') gsap.killTweensOf(capReveal);   // 還在等 delay 的 reveal 別在收合後升起
    capIcon.className = 'icon icon-pencil';
    if (typeof gsap !== 'undefined') gsap.set(cap, { xPercent: pencilReturn ? 0 : 110 });
    finish(); return;
  }
  // 展開的反序（user 2026-09-29）：色條＋play icon 先收進遮罩（各自四向隨機）→ 收完 chevron 才換回鉛筆＋capsule 縮
  const to = pickRevealDirs();
  gsap.to(capReveal, { xPercent: i => to[i].xPercent, yPercent: i => to[i].yPercent, duration: ICON_SWAP, ease: EASE.enterSoft, overwrite: true });
  clipRevealIconSwap(capIcon, 'icon icon-pencil', { duration: ICON_SWAP, delay: ICON_SWAP });
  // 底色跟下面縮寬同拍（同 delay／長／曲線）從 active 漸變回 inactive（user 2026-10-26：原本鉛筆出現那拍才閃過去）。
  // inline 蓋過 :hover＝點 chevron 收、游標還在圓上也照樣變；收完到游標離開前不吃 hover（.no-hover），免得清 inline 又閃回 hover 色。
  // 收到一半又 open → open 殺掉這支、清 inline
  const cs = getComputedStyle(cap);
  cap.classList.add('no-hover');
  capColorTween = gsap.to(cap, {
    backgroundColor: cs.getPropertyValue('--theme-fg').trim() || '#000',
    color: cs.getPropertyValue('--theme-fg-inverse').trim() || '#fff',
    duration: DUR.medium, ease: EASE.enter, delay: ICON_SWAP,
    onComplete: () => { capColorTween = null; cap.classList.remove('is-active'); gsap.set(cap, { clearProps: 'backgroundColor,color' }); },
  });
  // 收回圓；gate 藏起（pencilReturn=false）＝收完再整顆滑出遮罩
  // 收完才判：收的途中 gate 又翻回 show（捲到 footer 又立刻捲回）＝updateVisibility 已把圓滑回，別再把它送出遮罩
  gsap.to(cap, { width: capH(), duration: DUR.medium, ease: EASE.enter, delay: ICON_SWAP, overwrite: 'auto', onComplete: () => {
    if (pencilReturn || wasShown) finish();
    else gsap.to(cap, { xPercent: 110, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto', onComplete: finish });
  } });
}
function onOutside(e) {
  if (!cap.contains(e.target)) close(false);
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
// 圓鈕顯隱（user 2026-07-15：footer 捲到也要收起動畫，不能直接跳不見）：所有 gate 轉換一律
// 滑動收展（gsap.to 從當下位置接、快速跨 footer 閾值來回也順；'auto'＝只接管 xPercent、不殺進行中的 width 收合）。
// lightbox/slide-in 由 CSS !important 即時硬藏（overlay 蓋住時不該看到滑出過程）。
// theme:changed 在 color loop 中 ~5Hz 重發，靠 wasShown 不變 early return 去重。
let wasShown = false;
function updateVisibility() {
  const show = shouldShow();
  if (show === wasShown) return;
  wasShown = show;

  if (show) {
    root.style.display = 'block';
    if (typeof gsap !== 'undefined') gsap.to(cap, { xPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto' });
    else cap.style.transform = '';
    return;
  }

  if (isOpen) {
    // 開著被 gate（如捲到 footer）：先收 capsule、收完整顆滑出才藏整層（user 2026-07-15）
    close(typeof gsap === 'undefined', {
      pencilReturn: false,
      onDone: () => { if (!wasShown) root.style.display = 'none'; },
    });
    return;
  }
  if (typeof gsap !== 'undefined') {
    gsap.to(cap, {
      xPercent: 110, duration: DUR.medium, ease: EASE.enter, overwrite: 'auto',
      // 動畫期間若又翻回 show（快速捲回），onComplete 別把剛 reveal 的層藏掉
      onComplete: () => { if (!wasShown) root.style.display = 'none'; },
    });
  } else {
    root.style.display = 'none';
  }
}

// footer 判準（user 2026-07-15 修正）：不能「footer 露出 1px 就藏、完全離開視窗才回來」——
// 圓鈕佔視窗底 32~96px 帶，footer 剛探頭根本沒碰到它，捲回 main 時要等 footer 全離場才回來＝太晚。
// 改成 footer 頂緣「進到圓鈕區附近」才算 over：捲下去 footer 逼近圓鈕才收、捲回 footer 一離開那帶就回場。
const FOOTER_HIDE_GAP = 64;   // 圓鈕帶的中段：footer 蓋掉視窗底 64px 時開始算 over
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
    <div class="mcp-cap-mask">
      <div class="mcp-cap" role="group" aria-label="背景色 Background colour">
        <div class="mcp-cap-row">
          <div class="mcp-bar-mask"><div class="mcp-bar" aria-hidden="true"><div class="mcp-bar-track"><span class="mcp-bar-ind"></span><span class="mcp-bar-ind mcp-bar-ind--wrap"></span></div></div></div>
          <button class="mcp-cap-play" type="button" aria-label="播放 / 暫停 背景色循環 Play / pause">
            <span class="icon icon-play" aria-hidden="true"></span>
          </button>
          <!-- 鉛筆 icon 走後台 site_icons（key: pencil）＋本地 website-icons/pencil.svg fallback（2026-09-16 起，CMS 掛也不空鈕） -->
          <button class="mcp-cap-toggle" type="button" aria-label="編輯背景色 Edit background colour" aria-expanded="false">
            <span class="icon icon-pencil" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  cap = /** @type {HTMLElement} */ (root.querySelector('.mcp-cap'));
  capToggle = root.querySelector('.mcp-cap-toggle');
  capIcon = capToggle.querySelector('.icon');
  bar = root.querySelector('.mcp-bar');
  barTrack = root.querySelector('.mcp-bar-track');
  barInd = root.querySelector('.mcp-bar-ind:not(.mcp-bar-ind--wrap)');
  barIndWrap = root.querySelector('.mcp-bar-ind--wrap');   // wrap 進場複本（drawBar 定位）
  capPlay = /** @type {HTMLButtonElement} */ (root.querySelector('.mcp-cap-play'));
  capPlay.tabIndex = -1;
  playIcon = capPlay.querySelector('.icon');
  ensureIconClipWrap(playIcon);   // play icon 貼身遮罩（色條的在 HTML .mcp-bar-mask）
  capReveal = [bar, playIcon];

  drawBar();   // 初始 indicator 位置

  // 圓鈕初始藏起（滑出遮罩外）：用 gsap xPercent（同 tween 的分量）；110 不用 100＝貼遮罩邊會留 1px 殘線
  if (typeof gsap !== 'undefined') gsap.set(cap, { xPercent: 110 });
  else cap.style.transform = 'translateX(110%)';

  publishFootprint();   // 初始＝收起圓鈕的 footprint（供 atlas 說明卡讓位）

  capPlay.addEventListener('click', onPlayClick);
  capToggle.addEventListener('click', () => (isOpen ? close(false) : open()));
  cap.addEventListener('pointerleave', () => cap.classList.remove('no-hover'));   // 收起後游標離開才恢復 hover 反色（見 close）
  // 鉛筆／chevron 格 hover 抽角（user 2026-09-29，全站 −4~+6、離開保持）：轉這一格（收起時＝圓鈕本身，圓轉了看不出＝轉 icon），
  // 不轉整顆 .mcp-cap——展開成 capsule 一歪兩端就被 .mcp-cap-mask 的 overflow 裁掉。GSAP rotation（mode3 下 CSS transition 不可靠）；
  // 這格沒有別的 GSAP transform（icon 換裝動的是內層 .icon、進退場動的是 .mcp-cap）。
  // 角度一路延續：開／關的 click 不重抽也不回退——icon 換裝的 clip-reveal 與收回後的鉛筆都停在點擊當下的角（user「不是 0°」：
  // 用 bindArrowSpin 時沒 hover 的 click 會重抽、回退鉛筆角又常落在近 0°，看起來像歸零）。觸控 tap 也會發 mouseenter＝每點換角（同手機 header 鈕）
  capToggle.addEventListener('mouseenter', () => {
    toggleDeg = randomSpinAngle(toggleDeg);
    if (typeof gsap === 'undefined') { capToggle.style.transform = `rotate(${toggleDeg}deg)`; return; }
    gsap.to(capToggle, { rotation: toggleDeg, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
  });
  bar.addEventListener('pointerdown', onBarDown);
  window.addEventListener('pointermove', onWinMove);
  window.addEventListener('pointerup', onWinUp);
}

export function initModeColorPanel() {
  build();

  // gate 觸發：mode 切換 / overlay class / video 的 body|html style / footer 捲動 / header 載入
  window.addEventListener('theme:changed', updateVisibility);
  // 跨 1024/501 gate（旋轉大平板、開關 DevTools）：開著就瞬收（width 回 CSS var＝44↔48 自己換），footprint 重發（atlas/about 讀的位置跟著換）
  window.matchMedia('(min-width: 1024px) and (min-height: 501px)').addEventListener('change', () => {
    if (isOpen) close(true);
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
