/**
 * Admission Section Switch
 * admission.html 左側 section 切換邏輯：當前 panel 統一往下退場 → 切換 → 新 panel per-item 進場
 */

import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import {
  playAdmissionPanelExit,
  playAdmissionPanelReveal,
  setupAdmissionReveal,
} from './admission-data-loader.js';
import { resetListAccordionsInPanel, refreshStickyPinObservers } from '../accordions/list-accordion.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { waitForHeroAnimDone } from './hero-animation.js';
import { DUR, EASE } from '../ui/motion.js';
import { scrollWindowNoSnap } from '../ui/snap-scroll.js';

// 當前 active section 的色（setActiveNavBtn 回傳）；給 deep-link highlight 用（= 該 section 色，三原色之一）
let currentSectionColor = '';

// box 是否「真的是捲動容器」：矮橫向 landscape gate 把 admission 的 100vh frame 拆掉（overflow 改 visible、
// window 捲），但 class 還在 → 看 computed overflow-y 不看寬度（同 list-accordion getScrollableBox）。
// el 可以是 box 自身或其後代（closest 對自身也命中）。
function getScrollableScrollCol(el) {
  const box = /** @type {HTMLElement | null} */ (el && el.closest('.inner-scroll-scroll-col'));
  if (!box) return null;
  const oy = getComputedStyle(box).overflowY;
  return (oy === 'auto' || oy === 'scroll') ? box : null;
}

// 等指定 list-item 進場 reveal 完成（reveal onEnter 移除 data-pre-reveal）才 highlight，不在 rows 還 clip-reveal
// 中途就先亮（對齊 activities navigateToItem 的 waitForItemRevealed，user 2026-06-09）。已無 data-pre-reveal → 立即 resolve。
function waitForItemRevealed(item, timeout = 8000) {
  return new Promise(resolve => {
    if (!item || !item.hasAttribute('data-pre-reveal')) { resolve(); return; }
    let done = false, t = null;
    const finish = () => { if (done) return; done = true; obs.disconnect(); if (t) clearTimeout(t); resolve(); };
    const obs = new MutationObserver(() => { if (!item.hasAttribute('data-pre-reveal')) finish(); });
    obs.observe(item, { attributes: true, attributeFilter: ['data-pre-reveal'] });
    t = setTimeout(finish, timeout);
  });
}

// 首頁 floating camp 海報 deep-link 用：捲到指定 item → 等 reveal → flash highlight → 展開 accordion
// （比照 activities navigateToItem smooth 版，但 admission summer-camp 結構簡單：無 sub-tab / sticky filter bar）。
// 呼叫前 section 已切到 summer-camp 且 list 已載入（switchSection await 完）。
async function navigateToAdmissionItem(itemId) {
  if (!itemId) return;
  // 等 DOM render settle
  await new Promise(r => setTimeout(r, 150));
  await new Promise(r => requestAnimationFrame(r));

  const target = /** @type {HTMLElement | null} */ (document.getElementById(`item-${itemId}`));
  if (!target) return;

  // year group 收合的先展開（summer-camp 若年份分組）
  const yearItems = /** @type {HTMLElement | null} */ (target.closest('.list-year-items'));
  if (yearItems && (yearItems.style.height === '0px' || yearItems.style.display === 'none')) {
    const yearToggle = /** @type {HTMLElement | null} */ (yearItems.closest('.grid-12')?.querySelector('.list-year-toggle'));
    if (yearToggle) { yearToggle.click(); await new Promise(r => setTimeout(r, 350)); }
  }

  // 落點：item 落在 sticky nav / scroll-mask（top:200）下方一點。用非 sticky 的 offsetTop 累加算絕對位置（每次一致）。
  const COMPENSATE = 216; // sticky top 200 + 16 留白
  let targetTop = 0;
  let el = /** @type {HTMLElement | null} */ (target);
  while (el) { targetTop += el.offsetTop; el = /** @type {HTMLElement | null} */ (el.offsetParent); }
  const finalTop = Math.max(0, targetTop - COMPENSATE);

  const flashColor = currentSectionColor || '#00FF80';
  // 順序：list 文字 render → highlight → 600ms → 展開（同 activities）
  const flashThenOpen = async () => {
    await waitForItemRevealed(target);
    target.style.transition = 'background 0.3s';
    target.style.background = flashColor;
    setTimeout(() => {
      target.style.background = '';
      const header = /** @type {HTMLElement | null} */ (target.querySelector('.list-header'));
      if (header && !header.classList.contains('active')) {
        header.dataset.skipOpenScroll = '1';     // 已捲齊 → accordion open 不要再自己捲
        header.dataset.accentHex = flashColor;    // highlight 色繼承成 accordion active 色
        header.style.background = flashColor;
        header.click();
      }
    }, 600);
  };

  // 桌面 inner-scroll：window 平滑捲到 section（hero→frame）後，再捲右欄 box 到 item（list-header sticky-top=0 →
  //   item 對齊 box 頂；scroller-relative = rect 差 + scrollTop），捲完 flash+open。
  // 手機/窄與矮橫向拆 frame（box overflow 被 landscape gate 改 visible、不可捲）走原 window 路徑——
  //   看 computed overflow 不看寬度（同 list-accordion getScrollableBox 邏輯）。
  const scroller = getScrollableScrollCol(target);
  if (scroller) {
    const section = document.getElementById('admission-content-section');
    const sectionTopDoc = section ? section.getBoundingClientRect().top + window.scrollY : 0;
    scrollWindowNoSnap(sectionTopDoc, { onComplete: () => {
      const itemInScroller = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const targetScroll = Math.max(0, Math.round(itemInScroller));
      if (typeof gsap !== 'undefined' && Math.abs(targetScroll - scroller.scrollTop) > 1) {
        gsap.to(scroller, { scrollTop: targetScroll, duration: DUR.medium, ease: EASE.move, overwrite: true, onComplete: flashThenOpen });
      } else {
        scroller.scrollTop = targetScroll;
        flashThenOpen();
      }
    } });
    return;
  }
  // 手機/窄：deep-link 捲動全程關 mandatory snap（否則 snap 搶捲動 → 速度被牽制 / 到不了目標），捲完才 flash+open。
  scrollWindowNoSnap(finalTop, { onComplete: flashThenOpen });
}

// scrollIntoView wrapper：捲到 section 頂端對齊 viewport 頂端（section.top=0），**不扣 header 高度**。
// 同 courses-section-switch.js 的 sectionScrollTop pattern。
// Why 不扣 header：section 緊貼在 h-screen hero 正下方，扣掉 header 高度 = 少捲 ~80px →
//   hero 底部會殘留在畫面上方（user 2026-06-05 回報「卡在看得到 hero 的地方」）。
//   section 的 md:py-6xl(192px) 上 padding 已讓內容清開 fixed header(80px)，不需再扣。
/**
 * @param {HTMLElement | null} el
 * @param {ScrollBehavior} [behavior]
 */
function scrollSectionIntoView(el, behavior = 'smooth') {
  if (!el) return;
  // 桌面 inner-scroll：右欄 box 回頂（切 section 讓新 panel 從頭顯示）；手機/矮橫向拆 frame（window 捲）box 不可捲＝no-op 也安全。
  const scroller = getScrollableScrollCol(el.querySelector('.inner-scroll-scroll-col'));
  if (scroller) scroller.scrollTop = 0;
  const top = el.getBoundingClientRect().top + window.scrollY;
  // smooth 程式捲動關 mandatory snap（否則被 snap 搶、落點錯，同 deep-link item 路徑）；instant 不需 tween。
  if (behavior === 'smooth') scrollWindowNoSnap(top);
  else window.scrollTo({ top, behavior });
}

// ── 左側 section nav 進場/退場（比照 faculty/activities nav，user 2026-06-07）──
// 2026-07-16 改 hero 式 clip-reveal＝translate（獨立屬性，與 inner 的 inline rotate 共存）＋同步 clip-path
// 滑動揭露（navChipHidden，見 scroll-animate.js；旋轉角不裁、不疊鄰）、4 方向隨機、DUR.base + cubic-bezier + stagger；
// 進場只在 content section 進視窗時跑一次（不重播切分頁）；退場離頁且 navRevealed 才跑、fromTo 顯式起點、from:'end'。
// transition:'none' 解 .anchor-nav-inner 的 navigation.css `transition: all`（含 clip/translate）對 GSAP 每幀寫的接管（卡頓），跑完還原。
const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';

function setupSectionNavReveal() {
  if (typeof gsap === 'undefined') return;
  const inners = Array.from(document.querySelectorAll('.activities-section-btn .anchor-nav-inner'));
  if (!inners.length) return;
  let navRevealed = false;
  // 每顆固定一個隨機方向（2026-07-17 全站四方向隨機、reveal/hide 來回一致）；px 向量每次要藏重算
  const navDir = new Map(inners.map(inner => [inner, pickNavDir(inner)]));
  inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; gsap.set(inner, navChipHidden(inner, navDir.get(inner))); });

  const section = document.getElementById('admission-content-section');
  const isLandscapeGate = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  if (isLandscapeGate && 'IntersectionObserver' in window && section) {
    // 矮橫向：nav 進 header fixed、hero 也浮著 →「hero 之後才 reveal、回 hero 出場隱藏」，clip-path 非
    // opacity（user 2026-07-10 三反饋定為全站 nav btn 原則，同 curriculum/faculty setNav）：IO 偵測
    // content section 佔視窗中段 → 各 inner 個別方向、同時（stagger:0）clip-reveal / clip-hide。
    // fixed nav 被 clip 掉時 btn 外框仍在 → pointer-events 一併切，免隱形 btn 蓋 hero 誤觸。
    const navCol = /** @type {HTMLElement|null} */ (section.querySelector('.inner-scroll-nav-col'));
    if (navCol) navCol.style.pointerEvents = 'none';
    const setNav = (reveal) => {
      if (navRevealed === reveal) return;
      navRevealed = reveal;
      gsap.killTweensOf(inners);
      inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; });
      if (navCol) navCol.style.pointerEvents = reveal ? '' : 'none';
      const hid = reveal ? null : inners.map(inner => navChipHidden(inner, navDir.get(inner)));
      gsap.to(inners, {
        clipPath: reveal ? NAV_CHIP_SHOWN.clipPath : (i) => hid[i].clipPath,
        translate: reveal ? NAV_CHIP_SHOWN.translate : (i) => hid[i].translate,
        duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true,
        onComplete: () => { if (reveal) inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = ''; }); },
      });
    };
    // 嚴格 hero gate（user 2026-07-10「卡一半 nav 就出現」）：改觀察 hero 本體——底緣離開視窗頂
    // （8px buffer 防 knife-edge）才算「捲到 hero 之下」reveal；原「content 佔中段(-45%)」在頁面停在
    // 半路（hero 還佔上半屏）時就會誤 reveal。footer 進視窗 75% 線另收起（原 content IO 的隱含行為補回）。
    // 兩顆 IO 各記 flag 統一 apply——各自 toggle 會被初始 delivery 順序互蓋（同 about anchor-nav 的坑）。
    const heroEl = document.querySelector('#page-content > section');
    const footerEl = document.getElementById('site-footer');
    let heroVis = !!heroEl;
    let footerVis = false;
    const applyNav = () => setNav(!heroVis && !footerVis);
    if (heroEl) {
      const heroIO = new IntersectionObserver(([e]) => { heroVis = e.isIntersecting; applyNav(); },
        { rootMargin: '-8px 0px 0px 0px' });
      heroIO.observe(heroEl);
      registerPageCleanup(() => heroIO.disconnect());
    }
    if (footerEl) {
      const footerIO = new IntersectionObserver(([e]) => { footerVis = e.isIntersecting; applyNav(); },
        { rootMargin: '0px 0px -25% 0px' });
      footerIO.observe(footerEl);
      registerPageCleanup(() => footerIO.disconnect());
    }
  } else {
    // 桌面/直向：進場 once、不 re-hide（維持原行為）
    const play = () => {
      if (navRevealed) return;
      navRevealed = true;
      gsap.to(inners, {
        ...NAV_CHIP_SHOWN, duration: DUR.base, ease: NAV_EASE, stagger: 0.02, clearProps: 'clipPath,translate',
        onComplete: () => inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = ''; }),
      });
    };
    const inView = section && section.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (!section || inView || typeof ScrollTrigger === 'undefined') {
      play();
    } else {
      ScrollTrigger.create({ trigger: section, start: 'top 90%', once: true, onEnter: play });
    }
  }

  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !navRevealed) { resolve(); return; }
    gsap.killTweensOf(inners);
    inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; });
    const hid = inners.map(inner => navChipHidden(inner, navDir.get(inner)));
    gsap.fromTo(inners,
      { ...NAV_CHIP_SHOWN },
      { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.02, from: 'end' }, overwrite: true, onComplete: resolve });
  }));
}

// 手機直向：nav strip 全程 sticky（lists.css portrait 區塊釘 88）→ 量 nav 實高，把展開的 list title
// 釘在 nav 正下方。admission 無 filter bar（activities 是釘 bar 下方，updateStickyTop 那條走不到）→
// 直接設 --list-header-sticky-top = 88 + navH 到 list 容器（getListStickyTop / CSS sticky top / pin-IO 三者共用它）。
// 桌面/矮橫向不設（桌面 loadListInto updateStickyTop 已設 0＝box 頂；矮橫向拆 frame → getListStickyTop fallback）。
function initAdmissionMobileSticky() {
  const section = document.getElementById('admission-content-section');
  const navCol = /** @type {HTMLElement | null} */ (section?.querySelector('.inner-scroll-nav-col'));
  const containers = /** @type {HTMLElement[]} */ ([
    document.getElementById('admission-list'),
    document.getElementById('summer-camp-list'),  // lazy load，先設 var（inherited），list 進 DOM 後沿用
  ].filter(Boolean));
  if (!navCol || !containers.length) return;

  const portrait = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
  const navInner = /** @type {HTMLElement | null} */ (navCol.firstElementChild);
  const update = () => {
    // 桌面/矮橫向不碰：--list-header-sticky-top 由 loadListInto updateStickyTop 設 0（box 頂）—— 別 remove 掉害它 fallback 200
    if (!portrait.matches) return;
    // 釘在 navInner（buttons）底、不含其 mb-xl（2026-07-18 縫隙修，反轉 07-17「量 navCol」）：
    //   nav 底色同步收到 buttons 底（lists.css bg 掛 navCol > div）→ title 貼 buttons 底不被蓋、
    //   捲過的 list box 也到 buttons 下才被吃，消掉 buttons 與 box/title 間 ~32px 隱形空帶。
    //   （07-17「量 navInner 會讓 title 頂被 nav 底色切掉」的前提是 bg 蓋滿 navCol，已隨 CSS 一起反轉。）
    // 88 = nav sticky top（lists.css）；−1 疊縫防 sub-pixel 透縫。
    const top = Math.round(88 + (navInner ? navInner.offsetHeight : navCol.offsetHeight) - 1);
    containers.forEach(c => {
      c.style.setProperty('--list-header-sticky-top', top + 'px');
      refreshStickyPinObservers(c);  // 釘點變了 → 開著的 header pin-IO 跟上（無 active header 時 no-op）
    });
  };
  update();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(navInner || navCol);  // 釘點量 navInner → 觀察它（buttons 換行時跟上）
    registerPageCleanup(() => ro.disconnect());
  }
}

// fromUserNav：true=使用者點連結的 SPA 導航（首頁 floating camp 海報）；false=初始載入 / refresh / 上一頁下一頁。
// 只有 fromUserNav 才套 ?section=/?item= deep-link 並跑導航動畫；refresh 視為全新頁面（清 query、停 default news）。
export function initAdmissionSectionSwitch(fromUserNav = false) {
  const btns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.activities-section-btn'));
  if (!btns.length) return;

  // 矮橫向「hero 藏 nav」已併入 setupSectionNavReveal 的 clip-path 雙向分支（user 2026-07-10
  // 定為原則：nav btn 進出場用 clip-path 不用 opacity；舊 .admission-nav-shown opacity 版退役）。

  // 離頁退場：當前可見 panel 反向退場（先收起展開的 accordion，再 rows yPercent 沉出）。
  // 用的是 playAdmissionPanelReveal 的反向同一支 playAdmissionPanelExit（in-page 切換 + 離頁共用），
  // 與 activities 的 playActivitiesExit 同 pattern。router 換頁前 await；registerPageExit 跑完自動清空不洩漏。
  registerPageExit(() => {
    const panel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
    return panel ? playAdmissionPanelExit(panel) : Promise.resolve();
  });

  // 左側 section nav clip-path 進場（section 進視窗 once）+ 離頁退場，比照 faculty/activities nav
  setupSectionNavReveal();

  // 手機直向 nav sticky 疊層：量 nav 高把展開 list title 釘在 nav 下方（比照 activities，見函式註解）
  initAdmissionMobileSticky();

  const loaded = {};
  let switching = false;  // 防連點

  async function switchSection(section, shouldScroll = false, isInitial = false) {
    if (switching) return;
    const currentPanel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
    const targetId = `panel-${section}`;
    // 已 active 同 panel：跳過退場/進場動畫；如果是 click（shouldScroll）仍 scroll 對齊 anchor
    if (currentPanel && currentPanel.id === targetId && !isInitial) {
      if (shouldScroll) {
        const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('admission-content-section'));
        scrollSectionIntoView(sectionEl);
      }
      return;
    }

    switching = true;

    // try/finally：lazy import / loadSummerCampInto reject 時 switching flag 不能永久卡 true
    // （參考 activities-section-switch 已有的 race fix；同 pattern 套 admission）
    // 順序對齊 activities switchToSection：先 load → setup（panel 仍 hidden）→ show → reveal。
    // 關鍵＝setupAdmissionReveal 必須在 list 已在 DOM 後才跑，文字 row + zebra 灰底才會一次藏好；
    //   panel 全程 hidden 到 show 那步，lazy load 期間描述塊也不會 flash（不需先藏再補藏那套）。
    try {
      // 1. 退場（首次 init 跳過）
      if (!isInitial && currentPanel) {
        await playAdmissionPanelExit(currentPanel);
      }

      // 2. Lazy load summer camp（首次切到才載入）— 在 setup/show 之前，list 進 DOM 後 setup 才能正確藏 zebra。
      //    autoReveal:false：reveal 由本模組 playAdmissionPanelReveal 接管。
      if (section === 'summer-camp' && !loaded['summer-camp']) {
        loaded['summer-camp'] = true;
        const [{ loadSummerCampInto }, { initListAccordion }] = await Promise.all([
          import('./activities-data-loader.js'),
          import('../accordions/list-accordion.js'),
        ]);
        await loadSummerCampInto('summer-camp-list', { autoReveal: false });
        initListAccordion();
      }

      // 3. 切 active btn（capture 色給 deep-link highlight 用）
      ({ color: currentSectionColor } = setActiveNavBtn(btns, section, 'data-section'));

      // 4. setup（panel 仍 hidden）：list 已載入 → 文字 row 藏起 + zebra 灰底 clip 藏起一次到位。
      //    hide:!isInitial — 初次 init（hide:false）只 wrap 不隱藏描述塊（HTML 已可見免閃，但需 wrapper 讓首次 exit 乾淨剪裁）。
      const newPanel = /** @type {HTMLElement | null} */ (document.getElementById(targetId));
      if (newPanel) setupAdmissionReveal(newPanel, { hide: !isInitial });

      // 5. show 新 panel + 收起遺留 open accordion（避免切走再切回 accordion 仍開的殘留）
      if (newPanel) {
        showPanel('.activities-panel', targetId);
        resetListAccordionsInPanel(newPanel);
      }

      // 6. 進場：首次 init 用 ScrollTrigger（rows 在 viewport 外時等捲入再播），後續切換立即播放
      if (newPanel) {
        playAdmissionPanelReveal(newPanel, { useScrollTrigger: isInitial });
      }

      if (shouldScroll) {
        const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('admission-content-section'));
        scrollSectionIntoView(sectionEl);
      }
    } finally {
      switching = false;
    }
  }

  btns.forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section, true)));

  // ?section= / ?item= deep-link（首頁 floating camp 海報導航）：只有 fromUserNav 才套指定 section + 跑導航動畫。
  const params = new URLSearchParams(window.location.search);
  const hasDeepLink = params.has('section');
  if (hasDeepLink && fromUserNav) {
    const initialSection = params.get('section') || 'news';
    const initialItem = params.get('item');
    // switchSection 為 async（summer-camp lazy load）→ await 完 list 才在 DOM，再等 hero 進場（waitForHeroAnimDone，封頂 ~0.9s）平滑導航/捲動。
    switchSection(initialSection, false, true).then(() => {
      if (initialItem) {
        waitForHeroAnimDone().then(() => navigateToAdmissionItem(initialItem));
      } else {
        waitForHeroAnimDone().then(() => scrollSectionIntoView(document.getElementById('admission-content-section')));
      }
    });
  } else {
    // refresh / 直接開連結 / 上一頁下一頁：清掉 deep-link query（URL 變乾淨）+ 停在 default news（= 直接點 admission 的樣子）
    if (hasDeepLink) history.replaceState(history.state, '', window.location.pathname);
    switchSection('news', false, true);
  }
}
