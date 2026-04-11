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
  await loadTrailImages();
  initDesktopTrail();
  initOverviewTrail();
  initMobileSlideshow();
}

/**
 * 共用：生成一個 trail item（圖片 + 三原色 overlay wipe，仿首頁做法）
 * @param {string} imgSrc  - 圖片路徑
 * @param {number} x       - left（相對於 container）
 * @param {number} y       - top（相對於 container）
 * @param {HTMLElement} container - append 到哪個 container
 * @param {Array} registry - 用來限制數量的陣列
 */
function spawnTrailItem(imgSrc, x, y, container, registry) {
  const colors = getAccentColors();
  const color  = colors[Math.floor(Math.random() * colors.length)];
  const rot    = Math.random() * 30 - 15;

  const revealDir = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
  const exitDir   = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];

  // wrapper：wipe 進來（色塊先出現），clip-path 從 hidden → shown
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 320px;
    transform: translate(-50%, -50%) rotate(${rot}deg);
    pointer-events: none;
    z-index: 50;
    overflow: hidden;
    clip-path: ${revealDir.from};
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
  `;

  // 底層：圖片，height: auto 讓高度自然
  const img = document.createElement('img');
  img.src = imgSrc;
  img.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
  `;

  // 上層：三原色 overlay，初始完全覆蓋，稍後 wipe 退出
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: ${color};
    pointer-events: none;
    clip-path: ${revealDir.to};
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
  `;

  wrapper.appendChild(img);
  wrapper.appendChild(overlay);
  container.appendChild(wrapper);
  registry.push(wrapper);

  // Step 1：wrapper wipe 進來（色塊完整出現）
  requestAnimationFrame(() => {
    wrapper.style.clipPath = revealDir.to;
  });

  // Step 2：0.5s 後 overlay wipe 退出（同方向），圖片露出
  setTimeout(() => {
    overlay.style.clipPath = revealDir.from;
  }, 500);

  // Step 3：2s 後 wrapper 用隨機方向 clip-path 消失（圖片跟著消失）
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

// === Overview Section：游標拖尾（文字下方）===
function initOverviewTrail() {
  if (window.innerWidth < 768) return;

  const trailContainer = document.getElementById('overview-trail-container');
  if (!trailContainer) return;

  // 監聽 trailContainer 的父層（site-container），只在文字區內觸發
  const textArea = trailContainer.parentElement;
  if (!textArea) return;

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

    // overview-trail-container 是 site-container 內的 absolute inset-0
    // 相對座標 = clientX/Y 減去 container 的 viewport 位置
    const containerRect = trailContainer.getBoundingClientRect();
    const relX = e.clientX - containerRect.left;
    const relY = e.clientY - containerRect.top;

    const imgSrc = TRAIL_IMAGES[currentIndex];
    currentIndex = (currentIndex + 1) % TRAIL_IMAGES.length;

    spawnTrailItem(imgSrc, relX, relY, trailContainer, registry);
  });
}

// === 手機版：圖片輪播 ===
function initMobileSlideshow() {
  if (window.innerWidth >= 768) return;

  const slideshow = document.getElementById('brand-slideshow');
  const slideImg = document.getElementById('brand-slide-img');
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
