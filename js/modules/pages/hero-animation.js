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
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { DUR, EASE } from '../ui/motion.js';

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

// Layout cache：per-page、per-viewport pre-computed pool (POOL_SIZE 組)
// Why：randomizeHeroLayout 全量計算昂貴（12 attempts × 4 items × 30 candidates + 強制 reflow），
// 同步阻塞換頁 paint 200-500ms。Pool 預存好 N 組，每次 SPA 進入 random pick 一組直接套用 = O(1)。
// User spec：「20-30 組合循環用，沒人會察覺重複」。
//
// Cache key 構造：hero 文字內容 + viewport WxH。
//   - 文字當 page identity：4 頁 hero 文字不同，自然 keyed by page
//   - viewport 改變必須失效：placement 算式依賴 W/H/logo bounds
// 失效：resize 後 key 變化 → 視為 cache miss 重建
const POOL_SIZE = 24;
const layoutPool = new Map();  // key -> array of layout snapshots

function getPoolKey(grid) {
  const heroTexts = ['hero-title', 'hero-title-cn', 'hero-text-en', 'hero-text-cn']
    .map(cls => {
      const el = grid.querySelector(`.${cls}`);
      return el ? (el.textContent || '').slice(0, 40) : '';
    })
    .join('|');
  return `${window.innerWidth}x${window.innerHeight}|${heroTexts}`;
}

// 套用 cache 內 snapshot 到當前 DOM（不重新量測，不跑 placement）
function applyLayoutSnapshot(grid, snapshot) {
  const paragraphs = ['hero-text-en', 'hero-text-cn']
    .map(cls => grid.querySelector(`.${cls}`))
    .filter(Boolean);
  snapshot.paragraphWidths.forEach((w, i) => {
    if (paragraphs[i]) paragraphs[i].style.maxWidth = w;
  });
  // wrapper selector 順序對應 buildLayoutOnce 內 textItems 收集順序
  ['hero-title', 'hero-title-cn', 'hero-text-en', 'hero-text-cn'].forEach((cls, i) => {
    const wrapper = grid.querySelector(`.${cls}-wrapper`) || grid.querySelector(`.${cls}`);
    if (wrapper && snapshot.textPositions[i]) {
      wrapper.style.left = snapshot.textPositions[i].left;
      wrapper.style.top = snapshot.textPositions[i].top;
    }
  });
  const banner = grid.querySelector('.hero-banner');
  if (banner && snapshot.banner) {
    banner.style.left = snapshot.banner.left;
    banner.style.top = snapshot.banner.top;
    banner.style.transform = snapshot.banner.transform;
  }
  // 直接套用該組 build 時量好的 tighten px 寬（不 live re-tighten）：re-tighten 會在別組殘留的 width/maxWidth
  // 下量到不同值 → chip 寬度進場後跳（user 2026-06-07）。同 session 字型/viewport 不變 → 存的 px 寬有效。
  if (snapshot.paragraphTightWidths) {
    snapshot.paragraphTightWidths.forEach((w, i) => {
      if (paragraphs[i] && w) paragraphs[i].style.width = w;
    });
  } else {
    tightenParagraphWidths(grid);  // 舊格式 snapshot fallback（同次 build 的 pool 一定有新欄位，正常不會走到）
  }
}

function tightenParagraphWidths(grid) {
  ['hero-text-en', 'hero-text-cn'].forEach(cls => {
    const p = /** @type {HTMLElement|null} */ (grid.querySelector(`.${cls}`));
    if (!p) return;
    // 先清掉上一輪 tighten 留下的 inline width，量測一律在「當前 maxWidth 的自然 wrap」下做（idempotent）。
    // 否則 cache buildNext 用較小 random maxWidth 把 width 收到較窄值後，applyLayoutSnapshot 還原較寬 maxWidth 時，
    // 殘留的窄 width 仍 cap 住 wrap（width < maxWidth → width 勝）→ tighten 在窄寬量、還原不回原組寬度
    // → hero 說明文字 chip 寬度在進場後「跳一下」（user 2026-06-07 回報；實測 618px→482px）。
    p.style.width = '';
    void p.offsetWidth;  // 強制 reflow，下面 getClientRects 拿到 maxWidth 下的 wrap、不受殘留 width 影響
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

// Build single layout snapshot. 副作用：DOM 上會留下這次的 inline left/top/maxWidth/transform。
// 回傳 snapshot 給 cache 存。Caller 負責在第一次 build 時直接用此 snapshot 進場，避免雙 apply。
function buildLayoutOnce(grid) {
  return runPlacementAndBannerForCache(grid);
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
  // 文字 chip 距 viewport 左右邊界的最小留白：寬螢幕用比例(4%)、48px 下限（user 2026-06-07 反映 chip 太靠邊）。
  // 下限 48 仍保證最寬段落(TEXT_MAX_W_PX 650)在 768px 放得下（650+48*2=746<768）；寬螢幕 4% 給更舒服的 gutter。
  const SIDE_MARGIN = Math.max(48, Math.round(window.innerWidth * 0.04));
  const BOTTOM_MARGIN = 30;
  // BR/BL chip 額外往上抬的 buffer：wrapper rotate ±3° + 寬到 TEXT_MAX_W_PX=550 時
  // 旋轉後 visual 最低點比 getBoundingClientRect 量到的 bbox 底再低 ~sin(3°)×550 ≈ 29px。
  // 不補 buffer，scroll 時長段落 chip 底部會穿出 `<section h-screen overflow-hidden>` 被切。
  // 只影響下方 corner（上方 corner 撞 header / logo 另有 TEXT_TOP_BOUND 處理）。
  const BOTTOM_ROTATION_BUFFER = 60;
  // wrapper rotate ±3° + 長段落 chip 寬可達 TEXT_MAX_W_PX=650：bbox 雖以 visual rect 量但兩 chip 視覺
  // 邊緣仍可能因 rotation 投影貼很近；pad 32 ≈ sin(3°)×650 給足旋轉互不咬的視覺間距。
  // 之前 12 在 user 截圖出現英文 chip 底部「vision.」被中文 chip 頂部蓋住的情況。
  const TEXT_COLLISION_PAD = 32;
  const CORNER_JITTER_FRAC = 0.18;  // 文字距 corner anchor 最多 18% 可用空間（保留邊緣感）
  const TEXT_MIN_W_PX = 500;        // EN / CN 段落最小 max-width（過窄會換太多行、bbox 變高觸發避碰失敗）
  const TEXT_MAX_W_PX = 650;        // EN / CN 段落最大 max-width（每次 refresh 兩段各自隨機）
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

  // 偵測 header logo（180×180、左上，會溢出 header 下方），給 text bbox 當 exclusion zone。
  // header.js 對 lottie SVG 設 `overflow: visible` + viewBox 1080×1080 → 齒輪實際 paint
  // 區域比 180×180 容器大不少，bbox 直接量到的是容器尺寸，視覺上會超出。
  // LOGO_VISUAL_PAD = 視覺溢出緩衝（涵蓋 lottie 三色齒輪外圈 + 視覺呼吸空間），
  // 加太小（如 8）chip 雖在 bbox 外但仍會被齒輪尾蓋住。
  const LOGO_VISUAL_PAD = 60;
  const logoEl = /** @type {HTMLElement|null} */ (document.querySelector('#header-logo'));
  let logoRect = null;
  if (logoEl) {
    const r = logoEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      logoRect = {
        left: r.left - LOGO_VISUAL_PAD,
        top: r.top - LOGO_VISUAL_PAD,
        right: r.right + LOGO_VISUAL_PAD,
        bottom: r.bottom + LOGO_VISUAL_PAD,
      };
    }
  }

  // 對特定 corner 嘗試放置；回傳最佳 (vx, vy, penalty)。不真的 apply。
  // logo collision 硬規則：絕不接受，candidate 撞 logo 就 skip；整輪 30 次都撞就 return penalty=Infinity
  // 強迫 placeTextWithFallback 試其他 corner（hero 4 個 chip 不能被左上大 logo 擋到）。
  function tryPlaceAtCorner(rect, corner) {
    const bbW = rect.width;
    const bbH = rect.height;

    let effectiveTop = TEXT_TOP_BOUND;
    if (logoRect && (corner === 'tl' || corner === 'tr')) {
      const anchorX = (corner === 'tl') ? SIDE_MARGIN : W - bbW - SIDE_MARGIN;
      const xOverlapsLogo = (logoRect.right > anchorX) && (logoRect.left < anchorX + bbW);
      if (xOverlapsLogo) effectiveTop = Math.max(TEXT_TOP_BOUND, logoRect.bottom);
    }

    // 下方 corner 多扣 BOTTOM_ROTATION_BUFFER：留給 wrapper rotation 投影 + section overflow 邊界 buffer
    const isBottomCorner = (corner === 'bl' || corner === 'br');
    const effectiveBottom = BOTTOM_MARGIN + (isBottomCorner ? BOTTOM_ROTATION_BUFFER : 0);
    const xRange = Math.max(0, W - bbW - 2 * SIDE_MARGIN);
    const yRange = Math.max(0, H - bbH - effectiveTop - effectiveBottom);

    let bestVx = SIDE_MARGIN, bestVy = effectiveTop, bestPenalty = Infinity;
    let anyLogoFree = false;
    for (let i = 0; i < 10; i++) {
      const jx = Math.random() * CORNER_JITTER_FRAC * xRange;
      const jy = Math.random() * CORNER_JITTER_FRAC * yRange;
      const vx = (corner === 'tl' || corner === 'bl')
        ? SIDE_MARGIN + jx
        : W - bbW - SIDE_MARGIN - jx;
      const vy = (corner === 'tl' || corner === 'tr')
        ? effectiveTop + jy
        : H - bbH - effectiveBottom - jy;

      const candidate = { left: vx, top: vy, right: vx + bbW, bottom: vy + bbH };
      const collidesLogo = logoRect ? rectsOverlap(logoRect, candidate, 0) : false;
      if (collidesLogo) continue;  // 硬規則：跳過所有撞 logo 的 candidate
      anyLogoFree = true;
      const collidesText = placedTextRects.some(r => rectsOverlap(r, candidate, TEXT_COLLISION_PAD));
      if (!collidesText) { return { vx, vy, penalty: 0, corner }; }

      const penalty = placedTextRects.reduce((s, r) => s + overlapArea(r, candidate), 0);
      if (penalty < bestPenalty) { bestPenalty = penalty; bestVx = vx; bestVy = vy; }
    }
    // 整輪都撞 logo（極小 viewport / 巨大文字 bbox）→ Infinity，逼 fallback 換 corner
    if (!anyLogoFree) return { vx: bestVx, vy: bestVy, penalty: Infinity, corner };
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

  // 3 attempts 對寬段落 + 大 collision pad 不足夠常找到 penalty=0；提到 6 保證更多 viewport 條件下
  // 都能挑到 0-overlap 版本。cache hit 後是 O(1)，build cost 只在第一次 + idle 後台補滿時付。
  const MAX_LAYOUT_ATTEMPTS = 6;
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
  tightenParagraphWidths(grid);
}

// Cache build 用：跑 placement + banner，回傳 snapshot（不收緊 wrap width — 那是套 cache 時當下 DOM 才算）
// 副作用：DOM 留下這次 inline left/top/maxWidth/transform；caller 第一次用可直接 commit 不另外 apply
function runPlacementAndBannerForCache(grid) {
  randomizeHeroLayout();  // 跑完整 placement，DOM 已更新

  // 從 DOM 收 snapshot — 不存 raw rect，存 style inline 值，applyLayoutSnapshot 直接寫回
  const textPositions = ['hero-title', 'hero-title-cn', 'hero-text-en', 'hero-text-cn'].map(cls => {
    const wrapper = grid.querySelector(`.${cls}-wrapper`) || grid.querySelector(`.${cls}`);
    return wrapper ? { left: wrapper.style.left, top: wrapper.style.top } : null;
  });
  const paragraphWidths = ['hero-text-en', 'hero-text-cn'].map(cls => {
    const p = grid.querySelector(`.${cls}`);
    return p ? p.style.maxWidth : '';
  });
  // 也存 tighten 後的「實際 px 寬」（randomizeHeroLayout 結尾已 tighten 過）→ applyLayoutSnapshot 直接寫回、
  // 不再 live re-tighten：re-tighten 在別組殘留的 width/maxWidth 下會量到不同值 → chip 寬度進場後「跳一下」
  // （user 2026-06-07，實測 618↔482/632）。同 session 字型/viewport 不變（resize 會清 pool）→ 存 px 寬安全。
  const paragraphTightWidths = ['hero-text-en', 'hero-text-cn'].map(cls => {
    const p = grid.querySelector(`.${cls}`);
    return p ? p.style.width : '';
  });
  const banner = grid.querySelector('.hero-banner');
  const bannerSnap = banner ? {
    left: banner.style.left,
    top: banner.style.top,
    transform: banner.style.transform,
  } : null;

  return { textPositions, paragraphWidths, paragraphTightWidths, banner: bannerSnap };
}

// Pool 主入口：cache hit 直接套用，miss 則 build 1 組立即用 + 後台補滿剩餘
function applyOrBuildLayout(grid) {
  const key = getPoolKey(grid);
  let pool = layoutPool.get(key);
  if (pool && pool.length > 0) {
    const snap = pool[Math.floor(Math.random() * pool.length)];
    applyLayoutSnapshot(grid, snap);
    return;
  }

  // Cache miss：build 1 組立刻用，後台補滿
  pool = [];
  layoutPool.set(key, pool);
  const first = runPlacementAndBannerForCache(grid);
  pool.push(first);
  tightenParagraphWidths(grid);  // 第一組已 commit 到 DOM，補上 wrap-width 收緊（與 cached path 對齊）

  // 後台補滿剩餘 POOL_SIZE-1 組：每組 build 都會動到 DOM inline style，但 buildLayoutOnce 自己會
  // reset textItems 回 (0,0) 再算，所以後續 build 不會被前一組殘留干擾；不過視覺上 DOM 已是第一組
  // 的 layout（user 看到的），這裡 build 完不要 commit 回 DOM 否則畫面跳。做法：build 完馬上 restore
  // 回第一組 snapshot（cheap，純寫 inline style）
  let nextIndex = 1;
  function buildNext(deadline) {
    while (nextIndex < POOL_SIZE && (!deadline || deadline.timeRemaining() > 2)) {
      const snap = runPlacementAndBannerForCache(grid);
      pool.push(snap);
      nextIndex++;
    }
    // 不管中斷與否，restore DOM 回視覺中那組（第一組）
    applyLayoutSnapshot(grid, pool[0]);
    if (nextIndex < POOL_SIZE) {
      scheduleBuild(buildNext);
    }
  }
  scheduleBuild(buildNext);
}

function scheduleBuild(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1000 });
  } else {
    setTimeout(() => fn({ timeRemaining: () => 50 }), 16);
  }
}

// Resize 失效：清整個 cache（user 拉視窗後新 viewport 第一次跑就 rebuild；同尺寸再 visit 再 cache）
// throttle 200ms 避免 resize 中持續清；listener 全域只註冊一次（module load 時）
let _resizeTimer = null;
window.addEventListener('resize', () => {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => { layoutPool.clear(); }, 200);
});

/**
 * Hero 退場動畫：text 4 方向隨機 slide-out + banner 4 方向 clip-path 收合。
 * 與 page-specific exit handler 並行（page-exit.js 用 Promise.all）。
 */
// 從「當下狀態」把 hero chips（+ banner）收場：desktop playHeroExit 與 mobile 退場共用。
// - chip 用 tl.to（非 fromTo {xPercent:0,yPercent:0}）：進場完成時 clearProps→computed 0,0＝等同舊行為；
//   進場中時 overwrite 殺掉進場、從半開位置順順滑出，不會先跳回 0,0「整張閃一下」再走
//   （user 2026-06-21；對齊 faculty exitFacultyCards 的「從當下倒帶」邏輯）。
// - 未開始進場的 chip（快速切頁還沒輪到，dataset.heroRevealStarted 未設）：kill 排隊 tween + 維持隱藏、
//   不納入退場序列，避免 tl.to 從畫面外起點掃過可見區再離開。
// - banner 用 clip-path：進場中（inline clip 還在）從當下收；進場完成（clearProps 後 computed=none 無法
//   interpolate）才 fromTo 顯式 inset(0%) 起點（見 feedback_clippath_exit_after_clearprops_use_fromto）。
function exitHeroChips(tl, chips, banner) {
  let i = 0;
  chips.forEach(el => {
    if (!(/** @type {HTMLElement} */ (el).dataset.heroRevealStarted)) { gsap.killTweensOf(el); return; }
    const to = offsetFor(pickHeroDir());
    tl.to(el, { xPercent: to.xPercent, yPercent: to.yPercent, duration: 0.5, ease: EASE.exit, overwrite: true }, (i++) * 0.06);
  });
  if (banner) {
    const opts = { clipPath: BANNER_INSET_MAP[pickHeroDir()], duration: 0.5, ease: EASE.exit, overwrite: true };
    const inlineClip = /** @type {HTMLElement} */ (banner).style.clipPath;
    if (inlineClip && inlineClip !== 'none') tl.to(banner, opts, 0);
    else tl.fromTo(banner, { clipPath: 'inset(0% 0% 0% 0%)' }, opts, 0);
  }
}

async function playHeroExit() {
  if (typeof gsap === 'undefined') return;

  const texts = Array.from(document.querySelectorAll(
    '.hero-title, .hero-title-cn, .hero-text-en, .hero-text-cn'
  )).filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null);
  const banner = /** @type {HTMLElement | null} */ (document.querySelector('.hero-banner'));
  // Logo-only hero（about 頁）：進場是 [data-hero-logo] 的 yPercent clip-reveal，退場在下方反向沉出
  const heroLogo = /** @type {HTMLElement | null} */ (document.querySelector('[data-hero-logo]'));

  if (texts.length === 0 && !banner && !heroLogo) return;

  const EXIT_DURATION = 0.5;

  return new Promise(resolve => {
    const tl = gsap.timeline({ onComplete: resolve });

    // chips（hero-title/-cn/-text-en/-cn）+ banner：從當下狀態收場，mid-entrance 不跳回全開（見 exitHeroChips）
    exitHeroChips(tl, texts, banner);

    // Logo-only hero（about）：進場時 onComplete 把 wrapper 設 overflow:visible（露完整 logo）；
    // 退場重新裁切 wrapper 當遮罩，logo yPercent 沉回底邊 = 進場 clip-reveal 的反向
    if (heroLogo) {
      const logoWrapper = /** @type {HTMLElement | null} */ (heroLogo.closest('.hero-logo-wrapper'));
      if (logoWrapper) logoWrapper.style.overflow = 'hidden';
      tl.fromTo(heroLogo,
        { yPercent: 0 },
        {
          yPercent: 100,
          duration: EXIT_DURATION,
          ease: EASE.exit,
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

// ── 手機共用 hero（.hero-mobile，faculty/courses/activities/admission/curriculum）進退場 ──
// 比照桌面 buildHeroTimeline 的節奏做手機鏡像（user 2026-06-12「手機 hero 也要有動畫，跟桌面一樣」）：
//   - bg 圖 clip-path 隨機 4 方向 reveal（= 桌面 .hero-banner，DUR.reveal）
//   - 4 chip 各包 overflow:hidden mask wrapper、隨機 4 方向滑入；titles 先、texts 接續，
//     stagger 0.15 / duration 0.9 / overlap 0.4 同桌面常數
//   - onComplete 發 signalHeroDone → deep-link 等的是「看得見的動畫」而非隱藏的桌面 timeline
//   - 退場：chip 隨機方向滑出 + bg clip 收合（同桌面 playHeroExit 0.5s / stagger 0.06）
// 同構參考：degree-show-data-loader.js setupHeroMobileEntrance（該頁 hero 由 async data 填字、
// 不走 initPageModules 共用 init，自帶一份；含 rotation var 轉移與 paused+double-rAF 的踩坑紀錄）。
function playMobileHeroEntrance() {
  const mobile = /** @type {HTMLElement} */ (document.querySelector('.hero-mobile'));
  const bg = /** @type {HTMLElement | null} */ (mobile.querySelector('.hero-mobile-bg'));
  const titles = ['.hero-mobile-title', '.hero-mobile-title-cn']
    .map(s => /** @type {HTMLElement | null} */ (mobile.querySelector(s))).filter(Boolean);
  const texts = ['.hero-mobile-text-en', '.hero-mobile-text-cn']
    .map(s => /** @type {HTMLElement | null} */ (mobile.querySelector(s))).filter(Boolean);
  const chips = [...titles, ...texts];
  if (!bg && chips.length === 0) { signalHeroDone(); return; }

  // CSS `.hero-mobile-text > *` 對「直接子元素」套 rotate(--hero-mobile-rot) + fit-content：
  // chip 包進 mask wrapper 後不再是直接子 → 把旋轉 var 與 margin 轉移到 wrapper
  // （旋轉跟著 mask 走、chip 在 rotated mask 內滑動，同桌面 wrapper rotate + child slide 結構）
  chips.forEach(chip => {
    const wrapper = document.createElement('div');
    wrapper.style.overflow = 'hidden';
    const rot = chip.style.getPropertyValue('--hero-mobile-rot');
    if (rot) {
      wrapper.style.setProperty('--hero-mobile-rot', rot);
      chip.style.removeProperty('--hero-mobile-rot');
    }
    const mt = getComputedStyle(chip).marginTop;
    if (mt && mt !== '0px') {
      wrapper.style.marginTop = mt;
      chip.style.marginTop = '0';
    }
    chip.parentNode.insertBefore(wrapper, chip);
    wrapper.appendChild(chip);
  });

  // 初始藏起要在同一個 task 內同步 set（hero-mobile-sync 剛把 visibility 打開、瀏覽器還沒 paint → 不閃）
  const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.enter }, onComplete: signalHeroDone });
  if (bg) {
    gsap.set(bg, { clipPath: BANNER_INSET_MAP[pickHeroDir()] });
    tl.to(bg, { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.reveal, clearProps: 'clipPath' }, 0);
  }
  const ENTER_STAGGER = 0.15;
  const ENTER_DURATION = 0.9;
  const ENTER_OVERLAP = 0.4;
  let at = 0;
  let prevLen = 0;
  let scheduled = false;
  [titles, texts].forEach(group => {
    if (group.length === 0) return;
    if (scheduled) at = Math.max(0, at + (prevLen - 1) * ENTER_STAGGER + ENTER_DURATION - ENTER_OVERLAP);
    group.forEach((chip, i) => {
      gsap.set(chip, offsetFor(pickHeroDir()));
      tl.to(chip, { xPercent: 0, yPercent: 0, duration: ENTER_DURATION, clearProps: 'transform',
        onStart: () => { /** @type {HTMLElement} */ (chip).dataset.heroRevealStarted = '1'; } }, at + i * ENTER_STAGGER);
    });
    prevLen = group.length;
    scheduled = true;
  });
  // paused + double-rAF 才 play：init 後同 task 的其餘頁面 init / 重排可能把首 paint 拖到 tween 中段，
  // GSAP 時間制 → paint 出來時已跑一半＝「閃一下出來」（degree-show 2026-06-11 實測踩過）
  requestAnimationFrame(() => requestAnimationFrame(() => tl.play()));

  registerPageExit(() => {
    if (typeof gsap === 'undefined') return Promise.resolve();
    return new Promise(resolve => {
      const out = gsap.timeline({ onComplete: resolve });
      exitHeroChips(out, chips, bg);  // 從當下狀態收場，mid-entrance 不跳回全開（同 desktop playHeroExit）
    });
  });
}

// 每次 initHeroAnimation bump 一次；rAF 內檢查是否仍是當前 init（避免使用者快速連點時
// 上一頁的 rAF 在新頁 DOM 上跑出錯位 wrap）
let _heroInitSeq = 0;

export function initHeroAnimation() {
  // SPA 每頁重置：上頁殘留 `_heroDone=true` 會讓本頁 deep-link 不等動畫直接 scroll
  _heroDone = false;
  const mySeq = ++_heroInitSeq;
  const isStale = () => mySeq !== _heroInitSeq;

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
    const gridNoGsap = document.querySelector('.hero-rand-grid');
    if (gridNoGsap) applyOrBuildLayout(gridNoGsap);
    signalHeroDone();
    return;
  }

  // 手機共用 hero：桌面 timeline 動的是 .hero-rand-grid 內元素（手機 display:none，動了也看不見）
  // → 改跑 .hero-mobile-* 鏡像進退場（見 playMobileHeroEntrance），桌面整段不建構
  if (window.innerWidth < 768 && document.querySelector('.hero-mobile')) {
    playMobileHeroEntrance();
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
        duration: DUR.reveal,
        delay: 0.3,
        ease: EASE.enter,
        clearProps: 'transform',
        onComplete: () => {
          // 解除 wrapper 裁切，讓後續 scroll parallax (scale+yPercent) 顯示完整 logo
          if (logoWrapper) logoWrapper.style.overflow = 'visible';
        },
      }
    );
  }

  // 註冊退場動畫（4 方向滑出 / banner clip 收合 / logo 沉出）—— 在此處註冊而非 buildHeroTimeline 內，
  // 因 logo-only 頁（about）會在下方 early return、進不到 buildHeroTimeline，否則 logo 退場不會註冊
  registerPageExit(playHeroExit);

  const title = document.querySelector('.hero-title');
  const titleCn = document.querySelector('.hero-title-cn');
  const textEn = document.querySelector('.hero-text-en');
  const textCn = document.querySelector('.hero-text-cn');

  if (!title && !titleCn && !textEn && !textCn) {
    // 沒任何 hero 文字（如僅 logo 頁），不會經過 timeline → 直接 signal 避免 caller 等到 timeout
    signalHeroDone();
    return;
  }

  // 把 heavy work（wrap + layout pool + gsap timeline build）延到下一幀
  // Why：router 剛 swap 完 main DOM，瀏覽器還沒 paint 新內容；若同步做 hero 動畫 build（含
  // applyOrBuildLayout 第一次的 placement 計算 + 大量 getBoundingClientRect），main thread 阻塞
  // 200-500ms 才 paint，user 視覺上「點連結 → 凍住 → 才看到動畫」。
  // 用 requestAnimationFrame：先讓瀏覽器 paint 新頁靜態樣子（即使 hero 元素 visibility:hidden 也 OK），
  // 下一幀再做 hero build → 視覺上「點連結 → 立刻換頁 → 16ms 後 hero 動畫進場」。
  requestAnimationFrame(() => {
    if (isStale()) return;  // 使用者已切到下一頁，放棄本次 build
    // 量測前等字體載入：FACULTY 等寬標題在 fallback 字型下被低估寬度，placement 用該值定位後字型載入撐大 →
    //   chip 衝破 SIDE_MARGIN 邊界（user 2026-06-07 反映 hero chip 太靠/超出邊）。chip 在 build 前都 visibility:hidden，
    //   故等字體不會 FOUC、也不會 reposition jump。fonts 已 ready 同步 build 不延遲；timeout 兜底避免極端情況卡住。
    if (document.fonts && document.fonts.status !== 'loaded') {
      let built = false;
      const go = () => { if (built || isStale()) return; built = true; buildHeroTimeline(); };
      document.fonts.ready.then(go);
      setTimeout(go, 400);
    } else {
      buildHeroTimeline();
    }
  });

  function buildHeroTimeline() {
  const tl = gsap.timeline({
    defaults: { ease: EASE.enter },
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

  // wrap 完成後再算 layout：wrappers 是 grid 直系子元素，要在 wrap 後對 wrapper 派 grid styles
  // Pool-cache 版：cache hit O(1) 套用；miss 才 build（且只 build 1 組立即用，剩餘 idle 補滿）
  const grid = document.querySelector('.hero-rand-grid');
  if (grid) applyOrBuildLayout(grid);

  // Banner clip-path reveal（4 方向 random，與 faculty card 圖片進場一致風格）
  const heroBanner = /** @type {HTMLElement | null} */ (document.querySelector('.hero-banner'));
  if (heroBanner) {
    const dir = pickHeroDir();
    gsap.set(heroBanner, { clipPath: BANNER_INSET_MAP[dir] });
    tl.set(heroBanner, { visibility: 'visible' }, 0);
    tl.to(heroBanner, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: DUR.reveal,
      ease: EASE.enter,
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

  function addGroupTo(timeline, group, baseTime, stagger = ENTER_STAGGER) {
    group.forEach((el, i) => {
      const from = offsetFor(pickHeroDir());
      gsap.set(el, from);
      const at = baseTime + i * stagger;
      timeline.set(el, { visibility: 'visible' }, at);
      timeline.to(el, {
        xPercent: 0,
        yPercent: 0,
        duration: ENTER_DURATION,
        clearProps: 'transform',
        // 標記「已開始進場」：離頁退場 exitHeroChips 只收已開始的 chip，沒輪到的維持隱藏不掃過畫面
        onStart: () => { /** @type {HTMLElement} */ (el).dataset.heroRevealStarted = '1'; },
      }, at);
    });
  }

  // 手機 rand-grid：先前 faculty 段落流到第二屏需 ScrollTrigger reveal；2026-05-26 改 layout 後段落改成
  // 接在 title 下方首屏可見，不再需要 ScrollTrigger 分流 → 全走主 timeline。
  // 變數保留方便將來若有「段落仍在第二屏」的 rand-grid 頁面（courses/activities/admission 等）改回 true 時 toggle 條件
  const isMobileRandGrid = false;
  const subtitleScrollGroup = isMobileRandGrid ? subtitles : [];
  const inlineSubtitles = isMobileRandGrid ? [] : subtitles;

  // 進場 group 序列：group 之間 ENTER_OVERLAP 接續、group 內 ENTER_STAGGER。
  // ① 顯式 [data-hero-enter="N"]（chip 自宣告組序，N 小先進、同 N 一組、組內 DOM 序）優先 —
  //    給 hero-* class 語意跟視覺意圖不符的頁用（degree-show-detail：年份=hero-text-en / 英標=hero-text-cn /
  //    中標=hero-title，class-based 分不出「年份先、英中標題一起」的意圖；user 2026-06-03）。
  // ② 無顯式宣告 → class-based fallback：titles vs subtitles + [data-hero-title-last] 決定誰先。
  const animatedChips = new Set([title, titleCn, textEn, textCn].filter(Boolean));
  const explicitEls = Array.from(document.querySelectorAll('[data-hero-enter]'))
    .filter(el => animatedChips.has(el));  // querySelectorAll = DOM 序 → 同組內自然 top-down
  let enterGroups;
  if (explicitEls.length > 0) {
    const byGroup = new Map();
    explicitEls.forEach(el => {
      const n = parseInt(/** @type {HTMLElement} */ (el).getAttribute('data-hero-enter') || '0', 10) || 0;
      if (!byGroup.has(n)) byGroup.set(n, []);
      byGroup.get(n).push(el);
    });
    enterGroups = [...byGroup.keys()].sort((a, b) => a - b).map(k => byGroup.get(k));
  } else {
    enterGroups = titleLast ? [inlineSubtitles, titles] : [titles, inlineSubtitles];
  }

  // 顯式分組：同 N 一組 = 一起進場（stagger 0、同 t）；class-based fallback 維持組內 0.15 stagger（faculty 等不變）
  const groupStagger = explicitEls.length > 0 ? 0 : ENTER_STAGGER;
  // 依序排程：每個非空 group 起跑 = 前一非空 group「最後一個 stagger + duration - overlap」
  let groupStart = 0;
  let prevLen = 0;
  let scheduled = false;
  enterGroups.forEach(group => {
    if (!group || group.length === 0) return;
    if (scheduled) groupStart = Math.max(0, groupStart + (prevLen - 1) * groupStagger + ENTER_DURATION - ENTER_OVERLAP);
    addGroupTo(tl, group, groupStart, groupStagger);
    prevLen = group.length;
    scheduled = true;
  });

  // 手機段落 chip：scroll 到視窗時做 4 方向 slide-in（與 hero 標題同 pattern；wrapper overflow:hidden 已套）
  if (subtitleScrollGroup.length > 0 && typeof ScrollTrigger !== 'undefined') {
    // 預設 hidden：先設方向 offset + visibility（與 addGroupTo 對齊，避免 ScrollTrigger fire 前看到位置已就位）
    const presets = subtitleScrollGroup.map(el => {
      const from = offsetFor(pickHeroDir());
      gsap.set(el, { ...from, visibility: 'visible' });
      return { el, from };
    });
    const triggers = presets.map(({ el }, i) => ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          xPercent: 0,
          yPercent: 0,
          duration: ENTER_DURATION,
          ease: EASE.enter,
          delay: i * 0.1,
          clearProps: 'transform',
        });
      },
    }));
    registerPageCleanup(() => triggers.forEach(t => t && t.kill()));
  }

  // （playHeroExit 已在上層 init 早段註冊，含 logo-only 頁；此處不再重複註冊）

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
  }  // end buildHeroTimeline
}
