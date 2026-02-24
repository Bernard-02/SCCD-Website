/**
 * Support Link Random Color
 * hover 時從三個輔助色中隨機挑一個顯示
 */

const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

export function initSupportLinkColor() {
  const links = document.querySelectorAll('.support-link');
  if (links.length === 0) return;

  links.forEach(link => {
    link.addEventListener('mouseenter', () => {
      const color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      link.style.color = color;
    });
    link.addEventListener('mouseleave', () => {
      link.style.color = '';
    });
  });
}
