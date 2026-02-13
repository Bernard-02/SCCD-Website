/**
 * Works Filter Module
 * 作品篩選功能（Design Fundamental / Animation / Creative Media）
 */

export function initWorksFilter() {
  const worksFilterButtons = document.querySelectorAll('.works-filter-btn');
  const worksContents = document.querySelectorAll('.works-content');

  if (worksFilterButtons.length === 0 || worksContents.length === 0) return;

  // Set all buttons to the same width as the widest button
  let maxWidth = 0;
  worksFilterButtons.forEach(button => {
    const width = button.offsetWidth;
    if (width > maxWidth) {
      maxWidth = width;
    }
  });
  worksFilterButtons.forEach(button => {
    button.style.width = `${maxWidth}px`;
  });

  worksFilterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      SCCDHelpers.setActive(this, worksFilterButtons);

      const filterValue = this.getAttribute('data-filter');

      // Filter contents (doesn't support 'all')
      worksContents.forEach(content => {
        content.style.display = content.getAttribute('data-category') === filterValue ? 'block' : 'none';
      });

      // Scroll to the works section
      SCCDHelpers.scrollToElement('#works-section');

      this.blur();
    });
  });
}
