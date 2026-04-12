/**
 * Admission Section Switch
 * admission.html 左側 section 切換邏輯
 */

import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';

export function initAdmissionSectionSwitch() {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (!btns.length) return;

  const loaded = {};

  function switchSection(section, shouldScroll = false) {
    setActiveNavBtn(btns, section, 'data-section');
    showPanel('.activities-panel', `panel-${section}`);

    // Lazy load summer camp
    if (section === 'summer-camp' && !loaded['summer-camp']) {
      loaded['summer-camp'] = true;
      Promise.all([
        import('./activities-data-loader.js'),
        import('../accordions/list-accordion.js'),
      ]).then(([{ loadSummerCampInto }, { initListAccordion }]) => {
        loadSummerCampInto('summer-camp-list').then(playAnimation => {
          initListAccordion();
          if (playAnimation) playAnimation();
        });
      });
    }

    if (shouldScroll) {
      const sectionEl = document.getElementById('admission-content-section');
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
  }

  btns.forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section, true)));
  switchSection('news', false);
}
