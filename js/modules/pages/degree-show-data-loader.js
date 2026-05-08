/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

import { animateCards } from '../ui/scroll-animate.js';
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

    const years = Object.keys(data).sort((a, b) => b - a); // Sort years descending
    const colors = ['#FF448A', '#00FF80', '#26BCFF'];

    years.forEach((year, idx) => {
      const item = data[year];
      const color = colors[idx % colors.length];
      const html = `
        <a href="/degree-show-detail?year=${year}" class="grid-12 items-start degree-show-card" style="--card-color: ${color}">
          <div class="col-span-12 md:col-start-1 md:col-span-1 mb-sm md:mb-0"><h5>${year}</h5></div>
          <div class="degree-show-card-content col-span-12 md:col-start-2 md:col-span-11 p-[6px] ml-lg transition-colors duration-fast">
            <div class="degree-show-img-wrapper overflow-hidden mb-md">
              <img src="${item.coverImage}" alt="Degree Show ${year}" loading="lazy" class="degree-show-img w-full object-cover">
            </div>
            <h5 class="mt-md">${item.title_en ? item.title_en : item.title}${item.title_en ? `<br><span>${item.title}</span>` : ''}</h5>
          </div>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // 等 layout 穩定後再初始化 ScrollTrigger，確保正確偵測哪些卡片在 viewport 內
    const cards = container.querySelectorAll('.degree-show-card');

    // Hover color (desktop only)
    if (window.innerWidth >= 768) {
      cards.forEach(card => {
        const content = card.querySelector('.degree-show-card-content');
        const color = getComputedStyle(card).getPropertyValue('--card-color').trim();
        card.addEventListener('mouseenter', () => { if (content) content.style.backgroundColor = color; });
        card.addEventListener('mouseleave', () => { if (content) content.style.backgroundColor = ''; });
      });
    }

    requestAnimationFrame(() => {
      animateCards(cards, true, { fadeIn: true });
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
    const years = Object.keys(degreeShowData).sort((a, b) => b - a);

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
      const heroImg = document.getElementById('hero-img');
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

      // Prev / Next 雙卡：sort desc 下 idx+1 = 上一年度（older），idx-1 = 下一年度（newer）；皆 wrap 維持循環導覽
      const idx = years.indexOf(year);
      const prevYear = years[(idx + 1) % years.length];
      const nextYear = years[(idx - 1 + years.length) % years.length];
      const prevData = degreeShowData[prevYear];
      const nextData = degreeShowData[nextYear];

      const setupCard = (key, targetYear, targetData) => {
        const link = document.getElementById(`${key}-link`);
        const yearEl = document.getElementById(`${key}-year`);
        const titleEl = document.getElementById(`${key}-title`);
        const img = document.getElementById(`${key}-img`);
        const yearMobileEl = document.getElementById(`${key}-year-mobile`);
        const titleMobileEl = document.getElementById(`${key}-title-mobile`);

        if (link) link.href = '/degree-show-detail?year=' + targetYear;
        if (yearEl) yearEl.textContent = targetYear;
        if (titleEl) titleEl.textContent = targetData.title;
        if (img && targetData.coverImage) img.src = targetData.coverImage;
        if (yearMobileEl) yearMobileEl.textContent = targetYear;
        if (titleMobileEl) titleMobileEl.textContent = targetData.title;
      };

      setupCard('prev', prevYear, prevData);
      setupCard('next', nextYear, nextData);

      // 卡片隨機旋轉（desktop only）：±2~4°，且兩張保證反向（一順一逆）避免視覺平行
      if (typeof gsap !== 'undefined' && window.innerWidth >= 768) {
        const sign = Math.random() < 0.5 ? -1 : 1;
        const mag = () => 2 + Math.random() * 2;
        const prevEl = document.getElementById('prev-card');
        const nextEl = document.getElementById('next-card');
        if (prevEl) gsap.set(prevEl, { rotation: sign * mag() });
        if (nextEl) gsap.set(nextEl, { rotation: -sign * mag() });
      }

      // Hover z-index swap（desktop only）：被 hover 的卡片 z=10，另一張保持 z=1，使 overlap 區的視覺優先級可切換
      if (window.innerWidth >= 768) {
        const prevWrapper = document.getElementById('prev-wrapper');
        const nextWrapper = document.getElementById('next-wrapper');
        [prevWrapper, nextWrapper].forEach(w => {
          if (!w) return;
          w.style.zIndex = '1';
          w.addEventListener('mouseenter', () => { w.style.zIndex = '10'; });
          w.addEventListener('mouseleave', () => { w.style.zIndex = '1'; });
        });
      }

      // 卡片進場：clip-path reveal；prev 從左 → 右、next 從右 → 左（鏡像對稱）
      // gsap.set 設旋轉 + clipPath 都不會清掉，互不干擾
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

    } else {
      window.location.href = '404.html';
    }
  } catch (error) {
    console.error('Error loading degree show detail data:', error);
  }
}