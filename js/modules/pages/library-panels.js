/**
 * Library Panels
 * 負責 Awards / Press / Files / Album 四個 panel 的資料載入、渲染、篩選邏輯
 */

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
  'industry':         'Industry-Academia 產學合作',
  'summer-camp':      'Summer Camp 暑期體驗營',
  'moment':           'Moment 日常',
  'others':           'Others 其他',
};

const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

// ── 共用 helpers ──────────────────────────────────────────────────────────────

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
      b.style.color = (!hasSel || selected.has(b.dataset.year)) ? '#000' : 'rgba(0,0,0,0.3)';
    });
  };

  years.forEach(year => {
    const btn = document.createElement('button');
    btn.textContent = year;
    btn.dataset.year = year;
    btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-p3);cursor:pointer;font-weight:700;color:#000;';
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
 * 偵測文字溢出並啟動 marquee 動畫（一次性）
 * @param {HTMLElement} containerEl
 * @param {string} rowSelector      - 標題列選擇器，e.g. '.files-item-title-en, .files-item-title-zh'
 * @param {string} innerSelector    - 內部 span 選擇器，e.g. '.files-marquee-inner'
 */
function runMarqueeOverflow(containerEl, rowSelector, innerSelector) {
  containerEl.querySelectorAll(rowSelector).forEach(el => {
    const inner = el.querySelector(innerSelector);
    if (!inner) return;
    const overflow = inner.scrollWidth - el.offsetWidth;
    if (overflow > 0) {
      el.classList.add('is-overflow');
      el.style.setProperty('--marquee-distance', `-${inner.scrollWidth}px`);
      el.style.setProperty('--marquee-duration', `${Math.max(3, inner.scrollWidth / 80)}s`);
    }
  });
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
  const names  = [['Chen Wei', '陳偉'], ['Lin Mei', '林美'], ['Wang Hao', '王浩'], ['Lee Ying', '李英'], ['Zhang Ming', '張明']];
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 20 }, (_, i) => ({
    year: currentYear - i,
    items: Array.from({ length: 5 }, (_, j) => ({
      flag:           flags[(i * 5 + j) % flags.length],
      competition_en: comps[j][0],
      competition:    comps[j][1],
      award_en:       awards[j % awards.length][0],
      award:          awards[j % awards.length][1],
      rank_en:        ranks[(i + j) % ranks.length][0],
      rank:           ranks[(i + j) % ranks.length][1],
      winner_en:      names[j][0],
      winner:         names[j][1],
    })),
  }));
}

async function initAwardsPanel(onEntranceDoneCallback) {
  try {
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

    function renderItems(data) {
      listEl.innerHTML = '';
      data.forEach(yearGroup => {
        const itemsHtml = (yearGroup.items || []).map((item) => {
          const searchText = [item.competition_en, item.competition, item.award_en, item.award, item.winner_en, item.winner, item.rank_en, item.rank]
            .filter(Boolean).join(' ').toLowerCase();
          return `
            <div class="award-record-item grid py-[0.5rem] border-b-2 border-black"
                 style="grid-template-columns: 1.5em 4.5fr 1.5fr 1fr 1fr; gap: 0 2rem; font-size: var(--font-size-p3); align-items: start;"
                 data-search="${searchText}"${item.id ? ` id="${item.id}"` : ''}>
              <div style="padding-top: 0.1em;">${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}</div>
              <div class="truncate flex flex-col">${bilingualBold(item.competition_en, item.competition)}</div>
              <div class="truncate flex flex-col">${bilingual(item.award_en, item.award)}</div>
              <div class="truncate flex flex-col">${bilingual(item.rank_en, item.rank)}</div>
              <div class="truncate flex flex-col">${bilingualBold(item.winner_en, item.winner)}</div>
            </div>`;
        }).join('');

        listEl.insertAdjacentHTML('beforeend', `
          <div class="year-block" data-year="${yearGroup.year}" style="margin-bottom: var(--spacing-2xl);">
            <div style="font-size: var(--font-size-p3); font-weight: 700; padding: 0.35rem 0 0.25rem; position: sticky; top: -1px; background: #f2f2f2; z-index: 2; margin-top: -0.35rem;">${yearGroup.year}</div>
            <div class="flex flex-col">${itemsHtml}</div>
          </div>`);
      });

      listEl.querySelectorAll('.award-record-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.style.color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
        });
        item.addEventListener('mouseleave', () => { item.style.color = ''; });
      });
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
          b.style.color = (!hasSel || selectedYears.has(b.dataset.year)) ? '#000' : 'rgba(0,0,0,0.3)';
        });
      };

      allYears.forEach(year => {
        if (!dataYears.has(String(year))) return;
        const btn = document.createElement('button');
        btn.textContent  = year;
        btn.dataset.year = String(year);
        btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-p3);cursor:pointer;font-weight:700;color:#000;';
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
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        listEl.querySelectorAll('.year-block').forEach(block => {
          const items   = [...block.querySelectorAll('.award-record-item')];
          const visible = items.filter(item => !q || (item.dataset.search || '').includes(q));
          items.forEach(item => { item.style.display = visible.includes(item) ? '' : 'none'; });
          visible.forEach((item, i) => {
            item.classList.toggle('border-b-4',   i < visible.length - 1);
            item.classList.toggle('border-black', i < visible.length - 1);
          });
          block.style.display = visible.length ? '' : 'none';
        });
      });
    }

    // Sort
    const sortBtn = document.getElementById('library-awards-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `fa-solid ${latestFirst ? 'fa-arrow-down' : 'fa-arrow-up'} sort-arrow`;
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
          div.dataset.year    = String(item.year);
          div.dataset.cat     = item.category || '';
          div.dataset.search  = [item.titleEn, item.titleZh, item.subtitleEn, item.subtitleZh].filter(Boolean).join(' ').toLowerCase();
          const subtitleText  = [item.subtitleEn, item.subtitleZh].filter(Boolean).join('&ensp;');
          const hasMedia  = !!(item.image || item.pdfUrl || item.videoUrl);
          const metaHtml = (subtitleText || item.date) ? `
            <div class="press-item-meta">
              ${subtitleText ? `<span class="press-item-subtitle"><span class="press-subtitle-inner">${subtitleText}</span></span>` : ''}
              <span class="press-item-meta-right">
                ${item.date ? `<span class="press-item-date">${item.date}</span>` : ''}
                ${hasMedia  ? `<i class="fa-regular fa-image press-item-media-icon"></i>` : ''}
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
            div.style.cursor = 'pointer';
            const media = [];
            if (item.image)    media.push({ type: 'image', src: item.image, thumb: item.image });
            if (item.videoUrl) {
              const vid = item.videoUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
              if (vid) media.push({ type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` });
            }
            if (media.length) {
              div.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media, index: 0 } }));
              });
            }
          } else if (item.pdfUrl) {
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl } }));
            });
          }
          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindListItemHover(listEl, '.press-item');

      // marquee 溢出偵測（panel 顯示後才執行，只跑一次）
      window._pressMarqueeInit = () => {
        runMarqueeOverflow(listEl,
          '.press-item-title-en, .press-item-title-zh, .press-item-subtitle',
          '.press-marquee-inner, .press-subtitle-inner');
        window._pressMarqueeInit = null;
      };
    }

    renderItems(getSorted());

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
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(0,0,0,0.3)' : '';
      });
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
        sortBtn.querySelector('.sort-arrow').className = `fa-solid ${latestFirst ? 'fa-arrow-down' : 'fa-arrow-up'} sort-arrow`;
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

        group.items.forEach(item => {
          const div  = document.createElement('div');
          div.className  = 'files-item';
          const cats = Array.isArray(item.categories) ? item.categories : (item.category ? [item.category] : []);
          div.dataset.year   = String(item.year);
          div.dataset.cats   = JSON.stringify(cats);
          div.dataset.search = [item.titleEn, item.titleZh].filter(Boolean).join(' ').toLowerCase();
          const catTagsHtml  = cats.map(c => CAT_LABELS[c]).filter(Boolean)
            .map(l => `<span class="files-item-subtitle-tag">${l}</span>`).join('');

          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
          const sign = Math.random() < 0.4 ? -1 : 1;
          const finalDeg = sign > 0 ? (Math.random() * 5.5 + 0.5) : -(Math.random() * 3.5 + 0.5);
          const coverContent = item.cover
            ? `<img class="files-item-cover" src="${item.cover}" alt="">`
            : `<div class="files-item-cover files-item-cover--empty"></div>`;
          const coverHtml = `
            <div class="files-item-cover-wrap">
              <div class="files-item-cover-inner" data-init-deg="${finalDeg}" style="transform: rotate(${finalDeg}deg);">
                ${coverContent}
                <div class="files-thumb-overlay" style="background: ${accentColor};"></div>
              </div>
            </div>`;
          const titleEnHtml = item.titleEn ? `<p class="files-item-title-en"><span class="files-marquee-inner">${item.titleEn}</span></p>` : '';
          const titleZhHtml = item.titleZh ? `<p class="files-item-title-zh"><span class="files-marquee-inner">${item.titleZh}</span></p>` : '';
          const oneLang = !!(item.titleEn) !== !!(item.titleZh);
          div.innerHTML = `
            <div class="files-item-row">
              <div class="files-item-titles">
                <div class="files-item-titles-text${oneLang ? ' files-item-titles-text--center' : ''}">${titleEnHtml}${titleZhHtml}</div>
                ${catTagsHtml ? `<div class="files-item-subtitle-wrap">${catTagsHtml}</div>` : ''}
              </div>
              ${coverHtml}
            </div>`;
          if (item.pdfUrl) {
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl } }));
            });
          }

          // 依比例設定 cover 尺寸（同 album thumb 邏輯）
          const coverImg = div.querySelector('.files-item-cover');
          if (coverImg && coverImg.tagName === 'IMG') {
            const applyRatio = () => {
              const isLandscape = coverImg.naturalWidth > coverImg.naturalHeight;
              const wrap = div.querySelector('.files-item-cover-wrap');
              if (isLandscape) {
                wrap.style.maxWidth = '8rem';
                coverImg.style.height = '100%';
                coverImg.style.width = 'auto';
              } else {
                wrap.style.maxWidth = '';
                coverImg.style.height = '100%';
                coverImg.style.width = 'auto';
              }
            };
            if (coverImg.complete && coverImg.naturalWidth) applyRatio();
            else coverImg.addEventListener('load', applyRatio, { once: true });
          }

          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindCoverRatio(listEl);

      if (window.innerWidth >= 768) {
        listEl.querySelectorAll('.files-item').forEach(item => {
          const inner = item.querySelector('.files-item-cover-inner');
          if (!inner) return;
          item.addEventListener('mouseenter', () => {
            gsap.to(inner, { rotation: 0, duration: 0.3, ease: 'power2.out' });
          });
          item.addEventListener('mouseleave', () => {
            const deg = parseFloat(inner.dataset.initDeg) || 0;
            gsap.to(inner, { rotation: deg, duration: 0.3, ease: 'power2.out' });
          });
        });
      }

      bindListItemHover(listEl, '.files-item', '.files-thumb-overlay');

      window._filesMarqueeInit = () => {
        runMarqueeOverflow(listEl, '.files-item-title-en, .files-item-title-zh', '.files-marquee-inner');
        window._filesMarqueeInit = null;
      };
    }

    renderItems(getSorted());

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
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(0,0,0,0.3)' : '';
      });
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
        sortBtn.querySelector('.sort-arrow').className = `fa-solid ${latestFirst ? 'fa-arrow-down' : 'fa-arrow-up'} sort-arrow`;
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
          allItems.push({ year, cat, titleEn, titleZh, cover, media });
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
          div.dataset.year   = String(item.year);
          div.dataset.cat    = item.cat;
          div.dataset.search = [item.titleEn, item.titleZh].filter(Boolean).join(' ').toLowerCase();

          // random accent color per item (for hover overlay)
          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];

          const catTagHtml = `<span class="files-item-subtitle-tag">${CAT_LABELS[item.cat] || item.cat}</span>`;

          // thumbnails: up to 3 from media array (already ordered: poster → video → photos)
          const thumbMedia = (item.media || []).slice(0, 3);
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
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media: item.media, index: 0 } }));
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
            // 計算展開位置：從右到左排列
            const gap = 12; // 稍微加大圖片之間的間距讓視覺更明顯、舒適
            let cursor = 0;
            const rights = [];
            for (let i = thumbs.length - 1; i >= 0; i--) {
              rights[i] = cursor;
              cursor += thumbs[i].offsetWidth + gap;
            }
            thumbs.forEach((t, i) => {
              gsap.to(t, {
                right: rights[i],
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
                right: 0,
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
        window._albumMarqueeInit = null;
      };
    }

    renderItems(getSorted());

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
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(0,0,0,0.3)' : '';
      });
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
        sortBtn.querySelector('.sort-arrow').className = `fa-solid ${latestFirst ? 'fa-arrow-down' : 'fa-arrow-up'} sort-arrow`;
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

function showLibPanel(tab) {
  Object.entries(PANEL_MAP).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === tab) {
      el.style.display = 'flex';
      const title = el.querySelector('.lib-panel-title');
      if (title) randomTitleTransform(title, key === 'awards');
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
 * @returns {{ showPanel: Function, registerEntranceDone: Function }}
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

  return {
    showPanel: showLibPanel,
    // library-card.js 呼叫此函式以觸發 ticker 動畫
    onEntranceDone: () => { if (typeof _entranceDoneCb === 'function') _entranceDoneCb(); },
  };
}
