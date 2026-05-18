/**
 * Index Page - News Marquee Stack
 * 3 個 news banner 左對齊堆疊在左下角，每個 bar 前綴一個隨機三原色數字方塊（item _num = 後臺順序 1-N）；
 * items > 3 時每 5s 依序 cycle：
 * - slot 0（最上方 / 第一個 / 最舊）→ yPercent up clip-reveal 收起退場（duration 0.35s，先於 survivor 平移完成避免 overlap）
 * - slot 1, 2 → 往上平移一個 slot，duration 0.6s power2.inOut（同 about resources accordion）；
 *   中間 banner（slot 1）位移到第一個（slot 0），slot 2 跟著上來填 slot 1；每個 banner 帶著自己的 rotation + 數字方塊跟著走
 * - 新 item 從 slot 2（最後一個）→ clip-path top-down wipe 展開進場
 * 任一 banner 被 hover 時暫停 cycle；hoverCount 歸 0 後若有 pending 立即 advance
 * Banner 寬度依 poster orientation：landscape=400 / portrait=300（poster 自然尺寸 preload 判定）
 */

import { applyNewsHover, removeNewsHover } from '../animations/floating-items.js';

const SLOT_COUNT = 3;
const CYCLE_INTERVAL = 5000;
const WIDTH_LANDSCAPE = 400;  // 比原本 600 短 1/3
const WIDTH_PORTRAIT  = 300;
const BAR_HEIGHT = 40;        // 數字方塊邊長 ≈ bar 高度（h5 font 1.4rem + 預設 line-height + padding 0.35rem*2 ≈ 40）
// 數字方塊配色：專案三原色固定一輪（綠 / 粉 / 藍）；
// cycle 時消失的 banner 顏色由新進場 banner 繼承 → 同時始終保有三色各一個
const RGB_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
const ENTER_DELAY = 0.5;      // 新進場 banner 在 cycle 觸發後 delay 0.5s 才走 reveal
const PUSH_DUR = 0.5;         // hover 時上方 banner 被推開的 GSAP duration（仿 about resources accordion 節奏）
const PUSH_EASE = 'power2.inOut';

// 全部 slot 同 x（左對齊），y 階梯排列；rotation 由 item 自帶
// index 0 = 最上方（第一個 / 最舊），index 2 = 最下方（最後一個 / 最新）
const SLOT_X = 60;
// 相鄰 slot y 差 50px = BAR_HEIGHT(40) + 10px 視覺 gap
const SLOT_CONFIGS = [
  { x: SLOT_X, y: -170 },
  { x: SLOT_X, y: -120 },
  { x: SLOT_X, y:  -70 },
];

// 旋轉角度刻意壓在 ±0.3° ~ ±1°：bar 寬 ~450px、transform-origin: left center 下，
// 1° 右側邊緣垂直位移 ~7.85px ≈ slot gap (10px)；超過就會跟上下 banner 互相遮蓋
// 不沿用 SCCDHelpers.getRandomRotation（範圍到 ±6° 太大）
function randomRotation() {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * (0.3 + Math.random() * 0.7);
}

export function initMarquee() {
  const stack = document.getElementById('homepage-marquee-stack');
  if (!stack) return;

  fetch('data/news.json')
    .then(r => r.json())
    .then(async data => {
      const items = Array.isArray(data?.items) ? data.items.filter(it => it && it.text) : [];
      if (items.length === 0) return;
      // 後臺順序 → item._num（1-based）；item-bound，cycle 時跟著走
      items.forEach((item, i) => { item._num = i + 1; });
      await preloadOrientations(items);
      runMarqueeStack(stack, items);
    })
    .catch(() => {});
}

// Poster 自然尺寸 → orientation；banner 寬度需在 create 時就決定，避免後續 image load 後 width snap
async function preloadOrientations(items) {
  await Promise.all(items.map(item => {
    if (!item.poster) { item.orientation = 'landscape'; return Promise.resolve(); }
    if (item.orientation) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        item.orientation = (img.naturalWidth >= img.naturalHeight) ? 'landscape' : 'portrait';
        resolve();
      };
      img.onerror = () => { item.orientation = 'landscape'; resolve(); };
      img.src = item.poster;
    });
  }));
}

// ── Banner builder ──────────────────────────────────────────

function createBanner(item, squareColor) {
  const barWidth = item.orientation === 'portrait' ? WIDTH_PORTRAIT : WIDTH_LANDSCAPE;
  const totalWidth = BAR_HEIGHT + barWidth;
  const rotation = randomRotation();

  const wrap = document.createElement('div');
  wrap.className = 'hm-banner';
  wrap.style.cssText = `
    position: absolute;
    left: 0; bottom: 0;
    width: ${totalWidth}px;
    pointer-events: none;
    will-change: transform;
    transform-origin: left center;
  `;

  // Clip wrapper 包覆 row → 提供 entry/exit 動畫的 overflow:clip
  const clipWrap = document.createElement('div');
  clipWrap.className = 'hm-banner-clip';
  clipWrap.style.cssText = `
    overflow: clip;
    position: relative;
    pointer-events: auto;
  `;

  // Row：flex 排 [數字方塊 + bar]；動畫套在 row 上 → 兩個元素一起進/出
  const row = document.createElement('div');
  row.className = 'hm-banner-row';
  row.style.cssText = `
    display: flex;
    flex-direction: row;
    align-items: stretch;
    will-change: transform;
  `;

  // 數字方塊（隨機 accent bg，後臺順序）
  const square = document.createElement('div');
  square.className = 'hm-banner-num';
  square.textContent = String(item._num);
  square.style.cssText = `
    width: ${BAR_HEIGHT}px;
    flex-shrink: 0;
    background: ${squareColor};
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
  `;

  const link = document.createElement('a');
  link.className = 'homepage-marquee-link';
  link.href = item.url || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = `
    display: block;
    flex: 1;
    min-width: 0;
    background: #000;
    padding: 0.35rem 0;
    overflow: hidden;
    text-decoration: none;
    cursor: pointer;
  `;

  const inner = document.createElement('div');
  inner.className = 'homepage-marquee-inner';

  const text = document.createElement('span');
  text.className = 'homepage-marquee-text text-h4';
  text.style.cssText = 'color: #fff; font-weight: 700; font-size: var(--font-size-h5);';
  text.textContent = item.text;

  const clone = document.createElement('span');
  clone.className = 'homepage-marquee-clone text-h4';
  clone.style.cssText = 'color: #fff; font-weight: 700; font-size: var(--font-size-h5);';
  clone.textContent = item.text;

  const duration = Math.max(16, item.text.length * 0.36);
  inner.style.animationDuration = `${duration}s`;

  inner.appendChild(text);
  inner.appendChild(clone);
  link.appendChild(inner);

  row.appendChild(square);
  row.appendChild(link);
  clipWrap.appendChild(row);
  wrap.appendChild(clipWrap);

  let posterEl = null;
  if (item.poster) {
    posterEl = document.createElement('div');
    posterEl.className = 'hm-poster';
    posterEl.style.cssText = `
      position: absolute;
      left: 0; bottom: 100%;
      width: 100%;
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.4s cubic-bezier(0.25,0,0,1);
      pointer-events: auto;
      cursor: pointer;
    `;
    const img = document.createElement('img');
    img.src = item.poster;
    img.alt = '';
    img.style.cssText = 'display: block; width: 100%; height: auto;';
    posterEl.appendChild(img);
    wrap.appendChild(posterEl);
    posterEl.addEventListener('click', () => window.open(item.url || '#', '_blank'));
  }

  return { el: wrap, row, link, posterEl, item, rotation, width: totalWidth, color: squareColor, _posterH: 0 };
}

function applySlotTransform(b, slotIndex, animate) {
  const cfg = SLOT_CONFIGS[slotIndex];
  // rotation 取 banner 自帶（item-bound）；slot 只決定 (x, y) 同 left x → 左對齊
  const props = { x: cfg.x, y: cfg.y, rotation: b.rotation };
  if (animate) {
    // 沿用 about resources accordion 的平移節奏：power2.inOut 0.6s
    gsap.to(b.el, { ...props, duration: 0.6, ease: 'power2.inOut' });
  } else {
    gsap.set(b.el, props);
  }
}

function enterBanner(b) {
  // 新進場：clip-path 由上往下揭露 row（square + bar 一起出現），無 vertical translation
  // delay ENTER_DELAY → 等前面的 exit + 平移先進行一陣子才開始 reveal
  gsap.fromTo(b.row,
    { clipPath: 'inset(0% 0% 100% 0%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.out', delay: ENTER_DELAY }
  );
}

function exitBanner(b) {
  // 退場期間 disable 互動
  if (b.posterEl) {
    b.posterEl.style.maxHeight = '0';
    b.posterEl.style.pointerEvents = 'none';
  }
  const clipWrap = b.el.querySelector('.hm-banner-clip');
  if (clipWrap) clipWrap.style.pointerEvents = 'none';
  // 第一個 row 整列 yPercent 上滑出 clip-wrap；duration 短於 survivor 0.6s 平移 → 不 overlap
  gsap.to(b.row, {
    yPercent: -110,
    duration: 0.35,
    ease: 'power2.out',
    onComplete: () => { b.el.remove(); },
  });
}

function bindBannerInteraction(b, onEnter, onLeave, pushAbove, restoreAbove) {
  const img = b.posterEl?.querySelector('img');
  if (img) {
    const calc = () => {
      if (img.naturalWidth) {
        b._posterH = Math.round(img.naturalHeight / img.naturalWidth * b.width);
      }
    };
    if (img.complete && img.naturalWidth) calc();
    else img.addEventListener('load', calc, { once: true });
  }

  b.el.addEventListener('mouseenter', () => {
    onEnter();
    if (b.posterEl && b._posterH) {
      b.posterEl.style.maxHeight = `${b._posterH + 20}px`;
      pushAbove(b);
    }
  });
  b.el.addEventListener('mouseleave', () => {
    if (b.posterEl) {
      b.posterEl.style.maxHeight = '0';
      restoreAbove(b);
    }
    onLeave();
  });
}

// ── Stack runner ────────────────────────────────────────────

function runMarqueeStack(stack, items) {
  const banners = []; // index 0 = 第一個（最上方 / 最舊），index 2 = 最後一個（最下方 / 最新）
  let cursor = 0;
  let hoverCount = 0;

  // setTimeout-based pause/resume：hover 期間真的「凍結倒數」，離開後用剩餘秒數重排
  // （舊版 setInterval + pending 在 hover 跨 tick 時離開瞬間立刻 advance，視覺上像「沒等夠」）
  let timeoutId = null;
  let scheduledAt = 0;        // Date.now() of current setTimeout 排程時間
  let scheduledDuration = 0;  // 該次 setTimeout 排定的 ms
  let pausedRemaining = 0;    // pause 那一刻剩多少 ms 才該 fire

  function scheduleAdvance(ms) {
    if (timeoutId) clearTimeout(timeoutId);
    scheduledAt = Date.now();
    scheduledDuration = ms;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      // SPA 離開 index 後 stack 從 DOM 消失，停止自我重排（沿用舊版 isConnected guard）
      if (!stack.isConnected) return;
      advance();
      scheduleAdvance(CYCLE_INTERVAL);
    }, ms);
  }

  function pauseCycle() {
    if (!timeoutId) return;
    const elapsed = Date.now() - scheduledAt;
    pausedRemaining = Math.max(0, scheduledDuration - elapsed);
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function resumeCycle() {
    if (timeoutId) return;
    // 有剩餘就用剩餘排（連續性），無剩餘代表 hover 期間完全沒在排程 → 走完整週期
    scheduleAdvance(pausedRemaining > 0 ? pausedRemaining : CYCLE_INTERVAL);
    pausedRemaining = 0;
  }

  const onEnter = () => {
    hoverCount++;
    if (hoverCount === 1) {
      applyNewsHover();
      pauseCycle();
    }
  };
  const onLeave = () => {
    hoverCount = Math.max(0, hoverCount - 1);
    if (hoverCount === 0) {
      removeNewsHover();
      resumeCycle();
    }
  };

  // hover banner B：把 banners 陣列裡位置在 B 上方的所有 banner 往上推 posterH（仿 about resources accordion 的 push 效果）
  // overwrite: 'auto' 讓 push tween 蓋掉 cycling 平移 tween，避免疊衝突
  function pushAbove(hovered) {
    const idx = banners.indexOf(hovered);
    if (idx <= 0) return; // 最上面 (slot 0) 沒有東西在上方
    const pushAmount = (hovered._posterH || 0) + 20;
    for (let i = 0; i < idx; i++) {
      const above = banners[i];
      const cfg = SLOT_CONFIGS[i];
      gsap.to(above.el, {
        y: cfg.y - pushAmount,
        duration: PUSH_DUR,
        ease: PUSH_EASE,
        overwrite: 'auto',
      });
    }
  }
  function restoreAbove(hovered) {
    const idx = banners.indexOf(hovered);
    if (idx <= 0) return;
    for (let i = 0; i < idx; i++) {
      const above = banners[i];
      const cfg = SLOT_CONFIGS[i];
      gsap.to(above.el, {
        y: cfg.y,
        duration: PUSH_DUR,
        ease: PUSH_EASE,
        overwrite: 'auto',
      });
    }
  }

  const visibleCount = Math.min(SLOT_COUNT, items.length);
  for (let i = 0; i < visibleCount; i++) {
    // 初始 banner 0/1/2 對應 R/G/B（不足 3 個就只用前 N 個顏色）
    const b = createBanner(items[i], RGB_COLORS[i % RGB_COLORS.length]);
    stack.appendChild(b.el);
    applySlotTransform(b, i, false);
    bindBannerInteraction(b, onEnter, onLeave, pushAbove, restoreAbove);
    banners.push(b);
  }
  cursor = visibleCount % items.length;

  if (items.length <= SLOT_COUNT) return;

  function advance() {
    if (!stack.isConnected) return;

    const exiting = banners.shift();
    const inheritedColor = exiting.color;  // 新進場 banner 補上消失那個的顏色
    exitBanner(exiting);

    for (let i = 0; i < banners.length; i++) {
      applySlotTransform(banners[i], i, true);
    }

    const newItem = items[cursor];
    cursor = (cursor + 1) % items.length;
    const nb = createBanner(newItem, inheritedColor);
    stack.appendChild(nb.el);
    applySlotTransform(nb, SLOT_COUNT - 1, false);
    bindBannerInteraction(nb, onEnter, onLeave, pushAbove, restoreAbove);
    enterBanner(nb);
    banners.push(nb);
  }

  scheduleAdvance(CYCLE_INTERVAL);
}
