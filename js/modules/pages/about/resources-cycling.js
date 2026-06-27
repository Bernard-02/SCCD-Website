/**
 * Resources Cycling Module (About Page)
 * Resources 區塊：讀取 JSON 並渲染為 Horizontal Accordion
 */

import { initColoredCardAccordion, initRotatedAccordion } from '../../accordions/horizontal-accordion.js';
import { sitePath } from '../../ui/site-base.js';
import { prefersReducedMotion } from '../../ui/reduce-motion.js';

export function initResourcesCycling() {
  const container = document.getElementById('resources-accordion-container');
  if (!container) return;

  // Fetch data from JSON file
  fetch(sitePath('data/about-resources.json'))
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - Check if data/about-resources.json exists`);
      return response.json();
    })
    .then(resourcesContent => {
      renderResourcesAccordion(resourcesContent, container);
    })
    .catch(error => console.error('Error loading resources data:', error));
}

function renderResourcesAccordion(data, container) {
  // 建立 Accordion Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'accordion-wrapper colored-accordion h-auto';

  // 生成 HTML
  const html = data.map((item, index) => {
    // 拆分英文和中文標題（以第一個中文字元為界）
    const match = item.title.match(/^(.*?)\s+([\u4e00-\u9fff].*)$/);
    const titleEn = match ? match[1] : item.title;
    const titleZh = match ? match[2] : '';
    const labelInner = titleZh
      ? `<span class="accordion-label-en">${titleEn}</span><span class="accordion-label-sep">&ensp;</span><span class="accordion-label-zh">${titleZh}</span>`
      : item.title;

    return `
    <div class="accordion-item" data-index="${index}">
      <!-- A: Label -->
      <div class="accordion-label">
        <div class="accordion-label-inner">${labelInner}</div>
      </div>
      <!-- B: Body -->
      <div class="accordion-body">
        <div class="accordion-body-inner">
          <div class="accordion-img-wrap">
            <img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover">
          </div>
          <div class="accordion-text-wrap">
            <p class="text-white mb-sm">${item.textEn || item.descriptionEn}</p>
            <p class="text-white">${item.textZh || item.descriptionZh}</p>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  wrapper.innerHTML = html;
  container.appendChild(wrapper);

  // 初始化旋轉卡片版手風琴（桌面旋轉堆疊，手機改卡片式向下 accordion）
  // 減少動態：animateEntry:false → 7 張卡片直接全顯（第一張展開、其餘收合 label），不逐張跳出
  const entry = !prefersReducedMotion();
  if (window.innerWidth >= 768) {
    initRotatedAccordion(wrapper, { height: 650, animateEntry: entry });
  } else {
    initColoredCardAccordion(wrapper, { animateEntry: entry });

    // 封鎖綫不佔 flow、被卡片堆疊蓋住（user 2026-06-11：被 accordion 遮蓋、不跟卡片占空間）：
    // 維持 absolute（section 層 z-0 < site-container z-30），top 釘到第 2~4 張卡的接縫置中，
    // 旋轉的滿版色帶從卡片堆後左右探出。卡片展收時封鎖綫不動（與 works 區 strip 同為 collage 固定位）。
    // 量測用「第一張展開」的 final 預設狀態（entry 完會自動開第一張）：暫時把 body0 設 auto 量完還原，
    // 否則 strip 會釘在收合版位置、預設視圖整條藏在第一張展開的 body 後面。
    const strip = /** @type {HTMLElement | null} */ (document.querySelector('.section-title-strip[data-anchor="resources"]'));
    const items = wrapper.querySelectorAll('.accordion-item');
    const section = document.getElementById('resources');
    if (strip && section && items.length > 3) {
      const body0 = items[0].querySelector('.accordion-body');
      if (body0 && typeof gsap !== 'undefined') gsap.set(body0, { height: 'auto' });
      const idx = 1 + Math.floor(Math.random() * 3); // 第 2~4 張卡
      const top = items[idx].getBoundingClientRect().top - section.getBoundingClientRect().top;
      if (body0 && typeof gsap !== 'undefined') gsap.set(body0, { height: 0 });
      strip.style.top = `${Math.round(top - strip.offsetHeight / 2)}px`;
    }
  }
}
