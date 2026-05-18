/**
 * Slide-in 背景染色 GSAP timeline 共用模組
 *
 * faculty / courses slide-in 開關時，html 背景透過 --slide-bg-color CSS var
 * 從 page bg → dim grey → panel 色（開），或反向（關）。
 *
 * 此模組只處理「bg 染色 timeline + has-slide-in class + --slide-bg-color lifecycle」。
 * lightbox-shell（header bars / body lock）、panel.style.bg、panel 可見性 class
 * 由 caller 自行管理。
 */

function readBg(htmlEl) {
  let bg = getComputedStyle(htmlEl).backgroundColor;
  if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
    bg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#ffffff';
  }
  return bg;
}

function dimColor(htmlEl) {
  return htmlEl.classList.contains('mode-inverse') ? '#000000' : '#333333';
}

/**
 * @param {object} args
 * @param {HTMLElement} args.overlay   slide-in 黑色 overlay（fade 到 0.8）
 * @param {HTMLElement} args.panel     滑入面板（x: 0%）
 * @param {string}      args.panelBg   面板色，html bg 最終目標色
 * @param {() => void} [args.onPanelDone]  面板滑入完成回呼（faculty 開啟 custom cursor 用）
 */
export function openSlideInBg({ overlay, panel, panelBg, onPanelDone }) {
  const htmlEl = document.documentElement;
  const startBg = readBg(htmlEl);
  const dimBg = dimColor(htmlEl);

  htmlEl.style.setProperty('--slide-bg-color', startBg);
  htmlEl.classList.add('has-slide-in');

  if (typeof gsap === 'undefined') {
    overlay.style.opacity = '0.8';
    htmlEl.style.setProperty('--slide-bg-color', panelBg);
    panel.style.transform = 'translateX(0%)';
    if (onPanelDone) onPanelDone();
    return null;
  }

  return gsap.timeline()
    .to(overlay, { opacity: 0.8, duration: 0.3 }, 0)
    .to(htmlEl,  { '--slide-bg-color': dimBg, duration: 0.3 }, 0)
    .to(panel,   { x: '0%', duration: 0.5, ease: 'power3.out', onComplete: onPanelDone }, 0.3)
    .to(htmlEl,  { '--slide-bg-color': panelBg, duration: 0.5, ease: 'power3.out' }, 0.3);
}

/**
 * @param {object} args
 * @param {HTMLElement} args.overlay
 * @param {HTMLElement} args.panel
 * @param {() => void} [args.onComplete]  整段動畫結束後回呼（caller add invisible class / 清 panel.bg）
 */
export function closeSlideInBg({ overlay, panel, onComplete }) {
  const htmlEl = document.documentElement;

  // 先暫時拿掉 has-slide-in 才能讀到「還原後」的 page bg（否則 computed bg 是 --slide-bg-color 當下值）
  htmlEl.classList.remove('has-slide-in');
  const targetBg = readBg(htmlEl);
  const dimBg = dimColor(htmlEl);
  htmlEl.classList.add('has-slide-in');

  const cleanup = () => {
    htmlEl.classList.remove('has-slide-in');
    htmlEl.style.removeProperty('--slide-bg-color');
    if (onComplete) onComplete();
  };

  if (typeof gsap === 'undefined') {
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(110%)';
    setTimeout(cleanup, 500);
    return null;
  }

  return gsap.timeline()
    .to(panel,   { x: '110%', duration: 0.5, ease: 'power3.in' }, 0)
    .to(htmlEl,  { '--slide-bg-color': dimBg, duration: 0.5, ease: 'power3.in' }, 0)
    .to(overlay, { opacity: 0, duration: 0.3 }, 0.5)
    .to(htmlEl,  { '--slide-bg-color': targetBg, duration: 0.3 }, 0.5)
    .call(cleanup);
}
