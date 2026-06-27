/**
 * SPA Router
 * 攔截內部連結、替換 <main> 內容、管理 History API
 */

import { initPageModules, cleanupPageModules } from './main-modular.js';
import { updateNavActive } from './header.js';
import { runPageExit } from './modules/ui/page-exit.js';
import { initFooter } from './footer.js';
import { playFooterExit, resetFooterAfterExit } from './modules/ui/footer-draggable.js';
import { SITE_BASE, SITE_BASE_PATHNAME, sitePath } from './modules/ui/site-base.js';

// ── 路由表 ────────────────────────────────────────────────────
const routes = {
  '/':                        { page: 'index',                   htmlFile: 'index.html' },
  '/index.html':              { page: 'index',                   htmlFile: 'index.html' },
  '/about':                   { page: 'about',                   htmlFile: 'pages/about.html' },
  '/about.html':              { page: 'about',                   htmlFile: 'pages/about.html' },
  '/faculty':                 { page: 'faculty',                 htmlFile: 'pages/faculty.html' },
  '/faculty.html':            { page: 'faculty',                 htmlFile: 'pages/faculty.html' },
  '/curriculum':              { page: 'curriculum',              htmlFile: 'pages/curriculum.html' },
  '/curriculum.html':         { page: 'curriculum',              htmlFile: 'pages/curriculum.html' },
  '/activities':              { page: 'activities',              htmlFile: 'pages/activities.html' },
  '/activities.html':         { page: 'activities',              htmlFile: 'pages/activities.html' },
  '/admission':               { page: 'admission',               htmlFile: 'pages/admission.html' },
  '/admission.html':          { page: 'admission',               htmlFile: 'pages/admission.html' },
  '/degree-show-detail':      { page: 'degree-show-detail',      htmlFile: 'pages/degree-show-detail.html' },
  '/degree-show-detail.html': { page: 'degree-show-detail',      htmlFile: 'pages/degree-show-detail.html' },
  '/support':                 { page: 'support',                 htmlFile: 'pages/support.html' },
  '/support.html':            { page: 'support',                 htmlFile: 'pages/support.html' },
  '/alumni':                  { page: 'alumni',                  htmlFile: 'pages/alumni.html' },
  '/alumni.html':             { page: 'alumni',                  htmlFile: 'pages/alumni.html' },
  '/library':                 { page: 'library',                 htmlFile: 'pages/library.html' },
  '/library.html':            { page: 'library',                 htmlFile: 'pages/library.html' },
  '/atlas':                   { page: 'atlas',                   htmlFile: 'pages/atlas.html' },
  '/atlas.html':              { page: 'atlas',                   htmlFile: 'pages/atlas.html' },
  '/create':                  { page: 'generate',                htmlFile: 'pages/create.html' },
  '/create.html':             { page: 'generate',                htmlFile: 'pages/create.html' },
  '/regulations':             { page: 'regulations',             htmlFile: 'pages/regulations.html' },
  '/regulations.html':        { page: 'regulations',             htmlFile: 'pages/regulations.html' },
  '/policy-and-statements':      { page: 'policy-and-statements', htmlFile: 'pages/policy-and-statements.html' },
  '/policy-and-statements.html': { page: 'policy-and-statements', htmlFile: 'pages/policy-and-statements.html' },
  '/404':                     { page: '404',                     htmlFile: 'pages/404.html' },
  '/404.html':                { page: '404',                     htmlFile: 'pages/404.html' },
};

const NOT_FOUND_ROUTE = routes['/404'];

// ── 頁面專屬 CSS 動態載入 ────────────────────────────────────
const PAGE_CSS = {
  library: 'css/components/library.css',
  atlas: 'css/components/atlas.css',
  generate: 'css/components/create.css',
  alumni: 'css/components/alumni.css',
};

// 載入新頁專屬 CSS 並回傳「parse 完成」的 Promise（無專屬 CSS / 已載入則立即 resolve）。
// ⚠️ 必須在 swap HTML **之前** await：create/library/alumni 的 CSS 沒編進 output.css（只有 atlas 有
// input.css @import），純靠這裡動態載入。動態插入的 <link> 不會阻塞首次 paint → 若 swap 後才 append，
// 瀏覽器會先用 output.css 畫一次「無版面」的頁面再等 CSS 到才 snap = 換頁閃爍（FOUC）。
// 先 await CSS ready 再 swap，畫出來就是完整樣式，過場 smooth。
function ensurePageCSS(page) {
  const href = PAGE_CSS[page];
  if (!href) return Promise.resolve();
  // 使用站台根為基底的絕對路徑，避免 pushState 影響（子路徑部署時 origin 不等於站台根）
  const absHref = new URL(href, SITE_BASE).href;
  const existing = /** @type {HTMLLinkElement | null} */ (document.querySelector(`link[href="${absHref}"]`));
  if (existing) {
    // 已在 DOM：sheet 可存取 = 已 parse 完成，直接 resolve；還在載入則等它 load
    if (existing.sheet) return Promise.resolve();
    return new Promise(resolve => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
  }
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = absHref;
    link.dataset.pageCss = page;
    // load / error 都 resolve：CSS 404 也不能讓換頁卡死等不到
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

// 移除「非當前頁」的頁面專屬 CSS（swap HTML 後跑，保留剛 await 完的新頁 CSS）。要同時涵蓋兩種來源：
//   1. 上次切頁時 ensurePageCSS 動態插入的（有 data-page-css attr）
//   2. 直接 refresh 內頁時 pages/X.html `<head>` 內 inline 寫死的 `<link href="../css/components/X.css">`
//      → 沒 data-page-css attr，但 href 一定命中 PAGE_CSS values
//   若只 query `[data-page-css]` 會漏 case 2，導致 refresh /create 後切回 index 時
//   create.css 永久殘留（user 2026-05-31 反饋 index 看不到 mode-btn-mobile，因 create.css
//   `#mode-btn-mobile { display:none !important }` 全頁繼續 cascade）
function removeStalePageCSS(keepPage) {
  const keepHref = PAGE_CSS[keepPage]
    ? new URL(PAGE_CSS[keepPage], SITE_BASE).href
    : null;
  const pageCssBasenames = Object.values(PAGE_CSS).map(h => h.split('/').pop());
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const link = /** @type {HTMLLinkElement} */ (el);
    if (keepHref && link.href === keepHref) return; // 保留剛 await 載入的新頁 CSS
    if (link.dataset.pageCss) {
      link.remove();
      return;
    }
    // inline link：用 basename 比對避免 ../css/ vs /css/ 寫法差異
    const linkBasename = link.href.split('/').pop();
    if (linkBasename && pageCssBasenames.includes(linkBasename)) {
      link.remove();
    }
  });
}

// ── 路徑解析 ──────────────────────────────────────────────────
// 路由表 key 是「站台根相對」的邏輯路徑（/about.html）；部署在子路徑時實際 pathname
// 會帶前綴（/SCCD-Website/about.html），比對前先剝掉
function stripBase(pathname) {
  if (SITE_BASE_PATHNAME !== '/' && pathname.startsWith(SITE_BASE_PATHNAME)) {
    return '/' + pathname.slice(SITE_BASE_PATHNAME.length);
  }
  return pathname;
}

function resolveRoute(pathname) {
  // 移除 /pages/ 前綴（如果從 pages/ 子目錄點擊連結）
  const normalized = stripBase(pathname).replace(/^\/pages\//, '/').replace(/\/$/, '') || '/';
  return routes[normalized] || null;
}

// ── Prefetch on intent（hover / touchstart）──────────────────────
// 業界標準（Next.js <Link prefetch> / Remix loader / instant.page）：使用者一表現出導航意圖
// （桌面 hover、手機 touchstart 先於 click ~100ms+）就先抓該頁的 async 資料，讓 Directus fetch 跟
// 「hover→click / tap」手勢 + 換頁過場重疊，到頁面 init 呼叫同個 loader 時資料多半已 in-flight/cache。
// 只列「卡片要等 async 資料」的頁面；資料源 single-flight 去重，prefetch 與 init 的並發呼叫只打一次。
const ROUTE_PREFETCHERS = {
  curriculum: () => import('./modules/pages/courses-source.js').then(m => m.loadCourses()).catch(() => {}),
  // faculty：除了資料，資料一到也 warm 老師照片快取（進頁時 <img> 直接命中＝不再灰底再跳出照片）
  faculty: () => import('./modules/pages/faculty-source.js').then(m => m.getFacultyData().then(d => m.preloadFacultyImages(d))).catch(() => {}),
};
const _prefetched = new Set();
function prefetchFromLink(link) {
  const href = link.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#') ||
      href.startsWith('mailto:') || href.startsWith('tel:')) return;
  const route = resolveRoute(new URL(href, window.location.origin).pathname);
  if (!route || _prefetched.has(route.page) || !ROUTE_PREFETCHERS[route.page]) return;
  _prefetched.add(route.page);
  ROUTE_PREFETCHERS[route.page]();
}

// ── Scroll 重置工具 ──────────────────────────────────────────
function scrollToTop() {
  window.scrollTo(0, 0);
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

// ── 無障礙：SPA 換頁焦點 + 報讀（WCAG 2.4.3 焦點順序 / 4.1.3 狀態訊息）──
// JS swap 不像整頁載入會移動焦點、報讀新頁 → 螢幕閱讀器使用者不知換了頁、焦點還卡在剛點的連結。
// 點連結換頁後把焦點移到主內容（main tabindex=-1），並用常駐 aria-live region 報讀新頁標題。
// announcer 用 JS 建一次（各頁 HTML body 不一定有；只 swap #page-content，body 級元素跨換頁恆在）。
// 在 initRouter 就預建 → SR 先觀察到 region，第一次換頁的文字更新才會被念出。
function getRouteAnnouncer() {
  let region = document.getElementById('sr-route-announcer');
  if (!region) {
    region = document.createElement('div');
    region.id = 'sr-route-announcer';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  return region;
}
function announceAndFocusMain(main) {
  getRouteAnnouncer().textContent = document.title || '';
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true }); // preventScroll：交給 router 自己的捲動邏輯，不打架
}

// ── 內容替換 ──────────────────────────────────────────────────
// 全域 nav sequence：每次 loadPage 取一個 unique 號碼，await 後檢查是否已被更新的 nav 蓋過
// → 解決 race：A(去 /about, exit anim 0.85s) 中途 B(回 /create, exit handler 已 null fetch 50ms)
//   若無 guard，B 先完成 swap+init 後 A 再完成又 swap 走 → user 點 /create 卻被 A 拉去 /about
//   且 /create 的 p5 typewriter 被 A 的 cleanup 殺掉 → placeholder 消失
let navSeq = 0;

// fromUserNav：true=使用者點連結的 SPA 導航（navigateTo）；false=初始載入 / refresh / popstate。
// 往下傳到 initPageModules → curriculum deep-link 用它判斷要不要播「自動捲到 section + 開 slide-in」。
async function loadPage(route, search = '', fromUserNav = false) {
  const main = document.getElementById('page-content');
  if (!main) return;

  const mySeq = ++navSeq;
  // 內部 helper：在每個 await 後檢查是否還是最新 nav，不是就 abort
  const isStale = () => mySeq !== navSeq;

  try {
    // 使用站台根為基底解析絕對路徑，避免 pushState 改變 baseURI 後的相對路徑錯亂
    const fetchUrl = sitePath(route.htmlFile);

    // 退場動畫（當前頁有 register 才會跑）跟 fetch 並行：anim ~0.7s + fetch 通常更快，
    // 兩者平行省 0.3-0.5s 過場時間；await 兩個都完成才繼續 cleanup + DOM 替換。
    // playFooterExit：footer 在視窗內（點 footer 連結離頁）才跑，items 散出；不在畫面則 no-op（user 2026-06-07）。
    const [_exit, _fexit, res] = await Promise.all([runPageExit(route), playFooterExit(), fetch(fetchUrl)]);
    if (isStale()) return; // 中途有新 nav，放棄這次（不 cleanup 不 swap，讓新 nav 接手）
    void _exit; void _fexit;
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();
    if (isStale()) return;

    // 解析出 <main> 內容
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);

    // 同步分頁標題（沿用該頁靜態 <title>；degree-show-detail 等之後在 initPageModules 內可再覆蓋更精確標題）
    const newTitle = doc.querySelector('title')?.textContent;
    if (newTitle) document.title = newTitle;

    // 先把新頁專屬 CSS 載好再 cleanup + swap，避免無樣式 paint 閃爍（FOUC）。
    // create/library/alumni 的 CSS 只靠動態載入（沒編進 output.css），swap 後才 append 會先畫一次無版面版本。
    // 此 await 期間舊頁仍帶自己的 CSS 正常顯示（removeStalePageCSS 在 swap 後才移除舊頁 CSS）。
    await ensurePageCSS(route.page);
    if (isStale()) return;

    // Cleanup 上一頁；帶 destPage 讓 cleanup 知道是否是 same-page reentry（決定要不要 restoreHeaderLogo）
    cleanupPageModules(route.page);

    // 先捲到頂部，避免替換後舊 scrollY 超過新頁高度被鎖在 footer
    scrollToTop();

    // 替換內容
    main.innerHTML = newMain.innerHTML;
    main.className = newMain.className || '';
    main.removeAttribute('style');
    if (newMain.getAttribute('style')) {
      main.setAttribute('style', newMain.getAttribute('style'));
    }

    // 替換後再捲一次，保險覆蓋 reflow / scroll anchor 造成的位移
    requestAnimationFrame(() => scrollToTop());

    // 移除舊頁專屬 CSS（新頁 CSS 已在 swap 前 ensurePageCSS 載好並保留）
    removeStalePageCSS(route.page);

    // 更新 nav active state
    updateNavActive(route.page);

    // generate / library / atlas 頁不顯示 footer（404 顯示，使用者可 scroll 看到）
    const footerEl = document.getElementById('site-footer') || document.getElementById('site-footer-static');
    if (footerEl) {
      const shouldHide = route.page === 'generate' || route.page === 'library' || route.page === 'atlas';
      footerEl.style.display = shouldHide ? 'none' : '';
      // first-load /create 時 initFooter fetch 跟 router.loadPage fetch race，若 router 先設 display:none
      // 才回，footer html 寫進隱藏容器 → Lottie 載 0×0 + footerScatter waitForLayoutReady 60 frames 全 0 abort →
      // items 卡 opacity:0、無 .footer-anchor。換頁要露 footer 時用 .footer-anchor 缺失當「broken init」proxy 重跑 initFooter。
      // 只限 SPA 容器（#site-footer）；index.html 的 #site-footer-static 不會撞 display:none race。
      // 手機 footer 不建 .footer-anchor（改走 clip-reveal）→ 多檢查 [data-footer-mobile-init] 旗標，
      // 否則手機每次換頁都把這個 proxy 當「broken init」重抓 footer.html 重建（打斷 clip-reveal ctx）。
      if (!shouldHide && footerEl.id === 'site-footer'
          && !footerEl.querySelector('.footer-anchor')
          && !footerEl.querySelector('[data-footer-mobile-init]')) {
        initFooter();
      }
    }

    // footer 若在離頁時跑了退場（playFooterExit），此時已 scrollToTop、footer 捲離視窗 → 重新散佈進場復位
    //（不被看到，純把 items 從隱藏狀態還原 + 重啟 shuffle）。沒退場 / footer 隱藏頁則 no-op。
    resetFooterAfterExit();

    // 更新 body class（generate / atlas / library 鎖頁面 scroll，滿版單屏）
    // library 必須走 class 不能靠 HTML inline style="overflow:hidden"：
    //   1) SPA 導航時 body inline 不會替換（只替換 #page-content）→ library.html 的 inline 永遠不生效
    //   2) lightbox-shell exitLightboxMode 會 `body.style.overflow=''`，會把 inline 的 overflow 清掉
    // 用 class 兩個 case 都不受影響
    document.body.classList.toggle('overflow-hidden', route.page === 'generate' || route.page === 'atlas' || route.page === 'library');
    // 桌面 section 磁吸模式（原生 CSS scroll-snap，掛在 <html>）：除鎖頁(generate/atlas/library)、404 外都掛
    // snap-mandatory 強吸（user 2026-06-27 全站改 mandatory）；實際 snap 點由各頁 .snap-zone 決定（沒標的頁等於不吸）。
    // 無 hero 的純文字頁 (support/regulations/policy) 只標 footer 一個 .snap-zone。
    // ⚠️ mandatory 會困住「比視窗高的 section」（about resources/history、faculty 卡片多時讀不到中段）；
    //    某頁要放鬆＝那頁改掛 snap-proximity。規則在 css/layout/scroll-snap.css。
    const noSnap = ['generate', 'atlas', 'library', '404'].includes(route.page);
    document.documentElement.classList.toggle('snap-mandatory', !noSnap);
    // about + alumni 用寬封鎖綫（section-title-strip width:calc(50vw+) 會 overflow viewport 右側）
    // faculty 手機 hero banner width:108vw + rotate(-5°) 兩側溢出 viewport
    // activities 手機 .activities-section-bar negative margin 延伸到 viewport 邊 + active list-item
    //   gallery thumbnail / list-content 某些情況可能溢出 → x 軸偶爾可滑（user 反饋 2026-05-26）
    // 用 overflow-x: clip 而非 hidden：
    // - hidden 會讓 html/body 變 scroll container（另一軸隱含 auto），頁面 > viewport 時 body 自己成為
    //   實際 scroller，子孫 position:sticky 找錯 scrolling ancestor → sticky 失效
    //   （2026-06-01 user 反饋 faculty 加 footer 後左 nav 不 sticky 的 root cause；diagnoseSticky 證實）
    // - clip（CSS Overflow L3）只裁切橫向溢出，不建立 scroll container，sticky 仍對 viewport 釘
    // - iOS Safari position:fixed header 不 fix 的舊問題：clip 同樣防止 body 搶 scroll container 角色
    // 瀏覽器支援：Chrome 90+ / Safari 16+ / Firefox 81+
    // degree-show-detail：子展覽 gallery 全寬 6-slot（~105vw）+ hero banner 兩側溢出 → 不 clip 整頁可橫向 pan
    const needsClipX = route.page === 'about' || route.page === 'alumni' || route.page === 'faculty' || route.page === 'activities' || route.page === 'degree-show-detail';
    document.documentElement.style.overflowX = needsClipX ? 'clip' : '';
    document.body.style.overflowX = needsClipX ? 'clip' : '';

    // 初始化新頁面模組（帶 query string 供 detail 頁用 + fromUserNav 供 deep-link 判斷）
    const sp = new URLSearchParams(search);
    initPageModules(route.page, sp, fromUserNav);

    // async 資料載入完成後頁面高度會變，再 scroll 一次保險。
    // 例外：deep-link 導航（fromUserNav + ?item/section/program）由目標頁模組自己捲到指定卡片/段落，
    // 不能被這個保險 reset 拉回頂部。尤其 reduce 模式 hero 進場是瞬間 → deep-link 捲動在 ~tens ms 內跑完、
    // 早於 100ms reset → 會被蓋掉「停在頂部」（正常模式靠 hero ~1s 延遲剛好錯開、不中招）。
    const isDeepLinkNav = fromUserNav && (sp.has('item') || sp.has('section') || sp.has('program'));
    if (!isDeepLinkNav) {
      setTimeout(() => scrollToTop(), 0);
      setTimeout(() => scrollToTop(), 100);
    }

    // 無障礙：使用者點連結換頁才移焦點 + 報讀（初始載入 / refresh / popstate 由瀏覽器處理，不搶焦點）
    if (fromUserNav) announceAndFocusMain(main);

    // 刷新 ScrollTrigger，確保新內容載入、高度改變後，觸發位置能正確更新
    if (typeof ScrollTrigger !== 'undefined') {
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }

  } catch (err) {
    console.error('[Router] Page load error:', err);
    // 載入失敗且不是在載入 404 本身 → 嘗試載入 404 頁
    if (route.page !== '404' && NOT_FOUND_ROUTE) {
      loadPage(NOT_FOUND_ROUTE, search);
    }
  }
}

// ── 導航 ──────────────────────────────────────────────────────
// 回傳 loadPage promise，方便 caller（如 idle-standby fade transition）等待頁面替換完成
export function navigateTo(url) {
  const { pathname, search, hash } = new URL(url, window.location.origin);
  const route = resolveRoute(pathname) || NOT_FOUND_ROUTE;

  // pushState 用「真實檔案路徑」(/pages/X.html or /index.html)，不用乾淨 URL：
  // 開發 server (Live Server) 沒 SPA fallback，乾淨 URL (/support) refresh 會 404；
  // push 真實檔案路徑 → 任何時候 refresh 都能找到實體 HTML，server 直接回檔案。
  // 子路徑部署時要帶站台根前綴（/SCCD-Website/pages/X.html），否則 refresh 回網域根 404
  const realPath = route.htmlFile === 'index.html'
    ? SITE_BASE_PATHNAME
    : SITE_BASE_PATHNAME + route.htmlFile;

  // 保留 hash 供 deep link 使用（如 library.html#a-2024-01）
  window.history.pushState({ page: route.page }, '', realPath + search + hash);
  // fromUserNav=true：使用者主動點連結才會走這（refresh / popstate / 初始載入不經此）→ 准許 deep-link 導航動畫
  return loadPage(route, search, true);
}

// ── 事件綁定 ──────────────────────────────────────────────────
export function initRouter() {
  // 停用瀏覽器自動恢復 scroll（由 SPA 自行控制）
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // 無障礙：startup 就建好換頁報讀 region（見 getRouteAnnouncer）
  getRouteAnnouncer();

  // 攔截所有內部連結點擊
  document.addEventListener('click', (e) => {
    const target = /** @type {Element | null} */ (e.target);
    const link = target?.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // slide-in / lightbox 開著時，#site-header 內的連結（左上角 logo 浮在 modal 之上仍可點）一律不可點：
    // 吞掉 click 不導航，user 要先關閉面板才能離開（user 2026-06-07）。body.lightbox-open 由 enterLightboxMode 設，
    // courses / faculty slide-in 與所有 lightbox 共用 → 一條涵蓋全部。不 stopPropagation：overlay 關閉 handler 用
    // e.target.id==='courses-overlay' 比對，target 是 logo ≠ overlay 本來就不會誤觸發關閉。
    if (document.body.classList.contains('lightbox-open') && link.closest('#site-header')) {
      e.preventDefault();
      return;
    }

    // 忽略：外部連結、錨點、target="_blank"、download
    if (
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      link.getAttribute('target') === '_blank' ||
      link.hasAttribute('download')
    ) return;

    // 建立完整 URL 來解析
    const url = new URL(href, window.location.origin);
    const handled = navigateTo(url.href);
    if (handled) e.preventDefault();
  });

  // Prefetch on intent：hover（桌面）/ touchstart（手機，先於 click ~100ms+）→ 先暖該頁資料 cache。
  // document-level + 隨 app 生命週期常駐（initRouter 只跑一次），無需 page-cleanup。
  ['pointerover', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, (e) => {
      const link = /** @type {Element | null} */ (e.target)?.closest?.('a[href]');
      if (link) prefetchFromLink(link);
    }, { passive: true });
  });

  // 瀏覽器上一頁/下一頁
  window.addEventListener('popstate', () => {
    const { pathname, search } = window.location;
    const route = resolveRoute(pathname) || NOT_FOUND_ROUTE;
    loadPage(route, search);
  });

  // 初始路由（頁面首次載入）；首頁判斷用剝掉子路徑前綴後的邏輯路徑
  const { pathname, search } = window.location;
  const initRoute = resolveRoute(pathname);
  const logicalPath = stripBase(pathname);
  if (initRoute && initRoute.page !== 'index') {
    // 從非首頁 URL 直接進入（例如書籤）
    loadPage(initRoute, search);
  } else if (!initRoute && logicalPath !== '/' && logicalPath !== '/index.html') {
    // 找不到路由且非首頁 → 顯示 404
    loadPage(NOT_FOUND_ROUTE, search);
  } else {
    // 首頁初載不跑 loadPage（內容已在 shell）→ 手動掛 snap 模式（mandatory）
    document.documentElement.classList.add('snap-mandatory');
  }
  // index 的初始化由 main-modular.js DOMContentLoaded 處理
}
