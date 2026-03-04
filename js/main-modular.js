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
import { initSupportLinkColor } from './modules/ui/support-link-color.js';
import { initTextReveal } from './modules/ui/text-reveal.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js'; // Ensure this file exists
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initIntroAnimation } from './modules/pages/intro-animation.js';
import { initHeroAnimation } from './modules/pages/hero-animation.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';
import { initActivitiesSectionSwitch } from './modules/pages/activities-section-switch.js';
import { initCoursesSectionSwitch } from './modules/pages/courses-section-switch.js';
import { initWorksSectionSwitch } from './modules/pages/works-section-switch.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';
import { initCourseAccordion } from './modules/accordions/course-accordion.js';
import { initActivitiesYearToggle } from './modules/accordions/activities-year-toggle.js';

// Import Data Loaders
import { loadRecords } from './modules/pages/records-data-loader.js';
import { loadFacultyData } from './modules/pages/faculty-data-loader.js';
import { loadBFAWorks } from './modules/pages/bfa-works-data-loader.js';
import { loadMDESWorks } from './modules/pages/mdes-works-data-loader.js';
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
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      document.querySelectorAll('.support-group').forEach(group => {
        const titleEl = group.querySelector('.support-group-title');
        const titleWrap = group.querySelector('.support-group-title-wrap');
        const contentEl = group.querySelector('.support-group-content');

        // clip reveal：讓 h3 在 overflow:hidden 的 wrapper 內從下方滑入
        // titleWrap 高度固定為 h3 的高度，overflow:hidden 做遮罩
        if (titleWrap && titleEl) {
          // 固定 wrapper 高度為 h3 當前高度，確保 overflow:hidden 能正確裁剪
          titleWrap.style.height = titleEl.offsetHeight + 'px';
          gsap.set(titleEl, { yPercent: 100 });
        }
        if (contentEl) {
          gsap.set(contentEl, { y: 40, opacity: 0 });
        }

        ScrollTrigger.create({
          trigger: group,
          start: 'top 85%',
          once: true,
          onEnter: () => {
            if (titleEl) {
              gsap.to(titleEl, {
                yPercent: 0,
                duration: 0.8,
                ease: 'power3.out',
                clearProps: 'transform',
                onComplete: () => { if (titleWrap) titleWrap.style.height = ''; },
              });
            }
            if (contentEl) {
              gsap.to(contentEl, {
                y: 0,
                opacity: 1,
                duration: 0.7,
                delay: 0.15,
                ease: 'power2.out',
                clearProps: 'transform,opacity',
              });
            }
          },
        });
      });
    }

    loadSupportData().then(() => {
      initCourseAccordion();
      // accordion items stagger 進場（資料載入後才設定）
      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        const items = document.querySelectorAll('#donation-methods-list .course-item');
        if (items.length > 0) {
          gsap.set(items, { y: 40, opacity: 0 });
          ScrollTrigger.create({
            trigger: '#donation-methods-list',
            start: 'top 90%',
            once: true,
            onEnter: () => {
              gsap.to(items, {
                y: 0,
                opacity: 1,
                duration: 0.6,
                stagger: { each: 0.1, axis: 'y' },
                ease: 'power2.out',
                clearProps: 'transform,opacity',
              });
            },
          });
        }
        ScrollTrigger.refresh();
      }
    });
    initSupportLinkColor();
  }

  // --- Activities Page (整合版) ---
  if (page.includes('activities.html')) {
    initActivitiesSectionSwitch();
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

  // --- Works Page (舊版，保留相容性) ---
  if (page === 'bfa-works.html') {
    loadBFAWorks().then(() => {
      initWorksFilter();
    });
  }
  if (page === 'mdes-works.html') {
    loadMDESWorks().then(() => {
      initWorksFilter();
    });
  }

  // --- Library Page ---
  if (page.includes('library.html')) {
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
