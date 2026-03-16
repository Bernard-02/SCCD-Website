/**
 * Activities Data Loader Module
 * 負責讀取 JSON 資料並渲染 Activities 相關頁面的 HTML
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';

// 動態設定年份 toggle 的 sticky top（對應所在 panel 的 search bar 底部）
function updateYearToggleStickyTopForPanel(container) {
  if (window.innerWidth < 768) return;
  const panel = container.closest('.activities-panel');
  const filterBar = panel ? panel.querySelector('.activities-filter-bar') : null;
  const stickyTop = filterBar ? 160 + filterBar.offsetHeight : 160;
  container.querySelectorAll('.list-year-toggle').forEach(el => {
    el.style.top = stickyTop + 'px';
  });
}

// Helper: 為 list-item 內的海報及 gallery 圖片加上 hover 灰階 + screen overlay 效果
export function bindMediaHover(container) {
  container.querySelectorAll('.list-item').forEach(workshopItem => {
    const header = workshopItem.querySelector('.list-header');

    const applyHover = (wrapper) => {
      if (wrapper.dataset.hoverInit) return;
      wrapper.dataset.hoverInit = '1';
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 0.3s ease;pointer-events:none;z-index:1;mix-blend-mode:screen;';
      if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
      wrapper.appendChild(overlay);
      wrapper.addEventListener('mouseenter', () => {
        const color = header?.style.background || '#888888';
        overlay.style.background = color;
        overlay.style.opacity = '1';
        const img = wrapper.querySelector('img');
        if (img) img.style.filter = 'grayscale(100%)';
      });
      wrapper.addEventListener('mouseleave', () => {
        overlay.style.opacity = '0';
        const img = wrapper.querySelector('img');
        if (img) img.style.filter = '';
      });
    };

    // 海報及所有有 data-lightbox-open 的容器
    workshopItem.querySelectorAll('[data-lightbox-open]').forEach(wrapper => applyHover(wrapper));

    // gallery 裸 <img>（沒有包在 [data-lightbox-open] 裡的）
    workshopItem.querySelectorAll('.gallery-inner img').forEach(img => {
      const existingWrapper = img.closest('[data-lightbox-open]');
      if (!existingWrapper) applyHover(img.parentElement);
    });
  });
}

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

// ── Shared HTML Builders ─────────────────────────────────────────────────────

// 建立 media list（海報 → videos → images）
export function buildItemMedia(item) {
  return [
    ...(item.poster ? [{ type: 'image', src: item.poster, thumb: item.poster }] : []),
    ...(item.videos || []).map(url => {
      const vid = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      return vid ? { type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` } : null;
    }).filter(Boolean),
    ...(item.images || []).map(src => ({ type: 'image', src, thumb: src })),
  ];
}

// 海報區塊 HTML
export function buildPosterHtml(item) {
  if (!item.poster) return '';
  return `
    <div class="overflow-hidden cursor-pointer" data-lightbox-open data-lightbox-index="0">
      <img src="${item.poster}" alt="${item.title} poster" class="poster-img w-full block object-cover">
    </div>
  `;
}

// Gallery 區塊 HTML（videos + images）
export function buildGalleryHtml(item) {
  const posterOffset = item.poster ? 1 : 0;
  const galleryItems = [
    ...(item.videos || []).map((url, vi) => {
      const videoId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      if (!videoId) return '';
      const lbIndex = posterOffset + vi;
      return `<div class="h-full flex-shrink-0 aspect-video relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" class="w-full h-full object-cover block">
        <div class="absolute inset-0 bg-black" style="opacity:0.2;"></div>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,0 20,12 0,24" fill="white" fill-opacity="0.5"/>
          </svg>
        </div>
      </div>`;
    }),
    ...(item.images || []).map((src, ii) => {
      const lbIndex = posterOffset + (item.videos || []).length + ii;
      return `<div class="h-full flex-shrink-0 relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="${src}" alt="" class="h-full w-auto block">
      </div>`;
    }),
  ].filter(Boolean);

  if (galleryItems.length === 0) return '';
  return `
    <div class="gallery-section px-xs pb-lg flex items-center gap-xs">
      <button class="gallery-prev invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="gallery-track flex-1 overflow-hidden" style="height: 120px;">
        <div class="gallery-inner flex gap-md h-full" style="transition: transform 0.3s ease;">
          ${galleryItems.join('')}
        </div>
      </div>
      <button class="gallery-next invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  `;
}

// ── Shared Post-Render Bindings ───────────────────────────────────────────────

// Gallery 滑動、Lightbox、hover、海報比例偵測；回傳 GSAP 動畫啟動函數
export function bindInteractions(container) {
  // Gallery 左右滑動
  container.querySelectorAll('.gallery-section').forEach(gallery => {
    const inner = gallery.querySelector('.gallery-inner');
    const track = gallery.querySelector('.gallery-track');
    const prevBtn = gallery.querySelector('.gallery-prev');
    const nextBtn = gallery.querySelector('.gallery-next');
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    const updateChevrons = () => {
      const max = getMaxOffset();
      prevBtn?.classList.toggle('invisible', max === 0);
      nextBtn?.classList.toggle('invisible', max === 0);
    };
    gallery.closest('.list-item')?.addEventListener('gallery:check', updateChevrons);
    const STEP = () => track.clientWidth * 0.6;
    prevBtn?.addEventListener('click', () => {
      offset = Math.max(0, offset - STEP());
      inner.style.transform = `translateX(-${offset}px)`;
    });
    nextBtn?.addEventListener('click', () => {
      offset = Math.min(getMaxOffset(), offset + STEP());
      inner.style.transform = `translateX(-${offset}px)`;
    });
  });

  // Lightbox 綁定
  container.querySelectorAll('.list-item').forEach(workshopItem => {
    const media = JSON.parse(workshopItem.dataset.media || '[]');
    if (media.length === 0) return;
    workshopItem.querySelectorAll('[data-lightbox-open]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const index = parseInt(el.dataset.lightboxIndex, 10) || 0;
        openLightbox(media, index);
      });
    });
  });

  // 海報 & gallery hover 效果
  bindMediaHover(container);

  // 標題跑馬燈：偵測是否溢出，是則加 is-overflow + 設定捲動距離
  const initMarquees = () => {
    if (window.innerWidth < 768) return;
    container.querySelectorAll('.list-title-marquee').forEach(wrap => {
      const p = wrap.querySelector('p');
      if (!p) return;
      const checkOverflow = () => {
        if (p.scrollWidth > wrap.clientWidth + 1) {
          wrap.classList.add('is-overflow');
          if (!wrap.dataset.marqueeInit) {
            wrap.dataset.marqueeInit = '1';
            const clone = p.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            p.style.paddingRight = '3rem';
            clone.style.paddingRight = '3rem';
            wrap.appendChild(clone);
          }
          const offset = p.offsetWidth;
          wrap.style.setProperty('--marquee-offset', `-${offset}px`);
          const speed = Math.max(3, offset / 80);
          wrap.style.setProperty('--marquee-duration', `${speed}s`);
        } else {
          wrap.classList.remove('is-overflow');
        }
      };
      checkOverflow();
      window.addEventListener('resize', checkOverflow);
    });
  };
  requestAnimationFrame(initMarquees);

  // 海報比例偵測
  container.querySelectorAll('.poster-img').forEach(img => {
    const apply = () => {
      const grid = img.closest('.list-content')?.querySelector('[style*="grid-template-columns"]');
      if (img.naturalWidth > img.naturalHeight) {
        img.classList.replace('object-cover', 'object-contain');
        img.classList.add('object-top');
        if (grid) grid.style.gridTemplateColumns = '8.5fr 3.5fr';
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  });

  // Ref cover 比例偵測（直圖：固定小寬度；橫圖：擴大容器，object-contain）
  container.querySelectorAll('.ref-cover-img').forEach(img => {
    const apply = () => {
      const wrapper = img.parentElement;
      const titleDiv = wrapper?.previousElementSibling;
      if (img.naturalWidth > img.naturalHeight) {
        // 橫圖：圖佔較大比例，文字縮小
        wrapper.style.width = '40%';
        wrapper.style.flexShrink = '0';
        img.style.objectFit = 'contain';
        img.style.width = '100%';
        img.style.height = '100%';
        if (titleDiv) titleDiv.style.flex = '1';
      } else {
        // 直圖：圖保持小寬度
        wrapper.style.width = 'auto';
        wrapper.style.flexShrink = '0';
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  });

  // Workshop reference 按鈕
  container.querySelectorAll('.workshop-ref-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.refSection;
      const itemId  = btn.dataset.refItem;
      if (typeof window.__sccdNavigateToItem === 'function') {
        window.__sccdNavigateToItem(section, itemId || null);
      }
    });
  });

  // 進場動畫：回傳啟動函數
  if (typeof gsap === 'undefined') return null;

  const allSets = [...container.querySelectorAll('.list-year-group')].map(group => {
    const yearToggle = group.querySelector('.list-year-toggle');
    const items = group.querySelectorAll('.list-item');
    const divider = group.nextElementSibling?.classList.contains('activities-separator')
      ? group.nextElementSibling : null;
    return { items: [...(yearToggle ? [yearToggle] : []), ...items, ...(divider ? [divider] : [])] };
  }).filter(s => s.items.length > 0);

  if (allSets.length === 0) return null;

  allSets.forEach(({ items }) => gsap.set(items, { y: 100, opacity: 0 }));

  return () => {
    allSets.forEach(({ items }, i) => {
      gsap.to(items, {
        y: 0, opacity: 1,
        duration: 0.6,
        delay: i * 0.15,
        stagger: { each: 0.1, grid: 'auto', axis: 'y' },
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    });
  };
}

// ── 1. Workshops & Students Present Renderer ──────────────────────────────────

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
      const media = buildItemMedia(item);
      const mediaJson = JSON.stringify(media).replace(/"/g, '&quot;');
      const refCoverSrc = item.reference?.coverSrc || '';

      return `
        <div class="list-item ${!isItemLast ? 'border-b-4 border-black' : ''} overflow-hidden" data-media="${mediaJson}"${item.id ? ` id="item-${item.id}"` : ''}>
          <div class="list-header cursor-pointer group transition-colors duration-fast flex items-start justify-between px-[4px] py-sm">
            <div class="flex flex-col gap-xs flex-1 min-w-0">
              <div>
                <div class="list-title-marquee"><p class="text-h5 font-bold">${item.title}</p></div>
                ${item.title_zh ? `<div class="list-title-marquee"><p class="text-h5 font-bold">${item.title_zh}</p></div>` : ''}
              </div>
              ${(item.subtitle || item.subtitle_zh) ? `<div>
                ${item.subtitle ? `<p class="text-p2">${item.subtitle}</p>` : ''}
                ${item.subtitle_zh ? `<p class="text-p2">${item.subtitle_zh}</p>` : ''}
              </div>` : ''}
            </div>
            <div class="flex items-start gap-sm flex-shrink-0 pt-[0.25rem]">
              ${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}
              <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
            </div>
          </div>
          <div class="list-content h-0 overflow-hidden">
            <div class="pt-sm pb-lg px-xl grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
              <div class="flex flex-col gap-md pr-2xl">
                ${(item.date || item.location || item.location_zh) ? `<div class="flex gap-xl">
                  ${item.date ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${item.date.replace(/\./g, ' / ').replace(/ - /g, '&nbsp;&nbsp;-&nbsp;&nbsp;').replace(/ \/ /g, '&nbsp;/&nbsp;')}</p></div>` : ''}
                  ${(item.location || item.location_zh) ? `<div>
                    ${item.location ? `<p class="text-p2 font-bold">${item.location.replace(/  \/  /g, '&nbsp;&nbsp;/&nbsp;&nbsp;')}</p>` : ''}
                    ${item.location_zh ? `<p class="text-p2 font-bold">${item.location_zh.replace(/  \/  /g, '&nbsp;&nbsp;/&nbsp;&nbsp;')}</p>` : ''}
                  </div>` : ''}
                </div>` : ''}
                ${item.guests && item.guests.length ? `<div class="flex flex-col gap-xs">
                  ${item.guests.map(g => `<div class="flex gap-2xl">
                    <div class="flex-1"><p class="text-p2 font-bold">${g.name}</p><p class="text-p2 font-bold">${g.name_zh}</p>${g.affiliation ? `<p class="text-p3">${g.affiliation.length > 20 ? `${g.affiliation}<br>${g.affiliation_zh || ''}` : `${g.affiliation}${g.affiliation_zh ? ' ' + g.affiliation_zh : ''}`}</p>` : ''}</div>
                    ${g.country ? `<div class="flex-shrink-0"><p class="text-p2">${g.country}${g.country_zh ? ` ${g.country_zh}` : ''}</p></div>` : ''}
                  </div>`).join('')}
                </div>` : ''}
                <div class="overflow-y-auto pr-xl" style="max-height: 250px; background: transparent;">
                  <p class="text-p2 leading-base">${item.intro}</p>
                  ${item.intro_zh ? `<p class="text-p2 leading-base mt-md">${item.intro_zh}</p>` : ''}
                </div>
              </div>
              ${buildPosterHtml(item)}
            </div>
            ${buildGalleryHtml(item)}
            ${item.reference ? `
            <div class="px-xl pb-lg" style="max-width: calc(9.5 / 12 * 100%);">
              <button class="workshop-ref-btn cursor-pointer border-none bg-none p-0 w-full flex items-start gap-sm text-left"
                data-ref-section="${item.reference.section}"
                data-ref-item="${item.reference.itemId || ''}">
                <i class="fa-solid fa-arrow-right text-p2 flex-shrink-0" style="padding-top: 0.25rem;"></i>
                <div class="flex flex-col flex-1 min-w-0 gap-xs">
                  <p class="text-p2 text-black">${item.reference.labelEn || ''} ${item.reference.labelZh || ''}</p>
                  <div class="flex items-start justify-between gap-xl">
                    <div class="flex flex-col min-w-0">
                      ${item.reference.titleEn ? `<p class="text-p2 font-bold text-black">${item.reference.titleEn}</p>` : ''}
                      ${item.reference.titleZh ? `<p class="text-p2 font-bold text-black">${item.reference.titleZh}</p>` : ''}
                    </div>
                    ${refCoverSrc ? `<div class="flex-shrink-0" style="height: 5rem;"><img src="${refCoverSrc}" alt="" class="ref-cover-img h-full w-auto block"></div>` : ''}
                  </div>
                </div>
              </button>
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="list-year-group grid-12 items-start">
        <div class="col-span-12 md:col-span-1 md:col-start-1 list-year-toggle cursor-pointer flex items-center gap-sm order-1 py-sm pl-xs md:sticky md:self-start md:pb-sm">
          <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
          <h5>${yearGroup.year}</h5>
        </div>
        <div class="col-span-12 md:col-span-11 md:col-start-2 list-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
    `);
  });

  updateYearToggleStickyTopForPanel(container);
  return bindInteractions(container);
}

// ── 2. Summer Camp Renderer ───────────────────────────────────────────────────

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
    const itemsHtml = yearGroup.items.map((item, idx) => {
      const isItemLast = idx === yearGroup.items.length - 1;
      const mediaJson = JSON.stringify(buildItemMedia(item)).replace(/"/g, '&quot;');

      return `
        <div class="list-item ${!isItemLast ? 'border-b-4 border-black' : ''} overflow-hidden" data-media="${mediaJson}">
          <div class="flex items-start">
            <h5 class="font-bold flex-shrink-0 py-sm pr-xl">${yearGroup.year}</h5>
            <div class="flex-1 min-w-0">
              <div class="list-header cursor-pointer group transition-colors duration-fast flex items-start justify-between px-[4px] py-sm">
                <div class="text-h5 font-bold">${item.title_en ? item.title_en : item.title}${item.title_en ? `<br><span class="text-h5 font-bold">${item.title}</span>` : ''}</div>
                <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
              </div>
              <div class="list-content h-0 overflow-hidden">
                <div class="pt-sm pb-lg px-xl grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
                  <div class="flex flex-col gap-md pr-2xl">
                    ${(item.date || item.location) ? `<div class="flex gap-xl">
                      ${item.date ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${item.date.replace(/\./g, ' / ')}</p></div>` : ''}
                      ${item.location ? `<div><p class="text-p2 font-bold">${item.location}</p></div>` : ''}
                    </div>` : ''}
                    <div class="overflow-y-auto pr-xl" style="max-height: 250px; background: transparent;">
                      <p class="text-p2 leading-base">${item.descriptionEn}</p>
                      ${item.descriptionZh ? `<p class="text-p2 leading-base mt-md">${item.descriptionZh}</p>` : ''}
                    </div>
                  </div>
                  ${buildPosterHtml(item)}
                </div>
                ${buildGalleryHtml(item)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="list-year-group">
        ${itemsHtml}
      </div>
      ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
    `);
  });

  return bindInteractions(container);
}
