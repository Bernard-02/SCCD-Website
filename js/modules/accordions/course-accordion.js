/**
 * Course Accordion Module
 * 課程手風琴功能（BFA & MDES 課程列表）
 */

const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
function getRandomAccentColor() {
  return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
}

export function initCourseAccordion() {
  const courseHeaders = document.querySelectorAll('.course-header');

  if (courseHeaders.length === 0) return;

  courseHeaders.forEach(header => {
    // Initialization: Ensure content is hidden properly for GSAP
    const content = header.nextElementSibling;
    gsap.set(content, { height: 0, overflow: 'hidden' });

    // Hover: 未展開時顯示隨機色，展開後 hover 不改色
    header.addEventListener('mouseenter', function() {
      if (!this.classList.contains('active')) {
        this.style.background = getRandomAccentColor();
      }
    });
    header.addEventListener('mouseleave', function() {
      if (!this.classList.contains('active')) {
        this.style.background = '';
      }
    });

    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');

      this.classList.toggle('active');
      const isActive = this.classList.contains('active');

      if (isActive) {
        // Open - 保留 hover 時的顏色，content 繼承同色
        const color = this.style.background || getRandomAccentColor();
        this.style.background = color;
        content.style.background = color;
        this.classList.remove('py-md');
        this.classList.add('pt-md', 'pb-xs');
        gsap.to(content, { height: 'auto', duration: 0.5, ease: "power2.out" });
        if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.3 });
      } else {
        // Close - 收合完成後才清除顏色
        const header = this;
        gsap.to(content, {
          height: 0,
          duration: 0.4,
          ease: "power2.in",
          onComplete: () => {
            header.style.background = '';
            content.style.background = '';
            header.classList.remove('pt-md', 'pb-xs');
            header.classList.add('py-md');
          }
        });
        if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
      }
    });
  });
}
