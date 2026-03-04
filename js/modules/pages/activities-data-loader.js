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

// 1. Workshops & Students Present Renderer (Shared Logic)
export async function loadWorkshops(jsonFile, pageType = 'workshop') {
  return loadWorkshopsInto(jsonFile, pageType, null);
}

export async function loadWorkshopsInto(jsonFile, pageType = 'workshop', containerId = null) {
  const container = containerId
    ? document.getElementById(containerId)
    : document.querySelector('.bg-white .site-container');
  if (!container) return;

  const data = await fetchData(jsonFile);
  if (data.length === 0) return;

  container.innerHTML = '';

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map((item, idx) => {
      const isItemLast = idx === yearGroup.items.length - 1;
      const date = item.date || '';
      const subTitle = pageType === 'workshop' ? 'Tutor 講師' : 'Organizer 主辦單位';
      const subValue = pageType === 'workshop' ? item.tutor : item.organizer;

      return `
        <div class="workshop-item ${!isItemLast ? 'border-b-4 border-black' : ''} overflow-hidden">
          <div class="workshop-header cursor-pointer group transition-colors duration-fast flex items-center justify-between px-[4px] py-md">
            <div class="text-h5 font-bold">${item.title}</div>
            <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
          </div>
          <div class="workshop-content h-0 overflow-hidden px-[4px]">
            <div class="pb-xl flex flex-col-reverse md:flex-row gap-lg md:gap-3xl">
              <div class="flex-1 flex flex-col gap-lg">
                ${date ? `<div><h6 class="text-black">${date}</h6></div>` : ''}
                <div>
                  <h6 class="text-black mb-xs">${subTitle}</h6>
                  <p class="text-p2">${subValue}</p>
                </div>
                <div>
                  <h6 class="mb-xs text-black">Introduction 介紹</h6>
                  <p class="text-p2">${item.intro}</p>
                </div>
              </div>
              <div class="w-full md:w-[30%]">
                <img src="${item.image}" class="w-full object-cover block">
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="workshop-year-group grid-12 items-start">
        <div class="col-span-12 md:col-span-1 md:col-start-1 workshop-year-toggle cursor-pointer flex items-center gap-sm pt-md">
          <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
          <h5>${yearGroup.year}</h5>
        </div>
        <div class="col-span-12 md:col-span-11 md:col-start-2 workshop-year-items flex flex-col mt-md md:mt-0">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
    `;
    container.insertAdjacentHTML('beforeend', html);
  });

  // 準備進場動畫：每個 year group 的 items 逐條 stagger，分割線最後進場
  if (typeof gsap !== 'undefined') {
    const allSets = [...container.querySelectorAll('.workshop-year-group')].map(group => {
      const yearToggle = group.querySelector('.workshop-year-toggle');
      const items = group.querySelectorAll('.workshop-item');
      const divider = group.nextElementSibling?.classList.contains('activities-separator')
        ? group.nextElementSibling : null;
      return { group, items: [...(yearToggle ? [yearToggle] : []), ...items, ...(divider ? [divider] : [])] };
    }).filter(s => s.items.length > 0);

    if (allSets.length === 0) return null;

    allSets.forEach(({ items }) => {
      gsap.set(items, { y: 100, opacity: 0 });
    });

    return () => {
      allSets.forEach(({ items }, i) => {
        const delay = i * 0.15;
        gsap.to(items, {
          y: 0, opacity: 1,
          duration: 0.6,
          delay,
          stagger: { each: 0.1, grid: 'auto', axis: 'y' },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
    };
  }

  return null;
}

// 2. Summer Camp Renderer
export async function loadSummerCamp() {
  return loadSummerCampInto(null);
}

export async function loadSummerCampInto(containerId = null) {
  const container = containerId
    ? document.getElementById(containerId)
    : document.querySelector('.bg-white .site-container');
  if (!container) return;

  const data = await fetchData('../data/summer-camp.json');
  if (data.length === 0) return;

  container.innerHTML = '';

  data.forEach((yearGroup, index) => {
    const isLast = index === data.length - 1;
    const itemsHtml = yearGroup.items.map(item => `
      <div class="summer-camp-item overflow-hidden">
        <div class="summer-camp-header cursor-pointer group transition-colors duration-fast">
          <div class="flex items-center justify-between px-[4px] py-lg">
            <h4 class="font-bold">${item.title}</h4>
            <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
          </div>
        </div>
        <div class="summer-camp-content h-0 overflow-hidden px-[4px]">
          <div class="pb-md pt-xs flex flex-col-reverse md:flex-row gap-lg md:gap-3xl">
            <div class="flex-1 flex flex-col gap-lg">
              <p>${item.descriptionEn}</p>
              <p>${item.descriptionZh}</p>
            </div>
            <div class="w-full md:w-[30%]">
              <img src="${item.image}" alt="Camp Poster" class="w-full object-cover block">
            </div>
          </div>
        </div>
      </div>
    `).join('');

    const html = `
      <div class="summer-camp-year-group grid-12 items-start">
        <div class="col-span-12 md:col-span-1 md:col-start-1 pt-lg">
          <h5>${yearGroup.year}</h5>
        </div>
        <div class="col-span-12 md:col-span-11 md:col-start-2 mt-md md:mt-0">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
    `;
    container.insertAdjacentHTML('beforeend', html);
  });

  // 準備進場動畫：每個 year group 的 items 逐條 stagger，分割線最後進場
  if (typeof gsap !== 'undefined') {
    const allSets = [...container.querySelectorAll('.summer-camp-year-group')].map(group => {
      const yearEl = group.querySelector('h5');
      const items = group.querySelectorAll('.summer-camp-item');
      const divider = group.nextElementSibling?.classList.contains('activities-separator')
        ? group.nextElementSibling : null;
      return { group, items: [...(yearEl ? [yearEl] : []), ...items, ...(divider ? [divider] : [])] };
    }).filter(s => s.items.length > 0);

    if (allSets.length === 0) return null;

    allSets.forEach(({ items }) => {
      gsap.set(items, { y: 100, opacity: 0 });
    });

    return () => {
      allSets.forEach(({ items }, i) => {
        const delay = i * 0.15;
        gsap.to(items, {
          y: 0, opacity: 1,
          duration: 0.6,
          delay,
          stagger: { each: 0.1, grid: 'auto', axis: 'y' },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
    };
  }

  return null;
}
