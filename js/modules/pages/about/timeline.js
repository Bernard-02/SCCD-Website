// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Timeline Module (About Page)
 * 卷軸概念：每年 5 張照片，第 1 張 = 上一年第 5 張，第 5 張 = 下一年第 1 張
 * 100vh 分成 5 個 bar（各 20vh），每張圖片佔一個 bar
 * 照片大小 15~40vw，clip-path 只做一次
 */

import { registerPageExit } from '../../ui/page-exit.js';
import { sitePath } from '../../ui/site-base.js';
import { createClassImagesSlideshow } from './class-images-slideshow.js';

export function initTimeline() {
  const area = document.getElementById('timeline-area');
  const strip = document.getElementById('timeline-strip');
  const navLeft = document.getElementById('timeline-nav-left');
  const navRight = document.getElementById('timeline-nav-right');
  const photoTooltip = document.getElementById('timeline-photo-tooltip');
  const photoTooltipText = document.getElementById('timeline-photo-tooltip-text');

  if (!area || !strip || !navLeft || !navRight) return;

  // --- 動畫時長 / easing 常數 ---
  const TIMING = {
    // 入場 reveal（clip-path 展開）
    revealDuration: 1.0,
    revealEase: 'power3.out',
    stagger: 0.08,
    // 退場（clip-path 收起）
    exitDuration: 0.5,
    exitEase: 'power2.in',
    // 字卡 reveal（切頁後入場）
    cardRevealDuration: 0.6,
    // 卷軸橫移
    stripSlideDuration: 0.8,
    stripSlideEase: 'power2.inOut',
    // Tooltip 退場
    tooltipHideDuration: 0.2,
    tooltipHideFastDuration: 0.15,
    // Photo raise/lower clip 週期
    photoClipDuration: 0.5,
    photoClipEase: 'power2.inOut',
    // 邊界照片 dim/undim
    dimDuration: 0.3,
    // Reveal 完成後才開放 hover（= revealDuration + 5 * stagger）
    hoverEnableDelay: 1.4,
    // mouseleave → leaveAllHover 的 debounce（ms）
    leaveDebounceMs: 50,
    // resetTimeline 後第一年 reveal 的起始延遲
    firstRevealDelay: 0.3,
  };

  // --- 工具函數 ---
  const ACCENT_COLORS = (() => {
    const s = getComputedStyle(document.documentElement);
    return [
      s.getPropertyValue('--color-green').trim(),
      s.getPropertyValue('--color-pink').trim(),
      s.getPropertyValue('--color-blue').trim(),
    ];
  })();

  let lastColorIndex = -1;
  function randomColor() {
    let i;
    do { i = Math.floor(Math.random() * ACCENT_COLORS.length); } while (i === lastColorIndex);
    lastColorIndex = i;
    return ACCENT_COLORS[i];
  }

  function pickUniqueRotations(n, min, max) {
    const pool = [];
    for (let i = min; i <= max; i++) { if (i !== 0) pool.push(i); }
    const picked = [];
    const copy = [...pool];
    while (picked.length < n && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      picked.push(copy.splice(idx, 1)[0]);
    }
    return picked;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randRot() {
    let r;
    do { r = Math.floor(Math.random() * 11) - 4; } while (r === 0);
    return r;
  }

  // --- clip-path ---
  const CLIP_END = 'inset(0% 0% 0% 0%)';
  const ALL_DIRS = ['top', 'bottom', 'left', 'right'];
  function getClipStart(dir) {
    switch (dir) {
      case 'top':    return 'inset(0% 0% 100% 0%)';
      case 'bottom': return 'inset(100% 0% 0% 0%)';
      case 'left':   return 'inset(0% 100% 0% 0%)';
      case 'right':  return 'inset(0% 0% 0% 100%)';
      default:       return 'inset(0% 100% 0% 0%)';
    }
  }
  function randomDir4() { return ALL_DIRS[Math.floor(Math.random() * 4)]; }
  function randomDirLR() { return Math.random() < 0.5 ? 'left' : 'right'; }

  // --- Fetch & Build ---
  fetch(sitePath('data/about-history.json'))
    .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
    .then(data => {
      const items = [];
      data.forEach(eraGroup => {
        eraGroup.years.forEach(yearItem => {
          items.push({ ...yearItem, eraTitle: eraGroup.era, eraLabel: eraGroup.label });
        });
      });
      if (items.length > 0) {
        // 手機走獨立的簡化視圖（卡片 + slideshow + 箭頭切年 + list 鈕），桌面 strip 整套不建構
        if (window.innerWidth < 768) buildMobile(items);
        else buildStrip(items);
      }
    })
    .catch(err => console.error('Timeline error:', err));

  // ── 手機版（user 2026-06-11）─────────────────────────────────────
  // 排列參考 class slideshow：era chip + 年份說明卡在「圖片上方」、圖片用 3-slot slideshow 排列；
  // 右箭頭（或點圖片區）切下一年 = 文字卡 clip 換內容 + slideshow tick 同步左移；
  // list 鈕切換 era 清單視圖（沿用桌面 #timeline-list-view 結構/CSS，行為簡化版）。
  function buildMobile(items) {
    area.style.height = 'auto';
    navLeft.style.display = 'none';
    navRight.style.display = 'none';
    if (photoTooltip) photoTooltip.style.display = 'none';

    // era 分組（list view 用；同 buildStrip 的分組邏輯）
    const eraGroups = [];
    const eraIndexByKey = {};
    items.forEach(it => {
      const key = `${it.eraTitle}|${it.eraLabel}`;
      if (eraIndexByKey[key] === undefined) {
        eraIndexByKey[key] = eraGroups.length;
        eraGroups.push({ title: it.eraTitle, label: it.eraLabel, years: [] });
      }
      eraGroups[eraIndexByKey[key]].years.push(it);
    });

    const wrap = document.createElement('div');
    wrap.id = 'timeline-mobile';
    wrap.innerHTML =
      '<div class="tl-m-era timeline-card-inner bg-black text-white"><div class="text-p2 leading-base font-bold"></div></div>' +
      '<div class="tl-m-card timeline-card-inner"><div class="tl-m-card-body text-p2 leading-base font-bold"></div></div>' +
      '<div class="tl-m-images"></div>' +
      '<div class="tl-m-controls">' +
        '<button class="tl-m-list-btn" aria-label="切換清單視圖"><span class="tl-icon-btn-inner"><span class="icon icon-atlas-list"></span></span></button>' +
        '<button class="tl-m-next-btn" aria-label="下一年"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div>';
    area.appendChild(wrap);

    const eraEl = wrap.querySelector('.tl-m-era');
    const eraText = eraEl.querySelector('div');
    const cardEl = wrap.querySelector('.tl-m-card');
    const cardBody = cardEl.querySelector('.tl-m-card-body');
    const imagesEl = wrap.querySelector('.tl-m-images');
    const listBtn = wrap.querySelector('.tl-m-list-btn');
    const nextBtn = wrap.querySelector('.tl-m-next-btn');
    const listIcon = listBtn.querySelector('.icon');

    let mIdx = 0;
    let switching = false;
    let listMode = false;
    let listAnimating = false;

    function renderYear(i) {
      const it = items[i];
      eraText.textContent = `${it.eraTitle} ${it.eraLabel}`;
      const descs = it.descriptions || (it.description ? [it.description] : []);
      cardBody.innerHTML =
        `<h4 class="font-bold tl-m-year">${it.year}</h4>` +
        descs.map(d => `<div class="tl-m-desc">${d}</div>`).join('');
      cardEl.style.background = randomColor();
      eraEl.style.transform = `rotate(${pickUniqueRotations(1, -4, 4)[0]}deg)`;
      cardEl.style.transform = `rotate(${pickUniqueRotations(1, -2, 2)[0]}deg)`;
    }
    renderYear(0);

    // slideshow：pool = 各年份圖片，manual 模式（tick 由箭頭驅動，不綁內建點擊/hover）
    const slide = createClassImagesSlideshow(imagesEl, items.map(it => it.image), { textHlEl: null, manual: true });
    if (slide) slide.renderFresh(true); // 先隱藏，等 ScrollTrigger reveal

    const textEls = [eraEl, cardEl];

    function nextYear() {
      if (switching || listMode || listAnimating || !slide) return;
      switching = true;
      slide.tick(); // 圖片左移一格 + 下一年圖片進場，與文字卡換頁同時跑
      gsap.to(textEls, {
        clipPath: getClipStart(randomDirLR()), duration: TIMING.exitDuration, ease: TIMING.exitEase,
        onComplete: () => {
          mIdx = (mIdx + 1) % items.length;
          renderYear(mIdx);
          gsap.set(textEls, { clipPath: getClipStart(randomDirLR()) });
          gsap.to(textEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { switching = false; },
          });
        },
      });
    }
    nextBtn.addEventListener('click', nextYear);
    imagesEl.addEventListener('click', nextYear); // 點圖片區也切年（對應桌面 slot 點擊往前）

    // ── list view（結構/class 同桌面版，mobile CSS 覆蓋佈局）──
    const listView = document.createElement('div');
    listView.id = 'timeline-list-view';
    listView.style.display = 'none';
    listView.innerHTML =
      '<div class="tl-list-grid"><div class="tl-list-cell">' +
        '<div class="tl-list-rect timeline-card-inner"><div class="tl-list-content list-scroll"></div></div>' +
        '<div class="tl-list-chip timeline-card-inner bg-black text-white"><div class="text-p2 leading-base font-bold"></div></div>' +
        '<button class="tl-list-next-btn" aria-label="下一個時期"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div></div>';
    area.appendChild(listView);

    const listChipText = listView.querySelector('.tl-list-chip div');
    const listRect = listView.querySelector('.tl-list-rect');
    const listContent = listView.querySelector('.tl-list-content');
    const listNextBtn = listView.querySelector('.tl-list-next-btn');
    const rectEls = [listRect, listView.querySelector('.tl-list-chip')];

    let listEraIndex = 0;
    let listEraColors = [];

    // 同 buildStrip 的 splitDesc / renderListEra（手機自帶一份；桌面那份在 buildStrip closure 內）
    const descParser = document.createElement('div');
    function splitDesc(d) {
      descParser.innerHTML = d;
      let heading = '';
      const divs = [];
      [...descParser.children].forEach(ch => {
        if (ch.tagName === 'H5') heading += ch.outerHTML;
        else divs.push(ch);
      });
      const en = divs[0] ? divs[0].innerHTML : '';
      const zh = divs.length > 1 ? divs.slice(1).map(x => x.innerHTML).join('<br>') : '';
      return { heading, en, zh };
    }

    function renderListEra(idx) {
      const era = eraGroups[idx];
      listChipText.textContent = `${era.title} ${era.label}`;
      listRect.style.background = listEraColors[idx];
      listContent.innerHTML = era.years.map(y => {
        const descs = y.descriptions || (y.description ? [y.description] : []);
        const blocks = descs.map(d => {
          const { heading, en, zh } = splitDesc(d);
          return '<div class="tl-list-block">' + heading +
            '<div class="tl-list-cols">' +
              `<div class="tl-list-en">${en}</div>` +
              `<div class="tl-list-zh">${zh}</div>` +
            '</div></div>';
        }).join('');
        return '<div class="tl-list-year-row">' +
          `<div class="tl-list-year text-h5 font-bold">${y.year}</div>` +
          `<div class="tl-list-year-body text-p2 leading-base font-bold">${blocks}</div>` +
        '</div>';
      }).join('');
      listContent.scrollTop = 0;
    }

    // icon wipe swap（同桌面 wipeToggleIcon）
    function wipeListIcon(newClass) {
      if (typeof gsap === 'undefined') { listIcon.className = newClass; return; }
      const dirs = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
      const dir = dirs[Math.floor(Math.random() * 4)];
      gsap.killTweensOf(listIcon);
      gsap.to(listIcon, {
        clipPath: dir, duration: 0.4, ease: 'power2.out', overwrite: true,
        onComplete: () => {
          listIcon.className = newClass;
          gsap.fromTo(listIcon, { clipPath: dir },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'power2.out', clearProps: 'clipPath', overwrite: true });
        },
      });
    }

    function showList() {
      if (listAnimating || switching || listMode) return;
      listAnimating = true;
      listMode = true;
      wipeListIcon('icon icon-atlas-view');
      nextBtn.style.visibility = 'hidden'; // list 模式下年份箭頭無作用，先藏
      const pool = shuffle(ACCENT_COLORS);
      listEraColors = eraGroups.map((_, i) => pool[i % pool.length]);
      listEraIndex = eraIndexByKey[`${items[mIdx].eraTitle}|${items[mIdx].eraLabel}`] ?? 0;
      if (slide) slide.hideAll();
      gsap.to(textEls, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase });
      gsap.delayedCall(TIMING.exitDuration, () => {
        renderListEra(listEraIndex);
        listView.style.display = 'block';
        gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
        gsap.to(rectEls, {
          clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
          onComplete: () => { listAnimating = false; },
        });
      });
    }

    function hideList() {
      if (listAnimating || !listMode) return;
      listAnimating = true;
      wipeListIcon('icon icon-atlas-list');
      gsap.to(rectEls, {
        clipPath: getClipStart(randomDirLR()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listView.style.display = 'none';
          listMode = false;
          nextBtn.style.visibility = '';
          if (slide) slide.showAll();
          gsap.to(textEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { listAnimating = false; },
          });
        },
      });
    }

    function nextListEra() {
      if (listAnimating || eraGroups.length <= 1) return;
      listAnimating = true;
      gsap.to(rectEls, {
        clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listEraIndex = (listEraIndex + 1) % eraGroups.length;
          renderListEra(listEraIndex);
          gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
          gsap.to(rectEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { listAnimating = false; },
          });
        },
      });
    }

    listBtn.addEventListener('click', () => { if (listMode) hideList(); else showList(); });
    listNextBtn.addEventListener('click', nextListEra);

    // ── 初始 reveal（文字卡 + slideshow 一起 clip-in）──
    gsap.set(textEls, { clipPath: getClipStart(randomDirLR()) });
    const revealMobile = () => {
      gsap.to(textEls, { clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger });
      if (slide) slide.showAll();
    };
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: area, start: 'top 80%', once: true, onEnter: revealMobile });
    } else {
      revealMobile();
    }

    // 離頁退場：依模式收掉可見元素（同桌面語義的簡化版）
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const r = area.getBoundingClientRect();
      if (!(r.width > 0 && r.bottom > 0 && r.top < window.innerHeight)) { resolve(); return; }
      const slots = Array.from(imagesEl.querySelectorAll('.class-img'));
      const exitEls = listMode ? rectEls : [...textEls, ...slots];
      if (!exitEls.length) { resolve(); return; }
      gsap.killTweensOf(exitEls);
      let done = 0;
      const onOne = () => { if (++done >= exitEls.length) resolve(); };
      exitEls.forEach(el => {
        gsap.to(el, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
      });
    }));
  }

  function buildStrip(items) {
    const pageW = area.offsetWidth;
    const pageH = area.offsetHeight;
    const totalW = items.length * pageW;
    const PADDING = 80;

    // --container-padding 是 rem 單位，getPropertyValue 不會 resolve 到 px；
    // 用 site-container 實際 computed paddingLeft 拿準確 px 值
    const scEl = document.querySelector('.site-container');
    const containerPad = scEl ? parseFloat(getComputedStyle(scEl).paddingLeft) : 60;

    strip.style.width = `${totalW}px`;
    strip.style.height = '100%';

    // 字卡 overlay（不隨 strip 卷軸移動，固定在 viewport，每年的 year/era/desc 都疊在同一位置，靠 clip-path 切換）
    let cardsOverlay = document.getElementById('timeline-cards-overlay');
    if (!cardsOverlay) {
      cardsOverlay = document.createElement('div');
      cardsOverlay.id = 'timeline-cards-overlay';
      cardsOverlay.className = 'absolute top-0 left-0 w-full h-full pointer-events-none';
      cardsOverlay.style.zIndex = '15';
      area.appendChild(cardsOverlay);
    } else {
      cardsOverlay.innerHTML = '';
    }

    const vw = pageW / 100;

    // 照片大小 range（vw）
    const PHOTO_MIN_VW = 30;
    const PHOTO_MAX_VW = 50;

    // --- Y 軸：把 #timeline-area「實際高度」(pageH，桌面 = 100vh−164px) 扣上下 padding 後分 5 個 bar ---
    // ⚠️ Y 座標全部相對 pageH（不是 viewport 100vh）：photoHsVH 已是「% of pageH」(乘 pageW/pageH 換算)，
    //    輸出 top 也用 %（見下方 photo.style）→ 照片一定落在 area 內、底邊不溢出進 footer。
    //    （history snap 後正好 100vh、footer 緊接在下；舊版 top 用 vh + pb-6xl 緩衝才沒露餡，現 pb 縮小會穿幫。）
    const yPadVH = 8; // 上下各 8%（of pageH）的 padding
    const usableH_VH = 100 - yPadVH * 2; // 84
    const BAR_H_VH = usableH_VH / 5;     // 每個 bar ≈ 16.8

    const pageData = [];
    const pagePhotoRotates = [];
    const revealedPages = new Set();

    // 導航 state（提到 forEach 前宣告：getEdgeRole 在 forEach 內同步讀 currentIndex，
    // 若還在 TDZ 會 ReferenceError 中斷整個 buildStrip → nav click handler 沒綁上）
    let currentIndex = 0;
    let isTransitioning = false;
    let listMode = false; // list view（era 卡片）開啟時凍結 timeline 導航

    // 固定位置（每年同 pos，隨機旋轉）
    const CARD_BOTTOM_PAD = 60;       // 距 viewport 底部
    const CARD_MAIN_ROT = 1;          // 主卡最大旋轉角度
    const CARD_GAP = 28;              // 同年多張主卡之間的「視覺」垂直間距（chip 高度會額外加上去防重疊）
    const BLOCK_GAP = 18;             // 同一張卡內，多筆 description 之間的垂直間距
    const GRID_GAP_PX = 24;           // 主卡 grid 左右 col 中間 gap（= md spacing token）
    const ERA_OFFSET_TOP = 24;        // era 底部相對「最頂主卡頂部」的距離（隨主卡走）
    const ERA_RANDOM_LEFT_SHIFT = 60; // era 在主卡左上區域允許的隨機水平偏移範圍（0~N px）

    // 每年共用的位置常數（不變於 forEach loop）
    const safeLeft = Math.max(PADDING, containerPad + 14 * vw);
    // 主卡靠右錨定：MAIN_CARD_RIGHT 越小 = 主卡越靠右
    // 從 12vw+40 縮到 6vw+40 讓主卡視覺往右推 ~6vw
    const safeRight = pageW - 6 * vw - 40;
    const MAIN_CARD_W = Math.min(680, safeRight - safeLeft);
    const MAIN_CARD_RIGHT = pageW - safeRight; // 主卡 right 偏移（從 viewport 右緣算）

    items.forEach((item, index) => {
      const ox = index * pageW;
      const isFirst = index === 0;
      const isLast = index === items.length - 1;

      // --- 5 張照片：先計算所有位置，確保彼此觸碰，再建 DOM ---
      const photoRots = pickUniqueRotations(5, -4, 4);
      // 邊界 slot (0/4) 永遠在最底，中間 slot (1/2/3) 永遠在上方；各自 pool 內隨機
      const edgeZs = shuffle([1, 2]);
      const middleZs = shuffle([3, 4, 5]);
      const photoZs = [edgeZs[0], middleZs[0], middleZs[1], middleZs[2], edgeZs[1]];

      // Bar 分配：鋸齒形（zigzag），避免單調遞增/遞減
      // 產生方式：隨機 shuffle 後檢查，如果出現 3 個以上連續上升或下降就重新 shuffle
      let barAssign;
      for (let attempt = 0; attempt < 50; attempt++) {
        barAssign = shuffle([0, 1, 2, 3, 4]);
        // 檢查是否有 3 個以上連續單調
        let monotonic = false;
        for (let i = 0; i <= 2; i++) {
          const a = barAssign[i], b = barAssign[i+1], c = barAssign[i+2];
          if ((a < b && b < c) || (a > b && b > c)) { monotonic = true; break; }
        }
        if (!monotonic) break;
      }

      // 每張照片的隨機大小（vw）
      const photoSizes = [];
      for (let p = 0; p < 5; p++) {
        photoSizes.push(PHOTO_MIN_VW + Math.random() * (PHOTO_MAX_VW - PHOTO_MIN_VW));
      }

      // --- 鏈式放置：精確計算讓 5 張照片剛好覆蓋一頁 ---
      // 目標：slot 0 跨左邊界，slot 4 跨右邊界，slot 1~3 在頁面內

      const photoHsVH = photoSizes.map(w => (w * 9 / 16) * (pageW / pageH));

      // slot 0 左邊緣：跨左邊界（30~60% 超出左邊）
      const s0Left = -(photoSizes[0] * (0.3 + Math.random() * 0.3));
      // slot 4 右邊緣：跨右邊界（30~60% 超出右邊）
      const s4Right = 100 + photoSizes[4] * (0.3 + Math.random() * 0.3);

      // 鏈的總跨度（從 slot 0 左邊到 slot 4 右邊）
      const chainSpan = s4Right - s0Left;
      // 總照片寬度
      const totalPhotoW = photoSizes.reduce((a, b) => a + b, 0);
      // 需要分配的總重疊量（4 個間隙）
      const totalOverlap = totalPhotoW - chainSpan;

      // 分配重疊到 4 個間隙（有隨機性但確保每個 > 0）
      const overlaps = [];
      if (totalOverlap > 0) {
        // 有足夠空間 → 隨機分配重疊
        let remaining = totalOverlap;
        for (let i = 0; i < 3; i++) {
          const avg = remaining / (4 - i);
          const ov = Math.max(1, avg * (0.5 + Math.random()));
          overlaps.push(ov);
          remaining -= ov;
        }
        overlaps.push(Math.max(1, remaining));
      } else {
        // 照片太小，覆蓋不夠 → 加大部分照片
        let deficit = -totalOverlap + 20; // 多加 20vw 確保有重疊
        for (let i = 0; i < 5 && deficit > 0; i++) {
          const add = Math.min(deficit, PHOTO_MAX_VW - photoSizes[i]);
          photoSizes[i] += add;
          deficit -= add;
        }
        // 重新計算
        const newTotal = photoSizes.reduce((a, b) => a + b, 0);
        const newOverlap = newTotal - chainSpan;
        let rem = newOverlap;
        for (let i = 0; i < 3; i++) {
          const avg = rem / (4 - i);
          const ov = Math.max(1, avg * (0.5 + Math.random()));
          overlaps.push(ov);
          rem -= ov;
        }
        overlaps.push(Math.max(1, rem));
      }

      // 鏈式計算 X 位置
      const photoLeftsVW = [];
      photoLeftsVW[0] = s0Left;
      for (let p = 1; p < 5; p++) {
        photoLeftsVW[p] = photoLeftsVW[p - 1] + photoSizes[p - 1] - overlaps[p - 1];
      }

      // 約束 slot 1~3 必須在頁面內（左邊 >= 5vw，右邊 <= 95vw）
      // 防止中間照片穿越畫面邊界
      for (let p = 1; p <= 3; p++) {
        const minLeft = 5;
        const maxLeft = 95 - photoSizes[p];
        photoLeftsVW[p] = Math.max(minLeft, Math.min(photoLeftsVW[p], maxLeft));
      }

      // Y 軸：bar 分配 + 確保相鄰照片 Y 軸也觸碰
      const photoTopsVH = [];

      // 先按 bar 算初始 Y：以 bar 中心為基準，圖片中心對齊 bar 中心 ± 隨機偏移
      for (let p = 0; p < 5; p++) {
        const bar = barAssign[p];
        const barCenterVH = yPadVH + (bar + 0.5) * BAR_H_VH; // bar 的中心
        const h = photoHsVH[p];
        // 圖片中心對齊 bar 中心，加上小幅隨機偏移（±bar高度的30%）
        const jitter = (Math.random() - 0.5) * BAR_H_VH * 0.6;
        let top = barCenterVH - h / 2 + jitter;
        // 頂邊仍可往上露出 0.7h（往上不是 footer）；底邊夾到 area 底（100% of pageH）→ 不溢出進 footer（user 2026-06-28）
        top = Math.max(-0.7 * h, Math.min(top, 100 - h));
        photoTopsVH[p] = top;
      }

      // 鏈式 Y 調整：確保每對相鄰照片 Y 也觸碰
      for (let p = 1; p < 5; p++) {
        const prevTop = photoTopsVH[p - 1];
        const prevBottom = prevTop + photoHsVH[p - 1];
        const currTop = photoTopsVH[p];
        const currBottom = currTop + photoHsVH[p];

        const yOverlap = Math.min(prevBottom, currBottom) - Math.max(prevTop, currTop);
        if (yOverlap < 0) {
          // 沒重疊 → 移動 current 到跟 prev 觸碰
          const touchOverlap = 1 + Math.random() * 3;
          if (currTop > prevBottom) {
            photoTopsVH[p] = prevBottom - touchOverlap;
          } else {
            photoTopsVH[p] = prevTop - photoHsVH[p] + touchOverlap;
          }
          const h = photoHsVH[p];
          photoTopsVH[p] = Math.max(-0.7 * h, Math.min(photoTopsVH[p], 100 - h)); // 底邊夾到 area 底，不溢出 footer
        }
      }

      // 計算每張 photo 是否需要 lower clip-path 動畫
      // 規則：與任一「z 比自己更高」的 photo 有 bounding box 重疊 → 需要動畫（hover 離開後會被覆蓋）
      // 反之（z 為該年最高，或不被任何更高 z photo 覆蓋）→ instant 切回，無動畫
      // 註：水平軸 vw、垂直軸 vh 各自獨立比較，跨單位 OK（rect overlap 只比同軸值）
      const needsLowerAnim = [];
      for (let p = 0; p < 5; p++) {
        let needs = false;
        const aL = photoLeftsVW[p], aR = aL + photoSizes[p];
        const aT = photoTopsVH[p], aB = aT + photoHsVH[p];
        for (let q = 0; q < 5; q++) {
          if (q === p) continue;
          if (photoZs[q] <= photoZs[p]) continue;
          const bL = photoLeftsVW[q], bR = bL + photoSizes[q];
          const bT = photoTopsVH[q], bB = bT + photoHsVH[q];
          if (!(aR < bL || bR < aL || aB < bT || bB < aT)) {
            needs = true;
            break;
          }
        }
        needsLowerAnim[p] = needs;
      }

      // Step 4: 建立 DOM
      const thisPageRotates = [];

      for (let p = 0; p < 5; p++) {
        if (p === 0 && !isFirst) continue;
        if (p === 4 && isLast) continue;

        const photoVW = photoSizes[p];
        const photoLeft = ox + photoLeftsVW[p] * vw;
        const topVH = photoTopsVH[p];

        const photo = document.createElement('div');
        photo.className = 'timeline-photo';
        // top 用 %（相對 strip = pageH，見上方 Y 軸註解）→ 照片落在 area 內、底邊不過 footer；width 仍 vw（X 軸相對 viewport 寬）
        photo.style.cssText = `position:absolute; width:${photoVW}vw; left:${photoLeft}px; top:${topVH}%; z-index:${photoZs[p]};`;

        const rotateDiv = document.createElement('div');
        rotateDiv.style.cssText = `overflow:hidden; transform:rotate(${photoRots[p]}deg);`;

        const aspectDiv = document.createElement('div');
        aspectDiv.style.cssText = 'aspect-ratio:16/9; overflow:hidden;';

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = `${item.year}`;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';

        aspectDiv.appendChild(img);
        rotateDiv.appendChild(aspectDiv);
        photo.appendChild(rotateDiv);
        strip.appendChild(photo);

        // 儲存 metadata 供統一 hover 系統使用
        photo._tlSlot = p;
        photo._tlYear = index;
        photo._tlOrigZ = photoZs[p];
        photo._tlNeedsLowerAnim = needsLowerAnim[p];
        // 簡短假文：年份 + era（不含 desc，避免 tooltip 過長；之後可換成圖片本身的 caption）
        photo._tlTooltip = `<strong>${item.year}</strong> ${item.eraTitle} ${item.eraLabel}`;

        thisPageRotates.push({ rotateDiv, slotIndex: p });
      }

      pagePhotoRotates.push(thisPageRotates);

      // --- 字卡固定位置（不在 strip 內，疊在 cardsOverlay 上）---

      const cardColor = randomColor();

      // === Group descriptions by leading <h5>...</h5> token ===
      // h5 開頭 → 獨立一張卡（chip = h5 文字）；無 h5 → 接續上一張卡作為其 description
      // 即同年「BFA + MDES」會拆成 2 張獨立主卡，每張卡的小標（BFA/MDES）放卡內 body 頂端（不再做卡外 chip）
      const rawDescs = item.descriptions || (item.description ? [item.description] : []);
      const cardsData = []; // [{ chip: string|null, items: string[] }]
      const H5_RE = /^\s*<h5[^>]*>([\s\S]*?)<\/h5>/i;
      let currentCard = null;
      rawDescs.forEach(d => {
        const m = d.match(H5_RE);
        if (m) {
          const chipText = m[1].trim();
          const body = d.replace(H5_RE, '').trim();
          currentCard = { chip: chipText, items: [body] };
          cardsData.push(currentCard);
        } else {
          if (!currentCard) {
            currentCard = { chip: null, items: [d] };
            cardsData.push(currentCard);
          } else {
            currentCard.items.push(d);
          }
        }
      });
      if (cardsData.length === 0) cardsData.push({ chip: null, items: [] });

      // === Build N 張主卡（cardsData[0]＝含年份的主卡放最「上」，後續卡往下堆；user 2026-06-07：先 BFA 再 MDES）===
      // 反序 placement：先建 cardsData[last] 放最底、最後建 cardsData[0] 放最頂；year 仍掛 cardsData[0]（isFirstCard）
      const mainCards = [];
      let cumBottom = CARD_BOTTOM_PAD;

      for (let ci = cardsData.length - 1; ci >= 0; ci--) {
        const card = cardsData[ci];
        const mainRot = pickUniqueRotations(1, -CARD_MAIN_ROT, CARD_MAIN_ROT)[0] || 0;
        const isFirstCard = ci === 0; // cardsData[0] = 顯示 year 的卡（反序後位於最上面）

        const mainCard = document.createElement('div');
        mainCard.className = 'timeline-card-inner absolute pointer-events-none';
        // width:max-content + max-width 讓內容 fit，右 padding 才會視覺對稱
        mainCard.style.cssText = `right:${MAIN_CARD_RIGHT}px;bottom:${cumBottom}px;padding:0.6rem 0.8rem;background:${cardColor};width:max-content;max-width:${MAIN_CARD_W}px;transform-origin:bottom right;transform:rotate(${mainRot}deg);`;

        // items 多筆用 BLOCK_GAP 行間距分開
        const itemsHtml = card.items.map((it, ii) =>
          `<div${ii > 0 ? ` style="margin-top:${BLOCK_GAP}px;"` : ''}>${it}</div>`
        ).join('');

        // BFA/MDES 小標：放進卡片內、body col 頂端（不再做卡外 chip）。
        // h5 + line-height:1 → 跟左欄年份（也是 h5 lh:1）頂端對齊；margin-bottom 與下方說明拉開
        // （比照 list view 的 .tl-list-block > h5 做法，兩視圖一致）
        const chipHtml = card.chip
          ? `<div class="text-h5" style="line-height:1;margin-bottom:${BLOCK_GAP}px;">${card.chip}</div>`
          : '';

        // 第一張卡（含年份）：grid `auto 1fr`，左欄年份、右欄文字。
        // 後續卡（無年份）：不放左欄，文字直接佔整張卡 → 左右 padding 對稱（user 2026-06-07：沒渲染年份的卡左 padding 要跟右一樣）
        mainCard.innerHTML = isFirstCard
          ? `
          <div style="display:grid;grid-template-columns:auto 1fr;gap:${GRID_GAP_PX}px;align-items:start;">
            <div><h4 class="font-bold" style="line-height:1;">${item.year}</h4></div>
            <div class="text-p2 leading-base font-bold">${chipHtml}${itemsHtml}</div>
          </div>
        `
          : `<div class="text-p2 leading-base font-bold">${chipHtml}${itemsHtml}</div>`;
        cardsOverlay.appendChild(mainCard);

        // === Snug width：限內容欄寬讓文字 wrap，再 TreeWalker 量實際最右文字 pixel ===
        // 第一張卡內容在 grid 右欄（左欄=年份）；後續卡內容是整張卡的 text div（無左欄/gap）→ leftColW/gap=0、左右對稱
        const cs = getComputedStyle(mainCard);
        const padL = parseFloat(cs.paddingLeft);
        const padR = parseFloat(cs.paddingRight);
        const gridEl = mainCard.firstElementChild;
        const contentEl = isFirstCard ? gridEl.children[1] : gridEl;
        const leftColW = isFirstCard ? gridEl.children[0].getBoundingClientRect().width : 0;
        const gapW = isFirstCard ? GRID_GAP_PX : 0;
        const contentMaxW = MAIN_CARD_W - padL - padR - gapW - leftColW;

        // 鎖內容欄寬度上限讓文字 wrap
        contentEl.style.maxWidth = `${contentMaxW}px`;

        // 量「實際最右文字 pixel」相對內容欄左緣的偏移 = TreeWalker 走 text node
        const rootLeft = contentEl.getBoundingClientRect().left;
        let maxRight = 0;
        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.nodeValue || !node.nodeValue.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            const off = r.right - rootLeft;
            if (off > maxRight) maxRight = off;
          }
        }
        // mainCard 總寬 = padL + leftColW + gap + 實際內容寬 + padR
        const snugW = padL + leftColW + gapW + Math.ceil(maxRight) + padR + 1;
        mainCard.style.width = `${Math.min(snugW, MAIN_CARD_W)}px`;

        mainCards.push(mainCard);

        // 下一張卡的 bottom：此卡頂 + CARD_GAP（小標已在卡內、計入 mainCard.offsetHeight）
        cumBottom += mainCard.offsetHeight + CARD_GAP;
      }

      pageData.push({ mainCards, eraKey: `${item.eraTitle}|${item.eraLabel}`, eraTitle: item.eraTitle, eraLabel: item.eraLabel });
    });

    // === Era badges：每個 era 只建 1 個（共用 instance）===
    // 位置 v6：畫面左半邊隨機散落、偏左下角（user 指定 2026-05-24）
    //   - 水平範圍 left: containerPad ~ pageW * 0.45（不跨中線）
    //   - 垂直範圍 bottom: CARD_BOTTOM_PAD ~ pageH * 0.35（從底部最多到頁面 35% 高 = 偏下）
    //   - 不再跟主卡綁定（v4 left-of-main、v5 right-of-main 都棄用，主卡擠不擠都不影響 era 位置）
    // 跨 era 切時 current/target eraBadge 共用 ref 自然不對到自己；sameEra 時是同 instance 自動不動
    const ERA_LEFT_MAX_RATIO = 0.45;  // 水平最右停在 viewport 45%（不過中線）
    const ERA_BOTTOM_MAX_RATIO = 0.35; // 垂直最高停在 viewport 35%（保持「下半」感）
    const eraBadgesByKey = {};
    pageData.forEach(pd => {
      if (eraBadgesByKey[pd.eraKey]) {
        pd.eraBadge = eraBadgesByKey[pd.eraKey];
        return;
      }
      const eraRot = pickUniqueRotations(1, -4, 4)[0];
      const eraBadge = document.createElement('div');
      eraBadge.className = 'timeline-card-inner bg-black text-white absolute pointer-events-none';

      // 隨機位置（先暫設讓元素 render 拿 offsetWidth 再 clamp 不超出）
      eraBadge.style.cssText = `left:0px;bottom:0px;padding:0.4em 0.7em;width:max-content;transform-origin:bottom left;transform:rotate(${eraRot}deg);z-index:2;visibility:hidden;`;
      eraBadge.innerHTML = `<div class="text-p2 leading-base font-bold">${pd.eraTitle} ${pd.eraLabel}</div>`;
      cardsOverlay.appendChild(eraBadge);

      const badgeW = eraBadge.offsetWidth;
      const leftMax = Math.max(safeLeft, pageW * ERA_LEFT_MAX_RATIO - badgeW);
      const leftMin = safeLeft;
      const eraLeft = leftMin + Math.random() * Math.max(0, leftMax - leftMin);

      const bottomMin = CARD_BOTTOM_PAD;
      const bottomMax = pageH * ERA_BOTTOM_MAX_RATIO;
      const eraBottom = bottomMin + Math.random() * Math.max(0, bottomMax - bottomMin);

      eraBadge.style.cssText = `left:${eraLeft}px;bottom:${eraBottom}px;padding:0.4em 0.7em;width:max-content;transform-origin:bottom left;transform:rotate(${eraRot}deg);z-index:2;`;

      eraBadgesByKey[pd.eraKey] = eraBadge;
      pd.eraBadge = eraBadge;
    });

    // 同年所有主卡當一組元素處理（小標已在卡內、跟卡一起 clip-path，不再有卡外 chip）
    function getCardEls(pd) {
      return [...pd.mainCards];
    }

    // 初始：除第 0 年外其他年份的字卡全部 clip-path 隱藏
    for (let i = 1; i < pageData.length; i++) {
      const pd = pageData[i];
      getCardEls(pd).forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
    }
    // Era badges：只有第 0 年的 era 顯示，其他 era badge 全部 clip-path 隱藏
    const firstEraKey = pageData[0].eraKey;
    Object.entries(eraBadgesByKey).forEach(([key, badge]) => {
      if (key !== firstEraKey) {
        gsap.set(badge, { clipPath: getClipStart(randomDirLR()) });
      }
    });

    // --- 統一 Photo Hover 系統 ---
    const allPhotos = Array.from(strip.querySelectorAll('.timeline-photo'));
    let activeHover = null;      // 當前 hover 的 photo element
    let hoverLeaveTimer = null;  // 延遲 leave，讓跨照片 hover 順暢
    let hoverEnabled = false;    // 等頁面 reveal 完成後才允許 hover，避免 clip-path 打架

    // 收集當前頁面的邊界照片（slot 0,4）供 dim 用
    function getEdgePhotos() {
      return allPhotos.filter(p => p._tlSlot === 0 || p._tlSlot === 4);
    }
    // hover 照片：直接提升 z-index（不做 clip-path）
    // 反向離開時由 lowerPhoto 做 clip-path 回到原本 z-index
    function raisePhoto(photo, showTooltip) {
      const rotateDiv = photo.querySelector('div');
      if (!rotateDiv) return;

      gsap.killTweensOf(rotateDiv);
      // 確保可見（若之前有中斷的 lower 動畫殘留）
      gsap.set(rotateDiv, { clipPath: CLIP_END });

      // 14 < cardsOverlay 的 z=15，確保 hover 圖片不會蓋過 era/year/desc 字卡
      photo.style.zIndex = '14';
      if (showTooltip) showTooltip();
    }

    function lowerPhoto(photo) {
      const rotateDiv = photo.querySelector('div');
      if (!rotateDiv) {
        photo.style.zIndex = photo._tlOrigZ;
        return;
      }

      gsap.killTweensOf(rotateDiv);

      // _tlNeedsLowerAnim 在 buildStrip 預先計算（檢查是否被更高 z 的 photo 重疊覆蓋）
      // false = 該年最高 z 或無重疊 → instant 切回，無動畫
      if (!photo._tlNeedsLowerAnim) {
        gsap.set(rotateDiv, { clipPath: CLIP_END });
        photo.style.zIndex = photo._tlOrigZ;
        return;
      }

      // 非最上層：clip-out → swap z → clip-in
      // 動畫期間鎖住 photo._tlLowering，mouseenter handler 看到此 flag 會直接 skip，
      // 避免 hover 離開後立刻再 hover 同一張造成中斷重啟
      photo._tlLowering = true;
      const clearLowering = () => { photo._tlLowering = false; };
      const dir = randomDir4();
      gsap.to(rotateDiv, {
        clipPath: getClipStart(dir), duration: TIMING.photoClipDuration, ease: TIMING.photoClipEase,
        onInterrupt: clearLowering,
        onComplete: () => {
          photo.style.zIndex = photo._tlOrigZ;
          gsap.to(rotateDiv, {
            clipPath: CLIP_END, duration: TIMING.photoClipDuration, ease: TIMING.photoClipEase,
            onComplete: clearLowering,
            onInterrupt: clearLowering,
          });
        }
      });
    }

    // Dim / undim 邊界照片（只用 grayscale）
    function dimEdgePhotos() {
      getEdgePhotos().forEach(p => {
        const img = p.querySelector('img');
        if (img) gsap.to(img, { filter: 'grayscale(100%)', duration: TIMING.dimDuration });
      });
    }
    function undimEdgePhotos() {
      getEdgePhotos().forEach(p => {
        const img = p.querySelector('img');
        if (img) gsap.to(img, { filter: 'grayscale(0%)', duration: TIMING.dimDuration });
      });
    }

    // Tooltip follow cursor 偏移（右下方，避免擋住游標）
    const TOOLTIP_OFFSET_X = 20;
    const TOOLTIP_OFFSET_Y = 20;

    // 進入 hover 狀態（中間照片 slot 1~3）
    function enterMiddleHover(photo, e) {
      const fromOtherPhoto = activeHover && activeHover !== photo;
      // 只有前一張是中間照片才跑 reverse clip；邊界照片靠 dim 處理，不跑 clip
      const fromMiddle = fromOtherPhoto && activeHover._tlSlot >= 1 && activeHover._tlSlot <= 3;
      const tooltipVisible = photoTooltip && gsap.getProperty(photoTooltip, 'opacity') > 0;

      if (fromMiddle) {
        lowerPhoto(activeHover);
      }
      activeHover = photo;

      // 立即設文字（首次 / 跨照片切換都同步換）
      if (photoTooltipText) photoTooltipText.innerHTML = photo._tlTooltip;

      // 無論首次或跨照片：新照片都提升 z-index
      raisePhoto(photo, () => {
        if (activeHover !== photo) return;
        if (!photoTooltip) return;

        gsap.killTweensOf(photoTooltip);

        if (tooltipVisible) {
          // 跨照片切換：位置由 mousemove handler 持續 follow，這裡只保持可見
          gsap.set(photoTooltip, { clipPath: CLIP_END, opacity: 1 });
          return;
        }

        // Tooltip 首次出現：instant 顯示（無 clip-path 動畫）
        gsap.set(photoTooltip, {
          right: 'auto', bottom: 'auto',
          xPercent: 0, yPercent: 0,
          left: e.clientX + TOOLTIP_OFFSET_X, top: e.clientY + TOOLTIP_OFFSET_Y,
          rotation: randRot(),
          clipPath: CLIP_END, opacity: 1,
        });
      });

      // 每次進入 middle 都確保邊界照片是 dim 狀態（idempotent）
      dimEdgePhotos();
    }

    // 離開所有 hover
    function leaveAllHover() {
      if (activeHover) {
        if (activeHover._tlSlot >= 1 && activeHover._tlSlot <= 3) {
          lowerPhoto(activeHover);
        }
        // 邊界照片不做任何處理（沒有單色效果需要恢復）
        activeHover = null;
      }
      if (photoTooltip) {
        gsap.killTweensOf(photoTooltip);
        // clip-path 消失，完成後 reset 供下次 instant 出現
        gsap.to(photoTooltip, {
          clipPath: getClipStart(randomDirLR()),
          duration: TIMING.tooltipHideDuration,
          ease: TIMING.exitEase,
          onComplete: () => gsap.set(photoTooltip, { opacity: 0, clipPath: CLIP_END }),
        });
      }
      // 字卡自然恢復（照片 z-index 降回去後）
      undimEdgePhotos();
    }

    // 進入邊界照片 hover（slot 0 或 4）→ 不做任何效果，cursor default
    function enterEdgeHover(photo) {
      // 如果從中間照片過來，先清理
      if (activeHover && activeHover._tlSlot >= 1 && activeHover._tlSlot <= 3) {
        lowerPhoto(activeHover);
        if (photoTooltip) {
          gsap.killTweensOf(photoTooltip);
          // clip-path 消失（快版）
          gsap.to(photoTooltip, {
            clipPath: getClipStart(randomDirLR()),
            duration: TIMING.tooltipHideFastDuration,
            ease: TIMING.exitEase,
            onComplete: () => gsap.set(photoTooltip, { opacity: 0, clipPath: CLIP_END }),
          });
        }
        undimEdgePhotos();
      }

      activeHover = photo;
      // 不改單色、不改 z-index
    }

    // 邊界照片角色判斷（動態，依 currentIndex 決定是左箭頭還是右箭頭）
    // slot 4 photo 同時是「year y 的右邊」跟「year (y+1) 的左邊」
    // 所以當 currentIndex === y 時是 right（下一年）；currentIndex === y+1 時是 left（上一年）
    function getEdgeRole(photo) {
      const s = photo._tlSlot;
      const y = photo._tlYear;
      if (s === 0 && y === 0) return null; // 最左端，無上一年
      if (s === 4) {
        if (currentIndex === y) return 'right';
        if (currentIndex === y + 1) return 'left';
      }
      return null;
    }
    // 綁定事件到所有照片
    allPhotos.forEach(photo => {
      const isMiddle = photo._tlSlot >= 1 && photo._tlSlot <= 3;
      const isEdge = photo._tlSlot === 0 || photo._tlSlot === 4;
      // 1958（index 0）的 slot 0 是時間軸最左端，沒有上一年 → 不要點擊也不要 cursor
      const isLeftmostFirst = isEdge && photo._tlSlot === 0 && photo._tlYear === 0;

      // edge photo 加 data-tl-edge 給 cursor.css hook（不可點擊的 leftmost 不加）
      if (isEdge && !isLeftmostFirst) {
        photo.dataset.tlEdge = getEdgeRole(photo); // 'left' or 'right'
      }

      photo.addEventListener('mouseenter', (e) => {
        if (!hoverEnabled) return; // 等 reveal 完成才允許 hover
        // 該照片自己的 lower clip-path 動畫進行中：先讓它跑完才允許再次 hover
        if (photo._tlLowering) return;
        clearTimeout(hoverLeaveTimer);
        if (isMiddle) {
          enterMiddleHover(photo, e);
        } else if (isEdge) {
          enterEdgeHover(photo);
        }
      });

      photo.addEventListener('mousemove', (e) => {
        if (!hoverEnabled) return;
        // middle photo：tooltip 跟 cursor 偏移右下走
        if (isMiddle && photoTooltip && typeof gsap !== 'undefined') {
          gsap.set(photoTooltip, {
            left: e.clientX + TOOLTIP_OFFSET_X,
            top: e.clientY + TOOLTIP_OFFSET_Y,
            overwrite: 'auto',
          });
        }
      });

      photo.addEventListener('mouseleave', () => {
        hoverLeaveTimer = setTimeout(() => {
          if (activeHover === photo) leaveAllHover();
        }, TIMING.leaveDebounceMs);
      });

      // 邊界照片可點擊：行為同 nav zone（左 → 上一年、右 → 下一年/重置）；最左端不可點
      if (isEdge && !isLeftmostFirst) {
        photo.addEventListener('click', () => {
          const role = getEdgeRole(photo);
          if (role === 'left') {
            if (currentIndex > 0) goTo(currentIndex - 1);
          } else if (role === 'right') {
            if (currentIndex < items.length - 1) goTo(currentIndex + 1);
            else resetTimeline();
          }
        });
      }
    });

    // Nav zone hover：如果正在 hover 中間照片，不顯示 nav 箭頭
    navLeft.addEventListener('mouseenter', (e) => {
      if (activeHover && activeHover._tlSlot >= 1 && activeHover._tlSlot <= 3) {
        e.stopImmediatePropagation(); // 照片 hover 優先
      }
    }, true);
    navRight.addEventListener('mouseenter', (e) => {
      if (activeHover && activeHover._tlSlot >= 1 && activeHover._tlSlot <= 3) {
        e.stopImmediatePropagation();
      }
    }, true);

    // --- 導航 ---（currentIndex / isTransitioning 已在 buildStrip 開頭宣告）

    function updateNavZones() {
      // list view 開啟時隱藏左右 nav zone（避免邊緣殘留箭頭 cursor）
      if (listMode) { navLeft.style.display = 'none'; navRight.style.display = 'none'; return; }
      navLeft.style.display = currentIndex === 0 ? 'none' : '';
      // 右箭頭永遠顯示（最後一年點擊會重新開始）
      navRight.style.display = '';
    }

    // 邊界 slot（0 / 4）永遠不做 clip-path，隨時保持可見
    const isEdgeSlot = (s) => s === 0 || s === 4;

    // 設定照片 clip-path 隱藏（每張隨機四方向；跳過邊界）
    function hidePagePhotos(index) {
      if (revealedPages.has(index)) return;
      const rotates = pagePhotoRotates[index];
      if (!rotates) return;
      rotates.forEach(({ rotateDiv, slotIndex }) => {
        if (isEdgeSlot(slotIndex)) return;
        gsap.set(rotateDiv, { clipPath: getClipStart(randomDir4()) });
      });
    }

    // 照片 clip-path reveal（跳過邊界）
    function revealPagePhotos(index) {
      if (revealedPages.has(index)) return;
      revealedPages.add(index);
      const rotates = pagePhotoRotates[index];
      if (!rotates) return;
      rotates.forEach(({ rotateDiv, slotIndex }, i) => {
        if (isEdgeSlot(slotIndex)) return;
        gsap.to(rotateDiv, {
          clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, delay: i * TIMING.stagger
        });
      });
    }

    function goTo(index) {
      if (listMode || isTransitioning || index < 0 || index >= items.length) return;
      isTransitioning = true;
      hoverEnabled = false;

      // 切換前：若有 activeHover 殘留，先清掉（避免指向舊頁照片）
      if (activeHover) {
        const rd = activeHover.querySelector('div');
        gsap.killTweensOf(rd);
        if (rd) gsap.set(rd, { clipPath: CLIP_END });
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._tlLowering = false;
        activeHover = null;
        clearTimeout(hoverLeaveTimer);
        if (photoTooltip) gsap.set(photoTooltip, { opacity: 0, clipPath: CLIP_END });
        undimEdgePhotos();
      }

      const prevIndex = currentIndex;
      currentIndex = index;
      updateNavZones();

      const current = pageData[prevIndex];
      const target = pageData[index];
      const sameEra = current.eraKey === target.eraKey;

      // Step 1: clip-out 當前年份的主卡 + chip；era 只有跨 era 才退場（current/target eraBadge 共用 ref，sameEra 時是同個 instance 跳過）
      getCardEls(current).forEach(el => {
        gsap.to(el, {
          clipPath: getClipStart(randomDirLR()),
          duration: TIMING.exitDuration,
          ease: TIMING.exitEase,
        });
      });
      if (!sameEra) {
        gsap.to(current.eraBadge, {
          clipPath: getClipStart(randomDirLR()),
          duration: TIMING.exitDuration,
          ease: TIMING.exitEase,
        });
      }

      // Step 2: 確保目標字卡是隱藏狀態（保險）
      getCardEls(target).forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
      if (!sameEra) {
        // 跨 era：target era 進場前設 clip start（共用 instance 可能還有 autoAlpha 殘留也清掉）
        gsap.set(target.eraBadge, { autoAlpha: 1, clipPath: getClipStart(randomDirLR()) });
      }

      // Step 3: 隱藏目標頁的照片（隨機四方向）
      hidePagePhotos(index);

      // Step 4: strip 卷軸橫移（只移動照片，字卡留在原位）
      gsap.to(strip, {
        left: -index * pageW,
        duration: TIMING.stripSlideDuration,
        ease: TIMING.stripSlideEase,
        onComplete: () => {
          // 到位後 reveal 照片 + 目標字卡
          revealPagePhotos(index);

          getCardEls(target).forEach((el, i) => {
            gsap.to(el, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: i * TIMING.stagger });
          });
          if (!sameEra) {
            gsap.to(target.eraBadge, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: TIMING.stagger });
          }

          isTransitioning = false;
          gsap.delayedCall(TIMING.hoverEnableDelay, () => { hoverEnabled = true; });
        },
      });
    }

    // 重置 timeline：清空最後一年 → 回到第一年
    function resetTimeline() {
      if (listMode || isTransitioning) return;
      isTransitioning = true;
      hoverEnabled = false;

      // 清掉殘留 hover
      if (activeHover) {
        const rd = activeHover.querySelector('div');
        gsap.killTweensOf(rd);
        if (rd) gsap.set(rd, { clipPath: CLIP_END });
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._tlLowering = false;
        activeHover = null;
        clearTimeout(hoverLeaveTimer);
        if (photoTooltip) gsap.set(photoTooltip, { opacity: 0, clipPath: CLIP_END });
        undimEdgePhotos();
      }

      const lastIdx = items.length - 1;

      // Step 1: 用 clip-path 清空當前畫面（最後一年的照片 + 字卡；跳過邊界 slot）
      const lastRotates = pagePhotoRotates[lastIdx] || [];
      const lastPage = pageData[lastIdx];
      // era badge：把「最後一年所屬 era」的共用 badge 一併收起
      const clearEls = [
        ...lastRotates.filter(r => !isEdgeSlot(r.slotIndex)).map(r => r.rotateDiv),
        ...getCardEls(lastPage),
        lastPage.eraBadge,
      ];

      // Step 1: clip-path 收起最後一年（用 timeline 確保全部完成後才繼續）
      const exitTl = gsap.timeline({
        onComplete: () => {
          // Step 2: 隱藏所有年份的照片和字卡（跳過邊界 slot）
          pagePhotoRotates.forEach(rotates => {
            rotates.forEach(({ rotateDiv, slotIndex }) => {
              if (isEdgeSlot(slotIndex)) return;
              gsap.set(rotateDiv, { clipPath: getClipStart(randomDir4()) });
            });
          });
          pageData.forEach(pd => {
            getCardEls(pd).forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
          });
          // 所有 era badge clip-path 隱藏（reset 後從第 0 年的 era 重新 reveal）
          Object.values(eraBadgesByKey).forEach(badge => {
            gsap.set(badge, { autoAlpha: 1, clipPath: getClipStart(randomDirLR()) });
          });

          // Step 3: 重置狀態
          revealedPages.clear();
          currentIndex = 0;
          updateNavZones();

          // Step 4: 移回第一年
          gsap.set(strip, { left: 0 });

          // Step 5: 準備第一年 reveal（邊界 slot 不做 clip，保持可見）
          const firstRotates = (pagePhotoRotates[0] || [])
            .filter(r => !isEdgeSlot(r.slotIndex))
            .map(r => r.rotateDiv);
          const firstPageData = pageData[0];
          const firstCards = [...getCardEls(firstPageData), firstPageData.eraBadge];
          const allFirstEls = [...firstRotates, ...firstCards];

          firstRotates.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDir4()) }));
          firstCards.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));

          // Step 6: Reveal 第一年
          allFirstEls.forEach((el, i) => {
            gsap.to(el, {
              clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, delay: TIMING.firstRevealDelay + i * TIMING.stagger,
            });
          });
          revealedPages.add(0);
          isTransitioning = false;
          gsap.delayedCall(TIMING.hoverEnableDelay, () => { hoverEnabled = true; });
        }
      });

      // 把每個元素的退場動畫加到 timeline（全部在 time=0 同時開始）
      clearEls.forEach(el => {
        exitTl.to(el, {
          clipPath: getClipStart(randomDir4()),
          duration: TIMING.exitDuration,
          ease: TIMING.exitEase,
        }, 0); // 全部在 time=0 同時開始
      });
    }

    // Nav zone click（cursor 由 cursor.css 的 [data-tl-nav-edge] 規則統一管）
    navLeft.addEventListener('click', () => {
      if (currentIndex > 0) goTo(currentIndex - 1);
    });
    navRight.addEventListener('click', () => {
      if (currentIndex < items.length - 1) {
        goTo(currentIndex + 1);
      } else {
        // 最後一年 → 重置 timeline
        resetTimeline();
      }
    });

    updateNavZones();

    // ── List View（era 卡片切換；桌機 only）──────────────────────────
    // 左下角 toggle 鈕切換 timeline ↔ list view：
    //   進 list：clip-out 當前畫面照片 + 字卡 → clip-in 一個 accent 矩形（單一 era、內容可捲動）
    //   矩形左上角 = era 名稱 chip、右下角 next 鈕在各 era 間 loop
    // 沿用既有 clip helper / TIMING / ACCENT_COLORS；顏色每次進場隨機指派。
    // 矩形 + chip 套 .timeline-card-inner 取得三 mode 配色（standard/inverse accent+黑字、color strict B/W）。

    // era 分組（從 flatten 的 items 還原，保持原順序）
    const eraGroups = [];
    const eraIndexByKey = {};
    items.forEach(it => {
      const key = `${it.eraTitle}|${it.eraLabel}`;
      if (eraIndexByKey[key] === undefined) {
        eraIndexByKey[key] = eraGroups.length;
        eraGroups.push({ title: it.eraTitle, label: it.eraLabel, years: [] });
      }
      eraGroups[eraIndexByKey[key]].years.push(it);
    });

    let listEraIndex = 0;
    let listRectAnimating = false; // next 切換期間鎖
    let listEraColors = [];
    let hiddenRotates = [];        // 進 list 時 clip-out 的照片 rotateDiv，返回時還原
    let hiddenCards = [];          // 同上：字卡 + era badge

    // toggle 鈕（atlas layout-btn 同款 icon 鈕；absolute 在 timeline-area 左下角）
    const listBtn = document.createElement('button');
    listBtn.id = 'timeline-list-btn';
    listBtn.setAttribute('aria-label', '切換清單視圖');
    listBtn.innerHTML = '<span class="tl-icon-btn-inner"><span class="icon icon-atlas-list"></span></span>';
    area.appendChild(listBtn);
    const listIcon = listBtn.querySelector('.icon');

    // toggle 鈕 icon 切換：比照 atlas layout-btn 的 icon swap（hideLayoutIcon → revealLayoutIcon）。
    //   隨機四方向 clip-path（% 單位）；reveal 起點 = 上次 hide 的終點方向 → reveal 是 hide 的時間反向，連續不跳。
    //   clip 套在 .icon glyph（不是整個色塊 box）→ 色塊留著、只有 icon 圖形 wipe/swap（與 atlas 一致）。
    const TL_ICON_DIRS = [
      'inset(0% 100% 0% 0%)', // 右
      'inset(0% 0% 0% 100%)', // 左
      'inset(100% 0% 0% 0%)', // 上
      'inset(0% 0% 100% 0%)', // 下
    ];
    const TL_ICON_DUR = 0.4;
    const TL_ICON_EASE = 'power2.out';
    function wipeToggleIcon(newClass) {
      if (typeof gsap === 'undefined') { listIcon.className = newClass; return; }
      const dir = TL_ICON_DIRS[Math.floor(Math.random() * 4)];
      gsap.killTweensOf(listIcon);
      // hide：clip 到隨機方向 → 換 className → 從同方向 reveal 回全顯（= hide 的時間反向）
      gsap.to(listIcon, {
        clipPath: dir, duration: TL_ICON_DUR, ease: TL_ICON_EASE, overwrite: true,
        onComplete: () => {
          listIcon.className = newClass;
          gsap.fromTo(listIcon,
            { clipPath: dir },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: TL_ICON_DUR, ease: TL_ICON_EASE, clearProps: 'clipPath', overwrite: true }
          );
        },
      });
    }

    // list view overlay：grid(對齊 col-5~20) > cell > rect(clip 目標) + chip + next 鈕（chip/next 為 sibling 凸出矩形邊）
    const listView = document.createElement('div');
    listView.id = 'timeline-list-view';
    listView.style.display = 'none';
    listView.innerHTML =
      '<div class="tl-list-grid"><div class="tl-list-cell">' +
        '<div class="tl-list-rect timeline-card-inner"><div class="tl-list-content list-scroll"></div></div>' +
        '<div class="tl-list-chip timeline-card-inner bg-black text-white"><div class="text-p2 leading-base font-bold"></div></div>' +
        '<button class="tl-list-next-btn" aria-label="下一個時期"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div></div>';
    area.appendChild(listView);

    const listChip = listView.querySelector('.tl-list-chip');
    const listChipText = listChip.querySelector('div');
    const listRect = listView.querySelector('.tl-list-rect');
    const listContent = listView.querySelector('.tl-list-content');
    const listNextBtn = listView.querySelector('.tl-list-next-btn');
    const rectEls = [listRect, listChip]; // reveal/exit 一起（rect 先、chip 後 stagger）

    // 把單筆說明（<h5>?<div>EN</div><div>ZH</div>）拆成 heading / EN / ZH 三段，供 EN 左 ZH 右排版
    const descParser = document.createElement('div');
    function splitDesc(d) {
      descParser.innerHTML = d;
      let heading = '';
      const divs = [];
      [...descParser.children].forEach(ch => {
        if (ch.tagName === 'H5') heading += ch.outerHTML;
        else divs.push(ch);
      });
      const en = divs[0] ? divs[0].innerHTML : '';
      const zh = divs.length > 1 ? divs.slice(1).map(x => x.innerHTML).join('<br>') : '';
      return { heading, en, zh };
    }

    function renderListEra(idx) {
      const era = eraGroups[idx];
      listChipText.textContent = `${era.title} ${era.label}`;
      listRect.style.background = listEraColors[idx];
      listContent.innerHTML = era.years.map(y => {
        const descs = y.descriptions || (y.description ? [y.description] : []);
        const blocks = descs.map(d => {
          const { heading, en, zh } = splitDesc(d);
          return '<div class="tl-list-block">' + heading +
            '<div class="tl-list-cols">' +
              `<div class="tl-list-en">${en}</div>` +
              `<div class="tl-list-zh">${zh}</div>` +
            '</div></div>';
        }).join('');
        return '<div class="tl-list-year-row">' +
          `<div class="tl-list-year text-h5 font-bold">${y.year}</div>` +
          `<div class="tl-list-year-body text-p2 leading-base font-bold">${blocks}</div>` +
        '</div>';
      }).join('');
      listContent.scrollTop = 0;
    }

    // 清掉殘留 hover state（進 list view 前）
    function clearListHover() {
      if (!activeHover) return;
      const rd = activeHover.querySelector('div');
      gsap.killTweensOf(rd);
      if (rd) gsap.set(rd, { clipPath: CLIP_END });
      activeHover.style.zIndex = activeHover._tlOrigZ;
      activeHover._tlLowering = false;
      activeHover = null;
      clearTimeout(hoverLeaveTimer);
      if (photoTooltip) gsap.set(photoTooltip, { opacity: 0, clipPath: CLIP_END });
      undimEdgePhotos();
    }

    // 當前 viewport 內可見的照片 rotateDiv（含邊界 slot 的跨頁殘留）
    function getVisibleRotates() {
      const aR = area.getBoundingClientRect();
      const out = [];
      allPhotos.forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.right > aR.left + 1 && r.left < aR.right - 1 &&
            r.bottom > aR.top + 1 && r.top < aR.bottom - 1) {
          const rd = p.querySelector('div');
          if (rd) out.push(rd);
        }
      });
      return out;
    }

    function showListView() {
      // !hoverEnabled = 當前年份的照片/字卡還在 reveal（剛切年、stagger 進場中）→ 此時進 list view，
      // showListView 的 clip-out 會跟「仍掛在 GSAP 上的 delayed reveal tween」打架：clip 完後那些 reveal
      // 才 fire，把照片重新展開殘留在 list 矩形後面（user 2026-06-07 回報「切年圖片還沒 load 完就點切換鈕」）。
      // hoverEnabled 正好在 reveal 完成才轉 true（goTo/初次/reset 皆是），等它 = 等頁面 settle 才允許進 list view。
      if (isTransitioning || listRectAnimating || !hoverEnabled) return;
      isTransitioning = true;
      hoverEnabled = false;
      clearListHover();
      listMode = true;
      updateNavZones();
      wipeToggleIcon('icon icon-atlas-view');

      // 每次進場隨機指派三原色給各 era，從當前年份所屬 era 開始
      const pool = shuffle(ACCENT_COLORS);
      listEraColors = eraGroups.map((_, i) => pool[i % pool.length]);
      listEraIndex = eraIndexByKey[pageData[currentIndex].eraKey] ?? 0;

      // clip-out 當前可見照片 + 字卡
      hiddenRotates = getVisibleRotates();
      hiddenCards = [...getCardEls(pageData[currentIndex]), pageData[currentIndex].eraBadge];
      [...hiddenRotates, ...hiddenCards].forEach(el => {
        gsap.to(el, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase });
      });

      // 照片/字卡收完才 clip-in 矩形
      gsap.delayedCall(TIMING.exitDuration, () => {
        renderListEra(listEraIndex);
        listView.style.display = 'block';
        gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
        gsap.to(rectEls, {
          clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
          onComplete: () => { isTransitioning = false; },
        });
      });
    }

    function hideListView() {
      if (isTransitioning || listRectAnimating) return;
      isTransitioning = true;
      wipeToggleIcon('icon icon-atlas-list');

      gsap.to(rectEls, {
        clipPath: getClipStart(randomDirLR()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listView.style.display = 'none';
          listMode = false;
          updateNavZones();
          const inEls = [...hiddenRotates, ...hiddenCards];
          inEls.forEach((el, i) => {
            gsap.to(el, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: i * TIMING.stagger });
          });
          const maxDelay = Math.max(0, inEls.length - 1) * TIMING.stagger + TIMING.cardRevealDuration;
          gsap.delayedCall(maxDelay, () => { isTransitioning = false; hoverEnabled = true; });
        },
      });
    }

    function nextListEra() {
      if (listRectAnimating || isTransitioning || eraGroups.length <= 1) return;
      listRectAnimating = true;
      gsap.to(rectEls, {
        clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listEraIndex = (listEraIndex + 1) % eraGroups.length;
          renderListEra(listEraIndex);
          gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
          gsap.to(rectEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { listRectAnimating = false; },
          });
        },
      });
    }

    listBtn.addEventListener('click', () => { if (listMode) hideListView(); else showListView(); });
    listNextBtn.addEventListener('click', nextListEra);

    // --- 第一年初始 clip-path reveal（邊界 slot 不做 clip，保持可見）---
    if (typeof ScrollTrigger !== 'undefined') {
      const firstRotates = (pagePhotoRotates[0] || [])
        .filter(r => !isEdgeSlot(r.slotIndex))
        .map(r => r.rotateDiv);
      const firstPageData = pageData[0];
      const firstCards = firstPageData
        ? [...getCardEls(firstPageData), firstPageData.eraBadge]
        : [];

      const allRevealEls = [...firstRotates, ...firstCards];

      // 先全部隱藏（照片隨機四方向，字卡隨機左右）
      firstRotates.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDir4()) }));
      firstCards.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));

      ScrollTrigger.create({
        trigger: area,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          allRevealEls.forEach((el, i) => {
            gsap.to(el, {
              clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, delay: i * TIMING.stagger,
            });
          });
          revealedPages.add(0);
          const maxDelay = (allRevealEls.length - 1) * TIMING.stagger + TIMING.revealDuration;
          gsap.delayedCall(maxDelay, () => { hoverEnabled = true; });
        },
      });
    }

    // 離頁退場：依當前模式 clip-path 收掉可見內容（沿用模組 showListView/hideListView 的 clip-out + TIMING.exitDuration）。
    //   卷軸模式 = 當前可見照片(rotateDiv) + 當前頁字卡 + era badge；list 模式 = rect + chip。
    //   全部一次過收（無 stagger）；只在 timeline 區在視窗內才跑（離頁時看不到就略過）。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const ar = area.getBoundingClientRect();
      if (!(ar.width > 0 && ar.bottom > 0 && ar.top < window.innerHeight)) { resolve(); return; }
      let exitEls, dirFn;
      if (listMode) {
        exitEls = rectEls;
        dirFn = randomDirLR;
      } else {
        const pd = pageData[currentIndex];
        const cards = pd ? [...getCardEls(pd), pd.eraBadge] : [];
        exitEls = [...getVisibleRotates(), ...cards].filter(Boolean);
        dirFn = randomDir4;
      }
      if (!exitEls.length) { resolve(); return; }
      gsap.killTweensOf(exitEls);
      let done = 0;
      const onOne = () => { if (++done >= exitEls.length) resolve(); };
      exitEls.forEach(el => {
        gsap.to(el, { clipPath: getClipStart(dirFn()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
      });
    }));
  }
}
