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

  if (footerContainer) {
    // 判斷路徑：如果在 pages 資料夾內，直接讀取 footer.html；如果在根目錄，讀取 pages/footer.html
    const path = window.location.pathname.includes('/pages/') ? 'footer.html' : 'pages/footer.html';

    fetch(path)
      .then(res => {
        if(!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        footerContainer.innerHTML = html;

        // 初始化 footer logo Lottie
        const footerLogo = document.getElementById('footer-logo');
        if (footerLogo && typeof lottie !== 'undefined') {
          const isInPages = window.location.pathname.includes('/pages/');
          const logoPath = isInPages ? '../data/SCCDLogoInverse.json' : 'data/SCCDLogoInverse.json';
          const anim = lottie.loadAnimation({
            container: footerLogo,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: logoPath,
            rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
          });
          anim.addEventListener('DOMLoaded', () => {
            const svg = footerLogo.querySelector('svg');
            if (svg) svg.style.overflow = 'visible';
          });
        }

        // HTML 載入完成後，初始化拖曳功能
        // 使用 setTimeout 確保 DOM 已經完全渲染
        // 手機版暫時不啟用拖曳功能
        if (window.innerWidth >= 768) {
          setTimeout(initFooterDraggable, 100);
        }
      })
      .catch(e => console.log('Footer load failed', e));
  }
}
