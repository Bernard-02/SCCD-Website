/**
 * Floating Items
 * 在首頁背景層漂浮的元素，像宇宙中的螢火蟲
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { setSpotlightLogo } from '../ui/theme-toggle.js';
import { loadCourses } from '../pages/courses-source.js';
import { loadSummerCamp } from '../pages/summer-camp-source.js';
import { loadActivityCollection, loadPermanentExhibitions } from '../pages/activities-source.js';
import { loadOthersAlbum } from '../pages/library-album-source.js';
import { sitePath } from '../ui/site-base.js';
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { shortLibId } from '../pages/library-deeplink.js';

// 進/退場（2026-08-17 圖片卡改 clip-reveal；2026-08-19 文字卡也改 clip-reveal）：
// 圖片卡＝wrapper（overflow:hidden、自身無 transform——RAF 位移在 mover、搖擺在 rotator）當現成遮罩，
// img＋newsOverlay 同方向 ±110 滑動；文字卡＝spawnItem 量寬後包一層 overflow:hidden 遮罩，整塊 chip 同款 ±110 滑動。
// clip-path 只留給「hover 覆蓋上顏色」的 newsOverlay wipe（user 2026-08-19：只有覆蓋色那個用 clip-path）。
const FLOAT_HIDE_CLIPS = ['inset(0% 0% 100% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)'];
function randFloatHideClip() { return FLOAT_HIDE_CLIPS[Math.floor(Math.random() * FLOAT_HIDE_CLIPS.length)]; }
const FLOAT_SLIDE_HIDES = [
  { xPercent: 0, yPercent: -110 },
  { xPercent: 0, yPercent: 110 },
  { xPercent: -110, yPercent: 0 },
  { xPercent: 110, yPercent: 0 },
];
function randFloatSlideHide() { return FLOAT_SLIDE_HIDES[Math.floor(Math.random() * FLOAT_SLIDE_HIDES.length)]; }

// 桌面 16~32（依視窗面積，見 totalItems）、手機 10（< 768px）。手機減量是視覺優化，不影響桌面。
// 每次 init 時評估（原 module-load 時定案的 const：SPA 換頁不重載模組，直向載入後轉橫向會殘留桌面值）
// 桌面依視窗面積給量（user 2026-10-01「盡量讓空間都有 item、像在宇宙觀看」；同日三修「數量減少一點」45000→60000）：
// 每 ~60000px² 一張：1280×720→16、1440×900→22、1920×1080 以上封頂 32（每張 2 條常駐 3D tween，別無上限）。
function totalItems() {
  if (SCCDHelpers.isMobileLayout()) return 10;
  return Math.min(32, Math.max(16, Math.round(window.innerWidth * window.innerHeight / 60000)));
}
// 鏡頭平移（user 2026-10-01）：畫面像 camera 朝一個方向緩慢移動。卡在世界中靜止＝畫面上只隨鏡頭同速同向移動＝鏡頭等速；
//   z＝原本的單點透視（越靠畫面邊越大，同日三修「加上原本的 z 位移」）；3D 擺動保留。
// 依時間換算（px/秒）：逐幀定距會隨掉幀／高更新率螢幕忽快忽慢。隔一段時間平滑轉去新航向；單次轉幅 30°~120° → 永不掉頭。
const CAM_SPEED = 36;                           // px/秒（同日三修「再快一點」，原 24）
const CAM_TURN_SEC = [20, 40];                  // 轉向間隔（秒）
const CAM_TURN_RAD = [Math.PI / 6, Math.PI * 2 / 3];
const CAM_TURN_TAU = 2;                         // 航向指數逼近目標的時間常數（秒；≈6s 轉完，同原每幀 0.008）
let camVX = 0, camVY = 0;                       // 當前鏡頭速度（px/秒；tick 寫、spawnItem 邊緣進場讀方向）
const IMG_WIDTH = 140; // 所有圖片統一寬度，高度 auto follow 原比例（2026-05-28 從 200 減 30%）
const MAX_TEXT_WIDTH = 210; // 2026-05-28 從 300 減 30%
// 手機小一號（user 2026-09-10「大小不用太大、分佈平均」）：卡窄＋透視放大 cap 1.05（桌面 1.5）
// → 12 張在 390 寬不互擠、留白分佈才平均。桌面全不受影響。
function imgWidth() { return SCCDHelpers.isMobileLayout() ? 100 : IMG_WIDTH; }
function maxTextWidth() { return SCCDHelpers.isMobileLayout() ? 170 : MAX_TEXT_WIDTH; }
function scaleGain() { return SCCDHelpers.isMobileLayout() ? 0.45 : 0.9; }
// 單點透視（z 位移）：以畫面中心為消失點，卡中心越近中心越小（遠）、越四周越大（近）。tick 每幀與 spawn 初始共用
function perspectiveScale(cx, cy, cw, ch, gain) {
  const hx = cw / 2, hy = ch / 2;
  return 0.6 + Math.min(Math.hypot(cx - hx, cy - hy) / (Math.hypot(hx, hy) || 1), 1) * gain;
}
// 當前畫面上的卡（initFloatingItems 指派）：邊緣進場挑位置要看現有卡在哪
let liveItems = [];

// ── Pool 建立 ──────────────────────────────────────────────

// 其他 JSON 內的圖片路徑用 "../images/..." 格式（相對於 pages/），
// 首頁在站台根 → 去掉 "../" 再以站台根組絕對 URL（兼容子路徑部署）
function normalizeImagePath(src) {
  if (!src) return src;
  if (/^(https?:)?\/\//.test(src)) return src;  // Directus 等完整 URL 原樣
  return sitePath(src.replace(/^\.\.\//, ''));
}

// 活動海報 + summer-camp + library 文件/相簿封面：分四個 category 各自回傳（floating 依 category 均分、不再混為一池）。
// 不洗牌/不截斷/不重複填充——均分與去重交給 initFloatingItems 的 category 輪替邏輯。
// 2026-09-19 coming soon 拆除、恢復顯示（原 09-15 暫時隱藏 activities / admission(summer-camp) / album 三類浮卡）；
// 要再隱藏把 SHOW_ACT_CAMP_ALBUM 改 false（false 時連 fetch 都不發，files / curriculum / awards 不受影響）。
const SHOW_ACT_CAMP_ALBUM = true;
async function fetchActivityPosters() {
  const activities = [];
  const summerCamp = [];
  const files = [];
  const album = [];

  // permanent-exhibitions：改用共用 loadPermanentExhibitions（Directus activities_exhibitions_permanent 優先、失敗 fallback 本地）
  // → id/poster 跟 activities 頁渲染同源，deep-link item id 才對得上（同 workshop/lecture 慣例）。
  if (SHOW_ACT_CAMP_ALBUM) try {
    const data = await loadPermanentExhibitions('/data/permanent-exhibitions.json');
    const groups = Array.isArray(data) ? data : (data.items || data.records || []);
    groups.forEach(group => {
      const items = Array.isArray(group) ? group : (group.items || []);
      items.forEach(item => {
        if (!item.poster) return;
        const itemParam = item.id ? `&item=${item.id}` : '';
        activities.push({
          type: 'image',
          src: normalizeImagePath(item.poster),
          url: `pages/activities.html?section=exhibitions${itemParam}`,
        });
      });
    });
  } catch (_) {}

  // 已接 Directus 的扁平單一分類 collection：跟 workshop 同源用 loadActivityCollection 取 id/poster，
  // 避免像舊版直接讀 local JSON 的舊編號，跟頁面實際渲染的 id 對不上（deep-link 撈不到、退成只捲到 section）。
  const flatSources = [
    { collection: 'activities_lectures',         fallback: '/data/lectures.json',         section: 'lectures' },
    { collection: 'activities_students_present', fallback: '/data/students-present.json', section: 'students-present' },
  ];
  if (SHOW_ACT_CAMP_ALBUM) await Promise.all(flatSources.map(async (src) => {
    try {
      const data = await loadActivityCollection(src.collection, src.fallback);
      const groups = Array.isArray(data) ? data : (data.items || data.records || []);
      groups.forEach(group => {
        const items = Array.isArray(group) ? group : (group.items || []);
        items.forEach(item => {
          if (!item.poster) return;
          const itemParam = item.id ? `&item=${item.id}` : '';
          activities.push({
            type: 'image',
            src: normalizeImagePath(item.poster),
            url: `pages/activities.html?section=${src.section}${itemParam}`,
          });
        });
      });
    } catch (_) {}
  }));

  // general-activities.json 混合檔（visits / exhibitions / competitions / conferences 四類混在同檔）背後各自對應獨立 Directus collection。
  // 各自呼叫 loadActivityCollection 拿同源 id；Directus 該 collection 若還空的會 fallback 整包混合檔，
  // 用 item.category 過濾回自己這類，避免每個空 collection 各自把整包混合資料都塞進 pool（重複）。
  // ponytail: outbound/inbound 兩個 collection 都空時，兩邊 fallback 會各自撈到同一批 visits item 造成輕微重複，
  //   只是首頁裝飾用的漂浮圖池、無功能性影響，等後台任一邊填了資料就會自然收斂，不特地加 dedupe。
  const generalCats = [
    { collection: 'activities_exhibitions_special', category: 'exhibitions' },
    { collection: 'activities_competitions',        category: 'competitions' },
    { collection: 'activities_conferences',         category: 'conferences' },
    { collection: 'activities_visits_outbound',     category: 'visits' },
    { collection: 'activities_visits_inbound',      category: 'visits' },
  ];
  if (SHOW_ACT_CAMP_ALBUM) await Promise.all(generalCats.map(async ({ collection, category }) => {
    try {
      const data = await loadActivityCollection(collection, '/data/general-activities.json', { category });
      const groups = Array.isArray(data) ? data : (data.items || data.records || []);
      groups.forEach(group => {
        const items = Array.isArray(group) ? group : (group.items || []);
        items.forEach(item => {
          if (!item.poster || item.category !== category) return;
          const itemParam = item.id ? `&item=${item.id}` : '';
          activities.push({
            type: 'image',
            src: normalizeImagePath(item.poster),
            url: `pages/activities.html?section=${category}${itemParam}`,
          });
        });
      });
    } catch (_) {}
  }));

  // Workshop → activities.html?section=workshop&item={id}（同源 loadActivityCollection，id 跟 activities 頁渲染一致）
  if (SHOW_ACT_CAMP_ALBUM) try {
    const wsData = await loadActivityCollection('activities_workshops', '/data/workshops.json');
    const wsGroups = Array.isArray(wsData) ? wsData : (wsData.items || wsData.records || []);
    wsGroups.forEach(group => {
      const items = Array.isArray(group) ? group : (group.items || []);
      items.forEach(item => {
        if (!item.poster) return;
        const itemParam = item.id ? `&item=${item.id}` : '';
        activities.push({
          type: 'image',
          src: normalizeImagePath(item.poster),
          url: `pages/activities.html?section=workshop${itemParam}`,
        });
      });
    });
  } catch (_) {}

  // Summer camp → admission.html?section=summer-camp&item={id}（camp 已搬到 admission）。
  // 用 loadSummerCamp()（Directus-only + sessionStorage last-known-good）：id/poster 跟 admission 渲染一致，
  // deep-link id 才對得上（本地 json 的 SC-YYYY-NN 對不上 Directus UUID）。全失敗 throw → 下方 catch 吞、該類浮卡缺席。
  if (SHOW_ACT_CAMP_ALBUM) try {
    const campGroups = await loadSummerCamp();   // [{ year, items:[{ id, poster, ... }] }]
    campGroups.forEach(group => {
      (group.items || []).forEach(item => {
        if (!item.poster) return;
        const itemParam = item.id ? `&item=${item.id}` : '';
        summerCamp.push({
          type: 'image',
          src: normalizeImagePath(item.poster),
          url: `pages/admission.html?section=summer-camp${itemParam}`,
        });
      });
    });
  } catch (_) {}

  // Library documents（PDF）→ library.html#f-{id}；docType=contributions（收錄）不收（user 2026-10-03，其餘分類照收）
  // ⚠️ 必須跟 library files 面板「同源、同 id 規則」（同 press 浮卡）：Directus library_documents →
  //    element id = f-<row.id>、封面用後台預產 cover 欄（generate-library-covers.cjs 產）。
  //    直讀本地 library.json 的舊 id（"1"/"L-PUB-1"）跟面板 Directus row id 對不上 → 點進去不捲動、不 highlight；
  //    封面也只是舊快照 placeholder（非真封面）。Directus 失敗才 fallback 本地（此時面板也 fallback 本地，id 一致）。
  try {
    // cover 深取 filename_disk（<uuid>.<副檔名>）→ 組 CloudFront URL 繞過弱機 /assets 逾時（見 config/api.js CMS_CDN_BASE）
    const res = await fetch(`${CMS_API_BASE}/library_documents?fields=id,docType,cover.filename_disk&sort=-year,sort&limit=-1`);
    if (!res.ok) throw new Error('CMS ' + res.status);
    const rows = (await res.json())?.data;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
    rows.forEach(r => {
      const cover = r.cover?.filename_disk;
      if (cover && r.id != null && r.docType !== 'contributions') {
        files.push({ type: 'image', src: `${CMS_CDN_BASE}/${cover}`, url: `pages/library.html#f-${shortLibId(r.id)}` });
      }
    });
  } catch (_) {
    // ponytail: 本地快照沒有 docType 欄，fallback 時收錄類濾不掉；只在 CMS 掛掉時發生
    try {
      const lib = await fetch(sitePath('data/library.json')).then(r => r.json());
      lib.forEach(item => {
        if (item.cover && item.id) {
          files.push({ type: 'image', src: normalizeImagePath(item.cover), url: `pages/library.html#f-${item.id}` });
        }
      });
    } catch (_) {}
  }

  // Album → library.html#album-{id}（無 id 則只到 album panel）
  // 改用共用 loadOthersAlbum（Directus library_album 優先、失敗 fallback 本地 album-others.json）→ id 跟 album 面板同源。
  // Directus row 無 cover 欄（用 images[]），fallback 本地才有 cover → 兩者相容取 cover || images[0]。
  if (SHOW_ACT_CAMP_ALBUM) try {
    const albumGroups = await loadOthersAlbum();
    albumGroups.forEach(group => {
      (group.items || []).forEach(item => {
        const cover = item.cover || item.images?.[0];
        if (cover) {
          album.push({
            type: 'image',
            src: normalizeImagePath(cover),
            url: item.id ? `pages/library.html#album-${item.id}` : 'pages/library.html',
          });
        }
      });
    });
  } catch (_) {}

  return { activities, summerCamp, files, album };
}

// 從課程資料撈 title（導航到對應 course item，並 highlight 該項目）
// 用共用 loadCourses（Directus 為主 + 本地 fallback，見 courses-source.js）→ 跟課表同源、deep-link slug 一致。
// 資料有 3 個 program key（bfa-animation / bfa-cmd / mdes）；
// 早期版本誤用 data.bfa / data.mdes，結果 BFA 兩組課完全不會出現在首頁 pool 裡
async function fetchCourseTexts() {
  const pool = [];
  try {
    const data = await loadCourses();
    const slugify = str => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    ['bfa-animation', 'bfa-cmd', 'mdes'].forEach(program => {
      const courses = data[program] || [];
      courses.forEach(course => {
        const zh = course.titleZh;
        const en = course.titleEn;
        if (!zh && !en) return;
        const slug = en ? slugify(en) : '';
        const filter = course.type || 'required';
        const itemParam = slug ? `&item=${slug}` : '';
        const url = `pages/curriculum.html?program=${program}&filter=${filter}${itemParam}`;
        pool.push({ type: 'text', textEn: en || '', textZh: zh || '', url });
      });
    });
  } catch (_) {}
  return pool;
}

// awards title 浮動文字卡（有導航）
// ⚠️ 同 award 面板「同源、同 id 規則」：Directus library_awards → element id = a-<row.id>（見 library-panels mapDirectusAwardRow）。
//    直讀本地 records.json 的 a-YYYY-NN 舊 id 跟面板 Directus row id 對不上 → deep-link #{id} 撈不到。
//    Directus 失敗才 fallback records.json（此時面板也 fallback、id 一致）。
function buildAwardText(competition, rank, competitionEn, rankEn) {
  const zh = `${competition} ${rank}`.trim();
  const en = competitionEn ? `${rankEn || ''}, ${competitionEn}`.trim().replace(/^,\s*/, '') : '';
  return { zh, en };
}
async function fetchAwardTexts() {
  const pool = [];
  try {
    const res = await fetch(`${CMS_API_BASE}/library_awards?fields=id,country,competitionEn,competitionZh,rankEn,rankZh,ranks&sort=-year,sort&limit=-1`);
    if (!res.ok) throw new Error('CMS ' + res.status);
    const rows = (await res.json())?.data;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
    rows.forEach(r => {
      if (!r.competitionZh && !r.competitionEn) return;
      // 只顯示台灣以外的獎項。Directus country 是多選陣列（['tw']），舊 === 'tw' 對陣列永不成立
      // → 過濾靜默失效、台灣獎全進池（2026-09-16 發現）。純台灣獎排除；國際＋tw 共列的保留。
      const countries = Array.isArray(r.country) ? r.country : [r.country].filter(Boolean);
      if (countries.length && countries.every(c => c === 'tw')) return;
      const rank = r.rankZh || r.ranks?.[0]?.zh || '';
      const rankEn = r.rankEn || r.ranks?.[0]?.en || '';
      const { zh, en } = buildAwardText(r.competitionZh, rank, r.competitionEn, rankEn);
      pool.push({ type: 'text', textEn: en, textZh: zh, url: `pages/library.html${r.id != null ? `#a-${r.id}` : ''}` });
    });
    return pool;
  } catch (_) {}
  // fallback 本地 records.json（id 本就是 a-YYYY-NN，跟面板 fallback 一致）
  try {
    const data = await fetch(sitePath('data/records.json')).then(r => r.json());
    (data.records || []).forEach(yearGroup => {
      (yearGroup.items || []).forEach(item => {
        if (!item.competition) return;
        if (item.flag === 'tw') return;
        const { zh, en } = buildAwardText(item.competition, item.rank, item.competition_en, item.rank_en);
        pool.push({ type: 'text', textEn: en, textZh: zh, url: `pages/library.html${item.id ? `#${item.id}` : ''}` });
      });
    });
  } catch (_) {}
  return pool;
}

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 開場均勻鋪點：純隨機會結塊（一角一坨），改 jittered grid——切成 ~sqrt(n) 欄列、每格放一點再在格內
// 抖動（0.2~0.8 格）→ 鋪滿整個視窗又不呆板。回傳視窗座標（卡片中心），數量 = n。
function scatterPositions(n, cw, ch) {
  const cols = Math.max(1, Math.round(Math.sqrt(n * cw / ch)));
  const rows = Math.ceil(n / cols);
  const cellW = cw / cols;
  const cellH = ch / rows;
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({ x: (c + 0.2 + Math.random() * 0.6) * cellW, y: (r + 0.2 + Math.random() * 0.6) * cellH });
    }
  }
  return shuffle(pts).slice(0, n);
}

// 把一組 entry 包成 category 池：標記 _cat（給去重/均分用）+ 洗牌後配一個 cursor 輪替
function mkCat(entries, name) {
  (entries || []).forEach(e => { e._cat = name; });
  return { queue: shuffle(entries || []), cursor: 0 };
}

// ── Element 建立 ────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }

// 避免中文寡字：用 word joiner (U+2060) 黏住最後兩字，break-word 換行時不讓末字落單一行
function preventOrphan(text) {
  if (!text || text.length < 2) return text;
  return text.slice(0, -1) + '⁠' + text.slice(-1);
}

// 全局 news hover 狀態，所有 item 訂閱
const newsHoverListeners = { enter: [], leave: [] };
let newsHoverActive = false;   // 當前是否處於 news hover 態——給「hover 中才 spawn 進來的新卡」判斷用

// 全局 theme:changed listener registry（離頁時統一移除，避免 SPA 換頁累積）
const themeListeners = [];

// 訂閱 news hover：注意「hover 進行中才誕生的卡（edge-respawn thumbnail / 文字卡）」——
// 過去只 push listener、不看當前狀態 → 新卡不會補上遮蔽（user 報 bug）。訂閱當下若已在 hover 態就立刻套。
function subscribeNewsHover(enterFn, leaveFn) {
  newsHoverListeners.enter.push(enterFn);
  newsHoverListeners.leave.push(leaveFn);
  if (newsHoverActive) enterFn();
}
export function applyNewsHover() {
  // 已在遮蔽態不重跑：點 WATCH 時 chars reparent 觸發 phantom mouseenter → 圖片卡色塊重抽變色（user 2026-09-29）
  if (newsHoverActive) return;
  newsHoverActive = true;
  newsHoverListeners.enter.forEach(fn => fn());
}
export function removeNewsHover() {
  newsHoverActive = false;
  newsHoverListeners.leave.forEach(fn => fn());
}

// watch-hover 專屬遮蔽頻道（給 news marquee 訂閱）：只有 hover WATCH 卡時觸發，
// 不隨「hover 單條 news banner」（那條走 applyNewsHover 只遮浮卡池、不遮 marquee 自己）。
// 同 subscribeNewsHover：訂閱當下若已在 mask 態就立刻套（cycle 進來的新 banner 也會被遮）。
const watchMaskListeners = { enter: [], leave: [] };
let watchMaskActive = false;
export function subscribeWatchMask(enterFn, leaveFn) {
  watchMaskListeners.enter.push(enterFn);
  watchMaskListeners.leave.push(leaveFn);
  if (watchMaskActive) enterFn();
}
function applyWatchMask() {
  watchMaskActive = true;
  watchMaskListeners.enter.forEach(fn => fn());
}
function removeWatchMask() {
  watchMaskActive = false;
  watchMaskListeners.leave.forEach(fn => fn());
}


// news hover wipe overlay 的 clip-path 收/展（隨機抽一方向）；圖片卡片與文字卡片共用
const WIPE_DIRECTIONS = [
  { hidden: 'inset(100% 0 0 0)', shown: 'inset(0% 0 0 0)' },   // 從上往下
  { hidden: 'inset(0 0 100% 0)', shown: 'inset(0 0 0% 0)' },   // 從下往上
  { hidden: 'inset(0 100% 0 0)', shown: 'inset(0 0% 0 0)' },   // 從右往左
  { hidden: 'inset(0 0 0 100%)', shown: 'inset(0 0 0 0%)' },   // 從左往右
];
const randomWipe = () => WIPE_DIRECTIONS[Math.floor(Math.random() * WIPE_DIRECTIONS.length)];

// 隨機旋轉 -4° ~ 6°，排除 -1° ~ 1°
function randomRotation() {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * (1 + Math.random() * (sign < 0 ? 3 : 5)); // 負：-1~-4，正：1~6
}

// 無障礙：浮卡圖片連結是「功能圖」（連結內只有圖、無文字）→ 連結需可讀名稱。
// 依目的地給通用名（link purpose in context，符合 2.4.4 AA）；圖本身設 alt="" 當裝飾避免重複報讀。
function floatingLinkLabel(url) {
  if (url.includes('activities')) return '查看動態項目 View activity';
  if (url.includes('admission')) return '查看暑期營隊 View summer camp';
  if (url.includes('library')) return '查看檔案室項目 View library item';
  return '查看更多 View more';
}

function createImageEl(src, url, interactive = true, preImg = null) {
  const cardW = imgWidth();
  const wrapper = document.createElement(url ? 'a' : 'div');
  if (url) {
    /** @type {HTMLAnchorElement} */ (wrapper).href = url;
    wrapper.setAttribute('aria-label', floatingLinkLabel(url)); // 無障礙：功能圖連結名稱
    wrapper.style.cursor = 'var(--cursor-pointer)';
  }
  wrapper.style.cssText = `
    display: block;
    position: absolute;
    top: 0; left: 0;
    width: ${cardW}px;
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    overflow: hidden;
    transition: none;
  `;

  // preImg：edge-respawn 先 new Image() 預載好的元素，reuse＝量測時已 complete、offsetHeight 正確
  // （新建 <img> 就算 URL 已快取也不保證同步 complete → offsetHeight 可能 0 → realH 用錯 fallback）。
  const img = preImg || document.createElement('img');
  if (!preImg) img.src = src;
  img.alt = ''; // 無障礙：裝飾圖（連結名稱已在 wrapper aria-label；無連結 circle 為純裝飾）
  img.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
  `;
  img.onerror = () => { wrapper.remove(); };

  // news hover overlay（從上到下 wipe，無 blend mode）
  const newsOverlay = document.createElement('div');
  newsOverlay.style.cssText = `
    position: absolute; inset: 0;
    background: transparent;
    pointer-events: none;
    clip-path: inset(100% 0 0 0);
    transition: clip-path var(--dur-medium) var(--ease-wipe);
  `;

  wrapper.appendChild(img);

  // interactive=false：跳過 news hover wipe overlay（臨時 Coming Soon index 純展示用，不訂閱 listener）
  if (interactive) {
    // newsOverlay 放最後，蓋住 img
    wrapper.appendChild(newsOverlay);

    // 隨機選一個 wipe 方向（上/下/左/右）
    let wipe = randomWipe();
    newsOverlay.style.clipPath = wipe.hidden;

    // 訂閱 news hover 事件：每次 enter 時隨機選色
    // mode-color：用 var(--theme-fg) strict 對比，不隨機（與整體 B/W 對比 pattern 一致）
    // 退場抽新方向 wipe 出去＝下次進場的來向 → 每次四方向隨機（user 2026-10-02，同 news marquee 遮罩）
    subscribeNewsHover(() => {
      if (document.body.classList.contains('mode-color')) {
        newsOverlay.style.background = 'var(--theme-fg)';
      } else {
        newsOverlay.style.background = SCCDHelpers.getRandomAccentColor();
      }
      newsOverlay.style.clipPath = wipe.shown;
    }, () => {
      wipe = randomWipe();
      newsOverlay.style.clipPath = wipe.hidden;
    });
  }

  // slideTargets：進退場滑動對象（wrapper=遮罩；overlay 跟 img 同向滑、其自身 clip-path wipe 不受 transform 影響）
  const slideTargets = interactive ? [img, newsOverlay] : [img];
  return { el: wrapper, w: cardW, h: cardW, slideTargets }; // h 暫用卡寬，實際由圖片決定
}

function createTextEl(textEn, textZh, url) {
  const el = document.createElement(url ? 'a' : 'div');
  el.className = 'floating-text-card';   // mode 切換時字色／底色自己淡（typography.css「會動的層」段點名用）
  if (url) {
    /** @type {HTMLAnchorElement} */ (el).href = url;
    el.style.cursor = 'var(--cursor-pointer)';
  }
  const defaultColor = SCCDHelpers.getRandomAccentColor();
  const defaultTextColor = '#000';
  el.style.cssText = `
    display: inline-block;
    position: absolute;
    top: 0; left: 0;
    padding: 6px 8px 5px;
    font-weight: 700;
    line-height: var(--line-height-s);
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    white-space: nowrap;
  `;

  if (textEn) {
    const enLine = document.createElement('div');
    enLine.textContent = textEn;
    enLine.style.cssText = 'font-size: var(--font-size-s); margin-bottom: 0.15rem;';
    el.appendChild(enLine);
  }
  if (textZh) {
    const zhLine = document.createElement('div');
    zhLine.textContent = preventOrphan(textZh);
    zhLine.style.cssText = 'font-size: var(--font-size-s); line-height: var(--line-height-zh-s);';
    el.appendChild(zhLine);
  }

  // news hover 遮蓋：clip-path 從隨機方向 wipe 一塊純色蓋住文字（跟圖片卡片同款 newsOverlay，取代舊的文字色淡出）
  const newsOverlay = document.createElement('div');
  newsOverlay.style.cssText = `
    position: absolute; inset: 0;
    pointer-events: none;
    transition: clip-path var(--dur-medium) var(--ease-wipe);
  `;
  let wipe = randomWipe();
  newsOverlay.style.clipPath = wipe.hidden;
  el.appendChild(newsOverlay); // 放最後 → 蓋在文字上方

  // mode-color：對比色底 + 反色字（var(--theme-fg)/(--theme-fg-inverse) 隨 hue 翻黑白）
  // 其他模式：accent 底 + 黑字
  function setColors() {
    if (document.body.classList.contains('mode-color')) {
      el.style.background = 'var(--theme-fg)';
      el.style.color = 'var(--theme-fg-inverse)';
    } else {
      el.style.background = defaultColor;
      el.style.color = defaultTextColor;
    }
  }
  setColors();
  // 切 mode 時透過 theme:changed 重套；el 脫離 DOM 後 listener 自我清理
  function onThemeChange() {
    if (!el.isConnected) {
      window.removeEventListener('theme:changed', onThemeChange);
      return;
    }
    if (el.dataset.hovering === '1') return; // card-hover state 不蓋（news 遮蓋走獨立 overlay 不動文字色）
    setColors();
  }
  window.addEventListener('theme:changed', onThemeChange);
  themeListeners.push(onThemeChange);

  // 訂閱 news hover：純色 block 從 wipe 方向 clip-path 蓋住文字 → 整張變純色 block（圖片卡片同款）。
  // 蓋色＝卡片底色（mode-color var(--theme-fg) 隨 hue 自動翻、不必監聽 theme:changed；其他模式 accent 底色）→ 文字被同色 wipe 抹掉。
  subscribeNewsHover(() => {
    newsOverlay.style.background = document.body.classList.contains('mode-color') ? 'var(--theme-fg)' : defaultColor;
    newsOverlay.style.clipPath = wipe.shown;
  }, () => {
    wipe = randomWipe();   // 每次四方向隨機（同圖片卡）
    newsOverlay.style.clipPath = wipe.hidden;
  });

  // hover 換色：由 spawnItem 的外框（mover）hover 呼叫——判定區＝未旋轉外框，跟停住／轉正同一個觸發點
  const onHover = url ? (on) => {
    el.dataset.hovering = on ? '1' : '0';
    if (!on) { setColors(); return; }
    // mode-color：hover 反色（default 黑底白字 → 白底黑字，跟著 hue 動態翻）
    // inverse 模式：hover 變白底黑字
    // standard：hover 變黑底白字（accent → 黑）
    if (document.body.classList.contains('mode-color')) {
      el.style.background = 'var(--theme-fg-inverse)';
      el.style.color = 'var(--theme-fg)';
    } else if (document.body.classList.contains('mode-inverse')) {
      el.style.background = '#ffffff';
      el.style.color = '#000000';
    } else {
      el.style.background = '#000';
      el.style.color = '#fff';
    }
  } : null;

  return { el, w: maxTextWidth(), h: 80, onHover };
}

// IG 獨立模組，不在 floating pool 內
export function initWatchHover() {
  const watchBtn = document.getElementById('homepage-yt-card');
  if (!watchBtn) return;

  // SPA 回 index 時 watchBtn 是新的（main 內被 swap），但 body 內的舊 spotlight overlay 仍在 → 清掉
  // 不然每次回 index body 累積一個透明 overlay（pointer-events:none 不擋 click 但 DOM leak）
  document.querySelectorAll('[data-watch-spotlight]').forEach(el => el.remove());

  // 全頁暗化 overlay，中間挖洞 spotlight。
  const overlay = document.createElement('div');
  overlay.dataset.watchSpotlight = '1';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--dur-fast) ease;
    z-index: 9998;
  `;
  document.body.appendChild(overlay);

  // ⭐overlay 要掛進 <header> 內（而非 body）＝關鍵：header 是 z-9999 的 stacking context，overlay 當它子層、
  //   z-index:5 剛好夾在 nav bars（z-auto=0）之上、logo-wrapper（.z-10）之下 → overlay 自然蓋住 bars（bar 完全
  //   不動：不 hide/不 fade/不調 opacity，user 2026-09-04），logo 在 overlay 之上恆亮＝「logo 除外」。header
  //   context(9999) 整體又在 section(9998) 之上 → 同片 overlay 順帶蓋住 section（floating pool + news marquee），
  //   單層無雙重壓暗。⚠️但 header 是 async fetch 進 #site-header、initWatchHover 執行時多半還沒到 → 首次 hover 才移
  //   （lazy）；移不到（header 未載）就留在 body z-9998 當 fallback（蓋 section、蓋不到 header bars）。
  //   ⚠️靠 <header> 本身無 transform（只 bars 被 collapse 動 transform）→ position:fixed 子層才仍以 viewport 為基準、
  //   不被裁到 header box；若哪天 header 元素自身上 transform，這條會退化成只蓋 header 條、要改回純 body 掛法。
  function ensureOverlayInHeader() {
    const h = document.querySelector('#site-header header');
    if (h && overlay.parentElement !== h) { overlay.style.zIndex = '5'; h.appendChild(overlay); }
  }

  // mode／menu 鈕比照 news banner（user 2026-10-02）：一層同底色（theme-fg）遮罩 clip-path wipe 蓋掉 icon、四方向隨機進出，
  //   並把鈕列降到 overlay 後面——桌面列 relative z-50 自成 stacking context、整列（含鈕）原本浮在 overlay(z-5) 之上；
  //   降成 auto 後 logo 錨點(z-10) 仍在 overlay 上、鈕在下。header 常駐跨頁 → 遮罩 lazy 建、離頁拔。
  const btnRow = () => document.getElementById('mode-btn')?.parentElement;
  function setHeaderBtnsMasked(on) {
    ['mode-btn', 'menu-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let m = /** @type {HTMLElement|null} */ (btn.querySelector(':scope > [data-watch-btn-mask]'));
      if (!m) {
        m = document.createElement('div');
        m.dataset.watchBtnMask = '1';
        m.style.cssText = `position:absolute; inset:0; border-radius:inherit; background:var(--theme-fg); pointer-events:none; transition:clip-path var(--dur-medium) var(--ease-wipe); clip-path:${randomWipe().hidden};`;
        btn.appendChild(m);
        void m.offsetWidth;   // 藏起態先 commit，首次 wipe 才有 transition
      }
      m.style.clipPath = on ? 'inset(0 0 0 0)' : randomWipe().hidden;
    });
  }

  function updateSpotlight() {
    const rect = watchBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 用 offsetWidth（未旋轉）；getBoundingClientRect().width 是旋轉後 AABB，
    // 隨 rotation 從 W 到 W√2 變動 → 每次 spotlight 大小不同
    const r = watchBtn.offsetWidth / 2 + 8;
    overlay.style.background = `radial-gradient(circle ${r}px at ${cx}px ${cy}px, transparent 100%, rgba(0,0,0,0.85) 100%)`;
  }

  // hover 期間鎖頁面 scroll：spotlight 用 mouseenter 當下 getBoundingClientRect 的 viewport
  // 座標寫進 radial-gradient，scroll 會讓 watch 按鈕跟著 main 移位但 mask 留在 viewport 原位 → 跑位
  // isLocked guard：rapid re-enter 在 unlock setTimeout 觸發前若再次抓 body.overflow 會抓到自己鎖的
  // 'hidden'，後續 mouseleave 還原時把 hidden 寫回 → 永久鎖死。只在「首次 lock」時 snapshot
  let savedBodyOverflow = '';
  let isLocked = false;
  let unlockTimer = null;
  // rAF tracking：scroll inertia 中 hover，mouseenter → JS overflow:hidden 之間還有 in-flight
  // frames 的 scroll 推進；overlay 可見期間每 frame 重算 spotlight，把 fade-in / fade-out
  // 過渡期間的殘餘位移也吃掉
  let trackingRaf = null;
  function startTracking() {
    if (trackingRaf) return;
    function loop() {
      updateSpotlight();
      trackingRaf = requestAnimationFrame(loop);
    }
    trackingRaf = requestAnimationFrame(loop);
  }
  function stopTracking() {
    if (trackingRaf) { cancelAnimationFrame(trackingRaf); trackingRaf = null; }
  }

  watchBtn.addEventListener('mouseenter', () => {
    if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null; }
    ensureOverlayInHeader();   // header 此時已載 → 把 overlay 移進 header 蓋住 bars（idempotent）
    updateSpotlight();
    overlay.style.opacity = '1';
    applyNewsHover();
    applyWatchMask();   // 遮蔽 news marquee（rgb 方塊蓋 rgb、黑條蓋黑）
    const row = btnRow();
    if (row) row.style.zIndex = 'auto';
    setHeaderBtnsMasked(true);
    setSpotlightLogo(true);
    if (!isLocked) {
      savedBodyOverflow = document.body.style.overflow;
      isLocked = true;
    }
    document.body.style.overflow = 'hidden';
    startTracking();
  });

  watchBtn.addEventListener('mouseleave', () => {
    if (watchBtn.dataset.clickAnimating === '1') {
      // 點擊動畫期間維持 spotlight 連續，scroll lock 交給 video-player overflow 管理接手
      document.body.style.overflow = savedBodyOverflow;
      isLocked = false;
      return;
    }
    overlay.style.opacity = '0';
    removeNewsHover();
    removeWatchMask();
    setHeaderBtnsMasked(false);
    setSpotlightLogo(false);
    // overlay 有 transition: opacity 0.3s，fade-out 期間 scroll 會讓 fading 中的 spotlight
    // 在 viewport 原位 → 視覺跑位；等 fade 完才解鎖 scroll + 停 tracking（鈕列也等淡完才抬回 overlay 之上）
    unlockTimer = setTimeout(() => {
      document.body.style.overflow = savedBodyOverflow;
      isLocked = false;
      unlockTimer = null;
      stopTracking();
      const row = btnRow();
      if (row) row.style.zIndex = '';
    }, 300);
  });
  // 點擊開影片後收 spotlight（影片 overlay z-10000 蓋住 header → 鈕列直接抬回）
  watchBtn.__closeSpotlight = () => {
    overlay.style.opacity = '0';
    removeNewsHover();
    removeWatchMask();
    setHeaderBtnsMasked(false);
    setSpotlightLogo(false);
    const row = btnRow();
    if (row) row.style.zIndex = '';
  };

  // 離頁：overlay 現掛在跨 SPA 常駐的 <header> 內 → 一定要移除，否則殘留在別頁 header（雖 opacity:0 pe:none 無害、但積累）
  registerPageCleanup(() => {
    overlay.remove();
    removeWatchMask();
    document.querySelectorAll('[data-watch-btn-mask]').forEach(el => el.remove());
    setSpotlightLogo(false);
    const row = btnRow();
    if (row) row.style.zIndex = '';
  });
}

const FALLBACK_IMAGES = [
  'images/SCCD-1-4-0.jpg',
  'images/S__6742028.jpg',
  'images/Degree Show.jpg',
];

function createCircleEl() {
  // 無連結：隨機從測試圖片取一張
  const src = FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
  return createImageEl(src, null);
}

// ── Spawn & Animate ─────────────────────────────────────────

function spawnItem(container, poolEntry, fromEdge = false, preImg = null, initialPos = null) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  let elData;
  if (!poolEntry || poolEntry.type === 'circle') {
    elData = createCircleEl();
  } else if (poolEntry.type === 'image') {
    // interactive 預設 true；poolEntry.interactive === false 跳過 news hover wipe（臨時 Coming Soon index）
    elData = createImageEl(poolEntry.src, poolEntry.url, poolEntry.interactive !== false, preImg);
  } else if (poolEntry.type === 'text') {
    elData = createTextEl(poolEntry.textEn, poolEntry.textZh, poolEntry.url);
  } else {
    elData = createCircleEl();
  }

  const { el, w, h, slideTargets = null } = elData;

  let x = 0, y = 0;

  // 量真實尺寸：暫時 append 到 container
  el.style.visibility = 'hidden';
  el.style.position = 'absolute';
  container.appendChild(el);
  const textCapW = maxTextWidth();
  if (el.offsetWidth > textCapW) {
    el.style.whiteSpace = 'normal';
    el.style.wordBreak = 'break-word';
    el.style.width = `${textCapW}px`;
    // 換行後把卡片收到「實際最寬那一行」的寬度，避免固定 210px 在較短折行右側留白
    // （user 2026-06-04：floating 文字卡要 fit 文字本身寬度）。用 Range.getClientRects 量各行 box 取最大。
    let widest = 0;
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) if (rects[i].width > widest) widest = rects[i].width;
    }
    if (widest > 0) {
      const cs = getComputedStyle(el);
      const extra = cs.boxSizing === 'border-box'
        ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0;
      el.style.width = `${Math.ceil(widest) + extra}px`;
    }
  }
  const realW = el.offsetWidth || w;
  const realH = el.offsetHeight || h;
  container.removeChild(el);
  el.style.visibility = '';
  el.style.position = 'static';

  // 計算位置
  // 邊緣 spawn 要多推「縮放溢出量」：透視倍率最大 1.5＝卡片以中心放大、單邊溢出
  // (1.5-1)/2 = 0.25×尺寸。若只貼著邊（x=cw / y=-realH），第一幀 scale 一放大就露出 0.25×size 一角
  // ＝在畫面邊緣 pop（圖與文字卡都中招；user 2026-08-19 二報）。多推 OVER×尺寸讓縮放後仍完全在畫面外。
  const OVER = 0.25;
  if (fromEdge) {
    // 進場邊＝鏡頭前方（卡在畫面上以 −鏡頭速度移動；通量加權：鏡頭橫向分量大→多從左右進）。
    // 隨機挑邊會生在鏡頭後方、馬上被甩出去 cull → 空轉重生、鏡頭前方卻補不到卡。
    const rx = -camVX, ry = -camVY;
    const fluxX = Math.abs(rx) * ch, fluxY = Math.abs(ry) * cw;
    const horiz = Math.random() * (fluxX + fluxY) < fluxX;
    // 沿進場邊抽 8 個候選、取離現有卡中心最遠者＝補進空檔（user 2026-10-01「分佈可以更平均」）。卡之間已不相對移動
    //   （只隨鏡頭平移）→ 進場時的間距一路保留；舊版卡各自漂、橫越途中又洗亂，這招才只少 15% 空格。
    let bestD = -1;
    for (let k = 0; k < 8; k++) {
      const cx = horiz ? (rx > 0 ? -realW * (1 + OVER) : cw + realW * OVER) : rand(-realW, cw);
      const cy = horiz ? rand(-realH, ch) : (ry > 0 ? -realH * (1 + OVER) : ch + realH * OVER);
      let d = Infinity;
      for (const o of liveItems) d = Math.min(d, Math.hypot(o.x + o.w / 2 - cx - realW / 2, o.y + o.h / 2 - cy - realH / 2));
      if (d > bestD) { bestD = d; x = cx; y = cy; }
    }
  } else if (initialPos) {
    // 初始批：jittered-grid 中心點（見 scatterPositions）→ 開場均勻鋪滿視窗、不擠一角
    x = initialPos.x - realW / 2;
    y = initialPos.y - realH / 2;
    // 手機：初始批整張夾進視窗（邊緣半出血會讓小螢幕分佈看起來缺角；桌面不動）
    if (SCCDHelpers.isMobileLayout()) {
      x = Math.min(Math.max(x, 8), Math.max(8, cw - realW - 8));
      y = Math.min(Math.max(y, 8), Math.max(8, ch - realH - 8));
    }
  } else {
    x = rand(-realW * 0.5, cw - realW * 0.5);
    y = rand(-realH * 0.5, ch - realH * 0.5);
  }

  const rotation = randomRotation();

  // mover：負責 translate（tick 控制，無 transition）
  const mover = document.createElement('div');
  mover.style.cssText = `position:absolute; top:0; left:0; will-change:transform;`;
  // 初始 transform 就帶透視倍率（跟 tick 同式）——否則第一幀 scale 從 1 跳到實際值（邊緣 ~1.5）＝畫面邊緣「閃大一下」
  const scale0 = perspectiveScale(x + realW / 2, y + realH / 2, cw, ch, scaleGain());
  mover.style.transform = `translate(${x}px, ${y}px) scale(${scale0})`;
  // 深度排序：近（大）的蓋在遠（小）的上面（tick 隨倍率更新）——卡之間不相對移動，疊到的兩張會一路疊著走，順序錯＝遠近穿幫
  const z0 = Math.round(scale0 * 100);
  mover.style.zIndex = String(z0);

  // rotator：負責 rotateX/Y 搖擺（GSAP 控制）
  // perspective 必須設在父層才有透視效果
  const perspectiveWrap = document.createElement('div');
  perspectiveWrap.style.cssText = `perspective: 600px;`;
  const rotator = document.createElement('div');
  rotator.style.cssText = `transform-style: preserve-3d;`;

  // 文字卡（無 slideTargets）：量寬後包一層 overflow:hidden 遮罩，整塊 chip 在內滑入/滑出＝clip-reveal
  // （user 2026-08-19：文字卡進出場比照圖片卡改 clip-reveal；hover 覆蓋色的 newsOverlay 仍在 chip 內、
  //  維持自己的 clip-path wipe——「只有覆蓋上顏色的那個用 clip-path」）。量寬邏輯照舊對 chip el 操作、不受遮罩影響。
  let itemSlideTargets = slideTargets;
  let mountEl = el;
  if (!slideTargets) {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:relative; overflow:hidden; display:inline-block;';
    mask.appendChild(el);
    mountEl = mask;
    itemSlideTargets = [el];
  }
  rotator.appendChild(mountEl);
  perspectiveWrap.appendChild(rotator);
  mover.appendChild(perspectiveWrap);
  container.appendChild(mover);

  // X 和 Y 各自獨立節奏來回搖擺，範圍 -60° ~ 60°，不會看到背面
  const startY = rand(-60, 60);
  const endY   = startY > 0 ? rand(-60, -10) : rand(10, 60);
  const startX = rand(-30, 30);
  const endX   = startX > 0 ? rand(-30, -5) : rand(5, 30);
  const durY   = rand(6, 10);
  const durX   = rand(8, 13);
  const gsapTweenY = gsap.fromTo(rotator,
    { rotateY: startY },
    { rotateY: endY, duration: durY, ease: EASE.sway, yoyo: true, repeat: -1 }
  );
  const gsapTweenX = gsap.fromTo(rotator,
    { rotateX: startX },
    { rotateX: endX, duration: durX, ease: EASE.sway, yoyo: true, repeat: -1 }
  );
  const gsapTween = {
    pause:  () => { gsapTweenY.pause();  gsapTweenX.pause();  },
    resume: () => { gsapTweenY.resume(); gsapTweenX.resume(); },
  };

  // speed：鏡頭位移倍率（hover 停 0、離開漸進回 1）；z：目前寫上的深度 zIndex（tick 隨透視倍率更新）
  const item = { el: mover, x, y, w: realW, h: realH, rotation, hovered: false, speed: 1, z: z0, scale: scale0, gsapTween, rotator, card: el, slideTargets: itemSlideTargets, poolEntry };

  if (el.tagName !== 'A') {
    // 無連結卡不吃滑鼠（卡本身原就 pointer-events:none）：外框也不擋下面的卡、不觸發 hover
    mover.style.pointerEvents = 'none';
  } else {
    // hover 判定掛 mover（未旋轉的 2D 外框）不掛卡片（user 2026-10-01「有時 hover 不到這個 item」）：3D 擺動側過去時
    //   卡片投影變窄，游標落在外框內、卡片外＝打到透明的 perspectiveWrap → 卡片收不到 mouseenter。
    let swayAt = null;   // hover 暫停當下的擺動角：離開時轉回這裡再續播＝反向動畫（原 resume 從 0 瞬跳回擺動角）
    let clicked = false; // 點了＝要離頁：退場中游標移開也維持轉正／hover 態，不轉回原角度（user 2026-10-02）
    mover.addEventListener('mouseenter', () => {
      item.hovered = true;
      gsap.killTweensOf(item, 'speed');
      item.speed = 0;                  // 立刻停住（user 2026-08-28：方便點擊）
      mover.style.zIndex = '1000';     // 疊到最上層（高過所有深度排名 1~N；同時只有一張被 hover）
      if (elData.onHover) elData.onHover(true);
      if (!swayAt) {
        gsapTween.pause();
        swayAt = { x: gsap.getProperty(rotator, 'rotateX'), y: gsap.getProperty(rotator, 'rotateY') };
      }
      gsap.to(rotator, { rotateY: 0, rotateX: 0, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
    });
    mover.addEventListener('mouseleave', () => {
      if (clicked) return;
      item.hovered = false;
      mover.style.zIndex = String(item.z);
      if (elData.onHover) elData.onHover(false);
      gsap.to(item, { speed: 1, duration: DUR.fast, ease: EASE.enterSoft });   // 移動也漸進接回、不瞬間起跑
      gsap.to(rotator, {
        rotateY: swayAt.y, rotateX: swayAt.x, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto',
        onComplete: () => { swayAt = null; gsapTween.resume(); },
      });
    });
    // 外框內、卡片外的點擊（還沒轉正就點）轉給卡片連結 → router 照常攔 a[href]
    mover.addEventListener('click', (e) => {
      clicked = true;
      if (!el.contains(/** @type {Node} */ (e.target))) el.click();
    });
  }

  return item;
}

// 單張浮卡進場——**只給初始批（畫面內 spawn 的卡）**；edge-respawn 卡從畫面外漂進來、不走這裡（見 tick 註解）。
// 圖片卡與文字卡都走「slideTargets 在遮罩內滑入」（clip-reveal）。
// 圖片卡＝**等封面 img 載好才滑入**→ 修「封面比卡晚載＝clip-reveal 先跑完、圖才 pop 出」（初始批 documents 封面大／
//   首訪未快取最明顯，user 2026-08-19 報）；img 已載/快取則立即依 delay 播。文字卡無 img → 立即滑入。
// （else clip-path 分支＝理論 fallback，現無卡走到；hover 覆蓋色 newsOverlay 的 clip-path 是另一回事、不在此。）
function revealFloatItem(item, delay) {
  if (typeof gsap === 'undefined' || !item) return;
  if (item.slideTargets) {
    gsap.set(item.slideTargets, randFloatSlideHide());   // 立即藏（同步，first paint 前生效＝不閃）
    const img = item.slideTargets.find(t => t instanceof HTMLImageElement);
    // 離頁 / 離場後 img 才 load 完 → 元素已 detach，別再對殘骸 tween
    const play = () => { if (item.el && !item.el.isConnected) return; gsap.to(item.slideTargets, { xPercent: 0, yPercent: 0, duration: DUR.slow, ease: EASE.enter, delay }); };
    if (!img || (img.complete && img.naturalWidth)) play();
    else img.addEventListener('load', play, { once: true });   // 載入失敗＝createImageEl 的 onerror 會 remove 整張，不需在此補
  } else if (item.card) {
    gsap.set(item.card, { clipPath: randFloatHideClip() });
    gsap.to(item.card, { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.slow, ease: EASE.enter, delay });
  }
}

// ── Init ────────────────────────────────────────────────────

export async function initFloatingItems() {
  const container = document.getElementById('floating-layer');
  if (!container) return;

  // 六個 category 各自一池，畫面上「均分 + 不重複」（user 2026-06-28；press 已於 2026-09-04 退出首頁 pool——不渲染、不 deep-link）：
  //   activities / summer-camp / library-files（不含收錄類）/ album / curriculum / awards 等權，
  //   選位時挑「畫面上現有數量最少」的可用 category（等權 → 自動均分）。
  const [actCats, coursePool, awardPool] = await Promise.all([
    fetchActivityPosters(),
    fetchCourseTexts(),
    fetchAwardTexts(),
  ]);
  const categoryPools = {
    activities: mkCat(actCats.activities, 'activities'),
    summerCamp: mkCat(actCats.summerCamp, 'summerCamp'),
    files:      mkCat(actCats.files,      'files'),
    album:      mkCat(actCats.album,      'album'),
    curriculum: mkCat(coursePool,         'curriculum'),
    awards:     mkCat(awardPool,          'awards'),
  };
  const CATS = Object.keys(categoryPools);
  const liveCount = {};               // 每個 category 目前在畫面上的數量
  CATS.forEach(c => { liveCount[c] = 0; });
  const onScreen = new Set();         // 目前畫面上的 poolEntry（去重：同一筆不同時出現兩次）

  // 從某 category 取「目前不在畫面上」的下一筆（cursor 走到底重洗）；整池都在畫面上則回 null
  function takeFrom(cat) {
    const pool = categoryPools[cat];
    if (!pool || !pool.queue.length) return null;
    for (let tries = 0; tries < pool.queue.length; tries++) {
      if (pool.cursor >= pool.queue.length) { shuffle(pool.queue); pool.cursor = 0; }
      const entry = pool.queue[pool.cursor++];
      if (!onScreen.has(entry)) return entry;
    }
    return null;
  }

  // 挑「畫面上數量最少」且仍有可用項的 category（等權 → 均分）；都不可用回 null（退化成裝飾 circle）
  function nextEntry() {
    let bestCount = Infinity, ties = [];
    for (const cat of CATS) {
      const pool = categoryPools[cat];
      if (!pool.queue.length || liveCount[cat] >= pool.queue.length) continue;  // 空池 / 整池都已在畫面上 → 跳過
      if (liveCount[cat] < bestCount) { bestCount = liveCount[cat]; ties = [cat]; }
      else if (liveCount[cat] === bestCount) ties.push(cat);
    }
    if (!ties.length) return null;
    return takeFrom(ties[Math.floor(Math.random() * ties.length)]);
  }

  function trackSpawn(entry, fromEdge, pos = null) {
    if (entry) { onScreen.add(entry); liveCount[entry._cat]++; }
    return spawnItem(container, entry, fromEdge, null, pos);
  }

  const items = [];
  liveItems = items;   // spawnItem 邊緣進場挑空檔用（同一陣列、push/splice 即時反映）

  // 離頁後 cancelled 為 true，in-flight 的 edge-respawn 圖片預載完成時不再 spawn（避免動已棄置的 pool）
  let cancelled = false;

  // 初始化 items：nextEntry 逐筆挑最少的 category → 開場即均分、無重複；
  // 座標走 jittered grid（scatterPositions）→ 開場均勻鋪滿視窗、不擠一角
  {
    const n = totalItems();
    const positions = scatterPositions(n, container.clientWidth, container.clientHeight);
    for (let i = 0; i < n; i++) items.push(trackSpawn(nextEntry(), false, positions[i]));
  }

  // 進場：initial batch stagger 揭露——圖片卡＝img/overlay 同向滑入 wrapper 遮罩（clip-reveal）、
  // 文字卡＝clip-path（色底 chip）。揭露時 RAF 已在跑＝邊漂邊揭露。
  // base delay 0.1 讓 floating 排在 news(0.35)/iris(0.6) 之前（首頁協調進場順序）。
  function playFloatEntrance(baseDelay) {
    if (typeof gsap === 'undefined') return;
    items.forEach((item, i) => revealFloatItem(item, baseDelay + i * 0.03));
  }
  playFloatEntrance(0.1);

  // 轉向（跨矮橫向 gate）重散佈（user 2026-07-04「轉向重 run 一次內容、用手機版本調整」）：
  // 舊 items 的座標是舊視窗算的（轉向後擠一邊/溢出）→ 全部清掉、以新視窗尺寸+新 totalItems()
  // （矮橫向/手機 12、桌面 20）重生，並重播 clip 揭露。onScreen/liveCount 同步歸零＝均分邏輯從頭來。
  function respawnAll() {
    if (cancelled) return;  // 已離頁不動殘骸
    items.forEach(item => { if (item.el.parentNode) container.removeChild(item.el); });
    items.length = 0;
    onScreen.clear();
    CATS.forEach(c => { liveCount[c] = 0; });
    const n = totalItems();
    const positions = scatterPositions(n, container.clientWidth, container.clientHeight);
    for (let i = 0; i < n; i++) items.push(trackSpawn(nextEntry(), false, positions[i]));
    playFloatEntrance(0);
  }
  const rotateGateMq = window.matchMedia(SCCDHelpers.LANDSCAPE_GATE);
  const onRotateGateChange = () => requestAnimationFrame(respawnAll);
  rotateGateMq.addEventListener('change', onRotateGateChange);

  // edge-respawn：圖片卡先預載封面再 spawn。未載完的 <img height:auto> 高度＝0＝整張隱形，
  // 從畫面外漂進來時看不見，等封面下載完（常常已漂到畫面內）才「長出高度＋內容」＝從畫面中間 pop 出來
  // （user 2026-08-19 報「有新 item 是 pop 出現、不是完整從畫面外進場」）。預載後 spawnItem 拿到 img.complete、
  // 量得到正確高度、內容也現成 → 整張成形才從邊緣漂入。文字卡/無 src 直接 spawn（無載入延遲）。
  function spawnFromEdge() {
    const entry = nextEntry();
    if (!entry || entry.type !== 'image' || !entry.src) { items.push(trackSpawn(entry, true)); return; }
    onScreen.add(entry); liveCount[entry._cat]++;   // 先佔位：載入空窗期避免下一 tick 重選同一筆
    const pre = new Image();
    pre.onload = () => {
      if (cancelled) { onScreen.delete(entry); liveCount[entry._cat]--; return; }  // 已離頁
      items.push(spawnItem(container, entry, true, pre));  // reuse 預載元素＝量測 offsetHeight 正確；不走 trackSpawn（佔位已手動做）
    };
    pre.onerror = () => {
      if (cancelled) { onScreen.delete(entry); liveCount[entry._cat]--; return; }
      items.push(spawnItem(container, entry, true));  // 失敗不 reuse：讓 createImageEl 新建→onerror remove、drift 後自然 cull 釋放佔位
    };
    pre.src = entry.src;
  }

  let running = true;
  let rafId = null;

  // 鏡頭航向：用 tick 的 dt 倒數（非 setTimeout）→ 分頁隱藏／待機時跟 tick 一起自動暫停
  let camAngle = rand(0, Math.PI * 2);
  let camTarget = camAngle;
  let camTurnIn = rand(...CAM_TURN_SEC);
  let lastT = 0;   // 上一幀時間戳；0＝（重新）起跑，本幀不位移

  function tick(now) {
    if (!running) return;
    // dt 封頂 0.25s（≥4fps 都照實等速；低幀率寧可一次多走一點也不放慢）。分頁切回由 onVisibilityChange 歸零 lastT
    const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 0;
    lastT = now;
    // 待機 overlay（不透明）蓋住期間白跑 60fps、還跟待機退場的拆樹幀搶主執行緒（09-25）→
    // skip 本幀重活、loop 保持存活，退出待機自動恢復（位置凍結，蓋住看不見）
    if (document.body.classList.contains('idle-standby')) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    // 新目標從「當前航向」偏 30°~120°（上一輪早已轉完）→ 不會累加成掉頭
    if ((camTurnIn -= dt) <= 0) {
      camTarget = camAngle + (Math.random() < 0.5 ? -1 : 1) * rand(...CAM_TURN_RAD);
      camTurnIn = rand(...CAM_TURN_SEC);
    }
    camAngle += (camTarget - camAngle) * (1 - Math.exp(-dt / CAM_TURN_TAU));
    camVX = Math.cos(camAngle) * CAM_SPEED;
    camVY = Math.sin(camAngle) * CAM_SPEED;
    const stepX = camVX * dt, stepY = camVY * dt;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const gain = scaleGain();   // 每幀取一次即可（手機 cap 1.05、桌面 1.5）

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      // 卡在世界中靜止＝畫面上只反向扣鏡頭位移；hover 停住、離開漸進接回（item.speed 0→1，見 spawnItem）
      item.x -= stepX * item.speed;
      item.y -= stepY * item.speed;

      const scale = perspectiveScale(item.x + item.w / 2, item.y + item.h / 2, cw, ch, gain);
      item.el.style.transform = `translate(${item.x}px, ${item.y}px) scale(${scale})`;
      item.scale = scale;

      // 完全出畫面就 cull（縮放溢出 0.25×尺寸同 spawn 的 OVER，＋20px 餘裕讓剛生在邊緣的卡不被當場收掉）。
      // 舊的 250~500px 隱形緩衝在鏡頭平移下＝卡要多飄十幾秒才重生 → 鏡頭前方空出一整條沒卡的帶。
      const ox = item.w * 0.25 + 20;
      const oy = item.h * 0.25 + 20;
      if (
        item.x > cw + ox ||
        item.x + item.w < -ox ||
        item.y > ch + oy ||
        item.y + item.h < -oy
      ) {
        // 釋放離場那筆（從畫面集合移除）→ 它的 category 數量 -1 → 下一筆均分時可再被選回（去重：離場才解禁）
        if (item.poolEntry) { onScreen.delete(item.poolEntry); liveCount[item.poolEntry._cat]--; }
        container.removeChild(item.el);
        items.splice(i, 1);
        // edge-respawn 不做 clip-reveal（那是初始批的畫面內進場）：它從畫面外邊緣漂進來就是它的進場。
        // 但封面要先預載才 spawn（見 spawnFromEdge）——否則未載的 img 高度 0＝隱形漂入、載完才在畫面中間 pop。
        spawnFromEdge();
      }
    }

    // 深度排序跟著透視倍率走（近＝大的蓋遠＝小的），z＝倍率排名（唯一整數）。原本各自 round(scale×100)：兩張重疊卡
    // 倍率差 <0.01 時會「同分(DOM 序決勝)↔差 1」來回切＝重疊角落不停閃、像穿模（user 2026-10-03，實測 2s 互換 14 次）；
    // 排名只在倍率真的超車時才變。值變才寫、免每幀 restack；hover 中維持最上層（1000）
    items.slice().sort((a, b) => a.scale - b.scale).forEach((it, i) => {
      if (it.z !== i + 1) { it.z = i + 1; if (!it.hovered) it.el.style.zIndex = String(i + 1); }
    });

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  function onVisibilityChange() {
    if (document.hidden) {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      running = true;
      lastT = 0;   // 藏著的這段不算進鏡頭位移（否則切回第一幀補跳一大段）
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // 離頁退場：先凍住漂移 RAF（避免退場期間還在 translate），再把當前所有卡片收掉——
  // 圖片卡＝img/overlay 隨機同向滑出遮罩（clip-reveal 退場；overwrite:true 蓋掉可能還在跑的進場 reveal）；
  // 文字卡＝clip-path 收（色底 chip 語彙；fromTo 顯式起點 inset(0) 保險，即便進場 reveal 未完也不 snap）。
  registerPageExit(() => new Promise(resolve => {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (typeof gsap === 'undefined' || !items.length) { resolve(); return; }
    let done = 0;
    const onOne = () => { if (++done >= items.length) resolve(); };
    items.forEach((item, i) => {
      const delay = i * 0.02;
      if (item.slideTargets) {
        gsap.to(item.slideTargets, { ...randFloatSlideHide(), duration: DUR.medium, ease: EASE.exit, delay, overwrite: true, onComplete: onOne });
        return;
      }
      if (!item.card) { onOne(); return; }
      gsap.fromTo(item.card,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: randFloatHideClip(), duration: DUR.medium, ease: EASE.exit, delay, overwrite: true, onComplete: onOne });
    });
  }));

  // SPA 離開首頁時停 RAF + 解綁所有 listener，避免每次回首頁累積
  // （tick 對 detached DOM 空跑、visibilitychange 匿名 handler 複利、newsHoverListeners/themeListeners 無限增長）
  registerPageCleanup(() => {
    cancelled = true;
    liveItems = [];   // 放掉離頁卡片（detached DOM）參照
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    rotateGateMq.removeEventListener('change', onRotateGateChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    themeListeners.forEach(fn => window.removeEventListener('theme:changed', fn));
    themeListeners.length = 0;
    newsHoverListeners.enter.length = 0;
    newsHoverListeners.leave.length = 0;
    newsHoverActive = false;
    watchMaskListeners.enter.length = 0;
    watchMaskListeners.leave.length = 0;
    watchMaskActive = false;
  });
}
