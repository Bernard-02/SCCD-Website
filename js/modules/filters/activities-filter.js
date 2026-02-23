/**
 * Activities Filter Module
 * 活動篩選功能（All / Lectures / Visits / Exhibitions / Conferences / Competitions）
 */

/**
 * Update activities item styles dynamically per year group
 * 根據可見項目動態調整樣式（首個、中間、最後一個）
 */
function updateActivitiesItemStyles() {
  document.querySelectorAll('.activities-year-items').forEach(yearGroup => {
    const visible = [];
    yearGroup.querySelectorAll('.activities-item').forEach(item => {
      if (item.style.display !== 'none') visible.push(item);
    });

    visible.forEach((item, idx) => {
      item.classList.remove('pt-xs', 'pt-md', 'pb-xs', 'pb-md', 'py-md');

      if (visible.length === 1) {
        item.classList.add('pt-xs', 'pb-xs');
      } else if (idx === 0) {
        item.classList.add('pt-xs', 'pb-md');
      } else if (idx === visible.length - 1) {
        item.classList.add('pt-md', 'pb-xs');
      } else {
        item.classList.add('py-md');
      }

      if (idx === visible.length - 1) {
        item.classList.remove('border-b', 'border-gray-9');
      } else {
        item.classList.add('border-b', 'border-gray-9');
      }
    });
  });
}

export function initActivitiesFilter() {
  const activitiesFilterButtons = document.querySelectorAll('.activities-filter-btn');
  const activitiesItems = document.querySelectorAll('.activities-item');

  if (activitiesFilterButtons.length === 0 || activitiesItems.length === 0) return;

  activitiesFilterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      SCCDHelpers.setActive(this, activitiesFilterButtons);

      const filterValue = this.getAttribute('data-filter');

      // Use helper to filter elements
      SCCDHelpers.filterElements(activitiesItems, filterValue, 'grid');

      updateActivitiesItemStyles();

      // Scroll to the activities section
      const header = document.querySelector('header');
      const offset = header ? -header.offsetHeight : 0;
      SCCDHelpers.scrollToElement('#activities-section', offset);

      this.blur();
    });
  });

  // Initialize styles on page load
  updateActivitiesItemStyles();
}
