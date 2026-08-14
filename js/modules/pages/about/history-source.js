/**
 * About History 資料源（timeline 用）
 * 兩個 Directus collections（2026-08-11 後台重構，舊「年份綁圖片」單一 JSON 邏輯作廢）：
 * - about_history        一筆＝一個時期（era）：eraZh/eraEn + entries repeater（year/division/中英說明）
 * - about_history_images 純圖片：sort 拖曳＝輪播先後，與年份脫鉤
 * 失敗（斷網 / 5xx / 空資料）→ 各自 fallback /data/about-history.json（同 shape 快照）；
 * 兩邊獨立 fallback：後台只上了文字沒上照片時，文字吃 CMS、照片吃本地。
 */

import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../../config/api.js';
import { sitePath } from '../../ui/site-base.js';

// null/空 → null；已是 URL / 本地路徑（fallback json）→ 原樣；其餘當 Directus 檔案 UUID → assets URL
function resolveAsset(v) {
  if (!v) return null;
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('../')) return v;
  return `${CMS_ASSETS_BASE}/${v}`;
}

export async function loadHistory() {
  let eras = [];
  let images = [];
  try {
    const [erasRes, imgsRes] = await Promise.all([
      fetch(`${CMS_API_BASE}/about_history?limit=-1&sort=sort`),
      fetch(`${CMS_API_BASE}/about_history_images?limit=-1&sort=sort`),
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
      images = ((await imgsRes.json()).data || []).map(r => resolveAsset(r.image)).filter(Boolean);
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
