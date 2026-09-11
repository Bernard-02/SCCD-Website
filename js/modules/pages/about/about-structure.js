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
import { navChipHidden, NAV_CHIP_SHOWN, pickNavDir } from '../../ui/scroll-animate.js';
import { loadProgramNodes } from './program-nodes-source.js';
import { loadUiLabels } from '../../ui/ui-labels.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const rndRot = () => (window.SCCDHelpers?.getRandomRotation?.() ?? ((Math.round(Math.random() * 6 - 3)) || 2));
const DIRS = ['top', 'bottom', 'left', 'right'];
const rndDir = () => DIRS[Math.floor(Math.random() * 4)];
const parseTranslate = (el) => {
  const m = (el?.style.translate || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  return m ? [+m[1], +m[2]] : [0, 0];
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// labelKey → 每盒 max-width 微調 class（CSS 對特定文字長度調斷行寬，見 about-structure.css）；
// 純視覺 tuning、與文字綁定；新節點無對應 class＝吃預設 --prog-chip-max。
const BOX_MOD = {
  'about.program.dcd': 'prog-box--dcd',
  'about.program.bpaidc': 'prog-box--bpaidc',
  'about.group.bfa': 'prog-box--bfa',   // 手機斷行用（09-10「Art (BFA) 整組下第二行」）；桌面無對應規則零影響
  'about.program.animation': 'prog-box--animation',
  'about.program.creative-media': 'prog-box--cm',
};

// ── 從後台 program_nodes render tree HTML（結構同原硬編、供既有互動邏輯沿用）──
// 樹名走 program_nodes.nameEn/nameZh（獨立於下方 division nav 的 ui_labels，2026-09-11 解耦）；空才退回 ui_labels。
// ⚠️ 不掛 data-label-key＝applyUiLabels 不會覆寫樹名（decouple 的關鍵）；labelKey 只在 JS 端用於 degree/BOX_MOD 對照。
function boxHtml(node, labels, tilt, extra = '') {
  const row = labels[node.labelKey] || {};
  const en = node.nameEn || row.en || '';
  const zh = node.nameZh || row.zh || '';
  const mod = BOX_MOD[node.labelKey] ? ' ' + BOX_MOD[node.labelKey] : '';
  const div = node.divisionKey ? ` data-division="${esc(node.divisionKey)}"` : '';
  return `<div class="prog-box${tilt ? ' prog-tilt' : ''}${extra ? ' ' + extra : ''}${mod}" data-node-id="${esc(node.id)}"${div}>`
    + `<span class="prog-box-en">${esc(en)}</span>`
    + `<span class="prog-box-zh" lang="zh-Hant">${esc(zh)}</span>`
    + `</div>`;
}
function nodeHtml(node, childrenOf, labels) {
  const kids = childrenOf(node.id);
  const kidsHtml = kids.length ? `<div class="prog-children">${kids.map((k) => nodeHtml(k, childrenOf, labels)).join('')}</div>` : '';
  return `<div class="prog-node"><div class="prog-row">${boxHtml(node, labels, true)}</div>${kidsHtml}</div>`;
}
// 頂層黑底標準字塊：只在「有實際 wordmark 圖」時畫——上傳檔優先；無檔但 wordmark=sccd → 本地 SCCD svg（CSS 預設 mask）。
// 其餘（如 scaidc 尚無真 logo）整塊不畫（user 2026-09-11：沒上傳 logo 就不渲染那區塊，別借 SCCD 占位）。
function acronymHtml(node) {
  if (!node.wordmarkUrl && node.wordmark !== 'sccd') return '';
  const style = node.wordmarkUrl
    ? ` style="-webkit-mask-image:url('${esc(node.wordmarkUrl)}');mask-image:url('${esc(node.wordmarkUrl)}')"`
    : '';
  return `<span class="prog-acronym"><span class="prog-acronym-mark"${style}></span></span>`;
}
function renderTree(nodes, labels) {
  const byParent = new Map();
  nodes.forEach((n) => { const p = n.parent || null; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(n); });
  const childrenOf = (id) => (byParent.get(id) || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const roots = childrenOf(null);
  // 頂列：各 root 一條 .prog-titled（有 wordmark 才加黑底標準字塊）；root 之間插 .prog-seg--link
  // 頂 chip 色塊掛 .seam-guard：titled 黑 backstop 在 hover 上色時會漏 1px 暗縫（房規，見 input.css utilities）
  const top = roots.map((r) => `<div class="prog-titled prog-tilt">${acronymHtml(r)}${boxHtml(r, labels, false, 'seam-guard')}</div>`)
    .join('<div class="prog-seg prog-seg--link"></div>');
  // 子樹掛在「有子的第一個 root」下方（現況 DCD；BPAIDC 無子）＝.prog-children--root 的定位對象
  const rootWithKids = roots.find((r) => childrenOf(r.id).length);
  const rootChildrenHtml = rootWithKids
    ? `<div class="prog-children prog-children--root">${childrenOf(rootWithKids.id).map((k) => nodeHtml(k, childrenOf, labels)).join('')}</div>`
    : '';
  return '<svg class="prog-lines" aria-hidden="true"></svg>'
    + `<div class="prog-top">${top}</div>`
    + rootChildrenHtml;
}

export async function initProgramStructure() {
  const root = document.getElementById('program-structure');
  if (!root) return;
  const roots = root.querySelector('.prog-roots');
  const progTree = root.querySelector('.prog-tree');
  if (!roots) return;

  // 不吃硬編：從後台 program_nodes（自我參照 parent 表層級）+ ui_labels（文字）動態 render tree
  const [nodeList, labels] = await Promise.all([loadProgramNodes(), loadUiLabels()]);
  if (!root.isConnected || !Array.isArray(nodeList) || !nodeList.length) return;   // await 期間離頁 / 無資料則不動
  roots.innerHTML = renderTree(nodeList, labels);

  const svg = root.querySelector('.prog-lines');
  const rootChildren = root.querySelector('.prog-children--root');
  const desktop = window.innerWidth >= 768;
  const hasGsap = typeof gsap !== 'undefined';
  const reduce = prefersReducedMotion();
  const willAnimate = hasGsap && !reduce;

  // ── 連結橫綫：隨機微旋轉（個別 rotate，讓 scale 用 transform 疊加）＋進場前藏 ──
  // 手機（2026-09-10 mockup）連結段是直向短棒 → 進退場軸改 scaleY 從頂端拉長；桌面維持 scaleX。
  const links = [...root.querySelectorAll('.prog-seg--link')];
  const linkHidden = desktop ? { scaleX: 0, transformOrigin: '0% 50%' } : { scaleY: 0, transformOrigin: '50% 0%' };
  const linkShown = desktop ? { scaleX: 1, transformOrigin: '0% 50%' } : { scaleY: 1, transformOrigin: '50% 0%' };
  root.querySelectorAll('.prog-seg').forEach((seg) => {
    // 手機連結段＝左側長直綫（layoutMobileLink 量測）：不轉——±2.5° 在 ~500px 長度上位移 20px+ 會壓到卡
    if (!desktop && seg.classList.contains('prog-seg--link')) { seg.style.rotate = '0deg'; return; }
    seg.style.rotate = `${((Math.random() * 2 - 1) * 2.5).toFixed(2)}deg`;
  });
  if (willAnimate && links.length) gsap.set(links, linkHidden);

  // ── chips：旋轉走 transform:rotate（navChipHidden 讀它）＋各自隨機進場方向 + atlas 式浮動設定 ──
  const chips = [...root.querySelectorAll('.prog-tilt')];
  chips.forEach((box) => {
    box._baseRot = rndRot();
    box.style.transform = `rotate(${box._baseRot}deg)`;
    box._inDir = pickNavDir(box);   // 沿短邊（寬卡取 top/bottom）：4 向 random 抽到 left/right 會滑整個寬度「從左飛進來」（MDES 最明顯，user 2026-09-10；同 legend/pickNavDir 既有慣例）
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
  // 點擊 tree 捲到 division 內容的效果已移除（user 2026-09-09）：chip 純 hover 互動、不再導覽。

  // ── hover 上色（lineage 模型）：hover 一顆 chip → 該 chip + **所有母層(祖先)＋所有子層(子孫)** 同色，並展開右下說明卡「對應 degree」的 Term+Degree bar。
  //   顏色由「該 chip 所屬 degree」決定（bfa/mdes/bdes 各一色，每次進頁洗牌），tree 與說明卡 bar 同色；
  //   degree 走 labelKey 對照往上找第一個 degree 祖先（CMS id 是 UUID、labelKey 才跨 CMS/fallback 穩定）。
  //   hover 動畫/創媒/BFA → 展開 BFA 期程+學位；碩士 → MDes；BPAIDC → BDes；SCCD(dcd，無 degree) → tree 仍上色（隨機）但不展開任何 bar。
  //   說明卡平常只留 title 殼（Term 期程 / Degree 學位），hover 才展開內容（user 2026-09-11）；層級由 NODES 的 parent 定義（後台 program_nodes）。
  const ACCENT = ['#00FF80', '#FF448A', '#26BCFF'];
  const rndAccent = () => ACCENT[Math.floor(Math.random() * ACCENT.length)];
  const DEGREE_BY_LABELKEY = { 'about.group.bfa': 'bfa', 'about.program.mdes': 'mdes', 'about.program.bpaidc': 'bdes' };
  // degree↔色不固定 rgb 順序、每次進頁洗牌（user 09-10）；同一次瀏覽內三 degree 仍各自穩定一色（hover/tap/legend 共用此 map）
  const shuffledAccent = [...ACCENT].sort(() => Math.random() - 0.5);
  const DEGREE_COLOR = { bfa: shuffledAccent[0], mdes: shuffledAccent[1], bdes: shuffledAccent[2] };
  // Term 期程 bar：從 program_nodes 的 termEn/termZh（掛在 degree 節點）建，依 degree key（bfa/mdes/bdes）；
  // 空＝不建（該 degree hover 時只展開 Degree bar）。degree 名硬編在 about.html（要 CMS 化再接 ui_labels）。
  const termBox = root.querySelector('.prog-legend--term .prog-legend-bars');
  if (termBox) {
    const termByDeg = {};
    nodeList.forEach((n) => { const d = DEGREE_BY_LABELKEY[n.labelKey]; if (d && (n.termEn || n.termZh)) termByDeg[d] = { en: n.termEn || '', zh: n.termZh || '' }; });
    termBox.innerHTML = ['bfa', 'mdes', 'bdes'].filter((d) => termByDeg[d]).map((d) =>
      `<div class="prog-legend-bar seam-guard" data-degree="${d}"><span class="prog-legend-en">${esc(termByDeg[d].en)}</span><span class="prog-legend-zh" lang="zh-Hant">${esc(termByDeg[d].zh)}</span></div>`
    ).join('');
  }
  // legendBars[deg] = 該 degree 的所有 bar（term 段 + degree 段各一）：hover/tap 對應 degree 時一起展開＋上色
  const legendBars = {};
  root.querySelectorAll('.prog-legend-bar').forEach((el) => { (legendBars[el.dataset.degree] = legendBars[el.dataset.degree] || []).push(el); });
  // Term / Degree 是兩張獨立說明卡（user 2026-09-11：各自旋轉、桌面上下堆疊）；各自 clip-reveal + rndRot。
  const legendEls = [...root.querySelectorAll('.prog-legend')];
  // 旋轉走 transform:rotate（navChipHidden 讀它算旋轉後位移向量），非個別 rotate 屬性——否則 clip-reveal 位移不跟角度轉；
  // 手機不轉（mockup 是水平整條）。各卡記自己的進場方向 _dir（沿短邊）。
  legendEls.forEach((el) => {
    el.style.transform = `rotate(${desktop ? rndRot() : 0}deg)`;
    el._dir = pickNavDir(el);
  });
  // ── 說明卡 clip-reveal（比照 tree chip）：absolute stack 掛在 section 內＝往下捲跟頁面 flow 一起離開；
  //    進場排在 cascade 尾端（playEntrance）、SPA 離頁跟 chips 同拍 clip 收（registerPageExit）。──
  function hideLegendInit() {   // init：藏成 clip-reveal 起態（可見但被 clip 裁掉），避免 async render 後、進場前閃現
    legendEls.forEach((el) => {
      if (willAnimate) { const h = navChipHidden(el, el._dir); el.style.clipPath = h.clipPath; el.style.translate = h.translate; }
      el.style.visibility = 'visible';   // reduce/無 gsap：in-flow 靜態直接可見（捲動物理帶走，無 fixed 外溢問題）
    });
  }
  // NODES 由後台資料建（id → {parent, labelKey, el}）：層級全走 program_nodes 的 parent，不再硬編選擇器
  const NODES = {};
  nodeList.forEach((n) => { NODES[n.id] = { parent: n.parent || null, labelKey: n.labelKey, el: null }; });
  roots.querySelectorAll('.prog-box[data-node-id]').forEach((el) => {
    const id = el.getAttribute('data-node-id');
    if (NODES[id]) NODES[id].el = el;
  });
  // 往上（含自身）找第一個 degree 節點；dcd/SCCD 找不到＝null（→ 不展開任何 bar）
  function degreeOf(id) {
    for (let p = id; p && NODES[p]; p = NODES[p].parent) {
      const d = DEGREE_BY_LABELKEY[NODES[p].labelKey];
      if (d) return d;
    }
    return null;
  }
  // hover 上色：mode3 無 rgb（user 2026-09-10）→ 改翻反色（fg-inverse 底＋fg 字，strict B/W）；mode1/2 用 degree 色。
  //   inline setProperty('important') 是必要的：mode3 rest 規則 `#program-structure .prog-box{background:var(--theme-fg)!important}`
  //   會壓死一般 inline（inline important > stylesheet important；var() 值照樣跟 hue 亮暗即時翻）
  const paint = (el, color) => {
    const bw = document.body.classList.contains('mode-color');
    el.style.setProperty('background', bw ? 'var(--theme-fg-inverse)' : color, 'important');
    el.style.setProperty('color', bw ? 'var(--theme-fg)' : '#000', 'important');
  };
  const unpaint = (el) => { el.style.removeProperty('background'); el.style.removeProperty('color'); };
  // 展開/收起「對應 degree」的 term+degree bar：由上往下推出＝GSAP 開合 height 0↔auto（overflow:hidden，
  //   比照 activities accordion，user 2026-09-11）。平常 bar display:none（不占寬、卡貼 title 殼），
  //   hover/tap 該 degree 才展開內容。⚠️ height 由 GSAP 每幀寫、CSS 不掛 transition:height（免雙重平滑 lag）。
  const LEG_DUR = 0.42;   // ≈ --dur-base，對齊 accordion 開合手感
  function openBar(el, color) {
    el.classList.add('is-open');
    paint(el, color);
    el.style.display = 'flex';
    if (!willAnimate) { el.style.height = ''; return; }
    gsap.killTweensOf(el);
    gsap.fromTo(el, { height: 0 }, { height: 'auto', duration: LEG_DUR, ease: 'power2.out', onComplete: () => { el.style.height = ''; } });
  }
  function closeBar(el, onDone) {
    el.classList.remove('is-open');
    if (!willAnimate) { el.style.display = 'none'; unpaint(el); if (onDone) onDone(); return; }
    gsap.killTweensOf(el);
    gsap.to(el, { height: 0, duration: LEG_DUR, ease: 'power2.in', onComplete: () => { el.style.display = 'none'; el.style.height = ''; unpaint(el); if (onDone) onDone(); } });
  }
  // ── 說明卡顯示協調（user 2026-09-11，比照 atlas hover 卡判斷）──
  //  ① 連續 hover「同一 degree」（＝同內容）→ 不收不開（legendDeg 相同 no-op），免收起再打開的閃爍。
  //  ② hover「不同 degree」→ 先收上一個、收完才開下一個（避免兩卡寬度不同時同時開合＝跳兩次）。
  //  legend 只顯示真 degree（bfa/mdes/bdes）；SCCD 無 degree → showLegend(null)＝收起。
  let legendDeg = null;   // 目前顯示的 degree（null＝收起）
  function openDeg(deg) { if (deg) (legendBars[deg] || []).forEach((el) => openBar(el, DEGREE_COLOR[deg])); }
  function closeDeg(deg, onDone) {
    const els = (deg && legendBars[deg]) || [];
    if (!els.length) { if (onDone) onDone(); return; }
    let n = els.length;
    els.forEach((el) => closeBar(el, () => { if (--n === 0 && onDone) onDone(); }));
  }
  function showLegend(deg) {
    if (deg === legendDeg) return;              // 同內容：不收不開
    const prev = legendDeg;
    legendDeg = deg;
    if (!prev) { openDeg(deg); return; }        // 沒開過 → 直接開（deg=null 則 no-op）
    closeDeg(prev, () => { if (legendDeg === deg) openDeg(deg); });  // 先收前一個、收完開下一個（期間又切走則不開）
  }
  // 只重畫已展開 bar 的顏色（不重播開合動畫）：給 mode 切換重畫用（見 onThemeChanged）
  const repaintBars = (deg, color) => (legendBars[deg] || []).forEach((el) => { if (el.classList.contains('is-open')) paint(el, color); });
  function lineage(id) {
    const ids = new Set([id]);
    for (let p = NODES[id].parent; p && NODES[p]; p = NODES[p].parent) ids.add(p);          // 祖先鏈（NODES[p] 守衛防 stale parent）
    const stack = [id];
    while (stack.length) {
      const n = stack.pop();
      Object.keys(NODES).forEach((k) => { if (NODES[k].parent === n && !ids.has(k)) { ids.add(k); stack.push(k); } });  // 子孫
    }
    return [...ids].map((k) => NODES[k].el).filter(Boolean);
  }
  // hover 定住（像 atlas）：_hold 0→1 平滑 tween，floatTick 每幀乘 (1-_hold)＝角度回正＋位移停在 rest；
  //   放開 tween 回 0＝float 續飄（時間軸沒停＝無相位跳）。目標＝該色塊所屬 .prog-tilt（頂層＝整條 .prog-titled）。
  function setHold(chip, target) {
    if (!chip || typeof gsap === 'undefined') return;
    const proxy = chip._holdProxy || (chip._holdProxy = { v: chip._hold || 0 });
    gsap.killTweensOf(proxy);
    gsap.to(proxy, { v: target, duration: 0.32, ease: 'power2.out', onUpdate: () => { chip._hold = proxy.v; } });
  }
  if (window.matchMedia('(hover: hover)').matches) {
    // 說明卡收起排 grace timer（③）：移到別顆 chip 會被下個 mouseenter 取消 → 同 degree 不收（①）、不同 degree 走 showLegend 先收後開（②）。
    // tree lineage 上色與 setHold 仍每顆即時（各節點 lineage 不同、視覺照舊）；只有右下說明卡走 degree 協調。
    let legLeaveTimer = 0;
    Object.entries(NODES).forEach(([id, node]) => {
      if (!node.el) return;
      // 頂層 DCD/BPAIDC 的 hover 目標＝整條 .prog-titled（含 SCCD 標準字皆可觸發）；子層＝色塊本身
      const unit = node.parent === null ? (node.el.closest('.prog-titled') || node.el) : node.el;
      const deg = degreeOf(id);
      unit.addEventListener('mouseenter', () => {
        const color = deg ? DEGREE_COLOR[deg] : rndAccent();   // degree 決定色；SCCD 無 degree→隨機（原邏輯）
        lineage(id).forEach((b) => paint(b, color));   // 整條 lineage 只變色（照舊續飄）
        clearTimeout(legLeaveTimer);
        showLegend(deg);                               // 同 degree no-op、不同 degree 先收後開（不再收起再打開）
        setHold(node.el.closest('.prog-tilt'), 1);   // 只有當下 hover 那顆回正＋停飄（user 2026-09-09）
      });
      unit.addEventListener('mouseleave', () => {
        lineage(id).forEach(unpaint);
        setHold(node.el.closest('.prog-tilt'), 0);
        clearTimeout(legLeaveTimer);
        legLeaveTimer = setTimeout(() => showLegend(null), 80);   // 離 tree 才收；移到別顆會被其 mouseenter 取消
      });
    });
    // 反向 hover（說明卡 row → tree）已移除（user 2026-09-11：有 term 就不做反向 hover）。
  } else {
    // 觸控（無 hover）：tap tree chip → 展開對應 degree 的 term+degree bar＋lineage 上色；點別顆＝切換、再點同顆＝還原。
    // 元素在 #page-content 內、SPA swap 即解綁（theme:changed 是 window 級、例外走 registerPageCleanup）。
    let tapped = null;   // { key, id, deg, color }
    const clearTap = () => {
      if (!tapped) return;
      lineage(tapped.id).forEach(unpaint);
      tapped = null;
    };
    const bindTap = (el, key, id, deg, colorOf) => {
      el.addEventListener('click', () => {
        const same = tapped && tapped.key === key;
        clearTap();                              // 清前一顆 tree 上色
        if (same) { showLegend(null); return; }  // 再點同顆＝收起
        const color = colorOf();
        lineage(id).forEach((b) => paint(b, color));
        tapped = { key, id, deg, color };
        showLegend(deg);                         // 不同 degree 自動先收後開（同 degree no-op）；SCCD(deg=null)＝收起
      });
    };
    // tap 後切 mode 的殘留修（user 09-10）：tap 上色是 inline !important（壓 mode3 rest 規則的必要之惡）、
    // color.css 蓋不掉 → 切到 mode3 會殘留 accent。theme:changed 時用 paint() 依「當下 mode」重畫
    // tapped 狀態（mode3 翻反色、mode1/2 還原存的 degree 色）；mode3 hue loop 也發此事件（200ms throttle）、重畫冪等便宜。
    const onThemeChanged = () => {
      if (!tapped) return;
      lineage(tapped.id).forEach((b) => paint(b, tapped.color));
      repaintBars(tapped.deg, tapped.color);   // 只重畫色、不重播開合（mode3 hue loop 200ms 也發此事件）
    };
    window.addEventListener('theme:changed', onThemeChanged);
    registerPageCleanup(() => window.removeEventListener('theme:changed', onThemeChanged));
    Object.entries(NODES).forEach(([id, node]) => {
      if (!node.el) return;
      const unit = node.parent === null ? (node.el.closest('.prog-titled') || node.el) : node.el;
      const deg = degreeOf(id);
      bindTap(unit, `n:${id}`, id, deg, () => (deg ? DEGREE_COLOR[deg] : rndAccent()));
    });
    // 反向 tap（說明卡 row → tree）已移除（同上：有 term 就不做反向）。
  }

  // 分層（cascade 順序 + 連綫父/子對應）
  const tier0 = [...root.querySelectorAll('.prog-top .prog-tilt')];                                                // DCD / BPAIDC
  const tier1 = [...root.querySelectorAll('.prog-children--root > .prog-node > .prog-row > .prog-box.prog-tilt')]; // BFA / MDES
  const tier2 = [...root.querySelectorAll('.prog-children--root .prog-children .prog-box.prog-tilt')];             // 動畫 / 創媒

  // ── 手機：chip 收到「實際文字最長行」寬（user 09-10 三輪「卡片寬度以文字寬度為主」）——
  //    inline-flex 盒折行後會撐到 max-width 不 hug（房規，同桌面逐 chip px 調法），手機文字後台可編、
  //    改用 Range 量 wrapped lines 取最長行寫回 width（同 hero tightenParagraphWidths）。旋轉 ±3° 的
  //    client rect 誤差 ~1px 可忽略。桌面不動（有各自 px max-width tuning）。──
  function hugChipWidths() {
    if (window.innerWidth >= 768) return;
    const range = document.createRange();
    root.querySelectorAll('.prog-box').forEach((box) => {
      box.style.width = '';   // 先清上一輪，量測回 max-width 自然 wrap（idempotent）
      let widest = 0;
      box.querySelectorAll('.prog-box-en, .prog-box-zh').forEach((span) => {
        range.selectNodeContents(span);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) if (rects[i].width > widest) widest = rects[i].width;
      });
      if (widest > 0) {
        const cs = getComputedStyle(box);
        box.style.width = `${Math.ceil(widest + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)) + 1}px`;
      }
    });
  }

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

  // ── 手機：連結段＝左側直綫 SCCD 底→SCAIDC 頂（user 09-10 三輪「sccd 連接到下面、從上 link 下去」）。
  //    absolute 掛 .prog-roots，top/height 量測寫入（CSS 只給 left/width）；chip hug 後左欄才有它的位置。──
  function layoutMobileLink() {
    const linkEl = links[0];
    if (!linkEl || desktop || !roots) return;
    const titled = roots.querySelectorAll('.prog-top .prog-titled');
    if (titled.length < 2) return;
    const base = roots.getBoundingClientRect();
    const a = restRect(titled[0]);       // SCCD/DCD
    const b = restRect(titled[titled.length - 1]);   // SCAIDC/BPAIDC
    const PAD = 10;                      // 綫端離卡的留白
    const top = a.bottom - base.top + PAD;
    const h = (b.top - base.top - PAD) - top;
    if (h <= 0) return;
    linkEl.style.top = `${top.toFixed(1)}px`;
    linkEl.style.height = `${h.toFixed(1)}px`;
  }

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
      const k = 1 - (box._hold || 0);   // hover 定住（同 atlas _straight）：1→0 回正並停在 rest；乘位移與角度
      const dx = f.ax * Math.sin(f.wx * t + f.phx) * ramp * k;
      const dy = f.ay * Math.sin(f.wy * t + f.phy) * ramp * k;
      box._fdx = dx; box._fdy = dy;
      box.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
      box.style.transform = `rotate(${((box._baseRot + f.rotAmp * Math.sin(f.wr * t + f.phr) * ramp) * k).toFixed(2)}deg)`;
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

  // ── chip clip-reveal tween＝數字 proxy 自組字串 ──
  // ⚠️ 勿改回 gsap fromTo 直接 tween `translate`/`clipPath` 字串：頁內情境偶發誤 parse（fromTo 起點被放大
  //    ~10 倍＝chip「從畫面外飛進來」，2026-09-10 MDES 實錄；隔離頁重現不出）。proxy 版起訖顯式、零字串 parse。
  const xyNums = (s) => { const n = (String(s).match(/-?[\d.]+/g) || []).map(Number); return [n[0] || 0, n[1] || 0]; };
  const insetNums = (s) => {   // inset 縮寫展開成 [top right bottom left]
    const n = (String(s).match(/-?[\d.]+/g) || [0]).map(Number);
    return n.length === 1 ? [n[0], n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0], n[1]] : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n.slice(0, 4);
  };
  function navClipTween(tl, el, from, to, vars, pos) {
    const ft = xyNums(from.translate), tt = xyNums(to.translate);
    const fc = insetNums(from.clipPath), tc = insetNums(to.clipPath);
    const proxy = { p: 0 };
    tl.to(proxy, {
      p: 1, duration: vars.duration, ease: vars.ease, onComplete: vars.onComplete,
      onUpdate: () => {
        const p = proxy.p;
        el.style.translate = `${(ft[0] + (tt[0] - ft[0]) * p).toFixed(2)}px ${(ft[1] + (tt[1] - ft[1]) * p).toFixed(2)}px`;
        el.style.clipPath = `inset(${fc.map((n, i) => (n + (tc[i] - n) * p).toFixed(3) + '%').join(' ')})`;
      },
    }, pos);
  }

  // ── 進場：cascade（父 chip → 連結/連綫 → 子 chip → …）──
  let entered = false;
  let entranceTl = null;   // proxy tween 不在 DOM 上，cleanup 的 killTweensOf(elements) 殺不到 → 離頁前顯式 kill
  function playEntrance() {
    if (entered) return;
    entered = true;
    if (!willAnimate) return;   // reduce / 無 gsap：init 已保持可見靜態
    startFloat();   // 迴圈先跑；各元素 reveal 完（下方 onComplete）才各自被接管漂移
    const lvl1 = lines.filter((l) => l.level === 1);
    const lvl2 = lines.filter((l) => l.level === 2);
    const tl = entranceTl = gsap.timeline();
    const revealTier = (tierChips, at) => tierChips.forEach((box, i) => {
      navClipTween(tl, box, navChipHidden(box, box._inDir), NAV_CHIP_SHOWN,
        { duration: 0.6, ease: 'power3.out', onComplete: () => { box._floatReadyAt = performance.now() / 1000; } },
        at + i * 0.12);
    });
    const drawLevel = (lvl, at) => lvl.forEach((le, i) =>
      tl.to(le, { draw: 1, duration: 0.55, ease: 'power2.out', onUpdate: () => drawLine(le), onComplete: () => { le._floatReady = true; } }, at + i * 0.1));

    revealTier(tier0, 0);
    if (links.length) tl.to(links, { ...linkShown, duration: 0.6, ease: 'power3.out', onComplete: () => { linksReady = true; } }, 0.25);
    drawLevel(lvl1, 0.5);
    revealTier(tier1, 0.75);
    drawLevel(lvl2, 1.05);
    revealTier(tier2, 1.3);
    // 兩張說明卡最後進場（user 2026-09-09「等 tree 長出來再進」）＝tier2 尾（≈2.0），各自 clip-reveal、微 stagger
    legendEls.forEach((el, i) => {
      navClipTween(tl, el, navChipHidden(el, el._dir), NAV_CHIP_SHOWN,
        { duration: 0.6, ease: 'power3.out' }, 2.0 + i * 0.1);
    });
  }

  // ── 退場（離頁）：全部一起消失（不分梯次）；回傳 Promise 讓 router await ──
  function inView() {
    const r = root.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
  }
  registerPageExit(() => {
    stopFloat();   // 交還 translate/transform 給退場 tween，避免逐幀 loop 打架
    if (entranceTl) { entranceTl.kill(); entranceTl = null; }   // 進場未完就離頁：殺掉 proxy tween 免跟退場搶寫
    if (!willAnimate || !inView()) return Promise.resolve();
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      chips.forEach((box) => {   // 方向仍各自隨機、但同時起收；from=SHOWN（float 殘位移 ±數px 首幀歸零，0.4s 全體同拍無感）
        navClipTween(tl, box, NAV_CHIP_SHOWN, navChipHidden(box, rndDir()), { duration: 0.4, ease: 'power2.in' }, 0);
      });
      lines.forEach((le) => tl.to(le, { draw: 0, duration: 0.4, ease: 'power2.in', onUpdate: () => drawLine(le) }, 0));
      if (links.length) tl.to(links, { ...linkHidden, duration: 0.4, ease: 'power2.in' }, 0);
      legendEls.forEach((el) => {   // 兩張說明卡跟 chips 同拍 clip 收（user 2026-09-09 離頁也要出場動畫）
        navClipTween(tl, el, NAV_CHIP_SHOWN, navChipHidden(el, rndDir()), { duration: 0.4, ease: 'power2.in' }, 0);
      });
    });
  });

  // ── 量測 + 建綫（layout 就緒後）；藏起初態；字體 / resize 重量重畫 ──
  // hug 在最前（寬度變了其餘量測才準）；layoutMobileLink 在 cacheEndpoints 後（吃落定位置）
  const remeasure = () => { hugChipWidths(); reserveHeights(); layoutFan(); cacheEndpoints(); layoutMobileLink(); drawAll(); };
  readGap();
  hugChipWidths();
  reserveHeights();
  layoutFan();
  buildLines();
  cacheEndpoints();
  layoutMobileLink();
  if (willAnimate) {
    chips.forEach((box) => { const h = navChipHidden(box, box._inDir); box.style.clipPath = h.clipPath; box.style.translate = h.translate; });
  }
  hideLegendInit();   // 說明卡藏成 clip-reveal 起態（layout 就緒後量，navChipHidden 需 offsetWidth）
  drawAll();
  requestAnimationFrame(remeasure);
  if (document.fonts?.ready) document.fonts.ready.then(remeasure);
  let raf = 0;
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { readGap(); remeasure(); }); };
  window.addEventListener('resize', onResize);

  // 進入視窗才觸發進場（once；說明卡排在 cascade 尾端，見 playEntrance）
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) playEntrance();
  }, { threshold: 0.15 });
  io.observe(root);

  // tree↔program 過場：跨越 program 內容區邊界時觸發背景三多邊形換形（user 2026-09-08 tree→program；09-09 加回程）。
  // onEnter＝往下（tree→program）、onLeaveBack＝往上回捲越過 start（program→tree）；SCCD_morphAboutPolys 內建 800ms 節流防抖。
  // ST trigger 在 #page-content 內、換頁自動 kill。
  if (typeof ScrollTrigger !== 'undefined') {
    const programArea = document.getElementById('class-info-area');
    if (programArea) ScrollTrigger.create({
      trigger: programArea, start: 'top 80%',
      onEnter: () => window.SCCD_morphAboutPolys?.(),
      onLeaveBack: () => window.SCCD_morphAboutPolys?.(),
    });
  }

  registerPageCleanup(() => {
    io.disconnect();
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(raf);
    stopFloat();
    if (entranceTl) { entranceTl.kill(); entranceTl = null; }   // proxy tween 不在 DOM 上、cleanup killTweensOf 殺不到
  });
}
