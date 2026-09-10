# Activities Deep-Link 卡頓：診斷與修法（2026-09-09）

> ✅ 修法 1、2 ＋ chevron gate 已於同日實作並 headless 驗證（long tasks 1.58s→1.24s、量測降視口級、行為與 baseline 一致）；修法 3 視口級量體下不需要、未做。待實機手感確認。

## 2026-09-10 第二輪（user 四項回報）

1. **開/關 accordion 卡頓（deep-link 後）**：根因＝per-item IO 視口量測把「量測時機」綁上使用者互動——開關/捲動推移 item 穿過 200px 邊界＝首次量測（每 chunk 強制 reflow）疊在動畫幀（實測 4 次開關 931 呼叫/318 重建/8.9s long tasks）。修＝**量測安靜窗**：`measureQuiet()`（非 accordion busy 且 400ms 內無捲動，document capture 聽 scroll 涵蓋 inner-scroll box）gate 住 initMarquees pump 與 `_mqFlush`（後者保留 1.5s 兜底）→ 8.9s→3.3s；殘餘＝全建 DOM height tween 的固有 layout（content-visibility 已於 09-01 實測反噬撤回、勿再加）＋背景 idle 續建（本就讓路、落在靜止窗）。
2. **gallery 縮圖進場**：`gateStripRevealOnLoad` 整條 strip gate 退役（依賴 bind 時機，deep-link 開啟早於 deferred bind＝縮圖裸 pop）。改「以縮圖為主」：每張 img 出生自帶 `clip-path inset(100%)`＋inline `onload` 揭露（`THUMB_CLIP_BIRTH`）；「載入撐寬推擠」由 **imageDims**（source deep-fetch `images.directus_files_id.width/height`，公開權限已驗證可讀）aspect-ratio 預留寬度根治。chevron 補查改 `bindChevronRecheckOnLoad`（track RO 不會因 scrollWidth 變化 fire、缺這個會漏顯）。
3. **chevron 預渲染**：`buildGalleryHtml`/`buildAlbumsHtml` 以 imageDims 估 strip 總寬（無尺寸保守值），>1300px＝必溢出 → 出生即帶 chevron（prev 帶 atStart 樣式）；邊界值仍走量測後出現。
4. **library deep-link（#album-/#f-）**：`hideYearLabel` 每 block「getComputedStyle 讀 pad→寫」與 `hideAwardItem` 寫入交錯＝逐 block reflow（profiler 922ms self、單一 1077ms 長任務）。改 `hideYearLabels` 複數版讀寫分離＋pad cache（三呼叫點 revealAwardItems / revealFilesCards / files early 全改）→ album deep-link 2.2s→1.5s、巨型任務消除。awards deep-link 本來就順（120ms）。

驗證：activities lectures deep-link open ✓、aspect-ratio 11/11、無卡住縮圖、11 張圖 gallery chevron 出生 flex；library album deep-link 視窗內年份標籤全揭、縮圖可見；TS 無新錯。

## 2026-09-10 第三輪（hero 停留過久＋捲動不順）

phase-trace 實測：heroDone ≈ 點擊後 3.4~3.6s（swap 1.2s＋hero build defer＋hero 動畫 ~1.7s，後者是 2026-06-28 設計「等 hero 跑完才捲」）；**深目標時「分幀建到目標」在 hero 播完後才開始、再吃 1~3.4s**（成本＝style recalc/layout 管線，每批隨 DOM 變大 100~400ms，JS 無罪、排程消不掉）＝「停留比 loading 久」；捲動段還被建批/綁定砸幀。修：

1. **建到目標提前到 hero 播放期間並行**（deep-link init `initSwitchPromise.then` 就 kick `_lazyRenderAll('item-X')`；同目標 promise 共用、navigateToItem 接手同一份）。
2. **targeted build 只 render 不綁**：`_deferItemBinds` 放行 incremental＋deferBinds（每批同步綁 150~250ms 是最大單項）；批量 10→4 攤平 insert 尖峰。
3. **兩段式離場**：navigateToItem smooth 路徑進場即先平滑捲到 section 頂（首屏早建好），建完才由 boxScroller／finalTop 第二段對齊 item——hero 停留恆定＝hero 動畫本身，深目標等待發生在內容畫面。配套：`scrollWindowNoSnap` 起跑先 `killTweensOf(window)`（兩段式短窗內兩條 tween 並存搶寫）。
4. **fill() 捲動讓路**（同 idleBuild）：平滑捲動時 sentinel 進 600px 邊界原本同步連建批次砸捲動幀；spacer 撐住捲距＝晚 300ms 建不跳版。

成效（phase-trace）：window 捲動固定 heroDone＋~50-350ms 起跑（原深目標 +3.4s）；捲動窗慢幀 1441→75~413ms；hero 窗揹建構 ~0.7-1.4s 慢幀（原本為零——deep-link hero 有輕微 stutter 是此取捨，換掉「停留」）。若要進一步縮短 hero 本身 ~1.7s 等待（deep-link 專用縮短版 hero），是翻 2026-06-28 決策、需 user 拍板。

### 第四輪（09-10 晚）：hero 平滑＋穩態卡頓診斷

**hero 平滑（✅已修）**：deep-link 的 hero 沒直接進頁 smooth。兩個兇手：①建構插入的 style recalc → 建構窗口對 `[data-lazy-list]` 容器設 `content-visibility:hidden`（渲染管線整棵跳過、插入零成本；contain-intrinsic-size 釘現高防塌；heroDone／使用者首次互動解除，⚠️與 09-01 撤回的 cv:auto 不同——hidden 不會被讀取強制渲染）②真正大宗＝bindInteractions incremental **每批** `setupClipReveal` 的 pass-1 `getComputedStyle` 在髒 DOM 上強制 style recalc（44 批×~33ms＝1.45s，CDP 抓到）→ `_bornShown` 窗口內跳過包遮罩、settle 時一次批量補包（單次 recalc）。成效：hero 窗口慢幀 0.9~2.2s → **50~75ms**。代價：深目標在 heroDone 解除 cv 時付單次全量 recalc（捲動起跑前 ~0.3-1s 停頓一次）。

**「deep-link 後全頁動畫都卡」（診斷完成、結構修待做）**：A/B 實測＝**非 deep-link 殘留**——直接進頁等 idle 建完（273 item）互動 long tasks 反而更多（6100ms vs deep-link 3372ms/147 item，每 item 成本相同）。真因＝清單全量建進 DOM 後，任何互動都付全清單 style recalc/layout：215 item 實測 hover 掃過 899ms／開 accordion 1908ms／關 1568ms／滾輪 1546ms。deep-link 只是讓全量建完提早幾秒發生。
**結構解法＝重接 `content-visibility: auto`（每 item）**：09-01 撤回的前提「全清單幾何讀取到處都是」已被本輪工作拆掉大半（marquee per-item IO／chevron armed／binds defer／量測安靜窗／panel cull 有 early-break 讀取有界）。重接需要：①`.list-item` 補 `contain-intrinsic-size: auto ~Xpx`（未渲染 item 用估高，錯值會讓 deep-link 落點/捲動位置漂移——需驗證落點精度）②audit 殘餘全清單掃描（activities-search 的 display sweep、exit cull 的 offsetParent 讀、setupClipReveal 的 getComputedStyle——style 讀不強制 cv 渲染、應無害）③實測開關/hover/捲動改善幅度＋落點回歸。獨立一輪做、勿與本輪混。

### 第五輪（09-10）：cv:auto 重接 ✅（user 拍板執行）

Audit 結論：所有「離視窗 item 子樹幾何讀取」皆已視口化——marquee（per-item IO＋mqSeen＋安靜窗）、chevron（chevArmed 開啟才量）、accordion（只讀目標 item）、search（只讀 rows[0] 單元素）、exit cull（只讀 `.list-item` 自身 box——size containment 有 placeholder、不觸子樹）、setupClipReveal pass-1／dim-off IO（style 讀／IO 不觸發 cv 渲染）。

實作：`lists.css` `[data-lazy-list] .list-item { content-visibility: auto; contain-intrinsic-size: auto 144px; }`（只掛 loadListInto 清單＝activities/admission；估高＝headless 實測閉合 item p25~p75=144px；`auto` 關鍵字＝渲染過記實高、估值只影響從未進視窗的 item、誤差一次性自癒）。

驗證（headless）：
- 穩態互動（205 item 全建）：hover 899→**129**ms／開 accordion 1908→**652**／關 1568→**203**／滾輪 1546→**402**，worst 單 task ≤129ms
- deep-link 穩態 long tasks 3372→**546ms**
- deep-link 落點：active header top=191（≈sticky 位）✓；sticky 釘住行為正常（捲 600 只位移 245＝釘到 item 底才走）
- 切分頁 76/133ms、離頁 186ms（09-01 反噬時 4757/3299ms）＝無反噬
- lazy reveal 完整性 A/B（cv:auto vs runtime 覆蓋 cv:visible）：stuck 樣態完全一致＝既有 born-hidden 等待態、非 cv 回歸

殘餘：開 accordion 仍 652ms（height tween 帶動全 panel layout 的固有成本，item 內部已 contain）；估高 144px 對手機版未另 tune（`auto` 記憶＋落點主要在桌面 deep-link，暫不加 @media）。實機手感待 user 確認。

### 第六輪（09-10）：實機回饋兩修（deepOpen 旗標）

user 實機兩點：①deep-link 開的 item 自關時整段捲回 section 頂（`_preOpenScroll` 在 proceedOpen 對齊「前」記＝box 0）②桌面 box 路徑「對齊＋展開同時跑」（無 others 時 doExpand 不等 alignDone）→ 從 section 頂捲一大段時 title 區（share btn/國旗）殘影疊在展開內容上。

修＝`header.dataset.deepOpen`（navigateToItem box 路徑 openViaAccordion 設、proceedOpen 讀後即刪）：①box 分支算出 targetTop 後覆寫 `_preOpenScroll = targetTop` → 自關留在 pin 線不位移 ②展開序列 `others.length || deepOpen` 才等 alignDone ＝ deep-link 比照既有「開新關舊」兩段式（捲完才展開）。window 路徑（手機）本來就 skipOpenScroll（對齊先於 click、preOpenScroll 記到的已是對齊位）不需改。

headless 驗證：open 時序 content 開始成長時 box 已在對齊終點（alignedFirst=true）；自關後 box 留在 27194 不回 0；手動開關 restore 迴歸不變（1609→1695→1609）；TS 無新錯。

**二輪（user 實機再報「展開還是有差＋關閉卡片頂上去沒跟年份對齊」）＝cv:auto 估高漂移**：對齊捲動途中上方未渲染 item 實渲染（實高 88~195 ≠ 估 144）→ 版面位移 → 開跑前算的 `openBoxTarget` 與上輪記的 `_preOpenScroll = targetTop` 都 stale。修三處（list-accordion.js）：
1. `_preOpenScroll`：deepOpen 改記 **null**（自關 fallback `scrollFollow` ＝真正原地收合、僅防靠底 clamp 跳）——cv:auto 下記任何絕對捲動值都會 stale，「留在原位」必須是關閉當下的語意而非儲存值。
2. `settleAlignFresh`（deepOpen 限定）：alignDone 捲完 → 重量當下位置 → 短 tween（DUR.fast）補差 → 才 doExpand。
3. expand `onComplete` 收齊對位改「當下重量」不用 stale `openBoxTarget`。
量測錨點一律用 `.list-item`（header `.active` 已 sticky、pinned 時 rect.top 被 clamp 量不準；item 盒不 pin、頂＝header 自然位）。手動開啟捲距短（目標在視窗內＝周邊已渲染）無漂移、不走補差 pass。驗證：展開後 pinDelta −8px（微超捲方向、header 被 sticky 釘線上＝視覺貼齊）、自關 box/item 位置零位移、手動 restore 迴歸不變。
⭐通則：**cv:auto 清單上任何「先算後捲/儲存絕對 scroll 值」的機制都會被估高→實高位移弄 stale**——捲動目標要在捲完當下重量（或存語意旗標而非數值）。

### 第七輪（09-10）：cv:auto 讓 CSS transition 進場全 snap（user「zebra 灰卡 title 不做進場動畫」）

A/B 鐵證（同流程、runtime 注入 `cv:visible !important` 對照）：cv:auto 下捲入揭露的 zebra clip 從 inset(100%) 一幀 snap 到 0、title row translateY 第一幀就 0；cv:visible 全程正常（clip 100→66→28→0、ty 66→56→44→0）。機制＝**reveal 觸發（IO/ScrollTrigger fire）與 item 脫離 skipped 常在同幀，隱藏態從未 commit → 同幀改樣式 CSS transition 不啟動**（GSAP 逐幀寫 inline 不受影響——所以只有 B-1 之後的 CSS transition 路徑中招）。另切換路徑再加一刀：cull 分類（offsetParent/gBCR）跑在 panel 剛 display 翻開、cv 幾何未定的同步時刻 → 首屏 group 被誤判框外直接 snap（實測 rows 根本沒進隱藏態）。

修（統一 pattern＝**動畫窗口 inline `content-visibility:'visible'`＋單次 reflow commit 隱藏態 → 動畫完還原 `''`**）：
1. activities `revealIo` callback（activities-data-loader.js）：揭前 `it.style.contentVisibility='visible'; void it.offsetHeight;`；rows onDone／無 rows fallback 還原。
2. activities 初載 `ScrollTrigger.batch` onEnter：owner items 同處理，onDone 還原。
3. admission `setupAdmissionReveal`：被藏集合（≤limit 64＝首屏帶）hide 時就 inline visible——讓切換 reveal 的 cull 分類讀到真實幾何＋transition 可起跑；`unlockGroup`（off snap 與 reveal onDone 共用）還原；reduced-motion 路徑（不走 unlockGroup）另補還原。
4. admission ScrollTrigger onEnter：同 2。

驗證（A/B 全一致）：lazy 捲入（clip 100→66→28→0、ty 66→…→0）、切分頁（rows 持藏 −30 → 依 cursor 滑入、底色 clip 正常）、初載 ST（ty 32→25→12→2→0）；穩態效能不退（275 item：hover 177／開 407／關 0／捲 411ms）；TS 無新錯。

⭐通則：**cv:auto 元素上要跑 CSS transition 進場，觸發時刻必須先 inline visible＋reflow commit 隱藏態**（「進視窗才揭」的觸發器和「進視窗才渲染」的 cv 是同一個訊號、天生同幀）；且**任何在 display 翻開當幀同步讀幾何做分類/量測的代碼，讀到的是 cv 未定態**——要嘛先 inline visible 要嘛延幀。

### 第八輪（09-10）：deep-link 講座副標收合動畫（user「也要先讓 title 的副標收起」）

兩個原因疊加讓 deep-link 看不到 lectures 副標收合：
1. **`.active` 在 proceedOpen 起跑就加**：收合 CSS transition 在畫面外播掉，box 捲到 item 時早收完。修＝deepOpen 把 `.active`（＋content inert 解除）延到「alignDone → settleAlignFresh 補差完」才加，收合在視窗內可見地播 0.3s、`setTimeout(doExpand, DUR.fast+30)` 收完才展開（list-accordion.js deepOpen 序列改：`align → 補差 → .active → 等收合 → expand`；非 deepOpen 路徑不動）。
2. **deep-link 窗口 `_bornShown` 跳過包遮罩**（第四輪 hero 修的取捨）：收合 CSS 目標是 `.clip-reveal-wrapper:has(.list-subtitles)`，目標 item 的 rows 沒包＝selector 不匹配 → 副標收不掉，等 settle 批補包時才「出生即 0fr」無動畫瞬收（trace 實錄 6427ms snap）。修＝`_lazyRenderAll` 分幀建到目標時，**目標 item 自己的 rows 立刻包**（單 item＝一次 recalc、不吃 bornShown 跳過），其餘照舊 settle 批補。

驗證：時序 box 到位 4799 → .active 4926 → 副標收合 4926→5158（0.23s、有中間幀＝真動畫）→ 收完才展開 5278 ✓；落點 pinDelta −20（微超捲安全側、sticky 釘線視覺貼齊）、自關零位移、手動開關不變；TS 無新錯。

5. **降落途中不播進場動畫**（user「前面 99 個快速帶過」）：deep-link 導航窗口內（targeted `_lazyRenderAll` 起跑 → settle）由 fill/idle 建的 item 原本 born-hidden＋reveal-IO 捲入才揭——降落捲動掃過時逐個播 clip-reveal。加 `container._bornShown` 旗標：窗口內 `buildOneBatch` 全走「出生即顯示」分支（同 targeted buildOne），settle 清旗標後恢復正常 lazy reveal。驗證：deep-link 落地 panel 零隱藏殘留；一般瀏覽 47/47 born-hidden 待揭不受影響。

## 現象
首頁點 floating 活動卡片 → `/pages/activities.html?section=X&item=Y` deep-link，落地捲動＋accordion 展開時超級卡頓。

## 量測（headless Chrome + CDP Profiler + PerformanceObserver longtask）
- **activities deep-link（lectures item）**：點擊後 9s 內 long tasks **1.6~2.7s / 19~30 個**（弱幀情境一輪量到 6.1s），群集落在 **+3.4~4.9s**＝正好是「accordion 剛展開、gallery strip reveal、使用者開始看內容」的窗口。
- **對照組 curriculum deep-link**：同流程只有 **0.16~0.24s / 2 個** long task＝順。差異不在 router/hero/捲動，在 activities 自己的 post-render 工作。

profiler self-time 大宗（activities 輪）：
```
reconcileChunk        activities-data-loader.js:917   ~650ms（多次呼叫合計）
setAttribute / get offsetWidth / getPropertyValue     ~540ms（forced reflow 伴隨）
clipRevealImg         activities-data-loader.js:607   ~183ms
ensureListDualCopy    activities-data-loader.js:885   ~220ms（另輪）
updateChevrons        activities-data-loader.js:782   ~230ms（另輪）
(program) 佔比極高 ＝ style recalc / layout（非 JS self-time）
```

## 根因鏈
1. **deep-link 把整份清單建滿**：`_lazyRenderAll(targetDomId)` 分幀建到目標＋idle 背景建完其餘 → 到 1.6s 計時器 fire 時 DOM 已是全量（lectures 百項級），不是一般路徑的首批 15 項。
2. **兩個固定 1.6s 延遲撞進 deep-link 動畫窗口**：`initMarquees` 的 IO+1600ms（activities-data-loader.js:1097）與 `_bindTimer` 1600ms（:861）。一般路徑 1.6s 已避開動畫；deep-link 的序列是 hero wait ~0.9s＋平滑捲 0.5~1.1s＋accordion 展開 0.5s ≈ 2~2.5s，兩個 timer 的工作又因量體大被拉長 ~1.5s → 正好疊在「展開完、內容 reveal」上。
3. **marquee 量測是逐 chunk 讀寫交錯**：`reconcileChunk` 每對 wrap「讀 clientWidth/scrollWidth → 寫 dataset/class/gsap.set/clone → 讀 offsetWidth」→ 每 chunk 對全頁 forced reflow 1~2 次。`_mqFlush` 的 8ms 預算是「跑完一個 fn 才檢查」，單 fn 一次 reflow 在全量 DOM 上就 30~150ms＝預算擋不住，一連串 50~155ms 長幀持續 ~1.5s。
4. **全量量測破功 `content-visibility:auto`**：讀畫面外 item 內 wrap 的幾何值會強制 layout 該子樹，等於把 content-visibility 的省略全部吐回來。marquee 是裝飾性 overflow，畫面外根本不用量。

附帶（小）：index 離頁 exit 窗口內 `index-yt-card.js tick` 仍逐幀跑（~230ms self-time，點擊瞬間 +47ms 142ms 長幀的一部分）。

## 修法（建議順序）

### 1. marquee 量測改「per-item 進視窗才量」（主修，對齊既有「看得到才量」語意）
`initMarquees` 現在是 container 級 IO fire 後一次處理**整個 container** 的 wraps。改成：初次 pass 只處理「目前在視窗附近的 item」的 wraps，其餘 item 掛 per-item IO（或掛回 lazy-render 已有的 observer 體系），捲近才 processWrap。deep-link 全量 DOM 下量測量體從百項級掉回視口級（~10 項）。既有 `dataset.mqBound` 守衛不變，RO/fonts/gallery:check 補量照舊。

### 2. deep-link 導航期間 gate 兩個 1.6s timer
activities-section-switch 暴露「deep-link 導航已 settle」的 promise/旗標（navigateToItem 完成＋accordion 開完），`runMarquees` 與 `_bindTimer` 的起跑改等 `max(1600ms, navSettled)`。把剩餘工作挪出可視動畫窗口。做完修法 1 之後這條只是保險，工程量極小可順手。

### 3.（選配）reconcileChunk 讀寫分離
若修法 1 後仍見長幀：把 `_mqFlush` 批次拆成「全部先量（讀）→ 全部再寫」兩相；`ensureListDualCopy` 的 clone 先批次 append、單次 reflow 後再批次讀 offsetWidth。工程量中，動的是既有效能鐵則（讀寫分離）該做的事，但視口級量體下可能已不需要。

## 驗證
同 scratchpad 量測腳本（原子選取「當下 href 是 activities」的 floating 卡片再點——**卡片會循環換 href**，先抓 handle 再點會點到別頁）：long tasks 目標 <400ms、+3~5s 窗口無 >100ms 長幀；curriculum 對照組不退步。實機再過一次手感。
