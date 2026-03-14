/**
 * Album Data Loader Module
 * 聚合多個來源的 JSON 資料，渲染 Album Panel 的卡片列表
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { getCurrentSectionColor } from './activities-section-switch.js';

// ── Category Label Map ────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  'degree-show':      'Degree Show 畢業展',
  'workshop':         'Workshop 工作營',
  'summer-camp':      'Summer Camp 暑期體驗營',
  'students-present': 'Students Present 學生自主',
  'moment':           'Moment 動態',
  'lectures':         'Lectures 講座',
  'others':           'Others 其他',
};

// ── Helper: Fetch JSON ────────────────────────────────────────────────────────

async function fetchData(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

// ── Helper: 解析 YouTube video ID → embed URL ─────────────────────────────────

function ytEmbedUrl(url) {
  const vid = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
  return vid ? `https://www.youtube.com/embed/${vid}` : null;
}

// ── Helper: 從 item 取得 cover（poster / poster field / images[0]）─────────────

function getCover(item) {
  return item.cover || item.poster || item.coverImage || (item.images && item.images[0]) || '';
}

// ── Helper: 將單一 item 轉換為統一的 flatItem 格式 ────────────────────────────

function normalizeItem(item, albumCategory, year) {
  // 處理 degree-show（camelCase）與其他（snake_case）的欄位差異
  const title    = item.title_en  || item.titleEn  || item.title || '';
  const title_zh = item.title_zh  || item.titleZh  || item.title_cn || '';
  const cover    = getCover(item);

  // images：degree-show 的 images 陣列，或一般 images
  const images = item.images || [];

  // videos：degree-show 用 videoUrl（單一字串），一般用 videos 陣列
  let videos = [];
  if (item.videoUrl) {
    videos = [item.videoUrl];
  } else if (Array.isArray(item.videos)) {
    videos = item.videos;
  }

  // 建立 media 清單（三類分開，poster 不會出現在 photos 裡）
  const mediaPoster = cover ? [{ type: 'image', src: cover, thumb: cover }] : [];
  const mediaPhotos = images
    .filter(src => src && src !== cover)
    .map(src => ({ type: 'image', src, thumb: src }));
  const mediaVideos = videos
    .map(url => {
      const vid = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      const embedSrc = vid ? `https://www.youtube.com/embed/${vid}` : null;
      const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : cover;
      return embedSrc ? { type: 'video', src: embedSrc, thumb } : null;
    })
    .filter(Boolean);

  return {
    title,
    title_zh,
    albumCategory,
    year,
    cover,
    poster: mediaPoster,
    images: mediaPhotos,
    videos: mediaVideos,
  };
}

// ── Helper: 將 degree-show.json（object 格式）轉為年份陣列 ────────────────────

function normalizeDegreeShowData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).map(([yearStr, entry]) => ({
    year: parseInt(yearStr, 10),
    items: [entry], // 每年只有一筆主要展覽
  }));
}

// ── Helper: 確保資料為年份陣列格式 ───────────────────────────────────────────

function ensureArray(data, isDegreeShow = false) {
  if (isDegreeShow) return normalizeDegreeShowData(data);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [];
}

// ── 聚合所有來源資料，回傳按年份降序排列的 flatItems（依年份分組）─────────────

async function aggregateAlbumData() {
  const sources = [
    { url: '../data/workshops.json',          albumCategory: 'workshop',         isDegreeShow: false },
    { url: '../data/degree-show.json',         albumCategory: 'degree-show',      isDegreeShow: true  },
    { url: '../data/summer-camp.json',         albumCategory: 'summer-camp',      isDegreeShow: false },
    { url: '../data/students-present.json',    albumCategory: 'students-present', isDegreeShow: false },
    { url: '../data/general-activities.json',  albumCategory: 'moment',           isDegreeShow: false },
    { url: '../data/lectures.json',            albumCategory: 'lectures',         isDegreeShow: false },
    { url: '../data/album-others.json',        albumCategory: 'others',           isDegreeShow: false },
  ];

  // 同時 fetch 所有來源
  const results = await Promise.all(sources.map(s => fetchData(s.url)));

  // 聚合所有 flatItems
  const allItems = [];
  results.forEach((data, i) => {
    const { albumCategory, isDegreeShow } = sources[i];
    const yearGroups = ensureArray(data, isDegreeShow);
    yearGroups.forEach(({ year, items }) => {
      if (!Array.isArray(items)) return;
      items.forEach(item => {
        allItems.push(normalizeItem(item, albumCategory, year));
      });
    });
  });

  // 按年份降序，再依原始順序穩定排序
  allItems.sort((a, b) => b.year - a.year);

  // 按年份分組
  const groupMap = new Map();
  allItems.forEach(item => {
    if (!groupMap.has(item.year)) groupMap.set(item.year, []);
    groupMap.get(item.year).push(item);
  });

  // 回傳年份降序的分組陣列
  return [...groupMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items }));
}

// ── 建立單張 album 卡片的 HTML ────────────────────────────────────────────────

const ALBUM_CARD_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

function buildAlbumCardHtml(item, index = 0) {
  const { title, title_zh, albumCategory, cover, poster, images, videos } = item;
  const hasImages = poster.length > 0 || images.length > 0;
  const hasVideos = videos.length > 0;
  const categoryLabel = CATEGORY_LABELS[albumCategory] || albumCategory;
  const cardColor = ALBUM_CARD_COLORS[index % 3];

  // data 屬性分開存三類，點擊時再組合
  const posterJson = JSON.stringify(poster).replace(/'/g, '&#39;');
  const imagesJson = JSON.stringify(images).replace(/'/g, '&#39;');
  const videosJson = JSON.stringify(videos).replace(/'/g, '&#39;');

  return `
    <div class="album-card cursor-pointer p-[6px]"
         style="--card-color: ${cardColor};"
         data-album-cat="${albumCategory}"
         data-has-images="${hasImages}"
         data-has-videos="${hasVideos}"
         data-poster='${posterJson}'
         data-images='${imagesJson}'
         data-videos='${videosJson}'>
      <div class="album-card-image overflow-hidden mb-sm" style="height: 240px; display: flex; align-items: flex-end; position: relative;">
        <img src="${cover}" alt="${title}" class="album-card-img w-full object-contain object-bottom block" style="max-height: 100%;">
        <div class="album-card-overlay absolute inset-0 pointer-events-none" style="background: ${cardColor}; mix-blend-mode: screen; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4,0,0.2,1);"></div>
        ${hasVideos ? `<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><polygon points="0,0 20,12 0,24" fill="white" fill-opacity="0.7"/></svg>
        </div>` : ''}
      </div>
      <div>
        <div class="album-title-marquee"><h6>${title}</h6></div>
        ${title_zh ? `<div class="album-title-marquee"><h6>${title_zh}</h6></div>` : ''}
        <p class="text-p2 mt-xs">${categoryLabel}</p>
      </div>
    </div>
  `;
}

// ── 取得目前各 filter 的 active 值集合（多選） ───────────────────────────────

function getActiveCats(panel) {
  return new Set([...panel.querySelectorAll('[data-filter-album-cat].active')]
    .map(b => b.getAttribute('data-filter-album-cat')));
}

function getActiveTypes(panel) {
  return new Set([...panel.querySelectorAll('[data-filter-album-type].active')]
    .map(b => b.getAttribute('data-filter-album-type')));
}

function getActiveYears(panel) {
  return new Set([...panel.querySelectorAll('[data-filter-album-year].active')]
    .map(b => b.getAttribute('data-filter-album-year')));
}

// 取得目前 type filter（供 lightbox 用，'images'|'videos'|'all'）
function getCurrentTypeFilter(container) {
  const panel = container.closest('#panel-album');
  if (!panel) return 'all';
  const activeTypes = getActiveTypes(panel);
  if (activeTypes.size === 1) return [...activeTypes][0];
  return 'all';
}

// 取得目前 sort 方向（'newest'|'oldest'）
function getActiveSort(panel) {
  const btn = panel.querySelector('[data-filter-album-sort].active');
  return btn?.getAttribute('data-filter-album-sort') || 'newest';
}

// ── 套用 filter：多選模式，空集合 = 全部顯示 ─────────────────────────────────

function applyAlbumFilter(container) {
  const panel = container.closest('#panel-album');
  if (!panel) return;

  const activeCats  = getActiveCats(panel);
  const activeTypes = getActiveTypes(panel);
  const activeYears = getActiveYears(panel);

  container.querySelectorAll('.album-year-group').forEach(group => {
    const groupYear = group.getAttribute('data-year');

    // year filter：空集合 = 全顯示
    if (activeYears.size > 0 && !activeYears.has(groupYear)) {
      group.style.display = 'none';
      return;
    }

    let hasVisibleCard = false;

    group.querySelectorAll('.album-card').forEach(card => {
      const cat       = card.getAttribute('data-album-cat');
      const hasImages = card.getAttribute('data-has-images') === 'true';
      const hasVideos = card.getAttribute('data-has-videos') === 'true';
      const cover     = card.querySelector('img')?.getAttribute('src') || '';

      // cat：空集合 = 全顯示
      const catMatch = activeCats.size === 0 || activeCats.has(cat);

      // type：空集合 = 全顯示
      let typeMatch = true;
      if (activeTypes.size > 0) {
        typeMatch = (activeTypes.has('images') && hasImages) ||
                   (activeTypes.has('videos') && hasVideos);
      } else {
        typeMatch = cover !== '';
      }

      const filterVisible = catMatch && typeMatch;
      card.dataset.filterHidden = filterVisible ? '' : '1';
      const searchHidden = card.dataset.searchHidden === '1';
      card.style.display = (filterVisible && !searchHidden) ? '' : 'none';
      if (filterVisible && !searchHidden) hasVisibleCard = true;
    });

    group.style.display = hasVisibleCard ? '' : 'none';
  });
}

// ── Sort col toggle ───────────────────────────────────────────────────────────

function initAlbumSortToggle(panel) {
  const col  = panel.querySelector('.album-sort-col');
  if (!col) return;
  const header = col.querySelector('.album-filter-col-header');
  const list   = col.querySelector('.album-filter-col-list');
  const icon   = header?.querySelector('i.fa-chevron-down');
  if (!header || !list) return;

  list.style.display = 'none';

  // 初始 active 選項設底色
  const activeBtn = list.querySelector('.album-filter-option.active');
  if (activeBtn) activeBtn.style.background = getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();

  header.addEventListener('click', () => {
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : '';
    icon?.classList.toggle('rotate-180', !isOpen);
  });
}

// ── 根據資料填充 year filter 選項（預設全選）─────────────────────────────────

function populateYearFilter(panel, yearGroups) {
  const container = panel.querySelector('#album-year-options');
  if (!container) return;
  container.innerHTML = yearGroups.map(({ year }) =>
    `<button class="activities-filter-btn active" data-filter-album-year="${year}"><span class="anchor-nav-inner">${year}</span></button>`
  ).join('');
}

// ── 依 sort 方向重排 year groups ─────────────────────────────────────────────

function updateYearBorders(container) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  groups.forEach((g, i) => {
    if (i === 0) {
      g.classList.remove('border-t-4', 'border-black');
    } else {
      g.classList.add('border-t-4', 'border-black');
    }
  });
}

function applySortOrder(container, direction) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  if (groups.length === 0) return;
  groups.sort((a, b) => {
    const ya = parseInt(a.getAttribute('data-year'), 10);
    const yb = parseInt(b.getAttribute('data-year'), 10);
    return direction === 'oldest' ? ya - yb : yb - ya;
  });
  groups.forEach(g => container.appendChild(g));
  updateYearBorders(container);
}

// ── 初始化 filter ─────────────────────────────────────────────────────────────

function initAlbumFilter(container) {
  const panel = container.closest('#panel-album');
  if (!panel) return;

  // Sort col toggle
  initAlbumSortToggle(panel);

  // active：底色 + 旋轉；inactive：50% 黑、無旋轉
  function setActive(btn) {
    btn.classList.add('active');
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) {
      inner.style.background  = getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();
      inner.style.transform   = '';
      inner.style.color       = 'black';
    }
  }
  function clearActive(btn) {
    btn.classList.remove('active');
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) {
      inner.style.background  = '';
      inner.style.transform   = '';
      inner.style.color       = 'rgba(0,0,0,0.5)';
    }
  }

  // 初始樣式
  panel.querySelectorAll('[data-filter-album-cat], [data-filter-album-type], [data-filter-album-year]').forEach(btn => {
    const inner = btn.querySelector('.anchor-nav-inner');
    if (!inner) return;
    if (btn.classList.contains('active')) {
      inner.style.background = getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();
      inner.style.transform  = '';
    } else {
      inner.style.color = 'rgba(0,0,0,0.5)';
    }
  });

  // cat + type：直接 bind（同組至少保留一個 active）
  panel.querySelectorAll('[data-filter-album-cat], [data-filter-album-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        const attr = btn.hasAttribute('data-filter-album-cat') ? 'data-filter-album-cat' : 'data-filter-album-type';
        const siblings = panel.querySelectorAll(`[${attr}].active`);
        if (siblings.length <= 1) return;
        clearActive(btn);
      } else {
        setActive(btn);
      }
      applyAlbumFilter(container);
    });
  });

  // year：event delegation（動態產生）
  const yearContainer = panel.querySelector('#album-year-options');
  if (yearContainer) {
    yearContainer.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter-album-year]');
      if (!btn) return;
      if (btn.classList.contains('active')) {
        const activeYears = yearContainer.querySelectorAll('[data-filter-album-year].active');
        if (activeYears.length <= 1) return;
        clearActive(btn);
      } else {
        setActive(btn);
      }
      applyAlbumFilter(container);
    });
  }

  // Filter toggle（收合 filter rows，GSAP 動畫）
  const filterToggleBtn = panel.querySelector('.album-filter-toggle-btn');
  const filterRows = panel.querySelector('.activities-filter-bar > div:first-child');
  if (filterToggleBtn && filterRows) {
    const icon = filterToggleBtn.querySelector('i');
    const rowsWrap = filterRows.querySelector('.album-filter-rows-wrap');
    filterToggleBtn.dataset.open = 'true';
    filterToggleBtn.addEventListener('click', () => {
      const isOpen = filterToggleBtn.dataset.open !== 'false';
      if (isOpen) {
        gsap.to(rowsWrap, { height: 0, duration: 0.35, ease: 'power2.inOut' });
        gsap.to(icon, { rotation: 180, duration: 0.35, ease: 'power2.inOut' });
        filterToggleBtn.dataset.open = 'false';
      } else {
        gsap.to(rowsWrap, { height: 'auto', duration: 0.35, ease: 'power2.inOut' });
        gsap.to(icon, { rotation: 0, duration: 0.35, ease: 'power2.inOut' });
        filterToggleBtn.dataset.open = 'true';
      }
    });
  }

  // sort filter（單選）
  panel.querySelectorAll('[data-filter-album-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-filter-album-sort]').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
      });
      btn.classList.add('active');
      btn.style.background = getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();
      applySortOrder(container, btn.getAttribute('data-filter-album-sort'));
    });
  });
}

// ── 初始化 accordion（點擊年份 toggle 展開/收合）────────────────────────────

function initAlbumAccordion(container) {
  container.querySelectorAll('.album-year-toggle').forEach(toggle => {
    const group = toggle.closest('.album-year-group');
    const items = group?.querySelector('.album-year-items');
    if (!items) return;

    const icon = toggle.querySelector('i');

    // 預設展開
    gsap.set(items, { height: 'auto', overflow: 'visible' });
    if (icon) icon.classList.add('rotate-180');
    group.dataset.open = 'true';

    toggle.addEventListener('click', () => {
      const isOpen = group.dataset.open === 'true';
      gsap.killTweensOf(items);
      if (isOpen) {
        group.dataset.open = 'false';
        gsap.set(items, { height: items.offsetHeight, overflow: 'hidden' });
        gsap.to(items, { height: 0, duration: 0.4, ease: 'power2.in' });
        if (icon) icon.classList.remove('rotate-180');
      } else {
        group.dataset.open = 'true';
        gsap.set(items, { overflow: 'hidden' });
        gsap.to(items, { height: 'auto', duration: 0.5, ease: 'power2.out', onComplete: () => { gsap.set(items, { overflow: 'visible' }); } });
        if (icon) icon.classList.add('rotate-180');
      }
    });
  });
}

// ── 初始化卡片標題 marquee（overflow 時 hover 跑馬燈）────────────────────────

function initAlbumMarquee(container) {
  container.querySelectorAll('.album-title-marquee').forEach(wrap => {
    const h = wrap.querySelector('h6');
    if (!h) return;
    const checkOverflow = () => {
      if (h.scrollWidth > wrap.offsetWidth) {
        wrap.classList.add('is-overflow');
        if (!wrap.dataset.marqueeInit) {
          wrap.dataset.marqueeInit = '1';
          const clone = h.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          h.style.paddingRight = '3rem';
          clone.style.paddingRight = '3rem';
          wrap.appendChild(clone);
        }
        const offset = h.offsetWidth;
        wrap.style.setProperty('--marquee-offset', `-${offset}px`);
        wrap.style.setProperty('--marquee-duration', `${Math.max(3, offset / 80)}s`);
      } else {
        wrap.classList.remove('is-overflow');
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
  });
}

// ── 綁定卡片 hover（桌面版：底色 + grayscale + overlay）────────────────────

function bindCardHover(container) {
  if (window.innerWidth < 768) return;
  container.querySelectorAll('.album-card').forEach(card => {
    const img = card.querySelector('.album-card-img');
    const overlay = card.querySelector('.album-card-overlay');
    const color = card.style.getPropertyValue('--card-color');
    card.addEventListener('mouseenter', () => {
      card.style.backgroundColor = color;
      if (img) img.style.filter = 'grayscale(100%)';
      if (overlay) overlay.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = '';
      if (img) img.style.filter = '';
      if (overlay) overlay.style.opacity = '0';
    });
  });
}

// ── 綁定卡片點擊 → lightbox ──────────────────────────────────────────────────

function bindCardClicks(container) {
  container.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', () => {
      const typeFilter = getCurrentTypeFilter(container);
      const allPoster  = JSON.parse(card.getAttribute('data-poster') || '[]');
      const allImages  = JSON.parse(card.getAttribute('data-images') || '[]');
      const allVideos  = JSON.parse(card.getAttribute('data-videos') || '[]');

      let media = [];
      if (typeFilter === 'images') {
        media = [...allPoster, ...allImages];
      } else if (typeFilter === 'videos') {
        media = allVideos;
      } else {
        // 'all'：videos → poster → photos
        media = [...allVideos, ...allPoster, ...allImages];
      }

      if (media.length === 0) return;
      openLightbox(media, 0);
    });
  });
}

// ── 搜尋邏輯（比對卡片英中文標題，年份組跟著展開/收合）─────────────────────

function initAlbumSearch(container) {
  const panel = container.closest('#panel-album');
  if (!panel) return;
  const input = panel.querySelector('#album-search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();

    container.querySelectorAll('.album-year-group').forEach(group => {
      const items = group.querySelector('.album-year-items');
      const icon  = group.querySelector('.album-year-toggle i');
      let hasVisible = false;

      group.querySelectorAll('.album-card').forEach(card => {
        const filterHidden = card.dataset.filterHidden === '1';

        if (query === '') {
          card.dataset.searchHidden = '';
          card.style.display = filterHidden ? 'none' : '';
          if (!filterHidden) hasVisible = true;
          return;
        }

        const titles = [...card.querySelectorAll('.album-title-marquee h6')]
          .map(h => h.textContent.toLowerCase());
        const match = titles.some(t => t.includes(query));

        if (match) {
          card.dataset.searchHidden = '';
          card.style.display = filterHidden ? 'none' : '';
          if (!filterHidden) hasVisible = true;
        } else {
          card.dataset.searchHidden = '1';
          card.style.display = 'none';
        }
      });

      // 有符合的卡片 → 確保年份組展開；全部不符合 → 隱藏整組
      if (query === '') {
        group.style.display = '';
        // 還原 accordion 狀態（由 data-open 決定）
        if (group.dataset.open === 'true') {
          gsap.set(items, { height: 'auto', overflow: 'visible' });
          if (icon) icon.classList.add('rotate-180');
        }
      } else if (hasVisible) {
        group.style.display = '';
        group.dataset.open = 'true';
        gsap.set(items, { height: 'auto', overflow: 'visible' });
        if (icon) icon.classList.add('rotate-180');
      } else {
        group.style.display = 'none';
      }
    });
  });
}

// ── 主要 export：載入並渲染 Album 資料 ───────────────────────────────────────

export async function loadAlbumData(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const yearGroups = await aggregateAlbumData();

  container.innerHTML = '';

  if (yearGroups.length === 0) {
    container.innerHTML = '<p class="text-p2 py-xl">No albums found.</p>';
    return;
  }

  yearGroups.forEach(({ year, items }, index) => {
    const cardsHtml = items.map((item, i) => buildAlbumCardHtml(item, i)).join('');
    container.insertAdjacentHTML('beforeend', `
      <div class="album-year-group border-t-4 border-black" data-year="${year}">
        <div class="album-year-toggle cursor-pointer flex items-center justify-between py-md">
          <h5>${year}</h5>
          <i class="fa-solid fa-chevron-down text-p2 transition-all duration-fast"></i>
        </div>
        <div class="album-year-items">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-x-2xl gap-y-4xl pb-2xl">
            ${cardsHtml}
          </div>
        </div>
      </div>
    `);
  });

  // 填充 year filter 選項
  const panel = container.closest('#panel-album');
  if (panel) populateYearFilter(panel, yearGroups);

  // 套用 filter（初始狀態 all / all / all）
  applyAlbumFilter(container);

  // 初始化年份分割線（第一個不需要）
  updateYearBorders(container);

  // 初始化 accordion（預設全部展開，已透過 rotate-90 class 呈現展開狀態）
  initAlbumAccordion(container);

  // 初始化 filter 按鈕
  initAlbumFilter(container);

  // 綁定卡片點擊 lightbox
  bindCardClicks(container);

  // 綁定卡片 hover 效果（桌面版）
  bindCardHover(container);

  // 初始化標題 marquee
  initAlbumMarquee(container);

  // 初始化搜尋
  initAlbumSearch(container);
}
