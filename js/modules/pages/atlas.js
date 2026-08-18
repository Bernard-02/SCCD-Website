/* global gsap */
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { loadAtlasData } from './atlas-source.js';
import { countryName } from '../../data/country-names.js';
import { sitePath } from '../ui/site-base.js';

/**
 * Atlas Page — SCCD-Centered Living Textile
 *
 * 中心是 SCCD（virtual origin，沒有可見的點，也不畫圈）。
 * A 老師圍繞中心，皆連回 SCCD。
 * B 系友任職企業 + C 合作機構（工作營/產學/出訪）位於中環，亦連回 SCCD。
 * D 城市散落畫面四方（不是規則環）。B/C 若有所在城市，會 cluster 到該城市附近，並另外連線到城市。
 *
 * 顏色：A 粉(R) / B 綠(G) / C 藍(B) / D 黑。
 * Floating 只給 label（dot 已移除，線端點直接接到 label 起點/終點，視 label 在 line 哪一側）。
 * Layout 用 seeded random，同一 viewport 重新整理會得到相同佈局。
 * 進場：分批「點燈」fade in（教師 → 就職＋合作 → 國家 → 主持），約 3s；之後 user 可滾輪 zoom。
 */

// 三原色（A/B/C label 與線色從這裡選；D 永遠黑）
const PRIMARY_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
const COLOR_BLACK = '#000000';

// Alumni filter 下方輪播職業（雙語，每 3s 切換一個 + clip-path 動畫）
// ── Filter ─────────────────────────────────────────────
// Faculty  = fc + ff（在職 + 離職教師）
// Alumni   = co（系友任職企業 — 橢圓 ring chip，host subgroup）
//          + em（系友就職企業 — 橢圓外 floating chip，employ subgroup；資料源 Directus alumni_employment）
// Partners = wsg + ind + ec（工作營 / 產學合作 / 體驗營）；講座(lec)已移除（2026-06-07 user 指定）
//   ec（體驗營）佔位中：prefix 已列入 partners 但暫無節點，等「體驗營合作單位」資料檔到位再 seed
const FILTER_PREFIXES = {
  faculty:  ['fc', 'ff'],
  alumni:   ['co', 'em'],
  partners: ['wsg', 'ind', 'ec'],
};

// 線端點不要直接插到字上，保留 px 間距
const LINE_END_GAP = 22;

// 每個 label 的隱形 box padding（線會接到 box 的 4 個邊中點之一，最靠近對方的那個）
// 0 = 線端點直接貼字；6 = 留 ~6px 隱形緩衝，蓋過 ±6° rotation 把可見 bbox 外擴 ~4px 的影響
// 不用動 .atlas-name 本身的 padding，純擴大連接 box（label 視覺不變）
const BOX_PADDING = 6;

// 4 個連線點：只取邊中點（T/R/B/L），不含 4 角
// → 線一律垂直接邊，不會從角斜出去
function getBoxPoints(box) {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  return [
    { x: cx,        y: box.top    },  // T
    { x: box.right, y: cy         },  // R
    { x: cx,        y: box.bottom },  // B
    { x: box.left,  y: cy         },  // L
  ];
}

function pickClosestBoxPoint(points, tx, ty) {
  let best = points[0], bestD = Infinity;
  for (const p of points) {
    const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// D 國家專用：線指向 box 中心，端點停在 box 邊（含 BOX_PADDING）→ 視覺上 chip 與線間
// 自然留下 padding 寬度的空隙；避免「找最近邊中點」在 chip 與 src 緩慢相對移動時
// endpoint 在 4 個 midpoint 之間跳變。回傳 src→center 線段最先碰到 box 邊的點。
function pickBoxEdgeToCenter(box, srcX, srcY) {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const dx = cx - srcX;
  const dy = cy - srcY;
  let tHit = 1;
  if (dx !== 0) {
    const tL = (box.left  - srcX) / dx;
    const tR = (box.right - srcX) / dx;
    for (const t of [tL, tR]) {
      if (t > 0 && t < tHit) {
        const y = srcY + t * dy;
        if (y >= box.top && y <= box.bottom) tHit = t;
      }
    }
  }
  if (dy !== 0) {
    const tT = (box.top    - srcY) / dy;
    const tB = (box.bottom - srcY) / dy;
    for (const t of [tT, tB]) {
      if (t > 0 && t < tHit) {
        const x = srcX + t * dx;
        if (x >= box.left && x <= box.right) tHit = t;
      }
    }
  }
  return { x: srcX + tHit * dx, y: srcY + tHit * dy };
}

// D 城市方塊有隨機旋轉 → 線端點要接「旋轉後」方塊的邊，不是 axis-aligned AABB。
// 做法：把 src 點旋進方塊 local frame（繞中心 -deg）→ 在 axis-aligned box 上挑邊（pickBoxEdgeToCenter）
//       → 再把該邊點旋回 world（+deg）。deg=0 時退化成原本的 pickBoxEdgeToCenter。
// 旋轉方向與 CSS `rotate`（y 軸朝下、正值順時針）一致。
function pickRotatedBoxEdgeToCenter(box, srcX, srcY, cx, cy, deg) {
  if (!deg) return pickBoxEdgeToCenter(box, srcX, srcY);
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = srcX - cx, dy = srcY - cy;
  // world → local（繞中心轉 -deg）
  const lx = cx + (dx * cos + dy * sin);
  const ly = cy + (-dx * sin + dy * cos);
  const e = pickBoxEdgeToCenter(box, lx, ly);
  // local → world（繞中心轉 +deg）
  const ex = e.x - cx, ey = e.y - cy;
  return { x: cx + (ex * cos - ey * sin), y: cy + (ex * sin + ey * cos) };
}

// 從 item 當前位置回推 box 範圍（含 BOX_PADDING；橫向手機反向縮放時 item._boxPad 覆寫——
// padding 是 layout px 會跟 zoom 放大，D 方塊視覺恆定後 padding 不縮 = 高倍時線與方塊間隙變大）
function computeBoxAt(item, x, y) {
  const w = item._boxW || 60;
  const h = item._boxH || 20;
  const pad = item._boxPad != null ? item._boxPad : BOX_PADDING;
  // B 企業環 chip + D 城市圓點都 horizontal-centered（box 中心 = anchor 點）；其餘 item 依 side 靠邊
  const isCentered = item.category === 'B' || item.category === 'D';
  const isSideLeft = item._isSideLeft;
  const labelLeft  = isCentered ? x - w / 2 : (isSideLeft ? x - w : x);
  const labelRight = isCentered ? x + w / 2 : (isSideLeft ? x : x + w);
  return {
    left:   labelLeft  - pad,
    right:  labelRight + pad,
    top:    y - h / 2  - pad,
    bottom: y + h / 2  + pad,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// 每次 reload 隨機重新洗一次佈局（城市軌道、labels 位置、faculty placeholder、list 三原色 shuffle 等都跟著變）
// 想暫時鎖固定佈局除錯時改回 const LAYOUT_SEED = 0xA71A5
const LAYOUT_SEED = Math.floor(Math.random() * 0xFFFFFFFF);

// 是否把名稱換成 type-numbered placeholder（在職教師 1…）。
// 2026-06-08：教師（fulltime/parttime/admin/former）、系友任職/就職企業、工作營/產學資料皆已是真名
// （Directus + 本地真資料）→ 關閉 placeholder 顯示真名。需要匿名化星座時再設回 true。
const USE_TYPE_PLACEHOLDER = false;
const TYPED_LABELS = {
  fc:  { en: 'Current Faculty',  zh: '在職教師' },
  ff:  { en: 'Former Faculty',   zh: '離職教師' },
  wsg: { en: 'Workshop Partner', zh: '工作營合作單位' },
  ind: { en: 'Industry Partner', zh: '產學合作公司' },
  ec:  { en: 'Experience Camp Partner', zh: '體驗營合作單位' },
  co:  { en: 'Alumni Co.',       zh: '系友任職企業' },
};

// D 國家節點不再寫死清單：改由 buildAtlas 從真實資料（系友就職 + 工作營/產學夥伴的 country ISO）動態生成。
// 顯示名稱走 country-names.js 的 countryName(iso)。

// Partner 類型對應（wsg/ind/ec 各自映射；lec 已移除 2026-06-07）
const PARTNER_TYPES = {
  wsg: { en: 'Workshop',                       zh: '工作營'   },
  ind: { en: 'Industry Partnerships',          zh: '產學合作' },
  ec:  { en: 'Experience Camp',                zh: '體驗營'   },
};

// ── Layout 參數（px）─ Rugby ball (橢圓) 中央 + Saturn ring 外環 ───────────
// 非城市 (A/B/C) uniform scatter 在橢圓內（橄欖球型，兩端漸尖，中間胖）
// 城市 (D) 走外環 orbit（看上方 city orbit 區段）
// HW > HH 對比越大 → 越像橄欖球；要再扁長就拉大 HW_FRAC、縮小 HH_FRAC
// 散佈區 = 幾乎鋪滿整個內容區（user 要求 430 標籤平均分佈、用滿上下與邊緣，不要擠成中間一坨）。
// HW 1.12 / HH 1.0 讓散佈橢圓填滿 viewport（scale 0.78 後仍在畫面內），鬆弛 clamp 收回 viewport 邊。
const ELLIPSE_HW_FRAC   = 1.12;   // 半長軸 = halfW × 1.12（鋪到左右邊）
const ELLIPSE_HH_FRAC   = 1.0;    // 半短軸 = halfH × 1.0（鋪到上下邊，用掉原本空白的頂/底）
// 視覺向上偏置（補償左下角 filter 按鈕造成的下方視覺重心）；鋪滿後幾乎置中，僅留微小上偏
const CLUSTER_Y_BIAS    = -15;
const CITY_DIST_FROM_CENTER_MIN_FRAC = 0.85;  // city orbit 暫定位置（最終被 orbit 覆寫）
const CITY_EDGE_PAD     = 4;
const CITY_MIN_SPACING  = 110;
const ITEM_MIN_SPACING  = 80;             // （保留給城市等其他用途的參考值；A/C 改用 box-aware 鬆弛）
const RELAX_ITERATIONS  = 12;             // jittered grid 已均勻 → box-aware 鬆弛只需少量迭代修寬字重疊

// ── Zoom ────────────────────────────────────────────────
const SCALE_DEFAULT     = 0.78;   // 預設留 ~20% 邊距，不貼邊
const MIN_SCALE         = 0.78;
const MAX_SCALE         = 3.5;    // zoom in 上限拉到 3.5x
const ZOOM_SPEED        = 0.0015;
// 橫向手機（landscape gate）圓點模式：zoom 過此門檻才顯示文字（CSS .atlas-text-zoom 切換）
// 文字採反向縮放（視覺字級恆定，見 --atlas-zoom-scale）→ 門檻越高間距越開、可讀性越好
const TEXT_ZOOM_SCALE   = 2.0;
// 點圓點 zoom-in 的目標 scale（> TEXT_ZOOM_SCALE，置中後文字必可讀）
const TAP_ZOOM_SCALE    = 2.6;
// 直向手機 tap D 方塊置中的最低 zoom：>1.0 解鎖 pan（預設 scale 鎖死不可拖），
// 又 < TEXT_ZOOM_SCALE 不觸發全場文字浮現（國名由方塊自己展開顯示）
const CITY_TAP_ZOOM     = 1.5;

let cleanupFns = [];

export function cleanupAtlas() {
  cleanupFns.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });
  cleanupFns = [];
  document.body.style.cursor = '';
}

// idle-standby overlay 的退場出口：overlay 不是 routed page、不走 registerPageExit，
// 由 initAtlas（root=overlay 時）把同一套 playMapExit/playListExit 掛在這，idle-standby 離場時呼叫
// （user 2026-07-15：待機離場沿用 atlas 退場動畫、不另外製作）。cleanup 時歸零。
let _overlayExit = null;
export function playOverlayAtlasExit() {
  return _overlayExit ? _overlayExit() : Promise.resolve();
}

export async function initAtlas(options = {}) {
  // root 預設為 document（atlas 頁正常 init）；idle-standby 可傳入 overlay 內的 container
  // 讓同份 atlas 模組在多個 root 上同時運作
  const root = options.root || document;
  // 手機（<768）無星雲（map）模式：直接以 list view 呈現，三顆 filter btn 變成底部單選分類 tab
  // （init 時決定一次，沿站內慣例不跟 resize；跨斷點要 reload）
  // 橫向手機（landscape gate，同 landscape.css）：星雲＝圓點模式（2026-07-06：文字/尺寸/線反向縮放、
  // pan/pinch/tap-zoom）、list＝3 sub-col 重排（2026-07-07：tab 進 header 列、alumni 左欄子分頁鈕）。
  // gate 一律併入「手機家族」JS 路徑（isMobileAtlas）：單選 tab / mobile 分頁 / mobile map⇄list 切換。
  // init 時決定一次即可 — 跨 gate 轉向由 orientation-reload 統一重載。
  const isLandscapeGateAtlas = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  const isMobileAtlas = window.innerWidth < 768 || isLandscapeGateAtlas;
  // 直向手機圓點星雲（2026-07-09 user「atlas 做成跟橫向手機一樣」）：直向也走圓點/方塊/zoom/tap 星雲，
  //   佈局從橫式寬橢圓改直式（stage W<H）。圓點模式＝isMobileAtlas（直向+橫向手機都圓點，桌面不變）；
  //   isPortraitDotAtlas 只給「直向專屬直式佈局係數」用（橫向 gate 維持原橫式係數）。
  const isPortraitDotAtlas = isMobileAtlas && !isLandscapeGateAtlas;
  // 手機星雲鋪滿 stage（user 2026-07-07「應該利用整個手機空間」）：0.78 預設縮放的四周留白是
  // 桌面呼吸邊距，手機小螢幕太浪費；layout 橢圓（HW 1.12＋鬆弛 clamp 收回邊界）本就以「佔滿 stage」
  // 鋪排，scale 1.0 = 內容貼滿。MIN 同步 1.0 → 預設視圖照舊鎖定不可拖、zoom in 才解鎖。直向手機同套。
  const minScaleAtlas = isMobileAtlas ? 1.0 : MIN_SCALE;
  const defaultScaleAtlas = isMobileAtlas ? 1.0 : SCALE_DEFAULT;
  /** @type {(sel: string) => HTMLElement | null} */
  const $  = (sel) => root.querySelector(sel);
  /** @type {(sel: string) => NodeListOf<HTMLElement>} */
  const $$ = (sel) => root.querySelectorAll(sel);

  const main = $('#atlas-main');
  if (!main) return;

  const stage   = $('#atlas-stage');
  const zoomEl  = $('#atlas-zoom');
  const content = $('#atlas-content');
  const detail  = $('#atlas-detail');
  if (!stage || !zoomEl || !content || !detail) return;

  // 渲染完成前擋 header mode btn（user 2026-08-10）：資料載入＋build＋intro 點燈期間切 mode
  // 會對半成品節點跑主題重繪。intro 完成（revealFilters）解鎖；提早離頁由 cleanup 解鎖。
  // 只 gate routed atlas 頁（root===document）；idle-standby overlay 的 init 不動別頁的按鈕。
  // pointer-events 走 body class + CSS（buttons.css）：header 是 async fetch，initAtlas 跑到這裡時
  // .theme-toggle-btn 可能還沒進 DOM，直接對按鈕設 inline 會 no-op → body class 讓晚到的按鈕也被擋。
  // disabled 屬性照設（a11y／鍵盤），按鈕已存在時同步。
  const gateModeBtn = root === document;
  const setModeBtnEnabled = (on) => {
    document.body.classList.toggle('atlas-mode-gate', !on);
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      /** @type {HTMLButtonElement} */ (btn).disabled = !on;
    });
  };
  if (gateModeBtn) {
    setModeBtnEnabled(false);
    cleanupFns.push(() => setModeBtnEnabled(true));
  }

  // ── 載入資料（Directus，各自有本地 fallback；workshops/industry 暫讀本地，見 atlas-source.js）──
  const { facultyCurrent, facultyFormer, workshops, industry, companies, employment, careers } =
    await loadAtlasData();
  // 職業輪播：後台 alumni_careers（無假資料 fallback；CMS 取不到就空、輪播不顯示）
  const careersList = careers || [];

  // ── 建構 items ──────────────────────────────────────
  const items = [];
  const groups = new Map();
  const countryIndex = new Map();   // 國家 ISO(大寫) → D itemId
  let idCounter = 0;
  const uid = (prefix) => `${prefix}-${++idCounter}`;

  // ── D 國家節點：只為「真實出現在資料裡的國家」建節點（無固定清單）─────────────
  // 來源 = 帶 country 的 item：系友就職 em + 工作營/產學夥伴 guest。ISO(大寫) 當 key、countryName 取顯示名。
  // 好處：① 沒人在的國家不會變孤兒節點 ② 不限 9 國 ③ Directus 一更新 country 就自動長出/連上節點。
  const collectIso = (set, code) => { if (code) set.add(String(code).toUpperCase()); };
  const usedIsos = new Set();
  (employment || []).forEach(em => collectIso(usedIsos, em.country));
  (workshops || []).forEach(yg => (yg.items || []).forEach(ws => (ws.guests || []).forEach(g => collectIso(usedIsos, g.country))));
  (industry  || []).forEach(yg => (yg.items || []).forEach(ind => (ind.guests || []).forEach(g => collectIso(usedIsos, g.country))));
  usedIsos.forEach(iso => {
    const it = {
      id: uid('country'), category: 'D',
      textEn: countryName(iso, 'en'), textZh: countryName(iso, 'zh'),
      labelEn: 'Country', labelZh: '國家',
      detail: '本系師生與合作對象足跡所及之國家。',
      groups: [], cityKey: iso, countryIso: iso,
    };
    items.push(it);
    countryIndex.set(iso, it.id);
  });

  // A: 在職教師（titles 為陣列，取第一個職稱當 list view 副標；三種 type 共用同一形狀）
  (facultyCurrent || []).forEach(f => {
    if (!f.nameEn && !f.nameZh) return;
    const t = (Array.isArray(f.titles) && f.titles[0]) || {};
    items.push({
      id: uid('fc'), category: 'A',
      textEn: f.nameEn || '', textZh: f.nameZh || '',
      labelEn: 'Current Faculty', labelZh: '在職教師',
      detail: '目前任職於本系，從事教學、研究與創作實務。',
      groups: [], cityKey: null,
      // country 2026-08-13 起掛 occupations（職稱/公司才有國家，職級沒有）；t.country 留舊資料 fallback
      _titleEn: t.titleEn || '', _titleZh: t.titleZh || '',
      _countryCode: (Array.isArray(f.occupations) && f.occupations[0]?.country) || t.country || '',
    });
  });

  // A: 離職教師
  (facultyFormer || []).forEach(f => {
    if (!f.nameEn && !f.nameZh) return;
    const years = f.yearsActive ? `（${f.yearsActive}）` : '';
    const field = f.fieldZh || f.fieldEn || '';
    items.push({
      id: uid('ff'), category: 'A',
      textEn: f.nameEn || '', textZh: f.nameZh || '',
      labelEn: 'Former Faculty', labelZh: '離職教師',
      detail: `曾任職於本系${years}${field ? '，' + field + '領域' : ''}。`,
      groups: [], cityKey: null,
      _titleEn: f.titleEn || '', _titleZh: f.titleZh || '', _countryCode: f.country || '',
    });
  });

  // 講座講者（原 A: lec）已從 atlas 移除（2026-06-07 user 指定 partners 只含 工作營 / 產學 / 體驗營）。
  // 體驗營（experience camp, prefix 'ec'）佔位中：等「體驗營合作單位」資料檔（比照 workshops.json 的
  // year → items → guests 結構）到位後，在此新增 seeding 區塊：uid('ec') / category 'C' /
  // labelEn 'Experience Camp Partner'、_listTypeEn/Zh 取 PARTNER_TYPES.ec、cityKey 對 canonical 城市。
  // 目前無 ec 節點，partners filter 實質顯示 工作營 + 產學。

  // C: 工作營合作單位（國家 = 該單位自己的 country，不是工作營舉辦地點）
  (workshops || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ws => {
      const wsGroupId = ws.id;
      if (!wsGroupId) return;
      const dt = (ws.intro_zh || ws.intro || '').trim().slice(0, 140) ||
                 '本系與外部單位合作之工作營。';
      const memberIds = [];

      (ws.guests || []).forEach(g => {
        const en = g.name || g.affiliation || '';
        const zh = g.name_zh || g.affiliation_zh || '';
        if (!en && !zh) return;
        // cityKey = 該單位 country(ISO 大寫)，連到同 ISO 的 D 節點；_countryCode 留真實國碼給 list 副標
        const canon = g.country ? String(g.country).toUpperCase() : null;
        const it = {
          id: uid('wsg'), category: 'C',
          textEn: en, textZh: zh,
          labelEn: 'Workshop Partner', labelZh: '工作營合作單位',
          detail: dt, groups: [wsGroupId], cityKey: canon, _countryCode: g.country || '',
        };
        items.push(it);
        memberIds.push(it.id);
      });

      // 國家節點「不」掛進工作營 group（2026-08-10 拆除舊跨國連結）：多國工作營會讓 hover 台灣
      // 列出/高亮新加坡的 guest（「item 有兩個國家」，user 打回）。國家與 item 的關聯只走
      // itemNeighbors（cityKey 連線），hover 國家＝只顯示自己國家的 item。
      groups.set(wsGroupId, { detail: dt, members: memberIds });
    });
  });

  // C: 產學合作公司（國家 = 該公司自己的 country；industry.json 目前無 country 欄 → 留 null 不連，
  //   等 activities 上 Directus 帶 country 後自動連到正確國家）
  (industry || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ind => {
      const indGroupId = ind.id;
      if (!indGroupId) return;
      const dt = '本系產學合作計畫，與業界共同推動實務研究與創新設計。';
      const memberIds = [];
      (ind.guests || []).forEach(g => {
        const en = g.name || '';
        const zh = g.name_zh || '';
        if (!en && !zh) return;
        const canon = g.country ? String(g.country).toUpperCase() : null;
        const it = {
          id: uid('ind'), category: 'C',
          textEn: en, textZh: zh,
          labelEn: 'Industry Partner', labelZh: '產學合作公司',
          detail: dt, groups: [indGroupId], cityKey: canon, _countryCode: g.country || '',
        };
        items.push(it);
        memberIds.push(it.id);
      });
      // 同 workshops：國家節點不掛進 group（見上方 2026-08-10 註解）
      if (memberIds.length > 0) groups.set(indGroupId, { detail: dt, members: memberIds });
    });
  });

  // B: 系友任職企業（無城市資料）
  (companies || []).forEach(c => {
    if (!c.nameEn && !c.nameZh && !c.name) return;
    items.push({
      id: uid('co'), category: 'B',
      textEn: c.nameEn || c.name || '', textZh: c.nameZh || '',
      labelEn: 'Alumni Employer', labelZh: '系友任職企業',
      detail: '本系畢業生曾任職、實習或合作之企業。',
      groups: [], cityKey: null, _countryCode: c.country || '',
    });
  });

  // C 風格 floating chip：系友就職企業（橢圓 ring 外、有 cityKey 跟著城市 relocate）
  // 用 category 'C' 視覺上跟 Partners 同（colored text、無 chip bg、小軌道、有連到城市的線）
  // prefix 'em' 註冊在 FILTER_PREFIXES.alumni → alumni btn / employ subchip 控制顯隱
  // 資料源 alumni_employment（loadAtlasData.employment）含 country(ISO-2 小寫)，連到同 ISO 的 D 節點 →
  //   線連到該國 D chip，城市 10s relocate 一起平移。國家節點由真實 country 動態生成（含 de/cz/it 等）。
  //   無假資料 fallback：CMS 取不到就空、不顯示 em chips。
  (employment || []).forEach(em => {
    if (!em.textEn && !em.textZh) return;
    // cityKey = country ISO(大寫)，連到同 ISO 的 D 節點
    // _countryCode = 後台真實國碼，list「就職」副標用它經 countryName 顯示真名
    const cityKey = em.country ? String(em.country).toUpperCase() : null;
    items.push({
      id: uid('em'), category: 'C',
      textEn: em.textEn, textZh: em.textZh,
      // 與 hover 卡片說明（Joined by Alumni／系友就職）同用語（user 2026-08-11）
      labelEn: 'Joined by Alumni', labelZh: '系友就職',
      detail: '本系畢業生就職之企業。',
      groups: [], cityKey, _countryCode: em.country || '',
    });
  });

  if (items.length === 0) {
    console.warn('[Atlas] No items');
    return;
  }

  // cityKey 只在能解析出真實國家時才有值（em 真 ISO / workshop 真城市）；對不到的留 null = 不連節點。
  // 不再隨機補假國家（原 USE_FAKE_CITY_FILL，2026-06-23 移除）。

  // 套用 type-numbered placeholder（D 國家 + B 系友任職企業保留真名 — co 是 atlas-companies.json 真實 30 個企業）
  if (USE_TYPE_PLACEHOLDER) {
    const counters = {};
    items.forEach(it => {
      if (it.category === 'D') return;
      const prefix = String(it.id).split('-')[0];
      if (prefix === 'co') return; // 系友任職企業 — 保留真實名稱（30 個企業環）
      const tpl = TYPED_LABELS[prefix];
      if (!tpl) return;
      counters[prefix] = (counters[prefix] || 0) + 1;
      const n = counters[prefix];
      it.textEn = `${tpl.en} ${n}`;
      it.textZh = `${tpl.zh} ${n}`;
    });
  }

  // ── List view 副標資料 ─────────
  // faculty: 真實職稱 / alumni em + partners: 該單位真實國家(ISO→名)
  items.forEach(item => {
    if (item.category === 'D') return;
    const prefix = String(item.id).split('-')[0];
    const cat = Object.keys(FILTER_PREFIXES).find(k => FILTER_PREFIXES[k].includes(prefix));
    if (cat === 'faculty') {
      // 真實職稱當副標（在職取 titles[0]、離職取 titleEn/Zh；無職稱則副標留空）
      // 職稱是「單位/機構名稱」且後台有填 country 時，名稱後面用（國家）標註（純職稱如「藝術家」country 留空不標）
      item._listSubEn = item._titleEn || '';
      item._listSubZh = item._titleZh || '';
      if (item._countryCode) {
        if (item._listSubEn) item._listSubEn += ` (${item._countryCode.toUpperCase()})`;
        if (item._listSubZh) item._listSubZh += `（${countryName(item._countryCode, 'zh')}）`;
      }
    } else if (cat === 'alumni') {
      // co-* (橢圓 ring 企業) → host（Hosting subchip 點掉 = 整圈消失）
      // em-* (橢圓外 floating chip) → employ（Employment subchip 點掉 = floating chip 全收）
      item._listSubGroup = prefix === 'em' ? 'employ' : 'host';
      // co/em 都用後台真實 country code 當副標；不再用 cityKey（受 9 國限制 + 對不到時無值）
      //   EN 顯示 ISO 兩碼（跟 faculty/activities 慣例一致，見 reference_guest_country_field_iso_display）、ZH 顯示中文全名
      if (item._countryCode) {
        item._listSubEn = item._countryCode.toUpperCase();
        item._listSubZh = countryName(item._countryCode, 'zh');
      }
    } else if (cat === 'partners') {
      const type = PARTNER_TYPES[prefix];
      if (type) {
        item._listTypeEn = type.en;
        item._listTypeZh = type.zh;
      }
      // 國家副標 = 該單位自己的 country（後台真實國碼；不受 9 國 cityKey 限制；同 em 作法）
      //   沒有 country 就不顯示，不亂填假國家；EN 顯示 ISO 兩碼、ZH 顯示中文全名（同上）
      if (item._countryCode) {
        item._listCountryEn = item._countryCode.toUpperCase();
        item._listCountryZh = countryName(item._countryCode, 'zh');
      }
    }
  });

  // 顏色配置：
  //   D 國家 = 黑字 + 隨機三原色 chip 底
  //   B 系友任職企業 = 黑字 + 隨機三原色 chip 底（30 個企業組成中環橢圓；2026-06-07 由黑底白字改隨機三原色）
  //   其他 A/C item 各自獨立隨機挑三原色（連線 stroke 沿用 item.color）
  items.forEach(item => {
    if (item.category === 'D') {
      item.color = COLOR_BLACK;
      item.bgColor = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    } else if (item.category === 'B') {
      item.color = COLOR_BLACK;
      item.bgColor = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    } else {
      item.color = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    }
  });

  // ── 計算佈局（seeded random，同一個 viewport 每次重整都是相同位置）─
  const W = stage.clientWidth  || window.innerWidth;
  const H = stage.clientHeight || (window.innerHeight - 80);
  const cx = W / 2, cy = H / 2;
  const srand = mulberry32(LAYOUT_SEED);

  layoutItems(items, W, H, srand);

  // 橫向 gate（scale 1.0 無 0.78 邊距吸收）：A/C anchor 夾進安全邊 —— 自身小軌道（gate 上限 rx 28）+
  // wobble ±7 + 圓點半徑會把貼邊 anchor 推出畫面（user 2026-07-07「不要超出畫面為原則」）。
  // EDGE = rx 上限 28 + wobble 7 + 圓點 5（與下方 gate 軌道半徑常數同步）。
  // B 環有 fitLimit 夾制、D 城市走 orbit/relocate 自帶 clamp，都不用管。
  // 直向手機同樣夾邊（2026-07-09 圓點星雲直式：scale 1.0 無 0.78 邊距吸收，貼邊 anchor 會出界）。
  if (isMobileAtlas) {
    const EDGE = 40;
    items.forEach(it => {
      if (it.category === 'B' || it.category === 'D') return;
      it.x = Math.max(EDGE, Math.min(W - EDGE, it.x));
      it.y = Math.max(EDGE, Math.min(H - EDGE, it.y));
    });
  }

  // ── 城市軌道（土星環式：所有軌道大小、tilt、aspect 接近，集中在外環）─
  // ⚠️ 真正控制城市位置/分佈的是這些常數，不是上方 layoutItems 的 CITY_DIST_*（那些已被 orbit 覆寫）
  // 設計目標：
  // - RX_MIN_F 高 → 沒有「靠近中心」的小軌道，避免 city 落在中間
  // - RX_MIN/MAX_F 範圍窄 → 軌道半徑差異 = 環厚度
  // - ASPECT_MIN 夠高 → 即使 city 在 orbit 短軸頂端也離中心夠遠（min(rx,ry) >= aspect_min × rx_min × halfW）
  // - TILT_MAX 小 → 所有軌道傾在接近同一平面（土星環 = 共平面）
  const orbitRand = mulberry32(LAYOUT_SEED ^ 0x0B17A1);
  const halfW = W / 2;
  const halfH = H / 2;

  // ── B 企業環：30 個系友任職企業均勻分佈在橢圓上（黑底白字 + 單一橢圓 stroke 當底綫）
  //    位置覆寫 layoutItems 的 scatter（B 已在 layoutItems 內排除）
  //    從正上方 -π/2 起算，順時針排列，視覺上首尾相接乾淨閉合
  //    整圈共用單一 _orbit（同 period / dir）→ tickFloat Phase 1 自動驅動，30 個 item 同步繞行如剛體
  // RX/RY 補償 SCALE_DEFAULT 0.78：layout 大於 viewport 沒關係，scale 後落在畫面 85vw
  //   螢幕橢圓寬 = RX_F × 2 × halfW × scale；1.20 ≈ 94vw 視覺寬度（往兩側多擴一些）
  // 直向手機（2026-07-09 圓點星雲直式）：stage W<H，環改「豎橢圓」——RX_F 收窄不左右出界（halfW×0.82≈環寬 85vw）、
  //   RY_F 放大讓環豎向鋪滿（見下）。橫向 gate / 桌面維持原橫式寬橢圓 RX_F 1.20。
  const COMPANY_ELLIPSE_RX_F = isPortraitDotAtlas ? 0.82 : 1.20;   // 半長軸 = halfW × 係數
  // RY 從極扁 0.38（aspect 6.3）放寬到 0.65（aspect 3.7）：
  // 扁橢圓的 cap 半徑 = ry²/rx；30 chip 等弧分佈時 cap 區塞 4-5 個 chip，半徑太小會視覺擠成一堆
  // 0.65 cap 半徑 ~92px，chip 在 cap 有物理空間散開
  // 橫向 gate（scale 1.0、halfH 僅 ~160）：0.65·halfH + zigzag 85 + chip 半高會豎向出界
  // （user 2026-07-07「不要超出畫面為原則」）→ RY 收 0.5、zigzag 深度減半（下方常數同步）
  // 直向手機豎橢圓：RY_F 0.82（halfH 大 → 環豎向鋪滿高 stage）＝直式主軸；橫向 gate 0.5（矮）、桌面 0.65
  const COMPANY_ELLIPSE_RY_F = isPortraitDotAtlas ? 0.82 : (isLandscapeGateAtlas ? 0.5 : 0.65);  // 半短軸
  const COMPANY_ELLIPSE_RX   = halfW * COMPANY_ELLIPSE_RX_F;
  const COMPANY_ELLIPSE_RY   = halfH * COMPANY_ELLIPSE_RY_F;
  const COMPANY_RING_PERIOD  = 100;           // 全圈一輪 100 秒（user 持續要慢化：16s → 40s → 70s → 100s）
  const COMPANY_RING_DIR     = -1;            // -1 逆時針（user 指定方向）
  // 蹺蹺板 z-tilt：橢圓整圈緩慢左右搖晃，左邊上→右邊下、左邊下→右邊上
  // 幅度小（半長軸大時 ±°·rx 位移很顯著，±1.5° 在 rx≈1150 仍有 ±30px）
  const COMPANY_RING_SEESAW_AMP    = 4 * Math.PI / 180; // ±4°
  const COMPANY_RING_SEESAW_PERIOD = 18;                   // 18s 一輪（緩慢搖晃）
  // Zigzag：相鄰 chip 在 local-y 交錯（奇偶決定方向）→ 整圈不是平滑橢圓而是鋸齒環
  //   深度每 chip seeded random 落在 [MIN, MAX]（layout px，會跟 scale 0.78 縮）→ 有的離環遠有的近，鋸齒不規則
  //   方向仍嚴格交替以保鋸齒感；要回平滑橢圓設 MIN=MAX=0；偶數 chip 數首尾接合無縫（目前 30 個）
  //   (user 2026-06-07：規則鋸齒 → 改不規則深淺)
  const COMPANY_RING_ZIGZAG_MIN    = isMobileAtlas ? 10 : 20;  // 手機（直向+橫向）淺鋸齒防出界；桌面 20
  const COMPANY_RING_ZIGZAG_MAX    = isMobileAtlas ? 40 : 85;
  const companyItems = items.filter(i => i.category === 'B');

  // Arc-length parametrization：cumU = ∫_0^θ ds/dθ dθ = 弧長函數（tipF 已拿掉，純 arc length）
  //   等 Δs 推進 → chip 沿橢圓周長均速（線速度恆定），不會在 tip 區聚集/減速
  //   B 環的 _ringFlow 用這個做 arc-equal speed flow（chip 共用 ds/dt，繞一圈時間 = period）
  const N_SAMPLES = 720;
  const dTheta = (Math.PI * 2) / N_SAMPLES;
  const cumU = new Float64Array(N_SAMPLES + 1);
  for (let i = 0; i < N_SAMPLES; i++) {
    const theta = i * dTheta;
    // ds/dθ for 實際位置 x = RX·sin(θ), y = -RY·cos(θ)（baseAngle 有 -π/2 偏移）
    //   dx/dθ = RX·cos(θ), dy/dθ = RY·sin(θ)
    const dsdtheta = Math.sqrt(
      (COMPANY_ELLIPSE_RX * Math.cos(theta)) ** 2 +
      (COMPANY_ELLIPSE_RY * Math.sin(theta)) ** 2
    );
    cumU[i + 1] = cumU[i] + dsdtheta * dTheta;
  }
  const totalU = cumU[N_SAMPLES];  // ellipse perimeter
  // u → θ：binary search + 線性內插
  function uToTheta(targetU) {
    let lo = 0, hi = N_SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumU[mid] < targetU) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a0 = cumU[i - 1], a1 = cumU[i];
    const t = a1 === a0 ? 0 : (targetU - a0) / (a1 - a0);
    return (i - 1 + t) * dTheta;
  }
  // Speed profile：dθ/dt ∝ (ds/dθ)^P，cumV = ∫(ds/dθ)^(-P) dθ
  //   P=0    equal-θ（cap 慢 flat 快、cap 密度 = 3.5× flat，原本設定）
  //   P=-0.5 半補償（chip 進 cap 角速度自動拉高 √3.5 倍 → 快點離開 cap；cap 密度 1.87×；carousel rhythm 還在）
  //   P=-1   arc-equal（ds/dt = const，完全不堆但 carousel 感弱）
  //   P 越負 → cap 越快、堆積越少、carousel rhythm 越弱
  const RING_SPEED_P = -1;
  const cumV = new Float64Array(N_SAMPLES + 1);
  for (let i = 0; i < N_SAMPLES; i++) {
    const theta = i * dTheta;
    // ds/dθ 同 cumU：補償實際位置的 -π/2 偏移
    const dsdtheta = Math.sqrt(
      (COMPANY_ELLIPSE_RX * Math.cos(theta)) ** 2 +
      (COMPANY_ELLIPSE_RY * Math.sin(theta)) ** 2
    );
    cumV[i + 1] = cumV[i] + dTheta * Math.pow(dsdtheta, -RING_SPEED_P);
  }
  const totalV = cumV[N_SAMPLES];
  function vToTheta(targetV) {
    let lo = 0, hi = N_SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumV[mid] < targetV) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a0 = cumV[i - 1], a1 = cumV[i];
    const t = a1 === a0 ? 0 : (targetV - a0) / (a1 - a0);
    return (i - 1 + t) * dTheta;
  }
  function thetaToV(theta) {
    const TWO_PI = Math.PI * 2;
    const wrapped = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
    const iFloat = wrapped / dTheta;
    const i = Math.floor(iFloat);
    const iNext = Math.min(N_SAMPLES, i + 1);
    const frac = iFloat - i;
    return cumV[i] + frac * (cumV[iNext] - cumV[i]);
  }

  // Uniform arc-length 分佈：30 chip 沿橢圓周長均勻分散，每個 chip 間隔 = totalU / 30
  //   配 arc-equal flow → 永遠均勻 + 等速，沒有 cap 聚集問題
  const N_B = companyItems.length;
  const arcStep = totalU / N_B;
  // 鋸齒深度專用 seeded RNG（獨立 seed → 不影響其他 layout random）
  const zigzagRand = mulberry32(LAYOUT_SEED ^ 0x21927A6);

  companyItems.forEach((item, idx) => {
    // chip 初始位置 uniform 在 arc length 上分佈（視覺均勻）；flow 用 V-parameterization（inverse-speed k=2）
    const s0 = idx * arcStep;
    const baseAngle = uToTheta(s0) - Math.PI / 2;
    const v0 = thetaToV(baseAngle + Math.PI / 2);
    item.x = cx + COMPANY_ELLIPSE_RX * Math.cos(baseAngle);
    item.y = cy + COMPANY_ELLIPSE_RY * Math.sin(baseAngle);
    item._companyRingIdx = idx;
    // 鋸齒：方向依 idx 奇偶嚴格交替、幅度 seeded random → 不規則深淺（有的遠有的近）
    item._zigzagY = (idx % 2 ? -1 : 1) *
      (COMPANY_RING_ZIGZAG_MIN + zigzagRand() * (COMPANY_RING_ZIGZAG_MAX - COMPANY_RING_ZIGZAG_MIN));
    item._initX = item.x;
    item._initY = item.y;
    item._orbit = {
      cx, cy,
      rx: COMPANY_ELLIPSE_RX,
      ry: COMPANY_ELLIPSE_RY,
      tilt: 0,
      cosT: 1,
      sinT: 0,
      v0,                       // 初始 V 位置（RING_SPEED_P 控制 cap/flat 速度差，見 cumV 註解）
      period:    COMPANY_RING_PERIOD,
      dir:       COMPANY_RING_DIR,
      tOffset:   0,
      pauseStart: null,
      _seesaw:   true,
      _ringFlow: true,
    };
  });

  const ORBIT_RX_MIN_F   = 0.85;              // 環內緣（不再有靠中心的小軌道）
  const ORBIT_RX_MAX_F   = 1.15;              // 環外緣（窄範圍 = 環厚度）
  const ORBIT_ASPECT_MIN = 0.45;              // 防扁軌道穿過中心
  const ORBIT_ASPECT_MAX = 0.55;
  const ORBIT_TILT_MAX   = Math.PI / 16;      // ±~11° 共平面
  // bbox cap = 軌道最遠處不超過 viewport 邊（user 指定 15s 變化位置不能超過 viewport）
  // halfW * 0.92 保留 ~8% halfW 給 chip width / padding，避免 chip text 切到 viewport 邊外
  const ORBIT_BBOX_W_MAX = halfW * 0.92;
  const ORBIT_BBOX_H_MAX = halfH * 0.85;

  // 旋轉後橢圓 bbox 半寬/半高 → 縮放到 viewport 內
  function fitTiltedEllipse(rx, ry, tilt) {
    const cT = Math.cos(tilt), sT = Math.sin(tilt);
    const bw = Math.sqrt((rx * cT) ** 2 + (ry * sT) ** 2);
    const bh = Math.sqrt((rx * sT) ** 2 + (ry * cT) ** 2);
    const sw = bw > ORBIT_BBOX_W_MAX ? ORBIT_BBOX_W_MAX / bw : 1;
    const sh = bh > ORBIT_BBOX_H_MAX ? ORBIT_BBOX_H_MAX / bh : 1;
    const s = Math.min(sw, sh);
    return { rx: rx * s, ry: ry * s };
  }

  const cityList = items.filter(i => i.category === 'D');
  // 城市初始位置最小距離（避免兩 city label 在 t=0 重疊）；超出 retry 上限就接受最後一次結果
  const CITY_MIN_INIT_DIST = 130;
  const CITY_INIT_MAX_RETRIES = 30;
  // 每幀防撞硬底線：tickFloat 保證任兩座城市中心永遠 ≥ 此距離（軌道各自漂移會把兩顆帶到一起甚至穿過 →
  //   chip 糊成一個、連線塌成 0 長度看不見＝user 2026-06-30 報的「國家/連線變少」真相）。漂到一起那刻沿
  //   連心軸把過近的對對推開，再夾回畫面內 → 城市永遠看得出 N 個、連線不消失，且不犧牲繞圈動態。
  const CITY_MIN_SEP = 100;
  const CITY_EDGE_PAD = 60;   // 推開後夾回畫面內，留 chip 半寬餘裕（user：不要移動到畫面以外）

  // 產生「一整組」城市排列：每顆圍繞自己的均分基準角抖動 + 隨機 ellipse，整組 t=0 兩兩不重疊。
  // 同一套擺位演算法：init 用 1 次、下面的 relocate layout pool 用 N 次（只有一份邏輯，不重複）。
  function genCityLayout() {
    const placed = [];
    cityList.forEach((city, idx) => {
      const baseAngle = (idx / cityList.length) * Math.PI * 2;
      let attempt = 0;
      let chosen = null;
      while (attempt < CITY_INIT_MAX_RETRIES) {
        const angle0 = baseAngle + (orbitRand() - 0.5) * (Math.PI / 4.5);
        // 直向手機（2026-07-09）：城市改「豎橢圓環」上下分佈——rx 收窄、aspect>1 讓 ry>rx（環高>寬），
        //   城市沿豎橢圓周排＝縱向分佈、連線自然上下走。橫向/桌面維持橫扁共平面土星環（aspect<1）。
        let rx = isPortraitDotAtlas
          ? halfW * (0.42 + orbitRand() * 0.28)                                        // 直向窄環寬 0.42~0.70
          : halfW * (ORBIT_RX_MIN_F + orbitRand() * (ORBIT_RX_MAX_F - ORBIT_RX_MIN_F));
        const aspect = isPortraitDotAtlas
          ? (2.0 + orbitRand() * 1.0)                                                  // 直向豎橢圓 ry = rx × 2.0~3.0
          : (ORBIT_ASPECT_MIN + orbitRand() * (ORBIT_ASPECT_MAX - ORBIT_ASPECT_MIN));
        let ry = rx * aspect;
        const tilt = (orbitRand() - 0.5) * 2 * ORBIT_TILT_MAX;
        ({ rx, ry } = fitTiltedEllipse(rx, ry, tilt));
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
        const lx0 = Math.cos(angle0) * rx;
        const ly0 = Math.sin(angle0) * ry;
        const x = cx + lx0 * cosT - ly0 * sinT;
        const y = cy + lx0 * sinT + ly0 * cosT;
        // 檢查與這組內已擺好的 city 距離
        let tooClose = false;
        for (let j = 0; j < idx; j++) {
          const dx = x - placed[j].x, dy = y - placed[j].y;
          if (dx * dx + dy * dy < CITY_MIN_INIT_DIST * CITY_MIN_INIT_DIST) { tooClose = true; break; }
        }
        chosen = { baseAngle, angle0, rx, ry, tilt, cosT, sinT, x, y };
        if (!tooClose) break;
        attempt++;
      }
      placed.push(chosen);
    });
    return placed;
  }

  // 預先算 N 組排列，relocate 每次挑一組套用。每個 slot 取「12 組隨機排列裡最分散的一組」→ relocate
  //   落點本來就盡量不擠，減少下面每幀防撞要修的量、避免落到差排列時 relocate 那刻被推開的視覺 pop。
  //   ⚠️「絕不重疊」的硬保證在 tickFloat 的每幀防撞（CITY_MIN_SEP），這裡只負責「起手盡量分散」。
  //   （舊版宣稱「20 組已驗證不重疊」其實名不副實：genCityLayout 達 retry 上限仍接受重疊組、整組也不重生。）
  const CITY_LAYOUT_POOL = 20;
  function layoutMinPairSq(L) {
    let m = Infinity;
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const dx = L[i].x - L[j].x, dy = L[i].y - L[j].y, d = dx * dx + dy * dy;
        if (d < m) m = d;
      }
    return m;
  }
  function bestCityLayout() {
    let best = null, bestMin = -1;
    for (let k = 0; k < 12; k++) {
      const L = genCityLayout(); const m = layoutMinPairSq(L);
      if (m > bestMin) { bestMin = m; best = L; }
    }
    return best;
  }
  const cityLayouts = Array.from({ length: CITY_LAYOUT_POOL }, bestCityLayout);
  let cityLayoutIdx = 0;

  cityList.forEach((city, idx) => {
    const L = cityLayouts[0][idx];
    city._orbit = {
      cx, cy,
      rx: L.rx,
      ry: L.ry,
      tilt: L.tilt,
      cosT: L.cosT,
      sinT: L.sinT,
      angle0: L.angle0,
      period:     240 + orbitRand() * 360,
      dir:        orbitRand() < 0.5 ? -1 : 1,
      tOffset:    0,
      pauseStart: null,
    };
    city.x = L.x;
    city.y = L.y;
    city._initX = city.x;
    city._initY = city.y;
  });

  // 每 15s 給 D 城市 chip 重抽新的 orbit ellipse → 視覺上移到畫面新位置然後繼續 floating
  //   切換不能 instant teleport（user 要求）→ 用 CSS individual `translate` property layer 上去：
  //     1. snapshot 當下位置 (oldX, oldY)
  //     2. apply 新 orbit 參數（tickFloat 下一幀 chip 邏輯位置會跳到 newX, newY）
  //     3. 設 anchor.style.translate = (oldX-newX, oldY-newY) → 抵銷 → 視覺上仍在 oldX
  //     4. GSAP tween offset 從 (dx, dy) → (0, 0) 1.2s → 視覺平滑滑到新位置
  //   `translate` (individual property) 跟 tickFloat 寫的 `transform: translate(...)` 自動 compose，不打架
  //   hover 暫停 / hidden tab 跳過
  const D_RELOCATE_INTERVAL_MS = 10000;
  const D_RELOCATE_TWEEN_DUR   = DUR.reveal;
  // 相關 C item「跟著城市移動」但有界（user：要 follow，但下一位置分佈仍要均衡）。
  //   舊版剛性平移 + 邊界 clamp → 累積漂移 + 夾到邊堆成一坨（量到一次 relocate 重疊比 1.06→1.33）。
  //   新版：每個 C item 有固定均勻 home（jittered grid 位置）；城市移到新位置時，其相關 C item 的 orbit center
  //   = home + clamp(城市相對畫面中心的位移, ±FOLLOW_MAX)。同城市的 item 一起朝城市方向平移「同一個有界向量」→
  //   看得出在跟城市、又因有界不漂走、非累積（每次從 home 重算）不越積越歪 → 整體永遠均衡。
  const FOLLOW_MAX = 120;   // C item 最多偏離 home 的距離（越大跟得越明顯、越小越均勻）
  // 跟隨目標夾進內容區：標籤 box 往單側展開（side-left 往左、否則往右）+ 自身小 orbit 半徑 + 邊距 →
  //   寬 label 跟著城市往外移時不會切出畫面邊（content 座標夾 [margin, W-margin]；非累積，不會夾到邊堆一坨）。
  // 橫向 gate（scale 1.0 無邊距吸收）加大：12 只蓋 wobble ±7＋圓點半徑的下緣，實測 follow 後仍有 2-9px 出界
  const FOLLOW_EDGE_PAD = isMobileAtlas ? 24 : 12;  // 手機（直向+橫向）scale 1.0 無邊距吸收 → 加大防 follow 出界
  function clampFollowTarget(item, x, y) {
    const orx = item._orbit.rx || 0, ory = item._orbit.ry || 0;
    const bw = item._boxW || 60, bh = item._boxH || 30;
    const leftPad  = (item._isSideLeft ? bw : 0) + orx + FOLLOW_EDGE_PAD;
    const rightPad = (item._isSideLeft ? 0 : bw) + orx + FOLLOW_EDGE_PAD;
    return {
      x: Math.max(leftPad, Math.min(W - rightPad, x)),
      y: Math.max(ory + FOLLOW_EDGE_PAD, Math.min(H - bh - ory - FOLLOW_EDGE_PAD, y)),
    };
  }
  function followItemOrbitTo(item, targetCx, targetCy) {
    if (!item._orbit || item._orbit.pauseStart != null) return;
    ({ x: targetCx, y: targetCy } = clampFollowTarget(item, targetCx, targetCy));
    const ddx = targetCx - item._orbit.cx;
    const ddy = targetCy - item._orbit.cy;
    if (Math.abs(ddx) < 0.5 && Math.abs(ddy) < 0.5) return;   // 已就位 → 免重啟 tween
    item._orbit.cx = targetCx;
    item._orbit.cy = targetCy;
    if (item._anchor && typeof gsap !== 'undefined') {
      if (item._relocateTween) item._relocateTween.kill();
      const off = { x: -ddx, y: -ddy };   // 視覺先抵銷邏輯跳變、再 tween 回 0 平滑滑到新位置（同城市 relocate 機制）
      item._anchor.style.translate = `${-ddx}px ${-ddy}px`;
      item._relocateOffsetX = -ddx;
      item._relocateOffsetY = -ddy;
      item._relocateTween = gsap.to(off, {
        x: 0, y: 0, duration: D_RELOCATE_TWEEN_DUR, ease: EASE.move,
        onUpdate: () => {
          if (item._anchor) item._anchor.style.translate = `${off.x.toFixed(2)}px ${off.y.toFixed(2)}px`;
          item._relocateOffsetX = off.x; item._relocateOffsetY = off.y;
          lastFloatTick = 0;   // 同城市 relocate：滑行期間解除節流，線端逐幀貼 chip（見城市版註解）
        },
        onComplete: () => {
          if (item._anchor) item._anchor.style.translate = '';
          item._relocateOffsetX = 0; item._relocateOffsetY = 0; item._relocateTween = null;
        },
      });
    } else {
      item._relocateOffsetX = 0; item._relocateOffsetY = 0;
    }
  }

  const dRelocateTimer = setInterval(() => {
    if (document.hidden) return;
    // 挑一組「整組已驗證不重疊」的排列（保證跟當前組不同）→ relocate 後不會有兩 city chip 疊成一個。
    cityLayoutIdx = (cityLayoutIdx + 1 + Math.floor(orbitRand() * (CITY_LAYOUT_POOL - 1))) % CITY_LAYOUT_POOL;
    const layout = cityLayouts[cityLayoutIdx];
    cityList.forEach((city, idx) => {
      if (!city._orbit || city._orbit.pauseStart != null) return;
      // 1. snapshot 當下位置
      const oldX = city.x, oldY = city.y;

      // 2-3. 套用這組排列裡這顆城市的 orbit（位置已在 genCityLayout 算好、整組不重疊）；dir 仍每次隨機保留動態。
      const { rx, ry, tilt, cosT, sinT, angle0, x: newX, y: newY } = layout[idx];
      const dir = orbitRand() < 0.5 ? -1 : 1;
      const tOffset = performance.now() / 1000 - floatStart;

      // 4. apply new orbit params
      Object.assign(city._orbit, { rx, ry, tilt, cosT, sinT, angle0, dir, tOffset });

      // 5. set 反向 offset + tween 回 0 → 視覺平滑過渡
      const dx = oldX - newX;
      const dy = oldY - newY;
      if (city._anchor && typeof gsap !== 'undefined') {
        if (city._relocateTween) city._relocateTween.kill();
        const off = { x: dx, y: dy };
        city._anchor.style.translate = `${dx}px ${dy}px`;
        city._relocateOffsetX = dx;
        city._relocateOffsetY = dy;
        city._relocateTween = gsap.to(off, {
          x: 0, y: 0,
          duration: D_RELOCATE_TWEEN_DUR,
          ease: EASE.move,
          onUpdate: () => {
            // anchor 視覺位置 + 寫進 item 上的 offset 屬性 → updateLineEndpoints 同步把線端拉過來
            if (city._anchor) city._anchor.style.translate = `${off.x.toFixed(2)}px ${off.y.toFixed(2)}px`;
            city._relocateOffsetX = off.x;
            city._relocateOffsetY = off.y;
            // 滑行期間解除 30fps 節流：GSAP 60fps 動 translate、tickFloat 30fps 更新線端 →
            // 隔幀線端落後 chip 30~50px（relocate 高速段），肉眼看得到「線脫離方塊」（2026-08-08 逐幀抓包）
            lastFloatTick = 0;
          },
          onComplete: () => {
            if (city._anchor) city._anchor.style.translate = '';
            city._relocateOffsetX = 0;
            city._relocateOffsetY = 0;
            city._relocateTween = null;
          },
        });
      } else {
        // 無 gsap fallback：instant snap，至少同步 offset 為 0
        city._relocateOffsetX = 0;
        city._relocateOffsetY = 0;
      }

      // 6. 相關 C item 跟著城市移動（有界 + 非累積 → 整體仍均衡，見上方 followItemOrbitTo 說明）
      const dispX = Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, newX - cx));
      const dispY = Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, newY - cy));
      items.forEach(it => {
        if (it.category !== 'C' || it.cityKey !== city.cityKey || it._homeX == null) return;
        followItemOrbitTo(it, it._homeX + dispX, it._homeY + dispY);
      });
    });
    // 歸零 30fps 節流：本 callback 已寫入補償 translate 但 city.x / 線端要 tickFloat 才重算，
    // 下一幀若被節流跳過，瀏覽器會把「補償已上、位置未更」的半套狀態畫出來
    // （chip 瞬移 ~250px 一幀，逐幀監測抓包 2026-08-08）；歸零保證 paint 前跑完整重算
    lastFloatTick = 0;
  }, D_RELOCATE_INTERVAL_MS);
  cleanupFns.push(() => {
    clearInterval(dRelocateTimer);
    cityList.forEach(city => { if (city._relocateTween) city._relocateTween.kill(); });
    items.forEach(it => { if (it._relocateTween) it._relocateTween.kill(); });
  });

  const itemMap = new Map(items.map(i => [i.id, i]));

  // ── 非城市非教師項目小型個人軌道 ─────────────────────────
  // Faculty (fc/ff) 排除：只走 _float wobble；其他類別 (co/wsg/ind，之後 ec) 都繞自己的小軌道
  // 軌道中心 = item 自己的 scatter 位置（不繞螢幕中心，否則會打散橄欖球分佈）
  // rx/ry 小（30-70px）讓 item 在原地附近畫橢圓；tilt 全隨機；period 短一點 (40-100s) 看得到旋轉
  items.forEach(item => {
    if (item.category === 'D') return;       // 國家已經有 Saturn ring orbit
    if (item.category === 'B') return;       // 系友任職企業固定在中環橢圓，不繞個人小軌道
    const prefix = String(item.id).split('-')[0];
    if (prefix === 'fc' || prefix === 'ff') return;  // 任教教師不繞軌道，只 floating
    // 橫向 gate：stage 矮（~330px）、無 0.78 邊距吸收 → 軌道縮小（30-70 會把貼邊 item 漂出畫面；
    // layout 夾邊 EDGE=40 與 rx 上限 28 同步）
    const orbitRx = isMobileAtlas ? (12 + orbitRand() * 16) : (30 + orbitRand() * 40);   // 手機 12..28 / 桌面 30..70 px
    const orbitRy = isMobileAtlas ? (8 + orbitRand() * 8) : (18 + orbitRand() * 27);     // 手機 8..16 / 桌面 18..45 px（略扁）
    const tilt = orbitRand() * Math.PI * 2;  // 全 360° 隨機（小軌道不必貼水平）
    item._orbit = {
      cx: item.x,
      cy: item.y,
      rx: orbitRx,
      ry: orbitRy,
      tilt,
      cosT: Math.cos(tilt),
      sinT: Math.sin(tilt),
      angle0: orbitRand() * Math.PI * 2,
      period: 40 + orbitRand() * 60,         // 40..100s
      dir: orbitRand() < 0.5 ? -1 : 1,
      tOffset: 0,
      pauseStart: null,
    };
    item._initX = item.x;
    item._initY = item.y;
    item._homeX = item.x;   // 固定均勻 home（follow 偏移的基準，永不變）
    item._homeY = item.y;
  });

  // ── 計算連線：每個非 D 連到中心；B/C 有城市的 → 連到城市 ─
  // 線顏色決策延後到 SVG 渲染（依 fromItem.color / toItem === D 判斷漸變）
  const connections = [];
  // 只保留 B/C → D 國家的線。中心連線（center → A/B/C）全部移除：
  // - A 老師完全沒線，純 floating 文字
  // - B/C 只有「指向所屬國家」的一條線（cityKey 在新架構下 = country EN 名稱）
  items.forEach(item => {
    // B 企業環平常無連綫（中央環是純裝飾 + hover header logo 才往中心連），只保留 C → 國家
    if (item.category === 'C' && item.cityKey && countryIndex.has(item.cityKey)) {
      const countryId = countryIndex.get(item.cityKey);
      connections.push({ fromId: item.id, toId: countryId });
    }
  });

  const itemNeighbors = new Map(items.map(i => [i.id, new Set()]));
  const itemLines = new Map(items.map(i => [i.id, []]));
  connections.forEach(conn => {
    if (conn.fromId !== 'center') {
      itemNeighbors.get(conn.fromId).add(conn.toId);
      itemNeighbors.get(conn.toId).add(conn.fromId);
    }
  });

  // ── 渲染（先 labels → 量 box → 再 SVG 線）─────────────────
  content.innerHTML = '';
  content.style.width = '100%';
  content.style.height = '100%';

  // 1) HTML labels 先渲染（必須先 layout 才能量 offsetWidth/Height）
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const anchor = document.createElement('div');
    anchor.className = `atlas-anchor atlas-cat-${item.category.toLowerCase()}`;
    // co-* = 系友主持企業環 chip：橫向手機圓點模式豁免（保留完整文字、僅縮小字級；user 2026-07-06）
    if (String(item.id).split('-')[0] === 'co') anchor.classList.add('atlas-anchor-co');
    anchor.style.left = `${(item.x / W) * 100}%`;
    anchor.style.top  = `${(item.y / H) * 100}%`;
    // B 企業環 chip 要中心對齊 ellipse 邊（看起來像穿過 ring 線）— 不分左右側，靠 CSS translate(-50%,-50%) 置中
    // 只有 C 需要 side-left（line 接字的左/右側）；B 企業環 + D 城市圓點都置中故排除
    if (item.category === 'C' && item.x < cx) anchor.classList.add('atlas-side-left');

    const span = document.createElement('span');
    span.className = 'atlas-name';
    span.dataset.itemId = item.id;
    span.style.color = item.color;
    // D 國家 + B 系友任職企業 都是 chip 樣式（純色底 + 對比字色）→ 都要 inline 設 background
    if ((item.category === 'D' || item.category === 'B') && item.bgColor) {
      span.style.backgroundColor = item.bgColor;
    }
    // 橫向手機圓點模式的圓點色（CSS ::after 讀取）：B 用 chip 底色（字色是黑）、A/C 用字色
    span.style.setProperty('--atlas-chip-c', item.bgColor || item.color);

    if (item.textEn) {
      const enEl = document.createElement('span');
      enEl.className = 'atlas-name-en';
      enEl.textContent = item.textEn;
      span.appendChild(enEl);
    }
    if (item.textZh && item.textZh !== item.textEn) {
      const zhEl = document.createElement('span');
      zhEl.className = 'atlas-name-zh';
      zhEl.textContent = item.textZh;
      span.appendChild(zhEl);
    }

    // A/C/B 有 float wobble + random rotation；D 在 Saturn ring orbit 靜止
    //   B 的 anchor 由 _orbit 驅動沿橢圓周流動，_float 只動 span 的 wobble + rotate（不會脫離橢圓）
    //   用 CSS individual `translate` + `rotate` property 不衝突 .atlas-cat-b 的 `transform: translate(-50%, -50%)` 置中
    if (item.category !== 'D') {
      const dur = 3.5 + srand() * 4;
      // B 企業環 chip 用更大的 rotation amp（user 要求橢圓 chip 旋轉角度大一點）→ baseRot/rotDelta ±8
      // A/C 維持原本 ±3 防 wobble 看起來抖
      const rotAmp = item.category === 'B' ? 8 : 3;
      const rotRange = rotAmp * 2;
      item._float = {
        tx:       srand() * 14 - 7,
        ty:       srand() * 14 - 7,
        baseRot:  srand() * rotRange - rotAmp,
        rotDelta: srand() * rotRange - rotAmp,
        dur,
        phase:    srand() * dur * 2,
      };
      span.style.rotate = `${item._float.baseRot.toFixed(2)}deg`;
    } else {
      // D 城市方塊：靜態隨機旋轉（無 wobble）；±35° 讓方塊有的正有的歪
      //   ⚠️ 必須把 rotate 接在 transform 內、translate(-50%,-50%) 之後（translate 外層），**不可**用個別 `rotate` 屬性：
      //   個別 rotate 會 compose 成 rotate·translate → 把置中用的 -50%,-50% 位移也一起旋轉 → 方塊視覺中心偏離
      //   anchor 數 px（±35° 最多 ~7px）；而連線切框（computeBoxAt 以 anchor 為中心 + 同角度旋轉）仍在 anchor →
      //   方塊與「切線方環」對不齊（user 2026-06-08 提問實測：旋轉方塊端點 maxAbs 散在 11~20 而非乾淨 16）。
      //   D 無 _float（Phase 2 跳過），span.transform 只在這設一次、不會被逐幀覆蓋 → 直接寫 transform 安全。
      item._squareRotDeg = srand() * 70 - 35;
      span.style.transform = `translate(-50%, -50%) rotate(${item._squareRotDeg.toFixed(2)}deg)`;
    }

    // View 切換動畫用 cover 層：absolute inset:0 蓋住 span box，bg = item chip 主色
    //   D / B 用 bgColor（chip 底色）；A/C 用 item.color（連線色 / 字色）
    // 預設 clip-path inset(0% 100% 0% 0%) 隱藏 → idle 不可見；switchToList/switchToMap 期間動 clip-path 蓋住/退開文字
    // DOM 順序放最後 = 絕對定位天然蓋在前面 in-flow 文字上方
    const cover = document.createElement('span');
    cover.className = 'atlas-name-cover';
    cover.style.backgroundColor = (item.category === 'D' || item.category === 'B')
      ? (item.bgColor || PRIMARY_COLORS[0])
      : item.color;
    span.appendChild(cover);

    anchor.appendChild(span);
    fragment.appendChild(anchor);
    item._anchor = anchor;
    item._span = span;
    item._cover = cover;
  });
  content.appendChild(fragment);

  // 2) 量每個 label 的 box 尺寸（offsetWidth/Height 已 layout 完）
  items.forEach(item => {
    if (!item._span) return;
    item._boxW = item._span.offsetWidth;
    item._boxH = item._span.offsetHeight;
    item._isSideLeft = item._anchor.classList.contains('atlas-side-left');
  });

  // 3) SVG 線層 — 插在 content 第一個子元素，DOM 順序在前 = 視覺在 labels 下方
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'atlas-lines');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  content.insertBefore(svg, content.firstChild);

  // defs 放城市連綫的 linearGradient（兩端城市底色不同時用，相同則純色 stroke）
  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);

  // 4) 連線：每幀動態挑「當下最靠近的 box 邊中點」（兩端都動：B/C 浮動 + 城市軌道）
  //    舊架構共享 cityEndpoint 只在 init 算一次 → 城市軌道後 endpoint 卡在原本那一邊，
  //    被 city label 自己擋住。改成 tickFloat Phase 3 重新挑邊。
  const allLines = [];
  // A2：只有 hover 高亮（opacity:1 可見）的 C→國家線才需要逐幀重算端點。
  //   idle 時這 ~190 條全是 .atlas-line（CSS opacity:0 隱形）→ tickFloat Phase 3 只跑 activeLines（idle=0 條）。
  //   showDetail 填入 + 立刻補算一次端點、clearDetail 清空。城市間連線 cityLines 常駐可見 → 不在此優化內。
  const activeLines = new Set();
  connections.forEach((conn, idx) => {
    if (conn.fromId === 'center') return;
    const fromItem = itemMap.get(conn.fromId);
    const toItem   = itemMap.get(conn.toId);

    const lineEl = document.createElementNS(SVG_NS, 'path');
    lineEl.setAttribute('fill', 'none');
    // pathLength="1" 把 path 標準化為長度 1，讓 CSS stroke-dasharray:1 + stroke-dashoffset:1
    // 做 "draw" 動畫；端點動了 dash 計算仍以 1 為基準，不會跑掉
    lineEl.setAttribute('pathLength', '1');
    // opacity / stroke-width 一律交給 CSS .atlas-line / .atlas-line-highlight；
    // SVG presentation attr 跟 CSS transition 同時設會擋住 fade（attr 端點被視為 inline）
    lineEl.setAttribute('class', 'atlas-line');

    // 兩端顏色：src=item 類別色、city 端=city.bgColor（city label 高亮色）
    // 不同色用 linearGradient（與城市間連綫一致），同色純色 stroke
    const srcColor  = fromItem.color;
    const cityColor = toItem.bgColor || PRIMARY_COLORS[0];
    let gradientEl = null;
    if (srcColor === cityColor) {
      lineEl.setAttribute('stroke', srcColor);
    } else {
      const gid = `atlas-line-grad-${idx}`;
      gradientEl = document.createElementNS(SVG_NS, 'linearGradient');
      gradientEl.setAttribute('id', gid);
      gradientEl.setAttribute('gradientUnits', 'userSpaceOnUse');
      const stop1 = document.createElementNS(SVG_NS, 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', srcColor);
      const stop2 = document.createElementNS(SVG_NS, 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', cityColor);
      gradientEl.appendChild(stop1);
      gradientEl.appendChild(stop2);
      defs.appendChild(gradientEl);
      lineEl.setAttribute('stroke', `url(#${gid})`);
    }
    svg.appendChild(lineEl);

    itemLines.get(conn.fromId).push(lineEl);
    itemLines.get(conn.toId).push(lineEl);
    allLines.push({ line: lineEl, src: fromItem, city: toItem, gradient: gradientEl });
  });

  // 線的顯示規則＝「兩端 item 都沒被 filter 藏掉」。filter/gate 的 show-path 一律走 syncLineDisplay，
  // 不可無條件 display:''——那會復活「另一端已被 filter 篩掉」的線（關 filter 後 hover 國家看到
  // 連向空白處的完整線扇，user 2026-08-10；同 memory reference_atlas_gate_reshows_filtered_chip_lines）。
  const lineMeta = new Map(allLines.map(le => [le.line, le]));
  // 動畫版 hide 0.4s 後 onComplete 才掛 atlas-filtered-out class → 只讀 DOM class 在動畫窗口內
  // 會誤判「正在消失」的 chip 為可見（hover 國家亮出整片殘線扇，user 2026-08-11）。
  // 補讀 filter「狀態」：非 D 走 filterAllowsItem（selected/subchipActive）、D 走 _gateVisible（applyCountriesGate 寫）。
  const isFilteredOutItem = (it) => {
    if (!it || !it._anchor) return false;
    if (it._anchor.classList.contains('atlas-filtered-out')) return true;
    return it.category === 'D' ? it._gateVisible === false : !filterAllowsItem(it);
  };
  const syncLineDisplay = (lineEl) => {
    const m = lineMeta.get(lineEl);
    if (!m) return;
    lineEl.style.display = (isFilteredOutItem(m.src) || isFilteredOutItem(m.city)) ? 'none' : '';
    // filter 改變顯隱的線一律撤 hover 高亮：hover 中節點被藏（display:none 不觸發 mouseout）會讓
    // highlight class 卡住，之後 filter 再開、display 還原 → 沒 hover 也亮一整片殘線（user 2026-08-10）
    lineEl.classList.remove('atlas-line-highlight');
  };

  // 動態挑端點：city 找離 source 最近的邊中點，再讓 source 找離該點最近的邊中點
  // 兩端 item.x/y 都已在 Phase 1 軌道更新過；source 再加上 label 浮動 offset
  function updateLineEndpoints(le) {
    const src = le.src, city = le.city;
    // C item 也可能在 10s 重定位 tween 期間（跟城市一起平移）→ 線端要跟著 chip 視覺位置走
    const srcX = src.x + (src._floatDx || 0) + (src._relocateOffsetX || 0);
    const srcY = src.y + (src._floatDy || 0) + (src._relocateOffsetY || 0);
    // 15s 重定位 tween 期間 city 視覺位置 = orbit position + relocate offset → 線端要跟著走
    const cityX = city.x + (city._relocateOffsetX || 0);
    const cityY = city.y + (city._relocateOffsetY || 0);
    const cityBox = computeBoxAt(city, cityX, cityY);
    // D 國家端：線指向 box 中心，視覺上停在 padding 邊（不再隨 src 移動跳到不同邊中點）
    //   方塊有隨機旋轉 → 用 rotated 版接到「旋轉後」方塊邊，否則線會接到 axis-aligned AABB 看起來穿進方塊
    const cityEdge = pickRotatedBoxEdgeToCenter(cityBox, srcX, srcY, cityX, cityY, city._squareRotDeg || 0);
    const srcBox = computeBoxAt(src, srcX, srcY);
    const srcEdge = pickClosestBoxPoint(getBoxPoints(srcBox), cityEdge.x, cityEdge.y);
    le.line.setAttribute('d', `M ${srcEdge.x.toFixed(2)} ${srcEdge.y.toFixed(2)} L ${cityEdge.x.toFixed(2)} ${cityEdge.y.toFixed(2)}`);
    // gradient 端點同步（userSpaceOnUse）：src=stop 0%、city=stop 100%
    if (le.gradient) {
      le.gradient.setAttribute('x1', srcEdge.x.toFixed(2));
      le.gradient.setAttribute('y1', srcEdge.y.toFixed(2));
      le.gradient.setAttribute('x2', cityEdge.x.toFixed(2));
      le.gradient.setAttribute('y2', cityEdge.y.toFixed(2));
    }
  }

  // 設個初始 d 避免首幀前線是 invisible 0-length path
  allLines.forEach(updateLineEndpoints);

  // ── 城市間預設連線（Hamilton cycle：每座城市恰有 2 條連綫）──
  // 用 seeded shuffle 打亂順序避免「按角度排成外緣圓形」的視覺；連綫橫跨內部變網狀
  const cityItems = items.filter(i => i.category === 'D');
  const ringRand = mulberry32(LAYOUT_SEED ^ 0xC17ABE);
  const cityRing = cityItems.slice();
  for (let i = cityRing.length - 1; i > 0; i--) {
    const j = Math.floor(ringRand() * (i + 1));
    [cityRing[i], cityRing[j]] = [cityRing[j], cityRing[i]];
  }
  // 08-11 改「全 pair 池」：per-country gate 藏掉部分國家後，剩下的可見國家要沿 cityRing
  // 原 shuffle 順序「跳過隱藏者重新成環」（user：filter 後剩兩國也要連上）→ 任兩國都可能
  // 成為環上鄰居，先建好全部 C(n,2) 條線，syncCityCycle 算出當前環寫 cl._on（其餘 retractT=1 隱形）。
  // 全部可見時的環＝原本的 Hamilton cycle，預設視覺不變。
  const cityLines = [];
  for (let i = 0; i < cityRing.length; i++) {
    for (let j = i + 1; j < cityRing.length; j++) {
      const a = cityRing[i];
      const b = cityRing[j];
      const aColor = a.bgColor || PRIMARY_COLORS[0];
      const bColor = b.bgColor || PRIMARY_COLORS[0];
      const lineEl = document.createElementNS(SVG_NS, 'path');
      lineEl.setAttribute('fill', 'none');
      lineEl.setAttribute('class', 'atlas-city-line');
      // pathLength="1" 把實際長度標準化，搭配 CSS stroke-dasharray:1 → view 切換時動 dashoffset 1↔0 做「從一端 draw / 從一端 erase」效果
      lineEl.setAttribute('pathLength', '1');
      let gradientEl = null;
      if (aColor === bColor) {
        lineEl.setAttribute('stroke', aColor);
      } else {
        const gid = `atlas-city-grad-${i}-${j}`;
        gradientEl = document.createElementNS(SVG_NS, 'linearGradient');
        gradientEl.setAttribute('id', gid);
        gradientEl.setAttribute('gradientUnits', 'userSpaceOnUse');
        const stop1 = document.createElementNS(SVG_NS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', aColor);
        const stop2 = document.createElementNS(SVG_NS, 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', bColor);
        gradientEl.appendChild(stop1);
        gradientEl.appendChild(stop2);
        defs.appendChild(gradientEl);
        lineEl.setAttribute('stroke', `url(#${gid})`);
      }
      svg.appendChild(lineEl);
      // hoveredEnd 一開始就給值：retractT=1 的 lerp 需要它才會收成一點（null＝畫全長線）
      cityLines.push({ line: lineEl, a, b, ai: i, bi: j, _on: false, retractT: 1, hoveredEnd: Math.random() < 0.5 ? 'a' : 'b', gradient: gradientEl });
    }
  }
  // 依「可見國家」（_gateVisible 狀態，undefined＝可見）沿 cityRing 順序成環 → 寫 cl._on。
  // applyCountriesGate 每次 filter 變動後重呼叫；兩顆時只連一條（環會 a↔b 重複）。
  function syncCityCycle() {
    const vis = [];
    cityRing.forEach((c, idx) => { if (c._gateVisible !== false) vis.push(idx); });
    const on = new Set();
    if (vis.length >= 2) {
      const edges = vis.length === 2 ? 1 : vis.length;
      for (let k = 0; k < edges; k++) {
        const p = vis[k], q = vis[(k + 1) % vis.length];
        on.add(p < q ? p * 1000 + q : q * 1000 + p);
      }
    }
    cityLines.forEach(cl => { cl._on = on.has(cl.ai * 1000 + cl.bi); });
  }
  syncCityCycle();
  cityLines.forEach(cl => { cl.retractT = cl._on ? 0 : 1; });
  function updateCityLineEndpoints(cl) {
    const a = cl.a, b = cl.b;
    // 兩端 D 城市 chip 都可能在 15s 重定位 tween 中 → 取視覺位置（含 relocate offset）
    const aX = a.x + (a._relocateOffsetX || 0);
    const aY = a.y + (a._relocateOffsetY || 0);
    const bX = b.x + (b._relocateOffsetX || 0);
    const bY = b.y + (b._relocateOffsetY || 0);
    const aBox = computeBoxAt(a, aX, aY);
    const bBox = computeBoxAt(b, bX, bY);
    // 兩端 D 國家：線串接兩 box 中心，各端停在自身 padding 邊 → 視覺對齊中心點且 chip 周圍留 padding 空隙
    const aCenter = { x: (aBox.left + aBox.right) / 2, y: (aBox.top + aBox.bottom) / 2 };
    const bCenter = { x: (bBox.left + bBox.right) / 2, y: (bBox.top + bBox.bottom) / 2 };
    let aEdge = pickRotatedBoxEdgeToCenter(aBox, bCenter.x, bCenter.y, aX, aY, a._squareRotDeg || 0);
    let bEdge = pickRotatedBoxEdgeToCenter(bBox, aCenter.x, aCenter.y, bX, bY, b._squareRotDeg || 0);
    // hover 城市時：被 hover 端 lerp 向另一端「散開消失」（retractT 0→1）
    const t = cl.retractT;
    if (t > 0 && cl.hoveredEnd) {
      if (cl.hoveredEnd === 'a') {
        aEdge = { x: aEdge.x + (bEdge.x - aEdge.x) * t, y: aEdge.y + (bEdge.y - aEdge.y) * t };
      } else {
        bEdge = { x: bEdge.x + (aEdge.x - bEdge.x) * t, y: bEdge.y + (aEdge.y - bEdge.y) * t };
      }
    }
    cl.line.setAttribute('d', `M ${aEdge.x.toFixed(2)} ${aEdge.y.toFixed(2)} L ${bEdge.x.toFixed(2)} ${bEdge.y.toFixed(2)}`);
    // gradient 端點同步（userSpaceOnUse 座標系）：a 端=stop 0%、b 端=stop 100%
    if (cl.gradient) {
      cl.gradient.setAttribute('x1', aEdge.x.toFixed(2));
      cl.gradient.setAttribute('y1', aEdge.y.toFixed(2));
      cl.gradient.setAttribute('x2', bEdge.x.toFixed(2));
      cl.gradient.setAttribute('y2', bEdge.y.toFixed(2));
    }
  }
  cityLines.forEach(updateCityLineEndpoints);

  // ── 企業環底綫：單一 SVG <ellipse> 作為 30 個 B 企業共用的橢圓輪廓
  //    取代之前 30 條 bezier line 拼接 — 視覺上是一個乾淨閉合的橢圓
  //    chip（B label）覆蓋在前面 → 實際肉眼看到的是 chip 之間的橢圓弧段
  //    位置／尺寸與 companyItems 的 _orbit 完全一致 → labels 旋轉時剛好沿著這條 ellipse 滑行
  //    .atlas-city-line class → 自動套用 hover dim；不加入 cityLines 陣列 → 不參與 view 切換 retract
  const companyRingEllipse = document.createElementNS(SVG_NS, 'ellipse');
  companyRingEllipse.setAttribute('class', 'atlas-city-line atlas-company-ring-shape');
  companyRingEllipse.setAttribute('cx', String(cx));
  companyRingEllipse.setAttribute('cy', String(cy));
  companyRingEllipse.setAttribute('rx', String(COMPANY_ELLIPSE_RX));
  companyRingEllipse.setAttribute('ry', String(COMPANY_ELLIPSE_RY));
  companyRingEllipse.setAttribute('fill', 'none');
  // user 要求拿掉橢圓 outline → stroke: none；保留 element 不刪是因 animateRingEllipse 仍會操作它（noop 化）
  companyRingEllipse.setAttribute('stroke', 'none');
  // pathLength=1 → view 切換時用 stroke-dashoffset 1↔0 做 draw/erase（跟 cityLines 同 pattern；現 stroke 隱形仍保留以利日後恢復）
  companyRingEllipse.setAttribute('pathLength', '1');
  svg.appendChild(companyRingEllipse);

  // hover 城市時觸發全部城市綫段「散開消失」：連到 hover 城市的從該端散，其他綫段隨機挑一端散
  // filter gate 後 cityLine 的靜止目標：在當前可見國家環上（syncCityCycle 寫的 _on）才畫。
  // hover/clearDetail 還原時不可無條件回 0——那會把 gate 縮掉的線重新畫進空氣（user 2026-08-11）。
  const cityLineRestT = (cl) => cl._on ? 0 : 1;
  function setCityLineRetract(hoveredCity) {
    cityLines.forEach(cl => {
      let targetT = cityLineRestT(cl);
      let isActive = false;
      if (hoveredCity) {
        isActive = true;
        targetT = 1;
        if (cl.a === hoveredCity) cl.hoveredEnd = 'a';
        else if (cl.b === hoveredCity) cl.hoveredEnd = 'b';
        else cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
      }
      cl.line.classList.toggle('atlas-city-line-active', isActive);
      if (typeof gsap !== 'undefined') {
        gsap.killTweensOf(cl);
        gsap.to(cl, { retractT: targetT, duration: DUR.medium, ease: EASE.enterSoft });
      } else {
        cl.retractT = targetT;
      }
    });
  }
  cleanupFns.push(() => {
    if (typeof gsap !== 'undefined') {
      cityLines.forEach(cl => gsap.killTweensOf(cl));
    }
  });

  // ── Floating rAF loop（label 浮動，line 端點同步移動避免錯位）─
  let floatStart = performance.now() / 1000;
  let floatRunning = false;          // 由 refreshFloatRunning 啟動：stage（星雲）顯示時才跑
  // hover 中的 chip 釘 z=4（> D 恆定的 3 > B 下半 2 > A/C 1）：防止鄰居 chip 每幀 z 翻面/
  //   防撞位移後浮到靜止游標上搶走 hover（假 mouseout → 連線 clear+重畫閃兩次）；showDetail pin、clearDetail unpin
  let hoverPinnedItem = null;
  function pinHoverZ(item) {
    if (hoverPinnedItem === item) return;
    unpinHoverZ();
    if (!item._anchor) return;
    hoverPinnedItem = item;
    item._anchor.style.zIndex = '4';
    item._lastZ = 4;
  }
  function unpinHoverZ() {
    const it = hoverPinnedItem;
    if (!it) return;
    hoverPinnedItem = null;
    if (!it._anchor) return;
    if (it.category === 'B' || it.category === 'D') { it._lastZ = null; }  // Phase 2.5 下一幀重算
    else { it._anchor.style.zIndex = ''; it._lastZ = null; }               // A/C 交還 CSS z:1
  }
  let floatRaf = null;
  let floatPausedAt = null;          // 暫停起點 ms；恢復時補回 floatStart 讓 ambient 漂移接續不跳
  let menuPausedAtlas = false;       // 手機 menu 全屏 overlay 開著 → 暫停（window.setAtlasFloatPaused 切換）

  // FPS 節流：全裝置 30fps（2026-07-10 user 拍板：筆電拔電源跑 60 會超卡，30 視覺可接受）。
  //   位置由 performance.now() 絕對時間算 → 跳幀不影響速度。
  const FLOAT_FPS_CAP = 30;
  const FLOAT_MIN_DT  = 1000 / FLOAT_FPS_CAP;
  let   lastFloatTick = 0;

  // 三軸 seesaw 振幅 per-cycle randomization：周期固定，每完整一輪重抽 target，
  // cycle 內 lerp current→target 平滑過渡（避免在 cycle 邊界 amp 跳變產生 1st-derivative 折角）
  const SEESAW_AMP_JITTER     = 0.4;  // ±40% 振幅抖動（看得到但不誇張）
  // ── X/Y 改用 breath + deform 分解：
  //   breath：X 和 Y 同步縮放（whole ring 一起脹/縮，period 24s）→ 整體大小變化
  //   deform：X 和 Y 反向縮放（拉長/壓扁 aspect ratio，period 14s）→ 變形
  //   兩個合起來：避免「永遠扁時最寬 / 高時最窄」單一規律，而是有時整體小有時整體大，有時 deform，組合更有機
  const BREATH_AMP_BASE = 0.10;  // 整環同步呼吸振幅
  const DEFORM_AMP_BASE = 0.08;  // X/Y 反向變形振幅
  /** @param {number} base */
  function makeAmpState(base) { return { current: base, next: base, lastCycle: -1, base }; }
  /** @param {number} base */
  function nextAmp(base) { return base * (1 - SEESAW_AMP_JITTER + Math.random() * SEESAW_AMP_JITTER * 2); }
  /** @param {ReturnType<typeof makeAmpState>} state @param {number} t @param {number} period */
  function tickAmp(state, t, period) {
    const cycleIdx = Math.floor(t / period);
    if (cycleIdx !== state.lastCycle) {
      state.lastCycle = cycleIdx;
      state.current = state.next;
      state.next = nextAmp(state.base);
    }
    const progress = (t / period) - cycleIdx;  // 0..1 within cycle
    return state.current + (state.next - state.current) * progress;
  }
  const ampStateZ      = makeAmpState(COMPANY_RING_SEESAW_AMP);
  const ampStateBreath = makeAmpState(BREATH_AMP_BASE);
  const ampStateDeform = makeAmpState(DEFORM_AMP_BASE);

  // ── 企業環呼吸夾邊（user 指定：呼吸/變形脹到最寬時 chip 不可超出 viewport 左右）──
  //   tickFloat 每幀對 30 個 B chip 算「當下實際在最外側的那張」，夾住 seesawXScale 讓其外緣貼齊
  //   （不超出）viewport。窄 chip 在邊緣時環可放到最寬，只有寬 chip（如 The Wall Street Journal）
  //   轉到邊緣才收 → 不會永久把整環縮小，保留 RX_F=1.20「往兩側多擴」的設計。
  //   fitLimitX = chip 外緣允許到達的 content 半寬上限；chip 與 ring 都被 zoomEl scale，靜止視圖 = SCALE_DEFAULT。
  //   RING_FIT_BUFFER 吸收 B chip ±8° 靜態旋轉造成的外擴。
  const RING_FIT_PAD    = 8;    // 螢幕 px 邊距
  const RING_FIT_BUFFER = 6;    // layout px：chip 旋轉外擴緩衝
  const fitLimitX = (halfW - RING_FIT_PAD) / defaultScaleAtlas;

  // 整環 seesaw（breath/deform/z-tilt）的時間軸 — hover B chip 時 freeze 整個 ring 不動
  //   ringPaused 由 pauseRingFlow / resumeRingFlow 切換，tickFloat 內用 ringSeesawT 取代 raw t
  let ringSeesawPauseStart = null;
  let ringSeesawTOffset = 0;

  function tickFloat(nowMs) {
    // 先排下一幀（本幀即使被節流跳過也要讓 loop 存活）
    if (floatRunning) floatRaf = requestAnimationFrame(tickFloat);
    // 節流：距上次實際更新未達 FLOAT_MIN_DT 就跳過本幀的重活
    const now = nowMs || performance.now();
    if (now - lastFloatTick < FLOAT_MIN_DT) return;
    lastFloatTick = now;
    const tRaw = performance.now() / 1000 - floatStart;
    const t = tRaw;
    // seesaw 時間：hover 時 freeze 在 pauseStart - offset；非 hover 時 raw - offset
    const seesawT = ringSeesawPauseStart != null
      ? ringSeesawPauseStart - ringSeesawTOffset
      : tRaw - ringSeesawTOffset;

    // B 企業環動畫：30 chip carousel flow + 三軸蹺蹺板 tilt
    //   Z 軸：in-plane rotation（±AMP°，週期 18s）
    //   Breath：X/Y 同步縮放（whole ring 脹/縮，週期 24s）→ 整環有時小有時大
    //   Deform：X/Y 反向縮放（拉長/壓扁，週期 14s，phase offset π/3 避免跟 breath 同步）→ aspect ratio 變化
    //   兩者疊加 → 不會永遠「扁=寬 / 高=窄」單一規律，組合更有機
    //   三軸振幅每輪 random 微調 → 不會看起來像完全循環的機械運動
    const ampZ      = tickAmp(ampStateZ,      seesawT, COMPANY_RING_SEESAW_PERIOD);
    const ampBreath = tickAmp(ampStateBreath, seesawT, 24);
    const ampDeform = tickAmp(ampStateDeform, seesawT, 14);
    const seesawZ = ampZ * Math.sin((seesawT / COMPANY_RING_SEESAW_PERIOD) * Math.PI * 2);
    const seesawCos = Math.cos(seesawZ);
    const seesawSin = Math.sin(seesawZ);
    const breath = 1 - ampBreath + ampBreath * Math.cos((seesawT / 24) * Math.PI * 2);
    const deform = ampDeform * Math.cos((seesawT / 14) * Math.PI * 2 + Math.PI / 3);
    let   seesawXScale = breath * (1 + deform);
    const seesawYScale = breath * (1 - deform);
    // 夾住企業環水平範圍：環脹到最寬時最外側 chip（含自身寬度）不可超出 viewport 左右
    //   rawX = 未乘 seesawXScale 的旋轉後 x（與下方 Phase 1 B 分支同公式）；chip 外緣 = |rawX|·sx + 半寬
    //   解 |rawX|·sx + 半寬 ≤ fitLimitX → sx ≤ (fitLimitX − 半寬)/|rawX|，取所有 chip 最緊者
    for (let i = 0; i < companyItems.length; i++) {
      const o = companyItems[i]._orbit;
      const effT = o.pauseStart != null ? (o.pauseStart - o.tOffset) : (t - o.tOffset);
      const vPos = o.v0 + (effT / o.period) * totalV * o.dir;
      const vWrapped = ((vPos % totalV) + totalV) % totalV;
      const angle = vToTheta(vWrapped) - Math.PI / 2;
      const rawX = Math.cos(angle) * o.rx * seesawCos
                 - (Math.sin(angle) * o.ry + companyItems[i]._zigzagY) * seesawSin;
      const absRaw = Math.abs(rawX);
      if (absRaw < 1) continue;
      const maxScale = (fitLimitX - ((companyItems[i]._boxW || 60) / 2 + RING_FIT_BUFFER)) / absRaw;
      if (maxScale < seesawXScale) seesawXScale = Math.max(0, maxScale);
    }
    // 同步 SVG outline 的三軸 tilt — 否則 chip 飄離靜止的 outline
    if (companyRingEllipse) {
      const deg = (seesawZ * 180 / Math.PI).toFixed(3);
      companyRingEllipse.setAttribute('transform',
        `translate(${cx} ${cy}) rotate(${deg}) scale(${seesawXScale.toFixed(4)} ${seesawYScale.toFixed(4)}) translate(${-cx} ${-cy})`);
    }

    // Phase 1: 軌道（hover 時 pauseStart 凍結）
    //   B 環（_ringFlow）：30 chip 共用 ωt 沿 ellipse arc-equal 流動，pattern 整塊繞橢圓走
    //   D 城市軌道：各自獨立傾斜橢圓，等角速繞行
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._orbit) continue;
      const o = item._orbit;
      const effT = o.pauseStart != null ? (o.pauseStart - o.tOffset) : (t - o.tOffset);
      let lx, ly, cosT, sinT, applySeesawScale;
      if (o._ringFlow) {
        // Speed profile：RING_SPEED_P 控制 chip 進 cap 加速程度（見 cumV 區段註解）
        const vPos = o.v0 + (effT / o.period) * totalV * o.dir;
        const vWrapped = ((vPos % totalV) + totalV) % totalV;
        const angle = vToTheta(vWrapped) - Math.PI / 2;
        lx = Math.cos(angle) * o.rx;
        // zigzag：chip 各自的 _zigzagY（奇偶定方向 + random 深淺）→ 不規則鋸齒環（隨 seesaw tilt/scale 一起變形）
        ly = Math.sin(angle) * o.ry + item._zigzagY;
        cosT = seesawCos; sinT = seesawSin;
        applySeesawScale = true;
      } else {
        // D 城市：等角速 axis-aligned 橢圓 + 固定 tilt
        const angle = o.angle0 + (effT / o.period) * Math.PI * 2 * o.dir;
        lx = Math.cos(angle) * o.rx;
        ly = Math.sin(angle) * o.ry;
        cosT = o.cosT; sinT = o.sinT;
        applySeesawScale = false;
      }
      // 先 z-旋轉再 scale x/y（scale 兩軸彼此可交換）
      let xRot = lx * cosT - ly * sinT;
      let yRot = lx * sinT + ly * cosT;
      if (applySeesawScale) {
        xRot *= seesawXScale;
        yRot *= seesawYScale;
      }
      item.x = o.cx + xRot;
      item.y = o.cy + yRot;
      const ddx = item.x - item._initX;
      const ddy = item.y - item._initY;
      item._anchor.style.transform = `translate(${ddx.toFixed(2)}px, ${ddy.toFixed(2)}px)`;
    }

    // Phase 1.4: D 城市每幀防撞 — 保證任兩座城市中心 ≥ CITY_MIN_SEP。各城市軌道半徑/方向獨立，漂移途中
    //   兩顆會互相靠近甚至穿過（舊版＝chip 疊成一個、連線塌掉，user 2026-06-30）。幾趟鬆弛把過近的對沿
    //   連心軸對推開、每趟夾回畫面內 → 城市永遠看得出 N 個、連線不消失。pool 已盡量分散故平時幾乎不動。
    if (cityList.length > 1) {
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < cityList.length; i++) {
          for (let j = i + 1; j < cityList.length; j++) {
            const a = cityList[i], b = cityList[j];
            // 距離用「視覺位置」量（邏輯位置 + relocate 過場的 translate 補償 offset）：
            // relocate 那 1.2s 兩顆的滑行路徑可能交叉，只保邏輯位置時視覺上仍會疊成一顆（2026-07-08 headless 實測）
            let dx = (b.x + (b._relocateOffsetX || 0)) - (a.x + (a._relocateOffsetX || 0));
            let dy = (b.y + (b._relocateOffsetY || 0)) - (a.y + (a._relocateOffsetY || 0));
            let dist = Math.hypot(dx, dy);
            if (dist >= CITY_MIN_SEP) continue;
            if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }   // 完全重合 → 沿 x 軸拆開
            const push = (CITY_MIN_SEP - dist) / 2;
            const ux = dx / dist, uy = dy / dist;
            // hover 凍結中的城市（orbit paused）不推：推走會把 chip 從靜止游標下抽走 → 假 mouseout
            //   → 連線 clear + 重畫閃兩次；改由對向城市吃全量位移，min-sep 保證不變
            const aPinned = a._orbit && a._orbit.pauseStart != null;
            const bPinned = b._orbit && b._orbit.pauseStart != null;
            if (aPinned && bPinned) continue;
            if (aPinned)      { b.x += ux * push * 2; b.y += uy * push * 2; }
            else if (bPinned) { a.x -= ux * push * 2; a.y -= uy * push * 2; }
            else {
              a.x -= ux * push; a.y -= uy * push;
              b.x += ux * push; b.y += uy * push;
            }
          }
        }
        for (let i = 0; i < cityList.length; i++) {
          const c = cityList[i];
          // 夾制同樣在視覺空間做：過場中邏輯位置常貼軌道外緣（離邊 <60px），夾邏輯值會把上面
          // pairwise 推開的量整個吃回去（實測仍疊 -10px）。offset=0 時退化為原本的邏輯夾制。
          const ox = c._relocateOffsetX || 0, oy = c._relocateOffsetY || 0;
          c.x = Math.max(CITY_EDGE_PAD, Math.min(W - CITY_EDGE_PAD, c.x + ox)) - ox;
          c.y = Math.max(CITY_EDGE_PAD, Math.min(H - CITY_EDGE_PAD, c.y + oy)) - oy;
        }
      }
      // 重寫 D transform（覆蓋 Phase 1 寫的軌道位置成防撞後位置）；line 端點 Phase 3b 讀 item.x 自動跟上
      for (let i = 0; i < cityList.length; i++) {
        const c = cityList[i];
        c._anchor.style.transform = `translate(${(c.x - c._initX).toFixed(2)}px, ${(c.y - c._initY).toFixed(2)}px)`;
      }
    }


    // SVG 企業環 outline = 完全靜止「軌道」概念，chip 沿這條 ellipse 流動（行星繞日視覺）

    // Phase 2: A/C label 浮動（只動 span transform；快取 _floatDx/Dy 給 Phase 3 用）
    //   B 企業環 chip 跳過此 phase — user 要求拿掉 ring 上的 chip floating，靜態靠 ellipse 旋轉
    //   init 時設的 span.style.rotate = baseRot 不被 phase 2 覆蓋，B chip 保留隨機靜態傾斜
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._float) continue;
      if (item.category === 'B') continue;
      const f = item._float;
      const cycleLen = f.dur * 2;
      const cyclePos = ((t + f.phase) % cycleLen + cycleLen) % cycleLen;
      let p = cyclePos < f.dur ? cyclePos / f.dur : 2 - cyclePos / f.dur;
      p = p * p * (3 - 2 * p);  // smoothstep ease in-out
      const dx = f.tx * p, dy = f.ty * p, dRot = f.baseRot + f.rotDelta * p;
      // 用 CSS individual translate + rotate（不衝突 .atlas-cat-b 的 transform: translate(-50%, -50%) 與 .atlas-name 的 translateY(-50%)）
      item._span.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
      item._span.style.rotate = `${dRot.toFixed(2)}deg`;
      item._floatDx = dx;
      item._floatDy = dy;
    }

    // Phase 2.5: B（黑底 chip 企業）動態調 z-index — 分割綫（y=cy）以上 → z=0 鑽到 A/C(z:1) 下面，以下 → z=2 浮上來
    //   D 國家恆 z=2：原本跟 B 一起翻，但上半部 z=0 會讓 20px 方塊被幾百個 label 埋住 →
    //   idle 城市連線看起來連到空氣、hover 中被防撞推過線時 z 翻掉 → label 搶走 hover 假 mouseout（user 2026-08-08）
    //   深度錯覺只留給中央 B 企業環（ellipse 才有「繞到後面」的視覺語意）
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._anchor) continue;
      if (item.category !== 'B' && item.category !== 'D') continue;
      if (item === hoverPinnedItem) continue;   // hover 中的 chip 釘 z=4（pinHoverZ），不參與翻面
      // D=3 不是 2：B 環下半部也是 z=2，同 z 靠 DOM 順序、B chip 蓋住國家小方塊照樣「連線連到空氣」
      const visualY = item.y + (item._floatDy || 0);
      const z = item.category === 'D' ? 3 : (visualY < cy ? 0 : 2);
      if (item._lastZ !== z) {
        item._anchor.style.zIndex = String(z);
        item._lastZ = z;
      }
    }

    // Phase 3: 線端點動態挑 box 邊（兩端都當下最近，避免被 city label 擋）
    //   只更新 activeLines（當下高亮可見的）— idle 時 0 條，隱形線不白算（A2）
    activeLines.forEach(updateLineEndpoints);
    // Phase 3b: 城市間預設連線端點同步（兩端都是城市，都在 Phase 1 orbit 後位置更新）
    //   全 pair 池後多數線恆 retractT=1 隱形 → 收縮到位後補算最後一幀（消掉殘 stub）就跳過，
    //   每幀實際更新量維持「可見環 + 動畫中」≈ 原本 10 條
    for (let i = 0; i < cityLines.length; i++) {
      const cl = cityLines[i];
      if (cl.retractT >= 1) {
        if (!cl._collapsedSynced) { updateCityLineEndpoints(cl); cl._collapsedSynced = true; }
        continue;
      }
      cl._collapsedSynced = false;
      updateCityLineEndpoints(cl);
    }
  }
  // rAF 只在 stage（星雲）實際顯示時跑。list view（手機預設 + 桌面切換）、背景分頁、
  //   手機直向轉向提示都會把 stage display:none → 暫停整個 tickFloat，不必逐幀對隱藏的 map
  //   寫 ~250 個 transform + ~190 條線端點。各 stage.style.display 變動點都會呼叫此函式重新評估。
  //   暫停期間累積時間在恢復時補回 floatStart → ambient 漂移從停的地方接續、不跳。
  function refreshFloatRunning() {
    // 減少動態：定位一次後凍結，不持續 rAF 漂浮（WCAG 2.3.3 / 2.2.2）。tickFloat 用絕對時間算位置、
    // floatRunning 維持 false → 跑一幀即完整定位且不自排下一幀；display/visibility 變動時再補定位一次。
    if (prefersReducedMotion()) {
      if (!document.hidden && stage.style.display !== 'none') tickFloat(performance.now());
      return;
    }
    const want = !document.hidden && !menuPausedAtlas && stage.style.display !== 'none';
    if (want && !floatRunning) {
      if (floatPausedAt != null) { floatStart += (performance.now() - floatPausedAt) / 1000; floatPausedAt = null; }
      floatRunning = true;
      floatRaf = requestAnimationFrame(tickFloat);
    } else if (!want && floatRunning) {
      floatRunning = false;
      floatPausedAt = performance.now();
      if (floatRaf) { cancelAnimationFrame(floatRaf); floatRaf = null; }
    }
  }
  refreshFloatRunning();   // 桌面預設 map view → 啟動；手機 init 稍後 display:none + refresh 會停
  document.addEventListener('visibilitychange', refreshFloatRunning);
  // 手機 menu 開著時暫停 float loop（mobile-menu.js 呼叫，同 /create 的 setCreateAppPaused pattern）：
  // tickFloat 每幀 ~250 個 transform 的持續 jank 會吃掉 menu 時間制 GSAP reveal → 選項跳出/卡死。
  // overlay 全屏蓋住星雲，暫停零損失；恢復時 refreshFloatRunning 會補回暫停時間，漂移不跳。
  window.setAtlasFloatPaused = (paused) => { menuPausedAtlas = !!paused; refreshFloatRunning(); };
  cleanupFns.push(() => {
    floatRunning = false;
    if (floatRaf) cancelAnimationFrame(floatRaf);
    document.removeEventListener('visibilitychange', refreshFloatRunning);
    delete window.setAtlasFloatPaused;
  });

  // ── Hover 連動 + 細節面板 ────────────────────────────
  const nameEl = /** @type {HTMLElement} */ (detail.querySelector('[data-atlas-detail-name]'));
  const descEl = /** @type {HTMLElement} */ (detail.querySelector('[data-atlas-detail-desc]'));
  // mask（2026-08-16 卡片進場改 clip-reveal）：定位/旋轉/遮罩載體，卡片在內滑動（見 atlas.css #atlas-detail-mask）
  const detailMask = /** @type {HTMLElement|null} */ (document.getElementById('atlas-detail-mask'));

  // 4 個方向的隱藏 inset（visible 區壓向各邊到 0）——卡片改滑動後只剩 chip span 收展（switchToList 等）在用
  const DETAIL_HIDDEN_INSETS = [
    'inset(100% 0% 0% 0%)', // 從上方刷掉
    'inset(0% 0% 100% 0%)', // 從下方刷掉
    'inset(0% 100% 0% 0%)', // 從右方刷掉
    'inset(0% 0% 0% 100%)', // 從左方刷掉
  ];
  const randomHiddenInset = () => DETAIL_HIDDEN_INSETS[Math.floor(Math.random() * DETAIL_HIDDEN_INSETS.length)];
  // 卡片 4 方向藏定位（±110 過衝防 dpr hairline；同 faculty SLIDE_MAP）
  const DETAIL_HIDDEN_OFFSETS = [
    { xPercent: 0,    yPercent: -110 }, // 從上方滑出
    { xPercent: 0,    yPercent: 110 },  // 從下方滑出
    { xPercent: 110,  yPercent: 0 },    // 從右方滑出
    { xPercent: -110, yPercent: 0 },    // 從左方滑出
  ];
  const randomHiddenOffset = () => DETAIL_HIDDEN_OFFSETS[Math.floor(Math.random() * DETAIL_HIDDEN_OFFSETS.length)];

  let detailTween = null;
  /** @type {'hidden' | 'visible'} */
  let panelTarget = 'hidden';

  // 卡片寬度貼齊「實際最長一行」文字寬（user 2026-06-08：atlas 說明卡寬度要以裡面文字寬為主）。
  // 為何需要：#atlas-detail 是 position:fixed width:auto + max-width:380 = shrink-to-fit，但長 title 的「未換行
  //   max-content」超過 380 → 卡片被頂到 380、實際 wrap 後最長行卻較窄 → 右側留白。CSS 無法縮到「最長 wrap 行」，
  //   故用 TreeWalker 量每行 rect 取最寬設 inline width（沿用 footer/sticky-chip snug pattern）。
  // rotation：mask 有 CSS transform:rotate(var(--atlas-detail-rot))（2026-08-16 由卡片搬到 mask）→
  // 量測前用 inline transform:'none' 暫蓋 mask、量完還原（否則 getClientRects 在旋轉座標被放大）。
  // 卡片自身的滑動 translate 不用蓋：平移不改寬度、左緣基準與文字 rects 同步位移相消。
  function snugDetailWidth() {
    detail.style.width = '';                 // 回 max-width:380 shrink-to-fit、讓長 title 在 380 內 wrap
    detail.style.minWidth = '0';             // 解除 CSS min-width:240 → 短內容(PIXAR/BMW)也貼齊不被撐到 240
    const rotEl = detailMask || detail;
    const savedTransform = rotEl.style.transform;
    rotEl.style.transform = 'none';          // 量測時拿掉旋轉
    void detail.offsetWidth;                 // force reflow
    const cs = getComputedStyle(detail);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const left = detail.getBoundingClientRect().left + padL;
    let maxRight = 0;
    const walker = document.createTreeWalker(detail, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const off = r.right - left;
        if (off > maxRight) maxRight = off;
      }
    }
    if (maxRight > 0) detail.style.width = `${Math.ceil(maxRight) + padL + padR}px`;  // CSS min-width:240/max-width:380 仍 clamp
    rotEl.style.transform = savedTransform;  // 還原 → rotation 回到 CSS var 控制
  }

  // ── 國家 detail 分批輪播（每 4s clip-path 換下一批；hover 期間持續，hover-out / 切換時停）──
  let detailBatchTimer = null;
  let detailBatches = [];
  let detailBatchIdx = 0;
  let descClipTween = null;
  // 每批筆數（2 行/筆）：桌面 8 筆連標題仍在 max-height:70vh 內不被裁；
  // 矮橫向 70vh ≈ 273px 只裝得下 3 筆（user 2026-07-06「不要被 crop、反正會自動輪播」→ 縮批不捲動）
  // 直向 3 筆：row 直排（企業上/類別下＝每筆 4 行變高）+ 卡片限高半屏（50vh-16），5 筆會被底裁
  const DETAIL_BATCH_SIZE = isLandscapeGateAtlas ? 3 : (isPortraitDotAtlas ? 3 : 8);  // 橫向矮 3 / 直向 3 / 桌面 8

  // 一筆 = 左 title（英中各一行，過長 marquee）+ 右 類別（regular）
  // 外層 .atlas-detail-row-clip（overflow:hidden）給切批時的 yPercent clip-reveal（同 list view 切換）
  function buildDetailRow(rel) {
    const clip = document.createElement('div');
    clip.className = 'atlas-detail-row-clip';
    const row = document.createElement('div');
    row.className = 'atlas-detail-row';
    const main = document.createElement('div');
    main.className = 'atlas-detail-row-main';
    const addLine = (cls, text) => {
      const span = document.createElement('span');
      span.className = cls;
      const inner = document.createElement('span');
      inner.className = 'atlas-marquee-inner';
      inner.textContent = text;
      span.appendChild(inner);
      main.appendChild(span);
    };
    if (rel.textEn) addLine('atlas-detail-row-en', rel.textEn);
    if (rel.textZh && rel.textZh !== rel.textEn) addLine('atlas-detail-row-zh', rel.textZh);
    row.appendChild(main);
    const cat = document.createElement('div');
    cat.className = 'atlas-detail-row-cat';
    if (rel.labelEn) { const e = document.createElement('span'); e.textContent = rel.labelEn; cat.appendChild(e); }
    if (rel.labelZh) { const z = document.createElement('span'); z.className = 'cat-zh'; z.textContent = rel.labelZh; cat.appendChild(z); }
    row.appendChild(cat);
    clip.appendChild(row);
    return clip;
  }

  function renderDetailBatch(idx) {
    if (!descEl) return;
    descEl.innerHTML = '';
    (detailBatches[idx] || []).forEach(rel => descEl.appendChild(buildDetailRow(rel)));
    // 卡片固定寬 → title 子欄受限，過長自動 marquee
    applyMarqueeOverflow(descEl, '.atlas-detail-row-en, .atlas-detail-row-zh', '.atlas-marquee-inner');
  }

  function stopDetailBatchCycle() {
    if (detailBatchTimer) { clearInterval(detailBatchTimer); detailBatchTimer = null; }
    if (descClipTween) { descClipTween.kill(); descClipTween = null; }
  }

  function startDetailBatchCycle(related) {
    stopDetailBatchCycle();
    detailBatches = [];
    for (let i = 0; i < related.length; i += DETAIL_BATCH_SIZE) detailBatches.push(related.slice(i, i + DETAIL_BATCH_SIZE));
    detailBatchIdx = 0;
    renderDetailBatch(0);
    if (detailBatches.length <= 1) return;  // 只有一批 → 不輪播
    detailBatchTimer = setInterval(() => {
      const swap = () => { detailBatchIdx = (detailBatchIdx + 1) % detailBatches.length; renderDetailBatch(detailBatchIdx); };
      if (typeof gsap === 'undefined') { swap(); return; }
      if (descClipTween) descClipTween.kill();
      // 切批 = clip-reveal（同 list view 切換）：當前批各列往上滑出 clip → 換批 → 新批從下方滑入
      const oldRows = [...descEl.querySelectorAll('.atlas-detail-row')];
      descClipTween = gsap.to(oldRows, {
        yPercent: -100, duration: DUR.fast, ease: EASE.exitSoft, stagger: 0.04,
        onComplete: () => {
          swap();
          const newRows = [...descEl.querySelectorAll('.atlas-detail-row')];
          descClipTween = gsap.fromTo(newRows,
            { yPercent: 100 },
            { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, stagger: 0.05, clearProps: 'transform' }
          );
        },
      });
    }, 4000);
  }

  cleanupFns.push(stopDetailBatchCycle);

  function fillDetailContent(item, ids) {
    // 每次出現都隨機三原色 bg + ±3° 旋轉，文字一律黑（亮三原色底→黑色內容原則）
    const bg = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    const rot = (Math.random() * 6 - 3).toFixed(2);
    detail.style.backgroundColor = bg;
    detail.style.color = '#000000';
    // 旋轉消費規則在 mask（clip 跟著旋轉角）→ var 設在 mask；無 mask fallback 設回 detail
    (detailMask || detail).style.setProperty('--atlas-detail-rot', `${rot}deg`);
    stopDetailBatchCycle();  // 切換 item / 重填內容先停掉上一個國家的輪播

    if (nameEl) {
      nameEl.innerHTML = '';
      nameEl.style.marginBottom = ''; // 重置回 CSS 預設 10px；co/em 有國家時下面覆寫成貼齊國家的窄距
      if (item.textEn) {
        const en = document.createElement('div');
        en.textContent = item.textEn;
        nameEl.appendChild(en);
      }
      if (item.textZh && item.textZh !== item.textEn) {
        const zh = document.createElement('div');
        zh.className = 'atlas-detail-name-zh';
        zh.textContent = item.textZh;
        nameEl.appendChild(zh);
      }
    }

    if (descEl) {
      descEl.innerHTML = '';
      if (item.category === 'D') {
        // 國家：desc 列出相關合作單位/系友就職，每筆「左 title(英中各行) + 右 類別」。
        //   不一次列完 → 每 4s clip-path 換下一批（startDetailBatchCycle），hover 期間持續輪播。
        //   卡片寬以內容為主、380 為上限 → title 子欄受限時自動 marquee。
        //   min(…, 100vw-112px)：直向手機卡片左緣讓開左下 layout btn（24 + 48 btn + 8 呼吸 +
        //   ~15 卡片 ±3° 旋轉 bbox 外擴；inline min-width 會蓋 CSS max-width，必須在這裡一起 cap）；
        //   桌面/橫向 100vw 大 → 維持 380。
        const related = [...ids]
          .filter(id => id !== item.id)
          .map(id => itemMap.get(id))
          .filter(Boolean)
          .filter(rel => rel.category !== 'D');  // 不列其他國家節點（多國工作營會把別國 D 節點也拉進同 group）
        // 卡寬以內容為主（user 2026-08-11，取代固定 380）：量「全部 related」最寬 title/label
        // （不只當前批 → 4s 批次輪播間卡寬穩定不跳）；cat 欄同步縮成最寬 label（--atlas-cat-col，
        // 各列左緣仍對齊一直欄）。380 仍是上限（超長 title 走 marquee）、240 下限、直向另有 100vw-112 cap。
        const meas = document.createElement('div');
        meas.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;';
        const probeTitle = document.createElement('span');
        probeTitle.className = 'atlas-detail-row-en';
        probeTitle.style.display = 'inline-block';
        const probeCat = document.createElement('span');
        probeCat.className = 'atlas-detail-row-cat';
        probeCat.style.display = 'inline-block';
        meas.appendChild(probeTitle);
        meas.appendChild(probeCat);
        detail.appendChild(meas);
        let titleW = 0;
        let catW = 0;
        related.forEach(rel => {
          probeTitle.textContent = rel.textEn || '';
          titleW = Math.max(titleW, probeTitle.offsetWidth);
          probeTitle.textContent = (rel.textZh && rel.textZh !== rel.textEn) ? rel.textZh : '';
          titleW = Math.max(titleW, probeTitle.offsetWidth);
          probeCat.textContent = rel.labelEn || '';
          catW = Math.max(catW, probeCat.offsetWidth);
          probeCat.textContent = rel.labelZh || '';
          catW = Math.max(catW, probeCat.offsetWidth);
        });
        meas.remove();
        // 16=左右 padding(8+8)、12=row gap；+2 防 marquee 臨界誤判
        const contentW = Math.max(240, Math.ceil(titleW + catW + 12 + 16 + 2));
        const dw = `min(${contentW}px, 380px, 100vw - 112px)`;
        detail.style.width = dw;
        detail.style.minWidth = dw;
        detail.style.setProperty('--atlas-cat-col', `${Math.ceil(catW)}px`);
        startDetailBatchCycle(related);
      } else if (String(item.id).split('-')[0] === 'co' || String(item.id).split('-')[0] === 'em') {
        // 系友環：hover 說明一律統一（英中各一行），不用 item.detail（名稱保留企業名、說明統一即可）。
        //   co-* 橢圓 ring 企業 = 系友主持 → Hosted by Alumni
        //   em-* 橢圓外 floating chip = 系友就職 → Joined by Alumni
        // 國家（有填才顯示，EN 顯示 ISO 碼、ZH 顯示中文全名，同 list 副標慣例）→ title 下方、Hosted/Joined 上方
        //   gap 配置：title 緊貼國家（走 --space-en-zh-s，同 title 是 s 級、跟標題自己的 EN/ZH 行距連動）；
        //   原本 title→desc 的 10px 大距挪到「國家→說明文字」之間
        //   （user 2026-08-03：兩行國家視覺上要跟 title 同一組，跟 Hosted/Joined 那組隔開）
        const isHost = String(item.id).split('-')[0] === 'co';
        if (item._countryCode) {
          nameEl.style.marginBottom = 'var(--space-en-zh-s)';   // title 是 s 級 → 跟 s token 連動（原寫死 2px）
          const countryEn = document.createElement('div');
          countryEn.textContent = item._countryCode.toUpperCase();
          descEl.appendChild(countryEn);
          const countryZh = document.createElement('div');
          countryZh.textContent = countryName(item._countryCode, 'zh');
          countryZh.style.marginTop = 'var(--space-en-zh-xs)';   // 英中距 1px token
          descEl.appendChild(countryZh);
        }
        const en = document.createElement('div');
        en.textContent = isHost ? 'Hosted by Alumni' : 'Joined by Alumni';
        if (item._countryCode) en.style.marginTop = '10px';
        descEl.appendChild(en);
        const zh = document.createElement('div');
        zh.textContent = isHost ? '系友主持' : '系友就職';
        zh.style.marginTop = 'var(--space-en-zh-xs)';   // 英中距 1px token
        descEl.appendChild(zh);
      } else {
        const prefix = String(item.id).split('-')[0];
        const isFaculty = FILTER_PREFIXES.faculty.includes(prefix);
        const isPartner = FILTER_PREFIXES.partners.includes(prefix);
        const subEn = isFaculty ? item._listSubEn : (isPartner ? item._listTypeEn : null);
        const subZh = isFaculty ? item._listSubZh : (isPartner ? item._listTypeZh : null);
        if (subEn || subZh) {
          if (subEn) {
            const en = document.createElement('div');
            en.textContent = subEn;
            descEl.appendChild(en);
          }
          if (subZh) {
            const zh = document.createElement('div');
            zh.textContent = subZh;
            if (subEn) zh.style.marginTop = 'var(--space-en-zh-xs)';   // 英中距 1px token（EN 有才補）
            descEl.appendChild(zh);
          }
        } else {
          descEl.textContent = item.detail || '';
        }
      }
    }

    // 國家卡固定寬（上面已設，給兩欄 layout + marquee）；其餘卡片量最長一行貼齊文字
    if (item.category !== 'D') snugDetailWidth();
  }

  // 進來新內容：先填文字 + bg + rotation。
  //   target 已是 visible（idle 或 reveal 中）→ 不動 tween，純文字 swap 撐過快速 hover
  //   target 是 hidden（idle 或 hide 中）→ 啟動 clip-in（從當前 clip-path 反向，避免重新 set 造成跳點）
  function detailRevealNew(item, ids) {
    fillDetailContent(item, ids);

    if (panelTarget === 'visible') return;

    panelTarget = 'visible';

    if (typeof gsap === 'undefined') {
      detail.style.transform = 'translate(0%, 0%)';
      return;
    }

    // 只有「panel 完全 hidden 且無進行中 tween」時才從隨機方向 reveal
    // 若 hide tween 進行中，保留當前位移作起點 → 平滑反轉成 reveal（transform 補間同 clip 版特性）
    // ⚠️ x/y（像素通道）每次都要一併歸零：CSS 預設 translateY(110%) 會被 GSAP 解析成像素 y（percent 與
    //    px 是分開合成的兩通道），只動 x/yPercent 的話殘留的像素 y 讓卡片「已 reveal 仍在畫面外」（實測踩到）
    if (!detailTween) {
      gsap.set(detail, { ...randomHiddenOffset(), x: 0, y: 0 });
    } else {
      detailTween.kill();
    }
    detailTween = gsap.to(detail, {
      xPercent: 0,
      yPercent: 0,
      x: 0,
      y: 0,
      duration: DUR.fast,
      ease: EASE.enterSoft,
      onComplete: () => { detailTween = null; },
    });
  }

  function detailHide() {
    if (panelTarget === 'hidden') return;
    panelTarget = 'hidden';
    stopDetailBatchCycle();  // hover-out → 停止國家批次輪播
    if (typeof gsap === 'undefined') {
      detail.style.transform = 'translateY(110%)';
      return;
    }
    if (detailTween) detailTween.kill();
    detailTween = gsap.to(detail, {
      ...randomHiddenOffset(),
      x: 0,
      y: 0,
      duration: DUR.fast,
      ease: EASE.exitSoft,
      onComplete: () => { detailTween = null; },
    });
  }

  cleanupFns.push(() => {
    if (detailTween && typeof detailTween.kill === 'function') detailTween.kill();
  });

  // ── D 方塊 ⇄ 國名 chip 展開（user 2026-07-10：桌面 hover / 直向手機 tap；橫向 gate 維持純方塊）──
  // 展開＝方塊長成「上英下中」chip（同 B chip 樣式，bg 沿用方塊色、黑字）；FLIP-lite：加 class 量目標
  // 尺寸 → GSAP 從方塊尺寸補間過去，rotate 同步轉正（±35° 斜字難讀）。
  // _boxW/_boxH/_squareRotDeg 同步換成展開後的值 → 逐幀連線端點自動貼展開 chip 邊；收合還原。
  let openCountryItem = null;   // hover 意圖：目前「該」展開的國家（hover-out 時歸 null）
  let openSquareItem = null;    // 物理狀態：目前 span 實際掛著 .atlas-square-open 的國家（close 動畫期間 ≠ openCountryItem）
  let countryTween = null;
  function setSquareFrame(span, w, h, r) {
    span.style.width = `${w}px`;
    span.style.height = `${h}px`;
    span.style.transform = `translate(-50%, -50%) rotate(${r}deg)`;
  }
  // 立刻（無動畫）把某顆國家方塊還原成小方塊：切換國家 / close 動畫被 kill 時用，
  //   避免「animated close 的 onComplete restore 被下一次 kill 吃掉→方塊卡在展開態、連線卻已用還原後小 box 座標」
  function hardRestoreSquare(item) {
    if (!item) return;
    const span = item._span, rot0 = item._sqRot0 || 0;
    span.classList.remove('atlas-square-open');
    span.style.width = ''; span.style.height = '';
    span.style.transform = `translate(-50%, -50%) rotate(${rot0.toFixed(2)}deg)`;
    item._boxW = item._sqW0; item._boxH = item._sqH0;
    item._squareRotDeg = rot0;
    if (openSquareItem === item) openSquareItem = null;
  }
  function openCountrySquare(item) {
    if (openCountryItem === item) return;
    const span = item._span;
    if (countryTween) { countryTween.kill(); countryTween = null; }
    // 上一顆國家（可能正在 open 或 close 動畫中）立刻還原；同一顆 re-hover 則保留、繼續往下重新展開
    if (openSquareItem && openSquareItem !== item) hardRestoreSquare(openSquareItem);
    openCountryItem = item;
    const w0 = span.offsetWidth, h0 = span.offsetHeight;
    span.classList.add('atlas-square-open');
    const w1 = span.offsetWidth, h1 = span.offsetHeight;
    openSquareItem = item;
    item._sqW0 = item._boxW; item._sqH0 = item._boxH; item._sqRot0 = item._squareRotDeg || 0;
    item._boxW = w1; item._boxH = h1;
    item._squareRotDeg = 0;
    if (typeof gsap === 'undefined') { span.style.transform = 'translate(-50%, -50%)'; return; }
    const st = { w: w0, h: h0, r: item._sqRot0 };
    countryTween = gsap.to(st, {
      w: w1, h: h1, r: 0, duration: 0.35, ease: EASE.enter,
      onUpdate: () => setSquareFrame(span, st.w, st.h, st.r),
      onComplete: () => {
        countryTween = null;
        span.style.width = ''; span.style.height = '';   // 交還 CSS（max-content，字級反向縮放自動跟）
        span.style.transform = 'translate(-50%, -50%)';
      },
    });
  }
  function closeCountrySquare() {
    const item = openCountryItem;
    if (!item) return;
    openCountryItem = null;
    const span = item._span;
    if (countryTween) { countryTween.kill(); countryTween = null; }
    const rot0 = item._sqRot0 || 0;
    item._boxW = item._sqW0; item._boxH = item._sqH0;
    item._squareRotDeg = rot0;
    const restore = () => {
      span.classList.remove('atlas-square-open');
      span.style.width = ''; span.style.height = '';
      span.style.transform = `translate(-50%, -50%) rotate(${rot0.toFixed(2)}deg)`;
      if (openSquareItem === item) openSquareItem = null;
    };
    if (typeof gsap === 'undefined') { restore(); return; }
    const w1 = span.offsetWidth, h1 = span.offsetHeight;
    // 量收合目標（方塊尺寸）：暫時脫 class + 清 inline 量一次再掛回
    span.classList.remove('atlas-square-open');
    span.style.width = ''; span.style.height = '';
    const w0 = span.offsetWidth, h0 = span.offsetHeight;
    span.classList.add('atlas-square-open');
    const st = { w: w1, h: h1, r: 0 };
    countryTween = gsap.to(st, {
      w: w0, h: h0, r: rot0, duration: 0.3, ease: EASE.exitSoft,
      onUpdate: () => setSquareFrame(span, st.w, st.h, st.r),
      onComplete: () => { countryTween = null; restore(); },
    });
  }
  cleanupFns.push(() => { if (countryTween) countryTween.kill(); });

  function showDetail(item, ids, lineSet) {
    content.classList.add('atlas-dimmed');
    pinHoverZ(item);
    setCityLineRetract(item.category === 'D' ? item : null);
    items.forEach(i => i._span.classList.toggle('atlas-highlight', ids.has(i.id)));
    Array.from(svg.children).forEach(line => line.classList.toggle('atlas-line-highlight', lineSet.has(line)));
    // A2：剛高亮的線加入逐幀更新集合 + 立刻補算一次端點（否則會從上次 hover 的舊端點 fade-in）
    activeLines.clear();
    allLines.forEach(le => { if (lineSet.has(le.line)) { activeLines.add(le); updateLineEndpoints(le); } });
    // 方塊展開國名：桌面 hover + 直向手機 tap（emulated hover 同路）；橫向 gate 維持現行不展開
    if (!isLandscapeGateAtlas) {
      if (item.category === 'D') openCountrySquare(item);
      else closeCountrySquare();
    }
    detailRevealNew(item, ids);
  }

  function clearDetail() {
    content.classList.remove('atlas-dimmed');
    unpinHoverZ();
    setCityLineRetract(null);
    items.forEach(i => i._span.classList.remove('atlas-highlight'));
    Array.from(svg.children).forEach(line => line.classList.remove('atlas-line-highlight'));
    activeLines.clear();   // A2：無高亮線 → Phase 3 idle 不更新任何 allLines
    closeCountrySquare();
    detailHide();
  }

  // 城市軌道暫停/恢復（hover 時凍結，移開後從停的位置接續）
  function pauseCityOrbit(item) {
    if (!item || !item._orbit || item._orbit.pauseStart != null) return;
    item._orbit.pauseStart = performance.now() / 1000 - floatStart;
  }
  function resumeCityOrbit(item) {
    if (!item || !item._orbit || item._orbit.pauseStart == null) return;
    const now = performance.now() / 1000 - floatStart;
    item._orbit.tOffset += now - item._orbit.pauseStart;
    item._orbit.pauseStart = null;
  }

  // B 企業環整圈 freeze / resume — hover 任一 chip 就停下全部 30 個 B chip 的 orbit + ring 整體 seesaw
  //   tickFloat 對每個 B chip 各自走 _orbit 流動公式 → 必須統一暫停所有 chip 否則環會錯位
  //   seesaw (breath/deform/z-tilt) 也一起 freeze → user 要求 hover 時「完全不動」（先前只暫停 orbit 但 seesaw 持續，視覺像「放慢」）
  function pauseRingFlow() {
    const now = performance.now() / 1000 - floatStart;
    companyItems.forEach(item => {
      if (!item._orbit || item._orbit.pauseStart != null) return;
      item._orbit.pauseStart = now;
    });
    if (ringSeesawPauseStart == null) {
      ringSeesawPauseStart = now;
    }
  }
  function resumeRingFlow() {
    const now = performance.now() / 1000 - floatStart;
    companyItems.forEach(item => {
      if (!item._orbit || item._orbit.pauseStart == null) return;
      item._orbit.tOffset += now - item._orbit.pauseStart;
      item._orbit.pauseStart = null;
    });
    if (ringSeesawPauseStart != null) {
      ringSeesawTOffset += now - ringSeesawPauseStart;
      ringSeesawPauseStart = null;
    }
  }

  // hover / tap 共用：算 item 的關聯 ids（群組成員 + 鄰居）與高亮線集合。
  // B 企業環 chip：itemNeighbors / itemLines 都是空 → 不會有連線亮起、只 dim + 自身 highlight（原行為）。
  function hoverSetsFor(item) {
    const ids = new Set([item.id]);
    item.groups.forEach(gid => {
      const g = groups.get(gid);
      if (g) g.members.forEach(m => ids.add(m));
    });
    itemNeighbors.get(item.id).forEach(n => ids.add(n));
    // 被 filter 藏掉的成員剔除（user 2026-08-10：關 filter 後 hover 國家只連/只列「畫面上存在」的 item）
    // ids 進 fillDetailContent（右下卡片清單）與 highlight → 兩處自動同步縮減
    ids.forEach(id => {
      if (id === item.id) return;
      if (isFilteredOutItem(itemMap.get(id))) ids.delete(id);
    });
    const lineSet = new Set((itemLines.get(item.id) || []).filter(l => {
      const m = lineMeta.get(l);
      return m && !isFilteredOutItem(m.src) && !isFilteredOutItem(m.city);
    }));
    return { ids, lineSet };
  }

  function onMouseOver(e) {
    if (isIntroActive()) return;   // 進場動畫期間不響應 hover
    const span = e.target && e.target.closest && e.target.closest('.atlas-name');
    if (!span) return;
    const fromSpan = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (span === fromSpan) return;

    // 從前一個 city span 離開時恢復其軌道；B chip 切換則保留 ring frozen
    if (fromSpan) {
      const prev = itemMap.get(fromSpan.dataset.itemId);
      if (prev && prev.category === 'D') resumeCityOrbit(prev);
      else if (prev && prev.category === 'B' && (!itemMap.get(span.dataset.itemId) || itemMap.get(span.dataset.itemId).category !== 'B')) {
        resumeRingFlow();
      }
    }

    const id = span.dataset.itemId;
    const item = itemMap.get(id);
    if (!item) return;
    // 被 filter 藏起（或收合動畫中已標記）的節點不觸發 hover：clip-path 動畫期間 span 仍收事件，
    // 對「正在消失」的節點開 detail 會留下永遠清不掉的 hover 態；isFilteredOutItem 補讀 state
    // 涵蓋「class 還沒掛上」的 0.4s 動畫窗口
    if (span.closest('.atlas-filtered-out') || isFilteredOutItem(item)) return;

    const { ids, lineSet } = hoverSetsFor(item);
    showDetail(item, ids, lineSet);

    // hover 城市時暫停其軌道；hover B chip 時整圈 freeze
    if (item.category === 'D') pauseCityOrbit(item);
    else if (item.category === 'B') pauseRingFlow();
  }

  function onMouseOut(e) {
    const fromSpan = e.target && e.target.closest && e.target.closest('.atlas-name');
    const toSpan   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (fromSpan && !toSpan) {
      clearDetail();
      // 離開 atlas-name 區域，恢復離開的 city 軌道 / ring flow
      const prev = itemMap.get(fromSpan.dataset.itemId);
      if (prev && prev.category === 'D') resumeCityOrbit(prev);
      else if (prev && prev.category === 'B') resumeRingFlow();
    }
  }

  content.addEventListener('mouseover', onMouseOver);
  content.addEventListener('mouseout',  onMouseOut);
  cleanupFns.push(() => {
    content.removeEventListener('mouseover', onMouseOver);
    content.removeEventListener('mouseout',  onMouseOut);
  });


  // ── Zoom + Drag pan + Intro tween ────────────────────
  let scale = defaultScaleAtlas;   // 進場拿掉 zoom（2026-07-14）→ 直接定態，改分批 fade in
  let tx = 0, ty = 0;
  let introTween = null;

  // 橫向手機圓點模式：zoom 過門檻 → stage 加 .atlas-text-zoom（CSS 圓點淡出、文字淡入）
  // 放在 applyTransform 內＝所有改 scale 的路徑（wheel / pinch / tap tween / intro / 重置）單一同步點
  let textZoomOn = false;
  // 文字反向縮放（可讀性）：--atlas-zoom-scale = max(1, scale)，CSS font-size: calc(基準 / var)
  // → zoom 後視覺字級恆定、只有間距被拉開（文字跟版面同倍縮放時 overlap 永遠解不開）。
  // 150ms 節流：改 font-size 會 reflow 全部 label，pinch 逐幀同步在手機太重；手勢結束 ≤150ms 收斂到終值。
  let fontSyncTimer = null;
  function syncZoomFontVar() {
    const v = Math.max(1, scale);
    stage.style.setProperty('--atlas-zoom-scale', v.toFixed(3));
    // D 方塊 CSS 已反向縮放（20px/v），連線端點 box（_boxW/_boxH + padding）整組同縮，
    // 否則線停在舊 20px box 邊、方塊外圍留一圈空白（user 2026-07-07）。
    // box 與 padding 都 ×1/v → 視覺 gap = (10+6)·(1/v)·v − 10 = 恆 6px，任何 zoom 都貼緊；
    // 之前只縮 _boxW（32/v−12）在 v>2.67 被 clamp、padding 殘餘照樣放大（user 抓包高倍仍有空隙）。
    // 端點逐幀重算（tickFloat / updateLineEndpoints）→ 改值下一幀即生效。
    items.forEach(it => {
      if (it.category === 'D') {
        // 展開中的國名 chip：_boxW/_boxH 是展開後實測值（openCountrySquare 設）→ 不要蓋回方塊 20/v
        if (it === openCountryItem) { it._boxPad = 6 / v; return; }
        it._boxW = 20 / v;
        it._boxH = 20 / v;
        it._boxPad = 6 / v;
      }
    });
  }
  cleanupFns.push(() => { if (fontSyncTimer) clearTimeout(fontSyncTimer); });
  let lastDesktopPadV = 0;
  function applyTransform() {
    zoomEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`;
    // 線粗細反向補償（取代 vector-effect: non-scaling-stroke，見 atlas.css .atlas-line 註解）
    stage.style.setProperty('--atlas-line-scale', scale.toFixed(4));
    if (isMobileAtlas) {   // 圓點星雲（直向+橫向手機）：zoom 過門檻 → 圓點淡出、文字淡入 + 反向縮放同步
      const on = scale >= TEXT_ZOOM_SCALE;
      if (on !== textZoomOn) {
        textZoomOn = on;
        stage.classList.toggle('atlas-text-zoom', on);
        syncZoomFontVar();   // 門檻交界立即同步（文字浮現那刻字級就是對的）
      }
      if (!fontSyncTimer) {
        fontSyncTimer = setTimeout(() => { fontSyncTimer = null; syncZoomFontVar(); }, 150);
      }
    } else {
      // 桌面 zoom：BOX_PADDING 是 content px、跟內容一起被 zoom 放大 → 高倍時線端離 chip 一大截
      //   螢幕空隙（4x 時 ~50-70px，user 2026-08-08 抓包；同 2026-07-07 手機案，當時只修了 mobile 分支）。
      //   pad ÷ max(1, scale) → 視覺 standoff 恆 ≈BOX_PADDING px；預設 0.78 時 v=1 = 原值不變。
      //   端點逐幀重算（tickFloat）→ 改值下一幀生效；純屬性寫入無 DOM，不需節流門檻以外的最佳化。
      const v = Math.max(1, scale);
      if (v !== lastDesktopPadV) {
        lastDesktopPadV = v;
        const pad = BOX_PADDING / v;
        items.forEach(it => { it._boxPad = pad; });
      }
    }
  }

  // will-change toggle：互動期間 promote layer 保流暢，idle 後移除讓瀏覽器
  // re-rasterize 當前 scale → 高 zoom 文字不糊
  let willChangeIdleTimer = null;
  function markZoomActive() {
    zoomEl.style.willChange = 'transform';
    if (willChangeIdleTimer) clearTimeout(willChangeIdleTimer);
    willChangeIdleTimer = setTimeout(() => {
      zoomEl.style.willChange = 'auto';
      willChangeIdleTimer = null;
    }, 250);
  }
  cleanupFns.push(() => {
    if (willChangeIdleTimer) clearTimeout(willChangeIdleTimer);
    zoomEl.style.willChange = '';
  });
  function clampOffsets() {
    // default（= MIN_SCALE）整個鎖死不可拖；zoom in 後才解鎖
    if (scale <= minScaleAtlas) {
      tx = 0;
      ty = 0;
      return;
    }
    const baseW = content.offsetWidth;
    const baseH = content.offsetHeight;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    // 拖曳範圍 = 內容溢出 stage 的一半（content 邊緣對齊 stage 邊緣）
    //   + 半個 stage 的 overshoot：讓 content 邊緣可拖到 stage 中央，
    //     把貼邊 / 外溢的 label 完整拉進視窗
    const PAN_OVERSHOOT_FRAC = 0.5;
    const maxX = Math.max(0, (baseW * scale - stageW) / 2) + stageW * PAN_OVERSHOOT_FRAC;
    const maxY = Math.max(0, (baseH * scale - stageH) / 2) + stageH * PAN_OVERSHOOT_FRAC;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }
  function isIntroActive() {
    return introTween && introTween.isActive && introTween.isActive();
  }

  applyTransform();

  // 進場「點燈」（2026-07-14 user）：拿掉由小到大的 zoom，改分批 fade in，一批一批亮起。
  // 四批依 legend 分組登場：① 教師 → ② 就職＋合作單位 → ③ 國家 → ④ 主持（系友企業）；連線（cityLines/co 環）隨最後一批亮起。
  // 批內用 from:'random' stagger（amount 有界＝不隨節點數暴增）＝ 一盞盞點亮感。
  // 手機／instant／reduced-motion 跳過：introTween 留 null → revealFilters 立即跑、節點維持定態可見。
  const anchorPrefix = (it) => String(it.id).split('-')[0];
  const finishIntroVisuals = () => {
    gsap.set(content.querySelectorAll('.atlas-anchor'), { clearProps: 'opacity' });
    gsap.set(svg, { clearProps: 'opacity' });
    // co 進場走 clip-reveal（非 opacity）：中斷 kill 時 span 可能卡在 hidden clip/translate → 清回定態
    items.forEach(it => {
      if (String(it.id).split('-')[0] === 'co' && it._span) {
        it._span.style.clipPath = '';
        it._span.style.translate = '';
      }
    });
  };
  if (typeof gsap !== 'undefined' && !isMobileAtlas && !options.instant && !prefersReducedMotion()) {
    const WAVES = [
      ['fc', 'ff'],                 // 教師
      ['em', 'wsg', 'ind', 'ec'],   // 就職 ＋ 合作單位
      ['country'],                  // 國家
      ['co'],                       // 主持（系友主持企業）
    ];
    const FADE = 0.6, WAVE_GAP = 0.55, STAG = 0.6;  // 末批止於 3·0.55+0.6+0.6=2.85s（≤ 3s）
    gsap.set(content.querySelectorAll('.atlas-anchor'), { opacity: 0 });
    gsap.set(svg, { opacity: 0 });

    introTween = gsap.timeline({ onComplete: finishIntroVisuals });
    WAVES.forEach((prefixes, i) => {
      const waveItems = items.filter(it => prefixes.includes(anchorPrefix(it)));
      const anchors = waveItems.map(it => it._anchor).filter(Boolean);
      if (!anchors.length) return;
      const pos = i * WAVE_GAP;
      // co（hosting 橢圓 chip）進場改 hero clip-reveal random-4-dir（user 2026-07-17）：anchor 即刻可見、
      // span 從隨機四方向 clip+translate 滑入（同 subchip toggle 的 reveal）。span 的 hidden 態在
      // bChipRevealTween 呼叫當下（＝setup t=0）同步 set 好，故 waves 1-3 期間 co 已藏（anchor opacity 0
      // 也藏）；pos 才把 anchor 設可見、各自隨機 delay 起跑 reveal。
      if (prefixes[0] === 'co') {
        introTween.set(anchors, { opacity: 1 }, pos);
        waveItems.forEach(it => {
          if (!it._span) return;
          bChipRevealTween(it._span, randomBDir(), 'show', {
            duration: FADE, tl: introTween, position: pos + Math.random() * STAG,
          });
        });
      } else {
        introTween.to(anchors, {
          opacity: 1, duration: FADE, ease: EASE.enterSoft,
          stagger: { amount: STAG, from: 'random' },
        }, pos);
      }
    });
    introTween.to(svg, { opacity: 1, duration: FADE, ease: EASE.enterSoft }, (WAVES.length - 1) * WAVE_GAP);
    cleanupFns.push(() => introTween && introTween.kill());
  } else {
    applyTransform();
  }

  function onWheel(e) {
    e.preventDefault();
    // intro 進場動畫期間：擋 scroll（preventDefault 已做）但不殺 intro tween
    // 殺掉的話 introTween.then(revealFilters) 不會 fire → filter btn 不會 wipe in
    if (isIntroActive()) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width  / 2;
    const py = e.clientY - rect.top  - rect.height / 2;

    const oldScale = scale;
    const factor = Math.exp(-e.deltaY * ZOOM_SPEED);
    let newScale = oldScale * factor;
    newScale = Math.max(minScaleAtlas, Math.min(MAX_SCALE, newScale));
    if (newScale === oldScale) return;

    const realFactor = newScale / oldScale;
    tx = px - (px - tx) * realFactor;
    ty = py - (py - ty) * realFactor;
    scale = newScale;
    clampOffsets();
    applyTransform();
    markZoomActive();
  }
  stage.addEventListener('wheel', onWheel, { passive: false });
  cleanupFns.push(() => stage.removeEventListener('wheel', onWheel));

  let dragging = false;
  let dragStartX = 0, dragStartY = 0, dragStartTx = 0, dragStartTy = 0;
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (isIntroActive()) {
      introTween.kill();
      finishIntroVisuals();   // 中斷分批 fade → 全部節點/連線立即現形，不卡在半透明
      scale = Math.max(minScaleAtlas, scale);
      applyTransform();
    }
    dragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartTx = tx; dragStartTy = ty;
    document.body.style.cursor = `url('${sitePath('custom-cursor/drag_2.svg')}') 15 15, grabbing`;
    e.preventDefault();
  }
  function onMouseMove(e) {
    if (!dragging) return;
    tx = dragStartTx + (e.clientX - dragStartX);
    ty = dragStartTy + (e.clientY - dragStartY);
    clampOffsets();
    applyTransform();
    markZoomActive();
  }
  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
  }
  stage.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);
  cleanupFns.push(() => {
    stage.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    document.body.style.cursor = '';
  });

  // ── 手機圓點星雲觸控（直向+橫向，2026-07-09 直向也套）：單指 pan / 雙指 pinch zoom / tap 圓點 zoom-in ──
  // 增量制（每 move 以上一幀 mid/dist 為基準）比 start 制簡單且 pinch↔pan 轉換無縫。
  // dot 模式 touchstart preventDefault＝擋掉瀏覽器 emulated mouseover（否則指下不可見的文字 box
  // 會觸發 hover detail 面板）；text 模式不擋 → tap chip 走原生 emulated hover = 桌面 detail 行為。
  if (isMobileAtlas) {
    let touchMode = null;   // 'pan' | 'pinch' | null
    let lastX = 0, lastY = 0, lastDist = 0;
    let tapCandidate = false, tapStartX = 0, tapStartY = 0, tapStartT = 0;
    let tapTween = null;

    /** @param {TouchList} t */
    const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    /** @param {TouchList} t */
    const touchMid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    // tap 目標置中（scale 至少升到 minZoom 解鎖 pan；預設鏡頭 scale=1.0 鎖死拖曳，不升 zoom 置不了中）
    /** @param {any} item @param {number} [minZoom] */
    function centerToItem(item, minZoom = 0) {
      const rect = stage.getBoundingClientRect();
      const r = item._span.getBoundingClientRect();
      const sx = (r.left + r.right) / 2 - rect.left - rect.width / 2;
      const sy = (r.top + r.bottom) / 2 - rect.top - rect.height / 2;
      const pxc = (sx - tx) / scale;
      const pyc = (sy - ty) / scale;
      const targetScale = Math.max(minZoom, scale);
      if (typeof gsap === 'undefined') {
        scale = targetScale; tx = -pxc * targetScale; ty = -pyc * targetScale;
        clampOffsets(); applyTransform();
        return;
      }
      const st = { s: scale, x: tx, y: ty };
      tapTween = gsap.to(st, {
        s: targetScale, x: -pxc * targetScale, y: -pyc * targetScale,
        duration: 0.7, ease: EASE.enter,
        onUpdate: () => {
          scale = st.s; tx = st.x; ty = st.y;
          clampOffsets(); applyTransform(); markZoomActive();
        },
      });
    }
    // 收合目前展開的國家（detail + 方塊 + 軌道恢復）
    function closeOpenCountry() {
      if (!openCountryItem) return;
      const prev = openCountryItem;
      clearDetail();
      resumeCityOrbit(prev);
    }

    /** @param {number} tapX @param {number} tapY */
    function handleTap(tapX, tapY) {
      if (textZoomOn) {
        // 文字模式：tap 空白處收 detail（touch 沒有 mouseout，detail 會黏住）
        const el = document.elementFromPoint(tapX, tapY);
        const span = el && el.closest && el.closest('.atlas-name');
        if (!span) { clearDetail(); return; }
        // 直向：tap 到的 chip 追加置中（detail 由隨後的 emulated hover 觸發＝桌面同路）；橫向維持現行
        if (isPortraitDotAtlas) {
          const item = itemMap.get(span.dataset.itemId);
          if (item) centerToItem(item);
        }
        return;
      }
      // ── 直向圓點模式：D 方塊 tap＝置中 + 底部說明卡 + 方塊展開國名（user 2026-07-10）；
      //    橫向 gate 維持現行（D 不可 tap、只 pinch/tap-zoom 圓點）──
      if (isPortraitDotAtlas) {
        /** @type {any} */
        let bestCity = null;
        let bestCityD = 44;   // 方塊小（20px）→ 觸控容差略放寬
        items.forEach(item => {
          if (!item._span || item.category !== 'D') return;
          if (item._anchor.classList.contains('atlas-filtered-out')) return;
          const r = item._span.getBoundingClientRect();
          const d = Math.hypot((r.left + r.right) / 2 - tapX, (r.top + r.bottom) / 2 - tapY);
          if (d < bestCityD) { bestCityD = d; bestCity = item; }
        });
        if (bestCity) {
          if (openCountryItem === bestCity) { closeOpenCountry(); return; }  // 再點同方塊＝收合
          closeOpenCountry();
          centerToItem(bestCity, CITY_TAP_ZOOM);
          const { ids, lineSet } = hoverSetsFor(bestCity);
          showDetail(bestCity, ids, lineSet);
          pauseCityOrbit(bestCity);
          return;
        }
        // 沒點到 D：先收掉已展開的國家（點空白 or 點圓點都不該殘留）
        closeOpenCountry();
      }
      // 圓點畫在 anchor 端（CSS gate 同步：default=box 左緣、side-left=右緣）→ 命中判定用同一點
      /** @param {any} item */
      const dotPoint = (item) => {
        const r = item._span.getBoundingClientRect();
        return { x: item._isSideLeft ? r.right : r.left, y: r.top + r.height / 2 };
      };
      // 找最近的圓點（D 方塊走上面直向分支；橫向 D 不可 tap，僅對 A/B/C 圓點 tap-zoom）
      /** @type {any} */
      let best = null;
      let bestD = 40;   // 40px 觸控容差
      items.forEach(item => {
        if (!item._span || item.category === 'D') return;
        if (item._anchor.classList.contains('atlas-filtered-out')) return;
        const p = dotPoint(item);
        const d = Math.hypot(p.x - tapX, p.y - tapY);
        if (d < bestD) { bestD = d; best = item; }
      });
      if (!best) return;
      // 圓點置中 + zoom 到 TAP_ZOOM_SCALE（過 TEXT_ZOOM_SCALE → 文字浮現）
      const rect = stage.getBoundingClientRect();
      const p = dotPoint(best);
      const sx = p.x - rect.left - rect.width / 2;
      const sy = p.y - rect.top - rect.height / 2;
      const pxc = (sx - tx) / scale;   // content-space（相對 content 中心）
      const pyc = (sy - ty) / scale;
      const targetScale = Math.max(TAP_ZOOM_SCALE, scale);
      if (typeof gsap === 'undefined') {
        scale = targetScale; tx = -pxc * targetScale; ty = -pyc * targetScale;
        clampOffsets(); applyTransform();
        return;
      }
      const st = { s: scale, x: tx, y: ty };
      tapTween = gsap.to(st, {
        s: targetScale, x: -pxc * targetScale, y: -pyc * targetScale,
        duration: 0.8, ease: EASE.enter,
        onUpdate: () => {
          scale = st.s; tx = st.x; ty = st.y;
          clampOffsets(); applyTransform(); markZoomActive();
        },
      });
    }

    /** @param {TouchEvent} e */
    function onTouchStart(e) {
      if (isIntroActive()) {
        introTween.kill();
        scale = Math.max(minScaleAtlas, scale);
        applyTransform();
      }
      if (tapTween) { tapTween.kill(); tapTween = null; }
      if (e.touches.length === 1) {
        touchMode = 'pan';
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        tapCandidate = true; tapStartX = lastX; tapStartY = lastY; tapStartT = performance.now();
      } else if (e.touches.length >= 2) {
        touchMode = 'pinch';
        tapCandidate = false;
        lastDist = touchDist(e.touches);
        const m = touchMid(e.touches);
        lastX = m.x; lastY = m.y;
      }
      if (!textZoomOn) e.preventDefault();
    }

    /** @param {TouchEvent} e */
    function onTouchMove(e) {
      e.preventDefault();
      if (touchMode === 'pan' && e.touches.length === 1) {
        const x = e.touches[0].clientX, y = e.touches[0].clientY;
        if (tapCandidate && Math.hypot(x - tapStartX, y - tapStartY) > 10) tapCandidate = false;
        tx += x - lastX; ty += y - lastY;
        lastX = x; lastY = y;
        clampOffsets(); applyTransform(); markZoomActive();
      } else if (touchMode === 'pinch' && e.touches.length >= 2) {
        const dist = touchDist(e.touches);
        const m = touchMid(e.touches);
        const rect = stage.getBoundingClientRect();
        const px = m.x - rect.left - rect.width / 2;
        const py = m.y - rect.top - rect.height / 2;
        const newScale = Math.max(minScaleAtlas, Math.min(MAX_SCALE, scale * (dist / (lastDist || dist))));
        // 同 onWheel：以雙指中點為 zoom 錨點；再跟隨中點平移
        const realFactor = newScale / scale;
        tx = px - (px - tx) * realFactor + (m.x - lastX);
        ty = py - (py - ty) * realFactor + (m.y - lastY);
        scale = newScale;
        lastDist = dist; lastX = m.x; lastY = m.y;
        clampOffsets(); applyTransform(); markZoomActive();
      }
    }

    /** @param {TouchEvent} e */
    function onTouchEnd(e) {
      if (e.touches.length === 0) {
        if (tapCandidate && performance.now() - tapStartT < 350) handleTap(tapStartX, tapStartY);
        touchMode = null; tapCandidate = false;
      } else if (e.touches.length === 1) {
        // pinch 收一指 → 無縫轉 pan
        touchMode = 'pan';
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        tapCandidate = false;
      }
    }

    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', onTouchEnd);
    cleanupFns.push(() => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      if (tapTween) tapTween.kill();
    });
  }

  function onResize() { clampOffsets(); applyTransform(); }
  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  // ── Filter + Layout Toggle ─────────────────────────────────────────
  const filterEl = $('#atlas-filter');
  // 提前宣告：手機 introTween 為 null → revealFilters 同步跑，宣告留在 Layout toggle 段會踩 TDZ
  const layoutBtn = $('#atlas-layout-btn');
  const btns = /** @type {HTMLElement[]} */ ([...$$('.atlas-filter-btn')]);
  // 桌面：多選 filter（預設全開）；手機：單選分類 tab（預設 faculty）
  const selected = new Set(isMobileAtlas ? ['faculty'] : btns.map(b => b.dataset.filter));

  // ── Alumni career rotating chip：map view 一個（alumni filter btn 下方）、list view 一個（alumni 欄 title 下方）
  // 用 controller factory 包 state，map / list 各持一個 instance ──
  const alumniBtn = btns.find(b => b.dataset.filter === 'alumni') || null;
  // Career chip 收/展 2026-07-15 改 hero clip-reveal（user）：本體滑動＋反向 clip 同步——
  // el xPercent/yPercent 滑入的同時 inset 同步收，兩 prop 同 ease 等於「遮罩窗固定在版位、本體滑進來」，
  // 免包 mask wrapper（chip 在 map row / 橫向 gate header row / list label-col 三種佈局，reparent 風險高）。
  // 方向依 view：星雲（map）＝左→右滑入（dir 'left'）、list view＝上→下滑入（dir 'top'）。
  // hidden 態 = 完全滑出＋clip 全收；2-phase layout 結構保留（先撐/收 layout 再滑，防 diagonal pull 重演，
  // 見 feedback_clip_path_reveal_needs_preallocated_layout_slot）。
  const CAREER_VISIBLE_CLIP = 'inset(0% 0% 0% 0%)';
  // 滑動用 CSS `translate` 獨立屬性而非 gsap xPercent：map view chip 有 inline transform:rotate(...)
  // （showCareer 同步 alumni btn 角度），translate 與 transform 疊加共存不打架（同 atlas D 方塊 FLIP pattern）。
  const CAREER_DIRS = {
    left: { hiddenClip: 'inset(0% 0% 0% 100%)' },
    top:  { hiddenClip: 'inset(100% 0% 0% 0%)' },
  };
  const CAREER_SHOWN_TRANSLATE = '0px 0px';   // 與 hidden 同 token 結構（雙值全 px），字串插值才穩定
  // 共用：帶 rotate 元素的「藏起」位移向量＝沿旋轉後自身軸（見 createCareerController 內註解；subchip 也旋轉、共用）
  function rotatedHiddenTranslate(el, dirKey) {
    const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
    const th = m ? parseFloat(m[1]) * Math.PI / 180 : 0;
    const cos = Math.cos(th), sin = Math.sin(th);
    if (dirKey === 'left') {
      const w = el.offsetWidth || 0;
      return `${(-w * cos).toFixed(2)}px ${(-w * sin).toFixed(2)}px`;
    }
    const h = el.offsetHeight || 0;
    return `${(h * sin).toFixed(2)}px ${(-h * cos).toFixed(2)}px`;
  }
  // padding 自然值（與 CSS 一致）— 2-phase reveal 的 Phase 1 layout-push tween target
  const CAREER_PAD_TOP = 6;
  const CAREER_PAD_BOTTOM = 5;
  const CAREER_PAD_HORIZONTAL = 8;  // 左右各 8px（CSS padding: 6px 8px 5px）— fitWidth 計算 chip 內容寬時用

  /**
   * @param {HTMLElement} el
   * @param {HTMLElement} enEl
   * @param {HTMLElement} zhEl
   * @param {{ noFit?: boolean, dir?: 'left'|'top' }} [opts] noFit=true → 跳過 fitWidth（讓 chip 用 CSS max-width 自由 wrap；
   *   給 list view label-col 用，避免每次 rotate 寬度跳動）；dir＝滑入方向（map 'left'、list 'top'）
   */
  function createCareerController(el, enEl, zhEl, opts) {
    const noFit = !!(opts && opts.noFit);
    const dirKey = (opts && opts.dir) || 'left';
    const dirCfg = CAREER_DIRS[dirKey];

    // 滑動向量沿「旋轉後的自身軸」（參考 about resources：位移疊在 rotate 上、沿卡片自身軸走）。
    // 純水平/垂直 translate 在旋轉 chip 上會讓 clip 窗口垂直漂移（clip 在 local space 隨 rotate 傾斜，
    // sinθ×位移量 顯示為上下偏移，user 2026-07-15「往左移時位置往上偏」）；把位移向量本身旋轉 θ
    // ＝hero「旋轉遮罩內滑動」的數學等效，窗口錨點釘死。動態算（寬度隨 fitWidth 每輪變、θ 隨 alumni 同步變）。
    function hiddenTranslatePx() { return rotatedHiddenTranslate(el, dirKey); }

    // dir='top'（list career chip）：user 2026-07-16「職業 chip 收起要 clip-reveal、向上收起向下展開」→ 改成
    //   純 hero clip-reveal（同 .atlas-list-col-title-wrapper 做法）：el 包一層 overflow:hidden mask，el 只做
    //   yPercent 平移（-100 藏在上方 ↔ 0 露出＝向下展開），layout 收合改動 mask 的 height；el 不再吃 clip-path。
    // dir='left'（map career chip）：維持 translate + 同步 clip-path（wrapper-free，chip 有 rotate 同步 alumni 角度）。
    let mask = null;
    if (dirKey === 'top' && el.parentNode) {
      mask = document.createElement('div');
      mask.className = 'atlas-list-col-career-mask';
      mask.style.overflow = 'hidden';
      // 不設 align-self:flex-start → mask 撐滿 col 寬（labelCol 預設 stretch），el 的 max-width:100% 才會相對
      //   col 寬約束 → 長字 chip 在欄內 wrap，不會穿到右欄（el 有 bg 仍靠 width:max-content 貼字寬）。
      // margin-top 直接寫 -0.5rem（= CSS .atlas-list-col-career）：controller 建時 labelCol 尚未進 DOM，
      //   getComputedStyle 讀不到 CSS 值會回 0 → 少了抵消 labelCol gap 的負 margin → chip 跟 Alumni title 間多一段 gap。
      mask.style.marginTop = '-0.5rem';
      // 初始收合＝mask height 0（show 再撐開）：el 有 CSS min-height（短職業不縮 box），會把建立時的
      //   height:0 floor 成 min-height → mask auto 會漏出一塊高；明確設 mask height:0 讓初始/未 show 時真的收合。
      mask.style.height = '0';
      el.parentNode.insertBefore(mask, el);
      mask.appendChild(el);
      el.style.marginTop = '0';
      el.style.overflow = 'visible';   // 改由 mask 裁
      el.style.clipPath = 'none';      // 清掉 CSS 的 clip-path（改用 mask + yPercent）
    }
    // 滑動「藏 / 露」狀態：top 用 yPercent（mask 裁）、left 用 clip-path + translate（wrapper-free）
    const slideHidden = () => (dirKey === 'top' ? { yPercent: -100 } : { clipPath: dirCfg.hiddenClip, translate: hiddenTranslatePx() });
    const slideVisible = () => (dirKey === 'top' ? { yPercent: 0 } : { clipPath: CAREER_VISIBLE_CLIP, translate: CAREER_SHOWN_TRANSLATE });
    let idx = 0;
    /** @type {number | null} */
    let interval = null;
    /** @type {any} */
    let tween = null;
    let visible = false;

    /** @param {{ en: string, zh: string }} career */
    function fill(career) {
      enEl.textContent = career.en;
      zhEl.textContent = career.zh;
      el.style.backgroundColor = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    }

    // 換行時 chip width 鎖到「實際最寬那行 + 對稱左右 padding」
    // 不然 max-width 卡寬度時右側會留 padding 比左側大的不對稱空白
    // Range API 量單行 rect：display:block span 的 getClientRects 是 border-box 一個 rect，要用 Range 才拿得到 per-line rects
    // noFit 模式：跳過此 fn，chip 直接靠 CSS max-width 自由 wrap（保留長字串多行能力 + 不寫 inline width 防止 col reflow）
    function fitWidth() {
      if (noFit) return;
      // 重設 inline width 讓 CSS width:max-content 接管，文字在 max-width 限制下 wrap
      el.style.width = '';
      let maxLineW = 0;
      for (const child of [enEl, zhEl]) {
        if (!child.firstChild) continue;
        const range = document.createRange();
        range.selectNodeContents(child);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          if (rects[i].width > maxLineW) maxLineW = rects[i].width;
        }
      }
      if (maxLineW > 0) {
        el.style.width = `${Math.ceil(maxLineW) + CAREER_PAD_HORIZONTAL * 2}px`;
      }
    }

    // 切下一個職業：滑出（沿 dir 反向）→ 換內容 + 換色 + 重 fit 寬度 → 滑入（hero clip-reveal：translate＋clip 同步）
    function rotateOnce() {
      if (typeof gsap === 'undefined') return;
      if (document.hidden) return;   // 背景分頁不輪播（對齊 dRelocateTimer）
      idx = (idx + 1) % careersList.length;
      if (tween) tween.kill();
      tween = gsap.to(el, {
        ...slideHidden(),
        duration: DUR.fast,
        ease: EASE.exitSoft,
        onComplete: () => {
          fill(careersList[idx]);
          // chip 滑出隱藏期間調整寬度，視覺上看不到 box 變動
          fitWidth();
          gsap.set(el, slideHidden());
          tween = gsap.to(el, {
            ...slideVisible(),
            duration: DUR.base,
            ease: EASE.enterSoft,
          });
        },
      });
    }

    /** @param {{ delay?: number }} [opts] */
    function show(opts) {
      if (visible) return;
      if (!careersList.length) return;  // 無職業資料（CMS 取不到）→ 不啟動輪播
      visible = true;
      idx = Math.floor(Math.random() * careersList.length);
      fill(careersList[idx]);
      if (typeof gsap === 'undefined') {
        if (dirKey === 'top') {
          if (mask) mask.style.height = '';
          el.style.transform = ''; el.style.height = ''; el.style.paddingTop = ''; el.style.paddingBottom = '';
          fitWidth();
          return;
        }
        el.style.height = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        fitWidth();
        el.style.clipPath = CAREER_VISIBLE_CLIP;
        el.style.translate = CAREER_SHOWN_TRANSLATE;
        return;
      }
      if (tween) tween.kill();
      // 先量寬度（要先把 padding 還原讓文字 wrap），再量自然高度
      // 左右 inline padding 先清（橫向 gate 收合態會寫 0）讓 CSS 值接手、fitWidth 量得準
      el.style.paddingLeft = '';
      el.style.paddingRight = '';
      // dir='top'：mask 收 height（layout push）、el yPercent -100→0 滑入（向下展開）；el 自然尺寸不再收 height/clip
      if (dirKey === 'top') {
        gsap.set(el, { height: 'auto', paddingTop: CAREER_PAD_TOP, paddingBottom: CAREER_PAD_BOTTOM });
        fitWidth();
        const naturalH = el.offsetHeight;
        gsap.set(el, { yPercent: -100 });
        gsap.set(mask, { height: 0, overflow: 'hidden' });
        const tlTop = gsap.timeline({ delay: (opts && opts.delay) || 0 });
        tlTop.to(mask, { height: naturalH, duration: DUR.fast, ease: EASE.enterSoft }, 0);
        tlTop.to(el, { yPercent: 0, duration: DUR.base, ease: EASE.enterSoft }, 0.3);
        tlTop.eventCallback('onComplete', () => { gsap.set(mask, { height: 'auto' }); });
        tween = tlTop;
        if (interval) clearInterval(interval);
        interval = /** @type {any} */ (setInterval(rotateOnce, 3000));
        return;
      }
      gsap.set(el, { paddingTop: CAREER_PAD_TOP, paddingBottom: CAREER_PAD_BOTTOM });
      fitWidth();
      gsap.set(el, { height: 'auto' });
      const naturalH = el.offsetHeight;
      // 橫向 gate：chip 在 header tab row（水平 flex），收合時 width 也歸零（否則 Partners 被空 box 推遠）
      // → 進場 width/左右 padding 一起從 0 撐開；桌面 column 佈局寬度不佔位、不動（user 2026-07-07）
      let gateW = null;
      if (isLandscapeGateAtlas) {
        const cs = getComputedStyle(el);
        gateW = { w: el.style.width || `${el.offsetWidth}px`, padL: cs.paddingLeft, padR: cs.paddingRight };
      }
      gsap.set(el, { height: 0, paddingTop: 0, paddingBottom: 0, clipPath: dirCfg.hiddenClip, translate: hiddenTranslatePx() });
      if (gateW) gsap.set(el, { width: 0, paddingLeft: 0, paddingRight: 0 });
      // 2-phase reveal：先靜默撐 layout（alumniRow 變高 → Partners 被推下），再 hero clip-reveal 滑入
      //（translate＋clip 同步＝遮罩窗固定在版位、本體滑進來）。拆兩 phase 避免 height 同時動造成 diagonal pull。
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        height: naturalH,
        paddingTop: CAREER_PAD_TOP,
        paddingBottom: CAREER_PAD_BOTTOM,
        ...(gateW ? { width: gateW.w, paddingLeft: gateW.padL, paddingRight: gateW.padR } : {}),
        duration: DUR.fast,
        ease: EASE.enterSoft,
      }, 0);
      tl.to(el, {
        clipPath: CAREER_VISIBLE_CLIP,
        translate: CAREER_SHOWN_TRANSLATE,
        duration: DUR.base,
        ease: EASE.enterSoft,
      }, 0.3);
      tl.eventCallback('onComplete', () => { gsap.set(el, { height: 'auto' }); });
      tween = tl;
      if (interval) clearInterval(interval);
      interval = /** @type {any} */ (setInterval(rotateOnce, 3000));
    }

    /** @param {{ delay?: number, ride?: number }} [opts] ride＝額外水平位移 px（跟著 alumni inner 一起往左走） */
    function hide(opts) {
      if (!visible) return;
      visible = false;
      if (interval) { clearInterval(interval); interval = null; }
      if (typeof gsap === 'undefined') {
        if (dirKey === 'top') {
          el.style.transform = 'translateY(-100%)';
          if (mask) mask.style.height = '0';
          return;
        }
        el.style.height = '0';
        el.style.paddingTop = '0';
        el.style.paddingBottom = '0';
        if (isLandscapeGateAtlas) { el.style.width = '0'; el.style.paddingLeft = '0'; el.style.paddingRight = '0'; }
        el.style.clipPath = dirCfg.hiddenClip;
        el.style.translate = hiddenTranslatePx();
        return;
      }
      if (tween) tween.kill();
      // dir='top'：el yPercent 0→-100 滑上去（向上收起）→ 再收 mask height（layout collapse）
      if (dirKey === 'top') {
        const curH = el.offsetHeight;
        gsap.set(mask, { height: curH });
        const tlTop = gsap.timeline({ delay: (opts && opts.delay) || 0 });
        tlTop.to(el, { yPercent: -100, duration: DUR.base, ease: EASE.exitSoft }, 0);
        tlTop.to(mask, { height: 0, duration: DUR.fast, ease: EASE.exitSoft }, 0.4);
        tween = tlTop;
        return;
      }
      // height:auto 對 GSAP tween 不友善 → 鎖當下 px 為起點
      const currentH = el.offsetHeight;
      gsap.set(el, { height: currentH });
      // 滑出 0.5s + EASE.exit＝完全對齊 .atlas-filter-btn 的 CSS 退場曲線（0.5s power3.in）——
      // career 跟 alumni btn 同刻起跑（見 hideCareer）＋同曲線＝兩顆一起離開。
      // ride（user 2026-07-16 定案）＝在自身收起之上疊「跟隨 alumni inner 的水平位移」：
      // alumni btn 退場是 inner translate -(自寬+24px) 滑出鎖死的窗（atlas.css .anchor-nav-inner），
      // career 疊同量純水平分量後，可見部分的窗剛好黏著 inner 右緣一起往左走（自收分量沿旋轉軸、
      // 被 clip 同步抵銷；ride 分量不抵銷＝窗本身的位移）。同曲線同時長 → 全程貼合。
      // ⚠️ 不是「行進滑出 row」（飛過整排 btn 的版本被打回）；deselect（btn 不退場）ride=0＝原地收起。
      const ride = (opts && opts.ride) || 0;
      let hiddenT = hiddenTranslatePx();
      if (ride) {
        const [tx, ty] = hiddenT.split(' ').map(parseFloat);
        hiddenT = `${(tx - ride).toFixed(2)}px ${ty}px`;
      }
      const buildTl = () => {
        const tl = gsap.timeline();
        // 2-phase hide：滑出（translate＋clip 同步、沿進來的方向退回）＋ ride 水平跟隨
        tl.to(el, {
          clipPath: dirCfg.hiddenClip,
          translate: hiddenT,
          duration: DUR.medium,
          ease: EASE.exit,
        }, 0);
        // 再靜默 collapse layout（Partners 上推）；橫向 gate 收合連 width 一起歸零（header 水平 row）
        tl.to(el, {
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          ...(isLandscapeGateAtlas ? { width: 0, paddingLeft: 0, paddingRight: 0 } : {}),
          duration: DUR.fast,
          ease: EASE.exitSoft,
        }, 0.5);
        tween = tl;
      };
      // ride 流程（delay>0）＝「火車模型」（user 2026-07-16 定案：career 收起速度不能比系友快，
      // 否則疊到系友 chip 上）：career 跟系友 inner 等速黏行（Phase A，CSS transition＝inner 同款
      // bezier/時長/位移量、同一 timer flush 觸發＝同一次 recalc 起跑同時鐘）、Phase B 以 Phase A 終端
      // 速度等速續行穿過「門」到全滅（車尾比車頭晚出門）。
      // 「門」＝真實 overflow 遮罩（左緣對齊系友窗左緣、同款 clip-margin 12px）：被吃的時刻/速度純由
      // 幾何決定，零時鐘同步問題——GSAP（真實時鐘跳進度、錯拍 ~140ms）與 WAAPI（起跑幀仍有殘差
      // ~18px）都試過會鑽到系友 chip 底下，唯 CSS transition＋幾何門全程貼合。
      const delayMs = ((opts && opts.delay) || 0) * 1000;
      if (delayMs > 0) {
        const BEZIER = 'cubic-bezier(0.55, 0.055, 0.675, 0.19)';   // ＝.atlas-filter-btn inner 退場曲線
        const innerW = ride - 24;   // ride＝inner 位移 calc(-100% - 24px) 的 px 值
        // 門遮罩：負 margin + 等量 padding 淨零版位，遮罩 border-box 左緣＝系友 btn 左緣；建一次重用
        let mask = el.parentElement;
        if (!mask.dataset.careerDoor) {
          mask = document.createElement('div');
          mask.dataset.careerDoor = '1';
          el.parentNode.insertBefore(mask, el);
          mask.appendChild(el);
        }
        mask.style.cssText = `overflow: clip; overflow-clip-margin: 12px; margin-left: ${-innerW}px; padding-left: ${innerW}px; flex: none;`;
        const w = el.offsetWidth || 1;
        const vEnd = (ride / DUR.medium) * ((1 - 0.19) / (1 - 0.675));  // bezier 終端斜率＝Phase A 結束瞬時速度
        const distB = w;   // Phase A 末 body 左緣已在門內 12px，再走 w 保證右緣過門＋buffer
        const TB = distB / vEnd;
        const timers = [
          setTimeout(() => {
            gsap.set(el, { clipPath: CAREER_VISIBLE_CLIP });   // 行進期間全開，由門遮罩裁
            el.style.transition = `translate ${DUR.medium}s ${BEZIER}`;
            el.style.translate = `${-ride}px 0px`;
          }, delayMs),
          setTimeout(() => {
            el.style.transition = `translate ${TB}s linear`;
            el.style.translate = `${-(ride + distB)}px 0px`;
          }, delayMs + DUR.medium * 1000),
          setTimeout(() => {
            el.style.transition = '';
            gsap.set(el, { clipPath: dirCfg.hiddenClip, translate: hiddenTranslatePx() });
            tween = gsap.to(el, {
              height: 0,
              paddingTop: 0,
              paddingBottom: 0,
              ...(isLandscapeGateAtlas ? { width: 0, paddingLeft: 0, paddingRight: 0 } : {}),
              duration: DUR.fast,
              ease: EASE.exitSoft,
            });
          }, delayMs + DUR.medium * 1000 + TB * 1000 + 60),
        ];
        tween = { kill: () => { timers.forEach(clearTimeout); el.style.transition = ''; } };
      } else {
        buildTl();
      }
    }

    function destroy() {
      if (interval) { clearInterval(interval); interval = null; }
      if (tween) { tween.kill(); tween = null; }
    }

    return { show, hide, destroy, isVisible: () => visible };
  }

  // ── Map view career chip（插在 alumni btn 後當 sibling flex item）──
  /** @type {HTMLElement | null} */
  let careerEl = null;
  /** @type {ReturnType<typeof createCareerController> | null} */
  let mapCareerCtrl = null;
  /** @type {Array<{ show: (opts?: { delay?: number }) => void, hide: (opts?: { delay?: number }) => void, destroy: () => void }>} */
  const mapSubchipCtrls = [];

  // 靜態 chip 的 2-phase show/hide ctrl — 給 map view host/employ 標籤 chip 用
  //   Init 狀態（chip 創建時 inline 設）：height:0 + padding:0 + marginTop:-0.5rem + clip-path hidden
  //     → layout 上不佔垂直空間，Partners 從 t=0 在「subchips 收起」高位
  //   Show：2-phase timeline
  //     Phase 1 (0-0.3s)：靜默撐 layout — height 0→naturalH, padding 0→自然值, marginTop -0.5rem→自然值
  //       chip 仍 clip-path hidden 不可見；Partners 在這段被流暢推下去
  //     Phase 2 (0.3-0.7s)：純 clip-path 左→右 wipe（chip 現身）
  //   Hide：反向 — Phase 1 clip-path 右→左 wipe，Phase 2 layout collapse（Partners 回推上去）
  //   COLLAPSED_MARGIN_TOP = -0.5rem 抵消 #atlas-filter { gap: 0.5rem } 讓 collapsed chip 真的零空間
  //   ⚠️ -0.5rem 是 magic number，必須跟 #atlas-filter { gap: 0.5rem } 同步
  const COLLAPSED_MARGIN_TOP = '-0.5rem';
  const CHIP_HIDDEN_CLIP = 'inset(0% 0% 0% 100%)';   // 2026-07-15 clip reveal：左 inset＝配 translate 從左滑入
  const CHIP_VISIBLE_CLIP = 'inset(0% 0% 0% 0%)';
  /** @param {HTMLElement} el */
  function createStaticChipCtrl(el) {
    let visible = false;
    /** @type {any} */
    let tween = null;
    /** @param {{ delay?: number }} [opts] */
    function show(opts) {
      if (visible) return;
      visible = true;
      el.setAttribute('tabindex', '0'); // 無障礙：顯示時可聚焦
      if (typeof gsap === 'undefined') {
        el.style.height = ''; el.style.paddingTop = ''; el.style.paddingBottom = ''; el.style.marginTop = ''; el.style.clipPath = CHIP_VISIBLE_CLIP; el.style.translate = '0px 0px';
        return;
      }
      if (tween) tween.kill();
      // 量 natural state（CSS 規則生效後的值）作 explicit tween target，避免 '' → 0 解讀後 onComplete CSS 接手造成 snap
      gsap.set(el, { paddingTop: '', paddingBottom: '', marginTop: '', height: 'auto' });
      const cs = getComputedStyle(el);
      const naturalH = el.offsetHeight;
      const naturalMarginTop = cs.marginTop;
      const naturalPaddingTop = cs.paddingTop;
      const naturalPaddingBottom = cs.paddingBottom;
      gsap.set(el, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: COLLAPSED_MARGIN_TOP, clipPath: CHIP_HIDDEN_CLIP, translate: rotatedHiddenTranslate(el, 'left') });
      // 2-phase：先撐 layout (Partners 被推下)，再純 clip-path L→R wipe
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        height: naturalH,
        paddingTop: naturalPaddingTop,
        paddingBottom: naturalPaddingBottom,
        marginTop: naturalMarginTop,
        duration: DUR.fast,
        ease: EASE.enterSoft,
      }, 0);
      tl.to(el, {
        clipPath: CHIP_VISIBLE_CLIP,
        translate: '0px 0px',
        duration: DUR.base,
        ease: EASE.enterSoft,
      }, 0.3);
      tl.eventCallback('onComplete', () => {
        // strip inline → CSS 接手（值相同無跳變）
        gsap.set(el, { height: 'auto', marginTop: '', paddingTop: '', paddingBottom: '' });
      });
      tween = tl;
    }
    /** @param {{ delay?: number }} [opts] */
    function hide(opts) {
      if (!visible) return;
      visible = false;
      el.setAttribute('tabindex', '-1'); // 無障礙：收合時移出 tab 順序
      if (typeof gsap === 'undefined') {
        el.style.height = '0'; el.style.paddingTop = '0'; el.style.paddingBottom = '0'; el.style.marginTop = COLLAPSED_MARGIN_TOP; el.style.clipPath = CHIP_HIDDEN_CLIP; el.style.translate = rotatedHiddenTranslate(el, 'left');
        return;
      }
      if (tween) tween.kill();
      const currentH = el.offsetHeight;
      gsap.set(el, { height: currentH });
      // 2-phase hide：先 clip-path R→L wipe（chip 消失），再 layout collapse（Partners 上推）
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        clipPath: CHIP_HIDDEN_CLIP,
        translate: rotatedHiddenTranslate(el, 'left'),
        duration: DUR.base,
        ease: EASE.exitSoft,
      }, 0);
      tl.to(el, {
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: COLLAPSED_MARGIN_TOP,
        duration: DUR.fast,
        ease: EASE.exitSoft,
      }, 0.4);
      tween = tl;
    }
    function destroy() { if (tween) tween.kill(); }
    return { show, hide, destroy };
  }

  /** @type {HTMLElement | null} */
  let alumniRow = null;
  /** @type {{ host?: HTMLElement, employ?: HTMLElement }} */
  const subchipMap = {};
  // Subchip toggle state — 兩個 subchip 各自可點選關閉以隱藏對應 _listSubGroup 的 alumni B chip
  // 兩個都關 → alumni 整個 inactive（走 alumni btn click 收 career + subchips + ring 的流程）
  // 重新打開 alumni → 兩 flag 重置回 true，所有 chip 重新顯示
  const subchipActive = /** @type {Record<string, boolean>} */ ({ host: true, employ: true });
  if (alumniBtn) {
    // 把 alumni btn + career chip wrap 進 horizontal row（career 放右邊，不再上下接縫）
    alumniRow = document.createElement('div');
    alumniRow.className = 'atlas-alumni-row';
    const parent = alumniBtn.parentNode;
    if (parent) {
      parent.insertBefore(alumniRow, alumniBtn);
      alumniRow.appendChild(alumniBtn);
    }

    careerEl = document.createElement('div');
    careerEl.className = 'atlas-alumni-career';
    const careerEnEl = document.createElement('span');
    careerEnEl.className = 'atlas-alumni-career-en';
    const careerZhEl = document.createElement('span');
    careerZhEl.className = 'atlas-alumni-career-zh';
    careerEl.appendChild(careerEnEl);
    careerEl.appendChild(careerZhEl);
    alumniRow.appendChild(careerEl);
    // 初始 collapsed state（chip 預設隱藏 + 不佔 layout 空間）；show 2-phase 走 createCareerController.show 處理
    careerEl.style.height = '0';
    careerEl.style.paddingTop = '0';
    careerEl.style.paddingBottom = '0';
    // 橫向 gate：header 水平 tab row 內連 width 也不佔位（否則沒點 alumni 時 Partners 被空 box 推遠）
    if (isLandscapeGateAtlas) {
      careerEl.style.width = '0';
      careerEl.style.paddingLeft = '0';
      careerEl.style.paddingRight = '0';
    }
    mapCareerCtrl = createCareerController(careerEl, careerEnEl, careerZhEl, { dir: 'left' });   // 星雲：左→右滑入

    // ── Hosting / Employment 靜態 label chip（alumniRow 下方 column 內，alumni active 才出現）
    //     灰底黑字 + 每張自帶 random tilt + cursor:pointer（map view 下可點擊）
    const HOST_EMPLOY_LABELS = [
      { en: 'Hosting',    zh: '主持',  key: 'host' },
      { en: 'Employment', zh: '就職',  key: 'employ' },
    ];
    /** @type {HTMLElement} */
    let lastInsertedEl = alumniRow;
    HOST_EMPLOY_LABELS.forEach(label => {
      const chip = document.createElement('div');
      chip.className = 'atlas-alumni-career atlas-alumni-subchip';
      chip.dataset.subgroup = label.key;
      const baseRot = randDeg();
      chip.dataset.baseRot = String(baseRot);
      chip.style.transform = `rotate(${baseRot}deg)`;
      // 初始 collapsed state（不佔垂直空間；marginTop:-0.5rem 抵消 flex gap）；show 2-phase 走 createStaticChipCtrl.show 處理
      chip.style.height = '0';
      chip.style.paddingTop = '0';
      chip.style.paddingBottom = '0';
      chip.style.marginTop = COLLAPSED_MARGIN_TOP;
      const enEl = document.createElement('span');
      enEl.className = 'atlas-alumni-career-en';
      enEl.textContent = label.en;
      const zhEl = document.createElement('span');
      zhEl.className = 'atlas-alumni-career-zh';
      zhEl.textContent = label.zh;
      chip.appendChild(enEl);
      chip.appendChild(zhEl);
      // 無障礙：subchip 是可點 <div> toggle → 補 button 語義 + 鍵盤；預設收合 tabindex=-1（不可聚焦隱形元素），
      // createStaticChipCtrl.show 顯示時改 0、hide 改回 -1（WCAG 2.1.1 / 4.1.2）。
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '-1');
      chip.setAttribute('aria-pressed', 'true');
      chip.setAttribute('aria-label', `${label.en} ${label.zh}`);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); }
      });
      lastInsertedEl.insertAdjacentElement('afterend', chip);
      lastInsertedEl = chip;
      mapSubchipCtrls.push(createStaticChipCtrl(chip));
      subchipMap[label.key] = chip;
    });

    // 點擊 subchip：toggle 對應 _listSubGroup 的 alumni B chip 顯隱
    // 兩個都關 → 模擬 alumni btn 被 deselect（apply 會走 hideCareer + ring + B items 收掉的完整 inactive 動畫）
    // 只關一個 → 走 setSubchipVisibility 純 clip-path show/hide，不動 ring 方向 / orbit 位置（user 指定不要套 alumni inactive flow）
    Object.entries(subchipMap).forEach(([key, chip]) => {
      if (!chip) return;
      chip.addEventListener('click', () => {
        subchipActive[key] = !subchipActive[key];
        chip.classList.toggle('subchip-inactive', !subchipActive[key]);
        chip.setAttribute('aria-pressed', String(subchipActive[key])); // 無障礙：報讀 toggle 狀態
        if (!subchipActive.host && !subchipActive.employ) {
          // 兩個都關 → alumni 整個 inactive；先 reset flag + class 讓下次重開 alumni 兩 subchip 都回 active
          // selected.size <= 1 的 guard 由 alumni btn 流程處理；這裡複製同邏輯（保留至少 1 個 filter active）
          if (selected.has('alumni') && selected.size > 1) {
            selected.delete('alumni');
            subchipActive.host = true;
            subchipActive.employ = true;
            Object.values(subchipMap).forEach(c => c && c.classList.remove('subchip-inactive'));
            apply(true);
          } else {
            // 不能再 deselect（只剩 alumni 一個）→ revert 剛才那次 click
            subchipActive[key] = true;
            chip.classList.remove('subchip-inactive');
          }
          return;
        }
        // 一個還開著 → 只 clip-path show/hide 該 subgroup 的 B chip，留 ring direction / orbit / career 不動
        setSubchipVisibility(key, subchipActive[key]);
        // employment 開關會影響國家節點 gate（employment/partners 皆 inactive → D 藏起）——
        // 此路徑不跑 applyMapFilter，gate 要在這裡補（user 2026-07-16）
        if (key === 'employ') applyCountriesGate(true);
      });
    });
  }

  // ── B(host)橢圓 chip hero clip-reveal helper（隨機四方向）───────────────────
  // B 環 chip 的 _span.style.translate 通道空著（tickFloat Phase 2 跳過 B 的 wobble、軌道在 _anchor、
  // 傾斜是靜態 style.rotate）→ 可疊 translate；translate 個別屬性在 rotate 之前套用＝與 clip-path 同在
  // 本地座標系，直接沿方向位移即沿各自旋轉軸乾淨滑出、免旋轉位移向量。四方向：hidden clip inset 同側
  // ＋translate 沿該側（left 藏左邊/right 藏右邊/top 藏上/bottom 藏下）。function 宣告 → hoist 到進場用。
  /** @param {HTMLElement} span @param {'left'|'right'|'top'|'bottom'} dir */
  function bChipHidden(span, dir) {
    const w = span.offsetWidth || 0, h = span.offsetHeight || 0;
    if (dir === 'right')  return { clip: 'inset(0% 100% 0% 0%)', tx: w,  ty: 0 };
    if (dir === 'top')    return { clip: 'inset(100% 0% 0% 0%)', tx: 0,  ty: -h };
    if (dir === 'bottom') return { clip: 'inset(0% 0% 100% 0%)', tx: 0,  ty: h };
    return { clip: 'inset(0% 0% 0% 100%)', tx: -w, ty: 0 };   // left
  }
  function randomBDir() { return (['left', 'right', 'top', 'bottom'])[Math.floor(Math.random() * 4)]; }
  // 建 B chip 的 clip-reveal tween（show: hidden→visible / hide: visible→hidden）。
  // ⚠️ translate 用 onUpdate + this.ratio（已含 ease）每幀直寫 style：GSAP 對 individual `translate`
  //    屬性在這類 tween 只跑 clip 不跑 translate（實測、查不出根因）→ 直寫繞開、且跟 clip 完美同步。
  //    起點的 clip+translate 同步 set（timeline 場景＝呼叫當下即 t=0 藏好）。overwrite 給快速連點。
  // opts.tl 有給就 add 進 timeline 的 position；否則獨立 gsap.to（吃 opts.delay）。
  /** @param {HTMLElement} span @param {'left'|'right'|'top'|'bottom'} dir @param {'show'|'hide'} mode */
  function bChipRevealTween(span, dir, mode, opts) {
    const { clip, tx, ty } = bChipHidden(span, dir);
    const VIS = 'inset(0% 0% 0% 0%)';
    const showing = mode === 'show';
    gsap.set(span, { clipPath: showing ? clip : VIS });
    span.style.translate = showing ? `${tx.toFixed(2)}px ${ty.toFixed(2)}px` : '0px 0px';
    const vars = {
      clipPath: showing ? VIS : clip,
      duration: opts.duration, ease: opts.ease || EASE.enterSoft, overwrite: true,
      onUpdate: function () {
        const k = showing ? (1 - this.ratio) : this.ratio;
        span.style.translate = `${(tx * k).toFixed(2)}px ${(ty * k).toFixed(2)}px`;
      },
      onComplete: () => { span.style.clipPath = ''; span.style.translate = ''; if (opts.onComplete) opts.onComplete(); },
    };
    if (opts.tl) return opts.tl.to(span, vars, opts.position);
    vars.delay = opts.delay || 0;
    return gsap.to(span, vars);
  }

  // 純 clip-path show/hide 該 subgroup 的 alumni chip，不動 ring 方向（避免 user 看到方向反轉）
  // 也不動 career / subchip 容器（alumni 整體仍 active）；alumni 全 deactivate 路徑走 applyMapFilter 含 flipRingDir 是另回事
  // host = B 環 co-* chips；employ = C floating em-* chips（兩種類型都 _listSubGroup 標記，filter by group）
  /** @param {string} key @param {boolean} visible */
  function setSubchipVisibility(key, visible) {
    const targets = items.filter(it =>
      it._listSubGroup === key &&
      (String(it.id).split('-')[0] === 'co' || String(it.id).split('-')[0] === 'em') &&
      it._anchor
    );
    if (targets.length === 0) return;

    if (typeof gsap === 'undefined') {
      targets.forEach(item => {
        item._anchor.classList.toggle('atlas-filtered-out', !visible);
        (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      });
      return;
    }

    const HIDDEN_INSETS = [
      'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)',
      'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)',
    ];
    const randomHiddenInset = () => HIDDEN_INSETS[Math.floor(Math.random() * HIDDEN_INSETS.length)];
    const TOTAL = 0.4;
    const RANGE = 0.25;
    // host 組 = B 環企業 chip：走 bChipRevealTween 的 hero clip-reveal，每顆隨機四方向（translate + 同步
    // clip；user 2026-07-17）。employ 組 = C floating chip：_span.translate 被浮動 wobble 佔用 → 維持
    // random 四方向純 clip 擦除。
    if (!visible) {
      targets.forEach(item => {
        const isB = item.category === 'B';
        const d = Math.random() * RANGE;
        const onDone = () => {
          item._anchor.classList.add('atlas-filtered-out');
          item._span.style.clipPath = '';
          if (isB) item._span.style.translate = '';
          (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
        };
        if (isB) {
          bChipRevealTween(item._span, randomBDir(), 'hide', { duration: TOTAL - d, delay: d, onComplete: onDone });
        } else {
          gsap.to(item._span, { clipPath: randomHiddenInset(), duration: TOTAL - d, delay: d, ease: EASE.enterSoft, overwrite: true, onComplete: onDone });
        }
      });
    } else {
      targets.forEach(item => {
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(syncLineDisplay);
        const isB = item.category === 'B';
        const d = Math.random() * RANGE;
        const onDone = () => {
          item._span.style.clipPath = '';
          if (isB) item._span.style.translate = '';
        };
        if (isB) {
          bChipRevealTween(item._span, randomBDir(), 'show', { duration: TOTAL - d, delay: d, onComplete: onDone });
        } else {
          gsap.set(item._span, { clipPath: randomHiddenInset() });
          gsap.to(item._span, { clipPath: 'inset(0% 0% 0% 0%)', duration: TOTAL - d, delay: d, ease: EASE.enterSoft, overwrite: true, onComplete: onDone });
        }
      });
    }
  }

  // ── List view career chip 由 renderList 動態建立、destroy 由 cleanup / renderList 自己管 ──
  /** @type {ReturnType<typeof createCareerController> | null} */
  let listCareerCtrl = null;

  // Map view 專用 wrapper — 同步 alumni btn 的 inline rotation（pivot 由 CSS transform-origin 控制）
  // companyRingEllipse 跟著 chips 一起 show/hide：alumni inactive 時整個企業環視覺消失（chips + ellipse 一起）
  /** @param {{ stagger?: number }} [opts] */
  function showCareer(opts) {
    if (!mapCareerCtrl || !careerEl) return;
    const stagger = (opts && opts.stagger) || 0;
    // career chip 在 alumni 右側並排（gap:0 緊貼），rotation 跟 alumni inner 同角度 →
    // 兩者 transform-origin 配對成接縫 pivot（alumni right edge / career left edge），旋轉後仍緊貼不脫節
    if (alumniBtn) {
      const inner = /** @type {HTMLElement | null} */ (alumniBtn.querySelector('.anchor-nav-inner'));
      careerEl.style.transform = inner && inner.style.transform ? inner.style.transform : '';
    }
    // 進場順序 career → host → employ（依 mapSubchipCtrls 順序），每個用 stagger 秒間隔
    mapCareerCtrl.show();
    mapSubchipCtrls.forEach((c, i) => c.show({ delay: (i + 1) * stagger }));
    animateRingEllipse(true);
  }
  /** @param {{ stagger?: number }} [opts] */
  function hideCareer(opts) {
    const stagger = (opts && opts.stagger) || 0;
    // 退場反向：employ → host（reverse mapSubchipCtrls 順序）
    const reversed = mapSubchipCtrls.slice().reverse();
    reversed.forEach((c, i) => c.hide({ delay: i * stagger }));
    // career 跟 alumni btn 是一體、一起往左收（user 2026-07-16）：stagger>0＝btns 也在退場的流程
    // （switchToList / playMapExit，btns reverse loop 以 i*STAGGER ms 摘 class）→ career 對齊 alumni btn
    // 的起跑時刻（reversed index × STAGGER）；曲線已在 hide() 對齊 btn CSS（0.5s power3.in）。
    // stagger=0（alumni deselect，btn 不退場）→ 維持立即收。
    let careerDelay = reversed.length * stagger;
    let ride = 0;
    if (stagger > 0 && alumniBtn) {
      const idx = [...btns].reverse().indexOf(alumniBtn);
      if (idx >= 0) careerDelay = (idx * STAGGER) / 1000;
      // ride＝alumni inner 的退場位移量（CSS translate: calc(-100% - 24px)）→ career 黏著一起往左
      const inner = /** @type {HTMLElement | null} */ (alumniBtn.querySelector('.anchor-nav-inner'));
      if (inner) ride = inner.offsetWidth + 24;
    }
    if (mapCareerCtrl) mapCareerCtrl.hide({ delay: careerDelay, ride });
    animateRingEllipse(false);
  }

  /** companyRingEllipse 用 dasharray progress 做 path-style point-to-point retract
   *  show: dasharray 從 "0 1"（無 dash 全 gap = 隱形）逐步變 "1 0"（全 dash 無 gap = 完整可見）
   *  hide: 反向 → 視覺上看到 dash 沿 path 一端往另一端收縮，跟 cityLines 同概念
   *  每次呼叫 random dashoffset → 收縮/展開 anchor 點不同，視覺多樣性
   * @param {boolean} visible */
  function animateRingEllipse(visible) {
    if (!companyRingEllipse) return;
    // 每次 random dashoffset 0-1 決定 dash 沿 path 的起點，視覺上收/展的「端點」每次不同
    const randomOffset = Math.random();
    companyRingEllipse.style.strokeDashoffset = String(randomOffset);
    if (typeof gsap === 'undefined') {
      companyRingEllipse.style.strokeDasharray = visible ? '1 0' : '0 1';
      return;
    }
    const progress = { value: visible ? 0 : 1 };  // 0 = invisible, 1 = visible
    gsap.to(progress, {
      value: visible ? 1 : 0,
      duration: DUR.micro,
      ease: visible ? 'power2.out' : 'power2.in',
      overwrite: true,
      onUpdate: () => {
        const v = progress.value;
        companyRingEllipse.style.strokeDasharray = `${v} ${1 - v}`;
      },
    });
  }
  function syncCareer() {
    if (selected.has('alumni')) {
      // show 延一幀：showCareer/subchip show 的同步量測（fitWidth Range 量測、offsetHeight/getComputedStyle
      // 多次強制 reflow）跟 applyMapFilter 幾十顆 chip 的 tween 建立擠同一幀會拉出一根長幀（實測 87ms＝
      // user 2026-07-16「subchip 出來時稍微卡頓」）→ 拆成兩幀削尖峰。isConnected 防 rAF 落在離頁 cleanup 後
      // （否則 show 會重建 3s 輪播 interval 漏到下一頁）。
      requestAnimationFrame(() => {
        if (careerEl && careerEl.isConnected && selected.has('alumni')) showCareer();
      });
    } else {
      hideCareer();
    }
  }

  cleanupFns.push(() => {
    if (mapCareerCtrl) mapCareerCtrl.destroy();
    if (listCareerCtrl) listCareerCtrl.destroy();
    mapSubchipCtrls.forEach(c => c.destroy());
  });

  // 星雲 intro zoom 完成後才依序加 .atlas-filter-revealed 觸發 clip-path wipe
  // → 與 switchToMap 一致：主視覺先、UI chrome 後，避免並行搶注意力
  // CSS 已設 clip-path: inset(0 100% 0 0) 初始隱藏，避免 init await 期間閃現
  // 順序：faculty → alumni → partners（100ms 階梯），全部 btn transition 完成後 + 0.3s 延遲
  // 才接 alumni subchips（career → host → employ 100ms 階梯，全部左→右 reveal）
  const STAGGER = 100;
  const BTN_REVEAL_DURATION = 500;  // .atlas-filter-btn CSS transition clip-path 0.5s
  const SUBCHIP_GAP = 100;          // user 指定 btn 全部現完之後 + 0.1s 才接 subchip
  const SUBCHIP_STAGGER = 0.1;      // career / host / employ 之間 0.1s 階梯（秒，gsap delay 用）
  const revealTimers = /** @type {number[]} */ ([]);
  function drainRevealTimers() {
    revealTimers.forEach(t => clearTimeout(t));
    revealTimers.length = 0;
  }
  const revealFilters = () => {
    drainRevealTimers();
    if (gateModeBtn) setModeBtnEnabled(true); // 渲染＋intro 完成 → 解鎖 header mode btn
    // layoutBtn 跟第一個 filter btn (faculty) 同時 reveal（無 stagger delay）
    if (layoutBtn) layoutBtn.classList.add('atlas-layout-revealed');
    btns.forEach((btn, i) => {
      const t = setTimeout(() => {
        if (btn.isConnected) btn.classList.add('atlas-filter-revealed');
      }, i * STAGGER);
      revealTimers.push(t);
    });
    // 最後一個 btn 結束時間（start + transition duration）+ 0.3s delay → 才開始 alumni subchips
    const subchipStart = (btns.length - 1) * STAGGER + BTN_REVEAL_DURATION + SUBCHIP_GAP;
    const syncT = /** @type {any} */ (setTimeout(() => {
      if (selected.has('alumni')) showCareer({ stagger: SUBCHIP_STAGGER });
    }, subchipStart));
    revealTimers.push(syncT);
  };
  // Race fix：gsap tween.kill() 會立刻 resolve .then() promise → revealFilters 在 cleanup 之後跑，
  // push 進 revealTimers 的新 setTimeout 不在已 drain 的 cleanup 清單，syncCareer setTimeout 無 isConnected 守衛
  // 會對 stale DOM 跑。destroyed flag 在 cleanup 時翻 true，revealFilters 走 .then() 路徑前先檢查。
  let destroyed = false;
  if (introTween) {
    // GSAP tween .then() = onComplete promise；intro 已完成則 resolve 立刻 fire
    introTween.then(() => { if (!destroyed) revealFilters(); });
  } else {
    revealFilters();
  }
  cleanupFns.push(() => {
    destroyed = true;
    revealTimers.forEach(t => clearTimeout(t));
  });

  let currentView = 'map';

  const listView = document.createElement('div');
  listView.id = 'atlas-list-view';
  main.appendChild(listView);

  cleanupFns.push(() => {
    if (filterEl) filterEl.style.display = '';
  });

  function randDeg() {
    // 設定在 ±1度 到 ±3度 之間
    const sign = Math.random() < 0.5 ? -1 : 1;
    return (sign * (1 + Math.random() * 2)).toFixed(1);
  }

  function getItemCat(item) {
    const prefix = String(item.id).split('-')[0];
    for (const [cat, prefixes] of Object.entries(FILTER_PREFIXES)) {
      if (prefixes.includes(prefix)) return cat;
    }
    return null;
  }

  // 分頁狀態（跨 page switch 保持，切回 map 不重置）
  // alumni 拆成 host (主持) / employ (就職) 兩列，配合 4-col layout
  const listGrouped = /** @type {Record<string, object[]>} */ ({ faculty: [], host: [], employ: [], partners: [] });
  const listPageState = /** @type {Record<string, number>} */ ({ faculty: 0, host: 0, employ: 0, partners: 0 });

  // 副標 12px line-height 1.3 → 每行 ~15.6px；name 14.4px × 1.3 → 每行 ~18.7px
  // faculty/employ/host: name + 1 sub ≈ 84；partners: name + 2 subs ≈ 120
  // ITEM_H_PER_CAT 為「預估值」初始 layout 用；renderListPage 跑完會 post-measure 實測 + 更新此表
  const ITEM_H_PER_CAT = /** @type {Record<string, number>} */ ({
    faculty: 84,
    host: 84,
    employ: 84,
    partners: 120,
  });

  // 進場 section delay：faculty / alumni(host+employ) / partners = 0 / 0.08 / 0.16（alumni 內 host+employ
  // 同 delay → 3 區塊視覺同時進場）。switchToList 首次進場與 pre-measure 重渲染重播進場（playColEnterAnim）共用。
  const SECTION_DELAY = /** @type {Record<string, number>} */ ({
    faculty: 0,
    host: 0.08,
    employ: 0.08,
    partners: 0.16,
  });

  // chevron y 由 #atlas-layout-btn top 決定 → 三欄 chevrons 永遠在同 y（不因 list 高度漂移）
  //   per-col rowsPerCol + gap 自由變化（item 矮 cat → gap 大、item 高 cat → gap 小或 row 少）
  //   item 多的 col 可能塞滿（chevron 緊貼最後 item），item 少的 col gap 拉開
  // 手機 list：item 自然高 + 固定 gap、由上往下排（slot 均分制已棄 — 4/5 行 item 的 slot
  // 死空間讓視覺 gap 不一致 + 量測時序造成初載/回頁排版不一致，user 2026-06-13）
  const LIST_GAP_MOBILE = 24;

  // 手機逐 item 實高（ghost pre-measure 時填入，與 listGrouped[cat] 同序）→ 變高分頁用
  const ITEM_HEIGHTS_PER_CAT = /** @type {Record<string, number[]>} */ ({});

  // 直向手機 alumni tab：host/employ 左右並排（grid span 1 各半寬）→ 每欄只排單一 sub-col，
  // chevron nav 各自跨自己那半欄（user 2026-07-06）；CSS 手機 media block grid-column 規則同步。
  // 橫向 gate 不適用（一次只顯示一個 subgroup、全寬 3 欄）
  /** @param {string} cat */
  const isMobileSingleSubCol = (cat) => isMobileAtlas && !isLandscapeGateAtlas && (cat === 'host' || cat === 'employ');
  // 每欄 sub-col 數：直向 alumni=1、橫向 gate=3（user 2026-07-07 三欄 layout）、其餘（直向/桌面）=2
  /** @param {string} cat */
  const listSubCols = (cat) => isMobileSingleSubCol(cat) ? 1 : (isLandscapeGateAtlas ? 3 : 2);

  // 手機變高分頁（user 2026-07-03「host 只兩行/partners 應四行」）：
  // 均一 slot 制用全分類最高 item 估行數，一個折行的長名 item 就把整類行高灌高、短 item 頁浪費大量高度。
  // 改用 ghost 實測高度，每頁「兩欄各自實際放得下 + 依 count 平分」塞到放不下為止。
  // 未量測（首次渲染）回傳 null → fallback 均一 slot 制；ghost 量完會重渲染套用。
  /** @param {string} cat @param {number} containerH @returns {{start:number,count:number,split:number}[]|null} */
  function calcMobilePages(cat, containerH) {
    const hs = ITEM_HEIGHTS_PER_CAT[cat];
    const total = (listGrouped[cat] || []).length;
    if (!hs || hs.length !== total) return null;
    /** @param {number[]} arr */
    const fits = arr => arr.reduce((s, h) => s + h, 0) + LIST_GAP_MOBILE * Math.max(0, arr.length - 1) <= containerH;
    const pages = [];
    // 每頁塞法依 sub-col 數（listSubCols）：直向 alumni=1（整頁同欄）、橫向 gate=3、其餘=2；
    // 每欄依 count 平分後「各欄實際放得下」才算一頁
    const cols = listSubCols(cat);
    let i = 0;
    while (i < total) {
      let best = 1; // 單一 item 比 container 高也硬放（否則卡死）
      for (let n = 1; i + n <= total; n++) {
        const c = Math.ceil(n / cols);
        let ok = true;
        for (let k = 0; k < cols && ok; k++) {
          if (!fits(hs.slice(i + k * c, i + Math.min(n, (k + 1) * c)))) ok = false;
        }
        if (ok) best = n;
        else break;
      }
      pages.push({ start: i, count: best, split: Math.ceil(best / cols) });
      i += best;
    }
    return pages;
  }

  /** @param {string} cat @param {HTMLElement} [col] 手機用實際欄高當預算（可省略 → 公式 fallback） */
  function calcListPageSize(cat, col) {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height').trim()) || 80;
    // 標題區佔用：titleblock chip (~31) + col gap (~16) + rotation 餘量 (~5) ≈ 52
    const TITLEBLOCK_H = 52;
    if (isMobileAtlas) {
      // 手機：底部 = 三分類 tab + 最底 layout btn 兩層 bar。
      // 128 = #atlas-list-view 手機 bottom（CSS 同步：btn 16+48 + tab ~40 + 呼吸）；
      // alumni tab = host/employ 左右並排（span 1 各半寬、單 sub-col，user 2026-07-06）→ 欄高同全寬欄；
      // host/employ 保留 col title 區分左右兩欄 → 扣 TITLEBLOCK_H；faculty/partners 手機不顯示 col title
      // （tab 已標示分類）→ 不扣。
      // 額外 -12 底部呼吸：滿頁時最後一個 item 不貼死 chevron / tab 區（user 2026-06-13）
      // 橫向 gate：tab 在 header 列、無底部 bar → top 104 / bottom 12（CSS gate 同步）、titleblock 全隱不扣
      const avail = isLandscapeGateAtlas
        ? window.innerHeight - 104 - 12 - 12
        : window.innerHeight - 168 - (headerH + 24) - 12;   // 直向：top header+24、bottom 168（CSS 同步，user 2026-07-09 起始抬高+底部拉開）
      const isAlumniCol = !isLandscapeGateAtlas && (cat === 'host' || cat === 'employ');
      const colH = avail;
      // chevron 改跨整欄貼底（同桌面，user 2026-07-03）→ items 區扣 chevron 帶，最後一排不壓到 nav
      // 64 = nav bottom 18 + chevron ~28 + 上方呼吸 ~18（user 2026-07-03 要求內容/tab 兩側都多留）；CSS padding-bottom 同步
      const CHEVRON_BAND_MOBILE = 64;
      // 預算優先用實際 CSS 欄高（clientHeight 含 padding=band；上面手算公式與 CSS 實測有 12-15px 漂移，
      // 會白白少排一行）；欄 display:none 量到 0 → fallback 公式（tab 首次切到該欄時會重 render 再量）
      const itemsBox = col ? /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-col-items')) : null;
      const realBoxH = itemsBox ? itemsBox.clientHeight : 0;
      const containerH = realBoxH > 0
        ? realBoxH - CHEVRON_BAND_MOBILE
        : colH - (isAlumniCol ? TITLEBLOCK_H : 0) - CHEVRON_BAND_MOBILE;
      const itemH = ITEM_H_PER_CAT[cat] || 84;
      // 行數以「全分類最高 item + 固定 gap」估最壞情況（rows*(h+g) ≤ C+g）→ 自然高排列永不溢出；
      // gap 固定 = 視覺間距每頁、每 item 一致（不再依 leftover 均分）
      const rowsPerCol = Math.max(2, Math.floor((containerH + LIST_GAP_MOBILE) / (itemH + LIST_GAP_MOBILE)));
      return { rowsPerCol, gap: LIST_GAP_MOBILE, itemH, containerH };
    }
    // chevron 底線 = layout 按鈕頂端再往上留 16px（給 chevron icon 本身高度 + 視覺呼吸）
    //   layoutBtn 不存在 fallback 用 viewport - 84
    const layoutBtn = document.getElementById('atlas-layout-btn');
    let chevronBottomY;
    if (layoutBtn) {
      const rect = layoutBtn.getBoundingClientRect();
      chevronBottomY = rect.top - 16;
    } else {
      chevronBottomY = window.innerHeight - 84;
    }
    // items 容器頂 = headerH + 64 (上方留白) + TITLEBLOCK_H；底 = chevronBottomY
    // chevron 跨整欄、貼欄底 → 從 items 區再扣一條 CHEVRON_BAND，items 在其上整片均分、最後一個落在 chevron 上緣
    // （user 2026-06-25；之前 chevron 佔 1 整列 slot 害 items 上面擠、底部空一大塊）。
    const CHEVRON_BAND = 48;
    const containerH = chevronBottomY - headerH - 64 - TITLEBLOCK_H - CHEVRON_BAND;
    const itemH = ITEM_H_PER_CAT[cat] || 84;
    const rowsPerCol = Math.max(3, Math.floor(containerH / itemH));
    const leftover = Math.max(0, containerH - (rowsPerCol * itemH));
    const gap = rowsPerCol > 1 ? leftover / (rowsPerCol - 1) : 0;
    return { rowsPerCol, gap, itemH };
  }

  /** @param {any} item @param {string} cat @returns {HTMLElement} */
  function buildListItemEl(item, cat) {
    // 外層 wrapper：min-height 撐 row slot；內部每行包 .atlas-list-line-clip 各自獨立 yPercent reveal
    const wrapper = document.createElement('div');
    wrapper.className = 'atlas-list-item-wrapper';

    const el = document.createElement('div');
    el.className = 'atlas-list-item';
    el.dataset.category = cat;

    // line-clip helper：每行（title / 副標）獨立 overflow:hidden 遮罩 → 進場 title 先、副標後
    /** @param {HTMLElement} child */
    function appendLine(child) {
      const clip = document.createElement('div');
      clip.className = 'atlas-list-line-clip';
      clip.appendChild(child);
      el.appendChild(clip);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'atlas-list-item-name';
    // 主標 en/zh 各一行；用 .atlas-marquee-inner 包文字便於 overflow 時 marquee
    if (item.textEn) {
      const en = document.createElement('span');
      en.className = 'atlas-list-name-en';
      const enInner = document.createElement('span');
      enInner.className = 'atlas-marquee-inner';
      enInner.textContent = item.textEn;
      en.appendChild(enInner);
      nameEl.appendChild(en);
    }
    if (item.textZh && item.textZh !== item.textEn) {
      const zh = document.createElement('span');
      zh.className = 'atlas-list-name-zh';
      const zhInner = document.createElement('span');
      zhInner.className = 'atlas-marquee-inner';
      zhInner.textContent = item.textZh;
      zh.appendChild(zhInner);
      nameEl.appendChild(zh);
    }
    appendLine(nameEl);

    // 副標 helper：英上中下，各一行（每個副標自成一條 line-clip → 獨立 reveal）
    /** @param {string|undefined} en @param {string|undefined} zh */
    function appendSub(en, zh) {
      if (!en && !zh) return;
      const sub = document.createElement('div');
      sub.className = 'atlas-list-item-label';
      // 副標 en/zh 各一行，用 .atlas-marquee-inner 包文字 → 過長截斷、hover marquee（同主標）
      const addLabel = (cls, text) => {
        const label = document.createElement('span');
        label.className = cls;
        const inner = document.createElement('span');
        inner.className = 'atlas-marquee-inner';
        inner.textContent = text;
        label.appendChild(inner);
        sub.appendChild(label);
      };
      if (en) addLabel('atlas-list-item-label-en', en);
      if (zh) addLabel('atlas-list-item-label-zh', zh);
      appendLine(sub);
    }

    if (cat === 'faculty' || cat === 'employ' || cat === 'host') {
      // faculty: 職稱(＋國家)；employ/host: 國家
      appendSub(item._listSubEn, item._listSubZh);
    } else if (cat === 'partners') {
      // 先國家、後類型（user 2026-06-23 對調）
      appendSub(item._listCountryEn, item._listCountryZh);
      appendSub(item._listTypeEn, item._listTypeZh);
    }
    wrapper.appendChild(el);
    return wrapper;
  }

  /** @param {HTMLElement} col @param {string} cat @param {number} page @param {boolean} [skipAnim] */
  function renderListPage(col, cat, page, skipAnim = false) {
    // 切頁過渡期間擋 double-click（exit 期間若再點 chevron 會抓到正在 exit 的 lines 動亂）
    if (col.dataset.transitioning === '1') return;

    const itemsEl = /** @type {HTMLElement} */ (col.querySelector('.atlas-list-col-items'));
    // partners: name + type + country = 3；其餘 (faculty/employ/host): name + 1 sub = 2
    const linesPerItem = cat === 'partners' ? 3 : 2;
    const useAnim = !skipAnim && typeof gsap !== 'undefined';
    // 先抓舊 lines（exit 動畫對象）。skipAnim 時不需要 → 跳過量測
    const existingLines = useAnim
      ? /** @type {HTMLElement[]} */ ([...itemsEl.querySelectorAll('.atlas-list-line-clip > *')])
      : [];

    const sizeInfo = calcListPageSize(cat, col);
    const rowsPerCol = sizeInfo.rowsPerCol;
    // 手機不在這裡設：slot/gap 是「當頁實高」制（build 量完才設），在 exit 動畫前先設回
    // 全分類統一值會把正在出場的舊 items 重新撐高 → 「先往下移再出場」（user 2026-06-13）
    if (!isMobileAtlas) {
      col.style.setProperty('--list-gap', `${sizeInfo.gap}px`);
      // 每格高度透過 CSS var 同步給 .atlas-list-item 與 .atlas-list-nav-item 的 min-height
      // → col2 nav 佔 1 個 slot，與 col1 最後一個 item 底部對齊
      col.style.setProperty('--list-item-h', `${sizeInfo.itemH}px`);
    }

    const allItems = listGrouped[cat];
    // chevron 桌面手機一律跨整欄、貼 col-items 底帶（calcListPageSize 兩端都已扣 chevron 帶）。
    // 2026-07-03 手機對齊桌面（原本 nav 佔右 sub-col 1 slot → 兩欄 5/4 不均 + chevron 擠在右半）。
    const itemsPerPage = rowsPerCol * listSubCols(cat);
    // 手機：ghost 量到實高後改變高分頁（每頁塞到兩欄實際放得下為止）；未量測 fallback 均一 slot 制
    const mobilePages = isMobileAtlas ? calcMobilePages(cat, sizeInfo.containerH) : null;
    const maxPage = mobilePages
      ? mobilePages.length - 1
      : Math.max(0, Math.ceil(allItems.length / itemsPerPage) - 1);
    const safePage = Math.min(Math.max(0, page), maxPage);
    listPageState[cat] = safePage;

    const pageSpec = mobilePages
      ? mobilePages[safePage]
      : { start: safePage * itemsPerPage, count: itemsPerPage, split: rowsPerCol };
    const pageItems = /** @type {any[]} */ (allItems).slice(pageSpec.start, pageSpec.start + pageSpec.count);

    // 抽出 build 邏輯：清空舊 DOM、塞新 sub-cols、跑 enter 動畫
    // enterDirsHint：exit 階段傳來的「反向」方向陣列，讓新 item 從舊 item 退場的反方向進場
    // chevron 切頁時保持不動（使用者要求：只在 view 切換時動，分頁切換不動）
    /** @param {(number|undefined)[]|null} enterDirsHint */
    function build(enterDirsHint) {
      itemsEl.innerHTML = ''; // clears both sub-cols

      // sub-col 數依情境（listSubCols）：桌面/直向=2、直向 alumni=1、橫向 gate=3。
      // 手機平分當頁 items（user 2026-07-03；變高分頁時 split 由 calcMobilePages 算好）；桌面維持先填滿左欄
      const numCols = listSubCols(cat);
      const splitAt = mobilePages
        ? pageSpec.split
        : isMobileSingleSubCol(cat) ? pageItems.length
        : (isMobileAtlas ? Math.min(rowsPerCol, Math.ceil(pageItems.length / numCols)) : rowsPerCol);
      const subCols = [];
      for (let k = 0; k < numCols; k++) {
        const sc = document.createElement('div');
        sc.className = 'atlas-list-sub-col';
        pageItems.slice(k * splitAt, (k + 1) * splitAt).forEach(item => sc.appendChild(buildListItemEl(item, cat)));
        subCols.push(sc);
      }

      const navItem = document.createElement('div');
      navItem.className = 'atlas-list-nav-item';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'atlas-list-nav-btn';
      prevBtn.innerHTML = '<span class="icon icon-chevron-list"></span>';
      prevBtn.disabled = safePage <= 0;
      prevBtn.addEventListener('click', () => renderListPage(col, cat, safePage - 1));

      const nextBtn = document.createElement('button');
      nextBtn.className = 'atlas-list-nav-btn';
      nextBtn.innerHTML = '<span class="icon icon-chevron-list rotate-180"></span>';
      nextBtn.disabled = safePage >= maxPage;
      nextBtn.addEventListener('click', () => renderListPage(col, cat, safePage + 1));

      navItem.appendChild(prevBtn);
      navItem.appendChild(nextBtn);

      // 手機滿頁：剩餘高度攤進間距（CSS .is-full → space-between；不足頁頂部排列不硬撐）
      // 變高分頁：「滿」= 被容量截斷的頁（還有下一頁）；最後一頁頂部排列
      if (isMobileAtlas) {
        const pageFull = mobilePages ? safePage < maxPage : pageItems.length === itemsPerPage;
        subCols.forEach(sc => sc.classList.toggle('is-full', pageFull));
      }

      subCols.forEach(sc => itemsEl.appendChild(sc));
      // nav append 到 .atlas-list-col-items（position:relative）→ 跨整欄、< 頂左緣 / > 頂右緣（CSS space-between）
      itemsEl.appendChild(navItem);

      // 主標 marquee：DOM 進入 layout 後（次幀）量寬決定是否需要 marquee
      requestAnimationFrame(() => applyListMarquee(itemsEl));

      // 手機：item 自然高（wrapper min-height 由 CSS 手機 override 解除）+ 固定 gap，
      // 不量測 → 初載/回頁排版恆定（量測制曾因時序量出不同值，user 2026-06-13）。
      // 在 build 完才設（不在 renderListPage 開頭）：exit 期間舊排版不動。
      if (isMobileAtlas) {
        col.style.setProperty('--list-gap', `${sizeInfo.gap}px`);
      }

      // Global pre-measure：第一次 render 時把 cat 全 items 渲染 off-screen 量 max actual height
      //   → ITEM_H_PER_CAT[cat] 永遠是該 cat 的「最高 item 真實高度」，不隨頁數變化
      //   → rowsPerCol / gap / chevron pos 跨頁穩定
      //   guard：col.dataset.measured 防 measure→rerender→measure 死循環
      if (!col.dataset.measured) {
        col.dataset.measured = '1';
        requestAnimationFrame(() => {
          const allCatItems = listGrouped[cat] || [];
          if (allCatItems.length === 0) return;
          // ghost sub-col 用真 sub-col 寬度 → wrap 計算精準
          const realSubCol = /** @type {HTMLElement|null} */ (itemsEl.querySelector('.atlas-list-sub-col'));
          if (!realSubCol) return;
          const subColW = realSubCol.getBoundingClientRect().width;
          // 手機 tab 未選的欄 display:none → 量到 0 寬，ghost 會每字換行把 ITEM_H 灌爆；
          // 清掉 measured flag 讓該欄第一次顯示時（tab 切換重 render）再測
          if (subColW < 1) { col.dataset.measured = ''; return; }
          const ghost = document.createElement('div');
          ghost.className = 'atlas-list-sub-col';
          ghost.style.position = 'absolute';
          ghost.style.visibility = 'hidden';
          ghost.style.pointerEvents = 'none';
          ghost.style.left = '-99999px';
          ghost.style.top = '0';
          ghost.style.width = `${subColW}px`;
          ghost.style.height = 'auto';
          ghost.style.overflow = 'visible';
          // 關鍵：CSS .atlas-list-item-wrapper { min-height: var(--list-item-h, 84px) }
          //   ghost 沒設此 var → fallback 84px 會把 host 自然高度（~40）灌成 84
          //   → ITEM_H_PER_CAT.host 被測量結果灌爆，每個 item slot 多預留 ~40px 像「副標空位」
          //   設為 0 讓 wrapper 純 content-size，pre-measure 拿到真正自然高度
          ghost.style.setProperty('--list-item-h', '0px');
          // append 到 listView 內部（繼承 grid context + 字體 / line-height）
          listView.appendChild(ghost);
          allCatItems.forEach(item => ghost.appendChild(buildListItemEl(item, cat)));
          let maxH = 0;
          const heights = /** @type {number[]} */ ([]);
          ghost.querySelectorAll('.atlas-list-item').forEach(el => {
            const h = el.getBoundingClientRect().height;
            heights.push(Math.ceil(h));
            if (h > maxH) maxH = h;
          });
          listView.removeChild(ghost);
          const pre = ITEM_H_PER_CAT[cat] || 84;
          if (maxH > pre + 2) ITEM_H_PER_CAT[cat] = Math.ceil(maxH);
          // 手機：存逐 item 實高 → renderListPage 改走變高分頁（calcMobilePages）
          if (isMobileAtlas) ITEM_HEIGHTS_PER_CAT[cat] = heights;
          if (maxH > pre + 2 || isMobileAtlas) {
            renderListPage(col, cat, safePage, true);
            // 此重渲染（桌面 ITEM_H 預設不準 / 手機首次量到實高）會洗掉 switchToList 剛起跑的進場動畫
            // → 對重建後的欄重播同樣的 staggered 進場，否則 faculty 等高 item 欄首次切換時看起來「沒進場」
            if (currentView === 'list') playColEnterAnim(col, cat, SECTION_DELAY[cat] ?? 0);
          }
        });
      }

      if (!useAnim) return;

      // Enter 動畫：title / 副標分別進場（每行 overflow:hidden 遮罩 + yPercent:±100→0）
      // chevron 切頁時不動（使用者要求：只在 view 切換動，分頁切換不動）
      // 方向：若有 hint（從 exit 反向）就用，沒有則 random
      const lines = /** @type {HTMLElement[]} */ ([...itemsEl.querySelectorAll('.atlas-list-line-clip > *')]);
      const numItems = Math.ceil(lines.length / linesPerItem);
      const enterDirs = Array.from({ length: numItems }, (_, idx) => {
        const hint = enterDirsHint && enterDirsHint[idx];
        return (hint === 100 || hint === -100) ? hint : (Math.random() < 0.5 ? 100 : -100);
      });
      // 切頁進場：所有 lines 同時進場（無 stagger）
      gsap.fromTo(lines,
        { yPercent: (/** @type {number} */ i) => enterDirs[Math.floor(i / linesPerItem)] },
        { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, clearProps: 'transform', overwrite: true }
      );
    }

    // 有舊內容且開啟動畫 → 同時退場 → 完成後 build 新內容並反向進場
    // chevron 不動（lines only）
    if (useAnim && existingLines.length > 0) {
      const oldNumItems = Math.ceil(existingLines.length / linesPerItem);
      const exitDirs = Array.from({ length: oldNumItems }, () => Math.random() < 0.5 ? 100 : -100);
      col.dataset.transitioning = '1';
      gsap.to(existingLines, {
        yPercent: (/** @type {number} */ i) => exitDirs[Math.floor(i / linesPerItem)],
        duration: DUR.medium,
        ease: EASE.exit,
        overwrite: true,
        onComplete: () => {
          // 新 item 進場方向 = 舊退場方向的反向（同 position 對應 ±100 互換）
          build(exitDirs.map(d => -d));
          col.dataset.transitioning = '';
        },
      });
    } else {
      build(null);
    }
  }

  // 單欄進場動畫：col title + 每 item 各行 line（yPercent 滑入）+ chevron（clip 揭露），同層 stagger。
  // switchToList 首次進場與 pre-measure 重渲染（會洗掉首次動畫）共用 → 確保每欄一致的 staggered reveal，
  // 不會因 faculty 等「item 較高需重渲染」的欄在首次切換時失去進場動畫。
  /** @param {HTMLElement} col @param {string} cat @param {number} [delay] */
  function playColEnterAnim(col, cat, delay = 0) {
    if (typeof gsap === 'undefined') return;
    // 每 item 預設 stagger 0.08s；用 STAGGER_WINDOW 上限壓縮多 items 的欄（如 host），確保各欄結束時間相近
    const BASE_ITEM_STAGGER = 0.08;
    const STAGGER_WINDOW = 1.0;
    const titleEl = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-col-title'));
    if (titleEl) {
      // 標題 chip 進場用 DUR.slow(0.6) 而非 DUR.reveal(1.0)：user 2026-07-16 覺得左上角欄標題 chip 進場偏慢；
      // item lines / chevron 維持 DUR.reveal（chip 先落定、內容隨後）
      gsap.fromTo(titleEl,
        { yPercent: 100 },
        { yPercent: 0, duration: DUR.slow, delay, ease: EASE.enter, clearProps: 'transform', overwrite: true }
      );
    }
    // partners 3 行 / 其餘 (faculty/employ/host) 2 行
    const linesPerItem = cat === 'partners' ? 3 : 2;
    const lines = /** @type {HTMLElement[]} */ ([...col.querySelectorAll('.atlas-list-line-clip > *')]);
    const navItem = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-nav-item'));
    const numItems = lines.length ? Math.ceil(lines.length / linesPerItem) : 0;
    const itemStagger = numItems > 1
      ? Math.min(BASE_ITEM_STAGGER, STAGGER_WINDOW / (numItems - 1))
      : 0;
    if (lines.length) {
      // 每個 item 隨機從上方或下方滑入（item 內 lines 共用同方向）
      const itemDirs = Array.from({ length: numItems }, () => Math.random() < 0.5 ? 100 : -100);
      gsap.fromTo(lines,
        { yPercent: (/** @type {number} */ i) => itemDirs[Math.floor(i / linesPerItem)] },
        {
          yPercent: 0, duration: DUR.reveal, delay, ease: EASE.enter, clearProps: 'transform', overwrite: true,
          stagger: (/** @type {number} */ i) => Math.floor(i / linesPerItem) * itemStagger + (i % linesPerItem) * 0.05,
        }
      );
    }
    // chevron 進場：clip-path inset 原地揭露（位置固定 / 不平移）；timing 接在最後 item 之後
    // inset 四值必須統一用 % 單位，否則 GSAP 解析不到、直接跳終值（看起來像「跳進來」）
    if (navItem) {
      gsap.fromTo(navItem,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: DUR.reveal,
          delay: delay + numItems * itemStagger,
          ease: EASE.enter,
          clearProps: 'clipPath',
          overwrite: true,
        }
      );
    }
  }

  // 主標 marquee 偵測：用共用 utility applyMarqueeOverflow（取代 atlas/courses-map/library-panels 三處重複）
  /** @param {HTMLElement} container */
  function applyListMarquee(container) {
    applyMarqueeOverflow(container, '.atlas-list-name-en, .atlas-list-name-zh, .atlas-list-item-label-en, .atlas-list-item-label-zh', '.atlas-marquee-inner');
  }

  function renderList() {
    listView.innerHTML = '';

    // Align left to logo position (container left + paddingLeft)
    const siteContainer = /** @type {HTMLElement|null} */ (document.querySelector('.site-container'));
    const containerLeft = siteContainer
      ? Math.round(siteContainer.getBoundingClientRect().left + parseFloat(getComputedStyle(siteContainer).paddingLeft))
      : 60;
    listView.style.left = `${containerLeft}px`;

    Object.keys(listGrouped).forEach(k => { listGrouped[k] = []; });
    items.filter(i => i.category !== 'D').forEach(item => {
      const cat = getItemCat(item);
      if (!cat) return;
      if (cat === 'alumni') {
        // 拆 host / employ：seeded _listSubGroup 決定（map view filter 仍是同一個 alumni）
        const group = item._listSubGroup === 'host' ? 'host' : 'employ';
        listGrouped[group].push(item);
      } else if (listGrouped[cat]) {
        listGrouped[cat].push(item);
      }
    });

    // faculty 欄（在職 fc + 離職 ff 併排）list view 依姓氏 A-Z（= nameEn 最後一字，對齊兼任老師後台排法）；
    // 桌機/手機共用 listGrouped[cat]，在此排完兩端一致。map（星雲）走 items 陣列不受影響。
    const surnameKey = (it) => {
      const en = (it.textEn || '').trim();
      return en ? en.split(/\s+/).pop().toLowerCase() : (it.textZh || '').trim();
    };
    listGrouped.faculty.sort((a, b) => surnameKey(a).localeCompare(surnameKey(b), 'en'));

    // em-* items（系友就職企業 mock）已在 items 陣列、走 alumni cat → _listSubGroup='employ' → 自動進 listGrouped.employ
    // 不再需要這裡額外 push placeholder（之前繞 items 陣列直接餵 listGrouped 的 pattern 已 deprecate）

    const CAT_LABELS = {
      faculty:  { en: 'Professors', zh: '歷屆教師' },
      host:     { en: 'Hosting',    zh: '主持'     },
      employ:   { en: 'Employment', zh: '就職'     },
      partners: { en: 'Partners',   zh: '合作單位' },
    };
    const ALUMNI_GROUP_LABEL = { en: 'Alumni', zh: '系友' };

    // 切 list view → 舊 listCareerCtrl 已過期（DOM 即將被 innerHTML='' 清掉）→ 先 destroy
    if (listCareerCtrl) { listCareerCtrl.destroy(); listCareerCtrl = null; }

    /** @param {{en:string, zh:string}} label */
    function makeTitleEl(label) {
      const titleEl = document.createElement('div');
      titleEl.className = 'atlas-list-col-title';
      const enSpan = document.createElement('span');
      enSpan.className = 'atlas-list-col-title-en';
      enSpan.textContent = label.en;
      const zhSpan = document.createElement('span');
      zhSpan.className = 'atlas-list-col-title-zh';
      zhSpan.textContent = label.zh;
      titleEl.appendChild(enSpan);
      titleEl.appendChild(zhSpan);
      return titleEl;
    }

    /** @param {string} cat @param {{en:string, zh:string}} label */
    function buildCol(cat, label) {
      const col = document.createElement('div');
      col.className = 'atlas-list-col';
      col.dataset.category = cat;

      // titleblock：旋轉宿主；title-wrapper overflow:hidden 提供 yPercent slide-in 遮罩
      const titleblock = document.createElement('div');
      titleblock.className = 'atlas-list-col-titleblock';
      titleblock.style.transform = `rotate(${randDeg()}deg)`;

      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'atlas-list-col-title-wrapper';
      titleWrapper.appendChild(makeTitleEl(label));
      titleblock.appendChild(titleWrapper);

      col.appendChild(titleblock);

      const itemsEl = document.createElement('div');
      itemsEl.className = 'atlas-list-col-items';
      col.appendChild(itemsEl);

      return col;
    }

    // ── Layout ──
    // [Faculty col] [Alumni group: label-col | host col | employ col] [Partners col]
    // label-col 在 alumni group 最左，垂直堆 Alumni title + career chip（無 items）
    // host/employ 緊鄰右側並排，titles 與 Alumni title 在同一視覺水平線（group 內各 col 頂部對齊）

    // Faculty
    const facultyCol = buildCol('faculty', CAT_LABELS.faculty);
    listView.appendChild(facultyCol);
    renderListPage(facultyCol, 'faculty', listPageState.faculty || 0, true);

    // Label col：Alumni 系友 title + career chip 垂直堆疊（無 items list）
    // labelCol / hostCol / employCol 直接 append 進 listView（不用 alumniGroup wrapper + display:contents）
    //   避免 display:contents 在某些瀏覽器跟相鄰兄弟（partnersCol）的 grid gap 邊界 quirk
    //   5 個 grid children 共享 9-col tracks：faculty(2) + label(1) + host(2) + employ(2) + partners(2) = 9，每對相鄰 32px gap 由 listView grid 統一管
    const labelCol = document.createElement('div');
    labelCol.className = 'atlas-list-group-label-col';
    labelCol.style.transform = `rotate(${randDeg()}deg)`;

    const masterTitleWrapper = document.createElement('div');
    masterTitleWrapper.className = 'atlas-list-col-title-wrapper';
    masterTitleWrapper.appendChild(makeTitleEl(ALUMNI_GROUP_LABEL));
    labelCol.appendChild(masterTitleWrapper);

    // Career chip 在 Alumni title 下方；用同樣的 controller（createCareerController）
    const careerListEl = document.createElement('div');
    careerListEl.className = 'atlas-list-col-career';
    const careerEnSpan = document.createElement('span');
    careerEnSpan.className = 'atlas-list-col-career-en';
    const careerZhSpan = document.createElement('span');
    careerZhSpan.className = 'atlas-list-col-career-zh';
    careerListEl.appendChild(careerEnSpan);
    careerListEl.appendChild(careerZhSpan);
    careerListEl.style.height = '0';
    careerListEl.style.paddingTop = '0';
    careerListEl.style.paddingBottom = '0';
    labelCol.appendChild(careerListEl);
    // grid 鎖死 label-col 寬度為 1/9 viewport（grid-column:span 1），chip inline width 變動不會推右側 cols
    listCareerCtrl = createCareerController(careerListEl, careerEnSpan, careerZhSpan, { dir: 'top' });   // list view：上→下滑入

    listView.appendChild(labelCol);

    const hostCol = buildCol('host', CAT_LABELS.host);
    const employCol = buildCol('employ', CAT_LABELS.employ);
    listView.appendChild(hostCol);
    listView.appendChild(employCol);
    renderListPage(hostCol, 'host', listPageState.host || 0, true);
    renderListPage(employCol, 'employ', listPageState.employ || 0, true);

    // Partners
    const partnersCol = buildCol('partners', CAT_LABELS.partners);
    listView.appendChild(partnersCol);
    renderListPage(partnersCol, 'partners', listPageState.partners || 0, true);
  }

  // ── 橫向 gate：alumni 子分頁鈕（Hosting/Employment，list view 左欄；點擊切右側內容，user 2026-07-07）──
  let gateAlumniSub = 'host';
  /** @type {HTMLElement|null} */
  let gateSubWrap = null;

  function syncGateSubActive() {
    if (!gateSubWrap) return;
    gateSubWrap.querySelectorAll('.atlas-gate-sub-btn').forEach(b => {
      b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.sub === gateAlumniSub);
    });
  }

  function updateGateSubVisibility() {
    if (!gateSubWrap) return;
    gateSubWrap.style.display = (currentView === 'list' && selected.has('alumni')) ? '' : 'none';
  }

  function ensureGateSubBtns() {
    if (gateSubWrap) return;
    gateSubWrap = document.createElement('div');
    gateSubWrap.id = 'atlas-gate-sub';
    [['host', 'Hosting', '主持'], ['employ', 'Employment', '就職']].forEach(([key, en, zh]) => {
      const b = document.createElement('button');
      b.className = 'atlas-gate-sub-btn';
      b.dataset.sub = key;
      const enEl = document.createElement('span');
      enEl.textContent = en;
      const zhEl = document.createElement('span');
      zhEl.className = 'atlas-gate-sub-zh';
      zhEl.textContent = zh;
      b.appendChild(enEl);
      b.appendChild(zhEl);
      b.addEventListener('click', () => {
        if (gateAlumniSub === key) return;
        gateAlumniSub = key;
        syncGateSubActive();
        applyListFilter();
        // 剛顯示的欄之前 display:none 量不到寬 → 重 render + 重播進場（同 tab 切換流程）
        const col = /** @type {HTMLElement|null} */ (listView.querySelector(`.atlas-list-col[data-category="${key}"]`));
        if (col) {
          renderListPage(col, key, listPageState[key] || 0, true);
          playColEnterAnim(col, key, 0);
        }
      });
      gateSubWrap.appendChild(b);
    });
    main.appendChild(gateSubWrap);
    syncGateSubActive();
    updateGateSubVisibility();
  }

  function applyListFilter() {
    // 桌面 list view 固定顯示三欄、filter 只作用於 map view；
    // 手機 list-only：三顆 tab 單選，一次顯示一個分類（直向 alumni = host+employ 左右並排；
    // 橫向 gate alumni = 一次一個 subgroup，由左欄 Hosting/Employment 鈕切換）
    if (!isMobileAtlas) return;
    const cat = [...selected][0] || 'faculty';
    const showCats = cat === 'alumni'
      ? (isLandscapeGateAtlas ? [gateAlumniSub] : ['host', 'employ'])
      : [cat];
    listView.querySelectorAll('.atlas-list-col').forEach(col => {
      const colEl = /** @type {HTMLElement} */ (col);
      colEl.style.display = showCats.includes(colEl.dataset.category || '') ? '' : 'none';
    });
    updateGateSubVisibility();
  }

  function updateFilterBtnColors() {
    btns.forEach(b => {
      const cat = b.dataset.filter;
      const inner = /** @type {HTMLElement | null} */ (b.querySelector('.anchor-nav-inner'));
      if (!inner || !cat) return;
      if (selected.has(cat)) {
        inner.style.background = '#000000';
        inner.style.color = '#FFFFFF';
        inner.style.opacity = '';
        if (!inner.style.transform) {
          inner.style.transform = `rotate(${randDeg()}deg)`;
        }
      } else {
        inner.style.background = '';
        inner.style.color = '';
        inner.style.opacity = '';
        inner.style.transform = '';
      }
    });
  }

  // 國家節點 gate（user 2026-07-16）：employment（alumni 選取＋employ subchip 開）或 partners
  // 任一 active 才顯示 D 城市節點＋城市環線（兩者都關＝沒有任何連到城市的內容，節點沒意義）。
  // 手機星雲＝純瀏覽全部顯示（switchToMobileMap finalize 不過濾），gate 只作用桌面。
  function countriesGateOn() {
    return isMobileAtlas
      || selected.has('partners')
      || (selected.has('alumni') && subchipActive.employ !== false);
  }

  // D 國家節點＋城市環線的 gate 套用。獨立函式因為有兩個入口：applyMapFilter（filter 點擊/init/view 切換）
  // 與 employ subchip 單獨 toggle（走 setSubchipVisibility 不跑 applyMapFilter，gate 要在 handler 補呼叫）。
  // 節點收/展沿用 map filter 的 span clip-path 4 向隨機；ring 線用 retractT（同 hover/view-switch 機制）。
  // 依「當前 filter 狀態」判斷非 D item 是否應可見（與 applyMapFilter 同一套規則；讀 state 不讀 DOM class，
  // 避免動畫版 0.4s 後才掛 class 的時間差誤判）
  function filterAllowsItem(item) {
    const prefix = String(item.id).split('-')[0];
    let visible = false;
    selected.forEach(k => { if ((FILTER_PREFIXES[k] || []).includes(prefix)) visible = true; });
    if (visible && (prefix === 'co' || prefix === 'em') && item._listSubGroup) {
      visible = subchipActive[item._listSubGroup] !== false;
    }
    return visible;
  }
  // 國家底下（線真正連到它的 item）是否還有 filter 後可見的成員
  function countryHasVisibleItems(dItem) {
    const neigh = itemNeighbors.get(dItem.id);
    if (!neigh) return false;
    for (const nid of neigh) {
      const it = itemMap.get(nid);
      if (it && it.category !== 'D' && filterAllowsItem(it)) return true;
    }
    return false;
  }

  function applyCountriesGate(animate) {
    // filter/gate 一動先清 hover 態（dim/highlight/activeLines/展開方塊/detail panel）：
    // hover 中的節點被藏成 display:none 時 mouseout 不可靠，不清會留下高亮殘線與 dim 卡死（user 2026-08-10）。
    // applyMapFilter 尾端與 employ subchip toggle 都會進到這裡 → 單點涵蓋所有 filter 入口。
    clearDetail();
    // per-country gate（user 2026-08-10）：全域開關之外，filter 後該國底下沒有任何可見 item → 國家節點也藏。
    // 手機星雲＝純瀏覽全顯示、跳過 per-country 判斷。
    const gateOn = countriesGateOn();
    const dShow = [];
    const dHide = [];
    items.forEach(item => {
      if (item.category !== 'D' || !item._anchor) return;
      const want = gateOn && (isMobileAtlas || countryHasVisibleItems(item));
      item._gateVisible = want;   // 狀態記在 item：syncCityCycle / isFilteredOutItem 讀這個，不等 0.4s 後的 DOM class
      const wasFiltered = item._anchor.classList.contains('atlas-filtered-out');
      if (want && wasFiltered) dShow.push(item);
      else if (!want && !wasFiltered) dHide.push(item);
      else if (want) (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      else (itemLines.get(item.id) || []).forEach(l => { l.style.display = 'none'; });
    });
    // 城市環線：可見國家重新成環（隱藏者的線 retract、新相鄰的線 draw in）
    syncCityCycle();
    if (!animate || typeof gsap === 'undefined') {
      dShow.forEach(item => {
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      });
      dHide.forEach(item => {
        item._anchor.classList.add('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(l => { l.style.display = 'none'; });
      });
      cityLines.forEach(cl => {
        const t = cityLineRestT(cl);
        // 不能只看 retractT===t 早退：本函式開頭 clearDetail 可能剛排了「全線回 0」的 tween
        // （值還沒動）→ 一律先 kill，否則 gate 縮掉的線會被那條 tween 復活畫進空氣
        if (typeof gsap !== 'undefined') gsap.killTweensOf(cl);
        if (cl.retractT === t) return;
        if (t === 1) cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
        cl.retractT = t;
        updateCityLineEndpoints(cl);
      });
      return;
    }
    const INSETS = [
      'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)',
      'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)',
    ];
    const TOTAL = 0.4;
    const RANGE = 0.25;
    dHide.forEach(item => {
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: INSETS[Math.floor(Math.random() * 4)],
        duration: TOTAL - d, delay: d, ease: EASE.enterSoft, overwrite: true,
        onComplete: () => {
          item._anchor.classList.add('atlas-filtered-out');
          item._span.style.clipPath = '';
          (itemLines.get(item.id) || []).forEach(l => { l.style.display = 'none'; });
        },
      });
    });
    dShow.forEach(item => {
      item._anchor.classList.remove('atlas-filtered-out');
      (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      gsap.set(item._span, { clipPath: INSETS[Math.floor(Math.random() * 4)] });
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: TOTAL - d, delay: d, ease: EASE.enterSoft, overwrite: true,
        onComplete: () => { item._span.style.clipPath = ''; },
      });
    });
    cityLines.forEach(cl => {
      const t = cityLineRestT(cl);
      if (t === 1 && cl.retractT !== t) cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
      // 不早退：即使 retractT 已在目標值，也要用 overwrite 蓋掉 clearDetail 剛排的「回 0」tween
      gsap.to(cl, { retractT: t, duration: 0.5, ease: t === 0 ? EASE.enterSoft : EASE.exitSoft, overwrite: true });
    });
  }

  function applyMapFilter(animate = false) {
    const allowed = new Set();
    selected.forEach(k => (FILTER_PREFIXES[k] || []).forEach(p => allowed.add(p)));

    const toShow = [];
    const toHide = [];
    items.forEach(item => {
      if (!item._anchor) return;
      if (item.category === 'D') return;   // D 由 applyCountriesGate 統一處理（本函式尾端呼叫）
      const prefix = String(item.id).split('-')[0];
      let visible = allowed.has(prefix);
      // alumni chip (co-* ring + em-* floating) 再依 host/employ subchip 狀態二次過濾 — 該 subgroup 關掉就連帶藏 chip
      if (visible && (prefix === 'co' || prefix === 'em') && item._listSubGroup) {
        visible = subchipActive[item._listSubGroup] !== false;
      }
      const wasFiltered = item._anchor.classList.contains('atlas-filtered-out');
      if (visible && wasFiltered) toShow.push(item);
      else if (!visible && !wasFiltered) toHide.push(item);
      else if (!visible) {
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
      } else if (visible) {
        (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      }
    });

    if (!animate || typeof gsap === 'undefined') {
      // Init / 無 gsap：instant toggle
      toShow.forEach(item => {
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      });
      toHide.forEach(item => {
        item._anchor.classList.add('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
      });
      applyCountriesGate(false);
      return;
    }

    // Animated：item span clip-path 收/放，stagger 同時結束
    // ease 全用 power2.out（front-loaded）讓每個 item 的視覺收縮/揭露發生在各自起跑點，stagger 看得見
    // 隱藏終點 / 出現起點 per-item 從 4 方向隨機挑（往左/右/上/下收縮），show 與 hide 各自獨立 random
    const HIDDEN_INSETS = [
      'inset(0% 0% 0% 100%)', // 往右收（左 100% inset）
      'inset(0% 100% 0% 0%)', // 往左收
      'inset(100% 0% 0% 0%)', // 往下收
      'inset(0% 0% 100% 0%)', // 往上收
    ];
    const randomHiddenInset = () => HIDDEN_INSETS[Math.floor(Math.random() * HIDDEN_INSETS.length)];

    const TOTAL = 0.4;
    const RANGE = 0.25;
    // B 企業環整圈：每次 show/hide 隨機翻 dir（順/逆時針），讓 ring 視覺方向不固定
    //   reset v0 抵銷 dir flip 造成的 vPos 跳變 → 切換無 chip 跳位（continuous orbit motion 反向）
    /** @param {any[]} group */
    const flipRingDir = (group) => {
      const ringB = group.filter((/** @type {any} */ it) => it.category === 'B' && it._orbit && it._orbit._ringFlow);
      if (ringB.length === 0) return;
      const newDir = Math.random() < 0.5 ? -1 : 1;
      const now = performance.now() / 1000 - floatStart;
      ringB.forEach((/** @type {any} */ item) => {
        const o = item._orbit;
        if (o.dir === newDir) return;
        const effT = o.pauseStart != null ? (o.pauseStart - o.tOffset) : (now - o.tOffset);
        const currentVPos = o.v0 + (effT / o.period) * totalV * o.dir;
        o.v0 = currentVPos - (effT / o.period) * totalV * newDir;
        o.dir = newDir;
      });
    };
    flipRingDir(toHide);
    flipRingDir(toShow);

    toHide.forEach(item => {
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: randomHiddenInset(),
        duration: TOTAL - d,
        delay: d,
        ease: EASE.enterSoft,
        overwrite: true,
        onComplete: () => {
          item._anchor.classList.add('atlas-filtered-out');
          item._span.style.clipPath = '';
          (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
        },
      });
    });
    toShow.forEach(item => {
      item._anchor.classList.remove('atlas-filtered-out');
      (itemLines.get(item.id) || []).forEach(syncLineDisplay);
      gsap.set(item._span, { clipPath: randomHiddenInset() });
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: TOTAL - d,
        delay: d,
        ease: EASE.enterSoft,
        overwrite: true,
        onComplete: () => { item._span.style.clipPath = ''; },
      });
    });
    applyCountriesGate(true);
  }

  function apply(animate = false) {
    btns.forEach(b => b.classList.toggle('active', selected.has(b.dataset.filter)));
    if (currentView === 'map') {
      applyMapFilter(animate);
    } else {
      applyListFilter();
    }
    updateFilterBtnColors();
    // animate=true 表示使用者點擊（非 init / view 切換），同步 career 顯隱
    if (animate) syncCareer();
  }

  // Initial rotation for active btns
  btns.forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.filter;
      if (isMobileAtlas) {
        // 手機：單選 tab 切換 list 分類（無 map view，點已選中的 tab 不動作）
        if (!k || selected.has(k)) return;
        selected.clear();
        selected.add(k);
        apply(true);
        // 隱藏期間 pre-measure / marquee 都量不到寬 → 顯示後重 render 該分頁再播進場
        listView.querySelectorAll('.atlas-list-col').forEach(col => {
          const colEl = /** @type {HTMLElement} */ (col);
          if (colEl.style.display === 'none') return;
          const cat = /** @type {string} */ (colEl.dataset.category);
          renderListPage(colEl, cat, listPageState[cat] || 0, true);
          playColEnterAnim(colEl, cat, 0);
        });
        return;
      }
      if (selected.has(k)) {
        if (selected.size <= 1) return;
        selected.delete(k);
      } else {
        selected.add(k);
        // alumni 重新打開 → 兩 subchip flag + class 都 reset，所有 B chip 重新顯示
        if (k === 'alumni') {
          subchipActive.host = true;
          subchipActive.employ = true;
          Object.values(subchipMap).forEach(c => c && c.classList.remove('subchip-inactive'));
        }
      }
      apply(true);
    });
  });

  apply();

  // ── Layout toggle ──────────────────────────────────────────────────
  // （layoutBtn 已在 Filter 段提前宣告）

  // icon 跟著星雲整段 intro tween 同步做（0.75s = Phase 1 cover reveal 0→0.35 + Phase 2 span hide 0.35→0.75）：
  // exit hide / entry reveal 都 0→0.75 + power2.out，**起跑點不延遲、duration 同 chip 整段**，forward/return 時間對稱即互為反向
  const LAYOUT_ICON_DIRS = [
    'inset(0% 100% 0% 0%)', // 收/起 - 右
    'inset(0% 0% 0% 100%)', // 收/起 - 左
    'inset(100% 0% 0% 0%)', // 收/起 - 上
    'inset(0% 0% 100% 0%)', // 收/起 - 下
  ];
  const LAYOUT_ICON_DURATION = 0.4;
  const LAYOUT_ICON_EASE = 'power2.out';
  /** @type {string|null} */
  let _lastIconHideDir = null;

  /**
   * @param {{ timeline?: any, position?: string | number }} [opts]
   */
  function hideLayoutIcon(opts = {}) {
    const { timeline = null, position = 0 } = opts;
    const icon = /** @type {HTMLElement|null} */ (layoutBtn?.querySelector('.icon'));
    if (!icon || typeof gsap === 'undefined') return;
    const dir = LAYOUT_ICON_DIRS[Math.floor(Math.random() * 4)];
    _lastIconHideDir = dir;
    const vars = { clipPath: dir, duration: LAYOUT_ICON_DURATION, ease: LAYOUT_ICON_EASE, overwrite: true };
    if (timeline) timeline.to(icon, vars, position);
    else gsap.to(icon, vars);
  }

  function revealLayoutIcon(newClass) {
    const icon = /** @type {HTMLElement|null} */ (layoutBtn?.querySelector('.icon'));
    if (!icon) return;
    if (typeof gsap === 'undefined') {
      icon.className = newClass;
      return;
    }
    icon.className = newClass;
    // reveal 起點 = 上次 hide 的終點方向 → 視覺上 reveal 就是 hide 的時間反向
    // target 必須用四值 inset(0% 0% 0% 0%)，不能用 inset(0%) 短寫 — GSAP 對兩種 syntax shape 沒辦法 interpolate，
    // 寫 inset(0%) 會直接跳終值（看起來 icon 跳出來、沒 reveal 動畫）
    const startDir = _lastIconHideDir ?? LAYOUT_ICON_DIRS[Math.floor(Math.random() * 4)];
    gsap.fromTo(icon,
      { clipPath: startDir },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: LAYOUT_ICON_DURATION, ease: LAYOUT_ICON_EASE, clearProps: 'clipPath', overwrite: true }
    );
  }

  function switchToList() {
    if (currentView === 'list') return;
    currentView = 'list';
    clearDetail();

    // startList：filter / stage 收完之後跑：實際切 view + 一個個進場
    const startList = () => {
      stage.style.display = 'none';
      stage.style.opacity = '';
      refreshFloatRunning();   // list view：暫停隱藏 map 的 rAF
      if (filterEl) filterEl.style.display = 'none';
      renderList();
      applyListFilter();
      listView.classList.add('visible');
      updateFilterBtnColors();
      // icon entry：跟 Phase B1 / list 進場節奏一致（power2.out 0.4s），swap className 同時揭露
      revealLayoutIcon('icon icon-atlas-view');

      if (typeof gsap === 'undefined') return;

      // Per-column 仿 hero-title reveal：每行（title / 各副標）各自 overflow:hidden + yPercent:100→0
      // title wrapper 在 col 層級獨立 reveal；item 內每行 .atlas-list-line-clip 由 line-stagger
      // 控制 title 先、副標後、然後下一個 item
      const visibleCols = [.../** @type {NodeListOf<HTMLElement>} */ (listView.querySelectorAll('.atlas-list-col'))]
        .filter(col => col.style.display !== 'none');

      // Section-level delays（faculty / alumni / partners = 0 / 0.08 / 0.16）見 closure 頂 SECTION_DELAY；
      // alumni 內 host+employ 同 delay → 3 區塊視覺同時進場（避免每 col idx*0.08 變 4 階梯）
      const ALUMNI_DELAY = SECTION_DELAY.host;

      // Alumni label-col reveal：master title yPercent + career chip show() 同 alumni delay
      const masterTitleEl = /** @type {HTMLElement|null} */ (listView.querySelector('.atlas-list-group-label-col .atlas-list-col-title'));
      if (masterTitleEl) {
        gsap.fromTo(masterTitleEl,
          { yPercent: 100 },
          { yPercent: 0, duration: DUR.slow, delay: ALUMNI_DELAY, ease: EASE.enter, clearProps: 'transform', overwrite: true }  // DUR.slow：跟欄標題 chip 同速（見 playColEnterAnim）
        );
      }
      if (listCareerCtrl) listCareerCtrl.show({ delay: ALUMNI_DELAY });

      // 每欄進場走共用 helper（pre-measure 重渲染也用它重播，確保高 item 欄首次切換不失動畫）
      visibleCols.forEach((col) => {
        const cat = /** @type {string} */ (col.dataset.category);
        playColEnterAnim(col, cat, SECTION_DELAY[cat] ?? 0);
      });
    };

    if (typeof gsap === 'undefined') {
      startList();
      return;
    }

    // 平行收 map：
    // - filter wipe out（反向順序：employ → host → career stagger 後 + 0.3s → partners → alumni → faculty stagger）
    // - Phase 1：所有 cover clip-path 由左→右揭露成 chip（隨機起跑，duration = TOTAL - delay → 同時結束）
    // - Phase 2：所有 span clip-path 由左→右收掉（chip + 文字一起消失）+ cityLines stroke-dashoffset 0→1 點對點 erase
    //   stagger 範圍 RANGE 拉大讓「先後散開」更明顯
    // user 指定退場節奏（2026-05-24）：main btn + subchip 同時 t=0 收，全部壓在 introTween (~750ms) 期間
    // 進場仍維持階梯（main btn 先 → subchip 後），但退場直接同時收避免 startList 後星雲還在的視覺斷層
    // 先 drain 任何前一次 switchToMap.finalize 殘留的 reveal timer，避免 race 後它們蓋回剛要收的 class
    drainRevealTimers();
    hideCareer({ stagger: SUBCHIP_STAGGER });
    [...btns].reverse().forEach((btn, i) => {
      const t = setTimeout(() => {
        if (btn.isConnected) btn.classList.remove('atlas-filter-revealed');
      }, i * STAGGER);
      revealTimers.push(t);
    });
    if (introTween) introTween.kill();

    const REVEAL_TOTAL = 0.35;
    const HIDE_TOTAL   = 0.4;   // 拉長：phase 2 用 power2.out 把可見收縮搬到各自起跑點，需足夠時長
    const REVEAL_RANGE = 0.2;
    const HIDE_RANGE   = 0.28;  // 拉大 stagger 範圍讓「先後散開」明顯
    const PHASE_GAP    = 0;
    const allWithSpan = items.filter(i => i._span);
    const allSpans  = allWithSpan.map(i => i._span);
    const allCovers = allWithSpan.map(i => i._cover).filter(Boolean);

    // init：cover clip-path hidden；cityLines retractT 從 0（full visible）開始
    gsap.set(allCovers, { clipPath: 'inset(0% 100% 0% 0%)' });

    introTween = gsap.timeline({
      onComplete: () => {
        // 0.2s buffer：chips 已全部 clip 掉 / lines 已 retract 掉但 stage 還沒 hide → 視覺全空白
        // 跟 switchToMap 進場前的 0.2s buffer 對稱，讓兩個方向的「全白過場」節奏一致
        // btn / subchip collapse 跟 introTween t=0 同時起跑，預期都在 introTween 結束前完成（btn 500ms、subchip 最後一個 ~1000ms）
        // subchip 略長但 chip 視覺層級比星雲 cover 低，可接受
        gsap.delayedCall(0.2, () => {
          allSpans.forEach(s => { s.style.clipPath = ''; });
          allCovers.forEach(c => { c.style.clipPath = ''; });
          // 不重置 retractT — 留給下次 entry 的 init 設成 1 起點；或 stage 被 hide 後也無感
          startList();
        });
      },
    });

    // Phase 1：cover 揭露
    allCovers.forEach(cover => {
      const d = Math.random() * REVEAL_RANGE;
      introTween.to(cover, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: REVEAL_TOTAL - d,
        ease: EASE.enterSoft,
      }, d);
    });

    // Phase 2：span 收掉（4 方向 random clip-path）+ cityLines retractT 0→1 物理 retract
    const p2Start = REVEAL_TOTAL + PHASE_GAP;
    // 4 個 random 收掉方向（left/right/top/bottom 各一）
    const HIDE_DIRS = [
      'inset(0% 0% 0% 100%)', // 從左收（visible 從右側慢慢被吃掉）
      'inset(0% 100% 0% 0%)', // 從右收
      'inset(100% 0% 0% 0%)', // 從上收
      'inset(0% 0% 100% 0%)', // 從下收
    ];
    allSpans.forEach(span => {
      const d = Math.random() * HIDE_RANGE;
      const dir = HIDE_DIRS[Math.floor(Math.random() * 4)];
      introTween.to(span, {
        clipPath: dir,
        duration: HIDE_TOTAL - d,
        ease: EASE.enterSoft,  // front-loaded → 每個 item 在各自起跑點收縮，stagger 看得見
      }, p2Start + d);
    });
    // layout btn icon 跨整段 introTween 同步 hide（0→0.75，跟 chips 整段同節奏，不延遲）
    hideLayoutIcon({ timeline: introTween, position: 0 });
    // cityLines 收回：用 retractT 物理收縮 endpoint（沿用 hover retract pattern）
    // tickFloat 的 updateCityLineEndpoints 每幀依 cl.retractT + cl.hoveredEnd lerp endpoint
    // 從 t=0 起跑跨整段（與 Phase 1 cover reveal 同步起點），ease='power2.out' 把大部分動作壓在前半段：
    // - 避免 linear 在前 35% 視覺幾乎沒變化（covers front-loaded 大幅 reveal 對比下 line「沒動」）
    // - 避免 power2.in 把動作擠到最後 25% 造成「前面卡著、最後一刻直接不見」
    // power2.out 跟 cover reveal 的 ease 一致 → line 與 chip 動畫同節奏出發
    // overwrite:true 防止 clearDetail() 觸發的 setCityLineRetract 反向 tween 拉扯
    cityLines.forEach(cl => {
      cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
    });
    cityLines.forEach(cl => {
      introTween.to(cl, {
        retractT: 1,
        duration: REVEAL_TOTAL + HIDE_TOTAL,
        ease: EASE.enterSoft,
        overwrite: true,
      }, 0);
    });
    // companyRingEllipse 的 erase 由 switchToList 開頭 hideCareer() 呼叫 animateRingEllipse(false) 處理
    //   走 dasharray progress（path-style point-to-point retract）統一在 animateRingEllipse；此處不再另跑 tween 避免衝突
  }

  function switchToMap() {
    if (currentView === 'map') return;

    // finalize：list 收完之後跑：切 view 狀態 → 反向 switchToList 動畫進場 → filter wipe in
    // 反向結構（剛好對應 switchToList 倒過來）：
    //   Phase B1（反向 phase 2）：所有 label span clip-path 由左→右揭露（露出 chip 狀態：色塊蓋住文字）+ cityLines opacity 0→1
    //   Phase B2（反向 phase 1）：所有 cover clip-path 由左→右收掉 → 露出底下文字（D 仍保留 span bgColor 為背景；非 D 純色字 idle 狀態）
    const finalize = () => {
      currentView = 'map';
      stage.style.display = '';
      stage.style.opacity = '';
      refreshFloatRunning();   // 回 map view：恢復 rAF
      listView.classList.remove('visible');
      if (filterEl) filterEl.style.display = '';
      btns.forEach(b => b.classList.remove('atlas-filter-revealed'));
      apply();
      // icon entry：跟 Phase B1 spans reveal 同 ease + 同 duration（power2.out 0.4s），swap className 同時揭露
      revealLayoutIcon('icon icon-atlas-list');

      const allWithSpan = items.filter(i => i._span);
      const allSpans  = allWithSpan.map(i => i._span);
      const allCovers = allWithSpan.map(i => i._cover).filter(Boolean);

      if (typeof gsap === 'undefined') {
        allSpans.forEach(s => { s.style.clipPath = ''; });
        allCovers.forEach(c => { c.style.clipPath = ''; });
        cityLines.forEach(cl => { cl.retractT = countriesGateOn() ? cityLineRestT(cl) : 1; });
        scale = defaultScaleAtlas;
        applyTransform();
        btns.forEach(b => b.classList.add('atlas-filter-revealed'));
        syncCareer();
        return;
      }

      // 4 個 random 起點方向（與 exit phase 2 對稱）
      const HIDE_DIRS = [
        'inset(0% 0% 0% 100%)',
        'inset(0% 100% 0% 0%)',
        'inset(100% 0% 0% 0%)',
        'inset(0% 0% 100% 0%)',
      ];
      // init：每個 span 從 random 方向 hidden 起；cover 揭露蓋住文字；
      //       cityLines retractT=1（線縮到一點、不可見）+ hoveredEnd random（決定從哪端 draw 出來）
      //       立刻 updateCityLineEndpoints 同步 path d，避免 stage 顯示瞬間先閃一幀 full line
      allSpans.forEach(s => { s.style.clipPath = HIDE_DIRS[Math.floor(Math.random() * 4)]; });
      gsap.set(allCovers, { clipPath: 'inset(0% 0% 0% 0%)' });
      cityLines.forEach(cl => {
        cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
        cl.retractT = 1;
        updateCityLineEndpoints(cl);
      });
      // companyRingEllipse 起點：dasharray "0 1"（無 dash 全 gap = 隱形），等 revealFilters → syncCareer → showCareer 動畫進來
      //   path-style point-to-point reveal 由 animateRingEllipse 在 alumni active 時觸發
      companyRingEllipse.style.strokeDasharray = '0 1';
      companyRingEllipse.style.strokeDashoffset = '0';

      scale = defaultScaleAtlas;
      tx = 0; ty = 0;
      applyTransform();

      const REVEAL_TOTAL = 0.4;   // 對齊 exit phase 2，拉長讓 stagger 看得到
      const HIDE_TOTAL   = 0.35;
      const REVEAL_RANGE = 0.28;
      const HIDE_RANGE   = 0.2;
      const PHASE_GAP    = 0;

      if (introTween) introTween.kill();
      introTween = gsap.timeline({
        onComplete: () => {
          allSpans.forEach(s => { s.style.clipPath = ''; });
          allCovers.forEach(c => { c.style.clipPath = ''; });
          // Filter wipe in：順序 faculty → alumni → partners（同 revealFilters）
          // drain 殘留 timer 避免 switchToList exit 的 collapse timer 還沒跑完就被 reveal 蓋掉的 race
          drainRevealTimers();
          btns.forEach((btn, i) => {
            const t = setTimeout(() => { if (btn.isConnected) btn.classList.add('atlas-filter-revealed'); }, i * STAGGER);
            revealTimers.push(t);
          });
          // btn 全部現完 + 0.3s delay → subchips stagger reveal（career → host → employ）
          const subchipStart = (btns.length - 1) * STAGGER + BTN_REVEAL_DURATION + SUBCHIP_GAP;
          const subchipT = /** @type {any} */ (setTimeout(() => {
            if (selected.has('alumni')) showCareer({ stagger: SUBCHIP_STAGGER });
          }, subchipStart));
          revealTimers.push(subchipT);
        },
      });

      // Phase B1：span 揭露（4 方向 random）+ cityLines retractT 1→0 物理 draw 出來
      allSpans.forEach(span => {
        const d = Math.random() * REVEAL_RANGE;
        introTween.to(span, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: REVEAL_TOTAL - d,
          ease: EASE.enterSoft,
        }, d);
      });
      // cityLines 物理 draw：retractT 1→0，updateCityLineEndpoints 每幀 lerp endpoint
      // 從 t=0 起跑跨整段（與 Phase B1 spans reveal 同步起點），ease='power2.out' 與 spans reveal 同節奏
      // 避免 linear 跨整段時前半段視覺幾乎沒變化，被 spans 大幅 reveal 蓋過顯得「沒動」
      // 國家節點 gate 關（employment/partners 都 inactive）→ 不 draw，維持 init 的 retractT=1 隱形
      if (countriesGateOn()) {
        cityLines.forEach(cl => {
          introTween.to(cl, {
            retractT: cityLineRestT(cl),   // gate 藏掉的國家線維持 1（不 draw 進空氣）
            duration: REVEAL_TOTAL + HIDE_TOTAL,
            ease: EASE.enterSoft,
            overwrite: true,
          }, 0);
        });
      }
      // companyRingEllipse 的 draw 由 onComplete → revealFilters → syncCareer → showCareer 呼叫 animateRingEllipse(true) 處理
      //   此處不再另跑 tween，統一走 animateRingEllipse 的 dasharray progress（path-style point-to-point reveal）

      // Phase B2：cover 收掉露出文字（front-loaded ease 讓 stagger 看得見）
      const p2Start = REVEAL_TOTAL + PHASE_GAP;
      allCovers.forEach(cover => {
        const d = Math.random() * HIDE_RANGE;
        introTween.to(cover, {
          clipPath: 'inset(0% 100% 0% 0%)',
          duration: HIDE_TOTAL - d,
          ease: EASE.enterSoft,
        }, p2Start + d);
      });
      if (allCovers.length === 0) introTween.to({}, { duration: HIDE_TOTAL }, p2Start);
    };

    // 同時退場：
    // - lines + col titles 跑 yPercent → ±100（per-element random、無 stagger）
    // - chevron 用 clip-path inset 原地收起（不平移、位置固定）
    // - career chip 跑 hide() 反向收（2026-07-16 起：el yPercent 0→-100 向上滑出 + mask height→0；不混進下方 yPercent 群）
    // duration 0.6 + ease power2.in 統一；0.2 buffer 後再 finalize
    if (typeof gsap === 'undefined') {
      if (listCareerCtrl) { listCareerCtrl.destroy(); listCareerCtrl = null; }
      finalize();
      return;
    }
    // career 用 hide() 反向收（yPercent 向上滑出 + mask height→0，見 createCareerController dir='top' 分支）
    // hide() 內已停 interval / kill 舊 tween；destroy 留給 renderList 或 cleanupFns 處理
    if (listCareerCtrl) listCareerCtrl.hide();
    const yPercentExitTargets = /** @type {HTMLElement[]} */ ([
      ...listView.querySelectorAll('.atlas-list-line-clip > *'),
      ...listView.querySelectorAll('.atlas-list-col-title'),
    ]);
    const navExitTargets = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-nav-item')]);
    if (yPercentExitTargets.length === 0 && navExitTargets.length === 0) {
      finalize();
      return;
    }
    // 同 duration / ease 保證兩種動畫同時結束；onComplete 掛在主 tween 上（lines 通常較多、跑最久）
    const mainTargets = yPercentExitTargets.length > 0 ? yPercentExitTargets : navExitTargets;
    // layout btn icon hide 跨整段 chip 時長（0→0.75 + power2.out），不延遲 — 跟 forward exit 對稱 = 互為反向
    hideLayoutIcon();
    if (yPercentExitTargets.length > 0) {
      gsap.to(yPercentExitTargets, {
        yPercent: () => Math.random() < 0.5 ? 100 : -100,
        duration: DUR.slow,
        ease: EASE.exitSoft,
        overwrite: true,
        onComplete: mainTargets === yPercentExitTargets
          ? () => gsap.delayedCall(0.2, finalize)
          : undefined,
      });
    }
    if (navExitTargets.length > 0) {
      // inset 四值統一用 %（與 entry 一致，避免 GSAP 跳終值）；fromTo 確保 from-state 不是 'none'
      gsap.fromTo(navExitTargets,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        {
          clipPath: 'inset(0% 0% 100% 0%)',
          duration: DUR.slow,
          ease: EASE.exitSoft,
          overwrite: true,
          onComplete: mainTargets === navExitTargets
            ? () => gsap.delayedCall(0.2, finalize)
            : undefined,
        }
      );
    }
  }

  if (layoutBtn) {
    layoutBtn.addEventListener('click', () => {
      if (isMobileAtlas) {
        // 手機：list ↔ 星雲（星雲直式時顯示轉向提示、橫式才顯示內容）
        if (currentView === 'map') switchToMobileList();
        else switchToMobileMap();
        return;
      }
      if (currentView === 'map') switchToList();
      else switchToMap();
    });
  }

  // ── 手機星雲模式（user 2026-06-12）──────────────────────────────
  // 預設 list view；點 layout btn 進星雲，但直式只給「轉向提示」（仿 /create #landscape-overlay），
  // 旋轉成橫式才顯示星雲內容。map 佈局是 init 時以直式尺寸算的（不隨 resize 重排，桌面同樣行為），
  // 橫式下整片置中可平移視角，先以可瀏覽為準。
  /** @type {HTMLElement|null} */
  let rotateHintEl = null;
  function ensureRotateHint() {
    if (rotateHintEl) return rotateHintEl;
    rotateHintEl = document.createElement('div');
    rotateHintEl.id = 'atlas-rotate-hint';
    const icon = document.createElement('span');
    icon.className = 'icon icon-rotate-phone';
    const text = document.createElement('div');
    text.className = 'atlas-rotate-hint-text';
    text.textContent = '旋轉設備以獲取最佳體驗\nROTATE FOR BEST EXPERIENCE';
    rotateHintEl.appendChild(icon);
    rotateHintEl.appendChild(text);
    main.appendChild(rotateHintEl);
    return rotateHintEl;
  }

  const isLandscape = () => window.innerWidth > window.innerHeight;

  function syncMobileMapOrientation() {
    if (!isMobileAtlas || currentView !== 'map') return;
    // 直向手機也走圓點星雲（user 2026-07-09「atlas 做成跟橫向手機一樣」）→ 不再顯示轉向提示，
    // 直向/橫向 map view 一律顯示 stage。跨 gate 轉向仍由 orientation-reload 重載重排。
    stage.style.display = '';
    refreshFloatRunning();
  }

  function switchToMobileMap() {
    if (currentView === 'map') return;
    currentView = 'map';
    clearDetail();

    // list 出場（同 playListExit 視覺：lines yPercent 滑出 + chevron clip 收）跑完才換畫面
    // — 直式（轉向提示）跟橫式（星雲）都要有出場，不能瞬切（user 2026-06-13）
    const finalize = () => {
      listView.classList.remove('visible');
      if (filterEl) filterEl.style.display = 'none'; // 星雲模式收起分類 tab，只留 layout btn 可返回
      updateGateSubVisibility(); // 橫向 gate：alumni 子分頁鈕跟著收
      // 手機星雲 = 純瀏覽：全部 chip 顯示（list 的單選分類不過濾星雲）
      items.forEach(item => {
        if (!item._anchor) return;
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(l => { l.style.display = ''; });
      });
      // 重置 zoom 參數回預設視圖（同桌面 switchToMap；user 2026-07-07「跟桌面版的做法一樣」）
      // applyTransform 內的 text-zoom 同步會一併把文字模式收回圓點模式
      scale = defaultScaleAtlas;
      tx = 0; ty = 0;
      applyTransform();
      syncMobileMapOrientation();
      // 星雲進場（stage 顯示中就播；直向手機也走星雲＝直向橫向都有進出場，2026-07-09）：
      // chip 從 random 方向 clip-in + 城市線 draw 回（對稱出場；user 2026-07-07）
      if (typeof gsap !== 'undefined' && stage.style.display !== 'none') {
        const HIDE = ['inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
        items.forEach(item => {
          if (!item._span) return;
          gsap.set(item._span, { clipPath: HIDE[Math.floor(Math.random() * 4)] });
          const d = Math.random() * 0.25;
          gsap.to(item._span, {
            clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4 - d * 0.5, delay: d,
            ease: EASE.enterSoft, overwrite: true,
            onComplete: () => { item._span.style.clipPath = ''; },
          });
        });
        cityLines.forEach(cl => gsap.to(cl, { retractT: cityLineRestT(cl), duration: 0.55, ease: EASE.enterSoft, overwrite: true }));
      }
    };
    revealLayoutIcon('icon icon-atlas-list');
    // 分類 tab 同步反向收（clip wipe，CSS transition）
    drainRevealTimers();
    [...btns].reverse().forEach((btn, i) => {
      const t = setTimeout(() => {
        if (btn.isConnected) btn.classList.remove('atlas-filter-revealed');
      }, i * STAGGER);
      revealTimers.push(t);
    });
    if (typeof gsap === 'undefined') { finalize(); return; }
    const exitLines = /** @type {HTMLElement[]} */ ([
      ...listView.querySelectorAll('.atlas-list-line-clip > *'),
      ...listView.querySelectorAll('.atlas-list-col-title'),
    ]);
    const exitNavs = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-nav-item')]);
    if (exitLines.length === 0 && exitNavs.length === 0) { finalize(); return; }
    let done = 0;
    const total = (exitLines.length > 0 ? 1 : 0) + (exitNavs.length > 0 ? 1 : 0);
    const onOne = () => { if (++done >= total) gsap.delayedCall(0.1, finalize); };
    if (exitLines.length > 0) {
      gsap.to(exitLines, {
        yPercent: () => Math.random() < 0.5 ? 100 : -100,
        duration: DUR.slow, ease: EASE.exitSoft, overwrite: true, onComplete: onOne,
      });
    }
    if (exitNavs.length > 0) {
      gsap.fromTo(exitNavs,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 100% 0%)', duration: DUR.slow, ease: EASE.exitSoft, overwrite: true, onComplete: onOne },
      );
    }
  }

  function switchToMobileList() {
    if (currentView === 'list') return;
    currentView = 'list';
    // 星雲出場（user 2026-07-07）：stage 顯示中 chip clip 收 + 城市線退場，跑完才切 list（直向手機也走星雲，
    // 2026-07-09 拿掉 isLandscape() gate＝直向橫向都有出場）。clipPath 殘留由回程進場動畫重設。
    if (typeof gsap !== 'undefined' && stage.style.display !== 'none') {
      const HIDE = ['inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
      const EXIT_TOTAL = 0.4, EXIT_RANGE = 0.25;
      items.forEach(item => {
        if (!item._span || item._anchor.classList.contains('atlas-filtered-out')) return;
        const d = Math.random() * EXIT_RANGE;
        gsap.to(item._span, {
          clipPath: HIDE[Math.floor(Math.random() * 4)],
          duration: EXIT_TOTAL - d * 0.5, delay: d,
          ease: EASE.exitSoft, overwrite: true,
        });
      });
      cityLines.forEach(cl => gsap.to(cl, { retractT: 1, duration: EXIT_TOTAL + EXIT_RANGE, ease: EASE.exitSoft, overwrite: true }));
      gsap.delayedCall(EXIT_TOTAL + EXIT_RANGE + 0.05, () => {
        if (currentView !== 'list') return;   // 出場期間又切回 map → 放棄本次切換收尾
        finishSwitchToMobileList();
      });
      return;
    }
    finishSwitchToMobileList();
  }

  function finishSwitchToMobileList() {
    stage.style.display = 'none';
    refreshFloatRunning();   // 手機回 list：暫停 rAF
    if (rotateHintEl) rotateHintEl.style.display = 'none';
    if (filterEl) filterEl.style.display = '';
    listView.classList.add('visible');
    updateGateSubVisibility(); // 橫向 gate：alumni tab active 時左欄子分頁鈕跟著出現
    // 分類 tab 重新 wipe in（進星雲時被反向收掉）
    drainRevealTimers();
    btns.forEach((btn, i) => {
      const t = setTimeout(() => {
        if (btn.isConnected) btn.classList.add('atlas-filter-revealed');
      }, i * STAGGER);
      revealTimers.push(t);
    });
    revealLayoutIcon('icon icon-atlas-view');
    // 星雲模式期間可能轉向過 → 以當前 viewport 重 render 顯示中的欄
    listView.querySelectorAll('.atlas-list-col').forEach(col => {
      const colEl = /** @type {HTMLElement} */ (col);
      if (colEl.style.display === 'none') return;
      const cat = /** @type {string} */ (colEl.dataset.category);
      renderListPage(colEl, cat, listPageState[cat] || 0, true);
      if (typeof gsap !== 'undefined') playColEnterAnim(colEl, cat, 0);
    });
  }

  // ── 手機：init 直接進 list view ─────────────────────
  // 不走 switchToList（那是「map 收場 → list 進場」的編排，手機 init 沒有 map 可收）；
  // filter btn 留著當底部分類 tab（CSS 移位）
  if (isMobileAtlas) {
    // 手機（直向 + 橫向 gate）預設星雲圓點（user 2026-07-09「atlas 做成跟橫向手機一樣」，直向對齊橫向）、
    // layout btn 切 list。stage 加 .atlas-dot-mode → 圓點/zoom CSS 生效（class gate，直向橫向共用一套）。
    // list DOM 先建好（switchToMobileList 只重渲染可見欄，空 DOM 會切出白畫面）；不跑 apply()——
    // applyMapFilter 會把非 faculty chip 全藏，星雲要全 chip 純瀏覽。跨 gate 轉向由 orientation-reload 重載。
    currentView = 'map';
    stage.classList.add('atlas-dot-mode');
    renderList();
    applyListFilter();          // list 只顯示預設 faculty 欄（layout btn 切過去才顯示）
    updateFilterBtnColors();    // tab active 樣式（switchToMobileList 顯示時直接可用）
    btns.forEach(b => b.classList.toggle('active', selected.has(b.dataset.filter)));
    const gateLayoutIcon = /** @type {HTMLElement|null} */ (layoutBtn ? layoutBtn.querySelector('.icon') : null);
    if (gateLayoutIcon) gateLayoutIcon.className = 'icon icon-atlas-list'; // map view 顯示「切 list」icon
    if (filterEl) filterEl.style.display = 'none';   // 分頁 tab 只在 list view 顯示
    if (isLandscapeGateAtlas) ensureGateSubBtns();   // alumni 左欄子分頁鈕＝橫向 list 3-col 專屬（直向 list 用 2-col）
    // Filter 段尾的 apply()（單選 ['faculty']）已把 B 環/em/partners chip 全藏 → 補回全 chip 純瀏覽
    // （同 switchToMobileMap finalize；user 2026-07-07「那一環的內容不見了」）
    items.forEach(item => {
      if (!item._anchor) return;
      item._anchor.classList.remove('atlas-filtered-out');
      (itemLines.get(item.id) || []).forEach(l => { l.style.display = ''; });
    });
    syncMobileMapOrientation();
  }

  // ── Page exit：離開 atlas 時依當下 view 跑對應退場 ─────────────
  // map view 用 switchToList 開頭的「東西消失」階段（subchip + btn collapse + cover/span hide + cityLines retract），
  // list view 用 switchToMap 退場階段（yPercent col-title + line-clip + clip-path nav-item）；
  // 兩者都不跑下游 startList / finalize，純做退場讓 router cleanup 接手
  // idle-standby root 不是 document，不走 registerPageExit（overlay 非 routed page）——
  // 改掛到 module-level _overlayExit，由 idle-standby exitStandby 呼叫 playOverlayAtlasExit()
  if (options.root === undefined || options.root === document) {
    registerPageExit(() => {
      if (typeof gsap === 'undefined') return Promise.resolve();
      if (currentView === 'list') return playListExit();
      return playMapExit();
    });
  } else {
    _overlayExit = () => {
      if (typeof gsap === 'undefined') return Promise.resolve();
      return currentView === 'list' ? playListExit() : playMapExit();
    };
    cleanupFns.push(() => { _overlayExit = null; });
  }

  function playMapExit() {
    return new Promise(resolve => {
      drainRevealTimers();
      // 手機星雲直式的轉向提示層：離頁即時收掉（覆蓋層無退場動畫需求）
      if (rotateHintEl) rotateHintEl.style.display = 'none';
      if (listCareerCtrl) listCareerCtrl.hide();
      hideCareer({ stagger: SUBCHIP_STAGGER });
      if (layoutBtn) layoutBtn.classList.remove('atlas-layout-revealed');
      [...btns].reverse().forEach((btn, i) => {
        const t = setTimeout(() => {
          if (btn.isConnected) btn.classList.remove('atlas-filter-revealed');
        }, i * STAGGER);
        revealTimers.push(t);
      });
      if (introTween) introTween.kill();

      const REVEAL_TOTAL = 0.35;
      const HIDE_TOTAL   = 0.4;
      const REVEAL_RANGE = 0.2;
      const HIDE_RANGE   = 0.28;
      const allWithSpan = items.filter(i => i._span);
      const allSpans  = allWithSpan.map(i => i._span);
      const allCovers = allWithSpan.map(i => i._cover).filter(Boolean);

      gsap.set(allCovers, { clipPath: 'inset(0% 100% 0% 0%)' });

      const HIDE_DIRS = [
        'inset(0% 0% 0% 100%)',
        'inset(0% 100% 0% 0%)',
        'inset(100% 0% 0% 0%)',
        'inset(0% 0% 100% 0%)',
      ];
      introTween = gsap.timeline({ onComplete: () => gsap.delayedCall(0.2, resolve) });
      allCovers.forEach(cover => {
        const d = Math.random() * REVEAL_RANGE;
        introTween.to(cover, { clipPath: 'inset(0% 0% 0% 0%)', duration: REVEAL_TOTAL - d, ease: EASE.enterSoft }, d);
      });
      const p2Start = REVEAL_TOTAL;
      allSpans.forEach(span => {
        const d = Math.random() * HIDE_RANGE;
        const dir = HIDE_DIRS[Math.floor(Math.random() * 4)];
        introTween.to(span, { clipPath: dir, duration: HIDE_TOTAL - d, ease: EASE.enterSoft }, p2Start + d);
      });
      hideLayoutIcon({ timeline: introTween, position: 0 });
      cityLines.forEach(cl => { cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b'; });
      cityLines.forEach(cl => {
        introTween.to(cl, { retractT: 1, duration: REVEAL_TOTAL + HIDE_TOTAL, ease: EASE.enterSoft, overwrite: true }, 0);
      });
      if (allCovers.length === 0 && allSpans.length === 0) gsap.delayedCall(0.2, resolve);
    });
  }

  function playListExit() {
    return new Promise(resolve => {
      if (listCareerCtrl) listCareerCtrl.hide();
      if (layoutBtn) layoutBtn.classList.remove('atlas-layout-revealed');
      hideLayoutIcon();
      // 手機：底部分類 tab（= filter btns）跟著收場（桌面 list view 時 filter 本就隱藏不用收）
      if (isMobileAtlas) {
        drainRevealTimers();
        [...btns].reverse().forEach((btn, i) => {
          const t = setTimeout(() => {
            if (btn.isConnected) btn.classList.remove('atlas-filter-revealed');
          }, i * STAGGER);
          revealTimers.push(t);
        });
      }
      const yPercentExitTargets = /** @type {HTMLElement[]} */ ([
        ...listView.querySelectorAll('.atlas-list-line-clip > *'),
        ...listView.querySelectorAll('.atlas-list-col-title'),
      ]);
      const navExitTargets = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-nav-item')]);
      if (yPercentExitTargets.length === 0 && navExitTargets.length === 0) {
        gsap.delayedCall(0.2, resolve);
        return;
      }
      let done = 0;
      const total = (yPercentExitTargets.length > 0 ? 1 : 0) + (navExitTargets.length > 0 ? 1 : 0);
      const onOne = () => { if (++done >= total) gsap.delayedCall(0.2, resolve); };
      if (yPercentExitTargets.length > 0) {
        gsap.to(yPercentExitTargets, {
          yPercent: () => Math.random() < 0.5 ? 100 : -100,
          duration: DUR.slow, ease: EASE.exitSoft, overwrite: true, onComplete: onOne,
        });
      }
      if (navExitTargets.length > 0) {
        gsap.fromTo(navExitTargets,
          { clipPath: 'inset(0% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 100% 0%)', duration: DUR.slow, ease: EASE.exitSoft, overwrite: true, onComplete: onOne },
        );
      }
    });
  }
}

// ── Layout ─────────────────────────────────────────────

function layoutItems(items, W, H, srand) {
  const cx = W / 2, cy = H / 2;
  const minDim = Math.min(W, H);

  // 1. D 城市散佈：完全 chaotic（無圓心避讓），只看邊距 + 彼此最小距離
  const cities = items.filter(i => i.category === 'D');
  const placedCities = [];
  cities.forEach(city => {
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = CITY_EDGE_PAD + srand() * (W - CITY_EDGE_PAD * 2);
      const y = CITY_EDGE_PAD + srand() * (H - CITY_EDGE_PAD * 2);
      let collides = false;
      // 城市必須在外層 ring（最小距中心半徑 = CITY_DIST_FROM_CENTER_MIN_FRAC * minDim）
      const dxC = x - cx, dyC = y - cy;
      if (Math.sqrt(dxC*dxC + dyC*dyC) < CITY_DIST_FROM_CENTER_MIN_FRAC * minDim) continue;
      for (const c of placedCities) {
        const dx = x - c.x, dy = y - c.y;
        if (Math.sqrt(dx*dx + dy*dy) < CITY_MIN_SPACING) { collides = true; break; }
      }
      if (collides) continue;
      city.x = x; city.y = y;
      placedCities.push(city);
      placed = true; break;
    }
    if (!placed) {
      city.x = CITY_EDGE_PAD + srand() * (W - CITY_EDGE_PAD * 2);
      city.y = CITY_EDGE_PAD + srand() * (H - CITY_EDGE_PAD * 2);
    }
  });

  // 2. A/C 均勻鋪滿內容區：用 jittered grid（每格一個 item + 格內抖動）取代隨機散佈。
  //    隨機散佈本質上會有 Poisson 團簇（一坨）+ 空洞；jittered grid 由「構造上」均勻覆蓋整個可用畫面，
  //    再靠下方 box-aware 鬆弛把寬 label 局部推開。抖動 0.42 格 → 看起來仍是有機散佈、不是死板格線。
  //    填滿 [pad, W-pad] × [pad, H-pad]（= scale 0.78 後的可用畫面）；上下留白是 atlas 既定的呼吸邊距。
  //    （ELLIPSE_* / CLUSTER_Y_BIAS 已不再用於 A/C 散佈，保留常數供其他參考）
  const pad = 26;
  const fieldW = W - pad * 2, fieldH = H - pad * 2;

  // 估計每個 label 的視覺寬高（render 前量不到真值 → 用字數推算）給 box-aware 鬆弛用。
  //   FILL 0.6 = 碰撞箱取實際字寬的 60% → 容許中度重疊（user：重疊 OK）、又能塞滿不爆邊；想更稀疏少重疊就調高。
  const FILL = 0.6;
  const acList = [];
  items.forEach(item => {
    if (item.category === 'D' || item.category === 'B') return;
    const enLen = (item.textEn || '').length;
    const zhLen = (item.textZh && item.textZh !== item.textEn) ? item.textZh.length : 0;
    const w = Math.max(enLen * 7.5, zhLen * 15, 28);        // 英 ~7.5px/字、中 ~15px/全形字
    const lines = ((item.textEn ? 1 : 0) + (zhLen ? 1 : 0)) || 1;
    item._relaxHW = (w / 2) * FILL;
    item._relaxHH = (lines * 18 / 2) * FILL;               // 每行 ~18px
    acList.push(item);
  });

  // jittered grid：依長寬比算近正方格子數，shuffle slot 後逐格放（避免同類連續排成一條），格內隨機抖動
  const nAC = acList.length;
  const cols = Math.max(1, Math.round(Math.sqrt(nAC * fieldW / fieldH)));
  const rows = Math.ceil(nAC / cols);
  const cellW = fieldW / cols, cellH = fieldH / rows;
  const order = acList.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(srand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const JIT = 0.42;   // 抖動幅度（格子比例）：夠大像有機散佈、又不致重新結團
  order.forEach((acIdx, slot) => {
    const it = acList[acIdx];
    const gx = slot % cols, gy = Math.floor(slot / cols);
    it.x = pad + (gx + 0.5 + (srand() - 0.5) * 2 * JIT) * cellW;
    it.y = pad + (gy + 0.5 + (srand() - 0.5) * 2 * JIT) * cellH;
  });

  // 3. Box-aware 鬆弛：依每個 label 的估計 bbox 互推（沿「穿透較淺」軸分開 = 最小位移），把寬 label 局部推開。
  //    grid 已均勻 → 這裡只需少量迭代修掉寬字重疊，不會把分佈重新推成一坨。
  const STEP = 0.35;   // 每次迭代每側移動 = 重疊量 × STEP（小步收斂穩定不抖）
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    for (let i = 0; i < acList.length; i++) {
      const a = acList[i];
      for (let j = i + 1; j < acList.length; j++) {
        const b = acList[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a._relaxHW + b._relaxHW) - Math.abs(dx);  // x 方向重疊量（>0 = 重疊）
        const oy = (a._relaxHH + b._relaxHH) - Math.abs(dy);  // y 方向重疊量
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const s = (dx === 0 ? (i & 1 ? 1 : -1) : Math.sign(dx)) * ox * STEP;
            a.x -= s; b.x += s;
          } else {
            const s = (dy === 0 ? (i & 1 ? 1 : -1) : Math.sign(dy)) * oy * STEP;
            a.y -= s; b.y += s;
          }
        }
      }
    }
    for (let k = 0; k < acList.length; k++) {
      const it = acList[k];
      it.x = Math.max(pad, Math.min(W - pad, it.x));
      it.y = Math.max(pad, Math.min(H - pad, it.y));
    }
  }
}

// ── Helpers ────────────────────────────────────────────

function mulberry32(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

