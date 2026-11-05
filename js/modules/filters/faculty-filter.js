/**
 * Faculty Filter Module
 * 師資分類 nav（Fulltime / Parttime / Admin / Founder）：四面卡牆由上往下接著捲（user 2026-11-04「跟 about 一樣」；
 * 原本 nav 切換一次只顯示一類），nav＝scroll-spy＋點擊捲到該牆
 */

import { setupClipReveal, navChipHidden, pickNavDir, NAV_CHIP_SHOWN, revealHidden } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { bindNavBtnFit, bindNavBtnSpin, isNavSpinDesktop, bindFrameScrollSplit, navHoverColor, bindLandscapeNavGate, bindMobileBottomBar } from '../ui/section-switch-helpers.js';
import { DUR, EASE } from '../ui/motion.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { waitForHeroAnimDone } from '../pages/hero-animation.js';
import { scrollWindowNoSnap, initColSnap, whenScrollSettles } from '../ui/snap-scroll.js';

// 卡片進場動畫（2026-08-16 圖片由 clip-path 擦除改 clip-reveal 滑入，user 指定全卡統一 clip-reveal 語彙）：
//   圖片 → wrapper 整塊（灰底+照片+overlay）在 .faculty-card-image-mask（overflow:clip，template 內建
//          非 runtime wrap）內依 data-img-dir 4 方向 x/yPercent 滑入；旋轉在 mask 上 → 滑動跟著旋轉角、角不被裁
//   文字（name / title）→ Clip-Reveal Entrance（hero-style 由下而上，見 CLAUDE.md「共用動畫模式」）
//   name 先進，title 略晚進；卡與卡之間再 stagger
//   藏定位＝revealHidden(imgDir)（scroll-animate.js，±110 過衝防 dpr hairline）

// 左側 filter nav 進場/退場：2026-07-16 改 hero 式 clip-reveal＝translate（獨立屬性，與 inner 的 inline
// rotate 共存）＋同步 clip-path 滑動揭露（navChipHidden，見 scroll-animate.js）。
// 🔑 仍套在 `.anchor-nav-inner`（色塊本身）**不是** btn——clip 在旋轉前的 local box 生效、跟著 chip 旋轉：
//   旋轉角不裁、不疊鄰、免 wrapper（原 wipe 版的三個優點全保留），位移向量旋轉 θ 讓窗口錨點釘死。
// 方向統一由下而上（hero 語彙；2026-07-17 隨機四方向退役）；DUR.base、EASE.wipe、stagger 0.02、clearProps。

function setupFacultyCardAnim(card) {
  if (typeof gsap === 'undefined') return;
  const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
  const name = card.querySelector('.faculty-card-name');
  const title = card.querySelector('.faculty-card-title');
  const imgDir = card.dataset.imgDir || 'bottom';

  // 進場期間禁 pointer-events，避免使用者 hover 到還沒揭露的卡片造成空白色塊
  card.classList.add('pointer-events-none');
  // 重置 reveal 標記：此卡尚未開始進場（reveal tween onStart 觸發才標 started）。
  // exit 用它分辨「這張該不該收」——只收已經露出來的，沒輪到的不強拉出來再收（user 2026-06-06）。
  delete card.dataset.revealStarted;
  if (imgWrapper) gsap.set(imgWrapper, revealHidden(imgDir));
  // 文字用共用 clip-reveal helper：wrap 一層 overflow:clip + yPercent:100
  if (name) setupClipReveal([name]);
  if (title) setupClipReveal([title]);
}

// 進場時序：
//   每張卡片內：image 揭露中，title 提前在 image 跑到 NAME_OFFSET/IMG_DUR 進度時就開始（跟 image 後半段重疊）
//   卡與卡之間：image 跑到一半時下一張 image 起跑
//   重要約束：NAME_OFFSET 必須 ≥ CARD_ADVANCE，否則 title 會搶在「下一張 image 出現」之前 → 違反使用者要求
//   row 與 row 之間：上一 row 最後一張卡片動畫完整結束 + ROW_GAP 才換 row
//   卡片完整揭露（title 動畫結束）後才解除 pointer-events-none，重啟 hover
const IMG_DUR = 0.8;         // 圖片 clip 揭露（user 2026-06-09 拍板 0.8：1.0 太慢、0.6 又太快；非 palette token 故字面值）
const TEXT_DUR = DUR.medium; // name/title clip-reveal = 0.5（user 拍板）
const CARD_ADVANCE = IMG_DUR / 2;     // image 一半時下一張 image 起跑 → 0.4（user 要的卡間隔）
const NAME_OFFSET = CARD_ADVANCE + 0.1; // 下一張 image 起跑後 0.1s 才 name 開始（保證 title 不搶在下一張 image 之前）→ 0.5
const TITLE_OFFSET = NAME_OFFSET + 0.1; // name 之後 0.1s 接 title（subtitle 內部小 stagger）→ 0.6
const CARD_FULL_DURATION = TITLE_OFFSET + TEXT_DUR; // 0.6 + 0.5 = 1.1
const ROW_GAP = 0.1;                  // row 與 row 之間的空檔
const HOVER_UNLOCK_BUFFER = 0.05;     // 動畫結束到解鎖 hover 之間的緩衝

// offsetTop 分 row（容忍 5px 誤差）
function groupCardsByRow(cards) {
  const sorted = [...cards].sort((a, b) => {
    const dt = a.offsetTop - b.offsetTop;
    return Math.abs(dt) > 5 ? dt : a.offsetLeft - b.offsetLeft;
  });
  const rows = [];
  let currentRow = [];
  let currentTop = -Infinity;
  sorted.forEach(card => {
    if (currentRow.length === 0 || Math.abs(card.offsetTop - currentTop) < 5) {
      currentRow.push(card);
      currentTop = card.offsetTop;
    } else {
      rows.push(currentRow);
      currentRow = [card];
      currentTop = card.offsetTop;
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

function playFacultyCard(card, startTime) {
  const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
  const name = card.querySelector('.faculty-card-name');
  const title = card.querySelector('.faculty-card-title');

  if (imgWrapper) {
    gsap.to(imgWrapper, {
      xPercent: 0,
      yPercent: 0,
      duration: IMG_DUR,
      ease: EASE.enter,
      delay: startTime,
      clearProps: 'transform',
      // image 是每張卡最先動的元素：它真的開跑（onStart，非排程當下）才算這張「已 reveal」。
      // delay 期間被 kill（離頁/切 tab）→ onStart 不會 fire → 維持未標記 → exit 自動跳過這張。
      onStart: () => { card.dataset.revealStarted = '1'; },
    });
  }
  if (name) {
    gsap.to(name, {
      yPercent: 0,
      duration: TEXT_DUR,
      ease: EASE.enter,
      delay: startTime + NAME_OFFSET,
      clearProps: 'transform',
    });
  }
  if (title) {
    gsap.to(title, {
      yPercent: 0,
      duration: TEXT_DUR,
      ease: EASE.enter,
      delay: startTime + TITLE_OFFSET,
      clearProps: 'transform',
    });
  }
  // 卡片完整揭露 = title 動畫結束時間；之後解鎖 hover
  // 用 _hoverUnlockTimer 追蹤 timer id，下次 setup / exit 時 clear 避免 stale unlock 殘留
  if (card._hoverUnlockTimer) clearTimeout(card._hoverUnlockTimer);
  const finishAt = startTime + TITLE_OFFSET + TEXT_DUR + HOVER_UNLOCK_BUFFER;
  card._hoverUnlockTimer = setTimeout(() => {
    card._hoverUnlockTimer = null;
    unlockHoverWhenImageReady(card);
  }, Math.round(finishAt * 1000));
}

// 解鎖 hover 的條件 = reveal 動畫結束「且」卡片圖片已載入完成。
// 後台真照片走網路（且 loading=lazy，fold 下捲到才下載）→ reveal 跑完圖可能還沒到，
// 此時解鎖會讓使用者 hover 到空白/半載入的卡片（part-time 真照片多才明顯，full-time 圖載得快通常已 complete = 不受影響）。
// 圖已 complete → 立即解鎖；未完成 → 等 load；load 失敗（error）也解鎖，避免單張圖 404 讓卡片永久卡在不可 hover。
function unlockHoverWhenImageReady(card) {
  const img = /** @type {HTMLImageElement|null} */ (card.querySelector('.faculty-card-image'));
  const unlock = () => card.classList.remove('pointer-events-none');
  if (!img || img.complete) { unlock(); return; }
  img.addEventListener('load', unlock, { once: true });
  img.addEventListener('error', unlock, { once: true });
}

function playFacultyCardsSerial(cards) {
  // Row-aware serial：同 row 內用 CARD_ADVANCE 大幅重疊，row 結束等最後一張完整完成才換 row
  const rows = groupCardsByRow(cards);
  let cursor = 0;
  rows.forEach(row => {
    row.forEach((card, i) => {
      playFacultyCard(card, cursor + i * CARD_ADVANCE);
    });
    // 下一 row start = 此 row 最後一張卡片 startTime + 完整動畫長度 + ROW_GAP
    const lastCardStart = cursor + (row.length - 1) * CARD_ADVANCE;
    cursor = lastCardStart + CARD_FULL_DURATION + ROW_GAP;
  });
}

// 進場 trigger＝ScrollTrigger.batch（每張卡各自 trigger）：同一批（同時進視窗的幾列）照列序接力；
// 之後捲進來的列自成一批、進視窗就播，不排在上面還沒播完的列後面——滾輪比逐列進場快，
// 原本「整面牆一條序列」捲下去看到的列還在排隊＝空白（user 2026-11-04）

// ±1–3°（同 library documents）：hover 粉底瞬間出現、圖 0.3s 才轉正——角度大於 ~3° 時斜角凸出超過卡片 6px padding、
// 轉正途中圖角壓出粉框（原 ±3–6°，user 2026-10-19）。faculty-data-loader／alumni 初始角同範圍
const facultyImgDeg = () => `${((Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2)).toFixed(2)}deg`;

// 先藏好（同步、首繪前），回傳 arm()＝建 ScrollTrigger 捲到才播；scroller＝桌面右欄（frame 內捲）／省略＝window
const NOOP = () => {};
const NO_REVEAL = { arm: NOOP, finish: NOOP };
// 卡片直接到終態（圖不裁、文字到位、解 hover 鎖）：減少動態、點 nav 跳過的牆共用
function showCardsNow(items) {
  items.forEach(card => {
    const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
    const name = card.querySelector('.faculty-card-name');
    const title = card.querySelector('.faculty-card-title');
    gsap.killTweensOf([imgWrapper, name, title].filter(Boolean));
    if (imgWrapper) gsap.set(imgWrapper, { clearProps: 'transform' });
    if (name) gsap.set(name, { clearProps: 'transform' });
    if (title) gsap.set(title, { clearProps: 'transform' });
    if (card._hoverUnlockTimer) { clearTimeout(card._hoverUnlockTimer); card._hoverUnlockTimer = null; }
    card.classList.remove('pointer-events-none');
    card.dataset.revealStarted = '1';
  });
}
// 回傳 { arm＝建 ScrollTrigger 捲到才播, finish＝不播了、直接到終態 }
function prepareFacultyCards(cards, scroller) {
  if (typeof gsap === 'undefined') return NO_REVEAL;
  const items = Array.from(cards);
  if (items.length === 0) return NO_REVEAL;

  // 減少動態：卡片直接全顯，不排序列、不上 ScrollTrigger、不鎖 hover
  if (prefersReducedMotion()) { showCardsNow(items); return NO_REVEAL; }

  items.forEach(card => {
    gsap.killTweensOf([
      card.querySelector('.faculty-card-image-wrapper'),
      card.querySelector('.faculty-card-name'),
      card.querySelector('.faculty-card-title'),
    ].filter(Boolean));
    // 每次進場（含 filter 切換）重擲旋轉角（user 2026-08-16；原本 render 時擲一次就固定）。
    // ⚠️ mask 帶 hover 用的 `transition: transform 0.3s`（cards.css）——改 --init-deg **會觸發**它補間旋轉
    // （transform 吃 var 變更會動，跟 background-color 吃 var 不動的 atlas 案不同）。第一張卡 delay 0
    // 進場正好撞上補間尾巴＝「圖片滑入時轉了一下才就定位」（user 回報；後面的卡 stagger 後才進、看不到）。
    // 修＝關 transition → 改 var → 強制 reflow 讓新角度無過場落地 → 還原（hover 仍需要那條 transition）。
    const mask = /** @type {HTMLElement|null} */ (card.querySelector('.faculty-card-image-mask'));
    if (mask) mask.style.transition = 'none';
    card.style.setProperty('--init-deg', facultyImgDeg());
    setupFacultyCardAnim(card);
    if (mask) { void mask.offsetWidth; mask.style.transition = ''; }
  });

  /** @type {any[]} */
  let sts = [], done = false;
  return {
    arm: () => {
      if (done) return;
      if (typeof ScrollTrigger === 'undefined') { playFacultyCardsSerial(items); return; }
      sts = ScrollTrigger.batch(items, { scroller, start: 'top 90%', once: true, onEnter: batch => playFacultyCardsSerial(batch) });
    },
    // 點 nav 跳去別類：還在跑／還沒輪到的進場直接到終態（user 2026-11-04「原本還在跑動畫的 section 就不需要跑了，
    // 這樣往上才有內容」）——逐列進場一面牆要好幾秒，不收掉的話捲回去還是空的
    finish: () => {
      done = true;
      sts.forEach(st => st.kill());
      showCardsNow(items);
    },
  };
}

// 退場序（離頁）：text 先收（title → name），image 最後收，方向與進場 imgDir 一致 = 從哪邊進就從哪邊退
const EXIT_DUR = 0.6;
const EXIT_INTERNAL_STEP = 0.07;  // 同卡內 title → name → image 間距
const EXIT_CARD_STEP = 0.04;      // 卡與卡之間 stagger

function exitFacultyCards(cards, onComplete) {
  if (typeof gsap === 'undefined') { if (onComplete) onComplete(); return; }
  if (prefersReducedMotion()) { if (onComplete) onComplete(); return; }  // 減少動態：不退場，立即切換/換頁
  const all = Array.from(cards);

  // 只收「已經開始 reveal」的卡片（dataset.revealStarted 由進場 image tween 的 onStart 標記）。
  // 沒輪到進場的卡片：kill 掉它排隊中的進場 tween（避免離頁/切 tab 瞬間又彈出來），維持隱藏、
  // 不納入退場序列 → 切 tab / 離頁時「只收當下露出來的那幾張」，不會所有卡片先閃出來再一起收（user 2026-06-06）。
  const started = [];
  all.forEach(card => {
    if (card._hoverUnlockTimer) { clearTimeout(card._hoverUnlockTimer); card._hoverUnlockTimer = null; }
    card.classList.add('pointer-events-none');
    if (card.dataset.revealStarted) {
      started.push(card);
    } else {
      [card.querySelector('.faculty-card-image-wrapper'),
       card.querySelector('.faculty-card-name'),
       card.querySelector('.faculty-card-title')].forEach(el => el && gsap.killTweensOf(el));
    }
  });

  if (started.length === 0) { if (onComplete) onComplete(); return; }

  let maxFinish = 0;
  started.forEach((card, i) => {
    const cardDelay = i * EXIT_CARD_STEP;  // stagger 只算「要收的那幾張」，序列緊湊不留空位
    const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
    const name = card.querySelector('.faculty-card-name');
    const title = card.querySelector('.faculty-card-title');
    const imgDir = card.dataset.imgDir || 'bottom';

    if (title) {
      gsap.killTweensOf(title);
      gsap.to(title, { yPercent: 110, duration: EXIT_DUR, ease: EASE.exit, delay: cardDelay });
    }
    if (name) {
      gsap.killTweensOf(name);
      gsap.to(name, { yPercent: 110, duration: EXIT_DUR, ease: EASE.exit, delay: cardDelay + EXIT_INTERNAL_STEP });
    }
    if (imgWrapper) {
      gsap.killTweensOf(imgWrapper);
      // 收合方向永遠 = revealHidden(imgDir)（= 進場起點）→ 沿進場路徑往回滑出。
      // transform 沒有 clip-path 那個「clearProps 後 computed=none 補不動」問題（x/yPercent 未設即 0），
      // 完整揭露 / 進場中（半開）都直接 gsap.to 即可，免 fromTo 分流。
      gsap.to(imgWrapper, {
        ...revealHidden(imgDir),
        duration: EXIT_DUR,
        ease: EASE.exit,
        delay: cardDelay + EXIT_INTERNAL_STEP * 2,
      });
    }
    const finish = cardDelay + EXIT_INTERNAL_STEP * 2 + EXIT_DUR;
    if (finish > maxFinish) maxFinish = finish;
  });

  if (onComplete) setTimeout(onComplete, Math.round(maxFinish * 1000) + 30);
}

// initialSection：site map deep-link 帶進來的 ?section（fulltime/parttime/admin/founder）；無/不合法 → 預設 fulltime。
// unlock：deep-link 呈現完的解鎖鑰匙（main-modular 傳入）
export function initFacultyFilter(initialSection = null, unlock) {
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (filterButtons.length === 0 || facultyCards.length === 0) { unlock(); return; }  // 沒卡片＝deep-link 無從呈現

  // hover 卡片圖轉正（cards.css :hover）、離開換新角（user 2026-10-19；mask 的 transition 負責補間）
  if (window.matchMedia('(hover: hover)').matches) {
    facultyCards.forEach(el => {
      const card = /** @type {HTMLElement} */ (el);
      card.addEventListener('mouseleave', () => card.style.setProperty('--init-deg', SCCDHelpers.rerollAngle(facultyImgDeg, card.style.getPropertyValue('--init-deg'))));
    });
  }

  // 滾輪分區：col 1-3 捲 window（去 footer/hero）、col 4 起內部捲（box 邊界不外溢），見 section-switch-helpers
  bindFrameScrollSplit(document.getElementById('faculty-cards'));

  // （手機 header 底色帶 .mobile-header-bg 已提升為全站元素：放 header.html、footer-near hide 在 header.js
  //   bindFooterScroll，2026-07-17。原 faculty 專屬 .faculty-header-bg + 此處 scroll listener 已移除。）

  // 離頁退場：對「畫面上」的老師卡片做收場（text 收 → image 收）。四面牆都在流裡＝只收視窗內的，
  // 捲過的牆不排進 stagger（否則看得到的那幾張要等前面幾十張排完才收）。router 換頁前 await 完才 swap DOM。
  registerPageExit(() => new Promise(resolve => {
    const onScreen = Array.from(facultyCards).filter(card => {
      const r = card.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    exitFacultyCards(onScreen, resolve);
  }));

  // ── 左側 filter nav 進場/退場（2026-07-16 改 hero 式 clip-reveal：translate＋同步 clip 滑動揭露）──
  // 套在 .anchor-nav-inner（色塊本身）→ 旋轉角不裁、不疊鄰（見上方 const 區註解）。
  // 進場：各 inner 從自己那顆固定的隨機方向滑入（2026-07-17 全站四方向隨機），只在頁面初次載入（section 進視窗）跑一次；filter 切換不重播。
  // 退場：只在離開 faculty 頁且「已進場」才跑（沒看過不閃），fromTo 顯式起點 SHOWN（clearProps 後 computed=none
  //       無法補間，見 feedback_clippath_exit_after_clearprops_use_fromto）→ 沿原方向滑出，from:'end' 反向 stagger。
  // ⚠️ smooth 關鍵：`.anchor-nav-inner` 帶 navigation.css 的 `transition: all`（給 hover / filter 切換 bg·rotate 過場用）。
  //   不處理的話 GSAP 每幀寫的 clipPath/translate 會觸發那條 0.3s CSS transition → 渲染落後 GSAP、卡頓（user 報「不夠 smooth」）。
  //   做法＝動畫期間 inner.style.transition='none'，進場跑完 onComplete 還原 ''（hover/filter 切換仍需要那條 transition）。
  let navRevealed = false;
  const navInners = Array.from(filterButtons)
    .map(b => /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner')))
    .filter(Boolean);
  // 每顆固定一個隨機方向（reveal/hide 來回一致）；px 向量依當下寬高/角度、每次要藏重算
  const navDir = new Map(navInners.map(inner => [inner, pickNavDir(inner)]));
  const exitInners = navInners;   // 離頁退場目標（矮橫向 header 帶同一組）
  // 直向手機：nav＝畫面底 bar，整條滑進滑出（bindMobileBottomBar），chip 不另逐顆進退場
  const bottomBar = /** @type {HTMLElement|null} */ (document.querySelector('#faculty-cards .nav-bottom-bar'));
  const isBottomBar = !!bottomBar && SCCDHelpers.isBottomBarLayout();   // 直向＋iPad 底 bar；橫向手機 nav 回 header 帶（10-30）
  if (isBottomBar) bindMobileBottomBar(bottomBar);
  else if (typeof gsap !== 'undefined' && navInners.length && !prefersReducedMotion()) {  // 減少動態：nav 維持靜態可見
    navInners.forEach(inner => { inner.style.transition = 'none'; gsap.set(inner, navChipHidden(inner, navDir.get(inner))); });
    const section = document.getElementById('faculty-cards');
    const isLandscapeGate = SCCDHelpers.isLandscapePhone();   // 橫向手機才進 header 帶（iPad 走上面底 bar）
    if (isLandscapeGate && 'IntersectionObserver' in window && section) {
      // 矮橫向：nav 進 header fixed、hero 也浮著 → 嚴格 hero gate（bindLandscapeNavGate；2026-09-29 DCD 系所鈕撤掉後
      // header 帶只剩分類鈕）。faculty-nav-revealed：header 帶遮擋跟 nav 同 gate（landscape.css 消費）——卡片捲過
      // 透明 header 會疊在 nav btn 後（user 2026-07-10 統一各頁 nav 遮擋）；hero 時不掛、不蓋 hero 圖
      bindLandscapeNavGate(section, /** @type {HTMLElement[]} */ (navInners), navDir,
        { revealedClass: 'faculty-nav-revealed', onChange: (v) => { navRevealed = v; } });
    } else {
      // 桌面/直向：進場 once、不 re-hide（維持原行為）
      const playNavReveal = () => {
        if (navRevealed) return;
        navRevealed = true;
        gsap.to(navInners, {
          ...NAV_CHIP_SHOWN,
          duration: DUR.base,
          ease: EASE.wipe,
          stagger: 0.02,
          clearProps: 'clipPath,translate',
          onComplete: () => navInners.forEach(inner => { inner.style.transition = ''; }),
        });
      };
      const inView = section && section.getBoundingClientRect().top < window.innerHeight * 0.9;
      if (!section || inView || typeof ScrollTrigger === 'undefined') {
        playNavReveal();
      } else {
        // trigger 在 #faculty-cards（在 #page-content 內）→ cleanupPageModules 換頁時會一併 kill，不洩漏
        ScrollTrigger.create({ trigger: section, start: 'top 90%', once: true, onEnter: playNavReveal });
      }
    }
  }

  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !navRevealed || !exitInners.length) { resolve(); return; }
    gsap.killTweensOf(exitInners);
    exitInners.forEach(inner => { inner.style.transition = 'none'; });  // 同進場：停掉 transition:all 免追 GSAP 每幀寫入卡頓
    const hid = exitInners.map(inner => navChipHidden(inner, navDir.get(inner)));
    gsap.fromTo(exitInners,
      { ...NAV_CHIP_SHOWN },
      {
        clipPath: (i) => hid[i].clipPath,
        translate: (i) => hid[i].translate,
        duration: DUR.base,
        ease: EASE.wipe,
        stagger: { each: 0.02, from: 'end' },
        overwrite: true,
        onComplete: resolve,
      }
    );
  }));

  function setActiveStyle(activeBtn, color) {
    filterButtons.forEach(btn => {
      const inner = /** @type {HTMLElement|null} */ (btn.querySelector('.anchor-nav-inner'));
      if (inner) inner.style.background = '';   // transform 不清：角度常駐（hover 抽角後保持）
    });
    const activeInner = /** @type {HTMLElement|null} */ (activeBtn.querySelector('.anchor-nav-inner'));
    if (activeInner) {
      activeInner.style.background = color;
      // 桌面沿用 hover 當前角（click 不另抽）；手機/矮橫向無 hover → click 現抽
      if (!isNavSpinDesktop()) activeInner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
    }
  }

  // 初始隨機角＋桌面 hover 抽新角（離開保持），見 section-switch-helpers
  bindNavBtnSpin(filterButtons);
  bindNavBtnFit(filterButtons);   // 左欄窄、長英文折行 → 色塊貼文字寬（四頁 nav 共用 helper；2026-09-29 分類鈕回左欄）

  // ── 四面牆串接：捲動欄＝桌面 frame 右欄（自己捲）／手機・gate 拆 frame＝window ──
  const section = document.getElementById('faculty-cards');
  const scrollCol = /** @type {HTMLElement|null} */ (section && section.querySelector('.inner-scroll-scroll-col'));
  const colScrolls = !!scrollCol && getComputedStyle(scrollCol).overflowY !== 'visible';
  const navItems = [...filterButtons]
    .map(btn => ({ btn, wall: document.getElementById(`faculty-${btn.getAttribute('data-filter')}-list`), reveal: NO_REVEAL }))
    .filter(n => n.wall && n.wall.children.length);   // 空牆（該類沒老師）不參與 spy、點了不動
  const firstWall = navItems[0]?.wall;
  // 牆的位置看「第一張卡」不看牆框：桌面牆間距掛在後面牆首列卡片的 margin 上（cards.css），牆框頂比卡片高一截
  const wallTop = (wall) => (wall.firstElementChild || wall).getBoundingClientRect().top;
  // 牆的落點＝第一面牆「捲到段頂」時的位置：桌面＝右欄 scrollTop、手機＝相對段頂的 window 位移（兩者同一個差值）
  const wallOffset = (wall) => wallTop(wall) - wallTop(firstWall);
  const sectionY = () => section.getBoundingClientRect().top + window.scrollY;
  // 每面牆＝一個吸附點（.snap-zone；user 2026-11-04「跟 about 一樣每個 section 都 snap」）：scroll-margin-top 讓吸附落點＝
  // 點 nav 的落點（第一張卡停在第一面牆的首卡位置）；桌面牆框頂比首卡高一截（間距掛卡片）→ 後面幾面是負值。空牆不當吸附點
  document.querySelectorAll('#faculty-cards .faculty-card-wall:empty').forEach(w => w.classList.remove('snap-zone'));
  // 每面牆至少一屏（user 2026-11-04「每個 nav 的內容 min-height 100vh，不會看到下面 nav 的內容」）：落點在某一類時，
  // 下一類第一張卡剛好在視窗底下 PEEK_GUARD（旋轉卡角凸出 box 的餘量）＝看不到；最後一面改扣「牆底到捲動終點」
  //（桌面右欄 padding-bottom／手機 section 底 pad）＝捲到底它也在落點、上一類不露、footer 剛好在畫面外。
  // 短的類別因此剛好一屏（相鄰落點距＝一屏）＝分段磁吸一格換段、沒有多出來的自由捲。牆框頂到第一張卡那截（桌面牆間距掛卡片）
  // 要加回去；「牆底到下一類首卡」與牆自己多高無關＝不用先清再量
  const PEEK_GUARD = 16;
  const fitWalls = () => {
    if (!firstWall) return;
    const landing = colScrolls
      ? wallTop(firstWall) - scrollCol.getBoundingClientRect().top + scrollCol.scrollTop
      : wallTop(firstWall) - section.getBoundingClientRect().top;
    const viewH = colScrolls ? scrollCol.clientHeight : window.innerHeight;
    const last = navItems[navItems.length - 1].wall;
    const lastBottom = last.getBoundingClientRect().bottom;
    const after = colScrolls
      ? scrollCol.scrollHeight - (lastBottom - scrollCol.getBoundingClientRect().top + scrollCol.scrollTop)
      : section.getBoundingClientRect().bottom - lastBottom;
    navItems.forEach(({ wall }, i) => {
      const r = wall.getBoundingClientRect();
      const cardOffset = wallTop(wall) - r.top;
      const next = navItems[i + 1]?.wall;
      const below = next ? wallTop(next) - r.bottom - PEEK_GUARD : after;   // 牆底到下一類首卡（最後一面＝到捲動終點）
      wall.style.scrollMarginTop = `${Math.round(landing - cardOffset)}px`;
      wall.style.minHeight = `${Math.max(0, Math.round(viewH - landing + cardOffset - below))}px`;
    });
  };
  fitWalls();
  window.addEventListener('resize', fitWalls);
  registerPageCleanup(() => window.removeEventListener('resize', fitWalls));
  if (colScrolls) initColSnap(scrollCol, section);   // 桌面右欄分段磁吸（直向手機走 window JS 磁吸，main-modular）

  // 手機 nav bar 是水平 scroll strip：active 鈕捲回靠左對齊頁面內容左緣（同 curriculum program btn 做法）。
  // 只動 bar 自己 scrollLeft（rect delta），不用 scrollIntoView 以免連帶動垂直；桌面是 md:flex-col 無水平 scroll。
  const alignBar = (btn) => {
    if (!SCCDHelpers.isMobileLayout()) return;
    const bar = btn.parentElement;
    if (!bar) return;
    const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    const delta = btn.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad);
    bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
  };
  const activate = (btn, color) => {
    setActiveStyle(btn, color);
    SCCDHelpers.setActive(btn, filterButtons);
    alignBar(btn);
  };

  // scroll spy（同 about：捲動欄中線落在哪面牆就亮哪顆）；捲到底＝最後一面（短牆頂到不了中線）。
  // 點 nav 的捲動途中暫停（spyHoldUntil），免得經過的牆一路搶 active
  let spyHoldUntil = 0;
  let spyQueued = false;
  const spy = () => {
    spyQueued = false;
    if (!navItems.length || performance.now() < spyHoldUntil) return;
    const line = colScrolls ? scrollCol.getBoundingClientRect().top + scrollCol.clientHeight / 2 : window.innerHeight / 2;
    const atEnd = colScrolls && scrollCol.scrollTop + scrollCol.clientHeight >= scrollCol.scrollHeight - 2;
    let cur = navItems[0];
    if (atEnd) cur = navItems[navItems.length - 1];
    else navItems.forEach(n => { if (wallTop(n.wall) <= line) cur = n; });
    if (cur.btn.classList.contains('active')) return;
    // 捲動換段＝抽新角（同 about scroll-spy；桌面 setActiveStyle 沿用 inline 當前角＝點擊才沿用 hover 角）
    cur.btn.querySelectorAll('.anchor-nav-inner').forEach(i => { /** @type {HTMLElement} */ (i).style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; });
    activate(cur.btn, SCCDHelpers.getRandomAccentColor());
  };
  const onSpyScroll = () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } };
  if (colScrolls) scrollCol.addEventListener('scroll', onSpyScroll, { passive: true });   // 欄在 #page-content 內＝換頁隨 DOM 丟
  else {
    window.addEventListener('scroll', onSpyScroll, { passive: true });
    registerPageCleanup(() => window.removeEventListener('scroll', onSpyScroll));
  }

  // 點 nav：當下就 active（feedback：不等捲動）、捲到該牆；已 active＝無效（同 about）
  /** @type {(() => void) | null} */
  let cancelSettle = null;
  filterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      this.blur();
      const item = navItems.find(n => n.btn === this);
      if (this.classList.contains('active') || !item) return;
      // 目標以上的牆、以及從目前這類往上跳時經過的牆：捲動途中進場照播，落地才收成終態（捲回去就有內容；目標自己照常播）
      const ti = navItems.indexOf(item);
      const ci = navItems.findIndex(n => n.btn.classList.contains('active'));
      const skipped = navItems.filter((n, i) => i < ti || (i > ti && i <= ci));
      cancelSettle?.();
      cancelSettle = whenScrollSettles(colScrolls ? scrollCol : window, () => skipped.forEach(n => n.reveal.finish()));
      // active＝點下去時的 hover 色（user 2026-09-28），沒 hover（手機）才隨機
      activate(this, navHoverColor(this) || SCCDHelpers.getRandomAccentColor());
      spyHoldUntil = performance.now() + 1200;
      if (colScrolls) {
        scrollCol.scrollTo({ top: wallOffset(item.wall), behavior: 'smooth' });
        SCCDHelpers.scrollToElement('#faculty-cards');   // 人還在 hero／footer 時把 frame 帶進來
      } else {
        window.scrollTo({ top: sectionY() + wallOffset(item.wall), behavior: 'smooth' });
      }
    });
  });

  // 意圖預載：滑到/focus 某分類 tab 就先暖該分類前 16 張照片進快取（new Image()），切過去時 lazy 圖直接命中、
  // 不再等切換那刻才開始抓。前 8 張已是 eager 背景載（faculty-data-loader）；這裡補暖到第二~三屏。每顆 tab 只暖一次。
  const warmCategoryImages = (cat) => {
    let n = 0;
    facultyCards.forEach(card => {
      if (n >= 16 || card.getAttribute('data-category') !== cat) return;
      const src = card.querySelector('.faculty-card-image')?.getAttribute('src');
      if (src) { const im = new Image(); im.src = src; n++; }
    });
  };
  filterButtons.forEach(btn => {
    const warm = () => {
      if (btn.dataset.imgsWarmed) return;
      btn.dataset.imgsWarmed = '1';
      warmCategoryImages(btn.getAttribute('data-filter'));
    };
    btn.addEventListener('pointerenter', warm);
    btn.addEventListener('focusin', warm);
  });

  // Initialize：預設 fulltime，或 site map deep-link 指定的分類（parttime/admin/founder）。
  const VALID_SECTIONS = new Set(['fulltime', 'parttime', 'admin', 'founder']);
  const initialFilter = (initialSection && VALID_SECTIONS.has(initialSection)) ? initialSection : 'fulltime';
  const initBtn = [...filterButtons].find(b => b.getAttribute('data-filter') === initialFilter)
    || [...filterButtons].find(b => b.getAttribute('data-filter') === 'fulltime');
  if (initBtn) {
    SCCDHelpers.setActive(initBtn, filterButtons);   // deep-link 到非預設分類時把 .active 移到該鈕
    setActiveStyle(initBtn, SCCDHelpers.getRandomAccentColor());
  }

  // 卡片進場：每面牆各自捲到才播。全部先藏（同步）；桌面右欄的 trigger 等整個 frame 進視窗才 arm——
  // 右欄座標下第一面牆一開始就在「視窗內」，不等的話人還在 hero 就在畫外播完
  navItems.forEach(n => { n.reveal = prepareFacultyCards(n.wall.querySelectorAll('.faculty-card'), colScrolls ? scrollCol : undefined); });
  const armAll = () => navItems.forEach(n => n.reveal.arm());
  if (!colScrolls || !section || typeof ScrollTrigger === 'undefined' || section.getBoundingClientRect().top < window.innerHeight * 0.9) armAll();
  else ScrollTrigger.create({ trigger: section, start: 'top 90%', once: true, onEnter: armAll });

  // site map ?section= deep-link：等 hero 進場、平滑捲到該分類的牆——router 對 deep-link 導航
  // 跳過 scrollToTop（由目標頁自行捲），faculty 原本只切 active 沒捲＝停在 hero（user 2026-09-15）。
  // 捲到位＝呈現完成 → 解除 deep-link 操作鎖（router 對 ?section 導航已上鎖；空值／不合法的 ?section 不呈現、直接解）
  if (initialSection && VALID_SECTIONS.has(initialSection)) {
    waitForHeroAnimDone().then(() => {
      if (!section) { unlock(); return; }
      const item = navItems.find(n => n.btn === initBtn);
      let y = sectionY();
      if (item && colScrolls) scrollCol.scrollTop = wallOffset(item.wall);
      else if (item) y += wallOffset(item.wall);
      spyHoldUntil = performance.now() + 1500;   // 捲過去途中別讓經過的牆搶 active（有限值：使用者中斷捲動時 onComplete 不發）
      scrollWindowNoSnap(y, { onComplete: () => { spyHoldUntil = 0; unlock(); } });
      // 跳過的上面幾類：落地才收成終態（同點 nav）
      if (item) whenScrollSettles(window, () => navItems.slice(0, navItems.indexOf(item)).forEach(n => n.reveal.finish()));
    });
  } else if (initialSection != null) unlock();
}
