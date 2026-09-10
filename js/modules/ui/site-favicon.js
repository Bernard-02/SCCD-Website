/**
 * 網站 favicon：從後台 site_settings.favicon（上傳檔）注入 <link rel="icon">。
 * 只放一張：tab 底色（無痕深 UI 等）網頁偵測不到，圖示要「自帶底」深淺 tab 都可讀（09-10 定案，勿再做 dark 變體）。
 * 未設 / 斷線 → 不動（維持頁面現有 favicon）。老師在 Directus 上傳，前台硬重整即換。
 * DOMContentLoaded 跑一次即可（SPA 換頁 favicon 常駐、不需重設）。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';

export async function initFavicon() {
  try {
    const res = await fetch(`${CMS_API_BASE}/site_settings?fields=favicon.filename_disk`);
    if (!res.ok) return;
    const disk = (await res.json())?.data?.favicon?.filename_disk;   // singleton → data 為物件
    if (!disk) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    if (/\.svg$/i.test(disk)) link.type = 'image/svg+xml';
    link.href = `${CMS_CDN_BASE}/${disk}`;
  } catch { /* 未設 / 斷線 → 維持現狀 */ }
}
