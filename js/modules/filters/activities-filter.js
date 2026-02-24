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

// 每種位置套用到 header 的 class 集合
const POSITION_HEADER = {
  first:  ['pb-md'],
  only:   ['pb-md'],
  middle: ['pt-md', 'pb-md'],
  last:   ['pt-md', 'pb-md'],
};

function getPosition(idx, total) {
  if (total === 1) return 'only';
  if (idx === 0) return 'first';
  if (idx === total - 1) return 'last';
  return 'middle';
}

function applyItemPosition(item, position) {
  // Border only on first and middle
  const hasBorder = position === 'first' || position === 'middle';
  item.classList.toggle('border-b', hasBorder);
  item.classList.toggle('border-gray-9', hasBorder);

  // Padding on header (clearing is done by caller before this runs)
  const header = item.querySelector('.workshop-header');
  if (!header) return;
  const classes = POSITION_HEADER[position];
  if (classes.length) header.classList.add(...classes);
}

export function initActivitiesFilter() {
  const filterBtns = document.querySelectorAll('.activities-filter-btn');
  const yearGroups = document.querySelectorAll('.workshop-year-group');

  if (filterBtns.length === 0 || yearGroups.length === 0) return;

  let current = 'all';

  function applyFilter() {
    yearGroups.forEach(group => {
      const allItems = [...group.querySelectorAll('.workshop-item[data-category]')];

      // 顯示/隱藏 items
      allItems.forEach(item => {
        const cat = item.getAttribute('data-category');
        const visible = current === 'all' || cat === current;
        item.style.display = visible ? '' : 'none';
      });

      const visibleItems = allItems.filter(item => item.style.display !== 'none');
      const total = visibleItems.length;

      // 先清掉所有 item 的位置 class（包含被隱藏的）
      allItems.forEach(item => {
        item.classList.remove('border-b', 'border-gray-9');
        const header = item.querySelector('.workshop-header');
        if (header) header.classList.remove('pt-md', 'pb-md');
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
  }

  function updateBtnStates() {
    filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === current);
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      current = this.getAttribute('data-filter');
      updateBtnStates();
      applyFilter();
    });
  });

  // 初始化
  updateBtnStates();
  applyFilter();
}
