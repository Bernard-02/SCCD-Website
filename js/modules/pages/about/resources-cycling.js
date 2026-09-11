/**
 * Resources Cycling Module (About Page)
 * Resources 區塊：讀取 JSON 並渲染為 Horizontal Accordion
 */

import { initRotatedAccordion } from '../../accordions/horizontal-accordion.js';
import { loadAboutResources } from './about-source.js';
import { prefersReducedMotion } from '../../ui/reduce-motion.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { playClipPathExit } from '../../ui/scroll-animate.js';
import { DUR, EASE } from '../../ui/motion.js';

export function initResourcesCycling() {
  const container = document.getElementById('resources-accordion-container');
  if (!container) return;

  // Directus 優先，本地 fallback（about-source.js）
  loadAboutResources()
    .then(resourcesContent => {
      renderResourcesAccordion(resourcesContent, container);
    })
    .catch(error => console.error('Error loading resources data:', error));
}

function renderResourcesAccordion(data, container) {
  // 建立 Accordion Wrapper
  const wrapper = document.createElement('div');
  // 不加 h-auto：桌面高度改由 accordion.css `.colored-accordion` min() 控制（h-auto 是 unlayered utility
  // 會蓋掉 layered 高度、讓 wrapper 塌成 0）；手機/矮橫向 carousel 本就 auto 高（預設），無需此 class。
  wrapper.className = 'accordion-wrapper colored-accordion';

  // 生成 HTML
  const html = data.map((item, index) => {
    // 拆分英文和中文標題（以第一個中文字元為界）
    const match = item.title.match(/^(.*?)\s+([\u4e00-\u9fff].*)$/);
    const titleEn = match ? match[1] : item.title;
    const titleZh = match ? match[2] : '';
    const labelInner = titleZh
      ? `<span class="accordion-label-en">${titleEn}</span><span class="accordion-label-sep"> </span><span class="accordion-label-zh">${titleZh}</span>`
      : item.title;

    // 圖片來源：多圖 images[]（後台可多張）優先，無則 fallback 單張 image
    const imgs = (item.images && item.images.length) ? item.images : (item.image ? [item.image] : []);
    const slides = imgs.map((url, i) =>
      `<img src="${url}" alt="${item.title}" class="res-slide"${i === 0 ? '' : ' style="z-index:0"'} onerror="this.style.display='none'">`
    ).join('');

    // 版面（user 2026-09-11）：圖在上、下面英文左／中文右對半分。text-wrap 內兩欄各自可捲；
    // 中英 <p> 仍在 .accordion-text-wrap 底下 → 沿用 accordion.css/color.css 既有的 `p` 上色與 mode3 規則。
    return `
    <div class="accordion-item" data-index="${index}">
      <!-- A: Label -->
      <h3 class="accordion-label" style="margin:0;">
        <div class="accordion-label-inner">${labelInner}</div>
      </h3>
      <!-- B: Body -->
      <div class="accordion-body">
        <div class="accordion-body-inner">
          <div class="accordion-img-wrap">
            <div class="res-switcher">${slides}</div>
          </div>
          <div class="accordion-text-wrap">
            <div class="accordion-text-cols">
              <div class="accordion-text-col list-scroll"><p class="text-white">${item.textEn || item.descriptionEn}</p></div>
              <div class="accordion-text-col list-scroll"><p class="text-white" lang="zh-Hant">${item.textZh || item.descriptionZh}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  wrapper.innerHTML = html;
  container.appendChild(wrapper);
  initResourceSwitchers(wrapper);

  // 桌面＝旋轉堆疊手風琴；手機與矮橫向＝水平 carousel（user 2026-07-06：取消堆疊 accordion 與旋轉，
  // 卡片恆展開、原生 scroll-snap 左右滑；2026-07-07 矮橫向同款、卡片並排 2 張）。
  // carousel 佈局在 accordion.css（手機 block + landscape gate block），
  // JS 只做 clip-reveal 進退場（卡片不開合、不設旋轉 → 舊 initColoredCardAccordion 不再用）。
  const entry = !prefersReducedMotion();
  const shortLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  if (window.innerWidth >= 768 && !shortLandscape) {
    initRotatedAccordion(wrapper, { animateEntry: entry });
  } else {
    const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
    if (entry && typeof ScrollTrigger !== 'undefined') {
      gsap.set(items, { clipPath: 'inset(0% 100% 0% 0%)' });
      ScrollTrigger.create({
        trigger: wrapper,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          // anchor 跳轉飛掠中：直接就定位不播（同桌面 rotated accordion）；目的地是 resources 本身照常播
          if (document.body.classList.contains('anchor-jumping') && document.body.dataset.anchorTarget !== wrapper.closest('section[id]')?.id) {
            gsap.set(items, { clipPath: 'inset(0% 0% 0% 0%)' });
            return;
          }
          gsap.to(items, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.out', stagger: 0.1 });
        },
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

// 多圖自動輪播（user 2026-09-11「用 works 的切換方式、自動輪播」）：下一張沿 yPercent 由下滑入蓋住當前
// （＝全站 hero/works clip-reveal slide，外層 .res-switcher overflow:hidden 裁切），每 CYCLE_MS 換一張。
// 單張 / reduced-motion → 不輪播。桌面 hover 暫停讓人看清；離頁 registerPageCleanup 清 interval + tween。
function initResourceSwitchers(root) {
  const CYCLE_MS = 4000;
  const reduce = prefersReducedMotion();
  root.querySelectorAll('.res-switcher').forEach(sw => {
    const slides = Array.from(sw.querySelectorAll('.res-slide'));
    if (slides.length < 2 || reduce || typeof gsap === 'undefined') return;

    slides.forEach((s, i) => { s.style.position = 'absolute'; s.style.inset = '0'; s.style.zIndex = i === 0 ? '1' : '0'; });
    let idx = 0, hovering = false;

    function go(next) {
      const incoming = slides[next];
      incoming.style.zIndex = '2';
      gsap.fromTo(incoming, { yPercent: 100 }, {
        yPercent: 0, duration: DUR.slow, ease: EASE.enter, overwrite: true,
        onComplete: () => { slides[idx].style.zIndex = '0'; incoming.style.zIndex = '1'; gsap.set(slides[idx], { yPercent: 0 }); idx = next; },
      });
    }
    const timer = setInterval(() => { if (!hovering) go((idx + 1) % slides.length); }, CYCLE_MS);

    // 桌面 hover 暫停（手機不綁；.accordion-item hover 才停，讓使用者看清當前那張）
    const item = sw.closest('.accordion-item');
    if (item && window.matchMedia('(min-width: 768px)').matches) {
      item.addEventListener('mouseenter', () => { hovering = true; });
      item.addEventListener('mouseleave', () => { hovering = false; });
    }
    registerPageCleanup(() => { clearInterval(timer); gsap.killTweensOf(slides); });
  });
}
