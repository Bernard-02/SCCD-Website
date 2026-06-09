// Directus REST base URL 的唯一注入點。
//
// 2026-06-08：後台已設子網域 sccdtest.usc.edu.tw → 54.116.86.165，走 https。
//   為何用網域不用裸 IP：伺服器憑證是 *.usc.edu.tw 萬用憑證（綁網域不綁 IP），
//   且 http 會被 301 強制轉 https，裸 IP 走 https 名稱對不上 → 瀏覽器擋。
//   走網域 https 後：憑證驗證通過 + Directus 已開 CORS（ACAO:*）+ 無 301，全通。
// ⚠️ sccdtest 名稱帶 test，若正式版改用別的子網域，回來改這兩行即可。
// 注意：前台網站本身仍在原網域，這裡只是「抓後台資料的網址」。
export const CMS_API_BASE = 'https://sccdtest.usc.edu.tw/items';
export const CMS_ASSETS_BASE = 'https://sccdtest.usc.edu.tw/assets';
