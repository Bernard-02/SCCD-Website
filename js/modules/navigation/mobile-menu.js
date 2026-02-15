/**
 * Mobile Menu Module
 * 手機版漢堡選單功能
 */

export function initMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const mobileNav = document.querySelector('.mobile-nav');
  const submenuToggles = document.querySelectorAll('.mobile-submenu-toggle');
  const menuItems = mobileNav.querySelectorAll('nav > ul > li');

  if (!menuBtn || !mobileNav) return;

  // 漢堡按鈕點擊：開關選單
  menuBtn.addEventListener('click', function() {
    const isOpen = mobileNav.classList.contains('open');
    const icon = menuBtn.querySelector('i');

    if (isOpen) {
      // 關閉
      mobileNav.classList.remove('open');
      if (typeof gsap !== 'undefined') {
        gsap.to(mobileNav, { x: '-100%', duration: 0.3, ease: 'power2.out' });
      } else {
        mobileNav.style.transform = 'translateX(-100%)';
      }
      document.body.style.overflow = 'auto';
      
      // 切換回漢堡圖示
      if (icon) {
        icon.classList.remove('fa-xmark');
        icon.classList.add('fa-bars');
      }
    } else {
      // 開啟
      mobileNav.classList.add('open');
      if (typeof gsap !== 'undefined') {
        gsap.to(mobileNav, { x: '0%', duration: 0.5, ease: 'power2.out' });
        // 選單項目逐一浮現 (Stagger Animation)
        gsap.fromTo(menuItems, 
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 1 }
        );
      } else {
        mobileNav.style.transform = 'translateX(0)';
      }
      document.body.style.overflow = 'hidden';

      // 切換為 X 圖示
      if (icon) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-xmark');
      }
    }
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
      mobileNav.classList.remove('open');
      if (typeof gsap !== 'undefined') {
        gsap.to(mobileNav, { x: '-100%', duration: 0.3, ease: 'power2.out' });
      } else {
        mobileNav.style.transform = 'translateX(-100%)';
      }
      document.body.style.overflow = 'auto';

      // 點擊連結後也要切換回漢堡圖示
      const icon = menuBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-xmark');
        icon.classList.add('fa-bars');
      }
    });
  });
}
