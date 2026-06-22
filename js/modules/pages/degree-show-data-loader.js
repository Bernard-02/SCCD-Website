/* global gsap, ScrollTrigger */
/**
 * Degree Show Data Loader
 * 負責讀取 Degree Show JSON 資料並渲染列表與詳情頁
 */

import { initDegreeShowGallery, SLOT_LEFTS_MOBILE, IMG_WIDTH_MOBILE } from './degree-show-gallery.js';
import { initHeroAnimation } from './hero-animation.js';
import { initHeroMobileSync } from './hero-mobile-sync.js';
import { animateCardsClipReveal, playRevealExit, playClipPathExit, setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';
import { createClassImagesSlideshow } from './about/class-images-slideshow.js';
import { getSectionData, findItemById, SECTION_LABELS } from './activities-data-loader.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { sitePath } from '../ui/site-base.js';
import { DUR, EASE } from '../ui/motion.js';

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

export async function loadDegreeShowList() {
  await loadDegreeShowListInto('degree-show-list');
  // 獨立頁 /degree-show：cards 進 viewport 才 reveal（panel-switch 路徑由 activities-section-switch 接管，不用此分支）
  // 沿用全站 clip-reveal helper，跟其他 list 同節奏
  const cards = document.querySelectorAll('#degree-show-list .degree-show-card');
  if (cards.length) animateCardsClipReveal(cards, true);
}

export async function loadDegreeShowListInto(containerId) {
  try {
    // 讀本地 JSON（WP-headless 邏輯已移除 2026-06-05）；之後 flip 接 Directus 時改 Directus 為主 + 本地 fallback。
    const data = await fetch(sitePath('data/degree-show.json')).then(r => r.json());

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
    // 讀本地 JSON（WP-headless 邏輯已移除 2026-06-05）；之後 flip 接 Directus 時改 Directus 為主 + 本地 fallback。
    const degreeShowData = await fetch(sitePath('data/degree-show.json')).then(r => r.json());
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

      // 手機 hero chips 直接填：本頁桌面字卡（年份/英標/中標）放在 .hero-rand-grid 外，
      // 共用 hero-mobile-sync 只 querySelector .hero-rand-grid 內 → 掃不到、3 個手機 chip 永遠空白。
      // 這裡手動同步：text-en=年份、title=英文名、title-cn=中文名（對齊桌面字卡內容）。
      const mYearEl = document.querySelector('.hero-mobile .hero-mobile-text-en');
      const mTitleEnEl = document.querySelector('.hero-mobile .hero-mobile-title');
      const mTitleZhEl = document.querySelector('.hero-mobile .hero-mobile-title-cn');
      if (mYearEl) mYearEl.textContent = year;
      if (mTitleEnEl) mTitleEnEl.textContent = data.title_en || '';
      if (mTitleZhEl) mTitleZhEl.textContent = data.title || '';

      // 描述文字進場 + 離頁退場：clip-reveal 套在內層 <h5>（不套外層 col div，否則 reparent 會丟失
      // md:col-start-* grid placement）；兩段 h5 同節奏 reveal、離頁反向沉出（流式 block 用 playRevealExit）
      const descEnH5 = descEnEl ? descEnEl.closest('h5') : null;
      const descCnH5 = descCnEl ? descCnEl.closest('h5') : null;
      const descBlocks = [descEnH5, descCnH5].filter(Boolean);
      if (descBlocks.length) {
        setupClipReveal(descBlocks);  // 預設藏（yPercent）
        const descSec = descBlocks[0].closest('section');
        // 線性 stagger（非 grid-auto）→ 嚴格 DOM 順序：英文(左)先、中文(右)後（user 要英先中後）
        const playDesc = () => playClipReveal(descBlocks, { stagger: { each: 0.12 } });
        if (descSec && typeof ScrollTrigger !== 'undefined') {
          // 已在視窗上半才立即播（once ST 對「建立當下已過 start」的元素觸發不可靠）；否則捲到才播
          const r = descSec.getBoundingClientRect();
          if (r.top < (window.innerHeight || 0) * 0.8) playDesc();
          else ScrollTrigger.create({ trigger: descSec, start: 'top 80%', once: true, onEnter: playDesc });
        } else {
          playDesc();
        }
        registerPageExit(() => playRevealExit(descBlocks));
      }

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

      // Events 列表（時間 / 活動 / 地點 / 城市 — 1:2:2:1）：data.events 不存在或空陣列 → 整塊不渲染
      // 活動 / 地點 / 城市顯示中英雙語（英文上、中文下）；時間僅一行；文字 semibold
      const eventsSection = document.getElementById('events-section');
      const eventsList = document.getElementById('events-list');
      if (eventsSection && eventsList) {
        if (Array.isArray(data.events) && data.events.length > 0) {
          // 手機：2 欄（時間 | 其餘）— 右欄 flex-col 把 活動/地點/城市 疊成 3 row（md:contents 在桌面解開
          // wrapper，讓 3 個 child 回到外層 grid → 維持桌面 時間/活動/地點/城市 4 欄 1:2:2:1 不變）
          // 時間欄手機固定 5rem 寬（所有列對齊同一 col，不因日期長短忽寬忽窄）；連續日期(含 " - ")結束日換到
          // 起始日下方（窄欄 → 右側內容空間更大）；桌面 md:inline 還原成單行 "起 - 迄"。
          eventsList.innerHTML = data.events.map((ev, i) => {
            const tp = (ev.time || '').split(/\s*-\s*/);
            // 桌面：整串單行；手機：連續日期結束日換到起始日下方（<br>），whitespace-nowrap 讓各行不再內部 wrap
            const timeInner = tp.length === 2
              ? `<span class="hidden md:inline">${ev.time}</span><span class="md:hidden">${tp[0]} -<br>${tp[1]}</span>`
              : (ev.time || '');
            return `
            <div class="grid grid-cols-[4rem_1fr] md:grid-cols-[1fr_2fr_2fr_1fr] gap-sm md:gap-md ${i > 0 ? 'mt-xl md:mt-md' : ''}">
              <p class="text-p1 text-black font-semibold whitespace-nowrap">${timeInner}</p>
              <div class="flex flex-col gap-sm md:contents">
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
            </div>
          `;
          }).join('');
          eventsSection.classList.remove('hidden');
          // 事件清單進場 + 離頁退場：每列各自 clip-reveal（rows 在 #events-list 內是一般 block flow，wrap 安全）
          const eventRows = Array.from(eventsList.children);
          if (eventRows.length) {
            animateCardsClipReveal(eventRows, true);
            registerPageExit(() => playRevealExit(eventRows));
          }
        } else {
          eventsSection.classList.add('hidden');
          eventsList.innerHTML = '';
        }
        // 無 events（子展覽清單）時 description section 不需保留 min-height:100vh（那塊空間原是給 events list）→ 移除，
        // 免得 description 短 + events 隱藏時下方留一整屏白、把主影片推到很下面（user 2026-06-08）。
        if (!(Array.isArray(data.events) && data.events.length > 0)) {
          const descSec = eventsSection.closest('section');
          if (descSec) descSec.style.minHeight = '0';
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

// ── 手機 hero 進退場 ────────────────────────────────────────────────────────
// 比照桌面 hero-animation 的邏輯做手機版：
//   - 3 張字卡各包一層 overflow:hidden mask wrapper，從隨機 4 方向滑入（= 桌面 hero-title-wrapper 同構）
//   - 進場順序對齊桌面 data-hero-enter：年份(1) 先進、英中標題(2) 一起、+0.5s 接續
//   - bg 圖 clip-path 隨機方向 reveal（= 桌面 .hero-banner 進場）
//   - 退場反向：chip 隨機方向滑出 + bg clip 收合（同桌面 playHeroExit 0.5s / stagger 0.06）
// 旋轉 var 細節：CSS `.hero-mobile-text > *` 對「直接子元素」套 rotate(--hero-mobile-rot)；
// chip 包進 wrapper 後不再是直接子 → 把 chip 的 inline rotation var 轉移到 wrapper（旋轉跟著 wrapper，
// chip 在 rotated mask 內滑動，同桌面 wrapper rotate + child slide 的結構）。margin 同理轉移。
function setupHeroMobileEntrance() {
  if (window.innerWidth >= 768 || typeof gsap === 'undefined') return;
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
  const INSETS = ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 100% 0% 0%)'];
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
  if (bg) gsap.set(bg, { clipPath: pick(INSETS) });

  // paused + double-rAF 才 play：loadDegreeShowDetail 後段（events/galleries render）會把首次 paint
  // 拖到 timeline 開跑後 ~900ms —— GSAP 時間制，paint 出來時年份 0.9s tween 已近跑完 = 視覺「閃一下出來」
  // （user 2026-06-11；playwright 實測首個可見 frame 年份已在 90% 進度）。等 paint 後才起跑，整段進場可見。
  const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.enter } });
  if (bg) {
    tl.to(bg, { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.reveal, clearProps: 'clipPath' }, 0);
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
      if (bg) {
        out.fromTo(bg, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: pick(INSETS), duration: 0.5, ease: EASE.exit, overwrite: true }, 0);
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

  // 手機 stack（年份 / 英文名 / 中文名 — user 2026-06-11 補英文名）
  const setMobile = (key, year, data) => {
    const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById(`${key}-link-m`));
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById(`${key}-img-m`));
    const yearEl = document.getElementById(`${key}-year-mobile`);
    const titleEnEl = document.getElementById(`${key}-title-en-mobile`);
    const titleEl = document.getElementById(`${key}-title-mobile`);
    if (link) link.href = '/degree-show-detail?year=' + year;
    if (img) img.src = data.poster || data.coverImage;
    if (yearEl) yearEl.textContent = year;
    if (titleEnEl) titleEnEl.textContent = data.title_en || '';
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
    registerPageCleanup(() => window.removeEventListener('resize', recompute));
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
            duration: DUR.medium,
            ease: 'cubic-bezier(0.25, 0, 0, 1)',
          });
        }
      });
    };
    setupReveal('prev-card', 'inset(0% 100% 0% 0%)');
    setupReveal('next-card', 'inset(0% 0% 0% 100%)');
  }

  // 離頁退場：clip-path 收掉兩張卡（= 進場 clip-reveal 的反向，與進場對稱）。
  // playClipPathExit 讀 inline clipPath：已 reveal 的卡（inline=inset(0)）→ gsap.to 收合；
  // viewportOnly 會略過尚未捲到（仍在 hidden inset、不在視窗）的卡 → 不會閃全開。
  registerPageExit(() => playClipPathExit([prevCard, nextCard].filter(Boolean)));
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

// 手機 event 標題（user 2026-06-11：任何子展覽都是先 title → 説明文字 → slideshow）：
// 桌面標題由 sticky branch chip 顯示（#sticky-info-card hidden md:block 手機看不到）→
// 手機簡化成每個子展覽區塊頂部直接放標題；md:hidden 桌面零影響。
// 樣式：隨機 accent 底 chip + 黑字 + p1 bold（user 2026-06-11；accent 底一律黑字的全站對比規範）
// withContainer：exhibition section 無 site-container 包裹，標題自帶；ref-based 的 wrap 已是 site-container
const TITLE_ACCENTS = ['#00FF80', '#FF448A', '#26BCFF'];
function buildMobileEventTitle(branchEn, branchZh, withContainer) {
  if (!branchEn && !branchZh) return null;
  const el = document.createElement('div');
  el.className = withContainer ? 'md:hidden site-container mb-md' : 'md:hidden mb-md';
  const accent = TITLE_ACCENTS[Math.floor(Math.random() * TITLE_ACCENTS.length)];
  el.innerHTML = `<div class="event-mobile-title-chip" style="display:inline-block;width:fit-content;padding:0.4rem 0.6rem;background:${accent};">${branchEn ? `<p class="text-p1 text-black font-bold">${escapeHtml(branchEn)}</p>` : ''}${branchZh ? `<p class="text-p1 text-black font-bold">${escapeHtml(branchZh)}</p>` : ''}</div>`;
  return el;
}

function appendExhibitionSection(root, index, pool, branchEn, branchZh) {
  const section = document.createElement('section');
  // 手機子展覽間距改走 #event-galleries-root 的 flex gap（user 2026-06-11，去掉 section 自帶 mobile py）；桌面維持 py-6xl
  section.className = 'event-gallery-section md:py-6xl';
  section.dataset.eventIndex = String(index);
  section.dataset.branchEn = branchEn;
  section.dataset.branchZh = branchZh;

  const mobileTitle = buildMobileEventTitle(branchEn, branchZh, true);
  if (mobileTitle) section.appendChild(mobileTitle);

  // exhibition gallery 手機/桌面都用全寬 slideshow（user 要求「跟桌面一樣橫跨整個寬度」，
  // 幾何由 degree-show-gallery.js 依 viewport 分流：桌面 6-slot/400px、手機 4-slot/34vw）；
  // 橫向溢出由 html/body overflow-x:clip 兜住不讓整頁 pan。
  const gallery = document.createElement('div');
  gallery.className = 'division-images relative';
  section.appendChild(gallery);
  root.appendChild(section);
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
  // 手機子展覽間距改走 #event-galleries-root 的 flex gap（user 2026-06-11，去掉 section 自帶 mobile py）；桌面維持 py-6xl
  section.className = 'event-gallery-section md:py-6xl';
  section.dataset.eventIndex = String(index);
  section.dataset.branchEn = branchEn;
  section.dataset.branchZh = branchZh;

  const wrap = document.createElement('div');
  wrap.className = 'site-container';

  // 手機 event 標題在最頂（title → tabs → 説明文字 → slideshow）；wrap 已是 site-container 不再包
  const mobileTitle = buildMobileEventTitle(branchEn, branchZh, false);
  if (mobileTitle) wrap.appendChild(mobileTitle);

  // Tab 列：直接套用 about .class-division-btn（不另寫、不加 group label）
  //   - default: var(--theme-fg) 底 + var(--theme-bg) 字（mode-aware）
  //   - active: JS 套隨機 accent 底 + 黑字 + 隨機旋轉（同 bfa-division-toggle）
  //   - btn 內含 EN + ZH 兩行（about 一樣的 chip 結構）
  //   - tab row 放 grid-20 col-start-5 跟 desc col / 全站內容同 x 起點
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
    tabRowGrid.className = 'grid-20 mb-2xl';
    // 手機：tab 列水平 scroll（跟 faculty filter / about 分組導覽同處理）— flex-nowrap + overflow-x-auto +
    // no-scrollbar，負 margin 延伸到 viewport 邊、px 補回內距，py 給旋轉 chip 上下 clearance；桌面 md: 還原 flex-wrap。
    const tabRow = document.createElement('div');
    tabRow.className = 'col-span-full md:col-start-5 md:col-span-16 flex flex-nowrap md:flex-wrap gap-md md:gap-xl overflow-x-auto md:overflow-visible no-scrollbar -mx-container-padding md:mx-0 px-container-padding md:px-0 py-sm md:py-0';
    resolved.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'class-division-btn shrink-0 font-bold transition-all duration-fast text-left';
      btn.dataset.tabIndex = String(i);
      // marquee 結構（.dsd-tab-line 是 overflow window、inner 是跑動內容）：桌面 max-width:18rem / 手機 0.75vw
      // 截斷時 applyMarqueeOverflow 偵測加 .is-overflow；手機自動跑、桌面 hover tab 卡片才跑（CSS 控，variables.css）
      // tab 文字大小對齊全站 nav btn（.section-nav-btn 等用 --font-size-p1）；原 text-h5 偏大（user 2026-06-11）
      btn.innerHTML = `<div class="dsd-tab-line text-p1 font-bold"><span class="dsd-tab-marquee-inner">${item.nameEn || ''}</span></div><div class="dsd-tab-line text-p1 font-bold"><span class="dsd-tab-marquee-inner">${item.nameZh || ''}</span></div>`;
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
  // 結構完全比照 about .class-info-panel：grid-20 md:items-start + descCol (col-start-5 col-span-6)
  //   + imgCol (col-start-13 col-span-8 既是 grid item 又是 .division-images container)
  // 不加 [data-class-hl] 彩色背景（封鎖綫）— degree-show 頁不要 highlighter
  const apis = [];
  resolved.forEach((item, i) => {
    const panel = document.createElement('div');
    panel.className = `event-extra-panel grid-20 md:items-start${i === 0 ? '' : ' hidden'}`;
    panel.dataset.panelIndex = String(i);

    const hasDesc = !!(item.descEn || item.descZh);
    let descHlEl = null;
    if (hasDesc) {
      const descCol = document.createElement('div');
      // 手機順序 = DOM 順序：説明文字在 slideshow 前（user 2026-06-11「先 title、説明文字、最後才是 slideshow」）；
      // 桌面 grid placement 顯式（desc col 5-10 / slideshow col 13-20 同 row）不吃 order
      // 手機 desc→slideshow 間距走 grid-20 row-gap（=gutter 20px），不用 mb（user 2026-06-11 去掉 mb-xl）
      descCol.className = 'col-span-full md:col-start-5 md:col-span-6';
      // [data-class-hl] 彩色背景塊（封鎖綫風）：跟 about 一樣，desc 文字包進有 inline padding 的 hl wrapper
      // bg 由 JS 套（mode-standard 走隨機 accent；mode-inverse/color 由 themes CSS 提供 theme bg）
      descHlEl = document.createElement('div');
      descHlEl.setAttribute('data-class-hl', '');
      // padding 對齊全站 nav btn / .class-division-btn 標準 6px 8px 5px（固定 px，桌機手機一致；user 2026-06-11）
      descHlEl.style.cssText = 'display: inline-block; width: fit-content; padding: 6px 8px 5px;';
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
      ? 'col-span-full md:col-start-13 md:col-span-8 relative division-images'
      : 'col-span-full md:col-start-5 md:col-span-16 relative division-images';
    panel.appendChild(slideshow);
    wrap.appendChild(panel);

    // 啟動 slideshow（panel hidden 時 GSAP set 仍會生效，切 tab 時直接可見）
    // 顯式傳 textHlEl 讓 hl 區跟 imgs 同步 clip-path（about 一樣行為）
    // 手機：圖片處理對齊 exhibition 全寬 slideshow（同 4-slot/34vw 幾何；容器由 CSS 負 margin 撐全寬）
    const api = createClassImagesSlideshow(slideshow, item.images, {
      textHlEl: descHlEl,
      ...(window.innerWidth < 768 ? { slotLefts: SLOT_LEFTS_MOBILE, imgWidth: IMG_WIDTH_MOBILE } : {}),
    });
    if (api) {
      // 先藏（clip hidden）；等 section 捲到半屏由 revealRefActive showAll+start（about pattern，不然右欄整塊空白）
      api.renderFresh(true);
      apis.push(api);
    } else {
      apis.push(null);
    }
  });

  // SPA 離開時停掉所有 slideshow interval（避免對 detached DOM 跑 gsap、每訪累積）
  registerPageCleanup(() => apis.forEach(a => a?.stop()));

  // Tab 切換：套用 about bfa-division-toggle setActive 的視覺
  //   - active btn: 隨機 accent 底 + 黑字 + 新隨機旋轉（每次 active 重新 random，跟 about 一致）
  //   - inactive btn: 還原 default bg/color（清掉 inline style 走 .class-division-btn CSS）+ 回到 base 旋轉
  let activeIdx = 0;
  let switching = false;
  let refRevealed = false;  // section 捲到半屏才 reveal（about pattern）；沒 reveal 過不退場

  // 離頁退場：只收當前 active panel 的 slideshow（imgs + text highlight 一起 clip-path 收，= 進場 reveal 反向，
  // 沿用模組 hideAll；沒 reveal 過（還沒捲到）則略過，避免對隱藏態多跑 gsap）
  registerPageExit(() => {
    const active = apis[activeIdx];
    if (!refRevealed || !active || typeof active.hideAll !== 'function' || typeof gsap === 'undefined') return Promise.resolve();
    active.stop();
    return active.hideAll();
  });

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
      // btn active 色「點擊當下」先換（user 2026-06-11：原本排在 hideAll/showAll 之後 → 變色慢 ~1s，
      // 看起來像等下面資料渲染完才反應）；panel 收展動畫照舊在後面跑
      activeIdx = nextIdx;
      setActiveTabBtn();
      if (oldApi) { await oldApi.hideAll(); oldApi.stop(); }
      panels.forEach((p, i) => p.classList.toggle('hidden', i !== nextIdx));
      if (newApi) {
        newApi.renderFresh(true);
        await newApi.showAll();
        newApi.start();
      }
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

  // 離頁退場（user 2026-06-08「這兩個 tab 也要出場動畫」）：tab chip 各自 clip-path 收（playClipPathExit
  // viewportOnly → 只收視窗內；tab 無 inline clipPath → fromTo inset(0) 收）。
  // ⚠️ .class-division-btn 帶 Tailwind `transition-all duration-fast`（含 clip-path）會追著 GSAP 每幀寫值打架
  //    → 退場前先 transition:'none'（頁面即將 swap 不必還原）。clip-path 套 chip 自身不裁旋轉角。
  if (tabBtns.length) {
    registerPageExit(() => {
      tabBtns.forEach(b => { b.style.transition = 'none'; });
      return playClipPathExit(tabBtns);
    });
  }

  section.appendChild(wrap);
  root.appendChild(section);

  // Tab 標題 marquee 偵測：rAF 等 append 後 layout 可量。桌面 max-width:18rem / 手機 0.75vw 截斷才 overflow → 加 .is-overflow
  // （短名稱不 overflow，applyMarqueeOverflow 自帶 no-op）；跑不跑由 CSS 控（手機自動、桌面 hover，variables.css）
  if (tabBtns.length) {
    requestAnimationFrame(() => applyMarqueeOverflow(section, '.dsd-tab-line', '.dsd-tab-marquee-inner'));
  }

  // 進場（about pattern）：section 捲到畫面中央（半屏）才 reveal active panel 的 imgs + text highlight，
  // 不然 renderFresh(true) 的隱藏狀態會讓右欄整塊空白（user 反映「一整塊是空的」）。once；已在半屏內則立即播。
  function revealRefActive() {
    if (refRevealed) return;
    const api = apis[activeIdx];
    if (!api) return;
    refRevealed = true;
    api.showAll();
    api.start();
  }
  if (typeof ScrollTrigger !== 'undefined') {
    const r = section.getBoundingClientRect();
    if (r.top < (window.innerHeight || 0) * 0.5) revealRefActive();  // 已過半屏 → 立即（once ST 對已過 start 不可靠）
    else ScrollTrigger.create({ trigger: section, start: 'top center', once: true, onEnter: revealRefActive });
  } else {
    revealRefActive();
  }
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

  // 1) flat 所有 non-exhibition events 的 refs
  const events = Array.isArray(data.events) ? data.events : [];
  const allRefs = [];
  for (const ev of events) {
    if (!ev.type || ev.type === 'exhibition') continue;
    if (!Array.isArray(ev.refs)) continue;
    for (const ref of ev.refs) {
      if (ref && ref.source && ref.id) allRefs.push(ref);
    }
  }
  if (allRefs.length === 0) {
    btn.style.display = 'none';
    return;
  }

  // 2) 解每個 ref 拿 title — label 用 SECTION_LABELS（source → 工作坊/講座/...）
  const resolved = [];
  for (const ref of allRefs) {
    const sectionData = await getSectionData(ref.source);
    if (!sectionData) continue;
    const item = findItemById(sectionData, ref.id);
    if (!item) continue;
    const isModeA = !!item.title_en;
    const isModeB = !item.title_en && !!item.title_zh;
    const titleEn = isModeA ? item.title_en : (isModeB ? item.title : '');
    const titleZh = isModeA ? item.title    : (isModeB ? item.title_zh : item.title || '');
    const label = SECTION_LABELS[ref.source] || { en: '', zh: '' };
    resolved.push({
      section: ref.source,
      itemId: ref.id,
      labelEn: label.en,
      labelZh: label.zh,
      titleEn,
      titleZh,
    });
  }
  if (resolved.length === 0) {
    btn.style.display = 'none';
    return;
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
        ${ref.labelEn ? `<p class="text-p3">${escapeHtml(ref.labelEn)}</p>` : ''}
        ${ref.labelZh ? `<p class="text-p3">${escapeHtml(ref.labelZh)}</p>` : ''}
      </div>
      <div class="lightbox-ref-chip-title">
        <div class="lightbox-ref-chip-title-window">
          <div class="lightbox-ref-chip-title-track">
            <div class="lightbox-ref-chip-title-unit">
              ${ref.titleEn ? `<p class="text-p3 font-bold">${escapeHtml(ref.titleEn)}</p>` : ''}
              ${ref.titleZh ? `<p class="text-p3 font-bold">${escapeHtml(ref.titleZh)}</p>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    row.addEventListener('click', e => {
      e.stopPropagation();
      navigateToRef(ref);
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
  const mobile = window.innerWidth < 768;
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
  const outer = inner.closest('.sticky-chip');
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
  // Ref btn：setupRefBtn 已決定是否 display:none（無 refs 時整顆消失）；display:none 時不加進 titleChips 陣列
  const refBtnEl = /** @type {HTMLElement | null} */ (document.getElementById('degree-show-ref-btn'));
  const refBtn = (refBtnEl && refBtnEl.style.display !== 'none') ? refBtnEl : null;
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
  if (refBtn) refBtn.style.transform = `rotate(${randRot()}deg)`;

  // chip 寬度貼齊文字（左右 padding 對稱）：title 在 fonts.ready 後量（字型未載完量錯寬）；branch 在 setBranch 換字後量。
  // resize 重量（max-width col-span-4 隨 viewport 變、JS 鎖的是定 px 會 stale）。
  if (titleInner) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => snugChipWidth(titleInner));
  const resnugChips = () => {
    if (titleInner) snugChipWidth(titleInner);
    if (branchInner && branchChip.style.display !== 'none') snugChipWidth(branchInner);
  };
  window.addEventListener('resize', resnugChips);
  registerPageCleanup(() => window.removeEventListener('resize', resnugChips));

  // clip-path 留 -12px buffer（仿 atlas .atlas-layout-inner）：ref btn hover 時 inner rotate(15deg) 角會超出 box，
  // buffer 確保旋轉角不被 clip 切掉；HIDDEN wiped 邊用 calc(100% + 12px) 同帶 buffer（CSS 預設同步見 hero.css .sticky-chip）
  const HIDDEN = 'inset(-12px -12px calc(100% + 12px) -12px)';
  const SHOWN = 'inset(-12px -12px -12px -12px)';
  // titleChips = [titleChip, backBtn, refBtn]：三者描述段 reveal、next-project 段 collapse 全程同步
  // refBtn 若 setupRefBtn 已 hide（無 refs）則不加入；branchChip 獨立由 galleriesRoot 內各 event trigger 控
  const titleChips = [titleChip];
  if (backBtn) titleChips.push(backBtn);
  if (refBtn) titleChips.push(refBtn);

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
      if (currentBranchIdx !== -1) setChipsState([branchChip], true);
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
    // branch chip 收起 + 重置 currentBranchIdx，讓下次 scroll 回來 onEnterBack 能重新 setBranch
    clearBranch();
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
    if (currentBranchIdx !== -1) setChipsState([branchChip], false);
    return new Promise(res => setTimeout(res, 700));
  });

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
        snugChipWidth(branchInner);   // 換字後重量寬，貼齊新分支名（左右 padding 對稱）
        if (cardShown) setChipsState([branchChip], true);
      }, 400);
    } else {
      // 第一次進入 event：先 display: '' 才能跑 clip-path reveal
      branchEnEl.textContent = en;
      branchZhEl.textContent = zh;
      branchChip.style.display = '';
      // 強制 reflow 讓 CSS hidden 初始 state 生效，下一幀才 transition 到 shown
      void branchChip.offsetHeight;
      snugChipWidth(branchInner);    // 量寬貼齊文字（display:'' 後才有 layout 可量）
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
    // start+end 都用 viewport center → 「center 落在此 section 內」= active branch，上下方向對稱：
    //   onEnter(往下，top 過 center) / onEnterBack(往上，bottom 過 center) 都 setBranch。
    //   原本只設 start 無 end → onEnterBack 在預設 end 觸發（往上時 section 對應不準，user 回報「從底往上不準」）。
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      end: 'bottom center',
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