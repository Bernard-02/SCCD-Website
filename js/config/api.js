// Directus REST base URL 的唯一注入點。
//
// 2026-06-05：Directus 對外位址改成走 port 80（拿掉 :8055，很可能架了反向代理）。
// ⚠️ 若 Directus 與 SPA 不同源，仍需 Directus 端開 CORS（CORS_ENABLED=true）。
//    若兩者已在「同一網域 / 同一反向代理」底下（同源），可把下面改成相對路徑 '/items'、'/assets' 免 CORS。
// 注意：此來源是 http；SPA 用 https 開啟時 fetch http 會被瀏覽器 mixed-content 擋（開發用 http 預覽）。
export const CMS_API_BASE = 'http://54.116.86.165/items';
export const CMS_ASSETS_BASE = 'http://54.116.86.165/assets';
