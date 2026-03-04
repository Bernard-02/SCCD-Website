/**
 * Courses Filter Module
 * 課程篩選功能（必修 / 選修）
 * 支援新版 courses.html（傳入 program 限制 scope）和舊版 bfa/mdes-courses.html
 */

import { animateCards } from '../ui/scroll-animate.js';
import { getCurrentProgramColor } from '../pages/courses-section-switch.js';

function getRandomRotation() {
  let deg;
  do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
  return deg;
}

export function initCoursesFilter(program) {
  // filter bar 已移出 panel，從 panel 的父層（flex-1）找 btn；year group 仍在 panel 內
  const panel = program ? document.getElementById(`panel-${program}`) : document;
  const filterScope = (program && panel) ? panel.parentElement : document;

  if (!panel) return;

  const coursesFilterButtons = filterScope.querySelectorAll('.courses-filter-btn');
  const coursesYearGroups = panel.querySelectorAll('.courses-year-group');

  if (coursesFilterButtons.length === 0 || coursesYearGroups.length === 0) return;

  // 初始化 active btn 的 color/rotation
  const activeBtn = filterScope.querySelector('.courses-filter-btn.active');
  if (activeBtn) {
    const activeInner = activeBtn.querySelector('.anchor-nav-inner');
    if (activeInner) { activeInner.style.background = getCurrentProgramColor(); activeInner.style.transform = `rotate(${getRandomRotation()}deg)`; }
  }

  coursesFilterButtons.forEach(button => {
    // 避免重複綁定
    if (button.dataset.filterBound) return;
    button.dataset.filterBound = '1';

    button.addEventListener('click', function(e) {
      e.preventDefault();

      // 更新 active 狀態與 color/rotation
      const color = getCurrentProgramColor();
      const rot = getRandomRotation();
      coursesFilterButtons.forEach(b => {
        b.classList.remove('active');
        const inner = b.querySelector('.anchor-nav-inner');
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      this.classList.add('active');
      const activeInner = this.querySelector('.anchor-nav-inner');
      if (activeInner) { activeInner.style.background = color; activeInner.style.transform = `rotate(${rot}deg)`; }

      const filterValue = this.getAttribute('data-filter');

      coursesYearGroups.forEach(group => {
        const isActive = group.getAttribute('data-year') === filterValue;
        group.style.display = isActive ? 'block' : 'none';
        if (isActive) {
          const blocks = group.querySelectorAll('.flex-col > div');
          animateCards(blocks, false, { fadeIn: true });
        }
      });

      this.blur();
    });
  });
}
