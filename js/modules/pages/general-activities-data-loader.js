/**
 * General Activities Data Loader
 * 負責讀取 General Activities JSON 資料並渲染列表
 * Item 的 first/last 樣式完全由 activities-filter.js 動態控制
 */

import { buildItemMedia, buildPosterHtml, buildGalleryHtml, bindInteractions } from './activities-data-loader.js';

// 日期格式：去掉年份，只留月份與日期，支援 range
function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace(/\d{4}\./g, '').trim();
}

// 每個 group 對應的 ScrollTrigger instance，供 filter 重建動畫用
const groupScrollTriggers = new Map();
export function getGroupScrollTriggers() { return groupScrollTriggers; }

// 為單一 group 建立 ScrollTrigger，回傳 instance（供 filter 重建用）
export function buildGroupScrollTrigger(group) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const yearToggle = group.querySelector('.workshop-year-toggle');
  const items = [...group.querySelectorAll('.workshop-item')].filter(el => el.style.display !== 'none');
  const divider = group.nextElementSibling?.classList.contains('activities-separator')
    ? group.nextElementSibling : null;
  const allItems = [...(yearToggle ? [yearToggle] : []), ...items, ...(divider ? [divider] : [])];
  if (allItems.length === 0) return null;

  gsap.set(allItems, { y: 100, opacity: 0 });

  return ScrollTrigger.create({
    trigger: group,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.to(allItems, {
        y: 0, opacity: 1,
        duration: 0.6,
        stagger: { each: 0.1, grid: 'auto', axis: 'y' },
        ease: 'power2.out',
        overwrite: true,
        clearProps: 'transform,opacity',
      });
    },
  });
}

export async function loadGeneralActivities() {
  return loadGeneralActivitiesInto('general-activities-list');
}

export async function loadGeneralActivitiesInto(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch('../data/general-activities.json');
    const data = await response.json();

    if (data.length === 0) return;

    container.innerHTML = '';

    data.forEach((yearGroup, index) => {
      const isLast = index === data.length - 1;

      const itemsHtml = yearGroup.items.map(item => {
        const mediaJson = JSON.stringify(buildItemMedia(item)).replace(/"/g, '&quot;');
        const dateDisplay = formatDate(item.date);

        return `
          <div class="workshop-item overflow-hidden" data-category="${item.category}" data-media="${mediaJson}">
            <div class="workshop-header cursor-pointer group transition-colors duration-fast flex items-center justify-between px-[4px] py-md">
              <div class="text-h5 font-bold">${item.title}</div>
              <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
            </div>
            <div class="workshop-content h-0 overflow-hidden">
              <div class="pb-lg px-xl grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
                <div class="flex flex-col gap-md pr-2xl">
                  <div class="flex gap-xl items-baseline">
                    ${dateDisplay ? `<h6 class="text-black whitespace-nowrap flex-shrink-0">${dateDisplay}</h6>` : ''}
                    ${item.location ? `<h6 class="text-black truncate">${item.location}</h6>` : ''}
                  </div>
                  ${item.description ? `
                  <div class="overflow-y-auto" style="max-height: 250px;">
                    <p class="text-p2 leading-base">${item.description}</p>
                  </div>
                  ` : ''}
                </div>
                ${buildPosterHtml(item)}
              </div>
              ${buildGalleryHtml(item)}
            </div>
          </div>
        `;
      }).join('');

      container.insertAdjacentHTML('beforeend', `
        <div class="workshop-year-group grid-12 items-start">
          <div class="col-span-12 md:col-span-1 md:col-start-1 workshop-year-toggle cursor-pointer flex items-center gap-sm order-1 py-md md:sticky md:top-[264px] md:self-start md:pb-md">
            <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90 pl-xs"></i>
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-12 md:col-span-11 md:col-start-2 workshop-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]">
            ${itemsHtml}
          </div>
        </div>
        ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
      `);
    });

    // Gallery 左右滑動、Lightbox、hover 效果、海報比例偵測
    bindInteractions(container);

    // 進場動畫：ScrollTrigger（general activities 使用 ScrollTrigger，不同於其他用 GSAP 直播）
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      container.querySelectorAll('.workshop-year-group').forEach(group => {
        const st = buildGroupScrollTrigger(group);
        if (st) groupScrollTriggers.set(group, st);
      });
    }
  } catch (error) {
    console.error('Error loading general activities data:', error);
  }
}
