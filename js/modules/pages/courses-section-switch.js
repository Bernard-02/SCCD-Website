/**
 * Courses Section Switch Module
 * 處理 courses.html 的 BFA / MDES 切換
 * 仿照 activities-section-switch.js 架構
 */

import { loadCourses } from './courses-data-loader.js';
import { initCourseAccordion } from '../accordions/course-accordion.js';
import { initCoursesFilter } from '../filters/courses-filter.js';

const loaded = new Set(); // 記錄已載入的 program，避免重複 fetch

let currentProgramColor = '';
export function getCurrentProgramColor() { return currentProgramColor; }

export function initCoursesSectionSwitch() {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  // SPA 換頁後 DOM 重建，需重置 loaded 狀態讓資料重新載入
  loaded.clear();

  // 支援 ?program= 、?filter= 與 ?item= query string（從外部連結過來時直接切換並 highlight）
  const params = new URLSearchParams(window.location.search);
  const initialProgram = params.get('program') || 'bfa';
  const initialFilter  = params.get('filter') || null;
  const initialItem    = params.get('item');

  // 初始載入預設分頁
  switchToProgram(initialProgram, programBtns, false, initialItem, initialFilter);

  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const program = btn.getAttribute('data-program');
      switchToProgram(program, programBtns, true);
    });
  });

  async function switchToProgram(program, btns, shouldScroll, highlightItem = null, highlightFilter = null) {
    // 更新按鈕狀態與隨機顏色 + rotation
    const color = SCCDHelpers.getRandomAccentColor();
    currentProgramColor = color;
    const rot = SCCDHelpers.getRandomRotation();
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
        if (filterInner) { filterInner.style.background = color; filterInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }
      }
    }

    // 載入資料（只載一次）
    if (!loaded.has(program)) {
      loaded.add(program);
      await loadCourses(program);
      initCourseAccordion();
      initCoursesFilter(program);
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

      // 若有 ?item= 參數，scroll 到並展開對應課程
      if (highlightItem) {
        setTimeout(() => {
          // 若有 ?filter=，先切換到對應的 filter（required / elective）
          if (highlightFilter) {
            const filterScope = document.getElementById(`panel-${program}`)?.parentElement;
            const filterBtns = filterScope?.querySelectorAll('.courses-filter-btn');
            const targetFilterBtn = filterBtns ? [...filterBtns].find(b => b.getAttribute('data-filter') === highlightFilter) : null;
            if (targetFilterBtn && !targetFilterBtn.classList.contains('active')) {
              targetFilterBtn.click();
            }
          }

          const target = document.getElementById(`course-${highlightItem}`);
          if (!target) return;

          const filterBar = document.querySelector('.courses-filter-bar');
          const filterH = filterBar?.offsetHeight || 0;
          let targetTop = 0;
          let el = target;
          while (el) { targetTop += el.offsetTop; el = el.offsetParent; }
          window.scrollTo({ top: targetTop - 160 - filterH, behavior: 'smooth' });
          history.replaceState(null, '', window.location.pathname);

          // scroll 完成後 flash，再展開
          const flashColor = color || '#00FF80';
          setTimeout(() => {
            target.style.transition = 'background 0.3s';
            target.style.background = flashColor;
            setTimeout(() => {
              target.style.background = '';
              const header = target.querySelector('.course-header');
              if (header && !header.classList.contains('active')) {
                header.style.background = flashColor;
                header.click();
              }
            }, 600);
          }, 600);
        }, 1200);
      }
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
