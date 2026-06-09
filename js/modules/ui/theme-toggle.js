import { DUR, EASE } from './motion.js';
/**
 * Theme Toggle Module
 * 切換 standard / inverse / color 模式（影響整個網站的 body class）
 *
 * 整合策略：
 * - mode 存 sessionStorage，跨頁保持，新開視窗/分頁重置為 standard
 * - /generate 頁跟其他頁共用 mode：header mode-btn 跟 generate-app colormode btn 都走 setSiteMode
 * - applyModeForPage / updateToggleBtnVisualState 由 main-modular.js 在每次切頁呼叫，SPA 也能即時 re-evaluate
 *
 * mode-color：持續變化的隨機色（直接複製 generate-app wireframe Play 實作）
 *   - HSB(hue, 80, 100) ≡ HSL(hue, 100%, 60%)
 *   - 速度：每幀 `hue += 0.125`（直抄 wireframe baseSpeeds[0]）— 跟 gen 觀感同步
 *     不用時間驅動（dt × per-second rate），雖然理論值同 7.5°/s，但 gen 在實際環境下
 *     fps 可能不滿 60，per-frame 才能在 user 螢幕上跟 gen 同節奏
 *   - 對比文字色用 WCAG relative luminance（gamma-corrected sRGB），threshold 0.5
 *   - 元件已用 var(--theme-fg)/(--theme-bg) 的會自動跟著走
 *   - 純黑/白底 + 三原色 hl bg → CSS rule 用 var(--theme-overlay-25) 蓋成半透明，顯露隨機色
 */

const MODES = ['standard', 'inverse', 'color'];
const STORAGE_KEY = 'sccd-theme-mode';

// Mode 切換 fade：applyMode 在 body/html 加 .mode-switching class（typography.css 規則套 0.4s transition 到全 subtree），
//   0.4s 後移除 → 穩態下無 transition，避免 mode-color RAF 高頻更新 --theme-bg 跟 transition 衝突 lag
// 首次 apply（page load）跳過 fade，避免 default 白底 → 目標 mode 的閃爍
// 速度 0.4s：全域 mode 切換用同一節奏
const MODE_FADE_MS = 400;
let hasAppliedModeOnce = false;
let modeSwitchTimer = null;
let antiJitterStyle = null;
// 獨立追蹤上次 apply 的 mode：不能用 body.mode-* class 偵測 currentMode，因為 /create 會把 body class
// 移除（pause），回來時 body class=null 會被誤判為「換了 mode」觸發 fade；fade 的 *!important transition
// 規則會蓋掉新頁進場動畫的 inline transition（如 library-card clipReveal 的 clip-path），導致卡片瞬間 snap
// 沒揭露動畫。改用 module 狀態變數，/create paused 不重設，回來同 mode → isSameMode=true 跳過 fade
let lastAppliedMode = null;
// mode-color RAF 延後啟動：fade 期間凍結 --theme-bg/fg，避免 1) RAF 每幀 retarget 讓 transition 不走純 ease 曲線
//                                                          2) --theme-fg 在 luminance threshold 上下二元翻黑/白導致 [data-section-title] 等用 fg bg 的元件抖動
let colorRAFStartTimer = null;

/* ===== mode-color: random hue loop ===== */
let colorRAF = null;
let colorHue = Math.random() * 360;
let lastThemeDispatch = 0;
// 對比黑/白遲滯狀態：亮度卡 0.5 門檻的色域(橘 hue~35 / 青 hue~195)會讓 isLightBg 每幀在兩側抖
// → --theme-fg / --theme-invert-filter 等全站對比 var 狂翻黑白 = 文字 + placeholder logo 一起閃。
let _lastIsLightBg = null;
// 降速：gen wireframe Play 用 0.125，但 gen sketch 重實際 fps 跑不滿，視覺較慢；
// mode-color 每幀只 set 幾個 CSS var 跑滿 frame rate，需手動降增量才能跟 gen 視覺等速
const HUE_PER_FRAME = 0.04;

// HSB → RGB（對齊 generate-app wireframe color(hue, 80, 100) HSB 模式）
function hsbToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// WCAG relative luminance（gamma-corrected sRGB）—— 對齊 generate-app getRelativeLuminance
function relativeLuminance(r, g, b) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function applyColorVars() {
  const { r, g, b } = hsbToRgb(colorHue, 80, 100);
  const lum = relativeLuminance(r, g, b);
  // 遲滯（dead zone 0.45~0.55）：lum>0.55 明確淺底、<0.45 明確深底、中間維持上次 → 門檻附近不抖、對比穩定
  if (lum > 0.55) _lastIsLightBg = true;
  else if (lum < 0.45) _lastIsLightBg = false;
  else if (_lastIsLightBg === null) _lastIsLightBg = lum > 0.5;
  const isLightBg = _lastIsLightBg; // WCAG threshold（同 wireframe getContrastColor）+ 遲滯
  const fgRgb = isLightBg ? '0, 0, 0' : '255, 255, 255';
  const fgInverseRgb = isLightBg ? '255, 255, 255' : '0, 0, 0';
  const fgHex = isLightBg ? '#000000' : '#ffffff';
  const fgInverseHex = isLightBg ? '#ffffff' : '#000000';

  const root = document.documentElement;
  root.style.setProperty('--theme-bg', `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty('--theme-bg-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--theme-fg', fgHex);
  root.style.setProperty('--theme-fg-rgb', fgRgb);
  root.style.setProperty('--theme-fg-inverse', fgInverseHex);
  root.style.setProperty('--theme-fg-inverse-rgb', fgInverseRgb);
  root.style.setProperty('--theme-overlay-25', `rgba(${fgRgb}, 0.25)`);

  // 互補 hue（hue + 180°）：footer 用，跟 body bg 永遠互補
  // 對應的對比文字色獨立算（互補色亮度跟原色不同，可能在 luminance threshold 兩側）
  const compHue = (colorHue + 180) % 360;
  const { r: cr, g: cg, b: cb } = hsbToRgb(compHue, 80, 100);
  const cLum = relativeLuminance(cr, cg, cb);
  const cIsLightBg = cLum > 0.5;
  const cFgHex = cIsLightBg ? '#000000' : '#ffffff';
  const cFgInverseHex = cIsLightBg ? '#ffffff' : '#000000';
  root.style.setProperty('--theme-bg-contrast', `rgb(${cr}, ${cg}, ${cb})`);
  root.style.setProperty('--theme-bg-contrast-rgb', `${cr}, ${cg}, ${cb}`);
  root.style.setProperty('--theme-fg-contrast', cFgHex);
  // fg-contrast 的對比色（strict B/W）：footer 上的 chip 用 fg-contrast 當底時，文字用此維持純黑白對比
  root.style.setProperty('--theme-fg-inverse-contrast', cFgInverseHex);
  // Footer logo Lottie 是黑色版（SCCDLogoStandard.json）；亮 footer bg = 不翻、暗 footer bg = invert(1) 翻白
  root.style.setProperty('--footer-invert-filter', cIsLightBg ? 'none' : 'invert(1)');
  // .theme-invert（黑色靜態 SVG/PNG）對比翻色：page bg 亮時不 invert（保留黑），暗時 invert(1) 變白
  // 用 invert(0) 不用 none：invert(0) 同樣「不反轉」但是合法 filter 函式，可被 faculty placeholder hover 規則
  // 疊加成 `invert(0) invert(1)`（none 不能跟函式並列會讓整條 filter 無效）；視覺等同 none，既有 .theme-invert 不受影響。
  root.style.setProperty('--theme-invert-filter', isLightBg ? 'invert(0)' : 'invert(1)');
  // 中性灰浮層（card/chip 想在 vivid hue 上顯純灰不帶 hue tint）：對齊 mode1 #F0F0F0 / mode2 var(--gray-2)
  // 亮 hue → gray-9 (#E6E6E6 最淺灰)、暗 hue → gray-2 (#333333，跟 inverse 卡片底一致)
  root.style.setProperty('--theme-neutral-gray', isLightBg ? 'var(--gray-9)' : 'var(--gray-2)');
  // 反向中性灰：給「在 active list-content 等本地容器內」的元件用，本地容器 bg = theme-fg（亮頁=黑、暗頁=白），
  // ref/chip 在容器內要跟 theme-fg 同側才能襯托而非合體 → 亮 hue → gray-2 深灰、暗 hue → gray-9 淺灰
  root.style.setProperty('--theme-neutral-gray-inverse', isLightBg ? 'var(--gray-2)' : 'var(--gray-9)');

  // --lib-bg 兩階切換（mode3）：對齊 mode1/2 的固定灰值，依 page bg luminance 翻
  // 亮 page → #f2f2f2（同 mode1 standard）/ 暗 page → #333333（同 mode2 inverse）
  root.style.setProperty('--lib-bg', isLightBg ? '#f2f2f2' : '#333333');

  // Header logo（wireframe）對比翻色：wireframe-standard base 黑色，暗底套 invert(1) 變白
  // 直接比對 style.filter（cheap read）避免維護 lastIsLightBg 狀態 + 處理 logo async load 的 race
  const logo = document.getElementById('header-logo');
  if (logo) {
    if (logo.dataset.logoType === 'wireframe') {
      const desired = isLightBg ? 'none' : 'invert(1)';
      if (logo.style.filter !== desired) logo.style.filter = desired;
    } else if (logo.dataset.logoType === 'wireframe-inverse') {
      if (logo.style.filter !== 'none') logo.style.filter = 'none';
    }
  }

  const now = performance.now();
  if (now - lastThemeDispatch > 200) {
    lastThemeDispatch = now;
    window.dispatchEvent(new CustomEvent('theme:changed', {
      detail: { mode: 'color', bg: `rgb(${r}, ${g}, ${b})`, fg: fgHex, hue: colorHue },
    }));
  }
}

function colorTick() {
  colorHue = (colorHue + HUE_PER_FRAME) % 360;
  applyColorVars();
  colorRAF = requestAnimationFrame(colorTick);
}

function startColorLoop() {
  if (colorRAF || colorRAFStartTimer) return; // 已在跑或即將啟動（idempotent）
  applyColorVars(); // 先 sync set 一次：fade 期間 hue 凍結，避免 RAF retarget 干擾 ease 曲線
  // 延後 MODE_FADE_MS 才啟動 RAF：等 .mode-switching transition 跑完純 ease 曲線後再開始 hue 旋轉
  colorRAFStartTimer = setTimeout(() => {
    colorRAFStartTimer = null;
    if (colorRAF) return; // 已被啟動或又被取消
    colorRAF = requestAnimationFrame(colorTick);
  }, MODE_FADE_MS);
}

function cancelColorLoopRAF() {
  if (colorRAF) {
    cancelAnimationFrame(colorRAF);
    colorRAF = null;
  }
  if (colorRAFStartTimer) {
    clearTimeout(colorRAFStartTimer);
    colorRAFStartTimer = null;
  }
}

/**
 * 完整 stop：RAF 取消 + 清 inline CSS vars，讓 :root / body.mode-* 的 default CSS 規則重新生效。
 * 給 applyMode('standard'/'inverse') 用——使用者切離 mode-color 時要 reset 視覺。
 */
function stopColorLoop() {
  cancelColorLoopRAF();
  const root = document.documentElement;
  root.style.removeProperty('--theme-bg');
  root.style.removeProperty('--theme-bg-rgb');
  root.style.removeProperty('--theme-fg');
  root.style.removeProperty('--theme-fg-rgb');
  root.style.removeProperty('--theme-fg-inverse');
  root.style.removeProperty('--theme-fg-inverse-rgb');
  root.style.removeProperty('--theme-overlay-25');
  root.style.removeProperty('--theme-invert-filter');
  root.style.removeProperty('--theme-neutral-gray');
  root.style.removeProperty('--theme-neutral-gray-inverse');
  root.style.removeProperty('--lib-bg');
  root.style.removeProperty('--theme-bg-contrast');
  root.style.removeProperty('--theme-bg-contrast-rgb');
  root.style.removeProperty('--theme-fg-contrast');
  root.style.removeProperty('--theme-fg-inverse-contrast');
  root.style.removeProperty('--footer-invert-filter');
  // 清 wireframe logo 的 invert filter
  const logo = document.getElementById('header-logo');
  if (logo) logo.style.filter = '';
}

/**
 * Pause-only：取消 RAF 但保留 CSS vars 在當前值，hue 凍結。
 * 給 generate-app Pause btn 用——user 仍在 mode-color，期望畫面停在當前色不是回 default。
 * 若清掉 vars，body bg 失去 --theme-bg fallback 變白／預設色，跟 #create-app 不同色。
 */
function pauseColorLoop() {
  cancelColorLoopRAF();
}

function getCurrentPage() {
  const path = window.location.pathname;
  return path.split('/').pop().replace('.html', '') || 'index';
}

let isSlideInOpen = false;

function checkSlideInState() {
  // slide-in (faculty/courses): html.has-slide-in
  // 全螢幕 lightbox (activities/library-viewer): body.lightbox-open（lightbox-shell 加）
  // 兩者都讓 logo 翻 inverse 在暗底 overlay 上可見
  const hasSlideIn = document.documentElement.classList.contains('has-slide-in')
    || document.body.classList.contains('lightbox-open');

  if (isSlideInOpen !== hasSlideIn) {
    isSlideInOpen = hasSlideIn;
    const mode = getStoredMode();
    
    // overlay（slide-in / lightbox）開啟 → 一律用 wireframe 白色 logo（wireframe-inverse），統一三 mode 視覺；
    // 關閉 → 依 mode 還原（color=wireframe / inverse=inverse / standard=standard）
    let logoType;
    if (isSlideInOpen) logoType = 'wireframe-inverse';
    else if (mode === 'color') logoType = 'wireframe';
    else if (mode === 'inverse') logoType = 'inverse';
    else logoType = 'standard';

    // /create 頁是 typewriter logo，slide-in 狀態變化不該切回 Lottie（同 applyMode 的 guard）
    const _page = getCurrentPage();
    if (_page !== 'create' && _page !== 'generate' && document.getElementById('header-logo')) {
      switchHeaderLogo(logoType);
    }

        // 舊版 .theme-toggle-circle 圓點+圓邊框已拆掉（改 .icon mode_1/2/3）；
        // slide-in / lightbox 開時 icon 翻白由 CSS（html.has-slide-in .theme-toggle-btn { color:#fff }）handle，
        // .theme-toggle-btn 有 `transition: color var(--transition-fast)` 自動平滑變色，不需 gsap 手動 inline
  }
}

export function initThemeToggle() {
  applyModeForPage(getCurrentPage());

  // 自動監聽 Slide-in / Lightbox 的開關狀態來切換 Logo
  // html.has-slide-in (faculty/courses slide-in) + body.lightbox-open (activities/library lightbox)
  const observer = new MutationObserver(checkSlideInState);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // header 是非同步注入；ready 後綁 click 一次（後續 SPA 切頁不需重綁，listener 內部自己 check 頁面）
  document.addEventListener('header:ready', () => {
    bindToggleBtns();
    updateToggleBtnVisualState(getCurrentPage());
  });

  if (document.querySelector('.theme-toggle-btn')) {
    bindToggleBtns();
    updateToggleBtnVisualState(getCurrentPage());
  }
}

function bindToggleBtns() {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-toggle-btn')).forEach(btn => {
    if (btn.dataset.themeBound) return; // 防重複綁定
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      const current = sessionStorage.getItem(STORAGE_KEY) || 'standard';
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
      setSiteMode(next);
    });
  });
}

/** 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫 */
export function applyModeForPage(_page) {
  const savedMode = sessionStorage.getItem(STORAGE_KEY) || 'standard';
  applyMode(savedMode);
}

/** 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫
 *  /create 頁停用 header mode-btn（mode 改由頁內 colormode-button 控制）；其他頁恢復可點 */
let _lastUpdateTogglePage = null;
export function updateToggleBtnVisualState(page) {
  // 直接訪問 URL 是 'create'，SPA 內 routed page 名是 'generate'，兩個都要 catch
  const isGenerate = page === 'generate' || page === 'create';
  const wasGenerate = _lastUpdateTogglePage === 'generate' || _lastUpdateTogglePage === 'create';
  document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
    const el = /** @type {HTMLButtonElement} */ (btn);
    if (isGenerate) {
      el.disabled = true;
      el.style.pointerEvents = 'none';
      el.setAttribute('title', 'Mode 由下方 control bar 控制');
    } else {
      el.disabled = false;
      el.style.pointerEvents = '';
      el.removeAttribute('title');
    }
  });
  // Header desktop mode-btn clip-reveal 進退場：
  //   - 進 /create：hide（width 0 + clip 100%）→ 其他 bars 自然往右 shift 填補
  //   - 離 /create：show（width 24 + clip 0%）→ 其他 bars 往左 shift 回原位
  //   show 必須在新頁面 init 階段 fire（不是放 /create page-exit timeline 並行）— 否則 user 視線在
  //   /create 主內容退場時 show 動畫已跑完，新頁面渲染後看起來像「flash」一閃就出現沒過程
  if (isGenerate && !wasGenerate) {
    import('../../header.js').then(({ animateHeaderModeBtnHide }) => animateHeaderModeBtnHide());
  } else if (!isGenerate && wasGenerate) {
    // 若 playCreateExitAnimation 已並行跑 show 動畫（user 2026-05-31 對稱反向需求），
    // 這裡跳過避免重播；flag 由 create-app exit timeline set，用完即清
    if (window.__sccdModeBtnShowInExit) {
      window.__sccdModeBtnShowInExit = false;
    } else {
      import('../../header.js').then(({ animateHeaderModeBtnShow }) => animateHeaderModeBtnShow());
    }
  }
  _lastUpdateTogglePage = page;
}

/**
 * 給 generate-app classic scripts 用（透過 create-app.js bridge 到 window.sccdSetMode）：
 * 寫 sessionStorage + applyMode，等效於 user 點 header mode-btn 的 click handler 內容
 * @param {string} mode
 * @param {Object} [opts]
 * @param {boolean} [opts.autoStartColorLoop] 切到 'color' 時是否自動啟動 colorTick RAF；/create 內 colormode btn 預設 false（user 須手動點 Play），其他全域切換預設 true
 */
export function setSiteMode(mode, opts) {
  if (!MODES.includes(mode)) return;
  sessionStorage.setItem(STORAGE_KEY, mode);
  applyMode(mode, opts);
}

/** generate-app Play btn 啟動 site colorTick RAF（內部 idempotent） */
export function startSiteColorLoop() { startColorLoop(); }
/** generate-app Pause btn 停 site colorTick RAF（hue 凍結在當前值；保留 CSS vars 不切回 default） */
export function stopSiteColorLoop() { pauseColorLoop(); }
/** generate-app 判斷 Play 是否正在跑（更新 Play/Pause icon） */
export function isColorLoopRunning() { return colorRAF !== null; }

/**
 * user 拖 color wheel 時把選中的 hue 寫回 site
 * 否則 sketch.js draw() 每幀讀 site colorHue 會立刻把 drag 設的值覆蓋（drag 看起來無效）
 * Play 中：site colorTick 從新 hue 繼續轉；Pause 中：hue 停在新值
 * @param {number} hue
 */
export function setColorHue(hue) {
  const h = ((hue % 360) + 360) % 360;
  colorHue = h;
  // 若目前正處於 mode-color（colorRAF 跑或剛 stop），立刻 apply 一次 CSS var 讓 header / page bg 同步
  if (document.body.classList.contains('mode-color')) {
    applyColorVars();
  }
}

/**
 * @param {string} mode
 * @param {Object} [opts]
 * @param {boolean} [opts.autoStartColorLoop=true] 預設 true；/create 內 colormode btn 切到 color 傳 false
 */
function applyMode(mode, opts) {
  const autoStartColorLoop = !(opts && opts.autoStartColorLoop === false);
  const isFirstApply = !hasAppliedModeOnce;
  hasAppliedModeOnce = true;

  // SPA 切頁同 mode 重 apply：body class 不會變，body bg 不會變，不用動 transition
  // 用 lastAppliedMode 而非讀 body class：/create 會 remove body.mode-* (pause)，body class=null 會誤判換 mode
  const isSameMode = lastAppliedMode === mode;
  lastAppliedMode = mode;

  // 非首次 + 真的會切換 mode 才加 fade class
  // 首次 apply 跳過：避免從 default 白底 → 目標 mode 的閃爍
  if (!isFirstApply && !isSameMode) {
    document.body.classList.add('mode-switching');
    document.documentElement.classList.add('mode-switching');

    // 動態注入防抖動 CSS，只在 mode-switching 期間對旋轉元素開啟硬體加速，避免永久 will-change 破壞 z-index
    if (!antiJitterStyle) {
      antiJitterStyle = document.createElement('style');
      antiJitterStyle.textContent = `
        html.mode-switching.mode-switching .courses-grid-card,
        html.mode-switching.mode-switching .atlas-name,
        html.mode-switching.mode-switching .atlas-alumni-career,
        html.mode-switching.mode-switching .atlas-list-col-career,
        html.mode-switching.mode-switching .anchor-nav-inner,
        html.mode-switching.mode-switching .class-group-label,
        html.mode-switching.mode-switching .class-division-btn,
        html.mode-switching.mode-switching .courses-bfa-label,
        html.mode-switching.mode-switching .faculty-card-image-wrapper,
        html.mode-switching.mode-switching .hero-title-wrapper,
        html.mode-switching.mode-switching .hero-title-cn-wrapper,
        html.mode-switching.mode-switching .hero-text-en-wrapper,
        html.mode-switching.mode-switching .hero-text-cn-wrapper,
        html.mode-switching.mode-switching .hero-banner,
        html.mode-switching.mode-switching .color-rect-title,
        html.mode-switching.mode-switching .timeline-card-inner,
        html.mode-switching.mode-switching .lib-panel-title,
        html.mode-switching.mode-switching .album-thumb,
        html.mode-switching.mode-switching .class-img,
        html.mode-switching.mode-switching #prev-card,
        html.mode-switching.mode-switching #next-card,
        html.mode-switching.mode-switching #prev-labels h4,
        html.mode-switching.mode-switching #prev-labels h2,
        html.mode-switching.mode-switching #next-labels h4,
        html.mode-switching.mode-switching #next-labels h2,
        html.mode-switching.mode-switching #homepage-marquee-wrap,
        html.mode-switching.mode-switching #homepage-yt-card,
        html.mode-switching.mode-switching [data-hero-hl],
        html.mode-switching.mode-switching [data-section-title],
        html.mode-switching.mode-switching .section-title-strip,
        html.mode-switching.mode-switching img,
        html.mode-switching.mode-switching canvas {
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          -webkit-font-smoothing: subpixel-antialiased !important;
          transform-style: preserve-3d !important;
          -webkit-transform-style: preserve-3d !important;
          outline: 1px solid transparent !important;
          box-shadow: 0 0 1px rgba(0,0,0,0) !important;
          will-change: transform !important;
        }
      `;
      document.head.appendChild(antiJitterStyle);
    }

    if (modeSwitchTimer) clearTimeout(modeSwitchTimer);
    modeSwitchTimer = setTimeout(() => {
      document.body.classList.remove('mode-switching');
      document.documentElement.classList.remove('mode-switching');
      modeSwitchTimer = null;
    }, MODE_FADE_MS);
  }

  document.body.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.documentElement.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.body.classList.add(`mode-${mode}`);
  document.documentElement.classList.add(`mode-${mode}`);

  // Header mode btn icon: 跟 mode 切換同步換 mode_1/2/3 SVG（.icon mask 系統，currentColor 跟 .theme-toggle-btn 走）
  const MODE_TO_ICON_CLASS = { standard: 'icon-mode-1', inverse: 'icon-mode-2', color: 'icon-mode-3' };
  document.querySelectorAll('[data-header-mode-icon]').forEach(el => {
    el.className = `icon ${MODE_TO_ICON_CLASS[mode] || 'icon-mode-1'}`;
  });

  if (mode === 'color') {
    // autoStartColorLoop=false：/create 內 colormode btn 切到 color 時不自動啟動 RAF（user 須手動點 Play）。
    // 已在跑的 loop 不會被這裡 stop——/create 內切到 color 前若 loop 早就在跑（從外面進來時 applyModeForPage 啟動），
    // 維持 running 狀態（user paused 過會自己 stop）
    if (autoStartColorLoop) {
      startColorLoop(); // 內部 idempotent；SPA 切頁重呼 applyMode 不會多開
    } else {
      // 不啟動 RAF 但仍 sync 一次 CSS vars，否則 --theme-bg 為空 → header 失去 mode-color 色相回 default 白
      // /create page bg 由 sketch.js 用同一 colorHue 算 wireframeColor → header / page 自動同色
      applyColorVars();
    }
  } else {
    stopColorLoop();
  }

  // 通知需即時反應的元件（如 canvas 繪製）theme 已變動
  window.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode } }));

  // /create 頁有自己的 typewriter logo（由 header.js triggerGenerateLogo 注入），不要套 Lottie 蓋掉
  // 注意：getCurrentPage() 從 URL pathname 推出 'create'（不是 router 用的 logical 名稱 'generate'）
  // 兩種都 guard 以防後續任何路徑改名
  const _page = getCurrentPage();
  if (_page === 'create' || _page === 'generate') return;

  // overlay（slide-in / lightbox）開啟 → 一律 wireframe 白 logo（wireframe-inverse），統一三 mode；
  // 關閉 → 依 mode：color=wireframe（base 黑、暗底由 applyColorVars 套 filter:invert(1) 翻白）/ inverse / standard
  let logoType;
  if (isSlideInOpen) logoType = 'wireframe-inverse';
  else if (mode === 'color') logoType = 'wireframe';
  else if (mode === 'inverse') logoType = 'inverse';
  else logoType = 'standard';

  if (document.getElementById('header-logo')) {
    switchHeaderLogo(logoType);
  } else {
    document.addEventListener('header:ready', () => switchHeaderLogo(logoType), { once: true });
  }
}

/** Header logo 進場 reveal：左→右 clip-path inset 揭露 + 清 opacity
 *  /create exit anim 把 logo.style.opacity:0；下一頁需要顯示時跑這個。
 *  抽出 helper 因為「需要 reveal」的判斷點有兩處（doSwap 後 + skip path 後）。 */
function runHeaderLogoReveal(logo) {
  if (typeof gsap === 'undefined') {
    logo.style.opacity = '1';
    return;
  }
  logo.style.opacity = '1';
  gsap.fromTo(logo,
    { clipPath: 'inset(0% 100% 0% 0%)' },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: DUR.reveal,
      ease: EASE.enter,
      clearProps: 'clipPath',
    }
  );
}

// 每次 switchHeaderLogo 遞增；DOMLoaded callback 比對 generation，過期的 stale load 直接 ignore
// 防 race：lightbox 快速開→關時 switchHeaderLogo('inverse') 跟 ('standard') 連續觸發，
// 舊 'inverse' Lottie 的 JSON fetch 若慢於 'standard' 完成，DOMLoaded 後到的 SVG 會覆蓋掉新 'standard' SVG。
let logoLoadGeneration = 0;

export function switchHeaderLogo(type) {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof lottie === 'undefined') return;

  // 不管 doSwap 走哪條路，都先記下「是否需要 reveal」— 從 /create 退場時 exit anim 把 logo.opacity 設為 0
  // ⚠️ Recovery 機制：若 user 在 /create typewriter 沒跑完就切頁，Lottie 還留在 logo 內 + dataset.logoType
  //    沒被 typewriter 改 → 下面 skip 條件成立 → 不跑 DOMLoaded → opacity:0 永遠卡住 → 下一頁 logo 不見
  //    所以無論走 skip 還是 doSwap，需要 reveal 時都要主動跑 helper
  const prevOpacity = parseFloat(logo.style.opacity);
  const needsReveal = !isNaN(prevOpacity) && prevOpacity < 0.5;

  // 已是相同 type 的 Lottie 在運行 → skip 大件事，但 opacity:0 仍要救
  if (logo.dataset.logoType === type && logo.querySelector('svg')) {
    if (needsReveal) runHeaderLogoReveal(logo);
    return;
  }

  // Frame 同步：destroy 前抓正在跑的 logo 當前 frame，新 logo 接同一 frame 繼續轉。
  // 三個會 swap 的 logo JSON（Standard/WireframeStandard/WireframeInverse）時間軸完全相同
  // （ip:0 / op:3600 / fr:60），frame number 1:1 對應同一旋轉角度；不接的話新 anim 從 frame 0
  // 重起 → 環的旋轉角度 snap 回起點看起來「jump」（viewer 開/關切 wireframe 時最明顯）。
  let resumeFrame = 0;
  if (typeof lottie.getRegisteredAnimations === 'function') {
    const prevAnim = lottie.getRegisteredAnimations().find((a) => a.name === 'header-logo-anim');
    if (prevAnim) resumeFrame = prevAnim.currentFrame || 0;
  }

  // doSwap：destroy 舊 Lottie + 載新 Lottie；DOMLoaded 後依 needsReveal 決定要不要 reveal
  const myGeneration = ++logoLoadGeneration;
  lottie.destroy('header-logo-anim');
  logo.innerHTML = '';
  logo.dataset.logoType = type;

  const isInPages = window.location.pathname.includes('/pages/');
  const basePath = isInPages ? '/data/' : 'data/';
  let file;
  if (type === 'wireframe') file = 'SCCDLogoWireframeStandard.json';
  else if (type === 'wireframe-inverse') file = 'SCCDLogoWireframeInverse.json';
  else if (type === 'inverse') file = 'SCCDLogoInverse.json';
  else file = 'SCCDLogoStandard.json';

  const anim = lottie.loadAnimation({
    container: logo,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    name: 'header-logo-anim',
    path: basePath + file,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });

  anim.addEventListener('DOMLoaded', () => {
    // Stale load guard：若 generation 對不上，這次 DOMLoaded 是被 supersede 的舊請求 — 直接 return
    // 不要 destroy 因為 lottie.destroy 會把這支 anim 的 SVG 從 container 拿走，而 newer load 可能
    // 還沒 inject 它的 SVG，會留下空 container；新 load 自己會處理自己的 lifecycle
    if (myGeneration !== logoLoadGeneration) return;
    const svg = logo.querySelector('svg');
    if (svg) {
      svg.style.overflow = 'visible';
      svg.setAttribute('viewBox', '0 0 1080 1080');
    }
    // 防 autoplay 在 race 情境下未真正啟動（symptom：Lottie 卡 frame 0 看不到 central circle）
    if (typeof anim.play === 'function' && anim.isPaused) anim.play();
    // Frame 同步（見上方 resumeFrame）：接上 destroy 前那支 logo 的旋轉角度繼續轉，消除 swap 的 jump。
    // 在 DOMLoaded 同步設定，趕在首次 paint 前，不會閃 frame 0。
    if (resumeFrame > 0 && typeof anim.goToAndPlay === 'function') anim.goToAndPlay(resumeFrame, true);
    // **不能用 gsap.killTweensOf(logo)**：會把 header.js 的 scroll-shrink ScrollTrigger
    // (180→100 scrub) 一起殺掉，logo 卡在 180 永遠不收縮
    if (needsReveal) runHeaderLogoReveal(logo);
    else logo.style.opacity = '1';
  });
}

// 對 main-modular.js 暴露：進入 /create 時讀當前 site mode + colorHue，帶進 iframe URL params
// 讓 generate-app 承襲 site 的 mode（不重置成 Standard）；mode-color 時還帶當前 hue 讓色環接續 site 的 hue 直接 Play
export function getStoredMode() {
  return sessionStorage.getItem(STORAGE_KEY) || 'standard';
}
export function getColorHue() {
  return colorHue;
}
