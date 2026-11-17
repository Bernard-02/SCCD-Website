/**
 * 對外網址用字（slug）的唯一來源：頁面 slug＋分頁 slug（user 2026-11-16「slug 對齊每個分頁的名字、後台可改」）。
 *
 * 程式內部一律用「內部代號」（route 名 atlas／support／generate、分頁 id conferences／files…；檔名、後台 collection、
 * label key 都跟著它）。只有進出網址列才換成 slug：
 *   出：router pushState、分享網址、library 切分頁寫 hash → toPublic／tabSlug／publicUrl
 *   進：冷載入／上一頁、各頁讀 ?section=／?program=／#分頁 → toInternal／readParams／readTabHash
 * 站內連結（HTML、sitemap、程式組的 href）照舊寫真實檔名＋內部代號，由 router 在寫進網址列時換。
 *
 * 預設值＝SLUG_DEFAULTS；後台 site_slugs（key、slug）同 key 的列蓋過預設。後台讀不到（或還沒建表）＝用預設。
 * 生效中的整張表存 localStorage：下次進站首繪前就用得到（head 的 layout-mode.js 也讀同一份判這頁是哪一組版型）。
 * 改 slug＝舊網址失效（進 404），已分享出去的連結要留就到後台 redirects 補一筆。
 */

import { CMS_API_BASE, fetchCmsJson } from './api.js';
import { SITE_BASE_PATHNAME } from '../modules/ui/site-base.js';

// route 名 → 真實檔案（router 的路由表由這裡建；新頁面加在這、再到 SLUG_DEFAULTS 給 slug）
export const PAGE_FILES = {
  index: 'index.html',
  about: 'pages/about.html',
  faculty: 'pages/faculty.html',
  curriculum: 'pages/curriculum.html',
  activities: 'pages/activities.html',
  admission: 'pages/admission.html',
  'degree-show-detail': 'pages/degree-show-detail.html',
  library: 'pages/library.html',
  atlas: 'pages/atlas.html',
  generate: 'pages/create.html',
  alumni: 'pages/alumni.html',
  support: 'pages/donate.html',
  regulations: 'pages/regulations.html',
  sitemap: 'pages/sitemap.html',
  404: 'pages/404.html',
};

// key＝「組.內部代號」：page.<route 名>＝頁面；其餘＝該頁的分頁。值＝英文顯示名小寫、空白換連字號。
// 首頁（/）與 404 固定、不在表裡。scripts/setup-site-slugs.cjs 讀這段物件字面值去後台補列——維持純字面值、別放運算。
export const SLUG_DEFAULTS = {
  'page.about': 'about',
  'page.faculty': 'faculty',
  'page.curriculum': 'curriculum',
  'page.activities': 'activities',
  'page.admission': 'admissions',
  'page.degree-show-detail': 'degree-show',
  'page.library': 'library',
  'page.atlas': 'world',
  'page.generate': 'create',
  'page.alumni': 'alumni-association',
  'page.support': 'donate',
  'page.regulations': 'regulations-and-policies',
  'page.sitemap': 'site-map',
  'faculty.fulltime': 'full-time-professors',
  'faculty.parttime': 'part-time-professors',
  'faculty.admin': 'administrators',
  'faculty.founder': 'founder',
  'curriculum.bfa-animation': 'bfa-animation-and-moving-image',
  'curriculum.bfa-cmd': 'bfa-creative-media-design',
  'curriculum.mdes': 'mdes',
  'activities.exhibitions': 'exhibitions',
  'activities.degree-show': 'degree-shows',
  'activities.workshop': 'workshops',
  'activities.lectures': 'lectures',
  'activities.visits': 'visits',
  'activities.competitions': 'competitions',
  'activities.conferences': 'forums',
  'activities.students-present': 'students-present',
  'activities.industry': 'industry-partnerships',
  'admission.news': 'announcements',
  'admission.summer-camp': 'camps',
  'library.awards': 'awards',
  'library.press': 'press',
  'library.files': 'documents',
  'library.album': 'albums',
};

// 各頁的分頁寫在網址的哪裡（'#'＝hash）
const TAB_PARAM = { faculty: 'section', activities: 'section', admission: 'section', curriculum: 'program', library: '#' };
const RESERVED_PAGE_SLUGS = ['404', 'index', 'pages'];
const CACHE_KEY = 'sccd-slugs';   // 同 js/utils/layout-mode.js

let table = {};      // key → slug（生效中）
let reverse = {};    // 組 → { slug: 內部代號 }

// 預設＋合法的覆寫。該筆不能用就退回預設：格式不對（空、非 a-z0-9-、頁面保留字）、不認得的 key、
// 跟同組別的 slug 撞名、分頁 slug 跟同頁另一個分頁的內部代號同名（站內連結帶的是內部代號，會認錯）
function build(over) {
  const t = {}, rev = {};
  const parts = (key) => { const d = key.indexOf('.'); return [key.slice(0, d), key.slice(d + 1)]; };
  const put = (key, slug) => { const [group, id] = parts(key); (rev[group] || (rev[group] = {}))[slug] = id; t[key] = slug; };
  const usable = (key) => {
    const [group, id] = parts(key), slug = over && over[key];
    return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)
      && !(group === 'page' && RESERVED_PAGE_SLUGS.includes(slug))
      && !(group !== 'page' && slug !== id && `${group}.${slug}` in SLUG_DEFAULTS);
  };
  const reject = (key) => {
    if (over && over[key] && over[key] !== SLUG_DEFAULTS[key]) console.warn(`[slugs] ${key} 的「${over[key]}」不能用（格式不對或跟同組別的撞名），改用預設 ${SLUG_DEFAULTS[key]}`);
    put(key, SLUG_DEFAULTS[key]);
  };
  const keys = Object.keys(SLUG_DEFAULTS), custom = keys.filter(usable);
  keys.filter(k => !custom.includes(k)).forEach(reject);   // 沒改的先佔位，改過的才看有沒有撞到
  custom.forEach(k => { const [group] = parts(k); if (rev[group] && rev[group][over[k]]) reject(k); else put(k, over[k]); });
  table = t;
  reverse = rev;
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || null; } catch (e) { return null; }
}
build(readCache());

// 後台的最新值（單次請求）。resolve 後 table 已換成最新；失敗＝維持上次讀到的／預設
export const slugsFresh = (async () => {
  try {
    const rows = await fetchCmsJson(`${CMS_API_BASE}/site_slugs?limit=-1&fields=key,slug`, 5000);
    const over = {};
    (rows || []).forEach(r => { if (r && r.key) over[r.key] = r.slug; });
    build(over);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(table)); } catch (e) { /* 存不進去＝下次照樣先用預設 */ }
  } catch (e) { /* 後台連不上／表還沒建 */ }
})();

// ── 頁面 ──
/** route 名 → slug（首頁＝''） */
export const pageSlug = (page) => (page === 'index' ? '' : page === '404' ? '404' : table[`page.${page}`] || page);
/** slug → route 名（不認得＝null） */
export const pageOfSlug = (slug) => (slug === '404' ? '404' : (reverse.page && reverse.page[slug]) || null);

// 正式站（已設 SPA fallback：CloudFront 403/404→index.html）網址列才用乾淨 slug；其餘（本機、GitHub Pages 預覽）用真實檔案路徑，
// 任何 server 都找得到實體檔、refresh 不 404。⚠️ 把網域加進來「之前」該站的 fallback 必須先設好（docs/前台上線流程-S3-CloudFront.md）
export const CLEAN_URL_HOSTS = ['sccd.usc.edu.tw'];
/** route 名 → 寫進網址列的 pathname */
export function pagePath(page) {
  if (page === 'index') return SITE_BASE_PATHNAME;
  return SITE_BASE_PATHNAME + (CLEAN_URL_HOSTS.includes(window.location.hostname) ? pageSlug(page) : PAGE_FILES[page]);
}

const FILE_PAGES = Object.fromEntries(Object.entries(PAGE_FILES).map(([page, f]) => [f.split('/').pop().replace('.html', ''), page]));
/** 目前網址是哪一頁（route 名）。網址列是 slug 或真實檔案路徑都認；不認得＝null */
export function currentPage(pathname = window.location.pathname) {
  const last = pathname.replace(/\/$/, '').split('/').pop() || '';
  if (!last || pathname === SITE_BASE_PATHNAME) return 'index';
  return last.endsWith('.html') ? FILE_PAGES[last.slice(0, -5)] || null : pageOfSlug(last);
}
/** 同上、回檔名（atlas／create／donate…；首頁 index）——舊的「pathname 最後一段去 .html」判頁處用這個，不認得的原樣回 */
export function currentPageFile() {
  const page = currentPage();
  if (page) return PAGE_FILES[page].split('/').pop().replace('.html', '');
  return window.location.pathname.split('/').pop().replace('.html', '') || 'index';
}

// ── 分頁 ──
/** 分頁內部代號 → slug（沒登記的原樣回：library 的項目 hash 等） */
export const tabSlug = (page, id) => table[`${page}.${id}`] || id;

/** 內部寫法 → 網址列寫法 */
export function toPublic(page, search = '', hash = '') {
  const p = TAB_PARAM[page];
  if (!p) return { search, hash };
  if (p === '#') return { search, hash: hash.length > 1 ? '#' + tabSlug(page, hash.slice(1)) : hash };
  const sp = new URLSearchParams(search), v = sp.get(p);
  if (!v || !table[`${page}.${v}`]) return { search, hash };
  sp.set(p, table[`${page}.${v}`]);
  return { search: '?' + sp, hash };
}

/**
 * 網址列寫法 → 內部寫法。strict＝只認 slug（乾淨網址進來的：舊的內部代號當作沒帶）；
 * 非 strict＝slug 或內部代號都收（站內連結、真實檔案路徑——程式組的 href 帶的是內部代號，開新分頁也要通）
 */
export function toInternal(page, search = '', hash = '', strict = true) {
  const p = TAB_PARAM[page];
  if (!p) return { search, hash };
  const rev = reverse[page] || {};
  if (p === '#') {
    const v = hash.slice(1);
    if (!v) return { search, hash };
    if (rev[v]) return { search, hash: '#' + rev[v] };
    if (table[`${page}.${v}`]) return { search, hash: strict ? '' : hash };   // 舊的分頁代號
    return { search, hash };                                                    // 項目 hash（#f-…、#album-…）原樣
  }
  const sp = new URLSearchParams(search), v = sp.get(p);
  if (v == null) return { search, hash };
  const id = rev[v] || (!strict && table[`${page}.${v}`] ? v : null);
  if (id) sp.set(p, id); else sp.delete(p);   // 不認得＝當作沒帶
  const s = sp.toString();
  return { search: s ? '?' + s : '', hash };
}

const fromCleanUrl = () => !window.location.pathname.endsWith('.html');
/** 目前網址的 query（分頁已換回內部代號）——頁面模組讀 ?section=／?program= 用這個，別直接讀 location.search */
export const readParams = (page) =>
  new URLSearchParams(toInternal(page, window.location.search, '', fromCleanUrl()).search);
/** 目前網址的 hash（不含 #；分頁已換回內部代號） */
export const readTabHash = (page) =>
  toInternal(page, '', window.location.hash, fromCleanUrl()).hash.slice(1);

/** 給人分享／複製的完整網址：search／hash 傳內部寫法 */
export function publicUrl(page, search = '', hash = '') {
  const q = toPublic(page, search, hash);
  return window.location.origin + pagePath(page) + q.search + q.hash;
}
