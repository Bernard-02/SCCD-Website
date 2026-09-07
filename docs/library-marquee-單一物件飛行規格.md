# Library 切分頁 marquee「單一物件飛行」實作規格

> ⚠️ **最新輪次＝§24（v4.5，2026-09-06 第十八輪；§23 驗收四點）**——24.1 兩色彩滑板 dur/ease **單一常數統一**；24.2 marquee 進出場改 **clip-reveal（位移版：inner translateY＋外層裁切）**取代純 clip 收合；24.3 色塊 marquee pop＝隱藏態未 commit 就 reveal（§8.1 再現）＋ `MARQ_ENTER` 放慢；24.4 時序改**兩拍**：marquee 先進場（見 z 最前）→ 滑板才起跑。其前提＝§23（v4.4，第十七輪；§22 調校）——23.1 `MARQ_EXIT` 0.2 太快看不到→0.35~0.4；23.2 灰卡 marquee 進場 **z 最高（浮在色彩滑板之上）**＋與色塊 marquee 出現**同一刻**（統一在 HOLD 幀）；23.3 `pairSlabDir` **底邊型也要轉 90°**（不再只取相反）。其前提＝§22（v4.3，第十六輪；user 三點決策）——**marquee 換手改「對稱 wipe」**：色塊 marquee 先以上下隨機方向 wipe 出場、灰卡 marquee 以**剛好相反**方向 wipe 進場（§20 字流＋整套 adopt 飛行/px 相位交棒機構退役、**15.5-② 正式作廢**）；色彩滑板（§21 機制不變）加**方向配對**：上色與去色相反、色塊 marquee 在左右時相反再轉 90°。卡片純幾何 morph（§19.1）與 §21 滑板機制不變。⚠️§11／§19.2／§20 皆為歷史紀錄、勿再照做。基底＝§11（整卡 ±90°）＋§10（底邊優先）＋§9（同一物件、veil 全刪、卡內飛）；§8 修正除 8.3 外仍有效。
>
> 2026-09-05 初版定案。目標：點色塊切分頁時，marquee 從色塊邊緣「連貫飛到」灰卡底部標題列——**全程單一物件、捲動不凍結**，取代現行 clone 飛行體＋交棒的做法。
> 本 md 為可行性實作（user：「先做看看，到時候再調整」）。Phase 1 = 放大方向＋效能主修；Phase 2 = 縮小方向鏡像（**gated**）。
> 主要改動集中在 `js/modules/pages/library-card.js`，`library-panels.js` 只有小配合。

---

## 1. 背景：現行 clone 版的問題（診斷已完成，勿重查）

現行 [flyMarqueeToTitle](../js/modules/pages/library-card.js#L610-L662)（Phase 1 clone 版）：clone 色塊 marquee 成 fixed 飛行體掛 body，飛 1.1s 後等 veil 掀完（t=1.6）才移除。穿幫點：

1. **兩物件重疊**：真底部列在 veil 下一直捲，veil 方向隨機、先掀到底部時真列提早露出，跟 flyer 疊最多 0.5s。flyer 背景**透明**（`.lib-marquee-flyer` 無任何 CSS、`.color-rect-title` 無 background——程式註解說「飛行體不透明」是錯的），兩邊速度（色塊 keyframe 固定 5s vs 底部列 `unitW/45`s）、相位都不同，疊起來是錯開的兩層字。
2. **半路旋轉＋呆停**：飛行 ease `power3.out`，前 ~0.4s 跑完九成位移＋旋轉（色塊 marquee 常在垂直邊、要轉 ±90°），之後凍結捲動呆停在卡底 ~1.2s。
3. **放大不順**：morph 動 `left/top/width/height`（layout 屬性、CSS TRANSITION），而 [contentEl 在 morph 前已 append 進放大卡](../js/modules/pages/library-card.js#L696-L697)、新 panel `display:flex`（四個 panel 初始化就渲染完整清單）→ 數百列 DOM 每幀重排。

## 2. User 定案的設計

1. **單一物件**：飛行體＝真的 `.lib-title-box`（底部列 marquee 視窗，[buildTitleMarquee](../js/modules/pages/library-panels.js#L2511) 建的那個），暫時 adopt 到 `body` 飛行、結束歸巢。唯一的縫在 t=0 點擊瞬間（色塊 marquee 隱藏、box 同位置/角度/長度/相位出現＝同幀換手）。
2. **veil 在 marquee 底下擦**：box 掛 body、z 最高 → veil 擦除方向**維持隨機**（撤掉任何釘方向的想法）；marquee 全程浮在畫面上一直捲。
3. **長短差**：box 全程帶最終全長 track，用 **clip-path px inset** 動可見窗長（色塊邊長 → 整行寬）；one-shot 過場、不觸「循環動畫勿用 clip-path」鐵則。厚度兩邊同（同 `--font-size-xl`、line-height 1.2），免 scale。
4. **節奏 B**：飛行只跑 morph 的 0.6s、跟卡片同時落定；之後**原地繼續捲動**，veil 在底下擦，t=1.6 掀完同幀歸巢。

時間軸：

```
t=0     點擊：同幀換手（色塊 marquee visibility:hidden、box adopt 到 body 出現在同位置）
        box 單一 tween 0.6s（x/y/rotation/clipPath 窗長/color 同拍）＋卡片 morph 0.6s 並行
t=0.6   box 抵達最終位置（原地捲）；contentEl 恢復顯示、內容 veil 下渲染
t=1.1   veil 開始擦（方向隨機；box 浮在最上）
t=1.6   veil 掀完 → clipAway onComplete 同幀歸巢（fixed → in-flow，零跳動）
```

## 3. 關鍵技術前提（實作前必讀）

- **飛行體必須掛 body**：卡片有 `transform`（translate(-50%,-50%) rotate）→ 是 fixed 子元素的 containing block，box 留在卡內飛不出卡座標系、也壓不到 veil（z:60）上。clone 版掛 body 就是為此。
- **reparent 會重啟 CSS animation**：box 兩次搬家（出巢 t=0、歸巢 t=1.6）track 的 keyframe 都會從 0 重跑 → 每次搬家後都要用「negative animation-delay」續相位（見 §4.1 helper）。
- **兩邊 keyframe 同一顆**（`color-rect-marquee`，[library.css:45-48](../css/components/library.css#L45-L48)）：色塊 inner 用 `--marquee-shift-x:-unitPx`＋5s；底部 track 用 `-unitW`＋`max(4, unitW/45)`s。相位換算用「unit 內比例」（frac = |tx| mod unit ÷ unit），兩邊 unit 寬近似（em-space×2 ≈ padding-right 2em）。
- **gsap 動 rotation 會清 CSS 個別 transform**（memory reference_gsap_nullifies_css_individual_transform）——box 本身沒有 CSS 個別 transform，無此問題；但歸巢時要把 gsap 寫的 inline transform 清乾淨（`clearProps`）。

## 4. Phase 1 實作（放大方向＋效能主修）

### 4.1 相位續接 helper（新增，library-card.js 內）

```js
// CSS animation 續相位：reparent/display 重啟後，用 negative delay 把 keyframe 進度撥回指定比例。
// frac ∈ [0,1)＝unit 內進度；animEl＝掛 animation 的元素（色塊 inner 或 .lib-title-track）。
function resumeMarqueePhase(animEl, frac) {
  const dur = parseFloat(getComputedStyle(animEl).animationDuration) || 5;
  animEl.style.animation = 'none';
  void animEl.offsetHeight;           // 單次 reflow commit（同 CLAUDE.md「揭前隱藏態必須已 commit」慣例）
  animEl.style.animation = '';
  animEl.style.animationDelay = `-${(frac * dur).toFixed(3)}s`;
}
// 讀當前相位比例：computed transform matrix 的 tx ÷ 該元素自己的 --marquee-shift-x 絕對值
function readMarqueeFrac(animEl) {
  const unit = Math.abs(parseFloat(animEl.style.getPropertyValue('--marquee-shift-x'))) || 0;
  if (!unit) return 0;
  const m = new DOMMatrixReadOnly(getComputedStyle(animEl).transform === 'none' ? '' : getComputedStyle(animEl).transform);
  return (Math.abs(m.e) % unit) / unit;
}
```

⚠️ 色塊 inner 的 `--marquee-shift-x` 是 [renderMarquee 寫在 inline style](../js/modules/pages/library-card.js#L342)；track 的是 [buildTitleMarquee 寫的](../js/modules/pages/library-panels.js#L2538)。`readMarqueeFrac` 讀 `el.style` 拿得到。

### 4.2 改寫 `flyMarqueeToTitle` → `adoptMarqueeToTitle`

沿用現有骨架（guards、First/Last 量測、`measureTitleOrigin`），差異：

1. **不 clone**。找到 `destBox = titleBar.querySelector('.lib-title-box')` 後：
   - 在「暫設最終幾何」量 Last 的同一窗，**多量三個值**：`rowW = destBox.getBoundingClientRect().width`（最終整行寬）、`titleH = titleBar.offsetHeight`（slot placeholder 用）、`destColor = getComputedStyle(titleBar).color`。
   - 讀換手參數：`srcLen = src.offsetWidth`（色塊 marquee 窗長）、`frac = readMarqueeFrac(srcInner)`、`srcColor = getComputedStyle(src).color`。
2. **同幀換手**：
   ```js
   src.style.visibility = 'hidden';                  // 色塊 marquee 即刻藏（setAsGray 稍後也會做，這裡先做保同幀）
   titleBar.dataset.marqueeFlying = '1';             // §4.4 防 buildTitleMarquee 重建空 box
   titleBar.style.minHeight = `${titleH}px`;         // slot placeholder：box 離巢後列高不塌（否則 t=1.6 歸巢內容跳 ~29px）
   document.body.appendChild(destBox);               // adopt 出巢（脫離 titleEl 的 clipPath 遮罩）
   Object.assign(destBox.style, {
     position: 'fixed', left: '0', top: '0', margin: '0',
     width: `${rowW}px`,                             // 蓋掉 buildTitleMarquee 的 '100%'（body 下 100%=viewport 寬，錯）
     transformOrigin: '0 0', zIndex: '9999', pointerEvents: 'none',
     color: srcColor,                                // 起飛字色＝色塊字色 #000（mode2/3 落地色不同，tween 過去）
     clipPath: `inset(0px ${Math.max(0, Math.round(rowW - srcLen))}px 0px 0px)`,  // 窗只露色塊邊長（四值全 px）
   });
   const track = destBox.querySelector('.lib-title-track');
   resumeMarqueePhase(track, frac);                  // reparent 重啟了 keyframe → 對回色塊相位
   gsap.set(destBox, { x: first.x, y: first.y, rotation: thetaF });
   gsap.to(destBox, { x: last.x, y: last.y, rotation: 0, color: destColor,
     clipPath: 'inset(0px 0px 0px 0px)',
     duration: MORPH_DUR, ease: EASE.move, overwrite: true });   // 節奏 B：跟卡片 morph 同拍落定
   ```
3. **回傳 flight handle**（取代回傳 flyer element）：`{ box: destBox, home: titleBar, restore() }`。`restore()`＝§4.3 歸巢邏輯，供正常收尾與打斷 cleanup 共用。存到模組層 `let activeFlight = null`。
4. 量測失敗 / 手機 / reduced-motion 的**降級路徑不變**（回傳 null＝不飛）：box 從未離巢、veil 照常掀開露出底部列，行為＝現在拿掉 flyer 的樣子。

飛行 ease 先用 `EASE.move`（power2.inOut，近似卡片 TRANSITION 的 cubic-bezier(0.4,0,0.2,1)）；實機若覺得 box 跟卡片動勢脫節，微調 ease 即可（調整鈕，非結構）。

### 4.3 歸巢（`restore()`，t=1.6 clipAway onComplete 呼叫）

改 [clipAway onComplete 那段](../js/modules/pages/library-card.js#L807-L810)：`marqueeFlyer.remove()` → `activeFlight.restore()`。restore 內容：

```js
gsap.killTweensOf(box);
const frac = readMarqueeFrac(track);                    // 歸巢前先記相位（reparent 又會重啟）
home.querySelectorAll('.lib-title-box').forEach(b => { if (b !== box) b.remove(); });  // 清空殼 box 兜底（§4.4）
// 清飛行 inline：position/left/top/margin/transformOrigin/zIndex/pointerEvents/color/clipPath 全清空字串；
// width 還原 '100%'（buildTitleMarquee 的值）；gsap.set(box, { clearProps: 'transform' }) 清 x/y/rotation。
home.appendChild(box);                                  // 回到 in-flow（幾何＝落點幾何 → 零跳動）
resumeMarqueePhase(track, frac);
home.style.minHeight = '';
delete home.dataset.marqueeFlying;
activeFlight = null;
```

### 4.4 `buildTitleMarquee` 防重建（library-panels.js 小配合）

box 離巢期間 t=0.6 的 `showLibPanel` 會再跑 [buildTitleMarquee](../js/modules/pages/library-panels.js#L2511-L2525)：`querySelector('.lib-title-box')` 找不到（box 在 body）→ 會用空的 titleEl 重建一顆**空 box**（label 空的 early-return 在建完 DOM 之後）→ 歸巢後 titleEl 有兩顆 box、之後永遠抓到空的那顆。修法（兩道都做）：

1. `buildTitleMarquee` 開頭加 guard：`if (titleEl.dataset.marqueeFlying) return;`
2. `restore()` 歸巢前清掉 stray box（§4.3 已含）。

### 4.5 打斷／離頁 cleanup（重要：box 是真節點，**不能 remove**）

- [_doSwitchTab 開頭清 flyer 的區塊](../js/modules/pages/library-card.js#L677-L681)：改成 `if (activeFlight) activeFlight.restore();`（restore 已含 killTweens；打斷時 home panel 可能已 display:none——照樣歸巢，隱形待命即可）。
- [registerPageCleanup 清 flyer 的區塊](../js/modules/pages/library-card.js#L1022-L1028)：同上改 `activeFlight?.restore()`。
- `.lib-marquee-flyer` class 與相關殘碼全刪。

### 4.6 效能主修：morph 期間 contentEl display:none

- 在 `_doSwitchTab`：`adoptMarqueeToTitle(...)` 回來**之後**（Last 量測需要 layout，順序不可倒）：`contentEl.style.display = 'none';` → 放大卡變空盒（只剩 veil＋隱藏的 title div），幾何 TRANSITION 每幀 layout 成本趨近零。內容本來就在 veil 下＝零視覺差。
- 在 [t=0.6 的 setTimeout](../js/modules/pages/library-card.js#L765) 內、`onDone()` **之前**：`contentEl.style.display = '';`（onDone → onTabSwitch {instant:true} 渲染內容，此刻恢復顯示才量得到）。
- 打斷兜底：`switchTab`／`_doSwitchTab` 開頭無條件 `contentEl.style.display = '';`（連點打斷時舊 timeout 尚未還原的保險）。
- 附帶效應：display:none 重啟 panel 內所有 CSS animation——都在 veil 下、無感；底部 track 反正歸巢時會 resumeMarqueePhase。

### 4.7 註解同步

- 刪掉「飛行體不透明」錯誤註解（[line 805-806](../js/modules/pages/library-card.js#L805-L806)）；P1/P2 clone 相關註解改寫為單一物件版描述（含「⚠️box 是真節點、cleanup 走歸巢不 remove」「⚠️卡片 transform＝fixed containing block、飛行必掛 body」兩條 why）。

## 5. Phase 2：縮小方向鏡像（**Phase 1 實機驗證 OK 才做**）

舊灰卡縮成新色塊時，它的底部列 marquee 同樣單一物件飛到新色塊邊緣（label 同字：tab 跟卡走）。鏡像重點：

1. **t=0 順序**：在 `onTabSwitchPre`（舊 panel display:none）**之前**，先把舊 panel 的 box adopt 到 body（display:none 祖先下 fixed 元素不渲染，必須先搶救）。adopt 位置＝其當下螢幕原點（rotation 0、窗長 rowW 全長）、phase-resume。
2. **終點提前定案**：[cfgCache.set(outgoingEl, newCfg)](../js/modules/pages/library-card.js#L724) 之後即刻 `renderMarquee(outgoingEl)`（此刻 cfg 已是新版位；tabOf 未變）→ 渲染出的就是最終那份（**不會** t=1.6 重算選到不同邊），然後 `visibility:'hidden'` 藏著。終點量測＝暫設 outgoingEl 為 newCfg 幾何 → reflow → `measureTitleOrigin(src2)`＋總旋轉（newCfg.rot + src2 的 ±90/0）→ 還原 → reflow（同 forward 的 trick；必須在 [setAsColor 起 transition](../js/modules/pages/library-card.js#L755-L756) 之前做）。
3. **飛行**：0.6s 同拍，clip 窗長 rowW → destLen（inset right 反向長大）、rotation 0 → thetaF2、color destColor → #000。
4. **交棒**：[clipIn onComplete](../js/modules/pages/library-card.js#L815-L820) 改——**跳過** `renderMarquee(outgoingEl)` 與 `revealMarqueeTitle(outgoingEl)`（t=0 已渲染、box 佔著同位置＝免 hero reveal），改成：`resumeMarqueePhase(色塊 inner, box 當下 frac)` → `src2.style.visibility='visible'` → box restore 歸巢（回 display:none 的舊 panel，隱形待命）。
5. cleanup handle 擴成 `activeFlights` 陣列（兩方向可並存）。

## 6. 驗證 checklist（交付前 Opus 自驗）

- **headless**（⚠️memory 鐵則：fresh node static server、量前 curl 確認 serve==disk）：
  - 桌面 1280×800，進 /library，依序點三色塊各一次＋next-btn 循環一輪：全程截幀確認 (a) 任何時刻**只有一條**該 label 的 marquee 可見（無雙層字）(b) 飛行中兩張相隔 200ms 截圖字模位移（捲動沒凍結）(c) t=1.6 歸巢前後兩幀 diff、內容區無縱向跳動（slot placeholder 有效）。
  - 連點狂點（<0.6s 間隔連切 4 次）：無殘留 body 下的 `.lib-title-box`、每個 panel titleEl 恰一顆 box、contentEl display 已還原。
  - 切到別頁再回來：無殘留、marquee 正常。
  - 手機視窗 375：不飛（guard），行為同現在。
- **實機**（headless 不準的部分）：t=0 換手幀的字距差（em-space vs padding 2em，預期 1-2px 內可接受，明顯就回報）；mode2/mode3 飛行字色；放大順滑度主觀感受（效能主修效果）。

## 7. 已知風險／不做的事

- t=0 換手有理論上 1-2px 字距差（兩邊 unit 結構不同）——驗收點，超出再調。
- mode3 hue loop 飛行中翻 `--lib-fg`：color tween 目標是 t=0 快照——與 clone 版行為一致，本輪不處理。
- ❌ 不退回 clone＋交棒；❌ 不釘 veil 方向（user 定案 veil 在 marquee 底下任意向擦）；❌ 不動 `color-rect-marquee` keyframe 與兩邊 marquee 結構本身。

---

## 8. 第二輪修正（2026-09-05 user 驗收回饋，Phase 1 已實作後）

> user 四點回饋：①色塊要跟灰卡是一個整體、會旋轉過去 ②飛行中 marquee 變小變 regular、veil 掀完才出現正確的、像兩種東西 ③色塊→灰卡跳一下不連貫 ④色塊 marquee 只准放左右邊、不准上方。
> 診斷已完成（fable 09-05），①③同一根因、②獨立根因、④是新設計決定。**Phase 2 仍維持 gated。**

### 8.1 修「放大 morph 被吞掉、直接跳成灰卡」（回饋①③根因）

`adoptMarqueeToTitle` 量 Last 的「暫設 final→量→還原」把 **transition 連同幾何一起放進還原批次**（存進 `s` 再 `Object.assign` 一次還原）→ 還原那次 style recalc 時 transition 已是 `TRANSITION`、幾何從 final 變回色塊值 ⇒ **瀏覽器起了一條 final→色塊 的反向 transition**（此刻 computed ≈ final）；緊接著 `setAsGray` 把目標又設回 final ⇒ retarget 時 computed 已在 final ⇒ final→final 無位移，**0.6s 放大 glide 整段被吞掉、卡片下一幀直接以灰卡全尺寸出現**。（同 task 內沒有中間 paint，所以看起來就是「跳一下」。此 bug 在 clone 版 `flyMarqueeToTitle` 就存在＝當初「不夠順滑」的一部分真因。）

**修法**：還原批次**不含 transition**——`s` 不存/不還原 transition，還原幾何時維持 `transition:'none'`、`void offsetHeight` 讓色塊幾何落定 commit，之後回到 `_doSwitchTab` 才設 `TRANSITION`＋`setAsGray`（同批：前態=色塊/none、新態=final/TRANSITION ⇒ 正常起 色塊→final 的 0.6s 放大＋旋轉 glide）。⚠️Phase 2 的暫設量測（§5.2）**同規則**。修完①的「一個整體、帶旋轉 morph 過去」即成立（rotate 在 TRANSITION 的 transform 軌內一起 glide）。

### 8.2 修「飛行中 marquee 變小變 regular」（回饋②根因）

`.lib-title-box` 自己**沒有任何字型規則**，xl/700/Inter/1.2 全繼承自 `.lib-panel-title`（[library.css:57-68](../css/components/library.css#L57-L68)）；adopt 到 `body` 後改繼承 body 字型（16px/400）→ **飛行全程是小號 regular 字**，歸巢 re-inherit 才變回正確樣子＝user 看到「兩種東西、veil 掀完才出現」。

**修法**：adopt 時把字型 longhands 從 `getComputedStyle(titleBar)` 複製成 box inline：`fontFamily / fontSize / fontWeight / fontStyle / lineHeight / letterSpacing`（保險再加 `whiteSpace:'nowrap'`）；`restore()` 歸巢時全部清空字串。修完飛行字條厚度＝色塊字條厚度（同 xl×1.2），t=0 換手同厚零跳。

### 8.3 色塊 marquee 只放左右邊（回饋④，新設計決定）

`findFreeEdge`（[library-card.js](../js/modules/pages/library-card.js#L188-L198)）改成**只考慮垂直邊**：首選＝朝外垂直邊（cx<中心→left、否則 right），兩端點被遮→退另一側垂直邊，再不行仍回朝外垂直邊；**top/bottom 水平邊全撤**。理由＝灰卡 marquee 在底部，色塊 marquee 固定在左右 ⇒ 飛行一律 ±90°→0 的一致旋轉敘事（呼應回饋①「會旋轉方向」）。

- 影響範圍＝所有色塊 marquee（初始佈局、切換後新卡、resize relayout）——這是刻意的全域改。
- 寬扁卡的垂直邊較短 ⇒ 窗長變短：`axisPad` 已自適應（`min(AXIS_PAD, rectPx/4)`），可接受，不另處理。
- `renderMarquee` 的 left/right 分支（朝外 rotate ±90 定位）照舊沿用，不用動。

### 8.4 驗證追加（第二輪交付前）

- headless 截幀：(a) 點色塊後有**中間尺寸的幀**（放大 glide 存在、非兩幀跳變），旋轉同步歸零 (b) 飛行中字模＝xl/bold（與落地同大小同粗細，200ms 兩幀比對仍在捲）(c) 三張色塊的 marquee 全部在左緣或右緣、無 top/bottom。
- 實機：整體「色塊→灰卡一個整體轉過去」的連貫感；t=0 換手幀。

---

## 9. v3「同一物件雙形態」（2026-09-05 第三輪，user 定案，取代 veil 語言）

> user 回饋：「怎麼看都是兩個東西」＋「marquee 會提前先轉變到底部，但應該跟色塊一起」。
> 定案＝**卡片本體原地變形**：每張卡永久綁一個分頁（`tabOf` 現況已是、不用改結構），兩種形態＝色塊（小/RGB/斜/邊緣 marquee）↔ 灰卡（大/灰/正/底部 marquee）。切換＝被點卡「色塊形態→灰卡形態」一條 morph（幾何＋底色＋marquee 同拍），舊灰卡反向。**veil「蓋住再掀開」語言整套刪除**——那是「兩個東西」感的唯一來源。

### 9.0 新時間軸

```
t=0    點擊 → 舊 panel 內容瞬隱（onTabSwitchPre，不變）
       被點卡：0.6s morph＝幾何(放大+轉正) + 背景 RGB→灰 同拍 + marquee 卡內飛到底部列位置（§9.4）
       舊灰卡：0.6s morph＝幾何(縮小+轉斜) + 背景 灰→RGB 同拍
t=0.6  兩卡落定。contentEl 恢復顯示 → onTabSwitch 渲染內容 → playPanelReveal **非 instant**
       （現成四向 wipe 進場；標題列本來就 instant 現身不參與 wipe）→ marquee box 下一 rAF 歸巢。
       舊灰卡 marquee 此刻 renderMarquee + revealMarqueeTitle（原在 clipIn onComplete，提前到這）。
總長 ~0.6 + 內容 wipe ~0.5 ≈ 1.1s（原 1.6s）。
```

### 9.1 刪除清單（veil 機制全撤）

- `_doSwitchTab` 內：中央 `veil`、`colorVeil`、`veilColor`（mode3 特例）、`VEIL_HOLD`、`clipAway`、`clipIn`、隨機 `dir` 共用機制——全刪。
- `clickedEl` z:15→10 的還原時點：從 clipAway onComplete 移到 t=0.6 setTimeout 內。
- switchTab 開頭清 `.lib-card-veil` 殘留的區塊可留一版當兜底（無害），下次整理再刪。
- main-modular.js `onTabSwitch` 呼叫 `panels.showPanel(tab, opts)` 的 `{instant:true}` 拿掉（v3 走非 instant wipe；`playPanelReveal` 的 instant 分支與 `VEIL_REVEAL_DELAY` 邏輯自然不再走到，**先留碼不刪**——進場路徑 deep-link 仍可能用）。

### 9.2 背景色同拍變形

- morph 時窗的 transition 改用「幾何＋`background-color 0.6s`」版本（新常數，如 `TRANSITION_MORPH`），**兩張卡都套**；收尾 `applyIdleTransition` 還原（穩態不帶 bg fade 的紀律不變，hover/mode 翻色仍 snap）。
- 被點卡：`setAsGray` 已寫 `background:var(--lib-bg)` → 在 TRANSITION_MORPH 下 RGB→灰自然補間。舊灰卡：`setAsColor` 寫 RGB → 灰→RGB 補間；**刪掉現行「縮小期間維持純灰」的 `background='var(--lib-bg)'` 覆寫**（該行存在的理由＝colorVeil 掀入，veil 刪了就不需要）。
- **mode3 機制**（已查證 [color.css:734-751](../css/themes/color.css#L734-L751)）：mode3 的黑白強制靠 `[style*="--lib-bg"]` 選擇器切規則（含/不含 inline `--lib-bg` 標記決定走反色島或 strict B/W !important）。CSS transition 補間的是 **computed 值**——切換瞬間規則翻面（theme-fg ↔ 島灰），只要 transition 掛著，黑→灰照樣平滑。**實測若有 snap** 的 fallback＝過場 class 提特異度（前例 atlas `.atlas-b-exit`，見 memory reference_mode3_bw_override_selector_goes_stale）。
- 旋轉盒雙色層邊緣反鋸齒問題（08-24 veil 的起因之一）在單層 bg 補間下**不存在**，不用處理。

### 9.3 內容進場

- t=0.6 順序：`contentEl.style.display=''` → `onDone()`（→ onTabSwitch 渲染 → `showLibPanel(tab)` 非 instant → `playPanelReveal` 四向 wipe）。標題列走 `playPanelTitleReveal`（instant 現身）＝現成行為，不用改；它現身那幀 box 正浮在同一位置（§9.4 landing＝bar 位置），下一 rAF 歸巢＝無縫。
- 內容渲染＋wipe 都擠在 t=0.6 同刻（原本渲染藏在 veil hold 的 0.5s 裡）——render 是單次 hit、成本跟現在一樣，只是沒有靜默窗；弱機實測若 t=0.6 有感 hitch，再考慮把渲染提前到 morph 中段（contentEl 保持 display:none 渲染、落定才顯示）。

### 9.4 marquee 改「卡內飛」（解「提前先轉變到底部」）

**核心**：veil 刪了，box 不再需要壓過 veil ＝ **不用掛 body**。改 adopt 到 `clickedEl`（卡片本身）當 absolute 子元素飛——**子元素天生跟著卡片的 transform 一起轉、跟著幾何一起長**，「跟色塊一起」是結構自帶，螢幕空間直線先到底部的問題直接消失。

與 §4 的差異（其餘機制全保留：font 快照 §8.2、`marqueeFlying` guard §4.4、相位續接 §4.1、slot placeholder、clip px 窗長、字色 tween、餐風 idempotent restore §4.3、打斷/離頁歸巢 §4.5）：

1. **adopt 目標**：`clickedEl.appendChild(destBox)`（非 body）。樣式：`position:absolute; left:0; top:0; transformOrigin:'0 0'; z-index:70; pointer-events:none`＋font 快照＋clip 窗。⚠️字型繼承來源變成卡片 div（一樣是 body 字型）→ font 快照**仍必要**。
2. **First 免量測**：起點＝src `.color-rect-title` 的 inline `left/top`＋`rotate(±90)`（renderMarquee 寫的局部座標，直接 parse）——不再需要 `measureTitleOrigin(src)` 螢幕量測與 thetaF 合成（卡片自身的 ±3° 由父層自帶）。
3. **Last＝局部座標**：沿用「暫設 final 幾何」時窗（§8.1 規則：還原批次不含 transition），量 `measureTitleOrigin(destBox)` 螢幕座標**減去卡片 final 幾何下的 gBCR 左上**（final rot=0 → gBCR＝border box，減法即局部座標）。
4. **tween**：gsap 動 box 的 `x/y/rotation`（local px，left/top 錨 0）＋clip 窗 px、字色，duration=MORPH_DUR、ease 照 EASE.move——box 在卡片座標系內滑動，卡片的旋轉/放大由父層 transition 同步帶著走。
5. **歸巢 t≈0.6**：t=0.6 setTimeout 內容 render 完（bar 已 layout、有 minHeight placeholder）→ 下一 rAF `restore()`（box 從卡片子元素搬回 titleBar in-flow，同位置零跳動）。**不再等到 1.6**、也沒有罰站期。
6. `resumeMarqueePhase` 兩次 reparent 照舊要做（出巢入卡、歸巢回列都重啟 keyframe）。

### 9.5 舊灰卡收尾

- marquee：`renderMarquee(outgoingEl)` + `revealMarqueeTitle(outgoingEl)` 從 clipIn onComplete 移到 t=0.6 setTimeout（縮小落定即渲染揭露）。
- Phase 2（底部列 marquee 反向飛回新色塊邊緣）**仍 gated**，但備註：v3 語言下它同樣是「卡內飛」（adopt 進 outgoingEl、局部座標鏡像），比原 §5 的 body 版簡單，之後做直接套 §9.4 模式。

### 9.6 驗證（v3 交付前）

- headless 截幀：(a) 全程無任何 `.lib-card-veil` 生成 (b) 被點卡 bg 有中間色幀（RGB→灰補間存在）、舊灰卡反向 (c) **marquee 貼卡驗證**＝morph 中段抽 3 幀，marquee 條與卡片邊緣的相對位置連續變化、無「先到底部等卡」 (d) t=0.6 標題列現身與 box 歸巢無跳動/無雙影 (e) 內容 wipe 正常、總長 ~1.1s (f) 連點/離頁無殘留。
- 實機：mode1/2/3 各切一輪（mode3 重點看 bg 補間有無 snap→有就上過場 class fallback）；弱機看 t=0.6 hitch。

---

## 10. v3.1 修正（2026-09-05 第四輪，user 驗收 v3 後回饋）

> user 三點：①放大應是「旋轉＋放大」才看得出 marquee 連貫（現在 marquee 旋轉 90° 但卡片只轉 3°、量級脫節）②marquee 會「從灰卡下方浮上來」很奇怪 ③色塊 marquee 可以放在**底邊**，轉灰卡就不用旋轉——**採納為主策略**（取代 §8.3「只放左右」）。
> 「浮上來」根因：left 邊 marquee `rotate(+90)` 字條從原點往下長；飛行中原點滑近底部落點、旋轉未完＝字條斜伸出卡片底邊外（灰卡態 overflow:visible 不裁），再掃上來轉平。

### 10.1 Edge 策略 v3（取代 §8.3）

`findFreeEdge` 候選順序改為：**①底邊（兩端角落 free 才選）→ ②朝外垂直邊 → ③另一側垂直邊 → 永不 top**。
- 上半部色塊底邊朝灰卡＝角落被遮 → 自然退到垂直邊；下半部色塊底邊朝外 → 用底邊＝「有些色塊 marquee 在下面」。
- `renderMarquee` 的 `bottom` 分支（`left=axisPad; bottom=PAD`，無 rotate）既有、照用。

### 10.2 底邊型飛行＝零旋轉、貼底邊長大

- **改用 bottom 錨定 tween**：box 定位用 `left`＋`bottom`（非 top/transform y）——`bottom: PAD→12px`（12＝bar 的 padding-bottom）、`left: axisPad→barPadLeft`，rotation 恆 0，clip 窗長照舊 tween。
  bottom 錨定＝box 釘在「卡片底邊」座標系，卡片長高時 marquee **物理上貼著底邊一起往下走**——即使卡片 CSS bezier 與 gsap ease 有微差也不會脫底邊（top 錨定會因 ease 差在飛行中離底邊飄幾 px）。
- First 起點：底邊型 src 的 inline 是 `style.bottom`（非 top）——parse 時直接沿用 bottom 軌，免換算。
- Last 的 bottom 值：暫設 final 幾何時量 `cardRect.bottom - destBoxRect.bottom`（或直接用常數 12，量測為準）。

### 10.3 垂直邊型（fallback）修「從下方浮上來」

1. **morph 期間卡片 overflow 維持 hidden**：把 `setAsGray` 的 `overflow:'visible'` 延後到 t=0.6 setTimeout 才設（block 態本來就 hidden）→ 旋轉中的字條被卡邊裁掉、**物理上不可能出現在卡片外**。內容 morph 期間 display:none、底部 bar 在卡內，無其他東西需要凸出卡外（next-btn 在 section 層不受影響）。
2. **旋轉提前轉完**：rotation 拆成獨立 tween、duration ≈ MORPH_DUR/2（前 0.3s 在來源邊附近就轉正），x/y 位移照走滿 0.6s → 「在邊緣轉正、再平移入位」，不會帶著斜角接近底邊。

### 10.4 驗證追加

- headless：多切幾輪覆蓋「底邊型」與「垂直邊型」兩種來源；(a) 任何幀 marquee 都不得出現在卡片邊界外 (b) 底邊型＝全程貼卡底邊（抽幀量 marquee 底緣與卡底緣距離恆定 PAD→12 平滑過渡）、rotation 恆 0 (c) 垂直邊型＝旋轉在前半段完成。
- 實機：底邊型的「色塊底標籤長大成底部列」連貫感（本輪核心驗收點）。

---

## 11. v3.2「卡片依 marquee 邊做 ±90° 旋轉放大」（2026-09-05 第五輪，user 定案）

> user：「現在色塊去灰卡看起來只是原地放大——應該以色塊的位置、**考慮 marquee 的位置**，做旋轉及放大」。
> 定案＝垂直邊型不再讓 marquee 自己轉 90°（§10.3 的「旋轉提前」**廢除**），改成**整張卡旋轉 ±90°，把「帶 marquee 的那條邊」轉成灰卡的底邊**——marquee 全程釘在自己的邊上、零自身旋轉，連貫性由卡片旋轉承載。底邊型（§10.2）不變（旋轉 ±3°→0）。

### 11.1 旋轉方向（幾何已驗證，含文字方向）

- marquee 在**左邊**（`rotate(90)` 讀上→下）→ 卡片旋轉至 **−90°**（逆時針）：左邊變底邊；字 +90 被卡 −90 抵銷＝水平左→右；閱讀起點（上端角）轉到視覺左下＝與底部列同從左起讀。
- marquee 在**右邊**（`rotate(-90)` 讀下→上）→ 卡片旋轉至 **+90°**（順時針）：右邊變底邊；−90+90=0；閱讀起點（下端角）轉到視覺左下 ✔。
- 卡片現有 ±3° 基礎傾斜直接併入補間（rot → ∓90 一條 tween）。

### 11.2 尺寸對調 + t=0.6 正規化（核心機制）

轉 ±90° 後元素座標系跟視覺對不上，用「**morph 用對調尺寸、落定後同幀正規化**」：

1. **morph 目標（垂直邊型）**：`width → MAIN_H`、`height → MAIN_W`（**對調**）、`transform rotate → ∓90°`、left/top → 螢幕中心。旋轉繞中心＋`translate(-50%,-50%)` 置中 → 視覺盒＝MAIN_W×MAIN_H 正立灰卡版位，marquee 邊落在視覺底邊，**像素級精確**。
2. **t=0.6 正規化幀**（在 contentEl display 還原/內容渲染**之前**）：同幀把 `rotate(∓90)＋(MAIN_H×MAIN_W)` 換寫成 `rotate(0)＋(MAIN_W×MAIN_H)`（transition:none 下直寫；兩組參數視覺完全等價＝零跳動），同幀把卡內飛行 box 從「垂直邊座標」重寫成「底邊座標」（等價像素映射）。之後照 §9.3 流程走（內容渲染在正立座標系內、wipe 進場、box 下一 rAF 歸巢）。
3. **飛行 box 邊錨定**（取代 §9.4 的 x/y tween、延伸 §10.2 的錨定思路）：左邊型用 `left`（邊內縮 `PAD+lineH → 12+lineH` 當量值，實際以 final 量測為準）＋`top`（沿邊 `axisPad → 32`）；右邊型用 `right`＋對應沿邊軌；box **不做自身 rotation tween**（local rotate(±90) 保持不動，視覺轉正全靠卡）。clip 窗長 tween 照舊（邊長 → MAIN_W 整行）。
4. 舊灰卡縮小方向照舊 ±3°（不做反向 ∓90；Phase 2 一併考慮）。

### 11.3 打斷處理

- 卡片可能在「pre-正規化」狀態（對調尺寸＋∓90）被連點打斷：`_doSwitchTab` 開頭偵測（卡上戳 dataset flag）→ **先即刻正規化**（transition:none 直寫等價參數）再走原本的 killTweens/重定位流程，避免從對調座標系直接 tween 到新色塊參數出現怪異擺動。
- `restore()`（box 歸巢）本身空間無關（回 titleBar + 清 inline），不用改。

### 11.4 §10.3 的取代關係

- 「rotation 拆獨立 tween 前半轉完」**廢除**（不再有 marquee 自身旋轉）。
- 「morph 期間卡 overflow 維持 hidden（visible 延到 t=0.6）」**保留**當保險絲（marquee 理論上恆在卡內，裁切是兜底）。

### 11.5 驗證

- headless：垂直邊型抽幀 (a) marquee 相對卡片邊的位置恆定（貼邊不自轉）(b) 卡片旋轉與放大同步、中段有明顯斜角大卡幀 (c) 正規化幀前後兩幀 pixel-diff ≈ 0（無跳動）(d) 底邊型行為不變；連點打斷落在 pre-正規化窗內 → 下一輪切換無怪異擺動。
- 實機：左邊型與右邊型各驗一次文字方向（轉完由左讀到右、字不顛倒）；90° 旋轉大卡掃過畫面的觀感（過猛的話調 MORPH_DUR 0.6→0.7~0.8，標為調整鈕）。

---

## 12. v3.3 兩項修正（2026-09-06 第六輪，user 驗收 v3.2 後回饋；**一個個來、各自獨立交付驗證**）

### 12.1 修正 A：morph 保持原色 → 落定共存一瞬 → 才褪成灰（先做這個）

> user：「色塊旋轉放大之後，先不用直接 fade 成灰卡，保持一瞬間 marquee 跟色塊共存，下一刻才把色塊（顏色）去掉＝灰卡」。

新時間軸（放大方向；舊灰卡縮小行為**本輪不動**）：

```
t=0            幾何 morph 0.6s（旋轉＋放大），背景**保持 RGB 原色**（不再同拍變灰）
t=0.6          正規化落定＝全尺寸 RGB 大卡＋底部 marquee 共存的一瞬
t=0.6+HOLD     背景單獨 fade RGB→var(--lib-bg)（bg-only transition）；box 字色 #000→destColor 同窗
fade 完        contentEl 恢復顯示 → 內容渲染 → playPanelReveal wipe → box 下一 rAF 歸巢
```

實作要點：
1. morph 時窗 transition **拿掉 background-color**（回到幾何-only；`TRANSITION_MORPH` 拆兩段用）；`setAsGray` 寫的 `background:var(--lib-bg)` 在 t=0 覆寫回 `colorOf.get(clickedEl)`——⚠️點擊當下卡在 hover 態、inline bg 是 `#000`/`#fff`，必須顯式寫回 RGB 原色，不能沿用現值。
2. 新常數 `COLOR_HOLD = 0.2`、`COLOR_FADE = 0.35`（皆為調整鈕）：t=0.6 正規化後 setTimeout(HOLD) → 掛 bg-only transition（`background-color COLOR_FADE ease`）→ 寫 `background:var(--lib-bg)`。box 的 `color` tween 從 morph 段移到這一窗（起飛維持 `srcColor`）。
3. mode3：morph 期間 inline bg＝RGB → strict B/W `!important` 照舊蓋成 theme-fg（視覺同現況）；fade 時寫入 `var(--lib-bg)` 標記→選擇器翻反色島、computed 值走 bg transition 補間（機制同 §9.2、只是時點延後）。
4. 內容渲染/歸巢時點整體後移到 fade 完（原 t=0.6 的 setTimeout 內容段拆到 fade onComplete/transitionend＋timeout 兜底）；`isSwitching` 解鎖跟著後移。總長 ≈ 0.6+0.2+0.35+0.5 ≈ 1.65s（user 已表態分階段敘事 2~2.5s 可接受）。
5. 連點打斷：switchTab 開頭既有的「重設 bg=colorOf」自癒即涵蓋 fade 中斷；hold/fade 的 timer 要跟 morph timer 一樣可被下一輪作廢（存 handle、開頭 clear）。

### 12.2 修正 B：垂直邊型 marquee「卡一半→跳成全長」（A 驗收後做）

> user：「放大時 marquee 左右型有一刻卡在灰卡底部中間只占一半，然後跳一下變成完整長度」。

**根因（已讀碼定位）**：卡片幾何走 CSS transition（bezier `0.4,0,0.2,1`，前段快）、box 的 left/top/clip 窗走 gsap `EASE.move`（power2.inOut，前段慢）——**兩套引擎兩條曲線**，0.6s 內卡片一路領先，morph 後段卡片近全尺寸而 box 窗長仍 ~60-70%（視覺＝marquee 卡在底部只占部分長度）；t=0.6 `normalize()` 無條件 `killTweensOf`＋直寫 `clipPath: inset(0)`（library-card.js `normalize`），殘餘差距一幀收掉＝「跳一下」。

**修法＝box 改與卡片同引擎同曲線鎖步**：
1. box 的 `left/top/bottom/clip-path/color` 補間**改走 CSS transition**，曲線與時長跟卡片完全一致（`0.6s cubic-bezier(0.4,0,0.2,1)`）：adopt 時先 transition:none 寫起點 → reflow commit → 掛 transition → 寫終點（與卡片同 tick 起跑）。這些全是主執行緒屬性，不觸「transform+clip 雙管線微差抖動」舊坑（那條規範是針對 compositor transform 混 clip 的情境）。
2. gsap 只保留給不能用 CSS transition 的場景（目前 box 已無）；`normalize()` 改成純座標系換寫（此刻 transition 已自然走完、無 tween 可殺、無殘距可跳）；保險起見 normalize 前先把 box transition:none（防 timer 提早 5-10ms 觸發時起反向 transition——同 §8.1 教訓）。
3. 底邊型同步改（同曲線鎖步，行為不變、更貼）。
4. 相位/字型/guard/歸巢機制全部不動。

### 12.3 驗證（原文見下；§13 有追加項）

- **A**：headless 抽幀 (a) morph 全程卡片 bg 維持 RGB（無中間灰幀）(b) t=0.6~0.6+HOLD 存在「全尺寸 RGB 卡＋底部 marquee」幀 (c) fade 段 bg 有中間色幀、字色同步過渡 (d) 內容在 fade 完才出現；連點落在 hold/fade 窗內不留殘態。實機：mode3 fade 時點的翻色。
- **B**：headless 逐幀量「box 可見窗長 / 卡片當前邊長」比值全程單調平滑、末段無突變；normalize 前後 pixel-diff ≈ 0。實機：左右型不再有「卡一半→跳」。

---

## 13. v3.4 第七輪（2026-09-06，user 驗收 v3.3-A 後四點回饋；建議實作順序 B→13.2→13.3→13.1）

> user 四點：①marquee 切到灰卡還是有點 delay ②左右型 marquee 看得出被切一半再拉長（＝§12.2 B 未做，現在做）③下方（底邊型）marquee 放大時「往後退了一下再繼續走」④截圖：粉色底邊 marquee 被更高 z 的綠色塊蓋住，應選左邊。

### 13.1 delay 感（回饋①）——B 修完再調鈕

兩個來源：(a) morph 段 marquee 落後卡片（§12.2 兩引擎兩曲線，B 修鎖步即消）(b) HOLD+FADE 敘事節奏本身（0.2+0.35s）。**先做 B、實機感受**；仍嫌慢才調 `COLOR_HOLD 0.2→0.1`、`COLOR_FADE 0.35→0.25`（調整鈕，一次調一顆）。

### 13.2 底邊型「往後退一下再繼續走」（回饋③）

**根因**：捲動向左流動，但載體在動——位於畫面左側的色塊放大置中時，其底邊（含 marquee box）螢幕上往**右**位移；左向捲動疊右向載體＝字流視覺倒退。次因＝t=0 換手相位用「比例」映射（`readMarqueeFrac` 比例 × track 週期），兩邊 unit 寬微差時有一小步瞬間偏移。

**修法（一次殺兩因子）**：
1. **morph 期間捲動暫停**：adopt 時 track 設 `animation-play-state: paused`（相位已對到 src 當下畫面）→ 字條硬釘在卡上、純粹跟卡走（「跟色塊一起」最徹底）；t=0.6 落定（normalize/底邊型落定點）恢復 `running`。共存一瞬與褪灰期間字照常捲＝不會有 clone 版「凍死呆停」感（那時是停 1s 且全場靜止；這裡 0.6s 內全場都在動）。
2. **相位改 px 精確映射**：`delay = -(srcOffsetPx mod unitW) / unitW × durTrack`（`srcOffsetPx = |matrix.e| mod unitPx`，直接用 px 對齊、不再乘比例）——落定 resume 與歸巢 resume 都改用。
3. 垂直邊型同步套用（同樣受載體位移影響，只是方向不同）。

### 13.3 findFreeEdge 誤選被遮底邊（回饋④）

**根因**：只檢查邊的**兩個端點角落**（`isCornerOccluded`）——遮擋物蓋住邊的中段/字條帶時兩角仍 free；且相鄰貼齊時角落剛好落在遮擋物邊界上，`pointInRect` 嚴格不等式把邊界點判為未遮 → 底邊誤判 free（截圖粉色案例）。

**修法**：改沿「**marquee 字條實際所在的帶**」採樣——邊往內縮 `PAD`（字條中線再加半個 lineH 更準）取 5 點（兩端縮 axisPad ＋ 1/4、1/2、3/4），**任一點**被更高 z 的 occluder 蓋住＝該邊不可用，換下一候選（底邊→朝外垂直邊→另側垂直邊的順序不變）。三個邊型共用同一採樣函式（取代 corner-only 檢查）。

### 13.4 驗證（§14 有後續輪次）

- **13.2**：headless 底邊型抽幀＝morph 期間 track computed transform 不變（paused 實錘）、落定後恢復前進、換手/落定/歸巢三個時點 glyph 對位 px 級；實機看「不再倒退」。
- **13.3**：重現截圖佈局（多切幾輪抽查）＝任何色塊的 marquee 帶 5 採樣點都不在更高 z 卡片覆蓋範圍內；貼齊相鄰（邊界重合）案例選到垂直邊。
- **13.1**：B＋13.2 落地後實機主觀確認 delay 感，再決定是否動 HOLD/FADE 鈕。

---

## 14. v3.5 第八輪（2026-09-06，user 驗收 v3.4 後三點；順序 14.1 → 14.2 → 14.3）

> user 三點：①褪灰不要 fade、要 **clip-reveal 擦除**掉色塊的顏色 ②左右型 marquee 的遮罩（clip 窗）打開可以**再快一點**，比較看不出「從一半延伸開來」 ③Press 跟 Album 的 zebra list 載入邏輯應相同，但 Press 的**副標好像提早出現**——直接套 Album 的做法。

### 14.1 褪灰改「clip 擦除」（取代 §12.1 的 background-color fade）

新收尾序列（morph＋共存一瞬照舊，只換「去色」段）：

```
t=0.6           正規化落定＝全尺寸 RGB 卡＋底部 marquee 共存（照舊）
t=0.6+HOLD      (a) 卡本體 bg 直寫 var(--lib-bg)（transition:none；藏在 overlay 下不可見）
                (b) 同幀疊「色彩 overlay」：inset:0、bg=clickedColor（mode3＝var(--theme-fg)，沿用舊 veilColor 邏輯）、
                    z 低於 marquee box(70) 高於內容、pointer-events:auto（擋點擊到擦完）
                (c) 內容在 overlay 底下渲染就位（contentEl display 還原＋onDone 提前到這一幀；
                    playPanelReveal 走 instant 路徑＝veil 時代的「掀開即見」，scroll-gate 照舊）
擦除            overlay clip-path 隨機四向擦除（WIPE_DUR≈0.4s，調整鈕）——marquee box 浮在 overlay 之上
                全程可見一直捲（user 既定原則「色塊在 marquee 之下擦除」）
擦完 onComplete  remove overlay → box 歸巢 → isSwitching 解鎖
```

要點：
1. overlay 給新 class（如 `.lib-color-wipe`），`_doSwitchTab` 開頭與離頁 cleanup 補「query＋killTweens＋remove」（連點打斷兜底）；COLOR_FADE 常數退場、COLOR_HOLD 保留。
2. box 字色 srcColor→destColor 的過渡移到擦除窗（跟 overlay 同時長）。
3. **附帶收益**：mode3 的 bg 補間疑慮直接消失——bg 直寫發生在 overlay 底下、selector 翻面不可見；overlay 自身顏色用 theme-fg（同舊 veil mode3 邏輯，見 §9.2/color.css 註）。
4. 擦除方向隨機四向即可（marquee box 在最上層、不受方向影響——當初「底部最後掀」的顧慮在單一物件版不存在）。

### 14.2 左右型 clip 窗打開加速（B 鎖步的節奏微調）

box 的 CSS transition 改 **per-property 時長**：`clip-path` 用 `CLIP_OPEN_DUR ≈ 0.4s`（調整鈕；其餘 left/top/bottom 維持 0.6s 與卡同拍同曲線）。窗長提早跑滿後會被卡片 `overflow:hidden`（§10.3 保險絲）裁到「當下邊長」＝視覺變成**貼著變長的邊一起拉長**，看不出是從一半延伸；底邊型同步套用（行為一致、無害）。

### 14.3 Press 副標提早出現（對齊 Album 做法）

user 指定：Press 與 Album 的 zebra list 載入邏輯應一致，Press 的副標（subtitle）在 load 時提早現身——**直接套 Album 的結構/做法**。實作步驟：
1. 對照 `initAlbumPanel` 與 `initPressPanel` 的 row 渲染＋reveal 路徑（`revealAwardItems` 進場、隱藏態出生 class、marquee init 時點），找出 Press 副標不受同一遮罩/gate 管的差異點（可能：副標元素不在 row reveal 的隱藏範圍內、或 subtitle marquee init 提早把 visibility 打開）。
2. 以 Album 版為準改 Press（結構對齊，別另發明第三種）；zebra 與 one-shot／search 重播行為不得回歸（見 memory reference_library_list_reveal_css_scrollgate，46a518e 已 commit 的三輪清單動畫）。
3. 驗證：headless 抓 Press 首載與切入時逐幀——副標與標題同一拍出現；Album 行為不變。

### 14.4 驗證

- 14.1：headless (a) HOLD 後有「RGB overlay＋marquee 浮其上」幀、擦除段 overlay clip 有中間幀（wipe 非 fade）(b) 擦除中內容已在 overlay 下（掀過即見）(c) 擦完 overlay 移除、box 歸巢、無殘留；連點落在擦除窗不留 overlay。實機：mode1/2/3 各一輪（mode3 overlay=黑/白翻）。
- 14.2：左右型抽幀＝窗長在 ~0.4s 即貼滿當下邊長、之後隨邊長大；無「一半延伸」感。

---

## 15. v3.6 第九輪（2026-09-06，user 驗收 v3.5 後五點；順序 15.1→15.4→15.2→15.3，15.5 反向獨立一輪）

> user 五點：①overlay 擦除時多了 opacity 感、只要純 clip ②marquee 窗長與色塊放大要**同步** ③旋轉放大看起來像從灰卡某角落長出、應「從色塊本身做旋轉＋位移＋放大」④點擊後游標不動、新色塊滑到游標下不會變 hover 黑（可點擊）、要移出再進才變 ⑤反向（灰卡→色塊）不要 fade 上色、應「先灰、色再覆蓋上去」且 marquee 要從灰卡底部列**過渡**成色塊 marquee（非另外加上去）。

### 15.1 「opacity 感」真因＝overlay 底下的卡在偷偷 fade（回饋①）

[library-card.js:921-923](../js/modules/pages/library-card.js#L921-L923)：`transition:'none'` → `background='var(--lib-bg)'` → `applyIdleTransition(clickedEl)`（TRANSITION_GRAY 含 `background-color 0.4s`）**同 tick 無 reflow**——bg 改變延到下次 recalc 才提交、彼時 bg transition 已掛回 ⇒ 卡在 overlay 底下 RGB→灰漸變 0.4s，擦除掃過處露出「半褪色」卡＝視覺像 opacity fade。**§8.1 教訓再犯**。
**修**：寫 `background` 後 `void clickedEl.offsetHeight` 強制 commit，**才** `applyIdleTransition`（或干脆把 applyIdleTransition 延到 wipe finish）。修完擦除＝純 clip、露出的直接是定型灰。

### 15.2 marquee 窗長與卡片放大完全同拍（回饋②，撤 §14.2 的 0.4s）

`CLIP_OPEN_DUR` 廢除——box 的 `clip-path` transition 回到與幾何**同 duration 同曲線**（morphDur 0.6s、bezier(0.4,0,0.2,1)），窗長與卡片同一刻抵達終點＝「一起放大到灰卡大小」。並複核起點 commit 順序（transition:none 寫起點 → reflow → 掛 transition → 寫終點），確保 clip 從 t=0 就在補間。配合 §15.3 的兩拍 morph：clip 窗跟「放大段」同 delay/duration。

### 15.3 垂直邊型 morph 拆兩拍：先轉、再飛（回饋③）

現況＝對調尺寸＋旋轉＋位移全同時補間 → 中段視覺外框（w(p)|cosθ|+h(p)|sinθ|）不均勻膨脹＝讀起來「從灰卡某角落長出來」。
**修＝per-property duration/delay 一條 transition 拆兩拍**：
- `transform`（rotate ∓90＋維持置中）：duration `ROT_DUR ≈ 0.25s`、delay 0——**在色塊自己的位置附近先轉完**；
- `width/height/left/top`（對調尺寸＋位移到中心）：delay `GROW_DELAY ≈ 0.15s`、duration ≈ 0.45s（總長仍 ~0.6s，兩拍重疊 0.1s 保流暢）；
- box 的位移軸與 clip 窗同「放大段」的 delay/duration（§15.2 同拍原則）；marquee 全程釘邊照舊。
- 底邊型不變（無旋轉）。ROT_DUR/GROW_DELAY 皆調整鈕。敘事變成「色塊原地轉 90°→帶著 marquee 飛過去放大成灰卡」。
- ⚠️ t=0.6 正規化與打斷兜底照舊；normalize 時間點改以「兩拍總長」為準。

### 15.4 hover 補發（回饋④）

根因：hover 黑是 JS `mouseenter` inline 寫的（[attachHover](../js/modules/pages/library-card.js#L384-L403)），切換期間新色塊滑到**靜止游標**下：瀏覽器不（可靠）補發 mouseenter，就算 fire 也被 `if (isSwitching) return` 吞掉；點擊不經 hover 所以可點。CSS `:hover` 偽類倒是會跟著 layout 更新。
**修**：`isSwitching` 解鎖那刻（switch 收尾＋entrance 收尾）補一輪：對每張非 active 卡 `if (el.matches(':hover'))` → 合成套 hover 樣式（bg #000/#fff＋z:11＋title color，抽 attachHover 內 handler 成可重用函式）；mouseleave 既有 handler 自然復原。前例＝activities hover-dim 解除時補發合成 mouseenter（memory reference_list_open_hover_dim_gate）。

### 15.5 反向「灰卡→色塊」完整鏡像（回饋⑤；**獨立一輪實作**，＝原 Phase 2 正式解鎖）

1. **上色改擦不改 fade**：outgoing 縮小段 transition 改幾何-only（撤 [TRANSITION_MORPH＋setAsColor 的灰→RGB 同拍](../js/modules/pages/library-card.js#L887-L890)）；setAsColor 後同幀把 bg 覆寫回 `var(--lib-bg)`（鏡像 §12.1 trick）→ 縮小全程維持灰。落定＋HOLD 後疊色彩 overlay（RGB／mode3=theme-fg）從隨機方向**擦上來蓋住**（clip 由 ENTER_CLIP[dir]→inset(0)，鏡像 14.1 的擦除）；擦完本體 bg 直寫 RGB（⚠️§15.1 規則：reflow commit 後才掛回 idle transition）＋同幀移除 overlay（同色換手無閃）。與被點卡的去色擦除**同 HOLD 同刻**進行＝「一邊擦掉色、一邊蓋上色」（呼應 08-24「同一刻」定案）。
2. **marquee 反向單一物件飛行**：
   - t=0（**在 onTabSwitchPre 與 contentEl 搬家之前**）：從當下顯示中 titleBar 抓 box adopt 進 **outgoingEl** 卡內（absolute、font 快照、placeholder、marqueeFlying guard 全同正向）；home 記原 titleBar（隨 contentEl 搬去新卡且 display:none，歸巢照樣回）。
   - 終點提前定案：`cfgCache.set(outgoingEl,newCfg)` 後即刻 `renderMarquee(outgoingEl)`（此渲染＝最終那份，`visibility:hidden` 藏）；暫設 outgoingEl 為 newCfg 幾何量 src2 局部座標與總旋轉（§8.1 還原規則）。落定後 clipIn 段**跳過**原 `renderMarquee+revealMarqueeTitle`（已提前渲染、box 佔位、免 hero reveal）。
   - 新色塊 marquee 在垂直邊 → outgoing 卡縮小時**鏡像 §11 整卡 ±90 旋轉**（底邊轉成該邊；morph 用對調尺寸、落定同幀「反正規化」成 newCfg 正常參數）；底邊型零旋轉、bottom 錨定。兩拍拆法（§15.3）同樣適用（先飛縮、末段轉？——鏡像順序＝**先縮小位移、最後 ~0.25s 轉 90°**，與正向對稱；調整鈕同）。
   - box：窗長 rowW→destLen 與縮小段同拍；捲動 morph 期間 paused；字色 destColor→#000 在上色擦除窗過渡。
   - **交棒**：上色擦完 → 真色塊 marquee `visibility:visible`＋px 精確相位 sync（resumeMarqueePhase 對色塊 inner）→ box 歸巢。
   - 打斷：`activeFlight` 擴成陣列（兩卡同時各有 handle）；outgoing 的 morphRotated 旗標同樣入 `_doSwitchTab` 開頭兜底正規化；overlay 兜底 query 沿用 `.lib-color-wipe`。
3. 實機驗收點：兩張卡同時 ±90 旋轉會不會太吵（若吵→反向改零旋轉直縮、只有 marquee 邊型是底邊的才全連貫，回報再定）。

### 15.6 驗證

- 15.1：擦除中抽幀＝露出區域直接是定型灰（無 RGB↔灰中間色）；wipe 全程無 opacity ≠1 的元素。
- 15.2＋15.3：垂直型逐幀＝前 ~0.25s 旋轉完成且卡仍在色塊附近、之後才明顯位移放大；窗長與卡片寬同幀抵達終點；正規化前後 pixel-diff≈0。
- 15.4：headless 模擬「點擊後不動滑鼠、新色塊移到游標下」＝解鎖後該卡即為 hover 黑；移開復原。

---

## 16. v3.7 第十輪（2026-09-06，user 驗收 v3.6 後三點；順序 16.1 → 16.2）

> user 三點：①色塊應該**邊移動、邊放大、邊旋轉**——現在（§15.3 兩拍）看起來是「先旋轉再放大」、很怪 ②marquee 在**底部**的色塊放大最自然、有銜接上去（＝品質基準，非改動項）③灰卡→色塊可用一樣邏輯：**縮小時保留灰**，到位時才 clip reveal 去掉灰、留下色塊。

### 16.1 撤兩拍、改「同起異收」（回饋①，推翻 §15.3）

§15.3 的嚴格兩拍（rotate 先 0.25s、幾何 delay 0.15s）被 user 打回：讀起來是「先旋轉、再放大」兩段式。但直接退回 §15.3 之前的「全屬性同長同時」又會回到「從灰卡角落長出」（bbox 在尺寸已大時還在轉、膨脹最不均勻）。取中＝**同起異收**：

- [library-card.js:889](../js/modules/pages/library-card.js#L889) 的 per-property transition 改：
  - `transform`：duration `ROT_DUR ≈ 0.35s`、**delay 0**；
  - `width/height/left/top`：duration `MORPH_DUR (0.6s)`、**delay 0**。
- 全部屬性 **t=0 齊發**＝邊移動邊放大邊旋轉；rotate 在位移/放大約六成處先落定＝尺寸變大的後段不再帶旋轉、bbox 膨脹不均勻的最糟區間避開。
- box（[line 755 boxT](../js/modules/pages/library-card.js#L755)）的 `left/top/clip-path` delay 歸 0、duration 回 `MORPH_DUR`，與幾何段同拍（§15.2 同拍原則不變）。
- `GROW_DELAY` 常數刪除；`ROT_DUR` 留調整鈕（實機若仍見角落感 → 試 0.3；若旋轉早收突兀 → 試 0.45）。
- t=0.6 正規化、`morphRotated` 打斷兜底、底邊型（零旋轉、單一 TRANSITION）全部照舊。
- ⚠️ 起點 commit 順序不得動搖（§8.1/§15.2）：transition:none 寫起點 → `void offsetHeight` → 掛新 transition → 寫終點。若「角落長出」在同起異收下復發，先驗這條鏈有沒有被繞過，再動 knobs。

### 16.2 反向縮小全程灰＋落定灰 overlay 擦除（回饋③；＝§15.5-1 提前單獨落地，marquee 反向飛行**不在本輪**）

現況：[library-card.js:909-910](../js/modules/pages/library-card.js#L909-L910) `setAsColor` 的 RGB 在 `TRANSITION_MORPH` 下與幾何同拍灰→RGB fade。改為正向的完整鏡像：

```
t=0             outgoingEl 掛 TRANSITION_MORPH → setAsColor(outgoingEl, clickedColor, newCfg)
                → 同 tick 覆寫 outgoingEl.style.background='var(--lib-bg)'
                （bg 起=灰、終=灰 ⇒ 無 bg 補間，幾何照 glide；縮小全程維持灰卡）
t=0.6（落定）    renderMarquee+revealMarqueeTitle 照舊（title z 需在 overlay 之上，見下）
t=0.6+HOLD      (a) transition:'none' → bg 直寫 clickedColor（藏在 overlay 下不可見；
                    ⚠️§15.1 規則：之後掛回任何含 background 的 transition 前必 void offsetHeight）
                (b) 同幀疊灰 overlay（沿用 `.lib-color-wipe` class）：inset:0、bg='var(--lib-bg)'、
                    z 低於 .color-rect-title（marquee 浮其上照捲）
                (c) overlay clip-path 隨機四向擦除（WIPE_DUR、EASE 同 14.1）→ 灰被擦掉、露出色塊
擦完 onComplete  remove overlay
```

要點：
1. **與正向去色擦除同一刻**：兩張卡的 wipe 都在 `t=MORPH_DUR+COLOR_HOLD` 起跑（可共用同一個 timeout）＝「一邊擦掉色、一邊蓋上色」（08-24「同一刻」定案）。
2. [line 907-908](../js/modules/pages/library-card.js#L907-L908) 註解說「刪掉舊的 bg 灰覆寫（colorVeil 用）」——本輪是**刻意重新引入**、用途換成配 overlay 擦除，改註解勿當回歸。
3. mode3：縮小段 outgoing 帶 `var(--lib-bg)` inline（marker 在＝走灰卡規則）；落定直寫 RGB 後無 marker → color.css `!important` 接管 strict B/W；overlay 的 `var(--lib-bg)` 是 theme var、三 mode 自解析。實機 mode3 過一輪確認無閃色。
4. 打斷兜底：`_doSwitchTab` 開頭既有的 `.lib-color-wipe` query＋killTweens＋remove 已涵蓋（bg 在 overlay 疊上前已直寫 RGB，中斷移除 overlay＝色塊即刻正確色）；離頁 cleanup 同。
5. **本輪不做** §15.5-2 的 marquee 反向單一物件飛行（adopt 進 outgoingEl、鏡像 ±90、px 交棒）——仍為獨立一輪，等 16.1/16.2 實機過了再開。

### 16.3 回饋②＝品質基準（無改動）

底邊型（零旋轉、marquee 貼底邊一起長大）是 user 認可的銜接感標竿。`findFreeEdge` 已底邊優先（§10.1），不加碼。16.1 完成後垂直型應以「接近底邊型的連貫感」為實機驗收標準。

### 16.4 驗證

- 16.1：垂直型逐幀＝t=0 起位移/放大/旋轉**同時**在動；rotate 約 0.35s 落定、幾何 0.6s 落定；無「先轉完才動」的停頓感；正規化前後 pixel-diff≈0；連點打斷照舊正規化。
- 16.2：縮小段抽幀＝outgoing 全程 `var(--lib-bg)` 灰（無 RGB 中間色）；HOLD 後灰 overlay clip 有中間幀（wipe 非 fade）；擦完色塊＝正確 RGB、marquee 在 overlay 之上全程可見；與被點卡的去色擦除同幀起跑；mode3 實機無閃色。

---

## 17. v3.8 第十一輪（2026-09-06，user 驗收 v3.7 後四點；順序 17.1 → 17.3 → 17.2 → 17.4）

> user 四點：①灰卡→色塊差不多了，但變色**之前四邊有顏色的邊緣** ②旋轉放大的 marquee 變長可以**再快**——「旋轉之後就是完整的長度」③有一刻 hover 色塊 marquee 不是黑的——「判斷成 hover、marquee 變了但（塊的）顏色沒變」，建議**色塊 ready 前 hover 無效** ④「旋轉到放大」還是感覺比較卡。

### 17.1 反向改「彩色 overlay 擦上來」（回饋①；修正 §16.2 的方向錯誤、回歸 §15.5-① 原設計）

**根因**：現況（[library-card.js:964-979](../js/modules/pages/library-card.js#L964-L979)）HOLD 幀先把 outgoing 本體 bg 直寫 RGB、再蓋灰 overlay `inset:0`。但 outgoing 是**帶 rotation 的色塊**（newCfg.rot）——旋轉元素的邊緣像素是抗鋸齒半透明帶，`inset:0` 的子層蓋不到父層 bg 的抗鋸齒像素 ⇒ 底下 RGB 沿四邊滲出 ~1px 色邊。正向大卡 rot 0、像素軸對齊 → 同手法無此問題。⭐**通則：旋轉元素上「子 overlay 蓋住父 bg」蓋不乾淨——別讓「不該見光的顏色」存在於父 bg，改讓顏色只存在於 overlay 內。**

**修＝翻轉圖層**（本體恆灰、色只在 overlay）：
```
HOLD 幀   (a) 本體 bg 不動（維持 var(--lib-bg)；刪現在的「直寫 RGB＋void offsetHeight＋applyIdleTransition」三行）
          (b) 疊彩色 overlay：`.lib-color-wipe`、bg = isMode3 ? var(--theme-fg) : clickedColor（同正向 veilColor 邏輯）、
              inset:'-2px'（多蓋 2px 由父 overflow:hidden 裁齊＝色到邊乾淨）、z:0（低於 .color-rect-title z:1）、pe:none
          (c) gsap.fromTo(wipe2, { clipPath: ENTER_CLIP[dir] }, { clipPath: 'inset(0% 0% 0% 0%)' })——**擦上來**（正向的鏡像）
onComplete (d) 本體 transition:'none' → bg=clickedColor → void offsetHeight → applyIdleTransition（§15.1 規則）
          (e) 同 tick remove overlay（同色換手、單次 paint 無閃）
```
- 擦除中：灰的部分＝本體灰邊緣（正常）；上色部分＝overlay 自己的 clip 內部＋oversize 蓋到邊——任何時刻父 bg 都沒有 RGB ⇒ 無色滲。
- **打斷兜底補強**：`_doSwitchTab` 開頭移除 `.lib-color-wipe` 的迴圈要加——若 host **不是** activeEl（＝反向中被打斷的色塊），host 本體此刻還是灰 → 同時 `transition:'none'` 直寫 `bg = colorOf.get(host)` 補上最終色（正向 host＝大卡、bg 已是灰、不動）。離頁 cleanup 同款。
- mode3：本體恆帶 `--lib-bg` marker 到擦完才換 RGB（strict B/W 接管）；overlay 用 theme-fg。實機 mode3 過一輪。

### 17.2 垂直型窗長「旋轉收完＝全長」（回饋②）

[boxT（垂直分支）](../js/modules/pages/library-card.js#L753) 的 `clip-path` 時長從 `morphDur` 改 **`ROT_DUR`**（left/top 維持 `morphDur` 不動）：窗在旋轉落定（~0.35s）就開滿全長，之後靠卡片 morph 期間的 `overflow:hidden`（§10.3 保險絲）裁到「當下邊長」＝視覺是**全長 marquee 貼著變長的邊被放出來**（§14.2 的機制回收，但綁 `ROT_DUR` 同一顆鈕、不另立常數）。底邊型（[line 741](../js/modules/pages/library-card.js#L741)）**不動**——user 已認可其同拍銜接感。

### 17.3 hover ready gate（回饋③；採 user 提案「色塊 ready 前 hover 無效」）

**根因**：§15.4 的解鎖（`isSwitching=false`＋`onDone`）在 **HOLD 幀**（[line 952](../js/modules/pages/library-card.js#L952)）、但兩個 wipe 還要跑 WIPE_DUR 0.4s。窗口內 hover 反向中的新色塊：mouseenter 不再被吞 → `applyCardHover` 寫 bg 黑（被 overlay 蓋住**看不見**）＋ title 色（在 overlay 之上**立刻變**）＝「marquee 變了、顏色沒變」。
**修**：
1. `_doSwitchTab` 起手 `outgoingEl.dataset.cardPending='1'`；`finish2`（上色擦完）`delete`＋此刻補呼 `syncHoverAfterUnlock()`（游標若正停在其上，ready 即刻套 hover——§15.4 合成補發覆蓋靜止游標）。
2. `attachHover` 的 mouseenter guard 加 `|| el.dataset.cardPending`；`syncHoverAfterUnlock` 的過濾條件同步加 `!el.dataset.cardPending`。
3. 兜底清旗標：`_doSwitchTab` 開頭（連點）與離頁 cleanup 對 allEls `delete dataset.cardPending`（連點時舊 outgoing 的 pending 別殘留卡死 hover）。
4. 點擊**照舊可點**（user 只說 hover 無效；擋點擊會傷連點操作感）。mouseleave 既有 handler 不用動（pending 中沒套過 hover、restore 寫回 colorOf 也無害）。

### 17.4 「旋轉到放大」卡感（回饋④；先節奏鈕、再 profile，別猜）

兩個嫌疑，依序處理：
1. **節奏面（先做、零風險）**：現況 rotate（0.35s）與幾何（0.6s）同曲線 `cubic-bezier(0.4,0,0.2,1)` → **兩次減速收尾**（0.35s rotate 落定、0.6s 幾何落定）＝中段「換檔」頓感，正好是 user 說的「旋轉**到**放大」交界。試：
   - `transform` 軌單獨換**緩尾曲線**（如 `cubic-bezier(0.22, 0.61, 0.36, 1)`）——旋轉更平緩滑進 0°、與持續中的放大重疊處無明顯落定點；
   - 仍有頓感 → `ROT_DUR` 0.35→0.45（兩收尾靠近、換檔感縮小）。一次動一顆。
2. **效能面（若實機仍掉幀才做）**：CDP Profiler 錄 morph 窗看 self-time（CLAUDE.md 鐵則「別猜」）。已知嫌疑：
   - HOLD 幀 `onDone`→panel **instant 全清單渲染**是同步大工（數百列），落點正好在擦除進行中＝morph 尾段掉幀；若 profiler 證實 → 考慮 rAF 分幀或把渲染挪到 wipe onComplete（權衡：§14.1 定案「內容在 overlay 底下就位、擦開即見」，動之前先確認）。
   - t=0 的 adopt 量測批（多次 forced reflow）＝首幀 hitch。
   - per-frame layout+paint（兩卡 layout 屬性 transition）：試 morph 期間卡片加 `contain: paint`／層提升，量了再上。

### 17.5 驗證

- 17.1：反向抽幀＝任何時刻 outgoing 邊緣無 RGB 色滲（尤其 rot≠0 的卡）；擦上來有 clip 中間幀；擦完本體＝RGB、overlay 已移除、無閃；連點打斷落在擦色窗 → 該卡 bg 直寫最終 RGB 無殘灰。mode1/2/3 實機。
- 17.2：垂直型抽幀＝~0.35s 窗長已滿、可見長度貼卡邊；底邊型行為不變。
- 17.3：headless（monkeypatch matches，§15.4 坑）＝pending 中 mouseenter 不套 hover；finish2 後游標停其上即黑。實機真游標複驗。
- 17.4：節奏鈕實機盲測；效能路徑先 profiler 數據再動。

---

## 18. v3.9 第十二輪（2026-09-06，user 驗收 v3.8 後兩點＋截圖；順序 18.1 → 18.2）

> user 兩點：①色塊旋轉時**還是在原地旋轉**——能不能同時位移、放大？②截圖二：色塊**完全放大時，有一瞬間 marquee 沒有完全展開**。

### 18.1 旋轉拉滿全程＝單一剛體動作（回饋①；撤 §16.1「早收」＋§17.4 獨立曲線）

**為何還是「原地轉」**：現況 transform 只有 `ROT_DUR 0.35s`、且 §17.4 換了急起緩尾曲線 `cubic-bezier(0.22,0.61,0.36,1)`（起步極快）——旋轉在位移還沒被眼睛感知前就近乎跑完，之後 0.25s 只剩位移＝知覺上「先原地轉、再滑過去」。早收設計本身就是「原地轉感」的來源，調曲線救不了。

**修**：[library-card.js:900](../js/modules/pages/library-card.js#L900) 的 `transform` 軌改 **duration `MORPH_DUR`（0.6s）、曲線回歸 `CB`**（與 width/height/left/top 完全同曲線同落點）＝三種變化綁成一個剛體動作，任一時刻都在同時位移＋放大＋旋轉。實作上垂直型 transition 可整條退回單一時長（等同 `TRANSITION`＋transform 軌）；`ROT_DUR` 常數與 §17.4 的獨立曲線退場。

**§15.3「從灰卡角落長出」顧慮為何現在可以安全重試**：當年全同步版的角落感，事後定位疑為「transition 掛在寫終點**之後**」的起點 commit 順序 bug（部分屬性 snap 到終點、只剩尺寸在補間＝看起來從灰卡角落長出）；§16.1 起順序鏈已固定（transition 先設 → setAsGray 寫終點）。若實機仍見角落感 → transform dur 退 `0.45` 為**下限**（不回 0.35），並回報再議。

### 18.2 窗長獨立常數 `WINDOW_DUR`、兩型通用（回饋②）

**根因（截圖二）**：底邊型 clip 窗仍是 `morphDur 0.6` 同拍（[line 743](../js/modules/pages/library-card.js#L743)）——同進度下窗寬恆比卡邊短一截（起點 rowW < 卡起始寬、只在 p=1 收斂），卡片在知覺上「已經到位」（p≈0.9）時窗還缺最後一段＝「完全放大時 marquee 沒展開完」的瞬間。垂直型在 §17.2 已修（窗提早全開＋overflow 裁邊），底邊型比照。

**修**：新常數 `WINDOW_DUR ≈ 0.35`（調整鈕），兩個分支的 `clip-path` 時長都用它：
- 底邊型（line 743）：`clip-path ${morphDur}s` → `clip-path ${WINDOW_DUR}s`；
- 垂直型（line 757）：從綁 `ROT_DUR` 改綁 `WINDOW_DUR`（18.1 後 ROT_DUR 退場／變 0.6，不能再共用）。

窗在 ~0.35s 開滿全長、之後靠卡片 morph 期間 `overflow:hidden`（§10.3 保險絲）裁到「當下邊長」＝任何時刻 marquee 都貼滿可見邊、終點無缺口（§14.2/§17.2 已驗證的機制，統一成一顆鈕）。box 的位移軸（left/top/bottom）維持 `morphDur` 不動。

### 18.3 驗證

- 18.1：垂直型逐幀＝旋轉與位移/放大**全程同時**進行、同幀落定（rot 到 0° 與 w/h/left/top 到位同一拍）；無「先轉完才動」「轉完滑行」段；正規化前後 pixel-diff≈0；連點打斷照舊。若見「從灰卡角落長出」→ 先驗 commit 鏈、再退 0.45。
- 18.2：兩型抽幀＝~0.35s 起可見 marquee 恆貼滿當下卡邊；t=0.6 落定瞬間窗＝全長零缺口（對照截圖二不再復現）；底邊型銜接感不回歸（round-10 已認可的品質基準）。

---

## 19. v4.0 第十三輪（2026-09-06，user 驗收 v3.9 後定向：垂直邊型撤整卡旋轉）

> user 兩點：①旋轉型還是「閃一下才露出所有」＝色塊已完全放大但 marquee 沒跟上；**底邊型很順——「這個邏輯不能套用在 marquee 在兩邊的嗎？」**②「左右 marquee 的，可以不是旋轉的方式？有機會讓它更 smooth 一點嗎」。
>
> **定案＝撤整卡 ±90 旋轉（§11 整套退役）**：卡片兩型統一走底邊型的純幾何 morph；文字轉正改由 **marquee box 自轉**（±90→0）邊飛邊轉承載。§11 是 round-5 user 要求「旋轉＋放大才看得出連貫性」而生、本輪 user 看過成品後翻案——**刻意反轉，勿當回歸恢復**。

### 19.1 卡片：兩型統一純幾何 morph（§11 機構全刪）

- `_doSwitchTab` 的 `twoBeat` 分支刪除：垂直邊型與底邊型一樣 `clickedEl.style.transition = TRANSITION` → `setAsGray`（不再對調尺寸、不再寫 `rotate(cardRot)`、不設 `dataset.morphRotated`）。
- 隨之退場：`flight.cardRot`／`flight.normalize()`／t=0.6 timer 內的正規化段（transition:none 換寫＋`void offsetHeight`）／`_doSwitchTab` 開頭的 `morphRotated` 打斷兜底迴圈。
- **附帶收益＝「閃一下」來源歸零**：t=0.6 的「旋轉座標系→正立座標系」同幀換寫（卡＋box 兩組重寫）整套消失，落定即終態、無 pop 窗口。
- 保留不動：`overflow:'hidden'` 保險絲（§10.3——box 自轉時字條掃出卡外由它裁掉，v3.1「從卡底浮上來」的既有防線）、z:15、contentEl display:none 效能修。

### 19.2 box：「角落鉸鏈」倒下——字條以共享角為軸心掃 90° 躺到底邊（user 定向：卡片不轉最 smooth＋marquee 不隱藏移到底部）

卡片自由變形（不轉）之下，垂直字條→水平底列**幾何上必有一個 90°**——但轉的是**字條自己**，且不是自由空中翻轉，而是**鉸鏈式**：

- **軸心＝側邊與底邊共享的那個角**（左邊 marquee→卡片**左下角**；右邊 marquee→**右下角**）。字條像時鐘指針倒下：左邊型從「指向 12 點」掃到「指向 3 點」（掃過卡內 1～2 點鐘區域）、右邊型鏡像（12→9 點）——**全程貼著卡片邊緣、掃進卡片內部、永不隱藏**，終點正好躺在底邊上。
- **實作**：box 是卡內 absolute 子元素——
  - `transform-origin` 釘在**字條靠角落的那一端**（一次設定、飛行中恆定）；
  - 錨定用**角落側座標**（左邊型 `left:0 + bottom:PAD` 系；右邊型 `right/bottom` 系）＝鉸鏈角自動跟著卡片變形走、不需逐幀算；
  - boxT：`transform ${morphDur}s ${CB}`（rotate ±90→0，短弧無 270° 風險）＋沿底邊的位移軸 `${morphDur}s ${CB}`＋`clip-path ${WINDOW_DUR}s ${CB}`——全部與卡片幾何同曲線鎖步（§12.2 B 原則）；
  - 掃動途中字條若掃出卡外，morph 期間 `overflow:hidden`（§10.3 保險絲）自動裁掉。
- **相位**：paused＋px 續接照舊（§13.2）——字流從側邊當下位置無縫接到躺下後的底列。
- **終態**：rotate(0)、貼底部列座標＝直接就是灰卡標題列位置，無正規化、無換寫。
- 文字方向自查（幾何已核）：左邊型 rotate(+90) 讀上→下，掃 −90° 後 rotate(0) 讀左→右 ✔；右邊型 rotate(−90) 掃 +90° 後同 ✔。
- 其餘全保留：font 快照、placeholder、`marqueeFlying` guard、WINDOW_DUR（§18.2）、restore idempotent（restore 清 transform/transform-origin，打斷落在半掃態直接歸巢）。
- 底邊型分支一字不動（user 認可的品質基準）。

### 19.3 驗證（⚠️這輪必須真的逼出「側邊 marquee 色塊」）

- 17.2／18.1 兩輪 headless 都因 `findFreeEdge` 底邊優先強而全跑 bottom、側邊情境空放行——本輪 headless **必須 monkeypatch `findFreeEdge` 強制回傳 `left`／`right`** 各跑數回合，不得再以「逼不出」放行。
- 側邊型逐幀：box 全程可見（無任何 visibility:hidden 幀）；rotate ±90→0 繞角落鉸鏈平滑掃動、與卡片幾何同曲線同落定；相位 px 續接（字流無倒跳）；掃出卡外部分被 overflow 裁掉無殘影；t=0.6 落定**單幀無 pop**、終態＝底部列座標零換寫；卡片 rotation 全程 0。
- 連點打斷落在半掃態：box restore 歸巢（transform/transform-origin 清乾淨）；morphRotated 機構已刪、無 console error。
- 底邊型回歸測試：行為與 v3.9 完全一致。實機：鉸鏈掃動觀感（左/右邊型各一）、mode1/2/3。

---

## 20. v4.1 第十四輪（2026-09-06，user 提案「字流進場」取代鉸鏈；§19.2 作廢）

> user：「現在的邏輯如果 marquee 還會旋轉的話，就很奇怪。如果換個形式，marquee 不旋轉的話呢？可能**從右邊快速進場**，可以比較無縫銜接到灰卡。」
>
> **定案＝完全零旋轉、用 marquee 自身的行進語彙銜接**：marquee 的本性就是文字右→左流動——底部列的字「從卡右緣流進來」看起來就是 marquee 自己走到位（動作語彙原生＝天然無縫）；側邊條沿自己的捲動軸「流光」退場。「單一物件全程搬運」教條就側邊型讓位給「**單一字流**」（同一段字：流出側邊、流入底邊）。§19.1（卡片兩型統一純幾何 morph）不變；§19.2 鉸鏈版作廢（若已實作則拆除 transform-origin/rotate 軌等鉸鏈機構）。

### 20.1 側邊型新流程（底邊型分支一字不動）

```
t=0        卡片：純幾何 morph（§19.1，與底邊型同一條 TRANSITION）
           側邊條（色塊上的 .lib-title-box）：沿自己捲動方向「流光」＝clip 窗沿捲動軸收合
           （EXIT_DRAIN ≈ 0.15~0.2s、CB；動畫收掉、無隱藏跳變幀），收完 visibility:hidden
           box adopt 進卡（管線照舊：placeholder、font 快照、marqueeFlying guard），但**不飛**——
           從 t=0 就釘在底部列終點座標（left+bottom 錨定＝同底邊型終點；窗全開、超出部分由卡 overflow:hidden 裁）
           box 的 track：初始 offset ＝ 全部文字都在可見窗右緣之外 → 一次性 tween 向左流入
           （ENTRANCE_DUR ≈ 0.5~0.6s、CB）＝「從右邊快速進場」；keyframe 本體 paused（§13.2）
t=0.6 落定  entrance tween 已到位 → resumeMarqueePhase 以 tween 終點 offset px 續接進正常 loop（無倒跳）
```

- 進場起始 offset 可反推設計成「落定時相位＝loop 原點」（乾淨交棒）；或就地取 tween 終點值 px 取模——實作取簡單者，px 精確即可。
- 側邊條的「流光」方向＝其捲動前進方向（文字往哪流就往哪收），讀起來是字自己跑走、不是被擦掉。
- 進場的字在卡還小時被卡緣裁住，隨卡變寬逐漸露出＝與卡片變形自然耦合，不需要窗長動畫（WINDOW_DUR 對側邊型不再適用；底邊型照舊）。
- 刪除：§19.2 鉸鏈的 rotate 軌／transform-origin 釘角／角落側錨定；側邊型不再有任何 rotation。
- 常數：`EXIT_DRAIN`、`ENTRANCE_DUR` 皆調整鈕。

### 20.2 驗證

- headless **monkeypatch findFreeEdge 強制 left/right**（慣例，不得空放行）：側邊條沿軸流光（clip 有中間幀、無瞬間消失）；底部字流從右緣流入、被卡緣裁切乾淨；t=0.6 落定後 loop 接手**px 無倒跳**；全程任何元素 rotation 變化＝0。
- 連點打斷落在進場中：box restore 歸巢、track offset/paused 清乾淨；側邊條 renderMarquee 重建正常。
- 底邊型回歸：與 v3.9/v4.0 行為完全一致。實機：進場速度感（ENTRANCE_DUR 鈕）、流光退場觀感、mode1/2/3。

---

## 21. v4.2 第十五輪（2026-09-06，上色/去色 overlay 改「wrapper＋transform 滑板」；user 確認）

> 緣起：user 問「上色去色能不能用 clip reveal 處理」——**可以且純色下視覺 100% 等價**（memory「位移感來自紋理」原則的反向應用：均勻純色滑動 vs 遮罩掃過分不出來）。實質好處＝現行擦除是 **gsap 逐幀改 clipPath＝主執行緒**，而 HOLD 幀正在 overlay 底下同步渲染整份清單——主執行緒一卡、擦除就掉幀；改 transform 的 CSS transition 由 **compositor 接管**，主執行緒卡它照滑（很可能是「卡感」的一部分）。

### 21.1 結構與動畫（正反兩個 wipe 都改）

overlay 從單層改兩層：
```html
<div class="lib-color-wipe" style="position:absolute; inset:0(反向:-2px); overflow:hidden; z/pe 同現行">
  <div style="position:absolute; inset:0; background:色">  <!-- 滑板 -->
</div>
```
- **正向（去色、蓋在 clickedEl）**：滑板從 `translate(0,0)` 用 CSS transition（`transform ${WIPE_DUR}s <ease>`）滑出到隨機方向 `translate(±100%,0)/(0,±100%)`；transitionend → 移除 wrapper＋既有 finish 邏輯（flight.restore 等）不變。
- **反向（上色、蓋在 outgoingEl，§17.1 流程不變）**：滑板從方向外 `translate(±100%…)` 滑入到 `(0,0)`；到位後本體 bg 直寫 RGB → 同 tick 移除 wrapper（17.1 (d)(e) 照舊）。
- **§17.1 防色滲保留**：反向 wrapper `inset:'-2px'` oversize、由 host（色塊）自身 `overflow:hidden` 裁齊——滑板滑入時色到邊乾淨、父 bg 全程無 RGB。正向大卡 rot 0 用 `inset:0` 即可。
- ease：對應現行 `EASE.exit`（power3.in）的 bezier 近似 `cubic-bezier(0.55, 0.055, 0.675, 0.19)`（調整鈕；實機看不出差異即可、不求數學精確）。
- 起點 commit 慣例照舊（§8.1）：滑板先 transition:none 寫起點 → reflow → 掛 transition → 寫終點。
- 完成回呼：transitionend＋setTimeout 兜底（節點被打斷移除時 listener 隨之消失、不留懸掛）。
- ⚠️與 heroRevealCard 的「gsap 同 tick 寫 translate+clipPath」不衝突：那裡是 translate 與 clip-path **兩管線**得鎖步所以用 gsap 單引擎；這裡 wrapper+transform 是**單屬性單管線**，無鎖步問題。

### 21.2 清理與兜底（沿用）

- `_doSwitchTab` 開頭與離頁 cleanup 的 `.lib-color-wipe` query＋remove 照舊有效（killTweensOf 對非 gsap 節點無害可留）；§17.1 的「host≠activeEl → 直寫 bg=colorOf.get(host)」打斷兜底不變。
- box z:70 浮於 overlay 之上、字色過渡在擦除窗（line ~954）皆不變。

### 21.3 驗證

- headless：正反 wipe 皆有 transform 中間幀（滑板位移、非 fade/瞬移）；擦完 wrapper 移除乾淨、連點打斷不留節點；反向色塊四邊無色滲（17.1 迴歸）；mode1/2/3 實機。
- 效能佐證（可選）：切換時 performance 錄影對比——清單渲染 hitch 幀內 wipe 是否仍前進（compositor 版應照滑）。

---

## 22. v4.3 第十六輪（2026-09-06，user 三點新決策：marquee 換手改「對稱 wipe」＋色彩方向配對）

> user 原話：①保持色塊到灰卡的大小（幾何 morph 不動）；色塊裡的 marquee **先消失**，方向**上下隨機、不能左右**；且「色塊 marquee 出場要跟灰卡 marquee 進場**剛好相反**」②「那這樣可以去掉原本灰卡 marquee 的進場方式」③灰卡上色塊（去色）方向上下左右隨機；色塊上色時要跟灰卡**相反**——但若色塊 marquee 在左右，這個「相反」要**再旋轉 90°**。
>
> 設計語彙第三度演進：單一物件搬運（§9~19）→ 單一字流（§20）→ **對稱 wipe 換手**（本輪）：出場與進場方向鏡像配對＝動作上「同一條字從這邊收走、從相反方向回來」，連貫性由方向配對承載，不再搬 DOM、不再接相位。

### 22.1 marquee 換手（正向；取代 §20 全部）

```
t=0        色塊 marquee wipe 出場：方向隨機二選一 {向上, 向下}（不能左右）、時長 MARQ_EXIT ≈ 0.2s
           （無 fade；clip／translate+clip 鎖步實作擇一，沿用 hideMarqueeTitle 族做法加方向參數）
           側邊直條與底邊橫條**同規則**（視覺上下＝螢幕上下，不隨字條旋轉轉軸）
morph      卡片純幾何 morph 照舊（§19.1）；morph 期間卡上無 marquee
落定/HOLD   灰卡底部 marquee wipe 進場：方向＝出場的**剛好相反**（motion 相反：
           出場「向上收走」→ 進場「向上浮入」（從下緣向上出現）；出場向下 → 進場向下沉入（從上緣向下出現））
           時長 MARQ_ENTER ≈ 0.3~0.4s；進場時點沿用現行 revealMarqueeTitle 的時序
```
- **方向配對語意（實機驗收點）**：上表採「同軸鏡像」＝收走朝上、回來也朝上浮入（讀起來是同一條字繞了一圈回來）。若 user 實機覺得該是「出場向上→進場向下」的字面相反，換 mapping 一行即可（`MARQ_DIR_MAP` 常數表、調整鈕）。
- 出場方向要**存下來**傳給進場（switch 流程區域變數即可，不再有 flight handle）。

### 22.2 舊進場機構退役（user 點②）

- `adoptMarqueeToTitle` 整個刪除：adopt/歸巢、placeholder、font 快照、`marqueeFlying` guard、`activeFlight`、paused＋`resumeMarqueePhase` px 相位交棒、`EXIT_DRAIN`／`ENTRANCE_DUR`（§20 字流）、`WINDOW_DUR` 窗長——全部退場。各 marquee 從此各自跑自己的 loop，相位不續接（換手的連貫性由 22.1 方向配對承載）。
- `readMarqueeOffsetPx`／`resumeMarqueePhase` 若無其他呼叫者一併刪；`buildTitleMarquee` 的 `marqueeFlying` guard 分支刪。
- **15.5-②（反向單一物件飛行）正式作廢**——無 flight 可鏡像，gated 項目關閉。
- 反向（新色塊）的 marquee：照現行「縮小落定 `renderMarquee`＋`revealMarqueeTitle`」不動（user 未要求配對；如下輪要對稱再加）。

### 22.3 色彩滑板方向配對（user 點③；§21 slideColorWipe 機制不變、加 dir 參數）

- 大卡**去色**（滑出）：方向 `d` 隨機四選一 {上,下,左,右}（照舊）。
- 色塊**上色**（滑入）：方向＝`pair(d)`：
  1. 先取字面相反：上↔下、左↔右；
  2. 若該色塊 marquee 在**左右邊** → 再轉 90°，旋向跟字條同向（左邊型 rotate+90＝順時針：上→右、右→下、下→左、左→上；右邊型 rotate−90＝逆時針）。
  3. 底邊型不轉、只取相反。
- 例：去色向左滑出 → 相反＝向右 → 色塊 marquee 在左邊（+90）→ 上色**從下向上？** 否——右轉 90°（順時針）＝**向下滑入**；右邊型（−90）＝向上滑入。
- 兩個滑板仍**同一刻**起跑（§16.2 定案）；`slideColorWipe` 加 `dir` 參數、呼叫端算 `pair(d)` 傳入；旋向若實機看反，`pair()` 內正負號一顆鈕。

### 22.4 驗證

- headless（monkeypatch findFreeEdge 逼 left/right 慣例）：出場 wipe 只有上下二向、有中間幀；進場方向與出場嚴格配對（`MARQ_DIR_MAP` 全 case）；morph 期間卡上無 marquee 殘留；色彩滑板方向配對表全 case（含左右型 ±90 旋轉）；兩滑板同刻；adopt 機構刪除後零 orphan/零 console error；連點打斷乾淨。
- 實機：22.1 方向配對語意（同軸鏡像 vs 字面相反）、22.3 旋向正負、mode1/2/3。

---

## 23. v4.4 第十七輪（2026-09-06，§22 實機三點調校）

> user 三點：①看不到色塊 marquee 消失動畫、太快 ②色塊放大到灰卡時，灰卡 marquee 要 **z-index 最高**、且要跟色塊 marquee **出現的 timing 一致** ③縮小色塊填色邏輯改一下：**底部的也要讓 wipe 轉 90°**。

### 23.1 出場太快（回饋①）

`MARQ_EXIT` 0.2 → **0.35**（鈕；仍嫌快再 0.4）。出場結束才起跑 morph？——**不**，維持 t=0 同時起跑（出場與放大重疊），只拉長到可感知。

### 23.2 灰卡 marquee：z 最高＋與色塊 marquee 同刻出現（回饋②）

現況：灰卡 `marqueeWipeEnter` 在 HOLD 幀（onDone 後）、但**色塊（outgoing）marquee 的 `renderMarquee`＋`revealMarqueeTitle` 在 settle 幀（t=0.6）**——差 0.2s、且灰卡 marquee 在色彩滑板（z:60）之下進場＝擦除中看不見。修：
1. **timing 統一到 HOLD 幀**：outgoing 的 `renderMarquee`＋`revealMarqueeTitle` 從 settle 挪到 HOLD（與 `marqueeWipeEnter`、兩色彩滑板同一刻起跑）——四件事同拍：灰卡 marquee 進、色塊 marquee 進、去色滑出、上色滑入。
2. **z 最高**：灰卡 title box（`.lib-panel-title` 的 box）進場窗內 inline `z ≥ 70`（高於滑板 z:60，沿用舊 box z:70 慣例）、`position` 需要時補 relative；滑板 finish 後清回。色塊端 `.color-rect-title` 本來就在其滑板（z:0）之上、不用動。
3. 進場 wipe 在滑板之上跑＝「灰卡 marquee 浮在還沒擦完的色彩上出現」——正是 user 要的視覺（marquee 永遠最上層的一貫原則）。

### 23.3 底邊型滑板也轉 90°（回饋③；改 `pairSlabDir`）

`pairSlabDir(d, rot)` 改：**所有型都「字面相反 → 再轉 90°」**，不再有底邊型只取相反的分支：
- 左右邊型：照 §22.3（左 +90 CW／右 −90 CCW）。
- **底邊型：也轉 90°**，旋向預設 **CW**（`BOTTOM_SPIN` 鈕、實機看反翻 CCW）。
- 例：去色向左滑出 → 相反＝向右 → 底邊型 CW ＝**向下滑入**。

### 23.4 驗證

- headless：MARQ_EXIT 0.35 有 ≥4 幀中間態；HOLD 幀同刻四件事（兩 marquee 進場＋兩滑板）時間戳一致；灰卡 box computed z ≥70 於滑板存續期間、finish 後清回；pairSlabDir 全 case 含底邊型 90°；回歸：連點/離頁清乾淨、0 pageerror。
- 實機：出場可感知度、四件事同拍的整體觀感、底邊型旋向（BOTTOM_SPIN）、mode1/2/3。

---

## 24. v4.5 第十八輪（2026-09-06，§23 驗收四點）

> user 四點：①去色與上色動畫**速度要一致、含 ease** ②marquee 進出場要 **clip reveal 不是 clip path**——要有**位移效果** ③色塊 marquee 進場像用 **pop** 的、查一下；進場可以放慢 ④**marquee 先出現**（才看得出 z 在最前）、**然後**才是去色＋上色。

### 24.1 兩滑板速度/ease 統一（回饋①）

去色（滑出）與上色（滑入）收斂到**單一常數來源**：`SLAB_DUR`（=WIPE_DUR 0.4）＋`SLAB_EASE`（同一條 bezier 字串），兩個 `slideColorWipe` 呼叫都吃這組——現況若有各自 dur/ease 立即統一。⚠️知覺陷阱備案：同 dur 同 ease 下「滑出」（加速離場）與「滑入」（衝進來煞停）可能仍感覺不同速——若實機仍不一致，滑入端改**鏡像曲線**（ease-in↔ease-out 對調）一顆鈕再驗。

### 24.2 marquee 進出場改 clip-reveal 位移版（回饋②）

`marqueeWipeExit`／`marqueeWipeEnter` 從「純 clip inset 收合/展開」改 **clip-reveal**（本專案定義：內容有位移、外層裁切）：
- 結構：box（或其外層）當裁切容器（`overflow:hidden` 或釘死 clip），**inner（track 容器）`translateY` 位移**——出場 0→±100%、進場 ∓100%→0（方向規則與 `MARQ_DIR_MAP` 配對照舊、上下限定照舊）。
- 單屬性 transform＝compositor 單管線（不觸 heroRevealCard 的雙管線鎖步問題）；無 fade。
- ⚠️inner 位移不得動到 track 自身的 marquee keyframe transform——位移寫在**另一層 wrapper**（track 的父層），避免與 `--marquee-distance` 動畫互踩（gsap 動 transform 會清 CSS 動畫 transform 的既有教訓）。

### 24.3 色塊 marquee「pop」修（回饋③）

診斷方向（Opus 先驗證再修）：十之八九＝**隱藏態未 commit 就 reveal**——renderMarquee 重建 DOM／hide 寫入與 reveal 起跑同一 tick，無 reflow 隔開 → transition 從可見態起跑＝snap（§8.1／CLAUDE.md「揭前隱藏態必須已 painted」規則、`void el.offsetHeight` 單次 reflow）。修：
1. 色塊端（outgoing）marquee 統一改走 **24.2 的 enter helper**（與灰卡同一套、同方向配對邏輯的鏡像可後議——本輪先同套機制），棄 `revealMarqueeTitle` 舊路徑於此場景。
2. 隱藏態寫入後 `void offsetHeight` 再起跑進場。
3. **進場放慢**：`MARQ_ENTER` 0.35 → **0.5**（鈕；兩端 marquee 同值）。

### 24.4 時序改兩拍：marquee 先、色彩後（回饋④）

HOLD 幀起的序列改：
```
HOLD 幀     兩個 marquee 同拍進場（灰卡 enter＋色塊 enter；z 最前、浮在仍未動的色彩上）
+SLAB_DELAY 兩色彩滑板同刻起跑（去色滑出＋上色滑入；方向配對照舊）
```
- `SLAB_DELAY` 預設＝`MARQ_ENTER`（marquee 完整進場後色彩才動、「先出現→然後才是」字面義）；想要重疊感可調小（鈕）。
- ⚠️23.2 的 z:70 清回 timer 隨新總長重算——改綁**上色滑板的 finish 回呼**（onDone 內清）取代固定 600ms，總長變化免再校時。
- 內容渲染（contentEl display + onDone）維持 HOLD 幀不動（在 marquee 進場底下就位、色彩擦開即見，§14.1 原則）。

### 24.5 驗證

- headless：兩滑板 computed transition dur/ease 完全相同；marquee 進出場有 inner translateY 中間幀（位移非純 clip）；色塊 marquee 進場首兩幀非終態（無 snap）；時序＝marquee 進場起點在滑板起點之前 `SLAB_DELAY`±1 幀；z:70 貫穿至上色 finish；回歸（連點/離頁/0 pageerror）。
- 實機：①速度一致感（不一致→鏡像曲線鈕）③pop 消失＋0.5 進場速度感 ④兩拍節奏觀感、mode1/2/3。
- 15.5：反向縮小全程灰、上色擦除有中間 clip 幀非 fade；底部列 marquee 全程單一物件過渡到色塊邊、交棒無跳相；連點/離頁無殘留（兩 handle 都歸巢）。
