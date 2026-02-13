/**
 * Course Accordion Module
 * 課程手風琴功能（BFA & MDES 課程列表）
 */

export function initCourseAccordion() {
  const courseHeaders = document.querySelectorAll('.course-header');

  if (courseHeaders.length === 0) return;

  courseHeaders.forEach(header => {
    // Initialization: Ensure content is hidden properly for GSAP
    const content = header.nextElementSibling;
    gsap.set(content, { height: 0, overflow: 'hidden' });

    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');
      const isFirstItem = this.closest('.course-item').matches('.course-item:first-child');

      this.classList.toggle('active');
      const isActive = this.classList.contains('active');

      if (isActive) {
        // Open - 先改變 padding，然後展開內文
        this.classList.remove('py-md');
        this.classList.add('pb-xs');
        // 第一個 item 使用 pt-sm，其他使用 pt-md
        if (isFirstItem) {
          this.classList.add('pt-sm');
        } else {
          this.classList.add('pt-md');
        }
        gsap.to(content, { height: 'auto', duration: 0.5, ease: "power2.out" });
        if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.3 });
      } else {
        // Close - 先收起內文，等動畫完成後再恢復 padding
        gsap.to(content, {
          height: 0,
          duration: 0.4,
          ease: "power2.in",
          onComplete: () => {
            // 動畫完成後才恢復 py-md，這樣看起來更自然
            this.classList.remove('pb-xs', 'pt-md', 'pt-sm');
            this.classList.add('py-md');
          }
        });
        if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
      }
    });
  });
}
