/**
 * Summer Camp 資料源（共用）
 * Directus admission_summer_camp（扁平）→ 本地 summer-camp.json 的 year-grouped shape
 * （loadListInto 吃這個；它已直接讀 titleEn/Zh、subtitleEn/Zh、locations[]、videoLinks）。
 * 主要補：dates 結構化（startDate/endDate → [{startYear,...}]）、EN 描述（descriptionEn→description）、
 * 圖片媒體（poster/images）走 CloudFront、依年份分組。Directus 失敗 → fallback 本地 /data/summer-camp.json。
 * admission 頁「營隊」tab 與 activities 頁共用 loadSummerCampInto → 都吃這個來源。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';

const CMS_COLLECTION = 'admission_summer_camp';

// 逾時 + last-known-good：同 activities-source（本地 /data/*.json 是假資料 → 退場，改存 sessionStorage 上次成功真資料）。
function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}
const LKG_KEY = 'sccd:act:summer-camp';
function saveLKG(data) { try { sessionStorage.setItem(LKG_KEY, JSON.stringify(data)); } catch {} }
function readLKG() { try { const s = sessionStorage.getItem(LKG_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }

export async function loadSummerCamp() {
  try {
    // *.* 展開 poster 檔案物件（含 filename_disk）＋ references 附件；images 是 M2M junction，多深一層
    // 取 directus_files_id.filename_disk 才拿得到檔名（*.* 只到 junction 層）→ 組 CloudFront URL。
    const res = await fetchWithTimeout(`${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort&fields=*.*,images.directus_files_id.filename_disk`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    const grouped = groupByYear(rows.map(mapRow));
    saveLKG(grouped);
    return grouped;
  } catch (err) {
    // Directus-only → last-known-good；連它都沒 → throw（activities switchToSection / admission try-finally 各自處理）
    const lkg = readLKG();
    if (lkg) { console.warn('[summer-camp] fetch failed → last-known-good:', err.message); return lkg; }
    throw err;
  }
}

// Directus item → loadListInto-friendly（保留它直接讀的欄位，補它要的 dates/description/媒體）
function mapRow(r) {
  return {
    ...r,
    description: r.descriptionEn || '',                            // loadListInto intro EN 讀 item.description（zh 讀 descriptionZh 已吻合）
    dates: r.startDate ? buildDates(r.startDate, r.endDate) : [],  // 日期優先讀 item.dates（結構化）
    // 「取消」判定：後台 isCancelled 旗標為主；相容舊資料（取消梯次不填日期）→ 無 startDate 也算取消。
    // 有日期又被標取消（取消已排定梯次）仍走 dates 歸到正確年份，只把日期文字覆蓋成「取消」。
    ...(r.isCancelled || !r.startDate ? { date: '取消' } : {}),
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
  // 組內依「月/日新→舊」排（user 2026-08-28：清單一律 12→1 月，不吃後台手動 sort；取消/無日期者排最後）。
  const monthDayKey = it => { const d = it.dates?.[0]; return d ? (d.startMonth || 0) * 100 + (d.startDay || 0) : -Infinity; };
  return [...byYear.entries()]
    .sort((a, b) => (Number(b[0]) || -Infinity) - (Number(a[0]) || -Infinity))
    .map(([year, items]) => ({ year, items: [...items].sort((a, b) => monthDayKey(b) - monthDayKey(a)) }));
}

// 圖片（poster / images）走 CloudFront（d2df28pyzslt2v，直吃 S3）繞過弱機 /assets 5s 逾時回 403、全站掉圖
// （見 memory reference_directus_s3_timeout_all_assets_down）。用檔案的即時 filename_disk（<uuid>.<副檔名>）組 key、
// 不寫死副檔名 → 離線 webp 轉檔（.jpg/.png→.webp）自動跟上。影片走 videoLinks（loadListInto 直接讀 url），不經此。
// null/空→''；已是 URL / 本地路徑（防禦性；fallback JSON 不經 mapRow 故正常走不到）→ 原樣。
const asset = (name) => {
  if (!name) return '';
  if (/^(https?:)?\/\//.test(name) || name.startsWith('/') || name.startsWith('../')) return name;
  return `${CMS_CDN_BASE}/${name}`;
};
// poster：*.* 展開的檔案物件 { filename_disk }（相容純字串）
function fileUrl(f) {
  if (!f) return '';
  return asset(typeof f === 'string' ? f : f?.filename_disk);
}
// images：M2M junction，每列 directus_files_id 深取成 { filename_disk }
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return asset(x);
    const f = x?.directus_files_id;
    if (f) return asset(typeof f === 'string' ? f : f?.filename_disk);
    return asset(x?.filename_disk);
  }).filter(Boolean);
}
