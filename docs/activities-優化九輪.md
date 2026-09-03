# activities 優化九輪：開合動畫窗淨空 ＋ lectures 副標純 clip 收合

> 2026-09-03，給 Opus 執行；診斷已完成（4x 節流實測＋CDP Profiler），不需重新分析。
> user 裁示：①lectures 開合不夠順——尤其「開著 A 點 B」時關 A 開 B 的接續會卡；②lectures 副標收起目前是 fade out，**只要 clip-reveal 收起**（不要透明度變化）。

---

## Part 0：確診（4x 節流；lectures、靠近已建 frontier 開合）

场景 A（單開靠 frontier 的 item）：align 捲動把 sentinel 拉進 600px 邊界 → **`fill()` 同步連建 2 批（20 筆）＝685ms task 砸在動畫窗**，rAF gap 927ms（畫面凍近 1s）。
场景 B（開著 A 點 B）：①收 A 的 `gallery:check`（+320ms 派發）落在對齊/展開中段 → 逐 wrap 讀寫交錯，**Profiler：`get clientWidth` self 2863ms**；②search bar 收合 0.3s transition 期間 filter-bar RO 每幀 `measureBar`＋`refreshStickyPinObservers` → **`getPropertyValue` self 1525ms**（髒 DOM 上強制 style recalc）；③展開尾端仍有 973ms task（同組讀寫風暴）。

四個修法互相獨立、全是「把重活挪出動畫窗」，不動兩段式結構與任何時長。

---

## Part 1：lectures 副標收起＝純 clip-reveal（CSS，需 `npm run build:css`）

### 現況
收合態帶 `opacity: 0`＝fade：
- 桌面 `css/components/lists.css` **:684-688** `#panel-lectures .list-header.active > * > .clip-reveal-wrapper:has(.list-subtitles) { grid-template-rows: 0fr; opacity: 0; margin-top: -0.5rem; }`
- 手機 **:351-355** 同型（`.active.is-pinned` scope）
- 兩個 base wrapper 規則（**:340**、**:672**）的 transition 列含 `opacity var(--dur-fast) ease`

且內容是 top-anchor：row 收合時文字原地被下緣擦掉（clip-path 手感）＋fade——不是本站的 clip-reveal（文字要「位移」著被遮罩吃掉）。

### 修法（兩個 media block 都改，桌面＋手機同語言）
1. 收合態規則**刪 `opacity: 0`**（margin-top: -0.5rem 保留＝gap 閉合）。
2. 兩條 transition 列**拿掉 opacity** → `transition: grid-template-rows var(--dur-fast) ease, margin-top var(--dur-fast) ease;`
3. wrapper 直接子層（現有 `> * { min-height: 0; min-width: 0; }` 規則，**:342-348** 與 **:674-680**）補三行做**底部貼齊**：
   ```css
   display: flex;
   flex-direction: column;
   justify-content: flex-end;
   ```
   原理＝year-toggle 收合同配方（list-accordion.js :31-34 註解）：內容底邊貼住收合中的 row 底邊 → row 縮 = 整塊**往上滑出**、溢出上緣被 wrapper 的 overflow-y:clip 剪掉；展開態 row 高＝內容高 → justify-end 是 no-op、零位移。展開（關 item 時副標回來）自動成反向「從 title 底下滑入」。
4. 直接子層是 `.list-reveal-row`（setupClipReveal 包的）：display 改 flex 不影響 list-row-reveal 的 transform 機制（transform 與 display 正交）；子行間距全用 margin-bottom、無 margin collapse 依賴 → flex 化間距不變。

### 驗收
- lectures 開 item：副標整塊往上滑出被 title 下緣吃掉，**全程不透明**；關 item 反向滑回。
- 手機捲過 pin 線收副標同語言；其他 section（不收副標）零變化。
- 非 lectures 頁（admission camp 等 loadListInto 生態）視覺零變化（收合規則本就 lectures scope；子層 flex 化是排版 no-op，仍列入目視點）。

---

## Part 2：`fill()` 開合讓路 gate（activities-data-loader.js）

- 現況：sentinel IO 的 `fill()`（**:1740-1757**）無任何 gate——開合的對齊捲動把 sentinel 拉進 600px 邊界就同步連建（實測一口氣 2 批 685ms）。idleBuild 三個 gate 都有（:1816-1818），fill 一個都沒有。
- 修（fill 開頭加，同 idleBuild 語彙）：
  ```js
  let fillDeferred = false;
  const fill = (retries = 0) => {
    if (!container.isConnected) return;
    // 九輪：開合動畫中讓路（idleBuild 已有同 gate、fill 漏了）。spacer 已把捲動空間撐住，晚建不跳版；
    // 建出來的 item 仍走 born-hidden + reveal-IO 進場（非 pop）。
    if (isAccordionBusy()) {
      if (!fillDeferred) { fillDeferred = true; setTimeout(() => { fillDeferred = false; fill(); }, 300); }
      return;
    }
    ...原邏輯不動
  ```
- `isAccordionBusy` 本檔已 import（:1817 在用）。600px 邊界、批量、guard 60 都不動。
- **不** gate 切換窗（`__sccdActSwitchBusyUntil`）：切入新 section 首屏不足時 fill 必須立刻補，這是正確性。
- 已知取捨：開合期間貼近 frontier 的下方未建區最晚 ~2s 才出現，出現時帶進場動畫、且 spacer 撐住不會捲跳——與「動畫期間讓路」既定哲學一致。

## Part 3：`gallery:check` 兩處派發延到序列完（list-accordion.js）

- 現況兩個派發點都落在動畫窗：①close onComplete 的 `setTimeout(..., 320)`（**:505**）——cross 開合時 close 在序列前段結束、+320ms 正好砸進對齊/展開中段（實測 t=999 落地、緊跟 128/194/419ms task）；②`doExpand` onComplete（**:730**）——busy 窗內、展開剛停就派發＝尾端 973ms 凍結。
- 病因：checkOverflow（activities-data-loader :865-885）逐 wrap「讀→寫→讀 offsetWidth→寫」交錯，一個 lectures item 十幾個 wrap＝十幾次全頁 forced reflow；在髒 DOM（tween 進行中）上每次更貴。**不重構 checkOverflow**（pair/回彈/RO 生態，動它過度工程化）——只把派發挪到 DOM 乾淨、無動畫的時刻。
- 修：module 級小 helper，兩個呼叫點共用：
  ```js
  // 九輪：checkOverflow 逐 wrap 讀寫交錯＝大 panel forced reflow 連環（4x 實測 clientWidth self 2.8s）。
  // 延到開合序列完（非 busy）才派發：DOM 乾淨、不砸動畫窗。marquee 裝飾性、晚 ~0.5s 無感。
  function dispatchGalleryCheckWhenIdle(item, delay = 0) {
    const fire = () => {
      if (!item || !item.isConnected) return;
      if (isAccordionBusy()) { setTimeout(fire, 250); return; }
      item.dispatchEvent(new Event('gallery:check'));
    };
    setTimeout(fire, delay);
  }
  ```
  - :505 → `dispatchGalleryCheckWhenIdle(workshopItem, 320);`（320 起跳理由不變：等 title translateX 復位）
  - :730 → `dispatchGalleryCheckWhenIdle(workshopItem);`
- 開啟 item 內 gallery 的 chevron 顯隱不受影響：track 自己的 ResizeObserver（activities-data-loader :631/:681）在展開時獨立 fire，不靠 gallery:check。
- 自關（單獨收起）情境：busy 至 close+0.8s、派發 +320ms → 最多多等一輪 250ms，marquee 重量晚一拍、無感。

## Part 4：filter-bar RO 零讀化＋pin-IO refresh debounce（activities-data-loader.js :1619-1633）

- 現況：`.bar-hidden` 的 0.3s 高度 transition 讓 bar 的 RO **每幀** fire → 每次 `measureBar()`（讀 offsetHeight＋getComputedStyle top＝forced layout）＋ `updateStickyTop()` → `refreshStickyPinObservers()`（每 fire 都因移動 >2px 重建 pin-IO、`getListStickyTop` 讀 computed）——在 tween 髒 DOM 上＝`getPropertyValue` self 1525ms 的來源。
- 修兩點：
  1. **RO 回呼零讀取**：高度直接取 entry，不再叫 measureBar：
     ```js
     new ResizeObserver((entries) => {
       const bs = entries[entries.length - 1]?.borderBoxSize?.[0];
       if (bs) _barH = bs.blockSize; else measureBar();   // entry 免讀；極舊瀏覽器 fallback 照舊
       updateStickyTop();
     }).observe(filterBar);
     ```
     `_barTop`（computed top）只跟 viewport 變：加一個 window resize listener 把 `_barH = -1`（下次 updateStickyTop 走 measureBar 全量重讀），`registerPageCleanup` 解綁。
  2. **refresh 改 trailing debounce**：updateStickyTop 內的 `refreshStickyPinObservers(container)` 改
     ```js
     clearTimeout(_refreshTid);
     _refreshTid = setTimeout(() => refreshStickyPinObservers(container), 150);
     ```
     （`let _refreshTid = 0` 放 measureBar 旁。）bar transition 進行中只寫 var／year-toggle top（純寫、跟著 bar 平滑走），pin-IO 等值穩定、DOM 乾淨才一次重建。這是 08-16「refresh 保留 is-pinned」修法的續章：當時留下的每幀重建成本這次歸零；buildOneBatch 路徑的 refresh 也順帶合流成 trailing 一次。
- 行為守恆：pin 線 var 仍每幀跟著 bar 走（開 item 對齊不變式不受影響）；is-pinned 判定最多晚 ~0.45s 校正（IO 初始 delivery 校正、08-16 機制原樣）。

---

## 驗收（4x 節流同場景重跑）

1. 靠 frontier 單開：點擊→+2.4s 窗內 max longtask **685ms → ≤200ms**；busy 窗內零 `.list-item` 增量（fill 讓路）；rAF gap >200ms 歸零。
2. 開 A 點 B：全序列目視「關→對齊→展開」連續無吃幀；`gallery:check` 時戳全部落在 busy 結束後。
3. 副標：Part 1 驗收如上；search bar 開合期間副標不「分段卡卡」（08-16 案例不回歸）。
4. 開 item 對齊行為不回歸：admission 開 item 對齊 box 頂（06-30）、手機/矮橫向落點（07-04）、短清單 spacer 直達 pin 線；自關靠底 item 不跳（scrollFollow）。
5. 開合後 hover marquee／gallery chevron 照常（晚 ~0.5s 起算可接受）。
6. `npm run build:css`（Part 1）；`npm run check:ts` 零新錯；手機＋矮橫向過一輪。

## 紅線

1. 兩段式開合結構、所有 duration/ease、對齊不變式（proceedOpen 內註解）**一律不動**——本輪只挪工作時序。
2. checkOverflow／marquee 內部不重構；只動派發時機（Part 3）。
3. fill 的 600px 邊界、LAZY_BATCH、guard 60 不動；切換窗不 gate fill。
4. 五～八輪成果不回退（idleBuild 三 gate、gen 戳記、born-hidden、deep-link 分幀照舊）。
5. Part 1 是本輪唯一 CSS 改動＝唯一需要 build:css 的部分。
