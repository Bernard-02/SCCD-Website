# Activities 頁效能優化方案（執行版）

> 2026-09-02 定案。背景分析與 user 裁示已完成，本文件是**可直接執行的工作清單**。
> 執行前請先讀 CLAUDE.md 與 auto-memory 中 `reference_activities_*` 系列條目——多數「看似可簡化」的怪代碼是踩過坑的刻意設計。

## User 已拍板的裁示（不要重新開放討論）

1. **Directus-only**：本地 `/data/*.json` 是假資料，渲染沒有意義 → fallback 渲染路徑全面退場。
2. 圖片走 CloudFront/S3（已完成）、webp 轉檔已完成——本方案的圖片工作只剩「像素尺寸過大」。
3. 圖片縮尺寸採**就地破壞性縮圖**（同 webp 轉檔先例：PATCH 回同 UUID，前台零改動）。
4. 資料快取：進頁**不清空**、留在快取供秒 render；背景更新。
5. ref 一律信 Directus deep-fetch 的 title，不查本地 JSON。
6. P3 cache-warm（clearProps 問題）以「最正確的做法」實作，不取巧。
7. search / deep-link 屬次要功能：只記錄，本輪不做（文末清單）。

## 🚫 勿回退紅線（既有優化，全部有 memory 佐證）

- `reconcileChunk` 兩道 RO bail、`updateChevrons` 三態 bail（`activities-data-loader.js`）
- `setupAdmissionReveal` 的 `limit: 64`、`playAdmissionPanelReveal/Exit` 的 viewportCull（`admission-data-loader.js`）
- viewport lazy render（`loadListInto` 的 `lazy` 路徑）
- ~~`.list-item` 的 `content-visibility: auto`~~（**2026-09-01 實測撤回、勿再加**：全清單幾何讀取（gBCR sweep）對 c-v 子樹＝強制渲染，離頁 137→3299ms 反噬；見 lists.css 內註解）
- switchToSection「退場完才 loadPanel」的順序（step 0 prefetch 保留並行）
- poster / gallery strip **不可**加 `loading="lazy"`（0 高雞生蛋；見 P2-2 的解鎖條件）
- hero gate（`waitForHeroAnimDone`）勿加短 cap；「defer render」與「prefetch data」是正交兩件事

---

# P0：死碼刪除

## P0-1 刪除 `activities-year-toggle.js`（確認無用）

- **證據**：它查 `.activities-year-toggle`，但 `openYearGroup` 渲染的是 `.list-year-toggle`（`activities-data-loader.js:1604`）→ 永遠空集合、early return，純 no-op。真正活著的年份收合是 `list-accordion.js` 內的 `initListYearToggle`（由 `initListAccordion()` 尾端呼叫）。
- **動作**：刪 `js/modules/accordions/activities-year-toggle.js` 整檔；刪 `activities-section-switch.js` 的 import（line 11）與 7 個呼叫點（onLazyBatch 內 1 處 + loadPanel 各 case 6 處）。
- **驗收**：各 section 年份收合／展開／chevron 全部照常（走 list-accordion 那套）。

---

# P1：資料層重構 + bug 修正（主體）

## P1-1 修 `initListYearToggle` 重入 reset bug

- **位置**：`js/modules/accordions/list-accordion.js:17-46`（初始高度迴圈；line 49 的事件綁定**有**守衛、初始迴圈**沒有**）。
- **問題**：每個 lazy 批次捲入都會經 `onLazyBatch → initListAccordion() → initListYearToggle()` 重跑初始迴圈。使用者手動收合某年份後（GSAP close 只 tween height/rotation，chevron 的 `rotate-90` class 還在＝仍被當「初始展開」sentinel）→ 補批觸發重跑 → `height` 被設回 `auto`、chevron 被 `gsap.set(rotation: 270)` 轉回展開角，但 `display:none` 還在 → **chevron 顯示展開、實際收合，且要點兩下才能重開**。
- **修法**：初始高度段加 per-toggle 守衛（例如 `toggle.dataset.ytInit`），只有第一次跑；或改以當下 inline style（`height`/`display`）判斷實際狀態、不再依賴 class sentinel。前者較小、推薦。
- **驗收**：exhibitions 收合最上面年份 → 往下捲觸發 lazy 補批 → chevron 保持收合態、單擊即重開。

## P1-2 fetch 全面加逾時（防 switching 卡死）

- **位置**：`js/modules/pages/activities-source.js` 所有 `fetch(CMS_API_BASE...)`（:187、:219、:254 一帶）。
- **問題**：無逾時。Directus 弱機的已知故障模式是「hang 而非拒絕」；`switchToSection` 的 `switching=true` 要等 `await loadPanel()` 結束才在 finally 釋放（`activities-section-switch.js:842`）→ fetch 吊 30s+ 期間**所有分頁切換被吞**。
- **修法**：共用一個 `fetchWithTimeout(url, ms=10000)`（AbortController），逾時 throw → 進 P1-3 失敗鏈。
- **驗收**：DevTools 把 API 網域 throttle/block → 10s 內 panel 顯示錯誤態、切別的分頁不被卡。

## P1-3 Fallback JSON 退場 → Directus-only + 三層失敗鏈

**新的資料取得鏈（每個 collection）**：

```
記憶體 _flightCache（single-flight，跨 SPA 換頁存活）
  → miss：fetch Directus（含逾時）
      → 成功：寫入 _flightCache ＋ 寫 sessionStorage（last-known-good）
      → 失敗：讀 sessionStorage 上次成功的「真資料」
          → 也沒有：throw → panel 顯示錯誤態（不渲染假資料）
```

- **動作**：
  1. `activities-source.js`：`_loadActivityCollection` / `_loadPermanentExhibitions` / `loadGeneralActivitiesAlbum` 三支的 `catch → fetch(sitePath(fallbackUrl))` 全刪，改接上述鏈。`fallbackUrl` 參數可留在簽名（呼叫端字串同時是 identifier）但不再使用，或整層清掉——以最小 diff 為準。
  2. 同頁其他資料路徑同原則：`summer-camp-source.js`（summer-camp section）、degree-show list 的 loader（`degree-show-data-loader.js` 內 list 部分）——先 grep 各自的 fallback 實作再套同鏈。
  3. sessionStorage 細節:key 對齊 flight key（`col:<collection>:<category>:<sortByDate>` 等）；存**最終 shape**（groupByYear 後的資料，render 直接吃）；`JSON.stringify` 包 try/catch（超 quota 就靜默不存）；不設 TTL（它只是災難備援，硬重整的正常路徑永遠走網路）。
  4. **錯誤態 UI**（極簡）：panel 內顯示雙語一句（比照 search empty-state 的樣式：`No Result 無結果` 那套 flex 置中），文案如 `Failed to load 載入失敗，請稍後再試`。`switchToSection` 的 catch 已會 `delete loaded[section]` → 使用者再點該分頁鈕即自動重試，不需要另做 retry 按鈕。
- **注意**：`/data/x.json` 字串在 `loadListInto` / `deriveHostSection` / `_panelSelectorMap` 等處是 **map key / 識別字**（檔頭註解有講），字串常數保留、`data/` 檔案不刪（library 等頁另議）。
- **驗收**：正常網路各 section 渲染 byte-identical；block API → 有 sessionStorage 時渲染上次真資料、無時顯示錯誤態；恢復網路後重點分頁可重試成功。

## P1-4 快取「進頁不清、背景更新」

- **關鍵認知**：SPA 換頁不換 JS context，module 級 `_flightCache` 本來就存活；唯一清掉它的是每次進頁的 `resetActivitiesFetchCache()`（`activities-section-switch.js:713`）。
- **動作**：
  1. 移除 init 裡的 `resetActivitiesFetchCache()` 呼叫（grep 確認無其他 caller 後，export 也可刪）。
  2. `activities-source.js` 新增 `revalidateActivitiesData()`：對 `_flightCache` 既有 key **序列**重抓（弱機怕並發，比照 `prefetchOtherActivitiesData` 的節奏與「離頁即停」guard：`#activities-content-section` 不在就 return），成功後**替換** cache entry ＋ 更新 sessionStorage。fire-and-forget、吞錯。
  3. `initActivitiesSectionSwitch` 進頁時呼叫它（取代 reset）。可與 `prefetchOtherActivitiesData`（補抓 miss 的 key）合併成同一條序列 warm 迴圈：有 cache 的 revalidate、沒 cache 的 fetch。
- **語意**（重要，不要「改進」它）：本次進頁 render 用舊值＝秒開；新值供下次進頁。**硬重新整理＝全新 JS context＝快取天然歸零＝必走網路** → 後台編輯「重新整理即生效」的工作流完全不變。sessionStorage 不做主快取、只做 P1-3 的災難備援，正是為了保住這個語意。
- **驗收**：activities → 別頁 → 回 activities：Network 面板應看到 render 即時（吃記憶體快取）＋背景序列 revalidate 請求；硬重整則 render 前有正常 fetch。

## P1-5 Ref 收斂到 Directus 單一來源

- **證據**：本地 JSON 的 id 是人工碼（`V-2025-01`），Directus 是 UUID → `resolveRef` 回查本地**永遠 match 不到**，現況就是純浪費的多次大檔 fetch。
- **動作**：
  1. `activities-data-loader.js` `resolveRef`（:114-141）：刪 `getSectionData`/`findItemById` 查表段，只保留 SECTION_LABELS 補 label。title 唯一來源＝`remapRef` 的 M2A deep-fetch（單語 title 就顯示單語，資料導向）。
  2. `degree-show-data-loader.js` `resolveRefImages`（:1256-1268）也用同套本地查表 → **先實測現況**（dsd 子展覽 ref 圖是否已靜默壞掉），再改成 Directus 單筆查詢：`ref.source`（section key）→ collection 對照（參考 `activities-source.js` 的 `ACT_SECTION` / `ACT_DIRECTUS_MAP`）→ `GET /items/<collection>/<id>?fields=images.directus_files_id.filename_disk` 組 CDN URL。
  3. `pdf-cross-ref-index.js`：刪 `buildIndexFromLocal` 與 `buildIndex` 的 fallback catch——Directus 全掛時回空 index（chip 不顯示）即可。
  4. 以上遷完後，`activities-data-loader.js` 的 `getSectionData` / `findItemById` / `SECTION_DATA_URL` / `_refDataCache` 整組刪除。⚠️ `getAwardRecords` / `findAwardById` 是 library 在用（library-panels.js），**不動**。
- **驗收**：activity→activity ref 按鈕有標題可跳轉；document ref 開 PDF viewer 正常且 cross-ref chip 正常；dsd 子展覽 ref 圖渲染正常（或確認原本就壞、修好後首次正常）。

## P1-6 fields 瘦身（獨立 commit，方便回退）

- **位置**：`activities-source.js:187` 的 `fields=*,...`。
- **證據**：REF_FIELDS 深取把 lectures 從 12KB/0.37s 灌到 139KB/1.1s（冷抓）。
- **動作**：`fields=*` 改明確列舉。先盤點 `mapRow` / `loadListInto` / `buildItemHtml` 實際讀的欄位（至少：`id, sort, titleEn, titleZh, subtitleEn, subtitleZh, subtitles, dates, startDate, endDate, year, monthDay, locations, guests, descriptionEn, descriptionZh, isCancelled, videoLinks` ＋ conferences 的 `sessions.*` ＋ 既有 poster/images/REF_FIELDS 深取）。
- **風險**：漏欄位＝靜默缺資料。**驗收必做**：每個 section 改前後渲染 HTML diff（headless 抓 innerHTML 比對），零差異才過。

---

# P2：圖片 + 動畫層

## P2-1 圖片就地縮圖（已拍板破壞性）

- **背景**：webp 已全轉；問題是 3508px（A4 300dpi 掃描）像素原圖直灌前台。poster 顯示最大 ~2fr–3.5fr 欄寬 ×retina ≈ 800px、lightbox 全螢幕 ~2000px。ppi 與 web 顯示無關，砍的是像素尺寸。
- **動作**：沿用 `scripts/convert-images-to-webp.cjs` 模式寫縮圖腳本：掃 Directus files 中長邊 >2000px 的圖 → 縮至長邊 2000px、webp quality ~80 → PATCH 回**同 UUID**（前台零改動）。跑法同 webp：`loop --limit 12` 獨立 process、批間 sleep（單 process 打太多會 undici 雪崩，見 memory `reference_directus_image_transform_webp`）。
- **後續**：把「長邊 cap 2000px」併入每日 webp GitHub Action 的腳本，之後新上傳的大圖自動涵蓋。
- **⚠️**：破壞性不可復原（同 webp 先例、user 已拍板）。跑前先出統計（幾張超標、總量），跑一小批抽查視覺後再全量。
- **驗收**：清單展開／lightbox 打開視覺無感差異；poster decode 導致的「展開卡一下」明顯改善（Performance 面板比對 decode 時長）。

## P2-2 poster aspect-ratio + 解鎖 lazy

- **動作**：
  1. `activities-source.js` query 深取加 `poster.width,poster.height`（directus_files 內建欄位）→ `mapRow` 帶出 `posterW/posterH`。
  2. `buildPosterHtml` wrapper 設 `style="aspect-ratio: W/H"` → poster 載入前就有預留高度。
  3. 有了預留高度後，poster `<img>` 加 `loading="lazy"`（原本不能加的根因＝0 面積永不觸發載入，此時已消失）。
  4. **gallery / album strip 的圖維持 eager**：`gateStripRevealOnLoad` 的 1.5s 計時綁定當下起跑，lazy 會讓「展開往右移」bug 回歸（memory `reference_activities_album_strip_reveal_after_load`）。
- **額外收益**：手機慢載時海報不再把下方內容頂下去；既有的 height 0→auto 補償動畫可保留當 fallback。
- **驗收**：桌面＋手機展開含 poster 的 item 零 layout shift；Network 面板確認畫面外 poster 不預載。

## P2-3 P3 cache-warm：clearProps 全面盤點（最正確做法）

- **原理**：`clearProps:'transform'` 每次都作廢 GSAP 的 transform cache → 下輪 `gsap.set` 逐列重讀 computed style＝逐列全頁 recalc（首切殘留 1~2.9s 大 task 的主因之一，memory `reference_activities_switch_ro_recalc_storm` 殘餘工作 ①）。
- **正確原則**：同一元素的 transform/clipPath 在生命週期內由 GSAP 單一持有——reveal 收尾停在 `yPercent:0`（不 clearProps）、exit/snap 都是純寫入；需要「回到無 inline」語意的地方（如 search 還原）改為顯式 `gsap.set(..., {yPercent:0})` 或直接操作 `element.style`。
- **盤點範圍**（全部 `clearProps` 呼叫點逐一決定去留）：
  - `admission-data-loader.js`：reveal 各分支（:229/:243/:300-301/:309/:318）、`setupAdmissionReveal`
  - `activities-section-switch.js`：deep-link 清 pre-reveal（:747/:750）、`setPanelDescActive`
  - `js/modules/ui/activities-search.js`：`revealAllInstant`（:25-26）
  - `scroll-animate.js` 的 `playClipReveal` 若含 clearProps → 影響全站，**只動 activities 呼叫路徑可控的參數**，不改共用 helper 預設
- **回歸驗證清單（必跑）**：sticky year-toggle / list-header 釘線與釋放、z-index 疊層（inline transform 會建 stacking context——lightbox/slide-in/header bars 層級）、zebra 底色、search 清空還原、deep-link 直落、mode1/2/3 切換、accordion 展開收合。
- **量測**：headless + CDP，比對切換時 longtask **數量**（絕對毫秒不可信，機器變異 ±3x）；腳本思路見 memory（perf-switch.cjs：PerformanceObserver longtask + rAF 幀距）。

## P2-4 切換 latest-wins（點擊不再被吞）

- **位置**：`activities-section-switch.js:796` `if (switching) return;`。
- **問題**：exit+render+reveal 期間（可達 1s+）點其他分頁被整顆吞掉，體感「沒反應」。
- **修法**：guard 命中時記 `pendingSection = section`；`finally` 收尾（`switching = false` 後）檢查 pending ≠ 當前 → 立即 `switchToSection(pending, ...)`（latest-wins，中間連點只留最後一個）。順手：把進行中的 switch promise 存 module 變數（供未來 deep-link promise 化使用，本輪不做後續）。
- **驗收**：快速連點 3 個不同 section → 最終落在最後點的那個，中間不閃爍不錯亂；動畫期間點擊不再無效。

---

# 執行順序與 commit 切分建議

1. P0-1 + P1-1（死碼＋bug，各自小 commit）
2. P1-2 + P1-3 + P1-4（資料層一組，可拆 2-3 個 commit：逾時／fallback 退場＋失敗鏈／快取語意）
3. P1-5（ref 收斂；dsd 遷移單獨 commit）
4. P1-6（fields 瘦身，獨立 commit 方便回退）
5. P2-4（latest-wins，小）
6. P2-3（cache-warm，回歸面最大，單獨做＋完整驗證）
7. P2-1 / P2-2（圖片：腳本先統計→小批→全量；aspect-ratio 前台改動另 commit）

Commit 訊息用繁中、遵循現有格式；**不要自動 push**，等 user 指示。

# 驗證方式

- `npx http-server` + Playwright headless（`channel:'chrome'`），打**真 Directus**。
- 冒煙矩陣：9 個 section 切換往返、年份收合＋lazy 補批、item 展開（含 poster/gallery/ref）、search 輸入與清空、硬重整 vs SPA 回訪的網路行為、block API 的失敗鏈。
- 效能看 longtask 數量與幀距（相對比較）；視覺細節（logo invert 等）headless 不準、實機確認。
- 本方案幾乎純 JS；若動到 `lists.css` 等被 input.css @import 的檔案，記得 `npm run build:css`。

# 次要功能記錄（本輪不做，僅存檔）

1. **searchText 缺 Directus 欄位**（`activities-data-loader.js:1377-1385`）：只收舊 shape（`title/title_zh/g.name`），Directus 的 `titleEn/titleZh/nameEn/nameZh/orgEn/orgZh/locations[]/cityEn/cityZh/sessions[].guests` 全沒進索引 → **搜標題／講者名應該搜不到（功能 bug）**。工程量僅幾行，若做 P1 時想順手帶掉可以，但屬 search 範疇。
2. search 首鍵 `ensureFullyRendered` 同步全建凍結（lectures ~1.3s）→ 改資料層匹配（對 flight cache 資料 match、只渲染命中項）或 panel 載入後 idle 分幀背景補建。
3. `animateMatches` 每鍵對**全部**命中列重播進場動畫 → diff 上一輪命中集合、只動新增項（兼修 cross-tween race 風險）。
4. `switchToSection` promise 化 → `navigateToItem` 去掉 timing-based 輪詢（150ms/350ms/30×100ms/60×50ms）。
5. marquee 全部 wrap 共用一顆 ResizeObserver（`entry.contentRect` 免 layout 讀）。
6. 綁定延遲的 1600ms magic timer（`activities-data-loader.js:789/:992`）改事件驅動（reveal timeline onComplete / requestIdleCallback）。
7. panel DOM 永不卸載（逛完 9 section ~14k 節點）——現況有 c-v + bail 壓著，資料量再翻倍才需要處理。
