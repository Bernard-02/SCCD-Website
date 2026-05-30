/* global gsap, ScrollTrigger */
/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

import { initDegreeShowGallery } from './degree-show-gallery.js';
import { initHeroAnimation } from './hero-animation.js';
import { animateCardsClipReveal } from '../ui/scroll-animate.js';
import { createClassImagesSlideshow } from './about/class-images-slideshow.js';
import { getSectionData, findItemById } from './activities-data-loader.js';

// CMB2 file_list type 存 meta 為 dict `{ attachment_id: url, ... }`；舊 JSON 是 string array
// normalize 成 string array of URLs（順序不保證、但前端 gallery 不依賴順序）
function normalizeImageList(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    // 舊 JSON 直接是 string array / 或 group repeater [{image}]
    return val.map(x => typeof x === 'string' ? x : (x?.image || x?.url || '')).filter(Boolean);
  }
  if (typeof val === 'object') {
    // CMB2 file_list dict
    return Object.values(val).filter(v => typeof v === 'string' && v);
  }
  return [];
}

// ── New endpoint shape → legacy shape adapter ────────────────────────────────
// WP endpoint 新 schema 跟前端歷史 shape 不對應，這 helper 把 endpoint entry 還原舊 shape
// 給 list / detail page 都能消費；舊 fallback JSON 不過 adapter 直接 work
function mapEndpointEntryToLegacyShape(entry) {
  if (!entry) return entry;
  // events: 新 shape startYear/Month/Day + endYear/Month/Day → 舊 shape time string "MM / DD - MM / DD"
  // 同年同日 → "MM / DD"；同年跨日 → "MM / DD - MM / DD"；跨年 → "YYYY.MM.DD - YYYY.MM.DD"
  const events = (entry.events || []).map(ev => {
    const sM = ev.startMonth, sD = ev.startDay, eM = ev.endMonth || sM, eD = ev.endDay || sD;
    const sY = ev.startYear, eY = ev.endYear || sY;
    let time = '';
    if (sM && sD) {
      const sameDate = sY === eY && sM === eM && sD === eD;
      if (sameDate) time = `${sM} / ${sD}`;
      else if (sY === eY) time = `${sM} / ${sD} - ${eM} / ${eD}`;
      else time = `${sY}.${sM}.${sD} - ${eY}.${eM}.${eD}`;
    }
    return {
      // type: 'exhibition' 走 gallery；'forum' / 'workshop' / 'lecture' 等走 ref-based slideshow
      type: ev.type || 'exhibition',
      time,
      name: ev.nameZh || '',
      nameEn: ev.nameEn || '',
      location: ev.locationZh || '',
      locationEn: ev.locationEn || '',
      city: ev.cityZh || '',
      cityEn: ev.cityEn || '',
      // per-event album（未來 WP schema 可加 albumImages per event；endpoint 沒帶就空陣列）
      images: normalizeImageList(ev.albumImages),
      // refs: 非 exhibition type 用 — [{source, id}]，指向 activities source 撈 sub-item 渲染 tab + slideshow
      refs: Array.isArray(ev.refs) ? ev.refs : [],
    };
  });
  return {
    title: entry.titleZh || entry.title || '',
    title_en: entry.titleEn || entry.title_en || '',
    descCn: entry.descriptionZh || entry.descCn || '',
    descEn: entry.descriptionEn || entry.descEn || '',
    coverImage: entry.coverImage || '',
    heroImage: entry.bannerImage || entry.heroImage || '',
    poster: entry.poster || '',
    images: normalizeImageList(entry.albumImages),
    videoUrl: entry.mainVideoUrl || entry.videoUrl || '',
    documentaryUrl: entry.documentaryUrl || '',
    events,
  };
}

export async function loadDegreeShowList() {
  await loadDegreeShowListInto('degree-show-list');
  // 獨立頁 /degree-show：cards 進 viewport 才 reveal（panel-switch 路徑由 activities-section-switch 接管，不用此分支）
  // 沿用全站 clip-reveal helper，跟其他 list 同節奏
  const cards = document.querySelectorAll('#degree-show-list .degree-show-card');
  if (cards.length) animateCardsClipReveal(cards, true);
}

export async function loadDegreeShowListInto(containerId) {
  try {
    // WP endpoint 回 flat array，舊 JSON 是 dict by year — normalize 成 dict
    // 非 sccd-website.local 環境（localhost / 127.0.0.1 / file:/// 等）直接跳 WP fetch 走 JSON fallback —
    // 否則本機 fetch http://sccd-website.local DNS 失敗會卡 1-3 秒 hero 空白等到逾時才動畫
    const isWpHost = location.hostname === 'sccd-website.local';
    let data;
    try {
      if (!isWpHost) throw new Error('non-wp host, skip endpoint');
      const res = await fetch('/wp-json/sccd/v1/activities-degree-show');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('endpoint returned 0 items');
      // flat array → dict by events[0].startYear（list 主年份規則）
      data = {};
      for (const entry of arr) {
        const y = entry.events?.[0]?.startYear || '';
        if (y) data[y] = mapEndpointEntryToLegacyShape(entry);
      }
    } catch (err) {
      console.warn('[degree-show] WP endpoint failed, fallback to data/degree-show.json:', err.message);
      data = await fetch('/data/degree-show.json').then(r => r.json());
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    const years = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // Sort years descending
    const colors = ['#FF448A', '#00FF80', '#26BCFF'];

    years.forEach((year, idx) => {
      const item = data[year];
      const color = colors[idx % colors.length];
      const titleEn = item.title_en || item.titleEn || '';
      const titleZh = item.title || item.titleZh || '';
      // .list-reveal-row 讓 setupAdmissionReveal + playAdmissionPanelReveal 接管進場
      //   → 跟 description / search bar 同一條 stagger timeline，無 hardcoded delay
      // img loading="eager"：cards 是首屏內容（degree-show panel 只有 3-5 張），lazy 會讓 wrapper
      //   render 時高度為 0 → clip-reveal 的 yPercent:100 = 0px 沒位移 = 視覺殘影
      //   eager 保證 layout 立刻可量
      const html = `
        <a href="/degree-show-detail?year=${year}" class="grid-12 items-start degree-show-card list-reveal-row" style="--card-color: ${color}">
          <div class="col-span-12 md:col-start-1 md:col-span-1 mb-sm md:mb-0">
            <h5>${year}</h5>
          </div>
          <div class="degree-show-card-content col-span-12 md:col-start-2 md:col-span-11 p-[6px] ml-lg transition-colors duration-fast">
            <div class="degree-show-img-wrapper overflow-hidden mb-md">
              <img src="${item.coverImage}" alt="Degree Show ${year}" loading="eager" class="degree-show-img w-full object-cover">
            </div>
            <h5 class="mt-md">${titleEn || titleZh}${titleEn && titleZh ? `<br><span>${titleZh}</span>` : ''}</h5>
          </div>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // Hover：accent 底色套在 content div，觸發範圍限縮到圖片 wrapper（桌面版）
    if (window.innerWidth >= 768) {
      container.querySelectorAll('.degree-show-card').forEach(card => {
        const content = /** @type {HTMLElement | null} */ (card.querySelector('.degree-show-card-content'));
        const imgWrapper = card.querySelector('.degree-show-img-wrapper');
        const color = getComputedStyle(card).getPropertyValue('--card-color').trim();
        if (!imgWrapper || !content) return;
        imgWrapper.addEventListener('mouseenter', () => { content.style.backgroundColor = color; });
        imgWrapper.addEventListener('mouseleave', () => { content.style.backgroundColor = ''; });
      });
    }

    // 不在 loader 內 setup/play reveal — activities-section-switch 統一用 setupAdmissionReveal +
    // playAdmissionPanelReveal 處理整個 panel（含 description / search bar / cards），維持跟其他
    // list panel（admission / activities / workshops 等）一致的進場時序，無 hardcoded delay 0.8s 等待
  } catch (error) {
    console.error('Error loading degree show data:', error);
  }
}

export async function loadDegreeShowDetail() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');

  if (!year) {
      window.location.href = '404.html';
      return;
  }

  try {
    // WP endpoint 優先；endpoint 0 items or fail → fallback /data/degree-show.json
    // 非 sccd-website.local 環境直接跳 WP fetch — 否則本機 DNS 失敗會卡 1-3 秒讓 hero 進場 delay
    // （loadDegreeShowDetail 是 hero animation 的前置 await，fetch 慢 = hero 視覺空白等同樣時間）
    const isWpHost = location.hostname === 'sccd-website.local';
    let degreeShowData;
    try {
      if (!isWpHost) throw new Error('non-wp host, skip endpoint');
      const res = await fetch('/wp-json/sccd/v1/activities-degree-show');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('endpoint returned 0 items');
      degreeShowData = {};
      for (const entry of arr) {
        const y = entry.events?.[0]?.startYear || '';
        if (y) degreeShowData[y] = mapEndpointEntryToLegacyShape(entry);
      }
    } catch (err) {
      console.warn('[degree-show-detail] WP endpoint failed, fallback to data/degree-show.json:', err.message);
      degreeShowData = await fetch('/data/degree-show.json').then(r => r.json());
    }
    const data = degreeShowData[year];
    const years = Object.keys(degreeShowData).sort((a, b) => Number(b) - Number(a));

    if (data) {
      document.title = `Degree Show ${year} - SCCD`;

      // Text Content（hero chips：年份 + 英文名 + 中文名）
      const titleEl = document.getElementById('text-title');
      const titleEnEl = document.getElementById('text-title-en');
      const yearEl = document.getElementById('text-year');
      const descEnEl = document.getElementById('text-desc-en');
      const descCnEl = document.getElementById('text-desc-cn');

      if (titleEl) titleEl.textContent = data.title;
      if (titleEnEl) titleEnEl.textContent = data.title_en || '';
      if (yearEl) yearEl.textContent = year;
      if (descEnEl) descEnEl.textContent = data.descEn;
      if (descCnEl) descCnEl.textContent = data.descCn;

      // Hero 動畫必須在文字填入後才呼叫，否則會 wrap 並動畫空元素，clearProps 後文字才靜態出現
      // section 上的 [data-hero-title-last] 會讓 hero-animation 改用「subtitles 先 → title 後」的順序
      initHeroAnimation();

      // Events 列表（時間 / 活動 / 地點 / 城市 — 1:2:2:1）：data.events 不存在或空陣列 → 整塊不渲染
      // 活動 / 地點 / 城市顯示中英雙語（英文上、中文下）；時間僅一行；文字 semibold
      const eventsSection = document.getElementById('events-section');
      const eventsList = document.getElementById('events-list');
      if (eventsSection && eventsList) {
        if (Array.isArray(data.events) && data.events.length > 0) {
          eventsList.innerHTML = data.events.map((ev, i) => `
            <div class="grid grid-cols-[1fr_2fr_2fr_1fr] gap-md ${i > 0 ? 'mt-md' : ''}">
              <p class="text-p1 text-black font-semibold">${ev.time || ''}</p>
              <div>
                ${ev.nameEn ? `<p class="text-p1 text-black font-semibold">${ev.nameEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.name || ''}</p>
              </div>
              <div>
                ${ev.locationEn ? `<p class="text-p1 text-black font-semibold">${ev.locationEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.location || ''}</p>
              </div>
              <div>
                ${ev.cityEn ? `<p class="text-p1 text-black font-semibold">${ev.cityEn}</p>` : ''}
                <p class="text-p1 text-black font-semibold">${ev.city || ''}</p>
              </div>
            </div>
          `).join('');
          eventsSection.classList.remove('hidden');
        } else {
          eventsSection.classList.add('hidden');
          eventsList.innerHTML = '';
        }
      }

      // Hero Image：預設用 HTML 寫死的 CCC08866.jpg；data 有 heroImage 才覆蓋
      const heroImg = /** @type {HTMLImageElement | null} */ (document.getElementById('hero-img'));
      if (heroImg && data.heroImage) {
        heroImg.src = data.heroImage;
      }

      // Per-event galleries：每個 event 一個 section + 獨立 gallery instance
      // event.images 缺則 fallback 用 entry 層 data.images（過渡期相容；2024 已有 per-event images）
      // sticky chip scroll observer 依 .event-gallery-section 判定當前 event index
      await renderEventGalleries(data);

      // 共用渲染函式：依 url 形式塞 iframe / video tag
      const renderVideoInto = (wrapper, url) => {
        if (url.includes('youtube') || url.includes('vimeo') || url.includes('embed')) {
          wrapper.innerHTML = `<iframe class="w-full h-full" src="${url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
          wrapper.innerHTML = `<video class="w-full h-full" controls><source src="${url}" type="video/mp4">Your browser does not support the video tag.</video>`;
        }
      };

      // 主影片（per-event gallery 上方）— hidden 在外層 #video-outer-section
      const videoOuter = document.getElementById('video-outer-section');
      const videoWrapper = document.getElementById('video-wrapper');
      if (videoOuter && videoWrapper) {
        if (data.videoUrl) {
          videoOuter.classList.remove('hidden');
          renderVideoInto(videoWrapper, data.videoUrl);
        } else {
          videoOuter.classList.add('hidden');
          videoWrapper.innerHTML = '';
        }
      }

      // 紀錄影片（per-event gallery 下方）— hidden 在外層 #documentary-outer-section
      const docOuter = document.getElementById('documentary-outer-section');
      const docWrapper = document.getElementById('documentary-video-wrapper');
      if (docOuter && docWrapper) {
        if (data.documentaryUrl) {
          docOuter.classList.remove('hidden');
          renderVideoInto(docWrapper, data.documentaryUrl);
        } else {
          docOuter.classList.add('hidden');
          docWrapper.innerHTML = '';
        }
      }

      // Prev / Next 雙卡：sort desc 下 idx+1 = 上一年度（older 左上），idx-1 = 下一年度（newer 右下）；皆 wrap 維持循環導覽
      const idx = years.indexOf(year);
      const prevYear = years[(idx + 1) % years.length];
      const nextYear = years[(idx - 1 + years.length) % years.length];
      const prevData = degreeShowData[prevYear];
      const nextData = degreeShowData[nextYear];

      setupNextProject(prevYear, prevData, nextYear, nextData);

      // Sticky info card + hero chip scroll-driven collapse
      // 必須在 events / galleries / nextProject 都渲染完才 init（依賴它們的 DOM 計算 sticky 範圍）
      setupStickyAndHeroChips(data);

    } else {
      window.location.href = '404.html';
    }
  } catch (error) {
    console.error('Error loading degree show detail data:', error);
  }
}

/**
 * Next Project section setup（左 = older / 上方，右 = newer / 下方 50% offset）
 * 桌面：兩張海報 56vw 各占 80% 視覺、預設 50% 黑 dim、hover 取消 dim + 顯示三 chip（年份/英/中）
 *      其中 chip 隨機色 + 旋轉 + 水平範圍（左 0-50vw / 右 51-100vw）；另一張同時 clip-path 掃入隨機色（仿首頁 newsOverlay）
 * 手機：簡單 stack
 */
function setupNextProject(prevYear, prevData, nextYear, nextData) {
  const ACCENT = ['#00FF80', '#FF448A', '#26BCFF'];
  const CLIP_DIRS = [
    { hidden: 'inset(100% 0 0 0)', shown: 'inset(0% 0 0 0)' },   // 上→下
    { hidden: 'inset(0 0 100% 0)', shown: 'inset(0 0 0% 0)' },   // 下→上
    { hidden: 'inset(0 100% 0 0)', shown: 'inset(0 0% 0 0)' },   // 右→左
    { hidden: 'inset(0 0 0 100%)', shown: 'inset(0 0 0 0%)' },   // 左→右
  ];

  // 手機 stack
  const setMobile = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link-m`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img-m`));
    const yearEl = document.getElementById(`${key}-year-mobile`);
    const titleEl = document.getElementById(`${key}-title-mobile`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.poster || data.coverImage;
    if (yearEl) yearEl.textContent = year;
    if (titleEl) titleEl.textContent = data.title || '';
  };
  setMobile('prev', prevYear, prevData);
  setMobile('next', nextYear, nextData);

  if (window.innerWidth < 768) return;

  // 桌面 desktop
  const setDesktop = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img`));
    const yearEl = document.getElementById(`${key}-year`);
    const titleEnEl = document.getElementById(`${key}-title-en`);
    const titleEl = document.getElementById(`${key}-title`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.poster || data.coverImage;
    if (yearEl) yearEl.textContent = year;
    if (titleEnEl) titleEnEl.textContent = data.title_en || '';
    if (titleEl) titleEl.textContent = data.title || '';
  };
  setDesktop('prev', prevYear, prevData);
  setDesktop('next', nextYear, nextData);

  // 本地隨機旋轉：-6° ~ 6°（不含 0），用於 cards 與 labels
  const localRot = () => {
    let deg;
    do { deg = Math.round(Math.random() * 12) - 6; } while (deg === 0);
    return deg;
  };

  // 海報隨機旋轉，兩張獨立
  const prevCard = /** @type {HTMLElement | null} */ (document.getElementById('prev-card'));
  const nextCard = /** @type {HTMLElement | null} */ (document.getElementById('next-card'));
  if (prevCard) prevCard.style.transform = `rotate(${localRot()}deg)`;
  if (nextCard) nextCard.style.transform = `rotate(${localRot()}deg)`;

  // Labels：rotation 各自隨機（init 時固定）；底色 cardColor 改為每次 mouseenter 重新挑
  // → 同張海報的 3 chip 仍共用同一色，但跨 hover 不一定相同
  const LABEL_IDS = ['year', 'title-en', 'title'];
  ['prev', 'next'].forEach(key => {
    LABEL_IDS.forEach(id => {
      const el = /** @type {HTMLElement | null} */ (document.getElementById(`${key}-${id}`));
      if (!el) return;
      el.style.transform = `rotate(${localRot()}deg)`;
    });
  });

  // 位置計算：等兩張圖載入完後，依 naturalWidth/Height 計算高度，設 next.top + stage.minHeight
  // labels 已搬進 card 內、靠 corner 絕對定位（左下 / 右上），不需要 JS 算 vw 位置
  const recompute = () => {
    const stage = /** @type {HTMLElement | null} */ (document.getElementById('next-project-stage'));
    const prevImg = /** @type {HTMLImageElement | null} */ (document.getElementById('prev-img'));
    const nextImg = /** @type {HTMLImageElement | null} */ (document.getElementById('next-img'));
    const nextLink = /** @type {HTMLElement | null} */ (document.getElementById('next-link'));
    if (!stage || !prevImg || !nextImg || !nextLink) return;
    if (!prevImg.naturalWidth || !nextImg.naturalWidth) return;

    const posterW = window.innerWidth * 0.66;
    const prevH = posterW * (prevImg.naturalHeight / prevImg.naturalWidth);
    const nextH = posterW * (nextImg.naturalHeight / nextImg.naturalWidth);
    const nextTop = prevH * 0.5;

    nextLink.style.top = nextTop + 'px';
    stage.style.minHeight = (nextTop + nextH) + 'px';
  };

  const waitImg = (img) => new Promise(r => {
    if (!img) { r(undefined); return; }
    if (img.complete && img.naturalWidth) r(undefined);
    else {
      img.addEventListener('load', () => r(undefined), { once: true });
      img.addEventListener('error', () => r(undefined), { once: true });
    }
  });
  Promise.all([
    waitImg(/** @type {HTMLImageElement | null} */ (document.getElementById('prev-img'))),
    waitImg(/** @type {HTMLImageElement | null} */ (document.getElementById('next-img'))),
  ]).then(() => {
    recompute();
    window.addEventListener('resize', recompute);
  });

  // Hover：被 hover 的 card → z 提高 + 移除 dim + 顯示 labels group；另一張 → clip-path 掃入隨機色
  const setupHover = (myKey, otherKey) => {
    const myLink = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-link`));
    const otherLink = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-link`));
    const myDim = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-dim`));
    const myLabels = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-labels`));
    const otherClip = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-clip`));
    if (!myLink || !myDim || !otherClip) return;

    // chip clip-path stagger 設定：從 transform-origin 那側 reveal
    // prev: transform-origin left → reveal 從左到右 → hidden inset(0 100% 0 0)
    // next: transform-origin right → reveal 從右到左 → hidden inset(0 0 0 100%)
    const HIDDEN_INSET = myKey === 'prev' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    const SHOWN_INSET  = 'inset(0 0 0 0)';

    myLink.addEventListener('mouseenter', () => {
      myLink.style.zIndex = '3';
      if (otherLink) otherLink.style.zIndex = '1';
      myDim.style.opacity = '0';

      // 每次 hover 重新挑 cardColor（不一定每次都一樣），同步套到 3 個 chip
      // 同時每次 hover 重新 random 旋轉角度（chip 此時 clip-path 還是 hidden，新角度會在 reveal 時直接呈現）
      const myCardColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
      myLink.dataset.cardColor = myCardColor;
      if (myLabels) {
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('h4, h2'));
        chips.forEach((chip, i) => {
          chip.style.transform = `rotate(${localRot()}deg)`;
          chip.style.background = myCardColor;
          chip.style.transitionDelay = (i * 0.08) + 's';
          chip.style.clipPath = SHOWN_INSET;
        });
      }

      // 隨機方向 + 隨機色，先 disable transition snap 到 hidden 再 reflow + apply shown
      // clip color 從候選排除掉「被 hover 卡片的 cardColor」，避免文字底色與覆蓋色撞色
      const dir = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
      const clipPool = ACCENT.filter(c => c !== myCardColor);
      const color = clipPool[Math.floor(Math.random() * clipPool.length)];
      otherClip.dataset.hiddenClip = dir.hidden;
      otherClip.style.transition = 'none';
      otherClip.style.clipPath = dir.hidden;
      otherClip.style.background = color;
      void otherClip.offsetHeight;
      otherClip.style.transition = 'clip-path 0.5s cubic-bezier(0.25,0,0,1)';
      otherClip.style.clipPath = dir.shown;
    });

    myLink.addEventListener('mouseleave', () => {
      myDim.style.opacity = '0.5';
      if (myLabels) {
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('h4, h2'));
        chips.forEach((chip) => {
          chip.style.transitionDelay = '0s';
          chip.style.clipPath = HIDDEN_INSET;
        });
      }
      otherClip.style.clipPath = otherClip.dataset.hiddenClip || 'inset(100% 0 0 0)';
    });
  };
  setupHover('prev', 'next');
  setupHover('next', 'prev');

  // 進場動畫保留 clip-path reveal（prev 由左→右、next 由右→左）
  if (typeof ScrollTrigger !== 'undefined' && typeof gsap !== 'undefined') {
    const setupReveal = (id, fromInset) => {
      const el = document.getElementById(id);
      if (!el) return;
      gsap.set(el, { clipPath: fromInset });
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(el, {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 0.5,
            ease: 'cubic-bezier(0.25, 0, 0, 1)',
          });
        }
      });
    };
    setupReveal('prev-card', 'inset(0% 100% 0% 0%)');
    setupReveal('next-card', 'inset(0% 0% 0% 100%)');
  }
}

// ── Per-event section rendering ────────────────────────────────────────────
// 每個 event 一個 <section class="event-gallery-section" data-event-index="i">，依 ev.type 分流：
//   - 'exhibition' (default)：.division-images full-width slideshow（initDegreeShowGallery）
//   - 'forum' / 'workshop' / 'lecture' 等：依 ev.refs[] 撈 activities source item，
//     用 class 模板（左 desc + 右 .division-images.division-images--degree-show）渲染；
//     多 refs → 上方 tab 切換 sub-item；單 ref → 不顯示 tab；
//     ref item 無 desc → 藏左欄、右欄撐滿；ref item 無 images / refs 全 invalid → 整 event 不渲染
// scroll observer 依 section data-event-index / data-branch-* 判定當前 event（sticky branch chip）
async function renderEventGalleries(data) {
  const root = document.getElementById('event-galleries-root');
  if (!root) return;
  root.innerHTML = '';

  const events = Array.isArray(data.events) ? data.events : [];
  const fallbackPool = Array.isArray(data.images) ? data.images : [];

  if (events.length === 0 && fallbackPool.length === 0) return;

  // 無 events 時保留舊行為：單一 fallback gallery section
  if (events.length === 0) {
    appendExhibitionSection(root, 0, fallbackPool, '', '');
    return;
  }

  // 有 events：依 type 分流，async 處理 ref-based event
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const branchEn = ev.nameEn || '';
    const branchZh = ev.name || '';
    if (ev.type && ev.type !== 'exhibition') {
      // ref-based event（forum / workshop / lecture / ...）
      await appendRefBasedSection(root, i, ev, branchEn, branchZh);
    } else {
      // exhibition：沿用既有 full-width slideshow
      const pool = (Array.isArray(ev.images) && ev.images.length > 0) ? ev.images : fallbackPool;
      if (pool.length === 0) continue;
      appendExhibitionSection(root, i, pool, branchEn, branchZh);
    }
  }
}

function appendExhibitionSection(root, index, pool, branchEn, branchZh) {
  const section = document.createElement('section');
  section.className = 'event-gallery-section py-4xl';
  section.dataset.eventIndex = String(index);
  section.dataset.branchEn = branchEn;
  section.dataset.branchZh = branchZh;
  const gallery = document.createElement('div');
  gallery.className = 'division-images relative';
  section.appendChild(gallery);
  root.appendChild(section);
  initDegreeShowGallery(gallery, pool);
}

// ref-based section：refs[] 撈 activities source item 後渲染 tab + slideshow
// 變體：
//   - refs.length === 1 → 藏 tab
//   - ref item 無 description → 藏左欄，右 slideshow col-span 撐滿
//   - 所有 ref 都無 images → 整 event 不渲染（return 不 append）
async function appendRefBasedSection(root, index, ev, branchEn, branchZh) {
  const refs = Array.isArray(ev.refs) ? ev.refs : [];
  if (refs.length === 0) return;

  // 解所有 ref → source item shape: { nameEn, nameZh, descEn, descZh, images:[], sourceKey }
  const resolved = [];
  for (const ref of refs) {
    const item = await resolveRefItem(ref);
    if (item && item.images.length > 0) {
      item.sourceKey = ref.source;
      resolved.push(item);
    }
  }
  if (resolved.length === 0) return;

  const section = document.createElement('section');
  section.className = 'event-gallery-section py-4xl';
  section.dataset.eventIndex = String(index);
  section.dataset.branchEn = branchEn;
  section.dataset.branchZh = branchZh;

  const wrap = document.createElement('div');
  wrap.className = 'site-container';

  // Tab 列：直接套用 about .class-division-btn（不另寫、不加 group label）
  //   - default: var(--theme-fg) 底 + var(--theme-bg) 字（mode-aware）
  //   - active: JS 套隨機 accent 底 + 黑字 + 隨機旋轉（同 bfa-division-toggle）
  //   - btn 內含 EN + ZH 兩行（about 一樣的 chip 結構）
  //   - tab row 放 grid-12 col-start-3 跟 desc col 同 x 起點
  // 注意：about 是 sticky btn group，degree-show 是普通靜態 row（沒 sticky 行為）
  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
  function randAccent() { return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]; }
  function randRot() {
    let r = 0;
    while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 6 - 3).toFixed(2));
    return r;
  }

  let tabBtns = [];
  let tabBaseRots = []; // 預存每顆 btn 的 base rotation（inactive 用）
  if (resolved.length > 1) {
    const tabRowGrid = document.createElement('div');
    tabRowGrid.className = 'grid-12 mb-2xl';
    const tabRow = document.createElement('div');
    tabRow.className = 'col-span-12 md:col-start-3 md:col-span-10 flex flex-wrap gap-xl';
    resolved.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'class-division-btn font-bold transition-all duration-fast text-left';
      btn.dataset.tabIndex = String(i);
      btn.innerHTML = `<div class="text-h5 font-bold whitespace-nowrap">${item.nameEn || ''}</div><div class="text-h5 font-bold whitespace-nowrap">${item.nameZh || ''}</div>`;
      const btnRot = randRot();
      btn._baseRot = btnRot;
      btn.style.transform = `rotate(${btnRot}deg)`;
      tabBaseRots.push(btnRot);
      tabRow.appendChild(btn);
      tabBtns.push(btn);
    });
    tabRowGrid.appendChild(tabRow);
    wrap.appendChild(tabRowGrid);
  }

  // Panels：每個 ref item 一個 panel；只有第一個顯示，其餘 hidden
  // 結構完全比照 about .class-info-panel：grid-12 md:items-start + descCol (col-start-3 col-span-4)
  //   + imgCol (col-start-8 col-span-5 既是 grid item 又是 .division-images container)
  // 不加 [data-class-hl] 彩色背景（封鎖綫）— degree-show 頁不要 highlighter
  const apis = [];
  resolved.forEach((item, i) => {
    const panel = document.createElement('div');
    panel.className = `event-extra-panel grid-12 md:items-start${i === 0 ? '' : ' hidden'}`;
    panel.dataset.panelIndex = String(i);

    const hasDesc = !!(item.descEn || item.descZh);
    let descHlEl = null;
    if (hasDesc) {
      const descCol = document.createElement('div');
      descCol.className = 'col-span-12 md:col-start-3 md:col-span-4 order-2 md:order-1 mt-xl md:mt-0';
      // [data-class-hl] 彩色背景塊（封鎖綫風）：跟 about 一樣，desc 文字包進有 inline padding 的 hl wrapper
      // bg 由 JS 套（mode-standard 走隨機 accent；mode-inverse/color 由 themes CSS 提供 theme bg）
      descHlEl = document.createElement('div');
      descHlEl.setAttribute('data-class-hl', '');
      descHlEl.style.cssText = 'display: inline-block; width: fit-content; padding: 0.5em 0.6em;';
      descHlEl.innerHTML = `
        ${item.descEn ? `<p class="mb-xs division-text font-bold">${escapeHtml(item.descEn)}</p>` : ''}
        ${item.descZh ? `<p class="division-text font-bold">${escapeHtml(item.descZh)}</p>` : ''}`;
      // mode-standard 自己套隨機 accent（about 是 brand-trail.initClassHighlight 全域套；degree-show 自管）
      descHlEl.style.background = randAccent();
      descCol.appendChild(descHlEl);
      panel.appendChild(descCol);
    }

    // imgCol 即 .division-images container（比照 about HTML：grid item 直接掛 .division-images，不多包一層）
    // 不加 --degree-show modifier（那是 full-width exhibition 用的 660px 高版）— sub-event 直接走 about 440px 預設
    const slideshow = document.createElement('div');
    slideshow.className = hasDesc
      ? 'col-span-12 md:col-start-8 md:col-span-5 relative order-1 md:order-2 mb-xl md:mb-0 division-images'
      : 'col-span-12 md:col-start-3 md:col-span-10 relative mb-xl md:mb-0 division-images';
    panel.appendChild(slideshow);
    wrap.appendChild(panel);

    // 啟動 slideshow（panel hidden 時 GSAP set 仍會生效，切 tab 時直接可見）
    // 顯式傳 textHlEl 讓 hl 區跟 imgs 同步 clip-path（about 一樣行為）
    const api = createClassImagesSlideshow(slideshow, item.images, { textHlEl: descHlEl });
    if (api) {
      api.renderFresh(false);
      if (i === 0) api.start();
      apis.push(api);
    } else {
      apis.push(null);
    }
  });

  // Tab 切換：套用 about bfa-division-toggle setActive 的視覺
  //   - active btn: 隨機 accent 底 + 黑字 + 新隨機旋轉（每次 active 重新 random，跟 about 一致）
  //   - inactive btn: 還原 default bg/color（清掉 inline style 走 .class-division-btn CSS）+ 回到 base 旋轉
  let activeIdx = 0;
  let switching = false;
  function setActiveTabBtn() {
    tabBtns.forEach((b, i) => {
      if (i === activeIdx) {
        const color = randAccent();
        const rot = randRot();
        b.classList.add('active');
        b.style.background = color;
        b.style.color = '#000000';
        b.style.transform = `rotate(${rot}deg)`;
      } else {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
        b.style.transform = `rotate(${tabBaseRots[i]}deg)`;
      }
    });
  }
  async function switchTab(nextIdx) {
    if (switching || nextIdx === activeIdx) return;
    switching = true;
    try {
      const panels = section.querySelectorAll('.event-extra-panel');
      const oldApi = apis[activeIdx];
      const newApi = apis[nextIdx];
      if (oldApi) { await oldApi.hideAll(); oldApi.stop(); }
      panels.forEach((p, i) => p.classList.toggle('hidden', i !== nextIdx));
      if (newApi) {
        newApi.renderFresh(true);
        await newApi.showAll();
        newApi.start();
      }
      activeIdx = nextIdx;
      setActiveTabBtn();
    } finally {
      switching = false;
    }
  }
  // Hover：inactive btn → 套隨機 accent 預覽（leave 還原）；同 about bfa-division-toggle
  tabBtns.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => {
      if (btn.classList.contains('active')) return;
      const color = randAccent();
      const rot = randRot();
      btn.style.background = color;
      btn.style.color = '#000000';
      btn.style.transform = `rotate(${rot}deg)`;
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.classList.contains('active')) return;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.transform = `rotate(${tabBaseRots[i]}deg)`;
    });
    btn.addEventListener('click', () => switchTab(i));
  });
  setActiveTabBtn();

  section.appendChild(wrap);
  root.appendChild(section);
}

// Ref item resolver：吃 {source, id} 回傳 normalized shape 或 null
// 命名兩種模式對齊 activities-data-loader.resolveRef：
//   A) title=zh, title_en=en（lectures / industry / summer-camp / general-activities）
//   B) title=en, title_zh=zh（workshops / students-present）
async function resolveRefItem(ref) {
  if (!ref || !ref.source || !ref.id) return null;
  const data = await getSectionData(ref.source);
  if (!data) return null;
  const item = findItemById(data, ref.id);
  if (!item) {
    console.warn('[degree-show] ref item not found:', ref);
    return null;
  }
  // 命名 mode 判定：source 內可能 mode A/B 混雜（同 lectures.json L-2025-01 有 title_en、L-2025-02 沒）
  //   - 有 title_en → mode A（title_en=en, title=zh）
  //   - 無 title_en 但有 title_zh → mode B（title=en, title_zh=zh）
  //   - 都沒 → 把 title 當 zh（lectures L-2025-02 等只填中文的單語 case）
  const isModeA = !!item.title_en;
  const isModeB = !item.title_en && !!item.title_zh;
  const nameEn = isModeA ? item.title_en : (isModeB ? item.title : '');
  const nameZh = isModeA ? item.title    : (isModeB ? item.title_zh : item.title || '');
  // desc 命名 source 各異：lectures/industry/general-activities = description；workshops = intro
  // 同樣兩 mode 推測哪個欄位算 zh/en
  const descA = item.description || item.intro || '';
  const descEn = item.description_en || item.descriptionEn || item.intro_en || (isModeB ? descA : '');
  const descZh = item.description_zh || item.descriptionZh || item.intro_zh || (isModeA || (!isModeA && !isModeB) ? descA : '');
  const images = Array.isArray(item.images) ? item.images
               : Array.isArray(item.albumImages) ? item.albumImages
               : [];
  return { nameEn: nameEn || '', nameZh: nameZh || '', descEn, descZh, images };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ── Sticky info card ───────────────────────────────────────────────────────
// 兩個 chip 設計：
//   - title chip（h5）：英上中下同 chip
//   - branch chip（p1）：英上中下同 chip，依當前 event 切換內容
// 動畫：clip-path inset(0 0 100% 0) → inset(0 0 0 0)（由上往下 reveal）；收起同方向
// 進場時機：description section pt-6xl 結束點之後（chip 出現在描述段落上方視覺對齊處）
// 退場時機：Next Project section 進場前
// Branch 切換：scroll 進入下一個 event → 先收 → 換字 → 展（不可直接切換文字）
// 每張 chip 隨機旋轉 -3°~3°（避開 0），整卡隨機 accent 底色
/** @param {{ title?: string, title_en?: string }} data */
function setupStickyAndHeroChips(data) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.innerWidth < 768) return; // 手機不做（HTML 已 hidden md:flex）

  const card = document.getElementById('sticky-info-card');
  const titleChip = document.getElementById('sticky-title-chip');
  const titleEnEl = document.getElementById('sticky-title-en');
  const titleZhEl = document.getElementById('sticky-title');
  const branchChip = document.getElementById('sticky-branch-chip');
  const branchEnEl = document.getElementById('sticky-branch-en');
  const branchZhEl = document.getElementById('sticky-branch');
  // 返回按鈕跟 sticky title 同步 fade（同 trigger 範圍），只有顯示時可點
  const backBtn = /** @type {HTMLElement | null} */ (document.getElementById('degree-show-back-btn'));
  if (!card || !titleChip || !titleEnEl || !titleZhEl || !branchChip || !branchEnEl || !branchZhEl) return;

  // 填初始文字 — 套到 inner span 而非外 chip wrapper
  titleEnEl.textContent = data.title_en || '';
  titleZhEl.textContent = data.title || '';
  branchEnEl.textContent = '';
  branchZhEl.textContent = '';
  // branch chip 預設整個隱藏（避免空殼色塊），有 event 進場才 display:'' + reveal
  branchChip.style.display = 'none';

  // 隨機 accent + 旋轉
  // - bg 套到 .sticky-chip-inner（撐 padding 的 element）
  // - rotation + clip-path 套到外 .sticky-chip wrapper（reveal 時整塊 chip 含 padding 一起被 wipe）
  const ACCENT = ['#00FF80', '#FF448A', '#26BCFF'];
  const cardColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
  const branchPool = ACCENT.filter(c => c !== cardColor);
  const branchColor = branchPool[Math.floor(Math.random() * branchPool.length)];
  const randRot = () => { let d; do { d = Math.round((Math.random() * 6 - 3) * 10) / 10; } while (Math.abs(d) < 0.5); return d; };

  const titleInner = titleChip.querySelector('.sticky-chip-inner');
  const branchInner = branchChip.querySelector('.sticky-chip-inner');
  if (titleInner) /** @type {HTMLElement} */ (titleInner).style.background = cardColor;
  if (branchInner) /** @type {HTMLElement} */ (branchInner).style.background = branchColor;
  titleChip.style.transform = `rotate(${randRot()}deg)`;
  branchChip.style.transform = `rotate(${randRot()}deg)`;
  if (backBtn) backBtn.style.transform = `rotate(${randRot()}deg)`;

  // clip-path 規則：CSS 已預設 inset(0 0 100% 0) hidden，這裡保留 mapping
  const HIDDEN = 'inset(0 0 100% 0)';
  const SHOWN = 'inset(0 0 0 0)';
  // titleChips = [titleChip, backBtn]：兩者描述段 reveal、next-project 段 collapse 全程同步
  // branchChip 仍獨立由 galleriesRoot 內各 event trigger 控（只在 galleries 段顯示）
  const titleChips = backBtn ? [titleChip, backBtn] : [titleChip];

  function setChipsState(chips, visible, stagger = 0.08) {
    chips.forEach((chip, i) => {
      chip.style.transitionDelay = `${i * stagger}s`;
      chip.style.clipPath = visible ? SHOWN : HIDDEN;
    });
  }

  // === Hero → Sticky 銜接動畫 ===
  // 概念：scroll 過 description section 的 pt 邊界時，hero 三 chip 用「進場反向」clip-reveal 收起，
  //       同時 sticky chip 由上往下 clip-reveal 出現（視覺上像 hero 變成 sticky）
  // 退場：scroll 回 description 上方 → sticky 收起 + hero chip clip-reveal 回原位
  // hero chip clip 由 hero-animation 的 wrapper overflow:hidden 處理，這裡直接動 chip yPercent
  // 不帶 opacity fade — 純粹 yPercent 推出 wrapper 由 overflow 裁出 clip-reveal 視覺
  const heroSection = document.querySelector('[data-hero-title-last]');
  // description section = hero 之後第一個 section（含 pt-6xl）
  const descSection = heroSection ? heroSection.nextElementSibling : null;
  const heroYearEl = document.getElementById('text-year');
  const heroTitleEnEl = document.getElementById('text-title-en');
  const heroTitleZhEl = document.getElementById('text-title');
  const heroChips = [heroYearEl, heroTitleEnEl, heroTitleZhEl].filter(Boolean);
  let cardShown = false;

  // hero chip 收/展：yPercent 往下滑出 wrapper → wrapper overflow:hidden 裁成 clip-reveal
  // 各 chip 用 stagger 延遲，跟 sticky 展開節奏對齊
  const HERO_HIDE_DUR = 0.5;
  const HERO_SHOW_DUR = 0.6;
  function hideHeroChips() {
    heroChips.forEach((el, i) => {
      gsap.to(el, { yPercent: 100, duration: HERO_HIDE_DUR, ease: 'power3.in', delay: i * 0.04, overwrite: true });
    });
  }
  function showHeroChips() {
    heroChips.forEach((el, i) => {
      gsap.to(el, { yPercent: 0, duration: HERO_SHOW_DUR, ease: 'power3.out', delay: i * 0.04, overwrite: true });
    });
  }

  // sticky title reveal 延後到 hero chip 收完才開始 — 避免 hero 還在 / sticky 已出現的重疊期。
  // HERO_HIDE_DUR(0.5) + 最後一張 chip stagger delay(0.04 × 2 = 0.08) ≈ 0.58s，給 0.5s 已足夠視覺收完
  // （power3.in 後半段速度快，視覺到 ~95% 即可開始 reveal sticky）
  const STICKY_REVEAL_DELAY_MS = 500;
  let stickyRevealTimer = null;

  function showCard() {
    if (cardShown) return;
    cardShown = true;
    card.style.visibility = 'visible';
    gsap.to(card, { opacity: 1, duration: 0.3, ease: 'power2.out', overwrite: true });
    // backBtn clip-path 收起時不該被點到 — show 時立即 visible 讓 hit-test 開啟
    if (backBtn) backBtn.style.visibility = 'visible';
    hideHeroChips();
    // sticky chip reveal 延後 = hero 收完才開始（backBtn 在 titleChips 內一起 clip-path reveal）
    if (stickyRevealTimer) { clearTimeout(stickyRevealTimer); stickyRevealTimer = null; }
    stickyRevealTimer = setTimeout(() => {
      if (!cardShown) return;  // 期間被 hideCard 打斷 → 不 reveal
      setChipsState(titleChips, true);
      if (currentBranchIdx !== -1) setChipsState([branchChip], true);
    }, STICKY_REVEAL_DELAY_MS);
  }
  function hideCard() {
    if (!cardShown) return;
    cardShown = false;
    // 取消 pending sticky reveal — 避免「showCard 排好延遲、user 快速 scroll 回去」期間 reveal 仍會 fire
    if (stickyRevealTimer) { clearTimeout(stickyRevealTimer); stickyRevealTimer = null; }
    setChipsState(titleChips, false);
    // branch chip 收起 + 重置 currentBranchIdx，讓下次 scroll 回來 onEnterBack 能重新 setBranch
    clearBranch();
    gsap.to(card, {
      opacity: 0,
      duration: 0.3,
      delay: 0.5,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => { if (!cardShown) card.style.visibility = 'hidden'; },
    });
    // backBtn clip-path collapse 完成（0.5s + 最後 chip stagger delay 0.16s ≈ 0.66s）→ 設 hidden 阻擋 hit-test
    if (backBtn) {
      setTimeout(() => {
        if (!cardShown && backBtn) backBtn.style.visibility = 'hidden';
      }, 700);
    }
    showHeroChips();
  }

  // trigger 用 description section 自己：top + pt-6xl(96px) 經過 viewport center 為邊界。
  // chip 位於 sticky top:50%（viewport center），description content baseline 經過 chip 位置 → 出現；
  // scroll 回 baseline 上方 → 收起。
  // end 用 next-project section top 當邊界 — 整段內容（events list / albums / 主影片 / 紀錄影片）都顯示 sticky title。
  // branch chip 只在 event-galleries-root 範圍內顯示（由下方獨立 ST 控制），影片區只剩 title。
  const galleriesRoot = document.getElementById('event-galleries-root');
  const nextProjectSection = document.getElementById('next-project-section');
  if (descSection && nextProjectSection) {
    ScrollTrigger.create({
      trigger: descSection,
      start: 'top+=96 center',  // section top + pt-6xl(96px) 對齊 viewport center
      endTrigger: nextProjectSection,
      end: 'top center',        // next-project top 過 viewport center → sticky 全收
      onEnter: showCard,
      onLeave: hideCard,
      onEnterBack: showCard,
      onLeaveBack: hideCard,
    });
  }

  // === Branch chip 切換 ===
  // 設計：current event 結束（小 title chip 位於 viewport center，album 底部越過 center）= 收起 + 換字 + reveal 下一個分支。
  // 實作：對 each section 只設 start:'top center'，onEnter / onEnterBack → setBranch(i)。
  //       不設 onLeave / onLeaveBack — 讓 chip 維持顯示直到下一個 section 的 onEnter 接手切換；
  //       全部 sections 離開（進入 nextProject 區域）由 hideCard 統一收起，currentBranchIdx 在 hideCard 內重置。
  // 切換動畫：若 chip 已顯示 → 先 clip-reveal 收 → 400ms 換字 → clip-reveal 展；
  //          chip 還沒顯示（第一次進場）→ 直接換字 → clip-reveal 展
  const eventSections = Array.from(document.querySelectorAll('.event-gallery-section'));
  let currentBranchIdx = -1;
  let branchTimer = null;

  function setBranch(idx, en, zh) {
    if (currentBranchIdx === idx) return;
    const wasShown = currentBranchIdx !== -1 && cardShown;
    currentBranchIdx = idx;
    if (branchTimer) { clearTimeout(branchTimer); branchTimer = null; }
    if (wasShown) {
      // 已在顯示中：收起 → 換字 → 展開
      setChipsState([branchChip], false);
      branchTimer = setTimeout(() => {
        if (currentBranchIdx !== idx) return;
        branchEnEl.textContent = en;
        branchZhEl.textContent = zh;
        if (cardShown) setChipsState([branchChip], true);
      }, 400);
    } else {
      // 第一次進入 event：先 display: '' 才能跑 clip-path reveal
      branchEnEl.textContent = en;
      branchZhEl.textContent = zh;
      branchChip.style.display = '';
      // 強制 reflow 讓 CSS hidden 初始 state 生效，下一幀才 transition 到 shown
      void branchChip.offsetHeight;
      if (cardShown) setChipsState([branchChip], true);
    }
  }
  function clearBranch() {
    if (currentBranchIdx === -1) return;
    currentBranchIdx = -1;
    if (branchTimer) { clearTimeout(branchTimer); branchTimer = null; }
    setChipsState([branchChip], false);
    // transition 結束後 hide，避免 chip 仍佔位（chip group margin 影響 layout）
    branchTimer = setTimeout(() => {
      if (currentBranchIdx === -1) branchChip.style.display = 'none';
    }, 550);
  }

  eventSections.forEach(section => {
    const el = /** @type {HTMLElement} */ (section);
    const en = el.dataset.branchEn || '';
    const zh = el.dataset.branchZh || '';
    const idx = parseInt(el.dataset.eventIndex || '-1', 10);
    if (!en && !zh) return;
    // 只用 start:'top center' 觸發切換，不設 onLeave — 讓 chip 維持顯示直到下一 section 的 onEnter 接手；
    // 從 nextProject 區域 scroll 回最後 section 時 onEnterBack 重新 setBranch。
    // 整個 event-galleries-root 邊界（往上 / 往下離開 albums 區）由下方獨立 ST 統一 clearBranch。
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      onEnter: () => setBranch(idx, en, zh),
      onEnterBack: () => setBranch(idx, en, zh),
    });
  });

  // branch chip 顯示範圍 = event-galleries-root（第一 album top → 最後 album bottom）
  // 往上滑出第一 album top / 往下滑過最後 album bottom → 收 branch；hideCard 也會兜底
  if (galleriesRoot) {
    ScrollTrigger.create({
      trigger: galleriesRoot,
      start: 'top center',
      end: 'bottom center',
      onLeave: () => clearBranch(),
      onLeaveBack: () => clearBranch(),
    });
  }
}