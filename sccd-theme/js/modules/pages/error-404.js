/**
 * 404 Page
 *
 * 三張卡（ERROR / 錯誤 / 回首頁 btn）— 同色、隨機旋轉、collision-based 隨機放置
 * 每張卡 = anchor wrapper（負責 abs 定位 + 旋轉 + overflow:clip）+ 內層 card（負責 yPercent reveal）
 *
 * 放置策略：
 *   - 禁區：logo 左上（22%×22% of stage）+ mode btn 右上（12%×12% of stage）
 *   - 每張卡逐一試 MAX_ATTEMPTS 次隨機 (cx, cy, rot)；旋轉後 axis-aligned bbox + gap 不能碰禁區/其他卡
 *   - 每輪洗 anchor 優先序 → 中文可在英文左 / btn 可在上方等所有合法組合
 *
 * 動畫：
 *   - 進場：clip-reveal yPercent 100→0（anchor overflow:clip 當 mask）
 *   - shuffle 每 5s：exit (yPercent 0→100) → 重設 anchor 位置/旋轉 → enter (yPercent 100→0)
 *
 * SPA cleanup：clearInterval + killTweensOf 防 timer 與 tween 殘留
 */

import { setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';

const PRIMARY_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

const ROTATION_RANGE = 12;          // ±度數
const SHUFFLE_INTERVAL_MS = 5000;   // 每 5s 重排
const EXIT_DURATION_S = 0.6;        // exit 退場時長（yPercent 0→100）

// 禁區（% of stage）：整條 header strip — 即便該位置沒元素也避開，視覺上保留 header 區域感
// 22% 蓋住 header bar (~8%) + logo 未縮小時的展開高度 (~22%)
const FORBIDDEN_ZONES_PCT = [
  { topMin: 0, topMax: 22, leftMin: 0, leftMax: 100 },
];
const CARD_GAP_PX = 16;             // 卡片之間 + 禁區 buffer
const MAX_ATTEMPTS = 40;            // 單張卡找位置最多試幾次

let shuffleTimer = null;

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickColor() {
  return PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
}

function setAnchorPlacement(anchorEl, { topPct, leftPct, rot }) {
  if (typeof gsap === 'undefined') {
    anchorEl.style.top = `${topPct}%`;
    anchorEl.style.left = `${leftPct}%`;
    anchorEl.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
    return;
  }
  gsap.set(anchorEl, {
    top: `${topPct}%`,
    left: `${leftPct}%`,
    xPercent: -50,
    yPercent: -50,
    rotation: rot,
  });
}

// 旋轉後 axis-aligned bbox：w' = w·|cos θ| + h·|sin θ|, h' = h·|cos θ| + w·|sin θ|
function rotatedBBox(w, h, deg) {
  const r = Math.abs(deg) * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { w: w * c + h * s, h: h * c + w * s };
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function forbiddenZonesPx(sw, sh) {
  return FORBIDDEN_ZONES_PCT.map(z => ({
    x: z.leftMin / 100 * sw,
    y: z.topMin / 100 * sh,
    w: (z.leftMax - z.leftMin) / 100 * sw,
    h: (z.topMax - z.topMin) / 100 * sh,
  }));
}

// Collision-based 隨機放置：對每張卡試 MAX_ATTEMPTS 次 (cx, cy, rot)，
// 旋轉 bbox + gap 不碰禁區/已置卡片就採用；都失敗就 fallback 保留原位
function randomizeAllPlacements(stage) {
  /** @type {HTMLElement[]} */
  const anchors = Array.from(stage.querySelectorAll('[data-error-card]'));
  if (anchors.length === 0) return;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw === 0 || sh === 0) return;
  const forbidden = forbiddenZonesPx(sw, sh);

  // 洗 anchor 優先序 → 不同 card 各輪輪流第一個被放（最大自由度），確保各種排列都會出現
  const order = [...anchors].sort(() => Math.random() - 0.5);

  /** @type {{x:number,y:number,w:number,h:number}[]} */
  const placedRects = [];
  /** @type {{anchor:HTMLElement, topPct:number, leftPct:number, rot:number}[]} */
  const results = [];

  for (const anchor of order) {
    const natW = anchor.offsetWidth;
    const natH = anchor.offsetHeight;
    if (natW === 0 || natH === 0) continue;
    let accepted = null;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const rot = randRange(-ROTATION_RANGE, ROTATION_RANGE);
      const bb = rotatedBBox(natW, natH, rot);
      // 中心點活動範圍：扣半 bbox + gap，確保整張卡含 buffer 落在 stage 內
      const cxMin = bb.w / 2 + CARD_GAP_PX;
      const cxMax = sw - bb.w / 2 - CARD_GAP_PX;
      const cyMin = bb.h / 2 + CARD_GAP_PX;
      const cyMax = sh - bb.h / 2 - CARD_GAP_PX;
      if (cxMax <= cxMin || cyMax <= cyMin) break; // stage 太小裝不下
      const cx = randRange(cxMin, cxMax);
      const cy = randRange(cyMin, cyMax);
      const rect = { x: cx - bb.w / 2, y: cy - bb.h / 2, w: bb.w, h: bb.h };
      // 含 gap 的擴張 rect 用來判碰撞
      const inflated = {
        x: rect.x - CARD_GAP_PX,
        y: rect.y - CARD_GAP_PX,
        w: rect.w + 2 * CARD_GAP_PX,
        h: rect.h + 2 * CARD_GAP_PX,
      };

      let ok = true;
      for (const f of forbidden) if (rectsOverlap(inflated, f)) { ok = false; break; }
      if (ok) for (const e of placedRects) if (rectsOverlap(inflated, e)) { ok = false; break; }
      if (ok) { accepted = { rect, topPct: cy / sh * 100, leftPct: cx / sw * 100, rot }; break; }
    }

    if (!accepted) continue; // 試 MAX_ATTEMPTS 次都失敗 → 保留原位
    placedRects.push(accepted.rect);
    results.push({ anchor, topPct: accepted.topPct, leftPct: accepted.leftPct, rot: accepted.rot });
  }

  results.forEach(r => setAnchorPlacement(r.anchor, { topPct: r.topPct, leftPct: r.leftPct, rot: r.rot }));
}

// 三段式 shuffle：exit 退場 → 換位置 → enter 進場
// exit ease 用 power3.out（power3.in 前半段幾乎沒動會被誤判為「沒 fire」）
// 退場期間 card 被 anchor 的 overflow:clip 吃掉；換位置在 cards 隱形時做 → enter 從新位置由下浮起
function shuffleAll(stage) {
  if (typeof gsap === 'undefined') return;
  /** @type {NodeListOf<HTMLElement>} */
  const cards = stage.querySelectorAll('.error-404-card');
  if (cards.length === 0) return;

  gsap.killTweensOf(cards);
  gsap.to(cards, {
    yPercent: 100,
    duration: EXIT_DURATION_S,
    ease: 'power3.out',
    stagger: { each: 0.08, axis: 'y' },
    overwrite: 'auto',
    onComplete: () => {
      randomizeAllPlacements(stage);
      // cards 仍在 yPercent:100；playClipReveal 直接 tween 到 0（標準 0.9s power3.out + 0.12s stagger）
      playClipReveal(cards);
    },
  });
}

function startShuffleLoop(stage) {
  stopShuffleLoop();
  shuffleTimer = window.setInterval(() => shuffleAll(stage), SHUFFLE_INTERVAL_MS);
}

function stopShuffleLoop() {
  if (shuffleTimer != null) {
    clearInterval(shuffleTimer);
    shuffleTimer = null;
  }
}

export function init404() {
  document.body.classList.add('page-404');

  const stage = document.getElementById('error-404-stage');
  if (!stage) return;

  // 三張卡同一顏色
  const color = pickColor();

  /** @type {NodeListOf<HTMLElement>} */
  const anchors = stage.querySelectorAll('[data-error-card]');
  anchors.forEach(anchor => {
    const card = /** @type {HTMLElement|null} */ (anchor.querySelector('.error-404-card'));
    if (card) card.style.backgroundColor = color;
  });

  // 初次 random 放置（用 anchor.offsetWidth/Height 量自然尺寸，transform 不影響 layout box）
  randomizeAllPlacements(stage);

  // Y reveal 進場：anchor 已 overflow:clip → setupClipReveal 偵測 parent.overflowY=clip 會 skip wrap，
  // 只 set yPercent:100；playClipReveal tween 到 0 完成後啟動 shuffle loop
  const cards = stage.querySelectorAll('.error-404-card');
  setupClipReveal(cards);
  playClipReveal(cards, {
    onComplete: () => startShuffleLoop(stage),
  });
}

export function cleanup404() {
  stopShuffleLoop();
  document.body.classList.remove('page-404');
  if (typeof gsap !== 'undefined') {
    const stage = document.getElementById('error-404-stage');
    if (stage) gsap.killTweensOf(stage.querySelectorAll('.error-404-card'));
  }
}
