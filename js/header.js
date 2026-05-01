/**
 * Header Module
 * 處理導航列、手機選單、Logo 動畫與滾動隱藏
 */

import { initMobileMenu } from './mobile-menu.js';

// ── Generate Logo Typewriter 動畫（SPA 換頁時呼叫）────────────
export function triggerGenerateLogo() {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof gsap === 'undefined') return;

  // 清除舊的 SVG/cursor（避免重複觸發時疊加）
  // 也要清除可能從別頁帶過來的 Lottie animation 與 SVG，避免跟 typewriter 視覺衝突
  // 同時保留 #header-logo 的 180x180 layout 空間，讓父層 <a href="../index.html"> 維持有可點擊區域（typewriter 完整後仍可點 logo 回首頁）
  const logoContainer = logo.parentNode;
  logoContainer.querySelectorAll('#gen-logo-svg, [data-gen-cursor]').forEach(el => el.remove());
  if (typeof lottie !== 'undefined') {
    try { lottie.destroy('header-logo-anim'); } catch (e) { /* 沒 Lottie 就略過 */ }
  }
  logo.innerHTML = '';
  logo.style.display = '';

  const isInverse = document.body.classList.contains('mode-inverse');
  const fillColor = isInverse ? '#fff' : '#000';

  const cursor = document.createElement('div');
  cursor.dataset.genCursor = '1';
  cursor.style.cssText = `position:absolute;top:8px;left:180px;width:1px;height:196px;background:${fillColor};z-index:10;visibility:hidden;`;
  logoContainer.appendChild(cursor);

  let blinkInterval = null;
  function startBlink(el) {
    if (blinkInterval) clearInterval(blinkInterval);
    el.style.visibility = 'visible';
    blinkInterval = setInterval(() => {
      el.style.visibility = el.style.visibility === 'hidden' ? 'visible' : 'hidden';
    }, 530);
  }
  function stopBlink(el) {
    if (blinkInterval) { clearInterval(blinkInterval); blinkInterval = null; }
    el.style.visibility = 'visible';
  }

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.id = 'gen-logo-svg';
  svgEl.setAttribute('viewBox', '0 0 1135 320');
  svgEl.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svgEl.style.cssText = 'height:205px;width:205px;position:absolute;top:16px;left:0;overflow:visible;pointer-events:none;z-index:1;';

  const PATHS = [
    'M120.05,320c-37.17,0-66.48-9.4-87.91-28.19C10.72,273.01,0,247.25,0,214.51h46.19c.14,20.39,6.69,36.34,19.66,47.85,12.97,11.52,31.03,17.27,54.2,17.27,21.08,0,37.97-4.47,50.66-13.42,12.69-8.95,19.04-20.98,19.04-36.1,0-11.93-4.54-21.6-13.63-29.02-9.09-7.42-24.38-13.7-45.88-18.83l-33.91-8.11c-31.35-7.49-54.2-17.93-68.56-31.31-14.36-13.38-21.53-30.83-21.53-52.33,0-18.17,4.58-34.05,13.73-47.65,9.15-13.59,22.02-24.14,38.6-31.63C75.14,3.75,94.53,0,116.72,0c33.43,0,60.03,8.74,79.79,26.22,19.77,17.48,30.13,41.34,31.11,71.57h-44.73c-1.11-17.89-7.63-31.94-19.56-42.13-11.93-10.19-27.67-15.29-47.23-15.29s-34.05,4.47-45.98,13.42c-11.93,8.95-17.89,20.43-17.89,34.43,0,11.24,4.58,20.36,13.73,27.36,9.15,7.01,24.34,13.08,45.57,18.21l33.5,7.91c31.07,7.35,53.99,17.96,68.76,31.83,14.77,13.87,22.16,31.91,22.16,54.1,0,18.59-4.79,34.82-14.36,48.69-9.57,13.87-23.03,24.62-40.36,32.25-17.34,7.63-37.73,11.44-61.17,11.44Z',
    'M413,320c-28.44,0-53.54-6.73-75.32-20.18-21.78-13.45-38.77-32.18-50.98-56.18-12.21-24-18.31-51.81-18.31-83.43s6.1-59.85,18.31-83.85c12.2-24,29.16-42.72,50.87-56.18C359.29,6.73,384.43,0,413,0c22.61,0,43.1,4.44,61.48,13.32,18.38,8.88,33.6,21.4,45.67,37.56,12.07,16.16,19.9,35.27,23.51,57.32h-47.02c-4.58-21.08-14.32-37.35-29.23-48.79-14.91-11.44-32.91-17.17-53.99-17.17s-37.94,4.93-52.64,14.77c-14.7,9.85-26.04,23.65-34.02,41.4-7.98,17.76-11.96,38.35-11.96,61.79s3.95,43.97,11.86,61.59c7.91,17.62,19.25,31.35,34.02,41.2,14.77,9.85,32.35,14.77,52.74,14.77s38.87-5.69,53.78-17.06c14.91-11.37,24.79-27.53,29.65-48.48h46.81c-3.61,21.92-11.44,40.96-23.51,57.11-12.07,16.16-27.29,28.64-45.67,37.45-18.38,8.81-38.88,13.21-61.48,13.21Z',
    'M721.35,320c-28.44,0-53.54-6.73-75.32-20.18-21.78-13.45-38.77-32.18-50.98-56.18-12.21-24-18.31-51.81-18.31-83.43s6.1-59.85,18.31-83.85c12.2-24,29.16-42.72,50.87-56.18,21.71-13.45,46.85-20.18,75.42-20.18,22.61,0,43.1,4.44,61.48,13.32,18.38,8.88,33.6,21.4,45.67,37.56,12.07,16.16,19.9,35.27,23.51,57.32h-47.02c-4.58-21.08-14.32-37.35-29.23-48.79-14.91-11.44-32.91-17.17-53.99-17.17s-37.94,4.93-52.64,14.77c-14.7,9.85-26.04,23.65-34.02,41.4-7.98,17.76-11.96,38.35-11.96,61.79s3.95,43.97,11.86,61.59c7.91,17.62,19.25,31.35,34.02,41.2,14.77,9.85,32.35,14.77,52.74,14.77s38.87-5.69,53.78-17.06c14.91-11.37,24.79-27.53,29.65-48.48h46.81c-3.61,21.92-11.44,40.96-23.51,57.11-12.07,16.16-27.29,28.64-45.67,37.45-18.38,8.81-38.88,13.21-61.48,13.21Z',
    'M984.99,315.01h-100.29V4.99h103.41c30.38,0,56.56,6.24,78.54,18.73,21.98,12.48,38.87,30.27,50.66,53.37,11.79,23.1,17.69,50.6,17.69,82.5s-5.93,59.68-17.79,82.91c-11.86,23.23-28.99,41.13-51.39,53.68-22.4,12.56-49.35,18.83-80.83,18.83ZM930.89,274.85h51.18c36.2,0,63.01-10.2,80.42-30.59,17.41-20.39,26.11-48.62,26.11-84.68s-8.6-63.98-25.8-84.16c-17.2-20.18-43.07-30.27-77.61-30.27h-54.3v229.7Z',
  ];
  const LETTER_X = [230, 545, 855, 1135];
  const scale = 205 / 1135;
  const GAP = 6;
  const SVG_TOP = 16;
  const letterHeight = Math.round(320 * scale);

  const pathEls = PATHS.map(d => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); p.setAttribute('fill', fillColor); p.style.opacity = '0';
    svgEl.appendChild(p); return p;
  });
  logoContainer.appendChild(svgEl);

  const cursorNew = document.createElement('div');
  cursorNew.dataset.genCursor = '1';
  cursorNew.style.cssText = `position:absolute;top:${SVG_TOP - 6}px;left:0;width:1px;height:${letterHeight + 12}px;background:${fillColor};z-index:3;visibility:hidden;`;
  logoContainer.appendChild(cursorNew);
  cursor.style.zIndex = '3';

  const tl = gsap.timeline({ delay: 2 });
  tl.call(() => startBlink(cursor));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursor));
  tl.set(cursor, { left: -GAP });
  // 不再 display:none #header-logo，否則父層 <a> 會 collapse 成 0x0 失去可點擊區域
  // logo 內容已在開頭 innerHTML='' 清空，display:block 的 180x180 空 div 維持父層 <a> 的 click target
  tl.to({}, { duration: 0.15 });
  tl.set(cursor, { visibility: 'hidden' });
  tl.to({}, { duration: 0.5 });
  tl.set(cursorNew, { left: -GAP });
  tl.call(() => startBlink(cursorNew));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursorNew));
  LETTER_X.forEach((rightX, i) => {
    tl.set(cursorNew, { left: rightX * scale + GAP });
    tl.set(pathEls[i], { opacity: 1 });
    tl.to({}, { duration: 0.12 });
  });
  tl.call(() => startBlink(cursorNew));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursorNew));
  tl.set(cursorNew, { visibility: 'hidden' });
}

export function restoreHeaderLogo() {
  const logo = document.getElementById('header-logo');
  if (!logo) return;
  const logoContainer = logo.parentNode;
  if (logoContainer) logoContainer.querySelectorAll('#gen-logo-svg, [data-gen-cursor]').forEach(el => el.remove());
  logo.style.display = '';
}

// ── Active Nav State（Router 換頁時呼叫）──────────────────────
export function updateNavActive(page) {
  const header = document.querySelector('#site-header header');
  if (!header) return;

  // page mappings（detail 頁對應到父層）
  const pageMappings = {
    'admission-detail':    'admission',
    'degree-show-detail':  'degree-show',
    'faculty-detail':      'faculty',
  };
  const activePage = pageMappings[page] || page;
  // 轉換為 .html 格式以匹配 href 屬性
  const activeHref = activePage === 'index' ? '' : `${activePage}.html`;

  function setNavLinkActive(link) { link.classList.add('active'); }
  function clearNavActive() {
    header.querySelectorAll('a.nav-link.active, .submenu-link.active').forEach(l => l.classList.remove('active'));
    header.querySelectorAll('[data-bar].has-active').forEach(el => el.classList.remove('has-active'));
  }

  clearNavActive();

  // About bar nav links
  header.querySelectorAll('nav > ul > li').forEach(li => {
    const parentLink = li.querySelector(':scope > a.nav-link');
    const subLinks = li.querySelectorAll('.submenu-link');

    if (parentLink && parentLink.getAttribute('href') === activeHref) {
      setNavLinkActive(parentLink);
    }
    subLinks.forEach(link => {
      if (link.getAttribute('href') === activeHref) {
        setNavLinkActive(parentLink);
        link.classList.add('active');
      }
    });
  });

  // Standalone links（非 nav 內）
  header.querySelectorAll('a.nav-link').forEach(link => {
    if (link.closest('nav')) return;
    if (link.closest('[data-bar="generate"]') || link.closest('[data-bar="library"]')) return;
    const href = link.getAttribute('href');
    if (href && href.split('/').pop() === activeHref) {
      setNavLinkActive(link);
    }
  });

  // about bar has-active
  const aboutBarEl = header.querySelector('[data-bar="about"]');
  if (aboutBarEl && aboutBarEl.querySelector('a.nav-link.active')) {
    aboutBarEl.classList.add('has-active');
  }

  // library / generate side bar 狀態
  const libraryBarEl  = header.querySelector('[data-bar="library"]');
  const generateBarEl = header.querySelector('[data-bar="generate"]');
  const isLibraryActive  = activePage === 'library';
  const isGenerateActive = activePage === 'generate';

  // Logo 尺寸：generate 頁和一般頁都是大的（180），library 頁是小的（100）
  // SPA 切換時：從當前大小平滑過渡到目標大小，lottie 旋轉保持連續（不重新載入）
  const logoEl = document.getElementById('header-logo');
  if (logoEl && typeof gsap !== 'undefined' && window.innerWidth >= 768) {
    // 先精確捕捉目前尺寸（避免 ScrollTrigger 中斷造成不穩定）
    const currentSize = logoEl.offsetWidth || 180;

    // 清除舊的 ScrollTrigger 和 tween
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.getAll().forEach(st => {
        if (st.vars && st.vars.trigger === 'body') st.kill();
      });
    }
    gsap.killTweensOf(logoEl);

    const SCROLL_END = 300;
    const targetSize = isLibraryActive
      ? 100
      : (() => {
          const progress = Math.min(window.scrollY / SCROLL_END, 1);
          return 180 - (180 - 100) * progress;
        })();

    // 用 fromTo 強制指定起點尺寸（避免 GSAP 讀到不一致的狀態）
    // lottie SVG 內部動畫不受 width/height 變化影響，持續旋轉
    gsap.fromTo(logoEl,
      { width: currentSize, height: currentSize },
      {
        width: targetSize,
        height: targetSize,
        duration: 0.6,
        ease: 'power2.inOut',
        onComplete: () => {
          if (!isLibraryActive && !isGenerateActive && typeof ScrollTrigger !== 'undefined') {
            gsap.fromTo(logoEl,
              { width: 180, height: 180 },
              {
                width: 100, height: 100, ease: 'none',
                scrollTrigger: { trigger: 'body', start: 'top top', end: `+=${SCROLL_END}`, scrub: 0.5 }
              }
            );
          }
        }
      }
    );
  }

  function setSideBar(el, isActive) {
    if (!el) return;
    el.style.background = isActive ? '#000' : '#fff';
    el.classList.toggle('bar-active',   isActive);
    el.classList.toggle('bar-inactive', !isActive);
    // SPA 切頁時（cursor 可能還停在 btn 上）清除 hover class，避免黑底黑字殘影
    el.classList.remove('is-bar-hover');
    el.querySelectorAll('a.nav-link').forEach(l => l.classList.toggle('active', isActive));
  }
  setSideBar(libraryBarEl,  isLibraryActive);
  setSideBar(generateBarEl, isGenerateActive);

  // mode-btn 顏色由 .theme-toggle-btn / .theme-toggle-circle 的 var(--theme-fg) 接管
  // 不在這裡 inline-set，避免蓋掉 mode 切換時 CSS 變數的自動更新
  // （/generate 頁的 inline override 由 generate-header-sync 處理，cleanup 時會清掉）

  // About bar scroll collapse：library 頁 marginLeft=0（貼齊 logo），一般頁面 marginLeft=64
  // SPA 切換時做 smooth 動畫（和 logo 同步）
  const aboutBarScrollEl = header.querySelector('[data-bar="about"]');
  if (aboutBarScrollEl && typeof gsap !== 'undefined') {
    const ML_START = 64, ML_END = 0;
    gsap.killTweensOf(aboutBarScrollEl);

    const targetML = isLibraryActive ? ML_END : ML_START;
    gsap.to(aboutBarScrollEl, {
      marginLeft: targetML,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: () => {
        // 動畫完成後，一般頁面重建 scroll shrink
        if (!isLibraryActive && !isGenerateActive && typeof ScrollTrigger !== 'undefined') {
          ScrollTrigger.create({
            trigger: 'body',
            start: 'top top',
            end: '+=120',
            scrub: 0.6,
            onUpdate: (/** @type {any} */ self) => {
              const ml = ML_START + (ML_END - ML_START) * self.progress;
              gsap.to(aboutBarScrollEl, { marginLeft: ml, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
            }
          });
        }
      }
    });
  }
}

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

    // 2. Active Nav State（初次載入）
    let currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

    // Generate page 初次載入時觸發 logo 動畫
    if (currentPage === 'generate') {
      triggerGenerateLogo();
    }

    // 呼叫 updateNavActive 設定初始 active 狀態
    updateNavActive(currentPage);

    // 3. Header Bar Random Rotation
    (function initBarRotations() {
      const aboutBar = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="about"]'));
      const libraryBar = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="library"]'));
      const generateBar = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="generate"]'));

      function getAboutDeg() {
        return Math.round((Math.random() * 3 - 1.5) * 10) / 10;
      }

      function getSmallBarDeg() {
        let deg;
        do { deg = Math.round(Math.random() * 9) - 4; } while (deg === 0);
        return deg;
      }

      if (aboutBar) {
        aboutBar.style.transform = `rotate(${getAboutDeg()}deg)`;
        aboutBar.style.transformOrigin = 'center center';
      }
      [libraryBar, generateBar].filter(Boolean).forEach(el => {
        el.style.transform = `rotate(${getSmallBarDeg()}deg)`;
        el.style.transformOrigin = 'center center';
      });
    })();

    // about bar hover：整條 bar 底色變三原色，hover 單一 item 時字 100% 黑
    const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
    const aboutBar    = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="about"]'));
    const libraryBar  = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="library"]'));
    const generateBar = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="generate"]'));

    // about bar hover：底色隨機三原色
    if (aboutBar) {
      aboutBar.style.transition = 'background 0.4s ease';
      aboutBar.addEventListener('mouseenter', () => {
        aboutBar.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      });
      aboutBar.addEventListener('mouseleave', () => {
        aboutBar.style.background = '';
      });
    }

    // library / gen / mode 各自 hover 時隨機三原色，互不影響
    // 額外加 .is-bar-hover class 讓 CSS 文字色 hover 規則跟著走（class-driven 而非 :hover-driven），
    // 這樣點擊後 setSideBar 可清除 class，避免「cursor 還在 btn / 已導航到 library 頁」造成黑底黑字
    [libraryBar, generateBar].filter(Boolean).forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.classList.add('is-bar-hover');
        el.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('is-bar-hover');
        // 恢復由 updateNavActive 設定的底色
        const isActive = el.classList.contains('bar-active');
        el.style.background = isActive ? '#000' : '#fff';
      });
    });

    // 4. About Bar Scroll Collapse（GSAP + ScrollTrigger）
    (function initAboutBarScroll() {
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

      const aboutBar = header.querySelector('[data-bar="about"]');
      const aboutNav = aboutBar ? aboutBar.querySelector('nav') : null;
      if (!aboutBar || !aboutNav) return;

      const ML_START = 64;  // 2xl
      const ML_END = 0;
      const isLibrary = currentPage === 'library';

      if (isLibrary) {
        gsap.set(aboutBar, { marginLeft: ML_END });
      } else {
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
      }
    })();

    // 5. Logo Lottie + Scale Animation (Responsive)
    const logo = document.getElementById('header-logo');
    if (logo && typeof lottie !== 'undefined' && currentPage !== 'generate') {
      const isInverse = document.body.classList.contains('mode-inverse');
      const logoFile = isInverse ? 'SCCDLogoInverse.json' : 'SCCDLogoStandard.json';
      const logoPath = `data/${logoFile}`;
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
      const isLibrary = currentPage === 'library';
      const isGenerate = currentPage === 'generate';
      if (isDesktop.matches) {
        if (isLibrary) {
          gsap.set(logo, { width: 100, height: 100 });
        } else if (isGenerate) {
          gsap.set(logo, { width: 180, height: 180 });
        } else {
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
        }
      } else {
        gsap.set(logo, { width: 80, height: 80 });
      }
    }

    // 4. Mobile Menu Logic
    // 檢查 initMobileMenu 是否存在，避免因缺少該模組而報錯
    if (typeof initMobileMenu === 'function') {
      initMobileMenu();
    }

    // 5. Scroll Hide：除 logo 外的 header 元素，向下滑時往上移出，向上滑時回來
    // ⚠️ 目前關閉 — header 保持一直可見（不隨下滑位移）
    // 要恢復：把下方 `// enableScrollHide();` 取消註解即可；邏輯保留作為參考
    (function initScrollHide() {
      if (typeof gsap === 'undefined') return;
      if (window.innerWidth < 768) return; // 桌面版才執行

      function enableScrollHide() {
        const hideEls = [
          header.querySelector('[data-bar="about"]'),
          header.querySelector('[data-bar="library"]'),
          header.querySelector('[data-bar="generate"]'),
          header.querySelector('#mode-btn'),
        ].filter(Boolean);

        let lastY = window.scrollY;
        let hidden = false;

        window.addEventListener('scroll', () => {
          const currentY = window.scrollY;
          const goingDown = currentY > lastY;
          lastY = currentY;

          if (goingDown && !hidden && currentY > 50) {
            hidden = true;
            gsap.to(hideEls, { y: -120, duration: 0.35, ease: 'power2.inOut', overwrite: 'auto' });
          } else if (!goingDown && hidden) {
            hidden = false;
            gsap.to(hideEls, { y: 0, duration: 0.35, ease: 'power2.inOut', overwrite: 'auto' });
          }
        }, { passive: true });
      }

      // 掛到 window 供 debug / 之後恢復時呼叫（也順便避免 unused warning）
      /** @type {any} */ (window).__enableHeaderScrollHide = enableScrollHide;
      // 要恢復預設行為：下一行取消註解
      // enableScrollHide();
    })();

    // 6. Header Hide on Footer Reveal
    // 支援靜態 footer（index.html）和動態載入 footer（其他頁面）
    let logoHidden = false;
    function bindFooterScroll() {
      const footerEl = document.querySelector('footer');
      if (!footerEl) return false;
      const logoEl = document.getElementById('header-logo');
      window.addEventListener('scroll', () => {
        const isNearFooter = footerEl.offsetHeight > 0 && footerEl.getBoundingClientRect().top < window.innerHeight * 0.5;
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

  // Load Header HTML（SPA：永遠從根目錄載入）
  if (headerContainer) {
    fetch('pages/header.html')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        headerContainer.innerHTML = html;
        setupHeaderLogic();
        document.dispatchEvent(new CustomEvent('header:ready'));
      })
      .catch(e => console.log('Header load failed', e));
  } else {
    setupHeaderLogic();
  }
}