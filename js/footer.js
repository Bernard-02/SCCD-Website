/**
 * Footer Module
 * 處理頁尾載入
 */

import { initFooterDraggable } from './modules/ui/footer-draggable.js';

export function initFooter() {
  const footerContainer = document.getElementById('site-footer');

  // index.html 靜態 footer logo
  const staticFooterLogo = document.getElementById('footer-logo');
  if (staticFooterLogo && typeof lottie !== 'undefined') {
    const anim = lottie.loadAnimation({
      container: staticFooterLogo,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'data/SCCDLogoInverse.json',
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
    });
    anim.addEventListener('DOMLoaded', () => {
      const svg = staticFooterLogo.querySelector('svg');
      if (svg) svg.style.overflow = 'visible';
    });
  }

  // index.html 靜態 footer 拖曳初始化
  const staticFooter = document.getElementById('site-footer-static');
  if (staticFooter && window.innerWidth >= 768) {
    setTimeout(initFooterDraggable, 100);
  }

  if (footerContainer) {
    fetch('pages/footer.html')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        footerContainer.innerHTML = html;

        // 初始化 footer logo Lottie（SPA：固定用根目錄路徑）
        const footerLogo = document.getElementById('footer-logo');
        if (footerLogo && typeof lottie !== 'undefined') {
          const anim = lottie.loadAnimation({
            container: footerLogo,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: 'data/SCCDLogoInverse.json',
            rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
          });
          anim.addEventListener('DOMLoaded', () => {
            const svg = footerLogo.querySelector('svg');
            if (svg) svg.style.overflow = 'visible';
          });
        }

        // 年份自動更新
        const yearEl = document.getElementById('footer-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        if (window.innerWidth >= 768) {
          setTimeout(initFooterDraggable, 100);
        }
      })
      .catch(e => console.log('Footer load failed', e));
  }
}
