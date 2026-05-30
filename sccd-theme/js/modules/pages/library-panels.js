// @ts-nocheck — 1164 行 querySelector 密集，72 個 TS2339 全為 Element vs HTMLElement 子型別雜訊；
// 結構性問題（每個 .style/.dataset/.value access 都會報），逐處 cast 風險高於價值，整檔跳過
/**
 * Library Panels
 * 負責 Awards / Press / Files / Album 四個 panel 的資料載入、渲染、篩選邏輯
 */

import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { ensureFlagIconsCss } from '../ui/ensure-flag-icons.js';

// ── 共用常數 ──────────────────────────────────────────────────────────────────

const CAT_LABELS = {
  'degree-show':      'Degree Show 畢業展',
  'exhibitions':      'Exhibitions 展演',
  'workshop':         'Workshop 工作營',
  'courses':          'Courses 課程',
  'lectures':         'Lectures 講座',
  'visits':           'Visits 參訪',
  'competitions':     'Competitions 競賽',
  'conferences':      'Conferences 研討會',
  'students-present': 'Students Present 學生自主',
  'industry':         'Industry Partnerships 產學合作',
  'summer-camp':      'Summer Camp 暑期體驗營',
  'moment':           'Moment 日常',
  'others':           'Others 其他',
};

const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

// ── 共用 helpers ──────────────────────────────────────────────────────────────

/** 建立 / 取得 search-empty-state 元素，插在 listEl 之後，左對齊 search bar 左緣 */
function ensureEmptyState(listEl) {
  let el = /** @type {HTMLDivElement | null} */ (listEl.parentElement?.querySelector('.search-empty-state'));
  if (!el) {
    el = document.createElement('div');
    el.className = 'search-empty-state hidden';
    el.style.cssText = 'padding: var(--spacing-xl) 0; text-align: left;';
    el.innerHTML = '<p style="font-size: var(--font-size-p3); font-weight: 700;">No Result</p><p style="font-size: var(--font-size-p3); font-weight: 700;">無結果</p>';
    listEl.insertAdjacentElement('afterend', el);
  }
  return el;
}

/** 依年份分組（維持原本順序，order 由呼叫端控制） */
function groupByYear(items) {
  const byYear = [];
  items.forEach(item => {
    const y = String(item.year);
    let group = byYear.find(g => g.year === y);
    if (!group) { group = { year: y, items: [] }; byYear.push(group); }
    group.items.push(item);
  });
  return byYear;
}

/**
 * 建立年份 Picker 按鈕列
 * @param {HTMLElement} pickerEl  - 容器
 * @param {string[]} years        - 年份陣列（已排序）
 * @param {Function} onFilter     - 每次選取變化後呼叫
 * @returns {Set<string>} selectedYears - 外部可讀的選取狀態
 */
function createYearPicker(pickerEl, years, onFilter) {
  const selected = new Set();

  const updateStyles = () => {
    const hasSel = selected.size > 0;
    pickerEl.querySelectorAll('button').forEach(b => {
      b.style.color = (!hasSel || selected.has(b.dataset.year)) ? 'var(--lib-fg)' : 'rgba(var(--lib-fg-rgb),0.3)';
    });
  };

  years.forEach(year => {
    const btn = document.createElement('button');
    btn.textContent = year;
    btn.dataset.year = year;
    btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-p3);cursor:pointer;font-weight:700;color:var(--lib-fg);';
    btn.addEventListener('click', () => {
      if (selected.has(year)) { selected.delete(year); } else { selected.add(year); }
      if (selected.size === years.length) selected.clear();
      updateStyles();
      onFilter();
    });
    pickerEl.appendChild(btn);
  });

  return selected;
}

/**
 * 綁定分類篩選按鈕（multi-toggle，全選自動 reset）
 * @param {string} btnSelector  - querySelectorAll 選擇器
 * @param {Function} onFilter
 * @returns {Set<string>} selected
 */
function createCatFilter(btnSelector, onFilter) {
  const selected = new Set();
  const btns = [...document.querySelectorAll(btnSelector)];
  const total = btns.length;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (selected.has(cat)) { selected.delete(cat); } else { selected.add(cat); }
      if (selected.size === total) selected.clear();
      // dimmed 樣式
      const hasSel = selected.size > 0;
      btns.forEach(b => b.classList.toggle('dimmed', hasSel && !selected.has(b.dataset.cat)));
      onFilter();
    });
  });

  return selected;
}

/** list item hover 底色 + overlay 顏色 follow */
function bindListItemHover(containerEl, itemSelector, overlaySelector = null) {
  if (window.innerWidth < 768) return;
  containerEl.querySelectorAll(itemSelector).forEach(item => {
    item.addEventListener('mouseenter', () => {
      const color = SCCDHelpers.getRandomAccentColor();
      item.style.background = color;
      if (overlaySelector) {
        item.querySelectorAll(overlaySelector).forEach(overlay => {
          overlay.style.background = color;
        });
      }
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });
  });
}

/** 封面橫圖比例偵測，自動擴寬 wrapper */
function bindCoverRatio(containerEl) {
  containerEl.querySelectorAll('.files-item-cover').forEach(img => {
    const apply = () => {
      if (img.naturalWidth > img.naturalHeight) {
        const wrap = img.closest('.files-item-cover-wrap') || img.parentElement;
        wrap.style.width = Math.min(3.5 * (img.naturalWidth / img.naturalHeight), 7) + 'rem';
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  });
}

/**
 * 偵測文字溢出並啟動 marquee 動畫（一次性）— delegate 到共用 utility
 * @param {HTMLElement} containerEl
 * @param {string} rowSelector
 * @param {string} innerSelector
 */
function runMarqueeOverflow(containerEl, rowSelector, innerSelector) {
  applyMarqueeOverflow(containerEl, rowSelector, innerSelector);
}

// ── Awards Panel ──────────────────────────────────────────────────────────────

function buildMockRecords() {
  const flags = ['tw', 'jp', 'kr', 'us', 'gb', 'de', 'fr'];
  const comps = [
    ['Red Dot Design Award', '紅點設計獎'],
    ['iF Design Award', 'iF設計獎'],
    ['Golden Pin Design Award', '金點設計獎'],
    ['Asia-Pacific Design Award', '亞太設計獎'],
    ['Taiwan Design Award', '台灣設計獎'],
  ];
  const awards = [['Design Award', '設計獎'], ['Animation Award', '動畫獎'], ['Media Award', '媒體獎']];
  const ranks  = [['Gold', '金獎'], ['Silver', '銀獎'], ['Merit', '優獎'], ['Special Award', '特獎']];
  const names  = [
    ['Chen Wei', '陳偉'],
    ['Lin Mei', '林美'],
    ['Wang Hao', '王浩'],
    ['Lee Ying', '李英'],
    ['Zhang Ming', '張明'],
    ['Huang Yi-Chen', '黃宜臻'],
    ['Hsu Pei-Ling', '許珮玲'],
    ['Wu Cheng-Hao', '吳承皓'],
  ];
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 20 }, (_, i) => ({
    year: currentYear - i,
    items: Array.from({ length: 5 }, (_, j) => {
      // 每 row 1~4 個獲獎者（混合單人 / 團體獎），用 deterministic pattern 不依賴 Math.random
      const winnerCount = ((i * 7 + j * 3) % 4) + 1;
      const winners = Array.from({ length: winnerCount }, (_, k) => {
        const idx = (i * 5 + j * 2 + k) % names.length;
        return { en: names[idx][0], zh: names[idx][1] };
      });
      return {
        flag:           flags[(i * 5 + j) % flags.length],
        competition_en: comps[j][0],
        competition:    comps[j][1],
        award_en:       awards[j % awards.length][0],
        award:          awards[j % awards.length][1],
        rank_en:        ranks[(i + j) % ranks.length][0],
        rank:           ranks[(i + j) % ranks.length][1],
        winners,
      };
    }),
  }));
}

async function initAwardsPanel(onEntranceDoneCallback) {
  try {
    ensureFlagIconsCss();
    const res = await fetch('/data/records.json');
    const data = await res.json();
    const realRecords  = Array.isArray(data) ? data : data.records;
    const awardsImages = Array.isArray(data) ? [] : (data.awardsImages || []);

    const realYears = new Set(realRecords.map(r => r.year));
    const records = [...realRecords, ...buildMockRecords().filter(r => !realYears.has(r.year))]
      .sort((a, b) => b.year - a.year)
      .slice(0, 20);

    const listEl = document.getElementById('library-awards-list');
    if (!listEl) return;

    // ── 渲染 ──
    const bilingual     = (en, zh) => en ? `<span>${en}</span><span>${zh}</span>` : `<span>${zh}</span>`;
    const bilingualBold = (en, zh) => en
      ? `<span style="font-weight:700;">${en}</span><span style="font-weight:800;">${zh}</span>`
      : `<span style="font-weight:800;">${zh}</span>`;

    let latestFirst = true;
    const getSorted = () => latestFirst ? records : [...records].reverse();

    // Winners normalize：支援新 schema `winners:[{en,zh}]` 與舊 `winner_en`/`winner` 單人
    // 回傳統一 array of {en, zh}，至少 1 筆
    const normalizeWinners = (item) => {
      if (Array.isArray(item.winners) && item.winners.length) {
        return item.winners.map(w => ({ en: w.en || w.winner_en || '', zh: w.zh || w.winner || '' }));
      }
      return [{ en: item.winner_en || '', zh: item.winner || '' }];
    };

    // 多 winner 時用「水平 marquee」自動跑：整列獲獎者橫向滾動，hover 不需要
    // 結構：.award-winners (overflow:hidden) > .award-winners-track (橫向 inline-flex) > N × .award-winner-pair (column EN+ZH)
    // pairs 之間用 padding-right 拉開 gap，避免兩位獲獎者文字黏在一起
    const buildWinnersHtml = (winners) => {
      const pairs = winners.map(w => {
        const enHtml = w.en ? `<div class="award-winner-en" style="font-weight:700;">${w.en}</div>` : '';
        const zhHtml = w.zh ? `<div class="award-winner-zh" style="font-weight:800;">${w.zh}</div>` : '';
        return `<div class="award-winner-pair">${enHtml}${zhHtml}</div>`;
      }).join('');
      return `<div class="award-winners-track">${pairs}</div>`;
    };

    // 多獲獎者水平 marquee：每位獲獎者佔滿整個 col 寬，整位整位滾（不會卡到一半）
    // viewport = grid col 寬 → 量 view.offsetWidth 當作 pair 寬，強制 set 到每個 pair
    // 滾動距離 = pairW × pairs.length（=複製前 track 寬），複製一份接合 seamless loop
    // 手機（< 768）：pair 不 viewport-wide（會異常慢），改自然寬度排列 + 純 CSS marquee
    //                CSS marquee keyframe = translateX(-50%) 配合複製一份 seamless；duration 依名字數線性放大
    function applyWinnersHMarquee(scope) {
      const isMobile = window.innerWidth < 768;
      const SECONDS_PER_WINNER = isMobile ? 3 : 2.5;
      scope.querySelectorAll('.award-winners').forEach(viewport => {
        const view = /** @type {HTMLElement} */ (viewport);
        const track = /** @type {HTMLElement | null} */ (view.querySelector('.award-winners-track'));
        if (!track) return;
        const pairs = /** @type {HTMLElement[]} */ ([...track.querySelectorAll('.award-winner-pair')]);
        if (pairs.length <= 1) return;

        if (isMobile) {
          // 手機：pair 自然寬度 + 複製一份 seamless（CSS keyframe translateX -50% 接合）
          // pair 之間 gap 由 CSS .award-winners-track { gap: 2xl } 控
          const origHtml = track.innerHTML;
          track.innerHTML = origHtml + origHtml;
          view.classList.add('is-hmarquee');
          view.style.setProperty('--hmarquee-duration', `${pairs.length * SECONDS_PER_WINNER}s`);
          return;
        }

        // 桌面：量 viewport 寬（= grid col 寬）當作每位獲獎者佔的單位寬度
        const pairW = view.offsetWidth;
        if (!pairW) return;

        // 強制每個 pair 寬 = viewport 寬（取代 padding-right gap，靜止時剛好顯示一位）
        pairs.forEach(p => { p.style.width = `${pairW}px`; p.style.paddingRight = '0'; });

        // 滾動距離 = N 位獲獎者寬度（= 複製前的 track 寬）
        const distance = pairW * pairs.length;

        // 複製整段 pairs 一份接在後面 → seamless loop
        const origHtml = track.innerHTML;
        track.innerHTML = origHtml + origHtml;
        // innerHTML reset 後新 pair 也要 set 寬（這次包含複製份）
        track.querySelectorAll('.award-winner-pair').forEach(p => {
          /** @type {HTMLElement} */ (p).style.width = `${pairW}px`;
          /** @type {HTMLElement} */ (p).style.paddingRight = '0';
        });

        view.classList.add('is-hmarquee');
        view.style.setProperty('--hmarquee-distance', `-${distance}px`);
        view.style.setProperty('--hmarquee-duration', `${pairs.length * SECONDS_PER_WINNER}s`);
      });
    }

    function renderItems(data) {
      listEl.innerHTML = '';
      data.forEach(yearGroup => {
        const itemsHtml = (yearGroup.items || []).map((item) => {
          const winners = normalizeWinners(item);
          const winnerSearch = winners.map(w => `${w.en} ${w.zh}`).join(' ');
          const searchText = [item.competition_en, item.competition, item.award_en, item.award, winnerSearch, item.rank_en, item.rank]
            .filter(Boolean).join(' ').toLowerCase();
          return `
            <div class="award-record-item grid py-[0.5rem] border-b-2 border-black"
                 style="grid-template-columns: 1.5em 4.5fr 1.5fr 1fr 1fr; gap: 0 2rem; font-size: var(--font-size-p3); align-items: start;"
                 data-search="${searchText}"${item.id ? ` id="${item.id}"` : ''}>
              <div style="padding-top: 0.1em;">${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}</div>
              <div class="truncate flex flex-col">${bilingualBold(item.competition_en, item.competition)}</div>
              <div class="truncate flex flex-col">${bilingual(item.award_en, item.award)}</div>
              <div class="truncate flex flex-col">${bilingual(item.rank_en, item.rank)}</div>
              <div class="award-winners flex flex-col" style="min-width:0;">${buildWinnersHtml(winners)}</div>
            </div>`;
        }).join('');

        listEl.insertAdjacentHTML('beforeend', `
          <div class="year-block" data-year="${yearGroup.year}" style="margin-bottom: var(--spacing-2xl);">
            <div style="font-size: var(--font-size-p3); font-weight: 700; padding: 0.35rem 0 0.25rem; position: sticky; top: -1px; background: var(--lib-bg); z-index: 2; margin-top: -0.35rem;">${yearGroup.year}</div>
            <div class="flex flex-col">${itemsHtml}</div>
          </div>`);
      });

      listEl.querySelectorAll('.award-record-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.style.color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
        });
        item.addEventListener('mouseleave', () => { item.style.color = ''; });
      });

      // 多獲獎者自動水平 marquee（不需 hover）
      applyWinnersHMarquee(listEl);
    }

    renderItems(getSorted());

    // 年份 Picker
    const yearPickerEl = document.getElementById('library-year-picker');
    if (yearPickerEl) {
      const dataYears   = new Set(records.map(g => String(g.year)));
      const currentYear = new Date().getFullYear();
      const allYears    = [];
      for (let y = currentYear; y >= 1997; y--) allYears.push(y);

      const selectedYears = new Set();

      const updateList = () => {
        listEl.querySelectorAll('.year-block').forEach(b => {
          b.style.display = selectedYears.size === 0 || selectedYears.has(b.dataset.year) ? '' : 'none';
        });
      };
      const updateBtns = () => {
        const hasSel = selectedYears.size > 0;
        yearPickerEl.querySelectorAll('button').forEach(b => {
          b.style.color = (!hasSel || selectedYears.has(b.dataset.year)) ? 'var(--lib-fg)' : 'rgba(var(--lib-fg-rgb),0.3)';
        });
      };

      allYears.forEach(year => {
        if (!dataYears.has(String(year))) return;
        const btn = document.createElement('button');
        btn.textContent  = String(year);
        btn.dataset.year = String(year);
        btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-p3);cursor:pointer;font-weight:700;color:var(--lib-fg);';
        btn.addEventListener('click', () => {
          if (selectedYears.has(String(year))) { selectedYears.delete(String(year)); } else { selectedYears.add(String(year)); }
          updateBtns();
          updateList();
        });
        yearPickerEl.appendChild(btn);
      });
    }

    // Search
    const searchInput = document.getElementById('library-awards-search');
    if (searchInput) {
      // Empty state（No Result / 無結果，靠左對齊 search bar 左緣）
      const emptyState = ensureEmptyState(listEl);
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        listEl.querySelectorAll('.year-block').forEach(block => {
          const items   = [...block.querySelectorAll('.award-record-item')];
          const visible = items.filter(item => !q || (item.dataset.search || '').includes(q));
          items.forEach(item => { item.style.display = visible.includes(item) ? '' : 'none'; });
          // 不動 border classes — items 保持 render template 的 default `border-b-2 border-black`。
          // 之前 toggle border-b-4 + border-black 兩個 bug：(1) toggle(border-black, false) 剝掉
          // default class → last visible item 失色變灰；(2) border-b-4 疊在 default border-b-2 上
          // user 感知成「重複繪製」加粗綫。完全不動 border 最乾淨，所有 visible items 一致 2px 黑。
          // 防禦性 cleanup：之前舊邏輯可能留下 border-b-4，補移除一次（idempotent）。
          items.forEach(item => {
            item.classList.remove('border-b-4');
            item.classList.add('border-black');
          });
          block.style.display = visible.length ? '' : 'none';
        });
        // 顯示 / 隱藏 empty state
        const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.year-block')]).some(b => b.style.display !== 'none');
        emptyState.classList.toggle('hidden', !q || anyVisible);
      });
    }

    // Sort
    const sortBtn = document.getElementById('library-awards-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-p3`;
        renderItems(getSorted());
      });
    }

    // Awards Ticker
    const tickerWrapper = document.querySelector('#library-awards-ticker .awards-ticker-wrapper');
    if (tickerWrapper && awardsImages.length > 0) {
      const createTrack = () => {
        const track = document.createElement('div');
        track.style.cssText = 'display:flex;gap:var(--spacing-2xl);padding-right:var(--spacing-2xl);flex-shrink:0;align-items:center;';
        awardsImages.forEach(src => {
          const img = document.createElement('img');
          img.src = src; img.alt = 'Award';
          img.style.cssText = 'height:60px;width:auto;object-fit:contain;filter:grayscale(1);flex-shrink:0;transition:opacity 0.3s ease;';
          img.onerror = () => { img.style.display = 'none'; };
          track.appendChild(img);
        });
        return track;
      };
      tickerWrapper.innerHTML = '';
      tickerWrapper.style.cssText = 'display:flex;';
      const t1 = createTrack(), t2 = createTrack();
      tickerWrapper.appendChild(t1);
      tickerWrapper.appendChild(t2);

      // 等進場動畫完成後再量寬度
      onEntranceDoneCallback(() => {
        requestAnimationFrame(() => {
          const trackW = t1.offsetWidth;
          
          if (typeof gsap !== 'undefined') {
            const duration = trackW / 80;
            const tween = gsap.to([t1, t2], {
              x: `-=${trackW}`,
              ease: "none",
              duration: duration,
              repeat: -1
            });

            // 滑鼠懸停 ticker 區域時，整體速度減半 (0.5)，離開時恢復 (1)
            tickerWrapper.addEventListener('mouseenter', () => gsap.to(tween, { timeScale: 0.5, duration: 0.3 }));
            tickerWrapper.addEventListener('mouseleave', () => gsap.to(tween, { timeScale: 1, duration: 0.3 }));

            // Hover 圖片時，其他圖片降至 50% 不透明度（桌面版專用）
            // 使用 mousemove + elementFromPoint 即時偵測，避免 ticker 移動時游標脫離元素造成閃爍
            const isDesktop = window.SCCDHelpers ? window.SCCDHelpers.isDesktop() : window.innerWidth >= 768;
            if (isDesktop) {
              let rafId = null;
              let lastMouseX = 0, lastMouseY = 0;
              let isInsideContainer = false;
              const allImgs = tickerWrapper.querySelectorAll('img');

              const updateHighlight = () => {
                const el = document.elementFromPoint(lastMouseX, lastMouseY);
                const hovered = el ? el.closest('img') : null;
                allImgs.forEach(img => {
                  img.style.opacity = (!hovered || img === hovered) ? '1' : '0.5';
                });
                if (isInsideContainer) rafId = requestAnimationFrame(updateHighlight);
              };

              tickerWrapper.addEventListener('mouseenter', (e) => { isInsideContainer = true; lastMouseX = e.clientX; lastMouseY = e.clientY; rafId = requestAnimationFrame(updateHighlight); });
              tickerWrapper.addEventListener('mousemove', (e) => { lastMouseX = e.clientX; lastMouseY = e.clientY; });
              tickerWrapper.addEventListener('mouseleave', () => { isInsideContainer = false; cancelAnimationFrame(rafId); allImgs.forEach(img => { img.style.opacity = '1'; }); });
            }
          } else {
            // Fallback: 如果環境沒有讀取到 GSAP，使用原本的 CSS 動畫
            const style  = document.createElement('style');
            style.textContent = `@keyframes awards-ticker { from { transform: translateX(0); } to { transform: translateX(-${trackW}px); } }`;
            document.head.appendChild(style);
            tickerWrapper.style.animation = `awards-ticker ${Math.round(trackW / 80)}s linear infinite`;
          }
        });
      });
    } else if (tickerWrapper) {
      document.getElementById('library-awards-ticker').style.display = 'none';
    }

  } catch (e) {
    console.error('Library awards load error:', e);
  }
}

// ── Press Panel ───────────────────────────────────────────────────────────────

async function initPressPanel() {
  try {
    const pressData = await fetch('/data/press.json').then(r => r.json());

    const listEl      = document.getElementById('library-press-list');
    const yearPickerEl = document.getElementById('library-press-year-picker');
    const searchInput = document.getElementById('library-press-search');
    if (!listEl) return;

    let latestFirst = true;
    const sorted = [...pressData].sort((a, b) => Number(b.year) - Number(a.year));
    const getSorted = () => latestFirst ? sorted : [...sorted].reverse();

    function renderItems(items) {
      listEl.innerHTML = '';
      groupByYear(items).forEach(group => {
        const block = document.createElement('div');
        block.className  = 'press-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className = 'press-year-label';
        label.textContent = group.year;
        block.appendChild(label);

        group.items.forEach(item => {
          const div = document.createElement('div');
          div.className       = 'press-item';
          if (item.id) div.id = item.id; // 供 hash deep link 使用
          div.dataset.year    = String(item.year);
          div.dataset.cat     = item.category || '';
          div.dataset.search  = [item.titleEn, item.titleZh, item.subtitleEn, item.subtitleZh].filter(Boolean).join(' ').toLowerCase();
          const hasMedia  = !!(item.image || item.pdfUrl || item.videoUrl);
          // 副標 EN/ZH 拆成兩個獨立 span：桌面 CSS inline 視覺一行（中間 &ensp; 由 ::after 補），手機 block 拆兩行
          const subtitleEnHtml = item.subtitleEn ? `<span class="press-item-subtitle press-item-subtitle-en"><span class="press-subtitle-inner">${item.subtitleEn}</span></span>` : '';
          const subtitleZhHtml = item.subtitleZh ? `<span class="press-item-subtitle press-item-subtitle-zh"><span class="press-subtitle-inner">${item.subtitleZh}</span></span>` : '';
          const hasSubtitle = !!(item.subtitleEn || item.subtitleZh);
          const metaHtml = (hasSubtitle || item.date) ? `
            <div class="press-item-meta">
              ${hasSubtitle ? `<span class="press-item-subtitle-wrap">${subtitleEnHtml}${subtitleZhHtml}</span>` : ''}
              <span class="press-item-meta-right">
                ${item.date ? `<span class="press-item-date">${item.date}</span>` : ''}
                ${hasMedia  ? `<span class="icon icon-album press-item-media-icon"></span>` : ''}
              </span>
            </div>` : '';
          div.innerHTML = `
            <div class="press-item-row">
              <div class="press-item-titles">
                <p class="press-item-title-en"><span class="press-marquee-inner">${item.titleEn || ''}</span></p>
                <p class="press-item-title-zh"><span class="press-marquee-inner">${item.titleZh || ''}</span></p>
                ${metaHtml}
              </div>
              <span class="press-item-cat-tag" data-show-in-all></span>
            </div>`;
          if (item.image || item.videoUrl) {
            div.style.cursor = "url('/custom-cursor/pointer.svg') 14 1, pointer";
            const media = [];
            if (item.image)    media.push({ type: 'image', src: item.image, thumb: item.image });
            if (item.videoUrl) {
              const vid = item.videoUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
              if (vid) media.push({ type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` });
            }
            if (media.length) {
              const lbTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
              const lbColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
              div.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media, index: 0, title: lbTitle, color: lbColor, references: item.references } }));
              });
            }
          } else if (item.pdfUrl) {
            div.style.cursor = "url('/custom-cursor/pointer.svg') 14 1, pointer";
            const pdfTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
            const pdfColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            // library 場景：references 反查所有 activity 中 ref 此 PDF 的來源（不 exclude，full list）
            // 若 library item 內 user 手填 references，union 進去（自動反查 + 手填可並存）
            div.addEventListener('click', async () => {
              const { getPdfRefSources } = await import('./pdf-cross-ref-index.js');
              const auto = await getPdfRefSources(item.pdfUrl);
              const manual = Array.isArray(item.references) ? item.references : [];
              const seen = new Set();
              const references = [...auto, ...manual].filter(r => {
                if (!r || !r.section || !r.itemId) return false;
                const k = `${r.section}::${r.itemId}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
              document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl, title: pdfTitle, color: pdfColor, references } }));
            });
          }
          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindListItemHover(listEl, '.press-item');

      // marquee 溢出偵測（panel 顯示後才執行）
      // 不 self-null：tab 切回 / window resize 變寬度後需重算；applyMarqueeOverflow 內含 dual-copy → single
      // reset 邏輯所以重跑安全
      window._pressMarqueeInit = () => {
        runMarqueeOverflow(listEl,
          '.press-item-title-en, .press-item-title-zh, .press-item-subtitle',
          '.press-marquee-inner, .press-subtitle-inner');
      };
    }

    renderItems(getSorted());

    const pressEmptyState = ensureEmptyState(listEl);

    function applyFiltersWithRef() {
      const q     = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const isAll = selectedCats.size === 0;
      listEl.querySelectorAll('.press-year-block').forEach(block => {
        const yearMatch = selectedYears.size === 0 || selectedYears.has(block.dataset.year);
        let anyVisible  = false;
        block.querySelectorAll('.press-item').forEach(item => {
          const catMatch    = isAll || selectedCats.has(item.dataset.cat);
          const searchMatch = !q || item.dataset.search.includes(q);
          const visible = catMatch && yearMatch && searchMatch;
          item.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
          const tag = item.querySelector('.press-item-cat-tag');
          if (tag) {
            tag.textContent   = (isAll && visible) ? (CAT_LABELS[item.dataset.cat] || '') : '';
            tag.style.display = (isAll && visible) ? '' : 'none';
          }
          const titles = item.querySelector('.press-item-titles');
          if (titles) titles.style.maxWidth = isAll ? 'calc(100% - 10rem)' : '100%';
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      const hasSel = selectedCats.size > 0;
      // 搜尋時：有 match 的 cat 黑色，沒有的灰色
      const catsWithMatch = q
        ? new Set([...listEl.querySelectorAll('.press-item')].filter(i => i.dataset.search.includes(q)).map(i => i.dataset.cat))
        : null;
      document.querySelectorAll('.lib-press-cat-btn').forEach(b => {
        b.classList.toggle('dimmed', hasSel && !selectedCats.has(b.dataset.cat));
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(var(--lib-fg-rgb),0.3)' : '';
      });
      // Empty state：search 有輸入但沒任何 block 可見才顯示
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.press-year-block')]).some(b => b.style.display !== 'none');
      pressEmptyState.classList.toggle('hidden', !q || anyVisible);
    }

    // 分類按鈕 + 年份 Picker
    const selectedCats  = createCatFilter('.lib-press-cat-btn', applyFiltersWithRef);
    const years = [...new Set(sorted.map(p => String(p.year)))].sort((a, b) => Number(b) - Number(a));
    const selectedYears = createYearPicker(yearPickerEl, years, applyFiltersWithRef);

    // 排序
    const sortBtn = document.getElementById('library-press-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-p3`;
        renderItems(getSorted());
        applyFiltersWithRef();
      });
    }

    if (searchInput) searchInput.addEventListener('input', applyFiltersWithRef);

    applyFiltersWithRef();

  } catch (e) {
    console.error('Library press load error:', e);
  }
}

// ── Files Panel ───────────────────────────────────────────────────────────────

async function initFilesPanel() {
  try {
    const filesData = await fetch('/data/library.json').then(r => r.json());

    const listEl       = document.getElementById('library-files-list');
    const yearPickerEl = document.getElementById('library-files-year-picker');
    const searchInput  = document.getElementById('library-files-search');
    if (!listEl) return;

    let latestFirst = true;
    const sorted = [...filesData].sort((a, b) => Number(b.year) - Number(a.year));
    const getSorted = () => latestFirst ? sorted : [...sorted].reverse();

    function renderItems(data) {
      listEl.innerHTML = '';
      groupByYear(data).forEach(group => {
        const block = document.createElement('div');
        block.className    = 'files-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className   = 'press-year-label';
        label.textContent = group.year;
        block.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'files-grid';

        group.items.forEach(item => {
          const div  = document.createElement('div');
          div.className  = 'files-item files-item-card';
          if (item.id) div.id = `f-${item.id}`;
          const cats = Array.isArray(item.categories) ? item.categories : (item.category ? [item.category] : []);
          div.dataset.year   = String(item.year);
          div.dataset.cats   = JSON.stringify(cats);
          div.dataset.search = [item.titleEn, item.titleZh].filter(Boolean).join(' ').toLowerCase();
          const catTagsHtml  = cats.map(c => CAT_LABELS[c]).filter(Boolean)
            .map(l => `<span class="files-item-subtitle-tag"><span class="files-marquee-inner">${l}</span></span>`).join('');

          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
          // 旋轉：sign 隨機 × magnitude 1~3，範圍 [-3,-1] ∪ [1,3]，排除 0 和近 0 避免卡片看起來都一樣
          const finalDeg = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2);
          // rotation 直接套在 image / empty placeholder 上（不是 inner），transform-origin = image 中心
          const coverContent = item.cover
            ? `<img class="files-item-cover" data-init-deg="${finalDeg}" style="transform: rotate(${finalDeg}deg);" src="${item.cover}" alt="">`
            : `<div class="files-item-cover files-item-cover--empty" data-init-deg="${finalDeg}" style="transform: rotate(${finalDeg}deg);"></div>`;
          const coverHtml = `
            <div class="files-card-cover-wrap">
              <div class="files-item-cover-inner">
                ${coverContent}
                <div class="files-thumb-overlay" style="background: ${accentColor};"></div>
              </div>
            </div>`;
          const titleEnHtml = item.titleEn ? `<p class="files-item-title-en"><span class="files-marquee-inner">${item.titleEn}</span></p>` : '';
          const titleZhHtml = item.titleZh ? `<p class="files-item-title-zh"><span class="files-marquee-inner">${item.titleZh}</span></p>` : '';
          div.innerHTML = `
            ${coverHtml}
            <div class="files-item-titles files-card-info">
              <div class="files-item-titles-text">${titleEnHtml}${titleZhHtml}</div>
              ${catTagsHtml ? `<div class="files-item-subtitle-wrap">${catTagsHtml}</div>` : ''}
            </div>`;

          if (item.pdfUrl) {
            div.style.cursor = "url('/custom-cursor/pointer.svg') 14 1, pointer";
            const pdfTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
            // 同 Press panel：library 場景反查 activity → 此 PDF；手填 references union 進去
            div.addEventListener('click', async () => {
              const { getPdfRefSources } = await import('./pdf-cross-ref-index.js');
              const auto = await getPdfRefSources(item.pdfUrl);
              const manual = Array.isArray(item.references) ? item.references : [];
              const seen = new Set();
              const references = [...auto, ...manual].filter(r => {
                if (!r || !r.section || !r.itemId) return false;
                const k = `${r.section}::${r.itemId}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
              document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl, title: pdfTitle, color: accentColor, references } }));
            });
          }

          grid.appendChild(div);
        });

        block.appendChild(grid);
        listEl.appendChild(block);
      });

      if (window.innerWidth >= 768) {
        listEl.querySelectorAll('.files-item-card').forEach(item => {
          const cover = item.querySelector('.files-item-cover');
          if (!cover) return;
          item.addEventListener('mouseenter', () => {
            gsap.to(cover, { rotation: 0, duration: 0.3, ease: 'power2.out' });
          });
          item.addEventListener('mouseleave', () => {
            const deg = parseFloat(cover.dataset.initDeg) || 0;
            gsap.to(cover, { rotation: deg, duration: 0.3, ease: 'power2.out' });
          });
        });
      }

      bindListItemHover(listEl, '.files-item', '.files-thumb-overlay');

      window._filesMarqueeInit = () => {
        runMarqueeOverflow(listEl, '.files-item-title-en, .files-item-title-zh, .files-item-subtitle-tag', '.files-marquee-inner');
      };
    }

    renderItems(getSorted());

    const filesEmptyState = ensureEmptyState(listEl);

    const selectedCats  = new Set();
    const selYears      = (() => {
      const years = [...new Set(sorted.map(p => String(p.year)))].sort((a, b) => Number(b) - Number(a));
      return createYearPicker(yearPickerEl, years, () => applyFilters());
    })();

    function applyFilters() {
      const q     = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const isAll = selectedCats.size === 0;
      listEl.querySelectorAll('.files-year-block').forEach(block => {
        const yearMatch = selYears.size === 0 || selYears.has(block.dataset.year);
        let anyVisible  = false;
        block.querySelectorAll('.files-item').forEach(item => {
          const itemCats    = JSON.parse(item.dataset.cats || '[]');
          const catMatch    = isAll || itemCats.some(c => selectedCats.has(c));
          const searchMatch = !q || item.dataset.search.includes(q);
          const visible = catMatch && yearMatch && searchMatch;
          item.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
          const subtitleWrap = item.querySelector('.files-item-subtitle-wrap');
          const singleCat = selectedCats.size === 1;
          if (subtitleWrap) {
            subtitleWrap.style.opacity = singleCat ? '0' : '';
            subtitleWrap.style.pointerEvents = singleCat ? 'none' : '';
          }
          const titlesEl = item.querySelector('.files-item-titles');
          if (titlesEl) titlesEl.style.transform = singleCat ? 'translateY(0.7rem)' : '';
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      const hasSel = selectedCats.size > 0;
      const catsWithMatch = q
        ? new Set([...listEl.querySelectorAll('.files-item')].flatMap(i => JSON.parse(i.dataset.cats || '[]')).filter(c => {
            return [...listEl.querySelectorAll('.files-item')].some(i => JSON.parse(i.dataset.cats || '[]').includes(c) && i.dataset.search.includes(q));
          }))
        : null;
      document.querySelectorAll('.lib-files-cat-btn').forEach(b => {
        b.classList.toggle('dimmed', hasSel && !selectedCats.has(b.dataset.cat));
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(var(--lib-fg-rgb),0.3)' : '';
      });
      // Empty state：search 有輸入但沒任何 block 可見才顯示
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.files-year-block')]).some(b => b.style.display !== 'none');
      filesEmptyState.classList.toggle('hidden', !q || anyVisible);
    }

    // 分類按鈕（手動綁定以共用 selectedCats）
    const filesCatBtns = [...document.querySelectorAll('.lib-files-cat-btn')];
    filesCatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (selectedCats.has(cat)) { selectedCats.delete(cat); } else { selectedCats.add(cat); }
        if (selectedCats.size === filesCatBtns.length) selectedCats.clear();
        applyFilters();
      });
    });

    const sortBtn = document.getElementById('library-files-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-p3`;
        renderItems(getSorted());
        applyFilters();
      });
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    applyFilters();

  } catch (e) {
    console.error('Library files load error:', e);
  }
}

// ── Album Panel ───────────────────────────────────────────────────────────────

const ALBUM_SOURCES = [
  { url: '/data/workshops.json',         cat: 'workshop',         isDegreeShow: false },
  { url: '/data/degree-show.json',        cat: 'degree-show',      isDegreeShow: true  },
  { url: '/data/summer-camp.json',        cat: 'summer-camp',      isDegreeShow: false },
  { url: '/data/students-present.json',   cat: 'students-present', isDegreeShow: false },
  { url: '/data/general-activities.json', cat: 'moment',           isDegreeShow: false },
  { url: '/data/lectures.json',           cat: 'lectures',         isDegreeShow: false },
  { url: '/data/industry.json',           cat: 'industry',         isDegreeShow: false },
  { url: '/data/album-others.json',       cat: 'others',           isDegreeShow: false },
];

function getCover(item) {
  return item.cover || item.poster || item.coverImage || (item.images && item.images[0]) || '';
}

function normalizeDegreeShow(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).map(([y, entry]) => ({ year: parseInt(y, 10), items: [entry] }));
}

async function initAlbumPanel() {
  try {
    const results = await Promise.all(
      ALBUM_SOURCES.map(s => fetch(s.url).then(r => r.json()).catch(() => null))
    );

    const allItems = [];
    results.forEach((data, i) => {
      const { cat, isDegreeShow } = ALBUM_SOURCES[i];
      const groups = isDegreeShow ? normalizeDegreeShow(data) : (Array.isArray(data) ? data : []);
      groups.forEach(({ year, items }) => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
          const cover   = getCover(item);
          const titleEn = item.title_en || item.titleEn || item.title || '';
          const titleZh = item.title_zh || item.titleZh || item.title_cn || '';
          const images  = (item.images || []).filter(s => s && s !== cover);
          let videos = [];
          if (item.videoUrl) videos = [item.videoUrl];
          else if (Array.isArray(item.videos)) videos = item.videos;
          const media = [
            ...(cover ? [{ type: 'image', src: cover, thumb: cover }] : []),
            ...videos.map(url => {
              const vid = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
              return vid ? { type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` } : null;
            }).filter(Boolean),
            ...images.map(src => ({ type: 'image', src, thumb: src })),
          ];
          allItems.push({ year, cat, titleEn, titleZh, cover, media, references: item.references });
        });
      });
    });

    allItems.sort((a, b) => b.year - a.year);
    const sorted = allItems;

    const listEl       = document.getElementById('library-album-list');
    const yearPickerEl = document.getElementById('library-album-year-picker');
    const searchInput  = document.getElementById('library-album-search');
    if (!listEl) return;

    let latestFirst = true;
    const getSorted = () => latestFirst ? sorted : [...sorted].reverse();

    function renderItems(data) {
      listEl.innerHTML = '';
      groupByYear(data).forEach(group => {
        const block = document.createElement('div');
        block.className    = 'album-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className   = 'press-year-label';
        label.textContent = group.year;
        block.appendChild(label);

        group.items.forEach(item => {
          const div = document.createElement('div');
          div.className      = 'files-item album-panel-item';
          if (item.id) div.id = `album-${item.id}`; // 供 hash deep link 使用
          div.dataset.year   = String(item.year);
          div.dataset.cat    = item.cat;
          div.dataset.search = [item.titleEn, item.titleZh].filter(Boolean).join(' ').toLowerCase();

          // random accent color per item (for hover overlay)
          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];

          const catTagHtml = `<span class="files-item-subtitle-tag">${CAT_LABELS[item.cat] || item.cat}</span>`;

          // thumbnails: 全部 media（2026-05-27 user 要求「有幾張放幾張，自然排列、不要 stack」）
          // 桌面 CSS 仍套舊 absolute stack 視覺，手機 CSS 改 flex-wrap 排成自然 row（library.css album 手機 rule）
          const thumbMedia = (item.media || []);
          const thumbsHtml = thumbMedia.map((m, ti) => {
            const sign = Math.random() < 0.4 ? -1 : 1;
            const finalDeg = sign > 0 ? (Math.random() * 5.5 + 0.5) : -(Math.random() * 3.5 + 0.5);
            const src = m.thumb || m.src;
            return `
              <div class="album-thumb" data-thumb-index="${ti}" data-init-deg="${finalDeg}" style="transform: rotate(${finalDeg}deg);">
                <img src="${src}" alt="" loading="lazy">
                <div class="album-thumb-overlay" style="background: ${accentColor};"></div>
                ${m.type === 'video' ? '<div class="album-thumb-play"></div>' : ''}
              </div>`;
          }).join('');

          const thumbStripHtml = thumbMedia.length > 0
            ? `<div class="album-thumb-strip">${thumbsHtml}</div>`
            : '';

          const titleEnHtml = item.titleEn ? `<p class="files-item-title-en"><span class="files-marquee-inner">${item.titleEn}</span></p>` : '';
          const titleZhHtml = item.titleZh ? `<p class="files-item-title-zh"><span class="files-marquee-inner">${item.titleZh}</span></p>` : '';
          const oneLang = !!(item.titleEn) !== !!(item.titleZh);
          div.innerHTML = `
            <div class="album-files-item-row">
              <div class="files-item-titles">
                <div class="files-item-titles-text${oneLang ? ' files-item-titles-text--center' : ''}">${titleEnHtml}${titleZhHtml}</div>
                <div class="files-item-subtitle-wrap album-cat-tag-wrap">${catTagHtml}</div>
              </div>
              ${thumbStripHtml ? `<div class="album-thumb-strip-wrap">${thumbStripHtml}</div>` : ''}
            </div>`;

          if (item.media && item.media.length > 0) {
            div.style.cursor = "url('/custom-cursor/pointer.svg') 14 1, pointer";
            const lbTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
            const lbColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            div.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media: item.media, index: 0, title: lbTitle, color: lbColor, references: item.references } }));
            });
          }

          // 圖片 load 後依比例設尺寸（default 和 hover 一致，不 crop）
          div.querySelectorAll('.album-thumb img').forEach(img => {
            const applyRatio = () => {
              const thumb = img.parentElement;
              const natW = img.naturalWidth;
              const natH = img.naturalHeight;
              if (!natW || !natH) return;

              const isLandscape = natW > natH;
              if (isLandscape) {
                // 橫式：max-width 8rem、max-height 4.5rem，等比例
                const maxW = 8 * 16;  // 8rem in px
                const maxH = 4.5 * 16; // 4.5rem in px
                const scale = Math.min(maxW / natW, maxH / natH);
                const w = Math.round(natW * scale);
                const h = Math.round(natH * scale);
                thumb.style.width  = w + 'px';
                thumb.style.height = h + 'px';
                img.style.width  = '100%';
                img.style.height = '100%';
              } else {
                // 直式：高度 4.5rem，寬度等比例
                const h = 4.5 * 16;
                const scale = h / natH;
                const w = Math.round(natW * scale);
                thumb.style.width  = w + 'px';
                thumb.style.height = h + 'px';
                img.style.width  = '100%';
                img.style.height = '100%';
              }
            };
            if (img.complete && img.naturalWidth) applyRatio();
            else img.addEventListener('load', applyRatio, { once: true });
          });

          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindCoverRatio(listEl);

      // GSAP hover：stack ↔ 展開
      if (window.innerWidth >= 768) {
        listEl.querySelectorAll('.album-panel-item').forEach(item => {
          const strip  = item.querySelector('.album-thumb-strip');
          const thumbs = [...item.querySelectorAll('.album-thumb')];
          if (!strip || !thumbs.length) return;

          item.addEventListener('mouseenter', () => {
            // 計算展開位置：從右到左排列（用 x 偏移而非 right，避免 CSS layout + transform 混用導致垂直偏移）
            const gap = 12;
            let cursor = 0;
            const offsets = [];
            for (let i = thumbs.length - 1; i >= 0; i--) {
              offsets[i] = cursor;
              cursor += thumbs[i].offsetWidth + gap;
            }
            thumbs.forEach((t, i) => {
              gsap.to(t, {
                x: -offsets[i],
                rotation: 0,
                duration: 0.3,
                ease: 'power2.out',
              });
            });
          });

          item.addEventListener('mouseleave', () => {
            thumbs.forEach(t => {
              const deg = parseFloat(t.dataset.initDeg) || 0;
              gsap.to(t, {
                x: 0,
                rotation: deg,
                duration: 0.3,
                ease: 'power2.out',
              });
            });
          });
        });
      }

      bindListItemHover(listEl, '.files-item', '.album-thumb-overlay');

      window._albumMarqueeInit = () => {
        runMarqueeOverflow(listEl, '.files-item-title-en, .files-item-title-zh', '.files-marquee-inner');
      };
    }

    renderItems(getSorted());

    const albumEmptyState = ensureEmptyState(listEl);

    const selectedCats = new Set();
    const selYears     = (() => {
      const years = [...new Set(sorted.map(p => String(p.year)))].sort((a, b) => Number(b) - Number(a));
      return createYearPicker(yearPickerEl, years, () => applyFilters());
    })();

    function applyFilters() {
      const q     = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const isAll = selectedCats.size === 0;
      listEl.querySelectorAll('.album-year-block').forEach(block => {
        const yearMatch = selYears.size === 0 || selYears.has(block.dataset.year);
        let anyVisible  = false;
        block.querySelectorAll('.files-item').forEach(item => {
          const catMatch    = isAll || selectedCats.has(item.dataset.cat);
          const searchMatch = !q || item.dataset.search.includes(q);
          const visible = catMatch && yearMatch && searchMatch;
          item.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
          const tagWrap = item.querySelector('.album-cat-tag-wrap');
          const singleCat = selectedCats.size === 1;
          if (tagWrap) {
            tagWrap.style.opacity = singleCat ? '0' : '';
            tagWrap.style.pointerEvents = singleCat ? 'none' : '';
          }
          const titlesEl = item.querySelector('.files-item-titles');
          if (titlesEl) titlesEl.style.transform = singleCat ? 'translateY(0.7rem)' : '';
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      const hasSel = selectedCats.size > 0;
      const catsWithMatch = q
        ? new Set([...listEl.querySelectorAll('.files-item')].filter(i => i.dataset.search.includes(q)).map(i => i.dataset.cat))
        : null;
      document.querySelectorAll('.lib-album-cat-btn').forEach(b => {
        b.classList.toggle('dimmed', hasSel && !selectedCats.has(b.dataset.cat));
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(var(--lib-fg-rgb),0.3)' : '';
      });
      // Empty state：search 有輸入但沒任何 block 可見才顯示
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.album-year-block')]).some(b => b.style.display !== 'none');
      albumEmptyState.classList.toggle('hidden', !q || anyVisible);
    }

    const albumCatBtns = [...document.querySelectorAll('.lib-album-cat-btn')];
    albumCatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (selectedCats.has(cat)) { selectedCats.delete(cat); } else { selectedCats.add(cat); }
        if (selectedCats.size === albumCatBtns.length) selectedCats.clear();
        applyFilters();
      });
    });

    const sortBtn = document.getElementById('library-album-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-p3`;
        renderItems(getSorted());
        applyFilters();
      });
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    applyFilters();

  } catch (e) {
    console.error('Library album load error:', e);
  }
}

// ── Panel 切換 ────────────────────────────────────────────────────────────────

const PANEL_MAP = {
  awards: 'lib-panel-awards',
  press:  'lib-panel-press',
  files:  'lib-panel-files',
  album:  'lib-panel-album',
};

function randomTitleTransform(el, isAwards = false) {
  const sign = Math.random() < 0.5 ? -1 : 1;
  const deg  = sign * (4 + Math.random() * 2);
  const yPct = isAwards
    ? -(10 + Math.random() * 20)  // -10% 到 -30%
    : 60 - Math.random() * 90;   // 60% 到 -30%
  el.style.transform = `translateY(${yPct}%) rotate(${deg}deg)`;
}

// 4 方向 clip-path 起點（終點統一 inset(0)）
// 對齊 library-card.js _doSwitchTab 的 CLIP_DIRS pattern
const REVEAL_HIDE_DIRS = [
  'inset(0 0 100% 0)',  // 由上往下隱藏 → 從下揭露
  'inset(100% 0 0 0)',  // 由下往上隱藏 → 從上揭露
  'inset(0 100% 0 0)',  // 由右往左隱藏 → 從左揭露
  'inset(0 0 0 100%)',  // 由左往右隱藏 → 從右揭露
];
function pickRevealHideDir() {
  return REVEAL_HIDE_DIRS[Math.floor(Math.random() * REVEAL_HIDE_DIRS.length)];
}

// 對 panel 內 chip 跟非 chip 子元素各自隨機挑方向 clip wipe 進場
// chip 跟內容區可以不同方向（兩者視覺獨立，多樣性更好）
export function playPanelReveal(panelEl) {
  if (!panelEl) return;
  const title = panelEl.querySelector(':scope > .lib-panel-title');
  const others = [...panelEl.querySelectorAll(':scope > :not(.lib-panel-title)')];
  const all = title ? [title, ...others] : others;
  if (!all.length) return;

  // 各自挑方向
  const dirs = all.map(() => pickRevealHideDir());

  // 設起點（transition:none 避免從上次 inset(0) 反向走全程）
  all.forEach((el, i) => {
    /** @type {HTMLElement} */ (el).style.transition = 'none';
    /** @type {HTMLElement} */ (el).style.clipPath   = dirs[i];
  });

  // 雙 rAF 確保起點 paint → 重設 transition → 設終點觸發 wipe
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      all.forEach(el => {
        /** @type {HTMLElement} */ (el).style.transition = '';
        /** @type {HTMLElement} */ (el).style.clipPath   = 'inset(0 0 0 0)';
      });
    });
  });
}

// 退場：拆成兩階段 — chip 先 wipe，內容區之後跟 grayEl 同時 wipe
// 由 library-card.js playExitAnimation 編排時序：playPanelTitleExit → grayEl + playPanelBodyExit 同步
// Why: 視覺要先把「灰色卡片左上角」標籤 chip 抹掉再讓灰卡消失，否則 chip 殘留破壞收場節奏
// chip position:absolute 突出 grayEl clip 邊界外，必須獨立 wipe
export function playPanelTitleExit(panelEl, dur = 0.25) {
  if (!panelEl) return;
  const title = /** @type {HTMLElement|null} */ (panelEl.querySelector(':scope > .lib-panel-title'));
  if (!title) return;
  const hideDir = pickRevealHideDir();
  title.style.transition = `clip-path ${dur}s ease-in`;
  title.style.clipPath = hideDir;
}

export function playPanelBodyExit(panelEl, dur = 0.35) {
  if (!panelEl) return;
  const others = [...panelEl.querySelectorAll(':scope > :not(.lib-panel-title)')];
  if (!others.length) return;
  others.forEach(el => {
    const hideDir = pickRevealHideDir();
    /** @type {HTMLElement} */ (el).style.transition = `clip-path ${dur}s ease-in`;
    /** @type {HTMLElement} */ (el).style.clipPath = hideDir;
  });
}

// 對 panel 內子元素設「隱藏」起點 clip-path，不觸發 transition（用於進場前預設）
function hidePanelChildren(panelEl) {
  if (!panelEl) return;
  const title = panelEl.querySelector(':scope > .lib-panel-title');
  const others = [...panelEl.querySelectorAll(':scope > :not(.lib-panel-title)')];
  const all = title ? [title, ...others] : others;
  all.forEach(el => {
    /** @type {HTMLElement} */ (el).style.transition = 'none';
    /** @type {HTMLElement} */ (el).style.clipPath   = 'inset(0 0 100% 0)';
  });
}

// reveal=false：只切 display 不跑 wipe（library-card grayEl 進場前 pre-swap 用，避免 chip 提早 visible）
function showLibPanel(tab, { reveal = true } = {}) {
  Object.entries(PANEL_MAP).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === tab) {
      el.style.display = 'flex';
      const title = el.querySelector('.lib-panel-title');
      if (title) randomTitleTransform(title, key === 'awards');
      if (reveal) {
        playPanelReveal(el);
      } else {
        // 預設隱藏，等之後 onTabSwitch / 手動 showPanel 再 reveal
        hidePanelChildren(el);
      }
      if (key === 'press'  && typeof window._pressMarqueeInit === 'function') requestAnimationFrame(window._pressMarqueeInit);
      if (key === 'files'  && typeof window._filesMarqueeInit === 'function') requestAnimationFrame(window._filesMarqueeInit);
      if (key === 'album'  && typeof window._albumMarqueeInit === 'function') requestAnimationFrame(window._albumMarqueeInit);
    } else {
      el.style.display = 'none';
    }
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

/**
 * 初始化所有 library panels
 * @returns {{
 *   showPanel: (tab: string, opts?: { reveal?: boolean }) => void,
 *   onEntranceDone: () => void,
 *   handleHash: () => void
 * }}
 */
export function initLibraryPanels() {
  let _entranceDoneCb = null;

  // Awards 需要在進場動畫完成後啟動 ticker，透過 registerEntranceDone 注入回呼
  initAwardsPanel(cb => { _entranceDoneCb = cb; });
  initPressPanel();
  initFilesPanel();
  initAlbumPanel();

  // 隨機旋轉 + 隨機 Y 位置 panel 標題
  Object.entries(PANEL_MAP).forEach(([key, id]) => {
    const title = document.querySelector(`#${id} .lib-panel-title`);
    if (title) randomTitleTransform(title, key === 'awards');
  });

  // 預設所有 panel 內 chip + 內容隱藏（等 grayEl 進場揭露完 onTabSwitch 才 reveal）
  // 不做的話 awards (HTML 預設 display:flex) chip 會在 grayEl clip wipe 時被一起揭出半身
  Object.values(PANEL_MAP).forEach(id => {
    hidePanelChildren(document.getElementById(id));
  });

  return {
    showPanel: showLibPanel,
    // library-card.js 呼叫此函式以觸發 ticker 動畫
    onEntranceDone: () => { if (typeof _entranceDoneCb === 'function') _entranceDoneCb(); },
    handleHash: handleLibraryHash,
  };
}

/**
 * 從 URL hash 推測 deep-link 目標 panel（不等 panels 渲染完，純看 hash 前綴）。
 * 給 SPA 進場時 pre-swap library-card 的 grayEl tab 用 — 避免進場先顯示 awards、
 * 等 handleLibraryHash 才 switchPanel，視覺上 awards 一閃即逝。
 *
 * 前綴規則（與 panels.js 內 render 的 id 樣式對應）：
 *   #f-*      → files     (files.json id 加 `f-` 前綴)
 *   #album-*  → album     (album item.id 加 `album-` 前綴)
 *   #press-*  → press     (press.json id 本身就是 `press-N`)
 *   #a-*      → awards    (records.json id 為 `a-YYYY-NN`)
 *   #awards | #press | #files | #album → 對應 tab
 *   其他 / 空 → awards
 */
export function resolveInitialTabFromHash() {
  const hash = (window.location.hash || '').slice(1);
  if (!hash) return 'awards';
  if (Object.prototype.hasOwnProperty.call(PANEL_MAP, hash)) return hash;
  if (hash.startsWith('f-')) return 'files';
  if (hash.startsWith('album-')) return 'album';
  if (hash.startsWith('press-')) return 'press';
  if (hash.startsWith('a-')) return 'awards';
  return 'awards';
}

/**
 * Hash-based deep link：處理 library.html#item-id 連結
 * 1. 從 hash 找對應的 DOM element（有 retry，因為 awards/album 是 async 載入）
 * 2. 判斷它屬於哪個 panel（awards/press/files/album）
 * 3. 切換 panel + 滾動 + 觸發一次該項目的 hover 效果
 */
function handleLibraryHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  // 純 tab 名稱（如 #awards / #press / #files / #album）→ 只切換 panel
  if (Object.prototype.hasOwnProperty.call(PANEL_MAP, hash)) {
    showLibPanel(hash);
    return;
  }

  // Retry 找元素，最多等 3 秒（awards 需要 fetch + render，可能較慢）
  const startTime = Date.now();
  const MAX_WAIT = 3000;

  function tryFindAndHandle() {
    const el = document.getElementById(hash);
    if (!el) {
      if (Date.now() - startTime < MAX_WAIT) {
        setTimeout(tryFindAndHandle, 100);
      }
      return;
    }

    // 判斷 element 屬於哪個 panel
    const panelEl = el.closest('[id^="lib-panel-"]');
    if (!panelEl) return;
    const tab = panelEl.id.replace('lib-panel-', '');

    // 切換到對應 panel
    showLibPanel(tab);

    // 等 panel 顯示 + layout 完成後再 scroll + 觸發 hover
    requestAnimationFrame(() => {
      // block: 'start' → 對齊容器頂部（若剩餘空間不足會自動停在最大 scrollTop）
      // awards 的 year 標題是 sticky，加 scroll-margin-top 避免被遮
      el.style.scrollMarginTop = '2rem';
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 觸發一次該項目既有的 hover 效果（1s）
      // - dispatch mouseenter/leave：觸發 JS hover listener（awards 的文字變色）
      // - 加 .is-hovered class：觸發 CSS :hover 樣式（files/album 的灰階 + overlay）
      setTimeout(() => {
        el.classList.add('is-hovered');
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => {
          el.classList.remove('is-hovered');
          el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        }, 1000);
      }, 600);
    });
  }

  setTimeout(tryFindAndHandle, 300);
}
