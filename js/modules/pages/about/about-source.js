/**
 * About 資料源：Directus about_vision（singleton）/ about_class / about_works / about_resources
 * → about-data-loader / resources-cycling 期望的 shape。Directus 優先，失敗/空 → 本地 JSON fallback。
 *
 * class/works 的 division 是 M2O → about_divisions：deep-fetch division.divisionKey（＝前台 data-division 對位鍵）
 * 及 nameEn/nameZh（供 bfa-division-toggle 手機輪播 window.SCCD_aboutClass）。組別按鈕文字本身走 ui_labels，見 memory。
 * resources 的 image（及 vision hoverImages）走 CloudFront：deep-fetch filename_disk 組 URL，null（尚未上傳）→ 空字串，render 端 onerror 自藏。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../../config/api.js';
import { sitePath } from '../../ui/site-base.js';

// 圖片交付走 CloudFront，繞過弱機 /assets 連 S3 逾時掉圖（見 memory reference_directus_s3_timeout_all_assets_down）。
// 空/null → ''（render 端 onerror 自藏）；已是 URL / 本地路徑（fallback json 的 ../images/…）→ 原樣；
// 其餘為 Directus filename_disk（<uuid>.<副檔名>，即時取用不寫死副檔名 → 離線 webp 轉檔自動跟上）→ CloudFront URL。
const cdnImage = (name) => {
  if (!name) return '';
  if (/^(https?:)?\/\//.test(name) || name.startsWith('/') || name.startsWith('../')) return name;
  return `${CMS_CDN_BASE}/${name}`;
};
const local = (path) => fetch(sitePath(path)).then(r => r.json());

// vision 游標拖尾圖：about_vision.hoverImages（files M2M）→ assets URL 陣列；空/失敗回 []（caller fallback degree-show）
export async function loadAboutVisionImages() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_vision?fields=hoverImages.directus_files_id.filename_disk`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()).data?.hoverImages || [];
    return arr.map(x => cdnImage(x?.directus_files_id?.filename_disk)).filter(Boolean);
  } catch (err) {
    console.warn('[about] vision images CMS 失敗 → caller fallback:', err.message);
    return [];
  }
}

// singleton：Directus 回 { data: {…} }（非陣列）
export async function loadAboutVision() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_vision`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = (await res.json()).data;
    if (!d) throw new Error('empty');
    return { descriptionEn: d.descriptionEn || '', descriptionZh: d.descriptionZh || '' };
  } catch (err) {
    console.warn('[about] vision CMS 失敗 → 本地:', err.message);
    return local('/data/about-vision.json');
  }
}

export async function loadAboutClasses() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_class?limit=-1&sort=sort&fields=*,division.divisionKey,division.nameEn,division.nameZh`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return rows.map(r => ({
      divisionKey: r.division?.divisionKey || '',
      nameEn: r.division?.nameEn || '', nameZh: r.division?.nameZh || '',
      descriptionEn: r.descriptionEn || '', descriptionZh: r.descriptionZh || '',
    }));
  } catch (err) {
    console.warn('[about] class CMS 失敗 → 本地:', err.message);
    return local('/data/about-class.json');
  }
}

export async function loadAboutWorks() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_works?limit=-1&sort=sort&fields=*,division.divisionKey`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return rows.map(r => ({
      divisionKey: r.division?.divisionKey || '',
      descriptionEn: r.descriptionEn || '', descriptionZh: r.descriptionZh || '',
      youtubePlaylist: r.youtubePlaylist || '',
    }));
  } catch (err) {
    console.warn('[about] works CMS 失敗 → 本地:', err.message);
    return local('/data/about-works.json');
  }
}

// render 端（resources-cycling）吃 { title(合併), image, textEn, textZh }
export async function loadAboutResources() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_resources?limit=-1&sort=sort&fields=*,image.filename_disk`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return rows.map(r => ({
      title: [r.titleEn, r.titleZh].filter(Boolean).join(' '),
      image: cdnImage(r.image?.filename_disk),
      textEn: r.descriptionEn || '', textZh: r.descriptionZh || '',
    }));
  } catch (err) {
    console.warn('[about] resources CMS 失敗 → 本地:', err.message);
    return local('/data/about-resources.json');
  }
}
