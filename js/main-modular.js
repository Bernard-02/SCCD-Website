/**
 * Main JavaScript for SCCD Website (Modular Version)
 * 主入口檔案 - 模組化版本
 */

// Import Layout Modules
import { initHeader } from './header.js';
import { initFooter } from './footer.js';

// Import Filter Modules
import { initFacultyFilter } from './modules/filters/faculty-filter.js';
import { initCoursesFilter } from './modules/filters/courses-filter.js';
import { initActivitiesFilter } from './modules/filters/activities-filter.js';
import { initWorksFilter } from './modules/filters/works-filter.js';

// Import UI Modules
import { initSmoothScroll } from './modules/ui/smooth-scroll.js';
import { initBFADivisionToggle } from './modules/ui/bfa-division-toggle.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js';
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initAdmissionLogic } from './modules/pages/admission-logic.js';
import { initActivitiesPreview } from './modules/pages/activities-preview.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';
import { initCourseAccordion } from './modules/accordions/course-accordion.js';
import { initSummerCampAccordion } from './modules/accordions/summer-camp-accordion.js';
import { initWorkshopAccordion } from './modules/accordions/workshop-accordion.js';
import { initActivitiesYearToggle } from './modules/accordions/activities-year-toggle.js';

// Import Data Loaders
import { loadGeneralActivities, loadRecords, loadWorkshops, loadSummerCamp } from './modules/pages/activities-data-loader.js';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

  console.log('🚀 SCCD Website - Modular JS Loaded');

  // 1. Global Modules (所有頁面都會執行)
  initHeader();
  initFooter();
  initSmoothScroll();

  // 2. Page Specific Logic (根據頁面名稱執行對應模組)
  const path = window.location.pathname;
  // 取得當前檔案名稱 (例如: about.html)，如果路徑以 / 結尾則視為 index.html
  const page = path.split('/').pop() || 'index.html';

  console.log(`Current Page: ${page}`);

  // --- About Page ---
  if (page.includes('about.html')) {
    initResourcesCycling();
    initBrandTrail();
    initTimeline();
    initAnchorNav();
    initHorizontalAccordion(); // About 頁面的 Accordion
    initBFADivisionToggle();   // BFA Class 分組切換
  }

  // --- Admission Pages (List & Detail) ---
  if (page.includes('admission')) {
    initAdmissionLogic();
  }

  // --- Faculty Pages ---
  if (page.includes('faculty')) {
    initFacultyFilter();
    initFacultySlideIn();
  }

  // --- Courses Page ---
  if (page.includes('courses')) {
    initCoursesFilter();
    initCourseAccordion();
  }

  // --- Support Page ---
  if (page.includes('support.html')) {
    initCourseAccordion();
  }

  // --- Activities Page ---
  if (page.includes('general-activities.html')) {
    loadGeneralActivities().then(() => {
      initActivitiesFilter();
      initActivitiesPreview();
      initActivitiesYearToggle();
    });
  }

  // --- Records Page ---
  if (page.includes('records.html')) {
    loadRecords().then(() => {
      initActivitiesYearToggle();
    });
  }

  // --- Workshop & Students Present Pages ---
  if (page.includes('workshop.html')) {
    loadWorkshops('../data/workshops.json', 'workshop').then(() => {
      initWorkshopAccordion();
    });
  }
  if (page.includes('students-present.html')) {
    loadWorkshops('../data/students-present.json', 'student').then(() => {
      initWorkshopAccordion();
    });
  }

  // --- Summer Camp Page ---
  if (page.includes('summer-camp.html')) {
    loadSummerCamp().then(() => {
      initSummerCampAccordion();
    });
  }

  // --- Works Page ---
  if (page.includes('works')) {
    initWorksFilter();
  }

  console.log('✅ Page specific modules initialized');

});
