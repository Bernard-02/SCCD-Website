# library documents PDF 上傳前處理（object streams）

> 目的：解決「library 的 Documents 點開要等 5～20 秒」。前台程式碼不用改，只處理 PDF 檔案本身。
> 腳本：`scripts/optimize-pdfs-objstm.py`（檔頭有用法）。2026-10-21 建立，狀態見文末。

## 為什麼要做

- pdf.js 開檔時會先做一次健檢：抓第一頁和最後一頁的頁面資訊（page dict）。找最後一頁時，它把最上層所有頁的 page dict 一次全抓。
- ilovepdf／Ghostscript 壓出來的掃描本，每頁的 page dict 緊貼該頁圖片、散在整個檔案裡。162 頁的書＝162 個 16K 的 Range 請求（2.9MB）；260 頁＝267 個。Chrome 又會把同一個網址的 Range 請求逐個排隊，所以一本書要 5～20 秒。
- 開書時間 ≈ 頁數 × 45ms，跟檔案大小無關。4 頁的檔只要 7 個請求、不到 1 秒。
- 重存成 object streams 後，所有 page dict 集中在一個區塊：同一本書變 6 個請求、本機 0.8 秒。頁數、圖片、畫質、檔案大小都不變，只是內部排法不同。

不要做的事：
- **不要 linearize**（qpdf `--linearize`）：會把 page dict 再攤回各頁，請求數不變。
- 不要重新壓縮：ilovepdf 已經壓過，再壓只會掉畫質，對這個問題沒幫助。
- 不要用 Directus 重傳：documents 是 `pdfLink` 直連 S3 的「- documents/」，不走 Directus 檔案欄。

## 一次性批次（既有 234 本）

### 1. 環境
```
pip install pikepdf
```
Python 3 即可，pikepdf 內含 qpdf，不用另外裝。

### 2. 跑腳本
```
python scripts/optimize-pdfs-objstm.py "D:\sccd-pdf-out"
```
- 從 Directus `library_documents` 抓全部 `pdfLink`，逐本下載 → 重存 → 輸出到指定資料夾，**檔名與原檔相同**。
- 已經是 object streams 版的檔會印 `ok(已是 ObjStm)` 並跳過；輸出資料夾已有同名檔也跳過（可中斷後重跑續做）。
- 每本印 `done 162p  散落 162→0  58MB→58MB  檔名`，「散落」要變 0 才算成功；出現 `WARN` 的檔記下來另外看。
- 234 本約 5GB，下載時間看線路，估 1～2 小時。
- 只想先做幾本：`--only 子字串`（比對解碼後的檔名）或 `--limit N`。

### 3. 上傳回 S3
- 把輸出資料夾裡的檔案整批上傳到 S3 bucket 的 `- documents/`，**覆蓋同名檔**。
- 檔名不變＝Directus 的 pdfLink 不用改、前台不用改。
- 誰有 bucket 權限誰做（AWS Console 拖拉上傳即可）。

### 4. CloudFront invalidation（請 IT）
- 路徑：`/-%20documents/*`
- 不做這步 edge 會繼續吐舊檔，之前 webp 那次已經踩過。
- 驗證：對同一本檔抓 header，Content-Length 要跟舊檔不同（重存後會差幾十 KB）
  ```
  curl -sI "https://d2df28pyzslt2v.cloudfront.net/-%20documents/-%202026_compressed.pdf" | grep -i "content-length\|x-cache"
  ```

### 5. 前台驗收
- 開 library → Documents，點一本大本（例：2026 Between Faces、2018 跨系所專刊）。
- DevTools Network 篩 `.pdf`：請求數應在 10 個以內，第一頁 1 秒內出現。

## 之後新上傳的檔

ilovepdf 壓完 → 跑腳本處理那一本 → 上傳 → Directus 貼 pdfLink。
```
python scripts/optimize-pdfs-objstm.py "D:\sccd-pdf-out" --only "2027 - 專刊名"
```
新檔名不會撞舊快取，不需要 invalidation。

## 狀態
- 2026-10-21：腳本完成，用「2026 Between Faces」一本做過端到端驗證（重存 → 本機 Range server 量到 6 個請求）。
- ⏳ 234 本未跑、未上傳、未 invalidation。
