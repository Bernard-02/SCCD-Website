/**
 * SCCD Utility Helpers — IIFE 掛 window.SCCDHelpers
 * <script src="js/utils/helpers.js"> 在所有 HTML head 最後一個 script，先於 main-modular.js
 */

window.SCCDHelpers = window.SCCDHelpers || /** @type {SCCDHelpersAPI} */ ({});

(function(Helpers) {
  'use strict';

  Helpers.isMobile = function() {
    return window.innerWidth < 768;
  };

  Helpers.isDesktop = function() {
    return window.innerWidth >= 768;
  };

  Helpers.scrollToElement = function(target, offset, behavior) {
    offset = offset || 0;
    behavior = behavior || 'smooth';

    let element;
    if (typeof target === 'string') {
      if (!target.startsWith('#')) return;
      try {
        element = document.querySelector(target);
      } catch (e) {
        return;
      }
    } else {
      element = target;
    }

    if (!element) return;

    const y = element.getBoundingClientRect().top + window.pageYOffset + offset;
    window.scrollTo({ top: y, behavior: behavior });
  };

  Helpers.setActive = function(activeElement, siblings, activeClass) {
    if (!activeElement) return;
    activeClass = activeClass || 'active';
    siblings.forEach(function(el) { el.classList.remove(activeClass); });
    activeElement.classList.add(activeClass);
  };

  Helpers.filterElements = function(elements, filterValue, displayStyle, dataAttribute) {
    displayStyle = displayStyle || 'block';
    dataAttribute = dataAttribute || 'data-category';

    elements.forEach(function(el) {
      const category = el.getAttribute(dataAttribute);
      el.style.display = (filterValue === 'all' || category === filterValue) ? displayStyle : 'none';
    });
  };

  const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  let _lastColorIndex = -1;

  Helpers.getRandomAccentColor = function() {
    let index;
    do { index = Math.floor(Math.random() * ACCENT_COLORS.length); } while (index === _lastColorIndex);
    _lastColorIndex = index;
    return ACCENT_COLORS[index];
  };

  Helpers.getRandomRotation = function() {
    let deg;
    do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
    return deg;
  };

})(window.SCCDHelpers);

// Register GSAP plugins（需在 GSAP 載入後執行）
if (typeof gsap !== 'undefined') {
  const plugins = [];
  if (typeof ScrollTrigger !== 'undefined') plugins.push(ScrollTrigger);
  if (typeof ScrollToPlugin !== 'undefined') plugins.push(ScrollToPlugin);
  if (plugins.length > 0) gsap.registerPlugin(...plugins);
}
