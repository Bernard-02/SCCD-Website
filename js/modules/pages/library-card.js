/**
 * Library Card Stack
 * 顏色矩形卡片的幾何計算、切換動畫、marquee 渲染
 */

import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { playPanelTitleExit, playPanelBodyExit, hidePanelTitleInstant, isPanelRevealing } from './library-panels.js';
import { DUR, EASE } from '../ui/motion.js';
import { sitePath } from '../ui/site-base.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';

export function initLibraryCard({ onTabSwitch, onEntranceDone: onEntranceDoneCb, initialTab = 'awards' }) {

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

  function pointInRect(px, py, cfg) {
    const rad = cfg.rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = px - cfg.cx, dy = py - cfg.cy;
    const lx = dx*cos + dy*sin;
    const ly = -dx*sin + dy*cos;
    return Math.abs(lx) < cfg.w/2 && Math.abs(ly) < cfg.h/2;
  }

  // §13.3：沿某邊「marquee 字條實際所在的帶」採樣 5 世界座標點（沿軸兩端縮 axisPad ＋ 1/4 1/2 3/4；垂直方向內縮 PAD 到字條帶）。
  //   取代 corner-only 檢查——遮擋物蓋住邊中段/字條帶時兩角仍 free（漏判）、貼齊相鄰時角落落在遮擋邊界上被嚴格不等式判 free（誤判）。
  function edgeBandPoints(cfg, edge) {
    const rad = cfg.rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const hw = cfg.w / 2, hh = cfg.h / 2;
    const isVertical = edge === 'left' || edge === 'right';
    const axisLen = isVertical ? cfg.h : cfg.w;
    const ap = Math.min(AXIS_PAD, Math.floor(axisLen / 4));                 // 同 renderMarquee axisPad
    const a0 = -axisLen / 2 + ap, a1 = axisLen / 2 - ap;                    // 沿軸兩端縮 axisPad
    // 垂直軸 local 位移：內縮 PAD 到字條帶（bottom 靠下正、top 靠上負、right 靠右正、left 靠左負）
    const perp = edge === 'bottom' ? (hh - PAD) : edge === 'top' ? (-hh + PAD)
               : edge === 'right'  ? (hw - PAD) : (-hw + PAD);
    return [0, 0.25, 0.5, 0.75, 1].map(f => {
      const t = a0 + (a1 - a0) * f;
      const lx = isVertical ? perp : t, ly = isVertical ? t : perp;
      return { x: cfg.cx + lx * cos - ly * sin, y: cfg.cy + lx * sin + ly * cos };
    });
  }

  // 回傳 'bottom'|'left'|'right'（v3.1 §10.1，永不 top）：候選序＝①底邊→②朝外垂直邊→③另側垂直邊；
  //   §13.3 改沿字條帶 5 點採樣，任一點被更高 z occluder 蓋住＝該邊不可用。灰卡 marquee 在底部 → 色塊底邊型飛行零旋轉貼底邊長大（最連貫、首選）。
  /** @returns {'bottom'|'left'|'right'} */
  function findFreeEdge(cfg, occluders, cx0, cy0) {
    const bandFree = (edge) => edgeBandPoints(cfg, edge).every(p => !occluders.some(occ => pointInRect(p.x, p.y, occ)));
    /** @type {Array<'bottom'|'left'|'right'>} */
    const candidates = [
      'bottom',
      cfg.cx < cx0 ? 'left' : 'right',   // 朝外垂直邊
      cfg.cx < cx0 ? 'right' : 'left',   // 另側垂直邊
    ];
    for (const edge of candidates) if (bandFree(edge)) return edge;
    return candidates[1];   // 全被遮 → 退朝外垂直邊（永不 top）
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
  // §43：line-height 必與 library.css .color-rect-title-inner 同值（1.05）——probe 量的 lineH 是旋轉邊
  //   厚度補償（left/right 邊 `PAD + lineH`）；原本沒寫＝吃 body 繼承、量出 42px vs 實際 38.4 已偏 ~3.6px。
  const PROBE_CSS = 'position:absolute;visibility:hidden;white-space:nowrap;line-height:1.05;' +
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
    const lineH  = probe.offsetHeight || 0;   // 行高＝旋轉後文字條的厚度；朝外定位要用它把外長的一條補回色塊內側
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
      // 文字「朝外」（user 2026-09-04，原朝內是 rotate(-90) 讀下→上）：改 rotate(90) 讀上→下、字向翻 180°。
      // rotate(90) 於左緣自然把文字條往「外(左)」長出 lineH → left 補 +lineH 讓條貼在左緣內側（否則溢出被
      // 色塊 overflow:hidden 裁掉）；top 由 rectPx-axisPad 改 axisPad（讀向反轉，起點端對調）。
      titleEl.style.left = `${PAD + lineH}px`; titleEl.style.top = `${axisPad}px`;
      titleEl.style.transformOrigin = 'left top';
      titleEl.style.transform = 'rotate(90deg)';
    } else {
      // 文字「朝外」：改 rotate(-90) 讀下→上、字向翻 180°；rotate(-90) 於右緣往外(右)長 lineH → left 補 -lineH 貼右緣內側。
      titleEl.style.left = `${perpPx - PAD - lineH}px`; titleEl.style.top = `${rectPx - axisPad}px`;
      titleEl.style.transformOrigin = 'left top';
      titleEl.style.transform = 'rotate(-90deg)';
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
    const inner = /** @type {HTMLElement|null} */ (t.querySelector('.color-rect-title-inner'));
    if (!inner) return;
    // §34（req2, user 2026-09-09）：以**文字 inner box** 100% 位移揭露（clip 窗＝.color-rect-title overflow:hidden 貼文字高），
    //   取代 heroRevealCard 整個 .color-rect-title 容器 box translate（含 line-height leading＝box 比文字高、揭露會露出空白）。
    //   與切換進場（§27 marqueeEnterShift）統一同一機制＝first-entrance／switch 手感一致。
    t.style.transition = 'none';
    t.style.clipPath = '';             // 清 hideMarqueeTitle 的遮罩；改靠 overflow:hidden + inner 位移裁切
    t.style.visibility = 'visible';
    marqueeEnterShift(inner, Math.random() < 0.5 ? 'up' : 'down', dur);
  }

  // ── Hover ────────────────────────────────────────────────────

  // 進場動畫期間先鎖（=true）：進場由 ResizeObserver 觸發、跑 ~1s，期間 switchTab 會跟進場動畫並行操作
  // 同批卡片的 clip/幾何 → 卡片被甩到畫面邊緣（user 2026-06-27：deep-link 進場未完就點 award / 快速切分頁）。
  // 沿用 switchTab 既有 `if (isSwitching) return` guard 擋住；進場 playEntranceAnimation 收尾才解鎖。
  let isSwitching = true;
  // §28（req2）：首次進場旗標——false 期間 initColorEls 的 fonts.ready 把色塊 marquee 先藏、交 playEntranceAnimation 揭；進場收尾設 true（之後 relayout/切換不再藏）。
  let entrancePlayed = false;

  // hover 樣式（inverse mode 反轉：白底黑字，standard 黑底白字）——抽成可重用（§15.4 解鎖補發也呼叫）
  function applyCardHover(el) {
    const titleEl = /** @type {HTMLElement|null} */ (el.querySelector('.color-rect-title'));
    const isInverse = document.body.classList.contains('mode-inverse');
    el.style.background = isInverse ? '#fff' : '#000';
    el.style.zIndex     = '11';
    if (titleEl) titleEl.style.color = isInverse ? '#000' : '#fff';
  }
  // §15.4：isSwitching 解鎖那刻補一輪——切換期間新色塊滑到**靜止游標**下，瀏覽器不（可靠）補發 mouseenter、就算 fire 也被
  //   `if (isSwitching) return` 吞掉（點擊不經 hover 所以可點）。解鎖對每張 :hover 的非 active 卡合成套 hover；mouseleave 既有 handler 復原。
  function syncHoverAfterUnlock() {
    allEls.forEach(el => { if (el !== activeEl && !el.dataset.cardPending && el.querySelector('.color-rect-title') && el.matches(':hover')) applyCardHover(el); });
  }

  function attachHover(el) {
    const titleEl = document.createElement('div');
    titleEl.className = 'color-rect-title';
    el.appendChild(titleEl);

    el.addEventListener('mouseenter', () => {
      // §17.3 hover ready gate（user 2026-09-06「色塊 ready 前 hover 無效」）：反向上色未擦完前 dataset.cardPending 擋 hover——
      //   否則 mouseenter 寫 bg 黑（被灰 overlay 蓋住看不見）＋ title 色（在 overlay 之上立刻變）＝「marquee 變了、顏色沒變」。點擊照舊可點。
      if (isSwitching || el === activeEl || el.dataset.cardPending) return;
      applyCardHover(el);
    });
    el.addEventListener('mouseleave', () => {
      // §26 bug 修：pending（縮小中/上色擦除前）的色塊必須維持灰——colorOf 在切換起手就已是新色，
      //   此處無 gate 時游標滑出＝直接把 RGB 寫進本體（「色塊變小自動填色」）。pending 中 hover 從沒套過、無需還原。
      if (el === activeEl || el.dataset.cardPending) return;
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
    document.fonts.ready.then(() => {
      refreshMarquees();
      // §28（req2）：首次進場時色塊 marquee render 完先藏，交給 playEntranceAnimation 跟卡片一起 clip-reveal
      //   進場（不要「一開始就 stay 在畫面上」）；reduced-motion 或進場已完成則維持靜態顯示、不藏。
      if (!entrancePlayed && !prefersReducedMotion()) colorEls.forEach(el => hideMarqueeTitle(el));
    });
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
  const TRANSITION_GRAY = TRANSITION + ', background-color var(--dur-base) ease';   // 灰卡 mode fade＝共用 token（typography.css 年份 bar 靠同值同步）
  // v3「同一物件雙形態」morph 時窗用：幾何＋背景色同拍 0.6s（兩卡都套：被點卡 RGB→灰、舊灰卡 灰→RGB）。
  // ⚠️mode3 靠 color.css `[style*="--lib-bg"]` 選擇器切黑白：setAsGray 寫 background:var(--lib-bg)（含此標記→neutral gray）、
  //   setAsColor 寫 #RGB（無標記→theme-fg strict）；切換瞬間規則翻面但 CSS transition 補間 computed 值照樣平滑（若 snap→過場 class fallback）。
  // §36 req3（user 2026-09-09）：灰卡→小色塊「回去」的縮小改走專屬緩動——easeInOutCubic 起步輕、收尾軟，
  //   不再急衝（原共用 0.4,0,0.2,1 前段吃掉大半行程＝「急忙的縮小」）。時長維持 0.6s（HOLD/slab timer 都掛 MORPH_DUR，勿改長）。
  //   只縮小端用；被點卡放大仍走 TRANSITION（放大要即刻有感，縮小要優雅收）。CB_SHRINK＝調整鈕。
  const CB_SHRINK = 'cubic-bezier(0.65,0,0.35,1)';
  const TRANSITION_MORPH = ['transform', 'width', 'height', 'left', 'top', 'background-color']
    .map(p => `${p} 0.6s ${CB_SHRINK}`).join(', ');
  // §18.1（user 2026-09-06「還是原地旋轉」）：撤 §16.1「transform 早收」＋§17.4 獨立急起曲線——那讓 rotate 在位移可感知前就跑完＝知覺「先原地轉再滑」。
  //   改 transform 與 width/height/left/top 完全同時長(MORPH_DUR)同曲線＝三變化綁成**單一剛體動作**，任一時刻同時位移+放大+旋轉（垂直型 transition 即等同 TRANSITION）。
  //   §15.3「從灰卡角落長出」顧慮：疑為當年「transition 掛在寫終點之後」的 commit 順序 bug，§16.1 起順序鏈已固定 → 可安全全同步重試；復發退 transform dur 0.45 為下限（不回 0.35）。
  // §41：CB 常數已刪——marquee 進/出場皆 linear（§40/§41）、卡片幾何各用 TRANSITION/CB_SHRINK。
  // §22（v4.3）：adopt/flight 整套退役 → WINDOW_DUR/EXIT_DRAIN/ENTRANCE_DUR 窗長/字流鈕全刪；marquee 換手改「對稱 wipe」（見 marqueeWipeExit/Enter）。
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

    // 不做內容擦除（原 playPanelBodyExit/TitleExit）：那條 clip-path 大動畫（整條清單）跟卡片幾何 morph 同時跑
    // ＝主執行緒兩條重動畫互搶＝卡頓（user 2026-09-04）；且色塊放大會蓋住灰卡、擦除是白工。改成 _doSwitchTab 內
    // onTabSwitchPre 即刻 display:none 舊 panel＝灰卡內容瞬間隱藏「直接變純灰」，卡片只剩幾何 morph 一條動畫、順很多。
    _doSwitchTab(clickedEl, () => {
      // §14.1（user 2026-09-06）：褪灰改「色彩 overlay clip 擦除」→ 內容在 overlay 下 **instant** 渲染就位（overlay 掀開負責 reveal，
      //   list 走 VEIL_REVEAL_DELAY 等擦開才滑列）。取代 v3 的非 instant 四向 wipe。
      if (onTabSwitch) onTabSwitch(tabOf.get(activeEl), { instant: true });
      isSwitching = false;
      syncHoverAfterUnlock();   // §15.4：新色塊若停在靜止游標下，補發 hover
    });
  }

  // 切分頁的卡片動畫＝v3「同一物件雙形態」對稱 morph 互換（user 2026-09-05 定案，取代 veil 語言）：
  //   點到的色卡本體「色塊形態→灰卡形態」一條 morph（幾何放大+轉正 ＋ 底色 RGB→灰 ＋ marquee 卡內飛，全同拍）；
  //   舊灰卡「同時反向 morph」縮小滑到 genColorConfig 重擲的隨機新版位/尺寸色卡（接手被點卡顏色、z 插最底、底色 灰→RGB）。
  //   兩卡幾何+底色 glide 同 MORPH_DUR、方向相反＝互換。其餘兩張色卡完全不動（不重佈局、marquee 不重建）。
  //   ⚠️veil「蓋住再掀開」整套已刪（user「怎麼看都兩個東西」的唯一來源）；內容 t=0.6 走現成 playPanelReveal 四向 wipe。
  //   ⚠️background-color transition 只限 morph 時窗（TRANSITION_MORPH；穩態不帶 bg fade，hover/mode 要 snap），收尾 applyIdleTransition 還原。

  // ── §22（v4.3，user 2026-09-06）：marquee 換手改「對稱 wipe」——整套 adopt/flight 機構退役 ────────────
  //   t=0 色塊 marquee wipe 出場（螢幕上下二選一、不隨字條 rotate 轉軸）→ morph 期間卡上無 marquee → 落定灰卡底部 marquee wipe 進場（方向配對相反）。
  //   連貫性由方向配對承載、不搬 DOM 不接相位（各 marquee 各跑各的 loop）。§15.5-② 正式作廢（無 flight 可鏡像）。
  // §12.1：t=0.6 後的 HOLD setTimeout 存這裡，下一輪 _doSwitchTab／離頁 cleanup 開頭作廢（同 morph timer 紀律）。
  let switchColorTimers = [];

  // §38（user 2026-09-09）拆兩顆鈕：
  //   CONTENT_EXIT＝灰卡內容退場窗（rows stagger 波長）＋ morph 起跑等待（§37「內容先消失、那一刻才變小」不變）
  //   MARQ_EXIT＝被點色塊 marquee 滑出時長——§38 req1 改在 morph 起跑那刻才滑出（不再一點下去就消失）；§44 再快一點 0.35→0.25
  const CONTENT_EXIT = 0.5, MARQ_EXIT = 0.25, MARQ_ENTER = 0.3;

  function parseRotDeg(transform) {
    const m = /rotate\((-?[\d.]+)deg\)/.exec(transform || '');
    return m ? parseFloat(m[1]) : 0;
  }
  // §24.2 clip-reveal 位移版（取代 §22 純 clip 收合）：keyframe 元素用 CSS **個別 translate 屬性**沿 local-Y 滑動——
  //   個別 translate 與 marquee keyframe 的 transform 各自獨立、不互踩（＝免加 wrapper DOM 也不踩「gsap 動 transform 清 CSS 動畫」坑），外層 overflow:hidden 裁切＝位移揭露。
  //   出場：'up' 滑出上緣(0 -100%)／'down' 滑出下緣(0 100%)。進場起點＝反向（'up' 從下方 0 100% 滑上、'down' 從上方 0 -100% 滑下），終點 0 0。
  function marqueeExitShift(dir)       { return dir === 'up' ? '0 -100%' : '0 100%'; }
  function marqueeEnterStartShift(dir) { return dir === 'up' ? '0 100%'  : '0 -100%'; }
  // §24.2/§24.3 共用進場：shiftEl（.lib-title-track 或 .color-rect-title-inner）clip-reveal 滑入；隱藏態 void offset commit 才起跑＝無 pop（§8.1）。
  function marqueeEnterShift(shiftEl, dir, dur) {
    if (!shiftEl) return;
    shiftEl.style.transition = 'none';
    shiftEl.style.translate = marqueeEnterStartShift(dir);
    void shiftEl.offsetHeight;
    shiftEl.style.transition = `translate ${dur}s linear`;   // §41：marquee 進場也去 ease（與 §40 退場 linear 對齊）
    shiftEl.style.translate = '0 0';
    switchColorTimers.push(setTimeout(() => { shiftEl.style.transition = ''; shiftEl.style.translate = ''; }, dur * 1000 + 60));
  }
  // §22.3/§23.3 色彩滑板方向配對：去色 d（top/bottom/left/right）→ 上色 pair＝**所有型都「字面相反 → 再轉 90°」**。
  //   左右邊型：左+90 順時針 CW／右−90 逆時針 CCW。底邊型(rot 0)：也轉 90°、旋向預設 BOTTOM_SPIN=CW（§23.3；實機看反改 SLAB_CCW）。
  const SLAB_OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const SLAB_CW  = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const SLAB_CCW = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };
  const BOTTOM_SPIN = SLAB_CW;   // 底邊型旋向鈕
  function pairSlabDir(d, outRot) {
    const p = SLAB_OPP[d];
    if (outRot === 0) return BOTTOM_SPIN[p];       // §23.3：底邊型也轉 90°（不再只取相反）
    return outRot > 0 ? SLAB_CW[p] : SLAB_CCW[p];
  }
  // §24.2 marquee wipe 出場（色塊）：inner 沿 local-Y clip-reveal 滑出 MARQ_EXIT 後隱藏（§27 起回傳值不再使用、僅收走舊字條）。
  // §40（user 2026-09-09「退場不要加 ease」）：出場曲線＝linear（撤 §36 power3.in）——marquee 進場仍 CB（減速抵達）。
  // §39 req1：呼叫點＝內容退場窗尾端（CONTENT_EXIT−MARQ_EXIT 起跑）＝點擊後先捲一小段（§38「不要一點就消失」保留）、
  //   morph 起跑前恰好收完（「放大之前就要先出場」＝不騎放大，§29 精神回歸）。
  const CB_EXIT = 'linear';
  function marqueeWipeExit(cardEl) {
    const src = /** @type {HTMLElement|null} */ (cardEl.querySelector('.color-rect-title'));
    if (!src || !src.innerHTML || window.innerWidth < 768) return null;
    const inner = /** @type {HTMLElement|null} */ (src.querySelector('.color-rect-title-inner'));
    if (!inner) return null;
    const dir = Math.random() < 0.5 ? 'up' : 'down';
    src.style.visibility = 'visible';                        // 兜底：title 若被前輪 setAsGray/refreshMarquees 藏掉，翻回可見才看得到滑出
    inner.style.transition = 'none';
    inner.style.translate = '0 0';
    void inner.offsetHeight;                                 // §8.1 commit 起點才掛 transition
    inner.style.transition = `translate ${MARQ_EXIT}s ${CB_EXIT}`;
    inner.style.translate = marqueeExitShift(dir);
    switchColorTimers.push(setTimeout(() => { src.style.visibility = 'hidden'; inner.style.transition = ''; inner.style.translate = ''; }, MARQ_EXIT * 1000));
    return dir;
  }

  // §21.1（user 2026-09-06）：色 overlay 改「wrapper(overflow:hidden)+內層純色滑板 transform CSS transition」——compositor 接管，
  //   主執行緒卡（HOLD 幀清單同步渲染）它照滑，取代 gsap 逐幀改 clipPath（主執行緒、一卡就掉幀＝卡感一部分）。純色滑動 vs 遮罩掃過視覺 100% 等價（「位移感來自紋理」反向應用）。
  //   slideIn=false 去色滑出（露底）、true 上色滑入（蓋色）；隨機四向。onDone(wrap) 由 caller 收尾（remove wrap + restore/bg 等）。⚠️單屬性單管線＝無 heroRevealCard 的 translate+clip 雙管線鎖步問題。
  // §24.1：去色/上色時長 ease 收斂到單一常數來源＝兩滑板保證同速同曲線。§24.4：delay 期間滑板靜止（去色覆蓋顯色／上色離場顯灰）＝marquee 先進場浮其上、delay 後才滑動。
  const SLAB_DUR = 0.5;                                        // §24.1 統一時長；v4.9（user 09-08）0.4→0.5 同步後嫌快、放慢（上色端 durBack 隨行程比自動跟著慢）
  // §26 定案（user 09-08「灰卡顏色及色塊顏色**同時**進出場」）：兩滑板同 dur 同 delay **同一條曲線**＝全程鎖步。
  //   曲線選 ease-out（≈power3.out、起步即見）：舊 ease-in 在色塊短行程（~300px vs 大卡 ~1700px）前段幾乎不動＝「填色比較晚」錯覺；
  //   鏡像雙曲線版（滑出 in/滑入 out）也棄——動作輪廓不同就不是「同時」。
  const SLAB_EASE = 'cubic-bezier(0.215,0.61,0.355,1)';
  const WIPE_SLABS = { top: 'translate(0,-100%)', bottom: 'translate(0,100%)', left: 'translate(-100%,0)', right: 'translate(100%,0)' };
  function slideColorWipe(host, color, { inset, z, pe, slideIn, dir, delay = 0, dur = SLAB_DUR, onDone }) {
    const off = WIPE_SLABS[dir || ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)]];   // §22.3：dir 給定用配對方向、否則隨機
    const wrap = document.createElement('div');
    wrap.className = 'lib-color-wipe';
    Object.assign(wrap.style, { position: 'absolute', inset, zIndex: z, pointerEvents: pe, overflow: 'hidden' });
    const slab = document.createElement('div');
    Object.assign(slab.style, { position: 'absolute', inset: '0', background: color, transition: 'none',
      transform: slideIn ? off : 'translate(0,0)' });
    wrap.appendChild(slab);
    host.appendChild(wrap);
    void slab.offsetHeight;                                    // §8.1：commit 起點才掛 transition（否則無位移）
    const startMove = () => {                                  // §24.4：delay 到才起跑；delay 期間滑板停在起點（去色覆蓋／上色離場）
      slab.style.transition = `transform ${dur}s ${SLAB_EASE}`;
      slab.style.transform = slideIn ? 'translate(0,0)' : off;
    };
    if (delay > 0) switchColorTimers.push(setTimeout(startMove, delay * 1000)); else startMove();
    let fired = false;
    const fin = () => { if (fired) return; fired = true; onDone(wrap); };
    slab.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, (delay + dur) * 1000 + 80);               // 兜底：節點被打斷移除時 transitionend 隨之消失
  }

  function _doSwitchTab(clickedEl, onDone) {
    const sec  = grayEl.closest('section');
    const sw   = sec.offsetWidth, sh = sec.offsetHeight;

    const MORPH_DUR = 0.6;  // 與 TRANSITION 幾何 glide 同時長
    // §12.1 morph 保持 RGB → 落定共存 COLOR_HOLD 一瞬；§27 序列：去色滑板滑走露底部 marquee → 收尾才上色色塊 → 上色收尾才揭色塊 marquee。皆調整鈕。
    const COLOR_HOLD = 0.1; // morph 落定後、去色滑板起跑前的共存一瞬（全尺寸 RGB 大卡 + 灰色塊）

    // 殺掉可能殘留的進場/退場 tween（translate/clipPath），避免和 morph 的 CSS transition 打架
    if (typeof gsap !== 'undefined') gsap.killTweensOf(allEls);
    // 清掉上一輪切換被打斷時殘留的色塊 veil ＋ §14.1 色彩 overlay（連點打斷兜底）
    sec.querySelectorAll('.lib-color-wipe').forEach(v => {
      if (typeof gsap !== 'undefined') gsap.killTweensOf(v);
      // §17.1 打斷兜底：反向上色 overlay（host≠activeEl＝擦色中被打斷的色塊、本體此刻還是灰）→ 直寫最終色；
      //   正向去色 overlay（host＝大灰卡）bg 已是灰、不動。
      const host = /** @type {HTMLElement|null} */ (v.parentElement);
      if (host && host !== activeEl) { host.style.transition = 'none'; host.style.background = colorOf.get(host); host.style.overflow = ''; }
      v.remove();
    });
    // v4.12 兜底：mode2 字色編排（黑↔白）被打斷時 timers 已作廢、inline 殘值會卡住錯色——共用節點跨輪重用、統一清
    sec.querySelectorAll('.lib-title-box, .color-rect-title').forEach(t => {
      /** @type {HTMLElement} */ (t).style.color = ''; /** @type {HTMLElement} */ (t).style.transition = '';
    });
    sec.querySelectorAll('.lib-card-veil').forEach(v => { if (typeof gsap !== 'undefined') gsap.killTweensOf(v); v.remove(); });
    // §17.3 兜底：連點時舊 outgoing 的 cardPending 別殘留卡死 hover
    allEls.forEach(el => delete el.dataset.cardPending);
    // §12.1：作廢上一輪未觸發的 HOLD timer（isSwitching 通常已擋住連點、此為兜底＋防離頁後殘觸）；§22 wipe 出/進場的隱藏/清 clip timer 也存這裡一併作廢
    switchColorTimers.forEach(clearTimeout); switchColorTimers = [];

    const outgoingEl   = activeEl;
    outgoingEl.dataset.cardPending = '1';   // §17.3：反向上色擦完(finish2)前 hover 無效；finish2 delete + 補 syncHoverAfterUnlock
    const clickedCfg   = cfgCache.get(clickedEl);
    const clickedColor = colorOf.get(clickedEl);

    // tabOf 不動（卡片各自帶著 tab，換的是角色）；舊灰卡接手被點卡的顏色
    activeEl = clickedEl;
    colorOf.set(outgoingEl, clickedColor);

    const contentEl = document.getElementById('library-card-content');
    // §38 req1（user 2026-09-09）：點擊當下被點色塊 z 即刻抬到最前（原在 morph 起跑才抬）——內容退場窗它就浮最上；
    //   marquee **不**在此刻退場（原 t=0 marqueeWipeExit 被打回「一點下去就消失」）。
    clickedEl.style.zIndex = '15';
    // §39 req1（user 2026-09-09「marquee 在放大之前就要先出場」，撤 §38「morph 起跑那刻才滑出」）：
    //   排在退場窗**尾端**＝起點 CONTENT_EXIT−MARQ_EXIT、滑 MARQ_EXIT、恰在 morph 起跑前收完——
    //   點擊後仍先捲一小段（req1 保留）、又完全不騎放大（§29 精神回歸）。timer 進 switchColorTimers＝連點作廢。
    switchColorTimers.push(setTimeout(() => marqueeWipeExit(clickedEl), (CONTENT_EXIT - MARQ_EXIT) * 1000));
    // §32/§38（user 2026-09-08→09）：t=0 舊灰卡內容退場（CONTENT_EXIT 窗）：標題 chip 直接消失（hidePanelTitleInstant，
    //   §38 req2「不需要 ease」）＋ body 拆件退場（chrome 直接消失、zebra rows 逐列 clip reveal，§38 req5）；
    //   切 panel/搬移/隱藏延到下方 setTimeout（此 window 卡片靜止）。
    const oldPanel = document.getElementById('lib-panel-' + tabOf.get(outgoingEl));
    if (oldPanel) { hidePanelTitleInstant(oldPanel); playPanelBodyExit(oldPanel, CONTENT_EXIT); }

    // clickedEl → 中央灰卡；舊灰卡 → 隨機重擲新版位/尺寸（user 2026-08-23：不接手空位，每次切換要有變化）。
    // §41（user 2026-09-09「定位之後 z 突然跳成下一個色塊、剩下的卡 z 怎麼決定」）＝z 改「**依落地新舊排**」（recency）：
    //   點下去的＝最頂（morph 15→落定灰卡 10）；**落地的縮小卡＝色塊頂層**（others.length+1，通常 3）；其餘舊卡各往下
    //   擠一格（相對順序不變）。縮小卡飛行中 z:10 本就高於所有色塊、落定進頂層仍高於它們＝**任何一對卡的上下關係
    //   全程不翻轉、pop 從結構上消失**（撤 2026-08-23「新卡插最底」invariant）。
    //   可點性守門換向：原本檢查「新卡在別人下面夠不夠露臉」，改成三方都檢查——新卡只被灰卡蓋、兩張舊卡再被新卡蓋，
    //   任一 <20% 就換角重擲（同 best-effort fallback 精神）。
    //   ⚠️baseZOf 在 t=0 就寫好「計畫值」（連點中斷時 switchTab 開頭的 baseZOf 還原會直接套用＝不留 stale z:10）、
    //   inline z 到 morph 落定 settle 才套（縮小全程維持 10，§38 req3）。
    const gray = { cx: sw / 2, cy: centerY(), w: MAIN_W, h: MAIN_H, rot: 0 };
    const others = allEls.filter(el => el !== clickedEl && el !== outgoingEl)
      .sort((a, b) => (baseZOf.get(a) ?? 1) - (baseZOf.get(b) ?? 1));
    others.forEach((el, i) => {
      baseZOf.set(el, i + 1);
      // 前一輪 reveal 若被本次切換打斷（killTweensOf 凍結半路），snap 回完整顯示
      el.style.translate = ''; el.style.clipPath = '';
    });
    baseZOf.set(outgoingEl, others.length + 1);
    const cfgLow  = others[0] ? cfgCache.get(others[0]) : null;   // 落定後 z 低→高＝ others[0], others[1], 落地卡
    const cfgHigh = others[1] ? cfgCache.get(others[1]) : null;
    const genOccluders = [gray, ...[cfgHigh, cfgLow].filter(Boolean)];
    let newCfg = clickedCfg, bestScore = -1;
    for (const corner of shuffle([{dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}])) {
      const cfg = genColorConfig(sw, sh, corner, genOccluders);
      if (!cfg) continue;
      const score = Math.min(
        calcVisibleRatio(cfg, [gray]),                                          // 新卡：只被灰卡蓋
        cfgHigh ? calcVisibleRatio(cfgHigh, [gray, cfg]) : 1,                   // 次新舊卡：灰卡＋新卡蓋
        cfgLow  ? calcVisibleRatio(cfgLow, [gray, cfg, ...(cfgHigh ? [cfgHigh] : [])]) : 1,   // 最舊：再加次新
      );
      if (score >= 0.20) { newCfg = cfg; break; }
      if (score > bestScore) { bestScore = score; newCfg = cfg; }
    }
    cfgCache.set(clickedEl, gray);
    cfgCache.set(outgoingEl, newCfg);

    // v3「同一物件雙形態」（user 2026-09-05，取代 veil 語言）：被點卡本體「色塊形態→灰卡形態」一條 morph——
    // 幾何(放大+轉正) ＋ 底色 RGB→灰 ＋ marquee 卡內飛（§9.4）全同拍。veil「蓋住再掀開」整套刪除＝「兩個東西」感的唯一來源。
    // §12.1 修正 A：morph 期間**只**幾何動、背景維持 RGB 原色（不再同拍變灰）。transition 用幾何-only TRANSITION；
    //   setAsGray 寫的 background:var(--lib-bg) 立即被覆寫回 RGB——同幀、且 TRANSITION 無 background-color 軌＝中間灰不 paint。
    //   褪灰延到 t=0.6+HOLD 才單獨掛 bg-only transition 做（見下 setTimeout），達成「共存一瞬才褪灰」。
    // §19.1（撤整卡 ±90 旋轉、§11 退役）：兩型統一**純幾何 morph**（不對調尺寸/不寫 rotate）；§22：marquee 換手由 wipe 出/進場承載（見 marqueeWipeExit/Enter），卡片只管幾何。
    // §29/§39：morph 整段延到 CONTENT_EXIT（內容退場窗）後才跑——窗內色塊**完全不動**；
    //   marquee 於窗尾滑出（§39 req1，見上方 t=0 排程）＝morph 起跑時已收完、不騎放大。
    switchColorTimers.push(setTimeout(() => {
    // §37 req3（user 2026-09-09「灰卡變色塊時跳動一下」）：撤掉這一 tick 的 onTabSwitchPre pre-swap——原本在 contentEl
    //   還**可見**時切 panel display（舊 panel none／新 panel flex）＝整份 4-panel DOM 在 morph transition 起跑幀同步重排
    //   ＋一幀新 panel 內容閃現（§34 已預告此為下一嫌疑）。panel swap 全交給 HOLD 幀 onDone 的 onTabSwitch（instant）
    //   ——那裡 contentEl 剛恢復顯示、在滑板(z:60)下渲染，與 §14.1「內容 overlay 下 instant 就位」本設計一致；
    //   morph 期間 contentEl display:none、內部殘留舊 panel display 狀態無妨（隱藏子樹零 layout）。
    // §34（req3, user 2026-09-09）：搬共用內容節點到被點卡「先 display:none 再 reparent」。原本 display=''（可見）下 appendChild＝
    //   在新父(正縮小的小色塊)底下把整份內容(4 panel DOM)重新 layout 一次，正落在 morph transition 起跑幀＝丟幀「跳一下」。
    //   改成先隱藏再搬＝移動隱藏節點零 layout，morph 首幀不被同步重排吃掉（對齊效能鐵則：重 DOM 操作勿落動畫幀）。
    if (contentEl) { contentEl.style.display = 'none'; clickedEl.appendChild(contentEl); }
    clickedEl.style.transition = TRANSITION;
    setAsGray(clickedEl, sw, sh);                       // 幾何目標（放大轉正）；bg 隨即覆寫回 RGB
    clickedEl.style.background = clickedColor;          // ⚠️點擊當下 hover inline bg 可能是 #000/#fff，顯式寫回 RGB 原色（不能沿用現值）
    // §39 req2（user 2026-09-09「有的色塊放大時永遠不會在頂部」）：⚠️setAsGray 內部寫 z:10——會蓋掉 t=0 抬的 15，
    //   與舊灰卡(z:10)打平＝DOM order 決勝負→放大中沉到灰卡下面。同 tick 補回 15（t=0.6 settle 才還原 10）。
    clickedEl.style.zIndex = '15';
    // §10.3：morph 期間卡片 overflow:hidden（覆蓋 setAsGray 的 visible）＝保險絲裁掉 box 自轉時掃出卡外的字條；t=0.6 還原 visible。
    clickedEl.style.overflow = 'hidden';
    clickedEl.style.clipPath = '';

    // §16.2 反向鏡像（user 2026-09-06，撤 §12.1 的 灰→RGB fade）：縮小段**全程維持灰**——setAsColor 後同 tick 把 bg 覆寫回 var(--lib-bg)
    //   （起灰終灰＝無 bg 補間、幾何照 glide）。⚠️此「維持純灰」覆寫是**刻意重新引入**（用途換成配 t=0.6+HOLD 的灰 overlay 擦除露色，鏡像 14.1），勿當回歸。
    // §38 req3/§41：縮小段**不動 z**（維持灰卡 z:10、飛行中高於所有色塊）；落定 settle 才套 recency z
    //   （進色塊頂層＝與飛行中的上下關係一致、零翻轉零 pop，見下 settle 區）。
    outgoingEl.style.transition = TRANSITION_MORPH;
    setAsColor(outgoingEl, clickedColor, newCfg);      // 縮到新色卡版位/尺寸（left/top/w/h/rotate glide）
    outgoingEl.style.background = 'var(--lib-bg)';     // ← 覆寫回灰（縮小全程灰；落定+HOLD 才 overlay 擦除露 RGB）

    switchColorTimers.push(setTimeout(() => {
      // 舊灰卡＋others 還原 idle transition＋清殘留 clip（被點卡 clickedEl 留給下方 fade 段控制）。
      allEls.forEach(el => { if (el !== clickedEl) applyIdleTransition(el); el.style.clipPath = ''; });
      clickedEl.style.zIndex = '10';   // 放大期間暫置 15 → 還原灰卡標準 z:10
      clickedEl.style.overflow = 'visible';   // §10.3：還原灰卡 steady state（morph 期間暫 hidden 裁旋轉字條）
      // §41 recency z 套用（t=0 已寫進 baseZOf 計畫值）：落地卡進色塊頂層、舊卡依序往下擠（相對順序不變＝零對翻）。
      others.forEach(el => { el.style.zIndex = String(baseZOf.get(el) ?? 1); });
      outgoingEl.style.zIndex = String(baseZOf.get(outgoingEl) ?? others.length + 1);
      // 補救：上一輪 reveal 被本次切換打斷的 others 卡 marquee 沒 render 到（killTweensOf 凍結）→ 補上；
      // §41：落地卡如今蓋在舊卡之上——被壓到 marquee 帶的舊卡重挑 free edge 重建（renderMarquee 會避開高 z 佔用邊）。
      const landRect = outgoingEl.getBoundingClientRect();
      others.forEach(o => {
        const t = /** @type {HTMLElement|null} */ (o.querySelector('.color-rect-title'));
        if (!t) return;
        if (!t.innerHTML) { renderMarquee(o); revealMarqueeTitle(o); return; }
        const r = t.getBoundingClientRect();
        const covered = r.right > landRect.left && r.left < landRect.right && r.bottom > landRect.top && r.top < landRect.bottom;
        if (covered) { renderMarquee(o); revealMarqueeTitle(o); }
      });

      // §28（user 2026-09-08，撤 §27 序列、timing 改回「同步」）：兩色彩滑板同時起跑——
      //   ① 灰卡去色滑板滑走露出**藏在滑板下**的底部 marquee（不 z:70 抬高＝不單獨出現，§27 保留）
      //   ② 色塊上色滑板**同時**滑入（撤 §27「去色完才上色」的序列）
      //   ③ 色塊 marquee 仍等上色收尾才進場（在色塊之後、不單獨出現，§27 保留）
      switchColorTimers.push(setTimeout(() => {
        renderMarquee(outgoingEl);                       // 建色塊 marquee（先藏，上色收尾才揭）
        // (a) 卡本體 bg 直寫 var(--lib-bg)（transition:none；藏在去色滑板下不 paint 中間態）＝順帶消 mode3 bg 補間疑慮
        clickedEl.style.transition = 'none';
        clickedEl.style.background = 'var(--lib-bg)';
        void clickedEl.offsetHeight;                     // §15.1：commit bg **才**掛回 idle transition（否則 RGB→灰偷偷 fade）
        applyIdleTransition(clickedEl);
        // (b) 色彩 wipe 顏色（mode3=theme-fg）
        const isMode3 = document.body.classList.contains('mode-color');
        const wipeColor = isMode3 ? 'var(--theme-fg)' : clickedColor;
        // §22.3 方向配對：去色 dGo 隨機四向；上色 dBack=pairSlabDir(dGo, 色塊 marquee 邊型 rot)
        const dGo = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];
        const outSrc = /** @type {HTMLElement|null} */ (outgoingEl.querySelector('.color-rect-title'));
        const outInner = /** @type {HTMLElement|null} */ (outSrc && outSrc.querySelector('.color-rect-title-inner'));
        const dBack = pairSlabDir(dGo, outSrc ? parseRotDeg(outSrc.style.transform) : 0);
        // §27①：灰卡底部 marquee 留在去色滑板**下方**（不抬 z:70、不獨立 clip-reveal）＝滑板滑走時自然露出。
        //   showPanel（onDone）build 的 .lib-panel-title 本就在滑板下、z 低於 z:60（見 library-panels.js「色塊離開就直接出現」）。
        // §27③：色塊 marquee 先藏，等上色收尾才揭。
        if (outSrc) outSrc.style.visibility = 'hidden';
        // 內容滑板下 instant 渲染就位＋onDone 提前（playPanelReveal instant 路徑 scroll-gate 照舊）
        if (contentEl) contentEl.style.display = '';
        if (onDone) onDone();                            // showPanel build 灰卡 marquee（在滑板下）

        // §26 等鋒面速度：同 dur 下色塊行程遠短於大卡、鋒面慢＝「色塊晚到」→ 上色時長按行程比縮短
        const travelGo   = (dGo   === 'left' || dGo   === 'right') ? MAIN_W : MAIN_H;
        const travelBack = (dBack === 'left' || dBack === 'right') ? newCfg.w : newCfg.h;
        const durBack = Math.max(0.15, SLAB_DUR * travelBack / travelGo);

        // §28① 去色（與上色同拍）：灰卡去色滑板滑走露灰＋底部 marquee。wrapper z:60、pe:auto 擋點擊到擦完。
        slideColorWipe(clickedEl, wipeColor, { inset: '0', z: '60', pe: 'auto', slideIn: false, dir: dGo, delay: 0, dur: SLAB_DUR,
          onDone: (/** @type {HTMLElement} */ wrap) => { if (wrap.parentNode) wrap.remove(); } });
        // §28② 上色（與去色**同時**起跑，撤 §27 序列）：本體恆灰、色只在 overlay 滑入；到位後直寫 RGB。§26 等鋒面速度 durBack。
        outgoingEl.style.overflow = 'hidden';
        slideColorWipe(outgoingEl, wipeColor, { inset: '-2px', z: '0', pe: 'none', slideIn: true, dir: dBack, delay: 0, dur: durBack,
          onDone: (/** @type {HTMLElement} */ wrap2) => {
            outgoingEl.style.transition = 'none';
            outgoingEl.style.background = clickedColor;
            void outgoingEl.offsetHeight;
            applyIdleTransition(outgoingEl);
            outgoingEl.style.overflow = '';
            if (wrap2.parentNode) wrap2.remove();
            delete outgoingEl.dataset.cardPending;   // §17.3：色塊 ready → hover 生效
            syncHoverAfterUnlock();                  // 游標若正停其上、ready 即刻套 hover
          } });
        // §33（req5, user 2026-09-09，撤 §28③「上色收尾才揭」）：色塊 marquee 不必等上色**完全**到位——
        //   上色行程約 65% 就揭（早一點點；仍在色塊之後、不單獨出現）。timer 進 switchColorTimers＝連點作廢。
        if (outSrc && outInner) {
          switchColorTimers.push(setTimeout(() => {
            outSrc.style.visibility = 'visible';
            marqueeEnterShift(outInner, Math.random() < 0.5 ? 'up' : 'down', MARQ_ENTER);
          }, durBack * 0.65 * 1000));
        }
      }, COLOR_HOLD * 1000));
    }, MORPH_DUR * 1000));
    }, CONTENT_EXIT * 1000));
  }

  // ── 進場動畫 ──────────────────────────────────────────────────

  function playEntranceAnimation(sw, sh) {
    const ENTER_DUR = 0.5;
    const STAGGER   = 0.2;

    // 減少動態：library 進場是 setTimeout 分階段 + clip wipe（btn→灰卡→內容），CSS blanket 只讓每段 wipe
    // 瞬間、但 setTimeout 階段間隔仍在 → staged 跳出。這裡直接跳過分階段，所有卡片與內容立即到位。
    if (prefersReducedMotion()) {
      entrancePlayed = true;  // §28：reduced-motion 不藏不動畫、marquee 靜態顯示
      allEls.forEach(el => { el.style.opacity = '1'; el.style.clipPath = ''; applyIdleTransition(el); });
      const contentEl = document.getElementById('library-card-content');
      if (onTabSwitch) onTabSwitch(tabOf.get(grayEl));
      if (contentEl) contentEl.classList.add('content-visible');
      if (nextBtnEl) nextBtnEl.style.clipPath = '';
      isSwitching = false;  // 進場完成 → 解鎖 switchTab
      syncHoverAfterUnlock();   // §15.4
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
      // §29（req2/req4）：marquee 跟色塊**同時** clip-reveal 進場（非等卡落定 onDone）；gate fonts.ready 確保 marquee 已 render
      //   （cold load 字型晚到也照跑動畫、不 static）。initColorEls 的 fonts.ready 先把它藏起，這裡揭。只首次進場有。
      setTimeout(() => {
        el.style.opacity = '1';
        heroRevealCard(el, dir, ENTER_DUR);
        document.fonts.ready.then(() => revealMarqueeTitle(el, ENTER_DUR));
      }, delay * 1000);
      delay += STAGGER;
    });

    setTimeout(() => {
      clipReveal(grayEl, randomClipDir(), ENTER_DUR, () => {
        grayEl.style.clipPath = '';
        requestAnimationFrame(() => {
          allEls.forEach(el => { applyIdleTransition(el); });
          entrancePlayed = true;  // §28：進場完成 → 之後 initColorEls 的 fonts.ready 不再藏 marquee（relayout 自帶 hide/reveal）
          isSwitching = false;  // 進場完成 → 解鎖 switchTab（之前進場期間 switchTab 會跟進場並行弄亂卡片幾何）
          syncHoverAfterUnlock();   // §15.4
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
  // 離頁時把還在飛的 marquee box 歸巢（真節點掛 body、不能 remove；restore 移回 panel 內 → 隨 page-content swap 清掉）
  //   ＋作廢未觸發的 HOLD/FADE timer（§12.1，防離頁後殘觸改 detached 卡片樣式）
  registerPageCleanup(() => {
    switchColorTimers.forEach(clearTimeout); switchColorTimers = [];
    document.querySelectorAll('.lib-color-wipe').forEach(w => { if (typeof gsap !== 'undefined') gsap.killTweensOf(w); w.remove(); });  // §14.1 overlay 兜底
  });

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
