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
  // MediaQueryList 建一次重複讀：舊版讀 window.innerWidth＝強制 layout，在清單模板迴圈裡每筆一次（手機 activities 續建
  // 4x 降速實測 834ms，user 2026-10-29「marquee 特別卡」）。<768 用 media query 與 CSS 同式
  const _mqPortrait = window.matchMedia('(max-width: 767px)');
  const _mqGate = window.matchMedia(Helpers.LANDSCAPE_GATE);
  Helpers.isLandscapeGate = function() { return _mqGate.matches; };
  // 橫向手機（高 ≤500）＝gate 前半：nav／tab 回 header 帶、內容左右排（user 2026-10-30「底 bar 一屏頁空間不夠」）；
  // iPad（768–1023、高 >500）＝gate 後半：維持直向同款底 bar。CSS 對應 landscape.css 檔尾 @media (max-height: 500px) 巢狀段
  Helpers.LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 500px)';
  const _mqPhoneLand = window.matchMedia(Helpers.LANDSCAPE_PHONE);
  Helpers.isLandscapePhone = function() { return _mqPhoneLand.matches; };
  // 手機排版＝直向手機（<768）或 gate；桌面排版＝其餘（≥1024 且高 >500）
  Helpers.isMobileLayout = function() { return _mqPortrait.matches || _mqGate.matches; };
  Helpers.isDesktopLayout = function() { return !Helpers.isMobileLayout(); };
  // 輸入判斷，跟版型分開（user 2026-10-31 定案：iPad 橫向 ≥1024 走桌面排版，但 hover／滾輪類互動要看輸入方式）。
  // iPad 不論接不接 Magic Keyboard 都回報 hover:none／pointer:coarse（WebKit 至今如此）→ 一律當觸控；
  // 觸控筆電主輸入仍是滑鼠＝桌面。勿拿 isMobileLayout() 兼判「是不是觸控」。
  const _mqHover = window.matchMedia('(hover: hover)');
  const _mqCoarse = window.matchMedia('(pointer: coarse)');
  Helpers.canHover = function() { return _mqHover.matches; };
  Helpers.isCoarsePointer = function() { return _mqCoarse.matches; };
  // 觸控／筆 tap 後 WebKit 仍讓 :focus-visible 命中（iPad 實測每顆 btn 點了都有外框，user 2026-10-31）→ html.input-touch 關外框；
  // 鍵盤一按就拿掉＝iPad 接鍵盤的人照常看得到焦點。typography.css 配對規則。
  document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') document.documentElement.classList.add('input-touch'); }, { capture: true, passive: true });
  document.addEventListener('keydown', () => document.documentElement.classList.remove('input-touch'), { capture: true, passive: true });

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

  // 卡片內圖片 hover 離開換新角（user 2026-10-19）：用各自的角度產生器 gen 重抽，跟舊角 prev 差 ≥1° 才算「新」（差太少看起來像沒換）。
  // gen 可回數字或 '4.2deg' 字串，prev 同；回傳 gen 的原格式
  Helpers.rerollAngle = function(gen, prev) {
    const p = parseFloat(String(prev)) || 0;
    let d;
    do { d = gen(); } while (Math.abs(parseFloat(String(d)) - p) < 1);
    return d;
  };

  // 真桌面 header 幾何（唯一來源＝variables.css --header-logo-top／--logo-lg／--logo-sm）：logo 大小依視窗高等比
  // （1920×960＝180／100）、mode／menu 鈕 48 置中於縮小態 logo 中線。真桌面外回 36／180／100（呼叫端本來就只在桌面用）
  Helpers.headerGeom = function() {
    const cs = getComputedStyle(document.documentElement);
    const logoTop = parseFloat(cs.getPropertyValue('--header-logo-top')) || 36;
    const logoLg = parseFloat(cs.getPropertyValue('--logo-lg')) || 180;
    const logoSm = parseFloat(cs.getPropertyValue('--logo-sm')) || 100;
    const mid = logoTop + logoSm / 2;
    return { logoTop, mid, btnTop: mid - 24, btnBottom: mid + 24, logoLg, logoSm };
  };

  // 點了會退場的鈕／連結：退場途中保持 hover 樣子（user 2026-10-21，同 header menu 鈕）。退場起跑當下把 el＋子孫的
  // computed 底色／字色凍成 inline !important——鈕滑出游標底下、游標移開（:hover 與 mouseleave 拆色）都不掉色；
  // 收完 releaseHover 還原。svg 內部不凍（Lottie logo 節點上百、色走 fill）。已凍著再呼叫＝沿用第一次（退場中途又被
  // 關一次時游標可能已離開）→ 每條會中斷退場的路徑（重開等）都要先 release。
  // ⚠️ 凍住期間別處用非 important 寫同屬性會蓋掉凍結值（CSSOM 規則）→ release 時那格留新值、不還原舊值
  const HOLD_PROPS = ['background-color', 'color'];
  Helpers.holdHover = function(el) {
    if (!el || el._hoverHold) return;
    const nodes = /** @type {HTMLElement[]} */ ([el, ...el.querySelectorAll(':not(svg *)')]);
    const frozen = nodes.map(n => { const cs = getComputedStyle(n); return HOLD_PROPS.map(p => cs.getPropertyValue(p)); });
    const saved = nodes.map(n => HOLD_PROPS.map(p => [n.style.getPropertyValue(p), n.style.getPropertyPriority(p)]));
    nodes.forEach((n, i) => HOLD_PROPS.forEach((p, j) => n.style.setProperty(p, frozen[i][j], 'important')));
    el._hoverHold = () => nodes.forEach((n, i) => HOLD_PROPS.forEach((p, j) => {
      if (n.style.getPropertyPriority(p) !== 'important' || n.style.getPropertyValue(p) !== frozen[i][j]) return;
      const [v, pr] = saved[i][j];
      if (v) n.style.setProperty(p, v, pr); else n.style.removeProperty(p);
    }));
  };
  Helpers.releaseHover = function(el) {
    const release = el && el._hoverHold;
    if (!release) return;
    delete el._hoverHold;
    release();
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
