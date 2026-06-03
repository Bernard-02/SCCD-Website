/**
 * Brand Trail Module (About Page)
 * 處理系友發展區塊的游標拖尾效果（桌面版）
 * 手機版：圖片輪播，每 1 秒自動切換，點擊切換到下一張
 */

let TRAIL_IMAGES = [];

// 從 CSS variables 讀取三原色
const CSS_ACCENT_COLORS = ['--color-green', '--color-pink', '--color-blue'];
function getAccentColors() {
  const style = getComputedStyle(document.documentElement);
  return CSS_ACCENT_COLORS.map(v => style.getPropertyValue(v).trim());
}

// clip-path 4方向定義
const CLIP_DIRS = [
  { from: 'inset(0 0 100% 0)', to: 'inset(0 0 0% 0)' },   // 上→下
  { from: 'inset(100% 0 0 0)', to: 'inset(0% 0 0 0)' },   // 下→上
  { from: 'inset(0 100% 0 0)', to: 'inset(0 0% 0 0)' },   // 右→左
  { from: 'inset(0 0 0 100%)', to: 'inset(0 0 0 0%)' },   // 左→右
];

async function loadTrailImages() {
  try {
    const res = await fetch('/data/degree-show.json');
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
// 進場動畫：隨機四個方向 clip-path，中英文同時
function initOverviewHighlight() {
  const hls = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-overview-hl]'));
  if (!hls.length) return;
  const colors = getAccentColors();
  const color = colors[Math.floor(Math.random() * colors.length)];
  hls.forEach(el => { el.style.background = color; });

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  // 進場 clip-path：隨機四方向（百分比單位）
  const dirs = [
    'inset(0% 0% 100% 0%)', // 下方遮住（從上展開）
    'inset(100% 0% 0% 0%)', // 上方遮住（從下展開）
    'inset(0% 100% 0% 0%)', // 右方遮住（從左展開）
    'inset(0% 0% 0% 100%)', // 左方遮住（從右展開）
  ];
  // 直接用 inline style 設初始 clipPath，確保立即生效
  const fromClips = [];
  hls.forEach(el => {
    const fromClip = dirs[Math.floor(Math.random() * dirs.length)];
    el.style.clipPath = fromClip;
    /** @type {any} */ (el.style).webkitClipPath = fromClip;
    fromClips.push(fromClip);
  });

  const first = hls[0].closest('h5') || hls[0];
  ScrollTrigger.create({
    trigger: first,
    start: 'top 88%',
    once: true,
    onEnter: () => {
      hls.forEach((el, i) => {
        gsap.fromTo(el,
          { clipPath: fromClips[i] },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.out' }
        );
      });
    },
  });
}

/**
 * 共用：生成一個 trail item（直接 clip-path 露出圖片，沒有色塊）
 * @param {string} imgSrc  - 圖片路徑
 * @param {number} x       - left（相對於 container）
 * @param {number} y       - top（相對於 container）
 * @param {HTMLElement} container - append 到哪個 container
 * @param {Array} registry - 用來限制數量的陣列
 */
function spawnTrailItem(imgSrc, x, y, container, registry) {
  const rot = Math.random() * 30 - 15;

  const revealDir = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
  const exitDir   = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];

  // wrapper：clip-path 從 hidden → shown 直接露出圖片
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
    clip-path: ${revealDir.from};
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
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
  `;

  wrapper.appendChild(img);
  container.appendChild(wrapper);
  registry.push(wrapper);

  // Step 1：wrapper 直接 clip-path 露出圖片
  requestAnimationFrame(() => {
    wrapper.style.clipPath = revealDir.to;
  });

  // Step 2：2s 後 wrapper 用隨機方向 clip-path 消失（結束動畫不變）
  setTimeout(() => {
    wrapper.style.clipPath = exitDir.from;
    setTimeout(() => {
      wrapper.remove();
      const idx = registry.indexOf(wrapper);
      if (idx > -1) registry.splice(idx, 1);
    }, 500);
  }, 2000);
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
      oldest.remove();
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
      oldest.remove();
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
}
