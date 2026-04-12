/**
 * Works Section Switch
 * 控制 works.html 頁面的 BFA / MDES 切換邏輯
 */

import { loadBFAWorks, loadMDESWorks } from './bfa-works-data-loader.js';
import { initWorksFilter } from '../filters/works-filter.js';
import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';

export function initWorksSectionSwitch() {
  const sectionBtns = document.querySelectorAll('.works-section-btn');
  if (!sectionBtns.length) return;

  const sectionEl = document.getElementById('works-section');

  switchToSection('bfa', sectionBtns, false);

  sectionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToSection(btn.dataset.section, sectionBtns, true);
    });
  });

  async function switchToSection(target, btns, shouldScroll) {
    setActiveNavBtn(btns, target, 'data-section');
    showPanel('.works-section-panel', `panel-${target}`);

    // 每次切換都重新載入（兩個 section 共用同一批 containers，無法 cache）
    if (target === 'bfa') {
      await loadBFAWorks();
      initWorksFilter();
    } else if (target === 'mdes') {
      await loadMDESWorks();
    }

    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

    if (shouldScroll && sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
