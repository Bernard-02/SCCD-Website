/* global gsap */
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { registerPageExit } from '../ui/page-exit.js';

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
 * 進場：scale 0.8 → 1.0 緩動 ~3.5s；之後 user 可 zoom 到 1.8。
 */

// 三原色（A/B/C label 與線色從這裡選；D 永遠黑）
const PRIMARY_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
const COLOR_BLACK = '#000000';

// Alumni filter 下方輪播職業（雙語，每 3s 切換一個 + clip-path 動畫）
const ALUMNI_CAREERS = [
  { en: 'Animation Directors', zh: '動畫導演' },
  { en: 'New Media Artists', zh: '新媒體藝術家' },
  { en: 'Creative Directors', zh: '創意總監' },
  { en: 'Art Directors', zh: '藝術總監' },
  { en: 'Design Directors', zh: '設計總監' },
  { en: 'Graphic Designers', zh: '平面設計師' },
  { en: 'Game Designers', zh: '遊戲設計師' },
  { en: 'Web Designers', zh: '網站設計師' },
  { en: 'Artists', zh: '藝術家' },
  { en: 'Photographers', zh: '攝影師' },
  { en: 'Curators', zh: '策展人' },
  { en: 'Painters', zh: '畫家' },
  { en: 'Cartoonist', zh: '漫畫家' },
  { en: 'Illustration Designer', zh: '插畫家' },
  { en: 'Film, Advertising, MV Director', zh: '電影 / 廣告 / MV 導演' },
  { en: 'UI, UX Designer', zh: 'UI / UX 設計師' },
  { en: 'Product Designer', zh: '產品設計師' },
  { en: 'Costume Designer', zh: '服裝設計師' },
  { en: 'Interior Designer', zh: '室內設計師' },
  { en: 'Type Designer', zh: '字體設計師' },
  { en: 'Concept Design', zh: '概念設計' },
  { en: 'Art Design', zh: '美術設計' },
  { en: 'Event Planner', zh: '活動策劃' },
  { en: 'Occupational Therapy Artist', zh: '職能治療藝術家' },
  { en: 'Brand Design', zh: '品牌設計' },
  { en: 'Manager', zh: '經紀人' },
  { en: 'Lead Vocal of the Band', zh: '樂團主唱' },
  { en: 'Polar Explorer', zh: '極地探險家' },
];

// ── Filter ─────────────────────────────────────────────
// Faculty  = fc + ff（在職 + 離職教師）
// Alumni   = co（系友任職企業 — 橢圓 ring chip，host subgroup）
//          + em（系友就職企業 — 橢圓外 floating chip，employ subgroup；mock data 暫無真實 source）
// Partners = wsg + ind + lec（工作營 / 產學合作 / 講座講者）
const FILTER_PREFIXES = {
  faculty:  ['fc', 'ff'],
  alumni:   ['co', 'em'],
  partners: ['wsg', 'ind', 'lec'],
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

// 從 item 當前位置回推 box 範圍（含 BOX_PADDING）
function computeBoxAt(item, x, y) {
  const w = item._boxW || 60;
  const h = item._boxH || 20;
  // B 企業環 chip 走 horizontal-centered（box 中心 = anchor）；其餘 item 依 side 靠邊
  const isCentered = item.category === 'B';
  const isSideLeft = item._isSideLeft;
  const labelLeft  = isCentered ? x - w / 2 : (isSideLeft ? x - w : x);
  const labelRight = isCentered ? x + w / 2 : (isSideLeft ? x : x + w);
  return {
    left:   labelLeft  - BOX_PADDING,
    right:  labelRight + BOX_PADDING,
    top:    y - h / 2  - BOX_PADDING,
    bottom: y + h / 2  + BOX_PADDING,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// 每次 reload 隨機重新洗一次佈局（城市軌道、labels 位置、faculty placeholder、list 三原色 shuffle 等都跟著變）
// 想暫時鎖固定佈局除錯時改回 const LAYOUT_SEED = 0xA71A5
const LAYOUT_SEED = Math.floor(Math.random() * 0xFFFFFFFF);

// 是否把名稱換成 type-numbered placeholder（目前資料許多是假名／"Company Name"）
const USE_TYPE_PLACEHOLDER = true;
const TYPED_LABELS = {
  fc:  { en: 'Current Faculty',  zh: '在職教師' },
  ff:  { en: 'Former Faculty',   zh: '離職教師' },
  lec: { en: 'Lecture Speaker',  zh: '講座講者' },
  wsg: { en: 'Workshop Partner', zh: '工作營合作單位' },
  ind: { en: 'Industry Partner', zh: '產學合作公司' },
  co:  { en: 'Alumni Co.',       zh: '系友任職企業' },
};

// Canonical 國家（D 節點：取代原本 19 個城市，改用 9 個國家；資料源自 workshops 解析出來的城市
// → 透過 CITY_TO_COUNTRY 對應到國家，避免冒出系統不認得的國家）
const CANONICAL_COUNTRIES = [
  { en: 'Japan',          zh: '日本',   iso: 'JP' },
  { en: 'United States',  zh: '美國',   iso: 'US' },
  { en: 'China',          zh: '中國',   iso: 'CN' },
  { en: 'Thailand',       zh: '泰國',   iso: 'TH' },
  { en: 'Singapore',      zh: '新加坡', iso: 'SG' },
  { en: 'United Kingdom', zh: '英國',   iso: 'GB' },
  { en: 'South Korea',    zh: '韓國',   iso: 'KR' },
  { en: 'France',          zh: '法國',  iso: 'FR' },
  { en: 'Taiwan',         zh: '臺灣',   iso: 'TW' },
];

// 城市（workshops.json 內出現的城市）→ 對應國家 EN 名稱（COUNTRY 表 key）
const CITY_TO_COUNTRY = {
  'Tokyo':      'Japan',
  'Kyoto':      'Japan',
  'Nagoya':     'Japan',
  'Osaka':      'Japan',
  'New York':   'United States',
  'California': 'United States',
  'Shanghai':   'China',
  'Beijing':    'China',
  'Chiang Mai': 'Thailand',
  'Bangkok':    'Thailand',
  'Singapore':  'Singapore',
  'London':     'United Kingdom',
  'Busan':      'South Korea',
  'Seoul':      'South Korea',
  'Paris':      'France',
  'Taipei':     'Taiwan',
  'Tainan':     'Taiwan',
  'Yilan':      'Taiwan',
  'Hualien':    'Taiwan',
};

// 中文城市 → 國家 EN（parseCities 抓 location_zh 時用）
const CITY_ZH_TO_COUNTRY = {
  '東京':   'Japan',  '京都':   'Japan',  '名古屋': 'Japan',  '大阪':   'Japan',
  '紐約':   'United States', '加州': 'United States',
  '上海':   'China',  '北京':   'China',
  '清邁':   'Thailand', '曼谷': 'Thailand',
  '新加坡': 'Singapore',
  '倫敦':   'United Kingdom',
  '釜山':   'South Korea', '首爾': 'South Korea',
  '巴黎':   'France',
  '臺北':   'Taiwan',  '臺南':   'Taiwan',  '宜蘭':   'Taiwan',  '花蓮':   'Taiwan',
};

// Faculty 隨機公司名池（list view 副標用，因目前是 placeholder 教師資料）
const FAKE_COMPANIES = [
  { en: 'Studio One',         zh: '一號設計工作室' },
  { en: 'Atlas Design',       zh: '亞特拉斯設計'   },
  { en: 'Pentagram',          zh: '五角設計'       },
  { en: 'IDEO',               zh: 'IDEO 設計顧問'  },
  { en: 'Frog Design',        zh: '青蛙設計'       },
  { en: 'Wieden+Kennedy',     zh: '威頓肯尼迪'     },
  { en: 'Saatchi & Saatchi',  zh: '盛世長城'       },
  { en: 'Ogilvy',             zh: '奧美廣告'       },
  { en: 'Dentsu',             zh: '電通廣告'       },
  { en: 'BBDO',               zh: 'BBDO 廣告'      },
  { en: 'Hakuhodo',           zh: '博報堂'         },
  { en: 'Method Design',      zh: '方法設計'       },
  { en: 'Local Projects',     zh: '在地計畫'       },
  { en: 'Field Studio',       zh: '田野工作室'     },
  { en: 'Studio Dumbar',      zh: '杜姆巴設計'     },
  { en: 'MetaDesign',         zh: '元設計'         },
  { en: 'R/GA',               zh: 'R/GA 數位設計'  },
  { en: 'Wolff Olins',        zh: '沃爾夫奧林斯'   },
];

// Partner 類型對應（wsg/ind/lec 各自映射）
const PARTNER_TYPES = {
  wsg: { en: 'Workshop',                       zh: '工作營'   },
  ind: { en: 'Industry Partnerships',          zh: '產學合作' },
  lec: { en: 'Lectures',                       zh: '講座'     },
};

// ── Layout 參數（px）─ Rugby ball (橢圓) 中央 + Saturn ring 外環 ───────────
// 非城市 (A/B/C) uniform scatter 在橢圓內（橄欖球型，兩端漸尖，中間胖）
// 城市 (D) 走外環 orbit（看上方 city orbit 區段）
// HW > HH 對比越大 → 越像橄欖球；要再扁長就拉大 HW_FRAC、縮小 HH_FRAC
const ELLIPSE_HW_FRAC   = 1.0;    // 橄欖球半長軸 = halfW × 1.0（往外擴散）
const ELLIPSE_HH_FRAC   = 0.70;   // 橄欖球半短軸 = halfH × 0.70（厚度）
// 視覺向上偏置（補償左下角 filter 按鈕造成的下方視覺重心，使 cluster 在「可用內容區」中置中）
const CLUSTER_Y_BIAS    = -60;    // 負值 = 往上；fallback header=80px 下，這是 stage 中心上移 ~5.8% halfH
const CITY_DIST_FROM_CENTER_MIN_FRAC = 0.85;  // city orbit 暫定位置（最終被 orbit 覆寫）
const CITY_EDGE_PAD     = 4;
const CITY_MIN_SPACING  = 110;
const ITEM_MIN_SPACING  = 80;
const RELAX_ITERATIONS  = 6;

// ── Zoom ────────────────────────────────────────────────
const SCALE_INTRO_START = 0.55;   // 進場更遠的鏡頭
const SCALE_DEFAULT     = 0.78;   // 預設留 ~20% 邊距，不貼邊
const MIN_SCALE         = 0.78;
const MAX_SCALE         = 3.5;    // zoom in 上限拉到 3.5x
const ZOOM_SPEED        = 0.0015;
const INTRO_DURATION    = 1.5;

// 假資料：B/C 沒有 cityKey 時隨機指派一個 canonical 城市（seeded，方便看 cluster + 連線）
// 真實資料補上 city 欄位後，這個 fallback 自動讓位給真資料
const USE_FAKE_CITY_FILL = true;

let cleanupFns = [];

export function cleanupAtlas() {
  cleanupFns.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });
  cleanupFns = [];
  document.body.style.cursor = '';
}

export async function initAtlas(options = {}) {
  // root 預設為 document（atlas 頁正常 init）；idle-standby 可傳入 overlay 內的 container
  // 讓同份 atlas 模組在多個 root 上同時運作
  const root = options.root || document;
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

  // ── 載入資料 ─────────────────────────────────────────
  const [facultyCurrent, facultyFormer, workshops, industry, companies, lectures] = await Promise.all([
    fetchJson('data/faculty.json'),
    fetchJson('data/faculty-former.json'),
    fetchJson('data/workshops.json'),
    fetchJson('data/industry.json'),
    fetchJson('data/atlas-companies.json'),
    fetchJson('data/lectures.json'),
  ]);

  // ── 建構 items ──────────────────────────────────────
  const items = [];
  const groups = new Map();
  const countryIndex = new Map();   // canonical country EN → D itemId
  let idCounter = 0;
  const uid = (prefix) => `${prefix}-${++idCounter}`;

  // 預先建好 D 國家（canonical 9 個）
  CANONICAL_COUNTRIES.forEach(c => {
    const it = {
      id: uid('country'), category: 'D',
      textEn: c.en, textZh: c.zh,
      labelEn: 'Country', labelZh: '國家',
      detail: '本系師生與合作對象足跡所及之國家。',
      groups: [], cityKey: c.en, countryIso: c.iso,
    };
    items.push(it);
    countryIndex.set(c.en, it.id);
  });

  // city（workshops EN / ZH）→ 對應國家 EN 名稱（用於把工作營掛到對的國家）
  const cityEnNorm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
  const cityToCountryByEn = new Map(
    Object.entries(CITY_TO_COUNTRY).map(([cityEn, countryEn]) => [cityEnNorm(cityEn), countryEn])
  );
  const cityToCountryByZh = new Map(Object.entries(CITY_ZH_TO_COUNTRY));
  // 同時允許資料端直接寫國家名 / ISO，避免遺漏
  const countryByEnNorm = new Map(CANONICAL_COUNTRIES.map(c => [cityEnNorm(c.en), c.en]));
  const countryByZh = new Map(CANONICAL_COUNTRIES.map(c => [c.zh, c.en]));
  const countryByIso = new Map(CANONICAL_COUNTRIES.map(c => [c.iso, c.en]));
  function matchCanonical(en, zh) {
    if (en) {
      const norm = cityEnNorm(en);
      const m = cityToCountryByEn.get(norm) || countryByEnNorm.get(norm) || countryByIso.get(en.toUpperCase());
      if (m) return m;
    }
    if (zh) {
      const m = cityToCountryByZh.get(zh) || countryByZh.get(zh);
      if (m) return m;
    }
    return null;
  }

  // A: 在職教師
  (facultyCurrent || []).forEach(f => {
    if (!f.nameEn && !f.nameZh) return;
    items.push({
      id: uid('fc'), category: 'A',
      textEn: f.nameEn || '', textZh: f.nameZh || '',
      labelEn: 'Current Faculty', labelZh: '在職教師',
      detail: '目前任職於本系，從事教學、研究與創作實務。',
      groups: [], cityKey: null,
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
    });
  });

  // A: 講座講者
  (lectures || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(lec => {
      const lecGroupId = lec.id;
      if (!lecGroupId) return;
      const dt = (lec.description_zh || lec.description || '').trim().slice(0, 140) ||
                 '本系邀請業界與學界專家進行專題講座。';
      const memberIds = [];
      (lec.guests || []).forEach(g => {
        const en = g.name || g.affiliation || '';
        const zh = g.name_zh || g.affiliation_zh || '';
        if (!en && !zh) return;
        const it = {
          id: uid('lec'), category: 'A',
          textEn: en, textZh: zh,
          labelEn: 'Lecture Speaker', labelZh: '講座講者',
          detail: dt, groups: [lecGroupId], cityKey: null,
        };
        items.push(it);
        memberIds.push(it.id);
      });
      if (memberIds.length > 0) groups.set(lecGroupId, { detail: dt, members: memberIds });
    });
  });

  // C: 工作營合作單位（cityKey 對到 canonical 城市）
  (workshops || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ws => {
      const wsGroupId = ws.id;
      if (!wsGroupId) return;
      const dt = (ws.intro_zh || ws.intro || '').trim().slice(0, 140) ||
                 '本系與外部單位合作之工作營。';
      const memberIds = [];

      const wsCities = parseCities(ws);
      let primaryCanon = null;
      for (const c of wsCities) {
        const m = matchCanonical(c.en, c.zh);
        if (m) { primaryCanon = m; break; }
      }

      (ws.guests || []).forEach(g => {
        const en = g.name || g.affiliation || '';
        const zh = g.name_zh || g.affiliation_zh || '';
        if (!en && !zh) return;
        const it = {
          id: uid('wsg'), category: 'C',
          textEn: en, textZh: zh,
          labelEn: 'Workshop Partner', labelZh: '工作營合作單位',
          detail: dt, groups: [wsGroupId], cityKey: primaryCanon,
        };
        items.push(it);
        memberIds.push(it.id);
      });

      // 將工作營掛到對應國家的 group（hover 國家時會 highlight 該工作營全部成員）
      if (primaryCanon && countryIndex.has(primaryCanon)) {
        const countryId = countryIndex.get(primaryCanon);
        const countryItem = items.find(i => i.id === countryId);
        if (countryItem && !countryItem.groups.includes(wsGroupId)) countryItem.groups.push(wsGroupId);
        memberIds.push(countryId);
      }

      groups.set(wsGroupId, { detail: dt, members: memberIds });
    });
  });

  // C: 產學合作公司（無城市資料）
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
        const it = {
          id: uid('ind'), category: 'C',
          textEn: en, textZh: zh,
          labelEn: 'Industry Partner', labelZh: '產學合作公司',
          detail: dt, groups: [indGroupId], cityKey: null,
        };
        items.push(it);
        memberIds.push(it.id);
      });
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
      groups: [], cityKey: null,
    });
  });

  // C 風格 floating chip：系友就職企業 mock data（橢圓 ring 外、有 cityKey 跟著城市 relocate）
  // 用 category 'C' 視覺上跟 Partners 同（colored text、無 chip bg、小軌道、有連到城市的線）
  // prefix 'em' 註冊在 FILTER_PREFIXES.alumni → alumni btn / employ subchip 控制顯隱
  // cityKey 用 seeded random 分配 canonical 國家 → 線連到該國 D chip，城市 10s relocate 一起平移
  // 真實 employment data 接入時：把這段換成從 data 來源 push（保留 prefix 'em' 即可）
  const EMPLOY_MOCK = [
    { textEn: 'Spotify',           textZh: 'Spotify 音樂'   },
    { textEn: 'Netflix',           textZh: '網飛'           },
    { textEn: 'Pinterest',         textZh: 'Pinterest'      },
    { textEn: 'Twitch',            textZh: 'Twitch 直播'    },
    { textEn: 'Discord',           textZh: 'Discord 社群'   },
    { textEn: 'Reddit',            textZh: 'Reddit 論壇'    },
    { textEn: 'YouTube',           textZh: 'YouTube'        },
    { textEn: 'TikTok',            textZh: '抖音'           },
    { textEn: 'X (Twitter)',       textZh: 'X 平台'         },
    { textEn: 'LinkedIn',          textZh: '領英'           },
    { textEn: 'Behance',           textZh: 'Behance 創意'   },
    { textEn: 'Dribbble',          textZh: 'Dribbble 設計'  },
    { textEn: 'Airbnb',            textZh: 'Airbnb'         },
    { textEn: 'Uber',              textZh: 'Uber 優步'      },
    { textEn: 'Lyft',              textZh: 'Lyft'           },
    { textEn: 'Stripe',            textZh: 'Stripe 支付'    },
    { textEn: 'Shopify',           textZh: 'Shopify 電商'   },
    { textEn: 'Figma',             textZh: 'Figma 設計'     },
    { textEn: 'Adobe',             textZh: 'Adobe 奧多比'   },
    { textEn: 'IDEO',              textZh: 'IDEO 創新設計'  },
    { textEn: 'Pentagram',         textZh: 'Pentagram 五角' },
    { textEn: 'Wieden+Kennedy',    textZh: '威肯廣告'       },
    { textEn: 'Ogilvy',            textZh: '奧美廣告'       },
    { textEn: 'Dentsu',            textZh: '電通'           },
    { textEn: 'BBDO',              textZh: 'BBDO 廣告'      },
    { textEn: 'TBWA',              textZh: 'TBWA 媒體'      },
    { textEn: 'R/GA',              textZh: 'R/GA 互動'      },
    { textEn: 'Sagmeister & Walsh', textZh: 'Sagmeister 設計' },
    { textEn: 'Bloomberg',         textZh: '彭博媒體'       },
    { textEn: 'Condé Nast',        textZh: '康泰納仕'       },
  ];
  const employCityRand = mulberry32(LAYOUT_SEED ^ 0x5E170A);
  EMPLOY_MOCK.forEach(em => {
    const country = CANONICAL_COUNTRIES[Math.floor(employCityRand() * CANONICAL_COUNTRIES.length)];
    items.push({
      id: uid('em'), category: 'C',
      textEn: em.textEn, textZh: em.textZh,
      labelEn: 'Alumni Employer', labelZh: '系友就職企業',
      detail: '本系畢業生就職之企業。',
      groups: [], cityKey: country.en,
    });
  });

  if (items.length === 0) {
    console.warn('[Atlas] No items');
    return;
  }

  // 假資料 fallback：B/C 缺 country 的隨機 assign canonical 國家
  if (USE_FAKE_CITY_FILL) {
    const fakeRand = mulberry32(LAYOUT_SEED ^ 0x9E3779B1);
    items.forEach(it => {
      if ((it.category === 'B' || it.category === 'C') && !it.cityKey) {
        const idx = Math.floor(fakeRand() * CANONICAL_COUNTRIES.length);
        it.cityKey = CANONICAL_COUNTRIES[idx].en;
      }
    });
  }

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

  // ── List view 副標資料（seeded，跨 reload 穩定）─────────
  // faculty: 隨機公司名 / alumni: 國家 / partners: 類型 + 國家
  const listRand = mulberry32(LAYOUT_SEED ^ 0xC0FFEE);
  const countryZhByEn = new Map(CANONICAL_COUNTRIES.map(c => [c.en, c.zh]));
  const countryIsoByEn = new Map(CANONICAL_COUNTRIES.map(c => [c.en, c.iso]));
  const countryKeysAll = CANONICAL_COUNTRIES.map(c => c.en);
  items.forEach(item => {
    if (item.category === 'D') return;
    const prefix = String(item.id).split('-')[0];
    const cat = Object.keys(FILTER_PREFIXES).find(k => FILTER_PREFIXES[k].includes(prefix));
    if (cat === 'faculty') {
      const c = FAKE_COMPANIES[Math.floor(listRand() * FAKE_COMPANIES.length)];
      item._listSubEn = c.en;
      item._listSubZh = c.zh;
    } else if (cat === 'alumni') {
      // co-* (橢圓 ring 企業) → host（Hosting subchip 點掉 = 整圈消失）
      // em-* (橢圓外 floating chip) → employ（Employment subchip 點掉 = floating chip 全收）
      item._listSubGroup = prefix === 'em' ? 'employ' : 'host';
      const countryEn = item.cityKey;
      const countryZh = countryZhByEn.get(countryEn) || countryEn;
      // 渲染國家全名，ISO 代碼不寫（user 指定）
      if (countryEn) {
        item._listSubEn = countryEn;
        item._listSubZh = countryZh;
      }
    } else if (cat === 'partners') {
      const type = PARTNER_TYPES[prefix];
      if (type) {
        item._listTypeEn = type.en;
        item._listTypeZh = type.zh;
      }
      let countryEn = item.cityKey;
      if (!countryEn) countryEn = countryKeysAll[Math.floor(listRand() * countryKeysAll.length)];
      const countryZh = countryZhByEn.get(countryEn) || countryEn;
      if (countryEn) {
        item._listCountryEn = countryEn;
        item._listCountryZh = countryZh;
      }
    }
  });

  // 顏色配置：
  //   D 國家 = 黑字 + 隨機三原色 chip 底
  //   B 系友任職企業 = 白字 + 純黑 chip 底（30 個企業組成中環橢圓，固定黑底白字）
  //   其他 A/C item 各自獨立隨機挑三原色（連線 stroke 沿用 item.color）
  items.forEach(item => {
    if (item.category === 'D') {
      item.color = COLOR_BLACK;
      item.bgColor = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    } else if (item.category === 'B') {
      item.color = '#FFFFFF';
      item.bgColor = COLOR_BLACK;
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
  const COMPANY_ELLIPSE_RX_F = 1.20;          // 半長軸 = halfW × 1.20（後 scale 0.78 = ~94vw 視覺寬度）
  // RY 從極扁 0.38（aspect 6.3）放寬到 0.65（aspect 3.7）：
  // 扁橢圓的 cap 半徑 = ry²/rx；30 chip 等弧分佈時 cap 區塞 4-5 個 chip，半徑太小會視覺擠成一堆
  // 0.65 cap 半徑 ~92px，chip 在 cap 有物理空間散開
  const COMPANY_ELLIPSE_RY_F = 0.65;          // 半短軸（aspect ≈ 3.7，flat-ish 但 cap 有空間）
  const COMPANY_ELLIPSE_RX   = halfW * COMPANY_ELLIPSE_RX_F;
  const COMPANY_ELLIPSE_RY   = halfH * COMPANY_ELLIPSE_RY_F;
  const COMPANY_RING_PERIOD  = 70;            // 全圈一輪 70 秒（user 持續要慢化：16s → 40s → 70s）
  const COMPANY_RING_DIR     = -1;            // -1 逆時針（user 指定方向）
  // 蹺蹺板 z-tilt：橢圓整圈緩慢左右搖晃，左邊上→右邊下、左邊下→右邊上
  // 幅度小（半長軸大時 ±°·rx 位移很顯著，±1.5° 在 rx≈1150 仍有 ±30px）
  const COMPANY_RING_SEESAW_AMP    = 4 * Math.PI / 180; // ±4°
  const COMPANY_RING_SEESAW_PERIOD = 18;                   // 18s 一輪（緩慢搖晃）
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
  // θ → u：cumU 線性內插
  function thetaToU(theta) {
    const TWO_PI = Math.PI * 2;
    const wrapped = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
    const iFloat = wrapped / dTheta;
    const i = Math.floor(iFloat);
    const iNext = Math.min(N_SAMPLES, i + 1);
    const frac = iFloat - i;
    return cumU[i] + frac * (cumU[iNext] - cumU[i]);
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

  companyItems.forEach((item, idx) => {
    // chip 初始位置 uniform 在 arc length 上分佈（視覺均勻）；flow 用 V-parameterization（inverse-speed k=2）
    const s0 = idx * arcStep;
    const baseAngle = uToTheta(s0) - Math.PI / 2;
    const v0 = thetaToV(baseAngle + Math.PI / 2);
    item.x = cx + COMPANY_ELLIPSE_RX * Math.cos(baseAngle);
    item.y = cy + COMPANY_ELLIPSE_RY * Math.sin(baseAngle);
    item._companyRingIdx = idx;
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
  cityList.forEach((city, idx) => {
    const baseAngle = (idx / cityList.length) * Math.PI * 2;
    let attempt = 0;
    let chosen = null;
    while (attempt < CITY_INIT_MAX_RETRIES) {
      const angle0 = baseAngle + (orbitRand() - 0.5) * (Math.PI / 4.5);
      let rx = halfW * (ORBIT_RX_MIN_F + orbitRand() * (ORBIT_RX_MAX_F - ORBIT_RX_MIN_F));
      const aspect = ORBIT_ASPECT_MIN + orbitRand() * (ORBIT_ASPECT_MAX - ORBIT_ASPECT_MIN);
      let ry = rx * aspect;
      const tilt = (orbitRand() - 0.5) * 2 * ORBIT_TILT_MAX;
      ({ rx, ry } = fitTiltedEllipse(rx, ry, tilt));
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const lx0 = Math.cos(angle0) * rx;
      const ly0 = Math.sin(angle0) * ry;
      const x = cx + lx0 * cosT - ly0 * sinT;
      const y = cy + lx0 * sinT + ly0 * cosT;
      // 檢查與已 init 的 city 距離
      let tooClose = false;
      for (let j = 0; j < idx; j++) {
        const other = cityList[j];
        const dx = x - other.x, dy = y - other.y;
        if (dx * dx + dy * dy < CITY_MIN_INIT_DIST * CITY_MIN_INIT_DIST) { tooClose = true; break; }
      }
      chosen = { angle0, rx, ry, tilt, cosT, sinT, x, y };
      if (!tooClose) break;
      attempt++;
    }
    city._orbit = {
      cx, cy,
      rx: chosen.rx,
      ry: chosen.ry,
      tilt: chosen.tilt,
      cosT: chosen.cosT,
      sinT: chosen.sinT,
      angle0: chosen.angle0,
      period:     240 + orbitRand() * 360,
      dir:        orbitRand() < 0.5 ? -1 : 1,
      tOffset:    0,
      pauseStart: null,
    };
    city.x = chosen.x;
    city.y = chosen.y;
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
  const D_RELOCATE_TWEEN_DUR   = 1.2;
  // city → 同 cityKey 的關聯 items（C 工作營/產學/講座；A faculty 故意排除 — user 指定老師不跟著走）
  // 排除 B：B 鎖在中央橢圓 ring，cityKey 是假填資料只給 list view 用；跟著城市移會破壞 ring layout
  // 注意：itemMap 建在這之後（行 860）+ C items 的 _orbit 行 866 才建；timer callback 在 +10s 第一次跑時兩者都已存在
  /** @param {string} cityKey */
  function getRelatedItemsForCity(cityKey) {
    if (!cityKey) return [];
    return items.filter(it =>
      it.category === 'C' && it.cityKey === cityKey && it._orbit && it._anchor
    );
  }

  // viewport clamp margin for relocated item orbit center（user 指定 15s 變化位置不能超過 viewport）
  // item 視覺位置 = _orbit.cx ± rx（rx 30-70），margin 100 保 chip text 不切邊
  const RELOC_MARGIN = 100;

  /** 把單個 item 沿 (dx, dy) 平移 orbit center + tween anchor translate 0 → 同 city relocate 模式
   *  @param {any} item @param {number} dx @param {number} dy */
  function relocateRelatedItem(item, dx, dy) {
    if (!item._orbit || item._orbit.pauseStart != null) return;
    // 1. 平移 orbit center（tickFloat 下一幀 item 邏輯位置會跟著移 dx, dy）
    //    _initX/Y **不能**平移：anchor.style.left/top 在 scatter 時鎖定 oldInitX，transform=item.x-_initX 是 runtime offset
    //    若同步加 dx，transform 不變 → 視覺位置不變 → relocate 無效
    //    保持 _initX 不變 → tickFloat 下幀 transform 自動 +dx（item.x 增 dx, _initX 不變）→ 視覺跳 dx
    //    搭配下方 style.translate = -dx 抵銷此幀視覺跳變，再 tween translate → 0 平滑滑入新位置
    //    Viewport clamp：新 orbit center 不可超出 [margin, W-margin] × [margin, H-margin]，
    //                    若超出就縮 dx/dy 讓 cx/cy 剛好停在邊界內（不再 follow 城市完整位移，但保 chip 可見）
    const targetCx = item._orbit.cx + dx;
    const targetCy = item._orbit.cy + dy;
    const clampedCx = Math.max(RELOC_MARGIN, Math.min(W - RELOC_MARGIN, targetCx));
    const clampedCy = Math.max(RELOC_MARGIN, Math.min(H - RELOC_MARGIN, targetCy));
    const effDx = clampedCx - item._orbit.cx;
    const effDy = clampedCy - item._orbit.cy;
    item._orbit.cx = clampedCx;
    item._orbit.cy = clampedCy;
    dx = effDx;
    dy = effDy;

    // 2. 反向 offset + tween 回 0（視覺仍在原位置 → 平滑滑到新位置）
    if (item._anchor && typeof gsap !== 'undefined') {
      if (item._relocateTween) item._relocateTween.kill();
      const off = { x: -dx, y: -dy };
      item._anchor.style.translate = `${-dx}px ${-dy}px`;
      item._relocateOffsetX = -dx;
      item._relocateOffsetY = -dy;
      item._relocateTween = gsap.to(off, {
        x: 0, y: 0,
        duration: D_RELOCATE_TWEEN_DUR,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (item._anchor) item._anchor.style.translate = `${off.x.toFixed(2)}px ${off.y.toFixed(2)}px`;
          item._relocateOffsetX = off.x;
          item._relocateOffsetY = off.y;
        },
        onComplete: () => {
          if (item._anchor) item._anchor.style.translate = '';
          item._relocateOffsetX = 0;
          item._relocateOffsetY = 0;
          item._relocateTween = null;
        },
      });
    } else {
      item._relocateOffsetX = 0;
      item._relocateOffsetY = 0;
    }
  }

  const dRelocateTimer = setInterval(() => {
    if (document.hidden) return;
    cityList.forEach(city => {
      if (!city._orbit || city._orbit.pauseStart != null) return;
      // 1. snapshot 當下位置
      const oldX = city.x, oldY = city.y;

      // 2. 重抽新 orbit 參數
      let rx = halfW * (ORBIT_RX_MIN_F + orbitRand() * (ORBIT_RX_MAX_F - ORBIT_RX_MIN_F));
      const aspect = ORBIT_ASPECT_MIN + orbitRand() * (ORBIT_ASPECT_MAX - ORBIT_ASPECT_MIN);
      let ry = rx * aspect;
      const tilt = (orbitRand() - 0.5) * 2 * ORBIT_TILT_MAX;
      ({ rx, ry } = fitTiltedEllipse(rx, ry, tilt));
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const angle0 = orbitRand() * Math.PI * 2;
      const dir = orbitRand() < 0.5 ? -1 : 1;
      const tOffset = performance.now() / 1000 - floatStart;

      // 3. compute 新 orbit 在 effT=0 的位置（tickFloat 下幀算出來會是這值）
      const lx = Math.cos(angle0) * rx;
      const ly = Math.sin(angle0) * ry;
      const newX = cx + (lx * cosT - ly * sinT);
      const newY = cy + (lx * sinT + ly * cosT);

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
          ease: 'power2.inOut',
          onUpdate: () => {
            // anchor 視覺位置 + 寫進 item 上的 offset 屬性 → updateLineEndpoints 同步把線端拉過來
            if (city._anchor) city._anchor.style.translate = `${off.x.toFixed(2)}px ${off.y.toFixed(2)}px`;
            city._relocateOffsetX = off.x;
            city._relocateOffsetY = off.y;
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

      // 6. 跟城市關聯的 C item（cityKey 相符）一起平移 → user 指定除老師外，城市相關資訊也跟著走
      //    平移量 = city 新-舊位置（newX-oldX, newY-oldY），note: 上方 dx/dy 是 oldX-newX 反向，相關 item 要傳正向
      const relatedDx = newX - oldX;
      const relatedDy = newY - oldY;
      const related = getRelatedItemsForCity(city.cityKey);
      related.forEach(it => relocateRelatedItem(it, relatedDx, relatedDy));
    });
  }, D_RELOCATE_INTERVAL_MS);
  cleanupFns.push(() => {
    clearInterval(dRelocateTimer);
    cityList.forEach(city => { if (city._relocateTween) city._relocateTween.kill(); });
    items.forEach(it => { if (it._relocateTween) it._relocateTween.kill(); });
  });

  const itemMap = new Map(items.map(i => [i.id, i]));

  // ── 非城市非教師項目小型個人軌道 ─────────────────────────
  // Faculty (fc/ff) 排除：只走 _float wobble；其他類別 (co/wsg/ind/lec) 都繞自己的小軌道
  // 軌道中心 = item 自己的 scatter 位置（不繞螢幕中心，否則會打散橄欖球分佈）
  // rx/ry 小（30-70px）讓 item 在原地附近畫橢圓；tilt 全隨機；period 短一點 (40-100s) 看得到旋轉
  items.forEach(item => {
    if (item.category === 'D') return;       // 國家已經有 Saturn ring orbit
    if (item.category === 'B') return;       // 系友任職企業固定在中環橢圓，不繞個人小軌道
    const prefix = String(item.id).split('-')[0];
    if (prefix === 'fc' || prefix === 'ff') return;  // 任教教師不繞軌道，只 floating
    const orbitRx = 30 + orbitRand() * 40;   // 30..70 px
    const orbitRy = 18 + orbitRand() * 27;   // 18..45 px（略扁）
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
    anchor.style.left = `${(item.x / W) * 100}%`;
    anchor.style.top  = `${(item.y / H) * 100}%`;
    // B 企業環 chip 要中心對齊 ellipse 邊（看起來像穿過 ring 線）— 不分左右側，靠 CSS translate(-50%,-50%) 置中
    if (item.category !== 'A' && item.category !== 'B' && item.x < cx) anchor.classList.add('atlas-side-left');

    const span = document.createElement('span');
    span.className = 'atlas-name';
    span.dataset.itemId = item.id;
    span.style.color = item.color;
    // D 國家 + B 系友任職企業 都是 chip 樣式（純色底 + 對比字色）→ 都要 inline 設 background
    if ((item.category === 'D' || item.category === 'B') && item.bgColor) {
      span.style.backgroundColor = item.bgColor;
    }

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
    const cityEdge = pickBoxEdgeToCenter(cityBox, srcX, srcY);
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
  const cityLines = [];
  for (let i = 0; i < cityRing.length; i++) {
    const a = cityRing[i];
    const b = cityRing[(i + 1) % cityRing.length];
    if (a === b) continue; // 只有 1 座城市 → 跳過
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
      const gid = `atlas-city-grad-${i}`;
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
    cityLines.push({ line: lineEl, a, b, retractT: 0, hoveredEnd: null, gradient: gradientEl });
  }
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
    let aEdge = pickBoxEdgeToCenter(aBox, bCenter.x, bCenter.y);
    let bEdge = pickBoxEdgeToCenter(bBox, aCenter.x, aCenter.y);
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
  function setCityLineRetract(hoveredCity) {
    cityLines.forEach(cl => {
      let targetT = 0;
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
        gsap.to(cl, { retractT: targetT, duration: 0.5, ease: 'power2.out' });
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
  const floatStart = performance.now() / 1000;
  let floatRunning = true;
  let floatRaf = null;

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

  // 整環 seesaw（breath/deform/z-tilt）的時間軸 — hover B chip 時 freeze 整個 ring 不動
  //   ringPaused 由 pauseRingFlow / resumeRingFlow 切換，tickFloat 內用 ringSeesawT 取代 raw t
  let ringSeesawPauseStart = null;
  let ringSeesawTOffset = 0;

  function tickFloat() {
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
    const seesawXScale = breath * (1 + deform);
    const seesawYScale = breath * (1 - deform);
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
        ly = Math.sin(angle) * o.ry;
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

    // Phase 2.5: B（黑底 chip 企業）+ D（彩色 chip 國家）都動態調 z-index — 兩者皆為不透明 chip，需在分割綫切換時被/蓋過 A/C
    //   A/C 統一 z:1（CSS atlas.css 預設）；B/D 在分割綫（y=cy）以上 → z=0 鑽到下面，以下 → z=2 浮到上面
    //   visualY = item.y + _floatDy（A/C wobble 用，B/D 無 _float → 兜底 0 → visualY=item.y）
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._anchor) continue;
      if (item.category !== 'B' && item.category !== 'D') continue;
      const visualY = item.y + (item._floatDy || 0);
      const z = visualY < cy ? 0 : 2;
      if (item._lastZ !== z) {
        item._anchor.style.zIndex = String(z);
        item._lastZ = z;
      }
    }

    // Phase 3: 線端點動態挑 box 邊（兩端都當下最近，避免被 city label 擋）
    for (let i = 0; i < allLines.length; i++) {
      updateLineEndpoints(allLines[i]);
    }
    // Phase 3b: 城市間預設連線端點同步（兩端都是城市，都在 Phase 1 orbit 後位置更新）
    for (let i = 0; i < cityLines.length; i++) {
      updateCityLineEndpoints(cityLines[i]);
    }

    if (floatRunning) floatRaf = requestAnimationFrame(tickFloat);
  }
  floatRaf = requestAnimationFrame(tickFloat);

  function onVisibilityChange() {
    if (document.hidden) {
      floatRunning = false;
      if (floatRaf) { cancelAnimationFrame(floatRaf); floatRaf = null; }
    } else if (!floatRunning) {
      floatRunning = true;
      floatRaf = requestAnimationFrame(tickFloat);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  cleanupFns.push(() => {
    floatRunning = false;
    if (floatRaf) cancelAnimationFrame(floatRaf);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  // ── Hover 連動 + 細節面板 ────────────────────────────
  const nameEl = detail.querySelector('[data-atlas-detail-name]');
  const descEl = detail.querySelector('[data-atlas-detail-desc]');

  // 4 個方向的隱藏 inset（visible 區壓向各邊到 0）
  const DETAIL_HIDDEN_INSETS = [
    'inset(100% 0% 0% 0%)', // 從上方刷掉
    'inset(0% 0% 100% 0%)', // 從下方刷掉
    'inset(0% 100% 0% 0%)', // 從右方刷掉
    'inset(0% 0% 0% 100%)', // 從左方刷掉
  ];
  const DETAIL_VISIBLE_INSET = 'inset(0% 0% 0% 0%)';
  const randomHiddenInset = () => DETAIL_HIDDEN_INSETS[Math.floor(Math.random() * DETAIL_HIDDEN_INSETS.length)];

  let detailTween = null;
  /** @type {'hidden' | 'visible'} */
  let panelTarget = 'hidden';

  function fillDetailContent(item, ids) {
    // 每次出現都隨機三原色 bg + ±3° 旋轉，文字一律黑（亮三原色底→黑色內容原則）
    const bg = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
    const rot = (Math.random() * 6 - 3).toFixed(2);
    detail.style.backgroundColor = bg;
    detail.style.color = '#000000';
    detail.style.setProperty('--atlas-detail-rot', `${rot}deg`);

    if (nameEl) {
      nameEl.innerHTML = '';
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
        // 城市：desc 改列出所有相關 B/C 項目
        const related = [...ids]
          .filter(id => id !== item.id)
          .map(id => itemMap.get(id))
          .filter(Boolean);
        related.forEach(rel => {
          const row = document.createElement('div');
          const en = rel.textEn || '';
          const zh = rel.textZh && rel.textZh !== rel.textEn ? ' / ' + rel.textZh : '';
          row.textContent = en + zh;
          descEl.appendChild(row);
        });
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
            descEl.appendChild(zh);
          }
        } else {
          descEl.textContent = item.detail || '';
        }
      }
    }
  }

  // 進來新內容：先填文字 + bg + rotation。
  //   target 已是 visible（idle 或 reveal 中）→ 不動 tween，純文字 swap 撐過快速 hover
  //   target 是 hidden（idle 或 hide 中）→ 啟動 clip-in（從當前 clip-path 反向，避免重新 set 造成跳點）
  function detailRevealNew(item, ids) {
    fillDetailContent(item, ids);

    if (panelTarget === 'visible') return;

    panelTarget = 'visible';

    if (typeof gsap === 'undefined') {
      detail.style.clipPath = DETAIL_VISIBLE_INSET;
      return;
    }

    // 只有「panel 完全 hidden 且無進行中 tween」時才從隨機方向 reveal
    // 若 hide tween 進行中，保留當前 clip-path 作起點 → 平滑反轉成 reveal
    if (!detailTween) {
      gsap.set(detail, { clipPath: randomHiddenInset() });
    } else {
      detailTween.kill();
    }
    detailTween = gsap.to(detail, {
      clipPath: DETAIL_VISIBLE_INSET,
      duration: 0.3,
      ease: 'power2.out',
      onComplete: () => { detailTween = null; },
    });
  }

  function detailHide() {
    if (panelTarget === 'hidden') return;
    panelTarget = 'hidden';
    if (typeof gsap === 'undefined') {
      detail.style.clipPath = randomHiddenInset();
      return;
    }
    if (detailTween) detailTween.kill();
    detailTween = gsap.to(detail, {
      clipPath: randomHiddenInset(),
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => { detailTween = null; },
    });
  }

  cleanupFns.push(() => {
    if (detailTween && typeof detailTween.kill === 'function') detailTween.kill();
  });

  function showDetail(item, ids, lineSet) {
    content.classList.add('atlas-dimmed');
    setCityLineRetract(item.category === 'D' ? item : null);
    items.forEach(i => i._span.classList.toggle('atlas-highlight', ids.has(i.id)));
    Array.from(svg.children).forEach(line => line.classList.toggle('atlas-line-highlight', lineSet.has(line)));
    detailRevealNew(item, ids);
  }

  function clearDetail() {
    content.classList.remove('atlas-dimmed');
    setCityLineRetract(null);
    items.forEach(i => i._span.classList.remove('atlas-highlight'));
    Array.from(svg.children).forEach(line => line.classList.remove('atlas-line-highlight'));
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

    // B 企業環 chip：showDetail 顯示右下說明面板 + 自身 highlight；但 itemNeighbors / itemLines 都是空
    //   → 不會有任何連綫亮起、不會 dim 其他相關 item，只走 atlas-dimmed + 自身 atlas-highlight
    const ids = new Set([id]);
    item.groups.forEach(gid => {
      const g = groups.get(gid);
      if (g) g.members.forEach(m => ids.add(m));
    });
    itemNeighbors.get(id).forEach(n => ids.add(n));

    const lineSet = new Set(itemLines.get(id) || []);
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
  let scale = SCALE_INTRO_START;
  let tx = 0, ty = 0;
  let introTween = null;

  function applyTransform() {
    zoomEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`;
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
    if (scale <= MIN_SCALE) {
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

  if (typeof gsap !== 'undefined') {
    // intro scale tween 期間整層 GPU promote，否則 50+ chip + ring + lines 一起 scale
    // 每 frame 都得 re-rasterize → SPA 換頁剛 swap DOM 那刻特別卡
    // tween 完才關，避免長期 promote 高 zoom 時文字糊
    zoomEl.style.willChange = 'transform';
    introTween = gsap.to({ v: SCALE_INTRO_START }, {
      v: SCALE_DEFAULT,
      duration: INTRO_DURATION,
      ease: 'sine.inOut',
      onUpdate: function() {
        scale = this.targets()[0].v;
        applyTransform();
      },
      onComplete: () => {
        zoomEl.style.willChange = 'auto';
      },
    });
    cleanupFns.push(() => introTween && introTween.kill());
  } else {
    scale = SCALE_DEFAULT;
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
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
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
      scale = Math.max(MIN_SCALE, scale);
      applyTransform();
    }
    dragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartTx = tx; dragStartTy = ty;
    document.body.style.cursor = "url('/custom-cursor/drag_2.svg') 15 15, grabbing";
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

  function onResize() { clampOffsets(); applyTransform(); }
  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  // ── Filter + Layout Toggle ─────────────────────────────────────────
  const filterEl = $('#atlas-filter');
  const btns = /** @type {HTMLElement[]} */ ([...$$('.atlas-filter-btn')]);
  const selected = new Set(btns.map(b => b.dataset.filter));

  // ── Alumni career rotating chip：map view 一個（alumni filter btn 下方）、list view 一個（alumni 欄 title 下方）
  // 用 controller factory 包 state，map / list 各持一個 instance ──
  const alumniBtn = btns.find(b => b.dataset.filter === 'alumni') || null;
  // 收/展 clip：進場左→右展開、退場右→左收起（hidden 狀態 = 可見區壓在左邊 0 寬）
  const CAREER_HIDDEN_CLIP = 'inset(0% 100% 0% 0%)';
  const CAREER_VISIBLE_CLIP = 'inset(0% 0% 0% 0%)';
  // padding 自然值（與 CSS 一致）— 2-phase reveal 的 Phase 1 layout-push tween target
  const CAREER_PAD_TOP = 6;
  const CAREER_PAD_BOTTOM = 5;
  const CAREER_PAD_HORIZONTAL = 8;  // 左右各 8px（CSS padding: 6px 8px 5px）— fitWidth 計算 chip 內容寬時用

  /**
   * @param {HTMLElement} el
   * @param {HTMLElement} enEl
   * @param {HTMLElement} zhEl
   * @param {{ noFit?: boolean }} [opts] noFit=true → 跳過 fitWidth（讓 chip 用 CSS max-width 自由 wrap；給 list view label-col 用，避免每次 rotate 寬度跳動）
   */
  function createCareerController(el, enEl, zhEl, opts) {
    const noFit = !!(opts && opts.noFit);
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

    // 切下一個職業：clip-out（下→上）→ 換內容 + 換色 + 重 fit 寬度 → clip-in（上→下）
    function rotateOnce() {
      if (typeof gsap === 'undefined') return;
      idx = (idx + 1) % ALUMNI_CAREERS.length;
      if (tween) tween.kill();
      tween = gsap.to(el, {
        clipPath: CAREER_HIDDEN_CLIP,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          fill(ALUMNI_CAREERS[idx]);
          // chip clip-hidden 期間調整寬度，視覺上看不到 box 變動
          fitWidth();
          gsap.set(el, { clipPath: CAREER_HIDDEN_CLIP });
          tween = gsap.to(el, {
            clipPath: CAREER_VISIBLE_CLIP,
            duration: 0.4,
            ease: 'power2.out',
          });
        },
      });
    }

    /** @param {{ delay?: number }} [opts] */
    function show(opts) {
      if (visible) return;
      visible = true;
      idx = Math.floor(Math.random() * ALUMNI_CAREERS.length);
      fill(ALUMNI_CAREERS[idx]);
      if (typeof gsap === 'undefined') {
        el.style.height = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        fitWidth();
        el.style.clipPath = CAREER_VISIBLE_CLIP;
        return;
      }
      if (tween) tween.kill();
      // 先量寬度（要先把 padding 還原讓文字 wrap），再量自然高度
      gsap.set(el, { paddingTop: CAREER_PAD_TOP, paddingBottom: CAREER_PAD_BOTTOM });
      fitWidth();
      gsap.set(el, { height: 'auto' });
      const naturalH = el.offsetHeight;
      gsap.set(el, { height: 0, paddingTop: 0, paddingBottom: 0, clipPath: CAREER_HIDDEN_CLIP });
      // 2-phase reveal：先靜默撐 layout（alumniRow 變高 → Partners 被推下），再純 clip-path L→R wipe
      // 拆兩 phase 避免 height + clip-path 同時 anim 造成「從左上角拉出」的 diagonal pull
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        height: naturalH,
        paddingTop: CAREER_PAD_TOP,
        paddingBottom: CAREER_PAD_BOTTOM,
        duration: 0.3,
        ease: 'power2.out',
      }, 0);
      tl.to(el, {
        clipPath: CAREER_VISIBLE_CLIP,
        duration: 0.4,
        ease: 'power2.out',
      }, 0.3);
      tl.eventCallback('onComplete', () => { gsap.set(el, { height: 'auto' }); });
      tween = tl;
      if (interval) clearInterval(interval);
      interval = /** @type {any} */ (setInterval(rotateOnce, 3000));
    }

    /** @param {{ delay?: number }} [opts] */
    function hide(opts) {
      if (!visible) return;
      visible = false;
      if (interval) { clearInterval(interval); interval = null; }
      if (typeof gsap === 'undefined') {
        el.style.height = '0';
        el.style.paddingTop = '0';
        el.style.paddingBottom = '0';
        el.style.clipPath = CAREER_HIDDEN_CLIP;
        return;
      }
      if (tween) tween.kill();
      // height:auto 對 GSAP tween 不友善 → 鎖當下 px 為起點
      const currentH = el.offsetHeight;
      gsap.set(el, { height: currentH });
      // 2-phase hide：先純 clip-path R→L wipe（chip 消失），再靜默 collapse layout（Partners 上推）
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        clipPath: CAREER_HIDDEN_CLIP,
        duration: 0.4,
        ease: 'power2.in',
      }, 0);
      tl.to(el, {
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.3,
        ease: 'power2.in',
      }, 0.4);
      tween = tl;
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
  const CHIP_HIDDEN_CLIP = 'inset(0% 100% 0% 0%)';
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
      if (typeof gsap === 'undefined') {
        el.style.height = ''; el.style.paddingTop = ''; el.style.paddingBottom = ''; el.style.marginTop = ''; el.style.clipPath = CHIP_VISIBLE_CLIP;
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
      gsap.set(el, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: COLLAPSED_MARGIN_TOP, clipPath: CHIP_HIDDEN_CLIP });
      // 2-phase：先撐 layout (Partners 被推下)，再純 clip-path L→R wipe
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        height: naturalH,
        paddingTop: naturalPaddingTop,
        paddingBottom: naturalPaddingBottom,
        marginTop: naturalMarginTop,
        duration: 0.3,
        ease: 'power2.out',
      }, 0);
      tl.to(el, {
        clipPath: CHIP_VISIBLE_CLIP,
        duration: 0.4,
        ease: 'power2.out',
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
      if (typeof gsap === 'undefined') {
        el.style.height = '0'; el.style.paddingTop = '0'; el.style.paddingBottom = '0'; el.style.marginTop = COLLAPSED_MARGIN_TOP; el.style.clipPath = CHIP_HIDDEN_CLIP;
        return;
      }
      if (tween) tween.kill();
      const currentH = el.offsetHeight;
      gsap.set(el, { height: currentH });
      // 2-phase hide：先 clip-path R→L wipe（chip 消失），再 layout collapse（Partners 上推）
      const tl = gsap.timeline({ delay: (opts && opts.delay) || 0 });
      tl.to(el, {
        clipPath: CHIP_HIDDEN_CLIP,
        duration: 0.4,
        ease: 'power2.in',
      }, 0);
      tl.to(el, {
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: COLLAPSED_MARGIN_TOP,
        duration: 0.3,
        ease: 'power2.in',
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
    mapCareerCtrl = createCareerController(careerEl, careerEnEl, careerZhEl);

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
      });
    });
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
        (itemLines.get(item.id) || []).forEach(lineEl => {
          lineEl.style.display = visible ? '' : 'none';
        });
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

    if (!visible) {
      targets.forEach(item => {
        const d = Math.random() * RANGE;
        gsap.to(item._span, {
          clipPath: randomHiddenInset(),
          duration: TOTAL - d,
          delay: d,
          ease: 'power2.out',
          overwrite: true,
          onComplete: () => {
            item._anchor.classList.add('atlas-filtered-out');
            item._span.style.clipPath = '';
            (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
          },
        });
      });
    } else {
      targets.forEach(item => {
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = ''; });
        gsap.set(item._span, { clipPath: randomHiddenInset() });
        const d = Math.random() * RANGE;
        gsap.to(item._span, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: TOTAL - d,
          delay: d,
          ease: 'power2.out',
          overwrite: true,
          onComplete: () => { item._span.style.clipPath = ''; },
        });
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
    // 退場反向：employ → host → career（reverse mapSubchipCtrls 順序），career 最後收
    const reversed = mapSubchipCtrls.slice().reverse();
    reversed.forEach((c, i) => c.hide({ delay: i * stagger }));
    if (mapCareerCtrl) mapCareerCtrl.hide({ delay: reversed.length * stagger });
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
      duration: 0.2,
      ease: visible ? 'power2.out' : 'power2.in',
      overwrite: true,
      onUpdate: () => {
        const v = progress.value;
        companyRingEllipse.style.strokeDasharray = `${v} ${1 - v}`;
      },
    });
  }
  function syncCareer() {
    if (selected.has('alumni')) showCareer();
    else hideCareer();
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
  // host: name only (無副標) ≈ 50；faculty/employ: name + 1 sub ≈ 84；partners: name + 2 subs ≈ 120
  // ITEM_H_PER_CAT 為「預估值」初始 layout 用；renderListPage 跑完會 post-measure 實測 + 更新此表
  const ITEM_H_PER_CAT = /** @type {Record<string, number>} */ ({
    faculty: 84,
    host: 50,
    employ: 84,
    partners: 120,
  });

  // chevron y 由 #atlas-layout-btn top 決定 → 三欄 chevrons 永遠在同 y（不因 list 高度漂移）
  //   per-col rowsPerCol + gap 自由變化（item 矮 cat → gap 大、item 高 cat → gap 小或 row 少）
  //   item 多的 col 可能塞滿（chevron 緊貼最後 item），item 少的 col gap 拉開
  function calcListPageSize(cat) {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height').trim()) || 80;
    // 標題區佔用：titleblock chip (~31) + col gap (~16) + rotation 餘量 (~5) ≈ 52
    const TITLEBLOCK_H = 52;
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
    const containerH = chevronBottomY - headerH - 64 - TITLEBLOCK_H;
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
      if (en) {
        const enLabel = document.createElement('span');
        enLabel.className = 'atlas-list-item-label-en';
        enLabel.textContent = en;
        sub.appendChild(enLabel);
      }
      if (zh) {
        const zhLabel = document.createElement('span');
        zhLabel.className = 'atlas-list-item-label-zh';
        zhLabel.textContent = zh;
        sub.appendChild(zhLabel);
      }
      appendLine(sub);
    }

    if (cat === 'faculty' || cat === 'employ') {
      // faculty: 隨機公司名；employ: 國家
      appendSub(item._listSubEn, item._listSubZh);
    } else if (cat === 'partners') {
      // 先類型、後國家
      appendSub(item._listTypeEn, item._listTypeZh);
      appendSub(item._listCountryEn, item._listCountryZh);
    }
    // host (主持)：無副標
    wrapper.appendChild(el);
    return wrapper;
  }

  /** @param {HTMLElement} col @param {string} cat @param {number} page @param {boolean} [skipAnim] */
  function renderListPage(col, cat, page, skipAnim = false) {
    // 切頁過渡期間擋 double-click（exit 期間若再點 chevron 會抓到正在 exit 的 lines 動亂）
    if (col.dataset.transitioning === '1') return;

    const itemsEl = /** @type {HTMLElement} */ (col.querySelector('.atlas-list-col-items'));
    // partners: name + type + country = 3；host: name only = 1；其餘 (faculty/employ): name + 1 sub = 2
    const linesPerItem = cat === 'partners' ? 3 : (cat === 'host' ? 1 : 2);
    const useAnim = !skipAnim && typeof gsap !== 'undefined';
    // 先抓舊 lines（exit 動畫對象）。skipAnim 時不需要 → 跳過量測
    const existingLines = useAnim
      ? /** @type {HTMLElement[]} */ ([...itemsEl.querySelectorAll('.atlas-list-line-clip > *')])
      : [];

    const sizeInfo = calcListPageSize(cat);
    const rowsPerCol = sizeInfo.rowsPerCol;
    col.style.setProperty('--list-gap', `${sizeInfo.gap}px`);
    // 每格高度透過 CSS var 同步給 .atlas-list-item 與 .atlas-list-nav-item 的 min-height
    // → col2 nav 佔 1 個 slot，與 col1 最後一個 item 底部對齊
    col.style.setProperty('--list-item-h', `${sizeInfo.itemH}px`);

    const allItems = listGrouped[cat];
    // col1 有 rowsPerCol 個 items；col2 有 rowsPerCol - 1 個 items + 1 個 nav slot
    const itemsPerPage = rowsPerCol * 2 - 1;
    const maxPage = Math.max(0, Math.ceil(allItems.length / itemsPerPage) - 1);
    const safePage = Math.min(Math.max(0, page), maxPage);
    listPageState[cat] = safePage;

    const start = safePage * itemsPerPage;
    const pageItems = /** @type {any[]} */ (allItems).slice(start, start + itemsPerPage);

    // 抽出 build 邏輯：清空舊 DOM、塞新 sub-cols、跑 enter 動畫
    // enterDirsHint：exit 階段傳來的「反向」方向陣列，讓新 item 從舊 item 退場的反方向進場
    // chevron 切頁時保持不動（使用者要求：只在 view 切換時動，分頁切換不動）
    /** @param {(number|undefined)[]|null} enterDirsHint */
    function build(enterDirsHint) {
      itemsEl.innerHTML = ''; // clears both sub-cols

      // Sub-col 1：前 rowsPerCol 個 items
      const subCol1 = document.createElement('div');
      subCol1.className = 'atlas-list-sub-col';
      pageItems.slice(0, rowsPerCol).forEach(item => subCol1.appendChild(buildListItemEl(item, cat)));

      // Sub-col 2：後 (rowsPerCol - 1) 個 items；nav 走 absolute 定位、永遠貼 sub-col 底
      // → 不再補 empty placeholder（chevron 不靠 flex flow 撐到底部，items 數量變化不會推到它）
      const subCol2 = document.createElement('div');
      subCol2.className = 'atlas-list-sub-col';
      const col2Items = pageItems.slice(rowsPerCol);
      col2Items.forEach(item => subCol2.appendChild(buildListItemEl(item, cat)));

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
      subCol2.appendChild(navItem);

      itemsEl.appendChild(subCol1);
      itemsEl.appendChild(subCol2);

      // 主標 marquee：DOM 進入 layout 後（次幀）量寬決定是否需要 marquee
      requestAnimationFrame(() => applyListMarquee(itemsEl));

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
          ghost.querySelectorAll('.atlas-list-item').forEach(el => {
            const h = el.getBoundingClientRect().height;
            if (h > maxH) maxH = h;
          });
          listView.removeChild(ghost);
          const pre = ITEM_H_PER_CAT[cat] || 84;
          if (maxH > pre + 2) {
            ITEM_H_PER_CAT[cat] = Math.ceil(maxH);
            renderListPage(col, cat, safePage, true);
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
        { yPercent: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform', overwrite: true }
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
        duration: 0.5,
        ease: 'power3.in',
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

  // 主標 marquee 偵測：用共用 utility applyMarqueeOverflow（取代 atlas/courses-map/library-panels 三處重複）
  /** @param {HTMLElement} container */
  function applyListMarquee(container) {
    applyMarqueeOverflow(container, '.atlas-list-name-en, .atlas-list-name-zh', '.atlas-marquee-inner');
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
    listCareerCtrl = createCareerController(careerListEl, careerEnSpan, careerZhSpan);

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

  function applyListFilter() {
    // List view 固定顯示三欄；filter 只作用於 map view
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

  function applyMapFilter(animate = false) {
    const allowed = new Set();
    selected.forEach(k => (FILTER_PREFIXES[k] || []).forEach(p => allowed.add(p)));

    const toShow = [];
    const toHide = [];
    items.forEach(item => {
      if (!item._anchor) return;
      if (item.category === 'D') {
        item._anchor.classList.remove('atlas-filtered-out');
        return;
      }
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
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = ''; });
      }
    });

    if (!animate || typeof gsap === 'undefined') {
      // Init / 無 gsap：instant toggle
      toShow.forEach(item => {
        item._anchor.classList.remove('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = ''; });
      });
      toHide.forEach(item => {
        item._anchor.classList.add('atlas-filtered-out');
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
      });
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
        ease: 'power2.out',
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
      (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = ''; });
      gsap.set(item._span, { clipPath: randomHiddenInset() });
      const d = Math.random() * RANGE;
      gsap.to(item._span, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: TOTAL - d,
        delay: d,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => { item._span.style.clipPath = ''; },
      });
    });
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
  const layoutBtn = $('#atlas-layout-btn');

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

      // Section-level delays：alumni 整塊（label + host + employ）共用同 delay，視覺上「3 區塊同時進場」
      // 之前每 col idx*0.08 害 employ 比 label/host 晚 0.08 起跑、partners 又再晚 → 看起來像 4 階梯
      // 現在 faculty / alumni / partners = 0 / 0.08 / 0.16，alumni 內 3 cols 同步起跑
      const SECTION_DELAY = /** @type {Record<string, number>} */ ({
        faculty: 0,
        host: 0.08,
        employ: 0.08,
        partners: 0.16,
      });
      const ALUMNI_DELAY = SECTION_DELAY.host;
      // 每 item 預設 stagger 0.08s；用 STAGGER_WINDOW 上限壓縮 host（含 fake additions ~22 個）等多 items col
      // 確保所有 cols 進場結束時間相近（之前 host 因 items 多 + 固定 0.08 → 比其他晚 ~1.3s 才完成）
      const BASE_ITEM_STAGGER = 0.08;
      const STAGGER_WINDOW = 1.0;

      // Alumni label-col reveal：master title yPercent + career chip show() 同 alumni delay
      const masterTitleEl = /** @type {HTMLElement|null} */ (listView.querySelector('.atlas-list-group-label-col .atlas-list-col-title'));
      if (masterTitleEl) {
        gsap.fromTo(masterTitleEl,
          { yPercent: 100 },
          { yPercent: 0, duration: 0.9, delay: ALUMNI_DELAY, ease: 'power3.out', clearProps: 'transform', overwrite: true }
        );
      }
      if (listCareerCtrl) listCareerCtrl.show({ delay: ALUMNI_DELAY });

      visibleCols.forEach((col) => {
        const cat = col.dataset.category;
        const delay = SECTION_DELAY[cat] ?? 0;
        const titleEl = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-col-title'));
        if (titleEl) {
          gsap.fromTo(titleEl,
            { yPercent: 100 },
            { yPercent: 0, duration: 0.9, delay, ease: 'power3.out', clearProps: 'transform', overwrite: true }
          );
        }
        // host 1 行 / partners 3 行 / 其餘 2 行
        const linesPerItem = cat === 'partners' ? 3 : (cat === 'host' ? 1 : 2);
        const lines = /** @type {HTMLElement[]} */ ([...col.querySelectorAll('.atlas-list-line-clip > *')]);
        const navItem = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-nav-item'));
        const numItems = lines.length ? Math.ceil(lines.length / linesPerItem) : 0;
        // 壓縮 stagger：item 多時自動縮短間距，確保「最後一個 item 起跑點 ≤ col 開始 +1.0s」
        const itemStagger = numItems > 1
          ? Math.min(BASE_ITEM_STAGGER, STAGGER_WINDOW / (numItems - 1))
          : 0;
        if (lines.length) {
          // 每個 item 隨機從上方或下方滑入（item 內 lines 共用同方向）
          const itemDirs = Array.from({ length: numItems }, () => Math.random() < 0.5 ? 100 : -100);
          gsap.fromTo(lines,
            { yPercent: (/** @type {number} */ i) => itemDirs[Math.floor(i / linesPerItem)] },
            {
              yPercent: 0, duration: 0.9, delay, ease: 'power3.out', clearProps: 'transform', overwrite: true,
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
              duration: 0.9,
              delay: delay + numItems * itemStagger,
              ease: 'power3.out',
              clearProps: 'clipPath',
              overwrite: true,
            }
          );
        }
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
        ease: 'power2.out',
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
        ease: 'power2.out',  // front-loaded → 每個 item 在各自起跑點收縮，stagger 看得見
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
        ease: 'power2.out',
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
        cityLines.forEach(cl => { cl.retractT = 0; });
        scale = SCALE_DEFAULT;
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

      scale = SCALE_DEFAULT;
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
          ease: 'power2.out',
        }, d);
      });
      // cityLines 物理 draw：retractT 1→0，updateCityLineEndpoints 每幀 lerp endpoint
      // 從 t=0 起跑跨整段（與 Phase B1 spans reveal 同步起點），ease='power2.out' 與 spans reveal 同節奏
      // 避免 linear 跨整段時前半段視覺幾乎沒變化，被 spans 大幅 reveal 蓋過顯得「沒動」
      cityLines.forEach(cl => {
        introTween.to(cl, {
          retractT: 0,
          duration: REVEAL_TOTAL + HIDE_TOTAL,
          ease: 'power2.out',
          overwrite: true,
        }, 0);
      });
      // companyRingEllipse 的 draw 由 onComplete → revealFilters → syncCareer → showCareer 呼叫 animateRingEllipse(true) 處理
      //   此處不再另跑 tween，統一走 animateRingEllipse 的 dasharray progress（path-style point-to-point reveal）

      // Phase B2：cover 收掉露出文字（front-loaded ease 讓 stagger 看得見）
      const p2Start = REVEAL_TOTAL + PHASE_GAP;
      allCovers.forEach(cover => {
        const d = Math.random() * HIDE_RANGE;
        introTween.to(cover, {
          clipPath: 'inset(0% 100% 0% 0%)',
          duration: HIDE_TOTAL - d,
          ease: 'power2.out',
        }, p2Start + d);
      });
      if (allCovers.length === 0) introTween.to({}, { duration: HIDE_TOTAL }, p2Start);
    };

    // 同時退場：
    // - lines + col titles 跑 yPercent → ±100（per-element random、無 stagger）
    // - chevron 用 clip-path inset 原地收起（不平移、位置固定）
    // - career chip 跑 hide() 收 clip-path + height/padding → entrance 的反向操作（不混進 yPercent 群）
    // duration 0.6 + ease power2.in 統一；0.2 buffer 後再 finalize
    if (typeof gsap === 'undefined') {
      if (listCareerCtrl) { listCareerCtrl.destroy(); listCareerCtrl = null; }
      finalize();
      return;
    }
    // career 用 hide() 反向收（clip-path bottom→top collapse + height/padding → 0）
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
        duration: 0.6,
        ease: 'power2.in',
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
          duration: 0.6,
          ease: 'power2.in',
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
      if (currentView === 'map') switchToList();
      else switchToMap();
    });
  }

  // ── Page exit：離開 atlas 時依當下 view 跑對應退場 ─────────────
  // map view 用 switchToList 開頭的「東西消失」階段（subchip + btn collapse + cover/span hide + cityLines retract），
  // list view 用 switchToMap 退場階段（yPercent col-title + line-clip + clip-path nav-item）；
  // 兩者都不跑下游 startList / finalize，純做退場讓 router cleanup 接手
  // idle-standby root 不是 document，不註冊（idle-standby 是 overlay 非 routed page）
  if (options.root === undefined || options.root === document) {
    registerPageExit(() => {
      if (typeof gsap === 'undefined') return Promise.resolve();
      if (currentView === 'list') return playListExit();
      return playMapExit();
    });
  }

  function playMapExit() {
    return new Promise(resolve => {
      drainRevealTimers();
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
        introTween.to(cover, { clipPath: 'inset(0% 0% 0% 0%)', duration: REVEAL_TOTAL - d, ease: 'power2.out' }, d);
      });
      const p2Start = REVEAL_TOTAL;
      allSpans.forEach(span => {
        const d = Math.random() * HIDE_RANGE;
        const dir = HIDE_DIRS[Math.floor(Math.random() * 4)];
        introTween.to(span, { clipPath: dir, duration: HIDE_TOTAL - d, ease: 'power2.out' }, p2Start + d);
      });
      hideLayoutIcon({ timeline: introTween, position: 0 });
      cityLines.forEach(cl => { cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b'; });
      cityLines.forEach(cl => {
        introTween.to(cl, { retractT: 1, duration: REVEAL_TOTAL + HIDE_TOTAL, ease: 'power2.out', overwrite: true }, 0);
      });
      if (allCovers.length === 0 && allSpans.length === 0) gsap.delayedCall(0.2, resolve);
    });
  }

  function playListExit() {
    return new Promise(resolve => {
      if (listCareerCtrl) listCareerCtrl.hide();
      if (layoutBtn) layoutBtn.classList.remove('atlas-layout-revealed');
      hideLayoutIcon();
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
          duration: 0.6, ease: 'power2.in', overwrite: true, onComplete: onOne,
        });
      }
      if (navExitTargets.length > 0) {
        gsap.fromTo(navExitTargets,
          { clipPath: 'inset(0% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.6, ease: 'power2.in', overwrite: true, onComplete: onOne },
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

  // 2. 非國家 (A/C) → uniform scatter 在橢圓（橄欖球型）內
  //    B 系友任職企業 在外部 placeCompanyRing 統一指派到中環橢圓上（不在 scatter 內）
  //    Disc → ellipse 線性映射保持 uniform area 密度（Jacobian = HW × HH 為常數）
  //    Y 中心 = stage 中心 + CLUSTER_Y_BIAS（負值往上補償左下 filter 視覺重心）
  const halfW = W / 2, halfH = H / 2;
  const ELLIPSE_HW = halfW * ELLIPSE_HW_FRAC;
  const ELLIPSE_HH = halfH * ELLIPSE_HH_FRAC;
  const ellipseCY = cy + CLUSTER_Y_BIAS;
  function scatterEllipse() {
    const r = Math.sqrt(srand());          // uniform-area: r dr 權重 → r = √u
    const a = srand() * 2 * Math.PI;
    return {
      x: cx + ELLIPSE_HW * r * Math.cos(a),
      y: ellipseCY + ELLIPSE_HH * r * Math.sin(a),
    };
  }
  items.forEach(item => {
    if (item.category === 'D' || item.category === 'B') return;
    const p = scatterEllipse();
    item.x = p.x;
    item.y = p.y;
  });

  // 3. 碰撞鬆弛（A/C 互推；B 已固定在企業環，D 城市/國家走 orbit）
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.category === 'D' || b.category === 'D') continue;
        if (a.category === 'B' || b.category === 'B') continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.0001;
        if (dist < ITEM_MIN_SPACING) {
          const push = (ITEM_MIN_SPACING - dist) * 0.5;
          const px = (dx/dist) * push;
          const py = (dy/dist) * push;
          a.x -= px; a.y -= py;
          b.x += px; b.y += py;
        }
      }
    }
    items.forEach(it => {
      if (it.category === 'D' || it.category === 'B') return;
      const pad = 30;
      it.x = Math.max(pad, Math.min(W - pad, it.x));
      it.y = Math.max(pad, Math.min(H - pad, it.y));
    });
  }
}

// ── Helpers ────────────────────────────────────────────

function absURL(rel) { return new URL(rel, window.location.origin).href; }

function fetchJson(rel) {
  return fetch(absURL(rel)).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${rel}: ${r.status}`);
    return r.json();
  }).catch(e => { console.warn('[Atlas]', e.message); return null; });
}

function mulberry32(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseCities(ws) {
  const out = [];
  if (ws.cityEn || ws.cityZh) {
    const en = (ws.cityEn || '').trim();
    const zh = (ws.cityZh || '').trim();
    if (en || zh) out.push({ en, zh });
    return out;
  }
  const partsEn = (ws.location    || '').split('/').map(s => s.trim().split(',')[0].trim());
  const partsZh = (ws.location_zh || '').split('/').map(s => s.trim().split(',')[0].trim());
  const n = Math.max(partsEn.length, partsZh.length);
  for (let i = 0; i < n; i++) {
    const en = partsEn[i] || '';
    const zh = partsZh[i] || '';
    if (en || zh) out.push({ en, zh });
  }
  return out;
}
