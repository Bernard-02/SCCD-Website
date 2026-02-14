/**
 * Records Data Loader
 * 負責讀取 Records JSON 資料並渲染到頁面上
 */

export async function loadRecords() {
  try {
    const response = await fetch('../data/records.json');
    const data = await response.json();
    const container = document.getElementById('records-list-container');

    if (!container) return;

    container.innerHTML = '';

    data.forEach((yearGroup, index) => {
      const isLastYear = index === data.length - 1;
      
      // Generate items HTML
      let itemsHtml = '';
      if (yearGroup.items && yearGroup.items.length > 0) {
        itemsHtml = yearGroup.items.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === yearGroup.items.length - 1;

          // Layout adjustments:
          // 1. First item: smaller pt (using pt-[4px] instead of py-xs which has top padding)
          // 2. Last item: no border
          const paddingClass = isFirst ? 'pb-xs pt-[4px]' : 'py-xs';
          const borderClass = isLast ? '' : 'border-b border-gray-9';

          return `
            <div class="grid grid-cols-9 items-center ${paddingClass} ${borderClass}">
              <p class="col-span-1">${item.location}</p>
              <p class="col-span-4">${item.competition}</p>
              <p class="col-span-2">${item.award}</p>
              <p class="col-span-1">${item.rank}</p>
              <p class="col-span-1">${item.winner}</p>
            </div>
          `;
        }).join('');
      }

      const html = `
        <div class="col-span-12 ${isLastYear ? '' : 'mb-xl'}">
          <div class="grid-12 items-start pb-xl">
            <!-- Chevron (Column 2) -->
            <div class="col-start-2 col-span-1 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle">
              <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
            </div>
            <!-- Year (Column 3) -->
            <div class="col-span-1 activities-year-toggle cursor-pointer">
              <h5>${yearGroup.year}</h5>
            </div>

            <!-- Records List (Column 4-12) -->
            <div class="col-span-9 activities-year-items flex flex-col">
              ${itemsHtml}
            </div>
          </div>
          ${isLastYear ? '' : '<div class="grid-12"><div class="col-start-3 col-span-10 border-b border-gray-9"></div></div>'}
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

  } catch (error) {
    console.error('Error loading records data:', error);
  }
}