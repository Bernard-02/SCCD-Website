/**
 * Activities Year Toggle Module
 * 活動年份展開/收合功能（GSAP 動畫）
 */

export function initActivitiesYearToggle() {
  const activitiesYearToggles = document.querySelectorAll('.activities-year-toggle');

  if (activitiesYearToggles.length === 0) return;

  // Initialize heights for all containers on page load
  activitiesYearToggles.forEach(toggle => {
    // Try to find parent grid (support activities-year-grid or grid-12)
    const yearGrid = toggle.closest('.activities-year-grid') || toggle.closest('.grid-12');
    if (yearGrid) {
      const itemsContainer = yearGrid.querySelector('.activities-year-items');
      const chevron = toggle.querySelector('.icon') || yearGrid.querySelector('.h-toggle .icon'); // Support both inline toggle and h-toggle wrapper

      if (itemsContainer) {
        // chevron-list 圖形朝左（0deg），rotate-90 class → 朝下 = open state
        // close state 用 rotation 0（朝左）
        const isInitiallyOpen = chevron && chevron.classList.contains('rotate-90');

        if (isInitiallyOpen) {
          gsap.set(itemsContainer, { height: 'auto', overflow: 'visible' });
        } else {
          gsap.set(itemsContainer, { height: 0, display: 'none', overflow: 'hidden' });
        }
      }
    }
  });

  // Toggle click event
  activitiesYearToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      // Find the year group container
      const yearGrid = this.closest('.activities-year-grid') || this.closest('.grid-12');

      if (!yearGrid) return;

      // Find the chevron and items container within this year group
      const chevron = this.querySelector('.icon') || yearGrid.querySelector('.h-toggle .icon');
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
          
          if (chevron) {
            // close → chevron-list 朝右 (180)
            gsap.to(chevron, { rotation: 180, duration: 0.3 });
          }
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
          
          if (chevron) {
            // open → chevron-list 朝下 (90)
            gsap.to(chevron, { rotation: 90, duration: 0.3 });
          }
        }
      }
    });
  });
}
