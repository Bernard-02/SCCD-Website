# SCCD 網站專案指南

## 專案概述
實踐大學媒體傳達設計系（SCCD - Shih Chien University Communications Design）官方網站。原生 JS SPA，無框架。

## 技術棧
- **前端**：原生 HTML/CSS/JavaScript（ES6 modules）
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
├── data/                       # 所有 JSON 資料（news / faculty / admission / records / alumni-* / ...）
├── images/  assets/            # 圖片與其他資源
└── package.json                # tailwind build script
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

## RWD（Desktop-First）

**絕對原則：手機版的修改不能影響桌面版。**

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

## 共用模組（重要！新功能優先沿用）

| 模組 | 用途 |
|---|---|
| `js/modules/ui/scroll-animate.js` | clip-reveal entrance helpers |
| `js/modules/ui/page-exit.js` | 註冊頁面退場動畫 |
| `js/modules/ui/page-cleanup.js` | 註冊離頁要解綁的 listener / observer |
| `js/modules/ui/theme-toggle.js` | mode 切換 + color hue loop + 全域 dispatch `theme:changed` |
| `js/modules/ui/custom-scrollbar.js` | 全站隱藏原生 scrollbar + 自製 fixed thumb div + drag + footer 區換色 |
| `js/modules/ui/marquee-overflow.js` | 文字 overflow → seamless loop marquee（atlas/courses/library 共用） |
| `js/modules/ui/section-switch-helpers.js` | `setActiveNavBtn` + `showPanel`（4 個 section-switch 共用） |
| `js/modules/lightbox/lightbox-shell.js` | enter/exit + body lock + header bar 收展（給 lightbox / slide-in / full-screen overlay 共用） |
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

### Footer scatter（`js/modules/ui/footer-draggable.js`）
**注意：檔名含 "draggable" 是歷史殘留，drag 功能已移除。** 現在是 JS random scatter + collision resolution 8 items + 10 個 pre-computed verified layouts cache + 每 10s shuffle 動畫（hidden 頁自動 pause）。

### 主要互動頁
- **/create**：inline p5 generator（拆 iframe 後），三 mode（Standard / Inverse / Wireframe）對應 site mode（standard / inverse / color），rotation slider + color picker + save PNG + 彩蛋
- **/atlas**：SCCD-centered living textile，4 類 chip (A 老師 / B 系友企業 / C 合作 / D 城市) + 軌道環 + 動態連線 + scale 0.78 永久 + 1.0~1.8 zoom
- **/library**：4 panel (Awards / Press / Files / Album)，year picker + cat filter + marquee overflow + viewer modal
- **/alumni**：sponsor cards (random rotate + hover accent) + city tabs + members 用 .faculty-card + organization renderer

## 工作流程

### 開發
1. 改設計系統變數 → 同步 `variables.css`
2. 改 Tailwind → 重新 build（看 package.json）
3. 跨頁一致性檢查
4. 加 page-level listener 時用 `registerPageCleanup`，加 page exit 動畫用 `registerPageExit`

### Git
- 繁體中文 commit message
- WIP rollup commits 用「工作樹 WIP 整理：[主題]」格式
- 不要自動 commit，等明確指示

### 測試 checklist
- **桌面**：所有頁樣式一致 / nav 高亮 / mega menu / hover / GSAP 動畫流暢 / 資源載入
- **手機**：響應式（375/414/768）/ 無 hover 殘留 / 觸控流暢 / 漢堡選單 / 字體 ≥14px / 點擊區 ≥44×44
- **RWD 互不影響**：手機改不影響桌面 / 媒體查詢正確包裹 / JS 條件式執行
- **SPA 換頁**：footer 顯隱正確 / body overflow 復原 / listener 不累積（DevTools Memory 看 listener count）

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
