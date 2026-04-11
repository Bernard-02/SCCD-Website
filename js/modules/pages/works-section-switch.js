/**
 * Works Section Switch
 * 控制 works.html 頁面的 BFA / MDES 切換邏輯
 * 仿照 courses-section-switch.js 架構
 */

import { loadBFAWorks, loadMDESWorks } from './bfa-works-data-loader.js';
import { initWorksFilter } from '../filters/works-filter.js';

export function initWorksSectionSwitch() {
  const sectionBtns = document.querySelectorAll('.works-section-btn');
  if (!sectionBtns.length) return;

  const sectionEl = document.getElementById('works-section');

  // 初始載入 BFA
  switchToSection('bfa', sectionBtns, false);

  sectionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.section;
      switchToSection(target, sectionBtns, true);
    });
  });

  async function switchToSection(target, btns, shouldScroll) {
    // 更新按鈕 active 狀態、隨機顏色 + 旋轉
    const color = SCCDHelpers.getRandomAccentColor();
    const rot = SCCDHelpers.getRandomRotation();

    btns.forEach(b => {
      b.classList.remove('active');
      const inner = b.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = ''; inner.style.transform = ''; }
    });

    // 同步所有同 section 的按鈕（桌面版 + 手機版各一組）
    [...btns].filter(b => b.dataset.section === target).forEach(b => {
      b.classList.add('active');
      const inner = b.querySelector('.anchor-nav-inner');
      if (inner) { inner.style.background = color; inner.style.transform = `rotate(${rot}deg)`; }
    });

    // 切換 panel 顯示
    document.querySelectorAll('.works-section-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== `panel-${target}`);
    });

    // 每次切換都重新載入（兩個 section 共用同一批 containers，無法 cache）
    if (target === 'bfa') {
      await loadBFAWorks();
      initWorksFilter();
    } else if (target === 'mdes') {
      await loadMDESWorks();
    }

    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

    // 捲到 works section 頂部
    if (shouldScroll && sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
