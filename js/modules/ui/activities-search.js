/* global gsap */
/**
 * Activities Search Module
 * 各 panel 各自的 search input，對應各自 panel 內容
 */
import { hideRows, revealRows, snapRowsShown } from './list-row-reveal.js';
import { DUR } from './motion.js';

// lazy 清單：搜尋前把所有 item 建出來（否則只搜得到已渲染的首批＋捲過的）＝search「無結果」根因。
// _lazyRenderAll 由 activities-data-loader lazy 容器暴露、idempotent；建完清 originalOrders 讓下面重新捕捉完整順序。
function ensureFullyRendered(panel) {
  let changed = false;
  panel.querySelectorAll('[data-lazy-list]').forEach(c => {
    const fn = /** @type {any} */ (c)._lazyRenderAll;
    if (typeof fn !== 'function') return;
    const before = c.querySelectorAll('.list-item').length;
    fn();
    if (c.querySelectorAll('.list-item').length !== before) changed = true;
  });
  if (changed) originalOrders.clear();
}

// 清 lazy 藏起的 transform / 斑馬 clip / data-pre-reveal → 讓（清空搜尋後）所有 item 直接可見可互動。
function revealAllInstant(panel) {
  snapRowsShown(panel.querySelectorAll('.list-reveal-row'));  // 五輪：transition:none＋transform=''（零讀取，不再逐列冷觸 recalc）
  panel.querySelectorAll('.list-item.list-item-zebra').forEach(it => { it.style.clipPath = ''; });
  panel.querySelectorAll('.list-item[data-pre-reveal]').forEach(it => it.removeAttribute('data-pre-reveal'));
}

// 搜尋結果進場動畫（user 2026-09-03 改版）：每次結果變動＝捲回頂、從第一筆開始 cascade。
// 年份標籤 rows 跟自己 group 的 items 同一波（DOM 序）進場——原版只藏 item rows，年份/zebra 即時現、
// 文字全量線性 stagger（0.06×兩百多列＝尾端十幾秒）＝user 報「年份跟 zebra 提前渲染、文字才來」的空帶。
// cull 用 item 計數（零 layout 讀）：首屏後的直接現（做過的就不需要），同切換 reveal 的視窗裁切精神。
const SEARCH_ANIM_ITEMS = 12;      // 桌面一屏 ~9-12 筆
const SEARCH_ITEM_STAGGER = 0.08;  // 逐「筆」起跑間隔（非逐 row 線性——45 row×0.06 尾端 2.7s，下緣又變 zebra 先文字後）
function animateMatches(panel) {
  const sc = panelScroller(panel);
  panel.querySelector('.activities-filter-bar')?.classList.remove('bar-hidden');   // 結果回頂＝bar 保留在畫面上（與清空側對稱）
  if (sc) { markProgrammaticScroll(); sc.scrollTop = 0; }   // 從頭開始；window path（手機 bar 非 sticky＝本來就在頂部打字）不捲
  const animUnits = [];   // { rows, slot }：year 標籤與該組第一筆同 slot（同拍滑入）、每筆 item 一 slot
  const snapRows = [];
  let itemCount = 0;
  getVisibleYearGroups(panel).forEach(group => {
    const g = /** @type {HTMLElement} */ (group);
    if (g.style.display === 'none') return;   // 本輪無命中被藏的 group
    const labelRows = [...group.querySelectorAll('.list-year-label .list-reveal-row')];
    if (itemCount < SEARCH_ANIM_ITEMS) animUnits.push({ rows: labelRows, slot: itemCount });
    else snapRows.push(...labelRows);
    const container = getItemsContainer(group);
    if (!container) return;
    [...container.querySelectorAll('.list-item')].forEach(item => {
      const it = /** @type {HTMLElement} */ (item);
      if (it.style.display === 'none') return;
      it.removeAttribute('data-pre-reveal');
      const rows = [...it.querySelectorAll('.list-reveal-row')];
      if (itemCount < SEARCH_ANIM_ITEMS) animUnits.push({ rows, slot: itemCount });
      else snapRows.push(...rows);
      itemCount++;
    });
  });
  snapRowsShown(snapRows);   // 視窗外＋殘留隱藏態（lazy pending）一步到位直接現
  const allAnimRows = animUnits.flatMap(u => u.rows);
  if (!allAnimRows.length) return;
  hideRows(allAnimRows);
  void allAnimRows[0].offsetHeight;  // ⚠️ 必要：同步區塊先藏再揭、無中間 paint 會 snap（list-row-reveal 檔頭警語）；單次 reflow commit 起點
  animUnits.forEach(u => {
    if (u.rows.length) revealRows(u.rows, { dur: DUR.reveal, delay: u.slot * SEARCH_ITEM_STAGGER, stagger: 0.05 });
  });
}

// 八輪 Part 2：search 顯隱/重排後按「可見 DOM 序」重新交錯 zebra——原 setZebra 是建行時的 default 連續序，
//   search 只改 display/排序、從不動 zebra → 結果會連灰/連白。順帶清殘留 inline clip（pending/被打斷 item 帶
//   inset(100%) 會把整筆裁隱形，搜尋結果須立即完整可見）＋zbGen 換代（'s' 前綴＝作廢舊 zebra 動畫回呼，六輪機制；
//   與 activities 'a'／admission 'd' 跨檔不撞值）。judge 可見用 style.display（applyGenericSearch 自寫的 inline、零 layout 讀）。
let _restripeZbGen = 0;
function restripeVisibleZebra(panel) {
  const visible = [...panel.querySelectorAll('.list-item')].filter(it => /** @type {HTMLElement} */ (it).style.display !== 'none');
  visible.forEach((it, i) => {
    const el = /** @type {HTMLElement} */ (it);
    el.classList.toggle('list-item-zebra', i % 2 === 0);
    if (el.style.clipPath) { el.style.transition = 'none'; el.style.clipPath = ''; }
    el.dataset.zbGen = 's' + (++_restripeZbGen);
  });
}

// ── Empty State ──────────────────────────────────────────────────────────

function getOrCreateEmptyState(panel) {
  let el = panel.querySelector('.search-empty-state');
  if (!el) {
    el = document.createElement('div');
    el.className = 'search-empty-state';
    // 比照 library：No Result 置中於畫面中間。activities 是整頁捲動（無固定高 scroll box），
    // 故用 min-height 視窗高的 flex 區塊垂直/水平置中文字。display 用 inline 切換（display:flex 會贏過 .hidden）
    el.style.cssText = 'display:none; min-height:60vh; flex-direction:column; align-items:center; justify-content:center; text-align:center;';
    el.innerHTML = '<p class="text-s">No Result</p><p class="text-s">無結果</p>';
    panel.appendChild(el);
  }
  return el;
}

function setEmptyState(panel, show) {
  const el = getOrCreateEmptyState(panel);
  el.style.display = show ? 'flex' : 'none';
}

// setupClipReveal 把 .activities-separator（有 .list-reveal-row class）wrap 進 .clip-reveal-wrapper，
// 所以 group.nextElementSibling 拿到的是 wrapper 不是 separator 本身；下列 helper 統一處理 wrapped / unwrapped 兩種結構
function getSeparatorAfter(group) {
  const next = group.nextElementSibling;
  if (!next) return null;
  if (next.classList.contains('clip-reveal-wrapper') && next.firstElementChild?.classList.contains('activities-separator')) {
    return /** @type {HTMLElement} */ (next.firstElementChild);
  }
  if (next.classList.contains('activities-separator')) return /** @type {HTMLElement} */ (next);
  return null;
}
function setSeparatorVisibility(sep, show) {
  if (!sep) return;
  // wrapper 才是真正佔位的 sibling；wrapper 不存在就直接操作 separator
  const wrapper = sep.parentElement?.classList.contains('clip-reveal-wrapper') ? sep.parentElement : null;
  /** @type {HTMLElement} */ ((wrapper || sep)).style.display = show ? '' : 'none';
  if (show) {
    // separator 本身要清掉 inline display:none 且 yPercent reset 到 0
    // （ScrollTrigger reveal 在 search 期間若沒 fire 過會留 yPercent:100 被 wrapper clip 看不見）
    sep.style.display = '';
    if (typeof gsap !== 'undefined') gsap.set(sep, { yPercent: 0 });
  }
}

// 空結果時把 panel 內所有 .activities-separator 一律收掉
// 避免 search bar 下方殘留多餘橫綫；清空 search 時 !query 分支會逐一恢復
function hideAllSeparators(panel) {
  panel.querySelectorAll('.activities-separator').forEach(sep => {
    setSeparatorVisibility(/** @type {HTMLElement} */ (sep), false);
  });
}

// ── Border 重建 ───────────────────────────────────────────────────────────

function rebuildBorders(visibleItems) {
  visibleItems.forEach((item, idx) => {
    const isLast = idx === visibleItems.length - 1;
    const divider = item.querySelector('.list-item-divider');
    if (divider) {
      divider.style.display = isLast ? 'none' : '';
    }
  });
}

// 記住每個 items container 的原始 DOM 順序
const originalOrders = new Map();
// 記住哪些 year-items 原本是收合的（被 search 強制展開）
const collapsedBySearch = new Set();

// ── 取得 panel 內當前可見的 year groups ──────────────────────────────────
// 有 type filter 的 panel（exhibitions / visits）只搜目前顯示的 container
// 沒有 type filter 的 panel 搜整個 panel

// hideYearHeader 渲染（permanent exhibitions / alumni gatherings 等）沒有 .list-year-group wrapper，
// .list-year-items 自己就是頂層群組 → 一併納入；漏掉的話 search 永遠跳過這些 items
// （symptom：Permanent tab 打不匹配的字 → items 留著沒被濾掉、同時又顯示 No Result）
function getItemsContainer(group) {
  return group.matches('.list-year-items') ? group : group.querySelector('.list-year-items');
}

function getVisibleYearGroups(panel) {
  const groups = [...panel.querySelectorAll('.list-year-group')];
  panel.querySelectorAll('.list-year-items').forEach(c => {
    if (!c.closest('.list-year-group')) groups.push(c);
  });
  return groups.filter(g => {
    let el = g.parentElement;
    while (el && el !== panel) {
      // inline style.display === 'none'（type filter 用這個隱藏 container）
      if (el.style.display === 'none') return false;
      el = el.parentElement;
    }
    return true;
  });
}

// ── Generic panel 搜尋 ─────────────────────────────────────────────────────

// search 清空後把捲動位置還原到「搜尋前」（user 2026-09-03）：桌面捲在 .inner-scroll-scroll-col（矮橫向拆 frame→
//   overflow visible→改 window）。搜尋重排/隱藏 item 使清單變短→scrollTop 被 clamp→清空還原後停頂端；記原位捲回。
function panelScroller(panel) {
  const box = /** @type {HTMLElement | null} */ (panel.closest('.inner-scroll-scroll-col'));
  if (box) { const oy = getComputedStyle(box).overflowY; if (oy === 'auto' || oy === 'scroll') return box; }
  return null;  // window path（手機/矮橫向拆 frame）
}

// 程式化捲動抑制（user 2026-09-03「清空後 search bar 要留在畫面上」）：搜尋捲頂/清空還原的 scrollTop 跳動
// 也會 fire scroll event，方向式 bar 開合 handler 會把「還原往下跳」誤判成使用者下捲＝自動收 bar。
// 寫 scrollTop 前標記短窗，兩個 scroll handler 在窗內只同步基準值、不動 bar。
let _progScrollUntil = 0;
function markProgrammaticScroll() { _progScrollUntil = performance.now() + 250; }

function applyGenericSearch(panelId, query) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  // user 2026-09-03：首個非空 query（_searchShown 還是 null＝搜尋開始）記住當前捲動位置，供清空時捲回（見空查詢分支末）
  if (query && !/** @type {any} */ (panel)._searchShown) {
    const sc = panelScroller(panel);
    /** @type {any} */ (panel)._preSearchScroll = sc ? sc.scrollTop : window.scrollY;
  }

  if (query) ensureFullyRendered(panel);  // lazy：搜尋前全建，否則只搜得到已渲染那批＝無結果

  const yearGroups = getVisibleYearGroups(panel);

  // 儲存原始 DOM 順序（第一次呼叫時記住）
  yearGroups.forEach(group => {
    const container = getItemsContainer(group);
    if (container && !originalOrders.has(container)) {
      originalOrders.set(container, [...container.querySelectorAll('.list-item')]);
    }
  });

  if (!query) {
    // 五輪：從沒搜尋過（或已還原過）＝零副作用可還原 → 什麼都不做。
    // 否則每次切分頁的 +300ms 重 apply（:414 listener）都會對全建 panel 跑整套還原
    // ＋revealAllInstant＝數百列冷觸 recalc storm（headless 實測 34s 單一 task）。
    if (!/** @type {any} */ (panel)._searchShown) { setEmptyState(panel, false); return; }
    // 防禦性：先把 panel 內所有 .activities-separator restore（含 wrapper），再讓 hideLastSeparator
    // 收掉最後一條。覆蓋任何前一輪 no-match 狀態下 hideAllSeparators 殘留的 hidden 分隔線。
    panel.querySelectorAll('.activities-separator').forEach(sep => {
      setSeparatorVisibility(/** @type {HTMLElement} */ (sep), true);
    });
    yearGroups.forEach(group => {
      const container = getItemsContainer(group);
      const original = container ? originalOrders.get(container) : null;
      if (original) original.forEach(item => container.appendChild(item));
      const allItems = [...group.querySelectorAll('.list-item')];
      allItems.forEach(item => { item.style.display = ''; });
      group.style.display = '';
      setSeparatorVisibility(getSeparatorAfter(group), true);
      rebuildBorders(allItems);
      // 還原被 search 強制展開的 year-items
      if (container && collapsedBySearch.has(container)) {
        container.style.display = 'none';
        container.style.height = '0px';
        const chevron = group.querySelector('.list-year-toggle .icon-chevron-list');
        if (chevron && typeof gsap !== 'undefined') gsap.set(chevron, { rotation: 180 });  // close → 朝右
        collapsedBySearch.delete(container);
      }
    });
    hideLastSeparator(yearGroups);
    revealAllInstant(panel);   // lazy 藏起的 item 清空搜尋後也要現，否則留白
    restripeVisibleZebra(panel);   // 八輪 Part 2：還原後 DOM 序＝原始序 → restripe 天然等於 default 交錯（免另存舊態）
    // user 2026-09-03：捲回搜尋前的位置（DOM 已全還原、scrollHeight 回滿→不被 clamp）；否則停在搜尋結果短清單頂端
    const _preY = /** @type {any} */ (panel)._preSearchScroll;
    if (typeof _preY === 'number') {
      const sc = panelScroller(panel);
      markProgrammaticScroll();   // 還原跳動非使用者捲動——別讓方向式開合收掉 bar（user 2026-09-03）
      panel.querySelector('.activities-filter-bar')?.classList.remove('bar-hidden');   // 清空後 bar 保留在畫面上
      if (sc) sc.scrollTop = _preY; else window.scrollTo(0, _preY);
      /** @type {any} */ (panel)._preSearchScroll = null;
    }
    setEmptyState(panel, false);
    /** @type {any} */ (panel)._searchShown = null;  // 3-3：清空搜尋 → 重置 diff 基準
    return;
  }

  const q = query.toLowerCase();
  // 3-3：先純算每組 matched（不動 DOM）→ 得 allMatched 供 diff。matchScore 原本 binary 1/0 + no-op sort：直接 filter（保留原 DOM 序）
  const groupMatched = yearGroups.map(group => {
    const container = getItemsContainer(group);
    const allItems = container && originalOrders.has(container)
      ? originalOrders.get(container)
      : [...group.querySelectorAll('.list-item')];
    return { group, container, allItems, matched: allItems.filter(item => (item.dataset.search || '').includes(q)) };
  });
  const allMatched = groupMatched.flatMap(g => g.matched);

  // 命中集合＋順序與上輪完全相同（如連續輸入到結果已穩定）→ DOM 重排／divider 重建／animate 全跳過（免 cross-tween race + 閃）
  const prev = /** @type {any} */ (panel)._searchShown;
  const unchanged = Array.isArray(prev) && prev.length === allMatched.length && allMatched.every((it, i) => prev[i] === it);
  if (unchanged) {
    const anyVis = yearGroups.some(g => g.style.display !== 'none');
    setEmptyState(panel, !anyVis);
    return;
  }

  groupMatched.forEach(({ group, container, allItems, matched }) => {
    if (!allItems.length) return;

    if (!matched.length) {
      allItems.forEach(item => { item.style.display = 'none'; });
      group.style.display = 'none';
      setSeparatorVisibility(getSeparatorAfter(group), false);
      return;
    }

    group.style.display = '';
    setSeparatorVisibility(getSeparatorAfter(group), true);

    allItems.forEach(item => {
      item.style.display = 'none';
      const divider = item.querySelector('.list-item-divider');
      if (divider) divider.style.display = 'none';
    });

    if (container) matched.forEach(item => container.appendChild(item));
    matched.forEach(item => { item.style.display = ''; });
    rebuildBorders(matched);

    // 若 year-items 因 year toggle 被收合，展開讓結果可見，並記錄以便清空時還原
    if (container && (container.style.height === '0px' || container.style.display === 'none')) {
      collapsedBySearch.add(container);
      container.style.display = 'flex';
      container.style.height = 'auto';
      const chevron = group.querySelector('.list-year-toggle .icon-chevron-list');
      if (chevron && typeof gsap !== 'undefined') gsap.set(chevron, { rotation: 270 });  // open → 朝下（270；base 朝左，90=上/180=右/270=下）
    }
  });

  hideLastSeparator(yearGroups);

  // 八輪 Part 2：排序＋顯隱寫完、animateMatches 之前重排 zebra——matched rows 照常滑入、zebra 底色按新交錯直接現
  //   （與 3-3「zebra 直寫清」一致、無動畫）。
  restripeVisibleZebra(panel);

  // user 2026-09-03：結果變動＝捲回頂、整段從頭 cascade（year 標籤＋items 同波、首屏外直接現）。
  // 結果集合＋順序沒變的重打（unchanged 守衛 :242）仍完全跳過＝連續輸入不閃。gen 戳記保打斷安全。
  animateMatches(panel);
  /** @type {any} */ (panel)._searchShown = allMatched;

  // Empty state
  const anyVisible = yearGroups.some(g => g.style.display !== 'none');
  if (!anyVisible) hideAllSeparators(panel);
  setEmptyState(panel, !anyVisible);
}

function hideLastSeparator(yearGroups) {
  /** @type {Element | null} */
  let lastVisible = null;
  yearGroups.forEach(g => { if (g.style.display !== 'none') lastVisible = g; });
  if (lastVisible) {
    setSeparatorVisibility(getSeparatorAfter(lastVisible), false);
  }
}

// ── Degree Show 搜尋（卡片結構，非 list-year-group）─────────────────────────

function applyDegreeShowSearch(query) {
  const container = document.getElementById('degree-show-list');
  if (!container) return;
  const cards = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.degree-show-card')]);
  const q = query.toLowerCase();
  cards.forEach(card => {
    if (!query) {
      card.style.display = '';
      return;
    }
    const year = card.querySelector('h5')?.textContent.toLowerCase() || '';
    const title = [...card.querySelectorAll('h5')].map(el => el.textContent.toLowerCase()).join(' ');
    card.style.display = (year.includes(q) || title.includes(q)) ? '' : 'none';
  });

  // Empty state
  const anyVisible = cards.some(c => c.style.display !== 'none');
  setEmptyState(container, query && !anyVisible);
}

// ── 給外部 type filter 用：切換 filter 後重新 apply 當前 query ─────────────

export function reapplySearch(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const input = /** @type {HTMLInputElement | null} */ (panel.querySelector(`.activities-search-input[data-panel="${panelId}"]`));
  if (!input) return;
  const query = input.value.trim();
  if (panelId === 'panel-degree-show') {
    applyDegreeShowSearch(query);
  } else {
    applyGenericSearch(panelId, query);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

import { registerPageCleanup } from '../ui/page-cleanup.js';

let scrollHandler = null;
let colScrollHandler = null;

// 桌面 inner-scroll：右欄是「置中 box」(.activities-scroll-col)、window 不捲 → bar 收合改掛 box 自己的 scroll。
// 矮橫向拆 frame（landscape gate 把 box overflow 改 visible、window 捲）→ 回 false，讓 window scroll handler
// 接管收合（同手機）；看 computed overflow 不看寬度（同 list-accordion getScrollableBox）。
// .inner-scroll-scroll-col（非 .activities-scroll-col）：activities 的欄同時帶兩 class，admission 只帶前者
// → 用共用 class 一併涵蓋兩頁（camp 搜尋列共用本模組，見 main-modular initActivitiesSearch）。
function isDesktopInnerScroll() {
  const col = /** @type {HTMLElement | null} */ (document.querySelector('.inner-scroll-scroll-col'));
  if (!col || window.innerWidth < 768) return false;
  const oy = getComputedStyle(col).overflowY;
  return oy === 'auto' || oy === 'scroll';
}

export function initActivitiesSearch() {
  // scroll hide/show filter bar
  let lastScrollY = window.scrollY;
  let lastColY = 0;
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
  }
  scrollHandler = () => {
    // 桌面 inner-scroll：bar 收合由下方 box scroll 接管；window 不捲（snap 在 section），此處不插手免互搶 bar-hidden
    if (isDesktopInnerScroll()) return;
    if (performance.now() < _progScrollUntil) { lastScrollY = window.scrollY; return; }  // 程式化捲動（搜尋捲頂/清空還原）不觸發 bar 開合
    const currentY = window.scrollY;
    const goingDown = currentY > lastScrollY;
    lastScrollY = currentY;

    const activeBar = document.querySelector('.activities-panel:not(.hidden) .activities-filter-bar');
    if (!activeBar) return;
    // 只有實際 position:sticky 的 bar 收合才有意義（釘住後隱藏）；非 sticky（admission camp 手機版，bar 隨內容捲）
    // 收合只會讓下方內容跳動 → 跳過。activities 手機版 filter bar 有 sticky 規則故照收。
    if (getComputedStyle(activeBar).position !== 'sticky') return;

    // search bar 純捲動驅動 hide/show，即使有 item 展開也一樣（user 2026-06-09 改：開 item 後 scroll-up 仍可
    // 還原 search bar，不再永久鎖收）。開 item 時由 list-accordion 平滑加 bar-hidden，這裡只接管之後的捲動開合；
    // pin 線由 activities-data-loader 的 ResizeObserver 跟著 bar 高度走，header 自然跟隨不需這裡凍結。
    //
    // hero 是 h-screen，滑過 hero 進入 content 區之前不觸發 hide
    // 否則使用者進入 exhibitions panel 時 search bar 已被向下滑收掉
    const contentSection = document.getElementById('activities-content-section');
    const threshold = contentSection ? contentSection.offsetTop : 50;

    if (goingDown && currentY > threshold) {
      activeBar.classList.add('bar-hidden');
    } else {
      activeBar.classList.remove('bar-hidden');
    }
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  // 桌面 inner-scroll：search bar 收合掛在置中 box (.activities-scroll-col) 的捲動（往下捲 → 收，往上 → 還原；
  // bar 釘 box 頂、原地收合不頂到 header）。box 是 SPA 換頁時整段重建，故每次 init 重抓 + registerPageCleanup 解綁。
  const scrollCol = /** @type {HTMLElement | null} */ (document.querySelector('.inner-scroll-scroll-col'));
  if (scrollCol) {
    colScrollHandler = () => {
      const cur = scrollCol.scrollTop;
      if (performance.now() < _progScrollUntil) { lastColY = cur; return; }  // 程式化捲動（搜尋捲頂/清空還原）不觸發 bar 開合

      // 六輪 2-E：惰性快取 active bar，去掉每次 scroll 的 `.activities-panel:not(.hidden) ...` 後代選擇器全掃（profiler self 4.3s）。
      //   快取存 scrollCol 上（同元素跨 event 存活；SPA 換頁 box 重建＝天然失效）；失效條件＝那顆 bar 的 panel 被切成 hidden／脫離 DOM，
      //   改用廉價的 closest+contains 判定，僅在失效時才重掃一次。全部收在此 closure 內（此檔有 camp sticky WIP、只准動這裡）。
      let activeBar = /** @type {any} */ (scrollCol)._colBar;
      if (!activeBar || !activeBar.isConnected || activeBar.closest('.activities-panel')?.classList.contains('hidden')) {
        activeBar = /** @type {any} */ (scrollCol)._colBar = document.querySelector('.activities-panel:not(.hidden) .activities-filter-bar');
      }
      // 方向式（往下收、往上還原），比照改 100vh 前的 window 版（user 2026-06-30「往上要看得到 search bar」）。
      // 可靠的前提＝scroll-col 已設 overflow-anchor:none：收合改高度不補償 scrollTop → 無自觸發 scroll →
      // lastColY 純由使用者捲動驅動、方向不會被翻轉（先前方向式抖動、位置式不還原都是這個 anchoring 補償造成）。
      if (activeBar) {
        if (cur > lastColY && cur > 8) activeBar.classList.add('bar-hidden');
        else if (cur < lastColY) activeBar.classList.remove('bar-hidden');
      }
      lastColY = cur;
    };
    scrollCol.addEventListener('scroll', colScrollHandler, { passive: true });
  }

  // SPA 離開 activities 時解綁，避免下一頁 scroll 持續觸發 query activities DOM
  registerPageCleanup(() => {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (scrollCol && colScrollHandler) {
      scrollCol.removeEventListener('scroll', colScrollHandler);
      colScrollHandler = null;
    }
  });

  // 切換 panel 時清除所有 bar-hidden
  document.querySelectorAll('.activities-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activities-filter-bar.bar-hidden').forEach(bar => {
        bar.classList.remove('bar-hidden');
      });
      lastScrollY = window.scrollY;
      lastColY = scrollCol ? scrollCol.scrollTop : 0;
    });
  });

  const panelInputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.activities-search-input[data-panel]'));
  panelInputs.forEach(input => {
    const panelId = input.getAttribute('data-panel');
    // debounce：lazy 全建 + 結果進場動畫較重，不必每次按鍵都跑；停鍵 ~140ms 才 apply（清空即時還原）
    let t = null;
    input.addEventListener('input', () => {
      const run = () => {
        if (panelId === 'panel-degree-show') applyDegreeShowSearch(input.value.trim());
        else applyGenericSearch(panelId, input.value.trim());
      };
      clearTimeout(t);
      if (!input.value.trim()) run();          // 清空即時還原、不 debounce
      else t = setTimeout(run, 140);
    });
  });

  // 切換左側 section 時重新 apply 對應 input 的搜尋
  document.querySelectorAll('.activities-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      setTimeout(() => {
        const panelInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`.activities-search-input[data-panel="panel-${section}"]`));
        if (!panelInput) return;
        if (section === 'degree-show') {
          applyDegreeShowSearch(panelInput.value.trim());
        } else {
          applyGenericSearch(`panel-${section}`, panelInput.value.trim());
        }
      }, 300);
    });
  });
}
