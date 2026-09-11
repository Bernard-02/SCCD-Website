/**
 * About History 資料源（timeline 用）
 * 兩個 Directus collections（2026-08-11 後台重構，舊「年份綁圖片」單一 JSON 邏輯作廢）：
 * - about_history        一筆＝一個時期（era）：eraZh/eraEn + entries repeater（year/division/中英說明）
 * - about_history_images 照片池：images（files M2M，可一次拖多張）；順序＝拖曳，與年份脫鉤
 * 失敗（斷網 / 5xx / 空資料）→ 各自 fallback /data/about-history.json（同 shape 快照）；
 * 兩邊獨立 fallback：後台只上了文字沒上照片時，文字吃 CMS、照片吃本地。
 */

import { CMS_API_BASE, CMS_CDN_BASE } from '../../../config/api.js';
import { sitePath } from '../../ui/site-base.js';

// null/空 → null；已是 URL / 本地路徑（fallback json）→ 原樣；其餘為 Directus filename_disk（<uuid>.<副檔名>）→ CloudFront URL。
// 走 CloudFront 繞過弱機 /assets 逾時（見 memory reference_directus_s3_timeout_all_assets_down），且用即時 filename_disk
// 不寫死副檔名 → 離線 webp 轉檔（.jpg/.png→.webp）自動跟上。
function resolveAsset(v) {
  if (!v) return null;
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('../')) return v;
  return `${CMS_CDN_BASE}/${v}`;
}

export async function loadHistory() {
  let eras = [];
  let images = [];
  try {
    const [erasRes, imgsRes] = await Promise.all([
      fetch(`${CMS_API_BASE}/about_history?limit=-1&sort=sort`),
      fetch(`${CMS_API_BASE}/about_history_images?limit=-1&sort=sort&fields=images.directus_files_id.filename_disk`),
    ]);
    if (erasRes.ok) {
      eras = ((await erasRes.json()).data || []).map(r => ({
        eraEn: r.eraEn || '',
        eraZh: r.eraZh || '',
        entries: (r.entries || []).map(en => ({
          year: en.year, division: en.division || null, en: en.descriptionEn || '', zh: en.descriptionZh || '',
        })),
      }));
    }
    if (imgsRes.ok) {
      // images＝files M2M：攤平所有列的照片（一列多張 or 多列各若干皆可），順序＝列 sort→欄內拖曳
      images = ((await imgsRes.json()).data || [])
        .flatMap(r => (r.images || []).map(x => resolveAsset(x?.directus_files_id?.filename_disk)))
        .filter(Boolean);
    }
  } catch (err) {
    console.warn('[history] CMS fetch failed:', err.message);
  }
  if (!eras.length || !images.length) {
    const j = await fetch(sitePath('data/about-history.json')).then(r => r.json());
    if (!eras.length) eras = j.eras || [];
    if (!images.length) images = j.images || [];
  }
  return { eras, images };
}
