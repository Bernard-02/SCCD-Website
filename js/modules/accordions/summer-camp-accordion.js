/**
 * Summer Camp Accordion Module
 * 夏令營手風琴功能（使用 workshop-style 結構）
 */

export function initSummerCampAccordion() {
  const summerCampHeaders = document.querySelectorAll('.summer-camp-header');

  if (summerCampHeaders.length === 0) return;

  summerCampHeaders.forEach(header => {
    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');

      if (!content) return;

      const isOpen = content.style.height && content.style.height !== '0px';

      if (isOpen) {
        // Close
        gsap.to(content, {
          height: 0,
          duration: 0.4,
          ease: "power2.in"
        });
        if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
      } else {
        // Open
        gsap.to(content, {
          height: 'auto',
          duration: 0.5,
          ease: "power2.out"
        });
        if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.3 });
      }
    });
  });
}
