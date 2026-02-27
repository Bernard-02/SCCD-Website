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

    // Special handling for Generate page: Hide Logo
    if (currentPage === 'generate.html') {
      const logo = document.getElementById('header-logo');
      if (logo) {
        logo.style.display = 'none';
        const logoLink = logo.closest('a');
        if (logoLink) logoLink.style.display = 'none';
      }
    }

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

      if (parentLink && parentLink.getAttribute('href') === currentPage) {
        parentLink.classList.add('active');
      }

      subLinks.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
          parentLink.classList.add('active');
          link.classList.add('active');
        }
      });
    });

    // Handle standalone links (like GENERATE!)
    document.querySelectorAll('a.nav-link').forEach(link => {
      if (link.closest('nav')) return;

      const href = link.getAttribute('href');
      if (href && href.split('/').pop() === currentPage) {
        link.classList.add('active');
      }
    });

    // 3. Logo Lottie + Scale Animation (Responsive)
    const logo = document.getElementById('header-logo');
    if (logo && typeof lottie !== 'undefined') {
      const isInPages = window.location.pathname.includes('/pages/');
      const logoPath = isInPages ? '../data/SCCDLogoStandard.json' : 'data/SCCDLogoStandard.json';
      const logoAnim = lottie.loadAnimation({
        container: logo,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: logoPath,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        }
      });
      logoAnim.addEventListener('DOMLoaded', () => {
        const svg = logo.querySelector('svg');
        if (svg) {
          svg.style.overflow = 'visible';
          svg.setAttribute('viewBox', '0 0 1080 1080');
        }
      });
    }
    if (logo && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      const isDesktop = window.matchMedia('(min-width: 768px)');
      if (isDesktop.matches) {
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
      } else {
        gsap.set(logo, { width: 80, height: 80 });
      }
    }

    // 4. Mobile Menu Logic
    // 檢查 initMobileMenu 是否存在，避免因缺少該模組而報錯
    if (typeof initMobileMenu === 'function') {
      initMobileMenu();
    }

    // 5. Header Hide on Footer Reveal
    // 支援靜態 footer（index.html）和動態載入 footer（其他頁面）
    let logoHidden = false;
    function bindFooterScroll() {
      const footerEl = document.querySelector('footer');
      if (!footerEl) return false;
      const logoEl = document.getElementById('header-logo');
      window.addEventListener('scroll', () => {
        const isNearFooter = footerEl.getBoundingClientRect().top < window.innerHeight * 0.5;
        header.classList.toggle('header-hidden', isNearFooter);
        if (logoEl && typeof gsap !== 'undefined') {
          if (isNearFooter && !logoHidden) {
            logoHidden = true;
            gsap.to(logoEl, { opacity: 0, duration: 0.3, ease: 'power2.out' });
          } else if (!isNearFooter && logoHidden) {
            logoHidden = false;
            gsap.to(logoEl, { opacity: 1, duration: 0.3, ease: 'power2.out' });
          }
        }
      });
      return true;
    }

    // 先嘗試直接綁定（index.html 靜態 footer）
    if (!bindFooterScroll()) {
      // footer 尚未載入，用 MutationObserver 等待
      const observer = new MutationObserver(() => {
        if (bindFooterScroll()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
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