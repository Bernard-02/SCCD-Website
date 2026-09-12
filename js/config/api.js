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

// 圖片交付走 CloudFront（d2df28pyzslt2v，fronting 同一顆 S3 bucket `sccd-video-output-2026` 的 `Directus/` 子夾，
// 與影片/PDF 共用）。為何不走上面的 /assets：那條要 Directus 這台弱機去 S3 抓檔，主機常連不到 S3 → /assets
// 等 5s 逾時回 403、全站掉圖（見 memory reference_directus_s3_timeout_all_assets_down）。CloudFront 直吃 S3、
// 繞過弱機，Directus 掛也照出圖。前台用檔案的**即時 filename_disk**（`<uuid>.<副檔名>`）組 key，不寫死副檔名
// → 離線 webp 轉檔（.jpg/.png→.webp）自動跟上。全站圖片＋PDF 交付都走此（2026-08-31；PDF 走 pdf-url.js 的 pdfOpenUrl）。
// CMS_ASSETS_BASE 現只剩「下載附件」在用（如 admission attachments）——刻意保留 /assets 讓下載檔名漂亮（Content-Disposition）；
// 影片不經 /assets（貼 HLS CloudFront 網址）。
export const CMS_CDN_BASE = 'https://d2df28pyzslt2v.cloudfront.net/Directus';

// YouTube Data API v3（about/works 用 playlistItems.list 抓清單影片 title+id，1 unit/次）。
// key 走 GCP HTTP-referrer 限制（已放行 github.io / sccd.usc.edu.tw / localhost）→ 曝在前端無妨，
// 限制網域才是防線；server 端無 referer 反被擋，故只能瀏覽器用。編輯照舊只在後台貼 playlist URL，不碰 key。
export const YT_API_KEY = 'AIzaSyBU-muAPWSpX6hn4gKw4fec6yM1Yqd4lFA';
