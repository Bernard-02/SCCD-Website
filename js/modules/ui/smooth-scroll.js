/**
 * Smooth Scroll Module
 * 平滑滾動功能（錨點連結）
 */

export function initSmoothScroll() {
  // Add smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const href = this.getAttribute('href');
      SCCDHelpers.scrollToElement(href);
    });
  });
}
