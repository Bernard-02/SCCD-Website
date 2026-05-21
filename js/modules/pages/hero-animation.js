/**
 * Hero Animation Module
 * 為所有內頁的 Hero Section 文字加上進場動畫
 *
 * 架構：
 * - JS 動態為每個元素加一個 wrapper（帶 CSS class），wrapper 負責 rotate
 * - 元素本身做 clip reveal：每次隨機從 4 方向（top/bottom/left/right）滑入，
 *   用 wrapper overflow:hidden 當遮罩；退場時也隨機 4 方向滑出
 * - visibility: hidden 定義在 hero.css，CSS 載入後立即生效，防止閃爍
 */

import { registerPageExit } from '../ui/page-exit.js';

// 4 方向隨機 slide-in：用 wrapper overflow:hidden 當遮罩，child 從 wrapper 外的某方向滑入
const HERO_DIRS = ['top', 'bottom', 'left', 'right'];
function pickHeroDir() { return HERO_DIRS[Math.floor(Math.random() * HERO_DIRS.length)]; }

// 該方向的「藏起」位移：child 移到 wrapper 外指定方向（width/height = wrapper bbox）
function offsetFor(dir) {
  switch (dir) {
    case 'top':    return { xPercent: 0,    yPercent: -100 };
    case 'bottom': return { xPercent: 0,    yPercent: 100  };
    case 'left':   return { xPercent: -100, yPercent: 0    };
    case 'right':  return { xPercent: 100,  yPercent: 0    };
  }
}

// Banner clip-path 4 方向收/展（沿用 hero-banner 既有 inset reveal pattern）
const BANNER_INSET_MAP = {
  top:    'inset(0% 0% 100% 0%)',
  right:  'inset(0% 0% 0% 100%)',
  bottom: 'inset(100% 0% 0% 0%)',
  left:   'inset(0% 100% 0% 0%)',
};

function wrapElement(el, wrapperClass) {
  const wrapper = document.createElement('div');
  wrapper.className = wrapperClass;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 隨機定位 5 元素（title-wrapper / title-cn-wrapper / banner / EN-wrapper / CN-wrapper）至 absolute 座標
// 必須在 wrapElement() 之後呼叫，這樣 wrapper 才是 grid 的直系子元素
//
// 規則（填滿 viewport，不留完全空白角）：
//   - 4 個文字（EN title / CN title / EN 段 / CN 段）各佔一個 viewport corner（shuffle 分配）
//   - Banner 中央偏隨機（85vw），4 corner 都被文字佔時 banner fall back 偏向 corners[3] → 與文字重疊（z-index 文字在上）
//   - 文字必須避開 header（TEXT_TOP_BOUND = 140）；banner 可貼近 header（BANNER_TOP_BOUND = 90）
//   - 文字互相不重疊（corner 分散自然 separation；加 collision retry 兜底）
//   - 文字可疊在 banner 上（z-index CSS 處理）
// 旋轉：banner 額外給 ±3° 隨機（titles / EN / CN 用 CSS rotation）
function randomizeHeroLayout() {
  const grid = document.querySelector('.hero-rand-grid');
  if (!grid) return;
  if (window.innerWidth < 768) return;  // 手機 flex stack，不 random

  const TEXT_TOP_BOUND = 140;
  const BANNER_TOP_BOUND = 90;
  const SIDE_MARGIN = 24;
  const BOTTOM_MARGIN = 30;
  const TEXT_COLLISION_PAD = 12;
  const CORNER_JITTER_FRAC = 0.18;  // 文字距 corner anchor 最多 18% 可用空間（保留邊緣感）
  const TEXT_MIN_W_PX = 400;        // EN / CN 段落最小 max-width（過窄會換太多行、bbox 變高觸發避碰失敗）
  const TEXT_MAX_W_PX = 550;        // EN / CN 段落最大 max-width（每次 refresh 兩段各自隨機）
  const W = window.innerWidth;
  const H = window.innerHeight;

  function randomizeParagraphWidths() {
    ['hero-text-en', 'hero-text-cn'].forEach(cls => {
      const p = /** @type {HTMLElement|null} */ (grid.querySelector(`.${cls}`));
      if (p) {
        const w = TEXT_MIN_W_PX + Math.random() * (TEXT_MAX_W_PX - TEXT_MIN_W_PX);
        p.style.maxWidth = `${Math.round(w)}px`;
      }
    });
  }
  // 隨機派 EN / CN 段落 max-width — 寬窄分佈讓版面變化更大
  // 必須在量測 bbox 之前設好，否則 rect 是舊寬度的 bbox
  randomizeParagraphWidths();

  const textItems = [];
  ['hero-title', 'hero-title-cn', 'hero-text-en', 'hero-text-cn'].forEach(cls => {
    const wrapper = grid.querySelector(`.${cls}-wrapper`);
    if (wrapper) textItems.push(wrapper);
    else {
      const raw = grid.querySelector(`.${cls}`);
      if (raw) textItems.push(raw);
    }
  });
  const banner = /** @type {HTMLElement|null} */ (grid.querySelector('.hero-banner'));
  if (banner) {
    const bannerAngle = (Math.random() * 6 - 3).toFixed(2);
    banner.style.transform = `rotate(${bannerAngle}deg)`;
  }

  const allItems = banner ? [...textItems, banner] : textItems;
  allItems.forEach(el => {
    /** @type {HTMLElement} */ (el).style.left = '0px';
    /** @type {HTMLElement} */ (el).style.top = '0px';
  });
  void /** @type {HTMLElement} */ (grid).offsetHeight;

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function rectsOverlap(a, b, pad) {
    return !(a.right + pad < b.left || b.right + pad < a.left ||
             a.bottom + pad < b.top || b.bottom + pad < a.top);
  }
  function overlapArea(a, b) {
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ox * oy;
  }

  // placedTextRects / usedCorners 每次 attempt 重置；初始空 array 給 tryPlaceAtCorner 閉包用
  const placedTextRects = [];
  const usedCorners = [];

  // 偵測 header logo（180×180、左上、會溢出 header 下方），給 text bbox 當 exclusion zone
  const logoEl = /** @type {HTMLElement|null} */ (document.querySelector('#header-logo'));
  let logoRect = null;
  if (logoEl) {
    const r = logoEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      logoRect = { left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 };
    }
  }

  // 對特定 corner 嘗試放置；回傳最佳 (vx, vy, penalty)。不真的 apply。
  function tryPlaceAtCorner(rect, corner) {
    const bbW = rect.width;
    const bbH = rect.height;

    let effectiveTop = TEXT_TOP_BOUND;
    if (logoRect && (corner === 'tl' || corner === 'tr')) {
      const anchorX = (corner === 'tl') ? SIDE_MARGIN : W - bbW - SIDE_MARGIN;
      const xOverlapsLogo = (logoRect.right > anchorX) && (logoRect.left < anchorX + bbW);
      if (xOverlapsLogo) effectiveTop = Math.max(TEXT_TOP_BOUND, logoRect.bottom);
    }

    const xRange = Math.max(0, W - bbW - 2 * SIDE_MARGIN);
    const yRange = Math.max(0, H - bbH - effectiveTop - BOTTOM_MARGIN);

    let bestVx = SIDE_MARGIN, bestVy = effectiveTop, bestPenalty = Infinity;
    for (let i = 0; i < 30; i++) {
      const jx = Math.random() * CORNER_JITTER_FRAC * xRange;
      const jy = Math.random() * CORNER_JITTER_FRAC * yRange;
      const vx = (corner === 'tl' || corner === 'bl')
        ? SIDE_MARGIN + jx
        : W - bbW - SIDE_MARGIN - jx;
      const vy = (corner === 'tl' || corner === 'tr')
        ? effectiveTop + jy
        : H - bbH - BOTTOM_MARGIN - jy;

      const candidate = { left: vx, top: vy, right: vx + bbW, bottom: vy + bbH };
      const collidesText = placedTextRects.some(r => rectsOverlap(r, candidate, TEXT_COLLISION_PAD));
      const collidesLogo = logoRect ? rectsOverlap(logoRect, candidate, 0) : false;
      if (!collidesText && !collidesLogo) { return { vx, vy, penalty: 0, corner }; }

      const penalty = placedTextRects.reduce((s, r) => s + overlapArea(r, candidate), 0)
        + (collidesLogo ? overlapArea(logoRect, candidate) * 4 : 0);
      if (penalty < bestPenalty) { bestPenalty = penalty; bestVx = vx; bestVy = vy; }
    }
    return { vx: bestVx, vy: bestVy, penalty: bestPenalty, corner };
  }

  // 試偏好 corner，失敗（仍有 overlap）則 fall back 試其他 corner，取 penalty 最低者
  // 順序：preferred → 未使用 corners（隨機洗牌） → 已使用 corners（隨機洗牌）
  // 已使用 corner 排最後 = 避免兩個文字「擠在同一 corner」（這就是原本「字被白卡蓋住」的成因）
  // 回傳該文字的 penalty（0 = 完全無重疊）
  function placeTextWithFallback(el, preferredCorner) {
    const rect = /** @type {HTMLElement} */ (el).getBoundingClientRect();
    const bbW = rect.width;
    const bbH = rect.height;

    const remaining = ['tl', 'tr', 'bl', 'br'].filter(c => c !== preferredCorner);
    const unusedRemaining = remaining.filter(c => !usedCorners.includes(c));
    const usedRemaining = remaining.filter(c => usedCorners.includes(c));
    const tryOrder = [preferredCorner, ...shuffleArr(unusedRemaining), ...shuffleArr(usedRemaining)];
    let best = null;
    for (const c of tryOrder) {
      const result = tryPlaceAtCorner(rect, c);
      if (!best || result.penalty < best.penalty) best = result;
      if (result.penalty === 0) break;  // 找到完全無重疊 → 收工
    }

    /** @type {HTMLElement} */ (el).style.left = `${(best.vx - rect.left).toFixed(1)}px`;
    /** @type {HTMLElement} */ (el).style.top = `${(best.vy - rect.top).toFixed(1)}px`;
    placedTextRects.push({ left: best.vx, top: best.vy, right: best.vx + bbW, bottom: best.vy + bbH });
    usedCorners.push(best.corner);
    return best.penalty;
  }

  // 整輪 placement = 重派 max-width + shuffle corners + 按 textItems 順序 place
  // 整輪重試：避免 corner shuffle 順序在 cramped viewport 下卡進「兩個寬段都剩同邊 corner」死局
  // 重要：snapshot 必須同時抓 max-width，因為位置是配那組 width 算的；
  //       若只 restore 位置但段落寬度是最後一輪的（不同尺寸）→ 重新引入重疊或溢出
  const paragraphs = ['hero-text-en', 'hero-text-cn']
    .map(cls => /** @type {HTMLElement|null} */ (grid.querySelector(`.${cls}`)))
    .filter(Boolean);
  function runPlacementPass() {
    placedTextRects.length = 0;
    usedCorners.length = 0;
    // Reset 每個 text item 回 top:0 left:0 — placeTextWithFallback 內部用 `vy - rect.top` 算 new style.top，
    // 假設 rect.top == gridRect.top（element 在 top:0 時）。前一輪設的 style.top 會讓 rect.top 偏移，
    // 12 attempts 累積飄移 → 最終 restore best 時 element 跑到 viewport 上方被切（chip 飛到 header 上面）
    textItems.forEach(el => {
      /** @type {HTMLElement} */ (el).style.left = '0px';
      /** @type {HTMLElement} */ (el).style.top = '0px';
    });
    randomizeParagraphWidths();
    void /** @type {HTMLElement} */ (grid).offsetHeight;  // 強制 reflow，下面 getBoundingClientRect 拿到新寬度
    const corners = shuffleArr(['tl', 'tr', 'bl', 'br']);
    let totalPenalty = 0;
    textItems.forEach((el, i) => { totalPenalty += placeTextWithFallback(el, corners[i]); });
    const positions = textItems.map(el => ({
      el,
      left: /** @type {HTMLElement} */ (el).style.left,
      top: /** @type {HTMLElement} */ (el).style.top,
    }));
    const paragraphWidths = paragraphs.map(p => p.style.maxWidth);
    return { totalPenalty, positions, paragraphWidths, usedCornersSnapshot: [...usedCorners] };
  }

  const MAX_LAYOUT_ATTEMPTS = 12;
  let bestResult = null;
  for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt++) {
    const result = runPlacementPass();
    if (!bestResult || result.totalPenalty < bestResult.totalPenalty) bestResult = result;
    if (result.totalPenalty === 0) break;  // 完美無重疊 → 收工
  }
  // 套用最佳結果（widths + positions 必須一起 restore，否則 size/pos 配不上重新引入重疊）
  bestResult.paragraphWidths.forEach((w, i) => { paragraphs[i].style.maxWidth = w; });
  bestResult.positions.forEach(s => {
    /** @type {HTMLElement} */ (s.el).style.left = s.left;
    /** @type {HTMLElement} */ (s.el).style.top = s.top;
  });
  // Banner 用最佳 snapshot 的 usedCorners 找未占用角
  usedCorners.length = 0;
  bestResult.usedCornersSnapshot.forEach(c => usedCorners.push(c));

  // Banner：偏向「未被文字佔用」的第 4 個 corner，確保所有 corner 都有內容、無完全空白角
  if (banner) {
    const rect = banner.getBoundingClientRect();
    const bbW = rect.width;
    const bbH = rect.height;

    const minVx = SIDE_MARGIN;
    const maxVx = Math.max(minVx + 1, W - bbW - SIDE_MARGIN);
    const minVy = BANNER_TOP_BOUND;
    const maxVy = Math.max(minVy + 1, H - bbH - BOTTOM_MARGIN);

    // 文字可能因 fallback 換 corner → 用 usedCorners 找實際沒被佔的；4 corners 都被佔則 random 挑一個
    const fallbackCorners = ['tl', 'tr', 'bl', 'br'];
    const unusedCorner = fallbackCorners.find(c => !usedCorners.includes(c))
      || fallbackCorners[Math.floor(Math.random() * 4)];
    const biasLeft = (unusedCorner === 'tl' || unusedCorner === 'bl');
    const biasTop = (unusedCorner === 'tl' || unusedCorner === 'tr');
    // tx ∈ [0.65, 1.0]：強偏向 unused corner（不到 1.0 是留小隨機感）
    const tx = 0.65 + Math.random() * 0.35;
    const ty = 0.65 + Math.random() * 0.35;
    const vx = biasLeft ? minVx + (1 - tx) * (maxVx - minVx) : minVx + tx * (maxVx - minVx);
    const vy = biasTop ? minVy + (1 - ty) * (maxVy - minVy) : minVy + ty * (maxVy - minVy);

    banner.style.left = `${(vx - rect.left).toFixed(1)}px`;
    banner.style.top = `${(vy - rect.top).toFixed(1)}px`;
  }

  // 收齊 .hero-text-en / .hero-text-cn chip 寬度 = 實際 wrap 後最長行 + padding。
  // 根因：max-width 是 wrap 上限，不是 chip 視覺寬；最長行通常比 max-width 短，
  // bg 跟著 <p> 寬度延伸 → 右側看起來比左 padding 大。用 Range API 量 wrapped lines 取最長一行寫回 width
  // 收緊。位置已派完（基於原 max-width bbox），縮 width 只會讓 bbox 變小，不會引入重疊。
  ['hero-text-en', 'hero-text-cn'].forEach(cls => {
    const p = /** @type {HTMLElement|null} */ (grid.querySelector(`.${cls}`));
    if (!p) return;
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = range.getClientRects();
    let maxLineW = 0;
    for (const r of rects) if (r.width > maxLineW) maxLineW = r.width;
    if (maxLineW <= 0) return;
    const cs = getComputedStyle(p);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    p.style.width = `${Math.ceil(maxLineW + padL + padR)}px`;
  });
}

/**
 * Hero 退場動畫：text 4 方向隨機 slide-out + banner 4 方向 clip-path 收合。
 * 與 page-specific exit handler 並行（page-exit.js 用 Promise.all）。
 */
async function playHeroExit() {
  if (typeof gsap === 'undefined') return;

  const texts = Array.from(document.querySelectorAll(
    '.hero-title, .hero-title-cn, .hero-text-en, .hero-text-cn'
  )).filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null);
  const banner = /** @type {HTMLElement | null} */ (document.querySelector('.hero-banner'));

  if (texts.length === 0 && !banner) return;

  const EXIT_DURATION = 0.5;
  const EXIT_STAGGER = 0.06;

  return new Promise(resolve => {
    const tl = gsap.timeline({ onComplete: resolve });

    // 用 fromTo 明確指定起點：進場 clearProps:'transform' 後元素無 inline transform，
    // 直接 tl.to 仰賴 computed xPercent/yPercent=0 雖通常 OK，但同 reason 包進 fromTo 避免 GSAP 解析意外
    texts.forEach((el, i) => {
      const to = offsetFor(pickHeroDir());
      tl.fromTo(el,
        { xPercent: 0, yPercent: 0 },
        {
          xPercent: to.xPercent,
          yPercent: to.yPercent,
          duration: EXIT_DURATION,
          ease: 'power3.in',
          overwrite: true,
        },
        i * EXIT_STAGGER);
    });

    // Banner: 進場 clearProps:'clipPath' 後 computed clipPath = 'none'，無法 interpolate 到 inset(...)；
    // 用 fromTo 指定 from = inset(0%) 是 explicit 起點
    if (banner) {
      const dir = pickHeroDir();
      tl.fromTo(banner,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        {
          clipPath: BANNER_INSET_MAP[dir],
          duration: EXIT_DURATION,
          ease: 'power3.in',
          overwrite: true,
        },
        0);
    }
  });
}

// Hero 進場動畫完成信號：SPA 換頁時 deep-link 邏輯（如 courses ?item= scroll + slide-in）
// 必須等 hero 動畫跑完才能 scroll，否則使用者看到動畫被向下捲走。
// - `_heroDone` flag：給「監聽器晚於 dispatch 註冊」的呼叫端做 fast-path return
// - `hero:animation-done` event on document：給「監聽器先於 dispatch 註冊」的常見路徑
// - SPA 每次 initHeroAnimation 重置 flag（每頁都會跑一次新的 hero）
let _heroDone = false;

function signalHeroDone() {
  _heroDone = true;
  document.dispatchEvent(new Event('hero:animation-done'));
}

/**
 * 等到 hero 進場動畫完成。已完成則 resolve 立刻；否則監聽事件，並帶 timeoutMs 兜底
 * （避免某些頁面 hero 結構不存在、event 永遠不會 fire 時 caller 卡死）。
 * @param {number} [timeoutMs=2500]
 */
export function waitForHeroAnimDone(timeoutMs = 2500) {
  if (_heroDone) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      document.removeEventListener('hero:animation-done', fire);
      resolve();
    };
    document.addEventListener('hero:animation-done', fire);
    setTimeout(fire, timeoutMs);
  });
}

export function initHeroAnimation() {
  // SPA 每頁重置：上頁殘留 `_heroDone=true` 會讓本頁 deep-link 不等動畫直接 scroll
  _heroDone = false;

  // Hero highlight：所有 [data-hero-hl] 套同一個隨機 accent 色 + 固定 padding
  // padding 用 rem 而非 em，避免 h1（font-size 大）的 padding 被等比例放大成過大色塊
  // 跑在 gsap 早返回之前，確保無 gsap 也會套色
  const heroHls = document.querySelectorAll('[data-hero-hl]');
  if (heroHls.length > 0) {
    const cs = getComputedStyle(document.documentElement);
    const accentColors = [
      cs.getPropertyValue('--color-green').trim(),
      cs.getPropertyValue('--color-pink').trim(),
      cs.getPropertyValue('--color-blue').trim(),
    ];
    const color = accentColors[Math.floor(Math.random() * accentColors.length)];
    heroHls.forEach(el => {
      /** @type {HTMLElement} */ (el).style.background = color;
      /** @type {HTMLElement} */ (el).style.padding = '0.5rem 0.6rem';
    });
  }

  // hero-text-en / hero-text-cn 之間的 gap：兩個段落各自旋轉，bbox 高度會增加 = width × sin(angle)
  // 參考 history desc 的算法：gap = 兩 paragraph 的 rotation excursion 加總 + buffer
  // 動態算 because 寬度依 viewport 而變；只算一次，resize 不重算（避免 SPA listener 累積）
  // 注意：random 2×2 grid 版面（.hero-rand-grid）下 EN / CN 在不同 cell，rotation 由 section overflow 處理，不需 gap
  const heroTextEn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-en'));
  const heroTextCn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-cn'));
  const inRandGrid = !!document.querySelector('.hero-rand-grid');
  let heroGapPx = 0;
  if (heroTextEn && heroTextCn && !inRandGrid) {
    const isDesktop = window.innerWidth >= 768;
    const enRotDeg = isDesktop ? 3 : 1;
    const cnRotDeg = isDesktop ? 2 : 1;
    const w = heroTextEn.offsetWidth;
    const enExcursion = w * Math.sin(enRotDeg * Math.PI / 180);
    const cnExcursion = w * Math.sin(cnRotDeg * Math.PI / 180);
    const buffer = 12;
    heroGapPx = Math.ceil(enExcursion + cnExcursion + buffer);
  }

  if (typeof gsap === 'undefined') {
    if (heroTextEn && heroGapPx > 0) heroTextEn.style.marginBottom = `${heroGapPx}px`;
    document.querySelectorAll('.hero-title, .hero-title-cn, .hero-text-en, .hero-text-cn, .hero-banner, [data-hero-logo]')
      .forEach(el => { /** @type {HTMLElement} */ (el).style.visibility = 'visible'; });
    randomizeHeroLayout();
    signalHeroDone();
    return;
  }

  // --- Logo-only hero（如 about 頁）：clip y 位移進場 — yPercent 100→0，wrapper overflow:hidden 當遮罩 ---
  // duration 對齊 hero-title 的 0.9s，節奏跟其他內頁一致
  const heroLogo = /** @type {HTMLElement | null} */ (document.querySelector('[data-hero-logo]'));
  if (heroLogo) {
    const logoWrapper = /** @type {HTMLElement | null} */ (heroLogo.closest('.hero-logo-wrapper'));
    gsap.fromTo(heroLogo,
      { yPercent: 100, visibility: 'visible' },
      {
        yPercent: 0,
        duration: 0.9,
        delay: 0.3,
        ease: 'power3.out',
        clearProps: 'transform',
        onComplete: () => {
          // 解除 wrapper 裁切，讓後續 scroll parallax (scale+yPercent) 顯示完整 logo
          if (logoWrapper) logoWrapper.style.overflow = 'visible';
        },
      }
    );
  }

  const title = document.querySelector('.hero-title');
  const titleCn = document.querySelector('.hero-title-cn');
  const textEn = document.querySelector('.hero-text-en');
  const textCn = document.querySelector('.hero-text-cn');

  if (!title && !titleCn && !textEn && !textCn) {
    // 沒任何 hero 文字（如僅 logo 頁），不會經過 timeline → 直接 signal 避免 caller 等到 timeout
    signalHeroDone();
    return;
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: signalHeroDone,
  });

  // 預先 wrap，避免動畫順序判斷影響 wrap 邏輯（wrapper 同時負責 rotate + clip overflow）
  if (title) wrapElement(title, 'hero-title-wrapper');
  if (titleCn) wrapElement(titleCn, 'hero-title-cn-wrapper');
  if (textEn) {
    wrapElement(textEn, 'hero-text-en-wrapper');
    // Tailwind class（mb-lg/mb-xl）的 mb 在 wrap 後會在 wrapper 內部，浪費高度且讓 wrapper 變高 → 顯式清掉
    /** @type {HTMLElement} */ (textEn).style.marginBottom = '0';
    if (heroGapPx > 0 && textEn.parentElement) {
      // 旋轉 excursion gap 改套到 wrapper 上（wrapper 才是 flow 中影響後續元素的元素）
      textEn.parentElement.style.marginBottom = `${heroGapPx}px`;
    }
  }
  if (textCn) wrapElement(textCn, 'hero-text-cn-wrapper');

  // wrap 完成後再洗牌 grid：wrappers 是 grid 直系子元素，要在 wrap 後對 wrapper 派 grid styles
  randomizeHeroLayout();

  // Banner clip-path reveal（4 方向 random，與 faculty card 圖片進場一致風格）
  const heroBanner = /** @type {HTMLElement | null} */ (document.querySelector('.hero-banner'));
  if (heroBanner) {
    const dir = pickHeroDir();
    gsap.set(heroBanner, { clipPath: BANNER_INSET_MAP[dir] });
    tl.set(heroBanner, { visibility: 'visible' }, 0);
    tl.to(heroBanner, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 1.0,
      ease: 'power3.out',
      clearProps: 'clipPath',
    }, 0);
  }

  const titles = [title, titleCn].filter(Boolean);
  const subtitles = [textEn, textCn].filter(Boolean);
  // opt-in：[data-hero-title-last] 存在時 → subtitles 先進場，title 最後
  // 用於 hero 結構為「年份 → 英文 → 中文標題」這種底部為主標的版面（如 degree-show-detail）
  const titleLast = document.querySelector('[data-hero-title-last]') !== null;

  // 為什麼 visibility:visible 用 tl.set 對齊動畫起點而非 gsap.set 立即打開：
  // 若 init 時就 visibility:visible + 位移到 wrapper 外，sub-pixel rounding 會在 wrapper 邊緣露出 ~0.5px 細綫，
  // 動畫前等待視覺上看得到。把可見性切換對齊動畫起點 = 露邊立刻被滑入動作蓋掉，視覺乾淨。

  // 每個 text 元素獨立隨機挑方向，從 4 方向（top/bottom/left/right）任一滑入；
  // 保留原 stagger 0.15 + duration 0.9 + overlap -0.4 節奏
  const ENTER_STAGGER = 0.15;
  const ENTER_DURATION = 0.9;
  const ENTER_OVERLAP = 0.4;

  function addGroupTo(timeline, group, baseTime) {
    group.forEach((el, i) => {
      const from = offsetFor(pickHeroDir());
      gsap.set(el, from);
      const at = baseTime + i * ENTER_STAGGER;
      timeline.set(el, { visibility: 'visible' }, at);
      timeline.to(el, {
        xPercent: 0,
        yPercent: 0,
        duration: ENTER_DURATION,
        clearProps: 'transform',
      }, at);
    });
  }

  const firstGroup = titleLast ? subtitles : titles;
  const secondGroup = titleLast ? titles : subtitles;
  if (firstGroup.length > 0) addGroupTo(tl, firstGroup, 0);
  if (secondGroup.length > 0) {
    const secondStart = firstGroup.length > 0
      ? Math.max(0, (firstGroup.length - 1) * ENTER_STAGGER + ENTER_DURATION - ENTER_OVERLAP)
      : 0;
    addGroupTo(tl, secondGroup, secondStart);
  }

  // 註冊退場動畫：4 方向隨機滑出（每元素獨立），與 banner clip-path 4 方向收合並行
  registerPageExit(playHeroExit);

  // Hero 之後的 main section 蓋在 hero 上方，避免 hero 動畫殘影在 scroll 期間透出來
  if (typeof ScrollTrigger !== 'undefined') {
    const heroSection = title
      ? title.closest('section')
      : document.querySelector('section');
    const mainSection = heroSection ? heroSection.nextElementSibling : null;
    if (mainSection) {
      /** @type {HTMLElement} */ (mainSection).style.position = 'relative';
      /** @type {HTMLElement} */ (mainSection).style.zIndex = '1';
    }
  }
}
