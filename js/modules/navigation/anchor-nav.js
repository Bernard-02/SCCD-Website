/**
 * Anchor Navigation Module (About Page)
 * About 頁面錨點導航功能
 */

export function initAnchorNav() {
  const anchorNav = document.getElementById('anchor-nav');
  const anchorNavButtons = document.querySelectorAll('.anchor-nav-btn');

  if (!anchorNav || anchorNavButtons.length === 0) return;

  // Handle anchor navigation clicks
  anchorNavButtons.forEach(button => {
    button.addEventListener('click', function() {
      const targetId = this.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        // Get the section's position and scroll with offset
        const yOffset = 0; // Align to top of section
        const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;

        window.scrollTo({
          top: y,
          behavior: 'smooth'
        });
      }

      this.blur();
    });
  });

  // Highlight active anchor based on scroll position
  window.addEventListener('scroll', function() {
    const sections = ['overview', 'bfa-class', 'mdes-class', 'resources', 'alumni'];
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    let activeSection = null;

    sections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) {
        const rect = section.getBoundingClientRect();

        // Check if the section's top is at or above the viewport top (y = 0)
        // Use a small threshold to account for rounding
        if (rect.top <= 50 && rect.bottom > 50) {
          activeSection = sectionId;
        }
      }
    });

    if (activeSection) {
      anchorNavButtons.forEach(btn => {
        if (btn.getAttribute('data-target') === activeSection) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  });
}
