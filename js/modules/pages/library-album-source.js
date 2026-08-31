/**
 * Library Album「others」資料源（共用）
 * Directus library_album（扁平）→ 本地 album-others.json 的 year-grouped shape
 * （ALBUM_SOURCES 的消費者已支援 titleEn/Zh + images[] + videoLinks[] 直接讀，不用額外改名）。
 * Directus 失敗/空 → fallback 本地 /data/album-others.json（維持原行為）。
 * library-panels.js（library 頁 Album 面板）的 ALBUM_SOURCES 消費這支（同 summer-camp-source.js 的模式）。
 * （曾有第二消費者 album-data-loader.js，2026-08-19 確認為死碼已刪；見 project_album_two_consumers_directus_wiring 記憶）。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const CMS_COLLECTION = 'library_album';
const FALLBACK_JSON = '/data/album-others.json';

export async function loadOthersAlbum() {
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?fields=*,images.directus_files_id.filename_disk&sort=sort&limit=-1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(mapRow));
  } catch (err) {
    console.warn('[library-album] CMS fetch failed, fallback to /data/album-others.json:', err.message);
    return fetch(sitePath(FALLBACK_JSON)).then(r => r.json());
  }
}

function mapRow(r) {
  return {
    id: r.id,
    year: r.year,
    titleEn: r.titleEn || '', titleZh: r.titleZh || '',
    images: normalizeFiles(r.images),
    videoLinks: Array.isArray(r.videoLinks) ? r.videoLinks : [],
  };
}

function groupByYear(rows) {
  const byYear = new Map();
  rows.forEach(r => {
    const y = r.year ?? '—';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  });
  return [...byYear.entries()]
    .sort((a, b) => (Number(b[0]) || -Infinity) - (Number(a[0]) || -Infinity))
    .map(([year, items]) => ({ year, items }));
}

// 媒體：M2M junction（images.directus_files_id）深取 filename_disk → CloudFront URL，繞過弱機 /assets 逾時
//   （見 faculty-source 同法 + memory reference_directus_s3_timeout_all_assets_down）。純圖片相簿，videoLinks 另存 URL 不經此。
// filename_disk 形如 <uuid>.<副檔名>（webp 離線轉檔會把 .jpg→.webp，即時取用自動跟上，不寫死副檔名）。
// fallback json 的圖是現成 URL / 本地路徑（且不經此函式）→ 字串守衛保命：isUrlish 就原樣回傳，不當成 filename_disk。
function cdnUrl(v) {
  if (!v) return '';
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('../')) return v;
  return `${CMS_CDN_BASE}/${v}`;
}
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return cdnUrl(x);
    return cdnUrl(x?.directus_files_id?.filename_disk);
  }).filter(Boolean);
}
