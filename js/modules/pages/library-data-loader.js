/**
 * Library Data Loader
 * 負責讀取 Library JSON 資料並渲染到頁面上（年份分組，與 album 結構一致）
 */

import { getCurrentSectionColor } from './activities-section-switch.js';

const CARD_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

const CATEGORY_LABELS = {
  'degree-show':      'Degree Show 畢業展',
  'workshop':         'Workshop 工作營',
  'lectures':         'Lectures 講座',
  'summer-camp':      'Summer Camp 暑期體驗營',
  'moment':           'Moment 動態',
  'students-present': 'Students Present 學生自主',
  'industry':         'Industry-Academia 產學合作',
  'others':           'Others 其他',
};

// ── 建立單張 files 卡片 HTML（與 album-card 結構一致）──────────────────────────

function buildFilesCard(item, index) {
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category || '';
  const cardColor = CARD_COLORS[index % 3];
  const titleEn = item.titleEn || '';
  const titleZh = item.titleZh || '';

  return `
    <div class="album-card cursor-pointer p-[6px]"
         style="--card-color: ${cardColor};"
         data-pdf="${item.pdfUrl || ''}"
         data-category="${item.category || 'others'}"
         data-year="${item.year || ''}"
         data-title-en="${titleEn.toLowerCase()}"
         data-title-zh="${titleZh.toLowerCase()}">
      <div class="album-card-image overflow-hidden mb-sm" style="height: 240px; display: flex; align-items: flex-end; position: relative;">
        <img src="${item.image}" alt="${titleEn}" loading="lazy" class="album-card-img w-full object-contain object-bottom block" style="max-height: 100%;">
        <div class="album-card-overlay absolute inset-0 pointer-events-none" style="background: ${cardColor}; mix-blend-mode: screen; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4,0,0.2,1);"></div>
      </div>
      <div>
        <div class="album-title-marquee"><h6>${titleEn}</h6></div>
        ${titleZh ? `<div class="album-title-marquee"><h6>${titleZh}</h6></div>` : ''}
        <p class="text-p2 mt-xs">${categoryLabel}</p>
      </div>
    </div>
  `;
}

// ── 按年份分組（降序）──────────────────────────────────────────────────────────

function groupByYear(data) {
  const map = new Map();
  data.forEach(item => {
    const y = item.year || 0;
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(item);
  });
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items }));
}

// ── 更新年份組分隔線（第一個不加 border-t）───────────────────────────────────

function updateYearBorders(container) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  groups.forEach((g, i) => {
    if (i === 0) g.classList.remove('border-t-4', 'border-black');
    else g.classList.add('border-t-4', 'border-black');
  });
}

// ── 依排序方向重排年份組 ───────────────────────────────────────────────────────

function applySortOrder(container, direction) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  if (groups.length === 0) return;
  groups.sort((a, b) => {
    const ya = parseInt(a.getAttribute('data-year'), 10);
    const yb = parseInt(b.getAttribute('data-year'), 10);
    return direction === 'oldest' ? ya - yb : yb - ya;
  });
  groups.forEach(g => container.appendChild(g));
  updateYearBorders(container);
}

// ── apply filter（年份組 + 卡片顯示/隱藏）────────────────────────────────────

function applyFilesFilter(container) {
  const panel = document.getElementById('panel-files');
  if (!panel) return;

  const activeCats  = new Set([...panel.querySelectorAll('[data-filter-files-cat].active')].map(b => b.getAttribute('data-filter-files-cat')));
  const activeYears = new Set([...panel.querySelectorAll('[data-filter-files-year].active')].map(b => b.getAttribute('data-filter-files-year')));

  container.querySelectorAll('.album-year-group').forEach(group => {
    const groupYear = group.getAttribute('data-year');

    if (activeYears.size > 0 && !activeYears.has(groupYear)) {
      group.style.display = 'none';
      return;
    }

    let hasVisible = false;
    group.querySelectorAll('.album-card').forEach(card => {
      const catMatch     = activeCats.size === 0 || activeCats.has(card.dataset.category);
      const filterHidden = !catMatch;
      card.dataset.filterHidden = filterHidden ? '1' : '';
      const searchHidden = card.dataset.searchHidden === '1';
      card.style.display = (!filterHidden && !searchHidden) ? '' : 'none';
      if (!filterHidden && !searchHidden) hasVisible = true;
    });

    group.style.display = hasVisible ? '' : 'none';
  });
}

// ── 搜尋（比對英中文標題）──────────────────────────────────────────────────────

function initFilesSearch(container) {
  const panel = document.getElementById('panel-files');
  if (!panel) return;
  const input = panel.querySelector('#files-search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();

    container.querySelectorAll('.album-year-group').forEach(group => {
      const items = group.querySelector('.album-year-items');
      const icon  = group.querySelector('.album-year-toggle i');
      let hasVisible = false;

      group.querySelectorAll('.album-card').forEach(card => {
        const filterHidden = card.dataset.filterHidden === '1';

        if (query === '') {
          card.dataset.searchHidden = '';
          card.style.display = filterHidden ? 'none' : '';
          if (!filterHidden) hasVisible = true;
          return;
        }

        const match = card.dataset.titleEn.includes(query) || card.dataset.titleZh.includes(query);
        if (match) {
          card.dataset.searchHidden = '';
          card.style.display = filterHidden ? 'none' : '';
          if (!filterHidden) hasVisible = true;
        } else {
          card.dataset.searchHidden = '1';
          card.style.display = 'none';
        }
      });

      if (query === '') {
        group.style.display = '';
        if (group.dataset.open === 'true') {
          gsap.set(items, { height: 'auto', overflow: 'visible' });
          if (icon) icon.classList.add('rotate-180');
        }
      } else if (hasVisible) {
        group.style.display = '';
        group.dataset.open = 'true';
        gsap.set(items, { height: 'auto', overflow: 'visible' });
        if (icon) icon.classList.add('rotate-180');
      } else {
        group.style.display = 'none';
      }
    });
  });
}

// ── Accordion（年份標題 toggle 展開/收合）────────────────────────────────────

function initFilesAccordion(container) {
  container.querySelectorAll('.album-year-toggle').forEach(toggle => {
    const group = toggle.closest('.album-year-group');
    const items = group?.querySelector('.album-year-items');
    if (!items) return;

    const icon = toggle.querySelector('i');

    gsap.set(items, { height: 'auto', overflow: 'visible' });
    if (icon) icon.classList.add('rotate-180');
    group.dataset.open = 'true';

    toggle.addEventListener('click', () => {
      const isOpen = group.dataset.open === 'true';
      gsap.killTweensOf(items);
      if (isOpen) {
        group.dataset.open = 'false';
        gsap.set(items, { height: items.offsetHeight, overflow: 'hidden' });
        gsap.to(items, { height: 0, duration: 0.4, ease: 'power2.in' });
        if (icon) icon.classList.remove('rotate-180');
      } else {
        group.dataset.open = 'true';
        gsap.set(items, { overflow: 'hidden' });
        gsap.to(items, { height: 'auto', duration: 0.5, ease: 'power2.out', onComplete: () => { gsap.set(items, { overflow: 'visible' }); } });
        if (icon) icon.classList.add('rotate-180');
      }
    });
  });
}

// ── Card hover（桌面版：底色 + grayscale + overlay）──────────────────────────

function bindCardHover(container) {
  if (window.innerWidth < 768) return;
  container.querySelectorAll('.album-card').forEach(card => {
    const img = card.querySelector('.album-card-img');
    const overlay = card.querySelector('.album-card-overlay');
    const color = card.style.getPropertyValue('--card-color');
    card.addEventListener('mouseenter', () => {
      card.style.backgroundColor = color;
      if (img) img.style.filter = 'grayscale(100%)';
      if (overlay) overlay.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = '';
      if (img) img.style.filter = '';
      if (overlay) overlay.style.opacity = '0';
    });
  });
}

// ── Marquee（overflow 時 hover 跑馬燈）────────────────────────────────────────

function initFilesMarquee(container) {
  container.querySelectorAll('.album-title-marquee').forEach(wrap => {
    const h = wrap.querySelector('h6');
    if (!h) return;
    const checkOverflow = () => {
      if (h.scrollWidth > wrap.offsetWidth) {
        wrap.classList.add('is-overflow');
        if (!wrap.dataset.marqueeInit) {
          wrap.dataset.marqueeInit = '1';
          const clone = h.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          h.style.paddingRight = '3rem';
          clone.style.paddingRight = '3rem';
          wrap.appendChild(clone);
        }
        const offset = h.offsetWidth;
        wrap.style.setProperty('--marquee-offset', `-${offset}px`);
        wrap.style.setProperty('--marquee-duration', `${Math.max(3, offset / 80)}s`);
      } else {
        wrap.classList.remove('is-overflow');
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
  });
}

// ── Filter 初始化（cat, year, sort, search, collapse toggle）──────────────────

function initFilesFilter(container, yearGroups) {
  const panel = document.getElementById('panel-files');
  if (!panel) return;

  const sectionColor = () => getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();

  function setActive(btn) {
    btn.classList.add('active');
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) { inner.style.background = sectionColor(); inner.style.transform = ''; inner.style.color = 'black'; }
    else { btn.style.background = sectionColor(); }
  }
  function clearActive(btn) {
    btn.classList.remove('active');
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) { inner.style.background = ''; inner.style.transform = ''; inner.style.color = 'rgba(0,0,0,0.5)'; }
    else { btn.style.background = ''; }
  }

  // ── 填充 year options ──
  const yearWrap = panel.querySelector('#files-year-options');
  if (yearWrap) {
    yearWrap.innerHTML = yearGroups.map(({ year }) =>
      `<button class="activities-filter-btn active" data-filter-files-year="${year}"><span class="anchor-nav-inner">${year}</span></button>`
    ).join('');
  }

  // ── init styles ──
  panel.querySelectorAll('[data-filter-files-cat], [data-filter-files-year]').forEach(btn => {
    btn.classList.contains('active') ? setActive(btn) : clearActive(btn);
  });

  // ── cat（至少留一個）──
  panel.querySelectorAll('[data-filter-files-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        if (panel.querySelectorAll('[data-filter-files-cat].active').length <= 1) return;
        clearActive(btn);
      } else { setActive(btn); }
      applyFilesFilter(container);
    });
  });

  // ── year（event delegation，至少留一個）──
  yearWrap?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter-files-year]');
    if (!btn) return;
    if (btn.classList.contains('active')) {
      if (panel.querySelectorAll('[data-filter-files-year].active').length <= 1) return;
      clearActive(btn);
    } else { setActive(btn); }
    applyFilesFilter(container);
  });

  // ── sort toggle ──
  const sortHeader = panel.querySelector('.album-filter-col-header');
  const sortList   = panel.querySelector('.album-filter-col-list');
  const sortIcon   = sortHeader?.querySelector('i.fa-chevron-down');
  if (sortHeader && sortList) {
    sortList.style.display = 'none';
    const activeSort = sortList.querySelector('.album-filter-option.active');
    if (activeSort) activeSort.style.background = sectionColor();
    sortHeader.addEventListener('click', () => {
      const isOpen = sortList.style.display !== 'none';
      sortList.style.display = isOpen ? 'none' : '';
      sortIcon?.classList.toggle('rotate-180', !isOpen);
    });
    panel.querySelectorAll('[data-filter-files-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('[data-filter-files-sort]').forEach(b => { b.classList.remove('active'); b.style.background = ''; });
        btn.classList.add('active');
        btn.style.background = sectionColor();
        sortList.style.display = 'none';
        sortIcon?.classList.remove('rotate-180');
        applySortOrder(container, btn.getAttribute('data-filter-files-sort'));
        applyFilesFilter(container);
      });
    });
  }

  // ── filter collapse toggle ──
  const toggleBtn = panel.querySelector('.files-filter-toggle-btn');
  const rowsWrap  = panel.querySelector('.files-filter-rows-wrap');
  if (toggleBtn && rowsWrap) {
    const icon = toggleBtn.querySelector('i');
    toggleBtn.dataset.open = 'true';
    toggleBtn.addEventListener('click', () => {
      const isOpen = toggleBtn.dataset.open !== 'false';
      if (isOpen) {
        gsap.to(rowsWrap, { height: 0, duration: 0.35, ease: 'power2.inOut' });
        gsap.to(icon, { rotation: 180, duration: 0.35, ease: 'power2.inOut' });
        toggleBtn.dataset.open = 'false';
      } else {
        gsap.to(rowsWrap, { height: 'auto', duration: 0.35, ease: 'power2.inOut' });
        gsap.to(icon, { rotation: 0, duration: 0.35, ease: 'power2.inOut' });
        toggleBtn.dataset.open = 'true';
      }
    });
  }
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export async function loadLibraryData() {
  try {
    const response = await fetch('../data/library.json');
    const data = await response.json();
    const container = document.getElementById('files-list-container');
    if (!container) return;

    const yearGroups = groupByYear(data);

    container.innerHTML = '';

    if (yearGroups.length === 0) {
      container.innerHTML = '<p class="text-p2 py-xl">No files found.</p>';
      return;
    }

    yearGroups.forEach(({ year, items }) => {
      const cardsHtml = items.map((item, i) => buildFilesCard(item, i)).join('');
      container.insertAdjacentHTML('beforeend', `
        <div class="album-year-group border-t-4 border-black" data-year="${year}">
          <div class="album-year-toggle cursor-pointer flex items-center justify-between py-md">
            <h5>${year}</h5>
            <i class="fa-solid fa-chevron-down text-p2 transition-all duration-fast"></i>
          </div>
          <div class="album-year-items">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-2xl gap-y-4xl pb-2xl">
              ${cardsHtml}
            </div>
          </div>
        </div>
      `);
    });

    updateYearBorders(container);
    initFilesAccordion(container);
    initFilesFilter(container, yearGroups);
    applyFilesFilter(container);
    bindCardHover(container);
    initFilesMarquee(container);
    initFilesSearch(container);

    // PDF Viewer
    initPdfViewer();

  } catch (error) {
    console.error('Error loading library data:', error);
  }
}

function initPdfViewer() {
  const container = document.getElementById('files-list-container');
  const modal = document.getElementById('pdf-viewer-modal');
  const canvasLeft = document.getElementById('pdf-canvas-left');
  const canvasRight = document.getElementById('pdf-canvas-right');
  const closeBtn = document.getElementById('pdf-close-btn');
  const prevBtn = document.getElementById('pdf-prev-btn');
  const nextBtn = document.getElementById('pdf-next-btn');
  const pageInfo = document.getElementById('pdf-page-info');

  if (!container || !modal || !canvasLeft || !closeBtn) return;

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  let pdfDoc = null;
  let currentSpread = 1;

  const isDesktop = () => window.innerWidth >= 768;

  async function renderPage(pageNum, canvas) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    await new Promise(resolve => requestAnimationFrame(resolve));
    const gap = 128;
    const containerH = canvas.parentElement.clientHeight;
    const containerW = (canvas.parentElement.clientWidth - gap) / (isDesktop() ? 2 : 1);
    const scale = Math.min(containerH / viewport.height, containerW / viewport.width);

    const scaledViewport = page.getViewport({ scale });
    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
  }

  async function renderSpread() {
    const leftPage = isDesktop() ? currentSpread * 2 - 1 : currentSpread;
    const rightPage = leftPage + 1;
    const totalPages = pdfDoc.numPages;

    await renderPage(leftPage, canvasLeft);
    if (isDesktop() && canvasRight) await renderPage(rightPage, canvasRight);

    if (isDesktop()) {
      const rightDisplay = rightPage <= totalPages ? `-${rightPage}` : '';
      pageInfo.textContent = `${leftPage}${rightDisplay} / ${totalPages}`;
    } else {
      pageInfo.textContent = `${leftPage} / ${totalPages}`;
    }

    prevBtn.disabled = currentSpread <= 1;
    const maxSpread = isDesktop() ? Math.ceil(totalPages / 2) : totalPages;
    nextBtn.disabled = currentSpread >= maxSpread;
  }

  async function openPdf(pdfUrl) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    document.body.style.overflow = 'hidden';

    if (typeof pdfjsLib === 'undefined') {
      console.error('PDF.js 尚未載入');
      return;
    }

    try {
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      currentSpread = 1;
      await renderSpread();
    } catch (err) {
      console.error('PDF 載入失敗:', err);
    }
  }

  const closeModal = () => {
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.style.display = 'none';
      pdfDoc = null;
      document.body.style.overflow = '';
      [canvasLeft, canvasRight].forEach(c => { if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); });
    }, 300);
  };

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.album-card');
    if (!card) return;
    const pdfUrl = card.getAttribute('data-pdf');
    if (pdfUrl) openPdf(pdfUrl);
    else {
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      document.body.style.overflow = 'hidden';
      if (pageInfo) pageInfo.textContent = 'No PDF available';
    }
  });

  prevBtn.addEventListener('click', async () => {
    if (currentSpread > 1) { currentSpread--; await renderSpread(); }
  });
  nextBtn.addEventListener('click', async () => {
    const maxSpread = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
    if (currentSpread < maxSpread) { currentSpread++; await renderSpread(); }
  });

  document.addEventListener('keydown', async (e) => {
    if (modal.classList.contains('hidden') || !pdfDoc) return;
    if (e.key === 'ArrowLeft' && currentSpread > 1) { currentSpread--; await renderSpread(); }
    if (e.key === 'ArrowRight') {
      const maxSpread = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
      if (currentSpread < maxSpread) { currentSpread++; await renderSpread(); }
    }
    if (e.key === 'Escape') closeModal();
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  [canvasLeft, canvasRight].forEach(c => {
    if (c) c.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
