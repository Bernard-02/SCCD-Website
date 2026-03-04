/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadGeneralActivitiesInto } from './general-activities-data-loader.js';
import { loadWorkshopsInto, loadSummerCampInto } from './activities-data-loader.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { initActivitiesFilter } from '../filters/activities-filter.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initWorkshopAccordion } from '../accordions/workshop-accordion.js';
import { initSummerCampAccordion } from '../accordions/summer-camp-accordion.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};
const COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

let currentSectionColor = '';
export function getCurrentSectionColor() { return currentSectionColor; }

export function initActivitiesSectionSwitch() {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (btns.length === 0) return;

  // 支援 ?section= query string（從 mega menu 連結過來時直接切換）
  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get('section') || 'general';

  switchToSection(initialSection, btns, false);

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
    });
  });
}

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function getRandomRotation() {
  let deg;
  do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
  return deg;
}

function setActiveSectionStyle(btns, activeBtn) {
  const color = getRandomColor();
  currentSectionColor = color;
  const rot = getRandomRotation();
  btns.forEach(b => {
    b.classList.remove('active');
    b.querySelectorAll('span').forEach(span => {
      span.style.color = '';
      span.style.transform = '';
    });
  });
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.querySelectorAll('span').forEach(span => {
      span.style.color = color;
      span.style.transform = `rotate(${rot}deg)`;
    });
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
    // 同步 active filter btn 的顏色
    const activeFilterBtn = target.querySelector('.activities-filter-btn.active');
    if (activeFilterBtn) {
      activeFilterBtn.style.color = currentSectionColor;
      activeFilterBtn.style.transform = `rotate(${getRandomRotation()}deg)`;
    }
  }

  // 懶載入：等資料載入完才 scroll（否則 panel 是空的，scroll 位置不準）
  const playAnimation = await loadPanel(section);

  // Scroll to section（點擊時才 scroll，初始載入不 scroll）
  if (shouldScroll) {
    const sectionEl = document.getElementById('activities-content-section');
    if (sectionEl) {
      const header = document.querySelector('header');
      const offset = header ? header.offsetHeight : 0;
      const top = sectionEl.getBoundingClientRect().top + window.scrollY - offset;

      if (typeof gsap !== 'undefined' && typeof ScrollToPlugin !== 'undefined') {
        // 用 GSAP scrollTo，scroll 完成後才播放進場動畫
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
    case 'general':
      await loadGeneralActivitiesInto('general-activities-list');
      initActivitiesFilter();
      initActivitiesYearToggle();
      initWorkshopAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return null; // general 用 ScrollTrigger，不需要外部觸發

    case 'workshop': {
      const play = await loadWorkshopsInto('../data/workshops.json', 'workshop', 'workshop-list');
      initWorkshopAccordion();
      return play;
    }

    case 'degree-show':
      await loadDegreeShowListInto('degree-show-list');
      return null;

    case 'summer-camp': {
      const play = await loadSummerCampInto('summer-camp-list');
      initSummerCampAccordion();
      return play;
    }

    case 'students-present': {
      const play = await loadWorkshopsInto('../data/students-present.json', 'student', 'students-present-list');
      initWorkshopAccordion();
      return play;
    }
  }
  return null;
}
