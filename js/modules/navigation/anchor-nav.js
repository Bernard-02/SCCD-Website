/**
 * Anchor Navigation Module
 * 處理 About 頁面的左側錨點導航與 Scroll Spy
 */

export function initAnchorNav() {
  const navButtons = document.querySelectorAll('.anchor-nav-btn');
  // 只選取有 id 的 section，避免選到其他無關元素
  const sections = document.querySelectorAll('section[id]');
  
  if (navButtons.length === 0 || sections.length === 0) return;

  // 1. 點擊滾動功能
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        // 使用 helper 的平滑滾動，或者原生 scrollIntoView
        if (window.SCCDHelpers && window.SCCDHelpers.scrollToElement) {
          window.SCCDHelpers.scrollToElement(targetSection);
        } else {
          targetSection.scrollIntoView({ behavior: 'smooth' });
        }
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

  const NAV_COLORS = ['#26BCFF', '#FF448A', '#00FF80'];
  let lastNavColorIndex = -1;

  function getNavColor() {
    let index;
    do { index = Math.floor(Math.random() * NAV_COLORS.length); } while (index === lastNavColorIndex);
    lastNavColorIndex = index;
    return NAV_COLORS[index];
  }

  let currentActiveId = null;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        // timeline 屬於 class section，不觸發任何狀態更新
        if (id === 'timeline') return;
        // 同一個 section 重複進入時不換色
        if (id === currentActiveId) return;
        currentActiveId = id;

        const color = getNavColor();

        // 更新按鈕狀態
        navButtons.forEach(btn => {
          if (btn.getAttribute('data-target') === id) {
            btn.classList.add('active');
            btn.style.color = color;
          } else {
            btn.classList.remove('active');
            btn.style.color = '';
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    if (section.id === 'timeline') return;
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
          borderRadius: 15, // 設定展開後的圓角為 15px
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