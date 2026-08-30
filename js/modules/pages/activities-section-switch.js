/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadExhibitionsInto, loadGeneralActivitiesInto, loadLecturesInto, loadIndustryInto, loadWorkshopsInto, loadSummerCampInto, loadVisitsInto, prefetchExhibitionsData } from './activities-data-loader.js';
import { resetActivitiesFetchCache } from './activities-source.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { applyMarqueeOverflow, bindMarqueeReturn } from '../ui/marquee-overflow.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initListAccordion, resetListAccordionsInPanel, alignWithBottomSpacer } from '../accordions/list-accordion.js';
import { reapplySearch } from '../ui/activities-search.js';
import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';
import { playAdmissionPanelExit, playAdmissionPanelReveal, setupAdmissionReveal } from './admission-data-loader.js';
import { playClipReveal, navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { waitForHeroAnimDone } from './hero-animation.js';
import { DUR, EASE } from '../ui/motion.js';
import { scrollWindowNoSnap } from '../ui/snap-scroll.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};
// 防連點：exit/reveal 動畫期間 swallow 重複觸發
let switching = false;

// box 是否「真的是捲動容器」：矮橫向 landscape gate 把 activities 的 100vh frame 拆掉（overflow 改 visible、
// window 捲），但 class 還在 → 看 computed overflow-y 不看寬度（同 list-accordion getScrollableBox / admission）。
// el 可以是 box 自身或其後代（closest 對自身也命中）；null-safe。
/** @param {Element | null} el */
function getScrollableScrollCol(el) {
  const box = /** @type {HTMLElement | null} */ (el && el.closest('.inner-scroll-scroll-col'));
  if (!box) return null;
  const oy = getComputedStyle(box).overflowY;
  return (oy === 'auto' || oy === 'scroll') ? box : null;
}

// 捲到 section：落點讓 sticky filter bar 剛好停在它自己的 sticky-top（桌面 200），list 緊接其下不被蓋住。
// ⚠️ 不能只把 section 頂對齊 viewport 0（user 2026-06-06「pt 頂到時第一個 list 被切掉 ~8px」）：
//   section padding-top（md:py-6xl=192）< filter bar sticky-top（md:top-[200px]=200）。對齊 0 時 filter bar
//   自然位置(192)在 sticky 線(200)之上 → 被釘在 200、相對自然位置往下位移 8px → 它的 bg-white z-10 蓋住第一筆
//   list 頂 ~8px。改用「filter bar 落在 sticky-top」反推：scrollY = sectionTopDoc + padTop − stickyTop，
//   filter bar 自然位置剛好落在 200（不位移、不蓋）→ section 頂落在 viewport +8（= 200−192，即「再下面一點」）。
// ⚠️ 仍從「非 sticky 的 section 絕對位置」算（sectionTopDoc = rect.top+scrollY，捲到哪都同一值 → 每次點 nav
//   對齊點一致）+ padTop / stickyTop 讀 computed 值（CSS 靜態，非 rect）。**絕不量 filter bar 自身
//   getBoundingClientRect**：pinned 時 rect.top 被 clamp → target 退化成 no-op（捲進 list 後點別 nav 不動）。
// section min-height:100vh 保證短 panel 也捲得到位。
// instant + 下一幀 re-assert：分頁切換時 panel reveal 建 ScrollTrigger→refresh 可能在 instant 後把 scroll
//   移走；用同基準重新 assert 一次蓋回去（idempotent，已就位則 no-op）。
/**
 * @param {HTMLElement | null} el
 * @param {'instant' | 'smooth'} [behavior]
 */
function scrollSectionIntoView(el, behavior = 'instant') {
  if (!el) return;
  // 桌面 inner-scroll（2026-06-29）：捲動在右欄 .activities-scroll-col、section 是固定 frame。「回到 section 頂」＝
  //   window 停在 section（frame 填滿視窗，給 deep-link 從 hero 下來用）+ scroll-col.scrollTop=0（顯示 panel 頂）。
  //   手機（<768）與矮橫向拆 frame（box overflow 被 gate 改 visible）→ 走下面原 window 落點邏輯。
  const scroller = getScrollableScrollCol(el.querySelector('.activities-scroll-col'));
  if (scroller) {
    const sectionTopDoc = el.getBoundingClientRect().top + window.scrollY;
    if (behavior === 'smooth') {
      scrollWindowNoSnap(sectionTopDoc, { duration: DUR.medium, ease: EASE.move });
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: sectionTopDoc, behavior: 'instant' });
      scroller.scrollTop = 0;
      requestAnimationFrame(() => { window.scrollTo({ top: sectionTopDoc, behavior: 'instant' }); scroller.scrollTop = 0; });
    }
    return;
  }
  const filterBar = /** @type {HTMLElement | null} */ (el.querySelector('.activities-panel:not(.hidden) .activities-filter-bar'));
  const navCol = /** @type {HTMLElement | null} */ (el.querySelector('.activities-nav-col'));
  const y = () => {
    const sectionTopDoc = el.getBoundingClientRect().top + window.scrollY;
    // 手機直向 sticky 疊層（2026-07-13）：filter bar 也 sticky 了，不能落入下面桌面公式
    // （stickyTop 202 → 落點高出 section 122px = hero 露出，user 07-13 截圖）。落點改錨 nav strip：
    // nav 自然位置剛好停在自己釘點（88）＝ section 頂在 viewport +8，殘餘 8px hero 由 nav ::before 遮。
    if (window.innerWidth < 768 && navCol && getComputedStyle(navCol).position === 'sticky') {
      const navTop = parseFloat(getComputedStyle(navCol).top) || 88;
      const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      return Math.max(0, sectionTopDoc + padTop - navTop);
    }
    // 桌面：sticky filter bar → 落點讓它停在自己的 sticky-top（不位移、不蓋 list）。
    if (filterBar && getComputedStyle(filterBar).position === 'sticky') {
      const stickyTop = parseFloat(getComputedStyle(filterBar).top) || 200;
      const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      return Math.max(0, sectionTopDoc + padTop - stickyTop);
    }
    // 手機 / 無 sticky filter bar（library）：對齊 section 頂（無 filter bar 蓋住問題，padding 自理間距）。
    return Math.max(0, sectionTopDoc);
  };
  // smooth（deep-link 無 item 用，無併發 reveal 干擾）：GSAP scrollTo
  // 手機時長依距離換算（同 navigateToItem smooth：固定 0.5s 捲過 >1 視窗高像「跳下去」）
  if (behavior === 'smooth' && typeof gsap !== 'undefined' && typeof window.ScrollToPlugin !== 'undefined') {
    const targetY = y();
    const dist = Math.abs(targetY - window.scrollY);
    const dur = window.innerWidth < 768 ? Math.min(1.1, Math.max(DUR.medium, dist / 1200)) : DUR.medium;
    // 捲動全程關 mandatory snap（否則從 footer snap 點起步會 onEnterBack↔onLeave 無限抖動卡住）→ 共用 scrollWindowNoSnap。
    scrollWindowNoSnap(targetY, { duration: dur, ease: EASE.move });
    return;
  }
  // instant（分頁切換）
  window.scrollTo({ top: y(), behavior: 'instant' });
  requestAnimationFrame(() => window.scrollTo({ top: y(), behavior: 'instant' }));
}

let currentSectionColor = '';

// 初載 reveal 時機：舊版固定 double-rAF 賭「兩幀後 DOM 就定案」——慢機 / webfont 晚 swap / Directus 資料
// 晚到重排時兩幀不夠，部分 year-group 的 row 還沒進 DOM → playAdmissionPanelReveal 快照抓不到 → tween 沒建 →
// 卡 yPercent:100 留白（user 報「list 沒載滿、下方預留空白」）。改成「等 .list-reveal-row 數連兩幀不變」才揭，
// 讓晚到的 row 也進同一條 timeline、每列都有進場動畫。封頂 60 幀（~1s）免極端情況空等。
function revealWhenListRowsSettled(panel, run) {
  let last = -1, stable = 0, frames = 0;
  const tick = () => {
    const n = panel.querySelectorAll('.list-reveal-row').length;
    stable = n === last ? stable + 1 : 0;
    last = n;
    if ((n > 0 && stable >= 2) || ++frames > 60) run();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// 等指定 list-item 的進場 reveal 完成（reveal 的 onComplete/onEnter 會移除 data-pre-reveal，見 admission-data-loader
// unlockGroup / activities-data-loader 的 ScrollTrigger）。給 ref/deep-link 導航用：確保「list 文字 reveal 出現後」
// 才 highlight，不在 rows 還 clip-reveal 中途就先亮（user 2026-06-09）。
// 已無 data-pre-reveal（已 reveal / alwaysExpanded）→ 立即 resolve；timeout 為保險，reveal 萬一沒正常完成也不卡住。
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

// 手機 section nav 水平 strip：把指定 section 的 btn 捲到 strip 中間（click / ref / deep-link 三條路徑共用；
// user 2026-07-03）。桌面 vertical sticky 不需要。btn 位置是靜態 layout，隨時可量；smooth 水平捲與垂直捲動互不干擾。
function centerSectionNavBtn(section) {
  // 矮橫向 bar 也是水平 strip（landscape.css 5f 單行 scroll）→ 同樣要置中；真桌面 vertical sticky 不需要
  if (window.innerWidth >= 768
    && !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return;
  const btn = /** @type {HTMLElement | null} */ (document.querySelector(`.activities-section-btn[data-section="${section}"]`));
  const bar = /** @type {HTMLElement | null} */ (btn && btn.closest('.activities-section-bar'));
  if (!btn || !bar) return;
  const barRect = bar.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const delta = (btnRect.left + btnRect.width / 2) - (barRect.left + barRect.width / 2);
  bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
}

// 從外部（如 industry reference 按鈕 / 首頁 floating 活動海報 deep-link）導航到指定 section 的指定 item
// smooth=true（首頁 deep-link 用）：平滑捲到 item、捲到位後 delay 才展開 accordion（對齊 curriculum 節奏）；
// smooth=false（預設，ref 按鈕等頁內跳轉）：instant 跳到位後立即 flash + 展開（維持原行為）
export async function navigateToItem(section, itemId, { smooth = false } = {}) {
  const btns = document.querySelectorAll('.activities-section-btn');
  await switchToSection(section, btns, false);
  // ref/deep-link 不經 nav btn click handler → strip 置中在此補（否則切到別的 section 後往上捲回 strip，
  // active btn 停在畫面外，user 2026-07-03 截圖）
  centerSectionNavBtn(section);
  if (!itemId) return;

  // 等 fetch + DOM render 完成後再 scroll。
  await new Promise(r => setTimeout(r, 150));
  await new Promise(r => requestAnimationFrame(r));

  // Directus 慢時 panel 可能還沒 render 完：navigateToItem 開頭的 await switchToSection 會被 switching guard
  // 短路（deep-link 時 init 那次 switch 還在跑、switching===true）→ 不真的等載入；加上 deep-link hero wait 封頂
  // 0.9s 縮短緩衝 → 單次 getElementById 常撈不到 target → 舊版直接 return = 永遠卡在 hero（user 2026-06-28）。
  // 改短輪詢等 target 出現（最多 ~3s）；撈不到（item 不存在 / 無 media 被濾掉 / id 對不上）就退而捲到 section、別卡 hero。
  let target = document.getElementById(`item-${itemId}`);
  for (let i = 0; i < 30 && !target; i++) {
    await new Promise(r => setTimeout(r, 100));
    target = document.getElementById(`item-${itemId}`);
  }
  if (!target) {
    const sectionEl = document.getElementById('activities-content-section');
    if (sectionEl) scrollSectionIntoView(sectionEl, smooth ? 'smooth' : 'instant');
    return;
  }

  // 若 target 在 sub-tab 隱藏的 list container（exhibitions 的 permanent / visits 的 inbound 等），先切到對應 sub-tab
  const subListContainer = target.closest('#exhibitions-list-special, #exhibitions-list-permanent, #visits-list-outbound, #visits-list-inbound');
  if (subListContainer && subListContainer instanceof HTMLElement && subListContainer.style.display === 'none') {
    const subTabMap = {
      'exhibitions-list-special':   '#exhibitions-type-filter [data-type="special"]',
      'exhibitions-list-permanent': '#exhibitions-type-filter [data-type="permanent"]',
      'visits-list-outbound':       '#visits-type-filter [data-type="outbound"]',
      'visits-list-inbound':        '#visits-type-filter [data-type="inbound"]',
    };
    const tabBtnSelector = subTabMap[subListContainer.id];
    if (tabBtnSelector) {
      const tabBtn = /** @type {HTMLElement | null} */ (document.querySelector(tabBtnSelector));
      // 抑制 sub-filter 自帶的「instant 捲回 section 頂」（會跟下面的平滑捲動打架＝跳一下），
      // 並等整段 exit→swap→reveal 啟動完成（subFilterSwitching 歸 false）才往下量位置——
      // 原本只等 100ms，exit 0.5s 還沒換 display，finalTop 量到舊 layout（user 2026-06-12）
      suppressSubFilterScroll = true;
      tabBtn?.click();
      for (let i = 0; i < 60 && subFilterSwitching; i++) {
        await new Promise(r => setTimeout(r, 50));
      }
      suppressSubFilterScroll = false;
    }
  }

  // 若 year group 是收合的，先展開
  const yearItems = /** @type {HTMLElement | null} */ (target.closest('.list-year-items'));
  if (yearItems && (yearItems.style.height === '0px' || yearItems.style.display === 'none')) {
    const yearGrid = yearItems.closest('.grid-12');
    const yearToggle = /** @type {HTMLElement | null} */ (yearGrid?.querySelector('.list-year-toggle'));
    if (yearToggle) {
      yearToggle.click();
      // 等 accordion 展開動畫完成（transition 通常 300ms）
      await new Promise(r => setTimeout(r, 350));
    }
  }

  // 桌面 inner-scroll（Phase 6，2026-07-03）：item 在右欄 box 內捲、window 只有 hero/section/footer 三個落點。
  // 舊 window 單段在此 layout 下 targetTop 加 window scroll 無意義 + clampBelowFooter 永遠夾回 section 頂
  // → 較下方 item「沒捲到就開」（同 curriculum deep-link 同日修的 bug）。
  // 兩段式：window 到 section 頂後，item 對齊**交給 proceedOpen 的 box 機制**（不設 skipOpenScroll：
  // gsap 捲 scroller 對齊 pin 線 + 短 list spacer 結構保證 + 自動收 search bar，全沿用、不在此重算）。
  const boxScroller = getScrollableScrollCol(target);
  if (boxScroller) {
    const sectionEl = document.getElementById('activities-content-section');
    const sectionTopDoc = sectionEl ? sectionEl.getBoundingClientRect().top + window.scrollY : 0;
    const boxFlashColor = currentSectionColor || '#00FF80';
    const openViaAccordion = () => {
      const header = /** @type {HTMLElement | null} */ (target.querySelector('.list-header'));
      if (header && !header.classList.contains('active')) {
        header.dataset.accentHex = boxFlashColor;  // 開啟即帶 section 色（= highlight，同 smooth 路徑慣例）
        header.style.background = boxFlashColor;
        header.click();  // 不設 skipOpenScroll → proceedOpen 捲 box 精準對齊
      }
    };
    if (smooth) {
      // 首頁 deep-link：window 平滑捲到 section（frame 填滿視窗）→ proceedOpen box 對齊 + 展開同時跑
      await waitForItemRevealed(target);
      scrollWindowNoSnap(sectionTopDoc, { onComplete: openViaAccordion });
    } else {
      // ref 按鈕：instant 跳（維持原「直接看到 target 就位」節奏）——window 直落 section、box 直跳 item
      // 附近（flash 要看得到；瀏覽器自 clamp maxScroll，短 list 夾短沒關係、開啟時 proceedOpen 會補正）
      window.scrollTo({ top: sectionTopDoc, behavior: 'instant' });
      const stickyContainerEl = /** @type {HTMLElement | null} */ (target.closest('[style*="--list-header-sticky-top"]'));
      const stickyTopVal = stickyContainerEl ? parseFloat(getComputedStyle(stickyContainerEl).getPropertyValue('--list-header-sticky-top')) : NaN;
      const itemInBox = target.getBoundingClientRect().top - boxScroller.getBoundingClientRect().top + boxScroller.scrollTop;
      boxScroller.scrollTop = Math.max(0, Math.round(itemInBox - (Number.isNaN(stickyTopVal) ? 0 : stickyTopVal)));
      await waitForItemRevealed(target);
      target.style.transition = 'background 0.3s';
      target.style.background = boxFlashColor;
      setTimeout(() => {
        target.style.background = '';
        target.style.transition = '';  // 清掉：殘留 transition 會被 mode-color [style*="background"] 規則誤判（同下方註解）
        openViaAccordion();
      }, 600);
    }
    return;
  }

  // 計算目標位置：item 落在「sticky filter bar 底部 + 16px」→ 不被釘住的 filter bar 蓋住。
  // sticky-top 跟 scrollSectionIntoView 一樣讀實際 computed 值（filter bar 的 md:top-[200px]）不寫死 200，
  // 兩個 scroll path 對齊基準同步、日後改 sticky-top 也不 drift。
  // 手機：filter bar 非 sticky（會捲走，不該算進落點），落點直接用釘點 8rem —— 跟 list-accordion
  // getListStickyTop 的手機值同步，deep-link 落點＝手動開啟落點＝CSS 釘點（桌面舊 fallback 200 落點
  // 比釘點低 ~200px，捲動時 title 還要滑一大段才釘住，user 2026-06-12）。
  const panel      = document.getElementById(`panel-${section}`);
  const filterBar  = /** @type {HTMLElement | null} */ (panel?.querySelector('.activities-filter-bar'));

  // 量位置「前」先把 search bar 收掉並等 transition + ResizeObserver 更新完（桌面+手機都要，user 2026-06-28）。
  // 原因：compensate 讀 --list-header-sticky-top = 200+filterBar.offsetHeight-1（含 search bar 80px）；但
  //   list-accordion proceedOpen 開啟時無條件 add bar-hidden（list-accordion.js:461）→ .activities-search-inner
  //   max-height 80→0（lists.css:587，非手機限定）→ filterBar 縮 ~80px → ResizeObserver 把 --list-header-sticky-top
  //   降 ~80 → 「開啟後的真實釘點」比量到的高 ~80px。先收→等 var 更新→量 compensate→捲 = 落地點＝開啟釘點、開啟零位移。
  // （桌面原本誤以為「bar 是 sticky、proceedOpen 不變式已處理」而不收 → deep-link 落點與手動點開差 ~80px。）
  if (filterBar && !filterBar.classList.contains('bar-hidden')) {
    filterBar.classList.add('bar-hidden');
    await new Promise(r => setTimeout(r, 350)); // CSS 0.3s transition 收完 + ResizeObserver 更新 var 才量
  }

  // 落點＝list-accordion 開啟時 header 釘的位置：桌面讀 `--list-header-sticky-top`（activities-data-loader
  // updateStickyTop 設為 200+filterBarH-1，= getListStickyTop 桌面值），保證「deep-link 落點＝手動點開落點」零跳動。
  // 之前用 `stickyTop+filterBarH+16` 比釘點低 17px → title「稍微往下」、開啟時 header 不貼釘線（user 2026-06-25）。
  // 手機：8rem（= getListStickyTop 手機值 / lists.css `.list-header.active{top:6rem}`... 實為 8rem 清 logo）。
  const stickyContainer = /** @type {HTMLElement | null} */ (target.closest('[style*="--list-header-sticky-top"]'));
  // ≥768 走到這裡＝矮橫向拆 frame（box 不可捲；有 frame 時上面 boxScroller 路徑已 return）→ 釘點 96
  //   （= landscape.css `.list-header.active top:96` = list-accordion getListStickyTop 拆-frame 分支，三處同步）。
  // 手機直向（2026-07-13 sticky 疊層）：釘點改讀 --list-header-sticky-top（= filter bar 正下方，
  // updateStickyTop 設；量測前已收 bar + 等 RO 更新 → 值是收合態）；未設（矮橫向 <768）fallback 8rem。
  const compensate = window.innerWidth < 768
    ? ((stickyContainer ? parseFloat(getComputedStyle(stickyContainer).getPropertyValue('--list-header-sticky-top')) : NaN)
      || 8 * parseFloat(getComputedStyle(document.documentElement).fontSize))
    : (target.closest('.inner-scroll-scroll-col')
      ? 96
      : (stickyContainer ? (parseFloat(getComputedStyle(stickyContainer).getPropertyValue('--list-header-sticky-top')) || 200) : 200));

  // 文件相對 top 直接量 getBoundingClientRect().top + scrollY（scroll 無關）：比 offsetTop 沿 offsetParent
  // 鏈累加可靠——深層巢狀 item（年份組內）鏈長、每層 sub-pixel rounding 累積 → 落點「稍微往下」偏移
  // （user 2026-06-25 報「有的正確有的稍微往下」）；target 是 list-item 非 sticky bar，rect.top 不被 pin clamp。
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  // finalTop（收合態量測、不傳 growPx）：ref instant 跳與 smooth deep-link 共用（2026-07-04 起 smooth 也改
  // 兩段式「捲到位才展開」）——捲動當下 content 還收合、footer 在收合位置，**不能**用展開後位置算否則先閃 footer。
  // alignWithBottomSpacer：短清單被 footer clamp 夾短時補底部 spacer 直達 pin 線 → ref 落點＝手動打開落點、
  // 上方不露 nav strip（user 2026-07-03；收合態量測 spacer 只會偏大＝更安全，600ms 後展開 footer 只會更遠）。
  const finalTop = alignWithBottomSpacer(target, targetTop - compensate);

  // flash highlight + 展開 item accordion 的共用收尾。
  // ⚠️ 先 await 目標 list-item reveal 完成（data-pre-reveal 移除）才 highlight：ref/deep-link 切過去時 list rows
  //    還在 clip-reveal（文字沒出現）就 flash＝highlight 比文字早出現（user 2026-06-09 報「不對」）。
  //    順序固定為 list 文字 render → highlight → 600ms → 展開。
  const flashColor = currentSectionColor || '#00FF80';
  const flashThenOpenAccordion = async () => {
    await waitForItemRevealed(target);
    target.style.transition = 'background 0.3s';
    target.style.background = flashColor;
    setTimeout(() => {
      target.style.background = '';
      // transition 也要清：留著 `transition: background` 會被 [style*="background"] 的 mode-color 翻譯規則
      // 誤判此 item「仍有底色」→ 收合後永久翻成 theme-fg 白底（user 2026-06-24 報「hover 離開又變白」）。
      target.style.transition = '';
      const header = /** @type {HTMLElement | null} */ (target.querySelector('.list-header'));
      if (header && !header.classList.contains('active')) {
        // 上面已 scroll 對齊好 item → 標記讓 accordion open 時不要再自己 scroll（否則對齊跑掉，user 2026-06-05）
        header.dataset.skipOpenScroll = '1';
        // highlight 色（= section 色，三原色之一）繼承成 accordion 打開後的 active 色（user 2026-06-09）：
        // 設 dataset.accentHex → list-accordion proceedOpen 走 `self.dataset.accentHex || getRandomAccentColor()`
        // 會用這個色而非挑隨機，ACCENT_TO_DEEP 也對得上拿到對應 deep ref 色。
        header.dataset.accentHex = flashColor;
        header.style.background = flashColor;
        header.click();
      }
    }, 600);
  };

  if (smooth) {
    // 首頁 deep-link（已等 hero 跑完）：兩段式對齊桌面 inner-scroll（user 2026-07-04）——先以「關閉的清單」
    // 平滑捲到落點、到位才展開。取代 2026-06-28「捲動與展開同時跑」：當時同時跑是為了避免「捲到位才展開」
    // 先閃 footer，但 alignWithBottomSpacer（2026-07-03）已用底部 spacer 結構保證收合態落點存在、不被
    // maxScroll clamp 到 footer → 兩段式安全。落點沿用上方 finalTop（收合態量測 + spacer，同 ref instant 路徑；
    // 展開向下推、header 留在 pin 線，落點不因展開位移）。
    // 手機時長依距離換算（固定 0.5s 在手機捲距 >1 視窗高看起來「跳下去」不像滑，user 2026-06-12）；clamp 0.5~1.1s、桌面 0.5s。
    const dist = Math.abs(finalTop - window.scrollY);
    const scrollDur = window.innerWidth < 768 ? Math.min(1.1, Math.max(DUR.medium, dist / 1200)) : DUR.medium;
    await waitForItemRevealed(target);  // 確保 list 文字已 reveal（deep-link init 已清 pre-reveal → 立即 resolve）
    // 捲動全程關 mandatory snap。到位才展開：skipOpenScroll 讓 proceedOpen 只展開不再自己捲（已在落點）；
    // accentHex/bg 設成 section 色 → 開啟即帶 highlight 色（同桌面 openViaAccordion，無獨立 600ms flash）。
    scrollWindowNoSnap(finalTop, { duration: scrollDur, ease: EASE.enterSoft, onComplete: () => {
      const header = /** @type {HTMLElement | null} */ (target.querySelector('.list-header'));
      if (header && !header.classList.contains('active')) {
        header.dataset.skipOpenScroll = '1';
        header.dataset.accentHex = flashColor;
        header.style.background = flashColor;
        header.click();
      }
    } });
  } else {
    // ref 按鈕等頁內跳轉：用 instant 跳到位（smooth 會經過 hero 區造成「先回 hero 再展開」視覺），
    // 切 panel 後 user 期待直接看到 target list 就位 → 立即 flash + 展開
    window.scrollTo({ top: finalTop, behavior: 'instant' });
    flashThenOpenAccordion();
  }
}

/**
 * 離頁退場：對當前可見 panel 跑 playAdmissionPanelExit
 * — 該函式已內建「先收 accordion → 再 rows fade-out」兩階段，這裡只需 forward。
 *
 * 回到此頁不需特別處理：router 換頁時 main.innerHTML 整段被新 HTML 替換 +
 * initActivitiesSectionSwitch 開頭 reset loaded[]，DOM 與資料都是全新的，
 * 自動「不記住之前打開的 list」。
 */
async function playActivitiesExit() {
  const panel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
  if (!panel) return;
  // 三者並行退場（router runPageExit 會 await 整個 Promise.all 才換頁）：
  //   ① playAdmissionPanelExit：list rows（含 sticky filter bar 內的 search-inner，是 .list-reveal-row）yPercent 滑出
  //   ② playFilterChipsExit：sub-filter chip 各自 clip-path 收掉（**chip 自身**，不裁旋轉角）
  // ⚠️ 不再 clip 整個 .activities-filter-bar（父容器）—— 那會把裡面旋轉 chip 的角一起裁掉
  //    （user 2026-06-07 回報「出場動畫加在父容器、chip 被 crop」）。改成跟 curriculum 灰卡一樣每個 chip 自己做。
  await Promise.all([
    playAdmissionPanelExit(panel),
    playFilterChipsExit(panel),
  ]);
}

// ── Filter chip 進場：chip 自己做 hero 式 clip-reveal（translate＋同步 clip 滑動揭露 .anchor-nav-inner 本體）──
// 不靠父容器 overflow:clip wrapper（原本 #*-type-filter 是 .list-reveal-row + .courses-filter-btn
// → setupClipReveal 把整列包進 overflow:clip wrapper，旋轉 chip 角被 wrapper 裁掉、reveal 完才 snap
// 成完整 chip，user 2026-06-07 回報「1s 先被 crop 再跳完整」）。
// translate＋clip 套在 .anchor-nav-inner（active chip 帶 rotate 的那層）：clip 先在元素 local box 裁、
// rotate 後才套 → chip 沿自身軸滑入、不被外層裁。方向固定「從下滑入」（hero 標準）。
// timing 跟 panel reveal 一致（initial 等捲到 / 切換立即）。
function filterChipInners(panel) {
  return panel ? panel.querySelectorAll('.activities-filter-bar .courses-filter-btn .anchor-nav-inner') : [];
}
// sub-tab chip 一律「純垂直」由下滑入：不用 navChipHidden 把位移向量轉到 chip 自身軸——active chip 帶隨機
// rotate(-4~6°) 時那個轉向會讓 reveal 變成斜的、從「左下角」進場（user 2026-07-17 只要單純從底部上來）。
// clip 仍走 bottom（底 inset 100%），translate 固定純 y。
function filterChipHidden(el) {
  return { clipPath: 'inset(0% 0% 100% 0%)', translate: `0px ${el.offsetHeight || 0}px` };
}
function hideFilterChips(panel) {
  if (typeof gsap === 'undefined' || prefersReducedMotion()) return;  // 減少動態：不隱藏 chip（維持靜態可見）
  const inners = filterChipInners(panel);
  // transition:'none'：.anchor-nav-inner 帶 navigation.css 的 `transition: all`（含 clip/translate）→ 直接 set
  // 會被 CSS transition 接管慢慢 hide，且後續 GSAP reveal 每幀寫入也被 transition 追著跑
  // （慢爬到一半再 snap，user 2026-06-07 看到的怪）。reveal 全程關 transition、結束 clearProps 還原。
  inners.forEach(el => gsap.set(el, { transition: 'none', ...filterChipHidden(el) }));  // 藏在下 → 純垂直從下滑入
}
let _chipRevealSTs = [];
// 子 tab chip 是否被「捲離 section」clip 收起（2026-07-13，比照 nav btn 的 scroll hide/reveal）：
// true 時離頁 playFilterChipsExit 不再重播（fromTo(0→100) 會先閃現一幀）；任何 reveal 路徑歸 false。
let chipsScrollHidden = false;
function playFilterChipsReveal(panel, { useScrollTrigger = false } = {}) {
  if (typeof gsap === 'undefined') return;
  chipsScrollHidden = false;
  const inners = filterChipInners(panel);
  if (!inners.length) return;
  // 減少動態：chip 直接全顯，不滑入
  if (prefersReducedMotion()) { gsap.set(inners, { clearProps: 'clipPath,transition' }); return; }
  // 殺掉上一輪殘留的 chip ScrollTrigger + 進行中 tween：initial reveal 建的 once trigger 若 filter bar 還在
  // fold 外沒 fire，之後切換 instant-scroll 把它捲進視窗才 fire → 跟切換自己的 immediate reveal 打架，
  // 出現「慢慢爬到一半再 snap」。每次 reveal 前先清乾淨 → 單一 tween 乾淨跑完。
  _chipRevealSTs.forEach(st => st && st.kill());
  _chipRevealSTs = [];
  gsap.killTweensOf(inners);
  // transition:'none' 全程關掉（含 navigation.css 的 `transition: all` 對 clip/translate 的接管），
  // clearProps 在每個 chip tween 結束時還原 clip-path/translate(→全顯) + CSS transition。
  const play = () => {
    const els = Array.from(inners);
    const hid = els.map(el => filterChipHidden(el));
    gsap.set(els, { transition: 'none' });
    gsap.fromTo(els,
      { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate },
      { ...NAV_CHIP_SHOWN, duration: DUR.slow, ease: EASE.enter, stagger: 0.08, overwrite: true, clearProps: 'clipPath,transition,translate' });
  };
  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    const bar = panel.querySelector('.activities-filter-bar');
    _chipRevealSTs.push(ScrollTrigger.create({ trigger: bar || inners[0], start: 'top 90%', once: true, onEnter: play }));
  } else {
    play();
  }
}
// 離頁退場：sub-filter chip 各自 clip-path 收掉（reveal 的反向，套在 .anchor-nav-inner 本身 → 不裁旋轉角）。
// 回傳 Promise 給 playActivitiesExit 的 Promise.all await。transition:'none' 同 reveal 解 `transition:all` 衝突。
function playFilterChipsExit(panel) {
  if (typeof gsap === 'undefined') return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();  // 減少動態：不跑退場
  if (chipsScrollHidden) return Promise.resolve();  // 已被捲離 section 收起 → 重播 fromTo(0→100) 會先閃現一幀
  const inners = filterChipInners(panel);
  if (!inners.length) return Promise.resolve();
  _chipRevealSTs.forEach(st => st && st.kill());  // 殺殘留 reveal ST，免得退場時又 fire
  _chipRevealSTs = [];
  gsap.killTweensOf(inners);
  return new Promise(resolve => {
    const els = Array.from(inners);
    const hid = els.map(el => filterChipHidden(el));
    gsap.set(els, { transition: 'none' });
    // SHOWN→藏在下：向下滑出（reveal「從下滑入」的反向）；離頁後 element 隨 swap 銷毀不需還原
    gsap.fromTo(els,
      { ...NAV_CHIP_SHOWN },
      { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: EASE.exit, stagger: 0.06, overwrite: true, onComplete: resolve });
  });
}

// ── 左側 section nav 進場/退場──────────────────────
// hero 式 clip-reveal＝translate（獨立屬性，與 inner 的 inline rotate 共存）＋同步 clip-path 滑動揭露
// （navChipHidden，見 scroll-animate.js；旋轉角不裁、不疊鄰）、DUR.base + cubic-bezier(0.25,0,0,1) + stagger。
// ⚠️ activities 專屬用「4 方向隨機」（user 2026-07-17，每顆固定一方向 navDir）；其他頁（faculty/admission/
//    courses 等）2026-07-17 統一 'bottom' 由下而上 → 本頁與它們刻意分歧，勿一起改回。
// 進場只在頁面初次載入（content section 進視窗）跑一次、
// 切左側分頁不重播；退場只在離頁且「已進場」才跑（沒滑到沒看過不閃）、fromTo 顯式起點 SHOWN（clearProps 後
// computed=none 補不間）、from:'end' 反向 stagger。⚠️ .anchor-nav-inner 帶 navigation.css `transition: all`（含 clip/translate）
// → 動畫期間 inner.style.transition='none' 免 CSS transition 追 GSAP 卡頓，跑完還原（hover/切分頁仍要那條 transition）。
const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';

function setupSectionNavReveal() {
  if (typeof gsap === 'undefined') return;
  if (prefersReducedMotion()) return;  // 減少動態：nav chip 不隱藏/不進退場，維持靜態可見
  const inners = Array.from(document.querySelectorAll('.activities-section-bar .activities-section-btn .anchor-nav-inner'));
  if (!inners.length) return;
  let navRevealed = false;
  const killTransition = () => inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = 'none'; });
  killTransition();
  // activities 專屬：每顆固定一個隨機方向（reveal/hide 來回一致），其他頁統一 'bottom'（user 2026-07-17
  // 「activities 弄成 4 方向隨機」）。px 向量依當下寬高/角度、每次要藏重算（勿 cache）。
  const navDir = new Map(inners.map(inner => [inner, pickNavDir(inner)]));
  inners.forEach(inner => gsap.set(inner, navChipHidden(inner, navDir.get(inner))));

  // 矮橫向：nav 進 header fixed（landscape.css 5f，2026-07-10 比照 admission 5e）、hero 也浮著 →
  // 「hero 之後才 reveal、回 hero 出場隱藏」＝嚴格 hero gate（觀察 hero 本體底緣離開視窗頂 −8px；
  // 同 admission setNav，clip-path 非 opacity）。fixed nav 被 clip 掉時 btn 外框仍在 → pointer-events 一併切。
  const sectionEl = document.getElementById('activities-content-section');
  const isLandscapeGate = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  if (isLandscapeGate && 'IntersectionObserver' in window && sectionEl) {
    const navCol = /** @type {HTMLElement|null} */ (sectionEl.querySelector('.inner-scroll-nav-col'));
    if (navCol) navCol.style.pointerEvents = 'none';
    const setNav = (reveal) => {
      if (navRevealed === reveal) return;
      navRevealed = reveal;
      gsap.killTweensOf(inners);
      killTransition();
      if (navCol) navCol.style.pointerEvents = reveal ? '' : 'none';
      const hid = reveal ? null : inners.map(inner => navChipHidden(inner, navDir.get(inner)));
      gsap.to(inners, {
        clipPath: reveal ? NAV_CHIP_SHOWN.clipPath : (i) => hid[i].clipPath,
        translate: reveal ? NAV_CHIP_SHOWN.translate : (i) => hid[i].translate,
        duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true,
        onComplete: () => { if (reveal) inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = ''; }); },
      });
    };
    // 兩顆 IO 各記 flag 統一 apply（各自 toggle 會被初始 delivery 順序互蓋，同 admission/about 的坑）
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
    // SPA 離頁退場（同下方非 gate 版）
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined' || !navRevealed) { resolve(); return; }
      gsap.killTweensOf(inners);
      killTransition();
      const hid = inners.map(inner => navChipHidden(inner, navDir.get(inner)));
      gsap.fromTo(inners,
        { ...NAV_CHIP_SHOWN },
        { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true, onComplete: resolve });
    }));
    return;
  }

  // reveal/hide 可被 scroll 反覆觸發：捲離 main section→退場、捲回 main→重播進場（user 2026-06-27）。
  // navRevealed 旗標擋同態重播；hide 用 fromTo 顯式起點 SHOWN（clearProps 後 computed=none，GSAP 補不間）。
  // 子 tab chip 一併進出（user 2026-07-13「離開 main section 時也 clip 收起」）：hide 走 playFilterChipsExit
  // （chip 自身 clip、不裁旋轉角）後標 chipsScrollHidden；reveal 只在被 scroll 收過才補播
  // （初載/切分頁的 chip reveal 由 switchToSection 路徑負責，不雙播）。
  const visiblePanel = () => /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
  const reveal = () => {
    if (navRevealed) return;
    navRevealed = true;
    gsap.killTweensOf(inners);
    killTransition();
    gsap.to(inners, {
      ...NAV_CHIP_SHOWN, duration: DUR.base, ease: NAV_EASE, stagger: 0.02, overwrite: true, clearProps: 'clipPath,translate',
      onComplete: () => inners.forEach(inner => { /** @type {HTMLElement} */ (inner).style.transition = ''; }),
    });
    const panel = visiblePanel();
    if (panel && chipsScrollHidden) playFilterChipsReveal(panel);  // reveal 內部清 chipsScrollHidden
  };
  const hide = () => {
    if (!navRevealed) return;
    navRevealed = false;
    gsap.killTweensOf(inners);
    killTransition();
    const hid = inners.map(inner => navChipHidden(inner, navDir.get(inner)));
    gsap.fromTo(inners,
      { ...NAV_CHIP_SHOWN },
      { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.02, from: 'end' }, overwrite: true });
    const panel = visiblePanel();
    if (panel) {
      playFilterChipsExit(panel);   // chipsScrollHidden 此刻仍 false → 會跑；跑完標旗
      chipsScrollHidden = true;
    }
  };

  const section = document.getElementById('activities-content-section');
  if (!section || typeof ScrollTrigger === 'undefined') {
    reveal();
  } else {
    // trigger 在 #activities-content-section（#page-content 內）→ cleanupPageModules 換頁時一併 kill，不洩漏
    // enter/leave 兩向都接：捲到 footer 離開 main → hide；從 footer 回 main → reveal（hero 側同理）
    ScrollTrigger.create({
      trigger: section, start: 'top 90%', end: 'bottom 10%',
      onEnter: reveal, onLeave: hide, onLeaveBack: hide,
      // 從 footer 往上回到內容區：mandatory 下 accordion 撐高>1 屏時 section 變 oversized snap area，
      // 從下方只停在 section 底部（切掉上面 filter bar/年份/accordion 頂）→ JS 補一刀捲回頂端對齊點。
      // ⚠️ 只在 **mandatory** 下補（activities 2026-06-28 已改 snap-proximity）：proximity 不會把你困在底部、
      //    也不該在「使用者從 footer 往上捲想讀 list 下半」時硬把人拉回 section 頂（那會變成新的擾民跳動）。
      //    桌面 snap-only（手機無 snap）；reduced-motion 此函式已 early-return。
      // onEnterBack（從 footer 往上回到內容區）只重播 nav chip，**不補捲回 section 頂**（user 2026-06-29 拍板拿掉）。
      // 為何不補捲：#activities-content-section 是 oversized snap area（比視窗高），CSS Scroll Snap §5.2.2 本來就讓它整段
      //   可自由捲——從 footer 往上會先停在「section 底對齊視窗底」再自由往上讀，不會困在底部切掉上面。原本這段
      //   scrollSectionIntoView 補捲是為「舊的 mandatory 困頂假設」加的，§5.2.2 下多餘，且會在「從 footer 往上想讀 list
      //   下半」時硬把人彈回頂＝user 報的「往上捲回來卡頓 / 又把 section 移回去」。拿掉後讓 §5.2.2 自由捲 + 邊界
      //   （section 頂 / footer / hero）乾淨吸附。scrollSectionIntoView 仍用於 deep-link 無 item / sub-filter / tab 切換。
      onEnterBack: reveal,
    });
    // 初載已在視窗內：ScrollTrigger 不補 fire onEnter，手動播一次
    if (section.getBoundingClientRect().top < window.innerHeight * 0.9) reveal();
  }

  // SPA 離頁退場（與 scroll hide 同動畫，但 onComplete resolve 給 page-exit await）
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !navRevealed) { resolve(); return; }
    gsap.killTweensOf(inners);
    killTransition();
    const hid = inners.map(inner => navChipHidden(inner, navDir.get(inner)));
    gsap.fromTo(inners,
      { ...NAV_CHIP_SHOWN },
      { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.02, from: 'end' }, overwrite: true, onComplete: resolve });
  }));
}

// 桌面 inner-scroll box 幾何改純 CSS（2026-06-30 通用化，見 css/components/lists.css .inner-scroll-* class）：
// box 高度固定填滿 [header+pad, 100vh−pad]、頂部對齊 → 不再 JS 量 nav 寫 --activities-box-*（原 sizeContentBoxToNav 已移除）。

// 手機直向 sticky 疊層（2026-07-13，lists.css portrait 區塊配套）：nav strip 釘 88、filter bar 釘 nav 正下方。
// nav 實高（單行 strip，內容穩定）在此量一次設 --act-filter-top = navTop + navH − 1（1px 疊縫防 sub-pixel 透縫）；
// navTop 讀 computed（CSS 88 為單一來源）。ResizeObserver 跟著（字體 swap 後高度微變自癒）。
function initMobileStickyBars() {
  if (window.innerWidth >= 768 || !window.matchMedia('(orientation: portrait)').matches) return;
  const section = document.getElementById('activities-content-section');
  const navCol = /** @type {HTMLElement | null} */ (section && section.querySelector('.activities-nav-col'));
  if (!section || !navCol) return;
  const setTop = () => {
    const navTop = parseFloat(getComputedStyle(navCol).top) || 88;
    section.style.setProperty('--act-filter-top', Math.round(navTop + navCol.offsetHeight - 1) + 'px');
  };
  setTop();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(setTop);
    ro.observe(navCol);
    registerPageCleanup(() => ro.disconnect());
  }
}

// Issue 2 修（user 2026-06-30 選「mandatory + JS 邊界接手」）：桌面 inner-scroll box 捲到邊界後、繼續同向滾的小幅捲動
// 會被 window mandatory snap 吃掉、彈回 section（box 吸走滾輪、剩下 chain 太弱過不了 snap）→ 感覺「卡住、上不去 footer」。
// 解＝box 在邊界且同向續滾時攔截 wheel，用 scrollWindowNoSnap 平滑把 window 帶到相鄰 snap（往下→footer / 往上→hero），
//   捲動全程關 snap 不被吃。**只在 box「可捲」時接手**：短 panel（content<box、不可捲）不攔 → 讓 window 自己 snap，
//   且避免「從 hero 進到 section 當下、box 在底→被立刻帶去 footer 跳過內容」。手機（<768）window 捲照舊、不掛。
function initBoxSnapHandoff() {
  const section = document.getElementById('activities-content-section');
  const box = /** @type {HTMLElement | null} */ (section && section.querySelector('.inner-scroll-scroll-col'));  // 通用 inner-scroll 類（與其他頁一致）
  if (!box || !section) return;
  let handing = false;
  let lastWheelTs = 0;
  let armedDir = 0;   // 邊界武裝方向：1=底(→footer)、-1=頂(→hero)、0=未武裝
  const onWheel = (/** @type {WheelEvent} */ e) => {
    if (window.innerWidth < 768) return;                      // 只桌面 inner-scroll
    if (handing) { e.preventDefault(); return; }              // 接手動畫中：吞滾輪免干擾
    if (box.scrollHeight <= box.clientHeight + 1) return;     // box 不可捲 → 交回 window（短 panel / 進場剛到 section）
    const atBottom = box.scrollTop >= box.scrollHeight - box.clientHeight - 1;
    const atTop = box.scrollTop <= 0;
    // 兩段手勢閘（user 2026-07-04「捲一捲直接滑到 footer」二修）：交棒必須①邊界已被同方向事件「武裝」過
    // （到邊界後第一顆一律只吞不交棒）＋②真正停頓 >600ms 後再滾一次。任何連續滾動流（不論觸控板慣性
    // ~16ms 或滑鼠逐格 ~300ms 間隔）結構上都到不了②，不可能一路滑進 footer。初版用 250ms 間隔判「新手勢」
    // 對滑鼠失效：逐格滾輪連續滾時每格間隔就常 >250ms，格格都被當新手勢。
    const gap = performance.now() - lastWheelTs;
    lastWheelTs = performance.now();
    let targetY = null;
    if (e.deltaY > 0 && atBottom) {
      // 往下到底 → 末段 footer（footer align:end，捲到文件底即吸到它）
      targetY = ((document.scrollingElement || document.documentElement).scrollHeight) - window.innerHeight;
    } else if (e.deltaY < 0 && atTop) {
      // 往上到頂 → 上一個 snap（section 上方一個視窗高 = hero）
      targetY = Math.max(0, Math.round(section.getBoundingClientRect().top + window.scrollY - window.innerHeight));
    }
    if (targetY === null) { armedDir = 0; return; }           // 不在邊界：解除武裝、讓 box 正常捲
    e.preventDefault();                                       // 邊界一律吞掉（否則 chain 給 window 被 mandatory snap 吃掉會抖）
    const dir = e.deltaY > 0 ? 1 : -1;
    if (armedDir === dir && gap > 600) {
      armedDir = 0;
      handing = true;
      scrollWindowNoSnap(targetY, { duration: DUR.medium, ease: EASE.move });
      setTimeout(() => { handing = false; }, 650);
    } else {
      armedDir = dir;                                         // 只武裝：停頓 >600ms 後的下一顆才交棒
    }
  };
  box.addEventListener('wheel', onWheel, { passive: false });
  registerPageCleanup(() => box.removeEventListener('wheel', onWheel));
}

// fromUserNav：true=使用者點連結的 SPA 導航（首頁 floating 活動海報）；false=初始載入 / refresh / 上一頁下一頁。
// 只有 fromUserNav 才播 ?item= 的「捲到 item + flash + 展開 accordion」導航動畫，refresh 視為全新頁面（只套 ?section= 分頁，不重播）。
export function initActivitiesSectionSwitch(defaultSection = 'general', fromUserNav = false) {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (btns.length === 0) return;

  registerPageExit(playActivitiesExit);

  // 左側 section nav clip-path 進場（section 進視窗 once）+ 離頁退場，比照 faculty nav
  setupSectionNavReveal();

  // box 捲到邊界 → 接手帶 window 到相鄰 snap（解 mandatory snap 吃掉 chain、開著 item 捲不到 footer）
  initBoxSnapHandoff();

  // 手機直向：量 nav 高設 --act-filter-top（filter bar sticky 釘點，lists.css portrait 區塊配套）
  initMobileStickyBars();

  // SPA 換頁後 DOM 重建，需重置 loaded 狀態讓資料重新載入
  Object.keys(loaded).forEach(k => delete loaded[k]);
  // 清 single-flight fetch cache：每次進頁抓最新內容（prefetch 與 render 共用同一次 fetch，見下 prefetchExhibitionsData）
  resetActivitiesFetchCache();
  // 模組級旗標跨 SPA 換頁不會自動清。若上次離頁時某 switch 被導航打斷（exit 動畫被 cleanup 殺、
  // onComplete 沒跑→Promise 永不 resolve→finally 沒跑），switching 會卡 true 擋掉本頁所有 panel 載入。
  // 重新進頁 DOM 全新、沒有進行中的 switch → 一律歸零。
  switching = false;
  subFilterSwitching = false;
  chipsScrollHidden = false;  // 上次離頁時若正被 scroll 收起，旗標殘留會擋掉新頁第一次 chip exit

  // 暴露給 industry reference 按鈕使用（避免循環 import）
  window.__sccdNavigateToItem = (section, itemId) => navigateToItem(section, itemId);

  // ?section= / ?item= deep-link：只有從首頁 floating 卡片點進來的 SPA 導航（fromUserNav）才套指定 section + 跑導航動畫。
  const params = new URLSearchParams(window.location.search);
  const hasDeepLink = params.has('section');

  if (hasDeepLink && fromUserNav) {
    const initialSection = params.get('section') || defaultSection;
    const initialItem = params.get('item');
    const initSwitchPromise = switchToSection(initialSection, btns, false, true);
    // 等 hero 進場才往下捲（waitForHeroAnimDone；封頂 ~0.9s = hero 多組時不等全播完免「卡在 hero 太久」，user 2026-06-27；對齊 curriculum）。
    // 手機也適用：hero-animation playMobileHeroEntrance 跑「看得見的」.hero-mobile-* 進場後才 signal
    // （2026-06-12 起；先前手機 hero 靜態、等的是隱藏桌面 timeline ＝ 白等，曾短暫改成跳過）。
    if (initialItem) {
      // deep-link 自動導航：rows 進場「init 即完成」不等 ScrollTrigger（比照 curriculum deepLinkAutoNav 通則）。
      // 否則目標 row 的 reveal 捲到才觸發，落地後 highlight 還要乾等 reveal ~0.6-0.8s（實測手機 618ms / 桌面 800ms）。
      // hero 期間於畫面外直接定位完成（清 inline transform 即 revealed 態）；之後 ScrollTrigger onEnter
      // 對已 reveal rows 再 tween 0→0 無視覺影響。手機 filter bar 也先收掉，省 navigateToItem 內 350ms 收合等待。
      initSwitchPromise.then(() => {
        const panel = document.getElementById(`panel-${initialSection}`);
        if (!panel) return;
        if (typeof gsap !== 'undefined') {
          const rows = panel.querySelectorAll('.list-reveal-row');
          if (rows.length) { gsap.killTweensOf(rows); gsap.set(rows, { clearProps: 'transform' }); }
          // 斑馬底色 clip（setupAdmissionReveal 設的 inset(100%)）也直接到位：揭露它的 ScrollTrigger 綁 window，
          // inner-scroll box 捲動不會驅動它 → onEnter 沒 fire 時整個 zebra item 被裁成空白且永不恢復
          panel.querySelectorAll('.list-item.list-item-zebra').forEach(it => gsap.set(it, { clearProps: 'clipPath' }));
        }
        panel.querySelectorAll('.list-item[data-pre-reveal]').forEach(it => it.removeAttribute('data-pre-reveal'));
        const filterBar = /** @type {HTMLElement | null} */ (panel.querySelector('.activities-filter-bar'));
        if (window.innerWidth < 768 && filterBar) filterBar.classList.add('bar-hidden');
      });
      // 有 ?item= → navigateToItem smooth:true：平滑捲到該項目 → 捲到位 delay 才展開 accordion
      waitForHeroAnimDone().then(() => navigateToItem(initialSection, initialItem, { smooth: true }));
    } else {
      // 沒指定 item → 只平滑捲到 list section，不做 highlight
      waitForHeroAnimDone().then(() => {
        const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section'));
        scrollSectionIntoView(sectionEl, 'smooth');  // deep-link：hero 跑完平滑捲到 section（無併發 reveal）
      });
    }
  } else {
    // refresh / 直接開連結 / 上一頁下一頁（fromUserNav=false）：清掉 deep-link query（URL 變乾淨）+ 停在 default section
    // ＝「直接點 activities 分頁的樣子」（user 2026-06-04），不停在 ?section= 指定的分頁也不導航
    if (hasDeepLink) history.replaceState(history.state, '', window.location.pathname);
    // ⭐fetch 提前：hero 進場時就先抓 exhibitions 資料填快取（跟 hero 並行、fetch 不搶主執行緒），
    // 這樣下面 hero 播完 switchToSection→render 時直接命中快取，不必再等 ~1.1s fetch（原本 fetch 也被 defer 在 gate 後）。
    prefetchExhibitionsData();
    // 初載 list 的 fetch+render+setup 延到 hero 進場動畫跑完才做（user 2026-08-28）：activities 是唯一在 init 就
    // 同步 render 整個 section 清單的 .hero-rand-grid 頁，這坨跟 hero 的 randomizeHeroLayout live build（cache
    // 是 in-memory Map、reload 必重建）疊在同一主執行緒窗口 → hero 卡片/文字進場卡頓（其他頁沒這個並發）。
    // list 在 fold 外、reveal 已 scroll-gated → 晚 ~1.7s load 不可見無感。用預設 cap（等真正 hero:animation-done
    // event ~1.7s；4000ms 只是 hero 壞掉時的兜底，同 deep-link 用法）——別給短 cap，會在 hero 還沒播完就 render 回來搶主
    // 執行緒。deep-link 路徑（上面 branch）維持即時 render＝要在 hero 期間於畫面外把目標 item 定位好。
    waitForHeroAnimDone().then(() => switchToSection(defaultSection, btns, false, true));
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
      // 手機 section nav 是水平 scroll strip（9 顆，overflow-x:auto）：點到的 btn 可能被捲到部分出界
      // → 捲 strip 讓它落在畫面中間（user 2026-07-03，比照 curriculum 但改置中）。
      centerSectionNavBtn(section);
    });
  });
}

async function switchToSection(section, btns, shouldScroll, isInitial = false) {
  if (switching) return;

  const currentPanel = /** @type {HTMLElement | null} */ (document.querySelector('.activities-panel:not(.hidden)'));
  const targetId = `panel-${section}`;
  // 已 active 同 panel：跳過退場/進場動畫；如果是 click（shouldScroll）仍 scroll 對齊 anchor
  if (currentPanel && currentPanel.id === targetId && !isInitial) {
    if (shouldScroll) {
      const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section'));
      scrollSectionIntoView(sectionEl);
    }
    return;
  }

  switching = true;

  // ⚠️ try/finally：第 5 步把 rows 推到 yPercent:100 (hidden)，第 8 步才 reveal 回 yPercent:0。
  //    若中間第 3 步 await loadPromise 拋錯（fetch 被瀏覽器在 SPA 換頁時 cancel / JSON parse 失敗），
  //    reveal 永遠不會跑 → rows 卡在 yPercent:100 看不到（user 看到 desc/filter 卻沒 list cards），
  //    且 switching=true 永遠不重置 → 下次切 panel 全被擋。finally 保證 reveal + switching reset 兩個必跑
  let target = null;
  try {
    // 0. 先啟動 loadPanel fetch + render（**並行於 exit 動畫**），target panel 還 hidden 對 user 不可見
    //    過去 await exit → 再 await load 序列等於兩段時間相加，user 看到 panel 空白等 list render
    //    並行後等 exit 動畫跑完 load 通常也好了，直接 reveal 沒空窗
    const loadPromise = loadPanel(section);

    // 1. 退場（首次 init 跳過；切到同 panel 也跳過）
    //    degree-show cards 已加 .list-reveal-row，與其他 panel 統一走 playAdmissionPanelExit；
    //    sub-filter chip 不是 .list-reveal-row → 另用 playFilterChipsExit 讓舊 panel 的 chip 也一起收掉
    //    （chip 自身 clip-path，不裁旋轉角；user 2026-06-07「切分頁時 filter btn 也要出場」）。並行 await。
    if (!isInitial && currentPanel && currentPanel.id !== targetId) {
      await Promise.all([
        playAdmissionPanelExit(currentPanel),
        playFilterChipsExit(currentPanel),
      ]);
    }

    // 2. 切按鈕 active 狀態（隨機顏色 + 旋轉）
    const { color } = setActiveNavBtn(btns, section, 'data-section');
    currentSectionColor = color;

    // 3. 等 load 完成（多數情況 exit 動畫已 cover 此時間；首次 fetch 大 JSON 仍可能略等）
    await loadPromise;

    // 4. 拿到 target panel（還是 .hidden 狀態，setup 先跑）
    target = /** @type {HTMLElement | null} */ (document.getElementById(targetId));

    // 5. 進場 setup：在 showPanel 前完成 yPercent:100 推送，避免 panel 顯示後才 set 造成 1 frame 閃爍
    //    .hidden 上的 element 仍可 wrap clip-reveal-wrapper + gsap.set（GSAP 不在乎 visibility）
    if (target) setupAdmissionReveal(target, { hide: true });
    // filter chip（exhibitions/visits sub-tab）改 chip 自身 clip-path reveal，先收起
    if (target) hideFilterChips(target);

    // 6. 切 panel 顯示
    target = /** @type {HTMLElement | null} */ (showPanel('.activities-panel', targetId));
    if (target) {
      // 收起 target panel 內遺留的 open accordion（avoid「切到別的 panel 再切回來時 accordion 仍打開」殘留體驗）
      resetListAccordionsInPanel(target);
      // 同步所有 active filter btn 的顏色
      target.querySelectorAll('.activities-filter-btn.active').forEach(btnEl => {
        const btn = /** @type {HTMLElement} */ (btnEl);
        const inner = /** @type {HTMLElement | null} */ (btn.querySelector('.anchor-nav-inner'));
        if (inner) {
          inner.style.background = currentSectionColor;
          inner.style.transform  = '';
        } else {
          btn.style.background = currentSectionColor;
        }
      });
    }

    // 6.5 degree-show 卡片標題過長 → marquee：panel 在 hidden 態 render（offsetWidth=0 量不到），
    //     showPanel 後 rAF 重量（比照 dsd-tab strip）；非 degree-show panel 無 .dshow-title-line = no-op
    if (section === 'degree-show' && target) {
      const dsPanel = target;
      requestAnimationFrame(() => {
        applyMarqueeOverflow(dsPanel, '.dshow-title-line', '.dshow-title-inner');
        // 桌面 hover 放開平滑回彈（user 2026-08-19 B）：每張卡綁 bindMarqueeReturn（手機由 helper 自我 gate 跳過）
        dsPanel.querySelectorAll('.degree-show-card').forEach((card) => {
          registerPageCleanup(bindMarqueeReturn(/** @type {HTMLElement} */ (card), '.dshow-title-inner', '.dshow-title-line'));
        });
      });
    }

    // 7. Scroll to section（點擊時才 scroll，初始載入不 scroll）
    //    分頁切換一律 instant scroll：同步一次到位，免疫捲動途中被 reveal 的 ScrollTrigger.refresh 凍結在半路
    if (shouldScroll) {
      const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section') || document.getElementById('library-content-section'));
      if (sectionEl) scrollSectionIntoView(sectionEl, 'instant');
    }
  } catch (err) {
    console.error('[activities-section-switch] switchToSection error:', err);
    // loadPanel 失敗時把 loaded[] 旗標清掉，user 重切回此 panel 才會再試 fetch
    delete loaded[section];
  } finally {
    // 8. 進場 reveal — 無論成不成功都跑，否則 rows 卡 yPercent:100。
    //    useScrollTrigger 跟 isInitial 綁（對齊 admission-section-switch 的正確做法）：
    //    - 初次 init（isInitial=true）：list 在 hero 下方 fold 外 → 用 ScrollTrigger 等捲到才播（reveal on scroll）。
    //    - 分頁切換（isInitial=false）：step 7 instant scroll 已把 list 推進 viewport 頂；此時若仍用 ScrollTrigger，
    //      onEnter 對「建立當下就已在視窗內」的元素觸發不可靠（有時 fire 有時不）→ 卡 yPercent:100 不進場
    //      （= user 回報「有時 activities list 沒進場動畫」）。改 false 走 master-timeline 立即播，必定 reveal。
    if (target) {
      // ⚠️ 初載也走「master-timeline 一次全揭」（useScrollTrigger:false），不用 ScrollTrigger lazy reveal：
      //    桌面清單在 `.inner-scroll-scroll-col` 內「內捲」（window 幾乎不動），但 reveal 的 ScrollTrigger 綁
      //    預設 window scroller → 捲內容器不 fire trigger、fold 以下 year-group 永遠卡 yPercent:100 留白
      //    （user 報 exhibitions reload「只出第一年、下面預留空位一片空白」）。
      // ⚠️ 初載 reveal 要等 DOM 定案：exhibitions 兩個 list（special+permanent）＋year-toggle/type-filter init
      //    都在此刻剛跑完，慢機／webfont 晚 swap／資料晚到重排時 row 會分幾幀才進齊，同步跑 reveal 會有部分
      //    group 的 tween 沒建到（實測初載 12/24 卡住）。固定 double-rAF 只擋得住兩幀內的延遲；改用
      //    revealWhenListRowsSettled 等 row 數連兩幀不變才揭，晚到的 row 也進同一條 timeline、每列都有動畫。
      const revealNow = () => {
        playAdmissionPanelReveal(target, { useScrollTrigger: false });
        playFilterChipsReveal(target, { useScrollTrigger: false });
      };
      if (isInitial) {
        // 初載：list 進場「延到內容區捲進 window 視窗才播」（單一 section-level ScrollTrigger，非 per-row）。
        //   ① 修 hero 進場卡頓：reveal 的 master timeline（多列 GSAP）本來在資料 fetch 一 resolve（≈hero 動畫播到一半）
        //      就立刻建 + 播 → 跟 hero clip-reveal 搶主執行緒，hero 停一下才續。延到捲到才播＝ hero 播時它不在跑。
        //   ② 修「捲下去 list 已渲染完、沒進場」：本來在 fold 外就播完，改成捲到才播、看得到。
        //   ⚠️ 仍用 master timeline（useScrollTrigger:false 內部）非 per-row：桌面 list 在 .inner-scroll-scroll-col
        //      內捲、window 不動 → per-row 綁 window scroller 會漏掉 fold 以下 year-group 卡 yPercent:100 空白；
        //      單一 section trigger 只負責「何時播」，播的仍是整條 timeline 涵蓋全部 group。
        //   rows 已在 step 5 setupAdmissionReveal 藏好（yPercent:110），trigger 前維持隱藏、不閃；section 在
        //   #page-content 內，離頁時 router cleanup 會 kill 此 trigger。
        revealWhenListRowsSettled(target, () => {
          const sectionEl = document.getElementById('activities-content-section');
          if (typeof ScrollTrigger !== 'undefined' && sectionEl) {
            ScrollTrigger.create({
              trigger: sectionEl, start: 'top 80%', once: true,
              // guard：若使用者已切到別的 section（target 被 showPanel 加上 .hidden）就別對隱藏 panel 播
              onEnter: () => { if (!target.classList.contains('hidden')) revealNow(); },
            });
          } else {
            revealNow();
          }
        });
      } else {
        revealNow();
      }
    }
    switching = false;
  }
}

// Filter 切 sub-list 共用流程：exit 舊 list → swap display → scroll 回 section 頂 → reveal 新 list
// 跟 section-switch 用同 helpers（playAdmissionPanelExit/Reveal）保持動畫風格一致
// switching guard 防 user 在動畫期間連點 → race 出現「兩個 list 同時可見」或 reveal 跑錯 target
let subFilterSwitching = false;
// deep-link（navigateToItem）程式化切 sub-tab 時抑制「instant 捲回 section 頂」：
// deep-link 自己有一段平滑捲到 item 的捲動，sub-filter 的瞬移會在途中打架＝「直接跳下去」（user 2026-06-12）
let suppressSubFilterScroll = false;
/**
 * @param {string} panelId
 * @param {Record<string, HTMLElement | null>} lists
 * @param {string} targetType
 */
async function animatedSubListSwitch(panelId, lists, targetType) {
  if (subFilterSwitching) return;
  subFilterSwitching = true;
  try {
    const incoming = lists[targetType];
    if (!incoming) return;
    // outgoing = 當前可見的（display 不是 'none'）非 target list
    let outgoing = /** @type {HTMLElement | null} */ (null);
    for (const k of Object.keys(lists)) {
      const el = lists[k];
      if (k !== targetType && el && el.style.display !== 'none') { outgoing = el; break; }
    }

    if (outgoing) {
      await playAdmissionPanelExit(outgoing);
    }

    for (const k of Object.keys(lists)) {
      const el = lists[k];
      if (el) el.style.display = k === targetType ? '' : 'none';
    }
    reapplySearch(panelId);

    // 切 sub-filter 一律捲回 section 頂（對齊左側 section nav，user 2026-06-06「點 filter 也要回到 filter 頂部」）。
    // 取代舊「量 filter bar 前後 Y、scrollBy 維持 sticky 視覺位置」：切到短 list（如 permanent 僅 1 筆）時
    // 文件變太短、瀏覽器 clamp scroll → 維持邏輯失效卡在半空奇怪位置。scrollSectionIntoView 用非 sticky
    // section 絕對位置算 target（見 project_sticky_pinned_scroll_target_use_offsettop），短 panel 也回得到頂。
    if (!suppressSubFilterScroll) {
      const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section'));
      scrollSectionIntoView(sectionEl, 'instant');
    }

    // 進場 reveal：useScrollTrigger=false 立刻播（不等捲到 viewport）
    setupAdmissionReveal(incoming, { hide: true });
    playAdmissionPanelReveal(incoming, { useScrollTrigger: false });
  } finally {
    subFilterSwitching = false;
  }
}

// 切 sub-tab 對應的 panel description：跟下方 list 同節奏 exit/swap/reveal
// exit yPercent:0→100 (0.4s power3.in) → 切 .active class (display:block) → playClipReveal (0.9s power3.out)
// 跟 animatedSubListSwitch 平行 await，整段視覺一致（desc + list 同時退/進）
/**
 * @param {string} panelId
 * @param {string} descType
 * @returns {Promise<void>}
 */
async function setPanelDescActive(panelId, descType) {
  const group = document.querySelector(`#${panelId} .panel-desc-group`);
  if (!group || typeof gsap === 'undefined') return;
  const current = /** @type {HTMLElement | null} */ (group.querySelector('.panel-desc.active'));
  const target  = /** @type {HTMLElement | null} */ (group.querySelector(`.panel-desc[data-desc-type="${descType}"]`));
  if (!target || current === target) return;

  // 減少動態：直接切 active、不跑 desc exit/reveal 滑入
  if (prefersReducedMotion()) {
    if (current) current.classList.remove('active');
    gsap.set(target, { clearProps: 'transform' });
    target.classList.add('active');
    return;
  }

  if (current) {
    await new Promise(resolve => {
      gsap.to(current, {
        yPercent: 100,
        duration: DUR.base,
        ease: EASE.exit,
        overwrite: true,
        onComplete: resolve,
      });
    });
    current.classList.remove('active');
  }

  // 首次切換時 target 的 yPercent 是 0（panel 初次 reveal 已對所有 .list-reveal-row 拉回 0，
  // 包含 display:none 的隱藏 desc）。直接 playClipReveal 變成 0→0 不動畫 snap 出現。
  // 顯式 set 回 100 再 reveal，保證每次切換都有滑入動畫
  gsap.set(target, { yPercent: 100 });
  target.classList.add('active');
  playClipReveal([target]);
}

function initExhibitionsTypeFilter() {
  const btns = document.querySelectorAll('#exhibitions-type-filter .exhibitions-type-btn');
  if (!btns.length) return;

  const activeInner = /** @type {HTMLElement | null} */ (document.querySelector('#exhibitions-type-filter .exhibitions-type-btn.active .anchor-nav-inner'));
  if (activeInner) {
    activeInner.style.background = currentSectionColor || '#00FF80';
    activeInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
  }

  btns.forEach(btnEl => {
    const btn = /** @type {HTMLElement} */ (btnEl);
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      btns.forEach(bEl => {
        const b = /** @type {HTMLElement} */ (bEl);
        b.classList.remove('active');
        const inner = /** @type {HTMLElement | null} */ (b.querySelector('.anchor-nav-inner'));
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      btn.classList.add('active');
      const inner = /** @type {HTMLElement | null} */ (btn.querySelector('.anchor-nav-inner'));
      if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }

      const targetType = btn.dataset.type || '';
      // desc 與 list 並行 exit/reveal，視覺同時退場同時進場
      setPanelDescActive('panel-exhibitions', targetType);
      animatedSubListSwitch(
        'panel-exhibitions',
        {
          special:   document.getElementById('exhibitions-list-special'),
          permanent: document.getElementById('exhibitions-list-permanent'),
        },
        targetType,
      );
    });
  });
}

function initVisitsTypeFilter() {
  const btns = document.querySelectorAll('#visits-type-filter .visits-type-btn');
  if (!btns.length) return;

  // 初始化 active btn 樣式（預設 outbound 已在 HTML 標記 active）
  const activeInner = /** @type {HTMLElement | null} */ (document.querySelector('#visits-type-filter .visits-type-btn.active .anchor-nav-inner'));
  if (activeInner) {
    activeInner.style.background = currentSectionColor || '#00FF80';
    activeInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
  }

  btns.forEach(btnEl => {
    const btn = /** @type {HTMLElement} */ (btnEl);
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      btns.forEach(bEl => {
        const b = /** @type {HTMLElement} */ (bEl);
        b.classList.remove('active');
        const inner = /** @type {HTMLElement | null} */ (b.querySelector('.anchor-nav-inner'));
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      btn.classList.add('active');
      const inner = /** @type {HTMLElement | null} */ (btn.querySelector('.anchor-nav-inner'));
      if (inner) { inner.style.background = currentSectionColor || '#00FF80'; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }

      const targetType = btn.dataset.type || '';
      // desc 與 list 並行 exit/reveal，視覺同時退場同時進場
      setPanelDescActive('panel-visits', targetType);
      animatedSubListSwitch(
        'panel-visits',
        {
          outbound: document.getElementById('visits-list-outbound'),
          inbound:  document.getElementById('visits-list-inbound'),
        },
        targetType,
      );
    });
  });
}

// autoReveal:false 全程關閉 loader 內 ScrollTrigger.batch reveal — 統一由 switchToSection 呼叫
// playAdmissionPanelReveal 接管（避免「loader auto reveal」與「switch reveal」雙觸發 race）
async function loadPanel(section) {
  if (loaded[section]) return;
  loaded[section] = true;
  // ⚠️ 設 flag 後出錯（fetch fail / DOM missing）→ switchToSection 的 catch 會 delete loaded[section]
  //    讓 user 重切回此 panel 能 retry。本函數不另外 try/catch（讓 error propagate 給 caller 統一處理）

  const opts = { autoReveal: false };

  switch (section) {
    case 'exhibitions':
      await loadExhibitionsInto(opts);
      initActivitiesYearToggle();
      initListAccordion();
      initExhibitionsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'visits':
      await loadVisitsInto(opts);
      initActivitiesYearToggle();
      initListAccordion();
      initVisitsTypeFilter();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'competitions':
      await loadGeneralActivitiesInto('competitions-list', 'competitions', '/data/general-activities.json', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'conferences':
      await loadGeneralActivitiesInto('conferences-list', 'conferences', '/data/general-activities.json', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'lectures':
      await loadLecturesInto('lectures-list', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;

    case 'workshop':
      await loadWorkshopsInto('/data/workshops.json', 'workshop-list', opts);
      initListAccordion();
      return;

    case 'degree-show':
      // cards 已加 .list-reveal-row，與其他 panel 統一走 setupAdmissionReveal + playAdmissionPanelReveal
      await loadDegreeShowListInto('degree-show-list');
      return;

    case 'summer-camp':
      await loadSummerCampInto('summer-camp-list', opts);
      initListAccordion();
      return;

    case 'students-present':
      await loadWorkshopsInto('/data/students-present.json', 'students-present-list', opts);
      initListAccordion();
      return;

    case 'industry':
      await loadIndustryInto('industry-list', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;
  }
}
