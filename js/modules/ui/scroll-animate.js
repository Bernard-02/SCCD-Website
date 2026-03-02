/**
 * Scroll Animate Module
 * 通用卡片進場動畫，可搭配 ScrollTrigger 或直接執行
 */

/**
 * 為一組卡片元素加上進場動畫
 * @param {Element[]|NodeList} elements - 要動畫的元素
 * @param {boolean} useScrollTrigger - 是否使用 ScrollTrigger（頁面初次載入用 true，filter 切換用 false）
 * @param {object} options - 動畫選項
 * @param {boolean} options.fadeIn - 是否包含 opacity 淡入（預設 false，只做位移）
 * @param {Function} options.onLastEnter - 最後一個元素進場動畫開始時的 callback
 */
export function animateCards(elements, useScrollTrigger = false, { fadeIn = false, onLastEnter = null } = {}) {
  if (typeof gsap === 'undefined') return [];

  const items = Array.from(elements);
  if (items.length === 0) return [];

  gsap.killTweensOf(items);

  const fromProps = fadeIn ? { y: 100, opacity: 0 } : { y: 100 };
  const toProps   = fadeIn ? { y: 0, opacity: 1 }   : { y: 0 };
  const clearProps = fadeIn ? 'transform,opacity' : 'transform';

  gsap.set(items, fromProps);

  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    let enteredCount = 0;
    const triggers = ScrollTrigger.batch(items, {
      start: 'top 90%',
      onEnter: batch => {
        enteredCount += batch.length;
        const isLast = enteredCount >= items.length;
        gsap.to(batch, {
          ...toProps,
          duration: 0.6,
          stagger: { each: 0.1, grid: 'auto', axis: 'y' },
          ease: 'power2.out',
          overwrite: true,
          clearProps,
          onComplete: isLast && onLastEnter ? onLastEnter : undefined,
        });
      },
    });
    return triggers;
  }

  gsap.to(items, {
    ...toProps,
    duration: 0.8,
    stagger: { each: 0.15, grid: 'auto', axis: 'y' },
    ease: 'power2.out',
    clearProps,
    onComplete: onLastEnter || undefined,
  });

  return [];
}
