/**
 * Activities Year Toggle Module
 * 活動年份展開/收合功能（GSAP 動畫）
 */

export function initActivitiesYearToggle() {
  const activitiesYearToggles = document.querySelectorAll('.activities-year-toggle');

  if (activitiesYearToggles.length === 0) return;

  // Initialize heights for all containers on page load
  activitiesYearToggles.forEach(toggle => {
    // Try to find parent grid (either grid-cols-11 for general-activities or grid-12 for records)
    const yearGrid = toggle.closest('.grid.grid-cols-11') || toggle.closest('.grid-12');
    if (yearGrid) {
      const itemsContainer = yearGrid.querySelector('.activities-year-items');
      const chevron = yearGrid.querySelector('.fa-chevron-right');

      if (itemsContainer) {
        // Check if chevron has rotate-90 class (indicates initially open)
        const isInitiallyOpen = chevron && chevron.classList.contains('rotate-90');

        if (isInitiallyOpen) {
          // Set initial height to auto for open state
          gsap.set(itemsContainer, { height: 'auto', overflow: 'visible' });
        } else {
          // Set initial height to 0 and hide for closed state
          gsap.set(itemsContainer, { height: 0, display: 'none', overflow: 'hidden' });
        }
      }
    }
  });

  // Toggle click event
  activitiesYearToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      // Find the year group container (parent of the grid) - support both grid-cols-11 and grid-12
      const yearGrid = this.closest('.grid.grid-cols-11') || this.closest('.grid-12');

      if (!yearGrid) return;

      // Find the chevron and items container within this year group
      const chevron = yearGrid.querySelector('.fa-chevron-right');
      const itemsContainer = yearGrid.querySelector('.activities-year-items');

      if (itemsContainer) {
        // Check if currently open (check if height is set and not 0)
        const isOpen = itemsContainer.style.height && itemsContainer.style.height !== '0px';

        if (isOpen) {
          // Close with GSAP animation
          itemsContainer.style.overflow = 'hidden'; // Set overflow hidden during animation
          gsap.to(itemsContainer, {
            height: 0,
            duration: 0.4,
            ease: "power2.in",
            onComplete: () => {
              itemsContainer.style.display = 'none';
            }
          });
          if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
        } else {
          // Open with GSAP animation
          itemsContainer.style.display = 'flex';
          itemsContainer.style.overflow = 'hidden'; // Set overflow hidden during animation
          gsap.to(itemsContainer, {
            height: 'auto',
            duration: 0.5,
            ease: "power2.out",
            onComplete: () => {
              itemsContainer.style.overflow = 'visible'; // Set to visible after animation completes
            }
          });
          if (chevron) gsap.to(chevron, { rotation: 90, duration: 0.3 });
        }
      }
    });
  });
}
