# atlas 橫向（矮橫向 gate）六項修正方案

> **✅ 2026-09-24 已全部實作＋headless 驗證通過（user 指示「修」後 fable 直修，未 commit）。**
> 實作中追加兩個驗證時才浮現的深層根因修正：
> 1. **`isFilteredOutItem` 手機分支**（atlas.js:1337）：手機星雲＝純瀏覽全顯示，但 `selected` 狀態仍是 list tab 的單選（預設 faculty）→ 狀態檢查把 co/partners 全誤判已濾除，tap **和 zoom 後的 emulated hover** 都開不了非 faculty 的卡（＝user「有的能點有的不能」的主因）。修＝手機只信 DOM class（`if (isMobileAtlas) return false;` 於 class 檢查後）。
> 2. **橫向 overview 隱形 label 偷 hit-test**（atlas.css landscape gate 區）：A/C/em label opacity:0 但 span 佔位且疊在 co chip 上，`elementFromPoint` 回它不回 co → tap co 開不了卡。修＝dot 態 `pointer-events:none`（text-zoom 可見時恢復；直向不套——直向 09-15 tap label 直開卡吃 hit-test）。
> 驗證紀錄見文末。以下為原診斷（行號＝實作前工作樹）。
> **實作紅線（全案共通）**：
> - 只動列出的檔案與區塊；**桌面行為一律不動**（所有 JS 改動掛 `isLandscapeGateAtlas` gate，除 Q4/Q5 註明者外）。
> - atlas.js 工作樹已有未 commit 的節能批（q2 量化）與 viewport-cull 批——本方案是第三批，**出包/commit 時勿混批**（分開 commit）。
> - `css/components/atlas.css` 有編進 output.css（input.css:28）→ 改後必跑 `npm run build:css`（router 另有動態載入同檔，兩份都要新）。
> - headless 可驗功能（tap 開卡、marquee class、rotation inline 值），流暢度（Q5）只能實機驗。

---

## Q1. 橫向 list view：Hosting/Employment 左欄鈕補旋轉

**現象**：橫向 list 的 alumni 子分頁鈕（Hosting 主持／Employment 就職）是正的，與全站 nav chip 語彙（含 atlas 自家頂部 tab、map view 的 host/employ subchip）不一致。

**根因**：`ensureGateSubBtns()`（js/modules/pages/atlas.js:4680-4712）建 `.atlas-gate-sub-btn` 時完全沒設 transform。對照：map view 的 subchip 出生就有 `baseRot = randDeg()` 寫 inline rotate（atlas.js:3594-3596）；頂部 filter 鈕 active 時也有（atlas.js:4739-4741）。CSS `.atlas-gate-sub-btn`（css/components/atlas.css:1563-1578）無 transform 規則，inline 直接生效、無衝突。

**修法**（atlas.js `ensureGateSubBtns` 內）：
1. 建鈕 forEach 內、`appendChild(enEl/zhEl)` 之後補：
   ```js
   b.style.transform = `rotate(${randDeg()}deg)`;
   ```
   用 atlas 自家 `randDeg()`（±1~±3°，atlas.js:3915-3919）＝與同畫面頂部 tab／subchip 同一角度語彙。**不要**用 SCCDHelpers.getRandomRotation（−4~+6 是全站 nav 模型，但 atlas 整頁被排除在該模型外，見 memory `project_nav_btn_hover_spin_persist` 排除清單）。
2. 手機無 hover → 對齊全站「click 現抽」慣例：click handler（atlas.js:4695-4706）裡 `gateAlumniSub = key;` 之後補一行，給被點的鈕換新角：
   ```js
   b.style.transform = `rotate(${randDeg()}deg)`;
   ```
   未被點的鈕保持原角（全站「離開不還原」模型）。

**安心點**：`#atlas-gate-sub` 不在桌面 view-morph 的 `maskFlyChrome` chrome pairs 裡（那套只吃 filter btn／欄標題／map subchip，且橫向根本不跑 morph）→ 不會踩「外掛亂角 desync」地雷。

**驗收**：橫向進 atlas → list → Alumni tab：兩顆鈕各自帶隨機小角；點 Employment → 該鈕換新角、Hosting 角不變；切別的 tab 再回來角度仍在。

---

## Q2. 橫向點別的 nav tab 時，職業 chip 收/出都要更早

**現象**：橫向 list view 點別的 tab（Alumni→Partners 等），藍色職業 chip（Visual Designer 視覺設計師）收得慢；點回 Alumni 時出得慢。

**根因**：時序是即時觸發（tab click → `apply(true)` → `syncCareer()`，atlas.js:4985-5001、3832-3844，無排隊延遲），慢在動畫本身的 2-phase 編排（`createCareerController` dir='left'，橫向的職業 chip 在 header tab row、由 mapCareerCtrl 控）：
- **show**（atlas.js:3295-3310）：Phase 1 box 撐開（height/width/padding，`DUR.fast`=0.3s）從 t=0；Phase 2 文字 clip+translate 滑入（`DUR.base`=0.4s）**寫死從 t=0.3 起跑** → 文字 0.7s 才到位。
- **hide** 無 delay 路徑 `buildTl()`（atlas.js:3362-3380）：文字滑出 `DUR.medium`=0.5s 從 t=0；box collapse（含橫向 width 歸零）**寫死從 t=0.5 起跑**、跑 0.3s → 0.8s 才清場。
- （桌面 map 的「火車模型」在 `delay>0` 分支，此路徑用不到、不受影響。）

**修法**（兩處 position/duration 掛橫向 gate，桌面值不動）：
```js
// show()（3304 附近）：
tl.to(el, { clipPath: ..., translate: ... , duration: DUR.base, ease: EASE.enterSoft },
  isLandscapeGateAtlas ? 0.1 : 0.3);

// hide() buildTl()（3365-3379）：
tl.to(el, { clipPath: ..., translate: ...,
  duration: isLandscapeGateAtlas ? DUR.fast : DUR.medium, ease: EASE.exit }, 0);
tl.to(el, { height: 0, ..., duration: DUR.fast, ease: EASE.exitSoft },
  isLandscapeGateAtlas ? 0.15 : 0.5);
```
效果：出＝文字 0.5s 到位（原 0.7）、box 0.3s 撐開；收＝0.3s 文字走、~0.45s 清場（原 0.8）。若 user 覺得還不夠快，三個橫向值（0.1／DUR.fast／0.15）就是調速鈕。

**注意**：hide 提速也作用於橫向其他 hide 路徑（如切 map view 前收 chip）——一致提速，可接受。直向 list 用的是另一顆 listCareerCtrl（dir='top'）不在此路徑，不受影響。

**驗收**：橫向 Alumni↔Partners 來回切，chip 收合不再拖在 nav 換色之後；Partners 鈕被 box 佔位推擠的時間明顯縮短。

---

## Q3. 橫向 list 的文字溢出要自動 marquee（比照手機）

**現象**：橫向 list 卡片的名稱/副標溢出時不會捲。

**根因**：atlas list marquee 的 CSS gate 用寬度切（css/components/atlas.css）：
- `@media (min-width: 768px)`（:983-990）＝hover 才捲；
- `@media (max-width: 767px)`（:991-998）＝自動捲。
矮橫向寬 ≥768 → 落進桌面 hover 區；觸控無 hover、且 JS 的 `bindMarqueeReturn` 在矮橫向自我 gate 退出（js/modules/ui/marquee-overflow.js:176）→ 兩頭落空，溢出文字永久截斷。`.is-overflow` 偵測與 `--marquee-distance/-duration` 量測（`applyListMarquee`，atlas.js:4504-4510）在橫向照跑，萬事俱備只差 CSS gate。全站同型先例：courses 灰卡在 landscape.css:404-406 就是這樣補的。

**修法**（一行，改 atlas.css:991 的 media 條件為聯集）：
```css
@media (max-width: 767px), (orientation: landscape) and (max-height: 500px) {
```
放 atlas.css 而非 landscape.css 的理由：atlas.css 是動態載入的頁面 CSS、cascade 在 landscape.css（output.css 內）之後——寫 landscape.css 這次雖然沒有對打規則、能贏，但照 CLAUDE.md 的 cascade 陷阱慣例，atlas 自己的橫向規則本就集中在 atlas.css 自家 gate 區（:1472 起）。改完 **`npm run build:css`**。

**驗收**：橫向 list（Partners tab 最容易有長名）溢出項不 hover 也自動循環捲動；桌面仍 hover 才捲；直向不變。

---

## Q4. 橫向 map view「有的能點、有的不能」的原因

**這不是 bug，是三套規則疊出來的不一致**（js/modules/pages/atlas.js）：

1. **預設 overview（scale 1.0 ＝圓點模式）**：`touchstart` 一律 `preventDefault`（:3015，`!textZoomOn` 時）→ 瀏覽器不發 emulated mouseover → **tap 開不了說明卡**。tap 只做「找 40px 內最近圓點 → zoom-in 置中」（:2958-2991）。
2. **hosting chip（co-\*）是 overview 唯一有字的**（dot 化豁免，atlas.css:1390-1397）：它的「圓點錨」在 chip 左/右緣——tap 貼近錨點＝觸發 tap-zoom（zoom 到 2.6）、tap 寬 chip 中段（離錨 >40px）＝**什麼都不發生**。「同一張卡有時有反應有時沒有」就是這個。
3. **zoom ≥ 2.0 進文字模式**（`TEXT_ZOOM_SCALE`，:207、:2633）：不再 preventDefault → tap 走 emulated hover ＝桌面開卡同路，**全部 label 都能點**。
4. **D 國家方塊在橫向被明確排除**（:2909-2910、:2462「橫向 gate 維持現行」）：永遠開不了卡。直向 09-15 已補「label tap 直開卡」（:2933-2950），當時橫向刻意沒跟。

**修法**（把 09-15 直向 tap 修法擴到橫向，範圍限「看得見的東西」）：
- `handleTap` 的 `isPortraitDotAtlas` 圓點分支（:2911-2951）重構：
  1. D 方塊搜尋段維持直向專屬（不動）。
  2. `closeOpenCountry()` 移出直向 block（橫向 openCountryItem 恆 null＝no-op，安全）。
  3. label-tap 段（:2936-2950）改直向＋橫向共用，但**橫向只接受可見 label**：
     ```js
     const okForLandscape = isPortraitDotAtlas || (tappedSpan.closest('.atlas-anchor-co'));
     ```
     ⚠️ 必須這樣限縮：橫向 overview 的 A/C/em label 是 `opacity:0` 但 span 仍佔位可被 elementFromPoint 命中（atlas.css:1436-1438）——不限縮會「點空白冒出隱形項目的卡」，這正是當年 preventDefault 要擋的事故（:2849 註解）。
     命中 co chip → `centerToItem(tappedItem)` ＋ `showDetail(...)` ＋ `pauseRingFlow()`（co 屬 B 類，沿用直向同款凍結）；沒命中 → `clearDetail()`（tap 空白收卡，跟直向/文字模式慣例一致）再 fallthrough 圓點搜尋。
- **D 方塊要不要開卡**＝設計決策，預設不動（維持「橫向純方塊」現行設計）；user 若要，照直向 :2911-2930 整段搬（含 `CITY_TAP_ZOOM` 置中與 `pauseCityOrbit`），但「方塊展開國名」（:2462）是否也開放要一併拍板。
- 文字模式（zoom 後）不用動：本來就全可點。

**驗收**（實機或 headless dispatch touch）：橫向 overview tap hosting chip 任意位置＝置中＋開卡＋環暫停；tap 空白＝收卡；tap 圓點＝照舊 zoom-in；zoom ≥2 後行為不變；直向回歸不變（D tap、label tap、空白收卡）。

---

## Q5. 橫向 map「浮動的資訊卡卡地移動」＝20fps cap，可優化

**根因**：說明卡是 `position:fixed` 不會漂，會漂的是節點本身——橫向 overview 最顯眼的就是沿橢圓環連續流動的 hosting chip。整個漂浮 loop 被 `FLOAT_FPS_CAP = isMobileAtlas ? 20 : 30`（atlas.js:1582）壓在 **20fps**（09-15 弱機省 1/3 決策），疊 09-20 未 commit 批的 `q2` 0.5px 量化步進（:1356）→ 連續位移變成低頻大步階，肉眼就是「卡卡的」。桌面 30fps 沒這個觀感問題。

**修法（第一步，一行）**：橫向升回 30fps、直向維持 20：
```js
const FLOAT_FPS_CAP = (isMobileAtlas && !isLandscapeGateAtlas) ? 20 : 30;
```
成本論證：09-20 量化已把每 tick 實際 DOM 寫入砍約一半（span ~53%／anchor ~41% 有寫）→ 30fps 的寫入量 ≈ 09-15 當時 20fps 的水準；且 `RAF_BEAT_SLACK_MS` 容差對 30fps cap 在節能 30Hz 下剛好是穩定每幀跑（1584-1587 註解的設計案例就是 30）。intro 期 20fps 降頻（:2743）不動（intro 只在桌面跑）。

**第二步（實機仍嫌卡再做，勿先做）**：橫向把量化步進放細——`q2`（0.5px）在橫向改 0.25px（`Math.round(v*4)/4`）。代價是同值跳寫命中率下降、寫入變多，所以只在第一步實機驗完還不滿意時才上。

**驗收**：只能實機（headless SwiftShader 量不出流暢度，memory 已載）。開/關 Chrome 節能模式各看一次 hosting 環流動；順便回歸 09-20 批驗證項（Energy Saver 不拍頻）。

---

## Q6. 「hosting 卡片 padding 比全站小」＝事實，兩層原因

盤點（全站 chip 標準＝`6px 8px 5px`）：

| 元素 | padding | 出處 |
|---|---|---|
| 橫向 list 的 Hosting/Employment 鈕 | `6px 8px 5px` ✅標準 | atlas.css:1568 |
| 說明卡兩區（head/body） | 各 `6px 8px 5px` ✅標準 | atlas.css:332、:348 |
| **桌面 map 的 B/co chip** | `3px 5px`（刻意緊湊＝地圖密度） | atlas.css:238 |
| **手機/橫向 dot-mode 的 co chip** | `2px 3px`（隨 zoom 反縮） | atlas.css:1392 |

所以 user 看到的 map view hosting chip 確實比全站小——桌面 map 本來就用小一號的 3/5（30 顆 chip 擠一個環的密度考量），橫向 overview 又縮到 2/3。比例上 2/3 ≈ 3/5 × (8px/11px 字級比)＝**overview 態其實是等比縮放、無問題**；真正失衡的是 **zoom 進文字模式後**：字級升到 0.75rem（12px，比桌面 11px 還大）padding 卻停在 2/3 → 比桌面比例更緊。

**修法（建議）**：只補文字模式那一態，對齊桌面 B chip 的 3/5（atlas.css，dot-mode 區塊內新增）：
```css
#atlas-stage.atlas-dot-mode.atlas-text-zoom .atlas-anchor-co .atlas-name {
  padding: calc(3px / var(--atlas-zoom-scale, 1)) calc(5px / var(--atlas-zoom-scale, 1));
}
```
overview 的 2/3 建議保留（等比一致；若 user 想 overview 也鬆一點，同式改 3/5 即可，但環的視覺密度會變）。**不建議**把 map chip 上到全站 6/8/5——8px 字配 6/8/5 padding 會讓 chip 高度近乎翻倍、30 顆環直接爆版。改後 `npm run build:css`。
⚠️ 若後續有人動說明卡兩區 padding，記得 `snugDetailWidth` 讀的是 `.atlas-detail-body` 的 computed padding（atlas.js:1958 依賴，memory 有案）。

---

## 建議實作順序與驗收總表

1. Q3（CSS 一行）＋ Q6（CSS 一條）→ build:css → 橫向截圖驗收。
2. Q1（JS 兩行）→ headless 讀 inline transform 驗收。
3. Q2（JS 兩處 position gate）→ 橫向錄屏比對收/出時長。
4. Q4（handleTap 重構，本批最大）→ 直向回歸必驗（D tap／label tap／空白收卡）＋橫向新行為。
5. Q5 第一步（JS 一行）→ **實機**驗；不滿意再議第二步。

回歸紅線：直向手機與桌面 map/list 全部行為不得變；`npm run check:ts` 只看新增錯誤。

---

## ✅ 2026-09-24 實作＋驗證紀錄（headless Chrome 844×390 觸控／390×844 直向回歸）

實際改動（全部未 commit，與 09-19/09-20 兩批同樹、commit 時分開）：
- **atlas.js**：Q1 兩行（seed＋click 現抽）；Q2 兩處 gate（show 0.1／hide DUR.fast＋0.15）；Q4 handleTap 重構（D 段留直向、closeOpenCountry＋label 段移出共用、橫向限 `.atlas-anchor-co`、tap 空白補 `resumeRingFlow()`——dot 模式無 emulated mouseout，環凍結否則解不開）；Q5 cap 一行；**追加** `isFilteredOutItem` 手機分支（見文頭補記 1）。
- **atlas.css**：Q3 media 聯集（:991）；Q6 text-zoom padding 3/5＋transition 補 padding；**追加**橫向 dot 態隱形 label `pointer-events:none`（見文頭補記 2）。已 `npm run build:css`。

驗證結果（playwright channel:chrome；證據數字）：
- Q1 ✅ seed `rotate(2.6deg)/rotate(-2.1deg)`；click Employment → 換 `rotate(1.2deg)`、Hosting 不變、active 正確互換。
- Q2 ✅ 收：260ms clip 已滑出 42%、**560ms h=0/w=0**（舊版 500ms 才開始收）；出：320ms clip 只剩 17%（舊版 300ms 才起跑）、700ms 全開。
- Q3 ✅ Partners tab 兩筆 `.is-overflow`，`animation: atlas-marquee` running（無 hover）。
- Q4 ✅ overview 合成 tap co-340 → 卡開（「MK ORIGIN STUDIO 木下曰本／Hosted by Alumni 系友主持」）＋環全凍（rate 0）；真 touchscreen tap co-344（text 模式）→ 卡開（emulated hover 路，state 修後通）；tap 空白 → 卡收＋環恢復（沉澱後 34.1/s）；橫向 D tap 維持不開卡；直向回歸：label tap 開卡、D tap 開卡＋square-open、空白收卡全過。
- Q5 ✅ 橫向 co 錨點更新率 32.6~34.1/s（≈30 cap）、直向 21.3/s（20 cap 不變）。**流暢度觀感待實機**。
- Q6 ✅ 真 tap-zoom 到 2.6 進 text 模式後，co chip computed padding × zoomVar ＝ 精確 3px/5px（font 12px）。
- PAGE-ERRORS 全程 none；TS check 無新增錯誤（既有歷史錯誤不變）。

已知觀察（非本批 bug、供日後參考）：
- 橫向 overview 幾乎整個畫面都在某圓點 40px 內 → 收卡的空白 tap 常順帶觸發 tap-zoom（既有 dot-tap-zoom 語意，收卡＋zoom 同時發生）。
- 直向 label 大量互疊（隱形 label 佔位），tap 常開到「疊在上面那顆」的卡而非視覺目標——09-15 既有 hit-test 語意，未動；state 修後至少所有類別都開得了卡（先前非 faculty 一律靜默失敗）。
