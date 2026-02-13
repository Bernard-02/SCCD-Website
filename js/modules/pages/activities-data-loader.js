/**
 * Activities Data Loader Module
 * 負責讀取 JSON 資料並渲染 Activities 相關頁面的 HTML
 */

// Helper: Fetch JSON
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 1. General Activities Renderer
export async function loadGeneralActivities() {
  const container = document.querySelector('.activities-content-section .col-span-11');
  if (!container) return;

  const data = await fetchData('../data/general-activities.json');
  if (data.length === 0) return;

  container.innerHTML = ''; // Clear existing content

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map(item => `
      <div class="activities-item" data-category="${item.category}">
        <p class="col-span-5">${item.title}</p>
        <p class="col-span-3">${item.location}</p>
        <p class="col-span-1">${item.categoryLabel}</p>
      </div>
    `).join('');

    const html = `
      <div class="mb-xl">
        <div class="grid grid-cols-11 gap-gutter items-start pb-xl">
          <div class="col-span-1 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle">
            <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
          </div>
          <div class="col-span-1 activities-year-toggle cursor-pointer">
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-9 activities-year-items flex flex-col">
            ${itemsHtml}
          </div>
        </div>
        ${!isLast ? '<div class="grid grid-cols-11 gap-gutter"><div class="col-start-2 col-span-10 border-b border-gray-9"></div></div>' : ''}
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}

// 2. Records Renderer
export async function loadRecords() {
  const container = document.querySelector('.bg-white .site-container .grid-12');
  if (!container) return;

  const data = await fetchData('../data/records.json');
  if (data.length === 0) return;

  container.innerHTML = '';

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map(item => `
      <div class="grid grid-cols-9 items-center py-xs border-b border-gray-9">
        <p class="col-span-1">${item.location}</p>
        <p class="col-span-4">${item.competition}</p>
        <p class="col-span-2">${item.award}</p>
        <p class="col-span-1">${item.rank}</p>
        <p class="col-span-1">${item.winner}</p>
      </div>
    `).join('');

    const html = `
      <div class="col-span-12 ${!isLast ? 'mb-xl' : ''}">
        <div class="grid-12 items-start pb-xl">
          <div class="col-start-2 col-span-1 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle">
            <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
          </div>
          <div class="col-span-1 activities-year-toggle cursor-pointer">
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-9 activities-year-items flex flex-col">
            ${itemsHtml}
          </div>
        </div>
        ${!isLast ? '<div class="grid-12"><div class="col-start-3 col-span-10 border-b border-gray-9"></div></div>' : ''}
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}

// 3. Workshops & Students Present Renderer (Shared Logic)
export async function loadWorkshops(jsonFile, pageType = 'workshop') {
  const container = document.querySelector('.bg-white .site-container');
  if (!container) return;

  const data = await fetchData(jsonFile);
  if (data.length === 0) return;

  container.innerHTML = '';

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map((item, idx) => {
      const isItemLast = idx === yearGroup.items.length - 1;
      // Determine fields based on page type
      const date = item.date || '';
      const subTitle = pageType === 'workshop' ? 'Tutor 講師' : 'Organizer 主辦單位';
      const subValue = pageType === 'workshop' ? item.tutor : item.organizer;
      
      return `
        <div class="workshop-item ${!isItemLast ? 'border-b border-gray-9' : ''} overflow-hidden">
          <div class="workshop-header cursor-pointer group transition-colors duration-fast flex items-center justify-between ${isItemLast ? '' : 'pb-md'}">
            <div class="text-h5 font-bold">${item.title}</div>
            <i class="fa-solid fa-chevron-down text-p1 transition-transform duration-300"></i>
          </div>
          <div class="workshop-content h-0 overflow-hidden">
            <div class="pb-xl pt-xs flex gap-3xl">
              <div class="flex-1 flex flex-col gap-lg">
                ${date ? `<div><h6 class="text-black">${date}</h6></div>` : ''}
                <div>
                  <h6 class="text-black mb-xs">${subTitle}</h6>
                  <p class="text-p1">${subValue}</p>
                </div>
                <div>
                  <h6 class="mb-xs text-black">Introduction 介紹</h6>
                  <p class="text-p1">${item.intro}</p>
                </div>
              </div>
              <div style="flex: 0 0 30%;">
                <img src="${item.image}" class="w-full object-cover block">
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="workshop-year-group grid-12 items-start">
        <div class="col-start-2 col-span-1 flex justify-end items-center workshop-year-toggle cursor-pointer" style="height: 1.8rem;">
          <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
        </div>
        <div class="col-start-3 col-span-1 workshop-year-toggle cursor-pointer">
          <h5>${yearGroup.year}</h5>
        </div>
        <div class="col-start-4 col-span-9 workshop-year-items flex flex-col">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="grid-12 pt-xl pb-2xl"><div class="col-start-3 col-span-10 border-b border-gray-9"></div></div>' : ''}
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}

// 4. Summer Camp Renderer
export async function loadSummerCamp() {
  const container = document.querySelector('.bg-white .site-container');
  if (!container) return;

  const data = await fetchData('../data/summer-camp.json');
  if (data.length === 0) return;

  container.innerHTML = '';

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map(item => `
      <div class="summer-camp-item overflow-hidden">
        <div class="summer-camp-header cursor-pointer group transition-colors duration-fast">
          <div class="flex items-center justify-between pb-md">
            <h4 class="font-bold">${item.title}</h4>
            <i class="fa-solid fa-chevron-down text-p1 transition-transform duration-300"></i>
          </div>
        </div>
        <div class="summer-camp-content h-0 overflow-hidden">
          <div class="pb-md pt-xs flex gap-3xl">
            <div class="flex-1 flex flex-col gap-lg">
              <p>${item.descriptionEn}</p>
              <p>${item.descriptionZh}</p>
            </div>
            <div style="flex: 0 0 30%;">
              <img src="${item.image}" alt="Camp Poster" class="w-full object-cover block">
            </div>
          </div>
        </div>
      </div>
    `).join('');

    const html = `
      <div class="summer-camp-year-group grid-12 items-start">
        <div class="col-start-3 col-span-1">
          <h5>${yearGroup.year}</h5>
        </div>
        <div class="col-start-4 col-span-9">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="grid-12 pt-xl pb-2xl"><div class="col-start-3 col-span-10 border-b border-gray-9"></div></div>' : ''}
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}
