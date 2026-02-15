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
            <div class="grid grid-cols-12 md:grid-cols-9 gap-y-1 md:gap-y-0 items-center ${paddingClass} ${borderClass} text-xs md:text-p1">
              
              <!-- Mobile Row 1: Competition + Rank -->
              <div class="col-span-12 flex justify-between md:contents">
                <p class="md:col-span-4 truncate md:order-2">${item.competition}</p>
                <p class="md:col-span-1 text-right md:text-left truncate md:order-4">${item.rank}</p>
              </div>

              <!-- Mobile Row 2: Winner + Award + Location (Flex layout for compact left alignment) -->
              <div class="col-span-12 flex gap-xs md:contents">
                <p class="md:col-span-1 text-left truncate md:order-5">${item.winner}</p>
                <p class="md:col-span-2 text-left truncate md:order-3">${item.award}</p>
                <p class="md:col-span-1 text-left truncate md:order-1">${item.location}</p>
              </div>
            </div>
          `;
        }).join('');
      }

      const html = `
        <div class="col-span-12 ${isLastYear ? '' : 'mb-xl'}">
          <div class="grid-12 items-start pb-xl">
            
            <!-- Year: Mobile Left (Col 1-10), Desktop Col 3 -->
            <div class="col-span-10 md:col-span-1 md:col-start-3 activities-year-toggle cursor-pointer flex items-center order-1 md:order-2">
              <h5>${yearGroup.year}</h5>
            </div>

            <!-- Chevron: Mobile Right (Col 11-12), Desktop Col 2 -->
            <div class="col-span-2 md:col-span-1 md:col-start-2 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle order-2 md:order-1">
              <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
            </div>

            <!-- Records List: Mobile Full Width (Col 1-12), Desktop Col 4-12 -->
            <div class="col-span-12 md:col-span-9 md:col-start-4 activities-year-items flex flex-col order-3 mt-md md:mt-0">
              ${itemsHtml}
            </div>
          </div>
          ${isLastYear ? '' : '<div class="grid-12"><div class="col-span-12 md:col-start-3 md:col-span-10 border-b border-gray-9"></div></div>'}
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

  } catch (error) {
    console.error('Error loading records data:', error);
  }
}