/**
 * Hero Animation Module
 * 為所有內頁的 Hero Section 文字加上進場動畫
 *
 * 架構：
 * - JS 動態為每個元素加一個 wrapper（帶 CSS class），wrapper 負責 rotate
 * - 元素本身做 yPercent: 100 → 0 的 clip reveal（從 wrapper 底部滑入）
 * - visibility: hidden 定義在 hero.css，CSS 載入後立即生效，防止閃爍
 */

function wrapElement(el, wrapperClass) {
  const wrapper = document.createElement('div');
  wrapper.className = wrapperClass;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 隨機定位 5 元素（title-wrapper / title-cn-wrapper / banner / EN-wrapper / CN-wrapper）至 absolute 座標
// 必須在 wrapElement() 之後呼叫，這樣 wrapper 才是 grid 的直系子元素
//
// 規則（填滿 viewport，不留完全空白角）：
//   - 4 個文字（EN title / CN title / EN 段 / CN 段）各佔一個 viewport corner（shuffle 分配）
//   - Banner 中央偏隨機（85vw），4 corner 都被文字佔時 banner fall back 偏向 corners[3] → 與文字重疊（z-index 文字在上）
//   - 文字必須避開 header（TEXT_TOP_BOUND = 140）；banner 可貼近 header（BANNER_TOP_BOUND = 90）
//   - 文字互相不重疊（corner 分散自然 separation；加 collision retry 兜底）
//   - 文字可疊在 banner 上（z-index CSS 處理）
// 旋轉：banner 額外給 ±3° 隨機（titles / EN / CN 用 CSS rotation）
function randomizeHeroLayout() {
  const grid = document.querySelector('.hero-rand-grid');
  if (!grid) return;
  if (window.innerWidth < 768) return;  // 手機 flex stack，不 random

  const TEXT_TOP_BOUND = 140;
  const BANNER_TOP_BOUND = 90;
  const SIDE_MARGIN = 24;
  const BOTTOM_MARGIN = 30;
  const TEXT_COLLISION_PAD = 12;
  const CORNER_JITTER_FRAC = 0.18;  // 文字距 corner anchor 最多 18% 可用空間（保留邊緣感）
  const TEXT_MIN_W_PX = 400;        // EN / CN 段落最小 max-width（過窄會換太多行、bbox 變高觸發避碰失敗）
  const TEXT_MAX_W_PX = 550;        // EN / CN 段落最大 max-width（每次 refresh 兩段各自隨機）
  const W = window.innerWidth;
  const H = window.innerHeight;

  // 隨機派 EN / CN 段落 max-width — 寬窄分佈讓版面變化更大
  // 必須在量測 bbox 之前設好，否則 rect 是舊寬度的 bbox
  ['hero-text-en', 'hero-text-cn'].forEach(cls => {
    const p = /** @type {HTMLElement|null} */ (grid.querySelector(`.${cls}`));
    if (p) {
      const w = TEXT_MIN_W_PX + Math.random() * (TEXT_MAX_W_PX - TEXT_MIN_W_PX);
      p.style.maxWidth = `${Math.round(w)}px`;
    }
  });

  const textItems = [];
  ['hero-title', 'hero-title-cn', 'hero-text-en', 'hero-text-cn'].forEach(cls => {
    const wrapper = grid.querySelector(`.${cls}-wrapper`);
    if (wrapper) textItems.push(wrapper);
    else {
      const raw = grid.querySelector(`.${cls}`);
      if (raw) textItems.push(raw);
    }
  });
  const banner = /** @type {HTMLElement|null} */ (grid.querySelector('.hero-banner'));
  if (banner) {
    const bannerAngle = (Math.random() * 6 - 3).toFixed(2);
    banner.style.transform = `rotate(${bannerAngle}deg)`;
  }

  const allItems = banner ? [...textItems, banner] : textItems;
  allItems.forEach(el => {
    /** @type {HTMLElement} */ (el).style.left = '0px';
    /** @type {HTMLElement} */ (el).style.top = '0px';
  });
  void /** @type {HTMLElement} */ (grid).offsetHeight;

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function rectsOverlap(a, b, pad) {
    return !(a.right + pad < b.left || b.right + pad < a.left ||
             a.bottom + pad < b.top || b.bottom + pad < a.top);
  }
  function overlapArea(a, b) {
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ox * oy;
  }

  // 4 corner shuffle，取前 3 個當「偏好 corner」分給 text items
  const corners = shuffleArr(['tl', 'tr', 'bl', 'br']);
  const placedTextRects = [];
  const usedCorners = [];

  // 偵測 header logo（180×180、左上、會溢出 header 下方），給 text bbox 當 exclusion zone
  const logoEl = /** @type {HTMLElement|null} */ (document.querySelector('#header-logo'));
  let logoRect = null;
  if (logoEl) {
    const r = logoEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      logoRect = { left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 };
    }
  }

  // 對特定 corner 嘗試放置；回傳最佳 (vx, vy, penalty)。不真的 apply。
  function tryPlaceAtCorner(rect, corner) {
    const bbW = rect.width;
    const bbH = rect.height;

    let effectiveTop = TEXT_TOP_BOUND;
    if (logoRect && (corner === 'tl' || corner === 'tr')) {
      const anchorX = (corner === 'tl') ? SIDE_MARGIN : W - bbW - SIDE_MARGIN;
      const xOverlapsLogo = (logoRect.right > anchorX) && (logoRect.left < anchorX + bbW);
      if (xOverlapsLogo) effectiveTop = Math.max(TEXT_TOP_BOUND, logoRect.bottom);
    }

    const xRange = Math.max(0, W - bbW - 2 * SIDE_MARGIN);
    const yRange = Math.max(0, H - bbH - effectiveTop - BOTTOM_MARGIN);

    let bestVx = SIDE_MARGIN, bestVy = effectiveTop, bestPenalty = Infinity;
    for (let i = 0; i < 30; i++) {
      const jx = Math.random() * CORNER_JITTER_FRAC * xRange;
      const jy = Math.random() * CORNER_JITTER_FRAC * yRange;
      const vx = (corner === 'tl' || corner === 'bl')
        ? SIDE_MARGIN + jx
        : W - bbW - SIDE_MARGIN - jx;
      const vy = (corner === 'tl' || corner === 'tr')
        ? effectiveTop + jy
        : H - bbH - BOTTOM_MARGIN - jy;

      const candidate = { left: vx, top: vy, right: vx + bbW, bottom: vy + bbH };
      const collidesText = placedTextRects.some(r => rectsOverlap(r, candidate, TEXT_COLLISION_PAD));
      const collidesLogo = logoRect ? rectsOverlap(logoRect, candidate, 0) : false;
      if (!collidesText && !collidesLogo) { return { vx, vy, penalty: 0, corner }; }

      const penalty = placedTextRects.reduce((s, r) => s + overlapArea(r, candidate), 0)
        + (collidesLogo ? overlapArea(logoRect, candidate) * 4 : 0);
      if (penalty < bestPenalty) { bestPenalty = penalty; bestVx = vx; bestVy = vy; }
    }
    return { vx: bestVx, vy: bestVy, penalty: bestPenalty, corner };
  }

  // 試偏好 corner，失敗（仍有 overlap）則 fall back 試其他 corner，取 penalty 最低者
  // 這解決「兩段都被 shuffle 到同一側 corner、bbH 加起來超過 viewport 高度」的不可避免重疊
  function placeTextWithFallback(el, preferredCorner) {
    const rect = /** @type {HTMLElement} */ (el).getBoundingClientRect();
    const bbW = rect.width;
    const bbH = rect.height;

    const tryOrder = [preferredCorner, ...shuffleArr(['tl', 'tr', 'bl', 'br'].filter(c => c !== preferredCorner))];
    let best = null;
    for (const c of tryOrder) {
      const result = tryPlaceAtCorner(rect, c);
      if (!best || result.penalty < best.penalty) best = result;
      if (result.penalty === 0) break;  // 找到完全無重疊 → 收工
    }

    /** @type {HTMLElement} */ (el).style.left = `${(best.vx - rect.left).toFixed(1)}px`;
    /** @type {HTMLElement} */ (el).style.top = `${(best.vy - rect.top).toFixed(1)}px`;
    placedTextRects.push({ left: best.vx, top: best.vy, right: best.vx + bbW, bottom: best.vy + bbH });
    usedCorners.push(best.corner);
  }

  textItems.forEach((el, i) => placeTextWithFallback(el, corners[i]));

  // Banner：偏向「未被文字佔用」的第 4 個 corner，確保所有 corner 都有內容、無完全空白角
  if (banner) {
    const rect = banner.getBoundingClientRect();
    const bbW = rect.width;
    const bbH = rect.height;

    const minVx = SIDE_MARGIN;
    const maxVx = Math.max(minVx + 1, W - bbW - SIDE_MARGIN);
    const minVy = BANNER_TOP_BOUND;
    const maxVy = Math.max(minVy + 1, H - bbH - BOTTOM_MARGIN);

    // 文字可能因 fallback 換 corner → 用 usedCorners 找實際沒被佔的（不是原本 shuffle 的 corners[3]）
    const unusedCorner = ['tl', 'tr', 'bl', 'br'].find(c => !usedCorners.includes(c)) || corners[3];
    const biasLeft = (unusedCorner === 'tl' || unusedCorner === 'bl');
    const biasTop = (unusedCorner === 'tl' || unusedCorner === 'tr');
    // tx ∈ [0.65, 1.0]：強偏向 unused corner（不到 1.0 是留小隨機感）
    const tx = 0.65 + Math.random() * 0.35;
    const ty = 0.65 + Math.random() * 0.35;
    const vx = biasLeft ? minVx + (1 - tx) * (maxVx - minVx) : minVx + tx * (maxVx - minVx);
    const vy = biasTop ? minVy + (1 - ty) * (maxVy - minVy) : minVy + ty * (maxVy - minVy);

    banner.style.left = `${(vx - rect.left).toFixed(1)}px`;
    banner.style.top = `${(vy - rect.top).toFixed(1)}px`;
  }
}

export function initHeroAnimation() {
  // Hero highlight：所有 [data-hero-hl] 套同一個隨機 accent 色 + 固定 padding
  // padding 用 rem 而非 em，避免 h1（font-size 大）的 padding 被等比例放大成過大色塊
  // 跑在 gsap 早返回之前，確保無 gsap 也會套色
  const heroHls = document.querySelectorAll('[data-hero-hl]');
  if (heroHls.length > 0) {
    const cs = getComputedStyle(document.documentElement);
    const accentColors = [
      cs.getPropertyValue('--color-green').trim(),
      cs.getPropertyValue('--color-pink').trim(),
      cs.getPropertyValue('--color-blue').trim(),
    ];
    const color = accentColors[Math.floor(Math.random() * accentColors.length)];
    heroHls.forEach(el => {
      /** @type {HTMLElement} */ (el).style.background = color;
      /** @type {HTMLElement} */ (el).style.padding = '0.5rem 0.6rem';
    });
  }

  // hero-text-en / hero-text-cn 之間的 gap：兩個段落各自旋轉，bbox 高度會增加 = width × sin(angle)
  // 參考 history desc 的算法：gap = 兩 paragraph 的 rotation excursion 加總 + buffer
  // 動態算 because 寬度依 viewport 而變；只算一次，resize 不重算（避免 SPA listener 累積）
  // 注意：random 2×2 grid 版面（.hero-rand-grid）下 EN / CN 在不同 cell，rotation 由 section overflow 處理，不需 gap
  const heroTextEn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-en'));
  const heroTextCn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-cn'));
  const inRandGrid = !!document.querySelector('.hero-rand-grid');
  let heroGapPx = 0;
  if (heroTextEn && heroTextCn && !inRandGrid) {
    const isDesktop = window.innerWidth >= 768;
    const enRotDeg = isDesktop ? 3 : 1;
    const cnRotDeg = isDesktop ? 2 : 1;
    const w = heroTextEn.offsetWidth;
    const enExcursion = w * Math.sin(enRotDeg * Math.PI / 180);
    const cnExcursion = w * Math.sin(cnRotDeg * Math.PI / 180);
    const buffer = 12;
    heroGapPx = Math.ceil(enExcursion + cnExcursion + buffer);
  }

  if (typeof gsap === 'undefined') {
    if (heroTextEn && heroGapPx > 0) heroTextEn.style.marginBottom = `${heroGapPx}px`;
    document.querySelectorAll('.hero-title, .hero-title-cn, .hero-text-en, .hero-text-cn, .hero-banner, [data-hero-logo]')
      .forEach(el => { /** @type {HTMLElement} */ (el).style.visibility = 'visible'; });
    randomizeHeroLayout();
    return;
  }

  // --- Logo-only hero（如 about 頁）：clip y 位移進場 — yPercent 100→0，wrapper overflow:hidden 當遮罩 ---
  // duration 對齊 hero-title 的 0.9s，節奏跟其他內頁一致
  const heroLogo = /** @type {HTMLElement | null} */ (document.querySelector('[data-hero-logo]'));
  if (heroLogo) {
    const logoWrapper = /** @type {HTMLElement | null} */ (heroLogo.closest('.hero-logo-wrapper'));
    gsap.fromTo(heroLogo,
      { yPercent: 100, visibility: 'visible' },
      {
        yPercent: 0,
        duration: 0.9,
        delay: 0.3,
        ease: 'power3.out',
        clearProps: 'transform',
        onComplete: () => {
          // 解除 wrapper 裁切，讓後續 scroll parallax (scale+yPercent) 顯示完整 logo
          if (logoWrapper) logoWrapper.style.overflow = 'visible';
        },
      }
    );
  }

  const title = document.querySelector('.hero-title');
  const titleCn = document.querySelector('.hero-title-cn');
  const textEn = document.querySelector('.hero-text-en');
  const textCn = document.querySelector('.hero-text-cn');

  if (!title && !titleCn && !textEn && !textCn) return;

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // 預先 wrap，避免動畫順序判斷影響 wrap 邏輯（wrapper 同時負責 rotate + clip overflow）
  if (title) wrapElement(title, 'hero-title-wrapper');
  if (titleCn) wrapElement(titleCn, 'hero-title-cn-wrapper');
  if (textEn) {
    wrapElement(textEn, 'hero-text-en-wrapper');
    // Tailwind class（mb-lg/mb-xl）的 mb 在 wrap 後會在 wrapper 內部，浪費高度且讓 wrapper 變高 → 顯式清掉
    /** @type {HTMLElement} */ (textEn).style.marginBottom = '0';
    if (heroGapPx > 0 && textEn.parentElement) {
      // 旋轉 excursion gap 改套到 wrapper 上（wrapper 才是 flow 中影響後續元素的元素）
      textEn.parentElement.style.marginBottom = `${heroGapPx}px`;
    }
  }
  if (textCn) wrapElement(textCn, 'hero-text-cn-wrapper');

  // wrap 完成後再洗牌 grid：wrappers 是 grid 直系子元素，要在 wrap 後對 wrapper 派 grid styles
  randomizeHeroLayout();

  // Banner clip-path reveal（4 方向 random，與 faculty card 圖片進場一致風格）
  const heroBanner = /** @type {HTMLElement | null} */ (document.querySelector('.hero-banner'));
  if (heroBanner) {
    const BANNER_CLIP_MAP = {
      top:    'inset(0% 0% 100% 0%)',
      right:  'inset(0% 0% 0% 100%)',
      bottom: 'inset(100% 0% 0% 0%)',
      left:   'inset(0% 100% 0% 0%)',
    };
    const dirs = Object.keys(BANNER_CLIP_MAP);
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    gsap.set(heroBanner, { clipPath: BANNER_CLIP_MAP[dir] });
    tl.set(heroBanner, { visibility: 'visible' }, 0);
    tl.to(heroBanner, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 1.0,
      ease: 'power3.out',
      clearProps: 'clipPath',
    }, 0);
  }

  const titles = [title, titleCn].filter(Boolean);
  const subtitles = [textEn, textCn].filter(Boolean);
  // opt-in：[data-hero-title-last] 存在時 → subtitles 先進場，title 最後
  // 用於 hero 結構為「年份 → 英文 → 中文標題」這種底部為主標的版面（如 degree-show-detail）
  const titleLast = document.querySelector('[data-hero-title-last]') !== null;

  // 為什麼 visibility:visible 用 tl.set 對齊動畫起點而非 gsap.set 立即打開：
  // 若 init 時就 visibility:visible + yPercent:100，sub-pixel rounding 會在 wrapper 底邊露出 ~0.5px 細綫，
  // 動畫前等待視覺上看得到。把可見性切換對齊動畫起點 = 露邊立刻被滑入動作蓋掉，視覺乾淨。

  if (titleLast) {
    // Subtitles 先（年份 → 英文 stagger），title 後 overlap 進場
    if (subtitles.length > 0) {
      gsap.set(subtitles, { yPercent: 100 });
      tl.set(subtitles, { visibility: 'visible' })
        .to(subtitles, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.15,
          clearProps: 'transform',
        });
    }
    if (titles.length > 0) {
      gsap.set(titles, { yPercent: 100 });
      tl.set(titles, { visibility: 'visible' }, '-=0.4')
        .to(titles, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.15,
          clearProps: 'transform',
        }, '<');
    }
  } else {
    // 預設：title 先（英中 stagger），subtitles 後 overlap 進場
    if (titles.length > 0) {
      gsap.set(titles, { visibility: 'visible', yPercent: 100 });
      tl.to(titles, {
        yPercent: 0,
        duration: 0.9,
        stagger: 0.15,
        clearProps: 'transform',
      });
    }
    if (subtitles.length > 0) {
      gsap.set(subtitles, { yPercent: 100 });
      tl.set(subtitles, { visibility: 'visible' }, '-=0.4')
        .to(subtitles, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.15,
          clearProps: 'transform',
        }, '<');
    }
  }

  // Hero 之後的 main section 蓋在 hero 上方，避免 hero 動畫殘影在 scroll 期間透出來
  if (typeof ScrollTrigger !== 'undefined') {
    const heroSection = title
      ? title.closest('section')
      : document.querySelector('section');
    const mainSection = heroSection ? heroSection.nextElementSibling : null;
    if (mainSection) {
      /** @type {HTMLElement} */ (mainSection).style.position = 'relative';
      /** @type {HTMLElement} */ (mainSection).style.zIndex = '1';
    }
  }
}
