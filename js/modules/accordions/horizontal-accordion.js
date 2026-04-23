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
// z-index 由 index 決定（遞增）；顏色 nth-child(3n+1/2/3) 循環粉/綠/藍
// Hover 時非展開的卡片換成循環 HOVER_COLORS
export function initRotatedAccordion(wrapper, { height = 600, animateEntry = false } = {}) {
  if (window.innerWidth < 768) {
    initSingleAccordion(wrapper);
    return;
  }

  const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
  if (!items.length) return;

  // 每個 item 隨機旋轉 ±2°（排除接近 0°）
  const rotations = items.map(() => {
    let r = 0;
    while (Math.abs(r) < 0.5) r = (Math.random() * 4 - 2);
    return parseFloat(r.toFixed(2));
  });

  // wrapper：相對定位容器
  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'visible';
  wrapper.style.height = `${height}px`;

  // 進場動畫模式：所有 item 初始收合，進場完成後才打開 index 0
  let openIndex = animateEntry ? -1 : 0;

  function getLabelWidth(item) {
    return item.querySelector('.accordion-label').offsetWidth;
  }

  function applyLayout(animate = false) {
    const wrapperW = wrapper.offsetWidth;
    const dur = animate ? 0.6 : 0;

    const labelWidths = items.map(item => getLabelWidth(item));
    const totalLabelW = labelWidths.reduce((s, w) => s + w, 0);

    // N 項通用：展開 body 寬度 = wrapper 寬扣掉全部 label
    const openBodyW = Math.max(0, wrapperW - totalLabelW);
    const openBodyWidths = items.map(() => openBodyW);

    // N 項通用 right 錨點：等同自身右側所有 label 寬總和
    const anchorRights = items.map((_, i) => {
      return labelWidths.slice(i + 1).reduce((s, w) => s + w, 0);
    });

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
      // i <= openIndex 都展開 body（前面的被「推出來」，z-index 由 i+1 決定層疊）
      const targetBodyW = (i <= openIndex) ? openBodyWidths[i] : 0;

      if (inner) gsap.set(inner, { width: openBodyWidths[i] });

      if (animate) {
        gsap.to(item, { right: targetRight, duration: dur, ease: 'power2.inOut' });
        gsap.to(body, { width: targetBodyW, duration: dur, ease: 'power2.inOut' });
      } else {
        gsap.set(item, { right: targetRight });
        gsap.set(body, { width: targetBodyW });
      }

      item.classList.toggle('active', isOpen);
    });
  }

  applyLayout(false);

  // 進場動畫：一半從正右方、一半從正下方（畫面外）飛入
  // 最右（index N-1）先進場 → 最左（index 0）最後進場
  // 全部就位後，打開 index 0（教學空間）
  if (animateEntry && typeof ScrollTrigger !== 'undefined') {
    // 平均分配：half fromRight + half fromBottom，再 Fisher-Yates 洗牌
    const directions = items.map((_, i) => i < Math.ceil(items.length / 2) ? 'right' : 'bottom');
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    items.forEach((item, i) => {
      // 起始位置必須在 viewport 外（以 vw/vh 為基準，random 微調距離）
      const offsetX = directions[i] === 'right' ? vw * 0.8 + Math.random() * 200 : 0;
      const offsetY = directions[i] === 'bottom' ? vh * 0.9 + Math.random() * 200 : 0;
      gsap.set(item, { x: offsetX, y: offsetY });
    });

    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({
          onComplete: () => {
            openIndex = 0;
            applyLayout(true);
          }
        });

        for (let i = items.length - 1; i >= 0; i--) {
          const orderIdx = items.length - 1 - i;
          tl.to(items[i], {
            x: 0,
            y: 0,
            duration: 1.1,
            ease: 'power3.out'
          }, orderIdx * 0.12);
        }
      }
    });
  }

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

    const hoverColor = HOVER_COLORS[i % HOVER_COLORS.length];

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
      if (i === openIndex) return;
      resetColors();
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
