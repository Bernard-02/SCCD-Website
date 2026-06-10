/**
 * SCCD Utility Helpers — IIFE 掛 window.SCCDHelpers
 * <script src="js/utils/helpers.js"> 在所有 HTML head 最後一個 script，先於 main-modular.js
 */

window.SCCDHelpers = window.SCCDHelpers || /** @type {SCCDHelpersAPI} */ ({});

(function(Helpers) {
  'use strict';

  // 站台根 URL：部署在子路徑（GitHub Pages project site / 學校子目錄）時，根目錄絕對路徑
  // （/custom-cursor/x.svg）會指到網域根而 404。classic scripts（generate-app）不能 import
  // ES module 的 site-base.js，從本檔 <script src> 位置推導（js/utils/ → 上兩層 = 站台根）。
  Helpers.siteBase = new URL('../../', document.currentScript.src).href;

  Helpers.sitePath = function(path) {
    return new URL(String(path).replace(/^\//, ''), Helpers.siteBase).href;
  };

  // --cursor-* 變數內的相對 url() 由「使用 var() 的 stylesheet」基準解析（Chromium 行為）：
  // variables.css 寫 '../custom-cursor/' 以 css/ 為基準正確，但被直接載入的頁面 CSS
  // （css/components/create.css 等，loadPageCSS）引用時基準變 css/components/ → 差一層 404。
  // 啟動時以絕對 URL 覆寫整批變數，消除基準歧義（值對齊 variables.css 的 hotspot / fallback）。
  (function setCursorVars() {
    var cursors = {
      'default':     ['default.svg',  '9 2',   'default'],
      'pointer':     ['pointer.svg',  '14 1',  'pointer'],
      'text':        ['typing.svg',   '15 15', 'text'],
      'grab':        ['drag_1.svg',   '15 15', 'grab'],
      'grabbing':    ['drag_2.svg',   '15 15', 'grabbing'],
      'zoom-in':     ['zoom-in.svg',  '9 9',   'zoom-in'],
      'zoom-out':    ['zoom-out.svg', '9 9',   'zoom-out'],
      'w-resize':    ['left.svg',     '2 15',  'w-resize'],
      'e-resize':    ['right.svg',    '28 15', 'e-resize'],
      'not-allowed': ['ban.svg',      '16 16', 'not-allowed'],
    };
    var root = document.documentElement;
    Object.keys(cursors).forEach(function(key) {
      var c = cursors[key];
      root.style.setProperty(
        '--cursor-' + key,
        "url('" + Helpers.sitePath('custom-cursor/' + c[0]) + "') " + c[1] + ', ' + c[2]
      );
    });
  })();

  Helpers.isMobile = function() {
    return window.innerWidth < 768;
  };

  Helpers.isDesktop = function() {
    return window.innerWidth >= 768;
  };

  Helpers.scrollToElement = function(target, offset, behavior) {
    offset = offset || 0;
    behavior = behavior || 'smooth';

    let element;
    if (typeof target === 'string') {
      if (!target.startsWith('#')) return;
      try {
        element = document.querySelector(target);
      } catch (e) {
        return;
      }
    } else {
      element = target;
    }

    if (!element) return;

    const y = element.getBoundingClientRect().top + window.pageYOffset + offset;
    window.scrollTo({ top: y, behavior: behavior });
  };

  Helpers.setActive = function(activeElement, siblings, activeClass) {
    if (!activeElement) return;
    activeClass = activeClass || 'active';
    siblings.forEach(function(el) { el.classList.remove(activeClass); });
    activeElement.classList.add(activeClass);
  };

  Helpers.filterElements = function(elements, filterValue, displayStyle, dataAttribute) {
    displayStyle = displayStyle || 'block';
    dataAttribute = dataAttribute || 'data-category';

    elements.forEach(function(el) {
      const category = el.getAttribute(dataAttribute);
      el.style.display = (filterValue === 'all' || category === filterValue) ? displayStyle : 'none';
    });
  };

  const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  let _lastColorIndex = -1;

  Helpers.getRandomAccentColor = function() {
    let index;
    do { index = Math.floor(Math.random() * ACCENT_COLORS.length); } while (index === _lastColorIndex);
    _lastColorIndex = index;
    return ACCENT_COLORS[index];
  };

  Helpers.getRandomRotation = function() {
    let deg;
    do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
    return deg;
  };

})(window.SCCDHelpers);

// Register GSAP plugins（需在 GSAP 載入後執行）
if (typeof gsap !== 'undefined') {
  const plugins = [];
  if (typeof ScrollTrigger !== 'undefined') plugins.push(ScrollTrigger);
  if (typeof ScrollToPlugin !== 'undefined') plugins.push(ScrollToPlugin);
  if (plugins.length > 0) gsap.registerPlugin(...plugins);
}
