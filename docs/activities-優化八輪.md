# activities 優化八輪：切換分拍（動畫完整跑）＋ search zebra 重排 ＋ deep-link 早停

> 2026-09-03，給 Opus 執行；診斷已完成、不需重新分析。
> user 裁示：①大分頁（lectures）切走仍有點卡——**「適當讓動畫完整跑完，不需要在短時間內完成」**（對齊既有偏好：分階段敘事、總長 2~2.5s 可接受）②**search zebra bug**：結果的斑馬紋要按「結果順序」重新交錯，不是保留原本 default 順序的顏色。③順帶復查 search／deep-link——結論：僅剩 deep-link 全建大 task 一項要修，其餘已到位。

---

## Part 0：確診（CPU 4x 節流實測，除 4 ≒ 實機）

從全建的 lectures 切到 competitions：一串 ≤90ms 小 task（健康）＋ **770ms、2061ms 兩顆大的**。歸因（total-time）：

- `loadPanel` 1271ms → `initListAccordion` 1228ms、`initListYearToggle` 755ms、marquee reconcile ~840ms——**進場側的同步 build 鏈跟動畫擠在同一窗**：exit 尾／reveal 頭被吃幀。
- `idleBuild`/`buildOneBatch` 1835ms 疊在切換窗——idle builder 有捲動 gate、accordion gate，**沒有切換 gate**。
- search／deep-link 復查：五輪守門、promise 化、12×100ms 兜底輪詢、searchText 欄位、diff 動畫皆已落地無需再改；唯 `_lazyRenderAll`（activities-data-loader :1763-1772）是**同步 while 全建**——idle 未建完時 deep-link 直開＝一顆大 task（Part 3 修）。

---

## Part 1：切換分拍——重活挪出動畫窗

### 1-A. idle builder 加「切換讓路」gate（第三個 gate，同現有 pattern）

- `activities-section-switch.js` export `isSectionSwitching()`：現有 `switching` 旗標為基底，但要**延到 reveal 完成才解**（用 busyUntil timestamp 最簡單：switch 起點 `_switchBusyUntil = performance.now() + 2500`，reveal onDone 再提前歸零）。
- `idleBuild`（activities-data-loader ~:1789）開頭比照 lastScrollTs／accordionBusy 那兩行，加 `if (isSectionSwitching()) { idleHandle = setTimeout(idleBuild, 450); return; }`。

### 1-B. 時序分拍（冷 section）

現況＝exit(0.4s) → swap → **同步一大塊**（renderBatch＋bindInteractions＋initListAccordion＋initListYearToggle＋updateStickyTop）→ reveal 即刻。改為四拍：

1. **拍 1 exit**：完整跑完（await 既有 exit promise，時長不改）。
2. **空拍 ~150ms**：乾淨空白呼吸（`await new Promise(r => setTimeout(r, 150))`），也給瀏覽器一幀喘息把 exit 最後一幀畫完。想更舒緩只調這個常數（命名 `SWITCH_BEAT_MS`）。
3. **拍 2 build（最小同步集）**：swap display → `renderBatch(FIRST_BATCH)`＋輕量 bind（HTML＋委派級）。**`initListAccordion` 與 `initListYearToggle` 移出同步鏈**——`data-pre-reveal` 期間互動本來就全鎖，兩者延到拍 3 起跑後**分幀**執行（沿用 marquee `processWrap`＋`performance.now()` 每幀 ~8ms budget 的現成 pattern；以 year-group／header 為 chunk 單位；`container.isConnected` 守衛離頁自停；兩者 idempotent 守衛已有＝P1-1）。
4. **拍 3 reveal**：完整 0.9s stagger 跑好跑滿。**解鎖順序保險**：reveal 的 onDone（移 data-pre-reveal）要 `await` accordion/year-toggle 分幀完成的 promise 才執行——0.9s 窗遠大於分幀總量，正常無感；極端下寧可晚解鎖也不能「可點但 accordion 沒綁」。

warm section（已建）：拍 1 → 空拍 → 拍 3，本來就順、行為不變。

### 1-C. 驗收線

- 4x 節流同場景重量：切換窗 max longtask **2061ms → ≤400ms**；exit／空拍／reveal 三拍目視完整無吃幀；切換窗內 idleBuild 零開火。
- 總時長 exit(0.4)＋空拍(0.15)＋reveal(0.9)≈1.5s；若 user 實機仍嫌趕，只調 `SWITCH_BEAT_MS`／exit 時長常數（標注位置），不動結構。

---

## Part 2：search zebra 依結果序重排（bug fix）

### 現況與病因

zebra 是**建行時**全域連續交錯（`setZebra` :1637 `container._zebraIdx` 跨年份組連續；非 lazy 路徑 :1652 同語意）。`applyGenericSearch` 只做 display 顯隱＋排序，**從不重排 zebra** → 結果序出現連灰／連白。

### 修法

1. 新 helper（activities-data-loader export，或 search 檔內小函式皆可）：

```js
// search 顯隱後按「可見 DOM 序」重新交錯；同時清掉殘留 inline clip（pending/被打斷的 item 帶 inset(100%)
// 會把整筆裁隱形——搜尋結果必須立即完整可見）＋ zbGen 換代（作廢舊 zebra 動畫回呼，六輪機制）。
export function restripeVisibleZebra(panel) {
  const visible = [...panel.querySelectorAll('.list-item')].filter(it => it.style.display !== 'none');
  visible.forEach((it, i) => {
    it.classList.toggle('list-item-zebra', i % 2 === 0);
    if (it.style.clipPath) { it.style.transition = 'none'; it.style.clipPath = ''; }
    it.dataset.zbGen = nextZbGen();   // 六輪 counter，export 個小 helper 或同檔直接用
  });
}
```

2. 呼叫點（`applyGenericSearch` 兩分支）：
   - **命中分支**：排序＋顯隱寫完、`animateMatches` 之前呼叫——matched rows 照常滑入、zebra 底色按新交錯直接現（與 3-3 現行「zebra 直寫清」一致、無動畫）。
   - **空查詢還原分支**：`originalOrders` 還原＋顯隱還原之後呼叫——還原後 DOM 序＝原始序 → restripe 結果**天然等於 default 交錯**，不需另存舊態。
3. 判可見用 `style.display !== 'none'`（applyGenericSearch 自己寫的 inline display；零 layout 讀、panel 隱藏時也正確）。
4. admission camp 共用 `applyGenericSearch` → 一起生效（camp 清單同為 loadListInto zebra，行為一致＝預期）。

### 驗收

- lectures 搜尋任意詞：結果第 1 筆灰、第 2 筆白、嚴格交錯（跨年份組連續）；追加字元縮小結果後仍交錯；刪字放寬後仍交錯；**清空後回原始 default pattern**。
- 捲到 pending 未揭區 → 立刻搜尋：結果全部立即完整可見（殘留 clip 已清、無隱形筆）。
- camp 頁搜尋同驗；year label 與 zebra 底色的視覺關係不變；No Result ↔ 有結果往返正常。

---

## Part 3：deep-link 建到目標——**分幀**版（不管目標多深都零大 task）

- 現況（:1763-1772）：同步 `while` 全建剩餘（lectures 237 筆）＝idle 未建完時 deep-link 直開一顆大 task。
- ⚠️ **「早停」不夠**（user 09-03 指出）：捲到深處的 item 前必須先建完它上方全部（它們佔位）——目標在第 200 筆時「建到目標」≈全建，大 task 照舊。→ 改**分幀建**：每幀 ~8ms budget 建 1~2 批、rAF 續跑，直到目標出現（或全建完）。200 筆 ≈ 20 批 ≈ 0.3~0.6s 分散在幀間＝零 longtask；deep-link 定位晚零點幾秒，被換頁/hero 時間墊掉＝無感。
- 修（有 targetDomId 走分幀回 Promise；無參數維持同步全建＝search 語意不變）：

```js
container._lazyRenderAll = (targetDomId = null) => {
  const buildOne = () => {
    const ni = renderBatch(LAZY_BATCH);
    bindInteractions(container, { autoReveal: false, incremental: true });
    ni.forEach(it => it.removeAttribute('data-pre-reveal'));
  };
  const finish = () => {
    updateStickyTop();
    if (typeof onLazyBatch === 'function') onLazyBatch();
    if (cursor >= flat.length && io) io.disconnect();   // ⚠️ 沒建完時 io/idle 不拆，餘量照常背景續建
  };
  if (!targetDomId) {   // search／ensureFullyRendered：同步全建（語意不變）
    while (cursor < flat.length && container.isConnected) buildOne();
    finish();
    return Promise.resolve(true);
  }
  return new Promise(resolve => {   // deep-link：分幀建到目標
    const step = () => {
      if (!container.isConnected) { resolve(false); return; }
      const budget = performance.now() + 8;
      while (cursor < flat.length && performance.now() < budget) {
        buildOne();
        if (document.getElementById(targetDomId)) { finish(); resolve(true); return; }
      }
      if (cursor >= flat.length) { finish(); resolve(true); return; }
      requestAnimationFrame(step);
    };
    step();
  });
};
```

- 呼叫端：`navigateToItem` 傳 `item-${itemId}` 並 **await**（section-switch ~:183 的 forEach 改收集 promise、`Promise.all` 後才進既有 12×100ms 兜底輪詢——輪詢保留當保險）。
- **分幀樓地板**：單批（10 筆，rows 出生自帶 hidden、零 GSAP）在弱機約 30~60ms——budget 檢查是「批間」不是「批內」，單批本身就是 chunk 下限，可接受；別再切小批（批次開銷反而變多）。
- **捲動負荷本身不需擔心**（一併回答）：deep-link 落定後往下捲＝sentinel 逐批（10 筆/批、四輪後零 GSAP 冷觸）＋捲動讓路 gate；往上捲＝已建區零工作；`_lazyRenderAll` 建出的 item 直接可見（無 reveal-IO 掛載）＝捲過無動畫負擔。
- 驗收：idle 未建完時直開 `?section=lectures&item=<最末段 id>`（**刻意挑最深的**）：全程無 >150ms task（4x 下）、定位正確、目標 accordion 可開；建到一半離頁（點別的 nav）不炸（isConnected 收斂）；search 首鍵行為不變。

---

## 紅線

1. 動畫語彙與時長常數只在標注點（`SWITCH_BEAT_MS`／exit dur）可調；exit→空拍→reveal 的分拍結構不得把重活塞回動畫窗。
2. `ensureFullyRendered`（search）維持同步全建語意——有 idle 預建墊背、實際撞上機率低，**不要**為它做分幀＋二次篩選的複雜化。
3. restripe 只動 activities/admission 生態（library 有自己的 restripeZebra，不碰）。
4. idle builder 三 gate（scroll／accordion／switch）並存；`{timeout:2000}` 不動。
5. 四～七輪成果不回退；不加 placeholder；content-visibility 不回加；`check:ts` 零新錯；純 JS 不需 build:css。
