/* global gsap */
/**
 * Activities Search Module
 * 各 panel 各自的 search input，對應各自 panel 內容
 */

// ── 搜尋工具 ───────────────────────────────────────────────────────────────

function matchScore(item, query) {
  const q = query.toLowerCase();
  const text = item.dataset.search || '';
  return text.includes(q) ? 1 : 0;
}

// ── Empty State ──────────────────────────────────────────────────────────

function getOrCreateEmptyState(panel) {
  let el = panel.querySelector('.search-empty-state');
  if (!el) {
    el = document.createElement('div');
    el.className = 'search-empty-state hidden grid-12';
    el.innerHTML = '<div class="col-span-12 md:col-span-11 md:col-start-2 md:pl-[41px] py-xl text-left"><p class="text-p1">No Result</p><p class="text-p1">無結果</p></div>';
    panel.appendChild(el);
  }
  return el;
}

function setEmptyState(panel, show) {
  const el = getOrCreateEmptyState(panel);
  el.classList.toggle('hidden', !show);
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

function getVisibleYearGroups(panel) {
  return [...panel.querySelectorAll('.list-year-group')].filter(g => {
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

function applyGenericSearch(panelId, query) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const yearGroups = getVisibleYearGroups(panel);

  // 儲存原始 DOM 順序（第一次呼叫時記住）
  yearGroups.forEach(group => {
    const container = group.querySelector('.list-year-items');
    if (container && !originalOrders.has(container)) {
      originalOrders.set(container, [...container.querySelectorAll('.list-item')]);
    }
  });

  if (!query) {
    // 防禦性：先把 panel 內所有 .activities-separator restore（含 wrapper），再讓 hideLastSeparator
    // 收掉最後一條。覆蓋任何前一輪 no-match 狀態下 hideAllSeparators 殘留的 hidden 分隔線。
    panel.querySelectorAll('.activities-separator').forEach(sep => {
      setSeparatorVisibility(/** @type {HTMLElement} */ (sep), true);
    });
    yearGroups.forEach(group => {
      const container = group.querySelector('.list-year-items');
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
    setEmptyState(panel, false);
    return;
  }

  yearGroups.forEach(group => {
    const container = group.querySelector('.list-year-items');
    const allItems = container && originalOrders.has(container)
      ? originalOrders.get(container)
      : [...group.querySelectorAll('.list-item')];
    if (!allItems.length) return;

    const matched = allItems
      .map(item => ({ item, score: matchScore(item, query) }))
      .filter(s => s.score > 0);

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

    matched.sort((a, b) => b.score - a.score);
    if (container) matched.forEach(s => container.appendChild(s.item));
    matched.forEach(s => { s.item.style.display = ''; });
    rebuildBorders(matched.map(s => s.item));

    // 若 year-items 因 year toggle 被收合，展開讓結果可見，並記錄以便清空時還原
    if (container && (container.style.height === '0px' || container.style.display === 'none')) {
      collapsedBySearch.add(container);
      container.style.display = 'flex';
      container.style.height = 'auto';
      const chevron = group.querySelector('.list-year-toggle .icon-chevron-list');
      if (chevron && typeof gsap !== 'undefined') gsap.set(chevron, { rotation: 90 });  // open → 朝下
    }
  });

  hideLastSeparator(yearGroups);

  // Empty state
  const anyVisible = yearGroups.some(g => g.style.display !== 'none');
  if (query && !anyVisible) hideAllSeparators(panel);
  setEmptyState(panel, query && !anyVisible);
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

export function initActivitiesSearch() {
  // scroll hide/show filter bar
  let lastScrollY = window.scrollY;
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
  }
  scrollHandler = () => {
    const currentY = window.scrollY;
    const goingDown = currentY > lastScrollY;
    lastScrollY = currentY;

    const activeBar = document.querySelector('.activities-panel:not(.hidden) .activities-filter-bar');
    if (!activeBar) return;

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
  // SPA 離開 activities 時解綁，避免下一頁 scroll 持續觸發 query activities DOM
  registerPageCleanup(() => {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
  });

  // 切換 panel 時清除所有 bar-hidden
  document.querySelectorAll('.activities-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activities-filter-bar.bar-hidden').forEach(bar => {
        bar.classList.remove('bar-hidden');
      });
      lastScrollY = window.scrollY;
    });
  });

  const panelInputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.activities-search-input[data-panel]'));
  panelInputs.forEach(input => {
    const panelId = input.getAttribute('data-panel');
    input.addEventListener('input', () => {
      if (panelId === 'panel-degree-show') {
        applyDegreeShowSearch(input.value.trim());
      } else {
        applyGenericSearch(panelId, input.value.trim());
      }
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
