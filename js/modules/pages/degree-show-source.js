/**
 * Degree Show 資料源（共用）
 * Directus activities_degree_show（+ o2m events、files 圖片）→ 本地 degree-show.json 的
 * year-keyed shape（degree-show-data-loader.js 的 list 與 detail 都吃這個）。
 * Directus 失敗 / 空 → fallback 本地 /data/degree-show.json（同 summer-camp-source pattern）。
 *
 * 欄名對映（後台 → 前台）：titleZh→title、titleEn→title_en、bannerImage→heroImage、
 *   mainVideoUrl→videoUrl、poster(files)→poster(第一張)、event.startDate/endDate→time 字串、
 *   event 兩型（activity M2A 有連＝關聯型：欄位/照片從被連活動拉、取第一筆；留空＝自有型：手填欄位+event.images）。
 *   相簿由 event.images 組成（無獨立 album 欄，user 2026-08-17）。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const CMS_COLLECTION = 'activities_degree_show';
const FALLBACK_JSON = 'data/degree-show.json';
// events.activity 是 M2A（可連任一 activity collection）；per-collection deep-fetch 各自顯示欄位 + images
const ACTIVITY_COLLECTIONS = [
  'activities_competitions', 'activities_conferences', 'activities_exhibitions_special',
  'activities_exhibitions_permanent', 'activities_industry', 'activities_lectures',
  'activities_students_present', 'activities_visits_inbound', 'activities_visits_outbound',
  'activities_workshops',
];
const _activityDeep = ACTIVITY_COLLECTIONS.flatMap(c => [
  `events.activity.item:${c}.*`,
  `events.activity.item:${c}.images.directus_files_id`,
]).join(',');
// top-level references M2A（user「後台設的 ref」）：可連活動 collection（→ ref popover 跳轉）
// 或 library_documents（→ ref popover 原地開 PDF lightbox）。deep-fetch 各型 item 拿 title / pdf。
const _refDeep = [
  ...ACTIVITY_COLLECTIONS.map(c => `references.item:${c}.*`),
  'references.item:library_documents.*',
].join(',');
// deep：events 依 sort、帶 event 自身 images + M2A 關聯活動（collection 判別 + item 展開）；parent poster UUID
// 論壇（conference）講者常寫在 sessions[].guests 而非 item.guests → 額外 deep-fetch session 講者
const FIELDS = `*,events.*,events.images.directus_files_id,events.activity.collection,${_activityDeep},events.activity.item:activities_conferences.sessions.guests,references.collection,${_refDeep},poster.directus_files_id`;

export async function loadDegreeShow() {
  try {
    const url = `${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort&fields=${FIELDS}&deep[events][_sort]=sort`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(mapRow));
  } catch (err) {
    console.warn('[degree-show] CMS fetch failed, fallback to /data/degree-show.json:', err.message);
    return fetch(sitePath(FALLBACK_JSON))
      .then(r => r.json())
      .then(groupFallbackByYear);
  }
}

/**
 * 相簿專用：畢展每年攤平成一張 album 卡（cover + 全 events 照片）。
 * Directus 版相片在 events[].images、本地 fallback 版在頂層 images[]（兩者互斥，concat 即可）；
 * 頂層 images 不寫進共用 mapRow——detail 頁會拿它當 event 缺圖的 fallback pool（會污染），故只在此攤平。
 * 回傳一般 year-grouped [{year, items}]，相簿走非 degree-show 路徑（來源設 isDegreeShow:false）。
 */
export async function loadDegreeShowAlbum() {
  const byYear = await loadDegreeShow();
  return Object.entries(byYear).map(([year, entries]) => ({
    year: Number(year),
    items: entries.map(e => ({
      id: e.id,
      titleEn: e.title_en || '',
      titleZh: e.title || '',
      cover: e.coverImage || e.heroImage || (Array.isArray(e.poster) ? e.poster[0] : e.poster) || '',
      images: [
        ...(Array.isArray(e.images) ? e.images : []),
        ...((Array.isArray(e.events) ? e.events : []).flatMap(ev => Array.isArray(ev.images) ? ev.images : [])),
      ],
    })),
  }));
}

// year 當 key（同本地 JSON 物件形狀）；新→舊排序由 loader 自己做
function groupByYear(rows) {
  const out = {};
  rows.forEach(r => {
    if (r.year == null) return;
    const year = String(r.year);
    (out[year] ||= []).push(r);
  });
  return out;
}

function groupFallbackByYear(data) {
  return Object.fromEntries(Object.entries(data || {}).map(([year, entries]) => [
    year,
    Array.isArray(entries) ? entries : [entries],
  ]));
}

function mapRow(r) {
  return {
    id: r.id,
    year: r.year,
    title: r.titleZh || '',
    title_en: r.titleEn || '',
    coverImage: fileUrl(r.coverImage),
    heroImage: fileUrl(r.bannerImage),        // hero banner ← bannerImage
    poster: normalizeFiles(r.poster)[0] || '', // 畢展 KV + 上下屆卡片海報；後台不限張數、前台單槽先取第一張
    videoUrl: r.mainVideoUrl || '',           // ⚠️ 後台欄名 mainVideoUrl → 前台 videoUrl
    documentaryUrl: r.documentaryUrl || '',
    events: (Array.isArray(r.events) ? r.events : []).map(mapEvent),
    references: mapReferences(r.references),   // ref popover（活動連結 + library 文件）；與 events 清單並存
  };
}

// M2A references → ref popover chip：
//   活動 collection → { kind:'activity', source, id, title }（點了 SPA 跳活動頁）
//   library_documents → { kind:'document', title, pdfUrl }（點了原地開 PDF lightbox、不跳 library）
function mapReferences(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(ref => {
    const it = ref && ref.item && typeof ref.item === 'object' ? ref.item : null;
    if (!it) return null;
    if (ref.collection === 'library_documents') {
      const pdfUrl = it.pdfLink || (it.pdf ? asset(it.pdf) : '');   // 貼的 CloudFront 網址優先（refs fetch 用 .* 已含 pdfLink）
      return pdfUrl ? { kind: 'document', titleEn: it.titleEn || '', titleZh: it.titleZh || '', pdfUrl } : null;
    }
    const source = COLLECTION_TO_SECTION[ref.collection];
    return source ? { kind: 'activity', source, id: it.id, titleEn: it.titleEn || '', titleZh: it.titleZh || '' } : null;
  }).filter(Boolean);
}

// 後台 event M2A activity 連的 collection → 前台 activities section key（ref chip 的 label 對應 + SPA 跳轉用；
// 對齊 activities-data-loader SECTION_LABELS keys，注意 workshops→workshop 單數、exhibitions_* 都併 exhibitions）
const COLLECTION_TO_SECTION = {
  activities_competitions: 'competitions',
  activities_conferences: 'conferences',
  activities_exhibitions_special: 'exhibitions',
  activities_exhibitions_permanent: 'exhibitions',
  activities_industry: 'industry',
  activities_lectures: 'lectures',
  activities_students_present: 'students-present',
  activities_visits_inbound: 'visits',
  activities_visits_outbound: 'visits',
  activities_workshops: 'workshop',
};

function mapEvent(ev) {
  // 活動來源 type（後台 scalar discriminator）：
  //   'linked'（連到某活動）→ 兩用：① isRef/source/id/title 給 ref popover（setupRefBtn）；② 也進主 detail 清單
  //     （user 2026-08-17「跟 ref 共存」），time/name/location/guests 全從已 deep-fetch 的被連活動拉。
  //   'self'（活動留空、手填，如新一代/華山）→ 清單一列（time/name/location + 自挑照片 + 手填 guests）。
  const link = Array.isArray(ev.activity) && ev.activity.length ? ev.activity[0] : null;
  const a = link && link.item && typeof link.item === 'object' ? link.item : null;
  if (ev.type === 'linked') {
    const loc = (a && Array.isArray(a.locations) && a.locations[0]) || {};
    return {
      isRef: true,                                       // ref popover chip 用
      source: COLLECTION_TO_SECTION[link && link.collection] || '',
      id: (a && a.id) || (typeof (link && link.item) === 'string' ? link.item : ''),
      titleEn: (a && a.titleEn) || '',
      titleZh: (a && a.titleZh) || '',
      time: a ? buildTime(a.startDate, a.endDate) : '',  // 以下＝主清單列，欄位從被連活動拉
      nameEn: (a && a.titleEn) || '',
      name: (a && a.titleZh) || '',
      locationEn: loc.nameEn || '',
      location: loc.nameZh || '',
      cityEn: loc.cityEn || '',
      city: loc.cityZh || '',
      guests: collectActivityGuests(a),                 // 活動 item.guests + 論壇 sessions[].guests
    };
  }
  return {
    time: buildTime(ev.startDate, ev.endDate),
    nameEn: ev.nameEn || '',
    name: ev.nameZh || '',
    locationEn: ev.locationEn || '',
    location: ev.locationZh || '',
    cityEn: ev.cityEn || '',
    city: ev.cityZh || '',
    images: normalizeFiles(ev.images),
    guests: cleanGuests(ev.guests),                     // 自有型：手填 guests repeater
  };
}

// 活動 guests：item.guests + 論壇（conference）sessions[].guests 合併（user：forum 講者常寫在 session 裡）
function collectActivityGuests(a) {
  if (!a) return [];
  const out = [];
  if (Array.isArray(a.guests)) out.push(...a.guests);
  if (Array.isArray(a.sessions)) a.sessions.forEach(s => { if (Array.isArray(s.guests)) out.push(...s.guests); });
  return cleanGuests(out);
}
function cleanGuests(arr) {
  return Array.isArray(arr) ? arr.filter(g => g && (g.nameZh || g.nameEn)) : [];
}

// '2024-05-17' → '05 / 17'；有 endDate 且不同 → '05 / 17 - 05 / 20'（同本地 time 字串格式，
// loader 用 /\s*-\s*/ split 成起訖兩段）
function buildTime(start, end) {
  if (!start) return '';
  const s = md(start);
  return end && end !== start ? `${s} - ${md(end)}` : s;
}
function md(d) { const p = String(d).split('-'); return p.length >= 3 ? `${p[1]} / ${p[2]}` : String(d); }

// 媒體：null→''；UUID 字串 / 展開 file 物件 / M2M junction 都解析成 assets URL（同 summer-camp-source）
const asset = (uuid) => uuid ? `${CMS_ASSETS_BASE}/${uuid}` : '';
function fileUrl(f) {
  if (!f) return '';
  return typeof f === 'string' ? asset(f) : asset(f.id);
}
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return asset(x);
    if (x?.directus_files_id) { const f = x.directus_files_id; return asset(typeof f === 'string' ? f : f?.id); }
    return asset(x?.id);
  }).filter(Boolean);
}
