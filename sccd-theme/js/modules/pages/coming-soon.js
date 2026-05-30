/**
 * 臨時 index Coming Soon 字卡
 *
 * 兩張字卡（COMING SOON / 即將登場）固定位置垂直堆疊在畫面中央偏上：
 *   - COMING SOON 在上、即將登場 在下，水平置中
 *   - 各自隨機旋轉 ±12°
 *   - 進場 clip-reveal yPercent 100→0；每 5s shuffle 換顏色 + 換旋轉角度
 *
 * 採固定位置（非 collision-based 散落）是 user 2026-05-28 的簡化要求 — 反正是暫時頁
 */

import { setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';

const PRIMARY_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

const ROTATION_RANGE = 12;
const SHUFFLE_INTERVAL_MS = 5000;
const EXIT_DURATION_S = 0.6;

// 四個固定錨點（畫面四象限中心區）分上下兩 row，每次上下各挑 1 點 → 兩張卡保證不同 row
// → 字卡 EN 寬度長（"COMING SOON"），同 row 桌面會跨中線疊到鄰卡（user 2026-05-28 回報「疊在一起」）
const ANCHOR_TOP_ROW = [
  { topPct: 30, leftPct: 30 }, // 左上
  { topPct: 30, leftPct: 70 }, // 右上
];
const ANCHOR_BOTTOM_ROW = [
  { topPct: 60, leftPct: 30 }, // 左下
  { topPct: 60, leftPct: 70 }, // 右下
];

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 每輪 top row 挑 1 + bottom row 挑 1，再隨機打亂順序給兩張卡 → EN/ZH 上下關係仍隨機
function pickAnchorsNoOverlap(count) {
  const result = [pickOne(ANCHOR_TOP_ROW), pickOne(ANCHOR_BOTTOM_ROW)];
  if (Math.random() < 0.5) result.reverse();
  return result.slice(0, count);
}

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

// 字卡放置後量旋轉後 bbox，若超出 stage 邊界把 anchor 推回 viewport 內（加 EDGE_MARGIN_PX buffer）
const EDGE_MARGIN_PX = 16;
function clampAnchorIntoStage(anchor, stage) {
  const sRect = stage.getBoundingClientRect();
  const aRect = anchor.getBoundingClientRect();
  // 計算超出量（正數 = 超出，需往反方向推）
  const overflowLeft   = sRect.left   + EDGE_MARGIN_PX - aRect.left;
  const overflowRight  = aRect.right  - (sRect.right  - EDGE_MARGIN_PX);
  const overflowTop    = sRect.top    + EDGE_MARGIN_PX - aRect.top;
  const overflowBottom = aRect.bottom - (sRect.bottom - EDGE_MARGIN_PX);
  let dx = 0, dy = 0;
  if (overflowLeft > 0)   dx += overflowLeft;
  if (overflowRight > 0)  dx -= overflowRight;
  if (overflowTop > 0)    dy += overflowTop;
  if (overflowBottom > 0) dy -= overflowBottom;
  if (dx === 0 && dy === 0) return;
  // 讀現有 GSAP transform 值再加上修正量（保留旋轉 + xPercent/yPercent 居中）
  const curX = Number(gsap.getProperty(anchor, 'x')) || 0;
  const curY = Number(gsap.getProperty(anchor, 'y')) || 0;
  gsap.set(anchor, { x: curX + dx, y: curY + dy });
}

function placeAllCards(stage) {
  /** @type {NodeListOf<HTMLElement>} */
  const anchors = stage.querySelectorAll('[data-coming-soon-card]');
  // 每輪上下 row 各挑 1 點，保證兩張卡不同 row、不會橫向疊加
  const chosen = pickAnchorsNoOverlap(anchors.length);
  anchors.forEach((anchor, i) => {
    const pos = chosen[i];
    if (!pos) return;
    // 重設 x/y inline 偏移避免累積（上一輪 clamp 可能留下修正量）
    if (typeof gsap !== 'undefined') gsap.set(anchor, { x: 0, y: 0 });
    setAnchorPlacement(anchor, {
      topPct: pos.topPct,
      leftPct: pos.leftPct,
      rot: randRange(-ROTATION_RANGE, ROTATION_RANGE),
    });
    if (typeof gsap !== 'undefined') clampAnchorIntoStage(anchor, stage);
  });
}

function shuffleAll(stage) {
  if (typeof gsap === 'undefined') return;
  /** @type {NodeListOf<HTMLElement>} */
  const cards = stage.querySelectorAll('.coming-soon-card');
  if (cards.length === 0) return;

  // exit → 換色 + 換旋轉 → enter
  const newColor = pickColor();
  gsap.killTweensOf(cards);
  gsap.to(cards, {
    yPercent: 100,
    duration: EXIT_DURATION_S,
    ease: 'power3.out',
    stagger: { each: 0.08, axis: 'y' },
    overwrite: 'auto',
    onComplete: () => {
      // 換色（套到 card）+ 換旋轉（套到 anchor，位置不變）
      stage.querySelectorAll('.coming-soon-card').forEach(card => {
        /** @type {HTMLElement} */ (card).style.backgroundColor = newColor;
      });
      placeAllCards(stage);
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

export function initComingSoon() {
  const stage = document.getElementById('coming-soon-stage');
  if (!stage) return;

  const color = pickColor();
  stage.querySelectorAll('.coming-soon-card').forEach(card => {
    /** @type {HTMLElement} */ (card).style.backgroundColor = color;
  });

  placeAllCards(stage);

  const cards = stage.querySelectorAll('.coming-soon-card');
  setupClipReveal(cards);
  playClipReveal(cards, {
    onComplete: () => startShuffleLoop(stage),
  });
}

export function cleanupComingSoon() {
  stopShuffleLoop();
  if (typeof gsap !== 'undefined') {
    const stage = document.getElementById('coming-soon-stage');
    if (stage) gsap.killTweensOf(stage.querySelectorAll('.coming-soon-card'));
  }
}
