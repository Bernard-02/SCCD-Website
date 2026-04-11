/**
 * BFA Division Toggle Module
 * Class 分組切換功能
 *
 * 桌面版結構：
 *   [BFA label]  [BFA label]  [MDES btn]
 *   [Animation]  [Creative Media]
 *
 * 切換時同步更新：
 *   - .class-info-panel（圖文）
 *   - .class-works-panel（playlist）
 */

export function initBFADivisionToggle() {
  const classInfoPanels  = document.querySelectorAll('.class-info-panel');
  const classWorksPanels = document.querySelectorAll('.class-works-panel');

  if (classInfoPanels.length === 0) return;

  // Mobile elements
  const mobilePrevBtn = document.getElementById('mobile-division-prev');
  const mobileNextBtn = document.getElementById('mobile-division-next');
  const mobileTitle   = document.getElementById('mobile-division-title');

  // Desktop elements
  const divisionBtns = document.querySelectorAll('.class-division-btn');
  const groupLabels   = document.querySelectorAll('.class-group-label');

  // Division list（手機版輪播用）
  const divisions = [
    { id: 'animation',      titleEn: 'Animation & Moving Image', titleZh: '動畫影像設計組' },
    { id: 'creative-media', titleEn: 'Creative Media Design',    titleZh: '創意媒體設計組' },
    { id: 'mdes',           titleEn: 'MDES Class',               titleZh: '碩士班' }
  ];
  let currentIndex = 0;

  // ─── Helpers ───────────────────────────────────────────────

  function playAnimation(el) {
    if (typeof gsap === 'undefined') return;
    const imgs  = el.querySelectorAll('.division-images img');
    const texts = el.querySelectorAll('.division-text');

    gsap.from(imgs,  { y: 40, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
    gsap.from(texts, { y: 24, opacity: 0, duration: 0.6, stagger: 0.1,  ease: 'power3.out', clearProps: 'transform,opacity' });

    if (window.innerWidth >= 768) {
      imgs.forEach(img => {
        if (!img.dataset.hoverBound) {
          img.dataset.hoverBound = '1';
          img.addEventListener('mouseenter', () => { img.style.zIndex = '10'; });
          img.addEventListener('mouseleave', () => { img.style.zIndex = ''; });
        }
      });
    }
  }

  function showContent(divisionId, animate = true) {
    // 更新圖文 panel
    classInfoPanels.forEach(el => {
      if (el.getAttribute('data-division') === divisionId) {
        el.classList.remove('hidden');
        if (animate) playAnimation(el);
      } else {
        el.classList.add('hidden');
      }
    });
    // 同步更新 works panel（container 可見性由 class-buttons-sticky.js 控制）
    classWorksPanels.forEach(el => {
      el.classList.toggle('hidden', el.getAttribute('data-division') !== divisionId);
    });
  }

  // 只切換 works panel（不動圖文，避免 sticky 範圍 reflow / 進場動畫）
  function switchWorksOnly(divisionId) {
    classWorksPanels.forEach(el => {
      el.classList.toggle('hidden', el.getAttribute('data-division') !== divisionId);
    });
  }

  // ─── Color + rotation ──────────────────────────────────────

  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
  const BTN_DEFAULT   = '#000000';

  function randomColor()    { return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]; }
  function randomRotation() {
    let r = 0;
    while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 6 - 3).toFixed(2));
    return r;
  }

  // ─── 初始化每個 btn/label 的固定角度 ─────────────────────────

  function initRotations() {
    divisionBtns.forEach(btn => {
      const rot = randomRotation();
      btn._baseRot = rot;
      btn.style.transform = `rotate(${rot}deg)`;
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;
      if (label) {
        const labelRot = randomRotation();
        label._baseRot = labelRot;
        label.style.transform = `rotate(${labelRot}deg)`;
      }
    });
  }

  // ─── Set active btn ────────────────────────────────────────

  function setActive(divisionId, color, rot) {
    divisionBtns.forEach(btn => {
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;

      if (btn.getAttribute('data-division') === divisionId) {
        btn._baseRot = rot;
        btn.classList.add('active');
        btn.style.background = color;
        btn.style.color = '#000000';
        btn.style.transform = `rotate(${rot}deg)`;
        if (label) {
          const labelRot = label._pendingRot || randomRotation();
          label._baseRot = labelRot;
          label._pendingRot = null;
          label.style.background = color;
          label.style.color = '#000000';
          label.style.transform = `rotate(${labelRot}deg)`;
        }
        btn._activeColor = color;
      } else {
        btn.classList.remove('active');
        btn.style.background = BTN_DEFAULT;
        btn.style.color = '#FFFFFF';
        btn.style.transform = `rotate(${btn._baseRot}deg)`;
        if (label) {
          label.style.background = '#000000';
          label.style.color = '#FFFFFF';
          label.style.transform = `rotate(${label._baseRot}deg)`;
        }
        btn._activeColor = null;
      }
    });
  }

  // ─── Desktop: hover events ─────────────────────────────────

  divisionBtns.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      if (btn.classList.contains('active')) return;
      const color = randomColor();
      const rot   = randomRotation();
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;
      btn.style.background = color;
      btn.style.color = '#000000';
      btn.style.transform = `rotate(${rot}deg)`;
      if (label) {
        const labelRot = randomRotation();
        label.style.background = color;
        label.style.color = '#000000';
        label.style.transform = `rotate(${labelRot}deg)`;
        label._pendingRot = labelRot;
      }
      btn._pendingColor = color;
      btn._pendingRot   = rot;
    });

    btn.addEventListener('mouseleave', () => {
      if (btn.classList.contains('active')) return;
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;
      btn.style.background = BTN_DEFAULT;
      btn.style.color = '#FFFFFF';
      btn.style.transform = `rotate(${btn._baseRot}deg)`;
      if (label) {
        label.style.background = '#000000';
        label.style.color = '#FFFFFF';
        label.style.transform = `rotate(${label._baseRot}deg)`;
        label._pendingRot = null;
      }
      btn._pendingColor = null;
      btn._pendingRot   = null;
    });

    btn.addEventListener('click', function () {
      const id    = this.getAttribute('data-division');
      const color = this._pendingColor || randomColor();
      const rot   = this._pendingRot   || randomRotation();
      setActive(id, color, rot);

      // 依目前 scroll context 決定切換範圍：
      //   - 'works'：只切 works panel，圖文保持不動，避免 sticky 範圍 reflow + 進場動畫
      //   - 'info'（預設）：圖文 + works 一起切，並播放圖文進場動畫
      const ctx = window.SCCD_classContext || 'info';
      if (ctx === 'works') {
        switchWorksOnly(id);
      } else {
        showContent(id);
      }

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
    showContent(division.id, false);
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

  requestAnimationFrame(() => {
    initRotations();
    setActive('animation', randomColor(), randomRotation());
    showContent('animation', false);
  });

  updateMobileDisplay(0);
}
