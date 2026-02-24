/**
 * Workshop Accordion Module
 * 工作營手風琴功能（包含 Year Toggle 和 Workshop Header）
 */

/**
 * Initialize Workshop Year Toggle (年份展開/收合)
 */
function initWorkshopYearToggle() {
  const workshopYearToggles = document.querySelectorAll('.workshop-year-toggle');

  if (workshopYearToggles.length === 0) return;

  // Initialize heights for all containers on page load
  workshopYearToggles.forEach(toggle => {
    const yearGrid = toggle.closest('.grid-12');
    if (yearGrid) {
      const itemsContainer = yearGrid.querySelector('.workshop-year-items');
      const chevron = yearGrid.querySelector('.fa-chevron-right');

      if (itemsContainer) {
        // Add overflow hidden to prevent content spillover during animation
        itemsContainer.style.overflow = 'hidden';

        // Check if chevron has rotate-90 class (indicates initially open)
        const isInitiallyOpen = chevron && chevron.classList.contains('rotate-90');

        if (isInitiallyOpen) {
          // Set initial height to auto for open state
          gsap.set(itemsContainer, { height: 'auto' });
        } else {
          // Set initial height to 0 and hide for closed state
          gsap.set(itemsContainer, { height: 0, display: 'none' });
        }
      }
    }
  });

  workshopYearToggles.forEach(toggle => {
    if (toggle.dataset.accordionInit) return;
    toggle.dataset.accordionInit = '1';
    toggle.addEventListener('click', function() {
      // Find the year group container (parent of the grid-12)
      const yearGrid = this.closest('.grid-12');

      if (!yearGrid) return;

      // Find the chevron and items container within this year group
      const chevron = yearGrid.querySelector('.fa-chevron-right');
      const itemsContainer = yearGrid.querySelector('.workshop-year-items');

      if (itemsContainer) {
        // Check if currently open (check if height is set and not 0)
        const isOpen = itemsContainer.style.height && itemsContainer.style.height !== '0px';

        if (isOpen) {
          // Close with GSAP animation
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
          gsap.to(itemsContainer, {
            height: 'auto',
            duration: 0.5,
            ease: "power2.out"
          });
          if (chevron) gsap.to(chevron, { rotation: 90, duration: 0.3 });
        }
      }
    });
  });
}

/**
 * Initialize Workshop Header Accordion (個別工作營展開/收合)
 */
function initWorkshopHeaderAccordion() {
  const workshopHeaders = document.querySelectorAll('.workshop-header');

  if (workshopHeaders.length === 0) return;

  workshopHeaders.forEach(header => {
    if (header.dataset.accordionInit) return;
    header.dataset.accordionInit = '1';

    // Initialization: Ensure content is hidden properly for GSAP
    const content = header.nextElementSibling;
    gsap.set(content, { height: 0, overflow: 'hidden' });

    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');

      // Toggle active state
      this.classList.toggle('active');
      const isActive = this.classList.contains('active');

      if (isActive) {
        // Open
        gsap.to(content, { height: 'auto', duration: 0.5, ease: "power2.out" });
        gsap.to(chevron, { rotation: 180, duration: 0.3 });
      } else {
        // Close
        gsap.to(content, { height: 0, duration: 0.4, ease: "power2.in" });
        gsap.to(chevron, { rotation: 0, duration: 0.3 });
      }
    });
  });
}

/**
 * Main export function
 */
export function initWorkshopAccordion() {
  initWorkshopYearToggle();
  initWorkshopHeaderAccordion();
}
