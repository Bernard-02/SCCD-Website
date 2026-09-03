/* global gsap */
import { applyMarqueeOverflow, bindMarqueeReturn } from '../ui/marquee-overflow.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { ensureIconClipWrap, navChipHidden, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { loadAtlasData } from './atlas-source.js';
import { countryName } from '../../data/country-names.js';
import { sitePath } from '../ui/site-base.js';
import { loadUiLabels, applyUiLabels } from '../ui/ui-labels.js';

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

// 節點 clip-reveal 收合的 4 向隱藏終點（往右/左/下/上收）；map filter 收/展、countries gate、
// 城市退場（buildMapExitTl）共用一份，per-item 隨機挑向
const NODE_HIDE_INSETS = [
  'inset(0% 0% 0% 100%)', // 往右收
  'inset(0% 100% 0% 0%)', // 往左收
  'inset(100% 0% 0% 0%)', // 往下收
  'inset(0% 0% 100% 0%)', // 往上收
];

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
  // guest 欄名雙 shape：本地 workshops.json＝name/name_zh（name 即單位名）；
  // Directus activities guests repeater＝nameEn/Zh（人名）+ orgEn/Zh（單位）→ 單位優先、無單位退人名
  // （08-26 踩坑：只讀 name/affiliation → 後台一有樣本資料就整類 0 顆、partners 欄整欄消失）
  /** @param {any} g */
  const guestEn = (g) => g.name || g.orgEn || g.nameEn || g.affiliation || '';
  /** @param {any} g */
  const guestZh = (g) => g.name_zh || g.orgZh || g.nameZh || g.affiliation_zh || '';
  // 同一單位跨多場次（Directus 真資料常見）→ 共用同一顆 chip、只把 id 加進各場次 group
  const seenPartnerChip = new Map();
  (workshops || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ws => {
      const wsGroupId = ws.id;
      if (!wsGroupId) return;
      const dt = (ws.descriptionZh || ws.description || ws.intro_zh || ws.intro || '').trim().slice(0, 140) ||
                 '本系與外部單位合作之工作營。';
      const memberIds = [];

      (ws.guests || []).forEach(g => {
        const en = guestEn(g);
        const zh = guestZh(g);
        if (!en && !zh) return;
        const dupKey = `wsg|${en}|${zh}`;
        const dup = seenPartnerChip.get(dupKey);
        if (dup) { dup.groups.push(wsGroupId); memberIds.push(dup.id); return; }
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
        seenPartnerChip.set(dupKey, it);
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
        const en = guestEn(g);   // 雙 shape（見 workshops 段註解）
        const zh = guestZh(g);
        if (!en && !zh) return;
        const dupKey = `ind|${en}|${zh}`;
        const dup = seenPartnerChip.get(dupKey);
        if (dup) { dup.groups.push(indGroupId); memberIds.push(dup.id); return; }
        const canon = g.country ? String(g.country).toUpperCase() : null;
        const it = {
          id: uid('ind'), category: 'C',
          textEn: en, textZh: zh,
          labelEn: 'Industry Partner', labelZh: '產學合作公司',
          detail: dt, groups: [indGroupId], cityKey: canon, _countryCode: g.country || '',
        };
        items.push(it);
        memberIds.push(it.id);
        seenPartnerChip.set(dupKey, it);
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
  // 環位打散（user 08-28）：資料序＝list 分頁序，環位若也照 idx 排＝「會出現在 list 當頁的那批」
  // 全擠同一段弧、morph 起飛像整片剝落 → 環位用 seeded shuffle 與資料序解耦（同 seed＝重載穩定）
  const ringSlotRand = mulberry32(LAYOUT_SEED ^ 0x5C0FFEE);
  const ringSlots = companyItems.map((_, i) => i);
  for (let i = ringSlots.length - 1; i > 0; i--) {
    const j = Math.floor(ringSlotRand() * (i + 1));
    [ringSlots[i], ringSlots[j]] = [ringSlots[j], ringSlots[i]];
  }

  companyItems.forEach((item, idx) => {
    // chip 初始位置 uniform 在 arc length 上分佈（視覺均勻）；flow 用 V-parameterization（inverse-speed k=2）
    const slot = ringSlots[idx];
    const s0 = slot * arcStep;
    const baseAngle = uToTheta(s0) - Math.PI / 2;
    const v0 = thetaToV(baseAngle + Math.PI / 2);
    item.x = cx + COMPANY_ELLIPSE_RX * Math.cos(baseAngle);
    item.y = cy + COMPANY_ELLIPSE_RY * Math.sin(baseAngle);
    item._companyRingIdx = slot;
    // 鋸齒：方向依「環位」奇偶嚴格交替（空間相鄰交替，與資料序無關）、幅度 seeded random → 不規則深淺
    item._zigzagY = (slot % 2 ? -1 : 1) *
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

  // user 2026-09-01（第2輪）：item 維持鋪滿 viewport，城市**再往外擴散**到 0.78-scale 後的外緣呼吸帶
  //   （item 縮圖後密度往邊緣遞減，外圈最空）→ 內緣推更外 + bbox 放寬到近邊緣（layout 1.16×half ×0.78≈螢幕 0.90 半、
  //   仍留 ~10% chip 邊距不出界）。⚠️ 寬 viewport 下軌道太圓（ry 大）會被 H bbox 夾扁反而整體縮小落回中央 →
  //   aspect 維持橫扁土星環，靠 H cap 拉高 + tilt 讓部分軌道伸進頂/底。
  // user 2026-09-02（第3輪）：城市再往外「用掉 0.78-scale 的 22% 空邊」。實測 item 場到螢幕 ~0.77-0.88 半、
  //   城市卻只到 ~0.69-0.73（反而在 item 內側）＝orbit cap 太保守。cap 推到 1.22×half（layout；因整層再 ×0.78
  //   ＝螢幕 ~0.95 半、chip 8px 半仍不出界），環半徑常態抬到 ~0.93；tilt 加大讓外環伸向四角。
  //   ⚠️ 這是「環半徑」上限；11 顆城市散在各角度、任一瞬間仍非全部貼邊（要全部釘邊＝改逐城市貼框的 perimeter 佈局，非此 orbit 制）。
  //   ⚠️ 綁定的是 ORBIT_BBOX_H_MAX：aspect/tilt 一大 → 傾斜橢圓 bbox 變高撞 H cap → fitTiltedEllipse 等比縮小整環
  //   （rx 跟著縮回中間）。空邊左右(158px)＞上下(88px) → 要「扁而寬」的環伸到左右大空帶，不是圓/斜。
  const ORBIT_RX_MIN_F   = 1.18;              // 環內緣（floor 抬高＝整環常態貼外緣，不再有偏內的小環）
  const ORBIT_RX_MAX_F   = 1.40;              // 環外緣（bbox 會夾回畫面內）
  const ORBIT_ASPECT_MIN = 0.42;              // 扁環（ry 小 → rx 不被 H cap 綁、能長到 W cap 貼左右）
  const ORBIT_ASPECT_MAX = 0.56;
  const ORBIT_TILT_MAX   = Math.PI / 16;      // ±~11° 傾斜收回（tilt 大會撐高 bbox 撞 H cap 反而縮環）
  // bbox cap = 軌道最遠處不超過 viewport 邊（user 指定 15s 變化位置不能超過 viewport）；scale 0.78 有邊距餘裕：
  //   W 放到 1.24×half（螢幕 ~0.97）吃左右大空帶；H 1.16×half（螢幕 ~0.90）留頂/底 chip 邊距
  const ORBIT_BBOX_W_MAX = halfW * 1.24;
  const ORBIT_BBOX_H_MAX = halfH * 1.16;

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
  // ⚠️ 城市邊界夾制要走「螢幕空間」：整層 #atlas-zoom ×defaultScaleAtlas(0.78) → 用邏輯 pad 直接夾會把城市
  //   困在螢幕 ~0.72 半（實測）＝空掉外圈 22% scale 邊、城市反在 item 內側（user 2026-09-02 報「還有很多空間沒用」）。
  //   改成「畫面邊往內留 chip 邊距 → 映射回邏輯座標」的上下限，城市才能貼到近畫面邊、用掉空邊。手機 scale 1.0 時退化＝一般邊夾。
  const CITY_SCREEN_MARGIN = 18;   // 螢幕 px：chip 半寬 + 呼吸（不出界，user：不要移動到畫面以外）
  const _cityReachX = (W / 2 - CITY_SCREEN_MARGIN) / defaultScaleAtlas;
  const _cityReachY = (H / 2 - CITY_SCREEN_MARGIN) / defaultScaleAtlas;
  const CITY_MIN_X = W / 2 - _cityReachX, CITY_MAX_X = W / 2 + _cityReachX;
  const CITY_MIN_Y = H / 2 - _cityReachY, CITY_MAX_Y = H / 2 + _cityReachY;

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
    // list view / morph 期間不換排列：凍結中偷換 orbit 參數＝回 map 線畫好後 float 一恢復整組跳版
    // （user 08-25「連線暫停後跳成另一版」）。兩變數宣告在後（首次 tick 10s 時 init 早已完成）。
    if (viewMorphing || currentView !== 'map') return;
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

    // ── 單一節點雙形態結構（2026-08-25）────────────────────────────
    // 同一個 span 同時是 map chip 與 list row：名行包兩層 wrapper（外層 list 形態當
    // .atlas-list-line-clip 遮罩、內層當 .atlas-list-item-name），en/zh 內建 .atlas-marquee-inner
    // （list marquee 用；chip 形態純 inline 不影響折行）。list 專用 class 由 toListForm 動態掛
    // （靜態掛會讓 .atlas-list-name-en 的 nowrap 規則吃到 chip 折行）。
    const nameLine = document.createElement('div');
    nameLine.className = 'atlas-item-nameline';
    const nameBlock = document.createElement('div');
    nameBlock.className = 'atlas-item-nameblock';
    /** @param {string} cls @param {string} text */
    const mkNameSpan = (cls, text) => {
      const el = document.createElement('span');
      el.className = cls;
      const inner = document.createElement('span');
      inner.className = 'atlas-marquee-inner';
      inner.textContent = text;
      el.appendChild(inner);
      return el;
    };
    let enEl = null, zhEl = null;
    if (item.textEn) {
      enEl = mkNameSpan('atlas-name-en', item.textEn);
      nameBlock.appendChild(enEl);
    }
    if (item.textZh && item.textZh !== item.textEn) {
      zhEl = mkNameSpan('atlas-name-zh', item.textZh);
      nameBlock.appendChild(zhEl);
    }
    nameLine.appendChild(nameBlock);
    span.appendChild(nameLine);

    // 副標區（list 形態專用、chip 隱藏）：結構同原 buildListItemEl 的 line-clip 副標，
    // list 專用 class 靜態掛（display:none 下無害、換形免逐項 toggle）
    const subsEl = document.createElement('div');
    subsEl.className = 'atlas-item-subs';
    /** @param {string|undefined} en @param {string|undefined} zh */
    const addSub = (en, zh) => {
      if (!en && !zh) return;
      const clip = document.createElement('div');
      clip.className = 'atlas-list-line-clip';
      const sub = document.createElement('div');
      sub.className = 'atlas-list-item-label';
      const addLabel = (/** @type {string} */ cls, /** @type {string} */ text) => {
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
      clip.appendChild(sub);
      subsEl.appendChild(clip);
    };
    if (item.category !== 'D') {
      const listCat = getItemCat(item);
      if (listCat === 'partners') {
        addSub(item._listCountryEn, item._listCountryZh);   // 先國家、後類型（user 2026-06-23 對調）
        addSub(item._listTypeEn, item._listTypeZh);
      } else {
        addSub(item._listSubEn, item._listSubZh);   // faculty: 職稱(＋國家)；host/employ: 國家
      }
    }
    span.appendChild(subsEl);
    item._nameLine = nameLine;
    item._nameBlock = nameBlock;
    item._enEl = enEl;
    item._zhEl = zhEl;
    item._subsEl = subsEl;

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

  // A/C label 浮動 wobble 的當幀 translate/rotate（Phase 2 與 toChipForm 換形共用＝單一相位來源）。
  // toChipForm 換形回星雲時要寫「當下相位」而非凍結快照：flipFlyNode 起飛時會把此值補回當殘差錨、
  // 且 base.rotation 也依它算 → 若寫舊快照、下一幀 tickFloat 覆寫成推進相位、rotate 差疊大位移＝落點
  // 殘跳（見 flipFlyNode 殘差區塊）。t 用 tickFloat 同式 performance.now()/1000 - floatStart。
  function floatWobble(item, t) {
    const f = item._float;
    // hover 單顆凍結：paused 時 effT 凍在 pauseAt、resume 後靠 tOffset 補回暫停時長＝解凍無相位跳（同 orbit pause）
    const effT = (item._floatPauseAt != null ? item._floatPauseAt : t) - (item._floatTOffset || 0);
    const cycleLen = f.dur * 2;
    const cyclePos = ((effT + f.phase) % cycleLen + cycleLen) % cycleLen;
    let p = cyclePos < f.dur ? cyclePos / f.dur : 2 - cyclePos / f.dur;
    p = p * p * (3 - 2 * p);  // smoothstep ease in-out
    // hover 轉正因子：_straight 0→1 時 rotate 平滑收到 0（位移 wobble 不受影響＝user 只要角度轉正）；
    // _lastP 快取給 float 凍結（reduced motion）時 setStraighten 直接寫 rotate 用
    const dx = f.tx * p, dy = f.ty * p, dRot = (f.baseRot + f.rotDelta * p) * (1 - (item._straight || 0));
    item._span.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
    item._span.style.rotate = `${dRot.toFixed(2)}deg`;
    item._floatDx = dx;
    item._floatDy = dy;
    item._lastP = p;
  }

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
          c.x = Math.max(CITY_MIN_X, Math.min(CITY_MAX_X, c.x + ox)) - ox;
          c.y = Math.max(CITY_MIN_Y, Math.min(CITY_MAX_Y, c.y + oy)) - oy;
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
      if (item._asList) continue;   // 單一節點：list 形態中的節點不吃 wobble（會蓋掉 list 排版）
      // 用 CSS individual translate + rotate（不衝突 .atlas-cat-b 的 transform: translate(-50%, -50%) 與 .atlas-name 的 translateY(-50%)）
      floatWobble(item, t);
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
  // 單一節點遮罩架構（2026-08-25）：morph 期間 wobble 時鐘全程凍結（含 list 停留期＝stage 藏），
  // 回 map 收尾 refreshFloatRunning 用既有 floatPausedAt 補償 → 從凍結相位接續、落點零跳動。
  // 宣告在此（refreshFloatRunning init 就會讀，宣告在 morph 區會 TDZ）
  let viewMorphing = false;
  // 反向 morph「全 item 掀完」提前解凍（user 08-25：host 圈落地後呆等城市線收尾才轉）：
  // mask 全離場＋落點量測全完成後，wobble 不必等 master（被城市/線 2.25s 拖尾）收尾
  let floatThawEarly = false;
  function refreshFloatRunning() {
    // 減少動態：定位一次後凍結，不持續 rAF 漂浮（WCAG 2.3.3 / 2.2.2）。tickFloat 用絕對時間算位置、
    // floatRunning 維持 false → 跑一幀即完整定位且不自排下一幀；display/visibility 變動時再補定位一次。
    if (prefersReducedMotion()) {
      if (!document.hidden && stage.style.display !== 'none') tickFloat(performance.now());
      return;
    }
    const want = !document.hidden && !menuPausedAtlas && (!viewMorphing || floatThawEarly) && stage.style.display !== 'none';
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
      // cell：切批四向 clip-reveal 的動畫目標（遮罩＝span 的 fit-content 寬）；marquee 動更內層 inner
      const cell = document.createElement('span');
      cell.className = 'atlas-detail-cell';
      const inner = document.createElement('span');
      inner.className = 'atlas-marquee-inner';
      inner.textContent = text;
      cell.appendChild(inner);
      span.appendChild(cell);
      main.appendChild(span);
    };
    if (rel.textEn) addLine('atlas-detail-row-en', rel.textEn);
    if (rel.textZh && rel.textZh !== rel.textEn) addLine('atlas-detail-row-zh', rel.textZh);
    row.appendChild(main);
    const cat = document.createElement('div');
    cat.className = 'atlas-detail-row-cat';
    // cat 英中兩行包進 clip>cell 當一個 cell 一起滑（遮罩貼 label 寬 → 水平平移 contained）
    const catClip = document.createElement('span');
    catClip.className = 'atlas-detail-cat-clip';
    const catCell = document.createElement('span');
    catCell.className = 'atlas-detail-cell';
    if (rel.labelEn) { const e = document.createElement('span'); e.textContent = rel.labelEn; catCell.appendChild(e); }
    if (rel.labelZh) { const z = document.createElement('span'); z.className = 'cat-zh'; z.textContent = rel.labelZh; catCell.appendChild(z); }
    catClip.appendChild(catCell);
    cat.appendChild(catClip);
    row.appendChild(cat);
    clip.appendChild(row);
    return clip;
  }

  function renderDetailBatch(idx) {
    if (!descEl) return;
    descEl.innerHTML = '';
    (detailBatches[idx] || []).forEach(rel => descEl.appendChild(buildDetailRow(rel)));
    // 卡片固定寬 → title 子欄受限，過長自動 marquee。
    // ⚠️ marquee 量寬是 forced reflow：若在切批當幀同步跑，會卡在 reveal 起跑那一幀（user 2026-09-02 報 reveal 卡頓）。
    //   延到下一幀 rAF → 切批幀只做 DOM 重建 + reveal 'from' set（純寫、無 layout 讀）＝reveal 首幀不卡。
    //   transform 不影響 offsetWidth，延後量測仍準；hover-out 清空後 querySelector 撲空＝no-op、安全。
    // tolerance:1 — en/zh 改 fit-content 後遮罩貼齊文字，subpixel 進位可能讓剛好貼齊的行 scrollWidth-offsetWidth===1 假溢出
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => applyMarqueeOverflow(descEl, '.atlas-detail-row-en, .atlas-detail-row-zh', '.atlas-marquee-inner', { tolerance: 1 }));
    } else {
      applyMarqueeOverflow(descEl, '.atlas-detail-row-en, .atlas-detail-row-zh', '.atlas-marquee-inner', { tolerance: 1 });
    }
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
      // 切批四向 clip-reveal：per-cell fit-content 遮罩。gsap 動每列的 .atlas-detail-cell（block、寬＝其外 span 的
      //   fit-content 貼文字寬）→ xPercent/yPercent ±110% 平移「只滑自己文字寬/行高」，並在 span / cat-clip 的
      //   overflow:hidden 邊被裁 → 四向皆 contained 在「該 item 自己的 box」內（user 2026-09-02 重啟四向需求，
      //   此 per-cell 內層 box 結構就是當時因成本擱置的那條路）。
      //   ⚠️ 只動 transform 走 compositor；禁用 clip-path（每幀 full repaint＝卡頓源，memory 明令勿回退）。
      //   ⚠️ marquee 動更內層 .atlas-marquee-inner，與 cell 不同元素、不撞（memory gsap_nullifies_css_individual_transform）。
      //   ⚠️ 方向每列只抽一次、同列 3 cell 共用（列讀作一個 item 不撕裂）；分開對 x/y 抽會湊出對角線。
      const pickDir = () => DETAIL_HIDDEN_OFFSETS[Math.floor(Math.random() * DETAIL_HIDDEN_OFFSETS.length)];
      const rowCells = () => [...descEl.querySelectorAll('.atlas-detail-row')]
        .map(rowEl => [...rowEl.querySelectorAll('.atlas-detail-cell')])
        .filter(cells => cells.length);
      const slideIn = () => {   // swap 後：新批每列 cell 由隨機方向 clip-reveal 滑入
        const inTl = gsap.timeline();
        rowCells().forEach((cells, ri) => {
          const d = pickDir();
          inTl.from(cells, {
            xPercent: d.xPercent, yPercent: d.yPercent,
            duration: DUR.reveal, ease: EASE.enter,
            clearProps: 'transform',   // 揭露後清 inline transform → 回自然流、不干擾下次量測與 marquee
          }, ri * 0.05);
        });
        descClipTween = inTl;
      };
      const outTl = gsap.timeline({ onComplete: () => { swap(); slideIn(); } });
      rowCells().forEach((cells, ri) => {
        const d = pickDir();   // 出/入方向各自獨立隨機（沿用今日行為）
        outTl.to(cells, {
          xPercent: d.xPercent, yPercent: d.yPercent,
          duration: DUR.fast, ease: EASE.exitSoft,
        }, ri * 0.04);
      });
      descClipTween = outTl;
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
        // ⚠️ 批次量測（原本逐 rel「寫 textContent → 讀 offsetWidth」交錯 = O(n) forced reflow，實測 hover 首幀 132ms；
        //   profiler 2026-09-01）→ 改成先 append 全部 probe span（純寫），再一次讀所有 offsetWidth（單次 reflow）。
        const meas = document.createElement('div');
        meas.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;';
        // maxWidth:none — .atlas-detail-row-en 現帶 max-width:100%（切批遮罩用），量測探針要量純文字自然寬、不可被夾
        const mkProbe = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.style.display = 'inline-block'; s.style.maxWidth = 'none'; s.textContent = text; meas.appendChild(s); return s; };
        const titleProbes = [];
        const catProbes = [];
        related.forEach(rel => {
          if (rel.textEn) titleProbes.push(mkProbe('atlas-detail-row-en', rel.textEn));
          if (rel.textZh && rel.textZh !== rel.textEn) titleProbes.push(mkProbe('atlas-detail-row-en', rel.textZh));
          if (rel.labelEn) catProbes.push(mkProbe('atlas-detail-row-cat', rel.labelEn));
          if (rel.labelZh) catProbes.push(mkProbe('atlas-detail-row-cat', rel.labelZh));
        });
        detail.appendChild(meas);   // 一次 append 完才讀 → 讀第一個 offsetWidth 觸發單次 layout、其餘走快取
        let titleW = 0;
        let catW = 0;
        for (const s of titleProbes) { const w = s.offsetWidth; if (w > titleW) titleW = w; }
        for (const s of catProbes) { const w = s.offsetWidth; if (w > catW) catW = w; }
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

  // ── A/B/C hover 轉正（角度收到 0°；同 D 方塊 openCountrySquare 的 rotate 轉正，user 09-01「hover item 都轉正」）──
  //   A/C：floatWobble 每幀套 (1-_straight)＝平滑收到 0；B（floatWobble 跳過）與 float 凍結時：onUpdate 直接寫 rotate。
  //   只轉角度、不動位移（translate wobble 保留）。D 走 openCountrySquare 自己轉正、此處自動略過。
  let straightItem = null;
  function tweenStraight(item, target) {
    const proxy = item._strProxy || (item._strProxy = { v: item._straight || 0 });
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      v: target, duration: 0.32, ease: target ? EASE.enterSoft : EASE.exitSoft,
      onUpdate: () => {
        item._straight = proxy.v;
        if (item.category === 'B' || !floatRunning) {   // floatWobble 不會幫這些寫 rotate → 直接寫
          const f = item._float;
          const base = item.category === 'B' ? f.baseRot : (f.baseRot + f.rotDelta * (item._lastP || 0));
          item._span.style.rotate = `${(base * (1 - proxy.v)).toFixed(2)}deg`;
        }
      },
    });
  }
  // A/C 浮動單顆凍結（hover 停在原地、離開續飄；同 orbit 的 pauseStart+tOffset＝解凍無相位跳）。
  // B floatWobble 不跑（其停頓靠 pauseRingFlow）、D 無 _float＝兩者自然 no-op。
  function pauseFloat(item) {
    if (!item || item.category === 'B') return;   // B：floatWobble 不跑、orbit 由 pauseRingFlow 統一凍
    if (item._float && item._floatPauseAt == null) item._floatPauseAt = performance.now() / 1000 - floatStart;
    // ⚠️ 也要凍個人小 orbit（co/em/wsg/ind 有、faculty 無＝no-op）：只凍 _float 但 anchor orbit 續動＝
    //    straighten 後的平字沿 orbit 30fps 不規則步進(0.1~0.46px)＝user 感知的「title 上下抖」（同 ring chip 平基線步進、傾斜藏得住）
    pauseCityOrbit(item);
  }
  function resumeFloat(item) {
    if (!item || item.category === 'B') return;
    if (item._float && item._floatPauseAt != null) {
      item._floatTOffset = (item._floatTOffset || 0) + (performance.now() / 1000 - floatStart - item._floatPauseAt);
      item._floatPauseAt = null;
    }
    resumeCityOrbit(item);
  }
  function setStraighten(item) {
    const next = (item && item.category !== 'D' && item._float) ? item : null;
    if (straightItem === next) return;
    if (straightItem) { tweenStraight(straightItem, 0); resumeFloat(straightItem); }   // 放開前一顆
    straightItem = next;
    if (straightItem) { tweenStraight(straightItem, 1); pauseFloat(straightItem); }
  }
  cleanupFns.push(() => { if (straightItem && straightItem._strProxy) gsap.killTweensOf(straightItem._strProxy); });

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
    setStraighten(item);   // A/B/C hover 轉正（D 已由 openCountrySquare 轉正、setStraighten 自動略過）
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
    setStraighten(null);   // 放開 A/B/C 轉正
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
      // 09-01：職業chip 改水平放在 Alumni title 右側（labelCol flex-row），gap 由 labelCol row-gap(xs=8px) 給 →
      //   mask 不再需要負 margin 抵消垂直 gap（舊版直堆時 -0.5rem 抵消 labelCol 的垂直 gap）。
      mask.style.marginTop = '0';
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

    // #6（user 09-01）：list career chip（dir 'top'，mask overflow:hidden 裁切）每次輪播從四方向之一隨機滑出/滑入；
    //   map view（dir 'left'）維持原 clip+translate 機制。四向都明確歸零另一軸 → 切換方向不留殘影。
    const CYCLE_SLIDE = {
      top:    { xPercent: 0,    yPercent: -100 },
      bottom: { xPercent: 0,    yPercent: 100  },
      left:   { xPercent: -100, yPercent: 0    },
      right:  { xPercent: 100,  yPercent: 0    },
    };
    const CYCLE_DIRS = ['top', 'bottom', 'left', 'right'];

    // 切下一個職業：滑出（沿隨機 dir）→ 換內容 + 換色 + 重 fit 寬度 → 從同方向滑入
    function rotateOnce() {
      if (typeof gsap === 'undefined') return;
      if (document.hidden) return;   // 背景分頁不輪播（對齊 dRelocateTimer）
      idx = (idx + 1) % careersList.length;
      if (tween) tween.kill();
      const rand4 = dirKey === 'top';   // 只有 list（mask）版做四向隨機
      const hideTo = rand4 ? CYCLE_SLIDE[CYCLE_DIRS[Math.floor(Math.random() * 4)]] : slideHidden();
      const showTo = rand4 ? { xPercent: 0, yPercent: 0 } : slideVisible();
      tween = gsap.to(el, {
        ...hideTo,
        duration: DUR.fast,
        ease: EASE.exitSoft,
        onComplete: () => {
          fill(careersList[idx]);
          // chip 滑出隱藏期間調整寬度，視覺上看不到 box 變動
          fitWidth();
          gsap.set(el, hideTo);
          tween = gsap.to(el, {
            ...showTo,
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
  // Subchip toggle state — 顯隱對應 _listSubGroup 的 alumni B/C chip；
  // 選取語意同主 filter btn（library 年份模型，見 click handler）——「兩顆全關」狀態不存在
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
      { en: 'Hosting',    zh: '主持',  key: 'host',   labelKey: 'atlas.host' },
      { en: 'Employment', zh: '就職',  key: 'employ', labelKey: 'atlas.employ' },
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
      enEl.textContent = label.en;                 // ui_labels 載入前的 fallback
      enEl.dataset.labelKey = label.labelKey; enEl.dataset.labelPart = 'en';
      const zhEl = document.createElement('span');
      zhEl.className = 'atlas-alumni-career-zh';
      zhEl.textContent = label.zh;
      zhEl.dataset.labelKey = label.labelKey; zhEl.dataset.labelPart = 'zh';
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
    // subchip 是 page-init 後才動態建 → 這裡自行填後台文字（main-modular 的 applyUiLabels 早跑、抓不到）
    loadUiLabels().then(m => applyUiLabels(m, alumniRow.parentElement || document));

    // 點擊 subchip：語意同主 filter btn 的 library 年份模型（user 08-27）——
    // 兩顆全開＝未篩選 → 點一顆＝聚焦（另一顆 inactive）；唯一 active 再點同顆＝回全開；
    // 點另一顆＝累加（兩顆版湊滿即全開）。「兩顆全關」狀態自此不存在（不再走 alumni deselect flow）。
    // 每次轉換恰好翻一顆 flag → setSubchipVisibility 只 clip show/hide 該 subgroup，
    // 不動 ring 方向 / orbit 位置（user 指定不要套 alumni inactive flow）
    Object.entries(subchipMap).forEach(([key, chip]) => {
      if (!chip) return;
      chip.addEventListener('click', () => {
        const other = key === 'host' ? 'employ' : 'host';
        const changed = (subchipActive.host && subchipActive.employ) ? other   // 全開 → 聚焦：關另一顆
          : (subchipActive[key] ? other                                        // 唯一 active 再點 → 開回另一顆
          : key);                                                              // 另一顆 active → 累加開自己
        subchipActive[changed] = !subchipActive[changed];
        Object.entries(subchipMap).forEach(([kk, c]) => {
          if (!c) return;
          c.classList.toggle('subchip-inactive', !subchipActive[kk]);
          c.setAttribute('aria-pressed', String(subchipActive[kk])); // 無障礙：報讀 toggle 狀態
        });
        setSubchipVisibility(changed, subchipActive[changed]);
        // employment 開關會影響國家節點 gate（employment/partners 皆 inactive → D 藏起）——
        // 此路徑不跑 applyMapFilter，gate 要在這裡補（user 2026-07-16）
        if (changed === 'employ') applyCountriesGate(true);
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
  function randomBDir() { return /** @type {'left'|'right'|'top'|'bottom'} */ ((['left', 'right', 'top', 'bottom'])[Math.floor(Math.random() * 4)]); }
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
      duration: opts.duration, ease: opts.ease || EASE.enterSoft,
      overwrite: opts.overwrite !== false,   // false＝與同 target 其他 tween（如 morph 靠攏位移）並行
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

  // 單一節點架構共用索引：span.dataset.itemId ↔ item（換形/撤離/配對都用）
  const itemByIdMap = new Map(items.map(it => [String(it.id), it]));
  // defer 模式（桌面 switchToList 預渲染期間 true）：build() 只建 wrapper 殼＋掛 _atlasItem 配對 ref，
  // 節點留在星雲等 morph 全遮蔽時才 toListForm；翻頁/手機（flag false）維持立即 reparent
  let deferListNodes = false;

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
    const CHEVRON_BAND = 56;   // list↔分頁鈕/欄底標題 gap sm→md（user 09-01；+8 讓最後一列與底部 bar 多留呼吸）
    const containerH = chevronBottomY - headerH - 64 - TITLEBLOCK_H - CHEVRON_BAND;
    const itemH = ITEM_H_PER_CAT[cat] || 84;
    const rowsPerCol = Math.max(3, Math.floor(containerH / itemH));
    const leftover = Math.max(0, containerH - (rowsPerCol * itemH));
    const gap = rowsPerCol > 1 ? leftover / (rowsPerCol - 1) : 0;
    return { rowsPerCol, gap, itemH };
  }

  // ── 單一節點換形（2026-08-25 單一節點遮罩架構）──────────────────────
  // 同一個 item._span 在 map chip ↔ list row 之間 reparent＋toggle class。
  // 名行 list class 動態掛（靜態掛會讓 .atlas-list-name-en 的 nowrap 吃到 chip 折行）；
  // 副標區 class 靜態掛（chip 形態 display:none 無害）。
  /** map chip → list row（呼叫端負責在「全遮蔽」或不可見時機呼叫）
   * @param {any} item @param {HTMLElement} slotEl 目標 .atlas-list-item-wrapper @param {string} cat list 欄位 */
  function toListForm(item, slotEl, cat) {
    const n = /** @type {HTMLElement} */ (item._span);
    // 暫存 wobble inline（回程落點與復原用；凍結相位下值恆定）
    item._savedTranslate = n.style.translate;
    item._savedRotate = n.style.rotate;
    n.style.translate = '';
    n.style.rotate = '';
    n.style.clipPath = '';   // 手機 map 出場的 clip 殘值（「殘留由回程進場重設」的舊約定不再成立）
    if (typeof gsap !== 'undefined') gsap.killTweensOf(n);   // 殺 span 級 clip/filter tween 防跨形態亂寫
    n.classList.remove('atlas-flying');            // 直飛被中斷的殘留（class / 字色 var / FLIP transform）
    n.style.removeProperty('--atlas-fly-c');
    n.style.transform = '';
    n.classList.add('atlas-as-list', 'atlas-list-item');
    n.dataset.category = cat;   // host 名稱 min-height 置中等規則吃 [data-category]
    item._nameLine.classList.add('atlas-list-line-clip');
    item._nameBlock.classList.add('atlas-list-item-name');
    if (item._enEl) item._enEl.classList.add('atlas-list-name-en');
    if (item._zhEl) item._zhEl.classList.add('atlas-list-name-zh');
    item._asList = true;   // tickFloat wobble gate 讀
    slotEl.appendChild(n);
  }
  /** marquee 狀態全歸零：殺 tween、剝 dual-copy、清 translateX/animation/is-overflow。
   *  ⚠️ 必須在「遮罩量測之前」跑（dual-copy 讓 inner 寬度翻倍 → 遮罩/內容盒全被灌爆）
   * @param {any} item */
  function resetMarqueeState(item) {
    const n = /** @type {HTMLElement} */ (item._span);
    n.querySelectorAll('.atlas-marquee-inner').forEach(inner => {
      const el = /** @type {HTMLElement} */ (inner);
      if (typeof gsap !== 'undefined') gsap.killTweensOf(el);
      const first = el.firstElementChild;
      if (el.children.length === 2 && first && first.classList.contains('marquee-copy')) {
        el.innerHTML = first.innerHTML;   // 剝 dual-copy 還原單份
      }
      el.style.transform = '';
      el.style.animation = '';
    });
    n.querySelectorAll('.is-overflow').forEach(el => {
      el.classList.remove('is-overflow');
      /** @type {HTMLElement} */ (el).style.removeProperty('--marquee-distance');
    });
  }
  /** list row → map chip：殺 marquee/行級殘留歸零（殘值會歪 chip 折行與遮罩量測）
   * @param {any} item */
  function toChipForm(item) {
    const n = /** @type {HTMLElement} */ (item._span);
    resetMarqueeState(item);
    if (typeof gsap !== 'undefined') gsap.killTweensOf(n);   // 直飛 FLIP tween 可能還掛在 span 上
    n.classList.remove('atlas-flying');
    n.style.removeProperty('--atlas-fly-c');
    n.style.transform = '';   // FLIP 殘值；A/C chip 置中回 CSS translateY(-50%)（D 不走此函式、inline rotate 不受影響）
    // 行級進退場殘留清理：翻頁/切換的 yPercent tween 可能還掛在行上（gsap 跨 tween 不 overwrite，
    // 殘留 translateY 會讓 chip 文字位移）→ 殺 tween + 清 inline transform
    n.querySelectorAll('.atlas-item-nameblock, .atlas-list-item-label').forEach(el => {
      if (typeof gsap !== 'undefined') gsap.killTweensOf(el);
      /** @type {HTMLElement} */ (el).style.transform = '';
    });
    n.classList.remove('atlas-as-list', 'atlas-list-item');
    item._nameLine.classList.remove('atlas-list-line-clip');
    item._nameBlock.classList.remove('atlas-list-item-name');
    if (item._enEl) item._enEl.classList.remove('atlas-list-name-en');
    if (item._zhEl) item._zhEl.classList.remove('atlas-list-name-zh');
    // wobble 還原：時鐘解凍中（floatThawEarly 已推進相位）＝寫「當下相位」而非凍結快照，讓 flipFlyNode
    // 起飛補回的值＝下一幀 tickFloat 會寫的值＝零殘跳；凍結時（floatRunning false）快照即當下值走 else。
    // B 走 else（Phase 2 不 wobble B、rotate 靜態＝快照永不過時）。
    if (floatRunning && item._float && item.category !== 'B') {
      floatWobble(item, performance.now() / 1000 - floatStart);
    } else {
      if (item._savedTranslate) n.style.translate = item._savedTranslate;
      if (item._savedRotate) n.style.rotate = item._savedRotate;
    }
    // 正向起飛時 inline bg 被換成 transparent（ghost 色塊接手，B host）→ 回 chip 形態還原本色
    // （A/C 的 inline color 本來就是 item.color，重設無感）
    if (item.category === 'B' && item.bgColor) n.style.backgroundColor = item.bgColor;
    n.style.color = item.color;
    item._asList = false;
    item._anchor.appendChild(n);
  }
  /** 把某容器內所有 list 形態節點撤回星雲 anchor（renderList/renderListPage 清 DOM 前必呼叫，
   * 否則 innerHTML='' 會把單一節點一起炸掉）
   * @param {HTMLElement} container */
  function evacuateListNodes(container) {
    container.querySelectorAll('.atlas-name.atlas-as-list').forEach(n => {
      const item = itemByIdMap.get(/** @type {HTMLElement} */ (n).dataset.itemId || '');
      if (item) toChipForm(item);
    });
  }

  /** @param {any} item @param {string} cat @returns {HTMLElement} */
  function buildListItemEl(item, cat) {
    // 外層 wrapper：min-height 撐 row slot；內部每行包 .atlas-list-line-clip 各自獨立 yPercent reveal
    const wrapper = document.createElement('div');
    wrapper.className = 'atlas-list-item-wrapper';

    const el = document.createElement('div');
    el.className = 'atlas-list-item';
    el.dataset.category = cat;
    el.dataset.itemId = String(item.id);   // view morph 配對：list item ↔ item._span（星雲 chip）

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
      evacuateListNodes(itemsEl);   // 單一節點：先撤回星雲 anchor，innerHTML='' 才不會炸掉節點
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
        // 單一節點：只建 wrapper 殼（slot 幾何），真內容＝星雲節點 reparent 進來換 list 形態
        pageItems.slice(k * splitAt, (k + 1) * splitAt).forEach(item => {
          const wrapper = document.createElement('div');
          wrapper.className = 'atlas-list-item-wrapper';
          sc.appendChild(wrapper);
          if (deferListNodes) {
            /** @type {any} */ (wrapper)._atlasItem = item;   // morph 配對 ref（查 live DOM＝rebuild 安全）
            wrapper.dataset.category = cat;
          } else {
            toListForm(item, wrapper, cat);
          }
        });
        subCols.push(sc);
      }

      const navItem = document.createElement('div');
      navItem.className = 'atlas-list-nav-item';

      // 09-01（user）：只留右箭頭＝單顆循環翻頁鈕（到最後一頁 wrap 回第 0 頁，一顆仍能看完全部）；
      // icon 用 arrow-right 實心箭頭（非 chevron）。只有一頁時 disable。
      const nextBtn = document.createElement('button');
      nextBtn.className = 'atlas-list-nav-btn';
      // 隨機微傾斜存成 CSS var（非直接寫 transform）→ CSS :hover 能用 calc(var + Δ) 疊加傾斜（inline transform 會蓋 CSS hover）
      nextBtn.style.setProperty('--nav-rot', `${randDeg()}deg`);
      nextBtn.innerHTML = '<span class="icon icon-arrow-right"></span>';
      nextBtn.disabled = maxPage <= 0;
      nextBtn.addEventListener('click', () => renderListPage(col, cat, safePage >= maxPage ? 0 : safePage + 1));

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
            // viewMorphing 期間不重播：morph 在此 rAF 之後才量測起飛，行的顯隱全由 morph 排程接管
            if (currentView === 'list' && !viewMorphing) playColEnterAnim(col, cat, SECTION_DELAY[cat] ?? 0);
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
    const lineSel = '.atlas-list-name-en, .atlas-list-name-zh, .atlas-list-item-label-en, .atlas-list-item-label-zh';
    applyMarqueeOverflow(container, lineSel, '.atlas-marquee-inner');
    // 桌面 hover 放開平滑回彈（user 2026-08-19 B）：每個 list item 綁 bindMarqueeReturn（手機由 helper 自我 gate 跳過）
    container.querySelectorAll('.atlas-list-item').forEach((item) => {
      registerPageCleanup(bindMarqueeReturn(/** @type {HTMLElement} */ (item), '.atlas-marquee-inner', lineSel));
    });
  }

  function renderList() {
    evacuateListNodes(listView);   // 單一節點：清 DOM 前先撤回星雲 anchor
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

    // Alumni group（user 09-01「alumni 下面就是 hosting、右邊 employ」）：移除獨立 label 欄，
    //   Alumni 系友 label + 一行職業chip 直接掛在 **host 欄頂端**當欄頭 → host list 緊接其下、employ 在右側。
    //   grid 由 9 → 8 tracks（faculty2 + host2 + employ2 + partners2），4 欄各佔 1/4。
    const hostCol = buildCol('host', CAT_LABELS.host);
    const employCol = buildCol('employ', CAT_LABELS.employ);

    // Alumni 系友 label → host 欄頂端欄頭（只留標題；職業chip 09-01 移到 employ 欄頂端靠右）
    const labelCol = document.createElement('div');
    labelCol.className = 'atlas-list-group-label-col';
    labelCol.style.transform = `rotate(${randDeg()}deg)`;

    const masterTitleWrapper = document.createElement('div');
    masterTitleWrapper.className = 'atlas-list-col-title-wrapper';
    masterTitleWrapper.appendChild(makeTitleEl(ALUMNI_GROUP_LABEL));
    labelCol.appendChild(masterTitleWrapper);
    // Alumni label 掛 host 欄頂端（buildCol 建的 titleblock 已 absolute 貼欄底、items 為 flex:1）→ 插在最前＝欄頭
    hostCol.insertBefore(labelCol, hostCol.firstChild);

    // 職業chip → employ 欄頂端、靠右對齊 employ 欄右緣（user 09-01「移到右邊、對齊 employ col、對齊右邊」）；
    //   slot absolute 貼 employ 頂右不佔 items 流（employ 仍靠 padding-top 對齊）；旋轉角度較小（randDeg 減半）
    const careerSlot = document.createElement('div');
    careerSlot.className = 'atlas-list-career-slot';
    // 職業chip 旋轉角度較小：±0.4~1.5°、排除 0（user 09-01）
    const careerRot = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.1);
    careerSlot.style.transform = `rotate(${careerRot.toFixed(1)}deg)`;
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
    careerSlot.appendChild(careerListEl);
    // noFit：職業chip 一行（EN+ZH 同行）→ fitWidth 逐 child 取 max(EN,ZH)≠sum 會裁；改吃 CSS width:max-content
    listCareerCtrl = createCareerController(careerListEl, careerEnSpan, careerZhSpan, { dir: 'top', noFit: true });
    employCol.insertBefore(careerSlot, employCol.firstChild);

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
    const TOTAL = 0.4;
    const RANGE = 0.25;
    dHide.forEach(item => {
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: NODE_HIDE_INSETS[Math.floor(Math.random() * 4)],
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
      gsap.set(item._span, { clipPath: NODE_HIDE_INSETS[Math.floor(Math.random() * 4)] });
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
    const randomHiddenInset = () => NODE_HIDE_INSETS[Math.floor(Math.random() * NODE_HIDE_INSETS.length)];

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
      // 篩選語意同 library 年份 picker（user 08-27 二修定案）：預設全開＝未篩選；
      // 全開時點擊＝聚焦單顆；之後逐顆累加（點另一顆＝一起 active、點已選＝取消）；
      // 唯一 active 再點同一顆＝回全開
      const hadAlumni = selected.has('alumni');
      if (selected.size === btns.length) {
        selected.clear();
        selected.add(k);
      } else if (selected.has(k)) {
        if (selected.size === 1) btns.forEach(bb => bb.dataset.filter && selected.add(bb.dataset.filter));
        else selected.delete(k);
      } else {
        selected.add(k);
      }
      // alumni 由未選變已選 → 兩 subchip flag + class 都 reset，所有 B chip 重新顯示
      if (selected.has('alumni') && !hadAlumni) {
        subchipActive.host = true;
        subchipActive.employ = true;
        Object.values(subchipMap).forEach(c => c && c.classList.remove('subchip-inactive'));
      }
      apply(true);
    });
  });

  apply();

  // ── Layout toggle ──────────────────────────────────────────────────
  // （layoutBtn 已在 Filter 段提前宣告）

  // icon 跟著星雲整段 intro tween 同步做（0.75s = Phase 1 cover reveal 0→0.35 + Phase 2 span hide 0.35→0.75）：
  // exit hide / entry reveal 都 0→0.75 + power2.out，**起跑點不延遲、duration 同 chip 整段**，forward/return 時間對稱即互為反向
  // icon 切換走 clip-reveal（貼身 overflow:clip 遮罩 + 隨機四向滑出/滑入），取代原 clip-path inset wipe
  const LAYOUT_ICON_SLIDES = [{ yPercent: -100 }, { yPercent: 100 }, { xPercent: -100 }, { xPercent: 100 }];
  const LAYOUT_ICON_DURATION = 0.4;
  const LAYOUT_ICON_EASE = 'power2.out';
  /** @type {{xPercent?:number,yPercent?:number}|null} */
  let _lastIconHideDir = null;

  /**
   * @param {{ timeline?: any, position?: string | number }} [opts]
   */
  function hideLayoutIcon(opts = {}) {
    const { timeline = null, position = 0 } = opts;
    const icon = /** @type {HTMLElement|null} */ (layoutBtn?.querySelector('.icon'));
    if (!icon || typeof gsap === 'undefined') return;
    ensureIconClipWrap(icon);
    const dir = LAYOUT_ICON_SLIDES[Math.floor(Math.random() * 4)];
    _lastIconHideDir = dir;
    const vars = { ...dir, duration: LAYOUT_ICON_DURATION, ease: LAYOUT_ICON_EASE, overwrite: true };
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
    ensureIconClipWrap(icon);
    icon.className = newClass;
    // reveal 起點 = 上次 hide 的滑出方向 → 視覺上 reveal 就是 hide 的時間反向
    const startDir = _lastIconHideDir ?? LAYOUT_ICON_SLIDES[Math.floor(Math.random() * 4)];
    gsap.fromTo(icon, startDir,
      { xPercent: 0, yPercent: 0, duration: LAYOUT_ICON_DURATION, ease: LAYOUT_ICON_EASE, clearProps: 'transform', overwrite: true }
    );
  }

  // ── View morph（2026-08-25 單一節點遮罩架構，取代 2026-08-18 clone FLIP）──────
  // item＝單一節點：吞（自帶 cover）→ 全遮蔽時 reparent＋換形 → 純色塊接手飛行 → 落地掀開同一節點。
  // chrome（filter btn／欄標題）＝maskFlyChrome hidden-swap（DOM 不合併、視覺恆單一）。
  // 無對應（城市方塊/連線、非當頁 item、chevron、career chip）→ 沿用 buildMapExit/EnterTl 分階段進退場。
  // viewMorphing 宣告在 refreshFloatRunning 前（凍結 gate 讀）。
  /** @type {HTMLElement|null} */
  let morphLayer = null;
  function ensureMorphLayer() {
    if (morphLayer && morphLayer.isConnected) return morphLayer;
    morphLayer = document.createElement('div');
    morphLayer.id = 'atlas-morph-layer';
    main.appendChild(morphLayer);
    return morphLayer;
  }
  cleanupFns.push(() => {
    viewMorphing = false;
    floatThawEarly = false;
    if (morphLayer) { morphLayer.remove(); morphLayer = null; }
  });

  // 分階段節奏（user 2026-08-18；08-19 修=飛行合併同一波；08-27 修=靠攏也併同波）：
  // 不會出現的先消失（城市+線）→ 非第一頁靠攏+fade 與 filter、第一頁起飛**全同一波**
  // （user 08-27：靠攏 item 不需要先離開）→ chevron 最後；反向＝鏡像倒放
  const M_CITY_DUR   = 0.5;    // 正向 stage A：城市 fade + 線 retract（也＝褪黑/擦色塊窗長）
  const M_CITY_LEAD  = M_CITY_DUR;   // user 08-31：城市方塊+線段「先離開」的領先窗＝其餘元素等城市走完才開始（三拍：城市→變黑擦塊→位移）
  const M_FADE_START = M_CITY_LEAD + M_CITY_DUR;   // 非第一頁 chip 靠攏+fade＝Phase C（城市→decolorize→才位移，與 item 同波）
  const M_FADE_DUR   = 0.45;
  const M_FADE_RANGE = 0.25;   // fade 微 stagger 散開
  const M_NAV_START  = M_CITY_LEAD + M_CITY_DUR;   // 正向 Phase C：filter + item 同波起飛（同 M_ITEM_START＝城市→decolorize 後才動）
  const M_NAV_STEP   = 0;      // user 08-31 選 B：nav btn 不階梯、同一刻起飛＝同時到位（0.12 階梯拉開 ~0.48s 跟 option C 俐落感不搭）
  // 起飛波演進：1.0→0.3(option C 重疊)→M_CITY_DUR(緊接 decolorize)→M_CITY_LEAD+M_CITY_DUR(user 08-31 三拍：
  // 城市/線先走[0,0.5]→全體變黑+擦色塊[0.5,1.0]→全黑無底色才位移[1.0,]；paired 起飛時已全黑＝flipFlyNode 補色 no-op）
  const M_ITEM_START = M_CITY_LEAD + M_CITY_DUR;   // 位移等 城市離開 + decolorize+erase 都完成（user 08-31）
  const M_ITEM_RANGE = 0.3;
  const M_COLOR_FADE = M_CITY_DUR;   // 彩→theme-fg 褪黑窗＝對齊 host 色塊掃除（user 08-31：item 變黑要跟色塊消失「同時同 ease」＝EASE.exitSoft，否則黑 item 夾雜殘留色塊很突兀）；paired 起飛後由 flipFlyNode --atlas-fly-c 續完
  const R_LIST_EXIT = 0.55;    // 反向 stage1：只在 list 出現的元素（item 副標 / 箭頭 / 未配對標題 / career）先清乾淨（user 08-30、09-01 副標併入）；
                               //             回程波（item 飛回 + 標題 morph + 其餘 chip fade）都排在此之後＝正向「map-only 先退」的鏡像
  const R_ITEM_START = R_LIST_EXIT;   // 反向 stage2（user 09-02）：list 上的 item 與 title chip / 未配對散回「同波起飛」；原 +0.3 偏移＝flipFlyNode 內副標收合窗，副標 09-01 已移 phase1 先退→該偏移是殘留，移除
  const R_ITEM_RANGE = 0.3;
  const R_NAV_START  = R_LIST_EXIT;   // 反向：欄標題與 item 同波
  const R_NAV_STEP   = 0;      // user 08-31：回程 nav btn 也對齊正向＝同時到位（原 0.12 階梯，去程已設 0 故拉平）
  const R_FADE_START = R_LIST_EXIT;   // 反向：其餘 chip 散回+fade in＝R_ITEM_START 同波（08-27 鏡像）
  const R_CITY_START = 1.45;   // 反向：城市 + 線最後回來（隨落地窗整體提前 0.3、仍壓軸；原 1.75）
  const R_B_ENTER = 1.0;   // 反向：未配對 host 圈 clip-reveal「收尾對齊 paired 落地」（user 09-02：item 波提前 0.3 → 落地窗等距平移，1.3→1.0；仍「快定位時才出現、同時完成定位」，⚠️別拉到 0.55＝08-31 早段太早被 user 打回，B 是原地 reveal 無位移可言）
  const NAV_ORDER = /** @type {Record<string, number>} */ ({ faculty: 0, alumni: 1, host: 2, employ: 3, partners: 4 });

  // ── 遮罩三段核心（單一節點架構）────────────────────────────
  const COVER_SHOWN_M = 'inset(0% 0% 0% 0%)';
  /** 落地掀開沿「飛行方向」掃出（user 08-26：落地後原地隨機掀＝色塊停下來等＝卡頓感；
   *  沿動勢方向掃出＝開口邊持續往前跑、視覺不中斷）。inset 四值＝top right bottom left。
   * @param {number} dx @param {number} dy */
  function travelCoverDir(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';   // 向右掃出／向左掃出
    }
    return dy >= 0 ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)';     // 向下掃出／向上掃出
  }
  const CHROME_TEXT_OUT = 0.22;   // chrome 起飛前：文字 clip 收掉、box 上只剩純色塊
  const CHROME_TEXT_IN  = 0.32;   // chrome 落地後：文字以新形態 clip reveal 回 box（左→右閱讀方向）
  const FLY_DUR = DUR.slow;   // 色塊飛行
  const REVEAL_DUR = 0.4;     // 展（mask 掃開）
  const RESTORE_DUR = 0.7;    // restore-first：篩選/zoom 回初始態的前置窗（有需要才 > 0）

  /** 螢幕座標層生成純色塊（中心錨定）
   * @param {string} color @param {{cx:number,cy:number,w:number,h:number,rot:number}} box */
  function spawnMask(color, box) {
    const m = document.createElement('div');
    m.className = 'atlas-view-mask';
    m.style.backgroundColor = color;
    m.style.left = `${box.cx - box.w / 2}px`;
    m.style.top = `${box.cy - box.h / 2}px`;
    m.style.width = `${box.w}px`;
    m.style.height = `${box.h}px`;
    gsap.set(m, { rotation: box.rot || 0 });
    ensureMorphLayer().appendChild(m);
    return m;
  }

  /** B chip 底色 ghost：anchor 內墊「同位同色」色塊、span inline bg 即刻轉 transparent
   *  （像素相同＝無感換手）。呼叫端負責 clip tween 與 remove。三處共用：paired 正向起飛前掃出、
   *  unpaired 正向靠攏前掃出、paired 反向落地後掃入。
   *  ⚠️ ghost 必須放 stage anchor 內、不能進 #atlas-morph-layer（layer z60 > list view z50 會蓋住
   *  飛行文字；anchor 在 stage＝恆在文字下方，且跟著軌道/anchor 一起動）。
   *  bg 先還原 item.bgColor 再讀 computed：反向落地時 span bg 是 transparent（飛行中壓掉），
   *  且 mode3 等 CSS 覆寫下 computed 才與當下畫面同色。
   * @param {any} item @returns {HTMLElement} */
  function spawnBChipBgGhost(item) {
    const n = /** @type {HTMLElement} */ (item._span);
    if (item.bgColor) n.style.backgroundColor = item.bgColor;
    const g = document.createElement('div');
    g.style.cssText = 'position:absolute;pointer-events:none;';
    g.style.left = `${n.offsetLeft}px`;
    g.style.top = `${n.offsetTop}px`;
    g.style.width = `${n.offsetWidth}px`;
    g.style.height = `${n.offsetHeight}px`;
    g.style.backgroundColor = getComputedStyle(n).backgroundColor;
    g.style.transform = 'translate(-50%, -50%)';   // 同 .atlas-cat-b 置中；wobble 個別屬性照抄
    g.style.translate = n.style.translate;
    // 色塊用該 chip 的靜態傾斜角消失（user 09-02）：B 直接取 _float.baseRot，不抄 n.style.rotate——
    // 後者可能被 hover 轉正(_straight)或清空成 0＝色塊「先回正才消失」。B 恆靜態不 wobble、baseRot 即其固定傾斜。
    g.style.rotate = (item.category === 'B' && item._float) ? `${item._float.baseRot.toFixed(2)}deg` : n.style.rotate;
    g.style.clipPath = COVER_SHOWN_M;
    item._anchor.insertBefore(g, n);
    n.style.backgroundColor = 'transparent';
    return g;
  }

  const SUB_HIDE_DUR = 0.25;    // 反向 phase1：副標原地收回窗（跟箭頭一起先退，見 switchToMap stage1）
  const FLIP_FLY_MAX = 1.0;     // 直飛距離加時上限（見 flipFlyNode 內 flyDur）
  const FLIP_FLY_MAX_LIST = 2.0; // map→list 正向 +1s（user 09-02：要看清楚 item 被 chip 拉著走的弧線軌跡）；回程 list→map 不動
  const FLY_ARC_BULGE = 0.5;    // 正向 item 飛行「朝欄頭鼓弧」強度（0=直線 1=控制點壓到欄頭）；ponytail: 常數旋鈕，太彎就降

  /** 節點本體直飛（2026-08-26 起 A/C；08-28 起 B 雙向也走此路、底色另由 spawnBChipBgGhost 接手）：
   *  swap 換形後以 FLIP 從舊形態盒補間位移＋縮放＋轉正到新形態落點，字色同步 彩↔theme-fg；
   *  chip 沒有的副標不參與飛行——正向落地後 onLand 原地 clip reveal、反向起飛前原地收回。
   *  對位基準＝nameBlock 左緣中點（兩形態共同文字起點）；套初值後量殘差再校正一次＝individual
   *  translate/rotate（wobble）與 transform compose 次序的誤差全被吸收。chip 形態置中靠 CSS
   *  translateY(-50%)（B＝translate(-50%,-50%)）→ 飛行期間由 gsap y/xPercent 代管、落地 clearProps 交還 CSS。
   * @param {any} item @param {number} delay @param {() => void} swapFn
   * @param {(() => void)|null} onLand @param {boolean} toList
   * @param {{x:number,y:number}|null} [ctrlPt] 正向專用：欄頭中心（螢幕座標）＝弧線控制點錨；給了才鼓弧、否則直線 */
  function flipFlyNode(item, delay, swapFn, onLand, toList, ctrlPt) {
    const tl = gsap.timeline({ delay });
    // 反向副標收合已移到 switchToMap phase1（跟箭頭一起先退）＝標題起飛時副標早已收乾淨；此處不再收
    tl.call(() => {
      if (destroyed) return;
      const n = /** @type {HTMLElement} */ (item._span);
      const nb = /** @type {HTMLElement} */ (item._nameBlock);
      // 量測／錨定／縮放全以「EN 名行」單一元素為基準（六輪定案，取代 nameBlock 盒）：
      // ①nameBlock 盒高被 host list 形態 min-height 2.6em 撐爆（單行 item 盒高 2× 字高＝字級暴脹）
      // ②行高的 line-height 係數兩形態不同＝殘 +6~7% 字符跳 ③chip 形態飛行中 nb 盒高逐顆膨脹不一
      // （36→41~48px、inline metrics 合成）＝盒中心錨定讓第一行上下跳 2~5px。
      // EN 行＝單行、無 min-height、兩形態幾何同構＝被精確釘住；縮放用 computed font-size 比
      // （字符嚴格連續）；中文行由流式跟隨（行距係數已對齊 1.3、殘差 ≤1px）
      const hEl = /** @type {HTMLElement} */ (item._enEl || item._zhEl || nb);
      const sRect = hEl.getBoundingClientRect();
      const srcC = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };
      const srcFs = parseFloat(getComputedStyle(hEl).fontSize) || hEl.offsetHeight;
      const srcH = toList ? srcFs * scale : srcFs;   // 未旋轉視覺字級（chip 吃 zoom）
      const srcW = toList ? hEl.offsetWidth * scale : sRect.width;   // 未旋轉視覺寬（chip 端 swap 前量；list 端無旋轉＝bbox 寬）
      const srcRot = toList ? inlineRotDeg(n) : 0;
      const fromColor = getComputedStyle(n).color;
      swapFn();
      const toColor = getComputedStyle(n).color;   // 新形態穩態字色（list=theme-fg／chip=inline accent、mode3 覆寫自動吸收）
      const zoomK = toList ? 1 : scale;            // gsap 局部 px → 螢幕 px（chip 在 zoom 容器內）
      const dRect = hEl.getBoundingClientRect();
      const dstC = { x: dRect.left + dRect.width / 2, y: dRect.top + dRect.height / 2 };
      // 長途依距離拉長：跨全螢幕仍吃固定 0.6s＝尖峰 ~5000px/s、小字肉眼跟不上
      // ＝user 08-26「沒到對應的地方直接跳走不見」；佔位吃對應上限恆涵蓋
      // toList（map→list）＝正向長弧、base+1s／上限 2s 看清軌跡；回程 list→map 維持原速（user 09-02 只正向）
      const flyBase = toList ? FLY_DUR + 1 : FLY_DUR;
      const flyCap  = toList ? FLIP_FLY_MAX_LIST : FLIP_FLY_MAX;
      const flyDur = Math.min(flyCap, flyBase + Math.hypot(srcC.x - dstC.x, srcC.y - dstC.y) / 3000);
      // 裁切鏈（wrapper/sub-col/col-items）由 .atlas-morphing CSS 統一放開，這裡不逐項動 overflow
      n.classList.add('atlas-flying');
      if (toList) {
        const subs = /** @type {HTMLElement[]} */ ([...item._subsEl.querySelectorAll('.atlas-list-item-label')]);
        if (subs.length) gsap.set(subs, { yPercent: 100 });   // 副標藏進 line-clip、落地才 reveal
      }
      // 錨定「EN 行左緣中點」非盒中心（user 08-28 二輪「偏移一下才飛」，三輪擴到雙向）：
      // chip 形態行＝max-content 文字寬、list 形態行＝整欄寬，盒寬不同 → 盒中心對位會讓左對齊
      // 的文字在 swap 瞬間橫移 (欄寬−文字寬)/2；左緣＝兩形態共同的文字起點＝真正的連續錨
      // （旋轉下左緣中點＝bbox 中心 − 半寬×(cosθ, sinθ)；無旋轉端 cos0/sin0 自然退化成 rect 左緣）
      const dstRot = toList ? 0 : inlineRotDeg(n);
      const dstW = toList ? dRect.width : hEl.offsetWidth * zoomK;
      const sRad = srcRot * Math.PI / 180, dRad = dstRot * Math.PI / 180;
      const srcA = { x: srcC.x - (srcW / 2) * Math.cos(sRad), y: srcC.y - (srcW / 2) * Math.sin(sRad) };
      const dstA = { x: dstC.x - (dstW / 2) * Math.cos(dRad), y: dstC.y - (dstW / 2) * Math.sin(dRad) };
      const base = {
        transformOrigin: `${hEl.offsetLeft}px ${hEl.offsetTop + hEl.offsetHeight / 2}px`,
        // B chip 的 CSS 置中＝translate(-50%,-50%)，gsap inline transform 會蓋掉 CSS transform →
        // 回 chip 的飛行期間 xPercent 也要代管（A/C 只有 translateY(-50%)＝維持 yPercent 即可）
        xPercent: !toList && item.category === 'B' ? -50 : 0,
        yPercent: toList ? 0 : -50,
        scale: srcH / ((parseFloat(getComputedStyle(hEl).fontSize) || hEl.offsetHeight) * zoomK),
        rotation: toList ? srcRot : -inlineRotDeg(n),
        x: (srcA.x - dstA.x) / zoomK,
        y: (srcA.y - dstA.y) / zoomK,
      };
      // ⚠️ gsap.set 獨佔 transform 時會把 CSS individual `translate`/`rotate` 清成 `none`（實測；gsap
      //    偵測到個別屬性就接管、避免雙寫）。chip 端的 wobble 正是靠這兩個個別屬性 → 一被清掉，下面殘差就
      //    量在「無 wobble」的態、cRad 也讀成 gsap 反轉值而非 θ；等下一幀 tickFloat 把 wobble 寫回，其
      //    rotate 疊在**大位移的 gsap FLIP transform 外層**＝把整段起飛位移旋轉 θ、落點單幀暴跳最多 ~33px
      //    再開始飛（user「先旋轉及位移才飛」；此前誤判為 0~5px 殘差）。故先存 wobble、gsap.set 後補回。
      const wobTr = n.style.translate, wobRot = n.style.rotate;
      gsap.set(n, base);
      if (!toList) {
        // wobble 補回＝回到本區塊註解假設的合成態（個別 rotate θ 與 base 的 gsap 反轉 -θ 相消＝淨旋轉 0、
        // bbox 左緣中點＝視覺左緣中點），殘差就錨在「含 wobble」的態＝與飛行中 tickFloat 每幀維持的態一致
        // ＝零跳（B 的 rotate 靜態、tickFloat 不重寫，補回後整段飛行沿用＝落地保留傾斜）。
        if (wobRot) n.style.rotate = wobRot;
        if (wobTr) n.style.translate = wobTr;
        // list 端無 individual transform＝純 gsap 精確，跳過殘差＝每顆省一次同步 reflow（起飛更順）
        // ⚠️ 校正向量要先反旋轉 θ（個別 rotate）再寫入：合成序＝rotate(θ)·gsap transform，
        // gsap 的 x/y 軸活在 θ 旋轉座標系內，直接加螢幕 delta 會被 θ 轉走＝留 delta×θ 殘差。
        const chk = hEl.getBoundingClientRect();
        const ex = (srcA.x - chk.left) / zoomK;
        const ey = (srcA.y - (chk.top + chk.height / 2)) / zoomK;
        const cRad = inlineRotDeg(n) * Math.PI / 180;
        gsap.set(n, {
          x: base.x + ex * Math.cos(cRad) + ey * Math.sin(cRad),
          y: base.y - ex * Math.sin(cRad) + ey * Math.cos(cRad),
        });
      }
      // 寬度連續性（user 08-26 三輪）：長名在 chip（全寬單行）↔ list（欄寬截斷＋marquee）間換形
      // 會瞬間變寬/截斷＝眼睛跟丟像「跳走／原地出現」。飛行中行截斷停用（.atlas-flying CSS 開
      // overflow），改由節點 clip-path 從「起點可見寬」掃到「終點可見寬」（user 的「右側 mask
      // 往左裁」）；短名兩端同寬＝跳過。量測全用未縮放 local px（offsetWidth/clientWidth）。
      let widthClip = false;
      if (toList) {
        let overhang = 0;
        nb.querySelectorAll('.atlas-list-name-en, .atlas-list-name-zh').forEach(line => {
          const inner = /** @type {HTMLElement} */ (line.firstElementChild);
          if (inner) overhang = Math.max(overhang, inner.offsetWidth - /** @type {HTMLElement} */ (line).clientWidth);
        });
        if (overhang > 2) {
          n.style.clipPath = `inset(0px ${-overhang}px 0px 0px)`;   // 起點＝全寬可見（含溢出欄外的字）
          widthClip = true;
        }
      } else {
        const clipR = n.offsetWidth - sRect.width / (base.scale * zoomK);
        if (clipR > 2) {
          n.style.clipPath = `inset(0px ${clipR}px 0px 0px)`;       // 起點＝只露 list 的截斷寬
          widthClip = true;
        }
      }
      if (widthClip) gsap.to(n, { clipPath: 'inset(0px 0px 0px 0px)', duration: flyDur, ease: EASE.move });
      if (toList) {
        // list 形態字色被 .atlas-as-list 的 !important fg 鎖死 → 走 --atlas-fly-c（.atlas-flying 規則讓位）
        n.style.setProperty('--atlas-fly-c', fromColor);
        gsap.to(n, { '--atlas-fly-c': toColor, duration: flyDur, ease: EASE.move });
      } else {
        n.style.color = fromColor;
        gsap.to(n, { color: toColor, duration: flyDur, ease: EASE.move });
      }
      const finish = () => {
        n.classList.remove('atlas-flying');
        n.style.removeProperty('--atlas-fly-c');
        n.style.clipPath = '';   // 寬度 clip 交還給行級 overflow（list）／全寬（chip），同寬無感
        gsap.set(n, { clearProps: 'transform,transformOrigin' });
        if (!toList) {
          n.style.color = item.color;   // 回寫原 inline accent（tween 終值同色、僅語義歸位）
          // ⚠️ clearProps 'transform' 會把 gsap.set 期間清成 none 的個別 rotate/translate 一併抹掉 →
          // 回 map 後 B 靜態傾斜掉光（實測 42 顆全變平＝flat 文字沿軌道 30fps 步進「上下抖」比傾斜更顯眼）；
          // 補回起飛前存的 wobble（B＝baseRot 靜態、A/C 下一幀 tickFloat 覆寫＝無害）
          if (wobRot && wobRot !== 'none') n.style.rotate = wobRot;
          if (wobTr && wobTr !== 'none') n.style.translate = wobTr;
        }
        if (onLand && !destroyed) onLand();
      };
      // 正向給了欄頭控制點＝x/y 沿 quadratic bezier 朝欄頭鼓弧（user 08-31「跟隨 nav btn 路徑、非整塊直線平移」）；
      // 控制點＝直線中點朝欄頭 local 位置拉 FLY_ARC_BULGE 比例＝溫和 bow（遠 row 也不暴衝成聚攏）。scale/rotation
      // 仍走 tween 本體（killTweensOf(n) 可中斷＝與直線版同一 kill 路徑）；x/y 用 tween.ratio 在 onUpdate 逐幀覆寫。
      if (toList && ctrlPt) {
        const sx = base.x, sy = base.y;                        // 起點 local（srcA − dstA）
        const hx = ctrlPt.x - dstA.x, hy = ctrlPt.y - dstA.y;  // 欄頭 local（終點錨 dstA 為原點）
        const cx = sx / 2 + (hx - sx / 2) * FLY_ARC_BULGE;     // 直線中點 → 欄頭 拉 bulge
        const cy = sy / 2 + (hy - sy / 2) * FLY_ARC_BULGE;
        const arc = gsap.to(n, {
          scale: 1, rotation: 0, duration: flyDur, ease: EASE.move,
          onUpdate: () => {
            const t = arc.ratio, mt = 1 - t;                   // eased 進度；終點 E=(0,0) 故省 t²·E 項
            gsap.set(n, { x: mt * mt * sx + 2 * mt * t * cx, y: mt * mt * sy + 2 * mt * t * cy });
          },
          onComplete: finish,
        });
      } else {
        gsap.to(n, {
          x: 0, y: 0, scale: 1, rotation: 0,
          xPercent: !toList && item.category === 'B' ? -50 : 0,
          yPercent: toList ? 0 : -50,
          duration: flyDur, ease: EASE.move,
          onComplete: finish,
        });
      }
    });
    tl.to({}, { duration: (toList ? FLIP_FLY_MAX_LIST : FLIP_FLY_MAX) + 0.05 });   // 佔位：飛行 tween 逃逸母 timeline（吃該向距離加時上限；分向否則回程白等 1s）
    return tl;
  }

  /** visibility:hidden 立即生效版：.anchor-nav-inner 帶 `transition: all var(--dur-fast)`（含
   *  visibility）→ 直接設 hidden 會被 transition 拖到 0.3s 後才翻面＝mask 已起飛、本體還留在
   *  原地「兩顆並存 → 閃一下消失」（user 08-26 系友/合作單位 btn；faculty 落點同位看不出）。
   *  關 transition 寫完 reflow 再還原，之後的 reveal transition 不受影響。
   * @param {HTMLElement} el */
  function hideInstant(el) {
    el.style.transition = 'none';
    el.style.visibility = 'hidden';
    void el.offsetWidth;
    el.style.transition = '';
  }

  /** chrome（filter btn ↔ 欄標題）box 恆存三段（user 08-26 定案，取代 淡入/掃開/自然滑入 三案）：
   *  ① src 文字 clip 收掉（box 上只剩純色塊）→ ② 純色塊無痕接手（色塊 vs 無字 chip 像素相同、
   *  瞬換不可見）飛到 dst 矩形 → ③ 落地瞬換 dst box、文字以新形態 clip reveal 回 box（左→右）。
   *  DOM 刻意不合併（filter btn 掛 ui_labels data-label-key 與 anchor-nav 結構，合併風險 > 收益）。
   * @param {HTMLElement} srcEl @param {number} srcRot @param {HTMLElement} dstEl @param {number} dstRot
   * @param {number} delay
   * @param {{onSwap?: () => void, onLand?: () => void, dstBoxFn?: () => {cx:number,cy:number,w:number,h:number}}} [opts]
   *   dstBoxFn＝自訂落點矩形（反向回 btn 用：inner 未 reveal 前帶 CSS translate，rect 不可信 → 用 btn 本體矩形） */
  function maskFlyChrome(srcEl, srcRot, dstEl, dstRot, delay, opts = {}) {
    const flyDurC = opts.flyDur ?? FLY_DUR;   // 正向 map→list 傳長值＝title 跟 item 一起抵達（user 09-02）；回程/subchip 用預設
    const tl = gsap.timeline({ delay });
    tl.call(() => {
      if (destroyed) return;
      const sr = srcEl.getBoundingClientRect();
      const srcTexts = /** @type {HTMLElement[]} */ ([...srcEl.children]);
      // 文字收攏也改 hero clip-reveal「滑動＋自遮罩」（user 09-01：全程不要 clip-path 原地擦除）＝滑下沉出；
      // fromTo 顯式起點 NAV_CHIP_SHOWN 避免 gsap.to 從 computed none 補間 snap（見 memory）
      if (srcTexts.length) srcTexts.forEach(t => gsap.fromTo(t, { ...NAV_CHIP_SHOWN },
        { ...navChipHidden(t, 'bottom'), duration: CHROME_TEXT_OUT, ease: EASE.exitSoft, overwrite: true }));
      gsap.delayedCall(CHROME_TEXT_OUT, () => {
        if (destroyed) return;
        const m = spawnMask(getComputedStyle(srcEl).backgroundColor,
          { cx: sr.left + sr.width / 2, cy: sr.top + sr.height / 2, w: srcEl.offsetWidth, h: srcEl.offsetHeight, rot: srcRot });
        hideInstant(srcEl);
        srcTexts.forEach(t => { gsap.killTweensOf(t); t.style.clipPath = ''; t.style.translate = ''; });   // 藏起後文字歸位（回程/下次直接可用）
        if (opts.onSwap) opts.onSwap();
        let dst;
        if (opts.dstBoxFn) {
          dst = opts.dstBoxFn();
        } else {
          const dr = dstEl.getBoundingClientRect();
          dst = { cx: dr.left + dr.width / 2, cy: dr.top + dr.height / 2, w: dstEl.offsetWidth, h: dstEl.offsetHeight };
        }
        gsap.to(m, {
          left: dst.cx - dst.w / 2, top: dst.cy - dst.h / 2,
          width: dst.w, height: dst.h, rotation: dstRot,
          duration: flyDurC, ease: EASE.move,
          onComplete: () => {
            const dstTexts = /** @type {HTMLElement[]} */ ([...dstEl.children]);
            // 文字改 hero clip-reveal「滑動＋遮罩」進場（user 09-01：不要 clip-path 原地擦除、要位移揭露）；
            // 每行各自 navChipHidden 藏在下方（無旋轉→純垂直滑；父欄標題若旋轉、clip 在 local box 會跟著轉）→ 滑上歸位
            dstTexts.forEach(t => gsap.set(t, { ...navChipHidden(/** @type {HTMLElement} */(t), 'bottom'), overwrite: true }));
            dstEl.style.visibility = '';
            if (opts.onLand && !destroyed) opts.onLand();
            m.remove();
            gsap.to(dstTexts, { ...NAV_CHIP_SHOWN, duration: CHROME_TEXT_IN, ease: EASE.enter, clearProps: 'clipPath,translate', stagger: 0.06 });
          },
        });
      });
    });
    tl.to({}, { duration: CHROME_TEXT_OUT + flyDurC + CHROME_TEXT_IN });
    return tl;
  }

  /** 解析 inline rotate 角度（style.rotate 個別屬性或 style.transform 的 rotate(..deg)）
   * @param {HTMLElement|null} el */
  function inlineRotDeg(el) {
    if (!el) return 0;
    const own = parseFloat(el.style.rotate);
    if (Number.isFinite(own)) return own;
    const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : 0;
  }

  // 未配對 item「往所屬欄位靠攏」（user 08-26：原地 fade 沒有歸屬感）——只走 75% 路程、
  // 途中 fade 完＝聚攏的印象而非真的入列；反向鏡像（從欄位方向散回原位）
  const CONVERGE_FRACTION = 0.75;
  const CONVERGE_DUR = 0.85;                 // 反向（list→map 散回）用；正向見 convergeDur()
  // 未配對 fade＝「邊位移邊 fade」（user 09-03：別讓 item 快靠近 chip 才淡出＝opaque 一坨堆角落）：
  //   每 item 各自在起飛後 LEAD 就開始淡、DUR 淡完＝一路飄向 chip 同時漸淡、不 opaque 抵達。
  //   ⚠️ 綁各自 at（非全域單一時點）＝不會「還沒起飛就 fade」；⚠️ 用線性(ease 'none')＝opacity∝進度，
  //   別用 exitSoft(power2.in 慢起步)＝item 前段仍 opaque＝又像堆一坨。
  const UNPAIRED_FADE_LEAD = 0.3;    // 起飛後多久開始淡（小＝早開始；user 09-03 0.15→0.3）
  const UNPAIRED_FADE_DUR  = 0.6;    // 淡出時長（user 09-03 試過 1.0/0.7/0.8→0.6：早點定位後淡出也加快）
  // 未配對 drift 時長：曾對齊 paired（1.6~2.0s，base FLY_DUR+1/cap FLIP_FLY_MAX_LIST），user 09-03 要「早點定位」
  //   →給未配對自己一組較短 base/cap（比 paired 快抵達欄位）、仍依距離微調（近快遠慢）。
  //   ⚠️ 下限鎖 fade 收尾(LEAD+DUR)：drift 不能比 fade 早結束，否則 drift onComplete 的 clearProps 會在 item
  //   還可見時清 transform→彈回 anchor 中心（可見 snap）。要更快定位＝先縮小 fade(LEAD/DUR) 讓下限跟著降。
  const UNPAIRED_DRIFT_BASE = 1.0;
  const UNPAIRED_DRIFT_CAP  = 1.5;
  const convergeDur = (d) =>
    Math.max(UNPAIRED_FADE_LEAD + UNPAIRED_FADE_DUR,
      Math.min(UNPAIRED_DRIFT_CAP, UNPAIRED_DRIFT_BASE + (d ? Math.hypot(d.tx, d.ty) * CONVERGE_FRACTION : 0) / 3000));
  // user 09-02：未配對 item 靠攏途中淡出（趨勢過去→fade）。曾暫關 false 測純位移、位移確認 OK 後開回 true
  const SHOW_UNPAIRED_FADE = true;

  /** 未配對 item 靠攏目標＝所屬 list 欄的「title chip」位置（user 09-02：跟隨 title chip＝faculty 左上／host,employ 底部／partners 右上，欄標位置已自帶方位）
   * @param {any} item @returns {{tx:number,ty:number}|null} 螢幕 px 位移量 */
  function convergeDelta(item) {
    const key = item._listSubGroup || getItemCat(item);
    const catKey = key === 'alumni' ? 'host' : key;
    const col = listView.querySelector(`.atlas-list-col[data-category="${catKey}"]`);
    if (!col || !item._span) return null;
    // 錨＝該欄 title chip（alumni 走 group master 標題、其餘走欄自身 > titleblock 標題，同 colTitle 選法）；量不到退回欄框中心
    const titleEl = key === 'alumni'
      ? listView.querySelector('.atlas-list-group-label-col .atlas-list-col-title')
      : col.querySelector(':scope > .atlas-list-col-titleblock .atlas-list-col-title');
    const t = (titleEl || col).getBoundingClientRect();
    if (!t.width || !t.height) return null;
    const r = item._span.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return {
      tx: (t.left + t.width / 2) - cx,
      ty: (t.top + t.height / 2) - cy,
    };
  }

  /** 星雲分階段退場（morph 正向；spanItems=未被 clone 接管者）：
   *  Stage 1（t=0）：list 不會出現的先消失＝D 城市方塊 fade + 城市連線物理 retract（ring 由 hideCareer erase）
   *  Stage 2（t=M_FADE_START）：非第一頁的 A/B/C chip 往所屬欄位靠攏＋途中 fade（user 08-26）
   *  ⚠️ opacity 掛 _anchor 不掛 span：.atlas-name 有 CSS opacity transition，掛 span 會跟 GSAP 每幀打架；
   *  位移掛 span 的 gsap transform（xPercent/yPercent 代管 CSS 置中、wobble individual props 不衝突、收尾清掉）
   *  cityLines onUpdate 直呼 updateCityLineEndpoints → float 暫停時線仍會動（正向 float 在跑、重複無害）
   * @param {any[]} spanItems */
  function buildMapExitTl(spanItems) {
    const dItems = spanItems.filter(i => i.category === 'D' && i._anchor);
    const others = spanItems.filter(i => i.category !== 'D' && i._anchor);
    const tl = gsap.timeline();
    // Stage 1：城市方塊 clip-reveal 掃出（user：收起用 clip reveal 移除，取代 opacity fade；四向隨機、
    // 同 applyCountriesGate/map filter 的節點收合語彙）＋線 retract（點→點收縮，見下）
    dItems.forEach(i => {
      const n = /** @type {HTMLElement} */ (i._span);
      n.style.clipPath = COVER_SHOWN_M;   // 起點全顯（idle 無 clip）
      tl.to(n, {
        clipPath: NODE_HIDE_INSETS[Math.floor(Math.random() * 4)],
        duration: M_CITY_DUR, ease: EASE.enterSoft,
        onComplete: () => { i._anchor.style.opacity = '0'; n.style.clipPath = ''; },   // 藏住後清 clip（回程 fade in 顯全塊）
      }, Math.random() * 0.1);
    });
    // overwrite:true 防止 clearDetail() 觸發的 setCityLineRetract 反向 tween 拉扯
    cityLines.forEach(cl => {
      cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
    });
    cityLines.forEach(cl => {
      tl.to(cl, {
        retractT: 1,
        duration: M_CITY_DUR + 0.2,
        ease: EASE.enterSoft,
        overwrite: true,
        onUpdate: () => updateCityLineEndpoints(cl),
      }, 0);
    });
    // Stage 2：非第一頁內容往所屬欄位靠攏＋邊位移邊 fade out（微 stagger 散開）
    const moves = others.map(i => ({ i, d: convergeDelta(i) }));   // 先批量讀 rect 再建 tween（防 read/write 交錯 reflow）
    // 未配對靠攏 drift（B / A・C 共用）：停頓期對 span 零寫入，Phase C(at) 接管幀量 rect 殘差校正＝從當下凍結
    //   視覺位置起飛、保留凍結傾斜(getRot)＝停頓期零位移、起跑零跳。⚠️「位移前抖一下」根因＝舊 fromTo 在起跑幀
    //   把 individual translate/rotate（wobble）清成 none→從乾淨中心彈一下再飄；量測校正吸掉合成序差＝零跳。
    //   getRot：B＝靜態 baseRot（讀 i._float，不抄 inline＝可能被 hover 轉正 0）；A/C＝凍結當下 wobble 角(inline)。
    const scheduleDrift = (i, d, at, xPct, getRot) => tl.call(() => {
      if (destroyed) return;
      const n = /** @type {HTMLElement} */ (i._span);
      const rot = getRot();
      const r0 = n.getBoundingClientRect();
      gsap.set(n, { x: 0, y: 0, xPercent: xPct, yPercent: -50, rotation: rot });
      const r1 = n.getBoundingClientRect();
      const ex = (r0.left - r1.left) / scale, ey = (r0.top - r1.top) / scale;
      gsap.fromTo(n,
        { x: ex, y: ey },
        { x: ex + d.tx * CONVERGE_FRACTION / scale, y: ey + d.ty * CONVERGE_FRACTION / scale,
          duration: convergeDur(d), ease: EASE.move,
          onComplete: SHOW_UNPAIRED_FADE ? () => gsap.set(n, { clearProps: 'transform' }) : undefined });
    }, null, at);
    moves.forEach(({ i, d }) => {
      const at = M_FADE_START + Math.random() * M_FADE_RANGE;
      if (i.category === 'B') {
        // 未配對 B：Phase B 底色 ghost clip-reveal 掃除（隨機四向、同城市方塊＋paired host；M_CITY_LEAD＝城市走完才擦、dur 對齊 M_CITY_DUR）。
        // ghost 起點 clipPath=COVER_SHOWN_M（全顯）→掃到隨機 hide inset；裸文字（theme-fg）Phase C 才位移＝不與色塊分離。
        tl.call(() => {
          if (destroyed) return;
          const g = spawnBChipBgGhost(i);
          gsap.to(g, {
            clipPath: NODE_HIDE_INSETS[Math.floor(Math.random() * 4)],
            duration: M_CITY_DUR, ease: EASE.enterSoft, onComplete: () => g.remove(),
          });
        }, null, M_CITY_LEAD + Math.random() * 0.1);
        if (SHOW_UNPAIRED_FADE) {
          tl.to(i._anchor, {
            opacity: 0, duration: UNPAIRED_FADE_DUR, ease: 'none',
            onComplete: () => {
              if (i.bgColor) i._span.style.backgroundColor = i.bgColor;   // 回程還原底色
              i._span.style.color = i.color;                              // 回程還原字色（空窗期暫著 theme-fg）
            },
          }, at + UNPAIRED_FADE_LEAD);
        }
        if (d) scheduleDrift(i, d, at, -50, () => i._float ? i._float.baseRot : 0);   // B CSS 置中＝translate(-50%,-50%)
        return;
      }
      if (SHOW_UNPAIRED_FADE) tl.to(i._anchor, { opacity: 0, duration: UNPAIRED_FADE_DUR, ease: 'none' }, at + UNPAIRED_FADE_LEAD);
      if (!d) return;   // 無對應欄（如 ec 佔位）→ 只 fade（無位移）
      scheduleDrift(i, d, at, 0, () => inlineRotDeg(i._span));   // A/C CSS 只 translateY(-50%)＝xPercent 0；保留凍結 wobble 角
    });
    // layout btn icon 於 t=0 同步 hide
    hideLayoutIcon({ timeline: tl, position: 0 });
    // companyRingEllipse 的 erase 由 caller 的 hideCareer() → animateRingEllipse(false) 處理
    if (!tl.duration()) tl.to({}, { duration: 0.01 });   // 空集合保底（onComplete / then 正常走）
    return tl;
  }

  /** 星雲分階段進場（morph 反向＝正向鏡像倒放；spanItems=未被 clone 接管者）：
   *  其餘 A/B/C chip fade in（R_FADE_START）→ 最後 D 城市 fade in + 連線 draw（R_CITY_START）
   *  init 把 anchors 壓到 opacity:0 / cityLines 縮點 / ring 隱形；onComplete 清 inline opacity
   * @param {any[]} spanItems */
  function buildMapEnterTl(spanItems) {
    const dItems = spanItems.filter(i => i.category === 'D' && i._anchor);
    const allOthers = spanItems.filter(i => i.category !== 'D' && i._anchor);
    // 未配對 B（user 08-28 三輪）：回 map 走進場同款 hero clip-reveal（bChipRevealTween 隨機四向），
    // 不從欄位散回——anchor 直接可見（清掉正向收尾留下的 opacity 0），藏由 clip 負責（build 當下即 set）
    const bOthers = allOthers.filter(i => i.category === 'B');
    const others = allOthers.filter(i => i.category !== 'B');
    // init：anchors 全隱、cityLines 縮成點＋立即同步 path d（防 stage 顯示首幀閃 full line）
    [...dItems, ...others].forEach(i => { i._anchor.style.opacity = '0'; });
    others.forEach(i => { i._span.style.color = i.color; });   // 還原 exit Stage-1 統一轉的 theme-fg（未配對 A/C；paired 靠 flight、B 靠 bOthers）
    bOthers.forEach(i => {
      i._anchor.style.opacity = '';
      if (i.bgColor) i._span.style.backgroundColor = i.bgColor;   // 保險（正向 clip 離開收尾已還原）
      i._span.style.color = i.color;   // 保險：exit 中途被 kill 時字色可能停在 theme-fg
      // 未配對 B 現改為正向靠攏位移（user 09-02）＝span 可能殘留 exit 的 translate（fade 關時不 clearProps）→ 先清乾淨才 reveal，否則回 map 停在趨勢位置
      gsap.set(i._span, { clearProps: 'transform' });
      // 靠攏 tween 接管 transform 時把個別 rotate 清成 none（未配對 B 不走 flipFlyNode 補不到）→
      // 補回靜態傾斜，否則回 map 變平＝文字上下抖更明顯（fresh 態全 42 顆都帶 baseRot）
      if (i._float) i._span.style.rotate = `${i._float.baseRot.toFixed(2)}deg`;
    });
    cityLines.forEach(cl => {
      cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
      cl.retractT = 1;
      updateCityLineEndpoints(cl);
    });
    // companyRingEllipse 起點：dasharray "0 1"（隱形），等 showCareer → animateRingEllipse(true) draw 回來
    companyRingEllipse.style.strokeDasharray = '0 1';
    companyRingEllipse.style.strokeDashoffset = '0';
    const tl = gsap.timeline({
      onComplete: () => {
        [...dItems, ...allOthers].forEach(i => { i._anchor.style.opacity = ''; });
      },
    });
    // 其餘內容鏡像：從所屬欄位方向散回原位、途中 fade in
    const movesIn = others.map(i => ({ i, d: convergeDelta(i) }));
    movesIn.forEach(({ i, d }) => {
      const at = R_FADE_START + Math.random() * M_FADE_RANGE;
      tl.to(i._anchor, { opacity: 1, duration: M_FADE_DUR, ease: EASE.enterSoft }, at);
      if (!d) return;
      tl.fromTo(i._span,
        { x: d.tx * CONVERGE_FRACTION / scale, y: d.ty * CONVERGE_FRACTION / scale, yPercent: -50 },
        { x: 0, y: 0, duration: CONVERGE_DUR, ease: EASE.move, onComplete: () => gsap.set(i._span, { clearProps: 'transform' }) },
        at);
    });
    // 未配對 B：hero clip-reveal 進場（同 intro／subchip 開關的 bChipRevealTween 語彙）；
    // 排在 R_B_ENTER＝等 paired list item 快歸位才出現，reveal 縮短成 0.25＝收尾對齊 paired 落地
    // ＝「list 那幾個先回、剩下的同時完成定位」（user 08-31；0.45 會晚 paired ~200ms 收尾）
    bOthers.forEach(i => {
      const at = R_B_ENTER + Math.random() * M_FADE_RANGE;
      bChipRevealTween(i._span, randomBDir(), 'show', { tl, position: at, duration: 0.25 });
    });
    // 城市 + 連線最後回來（gate 藏掉的國家線維持 1、不 draw 進空氣）
    dItems.forEach(i => {
      tl.to(i._anchor, { opacity: 1, duration: M_CITY_DUR, ease: EASE.enterSoft }, R_CITY_START + Math.random() * 0.1);
    });
    if (countriesGateOn()) {
      cityLines.forEach(cl => {
        tl.to(cl, {
          retractT: cityLineRestT(cl),
          duration: M_CITY_DUR + 0.25,
          ease: EASE.enterSoft,
          overwrite: true,
          onUpdate: () => updateCityLineEndpoints(cl),
        }, R_CITY_START);
      });
    }
    if (!tl.duration()) tl.to({}, { duration: 0.01 });
    return tl;
  }

  function switchToList() {
    if (currentView === 'list' || viewMorphing) return;
    currentView = 'list';
    clearDetail();

    // 每次切 view 重置到第一頁（user 2026-08-18 定案）：morph 對應關係固定＝星雲 chip ↔ list 第一頁
    Object.keys(listPageState).forEach(k => { listPageState[k] = 0; });

    if (typeof gsap === 'undefined') {
      // 無動畫 fallback：瞬切（defer off → renderList 直接 reparent 節點）
      stage.style.display = 'none';
      stage.style.opacity = '';
      refreshFloatRunning();
      if (filterEl) filterEl.style.display = 'none';
      renderList();
      applyListFilter();
      listView.classList.add('visible');
      updateFilterBtnColors();
      const icon = /** @type {HTMLElement|null} */ (layoutBtn ? layoutBtn.querySelector('.icon') : null);
      if (icon) icon.className = 'icon icon-atlas-view';
      return;
    }

    viewMorphing = true;
    floatThawEarly = false;
    refreshFloatRunning();   // 凍結 wobble（floatPausedAt 記點；回 map 收尾恢復時補償＝相位接續）
    main.classList.add('atlas-morphing');
    drainRevealTimers();
    if (introTween) introTween.kill();

    // ── restore-first（user 2026-08-25 定案）：有篩選/zoom → 先回初始星雲，再跑正常轉場敘事 ──
    let restoreDelay = 0;
    const filterDirty = selected.size < btns.length || subchipActive.host === false || subchipActive.employ === false;
    const zoomDirty = Math.abs(scale - defaultScaleAtlas) > 0.001 || Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5;
    if (filterDirty) {
      btns.forEach(b => { if (b.dataset.filter) selected.add(b.dataset.filter); });
      subchipActive.host = true;
      subchipActive.employ = true;
      Object.values(subchipMap).forEach(c => c && c.classList.remove('subchip-inactive'));
      // currentView 已在函式開頭設 'list' → apply(true) 會分流到 applyListFilter、星雲 chip 永遠不會還原
      // （被篩掉的 chip 直接在 list 端憑空出現）→ 直呼 map 版：既有 clip 四向 show 動畫＝restore 視覺
      btns.forEach(b => b.classList.toggle('active', selected.has(b.dataset.filter)));
      applyMapFilter(true);
      updateFilterBtnColors();
      syncCareer();
      restoreDelay = RESTORE_DUR;
    }
    if (zoomDirty) {
      const st = { s: scale, x: tx, y: ty };
      gsap.to(st, {
        s: defaultScaleAtlas, x: 0, y: 0, duration: 0.45, ease: EASE.move,
        onUpdate: () => { scale = st.s; tx = st.x; ty = st.y; applyTransform(); },
      });
      restoreDelay = RESTORE_DUR;
    }

    // 預渲染 list（defer：只建 slot 殼＋配對 ref，節點留星雲等吞）；等 2 個 rAF 讓 pre-measure ghost
    // （首次會實測 item 高後同步重渲染）落定，配對才查 live DOM
    deferListNodes = true;
    renderList();
    applyListFilter();
    listView.classList.add('visible');
    listView.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (destroyed) return;
      morphToList(restoreDelay);
    }));
  }

  /** 正向 morph（單一節點遮罩三段）
   * @param {number} restoreDelay restore-first 前置窗（0＝無篩選/zoom） */
  function morphToList(restoreDelay) {
    // ── 配對：defer build 掛在 wrapper 上的 _atlasItem（pre-measure rebuild 後查 live DOM 仍最新）──
    /** @type {{item:any, wrapper:HTMLElement, cat:string}[]} */
    const pairs = [];
    listView.querySelectorAll('.atlas-list-item-wrapper').forEach(w => {
      const it = /** @type {any} */ (w)._atlasItem;
      if (it && it._span) pairs.push({ item: it, wrapper: /** @type {HTMLElement} */ (w), cat: /** @type {HTMLElement} */ (w).dataset.category || '' });
    });
    const pairedItems = new Set(pairs.map(p => p.item));

    // ── chrome 配對：3 主 btn + alumni master → 欄標題；host/employ subchip → 同名欄標題 ──
    /** @param {string} cat */
    // ⚠️ 限 > .atlas-list-col-titleblock：host 欄現在頂端還巢了 Alumni 的 .atlas-list-group-label-col（也含 .atlas-list-col-title）
    //    → 不限定會誤抓到 Alumni 標題；titleblock 才是該欄自己的欄標（host/employ 在欄底、faculty/partners 在頂端）
    const colTitle = (cat) => /** @type {HTMLElement|null} */ (listView.querySelector(`.atlas-list-col[data-category="${cat}"] > .atlas-list-col-titleblock .atlas-list-col-title`));
    const masterTitle = /** @type {HTMLElement|null} */ (listView.querySelector('.atlas-list-group-label-col .atlas-list-col-title'));
    /** @type {{srcEl:HTMLElement, srcRot:number, dstEl:HTMLElement, dstRot:number, key:string}[]} */
    const chromePairs = [];
    btns.forEach(b => {
      const inner = /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner'));
      const dstEl = b.dataset.filter === 'alumni' ? masterTitle : colTitle(b.dataset.filter || '');
      if (!inner || !dstEl) return;
      const block = /** @type {HTMLElement|null} */ (dstEl.closest('.atlas-list-col-titleblock, .atlas-list-group-label-col'));
      chromePairs.push({ srcEl: inner, srcRot: inlineRotDeg(inner), dstEl, dstRot: inlineRotDeg(block), key: b.dataset.filter || '' });
    });
    if (selected.has('alumni')) {
      [['host', subchipMap.host], ['employ', subchipMap.employ]].forEach(([key, chip]) => {
        const chipEl = /** @type {HTMLElement|null} */ (chip);
        const dstEl = colTitle(/** @type {string} */ (key));
        if (chipEl && chipEl.offsetHeight > 0 && dstEl) {
          const block = /** @type {HTMLElement|null} */ (dstEl.closest('.atlas-list-col-titleblock'));
          chromePairs.push({ srcEl: chipEl, srcRot: inlineRotDeg(chipEl), dstEl, dstRot: inlineRotDeg(block), key: /** @type {string} */ (key) });
        }
      });
    }
    const pairedTitles = new Set(chromePairs.map(p => p.dstEl));

    // ── list 端初始藏（listView 即將轉可見）：配對標題等 mask 揭露、未配對標題一般進場、右箭頭跟該欄副標同刻揭露 ──
    const allTitles = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-col-title')]);
    const navItems = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-nav-item')]);
    allTitles.forEach(t => { if (pairedTitles.has(t)) t.style.visibility = 'hidden'; });
    const restTitles = allTitles.filter(t => !pairedTitles.has(t));
    if (restTitles.length) gsap.set(restTitles, { yPercent: 100, overwrite: true });
    // 右箭頭改 hero clip-reveal「位移＋自遮罩」進場（user 09-01：不要 clip-path 原地擦除）→ 藏「按鈕本體」在下方（navChipHidden 自 clip、無需 wrapper）
    navItems.forEach(n => { const btn = n.querySelector('.atlas-list-nav-btn'); if (btn) gsap.set(btn, { ...navChipHidden(/** @type {HTMLElement} */(btn), 'bottom'), overwrite: true }); });
    listView.style.visibility = '';
    // 右箭頭改「跟該欄 item 落地（副標同刻）一起揭露」，不再 onComplete 壓軸落在副標之後（user 09-01）；落地波漏掉的欄由 onComplete 補
    const navShown = new Set();
    const revealNav = (/** @type {Element|null|undefined} */ nav) => {
      if (!nav || navShown.has(nav)) return;
      navShown.add(nav);
      const btn = /** @type {HTMLElement|null} */ (nav.querySelector('.atlas-list-nav-btn'));
      if (btn) gsap.fromTo(btn, navChipHidden(btn, 'bottom'),
        { ...NAV_CHIP_SHOWN, duration: DUR.reveal, ease: EASE.enter, clearProps: 'clipPath,translate', overwrite: true });
    };

    const master = gsap.timeline({
      onComplete: () => {
        if (destroyed || currentView !== 'list') return;
        stage.style.display = 'none';
        stage.style.opacity = '';
        deferListNodes = false;
        viewMorphing = false;
        refreshFloatRunning();   // stage 已藏 → 維持暫停（floatPausedAt 已記，回 map 恢復時補償）
        chromePairs.forEach(p => { p.srcEl.style.visibility = ''; });   // filterEl 即將藏，歸位無感
        pairs.forEach(p => { p.item._span.style.visibility = ''; });    // 保險（landing 已還原）
        btns.forEach(b => b.classList.remove('atlas-filter-revealed'));
        if (filterEl) filterEl.style.display = 'none';
        updateFilterBtnColors();
        revealLayoutIcon('icon icon-atlas-view');
        // 未配對標題（subchip 收合等少見情境）一般進場
        if (restTitles.length) {
          gsap.fromTo(restTitles, { yPercent: 100 },
            { yPercent: 0, duration: DUR.slow, ease: EASE.enter, clearProps: 'transform', overwrite: true });
        }
        // 落地波沒揭露到的右箭頭（該欄無配對 item）補揭露
        navItems.forEach(revealNav);
        if (listCareerCtrl) listCareerCtrl.show({ delay: 0.15 });
        applyListMarquee(listView);   // 節點落定後才量 marquee＋綁 hover 回彈
        main.classList.remove('atlas-morphing');
      },
    });
    introTween = /** @type {any} */ (master);   // 離頁/中斷 kill 用

    // Phase A（restore 窗之後、restoreDelay）：career/ring 收 + 城市/線退場（buildMapExitTl 內含 city clip-out
    // ＋line retract＋layout icon 收）。user 08-31：城市/線「先離開」＝這一拍只走 map 裝飾，item 不動不變色。
    master.call(() => {
      if (destroyed) return;
      if (mapCareerCtrl) mapCareerCtrl.hide();
      animateRingEllipse(false);
    }, null, restoreDelay);
    const unpairedExitItems = items.filter(i => i._span && !i._asList && !pairedItems.has(i));
    master.add(buildMapExitTl(unpairedExitItems), restoreDelay);
    // Phase B（restoreDelay + M_CITY_LEAD）：城市走完才「全體變黑 + 擦色塊」。全 map item 文字統一漸變到 theme-fg
    // （黑／inverse 白／mode3 前景）；dur＝M_COLOR_FADE、ease exitSoft 對齊 host 色塊掃除（見 buildMapExitTl / paired 分支）。
    // ⚠️ gsap 不能 interp CSS var 目標 → 先用隱形 probe 把 var(--theme-fg) 解成 concrete 色。
    // 回程各自還原 item.color（paired 靠 flipFlyNode 飛行補色、unpaired A/C 靠 buildMapEnterTl、unpaired B 靠 fade onComplete）
    master.call(() => {
      if (destroyed) return;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--theme-fg)';
      document.body.appendChild(probe);
      const fg = getComputedStyle(probe).color;
      probe.remove();
      const fadeSpans = items.filter(i => i._span && i.category !== 'D').map(i => i._span);
      if (fadeSpans.length) gsap.to(fadeSpans, { color: fg, duration: M_COLOR_FADE, ease: EASE.exitSoft });   // 單一 tween 控全部
    }, null, restoreDelay + M_CITY_LEAD);

    // stage3：第一頁 item + chrome 同波起飛（chrome 沿 NAV_ORDER 階梯、item 隨機散開）
    // A/C 無底色文字（user 08-26）：本體直飛（flipFlyNode）
    // B host 卡（user 08-28）：底色不溶——anchor 內墊同位 ghost 色塊接手（spawnBChipBgGhost），
    // 起飛前等待窗內沿飛行方向 clip 掃出、文字再直飛（字色交給 flipFlyNode 飛行中補間）；
    // 反向鏡像＝文字先飛回、落地後底色沿來向 clip 進場（見 switchToMap）
    // （09-02：item 改直線 A→B，不再算欄頭弧線控制點 headerCtr）
    pairs.forEach(p => {
      const flyAt = M_ITEM_START + Math.random() * M_ITEM_RANGE;
      const onLand = () => {   // 落地：副標行 line-clip 滑入（host 模型「底部長出」手感）＋該欄右箭頭同刻揭露
        const subs = /** @type {HTMLElement[]} */ ([...p.item._subsEl.querySelectorAll('.atlas-list-item-label')]);
        if (subs.length) {
          gsap.fromTo(subs, { yPercent: 100 },
            { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, clearProps: 'transform', overwrite: true, stagger: 0.05 });
        }
        revealNav(p.wrapper.closest('.atlas-list-col')?.querySelector('.atlas-list-nav-item'));
      };
      if (p.item.category === 'B') {
        // host 底色塊移除排在 Phase B（restoreDelay + M_CITY_LEAD，跟 decolorize 同波、城市走完之後）＝與
        // 「全體變黑」同一拍擦色塊；色塊掃除、留裸文字（已轉 theme-fg）在原地，Phase C（flyAt）才直飛歸列。
        master.call(() => {
          if (destroyed) return;
          const g = spawnBChipBgGhost(p.item);
          // 裸文字字色已由上方 Stage-1 統一 loop 轉 theme-fg（inverse 黑底黑字才不隱形；flipFlyNode 飛行補色 from=此值＝無縫）
          // user 09-03：色塊掃除＝clip-reveal（隨機四向、同城市方塊＋unpaired host 統一，不論是否在 list）——色塊靜態、clip wipe 不再像「先位移才消失」
          gsap.to(g, {
            clipPath: NODE_HIDE_INSETS[Math.floor(Math.random() * 4)],
            duration: M_CITY_DUR, ease: EASE.enterSoft,
            onComplete: () => g.remove(),
          });
        }, null, restoreDelay + M_CITY_LEAD + Math.random() * 0.1);
      }
      master.add(flipFlyNode(p.item, restoreDelay + flyAt,   // 08-31：拿掉 +SWALLOW_DUR 前導（host ghost 已移 Phase B、不再需要起飛前導窗）＝再省 0.3s 停頓
        // ctrlPt=null＝直線 A→B（user 09-02 撤回 08-31 弧線 bow「有的 item 到位轉 curve」，flipFlyNode 弧線分支保留但不啟用）
        () => toListForm(p.item, p.wrapper, p.cat), onLand, true, null), 0);
    });
    chromePairs.forEach(p => {
      // flyDur: FLY_DUR + 1＝與 item 正向長弧同基準（flipFlyNode toList 亦 FLY_DUR+1）→ title 跟 item 同時間定位（user 09-02）
      master.add(maskFlyChrome(p.srcEl, p.srcRot, p.dstEl, p.dstRot,
        restoreDelay + M_NAV_START + (NAV_ORDER[p.key] ?? 0) * M_NAV_STEP, { flyDur: FLY_DUR + 1 }), 0);
    });
    // subchip 跨切換不收合（user 08-25）：ctrl 恆 visible=true——list 期間靠 filterEl display:none
    // 隱藏即可；回程 showCareer 對 subchip 冪等 no-op、chip 佔位不塌＝Partners btn 不跳位
  }

  function switchToMap() {
    if (currentView === 'map' || viewMorphing) return;

    if (typeof gsap === 'undefined') {
      // 無動畫 fallback：瞬切（節點撤回星雲 anchor）
      currentView = 'map';
      if (listCareerCtrl) { listCareerCtrl.destroy(); listCareerCtrl = null; }
      evacuateListNodes(listView);
      stage.style.display = '';
      stage.style.opacity = '';
      refreshFloatRunning();
      listView.classList.remove('visible');
      if (filterEl) filterEl.style.display = '';
      scale = defaultScaleAtlas;
      tx = 0; ty = 0;
      applyTransform();
      apply();
      btns.forEach(b => b.classList.add('atlas-filter-revealed'));
      syncCareer();
      const icon = /** @type {HTMLElement|null} */ (layoutBtn ? layoutBtn.querySelector('.icon') : null);
      if (icon) icon.className = 'icon icon-atlas-list';
      return;
    }

    currentView = 'map';
    viewMorphing = true;
    main.classList.add('atlas-morphing');
    drainRevealTimers();
    if (introTween) introTween.kill();
    hideLayoutIcon();
    if (listCareerCtrl) listCareerCtrl.hide({ delay: 0 });   // stage1：list-only（career）先清，領先回程波（R_LIST_EXIT）

    // ── 星雲復位（zoom 初始態）＋顯示；wobble 維持凍結（refreshFloatRunning gate viewMorphing）──
    scale = defaultScaleAtlas;
    tx = 0; ty = 0;
    applyTransform();
    stage.style.display = '';
    if (filterEl) filterEl.style.display = '';
    Object.values(subchipMap).forEach(c => { if (c) c.style.visibility = ''; });
    apply();   // filter active class / anchors 顯隱同步（全開狀態、切 list 時已 restore）

    // ── 配對：當下頁的 list 形態節點（翻頁後＝當下頁；查 live DOM）──
    /** @type {any[]} */
    const flyItems = [];
    listView.querySelectorAll('.atlas-name.atlas-as-list').forEach(n => {
      const it = itemByIdMap.get(/** @type {HTMLElement} */ (n).dataset.itemId || '');
      if (it) flyItems.push(it);
    });
    const pairedItems = new Set(flyItems);
    // 吞之前先剝 marquee dual-copy 歸零（否則 cover 縮寬/遮罩量測吃到兩倍 inner 寬）
    flyItems.forEach(resetMarqueeState);
    // 翻頁後的當頁 item 可能是正向退場的「未配對」＝anchor 被寫了 opacity:0 → 現在要當 paired
    // 飛回，先還原 anchor 可見（span 還在 list、anchor 是空殼＝立即清無感），否則落地進隱形
    // anchor＝環上 chip 變少（user 08-28）
    flyItems.forEach(it => { it._anchor.style.opacity = ''; });

    // chrome 反向：3 主 btn + alumni master + host/employ subchip ← 欄標題；
    // 階梯＝正向 NAV_ORDER 鏡像（partners→employ→host→alumni→faculty）
    const masterTitleR = /** @type {HTMLElement|null} */ (listView.querySelector('.atlas-list-group-label-col .atlas-list-col-title'));
    /** @type {{srcEl:HTMLElement, srcRot:number, dstBtn:HTMLElement, inner:HTMLElement, dstRot:number, backIdx:number}[]} */
    const chromePairsR = [];
    btns.forEach(b => {
      const srcEl = b.dataset.filter === 'alumni'
        ? masterTitleR
        : /** @type {HTMLElement|null} */ (listView.querySelector(`.atlas-list-col[data-category="${b.dataset.filter}"] > .atlas-list-col-titleblock .atlas-list-col-title`));
      const inner = /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner'));
      if (!srcEl || !inner) return;
      const block = /** @type {HTMLElement|null} */ (srcEl.closest('.atlas-list-col-titleblock, .atlas-list-group-label-col'));
      chromePairsR.push({ srcEl, srcRot: inlineRotDeg(block), dstBtn: b, inner, dstRot: inlineRotDeg(inner), backIdx: 4 - (NAV_ORDER[b.dataset.filter || ''] ?? 0) });
    });
    // subchip 反向也 mask 飛回（user 08-25 跨切換不收合、落地即打開狀態）：src=同名欄標題、
    // dst=chip 本體（未收合、layout 佔位中、先藏到 mask 落地揭露——filterEl 已顯示，不藏會 t=0 閃現）
    /** @type {{srcEl:HTMLElement, srcRot:number, chip:HTMLElement, dstRot:number, backIdx:number}[]} */
    const subchipPairsR = [];
    [['host', subchipMap.host], ['employ', subchipMap.employ]].forEach(([key, chip]) => {
      const chipEl = /** @type {HTMLElement|null} */ (chip);
      const srcEl = /** @type {HTMLElement|null} */ (listView.querySelector(`.atlas-list-col[data-category="${key}"] > .atlas-list-col-titleblock .atlas-list-col-title`));
      // 未展開（intro 被中斷）→ 不飛，收尾 showCareer 的 ctrl.show 冪等 fallback 會補展開
      if (!chipEl || chipEl.offsetHeight === 0 || !srcEl) return;
      const block = /** @type {HTMLElement|null} */ (srcEl.closest('.atlas-list-col-titleblock'));
      chipEl.style.visibility = 'hidden';
      subchipPairsR.push({ srcEl, srcRot: inlineRotDeg(block), chip: chipEl, dstRot: inlineRotDeg(chipEl), backIdx: 4 - (NAV_ORDER[/** @type {string} */ (key)] ?? 0) });
    });
    const pairedTitleEls = new Set([...chromePairsR, ...subchipPairsR].map(p => p.srcEl));

    // ── 未配對星雲元素分階段進場（anchors 壓 0 / 線縮點；paired 的 anchor 是空殼不受影響）──
    const enterTl = buildMapEnterTl(items.filter(i => i._span && !pairedItems.has(i)));

    const master = gsap.timeline({
      onComplete: () => {
        if (destroyed || currentView !== 'map') return;
        listView.classList.remove('visible');
        listView.style.visibility = '';
        chromePairsR.forEach(p => { p.srcEl.style.visibility = ''; });   // 標題歸位（renderList 下次重建）
        subchipPairsR.forEach(p => { p.srcEl.style.visibility = ''; p.chip.style.visibility = ''; });   // 保險（落地已揭露）
        btns.forEach(b => b.classList.add('atlas-filter-revealed'));     // 落地已加；漏網補上
        stage.style.opacity = '';
        viewMorphing = false;
        refreshFloatRunning();   // 恢復 float（通常 floatThawEarly 已提前解凍＝no-op；補償在解凍當下做）
        floatThawEarly = false;
        revealLayoutIcon('icon icon-atlas-list');
        // 收尾補 career chip + ring（subchip 已飛回且 ctrl 恆 visible → show() 冪等 no-op；
        // 僅 intro 被中斷、subchip 從未展開的邊角才會由此 fallback 展開）
        const subchipT = /** @type {any} */ (setTimeout(() => {
          if (selected.has('alumni')) showCareer({ stagger: SUBCHIP_STAGGER });
        }, SUBCHIP_GAP + 200));
        revealTimers.push(subchipT);
        main.classList.remove('atlas-morphing');
      },
    });
    introTween = /** @type {any} */ (master);
    master.add(enterTl, 0);

    // 當下頁 item 飛回＝全類本體直飛（user 08-28 三輪：B 也改直飛——文字先回去、定位後底色
    // ghost 沿來向 clip 進場＝正向掃出的鏡像；原 maskFlyNode 色塊吞回已退場）
    flyItems.forEach(it => {
      const delay = R_ITEM_START + Math.random() * R_ITEM_RANGE;
      if (it.category !== 'B') {
        master.add(flipFlyNode(it, delay, () => toChipForm(it), null, false), 0);
        return;
      }
      const srcR = it._span.getBoundingClientRect();   // 起點（list 端）先記，落地算來向
      master.add(flipFlyNode(it, delay,
        () => { toChipForm(it); it._span.style.backgroundColor = 'transparent'; },   // 飛行中裸文字（bg 落地才回）
        () => {
          const n = /** @type {HTMLElement} */ (it._span);
          const g = spawnBChipBgGhost(it);
          const dstR = n.getBoundingClientRect();
          const dx = (dstR.left + dstR.width / 2) - (srcR.left + srcR.width / 2);
          const dy = (dstR.top + dstR.height / 2) - (srcR.top + srcR.height / 2);
          gsap.fromTo(g, { clipPath: travelCoverDir(-dx, -dy) }, {
            clipPath: COVER_SHOWN_M, duration: REVEAL_DUR, ease: EASE.enterSoft,
            onComplete: () => { n.style.backgroundColor = it.bgColor || ''; g.remove(); },
          });
        }, false), 0);
    });
    // 全類直飛＝落點跟著 anchor 補間（gsap x/y 疊在 anchor 座標上）、無 mask 預量落點約束 →
    // 起手即解凍 wobble（原「不可早於 mask 落地」限制隨 maskFlyNode 退場；host 圈即刻恢復轉動）
    if (flyItems.length) {
      master.call(() => {
        if (destroyed || currentView !== 'map') return;
        floatThawEarly = true;
        refreshFloatRunning();
      }, null, 0.05);
    }
    // subchip 飛回：落地即打開狀態（maskFlyChrome onComplete 揭露 visibility）
    subchipPairsR.forEach(p => {
      master.add(maskFlyChrome(p.srcEl, p.srcRot, p.chip, p.dstRot, R_NAV_START + p.backIdx * R_NAV_STEP), 0);
    });
    // chrome 反向（合作單位→就職→主持→系友→老師 鏡像階梯）；落地揭露 btn（關 transition 防 0.5s 滑入）
    chromePairsR.forEach(p => {
      master.add(maskFlyChrome(p.srcEl, p.srcRot, p.inner, p.dstRot, R_NAV_START + p.backIdx * R_NAV_STEP, {
        dstBoxFn: () => {
          const r = p.dstBtn.getBoundingClientRect();   // btn 遮罩窗本體不動＝revealed inner 落點
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: p.inner.offsetWidth, h: p.inner.offsetHeight };
        },
        // 落地：inner 關 transition 即時定位（色塊→無字 box 要像素同位無痕瞬換；0.9s 自然滑入
        // ＝重播 intro 進場，user 打回）；文字 reveal 由 maskFlyChrome 統一的 clip 左→右進場負責
        onLand: () => {
          p.inner.style.transition = 'none';
          p.dstBtn.classList.add('atlas-filter-revealed');
          void p.inner.offsetWidth;
          requestAnimationFrame(() => { p.inner.style.transition = ''; });
        },
      }), 0);
    });

    // stage1（phase1）：只在 list 出現的元素（item 副標 yPercent、未配對標題 yPercent、箭頭 clip-reveal 滑出）在 t=0
    // 先清乾淨，領先回程波（R_ITEM_START）＝正向「map-only 元素先退」的鏡像（user 08-30；09-01 副標併入此拍）
    // 只收「即將飛回的當頁 item」副標（非全 listView，避免掃到 off-screen 量測 ghost）；
    // stagger 用 amount 封頂總掃長＝與箭頭(DUR.slow)同窗清完，才不會拖進 R_ITEM_START(0.85) 的標題波
    const subExitR = flyItems.flatMap(it =>
      /** @type {HTMLElement[]} */ ([...it._subsEl.querySelectorAll('.atlas-list-item-label')]));
    if (subExitR.length) {
      gsap.to(subExitR, { yPercent: 100, duration: SUB_HIDE_DUR, ease: EASE.exitSoft, overwrite: true, stagger: { amount: 0.35 } });
    }
    const yTargets = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-col-title')])
      .filter(el => !pairedTitleEls.has(el));
    if (yTargets.length) {
      gsap.to(yTargets, {
        yPercent: () => Math.random() < 0.5 ? 100 : -100,
        duration: DUR.slow, ease: EASE.exitSoft, overwrite: true,
      });
    }
    // 右箭頭離場改 hero clip-reveal（位移＋自遮罩），與進場（navChipHidden 從下滑上）鏡像＝往下滑出（user 09-01 全站不要 clip-path 原地擦除）
    // ⚠️ 動 btn 本體不動 .atlas-list-nav-item wrapper；必用 fromTo 顯式起點 NAV_CHIP_SHOWN（gsap.to 從 computed 補間會 snap，同 maskFlyChrome）
    const navExitBtns = /** @type {HTMLElement[]} */ ([...listView.querySelectorAll('.atlas-list-nav-item .atlas-list-nav-btn')]);
    navExitBtns.forEach(btn => gsap.fromTo(btn, { ...NAV_CHIP_SHOWN },
      { ...navChipHidden(btn, 'bottom'), duration: DUR.slow, ease: EASE.exitSoft, overwrite: true }));
    return;
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
      evacuateListNodes(listView);   // 單一節點：list 形態節點先撤回星雲 anchor，星雲才有內容可顯示
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
  //    user 2026-09-01：item 散佈維持鋪滿 viewport（不內縮），城市改由 orbit 往外擴散到外圈（見上 ORBIT_* 常數）。
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

