/**
 * Theme Toggle Module
 * 切換 standard / inverse / color 模式
 * 同一 session 內跨頁保持，新開視窗/分頁重置為 standard
 */

const MODES = ['standard', 'inverse', 'color'];
const STORAGE_KEY = 'sccd-theme-mode';

export function initThemeToggle() {
  const savedMode = sessionStorage.getItem(STORAGE_KEY) || 'standard';
  applyMode(savedMode);

  // header 是非同步注入的，等 header:ready 事件再綁定按鈕
  document.addEventListener('header:ready', bindToggleBtns);

  // 若 header 已存在（無 #site-header 的頁面），直接綁定
  if (document.querySelector('.theme-toggle-btn')) {
    bindToggleBtns();
  }
}

function bindToggleBtns() {
  const isGenPage = window.location.pathname.includes('generate.html');
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    if (isGenPage) {
      btn.style.opacity = '0.3';
      btn.style.pointerEvents = 'none';
      btn.title = 'Mode 由 Generate 控制';
      return;
    }
    btn.addEventListener('click', () => {
      const current = sessionStorage.getItem(STORAGE_KEY) || 'standard';
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
      sessionStorage.setItem(STORAGE_KEY, next);
      applyMode(next);
    });
  });
}

function applyMode(mode) {
  document.body.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.body.classList.add(`mode-${mode}`);

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
  const basePath = isInPages ? '../data/' : 'data/';
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
