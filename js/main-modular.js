/**
 * Main JavaScript for SCCD Website (Modular Version)
 * 主入口檔案 - 模組化版本
 */

// Import Layout Modules
import { initHeader } from './header.js';
import { initFooter } from './footer.js';
import { initThemeToggle } from './modules/ui/theme-toggle.js';
import { initRouter } from './router.js';

// Import Filter Modules
import { initFacultyFilter } from './modules/filters/faculty-filter.js';

// Import UI Modules
import { initFloatingItems, initWatchHover } from './modules/animations/floating-items.js';
import { initSmoothScroll } from './modules/ui/smooth-scroll.js';
import { initBFADivisionToggle } from './modules/ui/bfa-division-toggle.js';
import { initBtnFillHover } from './modules/ui/btn-fill-hover.js';
import { initTextReveal } from './modules/ui/text-reveal.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js';
import { initSectionBannerReveal } from './modules/pages/about/section-banner-reveal.js';
import { initClassButtonsSticky } from './modules/pages/about/class-buttons-sticky.js';
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initIntroAnimation } from './modules/pages/intro-animation.js';
import { initHeroAnimation } from './modules/pages/hero-animation.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';
import { initActivitiesSectionSwitch } from './modules/pages/activities-section-switch.js';
import { initActivitiesSearch } from './modules/ui/activities-search.js';
import { initShareModal } from './modules/ui/share-modal.js';
import { initCoursesSectionSwitch } from './modules/pages/courses-section-switch.js';
import { initWorksSectionSwitch } from './modules/pages/works-section-switch.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';
import { initActivitiesYearToggle } from './modules/accordions/activities-year-toggle.js';

// Import Index Page Modules
import { initMarquee } from './modules/pages/index-marquee.js';
import { initYTCard } from './modules/pages/index-yt-card.js';
import { initAdmissionSectionSwitch } from './modules/pages/admission-section-switch.js';

// Import Library Modules
import { initLibraryCard } from './modules/pages/library-card.js';
import { initLibraryPanels } from './modules/pages/library-panels.js';
import { initLibraryViewer } from './modules/pages/library-viewer.js';

// Import Data Loaders
import { loadRecords } from './modules/pages/records-data-loader.js';
import { loadFacultyData } from './modules/pages/faculty-data-loader.js';
import { loadAdmissionData } from './modules/pages/admission-data-loader.js';
import { loadSupportData } from './modules/pages/support-data-loader.js';
import { loadLegalData } from './modules/pages/legal-data-loader.js';
import { loadDegreeShowList, loadDegreeShowDetail } from './modules/pages/degree-show-data-loader.js';

// ── Cleanup（換頁前執行）────────────────────────────────────────
export function cleanupPageModules() {
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
  import('./header.js').then(({ restoreHeaderLogo }) => {
    if (typeof restoreHeaderLogo === 'function') restoreHeaderLogo();
  });
}

// ── 頁面模組初始化（router 每次換頁都會呼叫）──────────────────
export function initPageModules(page, searchParams = new URLSearchParams()) {

  // Hero animation 所有頁面都跑（有 hero section 就會觸發）
  initHeroAnimation();

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
        const header = document.querySelector('#site-header header');
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

  // --- Degree Show Pages ---
  if (page === 'degree-show') {
    loadDegreeShowList();
  }
  if (page === 'degree-show-detail') {
    loadDegreeShowDetail();
  }

  // --- Admission Pages ---
  if (page === 'admission' || page === 'admission-detail') {
    loadAdmissionData();
    if (page === 'admission') {
      initAdmissionSectionSwitch();
    }
  }

  // --- Faculty Pages ---
  if (page === 'faculty') {
    loadFacultyData().then(() => {
      initFacultyFilter();
      initFacultySlideIn();
    });
  }

  // --- Courses Page ---
  if (page === 'courses') {
    initCoursesSectionSwitch();
    initBFADivisionToggle();
  }

  // --- Support Page ---
  if (page === 'support') {
    loadSupportData();
  }

  // --- Activities Page ---
  if (page === 'activities') {
    initActivitiesSectionSwitch('exhibitions');
    initActivitiesSearch();
    initShareModal();
  }

  // --- Records Page ---
  if (page === 'awards') {
    loadRecords().then(() => {
      initActivitiesYearToggle();
    });
  }

  // --- Works Page ---
  if (page === 'works') {
    initWorksSectionSwitch();
  }

  // --- Generate Page ---
  if (page === 'generate') {
    // 觸發 header logo typewriter 動畫（SPA 模式下 header 不重載，需手動觸發）
    import('./header.js').then(({ triggerGenerateLogo }) => {
      if (typeof triggerGenerateLogo === 'function') triggerGenerateLogo();
    });
  }

  // --- Library Page ---
  if (page === 'library') {
    initLibraryViewer();
    const panels = initLibraryPanels();
    initLibraryCard({
      onTabSwitch: (tab) => panels.showPanel(tab),
      onEntranceDone: () => panels.onEntranceDone(),
    });
  }

  // --- Legal Pages ---
  if (page === 'privacy-policy') {
    loadLegalData('privacy-policy');
  }
  if (page === 'terms-and-conditions') {
    loadLegalData('terms-and-conditions');
  }
}

// ── 首次載入（DOMContentLoaded）────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

  console.log('🚀 SCCD Website - Modular JS Loaded');

  // Global Modules（只執行一次）
  initHeader();
  initThemeToggle();
  initFooter();
  initSmoothScroll();
  initBtnFillHover();

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
      const header = document.querySelector('#site-header header');
      if (header) header.style.opacity = '1';
    };
    if (document.querySelector('#site-header header')) {
      showHeader();
    } else {
      document.addEventListener('header:ready', showHeader, { once: true });
    }
  }
  // 非 index 的初始路由由 initRouter() 內部處理

  console.log('✅ Page specific modules initialized');
});
