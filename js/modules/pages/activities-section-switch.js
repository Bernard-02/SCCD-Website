/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadGeneralActivitiesInto, loadLecturesInto } from './general-activities-data-loader.js';
import { loadIndustryInto } from './industry-data-loader.js';
import { loadWorkshopsInto, loadSummerCampInto } from './activities-data-loader.js';
import { loadAlbumData } from './album-data-loader.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { initActivitiesFilter } from '../filters/activities-filter.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initListAccordion } from '../accordions/list-accordion.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};

let currentSectionColor = '';
export function getCurrentSectionColor() { return currentSectionColor; }

// 從外部（如 industry reference 按鈕）導航到指定 section 的指定 item
export async function navigateToItem(section, itemId) {
  const btns = document.querySelectorAll('.activities-section-btn');
  await switchToSection(section, btns, false);
  if (!itemId) return;
  // 等 DOM 渲染完成後再 scroll
  setTimeout(() => {
    const target = document.getElementById(`item-${itemId}`);
    if (!target) return;

    // 若 year group 是收合的，先展開
    const yearItems = target.closest('.list-year-items');
    if (yearItems && (yearItems.style.height === '0px' || yearItems.style.display === 'none')) {
      const yearGrid = yearItems.closest('.grid-12');
      const yearToggle = yearGrid?.querySelector('.list-year-toggle');
      if (yearToggle) yearToggle.click();
    }

    // 先 scroll 到 item
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    const panel     = document.getElementById(`panel-${section}`);
    const filterBar = panel?.querySelector('.activities-filter-bar');
    const filterBarH = filterBar?.offsetHeight || 0;
    const compensate = 160 + filterBarH + 16;
    const finalTop = window.scrollY + target.getBoundingClientRect().top - compensate;
    window.scrollTo({ top: finalTop, behavior: 'smooth' });

    // scroll 完成後：先閃 highlight，再展開 accordion
    setTimeout(() => {
      // 先閃一下
      const flashColor = currentSectionColor || '#00FF80';
      target.style.transition = 'background 0.3s';
      target.style.background = flashColor;
      setTimeout(() => {
        target.style.background = '';
        // 閃完後展開，用同一個顏色
        const header = target.querySelector('.list-header');
        if (header && !header.classList.contains('active')) {
          header.style.background = flashColor;
          header.click();
        }
      }, 600);
    }, 600);
  }, 150);
}

export function initActivitiesSectionSwitch(defaultSection = 'general') {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (btns.length === 0) return;

  // 暴露給 industry reference 按鈕使用（避免循環 import）
  window.__sccdNavigateToItem = (section, itemId) => navigateToItem(section, itemId);

  // 支援 ?section= query string（從 mega menu 連結過來時直接切換）
  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get('section') || defaultSection;

  switchToSection(initialSection, btns, false);

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
    });
  });
}

function setActiveSectionStyle(btns, activeBtn) {
  const color = SCCDHelpers.getRandomAccentColor();
  currentSectionColor = color;
  const rot = SCCDHelpers.getRandomRotation();
  btns.forEach(b => {
    b.classList.remove('active');
    const inner = b.querySelector('.anchor-nav-inner');
    if (inner) { inner.style.background = ''; inner.style.transform = ''; }
  });
  if (activeBtn) {
    activeBtn.classList.add('active');
    const activeInner = activeBtn.querySelector('.anchor-nav-inner');
    if (activeInner) { activeInner.style.background = color; activeInner.style.transform = `rotate(${rot}deg)`; }
  }
}

async function switchToSection(section, btns, shouldScroll) {
  // 更新按鈕 active 狀態、隨機顏色與角度
  const activeBtn = [...btns].find(b => b.getAttribute('data-section') === section);
  setActiveSectionStyle(btns, activeBtn);

  // 切換 panel 顯示
  document.querySelectorAll('.activities-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  const target = document.getElementById(`panel-${section}`);
  if (target) {
    target.classList.remove('hidden');
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
      const top = sectionEl.offsetTop;

      if (typeof gsap !== 'undefined' && typeof ScrollToPlugin !== 'undefined') {
        gsap.to(window, {
          scrollTo: { y: top },
          duration: 0.5,
          ease: 'power2.inOut',
          onComplete: () => { if (playAnimation) playAnimation(); },
        });
      } else {
        window.scrollTo({ top, behavior: 'smooth' });
        if (playAnimation) setTimeout(playAnimation, 800);
      }
    }
  } else {
    // 初始載入不 scroll，但有動畫的 panel 直接播
    if (playAnimation) playAnimation();
  }
}

// 回傳 playAnimation function（需在 scroll 完成後呼叫），或 null
async function loadPanel(section) {
  if (loaded[section]) return null;
  loaded[section] = true;

  switch (section) {
    case 'exhibitions':
      await loadGeneralActivitiesInto('general-activities-list', 'exhibitions');
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null;

    case 'visits':
      await loadGeneralActivitiesInto('visits-list', 'visits');
      initActivitiesYearToggle();
      initListAccordion();
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
      const play = await loadWorkshopsInto('../data/workshops.json', 'workshop', 'workshop-list');
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
      const play = await loadWorkshopsInto('../data/students-present.json', 'student', 'students-present-list');
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
