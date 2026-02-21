/**
 * Brand Trail Module (About Page)
 * 處理系友發展區塊的品牌 Logo 游標拖尾效果（桌面版）
 * 手機版：圖片輪播，每 1 秒自動切換，點擊切換到下一張
 */

// 品牌圖片清單（暫用佔位圖，之後替換成實際 logo 圖片）
const BRAND_IMAGES = [
  '../images/SCCD-1-4-0.jpg',
  '../images/SCCD-1-4-0.jpg',
  '../images/SCCD-1-4-0.jpg',
  '../images/SCCD-1-4-0.jpg',
  '../images/SCCD-1-4-0.jpg',
];

export function initBrandTrail() {
  initDesktopTrail();
  initMobileSlideshow();
}

// === 桌面版：游標拖尾 ===
function initDesktopTrail() {
  const brandTrailArea = document.getElementById('brand-trail-area');
  if (!brandTrailArea) return;

  let lastX = 0;
  let lastY = 0;
  const distThreshold = 80;
  const maxTrailImages = 15;
  let trailImages = [];

  brandTrailArea.addEventListener('mousemove', (e) => {
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (dist < distThreshold) return;

    lastX = e.clientX;
    lastY = e.clientY;

    if (trailImages.length >= maxTrailImages) {
      const oldestImg = trailImages.shift();
      oldestImg.remove();
    }

    const img = document.createElement('img');
    img.src = '../images/SCCD-1-4-0.jpg';
    img.classList.add('brand-trail-img');
    img.style.left = `${e.pageX}px`;
    img.style.top = `${e.pageY}px`;

    document.body.appendChild(img);
    trailImages.push(img);

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(img,
        { scale: 0.5, opacity: 1, rotation: Math.random() * 30 - 15 },
        { duration: 0.5, scale: 1, ease: 'power2.out' }
      );

      gsap.delayedCall(1, () => {
        img.remove();
        const index = trailImages.indexOf(img);
        if (index > -1) trailImages.splice(index, 1);
      });
    }
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
    currentIndex = (currentIndex + 1) % BRAND_IMAGES.length;
    slideImg.src = BRAND_IMAGES[currentIndex];
  }

  // 每 1 秒自動切換
  let timer = setInterval(showNext, 1000);

  // 點擊手動切換到下一張，並重置計時器
  slideshow.addEventListener('click', () => {
    clearInterval(timer);
    showNext();
    timer = setInterval(showNext, 1000);
  });
}
