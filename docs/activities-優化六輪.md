# activities 優化六輪：中斷殘留曝露（CSS 版 killTweensOf）＋開合順暢化

> 2026-09-03，給 Opus 執行；診斷已完成、不需重新分析。
> 前情：四輪（rows CSS 化＋list-row-reveal.js 引擎）＋五輪（search 還原守門）已落地，冷切 9s→498ms、暖切 0 longtask。
> 本輪修 user 兩個新回報：**①「list 還沒 load 完就切換，未揭露的內容會直接曝露出來」**（headless 逐幀已重現）**②開合動畫還不夠順**（年份開合實測已乾淨、不用動；卡的是 item 展開/收起）。

---

## Part 0：確診

### 症狀①：中斷後內容裸露 ＝ CSS transition 沒有 killTweensOf 等價物

重現（headless 逐幀）：進 lectures → 捲到 pending 未揭區（reveal-IO 開始揭）→ 立刻切 workshop → **退場窗內整批未揭 item 以「完整靜態態」裸露**（zebra＋文字＋chevron 全亮、無進場也無退場），之後才被 display:none 硬切掉。

機制（三個殘留回呼，全是同一類病）：

1. **`revealRows` 的 per-row `transitionend` 清理器**（[list-row-reveal.js:42-47]）：reveal 被退場/藏打斷後 listener 仍掛著；退場 transition 結束 fire `transitionend`（propertyName 同為 transform）→ 舊 clr 把 `transition=''; transform=''` 清空 → **row 從「已滑出/隱藏」彈回完整顯示**。
2. **`revealRows` 的 `setTimeout finish`**（:49）：不管被打斷都會到時開火 → `onDone` 把 `data-pre-reveal` 解鎖，蓋掉退場剛設的鎖（實測探針：exit 設了 15 個 pre-reveal、之後全變 0）。
3. **zebra 的 `transitionend` 清理器**（同病兩處）：`revealZebraBg`（admission-data-loader ~:154）與 reveal-IO zebra clr（activities-data-loader ~:1665）——退場的 clip transition 結束時 propertyName==='clip-path' 命中舊 listener → `clipPath=''` 清空 → **整條灰底彈回**。

GSAP 時代這類 race 由 `killTweensOf`＋overwrite 擋掉（reference_gsap_cross_tween_write_race）；轉 CSS 後引擎沒有等價物 → 需要 **generation 戳記**：每次對 row/zebra 寫入新狀態就換代，舊回呼開火前比對代數、不符即 no-op。

### 症狀②：開合卡（CPU 4x 節流實測、除 4 ≒ 實機）

- 展開一個 item：一顆 **1009ms**＋尾隨 300~850ms 數顆；連開三個：**500~2050ms 一大串**；收起：一顆 1017ms。**年份收/展：0 longtask ✓（不用動）**。
- Profiler 歸因（total-time）：
  - **`idleBuild` → `buildOneBatch` 27.1s**：開合期間背景補建照跑——四輪 Part 2 規格的 **`accordionBusy` 讓路 gate 漏未實作**（現碼只有 `lastScrollTs` 捲動 gate，activities-data-loader ~:1737-1748）。
  - **`bindMediaHover` → `applyHover` → `gsap.set` 13.2s**：每批補綁 hover 時 `gsap.set(img, { rotation })`（activities-data-loader **:136**）＝bind 路徑殘存的逐圖 GSAP 冷觸（Td self 18.3s 的主源）。
  - **`updateStickyTop` self 8.0s**：每批建完呼叫一次（~:1578 讀 `filterBar.offsetHeight`），DOM 剛被批次弄髒 → 每呼叫一次 forced recalc。
  - **`getScrollableBox` self 3.6s**（list-accordion :262）：每次 `onLazyBatch` 重跑 `initListAccordion` 時逐 header 讀 `getComputedStyle(box).overflowY`——box 是同一顆、答案不變，卻在髒 DOM 上讀了幾千次。
  - **`colScrollHandler` self 4.3s**（activities-search.js :363-374）：每個 scroll event 跑 `document.querySelector('.activities-panel:not(.hidden) .activities-filter-bar')` 全 DOM selector 掃描。

---

## Part 1：generation 戳記（中斷安全，CSS 版 killTweensOf）

### 1-A. 引擎（`js/modules/ui/list-row-reveal.js`）

模組頂加：

```js
let _gen = 0;
// 每次對這批 row 寫入新狀態就換代：舊 reveal 的 transitionend/timeout 回呼開火前比對代數，不符＝已被接管，no-op。
function stampRows(list) { const g = String(++_gen); list.forEach(r => { r.dataset.rrGen = g; }); return g; }
```

四個寫入者全部戳記：

- `hideRow`／`hideRows`：寫 transform 前 `row.dataset.rrGen = String(++_gen)`（hideRows 走 stampRows）。
- `snapRowsShown`：同上 stampRows。
- `exitRows`：進場即 `const g = stampRows(list)`（Promise 邏輯不變）。
- `revealRows`：`const g = stampRows(list)`；
  - per-row `clr` 開頭加 `if (row.dataset.rrGen !== g) { row.removeEventListener('transitionend', clr); return; }`（不符＝別的狀態接管了，**不得**清 inline，只解綁自己）。
  - `finish`（setTimeout）開頭加 `if (list[0] && list[0].dataset.rrGen !== g) return;`（同批同代、驗頭一顆即可）→ 被打斷的 reveal 不再解鎖 `data-pre-reveal`。

### 1-B. zebra 兩處（同 pattern、用 `dataset.zbGen`）

zebra 的寫入點共四處，全部戳記（純寫、零讀）；掛 listener 的兩處捕代比對：

1. `setupAdmissionReveal` zebra hide（admission-data-loader ~:129-130）：寫 clipPath 前 `item.dataset.zbGen = String(++_zbGen)`（模組級 counter；admission 與 activities 兩檔各自counter 即可，不必共用）。
2. `revealZebraBg`（~:150-160）：戳新代 `const g`；`clear` 開頭 `if (item.dataset.zbGen !== g) { item.removeEventListener('transitionend', clear); return; }`。
3. `playAdmissionPanelExit` zebra 退場寫入（~:448-454）：兩段寫入前戳新代（needStart 直寫與 transition 寫共用同一次戳記即可）。
4. activities-data-loader reveal-IO zebra（hide 在 buildOneBatch ~:1683、揭在 reveal-IO ~:1662-1667）：hide 戳代；揭戳新代＋clrZebra 同 2 的比對。

### 1-C. 驗收（Part 1）

- 重現腳本情境：進 lectures → 捲到未揭區 → 立刻切走：退場窗內**不得**出現未揭 item 的完整靜態裸露；切到目標分頁後回切，pending 區照常 scroll-gate 進場。
- 快速連切 5 個 section（每次間隔 ~300ms）：無 row/zebra 裸露、無「滑出後彈回」、`data-pre-reveal` 不被舊回呼解鎖（切完抽查 DOM）。
- 正常慢速使用：進場 reveal／捲動揭露／search diff 進場全部照舊（gen 只擋「被接管後」的舊回呼，正常完成路徑代數相符、行為不變）。

---

## Part 2：開合順暢化（五項，互相獨立可分 commit）

### 2-A. `accordionBusy` 讓路 gate（四輪漏項補做）

- `list-accordion.js`：模組級 `let _busyUntil = 0;` export `isAccordionBusy()`＝`performance.now() < _busyUntil`。在 item 開（click 進兩段式序列起點）與收（closeListHeader 起點）都 `_busyUntil = performance.now() + (預估總時長 + 300ms 裕度)`；兩段式序列的每一段起跑再刷新一次（不必精準、寬鬆蓋過即可）。
- `activities-data-loader.js` `idleBuild`（~:1744）：比照 lastScrollTs 那行，加 `if (isAccordionBusy()) { idleHandle = setTimeout(idleBuild, 450); return; }`（import 該 getter）。

### 2-B. `bindMediaHover` 初始旋轉退 GSAP（activities-data-loader :136）

```js
img.style.transform = `rotate(${initDeg}deg)`;   // 純寫、零 computed 讀；原 gsap.set(img,{rotation}) 刪除
```

- hover 進出的 `gsap.to(rotation…)` **不動**——單元素首讀一次可接受；GSAP 能從 CSS transform rotate 正確接手，之後由它管（⚠️ 別改成 CSS 個別 `rotate` 屬性——gsap 動 rotation 會把個別屬性清成 none，見 reference_gsap_nullifies_css_individual_transform）。

### 2-C. `getScrollableBox` 結果快取（list-accordion.js :262）

- box→可捲判定改模組級快取：`let _boxCache = new WeakMap()`（key＝`.inner-scroll-scroll-col` 元素，value＝{oy 判定結果}），`getScrollableBox` 先查快取；`resize`＋矮橫向 gate change 時清空（`window.addEventListener('resize', () => _boxCache = new WeakMap())`＋registerPageCleanup 解綁）。SPA 換頁 box 重建＝WeakMap 天然失效。
- 呼叫端不動（:285/:363/:458/:588/:630 照常呼叫，成本從 N 次 computed 讀變 N 次 Map 查）。

### 2-D. `updateStickyTop` 量測快取（activities-data-loader ~:1578）

- `filterBar.offsetHeight` 在同一 viewport 下不變：量一次存模組變數，之後直接用；`resize`／section 切換（filter bar 可能不同）時失效重量。buildOneBatch 每批呼叫照舊、但不再每批 forced recalc。

### 2-E. `colScrollHandler` 去 selector 掃描（activities-search.js :363-374）

⚠️ **此檔有 user camp sticky WIP——只准動 `colScrollHandler` 這一個 closure，其餘一行不碰。**

- `document.querySelector('.activities-panel:not(.hidden) .activities-filter-bar')` 移出 handler：初始化與 section 切換時抓一次存變數（section 切換點＝現成的 `.activities-section-btn` click listener 或 export 一個 setter 由 section-switch 呼叫——**選最小改動**：handler 內做惰性快取＋`dataset` 失效戳記亦可，Opus 擇一）；handler 內只剩 scrollTop 讀＋classList 寫。
- 可再加 rAF gate（連續 scroll 事件一幀只跑一次）——低風險順手做。

### 驗收（Part 2）

- CPU 4x 節流重量：展開 item 期間 longtask 從「1009＋尾隨串」降到 **≤250ms 單顆內**；連開三個總 longtask 大幅下降且 tween 全程目視不掉幀；收起同準。
- 開合期間 idle builder 零開火（console 佐證）；停手 ~450ms 後恢復補建、全清單仍會建完（search `ensureFullyRendered` 兜底不變）。
- hover 圖片微旋（poster/gallery/album thumb）視覺不變：初始角度有、hover 歸 0、離開回去。
- 年份開合、sticky header 釘點、search bar 收展、矮橫向／手機路徑不受影響。
- `npm run check:ts` 零新錯。純 JS；不需 build:css。

---

## 紅線

1. 動畫視覺全部不變（進退場語彙、開合節奏、hover 微旋）；本輪只修中斷安全與讓路/快取。
2. `list-row-reveal.js` 的 API 簽名不變（callers 不用改）；gen 戳記是內部機制。
3. `activities-search.js` 只准動 `colScrollHandler` closure（user WIP 檔）。
4. 年份開合（initListYearToggle）實測乾淨——**不要動它**。
5. 四輪/五輪成果不回退：rows 不回 GSAP、search 守門不拆、idle builder 的 scroll 讓路保留（本輪只是加 accordion gate）。
6. content-visibility 不准加回。
