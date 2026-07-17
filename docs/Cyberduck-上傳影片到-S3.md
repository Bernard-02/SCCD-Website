# 用 Cyberduck 自己上傳影片到 S3（不必每次麻煩 IT）

> 目的：把自己的影片（mp4）上傳到 AWS S3，拿到網址貼進 Directus，前台就會自動用自製播放器播放。
> 這份讓「非工程背景的編輯者」也能一個人完成，不用每支影片都請 IT 代傳。

---

## 一句話流程

```
Cyberduck 拖 mp4 上 S3  →  複製 CloudFront 網址  →  貼進 Directus 影片欄位  →  前台自動播 + 自動縮圖
```

**為什麼用 mp4 不用 m3u8？** 我們現有的 m3u8 其實是單一畫質（沒有「自動切畫質」的好處），
對幾分鐘的短片來說，一支 mp4 體感一樣、又**免轉檔**。前台已支援直連 `.mp4 / .webm / .mov / .m4v`。

---

## 前置：跟 IT 要一次「上傳金鑰」（只要一次，之後永久自助）

Cyberduck 要連上 S3，需要一組 AWS 存取金鑰。這組金鑰在 IT 的 AWS 帳號裡，**請 IT 發一次給你**即可，
之後每次上傳都自己來、不用再找 IT。

**給 IT 的話術：**
> 「請幫我開一個 IAM 使用者，權限限定 `sccd-video-output-2026` 這個 S3 bucket 的讀寫（PutObject / GetObject / ListBucket），
> 給我 **Access Key ID** 和 **Secret Access Key**。我要用 Cyberduck 自己上傳影片。」

**順便請 IT 一起確認/告知這幾格**（填好這張表這份文件就完整了）：

| 項目 | 值 | 說明 |
|---|---|---|
| Access Key ID | `______________` | IT 發，像 `AKIA...` |
| Secret Access Key | `______________`（保密！） | IT 發，只會出現一次，記下來 |
| Bucket 名稱 | `sccd-video-output-2026` | 目前已知的影片桶；請 IT 確認直傳影片是不是放這個 |
| Region（區域） | `______________` | 例如 `ap-northeast-1`（東京）；Cyberduck 連線要用到 |
| 上傳到哪個資料夾 | `______________` | 例如 `videos/`；避免全丟根目錄 |
| CloudFront 網域 | `https://______________` | **貼進 Directus 用這個**，不是 S3 原始網址（見下方步驟 5） |

> ⚠️ Secret Access Key 等於密碼，不要貼到聊天/信件/git，記在密碼管理器裡。

---

## 步驟 1：安裝 Cyberduck

- 官網：<https://cyberduck.io>（Windows / Mac 都有，免費）
- 下載安裝，打開。

## 步驟 2：在 Cyberduck 建立 S3 連線（設一次，存成書籤）

1. 上方點 **「開新連線」**（Open Connection）。
2. 最上面的下拉選 **「Amazon S3」**。
3. 填入：
   - **Server**：一般留預設 `s3.amazonaws.com` 即可；若 IT 指定了 region，用 `s3.<region>.amazonaws.com`（例：`s3.ap-northeast-1.amazonaws.com`）。
   - **Access Key ID**：貼上表格裡的 Access Key ID。
   - **Secret Access Key**：貼上 Secret。
4. （建議）勾 **「加入書籤」** 或連上後 `檔案 → 加入書籤`，下次直接雙擊就好。
5. 連上後應該會看到 bucket 列表，進到 `sccd-video-output-2026`（再進 IT 指定的資料夾，如 `videos/`）。

## 步驟 3：上傳影片

- 直接把 mp4 檔**從桌面拖進 Cyberduck 視窗**（拖到目標資料夾裡），等進度跑完。
- 大檔（100–500MB）會跑一陣子，讓它跑完別關。

## 步驟 4：確認可以公開讀取

前台要能讀到影片，這個檔（或整個桶/資料夾）要允許公開讀取。
- 通常 IT 設 bucket 時已一次設好「這個資料夾都公開讀」——那你就不用管，上傳完即可用。
- 若上傳的影片打不開（前台一片黑/403），回頭請 IT 確認該桶/資料夾的公開讀取（public read）政策。
- （Cyberduck 也能對單檔按右鍵 `Info → Permissions` 設 `Everyone: Read`，但以 IT 的 bucket 設定為準。）

## 步驟 5：拿「CloudFront 網址」貼進 Directus

**這步最容易搞錯：貼的是 CloudFront 網址，不是 Cyberduck 顯示的 S3 網址。**

- Cyberduck 對檔案按右鍵有「複製 URL」，但那多半是 `https://<bucket>.s3.amazonaws.com/...` 的 **S3 原始網址** ——
  S3 原始網址沒有 CDN、沒設好跨域，**不要用**。
- 正確的是 **CloudFront 網址**：把上面表格裡的 CloudFront 網域，接上你的檔案路徑。

  例如：
  - 檔案在 S3 是 `videos/lecture-2026.mp4`
  - CloudFront 網域是 `https://d123abc.cloudfront.net`
  - → 貼進 Directus 的網址就是 **`https://d123abc.cloudfront.net/videos/lecture-2026.mp4`**

- 進 Directus 後台，找到對應的影片欄位（activities 各類別、album、library press 等的 video 連結欄），把這條網址貼進去，存檔。

## 完成

前台重新整理，該影片就會用站內自製播放器播放，並自動截一張畫面當縮圖。

---

## 重點提醒（踩雷前先看）

1. **影片檔放 S3，Directus 只存「網址」。**
   不要把 mp4 上傳進 Directus 的檔案庫——CMS 跑在學校那台小主機、沒有 CDN，大影片會拖垮它，還可能被檔案格式白名單擋下。影片一律走 S3 + CloudFront。

2. **縮圖需要「跨域（CORS）」才截得到。**
   前台的縮圖是去抓影片畫面截一張，需要桶開 CORS（回應帶 `Access-Control-Allow-Origin`）。
   目前的 `sccd-video-output-2026` 已設好（`ACAO:*`）。**若之後換新桶，記得請 IT 維持一樣的 CORS 設定**，否則縮圖會截不到、退成黑底佔位圖（**播放不受影響**，只是沒縮圖）。

3. **支援的直連格式**：`.mp4`、`.webm`、`.mov`、`.m4v`。其他格式（或需要「自動切畫質」）才需要另外轉成 HLS（`.m3u8`），那要走 MediaConvert / ffmpeg，是另一套流程。

4. **YouTube 影片照舊**：貼 YouTube 連結一樣會自動變成 iframe 播放，跟這套 mp4 流程並存、互不影響。

5. **檔名建議**：用英文/數字、有意義、避免空格與中文（例：`lecture-2026-yeh.mp4`）。空格/中文在網址裡要編碼，容易出錯。

---

## 相關

- 前台影片分流邏輯：`js/modules/ui/video-player.js`（`videoMediaFromUrl`：`.m3u8`→HLS、`.mp4` 等→直連、YouTube→iframe）
- 後台/部署架構全貌：`docs/SPA-接-Directus-Headless-最佳實踐.md`
- 需要 IT 進主機處理的清單：`docs/IT-請求清單.txt`
