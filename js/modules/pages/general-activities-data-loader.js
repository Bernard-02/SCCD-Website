/**
 * General Activities Data Loader
 * 負責讀取 General Activities JSON 資料並渲染列表
 * Item 的 first/last 樣式完全由 activities-filter.js 動態控制
 */

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
              <i class="fa-solid fa-chevron-down text-p1 transition-transform duration-300"></i>
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
        <div class="workshop-year-group grid-12 items-start">
          <div class="col-span-12 md:col-span-1 md:col-start-1 workshop-year-toggle cursor-pointer flex items-center gap-sm order-1">
            <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-12 md:col-span-11 md:col-start-2 workshop-year-items flex flex-col order-2 mt-md md:mt-0">
            ${itemsHtml}
          </div>
        </div>
        ${!isLast ? '<div class="activities-separator grid-12 pt-md pb-2xl"><div class="col-span-12 border-b border-gray-9"></div></div>' : ''}
      `;
      container.insertAdjacentHTML('beforeend', html);
    });
  } catch (error) {
    console.error('Error loading general activities data:', error);
  }
}
