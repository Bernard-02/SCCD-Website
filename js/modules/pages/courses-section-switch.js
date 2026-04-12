/**
 * Courses Section Switch Module
 * 處理 courses.html 的 BFA / MDES 切換
 */

import { loadCourses } from './courses-data-loader.js';
import { initCourseAccordion } from '../accordions/course-accordion.js';
import { initCoursesFilter } from '../filters/courses-filter.js';
import { setActiveNavBtn } from '../ui/section-switch-helpers.js';

const loaded = new Set();

let currentProgramColor = '';
export function getCurrentProgramColor() { return currentProgramColor; }

export function initCoursesSectionSwitch() {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  loaded.clear();

  // 支援 query string
  const params = new URLSearchParams(window.location.search);
  const hasQueryDeepLink = params.has('program') || params.has('filter') || params.has('item');
  const initialProgram = params.get('program') || 'bfa';
  const initialFilter  = params.get('filter') || null;
  const initialItem    = params.get('item');

  // 有 ?item= → switchToProgram 內部的 1200ms setTimeout 會 scroll 到該課程 + flash
  // 沒 ?item= 但有 ?program=/?filter= → 只 scroll 到 list section 頂部（停留 hero 1s）
  switchToProgram(initialProgram, programBtns, false, initialItem, initialFilter);
  if (hasQueryDeepLink && !initialItem) {
    setTimeout(() => {
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
    }, 1000);
  }

  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToProgram(btn.getAttribute('data-program'), programBtns, true);
    });
  });

  async function switchToProgram(program, btns, shouldScroll, highlightItem = null, highlightFilter = null) {
    // 按鈕 active + panel 切換
    const { color } = setActiveNavBtn(btns, program, 'data-program');
    currentProgramColor = color;
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `panel-${program}`));

    // 同步 active filter btn 的顏色
    const activePanel = document.getElementById(`panel-${program}`);
    if (activePanel) {
      const activeFilterBtn = activePanel.parentElement.querySelector('.courses-filter-btn.active');
      if (activeFilterBtn) {
        const filterInner = activeFilterBtn.querySelector('.anchor-nav-inner');
        if (filterInner) {
          filterInner.style.background = color;
          filterInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
        }
      }
    }

    // 載入資料（只載一次）
    if (!loaded.has(program)) {
      loaded.add(program);
      await loadCourses(program);
      initCourseAccordion();
      initCoursesFilter(program);
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

      // Deep link 處理：?filter= 切換 filter tab
      if (highlightFilter) {
        setTimeout(() => {
          const filterScope = document.getElementById(`panel-${program}`)?.parentElement;
          const filterBtns = filterScope?.querySelectorAll('.courses-filter-btn');
          const targetFilterBtn = filterBtns ? [...filterBtns].find(b => b.getAttribute('data-filter') === highlightFilter) : null;
          if (targetFilterBtn && !targetFilterBtn.classList.contains('active')) {
            targetFilterBtn.click();
          }
        }, 100);
      }

      // ?item= 深度連結：scroll + highlight + 展開（保留供其他用途）
      if (highlightItem) {
        setTimeout(() => {
          const target = document.getElementById(`course-${highlightItem}`);
          if (!target) return;

          const filterBar = document.querySelector('.courses-filter-bar');
          const filterH = filterBar?.offsetHeight || 0;
          let targetTop = 0;
          let el = target;
          while (el) { targetTop += el.offsetTop; el = el.offsetParent; }
          window.scrollTo({ top: targetTop - 200 - filterH, behavior: 'smooth' });
          history.replaceState(null, '', window.location.pathname);

          const flashColor = color || '#00FF80';
          const header = target.querySelector('.course-header');
          const flashEl = header || target; // 優先 flash header，避免延伸到 overflow 區域
          setTimeout(() => {
            flashEl.style.transition = 'background 0.3s';
            flashEl.style.background = flashColor;
            setTimeout(() => {
              flashEl.style.background = '';
              if (header && !header.classList.contains('active')) {
                header.style.background = flashColor;
                header.click();
              }
            }, 600);
          }, 600);
        }, 1200);
      }
    }

    if (shouldScroll && sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

