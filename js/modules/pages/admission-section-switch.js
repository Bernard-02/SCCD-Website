/**
 * Admission Section Switch
 * admission.html 左側 section 切換邏輯：當前 panel 統一往下退場 → 切換 → 新 panel per-item 進場
 */

import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';
import {
  playAdmissionPanelExit,
  playAdmissionPanelReveal,
  setupAdmissionReveal,
} from './admission-data-loader.js';
import { resetListAccordionsInPanel } from '../accordions/list-accordion.js';

export function initAdmissionSectionSwitch() {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (!btns.length) return;

  const loaded = {};
  let switching = false;  // 防連點

  async function switchSection(section, shouldScroll = false, isInitial = false) {
    if (switching) return;
    const currentPanel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
    const targetId = `panel-${section}`;
    // 已 active 同 panel：跳過退場/進場動畫；如果是 click（shouldScroll）仍 scroll 對齊 anchor
    if (currentPanel && currentPanel.id === targetId && !isInitial) {
      if (shouldScroll) {
        const sectionEl = document.getElementById('admission-content-section');
        if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    switching = true;

    // 1. 退場（首次 init 跳過）
    if (!isInitial && currentPanel) {
      await playAdmissionPanelExit(currentPanel);
    }

    // 2. 切 active btn + show 新 panel
    setActiveNavBtn(btns, section, 'data-section');
    const newPanel = /** @type {HTMLElement | null} */ (showPanel('.activities-panel', targetId));
    // 收起 target panel 內遺留的 open accordion（avoid「切到別的 panel 再切回來時 accordion 仍打開」殘留體驗）
    if (newPanel) resetListAccordionsInPanel(newPanel);

    // 3. 立即 setup 已存在的 rows（描述塊等 HTML 寫死的元素）— 避免 lazy load 期間描述塊 flash 顯示
    //    （第一次切 summer-camp 時 list 還沒載入，但描述塊已在 panel HTML 內）
    //    初次 init（hide:false）只 wrap 不隱藏：描述塊 HTML 已可見，但需 clip-wrapper 讓首次 exit 能乾淨剪裁
    //    （無 wrapper 時 yPercent 0→100 會把描述塊推出自然 flow 看起來「掉出去」而非裁切）
    if (newPanel) setupAdmissionReveal(newPanel, { hide: !isInitial });

    // 4. Lazy load summer camp（首次切到時才載入；autoReveal:false 由本模組接管 reveal）
    if (section === 'summer-camp' && !loaded['summer-camp']) {
      loaded['summer-camp'] = true;
      const [{ loadSummerCampInto }, { initListAccordion }] = await Promise.all([
        import('./activities-data-loader.js'),
        import('../accordions/list-accordion.js'),
      ]);
      await loadSummerCampInto('summer-camp-list', { autoReveal: false });
      initListAccordion();
    }

    // 5. 進場：首次 init 用 ScrollTrigger（rows 在 viewport 外時等捲入再播），後續切換立即播放
    //    （lazy load 完成後新渲染的 list-items 已由 loadListInto 內部 setupClipReveal 處理，不需再 setup）
    if (newPanel) {
      playAdmissionPanelReveal(newPanel, { useScrollTrigger: isInitial });
    }

    if (shouldScroll) {
      const sectionEl = document.getElementById('admission-content-section');
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
    }

    switching = false;
  }

  btns.forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section, true)));
  switchSection('news', false, true);
}
