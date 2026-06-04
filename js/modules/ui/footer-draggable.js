/**
 * Footer Scatter Module (檔名沿用 footer-draggable.js；drag 功能已移除)
 *
 * 桌面 .footer-random 內 items 每次刷新 + 每 10s random 散佈：
 *   1. wrapItemsInAnchors：動態包每個 item 在 .footer-anchor (position:absolute + overflow:clip + opacity:0)
 *   2. awaitLayoutReady：等 fonts.ready + container 尺寸
 *   3. Init：build 1 個 verified layout 當 initial display + 後續 shuffle fallback
 *   4. 初始 reveal：套 initial layout → anchor opacity:1 → playRandomDirReveal items
 *   5. startShuffleLoop：每 10s 跑 shuffleAll = exit → 即時 generate+verify 新 layout → playRandomDirReveal
 *
 * 2026-05-29 從 pre-cache 10 個 layout 改成每次 shuffle 即時 generate — user 反饋
 * 「每次 random 都是一樣 pos」(10 個 cache 輪播看得出來)；verified 機制保留（每次 generate 最多重試
 * 30 次直到 no-overlap），確保「所有 items 都可見」原始 spec；30 次都失敗才 fallback init layout。
 *
 * Pattern reference: js/modules/pages/error-404.js
 */

// 注意：原本用 playClipReveal (僅 yPercent)；改成 4-direction 自己處理 x/y 兩軸
// import { playClipReveal } from './scroll-animate.js';
import { awaitLayoutReady } from './await-layout-ready.js';
import { DUR, EASE } from './motion.js';

// 4 個 entry/exit 方向（random per item per shuffle）— 對齊 hero clip-reveal pattern 但擴成雙軸
const ENTRY_DIRECTIONS = ['top', 'right', 'bottom', 'left'];

function getHiddenTransform(direction) {
  switch (direction) {
    case 'top':    return { xPercent: 0, yPercent: -HIDDEN_YPERCENT };
    case 'right':  return { xPercent: HIDDEN_YPERCENT, yPercent: 0 };
    case 'bottom': return { xPercent: 0, yPercent: HIDDEN_YPERCENT };
    case 'left':   return { xPercent: -HIDDEN_YPERCENT, yPercent: 0 };
    default:       return { xPercent: 0, yPercent: HIDDEN_YPERCENT };
  }
}

function pickRandomDirection() {
  return ENTRY_DIRECTIONS[Math.floor(Math.random() * ENTRY_DIRECTIONS.length)];
}

function hideItemsRandomDirection(items) {
  if (typeof gsap === 'undefined') return;
  items.forEach((item) => {
    const t = getHiddenTransform(pickRandomDirection());
    gsap.set(item, t);
  });
}

function playRandomDirReveal(items) {
  if (typeof gsap === 'undefined') return;
  gsap.killTweensOf(items);
  gsap.to(items, {
    xPercent: 0,
    yPercent: 0,
    duration: DUR.reveal,
    ease: EASE.enter,
    stagger: { each: 0.12, axis: 'y' },
    overwrite: true,
    clearProps: 'transform',
  });
}

// 桌面拆 9 items 個別 scatter（手機 .footer-social 維持 flex 一條排）
const ITEM_SELECTORS = [
  '.footer-fax',
  '.footer-tel',
  '.footer-office',
  '.footer-email',
  '.footer-links',
  '.footer-youtube',
  '.footer-instagram',
  '.footer-facebook',
  '.footer-support', // donation icon
];

const ROTATION_RANGE = 12;          // ±度數
const CARD_GAP_PX = 24;             // 卡片間 + obstacle buffer（bbox 階段用）
const VERIFY_PADDING_PX = 8;        // actual-rect verify 階段 padding
const MAX_PLACE_ATTEMPTS = 200;     // 單張卡找位置最多試幾次

// Links 限定在 area 底部 30% 區域
const LINKS_BOTTOM_REGION_RATIO = 0.7;

// 隱藏狀態的 yPercent over-shoot（防 sub-pixel 殘影）
const HIDDEN_YPERCENT = 110;

// 10s shuffle loop（從原本 5s 放慢，user 覺得 5s 太頻繁眼花）
const SHUFFLE_INTERVAL_MS = 10000;
const SHUFFLE_EXIT_S = 0.6;
const SHUFFLE_EXIT_STAGGER = 0.06;

// Init 階段 build 1 個 verified layout（第一眼正常）；後續每次 shuffle 在 exit 動畫期間
// 即時重新 generate+verify 1 個新 layout（見 shuffleAll），不再從 cache 輪播。
// 放棄 cache 是因為 user 反饋「每次 random 都是一樣 pos」— 10 個 layout 輪播 user 看得出來。
// MAX_REGEN=30 保留 verified 機制確保所有 items 可見無重疊，build 平均幾十毫秒
// shuffle 0.6s exit 期間 user 感覺不到延遲。
const TARGET_LAYOUTS = 1;
const MAX_REGEN_PER_LAYOUT = 30;

let shuffleTimer = null;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// 旋轉後 axis-aligned bbox
function rotatedBBox(w, h, deg) {
  const r = Math.abs(deg) * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { w: w * c + h * s, h: h * c + w * s };
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function domRectsOverlap(a, b, padding) {
  return !(
    a.right + padding <= b.left ||
    b.right + padding <= a.left ||
    a.bottom + padding <= b.top ||
    b.bottom + padding <= a.top
  );
}

// waitForLayoutReady 已抽出到 js/modules/ui/await-layout-ready.js（共用 helper）

function wrapItemsInAnchors(items) {
  return items.map((item) => {
    const parent = item.parentElement;
    if (!parent) return null;
    if (parent.classList.contains('footer-anchor')) return parent;
    const anchor = document.createElement('div');
    anchor.className = 'footer-anchor';
    parent.insertBefore(anchor, item);
    anchor.appendChild(item);
    return anchor;
  }).filter(Boolean);
}

function obstacleRectLocal(obstacleEl, areaRect) {
  const r = obstacleEl.getBoundingClientRect();
  return {
    x: r.left - areaRect.left,
    y: r.top - areaRect.top,
    w: r.width,
    h: r.height,
  };
}

/**
 * 生成單一 placement candidate（純數學 bbox collision），不 apply 到 DOM。
 * 回傳 [{anchor, cx, cy, rot}]；length === anchors.length 表示所有 items 都成功 placed
 */
function generatePlacement(area, anchors, obstacles) {
  const areaRect = area.getBoundingClientRect();
  const sw = areaRect.width;
  const sh = areaRect.height;
  if (sw === 0 || sh === 0) return [];

  const obstacleRects = obstacles.map((o) => obstacleRectLocal(o, areaRect));

  // 順序：Links 先（限定底部），其他依面積降序
  const indexed = anchors.map((a, i) => ({ idx: i, anchor: a }));
  const linksEntry = indexed.find(({ anchor }) => {
    const inner = anchor.firstElementChild;
    return inner && inner.classList.contains('footer-links');
  });
  const others = indexed.filter((e) => e !== linksEntry);
  others.sort((a, b) => {
    const aArea = a.anchor.offsetWidth * a.anchor.offsetHeight;
    const bArea = b.anchor.offsetWidth * b.anchor.offsetHeight;
    return bArea - aArea;
  });
  const order = linksEntry ? [linksEntry.idx, ...others.map((e) => e.idx)] : others.map((e) => e.idx);

  const placedRects = [];
  const placements = [];
  let linksTopY = null;

  for (const idx of order) {
    const anchor = anchors[idx];
    const inner = anchor.firstElementChild;
    const isLinks = inner && inner.classList.contains('footer-links');

    const prevTransform = anchor.style.transform;
    anchor.style.transform = 'none';
    const natW = anchor.offsetWidth;
    const natH = anchor.offsetHeight;
    anchor.style.transform = prevTransform;

    if (natW === 0 || natH === 0) continue;

    let accepted = null;
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
      const rot = rand(-ROTATION_RANGE, ROTATION_RANGE);
      const bb = rotatedBBox(natW, natH, rot);

      const cxMin = bb.w / 2 + CARD_GAP_PX;
      const cxMax = sw - bb.w / 2 - CARD_GAP_PX;
      let cyMin = bb.h / 2 + CARD_GAP_PX;
      let cyMax = sh - bb.h / 2 - CARD_GAP_PX;

      if (isLinks) {
        cyMin = Math.max(cyMin, sh * LINKS_BOTTOM_REGION_RATIO);
      } else if (linksTopY !== null) {
        cyMax = Math.min(cyMax, linksTopY - CARD_GAP_PX - bb.h / 2);
      }

      if (cxMax <= cxMin || cyMax <= cyMin) break;

      const cx = rand(cxMin, cxMax);
      const cy = rand(cyMin, cyMax);
      const rect = { x: cx - bb.w / 2, y: cy - bb.h / 2, w: bb.w, h: bb.h };
      const inflated = {
        x: rect.x - CARD_GAP_PX,
        y: rect.y - CARD_GAP_PX,
        w: rect.w + 2 * CARD_GAP_PX,
        h: rect.h + 2 * CARD_GAP_PX,
      };

      let ok = true;
      for (const o of obstacleRects) {
        if (rectsOverlap(inflated, o)) { ok = false; break; }
      }
      if (ok) for (const e of placedRects) if (rectsOverlap(inflated, e)) { ok = false; break; }
      if (ok) {
        accepted = { rect, cx, cy, rot };
        break;
      }
    }

    if (!accepted) continue;
    placedRects.push(accepted.rect);
    placements.push({ anchor, cx: accepted.cx, cy: accepted.cy, rot: accepted.rot });
    if (isLinks) linksTopY = accepted.rect.y;
  }

  return placements;
}

/**
 * 套用 placement 到 DOM（gsap.set 各 anchor position+rotation；不動 opacity）
 * opacity 留給 initial reveal 控制；shuffle 中 anchor opacity 應該保持 1
 */
function applyPlacement(placement) {
  placement.forEach(({ anchor, cx, cy, rot }) => {
    if (typeof gsap !== 'undefined') {
      gsap.set(anchor, {
        left: cx,
        top: cy,
        xPercent: -50,
        yPercent: -50,
        rotation: rot,
      });
    } else {
      anchor.style.left = `${cx}px`;
      anchor.style.top = `${cy}px`;
      anchor.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
    }
  });
}

/**
 * 用 actual rendered rect 驗證 placement: pairwise + vs obstacles 都不重疊回 true
 * 必要：apply 完先 `void area.offsetHeight` 強制 sync reflow 才讀 getBoundingClientRect
 */
function verifyPlacement(area, anchors, obstacles) {
  void area.offsetHeight; // force sync reflow
  const liveRects = anchors.map((a) => a.getBoundingClientRect());
  const obsLive = obstacles.map((o) => o.getBoundingClientRect());

  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      if (domRectsOverlap(liveRects[i], liveRects[j], VERIFY_PADDING_PX)) return false;
    }
  }
  for (let i = 0; i < anchors.length; i++) {
    for (const ob of obsLive) {
      if (domRectsOverlap(liveRects[i], ob, VERIFY_PADDING_PX)) return false;
    }
  }
  return true;
}

/**
 * 預先 build cache: 生成 TARGET_LAYOUTS=10 個 verified 完整 layouts
 * 每個 layout 保證 (1) 所有 anchors 都成功 placed (2) 套上去後 actual rect 無重疊
 * 失敗的 candidate 直接丟掉重試，最多 MAX_REGEN_PER_LAYOUT=30 次
 */
async function buildLayoutCache(area, anchors, obstacles) {
  const layouts = [];
  for (let i = 0; i < TARGET_LAYOUTS; i++) {
    for (let attempt = 0; attempt < MAX_REGEN_PER_LAYOUT; attempt++) {
      const placement = generatePlacement(area, anchors, obstacles);
      if (placement.length !== anchors.length) continue; // 沒全 placed → 丟掉
      applyPlacement(placement);
      if (verifyPlacement(area, anchors, obstacles)) {
        layouts.push(placement);
        break;
      }
    }
    // 每 3 個 layout 讓出一個 frame 避免 init 卡 UI
    if (i % 3 === 2) await new Promise((r) => requestAnimationFrame(r));
  }
  // Fallback：完全建不出 verified layout → 至少 push 一個 best-effort (極罕見)
  if (layouts.length === 0) {
    layouts.push(generatePlacement(area, anchors, obstacles));
  }
  return layouts;
}

/**
 * 三段式 shuffle: exit yPercent → onComplete 即時 generate+verify 新 layout → playClipReveal
 * fallbackLayout：init 階段 build 好的 layout，當即時 generate 30 次都失敗時 fallback 用它
 */
function shuffleAll(area, anchors, obstacles, items, fallbackLayout) {
  if (typeof gsap === 'undefined') return;
  // generate / library / atlas 頁 router 把 footer 設 display:none，shuffleTimer 不清會繼續對隱藏
  // anchors 做 GSAP tween + apply layout（讀 area.getBoundingClientRect 為 0×0 → 數學運算閒置成本 + reflow）
  // offsetParent === null 是 display:none 最便宜的偵測（含任何 ancestor display:none）
  if (!area || area.offsetParent === null) return;
  gsap.killTweensOf(items);

  // Exit: random direction per item
  const exitDirs = items.map(() => pickRandomDirection());
  gsap.to(items, {
    xPercent: (i) => getHiddenTransform(exitDirs[i]).xPercent,
    yPercent: (i) => getHiddenTransform(exitDirs[i]).yPercent,
    duration: SHUFFLE_EXIT_S,
    ease: EASE.enter,
    stagger: { each: SHUFFLE_EXIT_STAGGER, axis: 'y' },
    overwrite: 'auto',
    onComplete: () => {
      // 即時 generate + verify 新 layout（不再從 cache 挑）
      let fresh = null;
      for (let attempt = 0; attempt < MAX_REGEN_PER_LAYOUT; attempt++) {
        const placement = generatePlacement(area, anchors, obstacles);
        if (placement.length !== anchors.length) continue;
        applyPlacement(placement);
        if (verifyPlacement(area, anchors, obstacles)) {
          fresh = placement;
          break;
        }
      }
      if (!fresh) applyPlacement(fallbackLayout);
      // Enter: reset items to new random direction (independent of exit dir)
      hideItemsRandomDirection(items);
      playRandomDirReveal(items);
    },
  });
}

function startShuffleLoop(area, anchors, obstacles, items, fallbackLayout) {
  stopShuffleLoop();
  shuffleTimer = window.setInterval(
    () => shuffleAll(area, anchors, obstacles, items, fallbackLayout),
    SHUFFLE_INTERVAL_MS,
  );
}

function stopShuffleLoop() {
  if (shuffleTimer != null) {
    clearInterval(shuffleTimer);
    shuffleTimer = null;
  }
}

export async function initFooterScatter(scope) {
  if (window.innerWidth < 768) return;

  const footer = scope || document.querySelector('footer.footer-shell, footer#site-footer-static');
  if (!footer) return;

  const area = footer.querySelector('.footer-random');
  if (!area) return;

  const rawItems = /** @type {HTMLElement[]} */ (
    Array.from(footer.querySelectorAll(ITEM_SELECTORS.join(',')))
      // 排除 display:none 的 item。不排除的話 wrapItemsInAnchors 會把 0×0 元素也包進 anchors，
      // generatePlacement 對 0×0 continue 跳過 → placement.length < anchors.length → verify 條件
      // 「length 必須相等」整輪丟 → 每次 shuffle 都 30 次失敗走 fallbackLayout → 所有 item 回原位。
      .filter((el) => el.offsetParent !== null)
  );
  if (rawItems.length === 0) return;

  // 必須先等 layout ready 才建 .footer-anchor。
  // router.js 的「無 .footer-anchor → 重 init」recovery 機制把 anchor 存在當「init 成功」proxy；
  // 若 await 前就 wrap，display:none / 0×0 race 時也會建 anchor → recovery 永遠跳過 → footer 卡壞狀態。
  const ready = await awaitLayoutReady(area);
  if (!ready) return;

  const anchors = wrapItemsInAnchors(rawItems);
  const items = anchors.map((a) => a.firstElementChild).filter(Boolean);
  if (anchors.length === 0 || items.length === 0) return;

  const privacy = footer.querySelector('.footer-privacy');
  const obstacles = privacy ? [privacy] : [];

  // 初始：items 隨機 4 方向其一隱藏（anchor opacity 從 CSS default 0 起）
  hideItemsRandomDirection(items);

  // Init 階段 build 1 個 verified layout 當 initial display + 後續 shuffle fallback
  // （shuffle 即時 generate 30 次都失敗時用這個保底）
  const initialLayouts = await buildLayoutCache(area, anchors, obstacles);
  const fallbackLayout = initialLayouts[0];

  // 套 initial layout
  applyPlacement(fallbackLayout);

  // 等 1 frame 讓 gsap.set 位置 settle 後再 reveal
  await new Promise((r) => requestAnimationFrame(r));

  if (typeof gsap !== 'undefined') {
    gsap.set(anchors, { opacity: 1 });
    playRandomDirReveal(items);
  } else {
    anchors.forEach((a) => { a.style.opacity = '1'; });
  }

  startShuffleLoop(area, anchors, obstacles, items, fallbackLayout);
}
