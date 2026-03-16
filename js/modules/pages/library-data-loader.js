/**
 * Library Data Loader
 * 負責讀取 library.json 並渲染 Files panel（年份分組卡片 + PDF viewer）
 */

import { getCurrentSectionColor } from './activities-section-switch.js';
import {
  CARD_COLORS, CATEGORY_LABELS,
  groupByYear, renderYearGroups,
  initAccordion, bindCardHover, initMarquee,
  applyFilter, initSearch,
  initSortToggle, initFilterToggle, initFilterBtns,
  populateYearOptions, applySortOrder,
} from './card-panel-helpers.js';

// ── 建立單張卡片 HTML ──────────────────────────────────────────────────────────

function buildFilesCard(item, index) {
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category || '';
  const cardColor     = CARD_COLORS[index % 3];
  const titleEn       = item.titleEn || '';
  const titleZh       = item.titleZh || '';

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

// ── 初始化 filter + sort + search ─────────────────────────────────────────────

function initFilesPanel(container, yearGroups) {
  const panel = document.getElementById('panel-files');
  if (!panel) return;

  const yearWrap = panel.querySelector('#files-year-options');
  populateYearOptions(yearWrap, yearGroups, 'data-filter-files-year');

  const runFilter = () => applyFilter(container, panel, {
    catAttr:     'data-filter-files-cat',
    yearAttr:    'data-filter-files-year',
  });

  initFilterBtns(panel, [
    { attr: 'data-filter-files-cat' },
    { attr: 'data-filter-files-year', yearWrap },
  ], runFilter);

  initSortToggle(panel, 'data-filter-files-sort', dir => {
    applySortOrder(container, dir);
    runFilter();
  });

  initFilterToggle(
    panel.querySelector('.files-filter-toggle-btn'),
    panel.querySelector('.files-filter-rows-wrap'),
  );

  initSearch(container, panel.querySelector('#files-search-input'));
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export async function loadLibraryData() {
  try {
    const data = await fetch('../data/library.json').then(r => r.json());
    const container = document.getElementById('files-list-container');
    if (!container) return;

    const yearGroups = groupByYear(data);

    if (!yearGroups.length) {
      container.innerHTML = '<p class="text-p2 py-xl">No files found.</p>';
      return;
    }

    renderYearGroups(container, yearGroups, buildFilesCard);
    initAccordion(container);
    initFilesPanel(container, yearGroups);
    applyFilter(container, document.getElementById('panel-files'), {
      catAttr: 'data-filter-files-cat',
      yearAttr: 'data-filter-files-year',
    });
    bindCardHover(container);
    initMarquee(container);
    initPdfViewer();

  } catch (err) {
    console.error('Error loading library data:', err);
  }
}

// ── PDF Viewer（共用 files + press）──────────────────────────────────────────

function initPdfViewer() {
  const modal      = document.getElementById('pdf-viewer-modal');
  const canvasLeft = document.getElementById('pdf-canvas-left');
  const canvasRight= document.getElementById('pdf-canvas-right');
  const closeBtn   = document.getElementById('pdf-close-btn');
  const prevBtn    = document.getElementById('pdf-prev-btn');
  const nextBtn    = document.getElementById('pdf-next-btn');
  const pageInfo   = document.getElementById('pdf-page-info');

  if (!modal || !canvasLeft || !closeBtn) return;

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  let pdfDoc = null;
  let currentSpread = 1;
  const isDesktop = () => window.innerWidth >= 768;

  async function renderPage(pageNum, canvas) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) { canvas.style.display = 'none'; return; }
    canvas.style.display = 'block';
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const gap        = 128;
    const containerH = canvas.parentElement.clientHeight;
    const containerW = (canvas.parentElement.clientWidth - gap) / (isDesktop() ? 2 : 1);
    const scale      = Math.min(containerH / viewport.height, containerW / viewport.width);
    const sv         = page.getViewport({ scale });
    canvas.height    = sv.height;
    canvas.width     = sv.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: sv }).promise;
  }

  async function renderSpread() {
    const leftPage  = isDesktop() ? currentSpread * 2 - 1 : currentSpread;
    const rightPage = leftPage + 1;
    const total     = pdfDoc.numPages;
    await renderPage(leftPage, canvasLeft);
    if (isDesktop() && canvasRight) await renderPage(rightPage, canvasRight);
    pageInfo.textContent = isDesktop()
      ? `${leftPage}${rightPage <= total ? `-${rightPage}` : ''} / ${total}`
      : `${leftPage} / ${total}`;
    prevBtn.disabled = currentSpread <= 1;
    nextBtn.disabled = currentSpread >= (isDesktop() ? Math.ceil(total / 2) : total);
  }

  async function openPdf(pdfUrl) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    document.body.style.overflow = 'hidden';
    if (typeof pdfjsLib === 'undefined') { console.error('PDF.js 尚未載入'); return; }
    try {
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      currentSpread = 1;
      await renderSpread();
    } catch (err) { console.error('PDF 載入失敗:', err); }
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

  function handleCardClick(card) {
    const pdfUrl = card.getAttribute('data-pdf');
    if (pdfUrl) { openPdf(pdfUrl); return; }
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    document.body.style.overflow = 'hidden';
    if (pageInfo) pageInfo.textContent = 'No PDF available';
  }

  // files panel 卡片點擊
  document.getElementById('files-list-container')?.addEventListener('click', e => {
    const card = e.target.closest('.album-card');
    if (card) handleCardClick(card);
  });

  // press panel 卡片點擊（透過 custom event）
  document.addEventListener('sccd:open-pdf', e => {
    const { pdfUrl } = e.detail || {};
    if (pdfUrl) openPdf(pdfUrl);
    else {
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      document.body.style.overflow = 'hidden';
      if (pageInfo) pageInfo.textContent = 'No PDF available';
    }
  });

  prevBtn.addEventListener('click', async () => { if (currentSpread > 1) { currentSpread--; await renderSpread(); } });
  nextBtn.addEventListener('click', async () => {
    const max = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
    if (currentSpread < max) { currentSpread++; await renderSpread(); }
  });

  document.addEventListener('keydown', async e => {
    if (modal.style.display === 'none' || !pdfDoc) return;
    if (e.key === 'ArrowLeft' && currentSpread > 1) { currentSpread--; await renderSpread(); }
    if (e.key === 'ArrowRight') {
      const max = isDesktop() ? Math.ceil(pdfDoc.numPages / 2) : pdfDoc.numPages;
      if (currentSpread < max) { currentSpread++; await renderSpread(); }
    }
    if (e.key === 'Escape') closeModal();
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  [canvasLeft, canvasRight].forEach(c => { if (c) c.addEventListener('contextmenu', e => e.preventDefault()); });
}
