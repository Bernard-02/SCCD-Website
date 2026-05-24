/**
 * Header Module
 * 處理導航列、手機選單、Logo 動畫與滾動隱藏
 */

import { initMobileMenu } from './mobile-menu.js';
import { animateHeaderHide, animateHeaderShow, getHeaderTargets } from './modules/lightbox/lightbox-shell.js';

// Footer-near hide state（module-scope 讓 updateNavActive 能在 SPA 換頁時同步 reset）：
// scroll listener 內 closure 變數會跨換頁存活，但 updateNavActive 拿不到 → 提升到 module scope
let barsHidden = false;
function getFooterHideTargets() {
  const logoAnchor = document.getElementById('header-logo')?.parentElement;
  return [...getHeaderTargets(), logoAnchor].filter(Boolean);
}

// lightbox / PDF viewer 開啟時要把 footer-near hide state 清零，否則 bars 仍卡 clip-path
// （body lock scroll 期間 scroll listener 不 fire → barsHidden 殘留 true）
// activities 頁可 scroll 才會中招，library 是 h-screen overflow-hidden 不會
// 暴露給 window 讓 lightbox-shell.enterLightboxMode 自動 call（解耦避免循環依賴）
export function resetFooterHide() {
  if (!barsHidden) return;
  if (typeof gsap !== 'undefined') {
    const targets = getFooterHideTargets();
    gsap.killTweensOf(targets);
    targets.forEach(el => { el.style.clipPath = ''; });
  }
  barsHidden = false;
}
if (typeof window !== 'undefined') {
  window.__sccdResetFooterHide = resetFooterHide;
}

/**
 * Typewriter SCCD 排版常數：每個字母「右邊緣」x 座標（PATHs 內 SVG viewBox 座標）+ scale 倍率。
 * triggerGenerateLogo 跟 /create 退場動畫的反向 typewriter 共用，必須對齊；export 出去避免硬編兩份。
 */
export const GEN_LOGO_LAYOUT = {
  LETTER_X: [230, 545, 855, 1135],
  SCALE: 205 / 1135,
  GAP: 6,
  SVG_TOP: 16,
};

// Typewriter timeline reference：供 restoreHeaderLogo 在 SPA 換頁時 kill
// 用戶在 destroy step（line ~79：lottie.destroy + logo.innerHTML=''）之前離開 /create，
// 若不 kill timeline 會在新頁面繼續觸發 destroy → Lottie 被砸 + switchHeaderLogo 已 skip 不會重建
let genLogoTimeline = null;

// blink interval ref 拉到 module-scope，讓 killGenerateLogoTimeline 也能清掉。
// 之前 blinkInterval 是 triggerGenerateLogo 內 local closure，timeline 被 kill 時 setInterval
// 還是持續修改 cursor.style.visibility — 對 detached cursor 沒視覺影響但會跟退場 anim 的
// cursor visibility/opacity 寫入競爭。共用單一 ref 因為 typewriter 序列上同時只有一個 cursor blink
let genBlinkInterval = null;

function clearGenBlink() {
  if (genBlinkInterval) {
    clearInterval(genBlinkInterval);
    genBlinkInterval = null;
  }
}

/**
 * /create 退場動畫起手要 kill timeline，避免 typewriter 的 .set(pathEls[i], {opacity:1}) 在
 * 退場 anim 跑 paths.opacity:0 時又把 opacity 拉回 1 形成閃爍。
 * 同時清 blink interval，避免 cursor 持續被 setInterval 翻 visibility 干擾退場 anim 的 cursor 操作。
 */
export function killGenerateLogoTimeline() {
  if (genLogoTimeline) {
    genLogoTimeline.kill();
    genLogoTimeline = null;
  }
  clearGenBlink();
}

// ── Generate Logo Typewriter 動畫（SPA 換頁時呼叫）────────────
export function triggerGenerateLogo() {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof gsap === 'undefined') return;

  // 重複觸發或上一輪殘留 → kill 再重來
  if (genLogoTimeline) {
    genLogoTimeline.kill();
    genLogoTimeline = null;
  }

  // 清除舊的 typewriter SVG/cursor（避免重複觸發疊加），但**不**動 Lottie
  // 原本在這裡就 destroy Lottie + 清 innerHTML → Lottie 完全沒機會被使用者看到
  // 改成 Lottie 保留，由 timeline 在 cursor 從右往左跳的瞬間才 destroy（視覺上像 indicator 把它刪掉）
  const logoContainer = logo.parentNode;
  logoContainer.querySelectorAll('#gen-logo-svg, [data-gen-cursor]').forEach(el => el.remove());
  logo.style.display = '';
  // 防禦：清掉 /create 退場動畫殘留的 inline style（opacity:0 + clip-path on parent <a>）
  // 若 user 在 switchHeaderLogo entry reveal 完成前就再進 /create，殘留 opacity:0 會讓
  // Lottie 在 2s typewriter delay 內 invisible
  logo.style.opacity = '';
  logo.style.clipPath = '';
  // 殺掉 switchHeaderLogo runHeaderLogoReveal 留下的 clipPath tween（前一頁 reveal 還沒跑完就進 /create）
  // 限定 'clipPath' property 避免誤殺 header.js scroll-shrink ScrollTrigger（綁 width/height）
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(logo, 'clipPath');
  }
  if (logoContainer && /** @type {HTMLElement} */ (logoContainer).style) {
    /** @type {HTMLElement} */ (logoContainer).style.clipPath = '';
    // 上一輪 typewriter 完成時撐過 click target（見 timeline 尾段 set），重進 /create 要先清，
    // 否則 shrink 階段視覺只見 100x100 Lottie 但 <a> 還是 220x80 → user 在 Lottie 右側空白處點也會 nav
    /** @type {HTMLElement} */ (logoContainer).style.width = '';
    /** @type {HTMLElement} */ (logoContainer).style.height = '';
  }

  // currentColor 讓 fill / background 跟著 body.mode-* 設的 color 動態走（mode 切換時自動更新）
  const fillColor = 'currentColor';

  // 進場敘事：Lottie ring 先 shrink 到 100x100（如果還是 180）→ indicator cursor 出現在
  // shrunk Lottie 右邊 → 短閃 → 摧毀 Lottie → cursor 跳左、type 出 SCCD
  // 所以右側 cursor 的 left/height 對齊 100-size Lottie 而非原本 180-size
  const SHRUNK_SIZE = 100;
  const currentLogoSize = logo.offsetWidth || 180;
  const needsShrink = currentLogoSize > SHRUNK_SIZE + 10;

  const cursor = document.createElement('div');
  cursor.dataset.genCursor = '1';
  cursor.dataset.genCursorRole = 'indicator';
  cursor.style.cssText = `position:absolute;top:8px;left:${SHRUNK_SIZE}px;width:1px;height:${SHRUNK_SIZE + 16}px;background:${fillColor};z-index:10;visibility:hidden;`;
  logoContainer.appendChild(cursor);

  // blink interval ref 上提到 module-scope（genBlinkInterval），讓 killGenerateLogoTimeline
  // 也能清；之前 local var SetInterval timeline kill 後仍持續跑修改 cursor.visibility
  function startBlink(el) {
    clearGenBlink();
    el.style.visibility = 'visible';
    genBlinkInterval = setInterval(() => {
      el.style.visibility = el.style.visibility === 'hidden' ? 'visible' : 'hidden';
    }, 530);
  }
  function stopBlink(el) {
    clearGenBlink();
    el.style.visibility = 'visible';
  }

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.id = 'gen-logo-svg';
  svgEl.setAttribute('viewBox', '0 0 1135 320');
  svgEl.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svgEl.style.cssText = 'height:205px;width:205px;position:absolute;top:16px;left:0;overflow:visible;pointer-events:none;z-index:1;';

  const PATHS = [
    'M120.05,320c-37.17,0-66.48-9.4-87.91-28.19C10.72,273.01,0,247.25,0,214.51h46.19c.14,20.39,6.69,36.34,19.66,47.85,12.97,11.52,31.03,17.27,54.2,17.27,21.08,0,37.97-4.47,50.66-13.42,12.69-8.95,19.04-20.98,19.04-36.1,0-11.93-4.54-21.6-13.63-29.02-9.09-7.42-24.38-13.7-45.88-18.83l-33.91-8.11c-31.35-7.49-54.2-17.93-68.56-31.31-14.36-13.38-21.53-30.83-21.53-52.33,0-18.17,4.58-34.05,13.73-47.65,9.15-13.59,22.02-24.14,38.6-31.63C75.14,3.75,94.53,0,116.72,0c33.43,0,60.03,8.74,79.79,26.22,19.77,17.48,30.13,41.34,31.11,71.57h-44.73c-1.11-17.89-7.63-31.94-19.56-42.13-11.93-10.19-27.67-15.29-47.23-15.29s-34.05,4.47-45.98,13.42c-11.93,8.95-17.89,20.43-17.89,34.43,0,11.24,4.58,20.36,13.73,27.36,9.15,7.01,24.34,13.08,45.57,18.21l33.5,7.91c31.07,7.35,53.99,17.96,68.76,31.83,14.77,13.87,22.16,31.91,22.16,54.1,0,18.59-4.79,34.82-14.36,48.69-9.57,13.87-23.03,24.62-40.36,32.25-17.34,7.63-37.73,11.44-61.17,11.44Z',
    'M413,320c-28.44,0-53.54-6.73-75.32-20.18-21.78-13.45-38.77-32.18-50.98-56.18-12.21-24-18.31-51.81-18.31-83.43s6.1-59.85,18.31-83.85c12.2-24,29.16-42.72,50.87-56.18C359.29,6.73,384.43,0,413,0c22.61,0,43.1,4.44,61.48,13.32,18.38,8.88,33.6,21.4,45.67,37.56,12.07,16.16,19.9,35.27,23.51,57.32h-47.02c-4.58-21.08-14.32-37.35-29.23-48.79-14.91-11.44-32.91-17.17-53.99-17.17s-37.94,4.93-52.64,14.77c-14.7,9.85-26.04,23.65-34.02,41.4-7.98,17.76-11.96,38.35-11.96,61.79s3.95,43.97,11.86,61.59c7.91,17.62,19.25,31.35,34.02,41.2,14.77,9.85,32.35,14.77,52.74,14.77s38.87-5.69,53.78-17.06c14.91-11.37,24.79-27.53,29.65-48.48h46.81c-3.61,21.92-11.44,40.96-23.51,57.11-12.07,16.16-27.29,28.64-45.67,37.45-18.38,8.81-38.88,13.21-61.48,13.21Z',
    'M721.35,320c-28.44,0-53.54-6.73-75.32-20.18-21.78-13.45-38.77-32.18-50.98-56.18-12.21-24-18.31-51.81-18.31-83.43s6.1-59.85,18.31-83.85c12.2-24,29.16-42.72,50.87-56.18,21.71-13.45,46.85-20.18,75.42-20.18,22.61,0,43.1,4.44,61.48,13.32,18.38,8.88,33.6,21.4,45.67,37.56,12.07,16.16,19.9,35.27,23.51,57.32h-47.02c-4.58-21.08-14.32-37.35-29.23-48.79-14.91-11.44-32.91-17.17-53.99-17.17s-37.94,4.93-52.64,14.77c-14.7,9.85-26.04,23.65-34.02,41.4-7.98,17.76-11.96,38.35-11.96,61.79s3.95,43.97,11.86,61.59c7.91,17.62,19.25,31.35,34.02,41.2,14.77,9.85,32.35,14.77,52.74,14.77s38.87-5.69,53.78-17.06c14.91-11.37,24.79-27.53,29.65-48.48h46.81c-3.61,21.92-11.44,40.96-23.51,57.11-12.07,16.16-27.29,28.64-45.67,37.45-18.38,8.81-38.88,13.21-61.48,13.21Z',
    'M984.99,315.01h-100.29V4.99h103.41c30.38,0,56.56,6.24,78.54,18.73,21.98,12.48,38.87,30.27,50.66,53.37,11.79,23.1,17.69,50.6,17.69,82.5s-5.93,59.68-17.79,82.91c-11.86,23.23-28.99,41.13-51.39,53.68-22.4,12.56-49.35,18.83-80.83,18.83ZM930.89,274.85h51.18c36.2,0,63.01-10.2,80.42-30.59,17.41-20.39,26.11-48.62,26.11-84.68s-8.6-63.98-25.8-84.16c-17.2-20.18-43.07-30.27-77.61-30.27h-54.3v229.7Z',
  ];
  const { LETTER_X, SCALE: scale, GAP, SVG_TOP } = GEN_LOGO_LAYOUT;
  const letterHeight = Math.round(320 * scale);

  const pathEls = PATHS.map(d => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); p.setAttribute('fill', fillColor); p.style.opacity = '0';
    svgEl.appendChild(p); return p;
  });
  logoContainer.appendChild(svgEl);

  const cursorNew = document.createElement('div');
  cursorNew.dataset.genCursor = '1';
  cursorNew.dataset.genCursorRole = 'typewriter';
  cursorNew.style.cssText = `position:absolute;top:${SVG_TOP - 6}px;left:0;width:1px;height:${letterHeight + 12}px;background:${fillColor};z-index:3;visibility:hidden;`;
  logoContainer.appendChild(cursorNew);
  cursor.style.zIndex = '3';

  // Shrink Lottie 到 SHRUNK_SIZE：跟下面 timeline 的 delay:2 並行跑，0.6s 內完成，
  // 不影響原本「delay 2s → cursor 3 cycles blink → destroy」的 indicator 出現節奏。
  // SPA 從 library/atlas 進來 logo 已是 100 → 跳過 shrink；
  // 從一般頁進來 updateNavActive 已 skip 不動 logo，這裡負責收。
  if (needsShrink) {
    gsap.to(logo, { width: SHRUNK_SIZE, height: SHRUNK_SIZE, duration: 0.6, ease: 'power2.inOut' });
  }

  // delay:2 保留原本節奏 — user 要求 indicator 「慢一點再出現」，跟改造前一致
  // shrink 在這 2s 內悄悄完成，cursor 出現時 Lottie 已是 100 size + cursor 對齊在它右邊緣
  const tl = gsap.timeline({ delay: 2, onComplete: () => { genLogoTimeline = null; } });
  genLogoTimeline = tl;

  tl.call(() => startBlink(cursor));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursor));
  // Lottie 旋轉 logo 在這個瞬間「被 indicator 刪掉」
  // 之前在 triggerGenerateLogo 起頭就 destroy 是 bug → Lottie 完全沒機會出現
  // 改成 cursor 右邊閃完、從右往左跳的瞬間才 destroy，視覺上 cursor 切過 logo 把它清掉
  tl.call(() => {
    if (typeof lottie !== 'undefined') {
      try { lottie.destroy('header-logo-anim'); } catch (e) { /* 沒 Lottie 就略過 */ }
    }
    logo.innerHTML = '';
  });
  tl.set(cursor, { left: -GAP });
  // 不再 display:none #header-logo，否則父層 <a> 會 collapse 成 0x0 失去可點擊區域
  // logo 內容已在開頭 innerHTML='' 清空，display:block 的 180x180 空 div 維持父層 <a> 的 click target
  tl.to({}, { duration: 0.15 });
  tl.set(cursor, { visibility: 'hidden' });
  tl.to({}, { duration: 0.5 });
  tl.set(cursorNew, { left: -GAP });
  tl.call(() => startBlink(cursorNew));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursorNew));
  LETTER_X.forEach((rightX, i) => {
    tl.set(cursorNew, { left: rightX * scale + GAP });
    tl.set(pathEls[i], { opacity: 1 });
    tl.to({}, { duration: 0.12 });
  });
  tl.call(() => startBlink(cursorNew));
  tl.to({}, { duration: 530 * 3 / 1000 });
  tl.call(() => stopBlink(cursorNew));
  tl.set(cursorNew, { visibility: 'hidden' });

  // typewriter 完成後撐開 <a> click target 到 SCCD letter bbox：
  // #header-logo shrink 到 100x100 後 <a> 也只剩 100x100（block child 撐父層），
  // 但 SCCD svg 視覺占 0~205 x 16~74，右半邊（C/C/D）落在 click area 外 → 點不到。
  // 設 220x80 涵蓋 SCCD bbox + 視覺 padding；下次進 /create 由開頭清 inline 重置
  tl.set(logoContainer, { width: 220, height: 80 });
}

// ── Mode btn enter/exit anim for /create ──────────────────────
// 進 /create 時 mode-btn 用 clip-reveal 消失（width+marginLeft → 0），
// 同 flex row 內的右側 bars (AA/Library/Atlas/CREATE!) 自動往右 shift 填補（flex layout 自然行為）
// 退場時反向
// 桌面 desktop 的 #mode-btn 才動；手機版 .theme-toggle-btn 在 grid col 內，layout 不同，不處理
// 用 GSAP 時間軸；caller 可 await Promise

const MODE_BTN_ML = 32; // tailwind ml-lg = var(--spacing-lg) = 32px（CLAUDE.md 規範）

export function animateHeaderModeBtnHide() {
  if (typeof gsap === 'undefined') return Promise.resolve();
  const modeBtn = document.querySelector('#mode-btn');
  if (!modeBtn) return Promise.resolve();
  return new Promise(resolve => {
    gsap.to(modeBtn, {
      width: 0,
      marginLeft: 0,
      // 從左往右 wipe：visible window 縮到右邊緣（icon 從右側退場）
      clipPath: 'inset(0 0 0 100%)',
      duration: 0.5,
      ease: 'power3.inOut',
      overwrite: 'auto',
      onComplete: resolve,
    });
  });
}

export function animateHeaderModeBtnShow() {
  if (typeof gsap === 'undefined') return Promise.resolve();
  const modeBtn = /** @type {HTMLElement | null} */ (document.querySelector('#mode-btn'));
  if (!modeBtn) return Promise.resolve();
  // 用 fromTo 明確指定 from-state（= animateHeaderModeBtnHide 的 end-state），確保是 hide 的精確反向動畫
  // 不依賴「modeBtn 仍保有 hide 殘留 inline 屬性」這個假設 — updateNavActive (header.js:337) 會在 SPA 換頁時
  // 無條件清掉 modeBtn.style.clipPath，導致純 gsap.to 起始的 clipPath 不是 inset(0 0 0 100%) 而是 '' →
  // clipPath 動畫直接跳值，視覺從「反向 wipe」變成「容器拉開」
  return new Promise(resolve => {
    gsap.fromTo(modeBtn,
      {
        width: 0,
        marginLeft: 0,
        clipPath: 'inset(0 0 0 100%)',
      },
      {
        width: 40,
        marginLeft: MODE_BTN_ML,
        clipPath: 'inset(0 0 0 0)',
        duration: 0.5,
        ease: 'power3.inOut',
        overwrite: 'auto',
        onComplete: () => {
          // 清 inline 讓 CSS 接管（恢復原生 auto width / margin / 無 clip-path）
          modeBtn.style.width = '';
          modeBtn.style.marginLeft = '';
          modeBtn.style.clipPath = '';
          resolve();
        },
      }
    );
  });
}

export function restoreHeaderLogo() {
  // 必須在清 DOM 前 kill timeline：用戶在 typewriter 完成前離開 /create 時，
  // 尾段的 lottie.destroy() + logo.innerHTML='' 會在新頁面繼續觸發，把 Lottie 弄不見且沒人重建
  // （switchHeaderLogo 在 applyMode 已 skip 不重建，因為當時 Lottie 還在）
  if (genLogoTimeline) {
    genLogoTimeline.kill();
    genLogoTimeline = null;
  }
  const logo = document.getElementById('header-logo');
  if (!logo) return;
  const logoContainer = logo.parentNode;
  if (logoContainer) {
    logoContainer.querySelectorAll('#gen-logo-svg, [data-gen-cursor]').forEach(el => el.remove());
    // typewriter 撐 click target 留下的 inline width/height 清掉，讓 <a> 重回 child-derived size
    /** @type {HTMLElement} */ (logoContainer).style.width = '';
    /** @type {HTMLElement} */ (logoContainer).style.height = '';
  }
  logo.style.display = '';
}

// ── Active Nav State（Router 換頁時呼叫）──────────────────────
export function updateNavActive(page) {
  const header = document.querySelector('#site-header header');
  if (!header) return;

  // Footer-near hide 同步 reset：前頁 scroll 到 footer 時 bars/logo 已被 animateHeaderHide
  // clip-path 收起；SPA 切到新頁後 scroll listener 是 async，等它偵測「離開 footer」再 show
  // 期間 updateNavActive 的 logo/bar tween 已跑完 → user 看到「小 logo + ML=0」的中間態。
  // 這裡同步清 clip-path + reset state，讓 tween 在 header 已 visible 的乾淨狀態下跑。
  if (barsHidden && typeof gsap !== 'undefined') {
    const targets = getFooterHideTargets();
    gsap.killTweensOf(targets);
    targets.forEach(el => { el.style.clipPath = ''; });
    barsHidden = false;
  }

  // page mappings（detail 頁對應到父層）
  // degree-show-detail 隸屬 activities.html 的 panel，需高亮 Activities
  const pageMappings = {
    'degree-show-detail':  'activities',
    'faculty-detail':      'faculty',
  };
  const activePage = pageMappings[page] || page;
  // 轉換為 .html 格式以匹配 href 屬性
  const activeHref = activePage === 'index' ? '' : `${activePage}.html`;

  function setNavLinkActive(link) { link.classList.add('active'); }
  function clearNavActive() {
    header.querySelectorAll('a.nav-link.active, .submenu-link.active').forEach(l => l.classList.remove('active'));
    header.querySelectorAll('[data-bar].has-active').forEach(el => el.classList.remove('has-active'));
  }

  clearNavActive();

  // About bar nav links
  header.querySelectorAll('nav > ul > li').forEach(li => {
    const parentLink = li.querySelector(':scope > a.nav-link');
    const subLinks = li.querySelectorAll('.submenu-link');

    if (parentLink && parentLink.getAttribute('href') === activeHref) {
      setNavLinkActive(parentLink);
    }
    subLinks.forEach(link => {
      if (link.getAttribute('href') === activeHref) {
        setNavLinkActive(parentLink);
        link.classList.add('active');
      }
    });
  });

  // Standalone links（非 nav 內）
  header.querySelectorAll('a.nav-link').forEach(link => {
    if (link.closest('nav')) return;
    if (link.closest('[data-bar="generate"]') || link.closest('[data-bar="library"]') || link.closest('[data-bar="atlas"]') || link.closest('[data-bar="alumni"]')) return;
    const href = link.getAttribute('href');
    if (href && href.split('/').pop() === activeHref) {
      setNavLinkActive(link);
    }
  });

  // about bar has-active
  const aboutBarEl = header.querySelector('[data-bar="about"]');
  if (aboutBarEl && aboutBarEl.querySelector('a.nav-link.active')) {
    aboutBarEl.classList.add('has-active');
  }

  // library / atlas / generate / alumni side bar 狀態
  const libraryBarEl    = header.querySelector('[data-bar="library"]');
  const atlasBarEl      = header.querySelector('[data-bar="atlas"]');
  const generateBarEl   = header.querySelector('[data-bar="generate"]');
  const alumniBarEl     = header.querySelector('[data-bar="alumni"]');
  const alumniFullBarEl = header.querySelector('[data-bar="alumni-full"]');
  const modeBtnEl       = header.querySelector('#mode-btn');
  const isLibraryActive  = activePage === 'library';
  const isAtlasActive    = activePage === 'atlas';
  const isGenerateActive = activePage === 'generate';
  const isAlumniActive   = activePage === 'alumni';

  // Alumni 頁面：alumni-full bar 取代 about-bar 位置，其他 bars 全部隱藏
  // 設 display:none 而非 clip-path：navigation 完成後的最終狀態（直接訪問 URL / SPA 切回都正確）
  // 收起動畫由 navigateToAlumni / playAlumniReveal 控制（在 click handler 觸發，這裡只負責 end state）
  const wasAlumni = document.body.classList.contains('page-alumni');
  const leavingAlumni = wasAlumni && !isAlumniActive;  // 偵測「離開 alumni」→ 觸發其他 bars reveal
  document.body.classList.toggle('page-alumni', isAlumniActive);
  if (alumniFullBarEl) /** @type {HTMLElement} */ (alumniFullBarEl).style.display = isAlumniActive ? '' : 'none';
  const otherBarEls = [aboutBarEl, alumniBarEl, libraryBarEl, atlasBarEl, generateBarEl].filter(Boolean);
  // mode-btn 在 alumni 頁要保留（user 要求），所以不在隱藏列表
  // mode-btn 自己也清 clipPath（避免收起動畫殘留）
  otherBarEls.forEach(el => {
    /** @type {HTMLElement} */ (el).style.display = isAlumniActive ? 'none' : '';
    // 離開 alumni 時不立即清 clipPath — 下方 reveal 動畫會 set inset 然後清；其他情況立即清
    if (!leavingAlumni) /** @type {HTMLElement} */ (el).style.clipPath = '';
  });
  // mode-btn 在 /create (generate) 頁需保留 hide 狀態（updateToggleBtnVisualState 隱藏的 clipPath inline）
  // 不加 gate 的話 same-page reentry 時 hide 狀態被清掉、edge-detection 又不會 re-fire hide → 視覺凍結現身
  if (modeBtnEl && !isGenerateActive) /** @type {HTMLElement} */ (modeBtnEl).style.clipPath = '';

  // 離開 alumni → 其他 bars clip-reveal 進場（mirror 進 alumni 時的 collapse pattern）
  // user 反饋 reveal 太快 → 拉長 duration 0.8 + stagger 0.08（總時長 ~1.12s），跟收起感覺一樣紮實
  // page swap 在 reveal 之前發生（user 要求），所以 reveal 在新頁上跑 — 動畫變長讓視覺停留時間夠
  if (leavingAlumni && otherBarEls.length && typeof gsap !== 'undefined') {
    gsap.killTweensOf(otherBarEls);
    otherBarEls.forEach(el => {
      const dir = Math.random() < 0.5 ? 'inset(0% 0% 100% 0%)' : 'inset(100% 0% 0% 0%)';
      gsap.set(el, { clipPath: dir });
    });
    gsap.to(otherBarEls, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.8,
      ease: 'power2.out',
      stagger: 0.08,
      onComplete: () => {
        otherBarEls.forEach(el => { /** @type {HTMLElement} */ (el).style.clipPath = ''; });
      },
    });
  }

  // alumni-full bar 進場：從左 clip-reveal（inset(0 100% 0 0) → inset(0)）
  // 只在 SPA 切到 alumni 時跑（不是 alumni → alumni 重複觸發）
  if (alumniFullBarEl && typeof gsap !== 'undefined') {
    if (isAlumniActive) {
      gsap.killTweensOf(alumniFullBarEl);
      gsap.fromTo(alumniFullBarEl,
        { clipPath: 'inset(0% 100% 0% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.7,
          ease: 'power3.out',
          delay: 0.25,  // 等 bars 收起動畫先跑一段
          onComplete: () => {
            /** @type {HTMLElement} */ (alumniFullBarEl).style.clipPath = '';
          },
        }
      );
    } else {
      /** @type {HTMLElement} */ (alumniFullBarEl).style.clipPath = '';
    }
  }

  // Logo 尺寸：library / atlas 頁是小的（100）；一般頁是大的（180）會 scroll shrink
  // /create 由 triggerGenerateLogo 自己管 size（shrink 180→100 是 typewriter 進場敘事的一部分），
  // 這裡跑 width tween 會跟它的 shrink 競爭，所以對 generate 跳過 tween 但仍要清掉舊頁的 ScrollTrigger 和 tween
  const logoEl = document.getElementById('header-logo');
  if (logoEl && typeof gsap !== 'undefined' && window.innerWidth >= 768) {
    // 先精確捕捉目前尺寸（避免 ScrollTrigger 中斷造成不穩定）
    const currentSize = logoEl.offsetWidth || 180;

    // 清除舊的 ScrollTrigger 和 tween（generate 也要清，否則前一頁的 body scroll-shrink trigger 殘留）
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.getAll().forEach(st => {
        if (st.vars && st.vars.trigger === 'body') st.kill();
      });
    }
    gsap.killTweensOf(logoEl);

    // /create：清完就交棒給 triggerGenerateLogo，不在這裡 set 新 tween 否則跟 shrink 競爭
    if (!isGenerateActive) {
      const SCROLL_END = 300;
      // SPA 切頁邏輯上應該起點 = page top（router scrollToTop 會在切頁時呼叫多次），
      // 一般頁直接給 180 不從 window.scrollY 推算 — 否則 router scrollToTop 還沒收斂時
      // （前一頁從 footer 切過來、新頁 innerHTML swap 期間 scroll-anchoring 殘留），
      // 這裡會讀到舊的高 scrollY → logo 直接 snap 到小尺寸，但 about-bar marginLeft
      // 不讀 scroll 仍是 64 → 大 about-bar + 小 logo 不匹配。
      // 後續 user 真的開始 scroll 由 onComplete 裡建的 ScrollTrigger 負責 shrink。
      const targetSize = (isLibraryActive || isAtlasActive) ? 100 : 180;

      // 用 fromTo 強制指定起點尺寸（避免 GSAP 讀到不一致的狀態）
      // lottie SVG 內部動畫不受 width/height 變化影響，持續旋轉
      gsap.fromTo(logoEl,
        { width: currentSize, height: currentSize },
        {
          width: targetSize,
          height: targetSize,
          duration: 0.6,
          ease: 'power2.inOut',
          onComplete: () => {
            if (!isLibraryActive && !isAtlasActive && typeof ScrollTrigger !== 'undefined') {
              gsap.fromTo(logoEl,
                { width: 180, height: 180 },
                {
                  width: 100, height: 100, ease: 'none',
                  scrollTrigger: { trigger: 'body', start: 'top top', end: `+=${SCROLL_END}`, scrub: 0.5 }
                }
              );
            }
          }
        }
      );
    }
  }

  function setSideBar(el, isActive) {
    if (!el) return;
    el.style.background = isActive ? '#000' : '#fff';
    el.classList.toggle('bar-active',   isActive);
    el.classList.toggle('bar-inactive', !isActive);
    // SPA 切頁時（cursor 可能還停在 btn 上）清除 hover class，避免黑底黑字殘影
    el.classList.remove('is-bar-hover');
    el.querySelectorAll('a.nav-link').forEach(l => l.classList.toggle('active', isActive));
  }
  setSideBar(libraryBarEl,  isLibraryActive);
  setSideBar(atlasBarEl,    isAtlasActive);
  setSideBar(generateBarEl, isGenerateActive);
  setSideBar(alumniBarEl,   isAlumniActive);

  // mode-btn 顏色由 .theme-toggle-btn color: var(--theme-fg)（CSS）接管
  // icon 用 .icon mode_1/2/3 mask，background-color: currentColor 跟 btn color 走，不在這裡 inline-set

  // About bar / Alumni-full bar scroll collapse：library/atlas 頁 marginLeft=0（貼齊 logo），一般頁面 marginLeft=64
  // 兩條 bar 共用同步 tween：about 顯示時 alumni-full display:none，反之亦然，所以可安全共用
  // SPA 切換時做 smooth 動畫（和 logo shrink 同步）
  const leftBarEls = /** @type {HTMLElement[]} */ ([
    header.querySelector('[data-bar="about"]'),
    header.querySelector('[data-bar="alumni-full"]'),
  ].filter(Boolean));
  if (leftBarEls.length && typeof gsap !== 'undefined') {
    const ML_START = 64, ML_END = 0;
    // 只 kill marginLeft tween，避免把上方剛建的 alumni-full clip-reveal tween 一起殺掉
    // （alumni-full bar 同時在 leftBarEls 陣列裡，全 kill 會卡在 inset(0% 100% 0% 0%) 完全不可見）
    gsap.killTweensOf(leftBarEls, 'marginLeft');

    const targetML = (isLibraryActive || isAtlasActive) ? ML_END : ML_START;
    gsap.to(leftBarEls, {
      marginLeft: targetML,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: () => {
        // 動畫完成後，一般頁面重建 scroll shrink
        if (!isLibraryActive && !isAtlasActive && !isGenerateActive && typeof ScrollTrigger !== 'undefined') {
          ScrollTrigger.create({
            trigger: 'body',
            start: 'top top',
            end: '+=120',
            scrub: 0.6,
            onUpdate: (/** @type {any} */ self) => {
              const ml = ML_START + (ML_END - ML_START) * self.progress;
              gsap.to(leftBarEls, { marginLeft: ml, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
            }
          });
        }
      }
    });
  }
}

export function initHeader() {
  const headerContainer = document.getElementById('site-header');

  // Helper to initialize header logic after HTML is injected
  function setupHeaderLogic() {
    const header = document.querySelector('header');
    if (!header) return;

    // 1. Set --header-height CSS variable
    function setHeaderHeight() {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
    setHeaderHeight();
    window.addEventListener('resize', setHeaderHeight);

    // 2. Active Nav State（初次載入）
    let currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

    // Generate page 初次載入時觸發 logo 動畫
    // 注意：直接訪問 /create.html 時 currentPage='create'，這條 if 不會 fire，由 main-modular.js
    // 的 fireGenLogo（header:ready listener）負責呼叫，避免兩邊都 fire 形成 race（double trigger
    // 會讓第二次 call kill 第一次的 timeline 浪費 ~1 frame 的 shrink tween）
    if (currentPage === 'generate') {
      triggerGenerateLogo();
    }

    // 呼叫 updateNavActive 設定初始 active 狀態
    updateNavActive(currentPage);

    // 3. Header Bar Random Rotation（about: -1.5~1.5°；其他 small bar: -4~4° 排除 0）
    {
      const aboutBarInit = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="about"]'));
      if (aboutBarInit) {
        aboutBarInit.style.transform = `rotate(${Math.round((Math.random() * 3 - 1.5) * 10) / 10}deg)`;
        aboutBarInit.style.transformOrigin = 'center center';
      }
      header.querySelectorAll('[data-bar="library"], [data-bar="atlas"], [data-bar="generate"], [data-bar="alumni"]').forEach(el => {
        let deg;
        do { deg = Math.round(Math.random() * 9) - 4; } while (deg === 0);
        /** @type {HTMLElement} */ (el).style.transform = `rotate(${deg}deg)`;
        /** @type {HTMLElement} */ (el).style.transformOrigin = 'center center';
      });
    }

    // about bar hover：整條 bar 底色變三原色，hover 單一 item 時字 100% 黑
    const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
    const aboutBar    = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="about"]'));
    const libraryBar  = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="library"]'));
    const atlasBar    = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="atlas"]'));
    const generateBar = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="generate"]'));
    const alumniBar   = /** @type {HTMLElement | null} */ (header.querySelector('[data-bar="alumni"]'));

    // about bar hover：底色隨機三原色
    if (aboutBar) {
      aboutBar.style.transition = 'background 0.4s ease';
      aboutBar.addEventListener('mouseenter', () => {
        aboutBar.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      });
      aboutBar.addEventListener('mouseleave', () => {
        aboutBar.style.background = '';
      });
    }

    // library / atlas / gen / mode 各自 hover 時隨機三原色，互不影響
    // 額外加 .is-bar-hover class 讓 CSS 文字色 hover 規則跟著走（class-driven 而非 :hover-driven），
    // 這樣點擊後 setSideBar 可清除 class，避免「cursor 還在 btn / 已導航到 library 頁」造成黑底黑字
    [libraryBar, atlasBar, generateBar, alumniBar].filter(Boolean).forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.classList.add('is-bar-hover');
        el.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('is-bar-hover');
        // 恢復由 updateNavActive 設定的底色
        const isActive = el.classList.contains('bar-active');
        el.style.background = isActive ? '#000' : '#fff';
      });
    });

    // === Alumni 點擊 → 全部 bars clip-path 收起（lightbox-shell 風格隨機 top/bottom），動畫完才導航 ===
    // stopImmediatePropagation() 擋掉 router 的 document-level click 攔截，動畫結束後手動呼叫 navigateTo
    // 這樣使用者完整看到收起動畫，navigation 才開始（避免 updateNavActive 中途 display:none 把 bars snap 掉）
    if (alumniBar && typeof gsap !== 'undefined') {
      const link = alumniBar.querySelector('a.nav-link');
      if (link) {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          // mode-btn 不收起（要在 alumni 頁保留可見），其他 bars 全收
          const bars = [
            header.querySelector('[data-bar="about"]'),
            header.querySelector('[data-bar="library"]'),
            header.querySelector('[data-bar="atlas"]'),
            header.querySelector('[data-bar="generate"]'),
            header.querySelector('[data-bar="alumni"]'),
          ].filter(Boolean);
          gsap.killTweensOf(bars);
          await new Promise(resolve => {
            gsap.fromTo(bars,
              { clipPath: 'inset(0% 0% 0% 0%)' },
              {
                clipPath: () => Math.random() < 0.5
                  ? 'inset(0% 0% 100% 0%)'
                  : 'inset(100% 0% 0% 0%)',
                duration: 0.55,
                ease: 'power2.out',
                stagger: 0.05,
                overwrite: true,
                onComplete: resolve,
              }
            );
          });
          // 動畫完成後手動觸發 SPA navigation
          const href = link.getAttribute('href');
          if (href) {
            const { navigateTo } = await import('./router.js');
            navigateTo(new URL(href, window.location.origin).href);
          }
        });
      }
    }

    // 4. About Bar / Alumni-full Bar Scroll Collapse（GSAP + ScrollTrigger）
    // 兩條 bar 共用 collapse — 同時只有一條可見（about 顯示時 alumni-full display:none，反之亦然）
    (function initLeftBarScroll() {
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

      const leftBars = /** @type {HTMLElement[]} */ ([
        header.querySelector('[data-bar="about"]'),
        header.querySelector('[data-bar="alumni-full"]'),
      ].filter(Boolean));
      if (!leftBars.length) return;

      const ML_START = 64;  // 2xl
      const ML_END = 0;
      const isLibrary = currentPage === 'library';
      const isAtlas   = currentPage === 'atlas';

      if (isLibrary || isAtlas) {
        gsap.set(leftBars, { marginLeft: ML_END });
      } else {
        gsap.set(leftBars, { marginLeft: ML_START });
        ScrollTrigger.create({
          trigger: 'body',
          start: 'top top',
          end: '+=120',
          scrub: 0.6,
          onUpdate: (self) => {
            const ml = ML_START + (ML_END - ML_START) * self.progress;
            gsap.to(leftBars, { marginLeft: ml, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
          }
        });
      }
    })();

    // 5. Logo Lottie + Scale Animation (Responsive)
    const logo = document.getElementById('header-logo');
    if (logo && typeof lottie !== 'undefined' && currentPage !== 'generate') {
      const isInverse = document.body.classList.contains('mode-inverse');
      const isColor = document.body.classList.contains('mode-color');
      // mode-color 用 wireframe logo；filter:invert 由 theme-toggle applyColorVars 控制
      let logoFile;
      let logoTypeTag;
      if (isColor) { logoFile = 'SCCDLogoWireframeStandard.json'; logoTypeTag = 'wireframe'; }
      else if (isInverse) { logoFile = 'SCCDLogoInverse.json'; logoTypeTag = 'inverse'; }
      else { logoFile = 'SCCDLogoStandard.json'; logoTypeTag = 'standard'; }
      // 用 origin 作 base 算出絕對路徑：相對 'data/X.json' 在 /pages/X.html 直接訪問時
      // 會解析成 /pages/data/X.json → 404 → Lottie 載不到 logo 不出現（live-server / 直接訪問 sub-folder 頁時會踩到）
      const logoPath = new URL(`data/${logoFile}`, window.location.origin).href;
      // 標記目前 logo type，讓 theme-toggle 的 switchHeaderLogo guard 能識別已載入的 logo
      logo.dataset.logoType = logoTypeTag;
      const logoAnim = lottie.loadAnimation({
        container: logo,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        name: 'header-logo-anim',
        path: logoPath,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        }
      });
      logoAnim.addEventListener('DOMLoaded', () => {
        const svg = logo.querySelector('svg');
        if (svg) {
          svg.style.overflow = 'visible';
          svg.setAttribute('viewBox', '0 0 1080 1080');
        }
      });
    }
    if (logo && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      const isDesktop = window.matchMedia('(min-width: 768px)');
      const isLibrary = currentPage === 'library';
      const isAtlas   = currentPage === 'atlas';
      // /create 直接訪問 URL 是 'create'，SPA 內 routed page 名是 'generate'，兩個都要 catch
      // 否則直接訪問會走 else 分支裝上 scroll-shrink ScrollTrigger，跟 triggerGenerateLogo 的 shrink tween 競爭同個 width prop
      const isGenerate = currentPage === 'generate' || currentPage === 'create';
      if (isDesktop.matches) {
        if (isLibrary || isAtlas) {
          gsap.set(logo, { width: 100, height: 100 });
        } else if (isGenerate) {
          gsap.set(logo, { width: 180, height: 180 });
        } else {
          gsap.set(logo, { width: 180, height: 180 });
          gsap.to(logo, {
            width: 100,
            height: 100,
            ease: 'none',
            scrollTrigger: {
              trigger: 'body',
              start: 'top top',
              end: '+=300',
              scrub: 0.5,
            }
          });
        }
      } else {
        gsap.set(logo, { width: 80, height: 80 });
      }
    }

    // 4. Mobile Menu Logic
    // 檢查 initMobileMenu 是否存在，避免因缺少該模組而報錯
    if (typeof initMobileMenu === 'function') {
      initMobileMenu();
    }

    // 5. Header Hide on Footer Reveal
    // bars + logo 全走 lightbox-shell 共用的 clip-path 收/展（per-element random top/bottom 方向），跟 lightbox/slide-in 同款
    // logo target 用 #header-logo 的 <a> 父層（純 link wrapper、無 gsap tween）：
    //   直接 clip-path #header-logo 會被 animateHeaderHide 內的 killTweensOf 殺掉 logo scroll-shrink ScrollTrigger tween
    //   <a> bbox == #header-logo bbox（唯一 child），視覺等效
    function bindFooterScroll() {
      const footerEl = document.querySelector('footer');
      if (!footerEl) return false;
      window.addEventListener('scroll', () => {
        const isNearFooter = footerEl.offsetHeight > 0 && footerEl.getBoundingClientRect().top < window.innerHeight * 0.5;
        if (typeof gsap === 'undefined') return;
        if (isNearFooter && !barsHidden) {
          barsHidden = true;
          animateHeaderHide(getFooterHideTargets());
        } else if (!isNearFooter && barsHidden) {
          barsHidden = false;
          animateHeaderShow(getFooterHideTargets());
        }
      });
      return true;
    }

    // 先嘗試直接綁定（index.html 靜態 footer）
    if (!bindFooterScroll()) {
      // footer 尚未載入，用 MutationObserver 等待
      const observer = new MutationObserver(() => {
        if (bindFooterScroll()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Load Header HTML（SPA：永遠從根目錄載入）
  // 用絕對路徑：直接開 /pages/create.html 等子目錄頁面時，相對 'pages/header.html'
  // 會解析成 /pages/pages/header.html 404；改 new URL(..., origin) 強制從 origin 根
  if (headerContainer) {
    const headerUrl = new URL('pages/header.html', window.location.origin).href;
    fetch(headerUrl)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.text();
      })
      .then(html => {
        headerContainer.innerHTML = html;
        setupHeaderLogic();
        document.dispatchEvent(new CustomEvent('header:ready'));
      })
      .catch(e => console.log('Header load failed', e));
  } else {
    setupHeaderLogic();
  }
}