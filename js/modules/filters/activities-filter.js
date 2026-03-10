/**
 * Activities Filter Module
 * 活動篩選功能 - 單選模式（含 All 全部）
 *
 * Item 位置樣式規則：
 *   first  → no pt, pb-md, border-b border-gray-9
 *   middle → pt-md, pb-md, border-b border-gray-9
 *   last   → pt-md, pb-md, no border
 *   only   → no pt, pb-md, no border
 *
 * 分隔線 pt 需補償 last item 的 pb-md，避免間距過大
 */

import { getCurrentSectionColor } from '../pages/activities-section-switch.js';
import { getGroupScrollTriggers, playGroupsInSequence } from '../pages/general-activities-data-loader.js';

function getPosition(idx, total) {
  if (total === 1) return 'only';
  if (idx === 0) return 'first';
  if (idx === total - 1) return 'last';
  return 'middle';
}

function applyItemPosition(item, position) {
  // Border only on first and middle (last item has no bottom border)
  const hasBorder = position === 'first' || position === 'middle';
  item.classList.toggle('border-b-4', hasBorder);
  item.classList.toggle('border-black', hasBorder);
}

let _applyFilter = null;
let _getMomentQuery = null;
export function reapplyMomentFilter() {
  const query = _getMomentQuery ? _getMomentQuery() : '';
  if (query) {
    // 有搜尋關鍵字時，通知 search module 重跑搜尋（以搜尋結果為主）
    document.dispatchEvent(new CustomEvent('moment-reapply-search'));
  } else {
    if (_applyFilter) _applyFilter();
  }
}
export function setMomentQueryGetter(fn) { _getMomentQuery = fn; }

export function initActivitiesFilter() {
  const filterBtns = document.querySelectorAll('.activities-filter-btn');

  if (filterBtns.length === 0) return;

  let current = 'all';

  function applyFilter() {
    const panelGeneral = document.getElementById('panel-general');
    if (!panelGeneral) return;

    // 顯示/隱藏分類標籤：只有 all 時顯示
    panelGeneral.querySelectorAll('.item-category-label').forEach(el => {
      el.style.display = current === 'all' ? '' : 'none';
    });

    const yearGroups = panelGeneral.querySelectorAll('.workshop-year-group');
    if (yearGroups.length === 0) return;

    yearGroups.forEach(group => {
      const allItems = [...group.querySelectorAll('.workshop-item[data-category]')];

      // 顯示/隱藏 items（seminars 已移至 lectures panel，moment 不顯示）
      allItems.forEach(item => {
        const cat = item.getAttribute('data-category');
        const visible = cat !== 'seminars' && (current === 'all' || cat === current);
        item.style.display = visible ? '' : 'none';
      });

      const visibleItems = allItems.filter(item => item.style.display !== 'none');
      const total = visibleItems.length;

      // 先清掉所有 item 的位置 class（包含被隱藏的）
      allItems.forEach(item => {
        item.classList.remove('border-b-4', 'border-black');
      });

      // 對可見 item 套用正確的位置樣式
      visibleItems.forEach((item, idx) => {
        applyItemPosition(item, getPosition(idx, total));
      });

      // year group 顯示控制
      const hasVisible = total > 0;
      group.style.display = hasVisible ? '' : 'none';

      // 緊接的分隔線跟著 group 顯示/隱藏
      const separator = group.nextElementSibling;
      if (separator && separator.classList.contains('activities-separator')) {
        separator.style.display = hasVisible ? '' : 'none';
      }

    });

    // 最後一個可見 group 的分隔線強制隱藏（避免尾端多一條線）
    let lastVisibleGroup = null;
    yearGroups.forEach(group => {
      if (group.style.display !== 'none') lastVisibleGroup = group;
    });
    if (lastVisibleGroup) {
      const sep = lastVisibleGroup.nextElementSibling;
      if (sep && sep.classList.contains('activities-separator')) {
        sep.style.display = 'none';
      }
    }

    // Kill 舊的 ScrollTriggers，改用統一依序播放動畫
    const stMap = getGroupScrollTriggers();
    stMap.forEach(st => st && st.kill());
    stMap.clear();

    const visibleGroups = [...yearGroups].filter(g => g.style.display !== 'none');
    playGroupsInSequence(visibleGroups);

    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
  }

  function updateBtnStates() {
    const color = getCurrentSectionColor();
    const rot = SCCDHelpers.getRandomRotation();
    filterBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-filter') === current;
      btn.classList.toggle('active', isActive);
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) {
        inner.style.background = isActive ? color : '';
        inner.style.transform = isActive ? `rotate(${rot}deg)` : '';
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      current = this.getAttribute('data-filter');
      updateBtnStates();
      reapplyMomentFilter();
    });
  });

  // 初始化
  _applyFilter = applyFilter;
  updateBtnStates();
  applyFilter();
}
