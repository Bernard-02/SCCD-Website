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
    // Era 字卡退場
    eraExitDuration: 0.4,
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
    // Era 新入場的額外 delay
    eraEnterDelay: 0.05,
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

  function rectsOverlap(a, b, pad = 60) {
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
             a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
  }

  // 計算兩矩形最小間距：>= 0 = 不重疊（值 = 最近邊距離），< 0 = 重疊（值 = 負的重疊深度）
  function rectGap(a, b) {
    const dxLeft = b.x - (a.x + a.w);
    const dxRight = a.x - (b.x + b.w);
    const dyTop = b.y - (a.y + a.h);
    const dyBottom = a.y - (b.y + b.h);
    const sepX = Math.max(dxLeft, dxRight);
    const sepY = Math.max(dyTop, dyBottom);
    if (sepX >= 0 || sepY >= 0) {
      // 不重疊：取較小的軸距離（兩軸都 >=0 時）或正分離軸
      return Math.max(sepX, sepY);
    }
    // 重疊：返回負的最小重疊量
    return Math.max(sepX, sepY);
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

        // X 範圍：era 在上半時強制靠右半（避開 year 預留的左半區）；下半時左右都可
        let exMin, exMax;
        if (useBottom) {
          exMin = cardSafeLeft;
          exMax = cardSafeRight - eraW;
        } else {
          exMin = cardSafeLeft + (cardSafeRight - cardSafeLeft) * 0.5;
          exMax = cardSafeRight - eraW;
        }
        const ex = exMin + Math.random() * Math.max(0, exMax - exMin);
        const ey = eraMinY + Math.random() * Math.max(0, eraMaxY - eraMinY);
        const eraPos = { x: ex, y: ey, w: eraW, h: eraH };

        const eraRot = pickUniqueRotations(1, -6, 6)[0];
        const eraEl = createCard(
          `<div class="text-p2 leading-base font-bold">${item.eraTitle} Era<br>${item.eraLabel}時期</div>`,
          eraPos, eraRot, null, 'max-content', true
        );
        if (Object.keys(eraCards).length > 0) eraEl.style.display = 'none';
        eraContainer.appendChild(eraEl);
        eraCards[item.eraTitle] = eraEl;
        // 碰撞矩形加大（考慮旋轉 + 額外間距），防止字卡被 era 擋住
        currentEraRect = { x: eraPos.x - 30, y: eraPos.y - 30, w: eraW + 60, h: eraH + 60 };
      }

      if (!currentEraRect) {
        const el = eraCards[item.eraTitle];
        if (el) {
          currentEraRect = {
            x: (parseFloat(el.style.left) || 0) - 30,
            y: (parseFloat(el.style.top) || 0) - 30,
            w: 250 + 60, h: 50 + 60
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

      // h2 (96px) "1970" max-content + padding (~115px) + 旋轉 bbox 膨脹 → 實測接近 330x220
      const yearW = 340, yearH = 240;
      const descW = Math.min(450, cardSafeRight - cardSafeLeft - 20);

      // 估算 desc 卡片實際高度：標題 + 每行 ~26px + padding
      // text-p2 ≈ 16px / line-height base ≈ 26px / 寬 450 ≈ 50 字元/行（中英混排取保守值 35）
      function estimateDescH(html) {
        const hasTitle = /<h5/i.test(html);
        // 計算 div 數量（每個 div = 一段文字，可能多行）
        const divMatches = html.match(/<div[^>]*>([\s\S]*?)<\/div>/gi) || [];
        let lines = 0;
        divMatches.forEach(divHtml => {
          const text = divHtml.replace(/<[^>]+>/g, '').trim();
          // 中文字符較寬：算 1.6 字元；保守估每行 35 字元
          const charsPerLine = 35;
          lines += Math.max(1, Math.ceil(text.length / charsPerLine));
        });
        if (lines === 0) lines = 2;
        let h = 32 + lines * 28; // padding 32 + 每行 28
        if (hasTitle) h += 56; // h5 (~30px) + mb-sm (~16px) + buffer
        return Math.max(140, h + 20); // 額外 20px buffer 防旋轉
      }

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
      // 貪婪 max-min-gap 演算法：每次選離現有卡片「最遠」的位置
      // 比純隨機可靠，能處理 3+ 卡片擠在小區域的情況
      const TARGET_GAP = 30; // 達到此間距就提早停止搜尋
      descriptions.forEach((desc, di) => {
        const descH = estimateDescH(desc);
        const xRange = Math.max(0, cardSafeRight - descW - cardSafeLeft);
        const yRange = Math.max(0, cardSafeBottom - descH - cardSafeTop);

        let bestPos = null;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < 200; attempt++) {
          const x = cardSafeLeft + Math.random() * xRange;
          const y = cardSafeTop + Math.random() * yRange;
          const rect = { x, y, w: descW, h: descH };

          // 計算與所有已放置卡片的最小間距（負值代表最大重疊量）
          let minGap = Infinity;
          for (const p of placed) {
            const g = rectGap(rect, p);
            if (g < minGap) minGap = g;
          }

          if (minGap > bestScore) {
            bestScore = minGap;
            bestPos = rect;
          }
          // 找到「夠遠」的位置就提早結束
          if (bestScore >= TARGET_GAP) break;
        }

        const descPos = bestPos || { x: cardSafeLeft, y: cardSafeTop, w: descW, h: descH };
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
      photo.style.zIndex = '20';
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

    // Dim / undim 邊界照片（只灰階，不上色）
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

      if (photoTooltipText) photoTooltipText.innerHTML = photo._tlTooltip;

      // 無論首次或跨照片：新照片都提升 z-index
      raisePhoto(photo, () => {
        if (activeHover !== photo) return;
        if (!photoTooltip) return;
        // Tooltip 已顯示 → 交給 mousemove 跟隨，這裡不要動位置
        if (tooltipVisible) return;
        // Tooltip 首次出現 → clip-path 入場
        gsap.set(photoTooltip, {
          left: e.clientX + 12, top: e.clientY + 12,
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
      return pd?.yearEl?.querySelector('.timeline-card-inner')?.style.background || ACCENT_COLORS[0];
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
        if (isMiddle && photoTooltip && activeHover === photo) {
          gsap.to(photoTooltip, { left: e.clientX + 12, top: e.clientY + 12, duration: TIMING.followDuration, ease: TIMING.followEase, overwrite: 'auto' });
        }
        if (isEdge && hoverEnabled) {
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
            duration: TIMING.eraExitDuration, ease: TIMING.exitEase,
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
        duration: TIMING.stripSlideDuration,
        ease: TIMING.stripSlideEase,
        onComplete: () => {
          // 到位後 reveal
          revealPagePhotos(index);

          gsap.to(target.yearEl, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase });
          target.descEls.forEach((el, i) => {
            gsap.to(el, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: TIMING.stagger * (i + 1) });
          });

          if (isEraChange) {
            const newEraEl = eraCards[target.eraTitle];
            if (newEraEl) {
              gsap.to(newEraEl, { clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, delay: TIMING.eraEnterDelay });
            }
          }
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

      // Step 1: 用 clip-path 清空當前畫面（最後一年的照片 + 字卡 + era；跳過邊界 slot）
      const lastRotates = pagePhotoRotates[lastIdx] || [];
      const lastPage = pageData[lastIdx];
      const clearEls = [
        ...lastRotates.filter(r => !isEdgeSlot(r.slotIndex)).map(r => r.rotateDiv),
        lastPage.yearEl,
        ...lastPage.descEls,
      ];
      // 也清掉 era
      const lastEraEl = eraCards[lastPage.eraTitle];
      if (lastEraEl) clearEls.push(lastEraEl);

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

          // Step 5: 準備第一年 reveal（邊界 slot 不做 clip，保持可見）
          const firstRotates = (pagePhotoRotates[0] || [])
            .filter(r => !isEdgeSlot(r.slotIndex))
            .map(r => r.rotateDiv);
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

  // --- 建立字卡 ---
  function createCard(html, pos, rotation, bgColor, width, isEra = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'absolute z-10 pointer-events-none';
    wrapper.style.left = `${pos.x}px`;
    wrapper.style.top = `${pos.y}px`;
    wrapper.style.transform = `rotate(${rotation}deg)`;

    const inner = document.createElement('div');
    inner.className = 'timeline-card-inner';
    inner.style.padding = '0.5em 0.6em'; // 同 vision data-overview-hl 的內距
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
