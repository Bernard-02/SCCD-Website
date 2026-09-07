# about 手機版：division tab 背景移除＋history 統一單版本（方案）

2026-09-05，RWD 輪。範圍＝about 頁手機直向（矮橫向連動見 §2.6）。實作前先讀完；改 CSS 後 `npm run build:css`。

## 1. 學制/Works 共用 division tab 背景移除（小改，1 行）

- 現況：[pages/about.html:226](../pages/about.html#L226) `#mobile-division-nav` 的 sticky wrap 有 inline `background: var(--theme-bg)` → 白帶把後方 floating polygons 攔腰切掉。
- 改法：**只刪該 inline background**（`top: 168px` sticky 保留）。桌面對應的 `#class-buttons-sticky`（about.html:262）本來就無 bg → 此改＝對齊桌面「tab 直接疊在 item 上」。
- 不動：主 anchor strip（about.html:44）的 bg **保留**（五 tab 共用、遮捲過內容）。
- mode 連動查過＝零：inverse.css:344 / color.css:1175、1191 都只綁 pill 的 `.anchor-nav-inner`，不綁 wrap 帶。mode3 inactive pill 本來就是不透明反色 chip，疊 polygons 可讀性 OK；mode1 inactive 是透明底 50% 字（桌面同款，刻意）。
- 驗收：Programs／Works 區捲動時 polygons 從 division tab 後方穿過；上方主 strip 白帶不變；三 mode 各看一眼。

## 2. history 手機版刪除、全視口統一走桌面 buildStrip（中改，淨刪 ~400 行）

現況 [timeline.js:200](../js/modules/pages/about/timeline.js#L200)：`<768 或矮橫向 → buildMobile`（era chip＋年份卡＋單格 slideshow＋箭頭切年），桌面 → `buildStrip`（照片 marquee 80px/s 無限捲＋list 鈕開關文字卡、卡開著 marquee 照跑、進頁預設開）。

user 定案：**只留 buildStrip 一個版本**。手機開文字卡可以遮住 marquee，圖片持續跑——buildStrip 本來就不暫停 marquee，行為零改。

步驟：

1. **route**：timeline.js:198-202 刪分支，一律 `buildStrip(items, images)`。
2. **刪 buildMobile 整個 fn**（timeline.js:206-548）＋ `createClassImagesSlideshow` import（timeline.js:12，只有它在用）。
3. **#timeline-area 高度**：inline `height: calc(100vh - 164px)`（about.html:486）桌面不動；手機補一行 JS：buildStrip 開頭 `if (window.innerWidth < 768 || 矮橫向gate) area.style.height = 'calc(100svh - 164px)'`（svh 規範；用 JS 寫 inline 免跟 inline style 打 specificity 仗）。⚠️ 要在讀 `area.offsetHeight`（buildStrip:555）**之前**設。
4. **手機 list view CSS**：桌面卡吃 `.tl-list-grid` 20-col（卡 col-6 起）→ 手機要 full-width 覆蓋。lists.css 已有原 buildMobile 的 tl-list 手機規則可沿用一部分，但注意桌面版結構是「era-head sticky 在卡內」（09-04 版、無黑 chip、捲動在 `.tl-list-years`）→ 手機舊規則針對 `.tl-list-chip` / `.tl-list-content` 捲動的部分要對齊新結構，dead 的刪。
5. **list 鈕定位**：`.tl-list-btn-grid`／`#timeline-list-btn` 桌面對齊 col-5；手機蓋成左下角（同原 `.tl-m-list-btn` 位置）。rectMask inline `right:24px`（timeline.js:831）給 next 鈕留位，手機沿用即可。
6. **矮橫向**：gate 一併刪＝同吃 buildStrip（「一切以手機版為主」＝同一版本）。landscape.css 5i++ 的 tl-m 規則（13 處）順勢清；tl-list 的 4 處 landscape 規則實機看要不要留。
7. **清 dead CSS**：lists.css `tl-m-*`（44 處）全刪；build:css。
8. **照片尺寸 knob（先不做）**：PHOTO_MIN/MAX_VW 30~50 與 5-bar 是桌面比例；390px 手機照片約 117~195px 寬、偏小。首輪原樣上實機看，要調再加 isMobile 分支（建議起點：bar 改 3 條、photo 55~85vw）。

驗收：
- 手機 history＝照片 marquee 自動跑；list 鈕開卡蓋在 marquee 上、背後圖片照跑；next 鈕切 era；預設開卡（同桌面）。
- 離頁退場正常（buildStrip 的 registerPageExit 已 viewport-gate，手機共用）。
- 矮橫向（844×390）不炸版；list 卡在 500px 高的可讀性實機確認。
- mode3 切一輪（timeline 卡色/era-head 是 JS inline accent，color.css 有無 stale selector 順手 grep `tl-list`）。

風險：手機首輪照片偏小（knob 已留）；lists.css 手機 tl-list 舊規則與 09-04 新結構的對齊是唯一需要仔細的地方。

---

## §1–2 實作勘誤（09-06，第一輪已落地後記）

- §2 step 3 的 `164` 是錯的：手機 area 高**必須 `calc(100svh − 178px)`**＋portrait `#history { padding-top:0 !important }`（178＝scroll-snap.css 手機 `#history` scroll-margin-top，讓出 sticky anchor strip；用 164/保留 padding 會把 toggle 鈕推出畫面 82px）。已照此實作。
- 矮橫向要自補 `.tl-list-grid{display:block}`＋`#history{padding-top:0}`（原靠已刪的舊共用 block）。已實作。

## 3. 第二輪修正（09-06 user 回饋，未實作）

### A. division tab 白底改「釘住才出現」（推翻 §1 的一律移除）

user 二輪定案：白底還是要，但**只在 sticky 釘住後**才出現——自然 flow 位置時透明（tab 疊 polygons），釘住後下方圖文捲過會穿到 btn 上、要白底遮。

- 作法（sentinel + IO，無 scroll listener）：
  1. about.html:226 wrap 加一個 class（如 `mobile-division-wrap`）方便 CSS 對位；inline bg 維持刪除狀態。
  2. `bfa-division-toggle.js`（division nav 現有 wiring 處）：wrap 前插 0 高 sentinel div → `new IntersectionObserver(([e]) => wrap.classList.toggle('is-stuck', !e.isIntersecting), { rootMargin: '-169px 0px 0px 0px' })`（169＝sticky top 168+1）。sentinel 捲過 169 線＝wrap 已釘住。手機 `<768` 才綁；`registerPageCleanup` disconnect。
  3. CSS（variables.css mobile block，同現有 #mobile-division-nav 規則處）：`.mobile-division-wrap.is-stuck { background: var(--theme-bg); }`。`var(--theme-bg)` 三 mode 自動跟底色，mode3 免另寫。
- sticky 容器結束、nav 被推走時 sentinel 仍在線上方＝維持 is-stuck 有底 → resources 內容捲過也遮得住，行為正確免特判。
- 主 anchor strip（about.html:44）維持常駐 bg 不動。
- 驗收：section 起點 tab 透明疊 polygons → 捲到釘住白底出現、圖文不穿透 → 捲回頂端白底消失；deep-link/重整落在中段時初始態正確（IO 首發即校正）。

### B. history 手機：next 鈕移頂＋照片放大

1. **next 鈕壓卡片右上角（同桌面）**：lists.css portrait block（@media max-width:767 + portrait）補 `.tl-list-next-btn { top: -24px; bottom: auto; }`——桌面那條在 `(min-width:768px)` gate 內（lists.css:1154）吃不到手機。`.tl-list-grid` 現行 `top:24px` 剛好給鈕上半身（24px）留位，不用動。
2. **照片放大（一屏至少一張、不必多張）**：timeline.js buildStrip 的 `PHOTO_MIN_VW`/`PHOTO_MAX_VW`（30/50）改 per-viewport：`const mobile = window.innerWidth < 768; const PHOTO_MIN_VW = mobile ? 60 : 30, PHOTO_MAX_VW = mobile ? 85 : 30+20;`（60~85 起跳，headless 截圖看密度再微調；bar 數 5 條先不動——手機一次只見一張、垂直散佈影響小，不夠再降 3）。
- 驗收：手機 marquee 任一時刻至少一張近全幅照片在畫面內；next 鈕在卡片右上、點擊切 era 正常；桌面照片尺寸零變化。
