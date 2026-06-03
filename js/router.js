/**
 * SPA Router
 * 攔截內部連結、替換 <main> 內容、管理 History API
 */

import { initPageModules, cleanupPageModules } from './main-modular.js';
import { updateNavActive } from './header.js';
import { runPageExit } from './modules/ui/page-exit.js';
import { initFooter } from './footer.js';

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
  '/privacy-policy':          { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/privacy-policy.html':     { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/accessibility':           { page: 'accessibility',           htmlFile: 'pages/accessibility.html' },
  '/accessibility.html':      { page: 'accessibility',           htmlFile: 'pages/accessibility.html' },
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

function loadPageCSS(page) {
  // 移除舊的頁面專屬 CSS：要同時涵蓋兩種來源
  //   1. 上次切頁時 loadPageCSS 動態插入的（有 data-page-css attr）
  //   2. 直接 refresh 內頁時 pages/X.html `<head>` 內 inline 寫死的 `<link href="../css/components/X.css">`
  //      → 沒 data-page-css attr，但 href 一定命中 PAGE_CSS values
  //   若只 query `[data-page-css]` 會漏 case 2，導致 refresh /create 後切回 index 時
  //   create.css 永久殘留（user 2026-05-31 反饋 index 看不到 mode-btn-mobile，因 create.css
  //   `#mode-btn-mobile { display:none !important }` 全頁繼續 cascade）
  const pageCssBasenames = Object.values(PAGE_CSS).map(h => h.split('/').pop());
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const link = /** @type {HTMLLinkElement} */ (el);
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
  // 載入新的（如果有）
  const href = PAGE_CSS[page];
  if (!href) return;
  // 使用 origin 為基底的絕對路徑，避免 pushState 影響
  const absHref = new URL(href, window.location.origin).href;
  if (document.querySelector(`link[href="${absHref}"]`)) return; // 已載入
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = absHref;
  link.dataset.pageCss = page;
  document.head.appendChild(link);
}

// ── 路徑解析 ──────────────────────────────────────────────────
function resolveRoute(pathname) {
  // 移除 /pages/ 前綴（如果從 pages/ 子目錄點擊連結）
  const normalized = pathname.replace(/^\/pages\//, '/').replace(/\/$/, '') || '/';
  return routes[normalized] || null;
}

// ── Scroll 重置工具 ──────────────────────────────────────────
function scrollToTop() {
  window.scrollTo(0, 0);
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

// ── 內容替換 ──────────────────────────────────────────────────
// 全域 nav sequence：每次 loadPage 取一個 unique 號碼，await 後檢查是否已被更新的 nav 蓋過
// → 解決 race：A(去 /about, exit anim 0.85s) 中途 B(回 /create, exit handler 已 null fetch 50ms)
//   若無 guard，B 先完成 swap+init 後 A 再完成又 swap 走 → user 點 /create 卻被 A 拉去 /about
//   且 /create 的 p5 typewriter 被 A 的 cleanup 殺掉 → placeholder 消失
let navSeq = 0;

async function loadPage(route, search = '') {
  const main = document.getElementById('page-content');
  if (!main) return;

  const mySeq = ++navSeq;
  // 內部 helper：在每個 await 後檢查是否還是最新 nav，不是就 abort
  const isStale = () => mySeq !== navSeq;

  try {
    // 使用 origin 為基底解析絕對路徑，避免 pushState 改變 baseURI 後的相對路徑錯亂
    const fetchUrl = new URL(route.htmlFile, window.location.origin).href;

    // 退場動畫（當前頁有 register 才會跑）跟 fetch 並行：anim ~0.7s + fetch 通常更快，
    // 兩者平行省 0.3-0.5s 過場時間；await 兩個都完成才繼續 cleanup + DOM 替換
    const [_exit, res] = await Promise.all([runPageExit(route), fetch(fetchUrl)]);
    if (isStale()) return; // 中途有新 nav，放棄這次（不 cleanup 不 swap，讓新 nav 接手）
    void _exit;
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();
    if (isStale()) return;

    // 解析出 <main> 內容
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);

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

    // 動態載入頁面專屬 CSS（library 有自己的 css）
    loadPageCSS(route.page);

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
      if (!shouldHide && footerEl.id === 'site-footer' && !footerEl.querySelector('.footer-anchor')) {
        initFooter();
      }
    }

    // 更新 body class（generate / atlas / library 鎖頁面 scroll，滿版單屏）
    // library 必須走 class 不能靠 HTML inline style="overflow:hidden"：
    //   1) SPA 導航時 body inline 不會替換（只替換 #page-content）→ library.html 的 inline 永遠不生效
    //   2) lightbox-shell exitLightboxMode 會 `body.style.overflow=''`，會把 inline 的 overflow 清掉
    // 用 class 兩個 case 都不受影響
    document.body.classList.toggle('overflow-hidden', route.page === 'generate' || route.page === 'atlas' || route.page === 'library');
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
    const needsClipX = route.page === 'about' || route.page === 'alumni' || route.page === 'faculty' || route.page === 'activities';
    document.documentElement.style.overflowX = needsClipX ? 'clip' : '';
    document.body.style.overflowX = needsClipX ? 'clip' : '';

    // 初始化新頁面模組（帶 query string 供 detail 頁用）
    initPageModules(route.page, new URLSearchParams(search));

    // async 資料載入完成後頁面高度會變，再 scroll 一次保險
    setTimeout(() => scrollToTop(), 0);
    setTimeout(() => scrollToTop(), 100);

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
  const realPath = route.htmlFile === 'index.html' ? '/' : '/' + route.htmlFile;

  // 保留 hash 供 deep link 使用（如 library.html#a-2024-01）
  window.history.pushState({ page: route.page }, '', realPath + search + hash);
  return loadPage(route, search);
}

// ── 事件綁定 ──────────────────────────────────────────────────
export function initRouter() {
  // 停用瀏覽器自動恢復 scroll（由 SPA 自行控制）
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // 攔截所有內部連結點擊
  document.addEventListener('click', (e) => {
    const target = /** @type {Element | null} */ (e.target);
    const link = target?.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

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

  // 瀏覽器上一頁/下一頁
  window.addEventListener('popstate', () => {
    const { pathname, search } = window.location;
    const route = resolveRoute(pathname) || NOT_FOUND_ROUTE;
    loadPage(route, search);
  });

  // 初始路由（頁面首次載入）
  const { pathname, search } = window.location;
  const initRoute = resolveRoute(pathname);
  if (initRoute && initRoute.page !== 'index') {
    // 從非首頁 URL 直接進入（例如書籤）
    loadPage(initRoute, search);
  } else if (!initRoute && pathname !== '/' && pathname !== '/index.html') {
    // 找不到路由且非首頁 → 顯示 404
    loadPage(NOT_FOUND_ROUTE, search);
  }
  // index 的初始化由 main-modular.js DOMContentLoaded 處理
}
