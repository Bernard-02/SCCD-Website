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

// 確定性 seed — 改這個就能換一個固定佈局
const LAYOUT_SEED = 0xA71A5;

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

  // 顏色配置：每次 reload random 洗牌三原色，分配給三個 filter 類別（category D 永遠黑）
  const filterColors = shuffleListColors();
  items.forEach(item => {
    if (item.category === 'D') {
      item.color = COLOR_BLACK;
    } else {
      const prefix = String(item.id).split('-')[0];
      const cat = Object.keys(FILTER_PREFIXES).find(k => FILTER_PREFIXES[k].includes(prefix));
      item.color = cat ? filterColors[cat] : PRIMARY_COLORS[0];
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
  cityList.forEach((city, idx) => {
    const baseAngle = (idx / cityList.length) * Math.PI * 2;
    const angle0 = baseAngle + (orbitRand() - 0.5) * (Math.PI / 4.5);
    let rx = halfW * (ORBIT_RX_MIN_F + orbitRand() * (ORBIT_RX_MAX_F - ORBIT_RX_MIN_F));
    const aspect = ORBIT_ASPECT_MIN + orbitRand() * (ORBIT_ASPECT_MAX - ORBIT_ASPECT_MIN);
    let ry = rx * aspect;
    const tilt = (orbitRand() - 0.5) * 2 * ORBIT_TILT_MAX;   // ±45°
    ({ rx, ry } = fitTiltedEllipse(rx, ry, tilt));            // 縮到 viewport 內
    city._orbit = {
      cx, cy, rx, ry, tilt,
      cosT: Math.cos(tilt), sinT: Math.sin(tilt),
      angle0,
      period:     240 + orbitRand() * 360,
      dir:        orbitRand() < 0.5 ? -1 : 1,
      tOffset:    0,
      pauseStart: null,
    };
    // t=0 位置：先在 axis-aligned 橢圓上算 local，再用 tilt 旋轉到 world
    const lx0 = Math.cos(angle0) * rx;
    const ly0 = Math.sin(angle0) * ry;
    city.x = cx + lx0 * city._orbit.cosT - ly0 * city._orbit.sinT;
    city.y = cy + lx0 * city._orbit.sinT + ly0 * city._orbit.cosT;
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

    anchor.appendChild(span);
    fragment.appendChild(anchor);
    item._anchor = anchor;
    item._span = span;
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

  // 4) 連線：每幀動態挑「當下最靠近的 box 邊中點」（兩端都動：B/C 浮動 + 城市軌道）
  //    舊架構共享 cityEndpoint 只在 init 算一次 → 城市軌道後 endpoint 卡在原本那一邊，
  //    被 city label 自己擋住。改成 tickFloat Phase 3 重新挑邊。
  const allLines = [];
  connections.forEach(conn => {
    if (conn.fromId === 'center') return;
    const fromItem = itemMap.get(conn.fromId);
    const toItem   = itemMap.get(conn.toId);

    const lineEl = document.createElementNS(SVG_NS, 'path');
    lineEl.setAttribute('fill', 'none');
    lineEl.setAttribute('stroke', fromItem.color);
    // pathLength="1" 把 path 標準化為長度 1，讓 CSS stroke-dasharray:1 + stroke-dashoffset:1
    // 做 "draw" 動畫；端點動了 dash 計算仍以 1 為基準，不會跑掉
    lineEl.setAttribute('pathLength', '1');
    // opacity / stroke-width 一律交給 CSS .atlas-line / .atlas-line-highlight；
    // SVG presentation attr 跟 CSS transition 同時設會擋住 fade（attr 端點被視為 inline）
    lineEl.setAttribute('class', 'atlas-line');
    svg.appendChild(lineEl);

    itemLines.get(conn.fromId).push(lineEl);
    itemLines.get(conn.toId).push(lineEl);
    allLines.push({ line: lineEl, src: fromItem, city: toItem });
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
  }

  // 設個初始 d 避免首幀前線是 invisible 0-length path
  allLines.forEach(updateLineEndpoints);

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

  function showDetail(item, ids, lineSet) {
    content.classList.add('atlas-dimmed');
    items.forEach(i => i._span.classList.toggle('atlas-highlight', ids.has(i.id)));
    Array.from(svg.children).forEach(line => line.classList.toggle('atlas-line-highlight', lineSet.has(line)));

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
        descEl.textContent = item.detail || '';
      }
    }

    detail.classList.add('atlas-detail-visible');
  }

  function clearDetail() {
    content.classList.remove('atlas-dimmed');
    items.forEach(i => i._span.classList.remove('atlas-highlight'));
    Array.from(svg.children).forEach(line => line.classList.remove('atlas-line-highlight'));
    detail.classList.remove('atlas-detail-visible');
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
    const baseW = content.offsetWidth;
    const baseH = content.offsetHeight;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const maxX = Math.max(0, (baseW * scale - stageW) / 2);
    const maxY = Math.max(0, (baseH * scale - stageH) / 2);
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
    if (isIntroActive()) {
      introTween.kill();
      scale = Math.max(MIN_SCALE, scale);
      applyTransform();
    }
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

  let currentView = 'map';

  const listView = document.createElement('div');
  listView.id = 'atlas-list-view';
  main.appendChild(listView);

  // Drag-to-scroll for list view
  let listDragging = false;
  let listDragStartX = 0;
  let listScrollStart = 0;
  function onListMouseDown(e) {
    if (currentView !== 'list') return;
    listDragging = true;
    listDragStartX = e.clientX;
    listScrollStart = listView.scrollLeft;
    listView.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function onListMouseMove(e) {
    if (!listDragging) return;
    listView.scrollLeft = listScrollStart + (listDragStartX - e.clientX);
  }
  function onListMouseUp() {
    if (!listDragging) return;
    listDragging = false;
    listView.style.cursor = '';
  }
  listView.addEventListener('mousedown', onListMouseDown);
  window.addEventListener('mousemove', onListMouseMove);
  window.addEventListener('mouseup', onListMouseUp);
  cleanupFns.push(() => {
    listView.removeEventListener('mousedown', onListMouseDown);
    window.removeEventListener('mousemove', onListMouseMove);
    window.removeEventListener('mouseup', onListMouseUp);
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

  function shuffleListColors() {
    const colors = [...PRIMARY_COLORS];
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    return { faculty: colors[0], alumni: colors[1], partners: colors[2] };
  }

  function renderList() {
    listView.innerHTML = '';
    const filterRect = filterEl.getBoundingClientRect();
    listView.style.left = `${filterRect.right + 40}px`;

    items.forEach(item => {
      if (item.category === 'D') return;
      const cat = getItemCat(item);
      if (!cat) return;

      const el = document.createElement('div');
      el.className = 'atlas-list-item';
      el.dataset.category = cat;
      el.style.color = filterColors[cat];

      const nameEl = document.createElement('div');
      nameEl.className = 'atlas-list-item-name';
      if (item.textEn) {
        const en = document.createElement('span');
        en.className = 'atlas-list-name-en';
        en.textContent = item.textEn;
        nameEl.appendChild(en);
      }
      if (item.textZh && item.textZh !== item.textEn) {
        const zh = document.createElement('span');
        zh.className = 'atlas-list-name-zh';
        zh.textContent = item.textZh;
        nameEl.appendChild(zh);
      }
      el.appendChild(nameEl);

      if (cat === 'alumni' || cat === 'partners') {
        const sub = document.createElement('div');
        sub.className = 'atlas-list-item-label';
        sub.textContent = item.labelEn || '';
        el.appendChild(sub);
      }

      listView.appendChild(el);
    });
  }

  function applyListFilter() {
    /** @type {NodeListOf<HTMLElement>} */ (listView.querySelectorAll('.atlas-list-item')).forEach(el => {
      el.style.display = selected.has(el.dataset.category) ? '' : 'none';
    });
  }

  function updateFilterBtnColors() {
    btns.forEach(b => {
      const cat = b.dataset.filter;
      const color = filterColors[cat];
      const inner = /** @type {HTMLElement | null} */ (b.querySelector('.anchor-nav-inner'));
      if (!inner || !color) return;
      if (selected.has(cat)) {
        inner.style.background = color;
        inner.style.color = '#000000';
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

  function applyMapFilter() {
    const allowed = new Set();
    selected.forEach(k => (FILTER_PREFIXES[k] || []).forEach(p => allowed.add(p)));
    allLines.forEach(le => { le.line.style.display = ''; });
    items.forEach(item => {
      if (!item._anchor) return;
      if (item.category === 'D') {
        item._anchor.classList.remove('atlas-filtered-out');
        return;
      }
      const prefix = String(item.id).split('-')[0];
      const visible = allowed.has(prefix);
      item._anchor.classList.toggle('atlas-filtered-out', !visible);
      if (!visible) {
        (itemLines.get(item.id) || []).forEach(lineEl => { lineEl.style.display = 'none'; });
      }
    });
  }

  function apply() {
    btns.forEach(b => b.classList.toggle('active', selected.has(b.dataset.filter)));
    if (currentView === 'map') {
      applyMapFilter();
    } else {
      applyListFilter();
    }
    updateFilterBtnColors();
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
      apply();
    });
  });

  apply();

  // ── Layout toggle ──────────────────────────────────────────────────
  const layoutBtn = document.getElementById('atlas-layout-btn');

  function switchToList() {
    currentView = 'list';
    stage.style.display = 'none';
    clearDetail();
    renderList();
    applyListFilter();
    listView.classList.add('visible');
    updateFilterBtnColors();
    const icon = layoutBtn?.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-diagram-project';
  }

  function switchToMap() {
    currentView = 'map';
    stage.style.display = '';
    listView.classList.remove('visible');
    apply();
    const icon = layoutBtn?.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-list';
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
