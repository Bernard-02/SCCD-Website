/**
 * About 資料源：Directus about_vision（singleton）/ about_class / about_works / about_resources
 * → about-data-loader / resources-cycling 期望的 shape。後台是唯一來源：失敗/空 → 回空值（不再退本地 JSON，user 2026-10-04）。
 *
 * class/works 的 division 是 M2O → about_divisions：只 deep-fetch division.divisionKey（＝前台 data-division 對位鍵）。
 * 組別按鈕文字走 ui_labels（見 memory）。
 * 圖片走 CloudFront（cdnUrl）：deep-fetch filename_disk 組 URL，null（尚未上傳）→ 空字串，render 端 onerror 自藏。
 */
import { CMS_API_BASE, cdnUrl, cdnUrls } from '../../../config/api.js';

async function fetchRows(query, label) {
  try {
    const res = await fetch(`${CMS_API_BASE}/${query}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).data;
    if (!data || (Array.isArray(data) && !data.length)) throw new Error('empty');
    return data;
  } catch (err) {
    console.warn(`[about] ${label} CMS 失敗:`, err.message);
    return null;
  }
}

// vision 游標拖尾圖：about_vision.hoverImages（files M2M）→ URL 陣列；空/失敗回 []（＝不顯示拖尾）
export async function loadAboutVisionImages() {
  const d = await fetchRows('about_vision?fields=hoverImages.directus_files_id.filename_disk', 'vision images');
  return cdnUrls(d?.hoverImages);
}

// singleton：Directus 回 { data: {…} }（非陣列）
export async function loadAboutVision() {
  const d = await fetchRows('about_vision', 'vision');
  return { descriptionEn: d?.descriptionEn || '', descriptionZh: d?.descriptionZh || '' };
}

export async function loadAboutClasses() {
  // division 名字走 ui_labels（前台 data-label-key 渲染），這裡只需 divisionKey 對位＋圖文段落；
  // images＝該學制圖片輪播池（files M2M，每學制各自）。
  const rows = await fetchRows('about_class?limit=-1&sort=sort&fields=*,division.divisionKey,images.directus_files_id.filename_disk', 'class');
  return (rows || []).map(r => ({
    divisionKey: r.division?.divisionKey || '',
    descriptionEn: r.descriptionEn || '', descriptionZh: r.descriptionZh || '',
    images: cdnUrls(r.images),
  }));
}

export async function loadAboutWorks() {
  const rows = await fetchRows('about_works?limit=-1&sort=sort&fields=*,division.divisionKey', 'works');
  return (rows || []).map(r => ({
    divisionKey: r.division?.divisionKey || '',
    descriptionEn: r.descriptionEn || '', descriptionZh: r.descriptionZh || '',
    youtubePlaylist: r.youtubePlaylist || '',
  }));
}

// render 端（resources-cycling）吃 { title(合併), image, images[], textEn, textZh }
// images＝多圖 M2M（about_resources_files junction，sort 拖曳＝輪播先後）；空則用單張 image。
export async function loadAboutResources() {
  const rows = await fetchRows('about_resources?limit=-1&sort=sort&fields=*,image.filename_disk,images.directus_files_id.filename_disk', 'resources');
  return (rows || []).map(r => {
    const single = cdnUrl(r.image);
    const multi = cdnUrls(r.images);
    return {
      title: [r.titleEn, r.titleZh].filter(Boolean).join(' '),
      image: single,
      images: multi.length ? multi : (single ? [single] : []),
      textEn: r.descriptionEn || '', textZh: r.descriptionZh || '',
    };
  });
}
