/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

export function initFacultyFilter() {
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (filterButtons.length === 0 || facultyCards.length === 0) return;

  // Filter button click event
  filterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      // Set active state using helper
      SCCDHelpers.setActive(this, filterButtons);

      // Get filter value
      const filterValue = this.getAttribute('data-filter');

      // Filter cards using helper
      SCCDHelpers.filterElements(facultyCards, filterValue);

      // Scroll to the anchor with smooth behavior
      SCCDHelpers.scrollToElement('#faculty-cards');

      // Blur the button to prevent focus scroll
      this.blur();
    });
  });

  // Initialize: show only fulltime cards on page load
  facultyCards.forEach(card => {
    const cardCategory = card.getAttribute('data-category');
    if (cardCategory === 'fulltime') {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}
