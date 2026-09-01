/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

import { setupClipReveal, navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { DUR, EASE } from '../ui/motion.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';

// 卡片進場動畫（2026-08-16 圖片由 clip-path 擦除改 clip-reveal 滑入，user 指定全卡統一 clip-reveal 語彙）：
//   圖片 → wrapper 整塊（灰底+照片+overlay）在 .faculty-card-image-mask（overflow:clip，template 內建
//          非 runtime wrap）內依 data-img-dir 4 方向 x/yPercent 滑入；旋轉在 mask 上 → 滑動跟著旋轉角、角不被裁
//   文字（name / title）→ Clip-Reveal Entrance（hero-style 由下而上，見 CLAUDE.md「共用動畫模式」）
//   name 先進，title 略晚進；卡與卡之間再 stagger
// 110 過衝非 100：dpr 非整數時 GPU rasterization 會在貼齊邊露 1-2px hairline（見 about hero SCCD 案）
const SLIDE_MAP = {
  top:    { xPercent: 0,    yPercent: -110 },
  right:  { xPercent: 110,  yPercent: 0 },
  bottom: { xPercent: 0,    yPercent: 110 },
  left:   { xPercent: -110, yPercent: 0 },
};

// 左側 filter nav 進場/退場：2026-07-16 改 hero 式 clip-reveal＝translate（獨立屬性，與 inner 的 inline
// rotate 共存）＋同步 clip-path 滑動揭露（navChipHidden，見 scroll-animate.js）。
// 🔑 仍套在 `.anchor-nav-inner`（色塊本身）**不是** btn——clip 在旋轉前的 local box 生效、跟著 chip 旋轉：
//   旋轉角不裁、不疊鄰、免 wrapper（原 wipe 版的三個優點全保留），位移向量旋轉 θ 讓窗口錨點釘死。
// 方向統一由下而上（hero 語彙；2026-07-17 隨機四方向退役）；DUR.base、cubic-bezier(0.25,0,0,1)、stagger 0.02、clearProps。
const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';  // 同灰卡 courses-grid-card

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
  if (imgWrapper) gsap.set(imgWrapper, SLIDE_MAP[imgDir] || SLIDE_MAP.bottom);
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

// 用單一 ScrollTrigger 包整段序列（不是 batch）：
//   - 卡片在 fold 下時（SPA 切到頁的初次載入）等使用者 scroll 才整段播
//   - 卡片已在 viewport 內時（filter 切換 / 上方 fold 都已可見）ScrollTrigger 立即 fire → 立刻播
//   - 之所以不用 batch：batch 每批 onEnter 啟動獨立 t=0 cursor，scroll 時第二批會跟第一批並行
let lastFacultyTrigger = null;

function animateFacultyCards(cards) {
  if (typeof gsap === 'undefined') return;
  const items = Array.from(cards);
  if (items.length === 0) return;

  // 清掉上次的 trigger（filter 切換時避免累積）
  if (lastFacultyTrigger) { lastFacultyTrigger.kill(); lastFacultyTrigger = null; }

  // 減少動態：卡片直接全顯（圖不裁、文字到位），不排序列、不上 ScrollTrigger、不鎖 hover
  if (prefersReducedMotion()) {
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
    return;
  }

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
    card.style.setProperty('--init-deg', `${((Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3)).toFixed(2)}deg`);
    setupFacultyCardAnim(card);
    if (mask) { void mask.offsetWidth; mask.style.transition = ''; }
  });

  if (typeof ScrollTrigger !== 'undefined') {
    lastFacultyTrigger = ScrollTrigger.create({
      trigger: items[0],
      start: 'top 90%',
      once: true,
      onEnter: () => {
        playFacultyCardsSerial(items);
        lastFacultyTrigger = null;
      },
    });
  } else {
    playFacultyCardsSerial(items);
  }
}

// 退場序（filter 切換時）：text 先收（title → name），image 最後收，方向與進場 imgDir 一致 = 從哪邊進就從哪邊退
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
      gsap.to(title, { yPercent: 100, duration: EXIT_DUR, ease: EASE.exit, delay: cardDelay });
    }
    if (name) {
      gsap.killTweensOf(name);
      gsap.to(name, { yPercent: 100, duration: EXIT_DUR, ease: EASE.exit, delay: cardDelay + EXIT_INTERNAL_STEP });
    }
    if (imgWrapper) {
      gsap.killTweensOf(imgWrapper);
      // 收合方向永遠 = SLIDE_MAP[imgDir]（= 進場起點）→ 沿進場路徑往回滑出。
      // transform 沒有 clip-path 那個「clearProps 後 computed=none 補不動」問題（x/yPercent 未設即 0），
      // 完整揭露 / 進場中（半開）都直接 gsap.to 即可，免 fromTo 分流。
      gsap.to(imgWrapper, {
        ...(SLIDE_MAP[imgDir] || SLIDE_MAP.bottom),
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

export function initFacultyFilter() {
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (filterButtons.length === 0 || facultyCards.length === 0) return;

  // （手機 header 底色帶 .mobile-header-bg 已提升為全站元素：放 header.html、footer-near hide 在 header.js
  //   bindFooterScroll，2026-07-17。原 faculty 專屬 .faculty-header-bg + 此處 scroll listener 已移除。）

  // 離頁退場：重用 filter 切換的 exitFacultyCards（已是正確 fromTo 寫法），對「當前可見」的老師卡片
  // 做收場（text 收 → image 收）。router 換頁前 await 完才 swap DOM；registerPageExit 在 runPageExit 後自動清空。
  registerPageExit(() => new Promise(resolve => {
    const visible = Array.from(facultyCards).filter(card => /** @type {HTMLElement} */ (card).style.display !== 'none');
    exitFacultyCards(visible, resolve);
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
  if (typeof gsap !== 'undefined' && navInners.length && !prefersReducedMotion()) {  // 減少動態：nav 維持靜態可見
    navInners.forEach(inner => { inner.style.transition = 'none'; gsap.set(inner, navChipHidden(inner, navDir.get(inner))); });
    const section = document.getElementById('faculty-cards');
    const isLandscapeGate = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    if (isLandscapeGate && 'IntersectionObserver' in window && section) {
      // 矮橫向：nav 進 header fixed、hero 也浮著 →「hero 之後才 reveal、回 hero 出場隱藏」（user 2026-07-10
      // 指定 clip-path 非 opacity，同 curriculum）：IO 偵測 cards section 佔視窗中段 → 各 inner 個別方向、
      // 同時（stagger:0）clip-reveal / clip-hide。fixed nav 被 clip 掉時 btn 外框仍在 → pointer-events 一併切。
      const navCol = /** @type {HTMLElement|null} */ (section.querySelector('.inner-scroll-nav-col'));
      if (navCol) navCol.style.pointerEvents = 'none';
      const setNav = (reveal) => {
        if (navRevealed === reveal) return;
        navRevealed = reveal;
        // header 帶遮擋跟 nav 同 gate（landscape.css 消費此 class）：卡片捲過透明 header 會疊在
        // nav btn 後（user 2026-07-10 統一各頁 nav 遮擋）；hero 時不掛、不蓋 hero 圖
        section.classList.toggle('faculty-nav-revealed', reveal);
        gsap.killTweensOf(navInners);
        navInners.forEach(inner => { inner.style.transition = 'none'; });
        if (navCol) navCol.style.pointerEvents = reveal ? '' : 'none';
        const hid = reveal ? null : navInners.map(inner => navChipHidden(inner, navDir.get(inner)));
        gsap.to(navInners, {
          clipPath: reveal ? NAV_CHIP_SHOWN.clipPath : (i) => hid[i].clipPath,
          translate: reveal ? NAV_CHIP_SHOWN.translate : (i) => hid[i].translate,
          duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true,
          onComplete: () => { if (reveal) navInners.forEach(inner => { inner.style.transition = ''; }); },
        });
      };
      // 嚴格 hero gate（user 2026-07-10「卡一半 nav 就出現」，同 admission/curriculum）：觀察 hero 本體，
      // 底緣離開視窗頂（8px buffer）才 reveal；footer 進 75% 線收起。flag 合併防初始 delivery 互蓋。
      const heroEl = document.querySelector('#page-content > section');
      const footerEl = document.getElementById('site-footer');
      let heroVis = !!heroEl;
      let footerVis = false;
      const applyNav = () => setNav(!heroVis && !footerVis);
      if (heroEl) {
        const heroIO = new IntersectionObserver(([e]) => { heroVis = e.isIntersecting; applyNav(); },
          { rootMargin: '-8px 0px 0px 0px' });
        heroIO.observe(heroEl);
        registerPageCleanup(() => heroIO.disconnect());
      }
      if (footerEl) {
        const footerIO = new IntersectionObserver(([e]) => { footerVis = e.isIntersecting; applyNav(); },
          { rootMargin: '0px 0px -25% 0px' });
        footerIO.observe(footerEl);
        registerPageCleanup(() => footerIO.disconnect());
      }
    } else {
      // 桌面/直向：進場 once、不 re-hide（維持原行為）
      const playNavReveal = () => {
        if (navRevealed) return;
        navRevealed = true;
        gsap.to(navInners, {
          ...NAV_CHIP_SHOWN,
          duration: DUR.base,
          ease: NAV_EASE,
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
    if (typeof gsap === 'undefined' || !navRevealed || !navInners.length) { resolve(); return; }
    gsap.killTweensOf(navInners);
    navInners.forEach(inner => { inner.style.transition = 'none'; });  // 同進場：停掉 transition:all 免追 GSAP 每幀寫入卡頓
    const hid = navInners.map(inner => navChipHidden(inner, navDir.get(inner)));
    gsap.fromTo(navInners,
      { ...NAV_CHIP_SHOWN },
      {
        clipPath: (i) => hid[i].clipPath,
        translate: (i) => hid[i].translate,
        duration: DUR.base,
        ease: NAV_EASE,
        stagger: { each: 0.02, from: 'end' },
        overwrite: true,
        onComplete: resolve,
      }
    );
  }));

  function setActiveStyle(activeBtn, color) {
    const rot = SCCDHelpers.getRandomRotation();
    filterButtons.forEach(btn => {
      const inner = /** @type {HTMLElement|null} */ (btn.querySelector('.anchor-nav-inner'));
      if (inner) {
        inner.style.background = '';
        inner.style.transform = '';
      }
    });
    const activeInner = /** @type {HTMLElement|null} */ (activeBtn.querySelector('.anchor-nav-inner'));
    if (activeInner) {
      activeInner.style.background = color;
      activeInner.style.transform = `rotate(${rot}deg)`;
    }
  }

  // Filter button click event
  filterButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();

      // 手機 filter bar 是水平 scroll strip：點到的 btn 捲回靠左對齊頁面內容左緣（同 curriculum program btn 做法）。
      // 只動 bar 自己 scrollLeft（rect delta），不用 scrollIntoView 以免連帶動垂直；桌面是 md:flex-col 無水平 scroll。
      // 矮橫向（landscape gate 拆 frame、nav 回水平 strip）同樣要對齊。
      if (window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
        const bar = this.parentElement;
        if (bar) {
          const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
          const delta = this.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad);
          bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
        }
      }

      // 點同一個（已 active）→ 只 scroll 對齊 anchor，不跑 exit/enter 動畫
      if (this.classList.contains('active')) {
        const scrollCol = /** @type {HTMLElement | null} */ (document.querySelector('#faculty-cards .inner-scroll-scroll-col'));
        if (scrollCol && window.innerWidth >= 768) scrollCol.scrollTop = 0;  // 桌面 inner-scroll：回頂
        SCCDHelpers.scrollToElement('#faculty-cards');
        this.blur();
        return;
      }

      // Reset color on all buttons, set random color on active
      const color = SCCDHelpers.getRandomAccentColor();
      setActiveStyle(this, color);

      // Set active state using helper
      SCCDHelpers.setActive(this, filterButtons);

      // Get filter value
      const filterValue = this.getAttribute('data-filter');

      // 先 exit 當前 visible cards，等收場完才 swap + entrance
      const currentlyVisible = Array.from(facultyCards).filter(card => /** @type {HTMLElement} */ (card).style.display !== 'none');
      exitFacultyCards(currentlyVisible, () => {
        SCCDHelpers.filterElements(facultyCards, filterValue);
        // 桌面 inner-scroll：切分類後右欄 box 回頂，新卡片從頭顯示（手機走 window 捲、無 scroll-col）
        const scrollCol = /** @type {HTMLElement | null} */ (document.querySelector('#faculty-cards .inner-scroll-scroll-col'));
        if (scrollCol && window.innerWidth >= 768) scrollCol.scrollTop = 0;
        const nextVisible = Array.from(facultyCards).filter(card => /** @type {HTMLElement} */ (card).style.display !== 'none');
        animateFacultyCards(nextVisible);
      });

      // Scroll 跟 exit 同時開始，整體節奏比較緊湊
      SCCDHelpers.scrollToElement('#faculty-cards');

      // Blur the button to prevent focus scroll
      this.blur();
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

  // ── Department tabs（老師分頁；第二系所暫無資料＝空 roster；user 2026-08-23 先確認位置）──
  // 沿用 category filter 的 exit → 切換 → enter 流程；chip active accent 同 setActiveStyle 做法。
  const deptButtons = document.querySelectorAll('.faculty-dept-btn');
  if (deptButtons.length) {
    const setDeptActiveStyle = (activeBtn, color) => {
      deptButtons.forEach(b => {
        const inner = /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner'));
        if (inner) { inner.style.background = ''; inner.style.transform = ''; }
      });
      const inner = /** @type {HTMLElement|null} */ (activeBtn.querySelector('.anchor-nav-inner'));
      if (inner) { inner.style.background = color; inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; }
    };
    deptButtons.forEach(button => {
      button.addEventListener('click', function() {
        if (this.classList.contains('active')) { SCCDHelpers.scrollToElement('#faculty-cards'); this.blur(); return; }
        setDeptActiveStyle(this, SCCDHelpers.getRandomAccentColor());
        SCCDHelpers.setActive(this, deptButtons);
        const dept = this.getAttribute('data-dept');
        const currentlyVisible = Array.from(facultyCards).filter(c => /** @type {HTMLElement} */ (c).style.display !== 'none');
        exitFacultyCards(currentlyVisible, () => {
          if (dept === 'sccd') {
            // 還原目前分類（fulltime/parttime/admin）的卡片並重播進場
            const cat = document.querySelector('.faculty-filter-btn.active')?.getAttribute('data-filter') || 'fulltime';
            SCCDHelpers.filterElements(facultyCards, cat);
            animateFacultyCards(Array.from(facultyCards).filter(c => c.getAttribute('data-category') === cat));
          } else {
            facultyCards.forEach(c => { /** @type {HTMLElement} */ (c).style.display = 'none'; });
          }
        });
        this.blur();
      });
    });
    const defDept = [...deptButtons].find(b => b.getAttribute('data-dept') === 'sccd');
    if (defDept) setDeptActiveStyle(defDept, SCCDHelpers.getRandomAccentColor());

    // Dept tag 進出場：比照 activities sub-filter chip 的 hero clip-reveal（純垂直由下滑入——不套 navChipHidden，
    // 免 active chip 的隨機 rotate 把位移向量轉斜；clip/translate 套在 .anchor-nav-inner 本身，旋轉角不被裁）。
    // 進場＝section 進視窗（同左 nav reveal 時機）；退場＝離頁。transition:'none' 解 navigation.css `transition:all` 衝突。
    const deptInners = [...deptButtons].map(b => /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner'))).filter(Boolean);
    const deptHidden = (el) => ({ clipPath: 'inset(0% 0% 100% 0%)', translate: `0px ${el.offsetHeight || 0}px` });
    if (typeof gsap !== 'undefined' && deptInners.length && !prefersReducedMotion()) {
      let deptRevealed = false;
      deptInners.forEach(el => { el.style.transition = 'none'; gsap.set(el, deptHidden(el)); });
      const playDeptReveal = () => {
        if (deptRevealed) return;
        deptRevealed = true;
        deptInners.forEach(el => { el.style.transition = 'none'; });
        const hid = deptInners.map(deptHidden);
        gsap.fromTo(deptInners,
          { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate },
          { ...NAV_CHIP_SHOWN, duration: DUR.slow, ease: EASE.enter, stagger: 0.08, clearProps: 'clipPath,transition,translate' });
      };
      const deptSection = document.getElementById('faculty-cards');
      const deptInView = deptSection && deptSection.getBoundingClientRect().top < window.innerHeight * 0.9;
      if (!deptSection || deptInView || typeof ScrollTrigger === 'undefined') playDeptReveal();
      else ScrollTrigger.create({ trigger: deptSection, start: 'top 90%', once: true, onEnter: playDeptReveal });
      registerPageExit(() => new Promise(resolve => {
        if (!deptRevealed) { resolve(); return; }
        gsap.killTweensOf(deptInners);
        deptInners.forEach(el => { el.style.transition = 'none'; });
        const hid = deptInners.map(deptHidden);
        gsap.fromTo(deptInners,
          { ...NAV_CHIP_SHOWN },
          { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: EASE.exit, stagger: 0.06, overwrite: true, onComplete: resolve });
      }));
    }
  }

  // Initialize: set random color on the default active button
  const defaultBtn = [...filterButtons].find(b => b.getAttribute('data-filter') === 'fulltime');
  if (defaultBtn) setActiveStyle(defaultBtn, SCCDHelpers.getRandomAccentColor());

  // Initialize: show only fulltime cards on page load
  const initialFilter = 'fulltime';
  facultyCards.forEach(card => {
    const el = /** @type {HTMLElement} */ (card);
    el.style.display = el.getAttribute('data-category') === initialFilter ? 'block' : 'none';
  });

  // Animate initial cards（全部一次性排好整段序列，無 ScrollTrigger）
  const initialCards = Array.from(facultyCards).filter(c => c.getAttribute('data-category') === initialFilter);
  animateFacultyCards(initialCards);
}
