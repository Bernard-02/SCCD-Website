/**
 * Timeline Module (About Page)
 * 卷軸概念：每年 5 張照片，第 1 張 = 上一年第 5 張，第 5 張 = 下一年第 1 張
 * 100vh 分成 5 個 bar（各 20vh），每張圖片佔一個 bar
 * 照片大小 15~40vw，clip-path 只做一次
 */

export function initTimeline() {
  const area = document.getElementById('timeline-area');
  const strip = document.getElementById('timeline-strip');
  const eraContainer = document.getElementById('timeline-era-container');
  const navLeft = document.getElementById('timeline-nav-left');
  const navRight = document.getElementById('timeline-nav-right');
  const cursorLeft = document.getElementById('timeline-cursor-left');
  const cursorRight = document.getElementById('timeline-cursor-right');
  const photoTooltip = document.getElementById('timeline-photo-tooltip');
  const photoTooltipText = document.getElementById('timeline-photo-tooltip-text');

  if (!area || !strip || !navLeft || !navRight) return;

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

  function rectsOverlap(a, b, pad = 40) {
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
             a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
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
  function setupCursorNav(zone, cursor, onClick) {
    if (!cursor || typeof gsap === 'undefined') {
      zone.addEventListener('click', onClick);
      return;
    }
    zone.addEventListener('mousemove', (e) => {
      gsap.to(cursor, { left: e.clientX + 6, top: e.clientY + 6, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    });
    zone.addEventListener('mouseenter', (e) => {
      gsap.set(cursor, {
        left: e.clientX + 6, top: e.clientY + 6,
        scale: 1, rotation: randRot(),
        clipPath: getClipStart(randomDirLR()), opacity: 1,
      });
      gsap.to(cursor, { clipPath: CLIP_END, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
    });
    zone.addEventListener('mouseleave', () => {
      gsap.to(cursor, {
        clipPath: getClipStart(randomDirLR()),
        duration: 0.2, ease: 'power2.in', overwrite: true,
        onComplete: () => gsap.set(cursor, { opacity: 0 }),
      });
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
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 80;
    const totalW = items.length * pageW;
    const PADDING = 80;

    strip.style.width = `${totalW}px`;
    strip.style.height = '100%';

    const vw = pageW / 100;

    // 照片大小 range（vw）
    const PHOTO_MIN_VW = 30;
    const PHOTO_MAX_VW = 50;

    // --- Y 軸：100vh 扣上下 padding 後分 5 個 bar ---
    const yPadVH = 8; // 上下各 8vh 的 padding
    const usableH_VH = 100 - yPadVH * 2; // 84vh
    const BAR_H_VH = usableH_VH / 5;     // 每個 bar ≈ 16.8vh

    let buildingEra = null;
    const pageData = [];
    const eraCards = {};
    const pagePhotoRotates = [];
    const revealedPages = new Set();

    items.forEach((item, index) => {
      const ox = index * pageW;
      const isFirst = index === 0;
      const isLast = index === items.length - 1;

      // --- 5 張照片：先計算所有位置，確保彼此觸碰，再建 DOM ---
      const photoRots = pickUniqueRotations(5, -4, 4);
      const photoZs = shuffle([1, 2, 3, 4, 5]);

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
        photo._tlTooltip = `<strong>${item.year}</strong> — ${item.eraTitle} ${item.eraLabel}<br>${(item.descriptions || [item.description || '']).join('<br>')}`;

        thisPageRotates.push({ rotateDiv, slotIndex: p });
      }

      pagePhotoRotates.push(thisPageRotates);

      // --- 字卡安全區域 ---
      const containerPad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--container-padding')) || 40;
      const safeTop = headerH + 40;
      const safeLeft = Math.max(PADDING, containerPad + 14 * vw);
      const safeRight = pageW - 12 * vw - 40;
      const safeBottom = pageH - 60;

      // --- Era 字卡（也要在字卡安全範圍內）---
      let currentEraRect = null;

      // 先算字卡安全區（era 也需要用）
      const rotPad = 30;
      const cardSafeLeft = safeLeft + rotPad;
      const cardSafeRight = safeRight - rotPad;
      const cardSafeTop = safeTop + rotPad;
      const cardSafeBottom = safeBottom - rotPad;

      if (item.eraTitle !== buildingEra) {
        buildingEra = item.eraTitle;

        const eraW = 250, eraH = 50;
        const eraSafeH = cardSafeBottom - cardSafeTop;
        const useBottom = Math.random() < 0.5;
        const eraMinY = useBottom ? cardSafeTop + eraSafeH * 0.8 : cardSafeTop;
        const eraMaxY = useBottom ? cardSafeBottom - eraH : cardSafeTop + eraSafeH * 0.18;

        const ex = cardSafeLeft + Math.random() * Math.max(0, cardSafeRight - eraW - cardSafeLeft);
        const ey = eraMinY + Math.random() * Math.max(0, eraMaxY - eraMinY);
        const eraPos = { x: ex, y: ey, w: eraW, h: eraH };

        const eraRot = pickUniqueRotations(1, -6, 6)[0];
        const eraEl = createCard(
          `<h5 class="font-bold">${item.eraTitle} Era<br>${item.eraLabel}時期</h5>`,
          eraPos, eraRot, null, 'max-content', true
        );
        if (Object.keys(eraCards).length > 0) eraEl.style.display = 'none';
        eraContainer.appendChild(eraEl);
        eraCards[item.eraTitle] = eraEl;
        // 碰撞矩形加大（考慮旋轉 + 額外間距），防止字卡被 era 擋住
        currentEraRect = { x: eraPos.x - 20, y: eraPos.y - 20, w: eraW + 40, h: eraH + 40 };
      }

      if (!currentEraRect) {
        const el = eraCards[item.eraTitle];
        if (el) {
          currentEraRect = {
            x: (parseFloat(el.style.left) || 0) - 20,
            y: (parseFloat(el.style.top) || 0) - 20,
            w: 250 + 40, h: 50 + 40
          };
        }
      }

      // --- 年份/說明字卡 ---
      const page = document.createElement('div');
      page.className = 'timeline-page absolute top-0';
      page.style.left = `${ox}px`;
      page.style.width = `${pageW}px`;
      page.style.height = '100%';
      page.style.clipPath = 'inset(-20% 0)';
      page.style.pointerEvents = 'none';
      page.style.zIndex = '10'; // 字卡在照片（z-index 1~5）上方

      const yearW = 200, yearH = 80;
      const descW = Math.min(450, cardSafeRight - cardSafeLeft - 20);
      const descH = 180; // 加大碰撞高度，避免長文字互相重疊

      const placed = [];
      if (currentEraRect) placed.push(currentEraRect);

      let yearPos = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        const x = cardSafeLeft + Math.random() * Math.max(0, (cardSafeRight - cardSafeLeft) * 0.5 - yearW);
        const y = cardSafeTop + Math.random() * Math.max(0, (cardSafeBottom - cardSafeTop) * 0.5 - yearH);
        const rect = { x, y, w: yearW, h: yearH };
        if (placed.every(p => !rectsOverlap(rect, p))) { yearPos = rect; break; }
      }
      if (!yearPos) yearPos = { x: safeLeft, y: safeTop, w: yearW, h: yearH };
      placed.push(yearPos);

      const descriptions = item.descriptions || (item.description ? [item.description] : []);
      const totalCards = 1 + descriptions.length;
      const cardRots = pickUniqueRotations(totalCards, -6, 6);
      const cardColor = randomColor();

      const yearEl = createCard(
        `<h2 class="font-bold">${item.year}</h2>`,
        yearPos, cardRots[0], cardColor, 'max-content'
      );
      page.appendChild(yearEl);

      const descEls = [];
      descriptions.forEach((desc, di) => {
        let descPos = null;
        for (let attempt = 0; attempt < 80; attempt++) {
          const x = cardSafeLeft + Math.random() * Math.max(0, cardSafeRight - descW - cardSafeLeft);
          const y = cardSafeTop + Math.random() * Math.max(0, cardSafeBottom - descH - cardSafeTop);
          const rect = { x, y, w: descW, h: descH };
          if (placed.every(p => !rectsOverlap(rect, p))) { descPos = rect; break; }
        }
        if (!descPos) {
          const last = placed[placed.length - 1];
          descPos = {
            x: Math.min(last.x, cardSafeRight - descW),
            y: Math.min(last.y + last.h + 20, cardSafeBottom - descH),
            w: descW, h: descH
          };
        }
        placed.push(descPos);

        const descEl = createCard(
          `<div class="text-p2 leading-base font-bold">${desc}</div>`,
          descPos, cardRots[1 + di] || cardRots[0], cardColor
        );
        page.appendChild(descEl);
        descEls.push(descEl);
      });

      strip.appendChild(page);
      pageData.push({ yearEl, descEls, eraTitle: item.eraTitle });
    });

    // --- 統一 Photo Hover 系統 ---
    const allPhotos = Array.from(strip.querySelectorAll('.timeline-photo'));
    let activeHover = null;      // 當前 hover 的 photo element
    let hoverLeaveTimer = null;  // 延遲 leave，讓跨照片 hover 順暢

    // 收集當前頁面的邊界照片（slot 0,4）供 dim 用
    function getEdgePhotos() {
      return allPhotos.filter(p => p._tlSlot === 0 || p._tlSlot === 4);
    }
    // hover 照片：clip 收起 → z-index → clip 展開
    // 中斷時 smooth 反轉回去
    function raisePhoto(photo, showTooltip) {
      const rotateDiv = photo.querySelector('div');
      if (!rotateDiv) return;

      gsap.killTweensOf(rotateDiv);

      const dir = randomDir4();
      photo._raising = true;

      // 單色 + clip 收起同時進行
      dimPhoto(photo);
      gsap.to(rotateDiv, {
        clipPath: getClipStart(dir), duration: 0.5, ease: 'power2.inOut',
        onComplete: () => {
          if (!photo._raising) return;
          photo.style.zIndex = '20';
          // 恢復原色 + clip 展開 + tooltip 同時出現
          undimPhoto(photo);
          if (showTooltip) showTooltip();
          gsap.to(rotateDiv, {
            clipPath: CLIP_END, duration: 0.5, ease: 'power2.inOut',
          });
        }
      });
    }

    function lowerPhoto(photo) {
      const rotateDiv = photo.querySelector('div');
      if (!rotateDiv) return;

      photo._raising = false;
      gsap.killTweensOf(rotateDiv);

      const dir = randomDir4();

      // Step 1: clip 收起 + 單色
      dimPhoto(photo);
      gsap.to(rotateDiv, {
        clipPath: getClipStart(dir), duration: 0.5, ease: 'power2.inOut',
        onComplete: () => {
          // Step 2: 降 z-index（此時不可見）
          photo.style.zIndex = photo._tlOrigZ;
          // Step 3: 恢復原色 + clip 展開
          undimPhoto(photo);
          gsap.to(rotateDiv, {
            clipPath: CLIP_END, duration: 0.5, ease: 'power2.inOut',
          });
        }
      });
    }

    // Dim / undim 邊界照片
    function dimEdgePhotos() {
      const pd = pageData[currentIndex];
      const color = pd?.yearEl?.querySelector('.timeline-card-inner')?.style.background || ACCENT_COLORS[0];
      getEdgePhotos().forEach(p => {
        // 圖片灰階（同 faculty card hover）
        const img = p.querySelector('img');
        if (img) gsap.to(img, { filter: 'grayscale(100%)', duration: 0.3 });
        // screen blend overlay（同 faculty card ::after）
        if (!p._screenOverlay) {
          const overlay = document.createElement('div');
          overlay.style.cssText = `position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; opacity:0; z-index:1;`;
          p.querySelector('div').appendChild(overlay); // 加在 rotateDiv 裡
          p._screenOverlay = overlay;
        }
        p._screenOverlay.style.background = color;
        gsap.to(p._screenOverlay, { opacity: 1, duration: 0.3 });
      });
    }
    function undimEdgePhotos() {
      getEdgePhotos().forEach(p => {
        const img = p.querySelector('img');
        if (img) gsap.to(img, { filter: 'grayscale(0%)', duration: 0.3 });
        if (p._screenOverlay) gsap.to(p._screenOverlay, { opacity: 0, duration: 0.3 });
      });
    }

    // 單張照片做單色處理
    function dimPhoto(photo) {
      const pd = pageData[currentIndex];
      const color = pd?.yearEl?.querySelector('.timeline-card-inner')?.style.background || ACCENT_COLORS[0];
      const img = photo.querySelector('img');
      if (img) gsap.to(img, { filter: 'grayscale(100%)', duration: 0.3 });
      if (!photo._screenOverlay) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; opacity:0; z-index:1;`;
        photo.querySelector('div').appendChild(overlay);
        photo._screenOverlay = overlay;
      }
      photo._screenOverlay.style.background = color;
      gsap.to(photo._screenOverlay, { opacity: 1, duration: 0.3 });
    }

    function undimPhoto(photo) {
      const img = photo.querySelector('img');
      if (img) gsap.to(img, { filter: 'grayscale(0%)', duration: 0.3 });
      if (photo._screenOverlay) gsap.to(photo._screenOverlay, { opacity: 0, duration: 0.3 });
    }

    // 進入 hover 狀態（中間照片 slot 1~3）
    function enterMiddleHover(photo, e) {
      const fromOtherPhoto = activeHover && activeHover !== photo;

      if (fromOtherPhoto) {
        lowerPhoto(activeHover);
      }
      activeHover = photo;

      if (photoTooltipText) photoTooltipText.innerHTML = photo._tlTooltip;

      if (fromOtherPhoto) {
        // 從另一張照片過來 → 前一張直接恢復（不做動畫），新照片直接提升
        photo.style.zIndex = '20';
        photo._raising = true; // 標記為已提升，離開時才會做 reverse
        if (photoTooltip) {
          gsap.to(photoTooltip, { left: e.clientX + 12, top: e.clientY + 12, duration: 0.2, overwrite: 'auto' });
        }
      } else {
        // 首次 hover → 完整 clip 動畫 + tooltip
        raisePhoto(photo, () => {
          if (activeHover !== photo) return;
          if (photoTooltip) {
            gsap.set(photoTooltip, {
              left: e.clientX + 12, top: e.clientY + 12,
              rotation: randRot(),
              clipPath: getClipStart(randomDirLR()), opacity: 1,
            });
            gsap.to(photoTooltip, { clipPath: CLIP_END, duration: 0.5, ease: 'power2.inOut' });
          }
        });
        dimEdgePhotos();
      }
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
          duration: 0.2, ease: 'power2.in',
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
            duration: 0.15, ease: 'power2.in',
            onComplete: () => gsap.set(photoTooltip, { opacity: 0 }),
          });
        }
        undimEdgePhotos();
      }

      activeHover = photo;
      // 不改單色、不改 z-index
    }

    // 綁定事件到所有照片
    allPhotos.forEach(photo => {
      const isMiddle = photo._tlSlot >= 1 && photo._tlSlot <= 3;
      const isEdge = photo._tlSlot === 0 || photo._tlSlot === 4;

      photo.addEventListener('mouseenter', (e) => {
        clearTimeout(hoverLeaveTimer);
        if (isMiddle) {
          enterMiddleHover(photo, e);
        } else if (isEdge) {
          enterEdgeHover(photo);
        }
      });

      photo.addEventListener('mousemove', (e) => {
        if (isMiddle && photoTooltip && activeHover === photo) {
          gsap.to(photoTooltip, { left: e.clientX + 12, top: e.clientY + 12, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
        }
      });

      photo.addEventListener('mouseleave', () => {
        hoverLeaveTimer = setTimeout(() => {
          if (activeHover === photo) leaveAllHover();
        }, 50);
      });

      // 邊界照片 cursor default，不做任何互動
      if (isEdge) {
        photo.style.cursor = 'default';
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

    // 設定照片 clip-path 隱藏（每張隨機四方向）
    function hidePagePhotos(index) {
      if (revealedPages.has(index)) return;
      const rotates = pagePhotoRotates[index];
      if (!rotates) return;
      rotates.forEach(({ rotateDiv, slotIndex }) => {
        if (index > 0 && slotIndex === 0) return;
        gsap.set(rotateDiv, { clipPath: getClipStart(randomDir4()) });
      });
    }

    // 照片 clip-path reveal
    function revealPagePhotos(index) {
      if (revealedPages.has(index)) return;
      revealedPages.add(index);
      const rotates = pagePhotoRotates[index];
      if (!rotates) return;
      rotates.forEach(({ rotateDiv, slotIndex }, i) => {
        if (index > 0 && slotIndex === 0) return;
        gsap.to(rotateDiv, {
          clipPath: CLIP_END, duration: 1.0, ease: 'power3.out', delay: i * 0.08
        });
      });
    }

    function goTo(index) {
      if (isTransitioning || index < 0 || index >= items.length) return;
      isTransitioning = true;

      const prevIndex = currentIndex;
      currentIndex = index;
      updateNavZones();

      const target = pageData[index];
      const prevEra = pageData[prevIndex]?.eraTitle;
      const isEraChange = target.eraTitle !== prevEra;

      // 移動前：先隱藏目標頁的照片（隨機四方向）和字卡（隨機左右）
      hidePagePhotos(index);
      gsap.set(target.yearEl, { clipPath: getClipStart(randomDirLR()) });
      target.descEls.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));

      if (isEraChange) {
        const oldEraEl = eraCards[prevEra];
        const newEraEl = eraCards[target.eraTitle];
        // 舊 era clip-path 退場
        if (oldEraEl) {
          gsap.to(oldEraEl, {
            clipPath: getClipStart(randomDirLR()),
            duration: 0.4, ease: 'power2.in',
            onComplete: () => { oldEraEl.style.display = 'none'; }
          });
        }
        if (newEraEl) {
          newEraEl.style.display = '';
          gsap.set(newEraEl, { clipPath: getClipStart(randomDirLR()) });
        }
      }

      gsap.to(strip, {
        left: -index * pageW,
        duration: 0.8,
        ease: 'power2.inOut',
        onComplete: () => {
          // 到位後 reveal
          revealPagePhotos(index);

          gsap.to(target.yearEl, { clipPath: CLIP_END, duration: 0.6, ease: 'power3.out' });
          target.descEls.forEach((el, i) => {
            gsap.to(el, { clipPath: CLIP_END, duration: 0.6, ease: 'power3.out', delay: 0.08 * (i + 1) });
          });

          if (isEraChange) {
            const newEraEl = eraCards[target.eraTitle];
            if (newEraEl) {
              gsap.to(newEraEl, { clipPath: CLIP_END, duration: 0.6, ease: 'power3.out', delay: 0.05 });
            }
          }
          isTransitioning = false;
        },
      });
    }

    // 重置 timeline：清空最後一年 → 回到第一年
    function resetTimeline() {
      if (isTransitioning) return;
      isTransitioning = true;

      const lastIdx = items.length - 1;

      // Step 1: 用 clip-path 清空當前畫面（最後一年的所有照片 + 字卡 + era）
      const lastRotates = pagePhotoRotates[lastIdx] || [];
      const lastPage = pageData[lastIdx];
      const clearEls = [
        ...lastRotates.map(r => r.rotateDiv),
        lastPage.yearEl,
        ...lastPage.descEls,
      ];
      // 也清掉 era
      const lastEraEl = eraCards[lastPage.eraTitle];
      if (lastEraEl) clearEls.push(lastEraEl);

      // Step 1: clip-path 收起最後一年（用 timeline 確保全部完成後才繼續）
      const exitTl = gsap.timeline({
        onComplete: () => {
          // Step 2: 隱藏所有年份的照片和字卡
          pagePhotoRotates.forEach(rotates => {
            rotates.forEach(({ rotateDiv }) => {
              gsap.set(rotateDiv, { clipPath: getClipStart(randomDir4()) });
            });
          });
          pageData.forEach(pd => {
            gsap.set(pd.yearEl, { clipPath: getClipStart(randomDirLR()) });
            pd.descEls.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
          });

          // Step 3: 重置狀態
          revealedPages.clear();
          currentIndex = 0;
          updateNavZones();

          Object.values(eraCards).forEach(el => {
            el.style.display = 'none';
            gsap.set(el, { clipPath: getClipStart(randomDirLR()) });
          });
          const firstEraKey = Object.keys(eraCards)[0];
          if (firstEraKey && eraCards[firstEraKey]) {
            eraCards[firstEraKey].style.display = '';
          }

          // Step 4: 移回第一年
          gsap.set(strip, { left: 0 });

          // Step 5: 準備第一年 reveal
          const firstRotates = (pagePhotoRotates[0] || []).map(r => r.rotateDiv);
          const firstPageData = pageData[0];
          const firstCards = [firstPageData.yearEl, ...firstPageData.descEls];
          const allFirstEls = [...firstRotates, ...firstCards];
          if (firstEraKey && eraCards[firstEraKey]) allFirstEls.push(eraCards[firstEraKey]);

          firstRotates.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDir4()) }));
          firstCards.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
          if (firstEraKey && eraCards[firstEraKey]) {
            gsap.set(eraCards[firstEraKey], { clipPath: getClipStart(randomDirLR()) });
          }

          // Step 6: Reveal 第一年
          allFirstEls.forEach((el, i) => {
            gsap.to(el, {
              clipPath: CLIP_END, duration: 1.0, ease: 'power3.out', delay: 0.3 + i * 0.08,
            });
          });
          revealedPages.add(0);
          isTransitioning = false;
        }
      });

      // 把每個元素的退場動畫加到 timeline（全部在 time=0 同時開始）
      clearEls.forEach(el => {
        exitTl.to(el, {
          clipPath: getClipStart(randomDir4()),
          duration: 0.5,
          ease: 'power2.in',
        }, 0); // 全部在 time=0 同時開始
      });
    }

    setupCursorNav(navLeft, cursorLeft, () => {
      if (currentIndex > 0) goTo(currentIndex - 1);
    });
    setupCursorNav(navRight, cursorRight, () => {
      if (currentIndex < items.length - 1) {
        goTo(currentIndex + 1);
      } else {
        // 最後一年 → 重置 timeline
        resetTimeline();
      }
    });

    updateNavZones();

    // --- 第一年初始 clip-path reveal ---
    if (typeof ScrollTrigger !== 'undefined') {
      const firstRotates = (pagePhotoRotates[0] || []).map(r => r.rotateDiv);
      const firstPage = strip.querySelector('.timeline-page');
      const firstCards = firstPage ? Array.from(firstPage.children) : [];
      const firstEraKey = Object.keys(eraCards)[0];
      const firstEraEl = firstEraKey ? eraCards[firstEraKey] : null;

      const allRevealEls = [...firstRotates, ...firstCards];
      if (firstEraEl) allRevealEls.push(firstEraEl);

      // 先全部隱藏（照片隨機四方向，字卡隨機左右）
      firstRotates.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDir4()) }));
      firstCards.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDirLR()) }));
      if (firstEraEl) gsap.set(firstEraEl, { clipPath: getClipStart(randomDirLR()) });

      ScrollTrigger.create({
        trigger: area,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          allRevealEls.forEach((el, i) => {
            gsap.to(el, {
              clipPath: CLIP_END, duration: 1.0, ease: 'power3.out', delay: i * 0.08,
            });
          });
          revealedPages.add(0);
        },
      });
    }
  }

  // --- 建立字卡 ---
  function createCard(html, pos, rotation, bgColor, width, isEra = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'absolute z-10 pointer-events-none';
    wrapper.style.left = `${pos.x}px`;
    wrapper.style.top = `${pos.y}px`;
    wrapper.style.transform = `rotate(${rotation}deg)`;

    const inner = document.createElement('div');
    inner.className = 'timeline-card-inner p-sm';
    if (width) inner.style.width = width;
    inner.style.maxWidth = '450px';
    if (isEra) {
      inner.className += ' bg-black text-white';
    } else if (bgColor) {
      inner.style.background = bgColor;
    }
    inner.innerHTML = html;

    wrapper.appendChild(inner);
    return wrapper;
  }
}
