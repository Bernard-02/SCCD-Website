/**
 * Courses Section Switch Module
 * 處理 curriculum.html（route/file 原名 courses）的三組 program 切換（bfa-animation / bfa-cmd / mdes）
 *
 * 新版 layout：
 *   - 三個按鈕橫排於頂部，BFA 兩 btn 各自上方有 .courses-bfa-label「BFA Class 學士班」
 *     （仿 about.html class section 的 class-group-label 結構，每 BFA btn 各自一個 label）
 *   - 點 bfa-* btn → 該 btn 上方的 label 同步套 active 色 + 新隨機旋轉
 *   - 旋轉/位移/hover 比照 about/bfa-division-toggle.js：所有 btn-inner 與 label 都有
 *     _baseRot；hover 時隨機切換 rotation+accent，mouseleave 還原 _baseRot
 *   - 內容改 grid（學期×必修/選修×年級）+ 右下 sticky desc panel
 */

import { renderCoursesGrid, deselectActiveCard, resetCoursesMapState, selectCardBySlugInPanel, highlightCardBySlugInPanel } from './courses-map.js';
import { setActiveNavBtn } from '../ui/section-switch-helpers.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { waitForHeroAnimDone } from './hero-animation.js';
import { DUR, EASE } from '../ui/motion.js';

let currentProgramColor = '';
export function getCurrentProgramColor() { return currentProgramColor; }

// 等整個 panel 的卡片 clip-reveal 全跑完才 resolve：卡片進場時 gsap 每幀寫 inline clipPath，跑完 clearProps 清掉
// → inline clipPath 變空。reveal 是「一支 gsap.to(allCards) staggered」，最後一張清空 = 整片 reveal 完成。
// 給 deep-link 用：整片 grid ready 才 highlight + 開 slide-in，不在卡片 stagger 進場到一半就開、slide-in 蓋在半開 grid 上
// （user 2026-06-09；只等目標卡不夠——目標常是第一張、它先 reveal 但後面整排還在進場）。只看可見那份 grid（offsetParent≠null）。
// timeout 保險：reveal 萬一沒觸發（ScrollTrigger 沒 fire 等）也不卡死，到時直接 resolve 往下走。
function waitForGridRevealed(panel, timeout = 5000) {
  return new Promise(resolve => {
    if (!panel) { resolve(); return; }
    const pendingCount = () => [...panel.querySelectorAll('.courses-grid-card')]
      .filter(c => /** @type {HTMLElement} */ (c).offsetParent !== null && /** @type {HTMLElement} */ (c).style.clipPath).length;
    if (pendingCount() === 0) { resolve(); return; }
    let done = false, t = null;
    const finish = () => { if (done) return; done = true; obs.disconnect(); if (t) clearTimeout(t); resolve(); };
    const obs = new MutationObserver(() => { if (pendingCount() === 0) finish(); });
    obs.observe(panel, { attributes: true, attributeFilter: ['style'], subtree: true });
    t = setTimeout(finish, timeout);
  });
}

// courses content section 的 anchor 目標 = section 頂端對齊 viewport 頂端（section.top=0），**不扣 header 高度**。
// Why：courses.css 特地把 #courses-content-section padding-top 設成 200px（= sticky bar top:200px），
//   設計成「scroll 到 section.top=0 時 cover 剛好開始 sticky、第一行卡片完美對齊」（見 courses.css 該段註解）。
//   若像 activities/admission 那樣扣掉 header 高度，會少捲 ~header 高 → 卡片偏下、對齊點不夠
//   （user 2026-06-04 回報「往下的對齊點還不夠」）。section 的 200px 上 padding 已讓內容清開 fixed header，不需再扣。
/** @param {HTMLElement} el */
function sectionScrollTop(el) {
  return el.getBoundingClientRect().top + window.scrollY;
}

/**
 * @param {HTMLElement | null} el
 * @param {ScrollBehavior} [behavior]
 */
function scrollSectionIntoView(el, behavior = 'smooth') {
  if (!el) return;
  window.scrollTo({ top: sectionScrollTop(el), behavior });
}

// courses 專用旋轉幅度 ±2°（排除 ±0.5）— 比 SCCDHelpers.getRandomRotation(-4~6) 小，
// 配合寬 btn（如 "Animation & Moving Image" 兩行）與 BFA label 視覺較柔
function getRot() {
  let r = 0;
  while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 4 - 2).toFixed(2));
  return r;
}

// 替每個 .courses-bfa-label 與 inactive btn-inner 寫入 _baseRot 並套 transform，
// 同時清掉 inactive btn-inner 的殘留 inline bg/color（避免上次 active 期間設過 inline
// color: #000000，切換 active 後 .active 被移除但 inline color 還在 → 文字還是黑色）
// setActiveNavBtn 只清 bg 與 transform，不清 color，所以 color 要在這手動清
// 註：hover 已不再 inline 設 bg/color（user spec：hover 只變文字 opacity，由 CSS 處理），故只需處理 active 殘留
function applyBaseRotations() {
  document.querySelectorAll('.courses-bfa-label').forEach(label => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (label);
    if (el._baseRot == null) el._baseRot = getRot();
    el.style.transform = `rotate(${el._baseRot}deg)`;
  });
  document.querySelectorAll('.courses-program-btn:not(.active) .anchor-nav-inner').forEach(inner => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (inner);
    if (el._baseRot == null) el._baseRot = getRot();
    el.style.transform = `rotate(${el._baseRot}deg)`;
    el.style.background = '';
    el.style.color = '';
  });
}

// 替 active btn-inner 把當下 inline transform 取出記到 _baseRot，方便日後 mouseleave 還原
/** @param {HTMLElement|null} activeBtn */
function syncActiveBaseRot(activeBtn) {
  if (!activeBtn) return;
  activeBtn.querySelectorAll('.anchor-nav-inner').forEach(inner => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (inner);
    const m = el.style.transform.match(/rotate\(([-\d.]+)deg\)/);
    if (m) el._baseRot = parseFloat(m[1]);
  });
}

// hover handler：mouseenter 給 btn-inner 與同 group 的 label 一個臨時隨機 rotation + accent；
// mouseleave 還原到各自的 _baseRot 並清 inline bg/color
/** @param {HTMLElement} btn */
function bindHover(btn) {
  if (btn.dataset.hoverBound) return;
  btn.dataset.hoverBound = '1';

  const inner = /** @type {HTMLElement & { _baseRot?: number } | null} */ (btn.querySelector('.anchor-nav-inner'));
  const group = btn.closest('.courses-program-group');
  const label = /** @type {(HTMLElement & { _baseRot?: number }) | null} */ (group?.querySelector('.courses-bfa-label') || null);

  btn.addEventListener('mouseenter', () => {
    if (btn.classList.contains('active')) return;
    // hover 不換底色（user spec：bg 不變，僅文字 100%，由 CSS hover rule 控制；不再 JS inline 設 accent bg / color）
    // 仍保留 rotation 變化作為 hover 視覺回饋
    const rot = getRot();
    const labelRot = getRot();
    if (inner) inner.style.transform = `rotate(${rot}deg)`;
    if (label) label.style.transform = `rotate(${labelRot}deg)`;
    // _pendingRot / _pendingLabelRot 給 click 用：點下去保留剛剛 hover 看到的角度（仿 about/bfa-division-toggle.js）
    // _pendingColor 不再儲存（hover 無 color 預覽）→ click 時 getColor() 自動 roll 新色
    /** @type {any} */ (btn)._pendingRot = rot;
    /** @type {any} */ (btn)._pendingLabelRot = labelRot;
  });

  btn.addEventListener('mouseleave', () => {
    if (btn.classList.contains('active')) return;
    // hover 沒設 inline bg/color，mouseleave 只還原 rotation
    if (inner) inner.style.transform = `rotate(${inner._baseRot || 0}deg)`;
    if (label) label.style.transform = `rotate(${label._baseRot || 0}deg)`;
    /** @type {any} */ (btn)._pendingRot = null;
    /** @type {any} */ (btn)._pendingLabelRot = null;
  });
}

/**
 * @param {boolean} [fromUserNav] true=使用者點連結的 SPA 導航（首頁課程卡片）；
 *   false=初始載入 / refresh / 上一頁下一頁。只有 fromUserNav 才播 ?item= 的「捲到 section + 開 slide-in」
 *   導航動畫，refresh 視為全新頁面（只套 ?program= tab，不重播）。
 */
export function initCoursesSectionSwitch(fromUserNav = false) {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  // SPA 離開 courses 時 reset activeCard module-scope ref，避免下次回 courses 時 ref 指向已被
  // router.innerHTML swap 掉的 detached node（deselectActiveCard 對 dead element 操作雖無 crash 但邏輯混亂）
  registerPageCleanup(() => resetCoursesMapState());

  // hover 一次性綁定（每 btn 帶 dataset flag 避免重綁）
  programBtns.forEach(bindHover);

  // ?program= deep-link：只有從首頁 floating course card 點進來的 SPA 導航（fromUserNav）才套指定 program + 跑導航動畫。
  // refresh / 直接開 / 上一頁下一頁（fromUserNav=false）→ 清掉 query、回 default program（= 直接點 curriculum 的樣子，user 2026-06-04）。
  const params = new URLSearchParams(window.location.search);
  const hasQueryDeepLink = params.has('program');
  const DEFAULT_PROGRAM = 'bfa-animation';

  let initialProgram = DEFAULT_PROGRAM;
  let itemSlug = null;
  if (hasQueryDeepLink && fromUserNav) {
    const rawProgram = params.get('program');           // ?program= 兼容：bfa → bfa-animation
    initialProgram = (rawProgram === 'bfa') ? 'bfa-animation' : (rawProgram || DEFAULT_PROGRAM);
    itemSlug = params.get('item');
  } else if (hasQueryDeepLink) {
    history.replaceState(history.state, '', window.location.pathname);
  }

  // deep-link 自動導航時卡片/表頭進場「init 就直接播」不等 ScrollTrigger：
  // 自動捲動會在 hero 後立刻把 grid 帶進視窗，靠 trigger 的話 reveal 在捲動落地後才開始
  // → 使用者看到「捲過一片空白 → 卡片才突然出現」，慢機器上 trigger 沒 fire 更會讓
  // waitForGridRevealed 撐到 5s timeout、highlight 套在還 clip 隱藏的卡上看不到（user 2026-06-12）。
  // init 即播 = reveal 在 hero 動畫期間於畫面外完成，捲到時 grid 已就位 → highlight 立刻可見。
  const deepLinkAutoNav = hasQueryDeepLink && fromUserNav;

  const initSwitchPromise = switchToProgram(initialProgram, programBtns, false);

  // deep-link 導航動畫（只在使用者從首頁 floating course card 點進來的 SPA 導航才播）：
  //   ① 等 hero 進場動畫「實際播完」才往下捲 — 用 waitForHeroAnimDone()（在 hero timeline onComplete 時 resolve），
  //      所以往下滑的觸發時機 follow hero 動畫長度，不是寫死時間（user 2026-06-04）
  //   ② 平滑捲到「該課程卡片」本身（不是只捲 section 頂端）— 課程卡片可能在 grid 下方，只捲 section
  //      頂端的話卡片仍在 viewport 外、slider 就開了看不到卡片（user 2026-06-04）。捲到卡片進 viewport 才開。
  //   ③ 捲到位後再 delay OPEN_DELAY_MS 才開 slide-in（一到就開會感覺過早，留個緩衝；同 activities 的 600）
  // ⚠️ fromUserNav 守衛：refresh / 直接開連結 / 上一頁下一頁時 fromUserNav=false → 不重播這段
  //    （= user 要求「打開 slider 後 refresh 應該是全新頁面，不再走導航動畫」）；
  //    ?program= 對應 tab 仍由上面 initSwitchPromise 套好，只是不 auto-scroll 也不自動開 slide-in。
  if (hasQueryDeepLink && fromUserNav) {
    const OPEN_DELAY_MS = 600;   // 捲到卡片後、開 slide-in 前的緩衝（同 activities navigateToItem 的 600）
    // 同時等 grid render（卡片存在才能 selectCardBySlugInPanel）+ hero 動畫播完才往下捲
    Promise.all([initSwitchPromise, waitForHeroAnimDone()]).then(() => {
      if (!sectionEl) return;
      if (!itemSlug) { scrollSectionIntoView(sectionEl); return; }
      // 導航的卡片一律「對齊到第一排卡片所在的位置」（= section.top=0 時第一排的視窗高度），比固定 viewport 比例
      // 更一致可預期（user 2026-06-04）。做法：在「可見」grid（桌面/手機只一份顯示，挑 offsetParent 非 null）內
      // 量目標卡片與「最上排卡片」的垂直距離 delta，加到 section.top=0 → 目標卡片剛好落在第一排位置。
      // 捲動「結束」才排程開 slide-in：openCourseSlideIn 的 enterLightboxMode() 會凍結捲動，半途開會卡在中途。
      const panel = document.getElementById(`panel-${initialProgram}`);
      let top = sectionScrollTop(sectionEl);
      if (panel) {
        /** @type {HTMLElement|null} */ let targetCard = null;
        let firstRowTop = Infinity;
        panel.querySelectorAll('.courses-grid-card').forEach(c => {
          const el = /** @type {HTMLElement} */ (c);
          if (el.offsetParent === null) return; // 跳過隱藏的另一份 grid（桌面/手機）
          const rectTop = el.getBoundingClientRect().top;
          if (rectTop < firstRowTop) firstRowTop = rectTop;
          if (!targetCard && el.getAttribute('data-slug') === itemSlug) targetCard = el;
        });
        if (targetCard && firstRowTop !== Infinity) {
          // delta = 目標與第一排的垂直距離（scroll 無關）；加到 section.top=0 即把目標移到第一排視窗位置
          top = sectionScrollTop(sectionEl) + (targetCard.getBoundingClientRect().top - firstRowTop);
        }
      }
      // 等目標卡片「reveal 完成」(clip-path 動畫跑完、clearProps 清掉 inline clipPath) 才 highlight + 開 slide-in：
      // 否則卡片進場 stagger 還沒輪到目標就開＝slide-in 蓋在半開的 grid 上（user 2026-06-09 報「沒等卡片 render 好就開」）。
      // 順序：reveal 完 → highlight 卡片(套 accent 底色) → OPEN_DELAY 才開 slide-in（同 activities flash→delay→open 節奏）。
      const openCard = () => {
        waitForGridRevealed(panel).then(() => {
          highlightCardBySlugInPanel(initialProgram, itemSlug);
          setTimeout(() => selectCardBySlugInPanel(initialProgram, itemSlug), OPEN_DELAY_MS);
        });
      };
      if (typeof window.ScrollToPlugin !== 'undefined') {
        gsap.to(window, { scrollTo: { y: top, autoKill: false }, duration: DUR.medium, ease: EASE.move, onComplete: openCard });
      } else {
        window.scrollTo({ top, behavior: 'smooth' });
        setTimeout(openCard, 500);
      }
    });
  }

  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToProgram(btn.getAttribute('data-program'), programBtns, true);
    });
  });

  // inset 四值用 % 單位（GSAP tween inset() 四值單位需一致，否則直接跳終值不動畫）
  const CLIP_DIRS = [
    'inset(100% 0% 0% 0%)',  // 上 → 下
    'inset(0% 0% 100% 0%)',  // 下 → 上
    'inset(0% 100% 0% 0%)',  // 左 → 右
    'inset(0% 0% 0% 100%)',  // 右 → 左
  ];
  function pickClipDir() { return CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)]; }

  // 離頁退場（卡片 + nav + 表頭）統一在 nav block 之後的單一 handler 一起跑（見下方），確保 timing 一致。

  // ── 左側 program nav 進場/退場（user 2026-06-07，比照 faculty nav / 灰卡的 clip-path reveal）──
  // 對象 = 每顆 program btn 的 .anchor-nav-inner（色塊）+ 每個 .courses-bfa-label（整條 nav 一起 reveal）。
  // clip-path 套「元素自身」（旋轉角不裁、不疊、定在原位）；querySelectorAll = DOM 序 → label1,inner1,label2,inner2,inner3（上到下）。
  // 進場：section 進視窗 once、不隨 program 切換重播；退場：離頁且已進場才跑（沒滑到不閃）。
  // ⚠️ 動畫期間關 inner/label 的 CSS transition:all（hover/切 program 過場用的），否則追著 GSAP 每幀 clipPath 跑會卡頓，跑完還原。
  const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';  // 同灰卡
  const navTargets = Array.from(document.querySelectorAll(
    '.courses-program-bar .courses-bfa-label, .courses-program-bar .courses-program-btn .anchor-nav-inner'
  ));
  let navRevealed = false;
  if (typeof gsap !== 'undefined' && navTargets.length) {
    navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; gsap.set(el, { clipPath: pickClipDir() }); });
    const playNavReveal = () => {
      if (navRevealed) return;
      navRevealed = true;
      gsap.to(navTargets, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: DUR.base,
        ease: NAV_EASE,
        stagger: 0.04,
        clearProps: 'clipPath',
        onComplete: () => navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = ''; }),
      });
    };
    const inView = sectionEl && sectionEl.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (!sectionEl || inView || typeof ScrollTrigger === 'undefined') {
      playNavReveal();
    } else {
      ScrollTrigger.create({ trigger: sectionEl, start: 'top 90%', once: true, onEnter: playNavReveal });
    }
  }

  // ── 離頁退場：卡片 + nav + 表頭「一起」收（user 2026-06-07）──
  // 單一 handler、同 duration（DUR.base）、同時起跑 → 全部一起離開。
  //   ① clip 群（clip-path wipe）：卡片 + nav btn inner/label
  //   ② slide 群（用「年級表頭那套」4 方向 transform slide，外層 overflow:clip + justify-self:start 當遮罩）：
  //      年級 col-header-inner + 必修/選修 type-label-inner。
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined') { resolve(); return; }
    const panel = document.querySelector('.courses-panel:not(.hidden)');
    // 手機表頭（grade-header / row-label）進場跟卡片同走 clip-path → 退場也要一起收，
    // 否則手機離頁卡片收完表頭還站著；桌面這兩 class display:none，tween 不可見無影響
    const clipTargets = [
      ...(panel ? panel.querySelectorAll('.courses-grid-card, .courses-mobile-grade-header, .courses-mobile-row-label') : []),
      ...(navRevealed ? navTargets : []),  // nav 沒滑到沒看過就不收（不閃）
    ];
    const slideInners = panel ? [
      ...panel.querySelectorAll('.courses-grid-col-header-inner'),   // 年級
      ...panel.querySelectorAll('.courses-grid-type-label-inner'),   // 必修/選修
    ] : [];
    if (!clipTargets.length && !slideInners.length) { resolve(); return; }

    let pending = 0;
    const done = () => { if (--pending <= 0) resolve(); };

    if (clipTargets.length) {
      pending++;
      clipTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; });  // nav inner 有 transition:all，關掉免追 GSAP 卡頓
      gsap.killTweensOf(clipTargets);
      // 進場 clearProps 後 computed=none → fromTo 顯式起點 inset(0)（見 feedback_clippath_exit_after_clearprops_use_fromto）
      // stagger 用 amount（總時長固定 0.2s 攤給所有元素）不用 each：卡片多達 ~46 張，用 each:0.02 會拖到 ~0.9s
      // 跟 nav/表頭（元素少、~0.5s 收完）不同步 → 三者「不一起」。amount 讓不論幾張都在同一視窗收完（user 2026-06-07）。
      gsap.fromTo(clipTargets,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: () => pickClipDir(), duration: DUR.base, ease: NAV_EASE, stagger: { amount: 0.2, from: 'end' }, overwrite: true, onComplete: done }
      );
    }
    if (slideInners.length) {
      pending++;
      gsap.killTweensOf(slideInners);
      const DIRS = [{ a: 'y', p: -100 }, { a: 'y', p: 100 }, { a: 'x', p: -100 }, { a: 'x', p: 100 }];
      const dirs = slideInners.map(() => DIRS[Math.floor(Math.random() * DIRS.length)]);
      gsap.to(slideInners, {
        yPercent: (i) => dirs[i].a === 'y' ? dirs[i].p : 0,
        xPercent: (i) => dirs[i].a === 'x' ? dirs[i].p : 0,
        duration: DUR.base,
        ease: EASE.exit,
        stagger: { amount: 0.2, from: 'end' },  // 同 clip 群：固定總 stagger，跟卡片/nav 同一視窗收完
        overwrite: true,
        onComplete: done,
      });
    }
    if (pending === 0) resolve();
  }));

  async function switchToProgram(program, btns, shouldScroll) {
    const newPanelId = `panel-${program}`;
    const prevPanel = document.querySelector('.courses-panel:not(.hidden)');
    // 已 active 同 panel：跳過退場/進場 + active btn 重 roll；如果是 click（shouldScroll）仍 scroll 對齊 anchor
    if (prevPanel && prevPanel.id === newPanelId && shouldScroll) {
      scrollSectionIntoView(sectionEl);
      return;
    }
    // 找出將被 active 的 btn，把 hover 留下的 _pendingRot / _pendingLabelRot 拿出來
    // 達成「hover 看到什麼角度，click 就停在什麼角度」的記憶效果（仿 about）
    // 注意：_pendingColor 已移除（hover 不再 preview accent 色），active 色由 setActiveNavBtn 內部 roll
    const incomingBtn = /** @type {any} */ ([...btns].find(b => b.getAttribute('data-program') === program));
    const opts = {};
    if (incomingBtn?._pendingRot != null) opts.rotation = incomingBtn._pendingRot;
    const pendingLabelRot = incomingBtn?._pendingLabelRot;

    // 切換時（shouldScroll=true）先 exit 舊 panel 的卡片 +（涉及 MDES 時）年級表頭 inner，再 toggle hidden；初次 init 跳過 exit
    // 已隱藏的卡片（從未 reveal 過）的 clipPath 已是 CLIP_DIR，tween 到另一個 CLIP_DIR 視覺上無變化，無需特別 guard
    const isSwitch = shouldScroll;

    // 修 bug：開頭無條件 clear 所有 panel 的 headers inner 殘留 transform
    // 場景：BFA-A→MDES（BFA-A inner 退到 ±100 殘留）→ MDES→BFA-CMD（不動 BFA-A）→ BFA-CMD→BFA-A（involvesMdes=false 不 enter 動畫）
    //       → BFA-A inner 還停在 ±100 = off-screen 看不見
    if (typeof gsap !== 'undefined') {
      // 年級 + 必修/選修 inner 都納入（user 2026-06-07：切 MDES 時表頭也一起動，type-label 已有遮罩可 slide）
      const allHeadersInner = document.querySelectorAll('.courses-grid-col-header-inner, .courses-grid-type-label-inner');
      if (allHeadersInner.length) {
        gsap.killTweensOf(allHeadersInner);
        gsap.set(allHeadersInner, { clearProps: 'transform' });
      }
    }
    // 年級表頭只在涉及 MDES 切換時動畫（BFA Animation ↔ BFA CMD 共用同年級表頭 Freshman/Sophomore/Junior/Senior，無需動畫）
    const involvesMdes = isSwitch && prevPanel && (prevPanel.id === 'panel-mdes' || newPanelId === 'panel-mdes');
    // 年級表頭 exit 方向（4 方向 random：上下左右），enter 階段用反向 mirror（仿 hero-title-wrapper + atlas list view pattern）
    const HEADER_EXIT_DIRS = [
      { axis: 'y', percent: -100 }, // up
      { axis: 'y', percent: 100 },  // down
      { axis: 'x', percent: -100 }, // left
      { axis: 'x', percent: 100 },  // right
    ];
    /** @typedef {{ axis: 'x' | 'y', percent: number }} HeaderDir */
    let headerExitDirs = /** @type {HeaderDir[] | null} */ (null);
    if (isSwitch && prevPanel && prevPanel.id !== newPanelId && typeof gsap !== 'undefined') {
      // 手機表頭（年級 + 必修/選修）沒有 desktop 的 slide-mask 結構，改跟卡片同走 clip-path wipe：
      // 一起塞進 prevCards，切 program 時跟卡片同步收（桌面這兩 class 是 display:none，動畫不可見不影響桌面 slide）
      const prevCards = prevPanel.querySelectorAll('.courses-grid-card, .courses-mobile-grade-header, .courses-mobile-row-label');
      // 年級 + 必修/選修 inner 一起 slide（user 2026-06-07：切 MDES 表頭也動才 smooth；type-label 已有遮罩）
      const prevHeadersInner = prevPanel.querySelectorAll('.courses-grid-col-header-inner, .courses-grid-type-label-inner');
      // headers inner 殘留 transform 已在開頭統一 clear，此處不需重複 kill
      const exitPromises = [];
      if (prevCards.length) {
        exitPromises.push(new Promise(resolve => {
          gsap.killTweensOf(prevCards);
          // 同 page-exit：reveal 後 clipPath 為 none，需 fromTo 顯式起點 inset(0) 才補間得起來（否則舊卡片 snap 不見）
          gsap.fromTo(prevCards,
            { clipPath: 'inset(0% 0% 0% 0%)' },
            {
              clipPath: () => pickClipDir(),
              duration: DUR.fast,
              ease: 'cubic-bezier(0.25, 0, 0, 1)',
              overwrite: true,
              onComplete: resolve,
            }
          );
        }));
      }
      if (involvesMdes && prevHeadersInner.length) {
        headerExitDirs = [...prevHeadersInner].map(() =>
          /** @type {HeaderDir} */ (HEADER_EXIT_DIRS[Math.floor(Math.random() * HEADER_EXIT_DIRS.length)])
        );
        exitPromises.push(new Promise(resolve => {
          gsap.to(prevHeadersInner, {
            yPercent: (/** @type {number} */ i) => {
              const d = headerExitDirs && headerExitDirs[i];
              return d && d.axis === 'y' ? d.percent : 0;
            },
            xPercent: (/** @type {number} */ i) => {
              const d = headerExitDirs && headerExitDirs[i];
              return d && d.axis === 'x' ? d.percent : 0;
            },
            duration: DUR.medium,
            ease: EASE.exit,
            overwrite: true,
            onComplete: resolve,
          });
        }));
      }
      await Promise.all(exitPromises);
    }

    const { color } = setActiveNavBtn(btns, program, 'data-program', opts);
    currentProgramColor = color;
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `panel-${program}`));

    // 切 program 時 reset 卡片選取狀態（避免 active card / slide-in 殘留）
    deselectActiveCard();

    // setActiveNavBtn 清掉 inactive btn-inner 的 inline transform，需 re-apply _baseRot
    applyBaseRotations();

    const activeBtn = /** @type {HTMLElement|null} */ (document.querySelector(
      `.courses-program-btn.active[data-program="${program}"]`
    ));

    // 把 active btn-inner 的 inline rotation 同步到 _baseRot（供之後 mouseleave 還原用）
    syncActiveBaseRot(activeBtn);

    // active group label = accent + 新 rotation；其他 group label = 清 inline bg/color 回 CSS 預設
    // label rotation 優先用 hover pending，無 pending 才隨機（避免 click 後 label 角度突然亂跳）
    // ⚠️ 不要對 active group label 先清再套：transition 0.2s 會跑「accent → transparent → accent」中間態，
    //    視覺上看到一瞬間透明底但因 .active group 的 CSS rule (color:black) 接管 → 黑字浮在頁面背景上
    //    （user 截圖回報 BFA label 一瞬間變黑色）。對 active group 一律直接覆蓋 inline 值。
    const activeLabel = activeBtn
      ? /** @type {HTMLElement & { _baseRot?: number } | null} */ (activeBtn.closest('.courses-program-group')?.querySelector('.courses-bfa-label') || null)
      : null;
    document.querySelectorAll('.courses-bfa-label').forEach(l => {
      if (l === activeLabel) return;
      /** @type {HTMLElement} */ (l).style.background = '';
      /** @type {HTMLElement} */ (l).style.color = '';
    });
    if (activeLabel) {
      activeLabel._baseRot = pendingLabelRot != null ? pendingLabelRot : getRot();
      activeLabel.style.background = color;
      activeLabel.style.color = '#000000';
      activeLabel.style.transform = `rotate(${activeLabel._baseRot}deg)`;
    }

    // click 後要清掉 _pending（避免下次無 hover 直接點時還沿用舊值）
    if (incomingBtn) {
      incomingBtn._pendingRot = null;
      incomingBtn._pendingLabelRot = null;
    }

    await renderCoursesGrid(program);
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

    // 卡片進場 clip-path reveal：每張隨機從 4 方向之一展開
    // - 初次 init（isSwitch=false）：stagger 一個個進場，ScrollTrigger 等使用者滑到才播
    // - 切換 program（isSwitch=true）：無 stagger 同時進場，已在視圖內直接播
    // 年級表頭 enter（僅 isSwitch）：mirror exit direction — 舊 up exit → 新 from below；舊 down exit → 新 from above
    const activePanel = document.getElementById(`panel-${program}`);
    if (activePanel && typeof gsap !== 'undefined') {
      // 初次 init 時 panel 若已在視窗內（top 已過 90% 線）就直接播進場，否則才靠 ScrollTrigger 等捲動。
      // 避免「已在視圖內的卡片」靠 once-trigger 播時，與 line 340 + router 結尾的 ScrollTrigger.refresh()
      // 搶時序：refresh 在 layout 定位前跑完 → trigger 判定已通過 once → 卡片偶爾不進場。
      const panelInView = activePanel.getBoundingClientRect().top < window.innerHeight * 0.9;
      // 含手機表頭（跟卡片同走 clip-path reveal；桌面這兩 class display:none 不可見不影響）
      const allCards = activePanel.querySelectorAll('.courses-grid-card, .courses-mobile-grade-header, .courses-mobile-row-label');
      if (allCards.length) {
        gsap.killTweensOf(allCards);
        allCards.forEach(card => {
          gsap.set(card, { clipPath: pickClipDir() });
        });

        const playReveal = () => {
          gsap.to(allCards, {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: DUR.base,
            ease: 'cubic-bezier(0.25, 0, 0, 1)',
            stagger: isSwitch ? 0 : 0.02,
            overwrite: true,
            clearProps: 'clipPath',
          });
        };

        if (isSwitch || panelInView || deepLinkAutoNav) {
          playReveal();
        } else if (typeof ScrollTrigger !== 'undefined') {
          ScrollTrigger.create({
            trigger: activePanel,
            start: 'top 90%',
            once: true,
            onEnter: playReveal,
          });
        } else {
          playReveal();
        }
      }

      // 年級表頭 enter：
      // - 切換（isSwitch + headerExitDirs）：mirror exit 同軸反向
      // - 初次 init（!isSwitch）：4 方向 random，ScrollTrigger 等使用者滑到才播（同卡片）
      // - BFA↔BFA 切換（isSwitch 但 headerExitDirs=null）：不動畫，headers 維持 rest（已在開頭 clearProps）
      const newHeadersInner = activePanel.querySelectorAll('.courses-grid-col-header-inner, .courses-grid-type-label-inner');
      if (newHeadersInner.length) {
        gsap.killTweensOf(newHeadersInner);
        if (isSwitch && headerExitDirs) {
          const exitDirs = headerExitDirs;
          gsap.fromTo(newHeadersInner,
            {
              yPercent: (/** @type {number} */ i) => {
                const d = exitDirs[i % exitDirs.length];
                return d.axis === 'y' ? -d.percent : 0;
              },
              xPercent: (/** @type {number} */ i) => {
                const d = exitDirs[i % exitDirs.length];
                return d.axis === 'x' ? -d.percent : 0;
              },
            },
            {
              yPercent: 0,
              xPercent: 0,
              duration: DUR.reveal,
              ease: EASE.enter,
              overwrite: true,
              clearProps: 'transform',
            }
          );
        } else if (!isSwitch) {
          const initDirs = [...newHeadersInner].map(() =>
            /** @type {HeaderDir} */ (HEADER_EXIT_DIRS[Math.floor(Math.random() * HEADER_EXIT_DIRS.length)])
          );
          gsap.set(newHeadersInner, {
            yPercent: (/** @type {number} */ i) => initDirs[i].axis === 'y' ? initDirs[i].percent : 0,
            xPercent: (/** @type {number} */ i) => initDirs[i].axis === 'x' ? initDirs[i].percent : 0,
          });
          const playHeaderReveal = () => {
            gsap.to(newHeadersInner, {
              yPercent: 0,
              xPercent: 0,
              duration: DUR.reveal,
              ease: EASE.enter,
              stagger: 0.08,
              overwrite: true,
              clearProps: 'transform',
            });
          };
          if (panelInView || deepLinkAutoNav) {
            playHeaderReveal();
          } else if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.create({
              trigger: activePanel,
              start: 'top 90%',
              once: true,
              onEnter: playHeaderReveal,
            });
          } else {
            playHeaderReveal();
          }
        }
      }
    }

    if (shouldScroll && sectionEl) {
      scrollSectionIntoView(sectionEl);
    }
  }
}
