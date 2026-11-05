/**
 * Courses Section Switch Module
 * 處理 curriculum.html（route/file 原名 courses）的三組 program 切換（bfa-animation / bfa-cmd / mdes）
 *
 * 新版 layout：
 *   - 三個按鈕橫排於頂部，BFA 兩 btn 各自上方有 .courses-bfa-label「BFA Class 學士班」
 *     （仿 about.html class section 的 class-group-label 結構，每 BFA btn 各自一個 label）
 *   - 點 bfa-* btn → 該 btn 上方的 label 同步套 active 色 + 新隨機旋轉
 *   - 旋轉/hover 走全站定案（2026-09-15）：初始隨機角、hover（含 active）抽新角、
 *     離開保持不還原、click 沿用 hover 角（_pendingRot → setActiveNavBtn opts.rotation）
 *   - 內容改 grid（學期×必修/選修×年級）+ 右下 sticky desc panel
 *   - 三個 program 往下捲自動接下一個（user 2026-11-04「同 faculty」）：
 *     三個 panel 疊著捲、nav＝scroll-spy＋點擊捲到該 panel（全版型）；手機 grid（直向＋iPad，user 2026-11-04 同日改）
 *     年級 block 也全部往下排，年級 bar＝scroll-spy＋點擊捲到該年級、只顯示目前 program 那條
 */

import { renderCoursesGrid, deselectActiveCard, resetCoursesMapState, selectCardBySlugInPanel, highlightCardBySlugInPanel } from './courses-map.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { setActiveNavBtn, bindNavBtnFit, bindFrameScrollSplit, bindNavBtnHover, bindLandscapeNavGate } from '../ui/section-switch-helpers.js';
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN, cullByViewport, revealHidden } from '../ui/scroll-animate.js';

// 卡片維持四方向隨機（要多樣性）；滿寬 row-label 抽到 left/right 會滑整個 box 寬
// 「從螢幕邊飛進來」（user 2026-07-21）→ label 帶 el 走 pickNavDir 短邊邏輯（只剩 top/bottom）
const pickCardDir = (/** @type {Element} */ el) =>
  pickNavDir(el.classList.contains('courses-mobile-row-label') ? /** @type {HTMLElement} */ (el) : undefined);
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { waitForHeroAnimDone } from './hero-animation.js';
import { DUR, EASE } from '../ui/motion.js';
import { scrollWindowNoSnap, clampBelowFooter, initColSnap, whenScrollSettles } from '../ui/snap-scroll.js';

// 矮橫向（橫向手機）走手機 window-scroll 路徑：landscape.css 5d 已把 curriculum 的 inner-scroll
// frame 拆掉（section 自然高、box 不捲），gate 同 footer-scatter usesMobileFooter()
function usesWindowScroll() {
  return SCCDHelpers.isMobileLayout();
}


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

// courses 專用旋轉幅度 ±2°（排除 ±0.5）— 比 SCCDHelpers.getRandomRotation(-4~6) 小，
// 配合寬 btn（如 "Animation & Moving Image" 兩行）與 BFA label 視覺較柔
function getRot() {
  let r = 0;
  while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 4 - 2).toFixed(2));
  return r;
}

// 種初始角（label 與 btn-inner 沒有 inline rotate 才寫；已有＝hover/active 留下的角，保持不回退——
// user 2026-09-15 全站定案「hover 抽新角、離開保持」），並清掉 inactive btn-inner 的殘留 inline bg/color
// （避免上次 active 期間設過 inline color: #000000，切換 active 後 .active 被移除但 inline color 還在 → 文字還是黑色）
// setActiveNavBtn 不清 transform、也不清 color，所以 color 要在這手動清
function applyBaseRotations() {
  const seed = (el) => {
    if (!/rotate\(/.test(el.style.transform)) el.style.transform = `rotate(${getRot()}deg)`;
  };
  document.querySelectorAll('.courses-bfa-label').forEach(seed);
  document.querySelectorAll('.courses-program-btn:not(.active) .anchor-nav-inner').forEach(inner => {
    const el = /** @type {HTMLElement} */ (inner);
    seed(el);
    el.style.background = '';
    el.style.color = '';
  });
}

// hover handler：mouseenter 給 btn-inner 與同 group 的 label 抽新隨機 rotation（active 不轉——user 2026-09-29；
// 離開保持不還原——user 2026-09-15 全站定案）。hover 色＝全站 bindNavBtnHover（var 掛 group＝BFA label 同色；
// click 沿用由 setActiveNavBtn 讀 hover 色，label 跟著回傳的 color）
/** @param {HTMLElement} btn */
function bindHover(btn) {
  if (btn.dataset.hoverBound) return;
  btn.dataset.hoverBound = '1';

  const inner = /** @type {HTMLElement | null} */ (btn.querySelector('.anchor-nav-inner'));
  const group = /** @type {HTMLElement | null} */ (btn.closest('.courses-program-group'));
  const label = /** @type {HTMLElement | null} */ (group?.querySelector('.courses-bfa-label') || null);
  // BFA 小標題與 btn 同一組 hover（user 2026-09-28「hover 小標題也要變色」）：進出 group 才算
  bindNavBtnHover(btn, { varHost: group || btn, hoverEl: group || btn });

  // 旋轉也以 group 進出為準（user 2026-09-29「hover BFA 小標題也讓 btn 旋轉」）：進組抽一次角、組內小標題↔btn 移動不重抽
  (group || btn).addEventListener('mouseenter', () => {
    if (btn.classList.contains('active')) return;
    const rot = getRot();
    const labelRot = getRot();
    if (inner) inner.style.transform = `rotate(${rot}deg)`;
    if (label) label.style.transform = `rotate(${labelRot}deg)`;
    // _pendingRot / _pendingLabelRot 給 click 用：點下去沿用剛剛 hover 看到的角度（＝當前可見角）
    /** @type {any} */ (btn)._pendingRot = rot;
    /** @type {any} */ (btn)._pendingLabelRot = labelRot;
  });
}

// 疊排（全版型，手機 2026-11-04 起也是）：每段自己捲到才進場（卡片＋年級/必修選修表頭）。
// 先藏好（同步），回傳 { arm＝建 ScrollTrigger, finish＝不播了、直接到終態 }；now＝deep-link 自動導航（不等 trigger、整片直接播，理由同 deepLinkAutoNav）
/** @param {HTMLElement} panel @param {HTMLElement|undefined} scroller @param {boolean} now @param {Element[]} [extraHeaders] 共用表頭（桌面）跟第一個 panel 一起進場 */
function armPanelReveal(panel, scroller, now, extraHeaders = []) {
  if (typeof gsap === 'undefined' || prefersReducedMotion()) return { arm: () => {}, finish: () => {} };
  // 桌面 grid／手機 grid 兩份共存、只顯示一份（另一份 display:none）→ 只抓看得到的；手機必修/選修 label 跟卡片同走 clip-reveal。
  // panel＝進場單位：桌面一個 program、手機一個年級 block（一個 program 四個年級很長，整段一起播＝下面的年級在視窗外直接到位）
  const vis = (/** @type {string} */ sel) => [...panel.querySelectorAll(sel)].filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null);
  const cards = vis('.courses-grid-card, .courses-mobile-row-label');
  const headers = [...vis('.courses-grid-col-header-inner, .courses-grid-type-label-inner'), ...extraHeaders];
  cards.forEach(c => gsap.set(c, navChipHidden(c, pickCardDir(c))));
  headers.forEach(h => gsap.set(h, revealHidden()));
  const play = () => {
    const { on, off } = now ? { on: cards, off: /** @type {Element[]} */ ([]) } : cullByViewport(cards, window.innerHeight);
    if (off.length) gsap.set(off, { clearProps: 'clipPath,translate' });
    if (on.length) gsap.to(on, { ...NAV_CHIP_SHOWN, duration: DUR.base, ease: EASE.wipe, stagger: { amount: 0.25 }, overwrite: true, clearProps: 'clipPath,translate' });
    if (headers.length) gsap.to(headers, { xPercent: 0, yPercent: 0, duration: DUR.reveal, ease: EASE.enter, stagger: 0.08, overwrite: true, clearProps: 'transform' });
  };
  let st = /** @type {any} */ (null), done = false;
  return {
    arm: () => {
      if (done) return;
      if (now || typeof ScrollTrigger === 'undefined') { play(); return; }
      st = ScrollTrigger.create({ trigger: panel, scroller, start: 'top 90%', once: true, onEnter: play });
    },
    // 點 nav 跳去別的 program：跳過／正在播的進場直接到終態，捲回去就有內容（user 2026-11-04，同 faculty）
    finish: () => {
      done = true;
      st?.kill();
      // getTweensOf→kill 不用 killTweensOf：GSAP 3.14.1 的 killTweensOf 砍不掉帶 stagger 的 tween（play 那支），實測照跑
      gsap.getTweensOf([...cards, ...headers]).forEach(t => t.kill());
      gsap.set(cards, { clearProps: 'clipPath,translate' });
      if (headers.length) gsap.set(headers, { clearProps: 'transform' });
    },
  };
}

/**
 * @param {boolean} fromUserNav true=使用者點連結的 SPA 導航（首頁課程卡片）；
 *   false=初始載入 / refresh / 上一頁下一頁。只有 fromUserNav 才播 ?item= 的「捲到 section + 開 slide-in」
 *   導航動畫，refresh 視為全新頁面（只套 ?program= tab，不重播）。
 * @param {() => void} unlock deep-link 呈現完的解鎖鑰匙（main-modular 換頁 init 時取好傳入，見 deeplink-lock.js）
 */
export function initCoursesSectionSwitch(fromUserNav = false, unlock) {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  // SPA 離開 courses 時 reset activeCard module-scope ref，避免下次回 courses 時 ref 指向已被
  // router.innerHTML swap 掉的 detached node（deselectActiveCard 對 dead element 操作雖無 crash 但邏輯混亂）
  registerPageCleanup(() => resetCoursesMapState());

  // hover 一次性綁定（每 btn 帶 dataset flag 避免重綁）
  programBtns.forEach(bindHover);

  // btn 色塊貼文字寬（CMS label 折行時盒不 hug 最長行）＝四頁共用 helper，時機/機制見 section-switch-helpers
  bindNavBtnFit(programBtns);

  // 滾輪分區：col 1-3 捲 window（去 footer/hero）、col 4 起內部捲（box 邊界不外溢），見 section-switch-helpers
  bindFrameScrollSplit(sectionEl);

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

  // 三個 program 疊著捲（全版型；直向＋iPad 手機 grid 2026-11-04 起也是，user「跟 pc 類似、每個年級往下排到最後一個班級，
  // 不要滾到下面又再切換」）。mobileGrid＝直向＋iPad：年級 block 全部往下排、年級 bar＝scroll-spy＋點擊捲到該年級。跨 gate 轉向靠整頁重載自癒
  const mobileGrid = SCCDHelpers.isBottomBarLayout();
  const scrollCol = /** @type {HTMLElement|null} */ (sectionEl ? sectionEl.querySelector('.inner-scroll-scroll-col') : null);
  const colScrolls = !!scrollCol && getComputedStyle(scrollCol).overflowY !== 'visible';   // 真桌面 frame 右欄自己捲；橫向手機拆 frame＝window
  const panelList = /** @type {HTMLElement[]} */ ([...panels]);
  const panelOf = (/** @type {string} */ program) => document.getElementById(`panel-${program}`);
  const programOf = (/** @type {HTMLElement} */ panel) => panel.id.replace(/^panel-/, '');
  // panel 落點＝第一個 panel 在「捲到段頂」時的位置：桌面＝右欄 scrollTop、橫向手機＝相對段頂的 window 位移
  const panelOffset = (/** @type {HTMLElement} */ p) => p.getBoundingClientRect().top - panelList[0].getBoundingClientRect().top;
  let spyHoldUntil = 0;   // 點 nav／deep-link 捲動途中，經過的 panel 不搶 active
  /** @type {{ arm: () => void, finish: () => void }[]} */
  let panelReveals = [];   // 疊排：每個 panel 的進場（initStacked 建；點 nav 跳過的直接 finish）
  /** @param {HTMLElement|null} p @param {() => void} [onDone] */
  function scrollToPanel(p, onDone) {
    if (!p || !sectionEl) { onDone?.(); return; }
    spyHoldUntil = performance.now() + 1500;
    if (colScrolls && scrollCol) scrollCol.scrollTo({ top: panelOffset(p), behavior: 'smooth' });
    scrollWindowNoSnap(sectionScrollTop(sectionEl) + (colScrolls ? 0 : panelOffset(p)), { onComplete: onDone });   // 人在 hero／footer 時把 frame 帶進來
  }

  const initSwitchPromise = initStacked();

  async function initStacked() {
    panelList.forEach(p => p.classList.remove('hidden'));
    applyActiveProgram(initialProgram);
    await Promise.all([...programBtns].map(b => renderCoursesGrid(b.getAttribute('data-program') || '')));
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

    // 桌面：年級表頭只留一份（user 2026-11-04「不需要重複表頭，除非不一樣才做進出場」）——各 panel 自己的 cover 隱形佔位
    //（版面、落點都不變），右欄頂另放一份共用 cover：0 高 sticky wrapper，疊在原 cover 的位置、整條捲動都釘在欄頂。
    // 表頭歸屬＝最後一個「頂已捲到欄頂」的 panel；換到年級不同的 program（BFA ↔ MDES）才換字＋進退場，BFA 兩組相同＝不動
    const sharedCover = colScrolls && scrollCol && sectionEl ? createSharedCover() : null;
    // 桌面右欄分段磁吸：每個 program 一個落點（snap-scroll initColSnap；panel 頂＝落點、不需偏移）。只在右欄捲時標——
    // 手機 grid 的 window JS 磁吸也吃 .snap-zone，標了會多出 panel 頂這個落點
    if (colScrolls && scrollCol) {
      panelList.forEach(p => p.classList.add('snap-zone'));
      initColSnap(scrollCol, sectionEl);
    }
    // 手機 grid：每個年級一段磁吸（window JS 磁吸 initAboutMobileSnap，main-modular；user 2026-11-04「pc 有 snap、手機也加」）。
    // 落點＝年級頂 − scroll-margin 92（courses.css）＝點年級鈕的落點；年級多半比一屏長＝段內自由捲、段尾往下過門檻才吸到下一個年級
    if (mobileGrid) panelList.forEach(p => p.querySelectorAll('.courses-mobile-grade-block').forEach(b => b.classList.add('snap-zone')));

    // 進場：每個 panel 捲到才播；桌面右欄的 trigger 等整個 frame 進視窗才 arm（右欄座標下第一個 panel 一開始就算「在視窗內」）。
    // 手機 grid：一個年級一個進場單位（一個 program 四個年級很長，整段一起播＝下面的年級在視窗外直接到位）；點 nav 跳段仍以 program 為單位 finish
    const revealScroller = colScrolls && scrollCol ? scrollCol : undefined;
    panelReveals = panelList.map((p, i) => {
      const units = mobileGrid ? /** @type {HTMLElement[]} */ ([...p.querySelectorAll('.courses-mobile-grade-block')]) : [p];
      const rs = units.map((u, j) => armPanelReveal(u, revealScroller, deepLinkAutoNav, i === 0 && j === 0 && sharedCover ? sharedCover.inners() : []));
      return { arm: () => rs.forEach(r => r.arm()), finish: () => rs.forEach(r => r.finish()) };
    });
    const armAll = () => panelReveals.forEach(r => r.arm());
    if (deepLinkAutoNav || !colScrolls || !sectionEl || typeof ScrollTrigger === 'undefined'
      || sectionEl.getBoundingClientRect().top < window.innerHeight * 0.9) armAll();
    else ScrollTrigger.create({ trigger: sectionEl, start: 'top 90%', once: true, onEnter: armAll });

    // 每個 panel 至少一屏（user 2026-11-04「每個 nav 的內容 min-height 100vh」，同 faculty fitWalls）：落點在某個 program 時
    // 下一個的頂在視窗底下 16（卡角餘量）；最後一個改扣「panel 底到捲動終點」＝捲到底它也在落點、上一個不露。與 panel 自己多高無關
    const fitPanels = () => {
      if (!sectionEl) return;
      const last = panelList[panelList.length - 1];
      const lastBottom = last.getBoundingClientRect().bottom;
      const first = panelList[0].getBoundingClientRect().top;
      const landing = colScrolls && scrollCol
        ? first - scrollCol.getBoundingClientRect().top + scrollCol.scrollTop
        : first - sectionEl.getBoundingClientRect().top;
      const after = colScrolls && scrollCol
        ? scrollCol.scrollHeight - (lastBottom - scrollCol.getBoundingClientRect().top + scrollCol.scrollTop)
        : sectionEl.getBoundingClientRect().bottom - lastBottom;
      const viewH = colScrolls && scrollCol ? scrollCol.clientHeight : window.innerHeight;
      panelList.forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const below = p === last ? after : panelList[i + 1].getBoundingClientRect().top - r.bottom - 16;   // panel 底到下一個 panel 頂
        p.style.minHeight = `${Math.max(0, Math.round(viewH - landing - below))}px`;
      });
    };
    fitPanels();
    window.addEventListener('resize', fitPanels);
    registerPageCleanup(() => window.removeEventListener('resize', fitPanels));

    // 手機年級 bar：只顯示目前 program 那條（.is-current，courses.css）、亮目前年級（同一條中線）；捲動換年級＝setActiveNavBtn 現抽角
    /** @param {HTMLElement} cur @param {number} line @param {boolean} atEnd */
    const syncGradeSpy = (cur, line, atEnd) => {
      panelList.forEach(p => p.classList.toggle('is-current', p === cur));
      const blocks = [...cur.querySelectorAll('.courses-mobile-grade-block')];
      if (!blocks.length) return;
      let g = blocks[0];
      if (atEnd) g = blocks[blocks.length - 1];
      else blocks.forEach(b => { if (b.getBoundingClientRect().top <= line) g = b; });
      const key = g.getAttribute('data-grade') || '';
      const btns = cur.querySelectorAll('.courses-mobile-grade-btn');
      const gb = /** @type {HTMLElement|undefined} */ ([...btns].find(b => b.getAttribute('data-grade') === key));
      if (gb && !gb.classList.contains('active')) { setActiveNavBtn(btns, key, 'data-grade'); alignGradeBar(gb); }
    };

    // scroll spy（同 about／faculty：捲動欄中線落在哪個 panel 就亮哪顆）；捲到底＝最後一個
    let queued = false, holdTimer = 0;
    const spy = () => {
      queued = false;
      sharedCover?.update();   // 表頭跟著內容走，點 nav 捲動途中也要換（不吃 spyHoldUntil）
      // 點 nav 的捲動途中不搶；捲完可能已沒有新的 scroll 事件 → 暫停結束補跑一次（手機年級 bar 要換成落點那個 program 的）
      if (performance.now() < spyHoldUntil) {
        clearTimeout(holdTimer);
        holdTimer = window.setTimeout(onSpyScroll, spyHoldUntil - performance.now() + 20);
        return;
      }
      const line = colScrolls && scrollCol ? scrollCol.getBoundingClientRect().top + scrollCol.clientHeight / 2 : window.innerHeight / 2;
      const atEnd = colScrolls && scrollCol
        ? scrollCol.scrollTop + scrollCol.clientHeight >= scrollCol.scrollHeight - 2
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      let cur = panelList[0];
      if (atEnd) cur = panelList[panelList.length - 1];
      else panelList.forEach(p => { if (p.getBoundingClientRect().top <= line) cur = p; });
      const btn = [...programBtns].find(b => b.getAttribute('data-program') === programOf(cur));
      if (btn && !btn.classList.contains('active')) { applyActiveProgram(programOf(cur), true); alignProgramBar(/** @type {HTMLElement} */ (btn)); }
      if (mobileGrid) syncGradeSpy(cur, line, atEnd);
    };
    const onSpyScroll = () => { if (!queued) { queued = true; requestAnimationFrame(spy); } };
    if (colScrolls && scrollCol) scrollCol.addEventListener('scroll', onSpyScroll, { passive: true });   // 欄在 #page-content 內＝換頁隨 DOM 丟
    else {
      window.addEventListener('scroll', onSpyScroll, { passive: true });
      registerPageCleanup(() => window.removeEventListener('scroll', onSpyScroll));
    }
    registerPageCleanup(() => clearTimeout(holdTimer));
    if (mobileGrid) spy();   // 手機：先標目前 program（.is-current）＝年級 bar 從第一刻就只顯示那一條
  }

  // deep-link 導航動畫（只在使用者從首頁 floating course card 點進來的 SPA 導航才播）：
  //   ① 等 hero 進場才往下捲 — waitForHeroAnimDone()（hero onComplete 時 resolve，但封頂 ~0.9s：hero 多組時
  //      不等全播完免「卡在 hero 太久」，user 2026-06-27 收緊；原 2026-06-04 是等全播完 follow 動畫長度）
  //   ② 平滑捲到「該課程卡片」本身（不是只捲 section 頂端）— 課程卡片可能在 grid 下方，只捲 section
  //      頂端的話卡片仍在 viewport 外、slider 就開了看不到卡片（user 2026-06-04）。捲到卡片進 viewport 才開。
  //   ③ 捲到位後再 delay OPEN_DELAY_MS 才開 slide-in（一到就開會感覺過早，留個緩衝；同 activities 的 600）
  // ⚠️ fromUserNav 守衛：refresh / 直接開連結 / 上一頁下一頁時 fromUserNav=false → 不重播這段
  //    （= user 要求「打開 slider 後 refresh 應該是全新頁面，不再走導航動畫」）；
  //    ?program= 對應 tab 仍由上面 initSwitchPromise 套好，只是不 auto-scroll 也不自動開 slide-in。
  if (hasQueryDeepLink && fromUserNav) {
    const OPEN_DELAY_MS = 600;   // 捲到卡片後、開 slide-in 前的緩衝（同 activities navigateToItem 的 600）
    // 同時等 grid render（卡片存在才能 selectCardBySlugInPanel）+ hero 動畫播完才往下捲
    Promise.all([initSwitchPromise, waitForHeroAnimDone()]).then(async () => {
      if (!sectionEl) { unlock(); return; }
      if (!itemSlug) {
        scrollToPanel(panelOf(initialProgram), unlock);
        return;
      }
      spyHoldUntil = performance.now() + 3000;   // 兩段式捲動途中經過的 program 不搶 active
      // 比照 activities navigateToItem：捲動前先等 render/layout settle（setTimeout 150 + rAF）。
      // reduce 模式 hero 是瞬間 → 不等的話捲動在 ~tens ms 內就跑、早於 router 的保險 scroll-reset → 被拉回頂部
      // （activities 一直有這段 settle 所以 reduce 下正常；curriculum 原本沒有 = user 報「停在頂部」）。
      // 與 router 對 deep-link 跳過 reset 的修法疊加＝雙保險。
      await new Promise(r => setTimeout(r, 150));
      await new Promise(r => requestAnimationFrame(r));
      // 導航的卡片一律「對齊到第一排卡片所在的位置」（= section.top=0 時第一排的視窗高度），比固定 viewport 比例
      // 更一致可預期（user 2026-06-04）。做法：在「可見」grid（桌面/手機只一份顯示，挑 offsetParent 非 null）內
      // 量目標卡片與「最上排卡片」的垂直距離 delta（同容器同時量 → 與 scroll 位置無關）。找不到目標卡＝0（只到 section 頂）。
      // 捲動「結束」才排程開 slide-in：openCourseSlideIn 的 enterLightboxMode() 會凍結捲動，半途開會卡在中途。
      const panel = document.getElementById(`panel-${initialProgram}`);
      // 疊排：「第一排」＝第一個 panel 的第一排（全部 panel 都在同一條捲動上，落點跟點 nav 一樣）
      const measureCardDelta = () => {
        const visible = (/** @type {Element|null} */ p) => p
          ? [...p.querySelectorAll('.courses-grid-card')].filter(c => /** @type {HTMLElement} */ (c).offsetParent !== null)   // 跳過隱藏的另一份 grid（桌面/手機）
          : [];
        const targetCard = visible(panel).find(c => c.getAttribute('data-slug') === itemSlug);
        const tops = visible(panelList[0]).map(c => c.getBoundingClientRect().top);
        return (targetCard && tops.length) ? targetCard.getBoundingClientRect().top - Math.min(...tops) : 0;
      };
      // 等目標卡片「reveal 完成」(clip-path 動畫跑完、clearProps 清掉 inline clipPath) 才 highlight + 開 slide-in：
      // 否則卡片進場 stagger 還沒輪到目標就開＝slide-in 蓋在半開的 grid 上（user 2026-06-09 報「沒等卡片 render 好就開」）。
      // 順序：reveal 完 → highlight 卡片(套 accent 底色) → OPEN_DELAY 才開 slide-in（同 activities flash→delay→open 節奏）。
      const openCard = () => {
        waitForGridRevealed(panel).then(() => {
          const card = highlightCardBySlugInPanel(initialProgram, itemSlug);
          // slide-in 完全滑入才解除 deep-link 操作鎖；找不到卡（slug 對不上）＝不開，直接解
          setTimeout(() => { if (!selectCardBySlugInPanel(initialProgram, itemSlug, unlock)) unlock(); }, OPEN_DELAY_MS);
        });
      };
      // 桌面 inner-scroll（卡片在右欄 box 內捲）：兩段式（同 admission navigateToAdmissionItem）——
      // window 捲到 section 頂（frame 填滿視窗）後，再捲 box 讓目標卡對齊第一排位置；box 自身 clamp maxScroll、
      // 免 clampBelowFooter。舊單段 window 捲法在 inner-scroll 下 delta 加 window scroll 無意義 + clamp 永遠
      // 夾回 section 頂 → 較下方課程「沒捲到卡片就開 slide-in」（user 2026-07-03）。
      const scroller = /** @type {HTMLElement|null} */ (usesWindowScroll() ? null : sectionEl.querySelector('.inner-scroll-scroll-col'));
      if (scroller) {
        scrollWindowNoSnap(sectionScrollTop(sectionEl), { onComplete: () => {
          const targetScroll = Math.max(0, Math.round(scroller.scrollTop + measureCardDelta()));
          if (typeof gsap !== 'undefined' && Math.abs(targetScroll - scroller.scrollTop) > 1) {
            gsap.to(scroller, { scrollTop: targetScroll, duration: DUR.medium, ease: EASE.move, overwrite: true, onComplete: openCard });
          } else {
            scroller.scrollTop = targetScroll;
            openCard();
          }
        } });
        return;
      }
      // 手機：原單段 window 捲動。落點上限 clamp 到「footer 仍在視窗外」（課程卡片開 slide-in、不 inline 展開 → growPx 0）。
      // user 2026-06-28：點較下方課程 deep-link 原本一律算「對齊第一排＝頂部」→ 遠超 → 先閃 footer 再開 slide-in
      //   （再被 snap 移回）。clampBelowFooter 後：上面課程照常對齊頂、越下面停在「section 完整捲到底、不露 footer」。
      // deep-link 捲動全程關 mandatory snap（否則 snap 搶捲動 → 速度被牽制 / 到不了第一排位置），捲完才開卡。
      const top = clampBelowFooter(sectionScrollTop(sectionEl) + measureCardDelta());
      scrollWindowNoSnap(top, { onComplete: openCard });
    }).catch(err => { unlock(); throw err; });  // 課程資料載入失敗＝不會呈現 → 解除 deep-link 操作鎖（錯誤照舊拋出）
  }

  // 桌面疊排的共用年級表頭（用法見 initStacked）。回傳 update＝捲動時判歸屬／換字、inners＝目前的表頭字（進退場目標）
  function createSharedCover() {
    if (!scrollCol || !sectionEl) return null;
    const holder = document.createElement('div');
    holder.className = 'courses-shared-cover';
    const gradeKey = (/** @type {HTMLElement} */ p) =>
      [...p.querySelectorAll('.courses-grid-row-cover .courses-grid-col-header-inner')].map(e => e.textContent?.trim()).join('|');
    const fill = (/** @type {HTMLElement} */ p) => {
      const src = p.querySelector('.courses-grid-row-cover');
      holder.replaceChildren(...(src ? [src.cloneNode(true)] : []));
      holder.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));   // 來源表頭的進場 inline transform 別帶過來
    };
    const inners = () => [...holder.querySelectorAll('.courses-grid-col-header-inner')];
    let owner = panelList[0];
    fill(owner);
    scrollCol.prepend(holder);
    sectionEl.classList.add('has-shared-cover');
    const update = () => {
      const top = scrollCol.getBoundingClientRect().top + 1;
      let cur = panelList[0];
      panelList.forEach(p => { if (p.getBoundingClientRect().top <= top) cur = p; });
      if (cur === owner) return;
      const same = gradeKey(cur) === gradeKey(owner);
      owner = cur;
      if (same) return;
      const target = cur;
      const old = inners();
      if (typeof gsap === 'undefined' || prefersReducedMotion() || !old.length) { fill(target); return; }
      // 每格四向隨機出去 → 換成新 program 的表頭 → 反方向進來（同手機 grid 切 MDES 的 mirror）；
      // 退場途中又換歸屬＝新的那次 overwrite 掉這支（onComplete 不跑），由它接手
      const dirs = old.map(() => revealHidden());
      gsap.to(old, {
        xPercent: (i) => dirs[i].xPercent, yPercent: (i) => dirs[i].yPercent, duration: DUR.medium, ease: EASE.exit, overwrite: true,
        onComplete: () => {
          fill(target);
          gsap.fromTo(inners(),
            { xPercent: (i) => -dirs[i % dirs.length].xPercent, yPercent: (i) => -dirs[i % dirs.length].yPercent },
            { xPercent: 0, yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: true, clearProps: 'transform' });
        },
      });
    };
    return { update, inners };
  }

  // 年級 bar（水平 scroll strip）：該顆捲到左緣（同 alignProgramBar；只動 bar 自己的 scrollLeft）
  /** @param {HTMLElement} btn */
  function alignGradeBar(btn) {
    const bar = /** @type {HTMLElement|null} */ (btn.closest('.courses-mobile-grade-bar'));
    if (!bar) return;
    const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    bar.scrollTo({ left: bar.scrollLeft + btn.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad), behavior: 'smooth' });
  }

  // 手機 program bar 是水平 scroll strip：active 的 btn 可能被捲到部分出界 → 捲回讓它靠左對齊頁面內容左緣。
  // 只動 bar 自己的 scrollLeft（不用 scrollIntoView，避免它連帶動垂直/viewport）；桌面是 vertical sticky 不需要。
  // 矮橫向 bar 也是水平 strip（landscape.css 5d）→ 同樣要捲。
  /** @param {HTMLElement} btn */
  function alignProgramBar(btn) {
    if (!usesWindowScroll()) return;
    const bar = /** @type {HTMLElement | null} */ (btn.closest('.courses-program-bar'));
    if (!bar) return;
    // 對齊以「group 整體」為單位（矮橫向 BFA label 在 btn 左側，對齊 btn 會把 label 捲出左緣）；MDES 無 group 用 btn
    const alignEl = /** @type {HTMLElement} */ (btn.closest('.courses-program-group') || btn);
    const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    const delta = alignEl.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad);
    bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
  }

  /** @type {(() => void) | null} */
  let cancelSettle = null;
  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const el = /** @type {HTMLElement} */ (btn);
      // 當下就 active（不等捲動）、捲到該 program；已 active＝無效（同 about／faculty）
      if (el.classList.contains('active')) return;
      const program = el.getAttribute('data-program') || '';
      // 目標以上的 panel、以及從目前這個往上跳時經過的：捲動途中進場照播，落地才收成終態（同 faculty）
      const ti = panelList.findIndex(p => programOf(p) === program);
      const ci = panelList.findIndex(p => document.querySelector(`.courses-program-btn.active[data-program="${programOf(p)}"]`));
      const skipped = panelReveals.filter((r, i) => i < ti || (i > ti && i <= ci));
      cancelSettle?.();
      cancelSettle = whenScrollSettles(colScrolls && scrollCol ? scrollCol : window, () => skipped.forEach(r => r.finish()));
      applyActiveProgram(program);
      alignProgramBar(el);
      scrollToPanel(panelOf(program));
    });
  });

  // 手機年級 bar：點＝捲到這個 program 的那個年級（block 頂落在 program 的落點，同點 program）；當下就 active、已 active＝無效。
  // 年級 bar 是水平 scroll strip：點的那顆捲到左緣（只動 bar 自己的 scrollLeft）
  sectionEl?.addEventListener('click', (e) => {
    const gradeBtn = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('.courses-mobile-grade-btn') : null);
    if (!gradeBtn || gradeBtn.classList.contains('active')) return;
    const panel = gradeBtn.closest('.courses-panel');
    const grade = gradeBtn.getAttribute('data-grade') || '';
    const block = /** @type {HTMLElement|null} */ (panel?.querySelector(`.courses-mobile-grade-block[data-grade="${grade}"]`) || null);
    if (!panel || !block) return;
    setActiveNavBtn(panel.querySelectorAll('.courses-mobile-grade-btn'), grade, 'data-grade');
    alignGradeBar(gradeBtn);
    scrollToPanel(block);
  });

  // BFA 學士班 label 也可點（user 2026-07-12）＝點同 group 的 program btn（含 bar 對齊等副作用）
  document.querySelectorAll('.courses-program-bar .courses-bfa-label').forEach(label => {
    label.addEventListener('click', () => {
      const btn = /** @type {HTMLElement | null} */ (label.closest('.courses-program-group')?.querySelector('.courses-program-btn') || null);
      if (btn) btn.click();
    });
  });

  // 離頁退場（卡片 + nav + 表頭）統一在 nav block 之後的單一 handler 一起跑（見下方），確保 timing 一致。

  // ── 左側 program nav 進場/退場（user 2026-06-07，比照 faculty nav）──
  // 2026-07-16 改 hero 式 clip-reveal＝translate（獨立屬性，與 inner/label 的 inline rotate 共存）＋同步
  // clip-path 滑動揭露（navChipHidden，見 scroll-animate.js；旋轉角不裁、不疊鄰）。
  // 對象 = 每顆 program btn 的 .anchor-nav-inner（色塊）+ 每個 .courses-bfa-label（整條 nav 一起 reveal）。
  // querySelectorAll = DOM 序 → label1,inner1,label2,inner2,inner3（上到下）。
  // ⚠️ 動畫期間關 inner/label 的 CSS transition:all（hover/切 program 過場用的），否則追著 GSAP 每幀寫入跑會卡頓，跑完還原。
  const navTargets = Array.from(document.querySelectorAll(
    '.courses-program-bar .courses-bfa-label, .courses-program-bar .courses-program-btn .anchor-nav-inner'
  ));
  let navRevealed = false;
  // 每顆固定一個隨機方向（2026-07-17 全站四方向隨機、reveal/hide 來回一致）；離頁退場的 navExit 也吃這份
  const navDir = new Map(navTargets.map(el => [el, pickNavDir(el)]));
  const navCol = /** @type {HTMLElement|null} */ (sectionEl ? sectionEl.querySelector('.inner-scroll-nav-col') : null);
  if (navCol && SCCDHelpers.isBottomBarLayout() && typeof ScrollTrigger !== 'undefined') {   // 直向＋iPad；橫向手機 nav 回 header 帶（10-30）
    // 直向手機：program bar＝畫面底固定列、年級 bar 疊其上（courses.css 直向段；user 2026-10-27 原年級在底、11-01 對調「先年級才班級」）。
    // 範圍跟底 bar 同拍（bindMobileBottomBar：hero 底過 100 才現）＝兩條一起進退；清單捲到底不收（user 2026-11-04：footer 已改
    // 浮層鈕、頁尾沒有 footer 要讓，捲完當年級往下還要靠這條接下一個 program）＝只看起點、回 hero 才藏。
    // 不設 end：清單高度隨年級變、end 是建立當下算的（'max' 也是）→ 換到長年級捲過舊 end 就被當成離開而收起；
    // 進退＝逐 chip clip-reveal；範圍外 .is-off 不擋點擊；HTML 出生 .is-div-hidden，同步設好藏起態才拿掉＝首繪不閃。
    const anim = typeof gsap !== 'undefined' && !prefersReducedMotion();
    const setShown = (/** @type {boolean} */ on) => {
      if (on === navRevealed) return;
      navRevealed = on;
      navCol.classList.toggle('is-off', !on);
      if (!anim) { navCol.classList.toggle('is-div-hidden', !on); return; }
      gsap.killTweensOf(navTargets);
      navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; });
      const hid = navTargets.map(el => navChipHidden(el, navDir.get(el)));   // 每次重算：active 換角後方向跟著轉
      const hidVars = { clipPath: (/** @type {number} */ i) => hid[i].clipPath, translate: (/** @type {number} */ i) => hid[i].translate };
      gsap.fromTo(navTargets, on ? hidVars : { ...NAV_CHIP_SHOWN }, {
        ...(on ? NAV_CHIP_SHOWN : hidVars), duration: DUR.base, ease: EASE.wipe,
        stagger: on ? 0.04 : { each: 0.04, from: 'end' }, overwrite: true,
        ...(on && { clearProps: 'clipPath,translate' }),
        onComplete: () => { if (on) navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = ''; }); },
      });
    };
    navCol.classList.add('is-off');
    if (anim) {
      navCol.classList.remove('is-div-hidden');
      navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; gsap.set(el, navChipHidden(el, navDir.get(el))); });
    }
    const st = ScrollTrigger.create({
      trigger: sectionEl, start: 'top top+=100',
      onEnter: () => setShown(true), onLeaveBack: () => setShown(false),
    });
    if (st.progress > 0) setShown(true);
  } else if (typeof gsap !== 'undefined' && navTargets.length && !prefersReducedMotion()) {  // 減少動態：nav 維持靜態可見
    navTargets.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; gsap.set(el, navChipHidden(el, navDir.get(el))); });

    // 嚴格 hero gate 只給矮橫向（nav fixed 進 header 帶、hero 屏要藏）。直向手機 nav 在 flow、
    // 緊接 hero 之下 → 走下面 once-reveal（section 進 90% 線就現），不能等 hero 完全捲出才出現
    // （user 2026-07-12「手機版 nav btn 應該在 hero 之下就出現、不是等 main section 到視窗」）。
    const isLandscapeGate = SCCDHelpers.isLandscapePhone();
    if (isLandscapeGate && 'IntersectionObserver' in window && sectionEl) {
      // 矮橫向：nav 進 header fixed、hero 也浮著 → 嚴格 hero gate（bindLandscapeNavGate）。
      // courses-nav-revealed：grade cover 的 ::before 上方白補丁跟 nav 同一顆 gate（landscape.css 消費）——
      // 未 pinned 時補丁會浮在 hero 圖上＝奇怪白 bar（user 2026-07-10）
      bindLandscapeNavGate(sectionEl, /** @type {HTMLElement[]} */ (navTargets), navDir,
        { revealedClass: 'courses-nav-revealed', onChange: (v) => { navRevealed = v; } });
    } else {
      // 桌面＋直向手機：nav 在 flow（桌面左側 sticky／手機頂部 strip），進場 once（stagger 0.04）、不 re-hide
      const playNavReveal = () => {
        if (navRevealed) return;
        navRevealed = true;
        gsap.to(navTargets, {
          ...NAV_CHIP_SHOWN,
          duration: DUR.base, ease: EASE.wipe, stagger: 0.04, clearProps: 'clipPath,translate',
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
  }

  // ── 離頁退場：卡片 + nav + 表頭「一起」收（user 2026-06-07）──
  // 單一 handler、同 duration（DUR.base）、同時起跑 → 全部一起離開。
  //   ① clip 群（clip-path wipe）：卡片 + nav btn inner/label
  //   ② slide 群（用「年級表頭那套」4 方向 transform slide，外層 overflow:clip + justify-self:start 當遮罩）：
  //      年級 col-header-inner + 必修/選修 type-label-inner。
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined') { resolve(); return; }
    // 顯示中的 panel（疊排＝三個都是；手機 grid＝一個）
    const shownPanels = [...document.querySelectorAll('.courses-panel:not(.hidden)')];
    const inShown = (/** @type {string} */ sel) => shownPanels.flatMap(p => [...p.querySelectorAll(sel)]);
    // 手機表頭（年級 bar pill / row-label）進場跟卡片同走 clip-path → 退場也要一起收，
    // 否則手機離頁卡片收完表頭還站著；桌面這兩 class display:none，tween 不可見無影響
    const clipTargets = inShown('.courses-grid-card, .courses-mobile-grade-bar .anchor-nav-inner, .courses-mobile-row-label');
    const navExit = navRevealed ? navTargets : [];  // nav 沒滑到沒看過就不收（不閃）
    const slideInners = [
      ...inShown('.courses-grid-col-header-inner'),   // 年級
      ...(sectionEl ? sectionEl.querySelectorAll('.courses-shared-cover .courses-grid-col-header-inner') : []),   // 桌面疊排的共用年級表頭
      ...inShown('.courses-grid-type-label-inner'),   // 必修/選修
    ];
    if (!clipTargets.length && !navExit.length && !slideInners.length) { resolve(); return; }

    let pending = 0;
    const done = () => { if (--pending <= 0) resolve(); };

    // viewport-cull：離頁退場只收看得到的（換頁後整個 main 換掉，視窗外收不收沒差、不必陪跑）
    const { on: clipOn } = cullByViewport(clipTargets, 200);
    if (clipOn.length) {
      pending++;
      clipOn.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; });  // mobile grade bar inner 有 transition:all，關掉免追 GSAP 卡頓
      gsap.killTweensOf(clipOn);
      // hero 式 clip-reveal 反向（同下方 navExit）：fromTo 顯式起點 NAV_CHIP_SHOWN → 各自四方向隨機（label 挑短邊）滑出＋同步 clip。
      // stagger 用 amount（總時長固定 0.2s 攤給所有元素）不用 each：卡片多達 ~46 張，用 each:0.02 會拖到 ~0.9s
      // 跟 nav/表頭（元素少、~0.5s 收完）不同步 → 三者「不一起」。amount 讓不論幾張都在同一視窗收完（user 2026-06-07）。
      const hid = clipOn.map(el => navChipHidden(el, pickCardDir(el)));
      gsap.fromTo(clipOn,
        { ...NAV_CHIP_SHOWN },
        { clipPath: (/** @type {number} */ i) => hid[i].clipPath, translate: (/** @type {number} */ i) => hid[i].translate, duration: DUR.base, ease: EASE.wipe, stagger: { amount: 0.2, from: 'end' }, overwrite: true, onComplete: done }
      );
    }
    if (navExit.length) {
      // nav btn/label 走 hero 式滑出（translate＋同步 clip），同一 stagger 視窗跟卡片/表頭一起收
      pending++;
      navExit.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = 'none'; });
      gsap.killTweensOf(navExit);
      const hid = navExit.map(el => navChipHidden(el, navDir.get(el)));
      gsap.fromTo(navExit,
        { ...NAV_CHIP_SHOWN },
        { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: EASE.wipe, stagger: { amount: 0.2, from: 'end' }, overwrite: true, onComplete: done }
      );
    }
    if (slideInners.length) {
      pending++;
      gsap.killTweensOf(slideInners);
      const DIRS = [{ a: 'y', p: -110 }, { a: 'y', p: 110 }, { a: 'x', p: -110 }, { a: 'x', p: 110 }];   // ±110 防遮罩邊 1px 殘線
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

  // program nav 換 active（btn 色塊＋同組 BFA label）；切換（手機 grid）、疊排的點擊／scroll spy 共用
  // fromScroll：scroll spy 換段＝btn／label 都抽新角（同 about scroll-spy），不沿用 hover 留下的角
  /** @param {string} program @param {boolean} [fromScroll] */
  function applyActiveProgram(program, fromScroll = false) {
    const btns = programBtns;
    // 找出將被 active 的 btn，把 hover 留下的 _pendingRot / _pendingLabelRot 拿出來
    // 達成「hover 看到什麼角度，click 就停在什麼角度」的記憶效果（仿 about）
    // active 色＝點下去時的 hover 色（setActiveNavBtn 讀 data-nav-picked；2026-09-29 起點擊當下就寫）
    const incomingBtn = /** @type {any} */ ([...btns].find(b => b.getAttribute('data-program') === program));
    const opts = {};
    if (fromScroll) opts.rotation = getRot();
    else if (incomingBtn?._pendingRot != null) opts.rotation = incomingBtn._pendingRot;
    const pendingLabelRot = fromScroll ? null : incomingBtn?._pendingLabelRot;

    // active 立即切（user 2026-09-29，同 about anchor-nav：點下去 nav 就換色/轉角，不等右欄卡片退場動畫）。
    // 只動 nav 狀態，不碰 panel/卡片 → 跟退場並行無干擾；panel 切換與 render 仍在退場之後。
    const { color } = setActiveNavBtn(btns, program, 'data-program', opts);
    // 清 inactive btn-inner 殘留 inline color＋補種沒角度的（角度本身常駐、不回退）
    applyBaseRotations();

    const activeBtn = /** @type {HTMLElement|null} */ (document.querySelector(
      `.courses-program-btn.active[data-program="${program}"]`
    ));

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
      activeLabel.style.color = 'var(--color-black)';
      activeLabel.style.transform = `rotate(${activeLabel._baseRot}deg)`;
    }

    // click 後要清掉 _pending（避免下次無 hover 直接點時還沿用舊值）
    if (incomingBtn) {
      incomingBtn._pendingRot = null;
      incomingBtn._pendingLabelRot = null;
    }
  }
}
