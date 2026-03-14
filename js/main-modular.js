/**
 * Main JavaScript for SCCD Website (Modular Version)
 * 主入口檔案 - 模組化版本
 */

// Import Layout Modules
import { initHeader } from './header.js';
import { initFooter } from './footer.js';
import { initThemeToggle } from './modules/ui/theme-toggle.js';

// Import Filter Modules
import { initFacultyFilter } from './modules/filters/faculty-filter.js';
import { initWorksFilter } from './modules/filters/works-filter.js';

// Import UI Modules
import { initSmoothScroll } from './modules/ui/smooth-scroll.js';
import { initBFADivisionToggle } from './modules/ui/bfa-division-toggle.js';
import { initBtnFillHover } from './modules/ui/btn-fill-hover.js';
import { initTextReveal } from './modules/ui/text-reveal.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js'; // Ensure this file exists
import { initSectionBannerReveal } from './modules/pages/about/section-banner-reveal.js';
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initIntroAnimation } from './modules/pages/intro-animation.js';
import { initHeroAnimation } from './modules/pages/hero-animation.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';
import { initActivitiesSectionSwitch } from './modules/pages/activities-section-switch.js';
import { initActivitiesSearch } from './modules/ui/activities-search.js';
import { initCoursesSectionSwitch } from './modules/pages/courses-section-switch.js';
import { initWorksSectionSwitch } from './modules/pages/works-section-switch.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';
import { initActivitiesYearToggle } from './modules/accordions/activities-year-toggle.js';

// Import Data Loaders
import { loadRecords } from './modules/pages/records-data-loader.js';
import { loadFacultyData } from './modules/pages/faculty-data-loader.js';
import { loadBFAWorks, loadMDESWorks } from './modules/pages/bfa-works-data-loader.js';
import { loadLibraryData } from './modules/pages/library-data-loader.js';
import { loadAdmissionData } from './modules/pages/admission-data-loader.js';
import { loadSupportData } from './modules/pages/support-data-loader.js';
import { loadLegalData } from './modules/pages/legal-data-loader.js';
import { loadDegreeShowList, loadDegreeShowDetail } from './modules/pages/degree-show-data-loader.js';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

  console.log('🚀 SCCD Website - Modular JS Loaded');

  // 1. Global Modules (所有頁面都會執行)
  initHeader();
  initThemeToggle();
  initFooter();
  initSmoothScroll();
  initBtnFillHover();
  initHeroAnimation();

  // 2. Page Specific Logic (根據頁面名稱執行對應模組)
  const path = window.location.pathname;
  // 取得當前檔案名稱 (例如: about.html)，如果路徑以 / 結尾則視為 index.html
  const page = path.split('/').pop() || 'index.html';

  // --- Index Page ---
  if (page === 'index.html' || page === '') {
    if (!sessionStorage.getItem('sccd-intro-shown')) {
      sessionStorage.setItem('sccd-intro-shown', '1');
      initIntroAnimation();
    } else {
      // 跳過 loader：直接隱藏 overlay，顯示 header
      const overlay = document.getElementById('intro-overlay');
      if (overlay) overlay.style.display = 'none';
      document.body.style.overflow = '';

      // header opacity 由 index.html inline style 設為 0，需手動還原
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
  }

  console.log(`Current Page: ${page}`);

  // --- About Page ---
  if (page.includes('about.html')) {
    initResourcesCycling();
    initBrandTrail();
    initTimeline();
    initAnchorNav();
    initHorizontalAccordion(); // About 頁面的 Accordion（通用版）
    initBFADivisionToggle();   // BFA Class 分組切換
    initTextReveal();
    initSectionBannerReveal(); // Section banner 放大進場動畫

    // Class section 圖片 fade in + hover z-index
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

      // Hover: 用 mouseenter/mouseleave 控制 z-index，避免 CSS hover 因圖層切換失效
      if (window.innerWidth >= 768) {
        imgs.forEach(img => {
          img.addEventListener('mouseenter', () => { img.style.zIndex = '10'; });
          img.addEventListener('mouseleave', () => { img.style.zIndex = ''; });
        });
      }
    }
  }

  // --- Degree Show Pages ---
  if (page.includes('degree-show.html')) {
    loadDegreeShowList();
  }
  if (page.includes('degree-show-detail.html')) {
    loadDegreeShowDetail();
  }

  // --- Admission Pages (List & Detail) ---
  if (page.includes('admission')) {
    loadAdmissionData();
  }

  // --- Faculty Pages ---
  if (page.includes('faculty')) {
    loadFacultyData().then(() => {
      initFacultyFilter();
      initFacultySlideIn();
    });
  }

  // --- Courses Page (整合版) ---
  if (page === 'courses.html') {
    initCoursesSectionSwitch();
  }

  // --- Support Page ---
  if (page.includes('support.html')) {
    loadSupportData();
  }

  // --- Activities Page (整合版) ---
  if (page.includes('activities.html')) {
    initActivitiesSectionSwitch();
    initActivitiesSearch();
  }

  // --- Records Page ---
  if (page.includes('awards.html')) {
    loadRecords().then(() => {
      initActivitiesYearToggle();
    });
  }

  // --- Works Page (合併版) ---
  if (page === 'works.html') {
    initWorksSectionSwitch(
      () => loadBFAWorks().then(() => initWorksFilter()),
      () => loadMDESWorks()
    );
  }

  // --- Library / Museum Page ---
  if (page.includes('library.html')) {
    // 初始化分頁切換（複用 activities section switch，預設 awards）
    initActivitiesSectionSwitch('awards');
    // Awards tab：載入 ticker + records
    loadRecords().then(() => {
      initActivitiesYearToggle();
    });
    // Files tab：載入 library 書籍卡片（PDF viewer）
    loadLibraryData();
  }

  // --- Legal Pages ---
  if (page.includes('privacy-policy.html')) {
    loadLegalData('privacy-policy');
  }
  if (page.includes('terms-and-conditions.html')) {
    loadLegalData('terms-and-conditions');
  }

  console.log('✅ Page specific modules initialized');

});
