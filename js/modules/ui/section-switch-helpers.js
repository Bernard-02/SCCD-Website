/**
 * Section Switch Helpers
 * 4 個 section-switch 模組（activities/courses/works/admission）共用的按鈕/面板切換邏輯
 *
 * 用法範例：
 *   const btns = document.querySelectorAll('.activities-section-btn');
 *   setActiveNavBtn(btns, activeKey, 'data-section');
 *   showPanel('.activities-panel', `panel-${key}`);
 */

/**
 * 更新 nav 按鈕的 active 狀態和樣式
 * - 清除所有按鈕的 .active 和 inner 背景/旋轉
 * - 對匹配的按鈕（可能多個，如桌面+手機版）加 .active 並套用隨機色/旋轉
 *
 * @param {NodeList|Array} btns - 所有按鈕
 * @param {string} activeKey - 當前 active 的 key
 * @param {string} attrName - 識別用的 attribute（如 'data-section'）
 * @param {Object} [opts] - 選項
 * @param {string} [opts.color] - 指定顏色（否則隨機）
 * @param {number} [opts.rotation] - 指定旋轉（否則隨機）
 * @returns {{color: string, rotation: number}} 使用的顏色和旋轉角度
 */
export function setActiveNavBtn(btns, activeKey, attrName, opts = {}) {
  const color = opts.color || SCCDHelpers.getRandomAccentColor();
  const rotation = opts.rotation != null ? opts.rotation : SCCDHelpers.getRandomRotation();

  btns.forEach(b => {
    b.classList.remove('active');
    const inner = b.querySelector('.anchor-nav-inner');
    if (inner) {
      inner.style.background = '';
      inner.style.transform = '';
    }
  });

  [...btns].filter(b => b.getAttribute(attrName) === activeKey).forEach(b => {
    b.classList.add('active');
    const inner = b.querySelector('.anchor-nav-inner');
    if (inner) {
      inner.style.background = color;
      inner.style.transform = `rotate(${rotation}deg)`;
    }
  });

  return { color, rotation };
}

/**
 * 切換 panel 顯示：隱藏所有符合 selector 的 panel，顯示指定 ID 的
 *
 * @param {string} panelSelector - 如 '.activities-panel'
 * @param {string} targetId - 目標 panel 的 id
 * @returns {HTMLElement|null} 顯示的 panel 元素
 */
export function showPanel(panelSelector, targetId) {
  document.querySelectorAll(panelSelector).forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(targetId);
  if (target) target.classList.remove('hidden');
  return target;
}

