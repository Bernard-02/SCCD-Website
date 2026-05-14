/**
 * Floating Items
 * 在首頁背景層漂浮的元素，像宇宙中的螢火蟲
 */

const TOTAL_ITEMS = 20;
const SPEED_MIN = 0.05;
const SPEED_MAX = 0.25;
const IMG_WIDTH = 200; // 所有圖片統一寬度，高度 auto follow 原比例
const MAX_TEXT_WIDTH = 300;

// ── Pool 建立 ──────────────────────────────────────────────

// 其他 JSON 內的圖片路徑用 "../images/..." 格式（相對於 pages/），
// 但首頁在根目錄，需要去掉 "../" 才能正確載入
function normalizeImagePath(src) {
  if (!src) return src;
  return src.replace(/^\.\.\//, '');
}

async function fetchActivityPosters() {
  const pool = [];

  // 活動類 JSON → 導航到 activities.html?section=X
  const activitySources = [
    { file: 'data/permanent-exhibitions.json', section: 'exhibitions' },
    { file: 'data/lectures.json',              section: 'lectures' },
    { file: 'data/workshops.json',             section: 'workshop' },
    { file: 'data/summer-camp.json',           section: 'summer-camp' },
    { file: 'data/students-present.json',      section: 'students-present' },
    { file: 'data/general-activities.json',    section: 'competitions' },
  ];

  await Promise.all(activitySources.map(async (src) => {
    try {
      const data = await fetch(src.file).then(r => r.json());
      const groups = Array.isArray(data) ? data : (data.items || data.records || []);
      groups.forEach(group => {
        const items = Array.isArray(group) ? group : (group.items || []);
        items.forEach(item => {
          if (item.poster) {
            // 有 id 就加上 &item= 讓目標頁可以 highlight 該項目
            const itemParam = item.id ? `&item=${item.id}` : '';
            pool.push({
              type: 'image',
              src: normalizeImagePath(item.poster),
              url: `pages/activities.html?section=${src.section}${itemParam}`,
            });
          }
        });
      });
    } catch (_) {}
  }));

  // Library documents → library.html#f-{id}
  try {
    const files = await fetch('data/library.json').then(r => r.json());
    files.forEach(item => {
      if (item.cover && item.id) {
        pool.push({
          type: 'image',
          src: normalizeImagePath(item.cover),
          url: `pages/library.html#f-${item.id}`,
        });
      }
    });
  } catch (_) {}

  // Album → library.html（無 id，只到 album panel）
  try {
    const albumGroups = await fetch('data/album-others.json').then(r => r.json());
    albumGroups.forEach(group => {
      (group.items || []).forEach(item => {
        if (item.cover) {
          pool.push({
            type: 'image',
            src: normalizeImagePath(item.cover),
            url: 'pages/library.html',
          });
        }
      });
    });
  } catch (_) {}

  // 洗牌 + 取出足夠數量（pool 不夠時會重複）
  shuffle(pool);
  if (pool.length === 0) return [];
  if (pool.length >= TOTAL_ITEMS) return pool.slice(0, TOTAL_ITEMS);
  // pool 不足 → 重複填充
  return Array.from({ length: TOTAL_ITEMS }, (_, i) => pool[i % pool.length]);
}

// 從 courses.json 撈課程 title（導航到對應 course item，並 highlight 該項目）
async function fetchCourseTexts() {
  const pool = [];
  try {
    const data = await fetch('data/courses.json').then(r => r.json());
    const slugify = str => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    [['bfa', data.bfa || []], ['mdes', data.mdes || []]].forEach(([program, courses]) => {
      courses.forEach(course => {
        const zh = course.titleZh;
        const en = course.titleEn;
        if (!zh && !en) return;
        const slug = en ? slugify(en) : '';
        const filter = course.type || 'required';
        const itemParam = slug ? `&item=${slug}` : '';
        const url = `pages/courses.html?program=${program}&filter=${filter}${itemParam}`;
        pool.push({ type: 'text', textEn: en || '', textZh: zh || '', url });
      });
    });
  } catch (_) {}
  return pool;
}

// 從 records.json 撈 awards title（有導航）
async function fetchAwardTexts() {
  const pool = [];
  try {
    const data = await fetch('data/records.json').then(r => r.json());
    (data.records || []).forEach(yearGroup => {
      (yearGroup.items || []).forEach(item => {
        if (!item.competition) return;
        if (item.flag === 'tw') return; // 只顯示台灣以外的獎項
        // 中文：競賽名稱 加空格 rank
        const zh = `${item.competition} ${item.rank}`;
        // 英文：rank, 競賽名稱
        const en = item.competition_en
          ? `${item.rank_en || ''}, ${item.competition_en}`.trim().replace(/^,\s*/, '')
          : '';
        const hash = item.id ? `#${item.id}` : '';
        pool.push({ type: 'text', textEn: en, textZh: zh, url: `pages/library.html${hash}` });
      });
    });
  } catch (_) {}
  return pool;
}

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Element 建立 ────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// 全局 news hover 狀態，所有 item 訂閱
const newsHoverListeners = { enter: [], leave: [] };

export function applyNewsHover() {
  newsHoverListeners.enter.forEach(fn => fn());
}
export function removeNewsHover() {
  newsHoverListeners.leave.forEach(fn => fn());
}

const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

// 隨機旋轉 -4° ~ 6°，排除 -1° ~ 1°
function randomRotation() {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * (1 + Math.random() * (sign < 0 ? 3 : 5)); // 負：-1~-4，正：1~6
}

function createImageEl(src, url, showPlayIcon = false) {
  const wrapper = document.createElement(url ? 'a' : 'div');
  if (url) {
    wrapper.href = url;
    wrapper.style.cursor = 'pointer';
  }
  wrapper.style.cssText = `
    display: block;
    position: absolute;
    top: 0; left: 0;
    width: ${IMG_WIDTH}px;
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    overflow: hidden;
    transition: none;
  `;

  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
  `;
  img.onerror = () => { wrapper.remove(); };

  // news hover overlay（從上到下 wipe，無 blend mode）
  const newsOverlay = document.createElement('div');
  newsOverlay.style.cssText = `
    position: absolute; inset: 0;
    background: transparent;
    pointer-events: none;
    clip-path: inset(100% 0 0 0);
    transition: clip-path 0.5s cubic-bezier(0.25,0,0,1);
  `;

  wrapper.appendChild(img);

  if (showPlayIcon) {
    const playIcon = document.createElement('div');
    playIcon.style.cssText = `
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    `;
    playIcon.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22" fill="none"><polygon points="0,0 18,11 0,22" fill="white" fill-opacity="0.85"/></svg>`;
    wrapper.appendChild(playIcon);
  }

  // newsOverlay 放最後，蓋住 img、hoverOverlay、playIcon
  wrapper.appendChild(newsOverlay);

  // 隨機選一個 wipe 方向（上/下/左/右）
  const wipeDirections = [
    { hidden: 'inset(100% 0 0 0)', shown: 'inset(0% 0 0 0)' },   // 從上往下
    { hidden: 'inset(0 0 100% 0)', shown: 'inset(0 0 0% 0)' },   // 從下往上
    { hidden: 'inset(0 100% 0 0)', shown: 'inset(0 0% 0 0)' },   // 從右往左
    { hidden: 'inset(0 0 0 100%)', shown: 'inset(0 0 0 0%)' },   // 從左往右
  ];
  const wipe = wipeDirections[Math.floor(Math.random() * wipeDirections.length)];
  newsOverlay.style.clipPath = wipe.hidden;

  // 訂閱 news hover 事件：每次 enter 時隨機選色
  // mode-color：用 var(--theme-fg) strict 對比，不隨機（與整體 B/W 對比 pattern 一致）
  newsHoverListeners.enter.push(() => {
    if (document.body.classList.contains('mode-color')) {
      newsOverlay.style.background = 'var(--theme-fg)';
    } else {
      newsOverlay.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    }
    newsOverlay.style.clipPath = wipe.shown;
  });
  newsHoverListeners.leave.push(() => {
    newsOverlay.style.clipPath = wipe.hidden;
  });

  return { el: wrapper, w: IMG_WIDTH, h: IMG_WIDTH }; // h 暫用 IMG_WIDTH，實際由圖片決定
}

function createTextEl(textEn, textZh, url) {
  const el = document.createElement(url ? 'a' : 'div');
  if (url) {
    el.href = url;
    el.style.cursor = 'pointer';
  }
  const defaultColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
  const defaultTextColor = '#000';
  el.style.cssText = `
    display: inline-block;
    position: absolute;
    top: 0; left: 0;
    padding: 0.5rem 0.75rem;
    font-weight: 600;
    line-height: 1.4;
    will-change: transform;
    pointer-events: ${url ? 'auto' : 'none'};
    transition: background 0.25s ease, color 0.25s ease;
    white-space: nowrap;
  `;

  if (textEn) {
    const enLine = document.createElement('div');
    enLine.textContent = textEn;
    enLine.style.cssText = 'font-size: var(--font-size-p1); margin-bottom: 0.15rem;';
    el.appendChild(enLine);
  }
  if (textZh) {
    const zhLine = document.createElement('div');
    zhLine.textContent = textZh;
    zhLine.style.cssText = 'font-size: var(--font-size-p1);';
    el.appendChild(zhLine);
  }

  // mode-color：對比色底 + 反色字（var(--theme-fg)/(--theme-fg-inverse) 隨 hue 翻黑白）
  // 其他模式：accent 底 + 黑字
  function setColors() {
    if (document.body.classList.contains('mode-color')) {
      el.style.background = 'var(--theme-fg)';
      el.style.color = 'var(--theme-fg-inverse)';
    } else {
      el.style.background = defaultColor;
      el.style.color = defaultTextColor;
    }
  }
  setColors();
  // 切 mode 時透過 theme:changed 重套；el 脫離 DOM 後 listener 自我清理
  function onThemeChange() {
    if (!el.isConnected) {
      window.removeEventListener('theme:changed', onThemeChange);
      return;
    }
    if (el.dataset.hovering === '1') return; // 不蓋 hover state
    setColors();
  }
  window.addEventListener('theme:changed', onThemeChange);

  // 訂閱 news hover：文字色改成底色（變純色 block）；mode-color 不適用（保持黑白）
  newsHoverListeners.enter.push(() => {
    if (document.body.classList.contains('mode-color')) return;
    el.style.color = defaultColor;
    el.style.transition = 'color 0.4s ease, background 0.25s ease';
  });
  newsHoverListeners.leave.push(() => {
    if (document.body.classList.contains('mode-color')) return;
    el.style.color = defaultTextColor;
  });

  if (url) {
    el.addEventListener('mouseenter', () => {
      el.dataset.hovering = '1';
      // mode-color：hover 反色（default 黑底白字 → 白底黑字，跟著 hue 動態翻）
      // inverse 模式：hover 變白底黑字
      // standard：hover 變黑底白字（accent → 黑）
      if (document.body.classList.contains('mode-color')) {
        el.style.background = 'var(--theme-fg-inverse)';
        el.style.color = 'var(--theme-fg)';
      } else if (document.body.classList.contains('mode-inverse')) {
        el.style.background = '#ffffff';
        el.style.color = '#000000';
      } else {
        el.style.background = '#000';
        el.style.color = '#fff';
      }
    });
    el.addEventListener('mouseleave', () => {
      el.dataset.hovering = '0';
      setColors();
    });
  }

  return { el, w: MAX_TEXT_WIDTH, h: 80 };
}

// IG 獨立模組，不在 floating pool 內
export function initWatchHover() {
  const watchBtn = document.getElementById('homepage-yt-card');
  if (!watchBtn) return;

  // 全頁暗化 overlay，中間挖洞 spotlight
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 9998;
  `;
  document.body.appendChild(overlay);

  function updateSpotlight() {
    const rect = watchBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2 + 8; // 稍微比按鈕大一點
    overlay.style.background = `radial-gradient(circle ${r}px at ${cx}px ${cy}px, transparent 100%, rgba(0,0,0,0.85) 100%)`;
  }

  watchBtn.addEventListener('mouseenter', () => {
    updateSpotlight();
    overlay.style.opacity = '1';
    applyNewsHover();
  });

  watchBtn.addEventListener('mouseleave', () => {
    if (watchBtn.dataset.clickAnimating === '1') return;
    overlay.style.opacity = '0';
    removeNewsHover();
  });
  watchBtn.__closeSpotlight = () => {
    overlay.style.opacity = '0';
    removeNewsHover();
  };
}

const FALLBACK_IMAGES = [
  'images/SCCD-1-4-0.jpg',
  'images/S__6742028.jpg',
  'images/Degree Show.jpg',
];

function createCircleEl() {
  // 無連結：隨機從測試圖片取一張
  const src = FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
  return createImageEl(src, null, false);
}

// ── Spawn & Animate ─────────────────────────────────────────

function spawnItem(container, poolEntry, fromEdge = false) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  let elData;
  if (!poolEntry || poolEntry.type === 'circle') {
    elData = createCircleEl();
  } else if (poolEntry.type === 'image') {
    elData = createImageEl(poolEntry.src, poolEntry.url, false);
  } else if (poolEntry.type === 'video-thumb') {
    elData = createImageEl(poolEntry.src, poolEntry.url, true);
  } else if (poolEntry.type === 'text') {
    elData = createTextEl(poolEntry.textEn, poolEntry.textZh, poolEntry.url);
  } else {
    elData = createCircleEl();
  }

  const { el, w, h } = elData;

  const angle = rand(0, Math.PI * 2);
  const speed = rand(SPEED_MIN, SPEED_MAX);
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  let x = 0, y = 0;

  // 量真實尺寸：暫時 append 到 container
  el.style.visibility = 'hidden';
  el.style.position = 'absolute';
  container.appendChild(el);
  if (el.offsetWidth > MAX_TEXT_WIDTH) {
    el.style.whiteSpace = 'normal';
    el.style.wordBreak = 'break-word';
    el.style.width = `${MAX_TEXT_WIDTH}px`;
  }
  const realW = el.offsetWidth || w;
  const realH = el.offsetHeight || h;
  container.removeChild(el);
  el.style.visibility = '';
  el.style.position = 'static';

  // 計算位置
  if (fromEdge) {
    const edge = randInt(0, 3);
    if (edge === 0)      { x = rand(-realW, cw); y = -realH; vy = Math.abs(vy) + SPEED_MIN; }
    else if (edge === 1) { x = cw;               y = rand(-realH, ch); vx = -(Math.abs(vx) + SPEED_MIN); }
    else if (edge === 2) { x = rand(-realW, cw); y = ch;    vy = -(Math.abs(vy) + SPEED_MIN); }
    else                 { x = -realW;            y = rand(-realH, ch); vx = Math.abs(vx) + SPEED_MIN; }
  } else {
    x = rand(-realW * 0.5, cw - realW * 0.5);
    y = rand(-realH * 0.5, ch - realH * 0.5);
  }

  const rotation = randomRotation();

  // mover：負責 translate（tick 控制，無 transition）
  const mover = document.createElement('div');
  mover.style.cssText = `position:absolute; top:0; left:0; will-change:transform;`;
  mover.style.transform = `translate(${x}px, ${y}px)`;

  // rotator：負責 rotateX/Y 搖擺（GSAP 控制）
  // perspective 必須設在父層才有透視效果
  const perspectiveWrap = document.createElement('div');
  perspectiveWrap.style.cssText = `perspective: 600px;`;
  const rotator = document.createElement('div');
  rotator.style.cssText = `transform-style: preserve-3d;`;

  rotator.appendChild(el);
  perspectiveWrap.appendChild(rotator);
  mover.appendChild(perspectiveWrap);
  container.appendChild(mover);

  // X 和 Y 各自獨立節奏來回搖擺，範圍 -60° ~ 60°，不會看到背面
  const startY = rand(-60, 60);
  const endY   = startY > 0 ? rand(-60, -10) : rand(10, 60);
  const startX = rand(-30, 30);
  const endX   = startX > 0 ? rand(-30, -5) : rand(5, 30);
  const durY   = rand(6, 10);
  const durX   = rand(8, 13);
  const gsapTweenY = gsap.fromTo(rotator,
    { rotateY: startY },
    { rotateY: endY, duration: durY, ease: 'sine.inOut', yoyo: true, repeat: -1 }
  );
  const gsapTweenX = gsap.fromTo(rotator,
    { rotateX: startX },
    { rotateX: endX, duration: durX, ease: 'sine.inOut', yoyo: true, repeat: -1 }
  );
  const gsapTween = {
    pause:  () => { gsapTweenY.pause();  gsapTweenX.pause();  },
    resume: () => { gsapTweenY.resume(); gsapTweenX.resume(); },
  };

  const item = { el: mover, x, y, vx, vy, w: realW, h: realH, rotation, hovered: false, gsapTween, rotator };

  el.addEventListener('mouseenter', () => {
    item.hovered = true;
    gsapTween.pause();
    gsap.to(rotator, { rotateY: 0, rotateX: 0, duration: 0.35, ease: 'power2.out' });
  });
  el.addEventListener('mouseleave', () => {
    item.hovered = false;
    gsapTween.resume();
  });

  return item;
}

// ── Init ────────────────────────────────────────────────────

export async function initFloatingItems() {
  const container = document.getElementById('floating-layer');
  if (!container) return;

  // 建立 pool：圖片 + 課程文字 + 獎項文字
  const [imagePool, coursePool, awardPool] = await Promise.all([
    fetchActivityPosters(),
    fetchCourseTexts(),
    fetchAwardTexts(),
  ]);

  // 各 pool 獨立洗牌，依 2:1:1 比例隨機取出
  shuffle(imagePool);
  shuffle(coursePool);
  shuffle(awardPool);
  const poolCursors = [0, 0, 0];
  const pools = [imagePool, coursePool, awardPool];
  // 權重：圖片 2、課程 1、獎項 1 → 累積 [2, 3, 4]
  const cumWeights = [2, 3, 4];

  function nextPoolEntry() {
    const r = Math.random() * cumWeights[cumWeights.length - 1];
    const pi = cumWeights.findIndex(w => r < w);
    const pool = pools[pi];
    if (!pool || pool.length === 0) return null;
    if (poolCursors[pi] >= pool.length) { shuffle(pool); poolCursors[pi] = 0; }
    return pool[poolCursors[pi]++];
  }

  const items = [];

  // 初始化 items
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    items.push(spawnItem(container, nextPoolEntry(), false));
  }

  let running = true;
  let rafId = null;

  function tick() {
    if (!running) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const buffer = 250;

    // 單點透視：以畫面中心為消失點，越中心越小（遠），越四周越大（近）
    const centerX = cw / 2;
    const centerY = ch / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const speedMult = item.hovered ? 0.3 : 1;
      item.x += item.vx * speedMult;
      item.y += item.vy * speedMult;

      // scale：以 item 中心點距畫面中心的距離決定
      const dx = (item.x + item.w / 2) - centerX;
      const dy = (item.y + item.h / 2) - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = 0.6 + Math.min(dist / maxDist, 1) * 0.9;

      item.el.style.transform = `translate(${item.x}px, ${item.y}px) scale(${scale})`;

      if (
        item.x > cw + buffer ||
        item.x < -buffer * 2 ||
        item.y > ch + buffer ||
        item.y < -buffer * 2
      ) {
        container.removeChild(item.el);
        items.splice(i, 1);
        const entry = nextPoolEntry();
        items.push(spawnItem(container, entry, true));
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      running = true;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  });
}
