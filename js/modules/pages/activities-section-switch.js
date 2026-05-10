/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadExhibitionsInto, loadGeneralActivitiesInto, loadLecturesInto, loadIndustryInto, loadWorkshopsInto, loadSummerCampInto, loadVisitsInto } from './activities-data-loader.js';
import { loadAlbumData } from './album-data-loader.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { reapplySearch } from '../ui/activities-search.js';
import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};

let currentSectionColor = '';
export function getCurrentSectionColor() { return currentSectionColor; }

// 從外部（如 industry reference 按鈕）導航到指定 section 的指定 item
export async function navigateToItem(section, itemId) {
  const btns = document.querySelectorAll('.activities-section-btn');
  await switchToSection(section, btns, false);
  if (!itemId) return;

  // 等 fetch + DOM render 完成後再 scroll
  await new Promise(r => setTimeout(r, 150));
  await new Promise(r => requestAnimationFrame(r));

  const target = document.getElementById(`item-${itemId}`);
  if (!target) return;

  // 若 target 在 sub-tab 隱藏的 list container（exhibitions 的 permanent / visits 的 inbound 等），先切到對應 sub-tab
  const subListContainer = target.closest('#exhibitions-list-special, #exhibitions-list-permanent, #visits-list-outbound, #visits-list-inbound');
  if (subListContainer && subListContainer instanceof HTMLElement && subListContainer.style.display === 'none') {
    const subTabMap = {
      'exhibitions-list-special':   '#exhibitions-type-filter [data-type="special"]',
      'exhibitions-list-permanent': '#exhibitions-type-filter [data-type="permanent"]',
      'visits-list-outbound':       '#visits-type-filter [data-type="outbound"]',
      'visits-list-inbound':        '#visits-type-filter [data-type="inbound"]',
    };
    const tabBtnSelector = subTabMap[subListContainer.id];
    if (tabBtnSelector) {
      const tabBtn = /** @type {HTMLElement | null} */ (document.querySelector(tabBtnSelector));
      tabBtn?.click();
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // 若 year group 是收合的，先展開
  const yearItems = target.closest('.list-year-items');
  if (yearItems && (yearItems.style.height === '0px' || yearItems.style.display === 'none')) {
    const yearGrid = yearItems.closest('.grid-12');
    const yearToggle = yearGrid?.querySelector('.list-year-toggle');
    if (yearToggle) {
      yearToggle.click();
      // 等 accordion 展開動畫完成（transition 通常 300ms）
      await new Promise(r => setTimeout(r, 350));
    }
  }

  // 計算目標位置
  const panel      = document.getElementById(`panel-${section}`);
  const filterBar  = panel?.querySelector('.activities-filter-bar');
  const filterBarH = filterBar?.offsetHeight || 0;
  const compensate = 200 + filterBarH + 16;

  let targetTop = 0;
  let el = target;
  while (el) { targetTop += el.offsetTop; el = el.offsetParent; }
  const finalTop = targetTop - compensate;

  window.scrollTo({ top: finalTop, behavior: 'smooth' });

  // scroll 完成後：先閃 highlight，再展開 accordion
  setTimeout(() => {
    const flashColor = currentSectionColor || '#00FF80';
    target.style.transition = 'background 0.3s';
    target.style.background = flashColor;
    setTimeout(() => {
      target.style.background = '';
      const header = target.querySelector('.list-header');
      if (header && !header.classList.contains('active')) {
        header.style.background = flashColor;
        header.click();
      }
    }, 600);
  }, 600);
}

export function initActivitiesSectionSwitch(defaultSection = 'general') {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (btns.length === 0) return;

  // SPA 換頁後 DOM 重建，需重置 loaded 狀態讓資料重新載入
  Object.keys(loaded).forEach(k => delete loaded[k]);

  // 暴露給 industry reference 按鈕使用（避免循環 import）
  window.__sccdNavigateToItem = (section, itemId) => navigateToItem(section, itemId);

  // 支援 ?section= 和 ?item= query string（從外部連結過來時切換 + highlight 特定項目）
  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get('section') || defaultSection;
  const initialItem = params.get('item');

  if (params.has('section')) {
    // 從外部連結進來：先停留在 hero 1s，再 scroll（+ highlight 特定項目）
    if (initialItem) {
      // 有 ?item= → 用 navigateToItem 處理 scroll + 單一項目 highlight
      switchToSection(initialSection, btns, false);
      setTimeout(() => navigateToItem(initialSection, initialItem), 1000);
    } else {
      // 沒指定 item → 只 scroll 到 list section，不做 highlight
      switchToSection(initialSection, btns, false);
      setTimeout(() => {
        const sectionEl = document.getElementById('activities-content-section');
        if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
      }, 1000);
    }
  } else {
    switchToSection(initialSection, btns, false);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
    });
  });
}

async function switchToSection(section, btns, shouldScroll) {
  // 更新按鈕 active 狀態（隨機顏色 + 旋轉）
  const { color } = setActiveNavBtn(btns, section, 'data-section');
  currentSectionColor = color;
  window.__sccdCurrentSectionColor = color;

  // 切換 panel 顯示
  const target = showPanel('.activities-panel', `panel-${section}`);
  if (target) {
    // 同步所有 active filter btn 的顏色
    target.querySelectorAll('.activities-filter-btn.active, .album-filter-option.active').forEach(btn => {
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) {
        inner.style.background = currentSectionColor;
        inner.style.transform  = '';
      } else {
        btn.style.background = currentSectionColor;
      }
    });
  }

  // 懶載入：等資料載入完才 scroll（否則 panel 是空的，scroll 位置不準）
  const playAnimation = await loadPanel(section);

  // Scroll to section（點擊時才 scroll，初始載入不 scroll）
  if (shouldScroll) {
    const sectionEl = document.getElementById('activities-content-section') || document.getElementById('library-content-section');
    if (sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth' });
      if (playAnimation) setTimeout(playAnimation, 600);
    }
  } else {
    // 初始載入不 scroll，但有動畫的 panel 直接播
    if (playAnimation) playAnimation();
  }
}

function initExhibitionsTypeFilter() {
  const btns = document.querySelectorAll('#exhibitions-type-filter .exhibitions-type-btn');
  if (!btns.length) return;

  const activeBtn = document.querySelector('#exhibitions-type-filter .exhibitions-type-btn.active');
  if (activeBtn) {
    const inner = activeBtn.querySelector('.anchor-nav-inner');
    if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        b.classList.remove('active');
        const inner = b.querySelector('.anchor-nav-inner');
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      btn.classList.add('active');
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }

      // 切換前後抓 filter bar 視窗 Y 位置，補回 delta 保留 sticky 視覺位置；
      // 否則新 list 比舊 list 短時瀏覽器會 clamp scrollY → 像跳回頂部
      const filterBar = document.querySelector('#panel-exhibitions .activities-filter-bar');
      const beforeTop = filterBar?.getBoundingClientRect().top ?? 0;

      const type = btn.dataset.type;
      document.getElementById('exhibitions-list-special').style.display  = type === 'special'   ? '' : 'none';
      document.getElementById('exhibitions-list-permanent').style.display = type === 'permanent' ? '' : 'none';
      reapplySearch('panel-exhibitions');

      if (filterBar) {
        const afterTop = filterBar.getBoundingClientRect().top;
        const delta = afterTop - beforeTop;
        if (delta !== 0) window.scrollBy(0, delta);
      }
    });
  });
}

function initVisitsTypeFilter() {
  const btns = document.querySelectorAll('#visits-type-filter .visits-type-btn');
  if (!btns.length) return;

  // 初始化 active btn 樣式（預設 outbound 已在 HTML 標記 active）
  const activeBtn = document.querySelector('#visits-type-filter .visits-type-btn.active');
  if (activeBtn) {
    const inner = activeBtn.querySelector('.anchor-nav-inner');
    if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        b.classList.remove('active');
        const inner = b.querySelector('.anchor-nav-inner');
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      btn.classList.add('active');
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }

      // 切換前後抓 filter bar 視窗 Y 位置，補回 delta 保留 sticky 視覺位置；
      // 否則新 list 比舊 list 短時瀏覽器會 clamp scrollY → 像跳回頂部
      const filterBar = document.querySelector('#panel-visits .activities-filter-bar');
      const beforeTop = filterBar?.getBoundingClientRect().top ?? 0;

      const type = btn.dataset.type;
      document.getElementById('visits-list-outbound').style.display = type === 'outbound' ? '' : 'none';
      document.getElementById('visits-list-inbound').style.display  = type === 'inbound'  ? '' : 'none';
      reapplySearch('panel-visits');

      if (filterBar) {
        const afterTop = filterBar.getBoundingClientRect().top;
        const delta = afterTop - beforeTop;
        if (delta !== 0) window.scrollBy(0, delta);
      }
    });
  });
}

// 回傳 playAnimation function（需在 scroll 完成後呼叫），或 null
async function loadPanel(section) {
  if (loaded[section]) return null;
  loaded[section] = true;

  switch (section) {
    case 'exhibitions':
      await loadExhibitionsInto();
      initActivitiesYearToggle();
      initListAccordion();
      initExhibitionsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'visits':
      await loadVisitsInto();
      initActivitiesYearToggle();
      initListAccordion();
      initVisitsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'competitions':
      await loadGeneralActivitiesInto('competitions-list', 'competitions');
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'conferences':
      await loadGeneralActivitiesInto('conferences-list', 'conferences');
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'lectures':
      await loadLecturesInto('lectures-list');
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'workshop': {
      const play = await loadWorkshopsInto('/data/workshops.json', 'workshop-list');
      initListAccordion();
      return play;
    }

    case 'degree-show':
      await loadDegreeShowListInto('degree-show-list');
      return null;

    case 'summer-camp': {
      const play = await loadSummerCampInto('summer-camp-list');
      initListAccordion();
      return play;
    }

    case 'students-present': {
      const play = await loadWorkshopsInto('/data/students-present.json', 'students-present-list');
      initListAccordion();
      return play;
    }

    case 'album':
      await loadAlbumData('album-list-container');
      return null;

    case 'industry':
      await loadIndustryInto('industry-list');
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;
  }
  return null;
}
