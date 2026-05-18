/**
 * Footer Module
 * 處理頁尾載入 + Lottie + 年份
 *
 * Logo 檔案依 mode 直接挑（不靠 CSS filter 翻色）：
 *   standard (footer bg=黑)   → SCCDLogoInverse.json (白 filled)
 *   inverse  (footer bg=白)   → SCCDLogoStandard.json (黑 filled)
 *   color    (footer bg=互補 hue) → SCCDLogoWireframeStandard.json (黑 wireframe)
 *                                  + themes/color.css 的 --footer-invert-filter 依
 *                                    contrast bg luminance 即時翻白
 */

// footer-scatter：每次刷新 random 散佈 + collision resolution（v4，取代 v3 grid）
// 詳見 ./modules/ui/footer-draggable.js（檔名沿用，drag 功能已移除）
import { initFooterScatter } from './modules/ui/footer-draggable.js';

const STORAGE_KEY = 'sccd-theme-mode';
let currentFooterAnim = null;
let currentFooterMode = null;

function getMode() {
  return sessionStorage.getItem(STORAGE_KEY) || 'standard';
}

function pickLogoFile(mode) {
  if (mode === 'color') return 'SCCDLogoWireframeStandard.json';
  if (mode === 'inverse') return 'SCCDLogoStandard.json';
  return 'SCCDLogoInverse.json';
}

function findFooterLogoContainer() {
  // SPA 注入的 #site-footer 內 + 首頁靜態 #site-footer-static 內
  return document.querySelector('#site-footer #footer-logo, #site-footer-static #footer-logo');
}

function loadFooterLogo(container) {
  if (!container || typeof lottie === 'undefined') return;
  const mode = getMode();
  // 已是相同 mode 的 Lottie 在運行 → skip（避免 SPA 換頁 / 多次 init 重載打斷動畫）
  if (currentFooterMode === mode && container.querySelector('svg')) return;

  if (currentFooterAnim) {
    try { currentFooterAnim.destroy(); } catch (_) {}
    currentFooterAnim = null;
  }
  container.innerHTML = '';

  const isInPages = window.location.pathname.includes('/pages/');
  const basePath = isInPages ? '/data/' : 'data/';

  const anim = lottie.loadAnimation({
    container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: basePath + pickLogoFile(mode),
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });
  currentFooterAnim = anim;
  currentFooterMode = mode;

  anim.addEventListener('DOMLoaded', () => {
    const svg = container.querySelector('svg');
    if (svg) svg.style.overflow = 'visible';
  });
}

function setYear(el) {
  if (el) el.textContent = String(new Date().getFullYear());
}

export function initFooter() {
  const footerContainer = document.getElementById('site-footer');

  // index.html 靜態 footer
  const staticFooter = document.getElementById('site-footer-static');
  if (staticFooter) {
    loadFooterLogo(staticFooter.querySelector('#footer-logo'));
    setYear(document.getElementById('footer-year-static'));
    initFooterScatter(staticFooter);
  }

  // SPA footer：fetch pages/footer.html 注入
  // cache: 'no-cache' 強制 revalidate — 開發時改 footer.html 後 SPA 內不會看到舊版（SPA 不會 hard reload）
  // URL 用 origin-based 絕對路徑，避免相對路徑在 /pages/X.html 直訪時 baseURI 變 /pages/ → 解析成 /pages/pages/footer.html → 404
  if (footerContainer) {
    const footerUrl = new URL('pages/footer.html', window.location.origin).href;
    fetch(footerUrl, { cache: 'no-cache' })
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        footerContainer.innerHTML = html;
        loadFooterLogo(footerContainer.querySelector('#footer-logo'));
        setYear(footerContainer.querySelector('#footer-year'));
        const spaFooter = footerContainer.querySelector('footer.footer-shell');
        if (spaFooter) initFooterScatter(spaFooter);
      })
      .catch(e => console.log('Footer load failed', e));
  }

  // Mode 切換時換 Lottie 檔
  // theme:changed 在 mode-color 期間每 ~200ms 也會 dispatch 帶 hue 更新 — 用 mode === currentFooterMode 短路避免重載
  window.addEventListener('theme:changed', (e) => {
    const mode = e && e.detail && e.detail.mode;
    if (!mode || mode === currentFooterMode) return;
    const container = findFooterLogoContainer();
    if (container) loadFooterLogo(container);
  });
}
