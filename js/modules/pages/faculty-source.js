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

// single-flight：cache 存 Promise（非結果）→ prefetch-on-intent 與進頁/slide-in/atlas 的並發呼叫共用同一個
// in-flight 請求（只打一次後台）。resetFacultyCache（改在「離開 faculty」時跑，見 faculty-data-loader）清掉 → 下次重抓最新。
let _promise = null;

export function getFacultyData() {
  if (!_promise) _promise = _fetchFacultyData().catch(err => { _promise = null; throw err; });
  return _promise;
}

async function _fetchFacultyData() {
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
    return merged;
  } catch (err) {
    console.warn('[faculty] CMS fetch failed, fallback to /data/faculty.json:', err.message);
    return fetch(sitePath('data/faculty.json')).then(r => r.json());
  }
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

// prefetch-on-intent 用：資料一到就 new Image() 預載真實照片 → 進頁時 <img loading="lazy"> 直接命中瀏覽器快取，
// 卡片一出現照片就在（不再「灰底再跳出照片」）。圖已帶 ?key=web 壓縮；placeholder logo 各卡自己 preload；
// fallback 本地圖路徑快、hasRealPhoto 未設 → 跳過不預載。new Image() 不留 ref（GC 掉但 HTTP response 已進快取，同 placeholder 既有手法）。
export function preloadFacultyImages(data) {
  if (!Array.isArray(data)) return;
  // 只預暖「上半屏」前幾張：全部 ~50 張一起 new Image() 會在同一條 HTTP/2 連線多工搶頻寬、每張都變慢，
  // 反而害你滑到的兼任前幾張載更慢（user 2026-06-24 報）。下半屏交給原生 loading="lazy"（依接近視窗距離自動排序載）
  // + 瀏覽器 30 天快取（Directus 圖回 Cache-Control: public, max-age=2592000）→ 第二次造訪整頁即時、不再灰。
  data.filter(f => f && f.hasRealPhoto && f.image).slice(0, 6).forEach((f, i) => {
    const im = new Image();
    if (i < 4) im.fetchPriority = 'high'; // 最前面 4 張再給高優先序
    im.src = f.image;
  });
}

// 清掉快取 → 下次（prefetch-on-intent 或進頁）會重抓最新（老師在後台更新照片/資料後，SPA 站內導航回來即可看到新資料，
// 不必整頁 hard reload）。2026-06-24 起改由 faculty-data-loader 在「離開 faculty 時」registerPageCleanup 呼叫
// （非進頁時），否則進頁先清會把 prefetch 抓好的 cache 清掉重抓＝prefetch 白做。
export function resetFacultyCache() { _promise = null; }
