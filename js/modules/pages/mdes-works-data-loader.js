/**
 * MDES Works Data Loader
 * 負責讀取 MDES Works JSON 資料並渲染到頁面上 (無影片版)
 */

export async function loadMDESWorks() {
  try {
    const response = await fetch('../data/mdes-works.json');
    const data = await response.json();

    const introContainer = document.getElementById('works-intro-container');
    const heroContainer = document.getElementById('works-hero-container');
    const detailsContainer = document.getElementById('works-details-container');

    // if (!introContainer || !heroContainer || !detailsContainer) return;

    // 清空容器
    if (introContainer) introContainer.innerHTML = '';
    if (heroContainer) heroContainer.innerHTML = '';
    if (detailsContainer) detailsContainer.innerHTML = '';

    // 遍歷每個類別
    Object.keys(data).forEach((categoryKey, index) => {
      const categoryData = data[categoryKey];
      // 第一個類別預設顯示，其他隱藏
      const hiddenClass = index === 0 ? '' : 'hidden';

      // 1. Render Intro (Text Description)
      if (introContainer && categoryData.titleHtml) {
        const introHtml = `
          <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
            <div class="grid-12 mb-6xl">
              <div class="col-start-2 col-span-2">
                <h3 class="rotate--4 inline-block whitespace-nowrap">${categoryData.titleHtml}</h3>
              </div>
              <div class="col-start-6 col-span-6 pt-xl">
                <div class="rotate-3 inline-block">
                  <p class="mb-md">${categoryData.descriptionEn}</p>
                  <p>${categoryData.descriptionZh}</p>
                </div>
              </div>
            </div>
          </div>
        `;
        introContainer.insertAdjacentHTML('beforeend', introHtml);
      }

      // 2. Render Hero Image
      const heroHtml = `
        <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
          <div class="w-full md:mb-6xl md:mt-6xl">
            <img src="${categoryData.heroImage}" alt="${categoryKey}" class="w-full aspect-video object-cover">
          </div>
        </div>
      `;
      if (heroContainer) heroContainer.insertAdjacentHTML('beforeend', heroHtml);

      // 3. Render Projects (Groups)
      let projectsHtml = '';
      if (categoryData.projects && categoryData.projects.length > 0) {
        categoryData.projects.forEach(project => {
          // 圖片堆疊 HTML
          const imagesStackHtml = project.images.map((img, i) => {
            const rotation = i === 0 ? '-4deg' : (i === 1 ? '4deg' : '-4deg');
            const top = i * 80;
            const left = i === 0 ? '15%' : (i === 1 ? '25%' : '5%');
            const leftAdjusted = project.layout === 'text-left' ? (i === 0 ? '25%' : (i === 1 ? '35%' : '15%')) : left;
            
            return `<img src="${img}" alt="Work" class="absolute object-cover" style="aspect-ratio: 4/3; width: 50%; transform: rotate(${rotation}); top: ${top}px; left: ${leftAdjusted}; z-index: ${3-i};">`;
          }).join('');

          if (project.layout === 'image-left') {
            projectsHtml += `
              <div class="grid-12">
                <div class="col-span-12 md:col-span-6 relative flex justify-center items-center works-container md:mb-0">
                  ${imagesStackHtml}
                </div>
                <div class="col-span-12 md:col-start-7 md:col-span-5 flex items-center">
                  <div>
                    <h5 class="mb-sm md:mb-lg">${project.title}</h5>
                    ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
                    <p>${project.textZh}</p>
                  </div>
                </div>
              </div>
            `;
          } else {
            projectsHtml += `
              <div class="grid-12">
                <div class="col-span-12 md:col-start-2 md:col-span-5 flex items-center order-2 md:order-none">
                  <div>
                    <h5 class="mb-sm md:mb-lg">${project.title}</h5>
                    ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
                    <p>${project.textZh}</p>
                  </div>
                </div>
                <div class="col-span-12 md:col-start-7 md:col-span-6 relative flex justify-center items-center works-container order-1 md:order-none md:mb-0">
                  ${imagesStackHtml}
                </div>
              </div>
            `;
          }
        });
      }

      const detailsHtml = `
        <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
          <div class="flex flex-col gap-6xl pt-6xl">
            ${projectsHtml}
          </div>
        </div>
      `;
      if (detailsContainer) detailsContainer.insertAdjacentHTML('beforeend', detailsHtml);
    });

  } catch (error) {
    console.error('Error loading MDES works data:', error);
  }
}