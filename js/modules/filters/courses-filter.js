/**
 * Courses Filter Module
 * 課程篩選功能（必修 / 選修）
 * 支援新版 courses.html（傳入 program 限制 scope）和舊版 bfa/mdes-courses.html
 */

import { animateCards } from '../ui/scroll-animate.js';
import { getCurrentProgramColor } from '../pages/courses-section-switch.js';


export function initCoursesFilter(program) {
  // filter bar 已移出 panel，從 panel 的父層（flex-1）找 btn；year group 仍在 panel 內
  const panel = program ? document.getElementById(`panel-${program}`) : document;
  const filterScope = (program && panel) ? panel.parentElement : document;

  if (!panel) return;

  const coursesFilterButtons = filterScope.querySelectorAll('.courses-filter-btn');

  if (coursesFilterButtons.length === 0) return;

  // 初始化 active btn 的 color/rotation
  const activeBtn = filterScope.querySelector('.courses-filter-btn.active');
  if (activeBtn) {
    const activeInner = activeBtn.querySelector('.anchor-nav-inner');
    if (activeInner) { activeInner.style.background = getCurrentProgramColor(); activeInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }
  }

  // 避免重複綁定（綁在 filterScope 上，只綁一次）
  if (filterScope.dataset.filterBound) return;
  filterScope.dataset.filterBound = '1';

  coursesFilterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      // 更新 active 狀態與 color/rotation
      const color = getCurrentProgramColor();
      const rot = SCCDHelpers.getRandomRotation();
      coursesFilterButtons.forEach(b => {
        b.classList.remove('active');
        const inner = b.querySelector('.anchor-nav-inner');
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      this.classList.add('active');
      const activeInner = this.querySelector('.anchor-nav-inner');
      if (activeInner) { activeInner.style.background = color; activeInner.style.transform = `rotate(${rot}deg)`; }

      const filterValue = this.getAttribute('data-filter');

      // 動態抓當前顯示中的 panel 的 year groups
      const activePanel = filterScope.querySelector('.courses-panel:not(.hidden)');
      if (!activePanel) return;
      activePanel.querySelectorAll('.courses-year-group').forEach(group => {
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
