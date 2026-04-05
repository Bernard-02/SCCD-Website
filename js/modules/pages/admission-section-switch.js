/**
 * Admission Section Switch
 * admission.html 左側 section 切換邏輯
 */

export function initAdmissionSectionSwitch() {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (!btns.length) return;

  const loaded = {};

  function switchSection(section) {
    btns.forEach(b => {
      b.classList.remove('active');
      const inner = b.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = ''; inner.style.transform = ''; }
    });

    const activeBtn = [...btns].find(b => b.dataset.section === section);
    if (activeBtn) {
      activeBtn.classList.add('active');
      const inner = activeBtn.querySelector('.anchor-nav-inner');
      if (inner) {
        inner.style.background = SCCDHelpers.getRandomAccentColor();
        inner.style.transform  = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
      }
    }

    document.querySelectorAll('.activities-panel').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(`panel-${section}`);
    if (target) target.classList.remove('hidden');

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
  }

  btns.forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section)));
  switchSection('news');
}
