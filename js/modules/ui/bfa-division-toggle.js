// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
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

import { registerPageExit } from './page-exit.js';

export function initBFADivisionToggle() {
  const classInfoPanels  = document.querySelectorAll('.class-info-panel');
  const classWorksPanels = document.querySelectorAll('.class-works-panel');

  if (classInfoPanels.length === 0) return;

  // Mobile elements：水平 scroll 分組導覽 pill（取代舊 prev/next chevron）
  const mobileDivisionBtns = document.querySelectorAll('.mobile-division-btn');

  // Desktop + Mobile 分組按鈕共用同一套旋轉/上色/active/hover/click 邏輯（#1 跟桌面一致）。
  // 差別只在「上色/旋轉的目標元素」：桌面 .class-division-btn 直接畫在 btn；手機 pill 畫在內層 .anchor-nav-inner。
  // → setActive/initRotations/hover 一律取 paintTarget = btn.querySelector('.anchor-nav-inner') || btn。
  const divisionBtns = document.querySelectorAll('.class-division-btn, .mobile-division-btn');
  const paintTargetOf = (btn) => btn.querySelector('.anchor-nav-inner') || btn;
  const groupLabels   = document.querySelectorAll('.class-group-label');

  // Division list（手機版輪播用）：優先讀 about-data-loader 注入的 window.SCCD_aboutClass
  // （單一資料來源，跟桌面按鈕同步），抓不到才用內建 fallback。
  const divisions = (Array.isArray(window.SCCD_aboutClass) && window.SCCD_aboutClass.length)
    ? window.SCCD_aboutClass.map(d => ({ id: d.divisionKey, titleEn: d.nameEn, titleZh: d.nameZh }))
    : [
        { id: 'animation',      titleEn: 'Animation & Moving Image', titleZh: '動畫影像設計組' },
        { id: 'creative-media', titleEn: 'Creative Media Design',    titleZh: '創意媒體設計組' },
        { id: 'mdes',           titleEn: 'MDES',                     titleZh: '碩士班' }
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

  // 讀取「當前 context 對應封鎖綫」的顏色（hex），active tab 取色時排除避免撞色：
  // works context → 讀 works(作品) strip；否則（info/class）→ 讀 class(學制) strip。
  // 同一排 sticky btn 同時服務 Programs 與 Works 兩區，各自的封鎖綫要分別避開（user 2026-06-03 works 也要避免）。
  // 讀 dataset.accentHex 不讀 style.background：瀏覽器把 inline 顏色序列化成 rgb(...) 回吐，
  // 跟 ACCENT_COLORS hex 比永遠不相等 → exclude 默默失效。寫色那端（section-banner-reveal
  // replay）會同步把原始 hex 存進 dataset。
  function getCurrentStripColor() {
    const anchor = (window.SCCD_classContext || 'info') === 'works' ? 'works' : 'class';
    const el = /** @type {HTMLElement | null} */ (document.querySelector(`.section-title-strip[data-anchor="${anchor}"] [data-section-title]`));
    if (!el) return null;
    const c = (el.dataset.accentHex || '').trim().toLowerCase();
    return c || null;
  }

  function randomColor(exclude) {
    const pool = exclude
      ? ACCENT_COLORS.filter(c => c.toLowerCase() !== exclude.toLowerCase())
      : ACCENT_COLORS;
    const list = pool.length ? pool : ACCENT_COLORS;
    return list[Math.floor(Math.random() * list.length)];
  }
  function randomRotation() {
    let r = 0;
    while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 6 - 3).toFixed(2));
    return r;
  }

  // ─── 初始化每個 btn/label 的固定角度 ─────────────────────────

  function initRotations() {
    divisionBtns.forEach(btn => {
      const target = paintTargetOf(btn);
      // BFA btn 在 class 模式預設 0°，旋轉只在 works 模式啟動後由 setActive 設定
      const rot = btn.getAttribute('data-division') === 'bfa' ? 0 : randomRotation();
      target._baseRot = rot;
      target.style.transform = `rotate(${rot}deg)`;
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
      const target = paintTargetOf(btn);
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;

      if (btn.getAttribute('data-division') === divisionId) {
        target._baseRot = rot;
        btn.classList.add('active');
        target.style.background = color;
        target.dataset.accentHex = color;  // 原始 hex，給 anchor-nav exclude 比對（style.background 讀回是 rgb）
        target.style.color = '#000000';
        target.style.transform = `rotate(${rot}deg)`;
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
        target.style.background = BTN_DEFAULT_BG;
        delete target.dataset.accentHex;
        target.style.color = BTN_DEFAULT_TEXT;
        target.style.transform = `rotate(${target._baseRot}deg)`;
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
    const target = paintTargetOf(btn);
    btn.addEventListener('mouseenter', () => {
      if (btn.classList.contains('active')) return;
      const color = randomColor(getCurrentStripColor());
      const rot   = randomRotation();
      const label = btn.previousElementSibling?.classList.contains('class-group-label')
        ? btn.previousElementSibling : null;
      target.style.background = color;
      target.style.color = '#000000';
      target.style.transform = `rotate(${rot}deg)`;
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
      target.style.background = BTN_DEFAULT_BG;
      target.style.color = BTN_DEFAULT_TEXT;
      target.style.transform = `rotate(${target._baseRot}deg)`;
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
      const color = this._pendingColor || randomColor(getCurrentStripColor());
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

  // 手機 pill 的點擊/hover/active/旋轉/上色已由上方 divisionBtns 共用迴圈處理（含 .mobile-division-btn），
  // 不再需要獨立 handler——跟桌面同一套邏輯（#1）。

  // 手機 works context + sticky release（桌面靠 class-buttons-sticky.js，手機直接 return → 這裡補手機版，比照桌面）。
  if (window.innerWidth < 768 && typeof ScrollTrigger !== 'undefined') {
    const infoArea = document.getElementById('class-info-area');
    const mobileNav = document.getElementById('mobile-division-nav');
    const navWrap = mobileNav?.parentElement;
    let hasEnteredWorksMobile = false;

    // ① works context：捲到圖文底部 → ctx='works' + 展開 Design Fundamental pill；首次進 works 自動 active 它（#2，比照桌面）。
    //    捲回 → ctx='info' + 收起；若 active 是 bfa（works-only 無圖文）切回 animation。
    if (infoArea && mobileNav) {
      ScrollTrigger.create({
        trigger: infoArea,
        start: 'bottom 60%',
        onEnter: () => {
          window.SCCD_classContext = 'works';
          mobileNav.classList.add('is-works-context');
          if (!hasEnteredWorksMobile) {
            hasEnteredWorksMobile = true;
            if (typeof window.SCCD_setDivisionActive === 'function') {
              window.SCCD_setDivisionActive('bfa', false);  // 首次進 works → Design Fundamental
            }
          }
        },
        onLeaveBack: () => {
          window.SCCD_classContext = 'info';
          mobileNav.classList.remove('is-works-context');
          const active = document.querySelector('.mobile-division-btn.active');
          if (active?.getAttribute('data-division') === 'bfa') {
            setActive('animation', randomColor(getCurrentStripColor()), randomRotation());
            showContent('animation');
          }
        },
      });
    }

    // ② sticky release（#3）：works 說明文字頂（panels content top，扣掉 pt-3xl）到達 nav 底部「再加一個
    //    nav padding-bottom」就開始放開 → 停住時 pill 與文字的視覺 gap = py-sm 內距 ×2（user 2026-06-11 要現有 gap 的 2 倍）。
    //    tab 用 translateY 跟著內容 1:1 往上捲走，不會蓋住文字；捲動量 = stickyTop + nav 高度 → 一路移出 viewport 上緣。
    const worksPanels = document.getElementById('class-works-panels');
    if (worksPanels && navWrap && typeof gsap !== 'undefined') {
      const stickyTop = parseFloat(getComputedStyle(navWrap).top) || 128;
      gsap.timeline({
        scrollTrigger: {
          trigger: worksPanels,
          start: () => {
            const padTop = parseFloat(getComputedStyle(worksPanels).paddingTop) || 0;
            const gapExtra = parseFloat(getComputedStyle(mobileNav).paddingBottom) || 16;
            return `top+=${padTop} ${stickyTop + navWrap.offsetHeight + gapExtra}px`;
          },
          end: () => `+=${stickyTop + navWrap.offsetHeight}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
        .to(navWrap, { y: () => -(stickyTop + navWrap.offsetHeight), ease: 'none' }, 0);
    }
  }

  // ─── 暴露給其他模組的 helper ─────────────────────────────────
  // class-buttons-sticky.js 在離開 works context 時若 active=bfa 會呼叫此 helper 切回 animation
  // 第二參數 animate=false 時：works ctx 也用 instant toggle，避免使用者第一次進 works
  // 看到「animation → bfa」的切換動畫（應直接呈現 bfa）。
  window.SCCD_setDivisionActive = function (divisionId, animate = true) {
    const color = randomColor(getCurrentStripColor());
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

  // class-buttons-sticky.js 在「每次」滑進 works context 時呼叫：保留當前 active division，
  // 只換色（不動旋轉、不切換內容）。新色避開當前 context 封鎖綫（user 2026-06-03）。
  // dataset.accentHex 同步寫，維持與封鎖綫的雙向 exclude（見 getActiveDivisionColor）。
  window.SCCD_recolorActiveDivision = function () {
    const activeBtn = /** @type {HTMLElement | null} */ (document.querySelector('.class-division-btn.active'));
    if (!activeBtn) return;
    const color = randomColor(getCurrentStripColor());
    activeBtn.style.background = color;
    activeBtn.dataset.accentHex = color;
    const label = activeBtn.previousElementSibling?.classList.contains('class-group-label')
      ? /** @type {HTMLElement} */ (activeBtn.previousElementSibling) : null;
    if (label) label.style.background = color;
  };

  // ─── Initial State ───────────────────────────────────────────

  requestAnimationFrame(() => {
    initRotations();
    // setActive 一次同步桌面 + 手機 pill（divisionBtns 已含 .mobile-division-btn）
    setActive('animation', randomColor(getCurrentStripColor()), randomRotation());
    showContent('animation', false);
  });

  // 離頁退場：works 區 active panel 的說明文字（含 playlist）clip-path 右→左收 + 影片往左滑出。
  // 沿用本模組 works 切換的同一組常數/方向（手感一致）。只在桌面、works layout 已 init、且區塊在視窗內才跑。
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || window.innerWidth < 768 || !worksLayoutInited) { resolve(); return; }
    const container = document.getElementById('class-works-panels');
    if (!container) { resolve(); return; }
    const r = container.getBoundingClientRect();
    if (!(r.width > 0 && r.bottom > 0 && r.top < window.innerHeight)) { resolve(); return; }
    const activePanel = Array.from(classWorksPanels).find(p => p.style.zIndex === '1');
    if (!activePanel) { resolve(); return; }
    const text  = activePanel.querySelector('[data-works-hl]');
    const video = activePanel.querySelector('iframe');
    const tweens = [];
    if (text)  tweens.push(gsap.to(text,  { clipPath: WORKS_HIDE_CLIP_LEAVE, duration: WORKS_ANIM_DUR, ease: WORKS_ANIM_EASE, overwrite: true }));
    if (video) tweens.push(gsap.to(video, { xPercent: -100, duration: WORKS_ANIM_DUR, ease: WORKS_VIDEO_EASE, overwrite: true }));
    if (!tweens.length) { resolve(); return; }
    let done = 0;
    tweens.forEach(t => t.eventCallback('onComplete', () => { if (++done >= tweens.length) resolve(); }));
  }));
}
