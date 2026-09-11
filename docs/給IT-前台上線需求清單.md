# SCCD 系網站改版上線 — 需要 IT 協助的事項

> 背景：媒傳系網站已完成改版（靜態 SPA，純 HTML/CSS/JS，無 WordPress、無資料庫）。
> 目前 `sccd.usc.edu.tw` 上是舊 WordPress 站，經查該網域架構為 **CloudFront + S3**（`curl -sI https://sccd.usc.edu.tw/` 可見 `Server: AmazonS3` + `Via: CloudFront`）。
> 新站上線方式＝把新版靜態檔上傳到 S3 bucket 取代舊站，**不需要**改 DNS。

---

## 一、需要 IT 提供的資訊／權限（4 項）

1. **請新建一個 S3 bucket 給新站**（並告知 bucket 名稱）
   - 系上決定：新站放**新開的 bucket**，不覆蓋舊站的 bucket——舊站檔案原封保留，上線初期若有問題可立即把 origin 切回舊 bucket 回復舊站。
   - 新站穩定運行一段時間（約數月）後，會再請 IT 刪除舊 bucket。

2. **CloudFront distribution ID**
   - `sccd.usc.edu.tw` 對應的那個 distribution。

3. **一組 AWS 存取金鑰（Access Key ID + Secret Access Key）**
   - 給系上負責更新網站的人使用，權限需求：
     - 對該 S3 bucket：讀寫（上傳／刪除物件）
     - 對該 CloudFront distribution：建立 invalidation（清快取）
   - 不需要 Console 管理權限，最小權限即可。

4. **正式 Directus CMS 子網域確認**
   - 後台 CMS 目前在 `sccdtest.usc.edu.tw`（Lightsail 上的 Directus）。
   - 請確認正式上線後 CMS 是沿用此網域，或要換成正式子網域（如需新子網域，需掛 `*.usc.edu.tw` 萬用憑證並指向同一台 Lightsail）。

---

## 二、需要 IT 在 AWS Console 設定的事（一次性）

1. **CloudFront 加 SPA fallback**（必要，否則內頁重新整理會 404）

   新站是 SPA，網址如 `sccd.usc.edu.tw/about` 在 S3 裡沒有對應實體檔案，需讓 CloudFront 把找不到的路徑導回 `/index.html`。二擇一：

   - **做法 A（較簡單）**：該 distribution → Error pages → 新增兩條 Custom Error Response：

     | HTTP Error Code | Response page path | HTTP Response code |
     |---|---|---|
     | 403 | `/index.html` | 200 |
     | 404 | `/index.html` | 200 |

   - **做法 B（較乾淨，建議）**：CloudFront → Functions → 建立 viewer-request function 綁到該 distribution：

     ```js
     function handler(event) {
       var req = event.request;
       if (req.uri.includes('.')) return req;  // 有副檔名＝實體檔，放行
       req.uri = '/index.html';                // 乾淨路徑交給 SPA router
       return req;
     }
     ```

2. **把 CloudFront origin 指向新 bucket**
   - 系上把新站檔案上傳到新 bucket 完成後，請把該 distribution 的 Origin 改指向新 bucket，`sccd.usc.edu.tw` 即切換為新站。
   - 舊 bucket 原封保留當回復保險：若新站有重大問題，把 Origin 改回舊 bucket 即可立即回復舊站。

3. **設定完成後建立一次 invalidation**（paths：`/*`），讓設定即刻生效。

---

## 三、之後的維運模式（IT 不需經常參與）

- 網站內容日常更新：系上老師走 Directus 後台，前台自動吃新資料，**不需重新部署**。
- 網站程式改版：系上自行用金鑰上傳 S3 ＋ 清 CloudFront 快取，**手動操作、無 CI**，不需 IT 介入。
- IT 只在「金鑰失效／權限調整／網域憑證」時需要協助。

---

## 聯絡窗口

媒體傳達設計系網站負責人（此文件由系上提供）。
