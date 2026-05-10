/**
 * Library Card Stack
 * 顏色矩形卡片的幾何計算、切換動畫、marquee 渲染
 */

export function initLibraryCard({ onTabSwitch, onEntranceDone: onEntranceDoneCb }) {

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

  // ── DOM 幾何讀取 ─────────────────────────────────────────────

  function elToRect(el) {
    return {
      cx:  parseFloat(el.style.left),
      cy:  parseFloat(el.style.top),
      w:   parseFloat(el.style.width),
      h:   parseFloat(el.style.height),
      rot: parseFloat((el.style.transform.match(/rotate\(([^)]+)deg\)/) || ['','0'])[1]),
    };
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

  // 回傳 'top'|'right'|'bottom'|'left'
  function findFreeEdge(cfg, occluders) {
    const c = rectWorldCorners(cfg);
    const edges = [[0,1,'top'], [1,2,'right'], [2,3,'bottom'], [3,0,'left']];
    // 優先：找兩端點都可見的邊
    for (const [ai,bi,name] of edges) {
      if (!isCornerOccluded(c[ai], occluders) && !isCornerOccluded(c[bi], occluders))
        return name;
    }
    return 'top';
    // Fallback：如果找不到，改找任何一個「中點」可見的邊
    for (const [ai,bi,name] of edges) {
      const midX = (c[ai].x + c[bi].x) / 2;
      const midY = (c[ai].y + c[bi].y) / 2;
      if (!occluders.some(occ => pointInRect(midX, midY, occ))) {
        return name;
      }
    }
    // Final fallback
    return 'top'; 
  }

  // ── 矩形樣式設定 ─────────────────────────────────────────────

  function setAsGray(el, sw, sh) {
    el.style.background     = 'var(--lib-bg)';
    el.style.cursor         = 'default';
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
    el.style.cursor     = 'pointer';
    el.style.width      = `${Math.round(config.w)}px`;
    el.style.height     = `${Math.round(config.h)}px`;
    el.style.left       = `${Math.round(config.cx)}px`;
    el.style.top        = `${Math.round(config.cy)}px`;
    el.style.transform  = `translate(-50%, -50%) rotate(${config.rot}deg)`;
    el.style.overflow   = 'hidden';
    const content = el.querySelector('#library-card-content');
    if (content) {
      content.style.transition = 'none';
      content.classList.remove('content-visible');
      content.style.opacity = '0';
    }
  }

  // ── Marquee ──────────────────────────────────────────────────

  const TAB_LABELS = {
    awards: 'Awards 獎項',
    press:  'Press 報導',
    files:  'Documents 文件',
    album:  'Album 相簿',
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
      const titleEl = el.querySelector('.color-rect-title');
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

  let isSwitching = false;

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
  tabOf.set(grayEl, 'awards');
  colorOf.set(grayEl, '#f2f2f2');
  cfgCache.set(grayEl, null);
  const remainingTabs = shuffle(['press', 'files', 'album']);
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
  const CLIP_DUR = 0.45;

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
      const titleEl = el.querySelector('.color-rect-title');
      if (titleEl) titleEl.style.color = '#000';
      if (el !== activeEl) {
        el.style.background = colorOf.get(el);
        if (baseZOf.has(el)) el.style.zIndex = String(baseZOf.get(el));
      }
    });

    const contentEl = document.getElementById('library-card-content');
    contentEl.classList.remove('content-visible');

    setTimeout(() => {
      _doSwitchTab(clickedEl, () => {
        const contentEl = document.getElementById('library-card-content');
        if (onTabSwitch) onTabSwitch(tabOf.get(activeEl));
        if (contentEl) {
          contentEl.style.transition = '';
          contentEl.style.opacity    = '';
          requestAnimationFrame(() => { contentEl.classList.add('content-visible'); });
        }
        isSwitching = false;
      });
    }, 300);
  }

  function _doSwitchTab(clickedEl, onDone) {
    const sec  = grayEl.closest('section');
    const sw   = sec.offsetWidth, sh = sec.offsetHeight;
    const gCx  = sw / 2, gCy = sh / 2;

    const outgoingEl    = activeEl;
    const outgoingColor = colorOf.get(clickedEl);
    const outgoingTab   = tabOf.get(outgoingEl);
    const incomingTab   = tabOf.get(clickedEl);

    // 更新狀態
    activeEl = clickedEl;
    tabOf.set(clickedEl, incomingTab);
    tabOf.set(outgoingEl, outgoingTab);
    colorOf.set(outgoingEl, outgoingColor);

    // 立即把內容層移入新的主矩形（保持 opacity:0），避免 clip 動畫期間矩形呈現空白
    const contentEl = document.getElementById('library-card-content');
    if (contentEl) {
      contentEl.style.transition = 'none';
      contentEl.style.opacity    = '0';
      clickedEl.appendChild(contentEl);
    }

    const gray = { cx: gCx, cy: gCy, w: MAIN_W, h: MAIN_H, rot: 0 };
    cfgCache.set(clickedEl, gray); // clickedEl 變成灰色

    const otherColorEls  = allEls.filter(el => el !== clickedEl && el !== outgoingEl);
    const allColorNow    = [outgoingEl, ...otherColorEls];
    const newZs          = shuffle([1, 2, 3]);
    allColorNow.forEach((el, i) => { el.style.zIndex = String(newZs[i]); baseZOf.set(el, newZs[i]); });

    const sortedColorNow = [...allColorNow].sort((a,b) => parseInt(b.style.zIndex) - parseInt(a.style.zIndex));
    const corners        = shuffle([{dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}]).slice(0, 3);
    const cfgMap         = new Map();

    sortedColorNow.forEach((el, i) => {
      const elZ = parseInt(el.style.zIndex);
      const occluders = [gray, ...sortedColorNow
        .filter(o => o !== el && cfgMap.has(o) && parseInt(o.style.zIndex) > elZ)
        .map(o => cfgMap.get(o))
      ];
      const cfg = genColorConfig(sw, sh, corners[i], occluders);
      cfgMap.set(el, cfg);
      cfgCache.set(el, cfg); // ← 立即更新 cache

      if (otherColorEls.includes(el)) {
        const hideDir = randomClipDir();
        const showDir = randomClipDir();
        el.style.transition = 'none';
        el.style.clipPath   = hideDir.show;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = `clip-path ${CLIP_DUR}s ease-in`;
            el.style.clipPath   = hideDir.hide;
          });
        });
        setTimeout(() => {
          el.style.transition = 'none';
          if (cfg) setAsColor(el, colorOf.get(el), cfg);
          el.style.clipPath = showDir.hide;
          renderMarquee(el); // <-- 新增：立刻生成並顯示 marquee，確保動畫過程中標題可見
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = `clip-path ${CLIP_DUR}s ease-out`;
              el.style.clipPath   = showDir.show;
              setTimeout(() => { el.style.transition = TRANSITION; el.style.clipPath = ''; }, CLIP_DUR * 1000);
            });
          });
        }, CLIP_DUR * 1000);
      } else {
        el.style.transition = 'none';
        const dir = randomClipDir();
        if (cfg) setAsColor(el, colorOf.get(el), cfg);
        el.style.clipPath = dir.hide;
        renderMarquee(el); // <-- 新增：立刻生成並顯示 marquee，確保動畫過程中標題可見
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = `clip-path ${CLIP_DUR}s ease-out`;
            el.style.clipPath   = dir.show;
            setTimeout(() => { el.style.transition = TRANSITION; el.style.clipPath = ''; }, CLIP_DUR * 1000);
          });
        });
      }
    });

    // clickedEl → 灰色主矩形
    clickedEl.style.transition = 'none';
    const grayDir = randomClipDir();
    setAsGray(clickedEl, sw, sh);
    clickedEl.style.clipPath = grayDir.hide;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clickedEl.style.transition = `clip-path ${CLIP_DUR}s ease-out`;
        clickedEl.style.clipPath   = grayDir.show;
        setTimeout(() => {
          clickedEl.style.transition = TRANSITION;
          clickedEl.style.clipPath   = '';
          // cfgCache 已在 forEach 裡全部更新，直接刷新
          refreshMarquees();
          if (onDone) onDone();
        }, CLIP_DUR * 1000);
      });
    });
  }

  // ── 進場動畫 ──────────────────────────────────────────────────

  function playEntranceAnimation(sw, sh) {
    const ENTER_DUR = 0.5;
    const STAGGER   = 0.2;
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

  // ── ResizeObserver ────────────────────────────────────────────

  let roInitialized = false;
  let roResizeTimer = null;

  function isViewerOpen() {
    const lb  = document.getElementById('activities-lightbox');
    const pdf = document.getElementById('pdf-viewer-modal');
    return (lb && lb.style.display !== 'none') || (pdf && pdf.style.display !== 'none');
  }

  const ro = new ResizeObserver(() => {
    if (isViewerOpen()) return;
    const sec = grayEl.closest('section');
    if (sec.offsetWidth === 0 || sec.offsetHeight === 0) return;
    const sw = sec.offsetWidth, sh = sec.offsetHeight;

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
      roResizeTimer = setTimeout(() => {
        MAIN_W = Math.round(sw * 0.85);
        MAIN_H = Math.round(sw * 0.87 * 10.5 / 21);
        setAsGray(activeEl, sw, sh);
        initColorEls(sw, sh);
      }, 100);
    }
  });
  ro.observe(grayEl.closest('section'));

  // 點擊事件
  colorEls.forEach(el => {
    el.addEventListener('click', () => { if (el !== activeEl) switchTab(el); });
  });
  grayEl.addEventListener('click', () => { if (grayEl !== activeEl) switchTab(grayEl); });

  // 公開 API（供 library-panels.js 使用）
  return { tabOf, allEls, colorEls, grayEl, get activeEl() { return activeEl; } };
}
