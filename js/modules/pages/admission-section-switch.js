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
import { registerPageExit } from '../ui/page-exit.js';
import { waitForHeroAnimDone } from './hero-animation.js';
import { DUR, EASE } from '../ui/motion.js';
import { scrollWindowNoSnap } from '../ui/snap-scroll.js';

// 當前 active section 的色（setActiveNavBtn 回傳）；給 deep-link highlight 用（= 該 section 色，三原色之一）
let currentSectionColor = '';

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
  //   item 對齊 box 頂；scroller-relative = rect 差 + scrollTop），捲完 flash+open。手機/窄走原 window 路徑。
  const scroller = /** @type {HTMLElement | null} */ ((window.innerWidth >= 768) ? target.closest('.inner-scroll-scroll-col') : null);
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
  // 桌面 inner-scroll：右欄 box 回頂（切 section 讓新 panel 從頭顯示）；手機無 scroll-col（window 捲）。
  const scroller = /** @type {HTMLElement | null} */ ((window.innerWidth >= 768) ? el.querySelector('.inner-scroll-scroll-col') : null);
  if (scroller) scroller.scrollTop = 0;
  const top = el.getBoundingClientRect().top + window.scrollY;
  // smooth 程式捲動關 mandatory snap（否則被 snap 搶、落點錯，同 deep-link item 路徑）；instant 不需 tween。
  if (behavior === 'smooth') scrollWindowNoSnap(top);
  else window.scrollTo({ top, behavior });
}

// ── 左側 section nav 進場/退場（比照 faculty/activities nav，user 2026-06-07）──
// clip-path 套在 .anchor-nav-inner 自身（旋轉角不裁、原地揭露）、4 方向隨機、DUR.base + cubic-bezier + stagger；
// 進場只在 content section 進視窗時跑一次（不重播切分頁）；退場離頁且 navRevealed 才跑、fromTo 顯式起點、from:'end'。
// transition:'none' 解 .anchor-nav-inner 的 navigation.css `transition: all`（含 clip-path）對 GSAP 每幀寫的接管（卡頓），跑完還原。
const NAV_CLIP_DIRS = ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 100% 0% 0%)'];
function pickNavClip() { return NAV_CLIP_DIRS[Math.floor(Math.random() * NAV_CLIP_DIRS.length)]; }
const NAV_REVEALED_CLIP = 'inset(0% 0% 0% 0%)';
const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';

function setupSectionNavReveal() {
  if (typeof gsap === 'undefined') return;
  const inners = Array.from(document.querySelectorAll('.activities-section-btn .anchor-nav-inner'));
  if (!inners.length) return;
  let navRevealed = false;
  inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; gsap.set(inner, { clipPath: pickNavClip() }); });

  const play = () => {
    if (navRevealed) return;
    navRevealed = true;
    gsap.to(inners, {
      clipPath: NAV_REVEALED_CLIP, duration: DUR.base, ease: NAV_EASE, stagger: 0.02, clearProps: 'clipPath',
      onComplete: () => inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = ''; }),
    });
  };
  const section = document.getElementById('admission-content-section');
  const inView = section && section.getBoundingClientRect().top < window.innerHeight * 0.9;
  if (!section || inView || typeof ScrollTrigger === 'undefined') {
    play();
  } else {
    ScrollTrigger.create({ trigger: section, start: 'top 90%', once: true, onEnter: play });
  }

  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !navRevealed) { resolve(); return; }
    gsap.killTweensOf(inners);
    inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; });
    gsap.fromTo(inners,
      { clipPath: NAV_REVEALED_CLIP },
      { clipPath: () => pickNavClip(), duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.02, from: 'end' }, overwrite: true, onComplete: resolve });
  }));
}

// fromUserNav：true=使用者點連結的 SPA 導航（首頁 floating camp 海報）；false=初始載入 / refresh / 上一頁下一頁。
// 只有 fromUserNav 才套 ?section=/?item= deep-link 並跑導航動畫；refresh 視為全新頁面（清 query、停 default news）。
export function initAdmissionSectionSwitch(fromUserNav = false) {
  const btns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.activities-section-btn'));
  if (!btns.length) return;

  // 離頁退場：當前可見 panel 反向退場（先收起展開的 accordion，再 rows yPercent 沉出）。
  // 用的是 playAdmissionPanelReveal 的反向同一支 playAdmissionPanelExit（in-page 切換 + 離頁共用），
  // 與 activities 的 playActivitiesExit 同 pattern。router 換頁前 await；registerPageExit 跑完自動清空不洩漏。
  registerPageExit(() => {
    const panel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
    return panel ? playAdmissionPanelExit(panel) : Promise.resolve();
  });

  // 左側 section nav clip-path 進場（section 進視窗 once）+ 離頁退場，比照 faculty/activities nav
  setupSectionNavReveal();

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
