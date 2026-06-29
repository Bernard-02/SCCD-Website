/**
 * Library Card Stack
 * 顏色矩形卡片的幾何計算、切換動畫、marquee 渲染
 */

import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { playPanelTitleExit, playPanelBodyExit } from './library-panels.js';
import { DUR } from '../ui/motion.js';
import { sitePath } from '../ui/site-base.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';

export function initLibraryCard({ onTabSwitch, onTabSwitchPre, onEntranceDone: onEntranceDoneCb, initialTab = 'awards' }) {

  const PRIMARY_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  const stack   = document.getElementById('library-card-stack');
  const grayEl  = document.getElementById('library-card-main');
  if (!stack || !grayEl) return;

  let MAIN_W = 0, MAIN_H = 0;
  let activeEl = null;
  const tabOf   = new Map();
  const colorOf = new Map();
  const baseZOf = new Map();

  // ── 工具 ────────────────────────────────────────────────────

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  // ── 幾何工具 ────────────────────────────────────────────────

  function rectCorners(cx, cy, w, h, rotDeg) {
    const r = rotDeg * Math.PI / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    const hw = w / 2, hh = h / 2;
    return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y]) =>
      [cx + x*cos - y*sin, cy + x*sin + y*cos]
    );
  }

  function isInside(p, a, b) {
    return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]) >= 0;
  }

  function lineIntersect(a, b, c, d) {
    const A1=b[1]-a[1], B1=a[0]-b[0], C1=A1*a[0]+B1*a[1];
    const A2=d[1]-c[1], B2=c[0]-d[0], C2=A2*c[0]+B2*c[1];
    const det = A1*B2 - A2*B1;
    if (Math.abs(det) < 1e-10) return a;
    return [(B2*C1-B1*C2)/det, (A1*C2-A2*C1)/det];
  }

  function clipPolygon(subject, clip) {
    let out = [...subject];
    for (let i = 0; i < clip.length; i++) {
      if (!out.length) return [];
      const inp = out; out = [];
      const a = clip[i], b = clip[(i+1) % clip.length];
      for (let j = 0; j < inp.length; j++) {
        const cur = inp[j], prv = inp[(j+inp.length-1)%inp.length];
        const ci = isInside(cur,a,b), pi = isInside(prv,a,b);
        if (ci) { if (!pi) out.push(lineIntersect(prv,cur,a,b)); out.push(cur); }
        else if (pi) out.push(lineIntersect(prv,cur,a,b));
      }
    }
    return out;
  }

  function polyArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i+1) % pts.length;
      area += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1];
    }
    return Math.abs(area) / 2;
  }

  function calcVisibleRatio(target, occluders) {
    const targetArea = target.w * target.h;
    const targetPoly = rectCorners(target.cx, target.cy, target.w, target.h, target.rot);
    const clips = occluders
      .map(o => clipPolygon(rectCorners(o.cx,o.cy,o.w,o.h,o.rot), targetPoly))
      .filter(p => p.length >= 3);
    if (!clips.length) return 1;
    let union = clips.reduce((s,p) => s + polyArea(p), 0);
    for (let i = 0; i < clips.length; i++)
      for (let j = i+1; j < clips.length; j++) {
        const inter = clipPolygon(clips[i], clips[j]);
        if (inter.length >= 3) union -= polyArea(inter);
      }
    if (clips.length === 3) {
      const i01 = clipPolygon(clips[0], clips[1]);
      if (i01.length >= 3) {
        const i012 = clipPolygon(i01, clips[2]);
        if (i012.length >= 3) union += polyArea(i012);
      }
    }
    return 1 - Math.min(Math.max(union, 0), targetArea) / targetArea;
  }

  // ── 生成顏色矩形參數 ──────────────────────────────────────────

  function genColorConfig(sw, sh, corner, occluders) {
    const pad = 40;
    const MIN_VISIBLE = 0.20;
    const MAX_TRIES = 80;
    const minSide = Math.min(MAIN_W, MAIN_H) * 0.15;
    const maxBW = sw - pad * 2, maxBH = sh - pad * 2;
    const gCx = sw / 2, gCy = sh / 2;
    let best = null, bestRatio = -1;

    for (let t = 0; t < MAX_TRIES; t++) {
      let rot = rand(-3, 3);
      if (Math.abs(rot) < 0.3) rot = rot < 0 ? -0.3 : 0.3;
      const rad = Math.abs(rot) * Math.PI / 180;
      const cosA = Math.cos(rad), sinA = Math.sin(rad);

      let w = rand(minSide, maxBW), h = rand(minSide, maxBH);
      let bw = w*cosA + h*sinA, bh = w*sinA + h*cosA;
      if (bw > maxBW) { const f = maxBW/bw; w*=f; h*=f; }
      if (bh > maxBH) { const f = maxBH/bh; w*=f; h*=f; }

      const fBW = w*cosA + h*sinA, fBH = w*sinA + h*cosA;
      const cxMin = pad + fBW/2, cxMax = sw - pad - fBW/2;
      const cyMin = pad + fBH/2, cyMax = sh - pad - fBH/2;

      const ef = rand(0.25, 0.45);
      const bx = corner.dx * (MAIN_W/2 + w*ef - w/2) + rand(-MAIN_W*0.08, MAIN_W*0.08);
      const by = corner.dy * (MAIN_H/2 + h*ef - h/2) + rand(-MAIN_H*0.08, MAIN_H*0.08);
      const cx = Math.max(cxMin, Math.min(cxMax, gCx + bx));
      const cy = Math.max(cyMin, Math.min(cyMax, gCy + by));

      const candidate = { cx, cy, w, h, rot };
      const ratio = calcVisibleRatio(candidate, occluders);
      if (ratio >= MIN_VISIBLE) { best = candidate; break; }
      if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
    }
    return best;
  }

  // ── 邊緣偵測 ──────────────────────────────────────────────────

  function rectWorldCorners(cfg) {
    const rad = cfg.rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const hw = cfg.w / 2, hh = cfg.h / 2;
    return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([lx,ly]) => ({
      x: cfg.cx + lx*cos - ly*sin,
      y: cfg.cy + lx*sin + ly*cos,
    }));
  }

  function pointInRect(px, py, cfg) {
    const rad = cfg.rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = px - cfg.cx, dy = py - cfg.cy;
    const lx = dx*cos + dy*sin;
    const ly = -dx*sin + dy*cos;
    return Math.abs(lx) < cfg.w/2 && Math.abs(ly) < cfg.h/2;
  }

  function isCornerOccluded(corner, occluders) {
    return occluders.some(occ => pointInRect(corner.x, corner.y, occ));
  }

  // 回傳 'top'|'right'|'bottom'|'left'：找四邊中「兩端點都未被遮」的第一條邊。
  // 優先序依卡片長寬比，讓 marquee 順著「較長的邊」跑（top/bottom 長度=w 走水平、left/right 長度=h 走垂直）：
  //   高卡 h>w → 先試 left/right（垂直 marquee）；寬卡 w≥h → 先試 top/bottom（水平 marquee）。
  //   同方向兩條排前面、另一軸當 fallback；全被遮時 fallback 取最偏好方向的第一條（非固定 'top'）。
  /** @returns {'top'|'right'|'bottom'|'left'} */
  function findFreeEdge(cfg, occluders) {
    const c = rectWorldCorners(cfg);
    /** @type {Array<['top'|'right'|'bottom'|'left', number, number]>} */
    const edges = cfg.h > cfg.w
      ? [['left', 3, 0], ['right', 1, 2], ['top', 0, 1], ['bottom', 2, 3]]   // 高卡：偏好垂直（左右邊）
      : [['top', 0, 1], ['bottom', 2, 3], ['left', 3, 0], ['right', 1, 2]];  // 寬卡：偏好水平（上下邊）
    for (const [name, ai, bi] of edges) {
      if (!isCornerOccluded(c[ai], occluders) && !isCornerOccluded(c[bi], occluders))
        return name;
    }
    return edges[0][0];
  }

  // ── 矩形樣式設定 ─────────────────────────────────────────────

  function setAsGray(el, sw, sh) {
    el.style.background     = 'var(--lib-bg)';
    el.style.cursor         = `url('${sitePath('custom-cursor/default.svg')}') 9 2, default`;
    el.style.zIndex         = '10';
    el.style.width          = `${MAIN_W}px`;
    el.style.height         = `${MAIN_H}px`;
    el.style.left           = `${Math.round(sw / 2)}px`;
    el.style.top            = `${Math.round(sh / 2)}px`;
    el.style.transform      = 'translate(-50%, -50%) rotate(0deg)';
    el.style.display        = 'flex';
    el.style.flexDirection  = 'column';
    el.style.overflow       = 'visible';
    el.style.opacity        = '1';
    const titleEl = el.querySelector('.color-rect-title');
    if (titleEl) titleEl.style.visibility = 'hidden';
  }

  function setAsColor(el, color, config) {
    el.style.background = color;
    el.style.cursor     = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
    el.style.width      = `${Math.round(config.w)}px`;
    el.style.height     = `${Math.round(config.h)}px`;
    el.style.left       = `${Math.round(config.cx)}px`;
    el.style.top        = `${Math.round(config.cy)}px`;
    el.style.transform  = `translate(-50%, -50%) rotate(${config.rot}deg)`;
    el.style.overflow   = 'hidden';
    const content = el.querySelector('#library-card-content');
    if (content) {
      content.classList.remove('content-visible');
    }
  }

  // ── Marquee ──────────────────────────────────────────────────

  const TAB_LABELS = {
    awards: 'Awards 獎項',
    press:  'Press 報導',
    files:  'Documents 文件',
    album:  'Albums 相簿',
  };

  const PAD = '12px';
  const PROBE_CSS = 'position:absolute;visibility:hidden;white-space:nowrap;' +
    'font-family:Inter,"Noto Sans TC",sans-serif;font-size:var(--font-size-h4);font-weight:700;';

  // cfgCache: el → config，每次 setAsColor 後更新，供 renderMarquee 使用
  const cfgCache = new Map();

  function renderMarquee(el) {
    const titleEl = el.querySelector('.color-rect-title');
    if (!titleEl) return;

    const label = TAB_LABELS[tabOf.get(el)] || '';
    const SEP   = '\u2003\u2003';
    const unit  = label + SEP;

    // 優先用 cfgCache，避免 DOM reflow 時機問題
    const cfg = cfgCache.get(el);
    if (!cfg || !cfg.w || !cfg.h) return;

    // Occluders：灰色主矩形（用座標） + 其他顏色矩形（用 cfgCache） + panel title 標籤
    const sec = grayEl.closest('section');
    const sw  = sec.offsetWidth, sh = sec.offsetHeight;
    const grayCfg = { cx: sw / 2, cy: sh / 2, w: MAIN_W, h: MAIN_H, rot: 0 };
    const myZ = parseInt(el.style.zIndex) || 1;
    const otherCfgs = allEls
      .filter(o => o !== el && o !== activeEl && (parseInt(o.style.zIndex) || 1) > myZ)
      .map(o => cfgCache.get(o))
      .filter(Boolean);
    // 把 active panel 的 title 標籤加進 occluder
    const secRect   = sec.getBoundingClientRect();
    const titleOccluders = [...document.querySelectorAll('.lib-panel-title')].map(t => {
      const r = t.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        cx:  r.left - secRect.left + r.width  / 2,
        cy:  r.top  - secRect.top  + r.height / 2,
        w:   r.width,
        h:   r.height,
        rot: 0,
      };
    }).filter(Boolean);
    const occluders = [grayCfg, ...otherCfgs, ...titleOccluders];

    let edge = 'top';
    try { edge = findFreeEdge(cfg, occluders); } catch(e) {}
    const isVertical = (edge === 'left' || edge === 'right');

    // 量單位寬度
    const probe = document.createElement('span');
    probe.style.cssText = PROBE_CSS;
    probe.textContent   = unit;
    document.body.appendChild(probe);
    const unitPx = probe.offsetWidth || 1;
    document.body.removeChild(probe);

    const rectPx  = Math.round(isVertical ? cfg.h : cfg.w);
    const copies  = Math.max(2, Math.ceil(rectPx * 2 / unitPx) + 1);
    const repeated = unit.repeat(copies);

    // 重設 titleEl
    Object.assign(titleEl.style, {
      top: '', bottom: '', left: '', right: '',
      width: `${rectPx}px`, height: '', overflow: 'hidden',
      transform: '', transformOrigin: '',
      visibility: 'visible', color: '#000', alignItems: 'center'
    });

    if (edge === 'top') {
      titleEl.style.left = '0';
      titleEl.style.top = PAD;
    } else if (edge === 'bottom') {
      titleEl.style.left = '0';
      titleEl.style.bottom = PAD;
    } else if (edge === 'left') {
      titleEl.style.left = PAD; titleEl.style.top = '100%';
      titleEl.style.transformOrigin = 'left top';
      titleEl.style.transform = 'rotate(-90deg)';
    } else {
      titleEl.style.left = `calc(100% - ${PAD})`; titleEl.style.top = '0';
      titleEl.style.transformOrigin = 'left top';
      titleEl.style.transform = 'rotate(90deg)';
    }

    titleEl.innerHTML = `<span class="color-rect-title-inner" style="--marquee-shift-x:-${unitPx}px;--marquee-shift-y:0">${repeated}</span>`;
  }

  function refreshMarquees() {
    allEls.forEach(el => {
      const titleEl = /** @type {HTMLElement | null} */ (el.querySelector('.color-rect-title'));
      if (!titleEl) return;
      if (el === activeEl) {
        titleEl.style.visibility = 'hidden';
        titleEl.innerHTML = '';
      } else {
        renderMarquee(el);
      }
    });
  }

  // ── Hover ────────────────────────────────────────────────────

  // 進場動畫期間先鎖（=true）：進場由 ResizeObserver 觸發、跑 ~1s，期間 switchTab 會跟進場動畫並行操作
  // 同批卡片的 clip/幾何 → 卡片被甩到畫面邊緣（user 2026-06-27：deep-link 進場未完就點 award / 快速切分頁）。
  // 沿用 switchTab 既有 `if (isSwitching) return` guard 擋住；進場 playEntranceAnimation 收尾才解鎖。
  let isSwitching = true;

  function attachHover(el) {
    const titleEl = document.createElement('div');
    titleEl.className = 'color-rect-title';
    el.appendChild(titleEl);

    el.addEventListener('mouseenter', () => {
      if (isSwitching || el === activeEl) return;
      // inverse mode 反轉：白底黑字（standard 是黑底白字）
      const isInverse = document.body.classList.contains('mode-inverse');
      el.style.background    = isInverse ? '#fff' : '#000';
      el.style.zIndex        = '11';
      titleEl.style.color    = isInverse ? '#000' : '#fff';
    });
    el.addEventListener('mouseleave', () => {
      if (el === activeEl) return;
      el.style.background = colorOf.get(el);
      el.style.zIndex     = String(baseZOf.get(el) ?? 1);
      titleEl.style.color = '#000';
    });
  }

  // ── DOM 初始化 ────────────────────────────────────────────────

  const colorEls = shuffle(PRIMARY_COLORS).map(color => {
    const el = document.createElement('div');
    el.style.cssText = 'position: absolute;';
    attachHover(el);
    stack.appendChild(el);
    colorOf.set(el, color);
    return el;
  });

  attachHover(grayEl);
  const allEls = [grayEl, ...colorEls];

  activeEl = grayEl;
  // initialTab swap：deep-link 進場時直接讓目標 panel 對應到 grayEl（中央大矩形），
  // 不再先進 awards 再 switchTab → 視覺上不會看到 awards 一閃即逝。
  // grayEl 永遠 = activeEl（中央顯示），所以對應 tab 必須是 initialTab。
  // 其餘三 tab 隨機散到 colorEls。
  const ALL_TABS = ['awards', 'press', 'files', 'album'];
  const validInitial = ALL_TABS.includes(initialTab) ? initialTab : 'awards';
  tabOf.set(grayEl, validInitial);
  colorOf.set(grayEl, '#f2f2f2');
  cfgCache.set(grayEl, null);
  const remainingTabs = shuffle(ALL_TABS.filter(t => t !== validInitial));
  colorEls.forEach((el, i) => { tabOf.set(el, remainingTabs[i]); });

  // ── 初始化顏色矩形位置 ────────────────────────────────────────

  function initColorEls(sw, sh) {
    const gCx  = sw / 2, gCy = sh / 2;
    const gray = { cx: gCx, cy: gCy, w: MAIN_W, h: MAIN_H, rot: 0 };

    const nonActiveEls = allEls.filter(el => el !== activeEl);
    const zs = shuffle([1, 2, 3]);
    nonActiveEls.forEach((el, i) => { el.style.zIndex = String(zs[i]); baseZOf.set(el, zs[i]); });

    const sorted  = [...nonActiveEls].sort((a,b) => parseInt(b.style.zIndex) - parseInt(a.style.zIndex));
    const corners = shuffle([{dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}]).slice(0, 3);
    const configs = new Map();

    sorted.forEach((el, i) => {
      const elZ = parseInt(el.style.zIndex);
      const occluders = [gray, ...sorted
        .filter(o => o !== el && configs.has(o) && parseInt(o.style.zIndex) > elZ)
        .map(o => configs.get(o))
      ];
      const cfg = genColorConfig(sw, sh, corners[i], occluders);
      configs.set(el, cfg);
      cfgCache.set(el, cfg);
      setAsColor(el, colorOf.get(el), cfg);
    });

    // 灰色矩形的 cfg 固定
    cfgCache.set(activeEl, { cx: sw/2, cy: sh/2, w: MAIN_W, h: MAIN_H, rot: 0 });

    refreshMarquees();
  }

  // ── Clip reveal ───────────────────────────────────────────────

  const CLIP_DIRS = [
    { hide: 'inset(0 0 100% 0)', show: 'inset(0 0 0% 0)' },
    { hide: 'inset(100% 0 0 0)', show: 'inset(0% 0 0 0)' },
    { hide: 'inset(0 100% 0 0)', show: 'inset(0 0% 0 0)' },
    { hide: 'inset(0 0 0 100%)', show: 'inset(0 0 0 0%)' },
  ];
  const CLIP_DUR = DUR.medium;

  function randomClipDir() {
    return CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
  }

  function clipReveal(el, dir, dur, onDone) {
    el.style.transition = 'none';
    el.style.clipPath   = dir.hide;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `clip-path ${dur}s ease-out`;
        el.style.clipPath   = dir.show;
        if (onDone) setTimeout(onDone, dur * 1000);
      });
    });
  }

  // ── 分頁切換 ──────────────────────────────────────────────────

  const TRANSITION = 'transform 0.6s cubic-bezier(0.4,0,0.2,1), width 0.6s cubic-bezier(0.4,0,0.2,1), height 0.6s cubic-bezier(0.4,0,0.2,1), left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)';

  function switchTab(clickedEl) {
    if (isSwitching) return;
    isSwitching = true;

    allEls.forEach(el => {
      const titleEl = /** @type {HTMLElement | null} */ (el.querySelector('.color-rect-title'));
      if (titleEl) titleEl.style.color = '#000';
      if (el !== activeEl) {
        el.style.background = colorOf.get(el);
        if (baseZOf.has(el)) el.style.zIndex = String(baseZOf.get(el));
      }
    });

    // 出場：先讓當前 panel 的 chip + 內容 clip 擦出再切（對齊離頁 playExitAnimation 的 panel 退場）。
    // 舊作法 toggle `.content-visible` class 想做淡出，但該 class 在 CSS 沒有任何對應規則 = 完全無效，
    // 切分頁時舊內容沒退場、被 _doSwitchTab → onTabSwitchPre 直接 display:none → 視覺上「跳過出場、
    // 直接播下一分頁的進場 wipe」（user 2026-06-07 反饋）。改用現成的 panel 退場 helper 補上出場。
    const EXIT_DUR = DUR.fast;
    const PANEL_IDS = ['lib-panel-awards', 'lib-panel-press', 'lib-panel-files', 'lib-panel-album'];
    const outgoingPanel = /** @type {HTMLElement | null} */ (
      PANEL_IDS.map(id => document.getElementById(id)).find(p => p && getComputedStyle(p).display !== 'none') || null
    );
    if (outgoingPanel) {
      playPanelTitleExit(outgoingPanel, EXIT_DUR);
      playPanelBodyExit(outgoingPanel, EXIT_DUR);
    }

    // 等出場 wipe 跑完才換卡（_doSwitchTab 內 onTabSwitchPre 會 display:none 舊 panel + 切到新 panel）
    setTimeout(() => {
      _doSwitchTab(clickedEl, () => {
        if (onTabSwitch) onTabSwitch(tabOf.get(activeEl));
        isSwitching = false;
      });
    }, EXIT_DUR * 1000);
  }

  // 切分頁的卡片動畫＝乾淨兩段（user 2026-06-07）：
  //   Phase A 先把所有卡片「原地收起」（clip wipe out，幾何不動，不 morph 位置）
  //   Phase B 收完才重排角色/幾何（隱藏態瞬間跳位，看不到位移）+ 一起「展開」（clip wipe in）
  // 舊版是「同時 morph」：點到的色塊直接 clip 展開成灰卡、其他色塊收+展重疊 → 灰卡沒有「先收起」這步，
  // user 觀察成「卡片展開跑兩次、收起跟展開黏在一起」。內容擦除/擦入由 switchTab + onTabSwitch 包在這之外，
  // 整體序列＝擦內容 → 收卡片(A) → 展卡片(B) → 展內容。
  function _doSwitchTab(clickedEl, onDone) {
    const sec  = grayEl.closest('section');
    const sw   = sec.offsetWidth, sh = sec.offsetHeight;
    const gCx  = sw / 2, gCy = sh / 2;

    const COLLAPSE_DUR = DUR.fast;  // 收起
    const EXPAND_DUR   = CLIP_DUR;  // 展開（沿用 0.5）

    // ── Phase A：所有卡片原地 clip wipe out（維持當前幾何，不 morph 位置）──
    allEls.forEach(el => exitOneCard(el, randomClipDir(), COLLAPSE_DUR));

    // ── Phase B：收完 → 重排角色/幾何（隱藏態瞬間跳位）→ 一起 clip wipe in ──
    setTimeout(() => {
      const outgoingEl    = activeEl;
      const outgoingColor = colorOf.get(clickedEl);
      const outgoingTab   = tabOf.get(outgoingEl);
      const incomingTab   = tabOf.get(clickedEl);

      // 更新狀態：clickedEl 變灰卡、舊灰卡 outgoingEl 變色塊
      activeEl = clickedEl;
      tabOf.set(clickedEl, incomingTab);
      tabOf.set(outgoingEl, outgoingTab);
      colorOf.set(outgoingEl, outgoingColor);

      // pre-swap：切 panel display + hide children（新灰卡展開時內部已是新 panel，避免看到舊 chip）
      if (onTabSwitchPre) onTabSwitchPre(incomingTab);

      // 內容層移入新的主矩形（panel children 已被 onTabSwitchPre hide，等展開後 onTabSwitch reveal）
      const contentEl = document.getElementById('library-card-content');
      if (contentEl) clickedEl.appendChild(contentEl);

      const gray = { cx: gCx, cy: gCy, w: MAIN_W, h: MAIN_H, rot: 0 };
      cfgCache.set(clickedEl, gray); // clickedEl 變成灰色

      const otherColorEls  = allEls.filter(el => el !== clickedEl && el !== outgoingEl);
      const allColorNow    = [outgoingEl, ...otherColorEls];
      const newZs          = shuffle([1, 2, 3]);
      allColorNow.forEach((el, i) => { el.style.zIndex = String(newZs[i]); baseZOf.set(el, newZs[i]); });

      const sortedColorNow = [...allColorNow].sort((a,b) => parseInt(b.style.zIndex) - parseInt(a.style.zIndex));
      const corners        = shuffle([{dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}]).slice(0, 3);
      const cfgMap         = new Map();

      // 色塊：算新幾何 + 設到位（hidden clip + transition:none，瞬間跳位看不到位移）
      const expandDirs = new Map();
      sortedColorNow.forEach((el, i) => {
        const elZ = parseInt(el.style.zIndex);
        const occluders = [gray, ...sortedColorNow
          .filter(o => o !== el && cfgMap.has(o) && parseInt(o.style.zIndex) > elZ)
          .map(o => cfgMap.get(o))
        ];
        const cfg = genColorConfig(sw, sh, corners[i], occluders);
        cfgMap.set(el, cfg);
        cfgCache.set(el, cfg);

        const dir = randomClipDir();
        expandDirs.set(el, dir);
        el.style.transition = 'none';
        setAsColor(el, colorOf.get(el), cfg);
        el.style.clipPath = dir.hide;
        renderMarquee(el);  // 先生成 marquee，展開過程中標題可見
      });

      // clickedEl → 灰卡（隱藏態就位）
      const grayDir = randomClipDir();
      clickedEl.style.transition = 'none';
      setAsGray(clickedEl, sw, sh);
      clickedEl.style.clipPath = grayDir.hide;

      // 下一個 rAF：所有卡片一起 clip wipe in（展開）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sortedColorNow.forEach(el => {
            el.style.transition = `clip-path ${EXPAND_DUR}s ease-out`;
            el.style.clipPath   = expandDirs.get(el).show;
          });
          clickedEl.style.transition = `clip-path ${EXPAND_DUR}s ease-out`;
          clickedEl.style.clipPath   = grayDir.show;

          setTimeout(() => {
            allEls.forEach(el => { el.style.transition = TRANSITION; el.style.clipPath = ''; });
            refreshMarquees();
            if (onDone) onDone();  // → onTabSwitch → playPanelReveal（展內容）
          }, EXPAND_DUR * 1000);
        });
      });
    }, COLLAPSE_DUR * 1000);
  }

  // ── 進場動畫 ──────────────────────────────────────────────────

  function playEntranceAnimation(sw, sh) {
    const ENTER_DUR = 0.5;
    const STAGGER   = 0.2;

    // 減少動態：library 進場是 setTimeout 分階段 + clip wipe（btn→灰卡→內容），CSS blanket 只讓每段 wipe
    // 瞬間、但 setTimeout 階段間隔仍在 → staged 跳出。這裡直接跳過分階段，所有卡片與內容立即到位。
    if (prefersReducedMotion()) {
      allEls.forEach(el => { el.style.opacity = '1'; el.style.clipPath = ''; el.style.transition = TRANSITION; });
      const contentEl = document.getElementById('library-card-content');
      if (onTabSwitch) onTabSwitch(tabOf.get(grayEl));
      if (contentEl) contentEl.classList.add('content-visible');
      isSwitching = false;  // 進場完成 → 解鎖 switchTab
      if (onEntranceDoneCb) onEntranceDoneCb();
      refreshMarquees();
      return;
    }

    grayEl.style.opacity  = '1';
    grayEl.style.clipPath = 'inset(100% 0 0 0)';

    const sortedByZ = [...colorEls].sort((a,b) => parseInt(a.style.zIndex) - parseInt(b.style.zIndex));
    let delay = 0;
    sortedByZ.forEach(el => {
      const dir = randomClipDir();
      setTimeout(() => { el.style.opacity = '1'; clipReveal(el, dir, ENTER_DUR, null); }, delay * 1000);
      delay += STAGGER;
    });

    setTimeout(() => {
      clipReveal(grayEl, randomClipDir(), ENTER_DUR, () => {
        grayEl.style.clipPath = '';
        requestAnimationFrame(() => {
          allEls.forEach(el => { el.style.transition = TRANSITION; });
          isSwitching = false;  // 進場完成 → 解鎖 switchTab（之前進場期間 switchTab 會跟進場並行弄亂卡片幾何）
          const contentEl = document.getElementById('library-card-content');
          if (onTabSwitch) onTabSwitch(tabOf.get(grayEl));
          contentEl.classList.add('content-visible');
          if (onEntranceDoneCb) onEntranceDoneCb();
          // 進場完成後重新量測 marquee（字型已載入，offsetWidth 可正確取得）
          requestAnimationFrame(() => refreshMarquees());
        });
      });
    }, delay * 1000);
  }

  // ── 退場動畫 ──────────────────────────────────────────────────
  // 進場：colorEls 由低 z 到高 z stagger 0.2s 進，最後 grayEl 進
  // 退場：反向 — grayEl 先收，colorEls 由高 z 到低 z stagger 收
  // 時間壓短（fetch + cleanup + swap 同時跑，總體要 snappy）

  // 進場時 clipReveal 把 clipPath 從 hide → show，最後 setAsGray/cfg 流程把 .clipPath='' 清掉
  // 退場必須先把 clip-path 設回顯示狀態（不靠 transition），下一個 rAF 才從顯示 transition 到 hide
  // 否則 from='' → to=inset(...) 瀏覽器在同 frame 內合併 = 直接 snap 不見
  function exitOneCard(el, dir, dur) {
    el.style.transition = 'none';
    el.style.clipPath   = dir.show;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `clip-path ${dur}s ease-in`;
        el.style.clipPath   = dir.hide;
      });
    });
  }

  function playExitAnimation() {
    return new Promise(resolve => {
      const TITLE_DUR = DUR.fast;  // chip 先 wipe 的時長（短，作為前置動作）
      const EXIT_DUR  = DUR.fast;
      const STAGGER   = 0.08;

      // Phase 1：先把 active panel 左上角 chip (lib-panel-title) wipe 消失
      // panel chip position:absolute 突出 grayEl 邊界外，必須在 grayEl 開始收之前
      // 獨立做 clip wipe 動畫；否則 grayEl 收完 chip 殘留像「灰色卡片左上角」破壞節奏
      const PANEL_IDS = ['lib-panel-awards', 'lib-panel-press', 'lib-panel-files', 'lib-panel-album'];
      const activePanel = /** @type {HTMLElement|null} */ (
        PANEL_IDS.map(id => document.getElementById(id)).find(p => p && getComputedStyle(p).display !== 'none') || null
      );
      if (activePanel) playPanelTitleExit(activePanel, TITLE_DUR);

      // Phase 2：chip wipe 完才開始 grayEl + panel 內容 + colorEls 退場
      setTimeout(() => {
        const grayDir = randomClipDir();
        exitOneCard(grayEl, grayDir, EXIT_DUR);
        if (activePanel) playPanelBodyExit(activePanel, EXIT_DUR);

        // 進場是 colorEls 由低 z → 高 z stagger，最後 grayEl
        // 退場反過來：grayEl 收 → colorEls 由高 z → 低 z 倒序 stagger
        const sortedByZDesc = [...colorEls].sort((a,b) => parseInt(b.style.zIndex) - parseInt(a.style.zIndex));
        let delay = STAGGER;
        sortedByZDesc.forEach(el => {
          const dir = randomClipDir();
          setTimeout(() => exitOneCard(el, dir, EXIT_DUR), delay * 1000);
          delay += STAGGER;
        });

        // 等最後一個 card 收完
        const totalMs = (delay - STAGGER + EXIT_DUR) * 1000;
        setTimeout(resolve, totalMs);
      }, TITLE_DUR * 1000);
    });
  }

  registerPageExit(playExitAnimation);

  // ── ResizeObserver ────────────────────────────────────────────

  let roInitialized = false;
  let roResizeTimer = null;
  /** @type {{sw: number, sh: number} | null} */
  let lastAcceptedSize = null;

  function isViewerOpen() {
    const lb  = document.getElementById('activities-lightbox');
    const pdf = document.getElementById('pdf-viewer-modal');
    return (lb && lb.style.display !== 'none') || (pdf && pdf.style.display !== 'none');
  }

  /** @type {{sw: number, sh: number} | null} */
  let pendingResize = null;

  const ro = new ResizeObserver(() => {
    const sec = grayEl.closest('section');
    if (sec.offsetWidth === 0 || sec.offsetHeight === 0) return;
    const sw = sec.offsetWidth, sh = sec.offsetHeight;
    // viewer 開啟期間 size 若改變（user 拉視窗），記下來；viewer 關閉後 lightbox-shell 還原 scrollbar-gutter
    // 也會 trigger RO，那時 short-circuit 走「等於 pendingResize 就接受」分支 → 完整 re-layout
    if (isViewerOpen()) {
      if (!lastAcceptedSize || lastAcceptedSize.sw !== sw || lastAcceptedSize.sh !== sh) {
        pendingResize = { sw, sh };
      }
      return;
    }
    // Viewer 關閉後第一個 RO callback：若 viewer-open 期間有 pendingResize，強制走 re-layout 分支
    // （即使現在 size 等於 lastAcceptedSize，因為 layout 是按 viewer-open 前的 size 算的，已過時）
    if (pendingResize) {
      pendingResize = null;
      lastAcceptedSize = null; // 強制下方比對不會 short-circuit
    }

    // Short-circuit：size 跟上次接受的相同就跳過
    // 原因：lightbox 關閉時 lightbox-shell removeProperty('scrollbar-gutter') 還原 gutter 讓 body 寬 -10px、section 寬跟著變
    // 這個 resize 觸發 RO，但 callback 真正執行時 lightbox display 已 'none'（同 tick 排程，display='none' 跟 gutter 還原都在 t+300 fire）
    // → isViewerOpen 失效、進 resize 分支重排 cards 位置（每次 close 都隨機重排，user 觀察「打開時 cards 換位置」其實是上次關閉的殘留）
    // size 比對能 short-circuit：lightbox 開/關只會讓 section 在 X ↔ X+10 切，最後回到 X = lastAccepted → 跳過
    // 真實 viewport resize（user 拉視窗）size 會不同 → 正常進 resize 分支
    if (lastAcceptedSize && lastAcceptedSize.sw === sw && lastAcceptedSize.sh === sh) return;
    lastAcceptedSize = { sw, sh };

    if (!roInitialized) {
      roInitialized = true;
      MAIN_W = Math.round(sw * 0.85);
      MAIN_H = Math.round(sw * 0.87 * 10.5 / 21);
      grayEl.style.cssText = `position:absolute;background:var(--lib-bg);z-index:10;cursor:default;display:flex;flex-direction:column;overflow:visible;width:${MAIN_W}px;height:${MAIN_H}px;left:${Math.round(sw/2)}px;top:${Math.round(sh/2)}px;transform:translate(-50%,-50%) rotate(0deg);opacity:0;`;
      initColorEls(sw, sh);
      colorEls.forEach(el => { el.style.opacity = '0'; });
      requestAnimationFrame(() => { playEntranceAnimation(sw, sh); });
    } else {
      clearTimeout(roResizeTimer);
      const attemptRelayout = () => {
        // 進場/切換動畫進行中不重排：cold load（字型/CSS 晚到）或 deep-link 動態載 library.css 會在進場「途中」
        // 觸發 RO → 若此時 initColorEls 重新隨機定位，會跟進場動畫並行把 colorEls 甩到畫面邊緣
        // （user 2026-06-28：hard refresh / deep-link 卡片散開、warm refresh 正常）。動畫期間延後重排，
        // 等 isSwitching 解鎖（進場/切換收尾）才用最後量到的 sw/sh 重排一次 → 不跟動畫搶、又能套到最終尺寸。
        if (isSwitching) { roResizeTimer = setTimeout(attemptRelayout, 100); return; }
        MAIN_W = Math.round(sw * 0.85);
        MAIN_H = Math.round(sw * 0.87 * 10.5 / 21);
        setAsGray(activeEl, sw, sh);
        initColorEls(sw, sh);
      };
      roResizeTimer = setTimeout(attemptRelayout, 100);
    }
  });
  ro.observe(grayEl.closest('section'));
  // SPA 離開 library 時 disconnect，避免 RO 持有 detached section + 每訪累積
  registerPageCleanup(() => { clearTimeout(roResizeTimer); ro.disconnect(); });

  // 點擊事件
  colorEls.forEach(el => {
    el.addEventListener('click', () => { if (el !== activeEl) switchTab(el); });
  });
  grayEl.addEventListener('click', () => { if (grayEl !== activeEl) switchTab(grayEl); });

  // 公開 API（供 library-panels.js 使用）
  return { tabOf, allEls, colorEls, grayEl, get activeEl() { return activeEl; } };
}
