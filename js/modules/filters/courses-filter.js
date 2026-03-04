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
  // 新版：限定在對應的 program panel 內操作，避免跨 panel 互相干擾
  const scope = program
    ? document.getElementById(`panel-${program}`)
    : document;

  if (!scope) return;

  const coursesFilterButtons = scope.querySelectorAll('.courses-filter-btn');
  const coursesYearGroups = scope.querySelectorAll('.courses-year-group');

  if (coursesFilterButtons.length === 0 || coursesYearGroups.length === 0) return;

  // 初始化 active btn 的 color/rotation
  const activeBtn = scope.querySelector('.courses-filter-btn.active');
  if (activeBtn) {
    activeBtn.style.color = getCurrentProgramColor();
    activeBtn.style.transform = `rotate(${getRandomRotation()}deg)`;
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
        b.style.color = '';
        b.style.transform = '';
      });
      this.classList.add('active');
      this.style.color = color;
      this.style.transform = `rotate(${rot}deg)`;

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
