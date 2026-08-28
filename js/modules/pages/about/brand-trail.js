import { DUR, EASE } from '../../ui/motion.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { sitePath } from '../../ui/site-base.js';
import { setupClipReveal, playClipReveal, playRevealExit } from '../../ui/scroll-animate.js';
import { loadAboutVisionImages } from './about-source.js';
/**
 * Brand Trail Module (About Page)
 * 處理系友發展區塊的游標拖尾效果（桌面版）
 * 手機版：圖片輪播，每 1 秒自動切換，點擊切換到下一張
 */

let TRAIL_IMAGES = [];

// 存活中的 trail 圖（含各自的 exit 滑出函式）：離頁換頁時要一起「依當下位置」clip-reveal 滑出，
// 而不是被 innerHTML swap 硬砍（overview trail 在 #page-content 內、desktop trail 在 body 上均涵蓋）。
const aliveTrail = new Set();

// 從 CSS variables 讀取三原色
const CSS_ACCENT_COLORS = ['--color-green', '--color-pink', '--color-blue'];
function getAccentColors() {
  const style = getComputedStyle(document.documentElement);
  return CSS_ACCENT_COLORS.map(v => style.getPropertyValue(v).trim());
}

// 滑入 4 方向藏定位（reveal 語彙：wrapper＝遮罩、img 在內滑動；±110 過衝防 dpr hairline）
const SLIDE_DIRS = [
  'translate(0, -110%)',  // 從上滑入
  'translate(0, 110%)',   // 從下滑入
  'translate(110%, 0)',   // 從右滑入
  'translate(-110%, 0)',  // 從左滑入
];

async function loadTrailImages() {
  // vision 拖尾圖優先吃後台 about_vision.hoverImages；沒上傳（空）才 fallback 畢展封面（維持原視覺）
  try {
    const visionImgs = await loadAboutVisionImages();
    if (visionImgs.length) { TRAIL_IMAGES = visionImgs; return; }
  } catch (_) { /* 落到下方 fallback */ }
  try {
    const res = await fetch(sitePath('data/degree-show.json'));
    const data = await res.json();
    const imgs = [];
    Object.values(data).forEach(entry => {
      if (entry.coverImage) imgs.push(entry.coverImage);
      if (Array.isArray(entry.images)) entry.images.forEach(src => { if (src) imgs.push(src); });
    });
    TRAIL_IMAGES = [...new Set(imgs)];
  } catch (e) {
    TRAIL_IMAGES = ['../images/Degree Show.jpg'];
  }
}

export async function initBrandTrail() {
  initOverviewHighlight(); // 先跑（不依賴 fetch），避免下面出錯就不執行
  initClassHighlight();
  initWorksHighlight();
  // 離頁時把還停在畫面上的 trail 圖一起滑出（依當下位置），await ~0.5s 讓動畫跑完再換頁
  registerPageExit(() => {
    if (!aliveTrail.size) return Promise.resolve();
    aliveTrail.forEach(item => item.exit());
    return new Promise(r => setTimeout(r, 500));
  });
  await loadTrailImages();
  initDesktopTrail();
  initOverviewTrail();
  initMobileSlideshow();
}

// Class 文字底色：每個 .class-info-panel 隨機一色，整塊文字區同色
function initClassHighlight() {
  const panels = document.querySelectorAll('.class-info-panel');
  if (!panels.length) return;
  const colors = getAccentColors();
  panels.forEach(panel => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('[data-class-hl]')).forEach(el => {
      el.style.background = color;
    });
  });
}

// Works 底色：每個 .class-works-panel 隨機一色，標題/內文同色（整塊）
function initWorksHighlight() {
  const panels = document.querySelectorAll('.class-works-panel');
  if (!panels.length) return;
  const colors = getAccentColors();
  panels.forEach(panel => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('[data-works-hl]')).forEach(el => {
      el.style.background = color;
    });
  });
}

// Overview 文字底色（套在 span 上，只有文字部份有色）
// 進退場：Vision 字卡 hero clip-reveal（整塊色卡在父 <p> 遮罩內 yPercent 升起/沉出）。
// user 2026-08-10 一致化：文字字卡走 clip-reveal（滑動+遮罩）不再用 clip-path 擦除。
// 色卡＝含色底的 [data-overview-hl]（span），父 <p> 當靜止遮罩：span 在 p 內不可插 div wrapper，
// 故直接把父 <p> 設 overflow:clip（setupClipReveal 偵測父層已 clip 就不另包 wrapper），整塊色卡在 p 內滑動。
function initOverviewHighlight() {
  const hls = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-overview-hl]')));
  if (!hls.length) return;
  const colors = getAccentColors();
  const color = colors[Math.floor(Math.random() * colors.length)];
  hls.forEach(el => { el.style.background = color; });

  if (typeof gsap === 'undefined') return;

  // 父 <p> 當遮罩（overflow-y:clip；x 放行不裁行內裝飾）→ setupClipReveal 沿用不另包 div、色卡 yPercent:100 藏起
  hls.forEach(el => {
    const p = el.parentElement;
    if (p) { p.style.overflowY = 'clip'; p.style.overflowX = 'visible'; }
  });
  setupClipReveal(hls);

  let revealed = false;
  const reveal = () => { revealed = true; playClipReveal(hls, { stagger: { each: 0.08 } }); };
  if (typeof ScrollTrigger === 'undefined') { reveal(); }
  // trigger 用父 <p>（靜止遮罩、在自然 flow）而非 hls[0]（已被 gsap.set yPercent:100 = translateY 整個高度）：
  // ScrollTrigger 依 trigger 的「變形後」位置算 start，用被下推整段高度的 span 當 trigger → start 被推到頁面
  // 捲不到的地方（文字越窄越高、下推越多）→ onEnter 永不觸發、Vision 永久藏起（<1200px 症狀根因）。
  // 父 <p> 高度=文字自然高、位置不受 child transform 影響 → 'top 88%' 在各寬度都可靠觸發。
  else ScrollTrigger.create({ trigger: hls[0].parentElement || hls[0], start: 'top 88%', once: true, onEnter: reveal });

  // 離頁退場：整塊色卡 yPercent 沉出遮罩（clip-reveal 反向）；只在已進場 + 視窗內才跑（playRevealExit 內建 viewportOnly）
  registerPageExit(() => revealed ? playRevealExit(hls, { stagger: 0.08 }) : Promise.resolve());
}

/**
 * 共用：生成一個 trail item（clip-reveal：wrapper 遮罩、img 在內 4 向滑入/滑出）
 * @param {string} imgSrc  - 圖片路徑
 * @param {number} x       - left（相對於 container）
 * @param {number} y       - top（相對於 container）
 * @param {HTMLElement} container - append 到哪個 container
 * @param {Array} registry - 用來限制數量的陣列
 */
function spawnTrailItem(imgSrc, x, y, container, registry) {
  const rot = Math.random() * 30 - 15;

  const revealDir = SLIDE_DIRS[Math.floor(Math.random() * SLIDE_DIRS.length)];
  const exitDir   = SLIDE_DIRS[Math.floor(Math.random() * SLIDE_DIRS.length)];

  // wrapper＝遮罩（overflow:hidden、承載旋轉 → 滑動跟著旋轉角、不切角）
  // 不設固定寬：absolute + width auto = shrink-to-fit 圖片實際尺寸，wrapper 跟著 img 的 max box 縮
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%) rotate(${rot}deg);
    pointer-events: none;
    z-index: 50;
    overflow: hidden;
  `;

  // max-width/height 同上限 box（保持比例）：直幅海報不會被撐很高 → 在下方位置 spawn 時
  // 不會凸到下一個 section（bg-white z-20）底下被蓋掉而像「被切到」（user 2026-06-03）
  const img = document.createElement('img');
  img.src = imgSrc;
  img.style.cssText = `
    width: auto;
    height: auto;
    max-width: 260px;
    max-height: 260px;
    display: block;
    transform: ${revealDir};
    transition: transform 0.5s cubic-bezier(0.25,0,0,1);
  `;

  wrapper.appendChild(img);
  container.appendChild(wrapper);
  registry.push(wrapper);

  // Step 1：img 滑入遮罩
  requestAnimationFrame(() => {
    img.style.transform = 'translate(0, 0)';
  });

  // 壽命到期、被擠出上限、離頁換頁共用同一組移除/滑出邏輯
  const record = {};
  aliveTrail.add(record);
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    aliveTrail.delete(record);
    wrapper.remove();
    const idx = registry.indexOf(wrapper);
    if (idx > -1) registry.splice(idx, 1);
  };
  wrapper._removeTrail = remove;  // 超過 maxItems 被擠出時走這條（同步清 aliveTrail）
  let exiting = false;
  // img 用隨機方向從當下位置滑出遮罩（clip-reveal 反向）+ 0.5s 後移除
  record.exit = () => {
    if (exiting) { return; }
    exiting = true;
    img.style.transform = exitDir;
    setTimeout(remove, 500);
  };

  // Step 2：2s 後自動滑出
  setTimeout(record.exit, 2000);
}

// === 桌面版：游標拖尾（alumni 區）===
function initDesktopTrail() {
  const brandTrailArea = document.getElementById('brand-trail-area');
  if (!brandTrailArea) return;

  let lastX = 0, lastY = 0;
  const distThreshold = 240;
  const maxItems = 10;
  let registry = [];
  let currentIndex = 0;

  brandTrailArea.addEventListener('mousemove', (e) => {
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (dist < distThreshold) return;
    lastX = e.clientX;
    lastY = e.clientY;

    if (registry.length >= maxItems) {
      const oldest = registry.shift();
      oldest._removeTrail();
    }

    const imgSrc = TRAIL_IMAGES[currentIndex];
    currentIndex = (currentIndex + 1) % TRAIL_IMAGES.length;

    spawnTrailItem(imgSrc, e.pageX, e.pageY, document.body, registry);
  });
}

// 取得（或建立）橫跨所有 section 的高 z overlay 當 trail host
// 為何不直接用 #overview-trail-container：它在 #overview section(z-10) 內，圖片往下凸出時
// 會被下一個 class section(z-20 + bg-white) 蓋掉看起來「被切」。改放到包住所有 section 的
// #about-content-wrapper（仍在 #page-content 內，SPA 換頁會被清掉）上的 z-60 overlay，
// 讓圖能畫在後續 section 之上不被遮（user 2026-06-03）
function getOverviewTrailHost(trailContainer) {
  const wrapper = trailContainer.closest('#about-content-wrapper');
  if (!wrapper) return trailContainer;  // 結構異動時 fallback 回原 container
  let overlay = wrapper.querySelector('#overview-trail-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overview-trail-overlay';
    overlay.className = 'absolute inset-0 pointer-events-none';
    overlay.style.zIndex = '60';  // 高於 class/resources/history section 的 z-20
    wrapper.appendChild(overlay);
  }
  return overlay;
}

// === Overview Section：游標拖尾（文字下方）===
function initOverviewTrail() {
  if (window.innerWidth < 768) return;

  const trailContainer = document.getElementById('overview-trail-container');
  if (!trailContainer) return;

  // 監聽 trailContainer 的父層（site-container），只在文字區內觸發
  const textArea = trailContainer.parentElement;
  if (!textArea) return;

  // host = 橫跨所有 section 的高 z overlay（見 getOverviewTrailHost），座標相對它計算
  const host = getOverviewTrailHost(trailContainer);

  let lastX = 0, lastY = 0;
  const distThreshold = 240;
  const maxItems = 10;
  let registry = [];
  let currentIndex = 0;

  textArea.addEventListener('mousemove', (e) => {
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (dist < distThreshold) return;
    lastX = e.clientX;
    lastY = e.clientY;

    if (registry.length >= maxItems) {
      const oldest = registry.shift();
      oldest._removeTrail();
    }

    // 相對座標 = clientX/Y 減去 host overlay 的 viewport 位置
    const hostRect = host.getBoundingClientRect();
    const relX = e.clientX - hostRect.left;
    const relY = e.clientY - hostRect.top;

    const imgSrc = TRAIL_IMAGES[currentIndex];
    currentIndex = (currentIndex + 1) % TRAIL_IMAGES.length;

    spawnTrailItem(imgSrc, relX, relY, host, registry);
  });
}

// === 手機版：圖片輪播 ===
function initMobileSlideshow() {
  if (window.innerWidth >= 768) return;

  const slideshow = document.getElementById('brand-slideshow');
  const slideImg = /** @type {HTMLImageElement | null} */ (document.getElementById('brand-slide-img'));
  if (!slideshow || !slideImg) return;

  let currentIndex = 0;

  function showNext() {
    currentIndex = (currentIndex + 1) % TRAIL_IMAGES.length;
    slideImg.src = TRAIL_IMAGES[currentIndex];
    slideImg.style.objectFit = 'contain';
  }

  let timer = setInterval(showNext, 1000);

  slideshow.addEventListener('click', () => {
    clearInterval(timer);
    showNext();
    timer = setInterval(showNext, 1000);
  });

  // 離開 about 頁要停掉輪播，否則 interval 持續對 detach 的 <img> 設 src，且每次重訪 about 累積一條
  registerPageCleanup(() => clearInterval(timer));
}
