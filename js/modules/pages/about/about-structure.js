// Programs 結構圖互動（DCD 學制樹狀圖）：進出場動畫 + 進場後 atlas 式輕漂。
//  - chip 進/退場＝clip-reveal（個別 translate + 同步 clip-path，四方向隨機；沿用全站 nav chip 手法，
//    旋轉安全＝clip 跟著 chip 轉；見 scroll-animate navChipHidden / NAV_CHIP_SHOWN）。
//  - 父→子連綫＝「從 A 拉長到 B」（draw 0→1 內插終點）；DCD↔BPAIDC 連結橫綫＝scaleX 由 DCD 側拉長。
//  - 進場順序（cascade）：父 chip → 連結/連綫 → 子 chip → 子連綫 → 孫 chip；退場全部一起消失。
//  - chip 旋轉用 transform:rotate（navChipHidden 讀 transform 算旋轉後位移向量）；無 hover、無 click。
//  - 每次進場隨機給兩家族（DCD / BPAIDC）不同三原色。
//  - 進場結束後 floating（rAF wobble loop，同 atlas item：translate 由 rest 往外漂再回 + rotate 微擺）；
//    連綫端點跟著各自 chip 的漂移量偏移＝維持連結；離頁/離開視窗自動停（省 CPU）。
// 端點在 chip 靜止（rest）位置量測（restRect 減去當幀 reveal translate）＝連綫指向子 chip 的落點、
// 不受進場滑移影響。
import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { prefersReducedMotion } from '../../ui/reduce-motion.js';
import { navChipHidden, NAV_CHIP_SHOWN } from '../../ui/scroll-animate.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const rndRot = () => (window.SCCDHelpers?.getRandomRotation?.() ?? ((Math.round(Math.random() * 6 - 3)) || 2));
const DIRS = ['top', 'bottom', 'left', 'right'];
const rndDir = () => DIRS[Math.floor(Math.random() * 4)];
const parseTranslate = (el) => {
  const m = (el?.style.translate || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  return m ? [+m[1], +m[2]] : [0, 0];
};

export function initProgramStructure() {
  const root = document.getElementById('program-structure');
  if (!root) return;
  const roots = root.querySelector('.prog-roots');
  const svg = root.querySelector('.prog-lines');
  const progTree = root.querySelector('.prog-tree');
  const rootChildren = root.querySelector('.prog-children--root');
  const desktop = window.innerWidth >= 768;
  const hasGsap = typeof gsap !== 'undefined';
  const reduce = prefersReducedMotion();
  const willAnimate = hasGsap && !reduce;

  // ── 連結橫綫：隨機微旋轉（個別 rotate，讓 scaleX 用 transform 疊加）＋進場前藏 ──
  const links = [...root.querySelectorAll('.prog-seg--link')];
  root.querySelectorAll('.prog-seg').forEach((seg) => {
    seg.style.rotate = `${((Math.random() * 2 - 1) * 2.5).toFixed(2)}deg`;
  });
  if (willAnimate && desktop && links.length) gsap.set(links, { scaleX: 0, transformOrigin: '0% 50%' });

  // ── chips：旋轉走 transform:rotate（navChipHidden 讀它）＋各自隨機進場方向 + atlas 式浮動設定 ──
  const chips = [...root.querySelectorAll('.prog-tilt')];
  chips.forEach((box) => {
    box._baseRot = rndRot();
    box.style.transform = `rotate(${box._baseRot}deg)`;
    box._inDir = rndDir();
    // 浮動：x/y 各自獨立正弦（不同週期/相位）→ 連續 2D 環繞漂移（Lissajous），非單軸往返
    //（原 ping-pong 到極點又折返、感覺只往一個方向）。幅度 ±7 對齊 atlas A/C float（tx/ty srand()*14-7）、rot ±3。
    box._float = {
      ax: 4 + Math.random() * 3, ay: 4 + Math.random() * 3,
      wx: TAU / (7 + Math.random() * 7), wy: TAU / (7 + Math.random() * 7),
      phx: Math.random() * TAU, phy: Math.random() * TAU,
      rotAmp: 2 + Math.random(), wr: TAU / (8 + Math.random() * 8), phr: Math.random() * TAU,
    };
  });

  // 色塊改黑（user 2026-09-04「原本 rgb 改成黑色」）：不再隨機三原色，chip 底色由 CSS 走 var(--theme-fg)。

  // 分層（cascade 順序 + 連綫父/子對應）
  const tier0 = [...root.querySelectorAll('.prog-top .prog-tilt')];                                                // DCD / BPAIDC
  const tier1 = [...root.querySelectorAll('.prog-children--root > .prog-node > .prog-row > .prog-box.prog-tilt')]; // BFA / MDES
  const tier2 = [...root.querySelectorAll('.prog-children--root .prog-children .prog-box.prog-tilt')];             // 動畫 / 創媒

  // ── 桌面：巢狀子列 absolute 脫流程 → 量子列高補回父節點 margin-bottom 撐開列高。手機清掉。──
  const nodesWithKids = [...root.querySelectorAll('.prog-node')].filter((n) => n.querySelector(':scope > .prog-children'));
  function reserveHeights() {
    nodesWithKids.forEach((n) => { n.style.marginBottom = ''; });
    if (window.innerWidth < 768) return;
    nodesWithKids.forEach((n) => {
      const kids = n.querySelector(':scope > .prog-children');
      const gap = parseFloat(getComputedStyle(kids).marginTop) || 0;
      n.style.marginBottom = `${Math.round(gap + kids.getBoundingClientRect().height)}px`;
    });
  }

  // ── 桌面：BFA/MDES 置中於 DCD chip 下方 → 兩條父→子斜綫等長（父點=DCD 中心、子點對稱）。
  //    fan 用 restRect 量中心（rotation 對 center 無感、扣掉進場/浮動位移）＝穩態落點。
  //    置中後整棵樹右移：取「nav 閃避」與「大螢幕想右移」較大者，兩者皆用 room 封頂＝任何寬度 BPAIDC 都不出視窗。 ──
  const RIGHT_MARGIN = 64;   // BPAIDC 右緣至少離視窗右緣的留白
  const WANT_SHIFT = 200;    // 大螢幕(≥1600)想把整棵樹往右移的量（user：大螢幕才右移、窄螢幕維持不裁）
  function layoutFan() {
    if (!rootChildren) return;
    rootChildren.style.marginLeft = '';
    if (progTree) progTree.style.transform = '';
    if (window.innerWidth < 768) return;   // 手機直向堆疊，不置中
    const dcd = tier0[0], bfa = tier1[0], mdes = tier1[1];
    if (!dcd || !bfa || !mdes) return;
    const cx = (el) => { const r = restRect(el); return r.left + r.width / 2; };
    rootChildren.style.marginLeft = `${(cx(dcd) - (cx(bfa) + cx(mdes)) / 2).toFixed(2)}px`;
    const bpaidc = tier0[1];
    if (!progTree || !bpaidc) return;
    // room＝BPAIDC 右緣還能往右移多少而不越過「視窗右緣−RIGHT_MARGIN」＝所有右移的封頂（保證不裁）
    const br = restRect(bpaidc);
    const room = Math.max(0, (window.innerWidth - RIGHT_MARGIN) - (br.left + br.width));
    // ① nav 閃避：tier2 左緣貼到左側 sticky nav → 右移讓開（room 內盡量）
    const nav = document.getElementById('anchor-nav');
    const limit = (nav ? nav.getBoundingClientRect().right : 0) + 16;
    const leftEdge = tier2.length ? Math.min(...tier2.map((b) => restRect(b).left)) : Infinity;
    const navPush = leftEdge < limit ? Math.min(limit - leftEdge, room) : 0;
    // ② 大螢幕才右移：≥1600 且有 room 才推（窄螢幕 room≈0 自動不動＝不裁）
    const wantPush = window.innerWidth >= 1600 ? Math.min(WANT_SHIFT, room) : 0;
    const push = Math.max(navPush, wantPush);
    if (push > 0) progTree.style.transform = `translateX(${push.toFixed(2)}px)`;
  }

  // ── 連綫：綁 parentBox/childBox，端點快取在 rest 位置（減掉 reveal translate）＋draw 進度 ──
  let lines = [];   // { el, parentBox, childBox, level, draw, sx, sy, ex, ey }
  let GAP = 14;
  function readGap() { GAP = parseFloat(getComputedStyle(root).getPropertyValue('--prog-line-gap')) || 14; }
  function buildLines() {
    if (!roots || !svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    lines = [];
    if (getComputedStyle(svg).display === 'none') return;   // 手機收起，不畫
    roots.querySelectorAll('.prog-children').forEach((container) => {
      const isRoot = container.classList.contains('prog-children--root');
      // root 層（DCD→BFA/MDES）：起點取「DCD 整條」（黑塊+色塊 .prog-titled）水平中心，非只色塊中心
      const parentBox = isRoot
        ? roots.querySelector('.prog-top .prog-titled')
        : container.parentElement.querySelector(':scope > .prog-row .prog-box');
      if (!parentBox) return;
      [...container.children].forEach((node) => {
        const childBox = node.classList?.contains('prog-node') && node.querySelector(':scope > .prog-row .prog-box');
        if (!childBox) return;
        const el = document.createElementNS(SVGNS, 'line');
        svg.appendChild(el);
        lines.push({ el, parentBox, childBox, parentTilt: parentBox.closest('.prog-tilt'), childTilt: childBox.closest('.prog-tilt'), level: isRoot ? 1 : 2, draw: willAnimate ? 0 : 1 });
      });
    });
  }

  // rest 矩形：減掉該 chip 當幀 reveal translate（進場滑移中也拿得到落點位置）
  function restRect(box) {
    const r = box.getBoundingClientRect();
    const [dx, dy] = parseTranslate(box.closest('.prog-tilt'));
    return { left: r.left - dx, top: r.top - dy, bottom: r.bottom - dy, width: r.width };
  }
  function cacheEndpoints() {
    if (!lines.length || !roots) return;
    const base = roots.getBoundingClientRect();
    lines.forEach((le) => {
      const pr = restRect(le.parentBox), cr = restRect(le.childBox);
      const x1 = pr.left + pr.width / 2 - base.left, y1 = pr.bottom - base.top;
      const x2 = cr.left + cr.width / 2 - base.left, y2 = cr.top - base.top;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const g = len > GAP * 2 + 2 ? GAP : 0;
      le.sx = x1 + ux * g; le.sy = y1 + uy * g; le.ex = x2 - ux * g; le.ey = y2 - uy * g;
    });
  }
  function drawLine(le) {
    if (le.sx == null) return;
    le.el.setAttribute('x1', le.sx.toFixed(1));
    le.el.setAttribute('y1', le.sy.toFixed(1));
    le.el.setAttribute('x2', (le.sx + (le.ex - le.sx) * le.draw).toFixed(1));
    le.el.setAttribute('y2', (le.sy + (le.ey - le.sy) * le.draw).toFixed(1));
  }
  const drawAll = () => lines.forEach(drawLine);

  // ── 進場後 floating：atlas 式 wobble（translate 由 rest 往外漂再回 + rotate 微擺）；連綫端點跟漂移偏移 ──
  // ponytail: 連續 rAF、不做離開視窗 pause（gate 會讓相位時鐘空轉→回捲時位置跳；~7 個合成元素成本可忽略、
  //           tab 隱藏 rAF 本就停、離頁 cleanup 停）。真要省電才上 atlas 的 tOffset 暫停補償。
  // 各元素 reveal 完各自接管 floating（不等整條 cascade）：chip 記 _floatReadyAt(秒)、綫記 _floatReady、link 用 linksReady。
  let floatRaf = 0, linksReady = false;
  const RAMP = 0.8;   // 漂移淡入秒數，避免接管瞬間（translate 0）跳到隨機相位
  function drawLineFloat(le) {
    if (le.sx == null) return;
    const pdx = le.parentTilt?._fdx || 0, pdy = le.parentTilt?._fdy || 0;
    const cdx = le.childTilt?._fdx || 0, cdy = le.childTilt?._fdy || 0;
    le.el.setAttribute('x1', (le.sx + pdx).toFixed(1));
    le.el.setAttribute('y1', (le.sy + pdy).toFixed(1));
    le.el.setAttribute('x2', (le.ex + cdx).toFixed(1));
    le.el.setAttribute('y2', (le.ey + cdy).toFixed(1));
  }
  function floatTick(nowMs) {
    floatRaf = requestAnimationFrame(floatTick);
    const now = nowMs / 1000;
    chips.forEach((box) => {
      if (!box._floatReadyAt) return;   // 尚未 reveal 完 → GSAP reveal / 隱藏態仍掌管，不接管
      const t = now - box._floatReadyAt;
      const ramp = Math.min(1, t / RAMP);
      const f = box._float;
      const dx = f.ax * Math.sin(f.wx * t + f.phx) * ramp;
      const dy = f.ay * Math.sin(f.wy * t + f.phy) * ramp;
      box._fdx = dx; box._fdy = dy;
      box.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
      box.style.transform = `rotate(${(box._baseRot + f.rotAmp * Math.sin(f.wr * t + f.phr) * ramp).toFixed(2)}deg)`;
    });
    if (desktop && links.length && linksReady) {   // 連結橫綫跟兩頂 chip 平均漂移（維持置中）
      const rdy = tier0.filter((c) => c._floatReadyAt);
      const ax = rdy.reduce((s, c) => s + (c._fdx || 0), 0) / (rdy.length || 1);
      const ay = rdy.reduce((s, c) => s + (c._fdy || 0), 0) / (rdy.length || 1);
      links.forEach((l) => { l.style.translate = `${ax.toFixed(2)}px ${ay.toFixed(2)}px`; });
    }
    lines.forEach((le) => { if (le._floatReady) drawLineFloat(le); });
  }
  function startFloat() {
    if (reduce || floatRaf) return;
    floatRaf = requestAnimationFrame(floatTick);
  }
  function stopFloat() { cancelAnimationFrame(floatRaf); floatRaf = 0; }

  // ── 進場：cascade（父 chip → 連結/連綫 → 子 chip → …）──
  let entered = false;
  function playEntrance() {
    if (entered) return;
    entered = true;
    if (!willAnimate) return;   // reduce / 無 gsap：init 已保持可見靜態
    startFloat();   // 迴圈先跑；各元素 reveal 完（下方 onComplete）才各自被接管漂移
    const lvl1 = lines.filter((l) => l.level === 1);
    const lvl2 = lines.filter((l) => l.level === 2);
    const tl = gsap.timeline();
    const revealTier = (tierChips, at) => tierChips.forEach((box, i) => {
      const from = navChipHidden(box, box._inDir);
      tl.fromTo(box,
        { clipPath: from.clipPath, translate: from.translate },
        { clipPath: NAV_CHIP_SHOWN.clipPath, translate: NAV_CHIP_SHOWN.translate, duration: 0.6, ease: 'power3.out',
          onComplete: () => { box._floatReadyAt = performance.now() / 1000; } },
        at + i * 0.12);
    });
    const drawLevel = (lvl, at) => lvl.forEach((le, i) =>
      tl.to(le, { draw: 1, duration: 0.55, ease: 'power2.out', onUpdate: () => drawLine(le), onComplete: () => { le._floatReady = true; } }, at + i * 0.1));

    revealTier(tier0, 0);
    if (desktop && links.length) tl.to(links, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.6, ease: 'power3.out', onComplete: () => { linksReady = true; } }, 0.25);
    drawLevel(lvl1, 0.5);
    revealTier(tier1, 0.75);
    drawLevel(lvl2, 1.05);
    revealTier(tier2, 1.3);
  }

  // ── 退場（離頁）：全部一起消失（不分梯次）；回傳 Promise 讓 router await ──
  function inView() {
    const r = root.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
  }
  registerPageExit(() => {
    stopFloat();   // 交還 translate/transform 給退場 tween，避免逐幀 loop 打架
    if (!willAnimate || !inView()) return Promise.resolve();
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      chips.forEach((box) => {
        const to = navChipHidden(box, rndDir());   // 方向仍各自隨機、但同時起收
        tl.to(box, { clipPath: to.clipPath, translate: to.translate, duration: 0.4, ease: 'power2.in' }, 0);
      });
      lines.forEach((le) => tl.to(le, { draw: 0, duration: 0.4, ease: 'power2.in', onUpdate: () => drawLine(le) }, 0));
      if (desktop && links.length) tl.to(links, { scaleX: 0, transformOrigin: '0% 50%', duration: 0.4, ease: 'power2.in' }, 0);
    });
  });

  // ── 量測 + 建綫（layout 就緒後）；藏起初態；字體 / resize 重量重畫 ──
  readGap();
  reserveHeights();
  layoutFan();
  buildLines();
  cacheEndpoints();
  if (willAnimate) {
    chips.forEach((box) => { const h = navChipHidden(box, box._inDir); box.style.clipPath = h.clipPath; box.style.translate = h.translate; });
  }
  drawAll();
  requestAnimationFrame(() => { reserveHeights(); layoutFan(); cacheEndpoints(); drawAll(); });
  if (document.fonts?.ready) document.fonts.ready.then(() => { reserveHeights(); layoutFan(); cacheEndpoints(); drawAll(); });
  let raf = 0;
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { readGap(); reserveHeights(); layoutFan(); cacheEndpoints(); drawAll(); }); };
  window.addEventListener('resize', onResize);

  // 進入視窗才觸發進場（once）
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) playEntrance();
  }, { threshold: 0.15 });
  io.observe(root);

  registerPageCleanup(() => {
    io.disconnect();
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(raf);
    stopFloat();
  });
}
