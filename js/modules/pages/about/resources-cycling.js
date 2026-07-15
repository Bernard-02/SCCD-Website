/**
 * Resources Cycling Module (About Page)
 * Resources 區塊：讀取 JSON 並渲染為 Horizontal Accordion
 */

import { initRotatedAccordion } from '../../accordions/horizontal-accordion.js';
import { sitePath } from '../../ui/site-base.js';
import { prefersReducedMotion } from '../../ui/reduce-motion.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { playClipPathExit } from '../../ui/scroll-animate.js';

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
            <!-- data-resources-text：手機內捲層（padding 留在 text-wrap 上不隨捲動，同 vision/class/works pattern） -->
            <div data-resources-text>
              <p class="text-white mb-sm">${item.textEn || item.descriptionEn}</p>
              <p class="text-white">${item.textZh || item.descriptionZh}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  wrapper.innerHTML = html;
  container.appendChild(wrapper);

  // 桌面＝旋轉堆疊手風琴；手機與矮橫向＝水平 carousel（user 2026-07-06：取消堆疊 accordion 與旋轉，
  // 卡片恆展開、原生 scroll-snap 左右滑；2026-07-07 矮橫向同款、卡片並排 2 張）。
  // carousel 佈局在 accordion.css（手機 block + landscape gate block），
  // JS 只做 clip-reveal 進退場（卡片不開合、不設旋轉 → 舊 initColoredCardAccordion 不再用）。
  const entry = !prefersReducedMotion();
  const shortLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  if (window.innerWidth >= 768 && !shortLandscape) {
    initRotatedAccordion(wrapper, { height: 650, animateEntry: entry });
  } else {
    const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
    if (entry && typeof ScrollTrigger !== 'undefined') {
      gsap.set(items, { clipPath: 'inset(0% 100% 0% 0%)' });
      ScrollTrigger.create({
        trigger: wrapper,
        start: 'top 80%',
        once: true,
        onEnter: () => gsap.to(items, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.out', stagger: 0.1 }),
      });
      registerPageExit(() => playClipPathExit(items));
    }

    // 封鎖綫不佔 flow（section 層 z-0 < site-container z-30，色帶從卡片後左右探出）：
    // 堆疊時代釘「第 1、2 張卡接縫」，carousel 無接縫 → 改釘卡片列上緣、色帶半疊在卡片頂後方
    const strip = /** @type {HTMLElement | null} */ (document.querySelector('.section-title-strip[data-anchor="resources"]'));
    const section = document.getElementById('resources');
    if (strip && section) {
      const top = wrapper.getBoundingClientRect().top - section.getBoundingClientRect().top;
      // 直式手機卡片上移貼 anchor strip 後（2026-07-09），原「半疊卡片頂」定位會凸出 section 頂、
      // 人還在 works 區就先露出 → 下移整條藏到卡片頂下方（+16 留 rotated 上角餘裕仍在 section 內），
      // 只從卡片左右 bleed 與滑動間隙探出；矮橫向卡片位置沒動、維持半疊。
      const offset = shortLandscape ? -strip.offsetHeight / 2 : 16;
      strip.style.top = `${Math.round(top + offset)}px`;
    }
  }
}
