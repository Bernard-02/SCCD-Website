import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { registerPageExit } from '../../ui/page-exit.js';

/**
 * About 浮動 RGB 多邊形層（取代舊封鎖綫）
 *
 * - 三個形狀一色一個（綠/粉/藍），滿版 fixed SVG 疊層；形狀=3~8 邊多邊形或圓（1/4 機率）
 * - mode1 multiply / mode2 screen：交疊處自然混色（pathfinder 觀感）——blend 規則在 input.css
 * - mode3 XOR 填色（2026-08-11 由 stroke 線框改）：每形實心填 --theme-fg（依 bg 亮度翻黑白），
 *   mask 減去另外兩形 → 交疊區透明、透出背景色；分開即還原
 * - 漂浮：heading 隨 sin 緩慢轉向 → 曲線路徑
 * - 反彈：形狀「中點」碰到視窗邊界就反射 heading 彈回（不 wrap、不從對側進來）
 * - section / division tab 切換（anchornav:active）→ 邊數/大小 morph + 移動方向隨機重擲
 */

const COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
// 幾何用 <path> 8 段三次貝茲（不是 polygon）：圓＝標準 kappa 弧＝**真圓**（user 2026-08-10
// 打回 24 邊形近似圓）；多邊形＝直線段（控制點取弦上 1/3、2/3 共線）。段數固定 → d 字串
// 數字個數恆定（2+8×6=50），GSAP attr tween 才能圓↔多邊形互 morph
const SEGS = 8;
const KAPPA = (4 / 3) * Math.tan(Math.PI / (2 * SEGS)); // 45° 弧控制點距 ≈ 0.2652R
const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

const f = (n) => n.toFixed(1);

// sides 邊形（中心 0,0；角度/半徑抖動讓形狀不規則）；sides=0 代表真圓。回傳 8 段貝茲的 d 字串
function genShapeD(sides, R) {
  /** @type {{p:[number,number], c1:[number,number], c2:[number,number]}[]} 每段的終點與兩控制點（起點=上一段終點） */
  const segs = [];
  if (!sides) {
    const r = R * 0.92;
    for (let i = 0; i < SEGS; i++) {
      const a0 = (i / SEGS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGS) * Math.PI * 2;
      segs.push({
        c1: [Math.cos(a0) * r - Math.sin(a0) * KAPPA * r, Math.sin(a0) * r + Math.cos(a0) * KAPPA * r],
        c2: [Math.cos(a1) * r + Math.sin(a1) * KAPPA * r, Math.sin(a1) * r - Math.cos(a1) * KAPPA * r],
        p:  [Math.cos(a1) * r, Math.sin(a1) * r],
      });
    }
  } else {
    const verts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / sides);
      const r = R * (0.72 + Math.random() * 0.28);
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const at = (i) => verts[Math.floor((i * sides) / SEGS) % sides];
    for (let i = 0; i < SEGS; i++) {
      const a = at(i), b = at(i + 1);
      segs.push({
        c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
        c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3],
        p:  b,
      });
    }
  }
  const start = segs[SEGS - 1].p;
  return `M ${f(start[0])} ${f(start[1])} ` +
    segs.map(s => `C ${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`).join(' ') + ' Z';
}

// 每輪各自隨機抽 {圓,3~8邊}：允許兩個同形，只擋「三個全同」（user 2026-08-10 四調放寬）
const SHAPE_POOL = [0, 3, 4, 5, 6, 7, 8];
function drawShapes() {
  const pick = () => SHAPE_POOL[Math.floor(Math.random() * SHAPE_POOL.length)];
  const s = [pick(), pick(), pick()];
  while (s[0] === s[1] && s[1] === s[2]) s[2] = pick();
  return s;
}

export function initAboutPolygons() {
  const host = document.getElementById('about-polys');
  if (!host || typeof gsap === 'undefined') return;

  // --- DOM：svg0 放共用 defs（幾何 + mask）與 mode3 XOR 層，三個 svg 各放一個 fill（各自成 blend 層）---
  const svgs = COLORS.map(() => el('svg'));
  const defs = el('defs');
  svgs[0].appendChild(defs);
  const polys = COLORS.map((_, i) => el('path', { id: `about-pg${i}` }));
  polys.forEach(p => defs.appendChild(p));
  COLORS.forEach((_, i) => {
    // mask = 全白 - 另外兩形：mode3 XOR 填色用——交疊處被雙方互減 → 透明透出背景
    const mask = el('mask', { id: `about-pm${i}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: '100%', height: '100%' });
    mask.appendChild(el('rect', { width: '100%', height: '100%', fill: '#fff' }));
    COLORS.forEach((_, j) => {
      if (j === i) return;
      mask.appendChild(el('use', { href: `#about-pg${j}`, fill: '#000' }));
    });
    defs.appendChild(mask);
  });
  COLORS.forEach((color, i) => {
    svgs[i].appendChild(el('use', { href: `#about-pg${i}`, class: 'poly-fill', fill: color }));
  });
  // mode3 XOR 層：每形實心填 --theme-fg、mask 挖掉與他形重疊處 → 交疊區透明透出背景色
  const xor = el('g', { class: 'poly-xor' });
  COLORS.forEach((_, i) => {
    xor.appendChild(el('use', { href: `#about-pg${i}`, mask: `url(#about-pm${i})` }));
  });
  svgs[0].appendChild(xor);
  svgs.forEach(s => host.appendChild(s));

  // --- 狀態：出生點聚在畫面中央附近，確保初始就互相疊加 ---
  // baseR 0.43×短邊（頂點半徑 0.72~1.0R）：三形合計約占畫面七成（user 2026-08-10 二調「到 70%」）
  const baseR = Math.min(window.innerWidth, window.innerHeight) * 0.43;
  const initSides = drawShapes();
  const shapes = polys.map((polyEl, i) => {
    const R = baseR * (0.85 + Math.random() * 0.35);
    polyEl.setAttribute('d', genShapeD(initSides[i], R));
    const a0 = Math.random() * Math.PI * 2;
    return {
      el: polyEl,
      R,
      sides: initSides[i],
      ax: Math.cos(a0) * R * 0.85, // 縮放錨點（形狀的「一個角」）：gate 收展與換形都從這個角縮/長
      ay: Math.sin(a0) * R * 0.85,
      x: window.innerWidth / 2 + (Math.random() - 0.5) * R * 1.6,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * R * 1.6,
      heading: Math.random() * Math.PI * 2,
      speed: 18 + Math.random() * 14,        // px/s，緩慢
      turnAmp: 0.15 + Math.random() * 0.2,   // rad/s：sin 擺動轉向 → 非直綫路徑
      turnFreq: 0.1 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * 360,
      spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4), // deg/s
      scale: 1,
      gate: 0, // 進出場縮放乘數（0=收起、1=全尺寸），與 morph 的 scale 分開管
    };
  });

  // @ts-ignore - console 調參/診斷用（同 SCCD_* 慣例）；離頁隨 module state 丟棄
  window.SCCD_aboutPolys = shapes;

  // 重擲縮放錨點＝形狀邊緣上的隨機一角（每次收合/換形前呼叫，讓縮放的角不固定）
  const pickAnchor = (s) => {
    const a = Math.random() * Math.PI * 2;
    s.ax = Math.cos(a) * s.R * 0.85;
    s.ay = Math.sin(a) * s.R * 0.85;
  };

  // 從 Vision 才出現：hero 屏無多邊形（user 2026-08-10）。進出場從各形的隨機一角 scale
  // （user：opacity 突兀→scale；再改角錨點）+ 小 stagger。
  // 退場＝進場的嚴格鏡像：同 0.9s、反向 stagger、power3.in、收回「長出時的同一個角」。
  // 用單一 timeline 管 gate：翻向時 kill 舊 timeline 重建——舊版「散裝 tween + delay」在快速
  // 往返時，還在 delay 中的舊 tween 會晚於新 tween 啟動把它 overwrite 掉，造成單形卡錯態。
  // 錨點只在「完全收合時」重擲：顯示中改錨點＝transform 立即跳位。
  let gateTl = null;
  let gateShownAt = 0;
  const setGate = (open) => {
    if (gateTl) gateTl.kill();
    gateTl = gsap.timeline();
    const order = open ? shapes : [...shapes].reverse();
    order.forEach((s, i) => {
      if (open && s.gate < 0.05) pickAnchor(s);
      gateTl.to(s, { gate: open ? 1 : 0, duration: 0.9, ease: open ? 'power3.out' : 'power3.in' }, i * 0.08);
    });
    if (open) gateShownAt = performance.now();
  };
  const show = () => setGate(true);
  const hide = () => setGate(false);
  // 顯隱不走 ScrollTrigger callback（refresh / 瞬跳時序下 onEnter/onLeaveBack 會互踩；
  // 且 end:'max' 在捲到頁面最底時會被判離開區間 → 頁尾憑空消失，實測踩過的 bug），
  // 改在 ticker 每幀量 overview 位置判定。三區（user 2026-08-11 七調「上行時 vision 就收、
  // 進場的鏡像」）：
  //   top ≤ 0 → 恆顯示（vision 頂還在視窗上緣之上＝還在讀 vision 內文，上滾不誤收）
  //   top ≥ 80%vh → 恆隱藏（hero）
  //   0~80%vh 過渡帶 → 看使用者輸入方向：下行=長出（vision 露 20% 即出）、上行=收合。
  //   t>0 代表 vision 頂已完整露出、上方開始透出 hero——此時上滾只可能是要回 hero
  //   （上面沒有 vision 內容），所以 vision 一離頂就開始收＝進場的鏡像
  //   ⚠️ 上行收合改「綁位置 scrub」不用固定時長 tween（見下 updateGate）——固定 0.9s 追不上快速/snap 上滑會疊 hero SCCD
  // ⚠️ 方向只讀 wheel/touch（不從 scrollY 差分推——proximity snap 停手回拉會翻假方向，踩過）
  const overview = document.getElementById('overview');
  let gateShown = false;
  let exiting = false; // 頁面退場中：updateGate 停手，收起動畫不被判定翻回來
  let lastDir = 1;
  const onWheel = (e) => { if (e.deltaY) lastDir = e.deltaY > 0 ? 1 : -1; };
  let touchY = 0;
  const onTouchStart = (e) => { touchY = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    const ty = e.touches[0].clientY;
    if (Math.abs(ty - touchY) > 4) { lastDir = ty < touchY ? 1 : -1; touchY = ty; }
  };
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  registerPageCleanup(() => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
  });
  // 上行往 hero 收合＝「綁捲動位置 scrub」而非固定時長 tween：固定 0.9s tween 追不上快速/snap 上滑
  // （實測 snap 時 hero 23ms 到位、gate 卻要 ~1058ms 才歸零 → 多邊形全尺寸疊在 SCCD 上約 1s）。
  // t>0 且上行時把 gate 直接綁 overview.top、在 SCCD 露臉前線性收完 → snap=瞬收、慢捲=漸縮，任何捲速零重疊。
  const HIDE_SCRUB_END = 0.4; // gate 歸零的位置（×vh）：收在 hero SCCD 明顯露臉之前（可調）
  let scrubbing = false;
  const updateGate = () => {
    if (exiting) return;
    if (!overview) { if (!gateShown) { gateShown = true; show(); } return; }
    const t = overview.getBoundingClientRect().top;
    const vh = window.innerHeight;
    // 離開 Vision 頂（t>0）且上行 → scrub：gate 隨位置線性收（snap 一次跳過整段也會被 clamp 成 0＝瞬收）
    if (t > 0 && lastDir < 0) {
      if (!scrubbing) { scrubbing = true; if (gateTl) { gateTl.kill(); gateTl = null; } } // kill：別跟每幀直寫 gate 打架
      const end = HIDE_SCRUB_END * vh;
      const g = Math.min(Math.max((end - t) / end, 0), 1);
      shapes.forEach(s => { s.gate = g; });
      gateShown = false; // 反轉下行時才重新 setGate(true) 走 staggered 進場 tween
      return;
    }
    scrubbing = false;
    const want = t <= 0 ? true : t >= 0.8 * vh ? false : lastDir > 0;
    if (want !== gateShown) { gateShown = want; want ? show() : hide(); }
  };

  const tick = (time, deltaMS) => {
    const dt = Math.min(deltaMS, 100) / 1000; // 分頁喚醒的大 delta 夾住，免瞬移
    updateGate();
    const W = window.innerWidth, H = window.innerHeight;
    shapes.forEach(s => {
      s.heading += Math.sin(time * s.turnFreq * Math.PI * 2 + s.phase) * s.turnAmp * dt;
      s.x += Math.cos(s.heading) * s.speed * dt;
      s.y += Math.sin(s.heading) * s.speed * dt;
      s.rot += s.spin * dt;
      // 反彈：形狀「中點」(x,y) 碰視窗邊界就反射 heading（不再 wrap）。撞左右牆 heading→π−heading
      // （翻 cos＝x 分量），撞上下牆 heading→−heading（翻 sin＝y 分量）；位置夾回界內，下一幀朝內移不卡牆。
      // 形狀比視窗大＝中點貼邊時半個形狀已滑出視窗（SVG 裁掉）再彈回 → 反彈感不明顯（user 要的）。
      if (s.x < 0)      { s.x = 0; s.heading = Math.PI - s.heading; }
      else if (s.x > W) { s.x = W; s.heading = Math.PI - s.heading; }
      if (s.y < 0)      { s.y = 0; s.heading = -s.heading; }
      else if (s.y > H) { s.y = H; s.heading = -s.heading; }
      // 縮放錨在 (ax,ay)＝形狀的一個角：收合/長出/換形都從那個角縮放（k=1 時錨點無感）
      const k = s.scale * s.gate;
      s.el.setAttribute('transform',
        `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(2)})` +
        ` translate(${s.ax.toFixed(1)} ${s.ay.toFixed(1)}) scale(${k.toFixed(3)}) translate(${(-s.ax).toFixed(1)} ${(-s.ay).toFixed(1)})`);
    });
  };
  gsap.ticker.add(tick);
  registerPageCleanup(() => gsap.ticker.remove(tick));

  // --- section / division tab 切換 morph：換形（含真圓）+ 縮放 + 移動方向隨機重擲 ---
  const initTs = performance.now();
  let lastId = null;
  let lastMorphTs = 0;
  const onAnchor = (/** @type {CustomEvent} */ e) => {
    const id = e.detail?.id;
    const isClick = !!e.detail?.click;
    const now = performance.now();
    // 只記錄不 morph 的情況：載入 600ms 內的自動 activation；隱藏中（hero）；首次 activation
    // 與 gate 進場後 1s 內——hero→vision 的第一發 spy activation 是「進場」不是「切換」，
    // 跟 gate 長出動畫疊起來會看到連續變形兩次（user 2026-08-10 回報）
    if (now - initTs < 600 || !gateShown || lastId === null || now - gateShownAt < 1000) { lastId = id; return; }
    if (!isClick && id === lastId) return;
    lastId = id;
    // 點擊每次都 morph（user：連點 section 第二次也要換）；scroll-spy 連環 activation
    // （快速捲過多個 section）1.2s 內只變形一次
    if (!isClick && now - lastMorphTs < 1200) return;
    lastMorphTs = now;
    // 換形＝直接 d 漸變（1.0s；user：不要縮小再放大）。純多邊形間的線性漸變全程保直邊
    // （直邊控制點是端點的仿射組合，lerp 後仍在弦上）；只有圓參與的過渡會出現弧線——
    // 那是「正在變成圓」本身。大小同步單向 tween 到新目標，無縮放低谷
    const nextSides = drawShapes();
    shapes.forEach((s, i) => {
      s.sides = nextSides[i];
      gsap.to(s.el, { attr: { d: genShapeD(nextSides[i], s.R) }, duration: 1.0, ease: 'power2.inOut', overwrite: 'auto' });
      gsap.to(s, { scale: 0.7 + Math.random() * 0.7, duration: 1.0, ease: 'power2.inOut', overwrite: 'auto' });
      s.heading = Math.random() * Math.PI * 2; // 方向隨機重擲（user 2026-08-10）
      s.speed = 18 + Math.random() * 14;
    });
  };
  document.addEventListener('anchornav:active', onAnchor);
  registerPageCleanup(() => document.removeEventListener('anchornav:active', onAnchor));

  // --- SPA 換頁：先播收起動畫再讓 router 換內容（user 2026-08-10）。
  // exiting 旗標擋住 updateGate（gateShown 翻 false 後深區判定會馬上又 show 回來）---
  registerPageExit(() => new Promise(resolve => {
    if (!gateShown) { resolve(); return; }
    exiting = true;
    gateShown = false;
    hide();
    // hide 總長 = 0.9s + 反向 stagger 2×0.08 ≈ 1.06s
    gsap.delayedCall(1.1, resolve);
  }));
}
