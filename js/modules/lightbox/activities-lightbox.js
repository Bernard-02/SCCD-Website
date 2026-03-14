/**
 * Activities Lightbox
 * 點擊海報或 gallery 媒體，以全螢幕 lightbox 顯示大圖/影片
 * 媒體順序：海報 → videos → images
 */

let lightboxEl = null;
let mainEl = null;
let thumbsEl = null;
let prevBtn = null;
let nextBtn = null;
let iframeEl = null;

let mediaList = [];   // [{ type: 'image'|'video', src: string, thumb: string }]
let currentIndex = 0;

// ── 建立 DOM（只建一次）──────────────────────────────────────────
function ensureLightbox() {
  if (lightboxEl) return;

  lightboxEl = document.createElement('div');
  lightboxEl.id = 'activities-lightbox';
  lightboxEl.className = 'fixed inset-0 z-[300] bg-black/95 flex flex-col opacity-0 transition-opacity duration-300';
  lightboxEl.style.display = 'none';
  lightboxEl.style.paddingTop = 'var(--header-height, 80px)';

  lightboxEl.innerHTML = `
    <!-- Close -->
    <button class="alb-close absolute right-4 md:right-8 text-white p-2 transition-opacity hover:opacity-60" style="top: calc(var(--header-height, 80px) + 1rem); z-index: 10;">
      <i class="fa-solid fa-xmark text-h3"></i>
    </button>

    <!-- Main display: flex-1 填滿，py-xl 限制上下空間 -->
    <div class="flex items-center justify-center w-full px-16 py-xl flex-1 min-h-0 relative">
      <button class="alb-prev absolute left-4 text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20">
        <i class="fa-solid fa-chevron-left text-p1"></i>
      </button>
      <div class="alb-main flex items-center justify-center w-full h-full"></div>
      <button class="alb-next absolute right-4 text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 disabled:opacity-20">
        <i class="fa-solid fa-chevron-right text-p1"></i>
      </button>
    </div>

    <!-- Thumbnails -->
    <div class="alb-thumbs flex items-center justify-center gap-sm px-xl py-md flex-shrink-0 overflow-x-auto"></div>
  `;

  document.body.appendChild(lightboxEl);

  mainEl   = lightboxEl.querySelector('.alb-main');
  thumbsEl = lightboxEl.querySelector('.alb-thumbs');
  prevBtn  = lightboxEl.querySelector('.alb-prev');
  nextBtn  = lightboxEl.querySelector('.alb-next');

  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));
  lightboxEl.querySelector('.alb-close').addEventListener('click', closeLightbox);

  // 點擊背景關閉
  lightboxEl.addEventListener('click', e => {
    if (e.target === lightboxEl) closeLightbox();
  });

  // 鍵盤
  document.addEventListener('keydown', e => {
    if (lightboxEl.style.display === 'none') return;
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'Escape')     closeLightbox();
  });
}

// ── 渲染指定 index ──────────────────────────────────────────────
function renderMain(index) {
  const item = mediaList[index];
  mainEl.innerHTML = '';

  if (item.type === 'video') {
    iframeEl = document.createElement('iframe');
    iframeEl.src = item.src + '?autoplay=1';
    iframeEl.setAttribute('frameborder', '0');
    iframeEl.setAttribute('allowfullscreen', '');
    iframeEl.setAttribute('allow', 'autoplay; encrypted-media');
    iframeEl.style.cssText = 'width:100%;max-width:960px;aspect-ratio:16/9;max-height:100%;';
    mainEl.appendChild(iframeEl);
  } else {
    iframeEl = null;
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = '';
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;';
    mainEl.appendChild(img);
  }

  // 更新 thumbnails active 狀態
  thumbsEl.querySelectorAll('.alb-thumb').forEach((th, i) => {
    th.classList.toggle('outline', i === index);
    th.classList.toggle('outline-2', i === index);
    th.classList.toggle('outline-white', i === index);
    th.classList.toggle('opacity-40', i !== index);
  });

  // 更新 chevron 狀態
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === mediaList.length - 1;
  currentIndex = index;
}

// ── 切換 ────────────────────────────────────────────────────────
function navigate(dir) {
  const next = Math.max(0, Math.min(mediaList.length - 1, currentIndex + dir));
  if (next !== currentIndex) {
    if (iframeEl) iframeEl.src = '';
    renderMain(next);
  }
}

// ── 開啟 ────────────────────────────────────────────────────────
export function openLightbox(media, startIndex = 0) {
  ensureLightbox();
  mediaList = media.filter(item => item.src && item.src.trim() !== '');

  // 建立 thumbnails：固定高度，寬度隨比例
  thumbsEl.innerHTML = '';
  media.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'alb-thumb flex-shrink-0 overflow-hidden transition-opacity';
    btn.style.height = '48px';
    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = '';
    img.style.cssText = 'height:100%;width:auto;display:block;object-fit:cover;';
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      if (iframeEl) iframeEl.src = '';
      renderMain(i);
    });
    thumbsEl.appendChild(btn);
  });

  renderMain(startIndex);

  lightboxEl.style.display = 'flex';
  requestAnimationFrame(() => {
    lightboxEl.style.opacity = '1';
  });
  document.body.style.overflow = 'hidden';
}

// ── 關閉 ────────────────────────────────────────────────────────
function closeLightbox() {
  if (iframeEl) iframeEl.src = '';
  lightboxEl.style.opacity = '0';
  setTimeout(() => {
    lightboxEl.style.display = 'none';
    mainEl.innerHTML = '';
  }, 300);
  document.body.style.overflow = '';
}
