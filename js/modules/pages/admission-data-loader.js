/**
 * Admission Data Loader
 * 採 list-item / list-header / list-content 結構（與 activities list 共用 list-accordion）
 * Header：title 點擊 active 後 padding-left 右移、sticky 在 top:200；date 為 subtitle（年/月/日）
 * Content：rich HTML body → gallery（videos+images，仿 workshop）→ attachments（list-ref-btn 樣式，連檔案 URL 不導頁）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';
import { openLightbox } from '../lightbox/activities-lightbox.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { buildItemMedia, buildGalleryHtml, bindMediaHover } from './activities-data-loader.js';

const ITEMS_PER_PAGE = 10;

// 完整日期：仿 list fullDate=true，"2026.02.04" → "2026 / 02 / 04"
function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return dateStr
    .replace(/\./g, ' / ')
    .replace(/ - /g, '&nbsp;&nbsp;-&nbsp;&nbsp;')
    .replace(/ \/ /g, '&nbsp;/&nbsp;');
}

// 附件 = ref：用 list-ref-btn class 拿 deep accent 底色 + hover 反黑；連檔案 URL，不導頁
const buildAttachmentsHtml = (item) => {
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  if (attachments.length === 0) return '';
  return `
    <div class="flex flex-col mt-md">
      ${attachments.map((a, i) => `
        <a class="list-ref-btn cursor-pointer w-full grid grid-cols-12 gap-x-md items-start py-sm no-underline" href="${a.url || '#'}" target="_blank" rel="noopener">
          <div class="col-span-1 flex justify-center" style="padding-top: 0.25em;">
            <i class="fa-solid fa-paperclip text-p2"></i>
          </div>
          <div class="col-span-11 flex flex-col">
            <p class="text-p2 font-bold">Attachment ${i + 1}</p>
            <p class="text-p2 font-bold">附件 ${i + 1}</p>
          </div>
        </a>
      `).join('')}
    </div>
  `;
};

// Item HTML：list-item / list-header / list-content（list-accordion 自動接管 hover/click/--item-color-deep）
// list-none：覆蓋 Tailwind .list-item utility 的 display:list-item 帶來的 disc marker
//           （activities 用 overflow-hidden 順便藏 marker；admission 為 sticky 不能 overflow-hidden，需顯式 list-none）
// border 移到 list-item 末端 .admission-divider 元素：與 title/date 同樣是 .list-reveal-row，
// 進場動畫會以 axis:'y' stagger 在 title→date→divider 順序 clip-reveal，避免 list-item 上的靜態 border
// 在 row 還沒滑入時就已出現的視覺破綻
const itemHTML = (item) => {
  const media = buildItemMedia(item);
  const mediaJson = JSON.stringify(media).replace(/"/g, '&quot;');
  return `
    <div class="list-item list-none" data-pre-reveal data-media="${mediaJson}"${item.id ? ` id="item-admission-${item.id}"` : ''}>
      <div class="list-header cursor-pointer group transition-colors duration-fast flex items-stretch justify-between px-[4px] py-sm">
        <!-- title + date subtitle 合併為單一 list-reveal-row：reveal 順序對齊「title → chevron → divider」三 phase（仿 list-row 複製貼上）
             外層 div 保留 flex-1：dynamic clip-wrapper 不帶 flex-1，flex-1 必須在 wrapper 外才能撐 list-header 中間 col -->
        <div class="flex-1 min-w-0">
          <div class="list-reveal-row flex flex-col gap-xs">
            <div class="list-title-marquee"><p class="text-h5 font-bold">${item.title}</p></div>
            ${item.date ? `<p class="text-p2">${formatFullDate(item.date)}</p>` : ''}
          </div>
        </div>
        <!-- chevron 顯式 overflow:clip wrapper：避免父層 items-stretch 拉伸 dynamic clip-wrapper 導致 yPercent:100 不夠隱藏 -->
        <div class="flex items-stretch flex-shrink-0 pt-[0.25rem]">
          <div class="flex-shrink-0 self-start" style="overflow:clip; height:1.5em; width:1.5em;">
            <div class="list-reveal-row flex justify-center items-center w-full h-full">
              <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
            </div>
          </div>
        </div>
      </div>
      <div class="list-content h-0 overflow-hidden">
        <div class="pt-sm pb-lg px-md flex flex-col gap-md">
          ${item.content ? `<div class="admission-body flex flex-col gap-md">${item.content}</div>` : ''}
        </div>
        ${buildGalleryHtml(item)}
        ${buildAttachmentsHtml(item)}
      </div>
      <div class="list-reveal-row list-item-divider border-b-4 border-black" style="height:4px"></div>
    </div>
  `;
};

// ── Main ─────────────────────────────────────────────────────────────────

export async function loadAdmissionData() {
  const container = document.getElementById('admission-list');
  if (!container) return;
  try {
    const response = await fetch('/data/admission.json');
    const data = await response.json();
    renderAdmissionList(data, container);
  } catch (error) {
    console.error('Error loading admission data:', error);
  }
}

function renderAdmissionList(data, container) {
  let visibleCount = ITEMS_PER_PAGE;
  const loadMoreBtn = document.getElementById('load-more-btn');
  const loadMoreContainer = document.getElementById('load-more-container');

  data.slice(0, visibleCount).forEach(item => container.insertAdjacentHTML('beforeend', itemHTML(item)));
  initListAccordion();         // hover 隨機色 + click 展開 + --item-color/-deep（dataset.accordionInit 守衛）
  bindGallery(container);
  bindLightbox(container);
  bindMediaHover(container);   // 圖片 random rotation + hover 歸 0（與 activities 共用）
  initMarquees(container);

  // 為所有 list-item 預備 clip-reveal（rows 推到 yPercent:100 隱藏）；播放由 caller（admission-section-switch）控制
  setupAdmissionReveal(container);

  // load-more-container 預設隱藏，等 reveal 完成由 panel reveal 顯示
  if (loadMoreContainer) gsap.set(loadMoreContainer, { opacity: 0, display: 'flex' });

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const prevCount = visibleCount;
      visibleCount = data.length;
      data.slice(prevCount, visibleCount).forEach(item => container.insertAdjacentHTML('beforeend', itemHTML(item)));
      const allItems = container.querySelectorAll('.list-item');
      const newItems = Array.from(allItems).slice(prevCount);
      initListAccordion();
      bindGallery(container);
      bindLightbox(container);
      bindMediaHover(container);
      initMarquees(container);
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      // 新 items：setup + 立即 per-item stagger 進場（無 ScrollTrigger，使用者已在當前 panel）
      newItems.forEach(/** @type {HTMLElement} */ item => {
        const rows = item.querySelectorAll('.list-reveal-row');
        setupClipReveal(rows);
      });
      playItemsReveal(newItems, { useScrollTrigger: false });
    });
  }
}

// ── Reveal Helpers (給 admission-section-switch 用) ────────────────────────

/**
 * 為 container 內所有 reveal-row（包括 list-item 外的年份/separator）套 clip-reveal init
 */
export function setupAdmissionReveal(container) {
  if (typeof gsap === 'undefined' || !container) return;
  const rows = container.querySelectorAll('.list-reveal-row');
  setupClipReveal(rows);
}

/**
 * 播放一組 list-item 的 reveal：per-item 各自 stagger（DOM 順序：title → date → chevron → divider）
 * - useScrollTrigger=true：每個 item 進 viewport 時各自觸發
 * - useScrollTrigger=false：立即播放，items 之間用 delay 拉開
 * - 動畫完成移除該 item 的 data-pre-reveal 解鎖 hover/click
 */
function playItemsReveal(items, { useScrollTrigger = true, onAllComplete = null } = {}) {
  if (typeof gsap === 'undefined') return;
  const list = Array.from(items);
  if (list.length === 0) { if (onAllComplete) onAllComplete(); return; }

  let completed = 0;
  const revealOne = /** @param {HTMLElement} item */ (item) => {
    const rows = item.querySelectorAll('.list-reveal-row');
    if (rows.length === 0) {
      completed++;
      if (completed === list.length && onAllComplete) onAllComplete();
      return;
    }
    gsap.to(rows, {
      yPercent: 0,
      duration: 0.7,
      stagger: { each: 0.08 },  // DOM 順序 = title → date → chevron → divider
      ease: 'power3.out',
      overwrite: true,
      clearProps: 'transform',
      onComplete: () => {
        item.removeAttribute('data-pre-reveal');
        completed++;
        if (completed === list.length && onAllComplete) onAllComplete();
      },
    });
  };

  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    list.forEach(item => {
      ScrollTrigger.create({
        trigger: item,
        start: 'top 90%',
        once: true,
        onEnter: () => revealOne(item),
      });
    });
  } else {
    // panel 切換時：master timeline 嚴格 sequential per-item，讓「一個個進場」明顯（item 間隔 0.18s）
    const tl = gsap.timeline({
      onComplete: () => { if (onAllComplete) onAllComplete(); },
    });
    list.forEach((item, idx) => {
      const rows = item.querySelectorAll('.list-reveal-row');
      if (rows.length === 0) return;
      tl.to(rows, {
        yPercent: 0,
        duration: 0.6,
        stagger: { each: 0.06 },
        ease: 'power3.out',
        clearProps: 'transform',
        onComplete: () => item.removeAttribute('data-pre-reveal'),
      }, idx * 0.18);
    });
  }
}

/**
 * 播放整個 panel 的進場動畫（panel 切換時用，立即播放無 ScrollTrigger）
 * - 完成後淡入 #load-more-container（若存在且未隱藏）
 */
export function playAdmissionPanelReveal(panel, { useScrollTrigger = false } = {}) {
  if (!panel || typeof gsap === 'undefined') return;

  // 分組策略：以 list-item-divider 為「list-row 群組」終止符，每組 = 年份(若有) + title + 副標/icons + chevron + divider
  // intro = list 結構之外的 rows（描述塊）；首個 list-item / yearGroup 之後皆視為 list phase
  const allRows = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('.list-reveal-row')]);
  const intro = /** @type {HTMLElement[]} */ ([]);
  const groups = /** @type {HTMLElement[][]} */ ([]);
  let current = /** @type {HTMLElement[]} */ ([]);
  let inListPhase = false;
  for (const row of allRows) {
    if (!inListPhase) {
      if (row.closest('.list-item') || row.closest('.list-year-group')) {
        inListPhase = true;
      } else {
        intro.push(row);
        continue;
      }
    }
    current.push(row);
    if (row.classList.contains('list-item-divider')) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);

  const loadMore = /** @type {HTMLElement | null} */ (panel.querySelector('#load-more-container'));
  if (loadMore && loadMore.style.display !== 'none') {
    gsap.set(loadMore, { opacity: 0, yPercent: 100 });
  }
  const onAllComplete = () => {
    if (loadMore && loadMore.style.display !== 'none') {
      gsap.to(loadMore, { opacity: 1, yPercent: 0, duration: 0.4, ease: 'power2.out', clearProps: 'transform' });
    }
  };
  // 解鎖 group 內所有 list-item 的 pointer-events（rows 動畫完成後）
  const unlockGroup = /** @param {HTMLElement[]} groupRows */ (groupRows) => {
    groupRows.forEach(r => {
      const item = r.closest('.list-item');
      if (item) item.removeAttribute('data-pre-reveal');
    });
  };

  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    // 初次載入：intro 一個 trigger，每個 list-row group 各自一個 trigger（per-item ScrollTrigger 進場感）
    let completed = 0;
    const total = (intro.length ? 1 : 0) + groups.filter(g => g.length > 0).length;
    const incComplete = () => { completed++; if (completed === total) onAllComplete(); };
    if (total === 0) { onAllComplete(); return; }

    if (intro.length) {
      ScrollTrigger.create({
        trigger: intro[0], start: 'top 90%', once: true,
        onEnter: () => gsap.to(intro, {
          yPercent: 0, duration: 0.6, stagger: { each: 0.06 },
          ease: 'power3.out', clearProps: 'transform',
          onComplete: incComplete,
        }),
      });
    }
    groups.forEach(groupRows => {
      if (groupRows.length === 0) return;
      const triggerEl = groupRows[0].closest('.list-item') || groupRows[0];
      ScrollTrigger.create({
        trigger: triggerEl, start: 'top 90%', once: true,
        onEnter: () => gsap.to(groupRows, {
          yPercent: 0, duration: 0.6, stagger: { each: 0.06 },
          ease: 'power3.out', clearProps: 'transform',
          onComplete: () => { unlockGroup(groupRows); incComplete(); },
        }),
      });
    });
  } else {
    // 切換時：master timeline 嚴格 sequential — intro 0s → list-row groups 從 0.3s 起每 0.18s 接力
    const tl = gsap.timeline({ onComplete: onAllComplete });
    if (intro.length) {
      tl.to(intro, {
        yPercent: 0, duration: 0.5, stagger: { each: 0.06 },
        ease: 'power3.out', clearProps: 'transform',
      }, 0);
    }
    const groupStart = intro.length ? 0.3 : 0;
    groups.forEach((groupRows, idx) => {
      if (groupRows.length === 0) return;
      tl.to(groupRows, {
        yPercent: 0, duration: 0.6, stagger: { each: 0.06 },
        ease: 'power3.out', clearProps: 'transform',
        onComplete: () => unlockGroup(groupRows),
      }, groupStart + idx * 0.18);
    });
  }
}

/**
 * 播放整個 panel 的退場動畫：所有 reveal-row 一起 yPercent:100（無 stagger，往下滑出）
 * 退場期間鎖住 pointer-events（data-pre-reveal）；返回 Promise 在動畫完成時 resolve
 */
export function playAdmissionPanelExit(panel) {
  return new Promise(resolve => {
    if (!panel || typeof gsap === 'undefined') { resolve(); return; }
    panel.querySelectorAll('.list-item').forEach(it => it.setAttribute('data-pre-reveal', ''));
    const rows = panel.querySelectorAll('.list-reveal-row');
    const loadMore = /** @type {HTMLElement | null} */ (panel.querySelector('#load-more-container'));
    const showLoadMore = loadMore && loadMore.style.display !== 'none';
    if (rows.length === 0 && !showLoadMore) { resolve(); return; }

    // rows 在 clip wrapper 內：用 yPercent:100 即可隱藏（不動 opacity）
    // loadMore 無 clip wrapper：opacity + yPercent 雙管齊下
    const tl = gsap.timeline({ onComplete: resolve });
    if (rows.length) {
      tl.to(rows, {
        yPercent: 100,
        duration: 0.4,
        ease: 'power3.in',
        overwrite: true,
      }, 0);
    }
    if (showLoadMore) {
      tl.to(loadMore, {
        opacity: 0,
        yPercent: 100,
        duration: 0.4,
        ease: 'power3.in',
        overwrite: true,
      }, 0);
    }
  });
}

// Gallery prev/next（仿 activities bindInteractions 內 gallery 段）
// list-accordion onComplete 會 dispatch 'gallery:check' 觸發 chevron visibility 更新
function bindGallery(container) {
  container.querySelectorAll('.gallery-section').forEach(gallery => {
    if (gallery.dataset.galleryInit) return;
    gallery.dataset.galleryInit = '1';
    const inner = gallery.querySelector('.gallery-inner');
    const track = gallery.querySelector('.gallery-track');
    const prevBtn = gallery.querySelector('.gallery-prev');
    const nextBtn = gallery.querySelector('.gallery-next');
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    const updateChevrons = () => {
      const max = getMaxOffset();
      prevBtn?.classList.toggle('invisible', max === 0);
      nextBtn?.classList.toggle('invisible', max === 0);
    };
    gallery.closest('.list-item')?.addEventListener('gallery:check', updateChevrons);
    const STEP = () => track.clientWidth * 0.6;
    prevBtn?.addEventListener('click', () => {
      offset = Math.max(0, offset - STEP());
      inner.style.transform = `translateX(-${offset}px)`;
    });
    nextBtn?.addEventListener('click', () => {
      offset = Math.min(getMaxOffset(), offset + STEP());
      inner.style.transform = `translateX(-${offset}px)`;
    });
  });
}

// Lightbox：每個 list-item 的 [data-lightbox-open] 點擊開 lightbox（媒體序列由 data-media 指定）
function bindLightbox(container) {
  container.querySelectorAll('.list-item').forEach(item => {
    if (item.dataset.lbInit) return;
    item.dataset.lbInit = '1';
    const media = JSON.parse((item.dataset.media || '[]').replace(/&quot;/g, '"'));
    if (media.length === 0) return;
    item.querySelectorAll('[data-lightbox-open]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const index = parseInt(el.dataset.lightboxIndex, 10) || 0;
        openLightbox(media, index);
      });
    });
  });
}

// title marquee 偵測 overflow（仿 activities bindInteractions.initMarquees）
function initMarquees(container) {
  if (window.innerWidth < 768) return;
  requestAnimationFrame(() => {
    container.querySelectorAll('.list-title-marquee').forEach(wrap => {
      if (wrap.dataset.marqueeInit) return;
      const p = wrap.querySelector('p');
      if (!p) return;
      const checkOverflow = () => {
        if (p.scrollWidth > wrap.clientWidth + 1) {
          wrap.classList.add('is-overflow');
          if (!wrap.dataset.marqueeInit) {
            wrap.dataset.marqueeInit = '1';
            const clone = p.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            p.style.paddingRight = '3rem';
            clone.style.paddingRight = '3rem';
            wrap.appendChild(clone);
          }
          const offset = p.offsetWidth;
          wrap.style.setProperty('--marquee-offset', `-${offset}px`);
          const speed = Math.max(3, offset / 80);
          wrap.style.setProperty('--marquee-duration', `${speed}s`);
        } else {
          wrap.classList.remove('is-overflow');
        }
      };
      checkOverflow();
      window.addEventListener('resize', checkOverflow);
    });
  });
}
