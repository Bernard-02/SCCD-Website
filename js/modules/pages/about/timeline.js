// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
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

    // 導航 state（提到 forEach 前宣告：getEdgeRole 在 forEach 內同步讀 currentIndex，
    // 若還在 TDZ 會 ReferenceError 中斷整個 buildStrip → nav click handler 沒綁上）
    let currentIndex = 0;
    let isTransitioning = false;

    // 固定位置（每年同 pos，隨機旋轉）
    const CARD_BOTTOM_PAD = 60;       // 距 viewport 底部
    const CARD_MAIN_ROT = 1;          // 主卡最大旋轉角度
    const CARD_GAP = 28;              // 同年多張主卡之間的「視覺」垂直間距（chip 高度會額外加上去防重疊）
    const BLOCK_GAP = 18;             // 同一張卡內，多筆 description 之間的垂直間距
    const GRID_GAP_PX = 24;           // 主卡 grid 左右 col 中間 gap（= md spacing token）
    const CHIP_GAP = 4;               // BFA/MDES chip 緊貼卡頂上方的小 gap（同 courses-bfa-label）
    const CHIP_OFFSET_LEFT = -12;     // chip 相對主卡 left 邊的水平偏移（同 courses-bfa-label）
    const ERA_OFFSET_TOP = 24;        // era 底部相對「最頂主卡頂部」的距離（隨主卡走）
    const ERA_RANDOM_LEFT_SHIFT = 60; // era 在主卡左上區域允許的隨機水平偏移範圍（0~N px）

    // 每年共用的位置常數（不變於 forEach loop）
    const safeLeft = Math.max(PADDING, containerPad + 14 * vw);
    // 主卡靠右錨定：MAIN_CARD_RIGHT 越小 = 主卡越靠右
    // 從 12vw+40 縮到 6vw+40 讓主卡視覺往右推 ~6vw
    const safeRight = pageW - 6 * vw - 40;
    const MAIN_CARD_W = Math.min(680, safeRight - safeLeft);
    const MAIN_CARD_RIGHT = pageW - safeRight; // 主卡 right 偏移（從 viewport 右緣算）
    const MAIN_CARD_LEFT = pageW - MAIN_CARD_RIGHT - MAIN_CARD_W; // 主卡 left 邊（用於 chip/era 對齊）

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
        photo.style.cssText = `position:absolute; width:${photoVW}vw; left:${photoLeft}px; top:${topVH}vh; z-index:${photoZs[p]};`;

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
      const eraRot = pickUniqueRotations(1, -4, 4)[0];

      // === Group descriptions by leading <h5>...</h5> token ===
      // h5 開頭 → 獨立一張卡（chip = h5 文字）；無 h5 → 接續上一張卡作為其 description
      // 即同年「BFA + MDES」會拆成 2 張獨立主卡（user 指定 chip 在卡外左上角，每張卡有自己的 chip）
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

      // === Build N 張主卡（從下往上堆疊；year 只放第一張[最下]，其他張左 col 空白對齊）===
      const mainCards = [];
      const chipEls = [];
      let cumBottom = CARD_BOTTOM_PAD;

      // 倒序建構（i=last 在底、i=0 在頂），但 cardsData[0] 視覺上仍是「主要那張」放底
      // → 改順序：建構順序 = cardsData 順序，但 bottom 從下往上累加（cardsData[0] 在最下）
      cardsData.forEach((card, ci) => {
        const mainRot = pickUniqueRotations(1, -CARD_MAIN_ROT, CARD_MAIN_ROT)[0] || 0;
        const isFirstCard = ci === 0; // 最底那張 = 顯示 year 的卡

        const mainCard = document.createElement('div');
        mainCard.className = 'timeline-card-inner absolute pointer-events-none';
        // width:max-content + max-width 讓內容 fit，右 padding 才會視覺對稱
        mainCard.style.cssText = `right:${MAIN_CARD_RIGHT}px;bottom:${cumBottom}px;padding:0.6rem 0.8rem;background:${cardColor};width:max-content;max-width:${MAIN_CARD_W}px;transform-origin:bottom right;transform:rotate(${mainRot}deg);`;

        // items 多筆用 BLOCK_GAP 行間距分開
        const itemsHtml = card.items.map((it, ii) =>
          `<div${ii > 0 ? ` style="margin-top:${BLOCK_GAP}px;"` : ''}>${it}</div>`
        ).join('');

        // grid: auto 1fr — year 在第一張卡才顯示；後續卡片 year col 留空（保持對齊）
        // 沒有 year（後續卡）也要保留 left col 才能讓右 col 文字落在跟第一張一樣的位置
        const yearHtml = isFirstCard
          ? `<h3 class="font-bold" style="line-height:1;">${item.year}</h3>`
          : '';

        mainCard.innerHTML = `
          <div style="display:grid;grid-template-columns:auto 1fr;gap:${GRID_GAP_PX}px;align-items:start;">
            <div style="min-width:${isFirstCard ? 'auto' : '0'};">${yearHtml}</div>
            <div class="text-p2 leading-base font-bold">${itemsHtml}</div>
          </div>
        `;
        cardsOverlay.appendChild(mainCard);

        // === Snug width：兩 pass 量測（先 wrap-限寬再 snug）===
        // 問題：max-content + grid `auto 1fr` 下 1fr 把右 col 撐到 max-width，量出 naturalW ≈ MAIN_CARD_W
        // → 內容已 wrap 但量不到「實際最右文字寬」
        // Pass 1: 切 `auto max-content` 拿無 wrap 寬度 W1（內容若 wrap 必超過 max-width）
        // Pass 2: 把右 col max-width 鎖在 MAIN_CARD_W 內，讓 grid wrap，再用 TreeWalker 量實際最右文字 pixel
        const gridEl = mainCard.firstElementChild;
        const rightCol = gridEl.children[1];
        const cs = getComputedStyle(mainCard);
        const padL = parseFloat(cs.paddingLeft);
        const padR = parseFloat(cs.paddingRight);
        const leftColW = gridEl.children[0].getBoundingClientRect().width;
        const rightColMaxW = MAIN_CARD_W - padL - padR - GRID_GAP_PX - leftColW;

        // 鎖右 col 寬度上限讓文字 wrap
        rightCol.style.maxWidth = `${rightColMaxW}px`;

        // 量「實際最右文字 pixel」相對 rightCol 左緣的偏移 = TreeWalker 走 text node
        const rootLeft = rightCol.getBoundingClientRect().left;
        let maxRight = 0;
        const walker = document.createTreeWalker(rightCol, NodeFilter.SHOW_TEXT);
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
        // mainCard 總寬 = padL + leftColW + gap + 實際 rightCol 內容寬 + padR
        const snugW = padL + leftColW + GRID_GAP_PX + Math.ceil(maxRight) + padR + 1;
        mainCard.style.width = `${Math.min(snugW, MAIN_CARD_W)}px`;

        // === Chip（卡外左上角，緊貼卡頂上方 — 走 courses-bfa-label pattern）===
        // chip 放 cardsOverlay（不放 mainCard 內，因為 mainCard 之後會套 clip-path 會裁掉外凸子元素）
        // 同色（cardColor）+ bottom = 此卡頂部 + 小 gap，視覺上像 stick label 黏在卡片上
        // 加 .timeline-card-inner class 跟 era badge padding 規則一致（typography whitelist 也帶到）
        let chipEl = null;
        if (card.chip) {
          const cardTopBottom = cumBottom + mainCard.offsetHeight + CHIP_GAP;
          chipEl = document.createElement('div');
          chipEl.className = 'timeline-card-inner pointer-events-none absolute';
          chipEl.style.cssText = `left:${MAIN_CARD_LEFT + CHIP_OFFSET_LEFT}px;bottom:${cardTopBottom}px;padding:0.4em 0.7em;background:${cardColor};width:max-content;transform-origin:bottom left;transform:rotate(${pickUniqueRotations(1, -3, 3)[0] || 0}deg);z-index:3;`;
          chipEl.innerHTML = `<div class="text-p2 leading-base font-bold">${card.chip}</div>`;
          cardsOverlay.appendChild(chipEl);
        }

        mainCards.push(mainCard);
        chipEls.push(chipEl);

        // 累加：下一張卡的 bottom = 此卡 top + chip 高度 + CHIP_GAP + CARD_GAP
        // chip 在卡頂上方佔 chipH + CHIP_GAP 空間；下一張卡若也有 chip，需從這之上再加 CARD_GAP 留視覺呼吸
        // chipEl 可能 null（無 chip 那卡）→ 退化為 0
        const chipOccupy = chipEl ? chipEl.offsetHeight + CHIP_GAP : 0;
        cumBottom += mainCard.offsetHeight + chipOccupy + CARD_GAP;
      });

      pageData.push({ mainCards, chipEls, eraKey: `${item.eraTitle}|${item.eraLabel}`, eraTitle: item.eraTitle, eraLabel: item.eraLabel });
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

    // 同年「所有主卡 + 對應 chip」當一組元素處理（chip 在 cardsOverlay 跟主卡分離，需個別套 clip-path）
    function getCardEls(pd) {
      const out = [...pd.mainCards];
      pd.chipEls.forEach(c => { if (c) out.push(c); });
      return out;
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

      photo._raising = true;
      // 14 < cardsOverlay 的 z=15，確保 hover 圖片不會蓋過 era/year/desc 字卡
      photo.style.zIndex = '14';
      if (showTooltip) showTooltip();
    }

    function lowerPhoto(photo) {
      photo._raising = false;
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
        const rd = activeHover.querySelector('div');
        gsap.killTweensOf(rd);
        if (rd) gsap.set(rd, { clipPath: CLIP_END });
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._raising = false;
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
      if (isTransitioning) return;
      isTransitioning = true;
      hoverEnabled = false;

      // 清掉殘留 hover
      if (activeHover) {
        const rd = activeHover.querySelector('div');
        gsap.killTweensOf(rd);
        if (rd) gsap.set(rd, { clipPath: CLIP_END });
        activeHover.style.zIndex = activeHover._tlOrigZ;
        activeHover._raising = false;
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
  }
}
