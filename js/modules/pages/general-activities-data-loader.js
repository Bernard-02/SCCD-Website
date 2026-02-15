/**
 * General Activities Data Loader
 * 負責讀取 General Activities JSON 資料並渲染列表
 */

export async function loadGeneralActivities() {
  const container = document.getElementById('general-activities-list');
  if (!container) return;

  try {
    const response = await fetch('../data/general-activities.json');
    const data = await response.json();
    
    if (data.length === 0) return;

    container.innerHTML = ''; // Clear existing content

    data.forEach((yearGroup, index) => {
      const isLast = index === data.length - 1;
      
      const itemsHtml = yearGroup.items.map((item, i) => {
        const isLastItem = i === yearGroup.items.length - 1;
        const borderClass = isLastItem ? '' : 'border-b border-gray-9';
        return `
        <div class="activities-item grid grid-cols-12 md:grid-cols-9 gap-y-1 md:gap-y-0 gap-x-xs md:gap-x-gutter items-start md:items-center py-md ${borderClass}" data-category="${item.category}">
          
          <!-- Row 1: Title (10 cols) + Tag (2 cols for safety/alignment) -->
          <!-- Mobile: Title takes 10 cols, Tag takes 2 cols (aligned right) -->
          <!-- Desktop: Title takes 5 cols (order 1) -->
          <p class="col-span-10 md:col-span-5 font-regular text-black order-1">${item.title}</p>
          
          <!-- Tag -->
          <!-- Mobile: Row 1 Right (2 cols) -->
          <!-- Desktop: Col 9 (1 col) (order 3) -->
          <p class="col-span-2 md:col-span-1 text-left text-black font-regular order-2 md:order-3">${item.categoryLabel}</p>

          <!-- Row 2: Location -->
          <!-- Mobile: Full width (12 cols) -->
          <!-- Desktop: Col 6-8 (3 cols) (order 2) -->
          <p class="col-span-12 md:col-span-3 text-black font-regular order-3 md:order-2">${item.location}</p>
          
        </div>
      `}).join('');

      const html = `
        <div class="${isLast ? '' : 'mb-3xl'}">
          <div class="activities-year-grid grid grid-cols-12 md:grid-cols-11 gap-gutter items-start pb-xl">
            
            <!-- Year: Mobile Top (11 cols), Desktop Col 2 (1 col of 11) -->
            <div class="col-span-11 md:col-span-1 activities-year-toggle cursor-pointer order-1 md:order-2">
              <h5>${yearGroup.year}</h5>
            </div>

            <!-- Chevron: Mobile Top Right (1 col), Desktop Col 1 (1 col of 11) -->
            <div class="col-span-1 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle order-2 md:order-1">
              <i class="fa-solid fa-chevron-down text-p1 transition-all duration-fast"></i>
            </div>

            <!-- Activities List: Mobile Full Width (12 cols), Desktop Col 3-11 (9 cols of 11) -->
            <div class="col-span-12 md:col-span-9 activities-year-items flex flex-col order-3">
              ${itemsHtml}
            </div>
          </div>
          ${!isLast ? '<div class="grid grid-cols-12 md:grid-cols-11 gap-gutter"><div class="col-span-12 md:col-start-2 md:col-span-10 border-b border-gray-9"></div></div>' : ''}
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });
  } catch (error) {
    console.error('Error loading general activities data:', error);
  }
}