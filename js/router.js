/**
 * SPA Router
 * 攔截內部連結、替換 <main> 內容、管理 History API
 */

import { initPageModules, cleanupPageModules } from './main-modular.js';
import { updateNavActive } from './header.js';

// ── 路由表 ────────────────────────────────────────────────────
const routes = {
  '/':                        { page: 'index',                   htmlFile: null },
  '/index.html':              { page: 'index',                   htmlFile: null },
  '/about':                   { page: 'about',                   htmlFile: 'pages/about.html' },
  '/about.html':              { page: 'about',                   htmlFile: 'pages/about.html' },
  '/faculty':                 { page: 'faculty',                 htmlFile: 'pages/faculty.html' },
  '/faculty.html':            { page: 'faculty',                 htmlFile: 'pages/faculty.html' },
  '/courses':                 { page: 'courses',                 htmlFile: 'pages/courses.html' },
  '/courses.html':            { page: 'courses',                 htmlFile: 'pages/courses.html' },
  '/works':                   { page: 'works',                   htmlFile: 'pages/works.html' },
  '/works.html':              { page: 'works',                   htmlFile: 'pages/works.html' },
  '/activities':              { page: 'activities',              htmlFile: 'pages/activities.html' },
  '/activities.html':         { page: 'activities',              htmlFile: 'pages/activities.html' },
  '/admission':               { page: 'admission',               htmlFile: 'pages/admission.html' },
  '/admission.html':          { page: 'admission',               htmlFile: 'pages/admission.html' },
  '/admission-detail':        { page: 'admission-detail',        htmlFile: 'pages/admission-detail.html' },
  '/admission-detail.html':   { page: 'admission-detail',        htmlFile: 'pages/admission-detail.html' },
  '/awards':                  { page: 'awards',                  htmlFile: 'pages/awards.html' },
  '/awards.html':             { page: 'awards',                  htmlFile: 'pages/awards.html' },
  '/degree-show':             { page: 'degree-show',             htmlFile: 'pages/degree-show.html' },
  '/degree-show.html':        { page: 'degree-show',             htmlFile: 'pages/degree-show.html' },
  '/degree-show-detail':      { page: 'degree-show-detail',      htmlFile: 'pages/degree-show-detail.html' },
  '/degree-show-detail.html': { page: 'degree-show-detail',      htmlFile: 'pages/degree-show-detail.html' },
  '/support':                 { page: 'support',                 htmlFile: 'pages/support.html' },
  '/support.html':            { page: 'support',                 htmlFile: 'pages/support.html' },
  '/library':                 { page: 'library',                 htmlFile: 'pages/library.html' },
  '/library.html':            { page: 'library',                 htmlFile: 'pages/library.html' },
  '/generate':                { page: 'generate',                htmlFile: 'pages/generate.html' },
  '/generate.html':           { page: 'generate',                htmlFile: 'pages/generate.html' },
  '/privacy-policy':          { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/privacy-policy.html':     { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/terms-and-conditions':    { page: 'terms-and-conditions',    htmlFile: 'pages/terms-and-conditions.html' },
  '/terms-and-conditions.html':{ page: 'terms-and-conditions',   htmlFile: 'pages/terms-and-conditions.html' },
};

// ── 頁面專屬 CSS 動態載入 ────────────────────────────────────
const PAGE_CSS = {
  library: 'css/components/library.css',
};

function loadPageCSS(page) {
  // 移除舊的頁面專屬 CSS
  document.querySelectorAll('link[data-page-css]').forEach(el => el.remove());
  // 載入新的（如果有）
  const href = PAGE_CSS[page];
  if (!href) return;
  if (document.querySelector(`link[href="${href}"]`)) return; // 已載入
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.pageCss = page;
  document.head.appendChild(link);
}

// ── 路徑解析 ──────────────────────────────────────────────────
function resolveRoute(pathname) {
  // 移除 /pages/ 前綴（如果從 pages/ 子目錄點擊連結）
  const normalized = pathname.replace(/^\/pages\//, '/').replace(/\/$/, '') || '/';
  return routes[normalized] || null;
}

// ── 內容替換 ──────────────────────────────────────────────────
async function loadPage(route, search = '') {
  const main = document.getElementById('page-content');
  if (!main) return;

  // index 不需要 fetch，直接初始化
  if (route.page === 'index') {
    cleanupPageModules();
    window.scrollTo(0, 0);
    updateNavActive(route.page);
    document.body.classList.remove('overflow-hidden');
    initPageModules(route.page);
    return;
  }

  try {
    const res = await fetch(route.htmlFile);
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();

    // 解析出 <main> 內容
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);

    // Cleanup 上一頁
    cleanupPageModules();

    // 替換內容
    main.innerHTML = newMain.innerHTML;
    main.className = newMain.className || '';
    main.removeAttribute('style');
    if (newMain.getAttribute('style')) {
      main.setAttribute('style', newMain.getAttribute('style'));
    }

    // 捲到頂部
    window.scrollTo(0, 0);

    // 動態載入頁面專屬 CSS（library 有自己的 css）
    loadPageCSS(route.page);

    // 更新 nav active state
    updateNavActive(route.page);

    // generate / library 頁不顯示 footer
    const footerEl = document.getElementById('site-footer') || document.getElementById('site-footer-static');
    if (footerEl) {
      footerEl.style.display = (route.page === 'generate' || route.page === 'library') ? 'none' : '';
    }

    // 更新 body class（generate 需要 overflow-hidden）
    document.body.classList.toggle('overflow-hidden', route.page === 'generate');

    // 初始化新頁面模組（帶 query string 供 detail 頁用）
    initPageModules(route.page, new URLSearchParams(search));

  } catch (err) {
    console.error('[Router] Page load error:', err);
  }
}

// ── 導航 ──────────────────────────────────────────────────────
export function navigateTo(url) {
  const { pathname, search } = new URL(url, window.location.origin);
  const route = resolveRoute(pathname);
  if (!route) return false; // 讓瀏覽器自行處理

  window.history.pushState({ page: route.page }, '', pathname + search);
  loadPage(route, search);
  return true;
}

// ── 事件綁定 ──────────────────────────────────────────────────
export function initRouter() {
  // 攔截所有內部連結點擊
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
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
  window.addEventListener('popstate', (e) => {
    const { pathname, search } = window.location;
    const route = resolveRoute(pathname);
    if (route) loadPage(route, search);
  });

  // 初始路由（頁面首次載入）
  const { pathname, search } = window.location;
  const initRoute = resolveRoute(pathname);
  if (initRoute && initRoute.page !== 'index') {
    // 從非首頁 URL 直接進入（例如書籤）
    loadPage(initRoute, search);
  }
  // index 的初始化由 main-modular.js DOMContentLoaded 處理
}
