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

// scatter items 用 4-direction 雙軸自己處理（不用 playClipReveal 的單軸）；
// 規章區 4 連結改用 setupClipReveal 各自包 overflow:clip 遮罩做獨立 clip-reveal（見 playFooterExit）
import { setupClipReveal } from './scroll-animate.js';
import { awaitLayoutReady } from './await-layout-ready.js';
import { DUR, EASE } from './motion.js';
// 沿用 header bars 的 clip-path 收/展（user 2026-06-07：footer logo 隱藏要跟 header logo 同法、不用 opacity）
import { animateHeaderHide, animateHeaderShow } from '../lightbox/lightbox-shell.js';

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
  '.footer-link-item', // 原 Links 卡拆成兩張獨立 link 卡（共用此 class）
  '.footer-youtube',
  '.footer-instagram',
  '.footer-facebook',
];

// 三原色 accent 底色塊：只套在「會變化的文字內容」(scatter text blocks)，每次 shuffle 重新隨機。
// 桌面 only（initFooterScatter < 768 early return）；social icon items 不套（保留去背 icon）。
const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
const TEXT_ITEM_SELECTOR = '.footer-fax, .footer-tel, .footer-office, .footer-email, .footer-link-item';

function applyAccentColors(items) {
  items.forEach((item) => {
    if (item && item.matches && item.matches(TEXT_ITEM_SELECTOR)) {
      item.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    }
  });
}

const ROTATION_RANGE = 12;          // ±度數
const CARD_GAP_PX = 24;             // 卡片間 + obstacle buffer（bbox 階段用）
const VERIFY_PADDING_PX = 8;        // actual-rect verify 階段 padding
const MAX_PLACE_ATTEMPTS = 200;     // 單張卡找位置最多試幾次

// 兩張 link 卡都限定在 area 底部 30% 區域（其他卡排在 link 卡上方）
const LINKS_BOTTOM_REGION_RATIO = 0.7;

// 隱藏狀態的 yPercent over-shoot（防 sub-pixel 殘影）
const HIDDEN_YPERCENT = 110;

// 10s shuffle loop（從原本 5s 放慢，user 覺得 5s 太頻繁眼花）
const SHUFFLE_INTERVAL_MS = 10000;
const SHUFFLE_EXIT_S = 0.6;
const SHUFFLE_EXIT_STAGGER = 0.06;

// 離頁退場（playFooterExit）的 stagger：散佈 items 與 logo/privacy extras 共用。設 0 = 全部同時出場、
// 出場時長完全一致（user 2026-06-08 要「都一樣」）。原本用 {amount:0.2, axis:'y'}：axis:'y' 是依 Y 座標的
// spatial stagger，在「8 個散佈 items」vs「2 個 extras」元素數/位置不同下展成不同落差 → logo/legal 看起來比較快。
// 共用 0 就保證每個元素 duration/ease/起跑全同、同時收完。
const FOOTER_EXIT_STAGGER = 0;

// 離頁退場時長＝DUR.medium(0.5s)，直接照 hero exit（hero-animation.js EXIT_DURATION=0.5 + EASE.exit/power3.in）。
// 歷史：曾為「對齊頁面 cascade 總長」拉到 0.75s，但 power3.in 在 0.75s 前段空白被放大＝「delay 很久才走」
// （user 2026-06-08；中途試 power2.in@0.75 仍怪）→ user 要直接照 hero clip-reveal 設定 → 縮回 0.5s 配 power3.in 就順。
const FOOTER_EXIT_DUR = DUR.medium;

// Init 階段 build 1 個 verified layout（第一眼正常）；後續每次 shuffle 在 exit 動畫期間
// 即時重新 generate+verify 1 個新 layout（見 shuffleAll），不再從 cache 輪播。
// 放棄 cache 是因為 user 反饋「每次 random 都是一樣 pos」— 10 個 layout 輪播 user 看得出來。
// MAX_REGEN=30 保留 verified 機制確保所有 items 可見無重疊，build 平均幾十毫秒
// shuffle 0.6s exit 期間 user 感覺不到延遲。
const TARGET_LAYOUTS = 1;
const MAX_REGEN_PER_LAYOUT = 30;

// Shuffle 排程改用 setTimeout 鏈（取代 setInterval）以支援 hover pause/resume：
// hover 任一 scatter item 凍結倒數，離開後從剩餘時間續跑（user 2026-06-06）。
let shuffleTimer = null;
let shuffleCtx = null;          // { area, anchors, obstacles, items, fallbackLayout }
let shuffleScheduledAt = 0;     // 本輪倒數起算時間（performance.now()）
let shuffleRemainingMs = SHUFFLE_INTERVAL_MS;
let shufflePaused = false;

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

// 地址卡寬度貼齊「實際 textbox」：英文地址在 .max-w-sm(24rem) 內 wrap，但 block 的 max-content 被
// cap 在 24rem → shrink-to-fit 用 24rem 當卡寬，比真正最長一行寬、右側殘留空白。
// 用 TreeWalker 量所有 text node 的最右 pixel = 實際最長行寬，把 .footer-office width 鎖到「最長行 +
// 左右 padding」→ 去掉空白、卡片貼齊文字（中文 nowrap 行通常最寬，自然成為卡寬基準）。
// 先 clear width 再量 → re-init（router recovery）時不會疊用上一輪鎖死的寬度。box-sizing:border-box
// → width 含 padding。一次性（fonts.ready 後文字寬不再變），不在每次 shuffle 重算。
function applyOfficeSnugWidth(office) {
  if (!office) return;
  office.style.width = '';
  void office.offsetWidth; // force reflow 讓 shrink-to-fit 還原自然寬
  const cs = getComputedStyle(office);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const contentLeft = office.getBoundingClientRect().left + padL;
  let maxRight = 0;
  const walker = document.createTreeWalker(office, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      const off = r.right - contentLeft;
      if (off > maxRight) maxRight = off;
    }
  }
  if (maxRight > 0) office.style.width = `${Math.ceil(maxRight) + padL + padR + 1}px`;
}

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

  // 順序：兩張 link 卡先（都限定底部當「地板」），其他依面積降序排在 link 卡上方
  const indexed = anchors.map((a, i) => ({ idx: i, anchor: a }));
  const isLinkAnchor = (anchor) => {
    const inner = anchor.firstElementChild;
    return !!(inner && inner.classList.contains('footer-link-item'));
  };
  const linkEntries = indexed.filter((e) => isLinkAnchor(e.anchor));
  const others = indexed.filter((e) => !isLinkAnchor(e.anchor));
  others.sort((a, b) => {
    const aArea = a.anchor.offsetWidth * a.anchor.offsetHeight;
    const bArea = b.anchor.offsetWidth * b.anchor.offsetHeight;
    return bArea - aArea;
  });
  const order = [...linkEntries.map((e) => e.idx), ...others.map((e) => e.idx)];

  const placedRects = [];
  const placements = [];
  let linksTopY = null;

  for (const idx of order) {
    const anchor = anchors[idx];
    const inner = anchor.firstElementChild;
    const isLinks = inner && inner.classList.contains('footer-link-item');

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
    // 兩張 link 卡都在底部 → linksTopY 取兩者較高的 top，其他卡才會全部排在它們上方
    if (isLinks) linksTopY = (linksTopY === null) ? accepted.rect.y : Math.min(linksTopY, accepted.rect.y);
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
      // 每次 shuffle 重新隨機三原色底色（此時 items 已 exit 移出視野，換色不被看到）
      applyAccentColors(items);
      // Enter: reset items to new random direction (independent of exit dir)
      hideItemsRandomDirection(items);
      playRandomDirReveal(items);
    },
  });
}

function runShuffleTick() {
  if (!shuffleCtx) return;
  const { area, anchors, obstacles, items, fallbackLayout } = shuffleCtx;
  shuffleAll(area, anchors, obstacles, items, fallbackLayout);
  scheduleNextShuffle(SHUFFLE_INTERVAL_MS);
}

function scheduleNextShuffle(delay) {
  if (shuffleTimer != null) clearTimeout(shuffleTimer);
  shuffleRemainingMs = delay;
  shuffleScheduledAt = performance.now();
  shuffleTimer = window.setTimeout(runShuffleTick, delay);
}

function startShuffleLoop(area, anchors, obstacles, items, fallbackLayout) {
  stopShuffleLoop();
  shuffleCtx = { area, anchors, obstacles, items, fallbackLayout };
  shufflePaused = false;
  scheduleNextShuffle(SHUFFLE_INTERVAL_MS);
}

function stopShuffleLoop() {
  if (shuffleTimer != null) {
    clearTimeout(shuffleTimer);
    shuffleTimer = null;
  }
  shufflePaused = false;
}

// Hover freeze：凍結倒數（記下剩餘時間）；離開後從剩餘時間續排下一次 shuffle。
// 倒數剛好 fire 中（timer null）或已暫停則 no-op。
function pauseShuffleLoop() {
  if (shufflePaused || shuffleTimer == null) return;
  shufflePaused = true;
  clearTimeout(shuffleTimer);
  shuffleTimer = null;
  const elapsed = performance.now() - shuffleScheduledAt;
  shuffleRemainingMs = Math.max(0, shuffleRemainingMs - elapsed);
}

function resumeShuffleLoop() {
  if (!shufflePaused) return;
  shufflePaused = false;
  scheduleNextShuffle(shuffleRemainingMs);
}

// 綁在各 anchor（持久存在，跨 SPA 不重建）→ dataset flag 防 router recovery 重 init 重複綁。
// footer 不在 #page-content 內，listener 隨 footer 持久存在不累積，毋須 page-cleanup registry。
function bindHoverPause(anchors) {
  anchors.forEach((anchor) => {
    if (!anchor || anchor.dataset.hoverPauseBound) return;
    anchor.dataset.hoverPauseBound = '1';
    anchor.addEventListener('mouseenter', pauseShuffleLoop);
    anchor.addEventListener('mouseleave', resumeShuffleLoop);
  });
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

  // 地址卡寬度貼齊實際文字（去掉 max-w-sm 撐出的右側空白）；在 GSAP transform 套上前量最準
  applyOfficeSnugWidth(footer.querySelector('.footer-office'));

  // 文字 block 套初始三原色底色 + 綁 hover freeze（hover 凍結 shuffle 倒數、離開續跑）
  applyAccentColors(items);
  bindHoverPause(anchors);

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

// ── 離頁退場 + 換頁後重置（user 2026-06-07：點 footer 連結離頁時 footer 元素也做出場，過場才不硬）──
// footer 是持久元素（router 只 swap #page-content，不動 footer）→ 退場/重置由 router 在換頁流程驅動：
//   runPageExit 階段呼叫 playFooterExit()（footer 在視窗內才跑、回 Promise 讓 router await）；
//   swap + scrollToTop 後呼叫 resetFooterAfterExit()（此時 footer 已捲離視窗 → 重新散佈進場不被看到、純復位）。
// _footerExited flag：只在「退場真的跑了」時才需要重置 → header 連結（footer 不在畫面）導航時兩者皆 no-op，
//   shuffle loop 不被打斷。
let _footerExited = false;
let _footerExitResolve = null;

// 散佈 items 以外的 footer 元素：它們不在 scatter 系統內，退場時若不動會「凍在畫面上」顯得只散了一半。
//   - 左側 Lottie logo（.footer-logo-area）：用 header bars 同款 clip-path 收/展（animateHeaderHide/Show），
//     跟 header logo 隱藏做法一致（user 2026-06-07：logo chrome 一律 clip-path、不用 opacity）。
//   - 左下規章連結區（.footer-privacy）：改用 clip-reveal（yPercent 沉出/升入），.footer-privacy 自身 overflow:clip
//     當遮罩、只動內層 `> div`（不動態 wrap，避免破壞 .footer-privacy > div 的 align/text-align 規則）。user 2026-06-08。
function getFooterLogo(area) {
  const footerRoot = area.closest('footer');
  return footerRoot ? footerRoot.querySelector('.footer-logo-area') : null;
}

// 規章區 4 個連結各自獨立 clip-reveal：回傳 4 個 <a>。setupClipReveal 會各包一層 overflow:clip 遮罩，
// <a> 靠 footer.css 的 display:block 才吃得到 yPercent transform（包進 div 後不再是 flex item、預設 inline）。
function getFooterPrivacyLinks(area) {
  const footerRoot = area.closest('footer');
  if (!footerRoot) return [];
  return Array.from(footerRoot.querySelectorAll('.footer-privacy a'));
}

export function playFooterExit() {
  if (typeof gsap === 'undefined' || !shuffleCtx) return Promise.resolve();
  const { area, items } = shuffleCtx;
  if (!area || area.offsetParent === null || !items.length) return Promise.resolve();
  // 只在 footer 真的在視窗內才退場（捲在上方點 header 連結 → footer 不在畫面 → 不跑、不打斷 shuffle）
  const r = area.getBoundingClientRect();
  const vh = window.innerHeight || 0;
  if (r.bottom <= 0 || r.top >= vh) return Promise.resolve();

  // 連點：上一次退場 Promise 還沒 resolve 又被呼叫 → 先 resolve 舊的，否則 killTweensOf 殺掉舊 onComplete = hang
  if (_footerExitResolve) { _footerExitResolve(); _footerExitResolve = null; }

  _footerExited = true;
  stopShuffleLoop();
  const logo = getFooterLogo(area);
  const privacyLinks = getFooterPrivacyLinks(area);
  if (privacyLinks.length) setupClipReveal(privacyLinks, { hide: false }); // 各包 overflow:clip 遮罩（idempotent）
  gsap.killTweensOf(items);
  const exitDirs = items.map(() => pickRandomDirection());
  return new Promise(resolve => {
    _footerExitResolve = resolve;
    // 三組 footer 元素 timing **完全相同**（FOOTER_EXIT_DUR 0.5s + EASE.exit + 無 stagger）→ 同時、同速、時長一致出場。
    // ease/時長直接照 hero clip-reveal exit（hero-animation.js EXIT_DURATION=0.5 + EASE.exit/power3.in）：
    //   power3.in 在「短時長 0.5s」前段空白不明顯（hero 同設定手感 OK）；之前 footer 用 0.75s 才把 power3.in 前段
    //   放大成「delay 很久才走」→ 縮回 0.5s 對齊 hero 就順（user 2026-06-08；曾試 power2.in@0.75 仍怪、改照 hero）。
    //   - logo：header bars 同款 clip-path 收（隨機上/下 inset wipe）
    //   - 規章區：4 個連結各自 clip-reveal 沉出（yPercent 0→100，每個 <a> 自己的 overflow:clip wrapper 當遮罩），
    //     stagger 0 → 四個分開的 clip 但一起出場（user 2026-06-08）
    // 三組同在 0.5s 結束，用 items 的 onComplete resolve。
    if (logo) animateHeaderHide([logo], { duration: FOOTER_EXIT_DUR, ease: EASE.exit, stagger: FOOTER_EXIT_STAGGER });
    if (privacyLinks.length) gsap.to(privacyLinks, { yPercent: 100, duration: FOOTER_EXIT_DUR, ease: EASE.exit, stagger: 0, overwrite: 'auto' });
    gsap.to(items, {
      xPercent: (i) => getHiddenTransform(exitDirs[i]).xPercent,
      yPercent: (i) => getHiddenTransform(exitDirs[i]).yPercent,
      duration: FOOTER_EXIT_DUR,
      ease: EASE.exit,
      stagger: FOOTER_EXIT_STAGGER,  // 與 extras 共用 → 全部同時、同時長
      overwrite: 'auto',
      onComplete: () => { _footerExitResolve = null; resolve(); },
    });
  });
}

export function resetFooterAfterExit() {
  if (!_footerExited) return;
  if (typeof gsap === 'undefined' || !shuffleCtx) { _footerExited = false; return; }
  const { area, anchors, obstacles, items, fallbackLayout } = shuffleCtx;
  // footer 在新頁是隱藏頁（generate/library/atlas）→ 留著 flag，下次顯示 footer 的頁再重置，避免 items 卡隱藏
  if (!area || area.offsetParent === null) return;
  _footerExited = false;
  gsap.killTweensOf(items);
  // 沿用現有 anchor 位置（exit 只動 item 的 xPercent/yPercent，anchor 位置沒變）→ 不重算 layout、直接重進場。
  hideItemsRandomDirection(items);
  playRandomDirReveal(items);
  const logo = getFooterLogo(area);
  const privacyLinks = getFooterPrivacyLinks(area);
  if (privacyLinks.length) setupClipReveal(privacyLinks, { hide: false });
  // timing 對齊 items 重進場（playRandomDirReveal：DUR.reveal + EASE.enter）→ 復位也一致
  if (logo) animateHeaderShow([logo], { duration: DUR.reveal, ease: EASE.enter, stagger: 0.12 });
  // 規章區 4 連結 clip-reveal 復位：從 yPercent:100（沉在遮罩下）一起升回 0（stagger 0）；fromTo 明確起點、clearProps 收乾淨
  if (privacyLinks.length) gsap.fromTo(privacyLinks, { yPercent: 100 }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, stagger: 0, overwrite: 'auto', clearProps: 'transform' });
  startShuffleLoop(area, anchors, obstacles, items, fallbackLayout);
}
