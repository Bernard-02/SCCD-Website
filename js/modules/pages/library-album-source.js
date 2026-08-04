/**
 * Library Album「others」資料源（共用）
 * Directus library_album（扁平）→ 本地 album-others.json 的 year-grouped shape
 * （ALBUM_SOURCES 的消費者已支援 titleEn/Zh + images[] + videoLinks[] 直接讀，不用額外改名）。
 * Directus 失敗/空 → fallback 本地 /data/album-others.json（維持原行為）。
 * library-panels.js（library 頁 Album 面板）與 album-data-loader.js（index 浮卡）兩個平行消費者共用這支，
 * 同 summer-camp-source.js 的模式（見 project_album_two_consumers_directus_wiring 記憶）。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const CMS_COLLECTION = 'library_album';
const FALLBACK_JSON = '/data/album-others.json';

export async function loadOthersAlbum() {
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?fields=*,images.directus_files_id&sort=sort&limit=-1`);
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

// 媒體：M2M junction（images.directus_files_id）→ assets URL（同 press/summer-camp-source 慣例）
const asset = (uuid) => uuid ? `${CMS_ASSETS_BASE}/${uuid}` : '';
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return asset(x);
    if (x?.directus_files_id) { const f = x.directus_files_id; return asset(typeof f === 'string' ? f : f?.id); }
    return asset(x?.id);
  }).filter(Boolean);
}
