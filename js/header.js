/**
 * Header Module
 * 處理導航列、手機選單、Logo 動畫與滾動隱藏
 */

import { initMobileMenu } from './mobile-menu.js';

export function initHeader() {
  const headerContainer = document.getElementById('site-header');
  
  // Helper to initialize header logic after HTML is injected
  function setupHeaderLogic() {
    const header = document.querySelector('header');
    if (!header) return;

    // 1. Set --header-height CSS variable
    function setHeaderHeight() {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
    setHeaderHeight();
    window.addEventListener('resize', setHeaderHeight);

    // 2. Active Nav State
    let currentPage = window.location.pathname.split('/').pop();
    const pageMappings = {
      'admission-detail.html': 'admission.html',
      'degree-show-detail.html': 'degree-show.html',
      'faculty-detail.html': 'faculty.html'
    };
    if (pageMappings[currentPage]) {
      currentPage = pageMappings[currentPage];
    }

    document.querySelectorAll('nav > ul > li').forEach(li => {
      const parentLink = li.querySelector(':scope > a.nav-link');
      const subLinks = li.querySelectorAll('.submenu-link');

      if (subLinks.length === 0 && parentLink && parentLink.getAttribute('href') === currentPage) {
        parentLink.classList.add('active');
      }

      subLinks.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
          parentLink.classList.add('active');
          link.classList.add('active');
        }
      });
    });

    // 3. Logo Scale Animation (Responsive)
    const logo = document.getElementById('header-logo');
    if (logo && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.matchMedia({
        // Desktop (min-width: 768px)
        "(min-width: 768px)": function() {
          gsap.set(logo, { width: 180, height: 180 });
          gsap.to(logo, {
            width: 100,
            height: 100,
            ease: 'none',
            scrollTrigger: {
              trigger: 'body',
              start: 'top top',
              end: '+=300',
              scrub: 0.5,
            }
          });
        },
        // Mobile (max-width: 767px)
        "(max-width: 767px)": function() {
          gsap.set(logo, { width: 80, height: 80 });
        }
      });
    }

    // 4. Mobile Menu Logic
    // 檢查 initMobileMenu 是否存在，避免因缺少該模組而報錯
    if (typeof initMobileMenu === 'function') {
      initMobileMenu();
    }

    // 5. Header Hide on Footer Reveal
    const mainContent = document.querySelector('main');
    if (mainContent) {
      window.addEventListener('scroll', () => {
        const mainRect = mainContent.getBoundingClientRect();
        if (mainRect.bottom < window.innerHeight * 0.5) {
          header.classList.add('header-hidden');
        } else {
          header.classList.remove('header-hidden');
        }
      });
    }
  }

  // Load Header HTML
  if (headerContainer) {
    // 判斷路徑：如果在 pages 資料夾內，直接讀取 header.html；如果在根目錄，讀取 pages/header.html
    const path = window.location.pathname.includes('/pages/') ? 'header.html' : 'pages/header.html';
    
    fetch(path) 
      .then(res => {
        if(!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        headerContainer.innerHTML = html;
        setupHeaderLogic();
      })
      .catch(e => console.log('Header load failed', e));
  } else {
    setupHeaderLogic();
  }
}