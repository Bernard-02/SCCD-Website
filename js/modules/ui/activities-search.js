/**
 * Activities Search Module
 * 各 panel 各自的 search input，對應各自 panel 內容
 * Moment / Lectures / Workshop / Students Present panel search bar（純 sticky）
 * 有搜尋時以 filter + search 結果為主；無搜尋時回到 filter 結果
 */

import { reapplyMomentFilter, setMomentQueryGetter } from '../filters/activities-filter.js';
import { getGroupScrollTriggers, playGroupsInSequence } from '../pages/general-activities-data-loader.js';

// ── 搜尋工具 ───────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function matchScore(item, query) {
  const q = query.toLowerCase();
  const titleEl = item.querySelector('.workshop-header .text-h5, .workshop-header div[class*="font-bold"]');
  const title = titleEl ? titleEl.textContent.toLowerCase() : '';
  const contentEl = item.querySelector('.workshop-content');
  const content = contentEl ? stripHtml(contentEl.innerHTML).toLowerCase() : '';

  // 標題優先：完全符合=3，含關鍵字=2，只有內容含關鍵字=1
  if (title === q) return 3;
  if (title.includes(q)) return 2;
  if (content.includes(q)) return 1;
  return 0;
}

// ── Border 重建（不操作 mt，間距完全靠 workshop-header 的 py-md） ──────────

function rebuildBorders(visibleItems) {
  visibleItems.forEach((item, idx) => {
    const isLast = idx === visibleItems.length - 1;
    item.classList.toggle('border-b-4', !isLast);
    item.classList.toggle('border-black', !isLast);
  });
}

// ── Moment panel 搜尋 ─────────────────────────────────────────────────────

function getActiveMomentFilter() {
  const activeBtn = document.querySelector('.activities-filter-btn.active');
  return activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
}

// 記住每個 items container 的原始 DOM 順序
const originalOrders = new Map();

function saveOriginalOrder(panel) {
  panel.querySelectorAll('.workshop-year-items').forEach(container => {
    if (!originalOrders.has(container)) {
      originalOrders.set(container, [...container.querySelectorAll('.workshop-item[data-category]')]);
    }
  });
}

function restoreOriginalOrder(panel) {
  panel.querySelectorAll('.workshop-year-items').forEach(container => {
    const original = originalOrders.get(container);
    if (original) original.forEach(item => container.appendChild(item));
  });
}

function applyMomentSearch(query) {
  const panel = document.getElementById('panel-general');
  if (!panel) return;

  saveOriginalOrder(panel);

  if (!query) {
    restoreOriginalOrder(panel);
    panel.querySelectorAll('.workshop-item[data-category]').forEach(item => {
      item.style.display = '';
    });
    panel.querySelectorAll('.workshop-year-group').forEach(group => {
      group.style.display = '';
      const sep = group.nextElementSibling;
      if (sep?.classList.contains('activities-separator')) sep.style.display = '';
    });
    reapplyMomentFilter();
    return;
  }

  const activeFilter = getActiveMomentFilter();
  const yearGroups = [...panel.querySelectorAll('.workshop-year-group')];

  yearGroups.forEach(group => {
    const allItems = [...group.querySelectorAll('.workshop-item[data-category]')];
    if (!allItems.length) return;

    const itemsContainer = group.querySelector('.workshop-year-items');

    const scored = allItems.map(item => ({
      item,
      score: matchScore(item, query),
      // seminars 已移至 lectures panel，moment 搜尋排除
      inFilter: item.getAttribute('data-category') !== 'seminars' &&
                (activeFilter === 'all' || item.getAttribute('data-category') === activeFilter),
    }));
    // 必須同時符合搜尋關鍵字與目前 filter
    const matched = scored.filter(s => s.score > 0 && s.inFilter);

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

    // 先全部隱藏並清 border
    allItems.forEach(item => {
      item.style.display = 'none';
      item.classList.remove('border-b-4', 'border-black');
    });

    // 按 score 排序後重新插入 DOM（視覺與 DOM 順序一致，border 才準確）
    matched.sort((a, b) => b.score - a.score);
    if (itemsContainer) {
      matched.forEach(s => itemsContainer.appendChild(s.item));
    }
    matched.forEach(s => { s.item.style.display = ''; });
    rebuildBorders(matched.map(s => s.item));
  });

  hideLastSeparator(yearGroups);

  // 播放進場動畫
  const stMap = getGroupScrollTriggers();
  stMap.forEach(st => st && st.kill());
  stMap.clear();
  const visibleGroups = yearGroups.filter(g => g.style.display !== 'none');
  playGroupsInSequence(visibleGroups);
  if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
}

// ── Generic panel 搜尋 ─────────────────────────────────────────────────────

function applyGenericSearch(panelId, query) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const yearGroups = [...panel.querySelectorAll('.workshop-year-group')];

  // 儲存原始 DOM 順序（第一次呼叫時記住）
  yearGroups.forEach(group => {
    const container = group.querySelector('.workshop-year-items');
    if (container && !originalOrders.has(container)) {
      originalOrders.set(container, [...container.querySelectorAll('.workshop-item')]);
    }
  });

  if (!query) {
    // 還原原始 DOM 順序
    yearGroups.forEach(group => {
      const container = group.querySelector('.workshop-year-items');
      const original = container ? originalOrders.get(container) : null;
      if (original) original.forEach(item => container.appendChild(item));
      const allItems = [...group.querySelectorAll('.workshop-item')];
      allItems.forEach(item => { item.style.display = ''; });
      group.style.display = '';
      const sep = group.nextElementSibling;
      if (sep?.classList.contains('activities-separator')) sep.style.display = '';
      rebuildBorders(allItems);
    });
    hideLastSeparator(yearGroups);
    return;
  }

  yearGroups.forEach(group => {
    const allItems = [...group.querySelectorAll('.workshop-item')];
    if (!allItems.length) return;

    const itemsContainer = group.querySelector('.workshop-year-items');
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

    // 按 score 排序後重新插入 DOM
    matched.sort((a, b) => b.score - a.score);
    if (itemsContainer) {
      matched.forEach(s => itemsContainer.appendChild(s.item));
    }
    matched.forEach(s => { s.item.style.display = ''; });
    rebuildBorders(matched.map(s => s.item));
  });

  hideLastSeparator(yearGroups);
}

function hideLastSeparator(yearGroups) {
  let lastVisible = null;
  yearGroups.forEach(g => { if (g.style.display !== 'none') lastVisible = g; });
  if (lastVisible) {
    const sep = lastVisible.nextElementSibling;
    if (sep?.classList.contains('activities-separator')) sep.style.display = 'none';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

export function initActivitiesSearch() {
  // 1. Moment panel
  const momentInput = document.getElementById('activities-search-input');

  if (momentInput) {
    setMomentQueryGetter(() => momentInput.value.trim());

    momentInput.addEventListener('input', () => {
      applyMomentSearch(momentInput.value.trim());
    });

    // filter 切換有 query 時，重跑搜尋（以搜尋結果為主）
    document.addEventListener('moment-reapply-search', () => {
      applyMomentSearch(momentInput.value.trim());
    });
  }

  // 2. Workshop panel
  const workshopInput = document.querySelector('.activities-search-input[data-panel="panel-workshop"]');

  if (workshopInput) {
    workshopInput.addEventListener('input', () => {
      applyGenericSearch('panel-workshop', workshopInput.value.trim());
    });
  }

  // 3. Students Present panel
  const studentsInput = document.querySelector('.activities-search-input[data-panel="panel-students-present"]');

  if (studentsInput) {
    studentsInput.addEventListener('input', () => {
      applyGenericSearch('panel-students-present', studentsInput.value.trim());
    });
  }

  // 4. Lectures panel（不需 scroll hide，但要搜尋）
  const lecturesInput = document.querySelector('.activities-search-input[data-panel="panel-lectures"]');
  if (lecturesInput) {
    lecturesInput.addEventListener('input', () => {
      applyGenericSearch('panel-lectures', lecturesInput.value.trim());
    });
  }

  // 5. 切換 panel 時重新 apply 各 input 的搜尋
  document.querySelectorAll('.activities-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      setTimeout(() => {
        if (section === 'general' && momentInput) {
          applyMomentSearch(momentInput.value.trim());
        } else if (section === 'workshop' && workshopInput) {
          applyGenericSearch('panel-workshop', workshopInput.value.trim());
        } else if (section === 'students-present' && studentsInput) {
          applyGenericSearch('panel-students-present', studentsInput.value.trim());
        } else if (section === 'lectures' && lecturesInput) {
          applyGenericSearch('panel-lectures', lecturesInput.value.trim());
        }
      }, 300);
    });
  });
}
