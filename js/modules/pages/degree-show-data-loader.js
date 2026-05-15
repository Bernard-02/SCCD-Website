/* global gsap, ScrollTrigger */
/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

import { initDegreeShowGallery } from './degree-show-gallery.js';
import { initHeroAnimation } from './hero-animation.js';

export async function loadDegreeShowList() {
  return loadDegreeShowListInto('degree-show-list');
}

export async function loadDegreeShowListInto(containerId) {
  try {
    const response = await fetch('/data/degree-show.json');
    const data = await response.json();
    const container = document.getElementById(containerId);

    if (!container) return;

    const years = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // Sort years descending
    const colors = ['#FF448A', '#00FF80', '#26BCFF'];

    years.forEach((year, idx) => {
      const item = data[year];
      const color = colors[idx % colors.length];
      const html = `
        <a href="/degree-show-detail?year=${year}" class="grid-12 items-start degree-show-card" style="--card-color: ${color}">
          <div class="col-span-12 md:col-start-1 md:col-span-1 mb-sm md:mb-0">
            <h5>${year}</h5>
          </div>
          <div class="degree-show-card-content col-span-12 md:col-start-2 md:col-span-11 p-[6px] ml-lg transition-colors duration-fast">
            <div class="degree-show-img-wrapper overflow-hidden mb-md">
              <img src="${item.coverImage}" alt="Degree Show ${year}" loading="lazy" class="degree-show-img w-full object-cover">
            </div>
            <h5 class="mt-md">${item.title_en ? item.title_en : item.title}${item.title_en ? `<br><span>${item.title}</span>` : ''}</h5>
          </div>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', html);
      // 插入後立即設初始隱藏狀態，避免 rAF 前的一幀閃現
      if (typeof gsap !== 'undefined') {
        gsap.set(/** @type {HTMLElement} */ (container.lastElementChild), { y: 40, autoAlpha: 0 });
      }
    });

    // Hover：accent 底色套在 content div，觸發範圍限縮到圖片 wrapper（桌面版）
    if (window.innerWidth >= 768) {
      container.querySelectorAll('.degree-show-card').forEach(card => {
        const content = /** @type {HTMLElement | null} */ (card.querySelector('.degree-show-card-content'));
        const imgWrapper = card.querySelector('.degree-show-img-wrapper');
        const color = getComputedStyle(card).getPropertyValue('--card-color').trim();
        if (!imgWrapper || !content) return;
        imgWrapper.addEventListener('mouseenter', () => { content.style.backgroundColor = color; });
        imgWrapper.addEventListener('mouseleave', () => { content.style.backgroundColor = ''; });
      });
    }

    // 卡片整體 scroll-triggered 進場（y + autoAlpha）
    // 不用 yPercent/clip-reveal：圖片 lazy load 時高度為 0，yPercent:100 = translateY(0) 無法隱藏
    // 用 ScrollTrigger.batch 統一批次處理（含 stagger），避免 per-card create + once:true 在面板切換時錯過
    // delay 0.8s 讓上方 description + search bar 的 list-reveal-row 動畫（duration 0.6 + stagger 0.1）先跑完
    requestAnimationFrame(() => {
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
      const cards = [...container.querySelectorAll('.degree-show-card')];
      if (!cards.length) return;
      ScrollTrigger.refresh();
      ScrollTrigger.batch(cards, {
        start: 'top 90%',
        onEnter: /** @param {HTMLElement[]} batch */ batch => {
          gsap.to(batch, {
            y: 0,
            autoAlpha: 1,
            duration: 0.7,
            delay: 0.8,
            ease: 'power3.out',
            stagger: 0.15,
            overwrite: true,
            clearProps: 'transform,opacity,visibility',
          });
        },
      });
    });
  } catch (error) {
    console.error('Error loading degree show data:', error);
  }
}

export async function loadDegreeShowDetail() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');

  if (!year) {
      window.location.href = '404.html';
      return;
  }

  try {
    const response = await fetch('/data/degree-show.json');
    const degreeShowData = await response.json();
    const data = degreeShowData[year];
    const years = Object.keys(degreeShowData).sort((a, b) => Number(b) - Number(a));

    if (data) {
      document.title = `Degree Show ${year} - SCCD`;

      // Text Content（hero chips：年份 + 英文名 + 中文名）
      const titleEl = document.getElementById('text-title');
      const titleEnEl = document.getElementById('text-title-en');
      const yearEl = document.getElementById('text-year');
      const descEnEl = document.getElementById('text-desc-en');
      const descCnEl = document.getElementById('text-desc-cn');

      if (titleEl) titleEl.textContent = data.title;
      if (titleEnEl) titleEnEl.textContent = data.title_en || '';
      if (yearEl) yearEl.textContent = year;
      if (descEnEl) descEnEl.textContent = data.descEn;
      if (descCnEl) descCnEl.textContent = data.descCn;

      // Hero 動畫必須在文字填入後才呼叫，否則會 wrap 並動畫空元素，clearProps 後文字才靜態出現
      // section 上的 [data-hero-title-last] 會讓 hero-animation 改用「subtitles 先 → title 後」的順序
      initHeroAnimation();

      // Events 列表（時間 / 活動 / 地點 / 城市 — 1:2:2:1）：data.events 不存在或空陣列 → 整塊不渲染
      // 活動 / 地點 / 城市顯示中英雙語（英文上、中文下）；時間僅一行；文字 semibold
      const eventsSection = document.getElementById('events-section');
      const eventsList = document.getElementById('events-list');
      if (eventsSection && eventsList) {
        if (Array.isArray(data.events) && data.events.length > 0) {
          eventsList.innerHTML = data.events.map((ev, i) => `
            <div class="grid grid-cols-[1fr_2fr_2fr_1fr] gap-md ${i > 0 ? 'mt-md' : ''}">
              <p class="text-p1 text-black font-semibold">${ev.time || ''}</p>
              <div>
                ${ev.nameEn ? `<p class="text-p1 text-black font-semibold">${ev.nameEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.name || ''}</p>
              </div>
              <div>
                ${ev.locationEn ? `<p class="text-p1 text-black font-semibold">${ev.locationEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.location || ''}</p>
              </div>
              <div>
                ${ev.cityEn ? `<p class="text-p1 text-black font-semibold">${ev.cityEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.city || ''}</p>
              </div>
            </div>
          `).join('');
          eventsSection.classList.remove('hidden');
        } else {
          eventsSection.classList.add('hidden');
          eventsList.innerHTML = '';
        }
      }

      // Hero Image：預設用 HTML 寫死的 CCC08866.jpg；data 有 heroImage 才覆蓋
      const heroImg = /** @type {HTMLImageElement | null} */ (document.getElementById('hero-img'));
      if (heroImg && data.heroImage) {
        heroImg.src = data.heroImage;
      }

      // Gallery：全寬 3-slot 輪播（沿用 about/class 視覺）
      const galleryContainer = document.getElementById('gallery-container');
      if (galleryContainer && Array.isArray(data.images) && data.images.length > 0) {
        initDegreeShowGallery(galleryContainer, data.images);
      }

      // 共用渲染函式：依 url 形式塞 iframe / video tag
      const renderVideoInto = (wrapper, url) => {
        if (url.includes('youtube') || url.includes('vimeo') || url.includes('embed')) {
          wrapper.innerHTML = `<iframe class="w-full h-full" src="${url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
          wrapper.innerHTML = `<video class="w-full h-full" controls><source src="${url}" type="video/mp4">Your browser does not support the video tag.</video>`;
        }
      };

      // 主影片（gallery 上方）
      const videoSection = document.getElementById('video-section');
      const videoWrapper = document.getElementById('video-wrapper');
      if (videoSection && videoWrapper) {
          if (data.videoUrl) {
            videoSection.classList.remove('hidden');
            renderVideoInto(videoWrapper, data.videoUrl);
          } else {
            videoSection.classList.add('hidden');
            videoWrapper.innerHTML = '';
          }
      }

      // 紀錄影片（gallery 下方，僅在 data.documentaryUrl 存在時渲染）
      const docSection = document.getElementById('documentary-video-section');
      const docWrapper = document.getElementById('documentary-video-wrapper');
      if (docSection && docWrapper) {
          if (data.documentaryUrl) {
            docSection.classList.remove('hidden');
            renderVideoInto(docWrapper, data.documentaryUrl);
          } else {
            docSection.classList.add('hidden');
            docWrapper.innerHTML = '';
          }
      }

      // Prev / Next 雙卡：sort desc 下 idx+1 = 上一年度（older 左上），idx-1 = 下一年度（newer 右下）；皆 wrap 維持循環導覽
      const idx = years.indexOf(year);
      const prevYear = years[(idx + 1) % years.length];
      const nextYear = years[(idx - 1 + years.length) % years.length];
      const prevData = degreeShowData[prevYear];
      const nextData = degreeShowData[nextYear];

      setupNextProject(prevYear, prevData, nextYear, nextData);

    } else {
      window.location.href = '404.html';
    }
  } catch (error) {
    console.error('Error loading degree show detail data:', error);
  }
}

/**
 * Next Project section setup（左 = older / 上方，右 = newer / 下方 50% offset）
 * 桌面：兩張海報 56vw 各占 80% 視覺、預設 50% 黑 dim、hover 取消 dim + 顯示三 chip（年份/英/中）
 *      其中 chip 隨機色 + 旋轉 + 水平範圍（左 0-50vw / 右 51-100vw）；另一張同時 clip-path 掃入隨機色（仿首頁 newsOverlay）
 * 手機：簡單 stack
 */
function setupNextProject(prevYear, prevData, nextYear, nextData) {
  const ACCENT = ['#00FF80', '#FF448A', '#26BCFF'];
  const CLIP_DIRS = [
    { hidden: 'inset(100% 0 0 0)', shown: 'inset(0% 0 0 0)' },   // 上→下
    { hidden: 'inset(0 0 100% 0)', shown: 'inset(0 0 0% 0)' },   // 下→上
    { hidden: 'inset(0 100% 0 0)', shown: 'inset(0 0% 0 0)' },   // 右→左
    { hidden: 'inset(0 0 0 100%)', shown: 'inset(0 0 0 0%)' },   // 左→右
  ];

  // 手機 stack
  const setMobile = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link-m`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img-m`));
    const yearEl = document.getElementById(`${key}-year-mobile`);
    const titleEl = document.getElementById(`${key}-title-mobile`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.poster || data.coverImage;
    if (yearEl) yearEl.textContent = year;
    if (titleEl) titleEl.textContent = data.title || '';
  };
  setMobile('prev', prevYear, prevData);
  setMobile('next', nextYear, nextData);

  if (window.innerWidth < 768) return;

  // 桌面 desktop
  const setDesktop = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img`));
    const yearEl = document.getElementById(`${key}-year`);
    const titleEnEl = document.getElementById(`${key}-title-en`);
    const titleEl = document.getElementById(`${key}-title`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.poster || data.coverImage;
    if (yearEl) yearEl.textContent = year;
    if (titleEnEl) titleEnEl.textContent = data.title_en || '';
    if (titleEl) titleEl.textContent = data.title || '';
  };
  setDesktop('prev', prevYear, prevData);
  setDesktop('next', nextYear, nextData);

  // 本地隨機旋轉：-6° ~ 6°（不含 0），用於 cards 與 labels
  const localRot = () => {
    let deg;
    do { deg = Math.round(Math.random() * 12) - 6; } while (deg === 0);
    return deg;
  };

  // 海報隨機旋轉，兩張獨立
  const prevCard = /** @type {HTMLElement | null} */ (document.getElementById('prev-card'));
  const nextCard = /** @type {HTMLElement | null} */ (document.getElementById('next-card'));
  if (prevCard) prevCard.style.transform = `rotate(${localRot()}deg)`;
  if (nextCard) nextCard.style.transform = `rotate(${localRot()}deg)`;

  // Labels：rotation 各自隨機（init 時固定）；底色 cardColor 改為每次 mouseenter 重新挑
  // → 同張海報的 3 chip 仍共用同一色，但跨 hover 不一定相同
  const LABEL_IDS = ['year', 'title-en', 'title'];
  ['prev', 'next'].forEach(key => {
    LABEL_IDS.forEach(id => {
      const el = /** @type {HTMLElement | null} */ (document.getElementById(`${key}-${id}`));
      if (!el) return;
      el.style.transform = `rotate(${localRot()}deg)`;
    });
  });

  // 位置計算：等兩張圖載入完後，依 naturalWidth/Height 計算高度，設 next.top + stage.minHeight
  // labels 已搬進 card 內、靠 corner 絕對定位（左下 / 右上），不需要 JS 算 vw 位置
  const recompute = () => {
    const stage = /** @type {HTMLElement | null} */ (document.getElementById('next-project-stage'));
    const prevImg = /** @type {HTMLImageElement | null} */ (document.getElementById('prev-img'));
    const nextImg = /** @type {HTMLImageElement | null} */ (document.getElementById('next-img'));
    const nextLink = /** @type {HTMLElement | null} */ (document.getElementById('next-link'));
    if (!stage || !prevImg || !nextImg || !nextLink) return;
    if (!prevImg.naturalWidth || !nextImg.naturalWidth) return;

    const posterW = window.innerWidth * 0.66;
    const prevH = posterW * (prevImg.naturalHeight / prevImg.naturalWidth);
    const nextH = posterW * (nextImg.naturalHeight / nextImg.naturalWidth);
    const nextTop = prevH * 0.5;

    nextLink.style.top = nextTop + 'px';
    stage.style.minHeight = (nextTop + nextH) + 'px';
  };

  const waitImg = (img) => new Promise(r => {
    if (!img) { r(undefined); return; }
    if (img.complete && img.naturalWidth) r(undefined);
    else {
      img.addEventListener('load', () => r(undefined), { once: true });
      img.addEventListener('error', () => r(undefined), { once: true });
    }
  });
  Promise.all([
    waitImg(/** @type {HTMLImageElement | null} */ (document.getElementById('prev-img'))),
    waitImg(/** @type {HTMLImageElement | null} */ (document.getElementById('next-img'))),
  ]).then(() => {
    recompute();
    window.addEventListener('resize', recompute);
  });

  // Hover：被 hover 的 card → z 提高 + 移除 dim + 顯示 labels group；另一張 → clip-path 掃入隨機色
  const setupHover = (myKey, otherKey) => {
    const myLink = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-link`));
    const otherLink = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-link`));
    const myDim = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-dim`));
    const myLabels = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-labels`));
    const otherClip = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-clip`));
    if (!myLink || !myDim || !otherClip) return;

    // chip clip-path stagger 設定：從 transform-origin 那側 reveal
    // prev: transform-origin left → reveal 從左到右 → hidden inset(0 100% 0 0)
    // next: transform-origin right → reveal 從右到左 → hidden inset(0 0 0 100%)
    const HIDDEN_INSET = myKey === 'prev' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    const SHOWN_INSET  = 'inset(0 0 0 0)';

    myLink.addEventListener('mouseenter', () => {
      myLink.style.zIndex = '3';
      if (otherLink) otherLink.style.zIndex = '1';
      myDim.style.opacity = '0';

      // 每次 hover 重新挑 cardColor（不一定每次都一樣），同步套到 3 個 chip
      // 同時每次 hover 重新 random 旋轉角度（chip 此時 clip-path 還是 hidden，新角度會在 reveal 時直接呈現）
      const myCardColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
      myLink.dataset.cardColor = myCardColor;
      if (myLabels) {
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('h4, h2'));
        chips.forEach((chip, i) => {
          chip.style.transform = `rotate(${localRot()}deg)`;
          chip.style.background = myCardColor;
          chip.style.transitionDelay = (i * 0.08) + 's';
          chip.style.clipPath = SHOWN_INSET;
        });
      }

      // 隨機方向 + 隨機色，先 disable transition snap 到 hidden 再 reflow + apply shown
      // clip color 從候選排除掉「被 hover 卡片的 cardColor」，避免文字底色與覆蓋色撞色
      const dir = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
      const clipPool = ACCENT.filter(c => c !== myCardColor);
      const color = clipPool[Math.floor(Math.random() * clipPool.length)];
      otherClip.dataset.hiddenClip = dir.hidden;
      otherClip.style.transition = 'none';
      otherClip.style.clipPath = dir.hidden;
      otherClip.style.background = color;
      void otherClip.offsetHeight;
      otherClip.style.transition = 'clip-path 0.5s cubic-bezier(0.25,0,0,1)';
      otherClip.style.clipPath = dir.shown;
    });

    myLink.addEventListener('mouseleave', () => {
      myDim.style.opacity = '0.5';
      if (myLabels) {
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('h4, h2'));
        chips.forEach((chip) => {
          chip.style.transitionDelay = '0s';
          chip.style.clipPath = HIDDEN_INSET;
        });
      }
      otherClip.style.clipPath = otherClip.dataset.hiddenClip || 'inset(100% 0 0 0)';
    });
  };
  setupHover('prev', 'next');
  setupHover('next', 'prev');

  // 進場動畫保留 clip-path reveal（prev 由左→右、next 由右→左）
  if (typeof ScrollTrigger !== 'undefined' && typeof gsap !== 'undefined') {
    const setupReveal = (id, fromInset) => {
      const el = document.getElementById(id);
      if (!el) return;
      gsap.set(el, { clipPath: fromInset });
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(el, {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 0.5,
            ease: 'cubic-bezier(0.25, 0, 0, 1)',
          });
        }
      });
    };
    setupReveal('prev-card', 'inset(0% 100% 0% 0%)');
    setupReveal('next-card', 'inset(0% 0% 0% 100%)');
  }
}