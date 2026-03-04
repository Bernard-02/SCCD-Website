/**
 * Courses Section Switch Module
 * 處理 courses.html 的 BFA / MDES 切換
 * 仿照 activities-section-switch.js 架構
 */

import { loadCourses } from './courses-data-loader.js';
import { initCourseAccordion } from '../accordions/course-accordion.js';
import { initCoursesFilter } from '../filters/courses-filter.js';

const loaded = new Set(); // 記錄已載入的 program，避免重複 fetch
const COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

let currentProgramColor = '';
export function getCurrentProgramColor() { return currentProgramColor; }

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function getRandomRotation() {
  let deg;
  do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
  return deg;
}

export function initCoursesSectionSwitch() {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  // 初始載入預設分頁（BFA）
  switchToProgram('bfa', programBtns, false);

  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const program = btn.getAttribute('data-program');
      switchToProgram(program, programBtns, true);
    });
  });

  async function switchToProgram(program, btns, shouldScroll) {
    // 更新按鈕狀態與隨機顏色 + rotation
    const color = getRandomColor();
    currentProgramColor = color;
    const rot = getRandomRotation();
    btns.forEach(b => {
      b.classList.remove('active');
      const inner = b.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = ''; inner.style.transform = ''; }
    });
    const activeBtn = [...btns].find(b => b.getAttribute('data-program') === program);
    if (activeBtn) {
      activeBtn.classList.add('active');
      const activeInner = activeBtn.querySelector('.anchor-nav-inner');
      if (activeInner) { activeInner.style.background = color; activeInner.style.transform = `rotate(${rot}deg)`; }
    }

    // 顯示對應 panel，隱藏其他
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `panel-${program}`));

    // 同步 active filter btn 的顏色
    const activePanel = document.getElementById(`panel-${program}`);
    if (activePanel) {
      const activeFilterBtn = activePanel.parentElement.querySelector('.courses-filter-btn.active');
      if (activeFilterBtn) {
        const filterInner = activeFilterBtn.querySelector('.anchor-nav-inner');
        if (filterInner) { filterInner.style.background = color; filterInner.style.transform = `rotate(${getRandomRotation()}deg)`; }
      }
    }

    // 載入資料（只載一次）
    if (!loaded.has(program)) {
      loaded.add(program);
      await loadCourses(program);
      initCourseAccordion();
      initCoursesFilter(program);
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    }

    // 捲到 section 頂部
    if (shouldScroll && sectionEl) {
      const header = document.querySelector('header');
      const offset = header ? header.offsetHeight : 0;
      const top = sectionEl.getBoundingClientRect().top + window.scrollY - offset;
      if (typeof gsap !== 'undefined' && typeof ScrollToPlugin !== 'undefined') {
        gsap.to(window, { scrollTo: { y: top }, duration: 0.5, ease: 'power2.inOut' });
      } else {
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }
}
