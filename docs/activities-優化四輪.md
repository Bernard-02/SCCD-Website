# activities 優化四輪：list rows 動畫全面 CSS 化（凍結根治）＋背景補建讓路

> 2026-09-02 四輪，給 Opus 執行；診斷已完成、**不需重新分析**。
> 前三輪（fallback 退場／P2-3 cache-warm／三輪 library 進場＋B-1 zebra）已執行，舊 md 已刪（備份在 scratchpad）。
> user 實機回報：①切到 lectures 這種大分頁仍卡 ~5s（內容有出來）②該分頁往下捲、hover、展開 item 都明顯卡頓。
> user 同時確認：B-1 zebra 改 CSS 後「不會跟 gsap 打架、也比較順」→ 本輪把同一路線推到 rows（最大宗）。

---

## Part 0：確診（實測數據，直接引用）

本地工作樹（含三輪＋B-1）、fresh node server、headless Chrome **無 CPU 節流**，冷切 exhibitions→lectures（237 筆）：

- **切換瞬間一顆 9,035ms 的單一 longtask**（≒user 實機「卡 5 秒」；CPU 4x 節流下同場景放大成 ~103s 單一 task）。
- 其後**每 ~2s 一顆 1,000~2,700ms 的 task，一路持續到 t≈44s**（237 筆全建完為止）。捲動/hover/展開的卡頓＝互動撞上這些背景凍結窗，不是互動本身貴。
- CDP Profiler self-time：**`Td @gsap.min.js`（GSAP 內部 getComputedStyle）27,425ms 壓倒性第一**；(program)（native style recalc/layout）6,340ms；`get clientWidth` 587ms（marquee 量測）；其餘全部 <200ms。
- **圖片已排除**：lectures poster 190 張共 21.3MB（179 張已 webp、平均 112KB、僅 1 張 1MB BMP 殘留）；展開 strip 圖 1,638 張共 137MB、全部 <500KB、99% webp。不是圖的問題。

### 歸因鏈（為什麼 P2-3 之後還這麼卡）

P2-3 讓「同一批元素被重複觸碰」時 GSAP cache 常溫。但**新建的 row 對 GSAP 永遠是冷的**：首觸 `gsap.set`/`setupClipReveal` 逐列讀 computed style，页面 DOM 巨大（多 panel 全渲染）→ 每讀一次＝一次全頁 style recalc（50~120ms）。兩個現場：

1. **切換路徑**：`setupAdmissionReveal(container, { limit: 64 })`（[admission-data-loader.js:82-133]）對最多 64+ 列做 `setupClipReveal`（wrap＋gsap.set）＋fromTop 翻向 `gsap.set(row,{yPercent:-100})`（:121）＝~64 次冷觸交錯 DOM 寫入 → **切換那顆 9s 大 task**。
2. **lazy／idle 補建路徑**：每批 `buildOneBatch`（[activities-data-loader.js:1676-1688]）對新 row `setupClipReveal(hide:true)`（:1681）＝每批 20~30 次冷觸 → **每批 1~2.7s**。而 idle builder 用 `requestIdleCallback(fn, { timeout: 500 })`（:1730）——activities 頁 marquee/flag 常駐動畫讓瀏覽器幾乎沒有真 idle，**每批都走 500ms timeout 強制開火、完全不看使用者是否正在捲動/hover/開 accordion** → 捲動時每 1~2 秒凍一下。

結論：**冷觸是結構性的，cache-warm 救不了；唯一根治＝rows 動畫退 GSAP、改 CSS**（B-1 zebra 已驗證此路線：compositor 接管、longtask 不凍幀、零 computed 讀）。

---

## Part 1：rows 全面 CSS 化（核心）

### 原則（三條，全部硬性）

1. **出生自帶隱藏態**：遮罩 wrapper 與 hidden class 直接烙進 `buildItemHtml` 的 HTML string。建 row 時**零 JS touch、零測量、零 GSAP**——這比「JS 直寫 style」更進一步：連逐列碰 DOM 都免了，冷觸成本歸零。
2. **揭＝CSS transition（transform，compositor）**；stagger＝inline `transition-delay`；收尾 `transitionend` 清 transition/delay（`e.target`＋`e.propertyName==='transform'` 守門）；**中斷/snap＝`transition:'none'`＋直寫終態**（＝killTweensOf 等價物；先關 transition 再寫，否則從當前態反向走全程）。
3. **GSAP 全面退出 list rows**。保留 GSAP 的：section nav chips、hero、accordion 高度 tween、marquee 回彈（bindMarqueeReturn）、icon swap——不動。

### 1-A. CSS（`css/components/lists.css`，改完必 `npm run build:css`）

```css
/* rows 遮罩（setupClipReveal 動態 wrap 的靜態版；scope 在 activities/admission 清單容器內） */
.list-reveal-mask { overflow-y: clip; overflow-x: visible; }
/* 出生隱藏態（下進場預設；-top＝fromTop 翻向） */
.list-reveal-row.row-hidden     { transform: translateY(110%); }
.list-reveal-row.row-hidden-top { transform: translateY(-110%); }
/* 揭場（對齊 playClipReveal：0.9s power3.out；stagger 用 inline transition-delay） */
.list-reveal-row.row-revealing  { transition: transform 0.9s cubic-bezier(0.215, 0.61, 0.355, 1); }
@media (prefers-reduced-motion: reduce) {
  .list-reveal-row.row-hidden, .list-reveal-row.row-hidden-top { transform: none; }
  .list-reveal-row.row-revealing { transition: none; }
}
```

- 時長/ease 對照：`playClipReveal`＝0.9s power3.out（CSS 近似 `cubic-bezier(0.215,0.61,0.355,1)`，視覺對齊即可）；admission master-timeline 的 rows 段沿用其現行 duration（DUR 常數值照搬成秒數字串）。
- ⚠️ 出場（exit）**不建 class**、用 inline transition 直寫（方向隨機、時長不同，class 組合爆炸不值得——同 B-1 zebra 作法）。

### 1-B. `activities-data-loader.js`

1. **`buildItemHtml`**：rows 烙靜態遮罩＋hidden class：
   `<div class="list-reveal-mask"><div class="list-reveal-row row-hidden">…</div></div>`
   - 現在 wrapper 是 `setupClipReveal` 動態包的——烙進 HTML 後，**該容器的 rows 不再經過 setupClipReveal**（避免二次包裹；setupClipReveal 有 idempotent 判斷但別依賴它，直接不呼叫）。
   - 初載（useScrollTrigger 路徑）與 lazy 批一律出生藏；揭一律走下面的 reveal 動作。
2. **`buildOneBatch`（:1676-1688）**：刪掉 `setupClipReveal([...], { hide: true })`（:1681）——rows 已出生藏。zebra 直寫（:1683）保留。整個 buildOneBatch 從此**零 GSAP**。
3. **reveal-IO（:1653-1672）rows 段**：`playClipReveal(rows, { clear:false, onComplete })` 改成：
   ```js
   rows.forEach((row, i) => {
     row.style.transitionDelay = `${i * 0.08}s`;          // 同 playClipReveal 跨列 stagger
     row.classList.add('row-revealing');
     row.classList.remove('row-hidden', 'row-hidden-top'); // 起點出生已 commit（IO 隔幀 fire）→ 同步移除即 transition
     const clr = (e) => {
       if (e.target !== row || e.propertyName !== 'transform') return;
       row.classList.remove('row-revealing'); row.style.transitionDelay = '';
       row.removeEventListener('transitionend', clr);
     };
     row.addEventListener('transitionend', clr);
   });
   it.removeAttribute('data-pre-reveal');   // 原 onComplete 的事，掛最後一列的 transitionend 或直接同步移除皆可
   ```
4. **deep-link `_lazyRenderAll`（:1714）**：全建後，除目標 item 附近可視區外，其餘新 row **instant 就位**：`transition:'none'` guard＋批次 `classList.remove('row-hidden')`（零讀取、不播動畫——deep-link 要的是直達）。
5. **fill／切換 reveal 的 rows 呼叫端**：凡 `playClipReveal(...)`／`gsap.set(rows,{yPercent:…})` 觸碰 activities 清單 rows 的（:1004、:1014 一帶），一律改 class 版（同上 reveal 動作；instant 場景＝transition none＋移 class）。`scroll-animate.js` 本身**不動**（faculty 等他頁照用）。

### 1-C. `admission-data-loader.js`

1. **`setupAdmissionReveal`（:82-133）**：改純 class 寫入、零 GSAP、零讀取：
   - `setupClipReveal(rows, { hide })`（:105）→ rows 逐列 `classList.add('row-hidden')`（純寫）。⚠️ admission/news 的 rows 是「上輪已揭、現要重藏」——它們身上**沒有**遮罩 wrapper？不對：wrapper 烙在 HTML（1-B-1 同一份 buildItemHtml／admission 自己的模板也要烙）→ 檢查 admission/news/camp 的 row HTML 產生處，同樣烙 `.list-reveal-mask`＋出生 hidden 由各自初載 reveal 揭。
   - fromTop 翻向 `gsap.set(row,{yPercent:-100})`（:121）→ `row.classList.replace('row-hidden','row-hidden-top')`（藏的時候本來就剛 add 過 class，直接換）。
   - zebra 段（:129-130）已是直寫，不動。limit 64 保留（少寫也省）。
   - 函式開頭 `if (typeof gsap === 'undefined') return` 改為不依賴 gsap（CSS 版不需要）。
2. **`playAdmissionPanelReveal`（:190 起）rows 段**：master-timeline 對 rows 的 tween → 逐 group 算出原本的起跑時間 `at`，寫成 inline `transition-delay: ${at}s`＋加 `.row-revealing`＋移 hidden class（同 1-B-3 pattern）；zebra 已走 `revealZebraBg`（B-1）不動。ScrollTrigger 分支：**trigger 保留**（onEnter 才揭），onEnter 回呼內改 class 版揭。`prefersReducedMotion` 分支（:196 `gsap.set(rows,{yPercent:0})`）→ 批次移 class（transition:none guard）。
   - ⚠️ 語彙保序：底色→文字交錯（user 2026-06-21）、整筆同向（user 2026-07-17）——方向由 hidden/-top class、節奏由 delay 對齊，視覺不得變。
3. **`playAdmissionPanelExit`（:397 起）rows 段**：fromTo 顯式起點 → CSS 版：`transition:'none'`＋確認 rows 在顯示終態（有 hidden class 的直接跳過＝本來就沒現身）→ force reflow 一次 commit → 設 `transition: transform {dur}s ease-in`＋加回 hidden class（或直寫 translateY）→ 完成後（transitionend 或 switch 流程既有時序）清 transition。viewportCull 範圍外＝transition none＋直接 add hidden class（snap）。
4. **PASS-2A touchedRows**（P2-3 加的 regex 過濾）：不再讀 `style.transform`，改看 class——「有 `.row-hidden/-top` 或 `.row-revealing` 的才要處理」；原 `gsap.set(touchedRows,{yPercent:0})` → transition none＋移 class。

### 1-D. `activities-search.js`（⚠️ 檔內有 user WIP——admission camp sticky，只動以下兩處）

- `revealAllInstant` 一帶 `gsap.set(panel.querySelectorAll('.list-reveal-row'), { yPercent: 0 })`（:25）→ transition none guard＋批次移 hidden class。
- `animateMatches` 對新命中 rows 的揭（若有 GSAP touch）→ 同 class 版 reveal。

### 1-E. `activities-section-switch.js`

- 全檔 grep `.list-reveal-row`／`playClipReveal`／rows 的 `gsap.set`：一律換 class 版（預期 ~2 處；nav chips 的 NAV_CHIP tween **不動**）。

---

## Part 2：背景補建讓路（idle builder / lazy batch）

rows 零 GSAP 後，每批剩 `insertAdjacentHTML`＋補綁＋marquee 量測——預估 <150ms，但仍要讓路：

1. **互動讓路 gate**（activities-data-loader idle builder :1730-1740）：
   - panel scroller 掛 scroll listener（rAF-throttle＋`registerPageCleanup`）記 `lastScrollTs`；accordion 開合 tween 起訖記 busy 旗標（list-accordion 有現成 hook 就用、沒有就 export 一個 setter）。
   - `idleBuild` 開頭：`if (Date.now() - lastScrollTs < 400 || accordionBusy) { idleHandle = setTimeout(idleBuild, 450); return; }`（同 :1735 panel 隱藏重試 pattern）。
   - `{ timeout: 500 }` 放寬到 `{ timeout: 2000 }`——讓路優先，全建慢個十幾秒無妨（搜尋前有 `ensureFullyRendered` 兜底）。
2. **marquee 量測相位**：`get clientWidth` 587ms 佐證批內仍有讀寫交錯——檢查補批路徑的 `applyMarqueeOverflow`／量寬呼叫，改「先全讀、後全寫」兩段式（同 reference_gsap_set_per_item_loop_reflow_thrash 定式）；若已兩段式則把補批的 marquee 量測 defer 到該批 reveal-IO fire 時（進視窗才量）。
3. **驗收線**：切換後背景批 task ≤150ms；捲動中/accordion tween 中零批次開火。

---

## Part 3：hover／展開

- **不需獨立修**：hover 與展開的卡頓主因＝撞上 Part 0 的背景凍結窗（Part 1 把批次成本歸零、Part 2 讓路後自然解）。rows CSS 化後 DOM 不再被 GSAP 高頻弄髒，殘餘的單次 forced recalc（hover 起 marquee 回彈 tween 的首讀）會便宜一個數量級。
- 展開的 height tween（list-accordion）**保留 GSAP**（height 需量測補間、CSS 做不到）；Part 2 的 accordionBusy gate 讓 tween 期間無背景批搶主執行緒。
- 改完若展開仍卡：回報量測數據，**不要**自行加 content-visibility（紅線，09-01 已撤回）。

---

## Part 4：附帶（已確診）：library「fetch documents 很久」

- **原因**：library 進頁 `initLibraryPanels` 同時 init 四 panel，其中 Album 的 `ALBUM_SOURCES`（[library-panels.js:2096-2110]）＝**12 條全量 query**（9 個 activities collection＋degree-show＋summer-camp＋library_album）跟 documents/press/awards 併發——HTTP/1.1 每 host 6 連線＋弱機單執行緒 Node 排隊，`library_documents` 被拖著等（實測併發下 queue 276~990ms、單發僅 0.45s）。另 Directus 回應**無 gzip**（documents 122KB raw、帶 Accept-Encoding 也不壓）。
- **修（前端小改）**：`loadAlbumItemsCached()`（:2132）觸發時機延後——`initAlbumPanel` 只建骨架不 load；改成「①切到 Album tab 時觸發（showLibPanel/onTabSwitch album 分支 await 它再 render）②進頁後 idle（如 `setTimeout(…, 8000)`）背景預暖」二擇一併存（single-flight cache 保證只打一次）。award ref→album lightbox 路徑（:558/:622）本來就 await 同一 promise，自然等到。⚠️ 快取語意（module 級、進頁不清）不動。
- **gzip**：nginx 設定（IT 端開 `gzip on` + `gzip_types application/json`），非前端 code，註記給 user 開票即可。

---

## 驗收清單

- **切換**：冷切 lectures，PerformanceObserver longtask——切換窗 max task 較 9,035ms 大幅下降（目標 ≤400ms；首批 render+bind 是地板）；切換後 40s 內不再出現 >300ms 的週期性 task。
- **捲動**：lectures 連續捲 60 步，longtask total 較改前（每 2s 一顆 1~2.7s）數量級下降；捲動中 idle builder 零開火（console 佐證或 longtask 消失）。
- **hover / 展開**：hover 掃 12 item 無 >200ms task；展開 item tween 期間無背景批 task。
- **視覺不變**：rows 由下（或翻上）滑入、0.9s、stagger 節奏、底色→文字交錯、整筆同向、exit 方向——逐一目視對照（錄影逐幀比對切換前後）。⚠️ headless 幀率是假象（240Hz），一律以 longtask 量化＋實機目視。
- **回歸**：9 section 全綠；deep-link 直達第 20+ 筆（instant 就位不播動畫）；search 輸入/清空/No Result；年份收合再 lazy 補批不重置 chevron；admission news/camp 初載 ScrollTrigger 揭正常；reduce-motion 直接到位；手機＋矮橫向行為一致；`npm run check:ts` 零新錯。
- **library（Part 4）**：進頁 Network 只見 4 panel 自己的 query（album pool 延後）；documents queue 時間下降；切 Album tab 資料照常出、award ref 開 album lightbox 照常。

## 紅線

1. 動畫語彙（滑入方向/時長/stagger/交錯序）不得變——這輪只換引擎不換視覺。
2. lazy render（首批 15＋sentinel 續建）、viewport cull、latest-wins、三輪 library 進場、B-1 zebra、P2-3 的 zebra 直寫——全部不回退。
3. content-visibility 不准加回（09-01 實測反噬）。
4. `scroll-animate.js` 的 GSAP 版 helper 不動（faculty/其他頁在用）；activities/admission 改走 class 版。
5. 改 `lists.css` 後必 `npm run build:css`；commit 依部分 commit SOP（stash 不相干 css 源→build→commit→pop）。
6. `activities-search.js` 內 user WIP（camp sticky）不得動到。
