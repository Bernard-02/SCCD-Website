/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';

// 卡片進場動畫：
//   圖片 → 4 方向 clip-path inset 揭露（每卡 data-img-dir 隨機）
//   文字（name / title）→ Clip-Reveal Entrance（hero-style 由下而上，見 CLAUDE.md「共用動畫模式」）
//   name 先進，title 略晚進；卡與卡之間再 stagger
// inset 單位統一用 `%`：混合 `0` 與 `100%` 會讓 GSAP/瀏覽器無法穩定 interpolate → 視覺上看起來「直接出現沒動畫」
const CLIP_MAP = {
  top:    'inset(0% 0% 100% 0%)',
  right:  'inset(0% 0% 0% 100%)',
  bottom: 'inset(100% 0% 0% 0%)',
  left:   'inset(0% 100% 0% 0%)',
};
const CLIP_REVEALED = 'inset(0% 0% 0% 0%)';

// 左側 filter nav 進場/退場：比照 curriculum 灰卡（courses-grid-card）的 clip-path 4 方向 reveal（user 2026-06-07）。
// 🔑 關鍵：clip-path 套在 `.anchor-nav-inner`（色塊本身）**不是** btn —— 解掉前面所有「裁旋轉角 / 疊到鄰格 /
//   像從父容器跑」的根因（那些都源自「btn 的旋轉內層溢出 btn box」，去裁 btn 才出事）。
//   inner 的 clip-path 在「旋轉前的 local box」生效、再被 transform:rotate 顯示，所以：
//   ① 旋轉角不被裁（clip 的是 inner 自己的 box，bg 色塊填滿該 box 無溢出）；
//   ② 不外漏疊到鄰 btn（clip-path 只裁元素自身、絕不畫到 box 外，無 overflow-margin 漏出問題）；
//   ③ 不需 wrapper、不需位移 → chip 定在原位、純粹「色塊被 clip 揭露」(= 灰卡那種 wipe)，不會在容器裏跑。
// 參數比照灰卡：4 方向隨機 inset、DUR.base、cubic-bezier(0.25,0,0,1)、stagger 0.02、clearProps。
const NAV_CLIP_KEYS = ['top', 'right', 'bottom', 'left'];
function pickNavClip() { return CLIP_MAP[NAV_CLIP_KEYS[Math.floor(Math.random() * NAV_CLIP_KEYS.length)]]; }
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
  if (imgWrapper) gsap.set(imgWrapper, { clipPath: CLIP_MAP[imgDir] || CLIP_MAP.bottom });
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
      clipPath: CLIP_REVEALED,
      duration: IMG_DUR,
      ease: EASE.enter,
      delay: startTime,
      clearProps: 'clipPath',
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

  items.forEach(card => {
    gsap.killTweensOf([
      card.querySelector('.faculty-card-image-wrapper'),
      card.querySelector('.faculty-card-name'),
      card.querySelector('.faculty-card-title'),
    ].filter(Boolean));
    setupFacultyCardAnim(card);
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
      // 退場起點 = 卡片「當下」的揭露狀態（已排除未開始的卡片，這裡只會是「完整」或「進場中」）：
      //   收合方向永遠 = CLIP_MAP[imgDir]（= 進場起點）→ 沿進場路徑往回收。
      //   ① 完整揭露：進場 clearProps 已清掉 inline clipPath、computed=none → GSAP 無法 interpolate，
      //      必 fromTo 顯式給 inset(0%) 起點（見 feedback_clippath_exit_after_clearprops_use_fromto）；
      //      此時卡片本就全開，fromTo 設 inset(0%) 無視覺跳動，再沿 imgDir 收回。
      //   ② 進場中（半開）：inline 仍是 GSAP 寫的 partial inset → 直接 gsap.to 從半開往回收（順順倒帶）。
      const collapseTo = CLIP_MAP[imgDir] || CLIP_MAP.bottom;
      const exitOpts = {
        clipPath: collapseTo,
        duration: EXIT_DUR,
        ease: EASE.exit,
        delay: cardDelay + EXIT_INTERNAL_STEP * 2,
      };
      const inlineClip = imgWrapper.style.clipPath;
      if (inlineClip && inlineClip !== 'none') {
        gsap.to(imgWrapper, exitOpts);
      } else {
        gsap.fromTo(imgWrapper, { clipPath: CLIP_REVEALED }, exitOpts);
      }
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

  // 離頁退場：重用 filter 切換的 exitFacultyCards（已是正確 fromTo 寫法），對「當前可見」的老師卡片
  // 做收場（text 收 → image 收）。router 換頁前 await 完才 swap DOM；registerPageExit 在 runPageExit 後自動清空。
  registerPageExit(() => new Promise(resolve => {
    const visible = Array.from(facultyCards).filter(card => /** @type {HTMLElement} */ (card).style.display !== 'none');
    exitFacultyCards(visible, resolve);
  }));

  // ── 左側 filter nav 進場/退場（user 2026-06-07 定案：clip-path，比照 curriculum 灰卡）──
  // clip-path 套在 .anchor-nav-inner（色塊本身）→ 旋轉角不裁、不疊鄰、定在原位（見上方 const 區註解；
  //   為何不用 hero clip-reveal：nav 緊密堆疊+旋轉在內容+滿欄寬，三條件全反於 hero，slide 必裁/疊/橫跑）。
  // 進場：各 inner 隨機 4 方向 inset → inset(0)，只在頁面初次載入（section 進視窗）跑一次；filter 切換不重播。
  // 退場：只在離開 faculty 頁且「已進場」才跑（沒看過不閃），fromTo 顯式起點 inset(0)（clearProps 後 computed=none
  //       無法補間，見 feedback_clippath_exit_after_clearprops_use_fromto）→ 隨機 4 方向收掉，from:'end' 反向 stagger。
  // ⚠️ smooth 關鍵：`.anchor-nav-inner` 帶 navigation.css 的 `transition: all`（給 hover / filter 切換 bg·rotate 過場用）。
  //   不處理的話 GSAP 每幀寫的 clipPath 會觸發那條 0.3s CSS transition → 渲染落後 GSAP、卡頓（user 報「不夠 smooth」）。
  //   做法＝動畫期間 inner.style.transition='none'，進場跑完 onComplete 還原 ''（hover/filter 切換仍需要那條 transition）。
  let navRevealed = false;
  const navInners = Array.from(filterButtons)
    .map(b => /** @type {HTMLElement|null} */ (b.querySelector('.anchor-nav-inner')))
    .filter(Boolean);
  if (typeof gsap !== 'undefined' && navInners.length) {
    navInners.forEach(inner => { inner.style.transition = 'none'; gsap.set(inner, { clipPath: pickNavClip() }); });
    const playNavReveal = () => {
      if (navRevealed) return;
      navRevealed = true;
      gsap.to(navInners, {
        clipPath: CLIP_REVEALED,
        duration: DUR.base,
        ease: NAV_EASE,
        stagger: 0.02,
        clearProps: 'clipPath',
        onComplete: () => navInners.forEach(inner => { inner.style.transition = ''; }),
      });
    };
    const section = document.getElementById('faculty-cards');
    const inView = section && section.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (!section || inView || typeof ScrollTrigger === 'undefined') {
      playNavReveal();
    } else {
      // trigger 在 #faculty-cards（在 #page-content 內）→ cleanupPageModules 換頁時會一併 kill，不洩漏
      ScrollTrigger.create({ trigger: section, start: 'top 90%', once: true, onEnter: playNavReveal });
    }
  }

  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !navRevealed || !navInners.length) { resolve(); return; }
    gsap.killTweensOf(navInners);
    navInners.forEach(inner => { inner.style.transition = 'none'; });  // 同進場：停掉 transition:all 免追 GSAP clipPath 卡頓
    gsap.fromTo(navInners,
      { clipPath: CLIP_REVEALED },
      {
        clipPath: () => pickNavClip(),
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

      // 點同一個（已 active）→ 只 scroll 對齊 anchor，不跑 exit/enter 動畫
      if (this.classList.contains('active')) {
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
        const nextVisible = Array.from(facultyCards).filter(card => /** @type {HTMLElement} */ (card).style.display !== 'none');
        animateFacultyCards(nextVisible);
      });

      // Scroll 跟 exit 同時開始，整體節奏比較緊湊
      SCCDHelpers.scrollToElement('#faculty-cards');

      // Blur the button to prevent focus scroll
      this.blur();
    });
  });

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
