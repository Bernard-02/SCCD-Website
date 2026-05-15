/* global gsap */
/**
 * Idle Standby — 無操作後進入 Atlas 待機畫面
 *
 * 概念：待機 = 蓋一張「動的 atlas」紙在當前頁上，互動全關，離開時拿掉紙、原頁原樣
 * Logo 保留在待機畫面上（浮在紙上方），其他 header 元素收起
 *
 * 實作（方案 A）：複用 initAtlas 模組，傳 root container 讓它 render 到 overlay 內
 *   - atlas 視覺、資料、動畫完全同正式 atlas 頁
 *   - body.idle-standby CSS 自帶 atlas 內部 UI 隱藏 + atlas 元素 pointer-events:none
 *   - Header items 用 clip-path inset random direction 收起（同 activities-lightbox pattern）
 *     - clip-path 在 local 座標系統 + 後 transform → header bar 的 inline rotation 不影響 clip 邊界
 *     - 比 yPercent 好：yPercent 配 rotation 視覺會位移失準
 *   - Logo 縮小與 header clip-path 收起並行（Promise.all 同時完成）
 *   - 待機時 header.zIndex 拉到 10001（高過 overlay 10000）讓 logo 浮在 atlas 之上
 *   - 離開時 cleanupAtlas + 清空 overlay，底下原頁完整保留（無 SPA 切換）
 *
 * 邊界（2b）：使用者本來在 atlas 頁時不蓋 overlay，僅切 body.idle-standby class
 *
 * 進入順序：
 *   1. set header z:10001（讓 logo 待會浮在 overlay 上）
 *   2. 並行：header clip-path 收 + logo 大→小（若大）
 *   3. add body.idle-standby
 *   4. (非 atlas 頁) mount overlay atlas → bg fade in → 星雲 fade in
 *
 * 離開順序：
 *   1. (非 atlas 頁) 星雲 fade out → bg fade out → unmount atlas
 *   2. remove body.idle-standby
 *   3. 並行：header clip-path 展 + logo 還原
 *   4. reset header z-index
 *
 * /create iframe activity 透過 postMessage 通知（parent-activity-ping.js）
 * 過場期間 isTransitioning flag 擋掉 activity reset 避免 race，結束後主動 reset 一次
 */

import { initAtlas, cleanupAtlas } from '../pages/atlas.js';

const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 分鐘
const PHASE_DURATION = 1.0;    // 星雲 / 背景 fade 每階段秒數
const HEADER_DURATION = 0.6;   // header clip-path / logo 縮放秒數（對齊 activities-lightbox）
const HEADER_STAGGER = 0.06;
const LOGO_SHRINK_THRESHOLD = 150; // logo 當前 width ≥ 此值才縮小
const LOGO_SHRUNK_SIZE = 100;
const HEADER_Z_ABOVE_OVERLAY = 10001; // overlay 是 10000，header 拉到 10001 讓 logo 浮上來

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
        <span class="anchor-nav-inner">Alumni Careers 系友職涯</span>
      </button>
      <button class="atlas-filter-btn w-fit text-left" data-filter="partners">
        <span class="anchor-nav-inner">Partners 合作單位</span>
      </button>
    </div>
    <button id="atlas-layout-btn" aria-label="切換視圖">
      <span class="atlas-layout-inner">
        <i class="fa-solid fa-list"></i>
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
let savedHeaderZ = null;
/** @type {{ el: HTMLElement, parent: Node | null, nextSibling: Node | null, style: string } | null} */
let liftedLogoData = null;

// per-element 隨機方向快取（同一輪 hide/show 一致；同 activities-lightbox pattern）
const exitDirMap = new WeakMap();

function getPageKey() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '' || path === '/index.html') return 'index';
  const last = path.split('/').pop().replace('.html', '');
  return last || 'index';
}

function isOnAtlas() {
  return getPageKey() === 'atlas';
}

// 桌面 header bars + mode-btn（不含 logo / mobile）— 同 activities-lightbox getHeaderTargets()
// atlas 頁額外加入 #atlas-filter（左上）+ #atlas-layout-btn（左下），跟 header items 一起 stagger 收起/展開
function getHeaderTargets() {
  const header = document.querySelector('#site-header header');
  if (!header) return [];
  const items = /** @type {HTMLElement[]} */ ([
    ...header.querySelectorAll(':scope > .site-container > .md\\:flex > [data-bar]'),
    header.querySelector(':scope > .site-container > .md\\:flex > #mode-btn'),
  ].filter(Boolean));

  // atlas 頁：把頁面內的兩個 btn 加入 same timeline（同 stagger / duration）
  if (isOnAtlas()) {
    const filterEl = /** @type {HTMLElement|null} */ (document.getElementById('atlas-filter'));
    const layoutBtn = /** @type {HTMLElement|null} */ (document.getElementById('atlas-layout-btn'));
    if (filterEl) items.push(filterEl);
    if (layoutBtn) items.push(layoutBtn);
  }

  return items;
}

function getLogo() {
  return /** @type {HTMLElement | null} */ (document.getElementById('header-logo'));
}

function getHeaderRoot() {
  return /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
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

async function mountStandbyAtlas() {
  const overlay = ensureOverlay();
  overlay.innerHTML = ATLAS_MAIN_HTML;
  overlay.style.pointerEvents = 'auto';

  const main = /** @type {HTMLElement|null} */ (overlay.querySelector('#atlas-main'));
  const content = /** @type {HTMLElement|null} */ (overlay.querySelector('#atlas-content'));
  if (main) main.style.opacity = '0';
  if (content) content.style.opacity = '0';

  await initAtlas({ root: overlay });
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
      ease: 'power2.inOut',
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

// Header items clip-path 收起（per-element 隨機方向，同 activities-lightbox）
function tweenHeaderClipHide(targets) {
  return new Promise(resolve => {
    if (typeof gsap === 'undefined' || !targets.length) return resolve();
    gsap.killTweensOf(targets);
    targets.forEach(el => exitDirMap.set(el, Math.random() < 0.5 ? 'top' : 'bottom'));
    gsap.fromTo(targets,
      { clipPath: 'inset(0% 0% 0% 0%)' },
      {
        clipPath: i => exitDirMap.get(targets[i]) === 'top'
          ? 'inset(0% 0% 100% 0%)'   // bottom→top 收
          : 'inset(100% 0% 0% 0%)',  // top→bottom 收
        duration: HEADER_DURATION,
        ease: 'power2.in',
        stagger: HEADER_STAGGER,
        overwrite: true,
        onComplete: resolve,
      }
    );
  });
}

function tweenHeaderClipShow(targets) {
  return new Promise(resolve => {
    if (typeof gsap === 'undefined' || !targets.length) return resolve();
    gsap.killTweensOf(targets);
    gsap.to(targets, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: HEADER_DURATION,
      ease: 'power2.out',
      stagger: HEADER_STAGGER,
      overwrite: true,
      onComplete: () => {
        // 完整還原後清掉 inline clipPath（同 activities-lightbox）
        targets.forEach(el => { el.style.clipPath = ''; });
        resolve();
      },
    });
  });
}

function tweenLogoShrink() {
  return new Promise(resolve => {
    const logo = getLogo();
    if (!logo || typeof gsap === 'undefined') return resolve();
    const w = logo.offsetWidth;
    if (w < LOGO_SHRINK_THRESHOLD) {
      savedLogoSize = null; // 不縮小，exit 也不還原
      return resolve();
    }
    savedLogoSize = w;
    gsap.to(logo, {
      width: LOGO_SHRUNK_SIZE,
      height: LOGO_SHRUNK_SIZE,
      duration: HEADER_DURATION,
      ease: 'power3.inOut',
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
      duration: HEADER_DURATION,
      ease: 'power3.inOut',
      onComplete: resolve,
    });
  });
}

function raiseHeaderZ() {
  const header = getHeaderRoot();
  if (!header) return;
  savedHeaderZ = header.style.zIndex || '';
  header.style.setProperty('z-index', String(HEADER_Z_ABOVE_OVERLAY), 'important');
}

function restoreHeaderZ() {
  const header = getHeaderRoot();
  if (!header) return;
  if (savedHeaderZ) {
    header.style.setProperty('z-index', savedHeaderZ);
  } else {
    header.style.removeProperty('z-index');
  }
  savedHeaderZ = null;
}

// 把 logo `<a>` 從 header 抽到 body 直接 child + position:fixed
// 徹底脫離 header stacking context，確保 logo 能浮在 overlay (z:10000) 之上
// （單靠 raise header z-index 可能因 ancestor stacking quirk 失效）
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
    z-index: ${HEADER_Z_ABOVE_OVERLAY} !important;
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
  isTransitioning = true;
  isStandby = true;

  // 1. 拉高 header z-index（保險）+ lift logo `<a>` 到 body root（確保浮在 overlay 上）
  raiseHeaderZ();
  liftLogoToBody();

  // 2. 並行：header items clip-path 收 + logo 縮小（若大）
  await Promise.all([
    tweenHeaderClipHide(getHeaderTargets()),
    tweenLogoShrink(),
  ]);

  // 3. body class
  document.body.classList.add('idle-standby');

  if (!isOnAtlas()) {
    // 4. mount overlay atlas
    await mountStandbyAtlas();
    // 5. 背景 fade in
    await fadeAtlasMain(1);
    // 6. 星雲 fade in
    await fadeAtlasContent(1);
  }

  isTransitioning = false;
}

async function exitStandby() {
  if (!isStandby || isTransitioning) return;
  isTransitioning = true;

  // header 進場 + atlas fade out 並行（同時開始、各自完成）
  // 此時 logo 仍 lifted 在 body root、header z 仍 raised → header 浮在 atlas 之上
  const headerInPromise = Promise.all([
    tweenHeaderClipShow(getHeaderTargets()),
    tweenLogoRestore(),
  ]);

  const atlasFadeOutPromise = (async () => {
    if (isOnAtlas()) return;
    await fadeAtlasContent(0);  // 星雲先 fade out
    await fadeAtlasMain(0);     // 背景再 fade out
    unmountStandbyAtlas();
  })();

  await Promise.all([headerInPromise, atlasFadeOutPromise]);

  // body class
  document.body.classList.remove('idle-standby');

  // atlas 已消失，這時才把 logo DOM 還原 + header z 還原
  // （若在 atlas fade out 前還原 header z，header z-50 會被 atlas z-10000 蓋住）
  restoreLogoFromBody();
  restoreHeaderZ();

  isStandby = false;
  isTransitioning = false;
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
  // 在 iframe 內不啟動（避免 generate-app 等子 iframe 跑同份程式）
  if (window.parent !== window) return;
  initialized = true;

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  events.forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  // generate-app iframe 內 activity 透過 postMessage 通知（parent-activity-ping.js）
  window.addEventListener('message', (e) => {
    if (e && e.data && e.data.idleActivity === true) resetTimer();
  });

  resetTimer();
}
