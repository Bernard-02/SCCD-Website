/**
 * flag-icons CSS lazy-load helper
 *
 * SPA router 只換 main，<head> 不換 → 子頁面 head 寫的 <link rel="stylesheet">
 * 在跨頁 SPA navigate 後不會生效。從 about / faculty / atlas 等沒有 flag-icons
 * link 的頁切到 library Awards / awards.html / activities → `.fi-tw` 等 class
 * 完全 unstyled、視覺空盒子。
 *
 * 任何要渲染 `<span class="fi fi-XX">` 的 renderer 在 render 前呼叫 ensureFlagIconsCss()
 * 確保 CSS 已注入。Promise-cached + DOM 端 `link[href*="flag-icons"]` 偵測，重複呼叫安全。
 */

const FLAG_ICONS_HREF = 'https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/css/flag-icons.min.css';

let _loadPromise = null;

export function ensureFlagIconsCss() {
  if (_loadPromise) return _loadPromise;

  const existing = document.querySelector('link[href*="flag-icons"]');
  if (existing) {
    _loadPromise = Promise.resolve();
    return _loadPromise;
  }

  _loadPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FLAG_ICONS_HREF;
    link.dataset.flagIconsDynamic = '1';
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });

  return _loadPromise;
}
