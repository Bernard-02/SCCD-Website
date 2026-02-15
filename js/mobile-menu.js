/**
 * Mobile Menu Logic
 * 處理手機版漢堡選單的開關、圖示切換與手風琴效果
 */

export function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('.mobile-nav');
  const icon = btn?.querySelector('i');
  const toggles = document.querySelectorAll('.mobile-submenu-toggle');
  const menuItems = nav?.querySelectorAll('nav > ul > li');

  if (!btn || !nav) return;

  // 1. Toggle Menu & Icon
  btn.addEventListener('click', () => {
    // 使用 class 判斷狀態比較穩定
    const isOpen = nav.classList.contains('open');
    
    if (isOpen) {
      // 關閉
      nav.classList.remove('open');
      
      if (typeof gsap !== 'undefined') {
        gsap.to(nav, { x: '-100%', duration: 0.3, ease: 'power2.out' });
      } else {
        nav.style.transform = 'translateX(-100%)';
      }
      
      icon?.classList.replace('fa-xmark', 'fa-bars');
      document.body.style.overflow = ''; // 恢復捲動
    } else {
      // 開啟
      nav.classList.add('open');
      
      if (typeof gsap !== 'undefined') {
        gsap.to(nav, { x: '0%', duration: 0.4, ease: 'power2.out' });
        
        // 選單項目逐一浮現 (Stagger Animation)
        if (menuItems) {
          gsap.set(menuItems, { y: 20, opacity: 0 });
          gsap.to(menuItems, {
            y: 0,
            opacity: 1,
            duration: 0.4,
            stagger: 0.05,
            ease: 'power2.out',
            delay: 0.1
          });
        }
      } else {
        nav.style.transform = 'translateX(0%)';
      }
      
      icon?.classList.replace('fa-bars', 'fa-xmark');
      document.body.style.overflow = 'hidden'; // 禁止背景捲動
    }
  });

  // 2. Accordion Logic (Submenu)
  toggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const submenu = toggle.nextElementSibling;
      const chevron = toggle.querySelector('.fa-chevron-down');
      const isClosed = submenu.classList.contains('hidden');

      // 先關閉所有其他的子選單
      toggles.forEach(otherToggle => {
        if (otherToggle !== toggle) {
          const otherSubmenu = otherToggle.nextElementSibling;
          const otherChevron = otherToggle.querySelector('.fa-chevron-down');
          
          if (!otherSubmenu.classList.contains('hidden')) {
            if (typeof gsap !== 'undefined') {
              otherSubmenu.style.overflow = 'hidden';
              gsap.to(otherSubmenu, { 
                height: 0, 
                opacity: 0,
                duration: 0.3, 
                ease: 'power2.out', 
                onComplete: () => {
                  otherSubmenu.classList.add('hidden');
                  otherSubmenu.style.height = '';
                  otherSubmenu.style.opacity = '';
                  otherSubmenu.style.overflow = '';
                }
              });
              gsap.to(otherChevron, { rotation: 0, duration: 0.3 });
            } else {
              otherSubmenu.classList.add('hidden');
              otherChevron.style.transform = 'rotate(0deg)';
            }
          }
        }
      });

      // 切換當前子選單
      if (isClosed) {
        if (typeof gsap !== 'undefined') {
          submenu.classList.remove('hidden');
          submenu.style.overflow = 'hidden';
          gsap.fromTo(submenu, 
            { height: 0, opacity: 0 }, 
            { 
              height: 'auto', 
              opacity: 1, 
              duration: 0.4, 
              ease: 'power2.out',
              onComplete: () => {
                submenu.style.overflow = '';
                submenu.style.height = '';
              }
            }
          );
          gsap.to(chevron, { rotation: 180, duration: 0.3 });
        } else {
          submenu.classList.remove('hidden');
          chevron.style.transform = 'rotate(180deg)';
        }
      } else {
        if (typeof gsap !== 'undefined') {
          submenu.style.overflow = 'hidden';
          gsap.to(submenu, { 
            height: 0, 
            opacity: 0,
            duration: 0.3, 
            ease: 'power2.out', 
            onComplete: () => {
              submenu.classList.add('hidden');
              submenu.style.height = '';
              submenu.style.opacity = '';
              submenu.style.overflow = '';
            }
          });
          gsap.to(chevron, { rotation: 0, duration: 0.3 });
        } else {
          submenu.classList.add('hidden');
          chevron.style.transform = 'rotate(0deg)';
        }
      }
    });
  });
}