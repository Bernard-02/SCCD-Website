/**
 * Universal Accordion Module (Desktop Horizontal / Mobile Vertical)
 *
 * colored-accordion：旋轉卡片版（about 頁）
 * 其他 accordion：標準 width 展開版
 */

let accordionWrappers = [];

export function initHorizontalAccordion() {
  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
    if (wrapper.classList.contains('colored-accordion')) {
      initRotatedAccordion(wrapper);
    } else {
      initSingleAccordion(wrapper);
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      accordionWrappers.forEach(wrapper => {
        if (wrapper.updateLayout) wrapper.updateLayout();
      });
    }, 150);
  });
}

// ── Hover 顏色 ────────────────────────────────────────────────────
// index 0 = 粉色 → hover 變黃色
// index 1 = 綠色 → hover 變紫色
// index 2 = 藍色 → hover 變橘色
const HOVER_COLORS = ['#fffa32', '#c878ff', '#ffa046'];

// ── 旋轉卡片版（colored-accordion）──────────────────────────────
// 每張卡片結構：[label | 照片 | 說明]，label 在最右，卡片往左展開
// 收合：只露 label 條，展開：整張卡片顯示
// z-index：粉1 < 綠2 < 藍3（固定）
// 點擊收合的卡片 → 展開它，並收合比它 z-index 更高的
// 規則：
//   - 粉 hover → label + body 變黃色
//   - 綠 hover → label + body 變紫色
//   - 藍：hover 不改色
//   - 綠展開時，藍色位置不移動
//   - 點藍色（且綠藍都收合）→ 綠也跟著展開
function initRotatedAccordion(wrapper) {
  if (window.innerWidth < 768) {
    initSingleAccordion(wrapper);
    return;
  }

  const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
  if (!items.length) return;

  const originalColors = ['var(--color-pink)', 'var(--color-green)', 'var(--color-blue)'];

  // 每個 item 隨機旋轉 ±2°（排除接近 0°）
  const rotations = items.map(() => {
    let r = 0;
    while (Math.abs(r) < 0.5) r = (Math.random() * 4 - 2);
    return parseFloat(r.toFixed(2));
  });

  // wrapper：相對定位容器
  wrapper.style.cssText = `
    position: relative;
    height: 600px;
    overflow: visible;
  `;

  const LABEL_GAP = 8; // 收合卡片之間的錯開距離

  // 目前展開的 index（預設 0 = 粉色展開）
  let openIndex = 0;

  function getLabelWidth(item) {
    return item.querySelector('.accordion-label').offsetWidth;
  }

  // 固定展開寬度比例：粉 50%、綠 42%、藍用剩餘空間
  const OPEN_WIDTH_RATIO = [null, null, null];

  function applyLayout(animate = false) {
    const wrapperW = wrapper.offsetWidth;
    const dur = animate ? 0.6 : 0;

    const labelWidths = items.map(item => getLabelWidth(item));
    const totalLabelW = labelWidths.reduce((s, w) => s + w, 0);

    // 各卡片固定展開 body 寬度
    // 粉色固定比例（可超出 wrapper），綠藍各自填滿扣掉自身左側 label 後的剩餘空間
    const openBodyWidths = items.map((_, i) => {
      if (OPEN_WIDTH_RATIO[i] !== null) return Math.round(wrapperW * OPEN_WIDTH_RATIO[i]);
      // 動態：wrapper 寬 - 此卡片左側所有 label 寬 - 自身 label 寬 - 右側所有 label 寬
      const leftW = labelWidths.slice(0, i).reduce((s, w) => s + w, 0);
      const rightW = labelWidths.slice(i + 1).reduce((s, w) => s + w, 0);
      return wrapperW - leftW - labelWidths[i] - rightW;
    });

    // 各卡片右錨點（right 值）：用 transformOrigin: top right 固定右上角
    // 粉(0)：右邊距 = wrapperW - labelWidths[0] - openBodyWidths[0]
    // 綠(1)：右邊距 = wrapperW - labelWidths[0] - labelWidths[1] - openBodyWidths[1]
    // 藍(2)：右邊距 = wrapperW - labelWidths[0] - labelWidths[1] - labelWidths[2] - openBodyWidths[2]
    const anchorRights = [
      wrapperW - labelWidths[0] - openBodyWidths[0],
      wrapperW - labelWidths[0] - labelWidths[1] - openBodyWidths[1],
      wrapperW - labelWidths[0] - labelWidths[1] - labelWidths[2] - openBodyWidths[2]
    ];

    items.forEach((item, i) => {
      const body = item.querySelector('.accordion-body');
      const inner = item.querySelector('.accordion-body-inner');
      const rot = rotations[i];
      const isOpen = i === openIndex;

      item.style.position = 'absolute';
      item.style.top = '0';
      item.style.left = 'auto';
      item.style.height = '100%';
      item.style.display = 'flex';
      item.style.flexDirection = 'row';
      item.style.alignItems = 'stretch';
      // top right：展開時向左延伸，右上角保持固定
      item.style.transformOrigin = 'top right';
      item.style.transform = `rotate(${rot}deg)`;
      item.style.zIndex = i + 1;
      item.style.overflow = 'hidden';

      const targetRight = anchorRights[i];
      let targetBodyW;

      if (isOpen) {
        targetBodyW = openBodyWidths[i];
      } else if (i < openIndex) {
        item.classList.remove('active');
        return;
      } else {
        targetBodyW = 0;
      }

      if (inner) gsap.set(inner, { width: openBodyWidths[i] });

      if (animate) {
        if (i < openIndex) {
          gsap.set(item, { right: targetRight });
          gsap.to(body, { width: targetBodyW, duration: dur, ease: 'power2.inOut' });
        } else {
          gsap.to(item, { right: targetRight, duration: dur, ease: 'power2.inOut' });
          gsap.to(body, { width: targetBodyW, duration: dur, ease: 'power2.inOut' });
        }
      } else {
        gsap.set(item, { right: targetRight });
        gsap.set(body, { width: targetBodyW });
      }

      item.classList.toggle('active', isOpen);
    });
  }

  applyLayout(false);

  function resetColors() {
    items.forEach((it) => {
      const lb = it.querySelector('.accordion-label');
      const tw = it.querySelector('.accordion-text-wrap');
      // 清除 inline style，讓 CSS nth-child 規則接管
      if (lb) lb.style.background = '';
      if (tw) tw.style.background = '';
    });
  }

  items.forEach((item, i) => {
    const label = item.querySelector('.accordion-label');
    const textWrap = item.querySelector('.accordion-text-wrap');
    if (!label) return;

    const hoverColor = HOVER_COLORS[i];

    item.addEventListener('mouseenter', () => {
      if (i === openIndex) return;
      label.style.background = hoverColor;
      if (textWrap) textWrap.style.background = hoverColor;
    });
    item.addEventListener('mouseleave', () => {
      if (i === openIndex) return;
      label.style.background = '';
      if (textWrap) textWrap.style.background = '';
    });

    label.addEventListener('mouseenter', () => {
      if (openIndex !== 0 || i === openIndex) return;
      item.style.zIndex = items.length + 1;
    });
    label.addEventListener('mouseleave', () => {
      if (openIndex !== 0 || i === openIndex) return;
      item.style.zIndex = i + 1;
    });

    item.addEventListener('click', () => {
      if (i === openIndex) return; // 點已展開的不動

      resetColors();

      // 點藍色（index 2）且目前不是綠色展開 → 同時展開綠和藍
      // 做法：先把 openIndex 設為 1（綠）執行一次 layout，
      // 再立刻把 openIndex 設為 2（藍）執行第二次動畫，兩者同時跑
      if (i === 2 && openIndex !== 1) {
        // 第一步：展開綠色（計算綠色展開的位置並動畫）
        openIndex = 1;
        applyLayout(true);
        // 第二步：立刻（同一 frame）再把藍色也展開覆蓋上去
        openIndex = 2;
        applyLayout(true);
        return;
      }

      openIndex = i;
      applyLayout(true);
    });
  });

  wrapper.updateLayout = () => applyLayout(false);
  accordionWrappers.push(wrapper);
}

// ── 標準版（其他 accordion）──────────────────────────────────────
export function initSingleAccordion(wrapper) {
  if (!wrapper || accordionWrappers.includes(wrapper)) return;

  accordionWrappers.push(wrapper);
  const items = wrapper.querySelectorAll('.accordion-item');
  if (items.length === 0) return;

  let activeItem = items[0];
  const isMobile = () => window.innerWidth < 768;

  function getExpandedContentWidth() {
    const wrapperW = wrapper.offsetWidth;
    let totalLabelW = 0;
    const gapPx = parseFloat(window.getComputedStyle(wrapper).gap) || 0;
    items.forEach(i => {
      totalLabelW += i.querySelector('.accordion-label').offsetWidth;
    });
    const totalGap = gapPx * (items.length - 1);
    return wrapperW - totalLabelW - totalGap;
  }

  function updateLayout() {
    const mobile = isMobile();
    const expandedW = !mobile ? getExpandedContentWidth() : 0;
    const currentActive = wrapper.querySelector('.accordion-item.active') || items[0];
    activeItem = currentActive;

    items.forEach((item) => {
      const body = item.querySelector('.accordion-body');
      const inner = item.querySelector('.accordion-body-inner');
      const isActive = item === activeItem;

      gsap.set(item, { clearProps: 'width,flex-shrink' });
      gsap.set(body, { clearProps: 'width,height' });
      if (inner) gsap.set(inner, { clearProps: 'width' });

      if (mobile) {
        item.style.width = '100%';
        if (isActive) {
          gsap.set(body, { height: 'auto', width: '100%' });
          item.classList.add('active');
        } else {
          gsap.set(body, { height: 0, width: '100%' });
          item.classList.remove('active');
        }
      } else {
        item.style.width = 'auto';
        if (inner) gsap.set(inner, { width: expandedW });
        if (isActive) {
          gsap.set(body, { width: expandedW });
          item.classList.add('active');
        } else {
          gsap.set(body, { width: 0 });
          item.classList.remove('active');
        }
      }
    });
  }

  updateLayout();

  items.forEach(item => {
    item.addEventListener('click', function () {
      if (this === activeItem) return;
      const prevItem = activeItem;
      const nextItem = this;
      const prevBody = prevItem.querySelector('.accordion-body');
      const nextBody = nextItem.querySelector('.accordion-body');

      if (isMobile()) {
        gsap.to(prevBody, { height: 0, duration: 0.5, ease: 'power2.inOut' });
        gsap.to(nextBody, { height: 'auto', duration: 0.5, ease: 'power2.inOut' });
      } else {
        const expandedW = getExpandedContentWidth();
        gsap.to(prevBody, { width: 0, duration: 0.5, ease: 'power2.inOut' });
        gsap.to(nextBody, { width: expandedW, duration: 0.5, ease: 'power2.inOut' });
      }

      prevItem.classList.remove('active');
      nextItem.classList.add('active');
      activeItem = nextItem;
    });
  });

  wrapper.updateLayout = updateLayout;
}
