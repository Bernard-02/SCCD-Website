/**
 * Summer Camp 資料源（共用）
 * Directus admission_summer_camp（扁平）→ 本地 summer-camp.json 的 year-grouped shape
 * （loadListInto 吃這個；它已直接讀 titleEn/Zh、subtitleEn/Zh、locations[]、videoLinks）。
 * 主要補：dates 結構化（startDate/endDate → [{startYear,...}]）、EN 描述（descriptionEn→description）、
 * 媒體 UUID→asset URL、依年份分組。Directus 失敗 → fallback 本地 /data/summer-camp.json。
 * admission 頁「營隊」tab 與 activities 頁共用 loadSummerCampInto → 都吃這個來源。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';

const CMS_COLLECTION = 'admission_summer_camp';
const FALLBACK_JSON = '/data/summer-camp.json';

export async function loadSummerCamp() {
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort&fields=*.*`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(mapRow));
  } catch (err) {
    console.warn('[summer-camp] CMS fetch failed, fallback to /data/summer-camp.json:', err.message);
    return fetch(FALLBACK_JSON).then(r => r.json());
  }
}

// Directus item → loadListInto-friendly（保留它直接讀的欄位，補它要的 dates/description/媒體）
function mapRow(r) {
  return {
    ...r,
    description: r.descriptionEn || '',                            // loadListInto intro EN 讀 item.description（zh 讀 descriptionZh 已吻合）
    dates: r.startDate ? buildDates(r.startDate, r.endDate) : [],  // 日期優先讀 item.dates（結構化）
    ...(r.startDate ? {} : { date: '取消' }),                      // 取消無日期 → 顯示「取消」字串
    // 主辦單位 organizers {organizerZh, organizerEn} → 映射成 guests shape {nameEn, nameZh}，
    // 直接套 loadListInto 既有的 guest layout（buildGuestHtml：名稱 EN/ZH 粗體；營隊無 country/affiliation 故右側留空）。
    guests: (r.organizers || []).map(o => ({ nameEn: o.organizerEn || '', nameZh: o.organizerZh || '' }))
                                .filter(g => g.nameEn || g.nameZh),
    poster: fileUrl(r.poster),
    images: normalizeFiles(r.images),
  };
}

// '2025-07-16' + '2025-07-19' → [{startYear:2025,startMonth:7,startDay:16,endYear:2025,endMonth:7,endDay:19}]
function buildDates(startDate, endDate) {
  const s = startDate.split('-').map(Number);
  const e = (endDate || startDate).split('-').map(Number);
  return [{ startYear: s[0], startMonth: s[1], startDay: s[2], endYear: e[0], endMonth: e[1], endDay: e[2] }];
}

// 依 startDate 年份分組（新→舊）。⚠️ 取消的營隊原始資料沒存年份（startDate=null）→ 沿用「上一梯年份遞減」
// 推估分組標頭（營隊約一年一梯，僅近似）；之後在 Directus 補上 startDate 即用真實年份、此推估自動失效。
function groupByYear(rows) {
  const byYear = new Map();
  let lastDated = null, gap = 0;
  rows.forEach(r => {
    const y = r.dates?.[0]?.startYear;
    let year;
    if (y) { year = y; lastDated = y; gap = 0; }
    else if (lastDated != null) { year = lastDated - (++gap); }
    else year = null;
    const key = year ?? '—';
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key).push(r);
  });
  return [...byYear.entries()]
    .sort((a, b) => (Number(b[0]) || -Infinity) - (Number(a[0]) || -Infinity))
    .map(([year, items]) => ({ year, items }));
}

// 媒體：null→''；UUID 字串 / 展開 file 物件 / M2M junction 都解析成 assets URL
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
