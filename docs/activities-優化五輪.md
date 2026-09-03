# activities 優化五輪：切換後 search 還原風暴（最後一顆大石頭）

> 2026-09-03，給 Opus 執行；診斷已完成、不需重新分析。範圍只有 **`js/modules/ui/activities-search.js` 一個檔**（兩個函式＋一個分支），外科手術級。
> ⚠️⚠️ **此檔內含 user 未 commit 的 WIP（admission camp sticky 搜尋列）——只准動下面點名的函式，其餘一行都不能碰。**
> 前情：四輪（rows CSS 化＋idle 讓路）已落地且有效：冷切 lectures 9s→max 498ms、暖切 lectures 0 longtask。library Part 4（album pool 延後 1.5s）也已修完。本輪是四輪 md「1-D」當時沒改到的殘留（推測因檔頭 WIP 警告整檔跳過）。

---

## Part 0：確診（實測數據，直接引用）

headless 無節流、本地工作樹，暖切回 exhibitions（已全建 ~數百列）：

- **click 後 +300ms 出現一顆 34,371ms 的單一 longtask**。Profiler total-time：`applyGenericSearch` 33.5s，其中 **`revealAllInstant` 32.2s**；self-time：Td（GSAP getComputedStyle）66.9s＋`get offsetHeight` 24.4s（gsap yPercent 需讀自身高度）。
- 鏈條：每顆 `.activities-section-btn` 的 click listener（activities-search.js **:414-427**）延遲 300ms 對目標 panel 重新 apply 搜尋 → 搜尋框是空的 → `applyGenericSearch` 走**空查詢分支（:156-184）無條件**跑全 panel 還原：逐 item `appendChild` 重排序＋`revealAllInstant`（**:23-29**）對**全部 `.list-reveal-row`** 跑 `gsap.set({yPercent:0})`。
- 為何四輪後反而炸更大：rows 已全面退 GSAP → 這行殘存的 gsap.set 面對的**每一列都是冷觸**（逐列 computed 讀＋offsetHeight 讀＝逐列全頁 recalc 50~120ms）；exhibitions 是預設分頁、idle builder 最早把它全建完 → 列數最多最炸。lectures 暖切乾淨是因為其 rows 曾被早期 revealAllInstant 觸過（GSAP cache 暖）——**別拿它當反證**。
- **user 的兩個症狀同源**：①「切到資料多的分頁卡」＝這顆 task（實機是縮小版）②「退場動畫殘留不乾淨」＝task 在 click+300ms 開火，正好凍住換頁 JS 收尾（chip 高亮、panel swap）——rows 的 CSS 退場照播（compositor），但沒人收尾，畫面停在退到一半的殘骸再硬切。
- 退場本身**已是同刻出**（`exitRows` 無 stagger＋zebra 同窗收，admission-data-loader :444-457），逐幀看中段的「文字滑行中」是 0.4s ease-in 的正常過程——不需要改退場視覺，修掉凍結即可（驗收後 user 實機再評）。

---

## Part 1：空查詢守門（一刀砍掉整條路）

`applyGenericSearch`（:140）空查詢分支開頭加 early-return：

```js
if (!query) {
  // 五輪：從沒搜尋過（或已還原過）＝零副作用可還原 → 什麼都不做。
  // 否則每次切分頁的 +300ms 重 apply（:414 listener）都會對全建 panel 跑整套還原
  // ＋revealAllInstant＝數百列冷觸 recalc storm（headless 實測 34s 單一 task）。
  if (!/** @type {any} */ (panel)._searchShown) { setEmptyState(panel, false); return; }
  ...（原本的還原邏輯不動）
}
```

- 依據：`_searchShown` 只在有命中結果時設（:245，空陣列也是 truthy＝有搜過就非 null）、空查詢還原尾端清 null（:183）。null ＝「從沒搜過或已還原」＝分隔線/排序/collapsedBySearch/data-pre-reveal 都沒有殘留副作用，跳過安全。
- `setEmptyState(panel, false)` 保留在 early-return 裡（防禦性收掉 No Result；cheap）。
- **正常切分頁從此完全不進還原路徑**；使用者真的清空搜尋時 `_searchShown` 非 null → 照走原邏輯（由 Part 2 保證那條也不炸）。
- `applyDegreeShowSearch`（:264，卡片式、量小）：同款守門順手加（空 query 且無先前搜尋態就 return）——低優先，結構不同不必強套 `_searchShown`，用它自己的等價旗標或乾脆略過此項亦可。

## Part 2：revealAllInstant / animateMatches 退 GSAP（真的搜尋時也不炸）

改用四輪的新引擎 `../ui/list-row-reveal.js`（同目錄，import `{ hideRows, revealRows, snapRowsShown }`）：

1. **`revealAllInstant`（:23-29）**：
   ```js
   function revealAllInstant(panel) {
     snapRowsShown(panel.querySelectorAll('.list-reveal-row'));   // transition:none＋transform=''（零讀取）
     panel.querySelectorAll('.list-item.list-item-zebra').forEach(it => { it.style.clipPath = ''; });
     panel.querySelectorAll('.list-item[data-pre-reveal]').forEach(it => it.removeAttribute('data-pre-reveal'));
   }
   ```
   （gsap 判斷整段拿掉；zebra／pre-reveal 兩行不變。）
2. **`animateMatches`（:32-39）**：`setupClipReveal(rows,{hide:true})`＋`playClipReveal(rows,{clear:false})` 換成：
   ```js
   hideRows(rows);
   void (matchedItems[0] || rows[0]).offsetHeight;  // ⚠️ 必要：同一同步區塊先藏再揭、無中間 paint 會 snap（list-row-reveal 檔頭警語）；單次 reflow commit 起點
   revealRows(rows, { dur: DUR.reveal, stagger: 0.06 });
   ```
   - `setupClipReveal` 的 import 若因此不再被本檔使用 → 移除該 import（別留死 import）。
   - rows 的遮罩 wrapper 由 lazy build 時包好（`ensureFullyRendered` → buildOneBatch → `setupClipReveal(hide:false)`）——animateMatches 不需要再包。
   - `gsap === 'undefined'` guard 拿掉（不再依賴 gsap）；`matchedItems.length` 空判斷保留。
   - 開頭 zebra 清 clip／data-pre-reveal 移除兩行不變。
3. 空查詢還原分支裡的 chevron `gsap.set(chevron,{rotation:180})`（:176）**不動**——每年份組一顆、量小、且是 chevron 專屬語彙。

## Part 3：不動退場視覺

退場已是「zebra clip 收＋rows 同刻滑出、無 stagger」（四輪落地版）。殘留的觀感問題預期由 Part 1/2 解（凍結消失＝退場能完整播完＋swap 準時）。**本輪不改退場動畫**；user 實機驗收後若仍覺得不乾淨，另開視覺回合再議（選項已在對話記錄：整筆同刻出／縮短時長／加 item 級微 stagger）。

---

## 驗收

- 暖切 exhibitions（全建態）：click 後 5s 內 max longtask 從 34,371ms → **≤200ms**；連續在 exhibitions↔lectures↔competitions 間快切 10 次無 >300ms task。
- 退場：實機/錄影確認切換時舊清單完整滑出、無凍結殘骸、chip 高亮即時。
- 搜尋功能回歸：輸入命中（diff 進場動畫照播、新命中 rows 由下滑入）→ 追加字元縮小結果 → 刪字放寬（新增命中有動畫）→ 全清空（清單即時還原、排序/分隔線/年份收合狀態正確、零動畫直接現）→ gibberish（No Result 置中）→ 清空還原。lectures 237 筆全程順。
- 搜尋中切分頁再切回：輸入框文字仍在 → 300ms 後重 apply 照常（非空查詢路徑不受本輪影響）。
- deep-link（`?section=X&item=Y`）直達、年份收合、reduce-motion、手機/矮橫向不受影響（本輪只動 search 檔兩函式＋一分支）。
- `npm run check:ts` 零新增錯。純 JS，不需 build:css。

## 紅線

1. **`activities-search.js` 只准動：`revealAllInstant`、`animateMatches`、`applyGenericSearch` 空查詢分支開頭（＋可選 `applyDegreeShowSearch` 同款守門）。其餘一行不碰**（檔內有 user 的 camp sticky WIP）。
2. 非空查詢的搜尋邏輯、`_searchShown` diff 機制（3-3）、debounce 140ms、:414 切換重 apply listener 本體——全部不動（守門放在 applyGenericSearch 內部即可涵蓋）。
3. `list-row-reveal.js` 引擎本身不動；`scroll-animate.js` 不動。
4. 別用 `clearProps`／別把 rows 交回 GSAP（四輪紅線延續）。
