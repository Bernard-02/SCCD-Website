/**
 * Library deep-link 網址 id 縮短（share 鈕 libShareUrl + 首頁浮卡 floating-items 共用同一機制）
 *
 * 把結尾的完整 Directus uuid 截成前 8 碼：`press-0155a418` 而非 42 字全長。
 * - 只截真 uuid；fallback 流水 id（press-1 / AO-2025-01 / 課程 slug 等）不符 pattern → 原樣保留。
 * - 落地端 handleLibraryHash 精確 getElementById 找不到時退回 `[id^=...]` 前綴比對（DOM id 仍是完整
 *   uuid、只有網址截短）→ 完整 uuid 舊連結照樣命中＝向下相容。⚠️別把落地改回純 getElementById。
 * - 8 碼是刻意下限：press/files 各 200+ 筆前 8 碼實測零撞、撞號 ~1/16萬且僅同面板內才算、退化僅
 *   highlight 到鄰筆不壞連結；4 碼在 200+ 筆時 ~1/1500 太緊、已否。
 */
export function shortLibId(id) {
  return String(id).replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '$1');
}
