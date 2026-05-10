/**
 * Theme Toggle Module
 * 切換 standard / inverse / color 模式（影響整個網站的 body class）
 *
 * 整合策略：
 * - mode 存 sessionStorage，跨頁保持，新開視窗/分頁重置為 standard
 * - /generate 頁「暫停」mode：移除 body class（讓 generate iframe + generate-header-sync 完全控制視覺），
 *   sessionStorage 保留原 mode；離開 /generate 時自動恢復
 * - 按鈕在 /generate 頁顯示為 disabled 狀態（opacity + pointer-events）；其他頁正常可點
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

/* ===== mode-color: random hue loop ===== */
let colorRAF = null;
let colorHue = Math.random() * 360;
let lastThemeDispatch = 0;
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
  const isLightBg = lum > 0.5; // WCAG threshold（同 wireframe getContrastColor）
  const fgRgb = isLightBg ? '0, 0, 0' : '255, 255, 255';
  const fgHex = isLightBg ? '#000000' : '#ffffff';

  const root = document.documentElement;
  root.style.setProperty('--theme-bg', `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty('--theme-bg-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--theme-fg', fgHex);
  root.style.setProperty('--theme-fg-rgb', fgRgb);
  root.style.setProperty('--theme-overlay-25', `rgba(${fgRgb}, 0.25)`);

  // Header logo（wireframe）對比翻色：wireframe-standard base 黑色，暗底套 invert(1) 變白
  // 直接比對 style.filter（cheap read）避免維護 lastIsLightBg 狀態 + 處理 logo async load 的 race
  const logo = document.getElementById('header-logo');
  if (logo && logo.dataset.logoType === 'wireframe') {
    const desired = isLightBg ? 'none' : 'invert(1)';
    if (logo.style.filter !== desired) logo.style.filter = desired;
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
  if (colorRAF) return; // 已在跑（idempotent）
  applyColorVars(); // 先 sync set 一次，避免第一幀 RAF 16ms 延遲讓 body bg 閃白
  colorRAF = requestAnimationFrame(colorTick);
}

function stopColorLoop() {
  if (colorRAF) {
    cancelAnimationFrame(colorRAF);
    colorRAF = null;
  }
  // 清 inline var，讓 :root / body.mode-* 的 CSS 規則重新生效
  const root = document.documentElement;
  root.style.removeProperty('--theme-bg');
  root.style.removeProperty('--theme-bg-rgb');
  root.style.removeProperty('--theme-fg');
  root.style.removeProperty('--theme-fg-rgb');
  root.style.removeProperty('--theme-overlay-25');
  // 清 wireframe logo 的 invert filter
  const logo = document.getElementById('header-logo');
  if (logo) logo.style.filter = '';
}

function getCurrentPage() {
  const path = window.location.pathname;
  return path.split('/').pop().replace('.html', '') || 'index';
}

export function initThemeToggle() {
  applyModeForPage(getCurrentPage());

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
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    if (btn.dataset.themeBound) return; // 防重複綁定
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      // /generate 頁的視覺 disabled 已用 pointer-events:none 擋掉，這裡再 check 一次保險
      if (getCurrentPage() === 'generate') return;
      const current = sessionStorage.getItem(STORAGE_KEY) || 'standard';
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
      sessionStorage.setItem(STORAGE_KEY, next);
      applyMode(next);
    });
  });
}

/**
 * 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫
 * /generate 暫停 mode，其他頁恢復 sessionStorage 的 mode
 */
export function applyModeForPage(page) {
  if (page === 'generate') {
    // 暫停：清除 body mode class（sessionStorage 保留，離開時恢復）
    document.body.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
    stopColorLoop();
    return;
  }
  const savedMode = sessionStorage.getItem(STORAGE_KEY) || 'standard';
  applyMode(savedMode);
}

/**
 * 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫
 * /generate 頁按鈕視為 disabled
 */
export function updateToggleBtnVisualState(page) {
  const isGenPage = page === 'generate';
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.style.opacity = isGenPage ? '0.3' : '';
    btn.style.pointerEvents = isGenPage ? 'none' : '';
    // 不設 title：user 不要 hover 顯示原生 tooltip
    btn.removeAttribute('title');
  });
}

function applyMode(mode) {
  document.body.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.body.classList.add(`mode-${mode}`);

  if (mode === 'color') {
    startColorLoop(); // 內部 idempotent；SPA 切頁重呼 applyMode 不會多開
  } else {
    stopColorLoop();
  }

  // 通知需即時反應的元件（如 canvas 繪製）theme 已變動
  window.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode } }));

  // /generate 頁有自己的 typewriter logo，不要套 Lottie 蓋掉
  if (getCurrentPage() === 'generate') return;

  // mode-color 用 wireframe logo（base 黑色），暗底 hue 由 applyColorVars 套 filter:invert(1) 翻白
  let logoType;
  if (mode === 'color') logoType = 'wireframe';
  else if (mode === 'inverse') logoType = 'inverse';
  else logoType = 'standard';

  if (document.getElementById('header-logo')) {
    switchHeaderLogo(logoType);
  } else {
    document.addEventListener('header:ready', () => switchHeaderLogo(logoType), { once: true });
  }
}

function switchHeaderLogo(type) {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof lottie === 'undefined') return;

  // 已是相同 type 的 Lottie 在運行 → skip，避免每次 SPA 換頁 destroy + reload 造成旋轉跳回 0°
  if (logo.dataset.logoType === type && logo.querySelector('svg')) return;

  lottie.destroy('header-logo-anim');
  logo.innerHTML = '';
  logo.dataset.logoType = type;

  const isInPages = window.location.pathname.includes('/pages/');
  const basePath = isInPages ? '/data/' : 'data/';
  let file;
  if (type === 'wireframe') file = 'SCCDLogoWireframeStandard.json';
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
    const svg = logo.querySelector('svg');
    if (svg) {
      svg.style.overflow = 'visible';
      svg.setAttribute('viewBox', '0 0 1080 1080');
    }
  });
}
