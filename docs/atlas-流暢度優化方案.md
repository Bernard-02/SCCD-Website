# Atlas 進頁流暢度優化方案（2026-09-08 已稽核定稿）

## 診斷（headless Chrome + CDP profiler 實測）

規模：431 顆 anchor / 7495 個 DOM 節點 / 175 條 SVG 線。

- 進頁 8s 平均幀 31ms（~32fps），>50ms 幀 65 個；intro 期最卡（~70ms/幀）。
- JS 極便宜：`floatWobble`+`tickFloat` 8s 合計 ~230ms；大頭是 `(program)` 6.9s＝style recalc/paint/raster。
- **鐵證**：呼叫既有 `setAtlasFloatPaused(true)` 後幀時間 4ms → 穩態卡頓 100% 來自 `tickFloat`（atlas.js:1604）逐 tick 對 ~430 個非合成層 label 寫 transform 引發的 CPU 重繪。
- 另有一次性 ~244ms build+量測 long task（資料到位後），屬可接受，不動。

會動的東西（決定 promote 哪層）：
| 類 | anchor | span |
|---|---|---|
| A fc/ff | 靜態 | wobble（Phase 2） |
| B co | 環流（Phase 1） | 靜態（Phase 2 跳 B；出生 inline rotate） |
| C em/wsg/ind | 小軌道（atlas.js:1034-1062） | wobble |
| D 國家 | 軌道+防撞 | 靜態（CSS transform 置中+inline rotate） |

## 修改 1：span 合成層 promotion（主力）

**只 promote `.atlas-name`（431 層），不 promote anchor。** 理由：`.atlas-anchor` 自身零繪製內容（atlas.css:106-110 無 bg/border，唯一子節點就是 span）→ anchor 的 transform 變動對「只含合成層內容」的元素＝property tree 更新、零 raster；四類的可見內容全在 span 子樹，一條規則全覆蓋。

```css
/* atlas.css；⚠️ atlas.css 同時編進 output.css（input.css:28）→ 改完必 npm run build:css */
#atlas-stage.atlas-layered .atlas-name:not(.atlas-as-list) { will-change: transform; }
```
```js
// initAtlas 內（isMobileAtlas 判定後）；手機+橫向 gate 一律排除（圓點模式反向縮放 calc 不受影響）
if (!isMobileAtlas) stage.classList.add('atlas-layered');
```

### zoom 模糊配套（沿用既有 pattern；⚠️09-08 二修定版＝double rAF）
`markZoomActive` 的 250ms idle timeout（atlas.js:2545-2548）在 `zoomEl.style.willChange='auto'` 之後補：
`stage.classList.remove('atlas-layered')` → **double `requestAnimationFrame`** 加回 → 強制以當前 scale 重 raster。
⚠️ 單 rAF 是 no-op（實機糊字實證）：rAF callback 跑在同次 rendering update 的 style/paint 之前，remove→add
摺疊成同一次 style 更新＝demote 從未 commit、層不重建。double rAF＝第一幀真的以 demoted 狀態繪製、
第二幀 re-promote 重建層。另配 `layerRasterScale` 守衛：純 pan（scale 沒變）跳過 bounce、不白付兩次全量 re-raster。
行為與今日完全一致：手勢中糊（zoomEl 大層 GPU 縮放）、停手 250ms 後變清晰。intro 期 wheel 被擋、無 zoom，兩機制無交集。
此糊 headless 重現不了（SwiftShader 勤重繪）＝only 實機可驗。

### 不影響現狀的稽核保證（已逐項對代碼確認）
- **stacking context 零變化**：chip 形態 span 出生就有 inline rotate（atlas.js:1205，A/B/C）或 CSS transform（B/D，atlas.css:243/271）→ 本來就是 stacking context。
- **containing block 零變化**：span 是 `position:absolute`（atlas.css:118，已 positioned）→ `.atlas-name-cover` 的 `inset:0` 基準不變。
- **list 形態零接觸**：`:not(.atlas-as-list)` 排除 → list 排版/cover 定位基準與今日相同；morph 換形時 class 翻轉＝一次性 demote/promote re-raster，攤進本來就重的轉場。
- **mode1/2/3**：換色只重繪該 span 自己的 texture；0.4s fade whitelist 只涉色不涉 transform。
- **hover**：dim（opacity .25）/highlight（z:10）在合成層上更便宜，邏輯不動；D 方塊 `.atlas-square-open` FLIP 尺寸動畫照常（尺寸變化本來就要重繪，範圍縮小到單層）。
- **filter 收展**：`.atlas-filtered-out{display:none}` 層隨之銷毀，無殘留。
- **cleanup**：class 掛 stage 上，換頁隨 DOM 移除；idle-standby overlay（options.root）各自的 stage 各自判定。
- GPU 記憶體：431 張小 texture ~20-40MB（桌面無虞；手機已排除）。

## 修改 2：intro 未點亮的 item 跳過 tickFloat 寫入

- `item._introOn` 預設 `true`；只在 intro 分支（atlas.js:2596，與 `gsap.set(anchors,{opacity:0})` 同處）設 `false`。
- 每 wave 在 timeline `pos` 加 callback 把該 wave items 設回 true（**wave 起跑即開**：從 opacity 0.01 起位置已正確、零跳動；co 整批在 pos=1.65 開，clip-hidden 期間就在軌道上）。
- `tickFloat` 三處加同一行 guard `if (!item._introOn) continue;`：Phase 1（1662 的 `_orbit` continue 旁）、Phase 2（1752）、Phase 2.5（1765）。
- **Phase 1.4 城市防撞與 seesaw 夾邊 loop 不 gate**（純數學無 DOM 寫入；城市 wave 在 svg 現身（1.65s）前已全開，凍結端點與 label 位置一致、無視覺破綻）。
- 收尾兜底（⚠️ 不能只掛 onComplete/.then）：`finishIntroVisuals` 內全部設回 true；`introTween.progress(1)` 路徑會照跑 wave callback，天然安全。
- reduced-motion / `options.instant` / 手機：intro 分支不跑 → 全程 true → 行為零變化。

### 順手修既有 bug（稽核時發現，今天就存在）
`onTouchStart`（atlas.js:2837-2841）對 intro 用 `introTween.kill()`——kill 不觸發 onComplete 也不 resolve `.then()`（同 memory `reference_gsap_kill_not_resolve_then_promise`）→ **桌面觸控螢幕在 intro 期間碰一下畫面＝節點卡在半透明、filter/layout/mode btn 永不 reveal**。修法照 wheel 路徑（2668-2673）：改 `introTween.progress(1)`。此修同時保證修改 2 的 gate 一定收尾。

## 修改 3：intro 期 FPS cap 30→20

- `FLOAT_MIN_DT`（atlas.js:1536）const → let；intro 分支起始設 `1000/20`，與修改 2 同批收尾點（finishIntroVisuals / progress(1) 完成）還原 `1000/30`。
- 已確認唯一消費者是 tickFloat 節流（1609）；dRelocate 的 `lastFloatTick=0` 歸零（1020）不受影響；intro 期 hover 被擋（2428）→ 凍結/解凍不會落在低 cap 期。

## （可選）修改 4：線端點 sub-pixel 節流 — 先不做

`updateCityLineEndpoints`/`updateLineEndpoints` 寫入前比對，Δ<0.25px 跳過（城市漂移 ~0.15px/tick → idle 期多數 tick 零 SVG 寫入）。relocate 大位移、retract 動畫、hover 跟隨都遠超門檻。**先做 1-3 實機驗證，不夠順再上**（headless 實測 svg promote 只再 +8%）。

## 驗收 checklist

- headless 對照 baseline（avg 31ms / >50ms 65 幀 / long task ~4.4s）：1-3 上齊後重量。
- 實機（headless 軟體 raster 吃不到 GPU 合成收益，實機提升會更大；且 zoom 清晰度 headless 不準）：
  1. zoom 到 1.8 停手 → 文字 250ms 內變清晰（re-raster kick）
  2. map⇄list morph 全程無閃、cover wipe 位置正確（`:not(.atlas-as-list)` scope 驗證）
  3. 三 mode 切換 fade 正常、mode3 B chip 覆寫正常
  4. hover 凍結/dim/highlight、D 方塊展開 FLIP
  5. filter 收展、layout btn 切換
  6. **桌面觸控**：intro 期間 touch → 節點全亮 + filter btn 正常 reveal（bug 修驗證）
  7. 手機直向/橫向 gate：`getComputedStyle($('.atlas-name')).willChange === 'auto'`（promotion 未生效）
- 量測工具在 scratchpad `atlas-perf*.cjs`（fresh `npx http-server` + `NODE_PATH=repo/node_modules`）。
