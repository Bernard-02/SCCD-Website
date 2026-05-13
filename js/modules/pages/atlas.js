/* global gsap */
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
  { en: 'Animation directors', zh: '動畫導演' },
  { en: 'New media artists', zh: '新媒體藝術家' },
  { en: 'Creative directors', zh: '創意總監' },
  { en: 'Art directors', zh: '藝術總監' },
  { en: 'Design directors', zh: '設計總監' },
  { en: 'Graphic designers', zh: '平面設計師' },
  { en: 'Game designers', zh: '遊戲設計師' },
  { en: 'Web designers', zh: '網站設計師' },
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
  { en: 'Lead vocal of the band', zh: '樂團主唱' },
  { en: 'Polar explorer', zh: '極地探險家' },
];

// ── Filter ─────────────────────────────────────────────
// Faculty  = fc + ff（在職 + 離職教師）
// Alumni   = co（系友任職企業）
// Partners = wsg + ind + lec（工作營 / 產學合作 / 講座講者）
const FILTER_PREFIXES = {
  faculty:  ['fc', 'ff'],
  alumni:   ['co'],
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

// 從 item 當前位置回推 box 範圍（含 BOX_PADDING）
function computeBoxAt(item, x, y) {
  const w = item._boxW || 60;
  const h = item._boxH || 20;
  const isSideLeft = item._isSideLeft;
  const labelLeft  = isSideLeft ? x - w : x;
  const labelRight = isSideLeft ? x : x + w;
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

// 19 個 canonical 城市（覆蓋 workshops 解析出來的 city，避免冒出系統不認得的城市）
const CANONICAL_CITIES = [
  { en: 'Tokyo',      zh: '東京'   },
  { en: 'Kyoto',      zh: '京都'   },
  { en: 'New York',   zh: '紐約'   },
  { en: 'Shanghai',   zh: '上海'   },
  { en: 'California', zh: '加州'   },
  { en: 'Beijing',    zh: '北京'   },
  { en: 'Chiang Mai', zh: '清邁'   },
  { en: 'Bangkok',    zh: '曼谷'   },
  { en: 'Nagoya',     zh: '名古屋' },
  { en: 'Singapore',  zh: '新加坡' },
  { en: 'London',     zh: '倫敦'   },
  { en: 'Busan',      zh: '釜山'   },
  { en: 'Seoul',      zh: '首爾'   },
  { en: 'Osaka',      zh: '大阪'   },
  { en: 'Paris',      zh: '巴黎'   },
  { en: 'Taipei',     zh: '臺北'   },
  { en: 'Tainan',     zh: '臺南'   },
  { en: 'Yilan',      zh: '宜蘭'   },
  { en: 'Hualien',    zh: '花蓮'   },
];

// 城市 → ISO 兩碼 + 中文國名（list view 副標用）
const CITY_COUNTRY = {
  'Tokyo':      { iso: 'JP', countryZh: '日本'   },
  'Kyoto':      { iso: 'JP', countryZh: '日本'   },
  'Nagoya':     { iso: 'JP', countryZh: '日本'   },
  'Osaka':      { iso: 'JP', countryZh: '日本'   },
  'New York':   { iso: 'US', countryZh: '美國'   },
  'California': { iso: 'US', countryZh: '美國'   },
  'Shanghai':   { iso: 'CN', countryZh: '中國'   },
  'Beijing':    { iso: 'CN', countryZh: '中國'   },
  'Chiang Mai': { iso: 'TH', countryZh: '泰國'   },
  'Bangkok':    { iso: 'TH', countryZh: '泰國'   },
  'Singapore':  { iso: 'SG', countryZh: '新加坡' },
  'London':     { iso: 'GB', countryZh: '英國'   },
  'Busan':      { iso: 'KR', countryZh: '韓國'   },
  'Seoul':      { iso: 'KR', countryZh: '韓國'   },
  'Paris':      { iso: 'FR', countryZh: '法國'   },
  'Taipei':     { iso: 'TW', countryZh: '臺灣'   },
  'Tainan':     { iso: 'TW', countryZh: '臺灣'   },
  'Yilan':      { iso: 'TW', countryZh: '臺灣'   },
  'Hualien':    { iso: 'TW', countryZh: '臺灣'   },
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
  ind: { en: 'Industry-Academia Cooperation',  zh: '產學合作' },
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

export async function initAtlas() {
  const main = document.getElementById('atlas-main');
  if (!main) return;

  const stage   = document.getElementById('atlas-stage');
  const zoomEl  = document.getElementById('atlas-zoom');
  const content = document.getElementById('atlas-content');
  const detail  = document.getElementById('atlas-detail');
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
  const cityIndex = new Map();   // canonical city EN → cityItemId
  let idCounter = 0;
  const uid = (prefix) => `${prefix}-${++idCounter}`;

  // 預先建好 D 城市（canonical 19 個）
  CANONICAL_CITIES.forEach(c => {
    const it = {
      id: uid('city'), category: 'D',
      textEn: c.en, textZh: c.zh,
      labelEn: 'City', labelZh: '城市',
      detail: '本系師生與合作對象足跡所及之城市。',
      groups: [], cityKey: c.en,
    };
    items.push(it);
    cityIndex.set(c.en, it.id);
  });

  // canonical city 比對表（以 EN normalize / ZH 完整字串）
  const canonByEn = new Map(CANONICAL_CITIES.map(c => [c.en.toLowerCase().replace(/\s+/g, ''), c.en]));
  const canonByZh = new Map(CANONICAL_CITIES.map(c => [c.zh, c.en]));
  function matchCanonical(en, zh) {
    if (en) {
      const m = canonByEn.get(en.toLowerCase().replace(/\s+/g, ''));
      if (m) return m;
    }
    if (zh) {
      const m = canonByZh.get(zh);
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

      // 將工作營掛到對應城市的 group（hover 城市時會 highlight 該工作營全部成員）
      if (primaryCanon && cityIndex.has(primaryCanon)) {
        const cityId = cityIndex.get(primaryCanon);
        const cityItem = items.find(i => i.id === cityId);
        if (cityItem && !cityItem.groups.includes(wsGroupId)) cityItem.groups.push(wsGroupId);
        memberIds.push(cityId);
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

  if (items.length === 0) {
    console.warn('[Atlas] No items');
    return;
  }

  // 假資料 fallback：B/C 缺 city 的隨機 assign canonical city
  if (USE_FAKE_CITY_FILL) {
    const fakeRand = mulberry32(LAYOUT_SEED ^ 0x9E3779B1);
    items.forEach(it => {
      if ((it.category === 'B' || it.category === 'C') && !it.cityKey) {
        const idx = Math.floor(fakeRand() * CANONICAL_CITIES.length);
        it.cityKey = CANONICAL_CITIES[idx].en;
      }
    });
  }

  // 套用 type-numbered placeholder（D 城市保留真名）
  if (USE_TYPE_PLACEHOLDER) {
    const counters = {};
    items.forEach(it => {
      if (it.category === 'D') return;
      const prefix = String(it.id).split('-')[0];
      const tpl = TYPED_LABELS[prefix];
      if (!tpl) return;
      counters[prefix] = (counters[prefix] || 0) + 1;
      const n = counters[prefix];
      it.textEn = `${tpl.en} ${n}`;
      it.textZh = `${tpl.zh} ${n}`;
    });
  }

  // ── List view 副標資料（seeded，跨 reload 穩定）─────────
  // faculty: 隨機公司名 / alumni: 城市+國家 / partners: 類型+國家
  const listRand = mulberry32(LAYOUT_SEED ^ 0xC0FFEE);
  const cityKeysAll = Object.keys(CITY_COUNTRY);
  const canonZhByEn = new Map(CANONICAL_CITIES.map(c => [c.en, c.zh]));
  items.forEach(item => {
    if (item.category === 'D') return;
    const prefix = String(item.id).split('-')[0];
    const cat = Object.keys(FILTER_PREFIXES).find(k => FILTER_PREFIXES[k].includes(prefix));
    if (cat === 'faculty') {
      const c = FAKE_COMPANIES[Math.floor(listRand() * FAKE_COMPANIES.length)];
      item._listSubEn = c.en;
      item._listSubZh = c.zh;
    } else if (cat === 'alumni') {
      const cityEn = item.cityKey;
      const meta = CITY_COUNTRY[cityEn];
      const cityZh = canonZhByEn.get(cityEn) || cityEn;
      if (meta) {
        item._listSubEn = `${cityEn}, ${meta.iso}`;
        item._listSubZh = `${meta.countryZh}${cityZh}`;
      }
    } else if (cat === 'partners') {
      const type = PARTNER_TYPES[prefix];
      if (type) {
        item._listTypeEn = type.en;
        item._listTypeZh = type.zh;
      }
      let cityEn = item.cityKey;
      if (!cityEn) cityEn = cityKeysAll[Math.floor(listRand() * cityKeysAll.length)];
      const meta = CITY_COUNTRY[cityEn];
      const cityZh = canonZhByEn.get(cityEn) || cityEn;
      if (meta) {
        item._listCountryEn = `${cityEn}, ${meta.iso}`;
        item._listCountryZh = `${meta.countryZh}${cityZh}`;
      }
    }
  });

  // 顏色配置：城市 = 黑字 + 隨機三原色 chip 底；其他 item 每個獨立隨機挑三原色（連線 stroke 沿用 item.color）
  items.forEach(item => {
    if (item.category === 'D') {
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
  const ORBIT_RX_MIN_F   = 0.85;              // 環內緣（不再有靠中心的小軌道）
  const ORBIT_RX_MAX_F   = 1.15;              // 環外緣（窄範圍 = 環厚度）
  const ORBIT_ASPECT_MIN = 0.45;              // 防扁軌道穿過中心
  const ORBIT_ASPECT_MAX = 0.55;
  const ORBIT_TILT_MAX   = Math.PI / 16;      // ±~11° 共平面
  const ORBIT_BBOX_W_MAX = halfW * 1.35;      // 橫向 bbox cap（保留溢出空間）
  const ORBIT_BBOX_H_MAX = halfH * 1.15;      // 縱向 bbox cap

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

  const itemMap = new Map(items.map(i => [i.id, i]));

  // ── 非城市非教師項目小型個人軌道 ─────────────────────────
  // Faculty (fc/ff) 排除：只走 _float wobble；其他類別 (co/wsg/ind/lec) 都繞自己的小軌道
  // 軌道中心 = item 自己的 scatter 位置（不繞螢幕中心，否則會打散橄欖球分佈）
  // rx/ry 小（30-70px）讓 item 在原地附近畫橢圓；tilt 全隨機；period 短一點 (40-100s) 看得到旋轉
  items.forEach(item => {
    if (item.category === 'D') return;       // 城市已經有 Saturn ring orbit
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
  // 只保留 B/C → D city 的線。中心連線（center → A/B/C）全部移除：
  // - A 老師完全沒線，純 floating 文字
  // - B/C 只有「指向所屬城市」的一條線
  items.forEach(item => {
    if ((item.category === 'B' || item.category === 'C') && item.cityKey && cityIndex.has(item.cityKey)) {
      const cityId = cityIndex.get(item.cityKey);
      connections.push({ fromId: item.id, toId: cityId });
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

  console.log(`[Atlas] ${items.length} items (${countByCategory(items)}), ${connections.length} lines`);

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
    if (item.category !== 'A' && item.x < cx) anchor.classList.add('atlas-side-left');

    const span = document.createElement('span');
    span.className = 'atlas-name';
    span.dataset.itemId = item.id;
    span.style.color = item.color;
    if (item.category === 'D' && item.bgColor) {
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

    if (item.category !== 'D') {
      const dur = 3.5 + srand() * 4;
      item._float = {
        tx:       srand() * 14 - 7,
        ty:       srand() * 14 - 7,
        baseRot:  srand() * 6 - 3,
        rotDelta: srand() * 6 - 3,
        dur,
        phase:    srand() * dur * 2,
      };
      span.style.transform = `translateY(-50%) rotate(${item._float.baseRot.toFixed(2)}deg)`;
    }

    // View 切換動畫用 cover 層：absolute inset:0 蓋住 span box，bg = item 主色（非 D = item.color；D = bgColor）
    // 預設 clip-path inset(0% 100% 0% 0%) 隱藏 → idle 不可見；switchToList/switchToMap 期間動 clip-path 蓋住/退開文字
    // DOM 順序放最後 = 絕對定位天然蓋在前面 in-flow 文字上方
    const cover = document.createElement('span');
    cover.className = 'atlas-name-cover';
    cover.style.backgroundColor = item.category === 'D' ? (item.bgColor || PRIMARY_COLORS[0]) : item.color;
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
    const srcX = src.x + (src._floatDx || 0);
    const srcY = src.y + (src._floatDy || 0);
    const cityBox = computeBoxAt(city, city.x, city.y);
    const cityEdge = pickClosestBoxPoint(getBoxPoints(cityBox), srcX, srcY);
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
    const aBox = computeBoxAt(a, a.x, a.y);
    const bBox = computeBoxAt(b, b.x, b.y);
    let aEdge = pickClosestBoxPoint(getBoxPoints(aBox), b.x, b.y);
    let bEdge = pickClosestBoxPoint(getBoxPoints(bBox), a.x, a.y);
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

  function tickFloat() {
    const t = performance.now() / 1000 - floatStart;

    // Phase 1: 城市軌道（傾斜橢圓；hover 時 pauseStart 凍結）
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._orbit) continue;
      const o = item._orbit;
      const effT = o.pauseStart != null ? (o.pauseStart - o.tOffset) : (t - o.tOffset);
      const angle = o.angle0 + (effT / o.period) * Math.PI * 2 * o.dir;
      // axis-aligned 橢圓 local 座標 → 用 tilt 旋轉到 world
      const lx = Math.cos(angle) * o.rx;
      const ly = Math.sin(angle) * o.ry;
      item.x = o.cx + lx * o.cosT - ly * o.sinT;
      item.y = o.cy + lx * o.sinT + ly * o.cosT;
      const ddx = item.x - item._initX;
      const ddy = item.y - item._initY;
      item._anchor.style.transform = `translate(${ddx.toFixed(2)}px, ${ddy.toFixed(2)}px)`;
    }

    // Phase 2: B/C label 浮動（只動 span transform；快取 _floatDx/Dy 給 Phase 3 用）
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item._float) continue;
      const f = item._float;
      const cycleLen = f.dur * 2;
      const cyclePos = ((t + f.phase) % cycleLen + cycleLen) % cycleLen;
      let p = cyclePos < f.dur ? cyclePos / f.dur : 2 - cyclePos / f.dur;
      p = p * p * (3 - 2 * p);  // smoothstep ease in-out
      const dx = f.tx * p, dy = f.ty * p, dRot = f.baseRot + f.rotDelta * p;
      item._span.style.transform = `translateY(-50%) translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${dRot.toFixed(2)}deg)`;
      item._floatDx = dx;
      item._floatDy = dy;
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

  function onMouseOver(e) {
    if (isIntroActive()) return;   // 進場動畫期間不響應 hover
    const span = e.target && e.target.closest && e.target.closest('.atlas-name');
    if (!span) return;
    const fromSpan = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (span === fromSpan) return;

    // 從前一個 city span 離開時恢復其軌道
    if (fromSpan) {
      const prev = itemMap.get(fromSpan.dataset.itemId);
      if (prev && prev.category === 'D') resumeCityOrbit(prev);
    }

    const id = span.dataset.itemId;
    const item = itemMap.get(id);
    if (!item) return;

    const ids = new Set([id]);
    item.groups.forEach(gid => {
      const g = groups.get(gid);
      if (g) g.members.forEach(m => ids.add(m));
    });
    itemNeighbors.get(id).forEach(n => ids.add(n));

    const lineSet = new Set(itemLines.get(id) || []);
    showDetail(item, ids, lineSet);

    // hover 城市時暫停其軌道
    if (item.category === 'D') pauseCityOrbit(item);
  }

  function onMouseOut(e) {
    const fromSpan = e.target && e.target.closest && e.target.closest('.atlas-name');
    const toSpan   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (fromSpan && !toSpan) {
      clearDetail();
      // 離開 atlas-name 區域，恢復離開的 city 軌道
      const prev = itemMap.get(fromSpan.dataset.itemId);
      if (prev && prev.category === 'D') resumeCityOrbit(prev);
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
    introTween = gsap.to({ v: SCALE_INTRO_START }, {
      v: SCALE_DEFAULT,
      duration: INTRO_DURATION,
      ease: 'sine.inOut',
      onUpdate: function() {
        scale = this.targets()[0].v;
        applyTransform();
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
    document.body.style.cursor = 'grabbing';
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
  const filterEl = document.getElementById('atlas-filter');
  const btns = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.atlas-filter-btn')]);
  const selected = new Set(btns.map(b => b.dataset.filter));

  // ── Alumni career rotating chip（插在 alumni btn 後當 sibling flex item）──
  const alumniBtn = btns.find(b => b.dataset.filter === 'alumni') || null;
  /** @type {HTMLElement | null} */
  let careerEl = null;
  /** @type {HTMLElement | null} */
  let careerEnEl = null;
  /** @type {HTMLElement | null} */
  let careerZhEl = null;
  let careerIdx = 0;
  /** @type {number | null} */
  let careerInterval = null;
  let careerTween = null;
  let careerVisible = false;
  const CAREER_HIDDEN_INSETS = [
    'inset(100% 0% 0% 0%)',
    'inset(0% 0% 100% 0%)',
    'inset(0% 100% 0% 0%)',
    'inset(0% 0% 0% 100%)',
  ];
  const randomCareerHiddenInset = () => CAREER_HIDDEN_INSETS[Math.floor(Math.random() * CAREER_HIDDEN_INSETS.length)];

  if (alumniBtn) {
    careerEl = document.createElement('div');
    careerEl.className = 'atlas-alumni-career';
    careerEnEl = document.createElement('span');
    careerEnEl.className = 'atlas-alumni-career-en';
    careerZhEl = document.createElement('span');
    careerZhEl.className = 'atlas-alumni-career-zh';
    careerEl.appendChild(careerEnEl);
    careerEl.appendChild(careerZhEl);
    alumniBtn.insertAdjacentElement('afterend', careerEl);
  }

  function fillCareer(career) {
    if (!careerEnEl || !careerZhEl || !careerEl) return;
    careerEnEl.textContent = career.en;
    careerZhEl.textContent = career.zh;
    careerEl.style.backgroundColor = PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
  }

  // 切下一個職業：clip-out → 換內容 + 換色 → clip-in（每 3s 由 careerInterval 觸發一次）
  function rotateCareerOnce() {
    if (!careerEl || typeof gsap === 'undefined') return;
    careerIdx = (careerIdx + 1) % ALUMNI_CAREERS.length;
    if (careerTween) careerTween.kill();
    const targetEl = careerEl;
    careerTween = gsap.to(targetEl, {
      clipPath: randomCareerHiddenInset(),
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        fillCareer(ALUMNI_CAREERS[careerIdx]);
        gsap.set(targetEl, { clipPath: randomCareerHiddenInset() });
        careerTween = gsap.to(targetEl, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.4,
          ease: 'power2.out',
        });
      },
    });
  }

  function showCareer() {
    if (!careerEl || careerVisible) return;
    careerVisible = true;
    careerIdx = Math.floor(Math.random() * ALUMNI_CAREERS.length);
    fillCareer(ALUMNI_CAREERS[careerIdx]);
    // 跟著 alumni btn 的 .anchor-nav-inner rotation 一起轉（一起的視覺）
    if (alumniBtn) {
      const inner = /** @type {HTMLElement | null} */ (alumniBtn.querySelector('.anchor-nav-inner'));
      careerEl.style.transform = inner && inner.style.transform ? inner.style.transform : '';
    }
    if (typeof gsap === 'undefined') {
      careerEl.style.clipPath = 'inset(0% 0% 0% 0%)';
      return;
    }
    if (careerTween) careerTween.kill();
    gsap.set(careerEl, { clipPath: randomCareerHiddenInset() });
    careerTween = gsap.to(careerEl, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.4,
      ease: 'power2.out',
    });
    if (careerInterval) clearInterval(careerInterval);
    careerInterval = /** @type {any} */ (setInterval(rotateCareerOnce, 3000));
  }

  function hideCareer() {
    if (!careerEl || !careerVisible) return;
    careerVisible = false;
    if (careerInterval) { clearInterval(careerInterval); careerInterval = null; }
    if (typeof gsap === 'undefined') {
      careerEl.style.clipPath = randomCareerHiddenInset();
      return;
    }
    if (careerTween) careerTween.kill();
    careerTween = gsap.to(careerEl, {
      clipPath: randomCareerHiddenInset(),
      duration: 0.3,
      ease: 'power2.in',
    });
  }

  function syncCareer() {
    if (selected.has('alumni')) showCareer();
    else hideCareer();
  }

  cleanupFns.push(() => {
    if (careerInterval) clearInterval(careerInterval);
    if (careerTween) careerTween.kill();
  });

  // 星雲 intro zoom 完成後才依序加 .atlas-filter-revealed 觸發 clip-path wipe
  // → 與 switchToMap 一致：主視覺先、UI chrome 後，避免並行搶注意力
  // CSS 已設 clip-path: inset(0 100% 0 0) 初始隱藏，避免 init await 期間閃現
  const STAGGER = 100;
  const revealTimers = /** @type {number[]} */ ([]);
  const revealFilters = () => {
    btns.forEach((btn, i) => {
      const t = setTimeout(() => {
        if (btn.isConnected) btn.classList.add('atlas-filter-revealed');
      }, i * STAGGER);
      revealTimers.push(t);
    });
    // 等所有 btn revealed 後再 sync career（alumni 為 default active 即會 reveal）
    const totalT = btns.length * STAGGER + 100;
    const syncT = /** @type {any} */ (setTimeout(syncCareer, totalT));
    revealTimers.push(syncT);
  };
  if (introTween) {
    // GSAP tween .then() = onComplete promise；intro 已完成則 resolve 立刻 fire
    introTween.then(revealFilters);
  } else {
    revealFilters();
  }
  cleanupFns.push(() => {
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
  const listGrouped = /** @type {Record<string, object[]>} */ ({ faculty: [], alumni: [], partners: [] });
  const listPageState = /** @type {Record<string, number>} */ ({ faculty: 0, alumni: 0, partners: 0 });

  function calcListPageSize(cat) {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height').trim()) || 80;
    const containerH = window.innerHeight - headerH - 64 - 84;
    // 副標 12px line-height 1.3 → 每行 ~15.6px；name 14.4px × 1.3 → 每行 ~18.7px
    // faculty/alumni: name(37) + margin(2) + label(31) + padding(10) ≈ 84
    // partners: name(37) + margin(2) + label(31) + margin(6) + label(31) + padding(10) ≈ 120
    const itemH = cat === 'partners' ? 120 : 84;
    const rowsPerCol = Math.max(3, Math.floor(containerH / itemH));
    const leftover = Math.max(0, containerH - (rowsPerCol * itemH));
    const gap = rowsPerCol > 1 ? leftover / (rowsPerCol - 1) : 0; // 將剩餘高度平均分配給間隙
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

    if (cat === 'faculty' || cat === 'alumni') {
      // faculty: 隨機公司名；alumni: 城市 + 國家
      appendSub(item._listSubEn, item._listSubZh);
    } else if (cat === 'partners') {
      // 先類型、後國家
      appendSub(item._listTypeEn, item._listTypeZh);
      appendSub(item._listCountryEn, item._listCountryZh);
    }
    wrapper.appendChild(el);
    return wrapper;
  }

  /** @param {HTMLElement} col @param {string} cat @param {number} page @param {boolean} [skipAnim] */
  function renderListPage(col, cat, page, skipAnim = false) {
    // 切頁過渡期間擋 double-click（exit 期間若再點 chevron 會抓到正在 exit 的 lines 動亂）
    if (col.dataset.transitioning === '1') return;

    const itemsEl = /** @type {HTMLElement} */ (col.querySelector('.atlas-list-col-items'));
    const linesPerItem = cat === 'partners' ? 3 : 2;
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
      prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
      prevBtn.disabled = safePage <= 0;
      prevBtn.addEventListener('click', () => renderListPage(col, cat, safePage - 1));

      const nextBtn = document.createElement('button');
      nextBtn.className = 'atlas-list-nav-btn';
      nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
      nextBtn.disabled = safePage >= maxPage;
      nextBtn.addEventListener('click', () => renderListPage(col, cat, safePage + 1));

      navItem.appendChild(prevBtn);
      navItem.appendChild(nextBtn);
      subCol2.appendChild(navItem);

      itemsEl.appendChild(subCol1);
      itemsEl.appendChild(subCol2);

      // 主標 marquee：DOM 進入 layout 後（次幀）量寬決定是否需要 marquee
      requestAnimationFrame(() => applyListMarquee(itemsEl));

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

  // 主標 marquee 偵測：仿 library.css runMarqueeOverflow pattern
  // 雙 .marquee-copy seamless loop + CSS hover animation + 動態 duration（80px/s, min 3s）
  /** @param {HTMLElement} container */
  function applyListMarquee(container) {
    const rows = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.atlas-list-name-en, .atlas-list-name-zh')]);
    rows.forEach(row => {
      const inner = /** @type {HTMLElement|null} */ (row.querySelector('.atlas-marquee-inner'));
      if (!inner) return;
      // 重置：page 切換重 render 時，inner 可能已被改成 dual-copy
      row.classList.remove('is-overflow');
      if (inner.children.length === 2 && inner.firstElementChild?.classList.contains('marquee-copy')) {
        inner.innerHTML = /** @type {HTMLElement} */ (inner.firstElementChild).textContent || '';
      }
      const overflow = inner.scrollWidth - row.offsetWidth;
      if (overflow > 0) {
        row.classList.add('is-overflow');
        const text = inner.textContent || '';
        inner.innerHTML = `<span class="marquee-copy">${text}</span><span class="marquee-copy">${text}</span>`;
        const copy = /** @type {HTMLElement|null} */ (inner.querySelector('.marquee-copy'));
        const copyWidth = copy ? copy.getBoundingClientRect().width : 0;
        row.style.setProperty('--marquee-distance', `-${copyWidth}px`);
        row.style.setProperty('--marquee-duration', `${Math.max(3, copyWidth / 80)}s`);
      }
    });
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
      if (cat && listGrouped[cat]) listGrouped[cat].push(item);
    });

    const CAT_LABELS = {
      faculty:  { en: 'Professors',     zh: '歷屆教師' },
      alumni:   { en: 'Alumni Careers', zh: '系友職涯' },
      partners: { en: 'Partners',       zh: '合作單位' },
    };

    Object.keys(FILTER_PREFIXES).forEach(cat => {
      const label = CAT_LABELS[cat];
      const col = document.createElement('div');
      col.className = 'atlas-list-col';
      col.dataset.category = cat;

      // 欄標題（黑底白字，英上中下，隨機旋轉）— 仿 hero-title-wrapper：
      // wrapper 負責 rotate + overflow:hidden（yPercent slide-in 遮罩），title 本體做 yPercent 動畫
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'atlas-list-col-title-wrapper';
      titleWrapper.style.transform = `rotate(${randDeg()}deg)`;
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
      titleWrapper.appendChild(titleEl);
      col.appendChild(titleWrapper);

      // itemsEl：直接作為 overflow:hidden 容器，內含 2 個 sub-col
      const itemsEl = document.createElement('div');
      itemsEl.className = 'atlas-list-col-items';
      col.appendChild(itemsEl);

      listView.appendChild(col);
      renderListPage(col, cat, listPageState[cat] || 0, true);
    });
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
      const visible = allowed.has(prefix);
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
      }
      apply(true);
    });
  });

  apply();

  // ── Layout toggle ──────────────────────────────────────────────────
  const layoutBtn = document.getElementById('atlas-layout-btn');

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
      const icon = layoutBtn?.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-diagram-project';

      if (typeof gsap === 'undefined') return;

      // Per-column 仿 hero-title reveal：每行（title / 各副標）各自 overflow:hidden + yPercent:100→0
      // title wrapper 在 col 層級獨立 reveal；item 內每行 .atlas-list-line-clip 由 line-stagger
      // 控制 title 先、副標後、然後下一個 item
      const visibleCols = [.../** @type {NodeListOf<HTMLElement>} */ (listView.querySelectorAll('.atlas-list-col'))]
        .filter(col => col.style.display !== 'none');
      visibleCols.forEach((col, colIdx) => {
        const delay = colIdx * 0.08;
        const titleEl = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-col-title'));
        if (titleEl) {
          gsap.fromTo(titleEl,
            { yPercent: 100 },
            { yPercent: 0, duration: 0.9, delay, ease: 'power3.out', clearProps: 'transform', overwrite: true }
          );
        }
        const cat = col.dataset.category;
        const linesPerItem = cat === 'partners' ? 3 : 2;
        const lines = /** @type {HTMLElement[]} */ ([...col.querySelectorAll('.atlas-list-line-clip > *')]);
        const navItem = /** @type {HTMLElement|null} */ (col.querySelector('.atlas-list-nav-item'));
        const numItems = lines.length ? Math.ceil(lines.length / linesPerItem) : 0;
        if (lines.length) {
          // 每個 item 隨機從上方或下方滑入（item 內 lines 共用同方向）
          const itemDirs = Array.from({ length: numItems }, () => Math.random() < 0.5 ? 100 : -100);
          gsap.fromTo(lines,
            { yPercent: (/** @type {number} */ i) => itemDirs[Math.floor(i / linesPerItem)] },
            {
              yPercent: 0, duration: 0.9, delay, ease: 'power3.out', clearProps: 'transform', overwrite: true,
              stagger: (/** @type {number} */ i) => Math.floor(i / linesPerItem) * 0.08 + (i % linesPerItem) * 0.05,
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
              delay: delay + numItems * 0.08,
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
    // - filter wipe out
    // - Phase 1：所有 cover clip-path 由左→右揭露成 chip（隨機起跑，duration = TOTAL - delay → 同時結束）
    // - Phase 2：所有 span clip-path 由左→右收掉（chip + 文字一起消失）+ cityLines stroke-dashoffset 0→1 點對點 erase
    //   stagger 範圍 RANGE 拉大讓「先後散開」更明顯
    btns.forEach(b => b.classList.remove('atlas-filter-revealed'));
    hideCareer();
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
    // cityLines 收回：用 retractT 物理收縮 endpoint（沿用 hover retract pattern）
    // tickFloat 的 updateCityLineEndpoints 每幀依 cl.retractT + cl.hoveredEnd lerp endpoint
    // 從 t=0（phase 1 cover reveal 同步）就開始收，跨整個 exit 動畫到 phase 2 結束
    // ease='linear' 等速收：避免 power2.in 把大部分動作擠到最後 25%，造成「前面卡著、最後一刻直接不見」
    // overwrite:true 防止 clearDetail() 觸發的 setCityLineRetract 反向 tween 拉扯
    cityLines.forEach(cl => {
      cl.hoveredEnd = Math.random() < 0.5 ? 'a' : 'b';
    });
    cityLines.forEach(cl => {
      introTween.to(cl, {
        retractT: 1,
        duration: REVEAL_TOTAL + HIDE_TOTAL,
        ease: 'linear',
        overwrite: true,
      }, 0);
    });
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
      const icon = layoutBtn?.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-list';

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
          // Filter wipe in
          const STAGGER = 100;
          btns.forEach((btn, i) => {
            setTimeout(() => { if (btn.isConnected) btn.classList.add('atlas-filter-revealed'); }, i * STAGGER);
          });
          // 等所有 btn revealed 後 sync career（alumni 仍 active 則 reveal）
          setTimeout(syncCareer, btns.length * STAGGER + 100);
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
      // 從 t=0（phase B1 span reveal 同步）開始 draw，跨整個 entry 到 phase B2 結束
      // ease='linear' 等速 draw，避免線條早早幾乎全長然後尾巴拖過 phase B2 才補完
      cityLines.forEach(cl => {
        introTween.to(cl, {
          retractT: 0,
          duration: REVEAL_TOTAL + HIDE_TOTAL,
          ease: 'linear',
          overwrite: true,
        }, 0);
      });

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
    // duration 0.6 + ease power2.in 統一；0.2 buffer 後再 finalize
    if (typeof gsap === 'undefined') {
      finalize();
      return;
    }
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

  // 2. 非城市 (A/B/C) → uniform scatter 在橢圓（橄欖球型）內
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
    if (item.category === 'D') return;
    const p = scatterEllipse();
    item.x = p.x;
    item.y = p.y;
  });

  // 3. 碰撞鬆弛（所有非城市互推；scatter 已 uniform，鬆弛只是消除局部 overlap）
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.category === 'D' || b.category === 'D') continue;
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
      if (it.category === 'D') return;
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

function countByCategory(items) {
  const c = { A: 0, B: 0, C: 0, D: 0 };
  items.forEach(i => { c[i.category]++; });
  return `A:${c.A} B:${c.B} C:${c.C} D:${c.D}`;
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
