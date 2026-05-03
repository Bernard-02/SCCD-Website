/**
 * Timeline Module (About Page)
 * 卷軸概念：每年 5 張照片，第 1 張 = 上一年第 5 張，第 5 張 = 下一年第 1 張
 * 100vh 分成 5 個 bar（各 20vh），每張圖片佔一個 bar
 * 照片大小 15~40vw，clip-path 只做一次
 */

export function initTimeline() {
  const area = document.getElementById('timeline-area');
  const strip = document.getElementById('timeline-strip');
  const navLeft = document.getElementById('timeline-nav-left');
  const navRight = document.getElementById('timeline-nav-right');
  const cursorLeft = document.getElementById('timeline-cursor-left');
  const cursorRight = document.getElementById('timeline-cursor-right');
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
    // Cursor / Tooltip 跟隨
    followDuration: 0.35,
    followEase: 'power2.out',
    // Tooltip 入/退場
    tooltipShowDuration: 0.5,
    tooltipShowEase: 'power2.inOut',
    tooltipHideDuration: 0.2,
    tooltipHideFastDuration: 0.15,
    // Cursor 入/退場
    cursorShowDuration: 0.3,
    cursorShowEase: 'power3.out',
    cursorHideDuration: 0.2,
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

  // --- Arrow Cursor ---
  // 共用顯示/隱藏邏輯：edge photo 與 nav zone 都用同一份，避免兩者邊界切換時箭頭閃爍
  // hide 排程延遲 50ms，若期間有任何 show 觸發會 cancel；已可見時 show 只更新位置不重跑入場動畫
  const cursorHideTimers = new Map(); // cursor → timeout id

  function cancelHideArrowCursor(cursor) {
    const t = cursorHideTimers.get(cursor);
    if (t) {
      clearTimeout(t);
      cursorHideTimers.delete(cursor);
    }
  }

  function scheduleHideArrowCursor(cursor) {
    if (!cursor || typeof gsap === 'undefined') return;
    cancelHideArrowCursor(cursor);
    const t = setTimeout(() => {
      cursorHideTimers.delete(cursor);
      gsap.to(cursor, {
        clipPath: getClipStart(randomDirLR()),
        duration: TIMING.cursorHideDuration, ease: TIMING.exitEase, overwrite: true,
        onComplete: () => gsap.set(cursor, { opacity: 0 }),
      });
    }, 50);
    cursorHideTimers.set(cursor, t);
  }

  function showArrowCursor(cursor, e) {
    if (!cursor || typeof gsap === 'undefined') return;
    cancelHideArrowCursor(cursor);
    const opacity = parseFloat(gsap.getProperty(cursor, 'opacity')) || 0;
    // 位置 -30 讓 60×60 方塊置中貼合滑鼠點（取代系統 cursor）
    if (opacity > 0.5) {
      // 已可見：即時同步位置（無 follow 延遲）
      gsap.set(cursor, { left: e.clientX - 30, top: e.clientY - 30, overwrite: 'auto' });
    } else {
      // 首次出現：完整入場動畫
      gsap.set(cursor, {
        left: e.clientX - 30, top: e.clientY - 30,
        scale: 1, rotation: randRot(),
        clipPath: getClipStart(randomDirLR()), opacity: 1,
      });
      gsap.to(cursor, { clipPath: CLIP_END, duration: TIMING.cursorShowDuration, ease: TIMING.cursorShowEase, overwrite: 'auto' });
    }
  }

  function setupCursorNav(zone, cursor, onClick, getColor) {
    if (!cursor || typeof gsap === 'undefined') {
      zone.addEventListener('click', onClick);
      return;
    }
    zone.addEventListener('mousemove', (e) => {
      gsap.set(cursor, { left: e.clientX - 30, top: e.clientY - 30, overwrite: 'auto' });
    });
    zone.addEventListener('mouseenter', (e) => {
      // 方塊底色：當前 accent 色（icon 本身已是黑色）
      if (getColor) {
        gsap.to(cursor, { backgroundColor: getColor(), duration: TIMING.dimDuration, overwrite: 'auto' });
      }
      showArrowCursor(cursor, e);
    });
    zone.addEventListener('mouseleave', () => {
      scheduleHideArrowCursor(cursor);
    });
    // 點擊：箭頭保持顯示（只要還在範圍內），只執行 callback
    zone.addEventListener('click', () => {
      onClick();
    });
  }

  // --- Fetch & Build ---
  fetch('/data/timeline.json')
    .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
    .then(data => {
      const items = [];
      data.forEach(eraGroup => {
        eraGroup.years.forEach(yearItem => {
          items.push({ ...yearItem, eraTitle: eraGroup.era, eraLabel: eraGroup.label });
        });
      });
      if (items.length > 0) buildStrip(items);
    })
    .catch(err => console.error('Timeline error:', err));

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

    // --- Y 軸：100vh 扣上下 padding 後分 5 個 bar ---
    const yPadVH = 8; // 上下各 8vh 的 padding
    const usableH_VH = 100 - yPadVH * 2; // 84vh
    const BAR_H_VH = usableH_VH / 5;     // 每個 bar ≈ 16.8vh

    const pageData = [];
    const pagePhotoRotates = [];
    const revealedPages = new Set();

    // 量測卡片在實際寬度下的高度（用於 desc 堆疊位置計算）
    function measureCardHeight(innerHtml, width) {
      const tmp = document.createElement('div');
      tmp.className = 'timeline-card-inner';
      tmp.style.cssText = `position:absolute;visibility:hidden;padding:0.5em 0.6em;width:${width}px;left:-9999px;top:-9999px;box-sizing:border-box;`;
      tmp.innerHTML = innerHtml;
      document.body.appendChild(tmp);
      const h = tmp.offsetHeight;
      tmp.remove();
      return h;
    }

    // 量測元素內最右側「文字 pixel」相對 element 外左緣的偏移
    // 用 TreeWalker 走 text node 而非單一 Range：descriptions 含 <h5><div>(block elements)，
    // Range 對 block 子元素回傳的 client rect 是 block 整體 bbox（=parent width），不是文字實際寬度
    // 走到每個 text node 自己 Range 才能拿到 wrapped text 的逐行寬度
    function measureTextRightOffset(rootEl) {
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      const rootLeft = rootEl.getBoundingClientRect().left;
      let maxRight = 0;
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (const r of rects) {
          const offset = r.right - rootLeft;
          if (offset > maxRight) maxRight = offset;
        }
      }
      return maxRight;
    }

    // 固定位置（每年同 pos，隨機旋轉）
    const CARD_BOTTOM_PAD = 60;   // 距 viewport 底部
    const DESC_W = 360;           // desc 卡片左緣相對 nav col 的寬度（決定 desc 起始 col）
    const DESC_MAX_ROT = 1;       // desc 卡片最大旋轉角度（度）—— 越大越容易撞鄰卡
    const DESC_GAP_BUFFER = 4;    // desc 旋轉 excursion 上的視覺呼吸（gap = 2*excursion + buffer）
    const ERA_OFFSET_TOP = 24;    // era 底部相對 year 底部的額外距離（year 高 ~66px、era 高 ~30px，24 → era 底部與 year 頂部視覺貼合/微疊）
    const ERA_OFFSET_LEFT = -12;  // era 相對 year 的水平偏移
    const YEAR_W_APPROX = 220;    // year card 估計寬度（"1979" h3 + padding，用於 tooltip 中央定位）

    // 每年共用的位置常數（不變於 forEach loop）
    const safeLeft = Math.max(PADDING, containerPad + 14 * vw);
    const safeRight = pageW - 12 * vw - 40;
    const descLeftEdge = safeRight - DESC_W;                          // desc 的 col 起點
    const descRenderW = (pageW - containerPad) - descLeftEdge;        // desc 最大寬度（左緣到 col-12 右緣）
    // tooltip 在 year 與 desc 之間的水平中點（不是 viewport 中央）
    const tooltipBetweenLeft = (safeLeft + YEAR_W_APPROX + descLeftEdge) / 2;
    // 旋轉後，每張卡片底邊最遠下沉 ≈ W*sin(θ)；兩張相鄰卡片最壞情況疊加 → 2*W*sin(maxRot) + buffer
    const rotExcursion = descRenderW * Math.sin(DESC_MAX_ROT * Math.PI / 180);
    const descGap = Math.ceil(2 * rotExcursion + DESC_GAP_BUFFER);

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
        // 確保至少 30% 在 viewport 內
        top = Math.max(-0.7 * h, Math.min(top, 100 - 0.3 * h));
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
          photoTopsVH[p] = Math.max(-0.7 * h, Math.min(photoTopsVH[p], 100 - 0.3 * h));
        }
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
        photo.style.cssText = `position:absolute; width:${photoVW}vw; left:${photoLeft}px; top:${topVH}vh; z-index:${photoZs[p]};`;

        const rotateDiv = document.createElement('div');
        rotateDiv.style.cssText = `overflow:hidden; transform:rotate(${photoRots[p]}deg);`;

        const aspectDiv = document.createElement('div');
        // position:relative 讓 screen overlay 可以 absolute 蓋在 img 上
        aspectDiv.style.cssText = 'aspect-ratio:16/9; overflow:hidden; position:relative;';

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = `${item.year}`;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';

        // Screen tint overlay：dim 邊界照片時用 mix-blend-mode:screen + 當年 accent 色染色
        // 預設 transparent + opacity:0；dimEdgePhotos 才設色與淡入
        const screenOverlay = document.createElement('div');
        screenOverlay.className = 'photo-screen-overlay';
        screenOverlay.style.cssText = 'position:absolute; inset:0; mix-blend-mode:screen; background:transparent; opacity:0; pointer-events:none;';

        aspectDiv.appendChild(img);
        aspectDiv.appendChild(screenOverlay);
        rotateDiv.appendChild(aspectDiv);
        photo.appendChild(rotateDiv);
        strip.appendChild(photo);

        // 儲存 metadata 供統一 hover 系統使用
        photo._tlSlot = p;
        photo._tlYear = index;
        photo._tlOrigZ = photoZs[p];
        // 簡短假文：年份 + era（不含 desc，避免 tooltip 過長；之後可換成圖片本身的 caption）
        photo._tlTooltip = `<strong>${item.year}</strong> ${item.eraTitle} ${item.eraLabel}`;

        thisPageRotates.push({ rotateDiv, slotIndex: p });
      }

      pagePhotoRotates.push(thisPageRotates);

      // --- 字卡固定位置（不在 strip 內，疊在 cardsOverlay 上）---

      const cardColor = randomColor();
      // 旋轉幅度刻意縮小：原 ±6/±12 視覺上 era 像「飄」在 year 上方有距離感
      // 降到 ±3/±4 後兩者更服貼，配合 ERA_OFFSET_TOP=24 達成「貼緊」效果
      const yearRot = pickUniqueRotations(1, -3, 3)[0];
      const eraRot = pickUniqueRotations(1, -4, 4)[0];

      // === Year card（固定貼左下，nav col 右側；padding 視覺等同 desc）===
      // h3 預設 leading-base (1.5)：50px 字體 → 75px inline-box，多出 25px 空白被誤認成 padding；
      // 用 line-height:1 把 inline-box 收成 glyph 高度，padding 0.5rem 才是實際視覺 padding
      const yearCard = document.createElement('div');
      yearCard.className = 'timeline-card-inner absolute pointer-events-none';
      yearCard.style.cssText = `left:${safeLeft}px;bottom:${CARD_BOTTOM_PAD}px;padding:0.5rem 0.6em;background:${cardColor};width:max-content;transform-origin:bottom left;transform:rotate(${yearRot}deg);`;
      yearCard.innerHTML = `<h3 class="font-bold" style="line-height:1;">${item.year}</h3>`;
      cardsOverlay.appendChild(yearCard);

      // === Era badge（黑底白字，absolute 偏移於 year 左上角；獨立旋轉，比照 library 灰色矩形做法）===
      const eraBadge = document.createElement('div');
      eraBadge.className = 'timeline-card-inner bg-black text-white absolute pointer-events-none';
      eraBadge.style.cssText = `left:${safeLeft + ERA_OFFSET_LEFT}px;bottom:${CARD_BOTTOM_PAD}px;padding:0.4em 0.7em;width:max-content;transform-origin:bottom left;transform:translateY(calc(-100% - ${ERA_OFFSET_TOP}px)) rotate(${eraRot}deg);z-index:2;`;
      eraBadge.innerHTML = `<div class="text-p2 leading-base font-bold">${item.eraTitle} ${item.eraLabel}</div>`;
      cardsOverlay.appendChild(eraBadge);

      // === Desc cards（左對齊：左緣固定在 descLeftEdge；短文字縮窄、長文字 wrap 至 max-width）===
      const descriptions = item.descriptions || (item.description ? [item.description] : []);
      const descRots = pickUniqueRotations(descriptions.length, -DESC_MAX_ROT, DESC_MAX_ROT);
      const descEls = [];

      if (descriptions.length > 0) {
        const heights = descriptions.map(d =>
          measureCardHeight(`<div class="text-p2 leading-base font-bold">${d}</div>`, descRenderW)
        );

        // 從最後一張（newer）開始，bottom = CARD_BOTTOM_PAD；往上堆疊
        let cumBottom = CARD_BOTTOM_PAD;
        for (let i = descriptions.length - 1; i >= 0; i--) {
          const descEl = document.createElement('div');
          descEl.className = 'absolute pointer-events-none';
          descEl.style.left = `${descLeftEdge}px`;
          descEl.style.bottom = `${cumBottom}px`;
          descEl.style.transformOrigin = 'bottom left';
          descEl.style.transform = `rotate(${descRots[i] || 0}deg)`;
          // 舊的（i 小）z 高、在上層；新的（i 大）z 低、在下層
          descEl.style.zIndex = `${descriptions.length - i}`;

          const inner = document.createElement('div');
          inner.className = 'timeline-card-inner';
          // 左右 padding 對稱（0.6em）；width:max-content 讓短文字縮窄、長文字 wrap 至 max-width
          inner.style.cssText = `padding:0.5em 0.6em;background:${cardColor};width:max-content;max-width:${descRenderW}px;text-align:left;`;
          inner.innerHTML = `<div class="text-p2 leading-base font-bold">${descriptions[i]}</div>`;

          descEl.appendChild(inner);
          cardsOverlay.appendChild(descEl);
          descEls[i] = descEl;

          // Snug width：量測「實際最右側文字 pixel」把 width 從 max-content 換成 explicit px
          // 解決：max-content 對 block 子元素（h5/div）會 fill parent，框寬卡在 max-width 不會自然 shrink
          // 必須走 text node 量測才能拿到真實 wrap 後行寬
          const maxRight = measureTextRightOffset(inner);
          if (maxRight > 0) {
            const cs = getComputedStyle(inner);
            const padR = parseFloat(cs.paddingRight);
            // border-box (Tailwind preflight)：width = padL + content + padR
            // maxRight 已含 padL（文字從 inner 內 padL 開始），再加 padR = 總寬；+1 buffer 防 sub-px re-wrap
            inner.style.width = `${Math.ceil(maxRight + padR) + 1}px`;
          }

          cumBottom += heights[i] + descGap;
        }

        // 單卡 → 右對齊：避免短文字靠左留出大片右空白（多卡時最寬那張頂到右作為 anchor，短的靠左不突兀）
        if (descriptions.length === 1 && descEls[0]) {
          const onlyDescEl = descEls[0];
          onlyDescEl.style.left = '';
          onlyDescEl.style.right = `${containerPad}px`;
          // 改右錨後 transform-origin 也要換，rotation 才會以右下為 pivot（top-left 隨 rotation 上揚）
          onlyDescEl.style.transformOrigin = 'bottom right';
        }
      }

      pageData.push({ yearCard, eraBadge, descEls });
    });

    // 初始：除第 0 年外其他年份的字卡全部 clip-path 隱藏（疊在同一位置，靠 clip-path 切換）
    for (let i = 1; i < pageData.length; i++) {
      const pd = pageData[i];
      gsap.set(pd.yearCard, { clipPath: getClipStart(randomDirLR()) });
      gsap.set(pd.eraBadge, { clipPath: getClipStart(randomDirLR()) });
      pd.descEls.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
    }

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

      photo._raising = true;
      // 14 < cardsOverlay 的 z=15，確保 hover 圖片不會蓋過 era/year/desc 字卡
      photo.style.zIndex = '14';
      if (showTooltip) showTooltip();
    }

    function lowerPhoto(photo) {
      const rotateDiv = photo.querySelector('div');
      if (!rotateDiv) return;

      photo._raising = false;
      gsap.killTweensOf(rotateDiv);

      const dir = randomDir4();

      // Step 1: clip 收起（不做單色）
      gsap.to(rotateDiv, {
        clipPath: getClipStart(dir), duration: TIMING.photoClipDuration, ease: TIMING.photoClipEase,
        onComplete: () => {
          // Step 2: 降 z-index（此時不可見）
          photo.style.zIndex = photo._tlOrigZ;
          // Step 3: clip 展開
          gsap.to(rotateDiv, {
            clipPath: CLIP_END, duration: TIMING.photoClipDuration, ease: TIMING.photoClipEase,
          });
        }
      });
    }

    // Dim / undim 邊界照片（grayscale + screen tint 當年 accent 色）
    function dimEdgePhotos() {
      const accent = getCurrentAccentColor();
      getEdgePhotos().forEach(p => {
        const img = p.querySelector('img');
        const overlay = p.querySelector('.photo-screen-overlay');
        if (img) gsap.to(img, { filter: 'grayscale(100%)', duration: TIMING.dimDuration });
        if (overlay) {
          // 即時設色（不動畫）+ opacity 淡入；換年時 accent 變了，下次 dim 自動套新色
          overlay.style.background = accent;
          gsap.to(overlay, { opacity: 1, duration: TIMING.dimDuration });
        }
      });
    }
    function undimEdgePhotos() {
      getEdgePhotos().forEach(p => {
        const img = p.querySelector('img');
        const overlay = p.querySelector('.photo-screen-overlay');
        if (img) gsap.to(img, { filter: 'grayscale(0%)', duration: TIMING.dimDuration });
        if (overlay) gsap.to(overlay, { opacity: 0, duration: TIMING.dimDuration });
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

      // 首次出現才立即設文字；跨照片切換的文字在 clip-out 完成後再換，避免舊框露新字
      if (!tooltipVisible && photoTooltipText) photoTooltipText.innerHTML = photo._tlTooltip;

      // 無論首次或跨照片：新照片都提升 z-index
      raisePhoto(photo, () => {
        if (activeHover !== photo) return;
        if (!photoTooltip) return;

        if (tooltipVisible) {
          // 跨照片切換：clip-out 舊文字 → 換內容 → clip-in 新文字（每張描述都做 clip 動畫）
          // 位置由 mousemove handler 持續 follow cursor，這裡不重設 left/top
          gsap.killTweensOf(photoTooltip);
          gsap.to(photoTooltip, {
            clipPath: getClipStart(randomDirLR()),
            duration: TIMING.tooltipHideFastDuration,
            ease: TIMING.exitEase,
            onComplete: () => {
              if (activeHover !== photo) return;
              if (photoTooltipText) photoTooltipText.innerHTML = photo._tlTooltip;
              gsap.set(photoTooltip, {
                clipPath: getClipStart(randomDirLR()),
                rotation: randRot(),
                opacity: 1,
              });
              gsap.to(photoTooltip, {
                clipPath: CLIP_END,
                duration: TIMING.tooltipShowDuration,
                ease: TIMING.tooltipShowEase,
              });
            },
          });
          return;
        }

        // Tooltip 首次出現：以 cursor 入場位置為錨（之後 mousemove 跟著走）
        gsap.set(photoTooltip, {
          right: 'auto', bottom: 'auto',
          xPercent: 0, yPercent: 0,
          left: e.clientX + TOOLTIP_OFFSET_X, top: e.clientY + TOOLTIP_OFFSET_Y,
          rotation: randRot(),
          clipPath: getClipStart(randomDirLR()), opacity: 1,
        });
        gsap.to(photoTooltip, { clipPath: CLIP_END, duration: TIMING.tooltipShowDuration, ease: TIMING.tooltipShowEase });
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
        gsap.to(photoTooltip, {
          clipPath: getClipStart(randomDirLR()),
          duration: TIMING.tooltipHideDuration, ease: TIMING.exitEase,
          onComplete: () => gsap.set(photoTooltip, { opacity: 0 }),
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
          gsap.to(photoTooltip, {
            clipPath: getClipStart(randomDirLR()),
            duration: TIMING.tooltipHideFastDuration, ease: TIMING.exitEase,
            onComplete: () => gsap.set(photoTooltip, { opacity: 0 }),
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
    function getEdgeCursor(photo) {
      const role = getEdgeRole(photo);
      if (role === 'left') return cursorLeft;
      if (role === 'right') return cursorRight;
      return null;
    }
    function getCurrentAccentColor() {
      const pd = pageData[currentIndex];
      return pd?.yearCard?.style.background || ACCENT_COLORS[0];
    }
    function setArrowBg(cursor, color) {
      if (!cursor || typeof gsap === 'undefined') return;
      gsap.to(cursor, { backgroundColor: color, duration: TIMING.dimDuration, overwrite: 'auto' });
    }

    // 綁定事件到所有照片
    allPhotos.forEach(photo => {
      const isMiddle = photo._tlSlot >= 1 && photo._tlSlot <= 3;
      const isEdge = photo._tlSlot === 0 || photo._tlSlot === 4;
      // 1958（index 0）的 slot 0 是時間軸最左端，沒有上一年 → 不要箭頭、不要點擊
      const isLeftmostFirst = isEdge && photo._tlSlot === 0 && photo._tlYear === 0;

      photo.addEventListener('mouseenter', (e) => {
        if (!hoverEnabled) return; // 等 reveal 完成才允許 hover
        clearTimeout(hoverLeaveTimer);
        if (isMiddle) {
          enterMiddleHover(photo, e);
        } else if (isEdge) {
          enterEdgeHover(photo);
          const cursor = getEdgeCursor(photo);
          if (cursor) {
            setArrowBg(cursor, getCurrentAccentColor());
            showArrowCursor(cursor, e);
          }
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
        // edge photo：自訂箭頭 cursor follow
        if (isEdge) {
          const cursor = getEdgeCursor(photo);
          if (cursor && typeof gsap !== 'undefined') {
            gsap.set(cursor, { left: e.clientX - 30, top: e.clientY - 30, overwrite: 'auto' });
          }
        }
      });

      photo.addEventListener('mouseleave', () => {
        hoverLeaveTimer = setTimeout(() => {
          if (activeHover === photo) leaveAllHover();
        }, TIMING.leaveDebounceMs);
        if (isEdge) {
          const cursor = getEdgeCursor(photo);
          if (cursor) scheduleHideArrowCursor(cursor);
          // 箭頭顏色不重置 → 下次顯示保持 accent 色（不回黑）
        }
      });

      // 邊界照片可點擊：行為同 nav zone（左 → 上一年、右 → 下一年/重置）；最左端不可點
      if (isEdge && !isLeftmostFirst) {
        photo.style.cursor = 'none'; // 隱藏系統 cursor，由自訂箭頭取代
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

    // --- 導航 ---
    let currentIndex = 0;
    let isTransitioning = false;

    function updateNavZones() {
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
      if (isTransitioning || index < 0 || index >= items.length) return;
      isTransitioning = true;
      hoverEnabled = false;

      // 切換前：若有 activeHover 殘留，先清掉（避免指向舊頁照片）
      if (activeHover) {
        gsap.killTweensOf(activeHover.querySelector('div'));
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._raising = false;
        activeHover = null;
        clearTimeout(hoverLeaveTimer);
        if (photoTooltip) gsap.set(photoTooltip, { opacity: 0 });
        undimEdgePhotos();
      }

      const prevIndex = currentIndex;
      currentIndex = index;
      updateNavZones();

      const current = pageData[prevIndex];
      const target = pageData[index];

      // Step 1: clip-out 當前年份的字卡（year/era/desc 不隨 strip 移動，原地用 clip-path 切換）
      const currentEls = [current.yearCard, current.eraBadge, ...current.descEls];
      currentEls.forEach(el => {
        gsap.to(el, {
          clipPath: getClipStart(randomDirLR()),
          duration: TIMING.exitDuration,
          ease: TIMING.exitEase,
        });
      });

      // Step 2: 確保目標字卡是隱藏狀態（buildStrip 已經設過，但保險）
      const targetEls = [target.yearCard, target.eraBadge, ...target.descEls];
      targetEls.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));

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

          gsap.to(target.yearCard, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase });
          gsap.to(target.eraBadge, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: TIMING.stagger });
          target.descEls.forEach((el, i) => {
            gsap.to(el, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: TIMING.stagger * (i + 2) });
          });

          isTransitioning = false;
          // reveal 動畫最久 = revealDuration + 5 * stagger ≈ hoverEnableDelay，之後才開放 hover
          gsap.delayedCall(TIMING.hoverEnableDelay, () => { hoverEnabled = true; });
        },
      });
    }

    // 重置 timeline：清空最後一年 → 回到第一年
    function resetTimeline() {
      if (isTransitioning) return;
      isTransitioning = true;
      hoverEnabled = false;

      // 清掉殘留 hover
      if (activeHover) {
        gsap.killTweensOf(activeHover.querySelector('div'));
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._raising = false;
        activeHover = null;
        clearTimeout(hoverLeaveTimer);
        if (photoTooltip) gsap.set(photoTooltip, { opacity: 0 });
        undimEdgePhotos();
      }

      const lastIdx = items.length - 1;

      // Step 1: 用 clip-path 清空當前畫面（最後一年的照片 + 字卡；跳過邊界 slot）
      const lastRotates = pagePhotoRotates[lastIdx] || [];
      const lastPage = pageData[lastIdx];
      const clearEls = [
        ...lastRotates.filter(r => !isEdgeSlot(r.slotIndex)).map(r => r.rotateDiv),
        lastPage.yearCard,
        lastPage.eraBadge,
        ...lastPage.descEls,
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
            gsap.set(pd.yearCard, { clipPath: getClipStart(randomDirLR()) });
            gsap.set(pd.eraBadge, { clipPath: getClipStart(randomDirLR()) });
            pd.descEls.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
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
          const firstCards = [firstPageData.yearCard, firstPageData.eraBadge, ...firstPageData.descEls];
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

    setupCursorNav(navLeft, cursorLeft, () => {
      if (currentIndex > 0) goTo(currentIndex - 1);
    }, getCurrentAccentColor);
    setupCursorNav(navRight, cursorRight, () => {
      if (currentIndex < items.length - 1) {
        goTo(currentIndex + 1);
      } else {
        // 最後一年 → 重置 timeline
        resetTimeline();
      }
    }, getCurrentAccentColor);

    updateNavZones();

    // --- 第一年初始 clip-path reveal（邊界 slot 不做 clip，保持可見）---
    if (typeof ScrollTrigger !== 'undefined') {
      const firstRotates = (pagePhotoRotates[0] || [])
        .filter(r => !isEdgeSlot(r.slotIndex))
        .map(r => r.rotateDiv);
      const firstPageData = pageData[0];
      const firstCards = firstPageData
        ? [firstPageData.yearCard, firstPageData.eraBadge, ...firstPageData.descEls]
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
  }
}
