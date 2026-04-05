/**
 * Album Data Loader Module
 * 聚合多個來源的 JSON 資料，渲染 Album Panel 的卡片列表
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { getCurrentSectionColor } from './activities-section-switch.js';
import {
  CARD_COLORS, CATEGORY_LABELS,
  renderYearGroups, updateYearBorders, applySortOrder,
  initAccordion, bindCardHover, initMarquee,
  applyFilter, initSearch,
  initSortToggle, initFilterToggle, initFilterBtns,
  populateYearOptions,
} from './card-panel-helpers.js';

// ── 資料正規化 ────────────────────────────────────────────────────────────────

function getCover(item) {
  return item.cover || item.poster || item.coverImage || (item.images && item.images[0]) || '';
}

function normalizeItem(item, albumCategory, year) {
  const title    = item.title_en || item.titleEn || item.title || '';
  const title_zh = item.title_zh || item.titleZh || item.title_cn || '';
  const cover    = getCover(item);
  const images   = item.images || [];

  let videos = [];
  if (item.videoUrl) videos = [item.videoUrl];
  else if (Array.isArray(item.videos)) videos = item.videos;

  const mediaPoster = cover ? [{ type: 'image', src: cover, thumb: cover }] : [];
  const mediaPhotos = images
    .filter(src => src && src !== cover)
    .map(src => ({ type: 'image', src, thumb: src }));
  const mediaVideos = videos
    .map(url => {
      const vid      = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      const embedSrc = vid ? `https://www.youtube.com/embed/${vid}` : null;
      const thumb    = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : cover;
      return embedSrc ? { type: 'video', src: embedSrc, thumb } : null;
    })
    .filter(Boolean);

  return { title, title_zh, albumCategory, year, cover, poster: mediaPoster, images: mediaPhotos, videos: mediaVideos };
}

function normalizeDegreeShowData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).map(([yearStr, entry]) => ({
    year: parseInt(yearStr, 10),
    items: [entry],
  }));
}

function ensureArray(data, isDegreeShow = false) {
  if (isDegreeShow) return normalizeDegreeShowData(data);
  if (!data || !Array.isArray(data)) return [];
  return data;
}

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

// ── 聚合所有來源資料 ─────────────────────────────────────────────────────────

async function aggregateAlbumData() {
  const sources = [
    { url: '/data/workshops.json',         albumCategory: 'workshop',         isDegreeShow: false },
    { url: '/data/degree-show.json',        albumCategory: 'degree-show',      isDegreeShow: true  },
    { url: '/data/summer-camp.json',        albumCategory: 'summer-camp',      isDegreeShow: false },
    { url: '/data/students-present.json',   albumCategory: 'students-present', isDegreeShow: false },
    { url: '/data/general-activities.json', albumCategory: 'moment',           isDegreeShow: false },
    { url: '/data/lectures.json',           albumCategory: 'lectures',         isDegreeShow: false },
    { url: '/data/industry.json',           albumCategory: 'industry',         isDegreeShow: false },
    { url: '/data/album-others.json',       albumCategory: 'others',           isDegreeShow: false },
  ];

  const results = await Promise.all(sources.map(s => fetchData(s.url)));

  const allItems = [];
  results.forEach((data, i) => {
    const { albumCategory, isDegreeShow } = sources[i];
    ensureArray(data, isDegreeShow).forEach(({ year, items }) => {
      if (!Array.isArray(items)) return;
      items.forEach(item => allItems.push(normalizeItem(item, albumCategory, year)));
    });
  });

  allItems.sort((a, b) => b.year - a.year);

  const groupMap = new Map();
  allItems.forEach(item => {
    if (!groupMap.has(item.year)) groupMap.set(item.year, []);
    groupMap.get(item.year).push(item);
  });

  return [...groupMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items }));
}

// ── 建立單張 album 卡片 HTML ─────────────────────────────────────────────────

function buildAlbumCardHtml(item, index = 0) {
  const { title, title_zh, albumCategory, cover, poster, images, videos } = item;
  const hasImages      = poster.length > 0 || images.length > 0;
  const hasVideos      = videos.length > 0;
  const categoryLabel  = CATEGORY_LABELS[albumCategory] || albumCategory;
  const cardColor      = CARD_COLORS[index % 3];
  const posterJson     = JSON.stringify(poster).replace(/'/g, '&#39;');
  const imagesJson     = JSON.stringify(images).replace(/'/g, '&#39;');
  const videosJson     = JSON.stringify(videos).replace(/'/g, '&#39;');

  // 建立疊加元素：影片 thumbnail 優先，然後圖片，最多 3 個
  const stackSrcs = [];
  if (videos.length > 0) stackSrcs.push(videos[0].thumb);
  const photoSrcs = [...poster.map(p => p.src), ...images.map(i => i.src)];
  for (const src of photoSrcs) {
    if (stackSrcs.length >= 3) break;
    stackSrcs.push(src);
  }

  const stackHtml = stackSrcs.map((src, i) => {
    const isVideo = i === 0 && videos.length > 0;
    return `
      <div style="position: absolute; bottom: 0; left: 0; right: 0; z-index: ${stackSrcs.length - i};">
        <img src="${src}" alt="" class="w-full block" style="height: 240px; object-fit: contain; object-position: bottom;">
        ${isVideo ? `<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><polygon points="0,0 20,12 0,24" fill="white" fill-opacity="0.7"/></svg>
        </div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="album-card cursor-pointer p-[6px]"
         style="--card-color: ${cardColor};"
         data-album-cat="${albumCategory}"
         data-has-images="${hasImages}"
         data-has-videos="${hasVideos}"
         data-poster='${posterJson}'
         data-images='${imagesJson}'
         data-videos='${videosJson}'>
      <div class="album-card-image overflow-hidden mb-sm" style="height: 240px; position: relative;">
        ${stackHtml}
        <div class="album-card-overlay absolute inset-0 pointer-events-none" style="background: ${cardColor}; mix-blend-mode: screen; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4,0,0.2,1);"></div>
      </div>
      <div>
        <div class="album-title-marquee"><h6>${title}</h6></div>
        ${title_zh ? `<div class="album-title-marquee"><h6>${title_zh}</h6></div>` : ''}
        <p class="text-p2 mt-xs">${categoryLabel}</p>
      </div>
    </div>
  `;
}

// ── Album 專屬 filter（多了 type filter + extraCheck）─────────────────────────

function applyAlbumFilter(container, panel) {
  applyFilter(container, panel, {
    catAttr:     'data-filter-album-cat',
    yearAttr:    'data-filter-album-year',
    cardCatAttr: 'data-album-cat',
    extraCheck: (card) => {
      const activeTypes = new Set(
        [...panel.querySelectorAll('[data-filter-album-type].active')]
          .map(b => b.getAttribute('data-filter-album-type'))
      );
      if (activeTypes.size === 0) return card.querySelector('img')?.getAttribute('src') !== '';
      const hasImages = card.getAttribute('data-has-images') === 'true';
      const hasVideos = card.getAttribute('data-has-videos') === 'true';
      return (activeTypes.has('images') && hasImages) || (activeTypes.has('videos') && hasVideos);
    },
  });
}

// ── 初始化 album panel ───────────────────────────────────────────────────────

function initAlbumPanel(container, yearGroups) {
  const panel = container.closest('#panel-album');
  if (!panel) return;

  const yearWrap = panel.querySelector('#album-year-options');
  populateYearOptions(yearWrap, yearGroups, 'data-filter-album-year');

  const runFilter = () => applyAlbumFilter(container, panel);

  initFilterBtns(panel, [
    { attr: 'data-filter-album-cat' },
    { attr: 'data-filter-album-type' },
    { attr: 'data-filter-album-year', yearWrap },
  ], runFilter);

  initSortToggle(panel, 'data-filter-album-sort', dir => {
    applySortOrder(container, dir);
    runFilter();
  });

  initFilterToggle(
    panel.querySelector('.album-filter-toggle-btn'),
    panel.querySelector('.album-filter-rows-wrap'),
    false,
  );

  initSearch(container, panel.querySelector('#album-search-input'));
}

// ── 卡片點擊 → lightbox ──────────────────────────────────────────────────────

function bindCardClicks(container) {
  const panel = container.closest('#panel-album');

  container.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', () => {
      const activeTypes = panel
        ? new Set([...panel.querySelectorAll('[data-filter-album-type].active')].map(b => b.getAttribute('data-filter-album-type')))
        : new Set();
      const typeFilter = activeTypes.size === 1 ? [...activeTypes][0] : 'all';

      const allPoster = JSON.parse(card.getAttribute('data-poster') || '[]');
      const allImages = JSON.parse(card.getAttribute('data-images') || '[]');
      const allVideos = JSON.parse(card.getAttribute('data-videos') || '[]');

      let media = [];
      if (typeFilter === 'images')      media = [...allPoster, ...allImages];
      else if (typeFilter === 'videos') media = allVideos;
      else                              media = [...allVideos, ...allPoster, ...allImages];

      if (media.length) openLightbox(media, 0);
    });
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export async function loadAlbumData(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const yearGroups = await aggregateAlbumData();

  if (!yearGroups.length) {
    container.innerHTML = '<p class="text-p2 py-xl">No albums found.</p>';
    return;
  }

  renderYearGroups(container, yearGroups, buildAlbumCardHtml);
  initAccordion(container);

  const panel = container.closest('#panel-album');
  if (panel) populateYearOptions(panel.querySelector('#album-year-options'), yearGroups, 'data-filter-album-year');

  initAlbumPanel(container, yearGroups);
  applyAlbumFilter(container, panel);
  bindCardHover(container);
  initMarquee(container);
  bindCardClicks(container);
}
