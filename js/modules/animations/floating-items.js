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
import { CMS_API_BASE, cdnUrl } from '../../config/api.js';
import { shortLibId } from '../pages/library-deeplink.js';
import { revealHidden } from '../ui/scroll-animate.js';

// 進/退場（2026-08-17 圖片卡改 clip-reveal；2026-08-19 文字卡也改 clip-reveal）：
// 圖片卡＝wrapper（overflow:hidden、自身無 transform——RAF 位移在 mover、搖擺在 rotator）當現成遮罩，
// img＋newsOverlay 同方向 ±110 滑動；文字卡＝spawnItem 量寬後包一層 overflow:hidden 遮罩，整塊 chip 同款 ±110 滑動。
// clip-path 只留給「hover 覆蓋上顏色」的 newsOverlay wipe（user 2026-08-19：只有覆蓋色那個用 clip-path）。
const FLOAT_HIDE_CLIPS = ['inset(0% 0% 100% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)'];
function randFloatHideClip() { return FLOAT_HIDE_CLIPS[Math.floor(Math.random() * FLOAT_HIDE_CLIPS.length)]; }

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
const LEAD_MIN = CAM_SPEED * 0.2;               // 卡朝畫面內 ≥ 這速度的邊才算進場邊（太平行＝卡在畫面外爬很久進不來）
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
// 卡中心到「看得見的邊」的半寬／半高：透視倍率 s ＋ 3D 擺動投影外擴（perspective 600、Y±60°/X±30° 近側被放大，
// 實算最多約 0.09×長邊，取 0.1）。進場外推與出場收卡共用——只算倍率時大張直式海報會在邊緣先露一截（10-19 實測 22px）
function visHalf(w, h, s) {
  const pad = 0.1 * Math.max(w, h);
  return [s * (w / 2 + pad), s * (h / 2 + pad)];
}

// ── Pool 建立 ──────────────────────────────────────────────

// 其他 JSON 內的圖片路徑用 "../images/..." 格式（相對於 pages/），
// 首頁在站台根 → 去掉 "../" 再以站台根組絕對 URL（兼容子路徑部署）
function normalizeImagePath(src) {
  if (!src) return src;
  if (/^(https?:)?\/\//.test(src)) return src;  // Directus 等完整 URL 原樣
  return sitePath(src.replace(/^\.\.\//, ''));
}

// 全部跟各頁「同源、同 id 規則」走共用 loader → deep-link item id 才對得上；後台是唯一來源，失敗＝該類缺席。
const ACTIVITY_POSTER_SOURCES = [
  { load: () => loadPermanentExhibitions(),                          section: 'exhibitions' },
  { load: () => loadActivityCollection('activities_lectures'),         section: 'lectures' },
  { load: () => loadActivityCollection('activities_students_present'), section: 'students-present' },
  ...[
    ['activities_exhibitions_special', 'exhibitions'],
    ['activities_competitions',        'competitions'],
    ['activities_conferences',         'conferences'],
    ['activities_visits_outbound',     'visits'],
    ['activities_visits_inbound',      'visits'],
  ].map(([collection, category]) => ({ load: () => loadActivityCollection(collection, { category }), section: category })),
  { load: () => loadActivityCollection('activities_workshops'),        section: 'workshop' },
];

// year-grouped [{ year, items }] → 有 poster 的 item 轉成飄浮圖（url 帶 &item=<id> 給 deep-link）
function postersOf(groups, pageUrl) {
  const out = [];
  (Array.isArray(groups) ? groups : []).forEach(g => (g.items || []).forEach(item => {
    if (item.poster) out.push({ type: 'image', src: normalizeImagePath(item.poster), url: `${pageUrl}${item.id ? `&item=${item.id}` : ''}` });
  }));
  return out;
}

// 活動海報 + summer-camp + library 文件/相簿封面：分四個 category 各自回傳（floating 依 category 均分、不再混為一池）。
// 不洗牌/不截斷/不重複填充——均分與去重交給 initFloatingItems 的 category 輪替邏輯。
// 2026-09-19 coming soon 拆除、恢復顯示（原 09-15 暫時隱藏 activities / admission(summer-camp) / album 三類浮卡）；
// 要再隱藏把 SHOW_ACT_CAMP_ALBUM 改 false（false 時連 fetch 都不發，files / curriculum / awards 不受影響）。
const SHOW_ACT_CAMP_ALBUM = true;
async function fetchActivityPosters() {
  // ⚠️ 上面開關＝S3 coming soon 版（ver1）出包靠的開關、不是死碼；它和上下各一行要維持 09-19（a8c11f9）原樣，
  // ver1 流程 revert a8c11f9 才能自動合併
  const actLists = SHOW_ACT_CAMP_ALBUM ? await Promise.all(ACTIVITY_POSTER_SOURCES.map(s =>
    s.load().then(g => postersOf(g, `pages/activities.html?section=${s.section}`)).catch(() => []))) : [];
  const activities = actLists.flat();

  // Summer camp → admission.html?section=summer-camp&item={id}（camp 已搬到 admission）
  const summerCamp = SHOW_ACT_CAMP_ALBUM ? postersOf(await loadSummerCamp().catch(() => []), 'pages/admission.html?section=summer-camp') : [];

  // Library documents（PDF）→ library.html#f-{id}；docType=contributions（收錄）不收（user 2026-10-03，其餘分類照收）
  // ⚠️ 必須跟 library files 面板「同源、同 id 規則」：element id = f-<row.id>、封面用後台預產 cover 欄（generate-library-covers.cjs 產）
  const files = [];
  try {
    const res = await fetch(`${CMS_API_BASE}/library_documents?fields=id,docType,cover.filename_disk&sort=-year,sort&limit=-1`);
    if (!res.ok) throw new Error('CMS ' + res.status);
    ((await res.json())?.data || []).forEach(r => {
      const cover = cdnUrl(r.cover);
      if (cover && r.id != null && r.docType !== 'contributions') {
        files.push({ type: 'image', src: cover, url: `pages/library.html#f-${shortLibId(r.id)}` });
      }
    });
  } catch (_) {}

  // Album → library.html#album-{id}（無 id 則只到 album panel）；共用 loadOthersAlbum → id 跟 album 面板同源
  const album = [];
  if (SHOW_ACT_CAMP_ALBUM) (await loadOthersAlbum().catch(() => [])).forEach(group => {
    (group.items || []).forEach(item => {
      const cover = item.cover || item.images?.[0];
      if (cover) album.push({ type: 'image', src: normalizeImagePath(cover), url: item.id ? `pages/library.html#album-${item.id}` : 'pages/library.html' });
    });
  });

  return { activities, summerCamp, files, album };
}

// 從課程資料撈 title（導航到對應 course item，並 highlight 該項目）
// 用共用 loadCourses（見 courses-source.js）→ 跟課表同源、deep-link slug 一致。
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
  } catch (_) {}
  return pool;
}

// 開場均勻鋪點：逐點抽 15 個候選、取離現有點最遠者（邊界當鏡像點＝離邊至少半個間距）→ 比 jittered grid 平均
// （grid 格內抖動仍會兩點貼近、旁邊空一塊），也跟移動中補洞（fillHoles）同一套「最遠空位」。回傳卡片中心，數量 = n。
function scatterPositions(n, cw, ch) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let best = null, bestD = -1;
    for (let k = 0; k < 15; k++) {
      const p = { x: Math.random() * cw, y: Math.random() * ch };
      let d = 2 * Math.min(p.x, cw - p.x, p.y, ch - p.y);
      for (const q of pts) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
      if (d > bestD) { bestD = d; best = p; }
    }
    pts.push(best);
  }
  return pts;
}

// 把一組 entry 包成 category 池：標記 _cat（給去重/均分用）+ 洗牌後配一個 cursor 輪替
function mkCat(entries, name) {
  (entries || []).forEach(e => { e._cat = name; });
  return { queue: SCCDHelpers.shuffle(entries || []), cursor: 0 };
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

// 訂閱 news hover：注意「hover 進行中才誕生的卡（補洞進場的圖片卡 / 文字卡）」——
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

  // preImg：補洞進場先 new Image() 預載好的元素，reuse＝量測時已 complete、offsetHeight 正確
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
    padding: var(--card-pad-s);
    font-weight: var(--font-weight-bold);
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
      el.style.background = 'var(--color-white)';
      el.style.color = 'var(--color-black)';
    } else {
      el.style.background = 'var(--color-black)';
      el.style.color = 'var(--color-white)';
    }
  } : null;

  return { el, w: maxTextWidth(), h: 80, onHover };
}


// ── Spawn & Animate ─────────────────────────────────────────

// 池子空（後台沒資料／整池都已在畫面上）→ 回 null 不生成：後台是唯一圖片來源，不再拿本地測試圖補位（user 2026-10-04）
// pos＝卡片中心 { x, y, side? }：有 side＝補洞進場（fillHoles，生在該邊畫面外）；沒有＝初始批（scatterPositions）
function spawnItem(container, poolEntry, pos, preImg = null) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  let elData;
  if (poolEntry?.type === 'image') {
    // interactive 預設 true；poolEntry.interactive === false 跳過 news hover wipe（臨時 Coming Soon index）
    elData = createImageEl(poolEntry.src, poolEntry.url, poolEntry.interactive !== false, preImg);
  } else if (poolEntry?.type === 'text') {
    elData = createTextEl(poolEntry.textEn, poolEntry.textZh, poolEntry.url);
  } else {
    return null;
  }

  const { el, w, h, slideTargets = null } = elData;

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
  let x = pos.x - realW / 2, y = pos.y - realH / 2;
  if (pos.side) {
    // 補洞進場：沿進場邊外推到整張（最大透視倍率＋擺動外擴）都在畫面外，從畫面外滑進來、不在邊緣先露一截
    // （fillHoles 挑點時用的是預估尺寸，文字卡實寬可能更寬 → 這裡以實測尺寸補推）
    const [hx, hy] = visHalf(realW, realH, 0.6 + scaleGain());
    if (pos.side === 'L') x = Math.min(x, -hx - realW / 2);
    if (pos.side === 'R') x = Math.max(x, cw + hx - realW / 2);
    if (pos.side === 'T') y = Math.min(y, -hy - realH / 2);
    if (pos.side === 'B') y = Math.max(y, ch + hy - realH / 2);
  } else if (SCCDHelpers.isMobileLayout()) {
    // 初始批：手機整張夾進視窗（邊緣半出血會讓小螢幕分佈看起來缺角；桌面不動）。
    // 矮橫向 header 帶（0–92：logo／mode／menu 鈕）不放卡（user 2026-10-29 稽核「首頁浮卡撞 header」）
    const topMin = SCCDHelpers.isLandscapeGate() ? 100 : 8;
    x = Math.min(Math.max(x, 8), Math.max(8, cw - realW - 8));
    y = Math.min(Math.max(y, topMin), Math.max(topMin, ch - realH - 8));
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
  // 初始批圖卡量尺寸時封面多半還沒載完（高 0、先拿卡寬頂替）→ 載完補量實高。不補的話直式海報的
  // h 只算一半：收卡以為整張出了上緣、其實下半還在畫面上就被收掉（10-19 實測露 37~94px 瞬間消失）
  const cover = itemSlideTargets[0];
  if (cover instanceof HTMLImageElement && !cover.complete) {
    cover.addEventListener('load', () => { item.h = el.offsetHeight || item.h; }, { once: true });
  }

  if (el.tagName !== 'A') {
    // 無連結卡不吃滑鼠（卡本身原就 pointer-events:none）：外框也不擋下面的卡、不觸發 hover
    mover.style.pointerEvents = 'none';
  } else {
    // hover 判定掛 mover（未旋轉的 2D 外框）不掛卡片（user 2026-10-01「有時 hover 不到這個 item」）：3D 擺動側過去時
    //   卡片投影變窄，游標落在外框內、卡片外＝打到透明的 perspectiveWrap → 卡片收不到 mouseenter。
    let swayAt = null;   // hover 暫停當下的擺動角：離開時轉回這裡再續播＝反向動畫（原 resume 從 0 瞬跳回擺動角）
    let clicked = false; // 點了＝要離頁：退場中游標移開也維持轉正／hover 態，不轉回原角度（user 2026-10-02）
    // hover 疊到最上層（1000，高過深度排名 1~N）／放回原深度：z-index 只能瞬切 → 換深度時疊一張複本交叉淡化
    //   （user 2026-10-19「從後面移到最前面太直接」）。複本每幀抄本體 transform＝跟本體完全重合、只差在 z →
    //   沒重疊處看不出有兩張，重疊處＝前後兩張卡交叉淡化。本體一律立刻換到目標深度（游標判定不變），
    //   複本留在另一層代班：進場本體在上淡入、複本墊底；離開複本在上淡出。複本在 onHover 之後才拷＝hover 色照樣瞬切。
    const depth = { f: 0 };   // 本卡疊在前面的程度（0＝原深度、1＝最上）；中途反向從目前值接著淡、不跳
    let ghost = null, depthTween = null;
    function crossfadeDepth(toFront) {
      ghost?.remove();
      ghost = /** @type {HTMLElement} */ (mover.cloneNode(true));
      ghost.style.pointerEvents = 'none';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      const g = ghost, gRot = /** @type {HTMLElement} */ (g.firstElementChild.firstElementChild);
      mover.style.zIndex = toFront ? '1000' : String(item.z);
      g.style.zIndex = toFront ? String(item.z) : '1000';
      const top = toFront ? mover : g;   // 疊在上面、要淡的那張
      mover.style.opacity = g.style.opacity = '';
      top.style.opacity = String(depth.f);
      container.appendChild(g);
      depthTween = gsap.to(depth, {
        f: toFront ? 1 : 0, duration: DUR.fast, ease: EASE.enterSoft, overwrite: true,
        onUpdate: () => {
          g.style.transform = mover.style.transform;
          gRot.style.transform = rotator.style.transform;
          top.style.opacity = String(depth.f);
        },
        onComplete: () => { g.remove(); if (ghost === g) ghost = null; mover.style.opacity = ''; },
      });
    }
    mover.addEventListener('mouseenter', () => {
      item.hovered = true;
      gsap.killTweensOf(item, 'speed');
      item.speed = 0;                  // 立刻停住（user 2026-08-28：方便點擊）
      if (elData.onHover) elData.onHover(true);
      if (!swayAt) {
        gsapTween.pause();
        swayAt = { x: gsap.getProperty(rotator, 'rotateX'), y: gsap.getProperty(rotator, 'rotateY') };
      }
      gsap.to(rotator, { rotateY: 0, rotateX: 0, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
      crossfadeDepth(true);   // 排在轉正 tween 之後建：GSAP 同幀依建立順序更新 → 複本抄到的是本幀角度、不慢一幀
    });
    mover.addEventListener('mouseleave', () => {
      if (clicked) return;
      item.hovered = false;
      if (elData.onHover) elData.onHover(false);
      gsap.to(item, { speed: 1, duration: DUR.fast, ease: EASE.enterSoft });   // 移動也漸進接回、不瞬間起跑
      gsap.to(rotator, {
        rotateY: swayAt.y, rotateX: swayAt.x, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto',
        onComplete: () => { swayAt = null; gsapTween.resume(); },
      });
      crossfadeDepth(false);
    });
    // 外框內、卡片外的點擊（還沒轉正就點）轉給卡片連結 → router 照常攔 a[href]
    mover.addEventListener('click', (e) => {
      clicked = true;
      depthTween?.progress(1);   // 要離頁：直接收掉複本，免得本體滑出遮罩後墊底的複本還留在原地
      if (!el.contains(/** @type {Node} */ (e.target))) el.click();
    });
  }

  return item;
}

// 單張浮卡進場——**只給初始批（畫面內 spawn 的卡）**；補洞進場的卡從畫面外漂進來、不走這裡（見 fillHoles）。
// 圖片卡與文字卡都走「slideTargets 在遮罩內滑入」（clip-reveal）。
// 圖片卡＝**等封面 img 載好才滑入**→ 修「封面比卡晚載＝clip-reveal 先跑完、圖才 pop 出」（初始批 documents 封面大／
//   首訪未快取最明顯，user 2026-08-19 報）；img 已載/快取則立即依 delay 播。文字卡無 img → 立即滑入。
// （else clip-path 分支＝理論 fallback，現無卡走到；hover 覆蓋色 newsOverlay 的 clip-path 是另一回事、不在此。）
function revealFloatItem(item, delay) {
  if (typeof gsap === 'undefined' || !item) return;
  if (item.slideTargets) {
    gsap.set(item.slideTargets, revealHidden());   // 立即藏（同步，first paint 前生效＝不閃）
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

// gate＝首頁同時進場點（logo／header／news／WATCH，見 main-modular）：資料照樣先抓，卡等 gate 才生＋晚一拍進場＝floating 最後。
// 生卡就開始漂＋補洞從邊緣滑進來，所以是「等 gate 才生」而不是先生好藏著
export async function initFloatingItems(gate = Promise.resolve()) {
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
  await gate;
  if (!container.isConnected) return;
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
      if (pool.cursor >= pool.queue.length) { SCCDHelpers.shuffle(pool.queue); pool.cursor = 0; }
      const entry = pool.queue[pool.cursor++];
      if (!onScreen.has(entry)) return entry;
    }
    return null;
  }

  // 挑「畫面上數量最少」且仍有可用項的 category（等權 → 均分）；都不可用回 null（spawnItem 不生成）
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

  function trackSpawn(entry, pos) {
    if (entry) { onScreen.add(entry); liveCount[entry._cat]++; }
    return spawnItem(container, entry, pos);
  }

  const items = [];
  const pushItem = (it) => { if (it) items.push(it); };   // spawnItem 池空回 null＝不生成

  // 離頁後 cancelled 為 true：轉向重散佈不再動已棄置的卡
  let cancelled = false;

  // 初始化 items：nextEntry 逐筆挑最少的 category → 開場即均分、無重複；
  // 座標走最遠空位鋪點（scatterPositions）→ 開場均勻鋪滿視窗、不擠一角
  {
    const n = totalItems();
    const positions = scatterPositions(n, container.clientWidth, container.clientHeight);
    for (let i = 0; i < n; i++) pushItem(trackSpawn(nextEntry(), positions[i]));
  }

  // 進場：initial batch stagger 揭露——圖片卡＝img/overlay 同向滑入 wrapper 遮罩（clip-reveal）、
  // 文字卡＝clip-path（色底 chip）。揭露時 RAF 已在跑＝邊漂邊揭露。
  // base delay DUR.slow＝等 news／WATCH 進場走一段（iris 開滿）才接上（首頁進場順序 user 2026-10-21：floating 最後）。
  function playFloatEntrance(baseDelay) {
    if (typeof gsap === 'undefined') return;
    items.forEach((item, i) => revealFloatItem(item, baseDelay + i * 0.03));
  }
  playFloatEntrance(DUR.slow);

  // 轉向（跨矮橫向 gate）重散佈（user 2026-07-04「轉向重 run 一次內容、用手機版本調整」）：
  // 舊 items 的座標是舊視窗算的（轉向後擠一邊/溢出）→ 全部清掉、以新視窗尺寸+新 totalItems()
  // （矮橫向/手機 12、桌面 20）重生，並重播 clip 揭露。onScreen/liveCount 同步歸零＝均分邏輯從頭來。
  function respawnAll() {
    if (cancelled) return;  // 已離頁不動殘骸
    items.forEach(item => { if (item.el.parentNode) container.removeChild(item.el); });
    items.length = 0;
    onScreen.clear();
    CATS.forEach(c => { liveCount[c] = 0; });
    readyQ.forEach(r => { onScreen.add(r.entry); liveCount[r.entry._cat]++; });   // 排隊中的預載卡仍佔位
    const n = totalItems();
    const positions = scatterPositions(n, container.clientWidth, container.clientHeight);
    for (let i = 0; i < n; i++) pushItem(trackSpawn(nextEntry(), positions[i]));
    playFloatEntrance(0);
  }
  const rotateGateMq = window.matchMedia(SCCDHelpers.LANDSCAPE_GATE);
  const onRotateGateChange = () => requestAnimationFrame(respawnAll);
  rotateGateMq.addEventListener('change', onRotateGateChange);

  // ── 補洞進場（user 2026-10-19「移動時會有一區空白」）──
  // 舊版「出畫面一張才補一張」：補的時機跟著離場走、不看哪裡缺 → 離場稀疏那段鏡頭前方就沒卡、
  // 轉向時新的進場邊整條沒卡＝空白帶開進畫面。改成每幀在進場邊外抽幾個候選點，離最近卡中心 ≥ 間距
  // 就補一張（最遠空位優先）→ 卡在進畫面前就排勻；數量自然落在 totalItems() 附近。
  // 圖片卡先預載好排隊（readyQ）：未載完的 <img> 高度 0＝隱形漂入、載完才在畫面中間 pop（08-19 報）；
  // 排 3 張＝要補時立刻有成形的卡，轉向時一整條邊要補也跟得上。
  const readyQ = [];
  let preparing = 0;
  function prepNext() {
    while (readyQ.length + preparing < 3) {
      const entry = nextEntry();
      if (!entry) return;
      onScreen.add(entry); liveCount[entry._cat]++;   // 先佔位：預載空窗期不被重選
      if (entry.type !== 'image' || !entry.src) { readyQ.push({ entry, pre: null }); continue; }
      preparing++;
      const pre = new Image();
      pre.onload = () => { preparing--; readyQ.push({ entry, pre }); };
      pre.onerror = () => {   // 壞圖踢出池、不再重試
        preparing--;
        onScreen.delete(entry); liveCount[entry._cat]--;
        const q = categoryPools[entry._cat].queue, i = q.indexOf(entry);
        if (i >= 0) q.splice(i, 1);
      };
      pre.src = entry.src;
    }
  }

  function fillHoles(cw, ch) {
    prepNext();
    if (!readyQ.length || items.length >= totalItems() * 2) return;   // 上限只是保險（實測常態 ≈1.15～1.4 倍：含進場帶裡還沒進畫面的卡）
    const vx = -camVX, vy = -camVY;   // 卡在畫面上的速度（＝反向鏡頭）
    const gap = 1.1 * Math.sqrt(cw * ch / totalItems());   // 卡中心最小間距（依每張分到的面積；1.1＝實測畫面內張數≈totalItems）
    // 各邊的進場帶深（從「整張剛好看不見」起算）：朝內走 1.5 秒的距離、封頂半個間距 → 補的卡很快就進畫面，
    //   不在外面爬十幾秒佔數量；-1＝不是進場邊（朝內太慢＝太平行／離場邊）
    const bandOf = v => v > LEAD_MIN ? Math.min(gap / 2, v * 1.5) : -1;
    const bL = bandOf(vx), bR = bandOf(-vx), bT = bandOf(vy), bB = bandOf(-vy);
    const sides = [['L', bL, vx * ch], ['R', bR, -vx * ch], ['T', bT, vy * cw], ['B', bB, -vy * cw]].filter(s => s[1] >= 0);
    if (!sides.length) return;
    const next = readyQ[0];
    const ew = next.pre ? imgWidth() : maxTextWidth();   // 預估尺寸（文字卡實寬 spawnItem 量完再補推）
    const eh = !next.pre ? 60 : next.pre.naturalWidth ? ew * next.pre.naturalHeight / next.pre.naturalWidth : ew;
    const [hx, hy] = visHalf(ew, eh, 0.6 + scaleGain());
    const flux = sides.reduce((s, f) => s + f[2], 0);   // 候選點依通量（朝內速度×邊長）分配
    let best = null, bestD = gap;
    for (let k = 0; k < 6; k++) {
      let r = Math.random() * flux, [side, band] = sides[0];
      for (const [s, b, f] of sides) if ((r -= f) <= 0) { side = s; band = b; break; }
      // 沿邊方向延伸進角落：只延伸到「相鄰邊也是進場邊」的那一頭、深度同那一邊的帶
      //   （延伸到非進場邊＝生了就被收卡條件當場收掉；延伸太深＝在角落外爬很久）
      let cx, cy;
      if (side === 'L' || side === 'R') {
        const d = hx + Math.random() * band;
        cx = side === 'L' ? -d : cw + d;
        cy = rand(bT >= 0 ? -hy - bT : 0, bB >= 0 ? ch + hy + bB : ch);
      } else {
        const d = hy + Math.random() * band;
        cy = side === 'T' ? -d : ch + d;
        cx = rand(bL >= 0 ? -hx - bL : 0, bR >= 0 ? cw + hx + bR : cw);
      }
      let dMin = Infinity;
      for (const o of items) dMin = Math.min(dMin, Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy));
      if (dMin >= bestD) { bestD = dMin; best = { x: cx, y: cy, side }; }
    }
    if (!best) return;
    readyQ.shift();
    pushItem(spawnItem(container, next.entry, best, next.pre));   // reuse 預載元素＝量測 offsetHeight 正確
  }

  let running = true;
  let rafId = null;

  // 鏡頭航向：用 tick 的 dt 倒數（非 setTimeout）→ 分頁隱藏／待機時跟 tick 一起自動暫停
  let camVX = 0, camVY = 0;   // 當前鏡頭速度（px/秒）
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

      // 收卡＝整張（含放大＋擺動外擴）在畫面外、且那一軸沒有朝內走（離場中，或太平行、短時間進不來）。
      // 進場邊外剛補的卡朝內走 → 不會被當場收掉（fillHoles 挑點用同一個 LEAD_MIN）
      const [hx, hy] = visHalf(item.w, item.h, scale);
      const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
      if (
        (cx + hx < 0 && -camVX <= LEAD_MIN) ||
        (cx - hx > cw && camVX <= LEAD_MIN) ||
        (cy + hy < 0 && -camVY <= LEAD_MIN) ||
        (cy - hy > ch && camVY <= LEAD_MIN)
      ) {
        // 釋放離場那筆（從畫面集合移除）→ 它的 category 數量 -1 → 下一筆均分時可再被選回（去重：離場才解禁）
        if (item.poolEntry) { onScreen.delete(item.poolEntry); liveCount[item.poolEntry._cat]--; }
        container.removeChild(item.el);
        items.splice(i, 1);
      }
    }

    // 補洞進場不做 clip-reveal（那是初始批的畫面內進場）：從畫面外滑進來就是它的進場
    fillHoles(cw, ch);

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
        gsap.to(item.slideTargets, { ...revealHidden(), duration: DUR.medium, ease: EASE.exit, delay, overwrite: true, onComplete: onOne });
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
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    rotateGateMq.removeEventListener('change', onRotateGateChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    themeListeners.forEach(fn => window.removeEventListener('theme:changed', fn));
    themeListeners.length = 0;
    newsHoverListeners.enter.length = 0;
    newsHoverListeners.leave.length = 0;
    newsHoverActive = false;
  });
}
