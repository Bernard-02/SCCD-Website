/**
 * Activities Data Loader Module
 * 負責讀取 JSON 資料並渲染 Activities 相關頁面的 HTML
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { buildInitialScrollTrigger } from '../animations/list-scroll-trigger.js';
import { animateCards } from '../ui/scroll-animate.js';

// ── Reference 自動 lookup ─────────────────────────────────────────────────────
// ref 只填 { section, itemId } 即可；title/cover/label 渲染前自動從目標 JSON lookup。
// 已手動填的欄位（titleEn/titleZh/coverSrc/labelEn/labelZh）視為 override，不覆蓋。

const SECTION_DATA_URL = {
  workshop:           '/data/workshops.json',
  industry:           '/data/industry.json',
  lectures:           '/data/lectures.json',
  'students-present': '/data/students-present.json',
  'summer-camp':      '/data/summer-camp.json',
  exhibitions:        '/data/general-activities.json',
  competitions:       '/data/general-activities.json',
  conferences:        '/data/general-activities.json',
  visits:             '/data/general-activities.json',
};

const SECTION_LABELS = {
  workshop:           { en: 'Workshop',                      zh: '工作坊' },
  industry:           { en: 'Industry-Academia Cooperation', zh: '產學合作' },
  lectures:           { en: 'Lectures',                      zh: '講座' },
  'students-present': { en: 'Students Present',              zh: '學生自主' },
  'summer-camp':      { en: 'Summer Camp',                   zh: '暑期體驗營' },
  exhibitions:        { en: 'Exhibitions',                   zh: '展演' },
  competitions:       { en: 'Competitions',                  zh: '競賽' },
  conferences:        { en: 'Conferences',                   zh: '研討會' },
  visits:             { en: 'Visits',                        zh: '參訪' },
};

const _refDataCache = new Map();

async function getSectionData(section) {
  // 特例：exhibitions section 同時涵蓋 special（general-activities.json category=exhibitions）+ permanent（permanent-exhibitions.json）
  if (section === 'exhibitions') {
    const cacheKey = '__exhibitions_merged__';
    if (_refDataCache.has(cacheKey)) return _refDataCache.get(cacheKey);
    const promise = Promise.all([
      fetch('/data/general-activities.json').then(r => r.json()),
      fetch('/data/permanent-exhibitions.json').then(r => r.json()),
    ]).then(([a, b]) => [
      ...(Array.isArray(a) ? a : []),
      ...(Array.isArray(b) ? b : []),
    ]).catch(e => {
      console.warn('ref lookup: failed to merge exhibitions', e);
      return null;
    });
    _refDataCache.set(cacheKey, promise);
    return promise;
  }

  const url = SECTION_DATA_URL[section];
  if (!url) return null;
  if (_refDataCache.has(url)) return _refDataCache.get(url);
  const promise = fetch(url).then(r => r.json()).catch(e => {
    console.warn('ref lookup: failed to load', url, e);
    return null;
  });
  _refDataCache.set(url, promise);
  return promise;
}

function findItemById(data, itemId) {
  if (!Array.isArray(data)) return null;
  for (const yg of data) {
    for (const item of yg.items || []) {
      if (item.id === itemId) return item;
    }
  }
  return null;
}

// 補齊 ref 缺失欄位（title/cover/label）；已存在的欄位不覆蓋
async function resolveRef(ref) {
  if (!ref.section || !ref.itemId) return;

  // label 用 section 對應表自動填（若 ref 沒寫）
  const labelMap = SECTION_LABELS[ref.section];
  if (labelMap) {
    if (!ref.labelEn) ref.labelEn = labelMap.en;
    if (!ref.labelZh) ref.labelZh = labelMap.zh;
  }

  // title/cover 需要去目標 JSON lookup
  if (ref.titleEn && ref.titleZh && ref.coverSrc) return;

  const data = await getSectionData(ref.section);
  if (!data) return;
  const item = findItemById(data, ref.itemId);
  if (!item) return;

  // 兩種命名模式：
  //  A) title=zh, title_en=en（industry / lectures / summer-camp / general-activities）
  //  B) title=en, title_zh=zh（workshops / students-present）
  const isModeA = !!item.title_en;
  const targetEn = isModeA ? item.title_en : item.title;
  const targetZh = isModeA ? item.title    : item.title_zh;

  if (!ref.titleEn  && targetEn) ref.titleEn  = targetEn;
  if (!ref.titleZh  && targetZh) ref.titleZh  = targetZh;
  if (!ref.coverSrc) {
    ref.coverSrc = item.poster || item.cover || (item.images && item.images[0]) || '';
  }
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

// Albums list HTML（每筆 = 一個 album，各自有獨立 media，點擊開 lightbox）
export function buildAlbumsHtml(item) {
  if (!item.albums?.length) return '';

  const itemsHtml = item.albums.map((album, gi) => {
    const isLast = gi === item.albums.length - 1;
    const hasImages = album.images?.length > 0;
    const mediaJson = hasImages
      ? JSON.stringify(album.images.map(src => ({ type: 'image', src, thumb: src }))).replace(/"/g, '&quot;')
      : '';
    return `
      <div class="album-thumb-item flex items-start gap-xl py-sm mr-xl ${!isLast ? 'border-b-4 border-black' : ''} ${hasImages ? 'cursor-pointer' : ''}"
           ${hasImages ? `data-album-media="${mediaJson}"` : ''}>
        ${album.date ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${album.date}</p></div>` : ''}
        ${album.location || album.location_zh ? `<div class="flex flex-1 items-start justify-between gap-xl">
          <div>
            ${album.location ? `<p class="text-p2 font-bold">${album.location}</p>` : ''}
            ${album.location_zh ? `<p class="text-p2 font-bold">${album.location_zh}</p>` : ''}
          </div>
          ${hasImages ? `<i class="fa-regular fa-images text-p2 flex-shrink-0"></i>` : ''}
        </div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="item-albums overflow-y-auto" style="max-height: 320px;">
      ${itemsHtml}
    </div>
  `;
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
    <div class="gallery-section pb-lg flex items-center">
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
  // Albums lightbox（每個 album-thumb-item 各自有 data-album-media）
  container.querySelectorAll('.album-thumb-item[data-album-media]').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const media = JSON.parse(thumb.dataset.albumMedia.replace(/&quot;/g, '"'));
      if (media.length) openLightbox(media, 0);
    });
  });

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

  // Ref link hover：cover grayscale + screen overlay（同 bindMediaHover 做法）
  if (window.innerWidth >= 768) {
    container.querySelectorAll('.list-ref-btn').forEach(btn => {
      const wrapper = btn.querySelector('.ref-cover-wrapper');
      const img = btn.querySelector('.ref-cover-img');
      if (!wrapper || !img) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 0.3s ease;pointer-events:none;z-index:1;mix-blend-mode:screen;';
      wrapper.appendChild(overlay);
      btn.addEventListener('mouseenter', () => {
        const listHeader = btn.closest('.list-item')?.querySelector('.list-header');
        const color = listHeader?.style.background || '#888888';
        overlay.style.background = color;
        overlay.style.opacity = '1';
        img.style.filter = 'grayscale(100%)';
      });
      btn.addEventListener('mouseleave', () => {
        overlay.style.opacity = '0';
        img.style.filter = '';
      });
    });
  }

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

  // Reference 按鈕（舊 workshop-ref-btn / industry-ref-btn 已統一為 list-ref-btn，此處保留相容）
  container.querySelectorAll('.workshop-ref-btn, .list-ref-btn').forEach(btn => {
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

// ── 日期格式：去掉年份，只留月份與日期 ────────────────────────────────────────
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace(/\d{4}\./g, '').replace(/\./g, ' / ').trim();
}

// ── 統一 List Renderer ────────────────────────────────────────────────────────
// options（全部預設顯示，需隱藏的才設 false）：
//   categoryFilter       {string|null}  過濾 item.category
//   showYearToggle       {boolean}      年份收合 toggle（預設 true；false = 顯示年份但不可收合，summer camp 用）
//   showSubtitle         {boolean}      subtitle / subtitle_zh（預設 false）
//   showAlumniIcon       {boolean}      畢業帽 icon（預設 true）
//   showDate             {boolean}      date（預設 true）
//   showDescription      {boolean}      description / descriptionZh（預設 true）
//   showLocation         {boolean}      location（預設 true）
//   showPoster           {boolean}      poster（預設 true）
//   showReference        {boolean}      ref link（預設 true）
//   showGuestAffiliation {boolean}      guest affiliation（預設 true）
//   showGuestCountry     {boolean}      guest alumni + country（預設 true）
//   fullDate             {boolean}      保留年份（預設 false = 去掉年份）
//   marqueeTitle         {boolean}      title 用 marquee 包裝（預設 false）
//   introField           {string}       內文 field 名稱（預設 'description'）
//   panelSelector        {string}       sticky top 參考的 panel selector
//   scrollTrigger        {boolean}      載入後自動建立 ScrollTrigger 動畫（預設 false）

export async function loadListInto(containerId, url, options = {}) {
  const {
    categoryFilter       = null,
    visitTypeFilter      = null,
    visitTypeField       = 'visitType',
    showYearToggle       = true,
    hideYearHeader       = false,
    showSubtitle         = false,
    showAlumniIcon       = true,
    showDescription      = true,
    showDate             = true,
    showLocation         = true,
    showPoster           = true,
    showReference        = true,
    showGuestAffiliation = true,
    showGuestCountry     = true,
    fullDate             = false,
    introField           = 'description',
    panelSelector        = null,
    scrollTrigger        = false,
  } = options;

  const container = document.getElementById(containerId);
  if (!container) return;

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    console.error('loadListInto: failed to load', url, e);
    return;
  }
  if (!data?.length) return;

  container.innerHTML = '';

  const filteredData = data
    .map(yg => ({
      ...yg,
      items: yg.items.filter(i =>
        (!categoryFilter  || i.category          === categoryFilter) &&
        (!visitTypeFilter || i[visitTypeField]   === visitTypeFilter)
      ),
    }))
    .filter(yg => yg.items.length > 0);

  // Resolve refs：補齊 title/cover/label（讓 ref 只填 section + itemId 即可運作）
  await Promise.all(filteredData.flatMap(yg =>
    yg.items.flatMap(item => {
      const refs = item.references || (item.reference ? [item.reference] : []);
      return refs.map(ref => resolveRef(ref));
    })
  ));

  filteredData.forEach((yearGroup, index) => {
    const isLast  = index === filteredData.length - 1;
    const total   = yearGroup.items.length;

    const itemsHtml = yearGroup.items.map((item, itemIdx) => {
      const media        = buildItemMedia(item);
      const mediaJson    = JSON.stringify(media).replace(/"/g, '&quot;');
      // 向下相容：支援舊的 reference 單一物件 → 自動轉為 array
      const references = item.references || (item.reference ? [item.reference] : []);
      const isLastItem   = itemIdx === total - 1;
      const borderClass  = !isLastItem ? 'border-b-4 border-black' : '';

      // 日期（date_en 英文在上，date 中文在下；無 date_en 則只顯示 date）
      const formatDate = (d) => fullDate
        ? (d ? d.replace(/\./g, ' / ').replace(/ - /g, '&nbsp;&nbsp;-&nbsp;&nbsp;').replace(/ \/ /g, '&nbsp;/&nbsp;') : '')
        : formatDateShort(d);
      const dateDisplay    = formatDate(item.date_en || item.date);
      const dateDisplayZh  = item.date_en ? formatDate(item.date) : '';

      // 內文 field（workshop 用 intro / intro_zh，其他用 description / descriptionZh）
      const introEn = item[introField] || item.description || '';
      const introZh = item[introField + '_zh'] || item.descriptionZh || '';

      // title HTML（所有 list 統一使用 marquee，文字太長時自動捲動）
      const titleLine1 = item.title_en ? item.title_en : item.title;
      const titleLine2 = item.title_en ? item.title : (item.title_zh || '');
      const titleHtml = `<div class="flex flex-col gap-xs flex-1 min-w-0">
          <div>
            <div class="list-title-marquee"><p class="text-h5 font-bold">${titleLine1}</p></div>
            ${titleLine2 ? `<div class="list-title-marquee"><p class="text-h5 font-bold">${titleLine2}</p></div>` : ''}
          </div>
          ${showSubtitle && (item.subtitle || item.subtitle_zh) ? `<div>
            ${item.subtitle ? `<p class="text-p2">${item.subtitle}</p>` : ''}
            ${item.subtitle_zh ? `<p class="text-p2">${item.subtitle_zh}</p>` : ''}
          </div>` : ''}
        </div>`;

      const searchText = [
        item.title, item.title_zh, item.title_en,
        item.subtitle, item.subtitle_zh,
        item[introField], item[introField + '_zh'],
        item.description, item.descriptionZh,
        item.location, item.location_zh,
        ...(item.guests || []).flatMap(g => [g.name, g.name_zh, g.affiliation, g.affiliation_zh]),
      ].filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');

      return `
        <div class="list-item overflow-hidden ${borderClass}" data-category="${item.category || ''}" data-media="${mediaJson}" data-search="${searchText}"${item.visitType ? ` data-visit-type="${item.visitType}"` : ''}${item.id ? ` id="item-${item.id}"` : ''}>
          <div class="list-header cursor-pointer group transition-colors duration-fast flex items-stretch justify-between px-[4px] py-sm">
            ${titleHtml}
            <div class="flex items-stretch gap-sm flex-shrink-0 pt-[0.25rem]">
              ${(() => {
                const hasAlumni = showAlumniIcon && item.guests?.some(g => g.isAlumni);
                const hasFlag = !!item.flag;
                const justify = (hasAlumni || hasFlag) ? 'justify-between' : 'justify-start';
                return `<div class="flex flex-col ${justify} self-stretch">
                <div class="flex items-center gap-sm">
                  ${hasAlumni ? `<i class="fa-solid fa-graduation-cap text-p2"></i>` : ''}
                  ${hasFlag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}
                </div>
                <div class="flex justify-end pb-xs">
                  <button data-share-btn class="hover:opacity-60 transition-opacity">
                    <i class="fa-solid fa-share-nodes text-h5"></i>
                  </button>
                </div>
              </div>`;
              })()}
              <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300 self-start"></i>
            </div>
          </div>
          <div class="list-content h-0 overflow-hidden">
            <div class="pt-sm pb-lg px-md grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
              <div class="flex flex-col gap-md pr-2xl">
                ${((showDate && dateDisplay) || (showLocation && (item.location || item.location_zh))) ? `<div class="flex gap-xl">
                  ${showDate && dateDisplay ? `<div class="flex-shrink-0">
                    <p class="text-p2 font-bold">${dateDisplay}</p>
                    ${dateDisplayZh ? `<p class="text-p2 font-bold">${dateDisplayZh}</p>` : ''}
                  </div>` : ''}
                  ${showLocation && (item.location || item.location_zh) ? `<div class="flex flex-1 items-start justify-between gap-xl">
                    <div>
                      ${item.location ? `<p class="text-p2 font-bold">${item.location.replace(/  \/  /g, '&nbsp;&nbsp;/&nbsp;&nbsp;')}</p>` : ''}
                      ${item.location_zh ? `<p class="text-p2 font-bold">${item.location_zh.replace(/  \/  /g, '&nbsp;&nbsp;/&nbsp;&nbsp;')}</p>` : ''}
                    </div>
                    ${(item.cityEn || item.cityZh) ? `<div class="flex-shrink-0 text-right">
                      ${item.cityEn ? `<p class="text-p2">${item.cityEn}</p>` : ''}
                      ${item.cityZh ? `<p class="text-p2">${item.cityZh}</p>` : ''}
                    </div>` : ''}
                  </div>` : ''}
                </div>` : ''}
                ${item.guests?.length ? `<div class="flex flex-col gap-sm">
                  ${item.guests.map(g => `<div class="flex flex-col" style="gap: 0.25rem;">
                    <div class="flex gap-2xl justify-between">
                      <div class="flex-1">
                        <p class="text-p2 font-bold">${g.name}</p>
                        ${g.name_zh ? `<p class="text-p2 font-bold">${g.name_zh}</p>` : ''}
                      </div>
                      ${showGuestCountry ? `<div class="flex-shrink-0 flex items-start gap-md">
                        ${g.isAlumni ? `<p class="text-p2">Alumni 系友</p>` : ''}
                        ${g.country ? `<p class="text-p2">${g.country}${g.country_zh ? ` ${g.country_zh}` : ''}</p>` : ''}
                      </div>` : ''}
                    </div>
                    ${showGuestAffiliation && g.affiliation ? `<div class="flex gap-2xl justify-between">
                      <p class="text-p3">${g.affiliation.length > 20 ? `${g.affiliation}<br>${g.affiliation_zh || ''}` : `${g.affiliation}${g.affiliation_zh ? ' ' + g.affiliation_zh : ''}`}</p>
                      ${showGuestCountry && g.country ? `<p class="text-p3 flex-shrink-0">${g.country}${g.country_zh ? ` ${g.country_zh}` : ''}</p>` : ''}
                    </div>` : ''}
                  </div>`).join('')}
                </div>` : ''}
                ${showDescription && (introEn || introZh) ? `<div class="overflow-y-auto pr-xl list-scroll" style="max-height: 250px;">
                  ${introEn ? `<p class="text-p2 leading-base">${introEn}</p>` : ''}
                  ${introZh ? `<p class="text-p2 leading-base mt-md">${introZh}</p>` : ''}
                </div>` : ''}
                ${buildAlbumsHtml(item)}
              </div>
              ${showPoster ? buildPosterHtml(item) : ''}
            </div>
            ${buildGalleryHtml(item)}
            ${showReference && references.length ? `
            <div class="px-md pb-lg flex flex-col gap-sm" style="max-width: calc(9.5 / 12 * 100%);">
              ${references.map(ref => `
              ${ref.href
                ? `<a class="list-ref-btn cursor-pointer p-0 w-full flex items-start gap-sm text-left no-underline" href="${ref.href}">`
                : `<button class="list-ref-btn cursor-pointer border-none bg-none p-0 w-full flex items-start gap-sm text-left"
                    data-ref-section="${ref.section || ''}"
                    data-ref-item="${ref.itemId || ''}">`
              }
                <i class="fa-solid fa-arrow-right text-p2 flex-shrink-0" style="padding-top: 0.25rem;"></i>
                <div class="flex flex-col flex-1 min-w-0 gap-xs">
                  <p class="text-p2 text-black">${ref.labelEn || ''} ${ref.labelZh || ''}</p>
                  <div class="flex items-start justify-between gap-xl">
                    <div class="flex flex-col min-w-0">
                      ${ref.titleEn ? `<p class="text-p2 font-bold text-black">${ref.titleEn}</p>` : ''}
                      ${ref.titleZh ? `<p class="text-p2 font-bold text-black">${ref.titleZh}</p>` : ''}
                    </div>
                    ${ref.coverSrc ? `<div class="ref-cover-wrapper flex-shrink-0 overflow-hidden" style="height: 5rem; position: relative;"><img src="${ref.coverSrc}" alt="" class="ref-cover-img h-full w-auto block"></div>` : ''}
                  </div>
                </div>
              ${ref.href ? `</a>` : `</button>`}
              `).join('')}
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="list-year-group grid-12 items-start">
        ${hideYearHeader ? '' : showYearToggle ? `
        <div class="col-span-12 md:col-span-1 md:col-start-1 list-year-toggle cursor-pointer flex items-center gap-sm order-1 py-sm pl-xs md:sticky md:self-start md:pb-sm">
          <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
          <h5>${yearGroup.year}</h5>
        </div>` : `
        <div class="col-span-12 md:col-span-1 md:col-start-1 flex items-center order-1 py-sm pl-xs">
          <h5>${yearGroup.year}</h5>
        </div>`}
        <div class="col-span-12 md:col-span-11 md:col-start-2 list-year-items flex flex-col order-2 ${hideYearHeader ? 'md:pl-[41px]' : 'mt-md md:mt-0 md:pl-[41px]'}">
          ${itemsHtml}
        </div>
      </div>
      ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
    `);
  });

  // ref 按鈕導航
  container.querySelectorAll('.list-ref-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.refSection;
      const itemId  = btn.dataset.refItem;
      if (typeof window.__sccdNavigateToItem === 'function') {
        window.__sccdNavigateToItem(section, itemId || null);
      }
    });
  });

  // sticky top（year toggle 的 sticky top 緊接在 filter bar 下方）
  if (showYearToggle) {
    if (window.innerWidth >= 768) {
      const filterBar = panelSelector
        ? document.querySelector(`${panelSelector} .activities-filter-bar`)
        : container.closest('.activities-panel')?.querySelector('.activities-filter-bar');
      const top = filterBar ? 200 + filterBar.offsetHeight : 200;
      container.querySelectorAll('.list-year-toggle').forEach(el => { el.style.top = top + 'px'; });
    }
  }

  // ScrollTrigger 進場動畫
  if (scrollTrigger) buildInitialScrollTrigger(container);

  return bindInteractions(container);
}

// ── Workshop / Students Present / Summer Camp ─────────────────────────────────

export async function loadWorkshopsInto(jsonFile, containerId = null) {
  // containerId 為 null 時 fallback 到舊頁面容器（非 activities 分頁用）
  const id = containerId || (() => {
    const el = document.querySelector('.bg-white .site-container');
    if (el && !el.id) el.id = '__ws_fallback__';
    return el?.id || null;
  })();
  if (!id) return;
  return loadListInto(id, jsonFile, {
    showSubtitle: true,
    marqueeTitle: true,
    fullDate: true,
    introField: 'intro',
    showAlumniIcon: false,
  });
}

export async function loadSummerCampInto(containerId = null) {
  const id = containerId || (() => {
    const el = document.querySelector('.bg-white .site-container');
    if (el && !el.id) el.id = '__sc_fallback__';
    return el?.id || null;
  })();
  if (!id) return;
  await loadListInto(id, '/data/summer-camp.json', {
    showYearToggle: false,
    fullDate: true,
  });
  const container = document.getElementById(id);
  if (!container) return null;
  // 年份 header + list-item 全部平鋪，依序 stagger 進場（ScrollTrigger.batch）
  const flat = [...container.querySelectorAll('.list-year-group')].flatMap(group => {
    const sep = group.nextElementSibling?.classList.contains('activities-separator')
      ? group.nextElementSibling : null;
    return [
      group.querySelector(':scope > div:first-child'),
      ...group.querySelectorAll('.list-item'),
      ...(sep ? [sep] : []),
    ];
  }).filter(Boolean);
  return () => animateCards(flat, true, { fadeIn: true });
}

// ── General Activities / Lectures / Industry wrappers ─────────────────────────

const _panelSelectorMap = {
  'exhibitions-list-special':   '#panel-exhibitions',
  'exhibitions-list-permanent': '#panel-exhibitions',
  'lectures-list':              '#panel-lectures',
  'industry-list':              '#panel-industry',
  'visits-list-outbound':       '#panel-visits',
  'visits-list-inbound':        '#panel-visits',
  'competitions-list':          '#panel-competitions',
  'conferences-list':           '#panel-conferences',
  'students-present-list':      '#panel-students-present',
};

export async function loadGeneralActivitiesInto(containerId, categoryFilter = null, url = '/data/general-activities.json') {
  const isIndustry = containerId === 'industry-list';
  const isLectures = containerId === 'lectures-list';
  return loadListInto(containerId, url, {
    categoryFilter,
    showAlumniIcon:       true,
    showDate:             !isIndustry,
    showDescription:      !isLectures && !isIndustry,
    showLocation:         !isIndustry,
    showPoster:           !isIndustry,
    showReference:        true,
    showSubtitle:         isIndustry,
    showGuestAffiliation: !isIndustry,
    showGuestCountry:     !isIndustry,
    panelSelector:        _panelSelectorMap[containerId] || '#panel-exhibitions',
    scrollTrigger:        true,
  });
}

export async function loadLecturesInto(containerId) {
  return loadGeneralActivitiesInto(containerId, null, '/data/lectures.json');
}

export async function loadIndustryInto(containerId) {
  return loadGeneralActivitiesInto(containerId, null, '/data/industry.json');
}

// 分別載入特設 / 常設到各自的 container
export async function loadExhibitionsInto() {
  const fns = await Promise.all([
    loadListInto('exhibitions-list-special', '/data/general-activities.json', {
      categoryFilter: 'exhibitions',
      visitTypeFilter: 'special', visitTypeField: 'exhibitionType',
      panelSelector: '#panel-exhibitions', scrollTrigger: true,
    }),
    loadListInto('exhibitions-list-permanent', '/data/permanent-exhibitions.json', {
      hideYearHeader: true,
      panelSelector: '#panel-exhibitions', scrollTrigger: true,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}

// 分別載入 outbound / inbound 到各自的 container
export async function loadVisitsInto() {
  const fns = await Promise.all([
    loadListInto('visits-list-outbound', '/data/general-activities.json', {
      categoryFilter: 'visits', visitTypeFilter: 'outbound',
      panelSelector: '#panel-visits', scrollTrigger: true,
    }),
    loadListInto('visits-list-inbound', '/data/general-activities.json', {
      categoryFilter: 'visits', visitTypeFilter: 'inbound',
      panelSelector: '#panel-visits', scrollTrigger: true,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}
