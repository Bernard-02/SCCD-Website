/**
 * Lightbox Shell（共用 utility）
 * 提供所有全螢幕 lightbox/modal 統一的 enter/exit 行為：
 *   - body.lightbox-open class + overflow:hidden
 *   - header bars clip-path 退場/進場動畫（logo 不動）
 *   - html background-color 染色（讓 scrollbar-gutter 顏色對齊 lightbox bg）
 *
 * 視覺規範（與 activities-lightbox 對齊）：
 *   - lightbox 容器 z-[9999]：與 header z-9999 同層，但晚 append 到 body → 疊在 header 之上
 *   - bg-black/90：讓底下 page 微透，但 header 視覺上被蓋住
 *   - 不在 CSS 動 header 整體 transform（避免 logo 被一起拖走，且維持 logo 浮在最上的設計）
 */

function getHeaderTargets() {
  const header = document.querySelector('#site-header header');
  if (!header) return [];
  return /** @type {HTMLElement[]} */ ([
    ...header.querySelectorAll(':scope > .site-container > .md\\:flex > [data-bar]'),
    header.querySelector(':scope > .site-container > .md\\:flex > #mode-btn'),
  ].filter(Boolean));
}

// per-element 隨機方向快取（同一輪 hide/show 必須一致）
// 'top' = bottom→top 收（從底往上消）；'bottom' = top→bottom 收（從頂往下消）
const exitDirMap = new WeakMap();

function animateHeaderHide(targets) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  targets.forEach(el => exitDirMap.set(el, Math.random() < 0.5 ? 'top' : 'bottom'));
  // fromTo：強制 from-state 確保第一次開啟也有完整起點（current 可能是 'none'，GSAP 會跳終值）
  // inset 四值統一用 %（atlas memory：混用單位 GSAP 直接跳終值不動畫）
  gsap.fromTo(targets,
    { clipPath: 'inset(0% 0% 0% 0%)' },
    {
      clipPath: i => exitDirMap.get(targets[i]) === 'top'
        ? 'inset(0% 0% 100% 0%)'
        : 'inset(100% 0% 0% 0%)',
      duration: 0.6,
      ease: 'power2.in',
      stagger: 0.06,
      overwrite: true,
    }
  );
}

function animateHeaderShow(targets) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  gsap.to(targets, {
    clipPath: 'inset(0% 0% 0% 0%)',
    duration: 0.6,
    ease: 'power2.out',
    stagger: 0.06,
    overwrite: true,
    onComplete: () => {
      targets.forEach(el => { el.style.clipPath = ''; });
    },
  });
}

// 多個 lightbox 同時/連續開關時保持 body state 一致
let openCount = 0;
let bodyOverflowBefore = '';

export function enterLightboxMode() {
  if (openCount === 0) {
    bodyOverflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('lightbox-open');
    // 染同 lightbox 的 rgba(0,0,0,0.9) 讓 scrollbar gutter 與 lightbox bg 視覺一致
    // setProperty + 'important'：mode-color 下 color.css 的 html:has() 是 !important，需用 inline !important 壓過
    document.documentElement.style.setProperty('background-color', 'rgba(0, 0, 0, 0.9)', 'important');
    animateHeaderHide(getHeaderTargets());
  }
  openCount++;
}

export function exitLightboxMode() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    document.body.style.overflow = bodyOverflowBefore;
    document.body.classList.remove('lightbox-open');
    animateHeaderShow(getHeaderTargets());
    // fade-out 期間（~300ms）仍保留 html bg 染色，動畫結束才還原
    setTimeout(() => {
      if (openCount === 0) document.documentElement.style.removeProperty('background-color');
    }, 300);
  }
}

// SPA 換頁時呼叫（main-modular.js cleanupPageModules）：強制歸零，避免任何 modal 沒走 exit 流程時 state 殘留
export function resetLightboxMode() {
  openCount = 0;
}
