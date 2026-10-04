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
    var key = String(path).replace(/^\//, '');
    // site-assets.js 填的後台覆蓋（icon/cursor 後台換檔改走 CDN）；未載入或沒對到＝本地檔
    var ov = window.__SCCD_ASSET_OVERRIDES;
    if (ov && ov[key]) return ov[key];
    return new URL(key, Helpers.siteBase).href;
  };

  // 全站 --cursor-* 唯一定義處（CSS 與 JS inline 都寫 var(--cursor-X)）。用絕對 URL：var() 內的相對 url()
  // 由「使用處」解析（stylesheet 深度不同／inline＝文件基準）會差層 404 退回系統游標。
  function setCursorVars() {
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
  }
  setCursorVars();
  // site-assets.js 拿到後台 cursor 覆蓋後重建一次（經 sitePath 換 CDN URL）
  Helpers.refreshCursorVars = setCursorVars;

  // 版型判斷唯一來源。gate＝矮橫向手機＋768–1023（iPad），沿用手機排版；同 css/layout/landscape.css 等處的
  // @media（CSS 無法共用 media query，改這串要同步 CSS）。/create 例外：generate-app/js/utils.js 自有斷點。
  Helpers.LANDSCAPE_GATE = '(orientation: landscape) and (max-height: 500px), (min-width: 768px) and (max-width: 1023px)';
  Helpers.isLandscapeGate = function() { return window.matchMedia(Helpers.LANDSCAPE_GATE).matches; };
  // 手機排版＝直向手機（<768）或 gate；桌面排版＝其餘（≥1024 且高 >500）
  Helpers.isMobileLayout = function() { return window.innerWidth < 768 || Helpers.isLandscapeGate(); };
  Helpers.isDesktopLayout = function() { return !Helpers.isMobileLayout(); };

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
    displayStyle = displayStyle == null ? 'block' : displayStyle;   // '' ＝清掉 inline、display 交回 CSS
    dataAttribute = dataAttribute || 'data-category';

    elements.forEach(function(el) {
      const category = el.getAttribute(dataAttribute);
      el.style.display = (filterValue === 'all' || category === filterValue) ? displayStyle : 'none';
    });
  };

  // 三原色唯一來源（＝ variables.css --color-pink / green / blue）；順序＝全站「rgb」慣例 粉／綠／藍
  Helpers.ACCENT_COLORS = Object.freeze(['#FF448A', '#00FF80', '#26BCFF']);
  let _lastColorIndex = -1;

  // 隨機一色，不跟上一次（全站共用）重複
  Helpers.getRandomAccentColor = function() {
    let index;
    do { index = Math.floor(Math.random() * Helpers.ACCENT_COLORS.length); } while (index === _lastColorIndex);
    _lastColorIndex = index;
    return Helpers.ACCENT_COLORS[index];
  };

  Helpers.getRandomRotation = function() {
    let deg;
    do { deg = Math.round(Math.random() * 10) - 4; } while (deg === 0);
    return deg;
  };

  // Fisher–Yates 原地洗牌、回傳同一陣列（要保留來源順序／來源是 frozen 時先 [...arr] 複製）
  Helpers.shuffle = function(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

})(window.SCCDHelpers);

// Register GSAP plugins（需在 GSAP 載入後執行）
if (typeof gsap !== 'undefined') {
  const plugins = [];
  if (typeof ScrollTrigger !== 'undefined') plugins.push(ScrollTrigger);
  if (typeof ScrollToPlugin !== 'undefined') plugins.push(ScrollToPlugin);
  if (typeof CustomEase !== 'undefined') plugins.push(CustomEase);
  if (plugins.length > 0) gsap.registerPlugin(...plugins);
  // GSAP core 不認 'cubic-bezier(...)' 字串（靜默退回 power1.out）→ 具名註冊，motion.js EASE.wipe 用
  if (typeof CustomEase !== 'undefined') CustomEase.create('wipe', '0.25,0,0,1');   // ＝ CSS --ease-wipe
}
