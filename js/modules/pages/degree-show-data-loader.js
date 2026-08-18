/* global gsap, ScrollTrigger */
/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

import { initDegreeShowGallery } from './degree-show-gallery.js';
import { initHeroAnimation } from './hero-animation.js';
import { initHeroMobileSync } from './hero-mobile-sync.js';
import { animateCardsClipReveal, playRevealExit, setupClipReveal, playClipReveal, navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { createClassImagesSlideshow } from './about/class-images-slideshow.js';
import { getSectionData, findItemById, SECTION_LABELS } from './activities-data-loader.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { DUR, EASE } from '../ui/motion.js';
import { isHlsUrl, isDirectVideoUrl } from '../ui/video-player.js';
import { createLightboxVideo } from '../lightbox/lightbox-video.js';
import { loadDegreeShow } from './degree-show-source.js';
import { sitePath } from '../ui/site-base.js';

// 「用手機版做法」的 gate：直向手機（<768）＋矮橫向手機（同全站 landscape.css：orientation:landscape
// + max-height:500）。矮橫向手機寬常 ≥768 會誤吃桌面分支 → 併進來，detail 頁 body/hero 全走手機路徑。
function isMobileView() {
  return window.innerWidth < 768
    || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
}

// 標題色卡寬度 → 收到「換行後最寬一行 + 左右 padding」。inline-block + max-width 只把 max-width 當 wrap
// 上限，色卡實際寬仍會撐到 max-width（短末行右側空一大塊 accent 底）；用 Range 量 wrapped lines 取最寬行寫回
// width 收緊。隱藏（另一 viewport chip display:none）→ offsetParent null 跳過。hero 與上下屆標題共用。
function hugTitleBox(el) {
  const inner = el.querySelector('.dshow-title-inner');
  if (!inner || el.offsetParent === null) return;
  el.style.width = '';                               // 先還原 → 在 max-width 自然 wrap 下量（idempotent）
  void el.offsetWidth;
  const range = document.createRange();
  range.selectNodeContents(inner);
  let maxLineW = 0;
  for (const r of range.getClientRects()) if (r.width > maxLineW) maxLineW = r.width;
  if (maxLineW <= 0) return;
  const cs = getComputedStyle(el);
  el.style.width = `${Math.ceil(maxLineW + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight))}px`;
}
function hugHeroTitleWidths() {
  document.querySelectorAll('.dshow-hero-title').forEach(hugTitleBox);
}

// 上下兩個「旋轉的寬色卡」不重疊：旋轉後 bbox 角超出未旋轉版位（flex/gap 用未旋轉盒排），愈寬旋轉角愈大愈溢出
// → 上盒底角壓到下盒頂。量實際 bbox 間距、不足就補 margin-top 到下盒撐開＝隨標題寬度/角度縮放（短標題本就不疊、
// 補 0），比寫死 margin 好（寫死會讓短標題過度撐開）。必須在 hug（定寬）之後跑，寬度定了 bbox 才準。
function separateStacked(topEl, bottomEl, desired = 8) {
  if (!topEl || !bottomEl || bottomEl.offsetParent === null) return;   // 隱藏（另一 viewport）跳過
  bottomEl.style.marginTop = '';                                       // 先還原再量（idempotent）
  void bottomEl.offsetWidth;
  const gap = bottomEl.getBoundingClientRect().top - topEl.getBoundingClientRect().bottom;
  if (gap < desired) bottomEl.style.marginTop = `${Math.ceil(desired - gap)}px`;
}
// hero 英/中標題（rotate -2/-4°）：旋轉在 wrapper 上，量 wrapper。年份→EN 的 bbox 重疊是無害假象
// （年份窄靠左、EN 抬起的角在右、x 不交疊、視覺不撞）故只撐 EN→ZH。
function separateHeroTitles() {
  separateStacked(
    document.getElementById('text-title-en')?.closest('.hero-text-cn-wrapper'),
    document.getElementById('text-title')?.closest('.hero-title-wrapper'));
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
    // Directus activities_degree_show 為主，失敗 / 空 → fallback 本地 JSON（degree-show-source.js）
    const data = await loadDegreeShow();

    const container = document.getElementById(containerId);
    if (!container) return;

    const years = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // Sort years descending
    const colors = ['#FF448A', '#00FF80', '#26BCFF'];

    years.forEach((year, idx) => {
      const item = data[year];
      const color = colors[idx % colors.length];
      const titleEn = item.title_en || item.titleEn || '';
      const titleZh = item.title || item.titleZh || '';
      // 無 coverImage（如後台還沒傳封面）→ 灰底 placeholder，卡片仍有縮圖塊 + 標題不空掉（user 2026-08-17）
      const coverHtml = item.coverImage
        ? `<img src="${item.coverImage}" alt="Degree Show ${year}" loading="eager" class="degree-show-img w-full">`
        : `<div class="degree-show-img-placeholder" role="img" aria-label="Degree Show ${year}"></div>`;
      // .list-reveal-row 讓 setupAdmissionReveal + playAdmissionPanelReveal 接管進場
      //   → 跟 description / search bar 同一條 stagger timeline，無 hardcoded delay
      // img loading="eager"：cards 是首屏內容（degree-show panel 只有 3-5 張），lazy 會讓 wrapper
      //   render 時高度為 0 → clip-reveal 的 yPercent:100 = 0px 沒位移 = 視覺殘影
      //   eager 保證 layout 立刻可量
      // 比照 admission：年份欄＝獨立 label（非互動），斑馬列＝唯一 hover + click 單元（user 2026-08-17）。
      // 外框從 <a> 改 <div>（不再整個 grid 含年份都可點）；<a href> 只包內容斑馬列＝點擊區＝hover 區＝視覺列。
      // .list-reveal-group 留在外 <div>：年份 col-1 的 .list-reveal-row 沒 .list-item 祖先，靠此 hook 跟該卡內容
      //   同組併入 list phase（見 admission-data-loader playAdmissionPanelReveal 分組）。
      const html = `
        <div class="grid-12 items-start degree-show-card list-reveal-group" style="--card-color: ${color}">
          <!-- 年份：桌面 md:pt-sm md:pl-xs 對齊 loadListInto 年份文字（filter 下 269）；
               手機 -8px 淨得 12px（card grid 20px row-gap − 8）、md:mb-0（年份與縮圖同排）。
               獨立 label 不進 <a>（比照 admission 年份欄非點擊）。 -->
          <div class="col-span-12 md:col-start-1 md:col-span-1 mb-[-8px] md:mb-0 md:pt-sm md:pl-xs">
            <h5 class="list-reveal-row">${year}</h5>
          </div>
          <!-- 內容＝斑馬紋列（.list-item）＝點擊連結：套 activities panel 逐項 clip-reveal——圖 wrapper 與標題各自
               .list-reveal-row 且**必須在 .list-item 內**才會成組被 revealZebraBg 揭；否則斑馬(偶數)卡
               clip-path:inset(100%) 永不揭＝整卡空白。末尾 .list-item-divider 當分組終止符。
               見 memory reference_activities_zebra_reveal_grouping_trap。
               外層由 <a> 改 <div>：share 按鈕不能巢狀在 <a> 內（button-in-anchor 無效 HTML + router
               closest('a[href]') 會誤導航）。改用「拉伸式連結」——透明 <a> absolute inset-0 覆蓋整卡當點擊區，
               share 按鈕當兄弟以 z-10 浮在其上。 -->
          <!-- data-accent-hex＝該卡 hover 底色（--card-color）；share-modal 讀它讓分享卡跟 hover 同色
               （同 list-header.dataset.accentHex 機制；mode-color 下 share-modal 自動略過→白卡）。 -->
          <div class="degree-show-card-content list-item relative col-span-12 md:col-start-2 md:col-span-11 px-sm py-sm md:ml-[41px] transition-colors duration-fast" data-accent-hex="${color}">
            <!-- z-[1]：reveal-row 被 .clip-reveal-wrapper 包住，reveal 中殘留 transform（＝暫時 stacking context），且在 DOM
                 晚於本 <a> → 純 absolute（z auto）會被它們蓋在下面、點標題不導航。給正 z 提到它們之上、仍低於 share(z-10)。 -->
            <a href="/degree-show-detail?year=${year}" class="absolute inset-0 z-[1]" aria-label="${titleEn || titleZh || year} — Degree Show ${year}"></a>
            <div class="degree-show-img-wrapper overflow-hidden mb-sm list-reveal-row">
              ${coverHtml}
            </div>
            <div class="flex items-start justify-between gap-sm">
              <!-- 標題可縮的 flex item ＝這層 flex-1 min-w-0（**不是** reveal-row）：h5 的 .list-reveal-row 被
                   setupClipReveal 包一層 clip-reveal-wrapper（overflowX:visible、無 min-width），若讓 h5 直接當 flex item，
                   那個 wrapper 會變成 flex item→nowrap 標題把整列撐爆手機 viewport。把 flex-1/min-w-0 移到「非 reveal」外層，
                   wrapper 退回普通 block child、.dshow-title-line 自帶 overflow:hidden 收 marquee。⚠️ 這層不能加 overflow-hidden：
                   會讓 setupClipReveal 認定「父層已建 clip 結構」而跳過包 h5/share＝進場失效、share 提早現身。 -->
              <div class="flex-1 min-w-0">
                <h5 class="list-reveal-row"><span class="dshow-title-line${titleEn && titleZh ? ' mb-en-zh-lg' : ''}"><span class="dshow-title-inner">${titleEn || titleZh}</span></span>${titleEn && titleZh ? `<span class="dshow-title-line"><span class="dshow-title-inner">${titleZh}</span></span>` : ''}</h5>
              </div>
              <!-- share 包成獨立 .list-reveal-row（比照 activities：跟標題同步 clip-reveal、不提早現身）；
                   relative z-10 浮在 stretched <a> 之上（否則點按鈕落在覆蓋層＝導頁）；data-share-url 帶該屆詳情頁絕對網址。 -->
              <div class="list-reveal-row relative z-10 flex-shrink-0 self-start">
                <button data-share-btn data-share-url="${sitePath('pages/degree-show-detail.html?year=' + year)}" aria-label="分享 Share" class="inline-flex items-center">
                  <span class="icon icon-share icon-s"></span>
                </button>
              </div>
            </div>
            <div class="list-item-divider"></div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // 斑馬紋灰白交替（同 loadListInto activities-data-loader.js:1469）：全域計數標記偶數 .list-item；
    // 每張 card 一個 .list-item → 逐年交替。CSS 只在 #activities-content-section 上色，degree-show panel 在其內故生效。
    container.querySelectorAll('.list-item').forEach((el, i) => el.classList.toggle('list-item-zebra', i % 2 === 0));

    // Hover：accent 底色套在斑馬列本身，觸發區＝整條斑馬列（＝點擊連結區，比照 admission list-header 整列 hover）。
    // 用 inline style 設底色：斑馬灰 bg 是 #activities-content-section 下 ID scope（specificity 高），inline 才蓋得過。
    if (window.innerWidth >= 768) {
      container.querySelectorAll('.degree-show-card').forEach(card => {
        const content = /** @type {HTMLElement | null} */ (card.querySelector('.degree-show-card-content'));
        const color = getComputedStyle(card).getPropertyValue('--card-color').trim();
        if (!content) return;
        content.addEventListener('mouseenter', () => { content.style.backgroundColor = color; });
        content.addEventListener('mouseleave', () => { content.style.backgroundColor = ''; });
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
    // Directus activities_degree_show 為主，失敗 / 空 → fallback 本地 JSON（degree-show-source.js）
    const degreeShowData = await loadDegreeShow();
    const data = degreeShowData[year];
    const years = Object.keys(degreeShowData).sort((a, b) => Number(b) - Number(a));

    if (data) {
      document.title = `Degree Show ${year} - SCCD`;

      // Text Content（hero chips：年份 + 英文名 + 中文名）；描述文字 2026-07-13 移除
      const titleEl = document.getElementById('text-title');
      const titleEnEl = document.getElementById('text-title-en');
      const yearEl = document.getElementById('text-year');

      // hero 標題包進 .dshow-title-inner 供過長時 marquee（結構同 list marquee；短標題不觸發、維持單行）
      const setHeroTitle = (el, text) => {
        if (!el) return;
        // 空標題（只填了 EN 或只填了 ZH）→ display:none：否則 hero-animation 的 [data-hero-hl] 迴圈會照樣
        // 給空元素套 accent 底色 = 一塊空色卡（user 2026-08-17「只渲染有填寫的標題」）。display:none 讓它
        // 不顯色卡、hero 動畫也因 offsetParent null 跳過。年份走 textContent 且必有值、不經此。
        if (!text) { el.style.display = 'none'; return; }
        el.style.display = '';
        const span = document.createElement('span');
        span.className = 'dshow-title-inner';
        span.textContent = text;
        el.replaceChildren(span);
      };
      setHeroTitle(titleEl, data.title);
      setHeroTitle(titleEnEl, data.title_en);
      if (yearEl) yearEl.textContent = year;

      // 手機 hero chips 直接填：本頁桌面字卡（年份/英標/中標）放在 .hero-rand-grid 外，
      // 共用 hero-mobile-sync 只 querySelector .hero-rand-grid 內 → 掃不到、3 個手機 chip 永遠空白。
      // 這裡手動同步：text-en=年份、title=英文名、title-cn=中文名（對齊桌面字卡內容）。
      const mYearEl = document.querySelector('.hero-mobile .hero-mobile-text-en');
      const mTitleEnEl = document.querySelector('.hero-mobile .hero-mobile-title');
      const mTitleZhEl = document.querySelector('.hero-mobile .hero-mobile-title-cn');
      if (mYearEl) mYearEl.textContent = year;
      setHeroTitle(mTitleEnEl, data.title_en);
      setHeroTitle(mTitleZhEl, data.title);

      // 桌面 → 手機 hero DOM clone：必須在 initHeroAnimation 之前
      // （hero-animation 對 [data-hero-hl] 套色時手機 chip 內容已要在）
      initHeroMobileSync();

      // Hero 動畫必須在文字填入後才呼叫，否則會 wrap 並動畫空元素，clearProps 後文字才靜態出現
      // section 上的 [data-hero-title-last] 會讓 hero-animation 改用「subtitles 先 → title 後」的順序
      initHeroAnimation();

      // 手機 hero 進退場：hero-animation 只動 .hero-title/.hero-text-*（本頁桌面字卡），手機那組
      // .hero-mobile-* class 不同掃不到 → 手機 hero 之前完全靜態出現。比照桌面邏輯補手機版
      // （chip mask 滑入 + bg clip reveal + 退場反向）。必須在 initHeroAnimation 之後：chip 的
      // [data-hero-hl] accent 底色由它套，先套好才 reveal。
      setupHeroMobileEntrance();

      // hero 標題過長 → 換行（不再 marquee，user 2026-08-17）；wrap 上限在 lists.css .dshow-hero-title（容器右緣）。
      // 色卡寬度收到「最寬 wrap 行 + padding」＝bg 貼文字、不因 inline-block 撐到 max-width 而右側空一塊粉底
      // （同 hero-animation.js tightenParagraphWidths 手法；DSD hero 不走 random 版面故那條不覆蓋這裡）。
      // 等字體 ready 才量（行寬吃 Inter/Noto 字型），rAF 讓 initHeroAnimation 的 wrap 先完成。
      // 先 hug 定寬 → 再 separateHeroTitles 依定寬後的 bbox 撐開 EN/ZH 不重疊（順序不可換）。
      document.fonts.ready.then(() => requestAnimationFrame(() => {
        hugHeroTitleWidths();
        separateHeroTitles();
      }));

      // Events 列表（時間 / 活動 / 地點 — 1:2:2，城市移到地點下方，user 2026-08-17）：data.events 不存在或空陣列 → 整塊不渲染
      // 活動 / 地點 / 城市顯示中英雙語（英文上、中文下）；時間僅一行；文字 semibold（城市 regular，user 2026-07-13）
      const eventsSection = document.getElementById('events-section');
      const eventsList = document.getElementById('events-list');
      if (eventsSection && eventsList) {
        // 清單列出全部 event：self 型（手填）+ linked 型（欄位從被連活動拉；user 2026-08-17 linked 進清單、跟 ref chip 共存）
        const listEvents = Array.isArray(data.events) ? data.events : [];
        if (listEvents.length > 0) {
          // 每筆 event：活動標題自成一 row → 下方 日期 : 地點 = 1:1 兩欄 → 再下方 detail row（講者，user 2026-08-18）。
          // 城市在地點下方（沿用 2026-08-17）。手機 日期/地點 stack（grid-cols-1）、桌面才並排（md:grid-cols-2）。
          eventsList.innerHTML = listEvents.map((ev, i) => {
            return `
            <div class="dsd-event-row flex flex-col gap-sm ${i > 0 ? 'mt-2xl md:mt-xl' : ''}">
              <div>
                ${ev.nameEn ? `<p class="text-s text-black font-bold mb-en-zh-s">${ev.nameEn}</p>` : ''}
                <p class="text-s text-black font-bold" lang="zh-Hant">${ev.name || ''}</p>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-sm md:gap-md">
                <div>
                  <p class="text-s text-black font-bold">${ev.time || ''}</p>
                </div>
                <div>
                  ${ev.locationEn ? `<p class="dsd-loc-line text-s text-black font-bold mb-en-zh-s"><span class="dsd-loc-inner">${ev.locationEn}</span></p>` : ''}
                  <p class="dsd-loc-line text-s text-black font-bold" lang="zh-Hant"><span class="dsd-loc-inner">${ev.location || ''}</span></p>
                  ${(ev.cityEn || ev.city) ? `<div class="mt-xs">
                    ${ev.cityEn ? `<p class="text-xs text-black font-regular mb-en-zh-s">${ev.cityEn}</p>` : ''}
                    <p class="text-xs text-black font-regular">${ev.city || ''}</p>
                  </div>` : ''}
                </div>
              </div>
              ${renderEventGuests(ev.guests)}
            </div>
          `;
          }).join('');
          eventsSection.classList.remove('hidden');
          // 事件清單進場 + 離頁退場：每列各自 clip-reveal（rows 在 #events-list 內是一般 block flow，wrap 安全）
          const eventRows = Array.from(eventsList.children);
          if (eventRows.length) {
            // 整段一次揭露（不逐列 batch）：清單桌面內捲後，容器內捲下方的列永不進 viewport → 逐列 scroll 觸發會漏；
            // 改「section 進場即全數 clip-reveal」，滑到 section 內容一次到齊（user 2026-08-17）。
            const revealItems = setupClipReveal(eventRows);
            if (typeof ScrollTrigger !== 'undefined') {
              ScrollTrigger.create({ trigger: eventsSection, start: 'top 85%', once: true, onEnter: () => playClipReveal(revealItems) });
            } else {
              playClipReveal(revealItems);
            }
            registerPageExit(() => playRevealExit(eventRows));
          }
          // 地點行過長 → seamless marquee（無 hover 情境＝溢出即常駐捲，離屏由 util 的 IO 暫停）。
          // fonts.ready：溢出偵測吃字寬，字體 swap 前量會誤判 → 等字體到位再量。
          document.fonts.ready.then(() => requestAnimationFrame(() => applyMarqueeOverflow(eventsList, '.dsd-loc-line', '.dsd-loc-inner')));
        } else {
          eventsSection.classList.add('hidden');
          eventsList.innerHTML = '';
        }
        // 無 events（子展覽清單）時 description section 不需保留 min-height:100vh（那塊空間原是給 events list）→ 移除，
        // 免得 description 短 + events 隱藏時下方留一整屏白、把主影片推到很下面（user 2026-06-08）。
        if (listEvents.length === 0) {
          const descSec = eventsSection.closest('section');
          if (descSec) descSec.style.minHeight = '0';
        }
      }

      // Events KV（畢展直式 poster，桌面左半）：有 data.poster 才顯示（加 .has-kv，CSS 只在 md 顯示）；
      // 無 poster → 不渲染 KV，右側 list 仍靠右（user 2026-08-17）
      const kvBox = document.getElementById('events-kv');
      const kvImg = /** @type {HTMLImageElement | null} */ (document.getElementById('events-kv-img'));
      if (kvBox && kvImg) {
        if (data.poster) {
          kvImg.src = data.poster;
          kvBox.classList.add('has-kv');
          // 海報進出場：跟 event rows 同款 clip-reveal（section 進場即揭、離頁沉出）；#events-kv 當遮罩（wrap 由 setupClipReveal 補）
          const posterReveal = setupClipReveal([kvImg]);
          if (typeof ScrollTrigger !== 'undefined' && eventsSection) {
            ScrollTrigger.create({ trigger: eventsSection, start: 'top 85%', once: true, onEnter: () => playClipReveal(posterReveal) });
          } else {
            playClipReveal(posterReveal);
          }
          registerPageExit(() => playRevealExit([kvImg]));
        } else {
          kvBox.classList.remove('has-kv');
          kvImg.removeAttribute('src');
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

      // Ref btn（back btn 右邊）：從 data.events 抽 non-exhibition refs 渲染 popover；無 refs → btn 整顆 hide
      await setupRefBtn(data);

      // 共用渲染函式：自架影片（.m3u8 HLS / 直連 mp4 等）套 lightbox 同款自訂 UI（createLightboxVideo）——
      //   取代原生 controls，跟 lightbox / 首頁 WATCH 播放器視覺一致（手機 / 全螢幕自動退回原生 controls）；
      //   root 內建 max-width:960 + aspect-ratio 覆蓋掉 → 填滿外層既有 aspect-video wrapper。
      //   其餘（YouTube / Vimeo / 其他 embed）維持 iframe。player 收集進 videoPlayers 供離頁 destroy。
      const videoPlayers = [];
      const renderVideoInto = (wrapper, url) => {
        if (isHlsUrl(url) || isDirectVideoUrl(url)) {
          const player = createLightboxVideo(url, '#00FF80', { autoplay: false });
          Object.assign(player.el.style, { maxWidth: 'none', aspectRatio: 'auto', width: '100%', height: '100%' });
          wrapper.innerHTML = '';
          wrapper.appendChild(player.el);
          videoPlayers.push(player);
        } else {
          wrapper.innerHTML = `<iframe class="w-full h-full" title="影片 Video" src="${url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
      };

      // 主影片（per-event gallery 上方）— hidden 在外層 #video-outer-section
      const videoOuter = document.getElementById('video-outer-section');
      const videoWrapper = document.getElementById('video-wrapper');
      if (videoOuter && videoWrapper) {
        if (data.videoUrl) {
          videoOuter.classList.remove('hidden');
          // 先對「空」wrapper 套 clip-reveal（setupClipReveal 會 reparent），再注入 iframe →
          // iframe 在 reparent 之後才建立，避免「移動含 iframe 的節點會 reload iframe」的雷
          revealVideoOnScroll(videoWrapper);
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
          // 同主影片：先 wrap 空 wrapper 再注入 iframe
          revealVideoOnScroll(docWrapper);
          renderVideoInto(docWrapper, data.documentaryUrl);
        } else {
          docOuter.classList.add('hidden');
          docWrapper.innerHTML = '';
        }
      }

      // 影片區離頁退場：對已 wrap 的 wrapper 只做 yPercent 反向沉出（playRevealExit 不 reparent → 不 reload iframe）；
      // viewportOnly + display:none(.hidden) 過濾會自動略過未顯示 / 不在視窗的影片區
      registerPageExit(() => playRevealExit([videoWrapper, docWrapper].filter(Boolean)));

      // 自架影片離頁清理：createLightboxVideo 的 destroy() 已含 detachVideoSource（解 hls.js instance）
      // + document listener 解綁 + killTweens；SPA innerHTML swap 前統一 destroy，避免殘留
      registerPageCleanup(() => { videoPlayers.forEach(p => p.destroy()); });

      // Prev / Next 雙卡：sort desc 下 idx+1 = 上一屆（較舊，左），idx-1 = 下一屆（較新，右）；**wrap 循環**。
      // user 2026-07-09：第一屆（最新）的右卡要接「最後一屆（最舊）」、最後一屆的左卡接第一屆 → 環狀導覽
      const idx = years.indexOf(year);
      const prevYear = years[(idx + 1) % years.length];
      const nextYear = years[(idx - 1 + years.length) % years.length];
      const prevData = degreeShowData[prevYear];
      const nextData = degreeShowData[nextYear];

      setupNextProject(prevYear, prevData, nextYear, nextData);

      // Sticky info card + hero chip scroll-driven collapse
      // 必須在 events / galleries / nextProject 都渲染完才 init（依賴它們的 DOM 計算 sticky 範圍）
      setupStickyAndHeroChips(data, year);

    } else {
      window.location.href = '404.html';
    }
  } catch (error) {
    console.error('Error loading degree show detail data:', error);
  }
}

// ── 手機 hero 進退場 ────────────────────────────────────────────────────────
// 比照桌面 hero-animation 的邏輯做手機版：
//   - 3 張字卡各包一層 overflow:hidden mask wrapper，從隨機 4 方向滑入（= 桌面 hero-title-wrapper 同構）
//   - 進場順序對齊桌面 data-hero-enter：年份(1) 先進、英中標題(2) 一起、+0.5s 接續
//   - bg 圖 img 在 .hero-mobile-bg 遮罩內隨機方向滑入（= 桌面 .hero-banner 進場；2026-08-16 由 clip-path 改）
//   - 退場反向：chip 隨機方向滑出 + bg clip 收合（同桌面 playHeroExit 0.5s / stagger 0.06）
// 旋轉 var 細節：CSS `.hero-mobile-text > *` 對「直接子元素」套 rotate(--hero-mobile-rot)；
// chip 包進 wrapper 後不再是直接子 → 把 chip 的 inline rotation var 轉移到 wrapper（旋轉跟著 wrapper，
// chip 在 rotated mask 內滑動，同桌面 wrapper rotate + child slide 的結構）。margin 同理轉移。
function setupHeroMobileEntrance() {
  if (!isMobileView() || typeof gsap === 'undefined') return;
  const mobile = document.querySelector('.hero-mobile');
  if (!mobile) return;
  const bg = /** @type {HTMLElement | null} */ (mobile.querySelector('.hero-mobile-bg'));
  const yearChip = /** @type {HTMLElement | null} */ (mobile.querySelector('.hero-mobile-text-en'));
  const titleEnChip = /** @type {HTMLElement | null} */ (mobile.querySelector('.hero-mobile-title'));
  const titleZhChip = /** @type {HTMLElement | null} */ (mobile.querySelector('.hero-mobile-title-cn'));
  const chips = [yearChip, titleEnChip, titleZhChip].filter(Boolean);
  if (!bg && chips.length === 0) return;

  const DIRS = [
    { xPercent: 0, yPercent: -100 },
    { xPercent: 0, yPercent: 100 },
    { xPercent: -100, yPercent: 0 },
    { xPercent: 100, yPercent: 0 },
  ];
  // bg img 藏定位 ±110 過衝（chips 是文字包 wrapper 用 100；圖片貼齊 100 有 dpr hairline，同 faculty SLIDE_MAP）
  const IMG_DIRS = DIRS.map(d => ({ xPercent: d.xPercent * 1.1, yPercent: d.yPercent * 1.1 }));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  chips.forEach(chip => {
    const wrapper = document.createElement('div');
    wrapper.style.overflow = 'hidden';
    const rot = chip.style.getPropertyValue('--hero-mobile-rot');
    if (rot) {
      wrapper.style.setProperty('--hero-mobile-rot', rot);
      chip.style.removeProperty('--hero-mobile-rot');
    }
    const mt = getComputedStyle(chip).marginTop;
    if (mt && mt !== '0px') {
      wrapper.style.marginTop = mt;
      chip.style.marginTop = '0';
    }
    chip.parentNode.insertBefore(wrapper, chip);
    wrapper.appendChild(chip);
  });

  // 先同步 set 初始藏起狀態（同一個 task 內，sync 剛把 .hero-mobile visibility 打開、瀏覽器還沒 paint → 不閃）
  chips.forEach(chip => gsap.set(chip, pick(DIRS)));
  const bgImg = /** @type {HTMLElement|null} */ (bg ? bg.querySelector('img') : null);
  if (bgImg) gsap.set(bgImg, pick(IMG_DIRS));

  // paused + double-rAF 才 play：loadDegreeShowDetail 後段（events/galleries render）會把首次 paint
  // 拖到 timeline 開跑後 ~900ms —— GSAP 時間制，paint 出來時年份 0.9s tween 已近跑完 = 視覺「閃一下出來」
  // （user 2026-06-11；playwright 實測首個可見 frame 年份已在 90% 進度）。等 paint 後才起跑，整段進場可見。
  const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.enter } });
  if (bgImg) {
    tl.to(bgImg, { xPercent: 0, yPercent: 0, duration: DUR.reveal, clearProps: 'transform' }, 0);
  }
  // 年份先、英中標題一起 +0.5s（= 桌面 ENTER_DURATION 0.9 - OVERLAP 0.4 的接續節奏）
  const groups = [[yearChip].filter(Boolean), [titleEnChip, titleZhChip].filter(Boolean)];
  let at = 0;
  groups.forEach(group => {
    if (group.length === 0) return;
    group.forEach(chip => {
      tl.to(chip, { xPercent: 0, yPercent: 0, duration: 0.9, clearProps: 'transform' }, at);
    });
    at += 0.5;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => tl.play()));

  registerPageExit(() => {
    if (typeof gsap === 'undefined') return Promise.resolve();
    return new Promise(resolve => {
      const out = gsap.timeline({ onComplete: resolve });
      chips.forEach((chip, i) => {
        out.fromTo(chip, { xPercent: 0, yPercent: 0 }, { ...pick(DIRS), duration: 0.5, ease: EASE.exit, overwrite: true }, i * 0.06);
      });
      if (bgImg) {
        // to（非 fromTo）：進場中從當下位置倒帶、進場完成 computed 0,0，都不會先跳回全開
        out.to(bgImg, { ...pick(IMG_DIRS), duration: 0.5, ease: EASE.exit, overwrite: true }, 0);
      }
    });
  });
}

// 影片 clip-reveal + scroll 觸發。
// ⚠️ 不用 animateCardsClipReveal：它把 ScrollTrigger 掛在被 yPercent:100 推下「整個影片高」的 wrapper 上，
//    aspect-video 桌面 full-width 很高（~700px+）→ 該 trigger 元素 top 被推下一個影片高
//    → 'top 90%' 要多捲一整個影片高才 fire = 進場很晚（user 2026-06-08「往下很多才進場」）。
//    改成：ST 掛在 setupClipReveal 建的「穩定 .clip-reveal-wrapper」(留在版面 slot、不位移) → 影片頂進視窗下緣就 reveal。
function revealVideoOnScroll(wrapper) {
  const [el] = setupClipReveal([wrapper]); // wrap + yPercent:100；wrapper 被 reparent 進 .clip-reveal-wrapper
  if (!el) return;
  const slot = wrapper.parentElement;      // 穩定的版面 slot（clip-reveal-wrapper）
  const play = () => playClipReveal([wrapper]);
  if (slot && typeof ScrollTrigger !== 'undefined') {
    const r = slot.getBoundingClientRect();
    // 已在視窗下緣內 → 立即播（once ST 對「建立當下已過 start」不可靠）；否則捲到影片頂進視窗才播
    if (r.top < (window.innerHeight || 0) * 0.9) play();
    else ScrollTrigger.create({ trigger: slot, start: 'top 90%', once: true, onEnter: play });
  } else {
    play();
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

  // 本地隨機旋轉：-6° ~ 6°（不含 0），手機色塊卡與桌面 poster cards 共用
  const localRot = () => {
    let deg;
    do { deg = Math.round(Math.random() * 12) - 6; } while (deg === 0);
    return deg;
  };
  // 標題 label（year/title-en/title）旋轉收到 ±1~2°（比 poster ±6° 小很多）：寬標題×大角度→旋轉 bbox 變高，
  // separateStacked 為避免 en/zh 色卡重疊要補很大 margin（實測 5° 補 161px、3° 補 119px→中標題掉出畫面，
  // user 2026-08-17「gap 太大、確保都在畫面裡」）；±1~2° 時 margin 幾乎歸零、en↔zh gap 收回 flex 24px。
  // 仍在全站旋轉標題 ±2~4° 上限內（那是上限非下限，見 memory feedback_slidein_title_rotation_cap_4deg_all_types）。
  const labelRot = () => (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random());

  // 標題文字包進 .dshow-title-inner（marquee row>inner 結構；過長時 applyMarqueeOverflow 換兩份 copy）
  const setTitle = (el, text) => {
    if (!el) return;
    // 空標題（該屆只填 EN 或只填 ZH）→ display:none：否則空的 .dshow-next-title 仍佔一塊 accent 底色卡
    //（同 hero setHeroTitle；hugTitleBox/separateStacked 都 guard offsetParent===null 會自動跳過）。
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = '';
    const span = document.createElement('span');
    span.className = 'dshow-title-inner';
    span.textContent = text;
    el.replaceChildren(span);
  };

  // 手機左右並排色塊卡（user 2026-07-09 取消 poster thumbnail）：隨機 accent 底 + 隨機旋轉 +
  // 年份 / 英文名 / 中文名；兩張互異色。版面（並排 / 高低落差 / 黑字）在 variables.css .dsd-next-card-m
  const mobPrevColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
  const mobNextPool = ACCENT.filter(c => c !== mobPrevColor);
  const mobNextColor = mobNextPool[Math.floor(Math.random() * mobNextPool.length)];
  const setMobile = (key, year, data, color) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link-m`));
    const yearEl = document.getElementById(`${key}-year-mobile`);
    const titleEnEl = document.getElementById(`${key}-title-en-mobile`);
    const titleEl = document.getElementById(`${key}-title-mobile`);
    if (link) {
      link.href = '/degree-show-detail?year=' + year;
      link.style.background = color;
      link.style.transform = `rotate(${localRot()}deg)`;
    }
    if (yearEl) yearEl.textContent = year;
    setTitle(titleEnEl, data.title_en);
    setTitle(titleEl, data.title);
  };
  setMobile('prev', prevYear, prevData, mobPrevColor);
  setMobile('next', nextYear, nextData, mobNextColor);

  // 上下屆標題過長 → 換行（不再 marquee，user 2026-08-17）；wrap 規則在 lists.css .dshow-next-title

  if (isMobileView()) return;

  // 桌面 desktop
  const setDesktop = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img`));
    const yearEl = document.getElementById(`${key}-year`);
    const titleEnEl = document.getElementById(`${key}-title-en`);
    const titleEl = document.getElementById(`${key}-title`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.coverImage || data.poster;   // 上下屆卡片吃 list 封面（橫式 cover），非直式 poster（user 2026-08-17）
    if (yearEl) yearEl.textContent = year;
    setTitle(titleEnEl, data.title_en);
    setTitle(titleEl, data.title);
  };
  setDesktop('prev', prevYear, prevData);
  setDesktop('next', nextYear, nextData);

  // 海報隨機旋轉，兩張獨立（localRot 在上方手機區塊前定義）。
  // 2026-08-16 進退場改 clip-reveal：link 當遮罩（overflow:clip＋承載旋轉 → 滑動跟著旋轉角、不切角），
  // 旋轉從 card 移到 link、card 的 transform 讓給 GSAP xPercent 滑動；hover 色卡掃入（#X-clip）維持 clip-path 不動。
  const prevCard = /** @type {HTMLElement | null} */ (document.getElementById('prev-card'));
  const nextCard = /** @type {HTMLElement | null} */ (document.getElementById('next-card'));
  [document.getElementById('prev-link'), document.getElementById('next-link')].forEach(link => {
    if (!link) return;
    link.style.overflow = 'clip';
    link.style.transform = `rotate(${localRot()}deg)`;
  });

  // Labels：rotation 各自隨機（init 時固定）；底色 cardColor 改為每次 mouseenter 重新挑
  // → 同張海報的 3 chip 仍共用同一色，但跨 hover 不一定相同
  const LABEL_IDS = ['year', 'title-en', 'title'];
  // hero 式 clip-reveal（滑動＋遮罩，同全站 nav chip）：原 HTML 只 transition clip-path，補上 translate 讓遮罩之外
  // 再加滑入位移（navChipHidden 沿旋轉軸算、與 inline rotate 共存）。
  const LABEL_TRANSITION = 'clip-path 0.5s cubic-bezier(0.25,0,0,1), translate 0.5s cubic-bezier(0.25,0,0,1)';
  ['prev', 'next'].forEach(key => {
    LABEL_IDS.forEach(id => {
      const el = /** @type {HTMLElement | null} */ (document.getElementById(`${key}-${id}`));
      if (!el) return;
      el.style.transform = `rotate(${labelRot()}deg)`;
      el.style.transition = LABEL_TRANSITION;
    });
  });

  // 上下屆標題比照 hero「滿版」：色卡寬度收到最寬 wrap 行（不撐到 max-width 留空 accent 底），再撐開英/中標題不重疊。
  // 標題 clip-path 藏著仍有 layout（offsetParent 非 null）→ 量得到；等字體 ready 才量（行寬吃字型）。
  // ⚠️ label 旋轉是 labelRot() ±1~2°（收窄過，見上）→ 寬標題 en/zh 極端情況仍可能微疊，separate 保底。
  document.fonts.ready.then(() => requestAnimationFrame(() => {
    document.querySelectorAll('#prev-labels .dshow-next-title, #next-labels .dshow-next-title')
      .forEach(el => hugTitleBox(/** @type {HTMLElement} */ (el)));
    ['prev', 'next'].forEach(key => separateStacked(
      document.getElementById(`${key}-title-en`), document.getElementById(`${key}-title`)));
    // 初始藏定位 translate（hug 定寬後才量，寬度定了位移向量才準）：讓「第一次」hover reveal 也滑入（非只原地 wipe）。
    // 方向對齊各自的 hidden clip 遮罩側：prev window 在左＝'right'、next window 在右＝'left'。
    ['prev', 'next'].forEach(key => {
      const dir = key === 'prev' ? 'right' : 'left';
      LABEL_IDS.forEach(id => {
        const el = /** @type {HTMLElement | null} */ (document.getElementById(`${key}-${id}`));
        if (el) el.style.translate = navChipHidden(el, dir).translate;
      });
    });
  }));

  // 位置計算：等兩張圖載入完後，依 naturalWidth/Height 計算高度，設 next.top + stage.minHeight
  // labels 已搬進 card 內、靠 corner 絕對定位（左下 / 右上），不需要 JS 算 vw 位置
  // 2026-07-13 一屏 snap：疊放總高（prevH*0.5 + nextH）超出 viewport（上下各留 48 呼吸）時等比縮 posterW，
  // 並把原「66vw 寬 ±8vw 出血」的 116vw 構圖等比置中（縮小後不再貼死左右緣、空隙對稱）
  const recompute = () => {
    const stage = /** @type {HTMLElement | null} */ (document.getElementById('next-project-stage'));
    const prevImg = /** @type {HTMLImageElement | null} */ (document.getElementById('prev-img'));
    const nextImg = /** @type {HTMLImageElement | null} */ (document.getElementById('next-img'));
    const prevLink = /** @type {HTMLElement | null} */ (document.getElementById('prev-link'));
    const nextLink = /** @type {HTMLElement | null} */ (document.getElementById('next-link'));
    if (!stage || !prevImg || !nextImg || !prevLink || !nextLink) return;

    const vw = window.innerWidth;
    // 圖掛掉（404/壞檔）不整段放棄：比例用另一張或 1.4（直式海報）頂上、版面照算——
    // 原本 early-return 會讓 link 卡在 66vw 未 fit、top 未設，整區看起來壞掉
    const ratioOf = (img) => (img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0);
    const rP = ratioOf(prevImg) || ratioOf(nextImg) || 1.4;
    const rN = ratioOf(nextImg) || ratioOf(prevImg) || 1.4;
    const availH = window.innerHeight - 96;
    // prev 下移 0.15 prevH（user 2026-07-13「上一屆 thumbnail 再往下一點」，不再貼 stage 頂）；
    // next 位置不動（仍以原 0.5 prevH 錨定）→ 兩張重疊更多。fit 分母取兩張各自底邊的較大者。
    const PREV_DROP = 0.15;
    const posterW = Math.min(vw * 0.66, availH / Math.max((PREV_DROP + 1) * rP, 0.5 * rP + rN));
    const prevTop = posterW * rP * PREV_DROP;
    const nextTop = posterW * rP * 0.5;
    const sideOffset = (vw - 1.16 * vw * (posterW / (vw * 0.66))) / 2;  // s=1 時 = 原 -8vw

    prevLink.style.width = posterW + 'px';
    prevLink.style.left = sideOffset + 'px';
    prevLink.style.top = prevTop + 'px';
    nextLink.style.width = posterW + 'px';
    nextLink.style.right = sideOffset + 'px';
    nextLink.style.top = nextTop + 'px';
    stage.style.minHeight = Math.max(prevTop + posterW * rP, nextTop + posterW * rN) + 'px';
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
    registerPageCleanup(() => window.removeEventListener('resize', recompute));
    createRevealTriggers();
  });

  // Hover：被 hover 的 card → z 提高 + 移除 dim + 顯示 labels group；另一張 → clip-path 掃入隨機色
  const setupHover = (myKey, otherKey) => {
    const myLink = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-link`));
    const otherLink = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-link`));
    const myDim = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-dim`));
    const myLabels = /** @type {HTMLElement | null} */ (document.getElementById(`${myKey}-labels`));
    const otherClip = /** @type {HTMLElement | null} */ (document.getElementById(`${otherKey}-clip`));
    if (!myLink || !myDim || !otherClip) return;

    // chip clip-path stagger 設定：從 transform-origin 那側 reveal（clip 遮罩）＋同步 translate 滑入（hero 式 clip-reveal）
    // prev: transform-origin left → hidden clip window 在左 inset(0 100% 0 0) → navChipHidden 'right' 滑入
    // next: transform-origin right → hidden clip window 在右 inset(0 0 0 100%) → navChipHidden 'left' 滑入
    const HIDDEN_INSET = myKey === 'prev' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    const SHOWN_INSET  = 'inset(0 0 0 0)';
    const NAV_DIR = myKey === 'prev' ? 'right' : 'left';

    myLink.addEventListener('mouseenter', () => {
      myLink.style.zIndex = '3';
      if (otherLink) otherLink.style.zIndex = '1';
      myDim.style.opacity = '0';

      // 每次 hover 重新挑 cardColor（不一定每次都一樣），同步套到 3 個 chip
      // 同時每次 hover 重新 random 旋轉角度（chip 此時 clip-path 還是 hidden，新角度會在 reveal 時直接呈現）
      const myCardColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
      myLink.dataset.cardColor = myCardColor;
      if (myLabels) {
        // labels HTML 已從 h4/h2 改 <p>（舊 selector 抓不到 = hover 年份/標題全滅，user 2026-07-13 報修）
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('p'));
        chips.forEach((chip, i) => {
          chip.style.transform = `rotate(${labelRot()}deg)`;   // ±1~2°（原 localRot ±6° 是「可見 hover 態」真兇：寬標題 en/zh 疊，user 2026-08-17）
          chip.style.background = myCardColor;
          chip.style.transitionDelay = (i * 0.08) + 's';
          chip.style.clipPath = SHOWN_INSET;
          chip.style.translate = NAV_CHIP_SHOWN.translate;   // 滑入回原位（clip 遮罩之外的位移）
        });
        // 旋轉角每次 hover 重擲 → 每次都要重算 en↔zh 反疊 margin（init 那次是 clip-hidden 態、且原 hover 用
        // localRot ±6° 沒重算＝一直疊）。⚠️真兇二：clip-path **揭露中（inset 右側未收）getBoundingClientRect
        // 會回傳被裁的小 bbox**（實測 gap 量到 61、實際 −5）→ margin 補不夠、揭露完才疊（1/8、視旋轉組合）。
        // 量測時暫拿掉 en/zh clip-path 取「完整旋轉 bbox」補 margin，同幀內還原成「從 hidden 揭露」→ 正確且不閃。
        const enEl = document.getElementById(`${myKey}-title-en`);
        const zhEl = document.getElementById(`${myKey}-title`);
        if (enEl && zhEl) {
          const et = enEl.style.transition, zt = zhEl.style.transition;
          enEl.style.transition = zhEl.style.transition = 'none';
          enEl.style.clipPath = zhEl.style.clipPath = 'none';
          void zhEl.offsetWidth;
          separateStacked(enEl, zhEl);
          enEl.style.clipPath = zhEl.style.clipPath = HIDDEN_INSET;   // 回藏定位（仍 transition:none = snap）
          void zhEl.offsetWidth;
          enEl.style.transition = et; zhEl.style.transition = zt;     // 還原 clip transition
          enEl.style.clipPath = zhEl.style.clipPath = SHOWN_INSET;    // 重新觸發 stagger 揭露
        }
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
        const chips = /** @type {NodeListOf<HTMLElement>} */ (myLabels.querySelectorAll('p'));
        chips.forEach((chip) => {
          chip.style.transitionDelay = '0s';
          chip.style.clipPath = HIDDEN_INSET;
          chip.style.translate = navChipHidden(/** @type {HTMLElement} */ (chip), NAV_DIR).translate;   // 沿旋轉軸滑回藏定位
        });
      }
      otherClip.style.clipPath = otherClip.dataset.hiddenClip || 'inset(100% 0 0 0)';
    });
  };
  setupHover('prev', 'next');
  setupHover('next', 'prev');

  // 進場：card 在 link 遮罩內滑入（方向沿用舊 wipe：prev 由左、next 由右；±110 過衝防 dpr hairline）。
  // 藏定位立即設（防閃現）；ScrollTrigger 延到圖片載入＋recompute 佈局完成後才建——link 的 top/width
  // 全由 recompute 決定，先建會用「佈局前」幾何算 start，差距夠大時永不觸發＝卡片卡在遮罩外不出現
  // （user 2026-08-16 報：右卡 hover 有反應但縮圖不見）。
  const canReveal = typeof ScrollTrigger !== 'undefined' && typeof gsap !== 'undefined';
  if (canReveal) {
    if (prevCard) gsap.set(prevCard, { xPercent: -110, yPercent: 0, x: 0, y: 0 });
    if (nextCard) gsap.set(nextCard, { xPercent: 110, yPercent: 0, x: 0, y: 0 });
  }
  const createRevealTriggers = () => {
    if (!canReveal) return;
    [prevCard, nextCard].forEach(el => {
      if (!el) return;
      ScrollTrigger.create({
        // trigger 用 link 遮罩（不位移、佈局已定案）而非被 xPercent 推走的 card
        trigger: el.parentElement || el,
        start: 'top 85%',
        once: true,
        onEnter: () => gsap.to(el, { xPercent: 0, duration: DUR.medium, ease: 'cubic-bezier(0.25, 0, 0, 1)' }),
      });
    });
  };

  // 離頁退場：已進場＋在視窗內的卡沿原方向滑出；未進場（仍在 ±110）→ kill 跳過，
  // 防 hidden→hidden 補間掃過可見區（同 hero banner 退場 guard）。
  const exitCard = (card, outX) => {
    if (!card) return null;
    const x = Number(gsap.getProperty(card, 'xPercent')) || 0;
    if (Math.abs(x) >= 105) { gsap.killTweensOf(card); return null; }
    const r = card.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return null;
    return new Promise(res => gsap.to(card, { xPercent: outX, duration: 0.5, ease: EASE.exit, overwrite: true, onComplete: res }));
  };
  registerPageExit(() => Promise.all([exitCard(prevCard, -110), exitCard(nextCard, 110)].filter(Boolean)));
}

// ── Per-event section rendering ────────────────────────────────────────────
// 每個 event 一個 <section class="event-gallery-section" data-event-index="i">，依 ev.type 分流：
//   - 'exhibition' (default)：.division-images full-width slideshow（initDegreeShowGallery）
//   - 'forum' / 'workshop' / 'lecture' 等：依 ev.refs[] 撈 activities source item 的 images，
//     版面與 exhibition 完全相同（user 2026-07-13：子展覽不再有文字說明、全部純圖片 carousel；
//     原「左 desc + 右 slideshow」圖文模板退役）。只取第一個有圖的 ref（每 event 只一個子展覽）；
//     全部 ref 無 images → 整 event 不渲染
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
    if (ev.isRef) continue;   // linked 型走 ref popover，不生 gallery section
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

  // 手機子展覽 tab strip（user 2026-07-09）：event 標題從 per-section chip 改成
  // 主影片下方的 sticky tab 列（點擊捲到該子展覽 + scroll-spy 高亮）
  if (isMobileView()) buildMobileEventStrip(root);
}

// 手機子展覽 tab strip（user 2026-07-09，取代原 per-section 標題 chip）：
// 仿 about #mobile-anchor-strip pattern——sticky wrap 釘 header 下（top:96 + theme-bg +
// ::before 遮 0~96 header 帶，CSS 在 variables.css），sticky 範圍 = #event-galleries-root
// （進 galleries 區才釘住、捲出後自然放開）。tab 沿用本頁 ref tabs 的 .class-division-btn +
// .dsd-tab-line marquee 結構；active = 隨機 accent + 黑字 + 隨機旋轉（同 setActiveTabBtn 視覺）。
// 點擊捲到該子展覽（落點靠 .event-gallery-section 的 scroll-margin-top 讓出 strip 高）；
// scroll-spy 用「viewport center 落在哪個 section」判定（同桌面 sticky branch chip）。
function buildMobileEventStrip(root) {
  const sections = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.event-gallery-section')))
    .filter(s => s.dataset.branchEn || s.dataset.branchZh);
  if (sections.length === 0) return;

  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
  const randAccent = () => ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
  const randRot = () => { let r = 0; while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 6 - 3).toFixed(2)); return r; };

  // 矮橫向：tab 改進 header 帶（user 2026-07-11「比照 activities 放 header、可左右滑」）——
  // fixed 定位 + 全寬 blocker + hero gate 由 landscape.css .dsd-event-strip-header + setupStripHeaderGate 接管；
  // 直向手機維持 sticky top:96 原樣。
  const landscapeHeader = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  const wrap = document.createElement('div');
  wrap.className = 'md:hidden sticky z-40 dsd-event-strip-wrap';
  if (landscapeHeader) {
    wrap.classList.add('dsd-event-strip-header');   // CSS 改 fixed 進 header 帶
  } else {
    wrap.classList.add('site-container');           // 直向：site-container px + 下方 sticky
    wrap.style.top = '96px';
    wrap.style.background = 'var(--theme-bg)';
  }
  const strip = document.createElement('div');
  strip.className = 'dsd-event-strip flex flex-row items-center gap-md overflow-x-auto py-sm';
  wrap.appendChild(strip);

  const btns = [];
  const baseRots = [];
  sections.forEach(sec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'class-division-btn shrink-0 font-bold transition-all duration-fast text-left';
    btn.innerHTML = `<div class="dsd-tab-line text-s font-bold"><span class="dsd-tab-marquee-inner">${escapeHtml(sec.dataset.branchEn || '')}</span></div><div class="dsd-tab-line text-s font-bold"><span class="dsd-tab-marquee-inner">${escapeHtml(sec.dataset.branchZh || '')}</span></div>`;
    const rot = randRot();
    baseRots.push(rot);
    btn.style.transform = `rotate(${rot}deg)`;
    strip.appendChild(btn);
    btns.push(btn);
  });

  let activeIdx = -1;
  function setActive(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    btns.forEach((b, i) => {
      if (i === idx) {
        b.classList.add('active');
        b.style.background = randAccent();
        b.style.color = '#000000';
        b.style.transform = `rotate(${randRot()}deg)`;
      } else {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
        b.style.transform = `rotate(${baseRots[i]}deg)`;
      }
    });
  }

  // strip 置中「只在點擊時」對被點的 btn 做（同 about anchor-nav.js 手機 strip pattern）。
  // ⚠️ 勿在 scroll-spy setActive 裡自動置中：頁面捲動中 strip 會自己滑走，第一顆被推出左緣、
  //    tab 在手指下移動 = 點不到（user 2026-07-09 報「點擊定位錯誤、點不到第一顆」的根因）
  const centerBtn = (b) => {
    strip.scrollTo({ left: b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  };

  // 點擊捲動期間暫停 spy（同 about clickScrolling）：不然捲往目標的路上經過的 section 會逐個
  // 搶 active，抵達前 tab 顏色閃好幾次
  let clickScrolling = false;
  let clickScrollTimer = null;
  btns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      setActive(i);
      centerBtn(btn);
      clickScrolling = true;
      clearTimeout(clickScrollTimer);
      clickScrollTimer = setTimeout(() => { clickScrolling = false; }, 1200);
      sections[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  root.prepend(wrap);
  // 矮橫向 header 帶：全寬 blocker（z-40 < logo z-50 < strip z-55）遮捲過的透明 header + hero gate
  if (landscapeHeader) {
    const blocker = document.createElement('div');
    blocker.className = 'dsd-event-strip-blocker';
    root.prepend(blocker);
    setupStripHeaderGate(wrap, strip, blocker);
  }
  setActive(0);
  requestAnimationFrame(() => applyMarqueeOverflow(strip, '.dsd-tab-line', '.dsd-tab-marquee-inner'));

  if (typeof ScrollTrigger !== 'undefined') {
    sections.forEach((sec, i) => {
      ScrollTrigger.create({
        trigger: sec,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => { if (!clickScrolling) setActive(i); },
        onEnterBack: () => { if (!clickScrolling) setActive(i); },
      });
    });
  }
}

// 矮橫向 event strip 進 header 帶的 hero gate（user 2026-07-11「比照 activities」）：hero 在畫面時
// strip 藏（clip-path top→down 收）+ blocker 淡出、pointer-events 關；捲過 hero 才現。單顆 IO 觀察 hero
// 本體（同 activities-section-switch setNav 的 rootMargin -8px）。clip-path 非 opacity（全站 nav 原則）。
function setupStripHeaderGate(wrap, strip, blocker) {
  if (typeof gsap === 'undefined' || !('IntersectionObserver' in window)) return;
  const heroEl = document.querySelector('#page-content > section');
  if (!heroEl) return;
  // 進出場比照其他頁 nav btn（user 2026-07-12「跟其他頁一樣」）：2026-07-16 改 hero 式 clip-reveal＝
  // translate（獨立屬性，與 btn 的 inline rotate 共存）＋同步 clip-path 滑動（navChipHidden，見 scroll-animate.js）；
  // 每顆固定一個隨機方向（2026-07-17 全站四方向隨機）、同時（stagger:0）reveal/hide，同 activities/courses setNav。blocker 維持底邊 wipe。
  const btns = /** @type {HTMLElement[]} */ (Array.from(strip.children));
  const navDir = new Map(btns.map(b => [b, pickNavDir(b)]));
  // btn 帶 transition-all（含 clip/translate）：GSAP 動畫期間關掉，免 CSS transition 追每幀寫入卡頓
  const killTransition = () => btns.forEach(b => { b.style.transition = 'none'; });
  const BLK_HIDDEN = 'inset(0% 0% 100% 0%)';
  const BLK_SHOWN = 'inset(0% 0% 0% 0%)';
  const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';   // 同 activities NAV_EASE，統一進出場曲線
  let revealed = null;
  killTransition();
  btns.forEach(b => gsap.set(b, navChipHidden(b, navDir.get(b))));
  gsap.set(blocker, { clipPath: BLK_HIDDEN });
  wrap.style.pointerEvents = 'none';
  const setState = (reveal) => {
    if (revealed === reveal) return;
    revealed = reveal;
    gsap.killTweensOf([...btns, blocker]);
    killTransition();
    wrap.style.pointerEvents = reveal ? '' : 'none';
    const hid = reveal ? null : btns.map(b => navChipHidden(b, navDir.get(b)));
    gsap.to(btns, {
      clipPath: reveal ? NAV_CHIP_SHOWN.clipPath : (i) => hid[i].clipPath,
      translate: reveal ? NAV_CHIP_SHOWN.translate : (i) => hid[i].translate,
      duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true,
      onComplete: () => { if (reveal) btns.forEach(b => { b.style.transition = ''; }); },
    });
    gsap.to(blocker, { clipPath: reveal ? BLK_SHOWN : BLK_HIDDEN, duration: DUR.base, ease: NAV_EASE, overwrite: true });
  };
  // 雙 IO（hero + footer，同 activities-section-switch）：hero 或 footer 在畫面 → 藏；中間內容區才現。
  // 各記 flag 統一 apply（各自 toggle 會被初始 delivery 順序互蓋，同 admission/about 的坑）。
  const footerEl = document.getElementById('site-footer');
  let heroVis = true;
  let footerVis = false;
  const apply = () => setState(!heroVis && !footerVis);
  const heroIO = new IntersectionObserver(([e]) => { heroVis = e.isIntersecting; apply(); }, { rootMargin: '-8px 0px 0px 0px' });
  heroIO.observe(heroEl);
  registerPageCleanup(() => heroIO.disconnect());
  if (footerEl) {
    const footerIO = new IntersectionObserver(([e]) => { footerVis = e.isIntersecting; apply(); }, { rootMargin: '0px 0px -25% 0px' });
    footerIO.observe(footerEl);
    registerPageCleanup(() => footerIO.disconnect());
  }
}

function appendExhibitionSection(root, index, pool, branchEn, branchZh) {
  // detail 每個活動 gallery 最多 10 張：關聯活動照片無法在後台子選，一律截前 10（user 2026-08-17）
  pool = Array.isArray(pool) ? pool.slice(0, 10) : pool;
  const section = document.createElement('section');
  // 手機間距走 #event-galleries-root flex gap；桌面 2026-07-13 改一屏 snap（h-screen + flex 垂直置中，
  // 圖對齊 viewport 水平中線；原 md:py-6xl 退役）。矮橫向由 landscape.css #root > section 蓋回 auto。
  section.className = 'event-gallery-section snap-zone md:h-screen md:flex md:flex-col md:justify-center';
  section.dataset.eventIndex = String(index);
  section.dataset.branchEn = branchEn;
  section.dataset.branchZh = branchZh;

  // 桌面全寬 slideshow（6-slot/400px，degree-show-gallery.js）；手機標題已由 sticky tab strip 接管
  const gallery = document.createElement('div');
  gallery.className = 'division-images relative';
  section.appendChild(gallery);
  root.appendChild(section);

  // 手機單圖輪播（user 2026-07-09）：一次一張置中、原地 clip 換圖（同 about class 手機 pattern）。
  // --degree-show class 原由 initDegreeShowGallery 加（手機容器高 350 的 CSS 錨點），這裡手動補。
  if (isMobileView()) {
    gallery.classList.add('division-images--degree-show');
    const api = createClassImagesSlideshow(gallery, pool, { slotLefts: ['50%'], slotXPercent: -50, leaveRandom: true });
    if (api) {
      api.renderFresh(false);
      api.start();
      registerPageCleanup(() => api.stop());
      registerPageExit(() => {
        const r = gallery.getBoundingClientRect();
        const vh = window.innerHeight || 0;
        const inView = r.bottom > 0 && r.top < vh && gallery.offsetParent !== null;
        return inView ? api.hideAll() : Promise.resolve();
      });
    }
    return;
  }

  const galleryApi = initDegreeShowGallery(gallery, pool);
  // SPA 離開時清掉 gallery 的 setInterval（destroy 已寫好，原本 caller 丟棄回傳值不清）
  if (galleryApi) {
    registerPageCleanup(() => galleryApi.destroy());
    // 離頁退場：只收「視窗內」的 gallery（離頁退場不被長頁外的多個 gallery 拖慢；視窗外直接 swap）
    registerPageExit(() => {
      if (typeof galleryApi.hideAll !== 'function') return Promise.resolve();
      const r = gallery.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      const inView = r.bottom > 0 && r.top < vh && gallery.offsetParent !== null;
      return inView ? galleryApi.hideAll() : Promise.resolve();
    });
  }
}

// ref-based section：取 event 第一個解得開且有圖的 ref，版面與 exhibition 完全相同（純圖 carousel）。
// user 2026-07-13：子展覽資料不再有文字說明 → 原「左 desc + 右 slideshow」圖文模板（event-extra-panel）退役。
async function appendRefBasedSection(root, index, ev, branchEn, branchZh) {
  const refs = Array.isArray(ev.refs) ? ev.refs : [];
  for (const ref of refs) {
    const images = await resolveRefImages(ref);
    if (images.length > 0) {
      appendExhibitionSection(root, index, images, branchEn, branchZh);
      return;
    }
  }
}

// Ref image resolver：吃 {source, id} 回傳該 activities item 的 images[]（子展覽只渲染圖片）
async function resolveRefImages(ref) {
  if (!ref || !ref.source || !ref.id) return [];
  const data = await getSectionData(ref.source);
  if (!data) return [];
  const item = findItemById(data, ref.id);
  if (!item) {
    console.warn('[degree-show] ref item not found:', ref);
    return [];
  }
  return Array.isArray(item.images) ? item.images
       : Array.isArray(item.albumImages) ? item.albumImages
       : [];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// event 名稱下方的 guests 清單（self 手填 / linked 從活動拉、含論壇 session 講者）：每人 EN/ZH 雙行、只顯示姓名（不含單位，user 2026-08-17）、xs regular
function renderEventGuests(guests) {
  if (!Array.isArray(guests) || guests.length === 0) return '';
  const rows = guests.map(g => {
    const en = g.nameEn ? escapeHtml(g.nameEn) : '';
    const zh = g.nameZh ? escapeHtml(g.nameZh) : '';
    if (!en && !zh) return '';
    return `<div class="mt-xs">${en ? `<p class="text-xs text-black font-regular mb-en-zh-s">${en}</p>` : ''}${zh ? `<p class="text-xs text-black font-regular" lang="zh-Hant">${zh}</p>` : ''}</div>`;
  }).join('');
  return `<div class="dsd-event-guests">${rows}</div>`;
}

// ── Ref btn (back btn 右邊) ─────────────────────────────────────────────────
// 從 data.events 抽 type !== 'exhibition' 的 events，flat 它們的 refs[]，渲染成 popover chip 列
// chip 點擊 → SPA 跳 /activities?section=X&item=Y
// 無 refs / 全 unresolvable → btn 整顆 display:none，setupStickyAndHeroChips 跳過 clip-reveal
// 樣式：btn 本身用 sticky-chip strict B/W（CSS）；popover chip 沿用 .lightbox-ref-card / .lightbox-ref-chip
// clip-reveal 顯隱由 setupStickyAndHeroChips 偵測 DOM 存在後加進 titleChips 陣列一起控
async function setupRefBtn(data) {
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('degree-show-ref-btn'));
  const popover = document.getElementById('degree-show-ref-popover');
  const stack = document.getElementById('degree-show-ref-stack');
  if (!btn || !popover || !stack) return;

  // 1) 後台 references M2A（source.js mapReferences）→ ref chip：活動連結（點了 SPA 跳活動頁）
  //    + library 文件（點了原地開 PDF lightbox、不跳 library）。與 events 清單並存（同一活動可同時是清單列 + ref chip）。
  const refs = Array.isArray(data.references) ? data.references : [];
  const resolved = refs.map(r => {
    if (r.kind === 'document') {
      return { kind: 'document', labelEn: 'Document', labelZh: '文件', titleEn: r.titleEn || '', titleZh: r.titleZh || '', pdfUrl: r.pdfUrl };
    }
    const label = SECTION_LABELS[r.source] || { en: '', zh: '' };
    return { kind: 'activity', section: r.source, itemId: r.id, labelEn: label.en, labelZh: label.zh, titleEn: r.titleEn || '', titleZh: r.titleZh || '' };
  });
  if (resolved.length === 0) {
    btn.style.display = 'none';
    return;
  }
  // 有文件 ref → 需共用 PDF viewer（sccd:open-pdf listener + auto-create DOM）；idempotent 重複呼叫安全（同 alumni）
  if (resolved.some(r => r.kind === 'document')) {
    import('./library-viewer.js').then(m => m.initPdfViewer()).catch(() => {});
  }

  // 3) 渲染 chip card — 結構同 lightbox-ref-btn renderChips（不抽共用函式：那邊綁 onClose lightbox 邏輯
  //    跟這邊純跳轉行為差別大；視覺結構直接複製成本低）
  stack.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'lightbox-ref-card';
  // 卡片 strict B/W（user 2026-06-02：黑底白字/白底黑字依 mode，不用三原色）。
  // bg 不放 card、改放每個 chip（default var(--theme-fg) / hover var(--theme-fg-inverse)）：card 留透明，
  // 旋轉後 hover 白填滿時不會從 card 邊漏 1px 細縫（無下層 card bg 可從旋轉邊 sub-pixel 漏色）。詳 hero.css scoped 規則
  card.style.background = 'transparent';
  card.style.transformOrigin = 'left center';
  // 卡片旋轉角度跟隨 ref btn（user 2026-06-02）：btn rotation 由 setupStickyAndHeroChips 設、晚於此處 render，
  // 故不在 render 時讀，改在 openPopover 開啟前即時讀 btn.style.transform 套上（同 lightbox-ref-btn.js 卡片跟隨 pill 角度）

  resolved.forEach(ref => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lightbox-ref-chip';
    row.dataset.refSection = ref.section;
    row.dataset.refItem = ref.itemId;
    row.innerHTML = `
      <div class="lightbox-ref-chip-label">
        ${ref.labelEn ? `<p class="text-xs">${escapeHtml(ref.labelEn)}</p>` : ''}
        ${ref.labelZh ? `<p class="text-xs">${escapeHtml(ref.labelZh)}</p>` : ''}
      </div>
      <div class="lightbox-ref-chip-title">
        <div class="lightbox-ref-chip-title-window">
          <div class="lightbox-ref-chip-title-track">
            <div class="lightbox-ref-chip-title-unit">
              ${ref.titleEn ? `<p class="text-s font-bold">${escapeHtml(ref.titleEn)}</p>` : ''}
              ${ref.titleZh ? `<p class="text-s font-bold">${escapeHtml(ref.titleZh)}</p>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    row.addEventListener('click', e => {
      e.stopPropagation();
      if (ref.kind === 'document') {
        // 文件 ref → 原地開 PDF lightbox（sccd:open-pdf，同 library/alumni），不跳 library
        const color = ['#00FF80', '#FF448A', '#26BCFF'][Math.floor(Math.random() * 3)];
        document.dispatchEvent(new CustomEvent('sccd:open-pdf', {
          detail: { pdfUrl: ref.pdfUrl, title: { en: ref.titleEn, zh: ref.titleZh }, color },
        }));
      } else {
        navigateToRef(ref);
      }
    });
    card.appendChild(row);
  });
  stack.appendChild(card);

  // 4) Label column 對齊 + marquee（沿用 lightbox-ref-btn 同邏輯）
  requestAnimationFrame(() => {
    alignLabelColumn(card, popover);
    setupChipMarquees(stack, popover);
  });

  // 5) popover 開合 + clip-reveal 進退
  let isOpen = false;
  let openAnim = null;

  function positionPopover() {
    // popover 用 position:fixed → 直接吃 viewport coord（不需扣 offsetParent）
    const btnRect = btn.getBoundingClientRect();
    const wasDisplay = popover.style.display;
    if (wasDisplay === 'none' || !wasDisplay) {
      popover.style.visibility = 'hidden';
      popover.style.display = 'block';
    }
    const popH = popover.offsetHeight;
    if (wasDisplay === 'none' || !wasDisplay) {
      popover.style.display = wasDisplay || 'none';
      popover.style.visibility = '';
    }
    popover.style.top = `${btnRect.top - popH}px`;
    // popover 自身 padding 32px → chip 左緣對齊 btn 左緣 = popover left = btn.left - 32
    popover.style.left = `${btnRect.left - 32}px`;
  }

  function openPopover() {
    if (isOpen) return;
    isOpen = true;
    popover.style.display = 'block';
    // 卡片旋轉跟隨 btn 當前角度（此時 setupStickyAndHeroChips 已套好 refBtn rotation）
    const rotMatch = btn.style.transform.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/);
    const rot = rotMatch ? parseFloat(rotMatch[1]) : 0;
    if (typeof gsap !== 'undefined') {
      if (openAnim) openAnim.kill();
      // 完全比照 album viewer 的 ref card（lightbox-ref-btn.js）= hero tight-wrapper yPercent reveal：
      // setupClipReveal 給 card 包 tight 遮罩 + set yPercent:100 → card 從容器底邊滑入「原地」揭露（不是淡入）。
      // 不用 playClipReveal（clearProps:transform 會清掉旋轉）；旋轉改用 gsap.set 才與 yPercent 同管不打架。
      // user 2026-06-08：指定對齊 album viewer 的 ref 卡片進出場（取代先前 clip-path / opacity fade）。
      setupClipReveal([card]);
      const wrapper = card.parentElement;
      if (wrapper && wrapper.classList.contains('clip-reveal-wrapper')) {
        // 補回 max-width 約束（同 lightbox-ref-btn）防長 title 把 card 撐到 max-content 破壞 popover 寬度
        wrapper.style.maxWidth = '100%';
        // 🔑 旋轉套「wrapper」不套 card（degree-show ref btn 有 ±3° 旋轉、viewer 的 btn 是 0°）：
        //   card 對 wrapper 仍 0° → reveal 滑入期間 card 完整貼合 wrapper、不會有旋轉角凸出 tight 遮罩被裁，
        //   整個 wrapper(含 card)視覺一起 tilt → 跟 viewer ref 卡同款乾淨滑入。
        //   原本套 card 會讓旋轉角凸出遮罩、滑入「先被切、onComplete 才 overflow:visible」(user 報「很怪」)。
        //   wrapper overflow 維持 setupClipReveal 預設（overflow-y:clip 遮罩 / overflow-x:visible），不再 toggle。
        gsap.set(wrapper, { rotation: rot });
      }
      positionPopover();
      openAnim = gsap.to(card, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter });
    } else {
      positionPopover();
    }
  }

  function closePopover(animated = true) {
    if (!isOpen) {
      popover.style.display = 'none';
      return;
    }
    isOpen = false;
    if (typeof gsap !== 'undefined' && animated) {
      if (openAnim) openAnim.kill();
      // 收合 = open 反向：card 在 tight wrapper 內 yPercent 0→100 往下滑回遮罩（與 album viewer ref card 同）。
      // wrapper overflow-y:clip 一直維持（旋轉套 wrapper、card 對 wrapper 0°）→ 下滑乾淨被遮、無需切 overflow。
      openAnim = gsap.to(card, {
        yPercent: 100,
        duration: DUR.fast,
        ease: EASE.exit,
        onComplete: () => { popover.style.display = 'none'; },
      });
    } else {
      popover.style.display = 'none';
    }
  }

  // 暴露 closePopover 給 setupStickyAndHeroChips 的 hideCard 用：
  // ref btn 隨 scroll clip-collapse 消失時，open 中的 popover 不該留在原位 → 一起收起
  /** @type {any} */ (btn)._closeRefPopover = () => closePopover(true);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (isOpen) closePopover(true); else openPopover();
  });

  // 點外面關閉
  const outsideClickHandler = (e) => {
    if (!isOpen) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (btn.contains(target) || popover.contains(target)) return;
    closePopover(true);
  };
  document.addEventListener('click', outsideClickHandler);
  registerPageCleanup(() => document.removeEventListener('click', outsideClickHandler));
}

// SPA 跳轉到 activities?section=X&item=Y（沿用既有 <a> click 路徑讓 router 接管 + push history）
function navigateToRef(ref) {
  const url = `/pages/activities.html?section=${encodeURIComponent(ref.section)}&item=${encodeURIComponent(ref.itemId)}`;
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Label column 等寬對齊（複用 lightbox-ref-btn 演算法）
function alignLabelColumn(card, popover) {
  const wasDisplay = popover.style.display;
  if (wasDisplay === 'none' || !wasDisplay) {
    popover.style.visibility = 'hidden';
    popover.style.display = 'block';
  }
  card.style.removeProperty('--ref-label-w');
  const labels = card.querySelectorAll('.lightbox-ref-chip-label');
  let maxW = 0;
  labels.forEach(el => {
    const w = el.getBoundingClientRect().width;
    if (w > maxW) maxW = w;
  });
  if (wasDisplay === 'none' || !wasDisplay) {
    popover.style.display = wasDisplay || 'none';
    popover.style.visibility = '';
  }
  if (maxW > 0) card.style.setProperty('--ref-label-w', `${Math.ceil(maxW)}px`);
}

// chip title 溢出 → dual-copy 並跑 marquee（複用 lightbox-ref-btn 演算法）
function playRefChipMarquee(chip) {
  const win = /** @type {HTMLElement | null} */ (chip.querySelector('.lightbox-ref-chip-title-window'));
  const track = /** @type {HTMLElement | null} */ (chip.querySelector('.lightbox-ref-chip-title-track'));
  if (!win || !track) return;
  if (typeof gsap !== 'undefined') gsap.killTweensOf(track);
  track.style.transform = '';
  while (track.children.length > 1) track.removeChild(track.lastElementChild);
  const unit = /** @type {HTMLElement | null} */ (track.querySelector('.lightbox-ref-chip-title-unit'));
  if (!unit) return;
  const unitWidth = unit.getBoundingClientRect().width;
  if (unitWidth <= win.clientWidth + 4) return;
  const clone = /** @type {HTMLElement} */ (unit.cloneNode(true));
  clone.style.marginLeft = '24px';
  track.appendChild(clone);
  const distance = unitWidth + 24;
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(track, { x: 0 }, { x: -distance, duration: Math.max(3, distance / 80), ease: 'none', repeat: -1 });
  }
}
// 還原成靜態截斷單份（桌面 resting / hover 離開 snap 回原點）
function resetRefChipMarquee(chip) {
  const track = /** @type {HTMLElement | null} */ (chip.querySelector('.lightbox-ref-chip-title-track'));
  if (!track) return;
  if (typeof gsap !== 'undefined') { gsap.killTweensOf(track); gsap.set(track, { x: 0 }); }
  track.style.transform = '';
  while (track.children.length > 1) track.removeChild(track.lastElementChild);
}

// Title overflow → marquee（dual-copy seamless loop，複用 lightbox-ref-btn 演算法）
// 觸發分桌面/手機（user 2026-06-21，對齊圖片燈箱綠框 ref popover）：手機自動跑、桌面 hover chip 才跑、離開 snap 回原點。
// 此函式在 render 時（rAF）跑，popover 仍 display:none → 量寬會全 0、永遠判定不 overflow（user 2026-06-02
// 反映長 title 不 marquee 被切）。比照 alignLabelColumn / lightbox setupAllMarquees：量前暫時 display:block
// + visibility:hidden 撐出 layout 才能量到真實寬度，量完還原。
function setupChipMarquees(stack, popover) {
  const wasDisplay = popover.style.display;
  if (wasDisplay === 'none' || !wasDisplay) {
    popover.style.visibility = 'hidden';
    popover.style.display = 'block';
  }
  const mobile = isMobileView();
  stack.querySelectorAll('.lightbox-ref-chip').forEach(chip => {
    if (mobile) { playRefChipMarquee(chip); return; } // 手機：自動跑
    resetRefChipMarquee(chip);                        // 桌面：靜態截斷，等 hover
    // hover 綁整個 chip；dataset guard 防一次 open 內 setupChipMarquees 多跑重複綁（chip 每次 renderChips 重建故跨 open 不累積）
    if (!chip.dataset.marqueeHoverBound) {
      chip.dataset.marqueeHoverBound = '1';
      chip.addEventListener('mouseenter', () => playRefChipMarquee(chip));
      chip.addEventListener('mouseleave', () => resetRefChipMarquee(chip));
    }
  });
  if (wasDisplay === 'none' || !wasDisplay) {
    popover.style.display = wasDisplay || 'none';
    popover.style.visibility = '';
  }
}

// ── Sticky info card ───────────────────────────────────────────────────────
// 兩個 chip 設計：
//   - title chip（h5）：英上中下同 chip
//   - branch chip（p1）：英上中下同 chip，依當前 event 切換內容
// 動畫：clip-path inset(0 0 100% 0) → inset(0 0 0 0)（由上往下 reveal）；收起同方向
// 進場時機：description section pt-6xl 結束點之後（chip 出現在描述段落上方視覺對齊處）
// 退場時機：Next Project section 進場前
// chip 寬度貼齊「實際最長一行」文字寬 → 左右 padding 對稱（沿用 footer applyOfficeSnugWidth 同法）。
// 為何需要：max-content + max-width(col-span-4) cap 後，長名 wrap，但 box 仍停在 cap 寬 → 比最長 render 行寬、
//   右側留白、左右 padding 不對稱。CSS 無法讓 box 縮到「最長 wrap 行」，故用 JS 量 Range 每行 rect 取最寬。
// rotation 處理：.sticky-chip outer 帶隨機 rotate，getClientRects 會在旋轉座標 → 量測前暫關 outer transform 再還原。
function snugChipWidth(inner) {
  if (!inner || typeof inner.getBoundingClientRect !== 'function') return;
  const outer = inner.closest('.sticky-chip, .sticky-event-chip');
  const savedTransform = outer ? outer.style.transform : null;
  if (outer) outer.style.transform = 'none';     // 量測時拿掉旋轉，避免 rect 在旋轉座標被放大
  inner.style.width = 'max-content';             // 回 max-content（被 max-width cap → 在 cap 內 wrap）
  void inner.offsetWidth;                        // force reflow
  const cs = getComputedStyle(inner);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const left = inner.getBoundingClientRect().left + padL;
  let maxRight = 0;
  const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      const off = r.right - left;
      if (off > maxRight) maxRight = off;
    }
  }
  if (maxRight > 0) inner.style.width = `${Math.ceil(maxRight) + padL + padR}px`;
  if (outer) outer.style.transform = savedTransform;  // 還原旋轉
}

// Branch 切換：scroll 進入下一個 event → 先收 → 換字 → 展（不可直接切換文字）
// 每張 chip 隨機旋轉 -3°~3°（避開 0），整卡隨機 accent 底色
/** @param {{ title?: string, title_en?: string }} data */
function setupStickyAndHeroChips(data, year) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (isMobileView()) return; // 手機／矮橫向不做（用手機式堆疊 hero；桌面 sticky chip 系統跳過）

  const card = document.getElementById('sticky-info-card');
  const yearChip = document.getElementById('sticky-year-chip');
  const yearEl = document.getElementById('sticky-year');
  const titleChip = document.getElementById('sticky-title-chip');
  const titleEnEl = document.getElementById('sticky-title-en');
  const titleZhEl = document.getElementById('sticky-title');
  const eventsNav = document.getElementById('sticky-events-nav');     // window（overflow:hidden，reveal 用 clip-path）
  const eventsTrack = document.getElementById('sticky-events-track'); // track（translateY 讓 current 對齊窗頂）
  // 返回按鈕跟 sticky title 同步 fade（同 trigger 範圍），只有顯示時可點
  const backBtn = /** @type {HTMLElement | null} */ (document.getElementById('degree-show-back-btn'));
  // Ref btn：setupRefBtn 已決定是否 display:none（無 refs 時整顆消失）；display:none 時不加進 titleChips 陣列
  const refBtnEl = /** @type {HTMLElement | null} */ (document.getElementById('degree-show-ref-btn'));
  const refBtn = (refBtnEl && refBtnEl.style.display !== 'none') ? refBtnEl : null;
  if (!card || !titleChip || !titleEnEl || !titleZhEl) return;

  // 填初始文字 — 套到 inner span 而非外 chip wrapper。空的那語 → display:none，免 block 空 span 撐一行
  // 高度（=色卡內多一條空白）；兩語皆空則整顆 title chip 隱藏（同 branch chip，避免空殼色塊）。
  titleEnEl.textContent = data.title_en || '';
  titleEnEl.style.display = data.title_en ? '' : 'none';
  titleZhEl.textContent = data.title || '';
  titleZhEl.style.display = data.title ? '' : 'none';
  titleChip.style.display = (data.title_en || data.title) ? '' : 'none';
  // year label：單值（非雙語），無 year 則整顆隱藏（不進 titleChips reveal 陣列）
  if (yearEl) yearEl.textContent = year || '';
  if (yearChip) yearChip.style.display = year ? '' : 'none';

  // 隨機 accent + 旋轉
  // - bg 套到 .sticky-chip-inner（撐 padding 的 element）
  // - rotation + clip-path 套到外 .sticky-chip wrapper（reveal 時整塊 chip 含 padding 一起被 wipe）
  const ACCENT = ['#00FF80', '#FF448A', '#26BCFF'];
  const cardColor = ACCENT[Math.floor(Math.random() * ACCENT.length)];
  const branchPool = ACCENT.filter(c => c !== cardColor);
  const branchColor = branchPool[Math.floor(Math.random() * branchPool.length)]; // active event chip 底色（跟 title 錯開）
  const randRot = () => { let d; do { d = Math.round((Math.random() * 6 - 3) * 10) / 10; } while (Math.abs(d) < 0.5); return d; };

  const titleInner = titleChip.querySelector('.sticky-chip-inner');
  const yearInner = yearChip ? yearChip.querySelector('.sticky-chip-inner') : null;
  if (titleInner) /** @type {HTMLElement} */ (titleInner).style.background = cardColor;
  if (yearInner) /** @type {HTMLElement} */ (yearInner).style.background = cardColor; // year box 跟 title 同底色（user 2026-08-18）
  titleChip.style.transform = `rotate(${randRot()}deg)`;
  if (yearChip) yearChip.style.transform = `rotate(${randRot()}deg)`;
  if (backBtn) backBtn.style.transform = `rotate(${randRot()}deg)`;
  if (refBtn) refBtn.style.transform = `rotate(${randRot()}deg)`;

  // chip 寬度貼齊文字（左右 padding 對稱）：title 在 fonts.ready 後量（字型未載完量錯寬）；event chip 在 buildEventsNav 量。
  // resize 重量（max-width col-span-4 隨 viewport 變、JS 鎖的是定 px 會 stale）。
  if (titleInner) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => snugChipWidth(titleInner));
  const resnugChips = () => {
    if (titleInner) snugChipWidth(titleInner);
    document.querySelectorAll('#sticky-events-track .sticky-chip-inner').forEach(el => snugChipWidth(el));
  };
  window.addEventListener('resize', resnugChips);
  registerPageCleanup(() => window.removeEventListener('resize', resnugChips));

  // clip-path 留 -12px buffer（仿 atlas .atlas-layout-inner）：ref btn hover 時 inner rotate(15deg) 角會超出 box，
  // buffer 確保旋轉角不被 clip 切掉；HIDDEN wiped 邊用 calc(100% + 12px) 同帶 buffer（CSS 預設同步見 hero.css .sticky-chip）
  const HIDDEN = 'inset(-12px -12px calc(100% + 12px) -12px)';
  const SHOWN = 'inset(-12px -12px -12px -12px)';
  // hero 式 clip-reveal（滑動＋遮罩，同全站 nav chip navChipHidden，2026-07-16）：clip 遮罩之外再加 translate 滑入。
  // 方向 key → buffered clip（-12px buffer 免切 ref hover 旋轉角）；translate 取 scroll-animate 的 navChipHidden
  // （沿 chip 旋轉軸算位移、與 inline rotate 共存）。BUF_CLIP[dir] = navChipHidden(dir).clip 的 buffered px 版。
  const BUF_CLIP = {
    bottom: HIDDEN,                                       // 藏在下：window 在上（reveal 由下往上滑入）
    top:    'inset(calc(100% + 12px) -12px -12px -12px)', // 藏在上（由上往下滑入）
    right:  'inset(-12px calc(100% + 12px) -12px -12px)', // 藏在右（由右往左滑入）
    left:   'inset(-12px -12px -12px calc(100% + 12px))', // 藏在左（由左往右滑入）
  };
  const BRANCH_DIR_KEYS = Object.keys(BUF_CLIP);
  const bufHidden = (el, dir) => ({ clipPath: BUF_CLIP[dir], translate: navChipHidden(el, dir).translate });

  // titleChips = [titleChip, backBtn, refBtn]：三者描述段 reveal、next-project 段 collapse 全程同步
  // refBtn 若 setupRefBtn 已 hide（無 refs）則不加入；events nav 獨立 reveal（setEventsNavState）、各 gallery ST 控高亮
  const titleChips = [];
  if (yearChip && yearChip.style.display !== 'none') titleChips.push(yearChip); // 年份在最上、reveal 由上往下起
  titleChips.push(titleChip);
  if (backBtn) titleChips.push(backBtn);
  if (refBtn) titleChips.push(refBtn);
  // 初始藏定位：CSS 已給 clip HIDDEN，補 translate hidden 讓「第一次」reveal 也滑入（非只原地 wipe）。
  // 'bottom' 用高度算位移 → 不受後續 snugChipWidth 改寬影響。title/back/ref 群統一由下往上滑（成組節奏一致）。
  titleChips.forEach(chip => { chip.style.translate = bufHidden(chip, 'bottom').translate; });

  function setChipsState(chips, visible, stagger = 0.08) {
    chips.forEach((chip, i) => {
      chip.style.transitionDelay = `${i * stagger}s`;
      chip.style.clipPath = visible ? SHOWN : HIDDEN;
      chip.style.translate = visible ? NAV_CHIP_SHOWN.translate : bufHidden(chip, 'bottom').translate;
    });
  }

  // === Events nav（取代原單一 branch chip；user 2026-08-18「全部 event 恆顯、current 對齊頂部、舊的往上收起」，以 about nav btn 為主）===
  // 依 .event-gallery-section（有 branch 名的）一 chip 一列填 track；current = viewport center 落在哪個 gallery。
  const eventChips = [];       // { wrap, section, navIdx }
  let currentEventIdx = -1;    // -1 = 尚未進任何 gallery（全列表齊頂、無高亮、track 不位移）
  function buildEventsNav() {
    if (!eventsNav || !eventsTrack) return;
    const secs = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.event-gallery-section')))
      .filter(s => s.dataset.branchEn || s.dataset.branchZh);
    if (secs.length === 0) { eventsNav.style.display = 'none'; return; }
    eventsTrack.innerHTML = '';
    secs.forEach((section, navIdx) => {
      const en = section.dataset.branchEn || '';
      const zh = section.dataset.branchZh || '';
      const wrap = document.createElement('div');
      // anchor-nav-btn/-inner＝直接吃 about nav btn 的三 mode 規則（buttons/inverse/color.css 整組 selector，
      // 含 mode3 inactive bg=var(--theme-bg) 跟 body hue 同步、active strict B/W、hover 升對比；user 2026-08-18）
      wrap.className = 'sticky-event-chip anchor-nav-btn';
      wrap.style.transform = `rotate(${randRot()}deg)`;   // 每顆各自 base 旋轉（同 about nav btn 未選態）
      const inner = document.createElement('span');
      inner.className = 'sticky-chip-inner anchor-nav-inner text-s font-bold';
      const enSpan = document.createElement('span'); enSpan.className = 'block'; enSpan.textContent = en; if (!en) enSpan.style.display = 'none';
      const zhSpan = document.createElement('span'); zhSpan.className = 'block'; zhSpan.setAttribute('lang', 'zh-Hant'); zhSpan.textContent = zh; if (!zh) zhSpan.style.display = 'none';
      inner.append(enSpan, zhSpan);
      wrap.appendChild(inner);
      // 可點：捲到該子展覽（真 nav btn；落點靠 section scroll-margin-top）
      wrap.addEventListener('click', () => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      eventsTrack.appendChild(wrap);
      eventChips.push({ wrap, section, navIdx });
    });
    eventsNav.style.display = '';
    setEventsNavState(false);   // 初始藏（card 尚未 show，不閃）
    // 量寬貼齊文字（左右 padding 對稱），字型載完再量
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => eventChips.forEach(ec => snugChipWidth(ec.wrap.querySelector('.sticky-chip-inner'))));
  }

  // current 對齊窗頂：track 位移 -（current chip 的 offsetTop）→ 它上面的（已看過）滑出窗頂被 overflow:hidden 裁掉；
  // idx=-1 → 位移 0（全列表齊頂、無高亮）
  function setActiveEvent(idx) {
    if (currentEventIdx === idx) return;
    currentEventIdx = idx;
    eventChips.forEach(ec => {
      const active = ec.navIdx === idx;
      ec.wrap.classList.toggle('active', active);
      /** @type {HTMLElement} */ (ec.wrap.querySelector('.sticky-chip-inner')).style.background = active ? branchColor : '';
    });
    const active = eventChips.find(ec => ec.navIdx === idx);
    eventsTrack.style.transform = `translateY(${active ? -active.wrap.offsetTop : 0}px)`;
  }

  // window reveal：clip-path 四方向隨機滑入（同原 branch chip 手法；overflow:hidden 仍負責裁掉往上收起的舊 chip）
  let eventsNavHiddenDir = 'bottom';
  function setEventsNavState(visible) {
    if (!eventsNav || eventChips.length === 0) return;
    if (visible) {
      eventsNavHiddenDir = BRANCH_DIR_KEYS[Math.floor(Math.random() * BRANCH_DIR_KEYS.length)];
      const hid = bufHidden(eventsNav, eventsNavHiddenDir);
      eventsNav.style.transition = 'none';
      eventsNav.style.clipPath = hid.clipPath;
      eventsNav.style.translate = hid.translate;
      void eventsNav.offsetHeight;
      eventsNav.style.transition = '';
      eventsNav.style.clipPath = SHOWN;
      eventsNav.style.translate = NAV_CHIP_SHOWN.translate;
    } else {
      const hid = bufHidden(eventsNav, eventsNavHiddenDir);
      eventsNav.style.clipPath = hid.clipPath;
      eventsNav.style.translate = hid.translate;
    }
  }
  buildEventsNav();

  // === Hero → Sticky 銜接動畫 ===
  // 概念：scroll 過 description section 的 pt 邊界時，hero 三 chip 用「進場反向」clip-reveal 收起，
  //       同時 sticky chip 由上往下 clip-reveal 出現（視覺上像 hero 變成 sticky）
  // 退場：scroll 回 description 上方 → sticky 收起 + hero chip clip-reveal 回原位
  // hero chip clip 由 hero-animation 的 wrapper overflow:hidden 處理，這裡直接動 chip yPercent
  // 不帶 opacity fade — 純粹 yPercent 推出 wrapper 由 overflow 裁出 clip-reveal 視覺
  const heroSection = document.querySelector('[data-hero-title-last]');
  // description section = hero 之後第一個 section（含 pt-6xl）
  const descSection = heroSection ? heroSection.nextElementSibling : null;
  let cardShown = false;

  // hero 文字「只進場一次（load 由 hero-animation 動一次）然後就 stay、跟著頁面自然捲走」（user 2026-06-08）。
  // 不再收/展 hero（原本 instant visibility 切換會在 sticky 出現時讓 hero「跳一下消失」= user 不要的）。
  // 為了讓 hero 自然捲走又不跟 sticky chip 重疊（兩者都在左上、scroll 中段會疊到），改成
  // **延後 sticky 出現的 trigger 到 hero 已捲到 sticky 位置上方**（見下方 ScrollTrigger start），故無須再收 hero。
  const STICKY_REVEAL_DELAY_MS = 0;
  let stickyRevealTimer = null;

  function showCard() {
    if (cardShown) return;
    cardShown = true;
    card.style.visibility = 'visible';
    gsap.to(card, { opacity: 1, duration: DUR.fast, ease: EASE.enterSoft, overwrite: true });
    // backBtn / refBtn clip-path 收起時不該被點到 — show 時立即 visible 讓 hit-test 開啟
    if (backBtn) backBtn.style.visibility = 'visible';
    if (refBtn) refBtn.style.visibility = 'visible';
    // sticky chip reveal（hero 不再收/展，trigger 已延後到 hero 捲離 → 不會重疊）
    if (stickyRevealTimer) { clearTimeout(stickyRevealTimer); stickyRevealTimer = null; }
    stickyRevealTimer = setTimeout(() => {
      if (!cardShown) return;  // 期間被 hideCard 打斷 → 不 reveal
      setChipsState(titleChips, true);
      // events nav 不在此 reveal — 改由下方 event-galleries-root ST 控制，只在進入第一個 event gallery 才出現
      // （user 2026-08-18：列表 / 主影片區只剩 title，nav chip 到第一個 event section 才現身）
    }, STICKY_REVEAL_DELAY_MS);
  }
  function hideCard() {
    if (!cardShown) return;
    cardShown = false;
    // 取消 pending sticky reveal — 避免「showCard 排好延遲、user 快速 scroll 回去」期間 reveal 仍會 fire
    if (stickyRevealTimer) { clearTimeout(stickyRevealTimer); stickyRevealTimer = null; }
    setChipsState(titleChips, false);
    // ref btn 跟著 clip-collapse 消失 → open 中的 ref popover 一起收起（不留在原位）
    if (refBtn && typeof (/** @type {any} */ (refBtn)._closeRefPopover) === 'function') {
      /** @type {any} */ (refBtn)._closeRefPopover();
    }
    // events nav 收起 window + 重置 active（下次 scroll 回來各 gallery ST 重新 setActiveEvent）
    setEventsNavState(false);
    setActiveEvent(-1);
    gsap.to(card, {
      opacity: 0,
      duration: DUR.fast,
      delay: 0.5,
      ease: EASE.exitSoft,
      overwrite: true,
      onComplete: () => { if (!cardShown) card.style.visibility = 'hidden'; },
    });
    // backBtn / refBtn clip-path collapse 完成（0.5s + 最後 chip stagger delay 0.16s ≈ 0.66s）→ 設 hidden 阻擋 hit-test
    if (backBtn) {
      setTimeout(() => {
        if (!cardShown && backBtn) backBtn.style.visibility = 'hidden';
      }, 700);
    }
    if (refBtn) {
      setTimeout(() => {
        if (!cardShown && refBtn) refBtn.style.visibility = 'hidden';
      }, 700);
    }
    // hero 不再收/展（stay + 自然捲動），故 hideCard 不需 showHeroChips
  }

  // 離頁退場（user 2026-06-08「左邊這些 btn 點別頁時也要一起出場」）：sticky 卡顯示中才收，
  // title/back/ref chip + branch chip 一起 clip-path collapse（沿用 setChipsState 的 CSS clip 收合），
  // 回 Promise 讓 router await（clip 0.6s + 末 chip stagger ≈ 0.66s → 700ms）；沒顯示則 no-op。
  registerPageExit(() => {
    if (!cardShown) return Promise.resolve();
    setChipsState(titleChips, false);
    setEventsNavState(false);
    return new Promise(res => setTimeout(res, 700));
  });

  // trigger 用 description section 自己：top + pt-6xl(96px) 經過 viewport center 為邊界。
  // chip 位於 sticky top:50%（viewport center），description content baseline 經過 chip 位置 → 出現；
  // scroll 回 baseline 上方 → 收起。
  // end 用 next-project section top 當邊界 — 整段內容（events list / albums / 主影片 / 紀錄影片）都顯示 sticky title。
  // events nav 只在 event-galleries-root 範圍內顯示（由下方獨立 ST 控制），列表 / 影片區只剩 title。
  const galleriesRoot = document.getElementById('event-galleries-root');
  const nextProjectSection = document.getElementById('next-project-section');
  if (descSection && nextProjectSection) {
    ScrollTrigger.create({
      trigger: descSection,
      // 延後到 descSection top 捲到 viewport top+200（= sticky chip 的 top:200 位置）才出 sticky：
      // 此時 hero 文字（在 hero section 底、pb-2xl）已捲到 sticky 上方 → sticky 出現不跟 hero 重疊，
      // hero 得以「stay + 自然捲走」不必收（user 2026-06-08）。原 'top+=96 center' 太早、hero 還在 sticky 位置會疊。
      start: 'top top+=200',
      endTrigger: nextProjectSection,
      end: 'top center',        // next-project top 過 viewport center → sticky 全收
      onEnter: showCard,
      onLeave: hideCard,
      onEnterBack: showCard,
      onLeaveBack: hideCard,
    });
  }

  // === Events nav 高亮切換（scroll-spy，取代原 branch chip 換字）===
  // current = viewport center 落在哪個 gallery（start+end 都用 center，上下對稱）；setActiveEvent 換高亮 + track 位移。
  // 各 chip 恆顯不換字，故不需 branch 的收→換字→展流程。
  eventChips.forEach(ec => {
    ScrollTrigger.create({
      trigger: ec.section,
      start: 'top center',
      end: 'bottom center',
      onEnter: () => setActiveEvent(ec.navIdx),
      onEnterBack: () => setActiveEvent(ec.navIdx),
    });
  });

  // Events nav 顯隱 = 只在 event-galleries-root 範圍內（user 2026-08-18「nav chip 到第一個 event section 才出現」）：
  //   進第一個 gallery（top center）→ reveal window；往下進紀錄影片 / 往上回列表·主影片 → 收起（影片區只剩 title）。
  //   往上完全離開整個 galleries → 併復位成「全列表齊頂、無高亮」；往下離開不復位（最後一個 event 維持釘頂高亮）。
  if (galleriesRoot) {
    ScrollTrigger.create({
      trigger: galleriesRoot,
      start: 'top center',
      end: 'bottom center',
      onEnter: () => setEventsNavState(true),
      onEnterBack: () => setEventsNavState(true),
      onLeave: () => setEventsNavState(false),
      onLeaveBack: () => { setEventsNavState(false); setActiveEvent(-1); },
    });
  }
}