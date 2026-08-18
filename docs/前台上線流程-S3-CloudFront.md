# 前台上線流程（S3 + CloudFront）＋ 去掉 `/pages/`

> 本檔講 **前台 SPA 首次上線**。後台 Directus 的安裝／設定看 `SPA-接-Directus-Headless-最佳實踐.md`。
> ⚠️ 那份舊文件把前台寫成「Lightsail + Apache」——**與實況不符**，前台網域接在 S3 + CloudFront（見下方檢查證據）。
> ⚠️ **現況（2026-08-16）：新 SPA 尚未部署、全在本地開發**；`sccd.usc.edu.tw` 目前放的是**現行的舊 WordPress 站**。本檔＝把 SPA **首次部署**上去、**取代**舊站的流程。

---

## 0. 實際架構（2026-08-14 用 HTTP header 實測確認）

```
前台網域（靜態檔）                     後台 CMS
────────────────────                  ────────────────────
sccd.usc.edu.tw                       sccdtest.usc.edu.tw
   │                                     │
   ▼                                     ▼
CloudFront（CDN + 快取）               nginx / 1.22.1
   │                                     │
   ▼                                     ▼
Amazon S3（靜態網站）                   Directus（:8055）＋ PostgreSQL
  現放「舊 WP 站」                       （在 Lightsail 上）
  → 上線改放 SPA build
```

檢查方式（隨時可重驗）：
```bash
curl -sI https://sccd.usc.edu.tw/        # → Server: AmazonS3 + Via: CloudFront
curl -sI https://sccdtest.usc.edu.tw/    # → Server: nginx/1.22.1 + X-Powered-By: Directus
```

**重點**：
- 「Lightsail + nginx」是**後台 Directus 那台**，不是前台。
- 前台是 **S3 + CloudFront**，所以清 URL **不能**用 `.htaccess`（Apache）也不能用 nginx `try_files`。repo 根目錄那份 `.htaccess` 在這個架構下是**死檔**（S3/CloudFront 不讀），可留可刪。
- ⚠️ **`sccd.usc.edu.tw` 現在放的是「舊 WordPress 站」**（實測 HTML：`wp-content/themes/sccd_com_0925`、Bootstrap3；**無** `#page-content`/`main-modular.js`）。**新 SPA 還沒部署、全在本地**。本檔的「上線」＝把 SPA build 傳上那個 S3 bucket **取代舊站**（首次部署）。
- 本地開發時前台接的是**測試 CMS**（`sccdtest`）；上線時把 `js/config/api.js` 改指向正式 Directus 子網域（見 §1①）。

---

## 1. 上線前要改的 code（2 個檔）

### ① API base — `js/config/api.js`
測試 CMS → 正式 CMS 子網域（正式 Directus 網域確定後改）：
```js
export const CMS_API_BASE    = 'https://<正式CMS子網域>/items';
export const CMS_ASSETS_BASE = 'https://<正式CMS子網域>/assets';
```
> 這是唯一注入點，全站 fetch 都吃這兩個常數。憑證是 `*.usc.edu.tw` 萬用憑證，用子網域不用裸 IP。

### ② 去掉 `/pages/` — `js/router.js` 的 pushState
現在 pushState 用「真實檔案路徑」`/pages/about.html`（本地 dev server 沒 SPA fallback，這樣 refresh 才不 404）。改成：**本地保留 `/pages/`、正式站用乾淨 URL**。

把 `navigateTo` 裡這段（約 router.js:380）：
```js
const realPath = route.htmlFile === 'index.html'
  ? SITE_BASE_PATHNAME
  : SITE_BASE_PATHNAME + route.htmlFile;
```
改成呼叫一個小 helper：
```js
const realPath = pushPath(route);
```
並在檔案上方加：
```js
// 乾淨 URL：正式站（S3+CloudFront 有 SPA fallback）用 /about；
// 本地 dev server 無 fallback → 保留 /pages/X.html，refresh 才不 404。
function pushPath(route) {
  const host = window.location.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === ''
    || window.location.protocol === 'file:';
  if (isLocalDev) {
    return route.htmlFile === 'index.html'
      ? SITE_BASE_PATHNAME
      : SITE_BASE_PATHNAME + route.htmlFile;                 // 本地：/pages/about.html
  }
  if (route.htmlFile === 'index.html') return SITE_BASE_PATHNAME;               // 正式：/
  return SITE_BASE_PATHNAME + route.htmlFile
    .replace(/^pages\//, '').replace(/\.html$/, '');          // 正式：/about
}
```
> `resolveRoute` **不用改**——它本來就同時吃 `/about`、`/about.html`、`/pages/about.html` 三種寫法（路由表裡 `/about` 跟 `/about.html` 都指向同一頁）。所以直接輸入 `sccd.usc.edu.tw/about` 進來也能正確載入。

---

## 2. 去掉 `/pages/` 的 server 端設定（CloudFront）

乾淨 URL 一定要搭「server 端 SPA fallback」：使用者**直接輸網址 / refresh / 書籤** `sccd.usc.edu.tw/about` 時，S3 找不到 `/about` 這個物件會 404 → 必須讓它回 `index.html`，SPA 才能接手。

在 **CloudFront** 設定（AWS Console → CloudFront → 該 distribution → **Error pages**）。兩種做法選一：

### 做法 A（最簡單、推薦）：Custom Error Response
新增兩條：

| HTTP Error Code | Response page path | HTTP Response code |
|---|---|---|
| 403 | `/index.html` | 200 |
| 404 | `/index.html` | 200 |

- 任何非實體檔的路徑都回 `index.html`（200）→ JS router 用 `location.pathname` 解析 → 找不到的路徑會走本站自己的 `/404` 頁。
- 缺點：S3 website endpoint 對 `/about`（無尾斜線）會先 `302 → /about/` 再 fallback，網址列會多一個尾斜線。可接受。

### 做法 B（最乾淨、免尾斜線）：CloudFront Function
CloudFront → **Functions** → 建一個 viewer-request function：
```js
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  // 有副檔名（.js/.css/.png/.html…）＝實體檔，放行
  if (uri.includes('.')) return req;
  // 其餘乾淨路徑一律改寫成 index.html，交給 SPA router
  req.uri = '/index.html';
  return req;
}
```
綁到該 distribution 的 **Viewer Request**。這樣 `/about` 直接吃到 index.html、無 302、無尾斜線。（origin 建議用 S3 REST endpoint，不用 website endpoint。）

> 兩種都改完 server 端要 **CloudFront invalidation**（見下）才生效。

---

## 3. 上線步驟（前台每次部署）

```bash
# 1) 確保 CSS 是最新編譯產物（頁面實際載的是 output.css）
npm run build:css

# 2)（首次上線 / 換 CMS 時）改 js/config/api.js 的 CMS_API_BASE / CMS_ASSETS_BASE
#    （首次上線）改 js/router.js pushState → 乾淨 URL（見 §1②）

# 3) 上傳靜態檔到 S3 bucket
#    ⚠️ bucket 名稱 / AWS 權限要先跟當初設定 S3 的人拿（見 §5 待確認）
aws s3 sync . s3://<bucket-name> \
  --delete \
  --exclude ".git/*" --exclude "node_modules/*" --exclude "scripts/*" \
  --exclude "docs/*" --exclude "*.md" --exclude ".claude/*"

# 4) 清 CloudFront 快取，讓新檔立即生效
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> --paths "/*"
```

> 沒有 CI／deploy script（package.json 只有 build:css / watch:css / check:ts），目前是**手動部署**。若之後想自動化，可加一個 GitHub Action 做 build → s3 sync → invalidation。

---

## 4. 上線後驗證 checklist

- [ ] `sccd.usc.edu.tw/` 首頁正常、網址列是乾淨的 `/`
- [ ] 站內點各頁 → 網址列變 `/about`、`/faculty`…（**沒有** `/pages/`）
- [ ] 在 `/about` 這種內頁按 **refresh** → 正常載入（不是 404）← 這條測 CloudFront fallback 有沒有設對
- [ ] 直接貼 `sccd.usc.edu.tw/library` 到新分頁 → 正常載入
- [ ] 亂打 `sccd.usc.edu.tw/xxxxx` → 顯示本站 404 頁
- [ ] DevTools Network：資料 fetch 打的是**正式** CMS 網域（不是 sccdtest）
- [ ] Directus Public role 有開 Read（沒開前台 fetch 全 401）

---

## 5. 待確認（目前 repo 裡查不到、要跟人拿）

1. **S3 bucket 名稱** — `aws s3 sync` 的目標。
2. **CloudFront distribution ID** — 設 error response / function + invalidation 用。
3. **誰有 AWS 帳號權限** — 目前前台是誰／怎麼部署上去的（repo 無 CI、無 deploy script → 應為手動）。
4. **正式 Directus 子網域** — 現在前台指向 `sccdtest`（測試），正式上線要換成正式 CMS 網域。

> 這四項確定後，§1–§3 就能一路照做。router 那半（§1②）我隨時可以直接幫你改進 code；CloudFront 那半（§2）需要 AWS Console 權限，得你或 IT 操作。
