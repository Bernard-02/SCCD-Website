/**
 * Activities 資料源：Directus activities_<x>（扁平）→ loadListInto 吃的 shape，含 M2A references remap。
 * 對接範本＝summer-camp-source.js（loadListInto 已直接讀 titleEn/Zh、subtitleEn/Zh、locations[]、guests[nameEn/Zh]、
 * descriptionZh；這裡只補它沒自動讀的：descriptionEn→description、startDate→dates[]、媒體 UUID→URL、id=refCode、
 * M2A references→前台 ref shape）。Directus 失敗/空 → fallback 本地 JSON（維持原行為）。
 * 2026-06-17 起接 competitions / industry / workshops（M2A ref trial）。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { sitePath, SITE_BASE_PATHNAME } from '../ui/site-base.js';

// M2A references deep-fetch：每個目標 collection 都要列一條 item:<col>.refCode（沒列到的該 ref item 會是 raw uuid）。
// library_documents/press 另取 titleEn/Zh（前台 ref 列要顯示標題；activity 的 title 由 resolveRef 從本地查）。
// document 另取 pdf（前台直接開 PDF viewer，不跳 library）。album 不再當 ref（活動相簿就在活動內），故不 deep-fetch。
// 2026-06-22 起 activities 不再 ref award（改 award → library 單向），故不 deep-fetch library_awards。
const REF_FIELDS = [
  'references.collection',
  'references.item:library_documents.refCode', 'references.item:library_documents.titleEn', 'references.item:library_documents.titleZh', 'references.item:library_documents.pdf',
  'references.item:library_press.refCode', 'references.item:library_press.titleEn', 'references.item:library_press.titleZh',
  // press 的圖/影片：前台原地開 media lightbox（同 library press 點擊）。M2A 巢狀深取實測可行（2026-06-24）。
  'references.item:library_press.images.directus_files_id', 'references.item:library_press.videoLinks',
  'references.item:activities_competitions.refCode',
  'references.item:activities_industry.refCode',
  'references.item:activities_workshops.refCode',
].join(',');

// activities collection → loadListInto SECTION_DATA_URL 的 section key（workshops 是單數 'workshop'）
const ACT_SECTION = {
  activities_competitions: 'competitions',
  activities_industry: 'industry',
  activities_workshops: 'workshop',
};
const libHref = (refCode) => refCode ? `${SITE_BASE_PATHNAME}pages/library.html#${refCode}` : undefined;

// 一筆 M2A ref {collection, item:{refCode,titleEn?,titleZh?,pdf?}} → 前台 ref shape（resolveRef 認得的形狀）。
// activity 回 {section,itemId} 讓 resolveRef 從本地補 href+title；
// document 回 {pdfUrl} → 直接開共用 PDF viewer lightbox（不跳 library）；
// press 有圖/影片 → 回 {pressMedia} 原地開 media lightbox（同 library press 點擊）；都沒有才回 href 跳 library deep-link。
// album / award 不再當 ref：相簿就在活動內、award 改 award → library 單向（return null 略過）。
function remapRef(r) {
  const it = (r && typeof r.item === 'object' && r.item) ? r.item : {};
  const code = it.refCode;
  if (!code) return null;  // 目標沒填 refCode → 無法當 ref id，略過（友善碼是 ref 的連結鍵）
  switch (r.collection) {
    case 'activities_competitions':
    case 'activities_industry':
    case 'activities_workshops':    return { section: ACT_SECTION[r.collection], itemId: code };
    // document：直接開 PDF viewer lightbox。沒上傳 pdf 就略過（沒檔可開、避免空按鈕）。
    case 'library_documents':       return it.pdf ? { labelEn: 'Documents', labelZh: '文件', titleEn: it.titleEn || '', titleZh: it.titleZh || '', pdfUrl: fileUrl(it.pdf) } : null;
    // press：組 media（圖 + YouTube 影片，shape 對齊 activities-lightbox / library press lightbox）。
    // 有 media → pressMedia（前台原地開 lightbox）；都沒有 → href 退回 library deep-link（不壞舊行為）。
    case 'library_press': {
      const media = [
        ...normalizeFiles(it.images).map(src => ({ type: 'image', src, thumb: src })),
        ...ytUrls(it.videoLinks).map(u => {
          const vid = u.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
          return vid ? { type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` } : null;
        }).filter(Boolean),
      ];
      const base = { labelEn: 'Press', labelZh: '報導', titleEn: it.titleEn || '', titleZh: it.titleZh || '' };
      return media.length ? { ...base, pressMedia: media } : { ...base, href: libHref(code) };
    }
    default: return null;  // library_album 等其餘 collection 不當 ref
  }
}
const remapRefs = (arr) => Array.isArray(arr) ? arr.map(remapRef).filter(Boolean) : [];

// 媒體：UUID/展開物件/M2M junction → assets URL（同 summer-camp-source）；poster 已是 URL/路徑則原樣用
const asset = (u) => u ? `${CMS_ASSETS_BASE}/${u}` : '';
const isUrlish = (s) => typeof s === 'string' && /^(https?:|\.\.?\/|\/)/.test(s);
function fileUrl(f) {
  if (!f) return '';
  if (isUrlish(f)) return f;
  return typeof f === 'string' ? asset(f) : asset(f.id);
}
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (isUrlish(x)) return x;
    if (typeof x === 'string') return asset(x);
    if (x?.directus_files_id) { const f = x.directus_files_id; return asset(typeof f === 'string' ? f : f?.id); }
    return asset(x?.id);
  }).filter(Boolean);
}
// '2025-01-15' (+'2025-01-18') → [{startYear,startMonth,startDay,endYear,endMonth,endDay}]
function buildDates(s, e) {
  const a = s.split('-').map(Number), b = (e || s).split('-').map(Number);
  return [{ startYear: a[0], startMonth: a[1], startDay: a[2], endYear: b[0], endMonth: b[1], endDay: b[2] }];
}
const ytUrls = (arr) => Array.isArray(arr) ? arr.map(v => typeof v === 'string' ? v : (v?.url || '')).filter(Boolean) : [];

// Directus row → loadListInto-friendly item
function mapRow(r, category) {
  return {
    ...r,
    id: r.refCode || r.id,                       // 前台用 refCode 當 element id + ref 解析鍵（對齊 ref 指向的友善碼）
    ...(category ? { category } : {}),           // dedicated collection 無 category 欄 → 補上給 categoryFilter 比對
    description: r.descriptionEn || '',          // introField 預設 'description' 讀 item.description（EN）；descriptionZh 前台自動讀
    dates: r.startDate ? buildDates(r.startDate, r.endDate) : [],
    poster: fileUrl(r.poster),
    images: normalizeFiles(r.images),
    videos: ytUrls(r.videoLinks),
    references: remapRefs(r.references),
  };
}

// loadListInto 吃的活動類 data 是 year-grouped [{year, items}]（見 activities-data-loader.js loadListInto 註解）。
// 依 dates[0].startYear 分組、新→舊；無日期歸到 '—' 排最後。
function groupByYear(items) {
  const byYear = new Map();
  items.forEach(it => {
    const y = it.dates?.[0]?.startYear ?? '—';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(it);
  });
  return [...byYear.entries()]
    .sort((a, b) => (Number(b[0]) || -Infinity) - (Number(a[0]) || -Infinity))
    .map(([year, items]) => ({ year, items }));
}

/**
 * @param {string} collection  Directus collection（如 'activities_competitions'）
 * @param {string} fallbackUrl 本地 JSON 路徑（Directus 失敗/空時用）
 * @param {{category?: string}} [opts]
 */
export async function loadActivityCollection(collection, fallbackUrl, opts = {}) {
  try {
    const res = await fetch(`${CMS_API_BASE}/${collection}?limit=-1&sort=sort&fields=*,${REF_FIELDS}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(r => mapRow(r, opts.category)));
  } catch (err) {
    console.warn(`[activities-source] ${collection} CMS fetch failed → 本地 ${fallbackUrl}:`, err.message);
    return fetch(sitePath(fallbackUrl)).then(r => r.json());
  }
}
