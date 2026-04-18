/**
 * Anchor Navigation Module
 * 處理 About 頁面的左側錨點導航與 Scroll Spy
 */

export function initAnchorNav() {
  const navButtons = document.querySelectorAll('.anchor-nav-btn');

  // Build sectionMap: observed element → button target id
  // Observe section[id] + any non-section nav targets (e.g. div#works)
  // For zero-height anchor divs, observe their next sibling with content instead
  const sectionMap = new Map();

  document.querySelectorAll('section[id]').forEach(el => {
    sectionMap.set(el, el.id);
  });

  navButtons.forEach(btn => {
    const id = btn.getAttribute('data-target');
    if (!id) return;
    const el = document.getElementById(id);
    if (!el || sectionMap.has(el)) return;
    // Zero-height anchor divs: observe next sibling with actual content
    const observeEl = (el.offsetHeight < 2 && el.nextElementSibling) ? el.nextElementSibling : el;
    if (!sectionMap.has(observeEl)) {
      sectionMap.set(observeEl, id);
    }
  });

  const sections = [...sectionMap.keys()];

  if (navButtons.length === 0 || sections.length === 0) return;

  // 1. 點擊滾動功能
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        // 點擊時立即 active，並暫停 scroll spy 避免滾動過程中被覆蓋
        // force: true 讓即使已是 active 也會重新選色 + 重跑封鎖線動畫
        setActiveBtn(targetId, { force: true });
        clickScrolling = true;
        clearTimeout(clickScrollTimer);
        clickScrollTimer = setTimeout(() => { clickScrolling = false; }, 1200);

        // 使用 scrollIntoView，由各 section 的 scroll-margin-top 決定對齊位置
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 2. Scroll Spy (滾動監聽)
  // 使用 IntersectionObserver 監聽區塊是否進入視窗中間
  const observerOptions = {
    root: null,
    // rootMargin 設定為 '-50% 0px -50% 0px' 表示只偵測視窗正中間的一條線
    // 這樣可以精確判斷當前視窗中心位於哪個區塊，解決區塊重疊或高度過高導致的誤判
    rootMargin: '-50% 0px -50% 0px',
    threshold: 0
  };

  const NAV_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  let lastNavColorIndex = -1;

  function getNavColor() {
    let index;
    do { index = Math.floor(Math.random() * NAV_COLORS.length); } while (index === lastNavColorIndex);
    lastNavColorIndex = index;
    return NAV_COLORS[index];
  }

  function getNavRotation() {
    let deg;
    do { deg = Math.round(Math.random() * 6) - 3; } while (Math.abs(deg) < 0.5);
    return deg;
  }

  // 初始化每個 btn 的 base rotation
  navButtons.forEach(btn => {
    btn._baseRot = getNavRotation();
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) inner.style.transform = `rotate(${btn._baseRot}deg)`;

    // Hover：記錄新角度
    inner && inner.addEventListener('mouseenter', () => {
      if (btn.classList.contains('active')) return;
      const rot = getNavRotation();
      btn._pendingRot = rot;
      inner.style.transform = `rotate(${rot}deg)`;
    });
    inner && inner.addEventListener('mouseleave', () => {
      if (btn.classList.contains('active')) return;
      inner.style.transform = `rotate(${btn._baseRot}deg)`;
      btn._pendingRot = null;
    });
  });

  let currentActiveId = null;
  let clickScrolling = false; // 點擊導航時暫停 scroll spy
  let clickScrollTimer = null;

  function setActiveBtn(id, { force = false } = {}) {
    if (!force && id === currentActiveId) return;
    currentActiveId = id;
    const color = getNavColor();
    navButtons.forEach(btn => {
      const isActive = btn.getAttribute('data-target') === id;
      const inner = btn.querySelector('.anchor-nav-inner');
      btn.classList.toggle('active', isActive);
      if (!inner) return;
      if (isActive) {
        const rot = btn._pendingRot ?? getNavRotation();
        btn._baseRot = rot;
        btn._pendingRot = null;
        inner.style.background = color;
        inner.style.transform = `rotate(${rot}deg)`;
      } else {
        inner.style.background = '';
        // 保持各自 base rot，不歸零
        inner.style.transform = `rotate(${btn._baseRot}deg)`;
      }
    });

    // 觸發對應 section 的封鎖線 replay（顏色跟 nav 同步）
    // 如果顏色跟上次一樣，則不重跑動畫（避免無意義閃動）
    const section = document.getElementById(id);
    const strip = section?.querySelector('.section-title-strip');
    if (strip && typeof strip._replayReveal === 'function') {
      if (strip._lastReplayColor !== color) {
        strip._lastReplayColor = color;
        strip._replayReveal(color);
      }
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if (clickScrolling) return; // 點擊滾動中，暫停 scroll spy
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = sectionMap.get(entry.target) || entry.target.id;
        setActiveBtn(id);
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    observer.observe(section);
  });

  // 3. Mobile Menu Toggle Logic
  const mobileToggle = document.getElementById('mobile-anchor-toggle');
  const mobileWrapper = document.getElementById('mobile-anchor-wrapper');
  const mobileMenu = document.getElementById('mobile-anchor-menu');
  const mobileOverlay = document.getElementById('mobile-anchor-overlay');
  const mobileContainer = document.getElementById('mobile-anchor-container');
  const footer = document.getElementById('site-footer');

  if (mobileToggle && mobileWrapper && mobileMenu && mobileContainer) {
    let isOpen = false;
    const icon = mobileToggle.querySelector('i');

    const toggleMenu = () => {
      isOpen = !isOpen;
      
      // 使用 GSAP 處理動畫
      if (typeof gsap === 'undefined') return;

      if (isOpen) {
        // Open State
        // 1. Show Overlay
        if (mobileOverlay) {
          mobileOverlay.classList.remove('pointer-events-none');
          gsap.to(mobileOverlay, { opacity: 1, duration: 0.3 });
        }

        // 2. Prepare Menu (Show but invisible so height can be calculated)
        mobileMenu.classList.remove('hidden');

        // 3. Expand Wrapper (Circle -> Rounded Rect)
        gsap.to(mobileWrapper, {
          width: 160, // w-40
          height: 'auto',
          borderRadius: 24,
          duration: 0.5,
          ease: 'power2.out'
        });
        
        // 4. Show Menu Items
        gsap.to(mobileMenu, { opacity: 1, duration: 0.3 });
        
        const menuItems = mobileMenu.querySelectorAll('.anchor-nav-btn');
        gsap.fromTo(menuItems, 
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out' }
        );

        // 5. Icon Change (Rotate & Swap)
        if (icon) icon.classList.replace('fa-list', 'fa-xmark');
      } else {
        // Closed State
        // 1. Hide Overlay
        if (mobileOverlay) {
          mobileOverlay.classList.add('pointer-events-none');
          gsap.to(mobileOverlay, { opacity: 0, duration: 0.3 });
        }
        
        // 2. Collapse Wrapper
        gsap.to(mobileWrapper, {
          width: 48, // w-12
          height: 48, // h-12
          borderRadius: 24, // 使用 24px (48px的一半) 保持圓形，避免使用 % 造成動畫變形
          duration: 0.3,
          ease: 'power2.inOut'
        });

        // 3. Hide Menu Items
        gsap.to(mobileMenu, { opacity: 0, duration: 0.2, onComplete: () => mobileMenu.classList.add('hidden') });

        // 4. Icon Change
        if (icon) icon.classList.replace('fa-xmark', 'fa-list');
      }
    };

    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (isOpen && !mobileWrapper.contains(e.target)) {
        toggleMenu();
      }
    });
    
    // Close when clicking overlay
    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        if (isOpen) toggleMenu();
      });
    }

    // Close when clicking a link inside the mobile menu
    const mobileLinks = mobileMenu.querySelectorAll('.anchor-nav-btn');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (isOpen) toggleMenu();
      });
    });

    // 4. Scroll Visibility Logic (Mobile)
    const handleScroll = () => {
      const footerRect = footer ? footer.getBoundingClientRect() : null;
      const isFooterVisible = footerRect ? (footerRect.top < window.innerHeight) : false;
      const isPastHero = window.scrollY > window.innerHeight * 0.8;

      // Mobile: Visibility of the button container
      if (isPastHero && !isFooterVisible) {
        mobileContainer.classList.remove('opacity-0', 'pointer-events-none');
        mobileContainer.classList.add('pointer-events-auto');
      } else {
        mobileContainer.classList.add('opacity-0', 'pointer-events-none');
        mobileContainer.classList.remove('pointer-events-auto');
      }

      // Auto-close if open and footer is visible
      if (isFooterVisible && isOpen) {
        toggleMenu();
      }
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
  }
}