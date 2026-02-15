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
      const chevron = yearGrid.querySelector('.h-toggle i'); // Select generic icon

      if (itemsContainer) {
        // Determine initial state based on chevron type or class
        // For General Activities (chevron-down): initially open (0 deg), closed (180 deg)
        // For Records (chevron-right): initially open (rotate-90), closed (0 deg)
        
        const isChevronDown = chevron && chevron.classList.contains('fa-chevron-down');
        const isChevronRight = chevron && chevron.classList.contains('fa-chevron-right');
        
        // Default to open for General Activities (no rotate class needed for down icon to be open/down)
        // For Records, check for rotate-90
        const isInitiallyOpen = isChevronDown || (isChevronRight && chevron.classList.contains('rotate-90'));

        if (isInitiallyOpen) {
          // Set initial height to auto for open state
          gsap.set(itemsContainer, { height: 'auto', overflow: 'visible' });
        } else {
          // Set initial height to 0 and hide for closed state
          gsap.set(itemsContainer, { height: 0, display: 'none', overflow: 'hidden' });
          // If closed and chevron-down, set to 180 (Up)
          if (isChevronDown) gsap.set(chevron, { rotation: 180 });
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
      const chevron = yearGrid.querySelector('.h-toggle i');
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
            // If chevron-down: rotate to 180 (Up)
            // If chevron-right: rotate to 0 (Right)
            const targetRotation = chevron.classList.contains('fa-chevron-down') ? 180 : 0;
            gsap.to(chevron, { rotation: targetRotation, duration: 0.3 });
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
            // If chevron-down: rotate to 0 (Down)
            // If chevron-right: rotate to 90 (Down)
            const targetRotation = chevron.classList.contains('fa-chevron-down') ? 0 : 90;
            gsap.to(chevron, { rotation: targetRotation, duration: 0.3 });
          }
        }
      }
    });
  });
}
