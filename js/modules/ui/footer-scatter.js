/**
 * Footer Scatter Module（2026-08-10 由 footer-draggable.js 改名；drag 功能早已移除）
 *
 * 桌面 .footer-random 內 items 每次刷新 + 每 10s random 散佈：
 *   1. wrapItemsInAnchors：動態包每個 item 在 .footer-anchor (position:absolute + opacity:0；純位移 reveal，不裁遮罩)
 *   2. awaitLayoutReady：等 fonts.ready + container 尺寸
 *   3. Init：build 1 個 verified layout 當 initial display + 後續 shuffle fallback
 *   4. 初始 reveal：套 initial layout → anchor opacity:1 → playClipRevealScatter items（clip-reveal 升起）
 *   5. startShuffleLoop：每 10s 跑 shuffleAll = 即時 generate+verify 新 layout → anchor 直接 glide 到新位置（in-place 位移，不 exit 出界）
 *
 * 2026-05-29 從 pre-cache 10 個 layout 改成每次 shuffle 即時 generate — user 反饋
 * 「每次 random 都是一樣 pos」(10 個 cache 輪播看得出來)；verified 機制保留（每次 generate 最多重試
 * 30 次直到 no-overlap），確保「所有 items 都可見」原始 spec；30 次都失敗才 fallback init layout。
 *
 * Pattern reference: js/modules/pages/error-404.js
 */

// scatter items 進出場走 clip-reveal（item 在 .footer-anchor overflow:clip 遮罩內 yPercent 升起/沉入，
// user 2026-08-10：進出場一律 clip-reveal，只有 10s shuffle 是位移）；規章區 4 連結亦各自 clip-reveal（見 playFooterExit）
import { setupClipReveal, playClipReveal, playRevealExit } from './scroll-animate.js';
import { awaitLayoutReady } from './await-layout-ready.js';
import { DUR, EASE } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';
import { bindArrowSpin, randomSpinAngle } from './arrow-spin.js';   // footer 分類 tab／散佈卡 hover 抽新角、離開保持
// footer logo 退場 2026-07-15 改 hero clip-reveal（area 遮罩＋inner yPercent），不再用 header bars 的
// clip-path wipe（原 user 2026-06-07「同 header logo 法」；header logo 同日也改滑動，兩邊仍一致）

// 進出場一律 clip-reveal（user 2026-08-10）：item 在 .footer-anchor overflow:clip 遮罩內做 yPercent 位移，
// 由遮罩底緣升起（進場）/ 沉入（退場），不再隨機四向飛入。只有 10s shuffle 是純位移（anchor left/top glide，見 shuffleAll）。
// 110 而非 100：over-shoot 10% 推過遮罩下緣，避免 yPercent:100 剛好停在邊界的 sub-pixel 底線殘留
// （原 HIDDEN_YPERCENT=110 同理「防 sub-pixel 殘影」；overflow:clip 裁掉多出的 10%，視覺等同全隱）。
const CLIP_HIDE_YPERCENT = 110;

// 進場起點：item 沉入 anchor 遮罩下（x/y 歸零清掉 page-exit 殘留，reset 重進場從乾淨態起跑）
function hideItemsClip(items) {
  if (typeof gsap === 'undefined') return;
  gsap.set(items, { yPercent: CLIP_HIDE_YPERCENT, xPercent: 0, x: 0, y: 0 });
}

// 進場：item 由遮罩底緣升起（hero clip-reveal），跨卡 stagger 0.08
function playClipRevealScatter(items) {
  if (typeof gsap === 'undefined') return;
  gsap.killTweensOf(items);
  gsap.to(items, {
    yPercent: 0,
    duration: DUR.reveal,
    ease: EASE.enter,
    stagger: { each: 0.08 },
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
  '.footer-info',      // CMS 泛用資訊卡（tel/fax/email/office 渲染時同掛 .footer-info + .footer-{key}；新項目只有 .footer-info）
  '.footer-unit',      // 關聯單位連結卡（tab2；每張 = EN/ZH 兩行連結）
  '.footer-social-icon',   // CMS 社群 icon（每顆一個；.footer-social{display:contents} 讓它當散佈子）
];

// 三原色 accent 底色塊：只套在「會變化的文字內容」(scatter text blocks)，每次 shuffle 重新隨機。
// 桌面 only（initFooterScatter < 768 early return）；social icon items 不套（保留去背 icon）。
const TEXT_ITEM_SELECTOR = '.footer-fax, .footer-tel, .footer-office, .footer-email, .footer-info, .footer-unit';

// 每次配色「保證三原色各至少出現一次」(user 2026-06-09：之前各卡獨立隨機，整組可能缺某色)：
// 先放三色各一張保底 → 其餘卡隨機補 → Fisher-Yates 洗牌打散，避免保底三色永遠落在固定卡。
// 文字卡有 6 張(fax/tel/office/email + 2 link)恆 ≥3，故三色必到齊；若不足 3 張則有幾色放幾色(已是最佳)。
function applyAccentColors(items) {
  const textItems = items.filter((it) => it && it.matches && it.matches(TEXT_ITEM_SELECTOR));
  if (textItems.length === 0) return;
  const palette = [...SCCDHelpers.ACCENT_COLORS]; // 三色各一張保底
  for (let i = palette.length; i < textItems.length; i++) {
    palette.push(SCCDHelpers.getRandomAccentColor());
  }
  for (let i = palette.length - 1; i > 0; i--) { // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [palette[i], palette[j]] = [palette[j], palette[i]];
  }
  textItems.forEach((item, i) => { item.style.background = palette[i]; });
}

const ROTATION_RANGE = 12;          // ±度數
const CARD_GAP_PX = 24;             // 卡片間 + obstacle buffer（bbox 階段用）
const VERIFY_PADDING_PX = 8;        // actual-rect verify 階段 padding
const MAX_PLACE_ATTEMPTS = 350;     // 單張卡找位置最多試幾次（分群後窄區塞卡較難，提高成功率）

// 兩張 link 卡都限定在 area 底部 30% 區域（其他卡排在 link 卡上方）
const LINKS_BOTTOM_REGION_RATIO = 0.7;

// 10s shuffle loop（從原本 5s 放慢，user 覺得 5s 太頻繁眼花）
const SHUFFLE_INTERVAL_MS = 10000;

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
const MAX_REGEN_PER_LAYOUT = 120;   // 2026-09-27 上下兩區版面上區變矮（legal 整條 obstacle）→ 60 次偶發 1/25 疊卡，加倍保險（只在失敗路徑多花時間）

// Shuffle 排程＝setTimeout 鏈。hover 不再凍結倒數（06-06 版），改成 hover 中那張卡這輪原地不動（見 shuffleAll）
let shuffleTimer = null;
let shuffleCtx = null;          // { area, anchors, obstacles, items, fallbackLayout }
let hoveredAnchor = null;       // 游標下的散佈卡：shuffle 釘住它、其他卡避開（bindAnchorHover 維護）
// 目前「該在」的 verified 版面（init 或最近一次 shuffle 的終點）。退場 kill 掉 glide 會把 anchor 凍在半路（互疊），
// 復位時套回這個，不能沿用凍住的位置（user 2026-09-27：shuffle 中點 footer 連結，回來卡片疊在一起）
let currentLayout = null;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// 旋轉後 axis-aligned bbox：w' = w·|cos θ| + h·|sin θ|, h' = h·|cos θ| + w·|sin θ|（404 散佈共用）
export function rotatedBBox(w, h, deg) {
  const r = Math.abs(deg) * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { w: w * c + h * s, h: h * c + w * s };
}

export function rectsOverlap(a, b) {
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
    let anchor;
    if (parent.classList.contains('footer-anchor')) {
      anchor = parent;
    } else {
      anchor = document.createElement('div');
      anchor.className = 'footer-anchor';
      parent.insertBefore(anchor, item);
      anchor.appendChild(item);
    }
    // clip-reveal 遮罩：item 在此框內 yPercent 進出場（升起/沉入被裁）。shuffle 位移動 anchor 本身、
    // item 留 yPercent:0 剛好貼滿遮罩不受裁切影響（user 2026-08-10：由「刻意不裁」改回 clip-reveal）。
    anchor.style.overflow = 'clip';
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
 * shuffle: 每個 anchor 從「目前位置」直接 glide 到「新位置」（atlas 國家 relocate 那套）。
 * 不再 exit 出界→回來——那會讓卡片(現在無 overflow:clip、全程可見)先滑出散佈區、又滑回來＝user 回報的
 * 「超出空間、出現兩次、閃一下」。改成單一連續位移、全程留在散佈區內。
 * fallbackLayout：init 階段 build 好的 layout，當即時 generate 30 次都失敗時 fallback 用它。
 */
function shuffleAll(area, anchors, obstacles, items, fallbackLayout) {
  if (typeof gsap === 'undefined') return;
  // 背景分頁 / 待機 overlay 蓋住期間不 shuffle（09-25：被節流的 timer 在切回/喚醒瞬間集中放行
  // ＝「回來頭幾秒斷續卡」的一份子；跳過一拍即可，runShuffleTick 照常排下一輪）
  if (document.hidden || document.body.classList.contains('idle-standby')) return;
  // generate / library / atlas 頁 router 把 footer 設 display:none，shuffleTimer 不清會繼續對隱藏
  // anchors 做 GSAP tween + apply layout（讀 area.getBoundingClientRect 為 0×0 → 數學運算閒置成本 + reflow）
  // offsetParent === null 是 display:none 最便宜的偵測（含任何 ancestor display:none）
  if (!area || area.offsetParent === null) return;
  // footer 捲在畫面外（看內容區時）也跳過：看不到卻照算版面＋跑整段 glide，跟頁面進場搶幀（user 2026-10-01 faculty 掉幀診斷）。
  // 只跳這一拍、排程照舊 → 捲到 footer 後 0–10s 內照常洗牌，節奏跟以前一樣
  if (!footerInViewport(area)) return;
  // hover 中的卡這輪原地不動、下一輪才散佈（user 2026-09-28）：拿出洗牌名單、當 obstacle 讓其他卡避開。
  // 不 kill 它的 tween＝hover 抽角的轉動照跑完
  const pinned = hoveredAnchor && anchors.includes(hoveredAnchor) ? hoveredAnchor : null;
  const moving = pinned ? anchors.filter((a) => a !== pinned) : anchors;
  const obs = pinned ? [...obstacles, pinned] : obstacles;
  gsap.killTweensOf(moving);

  // 起點快照：目前 anchor 的 left/top/rotation（＝畫面上正在顯示的位置）
  const from = moving.map((a) => ({
    left: gsap.getProperty(a, 'left'),
    top: gsap.getProperty(a, 'top'),
    rotation: gsap.getProperty(a, 'rotation'),
  }));

  // 即時 generate + verify 新 layout。applyPlacement 用 gsap.set 把 anchor 移到新位置（同步、迴圈內不 paint）→
  // 迴圈結束 anchors 已在 target；下面讀 target 後 fromTo 先跳回 from(＝畫面現況、無視覺跳動) 再滑到 target。
  let fresh = null;
  for (let attempt = 0; attempt < MAX_REGEN_PER_LAYOUT; attempt++) {
    const placement = generatePlacement(area, moving, obs);
    if (placement.length !== moving.length) continue;
    applyPlacement(placement);
    if (verifyPlacement(area, moving, obs)) {
      fresh = placement;
      break;
    }
  }
  if (!fresh && pinned) {
    // 釘住時沒有保底版面（init 版面會跟釘住的卡撞）→ 這輪全員留在原地
    moving.forEach((a, i) => gsap.set(a, from[i]));
    return;
  }
  if (!fresh) applyPlacement(fallbackLayout);
  currentLayout = !fresh ? fallbackLayout : pinned
    ? [...fresh, { anchor: pinned, cx: gsap.getProperty(pinned, 'left'), cy: gsap.getProperty(pinned, 'top'), rot: gsap.getProperty(pinned, 'rotation') }]
    : fresh;

  const to = moving.map((a) => ({
    left: gsap.getProperty(a, 'left'),
    top: gsap.getProperty(a, 'top'),
    rotation: gsap.getProperty(a, 'rotation'),
  }));

  // shuffle 不換底色（user 2026-09-27「換位置不需要改變卡片顏色」）：底色只在 init/切 tab 時 applyAccentColors 一次。

  // 直接位移：left/top/rotation 從 from → to，全程在散佈區內（兩端點都由 generatePlacement 限制在區內、直線內插不出界）
  moving.forEach((a, i) => {
    gsap.fromTo(a,
      { left: from[i].left, top: from[i].top, rotation: from[i].rotation, xPercent: -50, yPercent: -50 },
      {
        left: to[i].left, top: to[i].top, rotation: to[i].rotation, xPercent: -50, yPercent: -50,
        duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto',
      });
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
  shuffleTimer = window.setTimeout(runShuffleTick, delay);
}

function startShuffleLoop(area, anchors, obstacles, items, fallbackLayout) {
  stopShuffleLoop();
  shuffleCtx = { area, anchors, obstacles, items, fallbackLayout };
  scheduleNextShuffle(SHUFFLE_INTERVAL_MS);
}

function stopShuffleLoop() {
  if (shuffleTimer != null) {
    clearTimeout(shuffleTimer);
    shuffleTimer = null;
  }
}

// 散佈卡 hover（user 2026-09-28）：進入抽新角、離開保持（全站 arrow-spin 角度規則，從 GSAP 現角抽——
// anchor 的 transform 由 GSAP 管 left/top/xPercent，不能直寫 style.transform）；游標下那張記成 hoveredAnchor
// 給 shuffleAll 釘住。只綁桌面 hover（散佈本身只在 ≥1200 跑）；re-parent 補發的假 mouseenter 不抽角。
// 綁在各 anchor（持久存在，跨 SPA 不重建）→ dataset flag 防 router recovery 重 init 重複綁。
// footer 不在 #page-content 內，listener 隨 footer 持久存在不累積，毋須 page-cleanup registry。
function bindAnchorHover(anchors) {
  anchors.forEach((anchor) => {
    if (!anchor || anchor.dataset.hoverBound) return;
    anchor.dataset.hoverBound = '1';
    anchor.addEventListener('mouseenter', () => {
      hoveredAnchor = anchor;
      // 釘住的卡墊高：shuffle 時其他卡的滑行路徑可能穿過游標，從它下面過＝不搶 hover（否則 mouseleave/enter 連發、
      // 它自己又轉一次，同 reference_click_respin_phantom_mouseenter 那類）
      anchor.style.zIndex = '2';
      // 自己在滑行中（卡片滑到靜止的游標底下）不算真 hover、不抽角
      if (_footerReparenting || typeof gsap === 'undefined' || gsap.isTweening(anchor)) return;
      gsap.to(anchor, { rotation: pickFreeSpinAngle(anchor), duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
    });
    anchor.addEventListener('mouseleave', () => {
      anchor.style.zIndex = '';
      if (hoveredAnchor === anchor) hoveredAnchor = null;
    });
  });
}

// hover 新角先驗不撞鄰卡/障礙：放置時只驗了各卡的放置角，兩張相鄰卡各自 hover 轉過去的角度都會保留（09-28 審查）。
// 以卡片現中心 + 新角的 AABB 對其他卡現 gBCR；試 8 次都撞＝取 |角| 最小那個（AABB 最小、最不易撞）。
function pickFreeSpinAngle(anchor) {
  const cur = /** @type {number} */ (gsap.getProperty(anchor, 'rotation'));
  const r = anchor.getBoundingClientRect();
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const w = anchor.offsetWidth, h = anchor.offsetHeight;
  const ctx = shuffleCtx;
  const others = ctx ? [...ctx.anchors.filter((a) => a !== anchor && a.offsetParent !== null), ...ctx.obstacles]
    .map((el) => el.getBoundingClientRect()) : [];
  let best = null;
  for (let i = 0; i < 8; i++) {
    const deg = randomSpinAngle(cur);
    const bb = rotatedBBox(w, h, deg);
    const me = { left: cx - bb.w / 2, right: cx + bb.w / 2, top: cy - bb.h / 2, bottom: cy + bb.h / 2 };
    if (!others.some((o) => domRectsOverlap(me, o, VERIFY_PADDING_PX))) return deg;
    if (best === null || Math.abs(deg) < Math.abs(best)) best = deg;
  }
  return best;
}

// ── legal 連結＝nav btn 同款（user 2026-10-03）：初始隨機角、hover 抽新角（離開保持）＋隨機三原色底（樣式在 footer.css）。
// 角度掛 clip-reveal wrapper（先包好）：遮罩＝chip 自己的形狀跟著轉，離頁退場 <a> 在裡面 yPercent 沉出不被切角；
// 也不跟退場 tween 搶 <a> 的 transform。wrapper 跨斷點重建會被 unwrapFooterAnim 剝掉重包 → listener 綁 wrapper 不累積。
function bindLegalChips(footer) {
  const links = /** @type {HTMLElement[]} */ (Array.from(footer.querySelectorAll('.footer-privacy a[data-footer-legal]')));
  if (!links.length) return;
  // wrapper 被 unwrapFooterAnim 剝掉後 clipWrapped 旗標還在＝setupClipReveal 會跳過不重包 → 先拆旗
  links.forEach((a) => { if (!a.parentElement?.classList.contains('clip-reveal-wrapper')) delete a.dataset.clipWrapped; });
  setupClipReveal(links, { hide: false });
  links.forEach((a) => {
    const wrap = a.parentElement;
    if (!wrap || !wrap.classList.contains('clip-reveal-wrapper') || wrap.dataset.legalBound) return;
    wrap.dataset.legalBound = '1';
    const initial = SCCDHelpers.getRandomRotation();
    const setAngle = (/** @type {number} */ d) => { wrap.style.transform = `rotate(${d}deg)`; };
    setAngle(initial);
    bindArrowSpin(wrap, setAngle, { initial, clickReroll: false });
    wrap.addEventListener('mouseenter', () => wrap.style.setProperty('--legal-hover', SCCDHelpers.getRandomAccentColor()));
  });
}

// ── 分頁說明文字（.footer-note，footer-content.js buildNote；後台 footer_tabs.note）：散佈區左下角、純文字不可點。
// 外層＝定位／旋轉／遮罩（當 scatter obstacle），內層跟散佈卡同拍 clip-reveal 進出場。只回「目前分頁」那則。
function getFooterNote(area) {
  return /** @type {HTMLElement | null} */ (area ? area.querySelector(':scope > .footer-note:not(.fgroup-off)') : null);
}
function getFooterNoteInner(area) {
  const note = getFooterNote(area);
  return note ? note.querySelector('.footer-note-inner') : null;
}

// ── 學系/關聯單位 子 tab（桌面散佈 ≥1200；固定散佈區左上）─────
// 兩顆 radio tab：tab1=dept（系資訊：social/tel/fax/email/office）、tab2=units（關聯單位 6 張連結）。
// 點擊 = 這顆 active、切 `.footer-random[data-fgroup]` → CSS（≥1200）把非 active 群組 display:none → 重跑
// scatter 只散 active 群組（見 switchFooterGroup）。非 active tab dim（CSS opacity）。定位/配色全在 CSS。

// 群組出場：現群組 items clip-reveal 沉入 anchor 遮罩（yPercent 0→110 over-shoot、overflow:clip 裁掉即消失），
// 與 initFooterScatter 進場（playClipRevealScatter，反向升起）對稱。回 Promise 讓切換 await 完出場再換群組進場。
function playScatterGroupExit() {
  if (typeof gsap === 'undefined' || !shuffleCtx) return Promise.resolve();
  const { items } = shuffleCtx;
  if (!items || !items.length) return Promise.resolve();
  stopShuffleLoop();
  gsap.killTweensOf(items);
  const noteInner = getFooterNoteInner(shuffleCtx.area);   // 這個分頁的說明文字跟卡片同拍沉出
  if (noteInner) gsap.to(noteInner, { yPercent: CLIP_HIDE_YPERCENT, duration: DUR.base, ease: EASE.exit, overwrite: 'auto' });
  return new Promise((resolve) => {
    gsap.to(items, {
      yPercent: CLIP_HIDE_YPERCENT,
      duration: DUR.base,          // 退場 base(0.4s) 不用 reveal(1.0s)——1.0s+power3.in 前段空白＝user 報「速度很奇怪」
      ease: EASE.exit,
      stagger: 0,                  // 全部同時走（user 2026-08-10：不要 icon 先走；對齊離頁 playFooterExit 的 stagger 0）
      overwrite: 'auto',
      onComplete: resolve,
    });
  });
}

// 切換散佈群組（user 2026-08-10：先出場再進場）：設 active tab → **現群組滑出出場**（await）→ 切 area
// data-fgroup（CSS 收非 active 群組 display:none）→ unwrap + 重跑 scatter（新群組滑入進場）。
// 平板 tab 切換要動畫的 group 區塊（= MOBILE_BLOCK_SELECTOR 去掉 logo/privacy——那兩塊不隨 tab 變）
const TABLET_GROUP_SELECTOR = '.footer-social, .footer-fax, .footer-tel, .footer-office, .footer-email, .footer-info, .footer-unit';

// ── 群組顯隱（2026-08-11 CMS 化後由 CSS 三向互斥改 JS class）──
// tab 改後台管理（footer_tabs）＝群組 key 任意，CSS 無法窮舉配對 → 改 JS 對非 active 群組
// item（含其 clip-reveal wrapper——wrapper 不藏會留空佔 flex/grid 位）掛 .fgroup-off（footer.css display:none）。
// 2026-09-19 矮橫向也分群（tab 進 landscape 版型，見 landscape.css footer 區）。唯一剩的全顯情境＝
// 「寬 <768 的橫向視窗但高 >500」（罕見桌面窗形：CSS tabs portrait/矮橫向都不開＝沒 tab 可切，不分群免卡死第一組）。
function applyGroupVisibility(area) {
  if (!area) return;
  const showAll = window.innerWidth < 768
    && window.matchMedia('(orientation: landscape) and (min-height: 501px)').matches;
  const active = area.dataset.fgroup;
  area.querySelectorAll('[data-fgroup]').forEach((el) => {
    if (el.classList.contains('footer-tab') || el.closest('.footer-tabs')) return;   // tab 本體恆顯示
    const off = !showAll && /** @type {HTMLElement} */ (el).dataset.fgroup !== active;
    el.classList.toggle('fgroup-off', off);
    const wrap = el.closest('.clip-reveal-wrapper, .footer-anchor');
    if (wrap) wrap.classList.toggle('fgroup-off', off);
  });
}

// _footerSwitching 閘門防連點兩個 tab 動畫互相打斷。
let _footerSwitching = false;
// 切群組期間會 re-parent tab（unwrapFooterAnim / getFooterTabsInner 搬 DOM）→ 瀏覽器對游標下的 tab 補發
// 假 mouseenter，arrow-spin 會誤抽新角＝「點完又自己轉一次」。整段切換期間豎旗，arrow-spin ignoreEnter 略過。
let _footerReparenting = false;
async function switchFooterGroup(footer, group) {
  if (_footerSwitching) return;
  const area = footer.querySelector('.footer-random');
  if (!area || !(area instanceof HTMLElement) || area.dataset.fgroup === group) return;
  _footerSwitching = true;
  _footerReparenting = true;
  try {
    footer.querySelectorAll('.footer-tab').forEach((t) => {
      const on = /** @type {HTMLElement} */ (t).dataset.fgroup === group;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // 平板（768-1199）：兩段式 clip-reveal（user 2026-08-11）——現群組沉入各自 clip-reveal-wrapper 遮罩
    // （playRevealExit yPercent 0→100、全部同時）→ 切 data-fgroup（CSS group-hide 收舊顯新）→ 新群組
    // setupClipReveal 藏回遮罩下再升起（同 initFooterMobileReveal 進場 stagger 0.08）。
    if (usesMobileFooter()) {
      const groupBlocks = () => Array.from(area.querySelectorAll(TABLET_GROUP_SELECTOR))
        .filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null);
      await playRevealExit(groupBlocks(), { stagger: 0, duration: DUR.base });   // phase 1：現群組沉出
      area.dataset.fgroup = group;
      applyGroupVisibility(area);       // JS 收舊群組顯新群組（取代舊 CSS 三向互斥）
      const entering = groupBlocks();   // 切換後 visible = 新群組
      if (entering.length) {
        setupClipReveal(entering);      // 已包 wrapper（init 時）→ 只重設 yPercent:100 起點
        // 全部同步升起（user 2026-08-11：icon 塊在 DOM 最前、有 stagger 時比文字早到位＝「icon 比文字快」；退場本就同步）。
        // ⚠️ 用 { each: 0 } 不用 0：playClipReveal 是 `stagger || 預設`，傳 falsy 的 0 會落回預設 {each:0.12,axis:'y'}
        // （反而依 y 位置 stagger、最下/最高的 office 拖最久）。物件 { each:0 } 為 truthy，才真的同步。
        playClipReveal(entering, { stagger: { each: 0 } });   // phase 2：新群組同步升起
      }
      return;
    }
    await playScatterGroupExit();           // phase 1：現群組出場（桌面 scatter）
    area.dataset.fgroup = group;            // 據此收非 active 群組，下面重跑 scatter 只抓 active 群組
    applyGroupVisibility(area);
    stopShuffleLoop();
    _footerExited = false;
    unwrapFooterAnim(footer, true);
    await initFooterScatter(footer, { animate: true });   // phase 2：新群組進場
  } finally {
    _footerSwitching = false;
    // 延一個 macrotask 才落旗：re-parent 的假 mouseenter 是 async 補發、可能還在佇列
    setTimeout(() => { _footerReparenting = false; }, 0);
  }
}

// 綁 tab click（persistent，dataset guard 防 reinit 重綁）+ 隨機微旋轉（呼應散佈卡傾斜）。
// hover 抽隨機角、離開直接定案該角（user 2026-09-12：一次 hover 只轉一次，撤「離開再抽新角」）——走全站 arrow-spin
// （桌面 only gate 內建，手機/平板不觸發＝維持原「不旋轉」）；transform transition 由 footer.css .footer-tab 備妥。
// 初始一次性 ±[1,3]° 當 committed 起點；跨 tab 切換 unwrapFooterAnim 不清 .footer-tab 故持久。
function bindFooterTabs(footer) {
  footer.querySelectorAll('.footer-tab').forEach((t) => {
    const el = /** @type {HTMLElement} */ (t);
    if (el.dataset.tabBound) return;
    el.dataset.tabBound = '1';
    const initial = (Math.random() < 0.5 ? -1 : 1) * rand(1, 3);   // ±[1,3]°，保證非 0
    el.style.transform = `rotate(${initial.toFixed(2)}deg)`;   // 靜止傾斜（arrow-spin 只在 hover/leave 才重繪，需先畫出起始角）
    let lastDeg = initial, hoverDeg = initial;
    const spin = bindArrowSpin(el, (d) => { lastDeg = d; el.style.transform = `rotate(${d}deg)`; },
      { initial, ignoreEnter: () => _footerReparenting, clickReroll: () => !el.classList.contains('is-active') });
    // 這兩個 listener 綁在 arrow-spin 之後：enter 時 lastDeg 已被 arrow-spin 寫成預覽角；
    // leave 時 arrow-spin 先回寫舊定案角，同幀再 commit(hoverDeg) 蓋回 → 視覺停在 hover 角、離開不再轉
    el.addEventListener('mouseenter', () => { hoverDeg = lastDeg; });
    el.addEventListener('mouseleave', () => spin.commit(hoverDeg));
    el.addEventListener('click', () => {
      // 點已 active 的 tab＝無效（不轉、不捲；全站 nav btn 一致，user 2026-10-04）——上面 clickReroll 同判
      if (el.classList.contains('is-active')) return;
      // 手機＋矮橫向 tab 列是水平 scroll strip：點到的 tab 捲回靠左對齊列左緣（同 faculty/curriculum nav btn
      // 慣例，user 2026-09-16；矮橫向補 gate user 2026-09-24）。只動 bar 自己 scrollLeft；平板/桌面 absolute tabs 不套。
      if (SCCDHelpers.isMobileLayout()) {
        const bar = /** @type {HTMLElement | null} */ (el.closest('.footer-tabs'));
        if (bar) {
          const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
          const delta = el.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad);
          bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
        }
      }
      switchFooterGroup(footer, el.dataset.fgroup || 'dept');
    });
  });
}

// tab 列可左右拖動（未來 tab 多、超出寬度時）：滑鼠按住拖曳捲 scrollLeft；觸控走原生 overflow-x pan（不攔）。
// 無 chevron、無可見 scrollbar（CSS 隱藏）。拖動（moved）後 capture 攔 click 免誤切 tab。persistent + dataset guard 防重綁。
// ⚠️ 寬度夠（無溢出）時不啟動拖曳（user 2026-08-11）——pointerdown 當下檢查 scrollWidth，免得拖曳態誤攔 click。
function makeTabsDraggable(tabs) {
  if (!tabs || tabs.dataset.dragBound) return;
  tabs.dataset.dragBound = '1';
  let down = false, startX = 0, startScroll = 0, moved = false;
  const onMove = (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    tabs.scrollLeft = startScroll - dx;
  };
  const onUp = () => {
    down = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  tabs.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;   // 只滑鼠拖曳；觸控用原生 overflow scroll
    if (tabs.scrollWidth <= tabs.clientWidth + 1) return;      // 寬度夠（無溢出）＝不需拖曳，直接放行 click
    down = true; moved = false;
    startX = e.clientX; startScroll = tabs.scrollLeft;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  // 拖動後（moved）capture 階段攔 click（早於 tab 自身 click）→ 不誤觸 switchFooterGroup。
  tabs.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}

// 頂部整條保留區（隱形 obstacle，滿寬）：從頂到 tabs 底 + gap → scatter 卡片全排到 tab 那條之下，
// tab 右邊整條淨空（user req2）。用 .footer-tabs 容器 offsetHeight 算高（涵蓋兩顆 tab 較高者 + pt）。
// 元素常駐 area（.footer-random > .footer-tab-reserve ≥1200 CSS 給 display:block；<1200 由 base display:none 收）。
function reserveTabRow(tabs, area) {
  if (!tabs || !area) return null;
  let res = /** @type {HTMLElement | null} */ (area.querySelector(':scope > .footer-tab-reserve'));
  if (!res) {
    res = document.createElement('div');
    res.className = 'footer-tab-reserve';
    res.setAttribute('aria-hidden', 'true');
    area.appendChild(res);
  }
  res.style.left = '0';
  res.style.top = '0';
  res.style.width = '100%';
  // 扣 padding-bottom：那段只是給旋轉 tab 角的裁切緩衝（footer.css），不算 tab 列高
  const padB = parseFloat(getComputedStyle(tabs).paddingBottom) || 0;
  res.style.height = `${Math.ceil(tabs.offsetHeight - padB + CARD_GAP_PX)}px`;
  res.style.pointerEvents = 'none';
  return res;
}

// 「不跑隨機散佈、改走線性 clip-reveal」的 gate。2026-08-08 由 <768 提到 <1200（對齊 header 漢堡切點、user）：
//   - 768–1199 = 窄桌面 hybrid（logo 靠左縮小 + 右欄由上往下線性列表，CSS 在 footer.css hybrid 段）
//   - <768     = 完整手機版（logo 疊最上）
//   兩者右側都是線性堆疊、都走 initFooterMobileReveal（無 shuffle/無隨機方向）；只有 ≥1200 才跑 scatter。
// 矮橫向（橫向手機）不論寬度一律線性（user 2026-07-04「橫向一切以手機版為主」）。init/exit/reset 三處共用此判斷。
function usesMobileFooter() {
  return SCCDHelpers.isMobileLayout();
}

export async function initFooterScatter(scope, opts = {}) {
  const footer = scope || document.querySelector('footer.footer-shell, footer#site-footer-static');
  if (!footer) return;
  // animate 預設 false＝靜態就位（user 2026-08-10：刷新/往下捲到 footer 不要進場動畫，跟直接 scroll 到 footer 一樣）。
  // 只有跨 1200 resize 重建（reinitVisibleFooters 傳 true）才播進場——否則拉寬過 1200 scatter 沒接管會一片空白。
  const animate = opts.animate === true;

  bindFooterBreakpointReinit();   // 綁一次：跨 1200 寬度邊界時重建 footer（scatter↔線性）重播進場、免空白

  // <1200（窄桌面 hybrid + 手機）：footer 走線性 clip-reveal（無散佈）；≥1200 才 scatter。見 usesMobileFooter()
  if (usesMobileFooter()) { initFooterMobileReveal(footer, animate); return; }

  const area = footer.querySelector('.footer-random');
  if (!area) return;

  // 群組顯隱先套（CMS 化後由 JS 管，見 applyGroupVisibility）→ 下面 offsetParent 過濾才會排除非 active 群組
  applyGroupVisibility(area);

  // 進場版（切分頁／跨斷點）：說明文字 CSS 是 opacity 1（不像散佈卡 anchor 預設 0 藏著），transform 又被 unwrap 清掉
  // → 下面 await 期間會先閃一下才 clip-reveal（user 2026-10-03）→ 同步先藏進遮罩
  const noteInnerEarly = animate ? getFooterNoteInner(area) : null;
  if (noteInnerEarly && typeof gsap !== 'undefined') gsap.set(noteInnerEarly, { yPercent: CLIP_HIDE_YPERCENT });

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

  // 學系/關聯單位 tabs + 滿寬 reserve obstacle（涵蓋 tabs 整條）→ 卡片全排到 tab 下方、右邊整條淨空（user req2）。
  // radio 切換散佈群組。
  bindFooterTabs(footer);
  bindLegalChips(footer);
  const tabs = footer.querySelector('.footer-tabs');
  makeTabsDraggable(tabs);
  const reserve = reserveTabRow(tabs, area);
  // 文字 block 套初始三原色底色 + 綁 hover（抽新角、shuffle 時原地不動）
  applyAccentColors(items);
  bindAnchorHover(anchors);

  // 分頁說明文字（左下角）：靜止傾斜抽一次（同 tab ±[1,3]°；inline 被 unwrapFooterAnim 清掉才重抽），要在量 obstacle 前定好
  const note = getFooterNote(area);
  if (note && !note.style.transform) note.style.transform = `rotate(${((Math.random() < 0.5 ? -1 : 1) * rand(1, 3)).toFixed(2)}deg)`;
  const noteInner = note ? note.querySelector('.footer-note-inner') : null;

  // 2026-09-27 版面：上區散佈（tabs 左上、legal 右上整高、copyright 貼底）、下區 logo bar 不在 area 內。
  // legal 整條（右側整高）當一個 obstacle：卡片不進 legal 區（user 2026-09-27「他們是一個整體」）。
  // 說明文字只擋它自己那一塊（user 2026-10-03：卡片移動空間不含它、其他空間照用）。
  const privacy = footer.querySelector('.footer-privacy');
  const obstacles = [reserve, privacy, note].filter(Boolean);

  // 初始：items 沉入 anchor 遮罩下（clip-reveal 起點；anchor opacity 從 CSS default 0 起）
  hideItemsClip(items);

  // Init 階段 build 1 個 verified layout 當 initial display + 後續 shuffle fallback
  // （shuffle 即時 generate 30 次都失敗時用這個保底）
  let fallbackLayout = (await buildLayoutCache(area, anchors, obstacles))[0];
  // 排不進（沒有驗證過的版面）就讓上區長高 80px 再排、最多 4 次：footer 因此超過一屏、多捲一點，好過卡片疊在一起
  // （user 2026-10-03 說明文字佔掉左下角後 1200×800 級約三成排不進）。resize／跨斷點重建時 unwrapFooterAnim 還原高度；
  // 切分頁不還原＝高度不來回跳
  const right = /** @type {HTMLElement | null} */ (footer.querySelector('.footer-right'));
  let grew = false;
  for (let i = 0; i < 4 && right; i++) {
    applyPlacement(fallbackLayout);
    if (fallbackLayout.length === anchors.length && verifyPlacement(area, anchors, obstacles)) break;
    right.style.minHeight = `${right.offsetHeight + 80}px`;
    grew = true;
    fallbackLayout = (await buildLayoutCache(area, anchors, obstacles))[0];
  }
  if (grew && typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();   // 文件變高，捲動觸發點要重量

  // 套 initial layout
  applyPlacement(fallbackLayout);
  currentLayout = fallbackLayout;

  // 等 1 frame 讓 gsap.set 位置 settle 後再 reveal
  await new Promise((r) => requestAnimationFrame(r));

  // 預設靜態就位（刷新不進場）；只有 animate（跨 1200 resize 重建）且非 reduced-motion 才播滑入 reveal。
  if (typeof gsap !== 'undefined') {
    gsap.set(anchors, { opacity: 1 });
    if (animate && !prefersReducedMotion()) {
      playClipRevealScatter(items);
      if (noteInner) gsap.fromTo(noteInner, { yPercent: CLIP_HIDE_YPERCENT }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto', clearProps: 'transform' });
    } else {
      gsap.set(items, { clearProps: 'transform' });   // 清掉 hideItemsClip 的 yPercent 沉沒 → 直接就位
      if (noteInner) gsap.set(noteInner, { clearProps: 'transform' });   // 切分頁時沉出去的，靜態重建也要回來
    }
  } else {
    anchors.forEach((a) => { a.style.opacity = '1'; });
  }

  if (!prefersReducedMotion()) startShuffleLoop(area, anchors, obstacles, items, fallbackLayout);
}

// ── 離頁退場 + 換頁後重置（user 2026-06-07：點 footer 連結離頁時 footer 元素也做出場，過場才不硬）──
// footer 是持久元素（router 只 swap #page-content，不動 footer）→ 退場/重置由 router 在換頁流程驅動：
//   runPageExit 階段呼叫 playFooterExit()（footer 在視窗內才跑、回 Promise 讓 router await）；
//   swap + scrollToTop 後呼叫 resetFooterAfterExit()（此時 footer 已捲離視窗 → 重新散佈進場不被看到、純復位）。
// _footerExited flag：只在「退場真的跑了」時才需要重置 → header 連結（footer 不在畫面）導航時兩者皆 no-op，
//   shuffle loop 不被打斷。
let _footerExited = false;
let _footerExitResolve = null;

// ════════════════════════════════════════════════════════════════
// 手機 footer 進退場（user 2026-06-11）
//
// 桌面 footer 是 scatter（上方主體）；手機 footer 簡化成線性堆疊 → 不散佈，改用招牌 clip-reveal 統一
// 處理進退場：各 block（logo / 4 聯絡卡 / 2 學校連結 / social row / 規章區）yPercent 沉出/升入，
// 各自 overflow:clip 遮罩（沿用 scroll-animate.js 的 setupClipReveal/playClipReveal/playRevealExit）。
// 退場接 router 的 playFooterExit、復位接 resetFooterAfterExit（與桌面共用 _footerExited flag）。
// ════════════════════════════════════════════════════════════════

// clip-reveal 的 block（querySelectorAll 回 DOM 順序：logo → fax → tel → office → email → 2 link → social → privacy）
const MOBILE_BLOCK_SELECTOR =
  '.footer-logo-area, .footer-fax, .footer-tel, .footer-office, .footer-email, .footer-info, .footer-unit, .footer-social, .footer-privacy';

let mobileBlocks = null;  // 手機 ctx：clip-reveal block 元素（footer 持久存在故跨換頁有效）

function getMobileFooter() {
  return (mobileBlocks && mobileBlocks.length) ? mobileBlocks[0].closest('footer') : null;
}

// footer 是否在視窗內：點 footer 連結離頁才退場；捲在上方點 header / 別處連結 → footer 不在畫面 → 不跑
function footerInViewport(footer) {
  const r = footer.getBoundingClientRect();
  const vh = window.innerHeight || 0;
  return r.bottom > 0 && r.top < vh;
}

function initFooterMobileReveal(footer, animate = false) {
  if (typeof gsap === 'undefined') return;
  // 平板 768-1199、<768 手機（2026-09-05 起）、矮橫向（2026-09-19 起）都是 tab 切換版型（radio；CSS 各自段）。
  // 綁 tab click + 可拖動。旋轉在平板/手機/矮橫向由 CSS transform:none 蓋掉。
  bindFooterTabs(footer);
  const tabsEl = /** @type {HTMLElement | null} */ (footer.querySelector('.footer-tabs'));
  makeTabsDraggable(tabsEl);
  // 平板 tabs absolute 疊在資訊區頂、不佔 flow 高 → 量實高寫進 var 給 .footer-random padding-top 預留
  // （CSS fallback 88px；offsetParent null＝<768/矮橫向 display:none 跳過不量）
  if (tabsEl && tabsEl.offsetParent !== null) {
    footer.style.setProperty('--footer-tabs-h', `${Math.ceil(tabsEl.offsetHeight)}px`);
  }
  const blocks = Array.from(footer.querySelectorAll(MOBILE_BLOCK_SELECTOR));
  if (!blocks.length) return;
  mobileBlocks = blocks;
  if (animate && !prefersReducedMotion()) {
    setupClipReveal(blocks);                          // 各包 overflow:clip 遮罩 + yPercent:100 藏好
    playClipReveal(blocks, { stagger: { each: 0.08 } });
  } else {
    // 靜態就位（刷新不進場，user 2026-08-10）：仍包遮罩供之後 exit/reset 用，但 hide:false 不藏、不播進場
    setupClipReveal(blocks, { hide: false });
  }
  // 群組顯隱在「包完 wrapper 後」套：applyGroupVisibility 會連 wrapper 一起掛 .fgroup-off
  //（只藏 item 不藏空 wrapper 的話，空 wrapper 仍佔平板 flex 欄位＝幽靈空格）
  applyGroupVisibility(footer.querySelector('.footer-random'));
  // 標記 init 完成 → router 換頁的「broken init」recovery（靠缺 .footer-anchor 偵測，手機不建 anchor）不誤重跑、
  // footer 才能像桌面一樣持久（否則每次換頁重抓 footer.html 重建，clip-reveal ctx 被打斷）。
  footer.dataset.footerMobileInit = '1';
}

function playFooterMobileExit() {
  if (!mobileBlocks || !mobileBlocks.length) return Promise.resolve();
  const footer = getMobileFooter();
  if (!footer || footer.offsetParent === null || !footerInViewport(footer)) return Promise.resolve();
  _footerExited = true;
  // tab 列同步 clip-reveal 沉出（inner yPercent、box 當遮罩；矮橫向 display:none 時回 null 跳過）
  // 110 非 100（同 CLIP_HIDE_YPERCENT 慣例）：tab 有 ±1~3° 旋轉、角凸出 inner 上緣 ~5px，100% 剛好貼齊遮罩底＝角殘留退不完
  const tabsInner = getFooterTabsInner(footer);
  if (tabsInner) gsap.to(tabsInner, { yPercent: CLIP_HIDE_YPERCENT, duration: FOOTER_EXIT_DUR, ease: EASE.exit, overwrite: 'auto' });
  // 全部 block 同時沉出（stagger 0）、0.5s，完全對齊桌面 footer exit（user 2026-06-11：要跟桌面一致）
  return playRevealExit(mobileBlocks, { stagger: 0, duration: FOOTER_EXIT_DUR });
}

function resetFooterMobileAfterExit() {
  if (!mobileBlocks || !mobileBlocks.length) { _footerExited = false; return; }
  const footer = getMobileFooter();
  // 隱藏頁（generate/library/atlas）footer display:none → 留著 flag，下次顯示 footer 的頁再復位（避免 block 卡在沉出態）
  if (!footer || footer.offsetParent === null) return;
  _footerExited = false;
  // footer 已 scrollToTop 捲離視窗 → 復位不被看到，純把 block 從沉出態 yPercent:100 升回
  gsap.fromTo(mobileBlocks, { yPercent: 100 },
    { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, stagger: 0.08, overwrite: 'auto', clearProps: 'transform' });
  const tabsInner = getFooterTabsInner(footer);
  if (tabsInner) gsap.fromTo(tabsInner, { yPercent: CLIP_HIDE_YPERCENT }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto', clearProps: 'transform' });
}

// 散佈 items 以外的 footer 元素：它們不在 scatter 系統內，退場時若不動會「凍在畫面上」顯得只散了一半。
//   - 左側 Lottie logo：hero clip-reveal（.footer-logo-area 當遮罩 overflow:clip、內層 .footer-logo-inner
//     yPercent 沉出/升入）——2026-07-15 由 header bars 同款 clip-path wipe 改制，對齊 header logo 的滑動退場。
//   - 左下規章連結區（.footer-privacy）：clip-reveal（yPercent 沉出/升入），.footer-privacy 自身 overflow:clip
//     當遮罩、只動內層 `> div`（不動態 wrap，避免破壞 .footer-privacy > div 的 align/text-align 規則）。user 2026-06-08。
// 回傳 { mask, inner }：mask=.footer-logo-area（掛 overflow:clip，不 reparent 免破壞 footer-inner flex 佈局）
function getFooterLogo(area) {
  const footerRoot = area.closest('footer');
  const mask = footerRoot ? footerRoot.querySelector('.footer-logo-area') : null;
  if (!mask) return null;
  const inner = mask.querySelector('.footer-logo-inner');
  if (!inner) return null;
  mask.style.overflow = 'clip';   // 常駐無害（logo 本就含在 area 內），設一次免 race
  return { mask, inner };
}

// 規章區 4 個連結各自獨立 clip-reveal：回傳 4 個 <a>。setupClipReveal 會各包一層 overflow:clip 遮罩，
// <a> 靠 footer.css 的 display:block 才吃得到 yPercent transform（包進 div 後不再是 flex item、預設 inline）。
function getFooterPrivacyLinks(area) {
  const footerRoot = area.closest('footer');
  if (!footerRoot) return [];
  // 含 a11y 標章 placeholder 與 copyright <p>：跟連結一起 clip-reveal，否則退場時它們會凍住不動（其餘沉出）。
  // ⚠️ display:none 的要濾掉（現況＝標章 placeholder 全域 hide）：元素本身無 layout box，但 setupClipReveal
  //    包的 wrapper 是可見空 div、在 flex column 多佔一個 gap 槽（8px）→ 欄變高、底部錨定 → 點擊瞬間整欄上跳
  return Array.from(footerRoot.querySelectorAll('.footer-privacy a, .footer-a11y-badge, .footer-privacy .footer-copyright'))
    .filter((el) => getComputedStyle(el).display !== 'none');
}

// 分頁鈕列（.footer-tabs）：clip-reveal（user 2026-09-09f，由 clip-path wipe 改制、對齊全站進出場語彙）。
// per-tab yPercent 不可行（平板 CSS `.footer-tab { transform:none !important }` 蓋掉 GSAP inline）→ 改動
// 「整條 inner wrapper」：box 本身當遮罩（overflow-x:auto 連帶 y 裁切、scrollbar 已藏），children lazy 包進
// `.footer-tabs-inner`（display/gap/align 全 inherit 自 box、排版不變）做 yPercent 沉出/升回。
// 每次呼叫收編 box 直屬殘留子（renderFooterContent 重跑會 append 新 tab 到 box 尾）；unwrapFooterAnim 會剝掉
// （跨 1200 重建重包）。矮橫向 display:none（offsetParent null）自動跳過。
function getFooterTabsInner(footerRoot) {
  const box = footerRoot ? footerRoot.querySelector('.footer-tabs') : null;
  if (!(box instanceof HTMLElement) || box.offsetParent === null) return null;
  let inner = /** @type {HTMLElement | null} */ (box.querySelector(':scope > .footer-tabs-inner'));
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'footer-tabs-inner';
    inner.style.cssText = 'display:flex;flex-direction:inherit;align-items:inherit;gap:inherit;';
    box.appendChild(inner);
  }
  Array.from(box.children).forEach((ch) => { if (ch !== inner) inner.appendChild(ch); });
  return inner;
}

export function playFooterExit() {
  if (typeof gsap === 'undefined') return Promise.resolve();
  if (usesMobileFooter()) return playFooterMobileExit();
  if (!shuffleCtx) return Promise.resolve();
  const { area, anchors, items } = shuffleCtx;
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
  gsap.killTweensOf(anchors);  // 殺掉可能還在跑的 shuffle glide（現在 shuffle 動的是 anchor），否則 anchor 邊移邊被 items exit 疊加
  gsap.killTweensOf(items);
  return new Promise(resolve => {
    _footerExitResolve = resolve;
    // 三組 footer 元素全 clip-reveal 沉出、timing **完全相同**（FOOTER_EXIT_DUR 0.5s + EASE.exit + 無 stagger）→ 同時、同速、時長一致。
    // ease/時長直接照 hero clip-reveal exit（hero-animation.js EXIT_DURATION=0.5 + EASE.exit/power3.in；power3.in 在短 0.5s 前段空白不明顯）。
    //   - 散佈卡：item yPercent 0→100 沉入 anchor overflow:clip 遮罩 → 換頁前乾淨消失（舊版用 viewport px 整卡滑出，
    //     因當時 anchor 無遮罩、yPercent 只挪一下沒出界 → user 報「移到一半就切」；改遮罩後 yPercent:100 即全隱）。
    //   - logo：.footer-logo-area 遮罩、內層 yPercent 沉出。
    //   - 規章區：4 個連結各自 clip-reveal 沉出（yPercent 0→100，每個 <a> 自己的 overflow:clip wrapper 當遮罩），stagger 0 一起出場。
    // 三組同在 0.5s 結束，用 items 的 onComplete resolve。
    if (logo) gsap.to(logo.inner, { yPercent: 100, duration: FOOTER_EXIT_DUR, ease: EASE.exit, overwrite: 'auto' });
    if (privacyLinks.length) gsap.to(privacyLinks, { yPercent: 100, duration: FOOTER_EXIT_DUR, ease: EASE.exit, stagger: 0, overwrite: 'auto' });
    // 110 overshoot：旋轉 tab 角凸出 inner 上緣，100% 貼齊遮罩底會殘留（同上 mobile 路徑註）
    const tabsInner = getFooterTabsInner(area.closest('footer'));
    if (tabsInner) gsap.to(tabsInner, { yPercent: CLIP_HIDE_YPERCENT, duration: FOOTER_EXIT_DUR, ease: EASE.exit, overwrite: 'auto' });
    const noteInner = getFooterNoteInner(area);
    if (noteInner) gsap.to(noteInner, { yPercent: CLIP_HIDE_YPERCENT, duration: FOOTER_EXIT_DUR, ease: EASE.exit, overwrite: 'auto' });
    gsap.to(items, {
      yPercent: CLIP_HIDE_YPERCENT,
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
  if (typeof gsap === 'undefined') { _footerExited = false; return; }
  if (usesMobileFooter()) { resetFooterMobileAfterExit(); return; }
  if (!shuffleCtx) { _footerExited = false; return; }
  const { area, anchors, obstacles, items, fallbackLayout } = shuffleCtx;
  // footer 在新頁是隱藏頁（generate/library/atlas）→ 留著 flag，下次顯示 footer 的頁再重置，避免 items 卡隱藏
  if (!area || area.offsetParent === null) return;
  _footerExited = false;
  gsap.killTweensOf(items);
  // anchor 套回 currentLayout（退場若撞上 shuffle glide，anchor 被凍在半路）→ 不重算 layout、直接重進場。
  if (currentLayout) applyPlacement(currentLayout);
  hideItemsClip(items);
  playClipRevealScatter(items);
  const logo = getFooterLogo(area);
  const privacyLinks = getFooterPrivacyLinks(area);
  if (privacyLinks.length) setupClipReveal(privacyLinks, { hide: false });
  // timing 對齊 items 重進場（playClipRevealScatter：DUR.reveal + EASE.enter）→ 復位也一致
  if (logo) gsap.fromTo(logo.inner, { yPercent: 100 }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto', clearProps: 'transform' });
  // 規章區 4 連結 clip-reveal 復位：從 yPercent:100（沉在遮罩下）一起升回 0（stagger 0）；fromTo 明確起點、clearProps 收乾淨
  if (privacyLinks.length) gsap.fromTo(privacyLinks, { yPercent: 100 }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, stagger: 0, overwrite: 'auto', clearProps: 'transform' });
  const tabsInner = getFooterTabsInner(area.closest('footer'));
  if (tabsInner) gsap.fromTo(tabsInner, { yPercent: CLIP_HIDE_YPERCENT }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto', clearProps: 'transform' });
  const noteInner = getFooterNoteInner(area);
  if (noteInner) gsap.fromTo(noteInner, { yPercent: CLIP_HIDE_YPERCENT }, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, overwrite: 'auto', clearProps: 'transform' });
  startShuffleLoop(area, anchors, obstacles, items, fallbackLayout);
}

// ── 跨 1200 邊界即時重建（scatter ↔ 線性）─────────────────────────
// user 2026-08-08：擴大過 1200 時，散佈 items 若沒被 scatter JS 接管會停在 CSS 的 opacity:0 → 一片空白。
// 靠 resize 偵測跨越 1200，剝掉舊包層 + 依新 mode 重跑 initFooterScatter，重播進場動畫（不整頁 reload）。
// ⚠️只偵測「寬度」跨 1200；矮橫向 gate 的線性化由 orientation-reload 處理（避免雙重重建）。
function unwrapFooterAnim(footer, keepLegal = false) {
  // 反覆剝掉 scatter(.footer-anchor) 與 mobile/線性(.clip-reveal-wrapper) 包層，把 item 還原成原本直接子
  // （兩者可能巢狀：clip-reveal-wrapper > footer-anchor > item），guard 防意外無限迴圈。
  // keepLegal（切分頁）：legal chip 的 wrapper 帶著旋轉角，剝掉重包＝每切一次分頁三顆就跳一次角 → 留著
  const find = () => Array.from(footer.querySelectorAll('.footer-anchor, .clip-reveal-wrapper, .footer-tabs-inner'))
    .filter((w) => !(keepLegal && /** @type {HTMLElement} */ (w).dataset.legalBound));
  let guard = 0;
  let wrappers = find();
  while (wrappers.length && guard++ < 20) {
    wrappers.forEach((w) => {
      // .footer-tabs-inner 可能含多個 tab → 全部搬回（其他 wrapper 單子、迴圈一次也搬完）
      while (w.firstElementChild) { if (w.parentElement) w.parentElement.insertBefore(w.firstElementChild, w); else break; }
      w.remove();
    });
    wrappers = find();
  }
  // 清 item/logo/privacy 上的 inline 動畫殘留（scatter 的 transform/left/top/opacity、office snug width、reveal transform）
  const RESET = '.footer-social, .footer-social-icon, .footer-fax, .footer-tel, .footer-office, .footer-email, .footer-info, .footer-unit, .footer-logo-area, .footer-logo-inner, .footer-privacy, .footer-privacy a, .footer-a11y-badge, .footer-copyright, .footer-note, .footer-note-inner';
  footer.querySelectorAll(RESET).forEach((el) => {
    const s = /** @type {HTMLElement} */ (el).style;
    s.transform = ''; s.opacity = ''; s.left = ''; s.top = '';
    s.width = ''; s.height = ''; s.marginLeft = ''; s.marginTop = ''; s.overflow = '';
    s.background = '';   // scatter 的三原色 accent 底色（applyAccentColors inline）→ 清掉，<1200 線性版跟手機一樣無底色
  });
  // 分頁鈕列舊版 clip-path wipe 殘留（改制前退場後進隱藏頁再跨斷點）→ 清掉免 tabs 永久隱形（新版 inner 已被上方 unwrap 剝掉）
  const tabsBox = footer.querySelector('.footer-tabs');
  if (tabsBox) /** @type {HTMLElement} */ (tabsBox).style.clipPath = '';
  // 散佈排不進時 initFooterScatter 加高的上區：重建（resize／跨斷點）才還原，切分頁保留
  const right = /** @type {HTMLElement | null} */ (footer.querySelector('.footer-right'));
  if (right && !keepLegal) right.style.minHeight = '';
  delete footer.dataset.footerMobileInit;
}

function reinitVisibleFooters() {
  document.querySelectorAll('footer.footer-shell, footer#site-footer-static').forEach((f) => {
    if (!(f instanceof HTMLElement) || f.offsetParent === null) return;  // 隱藏 footer（generate/library/atlas）不重建
    stopShuffleLoop();
    mobileBlocks = null;
    _footerExited = false;
    unwrapFooterAnim(f);
    initFooterScatter(f, { animate: true });   // 跨 1200 重建才播進場（避免拉寬過 1200 一片空白）；一般刷新走靜態
  });
}

let _footerLastNarrow = null;
let _footerReinitTimer = null;
let _footerReinitBound = false;
function bindFooterBreakpointReinit() {
  if (_footerReinitBound) return;
  _footerReinitBound = true;
  // 兩個斷點都要重建：1200（scatter↔平板 tab 版）＋ 768（平板 tab 版↔手機全群組線性——
  // 群組顯隱 .fgroup-off 由 JS 掛，跨 768 不重跑會殘留錯誤顯隱；CMS 化前由 CSS media 自動）
  const bpState = () => `${window.innerWidth < 768 ? 'phone' : window.innerWidth < 1024 ? 'tablet' : 'desktop'}`;
  _footerLastNarrow = bpState();
  window.addEventListener('resize', () => {
    const now = bpState();
    // 沒跨斷點：平板/手機是線性版、CSS 自己跟；桌面 scatter 是 px 絕對座標，散佈區縮了卡片不會跟 →
    // 拖曳停 220ms 後也重建（重跑 scatter；user 2026-09-27「畫面跑掉後馬上重排」）。
    if (now === _footerLastNarrow && now !== 'desktop') return;
    _footerLastNarrow = now;
    clearTimeout(_footerReinitTimer);
    _footerReinitTimer = window.setTimeout(reinitVisibleFooters, 220);  // debounce 等拖曳停
  }, { passive: true });
}
