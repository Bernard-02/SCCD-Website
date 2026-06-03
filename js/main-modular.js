/**
 * Main JavaScript for SCCD Website (Modular Version)
 * 主入口檔案 - 模組化版本
 */

// Import Layout Modules
import { initHeader } from './header.js';
import { initFooter } from './footer.js';
import { initThemeToggle, applyModeForPage, updateToggleBtnVisualState } from './modules/ui/theme-toggle.js';
import { initRouter } from './router.js';

// Import Filter Modules
import { initFacultyFilter } from './modules/filters/faculty-filter.js';

// Import UI Modules
import { initFloatingItems, initWatchHover } from './modules/animations/floating-items.js';
import { initSmoothScroll } from './modules/ui/smooth-scroll.js';
import { initBFADivisionToggle } from './modules/ui/bfa-division-toggle.js';
import { initBtnFillHover } from './modules/ui/btn-fill-hover.js';
import { initTextReveal } from './modules/ui/text-reveal.js';
import { initIdleStandby } from './modules/ui/idle-standby.js';
import { initCustomScrollbar } from './modules/ui/custom-scrollbar.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js';
import { initSectionBannerReveal } from './modules/pages/about/section-banner-reveal.js';
import { initClassButtonsSticky } from './modules/pages/about/class-buttons-sticky.js';
import { initClassImagesSlideshow } from './modules/pages/about/class-images-slideshow.js';
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initIntroAnimation } from './modules/pages/intro-animation.js';
import { initHeroAnimation } from './modules/pages/hero-animation.js';
import { initHeroMobileSync } from './modules/pages/hero-mobile-sync.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';
import { initActivitiesSectionSwitch } from './modules/pages/activities-section-switch.js';
import { initActivitiesSearch } from './modules/ui/activities-search.js';
import { initShareModal } from './modules/ui/share-modal.js';
import { initCoursesSectionSwitch } from './modules/pages/courses-section-switch.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';

// Import Index Page Modules
import { initMarquee } from './modules/pages/index-marquee.js';
import { initYTCard } from './modules/pages/index-yt-card.js';
import { initAdmissionSectionSwitch } from './modules/pages/admission-section-switch.js';

// Import Library Modules
import { initLibraryCard } from './modules/pages/library-card.js';
import { initLibraryPanels, resolveInitialTabFromHash } from './modules/pages/library-panels.js';
import { initLibraryViewer, initPdfViewer } from './modules/pages/library-viewer.js';
import { setActiveNavBtn } from './modules/ui/section-switch-helpers.js';

// Import Lightbox Shell（共用 enter/exit 行為；SPA cleanup 需 reset openCount）
import { resetLightboxMode, getHeaderTargets } from './modules/lightbox/lightbox-shell.js';

// Import Page Cleanup Registry（各模組註冊離頁要解綁的 window/document listener，SPA 換頁統一 drain）
import { runPageCleanups } from './modules/ui/page-cleanup.js';

// Import Generate Page Modules
import { initCreatePage, cleanupCreatePage } from './modules/pages/create-app.js';

// Import Atlas Page Modules
import { initAtlas, cleanupAtlas } from './modules/pages/atlas.js';

// Import Alumni Page Module
import { initAlumni } from './modules/pages/alumni.js';

// Import Data Loaders
import { loadFacultyData } from './modules/pages/faculty-data-loader.js';
import { loadAdmissionData } from './modules/pages/admission-data-loader.js';
import { loadLegalData } from './modules/pages/legal-data-loader.js';
import { loadDegreeShowDetail } from './modules/pages/degree-show-data-loader.js';
import { init404, cleanup404 } from './modules/pages/error-404.js';

// ── Cleanup（換頁前執行）────────────────────────────────────────
// destPage 可選：router 切到同頁時帶入。same-page reentry to /create 時跳過 restoreHeaderLogo，
// 讓 header SCCD typewriter 完成態完全保留（user 2026-05-31：header 不受影響、內容該退就退）
/** @param {string} [destPage] */
export function cleanupPageModules(destPage) {
  const isSameGenerateReentry = destPage === 'generate' && window.location.pathname.includes('create');
  // 各模組註冊的 page-level cleanup（window/document listener、interval、observer）
  // 必須早於後續 ScrollTrigger.kill / gsap.killTweensOf — 那些只清 DOM 內 trigger，window 級無感
  runPageCleanups();

  // 解鎖 body scroll：若離開頁面時某個 modal/slide-in（faculty / library viewer 等）
  // 還沒關閉，body.style.overflow 可能被鎖成 hidden，造成下個頁面 scrollbar 消失
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  // slide-in 殘留：切頁時若 faculty/courses slide-in 還開著，has-slide-in class 留下 → scrollbar.css 規則持續 !important 套 --slide-bg-color
  document.documentElement.classList.remove('has-slide-in');
  document.documentElement.style.removeProperty('--slide-bg-color');
  // lightbox 殘留：class 殘留會持續 pointer-events:none 在 header；lightbox-shell 已不碰 html bg / gutter
  // 保留 documentElement.style.backgroundColor reset 以清除其他模組（如 faculty-slide-in、video-player）的殘留
  document.body.classList.remove('lightbox-open');
  document.documentElement.style.backgroundColor = '';
  // lightbox-shell openCount 歸零，避免某個 modal 沒走 exit 流程時 state 殘留導致下次開不觸發 enter
  resetLightboxMode();
  // lightbox header bars 殘留 inline clipPath → 切頁後 header bars 持續被 clip 隱藏；kill tween + 清 inline
  // selector 集中走 lightbox-shell.getHeaderTargets()（之前是 selector 雙寫，header 結構改一處會漏改另一處）
  // 排除 #mode-btn：它的 inline clipPath 是 animateHeaderModeBtnHide 在 /create 頁刻意設的 hide 狀態，
  // 不是 lightbox 殘留；清掉會讓 /create same-page reentry 時 mode-btn 視覺凍結現身
  if (typeof gsap !== 'undefined') {
    const lbHeaderTargets = getHeaderTargets().filter(el => el.id !== 'mode-btn');
    if (lbHeaderTargets.length) {
      gsap.killTweensOf(lbHeaderTargets);
      lbHeaderTargets.forEach(el => { el.style.clipPath = ''; el.style.visibility = ''; });
    }
  }

  // 拆 iframe 後 generate-app 在主 window 跑 p5 instance，離開頁面要 _p5.remove() 釋放 RAF / canvas
  cleanupCreatePage();

  // Atlas 頁：移除 wheel listener / RAF
  cleanupAtlas();

  // 404 頁：移除 body.page-404 class（CSS rule 隨 main innerHTML 替換已消失，class 殘留不致影響其他頁但仍清掉保乾淨）
  cleanup404();

  if (typeof ScrollTrigger === 'undefined') return;
  // 只 kill 頁面內容的 ScrollTrigger，不動 header 的（header trigger 綁在 body/header 元素上）
  const main = document.getElementById('page-content');
  if (!main) return;
  const pageEls = new Set(main.querySelectorAll('*'));
  ScrollTrigger.getAll().forEach(t => {
    const triggerEl = t.trigger;
    // 保留 trigger 是 body 或 header 相關元素的（header logo / about bar）
    if (!triggerEl || triggerEl === document.body || triggerEl === document.documentElement) return;
    if (!pageEls.has(triggerEl)) return;
    t.kill();
  });
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(main.querySelectorAll('*'));
  }
  // 恢復被 generate 頁面修改的 Logo
  // Same-page reentry 到 /create：跳過 restore，讓 SCCD typewriter 完成態保留（user 期望 header 靜止）
  if (!isSameGenerateReentry) {
    import('./header.js').then(({ restoreHeaderLogo }) => {
      if (typeof restoreHeaderLogo === 'function') restoreHeaderLogo();
    });
  }
}

// ── 頁面模組初始化（router 每次換頁都會呼叫）──────────────────
export function initPageModules(page, searchParams = new URLSearchParams()) {

  // Theme mode：每次切頁 re-evaluate
  // /generate 頁暫停 mode（移除 body class）+ 按鈕 disabled；其他頁恢復 sessionStorage 的 mode
  applyModeForPage(page);
  updateToggleBtnVisualState(page);

  // Hero animation 所有頁面都跑（有 hero section 就會觸發）
  // 例外：degree-show-detail 的 hero 文字由 async fetch 填入，必須等 data loader 設好 textContent 後再呼叫，
  // 否則動畫跑在空元素上、clearProps 完才填字，使用者看到的是靜態文字（中文標題沒有進場動畫）
  //
  // 需等 header:ready：randomizeHeroLayout 要量 #header-logo bounds 避免文字被 logo 切到（faculty 等頁有 hero-rand-grid 隨機排版），
  // header 是 async fetch 注入，未 ready 時 querySelector('#header-logo') 為 null；
  // 下方 guard（header 已在則立即跑、否則等 event once）已消除「event 早於 listener」race，故各頁共用即可。
  // support 頁 2026-06-03 改 legal-page layout（無 hero-rand-grid）後也回歸共用 initHeroAnimation（title chip 進場 + 派色）。
  if (page !== 'degree-show-detail') {
    // hero-mobile-sync：4 頁共用 hero (faculty/courses/activities/admission) 手機 DOM 從桌面 clone 文案+banner src
    // 必須在 initHeroAnimation 之前跑：hero-animation.js 對 [data-hero-hl] 套色時手機 chip 要已注入內容
    // 其他頁無 .hero-mobile / .hero-rand-grid 結構 → sync 函式自身 early return 不影響
    initHeroMobileSync();
    if (document.querySelector('#site-header header')) {
      initHeroAnimation();
    } else {
      document.addEventListener('header:ready', initHeroAnimation, { once: true });
    }
  }

  // --- Index Page ---
  if (page === 'index') {
    if (!sessionStorage.getItem('sccd-intro-shown')) {
      sessionStorage.setItem('sccd-intro-shown', '1');
      initIntroAnimation();
    } else {
      const overlay = document.getElementById('intro-overlay');
      if (overlay) overlay.style.display = 'none';
      document.body.style.overflow = '';

      const showHeader = () => {
        const header = /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
        if (header) header.style.opacity = '1';
      };
      if (document.querySelector('#site-header header')) {
        showHeader();
      } else {
        document.addEventListener('header:ready', showHeader, { once: true });
      }
    }
    initMarquee();
    initFloatingItems();
    initWatchHover();
    initYTCard();
  }

  // --- About Page ---
  if (page === 'about') {
    initResourcesCycling();
    initBrandTrail();
    initTimeline();
    initAnchorNav();
    initHorizontalAccordion();
    initBFADivisionToggle();
    initTextReveal();
    initSectionBannerReveal();
    initClassButtonsSticky();
    initClassImagesSlideshow();

    const classImages = document.querySelector('[data-class-images]');
    if (classImages) {
      const imgs = classImages.querySelectorAll('img');
      ScrollTrigger.create({
        trigger: classImages,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          gsap.from(imgs, {
            y: 40, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
            clearProps: 'all'
          });
        }
      });

      if (window.innerWidth >= 768) {
        imgs.forEach(img => {
          img.addEventListener('mouseenter', () => { img.style.zIndex = '10'; });
          img.addEventListener('mouseleave', () => { img.style.zIndex = ''; });
        });
      }
    }
  }

  // --- Degree Show Detail Page ---
  // degree-show list 已整合到 activities panel（loadDegreeShowListInto），舊獨立頁已刪
  if (page === 'degree-show-detail') {
    loadDegreeShowDetail();
  }

  // --- Admission Page ---
  if (page === 'admission') {
    loadAdmissionData().then(() => initAdmissionSectionSwitch());
  }

  // --- Faculty Pages ---
  if (page === 'faculty') {
    loadFacultyData().then(() => {
      initFacultyFilter();
      initFacultySlideIn();
    });
  }

  // --- Curriculum Page（route/file 改名 curriculum；內部模組/CSS class 仍叫 courses-*）---
  if (page === 'curriculum') {
    initCoursesSectionSwitch();
  }

  // --- Activities Page ---
  if (page === 'activities') {
    initActivitiesSectionSwitch('exhibitions');
    initActivitiesSearch();
    // ref 內 pdfUrl 觸發共用 PDF viewer（與 library / alumni 共用 sccd:open-pdf）
    initPdfViewer();
  }


  // --- Atlas Page ---
  if (page === 'atlas') {
    initAtlas();
  }

  // --- Alumni Page ---
  if (page === 'alumni') {
    initAlumni();
  }

  // --- Generate Page ---
  if (page === 'generate') {
    // generate-app 在主 window 跑 p5 instance（attach 到 #create-app），mode 由 sessionStorage 讀
    initCreatePage();

    // 觸發 header logo typewriter 動畫；冷載入時 header async fetch 還沒到，等 header:ready
    const fireGenLogo = () => {
      import('./header.js').then(({ triggerGenerateLogo }) => {
        if (typeof triggerGenerateLogo === 'function') triggerGenerateLogo();
      });
    };
    if (document.querySelector('#site-header header')) {
      fireGenLogo();
    } else {
      document.addEventListener('header:ready', fireGenLogo, { once: true });
    }
  }

  // --- Library Page ---
  if (page === 'library') {
    initLibraryViewer();
    const panels = initLibraryPanels();

    // deep-link 進場時直接以 hash 推測的目標 panel 為 gray 中心，
    // 不要先進 awards 再 switchPanel（會看到 awards 一閃即逝）。
    // resolveInitialTabFromHash 看 hash 前綴（如 #f-* → files），無 hash 則 awards。
    const initialTab = resolveInitialTabFromHash();

    // 手機版：跳過 card stack 幾何計算（randomize x/y 容易超出 viewport → 水平位移），
    // 改用頂端 tab bar 直接 panels.showPanel；layout 由 CSS 處理
    // tab bar 沿用 activities-section-bar pattern → 走 setActiveNavBtn 提供 active 隨機色 + 旋轉
    if (window.innerWidth < 768) {
      const tabsRoot = document.getElementById('library-mobile-tabs');
      panels.showPanel(initialTab, { reveal: true });
      panels.onEntranceDone();
      panels.handleHash();

      // press/files/album panel 桌面結構是 2×2 grid：Year 標題在 top-left、year-picker 在 bottom-left（兩個獨立 grandchildren）
      // 手機要求「Year 標題跟 year-picker 是同一個 group」對齊 awards panel 樣式
      // → DOM 搬：把 year-picker-wrap 整個搬到 Year 標題 wrapper 內當子，這樣 Year 標題 wrapper 變 group container
      ['press', 'files', 'album'].forEach(name => {
        const panel = document.getElementById(`lib-panel-${name}`);
        if (!panel) return;
        const grid = /** @type {HTMLElement|null} */ (panel.querySelector(':scope > div[style*="grid"]'));
        if (!grid) return;
        const children = /** @type {HTMLElement[]} */ ([...grid.children]);
        if (children.length < 3) return;
        const yearLabelWrap = children[0];    // top-left: Year 標題 wrapper
        const yearPickerWrap = children[2];   // bottom-left: year-picker-wrap wrapper（含 picker）
        if (yearLabelWrap && yearPickerWrap && yearPickerWrap.parentElement === grid) {
          yearLabelWrap.appendChild(yearPickerWrap);
        }
      });

      const tabBtns = tabsRoot?.querySelectorAll('.activities-section-btn') ?? [];
      setActiveNavBtn(tabBtns, initialTab, 'data-tab');

      tabsRoot?.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const btn = target.closest('.activities-section-btn');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        if (!tab) return;
        panels.showPanel(tab, { reveal: true });
        setActiveNavBtn(tabBtns, tab, 'data-tab');
        // 切 tab 後 scroll 回頁面頂讓 user 從 search bar 看起
        window.scrollTo({ top: 0, behavior: 'instant' });
        const currentHash = window.location.hash.slice(1);
        if (currentHash !== tab) {
          history.replaceState(null, '', window.location.pathname + '#' + tab);
        }
      });
      return;
    }

    if (initialTab !== 'awards') {
      // 預先 swap panel display，讓 content 層 fade-in 時看到的就是目標 panel
      // reveal:false → 只切 display 不跑 wipe；等 grayEl 進場揭露完 onTabSwitch 才 reveal
      panels.showPanel(initialTab, { reveal: false });
    }

    // 進場動畫期間的第一次 onTabSwitch 是自動觸發的（預設 tab），不能覆蓋 deep-link hash
    // 只有 onEntranceDone 後的 tab 切換才是使用者手動點擊
    let entranceDone = false;
    initLibraryCard({
      initialTab,
      // tab swap 揭露前 pre-swap panel display + hide children，
      // 避免 clip 揭露中看到舊 panel 的 chip 在左上角 visible
      onTabSwitchPre: (tab) => {
        panels.showPanel(tab, { reveal: false });
      },
      onTabSwitch: (tab) => {
        panels.showPanel(tab);
        if (!entranceDone) return; // 自動切換（進場動畫）→ 保留現有 hash

        // 使用者手動切換 tab → 更新 URL hash
        const currentHash = window.location.hash.slice(1);
        if (currentHash !== tab) {
          history.replaceState(null, '', window.location.pathname + '#' + tab);
        }
      },
      onEntranceDone: () => {
        panels.onEntranceDone();
        // 進場動畫完成後處理 hash deep link（如 library.html#a-2024-01）
        // 已 pre-swap 到目標 panel；handleHash 內 showLibPanel 為 idempotent，
        // 主要工作變成 scroll-into-view + 該項目 hover flash
        panels.handleHash();
        entranceDone = true;
      },
    });
  }

  // --- Legal Pages ---
  if (page === 'regulations') {
    loadLegalData('regulations');
  }
  if (page === 'privacy-policy') {
    loadLegalData('privacy-policy');
  }
  if (page === 'accessibility') {
    loadLegalData('accessibility');
  }

  // --- 404 Page ---
  if (page === '404') {
    init404();
  }
}

// ── 首次載入（DOMContentLoaded）────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Global Modules（只執行一次）
  initHeader();
  initThemeToggle();
  initFooter();
  initSmoothScroll();
  initBtnFillHover();
  initIdleStandby();
  initCustomScrollbar();
  initShareModal();

  // 啟動 Router（攔截連結、處理 popstate）
  initRouter();

  // 首頁初始化（router 判斷非 index 才會自行 fetch，index 由這裡處理）
  const path = window.location.pathname;
  const page = path.split('/').pop().replace('.html', '') || 'index';
  const isIndex = page === 'index' || page === '';

  if (isIndex) {
    initPageModules('index');
  } else {
    // 直接進入內頁時，隱藏首頁的 intro overlay 並顯示 header
    const overlay = document.getElementById('intro-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    const showHeader = () => {
      const header = /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
      if (header) header.style.opacity = '1';
    };
    if (document.querySelector('#site-header header')) {
      showHeader();
    } else {
      document.addEventListener('header:ready', showHeader, { once: true });
    }
  }
  // 非 index 的初始路由由 initRouter() 內部處理
});
