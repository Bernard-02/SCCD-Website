/**
 * Section Banner Reveal Animation
 * About 頁面各 section banner 的動畫（三張圖片 clip-path reveal 版）
 *
 * 效果：
 * - 三張圖片平行排列，進場前已固定位置
 * - 使用 clip-path inset() 從四邊隨機 reveal，每張方向不同
 * - 文字 block 使用剩餘的第四個方向 reveal
 * - 三張圖片的旋轉角度各自不同，z-index 隨機
 */

// clip-path reveal 四個方向（brand trail 同樣邏輯）
const DIRS    = ['top', 'bottom', 'left', 'right'];
const CLIP_END = 'inset(0% 0% 0% 0%)';

function getClipStart(dir) {
  switch (dir) {
    case 'top':    return 'inset(0% 0% 100% 0%)';
    case 'bottom': return 'inset(100% 0% 0% 0%)';
    case 'left':   return 'inset(0% 100% 0% 0%)';
    case 'right':  return 'inset(0% 0% 0% 100%)';
  }
}


// 文字旋轉：-6 到 6°，排除 0°
function randomTextRotation() {
  const values = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
  return values[Math.floor(Math.random() * values.length)];
}

// 圖片旋轉：-4 到 4°，確保三張角度不同
function pickThreeRotations() {
  const pool = [-4, -3, -2, -1, 1, 2, 3, 4];
  const picked = [];
  while (picked.length < 3) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    if (!picked.includes(r)) picked.push(r);
  }
  return picked;
}

// 三張圖片的隨機垂直偏移：-halfRange ~ +halfRange（vw）
// 確保有上有下
function pickVerticalOffsets(halfRange = 5) {
  const pool = [];
  for (let i = -halfRange; i <= halfRange; i++) {
    if (i !== 0) pool.push(i);
  }
  let picked;
  do {
    picked = shuffle(pool).slice(0, 3);
  } while (!picked.some(v => v > 0) || !picked.some(v => v < 0));
  return picked;
}

// shuffle 陣列（Fisher-Yates）
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 從 CSS variables 讀取三原色
function getAccentColors() {
  const style = getComputedStyle(document.documentElement);
  return [
    style.getPropertyValue('--color-green').trim(),
    style.getPropertyValue('--color-pink').trim(),
    style.getPropertyValue('--color-blue').trim(),
  ];
}

// 分配欄位：col-start 2~6，col-end 固定 13（確保文字不超出右側邊界）
function assignColumn(textBlock) {
  const colStart = Math.floor(Math.random() * 5) + 2; // 2..6
  textBlock.style.gridColumnStart = colStart;
  textBlock.style.gridColumnEnd   = 13;
}

// 隨機垂直位置：header 高度以下 ~ 65vh
function assignRandomTop(gridDiv) {
  const headerH = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height')
  ) || 80;
  const maxTop   = window.innerHeight * 0.65;
  const randomTop = headerH + Math.random() * (maxTop - headerH);
  gridDiv.style.alignContent = 'start';
  gridDiv.style.paddingTop   = `${randomTop}px`;
}

export function initSectionBannerReveal() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const accentColors = getAccentColors();

  // 隨機套用封鎖線位置／旋轉（初始 + 每次 replay 都呼叫）
  function applyRandomLayout(titleEl) {
    const rot = randomTextRotation();
    const fromRight = Math.random() < 0.5;
    const overshoot = 50; // 超出畫面的 vw
    const visibleEnd = 70 + Math.random() * 20; // 可見端到 70~90vw

    if (fromRight) {
      const leftStart = 100 - visibleEnd;
      titleEl.style.width = `calc(${overshoot}vw + ${100 - leftStart}vw)`;
      titleEl.style.marginLeft = `${leftStart}vw`;
      titleEl.style.paddingLeft = '4vw';
      titleEl.style.paddingRight = `${overshoot}vw`;
      titleEl.style.direction = 'rtl';
    } else {
      titleEl.style.width = `calc(${overshoot}vw + ${visibleEnd}vw)`;
      titleEl.style.marginLeft = `-${overshoot}vw`;
      titleEl.style.paddingLeft = `calc(${overshoot}vw + 14vw)`;
      titleEl.style.paddingRight = '';
      titleEl.style.direction = '';
    }
    titleEl.style.transform = `rotate(${rot}deg)`;
  }

  // --- Section Title Strips（class/resources/history 封鎖線風格）---
  // 不設初始顏色；顏色完全由 anchor-nav 在 active 切換時驅動
  const sectionTitles = document.querySelectorAll('[data-section-title]');
  sectionTitles.forEach((titleEl) => {
    applyRandomLayout(titleEl);

    // 初始狀態：隱藏（clip-path 全遮）
    const initDir = Math.random() < 0.5 ? 'left' : 'right';
    gsap.set(titleEl, { clipPath: getClipStart(initDir), opacity: 1 });

    const strip = titleEl.closest('.section-title-strip') || titleEl;

    // 手機版：直接顯示
    if (window.innerWidth < 768) {
      gsap.set(titleEl, { clipPath: CLIP_END });
    }

    // replay：anchor-nav 在 active 切換時呼叫（同時負責首次 reveal）
    // 每次都 random 新位置/方向 + 套新色 → reveal
    /** @type {(color?: string) => void} */
    const replay = (color) => {
      if (color) titleEl.style.background = color;
      if (window.innerWidth < 768) return;
      gsap.killTweensOf(titleEl);
      applyRandomLayout(titleEl);
      const revealDir = Math.random() < 0.5 ? 'left' : 'right';
      gsap.set(titleEl, { clipPath: getClipStart(revealDir) });
      gsap.to(titleEl, { clipPath: CLIP_END, duration: 1.0, ease: 'power3.out' });
    };
    // @ts-ignore - 掛在 DOM 元素上給 anchor-nav 取用
    strip._replayReveal = replay;
    // @ts-ignore
    titleEl._replayReveal = replay;
  });

  // --- Section Banners（有圖片的完整版，如果還有的話）---
  const banners = document.querySelectorAll('[data-section-banner]');
  if (!banners.length) return;

  banners.forEach((banner) => {
    const imgItems = Array.from(banner.querySelectorAll('.section-banner-img-item'));

    // title area 可能在 banner 外（section 的直接子元素）
    const titleArea = banner.querySelector('.section-banner-title-area') ||
                      banner.parentElement?.querySelector('.section-banner-title-area');
    const textBlock = titleArea?.querySelector('.section-banner-text-block');
    const textInner = textBlock?.querySelector('.section-banner-text-inner');
    const gridDiv   = titleArea?.querySelector('.grid-12');

    if (!imgItems.length || !textBlock) return;

    // --- 隨機值 ---
    const rotations  = pickThreeRotations();
    const zIndexes   = shuffle([1, 2, 3]);
    // 左右偏移 ±5vw，中間偏移 ±2vw（讓中間圖片更接近垂直中心）
    const topOffsets = pickVerticalOffsets(5);
    const centerPool = [-2, -1, 1, 2];
    topOffsets[1] = centerPool[Math.floor(Math.random() * centerPool.length)];
    const bgColor    = accentColors[Math.floor(Math.random() * accentColors.length)];
    const textRot    = randomTextRotation();

    // 四個方向 shuffle：前三給圖片，第四給文字
    const dirOrder   = shuffle([...DIRS]);
    const imgDirs    = dirOrder.slice(0, 3);
    const textDir    = dirOrder[3];

    // --- 套用靜態樣式（旋轉、位置、底色等）---
    // imgRotate 同時擁有 rotation + overflow:hidden + clip-path（同 brand trail wrapper）
    // 這樣 clip-path 在 local space 作用，旋轉後角落不會被裁切
    imgItems.forEach((item, i) => {
      const imgRotate = item.querySelector('.section-banner-img-rotate');
      if (imgRotate) {
        imgRotate.style.overflow = 'hidden';
        gsap.set(imgRotate, { rotation: rotations[i] });
      }
      item.style.zIndex = zIndexes[i];
      item.style.top    = `calc(50vh - 22.5vw + ${topOffsets[i]}vw)`;
    });

    assignColumn(textBlock);
    if (gridDiv)   assignRandomTop(gridDiv);
    if (textInner) textInner.style.background = bgColor;
    gsap.set(textBlock, { rotation: textRot });

    // --- 手機版：直接顯示（無動畫）---
    if (window.innerWidth < 768) {
      imgItems.forEach(item => {
        const r = item.querySelector('.section-banner-img-rotate');
        if (r) gsap.set(r, { clipPath: CLIP_END });
      });
      gsap.set(textBlock, { clipPath: CLIP_END, opacity: 1 });
      return;
    }

    // --- 桌面版：clip-path 初始 —— 套在 img-rotate（旋轉元素本身）---
    // clip-path 在 local space 作用，會跟著旋轉一起變換，角落不會被切
    imgItems.forEach((item, i) => {
      const imgRotate = item.querySelector('.section-banner-img-rotate');
      if (imgRotate) gsap.set(imgRotate, { clipPath: getClipStart(imgDirs[i]) });
    });
    gsap.set(textBlock, { clipPath: getClipStart(textDir), opacity: 1 });

    // --- ScrollTrigger：進場 ---
    ScrollTrigger.create({
      trigger: banner,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // 三張圖同時 reveal
        imgItems.forEach((item) => {
          const imgRotate = item.querySelector('.section-banner-img-rotate');
          if (imgRotate) tl.to(imgRotate, { clipPath: CLIP_END, duration: 1.2 }, 0);
        });

        // 文字同時 reveal
        tl.to(textBlock, { clipPath: CLIP_END, duration: 1.0 }, 0);
      },
    });
  });
}
