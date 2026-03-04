/**
 * Text Reveal Module
 * 逐字（word）進場動畫，搭配 ScrollTrigger
 *
 * 使用方式：
 *   1. 在目標元素加上 data-text-reveal attribute（可選 data-text-reveal-delay="0.2"）
 *   2. 呼叫 initTextReveal() 或 initTextReveal('[data-text-reveal]')
 *
 * 每個符合 selector 的元素會自動將文字拆成 per-word <span>，
 * 捲動進入視窗時以 stagger 依序從下方淡入。
 *
 * @param {string} selector - CSS selector，預設 '[data-text-reveal]'
 */
export function initTextReveal(selector = '[data-text-reveal]') {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const elements = document.querySelectorAll(selector);
  if (!elements.length) return;

  elements.forEach(el => {
    const delay = parseFloat(el.dataset.textRevealDelay || '0');

    // 將元素內的文字節點拆成 per-word <span>
    // 保留原本的 HTML 結構（只針對純文字節點處理，不破壞子標籤）
    wrapWords(el);

    const words = el.querySelectorAll('.text-reveal-word');
    if (!words.length) return;

    gsap.set(words, { y: 24, opacity: 0 });

    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(words, {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.03,
          ease: 'power2.out',
          delay,
          clearProps: 'transform,opacity',
        });
      },
    });
  });
}

/**
 * 將元素的文字節點拆成 per-word <span class="text-reveal-word">
 * 只處理直接子文字節點，保留其他子元素不動
 */
function wrapWords(el) {
  const childNodes = Array.from(el.childNodes);

  childNodes.forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent;
    const words = text.split(/(\s+)/); // 保留空白段落

    const fragment = document.createDocumentFragment();
    words.forEach(part => {
      if (/^\s+$/.test(part)) {
        // 空白直接保留為文字節點
        fragment.appendChild(document.createTextNode(part));
      } else if (part.length > 0) {
        const span = document.createElement('span');
        span.className = 'text-reveal-word';
        span.style.display = 'inline-block';
        span.textContent = part;
        fragment.appendChild(span);
      }
    });

    el.replaceChild(fragment, node);
  });
}
