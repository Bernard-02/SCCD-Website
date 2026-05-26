/**
 * Activities Section Switch Module
 * 處理 activities.html 左側 filter 切換右側內容區塊
 * 同時負責載入各區塊資料
 */

import { loadExhibitionsInto, loadGeneralActivitiesInto, loadLecturesInto, loadIndustryInto, loadWorkshopsInto, loadSummerCampInto, loadVisitsInto } from './activities-data-loader.js';
import { loadAlbumData } from './album-data-loader.js';
import { loadDegreeShowListInto } from './degree-show-data-loader.js';
import { initActivitiesYearToggle } from '../accordions/activities-year-toggle.js';
import { initListAccordion, resetListAccordionsInPanel } from '../accordions/list-accordion.js';
import { reapplySearch } from '../ui/activities-search.js';
import { setActiveNavBtn, showPanel } from '../ui/section-switch-helpers.js';
import { playAdmissionPanelExit, playAdmissionPanelReveal, setupAdmissionReveal } from './admission-data-loader.js';
import { playClipReveal } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';

// 追蹤哪些 panel 已載入過資料
const loaded = {};
// 防連點：exit/reveal 動畫期間 swallow 重複觸發
let switching = false;

// scrollIntoView wrapper：對 activities-content-section 加 header 高度 offset，
// 避免 active section btn / list-item 緊貼 viewport top 被 header logo 遮住
// 桌面 header 100px / 手機 80px（由 --header-height CSS var 提供）
/**
 * @param {HTMLElement | null} el
 * @param {ScrollBehavior} [behavior]
 */
function scrollSectionIntoView(el, behavior = 'smooth') {
  if (!el) return;
  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '80', 10);
  const top = el.getBoundingClientRect().top + window.scrollY - headerH;
  window.scrollTo({ top, behavior });
}

let currentSectionColor = '';
export function getCurrentSectionColor() { return currentSectionColor; }

// 從外部（如 industry reference 按鈕）導航到指定 section 的指定 item
export async function navigateToItem(section, itemId) {
  const btns = document.querySelectorAll('.activities-section-btn');
  await switchToSection(section, btns, false);
  if (!itemId) return;

  // 等 fetch + DOM render 完成後再 scroll
  await new Promise(r => setTimeout(r, 150));
  await new Promise(r => requestAnimationFrame(r));

  const target = document.getElementById(`item-${itemId}`);
  if (!target) return;

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
      tabBtn?.click();
      await new Promise(r => setTimeout(r, 100));
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

  // 計算目標位置
  const panel      = document.getElementById(`panel-${section}`);
  const filterBar  = /** @type {HTMLElement | null} */ (panel?.querySelector('.activities-filter-bar'));
  const filterBarH = filterBar?.offsetHeight || 0;
  const compensate = 200 + filterBarH + 16;

  let targetTop = 0;
  let el = /** @type {HTMLElement | null} */ (target);
  while (el) { targetTop += el.offsetTop; el = /** @type {HTMLElement | null} */ (el.offsetParent); }
  const finalTop = targetTop - compensate;

  // instant scroll：smooth 會經過 hero 區造成「先回 hero 再展開」視覺，
  // 切 panel 後 user 期待直接看到 target list 就位 → 用 instant 跳到位，highlight + accordion 動畫提供視覺回饋
  window.scrollTo({ top: finalTop, behavior: 'instant' });

  // scroll 已 instant 就位，直接閃 highlight + 展開 accordion（不需等 smooth scroll 600ms）
  const flashColor = currentSectionColor || '#00FF80';
  target.style.transition = 'background 0.3s';
  target.style.background = flashColor;
  setTimeout(() => {
    target.style.background = '';
    const header = /** @type {HTMLElement | null} */ (target.querySelector('.list-header'));
    if (header && !header.classList.contains('active')) {
      header.style.background = flashColor;
      header.click();
    }
  }, 600);
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
  if (panel) await playAdmissionPanelExit(panel);
}

export function initActivitiesSectionSwitch(defaultSection = 'general') {
  const btns = document.querySelectorAll('.activities-section-btn');
  if (btns.length === 0) return;

  registerPageExit(playActivitiesExit);

  // SPA 換頁後 DOM 重建，需重置 loaded 狀態讓資料重新載入
  Object.keys(loaded).forEach(k => delete loaded[k]);

  // 暴露給 industry reference 按鈕使用（避免循環 import）
  window.__sccdNavigateToItem = (section, itemId) => navigateToItem(section, itemId);

  // 支援 ?section= 和 ?item= query string（從外部連結過來時切換 + highlight 特定項目）
  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get('section') || defaultSection;
  const initialItem = params.get('item');

  if (params.has('section')) {
    // 從外部連結進來：先停留在 hero 1s，再 scroll（+ highlight 特定項目）
    if (initialItem) {
      // 有 ?item= → 用 navigateToItem 處理 scroll + 單一項目 highlight
      switchToSection(initialSection, btns, false, true);
      setTimeout(() => navigateToItem(initialSection, initialItem), 1000);
    } else {
      // 沒指定 item → 只 scroll 到 list section，不做 highlight
      switchToSection(initialSection, btns, false, true);
      setTimeout(() => {
        const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section'));
        scrollSectionIntoView(sectionEl);
      }, 1000);
    }
  } else {
    switchToSection(initialSection, btns, false, true);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchToSection(section, btns, true);
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
    //    degree-show cards 已加 .list-reveal-row，與其他 panel 統一走 playAdmissionPanelExit
    if (!isInitial && currentPanel && currentPanel.id !== targetId) {
      await playAdmissionPanelExit(currentPanel);
    }

    // 2. 切按鈕 active 狀態（隨機顏色 + 旋轉）
    const { color } = setActiveNavBtn(btns, section, 'data-section');
    currentSectionColor = color;
    window.__sccdCurrentSectionColor = color;

    // 3. 等 load 完成（多數情況 exit 動畫已 cover 此時間；首次 fetch 大 JSON 仍可能略等）
    await loadPromise;

    // 4. 拿到 target panel（還是 .hidden 狀態，setup 先跑）
    target = /** @type {HTMLElement | null} */ (document.getElementById(targetId));

    // 5. 進場 setup：在 showPanel 前完成 yPercent:100 推送，避免 panel 顯示後才 set 造成 1 frame 閃爍
    //    .hidden 上的 element 仍可 wrap clip-reveal-wrapper + gsap.set（GSAP 不在乎 visibility）
    if (target) setupAdmissionReveal(target, { hide: true });

    // 6. 切 panel 顯示
    target = /** @type {HTMLElement | null} */ (showPanel('.activities-panel', targetId));
    if (target) {
      // 收起 target panel 內遺留的 open accordion（avoid「切到別的 panel 再切回來時 accordion 仍打開」殘留體驗）
      resetListAccordionsInPanel(target);
      // 同步所有 active filter btn 的顏色
      target.querySelectorAll('.activities-filter-btn.active, .album-filter-option.active').forEach(btnEl => {
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

    // 7. Scroll to section（點擊時才 scroll，初始載入不 scroll）
    //    量 scroll 距離給 step 8 動態 delay 用（已在 anchor 就 0ms）
    var scrollDistance = 0;
    if (shouldScroll) {
      const sectionEl = /** @type {HTMLElement | null} */ (document.getElementById('activities-content-section') || document.getElementById('library-content-section'));
      if (sectionEl) {
        scrollDistance = Math.abs(sectionEl.getBoundingClientRect().top);
        scrollSectionIntoView(sectionEl);
      }
    }
  } catch (err) {
    console.error('[activities-section-switch] switchToSection error:', err);
    // loadPanel 失敗時把 loaded[] 旗標清掉，user 重切回此 panel 才會再試 fetch
    delete loaded[section];
  } finally {
    // 8. 進場 reveal — 無論成不成功都跑，否則 rows 卡 yPercent:100
    //    一律 useScrollTrigger=true：rows 進 viewport 才觸發
    //    點擊切換：根據 scroll 距離動態 delay（在 anchor 立即播 / 越遠等越久，上限 600ms）
    //    過去寫死 600ms 在頂部切換時 user 看到 panel 已換但 list 空白等 600ms，現按需給延遲
    if (target) {
      if (isInitial) {
        playAdmissionPanelReveal(target, { useScrollTrigger: true });
      } else if (shouldScroll) {
        // 經驗值：smooth scroll 速度約 1~2 px/ms，600ms 對應約 600-1200px；距離小於 50px 視同已就位立即播
        const delay = scrollDistance < 50 ? 0 : Math.min(600, scrollDistance * 0.6);
        if (delay === 0) playAdmissionPanelReveal(target, { useScrollTrigger: true });
        else setTimeout(() => playAdmissionPanelReveal(target, { useScrollTrigger: true }), delay);
      } else {
        playAdmissionPanelReveal(target, { useScrollTrigger: true });
      }
    }
    switching = false;
  }
}

// Filter 切 sub-list 共用流程：exit 舊 list → swap display → scroll 補償 → reveal 新 list
// 跟 section-switch 用同 helpers（playAdmissionPanelExit/Reveal）保持動畫風格一致
// switching guard 防 user 在動畫期間連點 → race 出現「兩個 list 同時可見」或 reveal 跑錯 target
let subFilterSwitching = false;
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

    // 切前後量 filter bar 視窗 Y 位置，sticky 視覺位置維持
    const filterBar = /** @type {HTMLElement | null} */ (document.querySelector(`#${panelId} .activities-filter-bar`));
    const beforeTop = filterBar?.getBoundingClientRect().top ?? 0;

    for (const k of Object.keys(lists)) {
      const el = lists[k];
      if (el) el.style.display = k === targetType ? '' : 'none';
    }
    reapplySearch(panelId);

    if (filterBar) {
      const afterTop = filterBar.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (delta !== 0) window.scrollBy(0, delta);
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

  if (current) {
    await new Promise(resolve => {
      gsap.to(current, {
        yPercent: 100,
        duration: 0.4,
        ease: 'power3.in',
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

    case 'album':
      await loadAlbumData('album-list-container');
      return;

    case 'industry':
      await loadIndustryInto('industry-list', opts);
      initActivitiesYearToggle();
      initListAccordion();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      return;
  }
}
