/**
 * Activities 資料源：Directus activities_<x>（扁平）→ loadListInto 吃的 shape，含 M2A references remap。
 * 對接範本＝summer-camp-source.js（loadListInto 已直接讀 titleEn/Zh、subtitleEn/Zh、locations[]、guests[nameEn/Zh]、
 * descriptionZh；這裡只補它沒自動讀的：descriptionEn→description、startDate→dates[]、媒體 UUID→URL、
 * M2A references→前台 ref shape）。Directus 失敗/空 → fallback 本地 JSON（維持原行為）。
 * 2026-06-17 起接 competitions / industry / workshops（M2A ref trial）。
 * 2026-08-03 起 deep-link/ref 解析鍵一律用 Directus 自帶 `id`（不再靠人工填的 refCode 友善碼——
 * M2A 關聯本身存的就是 target 的 uuid，後台選單也是靠 display_template 顯示標題挑選，refCode 從來
 * 不影響「選誰」，只影響對外網址好不好看；改用 id 後零填寫負擔、target 一定有 id 不會漏。）
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { videoMediaFromUrl } from '../ui/video-player.js';
import { sitePath, SITE_BASE_PATHNAME } from '../ui/site-base.js';

// M2A references deep-fetch：每個目標 collection 都要列一條 item:<col>.id（沒列到的該 ref item 會是 raw uuid）。
// library_documents/press 另取 titleEn/Zh（前台 ref 列要顯示標題；activity 的 title 由 resolveRef 從本地查）。
// document 另取 pdf（前台直接開 PDF viewer，不跳 library）。album 不再當 ref（活動相簿就在活動內），故不 deep-fetch。
// 2026-06-22 起 activities 不再 ref award（改 award → library 單向），故不 deep-fetch library_awards。
const REF_FIELDS = [
  'references.collection',
  'references.item:library_documents.id', 'references.item:library_documents.titleEn', 'references.item:library_documents.titleZh', 'references.item:library_documents.pdf', 'references.item:library_documents.pdfLink',
  'references.item:library_press.id', 'references.item:library_press.titleEn', 'references.item:library_press.titleZh',
  // press 的圖/影片：前台原地開 media lightbox（同 library press 點擊）。M2A 巢狀深取實測可行（2026-06-24）。
  'references.item:library_press.images.directus_files_id', 'references.item:library_press.videoLinks',
  // activity→activity ref 也深取 title：resolveRef 靠本地 JSON 用 id 查標題，但 Directus 記錄是 UUID、本地 JSON 沒有
  //   → 深取 title 直接帶，前台不再依賴本地查（否則 category 有、標題空）。
  'references.item:activities_competitions.id', 'references.item:activities_competitions.titleEn', 'references.item:activities_competitions.titleZh',
  'references.item:activities_industry.id', 'references.item:activities_industry.titleEn', 'references.item:activities_industry.titleZh',
  'references.item:activities_workshops.id', 'references.item:activities_workshops.titleEn', 'references.item:activities_workshops.titleZh',
].join(',');

// activities collection → loadListInto SECTION_DATA_URL 的 section key（workshops 是單數 'workshop'）
const ACT_SECTION = {
  activities_competitions: 'competitions',
  activities_industry: 'industry',
  activities_workshops: 'workshop',
};
// library_press 面板自己的 DOM id 是 `press-${row.id}`（library-panels.js）→ href 要加同樣前綴才對得上，
// 否則 deep-link 落地後 getElementById 找不到目標（2026-08-03 前是用 refCode 裸值，本來就對不上，見上）。
const libHref = (id) => id ? `${SITE_BASE_PATHNAME}pages/library.html#press-${id}` : undefined;

// 一筆 M2A ref {collection, item:{id,titleEn?,titleZh?,pdf?}} → 前台 ref shape（resolveRef 認得的形狀）。
// activity 回 {section,itemId} 讓 resolveRef 從本地補 href+title；
// document 回 {pdfUrl} → 直接開共用 PDF viewer lightbox（不跳 library）；
// press 有圖/影片 → 回 {pressMedia} 原地開 media lightbox（同 library press 點擊）；都沒有才回 href 跳 library deep-link。
// album / award 不再當 ref：相簿就在活動內、award 改 award → library 單向（return null 略過）。
function remapRef(r) {
  const it = (r && typeof r.item === 'object' && r.item) ? r.item : {};
  const id = it.id;
  if (!id) return null;  // 深取失敗/target 已被刪 → 略過（正常情況 Directus row 一定有 id，不會漏）
  switch (r.collection) {
    case 'activities_competitions':
    case 'activities_industry':
    case 'activities_workshops':    return { section: ACT_SECTION[r.collection], itemId: id, titleEn: it.titleEn || '', titleZh: it.titleZh || '' };
    // document：直接開 PDF viewer lightbox。沒上傳 pdf 就略過（沒檔可開、避免空按鈕）。
    case 'library_documents': {      const pdfUrl = it.pdfLink || (it.pdf ? fileUrl(it.pdf) : '');  // 貼的 CloudFront 網址優先
      return pdfUrl ? { labelEn: 'Documents', labelZh: '文件', titleEn: it.titleEn || '', titleZh: it.titleZh || '', pdfUrl } : null; }
    // press：組 media（圖 + YouTube 影片，shape 對齊 activities-lightbox / library press lightbox）。
    // 有 media → pressMedia（前台原地開 lightbox）；都沒有 → href 退回 library deep-link（不壞舊行為）。
    case 'library_press': {
      const media = [
        ...normalizeFiles(it.images).map(src => ({ type: 'image', src, thumb: src })),
        // yt/m3u8 分流交給共用 helper（m3u8 → videoKind:'hls' 自製播放器）
        ...ytUrls(it.videoLinks).map(u => videoMediaFromUrl(u)).filter(Boolean),
      ];
      const base = { labelEn: 'Press', labelZh: '報導', titleEn: it.titleEn || '', titleZh: it.titleZh || '' };
      return media.length ? { ...base, pressMedia: media } : { ...base, href: libHref(id) };
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
  // slice(0,10)：date 欄有時回 'YYYY-MM-DDT..'（repeater），只取日期段免 split NaN
  const a = String(s).slice(0, 10).split('-').map(Number), b = String(e || s).slice(0, 10).split('-').map(Number);
  return [{ startYear: a[0], startMonth: a[1], startDay: a[2], endYear: b[0], endMonth: b[1], endDay: b[2] }];
}
// dates 欄：優先讀 repeater（每列＝一批 {start, end?}；end 空＝單日 → 前台渲染 MM/DD, MM/DD 逗號串接）；
// 沒填 repeater 才 fallback 舊的單一 startDate/endDate scalar（遷移期並存，舊資料照常）。
function buildDateGroups(reps, s, e) {
  if (Array.isArray(reps) && reps.length)
    return reps.filter(d => d?.start).map(d => buildDates(d.start, d.end)[0]);
  return s ? buildDates(s, e) : [];
}
const ytUrls = (arr) => Array.isArray(arr) ? arr.map(v => typeof v === 'string' ? v : (v?.url || '')).filter(Boolean) : [];

// Directus row → loadListInto-friendly item
// stamp：dedicated collection 沒有 category/visitType/exhibitionType 欄，但前台 loadListInto 仍用這些 filter
//   （visits 拆 in/out、exhibitions 拆 special/permanent）→ 由 caller 依 collection 補判別值，資料進來才不被濾掉。
function mapRow(r, category, stamp) {
  // conference 專屬（其他 collection 無此兩欄，變數為 null/undefined → 下方 spread 略過）：
  //   city：Directus 把城市存在 locations[].cityEn/cityZh（venue 的所在城市），但前台第三欄讀 top-level item.cityEn/cityZh
  //         → hoist 第一個有填城市的 location 上來（單一 venue 的 conference 即 locations[0]）。
  //   sessions：o2m 每日場次深取後是完整物件；Directus 存 startDate/endDate，buildSessionsHtml 讀 s.dates group
  //         → 組出 dates 供渲染，並依 startDate 排序（Directus 深取不保證按日期回傳，實測 07-21 會排在 07-20 前）。
  const locWithCity = Array.isArray(r.locations) ? r.locations.find(l => l?.cityEn || l?.cityZh) : null;
  const sessions = (Array.isArray(r.sessions) && typeof r.sessions[0] === 'object')
    ? [...r.sessions]
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
        .map(s => ({ ...s, dates: s.startDate ? buildDates(s.startDate, s.endDate) : [] }))
    : r.sessions;
  return {
    ...r,
    id: r.id,                                    // 前台用 Directus 自帶 id 當 element id + ref 解析鍵
    ...(category ? { category } : {}),           // dedicated collection 無 category 欄 → 補上給 categoryFilter 比對
    ...(stamp || {}),                            // visitType / exhibitionType 等子類型判別欄（同上）
    description: r.descriptionEn || '',          // introField 預設 'description' 讀 item.description（EN）；descriptionZh 前台自動讀
    dates: buildDateGroups(r.dates, r.startDate, r.endDate),
    poster: fileUrl(r.poster),
    images: normalizeFiles(r.images),
    videos: ytUrls(r.videoLinks),
    videoLinks: undefined,                       // videoLinks 已折進 videos；清掉原欄，否則 getAllVideos 同一支影片會從兩個來源各算一次＝雙 tile（不是去重內容，是移除重複來源欄；後台真填兩支不同影片仍照數）
    references: remapRefs(r.references),
    ...(locWithCity ? { cityEn: locWithCity.cityEn || '', cityZh: locWithCity.cityZh || '' } : {}),
    ...(sessions !== undefined ? { sessions } : {}),
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
 * @param {{category?: string, stamp?: object}} [opts]  stamp = 補到每筆的子類型判別欄（visitType/exhibitionType）
 */
export async function loadActivityCollection(collection, fallbackUrl, opts = {}) {
  try {
    // images 是 files M2M：fields=* 只回 junction row id（非檔案 UUID）→ normalizeFiles 組出 404 asset。
    // 必須深取 images.directus_files_id 才拿到真正檔案 UUID（同 REF_FIELDS 對 library_press.images 的做法）。
    // sessions（conference 每日場次 o2m）：fields=* 只回 session id 陣列 → 必須 sessions.* 深取才拿到 titleEn/guests；
    //   只有 activities_conferences 有此欄，其他 collection 帶上會 400（未知欄）整包 fetch fail → 只對 conferences 加。
    const sessionsField = collection === 'activities_conferences' ? ',sessions.*' : '';
    const res = await fetch(`${CMS_API_BASE}/${collection}?limit=-1&sort=sort&fields=*,images.directus_files_id${sessionsField},${REF_FIELDS}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(r => mapRow(r, opts.category, opts.stamp)));
  } catch (err) {
    console.warn(`[activities-source] ${collection} CMS fetch failed → 本地 ${fallbackUrl}:`, err.message);
    return fetch(sitePath(fallbackUrl)).then(r => r.json());
  }
}

// 常設展演（parent activities_exhibitions_permanent + o2m events）→ loadListInto 吃的 [{year:'', items}] shape。
// 扁平 list 不同：parent 是展演本身（title / note 頻率 / description），events 是歷屆場次相簿 → 映射成 item.albums。
// note（每學期舉辦一次）是頻率說明非真實日期 → 塞 date/date_en 讓 computeDateDisplay 原樣輸出（配合 dateFullWidth）。
const pad2 = (n) => String(n).padStart(2, '0');
function mapPermanentEvent(e) {
  const s = String(e.startDate || '').slice(0, 10).split('-').map(Number);
  const en = String(e.endDate || e.startDate || '').slice(0, 10).split('-').map(Number);
  const date = s[1] ? `${pad2(s[1])}/${pad2(s[2])} - ${pad2(en[1])}/${pad2(en[2])}` : '';
  return { year: s[0] || '', date, location: e.nameEn || '', location_zh: e.nameZh || '', images: normalizeFiles(e.albumImages) };
}
export async function loadPermanentExhibitions(fallbackUrl) {
  try {
    const res = await fetch(`${CMS_API_BASE}/activities_exhibitions_permanent?limit=-1&sort=sort&fields=*,events.*,events.albumImages.directus_files_id`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    const items = rows.map(r => ({
      id: r.id,
      titleEn: r.titleEn || '', titleZh: r.titleZh || '',
      date_en: r.noteEn || '', date: r.noteZh || '',
      description: r.descriptionEn || '', descriptionZh: r.descriptionZh || '',
      poster: fileUrl(r.mainImage),
      albums: (Array.isArray(r.events) ? [...r.events] : [])
        .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))  // 新→舊
        .map(mapPermanentEvent),
    }));
    return [{ year: '', items }];
  } catch (err) {
    console.warn(`[activities-source] permanent CMS fetch failed → 本地 ${fallbackUrl}:`, err.message);
    return fetch(sitePath(fallbackUrl)).then(r => r.json());
  }
}

// 相簿「moment」桶：本地是 general-activities.json 一檔混 visits/exhibitions/competitions/conferences，
// 後台則是各自獨立 collection。這裡 raw fetch 每個 collection 再 groupByYear 併起來——不逐個走
// loadActivityCollection 的 fallback，否則 CMS 掛掉時每支都 fallback 整檔＝同一筆被算多次；改成任一支非 200
// 或全空時，一次性 fallback 本地整檔（維持 CMS 掛掉照常渲染）。
const MOMENT_COLLECTIONS = [
  ['activities_competitions', 'competitions'],
  ['activities_conferences', 'conferences'],
  ['activities_exhibitions_special', 'exhibitions'],
  ['activities_visits_inbound', 'visits'],
  ['activities_visits_outbound', 'visits'],
];
export async function loadGeneralActivitiesAlbum() {
  try {
    const perCol = await Promise.all(MOMENT_COLLECTIONS.map(async ([col, cat]) => {
      const res = await fetch(`${CMS_API_BASE}/${col}?limit=-1&sort=sort&fields=*,images.directus_files_id`);
      if (!res.ok) throw new Error(`${col} HTTP ${res.status}`);
      const rows = (await res.json()).data;
      return (Array.isArray(rows) ? rows : []).map(r => mapRow(r, cat));
    }));
    const merged = perCol.flat();
    if (!merged.length) throw new Error('empty');
    return groupByYear(merged);
  } catch (err) {
    console.warn('[activities-source] moment 合併 CMS fetch failed → 本地 general-activities.json:', err.message);
    return fetch(sitePath('/data/general-activities.json')).then(r => r.json());
  }
}
