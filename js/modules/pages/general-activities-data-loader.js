/**
 * General Activities Data Loader
 * 負責讀取 General Activities JSON 資料並渲染列表
 * Item 的 first/last 樣式完全由 activities-filter.js 動態控制
 */

// 每個 group 對應的 ScrollTrigger instance，供 filter 重建動畫用
const groupScrollTriggers = new Map();
export function getGroupScrollTriggers() { return groupScrollTriggers; }

// 為單一 group 建立 ScrollTrigger，回傳 instance（供 filter 重建用）
export function buildGroupScrollTrigger(group) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const yearToggle = group.querySelector('.workshop-year-toggle');
  const items = [...group.querySelectorAll('.workshop-item')].filter(el => el.style.display !== 'none');
  const allItems = [...(yearToggle ? [yearToggle] : []), ...items];
  if (allItems.length === 0) return null;

  gsap.set(group, { opacity: 0 });
  gsap.set(allItems, { y: 100, opacity: 0 });

  return ScrollTrigger.create({
    trigger: group,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.set(group, { opacity: 1, clearProps: 'opacity' });
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
        const images = (item.images || []).slice(0, 5);
        const galleryHtml = images.length > 0 ? `
          <div class="activity-gallery flex gap-sm mt-md">
            ${images.map(src => `
              <div class="flex-1 min-w-0">
                <img src="${src}" alt="" class="w-full h-[160px] object-cover block">
              </div>
            `).join('')}
          </div>
        ` : '';

        return `
          <div class="workshop-item overflow-hidden" data-category="${item.category}">
            <div class="workshop-header cursor-pointer group transition-colors duration-fast flex items-center justify-between">
              <div class="text-h5 font-bold">${item.title}</div>
              <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
            </div>
            <div class="workshop-content h-0 overflow-hidden">
              <div class="pb-xl flex flex-col gap-md">
                <div class="flex gap-xl">
                  ${item.date ? `<h6 class="text-black">${item.date}</h6>` : ''}
                  <h6 class="text-black">${item.categoryLabel}</h6>
                </div>
                ${galleryHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');

      const html = `
        <div class="workshop-year-group grid-12 items-start ${!isLast ? 'border-b border-gray-9 pb-2xl mb-2xl' : ''}">
          <div class="col-span-12 md:col-span-1 md:col-start-1 workshop-year-toggle cursor-pointer flex items-center gap-sm order-1 md:sticky md:top-[264px] md:self-start md:pb-md">
            <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-12 md:col-span-11 md:col-start-2 workshop-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]">
            ${itemsHtml}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // 進場動畫：每個 year group 進入視窗時，內部 items 逐條 stagger 出現（border 跟 group 一起）
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
