/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

export function initFacultyFilter() {
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (filterButtons.length === 0 || facultyCards.length === 0) return;

  let batchTriggers = [];

  // Animation Helper
  const animateCards = (cards, useScrollTrigger = false) => {
    if (typeof gsap === 'undefined') return;

    gsap.killTweensOf(cards);
    
    // Kill previous ScrollTriggers
    batchTriggers.forEach(t => t.kill());
    batchTriggers = [];

    // Set initial state
    gsap.set(cards, { 
      y: 100
    });

    if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
      const batches = ScrollTrigger.batch(cards, {
        start: "top 90%",
        onEnter: batch => {
          gsap.to(batch, {
            y: 0,
            duration: 0.8,
            stagger: {
              each: 0.1,
              grid: 'auto',
              axis: 'y'
            },
            ease: "power2.out",
            overwrite: true,
            clearProps: "transform"
          });
        },
        once: true
      });
      batchTriggers.push(...batches);
    } else {
      gsap.to(cards, {
        y: 0,
        duration: 0.8,
        stagger: {
          each: 0.05,
          grid: 'auto',
          axis: 'y'
        },
        ease: "power2.out",
        clearProps: "transform"
      });
    }
  };

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

      // Get visible cards and animate them
      const visibleCards = Array.from(facultyCards).filter(card => card.style.display !== 'none');
      animateCards(visibleCards);

      // Scroll to the anchor with smooth behavior
      SCCDHelpers.scrollToElement('#faculty-cards');

      // Blur the button to prevent focus scroll
      this.blur();
    });
  });

  // Initialize: show only fulltime cards on page load
  const initialFilter = 'fulltime';
  facultyCards.forEach(card => {
    const cardCategory = card.getAttribute('data-category');
    if (cardCategory === initialFilter) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });

  // Animate initial cards
  const initialCards = Array.from(facultyCards).filter(c => c.getAttribute('data-category') === initialFilter);
  animateCards(initialCards, true); // Enable ScrollTrigger for initial load
}
