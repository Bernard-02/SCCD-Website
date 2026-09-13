import { DUR, EASE } from './motion.js';
/**
 * Slide-in 開關 GSAP timeline 共用模組（faculty / courses）
 *
 * 處理「overlay fade + panel 平移 + has-slide-in class lifecycle」。
 * lightbox-shell（header bars / body lock）、panel.style.bg、panel 可見性 class
 * 由 caller 自行管理。
 *
 * 2026-09-13：原本還有 --slide-bg-color 背景染色 timeline（page bg → dim → panel 色），
 * 但消費該 var 的 CSS 規則早已不存在＝視覺 no-op，整段刪除（檔名沿用不改、免動 import）。
 */

/**
 * @param {object} args
 * @param {HTMLElement} args.overlay   slide-in 黑色 overlay（fade 到 0.8）
 * @param {HTMLElement} args.panel     滑入面板（x: 0%）
 */
export function openSlideInBg({ overlay, panel }) {
  document.documentElement.classList.add('has-slide-in');

  if (typeof gsap === 'undefined') {
    overlay.style.opacity = '0.8';
    panel.style.transform = 'translateX(0%)';
    return null;
  }

  return gsap.timeline()
    .to(overlay, { opacity: 0.8, duration: DUR.fast }, 0)
    .to(panel,   { x: '0%', duration: DUR.medium, ease: EASE.enter }, 0.3);
}

/**
 * @param {object} args
 * @param {HTMLElement} args.overlay
 * @param {HTMLElement} args.panel
 * @param {() => void} [args.onComplete]  整段動畫結束後回呼（caller add invisible class / 清 panel.bg）
 */
export function closeSlideInBg({ overlay, panel, onComplete }) {
  const htmlEl = document.documentElement;

  const cleanup = () => {
    htmlEl.classList.remove('has-slide-in');
    if (onComplete) onComplete();
  };

  if (typeof gsap === 'undefined') {
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(110%)';
    setTimeout(cleanup, 500);
    return null;
  }

  return gsap.timeline()
    .to(panel,   { x: '110%', duration: DUR.medium, ease: EASE.exit }, 0)
    .to(overlay, { opacity: 0, duration: DUR.fast }, 0.5)
    .call(cleanup);
}
