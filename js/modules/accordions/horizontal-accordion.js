/**
 * Universal Accordion Module (Desktop Horizontal / Mobile Vertical)
 *
 * 結構：.accordion-item = .accordion-label (A) + .accordion-body (B) > .accordion-body-inner
 * 動畫：
 *   - Desktop: accordion-body 用 width 0px → expandedWidth 切換
 *   - Mobile: accordion-body 用 height 0px → auto 切換
 */

export function initHorizontalAccordion() {
  const wrapper = document.querySelector('.accordion-wrapper');
  const items = document.querySelectorAll('.accordion-item');
  if (!wrapper || items.length === 0) return;

  let activeItem = items[0];

  // Helper: Check if mobile
  const isMobile = () => window.innerWidth < 768;

  // 計算展開內容區塊的目標寬度
  // 邏輯：Wrapper總寬 - 所有Label總寬 - 所有Gap總寬 = 內容區塊可用寬度
  function getExpandedContentWidth() {
    const wrapperW = wrapper.offsetWidth;
    let totalLabelW = 0;
    
    // 取得 gap 大小 (2px)
    const gapPx = parseFloat(window.getComputedStyle(wrapper).gap) || 0;
    
    items.forEach(i => {
      totalLabelW += i.querySelector('.accordion-label').offsetWidth;
    });
    
    const totalGap = gapPx * (items.length - 1);
    return wrapperW - totalLabelW - totalGap;
  }

  // 初始化
  function init() {
    const mobile = isMobile();
    const expandedW = !mobile ? getExpandedContentWidth() : 0;
    
    // 嘗試保留當前 active 狀態，否則預設第一個
    const currentActive = document.querySelector('.accordion-item.active') || items[0];
    activeItem = currentActive;
    
    items.forEach((item, i) => {
      const body = item.querySelector('.accordion-body');
      const inner = item.querySelector('.accordion-body-inner');
      const isActive = item === activeItem;
      
      // 清除可能殘留的 inline styles (避免切換模式時衝突)
      gsap.set(item, { clearProps: 'width,flex-shrink' });
      gsap.set(body, { clearProps: 'width,height' });
      if (inner) gsap.set(inner, { clearProps: 'width' });

      if (mobile) {
        // === Mobile Mode (Vertical) ===
        item.style.width = '100%';
        if (isActive) {
          gsap.set(body, { height: 'auto', width: '100%' });
          item.classList.add('active');
        } else {
          gsap.set(body, { height: 0, width: '100%' });
          item.classList.remove('active');
        }
      } else {
        // === Desktop Mode (Horizontal) ===
        item.style.width = 'auto';
        // 設定 inner 容器為固定寬度，防止內容擠壓
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

  init();

  // 點擊切換
  items.forEach(item => {
    item.addEventListener('click', function () {
      if (this === activeItem) return;

      const prevItem = activeItem;
      const nextItem = this;
      const prevBody = prevItem.querySelector('.accordion-body');
      const nextBody = nextItem.querySelector('.accordion-body');

      if (isMobile()) {
        // Mobile Animation (Height)
        gsap.to(prevBody, { height: 0, duration: 0.5, ease: 'power2.inOut' });
        gsap.to(nextBody, { height: 'auto', duration: 0.5, ease: 'power2.inOut' });
      } else {
        // Desktop Animation (Width)
        const expandedW = getExpandedContentWidth();
        gsap.to(prevBody, { width: 0, duration: 0.5, ease: 'power2.inOut' });
        gsap.to(nextBody, { width: expandedW, duration: 0.5, ease: 'power2.inOut' });
      }

      // Update classes
      prevItem.classList.remove('active');
      nextItem.classList.add('active');

      activeItem = nextItem;
    });
  });

  // Resize 同步
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      init(); // Re-initialize layout on resize
    }, 150);
  });
}
