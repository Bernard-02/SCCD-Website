// Directus REST base URL 的唯一注入點。
//
// ⚠️ 目前 Directus 獨立跑在 Lightsail 的 IP:port（尚未架 reverse proxy），跟 SPA 不同源，
//    所以用「完整網址」+ Directus 端必須開 CORS（CORS_ENABLED=true）。
// 之後若把 Directus 架到同網域的 /cms/* reverse proxy 底下，改回相對路徑 '/cms/items' 即可、免 CORS。
// 注意：若 SPA 用 https 開啟，fetch 這個 http 來源會被瀏覽器 mixed-content 擋（開發用 http localhost 預覽）。
export const CMS_API_BASE = 'http://54.116.86.165:8055/items';
export const CMS_ASSETS_BASE = 'http://54.116.86.165:8055/assets';
