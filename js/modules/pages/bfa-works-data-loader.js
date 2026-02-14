/**
 * BFA Works Data Loader
 * 負責讀取 BFA Works JSON 資料並渲染到頁面上
 */

export async function loadBFAWorks() {
  try {
    const response = await fetch('../data/bfa-works.json');
    const data = await response.json();

    const introContainer = document.getElementById('works-intro-container');
    const heroContainer = document.getElementById('works-hero-container');
    const detailsContainer = document.getElementById('works-details-container');

    if (!introContainer || !heroContainer || !detailsContainer) return;

    // 清空容器
    introContainer.innerHTML = '';
    heroContainer.innerHTML = '';
    detailsContainer.innerHTML = '';

    // 遍歷每個類別 (design-fundamental, animation, creative-media)
    Object.keys(data).forEach((categoryKey, index) => {
      const categoryData = data[categoryKey];
      // 第一個類別預設顯示，其他隱藏 (配合 works-filter.js 的邏輯)
      const hiddenClass = index === 0 ? '' : 'hidden';

      // 1. Render Intro (Text Description)
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

      // 2. Render Hero Image
      const heroHtml = `
        <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
          <div class="w-full mb-6xl mt-6xl">
            <img src="${categoryData.heroImage}" alt="${categoryKey}" class="w-full aspect-video object-cover">
          </div>
        </div>
      `;
      heroContainer.insertAdjacentHTML('beforeend', heroHtml);

      // 3. Render Projects (Groups)
      let projectsHtml = '';
      if (categoryData.projects && categoryData.projects.length > 0) {
        categoryData.projects.forEach(project => {
          // 圖片堆疊 HTML
          const imagesStackHtml = project.images.map((img, i) => {
            const rotation = i === 0 ? '-4deg' : (i === 1 ? '4deg' : '-4deg');
            const top = i * 80;
            const left = i === 0 ? '15%' : (i === 1 ? '25%' : '5%');
            // 調整第二組 (Text Left) 的圖片位置微調
            const leftAdjusted = project.layout === 'text-left' ? (i === 0 ? '25%' : (i === 1 ? '35%' : '15%')) : left;
            
            return `<img src="${img}" alt="Work" class="absolute object-cover" style="aspect-ratio: 4/3; width: 50%; transform: rotate(${rotation}); top: ${top}px; left: ${leftAdjusted}; z-index: ${3-i};">`;
          }).join('');

          if (project.layout === 'image-left') {
            projectsHtml += `
              <div class="grid-12">
                <div class="col-span-6 relative flex justify-center items-center h-works-container">
                  ${imagesStackHtml}
                </div>
                <div class="col-start-7 col-span-5 flex items-center">
                  <div>
                    <h5 class="mb-lg">${project.title}</h5>
                    ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
                    <p>${project.textZh}</p>
                  </div>
                </div>
              </div>
            `;
          } else {
            projectsHtml += `
              <div class="grid-12">
                <div class="col-start-2 col-span-5 flex items-center">
                  <div>
                    <h5 class="mb-lg">${project.title}</h5>
                    ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
                    <p>${project.textZh}</p>
                  </div>
                </div>
                <div class="col-start-7 col-span-6 relative flex justify-center items-center h-works-container">
                  ${imagesStackHtml}
                </div>
              </div>
            `;
          }
        });
      }

      // 4. Render Video (Part 4)
      let videoHtml = '';
      
      // 如果有設定 videoUrl，則顯示影片；否則隱藏 (與 degree-show-detail.html 邏輯一致)
      if (categoryData.videoUrl) {
        let videoContent = '';
        if (categoryData.videoUrl.includes('youtube') || categoryData.videoUrl.includes('vimeo') || categoryData.videoUrl.includes('embed')) {
            videoContent = `<div class="w-full aspect-video bg-black"><iframe class="w-full h-full" src="${categoryData.videoUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else {
            videoContent = `<div class="w-full aspect-video bg-black"><video class="w-full h-full" controls><source src="${categoryData.videoUrl}" type="video/mp4">Your browser does not support the video tag.</video></div>`;
        }

        videoHtml = `
          <div class="grid-12">
              <div class="col-start-2 col-span-10">
                  ${videoContent}
              </div>
          </div>
        `;
      }

      const detailsHtml = `
        <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
          <div class="flex flex-col gap-6xl py-6xl">
            ${projectsHtml}
          </div>
          ${videoHtml}
        </div>
      `;
      detailsContainer.insertAdjacentHTML('beforeend', detailsHtml);
    });

  } catch (error) {
    console.error('Error loading BFA works data:', error);
  }
}