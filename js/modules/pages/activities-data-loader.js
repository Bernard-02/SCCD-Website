/**
 * Activities Data Loader Module
 * 負責讀取 JSON 資料並渲染 Activities 相關頁面的 HTML
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { isHlsUrl, isDirectVideoUrl, videoMediaFromUrl, hydrateHlsThumbs } from '../ui/video-player.js';
import { setupClipReveal } from '../ui/scroll-animate.js';
import { hideRows, revealRows } from '../ui/list-row-reveal.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { makeActivatable } from '../ui/a11y.js';
import { ensureFlagIconsCss } from '../ui/ensure-flag-icons.js';
import { countryName } from '../../data/country-names.js';
import { DUR, EASE } from '../ui/motion.js';
import { refreshStickyPinObservers, isAccordionBusy } from '../accordions/list-accordion.js';
import { buildSyncedMarqueeTimeline } from '../ui/marquee-overflow.js';
import { loadSummerCamp } from './summer-camp-source.js';
import { loadActivityCollection, loadPermanentExhibitions } from './activities-source.js';
// '/data/x.json' 字串同時是 fetch URL 與 map key / 比對識別字（deriveHostSection / _panelSelectorMap 等），
// 識別字保持原樣，只在真正 fetch 的點包 sitePath()（子路徑部署時換算成站台根絕對 URL）
import { sitePath } from '../ui/site-base.js';

// ── Reference label lookup ────────────────────────────────────────────────────
// P1-5：ref title 由 activities-source remapRef 的 M2A deep-fetch 直接帶（Directus 單一來源）；本地 JSON id 是人工碼、
// Directus 是 UUID → 舊「回查本地補 title」永遠 miss、純浪費，已移除。SECTION_LABELS 只補 section 名（label）。

export const SECTION_LABELS = {
  workshop:           { en: 'Workshop',                      zh: '工作坊' },
  industry:           { en: 'Industry Partnerships',         zh: '產學合作' },
  lectures:           { en: 'Lectures',                      zh: '講座' },
  'students-present': { en: 'Students Present',              zh: '學生自主' },
  'summer-camp':      { en: 'Summer Camp',                   zh: '暑期體驗營' },
  exhibitions:        { en: 'Exhibitions',                   zh: '展演' },
  competitions:       { en: 'Competitions',                  zh: '競賽' },
  conferences:        { en: 'Forums',                        zh: '論壇' },
  visits:             { en: 'Visits',                        zh: '參訪' },
};

// getAwardRecords / findAwardById：library press/files 的 references 反查得獎紀錄用（library-panels.js）。
// 2026-06-22 起 activities/admission 不再 ref award（改為 award → library 單向），故 resolveRef 已移除 award 分支。
let _awardRecordsPromise = null;
export function getAwardRecords() {
  if (!_awardRecordsPromise) {
    _awardRecordsPromise = fetch(sitePath('data/records.json'))
      .then(r => r.json())
      .then(d => Array.isArray(d) ? d : d.records)
      .catch(() => null);
  }
  return _awardRecordsPromise;
}
export function findAwardById(records, id) {
  for (const yg of records || []) {
    for (const it of yg.items || []) {
      if (it.id === id) return it;
    }
  }
  return null;
}

// P1-5：title 由 activities-source remapRef 的 M2A deep-fetch 直接帶（單語就顯示單語，資料導向）；此處只補 label（section 名）。
function resolveRef(ref) {
  if (!ref || !ref.section || !ref.itemId) return;
  const labelMap = SECTION_LABELS[ref.section];
  if (labelMap) {
    if (!ref.labelEn) ref.labelEn = labelMap.en;
    if (!ref.labelZh) ref.labelZh = labelMap.zh;
  }
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
    // press ref：有 media → 原地開 activities lightbox（同 library press 點擊，不跳 library）。
    const pressMediaRaw = btn.dataset.refPressMedia;
    if (pressMediaRaw) {
      let media = [];
      try { media = JSON.parse(pressMediaRaw); } catch (_) { /* 壞 JSON → 不開 */ }
      if (media.length) {
        const title = { en: btn.dataset.refTitleEn || '', zh: btn.dataset.refTitleZh || '' };
        const color = _REF_ACCENT_COLORS[Math.floor(Math.random() * _REF_ACCENT_COLORS.length)];
        openLightbox(media, 0, { title, color });
      }
      return;
    }
    const section = btn.dataset.refSection;
    const itemId  = btn.dataset.refItem;
    // 只有 section/itemId 跳轉 btn 才導航。award/press href 連結（→ library）走原生 <a>，沒 section；
    // 沒 section 仍呼叫會 navigateToItem(undefined) → switchToSection(undefined)，其 exit 動畫被換頁
    // cleanup 殺掉 onComplete 沒跑 → switching 永卡 true，回到本頁後所有 panel 載入被擋（內容/hero 空白）。
    if (section && typeof window.__sccdNavigateToItem === 'function') {
      window.__sccdNavigateToItem(section, itemId || null);
    }
  });
}

// 六輪 zebra generation 戳記（本檔 reveal-IO 用；值加 'a' 前綴＝與 admission-data-loader 的 'd' 前綴跨檔不撞值：
//   activities 退場走 admission 的 playAdmissionPanelExit，會以 'd' 代蓋掉這裡的 'a' 代 → 比對必不符＝正確作廢殘留 clrZebra）。
let _zbGen = 0;

// Helper: 為 list-item 內的海報及 gallery 圖片加上 hover 旋轉歸 0 效果
// 對齊 library files/album 模式：random rotation 1~3°（兩邊隨機 sign），hover 歸 0
export function bindMediaHover(container) {
  // scope 可為容器（掃內含 .list-item）或單一 .list-item（分幀逐 item 綁時傳自己）
  const _items = container.matches?.('.list-item') ? [container] : container.querySelectorAll('.list-item');
  _items.forEach(workshopItem => {
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
      // 六輪 2-B：純寫、零 computed 讀（原 gsap.set 逐圖冷觸 Td）；hover 的 gsap.to 能從此 CSS rotate 接手。
      // 七輪 1-C 組合契約：poster 的 inline transform 同時承載 pending translate（buildPosterHtml 烙）＋此 rotate；
      //   只動 rotate 那半、保留對方的 translate（別整串覆蓋，否則揭露前 poster 會瞬跳回原位露出）。
      const keep = (img.style.transform.match(/translate\([^)]*\)/) || [''])[0];
      img.style.transform = `${keep} rotate(${initDeg}deg)`.trim();
      wrapper.addEventListener('mouseenter', () => {
        if (img.dataset.pendingReveal) return;   // 七輪 1-C：揭露前不讓 gsap 碰 rotation（會把 mid 態定格再被清＝閃跳）
        gsap.to(img, { rotation: 0, duration: DUR.fast, ease: EASE.enterSoft });
      });
      wrapper.addEventListener('mouseleave', () => {
        if (img.dataset.pendingReveal) return;
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
// CMS 富文本編輯者不會逐段標 lang → 自動幫「以中文為主」的區塊補 lang="zh-Hant"，
// 讓中文段落吃 ZH 獨立行距（--line-height-zh-*；p 的規則在 lists.css .admission-body p[lang]，
// 標題/li 走 typography.css 的 hN[lang]／[lang] fallback）。
// ⚠️「含一個中文字」不夠：donate 英文清單嵌中文專有名詞（"院系務發展基金"/"指定用途"）會被誤標成 ZH、
//    整行英文吃到 1.4 ZH 行距而比兄弟英文行鬆。改判「中文字數 > 英文字母數」才算中文區塊。
const CJK_RE = /[㐀-鿿]/;
function isMostlyCjk(text) {
  const cjk = (text.match(/[㐀-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk > latin;
}
function tagCjkBlocks(html) {
  if (typeof document === 'undefined' || !CJK_RE.test(html)) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote').forEach(el => {
    if (!el.hasAttribute('lang') && isMostlyCjk(el.textContent)) el.setAttribute('lang', 'zh-Hant');
  });
  return tpl.innerHTML;
}

export function normalizeBodyHtml(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  let html;
  if (/<(p|br|div|li|h[1-6]|ul|ol)\b/i.test(raw)) {
    html = raw; // 已有 block tag → 原樣
  } else {
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const paragraphs = escaped.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
    html = paragraphs.map(p => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
  }
  return tagCjkBlocks(html);
}
export function buildItemMedia(item) {
  const videos = getAllVideos(item);
  const images = normalizeMediaArr(item.images, 'image');
  const all = [
    ...(isValidUrl(item.poster) ? [{ type: 'image', src: item.poster.trim(), thumb: item.poster.trim() }] : []),
    ...videos.filter(isValidUrl).map(url => videoMediaFromUrl(url)).filter(Boolean),
    ...images.filter(isValidUrl).map(src => ({ type: 'image', src: src.trim(), thumb: src.trim() })),
  ];
  return all.filter(m => m.src);
}

// Albums list HTML（每筆 = 一個 album，各自有獨立 media，點擊開 lightbox）
// 過濾掉沒有 images 的 album：user 反映「list 裡有些 album 沒圖片卻仍能切換過去」
// 沒圖片就不該佔 list 位置（即使有 date/location 也不渲染）
// unbounded=true 時拿掉內層 max-height + scroll（permanent exhibitions 預設展開，user 希望整個 album list 直接攤開不需內層 scroll）
export function buildAlbumsHtml(item, { unbounded = false } = {}) {
  if (!item.albums?.length) return '';
  // images 內任何 null/空字串/whitespace 先剔除。無圖 album 仍渲染其 metadata（year/date/location）——
  //   場次是事實紀錄（如常設展每學期一場），「有什麼渲染什麼」；只是無圖時不出縮圖列、整列不可點（不開空 lightbox）。
  //   完全沒 metadata 也沒圖的 album 才剔除（避免空白列）。
  const albums = item.albums
    .map(a => ({ ...a, images: (a.images || []).filter(isValidUrl).map(s => s.trim()) }))
    .filter(a => a.images.length > 0 || a.year || a.date || a.location || a.location_zh);
  if (albums.length === 0) return '';

  const itemsHtml = albums.map((album) => {
    const mediaJson = JSON.stringify(album.images.map(src => ({ type: 'image', src, thumb: src }))).replace(/"/g, '&quot;');
    // Lightbox title 用「該 album 本身」(date + location)，不是父 list-item 標題
    const albumTitleEn = [album.date, album.location].filter(Boolean).join('  ');
    const albumTitleZh = album.location_zh || '';
    const albumTitleJson = JSON.stringify({ en: albumTitleEn, zh: albumTitleZh }).replace(/"/g, '&quot;');
    // 每張縮圖獨立 button + data-album-index，click 開 lightbox 對應 index
    // onerror 自摧毀單張 thumb：broken 檔不留 broken icon（對齊 buildPosterHtml）
    const thumbsHtml = album.images.map((src, i) => `
      <button type="button" class="album-thumb-btn flex-shrink-0 overflow-hidden cursor-pointer" data-album-index="${i}" style="height: 72px;">
        <img src="${src}" alt="" decoding="async" class="h-full w-auto block" onerror="this.parentElement.style.display='none'">
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
    // year : date : location = 1 : 2 : 10。每個 album 各自獨立 grid，用共用 template 跨列對齊。
    return `
      <div class="album-thumb-item flex flex-col gap-sm py-sm mr-xl"
           data-album-media="${mediaJson}"
           data-album-title="${albumTitleJson}">
        <div class="album-sticky-cell grid grid-cols-[1fr_2fr_10fr] items-start gap-x-md pb-xs">
          <div class="flex-shrink-0">${album.year ? `<p class="text-s font-bold">${album.year}</p>` : ''}</div>
          <div class="flex-shrink-0">${album.date ? `<p class="text-s font-bold">${album.date}</p>` : ''}</div>
          <div class="min-w-0">
            ${album.location ? `<p class="text-s font-bold">${album.location}</p>` : ''}
            ${album.location_zh ? `<p class="text-s font-bold">${album.location_zh}</p>` : ''}
          </div>
        </div>
        <!-- album-gallery row：2-col grid [隱藏 year spacer（撐同 sticky row 的 year 欄寬） | album-gallery]，
             兩 row 各自獨立 grid，靠「同內容 year」讓 col1 等寬 → col2 左緣＝sticky row 的 date 左緣，thumbnail 對齊日期左緣。
             chevron 改 absolute 疊在 track 左右（不佔位、不把 thumbnail 往右推），thumbs 恆貼 date 左緣（user 2026-07-14）。
             無圖 album 不渲染此列（只留上方 metadata），避免空 gallery + 不可點列。 -->
        ${album.images.length ? `<div class="grid grid-cols-[1fr_12fr] items-center gap-x-md">
          <div aria-hidden="true"></div>
          <div class="album-gallery relative flex items-center min-w-0">
            <button type="button" class="album-prev invisible absolute left-0 top-1/2 -translate-y-1/2 z-10 w-[32px] h-[32px] flex items-center justify-start text-s hover:opacity-60 transition-opacity">
              <span class="icon icon-chevron-list icon-s"></span>
            </button>
            <div class="album-track flex-1 min-w-0" style="overflow-x: clip; overflow-clip-margin: 0.5rem; overflow-y: visible; padding: 8px 0;">
              <div class="album-track-inner flex items-center gap-sm" style="transition: transform 0.3s ease, opacity 0.3s ease;">
                ${thumbsHtml}
              </div>
            </div>
            <button type="button" class="album-next invisible absolute right-0 top-1/2 -translate-y-1/2 z-10 w-[32px] h-[32px] flex items-center justify-end text-s hover:opacity-60 transition-opacity">
              <span class="icon icon-chevron-list icon-s rotate-180"></span>
            </button>
          </div>
        </div>` : ''}
      </div>
    `;
  }).join('');

  return unbounded
    ? `<div class="item-albums">${itemsHtml}</div>`
    : `<div class="item-albums overflow-y-auto list-scroll pb-sm" style="max-height: 252px;">${itemsHtml}</div>`;
}

// 海報區塊 HTML
// poster 只渲染後台實際填的 item.poster；沒填就不渲染 poster 區（user 2026-08-28 改：不再 fallback 用 images[0]，
// 避免右側多出一張 poster、且跟 gallery 第一張重複）。相簿仍照常從 gallery 出。item.poster 恆對應 mediaList[0]（buildItemMedia）。
// 七輪：poster「載好才滑入」用——img 出生自帶隨機方向 translate（純寫 HTML string、零 JS touch，同四輪哲學）；
//   揭露由 bindInteractions 的 revealPoster 接（圖 ready 才 clip-reveal 進場，對齊 library COVER_SLIDE_DIRS 語彙）。
const POSTER_SLIDE_DIRS = ['0%, 110%', '0%, -110%', '110%, 0%', '-110%, 0%'];

// onerror 自摧毀 wrapper：URL 對但圖檔 404 / 跨域擋下時不會留 broken icon
export function buildPosterHtml(item) {
  const src = item.poster || '';
  if (!src) return '';
  // 有原圖尺寸 → wrapper 設 aspect-ratio 預留高度（載入前就佔位、免 layout shift），並解鎖 poster loading="lazy"
  //（原本不能 lazy＝0 面積永不觸發載入，見 memory reference_activities_switch_ro_recalc_storm ①）。拿不到尺寸則維持 eager + load 補償動畫。
  const ar = (item.posterW && item.posterH) ? ` style="aspect-ratio: ${item.posterW}/${item.posterH}"` : '';
  const lazy = ar ? ' loading="lazy"' : '';
  const dir = POSTER_SLIDE_DIRS[(Math.random() * 4) | 0];   // 七輪：pending 態隨機四向，載好才滑入
  return `
    <div class="overflow-hidden cursor-pointer" data-lightbox-open data-lightbox-index="0"${ar}>
      <img src="${src}"${lazy} alt="${item.title} poster" decoding="async" class="poster-img w-full block object-cover" data-pending-reveal="1" style="transform: translate(${dir})" onerror="this.closest('[data-lightbox-open]').style.display='none'">
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
  // 不蓋整片半透明黑遮罩（user 2026-06-28：遮罩沒跟卡片旋轉、看起來分兩層）→ 改 play 鍵實心白 + drop-shadow，亮縮圖上仍可見
  const playOverlay = `<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.55));">
            <polygon points="0,0 20,12 0,24" fill="white"/>
          </svg>
        </div>`;
  const galleryItems = [
    ...videos.map((url, vi) => {
      const lbIndex = posterOffset + vi;
      if (isHlsUrl(url) || isDirectVideoUrl(url)) {
        // 自架影片（m3u8 / 直連 mp4）無現成縮圖：先黑 tile 佔位，bindInteractions 的 hydrateHlsThumbs 截幀後補上
        return `<div class="h-full flex-shrink-0 aspect-video relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}" style="background: #111;">
        <img data-hls-thumb="${url}" alt="" class="w-full h-full object-cover block" style="display:none;">
        ${playOverlay}
      </div>`;
      }
      const videoId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      if (!videoId) return '';
      return `<div class="h-full flex-shrink-0 aspect-video relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" decoding="async" class="w-full h-full object-cover block">
        ${playOverlay}
      </div>`;
    }),
    // onerror 自摧毀 wrapper：URL 對但檔 404 / 跨域擋下時不會留 broken icon（對齊 buildPosterHtml）
    ...images.map((src, ii) => {
      const lbIndex = posterOffset + videos.length + ii;
      return `<div class="h-full flex-shrink-0 relative cursor-pointer" data-lightbox-open data-lightbox-index="${lbIndex}">
        <img src="${src}" alt="" decoding="async" class="h-full w-auto block" onerror="this.closest('[data-lightbox-open]').style.display='none'">
      </div>`;
    }),
  ].filter(Boolean);

  if (galleryItems.length === 0) return '';
  return `
    <div class="gallery-section px-sm pb-lg flex items-center">
      <button class="gallery-prev flex-shrink-0 w-[32px] h-[32px] flex items-center justify-start text-s hover:opacity-60 transition-opacity" style="display:none">
        <span class="icon icon-chevron-list icon-s"></span>
      </button>
      <!-- min-w-0：flex item 的 min-width:auto 會被內容撐開（手機 327px 容器內 track 被撐到 ~357px），
           把 gallery-next 推出 viewport 右側「右 chevron 消失」；album-track 已有同款 fix -->
      <div class="gallery-track flex-1 min-w-0" style="height: 120px; overflow-x: clip; overflow-clip-margin: 0.5rem; overflow-y: visible;">
        <div class="gallery-inner flex gap-md h-full" style="transition: transform 0.3s ease, opacity 0.3s ease;">
          ${galleryItems.join('')}
        </div>
      </div>
      <button class="gallery-next flex-shrink-0 w-[32px] h-[32px] flex items-center justify-end text-s hover:opacity-60 transition-opacity" style="display:none">
        <span class="icon icon-chevron-list icon-s rotate-180"></span>
      </button>
    </div>
  `;
}

// 人名 + AKA 別名顯示：AAA（XX）。ZH 全形括號、EN 半形括號帶前導空格；
// 別名該語為空就用另一語（單語別名兩行都顯示，如 LeHo），兩語皆空則無括號。
function formatNameWithAka(name, akaSame, akaOther, zh) {
  if (!name) return '';
  const aka = akaSame || akaOther;
  if (!aka) return name;
  return zh ? `${name}（${aka}）` : `${name} (${aka})`;
}

// 單一講者/來賓 block（name 粗體 + 右側國家；下排 org/affiliation + 右側國家）
// item-level guests 與 conference sessions[].guests 共用同一份渲染。
// 兩種 shape 都接：新(endpoint) nameEn/nameZh/akaEn/akaZh/orgEn/orgZh/country/isAlumni
//                舊(data/X.json) name/name_zh/affiliation/affiliation_zh/country/country_zh/isAlumni
export function buildGuestHtml(g, { showGuestCountry = true, showGuestAffiliation = true } = {}) {
  const gNameEn = g.nameEn || g.name || '';
  const gNameZh = g.nameZh || g.name_zh || '';
  const gAkaEn = g.akaEn || '';
  const gAkaZh = g.akaZh || '';
  const gCountry = g.country || ''; // ISO code（fallback JSON 大寫 / Directus 小寫）；舊 shape 才是顯示字串
  const gOrgCountry = g.orgCountry || ''; // 單位自己的國家（Directus 獨立欄，跟 guest 個人國家分開填）
  const gOrgEn = g.orgEn || g.affiliation || '';
  const gOrgZh = g.orgZh || g.affiliation_zh || '';
  const gIsAlumni = g.isAlumni === 'on' || g.isAlumni === true || g.isAlumni;
  // user 2026-06-10 #2：title 與「國家」用 grid 2 欄分開對齊（國家欄固定寬 → 所有 row 的國家落在同一起始 x）；
  //   國家包進 .list-title-marquee，太長超出欄寬就 marquee（不換行不擠壓 title 欄）。
  // code 各自轉大寫碼（同 faculty-slide-in 慣例）；沒填就不渲染（user 2026-08-03：單位沒填國家不該自動顯示）。
  const countryCell = (cls, code, zhFallback) => {
    if (!code) return '';
    const upper = code.toUpperCase();
    const zhName = countryName(code, 'zh');
    const zh = zhName !== upper ? zhName : (zhFallback || '');
    return `<div class="list-title-marquee"><p class="${cls}">${upper}${zh ? ` ${zh}` : ''}</p></div>`;
  };
  return `<div class="flex flex-col" style="gap: 0.25rem;">
    <div class="grid gap-md items-start guest-row-grid">
      <div class="guest-name-cell min-w-0 flex items-start justify-between gap-sm">
        <div class="min-w-0">
          ${gNameEn ? `<p class="text-s font-bold${gNameZh ? ' mb-en-zh-s' : ''}">${formatNameWithAka(gNameEn, gAkaEn, gAkaZh, false)}</p>` : ''}
          ${gNameZh ? `<p class="text-s font-bold" lang="zh-Hant">${formatNameWithAka(gNameZh, gAkaZh, gAkaEn, true)}</p>` : ''}
        </div>
        ${gIsAlumni ? `<p class="text-s flex-shrink-0">Alumni 系友</p>` : ''}
      </div>
      ${showGuestCountry ? `<div class="min-w-0">${countryCell('text-s', gCountry, g.country_zh)}</div>` : ''}
    </div>
    ${showGuestAffiliation && gOrgEn ? `<div class="grid gap-md items-start guest-row-grid">
      <div class="text-xs min-w-0">${gOrgEn}${gOrgZh ? `<div class="text-xs" lang="zh-Hant" style="margin-top: var(--space-en-zh-xs)">${gOrgZh}</div>` : ''}</div>
      ${showGuestCountry ? countryCell('text-xs', gOrgCountry) : ''}
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
    // alumni icon 不在場次 title 旁，統一在卡 header（對齊 workshop，見 loadListInto 的 _hasAlumni）
    const sDescEn = s.descriptionEn || s.desEn || '';
    const sDescZh = s.descriptionZh || s.desZh || '';
    const guestsHtml = (Array.isArray(s.guests) ? s.guests : [])
      .map(g => buildGuestHtml(g, { showGuestCountry, showGuestAffiliation }))
      .join('');
    // 說明文字（user 2026-06-05 #3）：移出內容欄，放在 date|內容 grid 之下、整段「從日期左緣」全寬對齊。
    // date 欄（user #4）：包進 list-title-marquee，跨年過長時自動 marquee（同其他 date 欄）。
    return `<div class="flex flex-col gap-sm">
      <div class="grid items-start gap-x-xs" style="grid-template-columns: ${dateColMinWidth} 1fr;">
        <div class="min-w-0">${sDate ? `<div class="list-title-marquee"><p class="text-s font-bold">${sDate}</p></div>` : ''}</div>
        <div class="flex flex-col gap-sm min-w-0">
          ${(sTitleEn || sTitleZh) ? `<div>
            ${sTitleEn ? `<p class="text-s font-bold mb-en-zh-s">${sTitleEn}</p>` : ''}
            ${sTitleZh ? `<p class="text-s font-bold" lang="zh-Hant">${sTitleZh}</p>` : ''}
          </div>` : ''}
          ${guestsHtml ? `<div class="flex flex-col gap-sm">${guestsHtml}</div>` : ''}
        </div>
      </div>
      ${(sDescEn || sDescZh) ? `<div>
        ${sDescEn ? `<p class="text-s leading-base${sDescZh ? ' mb-en-zh-body' : ''}">${sDescEn}</p>` : ''}
        ${sDescZh ? `<p class="text-s leading-base" lang="zh-Hant">${sDescZh}</p>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="flex flex-col gap-md">${rows}</div>`;
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

  // Share URL：跟外層 list-item 的 [data-share-btn] 同一份（複製 share-modal.js computeShareUrl 的 section+item 規則）
  const itemId = listItem?.id?.replace(/^item-/, '');
  const section = elem.closest('[id^="panel-"]')?.id?.replace(/^panel-/, '');
  const shareUrl = (section && itemId) ? `${location.href.split('?')[0]}?section=${section}&item=${itemId}` : '';

  return { title, color, shareUrl };
}

// 縮圖橫向 strip（album / gallery）：w-auto 縮圖 decode 後才撐寬，逐張載入會把右側縮圖往右推＝展開時「往右移」
// （user 2026-08-28）。先藏整條 strip、全部圖 decode 完才一次淡入 → 保留原比例又零可見位移（reflow 藏在隱藏態）；
// 已 complete（cached）全跳過、不多閃一幀；onReveal 淡入後補跑（updateChevrons：載完前就展開時 scrollWidth 偏小、chevron 會漏顯）。
// ⚠️ 只認「有 src」的 img：gallery 的 HLS 影片 tile 佔位 img 無 src（complete=true naturalWidth=0、之後才 hydrate），
//    納入會永遠等不到 load/error → strip 卡死在 opacity:0。poster 在 .gallery-section 外、不在此 inner，天生不受影響。
function gateStripRevealOnLoad(inner, onReveal) {
  const imgs = [...inner.querySelectorAll('img')].filter(im => im.getAttribute('src'));
  if (!imgs.length || imgs.every(im => im.complete && im.naturalWidth)) return;
  inner.style.opacity = '0';
  let revealed = false;
  const reveal = () => { if (revealed) return; revealed = true; inner.style.opacity = '1'; onReveal?.(); };
  Promise.all(imgs.map(im => (im.complete && im.naturalWidth)
    ? Promise.resolve()
    : new Promise(res => { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); })))
    .then(reveal);
  // ⚠️逾時兜底（user 2026-08-28，隕石濃湯 exhibition 15 張圖實測）：Directus /assets 慢（TTFB~2s×多張、6 連線上限）
  //    或某張永遠不 fire load/error 時，「等全部載完才淡入」會讓整條相簿永遠卡 opacity:0＝有圖但看不見。1.5s 到就
  //    先淡入，未載完的圖之後自然到位（頂多輕微往右移，遠比整條不見好；同 reference_lightbox_probe_all_images_blocks_open
  //    的逾時取捨）。track 的 ResizeObserver 會在圖載入撐寬時重算 chevron → onReveal 早跑不影響最終 chevron。
  setTimeout(reveal, 1500);
}

// Gallery 滑動、Lightbox、hover、海報比例偵測；回傳 GSAP 動畫啟動函數
export function bindInteractions(container, { autoReveal = true, incremental = false, deferBinds = false } = {}) {
  // Albums lightbox：click 單張 thumb 開 lightbox 對應 index
  // data-album-media + data-album-title 在父 .album-thumb-item，data-album-index 在 .album-thumb-btn
  // 整個 row 不再 click open（user 反映：要看 thumbnail 不是 row click → 視覺有 thumb 後點 thumb 才直觀）
  // title override = 該 album 的 date+location；不用父 list-item title（user 指定）
  // ── 展開內容(album/gallery/lightbox/hover)的綁定：只在 accordion 展開時才看得到，非首屏所需。
  //    大清單(>24 items，如 exhibitions 93 item/526 row)首次載入同步綁這堆＝實測 ~236ms 卡死主執行緒
  //    （setupClipReveal 只 75ms、建 HTML 228ms，binds 才是大頭）。改成逐 .list-item 分幀綁：清單先出現(build+
  //    reveal 仍同步)，這些綁定在背景每 8ms/幀補上、container 斷開(離頁)自停（user 2026-08-31）。
  //    小清單/alumni/admission(<24 item) 維持同步、byte-identical。⚠️各 pass 掃描 scope 從 container→逐 item，
  //    每 item 只掃一次＝無雙綁；bindMediaHover/hydrateHlsThumbs 本就自帶 dataset 守衛、逐 item 呼叫安全。
  // incremental（lazy 捲入補綁）：只處理尚未綁過的 item（data-bound 守衛），避免重綁第一批；小批次一律同步綁
  const _allItems = [...container.querySelectorAll(incremental ? '.list-item:not([data-bound])' : '.list-item')];
  // deferBinds：lazy 首批強制分幀綁（切換時逐 item bindMediaHover 同步跑會卡退場動畫；binds 是展開內容用、非首屏所需）
  const _deferItemBinds = !incremental && (deferBinds || _allItems.length > 24);
  // 逐 .list-item 綁「展開內容」互動（scope 到單一 item，每 item 只掃一次＝無雙綁）。
  const _bindOneItem = (scope) => {
  if (scope.dataset.bound) return;   // 已綁過（lazy 重跑）→ 跳過
  scope.dataset.bound = '1';
  scope.querySelectorAll('.album-thumb-btn').forEach(btn => {
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
  scope.querySelectorAll('.album-gallery').forEach(gallery => {
    const inner = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-track-inner'));
    const track = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-track'));
    const prevBtn = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-prev'));
    const nextBtn = /** @type {HTMLElement | null} */ (gallery.querySelector('.album-next'));
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    // max==0 整顆隱藏（沒東西可滑）；否則依 offset 端點 50% 透明暗示「到底了」
    // 藏起(0 寬)不跑＋三態沒變不寫：per-gallery RO 跟 marquee 的 RO 在 panel display 切換同批 delivery，
    // 回呼裡「讀 layout+寫 DOM」跟鄰居交錯＝每個 item 邊界一次全頁 recalc（reference_activities_switch_ro_recalc_storm）。
    // 狀態存 JS property 不存 dataset（attribute 寫入本身會 dirty style）。
    const updateChevrons = () => {
      if (track.clientWidth === 0) return;
      const max = getMaxOffset();
      const noScroll = max === 0;
      // 到端點＝視覺暗示「到底了」：opacity 0.5 + not-allowed 游標。這些 chevron 不是原生 disabled（只改 opacity），
      // inline style.cursor（spec=1000）直接生效；不設的話會吃到 cursor.css `button:not(:disabled)` 的 pointer。
      const atStart = !noScroll && offset <= 0;
      const atEnd   = !noScroll && offset >= max;
      const state = `${noScroll}|${atStart}|${atEnd}`;
      if (gallery._chevState === state) return;
      gallery._chevState = state;
      prevBtn?.classList.toggle('invisible', noScroll);
      nextBtn?.classList.toggle('invisible', noScroll);
      if (prevBtn) { prevBtn.style.opacity = atStart ? '0.5' : ''; prevBtn.style.cursor = atStart ? 'var(--cursor-not-allowed)' : ''; }
      if (nextBtn) { nextBtn.style.opacity = atEnd ? '0.5' : ''; nextBtn.style.cursor = atEnd ? 'var(--cursor-not-allowed)' : ''; }
    };
    // list-item 展開後 dispatch 'gallery:check'，這時 inner.scrollWidth 才是真實值
    gallery.closest('.list-item')?.addEventListener('gallery:check', updateChevrons);
    // 額外 ResizeObserver：track width 變化（grid layout reflow / window resize）時重算 chevron 顯隱
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(updateChevrons).observe(track);
    }
    // 縮圖 w-auto：decode 後才撐寬、逐張載入把右側往右推＝展開「往右移」→ 先藏整條、全載完才一次淡入
    gateStripRevealOnLoad(inner, updateChevrons);
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
  scope.querySelectorAll('.gallery-section').forEach(gallery => {
    const inner = gallery.querySelector('.gallery-inner');
    const track = gallery.querySelector('.gallery-track');
    const prevBtn = gallery.querySelector('.gallery-prev');
    const nextBtn = gallery.querySelector('.gallery-next');
    if (!inner || !track) return;
    let offset = 0;
    const getMaxOffset = () => Math.max(0, inner.scrollWidth - track.clientWidth);
    // 藏起不跑＋三態沒變不寫（同 album-gallery updateChevrons，見該處註解）
    const updateChevrons = () => {
      if (track.clientWidth === 0) return;
      const max = getMaxOffset();
      const noScroll = max === 0;
      const atStart = !noScroll && offset <= 0;
      const atEnd   = !noScroll && offset >= max;
      const state = `${noScroll}|${atStart}|${atEnd}`;
      if (gallery._chevState === state) return;
      gallery._chevState = state;
      // 不需捲動時 chevron 收掉寬度（display:none 非 invisible）→ 圖左緣直接對齊 padding/文字，不留 32px 空位
      if (prevBtn) prevBtn.style.display = noScroll ? 'none' : 'flex';
      if (nextBtn) nextBtn.style.display = noScroll ? 'none' : 'flex';
      // 到端點 opacity 0.5 + not-allowed 游標（同 album-gallery，非原生 disabled inline cursor 直接生效）
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
    // 縮圖 w-auto：同 album strip 的展開「往右移」→ 先藏整條、全載完才一次淡入（排除無 src 的 HLS 佔位 img）
    gateStripRevealOnLoad(inner, updateChevrons);
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

  // Lightbox 綁定（scope 已是單一 .list-item）
  [scope].forEach(workshopItem => {
    const media = JSON.parse(workshopItem.dataset.media || '[]');
    if (media.length === 0) return;
    workshopItem.querySelectorAll('[data-lightbox-open]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const index = parseInt(el.dataset.lightboxIndex, 10) || 0;
        openLightbox(media, index, getLightboxMeta(el));
      });
      // 無障礙：gallery/poster 是 <div>，補可 Tab + Enter 開 lightbox（圖 alt 當名稱、無則 fallback）
      makeActivatable(el, el.querySelector('img')?.getAttribute('alt') || '開啟媒體 Open media');
    });
  });

  // 海報 & gallery hover 效果（bindMediaHover 認得單一 item scope）
  bindMediaHover(scope);

  // 自架影片（m3u8）gallery tile 補截幀縮圖（cached，同 URL 只截一次）
  hydrateHlsThumbs(scope);
  };
  // 小清單(<24 item)：同步逐 item 綁，順序與行為跟改前一致。
  // 大清單：延到 first-paint 後「每 8ms/幀」逐 item 綁——實測 exhibitions 93 item 的這堆綁定同步跑要 ~1.2s
  //   （1127 張 hover 圖），一次跑完＝把凍結搬到 paint 後(反而更糟)；分幀讓每幀 ≤8ms、其餘留給捲動 paint，
  //   清單第一屏立刻可見可捲，展開內容的互動在背景漸次補上。container 斷開(離頁)自停（同 initMarquees）。
  if (!_deferItemBinds) {
    _allItems.forEach(_bindOneItem);
  } else {
    let _i = 0;
    const _step = () => {
      if (!container.isConnected || _i >= _allItems.length) return;
      const _budget = performance.now() + 8;
      do { _bindOneItem(_allItems[_i++]); } while (_i < _allItems.length && performance.now() < _budget);
      if (_i < _allItems.length) requestAnimationFrame(_step);
    };
    // 延 1.6s（≈ exit 0.5~0.9s + reveal 主要窗口）才起跑：8ms/幀預算迴圈跟切換動畫同幀＝每幀 8ms 預算
    // + GSAP tick + paint 必 >16.7ms 掉幀（實測每次切換 5~13 個 >33ms 幀）。binds 是展開內容用、
    // rows 在 reveal 完成前本就被 data-pre-reveal 鎖 pointer → 延後起跑對互動零影響。
    const _bindTimer = setTimeout(() => requestAnimationFrame(_step), 1600);
    registerPageCleanup(() => { clearTimeout(_bindTimer); _i = _allItems.length; });
  }

  // 標題跑馬燈：偵測是否溢出，是則加 is-overflow + 設定捲動距離
  // list-content 內的 location marquee 渲染當下 clientWidth=0（h-0 overflow-hidden），會錯判 overflow；
  // 對 list-content 內的 wrap 額外綁 'gallery:check' event，accordion 展開時 list-accordion.js
  // 在 onComplete dispatch 該 event → 此時量 clientWidth 才是真值
  //
  // 配對同步（2026-08-04，user 要求）：EN/ZH 長度常不同，各自獨立 CSS seamless-loop 跑久了會脫拍
  // （短的先繞回去、跟長的不同步）。同一個標題單位的 EN/ZH 兩條 .list-title-marquee 改用 GSAP 共用 timeline
  // （buildSyncedMarqueeTimeline，見 marquee-overflow.js）：兩條共用「最長那條的自然速度」當 duration，
  // 短的移動比較慢但跟長的同時抵達終點；一輪跑完停 0.6s（repeatDelay）才一起歸零重播。
  //
  // ⚠️2026-08-04 修正：一開始誤以為「同一父層下的 .list-title-marquee 一定剛好兩條」，但 subtitle/ref 這類
  // 可能有多個段落各自一組 EN+ZH（renderSubListInner 對每個 guest/ref map+join 攤平成同一個父層下一串
  // en,zh,en,zh...），父層底下會有 4、6 條而不是 2 條——舊版「!==2 就整組退回原本邏輯」導致這些多段落的
  // marquee 完全沒配對、退化成各自獨立 CSS 迴圈（就是 user 回報「中文比較快進下一輪」的成因）。
  // 改法＝依 DOM 順序兩兩配對（每個 wrap 用自己在同層 .list-title-marquee 清單中的 index 找 partner：
  // 偶數 index 配下一個、奇數 index 配上一個），落單尾巴（該段只有 en 沒有 zh）維持原本單條 CSS 邏輯。
  function reconcilePair(wrap) {
    const parent = wrap.parentElement;
    if (!parent) return false; // detached（re-render 後仍排隊的 ResizeObserver callback）→ no-op 不炸
    const siblings = [...parent.querySelectorAll(':scope > .list-title-marquee')];
    const idx = siblings.indexOf(wrap);
    if (idx === -1) return false;
    const isEven = idx % 2 === 0;
    const partnerIdx = isEven ? idx + 1 : idx - 1;
    const partner = (partnerIdx >= 0 && partnerIdx < siblings.length) ? siblings[partnerIdx] : null;
    if (partner) return reconcileChunk(isEven ? [wrap, partner] : [partner, wrap]);
    // 落單（單語言，實務上＝有英沒中；有中沒英會補英故仍雙語，user 2026-08-25）：只有 hover-gated 情境
    // （list-header 主/副標、摘要欄）才單條走 GSAP＝一樣要 hover 放開回彈；其他 list-content 自動跑的 lone
    // marquee 維持 CSS seamless（本來就無 hover snap 問題，別改它的 loop 風格）→ return false 交回 CSS。
    if (wrap.closest('.list-header') || wrap.closest('.list-summary-mq-col')) return reconcileChunk([wrap]);
    return false;
  }

  // wraps＝配對 [en, zh] 或落單 [wrap]（單語言）；兩者都走同一條 GSAP 路徑（buildSyncedMarqueeTimeline 吃 1~N 條）。
  function reconcileChunk(wraps) {
    const first = wraps[0];
    // Panel display 切換時「該 panel 每個 wrap 的 per-wrap ResizeObserver」同批 fire（藏起量到 0 寬、切回量回原寬）。
    // 舊版無條件 kill＋重量＋重建＝每個回呼讀 layout 又寫 DOM，批次內讀寫交錯 → 每個 wrap 強制一次全頁 style
    // recalc，實測已載入分頁互切凍結 1.3~7.6s（見 memory reference_activities_switch_ro_recalc_storm）。兩道 bail：
    //   ① 藏起（0 寬）→ 只暫停 tl（隱藏中還逐幀寫 transform 白燒 CPU），其餘不讀不寫；重新可見 RO 會再 fire。
    //   ② 尺寸簽名沒變（切回來、寬度同藏前）→ 免重建，只把 ① 暫停的 tl 依 gate 規則恢復。
    // 簽名變了（首次量測 / resize / fonts.ready 後實寬變）才走下面完整重建。
    if (first.clientWidth === 0) {
      if (first._pairGroup) { first._pairGroup.tl.pause(); first._pairGroup._hiddenPaused = true; }
      return true;
    }
    const sig = wraps.map(w => { const p = w.querySelector('p'); return w.clientWidth + ',' + (p ? p.scrollWidth : 0); }).join(';');
    if (sig === first._mqSig) {
      const g = first._pairGroup;
      if (g && g._hiddenPaused) {
        g._hiddenPaused = false;
        const header = first.closest('.list-header');
        const cell = header ? null : first.closest('.list-summary-mq-col');
        const gate = header || (window.innerWidth >= 768 ? cell : null);
        // 無 gate（list-content 自動捲）→ 續播；有 gate → 只在當下 hover/active 才播（同下方初建規則）
        if (!gate || gate.matches(':hover') || (header && header.classList.contains('active'))) g.tl.play();
      }
      return true;
    }
    first._mqSig = sig;
    if (first._pairGroup) { first._pairGroup.tl.kill(); if (first._pairGroup._ret) first._pairGroup._ret.kill(); }

    const measured = wraps.map(wrap => {
      const p = wrap.querySelector('p');
      wrap.dataset.marqueePaired = '1'; // lists.css 用這個 class 蓋掉 CSS animation，避免跟 GSAP 打架（落單也套＝關 CSS keyframe）
      return { wrap, p, distance: p ? p.scrollWidth - wrap.clientWidth : 0 };
    });
    const overflowing = measured.filter(m => m.p && m.distance > 1);
    measured.forEach(({ wrap, p }) => { wrap.classList.toggle('is-overflow', overflowing.some(o => o.wrap === wrap)); if (p) gsap.set(p, { x: 0 }); });

    if (!overflowing.length) { wraps.forEach(w => w._pairGroup = null); return true; }

    const tl = buildSyncedMarqueeTimeline(overflowing.map(({ p, distance }) => ({ el: p, distance })));
    const group = { tl, els: overflowing.map(o => o.p) };
    wraps.forEach(w => w._pairGroup = group);

    // 播放 gate（對齊 lists.css / dsd 慣例）：
    //   - list-header 內：hover（桌面）/ active（手機 accordion，MutationObserver 追 class）才播。
    //   - list-content 摘要欄（.list-summary-mq-col＝地點/城市）：桌面 hover 該欄才播、手機無 hover 自動捲
    //     （user 2026-08-19；先前一律「量到即播」＝自動捲，改對齊 dsd 的 col hover-gated）。
    //   - 其他 list-content marquee（副標/講者/refs/date 等）：維持量到即播。
    const header = first.closest('.list-header');
    const cell = header ? null : first.closest('.list-summary-mq-col');
    const gate = header || (window.innerWidth >= 768 ? cell : null);
    if (!gate) { tl.play(); return true; }
    // playAll/pauseAll 即時掃 DOM 讀 wrap._pairGroup（不維護額外陣列），reconcileChunk 可能因 resize/
    // gallery:check/fonts.ready 重跑多次——若改存陣列每次 push 會累積失效的舊 timeline 參考（真的踩過這個 bug）。
    if (!gate._pairMarqueeBound) {
      gate._pairMarqueeBound = true;
      const eachGroup = (fn) => {
        const seen = new Set();
        gate.querySelectorAll('[data-marquee-paired="1"]').forEach(w => {
          if (!w._pairGroup || seen.has(w._pairGroup)) return;
          seen.add(w._pairGroup);
          fn(w._pairGroup);
        });
      };
      // 放開 hover 平滑回彈（user 2026-08-19 B）：desktop mouseleave → easeAll（pause 凍在當下、補間回 0，同 faculty
      // slide-in）；⚠️手機 accordion 收合（MutationObserver）維持 snapAll（手機不變、且收合中 ease 看不到）。
      // re-enter 先 kill 未完成回彈 tween 再 play。returnTween 存 group 上（_ret）。⚠️不用 overwrite（會殺 tl 自己的 child tween）。
      const playAll  = () => eachGroup(g => { if (g._ret) { g._ret.kill(); g._ret = null; } g.tl.play(); });
      const snapAll  = () => eachGroup(g => { if (g._ret) { g._ret.kill(); g._ret = null; } g.tl.pause(0); gsap.set(g.els, { x: 0 }); });
      const easeAll  = () => eachGroup(g => {
        g.tl.pause();
        g._ret = gsap.to(g.els, { x: 0, duration: 0.45, ease: 'cubic-bezier(0.25,0,0,1)', onComplete: () => { g.tl.progress(0); g._ret = null; } });
      });
      gate.addEventListener('mouseenter', playAll);
      gate.addEventListener('mouseleave', easeAll);
      // active（手機 accordion 展開）只對 header 有意義；摘要欄無 active 態，桌面純 hover
      const mo = header ? new MutationObserver(() => (header.classList.contains('active') ? playAll() : snapAll())) : null;
      if (mo) mo.observe(header, { attributes: true, attributeFilter: ['class'] });
      registerPageCleanup(() => { gate.removeEventListener('mouseenter', playAll); gate.removeEventListener('mouseleave', easeAll); if (mo) mo.disconnect(); });
    }
    if (gate.matches(':hover') || (header && header.classList.contains('active'))) tl.play();
    return true;
  }

  const initMarquees = () => {
    // 桌面手機都跑 — 手機 title 區窄更容易 overflow，user 要求收起時就要 marquee
    const wraps = [...container.querySelectorAll('.list-title-marquee')];
    const processWrap = (wrap) => {
      if (wrap.dataset.mqBound) return;   // 已量過（lazy 重跑）→ 跳過，避免重複 ResizeObserver 累積
      wrap.dataset.mqBound = '1';
      const p = wrap.querySelector('p');
      if (!p) return;
      const checkOverflow = () => {
        if (typeof gsap !== 'undefined' && reconcilePair(wrap)) return; // 配對交給上面處理
        if (wrap.clientWidth === 0) return; // 藏起（display:none）：狀態保持不寫，重新可見 RO 再 fire 才重量
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
    };
    // 分幀處理：逐 wrap 讀 scrollWidth＝forced reflow，整批一次量＝單一 ~250ms long task（捲近 list 時卡一下）。
    // 每幀 ~8ms 預算、其餘留給捲動 paint → 60fps 不掉幀、marquee 於 ~0.25s 內漸次補上（裝飾性 overflow 無感）。
    // reconcilePair 靠 DOM 兄弟找 partner（非處理順序）→ 分幀不影響 EN/ZH 配對。離頁 container 斷開即自停。
    let i = 0;
    const step = () => {
      if (!container.isConnected) return;
      const budget = performance.now() + 8;
      while (i < wraps.length && performance.now() < budget) processWrap(wraps[i++]);
      if (i < wraps.length) requestAnimationFrame(step);
    };
    step();
  };
  // initMarquees 逐列讀 scrollWidth/clientWidth（forced reflow）＝ ~250ms thrash（profiler 實測 activities-data-loader.js:774）。
  // 初載時 list 在 hero 下方 fold 外、量測又跟 hero 進場搶主執行緒 → hero 卡頓。改用 IntersectionObserver 只在
  // container 捲近 viewport 才量：初載 fold 外時完全不在 hero 期間跑（rIC 會在幀間空檔誤觸 hero、IO 不會）；
  // 已可見的 panel（section 切換後 user 早在內容區）IO 立即 fire、marquee 無延遲。marquee 是裝飾性 overflow 捲動，
  // 「看得到才量」語意也對。fonts.ready / 逐 wrap ResizeObserver re-check 仍照舊補量。離頁由 registerPageCleanup 收。
  const runMarquees = () => { if (container.isConnected) initMarquees(); };
  if (incremental) {
    // lazy 捲入補綁：container 早已在視窗內，直接量新 wrap（processWrap 的 mqBound 守衛跳過舊的）
    runMarquees();
  } else if (typeof IntersectionObserver !== 'undefined') {
    const mqIo = new IntersectionObserver((entries, obs) => {
      if (!entries.some(e => e.isIntersecting)) return;
      obs.disconnect();
      // 延 1.6s：IO fire 的時點＝panel 剛顯示（切換）或捲近（初載），正是 exit+reveal 動畫窗口；
      // 量測迴圈每幀 8ms 預算跟動畫搶幀（同上 _bindTimer 註解）。marquee 是裝飾性 overflow，晚 1.6s 無感。
      const t = setTimeout(runMarquees, 1600);
      registerPageCleanup(() => clearTimeout(t));
    }, { rootMargin: '200px' });  // 提前 200px 量好，捲到時 marquee 已就緒
    mqIo.observe(container);
    registerPageCleanup(() => mqIo.disconnect());
  } else {
    requestAnimationFrame(runMarquees);
  }

  // 七輪：poster「載好才 clip-reveal 滑入」（對齊 library，消滅 progressive 掃描浮現）。translate 由 buildPosterHtml 烙 inline、
  //   rotate 由 bindMediaHover 承載（1-C 組合契約）。⚠️ wrapper 的 overflow 被 applyHover 設成 visible（供 hover 微旋不裁），
  //   故滑入期間必須自己補 overflow:clip 當遮罩、揭完還原 visible——否則畫外起點裸露、非乾淨 clip-reveal。
  //   rot 讀 dataset.initDeg 現值＝與 bind/reveal 先後順序無關（deferBinds 時 bindMediaHover 可能晚於此 reveal）。
  const revealPoster = (img) => {
    if (!img.dataset.pendingReveal) return;
    delete img.dataset.pendingReveal;
    const wrap = /** @type {HTMLElement|null} */ (img.closest('[data-lightbox-open]'));
    const rotOf = () => img.dataset.initDeg ? ` rotate(${img.dataset.initDeg}deg)` : '';
    if (wrap) { wrap.style.overflow = 'clip'; wrap.style.overflowClipMargin = '0.75rem'; }
    img.style.transition = 'transform 0.6s cubic-bezier(0.25, 0, 0, 1)';   // EASE.enter
    img.style.transform = `translate(0%, 0%)${rotOf()}`;
    const clr = (e) => {
      if (e.target !== img || e.propertyName !== 'transform') return;
      img.style.transition = '';
      img.style.transform = rotOf().trim();                                 // 收斂：只留 hover 初始旋轉
      if (wrap) { wrap.style.overflow = 'visible'; wrap.style.overflowClipMargin = ''; }  // 還原 applyHover 的 hover-不裁態
      img.removeEventListener('transitionend', clr);
    };
    img.addEventListener('transitionend', clr);
  };

  // 海報比例偵測（:not([data-pbound]) → lazy 重跑只綁新海報）
  container.querySelectorAll('.poster-img:not([data-pbound])').forEach(img => {
    img.dataset.pbound = '1';
    const apply = () => {
      const grid = img.closest('.list-content')?.querySelector('[style*="grid-template-columns"]');
      if (img.naturalWidth > img.naturalHeight) {
        img.classList.replace('object-cover', 'object-contain');
        img.classList.add('object-top');
        if (grid) grid.style.gridTemplateColumns = '8.5fr 3.5fr';
      }
    };
    if (img.complete && img.naturalWidth) { apply(); revealPoster(img); return; }
    // poster 未載入：poster-img w-full 沒預留高度，手機慢載時「item 已展開後才載入」會瞬間把下方內容頂下去（user 2026-06-15「內容跳動」）。
    // 修：load 時若 item 已展開且開啟動畫已收尾，用外框（本就 overflow-hidden）把海報高度 0→自然高 平滑揭露，下方內容隨之緩降，取代瞬跳。
    img.addEventListener('load', () => {
      apply();
      revealPoster(img);   // 七輪：載好才滑入（AR 佔位＝乾淨白框；此時才 clip-reveal）
      const wrap    = /** @type {HTMLElement|null} */ (img.closest('[data-lightbox-open]'));
      const content = /** @type {HTMLElement|null} */ (img.closest('.list-content'));
      const header  = img.closest('.list-item')?.querySelector('.list-header');
      // 只在「展開且 proceedOpen 已 onComplete（overflow:visible）」時介入；收合中 / 開啟動畫進行中不碰，避免跟 content height tween 打架。
      // ⚠️ wrapper 已有 aspect-ratio（P2-2 預留高度）就跳過：高度已佔位、無跳動可補償，再跑 0→full 反而多一次收合再展開。
      if (wrap && content && header?.classList.contains('active') && content.style.overflow === 'visible' && !wrap.style.aspectRatio && typeof gsap !== 'undefined') {
        const fullH = wrap.offsetHeight;
        if (fullH > 0) {
          gsap.killTweensOf(wrap);
          gsap.fromTo(wrap, { height: 0 }, { height: fullH, duration: DUR.base, ease: EASE.move, onComplete: () => { wrap.style.height = ''; } });
        }
      }
    }, { once: true });
  });

  // Reference 按鈕（舊 workshop-ref-btn / industry-ref-btn 已統一為 list-ref-btn，此處保留相容）
  // :not([data-rbound]) → lazy 重跑只綁新 ref 按鈕，不重綁舊的（否則雙 dispatch open-pdf）
  container.querySelectorAll('.workshop-ref-btn:not([data-rbound]), .list-ref-btn:not([data-rbound])').forEach(btn => {
    btn.dataset.rbound = '1';
    bindRefBtnClick(btn);
  });

  // ref document 封面預產（user 2026-08-28「第一次打開色塊就要是封面 size」）：背景用 pdf-cover
  // range 抓第一頁進 IDB（幾十 KB、跨 session 一生一次），點開時 viewer peekPdfCover 命中
  // ＝首次開檔色塊即真實比例（跟 library documents 預產封面同邏輯）。idle 起跑＋
  // renderPdfCover 內建併發閘門與 single-flight → 不搶 hero/list 進場的主執行緒與頻寬。
  const refPdfUrls = [...new Set([...container.querySelectorAll('[data-ref-pdf-url]:not([data-refpdfscan])')]
    .map(b => { b.dataset.refpdfscan = '1'; return b.dataset.refPdfUrl; }).filter(Boolean))];
  if (refPdfUrls.length) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1000));
    idle(() => import('../ui/pdf-cover.js').then(m => refPdfUrls.forEach(u => m.renderPdfCover(u))));
  }

  // 進場動畫：per-row clip reveal + data-pre-reveal 守門（動畫前禁 hover/click）
  // onEnter 時同步移除 closest .list-item 的 data-pre-reveal，解鎖互動
  // autoReveal=false 時跳過此段，由 caller 自行管理 reveal（admission lazy load summer-camp 用）
  if (typeof gsap === 'undefined') return null;

  // lazy 捲入補綁：只 wrap 尚未 clip-wrapped 的新 row 且不隱藏（直接可見，無進場動畫）；不建 reveal trigger
  //（⚠️ setupClipReveal 的 hide 對「傳入的全部元素」gsap.set，故必須只餵新 row，否則重藏已揭的第一批）
  if (incremental) {
    setupClipReveal([...container.querySelectorAll('.list-reveal-row:not([data-clip-wrapped])')], { hide: false });
    return null;
  }

  const allRows = [...container.querySelectorAll('.list-reveal-row')];
  if (allRows.length === 0) return null;

  const items = setupClipReveal(allRows, { hide: false });  // Part 1：只 wrap 遮罩、CSS 藏（除 GSAP 冷觸 recalc storm）
  hideRows(items, false);
  if (!autoReveal) return null;
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.batch(items, {
      start: 'top 90%',
      onEnter: /** @param {HTMLElement[]} batch */ batch => {
        // data-pre-reveal（pointer-events:none 禁 hover/click）延到 reveal 動畫「完成」才解鎖：
        // 若在 onEnter 就解，reveal 進行中 header 已可 hover → 文字還在滑入時 hover 出現「有色塊沒文字」（user 2026-07-14）。
        revealRows(batch, {
          dur: DUR.reveal, stagger: 0.12,  // Part 1：CSS transition（同 playClipReveal 的 reveal 時長/跨列 stagger）
          onDone: () => batch.forEach(/** @param {HTMLElement} row */ row => {
            const listItem = row.closest('.list-item');
            if (listItem) listItem.removeAttribute('data-pre-reveal');
          }),
        });
      },
    });
  } else {
    revealRows(items, { dur: DUR.reveal, stagger: 0.12 });  // Part 1：同上（無 ScrollTrigger fallback 路徑）
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
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ZH_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
function formatDatesFromGroups(datesArr, { includeStartYear = false } = {}) {
  if (!Array.isArray(datesArr) || datesArr.length === 0) return '';
  return datesArr.map(d => formatSingleDateGroup(d, includeStartYear)).filter(Boolean).join(', ');
}
function formatSingleDateGroup(d, includeStartYear = false) {
  if (!d) return '';
  const sY = d.startYear, sM = d.startMonth, sD = d.startDay;
  // 後台 dates repeater 勾「只到月」→ 只渲染月份（英全名 + 中文），忽略日與 range
  // ponytail: 只做單月；要跨月 range（May 五月 - June 六月）之後再加
  if (d.monthOnly) {
    if (!sM) return '';
    const mo = `${EN_MONTHS[sM - 1]} ${ZH_MONTHS[sM - 1]}`;
    return includeStartYear ? `${sY} ${mo}` : mo;
  }
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
//   showSubtitle         {boolean}      subtitle / subtitle_zh（預設 true；沒填自然不渲染）
//   subtitleFromGuests   {boolean}      副標改從 item.guests 派生（lectures 用：每位講者一段 EN+ZH）
//   showAlumniIcon       {boolean}      畢業帽 icon（預設 true）
//   showDate             {boolean}      date（預設 true）
//   showDescription      {boolean}      description / descriptionZh（預設 true）
//   showLocation         {boolean}      location（預設 true）
//   showPoster           {boolean}      poster（預設 true）
//   showReference        {boolean}      ref link（預設 true）
//   showGuestAffiliation {boolean}      guest affiliation（預設 true）
//   showGuestCountry     {boolean}      guest alumni + country（預設 true）
//   introField           {string}       內文 field 名稱（預設 'description'）
//   panelSelector        {string}       sticky top 參考的 panel selector
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
    titleLevel           = 2,   // 清單主標的 heading 階層：activities/admission 直接在 h1 下 = 2；alumni 在 section h2 下 = 3
    categoryFilter       = null,
    visitTypeFilter      = null,
    visitTypeField       = 'visitType',
    showYearToggle       = true,
    hideYearHeader       = false,
    showSubtitle         = true,   // 後台有填 subtitle 就顯示；沒填 subList 為空、renderSubListBlock 回 '' 自然不渲染（user 2026-08-28：exhibition 等直接走 loadListInto 的 section 原漏渲染）
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
    lazy                 = false,   // 大清單只渲染視窗內第一批，捲到底 IO 才續建（activities 大 section 開）
    onLazyBatch          = null,    // 每批捲入後回呼（重跑 accordion / year-toggle init，idempotent）
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

  // Resolve refs（補齊 ref label；title 已由 activities-source remapRef 帶）。P1-5 後 resolveRef 為同步純填 label（無 fetch）＝即時；
  // 保留 flatMap/Promise.all 結構（與下方首批/背景 render 呼叫點相容、零行為差）。
  const resolveRefsFor = (items) => Promise.all(items.flatMap(item => {
    const refs = item.references || (item.reference ? [item.reference] : []);
    return refs.map(ref => resolveRef(ref));
  }));
  const allItemsFlat = filteredData.flatMap(yg => yg.items);

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

  // 逐筆 item HTML 建構器（sync／streamed 兩路共用）：只依賴 item / itemIdx / total（body 不碰年份組 scope）
  const buildItemHtml = (item, itemIdx, total) => {
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
      // 都 → 統一 [{en, zh}] 形式（後台填幾段渲染幾段）；空字串/空 obj 自動 filter。
      // 兩處 render 點（dateInHeader fallback / showSubtitle 展開區）共用 → 行為一致。
      // subtitleFromGuests=true（lectures 用）：改從 item.guests 派生簡名副標，每位講者一段 EN+ZH（全數渲染），
      // expand 區的 guests 詳細資料（affiliation / country）保留不變
      const subList = (() => {
        if (subtitleFromGuests && Array.isArray(item.guests) && item.guests.length) {
          return item.guests
            .map(g => ({
              en: formatNameWithAka(g.nameEn || g.name || '', g.akaEn, g.akaZh, false),
              zh: formatNameWithAka(g.nameZh || g.name_zh || '', g.akaZh, g.akaEn, true),
            }))
            .filter(s => s.en || s.zh);
        }
        if (Array.isArray(item.subtitles)) {
          return item.subtitles
            .map(s => ({ en: s?.en || s?.subtitleEn || '', zh: s?.zh || s?.subtitleZh || '' }))
            .filter(s => s.en || s.zh);
        }
        const en = item.subtitleEn || item.subtitle || '';
        const zh = item.subtitleZh || item.subtitle_zh || '';
        return (en || zh) ? [{ en, zh }] : [];
      })();
      // 副標 inner（無 wrapper）給 dateInHeader 模式直接拼進 list-reveal-row 用
      // 每行副標包進 .list-title-marquee：手機單行 nowrap + 打開(.list-header.active)才 marquee（user 2026-06-10）；
      // 桌面由 @media(min-width:768px) 覆寫回 wrap（見 lists.css），不影響桌面多行顯示
      // 單段副標的 EN+ZH 兩行 marquee（EN 上 ZH 下）
      const subSegLines = (s) =>
        (s.en ? `<div class="list-title-marquee${s.zh ? ' mb-en-zh-s' : ''}"><p class="text-s">${s.en}</p></div>` : '') +
        (s.zh ? `<div class="list-title-marquee"><p class="text-s">${s.zh}</p></div>` : '');
      const renderSubListInner = () => subList.map(subSegLines).join('');
      // 副標 block 給 showSubtitle 模式用：**每段各自一個 .list-reveal-row** → 多段時逐段 stagger 進場
      // （user 2026-08-12「有一個以上分次出來」），非一次全揭。每段仍帶 .list-subtitles → 各自套 pin 收合
      // CSS 接口（clip-reveal-wrapper:has(.list-subtitles) → grid-rows 0fr collapse）；每段 parent 剛好 EN+ZH
      // 兩條 marquee → 配對邏輯天然成立。
      const renderSubListBlock = () => subList
        .map(s => `<div class="list-reveal-row list-subtitles">${subSegLines(s)}</div>`)
        .join('');

      // 標題（EN+ZH）同一個 list-reveal-row → 同步進場
      // dateInHeader 時 date 獨立一個 list-reveal-row 顯示在 title 下方（admission news 用），不在 expand 區再渲染一次
      const titleHtml = `<div class="flex flex-col gap-xs flex-1 min-w-0">
          <div class="list-reveal-row">
            <div class="list-title-marquee${titleLine2 ? ' mb-en-zh-lg' : ''}"><p class="text-lg font-bold" role="heading" aria-level="${titleLevel}">${titleLine1}</p></div>
            ${titleLine2 ? `<div class="list-title-marquee"><p class="text-lg font-bold" role="heading" aria-level="${titleLevel}" lang="zh-Hant">${titleLine2}</p></div>` : ''}
          </div>
          ${dateInHeader ? (() => {
            // date/副標獨立一個 list-reveal-row → 晚標題進場（user 2026-08-12「副標跟標題分開時間出場」，對齊 press/album）。
            // 獨立 flex 子吃外層 gap-xs（同 camp）不需 mt-xs。date 優先，沒 date 用 subtitle 當副標。
            if (dateDisplay) return `<div class="list-reveal-row"><p class="text-s">${dateDisplay}</p></div>`;
            return `<div class="list-reveal-row">${renderSubListInner()}</div>`;
          })() : ''}
          ${showSubtitle ? renderSubListBlock() : ''}
        </div>`;

      // Locations 結構：每筆 {en, zh, country} 一個 row，渲染時 vertical stack（user 契約：往下增加）
      // 新 endpoint shape `item.locations = [{nameZh, nameEn, country}, ...]` 優先；fallback 舊 `item.location / location_zh / flag` 字串包成單筆
      const locationRows = Array.isArray(item.locations) && item.locations.length > 0
        ? item.locations.map(l => ({ en: l?.nameEn || '', zh: l?.nameZh || '', country: l?.country || '' }))
        : ((item.location || item.location_zh || item.flag)
          ? [{ en: item.location || '', zh: item.location_zh || '', country: item.flag || '' }]
          : []);
      // 多地點：前台改「一個個往下堆疊」渲染（每個 venue 各自 EN+ZH 一組），不再 ' / ' 併成一行（user 2026-08-28）。
      // 渲染直接吃 locationRows（見下方 .list-summary-mq-col）；search 仍走上面 searchText 的 item.location/location_zh。
      // city（conference 摘要列第三欄）：venue(location) 之外的城市/地區，目前只有 conferences 填
      const cityEn = item.city || item.cityEn || '';
      const cityZh = item.city_zh || item.cityZh || '';
      // 標題國旗＋校友 icon 來源 = 所有講者：item-level guests ＋ conference sessions[].guests（去重）。
      // conference 慣例＝講者填在 sessions 裡、parent guests 留空；舊版國旗只讀 item.guests → session-only forum
      //   右上無旗（校友帽卻有算 session＝不一致）。統一聚合成一份 allGuests，旗子/帽子同源。
      // 「地點的國家」(item.flag / locations[].country) 暫不納入 — user 2026-06-03：等後台處理 location-country 機制再加進來。
      const allGuests = [...(item.guests || []), ...((item.sessions || []).flatMap(s => Array.isArray(s.guests) ? s.guests : []))];

      // 搜尋索引（3-1）：舊 JSON shape + Directus shape 全納入（否則 Directus 標題/講者/地點/城市/場次搜不到＝功能 bug）。
      // ⚠️ 移到 locationRows/cityEn/allGuests 宣告「之後」（原本在前面、拿不到這些）。舊欄位全保留（LKG 舊 shape 相容）。
      const searchText = [
        item.title, item.title_zh, item.title_en, item.titleEn, item.titleZh,       // 標題（舊+Directus）
        item.subtitle, item.subtitle_zh, item.subtitleEn, item.subtitleZh,          // 副標（舊+Directus）
        ...subList.flatMap(s => [s.en, s.zh]),
        item[introField], item[introField + '_zh'],
        item.description, item.descriptionZh,
        item.location, item.location_zh,
        ...locationRows.flatMap(l => [l.en, l.zh]),                                  // Directus locations[] venue
        cityEn, cityZh,                                                              // conference 城市
        ...allGuests.flatMap(g => [g.name, g.name_zh, g.affiliation, g.affiliation_zh, g.akaEn, g.akaZh, g.nameEn, g.nameZh, g.orgEn, g.orgZh]),  // 講者名/單位（舊+Directus、含 session 講者）
        ...(item.sessions || []).flatMap(s => [s.titleEn, s.title_en, s.titleZh, s.title_zh, s.title]),  // 場次標題
      ].filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');

      // uk→gb：flag-icons 只認 ISO 3166 的 gb，編輯常填 UK（2026-07-04 實例）→ fi-uk 不存在渲染成空盒
      // guest 個人國家 + 所屬單位國家（orgCountry）都納入（expand 兩排各有旗、標題也要一併抓；2026-09-01）
      const _normCode = c => (c || '').toLowerCase().trim().replace(/^uk$/, 'gb');
      const countryCodes = [...new Set(allGuests.flatMap(g => [_normCode(g.country), _normCode(g.orgCountry)]).filter(Boolean))];

      const itemFlags = alwaysExpanded ? 'data-no-accordion' : 'data-pre-reveal';
      // meta-icons inner（alumni + 全部國旗）共用內容：桌面 render 在右上 group、手機另 render 一份在副標下方 in-flow 區塊
      // （user 2026-06-10 #1/#2/#4：手機把國旗移出右上絕對定位群組→ in-flow 才能「在 title+副標之後進場、不位移、share 無 gap、靠左」；
      //  桌面維持原樣＝雙份 render，CSS 依 viewport 顯隱：桌面顯 .list-header-meta-icons、手機顯 .list-header-meta-mobile）
      // icon 統一放 header（對齊 workshop），不再每場次 title 旁各放一個。講者來源同上 allGuests（已含 session）。
      const _isAlumniGuest = g => g.isAlumni === 'on' || g.isAlumni === true || g.isAlumni;
      const _hasAlumni = showAlumniIcon && allGuests.some(_isAlumniGuest);
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
          <div class="list-header ${alwaysExpanded ? '' : 'cursor-pointer'} group transition-colors duration-fast flex items-stretch justify-between gap-sm px-sm py-sm">
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
                    ${showShareBtn ? `<button data-share-btn aria-label="分享 Share" class="inline-flex items-center self-start">
                      <span class="icon icon-share icon-s"></span>
                    </button>` : ''}
                    <!-- 無障礙：chevron 包成 <button class="list-header-toggle"> = accordion 的鍵盤展開觸發
                         （與 share button 同為 .list-reveal-row 的兄弟、互不巢狀；.list-header 本身不再是 button）。
                         aria-expanded 由 list-accordion.js 同步；CSS .list-header-toggle 清掉 button 預設樣式。 -->
                    <button type="button" class="list-header-toggle flex-shrink-0 self-start" aria-expanded="false" aria-label="展開或收合詳情 Toggle details" style="overflow:clip; height:1.5em; width:1.5em;">
                      <div class="flex justify-center items-start w-full h-full">
                        <!-- rotation 全由 GSAP 驅動（list-accordion.js open/close）：不要再掛 CSS transition-transform，
                             否則 CSS transition 會追著 GSAP 每幀寫的 transform 跑＝雙重緩動，chevron 旋轉變成
                             「前段幾乎不動→中段暴衝→尾段又慢」的 S 型、總長 ~580ms（DUR.fast 應為 300ms），
                             實測移除後乾淨 ~250ms（user 2026-06-15）。-rotate-90 是初始態＝收合朝下（base 朝左：-90=下/90=上）-->
                        <span class="icon icon-chevron-list icon-s -rotate-90"></span>
                      </div>
                    </button>
                  </div>
                </div>`;
              })()}
            </div>
            ${_hasMeta ? `<!-- 手機用：國旗(+alumni) in-flow 區塊，CSS flex-wrap 後 flex-basis:100% 排到 title row 下一行（在 title+副標之後進場、不位移、靠左、share 無 gap）。桌面 CSS 隱藏 -->
            <div class="list-header-meta-mobile list-reveal-row flex items-center gap-sm">${metaMobileInner}</div>` : ''}
          </div>
          <div class="list-content ${alwaysExpanded ? '' : 'h-0 overflow-hidden'}">
            ${bodyField && item[bodyField] ? `
            <div class="pt-sm pb-lg px-sm flex flex-col gap-md">
              <div class="admission-body flex flex-col gap-md">${normalizeBodyHtml(item[bodyField])}</div>
            </div>` : `
            <div class="pt-sm pb-lg px-sm grid gap-gutter items-start" style="grid-template-columns: 10fr 2fr;">
              <div class="flex flex-col gap-md pr-2xl">
                ${showDate && dateDisplay && !dateInHeader && dateFullWidth ? `<div>
                  <p class="text-s font-bold${dateDisplayZh ? ' mb-en-zh-s' : ''}">${dateDisplay}</p>
                  ${dateDisplayZh ? `<p class="text-s font-bold">${dateDisplayZh}</p>` : ''}
                </div>` : ''}
                ${(((showDate && dateDisplay && !dateInHeader && !dateFullWidth)) || (showLocation && locationRows.length) || (showLocation && (cityEn || cityZh))) ? (() => {
                  // 摘要列 grid：[date 連續時間寬 | venue(location) | city]
                  //   - date col 永遠寬到「連續時間」格式（單日 item 留白同欄寬），venue 起始點對齊
                  //   - venue 一行（多城市 ' / ' join），name 過長走 list-title-marquee
                  //   - city（conference 才填）= 第三欄，桌面固定 6rem 寬靠左對齊，與下方 guest 國家欄
                  //     （.guest-row-grid 桌面 6rem，同右緣 → 同左緣起始 x）對齊（user 2026-06-20）。
                  //     過長走 list-title-marquee（同 venue/country）。手機由 CSS !important stack 單欄左靠，不受此寬度影響。
                  //     無 city 時維持兩欄不變（不影響其他 section）。
                  // 國家由標題國旗表示（來源 = guests）。user 2026-06-03 重設計；2026-06-05 加 city 欄。
                  // dateFullWidth（permanent exhibitions）：date 其實是頻率說明（"Once per semester"）非真實日期，
                  //   已在上方獨立 full-width 渲染（不進 14ch 欄、不 marquee），這裡不再當 date cell。
                  const showDateCell = showDate && dateDisplay && !dateInHeader && !dateFullWidth;
                  const hasCity = showLocation && !!(cityEn || cityZh);
                  const cols = hasCity ? `${dateColMinWidth} 1fr 6rem` : `${dateColMinWidth} 1fr`;
                  return `<div class="grid items-start gap-x-xs" style="grid-template-columns: ${cols};">
                    ${showDateCell ? `<div class="min-w-0">
                      <div class="list-title-marquee${dateDisplayZh ? ' mb-en-zh-s' : ''}"><p class="text-s font-bold">${dateDisplay}</p></div>
                      ${dateDisplayZh ? `<div class="list-title-marquee"><p class="text-s font-bold">${dateDisplayZh}</p></div>` : ''}
                    </div>` : '<div></div>'}
                    ${showLocation && locationRows.some(l => l.en || l.zh) ? `<div class="min-w-0 list-summary-mq-col">
                      ${locationRows.filter(l => l.en || l.zh).map((l, i, arr) => `<div${i < arr.length - 1 ? ' style="margin-bottom: var(--spacing-xs, 8px)"' : ''}>
                        ${l.en ? `<div class="list-title-marquee${l.zh ? ' mb-en-zh-s' : ''}"><p class="text-s font-bold">${l.en}</p></div>` : ''}
                        ${l.zh ? `<div class="list-title-marquee"><p class="text-s font-bold">${l.zh}</p></div>` : ''}
                      </div>`).join('')}
                    </div>` : '<div></div>'}
                    ${hasCity ? `<div class="min-w-0 list-city-cell list-summary-mq-col">
                      ${cityEn ? `<div class="list-title-marquee mb-en-zh-s"><p class="text-s font-bold">${cityEn}</p></div>` : ''}
                      ${cityZh ? `<div class="list-title-marquee"><p class="text-s font-bold">${cityZh}</p></div>` : ''}
                    </div>` : ''}
                  </div>`;
                })() : ''}
                ${buildSessionsHtml(item, dateColMinWidth, { showGuestCountry, showGuestAffiliation })}
                <!-- parent item.guests：只在「session 沒帶講者」時渲染。conference 慣例＝講者填 session 裡；
                     若某 session 已有講者，parent guests 就是重複來源 → 抑制（避免 session 講者 + parent 各出一份）。
                     但 session 沒填講者（如 Lecture Series 只有 session 標題）時 parent guests 照出，資料不被藏。 -->
                ${item.guests?.length && !(item.sessions || []).some(s => Array.isArray(s.guests) && s.guests.length) ? `<div class="flex flex-col gap-sm">
                  ${item.guests.map(g => buildGuestHtml(g, { showGuestCountry, showGuestAffiliation })).join('')}
                </div>` : ''}
                ${showDescription && (introEn || introZh) && !(Array.isArray(item.sessions) && item.sessions.length) ? `<div class="overflow-y-auto pr-xl list-scroll" style="max-height: 250px;">
                  ${introEn ? `<p class="text-s leading-base${introZh ? ' mb-en-zh-body' : ''}">${introEn}</p>` : ''}
                  ${introZh ? `<p class="text-s leading-base" lang="zh-Hant">${introZh}</p>` : ''}
                </div>` : ''}
              </div>
              ${showPoster ? buildPosterHtml(item) : ''}
            </div>
            <!-- albums（年份/日期/地點 + 相簿）移出 9.5fr 文字欄、以 px-sm 對齊左緣的全寬 block：
                 常設展文字保持窄欄、下方相簿列滿版到容器右緣（user 2026-07-14）。只有 permanent-exhibitions 有 albums。
                 pb-sm：底部留白讓 album 區塊（含內部 scroll list）不貼到 divider。
                 有 albums 才渲染 wrapper：否則空 div 的 pb-sm 會在其他 list 的 grid↔gallery 間多塞空間。 -->
            ${(() => {
              const albumsHtml = buildAlbumsHtml(item, { unbounded: alwaysExpanded });
              return albumsHtml ? `<div class="px-sm pb-sm">${albumsHtml}</div>` : '';
            })()}`}
            ${buildGalleryHtml(item)}
            ${attachmentsField && Array.isArray(item[attachmentsField]) && item[attachmentsField].length ? `
            <div class="list-ref-wrap flex flex-col">
              ${item[attachmentsField].map((a, i) => {
                // 兼容三種來源：legacy JSON { url }、上傳 PDF { file }、貼的外部連結 { link }
                // 判型：有 link → 外部連結（開新分頁）；否則當上傳檔（download 下載）
                const link = a.link || '';
                const fileUrl = a.url || a.file || '';
                const isLink = !!link;
                const url = link || fileUrl || '#';
                const labelEn = a.labelEn || a.titleEn || `Attachment ${i + 1}`;
                const labelZh = a.labelZh || a.titleZh || `附件 ${i + 1}`;
                // 上傳檔：download 屬性指定 filename（URL 尾段）；外部連結：開新分頁不下載
                const filename = (!isLink && url !== '#') ? url.split('/').pop().split('?')[0] : '';
                const linkAttrs = isLink ? ' target="_blank" rel="noopener"' : (filename ? ` download="${filename}"` : '');
                // 版型同 ref：icon + 每筆各自「Attachment／附件」副標在上、附件名在下。
                return `
                <a class="list-ref-btn cursor-pointer w-full flex gap-md items-start py-sm px-sm no-underline" href="${url}"${linkAttrs}>
                  <div class="flex-shrink-0" style="padding-top: 0.25em;">
                    <span class="icon icon-attachment icon-m"></span>
                  </div>
                  <div class="flex-1 flex flex-col min-w-0">
                    <div class="list-ref-label mb-en-zh-s">
                      <p class="text-s">Attachment</p>
                      <p class="text-s">附件</p>
                    </div>
                    <p class="text-s font-bold mb-en-zh-s">${labelEn}</p>
                    <p class="text-s font-bold">${labelZh}</p>
                  </div>
                </a>
              `;}).join('')}
            </div>` : ''}
            ${showReference && references.length ? `
            <div class="list-ref-wrap flex flex-col">
              ${references.map(ref => `
              ${ref.pdfUrl
                ? `<button class="list-ref-btn cursor-pointer border-none w-full flex gap-md items-start py-sm px-sm text-left"
                    data-ref-pdf-url="${ref.pdfUrl}"
                    data-ref-title-en="${(ref.titleEn || '').replace(/"/g, '&quot;')}"
                    data-ref-title-zh="${(ref.titleZh || '').replace(/"/g, '&quot;')}"
                    data-ref-host-section="${hostSection || ''}"
                    data-ref-host-item="${item.id || ''}">`
                : ref.pressMedia
                ? `<button class="list-ref-btn cursor-pointer border-none w-full flex gap-md items-start py-sm px-sm text-left"
                    data-ref-press-media="${JSON.stringify(ref.pressMedia).replace(/"/g, '&quot;')}"
                    data-ref-title-en="${(ref.titleEn || '').replace(/"/g, '&quot;')}"
                    data-ref-title-zh="${(ref.titleZh || '').replace(/"/g, '&quot;')}">`
                : ref.href
                ? `<a class="list-ref-btn cursor-pointer w-full flex gap-md items-start py-sm px-sm no-underline" href="${ref.href}">`
                : `<button class="list-ref-btn cursor-pointer border-none w-full flex gap-md items-start py-sm px-sm text-left"
                    data-ref-section="${ref.section || ''}"
                    data-ref-item="${ref.itemId || ''}">`
              }
                <div class="flex-shrink-0" style="padding-top: 0.25em;">
                  <span class="icon icon-ref-list icon-s"></span>
                </div>
                <div class="flex-1 flex flex-col min-w-0">
                  ${ref.labelEn || ref.labelZh ? `<div class="list-ref-label mb-en-zh-s">
                    ${ref.labelEn ? `<p class="text-s">${ref.labelEn}</p>` : ''}
                    ${ref.labelZh ? `<p class="text-s">${ref.labelZh}</p>` : ''}
                  </div>` : ''}
                  ${ref.titleEn ? `<div class="list-title-marquee mb-en-zh-s"><p class="text-s font-bold">${ref.titleEn}</p></div>` : ''}
                  ${ref.titleZh ? `<div class="list-title-marquee"><p class="text-s font-bold" lang="zh-Hant">${ref.titleZh}</p></div>` : ''}
                </div>
              ${ref.href && !ref.pdfUrl ? `</a>` : `</button>`}
              `).join('')}
            </div>` : ''}
          </div>
          ${dividerHtml}
        </div>
      `;
  };

  // 開一個「空」年份組骨架（year col + 空 .list-year-items），插入 container，回傳可 append item 的元素。
  // itemsHtml 改由外層逐筆 append（sync 一次灌完；streamed 分幀灌）→ 建構可切段、主執行緒不凍。
  // 結構：year col 是「組件」，存在才包 grid-12 + 套 col-2/pl-41 gap；不存在則 list 純 flex flush-left。
  // list-year-label：toggle／非 toggle 兩變體共用的 hook class；list-year-toggle 保留 toggle 專屬行為（收合/sticky/chevron）。
  // beforeEl（lazy 用）：把年份組插在該錨點之前（尾端 sentinel），讓 sentinel 恆在最底；不傳＝beforeend（原路徑）
  const openYearGroup = (yearGroup, index, isLast, beforeEl = null) => {
    const yearColHtml = showYearToggle
      ? `<div class="col-span-12 md:col-span-1 md:col-start-1 list-year-toggle list-year-label cursor-pointer flex items-center gap-sm order-1 pt-sm pb-md pl-xs md:sticky md:self-start md:pb-sm">
          <div class="list-reveal-row flex justify-center items-center w-[1.5em] h-[1.5em] flex-shrink-0"><span class="icon icon-chevron-list icon-s transition-all duration-fast rotate-90"></span></div>
          <span class="list-reveal-row inline-block text-lg font-bold">${yearGroup.year}</span>
        </div>`
      : `<div class="col-span-12 md:col-span-1 md:col-start-1 list-year-label flex items-center order-1 pt-sm pb-md pl-xs">
          <span class="list-reveal-row inline-block text-lg font-bold">${yearGroup.year}</span>
        </div>`;
    const groupHtml = hideYearHeader
      ? `<div class="list-year-items flex flex-col"></div>`
      : `<div class="list-year-group grid-12 items-start">
          ${yearColHtml}
          <div class="col-span-12 md:col-span-11 md:col-start-2 list-year-items flex flex-col order-2 mt-md md:mt-0 md:pl-[41px]"></div>
        </div>`;
    const sep = !isLast ? '<div class="activities-separator list-reveal-row border-b-4 border-black" style="height:4px"></div>' : '';
    let groupEl;
    if (beforeEl) {
      beforeEl.insertAdjacentHTML('beforebegin', groupHtml + sep);
      groupEl = /** @type {HTMLElement} */ (sep ? beforeEl.previousElementSibling.previousElementSibling : beforeEl.previousElementSibling);
    } else {
      container.insertAdjacentHTML('beforeend', groupHtml + sep);
      // 剛插入的年份組＝有 sep 時倒數第 2、無 sep 時最後一個
      groupEl = /** @type {HTMLElement} */ (sep ? container.children[container.children.length - 2] : container.children[container.children.length - 1]);
    }
    return hideYearHeader ? groupEl : /** @type {HTMLElement} */ (groupEl.querySelector('.list-year-items'));
  };

  // sticky top updater（year toggle / list-header sticky top 緊接 filter bar 下方；lazy 每批新年份組要重設 → 抽成可重呼叫）
  // --list-header-sticky-top 由 lists.css `.list-header` sticky 規則讀；ResizeObserver 跟 filter-bar 高度變化同步。
  // 非 sticky bar（admission 手機 / 矮橫向 static bar）不設 → CSS fallback 沿用。
  const filterBar = /** @type {HTMLElement | null} */ (panelSelector
    ? document.querySelector(`${panelSelector} .activities-filter-bar`)
    : container.closest('.activities-panel')?.querySelector('.activities-filter-bar'));
  const filterBarSticky = !!filterBar && getComputedStyle(filterBar).position === 'sticky';
  const stickyActive = window.innerWidth >= 768 || filterBarSticky;
  // 六輪 2-D：bar 量測快取。buildOneBatch 每批呼叫 updateStickyTop，若每次都讀 filterBar.offsetHeight＝
  //   剛被批次弄髒的 DOM 上 forced recalc（profiler self 8s）。bar 高只在「bar 自己 resize」時變（bar-hidden/
  //   搜尋收合/viewport），由下方 ResizeObserver 專責失效重量；批次只改 list DOM、bar 高不變 → 用快取零讀取。
  let _barH = -1, _barTop = 0, _refreshTid = 0;
  const measureBar = () => { _barH = filterBar ? filterBar.offsetHeight : 0; _barTop = filterBar ? (parseFloat(getComputedStyle(filterBar).top) || 0) : 0; };
  const updateStickyTop = () => {
    if (!stickyActive) return;
    if (_barH < 0) measureBar();
    const top = filterBar ? _barTop + _barH - 1 : _barTop;
    container.style.setProperty('--list-header-sticky-top', top + 'px');
    if (showYearToggle) container.querySelectorAll('.list-year-toggle').forEach((/** @type {any} */ el) => { el.style.top = top + 'px'; });
    // 九輪 Part 4：pin-IO 重建改 trailing debounce——bar 收合 0.3s transition 讓 RO 每幀 fire，每次 refresh 都重建
    //   pin-IO（getListStickyTop 讀 computed）＝髒 DOM forced recalc（4x 實測 getPropertyValue self 1.5s）。var／
    //   year-toggle top 仍每幀純寫跟 bar 平滑走；pin-IO 等值穩定、DOM 乾淨才一次重建（08-16「保留 is-pinned」續章）。
    clearTimeout(_refreshTid);
    _refreshTid = setTimeout(() => refreshStickyPinObservers(container), 150);
  };
  const installStickyObserver = () => {
    updateStickyTop();
    if (filterBar && stickyActive && typeof ResizeObserver !== 'undefined') {
      // 九輪 Part 4：RO 回呼零讀取——直接取 entry.borderBoxSize（免 measureBar 的 offsetHeight forced layout，
      //   bar-hidden transition 每幀 fire 才不砸動畫窗）；極舊瀏覽器無 borderBoxSize 才 fallback measureBar。
      new ResizeObserver((entries) => {
        const bs = entries[entries.length - 1]?.borderBoxSize?.[0];
        if (bs) _barH = bs.blockSize; else measureBar();
        updateStickyTop();
      }).observe(filterBar);
      // _barTop（computed top）只跟 viewport 變 → window resize 失效重讀（_barH=-1 → 下次 updateStickyTop 走 measureBar 全量）
      const onResize = () => { _barH = -1; updateStickyTop(); };
      window.addEventListener('resize', onResize);
      registerPageCleanup(() => { window.removeEventListener('resize', onResize); clearTimeout(_refreshTid); });
    }
  };

  // 灰白交叉斑馬紋：全列「連續」計數（跨年份組）→ 偶數索引套淺灰。純 CSS nth-child 在各 .list-year-items 內重算
  // 無法跨組，故 JS 全域標記；lazy 用 container._zebraIdx 連續計數讓捲入批次接續正確深淺。
  const setZebra = (el) => { el.classList.toggle('list-item-zebra', (container._zebraIdx || 0) % 2 === 0); container._zebraIdx = (container._zebraIdx || 0) + 1; };

  const LAZY_THRESHOLD = 24, FIRST_BATCH = 15, LAZY_BATCH = 10;
  const totalItemCount = filteredData.reduce((n, g) => n + g.items.length, 0);
  const useLazy = lazy && !hideYearHeader && totalItemCount > LAZY_THRESHOLD && typeof IntersectionObserver !== 'undefined';

  if (!useLazy) {
    // 一次建完（原路徑：alumni/admission/小清單）→ ref 全部先解（清單小、無妨）
    await resolveRefsFor(allItemsFlat);
    filteredData.forEach((yearGroup, index) => {
      const itemsEl = openYearGroup(yearGroup, index, index === filteredData.length - 1);
      itemsEl.insertAdjacentHTML('beforeend',
        yearGroup.items.map((item, itemIdx) => buildItemHtml(item, itemIdx, yearGroup.items.length)).join(''));
    });
    installStickyObserver();
    container.querySelectorAll('.list-item').forEach((el, i) => el.classList.toggle('list-item-zebra', i % 2 === 0));
    bindFlagCycles(container);
    return bindInteractions(container, { autoReveal });
  }

  // ── lazy 路徑：只建第一批，其餘靠尾端 sentinel 的 IntersectionObserver 捲近才續建 ──
  // 每次切換/reveal/exit 的工作量恆定在「已渲染的那批」而非整份(exhibitions 535 row) → 切換不再正比 row 數。
  const scroller = /** @type {HTMLElement | null} */ (container.closest('.inner-scroll-scroll-col'));
  const flat = filteredData.flatMap((yg, index) =>
    yg.items.map((item, itemIdx) => ({ item, itemIdx, total: yg.items.length, yg, index, isLast: index === filteredData.length - 1 })));
  const openYears = new Map();
  container._zebraIdx = 0;
  let cursor = 0;

  // 尾端 sentinel（1px、永不隱藏）：新年份組一律插在它之前，它恆在最底 → IO 觀察它，避開「第一批被 reveal
  // 的 yPercent 藏起、觀察 .list-item 量不到、單次 fire 不續建」等問題。
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'height:1px;width:100%;flex:0 0 auto;';
  container.appendChild(sentinel);

  const renderBatch = (count) => {
    const newItems = [];
    const end = Math.min(cursor + count, flat.length);
    for (; cursor < end; cursor++) {
      const e = flat[cursor];
      let itemsEl = openYears.get(e.index);
      if (!itemsEl) { itemsEl = openYearGroup(e.yg, e.index, e.isLast, sentinel); openYears.set(e.index, itemsEl); }
      itemsEl.insertAdjacentHTML('beforeend', buildItemHtml(e.item, e.itemIdx, e.total));
      const newItem = /** @type {HTMLElement | null} */ (itemsEl.lastElementChild);
      if (newItem) { setZebra(newItem); newItems.push(newItem); }
    }
    return newItems;
  };

  // 先解「首批」的 ref → 建首批 → 其餘 ref 背景解（P1-5 後 resolveRef 同步純填 label、即時；保留分批結構與 render 呼叫相容）。
  await resolveRefsFor(flat.slice(0, FIRST_BATCH).map(e => e.item));
  renderBatch(FIRST_BATCH);
  installStickyObserver();
  bindFlagCycles(container);
  const ret = bindInteractions(container, { autoReveal, deferBinds: true });
  if (cursor < flat.length) resolveRefsFor(flat.slice(FIRST_BATCH).map(e => e.item)).catch(() => {});

  if (cursor < flat.length) {
    let io = /** @type {IntersectionObserver | null} */ (null);
    // reveal-IO（捲入的 row 進到 scroller viewport 才 clip-reveal 進場，非一載入就直接現）：
    // batch 在 sentinel 提前 600px 就建好但先藏，捲到才逐 item 揭 → 有「scroll in view 的進場動畫」。
    const revealIo = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const it = /** @type {HTMLElement} */ (e.target);
        revealIo.unobserve(it);
        const rows = [...it.querySelectorAll('.list-reveal-row')];
        if (typeof gsap !== 'undefined') {
          // 斑馬底色 clip-reveal（由下往上揭，比照 switch reveal）→ 文字 clip-reveal 滑入
          // B-1：zebra 改 CSS transition（compositor，longtask 不凍幀）；hide 在 buildOneBatch 設好、IO 隔幀才 fire＝起點已 commit → 同步設可 transition
          if (it.classList.contains('list-item-zebra')) {
            const zg = 'a' + (++_zbGen); it.dataset.zbGen = zg;   // 六輪：換代（退場的 'd' 代會蓋掉、比對不符＝作廢本 clrZebra）
            it.style.transition = `clip-path ${DUR.base}s ease-out`;
            it.style.clipPath = 'inset(0% 0% 0% 0%)';
            const clrZebra = (e) => { if (it.dataset.zbGen !== zg) { it.removeEventListener('transitionend', clrZebra); return; } if (e.target !== it || e.propertyName !== 'clip-path') return; it.style.transition = ''; it.style.clipPath = ''; it.removeEventListener('transitionend', clrZebra); };
            it.addEventListener('transitionend', clrZebra);
          }
          if (rows.length) { revealRows(rows, { dur: DUR.reveal, stagger: 0.12, onDone: () => it.removeAttribute('data-pre-reveal') }); return; }  // Part 1：CSS transition
        }
        it.removeAttribute('data-pre-reveal');
      });
    }, { root: scroller || null, rootMargin: '0px 0px -8% 0px' }) : null;
    if (revealIo) registerPageCleanup(() => revealIo.disconnect());
    // 一批建構（renderBatch + 補綁 + 藏新 row + revealIo.observe + sticky/accordion 重跑）＝捲動 fill 與 idle 背景補建共用同一條，
    // 確保 idle 建的也「先藏、進視窗才 reveal」＝視覺與捲動建的零差異（3-2）。
    const buildOneBatch = () => {
      const newItems = renderBatch(LAZY_BATCH);
      bindInteractions(container, { autoReveal: false, incremental: true });   // 逐批補綁互動 + wrap 新 row
      // 捲入 row 先藏(setupClipReveal 尊重 reduce-motion)，交給 reveal-IO 進視窗才 clip-reveal；無 IO fallback 直接現
      newItems.forEach(it => {
        const bRows = [...it.querySelectorAll('.list-reveal-row')];
        setupClipReveal(bRows, { hide: false });  // Part 1：只 wrap 遮罩
        hideRows(bRows, false);                    // CSS 藏（reveal-IO 進視窗才 revealRows）
        // ⚠️斑馬底色也要一起藏(clip inset 100%)：否則「文字藏起但底色塊還在」→ 退場/切換時殘留色塊(user 2026-08-31)
        if (revealIo && it.classList.contains('list-item-zebra') && typeof gsap !== 'undefined' && !prefersReducedMotion()) { it.dataset.zbGen = 'a' + (++_zbGen); it.style.transition = 'none'; it.style.clipPath = 'inset(100% 0% 0% 0%)'; }  // B-1：transition:none 直寫，揭時 revealIo 才設 CSS transition（六輪：hide 也換代）
        if (revealIo) revealIo.observe(it); else it.removeAttribute('data-pre-reveal');
      });
      updateStickyTop();                                                        // 新年份組的 sticky top
      if (typeof onLazyBatch === 'function') onLazyBatch();                     // 重跑 accordion / year-toggle init（idempotent）
    };
    // sentinel 進到 scroller viewport 下緣 +600px 內就補下一批，並 loop 補到「餘量 >600px」或全部建完
    //（單次 IO fire 只補一批，內容仍短時 sentinel 還在框內卻不會再 fire → 用 loop 一次補足視窗餘量）。
    let fillDeferred = false;
    const fill = (retries = 0) => {
      if (!container.isConnected) return;
      // 九輪 Part 2：開合動畫中讓路（idleBuild 已有同 gate、fill 漏了——align 捲動把 sentinel 拉進 600px 邊界就同步連建 2 批
      //   685ms 砸動畫窗）。spacer 已撐住捲動空間＝晚建不跳版；建出的 item 仍 born-hidden + reveal-IO 進場（非 pop）。
      //   ⚠️不 gate 切換窗（__sccdActSwitchBusyUntil）：切入新 section 首屏不足時 fill 必須立刻補＝正確性。
      if (isAccordionBusy()) {
        if (!fillDeferred) { fillDeferred = true; setTimeout(() => { fillDeferred = false; fill(); }, 300); }
        return;
      }
      const vb = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      // vb<=0：panel 剛 display:none→顯示、版面還沒 flush（IO 可能早於 layout fire）→ 下一幀重試幾次，
      // 避免「切回已載入的 panel、內容剛好填滿視窗沒得捲」時初次 fill 撲空、之後不再補。仍隱藏就放棄（IO 之後會再 fire）。
      if (vb <= 0) { if (retries < 3) requestAnimationFrame(() => fill(retries + 1)); return; }
      let guard = 0;
      while (cursor < flat.length && guard++ < 60) {
        buildOneBatch();
        if (sentinel.getBoundingClientRect().top > vb + 600) break;              // 視窗下緣已有 >600px 緩衝 → 停
      }
      if (cursor >= flat.length && io) { io.disconnect(); sentinel.remove(); }
    };
    io = new IntersectionObserver((entries) => {
      if (!container.isConnected) { io.disconnect(); return; }
      if (entries.some(e => e.isIntersecting)) fill();
    }, { root: scroller || null, rootMargin: '600px 0px' });
    io.observe(sentinel);
    registerPageCleanup(() => io && io.disconnect());

    // deep-link（navigateToItem）需要目標 item 已在 DOM：暴露「立即全建剩餘」給它呼叫（否則只在首批的目標找不到）。
    // deep-link 是刻意的單一導航（首頁浮卡跳指定活動）→ 該次全建可接受；一般切換仍走 lazy。
    container.dataset.lazyList = '1';
    // 八輪 Part 3：有 targetDomId（deep-link）走「分幀建到目標」＝不管目標多深都零大 task（每幀 ~8ms budget 建 1~2 批、
    //   rAF 續跑，建到目標或全建完 resolve）；無參數（search / ensureFullyRendered）維持同步全建＝語意不變。
    //   ⚠️ 沒建完就找到目標時 io/idle 不拆，餘量照常背景續建（只有 cursor>=flat.length 才 disconnect）。
    container._lazyRenderAll = (targetDomId = null) => {
      const buildOne = () => {
        const ni = renderBatch(LAZY_BATCH);
        bindInteractions(container, { autoReveal: false, incremental: true });
        ni.forEach(it => it.removeAttribute('data-pre-reveal'));
      };
      const finish = () => {
        updateStickyTop();
        if (typeof onLazyBatch === 'function') onLazyBatch();
        if (cursor >= flat.length && io) io.disconnect();
      };
      if (!targetDomId) {   // search／ensureFullyRendered：同步全建（語意不變）
        while (cursor < flat.length && container.isConnected) buildOne();
        finish();
        return Promise.resolve(true);
      }
      return new Promise(resolve => {   // deep-link：分幀建到目標
        const step = () => {
          if (!container.isConnected) { resolve(false); return; }
          const budget = performance.now() + 8;
          while (cursor < flat.length && performance.now() < budget) {
            buildOne();
            if (document.getElementById(targetDomId)) { finish(); resolve(true); return; }
          }
          if (cursor >= flat.length) { finish(); resolve(true); return; }
          requestAnimationFrame(step);
        };
        step();
      });
    };

    // 3-2：首批 reveal 後閒置分批把剩餘全建 → search 首鍵多數已全建＝零凍結、deep-link 免同步全建。
    // 每 idle slot 只建「一批」（含 setupClipReveal first-touch computed read，多批一 slot 會卡）；走 buildOneBatch＝
    // 與捲動建的同一條（先藏、進視窗才 reveal），視覺零差異。panel 隱藏時暫停、下個 slot 續（週期重試、不掛 MutationObserver）。
    // ⚠️ 帶 timeout：activities 頁常駐動畫（marquee/flag cycle）讓瀏覽器幾乎無真正 idle → 純 requestIdleCallback 會餓死。
    //   四輪 Part 2：timeout 500→2000＝讓路優先（全建慢十幾秒無妨，search 前有 ensureFullyRendered 兜底），
    //   background 補建不再每 ~2s 撞進使用者捲動/hover 窗口凍一下（user 實機回報「往下捲卡頓」的主因）。
    const ric = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(fn, 300);
    // 互動讓路：記最後捲動時間，idleBuild 開頭若「剛捲過（<400ms）」就延後，不跟捲動搶主執行緒。
    let lastScrollTs = 0;
    if (scroller) {
      const onScrollTs = () => { lastScrollTs = performance.now(); };
      scroller.addEventListener('scroll', onScrollTs, { passive: true });
      registerPageCleanup(() => scroller.removeEventListener('scroll', onScrollTs));
    }
    let idleHandle = /** @type {any} */ (0);
    const idleBuild = () => {
      if (!container.isConnected) return;                                        // 離頁停
      if (cursor >= flat.length) { if (io) { io.disconnect(); sentinel.remove(); } return; }  // 全建完 → 收尾（同 fill）
      if (container.offsetParent === null) { idleHandle = setTimeout(idleBuild, 400); return; }  // panel 隱藏 → 稍後重試
      if (performance.now() - lastScrollTs < 400) { idleHandle = setTimeout(idleBuild, 450); return; }  // Part 2：捲動中讓路，等停手再建
      if (isAccordionBusy()) { idleHandle = setTimeout(idleBuild, 450); return; }  // 六輪 2-A：開合動畫中讓路（等序列完再補建）
      if (performance.now() < (/** @type {any} */ (window).__sccdActSwitchBusyUntil || 0)) { idleHandle = setTimeout(idleBuild, 450); return; }  // 八輪 1-A：分頁切換中讓路（重活不疊進切換窗）
      buildOneBatch();
      idleHandle = ric(idleBuild);
    };
    // 延 ~2s 起跑（比照 1600ms defer 精神，不跟切換/進場動畫窗口搶主執行緒）
    idleHandle = setTimeout(idleBuild, 2000);
    registerPageCleanup(() => { clearTimeout(idleHandle); if (typeof window.cancelIdleCallback === 'function') { try { window.cancelIdleCallback(idleHandle); } catch (_) {} } });
  }
  return ret;
}

// ── Flag cycle: 多 country code 每 5s 切換 fi-XX class ──────────────────
// 對 `[data-flag-cycle="tw,jp,kr"]` 的 <span> 每 5s 切到下一個 country code
// 同個 container 反覆 init 安全（重綁前先 clear 舊 interval id）
const _FLAG_CYCLE_INTERVAL_MS = 5000;

// 換國旗 fi-XX class（移除所有舊 fi-、加新）
function setFlagClass(el, code) {
  [...el.classList].filter(c => c.startsWith('fi-')).forEach(c => el.classList.remove(c));
  el.classList.add('fi-' + code);
}
// 國旗切換＝真 clip-reveal（user 2026-09-03：位移＋遮罩，取代原 clip-path inset 原地擦除）：
// 舊旗往上「滑出」遮罩 → 換 class → 新旗從下「滑入」。遮罩＝bindFlagCycles 包的 .flag-cycle-mask
// （overflow:clip、inline-flex 貼身尺寸）。無 gsap fallback 直接換。
function clipRevealFlag(el, code) {
  if (typeof gsap === 'undefined') { setFlagClass(el, code); return; }
  gsap.killTweensOf(el);
  gsap.to(el, {
    yPercent: -110, duration: 0.18, ease: 'power2.in',
    onComplete: () => {
      setFlagClass(el, code);
      gsap.fromTo(el, { yPercent: 110 },
        { yPercent: 0, duration: 0.2, ease: 'power3.out', clearProps: 'transform' });
    },
  });
}
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
    // 真 clip-reveal 的遮罩：包一層貼身 inline-flex + overflow:clip，滑出/滑入的畫外部分被裁掉。
    // inline-flex 尺寸＝旗子本身（1.5em×1em），外層 flex row 的 gap/對齊不變；重綁 idempotent。
    if (!el.parentElement?.classList.contains('flag-cycle-mask')) {
      const mask = document.createElement('span');
      mask.className = 'flag-cycle-mask';
      mask.style.cssText = 'display:inline-flex;overflow:clip;';
      el.parentNode?.insertBefore(mask, el);
      mask.appendChild(el);
    }
    let idx = 0;
    const intervalId = setInterval(() => {
      idx = (idx + 1) % codes.length;
      clipRevealFlag(el, codes[idx]);
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
    introField: 'intro',
    showAlumniIcon: false,
    // user 定案：只要有標題就渲染（workshops / students-present 皆走此函式）
    allowNoMedia: true,
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

// 共用 fetch wrapper：endpoint → Directus（activities-source，含 M2A ref remap）+ 本地 fallback。
// 2026-07-17 起全部 activities list 類別接 Directus（後台空/掛掉自動 fallback 本地）。
// endpoint 名是各 loader 傳的舊式名（連字號單數），對應到實際 Directus collection（底線複數）見下表。
// stamp：dedicated collection 沒有 category/visitType/exhibitionType 欄，補上讓 loadListInto 的子類型 filter 過得了。
// permanent 展演（activities_exhibitions_permanent + _permanent_events）是 parent/child 巢狀 shape，
//   跟扁平 list 不同，尚未接（loadExhibitionsInto permanent 分支仍走本地）；degree-show 同理走自己的 loader。
const ACT_DIRECTUS_MAP = {
  'activities-competition':      { collection: 'activities_competitions', category: 'competitions' },
  'activities-industry':         { collection: 'activities_industry', sortByDate: true },  // press 式單一 year+monthDay，前台依日期排序
  'activities-workshop':         { collection: 'activities_workshops' },
  'activities-lecture':          { collection: 'activities_lectures' },
  'activities-students-present': { collection: 'activities_students_present' },
  'activities-conference':       { collection: 'activities_conferences', category: 'conferences' },
  'activities-exhibition-special': { collection: 'activities_exhibitions_special', category: 'exhibitions', stamp: { exhibitionType: 'special' } },
  'activities-visit-outbound':   { collection: 'activities_visits_outbound', category: 'visits', stamp: { visitType: 'outbound' } },
  'activities-visit-inbound':    { collection: 'activities_visits_inbound', category: 'visits', stamp: { visitType: 'inbound' } },
};
async function fetchActEndpointOrFallback(endpoint, fallbackUrl) {
  const m = ACT_DIRECTUS_MAP[endpoint];
  if (m) return loadActivityCollection(m.collection, fallbackUrl, { category: m.category, stamp: m.stamp, sortByDate: m.sortByDate });
  // Directus-only：全部 endpoint 都應在 ACT_DIRECTUS_MAP，走到這裡＝打錯 endpoint 名（programming error），別靜默吃本地假資料
  throw new Error(`[activities] unknown endpoint: ${endpoint}`);
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
    // user 定案：activities 清單只要有標題就渲染，不因缺 media 被濾掉（後台可先填標題、媒體之後補）
    allowNoMedia:         true,
    showAlumniIcon:       true,
    showDate:             !isIndustry,
    showDescription:      !isLectures && !isIndustry,
    showLocation:         !isIndustry,
    showPoster:           !isIndustry,
    showReference:        true,
    // showSubtitle 走 loadListInto 預設 true（有填才渲染）；lectures 例外從 guests 派生副標
    subtitleFromGuests:   isLectures,
    showGuestAffiliation: !isIndustry,
    // industry 的 guest＝合作單位，也顯示其國家（user 2026-08-27：後台已在 guests 填 country）；
    // affiliation 仍關（單位名就是 guest 本身、無另外的 org 欄）
    showGuestCountry:     true,
    panelSelector:        _panelSelectorMap[containerId] || '#panel-exhibitions',
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
  const [specialData, permanentData] = await Promise.all([
    fetchActEndpointOrFallback('activities-exhibition-special', '/data/general-activities.json'),
    loadPermanentExhibitions('/data/permanent-exhibitions.json'),
  ]);
  const fns = await Promise.all([
    loadListInto('exhibitions-list-special', '/data/general-activities.json', {
      categoryFilter: 'exhibitions',
      visitTypeFilter: 'special', visitTypeField: 'exhibitionType',
      // 後台可只填標題（媒體之後補）→ 沒圖也要渲染，別被媒體導向 filter 濾掉
      allowNoMedia: true,
      panelSelector: '#panel-exhibitions',
      data: specialData,
      ...options,
    }),
    // 常設展演（activities_exhibitions_permanent + _permanent_events 巢狀）→ loadPermanentExhibitions 攤成 albums shape。
    // dateFullWidth：permanent 的 date 是頻率說明（"Once per semester / 每學期舉辦一次"）非真實日期，
    //   要 full-width 顯示、不擠進 14ch date 欄、不 marquee（user 2026-06-05）。
    loadListInto('exhibitions-list-permanent', '/data/permanent-exhibitions.json', {
      hideYearHeader: true, dateFullWidth: true, showPoster: false,
      // 後台相簿圖片暫未上傳（媒體導向 list 預設濾掉無 media 項目）→ allowNoMedia 讓展演即使沒圖也顯示
      //（標題/頻率/description）；之後在 Directus 上傳 events.albumImages 會自動帶出相簿。
      allowNoMedia: true,
      panelSelector: '#panel-exhibitions',
      data: permanentData,
      ...options,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}

// init 期（hero 進場動畫進行中）預抓預設分頁 exhibitions 的資料填 single-flight cache：原本整個
// switchToSection（含這兩支 fetch）都 defer 到 hero gate 之後才跑 → fetch 落在關鍵路徑（實測 hero 播完後
// 還要再等 ~1.1s fetch 才 render）。fetch 是網路 I/O、不搶 hero 主執行緒，並行安全 → hero 播完 render 直接命中快取。
// fire-and-forget：.catch 吞掉暫態 rejection（真正的錯誤由 loadExhibitionsInto await 快取時交 switchToSection try/catch 處理）。
export function prefetchExhibitionsData() {
  fetchActEndpointOrFallback('activities-exhibition-special', '/data/general-activities.json').catch(() => {});
  loadPermanentExhibitions('/data/permanent-exhibitions.json').catch(() => {});
}

// 其餘分頁的資料也在閒置時預暖 single-flight cache（exhibitions 已由上面預抓）：目前每個未點過的分頁
// 都「點下去才 fetch」，弱機 Directus 冷啟 ~200ms-1.1s 疊在切換動畫上＝「切換 load 一陣子」的主因。
// 預暖後 loadPanel 內的 fetchActEndpointOrFallback 直接命中快取、免等網路。item JSON 輕量（非圖片），
// 但弱機怕並發 → 序列逐支抓最溫和；離頁（#activities-content-section 消失）即停，不為看不到的頁浪費請求。
// ponytail: 序列 warm 省弱機；若 warm-up 太慢再提高並發。
const _WARM_ENDPOINTS = [
  ['activities-competition', '/data/general-activities.json'],
  ['activities-conference', '/data/general-activities.json'],
  ['activities-lecture', '/data/lectures.json'],
  ['activities-industry', '/data/industry.json'],
  ['activities-visit-outbound', '/data/general-activities.json'],
  ['activities-visit-inbound', '/data/general-activities.json'],
  ['activities-workshop', '/data/workshops.json'],
  ['activities-students-present', '/data/students-present.json'],
];
export async function prefetchOtherActivitiesData() {
  for (const [ep, fb] of _WARM_ENDPOINTS) {
    if (!document.getElementById('activities-content-section')) return;  // 已離頁 → 停
    await fetchActEndpointOrFallback(ep, fb).catch(() => {});
  }
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
      // 後台可只填標題（媒體之後補）→ 沒圖也要渲染
      allowNoMedia: true,
      panelSelector: '#panel-visits',
      data: outboundData,
      ...options,
    }),
    loadListInto('visits-list-inbound', '/data/general-activities.json', {
      categoryFilter: 'visits', visitTypeFilter: 'inbound',
      allowNoMedia: true,
      panelSelector: '#panel-visits',
      data: inboundData,
      ...options,
    }),
  ]);
  return () => {
    fns.forEach(fn => { if (fn) fn(); });
  };
}
