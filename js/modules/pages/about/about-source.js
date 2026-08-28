/**
 * About 資料源：Directus about_vision（singleton）/ about_class / about_works / about_resources
 * → about-data-loader / resources-cycling 期望的 shape。Directus 優先，失敗/空 → 本地 JSON fallback。
 *
 * class/works 的 division 是 M2O → about_divisions：deep-fetch division.divisionKey（＝前台 data-division 對位鍵）
 * 及 nameEn/nameZh（供 bfa-division-toggle 手機輪播 window.SCCD_aboutClass）。組別按鈕文字本身走 ui_labels，見 memory。
 * resources 的 image 是 directus_files UUID → assets URL；null（尚未上傳）→ 空字串，render 端 onerror 自藏。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../../config/api.js';
import { sitePath } from '../../ui/site-base.js';

const asset = (u) => (u ? `${CMS_ASSETS_BASE}/${typeof u === 'string' ? u : u.id}` : '');
const local = (path) => fetch(sitePath(path)).then(r => r.json());

// vision 游標拖尾圖：about_vision.hoverImages（files M2M）→ assets URL 陣列；空/失敗回 []（caller fallback degree-show）
export async function loadAboutVisionImages() {
  try {
    const res = await fetch(`${CMS_API_BASE}/about_vision?fields=hoverImages.directus_files_id`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()).data?.hoverImages || [];
    return arr.map(x => asset(x?.directus_files_id)).filter(Boolean);
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
    const res = await fetch(`${CMS_API_BASE}/about_resources?limit=-1&sort=sort`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return rows.map(r => ({
      title: [r.titleEn, r.titleZh].filter(Boolean).join(' '),
      image: asset(r.image),
      textEn: r.descriptionEn || '', textZh: r.descriptionZh || '',
    }));
  } catch (err) {
    console.warn('[about] resources CMS 失敗 → 本地:', err.message);
    return local('/data/about-resources.json');
  }
}
