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

    function getNavRotation() {
      let deg;
      do { deg = Math.round(Math.random() * 12) - 6; } while (deg === 0);
      return deg;
    }

    function setNavLinkActive(link) {
      link.classList.add('active');
      link.style.transform = `rotate(${getNavRotation()}deg)`;
    }

    document.querySelectorAll('nav > ul > li').forEach(li => {
      const parentLink = li.querySelector(':scope > a.nav-link');
      const subLinks = li.querySelectorAll('.submenu-link');

      if (parentLink && parentLink.getAttribute('href') === currentPage) {
        setNavLinkActive(parentLink);
      }

      subLinks.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
          setNavLinkActive(parentLink);
          link.classList.add('active');
        }
      });
    });

    // Handle standalone links (like GENERATE!)
    document.querySelectorAll('a.nav-link').forEach(link => {
      if (link.closest('nav')) return;

      const href = link.getAttribute('href');
      if (href && href.split('/').pop() === currentPage) {
        setNavLinkActive(link);
      }
    });

    // 3. Header Bar Random Rotation
    // About組、Library、Generate 各自隨機旋轉 -4 到 +6°
    // 規則：最多只能有一個 0°，其餘必須有角度
    (function initBarRotations() {
      const aboutBar = header.querySelector('[data-bar="about"]');
      const libraryBar = header.querySelector('[data-bar="library"]');
      const generateBar = header.querySelector('[data-bar="generate"]');
      const barEls = [aboutBar, libraryBar, generateBar].filter(Boolean);

      if (barEls.length === 0) return;

      // About bar：-1 到 +1°，含小數點後一位，可以是 0
      function getAboutDeg() {
        return Math.round((Math.random() * 3 - 1.5) * 10) / 10;
      }

      // Library / Generate：-4 到 +5°，整數，最多一個 0
      function getSmallBarDegrees(count) {
        const degs = [];
        let zeroUsed = false;
        for (let i = 0; i < count; i++) {
          let deg;
          if (!zeroUsed && Math.random() < 0.3) {
            deg = 0;
            zeroUsed = true;
          } else {
            do { deg = Math.round(Math.random() * 9) - 4; } while (deg === 0);
          }
          degs.push(deg);
        }
        return degs;
      }

      // 套用 About bar
      if (aboutBar) {
        const deg = getAboutDeg();
        aboutBar.style.transform = `rotate(${deg}deg)`;
        aboutBar.style.transformOrigin = 'center center';
      }

      // 套用 Library、Generate
      const smallBars = [libraryBar, generateBar].filter(Boolean);
      const smallDegs = getSmallBarDegrees(smallBars.length);
      smallBars.forEach((el, i) => {
        el.style.transform = `rotate(${smallDegs[i]}deg)`;
        el.style.transformOrigin = 'center center';
      });
    })();

    // 4. About Bar Scroll Collapse（GSAP + ScrollTrigger）
    (function initAboutBarScroll() {
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

      const aboutBar = header.querySelector('[data-bar="about"]');
      const aboutNav = aboutBar ? aboutBar.querySelector('nav') : null;
      if (!aboutBar || !aboutNav) return;

      // 初始：ml = 2xl(64px)
      // scroll 後：ml 縮到 0 → bar 往左移貼近 logo
      const ML_START = 64;  // 2xl
      const ML_END = 0;

      gsap.set(aboutBar, { marginLeft: ML_START });

      ScrollTrigger.create({
        trigger: 'body',
        start: 'top top',
        end: '+=120',
        scrub: 0.6,
        onUpdate: (self) => {
          const ml = ML_START + (ML_END - ML_START) * self.progress;
          gsap.to(aboutBar, { marginLeft: ml, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
        }
      });
    })();

    // 5. Logo Lottie + Scale Animation (Responsive)
    const logo = document.getElementById('header-logo');
    if (logo && typeof lottie !== 'undefined') {
      const isInPages = window.location.pathname.includes('/pages/');
      const isInverse = document.body.classList.contains('mode-inverse');
      const logoFile = isInverse ? 'SCCDLogoInverse.json' : 'SCCDLogoStandard.json';
      const logoPath = isInPages ? `../data/${logoFile}` : `data/${logoFile}`;
      const logoAnim = lottie.loadAnimation({
        container: logo,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        name: 'header-logo-anim',
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
    const isInPages = window.location.pathname.includes('/pages/');
    const path = isInPages ? 'header.html' : 'pages/header.html';

    fetch(path)
      .then(res => {
        if(!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        headerContainer.innerHTML = html;

        // 根目錄載入時，header.html 內的連結是 pages/ 相對路徑，需加前綴
        if (!isInPages) {
          headerContainer.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            // 只處理相對路徑（不含 http、#、../、pages/ 開頭）
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('pages/') && !href.startsWith('../') && href !== '') {
              a.setAttribute('href', 'pages/' + href);
            }
          });
        }

        setupHeaderLogic();

        // header 載入完成後發出事件，讓其他模組（如 intro-animation）可以等待
        document.dispatchEvent(new CustomEvent('header:ready'));
      })
      .catch(e => console.log('Header load failed', e));
  } else {
    setupHeaderLogic();
  }
}