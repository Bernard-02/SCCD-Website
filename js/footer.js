/**
 * Footer Module
 * 處理頁尾載入（logo 沒有自己的一份：整屏 footer 頂端浮的是 header logo，header.js loadMobileLogo 換 footer 對比色）
 */

// footer-scatter：每次刷新 random 散佈 + collision resolution（v4，取代 v3 grid）
import { initFooterScatter } from './modules/ui/footer-scatter.js';
// footer 內容（tab + 散佈項目）走 Directus footer_tabs/footer_items（2026-08-11）；渲染完才 init 散佈
import { renderFooterContent } from './modules/ui/footer-content.js';
import { sitePath } from './modules/ui/site-base.js';

export function initFooter() {
  const footerContainer = document.getElementById('site-footer');

  // index.html 靜態 footer：先渲染 CMS 內容（tab+項目）再 init 散佈；渲染失敗（連 fallback 都掛）仍 init（privacy 照常）
  const staticFooter = document.getElementById('site-footer-static');
  if (staticFooter) {
    renderFooterContent(staticFooter)
      .catch((e) => console.warn('[footer] render failed', e))
      .then(() => initFooterScatter(staticFooter));
  }

  // SPA footer：fetch pages/footer.html 注入
  // cache: 'no-cache' 強制 revalidate — 開發時改 footer.html 後 SPA 內不會看到舊版（SPA 不會 hard reload）
  // URL 用站台根絕對路徑，避免相對路徑在 /pages/X.html 直訪時 baseURI 變 /pages/ → 解析成 /pages/pages/footer.html → 404
  if (footerContainer) {
    const footerUrl = sitePath('pages/footer.html');
    fetch(footerUrl, { cache: 'no-cache' })
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        footerContainer.innerHTML = html;
        const spaFooter = footerContainer.querySelector('footer.footer-shell');
        if (spaFooter) {
          renderFooterContent(spaFooter)
            .catch((e) => console.warn('[footer] render failed', e))
            .then(() => initFooterScatter(spaFooter));
        }
      })
      .catch(e => console.log('Footer load failed', e));
  }
}
