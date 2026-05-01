/**
 * Generate Header Sync
 * 接收 generate-app iframe 的 mode postMessage，同步 header 底色 / about bar / mode-btn / typewriter logo 顏色
 *
 * 設計考量：
 * - SPA 路由只替換 <main>，generate.html 裡的 inline <script> 在 SPA 導航時不會重跑，
 *   所以這層邏輯必須由 main-modular.js 在 page === 'generate' 時呼叫一次
 * - 重複呼叫 init 會先移除舊 listener，避免多重綁定
 */

let messageHandler = null;
let logoObserver = null;
let pendingGenMode = null;
let barMouseleaveHandlers = [];  // { el, fn } 對 about/library/generate 三條 bar 的 mouseleave reapply

// 跟 iframe body transition 對齊：
// - 預設 1s ease（generate-app/style.css:110 body transition）
// - postMessage 帶 instant:true 時改 0s（拖色環 / Play 模式旋轉，iframe 自己也是 transition:none）
// 用 let，每次 applyGenModeToHeader 入口依 message 的 instant flag 重設
let FADE = '1s ease';

// 判斷 iframe 算好的 text 對比色是否為「白字」（= header bg 是深色）
// 直接看 text 而非自己重算 bg luminance，避免跟 generate-app 的 getContrastColor (WCAG luminance > 0.5) 判定不一致
// text 永遠是純黑或純白：'#000000' / '#ffffff' / 'rgb(0, 0, 0)' / 'rgb(255, 255, 255)'
function isWhiteText(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.startsWith('#')) {
    let hex = text.slice(1);
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    return parseInt(hex.slice(0, 2), 16) > 128;
  }
  if (text.startsWith('rgb')) {
    const m = text.match(/\d+/g);
    return m ? Number(m[0]) > 128 : false;
  }
  return false;
}

// 計算單一 bar 在當前 mode 該用的 pill bg/text
// 規則（user 指定）：依 iframe text 是黑字還是白字決定，跟 iframe 的對比色判斷對齊
// - iframe text=黑（→ header 是亮色：Standard / 亮色 wireframe）→ inactive=白 pill 黑字、active=黑 pill 白字
// - iframe text=白（→ header 是暗色：Inverse / 暗色 wireframe）→ inactive=黑 pill 白字、active=白 pill 黑字
// 必須顯式設值不能用空字串清空 inline，否則 library/generate bar 的 `class="bg-black"` 會浮上來
function computeBarColors(text, isActive) {
  const headerIsDark = isWhiteText(text); // 白字 → header 暗
  if (headerIsDark) {
    return isActive
      ? { barBg: '#fff', barText: '#000' }  // active = white pill 黑字 (contrast)
      : { barBg: '#000', barText: '#fff' }; // inactive = black pill 白字 (blend)
  }
  return isActive
    ? { barBg: '#000', barText: '#fff' }  // active = black pill 白字 (contrast)
    : { barBg: '#fff', barText: '#000' }; // inactive = white pill 黑字 (blend)
}

// 套到三條 bar；library/generate 有 .bar-active/.bar-inactive .nav-link { color !important } 規則，
// 必須用 setProperty(..., 'important') 才能蓋過；about bar 沒 !important 但用一樣寫法也 OK
//
// transition 速度刻意「不跟 header bg 同步」：
// - 其他頁面 about bar / library bar / generate bar 都是 inline `transition: background 0.4s ease`（hover 反應要快）
// - 我們也用 0.4s ease 跟其他頁一致；mode switch 雖然 desync header bg 1s 一點點但 bars 0.4s 比較貼近 hover 反應該有的速度
// - Play 模式（FADE='0s'）整個 instant
function paintBars(header, text) {
  const barFade = FADE === '0s' ? '0s' : '0.4s ease';
  const bars = [
    header.querySelector('[data-bar="about"]'),
    header.querySelector('[data-bar="library"]'),
    header.querySelector('[data-bar="generate"]'),
  ].filter(Boolean);

  bars.forEach(bar => {
    const isActive = bar.classList.contains('bar-active');
    const { barBg, barText } = computeBarColors(text, isActive);

    bar.style.transition = `background-color ${barFade}`;
    bar.style.backgroundColor = barBg;
    bar.querySelectorAll('a, span, i').forEach(el => {
      el.style.transition = `color ${barFade}`;
      if (barText) {
        el.style.setProperty('color', barText, 'important');
      } else {
        el.style.removeProperty('color');
      }
    });
  });
}

function applyGenModeToHeader({ genMode, bg, text, instant }) {
  const header = document.querySelector('header');
  if (!header) return;

  // 依當前 message 是否為 instant（拖色環 / Play 旋轉），決定 transition 速度
  // 整條 module 都讀 FADE，set 一次後 paintBars / mode-btn / logo 都會用同樣值
  FADE = instant ? '0s' : '1s ease';

  // header 整條背景 = match iframe（OG 邏輯，user confirm 是對的）
  header.style.transition = `background-color ${FADE}`;
  header.style.backgroundColor = bg;

  // about/library/generate bar：依 iframe text（對比色）二分
  paintBars(header, text);

  // mode btn (圓圈 toggle)：邊框 + 圓點用對比色（iframe text）
  const modeBtn = header.querySelector('#mode-btn');
  if (modeBtn) {
    const toggleBtn    = modeBtn.querySelector('.theme-toggle-btn');
    const toggleCircle = modeBtn.querySelector('.theme-toggle-circle');
    if (toggleBtn) {
      toggleBtn.style.transition = `border-color ${FADE}`;
      toggleBtn.style.borderColor = text;
    }
    if (toggleCircle) {
      toggleCircle.style.transition = `background-color ${FADE}`;
      toggleCircle.style.background = text;
    }
  }

  // typewriter logo path fill + cursor bg = iframe text（黑底白 logo / 白底黑 logo）
  const logoEl = document.getElementById('header-logo');
  const logoContainer = logoEl ? logoEl.parentNode : null;
  if (logoContainer) {
    logoContainer.querySelectorAll('#gen-logo-svg path').forEach(p => {
      p.style.transition = `fill ${FADE}`;
      p.setAttribute('fill', text);
    });
    logoContainer.querySelectorAll('[data-gen-cursor]').forEach(c => {
      c.style.transition = `background-color ${FADE}`;
      c.style.background = text;
    });
  }
}

export function initGenerateHeaderSync() {
  // 重複呼叫先清掉舊的，避免多重 listener
  cleanupGenerateHeaderSync();

  pendingGenMode = null;

  messageHandler = (e) => {
    if (!e || !e.data || !e.data.genMode) return;
    pendingGenMode = e.data;
    applyGenModeToHeader(e.data);
  };
  window.addEventListener('message', messageHandler);

  // header 是非同步注入的；header:ready 後補套 + 啟動 logo MutationObserver
  // typewriter path/cursor 是後續才被加進 DOM，需在它們出現時補套顏色
  const onHeaderReady = () => {
    if (pendingGenMode) applyGenModeToHeader(pendingGenMode);
    const header = document.querySelector('header');

    // 三條 bar 的既有 hover handler 都會在 mouseleave 時把 bg 重設（about='', library/generate='#000'/'#fff' 依 active 狀態），
    // 會把我們 wireframe 套的 pill 顏色清掉。掛後援 listener 在原 handler 之後再跑，重新 paintBars()
    // （addEventListener 按註冊順序執行：原 handler 先跑 → 我們後跑 → 淨效果是 reapply）
    const barEls = header ? [
      header.querySelector('[data-bar="about"]'),
      header.querySelector('[data-bar="library"]'),
      header.querySelector('[data-bar="generate"]'),
    ].filter(Boolean) : [];
    barEls.forEach(bar => {
      const fn = () => {
        if (!pendingGenMode) return;
        paintBars(header, pendingGenMode.text);
      };
      bar.addEventListener('mouseleave', fn);
      barMouseleaveHandlers.push({ el: bar, fn });
    });

    const logoEl = document.getElementById('header-logo');
    const logoContainer = logoEl ? logoEl.parentNode : null;
    if (!logoContainer) return;
    logoObserver = new MutationObserver(() => {
      if (pendingGenMode) applyGenModeToHeader(pendingGenMode);
    });
    logoObserver.observe(logoContainer, { childList: true, subtree: true });
  };

  // 已存在 header 直接執行；否則等 header:ready
  if (document.querySelector('header')) {
    onHeaderReady();
  } else {
    document.addEventListener('header:ready', onHeaderReady, { once: true });
  }
}

export function cleanupGenerateHeaderSync() {
  // 沒綁定過直接 return，避免每次切頁都動到 header
  if (!messageHandler && !logoObserver && barMouseleaveHandlers.length === 0) return;

  if (messageHandler) {
    window.removeEventListener('message', messageHandler);
    messageHandler = null;
  }
  if (logoObserver) {
    logoObserver.disconnect();
    logoObserver = null;
  }
  barMouseleaveHandlers.forEach(({ el, fn }) => el.removeEventListener('mouseleave', fn));
  barMouseleaveHandlers = [];
  pendingGenMode = null;

  // 還原 header 為預設外觀（避免切到別頁仍殘留）
  // 同時清除 transition，避免換頁時 header 還跑 1s fade
  const header = document.querySelector('header');
  if (!header) return;
  header.style.transition = '';
  header.style.backgroundColor = '';
  // 清除 about/library/generate 三條 bar 的 inline overrides，讓 CSS bar-active/inactive + setSideBar 接管
  ['about', 'library', 'generate'].forEach(name => {
    const bar = header.querySelector(`[data-bar="${name}"]`);
    if (!bar) return;
    bar.style.transition = '';
    bar.style.backgroundColor = '';
    bar.querySelectorAll('a, span, i').forEach(el => {
      el.style.transition = '';
      el.style.removeProperty('color');
    });
  });
  const modeBtn = header.querySelector('#mode-btn');
  if (modeBtn) {
    const toggleBtn = modeBtn.querySelector('.theme-toggle-btn');
    const toggleCircle = modeBtn.querySelector('.theme-toggle-circle');
    if (toggleBtn) {
      toggleBtn.style.transition = '';
      toggleBtn.style.borderColor = '';
    }
    if (toggleCircle) {
      toggleCircle.style.transition = '';
      toggleCircle.style.background = '';
    }
  }
  // typewriter logo 的 path/cursor 通常會被 restoreHeaderLogo 整個移除，但保險起見也清 transition
  const logoEl = document.getElementById('header-logo');
  const logoContainer = logoEl ? logoEl.parentNode : null;
  if (logoContainer) {
    logoContainer.querySelectorAll('#gen-logo-svg path').forEach(p => { p.style.transition = ''; });
    logoContainer.querySelectorAll('[data-gen-cursor]').forEach(c => { c.style.transition = ''; });
  }
}
