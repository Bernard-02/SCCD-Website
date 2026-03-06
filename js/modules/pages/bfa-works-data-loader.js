/**
 * BFA / MDES Works Data Loader
 * 負責讀取 Works JSON 資料並渲染到頁面上
 * loadBFAWorks() — 含影片、intro 旋轉關閉
 * loadMDESWorks() — 無影片、intro 含旋轉 class
 */

// ── 共用 HTML Builders ────────────────────────────────────────────────────────

function buildImagesStack(project) {
  const verticalOffsets = [-80, 0, 80];
  return project.images.map((img, i) => {
    const rotation = i === 1 ? '4deg' : '-4deg';
    const left = i === 0 ? '25%' : (i === 1 ? '35%' : '15%');
    return `<img src="${img}" alt="Work" class="absolute object-cover" data-z="${i+1}" style="aspect-ratio: 4/3; width: 50%; transform: rotate(${rotation}) translateY(calc(-50% + ${verticalOffsets[i] ?? 0}px)); top: 50%; left: ${left}; z-index: ${i+1};">`;
  }).join('');
}

function buildProjectHtml(project) {
  const stack = buildImagesStack(project);
  if (project.layout === 'image-left') {
    return `
      <div class="grid-12">
        <div class="col-span-12 md:col-span-6 relative works-container md:mb-0">${stack}</div>
        <div class="col-span-12 md:col-start-7 md:col-span-5 flex items-center">
          <div>
            <h5 class="mb-sm md:mb-lg">${project.title}</h5>
            ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
            <p>${project.textZh}</p>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="grid-12">
      <div class="col-span-12 md:col-start-2 md:col-span-5 flex items-center order-2 md:order-none">
        <div>
          <h5 class="mb-sm md:mb-lg">${project.title}</h5>
          ${project.textEn ? `<p class="mb-sm">${project.textEn}</p>` : ''}
          <p>${project.textZh}</p>
        </div>
      </div>
      <div class="col-span-12 md:col-start-7 md:col-span-6 relative works-container order-1 md:order-none md:mb-0">${stack}</div>
    </div>`;
}

function buildVideoHtml(videoUrl) {
  if (!videoUrl) return '';
  const isEmbed = videoUrl.includes('youtube') || videoUrl.includes('vimeo') || videoUrl.includes('embed');
  const inner = isEmbed
    ? `<iframe class="w-full h-full" src="${videoUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<video class="w-full h-full" controls><source src="${videoUrl}" type="video/mp4">Your browser does not support the video tag.</video>`;
  return `
    <div class="grid-12">
      <div class="works-video-wrap col-span-12 md:col-start-2 md:col-span-10">
        <div class="w-full aspect-video bg-black">${inner}</div>
      </div>
    </div>`;
}

// ── 共用後處理（parallax、video scroll、hover）────────────────────────────────

function bindWorksInteractions(heroContainer, detailsContainer) {
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    heroContainer?.querySelectorAll('.works-hero-img').forEach(img => {
      gsap.fromTo(img, { yPercent: -8 }, {
        yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: img.closest('.works-content'), start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
    detailsContainer?.querySelectorAll('.works-video-wrap').forEach(wrap => {
      gsap.fromTo(wrap, { scale: 0.85 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'center center', scrub: true },
      });
    });
  }
  if (detailsContainer && SCCDHelpers.isDesktop()) {
    detailsContainer.addEventListener('mouseover', e => {
      const img = e.target.closest('.works-container img');
      if (img) img.style.zIndex = 10;
    });
    detailsContainer.addEventListener('mouseout', e => {
      const img = e.target.closest('.works-container img');
      if (img) img.style.zIndex = img.dataset.z;
    });
  }
}

// ── Renderers ─────────────────────────────────────────────────────────────────

async function loadWorks(jsonFile, { withVideo = false, introRotate = false } = {}) {
  try {
    const response = await fetch(jsonFile);
    const data = await response.json();

    const introContainer = document.getElementById('works-intro-container');
    const heroContainer = document.getElementById('works-hero-container');
    const detailsContainer = document.getElementById('works-details-container');

    if (introContainer) introContainer.innerHTML = '';
    if (heroContainer) heroContainer.innerHTML = '';
    if (detailsContainer) detailsContainer.innerHTML = '';

    Object.keys(data).forEach((categoryKey, index) => {
      const d = data[categoryKey];
      const hiddenClass = index === 0 ? '' : 'hidden';
      const projectsHtml = (d.projects || []).map(buildProjectHtml).join('');

      if (introContainer && d.titleHtml) {
        const h3Class = introRotate ? 'rotate--4 inline-block whitespace-nowrap' : 'inline-block whitespace-nowrap';
        const descClass = introRotate ? 'rotate-3 inline-block' : 'inline-block';
        introContainer.insertAdjacentHTML('beforeend', `
          <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
            <div class="grid-12 mb-6xl">
              <div class="col-span-12 md:col-start-2 md:col-span-2 mb-lg md:mb-0">
                <h3 class="${h3Class}">${d.titleHtml}</h3>
              </div>
              <div class="col-span-12 md:col-start-6 md:col-span-6 pt-0 md:pt-xl">
                <div class="${descClass}">
                  <p class="mb-md">${d.descriptionEn}</p>
                  <p>${d.descriptionZh}</p>
                </div>
              </div>
            </div>
          </div>`);
      }

      if (heroContainer) {
        heroContainer.insertAdjacentHTML('beforeend', `
          <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
            <div class="w-full md:mt-6xl overflow-hidden">
              <img src="${d.heroImage}" alt="${categoryKey}" class="works-hero-img w-full aspect-video object-cover scale-[1.15]">
            </div>
          </div>`);
      }

      if (detailsContainer) {
        const detailsPy = withVideo ? 'py-6xl' : 'pt-6xl';
        detailsContainer.insertAdjacentHTML('beforeend', `
          <div class="works-content ${hiddenClass}" data-category="${categoryKey}">
            <div class="flex flex-col gap-6xl ${detailsPy}">
              ${projectsHtml}
            </div>
            ${withVideo ? buildVideoHtml(d.videoUrl) : ''}
          </div>`);
      }
    });

    bindWorksInteractions(heroContainer, detailsContainer);
  } catch (error) {
    console.error('Error loading works data:', error);
  }
}

export async function loadBFAWorks() {
  return loadWorks('../data/bfa-works.json', { withVideo: true, introRotate: false });
}

export async function loadMDESWorks() {
  return loadWorks('../data/mdes-works.json', { withVideo: false, introRotate: true });
}