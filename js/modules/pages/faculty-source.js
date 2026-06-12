/**
 * Faculty 資料源（共用）
 * 把 Directus 三個 collection（faculty_fulltime / faculty_parttime / faculty_admin）
 * 合併成前端期望的單一陣列（每筆加 type 欄），對齊舊 /data/faculty.json 的 shape。
 * 卡片 loader 與 slide-in 都用本檔，cache 確保一次進頁只打一次後台。
 *
 * Directus 失敗（CORS / 斷網 / 5xx / 空資料）→ fallback 本地 /data/faculty.json，
 * 跟 legal-data-loader 同 pattern；CMS 掛掉時頁面仍渲染、不留白。
 */

import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

// sort：三者都用後台 sort 欄（策展順序）。fulltime/admin 創辦人/主任在前；
// parttime 的 sort 欄已在 Directus 排成姓氏 A-Z（nameEn 最後一字，user 2026-06-09 由 agent 一次性寫入），
// 之後要改兼任順序直接在後台拖 sort 欄即可，前台原樣呈現（不再前台 client-side 排）。
const COLLECTIONS = [
  { name: 'faculty_fulltime', type: 'fulltime', sort: 'sort' },
  { name: 'faculty_parttime', type: 'parttime', sort: 'sort' },
  { name: 'faculty_admin', type: 'admin', sort: 'sort' },
];

// 後台目前尚未上傳老師相片（image 全 null）→ 暫用既有 placeholder。
// 之後後台一上傳，image 會是 Directus 檔案 UUID，resolveImage 自動切到 assets URL（不用改 code）。
const PLACEHOLDER_IMAGE = '../images/S__6742028.jpg';

let _cache = null;

export async function getFacultyData() {
  if (_cache) return _cache;
  try {
    const groups = await Promise.all(COLLECTIONS.map(async (c) => {
      const res = await fetch(`${CMS_API_BASE}/${c.name}?limit=-1&sort=${c.sort}`);
      if (!res.ok) throw new Error(`${c.name} HTTP ${res.status}`);
      const rows = (await res.json()).data || [];
      return rows.map(r => {
        const item = { ...r, type: c.type, image: resolveImage(r.image) };
        // fulltime / parttime / admin 三 collection 都有 placeholder 欄位（2026-06-11 起 fulltime/admin 也補上）：
        // 沒真實照片時前台依當前 site mode 從 generator 代用 logo 挑一張（挑圖 + 卡片底色切換在 faculty-data-loader.js）。
        // 有真實照片 → image 直接用、忽略代用圖。COLLECTIONS 只含這三者（former 不在此 loader）故全部都設。
        item.hasRealPhoto = !!r.image;
        item.placeholders = {
          standard: resolvePlaceholder(r.placeholderStandard),         // 白底(標準) ← generator Standard
          inverse: resolvePlaceholder(r.placeholderInverse),           // 黑底(反白) ← generator Inverse
          wireframeBlack: resolvePlaceholder(r.placeholderWireframeBlack), // 彩色淺底 ← Black Wireframe
          wireframeWhite: resolvePlaceholder(r.placeholderWireframeWhite), // 彩色深底 ← White Wireframe（欄位暫無→null，mode3 靠 CSS filter 不需要）
        };
        return item;
      });
    }));
    const merged = groups.flat();
    if (!merged.length) throw new Error('empty');
    _cache = merged;
  } catch (err) {
    console.warn('[faculty] CMS fetch failed, fallback to /data/faculty.json:', err.message);
    _cache = await fetch(sitePath('data/faculty.json')).then(r => r.json());
  }
  return _cache;
}

// null/空 → null；已是 URL / 本地路徑（fallback json）→ 原樣；其餘當 Directus 檔案 UUID → assets URL
function resolveAsset(v) {
  if (!v) return null;
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('../')) return v;
  return `${CMS_ASSETS_BASE}/${v}`;
}

// 主照片：解不出（null/空）時退回既有 placeholder（維持舊行為）
function resolveImage(img) {
  return resolveAsset(img) || PLACEHOLDER_IMAGE;
}

// 代用 logo：Directus 原圖是 2160² 透明 PNG（~240KB），卡片只顯示 ~400px → 套 ?key=web 壓縮
// （web preset：max 1600 + webp + q80）省頻寬、加快 preload。本地 fallback 路徑不動。
function resolvePlaceholder(v) {
  const u = resolveAsset(v);
  if (!u) return null;
  return u.startsWith(CMS_ASSETS_BASE) ? `${u}?key=web` : u;
}

// 清掉快取 → 下次進 faculty 頁會重抓最新（老師在後台更新照片/資料後，SPA 站內導航回來即可看到新資料，
// 不必整頁 hard reload）。loadFacultyData 進頁時呼叫一次。
export function resetFacultyCache() { _cache = null; }
