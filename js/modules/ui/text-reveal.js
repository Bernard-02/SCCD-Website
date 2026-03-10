/**
 * Text Reveal Module
 * 逐行（line）進場動畫，使用 GSAP SplitText + ScrollTrigger
 *
 * 使用方式：
 *   1. 在目標元素加上 data-text-reveal attribute（可選 data-text-reveal-delay="0.2"）
 *   2. 呼叫 initTextReveal() 或 initTextReveal('[data-text-reveal]')
 *
 * @param {string} selector - CSS selector，預設 '[data-text-reveal]'
 */
export function initTextReveal(selector = '[data-text-reveal]') {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const elements = document.querySelectorAll(selector);
  if (!elements.length) return;

  elements.forEach(el => {
    const delay = parseFloat(el.dataset.textRevealDelay || '0');

    gsap.set(el, { y: 40, opacity: 0 });

    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power3.out',
          delay,
          clearProps: 'transform,opacity',
        });
      },
    });
  });
}
