/**
 * Main JavaScript for SCCD Website (Modular Version)
 * 主入口檔案 - 模組化版本
 */

// ── 全站常駐模組（每頁都要：layout / 主題 / 換頁清理 / hero）──────────────────
import { initHeader } from './header.js';
import { initFooter } from './footer.js';
import { initSiteAssets } from './modules/ui/site-assets.js';
import { initThemeToggle, applyModeForPage, updateToggleBtnVisualState } from './modules/ui/theme-toggle.js';
import { initRouter } from './router.js';
import { initSmoothScroll } from './modules/ui/smooth-scroll.js';
import { initIdleStandby } from './modules/ui/idle-standby.js';
import { initOrientationReload } from './modules/ui/orientation-reload.js';
import { initCustomScrollbar } from './modules/ui/custom-scrollbar.js';
import { initModeColorPanel } from './modules/ui/mode-color-panel.js';
import { installReducedMotionGsap, prefersReducedMotion } from './modules/ui/reduce-motion.js';
import { loadUiLabels, applyUiLabels } from './modules/ui/ui-labels.js';
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from './modules/ui/scroll-animate.js';
import { initHeroAnimation, resetHeroDone } from './modules/pages/hero-animation.js';
import { initHeroMobileSync } from './modules/pages/hero-mobile-sync.js';
import { loadHero } from './modules/pages/hero-source.js';
import { initLegalTitleRandom } from './modules/pages/legal-title-random.js';
import { initShareModal } from './modules/ui/share-modal.js';
import { setActiveNavBtn, bindNavBtnSpin } from './modules/ui/section-switch-helpers.js';
import { resetLightboxMode, getHeaderTargets } from './modules/lightbox/lightbox-shell.js';
import { deepLinkUnlocker } from './modules/ui/deeplink-lock.js';
// Page Cleanup Registry（各模組註冊離頁要解綁的 window/document listener，SPA 換頁統一 drain）
import { runPageCleanups, registerPageCleanup } from './modules/ui/page-cleanup.js';
import { registerPageExit } from './modules/ui/page-exit.js';
import { DUR, EASE } from './modules/ui/motion.js';

// ── 頁面專屬模組一律動態載入：進該頁才 import（user 2026-10-04；原本 52 個靜態 import＝每頁都載全站 ~2MB JS）。
// 瀏覽器 module cache 共用一份（各頁 / idle-standby 待機星雲重複 import 不重下載）。
// lazySeq：換頁 cleanup 時 ++；initPageModules 開頭取一次 seq，各頁 import 完 init 前比對 → 「下載中快速連點換頁」
// 不會 stale/double-init（同頁多支模組共用同一個 seq）。xxxModule 存已載入的 namespace 給 cleanup 用。
let atlasModule = null;
let createAppModule = null;
let errorModule = null;
let lazySeq = 0;

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
  // slide-in 殘留：切頁時若 faculty/courses slide-in 還開著，has-slide-in class 留下 → footer 讓位 / scrollbar 隱藏規則持續生效
  document.documentElement.classList.remove('has-slide-in');
  // lightbox 殘留：class 殘留會持續 pointer-events:none 在 header；lightbox-shell 已不碰 html bg / gutter
  // 保留 documentElement.style.backgroundColor reset 以清除其他模組（如 faculty-slide-in、video-player）的殘留
  document.body.classList.remove('lightbox-open');
  // atlas mode-btn gate 殘留：atlas chunk import 期間就離頁的話 initAtlas 沒跑、沒人解鎖 → 全站 mode btn 卡死
  document.body.classList.remove('atlas-mode-gate');
  document.documentElement.style.backgroundColor = '';
  // lightbox-shell openCount 歸零，避免某個 modal 沒走 exit 流程時 state 殘留導致下次開不觸發 enter
  resetLightboxMode();
  // lightbox header bars 殘留 inline clipPath → 切頁後 header bars 持續被 clip 隱藏；kill tween + 清 inline
  // selector 集中走 lightbox-shell.getHeaderTargets()（之前是 selector 雙寫，header 結構改一處會漏改另一處）
  // 排除 #mode-btn：/create 收它的狀態由 header.js animateHeaderModeBtnHide 管（2026-10-01 起是遮罩平移、非 clipPath），
  // 這裡別碰，免得 /create same-page reentry 時誤放出來
  if (typeof gsap !== 'undefined') {
    const lbHeaderTargets = getHeaderTargets().filter(el => el.id !== 'mode-btn');
    if (lbHeaderTargets.length) {
      gsap.killTweensOf(lbHeaderTargets);
      lbHeaderTargets.forEach(el => { el.style.clipPath = ''; el.style.visibility = ''; });
    }
  }

  // 動態載入頁的 cleanup：沒載過＝沒 init 過可跳過；seq++ 使還在下載中的 pending init 失效
  lazySeq++;
  // 拆 iframe 後 generate-app 在主 window 跑 p5 instance，離開頁面要 _p5.remove() 釋放 RAF / canvas
  if (createAppModule) createAppModule.cleanupCreatePage();
  // Atlas 頁：移除 wheel listener / RAF
  if (atlasModule) atlasModule.cleanupAtlas();

  // 404 頁：移除 body.page-404 class（CSS rule 隨 main innerHTML 替換已消失，class 殘留不致影響其他頁但仍清掉保乾淨）
  if (errorModule) errorModule.cleanup404();

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
// fromUserNav：true=使用者點連結的 SPA 導航；false=初始載入 / refresh / 上一頁下一頁。
// 給 curriculum 的 deep-link（?item= 自動捲到 section + 開 slide-in）判斷：只有從首頁卡片
// 點進來（fromUserNav）才播這段導航動畫，refresh 視為全新頁面不重播。
// 隱藏 intro overlay、解鎖 body scroll、顯示 header（header 尚未載入則等 header:ready）
function revealHeaderWhenReady() {
  const overlay = document.getElementById('intro-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  const showHeader = () => {
    const header = /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
    if (!header) return;
    header.style.opacity = '1';
    // 互動只在「完全顯示後」才開：opacity 是淡入的（typography 白名單 transition）→ 淡入中隱形卻可點＝
    // mode btn 有 pointer cursor＋可點（user 2026-09-04）。輪詢 opacity 至 ~1 才開（隱形時 --header-pe:none，見 index.html）。
    // 開的是 --header-pe 不是 header 本體 pe：本體恆 none 讓中間空白放行（navigation.css header 放行規則）
    const enablePE = () => {
      if (parseFloat(getComputedStyle(header).opacity) >= 0.99) header.style.setProperty('--header-pe', 'auto');
      else requestAnimationFrame(enablePE);
    };
    requestAnimationFrame(enablePE);
  };
  if (document.querySelector('#site-header header')) {
    showHeader();
  } else {
    document.addEventListener('header:ready', showHeader, { once: true });
  }
}

export function initPageModules(page, searchParams = new URLSearchParams(), fromUserNav = false) {

  // deep-link 呈現完的解鎖鑰匙：init 當下同步取（admission／faculty 的 init 要等資料、library 等進場，晚取會拿到
  // 使用者離頁後才點的新 deep-link 序號）→ 傳給各頁，見 deeplink-lock.js deepLinkUnlocker
  const unlock = deepLinkUnlocker();
  // 本頁動態載入的 init 共用同一個序號：import 完才 init，期間已換頁（cleanup ++ 過）就放棄
  const seq = lazySeq;
  const alive = () => seq === lazySeq;

  // Theme mode：每次切頁 re-evaluate
  // /generate 頁暫停 mode（移除 body class）+ 按鈕 disabled；其他頁恢復 sessionStorage 的 mode
  applyModeForPage(page);
  updateToggleBtnVisualState(page);

  // Nav / 分頁按鈕文字：後台 ui_labels 為主、本地 fallback（見 ui-labels.js）。
  // 只在該頁有帶 data-label-key 的按鈕時才抓（避免無關頁面打 Directus）；fire-and-forget，
  // HTML 內原文字＝載入前 / 斷線的 fallback，故晚填也不閃。
  const labelRoot = document.getElementById('page-content') || document;
  if (labelRoot.querySelector('[data-label-key]')) {
    loadUiLabels().then(map => applyUiLabels(map, labelRoot));
  }

  // 分頁標題跟後台 nav 名（HTML <title> 靜態值＝爬蟲 / 斷線 fallback；無 nav.* key 的頁不動）。
  // header 已抓過 ui_labels → 吃 single-flight 快取不多打請求；回來時 title 已被 router 換掉＝使用者已離頁，不蓋
  const staticTitle = document.title;
  loadUiLabels().then(map => {
    const en = map[`nav.${page === 'generate' ? 'create' : page}`]?.en;
    if (en && document.title === staticTitle) document.title = `${en} - SCCD`;
  });

  // Hero animation 所有頁面都跑（有 hero section 就會觸發）
  // 例外：degree-show-detail 的 hero 文字由 async fetch 填入，必須等 data loader 設好 textContent 後再呼叫，
  // 否則動畫跑在空元素上、clearProps 完才填字，使用者看到的是靜態文字（中文標題沒有進場動畫）
  //
  // 需等 header:ready：randomizeHeroLayout 要量 #header-logo bounds 避免文字被 logo 切到（faculty 等頁有 hero-rand-grid 隨機排版），
  // header 是 async fetch 注入，未 ready 時 querySelector('#header-logo') 為 null；
  // 下方 guard（header 已在則立即跑、否則等 event once）已消除「event 早於 listener」race，故各頁共用即可。
  // support 頁 2026-06-03 改 legal-page layout（無 hero-rand-grid）後也回歸共用 initHeroAnimation（title chip 進場 + 派色）。
  if (page !== 'degree-show-detail') {
    // 先同步清掉上一頁殘留的 _heroDone：下方 header 未就緒時 initHeroAnimation 被 defer 到 header:ready，
    // 但本頁 deep-link 消費者（initCoursesSectionSwitch / initActivitiesSectionSwitch 的 waitForHeroAnimDone）
    // 在本函式稍後同步跑 → 若不先清，會讀到上一頁的 _heroDone=true 立刻 resolve＝沒等 hero 就 scroll/slide
    // （user 2026-06-28 bug 1/4）。在這同步清 → 消費者一定讀到 false、改等 hero:animation-done。
    resetHeroDone();
    // hero 標題/副標/banner：Directus <page>_hero 為主、LKG/本地 json fallback（見 hero-source.js）。
    // ⚠️ 必須在 initHeroAnimation 之前呼叫：loadHero 同步 prefix 會在 banner img 標 data-hero-wait
    //（banner「以後台為主、單次揭露」，user 2026-09-11），timeline build 讀旗標才不把 img 排進進場。
    loadHero(page);
    // hero-mobile-sync：4 頁共用 hero (faculty/courses/activities/admission) 手機 DOM 從桌面 clone 文案+banner src
    // 必須在 initHeroAnimation 之前跑：hero-animation.js 對 [data-hero-hl] 套色時手機 chip 要已注入內容
    // 其他頁無 .hero-mobile / .hero-rand-grid 結構 → sync 函式自身 early return 不影響
    initHeroMobileSync();
    if (document.querySelector('#site-header header')) {
      initHeroAnimation();
    } else {
      document.addEventListener('header:ready', initHeroAnimation, { once: true });
    }
    // legal-page 左欄大標題 chip 隨機傾角 + 水平位移（自我守衛：無 .legal-title-block 即 return）。
    // 設 CSS var 在 .legal-title-block 上即可，不需等 hero wrapper 生成（wrapper 之後繼承讀 var）。
    initLegalTitleRandom();
  }

  // --- Index Page ---
  if (page === 'index') {
    const firstVisit = !sessionStorage.getItem('sccd-intro-shown');
    if (firstVisit) sessionStorage.setItem('sccd-intro-shown', '1');
    else revealHeaderWhenReady();
    Promise.all([
      firstVisit ? import('./modules/pages/intro-animation.js') : null,
      import('./modules/pages/index-marquee.js'),
      import('./modules/animations/floating-items.js'),
      import('./modules/pages/index-yt-card.js'),
    ]).then(([intro, marquee, floating, yt]) => {
      if (!alive()) return;
      if (intro) intro.initIntroAnimation();
      marquee.initMarquee();
      floating.initFloatingItems();
      floating.initWatchHover();
      yt.initYTCard();
    });
  }

  // --- About Page ---
  if (page === 'about') {
    // Vision/Class/Works 文字先注入 DOM（about-data-loader），再跑互動 init —— 內容全在 hero 下方，晚一拍不影響觀感。
    // 資料 fetch 跟其他模組下載並行（不等全部 import 完才開抓）
    const contentReady = import('./modules/pages/about/about-data-loader.js').then(m => m.loadAboutContent());
    Promise.all([
      contentReady,
      import('./modules/pages/about/resources-cycling.js'),
      import('./modules/pages/about/brand-trail.js'),
      import('./modules/pages/about/timeline.js'),
      import('./modules/navigation/anchor-nav.js'),
      import('./modules/accordions/horizontal-accordion.js'),
      import('./modules/ui/bfa-division-toggle.js'),
      import('./modules/pages/about/floating-polygons.js'),
      import('./modules/pages/about/class-buttons-sticky.js'),
      import('./modules/pages/about/class-images-slideshow.js'),
      import('./modules/pages/about/about-structure.js'),
      import('./modules/ui/pause-offscreen-video.js'),
    ]).then(([, resources, brand, timeline, anchor, hAccordion, bfa, polys, sticky, classImgs, structure, pauseVid]) => {
      if (!alive()) return;
      resources.initResourcesCycling();
      brand.initBrandTrail();
      timeline.initTimeline();
      anchor.initAnchorNav({ reveal: true });
      hAccordion.initHorizontalAccordion();
      bfa.initBFADivisionToggle();
      polys.initAboutPolygons();
      sticky.initClassButtonsSticky();
      classImgs.initClassImagesSlideshow();
      structure.initProgramStructure();
      // works 影片離開視窗/換學制隱藏時自動暫停（YouTube iframe，src 已由 fillWorks 設定）
      pauseVid.pauseVideosOffscreen(document.querySelectorAll('.works-video-iframe'));
    });
  }

  // --- Degree Show Detail Page ---
  // degree-show list 已整合到 activities panel（loadDegreeShowListInto），舊獨立頁已刪
  if (page === 'degree-show-detail') {
    import('./modules/pages/degree-show-data-loader.js').then(m => { if (alive()) m.loadDegreeShowDetail(); });
  }

  // --- Admission Page ---
  if (page === 'admission') {
    // fromUserNav 傳入：首頁 floating camp 海報 deep-link（?section=summer-camp&item=）才跑導航動畫
    Promise.all([
      import('./modules/pages/admission-data-loader.js').then(m => m.loadAdmissionData()),
      import('./modules/pages/admission-section-switch.js'),
      import('./modules/ui/activities-search.js'),
    ]).then(([, sw, search]) => {
      if (!alive()) return;
      sw.initAdmissionSectionSwitch(fromUserNav, unlock);
      search.initActivitiesSearch();  // camp panel 共用 activities 的 search（input[data-panel="panel-summer-camp"]）
    });
  }

  // --- Faculty Pages ---
  if (page === 'faculty') {
    // deep-link：site map 的 ?section=fulltime/parttime/admin 從 SPA 點擊（fromUserNav）落在該分類 active
    const facultySection = fromUserNav ? searchParams.get('section') : null;
    Promise.all([
      import('./modules/pages/faculty-data-loader.js').then(m => m.loadFacultyData()),
      import('./modules/filters/faculty-filter.js'),
      import('./modules/pages/faculty-slide-in.js'),
    ]).then(([, filter, slideIn]) => {
      if (!alive()) return;
      filter.initFacultyFilter(facultySection, unlock);
      slideIn.initFacultySlideIn();
    });
  }

  // --- Curriculum Page（route/file 改名 curriculum；內部模組/CSS class 仍叫 courses-*）---
  if (page === 'curriculum') {
    import('./modules/pages/courses-section-switch.js').then(m => { if (alive()) m.initCoursesSectionSwitch(fromUserNav, unlock); });
  }

  // --- Activities Page ---
  if (page === 'activities') {
    Promise.all([
      import('./modules/pages/activities-section-switch.js'),
      import('./modules/ui/activities-search.js'),
    ]).then(([sw, search]) => {
      if (!alive()) return;
      sw.initActivitiesSectionSwitch('exhibitions', fromUserNav, unlock);
      search.initActivitiesSearch();
    });
    // ref 內 pdfUrl 觸發共用 PDF viewer（與 library / alumni 共用 sccd:open-pdf）
    // viewer：modal 單例 guard、重複 init 安全 → 不需 seq guard
    import('./modules/pages/library-viewer.js').then((m) => m.initPdfViewer());
  }


  // --- Atlas Page ---
  if (page === 'atlas') {
    // 渲染完成前擋 header mode btn（user 2026-08-10）：這裡「同步」上鎖才蓋得住
    // 「header async 到位 → atlas chunk 還在 lazy import」的空窗；解鎖在 atlas.js
    // revealFilters（intro 點燈完成）/ cleanup，離頁保險清除在 cleanupPageModules。
    document.body.classList.add('atlas-mode-gate');
    import('./modules/pages/atlas.js').then((m) => {
      atlasModule = m;
      // 下載期間使用者已換頁 → 放棄這次 init；initAtlas 內部還有 #atlas-main 缺席 early-return 雙保險
      if (alive()) m.initAtlas();
    });
  }

  // --- Alumni Page ---
  if (page === 'alumni') {
    import('./modules/pages/alumni.js').then(m => { if (alive()) m.initAlumni(); });
  }

  // --- Generate Page ---
  if (page === 'generate') {
    // generate-app 在主 window 跑 p5 instance（attach 到 #create-app），mode 由 sessionStorage 讀
    // initCreatePage 自身另有 stale-init guard（loadAllScripts await 期間切走）→ alive() 是外層第一道
    import('./modules/pages/create-app.js').then((m) => {
      createAppModule = m;
      if (alive()) m.initCreatePage();
    });

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
    Promise.all([
      import('./modules/pages/library-viewer.js'),
      import('./modules/pages/library-panels.js'),
      import('./modules/pages/library-card.js'),
    ]).then(([viewerMod, panelsMod, cardMod]) => {
    if (!alive()) return;   // 下載期間已換頁 → 頁面 DOM 已 swap，放棄 init
    viewerMod.initLibraryViewer();
    // 桌面：search 列（search／filter／date sort）收成灰卡右下角 icon 工具列（user 2026-09-29；樣式 library.css .lib-toolbar）。
    // 搬成 panel 直接子層：留在內容 grid 裡會被 grid 的進場 clip-path 裁掉（工具列定位在 grid 外的底部標題列）。
    // 必須在 initLibraryPanels 前搬＝它結尾的 hidePanelChildren 才會把工具列一起藏進 phase 1。手機／矮橫向維持原 DOM。
    if (SCCDHelpers.isDesktopLayout()) {
      document.querySelectorAll('[id^="lib-panel-"]').forEach(panel => {
        const row = panel.querySelector('[style*="align-items: flex-end"][style*="display: flex"]');
        if (!row) return;
        panel.classList.add('lib-desk-tools');
        row.classList.add('lib-toolbar');
        panel.appendChild(row);
        // 有字＝維持展開（library.css .has-value；取代 CSS :has(:placeholder-shown)——切 mode 時每次重算都要判、實測 28ms）。
        //   程式沒有直接改搜尋框值的地方，input 事件就涵蓋打字／刪字／貼上
        const input = /** @type {HTMLInputElement|null} */ (row.querySelector('input'));
        if (input) input.addEventListener('input', () => input.parentElement?.classList.toggle('has-value', input.value !== ''));
      });
      // filter 鈕：開關右側分類滑板（.lib-filter-open）＋ icon 換 default/active；點滑板以外（年份區除外）即關。
      // 選項 stagger 進退場（user 2026-10-04）：開＝滑板滑入、選項逐一由上往下 clip-reveal（同 library chrome 的 hide/play）；
      // 關＝選項逐一收回、收完滑板才滑出。動畫中（含進場未走完）不接受開關（鈕／點外面都擋）＝免半途反轉留殘態。
      const OPT_DELAY = 0.15, OPT_STAGGER = 0.05, OPT_STAGGER_OUT = 0.03;   // album 13 顆：收合 stagger 減半免拖
      const setFilterOpen = (/** @type {HTMLElement} */ panel, /** @type {boolean} */ open) => {
        if (panel.classList.contains('lib-filter-open') === open || panel.dataset.filterBusy) return;
        const btn = panel.querySelector('.lib-filter-btn');
        if (btn) {
          btn.setAttribute('aria-expanded', String(open));
          btn.querySelector('.icon').className = `icon ${open ? 'icon-filter-active' : 'icon-filter'}`;   // 直接換、不做 clip reveal（user 2026-10-01）
        }
        const opts = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('[id$="cat-filter"] button')]);
        if (prefersReducedMotion() || !opts.length) { panel.classList.toggle('lib-filter-open', open); return; }
        const setOpts = (/** @type {boolean} */ shown, /** @type {number} */ dur, /** @type {number} */ delay0, /** @type {string} */ ease, stagger = 0) => opts.forEach((el, i) => {
          const d = (delay0 + i * stagger).toFixed(2);
          el.style.transition = `clip-path ${dur}s ${ease} ${d}s, translate ${dur}s ${ease} ${d}s`;
          el.style.clipPath = shown ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)';
          el.style.translate = shown ? '0 0' : '0 -0.4rem';
        });
        const clearOpts = () => opts.forEach(el => { el.style.transition = ''; el.style.clipPath = ''; el.style.translate = ''; });
        const span = (/** @type {number} */ s) => (opts.length - 1) * s;
        panel.dataset.filterBusy = '1';
        // 起點先定成「完全顯示／完全隱藏」的 inset 值並 commit：clip-path 從 none（清過 inline）到 inset() 不能補間＝會直接跳
        setOpts(!open, 0, 0, 'linear');
        void panel.offsetHeight;
        if (open) {
          panel.classList.add('lib-filter-open');
          setOpts(true, DUR.medium, OPT_DELAY, 'ease-out', OPT_STAGGER);
          setTimeout(() => { clearOpts(); delete panel.dataset.filterBusy; }, (OPT_DELAY + span(OPT_STAGGER) + DUR.medium) * 1000 + 50);
        } else {
          setOpts(false, DUR.fast, 0, 'ease-in', OPT_STAGGER_OUT);
          setTimeout(() => {
            panel.classList.remove('lib-filter-open');   // 選項都收完才滑出；滑完才清 inline（早清＝滑出途中選項又現）
            setTimeout(() => { clearOpts(); delete panel.dataset.filterBusy; }, DUR.medium * 1000 + 50);
          }, (span(OPT_STAGGER_OUT) + DUR.fast) * 1000);
        }
      };
      document.querySelectorAll('.lib-filter-btn').forEach(btn => btn.addEventListener('click', () => {
        const panel = /** @type {HTMLElement} */ (btn.closest('[id^="lib-panel-"]'));
        setFilterOpen(panel, !panel.classList.contains('lib-filter-open'));
      }));
      const onOutsideFilter = (/** @type {PointerEvent} */ e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        document.querySelectorAll('.lib-filter-open').forEach(panel => {
          if (t.closest?.('[id$="cat-filter"], .lib-filter-btn, [id$="year-picker-wrap"]')) return;
          setFilterOpen(/** @type {HTMLElement} */ (panel), false);
        });
      };
      document.addEventListener('pointerdown', onOutsideFilter);
      registerPageCleanup(() => document.removeEventListener('pointerdown', onOutsideFilter));
    }
    const panels = panelsMod.initLibraryPanels();

    // refresh / 直接開 / 上一頁下一頁（fromUserNav=false）若帶 item 級 deep-link hash（award/album/document/press）
    // → 清掉 hash 回 default panel（awards）、不導航到該項目（對齊 activities/curriculum：refresh = 直接點進來的 default 樣子，user 2026-06-04）。
    // 清掉後 resolveInitialTabFromHash 回 awards、handleHash 讀到空 hash 自動 no-op。
    // 純 tab hash（#press 等使用者瀏覽時持久化的分頁狀態）保留不清。
    if (!fromUserNav && panelsMod.isItemDeepLinkHash()) {
      history.replaceState(history.state, '', window.location.pathname);
    }

    // deep-link 進場時直接以 hash 推測的目標 panel 為 gray 中心，
    // 不要先進 awards 再 switchPanel（會看到 awards 一閃即逝）。
    // resolveInitialTabFromHash 看 hash 前綴（如 #f-* → files），無 hash 則 awards。
    const initialTab = panelsMod.resolveInitialTabFromHash();

    // 手機版：跳過 card stack 幾何計算（randomize x/y 容易超出 viewport → 水平位移），
    // 改用頂端 tab bar 直接 panels.showPanel；layout 由 CSS 處理
    // tab bar 沿用 activities-section-bar pattern → 走 setActiveNavBtn 提供 active 隨機色 + 旋轉
    // 矮橫向（橫向手機）也走此路徑（user 2026-07-04）：landscape.css 5h 把 tabs 排左欄、灰卡佔右側
    if (SCCDHelpers.isMobileLayout()) {
      const tabsRoot = document.getElementById('library-mobile-tabs');

      // 手機進場（user 2026-06-12：原本 showPanel+onEntranceDone 同步跑完＝完全沒進場動畫）：
      // 整個 section 4 方向 clip wipe（對齊桌面灰卡 clip 語彙；#library-card-main 自身的
      // clip/transform/opacity 被 v5 mobile CSS !important 鎖死 → 裁外層 section 等效）
      // → tab 鈕 hero 式 clip-reveal（同 activities section nav，translate＋同步 clip 滑動）→ panel chip/內容 wipe（playPanelReveal）
      // → 完成才 onEntranceDone + handleHash（deep-link 等進場完才捲，對齊桌面 onEntranceDone 時序）
      const librarySection = /** @type {HTMLElement | null} */ (document.querySelector('main#page-content > section'));
      const tabInners = /** @type {HTMLElement[]} */ (tabsRoot ? [...tabsRoot.querySelectorAll('.anchor-nav-inner')] : []);
      const LIB_CLIPS = ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 100% 0% 0%)'];
      const pickLibClip = () => LIB_CLIPS[Math.floor(Math.random() * LIB_CLIPS.length)];
      // tab 鈕：每顆固定一個隨機方向（2026-07-17 全站四方向隨機），進場 set 與離頁 exit 共用同一份
      const tabDir = new Map(tabInners.map(inner => [inner, pickNavDir(inner)]));
      const finishLibEntrance = () => {
        panels.showPanel(initialTab, { reveal: true }); // playPanelReveal：panel 內容 clip-reveal 進場
        panels.onEntranceDone();
        panels.handleHash(unlock);
      };
      if (typeof gsap !== 'undefined' && librarySection) {
        // ⚠️ section / 灰卡「整體」一律不做進場動畫（clip-path 或 opacity 都會把 section 升 GPU 合成層）：
        // 從 menu 點 library＝closeMenu()+navigateTo() 並行，.mobile-nav（fixed inset-0 全屏 overlay）滑出時
        // 占住合成層、遮住 section → overlay 離場後 section 的舊合成圖層殘影露出＝灰卡 mt gap 一條灰帶；
        // clip→opacity 都中、收尾強制重繪被「被遮區不重繪」跳過救不回；refresh 無 overlay 故沒事（user 2026-06-24 多輪）。
        // 進場感全交給「卡片內的小元素」：tab inners + panel children clip-reveal（playPanelReveal）—— 不升 section 合成層。
        tabInners.forEach(inner => { inner.style.transition = 'none'; gsap.set(inner, navChipHidden(inner, tabDir.get(inner))); });
        if (tabInners.length) {
          gsap.to(tabInners, {
            ...NAV_CHIP_SHOWN, duration: DUR.base, ease: EASE.enter, stagger: 0.02, clearProps: 'clipPath,translate',
            onComplete: () => tabInners.forEach(inner => { inner.style.transition = ''; }),
          });
        }
        finishLibEntrance();
      } else {
        finishLibEntrance();
      }

      // 手機離頁退場（進場 wipe 的鏡像；桌面退場在 initLibraryCard 的 playExitAnimation，手機不跑那段 →
      // 沒有這裡的話手機點 logo 離開 library 整頁瞬間消失、無退場）：tab 鈕 clip 反向收 + 整個 section wipe 收。
      // fromTo 顯式 inset(0) 起點：進場 clearProps 後 computed=none 無法補間（見 clippath-exit-after-clearprops memory）。
      registerPageExit(() => new Promise(resolve => {
        if (typeof gsap === 'undefined' || !librarySection) { resolve(); return; }
        const exitTl = gsap.timeline({ onComplete: resolve });
        if (tabInners.length) {
          tabInners.forEach(inner => { inner.style.transition = 'none'; });
          gsap.killTweensOf(tabInners);
          const hid = tabInners.map(inner => navChipHidden(inner, tabDir.get(inner)));
          exitTl.fromTo(tabInners, { ...NAV_CHIP_SHOWN },
            { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: EASE.exit, stagger: { each: 0.02, from: 'end' }, overwrite: true }, 0);
        }
        gsap.killTweensOf(librarySection);
        exitTl.fromTo(librarySection, { clipPath: 'inset(0% 0% 0% 0%)' },
          { clipPath: pickLibClip(), duration: DUR.base, ease: EASE.exit, overwrite: true }, 0);
      }));

      // press/files/album panel 桌面結構是 2×2 grid：Year 標題在 top-left、year-picker 在 bottom-left（兩個獨立 grandchildren）
      // 手機要求「Year 標題跟 year-picker 是同一個 group」對齊 awards panel 樣式
      // → DOM 搬：把 year-picker-wrap 整個搬到 Year 標題 wrapper 內當子，這樣 Year 標題 wrapper 變 group container
      // ⚠️ 只在真手機（<768）搬：矮橫向 panel 內部維持桌面 2×2 grid，搬了會讓 grid auto-place 錯位
      if (window.innerWidth < 768)
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
      bindNavBtnSpin(tabBtns);   // 初始隨機角（此路徑只在手機/矮橫向：無 hover、click 由 setActiveNavBtn 現抽）
      setActiveNavBtn(tabBtns, initialTab, 'data-tab');

      // 切 tab 出場動畫（user 2026-09-10「灰卡內容要跟桌面一樣做出場」）：沿用桌面 _doSwitchTab 同款
      // playPanelBodyExit（chrome 即刻藏＋視窗內 rows 全同時收合下沉），出場窗（同桌面 CONTENT_EXIT 0.5s）
      // 走完才 swap＋reveal。連點＝序號作廢 latest-wins；出場只起跑一次（舊 panel 出場中重跑會閃回起點）；
      // 殘值由 playPanelReveal 開頭統一清（§38），下次開該 panel 自復原。
      const LIB_TAB_EXIT = 0.5;
      const LIB_PANEL_IDS = ['lib-panel-awards', 'lib-panel-press', 'lib-panel-files', 'lib-panel-album'];
      let libTabSeq = 0;
      let libTabCur = initialTab;
      let libTabExiting = false;
      tabsRoot?.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const btn = target.closest('.activities-section-btn');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        if (!tab || tab === libTabCur) return;
        libTabCur = tab;
        const mySeq = ++libTabSeq;
        setActiveNavBtn(tabBtns, tab, 'data-tab');
        const currentHash = window.location.hash.slice(1);
        if (currentHash !== tab) {
          history.replaceState(null, '', window.location.pathname + '#' + tab);
        }
        const doSwap = () => {
          libTabExiting = false;
          panels.showPanel(tab, { reveal: true });
          // 切 tab 後 scroll 回頁面頂讓 user 從 search bar 看起
          window.scrollTo({ top: 0, behavior: 'instant' });
        };
        if (prefersReducedMotion()) { doSwap(); return; }
        if (!libTabExiting) {
          libTabExiting = true;
          const oldPanel = LIB_PANEL_IDS.map(id => document.getElementById(id))
            .find(p => p && getComputedStyle(p).display !== 'none');
          if (oldPanel) panelsMod.playPanelBodyExit(oldPanel, LIB_TAB_EXIT);
        }
        setTimeout(() => { if (mySeq === libTabSeq) doSwap(); }, LIB_TAB_EXIT * 1000);
      });
      return;
    }

    // 桌面 deep-link：四 panel「首次」渲染延到進場動畫完成才 commit——pre-swap 成可見的目標 panel
    // 資料到手就 render＝433ms 級 longtask 落在色塊 clip-reveal 窗口內、動畫掉幀成「直接出現」
    // （user 2026-09-11）。refresh/直開的 item hash 已在上面清掉 → 這裡自然不 arm、行為不變。
    if (panelsMod.isItemDeepLinkHash()) panelsMod.deferFirstRenderUntilEntrance();

    if (initialTab !== 'awards') {
      // 預先 swap panel display，讓 content 層 fade-in 時看到的就是目標 panel
      // reveal:false → 只切 display 不跑 wipe；等 grayEl 進場揭露完 onTabSwitch 才 reveal
      panels.showPanel(initialTab, { reveal: false });
    }

    // 進場動畫期間的第一次 onTabSwitch 是自動觸發的（預設 tab），不能覆蓋 deep-link hash
    // 只有 onEntranceDone 後的 tab 切換才是使用者手動點擊
    let entranceDone = false;
    cardMod.initLibraryCard({
      initialTab,
      // onTabSwitchPre pre-swap 已退役（§37 req3）：切換的 panel swap 全在 onTabSwitch instant（滑板下渲染），
      // 提早 swap 反而落在 morph 起跑幀＝可見重排跳動。
      onTabSwitch: (tab, opts) => {
        // deep-link 首渲染閘 pending（entrance 那次自動切換）→ 先不 reveal：panel 還空、wipe 白播；
        // 等 render commit 後由 maybeRevealDeferredPanel 補整組帶位移 clip-reveal（user 2026-09-11）
        const deferReveal = !entranceDone && panelsMod.isFirstRenderDeferred();
        panels.showPanel(tab, deferReveal ? { reveal: false } : opts);   // 分頁切換帶 {instant:true}（veil 下直接渲染）；進場不帶＝照舊 wipe
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
        panels.handleHash(unlock);
        entranceDone = true;
      },
    });
    });  // end library 三模組動態載入 .then
  }

  // --- Legal Pages（2026-09-09 全改 admission 那套 zebra 手風琴，見 legal-data-loader）---
  // Regulations & Policy：後台 regulations 一筆＝學系規章表格＋政策列（隱私權等）
  // 網站導覽（sitemap）：無障礙聲明（accessibility_statement）+ 網站地圖（data/accessibility.json）
  const legalLoader = { regulations: 'loadRegAndPolicy', support: 'loadSupport', sitemap: 'loadSitemap' }[page];
  if (legalLoader) {
    import('./modules/pages/legal-data-loader.js').then(m => { if (alive()) m[legalLoader](); });
  }

  // --- 404 Page ---
  if (page === '404') {
    import('./modules/pages/error-404.js').then(m => { errorModule = m; if (alive()) m.init404(); });
  }
}

// ── 首次載入（DOMContentLoaded）────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // 無障礙：reduce 模式下先裝全域 GSAP 開關（所有有限 tween 瞬間完成），必須在任何動畫 init 之前。
  installReducedMotionGsap();

  // Global Modules（只執行一次）
  initHeader();
  initThemeToggle();
  initFooter();
  initSiteAssets();          // 從後台 site_icons/site_cursors 覆蓋全站圖示與游標（失敗＝本地檔 fallback）
  initSmoothScroll();
  initIdleStandby();
  initCustomScrollbar();
  initShareModal();
  initModeColorPanel();      // mode3 背景色編輯浮動面板（右下鉛筆 → 展開色環）
  initOrientationReload();   // 手機轉向跨 landscape gate 自動 reload（/create 例外），免手動刷新

  // Lottie 切回分頁不跳角度（09-25 報、10-03 重修）：lottie-web 以 rAF 間的真實時間差推進、沒有 GSAP 的
  // lagSmoothing → 切回首幀把整段隱藏時長一次推進（對 loop 取模）＝旋轉 logo 相位瞬跳。
  // ⚠️ 舊解 lottie.freeze()/unfreeze() 實機無效：freeze 只立旗標、要 rAF 回呼才讀得到，但分頁隱藏後 rAF 一幀都不跑
  //    → 時鐘從沒停、unfreeze 也不重置（headless 假 hidden 時 rAF 照跑＝假通過）。
  // 現解：隱藏時 pause 正在播的（立即退出 playing 計數）；切回隔一幀才 play——lottie 排隊中的那幀先跑（paused 不推進）
  //    並自己停鐘，play 再重啟＝重置基準時鐘、從離開那格續播。只 play 隱藏前在播的＝不喚醒 lottie-visibility 停在畫面外的。
  // document 級一次性、蓋 header/footer/intro 全部 Lottie 實例；typeof 在事件當下判＝CDN defer 晚載也安全。
  /** @type {any[]} */
  let lottieHeld = [];
  document.addEventListener('visibilitychange', () => {
    if (typeof lottie === 'undefined') return;
    if (document.hidden) {
      lottieHeld = lottie.getRegisteredAnimations().filter((/** @type {any} */ a) => !a.isPaused);
      lottieHeld.forEach(a => a.pause());
      return;
    }
    const held = lottieHeld;
    lottieHeld = [];
    requestAnimationFrame(() => {
      const live = lottie.getRegisteredAnimations();   // 期間被 destroy 的（mode 切換重載）不碰
      held.forEach(a => { if (live.includes(a)) a.play(); });
    });
  });

  // 全站禁右鍵下載 img / svg / video（嚇阻隨手「另存」；對齊 PDF viewer 的 contextmenu 防護）
  // document 級單一 listener：涵蓋 SPA 換頁後動態載入的圖／影片，免每頁重綁。
  // ⚠️ 只嚇阻隨手下載；拿到原始 /assets 網址仍可直接存原檔（要檔案級保護得後臺處理）。
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest('img, svg, video, picture')) e.preventDefault();
  });

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
    revealHeaderWhenReady();
  }
  // 非 index 的初始路由由 initRouter() 內部處理
});
