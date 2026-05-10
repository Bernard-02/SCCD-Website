/**
 * Admission Data Loader
 * 採 list-item / list-header / list-content 結構（與 activities list 共用 list-accordion）
 * Header：title 點擊 active 後 padding-left 右移、sticky 在 top:200；date 為 subtitle（年/月/日）
 * Content：rich HTML body → gallery（videos+images，仿 workshop）→ attachments（list-ref-btn 樣式，連檔案 URL 不導頁）
 */

import { animateCardsClipReveal } from '../ui/scroll-animate.js';
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
    <div class="list-item list-none" data-media="${mediaJson}"${item.id ? ` id="item-admission-${item.id}"` : ''}>
      <div class="list-header cursor-pointer group transition-colors duration-fast flex items-stretch justify-between px-[4px] py-sm">
        <div class="flex flex-col gap-xs flex-1 min-w-0">
          <div class="list-reveal-row">
            <div class="list-title-marquee"><p class="text-h5 font-bold">${item.title}</p></div>
          </div>
          ${item.date ? `<div class="list-reveal-row"><p class="text-p2">${formatFullDate(item.date)}</p></div>` : ''}
        </div>
        <div class="flex items-stretch flex-shrink-0 pt-[0.25rem]">
          <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300 self-start"></i>
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

  // 仿 hero title 進場：title row 與 date row 各自 clip-reveal（border 留 list-item 不動，per-row 滑入）
  // 同 item 內 title 在 date 上方 → axis:'y' stagger 自然先後出現
  const initialRows = container.querySelectorAll('.list-reveal-row');
  if (loadMoreContainer) gsap.set(loadMoreContainer, { opacity: 0, display: 'flex' });
  animateCardsClipReveal(initialRows, true, {
    onLastEnter: loadMoreContainer
      ? () => gsap.to(loadMoreContainer, { opacity: 1, duration: 0.3, ease: 'power2.out' })
      : null,
  });

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
      const newRows = newItems.flatMap(item => [...item.querySelectorAll('.list-reveal-row')]);
      animateCardsClipReveal(newRows, false);
    });
  }
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
