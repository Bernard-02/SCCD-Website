/**
 * Floating Items
 * 在首頁背景層漂浮的元素，像宇宙中的螢火蟲
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { renderPdfCover } from '../ui/pdf-cover.js';
import { DUR, EASE } from '../ui/motion.js';
import { loadCourses } from '../pages/courses-source.js';
import { loadSummerCamp } from '../pages/summer-camp-source.js';
import { loadActivityCollection } from '../pages/activities-source.js';
import { sitePath } from '../ui/site-base.js';
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';

// 進/退場 clip-path 4 方向（卡片 el 不受 RAF 的 mover transform 影響，clip-path 安全）
const FLOAT_HIDE_CLIPS = ['inset(0% 0% 100% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)'];
function randFloatHideClip() { return FLOAT_HIDE_CLIPS[Math.floor(Math.random() * FLOAT_HIDE_CLIPS.length)]; }

// 桌面 20、手機 12（< 768px）。手機減量是視覺優化，不影響桌面。
function isMobileViewport() { return window.innerWidth < 768; }
const TOTAL_ITEMS = isMobileViewport() ? 12 : 20;
const SPEED_MIN = 0.05;
const SPEED_MAX = 0.25;
const IMG_WIDTH = 140; // 所有圖片統一寬度，高度 auto follow 原比例（2026-05-28 從 200 減 30%）
const MAX_TEXT_WIDTH = 210; // 2026-05-28 從 300 減 30%

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
async function fetchActivityPosters() {
  const activities = [];
  const summerCamp = [];
  const files = [];
  const album = [];

  // 活動類 JSON → 導航到 activities.html?section=X
  // ⚠️ general-activities.json 是「混合檔」（visits / exhibitions / competitions / conferences 四類混在同檔），
  //    不能整包標成單一 section → 用 sectionFromCategory 每筆用自己的 item.category 當 section。
  // ⚠️ workshop 不在這個本地清單：activities 頁的 workshop 已接 Directus（activities_workshops），
  //    前台 element id = `item-${refCode||id}`（activities-source mapRow）。若這裡仍讀 local workshops.json 的 id，
  //    deep-link 的 &item= 對不上 Directus refCode → navigateToItem 撈不到、退成捲到 section 不展開（user 2026-06-28）。
  //    改用同源 loadActivityCollection 取 id/poster（見下方），跟頁面渲染一致；Directus 掛掉時兩端都 fallback local、仍一致。
  const activitySources = [
    { file: 'data/permanent-exhibitions.json', section: 'exhibitions' },
    { file: 'data/lectures.json',              section: 'lectures' },
    { file: 'data/students-present.json',      section: 'students-present' },
    { file: 'data/general-activities.json',    sectionFromCategory: true },
  ];

  await Promise.all(activitySources.map(async (src) => {
    try {
      const data = await fetch(sitePath(src.file)).then(r => r.json());
      const groups = Array.isArray(data) ? data : (data.items || data.records || []);
      groups.forEach(group => {
        const items = Array.isArray(group) ? group : (group.items || []);
        items.forEach(item => {
          if (!item.poster) return;
          const section = src.sectionFromCategory ? item.category : src.section;
          if (!section) return;
          const itemParam = item.id ? `&item=${item.id}` : '';
          activities.push({
            type: 'image',
            src: normalizeImagePath(item.poster),
            url: `pages/activities.html?section=${section}${itemParam}`,
          });
        });
      });
    } catch (_) {}
  }));

  // Workshop → activities.html?section=workshop&item={refCode||id}（同源 loadActivityCollection，id 跟 activities 頁渲染一致）
  try {
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
  // 用 loadSummerCamp()（Directus 同源 + 本地 fallback）：id/poster 跟 admission 渲染一致，deep-link id 才對得上
  // （直接讀 local json 的 SC-YYYY-NN 對不上 Directus UUID）。
  try {
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

  // Library documents（PDF）→ library.html#f-{id}
  try {
    const lib = await fetch(sitePath('data/library.json')).then(r => r.json());
    lib.forEach(item => {
      if (item.cover && item.id) {
        files.push({ type: 'image', src: normalizeImagePath(item.cover), url: `pages/library.html#f-${item.id}` });
      }
    });
  } catch (_) {}

  // Album → library.html#album-{id}（無 id 則只到 album panel）
  try {
    const albumGroups = await fetch(sitePath('data/album-others.json')).then(r => r.json());
    albumGroups.forEach(group => {
      (group.items || []).forEach(item => {
        if (item.cover) {
          album.push({
            type: 'image',
            src: normalizeImagePath(item.cover),
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

// 從 records.json 撈 awards title（有導航）
async function fetchAwardTexts() {
  const pool = [];
  try {
    const data = await fetch(sitePath('data/records.json')).then(r => r.json());
    (data.records || []).forEach(yearGroup => {
      (yearGroup.items || []).forEach(item => {
        if (!item.competition) return;
        if (item.flag === 'tw') return; // 只顯示台灣以外的獎項
        // 中文：競賽名稱 加空格 rank
        const zh = `${item.competition} ${item.rank}`;
        // 英文：rank, 競賽名稱
        const en = item.competition_en
          ? `${item.rank_en || ''}, ${item.competition_en}`.trim().replace(/^,\s*/, '')
          : '';
        const hash = item.id ? `#${item.id}` : '';
        pool.push({ type: 'text', textEn: en, textZh: zh, url: `pages/library.html${hash}` });
      });
    });
  } catch (_) {}
  return pool;
}

// 從 library press 撈報導當浮動圖卡（非文字卡——文字卡只給 award / curriculum）。
// ⚠️ 必須跟 library press 面板「同源、同 id 規則」：Directus library_press → element id = press-<row.id>；
//    Directus 失敗才 fallback 本地 press.json（id 本就是 press-N，跟面板 fallback 一致）。
//    否則浮卡 deep-link 的 #press-<id> 跟 library 渲染的 element id 對不上 → 點進去不捲動、不 highlight
//    （user 2026-06-25 報；press 面板 2026-06-08 搬 Directus 後浮卡仍讀本地 press.json/press-1 沒跟上 → id 脫節）。
// 封面：有 PDF 用 PDF 第一頁（render 成 dataURL，pdf-cover.js 依 URL 快取）；沒 PDF 用第一張圖；都沒有就不放浮卡。
// 不阻塞首頁：傳入空 press queue，render 好一筆 push 一筆，nextEntry 下次選位 live 讀 queue.length 自動加入輪替。
async function populatePressCovers(pool, isCancelled) {
  /** @type {{id:string, cover:string, isPdf:boolean}[]} */
  let entries;
  try {
    const res = await fetch(`${CMS_API_BASE}/library_press?fields=id,pdf,images.directus_files_id&sort=sort&limit=-1`);
    if (!res.ok) throw new Error('CMS ' + res.status);
    const rows = (await res.json())?.data;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
    entries = rows.map(r => {
      if (r.pdf) return { id: `press-${r.id}`, cover: `${CMS_ASSETS_BASE}/${r.pdf}`, isPdf: true };
      const firstImg = Array.isArray(r.images) ? r.images.map(j => j && j.directus_files_id).filter(Boolean)[0] : null;
      if (firstImg) return { id: `press-${r.id}`, cover: `${CMS_ASSETS_BASE}/${firstImg}?key=web`, isPdf: false };
      return null; // 無 PDF 也無圖 → 沒封面可顯示，不放浮卡
    }).filter(Boolean);
  } catch (cmsErr) {
    // Directus 失敗 → fallback 本地 press.json（同 library press 面板 fallback：id 直接用 press-N、不重加前綴）
    try {
      const local = await fetch(sitePath('data/press.json')).then(r => r.json());
      entries = (Array.isArray(local) ? local : [])
        .filter(i => i.id && i.pdfUrl)
        .map(i => ({ id: i.id, cover: i.pdfUrl, isPdf: true }));
    } catch (_) { return; }
  }

  await Promise.all(entries.map(async (e) => {
    if (isCancelled()) return;
    const src = e.isPdf ? await renderPdfCover(normalizeImagePath(e.cover)) : normalizeImagePath(e.cover);
    if (!src || isCancelled()) return;
    pool.push({ type: 'image', src, url: `pages/library.html#${e.id}`, _cat: 'press' });
  }));
}

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 把一組 entry 包成 category 池：標記 _cat（給去重/均分用）+ 洗牌後配一個 cursor 輪替
function mkCat(entries, name) {
  (entries || []).forEach(e => { e._cat = name; });
  return { queue: shuffle(entries || []), cursor: 0 };
}

// ── Element 建立 ────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// 避免中文寡字：用 word joiner (U+2060) 黏住最後兩字，break-word 換行時不讓末字落單一行
function preventOrphan(text) {
  if (!text || text.length < 2) return text;
  return text.slice(0, -1) + '⁠' + text.slice(-1);
}

// 全局 news hover 狀態，所有 item 訂閱
const newsHoverListeners = { enter: [], leave: [] };

// 全局 theme:changed listener registry（離頁時統一移除，避免 SPA 換頁累積）
const themeListeners = [];

export function applyNewsHover() {
  newsHoverListeners.enter.forEach(fn => fn());
}
export function removeNewsHover() {
  newsHoverListeners.leave.forEach(fn => fn());
}

const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

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

function createImageEl(src, url, interactive = true) {
  const wrapper = document.createElement(url ? 'a' : 'div');
  if (url) {
    /** @type {HTMLAnchorElement} */ (wrapper).href = url;
    wrapper.setAttribute('aria-label', floatingLinkLabel(url)); // 無障礙：功能圖連結名稱
    wrapper.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
  }
  wrapper.style.cssText = `
    display: block;
    position: absolute;
    top: 0; left: 0;
    width: ${IMG_WIDTH}px;
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    overflow: hidden;
    transition: none;
  `;

  const img = document.createElement('img');
  img.src = src;
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
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
  `;

  wrapper.appendChild(img);

  // interactive=false：跳過 news hover wipe overlay（臨時 Coming Soon index 純展示用，不訂閱 listener）
  if (interactive) {
    // newsOverlay 放最後，蓋住 img
    wrapper.appendChild(newsOverlay);

    // 隨機選一個 wipe 方向（上/下/左/右）
    const wipe = randomWipe();
    newsOverlay.style.clipPath = wipe.hidden;

    // 訂閱 news hover 事件：每次 enter 時隨機選色
    // mode-color：用 var(--theme-fg) strict 對比，不隨機（與整體 B/W 對比 pattern 一致）
    newsHoverListeners.enter.push(() => {
      if (document.body.classList.contains('mode-color')) {
        newsOverlay.style.background = 'var(--theme-fg)';
      } else {
        newsOverlay.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      }
      newsOverlay.style.clipPath = wipe.shown;
    });
    newsHoverListeners.leave.push(() => {
      newsOverlay.style.clipPath = wipe.hidden;
    });
  }

  return { el: wrapper, w: IMG_WIDTH, h: IMG_WIDTH }; // h 暫用 IMG_WIDTH，實際由圖片決定
}

function createTextEl(textEn, textZh, url) {
  const el = document.createElement(url ? 'a' : 'div');
  if (url) {
    /** @type {HTMLAnchorElement} */ (el).href = url;
    el.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
  }
  const defaultColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
  const defaultTextColor = '#000';
  el.style.cssText = `
    display: inline-block;
    position: absolute;
    top: 0; left: 0;
    padding: 0.5rem 0.75rem;
    font-weight: 600;
    line-height: 1.4;
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    transition: background 0.25s ease, color 0.25s ease;
    white-space: nowrap;
  `;

  if (textEn) {
    const enLine = document.createElement('div');
    enLine.textContent = textEn;
    enLine.style.cssText = 'font-size: var(--font-size-p1); margin-bottom: 0.15rem;';
    el.appendChild(enLine);
  }
  if (textZh) {
    const zhLine = document.createElement('div');
    zhLine.textContent = preventOrphan(textZh);
    zhLine.style.cssText = 'font-size: var(--font-size-p1);';
    el.appendChild(zhLine);
  }

  // news hover 遮蓋：clip-path 從隨機方向 wipe 一塊純色蓋住文字（跟圖片卡片同款 newsOverlay，取代舊的文字色淡出）
  const newsOverlay = document.createElement('div');
  newsOverlay.style.cssText = `
    position: absolute; inset: 0;
    pointer-events: none;
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
  `;
  const wipe = randomWipe();
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
  newsHoverListeners.enter.push(() => {
    newsOverlay.style.background = document.body.classList.contains('mode-color') ? 'var(--theme-fg)' : defaultColor;
    newsOverlay.style.clipPath = wipe.shown;
  });
  newsHoverListeners.leave.push(() => {
    newsOverlay.style.clipPath = wipe.hidden;
  });

  if (url) {
    el.addEventListener('mouseenter', () => {
      el.dataset.hovering = '1';
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
    });
    el.addEventListener('mouseleave', () => {
      el.dataset.hovering = '0';
      setColors();
    });
  }

  return { el, w: MAX_TEXT_WIDTH, h: 80 };
}

// IG 獨立模組，不在 floating pool 內
export function initWatchHover() {
  const watchBtn = document.getElementById('homepage-yt-card');
  if (!watchBtn) return;

  // SPA 回 index 時 watchBtn 是新的（main 內被 swap），但 body 內的舊 spotlight overlay 仍在 → 清掉
  // 不然每次回 index body 累積一個透明 overlay（pointer-events:none 不擋 click 但 DOM leak）
  document.querySelectorAll('[data-watch-spotlight]').forEach(el => el.remove());

  // 全頁暗化 overlay，中間挖洞 spotlight
  const overlay = document.createElement('div');
  overlay.dataset.watchSpotlight = '1';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 9998;
  `;
  document.body.appendChild(overlay);

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
    updateSpotlight();
    overlay.style.opacity = '1';
    applyNewsHover();
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
    // overlay 有 transition: opacity 0.3s，fade-out 期間 scroll 會讓 fading 中的 spotlight
    // 在 viewport 原位 → 視覺跑位；等 fade 完才解鎖 scroll + 停 tracking
    unlockTimer = setTimeout(() => {
      document.body.style.overflow = savedBodyOverflow;
      isLocked = false;
      unlockTimer = null;
      stopTracking();
    }, 300);
  });
  watchBtn.__closeSpotlight = () => {
    overlay.style.opacity = '0';
    removeNewsHover();
  };
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

function spawnItem(container, poolEntry, fromEdge = false) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  let elData;
  if (!poolEntry || poolEntry.type === 'circle') {
    elData = createCircleEl();
  } else if (poolEntry.type === 'image') {
    // interactive 預設 true；poolEntry.interactive === false 跳過 news hover wipe（臨時 Coming Soon index）
    elData = createImageEl(poolEntry.src, poolEntry.url, poolEntry.interactive !== false);
  } else if (poolEntry.type === 'text') {
    elData = createTextEl(poolEntry.textEn, poolEntry.textZh, poolEntry.url);
  } else {
    elData = createCircleEl();
  }

  const { el, w, h } = elData;

  const angle = rand(0, Math.PI * 2);
  const speed = rand(SPEED_MIN, SPEED_MAX);
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  let x = 0, y = 0;

  // 量真實尺寸：暫時 append 到 container
  el.style.visibility = 'hidden';
  el.style.position = 'absolute';
  container.appendChild(el);
  if (el.offsetWidth > MAX_TEXT_WIDTH) {
    el.style.whiteSpace = 'normal';
    el.style.wordBreak = 'break-word';
    el.style.width = `${MAX_TEXT_WIDTH}px`;
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
  if (fromEdge) {
    const edge = randInt(0, 3);
    if (edge === 0)      { x = rand(-realW, cw); y = -realH; vy = Math.abs(vy) + SPEED_MIN; }
    else if (edge === 1) { x = cw;               y = rand(-realH, ch); vx = -(Math.abs(vx) + SPEED_MIN); }
    else if (edge === 2) { x = rand(-realW, cw); y = ch;    vy = -(Math.abs(vy) + SPEED_MIN); }
    else                 { x = -realW;            y = rand(-realH, ch); vx = Math.abs(vx) + SPEED_MIN; }
  } else {
    x = rand(-realW * 0.5, cw - realW * 0.5);
    y = rand(-realH * 0.5, ch - realH * 0.5);
  }

  const rotation = randomRotation();

  // mover：負責 translate（tick 控制，無 transition）
  const mover = document.createElement('div');
  mover.style.cssText = `position:absolute; top:0; left:0; will-change:transform;`;
  mover.style.transform = `translate(${x}px, ${y}px)`;

  // rotator：負責 rotateX/Y 搖擺（GSAP 控制）
  // perspective 必須設在父層才有透視效果
  const perspectiveWrap = document.createElement('div');
  perspectiveWrap.style.cssText = `perspective: 600px;`;
  const rotator = document.createElement('div');
  rotator.style.cssText = `transform-style: preserve-3d;`;

  rotator.appendChild(el);
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

  const item = { el: mover, x, y, vx, vy, w: realW, h: realH, rotation, hovered: false, gsapTween, rotator, card: el, poolEntry };

  el.addEventListener('mouseenter', () => {
    item.hovered = true;
    gsapTween.pause();
    gsap.to(rotator, { rotateY: 0, rotateX: 0, duration: DUR.fast, ease: EASE.enterSoft });
  });
  el.addEventListener('mouseleave', () => {
    item.hovered = false;
    gsapTween.resume();
  });

  return item;
}

// ── Init ────────────────────────────────────────────────────

export async function initFloatingItems() {
  const container = document.getElementById('floating-layer');
  if (!container) return;

  // 七個 category 各自一池，畫面上「均分 + 不重複」（user 2026-06-28）：
  //   activities / summer-camp / library-files / album / curriculum / awards / press 等權，
  //   選位時挑「畫面上現有數量最少」的可用 category（等權 → 自動均分）；
  //   press 走 PDF 封面背景 render → 先空池、render 好逐筆 push 進 queue，自然加入輪替。
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
    press:      mkCat([],                 'press'),
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

  function trackSpawn(entry, fromEdge) {
    if (entry) { onScreen.add(entry); liveCount[entry._cat]++; }
    return spawnItem(container, entry, fromEdge);
  }

  const items = [];

  // press PDF 封面背景 render（不 await，render 好逐筆 push 進 press queue 自動加入輪替）；
  // 離頁後 cancelled 為 true，in-flight render 完成時不再 push（避免動已棄置的 pool）
  let cancelled = false;
  populatePressCovers(categoryPools.press.queue, () => cancelled);

  // 初始化 items：nextEntry 逐筆挑最少的 category → 開場即均分、無重複
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    items.push(trackSpawn(nextEntry(), false));
  }

  // 進場：initial batch 的卡片 clip-path 由隱藏 stagger 揭露（el 在 mover 內、不被 RAF 的 translate 影響 → clip-path 安全）。
  // 揭露完留 inline inset(0)（不 clearProps）→ 離頁退場可直接 to 隱藏不 snap。揭露時 RAF 已在跑＝邊漂邊揭露。
  // base delay 0.1 讓 floating 排在 news(0.35)/iris(0.6) 之前（首頁協調進場順序）。
  if (typeof gsap !== 'undefined') {
    items.forEach(item => { if (item.card) gsap.set(item.card, { clipPath: randFloatHideClip() }); });
    items.forEach((item, i) => {
      if (item.card) gsap.to(item.card, { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.slow, ease: EASE.enter, delay: 0.1 + i * 0.03 });
    });
  }

  let running = true;
  let rafId = null;

  function tick() {
    if (!running) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const buffer = 250;

    // 單點透視：以畫面中心為消失點，越中心越小（遠），越四周越大（近）
    const centerX = cw / 2;
    const centerY = ch / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const speedMult = item.hovered ? 0.3 : 1;
      item.x += item.vx * speedMult;
      item.y += item.vy * speedMult;

      // scale：以 item 中心點距畫面中心的距離決定
      const dx = (item.x + item.w / 2) - centerX;
      const dy = (item.y + item.h / 2) - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = 0.6 + Math.min(dist / maxDist, 1) * 0.9;

      item.el.style.transform = `translate(${item.x}px, ${item.y}px) scale(${scale})`;

      if (
        item.x > cw + buffer ||
        item.x < -buffer * 2 ||
        item.y > ch + buffer ||
        item.y < -buffer * 2
      ) {
        // 釋放離場那筆（從畫面集合移除）→ 它的 category 數量 -1 → 下一筆均分時可再被選回（去重：離場才解禁）
        if (item.poolEntry) { onScreen.delete(item.poolEntry); liveCount[item.poolEntry._cat]--; }
        container.removeChild(item.el);
        items.splice(i, 1);
        items.push(trackSpawn(nextEntry(), true));
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  function onVisibilityChange() {
    if (document.hidden) {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      running = true;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // 離頁退場：先凍住漂移 RAF（避免退場期間還在 translate），再把當前所有卡片 clip-path 收掉。
  // 用 fromTo 顯式起點 inset(0)：edge-respawn 的卡片沒設過 clipPath（computed none）、to 會 snap → fromTo 避免。
  registerPageExit(() => new Promise(resolve => {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (typeof gsap === 'undefined' || !items.length) { resolve(); return; }
    let done = 0;
    const onOne = () => { if (++done >= items.length) resolve(); };
    items.forEach((item, i) => {
      if (!item.card) { onOne(); return; }
      gsap.fromTo(item.card,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: randFloatHideClip(), duration: DUR.medium, ease: EASE.exit, delay: i * 0.02, overwrite: true, onComplete: onOne });
    });
  }));

  // SPA 離開首頁時停 RAF + 解綁所有 listener，避免每次回首頁累積
  // （tick 對 detached DOM 空跑、visibilitychange 匿名 handler 複利、newsHoverListeners/themeListeners 無限增長）
  registerPageCleanup(() => {
    cancelled = true;
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    themeListeners.forEach(fn => window.removeEventListener('theme:changed', fn));
    themeListeners.length = 0;
    newsHoverListeners.enter.length = 0;
    newsHoverListeners.leave.length = 0;
  });
}
