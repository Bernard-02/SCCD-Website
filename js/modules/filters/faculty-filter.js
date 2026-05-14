/**
 * Faculty Filter Module
 * 師資篩選功能（Fulltime / Parttime / Admin）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';

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

function setupFacultyCardAnim(card) {
  if (typeof gsap === 'undefined') return;
  const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
  const name = card.querySelector('.faculty-card-name');
  const title = card.querySelector('.faculty-card-title');
  const imgDir = card.dataset.imgDir || 'bottom';

  // 進場期間禁 pointer-events，避免使用者 hover 到還沒揭露的卡片造成空白色塊
  card.classList.add('pointer-events-none');
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
const IMG_DUR = 0.8;
const TEXT_DUR = 0.7;
const CARD_ADVANCE = IMG_DUR / 2;     // image 一半時下一張 image 起跑 → 0.3
const NAME_OFFSET = CARD_ADVANCE + 0.1; // 下一張 image 起跑後 0.1s 才 name 開始（保證 title 不搶在下一張 image 之前）→ 0.4
const TITLE_OFFSET = NAME_OFFSET + 0.1; // name 之後 0.1s 接 title（subtitle 內部小 stagger）→ 0.5
const CARD_FULL_DURATION = TITLE_OFFSET + TEXT_DUR; // 0.5 + 0.5 = 1.0
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
      ease: 'power3.out',
      delay: startTime,
      clearProps: 'clipPath',
    });
  }
  if (name) {
    gsap.to(name, {
      yPercent: 0,
      duration: TEXT_DUR,
      ease: 'power3.out',
      delay: startTime + NAME_OFFSET,
      clearProps: 'transform',
    });
  }
  if (title) {
    gsap.to(title, {
      yPercent: 0,
      duration: TEXT_DUR,
      ease: 'power3.out',
      delay: startTime + TITLE_OFFSET,
      clearProps: 'transform',
    });
  }
  // 卡片完整揭露 = title 動畫結束時間；之後解鎖 hover
  // 用 _hoverUnlockTimer 追蹤 timer id，下次 setup / exit 時 clear 避免 stale unlock 殘留
  if (card._hoverUnlockTimer) clearTimeout(card._hoverUnlockTimer);
  const finishAt = startTime + TITLE_OFFSET + TEXT_DUR + HOVER_UNLOCK_BUFFER;
  card._hoverUnlockTimer = setTimeout(() => {
    card.classList.remove('pointer-events-none');
    card._hoverUnlockTimer = null;
  }, Math.round(finishAt * 1000));
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
  const items = Array.from(cards);
  if (items.length === 0) { if (onComplete) onComplete(); return; }

  let maxFinish = 0;
  items.forEach((card, i) => {
    // exit 期間也禁 hover，避免使用者 hover 到正在收合的卡片；clear 待解鎖的 unlock timer
    if (card._hoverUnlockTimer) { clearTimeout(card._hoverUnlockTimer); card._hoverUnlockTimer = null; }
    card.classList.add('pointer-events-none');
    const cardDelay = i * EXIT_CARD_STEP;
    const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
    const name = card.querySelector('.faculty-card-name');
    const title = card.querySelector('.faculty-card-title');
    const imgDir = card.dataset.imgDir || 'bottom';

    if (title) {
      gsap.killTweensOf(title);
      gsap.to(title, { yPercent: 100, duration: EXIT_DUR, ease: 'power3.in', delay: cardDelay });
    }
    if (name) {
      gsap.killTweensOf(name);
      gsap.to(name, { yPercent: 100, duration: EXIT_DUR, ease: 'power3.in', delay: cardDelay + EXIT_INTERNAL_STEP });
    }
    if (imgWrapper) {
      gsap.killTweensOf(imgWrapper);
      // clearProps 把 image 進場後的 inline clipPath 清掉，當前 computed 為 none；
      // 直接 fromTo 顯式設起點再 tween 回 imgDir 對應的收合方向
      gsap.fromTo(imgWrapper,
        { clipPath: CLIP_REVEALED },
        {
          clipPath: CLIP_MAP[imgDir] || CLIP_MAP.bottom,
          duration: EXIT_DUR,
          ease: 'power3.in',
          delay: cardDelay + EXIT_INTERNAL_STEP * 2,
        }
      );
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
