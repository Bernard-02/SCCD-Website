/**
 * About History 資料源（timeline 用）
 * 兩個 Directus collections（2026-08-11 後台重構，舊「年份綁圖片」單一 JSON 邏輯作廢）：
 * - about_history        一筆＝一個時期（era）：eraZh/eraEn + entries repeater（year/division/中英說明）
 * - about_history_images 照片池（singleton 單筆）：images（files M2M，list-m2m 欄內拖曳排序）；順序＝拖曳，與年份脫鉤
 * 後台是唯一來源：失敗（斷網 / 5xx）→ 該部分回空（不再退本地 JSON，user 2026-10-04）。
 */

import { CMS_API_BASE, cdnUrls } from '../../../config/api.js';

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
      // about_history_images 是 singleton＝回傳單一物件（非陣列）；統一包成陣列再攤平 images（順序＝欄內拖曳）
      const d = (await imgsRes.json()).data;
      images = (Array.isArray(d) ? d : d ? [d] : []).flatMap(r => cdnUrls(r.images));
    }
  } catch (err) {
    console.warn('[history] CMS fetch failed:', err.message);
  }
  return { eras, images };
}
