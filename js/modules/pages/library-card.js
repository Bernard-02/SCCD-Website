/**
 * Library Card Stack
 * 顏色矩形卡片的幾何計算、切換動畫、marquee 渲染
 */

import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { playPanelTitleExit, playPanelBodyExit, isPanelRevealing } from './library-panels.js';
import { DUR, EASE } from '../ui/motion.js';
import { sitePath } from '../ui/site-base.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';

export function initLibraryCard({ onTabSwitch, onTabSwitchPre, onEntranceDone: onEntranceDoneCb, initialTab = 'awards' }) {

  const PRIMARY_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  const stack   = document.getElementById('library-card-stack');
  const grayEl  = document.getElementById('library-card-main');
  if (!stack || !grayEl) return;

  let MAIN_W = 0, MAIN_H = 0;
  // 灰卡「上下緣都錨定」：上緣距 section 頂 TOP_GAP（對齊 atlas #atlas-filter＝header+64）、下緣距底 BOTTOM_GAP，
  // 卡高 MAIN_H 撐滿中間、隨視窗高自適應（user 2026-08-24 approach 2：跨裝置留白一致、免有的裝置底距多有的少）。
  // centerY()=TOP_GAP+MAIN_H/2＝垂直中心（上下相等時＝sh/2）；色卡也以 centerY() 為 bias 中心＋上緣 clamp TOP_GAP（不貼 logo）。
  const TOP_GAP = 48;     // 上緣留白（改這個 = 整組起點高度；user 2026-08-26 由 64 上移 16px、灰卡整個往上加高）
  const BOTTOM_GAP = 64;  // 下緣留白（改這個 = 底部距離）
  const centerY = () => TOP_GAP + MAIN_H / 2;
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
    const minSide = Math.min(sw, sh) * 0.15;  // 下限跟 max 一樣以視窗為準（原本依灰卡 MAIN_W/H；user 2026-08-27）
    // 色卡上緣不越過灰卡上緣（TOP_GAP、對齊 atlas＝不貼 logo）；下緣仍留 pad。bias 中心＝灰卡中心 centerY()
    const maxBW = sw - pad * 2, maxBH = sh - TOP_GAP - pad;
    const gCx = sw / 2, gCy = centerY();
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
      const cyMin = TOP_GAP + fBH/2, cyMax = sh - pad - fBH/2;

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

  // 回傳 'top'|'right'|'bottom'|'left'：marquee **只放「朝外」的兩條邊**（背對版面中心＝背對灰卡/其他卡，
  // 被遮機率最低）——依卡片相對中心 (cx0,cy0) 的象限選：左上卡→top/left、右上→top/right、
  // 左下→bottom/left、右下→bottom/right（user 2026-08-24：舊版四邊全找、常挑到朝中心的被遮邊）。
  // 兩條朝外邊再依長短排：寬卡先水平邊（長=w、marquee 空間大）、高卡先垂直邊（長=h）；
  // 先取「兩端點都沒被遮」那條，兩條都有角被遮→退取長邊那條（仍是曝露側，絕不回落到朝中心的邊）。
  /** @returns {'top'|'right'|'bottom'|'left'} */
  function findFreeEdge(cfg, occluders, cx0, cy0) {
    const c = rectWorldCorners(cfg);
    const free = (ai, bi) => !isCornerOccluded(c[ai], occluders) && !isCornerOccluded(c[bi], occluders);
    /** @type {['top'|'right'|'bottom'|'left', number, number]} */
    const outH = cfg.cy < cy0 ? ['top', 0, 1] : ['bottom', 2, 3];   // 朝外的水平邊（長=w）
    /** @type {['top'|'right'|'bottom'|'left', number, number]} */
    const outV = cfg.cx < cx0 ? ['left', 3, 0] : ['right', 1, 2];   // 朝外的垂直邊（長=h）
    const ordered = cfg.w >= cfg.h ? [outH, outV] : [outV, outH];
    for (const [name, ai, bi] of ordered) if (free(ai, bi)) return name;
    return ordered[0][0];
  }

  // ── 矩形樣式設定 ─────────────────────────────────────────────

  function setAsGray(el, sw, sh) {
    el.style.background     = 'var(--lib-bg)';
    el.style.cursor         = `url('${sitePath('custom-cursor/default.svg')}') 9 2, default`;
    el.style.zIndex         = '10';
    el.style.width          = `${MAIN_W}px`;
    el.style.height         = `${MAIN_H}px`;
    el.style.left           = `${Math.round(sw / 2)}px`;
    el.style.top            = `${Math.round(centerY())}px`;
    el.style.transform      = 'translate(-50%, -50%) rotate(0deg)';
    el.style.translate      = '';  // 清掉「色塊→灰卡」時 heroExitCard 殘留的 translate（否則灰卡被位移甩出版位）
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
    el.style.translate  = '';  // 清殘留位移；hero reveal/exit 的 translate 由 heroRevealCard/heroExitCard 自行管理
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

  const PAD = 12;                          // px：文字垂直於捲動方向的偏移（到卡片長邊）
  const AXIS_PAD = Math.round(PAD * 2);  // px：捲動軸兩端進出場 inset，比 PAD 大 2 倍（user 2026-08-03，只放大進出場那個）
  const PROBE_CSS = 'position:absolute;visibility:hidden;white-space:nowrap;' +
    'font-family:Inter,"Noto Sans TC","Noto Sans JP","Noto Sans SC",sans-serif;font-size:var(--font-size-xl);font-weight:700;';

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
    const grayCfg = { cx: sw / 2, cy: centerY(), w: MAIN_W, h: MAIN_H, rot: 0 };
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
    try { edge = findFreeEdge(cfg, occluders, sw / 2, centerY()); } catch(e) {}
    const isVertical = (edge === 'left' || edge === 'right');

    // 量單位寬度
    const probe = document.createElement('span');
    probe.style.cssText = PROBE_CSS;
    probe.textContent   = unit;
    document.body.appendChild(probe);
    const unitPx = probe.offsetWidth || 1;
    document.body.removeChild(probe);

    const rectPx  = Math.round(isVertical ? cfg.h : cfg.w);  // 捲動軸方向的可用長度
    const perpPx  = Math.round(isVertical ? cfg.w : cfg.h);  // 垂直於捲動軸方向的可用長度
    // 捲動軸兩端各留 axisPad，marquee 進出場點縮進 box 邊緣以內，不然文字剛好貼著色塊角落進出
    // （user 2026-08-03）；縮小色塊時 axisPad 跟著讓步，避免 viewport 被夾成 0（marquee 整個消失）
    const axisPad = Math.min(AXIS_PAD, Math.floor(rectPx / 4));
    const viewportPx = Math.max(1, rectPx - axisPad * 2);
    const copies  = Math.max(2, Math.ceil(rectPx * 2 / unitPx) + 1);
    const repeated = unit.repeat(copies);

    // 重設 titleEl
    Object.assign(titleEl.style, {
      top: '', bottom: '', left: '', right: '',
      width: `${viewportPx}px`, height: '', overflow: 'hidden',
      transform: '', transformOrigin: '',
      visibility: 'visible', color: '#000', alignItems: 'center'
    });

    // 旋轉 case 一律用 cfg 直接算絕對 px（perpPx/rectPx），不用 CSS calc(100%-Xpx)：
    // 那個 100% 是父層色塊「渲染當下實際尺寸」，動畫/resize 時序上可能還沒 = cfg.w/cfg.h，
    // 導致沿捲動軸的頂/底留白跑掉（user 2026-08-03：「Documents 距離頂部 padding」比「距離左邊 padding」大）
    if (edge === 'top') {
      titleEl.style.left = `${axisPad}px`;
      titleEl.style.top = `${PAD}px`;
    } else if (edge === 'bottom') {
      titleEl.style.left = `${axisPad}px`;
      titleEl.style.bottom = `${PAD}px`;
    } else if (edge === 'left') {
      titleEl.style.left = `${PAD}px`; titleEl.style.top = `${rectPx - axisPad}px`;
      titleEl.style.transformOrigin = 'left top';
      titleEl.style.transform = 'rotate(-90deg)';
    } else {
      titleEl.style.left = `${perpPx - PAD}px`; titleEl.style.top = `${axisPad}px`;
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

  // ── Marquee 標題「等卡片定位後、在最終位置 hero clip-reveal」（user 2026-08-23）──────────
  // 卡片動畫（切換 reveal／relayout 重排）期間標題全遮、不騎卡移動；卡片落定才在最終位置揭露。
  // ⚠️揭露＝含位移的 hero 語彙（heroRevealCard：沿短軸滑入＋同向 clip 同步開），user 澄清
  // 「clip reveal」不是原地 wipe——別再拆位移。heroRevealCard hoisting，先用後定義 OK。
  function hideMarqueeTitle(cardEl) {
    const t = /** @type {HTMLElement|null} */ (cardEl.querySelector('.color-rect-title'));
    if (!t) return;
    t.style.transition = 'none';
    t.style.clipPath = 'inset(0 0 100% 0)';
  }
  function revealMarqueeTitle(cardEl, dur = DUR.base) {
    const t = /** @type {HTMLElement|null} */ (cardEl.querySelector('.color-rect-title'));
    if (!t || !t.innerHTML) return;
    t.style.transition = 'none';  // clip/translate 交給 gsap，避免 hide 殘留的 transition 干擾
    // 標題是長條 → 沿短軸（高）滑入；hiddenTranslate 會讀 t 的 rotate(±90) 正確換軸
    const dir = Math.random() < 0.5 ? 'top' : 'bottom';
    heroRevealCard(t, dir, dur, () => { t.style.clipPath = ''; t.style.transition = ''; });
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
    const gCx  = sw / 2, gCy = centerY();
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
    cfgCache.set(activeEl, { cx: sw/2, cy: centerY(), w: MAIN_W, h: MAIN_H, rot: 0 });

    // marquee 量測（probe offsetWidth）必須等字型載入完才準：字型未載入時用 fallback 寬 → 之後重量會
    // 「對位後再抖動一次」（user 2026-07-15）。gate 在 fonts.ready → 只 render 一次（字型已載入時即刻 resolve）。
    document.fonts.ready.then(() => refreshMarquees());
  }

  // ── Clip reveal ───────────────────────────────────────────────

  const CLIP_DIRS = [
    { hide: 'inset(0 0 100% 0)', show: 'inset(0 0 0% 0)' },
    { hide: 'inset(100% 0 0 0)', show: 'inset(0% 0 0 0)' },
    { hide: 'inset(0 100% 0 0)', show: 'inset(0 0% 0 0)' },
    { hide: 'inset(0 0 0 100%)', show: 'inset(0 0 0 0%)' },
  ];
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

  // ── Hero clip-reveal（位移+揭露）：本體 translate 沿旋轉軸滑入 + 同向 clip-path inset 同步收 ──
  // 方向隨機（同標題 chip）——clip 窗釘死「停駐版位」、卡片被遮部分靠 z 堆疊永遠在灰卡(z:10)後，
  // 任何方向都不會滑出版位或蓋錯層。rot 從 el.style.transform 讀（setAsColor 寫的 rotate）。
  // 見 reference_gsap_translate_string_needs_matching_units / reference_rotated_element_in_clip_mask_slide。
  const ENTER_CLIP = {
    top:    'inset(100% 0% 0% 0%)',
    bottom: 'inset(0% 0% 100% 0%)',
    left:   'inset(0% 0% 0% 100%)',
    right:  'inset(0% 100% 0% 0%)',
  };
  // 方向沿「較短邊」隨機（該軸兩向擇一）：位移＝短邊尺寸＝clip 揭露距離（鎖定→乾淨貼邊、不浮中間），
  // 又比長邊短（大卡不會飛掠一整個長邊）。⚠️不可用封頂 translate < clip 全距：位移與 clip 一解鎖，
  // 揭露內容會浮在 footprint 中央而非貼邊＝user 2026-07-15「中間收起」。兩端點(全鎖定 / 零位移純 wipe)才貼邊。
  function revealDir(el) {
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const pair = w >= h ? ['top', 'bottom'] : ['left', 'right'];
    return pair[Math.random() < 0.5 ? 0 : 1];
  }

  // 沿旋轉後自身軸把卡推出版位的位移向量（= 該軸全尺寸，與 clip 100% 鎖定；雙值全 px 插值才穩）
  // d 沿軸全尺寸故 ty/tx = tanθ（沿旋轉軸不偏）
  function hiddenTranslate(el, dir) {
    const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
    const th = m ? parseFloat(m[1]) * Math.PI / 180 : 0;
    const c = Math.cos(th), s = Math.sin(th);
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const v = { top: [h*s, -h*c], bottom: [-h*s, h*c], left: [-w*c, -w*s], right: [w*c, w*s] }[dir];
    return `${v[0].toFixed(2)}px ${v[1].toFixed(2)}px`;
  }

  // 位移+揭露 進/退場：GSAP 同 tick 寫 translate+clipPath。⚠️不用 CSS transition：translate 走 compositor、
  // clip-path 走主執行緒，兩管線逐幀微差＝clip 窗緣抖動（見 reference_gsap_translate_string_needs_matching_units
  // v3 註）。translate 與 transform:translate(-50%,-50%)rotate() 疊加共存；rot 由 hiddenTranslate 從 transform 讀。
  function heroRevealCard(el, dir, dur, onDone) {
    if (typeof gsap === 'undefined') { el.style.clipPath = 'inset(0% 0% 0% 0%)'; el.style.translate = ''; if (onDone) onDone(); return; }
    gsap.fromTo(el,
      { clipPath: ENTER_CLIP[dir], translate: hiddenTranslate(el, dir) },
      { clipPath: 'inset(0% 0% 0% 0%)', translate: '0px 0px', duration: dur, ease: EASE.enter, overwrite: true,
        onComplete: () => { el.style.translate = ''; if (onDone) onDone(); } });
  }
  function heroExitCard(el, dir, dur, onDone) {
    if (typeof gsap === 'undefined') { el.style.clipPath = ENTER_CLIP[dir]; el.style.translate = hiddenTranslate(el, dir); if (onDone) onDone(); return; }
    // fromTo 顯式起點 inset(0)/0px：clipPath 曾被 clearProps→computed none 時，gsap.to 從 none 補間會 snap
    gsap.fromTo(el,
      { clipPath: 'inset(0% 0% 0% 0%)', translate: '0px 0px' },
      { clipPath: ENTER_CLIP[dir], translate: hiddenTranslate(el, dir), duration: dur, ease: EASE.exit, overwrite: true,
        onComplete: onDone || undefined });
  }

  // ── 分頁切換 ──────────────────────────────────────────────────

  // 幾何 glide（resize relayout 用）＝所有卡；background-color 0.4s **只給當前灰卡**：mode3 hue loop 過亮度
  // 閾值時 --lib-bg 在 #f2f2f2/#333333 兩階翻，灰卡要跟背景一起 fade 而非 snap。三色 RGB 卡不帶 bg transition
  // （user 2026-08-11：mode3 三原色↔B/W 與 hover 黑白都要 snap，同 .mode-switching 窗的 transition:none 意圖；
  // 舊版把 background-color 塞進共用 TRANSITION 害色卡也 fade＝副作用，已拆開）。
  // panel 切換時色塊/灰卡的 bg 全在 transition:none 下設好（見 switchTab），套回時 bg 已定型 → 只影響穩態翻色。
  const TRANSITION = 'transform 0.6s cubic-bezier(0.4,0,0.2,1), width 0.6s cubic-bezier(0.4,0,0.2,1), height 0.6s cubic-bezier(0.4,0,0.2,1), left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)';
  const TRANSITION_GRAY = TRANSITION + ', background-color 0.4s ease';
  // 穩態 transition 依角色套用；三個套用點（進場×2＋切 tab 收尾）呼叫時 activeEl 都已是正確角色
  const applyIdleTransition = (el) => { el.style.transition = (el === activeEl) ? TRANSITION_GRAY : TRANSITION; };

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
        // instant：內容在色塊 veil 底下直接渲染就位（veil 掀開即見；視窗下方 items 保留 scroll-gate）
        if (onTabSwitch) onTabSwitch(tabOf.get(activeEl), { instant: true });
        isSwitching = false;
      });
    }, EXIT_DUR * 1000);
  }

  // 切分頁的卡片動畫＝不對稱角色互換（user 2026-08-23 定案）：
  //   點到的色卡「放大滑進」灰卡版位（morph：幾何 + 底色同步過渡成灰）；舊灰卡則**不縮小**——
  //   hero clip-reveal 收場完整消失（位移+揭露），再從隨機方向 hero clip-reveal 進場成一張
  //   **隨機新版位/尺寸**的色卡（genColorConfig 重擲，接手被點卡的顏色、z 插到最底層）。
  //   其餘兩張色卡完全不動（不重新隨機佈局，marquee 不重建不跳動）。
  //   整體序列＝擦內容（switchTab）→ 灰卡 hero 收 + 色卡 morph 成灰（並行）→ 新色卡 reveal ＋
  //   展內容（onTabSwitch，內容進場動畫不變）。
  // 舊版「全卡 clip 收起→隱藏態重排→全卡展開」已退場；隨機重佈局仍保留在進場與 resize relayout。
  // ⚠️ background-color transition 只限 morph 時窗（色卡穩態不帶 bg fade，user 2026-08-11 hover/mode 要 snap），
  //    收尾 applyIdleTransition 還原。
  function _doSwitchTab(clickedEl, onDone) {
    const sec  = grayEl.closest('section');
    const sw   = sec.offsetWidth, sh = sec.offsetHeight;

    const MORPH_DUR = 0.6;  // 與 TRANSITION 幾何 glide 同時長

    // 殺掉可能殘留的進場/退場 tween（translate/clipPath），避免和 morph 的 CSS transition 打架
    if (typeof gsap !== 'undefined') gsap.killTweensOf(allEls);
    // 清掉上一輪切換被打斷時殘留的色塊 veil
    sec.querySelectorAll('.lib-card-veil').forEach(v => {
      if (typeof gsap !== 'undefined') gsap.killTweensOf(v);
      v.remove();
    });

    const outgoingEl   = activeEl;
    const clickedCfg   = cfgCache.get(clickedEl);
    const clickedColor = colorOf.get(clickedEl);
    const incomingTab  = tabOf.get(clickedEl);

    // tabOf 不動（卡片各自帶著 tab，換的是角色）；舊灰卡接手被點卡的顏色
    activeEl = clickedEl;
    colorOf.set(outgoingEl, clickedColor);

    // pre-swap：切 panel display + hide children（morph 期間灰卡是素面，收尾 onTabSwitch 才 reveal 內容）
    if (onTabSwitchPre) onTabSwitchPre(incomingTab);
    const contentEl = document.getElementById('library-card-content');
    if (contentEl) clickedEl.appendChild(contentEl);

    // clickedEl → 中央灰卡；舊灰卡 → 隨機重擲新版位/尺寸（user 2026-08-23：不接手空位，每次切換要有變化）。
    // 新卡固定插到色卡堆疊「最底層」（其餘兩卡 z 相對序不變往上遞補）→ 物理上不可能遮住既有卡的可點區；
    // 自己則拿「灰卡 + 全部既有色卡」當 occluder，按畫面剩餘空間重擲大小/位置（user 2026-08-23 可點性）。
    // 四角隨機輪詢：單一角落被既有卡佔住時 genColorConfig 的 best-effort 可能 <20% 可視，換角再擲。
    const gray = { cx: sw / 2, cy: centerY(), w: MAIN_W, h: MAIN_H, rot: 0 };
    const others = allEls.filter(el => el !== clickedEl && el !== outgoingEl)
      .sort((a, b) => (baseZOf.get(a) ?? 1) - (baseZOf.get(b) ?? 1));
    others.forEach((el, i) => {
      baseZOf.set(el, i + 2); el.style.zIndex = String(i + 2);
      // 前一輪 reveal 若被本次切換打斷（killTweensOf 凍結半路），snap 回完整顯示
      el.style.translate = ''; el.style.clipPath = '';
    });
    const occluders = [gray, ...others.map(el => cfgCache.get(el)).filter(Boolean)];
    let newCfg = clickedCfg, bestRatio = -1;
    for (const corner of shuffle([{dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}])) {
      const cfg = genColorConfig(sw, sh, corner, occluders);
      const ratio = cfg ? calcVisibleRatio(cfg, occluders) : -1;
      if (ratio >= 0.20) { newCfg = cfg; break; }
      if (ratio > bestRatio) { bestRatio = ratio; newCfg = cfg; }
    }
    cfgCache.set(clickedEl, gray);
    cfgCache.set(outgoingEl, newCfg);
    baseZOf.set(outgoingEl, 1);

    // 被點色卡：morph 放大成灰卡。色塊「保持原色」放大到完全蓋住灰卡版位，落定後才四向 clip 掀開
    // 露出底下已渲染好的內容（user 2026-08-23）——做法＝卡內鋪一層同色 veil（inset:0 跟著幾何長大、
    // z 蓋過內容），卡本體底色直接 snap 成灰（藏在 veil 下看不見）；MORPH_DUR 後 veil 掀開。
    const veil = document.createElement('div');
    veil.className = 'lib-card-veil';
    // pointer-events:auto（非 none）：色塊蓋住期間攔截點擊 → 底下已渲染就位的內容不可點；clipAway 掀開＋移除後才可點
    // （user 2026-08-25：色塊消失前內容不給點、離開時才點得到）。clip-path 連 pointer 一起裁 → 掀開處漸次恢復可點。
    veil.style.cssText = `position:absolute;inset:0;z-index:60;background:${clickedColor};pointer-events:auto;`;
    clickedEl.appendChild(veil);
    // 補清 clipPath：前一輪 reveal 若被打斷會殘留部分 clip
    clickedEl.style.transition = TRANSITION;
    setAsGray(clickedEl, sw, sh);                       // 目標樣式；transition 讓它滑放大過去（z:10 立即置頂）
    clickedEl.style.clipPath = '';

    // 舊灰卡（user 2026-08-23 定案不對稱）：不 morph 縮小，而是 hero clip-reveal 收場完整消失
    // （位移+揭露 heroExitCard，同色卡離場語彙）→ 隱藏態跳到新版位/新色/z 底層 → 隨機方向 hero clip-reveal 進場
    outgoingEl.style.transition = 'none';
    const EXIT_DUR = 0.3;  // 舊灰卡「離開那一下」滑出時長（user 2026-08-24，獨立可調）；下方 setTimeout 必須同步等它跑完
    heroExitCard(outgoingEl, revealDir(outgoingEl), EXIT_DUR);
    setTimeout(() => {
      outgoingEl.style.transition = 'none';
      setAsColor(outgoingEl, clickedColor, newCfg);
      // 新色卡「先灰後色」：本體先設灰（--lib-bg），RGB 只放在一層起始全遮的 veil 上。
      // ⚠️為何不是「灰 veil 蓋 RGB 本體」（前一版）：色卡帶 rotate，RGB 本體會從灰 veil 的旋轉邊緣反鋸齒
      // 溢出＝user 2026-08-24「小灰卡四周見 RGB 細邊」。改「灰本體＋RGB veil clip 掀入」→ 灰卡停留期單層純灰、
      // 零溢出；VEIL_HOLD 到才把 RGB 掀入蓋灰（與中央色 veil 掀開同刻），收尾本體轉正 RGB＋移除 veil（回單層）。
      outgoingEl.style.background = 'var(--lib-bg)';
      outgoingEl.style.zIndex = '1';
      const colorVeil = document.createElement('div');
      colorVeil.className = 'lib-card-veil';
      colorVeil.style.cssText = `position:absolute;inset:0;z-index:60;background:${clickedColor};pointer-events:none;`;
      colorVeil.style.clipPath = 'inset(0% 0% 100% 0%)';  // 起始全遮：gray hold 期間隱形，clipIn 才掀入
      outgoingEl.appendChild(colorVeil);
      heroRevealCard(outgoingEl, revealDir(outgoingEl), DUR.medium, () => {
        applyIdleTransition(outgoingEl);
        outgoingEl.style.clipPath = '';
        // 新卡 marquee 延到 RGB veil 掀入收尾才 render+reveal（灰卡停留期不顯標題＝維持「純灰卡」）
        // 補救：上一輪 reveal 中被切換打斷的卡（killTweensOf 凍結）marquee 沒 render 到，這裡補上
        others.forEach(o => {
          const t = o.querySelector('.color-rect-title');
          if (t && !t.innerHTML) { renderMarquee(o); revealMarqueeTitle(o); }
        });
      });
    }, EXIT_DUR * 1000);

    setTimeout(() => {
      allEls.forEach(el => { if (el !== outgoingEl) { applyIdleTransition(el); el.style.clipPath = ''; } });
      // 先在 veil 底下把內容「直接渲染就位」（onTabSwitch {instant:true}；此刻卡片幾何已落定，
      // scroll-gate 的視窗判定量到的是最終尺寸），同 tick 完成 → veil 掀開時內容已在
      if (onDone) onDone();
      // 中央灰卡＝色 veil clip 掀「開」（inset0→全遮，露灰卡＋內容）；新色卡＝RGB veil clip 掀「入」
      // （全遮→inset0，蓋灰卡露 RGB）。兩者同 VEIL_HOLD 延遲＋同 DUR.medium → 同一刻「小灰卡消失、
      // 露出 RGB」（user 2026-08-24）。新卡走掀入而非掀開＝灰卡停留期無 RGB 底層、免旋轉邊緣溢出。
      const VEIL_HOLD = 0.5;
      const DIRS = ['inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
      const randDir = () => DIRS[Math.floor(Math.random() * DIRS.length)];
      // 中央色 veil「掀開」與新卡 RGB veil「掀入」**共用同一方向 dir**：clipAway 是 inset0→dir、clipIn 是 dir→inset0，
      // 同一個 dir 下兩者的掃描邊剛好反向 → 兩張卡的 reveal 往相反方向前進（user 2026-08-24：避免兩卡同向）。
      const dir = randDir();
      const clipAway = (v, d, onDone, onStart) => {
        if (!v) { if (onStart) onStart(); if (onDone) onDone(); return; }
        if (typeof gsap === 'undefined') { v.remove(); if (onStart) onStart(); if (onDone) onDone(); return; }
        gsap.fromTo(v,
          { clipPath: 'inset(0% 0% 0% 0%)' },
          { clipPath: d, duration: DUR.medium, ease: EASE.enter,
            delay: VEIL_HOLD, onStart: onStart || undefined, onComplete: () => { v.remove(); if (onDone) onDone(); } });
      };
      const clipIn = (v, d, onDone) => {
        if (!v) { if (onDone) onDone(); return; }
        if (typeof gsap === 'undefined') { v.style.clipPath = 'inset(0% 0% 0% 0%)'; if (onDone) onDone(); return; }
        gsap.fromTo(v,
          { clipPath: d },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.medium, ease: EASE.enter,
            delay: VEIL_HOLD, onComplete: onDone });
      };
      // 標題「不進場動畫」（user 2026-08-26）：onDone(→playPanelReveal)已把標題 clipPath 清掉、就位於
      // 中央色 veil 底下（z 低於 veil），此處 veil 掀開就把它連同內容一起露出＝「色塊離開就直接出現」。
      // 不再於 onStart 特別 reveal 標題（原 z:70 疊 veil 上同步揭的做法已退場）。
      clipAway(veil, dir, null);
      // 新色卡 RGB veil 掀入：收尾把本體轉正 RGB（先設色再移 veil＝同色無閃）＋標題壓軸 reveal。
      // 中途被連點打斷時 killTweensOf 不觸發 onComplete → 本體留灰，靠下一輪 switchTab 開頭 allEls
      // 重設 background=colorOf 自癒（relayout 走 initColorEls 亦然）。
      const newCardVeil = outgoingEl.querySelector('.lib-card-veil');
      clipIn(newCardVeil, dir, () => {
        outgoingEl.style.background = clickedColor;
        if (newCardVeil) newCardVeil.remove();
        renderMarquee(outgoingEl);
        revealMarqueeTitle(outgoingEl);
      });
    }, MORPH_DUR * 1000);
  }

  // ── 進場動畫 ──────────────────────────────────────────────────

  function playEntranceAnimation(sw, sh) {
    const ENTER_DUR = 0.5;
    const STAGGER   = 0.2;

    // 減少動態：library 進場是 setTimeout 分階段 + clip wipe（btn→灰卡→內容），CSS blanket 只讓每段 wipe
    // 瞬間、但 setTimeout 階段間隔仍在 → staged 跳出。這裡直接跳過分階段，所有卡片與內容立即到位。
    if (prefersReducedMotion()) {
      allEls.forEach(el => { el.style.opacity = '1'; el.style.clipPath = ''; applyIdleTransition(el); });
      const contentEl = document.getElementById('library-card-content');
      if (onTabSwitch) onTabSwitch(tabOf.get(grayEl));
      if (contentEl) contentEl.classList.add('content-visible');
      if (nextBtnEl) nextBtnEl.style.clipPath = '';
      isSwitching = false;  // 進場完成 → 解鎖 switchTab
      if (onEntranceDoneCb) onEntranceDoneCb();
      document.fonts.ready.then(() => refreshMarquees());
      return;
    }

    grayEl.style.opacity  = '1';
    grayEl.style.clipPath = 'inset(100% 0 0 0)';

    const sortedByZ = [...colorEls].sort((a,b) => parseInt(a.style.zIndex) - parseInt(b.style.zIndex));
    let delay = 0;
    sortedByZ.forEach(el => {
      // 三色底卡：位移+揭露（隨機 4 向）取代原地 clip-path wipe；灰卡仍走 clipReveal（見下）
      const dir = revealDir(el);
      setTimeout(() => { el.style.opacity = '1'; heroRevealCard(el, dir, ENTER_DUR); }, delay * 1000);
      delay += STAGGER;
    });

    setTimeout(() => {
      clipReveal(grayEl, randomClipDir(), ENTER_DUR, () => {
        grayEl.style.clipPath = '';
        requestAnimationFrame(() => {
          allEls.forEach(el => { applyIdleTransition(el); });
          isSwitching = false;  // 進場完成 → 解鎖 switchTab（之前進場期間 switchTab 會跟進場並行弄亂卡片幾何）
          const contentEl = document.getElementById('library-card-content');
          if (onTabSwitch) onTabSwitch(tabOf.get(grayEl));
          contentEl.classList.add('content-visible');
          // reveal 完清 clip：殘留 inset(0) 會切掉 inner rotate 凸出鈕盒的角（穩態交還 inner 自己的 -12px buffer）
          if (nextBtnEl) heroRevealCard(nextBtnEl, revealDir(nextBtnEl), ENTER_DUR, () => { nextBtnEl.style.clipPath = ''; });
          if (onEntranceDoneCb) onEntranceDoneCb();
          // marquee 已在 initColorEls 內 gate document.fonts.ready render 一次（字型準確），這裡不再重量避免抖動
        });
      });
    }, delay * 1000);
  }

  // ── 退場動畫 ──────────────────────────────────────────────────
  // 進場：colorEls 由低 z 到高 z stagger 0.2s 進，最後 grayEl 進
  // 退場：反向 — grayEl 先收，colorEls 由高 z 到低 z stagger 收
  // 時間壓短（fetch + cleanup + swap 同時跑，總體要 snappy）

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
        // 同 _doSwitchTab Phase A：凍結可能仍在跑的 relayout glide 再量（否則退場位移量到過渡尺寸）
        allEls.forEach(el => { el.style.transition = 'none'; });
        heroExitCard(grayEl, revealDir(grayEl), EXIT_DUR);  // 灰卡也走 hero 位移+揭露收（user 2026-08-23，原 in-place wipe）
        if (activePanel) playPanelBodyExit(activePanel, EXIT_DUR);
        if (nextBtnEl) heroExitCard(nextBtnEl, revealDir(nextBtnEl), EXIT_DUR);  // 鈕獨立在 section 層，同語彙收場

        // 進場是 colorEls 由低 z → 高 z stagger，最後 grayEl
        // 退場反過來：grayEl 收 → colorEls 由高 z → 低 z 倒序 stagger（全卡＝位移+揭露 heroExitCard）
        const sortedByZDesc = [...colorEls].sort((a,b) => parseInt(b.style.zIndex) - parseInt(a.style.zIndex));
        let delay = STAGGER;
        sortedByZDesc.forEach(el => {
          setTimeout(() => heroExitCard(el, revealDir(el), EXIT_DUR), delay * 1000);
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
      // 只有目前尺寸真的 ≠ viewer 開啟前（lastAcceptedSize）才強制重排：viewer 開啟時 gutter ±10px
      // 的暫時變動也會被記進 pendingResize，關閉後尺寸已復原卻無條件清掉 lastAcceptedSize
      // ＝每次開關 viewer 都免費觸發一次隨機重排 glide（user 2026-08-10 診斷）
      if (!lastAcceptedSize || lastAcceptedSize.sw !== sw || lastAcceptedSize.sh !== sh) {
        lastAcceptedSize = null; // 強制下方比對不會 short-circuit
      }
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
      MAIN_W = Math.round(sw * 0.84);
      // 高度＝上下錨定撐滿中間（sh − TOP_GAP − BOTTOM_GAP）：不同高度裝置的上下留白都固定一致、卡高自適應
      // （user 2026-08-24 approach 2，取代舊「寬度固定比」＝底距隨螢幕忽大忽小）。寬度 0.85 不動故高螢幕偏方、
      // 寬螢幕偏扁。Math.max 保底＝極矮視窗不算出負高。要改留白改上方 TOP_GAP/BOTTOM_GAP。
      MAIN_H = Math.max(240, sh - TOP_GAP - BOTTOM_GAP);
      // ⚠️ 不設 cursor：inline `cursor:default` 是 keyword（系統箭頭），spec=1000 蓋掉全站自製 cursor 系統，
      //    害灰卡空白處變回系統游標（只有可點元素自套 pointer）。移除 → 繼承 html 的 var(--cursor-default) 自製圖。
      grayEl.style.cssText = `position:absolute;background:var(--lib-bg);z-index:10;display:flex;flex-direction:column;overflow:visible;width:${MAIN_W}px;height:${MAIN_H}px;left:${Math.round(sw/2)}px;top:${Math.round(centerY())}px;transform:translate(-50%,-50%) rotate(0deg);opacity:0;`;
      initColorEls(sw, sh);
      positionNextBtn(sw, sh);
      colorEls.forEach(el => { el.style.opacity = '0'; });
      requestAnimationFrame(() => { playEntranceAnimation(sw, sh); });
    } else {
      clearTimeout(roResizeTimer);
      const attemptRelayout = () => {
        // 進場/切換動畫進行中不重排：cold load（字型/CSS 晚到）或 deep-link 動態載 library.css 會在進場「途中」
        // 觸發 RO → 若此時 initColorEls 重新隨機定位，會跟進場動畫並行把 colorEls 甩到畫面邊緣
        // （user 2026-06-28：hard refresh / deep-link 卡片散開、warm refresh 正常）。動畫期間延後重排，
        // 等 isSwitching 解鎖（進場/切換收尾）才用最後量到的 sw/sh 重排一次 → 不跟動畫搶、又能套到最終尺寸。
        // panel reveal（chip 1.0s tween＋內容 wipe）也要等：isSwitching 解鎖那刻 reveal 才剛起跑，
        // 重排 glide（隨機重佈局＋0.6s TRANSITION）落在揭露途中＝chip/內容騎著卡片飛（user 2026-08-10）。
        if (isSwitching || isPanelRevealing()) { roResizeTimer = setTimeout(attemptRelayout, 100); return; }
        // 色卡改「hero 收場 → 隱藏態重排 → hero 進場」（user 2026-08-23：relayout 是最後一條
        // 可見狀態 glide 路徑——marquee 標題騎卡飛數百 px＋refreshMarquees 滑行途中重渲染瞬移
        // ＝「標題從遠處飛進來」）。隱藏態重排讓 initColorEls 內的 marquee 重渲完全看不見。
        // 灰卡維持 glide：置中不動、只微調尺寸，chip/內容跟隨幅度小。
        isSwitching = true;  // 編排期間鎖 switchTab（收尾解鎖）
        const nonActive = allEls.filter(el => el !== activeEl);
        nonActive.forEach(el => { el.style.transition = 'none'; heroExitCard(el, revealDir(el), DUR.fast); });
        setTimeout(() => {
          if (typeof gsap !== 'undefined') gsap.killTweensOf(nonActive);
          MAIN_W = Math.round(sw * 0.84);
          MAIN_H = Math.max(240, sh - TOP_GAP - BOTTOM_GAP);  // 同 RO init（上下錨定撐滿，見上方註解）
          setAsGray(activeEl, sw, sh);
          initColorEls(sw, sh);
          positionNextBtn(sw, sh);
          // 標題先遮住（同步設，趕在 initColorEls 內 fonts.ready 微任務 refreshMarquees 重渲之前；
          // renderMarquee 不會動 clipPath → 遮罩存活）：卡片 reveal 期間標題不騎卡，落定才原地揭
          nonActive.forEach(el => { hideMarqueeTitle(el); heroRevealCard(el, revealDir(el), DUR.medium); });
          setTimeout(() => {
            nonActive.forEach(el => { applyIdleTransition(el); el.style.clipPath = ''; revealMarqueeTitle(el); });
            isSwitching = false;
          }, DUR.medium * 1000);
        }, DUR.fast * 1000);
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

  // ── 灰卡右上角「下一個分頁」箭頭鈕（user 2026-08-20）───────────────
  // 依固定順序循環切分頁（與各色卡當下持有的 tab 無關）；視覺/行為對齊 about timeline
  // 的 .tl-list-next-btn（沿用 .tl-icon-btn-inner 黑方塊）。掛在 section 層而非灰卡內
  // （user 2026-08-23）：掛卡內時灰卡 reveal/wipe 的 clip-path 會把凸出的半顆鈕切掉。
  // 改一次生成、JS 釘在灰卡 footprint 右上角（footprint 固定置中，切分頁不動；resize 才重定位）、
  // z 恆在所有卡之上；顯隱只跟頁面進退場，走 hero clip-reveal（entrance 完 heroRevealCard 進、
  // playExitAnimation heroExitCard 收；user 2026-08-23 指定非 fade）。
  const TAB_ORDER = ['awards', 'files', 'press', 'album'];  // award → document → press → album
  let nextBtnEl = null;
  {
    const sectionEl = stack.closest('section');
    nextBtnEl = document.createElement('button');
    nextBtnEl.className = 'lib-card-next-btn';
    nextBtnEl.setAttribute('aria-label', '下一個分頁 Next section');
    nextBtnEl.innerHTML = '<span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span>';
    nextBtnEl.style.clipPath = 'inset(100% 0% 0% 0%)';  // 進場前隱藏；entrance 完 heroRevealCard 揭露
    sectionEl.appendChild(nextBtnEl);
    nextBtnEl.addEventListener('click', () => {
      if (isSwitching) return;
      const cur  = tabOf.get(activeEl);
      const next = TAB_ORDER[(TAB_ORDER.indexOf(cur) + 1) % TAB_ORDER.length];
      // 找當下持有 next tab 的非 active 卡；⚠️用 allEls 不用 colorEls：切一次後 grayEl(#library-card-main)
      // 自己也會變成色卡持有某 tab，只找 colorEls 會漏掉它（回到 awards 時 target=undefined 而卡住）
      const target = allEls.find(el => el !== activeEl && tabOf.get(el) === next);
      if (target) switchTab(target);
    });
  }

  // 鈕中心釘在灰卡右上角點（CSS translate(-50%,-50%) 置中）；RO init 與 resize relayout 時呼叫
  function positionNextBtn(sw, sh) {
    if (!nextBtnEl) return;
    nextBtnEl.style.left = `${Math.round(sw / 2 + MAIN_W / 2)}px`;
    nextBtnEl.style.top  = `${Math.round(centerY() - MAIN_H / 2)}px`;
  }

  // 公開 API（供 library-panels.js 使用）
  return { tabOf, allEls, colorEls, grayEl, get activeEl() { return activeEl; } };
}
