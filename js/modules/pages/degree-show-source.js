/**
 * Degree Show 資料源（共用）
 * Directus activities_degree_show（+ o2m events、files 圖片）→ 本地 degree-show.json 的
 * year-keyed shape（degree-show-data-loader.js 的 list 與 detail 都吃這個）。
 * Directus-only（同 summer-camp-source pattern）：失敗 → sessionStorage last-known-good（上次成功真資料）→ 都沒有 throw。
 *
 * 欄名對映（後台 → 前台）：titleZh→title、titleEn→title_en、bannerImage→heroImage、
 *   mainVideoUrl→videoUrl、poster(files)→poster(第一張)、event.startDate/endDate→time 字串、
 *   event 兩型（activity M2A 有連＝關聯型：欄位/照片從被連活動拉、取第一筆；留空＝自有型：手填欄位+event.images）。
 *   相簿由 event.images 組成（無獨立 album 欄，user 2026-08-17）。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { pdfOpenUrl } from './pdf-url.js';

const CMS_COLLECTION = 'activities_degree_show';

// 逾時 + last-known-good：同 activities-source / summer-camp-source（本地 /data/*.json 是假資料 → 退場）。
function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}
const LKG_KEY = 'sccd:act:degree-show';
function saveLKG(data) { try { sessionStorage.setItem(LKG_KEY, JSON.stringify(data)); } catch {} }
function readLKG() { try { const s = sessionStorage.getItem(LKG_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
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
  'references.item:library_documents.pdf.filename_disk',   // pdf 深取 filename_disk → 組 CloudFront 開檔 URL（見 pdf-url.js）
].join(',');
// deep：events 依 sort、帶 event 自身 images + M2A 關聯活動（collection 判別 + item 展開）；parent poster UUID
// 論壇（conference）講者常寫在 sessions[].guests 而非 item.guests → 額外 deep-fetch session 講者
// 圖片檔案欄深取 filename_disk（<uuid>.<副檔名>）→ imgAsset 組 CloudFront URL；直接檔欄 coverImage/bannerImage
// 用 field.filename_disk，M2M（poster / events.images）用 junction.directus_files_id.filename_disk
const FIELDS = `*,coverImage.filename_disk,bannerImage.filename_disk,events.*,events.images.directus_files_id.filename_disk,events.activity.collection,${_activityDeep},events.activity.item:activities_conferences.sessions.guests,references.collection,${_refDeep},poster.directus_files_id.filename_disk`;

export async function loadDegreeShow() {
  try {
    const url = `${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort&fields=${FIELDS}&deep[events][_sort]=sort`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    const grouped = groupByYear(rows.map(mapRow));
    saveLKG(grouped);
    return grouped;
  } catch (err) {
    // Directus-only → last-known-good；連它都沒 → throw（activities switchToSection 顯示錯誤態；detail 頁 catch 自理）
    const lkg = readLKG();
    if (lkg) { console.warn('[degree-show] fetch failed → last-known-good:', err.message); return lkg; }
    throw err;
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
      // 頂層主視覺(mainVideoUrl→videoUrl)+紀錄片(documentaryUrl)轉進相簿；library-panels album builder 讀 videoLinks→videoMediaFromUrl 渲染（原本只走詳情頁 inline 播放器、相簿看不到）
      videoLinks: [e.videoUrl, e.documentaryUrl].filter(Boolean),
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
      const pdfUrl = pdfOpenUrl(it.pdfLink, it.pdf);   // pdfLink 優先，否則上傳檔走 CloudFront（見 pdf-url.js）
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
      time: a ? buildTime(a.startDate, a.endDate, a.dates) : '',  // 以下＝主清單列，欄位從被連活動拉（連結活動已有 dates repeater）
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
    time: buildTime(ev.startDate, ev.endDate, ev.dates),
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

// '2024-05-17' → '05 / 17'；有 endDate 且不同 → '05 / 17 - 05 / 20'。
// dates repeater（每列 {start, end?}，end 空＝單日）優先 → 逗號串接支援不連續日期（04 / 19, 04 / 23）；
// 沒填 repeater 才 fallback 舊 startDate/endDate scalar（遷移期並存，舊資料照常）。
function buildTime(start, end, dates) {
  if (Array.isArray(dates) && dates.length) {
    const parts = dates.filter(d => d?.start).map(d => buildTime(d.start, d.end)).filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  if (!start) return '';
  const s = md(start);
  return end && end !== start ? `${s} - ${md(end)}` : s;
}
function md(d) { const p = String(d).split('-'); return p.length >= 3 ? `${p[1]} / ${p[2]}` : String(d); }

// 顯示用圖片：走 CloudFront（繞過弱機 /assets 常連不到 S3 的 5s 逾時 403，見 memory
// reference_directus_s3_timeout_all_assets_down），從檔案即時 filename_disk 組 key（不寫死副檔名 →
// 離線 webp 轉檔 .jpg/.png→.webp 前台自動跟上）。null/空→''；已是 URL / 本地路徑（fallback json）→ 原樣。
const imgAsset = (name) => {
  if (!name) return '';
  if (/^(https?:)?\/\//.test(name) || name.startsWith('/') || name.startsWith('../')) return name;
  return `${CMS_CDN_BASE}/${name}`;
};
// 直接檔欄深取後為 { filename_disk }；fallback json 可能直接給字串路徑 → 交 imgAsset 守衛原樣放行
function fileUrl(f) {
  if (!f) return '';
  return typeof f === 'string' ? imgAsset(f) : imgAsset(f.filename_disk);
}
// M2M junction 深取後為 { directus_files_id: { filename_disk } }
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return imgAsset(x);
    if (x?.directus_files_id) { const f = x.directus_files_id; return imgAsset(typeof f === 'string' ? f : f?.filename_disk); }
    return imgAsset(x?.filename_disk);
  }).filter(Boolean);
}
