/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

import { animateCards } from '../ui/scroll-animate.js';

export function initFacultyFilter() {
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (filterButtons.length === 0 || facultyCards.length === 0) return;

  function setActiveStyle(activeBtn, color) {
    const rot = SCCDHelpers.getRandomRotation();
    filterButtons.forEach(btn => {
      const inner = btn.querySelector('.anchor-nav-inner');
      if (inner) {
        inner.style.background = '';
        inner.style.transform = '';
      }
    });
    const activeInner = activeBtn.querySelector('.anchor-nav-inner');
    if (activeInner) {
      activeInner.style.background = color;
      activeInner.style.transform = `rotate(${rot}deg)`;
    }
  }

  // Filter button click event
  filterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      // Reset color on all buttons, set random color on active
      const color = SCCDHelpers.getRandomAccentColor();
      setActiveStyle(this, color);

      // Set active state using helper
      SCCDHelpers.setActive(this, filterButtons);

      // Get filter value
      const filterValue = this.getAttribute('data-filter');

      // Filter cards using helper
      SCCDHelpers.filterElements(facultyCards, filterValue);

      // Get visible cards and animate them
      const visibleCards = Array.from(facultyCards).filter(card => card.style.display !== 'none');
      animateCards(visibleCards, false, { fadeIn: true });

      // Scroll to the anchor with smooth behavior
      SCCDHelpers.scrollToElement('#faculty-cards');

      // Blur the button to prevent focus scroll
      this.blur();
    });
  });

  // Initialize: set random color on the default active button
  const defaultBtn = [...filterButtons].find(b => b.getAttribute('data-filter') === 'fulltime');
  if (defaultBtn) setActiveStyle(defaultBtn, SCCDHelpers.getRandomAccentColor());

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
  animateCards(initialCards, true, { fadeIn: true }); // Enable ScrollTrigger for initial load
}
