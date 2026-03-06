/**
 * Works Section Switch
 * 控制 works.html 頁面的 BFA / MDES 切換邏輯
 * 仿照 courses-section-switch.js 架構與視覺風格
 */

export function initWorksSectionSwitch(loadBFA, loadMDES) {
  const sectionBtns = document.querySelectorAll('.works-section-btn');
  if (!sectionBtns.length) return;

  const heroContainer = document.getElementById('works-hero-container');
  const detailsContainer = document.getElementById('works-details-container');
  const sectionEl = document.getElementById('works-section');

  let currentSection = 'bfa';

  // 初始載入 BFA，設定初始按鈕顏色
  switchToSection('bfa', false);

  sectionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.section;
      if (target === currentSection) return;
      switchToSection(target, true);
    });
  });

  function switchToSection(target, shouldScroll) {
    currentSection = target;

    // 更新按鈕 active 狀態、隨機彩色 + 隨機旋轉
    const color = SCCDHelpers.getRandomAccentColor();
    const rot = SCCDHelpers.getRandomRotation();

    sectionBtns.forEach(b => {
      b.classList.remove('active');
      const inner = b.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = ''; inner.style.transform = ''; }
    });

    // 同步所有同 section 的按鈕（桌面版 + 手機版各一組）
    [...sectionBtns].filter(b => b.dataset.section === target).forEach(btn => {
      btn.classList.add('active');
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = color; inner.style.transform = `rotate(${rot}deg)`; }
    });

    // 切換面板顯示
    document.querySelectorAll('.works-section-panel').forEach(panel => {
      panel.classList.add('hidden');
    });
    const activePanel = document.getElementById(`panel-${target}`);
    if (activePanel) activePanel.classList.remove('hidden');

    // 清空 hero & details（shared containers）
    if (heroContainer) heroContainer.innerHTML = '';
    if (detailsContainer) detailsContainer.innerHTML = '';

    if (target === 'bfa') {
      // 重設 BFA filter tabs 到第一個
      const filterBtns = document.querySelectorAll('.works-filter-btn');
      filterBtns.forEach((fb, i) => {
        fb.classList.toggle('active', i === 0);
      });
      loadBFA().then(() => {
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      });
    } else if (target === 'mdes') {
      loadMDES().then(() => {
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      });
    }

    // 捲到 works section 頂部
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
