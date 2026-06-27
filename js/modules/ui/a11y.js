/**
 * A11y helpers
 * 讓「綁了 click 的非互動元素（div / span）」能用鍵盤操作。
 */

/**
 * 把一個靠 click 觸發的非互動元素變成可鍵盤操作的按鈕：
 * 補 role=button + tabindex=0 + Enter/Space → 觸發 click（WCAG 2.1.1 鍵盤 / 4.1.2 角色）。
 * 原生 <button>/<a href> 不需要也不該套這個（它們本就可聚焦/可鍵盤）。
 *
 * @param {Element|null} el      要綁的元素（通常是已 addEventListener('click') 的 div）
 * @param {string} [label]       無內嵌文字時的可讀名稱；有就設 aria-label（避免 marquee 複製文字被重複報讀）
 * @returns {Element|null}
 */
export function makeActivatable(el, label) {
  if (!el || el.dataset.a11yActivatable) return el; // 冪等：重渲染 / 重綁不重複加 listener
  el.dataset.a11yActivatable = '1';
  el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  if (label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
  return el;
}
