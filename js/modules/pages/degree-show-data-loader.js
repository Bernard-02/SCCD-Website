/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

export async function loadDegreeShowList() {
  try {
    const response = await fetch('../data/degree-show.json');
    const data = await response.json();
    const container = document.getElementById('degree-show-list');

    if (!container) return;

    const years = Object.keys(data).sort((a, b) => b - a); // Sort years descending

    years.forEach(year => {
      const item = data[year];
      const html = `
        <div class="grid-12">
          <div class="col-span-12 md:col-span-2 mb-sm md:mb-0"><h5>${year}</h5></div>
          <a href="degree-show-detail.html?year=${year}" class="col-span-12 md:col-start-3 md:col-span-10 block group">
            <div class="degree-show-img-wrapper overflow-hidden mb-md">
              <img src="${item.coverImage}" alt="Degree Show ${year}" loading="lazy" class="w-full object-cover transition-transform duration-700 group-hover:scale-105">
            </div>
            <h5 class="mt-md group-hover:text-gray-6 transition-colors duration-fast">${item.title}</h5>
          </a>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });
  } catch (error) {
    console.error('Error loading degree show data:', error);
  }
}

export async function loadDegreeShowDetail() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');

  if (!year) {
      window.location.href = 'degree-show.html';
      return;
  }

  try {
    const response = await fetch('../data/degree-show.json');
    const degreeShowData = await response.json();
    const data = degreeShowData[year];
    const years = Object.keys(degreeShowData).sort((a, b) => b - a);

    if (data) {
      document.title = `Degree Show ${year} - SCCD`;

      // Text Content
      const titleEl = document.getElementById('text-title');
      const yearEl = document.getElementById('text-year');
      const descEnEl = document.getElementById('text-desc-en');
      const descCnEl = document.getElementById('text-desc-cn');

      if (titleEl) titleEl.textContent = data.title;
      if (yearEl) yearEl.textContent = year;
      if (descEnEl) descEnEl.textContent = data.descEn;
      if (descCnEl) descCnEl.textContent = data.descCn;

      // Hero Image
      const heroImg = document.getElementById('hero-img');
      if (heroImg && data.coverImage) {
        heroImg.src = data.coverImage;
      }

      // Gallery
      const galleryContainer = document.getElementById('gallery-container');
      if (galleryContainer) {
          galleryContainer.innerHTML = '';
          if (data.images && Array.isArray(data.images)) {
            const images = data.images;
            let i = 0;
            while (i < images.length) {
              const remaining = images.length - i;
              if (i % 6 === 0 && remaining >= 2) {
                const row = document.createElement('div');
                row.className = 'grid-12';
                row.innerHTML = `
                  <div class="col-span-12 md:col-span-6"><img src="${images[i]}" alt="" class="w-full object-cover"></div>
                  <div class="col-span-12 md:col-span-6"><img src="${images[i+1]}" alt="" class="w-full object-cover"></div>
                `;
                galleryContainer.appendChild(row);
                i += 2;
              } else if (i % 6 === 2 && remaining >= 1) {
                const row = document.createElement('div');
                row.className = 'grid-12';
                row.innerHTML = `<div class="col-span-12"><img src="${images[i]}" alt="" class="w-full object-cover"></div>`;
                galleryContainer.appendChild(row);
                i += 1;
              } else if (i % 6 === 3 && remaining >= 3) {
                const row = document.createElement('div');
                row.className = 'grid-12';
                row.innerHTML = `
                  <div class="col-span-12 md:col-span-4"><img src="${images[i]}" alt="" class="w-full object-cover aspect-[4/3]"></div>
                  <div class="col-span-12 md:col-span-4"><img src="${images[i+1]}" alt="" class="w-full object-cover aspect-[4/3]"></div>
                  <div class="col-span-12 md:col-span-4"><img src="${images[i+2]}" alt="" class="w-full object-cover aspect-[4/3]"></div>
                `;
                galleryContainer.appendChild(row);
                i += 3;
              } else {
                const row = document.createElement('div');
                row.className = 'grid-12';
                row.innerHTML = `<div class="col-span-12"><img src="${images[i]}" alt="" class="w-full object-cover"></div>`;
                galleryContainer.appendChild(row);
                i += 1;
              }
            }
          }
      }

      // Video
      const videoSection = document.getElementById('video-section');
      const videoWrapper = document.getElementById('video-wrapper');
      if (videoSection && videoWrapper) {
          if (data.videoUrl) {
            videoSection.classList.remove('hidden');
            if (data.videoUrl.includes('youtube') || data.videoUrl.includes('vimeo') || data.videoUrl.includes('embed')) {
               videoWrapper.innerHTML = `<iframe class="w-full h-full" src="${data.videoUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            } else {
               videoWrapper.innerHTML = `<video class="w-full h-full" controls><source src="${data.videoUrl}" type="video/mp4">Your browser does not support the video tag.</video>`;
            }
          } else {
            videoSection.classList.add('hidden');
            videoWrapper.innerHTML = '';
          }
      }

      // Next Project
      const idx = years.indexOf(year);
      const nextYear = years[(idx + 1) % years.length];
      const nextData = degreeShowData[nextYear];

      const nextLink = document.getElementById('next-link');
      const nextYearEl = document.getElementById('next-year');
      const nextTitleEl = document.getElementById('next-title');
      const nextImg = document.getElementById('next-img');
      const nextYearMobileEl = document.getElementById('next-year-mobile');
      const nextTitleMobileEl = document.getElementById('next-title-mobile');

      if (nextLink) nextLink.href = 'degree-show-detail.html?year=' + nextYear;
      if (nextYearEl) nextYearEl.textContent = nextYear;
      if (nextTitleEl) nextTitleEl.textContent = nextData.title;
      if (nextImg && nextData.coverImage) nextImg.src = nextData.coverImage;
      if (nextYearMobileEl) nextYearMobileEl.textContent = nextYear;
      if (nextTitleMobileEl) nextTitleMobileEl.textContent = nextData.title;

    } else {
      window.location.href = 'degree-show.html';
    }
  } catch (error) {
    console.error('Error loading degree show detail data:', error);
  }
}