/**
 * General Activities Data Loader
 * 負責讀取 General Activities JSON 資料並渲染列表
 * Item 的 first/last 樣式完全由 activities-filter.js 動態控制
 */

import { buildItemMedia, buildPosterHtml, buildGalleryHtml, bindInteractions } from './activities-data-loader.js';

// ISO country code → 國旗 emoji（e.g. "TW" → 🇹🇼）
function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

// 日期格式：去掉年份，只留月份與日期，. 換成 / ，支援 range
function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace(/\d{4}\./g, '').replace(/\./g, ' / ').trim();
}

// 每個 group 對應的 ScrollTrigger instance，供 filter 重建動畫用
const groupScrollTriggers = new Map();
export function getGroupScrollTriggers() { return groupScrollTriggers; }

// 取得 group 內要動畫的元素（供 filter 重建用）
function getGroupItems(group) {
  const yearToggle = group.querySelector('.workshop-year-toggle');
  const items = [...group.querySelectorAll('.workshop-item')].filter(el => el.style.display !== 'none');
  const divider = group.nextElementSibling?.classList.contains('activities-separator')
    ? group.nextElementSibling : null;
  return [...(yearToggle ? [yearToggle] : []), ...items, ...(divider ? [divider] : [])];
}

// 為單一 group 建立 ScrollTrigger（filter 重建用，各自獨立觸發）
export function buildGroupScrollTrigger(group) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const allItems = getGroupItems(group);
  if (allItems.length === 0) return null;

  gsap.set(allItems, { y: 100, opacity: 0 });

  return ScrollTrigger.create({
    trigger: group,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.to(allItems, {
        y: 0, opacity: 1,
        duration: 0.6,
        stagger: { each: 0.1, grid: 'auto', axis: 'y' },
        ease: 'power2.out',
        overwrite: true,
        clearProps: 'transform,opacity',
      });
    },
  });
}

// 直接播放所有 groups 的動畫（年份依序，供 filter 切換後使用）
export function playGroupsInSequence(groups) {
  if (typeof gsap === 'undefined') return;
  const groupItemSets = groups.map(group => getGroupItems(group)).filter(items => items.length > 0);
  groupItemSets.forEach(items => gsap.set(items, { y: 100, opacity: 0 }));
  let delay = 0;
  groupItemSets.forEach(items => {
    gsap.to(items, {
      y: 0, opacity: 1,
      duration: 0.6,
      delay,
      stagger: { each: 0.1, grid: 'auto', axis: 'y' },
      ease: 'power2.out',
      overwrite: true,
      clearProps: 'transform,opacity',
    });
    // 下一個 group 在前一個 stagger 結束後緊接開始（不等 duration 結束）
    delay += items.length * 0.1 + 0.1;
  });
}

// 動態設定年份 toggle 的 sticky top（filter bar 底部 = header + filter bar 高度）
function updateYearToggleStickyTop(container, panelSelector = '#panel-general') {
  if (window.innerWidth < 768) return;
  const filterBar = document.querySelector(`${panelSelector} .activities-filter-bar`);
  if (!filterBar) return;
  // filter bar sticky 於 top 160px，年份 toggle 緊接在其下方
  const top = 160 + filterBar.offsetHeight;
  container.querySelectorAll('.workshop-year-toggle').forEach(el => {
    el.style.top = top + 'px';
  });
}

// 初始載入時：每個 group 各自 ScrollTrigger，滾到才觸發，group 內 items 依序 stagger
export function buildInitialScrollTrigger(container) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const groups = [...container.querySelectorAll('.workshop-year-group')];
  if (groups.length === 0) return null;

  groups.forEach(group => {
    const items = getGroupItems(group);
    if (items.length === 0) return;
    gsap.set(items, { y: 100, opacity: 0 });
    ScrollTrigger.create({
      trigger: group,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(items, {
          y: 0, opacity: 1,
          duration: 0.6,
          stagger: { each: 0.1, grid: 'auto', axis: 'y' },
          ease: 'power2.out',
          overwrite: true,
          clearProps: 'transform,opacity',
        });
      },
    });
  });
}

export async function loadGeneralActivities() {
  return loadGeneralActivitiesInto('general-activities-list');
}

export async function loadLecturesInto(containerId) {
  return loadGeneralActivitiesInto(containerId, null, '../data/lectures.json', false);
}

export async function loadGeneralActivitiesInto(containerId, categoryFilter = null, url = '../data/general-activities.json', showCategoryLabel = true) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.length === 0) return;

    container.innerHTML = '';

    // 若有 categoryFilter，過濾每個 yearGroup 的 items，並移除空的 yearGroup
    const filteredData = categoryFilter
      ? data.map(yg => ({ ...yg, items: yg.items.filter(i => i.category === categoryFilter) }))
             .filter(yg => yg.items.length > 0)
      : data;

    filteredData.forEach((yearGroup, index) => {
      const isLast = index === filteredData.length - 1;

      const total = yearGroup.items.length;
      const itemsHtml = yearGroup.items.map((item, itemIdx) => {
        const mediaJson = JSON.stringify(buildItemMedia(item)).replace(/"/g, '&quot;');
        const dateDisplay = formatDate(item.date);

        const categoryEnMap = { seminars: 'Lectures', visits: 'Visits', exhibitions: 'Exhibitions', conferences: 'Conferences', competitions: 'Competitions' };
        const categoryLabelHtml = showCategoryLabel && !categoryFilter
          ? `<span class="item-category-label text-p2 text-black">${categoryEnMap[item.category] || ''} ${item.categoryLabel || ''}</span>`
          : '';

        const isLastItem = itemIdx === total - 1;
        const borderClass = categoryFilter && !isLastItem ? 'border-b-4 border-black' : '';

        return `
          <div class="workshop-item overflow-hidden ${borderClass}" data-category="${item.category}" data-media="${mediaJson}"${item.id ? ` id="item-${item.id}"` : ''}>
            <div class="workshop-header cursor-pointer group transition-colors duration-fast flex items-center justify-between px-[4px] py-sm">
              <div class="text-h5 font-bold">${item.title_en ? item.title_en : item.title}${item.title_en ? `<br><span class="text-h5 font-bold">${item.title}</span>` : ''}</div>
              <div class="flex items-start gap-sm flex-shrink-0 pt-[0.25rem]">
                ${categoryLabelHtml}
                ${item.guests && item.guests.some(g => g.isAlumni) ? `<i class="fa-solid fa-graduation-cap text-p2"></i>` : ''}
                ${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}
                <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
              </div>
            </div>
            <div class="workshop-content h-0 overflow-hidden">
              <div class="pt-sm pb-lg px-xl grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
                <div class="flex flex-col gap-md pr-2xl">
                  ${containerId !== 'industry-list' && (dateDisplay || item.location || item.location_zh) ? `<div class="flex gap-xl">
                    ${dateDisplay ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${dateDisplay}</p></div>` : ''}
                    ${(item.location || item.location_zh) ? `<div>
                      ${item.location ? `<p class="text-p2 font-bold">${item.location}</p>` : ''}
                      ${item.location_zh ? `<p class="text-p2 font-bold">${item.location_zh}</p>` : ''}
                    </div>` : ''}
                  </div>` : ''}
                  ${containerId === 'industry-list' && dateDisplay ? `<div><p class="text-p2 font-bold">${dateDisplay}</p></div>` : ''}
                  ${item.guests && item.guests.length ? `<div class="flex flex-col gap-xs">
                    ${item.guests.map(g => `<div class="flex gap-2xl">
                      <div class="flex-1"><p class="text-p2 font-bold">${g.name}</p>${g.name_zh ? `<p class="text-p2 font-bold">${g.name_zh}</p>` : ''}${containerId !== 'industry-list' && g.affiliation ? `<p class="text-p3">${g.affiliation.length > 20 ? `${g.affiliation}<br>${g.affiliation_zh || ''}` : `${g.affiliation}${g.affiliation_zh ? ' ' + g.affiliation_zh : ''}`}</p>` : ''}</div>
                      ${containerId !== 'industry-list' ? `<div class="flex-shrink-0 flex items-start gap-md">
                        ${g.isAlumni ? `<p class="text-p2">Alumni 系友</p>` : ''}
                        ${g.country ? `<p class="text-p2">${g.country}${g.country_zh ? ` ${g.country_zh}` : ''}</p>` : ''}
                      </div>` : ''}
                    </div>`).join('')}
                  </div>` : ''}
                  ${containerId !== 'lectures-list' && containerId !== 'industry-list' && (item.description || item.descriptionZh) ? `<div class="overflow-y-auto pr-xl" style="max-height: 250px; background: transparent;">
                    ${item.description ? `<p class="text-p2 leading-base">${item.description}</p>` : ''}
                    ${item.descriptionZh ? `<p class="text-p2 leading-base mt-md">${item.descriptionZh}</p>` : ''}
                  </div>` : ''}
                </div>
                ${containerId !== 'industry-list' ? buildPosterHtml(item) : ''}
              </div>
              ${buildGalleryHtml(item)}
              ${containerId === 'industry-list' && item.reference ? `
              <div class="px-xl pb-lg">
                <button class="industry-ref-btn cursor-pointer border-none bg-none p-0 flex items-start gap-sm"
                  data-ref-section="${item.reference.section}"
                  data-ref-item="${item.reference.itemId || ''}">
                  <i class="fa-solid fa-arrow-right text-p2 flex-shrink-0" style="padding-top: 0.25rem;"></i>
                  <div class="flex flex-col text-left">
                    <p class="text-p2 text-black">${item.reference.labelEn || ''} ${item.reference.labelZh || ''}</p>
                    ${item.reference.titleEn ? `<p class="text-p2 font-bold text-black">${item.reference.titleEn}</p>` : ''}
                    ${item.reference.titleZh ? `<p class="text-p2 font-bold text-black">${item.reference.titleZh}</p>` : ''}
                  </div>
                </button>
              </div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.insertAdjacentHTML('beforeend', `
        <div class="workshop-year-group grid-12 items-start">
          <div class="col-span-12 md:col-span-1 md:col-start-1 workshop-year-toggle cursor-pointer flex items-center gap-sm order-1 py-sm pl-xs md:sticky md:self-start md:pb-sm">
            <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
            <h5>${yearGroup.year}</h5>
          </div>
          <div class="col-span-12 md:col-span-11 md:col-start-2 workshop-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]">
            ${itemsHtml}
          </div>
        </div>
        ${!isLast ? '<div class="activities-separator border-b-4 border-black"></div>' : ''}
      `);
    });

    // Gallery 左右滑動、Lightbox、hover 效果、海報比例偵測
    bindInteractions(container);

    // Industry reference 按鈕（透過全域 window.__sccdNavigateToItem 避免循環 import）
    if (containerId === 'industry-list') {
      container.querySelectorAll('.industry-ref-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const section = btn.dataset.refSection;
          const itemId  = btn.dataset.refItem;
          if (typeof window.__sccdNavigateToItem === 'function') {
            window.__sccdNavigateToItem(section, itemId || null);
          }
        });
      });
    }

    // 進場動畫：初始載入用統一 ScrollTrigger（年份依序出現），filter 重建用個別 ScrollTrigger
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      // 統一觸發，年份一個接一個（moment 和 lectures 皆用此邏輯）
      buildInitialScrollTrigger(container);
    }

    // 動態設定年份 toggle 的 sticky top（對應各自 panel 的 filter/search bar 底部）
    const panelSelectorMap = { 'lectures-list': '#panel-lectures', 'industry-list': '#panel-industry' };
    const panelSelector = panelSelectorMap[containerId] || '#panel-general';
    updateYearToggleStickyTop(container, panelSelector);
  } catch (error) {
    console.error('Error loading general activities data:', error);
  }
}
