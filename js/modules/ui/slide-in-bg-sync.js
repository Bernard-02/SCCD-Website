import { DUR, EASE } from './motion.js';
import { revealHidden } from './scroll-animate.js';
/**
 * Slide-in 開關 GSAP timeline 共用模組（faculty / courses；只有手機／矮橫向走這裡，真桌面是 desk-card 色卡）
 *
 * 處理「panel 進退場 + has-slide-in class lifecycle + 手機 logo 換版」。
 * lightbox-shell（header bars / body lock）、panel.style.bg、panel 可見性 class
 * 由 caller 自行管理。
 *
 * 2026-09-13：原本還有 --slide-bg-color 背景染色 timeline（page bg → dim → panel 色），
 * 但消費該 var 的 CSS 規則早已不存在＝視覺 no-op，整段刪除（檔名沿用不改、免動 import）。
 *
 * 2026-11-04（user）：panel 全版型滿版（矮橫向 landscape.css 也是 width 100%）→ 不再 dim（overlay 留在 DOM、維持透明）；
 * panel 四向隨機進退場（滿版 panel 自身框＝視窗＝從畫面外滑入、每次重抽）；
 * 手機 logo 在卡片碰到 logo 那刻才 fade 成 slide-in 版、離開才換回（取代 theme-toggle 的固定延遲；見 syncLogo）。
 */

// panel 滑到位的時間點＝內容首開進場的起點（desk-card createSlideInEntrance）
export const SLIDE_IN_ARRIVE = DUR.medium;

// 卡片跟 logo 的框有交疊＝換成 slide-in 版（loadMobileLogo 依 lightbox-open／has-slide-in 挑檔）；離開＝換回。
// mode3 手機 logo 開關不換檔（對比由 theme-toggle applyColorVars 逐幀追）
let logoSwapped = false;
function syncLogo(panel, force = false) {
  const logo = document.getElementById('header-logo-mobile');
  if (!logo || document.body.classList.contains('mode-color')) return;
  const a = panel.getBoundingClientRect(), b = logo.getBoundingClientRect();
  const touching = !force && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  if (touching === logoSwapped) return;
  logoSwapped = touching;
  /** @type {any} */ (window).__sccdReloadMobileLogo?.({ fade: true });
}

/** @param {{ panel: HTMLElement }} args */
export function openSlideInBg({ panel }) {
  document.documentElement.classList.add('has-slide-in');

  if (typeof gsap === 'undefined') {
    panel.style.transform = 'translateX(0%)';
    return null;
  }
  // 收到一半又開：從當下位置回來；完全收好才抽新方向
  if (!gsap.isTweening(panel)) gsap.set(panel, { x: 0, y: 0, ...revealHidden() });
  return gsap.timeline()
    .to(panel, { xPercent: 0, yPercent: 0, duration: DUR.medium, ease: EASE.enter, overwrite: true, onUpdate: () => syncLogo(panel) }, 0);
}

/**
 * @param {object} args
 * @param {HTMLElement} args.panel
 * @param {() => void} [args.onComplete]  整段動畫結束後回呼（caller add invisible class / 清 panel.bg）
 */
export function closeSlideInBg({ panel, onComplete }) {
  const cleanup = () => {
    document.documentElement.classList.remove('has-slide-in');
    if (logoSwapped) syncLogo(panel, true);   // 保險：沒走到「離開 logo」那幀也換回
    if (onComplete) onComplete();
  };

  if (typeof gsap === 'undefined') {
    panel.style.transform = 'translateX(110%)';
    setTimeout(cleanup, 500);
    return null;
  }
  return gsap.timeline()
    .to(panel, { ...revealHidden(), duration: DUR.medium, ease: EASE.exit, overwrite: true, onUpdate: () => syncLogo(panel) }, 0)
    .call(cleanup);
}
