# activities 優化七輪：圖片「載好才滑入」（對齊 library 範式，消滅 progressive 浮現）

> 2026-09-03，給 Opus 執行；盤點已完成、不需重新分析。
> user 裁示：activities 的圖片比照 library——**圖 ready 才 clip-reveal 進場，不要 progressive 慢慢浮現**。
> library 範式（沿用其定案）：**無 placeholder／無灰卡**（2026-08-28 user 撤回灰卡）、img onload 才在遮罩內 **4 向隨機滑入**（`maybeSlideCover`／`COVER_SLIDE_DIRS`；「位移感＝滑有紋理的圖」）。

---

## Part 0：現況盤點（已查核）

| 圖片出現點 | 現況 | 本輪 |
|---|---|---|
| **poster**（`buildPosterHtml`，activities-data-loader :333-345；loadListInto 生態共用＝activities 全 section＋admission news/camp） | wrapper 有 overflow-hidden＋aspect-ratio 佔位（P2-2），但 img 無 load gating → 展開中載入時 **progressive 掃描浮現** | ✅ 改「載好才滑入」（Part 1） |
| **degree-show 分頁封面**（degree-show-data-loader :92-93，`loading="eager"`） | 無 gating → 同樣 progressive | ✅ 同 pattern（Part 2） |
| gallery strip（`gateStripRevealOnLoad` :531） | 已「全部載完才淡入」＋1.5s 逾時兜底 | ❌ 不動（已無 progressive；08-28 定案兜底勿拿掉） |
| album 縮圖 track（:623/:673 同走 gateStripRevealOnLoad） | 同上 | ❌ 不動 |
| lightbox 大圖、hero-rand-grid | 各有自己的序列 | ❌ 本輪不碰 |

---

## Part 1：poster 載好才滑入

### 1-A. HTML 烙 pending 態（`buildPosterHtml`）

- img 出生自帶（build HTML string 時擲方向，**零 JS touch**，同四輪哲學）：

```js
const SLIDE_DIRS = ['0%, 110%', '0%, -110%', '110%, 0%', '-110%, 0%'];   // 同 library COVER_SLIDE_DIRS 語彙
const dir = SLIDE_DIRS[(Math.random() * 4) | 0];
// img 加：data-pending-reveal ＋ style="transform: translate(${dir})"
```

- wrapper 不動——`overflow-hidden`＋aspect-ratio 就是現成遮罩；translate 不影響 layout → 佔位行為（P2-2）不變。
- 無 AR 的 eager 分支同樣烙 pending（該分支 wrapper 高度會隨解碼漸長＝白框漸長，屬既有行為；既有 load 高度補償 :947-960 照舊，兩者不衝突）。

### 1-B. Bind 揭露（掛在既有 `.poster-img:not([data-pbound])` 迴圈 :938 內）

```js
const revealPoster = (img) => {
  if (!img.dataset.pendingReveal) return;
  delete img.dataset.pendingReveal;
  const rot = img.dataset.initDeg ? ` rotate(${img.dataset.initDeg}deg)` : '';
  img.style.transition = 'transform 0.6s cubic-bezier(0.25, 0, 0, 1)';   // EASE.enter
  img.style.transform = `translate(0%, 0%)${rot}`;
  const clr = (e) => {
    if (e.target !== img || e.propertyName !== 'transform') return;
    img.style.transition = '';
    img.style.transform = rot.trim();       // 收斂：只留 hover 初始旋轉（無則空字串）
    img.removeEventListener('transitionend', clr);
  };
  img.addEventListener('transitionend', clr);
};
if (img.complete && img.naturalWidth) revealPoster(img);
else img.addEventListener('load', () => revealPoster(img), { once: true });
```

- `complete` 分支（快取命中）＝bind 當下即滑入；`loading=lazy` 的 load 在近視窗才 fire → 揭在畫外播掉也無妨（one-shot、便宜）。
- onerror 自摧毀 wrapper 的既有行為不動（藏著壞掉也一樣自摧毀）。

### 1-C. ⚠️ transform 組合契約（與六輪 2-B 交集，兩份 md 同交時以本節為準）

poster img 的 inline transform 同時承載兩件事：**pending translate（本輪）＋ hover 初始 rotate（bindMediaHover）**。寫入者各動自己那半、保留對方：

- 六輪 2-B 的 `bindMediaHover` 直寫改為：
  ```js
  const keep = (img.style.transform.match(/translate\([^)]*\)/) || [''])[0];
  img.style.transform = `${keep} rotate(${initDeg}deg)`.trim();
  ```
- 本輪 reveal 終態保留 rotate（1-B 的 `rot`，讀 `dataset.initDeg`——bindMediaHover 已存）。
- `applyHover` 的 mouseenter/mouseleave 開頭加 `if (img.dataset.pendingReveal) return;`——隱藏中不讓 gsap 碰 rotation（gsap 會把 mid-transition matrix 定格、再被 transitionend 清掉＝閃跳）。reveal 完 hover 恢復正常。

### 1-D. 共用面（預期行為改變、驗收列入）

`loadListInto` 是共用模板 → **admission news／summer-camp 的 poster 同步變成「載好才滑入」**。視覺與 activities 一致＝預期內；驗收時兩頁都看。

## Part 2：degree-show 分頁封面（同 pattern、抄小段）

- :92-93 的 `<img class="degree-show-img">` 同樣烙 `data-pending-reveal`＋隨機 translate（**確認外層有遮罩**：卡片縮圖塊若無 `overflow:hidden` 補在圖的直接父層，別動卡片版型）。
- 該 loader 的綁定處補 1-B 等價揭露（~10 行**直接抄**，不強制抽共用 helper——「3 行類似 code 比 premature abstraction 好」；degree-show 封面無 hover rotate，`rot` 恆空、可省組合契約）。
- 無 coverImage 的灰底 placeholder 分支**不動**（2026-08-17 定案：後台沒傳封面時卡片要有灰縮圖塊）。

## 驗收

- 冷快取展開含 poster 的 item：poster 區維持乾淨佔位（AR 白框）→ **載完瞬間 4 向隨機滑入**；全程不得出現 progressive 掃描浮現。
- 快取命中再開：bind 當下即滑入、無空白等待；連續開多個 item 方向隨機各異。
- hover 微旋：reveal 完成後照常（歸 0／回位）；reveal 進行中 hover 無反應（防呆）。
- lightbox 點開 poster 正常；onerror 404 wrapper 自摧毀如舊。
- admission news／camp poster 行為一致；degree-show 分頁封面同步生效、無封面灰塊不變。
- 手機＋矮橫向一致；`npm run check:ts` 零新錯；純 JS、**不需 build:css**（pending 態烙 inline style，不新增 class——poster 是單圖單次、方向隨機，inline 比 class 直接）。

## 紅線

1. **不加任何 placeholder／灰卡**（08-28 撤回定案）；aspect-ratio 佔位與 lazy（P2-2）不動。
2. `gateStripRevealOnLoad` 機制與 1.5s 兜底不動；strip／album 視覺不改。
3. transform 組合契約（1-C）——bindMediaHover 與 poster reveal 互相保留對方那半；任何一方寫 `img.style.transform` 都不得整串覆蓋。
4. 不需 gen 戳記（單 img 一次性、無互搶寫入者；transitionend 已 e.target＋propertyName 守門）——別過度工程化。
5. 四～六輪成果不回退。
