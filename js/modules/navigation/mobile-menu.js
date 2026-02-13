/**
 * Mobile Menu Module
 * 手機版漢堡選單功能
 */

export function initMobileMenu() {
  if (SCCDHelpers.isDesktop()) return; // 只在手機版執行

  const menuBtn = document.querySelector('.mobile-menu-btn');
  const mobileNav = document.querySelector('.mobile-nav');
  const submenuToggles = document.querySelectorAll('.mobile-submenu-toggle');

  if (!menuBtn || !mobileNav) return;

  // 漢堡按鈕點擊：開關選單
  menuBtn.addEventListener('click', function() {
    const isOpen = mobileNav.style.transform === 'translateX(0px)';

    if (typeof gsap !== 'undefined') {
      gsap.to(mobileNav, {
        x: isOpen ? '-100%' : 0,
        duration: 0.3,
        ease: 'power2.out'
      });
    } else {
      mobileNav.style.transform = isOpen ? 'translateX(-100%)' : 'translateX(0)';
    }

    // 切換 body overflow
    document.body.style.overflow = isOpen ? 'auto' : 'hidden';
  });

  // 子選單展開/收合
  submenuToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const submenu = this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');

      if (!submenu) return;

      const isOpen = !submenu.classList.contains('hidden');

      if (isOpen) {
        // 收合
        submenu.classList.add('hidden');
        if (chevron && typeof gsap !== 'undefined') {
          gsap.to(chevron, { rotation: 0, duration: 0.3 });
        }
      } else {
        // 展開
        submenu.classList.remove('hidden');
        if (chevron && typeof gsap !== 'undefined') {
          gsap.to(chevron, { rotation: 180, duration: 0.3 });
        }
      }
    });
  });

  // 點擊連結後關閉選單
  const mobileNavLinks = mobileNav.querySelectorAll('a');
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (typeof gsap !== 'undefined') {
        gsap.to(mobileNav, {
          x: '-100%',
          duration: 0.3,
          ease: 'power2.out'
        });
      } else {
        mobileNav.style.transform = 'translateX(-100%)';
      }
      document.body.style.overflow = 'auto';
    });
  });
}
