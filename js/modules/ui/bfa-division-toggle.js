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

  // 圖片 + text highlight 的進/退場動畫（clip-path）由 class-images-slideshow.js 統一處理，
  // 這裡不再播 text 的 y/opacity 進場動畫。

  // BFA 在 class 模式不存在 info panel，showContent 時 fallback 到 animation
  function resolveInfoPanelId(divisionId) {
    return divisionId === 'bfa' ? 'animation' : divisionId;
  }

  async function showContent(divisionId, animate = true) {
    const infoId = resolveInfoPanelId(divisionId);

    // Info panel 的 display 切換 + 圖片 clip-path 進/退場由 class-images-slideshow.js 控制。
    // Fallback（slideshow 還沒 init 完）：直接切 hidden，不做動畫。
    const slideshow = window.SCCD_classSlideshow;
    if (slideshow && typeof slideshow.switchTo === 'function') {
      await slideshow.switchTo(infoId, animate);
    } else {
      classInfoPanels.forEach(el => {
        el.classList.toggle('hidden', el.getAttribute('data-division') !== infoId);
      });
    }

    // Works panel 獨立切換（不受 slideshow 影響）— info ctx 不可見，無動畫直接切
    instantToggleWorks(divisionId);
  }

  // ─── Works 切換動畫（clip-path 文字 + slide-up 影片） ──────
  // 概念：所有 panels 用 display:grid 堆疊在同一格（垂直排列概念），
  //        active 的 iframe yPercent:0 顯示，其他 yPercent:100 在下方等待。
  // 切換：active 影片 yPercent:0→-100（往上滑出），new 影片 yPercent:100→0（從下滑入）。
  // 文字 clip-path：仿 class-images-slideshow（hide 固定右→左、show 從隨機 4 方向 reveal）。
  // .aspect-video 容器要 overflow-hidden（已加）+ 移除 bg-black，讓上下層影片在交錯時都能透出。
  const WORKS_ANIM_DUR = 0.5;
  const WORKS_ANIM_EASE = 'cubic-bezier(0.25, 0, 0, 1)'; // 文字 clip-path（同 class）
  const WORKS_VIDEO_EASE = 'power3.inOut'; // 影片 slide：慢→快→慢，避免匀速感
  const WORKS_HIDE_CLIP_LEAVE = 'inset(0% 100% 0% 0%)'; // 退場固定：右→左
  const WORKS_HIDE_CLIPS = [
    'inset(0% 100% 0% 0%)',
    'inset(0% 0% 0% 100%)',
    'inset(100% 0% 0% 0%)',
    'inset(0% 0% 100% 0%)',
  ];
  const WORKS_SHOW_CLIP = 'inset(0% 0% 0% 0%)';
  function worksRandomHideClip() { return WORKS_HIDE_CLIPS[Math.floor(Math.random() * WORKS_HIDE_CLIPS.length)]; }

  // 路由：MDES 預設顯示 animation 組的 works playlist
  function resolveWorksPanelId(divisionId) {
    return divisionId === 'mdes' ? 'animation' : divisionId;
  }

  // 隨機 4 方向 cross slide 設定
  // - newStart：new video 起始位置（從哪個方向滑入）
  // - oldEnd：old video 終點位置（往哪個方向滑出）
  // 兩者方向相同（同時往同一方向移動 = cross slide）
  const WORKS_VIDEO_DIRS = [
    { newStart: { yPercent: 100,  xPercent: 0   }, oldEnd: { yPercent: -100, xPercent: 0   } }, // 從下往上
    { newStart: { yPercent: -100, xPercent: 0   }, oldEnd: { yPercent: 100,  xPercent: 0   } }, // 從上往下
    { newStart: { yPercent: 0,    xPercent: 100 }, oldEnd: { yPercent: 0,    xPercent: -100 } }, // 從右往左
    { newStart: { yPercent: 0,    xPercent: -100 }, oldEnd: { yPercent: 0,   xPercent: 100  } }, // 從左往右
  ];
  function pickWorksVideoDir() {
    return WORKS_VIDEO_DIRS[Math.floor(Math.random() * WORKS_VIDEO_DIRS.length)];
  }
  let isWorksAnimating = false;
  let worksLayoutInited = false;

  function initWorksLayoutOnce() {
    if (worksLayoutInited) return;
    worksLayoutInited = true;
    const container = document.getElementById('class-works-panels');
    if (!container) return;
    // grid stack：所有 panels 共用同一 cell
    container.style.display = 'grid';
    container.style.gridTemplateAreas = '"stack"';
    container.style.gridTemplateColumns = '100%';
    classWorksPanels.forEach(panel => {
      panel.style.gridArea = 'stack';
      panel.classList.remove('hidden'); // 改用 transform/clip-path 控制可見性
    });
  }

  // 設置 panel 為 active（顯示）或 inactive（隱藏在下方等待）；無動畫
  function setWorksPanelState(panel, active) {
    const text = panel.querySelector('[data-works-hl]');
    const video = panel.querySelector('iframe');
    if (active) {
      panel.style.pointerEvents = '';
      panel.style.zIndex = '1';
      if (text && typeof gsap !== 'undefined') gsap.set(text, { clipPath: WORKS_SHOW_CLIP });
      if (video && typeof gsap !== 'undefined') gsap.set(video, { yPercent: 0 });
    } else {
      panel.style.pointerEvents = 'none';
      panel.style.zIndex = '0';
      if (text && typeof gsap !== 'undefined') gsap.set(text, { clipPath: WORKS_HIDE_CLIP_LEAVE });
      if (video && typeof gsap !== 'undefined') gsap.set(video, { yPercent: 100 });
    }
  }

  // 即時切換（用於初始化 / info ctx 不可見時）
  function instantToggleWorks(divisionId) {
    initWorksLayoutOnce();
    const targetId = resolveWorksPanelId(divisionId);
    classWorksPanels.forEach(p => {
      setWorksPanelState(p, p.getAttribute('data-division') === targetId);
    });
  }

  // 只切換 works panel（不動圖文）。動畫版：文字 clip-path + 影片 yPercent slide
  function switchWorksOnly(divisionId) {
    initWorksLayoutOnce();
    if (typeof gsap === 'undefined') {
      instantToggleWorks(divisionId);
      return;
    }

    // 動畫進行中：直接忽略（不切、不重置），由 click handler 在外層也 guard 一次
    if (isWorksAnimating) return;

    const targetId = resolveWorksPanelId(divisionId);
    const newPanel = Array.from(classWorksPanels).find(
      p => p.getAttribute('data-division') === targetId
    );
    if (!newPanel) return;
    // 用 z-index === '1' 標記目前 active panel
    const oldPanel = Array.from(classWorksPanels).find(
      p => p.style.zIndex === '1' && p !== newPanel
    );

    if (!oldPanel || newPanel === oldPanel) {
      instantToggleWorks(divisionId);
      return;
    }

    isWorksAnimating = true;

    const oldText  = oldPanel.querySelector('[data-works-hl]');
    const newText  = newPanel.querySelector('[data-works-hl]');
    const oldVideo = oldPanel.querySelector('iframe');
    const newVideo = newPanel.querySelector('iframe');

    // 隨機挑一個方向：new 從該方向滑入，old 往同方向滑出
    const dir = pickWorksVideoDir();

    // new 從隨機方向起點準備；提到最上層接收 pointer
    if (newVideo) gsap.set(newVideo, dir.newStart);
    newPanel.style.pointerEvents = '';
    newPanel.style.zIndex = '2';
    oldPanel.style.zIndex = '1';
    oldPanel.style.pointerEvents = 'none';

    // 影片橫跨 Phase 1+2 全程（clip-path 開始時影片開始走，clip-path 結束時影片到位）
    const VIDEO_DUR = WORKS_ANIM_DUR * 2;

    // ── Phase 1（同時觸發）：舊文字 clip-path 退場 + 影片 cross slide 起跑 ──
    const phase1 = oldText
      ? gsap.to(oldText, { clipPath: WORKS_HIDE_CLIP_LEAVE, duration: WORKS_ANIM_DUR, ease: WORKS_ANIM_EASE })
      : null;

    if (oldVideo) gsap.to(oldVideo, {
      ...dir.oldEnd, duration: VIDEO_DUR, ease: WORKS_VIDEO_EASE,
      // 退場後重置回預設「下方等待位」，下次 setWorksPanelState 可正常切回
      onComplete: () => gsap.set(oldVideo, { yPercent: 100, xPercent: 0 })
    });

    // 收尾：normalise z-index，確保只有 newPanel 是 active（z-index 1），其他全 0
    const finalize = () => {
      classWorksPanels.forEach(p => {
        p.style.zIndex = (p === newPanel) ? '1' : '0';
      });
      isWorksAnimating = false;
    };

    if (newVideo) gsap.to(newVideo, {
      yPercent: 0, xPercent: 0, duration: VIDEO_DUR, ease: WORKS_VIDEO_EASE,
      onComplete: finalize
    });
    else gsap.delayedCall(VIDEO_DUR, finalize);

    // ── Phase 2（Phase 1 結束後）：新文字 clip-path reveal ──
    function startPhase2() {
      if (newText) {
        gsap.set(newText, { clipPath: worksRandomHideClip() });
        gsap.to(newText, { clipPath: WORKS_SHOW_CLIP, duration: WORKS_ANIM_DUR, ease: WORKS_ANIM_EASE });
      }
    }

    if (phase1) phase1.eventCallback('onComplete', startPhase2);
    else startPhase2();
  }

  // ─── Color + rotation ──────────────────────────────────────

  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
  // 預設 bg/color 用 CSS 變數，跟 mode 走（standard=黑底白字 / inverse=白底黑字）
  // active / hover 時改成 accent 隨機色 + 黑字（accent 永遠淺色，黑字才看得到）
  const BTN_DEFAULT_BG    = 'var(--theme-fg)';
  const BTN_DEFAULT_TEXT  = 'var(--theme-bg)';

  function randomColor()    { return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]; }
  function randomRotation() {
    let r = 0;
    while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 6 - 3).toFixed(2));
    return r;
  }

  // ─── 初始化每個 btn/label 的固定角度 ─────────────────────────

  function initRotations() {
    divisionBtns.forEach(btn => {
      // BFA btn 在 class 模式預設 0°，旋轉只在 works 模式啟動後由 setActive 設定
      const rot = btn.getAttribute('data-division') === 'bfa' ? 0 : randomRotation();
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
        btn.style.background = BTN_DEFAULT_BG;
        btn.style.color = BTN_DEFAULT_TEXT;
        btn.style.transform = `rotate(${btn._baseRot}deg)`;
        if (label) {
          label.style.background = BTN_DEFAULT_BG;
          label.style.color = BTN_DEFAULT_TEXT;
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
      btn.style.background = BTN_DEFAULT_BG;
      btn.style.color = BTN_DEFAULT_TEXT;
      btn.style.transform = `rotate(${btn._baseRot}deg)`;
      if (label) {
        label.style.background = BTN_DEFAULT_BG;
        label.style.color = BTN_DEFAULT_TEXT;
        label.style.transform = `rotate(${label._baseRot}deg)`;
        label._pendingRot = null;
      }
      btn._pendingColor = null;
      btn._pendingRot   = null;
    });

    btn.addEventListener('click', function () {
      // works 動畫進行中：直接忽略點擊（含 btn 顏色/旋轉變更），避免狀態錯亂
      if (isWorksAnimating) return;

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

  // ─── 暴露給其他模組的 helper ─────────────────────────────────
  // class-buttons-sticky.js 在離開 works context 時若 active=bfa 會呼叫此 helper 切回 animation
  // 第二參數 animate=false 時：works ctx 也用 instant toggle，避免使用者第一次進 works
  // 看到「animation → bfa」的切換動畫（應直接呈現 bfa）。
  window.SCCD_setDivisionActive = function (divisionId, animate = true) {
    const color = randomColor();
    const rot   = randomRotation();
    setActive(divisionId, color, rot);
    const ctx = window.SCCD_classContext || 'info';
    if (ctx === 'works') {
      if (animate) switchWorksOnly(divisionId);
      else instantToggleWorks(divisionId);
    } else {
      showContent(divisionId, false);
    }
    currentIndex = divisions.findIndex(d => d.id === divisionId);
  };

  // ─── Initial State ───────────────────────────────────────────

  requestAnimationFrame(() => {
    initRotations();
    setActive('animation', randomColor(), randomRotation());
    showContent('animation', false);
  });

  updateMobileDisplay(0);
}
