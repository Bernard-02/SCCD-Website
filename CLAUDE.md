# SCCD 網站專案指南

## 專案概述
實踐大學媒體傳達設計系（SCCD - Shih Chien University Communications Design）官方網站。原生 JS SPA，無框架；內容走 **Directus headless CMS**（前台只吃 JSON，渲染與動畫全在 SPA）。

## 技術棧
- **前端**：原生 HTML/CSS/JavaScript（ES6 modules）
- **後台 CMS**：Directus（headless，REST API）
- **架構**：自製 SPA router（`js/router.js`）+ 模組化頁面初始化
- **CSS 工具**：Tailwind CSS（`css/output.css` 為編譯產物）
- **設計系統**：CSS Variables（`css/variables.css`）
- **動畫**：GSAP 3.14（含 ScrollTrigger / ScrollToPlugin / CustomEase；Draggable / InertiaPlugin 未使用、2026-10-04 已移除）
- **p5.js**：/create 頁的 generator app inline 跑 p5 instance（已從 iframe 拆除）
- **Lottie**：header / footer logo 動畫（`lottie_light.min.js`＝只含 svg renderer；全站 JSON 無 expressions，要用 canvas/expressions 才換回完整版）
- **字體**：Inter (EN) + Noto Sans TC (ZH)（＋ JP/SC fallback）：各頁 head 直接 link（不走 CSS @import）；Bitter + Noto Serif 只 library 用（library.html head ＋ SPA 進頁由 library-panels.js `ensureSerifFonts` 補）
- **圖示**：`.icon` mask 系統（css/components/icon.css，後台 site_icons 覆蓋）；Font Awesome 已不用

## 專案結構

```
├── index.html                  # 首頁（含 #site-footer-static 靜態 footer + intro overlay）
├── pages/                      # 所有內頁（SPA router 把 <main> 內容 swap 進來）
│   ├── about / faculty / courses / works / activities / admission / awards
│   ├── degree-show / degree-show-detail
│   ├── alumni / library / atlas / create
│   ├── donate(route: support) / regulations / sitemap / 404（檔名≠對外網址：slug 見「網址 slug」）
│   ├── header.html             # async fetch 載入到 #site-header
│   └── footer.html             # async fetch 載入到 #site-footer（SPA 容器）
├── css/
│   ├── variables.css           # 設計系統變數（顏色 / 字型 / 間距 / breakpoints）
│   ├── input.css               # Tailwind 入口 + @import 串接 base/layout/components/themes
│   ├── output.css              # build 產物
│   ├── base/                   # typography / scrollbar
│   ├── layout/                 # grid / footer / scroll-snap / landscape（矮橫向 gate 層）/ portrait（直向手機 <768 全站層）
│   ├── components/             # navigation / buttons / cards / accordion / hero /
│   │                             lists / atlas / alumni / courses / create / library /
│   │                             intro-animation
│   └── themes/                 # color (mode-color) / inverse (mode-inverse)
├── js/
│   ├── main-modular.js         # DOMContentLoaded 入口、initPageModules dispatch（頁面模組一律動態 import）、cleanupPageModules
│   ├── router.js               # SPA router（fetch + innerHTML swap + nav state）
│   ├── header.js / footer.js   # 全域 header/footer 初始化（DOMContentLoaded 跑一次）
│   └── modules/
│       ├── pages/              # 各頁專屬模組（create-app / atlas / alumni / library-* / 等）
│       │   └── about/          # about 頁拆分（about-data-loader / resources-cycling / timeline / ...）
│       ├── ui/                 # 共用 UI（theme-toggle / page-exit / page-cleanup /
│       │                         custom-scrollbar / scroll-animate / marquee-overflow / ...）
│       ├── lightbox/           # lightbox-shell（共用 enter/exit + header bar 收展）
│       ├── navigation/         # anchor-nav
│       ├── filters/ accordions/ animations/
│       └── pages/about/        # about 頁專屬子模組
├── generate-app/               # /create 頁 p5 sketch 與資源
│   ├── sketch.js               # p5 instance 主檔（initCreateApp / cleanupCreateApp 暴露給 SPA）
│   ├── js/                     # classic scripts（variables / utils / mobile / color-picker / ...）
│   ├── p5.min.js               # local p5 build
│   └── Panel Icon/ Easter Egg/ # 資源
├── data/                       # 前台還在讀的本地 JSON：Lottie logo、alumni*（尚未上 CMS）、accessibility.json（網站地圖）。fallback 快照 2026-10-04 全退場
├── data-source/                # 匯入管線的來源檔（xlsx、ui-labels.json 新增 key 預設值、about-* 匯入源）；前台不讀
├── scripts/                    # 內容批量匯入（import-*.cjs 直接讀 data-source/ 的 xlsx／json 寫進 Directus）＋ 部署（make-upload-package.ps1 → minify-package.cjs）＋ 媒體／icon 同步工具
├── images/  assets/            # 圖片與其他資源
├── js/config/slugs.js          # 對外網址 slug 唯一來源（頁面清單＋預設 slug＋後台 site_slugs 覆寫；見「網址 slug」）
├── js/config/api.js            # Directus API base 唯一注入點（CMS_API_BASE / CMS_ASSETS_BASE / CMS_CDN_BASE）＋ 共用 cdnUrl / cdnUrls / fetchCmsJson / saveLKG / readLKG
├── docs/                       # 深度參考文件（CLAUDE.md 只當索引、細節看這裡）
│   ├── SPA-接-Directus-Headless-最佳實踐.md   # 後台架構權威文件（⚠️前台部署部分過時，以「前台上線流程」為準）
│   ├── 前台上線流程-S3-CloudFront.md          # 前台正式上線（S3+CloudFront）權威文件
│   ├── 橫向手機版最佳實踐.md    # 矮橫向 RWD 的原理與業界慣例
│   ├── 動畫盤點表.md ＋ 無障礙稽核與改進清單.md
│   └── PDF-上傳前處理-object-streams.md      # library documents 開書慢治本：pikepdf 重存→S3 覆蓋→invalidation（腳本 scripts/optimize-pdfs-objstm.py）
└── package.json                # scripts：build:css / watch:css / check:ts
```

## SPA 架構

### Router 流程（`js/router.js`）
1. **攔截 `a[href]`**：document-level click listener → `navigateTo(url)` → `loadPage(route)`
2. **`loadPage`**：
   - `navSeq` race guard：每次 ++navSeq，await 後若 mySeq ≠ navSeq 則 abort（用戶連點不同連結時新請求接手）
   - `Promise.all([runPageExit(route), fetch(htmlFile)])` 並行：退場動畫 + fetch
   - `cleanupPageModules()` 統一清理（見下）
   - `main.innerHTML = newMain.innerHTML` 只替換 `<main id="page-content">`，header/footer 不動
   - `loadPageCSS(page)` 動態載入頁面專屬 CSS（library / atlas / create / alumni）
   - `updateNavActive(page)` 更新 header logo size + nav 高亮
   - footer display:none toggle（generate/library/atlas 隱藏）+ broken-init recovery（無 `.footer-anchor` 則重 init）
   - `body.classList.toggle('overflow-hidden')` for generate/atlas（鎖頁 scroll）
   - `body.style.overflowX = 'hidden'` for about/alumni（section-title-strip overflow viewport 右側）
   - `initPageModules(page, searchParams)` 跑頁面專屬 init——**頁面模組一律 `import()` 動態載入**（2026-10-04；原 52 個靜態 import＝每頁載全站 ~2MB）。開頭取 `const seq = lazySeq` + `alive()`，import 完 init 前比對（換頁 cleanup 會 `lazySeq++`）→ 下載中連點換頁不 stale/double-init；同頁多支模組共用同一 seq。**新頁面照這個寫法，別加回頂部靜態 import**（全站常駐的 header/theme/hero/cleanup 類才靜態）。⚠️ 動態 import＝init 晚於換頁後第一次繪製：HTML 裡「init 才藏起來再進場」的元素，隱藏態要直接寫在 HTML（舊例：首頁圓形 WATCH 卡出生 `clip-path:circle(0%)`；2026-10-26 起首頁影片＝url 是影片的那則 news（後台 index_video 已併進 index_news），banner 由 JS 建、進 DOM 即 `revealHidden()` 四向藏著再進場）
   - `setTimeout scrollToTop` + `ScrollTrigger.refresh` 收尾

### 路由表特殊規則
- 本機／GitHub Pages 預覽的 `pushState` 用「真實檔案路徑」（`/pages/X.html`）— 沒有 SPA fallback，refresh 才不會 404；正式站（`CLEAN_URL_HOSTS`，在 `js/config/slugs.js`）才輸出乾淨 slug
- `/create` URL 對應到 `route.page === 'generate'`（歷史殘留，邏輯名稱與 URL 不同）
- 404 fallback：找不到 route → 載入 `/pages/404.html`

### 網址 slug（`js/config/slugs.js`，2026-11-16）
對外網址用字跟程式內部代號分開：**內部代號不變**（route 名 atlas／support／generate、分頁 id conferences／files…、檔名、後台 collection、label key），**只有進出網址列才換成 slug**（`/world`、`?section=forums`、`#documents`）。
- **唯一來源**：`SLUG_DEFAULTS`（key＝`page.<route 名>`／`<頁>.<分頁 id>`）＋後台 `site_slugs`（key、slug）同 key 蓋過預設；頁面清單 `PAGE_FILES` 也在這（router 路由表由它建）。後台讀不到＝預設；生效中的表存 localStorage `sccd-slugs`（head 的 `layout-mode.js` 也讀它判 iPad 版型組）。後台補列＝`node scripts/setup-site-slugs.cjs`（只新增、不動已填的）
- **站內連結照舊寫真實檔名＋內部代號**（`atlas.html`、`pages/activities.html?section=conferences`；HTML、sitemap json、程式組的 href 都是）：router `navigateTo` 寫進網址列時換成 slug。別寫死乾淨路徑（`/activities?…`）——slug 一改就斷
- **進**：頁面模組讀分頁用 `readParams(page)`／`readTabHash(page)`，別直接讀 `location.search`／`hash`；判「現在哪一頁」用 `currentPage()`（route 名）／`currentPageFile()`（檔名），別拆 `location.pathname`（正式站是 slug）
- **出**：分享網址用 `tabSlug(page, id)`／`publicUrl(page, search, hash)`；library 切分頁寫 hash 也走 `tabSlug`
- 乾淨網址只認 slug（舊 slug／內部代號＝404 或當作沒帶，**不留 alias**；要留的舊網址到後台 `redirects` 補）；真實檔案路徑（開新分頁、本機）內部代號也收，載入後網址列收斂成 slug。新增頁面／分頁＝`PAGE_FILES`＋`SLUG_DEFAULTS` 加一行、重跑 setup 腳本。⚠️ 頁面 slug 一改（含後台改）＝該頁 HTML head 的 `canonical`／`og:url` 要手動跟著改（寫死、JS 不動它；舊 slug＝404，canonical 指過去＝Google 收不到，11-17 抓到 5 頁沒跟上 11-16 的改名）

### `cleanupPageModules`（`main-modular.js`）
順序敏感，做這些事：
1. **`runPageCleanups()`**：drain `page-cleanup` registry（各模組註冊的 window/document listener、observer、interval）
2. body / html overflow reset + slide-in/lightbox class 清除
3. `resetLightboxMode()` openCount 歸零
4. `cleanupCreateApp()`（p5 instance + 全 listener + special-easter-egg DOM）
5. `cleanupAtlas()` / `cleanup404()`（動態載入過才有 module ref 可呼叫）
6. ScrollTrigger.getAll 只 kill trigger 在 `#page-content` 內的（保留 trigger 是 body/document/header 的）
7. `gsap.killTweensOf(main.querySelectorAll('*'))`
8. 動態 import 補 `restoreHeaderLogo`（generate 頁可能改 logo）

### Page Cleanup Registry（`js/modules/ui/page-cleanup.js`）
為了避免 window/document 級 listener 跨 SPA 累積，各模組用：
```js
import { registerPageCleanup } from '../ui/page-cleanup.js';
window.addEventListener('scroll', handler);
registerPageCleanup(() => window.removeEventListener('scroll', handler));
```
`cleanupPageModules` 開頭 `runPageCleanups()` 統一 drain。已用模組：activities-search / anchor-nav / activities-data-loader / index-marquee。

### Page Exit Animation（`js/modules/ui/page-exit.js`）
頁面可註冊「離頁前要跑的動畫」（如 /create 的 SCCD 反向 typewriter + control panel y-reveal、alumni 的 header bar 收起）：
```js
import { registerPageExit } from '../ui/page-exit.js';
registerPageExit(async (destinationRoute) => { /* animate; await; */ });
```
router 換頁時 `runPageExit(route)` await 完成才繼續 cleanup + swap。

## 資料流與後台（Directus）

> 架構細節、schema 建法、permission 設定的權威文件＝`docs/SPA-接-Directus-Headless-最佳實踐.md`。

### 架構
- **主機**：學校 IT 提供的 Lightsail（Bitnami）**只跑後台** Directus（Apache reverse proxy `/cms/*` → Node :8055 ＋ MySQL——實測是 MySQL 非 PostgreSQL）。前台靜態檔**不在** Lightsail：開發預覽＝GitHub Pages（bernard-02.github.io/SCCD-Website，push main 自動上線）；正式網域 sccd.usc.edu.tw＝S3 + CloudFront（coming soon 版 SPA 已上線；首次上線與重新上傳流程見《docs/前台上線流程-S3-CloudFront.md》）
- **API base**：`js/config/api.js` 是唯一注入點——`CMS_API_BASE = https://sccdadmin.usc.edu.tw/items`、`CMS_ASSETS_BASE = .../assets`、`CMS_CDN_BASE = https://d2df28pyzslt2v.cloudfront.net/Directus`（2026-11-10 起；舊 sccdtest DNS 已撤）。換網域只改這一檔（scripts/ 各自寫死同一網域，要一起換）
- **檔案交付分流**（2026-08-31 起）：圖片＋PDF 走 `CMS_CDN_BASE`（CloudFront 直吃 S3，用即時 `filename_disk` 組 key、不寫死副檔名——離線 webp 轉檔自動跟上；繞過弱機 `/assets` S3 逾時掉圖問題）；`/assets` 只剩下載附件（要漂亮檔名）；影片＝HLS CloudFront 網址直貼
- **鐵則**：SPA 100% 保留（Directus 只給 JSON）；schema 在後台 GUI 建（不寫 code）；Public role 必須開 Read（沒開 = 前台 fetch 全 401）；collection 名 = endpoint 名

### 前端資料載入 pattern（`*-source.js` / `*-data-loader.js`）
**後台是唯一來源（2026-10-04 user 定案）**：本地 fallback JSON 快照、HTML 寫死的佔位圖全數退場（舊資料＝錯誤資訊、反而誤導）。失敗策略：
- **A. Directus-only + last-known-good**（activities 全系列 / summer-camp / degree-show / hero）：失敗（逾時 abort / 5xx / **200 但空也要 throw**）→ 讀 sessionStorage 上次成功真資料（`saveLKG/readLKG`）→ 都沒有才顯示錯誤態。快取進頁不清＋背景 revalidate（latest-wins），後台編輯「硬重整即生效」不變。範本：`activities-source.js`。**4 頁 hero（faculty／curriculum／activities／admission）HTML 不放佔位字**（2026-11-05）：首訪沒 LKG＝`loadHero` 回 promise、等後台字套上才排版進場（不設逾時）；後台錯＝hero 不出現、頁面其他照常。hero 的 LKG 存 **localStorage**（跨分頁／隔天即出），進站 `prefetchHeroes` 預抓 4 頁（本頁那筆跟 ui_labels 閘門並行、同次載入共用一支請求）
- **World（atlas-source.js `loadAtlasData`）＝每次等後台、localStorage LKG 只當備援**（2026-11-19 user「不改變目前情況下讓 World 快一點」＝改完硬重整即生效不能變）：成功就存一份 `sccd:atlas:v1`（key 帶版本，資料形狀改了 v 加一）；某一類逾時／失敗才拿快取那一類補、補過的不留記憶體快取＝下次再試後台；首訪沒快取＝缺的那類不畫。提速靠：main-modular `initPageModules` 一進 atlas 路由就 `loadAtlasData()`（跟 ui_labels 閘門、atlas.js 下載並行）＋ atlas.html head `modulepreload` atlas.js／atlas-source.js（直開 /world 模組跟 HTML 一起下載）。後台 Directus 資料快取（CACHE_ENABLED＋CACHE_AUTO_PURGE，改完自動清＝即生效）是剩下的大頭，user 11-19「後台可以緩緩」
- **其餘 collection**：失敗 → 空資料（清單空、文字保留 HTML 靜態字、圖不顯示），且不快取失敗結果＝下次重抓
- **新增 loader 一律用 `js/config/api.js` 的共用 helper**：`cdnUrl(file)` / `cdnUrls(m2m)` 組 CloudFront 圖片網址、`fetchCmsJson(url)`（逾時涵蓋到 body 讀完——只保護 headers 的版本會 hang）、`saveLKG/readLKG`。別在 loader 裡再寫一份
共通：
1. fetch Directus（`?limit=-1&sort=sort`，排序吃後台 sort 欄、前台不重排；例外＝activities 同年內強制月/日新→舊）
2. single-flight cache：cache 存 Promise，同頁多個消費者共用一次請求
3. 圖片欄位 = Directus 檔案 → `cdnUrl()` 組 URL；**沒圖＝不顯示／灰底（`var(--lib-bg)`），不放本地佔位圖**
- **尚未上 Directus**：alumni 整頁（`data/alumni*.json`）、網站地圖（`data/accessibility.json`）；其餘頁面已全接（atlas workshops/industry 已改讀 atlas_workshops / atlas_industry）
- **人名庫／單位庫／職稱庫**（後台 `people`／`organizations`／`job_titles`，2026-11-17 全站接上）：**全站的人名、單位、職稱一律從這三個 pool 選，其餘照舊打字**（user「只有那三個資料庫的 data 才是選取，剩下的都是 key 的」；例外＝老師履歷 educations／experiences／journey／awards、library 得獎人（都是學生）照打字）。各處形狀＝`scripts/setup-people-pool.cjs` 的 SPEC：活動講者（11 個 collection，含論壇場次、畢業展場次）＝`<col>.people` M2M＋每場職稱／單位（`<col>_people_titles`／`_people_orgs`＝同一人不同場可掛不同職稱、單位）；主辦單位＝`library_awards.orgs`／`admission_summer_camp.orgs`；world 四張表一列一單位＝`org` M2O（分類＝哪張表、國家跟著單位）；師資＝`faculty.person` M2O＋職稱／職級、現職＝`titleItems`／`occupationItems`（M2A，職稱庫或單位庫混排、照順序）。前台在各 source 攤回舊 shape（`guest-orgs.js` `poolGuests`／`poolOrgs`、faculty-source `fromPool`、atlas-source `orgOf`），渲染不動；單位才有國家。pool 端的「出現在哪裡」群組看得到誰在用，關聯 RESTRICT＝還有人用就刪不掉；合併重複＝`node scripts/merge-pool.cjs <pool> "<留下 英|中>" "<併掉 英|中>" …`（用到的地方從後台關聯自動找、全部改指＋補空欄＋刪掉併掉那筆）。**媒體庫**（`media_outlets`，user 2026-11-19）＝報導的媒體也從 pool 選：`library_press.media` M2O（SPEC 的 `org` 類給 `pool`／`field`；建庫＋搬資料＝`node scripts/setup-people-pool.cjs library_press`，先 `--dry`），前台 library-panels.js `mediaWithCountry` 先讀 `media`、還沒搬的列退回舊 mediaEn／mediaZh／country；合併同上（pool 名 `media_outlets`）。舊欄位（guests／organizers／company*／faculty 名字・titles・occupations…）目前只藏不刪＝前台新版（GitHub＋S3）都上線後才跑 `--drop-legacy`（自動備份到 repo 外 `../SCCD-後台舊欄位備份/`），連同 Flow「guests→aka/國家欄同步」一起拿掉
- **legal 三頁後台**（2026-10-04 整理；遷移腳本已刪、見 git 歷史）：`regulations`（規章與政策＝頁面說明＋① 學系規章表格＋② 政策列）、`donate`（捐贈＝頁面說明＋捐贈項目；route 名仍叫 support）、`accessibility_statement`（網站地圖的聲明）。可展開的列共用 標題／最後更新／內文（富文本），文字列另有小節、規章列另有分類表格；後台介面預設繁中。舊 `support`／`policy_and_statements` 與 regulations 舊欄位已刪（2026-10-04 `--cleanup`）
- activities 的 `'/data/xxx.json'` 字串只剩 section 識別字（檔案已刪、不會被 fetch），見 activities-data-loader.js 檔頭
- **影片**：自架（user 明確排除 YouTube）——S3 + CloudFront HLS，原生 `<video>` 播放。⚠️ 播放必須 no-cors（加 crossOrigin 會炸，見 memory）
- **後台整個連不上（憑證過期／DNS／拒連＝fetch TypeError；2026-11-03 `*.usc.edu.tw` 憑證過期實例）→ 每頁只剩 COMING SOON hero**（user 定案）：`api.js` `cmsDown` 由 `fetchCmsJson` 順手更新（逾時／HTTP 錯不算），`main-modular.js` `renderComingSoon`＝換 `<main>` 為共用 hero（文字 COMING SOON／即將上線）、藏 footer、不進待機；首次進站等 ui_labels 回來（上限 1.5s）再 init，之後換頁同步判；COMING SOON 中每頁 `probeCms` 探路、後台回來下一頁恢復；**/create 例外照常可用**（p5／字型／彩蛋／icon 全本地檔）。HTML 靜態 nav 字＝後台掛時的 fallback，改後台 nav 名要同步 `pages/header.html`＋`data/accessibility.json`。分頁標題＝`ui_labels` 的 `nav.<route 名>`「英 中」（不加 - SCCD，user 11-17）（main-modular.js；HTML `<title>` 是 fallback、同格式，改後台名要同步）：header 9 頁＋footer 法務三頁（`nav.support`／`nav.regulations`／`nav.sitemap`，後台分類 footer，同時是 footer 連結字、左下當前頁卡、網站導覽清單；fallback＝footer-content.js `LEGAL`／header.js `PAGE_CARD_LABELS`／accessibility.json；頁面大標題與 og:title 仍寫死 HTML）；首頁、404 寫死，DSD 內頁＝「Degree Shows 畢業展 年份」。例外：alumni 的 HTML `<title>`／og 刻意是長版（給 Google），分頁照吃後台 nav 名（user 11-17）。各頁 title／og／description 文案總表＝`docs/SCCD-metadata new1.txt`（user 維護；改了照它套進各頁 head，og:description＝description、og:site_name 全站同一句）

### 內容更新方式（給後台編輯者）
- **日常編輯**：Directus 後台 GUI（老師登入改文案／傳圖／拖 sort 欄排序），前台重新整理即生效；後台 label 全繁中、雙語欄位英上中下
- **批量匯入**：`scripts/import-*.cjs` 直接讀 `data-source/` 的 xlsx／json 寫入 Directus（舊 Excel 模板產生／解析管線 2026-11-02 已刪）；匯入來源檔放 `data-source/`（新增 ui_labels key 的預設值＝`data-source/ui-labels.json`）
- 前台沒有本地快照要同步：後台改完硬重整即生效

## 設計系統

### 顏色
- **主色**：黑 `#000000` / 白 `#FFFFFF`
- **三原色（ACCENT_COLORS / 「rgb」）**：綠 `#00FF80` / 粉 `#FF448A` / 藍 `#26BCFF`；JS 端一律用 `SCCDHelpers.ACCENT_COLORS`（粉綠藍）／`SCCDHelpers.getRandomAccentColor()`（不連續重複），勿在模組內自建陣列
- **灰階**：`--gray-0` ~ `--gray-9`（注意：是 `--gray-N` 不是 `--color-gray-N`）
- 中性灰用 `var(--gray-N)` 不要用 `rgba(0,0,0,X)` 透明黑（mode 切換時透明黑會疊底色脫節）

### 三主題模式
通常用 `mode1/mode2/mode3` 指稱：
- **mode1 / standard**：白底黑字（`body.mode-standard` 或無 class）
- **mode2 / inverse**：黑底白字（`body.mode-inverse`，規則在 `themes/inverse.css`）
- **mode3 / color**：彩色背景（`body.mode-color`，hue 由 JS 動態設 CSS var；規則在 `themes/color.css`）

切換由 `theme-toggle.js` 控制；`/create` 頁特殊（body class 暫停，由 generate-app 自己處理）。

### 模式切換 transition（兩套，分開維護；2026-10-03 user 定案）
- **View Transition**（atlas、/create 以外的頁面）：`theme-toggle.js` runModeViewTransition 整頁快照交叉淡入，一般元件不用登記。一直在動的區塊＝「即時層」（照動不暫停、層內顏色自己 transition）：`MODE_VT_LIVE_LAYERS` 與 typography.css 的同一串 selector 兩邊同步
- **舊 `.mode-switching` 逐元素 fade**（atlas 頁＋不支援 VT 的瀏覽器）：`css/base/typography.css` whitelist 只淡登記的元件（不在 list 內＝snap）。atlas 星雲節點/連線刻意不淡（試過 VT 即時層較卡）；atlas 新增 mode-aware 元件要補進 whitelist

### Theme variables（推薦給新元件用）
- `--theme-fg` / `--theme-bg`：fg / bg，依 mode 切換
- `--theme-fg-inverse`：fg 的對比色（strict B/W 用），三 mode 都已定義（2026-05-18 起）
- `--theme-fg-rgb` / `--theme-bg-rgb` / `--theme-fg-inverse-rgb`：RGB 三元組，給 `rgba(var(--X), 0.5)` 用
- 新元件 mode-aware 規則優先寫 `body:is(.mode-inverse, .mode-color) .X { color: var(--theme-fg) }` 一條，取代雙寫

### 游標
- 全站一律寫 `var(--cursor-X)`（CSS、JS inline、HTML inline 皆同；Tailwind `cursor-*` 已映射成 var）；`--cursor-*` 唯一定義在 `js/utils/helpers.js`。勿寫裸 keyword（`cursor:pointer`）＝露系統游標。`css/components/cursor.css` 只補瀏覽器內建游標，新元件不用登記

### 字體
- **標題**：H1 (8rem) ~ H6 (1.25rem)
- **內文**：P1 (1rem) / P2 / P3
- **手機 nav／tab 鈕字級一律 `--font-size-s`（14px；user 2026-11-19「都 14」，三種手機版型都是）**：底 bar nav、第二層 tab 列（about division／curriculum 年級／activities 子分頁）、library 分頁 tab 與篩選選項（分類／國家／年份）、World 分類 tab・主持就職鈕、alumni nav・城市 tab、DSD 子展覽 tab、footer tab。新的 nav／tab 鈕照吃，別再各自寫 xs／md。不算在內：World 職業 chip（篩選 chip，xs）、footer tab 以外的 footer 文字（xs）
- **字重**：一律寫 token `var(--font-weight-regular|semibold|bold)`（variables.css 唯一來源；CSS／JS inline／Tailwind `font-bold`・`font-regular` 都指向它），**勿寫死數字**；bold＝600（2026-10-26，中英皆是）。Google Fonts link 的 Inter／Bitter／Noto Sans・Serif 也只載 `wght@400..600` 當保險（各頁 head ＋ library-panels.js `SERIF_FONTS_HREF`；新頁 head 照抄），bold 要超過 600 得連 link 一起改；typography.css `font-synthesis-weight: none` 擋假粗體、`b, strong` 吃 bold token。例外：/create 用本地 Inter-Medium（固定 500，不動）
- **英文字距**（2026-10-26）＝Inter 官方 dynamic metrics：typography.css base layer `*` 依各元素字級算（`exp()`＋`1em / 1px`，不支援的瀏覽器退回 -0.011em），字越大越緊（96px -0.022em、16px -0.011em）；元件自己寫的字距照舊贏。中文維持 0：標 `lang="zh-Hant"` 的自動歸零，沒標的大字中文明列在同一段（新的 xl 以上中文元素要標 lang 或補進清單）
- **大字中文縮 88%**（2026-10-26）：xl 以上（`text-xl/2xl/3xl` class、h1/h2、`.about-hero-name`）的中文改吃 `'Noto Sans TC Title'`＝`css/base/fonts-zh-title.css`（Google 宣告快照＋`size-adjust: 88%`，字檔同網址）、Inter 不動；規則在 typography.css「大字中文」。新的大字中文用 CSS 自訂字級（沒 text-* class）的要補進那條；自己寫 font-family 的大字（library）要把 Title 插在 Inter 後。⚠️ 選擇器用 `[class~="text-xl"]` 不用 `.text-xl`（h3/h4 的 @apply 會把規則抄過去）。純中文的大字卡縮完墨跡偏下 → 上內距挪 `--zh-ink-nudge`（0.03em）給下內距；上內距不夠減（3xl／2xl 上下是 0）＝減到 0、差額加倍給下內距（hero.css 中文大標、404、DSD `fitCardToInk`），新的純中文大字卡照做

### 間距
xs (8px) / sm (16px) / md (24px) / lg (32px) / xl (48px) / 2xl (64px) / 3xl (96px) / 4xl (128px) / 7xl / 8xl

**直向手機貼底界線＝`--mobile-bottom-anchor`（32，鏡像 header 鈕離頂 pt-lg；2026-10-30 統一）**：底 bar 的 chip（bar 高＝界線×2＋chip 28、chip 置中）、角落鈕（DSD 返回／分享、atlas 切換）、footer 鈕、mode3 鉛筆、lightbox／PDF 底列、首頁 news 堆疊底，底邊一律落在這條線（右下角鈕佔掉的寬＝`--br-btns`：footer 鈕或 mode3 鉛筆 44＋sm；捲動列一律滿寬、鈕蓋在上面，只把尾端 padding 加長＝捲到底最後一顆離鈕 sm；有 footer 時鉛筆疊在 footer 鈕正上方（間距 sm＝同 header mode↔menu）；底 bar 的 chip 中線對齊 footer 鈕中線（bar 高不動、底 padding 16＝44−28；curriculum 兩行 program chip 另算）；第二層列底離 footer 鈕頂 8、跟 nav 距 sm，尾端 padding 只在 mode3＋footer 才加（2026-11-04）；鉛筆點開往上長（直排色條，真桌面才往左）；menu 開著鉛筆收——直向 portrait.css、iPad landscape.css 檔尾。首頁 news 三則另算：收著的右緣對齊 header mode 鈕（讓 44＋sm，index-marquee.js `BTN_COL`），點開時 ↗ 伸進鈕欄、蓋過鉛筆／footer 鈕（`body.hm-poster-open` 把 footer 鈕降到開著的 news 下）；第二層列（about division／curriculum 年級／activities 子分頁）疊在 bar 上方（bar 高 − xs）。curriculum 底 bar＝program 列、年級 bar 在上（2026-11-01 user「先年級才班級」）。新貼底元素照吃，別再各自寫 16／18／24。真桌面另有 48（頁卡底）不吃

### 字卡內距（2026-10-26）
有底色的單獨字卡一律依**字級**吃 `variables.css` 的 `--card-pad-<size>`（3xl `0 10px`／2xl `0 8px`／xl `5px 7px 4px`／lg `5.5px 7px`／md `6px 7px`／s `5px 6px`／xs `4px 5px`／2xs `3px 4px`＝atlas 星雲節點 11px 專用），行距吃同字級 `--line-height-<size>`。舊「全站 6px 8px 5px」已退役，新字卡別再寫死。卡中卡（手風琴內文；footer 卡內資訊卡／legal 連結、atlas hover 卡三段 10-26 起照吃 s）、列（list-header、規章列）、控制列不吃。JS 要數值就讀 `:root` 的 token（例：atlas.js createCareerController）

**浮層卡內距＝`--popup-pad`（20）**：footer 覆蓋卡、faculty／curriculum 詳情色卡共用（字卡 token 不受影響）。**box 內捲的 scrollbar（user 2026-10-26）**：① scrollbar 到 box 右緣＝**內文字級的字卡右內距**（s→6、md→7）。說明文字卡本身內距就是字卡 token＝自然跟左內距一致；② box 左內距不是字卡 token 的（pop up 色卡 20、about history 清單卡 32）照樣跟內文走、刻意跟左邊不一致（色卡 `--desk-sb-edge`、history `.tl-list-content` right 6）；③ 文字到 scrollbar＝卡片內距，只在真的要捲時才留，不用捲就不留（自製 thumb：desk-card.js `syncGutter` 掛 `.has-desk-thumb`，先拿掉再量＝不會來回跳；原生 scrollbar 可把間距併進 scrollbar 本身＝寬 10＋間距、thumb 左段透明 border＋`background-clip: padding-box`，免 JS）。about Works playlist 另計：scrollbar 到色塊右緣＝同區說明文字卡的右內距（6）

## RWD（Desktop-First，三 viewport）

**絕對原則：手機版的修改不能影響桌面版。**

全站有**三個 viewport**（2026-10-01 user 定案，沒有獨立的「平板版」）：桌面（橫的、≥1024、高 >500、**有 hover**）、直向手機（<768）、**矮橫向／iPad**（橫向手機＋直拿 ≥768，同一套排版，見下）。**2026-11-10 改看方向**（iPhone Duo）：橫的且（高 ≤500 或寬 <1024）＝橫向手機（Duo 內螢幕橫拿 951×585）；直的且 ≥768＝iPad（含 iPad Pro 13 直拿 1032）。**2026-11-16 iPad 版型看頁面**（user 同日兩段定案：先「iPad 不需要用 pc 的版面」，再收斂成「library、world、create 適用手機的排版，其他頁面看螢幕大小」）：**library／atlas／create 三頁 iPad 一律手機排版，其餘頁 iPad 照螢幕大小（橫拿 ≥1024＝桌面排版＋觸控退路）**，機制見下方「iPad 版型模式」。樣式表與 JS 的寫法以三頁那種判法為準：桌面多一個條件＝有 hover（滑鼠／觸控板）；**沒 hover 的橫向不論多大＝橫向手機版**（iPad 橫拿 1180×820、iPad Pro 1366×1024；規則集跟 768–1023 寬的橫向手機完全相同）。用 `hover` 不用 `pointer`：只有 hover／none 兩個值＝桌面與手機互補、沒有兩邊都不是的裝置；iPad 接鍵盤觸控板 WebKit 仍回 `hover: none`。寬 >1920 且高 >1080 的大螢幕＝根字級等比放大（typography.css `html` font-size；chrome 的 container padding 在 variables.css 釘回 60px）——新元件的內容尺寸上限寫 rem 才會跟著放大。⚠️ header 列高（h-24）與 md 間距是 rem＝大螢幕也變大（2560×1440＝128／32），但鈕 48、logo、container padding 是 px：JS 要對齊 header 鈕別寫死 96／24，讀 `--header-height`／根字級（例：library-card.js `deskTopGap`／`deskRight`，2026-11-12）

### 規範
1. **CSS Variables**：預設值 = 桌面版（不可改），手機版用 `@media (max-width: 767px)` 覆蓋
2. **Tailwind classes**：**只用 `md:` prefix**（不用 `sm:`）；預設 class = 手機，`md:` = 桌面 (768px+)
3. **Hover**：手機版不應有 hover；所有 hover 包在 `@media (min-width: 768px)` 內
4. **JavaScript**：條件式執行，版型判斷一律用 helpers.js（唯一來源，已含矮橫向 gate）：
   ```js
   SCCDHelpers.isMobileLayout()   // 直向手機 <768 或 gate（＝手機排版）
   SCCDHelpers.isDesktopLayout()  // 其餘（橫的、≥1024、高 >500、有 hover）
   SCCDHelpers.isLandscapeGate()  // 只看 gate；監聽轉向用 matchMedia(SCCDHelpers.LANDSCAPE_GATE)
   SCCDHelpers.isPortraitPhone()  // <768 直向（非 gate）；flex stack 版 hero／DSD 用
   SCCDHelpers.isBottomBarLayout() // 直向＋iPad 底 bar（橫向手機 nav 回 header 帶、不算）
   ```
5. **Breakpoint**：md (768) / lg (1024) / xl (1280) — **不用 sm**。⚠️ `md:`／`min-width: 768px` 只是「底」：768–1023 會再被 landscape.css 蓋成矮橫向排版；**只給真桌面的規則要寫 `(orientation: landscape) and (min-width: 1024px) and (min-height: 501px) and (hover: hover)`**（HTML 用 `desk:`＝tailwind.config.js 自訂 screen；原 ≥1200 的 gate 已於 2026-10-01 全數下放到 1024；11-10 補 orientation；11-16 補 hover）
6. **一屏高度用 `svh` 不用 `vh`**（手機工具列會讓 vh 高估溢出；**桌面一屏框也一樣**——iPad Safari 橫向的 100vh 是工具列收起的大視口，legal／inner-scroll frame／footer 卡／DSD 媒體屏 2026-10-31 全掃成 svh；四個 nav 頁的 inner-scroll frame（section＋框＋兩欄）11-12 再改 `dvh`＝跟當下視窗同高、框底不多一截白帶，真桌面 `md:h-screen` section 的 `min-h-screen`（手機用的下限＝100vh）在 scroll-snap.css 歸零、否則 svh 被撐回大視口）——但 **section 框本身用 `100lvh`＋底 pad 多墊 `100lvh − 100svh`**（iOS Safari 底部工具列半透明、視窗底之外的內容會透出：svh 框下方的 footer 黑／下一屏會露；lvh 框多出的那截是自己的底、工具列收起後剛好一屏可磁吸到頂）。直向手機跨頁共通的版面骨架（一屏框高、首頁第一屏）寫在 **`css/layout/portrait.css`**（跟 landscape.css gate 層對稱、互斥），不要塞進 landscape.css
7. **互動看輸入**（2026-10-31；WebKit 不論接不接 Magic Keyboard 都回 `hover: none`／`pointer: coarse`）。「桌面排版＋觸控」＝iPad 橫拿的其餘頁（library／atlas／create 以外，見「iPad 版型模式」）＋有 hover、主要輸入卻是觸控的混合裝置，下面這些退路是給它們與所有沒 hover 的版型，不是死碼：hover 樣式一律包 `@media (hover: hover)`；「hover 才有」的功能（hover 才捲的 marquee）要有 `(hover: none)` 退路＝自動循環；滾輪驅動的互動（atlas 縮放）要有 touch 路徑（atlas.js pan／pinch 掛 `isCoarsePointer()`）。JS 用 `SCCDHelpers.canHover()`／`isCoarsePointer()`（helpers.js），**勿拿 `isMobileLayout()` 兼判觸控**。觸控的內捲框捲軸＝`js/modules/ui/touch-box-thumb.js`（每個 `.list-scroll` 框內自繪 thumb，iOS overlay 捲軸只在捲動時閃現；main-modular 只在 coarse 啟用）。Safari／iPad 實測三坑（2026-10-31）：① 不支援 `overflow-clip-margin`→要外擴改 `clip-path: inset(-N)`（atlas filter btn、courses filter row、activities 縮圖條）；② 旋轉的 `overflow: clip` 遮罩裁不到 GSAP 位移的圖（圖「從別處飛進來」）→圖遮罩用 `overflow: hidden`（faculty mask、Programs 圖、DSD 上下屆海報）；③ `<button>` 當 container query 容器不可靠（/create ▶❚❚ 寬上限改 px）。head 一律帶 `<meta name="format-detection">`（iOS 會把電話／email 自動變底線連結）。待補：全站 173 條 hover 規則包 `(hover: hover)`、171 個 mouseenter 監聽加 `canHover()` 守門

### iPad 版型模式（`js/utils/layout-mode.js`，2026-11-16）
- **規則**：沒 hover 的大螢幕（iPad，螢幕長邊 ≥1024）在 library／atlas／create 三頁＝手機排版（直拿 iPad 版、橫拿橫向手機版；/create 橫拿照它自己的斷點＝可以用：手機 header＋桌面式內容，轉向提示只擋寬 <1024 的手機，user 2026-11-16「橫拿應該可以使用」）；其餘頁看螢幕大小（橫拿 ≥1024＝桌面排版）。有 hover 的桌面與手機不受影響
- **寫法不變**：CSS 與 JS 一律照「沒 hover 的橫向＝橫向手機版、真桌面那串帶 `and (hover: hover)`」寫（＝三頁的判法）。media query 讀不到現在是哪一頁 → layout-mode.js 整份文件定一次：其餘頁在首繪前把樣式表裡的版型 media 還原成只看寬度（term 同時有 `orientation: landscape` 與 hover 的才動：`(hover: none)` 那項拿掉、尾端的 `and (hover: hover)` 去掉；純互動的 `@media (hover: hover)` 不動），換完的 media 集合＝11-16 之前的寫法（headless 逐條比過）
- **JS 的版型 media 字串**一律走 `SCCDHelpers.mq('…')`（同一個換法）或現成的 `SCCDHelpers.DESKTOP_MQ`／`LANDSCAPE_GATE`／`LANDSCAPE_PHONE`，**別直接把字串丟進 matchMedia**（其餘頁在 iPad 會判錯）。只在三頁用的檔（library-card.js）可以直寫
- **換頁**：三頁之間、其餘頁之間照常 SPA；跨兩組＝退場播完後整頁載入（router.js `crossesLayoutGroup`；常駐模組手上的版型 MediaQueryList 是整份文件定一次的）。換頁後 router 會再叫 `SCCDLayout.apply()` 處理新 `<main>` 裡的 `<style>` 與剛載入的頁面 CSS
- **每頁 head 必帶** `<script src="…/js/utils/layout-mode.js"></script>`，接在 output.css 的 link 後、不加 defer（同步 script 等樣式表載完才跑、又擋首繪＝不會先閃手機版）。漏了＝那頁在 iPad 橫拿變手機排版、每次換頁都整頁載入
- 自驗：Playwright `isMobile: true` 的 1180×820＝iPad 橫拿（Chromium 與 WebKit 都回 hover: none）；DevTools 看到的 media 是換過的

### 矮橫向（landscape gate）
- **Gate**：`@media (orientation: landscape) and (max-height: 500px), (orientation: landscape) and (max-width: 1023px), (orientation: landscape) and (hover: none), (min-width: 768px) and (max-width: 1023px), (orientation: portrait) and (min-width: 768px)`（CSS）／`matchMedia` 同式（JS，逗號清單；helpers.js `LANDSCAPE_GATE`）——前三項＝橫向手機（寬 ≥768 會誤吃桌面 `md:` 樣式，必須用「高度／方向」判，這是本專案最大的斷點陷阱，原理見《docs/橫向手機版最佳實踐.md》；第三項＝沒 hover 的橫向不論多大，11-16 加，橫拿 iPad 靠它）；後兩項＝iPad 直拿（user 2026-10-01：iPad 沿用橫向手機排版、只是比較高；11-10 起直拿 ≥1024 也算）。兩半必須一起寫：CSS 照抄整串，JS 用 `SCCDHelpers` 版型判斷（見上，勿再抄字串）。例外：/create 有自己的斷點（create.css／generate-app/js/utils.js），不吃後半；橫向手機一律轉向提示不給用（矮橫向＋寬 <1024・寬高比 ≥4:3 的觸控橫向＝Duo 內螢幕橫拿，2026-11-11；螢幕鍵盤一開沒空間）
- **原則**：「一切以手機版為主」——字級/spacing 變數、header、footer、menu 全套手機值；規則集中在 `css/layout/landscape.css`（分頁編號 5a~5j 區塊）；JS 端用 `SCCDHelpers.isMobileLayout()`（已併入 gate）
- **gate 內再分兩種（2026-10-30 定案）**：**橫向手機（橫的且高 ≤500 或寬 <1024，或沒 hover 的橫向＝橫拿 iPad）**＝nav／tab 進 header 帶（logo 右～mode/menu 鈕左、垂直置中 92 帶，hero 上藏、footer 前收＝`bindLandscapeNavGate`）、第二層 tab 列（about division／curriculum 年級／activities 子分頁）在畫面底（chip 中線對齊 footer 鈕）、內容照版面線 --lp-start／--lp-btn-col（landscape.css 橫向手機段開頭；about 11-06 起每屏內容頂 --about-lp-top＝logo 底＋sm 90、每區磁吸）——規則在 landscape.css gate 段內 `@media (orientation: landscape)` 巢狀段（gate 內「橫的」＝橫向手機；11-10 前是 max-height:500），其他檔寫 `(orientation: landscape) and (max-height: 500px), (orientation: landscape) and (max-width: 1023px), (orientation: landscape) and (hover: none)`，JS 判斷 `SCCDHelpers.isLandscapePhone()`；**iPad（直拿 ≥768）**＝直向同款畫面底 bar：直向底 bar 那套 CSS（lists.css `.nav-bottom-bar`、courses.css program 列＋手機 grid、variables.css about strip／division 列、navigation.css 去 header 白帶）的 media 是「直向＋iPad」union `(max-width: 767px) and (orientation: portrait), (orientation: portrait) and (min-width: 768px)`，JS 寫 `isMobileLayout() && !isLandscapePhone()`；gate 貼底界線 `--mobile-bottom-anchor` 24（landscape.css gate :root）。DSD 返回／分享鈕兩種都在左下（variables.css DSD union 段）。⚠️ gate 寬 ≥768 會吃 HTML `md:` utility（md:flex-col／md:hidden）→ union 段用 `#id` 前綴把列向、顯示寫死
- **hero（2026-10-30）**：整個 gate（含 <768 窄橫向）走桌面隨機版 `.hero-rand-grid`（hero-animation 的 `innerWidth<768` 判斷改「直向才走 .hero-mobile」）、矮高說明段落 xs；iPad 直拿的隨機版，圖的長寬比跟可用區走＝又高又窄佈滿畫面（hero-animation.js `setBannerAspect`，2026-11-11；橫的維持 16:9）；DSD 整頁 11-11 起所有手機排版（直向／iPad／橫向手機）同一套新版面（一屏一段、子展覽 tab＋說明卡、上下屆大圖；variables.css DSD 手機段，橫向手機左右排在 landscape.css 橫向手機段 5j），hero＝.hero-mobile 字卡集中左下角（5j-hero）；about 系名 hero 窄橫向（<768）也照桌面左右兩塊＋桌面字級（同段 `main .about-hero-*`）
- **footer**：整屏 slide-in（見「Footer scatter」段，2026-11-04）＝頂端 logo 列（同 header logo 位置）；橫向手機＝兩欄（tabs＋群組卡｜legal＋copyright，landscape.css 7／7b）、iPad 直拿＝單欄往下排同直向手機（legal 接在資訊區下，7c；2026-11-12）、內容超過一屏＝資訊區自己捲；library 矮橫向整套走 library.css 手機段（5h 只剩卡頂）；**但橫向手機（高 ≤500）例外**（user 2026-10-30「header 位置用作 nav btn 區」「參考桌面左右」）：tab 鈕釘回 header 帶（滿寬、在 logo／鈕底下滑過，同 curriculum／faculty）、灰卡右緣＝mode 鈕右緣、清單年份標題在列左 sticky、award 得獎人排獎名右、左下三顆工具鈕（date sort／filter／search）：filter 開浮層（左分類｜右年份，從卡右緣滑進；DOM 由 main-modular 搬進 `.lib-filter-pop`）、search 點開＝輸入框從卡底整列升上來（2026-11-12）、awards ticker 在清單下（2026-11-05 改版）——library.css 檔尾 `(orientation: landscape) and (max-height: 500px)` 段；iPad 維持底 bar＋直向一疊
- **跨 gate 轉向**：靠 orientation-reload 整頁重載自癒（init 時決定一次、不跟 resize；實際是 `reloadCurrentRoute` 軟重載＝cleanup＋重 init）；iPad 直↔橫（跨 1024）同樣走這條。**重載要留在當前狀態**（user 2026-11-19「旋轉之後應該保持 list view」）：重載前 dispatch `orientation:reload`，頁面模組用 `js/modules/ui/orientation-restore.js` 的 `keepOnOrientationReload(key, getState)`／`takeOrientationRestore(key)` 把非 URL 的狀態存 sessionStorage、重 init 時讀回即刪。已接：World（view／分類／系友子分頁，list＝直接切好不播退場）、activities（分頁＋展演／參訪子類型）、admission（分頁）、curriculum（program，疊排＝再捲到那個 panel）、faculty（分類，main-modular 傳給 initFacultyFilter）、about／alumni（anchor-nav 當前區段，init 後 scrollIntoView）。⚠️ 四個分頁頁的 `?section=`／`?program=` 呈現完就被清掉、而且 deep link 只在 fromUserNav 才呈現＝重載不能靠網址；library hash、DSD ?year 本來就留著。新頁面有「不在 URL 的狀態」照這個接。header 的 logo／mode／menu 鈕桌面、手機各一排、收起只收當下那排 → 翻面當下把換下去那排歸位（header.js `resetInactiveHeaderChrome`，2026-11-12；不然收著時轉向、再轉回來那排會卡在遮罩外）
- ⚠️ landscape.css 是 unlayered：同特異度的純 class 蓋不掉 output.css 的 `md:` utility（source order 輸）→ 要用 `#id` 或多層 selector 提特異度；`!important` 也輸給 @layer 內的 `!important`
- ⚠️ 動態載入的頁面 CSS（library/atlas/create/alumni）link 在 output.css 之後 = cascade 贏 landscape.css，改 <768 規則要 portrait 限定

### 尺寸適配四類分桶（定值 vs 相對值，2026-07-11 定案）
| 類別 | 用法 |
|---|---|
| 版面骨架（欄、區塊佔比） | 相對：`fr` / `%` / `svh` calc |
| 內容尺寸（圖、卡、字級 token、觸控 44） | 固定 px 或 max- cap（縮放會不可讀；44 是硬標準） |
| 留白 | 微留白（gap、16/24 padding）固定 token；宏觀留白（佔畫面幾成）`clamp(下限px, Nvw, 上限px)` |
| 錨定值（貼固定 chrome 的偏移：header 帶 92/104、logo 右 128、mode 鈕區 140） | 必然固定，改相對反而跑位 |

判斷風險看斷點寬度跨度：直向 ±7% 固定值安全、矮橫向 ±17% 宏觀值才需要比例制。

## 共用動畫模式

### Clip-Reveal Entrance（hero-style 由下而上揭露）
- 元素 `yPercent: 100 → 0`，外層 `overflow: clip` wrapper，視覺從容器底邊滑入
- **參考**：`js/modules/pages/hero-animation.js`
- **共用 helper**：`js/modules/ui/scroll-animate.js`
  - `setupClipReveal(elements, opts)` — wrap + 預設 yPercent:110
  - `playClipReveal(elements, opts)` — 0.9s power3.out + stagger
- **規範**：不配 opacity fade；duration 0.9s + power3.out；stagger 0.12s（同層）/ 0.08s（跨卡）
- **用詞**：對話中講「**clip-reveal**」或「**hero 標題那個進場**」就是這個 pattern

### Clip-Path Inset Reveal（4 方向擦除/揭露）
- `clip-path: inset(...)` 從 100%→0% reveal 或 0%→100% hide，方向 top/right/bottom/left 四選一
- **參考**：
  - 圖片進場：`js/modules/filters/faculty-filter.js`
  - header 鈕收／放：`js/header.js` 的 `footerHideBars`／`footerShowBars`（遮罩＋本體平移；lightbox-shell 只剩 `animateHeaderShow` 當保險，2026-11-19 起沒有 overlay 會收 header 鈕）
- **規範**：inset 四值單位必須一致（全 % 或全 px），混用會讓 interpolate 失敗看起來「直接出現」
- **用詞**：對話中講「**clip-path**」就是這個 pattern

### Marquee（文字 overflow 跑動）— 新增時選哪套（2026-08-19 定案 B）
判準看「有沒有 hover、放開時要不要回彈」，**不是**看幾行：
- **桌面 hover 才捲**（卡片 / 欄 hover 才動，放開要**平滑回彈**到原點）→ 先 `applyMarqueeOverflow` 量寬，再**桌面**逐 hover unit call `bindMarqueeReturn(hoverEl, innerSel, lineSel)`（GSAP 接手、helper 自我 gate 桌面、inline `animation:none` 蓋掉 CSS keyframe）。中英兩行自動同步。手機不綁＝維持 CSS 自動循環。已用：DSD events/list、atlas list、courses、library press/files/album、activities/faculty/ref-chip。
- **一直自動跑**（無 hover，如首頁 news、library 色卡、得獎人）→ 照舊純 CSS keyframe，**不需要也做不到回彈**。
- ⚠️「連續循環 + 平滑回彈」只有 JS/GSAP 能做（純 CSS 循環放開必 instant snap）；「單次滑出看一眼就回」才能純 CSS transition。always-on 與手機一律不回彈。
- **用詞**：對話中講「**回彈 / 放開平滑回去**」就是 `bindMarqueeReturn` 這套。細節見 memory `project_marquee_hover_easeback_unify` / `reference_sitewide_marquee_mechanisms_map`。

## 效能最佳實踐（2026-08~09 activities 優化戰役定案；診斷過程 md 已清，完整版見 git 歷史 30ce440 的 docs/activities-優化四~九輪.md）

大清單（百項以上）頁面的鐵則，新頁面／新清單直接照做，別重走一遍診斷：

### 渲染
- **Viewport lazy render**：首批 ~15 項＋sentinel IO 續建（10/批）；deep-link 走 `_lazyRenderAll` 兜底。小清單不需要
- **HTML string 一次組完再 innerHTML**；隱藏態直接烙在 HTML string（出生自帶 class），**不要**渲染後逐項 `gsap.set`——新元素對 GSAP 永遠「冷」，首觸逐列讀 computed style＝逐列全頁 recalc（50~120ms×N，切分頁曾凍 9~34s）
- 事件綁定分幀（rAF 批次）＋ incremental（`data-bound` 守衛）；`.list-item` 加 `content-visibility: auto`
- **讀寫分離**：先讀全部 layout 再寫全部 style，別逐項讀寫交錯（forced reflow thrash）；per-元素 ResizeObserver 要 bail 守衛
- **`:has()` 只放 subject 位置、引數用子選擇器**（`.a:has(> .b)`）：`.a:has(.b) > *`（子孫引數＋非 subject）會讓 Chrome 把全站任何 DOM 插入升級成全頁 style recalc（~20ms×N；2026-11-01 about 切 division 500ms long task 根因＝lists.css 副標收合那條）。要選 `:has()` 元素的子孫＝直接寫子選擇器
- **樣式表不寫 `[style…]` 選擇器**（2026-11-17 全站拔光，連動態載入的頁面 CSS；新規則別再加）：Chromium——`X[style*=…] *`（後面接 `*`）會把全站任何元素的每一次 inline style 寫入（`el.style.x =`、GSAP 每幀）變成整棵子樹重算（atlas 文書機跑不動的主因；只在 mode2／3 才命中的規則也算）。**WebKit 更嚴：樣式表裡有任何一條 `[style…]`（不 match 的 media 裡的也算），inline style 寫入就走不了快路徑，而且要拔到最後一條才有效**（Playwright WebKit，atlas 100 個名字寫入＋重算：50～60ms → 6～8ms）。改法＝**寫 inline 值的地方同步掛 class**，樣式表只認 class：
  - inline 底色 → `.has-inline-bg`：`SCCDHelpers.setInlineBg(el, v)`，或寫完叫 `syncInlineBg(el)`。語意照舊選擇器＝style 字串含 `background`（殘留的 `transition: background` 也算，清底色時要一起清）。themes 會讀它的主體＝list-header／list-item／list-content／press-item／files-item／award-record-item／degree-show-card-content／courses-grid-card／courses-bfa-label／alumni-sponsor-card／DSD `#prev|next-clip`・labels 的 p／`.class-group-label`：**對這些元素寫 inline 底色一律走 helper**，漏掛＝mode2／3 那個狀態字色錯（說明在 themes/inverse.css「inline 有底色」段）
  - library 色卡 → `.lib-card-gray`／`.lib-card-fg-inv`（library-card.js `setCardBg`／`syncCardMarks`）；`.list-content` 的 overflow → `.is-overflow-visible`（list-accordion.js `setContentOverflow`）；首頁靜態 footer 藏 → `.is-footer-hidden`（router.js／renderComingSoon）；iOS 旋轉色塊抗鋸齒 → `.ios-aa`（main-modular.js `scanIosAa`：只在 iOS、每 1.5 秒＋換頁掃一次，只掛不拔）
  - 別用全域 MutationObserver 代掛（WebKit 每次 inline 寫入多 ~0.1ms）；JS 裡的 `querySelectorAll('[style…]')` 不受影響
- **`content-visibility:auto` 的列別整份量尺寸**（2026-11-12）：讀「被跳過」列裡的 offsetWidth／rect＝瀏覽器當場逐列補排版（press／album／documents 整份量 marquee，每次切分頁凍 1～2 秒）。只量有畫的列（`checkVisibility({ contentVisibilityAuto: true })` 要探列的**子元素**），其餘等它進渲染範圍——事件 `contentvisibilityautostatechange`＋捲動＋每秒巡，三路都要（WebKit 對第一次判定不發事件、事件也不冒泡）。範本：library-panels.js `mqCvState`（awards 是 `applyAwardMarquees`）
- **IntersectionObserver 的目標數＝每畫一幀的固定成本**（Chrome 約每 800 個多 1ms／幀；c-v auto 的列瀏覽器自己也各算一次）：別把整份清單掛上去，只掛有畫的那幾列（library 觸控 marquee 閘門 792 → 十來個）

### 動畫
- 清單 rows 進退場用 **`list-row-reveal.js`**（CSS transition、compositor 接管、零 computed 讀），不用 GSAP yPercent。⚠️ 揭前隱藏態必須已 commit（painted）才會 transition 而非 snap——同步 hide→reveal 之間要 `void el.offsetHeight` 單次 reflow
- 重複跑的動畫用 **transform**（clip-reveal）不用 **clip-path**（每幀 full repaint）；判準＝文字有沒有位移
- 切分頁 reveal/exit 加 **viewport-cull**（視窗外項目 snap 不動畫）
- GSAP reveal 完要沉澱成 `translate(0px, 0px)`（非 0%）
- 時長/曲線走 token：GSAP 用 `motion.js` 的 `DUR.*`／`EASE.*`，CSS（含 JS inline transition 字串）用 `var(--dur-*)`／`var(--ease-*)`。⚠️ 勿傳 `'cubic-bezier(...)'` 字串給 GSAP（core 不認、靜默退回 power1.out）；要 bezier 曲線＝helpers.js 用 CustomEase 具名註冊（現有 `EASE.wipe`＝`--ease-wipe`）

### 圖片
- 縮圖 `decoding="async"`；縮圖不寫 >1600px
- **收合列的媒體點開才載**（2026-10-04 user 定案）：可收合列的縮圖／海報出生只帶 `data-src`、自架影片 tile 帶 `data-hls-thumb`，點開那列才由 `list-accordion.js loadDeferredMedia` 換上（deep-link 目標捲過去前先載）；載入中＝佔位色塊（收合時 `[inert]` 暫停循環）。⚠️ 別改回出生就 `src`：大清單背景會建滿，沒打開的列也會把整份相簿抓完（展演曾 25 秒抓 ~1100 張／95MB）；也別改用原生 `loading="lazy"`（巢狀捲動框內偶爾不觸發）
- 交付走 CloudFront（`CMS_CDN_BASE`）；新上傳大圖跑 `scripts/convert-images-to-webp.cjs`（每日 Action 已掛）
- 弱機不能 on-the-fly transform——不要用 Directus `?width=` 參數（冷生成 504）

### 快取
- single-flight promise cache＋sessionStorage last-known-good＋背景 revalidate（latest-wins，防慢請求蓋新資料）
- 切換／請求類 race 一律**序號作廢**（navSeq pattern）；動畫接管前 `killTweensOf` 目標本身（外層蓋不到子元素）

### 量測
- CDP Profiler 看 self-time 找真根因（別猜）；headless 自驗要用 fresh node static server（舊 server 快取 JS 會量到假的「0 變化」，先 `curl | grep` 確認 serve==disk）
- ⚠️ headless 量到的「reveal 延遲」可能是測量假象，實機確認
- ⚠️ 這台筆電插電時螢幕 240Hz、headless Chrome 的 rAF 跟著跑 ~210 次／秒（拔電 60）：「每秒」成本會灌水，量之前先數一次 rAF；比同一輪的相對值，或改量每拍／每幀
- **實機診斷開關 `?perf=`**（2026-11-17，helpers.js `SCCDHelpers.perf`；逗號分隔、同分頁有效、`?perf=` 清掉）：`nologo`（logo 不轉）／`nocardmq`（library 色卡・灰卡標題跑馬燈停）／`noticker`（awards ticker 停）／`nomq`（全站無限循環跑馬燈停）／`nofloat`（World 漂浮停）。平板上哪一項貴 headless 量不到，請 user 用開關一項一項關；新的常駐動畫想讓它可以被關＝加一個名字

### 每幀叫醒主執行緒的來源（2026-11-17 平板效能分析）
頁面閒置時貴不貴，看的是「有沒有東西每個 vsync 把主執行緒叫醒」× 這頁每醒一次的固定成本（library 四萬節點 ~2ms、World 三百多個合成層 ~1ms）；CSS 跑馬燈本身在合成器上跑、不算。目前的來源：
- **header 的 Lottie logo**（每個 rAF 改 SVG）：最大宗，`?gpulogo=1` 合成器版待 user 實機確認後才設預設
- **ScrollTrigger 的 `_rafBugFix`**（一啟用就每幀自排空 rAF）：不捲動的頁（`body.overflow-hidden`＝library／atlas／create）在 main-modular.js 放慢成 0.5 秒一次（認 min 版函式名，CDN 換版要重新確認）
- **自己排的 rAF 迴圈**（atlas tickFloat、首頁浮卡…）：新的迴圈別每個 vsync 都排、沒事做就別排
- 兩個一起解掉 library 閒置的主執行緒佔用從 ~23% 掉到 ~3%（Chrome）；只解一個幾乎沒差

## 共用模組（重要！新功能優先沿用）

| 模組 | 用途 |
|---|---|
| `js/config/api.js` | Directus base ＋ `cdnUrl`／`cdnUrls`（檔案→CloudFront URL）、`fetchCmsJson`（含 body 的逾時）、`saveLKG`／`readLKG`（sessionStorage last-known-good） |
| `js/modules/ui/scroll-animate.js` | clip-reveal entrance helpers；四向滑入共用 `REVEAL_DIRS` / `randomRevealDir()` / `revealHidden(dir?)`（±110；每次回新物件——GSAP 會把預設值寫回傳入的物件） |
| `js/modules/ui/escape-html.js` | HTML 字串組裝的跳脫（`& < > " '`，null→''）；各 loader 別再自寫 esc |
| `js/data/country-names.js` `withCountry`／`countrySuffixPair` | 名字後面的（國家）全站唯一表示法（＝World list；user 2026-11-18）：中英都有＝英 ` (TW)`、中 `（台灣）`；只有一種語言（含中文名＝英文名）＝只那一行、國碼中文國名並排 `(TW 台灣)`。awards 主辦／press 媒體／活動講者・單位（手機）／faculty 兼任單位・學歷／DSD 講者／World 都走它，新地方別再自己拼 |
| `SCCDHelpers.shuffle(arr)` | Fisher–Yates 原地洗牌（helpers.js；凍結陣列如 ACCENT_COLORS 先複製） |
| `js/modules/ui/pdf-cover.js` | pdf.js 版本（`PDFJS_VER`）與 `ensurePdfjsLoaded` 唯一來源（library-viewer 共用） |
| `js/modules/ui/page-exit.js` | 註冊頁面退場動畫 |
| `js/modules/ui/page-cleanup.js` | 註冊離頁要解綁的 listener / observer |
| `js/modules/ui/orientation-restore.js` | 手機轉向軟重載保留當前狀態：`keepOnOrientationReload(key, getState)`（重載前存 sessionStorage）＋`takeOrientationRestore(key)`（init 讀回即刪）；見 RWD「跨 gate 轉向」 |
| `js/modules/ui/theme-toggle.js` | mode 切換 + color hue loop + 全域 dispatch `theme:changed` |
| `js/modules/ui/custom-scrollbar.js` | 全站隱藏原生 scrollbar + 自製 fixed thumb div + drag + footer 區換色 |
| `js/modules/ui/marquee-overflow.js` | 文字 overflow → marquee：`applyMarqueeOverflow`（量寬+dual-copy+`--marquee-distance`）；`buildSyncedMarqueeTimeline`（中英同步 GSAP timeline）；`bindMarqueeReturn`（桌面 hover 放開平滑回彈，見下規範） |
| `js/modules/ui/section-switch-helpers.js` | `setActiveNavBtn` + `showPanel` + `bindNavBtnFit` + `bindFrameScrollSplit`（4 個 inner-scroll 頁共用；2026-09-27 起 ≥1200 nav 佔 cols 1-3、內容 col 4-18＝看得見的內容左貼 col-4 左緣、右貼 col-18 右緣（about 同；平板 768-1199 與舊版＝col 4 留白、內容 5-20）；bindNavBtnFit＝nav btn 貼文字寬；bindFrameScrollSplit＝滾輪分區——col 1-3 捲 window 去 footer/hero、col 4 起一律內部捲，box 邊界不外溢靠 lists.css `overscroll-behavior: contain`，短 panel 放行 window）；＋ `bindLandscapeNavGate`（矮橫向 nav chip 過 hero 才現、到 footer 收，4 頁共用）、`getScrollableScrollCol`／`waitForItemRevealed`（activities／admission 共用） |
| `js/modules/lightbox/lightbox-shell.js` | enter/exit + body lock（給 lightbox / slide-in / full-screen overlay 共用）；header mode／menu 鈕一律不收：lightbox／PDF／share／桌面色卡留在原位、壓在 overlay 下（2026-11-16 user「不需要消失」；右下 footer 鈕、mode3 鉛筆同）；**手機 slide-in（傳 `menuBack`）＝mode 鈕、footer 鈕、鉛筆都不進出場、被 panel 蓋過去**（2026-11-19 user「只要被遮蓋即可」），浮在 panel 上的只有返回鍵（menu 鈕）跟 logo——header 整條抬在 panel 上、裡面的 mode 鈕壓不下去 → `coverModeBtn` 把本體藏起、在 header 外放一顆複本壓在 panel 下，收完換回；footer 鈕靠 `html.has-slide-in` 壓 z（footer.css）；`hideLightboxEntrance`／`playLightboxEntrance`＝lightbox 開場順序（overlay 淡入 → 底部 UI 同時 clip-reveal＋chevron 淡入 → 中間 item；圖片 lightbox＋PDF viewer 共用；share 卡同順序＝空白卡先進、落定後卡內 UI＋角上返回鍵同拍 clip-reveal，share-modal.js 自己排）；`wheelZoomFactor`／`bindPinchZoom`＝縮放手勢（2026-11-16）：ctrl+滾輪與觸控板 pinch（Chrome 系送成帶 ctrlKey 的 wheel、Safari 桌面送 gesture*）在 lightbox 任何位置都縮放內容、不讓瀏覽器縮整頁；圖片 lightbox＋PDF viewer 共用。鍵盤左右鍵一律換張／翻頁（放大中也是），上下鍵放大時才平移 |
| `js/modules/ui/list-row-reveal.js` | 清單 rows 進退場引擎（CSS transition 取代 GSAP yPercent，見「效能最佳實踐」；activities/admission 清單用） |
| `js/modules/accordions/list-accordion.js` | list-header → list-content 展開（必須在 `loadListInto` 後 call `initListAccordion`） |
| `js/modules/pages/activities-data-loader.js` `loadListInto` | 通用 list 渲染（activities / admission summer-camp 等） |

## 編碼規範

### HTML
- `lang="zh-Hant"`、語義化標籤、雙語顯示（英 + 中）
- **新頁面 head**：output.css 的 link 後面接 `layout-mode.js`（見「iPad 版型模式」，照既有頁面抄）
- **新頁面必備兩個容器**：
  - `<main id="page-content">` — router 替換目標
  - `<div id="site-footer"></div>` — 即使該頁不顯示 footer 也要加（router 自會處理 display:none，否則 first-load 該頁時 footer 永久消失）

### CSS
- 優先使用 CSS Variables；客製化遵循設計系統
- 改設計系統值同步更新 `variables.css`
- `@import` 順序看 `input.css`（cascade 後者勝）

### JavaScript
- ES6+ 原生 / 模組化
- DOMContentLoaded 才執行 init 邏輯
- 跨 SPA 換頁的 window/document listener 必須註冊 cleanup（用 `page-cleanup` registry）
- 註解寫 **WHY** 不寫 WHAT；只在非顯而易見的時候寫
- 不要過度工程化（user 偏好「3 行類似 code 比 premature abstraction 好」）

## 功能特性

### 導航
- Sticky header + mega menu + 雙語 hover 切換
- 自動高亮當前頁；detail 頁對應到父層（degree-show-detail → degree-show）

### Header logo 動畫（`js/header.js`）
- Lottie SCCD logo，size 隨頁面變（大 / 小 — library/atlas/legal/create 小）；真桌面大小＝`--logo-lg`／`--logo-sm`（variables.css，依視窗高等比：高 960＝180／100、下限 0.6 倍、不放大），nav line／鈕位／中線都從 `--logo-sm` 推。JS 一律讀 `SCCDHelpers.headerGeom().logoLg／logoSm`，勿寫死 180／100
- /create 頁有 typewriter entry + reverse backspace exit
- 退場時根據 logo state（State A/B/C）決定 backspace / skip / fade
- **進站進場（2026-10-26）**：logo＋mode／menu 鈕 clip-reveal 滑入（`prepareHeaderEntrance` header 注入當下預藏、`playHeaderEntrance` 取代原 header opacity 淡入；首頁跟 stage1／intro 同拍、/create 與 reduced-motion 不走、SPA 換頁不重跑）。⚠️ 鈕的 x/y 與 logo 的 yPercent 由 header.js 管：換頁 cleanup 只砍 clipPath、updateNavActive 只砍 width/height，別再全砍
- **切 mode＝新舊 logo 交叉淡入（2026-11-16，user「logo 要真的 fade」；原本是背景淡到一半那格硬切）**：theme-toggle.js `switchHeaderLogo(type, { xfade: true })`＝新 logo 疊在舊的上面用 WAAPI 淡進來、舊的同時淡掉，跟背景同長同曲線（`--dur-base`／ease，起點＝VT ready）。淡變中 filter（mode3 線框翻白）在新舊兩層各自身上、外層清空，`logoXfading` 期間 `applyColorVars` 不寫外層；淡完 filter 還給外層時要先 `transition:none` 落定再開 transition（不然線框先閃成反色）。overlay 開關仍走 `{ fade: true }`（先淡出再淡入 ~0.2s）。**手機 logo（2026-11-19）**：`loadMobileLogo({ xfade: true })`（theme:changed 才傳）＝每份 Lottie 各自一層 `.mlogo-layer`（唯一 anim 名 `header-logo-mobile-anim-N`，`dataset.animName`＝現役），舊層留著、新 JSON 載進新層、載好才新淡進舊淡出（DUR.base）再砸舊的；之前是 destroy＋清空再載＝VT 的新快照裡沒 logo（Lottie 還在載）、整頁淡完才突然出現（user「直接 fade 不見再出現」）。overlay／footer 的 `fade: true` 與硬載照舊先砸舊的
- **合成器版 logo（試用，預設關，2026-11-12）**：網址加 `?gpulogo=1`（同分頁有效、`=0` 關）＝Lottie 畫完第 0 格後依群組拆成幾張 SVG、各自 CSS rotate，Lottie 實例 destroy（lottie-visibility.js `spinOnCompositor`、navigation.css `.logo-spin`）。logo 只是三個群組等速自轉，Lottie 卻每幀在主執行緒改 SVG（小頁閒置也佔主執行緒 12～14%、頁面愈大愈貴）。headless 逐像素比過（靜止相同；轉動中實心版只差邊緣柔化、線框版細線會變淡），iOS 的混色與取樣驗不到 → 實機看過才把預設改成觸控裝置開

### Footer scatter（`js/modules/ui/footer-scatter.js`）
JS random scatter + collision resolution 8 items + 每次 shuffle 即時 generate verified layout + 每 10s shuffle 動畫（hidden 頁自動 pause）。2026-08-10 由 footer-draggable.js 改名（drag 功能早已移除）；舊 commit / memory 提到 footer-draggable 即此檔。
- **桌面 footer＝fixed 覆蓋卡（2026-10-19）＋右下開卡鈕（2026-11-04 取代頁底滾輪推卡）**：不在捲動流裡、沒有 logo 列、不一屏（高＝散佈區 480＋padding）；**點右下 footer 鈕**（`ensureFooterBtn`：footer.js 一拿到 footer 殼就建、不等後台內容，全站只一顆、footer 重建時搬到新殼後面；插在 footer 後面＝footer 藏的頁跟著藏；48 黑方塊＋icon `.icon-footer`＝後台 site_icons key `footer`；固定右下角、z 10002＝全站最高（只低於待機紙 10003）；mode3 鉛筆讓出角落排它左邊 24（`--mcp-right`，router 掛 `body.no-footer` 的頁回角落），capsule 往左長不推它；開著＝active 同 about history 鈕：維持點下去那色、點 active 關＝只變色不轉角；menu 開著／首頁 WATCH 播放層藏。**鈕的進退場（2026-11-16，`syncFooterBtn`）**：進站跟 header mode／menu 鈕同一拍滑入＝看 `html.header-entered`（header.js `playHeaderEntrance` 放鈕那刻掛）；去沒 footer 的頁（library／atlas／create）跟頁面退場同拍滑出、回來滑入＝router `setFooterBtnRouteHidden`；**mode3 鉛筆跟這顆同進同出**（mode-color-panel.js）：進站也等 `html.header-entered`、用 header 鈕的時長曲線（四顆鈕同一拍同速，首頁也是）；有／沒有 footer 鈕的頁互換時鉛筆的位置會跟著 `body.no-footer` 換 → router `holdModeColorPanel` 先把它收起、class 換完才放＝在新位置跟 footer 鈕一起進場（兩顆換頁的收放同 DUR.medium＋EASE.enter；不先收＝footer 鈕一進場就把鉛筆當場往左推）；lightbox／PDF viewer／share／桌面色卡開著**不消失**、z 降到 9998 沉在 overlay 下（跟頁面一起被蓋暗、點了＝關 overlay；關閉時晚 0.3s 升回＝等 overlay 淡完）；手機滿版 slide-in（faculty／curriculum）＝鈕被 panel 蓋過去、開著時開不了 footer，2026-11-19）→ 卡以每次新抽的 ±1–2° 從自己底邊 clip-reveal 升起（`_reveal` proxy：clip 底＋沿卡軸 translate，收到一半再開從原地接；開關同 `CARD_DUR`＋EASE.enter）；再點鈕／點卡外／卡外滾輪／換頁＝沿原路沉回（點卡上空白處不關）。卡跟鈕的 gap＝`--menu-gap`＝桌面 menu 打開時 menu 鈕底到第一個選項（About）頂的距離（鈕底與 nav line 的中點，視窗高 960＝31；variables.css，menu 第一顆的位置與 JS `menuGap()` 同式。user 2026-11-04「用 menu 到 about btn 那個 gap」、2026-11-16 釐清＝menu 的選項，原誤用成 menu 鈕底到 nav line＝兩倍）：卡底＝footer 鈕上方一個 gap（`--footer-card-bottom`＝96＋gap，JS `cardBottom()`）、卡頂＝menu 鈕下方一個 gap（＝menu 第一個選項的頂線），左右 container padding。**傾角（2026-11-16，`applyCardScale`）**：卡繞中心轉，兩端各升降 r；轉完要守三個 gap（卡底↔footer 鈕、卡頂↔menu 鈕、卡頂左角↔logo 底），後兩個取較緊的——右上翹＝整張下移 r → 右側 menu 鈕下方、footer 鈕上方兩個 gap 相等；左上翹（翹向 logo）＝卡高少「logo 底比 menu 鈕底低的量＋2r」再上移 r → logo 底下與 footer 鈕上方兩個 gap 相等，右上的 gap 會比較大（卡頂被 logo 卡住，幾何上補不了）。要少的高＝shell 的 `--card-trim`（`.footer-inner` min-height 吃）；內容撐著縮不了的矮視窗（縮卡中）＝左上翹的角度收小（`maxCwTilt`，補不掉的最多各吃 gap 的 1/3）、右上翹多出來的空間上下平分。卡高會隨角度變 → 散佈一律只排在「最矮的卡」那段高（`layoutSlack`）。開卡中的滾輪一律由 window capture `onCardWheel` 接走（不碰後面內容；卡外滾＝關卡、那一手勢關卡後仍吞到停手 200ms `WHEEL_GESTURE_GAP`）；開卡時 `.footer-backdrop` 墊在卡下，卡外滑鼠操作一律先關卡或擋掉。卡內 padding 20（`--popup-pad`，2026-10-26 起不綁 container padding；faculty／curriculum 色卡共用）、最小高＝散佈 480；矮螢幕不設上限、整張等比縮（`applyCardScale`：放不進「logo 底＋gap → 卡底」那個框才縮、下限 0.75，散佈量測時 `unrotated` 連 scale 一起暫時還原）。header（logo／mode／menu）不收；z＝footer 全站最高、只低於 logo（footer 9998 < header 9999；mode／menu 鈕同在 header 內壓不下去 → 開卡 `body.footer-card-open` 把兩鈕 pointer-events:none 放行給 backdrop＝無 hover、點了只關卡；mode3 鉛筆降到 9996 沉 backdrop 下、真桌面不再因開卡藏起）；`footer:open`（開卡）→ header.js 關桌面 menu；`footer:progress`（開／關同拍）→ logo 往小 logo 縮、關卡放大回去；點 logo＝router 換頁與 `playFooterExit` 收卡並行。shuffle 只在卡開著時跑。⚠️ footer HTML 不能帶 `.relative` utility；fixed shell 的 offsetParent 恆 null（判顯隱用 getClientRects）。
- **手機／iPad／矮橫向 footer＝整屏 slide-in（2026-11-04，user「100vh、可以想像是一個 slide in」、footer 鈕全站統一）**：同一套 `openFooter`／`closeFooter`（不轉角、不縮卡、打開捲回頂）；footer.css 非桌面段 `.footer-shell` fixed `top:0`／`100lvh`、停放 `translateY(100%)`、**z 9998 在 header 下（同桌面）＝footer 沒有自己的 logo，頂端浮的是 header logo**（同 slide-in，user 2026-11-04）：mode／menu 鈕**自己不做退場、被升上來的 footer 蓋過去**（2026-11-19 user「打開的時候 menu 跟 mode btn 不需要退場」＋同日「不會退場是沒錯，但 footer 的 z index 會比它們還高，遮蓋」；11-04～11-18 曾同 slide-in 收起）：鈕跟 logo 同在 header 的 stacking context、footer 又要留在 logo 下＝z 排不出來 → footer-scatter.js `coverHeaderBtns` 在開關補間的每一幀照 footer 頂把兩顆鈕的外層欄從底往上裁（蓋住的地方點不到、蓋滿掛 inert）、`loadMobileLogo` 換 footer 對比色（mode1 白實心／mode2 黑實心／mode3 線框＋`--footer-invert-filter`）；內容從 logo 底下 md 開始（`--mobile-bottom-anchor − 6 + 56 + md`）。**卡本身不捲**（內容不從 logo 底下穿過）：三種版型都只有各分頁的 item 捲＝資訊區裡的 `.footer-scroll`（footer-scatter.js `wrapMobileScroll` 把 item 包進去、重建成桌面散佈時 `unwrapFooterAnim` 拆掉），tab 列在上、Office Hours（footer_tabs.note）在下、legal＋copyright 再下，**都在捲動框外不動**（2026-11-16 user「Office Hours 跟 legal 一樣、可以捲的框不包含它」；原本整個資訊區捲、tab／note 靠 sticky 釘）；直向／iPad 直拿＝單欄、橫向手機＝兩欄（legal 在右欄），頂距下在 shell（landscape.css 7／7b／7c）。點 tab＝那顆捲到列中間（同 activities／about nav btn）。**footer 直接蓋在別的東西上（2026-11-16）**：① 首頁點開的 news 不收（index-marquee.js 點外面收合排除 footer 鈕／footer）——`body.footer-covering`（開卡起、收完才摘；`footer-card-open` 是收卡當下就摘）期間開著那則從 10000 降到 9997（lists.css）；② 手機滿版 slide-in 開著時 footer 鈕被 panel 蓋住（2026-11-19 user「footer 也在 slide in 之下」，翻掉 11-16「鈕留在 panel 上、footer 疊在 slide-in 上」；footer.css `html.has-slide-in` 把鈕壓到 9998、收完才升回）＝footer 不會疊在 slide-in 上；Esc＝先關 footer 的 window capture keydown（footer-scatter.js）照留。鈕 44／icon 28、底＝貼底界線，開著＝白底（`--footer-fg` 底 `--footer-bg` icon；mode3 icon 走 `--theme-fg-inverse-contrast` 黑白）；開著時 mode3 鉛筆藏（mode-color-panel.js 看 `body.footer-card-open`）。**footer 從此不在任何版型的捲動流裡**：舊的頁尾線性段（`syncFooterHide` 捲到 footer 收 header、router `fromFooter` 釘 footer 換頁、頁尾退場／復位、直向頁尾磁吸）已全數刪除——SPA 頁的 `#site-footer` 容器只剩頁尾 0 高的錨點

### 主要互動頁
- **/create**：inline p5 generator（拆 iframe 後），三 mode（Standard / Inverse / Wireframe）對應 site mode（standard / inverse / color），rotation slider + color picker + save PNG + 彩蛋
- **/atlas**：SCCD-centered living textile，4 類 chip (A 老師＝只有離職教師，在職不進 World，user 2026-11-19 / B 系友企業 / C 合作 / D 城市) + 軌道環 + 動態連線 + scale 0.78 永久 + 1.0~1.8 zoom。**桌面國家的說明卡分兩段：hover＝國家小卡、點了才長成整張並釘住（2026-11-19，同日五輪定案；第四輪的「hover 就出整張並留著」撤了）**：hover 國家方塊＝游標 pointer、方塊只轉正不長成國名 chip（點了也一樣；橫向手機 tap 國家同樣只轉正。`squareShowsName`＝只剩 iPad 直拿 tap 才展開國名；直向手機的星雲是轉向提示、沒有國家可點。方塊轉正後四個角會落空 → 桌面感應區是外接圓 `::before`，別拿掉）、底下的 item＋連線照出，右下出**國家小卡**（`fillDetailContent` 的 `'title'`）＝國名＋一行提示「(Click to view 點一下瀏覽)」（`.atlas-detail-hint`；字走後台 ui_labels `atlas.detail.hint`，英中各一欄、前台組成一行加半形括號）：卡寬固定＝提示那一行的字寬（提示放進來再 `snugDetailWidth`；每個國家的小卡一樣寬），提示一直跑馬燈（字放得下也跑＝`applyMarqueeOverflow` 給 `tolerance: -Infinity`）、裁在卡的左右內距以內（不跑到卡緣）；每次出現的第一趟從這一行的右緣外跑進來（atlas.css `atlas-marquee-lead`，起點與時長 `--marquee-from`／`--marquee-lead` 由 JS 算成跟循環同速），之後才接無限循環。點它＝同一張卡（底色、角度不重抽）長成完整的卡並釘住（`morphCountryCard`：內容先換好量終點、盒子寬高一起補間 DUR.medium，列先藏著、盒子到位才滑進來；`pinnedCountry`／`onDocClick`：釘著時 hover 進出一律不理、軌道維持停著），點畫面任何地方收（capture 掛 document＝header／篩選鈕也算；點別的國家＝換成那顆的整張、點釘著的那顆自己＝縮回小卡；拖曳平移 >4px 不算點）；`clearDetail` 會順手放掉釘選。其他節點（老師／主持／單位）照舊 hover 出整張，手機照舊 tap 出整張。mode3 桌面說明卡↔鉛筆的距離＝header mode 鈕↔menu 鈕（`--spacing-md`）。**國家底下的 item（C：就職／合作單位）預設不在星雲上**（2026-11-16）：hover（桌面）／點（手機）它的國家才出現、離開就收；藏＝anchor `.atlas-filtered-out`，判斷集中在 atlas.js `gateHidden`、顯隱入口 `setRevealedCountry`（進退場拆成 `gateShow`／`gateHide`）。**例外（2026-11-18）：桌面 filter 只剩就職／合作單位開著（老師關、主持關、至少一類開）＝不用點國家、全部放出來，開回老師或主持就收回**＝`gateByFilter`／`syncGateByFilter`（apply() 開頭、subchip 切換、回星雲落定後呼叫），進退場同點國家的 clip-reveal、只是不等線（`--gate-lead` 0）；放行中切 list＝已在畫面上的那批不收、篩選還原那拍只把其餘的補 clip-reveal 出來再轉場（user 11-18「不需要再讓它們隱藏又出現」）；篩選鈕關掉／開回這兩類也走 gateShow／gateHide（原本是淡）。出現的順序＝連線先從國家 chip 長出去、**線到了**名字才在自己的盒內四向隨機滑出來（clip-reveal；手機圓點＝淡入）——動畫全在 CSS（atlas.css `.atlas-gate-out`＝藏好的那一態，等線的時間 `--gate-lead`），JS 只掛／摘 class（display:none → 顯示要先強制算一次樣式再摘，不然不起 transition）；離開＝線沿原路縮回國家、名字同時滑出（線的不透明度等縮完才切，別改回淡出）。同一家同時是就職＋合作單位（同國同英文名，`_twin`）＝星雲只出一顆、國家卡那列標兩個分類（`detailCats`），list 兩欄照列；**就職那顆在星雲上任何狀態都不出**（含切 list 全放那拍，user 11-18「只需要渲染一個」）＝`openGateForMorph` 留藏並標 `_twinHidden`，它的 list 列去程不飛、起飛那拍進槽、跟副標同刻原地滑入，回程原地滑出不飛回（morphToList `twinRows`／switchToMap flyItems）。節點照建（list view 是同一顆、照常全列）。**桌面切 list（user 2026-11-16～18 三輪定案）＝這批先全部在星雲上 clip-reveal 出現（11-18「做 clip reveal 好了、方向四周隨機」，取代 11-17 的線性淡入；＝hover 國家那套 `.atlas-gate-out`、`--gate-lead` 歸零不等線、**整批同起同落**不 stagger；算進轉場的前置窗）才跟大家一起跑轉場（這頁的飛、其餘往所屬欄靠攏）；回星雲＝這頁的那幾顆邊飛回邊淡出、落地就藏回去，其餘不出來（「回來的過程中淡出，不用定位之後再淡出」）**——去程 `openGateForMorph`（`gateOpenAll` 開著的期間 `gateHidden` 放行＝去程轉場不用分這批）、回程在 `switchToMap` 開頭收掉放行、只把這頁的 anchor 放出來當落點；原本「不飛、跟副標同批進出」已撤。**去程的順序（`switchToList`，11-17 四輪定案）＝重活先做完、等畫面跟上才開始動**：（有篩選／zoom 先還原完）→ `renderList` 預渲染＋`openGateForMorph` 把這批以藏好那一態（`.atlas-gate-out`）顯示出來、名行先 `will-change` 提層 → 幀間隔回穩 → **這批先 clip-reveal 出來（摘 class、CSS transition `--dur-slow`；出完）→ 線・城市方塊・host 色塊（＋全體變黑）同一刻一起跑**（`buildMapPreExitTl`；user「item 先出現，綫段、城市還有 chip 的底色一起 run 動畫」＝取代 10-01「先線後點」，別再把線排在前面）→ 這一拍跑完才 `morphToList` 配對起飛（它的時間軸只剩位移這拍，`M_ITEM_START`／`M_NAV_START`／`M_FADE_START`＝0）。⚠️ 為什麼這樣排（11-17「少了 fade」「是 instant 的出現」）：renderList 的預量是一個 0.2～0.5s 的長幀；這批每顆是一個合成層、第一次出現要先 raster，那 0.1～0.25s 畫面出不來、補間卻照走——補間排在這些上面＝第一格已經六～九成、看起來直接出現。所以先用藏好的那一態顯示（anchor 層先畫好）、名行先提層（transition 不用再為第一格 raster），等幀回穩才摘 class；別一顯示就起跑。⚠️ 這類問題主執行緒讀到的 opacity 是連續的、headless 也看不出來，要用有視窗的 Chrome＋tracing 逐幀截圖（合成器端）量「實際畫出來的」。手機 list 切換不走這條。星雲平常狀態下，新增對「星雲上全部 item」動手的程式仍要跳過 `item._gated`。桌面教師以外的左右範圍：國家方塊＋主持環的邊界＝logo 右緣＋32（11-16 定案時＝library 灰卡左緣；11-18 起 library 灰卡左緣改成跟右邊同距 `deskLeft()＝deskRight()`、World 這條線沒跟）、右邊對稱＝本頁 list 框同一條線（atlas.js `SIDE_REACH`；國家軌道寬吃它、高照舊吃 H 上限，兩個各算各的）；國家底下的 item（C）另用 `SIDE_SHRINK` 一個係數往中間收。**手機 list＝往下捲（2026-11-17，取代分頁＋翻頁鈕；桌面照舊分頁＝每欄左右兩顆箭頭並排、第一頁左鈕 disable、最後一頁右鈕 disable，user 2026-11-18；09-01～11-17 是單顆右箭頭循環）**：atlas.js `listScrolls`＝`#atlas-list-view.atlas-list-scroll` 自己是捲動框（本頁 body 鎖捲動），顯示中的分類一次建 `LIST_BATCH` 30 筆、快捲到才續建（欄底哨兵＋IntersectionObserver；整份 258 筆一次建＝每排版一趟就卡）；進退場只播畫面內的列（`linesInView`）。直向手機＝框蓋滿畫面、清單從 header／分類 tab／切換鈕底下捲過、捲到底最後一列停在 tab 上方（`--list-end`，下在欄的 padding-bottom）、主持／就職欄標 sticky 在內容頂；橫向手機＝一列兩筆（`--list-cols`，iPad 直拿三筆）、列距 sm；框也從畫面頂開始、清單從 tab 列後面經過（user 同日「tab 這邊不需要遮擋」），第一列＝tab 底＋sm（`--atlas-list-top`，不吃全站 108）。職業 chip（手機）掛在 `#atlas-main`、`position: fixed`：直向在 tab 上方靠左、橫向／iPad 在 tab 下方（Alumni tab 旁邊那顆不顯示），清單從它底下捲過。⚠️ 頂距別下在捲動框的 padding（sticky 的 top 會從 padding 內緣起算）、chip 別放進捲動框（iOS 會把框裡的 fixed 子元素一起裁）。**手機星雲 ↔ list 的進出場（2026-11-17 user「跟 pc 的一樣」）**＝桌面切 list 前那拍（`buildMapPreExitTl`）同一套語彙：國家方塊／主持色塊四向 clip-reveal、其餘 item（圓點／名字）淡出淡入、城市線點到點收放（回來＝先點後線）；`switchToMobileList`／`switchToMobileMap`，別改回每顆 clip-path 擦除。圓點星雲的 chip 自己掛個別屬性 `scale` → clip-reveal 的位移要乘它（`bChipHidden`）
- **/library**：4 panel (Awards / Press / Files / Album)，year picker + cat filter + marquee overflow + viewer modal。**篩選／sort／搜尋＝畫面內的列先退場、退完才換內容再進場**（2026-11-16，四個分頁共用 library-panels.js `filterWithExit`）：按鈕狀態按下當下就變；清單先「試套」一次再同拍還原（`snapFilterState`）＝知道哪些列會消失／換位置，年份篩選只退那些（位置沒動的不動）。新增篩選入口照這個包，別直接 `applyFilters()`＋重播。**Awards 國家篩選**（2026-11-19，做法同 album 分類：桌面在年份欄頂、直向在年份列下、橫向手機在浮層左欄）：鈕依資料建（`#library-awards-cat-filter`；台灣第一、其餘照 ISO 國碼字母序；第一行國碼、第二行中文國名），一筆多國＝任一國選到就算（列上 `data-countries`），跟年份雙向連動——清單是 lazy 建的＝可點範圍從資料算（`availYears`／`availCountries`）、套到鈕上走 `styleCatBtns`（`syncCatBtns` 的後半）；awards 年份欄同日改用共用的 `createYearPicker`。⚠️ award 列的 marquee 量測＝列級「量過」記號（`mqDone`）＋兩個補量來源：列進渲染範圍的 c-v 事件、列的進場播完（`playAwardItem` → `_awardsRowRevealed`）；只靠事件不夠——重播進場把列暫設 `content-visibility: visible`，還原 auto 時已在畫面上、瀏覽器不發事件＝篩選推上來的列永遠沒量、hover 不捲。Press 媒體名只有一種語言＝在兩行副標高度內垂直置中（library.css `.press-item-subtitle:only-child`）。Documents 卡第一次進場（進分頁那批＋往下捲進來的）走 faculty 那套逐卡（節拍＝scroll-animate.js `CARD_SEQ`，兩頁共用）；這頁做過分類／年份／搜尋／sort（清單 `data-lib-touched`）之後一律原本的整批，篩選重播本來就整批
- **/alumni**：sponsor cards (random rotate + hover accent) + city tabs + members 用 .faculty-card + organization renderer

## 工作流程

### 開發
1. 改設計系統變數 → 同步 `variables.css`
2. **改任何被 input.css @import 的 CSS（含 landscape.css / components）→ 立即 `npm run build:css`**（output.css 才是頁面實際載的）
3. 跨頁一致性檢查；TS 檢查 `npm run check:ts`（現有錯誤是歷史遺留，只看新增）
4. 加 page-level listener 時用 `registerPageCleanup`，加 page exit 動畫用 `registerPageExit`
5. **自驗**：repo 有 playwright + 系統 Chrome 可 headless e2e（`channel:'chrome'` 免下載；先起 `npx http-server`）——RWD/互動改動先 headless 量測+截圖再交付；但 logo invert 等視覺細節 headless 不準、要實機確認
6. **推版前掃視口**：`npm run sweep`（scripts/viewport-sweep.cjs，自帶 static server）＝18 個裝置尺寸 × 全部頁面（library 四個分頁各一列、alumni 不掃）逐屏截圖＋自動檢查（JS／console 錯誤、頁面可橫向捲、header・footer 鈕跑出畫面），總表輸出到 repo 外 `../SCCD-視口總表/index.html`（完整一輪約 13 分鐘、~1000 張）。只改某頁＝`npm run sweep -- --pages about --sizes ipad`：總表是累積的、只蓋掉重跑的那幾列（rows.json），**別改回整個資料夾清掉**（user 會開著總表逐頁看）；`--mode inverse|color`、`--browser webkit` 各自一個資料夾。新增要顧的裝置尺寸＝加進腳本的 `SIZES`。抓不到的：互動後的狀態（開清單、切 tab）、Safari 實機渲染

### 部署
- **開發預覽**＝GitHub Pages：push main 自動上線（bernard-02.github.io/SCCD-Website）。⚠️「線上是舊版」通常＝改動沒 commit；CSS 改了要先 `npm run build:css` 再 commit
- **正式前台**＝S3 + CloudFront（sccd.usc.edu.tw，尚未切換，流程見《docs/前台上線流程-S3-CloudFront.md》）；**後台** Directus 在 Lightsail `/cms`（reverse proxy → Node :8055）
- **上傳包**＝`scripts/make-upload-package.ps1`：build:css → 鏡像前台檔（排除本機 mp4）→ `minify-package.cjs` 壓縮包內 JS/CSS/JSON（esbuild 逐檔 transform、不 bundle、不改頂層名稱；只動上傳包拷貝，repo 原始碼與 GitHub Pages 預覽保持未壓縮）。壓縮後約 4.0MB → 1.5MB
- **S3 coming soon 版（ver1）**＝所有修正與 layout 同 main、只有內容隱藏（activities／admission 內容區、library Album、首頁三類浮卡、網站地圖條目）：在臨時 worktree `git revert --no-commit a8c11f9 056b280` 後再出包（衝突解法見 memory）。⚠️ `floating-items.js` 的 `SHOW_ACT_CAMP_ALBUM` 是它的開關、不是死碼
- user 不熟 devops，部署話題先建心智模型再給步驟

### Git
- 繁體中文 commit message
- WIP rollup commits 用「工作樹 WIP 整理：[主題]」格式
- 不要自動 commit，等明確指示

### 測試 checklist
- **桌面**：所有頁樣式一致 / nav 高亮 / mega menu / hover / GSAP 動畫流暢 / 資源載入
- **手機**：響應式（375/414/768）/ 無 hover 殘留 / 觸控流暢 / 漢堡選單 / 字體 ≥14px / 點擊區 ≥44×44
- **footer 鈕（非桌面）**：右下 44 鈕開整屏 footer、logo 跟 header logo 重疊、開著白底、鉛筆藏、再點／換頁收、後面頁面捲動位置不變；有底 bar 的頁 bar 右緣讓出鈕位
- **iPhone Duo**（WebKit 官方 Safari viewport：外螢幕 382×580／橫 594×368、內螢幕直 669×867／橫 951×585）：內螢幕橫拿走橫向手機版、直拿走直向手機版（grid 依寬自動增欄）
- **矮橫向**（844×390、667×375）：nav／tab 進 header 帶（hero 上藏）、內容左右排 / hero 隨機版不被切 / 不吃桌面 md: 樣式 / 轉向 reload 自癒；**iPad**（768×1024）：nav／tab 底 bar（chip 底 24、tab 列可見距 16）；**iPad 橫向**（1180×820／1366×1024，觸控；見「iPad 版型模式」）：library／atlas＝橫向手機版（library 左下工具鈕、atlas 圓點星雲、手機 header）、/create＝可以用（手機 header＋桌面式內容）；**其餘頁＝桌面排版＋觸控退路**（桌面 header／footer 卡、首頁 news 點擊版）；從其餘頁點進三頁或點回來＝整頁載入、版型跟著換，三頁之間與其餘頁之間仍是 SPA；轉直＝iPad 直拿版。桌面排版＋觸控退路（混合裝置同）：hover 才捲的 marquee 自動捲、library award 走 chevron 收合列（library-panels.js portraitDetail＝isMobileLayout()‖isCoarsePointer()，CSS 手機段 award 區塊 media 含 touch-desktop）；atlas 的 Safari 補丁只在 (pointer: coarse)（PC 優先、勿動 .atlas-list-col-items 的 overflow）
- **RWD 互不影響**：手機改不影響桌面 / 媒體查詢正確包裹 / JS 條件式執行（gate 判準跟 CSS 同式）
- **SPA 換頁**：footer 顯隱正確 / body overflow 復原 / listener 不累積（DevTools Memory 看 listener count）
- **資料層**：Directus 斷線時降級正常（A 類走 sessionStorage LKG／其餘＝空清單、不報錯不卡頁）/ 後台改內容前台硬重整生效
- **上傳包**：改了 JS 結構後用 minify-package.cjs 對一份暫存拷貝跑一次 headless（各頁零錯誤＋SPA 換頁）再交付

## 偏好設定
- 繁體中文溝通
- 簡潔說明 + 具體 file:line refs
- 簡潔可讀 > 完美抽象
- 只改必要部分，遵循現有風格
- 優先編輯既有檔案而非創建新檔案

## 重要提醒
- **原生 JS，無框架**
- **新頁面 body 必須含 `<main id="page-content">` 和 `<div id="site-footer"></div>`**
- 設計系統改一處同步全站
- 共用元件（header / footer）兩份 HTML 改一份必同步另一份
- 雙語內容兩語同步維護
- 跨 SPA listener 一律走 `registerPageCleanup`
- **手機版修改不能影響桌面版**（desktop-first，手機用 media query 覆蓋）

## auto-memory
本 repo 配有完整的 auto-memory 系統（`~/.claude/projects/.../memory/`），存了 150+ feedback / project / user / reference entries，包含許多「看似 bug 但其實是刻意 workaround」的歷史脈絡。改 code 前若覺得某段奇怪，先翻 memory 看有沒有相關紀錄，避免回退已修過的問題。CLAUDE.md 不重複 memory 已有的內容。

## 未做的優化清單（Future Optimization Backlog）

歷次 audit 找出但**這次沒做**的工作；按「之後如果要碰相關區塊順手做」的視角列。每項標 ROI / 工程量 / 觸發時機。已做的不在這裡列。

### A. 等下次碰到相關區塊順手做（低風險）

| 項目 | 工程量 | 觸發時機 |
|---|---|---|
| `hero-animation.js randomizeHeroLayout` → 用 `awaitLayoutReady` | 小 | 動到 hero animation 時 |
| `error-404.js randomizeAllPlacements` → 用 `awaitLayoutReady` | 小 | 動到 404 頁時 |
| 清單縮圖產「小尺寸版本」（每日 webp Action 順便產 ~480px 寬變體，前台縮圖吃它）：strip 縮圖都是 1600×1200 原圖（中位 74KB、最大 ~430KB）只顯示 ~160×120；抽樣縮到 2× 顯示寬重壓 -82% | 中（轉檔腳本＋S3 key 規則＋前台組網址＋fallback） | user 決定做時 |
| 首頁 floating-items 改 `fields=` 只抓 poster/id（現抓整包活動 ~1MB；代價＝不再與 activities 頁共用記憶體快取） | 小 | user 2026-10-04：先不做 |
| atlas.css 同時編進 output.css 又被 router 動態載一份 raw：移除 PAGE_CSS 那份可省 atlas 頁 ~5KB gz，但 raw 那份目前在 cascade 贏了 color/inverse/landscape 的同特異度規則，拿掉要 3 mode＋矮橫向視覺回歸 | 小（驗證成本為主） | 動 atlas 樣式時 |
| `inverse.css` / `color.css` 同 selector 規則合併（用 `body:is(.mode-inverse, .mode-color)` + `var(--theme-fg)`）| 中（需 audit 每對語義 + 視覺回歸） | 動該頁 theme 規則時順手 |
| `themes/inverse.css` 內 `/* 不再 / 不再列入 */` 等 dead 註解殘留清理 | 極小 | 動到該檔時 |
| library 切分頁「色塊放大落定」那一刻的長任務（4× 降速 1～1.5s）：新分頁內容連做兩輪樣式重算（先整頁 ~1300 個元素、藏列後再 ~900 個，每個 ~0.1ms）。要再省＝把藏列的寫入排到第一次讀尺寸之前，或查是哪條 sibling／nth-child 規則讓改一列連帶重算整排 | 中（切換時序是多輪定案的，動了要逐分頁看） | iPad 仍嫌切分頁頓時 |

### B. 結構性對齊（需 HTML/CSS 一起改）

| 項目 | 工程量 | 為何延後 |
|---|---|---|
| **設計定案後 CSS 收斂**（user 2026-11-05「最後再做一次收斂、以後好維護」）：① `variables.css` 第 271 行起約 750 行是頁面規則（about／DSD 手機版、class 輪播），搬回各元件檔、variables 只留 token；② about 直向一屏預算的魔術數字（落點 92／90、division tab 105、playlist 75、resources 430／505）散在 variables／scroll-snap／accordion／lists，改 token 或集中一處；③ 同一屬性跨檔各寫一份（例：resources 卡高曾 variables＋accordion 各一份、variables 那份一直沒生效）；④ 「某一類裝置專用的固定值」改成跟尺寸走的公式（clamp／auto-fill／比例；user 2026-11-11 問「有沒有一勞永逸」）＝新尺寸不用再逐台修：例 landscape.css 檔尾 iPad about 段（Works 縮圖 64、說明卡 36rem、Resources 圖高）、橫向手機預算值（圖高 120、照片 30~50vw）。平時發現新的散落就補進這列 | 大（搬檔會改 cascade 順序＝逐頁三 viewport 視覺回歸） | 設計還在改，現在收斂會一直被翻；版面定案後一次做 |
| **alumni city tabs → `setActiveNavBtn`** | 中 | 需 HTML 加 `.anchor-nav-inner` wrapper + 改 CSS active style scope；user 已說想對齊 courses program switch |
| **components 從 Tailwind hardcoded class (`border-black`/`bg-white`) → var-based custom class** | 大 | 真正能砍 themes/inverse.css + color.css 大部分重複的根本作法；但要全 codebase 改 HTML，建議一頁一頁來 |
### C. 中等嚴重度殘留 bug（發生機率低，遇到 user 回報再修）

| 項目 | 位置 | 影響 |
|---|---|---|
| `library-viewer.js` PDF listeners 無 remove | js/modules/pages/library-viewer.js | modal 是單例 guard，目前不重綁不出問題；極端情境若 modal 被某 race 重建會疊 listener |
| `library-panels.js` 7 個 `window._xxxMarqueeInit` 等全域函式只在本檔用、離頁不刪（持有舊閉包） | js/modules/pages/library-panels.js | 改 module 層 hooks 物件即可；目前無症狀 |
| `library-panels.js` Press/Files/Album 內 helper listener cleanup | js/modules/pages/library-panels.js | 跨 SPA accumulate 可能；需 audit 每個 binding helper |

### D. TIER 3 大架構（明確不做，列出做為設計決策記錄）

- ❌ **section-switch 3 個 caller 抽 helper**：admission/activities/courses 各有 quirks（lazy load / sub-filter / 頭部動畫 / BFA-MDES toggle），抽出 helper hook 後複雜度跟原本 3 份差不多，違反「不過度工程化」
- ❌ **`renderCard()` 通用 card builder**：5 種 card 結構差異 > 共用因子（faculty / library / courses-grid / alumni-sponsor / activities list-item），各面板各自建卡、不抽共用 builder
- ❌ **Web Components / Custom Elements**：原生 JS SPA 是技術選擇，不引入新範式

### E. Component-first 長期方向（user 目標，分階段累積）

1. **Utility helpers**（已大半完成）— scroll-animate / lightbox-shell / page-cleanup / awaitLayoutReady / marquee-overflow / section-switch-helpers / theme-toggle / custom-scrollbar
2. **Render templates**（進行中）— `loadListInto` 是 canonical list template（card 目前各面板自建、無共用 builder）。下一階段可考慮抽：
   - 統一 ref/attachment block builder（目前 list-ref-btn HTML 散在多處）
   - 統一 gallery + lightbox bind helpers（loadListInto 內部已有，可獨立 export 給非 list 場景）
3. **Self-contained widgets**（不做）— 需 Web Components 或框架支援，跟現有 vanilla JS SPA 衝突
