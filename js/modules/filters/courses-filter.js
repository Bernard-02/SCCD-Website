/**
 * Courses Filter Module
 * 課程篩選功能（BFA / MDES）
 */

export function initCoursesFilter() {
  const coursesFilterButtons = document.querySelectorAll('.courses-filter-btn');
  const coursesYearGroups = document.querySelectorAll('.courses-year-group');

  if (coursesFilterButtons.length === 0 || coursesYearGroups.length === 0) return;

  const FILTER_COLORS = ['#26BCFF', '#FF448A', '#00FF80'];
  let lastColorIndex = -1;

  function getRandomColor() {
    let index;
    do { index = Math.floor(Math.random() * FILTER_COLORS.length); } while (index === lastColorIndex);
    lastColorIndex = index;
    return FILTER_COLORS[index];
  }

  coursesFilterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      coursesFilterButtons.forEach(btn => btn.style.color = '');
      this.style.color = getRandomColor();

      SCCDHelpers.setActive(this, coursesFilterButtons);

      const filterValue = this.getAttribute('data-filter');

      coursesYearGroups.forEach(group => {
        group.style.display = group.getAttribute('data-year') === filterValue ? 'block' : 'none';
      });

      // Scroll to the courses section
      const section = document.querySelector('.courses-content-section');
      const header = document.querySelector('header');
      const offset = header ? -header.offsetHeight : 0;
      SCCDHelpers.scrollToElement(section, offset);

      this.blur();
    });
  });
}
