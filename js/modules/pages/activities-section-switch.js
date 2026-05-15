/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadExhibitionsInto, loadGeneralActivitiesInto, loadLecturesInto, loadIndustryInto, loadWorkshopsInto, loadSummerCampInto, loadVisitsInto } from './activities-data-loader.js';
import { loadAlbumData } from './album-data-loader.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initListAccordion, resetListAccordionsInPanel } from '../accordions/list-accordion.js';
import { reapplySearch } from '../ui/activities-search.js';
import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';
import { playAdmissionPanelExit, playAdmissionPanelReveal, setupAdmissionReveal } from './admission-data-loader.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};
// 防連點：exit/reveal 動畫期間 swallow 重複觸發
let switching = false;

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
      switchToSection(initialSection, btns, false, true);
      setTimeout(() => navigateToItem(initialSection, initialItem), 1000);
    } else {
      // 沒指定 item → 只 scroll 到 list section，不做 highlight
      switchToSection(initialSection, btns, false, true);
      setTimeout(() => {
        const sectionEl = document.getElementById('activities-content-section');
        if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
      }, 1000);
    }
  } else {
    switchToSection(initialSection, btns, false, true);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
    });
  });
}

async function switchToSection(section, btns, shouldScroll, isInitial = false) {
  if (switching) return;

  const currentPanel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
  const targetId = `panel-${section}`;
  // 已 active 同 panel：跳過退場/進場動畫；如果是 click（shouldScroll）仍 scroll 對齊 anchor
  if (currentPanel && currentPanel.id === targetId && !isInitial) {
    if (shouldScroll) {
      const sectionEl = document.getElementById('activities-content-section');
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  switching = true;

  // 1. 退場（首次 init 跳過；切到同 panel 也跳過）
  if (!isInitial && currentPanel && currentPanel.id !== targetId) {
    await playAdmissionPanelExit(currentPanel);
  }

  // 2. 切按鈕 active 狀態（隨機顏色 + 旋轉）
  const { color } = setActiveNavBtn(btns, section, 'data-section');
  currentSectionColor = color;
  window.__sccdCurrentSectionColor = color;

  // 3. 切 panel 顯示
  const target = /** @type {HTMLElement | null} */ (showPanel('.activities-panel', targetId));
  if (target) {
    // 收起 target panel 內遺留的 open accordion（avoid「切到別的 panel 再切回來時 accordion 仍打開」殘留體驗）
    resetListAccordionsInPanel(target);
    // 同步所有 active filter btn 的顏色
    target.querySelectorAll('.activities-filter-btn.active, .album-filter-option.active').forEach(btn => {
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) {
        /** @type {HTMLElement} */ (inner).style.background = currentSectionColor;
        /** @type {HTMLElement} */ (inner).style.transform  = '';
      } else {
        /** @type {HTMLElement} */ (btn).style.background = currentSectionColor;
      }
    });
  }

  // 4. 進場 setup：把所有 rows 推到 yPercent:100（含 desc / filter / search）
  //    初次 init 也 hide=true：rows 由 ScrollTrigger 在進 viewport 時觸發 reveal，
  //    user 還在 hero 時看不到 list 區的 desc/filter，捲到才顯示 → 真正的 scroll-in-view 效果
  if (target) setupAdmissionReveal(target, { hide: true });

  // 5. 懶載入資料（autoReveal:false → reveal 由本模組接管，避免與既有 ScrollTrigger.batch 雙觸發）
  await loadPanel(section);

  // 6. Scroll to section（點擊時才 scroll，初始載入不 scroll）
  if (shouldScroll) {
    const sectionEl = document.getElementById('activities-content-section') || document.getElementById('library-content-section');
    if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
  }

  // 7. 進場 reveal：
  //    - 一律 useScrollTrigger=true：rows 進 viewport 才觸發，user 沒捲到的不先 reveal
  //    - 點擊切換：等 scrollIntoView 完成（600ms）再 create 觸發器，這樣 trigger 評估位置是新 scroll 後的視口
  //    - 不再用 false 直接 sequential 跑 master timeline，避免使用者看到還沒捲到的下方 list 已動畫跑完
  if (target) {
    if (isInitial) {
      playAdmissionPanelReveal(target, { useScrollTrigger: true });
    } else if (shouldScroll) {
      setTimeout(() => playAdmissionPanelReveal(target, { useScrollTrigger: true }), 600);
    } else {
      playAdmissionPanelReveal(target, { useScrollTrigger: true });
    }
  }

  switching = false;
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

// autoReveal:false 全程關閉 loader 內 ScrollTrigger.batch reveal — 統一由 switchToSection 呼叫
// playAdmissionPanelReveal 接管（避免「loader auto reveal」與「switch reveal」雙觸發 race）
async function loadPanel(section) {
  if (loaded[section]) return;
  loaded[section] = true;

  const opts = { autoReveal: false };

  switch (section) {
    case 'exhibitions':
      await loadExhibitionsInto(opts);
      initActivitiesYearToggle();
      initListAccordion();
      initExhibitionsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'visits':
      await loadVisitsInto(opts);
      initActivitiesYearToggle();
      initListAccordion();
      initVisitsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'competitions':
      await loadGeneralActivitiesInto('competitions-list', 'competitions', '/data/general-activities.json', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'conferences':
      await loadGeneralActivitiesInto('conferences-list', 'conferences', '/data/general-activities.json', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'lectures':
      await loadLecturesInto('lectures-list', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'workshop':
      await loadWorkshopsInto('/data/workshops.json', 'workshop-list', opts);
      initListAccordion();
      return;

    case 'degree-show':
      // degree-show 用自己的 y+autoAlpha reveal（無 .list-reveal-row），不走 admission helpers
      await loadDegreeShowListInto('degree-show-list');
      return;

    case 'summer-camp':
      await loadSummerCampInto('summer-camp-list', opts);
      initListAccordion();
      return;

    case 'students-present':
      await loadWorkshopsInto('/data/students-present.json', 'students-present-list', opts);
      initListAccordion();
      return;

    case 'album':
      await loadAlbumData('album-list-container');
      return;

    case 'industry':
      await loadIndustryInto('industry-list', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;
  }
}
