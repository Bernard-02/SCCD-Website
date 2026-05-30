/**
 * Support Page Module
 *
 * 接管 support 頁的 layout + 動畫，不走共用 hero-animation.js：
 *  - 套 [data-hero-hl] 統一 random accent 色（取代 hero-animation 的 highlight 邏輯）
 *  - 隨機 image / title 位置（每次 load 不同），參考 hero-rand-grid 的 4-corner 分佈
 *  - 自訂 entrance timeline：image → titles → Funds 群組 → Others 群組
 *
 * 為什麼自己接管：
 *  1. hero-animation.js init 需等 header:ready；若 header fetch 早於 listener 註冊，
 *     event miss → 動畫不跑 → hero-banner / hero-title 永遠 visibility:hidden。
 *     這就是 user 反映「refresh 不 load」的根因。本模組不依賴 header 也可跑，消除 race。
 *  2. user 要求特定動畫順序（image → title → Funds 組 → Others 組），共用 hero-animation
 *     timeline 無法表達分組階段；自訂 timeline 直接寫死順序。
 *
 * SPA cleanup：cleanupPageModules 用 gsap.killTweensOf(page-content 子元素) 自動清掉
 * 本模組建立的 tween，不需 export 額外 cleanup。
 */

export function initSupport() {
  const section = document.querySelector('.support-hero');
  if (!section) return;

  applySharedAccent(section);
  randomizeImagePosition(section.querySelector('.support-image'));
  randomizeTitlePosition(section.querySelector('.support-title-block'));
  wrapTitlesForClipReveal(section);

  if (typeof gsap === 'undefined') {
    revealAllImmediate(section);
    return;
  }
  playSupportTimeline(section);
}

// ── data-hero-hl 統一隨機 accent 色 ────────────────────────────
function applySharedAccent(section) {
  const els = section.querySelectorAll('[data-hero-hl]');
  if (!els.length) return;
  const cs = getComputedStyle(document.documentElement);
  const colors = [
    cs.getPropertyValue('--color-green').trim(),
    cs.getPropertyValue('--color-pink').trim(),
    cs.getPropertyValue('--color-blue').trim(),
  ].filter(Boolean);
  if (!colors.length) return;
  const color = colors[Math.floor(Math.random() * colors.length)];
  els.forEach(el => {
    /** @type {HTMLElement} */ (el).style.background = color;
    /** @type {HTMLElement} */ (el).style.padding = '0.5rem 0.6rem';
  });
}

// ── 隨機 image 位置：對齊 hero-animation.js randomizeHeroLayout 的 banner 規則 ─────────────
// 不是 4-corner 死貼邊，而是 bounded range（避 header / 留 side+bottom margin）+ 隨機偏向某 corner
// + 0.65-1.0 的 bias factor 給 range 內隨機 offset。±3° rotation 同 hero。
function randomizeImagePosition(image) {
  if (!image) return;
  const BANNER_TOP_BOUND = 90;   // 避 header（同 hero 規則）
  const SIDE_MARGIN = 24;
  const BOTTOM_MARGIN = 30;

  const W = window.innerWidth;
  const H = window.innerHeight;

  // hero-banner CSS: width: min(85vw, calc((100vh - 120px) * 1.6))；近似計算 bbox 避開 await render
  const bbW = Math.min(W * 0.85, (H - 120) * 1.6);
  const bbH = bbW * 9 / 16;

  const minVx = SIDE_MARGIN;
  const maxVx = Math.max(minVx + 1, W - bbW - SIDE_MARGIN);
  const minVy = BANNER_TOP_BOUND;
  const maxVy = Math.max(minVy + 1, H - bbH - BOTTOM_MARGIN);

  // 隨機挑一個 corner 偏向，bias factor 0.65-1.0（同 hero）
  const corners = ['tl', 'tr', 'bl', 'br'];
  const corner = corners[Math.floor(Math.random() * 4)];
  const biasLeft = corner === 'tl' || corner === 'bl';
  const biasTop = corner === 'tl' || corner === 'tr';
  const tx = 0.65 + Math.random() * 0.35;
  const ty = 0.65 + Math.random() * 0.35;
  const vx = biasLeft ? minVx + (1 - tx) * (maxVx - minVx) : minVx + tx * (maxVx - minVx);
  const vy = biasTop  ? minVy + (1 - ty) * (maxVy - minVy) : minVy + ty * (maxVy - minVy);

  const el = /** @type {HTMLElement} */ (image);
  el.style.left = `${vx.toFixed(1)}px`;
  el.style.top = `${vy.toFixed(1)}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';

  const angle = (Math.random() * 6 - 3).toFixed(2);
  el.style.transform = `rotate(${angle}deg)`;
  el.style.transformOrigin = 'center center';
}

// ── Title 固定左下角（避免 top anchor 撞到 header logo）─────────
function randomizeTitlePosition(block) {
  if (!block) return;
  Object.assign(/** @type {HTMLElement} */ (block).style, {
    top: 'auto',
    bottom: '3rem',
    transform: 'translateY(0)',
  });
}

// ── 包 title clip-reveal wrapper（與 hero-animation 同形：overflow:hidden 做 mask） ──
function wrapTitlesForClipReveal(section) {
  ['hero-title', 'hero-title-cn'].forEach(cls => {
    const el = section.querySelector(`.${cls}`);
    if (!el) return;
    if (el.parentElement && el.parentElement.classList.contains(`${cls}-wrapper`)) return;
    const wrapper = document.createElement('div');
    wrapper.className = `${cls}-wrapper`;
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  });
}

// ── GSAP 不可用時的 fallback：直接 reveal 全部 ────────────────
function revealAllImmediate(section) {
  section.querySelectorAll('.hero-title, .hero-title-cn, .hero-banner')
    .forEach(el => { /** @type {HTMLElement} */ (el).style.visibility = 'visible'; });
}

// ── 自訂 timeline：image → titles → Funds 群組 → Others 群組 ──
function playSupportTimeline(section) {
  const image       = section.querySelector('.support-image');
  const titles      = section.querySelectorAll('.hero-title, .hero-title-cn');
  const fundsChip   = section.querySelector('.support-funds');
  const singleDesc  = section.querySelector('.support-single');
  const regularDesc = section.querySelector('.support-regular');
  const othersChip  = section.querySelector('.support-others');
  const othersDesc  = section.querySelector('.support-others-desc');

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // Stage 1: Image clip-reveal（4 方向隨機，沿用 hero banner reveal pattern）
  if (image) {
    const DIRS = [
      'inset(0% 0% 100% 0%)',  // from top
      'inset(0% 0% 0% 100%)',  // from right
      'inset(100% 0% 0% 0%)',  // from bottom
      'inset(0% 100% 0% 0%)',  // from left
    ];
    const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
    gsap.set(image, { clipPath: dir, visibility: 'visible' });
    tl.to(image, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 1.0,
      clearProps: 'clipPath',
    }, 0);
  }

  // Stage 2: Titles 從下滑入（wrapper overflow:hidden 做 mask；hero-style clip-reveal）
  if (titles.length > 0) {
    gsap.set(titles, { yPercent: 100, visibility: 'visible' });
    tl.to(titles, {
      yPercent: 0,
      duration: 0.9,
      stagger: 0.15,
      clearProps: 'transform',
    }, 0.5);  // 比 image 晚 0.5s
  }

  // Stage 3: Funds 群組（Funds chip + Single + Regular）左→右 clip-path reveal
  const fundsGroup = [fundsChip, singleDesc, regularDesc].filter(Boolean);
  if (fundsGroup.length > 0) {
    gsap.set(fundsGroup, { clipPath: 'inset(0% 100% 0% 0%)' });
    tl.to(fundsGroup, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.7,
      stagger: 0.15,
      clearProps: 'clipPath',
    }, 1.3);  // titles 大致結束後
  }

  // Stage 4: Others 群組（Others chip + Others desc）
  const othersGroup = [othersChip, othersDesc].filter(Boolean);
  if (othersGroup.length > 0) {
    gsap.set(othersGroup, { clipPath: 'inset(0% 100% 0% 0%)' });
    tl.to(othersGroup, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.7,
      stagger: 0.15,
      clearProps: 'clipPath',
    }, 2.2);  // Funds 群組大致結束後
  }
}
