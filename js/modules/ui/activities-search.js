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
    el.innerHTML = '<div class="col-span-12 md:col-span-11 md:col-start-2 md:pl-[41px] py-xl text-center"><p class="text-p1">Nothing here</p><p class="text-p1">這裡什麼都沒有</p></div>';
    panel.appendChild(el);
  }
  return el;
}

function setEmptyState(panel, show) {
  const el = getOrCreateEmptyState(panel);
  el.classList.toggle('hidden', !show);
}

// ── Border 重建 ───────────────────────────────────────────────────────────

function rebuildBorders(visibleItems) {
  visibleItems.forEach((item, idx) => {
    const isLast = idx === visibleItems.length - 1;
    item.classList.toggle('border-b-4', !isLast);
    item.classList.toggle('border-black', !isLast);
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
    yearGroups.forEach(group => {
      const container = group.querySelector('.list-year-items');
      const original = container ? originalOrders.get(container) : null;
      if (original) original.forEach(item => container.appendChild(item));
      const allItems = [...group.querySelectorAll('.list-item')];
      allItems.forEach(item => { item.style.display = ''; });
      group.style.display = '';
      const sep = group.nextElementSibling;
      if (sep?.classList.contains('activities-separator')) sep.style.display = '';
      rebuildBorders(allItems);
      // 還原被 search 強制展開的 year-items
      if (container && collapsedBySearch.has(container)) {
        container.style.display = 'none';
        container.style.height = '0px';
        const chevron = group.querySelector('.list-year-toggle .fa-chevron-right');
        if (chevron) gsap.set(chevron, { rotation: 0 });
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
      const sep = group.nextElementSibling;
      if (sep?.classList.contains('activities-separator')) sep.style.display = 'none';
      return;
    }

    group.style.display = '';
    const sep = group.nextElementSibling;
    if (sep?.classList.contains('activities-separator')) sep.style.display = '';

    allItems.forEach(item => {
      item.style.display = 'none';
      item.classList.remove('border-b-4', 'border-black');
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
      const chevron = group.querySelector('.list-year-toggle .fa-chevron-right');
      if (chevron) gsap.set(chevron, { rotation: 90 });
    }
  });

  hideLastSeparator(yearGroups);

  // Empty state
  const anyVisible = yearGroups.some(g => g.style.display !== 'none');
  setEmptyState(panel, query && !anyVisible);
}

function hideLastSeparator(yearGroups) {
  let lastVisible = null;
  yearGroups.forEach(g => { if (g.style.display !== 'none') lastVisible = g; });
  if (lastVisible) {
    const sep = lastVisible.nextElementSibling;
    if (sep?.classList.contains('activities-separator')) sep.style.display = 'none';
  }
}

// ── Degree Show 搜尋（卡片結構，非 list-year-group）─────────────────────────

function applyDegreeShowSearch(query) {
  const container = document.getElementById('degree-show-list');
  if (!container) return;
  const cards = [...container.querySelectorAll('.degree-show-card')];
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
  const input = panel.querySelector(`.activities-search-input[data-panel="${panelId}"]`);
  if (!input) return;
  const query = input.value.trim();
  if (panelId === 'panel-degree-show') {
    applyDegreeShowSearch(query);
  } else {
    applyGenericSearch(panelId, query);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

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

    if (goingDown && currentY > 50) {
      activeBar.classList.add('bar-hidden');
    } else {
      activeBar.classList.remove('bar-hidden');
    }
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  // 切換 panel 時清除所有 bar-hidden
  document.querySelectorAll('.activities-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activities-filter-bar.bar-hidden').forEach(bar => {
        bar.classList.remove('bar-hidden');
      });
      lastScrollY = window.scrollY;
    });
  });

  const panelInputs = document.querySelectorAll('.activities-search-input[data-panel]');
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
        const panelInput = document.querySelector(`.activities-search-input[data-panel="panel-${section}"]`);
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
