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
 */

const MODES = ['standard', 'inverse', 'color'];
const STORAGE_KEY = 'sccd-theme-mode';

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

  // /generate 頁有自己的 typewriter logo，不要套 Lottie 蓋掉
  if (getCurrentPage() === 'generate') return;

  const logoType = mode === 'inverse' ? 'inverse' : 'standard';
  if (document.getElementById('header-logo')) {
    switchHeaderLogo(logoType);
  } else {
    document.addEventListener('header:ready', () => switchHeaderLogo(logoType), { once: true });
  }
}

function switchHeaderLogo(type) {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof lottie === 'undefined') return;

  lottie.destroy('header-logo-anim');
  logo.innerHTML = '';

  const isInPages = window.location.pathname.includes('/pages/');
  const basePath = isInPages ? '/data/' : 'data/';
  const file = type === 'inverse' ? 'SCCDLogoInverse.json' : 'SCCDLogoStandard.json';

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
