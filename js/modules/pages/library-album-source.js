/**
 * Library Album「others」資料源（共用）
 * Directus library_album（扁平）→ year-grouped shape
 * （ALBUM_SOURCES 的消費者已支援 titleEn/Zh + images[] + videoLinks[] 直接讀，不用額外改名）。
 * 後台是唯一來源：失敗/空 → []（不再退本地 JSON，user 2026-10-04）。
 * 消費者：library-panels.js 的 ALBUM_SOURCES、首頁 floating-items（同 summer-camp-source.js 的模式）。
 */
import { CMS_API_BASE, cdnUrls } from '../../config/api.js';

const CMS_COLLECTION = 'library_album';

export async function loadOthersAlbum() {
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?fields=*,images.directus_files_id.filename_disk&sort=sort&limit=-1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByYear(rows.map(mapRow));
  } catch (err) {
    console.warn('[library-album] CMS fetch failed:', err.message);
    return [];
  }
}

// 媒體：M2M junction（images.directus_files_id）深取 filename_disk → CloudFront URL（cdnUrls）。videoLinks 另存 URL 不經此。
function mapRow(r) {
  return {
    id: r.id,
    year: r.year,
    titleEn: r.titleEn || '', titleZh: r.titleZh || '',
    images: cdnUrls(r.images),
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
