/**
 * Activities Data Loader Module
 * 負責讀取 JSON 資料並渲染 Activities 相關頁面的 HTML
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { ensureFlagIconsCss } from '../ui/ensure-flag-icons.js';
import { countryName } from '../../data/country-names.js';
import { DUR, EASE } from '../ui/motion.js';
import { loadSummerCamp } from './summer-camp-source.js';
// '/data/x.json' 字串同時是 fetch URL 與 map key / 比對識別字（SECTION_DATA_URL 等），
// 識別字保持原樣，只在真正 fetch 的點包 sitePath()（子路徑部署時換算成站台根絕對 URL）
import { sitePath } from '../ui/site-base.js';

// ── Reference 自動 lookup ─────────────────────────────────────────────────────
// ref 只填 { section, itemId } 即可；title/label 渲染前自動從目標 JSON lookup。
// 已手動填的欄位（titleEn/titleZh/labelEn/labelZh）視為 override，不覆蓋。

const SECTION_DATA_URL = {
  workshop:           '/data/workshops.json',
  industry:           '/data/industry.json',
  lectures:           '/data/lectures.json',
  'students-present': '/data/students-present.json',
  'summer-camp':      '/data/summer-camp.json',
  exhibitions:        '/data/general-activities.json',
  competitions:       '/data/general-activities.json',
  conferences:        '/data/general-activities.json',
  visits:             '/data/general-activities.json',
};

export const SECTION_LABELS = {
  workshop:           { en: 'Workshop',                      zh: '工作坊' },
  industry:           { en: 'Industry Partnerships',         zh: '產學合作' },
  lectures:           { en: 'Lectures',                      zh: '講座' },
  'students-present': { en: 'Students Present',              zh: '學生自主' },
  'summer-camp':      { en: 'Summer Camp',                   zh: '暑期體驗營' },
  exhibitions:        { en: 'Exhibitions',                   zh: '展演' },
  competitions:       { en: 'Competitions',                  zh: '競賽' },
  conferences:        { en: 'Conferences',                   zh: '研討會' },
  visits:             { en: 'Visits',                        zh: '參訪' },
};

const _refDataCache = new Map();

export async function getSectionData(section) {
  // 特例：exhibitions section 同時涵蓋 special（general-activities.json category=exhibitions）+ permanent（permanent-exhibitions.json）
  if (section === 'exhibitions') {
    const cacheKey = '__exhibitions_merged__';
    if (_refDataCache.has(cacheKey)) return _refDataCache.get(cacheKey);
    const promise = Promise.all([
      fetch(sitePath('data/general-activities.json')).then(r => r.json()),
      fetch(sitePath('data/permanent-exhibitions.json')).then(r => r.json()),
    ]).then(([a, b]) => [
      ...(Array.isArray(a) ? a : []),
      ...(Array.isArray(b) ? b : []),
    ]).catch(e => {
      console.warn('ref lookup: failed to merge exhibitions', e);
      return null;
    });
    _refDataCache.set(cacheKey, promise);
    return promise;
  }

  const url = SECTION_DATA_URL[section];
  if (!url) return null;
  if (_refDataCache.has(url)) return _refDataCache.get(url);
  const promise = fetch(sitePath(url)).then(r => r.json()).catch(e => {
    console.warn('ref lookup: failed to load', url, e);
    return null;
  });
  _refDataCache.set(url, promise);
  return promise;
}

export function findItemById(data, itemId) {
  if (!Array.isArray(data)) return null;
  for (const yg of data) {
    for (const item of yg.items || []) {
      if (item.id === itemId) return item;
    }
  }
  return null;
}

// 補齊 ref 缺失欄位（title/cover/label）；已存在的欄位不覆蓋
async function resolveRef(ref) {
  if (!ref.section || !ref.itemId) return;

  // label 用 section 對應表自動填（若 ref 沒寫）
  const labelMap = SECTION_LABELS[ref.section];
  if (labelMap) {
    if (!ref.labelEn) ref.labelEn = labelMap.en;
    if (!ref.labelZh) ref.labelZh = labelMap.zh;
  }

  // title 需要去目標 JSON lookup
  if (ref.titleEn && ref.titleZh) return;

  const data = await getSectionData(ref.section);
  if (!data) return;
  const item = findItemById(data, ref.itemId);
  if (!item) return;

  // 兩種命名模式：
  //  A) title=zh, title_en=en（industry / lectures / summer-camp / general-activities）
  //  B) title=en, title_zh=zh（workshops / students-present）
  const isModeA = !!item.title_en;
  const targetEn = isModeA ? item.title_en : item.title;
  const targetZh = isModeA ? item.title    : item.title_zh;

  if (!ref.titleEn && targetEn) ref.titleEn = targetEn;
  if (!ref.titleZh && targetZh) ref.titleZh = targetZh;
}

// Ref btn click 分派：pdfUrl 走共用 PDF viewer（sccd:open-pdf）／否則走 SPA item 跳轉
// pdfUrl btn 走 button + dataset；section/itemId btn 走 __sccdNavigateToItem；ref.href 走原生 <a> 不走此 handler
// pdfUrl btn 額外 reverse-lookup「此 PDF 還被哪些 activity ref 到」，filter 掉當前 host 後給 viewer 顯示
const _REF_ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
function bindRefBtnClick(btn) {
  btn.addEventListener('click', async () => {
    const pdfUrl = btn.dataset.refPdfUrl;
    if (pdfUrl) {
      const titleEn = btn.dataset.refTitleEn || '';
      const titleZh = btn.dataset.refTitleZh || '';
      const color = _REF_ACCENT_COLORS[Math.floor(Math.random() * _REF_ACCENT_COLORS.length)];
      const hostSection = btn.dataset.refHostSection || '';
      const hostItem    = btn.dataset.refHostItem || '';
      // 先 dispatch（讓 viewer 立刻 open 不延遲），references 之後 lazy lookup 再 setReferences
      // 但目前 viewer setReferences 是在 sccd:open-pdf handler 內同步呼叫，需把 references 也跟著 await
      // — 索引第二次以後是 cached，僅首次 ~一次 fetch 延遲
      const { getPdfRefSources } = await import('./pdf-cross-ref-index.js');
      const references = await getPdfRefSources(pdfUrl, {
        excludeSection: hostSection,
        excludeItemId: hostItem,
      });
      document.dispatchEvent(new CustomEvent('sccd:open-pdf', {
        detail: { pdfUrl, title: { en: titleEn, zh: titleZh }, color, references },
      }));
      return;
    }
    const section = btn.dataset.refSection;
    const itemId  = btn.dataset.refItem;
    if (typeof window.__sccdNavigateToItem === 'function') {
      window.__sccdNavigateToItem(section, itemId || null);
    }
  });
}

// Helper: 為 list-item 內的海報及 gallery 圖片加上 hover 旋轉歸 0 效果
// 對齊 library files/album 模式：random rotation 1~3°（兩邊隨機 sign），hover 歸 0
export function bindMediaHover(container) {
  container.querySelectorAll('.list-item').forEach(workshopItem => {
    const applyHover = (wrapper) => {
      if (wrapper.dataset.hoverInit) return;
      wrapper.dataset.hoverInit = '1';
      const img = wrapper.querySelector('img');
      if (!img) return;
      // overflow:visible 避免 wrapper 上 .overflow-hidden（poster）裁掉旋轉後的角
      wrapper.style.overflow = 'visible';
      // 旋轉幅度刻意小（0.5°~1.5°），避免外溢過多影響 layout
      const initDeg = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1);
      img.dataset.initDeg = String(initDeg);
      gsap.set(img, { rotation: initDeg });
      wrapper.addEventListener('mouseenter', () => {
        gsap.to(img, { rotation: 0, duration: DUR.fast, ease: EASE.enterSoft });
      });
      wrapper.addEventListener('mouseleave', () => {
        const deg = parseFloat(img.dataset.initDeg) || 0;
        gsap.to(img, { rotation: deg, duration: DUR.fast, ease: EASE.enterSoft });
      });
    };

    // 海報及所有有 data-lightbox-open 的容器
    workshopItem.querySelectorAll('[data-lightbox-open]').forEach(wrapper => applyHover(wrapper));

    // gallery 裸 <img>（沒有包在 [data-lightbox-open] 裡的）
    workshopItem.querySelectorAll('.gallery-inner img').forEach(img => {
      const existingWrapper = img.closest('[data-lightbox-open]');
      if (!existingWrapper) applyHover(img.parentElement);
    });

    // album thumbnails（buildAlbumsHtml 渲染的每張縮圖）
    workshopItem.querySelectorAll('.album-thumb-btn').forEach(btn => applyHover(btn));
  });
}


// ── Shared HTML Builders ─────────────────────────────────────────────────────

// 建立 media list（海報 → videos → images）
// 不去重：user 要求後台 key 兩張一樣的圖就放兩張（外層 thumbnail 與 lightbox 數量必須對齊）
// 防禦性：images/videos 陣列裡若有 null/空字串/whitespace，map 前先 filter 掉避免 lightbox 出現空 thumbnail
const isValidUrl = (s) => typeof s === 'string' && s.trim() !== '';
// 把 item.videos / item.images 從新 endpoint group shape 還原成 string array
// 支援 3 shape:
//   - string array (legacy data/X.json): ["url", "url"]
//   - group repeater array (CMB2 type:group): [{videoUrl|image|url: "url"}, ...]
//   - dict object (CMB2 type:file_list a.k.a. image_list / video_list): { "12345": "url", "12346": "url" }
function normalizeMediaArr(arr, key) {
  if (!arr) return [];
  // dict object (CMB2 file_list)
  if (!Array.isArray(arr) && typeof arr === 'object') {
    return Object.values(arr).filter(v => typeof v === 'string' && v);
  }
  return arr.map(x => typeof x === 'string' ? x : (x?.[key] || '')).filter(Boolean);
}

// 取整筆 item 所有影片 URL（merge 3 來源）：
//   - item.videos (legacy group `[{videoUrl}]` or string array)
//   - item.videoLinks (新 schema group `[{url}]`)
//   - item.videoFiles (新 schema video_list dict `{id: url}`)
function getAllVideos(item) {
  return [
    ...normalizeMediaArr(item.videos, 'videoUrl'),
    ...normalizeMediaArr(item.videoLinks, 'url'),
    ...normalizeMediaArr(item.videoFiles, ''), // video_list dict，第二參數不重要
  ];
}

// wysiwyg content 後台 user 編輯後可能只剩純文字 + \r\n（TinyMCE Text mode / Shift+Enter）
// 沒 <p> wrap 的話前端 admission-body flex gap-md 抓不到 children，視覺一坨。
// 偵測到 raw 不含 <p>/<br>/<div>/<li> 等 block tag → wpautop-like 轉換：
//   - 連續換行（空行）→ </p><p>
//   - 單一換行 → <br>
//   - 整段 wrap <p>
// 已有 HTML tag 的（import source / TinyMCE Visual mode）直接 return 原樣
function normalizeBodyHtml(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  if (/<(p|br|div|li|h[1-6]|ul|ol)\b/i.test(raw)) return raw; // 已有 block tag → 原樣
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
}
export function buildItemMedia(item) {
  const videos = getAllVideos(item);
  const images = normalizeMediaArr(item.images, 'image');
  const all = [
    ...(isValidUrl(item.poster) ? [{ type: 'image', src: item.poster.trim(), thumb: item.poster.trim() }] : []),
    ...videos.filter(isValidUrl).map(url => {
      const vid = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      return vid ? { type: 'video', src: `https://www.youtube.com/embed/${vid}`, thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` } : null;
    }).filter(Boolean),
    ...images.filter(isValidUrl).map(src => ({ type: 'image', src: src.trim(), thumb: src.trim() })),
  ];
  return all.filter(m => m.src);
}

// 視覺 poster：item.poster 沒填就 fallback 用 item.images[0]
// caller buildPosterHtml / 過濾空 media 都靠這個判斷
function getEffectivePoster(item) {
  if (item.poster) return item.poster;
  // images 可能是 string array 或 group repeater 物件 array
  const first = item.images?.[0];
  if (!first) return '';
  return typeof first === 'string' ? first : (first.image || '');
}

// Albums list HTML（每筆 = 一個 album，各自有獨立 media，點擊開 lightbox）
// 過濾掉沒有 images 的 album：user 反映「list 裡有些 album 沒圖片卻仍能切換過去」
// 沒圖片就不該佔 list 位置（即使有 date/location 也不渲染）
// unbounded=true 時拿掉內層 max-height + scroll（permanent exhibitions 預設展開，user 希望整個 album list 直接攤開不需內層 scroll）
export function buildAlbumsHtml(item, { unbounded = false } = {}) {
  if (!item.albums?.length) return '';
  // 過濾單一 album：images 內任何 null/空字串/whitespace 都先剔除，再判斷 album 是否還有有效 image
  // 沒有就整個 album 不渲染（避免 user 點進去 lightbox 因 mediaList 空 abort 表現為「點了沒反應」）
  const albums = item.albums
    .map(a => ({ ...a, images: (a.images || []).filter(isValidUrl).map(s => s.trim()) }))
    .filter(a => a.images.length > 0);
  if (albums.length === 0) return '';

  const itemsHtml = albums.map((album, gi) => {
    const isLast = gi === albums.length - 1;
    const mediaJson = JSON.stringify(album.images.map(src => ({ type: 'image', src, thumb: src }))).replace(/"/g, '&quot;');
    // Lightbox title 用「該 album 本身」(date + location)，不是父 list-item 標題
    const albumTitleEn = [album.date, album.location].filter(Boolean).join('  ');
    const albumTitleZh = album.location_zh || '';
    const albumTitleJson = JSON.stringify({ en: albumTitleEn, zh: albumTitleZh }).replace(/"/g, '&quot;');
    // 每張縮圖獨立 button + data-album-index，click 開 lightbox 對應 index
    // onerror 自摧毀單張 thumb：broken 檔不留 broken icon（對齊 buildPosterHtml）
    const thumbsHtml = album.images.map((src, i) => `
      <button type="button" class="album-thumb-btn flex-shrink-0 overflow-hidden cursor-pointer" data-album-index="${i}" style="height: 72px;">
        <img src="${src}" alt="" class="h-full w-auto block" onerror="this.parentElement.style.display='none'">
      </button>
    `).join('');
    // 結構：外層 grid 2 col [year | content]，year 在最左 col1，content 在 col2
    //   content (col2) = flex-col 兩段：
    //     ① date + title 同一橫排 group（user 視為一組「上層 metadata」）
    //     ② album-gallery（獨立區塊，視覺在 date/title group 下方，起點對齊 date 左緣 = col2 左緣）
    //   user 指定：date 跟 album 「不是一起的」，album 是該 group 的下方延伸，所以 col2 內部用 flex-col 而非 nested grid
    // 結構：外層 flex-col gap-md（避免 grid cell 各別 sticky 的問題）
    //   ① sticky row：grid 3-col [year | date | title]，整列單一 sticky element
    //   ② album-gallery row：同樣 grid 3-col template 對齊，第一個 col 空 spacer 撐 year 寬，
    //      第二 col 起 album-gallery（chevron + thumbs），thumbnail 第一張視覺對齊 date 左緣
    const gridTemplate = 'grid-template-columns: auto auto 1fr;';
    return `
      <div class="album-thumb-item flex flex-col gap-sm py-sm mr-xl ${!isLast ? 'border-b-4 border-black' : ''}"
           data-album-media="${mediaJson}"
           data-album-title="${albumTitleJson}">
        <div class="album-sticky-cell grid items-start gap-x-xl pb-xs" style="${gridTemplate}">
          ${album.year ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${album.year}</p></div>` : '<div></div>'}
          ${album.date ? `<div class="flex-shrink-0"><p class="text-p2 font-bold">${album.date}</p></div>` : '<div></div>'}
          ${album.location || album.location_zh ? `<div class="flex items-start justify-between gap-xl">
            <div>
              ${album.location ? `<p class="text-p2 font-bold">${album.location}</p>` : ''}
              ${album.location_zh ? `<p class="text-p2 font-bold">${album.location_zh}</p>` : ''}
            </div>
          </div>` : '<div></div>'}
        </div>
        <!-- album-gallery row：grid 對齊 sticky row 同 template，col1=year spacer 留空，col2-3 跨 chevron+track+chevron
             結果：album-prev chevron 對齊 date 左緣，第一張 thumb = chevron 之後（內縮 32px from date） -->
        <div class="grid items-center gap-x-xl" style="${gridTemplate}">
          <div></div>
          <div class="album-gallery col-start-2 col-end-4 flex items-center">
            <button type="button" class="album-prev invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
              <span class="icon icon-chevron-list icon-s"></span>
            </button>
            <div class="album-track flex-1 min-w-0" style="overflow-x: clip; overflow-y: visible; padding: 8px 0;">
              <div class="album-track-inner flex items-center gap-sm" style="transition: transform 0.3s ease;">
                ${thumbsHtml}
              </div>
            </div>
            <button type="button" class="album-next invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
              <span class="icon icon-chevron-list icon-s rotate-180"></span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return unbounded
    ? `<div class="item-albums">${itemsHtml}</div>`
    : `<div class="item-albums overflow-y-auto list-scroll" style="max-height: 252px;">${itemsHtml}</div>`;
}

// 海報區塊 HTML
// poster 沒填時 fallback 用 images[0]（user 指定：「poster 沒有就是第一個圖片，不顯示 broken link」）
// onerror 自摧毀 wrapper：URL 對但圖檔 404 / 跨域擋下時不會留 broken icon
// lightbox-index：poster 來自 item.poster 時對應 mediaList[0]；fallback 自 images[0] 時對應 videos.length（即 images 起點）
export function buildPosterHtml(item) {
  const src = getEffectivePoster(item);
  if (!src) return '';
  const lightboxIndex = item.poster ? 0 : (item.videos?.length || 0);
  return `
    <div class="overflow-hidden cursor-pointer" data-lightbox-open data-lightbox-index="${lightboxIndex}">
      <img src="${src}" alt="${item.title} poster" class="poster-img w-full block object-cover" onerror="this.closest('[data-lightbox-open]').style.display='none'">
    </div>
  `;
}

// Gallery 區塊 HTML（videos + images）
// 支援 2 種 input shape：
//   - 舊：item.videos = ["url", "url"], item.images = ["url", "url"]
//   - 新（WP endpoint group repeater）：item.videos = [{videoUrl: "url"}, ...], item.images = [{image: "url"}, ...]
export function buildGalleryHtml(item) {
  const posterOffset = item.poster ? 1 : 0;
  const videos = getAllVideos(item);
  const images = normalizeMediaArr(item.images, 'image');
  const galleryItems = [
    ...videos.map((url, vi) => {
      const videoId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      if (!videoId) return '';
      const lbIndex = posterOffset + vi;
      return `<div class="h-full flex-shrink-0 aspect-video relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" class="w-full h-full object-cover block">
        <div class="absolute inset-0 bg-black" style="opacity:0.2;"></div>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,0 20,12 0,24" fill="white" fill-opacity="0.5"/>
          </svg>
        </div>
      </div>`;
    }),
    // onerror 自摧毀 wrapper：URL 對但檔 404 / 跨域擋下時不會留 broken icon（對齊 buildPosterHtml）
    ...images.map((src, ii) => {
      const lbIndex = posterOffset + videos.length + ii;
      return `<div class="h-full flex-shrink-0 relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="${src}" alt="" class="h-full w-auto block" onerror="this.closest('[data-lightbox-open]').style.display='none'">
      </div>`;
    }),
  ].filter(Boolean);

  if (galleryItems.length === 0) return '';
  return `
    <div class="gallery-section pb-lg flex items-center">
      <button class="gallery-prev invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
        <span class="icon icon-chevron-list icon-s"></span>
      </button>
      <div class="gallery-track flex-1" style="height: 120px; overflow-x: clip; overflow-y: visible;">
        <div class="gallery-inner flex gap-md h-full" style="transition: transform 0.3s ease;">
          ${galleryItems.join('')}
        </div>
      </div>
      <button class="gallery-next invisible flex-shrink-0 w-[32px] h-[32px] flex items-center justify-center text-p2 hover:opacity-60 transition-opacity">
        <span class="icon icon-chevron-list icon-s rotate-180"></span>
      </button>
    </div>
  `;
}

// 單一講者/來賓 block（name 粗體 + 右側國家；下排 org/affiliation + 右側國家）
// item-level guests 與 conference sessions[].guests 共用同一份渲染。
// 兩種 shape 都接：新(endpoint) nameEn/nameZh/orgEn/orgZh/country/isAlumni
//                舊(data/X.json) name/name_zh/affiliation/affiliation_zh/country/country_zh/isAlumni
export function buildGuestHtml(g, { showGuestCountry = true, showGuestAffiliation = true } = {}) {
  const gNameEn = g.nameEn || g.name || '';
  const gNameZh = g.nameZh || g.name_zh || '';
  const gCountry = g.country || ''; // 新 shape 是 ISO code，舊是顯示字串
  const gCountryZh = g.country_zh || '';
  const gOrgEn = g.orgEn || g.affiliation || '';
  const gOrgZh = g.orgZh || g.affiliation_zh || '';
  const gIsAlumni = g.isAlumni === 'on' || g.isAlumni === true || g.isAlumni;
  // user 2026-06-10 #2：title 與「國家」用 grid 2 欄分開對齊（國家欄固定寬 → 所有 row 的國家落在同一起始 x）；
  //   國家包進 .list-title-marquee，太長超出欄寬就 marquee（不換行不擠壓 title 欄）。
  const countryCell = (cls) => gCountry ? `<div class="list-title-marquee"><p class="${cls}">${gCountry}${gCountryZh ? ` ${gCountryZh}` : ''}</p></div>` : '';
  return `<div class="flex flex-col" style="gap: 0.25rem;">
    <div class="grid gap-md items-start guest-row-grid">
      <div class="min-w-0">
        ${gNameEn ? `<p class="text-p2 font-bold">${gNameEn}</p>` : ''}
        ${gNameZh ? `<p class="text-p2 font-bold">${gNameZh}</p>` : ''}
      </div>
      ${showGuestCountry ? `<div class="min-w-0">
        ${gIsAlumni ? `<p class="text-p2">Alumni 系友</p>` : ''}
        ${countryCell('text-p2')}
      </div>` : ''}
    </div>
    ${showGuestAffiliation && gOrgEn ? `<div class="grid gap-md items-start guest-row-grid">
      <p class="text-p3 min-w-0">${gOrgEn.length > 20 ? `${gOrgEn}<br>${gOrgZh || ''}` : `${gOrgEn}${gOrgZh ? ' ' + gOrgZh : ''}`}</p>
      ${showGuestCountry ? countryCell('text-p3') : ''}
    </div>` : ''}
  </div>`;
}

// Conference 每日場次（論壇）列表：each session = date + title + guests + 說明
// 結構對齊摘要列：[date col（同 dateColMinWidth）| 內容]；講者沿用 buildGuestHtml。
// 只在 item.sessions 有資料時渲染（目前僅 conferences 用）；其他 section 無此欄＝回傳空字串不影響。
// session date 用同 item.dates 的 group 結構（[{startYear,startMonth,startDay,...}]）→ 沿用 formatDatesFromGroups；
// 也容舊式 s.date 純字串 fallback。
// 說明文字（user 2026-06-05）：改成「每場次各自一段」`descriptionEn`/`descriptionZh`，渲染在該場次最下方；
// 沒 key（兩語皆空）就不渲染那段（取代原本 card 層級的單一說明，card 層級在 caller 處被 sessions 抑制）。
function buildSessionsHtml(item, dateColMinWidth, { showGuestCountry = true, showGuestAffiliation = true } = {}) {
  if (!Array.isArray(item.sessions) || item.sessions.length === 0) return '';
  const rows = item.sessions.map(s => {
    const sDate = Array.isArray(s.dates) && s.dates.length
      ? formatDatesFromGroups(s.dates)
      : (s.date || '');
    const sTitleEn = s.titleEn || s.title_en || s.title || '';
    const sTitleZh = s.titleZh || s.title_zh || '';
    const sDescEn = s.descriptionEn || s.desEn || '';
    const sDescZh = s.descriptionZh || s.desZh || '';
    const guestsHtml = (Array.isArray(s.guests) ? s.guests : [])
      .map(g => buildGuestHtml(g, { showGuestCountry, showGuestAffiliation }))
      .join('');
    // 說明文字（user 2026-06-05 #3）：移出內容欄，放在 date|內容 grid 之下、整段「從日期左緣」全寬對齊。
    // date 欄（user #4）：包進 list-title-marquee，跨年過長時自動 marquee（同其他 date 欄）。
    return `<div class="flex flex-col gap-sm">
      <div class="grid items-start gap-x-xs" style="grid-template-columns: ${dateColMinWidth} 1fr;">
        <div class="min-w-0">${sDate ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${sDate}</p></div>` : ''}</div>
        <div class="flex flex-col gap-sm min-w-0">
          ${(sTitleEn || sTitleZh) ? `<div>
            ${sTitleEn ? `<p class="text-p2 font-bold">${sTitleEn}</p>` : ''}
            ${sTitleZh ? `<p class="text-p2 font-bold">${sTitleZh}</p>` : ''}
          </div>` : ''}
          ${guestsHtml ? `<div class="flex flex-col gap-sm">${guestsHtml}</div>` : ''}
        </div>
      </div>
      ${(sDescEn || sDescZh) ? `<div>
        ${sDescEn ? `<p class="text-p2 leading-base">${sDescEn}</p>` : ''}
        ${sDescZh ? `<p class="text-p2 leading-base${sDescEn ? ' mt-xs' : ''}">${sDescZh}</p>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="flex flex-col gap-lg">${rows}</div>`;
}

// ── Shared Post-Render Bindings ───────────────────────────────────────────────

// Lightbox title 改成 list-item 名稱（user 指定：不是 section 分類名稱），accent 底色仍從 active section 取
// elem = 觸發 lightbox 的元素（album-thumb 或 [data-lightbox-open]），closest .list-item 即父層
function getLightboxMeta(elem) {
  const btn = document.querySelector('.activities-section-btn.active');
  const inner = /** @type {HTMLElement | null | undefined} */ (btn?.querySelector('.anchor-nav-inner'));
  const color = inner?.style.background || '';

  const listItem = elem.closest('.list-item');
  // marquee 溢出時會 append clone <p>，直接抓 :scope > .list-header 下「每個 marquee wrap 的第一個 p」才是真本文
  const marquees = listItem?.querySelectorAll(':scope > .list-header .list-title-marquee') || [];
  const title = {
    en: marquees[0]?.querySelector('p')?.textContent.trim() || '',
    zh: marquees[1]?.querySelector('p')?.textContent.trim() || ''
  };

  return { title, color };
}

// Gallery 滑動、Lightbox、hover、海報比例偵測；回傳 GSAP 動畫啟動函數
export function bindInteractions(container, { autoReveal = true } = {}) {
  // Albums lightbox：click 單張 thumb 開 lightbox 對應 index
  // data-album-media + data-album-title 在父 .album-thumb-item，data-album-index 在 .album-thumb-btn
  // 整個 row 不再 click open（user 反映：要看 thumbnail 不是 row click → 視覺有 thumb 後點 thumb 才直觀）
  // title override = 該 album 的 date+location；不用父 list-item title（user 指定）
  container.querySelectorAll('.album-thumb-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();  // 避免父 list-header 收合
      const albumEl = /** @type {HTMLElement | null} */ (btn.closest('.album-thumb-item'));
      if (!albumEl) return;
      const media = JSON.parse((albumEl.dataset.albumMedia || '').replace(/&quot;/g, '"'));
      const index = parseInt(/** @type {HTMLElement} */ (btn).dataset.albumIndex || '0', 10) || 0;
      if (!media.length) return;
      const meta = getLightboxMeta(btn);
      if (albumEl.dataset.albumTitle) {
        try {
          meta.title = JSON.parse(albumEl.dataset.albumTitle.replace(/&quot;/g, '"'));
        } catch (_) { /* fallback 用 parent title */ }
      }
      openLightbox(media, index, meta);
    });
  });

  // Album thumbnails 橫向 track：chevron 切換（跟 .gallery-section 同 pattern，只是 selector 不同）
  // chevron absolute 蓋在 track 左右邊：thumbs 永遠對齊 location 左緣不被 chevron 推開
  container.querySelectorAll('.album-gallery').forEach(gallery => {
    const inner = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-track-inner'));
    const track = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-track'));
    const prevBtn = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-prev'));
    const nextBtn = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-next'));
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    // max==0 整顆隱藏（沒東西可滑）；否則依 offset 端點 50% 透明暗示「到底了」
    const updateChevrons = () => {
      const max = getMaxOffset();
      const noScroll = max === 0;
      prevBtn?.classList.toggle('invisible', noScroll);
      nextBtn?.classList.toggle('invisible', noScroll);
      // 到端點＝視覺暗示「到底了」：opacity 0.5 + not-allowed 游標。這些 chevron 不是原生 disabled（只改 opacity），
      // inline style.cursor（spec=1000）直接生效；不設的話會吃到 cursor.css `button:not(:disabled)` 的 pointer。
      const atStart = !noScroll && offset <= 0;
      const atEnd   = !noScroll && offset >= max;
      if (prevBtn) { prevBtn.style.opacity = atStart ? '0.5' : ''; prevBtn.style.cursor = atStart ? 'var(--cursor-not-allowed)' : ''; }
      if (nextBtn) { nextBtn.style.opacity = atEnd ? '0.5' : ''; nextBtn.style.cursor = atEnd ? 'var(--cursor-not-allowed)' : ''; }
    };
    // list-item 展開後 dispatch 'gallery:check'，這時 inner.scrollWidth 才是真實值
    gallery.closest('.list-item')?.addEventListener('gallery:check', updateChevrons);
    // 額外 ResizeObserver：track width 變化（grid layout reflow / window resize）時重算 chevron 顯隱
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(updateChevrons).observe(track);
    }
    const STEP = () => track.clientWidth * 0.6;
    prevBtn?.addEventListener('click', e => {
      e.stopPropagation();
      offset = Math.max(0, offset - STEP());
      inner.style.transform = `translateX(-${offset}px)`;
      updateChevrons();
    });
    nextBtn?.addEventListener('click', e => {
      e.stopPropagation();
      offset = Math.min(getMaxOffset(), offset + STEP());
      inner.style.transform = `translateX(-${offset}px)`;
      updateChevrons();
    });
  });

  // Gallery 左右滑動
  container.querySelectorAll('.gallery-section').forEach(gallery => {
    const inner = gallery.querySelector('.gallery-inner');
    const track = gallery.querySelector('.gallery-track');
    const prevBtn = gallery.querySelector('.gallery-prev');
    const nextBtn = gallery.querySelector('.gallery-next');
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    const updateChevrons = () => {
      const max = getMaxOffset();
      const noScroll = max === 0;
      prevBtn?.classList.toggle('invisible', noScroll);
      nextBtn?.classList.toggle('invisible', noScroll);
      // 到端點 opacity 0.5 + not-allowed 游標（同 album-gallery，非原生 disabled inline cursor 直接生效）
      const atStart = !noScroll && offset <= 0;
      const atEnd   = !noScroll && offset >= max;
      if (prevBtn) { prevBtn.style.opacity = atStart ? '0.5' : ''; prevBtn.style.cursor = atStart ? 'var(--cursor-not-allowed)' : ''; }
      if (nextBtn) { nextBtn.style.opacity = atEnd ? '0.5' : ''; nextBtn.style.cursor = atEnd ? 'var(--cursor-not-allowed)' : ''; }
    };
    gallery.closest('.list-item')?.addEventListener('gallery:check', updateChevrons);
    // ResizeObserver：list-item 展開時 list-content height:0 → auto 過程中 track 寬度從 0 變實際值，
    // 單純 gallery:check (展開瞬間 dispatch) 算到的 track.clientWidth 還是 0 → chevron 永遠 invisible
    // 對齊 album-gallery 同 pattern (line 467-469)，跟著 track resize 重算
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(updateChevrons).observe(track);
    }
    const STEP = () => track.clientWidth * 0.6;
    prevBtn?.addEventListener('click', () => {
      offset = Math.max(0, offset - STEP());
      inner.style.transform = `translateX(-${offset}px)`;
      updateChevrons();
    });
    nextBtn?.addEventListener('click', () => {
      offset = Math.min(getMaxOffset(), offset + STEP());
      inner.style.transform = `translateX(-${offset}px)`;
      updateChevrons();
    });
  });

  // Lightbox 綁定
  container.querySelectorAll('.list-item').forEach(workshopItem => {
    const media = JSON.parse(workshopItem.dataset.media || '[]');
    if (media.length === 0) return;
    workshopItem.querySelectorAll('[data-lightbox-open]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const index = parseInt(el.dataset.lightboxIndex, 10) || 0;
        openLightbox(media, index, getLightboxMeta(el));
      });
    });
  });

  // 海報 & gallery hover 效果
  bindMediaHover(container);

  // 標題跑馬燈：偵測是否溢出，是則加 is-overflow + 設定捲動距離
  // list-content 內的 location marquee 渲染當下 clientWidth=0（h-0 overflow-hidden），會錯判 overflow；
  // 對 list-content 內的 wrap 額外綁 'gallery:check' event，accordion 展開時 list-accordion.js
  // 在 onComplete dispatch 該 event → 此時量 clientWidth 才是真值
  const initMarquees = () => {
    // 桌面手機都跑 — 手機 title 區窄更容易 overflow，user 要求收起時就要 marquee
    container.querySelectorAll('.list-title-marquee').forEach(wrap => {
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
      // 字體 async 載入後文字實寬會變 → 再量一次，確保「一進來就 marquee」不用等 hover / 展開才 re-check。
      // （rAF 首量時 web font(Inter/Noto)常還沒載完、用 fallback 字寬偏窄會誤判「沒 overflow」→ 漏設 is-overflow）
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(checkOverflow);
      // 在 list-content 內的（location marquee）等 accordion 展開後再量
      if (wrap.closest('.list-content')) {
        wrap.closest('.list-item')?.addEventListener('gallery:check', checkOverflow);
      }
      // 在 list-header 內的（title marquee）accordion 展開時 title 向右 translateX 縮小可用寬度，
      // 需要 re-check 以重設 marquee offset；展開動畫 0.5s 結束後 dispatch gallery:check 重量
      if (wrap.closest('.list-header')) {
        wrap.closest('.list-item')?.addEventListener('gallery:check', checkOverflow);
      }
      // ResizeObserver 取代 window resize：除了視窗縮放，更重要是涵蓋「section 切換時 panel 由 display:none→顯示」。
      // 非當前 section 的 panel 是 .hidden(display:none)，render 當下 title wrap clientWidth=0 量不到 overflow；
      // 切到該 section 時 wrap 0→實寬，ResizeObserver 自動 fire → re-check → 載入即 marquee（不用展開 accordion）。
      // 也順帶涵蓋展開時 active margin-right 讓 wrap 變窄的 re-check。
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(checkOverflow);
        ro.observe(wrap);
        registerPageCleanup(() => ro.disconnect());
      } else {
        window.addEventListener('resize', checkOverflow);
        registerPageCleanup(() => window.removeEventListener('resize', checkOverflow));
      }
    });
  };
  requestAnimationFrame(initMarquees);

  // 海報比例偵測
  container.querySelectorAll('.poster-img').forEach(img => {
    const apply = () => {
      const grid = img.closest('.list-content')?.querySelector('[style*="grid-template-columns"]');
      if (img.naturalWidth > img.naturalHeight) {
        img.classList.replace('object-cover', 'object-contain');
        img.classList.add('object-top');
        if (grid) grid.style.gridTemplateColumns = '8.5fr 3.5fr';
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  });

  // Reference 按鈕（舊 workshop-ref-btn / industry-ref-btn 已統一為 list-ref-btn，此處保留相容）
  container.querySelectorAll('.workshop-ref-btn, .list-ref-btn').forEach(btn => {
    bindRefBtnClick(btn);
  });

  // 進場動畫：per-row clip reveal + data-pre-reveal 守門（動畫前禁 hover/click）
  // onEnter 時同步移除 closest .list-item 的 data-pre-reveal，解鎖互動
  // autoReveal=false 時跳過此段，由 caller 自行管理 reveal（admission lazy load summer-camp 用）
  if (typeof gsap === 'undefined') return null;

  const allRows = [...container.querySelectorAll('.list-reveal-row')];
  if (allRows.length === 0) return null;

  const items = setupClipReveal(allRows);
  if (!autoReveal) return null;
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.batch(items, {
      start: 'top 90%',
      onEnter: /** @param {HTMLElement[]} batch */ batch => {
        playClipReveal(batch);
        batch.forEach(/** @param {HTMLElement} row */ row => {
          const listItem = row.closest('.list-item');
          if (listItem) listItem.removeAttribute('data-pre-reveal');
        });
      },
    });
  } else {
    playClipReveal(items);
  }
  return null;
}

// ── dates group repeater → display string（前端統一格式 / 寫死寬度的 source of truth）─
// shape: [{ startYear, startMonth, startDay, endYear, endMonth, endDay }, ...]
// 規格（user 契約 2026-05-25 v6，所有 list expand 區 date row 一致）：
//   - 起始日永不渲染年份（年份歸 list grouping / year header）
//   - 結束日只在跨年時才渲染年份（新資訊不能省）
//   - 單日 → `MM/DD`
//   - 同年跨日 → `MM/DD - MM/DD`
//   - 跨年 → `MM/DD - YYYY/MM/DD`（前端 col 寬度按此基準寫死；斜線前後不空格，user 2026-06-08）
// 多筆用 ", " 串接
//
// includeStartYear=true 例外：admission dateInHeader 用（沒 year column 副標需要完整日期）
//   - 單日 → `YYYY/MM/DD`
//   - 同年跨日 → `YYYY/MM/DD - MM/DD`
//   - 跨年 → `YYYY/MM/DD - YYYY/MM/DD`
function formatDatesFromGroups(datesArr, { includeStartYear = false } = {}) {
  if (!Array.isArray(datesArr) || datesArr.length === 0) return '';
  return datesArr.map(d => formatSingleDateGroup(d, includeStartYear)).filter(Boolean).join(', ');
}
function formatSingleDateGroup(d, includeStartYear = false) {
  if (!d) return '';
  const sY = d.startYear, sM = d.startMonth, sD = d.startDay;
  const eY = d.endYear || sY, eM = d.endMonth || sM, eD = d.endDay || sD;
  if (!sM || !sD) return '';
  const sameYear = sY === eY;
  const sameDate = sameYear && sM === eM && sD === eD;
  const pad = (n) => String(n).padStart(2, '0');
  const startPart = includeStartYear
    ? `${sY}/${pad(sM)}/${pad(sD)}`
    : `${pad(sM)}/${pad(sD)}`;
  if (sameDate) return startPart;
  const endPart = sameYear
    ? `${pad(eM)}/${pad(eD)}`
    : `${eY}/${pad(eM)}/${pad(eD)}`;
  return `${startPart} - ${endPart}`;
}

// ── 統一 List Renderer ────────────────────────────────────────────────────────
//
// 「Canonical list template」— 所有 list 樣式內容（activities / admission / alumni 各 list）
// 應該都走這個 function，不要再自己寫一份 list-item / list-header / list-content HTML。
// 「有填就渲染、沒填就不渲染」邏輯內建在條件 template 中（item.location ? ... : ''）。
//
// 變體（用 options 切）：
//   - activities default：結構化 metadata（date row + guests + description scroll + poster + gallery + refs）
//   - admission news：bodyField='content' + attachmentsField + dateInHeader + flatList
//   - alumni Gatherings：default + categoryFilter + hideYearHeader
//   - alumni Organization：bodyField='term' + flatList + hideYearHeader
//
// options（全部預設顯示，需隱藏的才設 false）：
//   categoryFilter       {string|null}  過濾 item.category
//   showYearToggle       {boolean}      年份收合 toggle（預設 true；false = 顯示年份但不可收合，summer camp 用）
//   showSubtitle         {boolean}      subtitle / subtitle_zh（預設 false）
//   subtitleFromGuests   {boolean}      副標改從 item.guests 派生（lectures 用：每位講者一段 EN+ZH，max 3 個）
//   showAlumniIcon       {boolean}      畢業帽 icon（預設 true）
//   showDate             {boolean}      date（預設 true）
//   showDescription      {boolean}      description / descriptionZh（預設 true）
//   showLocation         {boolean}      location（預設 true）
//   showPoster           {boolean}      poster（預設 true）
//   showReference        {boolean}      ref link（預設 true）
//   showGuestAffiliation {boolean}      guest affiliation（預設 true）
//   showGuestCountry     {boolean}      guest alumni + country（預設 true）
//   marqueeTitle         {boolean}      title 用 marquee 包裝（預設 false）
//   introField           {string}       內文 field 名稱（預設 'description'）
//   panelSelector        {string}       sticky top 參考的 panel selector
//   scrollTrigger        {boolean}      載入後自動建立 ScrollTrigger 動畫（預設 false）
//   autoReveal           {boolean}      載入後自動 setupClipReveal + ScrollTrigger.batch reveal（預設 true）；
//                                       false 時只 render，由 caller 自行管理 reveal（admission lazy load summer-camp 用）
//   flatList             {boolean}      data 是 flat array（admission / alumni Organization）而非 year-grouped
//                                       預設 false（活動類 data 是 [{year, items: []}]）；true 時把 data 當單一 virtual yearGroup
//   bodyField            {string|null}  expand 區改用 item[bodyField] 當 rich HTML body 渲染（admission='content'/
//                                       alumni Organization='term'），取代結構化 metadata（date row/guests/description/poster/gallery）
//   attachmentsField     {string}       attachments field 名（預設 'attachments'）— 附件清單以 paperclip + Attachment N 渲染
//   dateInHeader         {boolean}      date 顯示在 header 當 title 副標（admission news 用）；預設 false（date 在 expand 區）
//   data                 {Array|null}   直接傳 data 不 fetch（admission load-more pagination 用：caller 自己控 fetch + slice）
//                                       傳了 data 仍可傳 url（會被忽略）；data 必須 truthy 才走這條路

export async function loadListInto(containerId, url, options = {}) {
  ensureFlagIconsCss();
  const {
    categoryFilter       = null,
    visitTypeFilter      = null,
    visitTypeField       = 'visitType',
    showYearToggle       = true,
    hideYearHeader       = false,
    showSubtitle         = false,
    subtitleFromGuests   = false,
    showAlumniIcon       = true,
    showDescription      = true,
    showDate             = true,
    showLocation         = true,
    showPoster           = true,
    showReference        = true,
    showShareBtn         = true,
    showGuestAffiliation = true,
    showGuestCountry     = true,
    introField           = 'description',
    panelSelector        = null,
    scrollTrigger        = false,
    autoReveal           = true,
    flatList             = false,
    bodyField            = null,
    attachmentsField     = 'attachments',
    dateInHeader         = false,
    alwaysExpanded       = false,
    allowNoMedia         = false,
    dateColWidth         = null,
    dateFullWidth        = false,
    data: providedData   = null,
  } = options;

  const container = document.getElementById(containerId);
  if (!container) return;

  let data;
  if (providedData) {
    // caller 自己 fetch + slice（admission load-more 用），跳過 fetch
    data = providedData;
  } else {
    try {
      const res = await fetch(sitePath(url));
      data = await res.json();
    } catch (e) {
      console.error('loadListInto: failed to load', url, e);
      return;
    }
  }
  if (!data?.length) return;

  container.innerHTML = '';

  // flatList=true：把 flat array 包成單一 virtual yearGroup（year:'' + items:data）
  // 之後流程跟 year-grouped 一致；year header 由 hideYearHeader 隱藏（flatList 通常配 hideYearHeader:true）
  const sourceData = flatList ? [{ year: '', items: data }] : data;

  // 媒體導向 list (沒 bodyField，主內容是 poster/gallery/albums) 必須有可視 media 才渲染
  // 文字導向 list (有 bodyField，如 admission news content) 跳過 media 檢查
  // 「可視 media」= poster / images / videos / albums.any(images) 任一
  // images / videos 可能是 array (group/legacy) 或 dict object (CMB2 file_list)
  const mediaCount = (v) => {
    if (!v) return 0;
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'object') return Object.keys(v).length;
    return 0;
  };
  const hasVisibleMedia = (i) =>
    !!i.poster ||
    mediaCount(i.images) > 0 ||
    mediaCount(i.videos) > 0 ||
    mediaCount(i.videoLinks) > 0 ||
    mediaCount(i.videoFiles) > 0 ||
    (i.albums?.some(a => mediaCount(a.images) > 0));

  const filteredData = sourceData
    .map(yg => ({
      ...yg,
      items: (yg.items || []).filter(i =>
        (!categoryFilter  || i.category          === categoryFilter) &&
        (!visitTypeFilter || i[visitTypeField]   === visitTypeFilter) &&
        // 媒體導向 list 要有可視 media 才渲染；但 allowNoMedia（competitions/conferences 純文字活動）放行無媒體項目
        (bodyField || allowNoMedia || hasVisibleMedia(i))
      ),
    }))
    .filter(yg => yg.items.length > 0);

  // Resolve refs：補齊 title/cover/label（讓 ref 只填 section + itemId 即可運作）
  await Promise.all(filteredData.flatMap(yg =>
    yg.items.flatMap(item => {
      const refs = item.references || (item.reference ? [item.reference] : []);
      return refs.map(ref => resolveRef(ref));
    })
  ));

  // 推當前 list 的 section（給 PDF cross-ref 排除自己用）；推不出來 = null（PDF viewer 仍顯示全部來源）
  const hostSection = deriveHostSection(url, categoryFilter, visitTypeFilter);

  // 日期顯示邏輯抽 helper（pre-scan + render 兩處共用）
  // 新 endpoint shape `item.dates` 優先，fallback 舊 `item.date` / `item.date_en` 字串
  // dates 結構化欄位是 source of truth；舊 `item.date` 字串只在沒 dates 且為自由文字時 fallback 原樣輸出
  //（permanent-exhibitions "每學期舉辦一次" 等）。完成 JSON 遷移後絕大多數走 dates path。
  // dateInHeader（admission）沒 year column，header 副標需要完整日期含年份。
  const computeDateDisplay = (item) => {
    // 取消的場次（如暑期營某年停辦）：日期欄改顯示 Canceled / 取消（由 CMS isCancelled 布林標記）
    if (item.isCancelled) return { en: 'Canceled', zh: '取消' };
    if (Array.isArray(item.dates) && item.dates.length > 0) {
      return { en: formatDatesFromGroups(item.dates, { includeStartYear: dateInHeader }), zh: '' };
    }
    return {
      en: item.date_en || item.date || '',
      zh: item.date_en ? (item.date || '') : '',
    };
  };

  // Date col 固定寬（user 2026-06-05 升級全站 14ch + marquee，取代 v6 的 21ch 固定）：
  //   - 預設 '14ch'＝裝得下「同年區間」MM / DD - MM / DD（~13 字符），最常見情況不留多餘白、location 起點靠左對齊。
  //   - 跨年過長版 `MM / DD - YYYY / MM / DD`（~24 字符）超出 14ch → date <p> 包在 .list-title-marquee 內自動 marquee
  //     （見 render 處），不撐寬欄位、各 list 對齊不破。
  //   - dateColWidth option 仍保留供個別 list 覆寫；dateInHeader（admission）副標自由排版不受此 col 約束。
  const dateColMinWidth = dateColWidth || '14ch';

  filteredData.forEach((yearGroup, index) => {
    const isLast  = index === filteredData.length - 1;
    const total   = yearGroup.items.length;

    const itemsHtml = yearGroup.items.map((item, itemIdx) => {
      const media        = buildItemMedia(item);
      const mediaJson    = JSON.stringify(media).replace(/"/g, '&quot;');
      // 向下相容：支援舊的 reference 單一物件 → 自動轉為 array
      const references = item.references || (item.reference ? [item.reference] : []);
      const isLastItem   = itemIdx === total - 1;
      // height:4px 必須顯式設置 — 空 div 的 height:auto = 0，yPercent:100 = translateY(0) 不移動，setupClipReveal 無法隱藏
      // 桌面：最後一筆 divider 隱藏（年份組末端走 .activities-separator，避免兩條 4px 疊成 8px）
      // 手機：.activities-separator 在 lists.css 已 display:none，最後一筆 divider 要顯示提供視覺收尾
      //       → 用 .is-last class 而非 inline display:none，CSS 走 media query 分流（桌面隱、手機顯）
      const dividerHtml  = `<div class="list-item-divider list-reveal-row border-b-4 border-black${isLastItem ? ' is-last' : ''}" style="height:4px;"></div>`;

      const { en: dateDisplay, zh: dateDisplayZh } = computeDateDisplay(item);

      // 內文 field（workshop 用 intro / intro_zh，其他用 description / descriptionZh）
      const introEn = item[introField] || item.description || '';
      const introZh = item[introField + '_zh'] || item.descriptionZh || '';

      // title HTML（所有 list 統一使用 marquee，文字太長時自動捲動）
      // title 來源 normalize：
      //   - 新 endpoint shape: item.titleZh (= post_title) / item.titleEn
      //   - 舊 JSON shape: item.title (中文) / item.title_en / item.title_zh
      const titleEn = item.title_en || item.titleEn || '';
      const titleZh = item.title || item.titleZh || item.title_zh || '';
      const titleLine1 = titleEn || titleZh;
      const titleLine2 = titleEn ? titleZh : '';
      // 副標 normalize：吃 array `subtitles: [{en, zh}]` 或字串 `subtitle / subtitleEn / subtitleZh`
      // 都 → 統一 [{en, zh}] 形式（max 3 段）；空字串/空 obj 自動 filter。
      // 兩處 render 點（dateInHeader fallback / showSubtitle 展開區）共用 → 行為一致。
      // subtitleFromGuests=true（lectures 用）：改從 item.guests 派生簡名副標，每位講者一段 EN+ZH，
      // expand 區的 guests 詳細資料（affiliation / country）保留不變
      const subList = (() => {
        if (subtitleFromGuests && Array.isArray(item.guests) && item.guests.length) {
          return item.guests
            .map(g => ({
              en: g.nameEn || g.name || '',
              zh: g.nameZh || g.name_zh || '',
            }))
            .filter(s => s.en || s.zh)
            .slice(0, 3);
        }
        if (Array.isArray(item.subtitles)) {
          return item.subtitles
            .map(s => ({ en: s?.en || s?.subtitleEn || '', zh: s?.zh || s?.subtitleZh || '' }))
            .filter(s => s.en || s.zh)
            .slice(0, 3);
        }
        const en = item.subtitleEn || item.subtitle || '';
        const zh = item.subtitleZh || item.subtitle_zh || '';
        return (en || zh) ? [{ en, zh }] : [];
      })();
      // 副標 inner（無 wrapper）給 dateInHeader 模式直接拼進 list-reveal-row 用
      // 每行副標包進 .list-title-marquee：手機單行 nowrap + 打開(.list-header.active)才 marquee（user 2026-06-10）；
      // 桌面由 @media(min-width:768px) 覆寫回 wrap（見 lists.css），不影響桌面多行顯示
      const renderSubListInner = () => subList.map(s => `
        ${s.en ? `<div class="list-title-marquee"><p class="text-p2">${s.en}</p></div>` : ''}
        ${s.zh ? `<div class="list-title-marquee"><p class="text-p2">${s.zh}</p></div>` : ''}
      `).join('');
      // 副標 block（含 .list-subtitles wrapper）給 showSubtitle 模式用 — wrapper 是 sticky pinned 時
      // 收起副標的 CSS 接口（list-header.is-pinned .list-subtitles → grid-rows 0fr collapse）
      const renderSubListBlock = () => subList.length
        ? `<div class="list-reveal-row list-subtitles">${renderSubListInner()}</div>`
        : '';

      // 標題（EN+ZH）同一個 list-reveal-row → 同步進場；副標亦同
      // dateInHeader 時 date 顯示在 title 下方（admission news 用），不在 expand 區再渲染一次
      const titleHtml = `<div class="flex flex-col gap-xs flex-1 min-w-0">
          <div class="list-reveal-row">
            <div class="list-title-marquee"><p class="text-h5 font-bold">${titleLine1}</p></div>
            ${titleLine2 ? `<div class="list-title-marquee"><p class="text-h5 font-bold">${titleLine2}</p></div>` : ''}
            ${dateInHeader ? (() => {
              // dateInHeader 模式（admission 用）：date 優先，沒 date 用 subtitle 當副標
              if (dateDisplay) return `<p class="text-p2">${dateDisplay}</p>`;
              return renderSubListInner();
            })() : ''}
          </div>
          ${showSubtitle ? renderSubListBlock() : ''}
        </div>`;

      const searchText = [
        item.title, item.title_zh, item.title_en,
        item.subtitle, item.subtitle_zh,
        ...subList.flatMap(s => [s.en, s.zh]),
        item[introField], item[introField + '_zh'],
        item.description, item.descriptionZh,
        item.location, item.location_zh,
        ...(item.guests || []).flatMap(g => [g.name, g.name_zh, g.affiliation, g.affiliation_zh]),
      ].filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');

      // Locations 結構：每筆 {en, zh, country} 一個 row，渲染時 vertical stack（user 契約：往下增加）
      // 新 endpoint shape `item.locations = [{nameZh, nameEn, country}, ...]` 優先；fallback 舊 `item.location / location_zh / flag` 字串包成單筆
      const locationRows = Array.isArray(item.locations) && item.locations.length > 0
        ? item.locations.map(l => ({ en: l?.nameEn || '', zh: l?.nameZh || '', country: l?.country || '' }))
        : ((item.location || item.location_zh || item.flag)
          ? [{ en: item.location || '', zh: item.location_zh || '', country: item.flag || '' }]
          : []);
      // locationEn/Zh：search + 「一行地點顯示」用（venue 單一 / 多城市 ' / ' join 成一行）
      const locationEn = locationRows.map(l => l.en).filter(Boolean).join(' / ');
      const locationZh = locationRows.map(l => l.zh).filter(Boolean).join(' / ');
      // city（conference 摘要列第三欄）：venue(location) 之外的城市/地區，目前只有 conferences 填
      const cityEn = item.city || item.cityEn || '';
      const cityZh = item.city_zh || item.cityZh || '';
      // 標題國旗來源 = guests（人物/單位）的國家，去重 + 轉小寫給 flag-icons（fi-tw…）。
      // 「地點的國家」(item.flag / locations[].country) 暫不納入 — user 2026-06-03：等後台處理 location-country 機制再加進來。
      const countryCodes = [...new Set((item.guests || []).map(g => (g.country || '').toLowerCase().trim()).filter(Boolean))];

      const itemFlags = alwaysExpanded ? 'data-no-accordion' : 'data-pre-reveal';
      // meta-icons inner（alumni + 全部國旗）共用內容：桌面 render 在右上 group、手機另 render 一份在副標下方 in-flow 區塊
      // （user 2026-06-10 #1/#2/#4：手機把國旗移出右上絕對定位群組→ in-flow 才能「在 title+副標之後進場、不位移、share 無 gap、靠左」；
      //  桌面維持原樣＝雙份 render，CSS 依 viewport 顯隱：桌面顯 .list-header-meta-icons、手機顯 .list-header-meta-mobile）
      const _hasAlumni = showAlumniIcon && item.guests?.some(g => g.isAlumni === 'on' || g.isAlumni === true || g.isAlumni);
      const _alumniIcon = _hasAlumni ? `<span class="icon icon-alumni icon-s"></span>` : '';
      // 桌面：單一國旗 + 多國家每 5s 輪播（user 2026-06-10 第3輪：桌面保持 switch 原則，不要全 show）→ bindFlagCycles 吃 data-flag-cycle
      const _flagsDesktop = countryCodes.length ? `<span class="fi fi-${countryCodes[0]}"${countryCodes.length > 1 ? ` data-flag-cycle="${countryCodes.join(',')}"` : ''} style="width:1.5em;height:1em;display:inline-block;"></span>` : '';
      // 手機：全部國旗並排
      const _flagsMobile = countryCodes.map(c => `<span class="fi fi-${c}" style="width:1.5em;height:1em;display:inline-block;"></span>`).join('');
      const _hasMeta = _hasAlumni || countryCodes.length > 0;
      const metaDesktopInner = `${_alumniIcon}${_flagsDesktop}`;
      const metaMobileInner = `${_alumniIcon}${_flagsMobile}`;
      return `
        <div class="list-item" ${itemFlags} data-category="${item.category || ''}" data-media="${mediaJson}" data-search="${searchText}"${item.visitType ? ` data-visit-type="${item.visitType}"` : ''}${item.id ? ` id="item-${item.id}"` : ''}>
          <div class="list-header ${alwaysExpanded ? '' : 'cursor-pointer'} group transition-colors duration-fast flex items-stretch justify-between gap-sm px-[4px] py-md">
            ${titleHtml}
            <div class="flex items-start gap-sm flex-shrink-0 pt-[0.25rem] md:pt-[0.55rem]">
              <!-- 桌面用：alumni + 國旗在右上跟 share/chevron 同列（手機 CSS 隱藏這份的 reveal-wrapper，改顯示下方 .list-header-meta-mobile） -->
              <div class="list-header-meta-icons list-reveal-row flex items-center gap-sm">${metaDesktopInner}</div>
              ${(() => {
                // share btn 跟 chevron 合進同一個 .list-reveal-row wrapper 同步進場，
                // 避免 share btn 沒 reveal class → 在 title yPercent reveal 動畫前就現身（user 反饋
                // 2026-05-27「不要讓 share btn 先渲染」）
                if (alwaysExpanded) return '';
                return `<div class="flex items-start gap-sm flex-shrink-0">
                  <div class="list-reveal-row flex items-center gap-sm">
                    ${showShareBtn ? `<button data-share-btn class="inline-flex items-center self-start">
                      <span class="icon icon-share icon-s"></span>
                    </button>` : ''}
                    <div class="flex-shrink-0 self-start" style="overflow:clip; height:1.5em; width:1.5em;">
                      <div class="flex justify-center items-start w-full h-full">
                        <span class="icon icon-chevron-list icon-s rotate-90 transition-transform duration-300"></span>
                      </div>
                    </div>
                  </div>
                </div>`;
              })()}
            </div>
            ${_hasMeta ? `<!-- 手機用：國旗(+alumni) in-flow 區塊，CSS flex-wrap 後 flex-basis:100% 排到 title row 下一行（在 title+副標之後進場、不位移、靠左、share 無 gap）。桌面 CSS 隱藏 -->
            <div class="list-header-meta-mobile list-reveal-row flex items-center gap-sm">${metaMobileInner}</div>` : ''}
          </div>
          <div class="list-content ${alwaysExpanded ? '' : 'h-0 overflow-hidden'}">
            ${bodyField && item[bodyField] ? `
            <div class="pt-sm pb-lg px-md flex flex-col gap-md">
              <div class="admission-body flex flex-col gap-md">${normalizeBodyHtml(item[bodyField])}</div>
            </div>` : `
            <div class="pt-sm pb-lg px-md grid gap-gutter items-start" style="grid-template-columns: 9.5fr 2.5fr;">
              <div class="flex flex-col gap-md pr-2xl">
                ${showDate && dateDisplay && !dateInHeader && dateFullWidth ? `<div>
                  <p class="text-p2 font-bold">${dateDisplay}</p>
                  ${dateDisplayZh ? `<p class="text-p2 font-bold">${dateDisplayZh}</p>` : ''}
                </div>` : ''}
                ${(((showDate && dateDisplay && !dateInHeader && !dateFullWidth)) || (showLocation && locationRows.length) || (showLocation && (cityEn || cityZh))) ? (() => {
                  // 摘要列 grid：[date 連續時間寬 | venue(location) | city]
                  //   - date col 永遠寬到「連續時間」格式（單日 item 留白同欄寬），venue 起始點對齊
                  //   - venue 一行（多城市 ' / ' join），name 過長走 list-title-marquee
                  //   - city（conference 才填）靠右第三欄；無 city 時維持兩欄不變（不影響其他 section）
                  // 國家由標題國旗表示（來源 = guests）。user 2026-06-03 重設計；2026-06-05 加 city 欄。
                  // dateFullWidth（permanent exhibitions）：date 其實是頻率說明（"Once per semester"）非真實日期，
                  //   已在上方獨立 full-width 渲染（不進 14ch 欄、不 marquee），這裡不再當 date cell。
                  const showDateCell = showDate && dateDisplay && !dateInHeader && !dateFullWidth;
                  const hasCity = showLocation && !!(cityEn || cityZh);
                  const cols = hasCity ? `${dateColMinWidth} 1fr auto` : `${dateColMinWidth} 1fr`;
                  return `<div class="grid items-start gap-x-xs" style="grid-template-columns: ${cols};">
                    ${showDateCell ? `<div class="min-w-0">
                      <div class="list-title-marquee"><p class="text-p2 font-bold">${dateDisplay}</p></div>
                      ${dateDisplayZh ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${dateDisplayZh}</p></div>` : ''}
                    </div>` : '<div></div>'}
                    ${showLocation && (locationEn || locationZh) ? `<div class="min-w-0">
                      ${locationEn ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${locationEn}</p></div>` : ''}
                      ${locationZh ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${locationZh}</p></div>` : ''}
                    </div>` : '<div></div>'}
                    ${hasCity ? `<div class="flex-shrink-0 text-right">
                      ${cityEn ? `<p class="text-p2 font-bold">${cityEn}</p>` : ''}
                      ${cityZh ? `<p class="text-p2 font-bold">${cityZh}</p>` : ''}
                    </div>` : ''}
                  </div>`;
                })() : ''}
                ${buildSessionsHtml(item, dateColMinWidth, { showGuestCountry, showGuestAffiliation })}
                ${item.guests?.length ? `<div class="flex flex-col gap-sm">
                  ${item.guests.map(g => buildGuestHtml(g, { showGuestCountry, showGuestAffiliation })).join('')}
                </div>` : ''}
                ${showDescription && (introEn || introZh) && !(Array.isArray(item.sessions) && item.sessions.length) ? `<div class="overflow-y-auto pr-xl list-scroll" style="max-height: 250px;">
                  ${introEn ? `<p class="text-p2 leading-base">${introEn}</p>` : ''}
                  ${introZh ? `<p class="text-p2 leading-base mt-md">${introZh}</p>` : ''}
                </div>` : ''}
                ${buildAlbumsHtml(item, { unbounded: alwaysExpanded })}
              </div>
              ${showPoster ? buildPosterHtml(item) : ''}
            </div>`}
            ${buildGalleryHtml(item)}
            ${attachmentsField && Array.isArray(item[attachmentsField]) && item[attachmentsField].length ? `
            <div class="list-ref-wrap flex flex-col">
              ${item[attachmentsField].map((a, i) => {
                // 兼容兩種 schema：legacy JSON 用 { url, labelEn, labelZh }；WP schema group 用 { file, titleEn, titleZh }
                const url = a.url || a.file || '#';
                const labelEn = a.labelEn || a.titleEn || `Attachment ${i + 1}`;
                const labelZh = a.labelZh || a.titleZh || `附件 ${i + 1}`;
                // download 屬性指定 filename：取 URL pathname 最後段（sample.pdf）；無 URL 不渲染 download attr
                const filename = url !== '#' ? url.split('/').pop().split('?')[0] : '';
                return `
                <a class="list-ref-btn cursor-pointer w-full grid grid-cols-12 gap-x-md items-start py-sm px-md no-underline" href="${url}"${filename ? ` download="${filename}"` : ''}>
                  <div class="col-span-1 flex justify-start" style="padding-top: 0.25em;">
                    <span class="icon icon-attachment icon-m"></span>
                  </div>
                  <div class="col-span-11 flex flex-col">
                    <p class="text-p2 font-bold">${labelEn}</p>
                    <p class="text-p2 font-bold">${labelZh}</p>
                  </div>
                </a>
              `;}).join('')}
            </div>` : ''}
            ${showReference && references.length ? `
            <div class="list-ref-wrap flex flex-col">
              ${references.map(ref => `
              ${ref.pdfUrl
                ? `<button class="list-ref-btn cursor-pointer border-none w-full grid grid-cols-12 gap-x-md items-start py-sm px-md text-left"
                    data-ref-pdf-url="${ref.pdfUrl}"
                    data-ref-title-en="${(ref.titleEn || '').replace(/"/g, '&quot;')}"
                    data-ref-title-zh="${(ref.titleZh || '').replace(/"/g, '&quot;')}"
                    data-ref-host-section="${hostSection || ''}"
                    data-ref-host-item="${item.id || ''}">`
                : ref.href
                ? `<a class="list-ref-btn cursor-pointer w-full grid grid-cols-12 gap-x-md items-start py-sm px-md no-underline" href="${ref.href}">`
                : `<button class="list-ref-btn cursor-pointer border-none w-full grid grid-cols-12 gap-x-md items-start py-sm px-md text-left"
                    data-ref-section="${ref.section || ''}"
                    data-ref-item="${ref.itemId || ''}">`
              }
                <div class="col-span-1 flex justify-start" style="padding-top: 0.25em;">
                  <span class="icon icon-ref-list icon-s"></span>
                </div>
                <div class="col-span-3 flex flex-col">
                  ${ref.labelEn ? `<p class="text-p2">${ref.labelEn}</p>` : ''}
                  ${ref.labelZh ? `<p class="text-p2">${ref.labelZh}</p>` : ''}
                </div>
                <div class="col-start-5 col-span-8 flex flex-col min-w-0">
                  ${ref.titleEn ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${ref.titleEn}</p></div>` : ''}
                  ${ref.titleZh ? `<div class="list-title-marquee"><p class="text-p2 font-bold">${ref.titleZh}</p></div>` : ''}
                </div>
              ${ref.href && !ref.pdfUrl ? `</a>` : `</button>`}
              `).join('')}
            </div>` : ''}
          </div>
          ${dividerHtml}
        </div>
      `;
    }).join('');

    // 結構：year col 是「組件」，存在才包 grid-12 + 套 col-2/pl-41 gap；不存在則 list 純 flex flush-left
    // pl-[41px] 屬於「年份欄→title 間距」，跟 col-span-1 年份欄共構，不該存在於 standalone list 上
    const yearColHtml = showYearToggle
      ? `<div class="col-span-12 md:col-span-1 md:col-start-1 list-year-toggle cursor-pointer flex items-center gap-sm order-1 py-md pl-xs md:sticky md:self-start md:pb-sm">
          <div class="list-reveal-row flex justify-center items-center w-[1.5em] h-[1.5em] flex-shrink-0"><span class="icon icon-chevron-list icon-s transition-all duration-fast rotate-90"></span></div>
          <h5 class="list-reveal-row">${yearGroup.year}</h5>
        </div>`
      : `<div class="col-span-12 md:col-span-1 md:col-start-1 flex items-center order-1 py-md pl-xs">
          <h5 class="list-reveal-row">${yearGroup.year}</h5>
        </div>`;

    const groupHtml = hideYearHeader
      ? `<div class="list-year-items flex flex-col">${itemsHtml}</div>`
      : `<div class="list-year-group grid-12 items-start">
          ${yearColHtml}
          <div class="col-span-12 md:col-span-11 md:col-start-2 list-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]">
            ${itemsHtml}
          </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', `
      ${groupHtml}
      ${!isLast ? '<div class="activities-separator list-reveal-row border-b-4 border-black" style="height:4px"></div>' : ''}
    `);
  });

  // ref btn 綁定統一交給 bindInteractions（line 576）— 此處不再重複綁，否則同 btn 兩個 listener
  // dispatch 兩次 sccd:open-pdf → openModal 跑兩次 → enterLightboxMode openCount=2，close 後卡 1 不 reset

  // sticky top（year toggle 與 list-header 的 sticky top 緊接在 filter bar 下方）
  // --list-header-sticky-top 由 lists.css `.list-header` sticky 規則讀取，預設 200（admission 用）
  // 用 ResizeObserver 跟著 filter-bar 高度變化即時同步：bar-hidden 收起 search-inner 時 filter-bar 縮 ~80px，
  // 不同步會讓 sticky title 跟 filter-bar 底部之間出現透視縫，捲動內容穿過
  if (window.innerWidth >= 768) {
    const filterBar = /** @type {HTMLElement | null} */ (panelSelector
      ? document.querySelector(`${panelSelector} .activities-filter-bar`)
      : container.closest('.activities-panel')?.querySelector('.activities-filter-bar'));
    const updateStickyTop = () => {
      // 扣除 1px 讓它與 filter bar 稍微重疊，避免因瀏覽器 Sub-pixel 渲染造成 1px 透視縫
      const top = filterBar ? 200 + filterBar.offsetHeight - 1 : 200;
      container.style.setProperty('--list-header-sticky-top', top + 'px');
      if (showYearToggle) {
        container.querySelectorAll('.list-year-toggle').forEach((/** @type {any} */ el) => { el.style.top = top + 'px'; });
      }
    };
    updateStickyTop();
    if (filterBar && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(updateStickyTop).observe(filterBar);
    }
  }

  bindFlagCycles(container);
  return bindInteractions(container, { autoReveal });
}

// ── Flag cycle: 多 country code 每 5s 切換 fi-XX class ──────────────────
// 對 `[data-flag-cycle="tw,jp,kr"]` 的 <span> 每 5s 切到下一個 country code
// 同個 container 反覆 init 安全（重綁前先 clear 舊 interval id）
const _FLAG_CYCLE_INTERVAL_MS = 5000;
function bindFlagCycles(container) {
  if (!container) return;
  const flags = container.querySelectorAll('[data-flag-cycle]');
  flags.forEach(el => {
    if (el._sccdFlagCycleId) {
      clearInterval(el._sccdFlagCycleId);
      el._sccdFlagCycleId = null;
    }
    const codes = (el.dataset.flagCycle || '').split(',').map(s => s.trim()).filter(Boolean);
    if (codes.length < 2) return;
    let idx = 0;
    const intervalId = setInterval(() => {
      idx = (idx + 1) % codes.length;
      // 移掉所有 fi-XX class，加當前
      [...el.classList].filter(c => c.startsWith('fi-')).forEach(c => el.classList.remove(c));
      el.classList.add('fi-' + codes[idx]);
    }, _FLAG_CYCLE_INTERVAL_MS);
    el._sccdFlagCycleId = intervalId;
    registerPageCleanup(() => {
      clearInterval(intervalId);
      el._sccdFlagCycleId = null;
    });
  });
}

// ── Workshop / Students Present / Summer Camp ─────────────────────────────────

export async function loadWorkshopsInto(jsonFile, containerId = null, options = {}) {
  // containerId 為 null 時 fallback 到舊頁面容器（非 activities 分頁用）
  const id = containerId || (() => {
    const el = document.querySelector('.bg-white .site-container');
    if (el && !el.id) el.id = '__ws_fallback__';
    return el?.id || null;
  })();
  if (!id) return;
  // 自動推 endpoint：'/data/workshops.json' → 'activities-workshop'
  //                  '/data/students-present.json' → 'activities-students-present'
  const epMap = {
    '/data/workshops.json': 'activities-workshop',
    '/data/students-present.json': 'activities-students-present',
  };
  const endpoint = options.endpoint || epMap[jsonFile];
  const data = endpoint ? await fetchActEndpointOrFallback(endpoint, jsonFile) : undefined;
  return loadListInto(id, jsonFile, {
    showSubtitle: true,
    marqueeTitle: true,
    introField: 'intro',
    showAlumniIcon: false,
    ...(data ? { data } : {}),
    ...options,
  });
}

export async function loadSummerCampInto(containerId = null, options = {}) {
  const id = containerId || (() => {
    const el = document.querySelector('.bg-white .site-container');
    if (el && !el.id) el.id = '__sc_fallback__';
    return el?.id || null;
  })();
  if (!id) return;
  // Directus admission_summer_camp 為主 + 本地 fallback（轉成 year-grouped shape，見 summer-camp-source.js）
  const data = await loadSummerCamp();
  return loadListInto(id, '/data/summer-camp.json', {
    showYearToggle: false,
    // 後台海報/圖片暫未上傳（媒體導向 list 預設會把無 media 的項目濾掉）→ allowNoMedia 讓營隊
    // 即使沒海報也顯示（title/副標/日期/地點）；之後在 Directus 上傳 poster/images 會自動帶出。
    allowNoMedia: true,
    showSubtitle: true,   // 營隊副標（subtitleEn/Zh，如「全國高中生設計體驗營」）顯示在標題下，有才顯示
    data,
    ...options,
  });
}

// ── General Activities / Lectures / Industry wrappers ─────────────────────────

const _panelSelectorMap = {
  'exhibitions-list-special':   '#panel-exhibitions',
  'exhibitions-list-permanent': '#panel-exhibitions',
  'lectures-list':              '#panel-lectures',
  'industry-list':              '#panel-industry',
  'visits-list-outbound':       '#panel-visits',
  'visits-list-inbound':        '#panel-visits',
  'competitions-list':          '#panel-competitions',
  'conferences-list':           '#panel-conferences',
  'students-present-list':      '#panel-students-present',
};

// (url + categoryFilter) → host section（給 PDF cross-ref 用，dispatch 時排除自己）
// general-activities.json 4 個 category 共用同檔，必須配 categoryFilter / visitTypeFilter 區分
function deriveHostSection(url, categoryFilter, visitTypeFilter) {
  const urlMap = {
    '/data/workshops.json':              'workshop',
    '/data/industry.json':               'industry',
    '/data/lectures.json':               'lectures',
    '/data/students-present.json':       'students-present',
    '/data/summer-camp.json':            'summer-camp',
    '/data/permanent-exhibitions.json':  'exhibitions',
  };
  if (urlMap[url]) return urlMap[url];
  if (url === '/data/general-activities.json') {
    if (categoryFilter) return categoryFilter; // exhibitions / competitions / conferences
    if (visitTypeFilter) return 'visits';
  }
  return null;
}

// 共用 fetch wrapper：讀本地 JSON（WP-headless 邏輯已移除 2026-06-05）。
// 第一參數 endpoint 已不使用、保留只為不動各 call site；之後此頁 flip 接 Directus 時，
// 改成 Directus 為主 + 本地 JSON fallback（同 legal-data-loader 的 try-CMS / catch-local pattern）。
async function fetchActEndpointOrFallback(endpoint, fallbackUrl) {
  return fetch(sitePath(fallbackUrl)).then(r => r.json());
}

export async function loadGeneralActivitiesInto(containerId, categoryFilter = null, url = '/data/general-activities.json', options = {}) {
  const isIndustry = containerId === 'industry-list';
  const isLectures = containerId === 'lectures-list';
  // categoryFilter (competitions / conferences) → 對應 endpoint
  // endpoint 拆 CPT 後 endpoint 已 filter，前端 categoryFilter 變 noop（保留兼容性）
  const catEpMap = {
    'competitions': 'activities-competition',
    'conferences': 'activities-conference',
  };
  const endpoint = options.endpoint || (categoryFilter ? catEpMap[categoryFilter] : null);
  const data = (endpoint && !options.data) ? await fetchActEndpointOrFallback(endpoint, url) : null;
  return loadListInto(containerId, url, {
    categoryFilter,
    // competitions / conferences 是純文字活動（標題＋日期＋描述，無海報/圖片），放行無媒體項目才不會被濾成空清單
    allowNoMedia:         categoryFilter === 'competitions' || categoryFilter === 'conferences',
    showAlumniIcon:       true,
    showDate:             !isIndustry,
    showDescription:      !isLectures && !isIndustry,
    showLocation:         !isIndustry,
    showPoster:           !isIndustry,
    showReference:        true,
    showSubtitle:         isIndustry || isLectures,
    subtitleFromGuests:   isLectures,
    showGuestAffiliation: !isIndustry,
    showGuestCountry:     !isIndustry,
    panelSelector:        _panelSelectorMap[containerId] || '#panel-exhibitions',
    scrollTrigger:        true,
    ...(data ? { data } : {}),
    ...options,
  });
}

export async function loadLecturesInto(containerId, options = {}) {
  const data = await fetchActEndpointOrFallback('activities-lecture', '/data/lectures.json');
  return loadGeneralActivitiesInto(containerId, null, '/data/lectures.json', { ...options, data });
}

export async function loadIndustryInto(containerId, options = {}) {
  const data = await fetchActEndpointOrFallback('activities-industry', '/data/industry.json');
  return loadGeneralActivitiesInto(containerId, null, '/data/industry.json', { ...options, data });
}

// 分別載入特設 / 常設到各自的 container
export async function loadExhibitionsInto(options = {}) {
  const specialData = await fetchActEndpointOrFallback('activities-exhibition-special', '/data/general-activities.json');
  const fns = await Promise.all([
    loadListInto('exhibitions-list-special', '/data/general-activities.json', {
      categoryFilter: 'exhibitions',
      visitTypeFilter: 'special', visitTypeField: 'exhibitionType',
      panelSelector: '#panel-exhibitions', scrollTrigger: true,
      data: specialData,
      ...options,
    }),
    // 常設展演 endpoint user 還沒做（晚點再給），保留舊 JSON 路徑
    // dateFullWidth：permanent 的 date 是頻率說明（"Once per semester / 每學期舉辦一次"）非真實日期，
    //   要 full-width 顯示、不擠進 14ch date 欄、不 marquee（user 2026-06-05）。
    loadListInto('exhibitions-list-permanent', '/data/permanent-exhibitions.json', {
      hideYearHeader: true, dateFullWidth: true,
      panelSelector: '#panel-exhibitions', scrollTrigger: true,
      ...options,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}

// 分別載入 outbound / inbound 到各自的 container
export async function loadVisitsInto(options = {}) {
  const [outboundData, inboundData] = await Promise.all([
    fetchActEndpointOrFallback('activities-visit-outbound', '/data/general-activities.json'),
    fetchActEndpointOrFallback('activities-visit-inbound', '/data/general-activities.json'),
  ]);
  const fns = await Promise.all([
    loadListInto('visits-list-outbound', '/data/general-activities.json', {
      categoryFilter: 'visits', visitTypeFilter: 'outbound',
      panelSelector: '#panel-visits', scrollTrigger: true,
      data: outboundData,
      ...options,
    }),
    loadListInto('visits-list-inbound', '/data/general-activities.json', {
      categoryFilter: 'visits', visitTypeFilter: 'inbound',
      panelSelector: '#panel-visits', scrollTrigger: true,
      data: inboundData,
      ...options,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}
