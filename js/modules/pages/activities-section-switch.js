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

function switchToSection(section, btns, shouldScroll) {
  // 更新按鈕 active 狀態與隨機顏色
  btns.forEach(b => {
    b.classList.remove('active');
    b.style.color = '';
  });
  const activeBtn = [...btns].find(b => b.getAttribute('data-section') === section);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.color = getRandomColor();
  }

  // 切換 panel 顯示
  document.querySelectorAll('.activities-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  const target = document.getElementById(`panel-${section}`);
  if (target) target.classList.remove('hidden');

  // Scroll to section（點擊時才 scroll，初始載入不 scroll）
  if (shouldScroll) {
    const sectionEl = document.getElementById('activities-content-section');
    if (sectionEl) {
      const header = document.querySelector('header');
      const offset = header ? header.offsetHeight : 0;
      const top = sectionEl.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  // 懶載入：只在第一次顯示時載入資料
  loadPanel(section);
}

async function loadPanel(section) {
  if (loaded[section]) return;
  loaded[section] = true;

  switch (section) {
    case 'general':
      await loadGeneralActivitiesInto('general-activities-list');
      initActivitiesFilter();
      initActivitiesYearToggle();
      initWorkshopAccordion();
      break;

    case 'workshop':
      await loadWorkshopsInto('../data/workshops.json', 'workshop', 'workshop-list');
      initWorkshopAccordion();
      break;

    case 'degree-show':
      await loadDegreeShowListInto('degree-show-list');
      break;

    case 'summer-camp':
      await loadSummerCampInto('summer-camp-list');
      initSummerCampAccordion();
      break;

    case 'students-present':
      await loadWorkshopsInto('../data/students-present.json', 'student', 'students-present-list');
      initWorkshopAccordion();
      break;
  }
}
