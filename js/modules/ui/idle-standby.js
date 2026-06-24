/* global gsap */
/**
 * Idle Standby — 無操作後進入 Atlas 待機畫面
 *
 * 概念：純「蓋一張紙」邏輯 — atlas overlay 在 z:10000 覆蓋整個 viewport，把 header bar 自然蓋掉；
 * logo 用 liftLogoToBody 抽到 body root + position:fixed + z:10001 浮在 atlas 之上。
 * **不動 header bars 本身**（不改 z-index、不 clip-path 收起），離開待機原頁原樣回來。
 *
 * 歷史：先前版本拉 header z 到 10001 讓 bars 浮上來、再用 clip-path 把 bars 收起（避免干擾畫面）—
 * 是繞圈做法；且 GSAP 留下的 inline clipPath + caller-side mode-btn inline clipPath 互相干擾，
 * 維護成本高。改成「不動 bars」後，bars 自然在 header 原 z-index（< overlay 10000）被蓋住。
 *
 * 實作：複用 initAtlas 模組，傳 root container 讓它 render 到 overlay 內
 *   - atlas 視覺、資料、動畫完全同正式 atlas 頁
 *   - body.idle-standby CSS 自帶 atlas 內部 UI 隱藏 + atlas 元素 pointer-events:none
 *   - Logo 縮小（若大於 threshold）
 *   - 離開時 cleanupAtlas + 清空 overlay，底下原頁完整保留（無 SPA 切換）
 *
 * 邊界（2b）：使用者本來在 atlas 頁時不蓋 overlay，僅切 body.idle-standby class
 *
 * 進入順序：
 *   1. liftLogoToBody（logo 抽到 body z:10001 浮上來）
 *   2. logo 大→小（若大）
 *   3. add body.idle-standby
 *   4. (非 atlas 頁) mount overlay atlas → bg fade in → 星雲 fade in
 *
 * 離開順序：
 *   1. (非 atlas 頁) 星雲 fade out → bg fade out → unmount atlas
 *   2. remove body.idle-standby
 *   3. logo 還原
 *   4. restoreLogoFromBody（logo 還回 header）
 *
 * 過場期間 isTransitioning flag 擋掉 activity reset 避免 race，結束後主動 reset 一次
 */

import { initAtlas, cleanupAtlas } from '../pages/atlas.js';
import { switchHeaderLogo, getStoredMode } from './theme-toggle.js';
import { DUR, EASE } from './motion.js';

const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 分鐘
const PHASE_DURATION = DUR.reveal;    // 星雲 / 背景 fade 每階段秒數
const LOGO_DURATION = 0.6;     // logo 縮放秒數
const LOGO_SHRINK_THRESHOLD = 150; // logo 當前 width ≥ 此值才縮小
const LOGO_SHRUNK_SIZE = 100;
const LIFTED_LOGO_Z = 10001;   // overlay 是 10000，lifted logo 拉到 10001 浮在 atlas 之上

const ATLAS_MAIN_HTML = `
  <section id="atlas-main">
    <div id="atlas-stage">
      <div id="atlas-zoom">
        <div id="atlas-content"></div>
      </div>
    </div>
    <aside id="atlas-detail" aria-live="polite">
      <div class="atlas-detail-name" data-atlas-detail-name></div>
      <div class="atlas-detail-desc" data-atlas-detail-desc></div>
    </aside>
    <div id="atlas-filter" aria-label="Atlas filter">
      <button class="atlas-filter-btn w-fit text-left" data-filter="faculty">
        <span class="anchor-nav-inner">Professors 歷屆教師</span>
      </button>
      <button class="atlas-filter-btn w-fit text-left" data-filter="alumni">
        <span class="anchor-nav-inner">Alumni 系友</span>
      </button>
      <button class="atlas-filter-btn w-fit text-left" data-filter="partners">
        <span class="anchor-nav-inner">Partners 合作單位</span>
      </button>
    </div>
    <button id="atlas-layout-btn" aria-label="切換視圖">
      <span class="atlas-layout-inner">
        <span class="icon icon-atlas-list"></span>
      </span>
    </button>
  </section>
`;

let timerId = null;
let isStandby = false;
let isTransitioning = false;
let initialized = false;
let atlasMounted = false;
let savedLogoSize = null;
/** @type {{ el: HTMLElement, parent: Node | null, nextSibling: Node | null, style: string } | null} */
let liftedLogoData = null;
// standby 進場前的 logoType（若是 slide-in 觸發的反色版需要記下來，exit 還原）
// null = 進場時不是反色版，exit 不還原
let savedLogoType = null;

// 進入待機時：slide-in 觸發的反色 logo 在「待機背景 = page bg」的場景下不再合理，要切回非反色版
// 待機 atlas-main 的 bg = var(--theme-bg) = 跟 page mode 同色（overlay 開時 logo 一律 'wireframe-inverse' 白）：
//   - mode1 standard：白底 → 待機白底 + 白 logo 看不見 → 切回 'standard'(黑)
//   - mode2 inverse：黑底 → 待機黑底 + 白 logo 仍 OK → 不動
//   - mode3 color：彩底 → 待機彩底 + 白看不清 → 切回 'wireframe'(黑)
function maybeRevertInverseLogo() {
  const logo = getLogo();
  if (!logo) return;
  const hasSlideIn = document.documentElement.classList.contains('has-slide-in')
    || document.body.classList.contains('lightbox-open');
  if (!hasSlideIn) {
    savedLogoType = null;
    return;
  }
  const mode = getStoredMode();
  // mode2 (inverse) 不用改：page bg 黑，反色白 logo 在待機黑底上仍可見
  if (mode === 'inverse') {
    savedLogoType = null;
    return;
  }
  const currentType = logo.dataset.logoType;
  // overlay 開時白 logo 現一律 'wireframe-inverse'（舊路徑可能還有 'inverse'，兩者都接）
  if (mode === 'standard' && (currentType === 'wireframe-inverse' || currentType === 'inverse')) {
    savedLogoType = currentType;
    switchHeaderLogo('standard');
  } else if (mode === 'color' && currentType === 'wireframe-inverse') {
    savedLogoType = currentType;
    switchHeaderLogo('wireframe');
  } else {
    savedLogoType = null;
  }
}

function restoreInverseLogo() {
  if (savedLogoType === null) return;
  switchHeaderLogo(savedLogoType);
  savedLogoType = null;
}

function getPageKey() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '' || path === '/index.html') return 'index';
  const last = path.split('/').pop().replace('.html', '');
  return last || 'index';
}

function isOnAtlas() {
  return getPageKey() === 'atlas';
}

function getLogo() {
  // 手機 viewport (<768px) 桌面 #header-logo 整塊 .hidden md:flex 在 display:none，
  // BCR 會回 0/0/0/0 害 liftLogoToBody 把 logo 釘到左上角。改抓 mobile id。
  const isMobile = window.innerWidth < 768;
  const id = isMobile ? 'header-logo-mobile' : 'header-logo';
  return /** @type {HTMLElement | null} */ (document.getElementById(id));
}

function ensureOverlay() {
  let overlay = document.getElementById('idle-standby-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'idle-standby-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

async function mountStandbyAtlas(instant) {
  const overlay = ensureOverlay();
  overlay.innerHTML = ATLAS_MAIN_HTML;
  overlay.style.pointerEvents = 'auto';

  const main = /** @type {HTMLElement|null} */ (overlay.querySelector('#atlas-main'));
  const content = /** @type {HTMLElement|null} */ (overlay.querySelector('#atlas-content'));
  if (main) main.style.opacity = '0';
  if (content) content.style.opacity = '0';

  // instant（背景分頁）：跳過 atlas intro zoom，掛上來就是定態
  await initAtlas({ root: overlay, instant });
  atlasMounted = true;
}

function unmountStandbyAtlas() {
  if (!atlasMounted) return;
  cleanupAtlas();
  const overlay = document.getElementById('idle-standby-overlay');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.style.pointerEvents = 'none';
  }
  atlasMounted = false;
}

function fadeEl(el, to, duration = PHASE_DURATION) {
  return new Promise(resolve => {
    if (!el) return resolve();
    if (typeof gsap === 'undefined') {
      el.style.opacity = String(to);
      return resolve();
    }
    gsap.to(el, {
      opacity: to,
      duration,
      ease: EASE.move,
      onComplete: resolve,
    });
  });
}

function fadeAtlasMain(to) {
  const main = document.querySelector('#idle-standby-overlay #atlas-main');
  return fadeEl(main, to);
}

function fadeAtlasContent(to) {
  const content = document.querySelector('#idle-standby-overlay #atlas-content');
  return fadeEl(content, to);
}

// 背景分頁瞬間定態：直接設 opacity:1（rAF 暫停時 gsap tween 不會跑、切回本 tab 才補播 = 不要的「切回才 fade」）
function setStandbyAtlasVisible() {
  const main = /** @type {HTMLElement|null} */ (document.querySelector('#idle-standby-overlay #atlas-main'));
  const content = /** @type {HTMLElement|null} */ (document.querySelector('#idle-standby-overlay #atlas-content'));
  if (main) main.style.opacity = '1';
  if (content) content.style.opacity = '1';
}

function tweenLogoShrink(instant) {
  return new Promise(resolve => {
    const logo = getLogo();
    if (!logo || typeof gsap === 'undefined') return resolve();
    const w = logo.offsetWidth;
    if (w < LOGO_SHRINK_THRESHOLD) {
      savedLogoSize = null; // 不縮小，exit 也不還原
      return resolve();
    }
    savedLogoSize = w;
    if (instant) { // 背景分頁：直接定大小，不 tween（rAF 暫停切回才補播）
      gsap.set(logo, { width: LOGO_SHRUNK_SIZE, height: LOGO_SHRUNK_SIZE });
      return resolve();
    }
    gsap.to(logo, {
      width: LOGO_SHRUNK_SIZE,
      height: LOGO_SHRUNK_SIZE,
      duration: LOGO_DURATION,
      ease: EASE.move,
      onComplete: resolve,
    });
  });
}

function tweenLogoRestore() {
  return new Promise(resolve => {
    const logo = getLogo();
    if (!logo || savedLogoSize === null || typeof gsap === 'undefined') return resolve();
    const target = savedLogoSize;
    savedLogoSize = null;
    gsap.to(logo, {
      width: target,
      height: target,
      duration: LOGO_DURATION,
      ease: EASE.move,
      onComplete: resolve,
    });
  });
}

// 把 logo `<a>` 從 header 抽到 body 直接 child + position:fixed + z:10001
// 徹底脫離 header stacking context，浮在 overlay (z:10000) 之上
// 純「蓋一張紙」邏輯：不動 header bars，由 atlas overlay 自然蓋掉 header（header 在原 z < 10000）
function liftLogoToBody() {
  if (liftedLogoData) return;
  const logo = getLogo();
  if (!logo) return;
  const a = /** @type {HTMLElement | null} */ (logo.closest('a'));
  if (!a) return;

  const rect = a.getBoundingClientRect();
  liftedLogoData = {
    el: a,
    parent: a.parentNode,
    nextSibling: a.nextSibling,
    style: a.getAttribute('style') || '',
  };

  a.style.cssText = `
    position: fixed !important;
    top: ${rect.top}px !important;
    left: ${rect.left}px !important;
    z-index: ${LIFTED_LOGO_Z} !important;
    margin: 0 !important;
  `;
  document.body.appendChild(a);
}

function restoreLogoFromBody() {
  if (!liftedLogoData) return;
  const { el, parent, nextSibling, style } = liftedLogoData;
  el.setAttribute('style', style);
  if (parent) {
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(el, nextSibling);
    } else {
      parent.appendChild(el);
    }
  }
  liftedLogoData = null;
}

async function enterStandby() {
  if (isStandby || isTransitioning) return;
  // 手機不進待機畫面（user 2026-06-12）；guard 放進場時點而非 init，視窗大小變了也準
  if (window.innerWidth < 768) return;
  // 背景分頁進待機：rAF 暫停＋沒人在看 → 直接定態（不 fade），使用者切回本 tab 時「已經是待機」，
  // 不是「當著面才 fade 進待機」。fade 只在停在本 tab 不動才跑。user 2026-06-24。
  const instant = document.hidden;
  isTransitioning = true;
  isStandby = true;

  // 1. slide-in 反色 logo → 還原成正常版（atlas 黑底配反色 logo 看起來不對；
  //    lift 之前先切，先用 dataset 換 Lottie 比較不會跟 fixed position 衝突）
  maybeRevertInverseLogo();

  // 2. lift logo `<a>` 到 body root z:10001（浮在即將出現的 overlay z:10000 之上）
  //    header bars 留在原 z（< 10000）由 overlay 自然蓋掉，不主動動它們
  liftLogoToBody();

  // 3. logo 縮小（若大）
  await tweenLogoShrink(instant);

  // 4. body class
  document.body.classList.add('idle-standby');

  if (!isOnAtlas()) {
    // 5. mount overlay atlas（instant 時跳 intro zoom）
    await mountStandbyAtlas(instant);
    if (instant) {
      setStandbyAtlasVisible();       // 直接顯示，不 fade
    } else {
      await fadeAtlasMain(1);         // 背景 fade in
      await fadeAtlasContent(1);      // 星雲 fade in
    }
  }

  isTransitioning = false;
}

async function exitStandby() {
  if (!isStandby || isTransitioning) return;
  isTransitioning = true;

  // logo 還原 size + atlas fade out 並行
  const logoRestorePromise = tweenLogoRestore();

  const atlasFadeOutPromise = (async () => {
    if (isOnAtlas()) return;
    await fadeAtlasContent(0);  // 星雲先 fade out
    await fadeAtlasMain(0);     // 背景再 fade out
    unmountStandbyAtlas();
  })();

  await Promise.all([logoRestorePromise, atlasFadeOutPromise]);

  // body class
  document.body.classList.remove('idle-standby');

  // 若進場時改過 slide-in 反色 logo，這裡先還原（restoreLogoFromBody 不影響 logoType）
  restoreInverseLogo();

  // atlas 已消失，把 logo DOM 還回 header（lifted 期間 logo 浮在 body root z:10001）
  restoreLogoFromBody();

  isStandby = false;
  isTransitioning = false;

  // ScrollTrigger.refresh：standby 期間 atlas overlay (fixed z:10000) 加進 body 可能改變了 layout 計算
  // 沒 refresh 的話，sticky chip / branch chip 等 ScrollTrigger 控的元素會用過時的觸發位置算 visible 狀態
  // → user 觀察到 degree-show-detail sticky title group 跟 branch chip 展開位置偏離（trigger 邊界算錯）
  // 用 window.ScrollTrigger 寫法避免在沒載 GSAP 的頁面 ReferenceError
  if (typeof window !== 'undefined' && /** @type {any} */ (window).ScrollTrigger) {
    /** @type {any} */ (window).ScrollTrigger.refresh();
  }

  // 過場期間 activity event 被 isTransitioning 擋掉沒重置 timer
  // 若使用者剛好停手不動，沒事件觸發 → 下一輪倒數不會啟動
  // 主動 reset 一次保證新一輪 IDLE_TIMEOUT 從現在起算
  resetTimer();
}

function resetTimer() {
  if (isTransitioning) return; // 過場中忽略，避免 race
  if (timerId) clearTimeout(timerId);
  if (isStandby) {
    exitStandby();
    return;
  }
  timerId = setTimeout(enterStandby, IDLE_TIMEOUT);
}

export function initIdleStandby() {
  if (initialized) return;
  initialized = true;

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  events.forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  resetTimer();
}
