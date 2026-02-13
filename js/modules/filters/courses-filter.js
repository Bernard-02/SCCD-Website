/**
 * Courses Filter Module
 * 課程篩選功能（BFA / MDES）
 */

export function initCoursesFilter() {
  const coursesFilterButtons = document.querySelectorAll('.courses-filter-btn');
  const coursesYearGroups = document.querySelectorAll('.courses-year-group');

  if (coursesFilterButtons.length === 0 || coursesYearGroups.length === 0) return;

  coursesFilterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      SCCDHelpers.setActive(this, coursesFilterButtons);

      const filterValue = this.getAttribute('data-filter');

      coursesYearGroups.forEach(group => {
        group.style.display = group.getAttribute('data-year') === filterValue ? 'block' : 'none';
      });

      // Scroll to the courses section
      SCCDHelpers.scrollToElement('.courses-content-section');

      this.blur();
    });
  });
}
