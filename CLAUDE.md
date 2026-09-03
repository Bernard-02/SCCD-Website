# SCCD 網站專案指南

## 專案概述
實踐大學媒體傳達設計系（SCCD - Shih Chien University Communications Design）官方網站。原生 JS SPA，無框架；內容走 **Directus headless CMS**（前台只吃 JSON，渲染與動畫全在 SPA）。

## 技術棧
- **前端**：原生 HTML/CSS/JavaScript（ES6 modules）
- **後台 CMS**：Directus（headless，REST API；WP/CMB2 路線 2026-06 已退場）
- **架構**：自製 SPA router（`js/router.js`）+ 模組化頁面初始化
- **CSS 工具**：Tailwind CSS（`css/output.css` 為編譯產物）
- **設計系統**：CSS Variables（`css/variables.css`）
- **動畫**：GSAP 3.14（含 ScrollTrigger / Draggable / InertiaPlugin）
- **p5.js**：/create 頁的 generator app inline 跑 p5 instance（已從 iframe 拆除）
- **Lottie**：header / footer logo 動畫
- **字體**：Inter (EN) + Noto Sans TC (ZH)
- **圖示**：Font Awesome 6.5.1

## 專案結構

```
├── index.html                  # 首頁（含 #site-footer-static 靜態 footer + intro overlay）
├── pages/                      # 所有內頁（SPA router 把 <main> 內容 swap 進來）
│   ├── about / faculty / courses / works / activities / admission / awards
│   ├── degree-show / degree-show-detail
│   ├── alumni / library / atlas / create
│   ├── support / privacy-policy / accessibility / 404
│   ├── header.html             # async fetch 載入到 #site-header
│   └── footer.html             # async fetch 載入到 #site-footer（SPA 容器）
├── css/
│   ├── variables.css           # 設計系統變數（顏色 / 字型 / 間距 / breakpoints）
│   ├── input.css               # Tailwind 入口 + @import 串接 base/layout/components/themes
│   ├── output.css              # build 產物
│   ├── base/                   # typography / scrollbar
│   ├── layout/                 # grid / footer
│   ├── components/             # navigation / buttons / cards / accordion / hero /
│   │                             lists / atlas / alumni / courses / create / library /
│   │                             intro-animation
│   └── themes/                 # color (mode-color) / inverse (mode-inverse)
├── js/
│   ├── main-modular.js         # DOMContentLoaded 入口、initPageModules dispatch、cleanupPageModules
│   ├── router.js               # SPA router（fetch + innerHTML swap + nav state）
│   ├── header.js / footer.js   # 全域 header/footer 初始化（DOMContentLoaded 跑一次）
│   └── modules/
│       ├── pages/              # 各頁專屬模組（create-app / atlas / alumni / library-* / 等）
│       │   └── about/          # about 頁拆分（resources-cycling / brand-trail / timeline / ...）
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
├── data/                       # 本地 JSON（Directus 掛掉時的 fallback 快照 + 少數尚未上 CMS 的資料）
├── scripts/                    # 內容批量匯入管線（generate-*-sheet → parse-* → import-*.cjs 進 Directus）
├── images/  assets/            # 圖片與其他資源
├── js/config/api.js            # Directus API base 唯一注入點（CMS_API_BASE / CMS_ASSETS_BASE）
├── docs/                       # 深度參考文件（CLAUDE.md 只當索引、細節看這裡）
│   ├── SPA-接-Directus-Headless-最佳實踐.md   # 後台架構權威文件（⚠️前台部署部分過時，以「前台上線流程」為準）
│   ├── 前台上線流程-S3-CloudFront.md          # 前台正式上線（S3+CloudFront）權威文件
│   ├── activities-優化四輪.md ＋ 優化五輪.md   # 大清單效能優化的完整診斷與方案（見「效能最佳實踐」）
│   ├── 橫向手機版最佳實踐.md    # 矮橫向 RWD 的原理與業界慣例
│   └── 動畫盤點表.md ＋ 無障礙稽核與改進清單.md
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
   - `initPageModules(page, searchParams)` 跑頁面專屬 init
   - `setTimeout scrollToTop` + `ScrollTrigger.refresh` 收尾

### 路由表特殊規則
- `pushState` 用「真實檔案路徑」（`/pages/X.html`）而非乾淨 URL — dev server 無 SPA fallback，refresh 才不會 404
- `/create` URL 對應到 `route.page === 'generate'`（歷史殘留，邏輯名稱與 URL 不同）
- 404 fallback：找不到 route → 載入 `/pages/404.html`

### `cleanupPageModules`（`main-modular.js`）
順序敏感，做這些事：
1. **`runPageCleanups()`**：drain `page-cleanup` registry（各模組註冊的 window/document listener、observer、interval）
2. body / html overflow reset + slide-in/lightbox class 清除
3. `resetLightboxMode()` openCount 歸零
4. `cleanupCreateApp()`（p5 instance + 全 listener + special-easter-egg DOM）
5. `cleanupAtlas()` / `cleanup404()`
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
`cleanupPageModules` 開頭 `runPageCleanups()` 統一 drain。已用模組：activities-search / anchor-nav / activities-data-loader / index-yt-card。

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
- **主機**：學校 IT 提供的 Lightsail（Bitnami）**只跑後台** Directus（Apache reverse proxy `/cms/*` → Node :8055 ＋ MySQL——實測是 MySQL 非 PostgreSQL）。前台靜態檔**不在** Lightsail：開發預覽＝GitHub Pages（bernard-02.github.io/SCCD-Website，push main 自動上線）；正式網域 sccd.usc.edu.tw＝S3 + CloudFront（現仍為舊 WP 站，SPA 首次上線流程見《docs/前台上線流程-S3-CloudFront.md》）
- **API base**：`js/config/api.js` 是唯一注入點——`CMS_API_BASE = https://sccdtest.usc.edu.tw/items`、`CMS_ASSETS_BASE = .../assets`、`CMS_CDN_BASE = https://d2df28pyzslt2v.cloudfront.net/Directus`。⚠️ 網域帶 test，正式上線換子網域只改這一檔
- **檔案交付分流**（2026-08-31 起）：圖片＋PDF 走 `CMS_CDN_BASE`（CloudFront 直吃 S3，用即時 `filename_disk` 組 key、不寫死副檔名——離線 webp 轉檔自動跟上；繞過弱機 `/assets` S3 逾時掉圖問題）；`/assets` 只剩下載附件（要漂亮檔名）；影片＝HLS CloudFront 網址直貼
- **鐵則**：SPA 100% 保留（Directus 只給 JSON）；schema 在後台 GUI 建（不寫 code）；Public role 必須開 Read（沒開 = 前台 fetch 全 401）；collection 名 = endpoint 名

### 前端資料載入 pattern（`*-source.js` / `*-data-loader.js`）
兩套失敗策略，新 collection 優先用 A：
- **A. Directus-only + last-known-good**（activities 全系列 / summer-camp / degree-show，2026-09 起）：本地假資料 fallback 全退場；失敗（逾時 abort / 5xx / **200 但空也要 throw**）→ 讀 sessionStorage 上次成功真資料 → 都沒有才顯示錯誤態。快取進頁不清＋背景 revalidate（latest-wins），後台編輯「硬重整即生效」不變。範本：`activities-source.js`
- **B. fallback JSON**（faculty / library / footer / ui-labels 等舊 collection）：失敗 → 讀本地 `/data/*.json` 快照，CMS 掛掉照常渲染；大改後台內容時同步更新快照
共通：
1. fetch Directus（`?limit=-1&sort=sort`，排序吃後台 sort 欄、前台不重排；例外＝activities 同年內強制月/日新→舊）
2. single-flight cache：cache 存 Promise，同頁多個消費者共用一次請求
3. 圖片欄位 = Directus 檔案 UUID → 經 `CMS_CDN_BASE` 組 URL；null 用 placeholder
- **尚未上 Directus**：alumni 整頁、atlas workshops/industry——暫讀本地 JSON，各 `*-source.js` 檔頭有註明；其餘頁面已全接
- **影片**：自架（user 明確排除 YouTube）——S3 + CloudFront HLS，原生 `<video>` 播放。⚠️ 播放必須 no-cors（加 crossOrigin 會炸，見 memory）

### 內容更新方式（給後台編輯者）
- **日常編輯**：Directus 後台 GUI（老師登入改文案／傳圖／拖 sort 欄排序），前台重新整理即生效；後台 label 全繁中、雙語欄位英上中下
- **批量匯入**：`scripts/` 管線——`generate-*-sheet.js` 產 Excel 給編輯者填 → `parse-*-sheet.js` 解析 → `import-*.cjs` 寫入 Directus
- `data/*.json` 是 fallback 快照：內容以後台為準；大改後台內容時建議同步更新對應 fallback

## 設計系統

### 顏色
- **主色**：黑 `#000000` / 白 `#FFFFFF`
- **三原色（ACCENT_COLORS / 「rgb」）**：綠 `#00FF80` / 粉 `#FF448A` / 藍 `#26BCFF`
- **灰階**：`--gray-0` ~ `--gray-9`（注意：是 `--gray-N` 不是 `--color-gray-N`）
- 中性灰用 `var(--gray-N)` 不要用 `rgba(0,0,0,X)` 透明黑（mode 切換時透明黑會疊底色脫節）

### 三主題模式
通常用 `mode1/mode2/mode3` 指稱：
- **mode1 / standard**：白底黑字（`body.mode-standard` 或無 class）
- **mode2 / inverse**：黑底白字（`body.mode-inverse`，規則在 `themes/inverse.css`）
- **mode3 / color**：彩色背景（`body.mode-color`，hue 由 JS 動態設 CSS var；規則在 `themes/color.css`）

切換由 `theme-toggle.js` 控制；`/create` 頁特殊（body class 暫停，由 generate-app 自己處理）。

### 模式切換 transition（whitelist）
`css/base/typography.css` 有一段 whitelist 規則，列舉哪些元件 mode 切換時要 0.4s fade 而不是 snap。新增 mode-aware 元件必須補進 whitelist（不在 list 內 = 視覺 snap）。已含：header / nav-link / [data-bar] / bg-* / text-* / timeline-card / list-header / footer / scrollbar / alumni-* / courses-* / atlas-* / library-* 等。

### Theme variables（推薦給新元件用）
- `--theme-fg` / `--theme-bg`：fg / bg，依 mode 切換
- `--theme-fg-inverse`：fg 的對比色（strict B/W 用），三 mode 都已定義（2026-05-18 起）
- `--theme-fg-rgb` / `--theme-bg-rgb` / `--theme-fg-inverse-rgb`：RGB 三元組，給 `rgba(var(--X), 0.5)` 用
- 新元件 mode-aware 規則優先寫 `body:is(.mode-inverse, .mode-color) .X { color: var(--theme-fg) }` 一條，取代雙寫

### 字體
- **標題**：H1 (8rem) ~ H6 (1.25rem)
- **內文**：P1 (1rem) / P2 / P3
- **字重**：Regular (400) / Semibold (600) / Bold (700)

### 間距
xs (8px) / sm (16px) / md (24px) / lg (32px) / xl (48px) / 2xl (64px) / 3xl (96px) / 4xl (128px) / 7xl / 8xl

## RWD（Desktop-First，三 viewport）

**絕對原則：手機版的修改不能影響桌面版。**

全站有**三個 viewport**：桌面（≥768）、直向手機（<768）、**矮橫向**（橫向手機 gate，見下）。

### 規範
1. **CSS Variables**：預設值 = 桌面版（不可改），手機版用 `@media (max-width: 767px)` 覆蓋
2. **Tailwind classes**：**只用 `md:` prefix**（不用 `sm:`）；預設 class = 手機，`md:` = 桌面 (768px+)
3. **Hover**：手機版不應有 hover；所有 hover 包在 `@media (min-width: 768px)` 內
4. **JavaScript**：條件式執行
   ```js
   function isMobile() { return window.innerWidth < 768; }
   function isDesktop() { return window.innerWidth >= 768; }
   ```
5. **Breakpoint**：md (768) / lg (1024) / xl (1280) — **不用 sm**
6. **一屏高度用 `svh` 不用 `vh`**（手機工具列會讓 vh 高估溢出）

### 矮橫向（landscape gate）
- **Gate**：`@media (orientation: landscape) and (max-height: 500px)`（CSS）／`matchMedia` 同式（JS）——橫向手機寬 ≥768 會誤吃桌面 `md:` 樣式，必須用「高度」判，這是本專案最大的斷點陷阱（原理見《docs/橫向手機版最佳實踐.md》）
- **原則**：「一切以手機版為主」——字級/spacing 變數、header、footer、menu 全套手機值；規則集中在 `css/layout/landscape.css`（分頁編號 5a~5j 區塊）；JS 端各模組的 isMobile 判斷要併入 gate
- **跨 gate 轉向**：靠 orientation-reload 整頁重載自癒（init 時決定一次、不跟 resize）
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
  - hide/show 對稱：`js/modules/lightbox/lightbox-shell.js` 的 `animateHeaderHide` / `animateHeaderShow`（lightbox / slide-in / footer-reveal 共用）
- **規範**：inset 四值單位必須一致（全 % 或全 px），混用會讓 interpolate 失敗看起來「直接出現」
- **用詞**：對話中講「**clip-path**」就是這個 pattern

### Marquee（文字 overflow 跑動）— 新增時選哪套（2026-08-19 定案 B）
判準看「有沒有 hover、放開時要不要回彈」，**不是**看幾行：
- **桌面 hover 才捲**（卡片 / 欄 hover 才動，放開要**平滑回彈**到原點）→ 先 `applyMarqueeOverflow` 量寬，再**桌面**逐 hover unit call `bindMarqueeReturn(hoverEl, innerSel, lineSel)`（GSAP 接手、helper 自我 gate 桌面、inline `animation:none` 蓋掉 CSS keyframe）。中英兩行自動同步。手機不綁＝維持 CSS 自動循環。已用：DSD events/list、atlas list、courses、library press/files/album、activities/faculty/ref-chip。
- **一直自動跑**（無 hover，如首頁 news、library 色卡、得獎人）→ 照舊純 CSS keyframe，**不需要也做不到回彈**。
- ⚠️「連續循環 + 平滑回彈」只有 JS/GSAP 能做（純 CSS 循環放開必 instant snap）；「單次滑出看一眼就回」才能純 CSS transition。always-on 與手機一律不回彈。
- **用詞**：對話中講「**回彈 / 放開平滑回去**」就是 `bindMarqueeReturn` 這套。細節見 memory `project_marquee_hover_easeback_unify` / `reference_sitewide_marquee_mechanisms_map`。

## 效能最佳實踐（2026-08~09 activities 優化戰役定案；完整診斷見 docs/activities-優化四輪/五輪.md）

大清單（百項以上）頁面的鐵則，新頁面／新清單直接照做，別重走一遍診斷：

### 渲染
- **Viewport lazy render**：首批 ~15 項＋sentinel IO 續建（10/批）；deep-link 走 `_lazyRenderAll` 兜底。小清單不需要
- **HTML string 一次組完再 innerHTML**；隱藏態直接烙在 HTML string（出生自帶 class），**不要**渲染後逐項 `gsap.set`——新元素對 GSAP 永遠「冷」，首觸逐列讀 computed style＝逐列全頁 recalc（50~120ms×N，切分頁曾凍 9~34s）
- 事件綁定分幀（rAF 批次）＋ incremental（`data-bound` 守衛）；`.list-item` 加 `content-visibility: auto`
- **讀寫分離**：先讀全部 layout 再寫全部 style，別逐項讀寫交錯（forced reflow thrash）；per-元素 ResizeObserver 要 bail 守衛

### 動畫
- 清單 rows 進退場用 **`list-row-reveal.js`**（CSS transition、compositor 接管、零 computed 讀），不用 GSAP yPercent。⚠️ 揭前隱藏態必須已 commit（painted）才會 transition 而非 snap——同步 hide→reveal 之間要 `void el.offsetHeight` 單次 reflow
- 重複跑的動畫用 **transform**（clip-reveal）不用 **clip-path**（每幀 full repaint）；判準＝文字有沒有位移
- 切分頁 reveal/exit 加 **viewport-cull**（視窗外項目 snap 不動畫）
- GSAP reveal 完要沉澱成 `translate(0px, 0px)`（非 0%）

### 圖片
- 縮圖 `decoding="async"`；⚠️ poster/strip **勿** `loading="lazy"`（會破 reveal gate）；縮圖不寫 >1600px
- 交付走 CloudFront（`CMS_CDN_BASE`）；新上傳大圖跑 `scripts/convert-images-to-webp.cjs`（每日 Action 已掛）
- 弱機不能 on-the-fly transform——不要用 Directus `?width=` 參數（冷生成 504）

### 快取
- single-flight promise cache＋sessionStorage last-known-good＋背景 revalidate（latest-wins，防慢請求蓋新資料）
- 切換／請求類 race 一律**序號作廢**（navSeq pattern）；動畫接管前 `killTweensOf` 目標本身（外層蓋不到子元素）

### 量測
- CDP Profiler 看 self-time 找真根因（別猜）；headless 自驗要用 fresh node static server（舊 server 快取 JS 會量到假的「0 變化」，先 `curl | grep` 確認 serve==disk）
- ⚠️ headless 量到的「reveal 延遲」可能是測量假象，實機確認

## 共用模組（重要！新功能優先沿用）

| 模組 | 用途 |
|---|---|
| `js/modules/ui/scroll-animate.js` | clip-reveal entrance helpers |
| `js/modules/ui/page-exit.js` | 註冊頁面退場動畫 |
| `js/modules/ui/page-cleanup.js` | 註冊離頁要解綁的 listener / observer |
| `js/modules/ui/theme-toggle.js` | mode 切換 + color hue loop + 全域 dispatch `theme:changed` |
| `js/modules/ui/custom-scrollbar.js` | 全站隱藏原生 scrollbar + 自製 fixed thumb div + drag + footer 區換色 |
| `js/modules/ui/marquee-overflow.js` | 文字 overflow → marquee：`applyMarqueeOverflow`（量寬+dual-copy+`--marquee-distance`）；`buildSyncedMarqueeTimeline`（中英同步 GSAP timeline）；`bindMarqueeReturn`（桌面 hover 放開平滑回彈，見下規範） |
| `js/modules/ui/section-switch-helpers.js` | `setActiveNavBtn` + `showPanel`（4 個 section-switch 共用） |
| `js/modules/lightbox/lightbox-shell.js` | enter/exit + body lock + header bar 收展（給 lightbox / slide-in / full-screen overlay 共用） |
| `js/modules/ui/list-row-reveal.js` | 清單 rows 進退場引擎（CSS transition 取代 GSAP yPercent，見「效能最佳實踐」；activities/admission 清單用） |
| `js/modules/accordions/list-accordion.js` | list-header → list-content 展開（必須在 `loadListInto` 後 call `initListAccordion`） |
| `js/modules/pages/activities-data-loader.js` `loadListInto` | 通用 list 渲染（activities / admission summer-camp 等） |

## 編碼規範

### HTML
- `lang="zh-Hant"`、語義化標籤、雙語顯示（英 + 中）
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
- Lottie SCCD logo，size 隨頁面變（180px / 100px — library/atlas）
- /create 頁有 typewriter entry + reverse backspace exit
- 退場時根據 logo state（State A/B/C）決定 backspace / skip / fade

### Footer scatter（`js/modules/ui/footer-scatter.js`）
JS random scatter + collision resolution 8 items + 每次 shuffle 即時 generate verified layout + 每 10s shuffle 動畫（hidden 頁自動 pause）。2026-08-10 由 footer-draggable.js 改名（drag 功能早已移除）；舊 commit / memory 提到 footer-draggable 即此檔。

### 主要互動頁
- **/create**：inline p5 generator（拆 iframe 後），三 mode（Standard / Inverse / Wireframe）對應 site mode（standard / inverse / color），rotation slider + color picker + save PNG + 彩蛋
- **/atlas**：SCCD-centered living textile，4 類 chip (A 老師 / B 系友企業 / C 合作 / D 城市) + 軌道環 + 動態連線 + scale 0.78 永久 + 1.0~1.8 zoom
- **/library**：4 panel (Awards / Press / Files / Album)，year picker + cat filter + marquee overflow + viewer modal
- **/alumni**：sponsor cards (random rotate + hover accent) + city tabs + members 用 .faculty-card + organization renderer

## 工作流程

### 開發
1. 改設計系統變數 → 同步 `variables.css`
2. **改任何被 input.css @import 的 CSS（含 landscape.css / components）→ 立即 `npm run build:css`**（output.css 才是頁面實際載的）
3. 跨頁一致性檢查；TS 檢查 `npm run check:ts`（現有錯誤是歷史遺留，只看新增）
4. 加 page-level listener 時用 `registerPageCleanup`，加 page exit 動畫用 `registerPageExit`
5. **自驗**：repo 有 playwright + 系統 Chrome 可 headless e2e（`channel:'chrome'` 免下載；先起 `npx http-server`）——RWD/互動改動先 headless 量測+截圖再交付；但 logo invert 等視覺細節 headless 不準、要實機確認

### 部署
- **開發預覽**＝GitHub Pages：push main 自動上線（bernard-02.github.io/SCCD-Website）。⚠️「線上是舊版」通常＝改動沒 commit；CSS 改了要先 `npm run build:css` 再 commit
- **正式前台**＝S3 + CloudFront（sccd.usc.edu.tw，尚未切換，流程見《docs/前台上線流程-S3-CloudFront.md》）；**後台** Directus 在 Lightsail `/cms`（reverse proxy → Node :8055）
- user 不熟 devops，部署話題先建心智模型再給步驟

### Git
- 繁體中文 commit message
- WIP rollup commits 用「工作樹 WIP 整理：[主題]」格式
- 不要自動 commit，等明確指示

### 測試 checklist
- **桌面**：所有頁樣式一致 / nav 高亮 / mega menu / hover / GSAP 動畫流暢 / 資源載入
- **手機**：響應式（375/414/768）/ 無 hover 殘留 / 觸控流暢 / 漢堡選單 / 字體 ≥14px / 點擊區 ≥44×44
- **矮橫向**（844×390、667×375）：nav 進 header 帶 / hero 前藏 nav / 不吃桌面 md: 樣式 / 轉向 reload 自癒
- **RWD 互不影響**：手機改不影響桌面 / 媒體查詢正確包裹 / JS 條件式執行（gate 判準跟 CSS 同式）
- **SPA 換頁**：footer 顯隱正確 / body overflow 復原 / listener 不累積（DevTools Memory 看 listener count）
- **資料層**：Directus 斷線時降級正常（A 類走 sessionStorage LKG／B 類走 fallback JSON）/ 後台改內容前台硬重整生效

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
| `faculty-data-loader.js` / `records-data-loader.js` / `legal-data-loader.js` / `degree-show-data-loader.js` 的 fetch + try/catch 樣板重複，如有需要可抽共用（先前的 `loadAndRender` 薄殼從未被採用、已刪） | 小（每檔約 -10 行） | 動到該 loader 時 |
| `inverse.css` / `color.css` 同 selector 規則合併（用 `body:is(.mode-inverse, .mode-color)` + `var(--theme-fg)`）| 中（需 audit 每對語義 + 視覺回歸） | 動該頁 theme 規則時順手 |
| `themes/inverse.css` 內 `/* 不再 / 不再列入 */` 等 dead 註解殘留清理 | 極小 | 動到該檔時 |

### B. 結構性對齊（需 HTML/CSS 一起改）

| 項目 | 工程量 | 為何延後 |
|---|---|---|
| **alumni city tabs → `setActiveNavBtn`** | 中 | 需 HTML 加 `.anchor-nav-inner` wrapper + 改 CSS active style scope；user 已說想對齊 courses program switch |
| **components 從 Tailwind hardcoded class (`border-black`/`bg-white`) → var-based custom class** | 大 | 真正能砍 themes/inverse.css + color.css 大部分重複的根本作法；但要全 codebase 改 HTML，建議一頁一頁來 |

### C. 中等嚴重度殘留 bug（發生機率低，遇到 user 回報再修）

| 項目 | 位置 | 影響 |
|---|---|---|
| `library-viewer.js` PDF listeners 無 remove | js/modules/pages/library-viewer.js | modal 是單例 guard，目前不重綁不出問題；極端情境若 modal 被某 race 重建會疊 listener |
| `library-panels.js` Press/Files/Album 內 helper listener cleanup | js/modules/pages/library-panels.js | 跨 SPA accumulate 可能；需 audit 每個 binding helper |

### D. TIER 3 大架構（明確不做，列出做為設計決策記錄）

- ❌ **section-switch 3 個 caller 抽 helper**：admission/activities/courses 各有 quirks（lazy load / sub-filter / 頭部動畫 / BFA-MDES toggle），抽出 helper hook 後複雜度跟原本 3 份差不多，違反「不過度工程化」
- ❌ **`renderCard()` 通用 card builder**：5 種 card 結構差異 > 共用因子（faculty / library / courses-grid / alumni-sponsor / activities list-item），各面板各自建卡、不抽共用 builder
- ❌ **Web Components / Custom Elements**：原生 JS SPA 是技術選擇，不引入新範式
- ❌ **header bars `[data-bar]` selector 完全集中化**：about / library / atlas / generate / alumni 各有客製互動，header.js 內保留多處 selector 比集中後配 hook 簡單

### E. Component-first 長期方向（user 目標，分階段累積）

1. **Utility helpers**（已大半完成）— scroll-animate / lightbox-shell / page-cleanup / awaitLayoutReady / marquee-overflow / section-switch-helpers / theme-toggle / custom-scrollbar
2. **Render templates**（進行中）— `loadListInto` 是 canonical list template（card 目前各面板自建、無共用 builder）。下一階段可考慮抽：
   - 統一 ref/attachment block builder（目前 list-ref-btn HTML 散在多處）
   - 統一 gallery + lightbox bind helpers（loadListInto 內部已有，可獨立 export 給非 list 場景）
3. **Self-contained widgets**（不做）— 需 Web Components 或框架支援，跟現有 vanilla JS SPA 衝突
