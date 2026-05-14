/**
 * Scroll Animate Module
 * 通用卡片進場動畫，可搭配 ScrollTrigger 或直接執行
 */

/**
 * Clip reveal 模式：仿 hero title 進場（wrapper overflow:clip + yPercent 100→0）
 *
 * wrapper 用 overflow:clip 不用 hidden — hidden 會把 wrapper 變成 scroll container，
 * 讓內部 .list-header.active 等 position:sticky 元素失去原本的 sticky 範圍；clip 只剪裁不建立 scroll container
 */

// 為每個 element wrap 一個 overflow:clip 容器並 set yPercent:100 隱藏
// idempotent（dataset.clipWrapped 守衛）；render 後立即呼叫，避免在 ScrollTrigger 觸發前先閃現
//
// hide=true（預設）：wrap + 設 yPercent:100（隱藏準備 reveal）
// hide=false：只 wrap 不動 yPercent — 適合「初次載入 HTML 已可見描述塊，但仍需 clip-wrapper 讓未來 exit 能正確剪裁」
//             場景。沒 wrapper 時 exit yPercent:100 會把元素推出自然 flow 看起來「掉出去」而非乾淨剪裁
export function setupClipReveal(elements, { hide = true } = {}) {
  if (typeof gsap === 'undefined') return [];
  const items = Array.from(elements);
  if (items.length === 0) return [];

  items.forEach(el => {
    if (el.dataset.clipWrapped) return;
    // 父層已是 overflow:hidden/clip（caller 自己建好結構）就跳過動態 wrap
    // 必須查 overflowY 而非 overflow shorthand：Chromium 對 Tailwind .overflow-hidden 返回 "hidden hidden"
    // 不等於字串 "hidden"，會誤判為要動態 wrap，把 element 搬進新 div 而破壞 nextElementSibling 等關係
    const parent = el.parentElement;
    if (parent) {
      const overflowY = getComputedStyle(parent).overflowY;
      if (overflowY === 'hidden' || overflowY === 'clip') {
        el.dataset.clipWrapped = '1';
        return;
      }
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'clip-reveal-wrapper';
    wrapper.style.overflow = 'clip';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    el.dataset.clipWrapped = '1';
  });

  if (hide) gsap.set(items, { yPercent: 100 });
  return items;
}

// 觸發 clip reveal 動畫（assumes setupClipReveal 已執行）
// 用於 ScrollTrigger.create 的 onEnter，或非 ScrollTrigger 立即播放
export function playClipReveal(elements, { onComplete = null } = {}) {
  if (typeof gsap === 'undefined') return;
  const items = Array.from(elements);
  if (items.length === 0) return;
  gsap.killTweensOf(items);
  gsap.to(items, {
    yPercent: 0,
    duration: 0.9,
    stagger: { each: 0.12, grid: 'auto', axis: 'y' },
    ease: 'power3.out',
    overwrite: true,
    clearProps: 'transform',
    onComplete: onComplete || undefined,
  });
}

// 整合版：setup + ScrollTrigger.batch（每元素獨立進場），或 setup + 立即播放
// 適合 admission 之類「載入後 row 各自進 viewport 觸發」的場景；group 內統一觸發請用 setupClipReveal + playClipReveal
export function animateCardsClipReveal(elements, useScrollTrigger = true, { onLastEnter = null } = {}) {
  const items = setupClipReveal(elements);
  if (items.length === 0) return [];

  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    let enteredCount = 0;
    return ScrollTrigger.batch(items, {
      start: 'top 90%',
      onEnter: batch => {
        enteredCount += batch.length;
        const isLast = enteredCount >= items.length;
        playClipReveal(batch, { onComplete: isLast && onLastEnter ? onLastEnter : null });
      },
    });
  }
  playClipReveal(items, { onComplete: onLastEnter });
  return [];
}

/**
 * 為一組卡片元素加上進場動畫
 * @param {Element[]|NodeList} elements - 要動畫的元素
 * @param {boolean} useScrollTrigger - 是否使用 ScrollTrigger（頁面初次載入用 true，filter 切換用 false）
 * @param {object} [options] - 動畫選項
 * @param {boolean} [options.fadeIn] - 是否包含 opacity 淡入（預設 false，只做位移）
 * @param {Function|null} [options.onLastEnter] - 最後一個元素進場動畫開始時的 callback
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
    duration: 0.6,
    stagger: { each: 0.1, grid: 'auto', axis: 'y' },
    ease: 'power2.out',
    clearProps,
    onComplete: onLastEnter || undefined,
  });

  return [];
}
