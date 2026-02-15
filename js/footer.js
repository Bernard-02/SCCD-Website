/**
 * Footer Module
 * 處理頁尾載入
 */

import { initFooterDraggable } from './modules/ui/footer-draggable.js';

export function initFooter() {
  const footerContainer = document.getElementById('site-footer');

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
        
        // 如果有需要動態更新年份，可以在這裡加入
        // const yearSpan = document.getElementById('current-year');
        // if (yearSpan) yearSpan.textContent = new Date().getFullYear();
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
