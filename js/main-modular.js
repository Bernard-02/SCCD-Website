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
import { initBtnFillHover } from './modules/ui/btn-fill-hover.js';
import { initSupportLinkColor } from './modules/ui/support-link-color.js';

// Import About Page Modules
import { initResourcesCycling } from './modules/pages/about/resources-cycling.js';
import { initBrandTrail } from './modules/pages/about/brand-trail.js';
import { initTimeline } from './modules/pages/about/timeline.js'; // Ensure this file exists
import { initAnchorNav } from './modules/navigation/anchor-nav.js';

// Import Page Specific Modules
import { initActivitiesPreview } from './modules/pages/activities-preview.js';
import { initFacultySlideIn } from './modules/pages/faculty-slide-in.js';
import { initActivitiesSectionSwitch } from './modules/pages/activities-section-switch.js';

// Import Accordion Modules
import { initHorizontalAccordion } from './modules/accordions/horizontal-accordion.js';
import { initCourseAccordion } from './modules/accordions/course-accordion.js';
import { initSummerCampAccordion } from './modules/accordions/summer-camp-accordion.js';
import { initWorkshopAccordion } from './modules/accordions/workshop-accordion.js';
import { initActivitiesYearToggle } from './modules/accordions/activities-year-toggle.js';

// Import Data Loaders
import { loadWorkshops, loadSummerCamp } from './modules/pages/activities-data-loader.js';
import { loadGeneralActivities } from './modules/pages/general-activities-data-loader.js';
import { loadRecords } from './modules/pages/records-data-loader.js';
import { loadCourses } from './modules/pages/courses-data-loader.js';
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
  initFooter();
  initSmoothScroll();
  initBtnFillHover();

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
    initHorizontalAccordion(); // About 頁面的 Accordion（通用版）
    initBFADivisionToggle();   // BFA Class 分組切換
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

  // --- Courses Page ---
  if (page.includes('courses')) {
    // 判斷是 BFA 還是 MDES
    const program = page.includes('bfa') ? 'bfa' : 'mdes';
    
    loadCourses(program).then(() => {
      initCoursesFilter();
      initCourseAccordion();
    });
  }

  // --- Support Page ---
  if (page.includes('support.html')) {
    loadSupportData().then(() => {
      initCourseAccordion();
    });
    initSupportLinkColor();
  }

  // --- Activities Page (整合版) ---
  if (page.includes('activities.html') && !page.includes('general-activities.html')) {
    initActivitiesSectionSwitch();
  }

  // --- General Activities (舊獨立頁面) ---
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
    // 如果是 BFA Works 頁面，先載入資料再初始化篩選器
    if (page.includes('bfa-works')) {
      loadBFAWorks().then(() => {
        initWorksFilter();
      });
    } else if (page.includes('mdes-works')) {
      loadMDESWorks().then(() => {
        initWorksFilter();
      });
    } else {
      initWorksFilter();
    }
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
