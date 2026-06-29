import { DUR, EASE } from '../../ui/motion.js';
import { registerPageExit } from '../../ui/page-exit.js';
/**
 * Section Banner Reveal Animation
 * About 頁面各 section banner 的動畫（三張圖片 clip-path reveal 版）
 *
 * 效果：
 * - 三張圖片平行排列，進場前已固定位置
 * - 使用 clip-path inset() 從四邊隨機 reveal，每張方向不同
 * - 文字 block 使用剩餘的第四個方向 reveal
 * - 三張圖片的旋轉角度各自不同，z-index 隨機
 */

// clip-path reveal 終態（brand trail 同樣邏輯）
const CLIP_END = 'inset(0% 0% 0% 0%)';

function getClipStart(dir) {
  switch (dir) {
    case 'top':    return 'inset(0% 0% 100% 0%)';
    case 'bottom': return 'inset(100% 0% 0% 0%)';
    case 'left':   return 'inset(0% 100% 0% 0%)';
    case 'right':  return 'inset(0% 0% 0% 100%)';
  }
}


// 文字旋轉：-6 到 6°，排除 0°
function randomTextRotation() {
  const values = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
  return values[Math.floor(Math.random() * values.length)];
}

// 從 CSS variables 讀取三原色
function getAccentColors() {
  const style = getComputedStyle(document.documentElement);
  return [
    style.getPropertyValue('--color-green').trim(),
    style.getPropertyValue('--color-pink').trim(),
    style.getPropertyValue('--color-blue').trim(),
  ];
}

export function initSectionBannerReveal() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const accentColors = getAccentColors();

  // 隨機套用封鎖線位置／旋轉（初始 + 每次 replay 都呼叫）
  /** @param {HTMLElement} titleEl */
  function applyRandomLayout(titleEl) {
    const rot = randomTextRotation();

    // 手機：封鎖綫一律橫跨整個 viewport（兩側 overshoot 蓋住旋轉缺角），文字從左側 container padding 起排，
    // 過長被右緣切掉沒關係（user 2026-06-11）。桌面才跑下方隨機 fromRight/visibleEnd 佈局
    // （fromRight 的 flex-end 會把文字右緣排到剛好 100vw，手機字寬幾乎滿版時看起來貼死右邊）。
    if (window.innerWidth < 768) {
      const mOvershoot = 25;
      // strip 外層是 flex container：不鎖 shrink 的話 width 會被縮到貼齊 viewport 右緣，右側 overshoot 失效
      titleEl.style.flexShrink = '0';
      titleEl.style.width = `${100 + mOvershoot * 2}vw`;
      titleEl.style.marginLeft = `-${mOvershoot}vw`;
      titleEl.style.paddingLeft = `calc(${mOvershoot}vw + var(--container-padding))`;
      titleEl.style.paddingRight = '0';
      titleEl.style.direction = '';
      titleEl.style.justifyContent = '';
      titleEl.style.transform = `rotate(${rot}deg) translateZ(0)`;
      return;
    }

    const fromRight = Math.random() < 0.5;
    const overshoot = 50; // 超出畫面的 vw

    // 先 reset 到 max-content 狀態量文字實際寬度，避免 visibleEnd 低估導致 bg 包不住文字
    titleEl.style.width = 'max-content';
    titleEl.style.marginLeft = '0';
    titleEl.style.paddingLeft = 'var(--spacing-md)';
    titleEl.style.paddingRight = 'var(--spacing-md)';
    titleEl.style.direction = '';
    titleEl.style.justifyContent = '';
    titleEl.style.transform = 'rotate(0deg) translateZ(0)';
    const vw = window.innerWidth / 100;
    const textVW = titleEl.offsetWidth / vw; // 包含 md padding
    // 文字左緣起點（fromRight=false 時從 14vw 起算）+ 文字寬 + buffer → 最低 visibleEnd
    const textStartVW = 14;
    const buffer = 8;
    const minVisibleEnd = Math.ceil(textStartVW + textVW + buffer);
    // 不封頂 95：若字長到 minVisibleEnd > 95，強制放大以免背景切到文字
    const visibleEnd = Math.max(70, minVisibleEnd) + Math.random() * 10;

    if (fromRight) {
      const leftStart = 100 - visibleEnd;
      titleEl.style.width = `calc(${overshoot}vw + ${visibleEnd}vw)`;
      titleEl.style.marginLeft = `${leftStart}vw`;
      titleEl.style.paddingLeft = '4vw';
      titleEl.style.paddingRight = `${overshoot}vw`;
      // 用 justify-content:flex-end 讓 items 貼右側，direction 保持 ltr
      // 避免 direction:rtl 反轉 flex children 順序（英文 h1 會被推到中文後面）
      titleEl.style.direction = '';
      titleEl.style.justifyContent = 'flex-end';
    } else {
      titleEl.style.width = `calc(${overshoot}vw + ${visibleEnd}vw)`;
      titleEl.style.marginLeft = `-${overshoot}vw`;
      titleEl.style.paddingLeft = `calc(${overshoot}vw + ${textStartVW}vw)`;
      titleEl.style.paddingRight = '';
      titleEl.style.direction = '';
      titleEl.style.justifyContent = '';
    }
    // translateZ(0) 永久 GPU layer：避免 mode 切換時 background-color transition 期間 layer promote/demote
    // 造成旋轉元素 sub-pixel rounding 飄移（symmetric 左右抖動）
    titleEl.style.transform = `rotate(${rot}deg) translateZ(0)`;
    // strip 的 top 由 inline style 決定（class/works: 10vh；resources/history: 0），不再由 JS 覆蓋
  }

  // --- Section Title Strips（class/resources/history 封鎖線風格）---
  // reveal 完全由 anchor-nav active 切換驅動（透過 _replayReveal）
  // strip 預設隱藏（CSS clip-path inset(0 100% 0 0)），無底色，
  // anchor-nav 首次 active 時選色 + 觸發 reveal → 單一動畫無閃爍
  const sectionTitles = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-section-title]'));
  sectionTitles.forEach((titleEl) => {
    applyRandomLayout(titleEl);

    const strip = titleEl.closest('.section-title-strip') || titleEl;

    // 手機版：直接顯示（不做 reveal 動畫）
    if (window.innerWidth < 768) {
      gsap.set(titleEl, { clipPath: CLIP_END });
      // 手機版也需要底色，從 accent 取
      const mobileColor = accentColors[Math.floor(Math.random() * accentColors.length)];
      titleEl.style.background = mobileColor;
      titleEl.dataset.accentHex = mobileColor;  // 原始 hex，給 bfa-division-toggle exclude 比對
    }

    // replay：anchor-nav 在 active 切換時呼叫（同時負責首次 reveal）
    // keepLayout=true：只重跑 clip-path，不重排位置
    // keepLayout=false：重排位置 + clip-path reveal（anchor-nav 換色用）
    /** @type {(color?: string, keepLayout?: boolean) => void} */
    const replay = (color, keepLayout = false) => {
      if (color) { titleEl.style.background = color; titleEl.dataset.accentHex = color; }  // dataset = 原始 hex 給 exclude 比對
      if (window.innerWidth < 768) return;
      gsap.killTweensOf(titleEl);
      if (!keepLayout) applyRandomLayout(titleEl);
      const revealDir = Math.random() < 0.5 ? 'left' : 'right';
      gsap.set(titleEl, { clipPath: getClipStart(revealDir) });
      gsap.to(titleEl, { clipPath: CLIP_END, duration: DUR.reveal, ease: EASE.enter });
    };
    // @ts-ignore - 掛在 DOM 元素上給 anchor-nav 取用（anchor-nav 讀 strip._replayReveal）
    strip._replayReveal = replay;
  });

  // 離頁退場：可視範圍內的封鎖綫 strip clip-path 收合（= reveal 的反向，往左/右收掉）
  // 只動視窗內的（離開時看不到的下方 section strip 不必跑）；strip 一律帶 inset clip-path（input.css）不會是 none
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || window.innerWidth < 768) { resolve(); return; }
    const collapse = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 100%)'];
    const visible = Array.from(sectionTitles).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    });
    if (!visible.length) { resolve(); return; }
    let done = 0;
    const onOne = () => { if (++done >= visible.length) resolve(); };
    visible.forEach((el, i) => {
      gsap.killTweensOf(el);
      gsap.to(el, { clipPath: collapse[i % 2], duration: DUR.medium, ease: EASE.exit, overwrite: true, onComplete: onOne });
    });
  }));
}
