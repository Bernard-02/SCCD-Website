/**
 * SPA Router
 * 攔截內部連結、替換 <main> 內容、管理 History API
 */

import { initPageModules, cleanupPageModules } from './main-modular.js';
import { updateNavActive } from './header.js';

// ── 路由表 ────────────────────────────────────────────────────
const routes = {
  '/':                        { page: 'index',                   htmlFile: 'index.html' },
  '/index.html':              { page: 'index',                   htmlFile: 'index.html' },
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
  '/atlas':                   { page: 'atlas',                   htmlFile: 'pages/atlas.html' },
  '/atlas.html':              { page: 'atlas',                   htmlFile: 'pages/atlas.html' },
  '/generate':                { page: 'generate',                htmlFile: 'pages/generate.html' },
  '/generate.html':           { page: 'generate',                htmlFile: 'pages/generate.html' },
  '/privacy-policy':          { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/privacy-policy.html':     { page: 'privacy-policy',          htmlFile: 'pages/privacy-policy.html' },
  '/terms-and-conditions':    { page: 'terms-and-conditions',    htmlFile: 'pages/terms-and-conditions.html' },
  '/terms-and-conditions.html':{ page: 'terms-and-conditions',   htmlFile: 'pages/terms-and-conditions.html' },
  '/404':                     { page: '404',                     htmlFile: 'pages/404.html' },
  '/404.html':                { page: '404',                     htmlFile: 'pages/404.html' },
};

const NOT_FOUND_ROUTE = routes['/404'];

// ── 頁面專屬 CSS 動態載入 ────────────────────────────────────
const PAGE_CSS = {
  library: 'css/components/library.css',
  atlas: 'css/components/atlas.css',
};

function loadPageCSS(page) {
  // 移除舊的頁面專屬 CSS
  document.querySelectorAll('link[data-page-css]').forEach(el => el.remove());
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
async function loadPage(route, search = '') {
  const main = document.getElementById('page-content');
  if (!main) return;

  try {
    // 使用 origin 為基底解析絕對路徑，避免 pushState 改變 baseURI 後的相對路徑錯亂
    const fetchUrl = new URL(route.htmlFile, window.location.origin).href;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();

    // 解析出 <main> 內容
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);

    // Cleanup 上一頁
    cleanupPageModules();

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

    // generate / library / atlas 頁不顯示 footer
    const footerEl = document.getElementById('site-footer') || document.getElementById('site-footer-static');
    if (footerEl) {
      footerEl.style.display = (route.page === 'generate' || route.page === 'library' || route.page === 'atlas') ? 'none' : '';
    }

    // 更新 body class（generate / atlas 鎖頁面 scroll，滿版單屏）
    document.body.classList.toggle('overflow-hidden', route.page === 'generate' || route.page === 'atlas');
    document.body.style.overflowX = (route.page === 'about') ? 'hidden' : '';

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
export function navigateTo(url) {
  const { pathname, search, hash } = new URL(url, window.location.origin);
  const route = resolveRoute(pathname) || NOT_FOUND_ROUTE;

  // 保留 hash 供 deep link 使用（如 library.html#a-2024-01）
  window.history.pushState({ page: route.page }, '', pathname + search + hash);
  loadPage(route, search);
  return true;
}

// ── 事件綁定 ──────────────────────────────────────────────────
export function initRouter() {
  // 停用瀏覽器自動恢復 scroll（由 SPA 自行控制）
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

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
