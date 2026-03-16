/**
 * Press Data Loader
 * 負責讀取 press.json 並渲染 Press panel（年份分組卡片，與 Files panel 結構一致）
 */

import {
  CARD_COLORS, CATEGORY_LABELS,
  groupByYear, renderYearGroups,
  initAccordion, bindCardHover, initMarquee,
  applyFilter, initSearch,
  initSortToggle, initFilterToggle, initFilterBtns,
  populateYearOptions, applySortOrder,
} from './card-panel-helpers.js';

// ── 建立單張卡片 HTML ──────────────────────────────────────────────────────────

function buildPressCard(item, index) {
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category || '';
  const cardColor     = CARD_COLORS[index % 3];
  const titleEn       = item.titleEn || '';
  const titleZh       = item.titleZh || '';

  return `
    <div class="album-card cursor-pointer p-[6px]"
         style="--card-color: ${cardColor};"
         data-pdf="${item.pdfUrl || ''}"
         data-category="${item.category || 'others'}"
         data-year="${item.year || ''}"
         data-title-en="${titleEn.toLowerCase()}"
         data-title-zh="${titleZh.toLowerCase()}">
      <div class="album-card-image overflow-hidden mb-sm" style="height: 240px; display: flex; align-items: flex-end; position: relative;">
        <img src="${item.image}" alt="${titleEn}" loading="lazy" class="album-card-img w-full object-contain object-bottom block" style="max-height: 100%;">
        <div class="album-card-overlay absolute inset-0 pointer-events-none" style="background: ${cardColor}; mix-blend-mode: screen; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4,0,0.2,1);"></div>
      </div>
      <div>
        <div class="album-title-marquee"><h6>${titleEn}</h6></div>
        ${titleZh ? `<div class="album-title-marquee"><h6>${titleZh}</h6></div>` : ''}
        <p class="text-p2 mt-xs">${categoryLabel}</p>
      </div>
    </div>
  `;
}

// ── 初始化 filter + sort + search ─────────────────────────────────────────────

function initPressPanel(container, yearGroups) {
  const panel = document.getElementById('panel-press');
  if (!panel) return;

  const yearWrap = panel.querySelector('#press-year-options');
  populateYearOptions(yearWrap, yearGroups, 'data-filter-press-year');

  const runFilter = () => applyFilter(container, panel, {
    catAttr:  'data-filter-press-cat',
    yearAttr: 'data-filter-press-year',
  });

  initFilterBtns(panel, [
    { attr: 'data-filter-press-cat' },
    { attr: 'data-filter-press-year', yearWrap },
  ], runFilter);

  initSortToggle(panel, 'data-filter-press-sort', dir => {
    applySortOrder(container, dir);
    runFilter();
  });

  initFilterToggle(
    panel.querySelector('.press-filter-toggle-btn'),
    panel.querySelector('.press-filter-rows-wrap'),
  );

  initSearch(container, panel.querySelector('#press-search-input'));
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export async function loadPressData() {
  try {
    const data = await fetch('../data/press.json').then(r => r.json());
    const container = document.getElementById('press-list-container');
    if (!container) return;

    const yearGroups = groupByYear(data);

    if (!yearGroups.length) {
      container.innerHTML = '<p class="text-p2 py-xl">No press found.</p>';
      return;
    }

    renderYearGroups(container, yearGroups, buildPressCard);
    initAccordion(container);
    initPressPanel(container, yearGroups);
    applyFilter(container, document.getElementById('panel-press'), {
      catAttr:  'data-filter-press-cat',
      yearAttr: 'data-filter-press-year',
    });
    bindCardHover(container);
    initMarquee(container);

    // 卡片點擊 → 觸發 PDF viewer（由 library-data-loader 的共用 viewer 接收）
    container.addEventListener('click', e => {
      const card = e.target.closest('.album-card');
      if (!card) return;
      card.dispatchEvent(new CustomEvent('sccd:open-pdf', {
        detail: { pdfUrl: card.getAttribute('data-pdf') },
        bubbles: true,
      }));
    });

  } catch (err) {
    console.error('Error loading press data:', err);
  }
}
