/**
 * BFA Division Toggle Module
 * Class 分組切換功能
 *
 * 桌面版結構：
 * [學士班 BFA (active)] [動畫組 (active)] [創媒組] [碩士班 MDES]
 *
 * 點擊學士班：子按鈕展開，動畫組預設 active
 * 點擊碩士班：子按鈕收起，碩士班 active，學士班 inactive
 * 點擊動畫組/創媒組：切換子按鈕 active，學士班維持 active
 */

export function initBFADivisionToggle() {
  const classDivisionContents = document.querySelectorAll('.class-division-content');

  // Mobile elements
  const mobilePrevBtn = document.getElementById('mobile-division-prev');
  const mobileNextBtn = document.getElementById('mobile-division-next');
  const mobileTitle = document.getElementById('mobile-division-title');

  if (classDivisionContents.length === 0) return;

  // Desktop elements
  const bfaParentBtn = document.getElementById('bfa-parent-btn');
  const mdesParentBtn = document.getElementById('mdes-parent-btn');
  const bfaSubBtns = document.getElementById('bfa-sub-btns');
  const subDivisionBtns = document.querySelectorAll('.class-division-btn');

  // Mobile divisions (for prev/next navigation)
  const divisions = [
    { id: 'animation', titleEn: 'Division of Animation & Moving Image', titleZh: '動畫影像設計組' },
    { id: 'creative-media', titleEn: 'Division of Creative Media Design', titleZh: '創意媒體設計組' },
    { id: 'mdes', titleEn: 'MDES Class', titleZh: '碩士班' }
  ];
  let currentIndex = 0;

  // ─── Helpers ───────────────────────────────────────────────

  function showContent(divisionId) {
    classDivisionContents.forEach(el => {
      if (el.getAttribute('data-division') === divisionId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  function setSubBtnActive(divisionId) {
    subDivisionBtns.forEach(btn => {
      if (btn.getAttribute('data-division') === divisionId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ─── Desktop: sync BFA btn width to MDES btn width ─────────

  function syncBFAWidth() {
    if (!bfaParentBtn || !mdesParentBtn) return;
    const mdesWidth = mdesParentBtn.getBoundingClientRect().width;
    if (mdesWidth > 0) {
      bfaParentBtn.style.width = mdesWidth + 'px';
    }
  }

  // ─── Desktop: measure actual sub-btns scrollWidth ───────────

  function getSubBtnsFullWidth() {
    // Temporarily make visible (off-screen) to measure
    bfaSubBtns.style.maxWidth = '9999px';
    bfaSubBtns.style.opacity = '0';
    bfaSubBtns.style.pointerEvents = 'none';
    const fullWidth = bfaSubBtns.scrollWidth;
    // Restore to current state immediately (openBFA will set final values)
    bfaSubBtns.style.maxWidth = '0px';
    return fullWidth;
  }

  // ─── Gap value (1.5rem = 24px) ───────────────────────────────
  const GAP = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing-md')) * 16 || 24;

  // ─── Desktop: show BFA sub-buttons ─────────────────────────

  function openBFA(divisionId = 'animation') {
    syncBFAWidth();

    // Add gap between BFA btn and sub-btns, and between sub-btns and MDES btn
    bfaSubBtns.style.marginLeft = GAP + 'px';
    bfaSubBtns.style.marginRight = GAP + 'px';

    // Expand to actual content width
    const fullWidth = getSubBtnsFullWidth();
    bfaSubBtns.style.maxWidth = fullWidth + 'px';
    bfaSubBtns.style.opacity = '1';
    bfaSubBtns.style.pointerEvents = 'auto';

    // Parent buttons active state
    bfaParentBtn.classList.add('active');
    mdesParentBtn.classList.remove('active');

    // Sub button active state
    setSubBtnActive(divisionId);

    // Show content
    showContent(divisionId);
  }

  function openMDES() {
    // Remove gap margins and collapse sub-btns
    bfaSubBtns.style.maxWidth = '0px';
    bfaSubBtns.style.opacity = '0';
    bfaSubBtns.style.pointerEvents = 'none';
    bfaSubBtns.style.marginLeft = '0px';
    bfaSubBtns.style.marginRight = GAP + 'px';

    // Parent buttons active state
    mdesParentBtn.classList.add('active');
    bfaParentBtn.classList.remove('active');

    // Clear sub button active states
    subDivisionBtns.forEach(btn => btn.classList.remove('active'));

    // Show content
    showContent('mdes');
  }

  // ─── Desktop Event Listeners ────────────────────────────────

  if (bfaParentBtn) {
    bfaParentBtn.addEventListener('click', () => {
      openBFA('animation');
      currentIndex = 0;
    });
  }

  if (mdesParentBtn) {
    mdesParentBtn.addEventListener('click', () => {
      openMDES();
      currentIndex = 2;
    });
  }

  subDivisionBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      const id = this.getAttribute('data-division');
      setSubBtnActive(id);
      showContent(id);
      currentIndex = divisions.findIndex(d => d.id === id);
    });
  });

  // ─── Mobile: update title display ───────────────────────────

  function updateMobileDisplay(index) {
    const division = divisions[index];
    if (mobileTitle) {
      mobileTitle.innerHTML = `
        <div class="text-h5 font-bold leading-tight">${division.titleEn}</div>
        <div class="text-h5 font-bold mt-1">${division.titleZh}</div>
      `;
    }
    showContent(division.id);
  }

  if (mobilePrevBtn && mobileNextBtn) {
    mobilePrevBtn.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + divisions.length) % divisions.length;
      updateMobileDisplay(currentIndex);
    });

    mobileNextBtn.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % divisions.length;
      updateMobileDisplay(currentIndex);
    });
  }

  // ─── Initial State ───────────────────────────────────────────
  // 預設：BFA active，動畫組 active，子按鈕展開
  // 用 rAF 確保 DOM 完全渲染後再量測 MDES btn 寬度
  requestAnimationFrame(() => {
    openBFA('animation');
  });
  updateMobileDisplay(0);
}
