// @ts-nocheck — 1164 行 querySelector 密集，72 個 TS2339 全為 Element vs HTMLElement 子型別雜訊；
// 結構性問題（每個 .style/.dataset/.value access 都會報），逐處 cast 風險高於價值，整檔跳過
/**
 * Library Panels
 * 負責 Awards / Press / Files / Album 四個 panel 的資料載入、渲染、篩選邏輯
 */

import { applyMarqueeOverflow, bindMarqueeReturn, buildSyncedMarqueeTimeline } from '../ui/marquee-overflow.js';
import { videoMediaFromUrl, grabHlsFrame, isSelfHostedVideo } from '../ui/video-player.js';
import { ensureFlagIconsCss } from '../ui/ensure-flag-icons.js';
import { countryName } from '../../data/country-names.js';
import { DUR, EASE } from '../ui/motion.js';
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { pdfOpenUrl } from './pdf-url.js';
import { sitePath, SITE_BASE_PATHNAME } from '../ui/site-base.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { makeActivatable } from '../ui/a11y.js';
import { loadSummerCamp } from './summer-camp-source.js';
import { loadActivityCollection, loadGeneralActivitiesAlbum } from './activities-source.js';
import { loadDegreeShowAlbum } from './degree-show-source.js';
import { loadOthersAlbum } from './library-album-source.js';
import { getAwardRecords, findAwardById } from './activities-data-loader.js';
import { renderPdfCover } from '../ui/pdf-cover.js';
import { loadUiLabels } from '../ui/ui-labels.js';
import { shortLibId } from './library-deeplink.js';

// 文件分類 dropdown（後台 library_documents.docType）→ 顯示文字。fallback 用；實際文字優先讀 ui_labels（可後台改）
const DOCTYPE_FALLBACK = {
  books:         ['Books',               '書籍'],
  contributions: ['Contributions',       '收錄'],
  booklets:      ['Booklets & Leaflets', '冊頁'],
  other:         ['Other',               '其他'],
};

// ── 共用常數 ──────────────────────────────────────────────────────────────────

// 矮橫向（橫向手機）：手機式行為的第二個入口，gate 同 landscape.css / main-modular library init
const isShortLandscape = () =>
  window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;

const CAT_LABELS = {
  'degree-show':      'Degree Shows 畢業展',
  'exhibitions':      'Exhibitions 展演',
  'workshop':         'Workshops 工作營',
  'courses':          'Courses 課程',
  'lectures':         'Lectures 講座',
  'visits':           'Visits 參訪',
  'competitions':     'Competitions 競賽',
  'conferences':      'Forums 論壇',
  'students-present': 'Students Present 學生自主',
  'industry':         'Industry Partnerships 產學合作',
  'summer-camp':      'Camp 體驗營',
  'moment':           'Moment 日常',
  'others':           'Others 其他',
};

// CAT_LABELS 值＝「EN ZH」單串（EN 可含空格）→ 拆首個 CJK 字為界，給 ref chip 雙語兩行
function splitCatLabel(s) {
  const i = s.search(/[一-鿿]/);
  return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i).trim()];
}

// 分類顯示文字以後台 ui_labels（lib.cat.*）為準（可編輯、與篩選鈕同源），退 CAT_LABELS 硬編。
// 讓 album 卡片 tag ＋ ref chip 跟篩選鈕吃同一份文字 → 後台改 lib.cat.* 一列，三處同步（含 camp 加 s 等）。
// _catUiMap 由 initAlbumPanel 載入時填（loadUiLabels single-flight cache，快）；ref chip 於點擊時才用、屆時已填。
let _catUiMap = null;
function catLabelCombined(cat) {
  const row = _catUiMap && _catUiMap[`lib.cat.${cat}`];
  const combined = row ? [row.en, row.zh].filter(Boolean).join(' ') : '';
  return combined || CAT_LABELS[cat] || cat;
}
function catLabelParts(cat) {
  const row = _catUiMap && _catUiMap[`lib.cat.${cat}`];
  if (row && (row.en || row.zh)) return [row.en || '', row.zh || ''];
  return splitCatLabel(CAT_LABELS[cat] || '');
}

// album 卡片由某活動 collection 攤平而來（cat === activities section key；others＝library 自上傳、無來源活動）→
// 給 lightbox 一顆「回到來源」的 ref chip：
//   - degree-show：整屆內容（cover→回顧影片）→ href 直接回畢展 detail 頁（非 activities 清單，同 pdf-cross-ref 慣例）
//   - 其餘：section+itemId deep-link（itemId = 活動 Directus id ＝ activities 頁 `item-<id>` 錨點，見 activities-source mapRow；對不上時 navigateToItem 退回捲到 section）
function albumSourceRef(item) {
  if (!item || item.cat === 'others') return null;
  if (item.cat === 'degree-show') {
    return item.year == null ? null
      : { href: `${SITE_BASE_PATHNAME}pages/degree-show-detail.html?year=${item.year}`, labelEn: 'Degree Show', labelZh: '畢業展', titleEn: item.titleEn || '', titleZh: item.titleZh || '' };
  }
  if (!item.id || !CAT_LABELS[item.cat]) return null;
  const [labelEn, labelZh] = catLabelParts(item.cat);
  return { section: item.cat, itemId: item.id, labelEn, labelZh, titleEn: item.titleEn || '', titleZh: item.titleZh || '' };
}

// 斑馬紋依「當前可見順序」重排：篩選只 display:none 隱藏，靜態 build 的 rowIdx 交替會斷（連續同底色）→
// 依可見 DOM 順序重算（偶數位＝斑馬，同 build 慣例 rowIdx%2===0）。awards/press/album 三個可篩選斑馬清單共用。
function restripeZebra(listEl, itemSelector) {
  let z = 0;
  listEl.querySelectorAll(itemSelector).forEach(item => {
    if (item.style.display === 'none') return;
    item.classList.toggle('list-item-zebra', z++ % 2 === 0);
  });
}

const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

// accent → deep accent（ref 列底色，比三原色暗一階）；對齊 list-accordion.js 同名 map（awards row open 用）
const ACCENT_TO_DEEP = {
  '#FF448A': '#f52d78', '#ff448a': '#f52d78',
  '#00FF80': '#23eb7d', '#00ff80': '#23eb7d',
  '#26BCFF': '#23a5ff', '#26bcff': '#23a5ff',
};

// 圖片欄位的即時 filename_disk（<uuid>.<副檔名>）→ CloudFront 圖片 URL：走 CloudFront 直吃 S3、繞過弱機
// /assets 逾時（見 config/api.js CMS_CDN_BASE、memory reference_directus_s3_timeout_all_assets_down）。
// 給圖片用（cover / award logos / images M2M）；PDF 走 pdfOpenUrl（也是 CloudFront，見 pdf-url.js）、影片走 videoUrls。
// 不寫死副檔名＝離線 webp 轉檔（.jpg/.png→.webp）自動跟上。null/空→''；已是完整 URL 或本地路徑（fallback json）→原樣。
function cdnImage(fd) {
  if (!fd) return '';
  if (/^(https?:)?\/\//.test(fd) || fd.startsWith('/') || fd.startsWith('../')) return fd;
  return `${CMS_CDN_BASE}/${fd}`;
}

// ── 共用 helpers ──────────────────────────────────────────────────────────────

/** 建立 / 取得 search-empty-state 元素，插在 listEl 之後，絕對置中於 list 容器（user 2026-06-22：原左上角→畫面中間）*/
function ensureEmptyState(listEl) {
  let el = /** @type {HTMLDivElement | null} */ (listEl.parentElement?.querySelector('.search-empty-state'));
  if (!el) {
    el = document.createElement('div');
    el.className = 'search-empty-state hidden';
    // absolute 置中於 scroll 容器（left/right:0 + text-align:center 水平、top:50%+translateY 垂直），不佔流不受 list 高度影響
    el.style.cssText = 'position:absolute; top:50%; left:0; right:0; transform:translateY(-50%); text-align:center;';
    el.innerHTML = '<p style="font-size: var(--font-size-xs); font-weight: 700;">No Result</p><p style="font-size: var(--font-size-xs); font-weight: 700;">無結果</p>';
    if (listEl.parentElement) listEl.parentElement.style.position = 'relative'; // 作為 absolute 置中基準
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

// Reset 按鈕：桌面／手機兩種版位（年份 picker 桌面是直欄、手機是橫向 scroll bar，見 library.css @media 767）。
//
// 桌面（≥768，直欄）：absolute 釘在「grid 容器」左下＝年份 scroll 最下方、左緣對齊年份。
//   為何 absolute：picker 左欄是 grid `max-content` track，按鈕「Reset 重設」比 4 位年份寬，若進 flow
//     會撐寬左欄、把右側內容整體推右（user 2026-07-14）。absolute 不進 intrinsic sizing＝零推移。
//   為何掛 grid 而非 picker 直欄：containing block 若是那條窄的 max-content 欄，absolute 的 shrink-to-fit
//     會把按鈕寬度夾回年份寬 → 「重設」換行/被切。改以整個 grid 為 containing block＝有 year 欄 + gap(2xl)
//     的空白可用，nowrap 單行不切、剛好吃掉 user 說的「gap 空間」。
//   left/bottom 用 grid 的 computed padding 對位；scroll wrap 補 padding-bottom 讓末年份捲上時停在按鈕上方不被蓋。
//
// 手機（<768，橫向 bar）：reset 當 bar 的最後一個 item 釘在最右（user 2026-07-18，桌面左下版位在手機看不到）。
//   ⚠️ attachYearReset 在年份 button 之前被呼叫 → 不能靠 DOM 順序排到最後，用 `order:1`（年份預設 0）讓 flex
//   把它排到所有年份之後＝最右。`position:sticky;right:0` 隨橫捲常駐右緣、opaque var(--lib-bg) 蓋掉捲過的年份。
//   font/padding/min-height(44) 交給 library.css `[id$="-year-picker"] button` 那條 mobile rule（同年份觸控尺寸）。
//
// 掛在 <main> 內的 DOM 上，SPA 換頁隨 innerHTML swap 一併移除，不需另註冊 cleanup。
// 加選年份＝「跳到那一年」（anchor 語義，user 2026-07-21，取代先前一律回頂）：捲到該年份組頂端。
// 必須在 filter 套用「後」呼叫（block 可能重建/顯隱）；display:none（如 search 篩掉）就不捲。
function scrollToYearBlock(pickerEl, year) {
  const panel = pickerEl.closest('[id^="lib-panel-"]');
  const scroller = panel?.querySelector('[id$="-scroll"]');
  const block = panel?.querySelector(`[class$="year-block"][data-year="${year}"]`);
  if (!scroller || !block || block.offsetParent === null) return;
  scroller.scrollTo(0, block.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
}

function attachYearReset(pickerEl, onReset) {
  const wrap = pickerEl.parentElement;         // scroll 容器
  const grid = wrap.parentElement.parentElement; // grid 容器（跨 year 欄 + gap + 1fr 內容）
  // 兩處都清：跨 breakpoint re-init 時舊 reset 可能在另一個容器
  grid.querySelector('.year-reset-btn')?.remove();
  pickerEl.querySelector('.year-reset-btn')?.remove();
  const btn = document.createElement('button');
  btn.className = 'year-reset-btn';
  btn.textContent = 'Reset 重設';
  btn.setAttribute('aria-label', '重設年份篩選 Reset year filter');
  // Reset 也回頂（user 2026-07-21）：頂端＝當前 sort 的第一個年份組（正序最新年、倒序最舊年），不用管方向
  btn.addEventListener('click', () => {
    onReset();
    pickerEl.closest('[id^="lib-panel-"]')?.querySelector('[id$="-scroll"]')?.scrollTo(0, 0);
  });

  if (window.innerWidth < 768) {
    // will-change：sticky 在橫向 scroller 內拖動時逐幀 subpixel 重繪會抖，自有合成層改用位移合成
    btn.style.cssText = 'order:1;position:sticky;right:0;background:var(--lib-bg);border:none;font-family:inherit;cursor:pointer;font-weight:700;color:var(--lib-fg);white-space:nowrap;will-change:transform;display:none;';
    pickerEl.appendChild(btn);
    return btn;
  }

  grid.style.position = 'relative';
  wrap.style.paddingBottom = 'var(--spacing-xl)';
  btn.style.cssText = 'position:absolute;white-space:nowrap;background:var(--lib-bg);text-align:left;border:none;padding:var(--spacing-xs) 0;font-family:inherit;font-size:var(--font-size-xs);cursor:pointer;font-weight:700;color:var(--lib-fg);display:none;';
  const gcs = getComputedStyle(grid);
  btn.style.left = gcs.paddingLeft;
  btn.style.bottom = gcs.paddingBottom;
  grid.appendChild(btn);
  return btn;
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

  // 無障礙：年份按鈕群組（WCAG 1.3.1 / 4.1.2）
  pickerEl.setAttribute('role', 'group');
  pickerEl.setAttribute('aria-label', '年份篩選 Filter by year');

  const updateStyles = () => {
    const hasSel = selected.size > 0;
    resetBtn.style.display = hasSel ? '' : 'none';
    pickerEl.querySelectorAll('button[data-year]').forEach(b => {  // [data-year] 排除同在 picker 內的 reset 鈕（手機版位）
      const isSel = selected.has(b.dataset.year);
      // 選取＝維持原色，未選＝dim 到 0.3（跟 album cat 選單同款，靠 cssText 的 transition 平滑淡入淡出）
      b.style.color = (!hasSel || isSel) ? 'var(--lib-fg)' : 'rgba(var(--lib-fg-rgb),0.3)';
      b.setAttribute('aria-pressed', String(isSel)); // 無障礙：選取狀態靠 aria-pressed 報讀（取代視覺底線，不依賴顏色）
    });
  };

  const resetBtn = attachYearReset(pickerEl, () => { selected.clear(); updateStyles(); onFilter(); });

  years.forEach(year => {
    const btn = document.createElement('button');
    btn.textContent = year;
    btn.dataset.year = year;
    btn.setAttribute('aria-pressed', 'false');
    btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-xs);cursor:var(--cursor-pointer);font-weight:700;color:var(--lib-fg);transition:color 0.3s ease;';
    btn.addEventListener('click', () => {
      const adding = !selected.has(year);
      if (selected.has(year)) { selected.delete(year); } else { selected.add(year); }
      if (selected.size === years.length) selected.clear();
      updateStyles();
      onFilter(); // caller 自己 snapshot filter 前後可見年份、比對位置決定 wipe 哪些
      // 歸零（點掉最後一年/全選觸發 clear）＝全部顯示＝Reset 語義 → 回頂；加選＝跳到該年份組；取消後仍有選取＝維持原位
      if (selected.size === 0) pickerEl.closest('[id^="lib-panel-"]')?.querySelector('[id$="-scroll"]')?.scrollTo(0, 0);
      else if (adding) scrollToYearBlock(pickerEl, year);
    });
    pickerEl.appendChild(btn);
  });

  return selected;
}

/** list item hover 底色 + overlay 顏色 follow */
function bindListItemHover(containerEl, itemSelector, overlaySelector = null) {
  // 矮橫向同手機：tap 會觸發 emulated mouseenter → 底色殘留，不綁
  if (window.innerWidth < 768 || isShortLandscape()) return;
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
function runMarqueeOverflow(containerEl, rowSelector, innerSelector, hoverItemSelector) {
  applyMarqueeOverflow(containerEl, rowSelector, innerSelector);
  // 桌面 hover 放開平滑回彈（user 2026-08-19 B）：每個 list item 綁 bindMarqueeReturn（手機由 helper 自我 gate 跳過）；
  // 跟 bindListItemHover（換底色）共存於同一 hover 目標、互不干擾。
  if (hoverItemSelector) {
    containerEl.querySelectorAll(hoverItemSelector).forEach((item) => {
      registerPageCleanup(bindMarqueeReturn(/** @type {HTMLElement} */ (item), innerSelector, rowSelector));
    });
  }
}

// award ref row 標題（buildRefRowsHtml 的 .list-title-marquee）：不能用上面的 applyMarqueeOverflow 共用 utility，
// 因為 .list-title-marquee 的 CSS（lists.css）讀的是 --marquee-offset / list-marquee keyframe，跟 utility
// 寫的 --marquee-distance 是不同變數——這裡沿用 activities-data-loader.js initMarquees 對 .list-title-marquee
// 的量測寫法（clone + --marquee-offset），只是換個掃描範圍（award ref row 而非 list-header/list-content）。
// 這裡量測 + 設 is-overflow/變數（clone 給手機 CSS seamless loop 用）；桌面 hover 放開平滑回彈改由
// bindAwardRefTitleReturn（GSAP）接手（見下），library.css 的 .award-ref-row:hover keyframe 退為 gsap-undefined fallback。
function initAwardRefTitleMarquees(scope) {
  scope.querySelectorAll('.award-ref-row .list-title-marquee').forEach(wrap => {
    const p = wrap.querySelector('p');
    if (!p) return;
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
      wrap.style.setProperty('--marquee-duration', `${Math.max(3, offset / 80)}s`);
    } else {
      wrap.classList.remove('is-overflow');
    }
  });
  // 桌面 hover 放開平滑回彈（user 2026-08-25，對齊 activities list 標題 GSAP；手機不綁＝維持 CSS seamless loop）
  scope.querySelectorAll('.award-ref-row').forEach(row => registerPageCleanup(bindAwardRefTitleReturn(row)));
}

// award ref 展開列標題 hover 放開平滑回彈：對齊 activities-data-loader.js reconcileChunk（.list-title-marquee 共用結構）——
// 量溢出距離、EN/ZH 兩條共用 buildSyncedMarqueeTimeline（捲一輪停 0.6s 歸零），hover 播、放開從當下補間回 0。
// inline animation:none 蓋掉 library.css 的 .award-ref-row:hover keyframe（那條非 !important，inline 贏）；手機不綁＝CSS 原樣。
// gsap 未載入時 no-op（不設 animation:none）→ CSS keyframe 仍是 fallback（snap，如舊）。
function bindAwardRefTitleReturn(row) {
  if (typeof gsap === 'undefined' || !row || row._refTitleBound) return () => {};
  if (window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return () => {};
  row._refTitleBound = true;
  let tl = null, returnTween = null, els = [];
  const build = () => {
    if (tl) { tl.kill(); tl = null; }
    const items = [];
    row.querySelectorAll('.list-title-marquee.is-overflow').forEach(wrap => {
      const p = /** @type {HTMLElement|null} */ (wrap.querySelector('p'));
      if (!p) return;
      wrap.querySelectorAll('p').forEach(pp => { /** @type {HTMLElement} */ (pp).style.animation = 'none'; });  // 關掉 CSS keyframe（含 clone）
      const dist = p.scrollWidth - wrap.clientWidth;
      if (dist > 1) items.push({ el: p, distance: dist });
    });
    els = items.map(i => i.el);
    tl = items.length ? buildSyncedMarqueeTimeline(items) : null;
  };
  const enter = () => { if (returnTween) { returnTween.kill(); returnTween = null; } build(); if (tl) tl.play(); };
  const leave = () => {
    if (!tl) return;
    tl.pause();
    if (!els.length) return;
    returnTween = gsap.to(els, {
      x: 0, duration: 0.45, ease: 'cubic-bezier(0.25,0,0,1)',
      onComplete: () => { if (tl) tl.progress(0); returnTween = null; },
    });
  };
  row.addEventListener('mouseenter', enter);
  row.addEventListener('mouseleave', leave);
  return () => {
    row.removeEventListener('mouseenter', enter);
    row.removeEventListener('mouseleave', leave);
    if (tl) tl.kill();
    if (returnTween) returnTween.kill();
    row._refTitleBound = false;
  };
}

// award 水平 track marquee 桌面「放開平滑回彈」（user 2026-08-25）：對齊全站 bindMarqueeReturn 手感，但
// award 水平 track 是 bespoke 結構（非 applyMarqueeOverflow 的 .marquee-copy、跑 --hmarquee-distance 而非
// --marquee-distance），故不共用該 helper，另寫一支。一列可有多條 track（得獎人＋主辦/類別/名次各自 marquee）。
// 手法：inline animation:none 蓋掉 CSS :hover keyframe（那些規則非 !important，inline 贏），GSAP 獨佔 transform；
// 各 track 各自獨立 loop（距離/時長不同→別共用一條 timeline，否則短的會等長的卡在接縫）。每次 enter 依當下
// --hmarquee-distance/duration lazy 收集（applyWinnersHMarquee 對各 cell 逐一 set is-hmarquee，bind 當下未必全
// set；重量後距離也會變，enter 重讀才對）。放開→各 track 從當下位置補間回起點。
// gsap 未載入時 no-op（不設 animation:none）→ CSS keyframe 仍是 fallback（snap，如舊）。
function bindAwardWinnersReturn(itemEl) {
  if (typeof gsap === 'undefined' || !itemEl || itemEl._awardHmBound) return () => {};
  itemEl._awardHmBound = true;
  let tls = [], returnTween = null, tracks = [];
  const collect = () => {
    tracks = [...itemEl.querySelectorAll('.award-winners.is-hmarquee')].map(view => {
      const track = /** @type {HTMLElement|null} */ (view.querySelector('.award-winners-track'));
      if (!track) return null;
      track.style.animation = 'none';  // 關掉 CSS :hover keyframe，GSAP 獨佔 transform
      const dist = Math.abs(parseFloat(getComputedStyle(view).getPropertyValue('--hmarquee-distance'))) || 0;
      const dur = parseFloat(getComputedStyle(view).getPropertyValue('--hmarquee-duration')) || (dist / 80);
      // 內容已複製一份 → 捲一份寬度到底恰好與起點無縫接合，repeat 從 0 重播即 seamless（不需 repeatDelay）
      return dist ? { track, dist, dur } : null;
    }).filter(Boolean);
  };
  const enter = () => {
    if (returnTween) { returnTween.kill(); returnTween = null; }
    tls.forEach(t => t.kill());
    collect();
    tls = tracks.map(({ track, dist, dur }) =>
      gsap.timeline({ repeat: -1 }).fromTo(track, { x: 0 }, { x: -dist, duration: dur, ease: 'none' }));
  };
  const leave = () => {
    if (!tls.length) return;
    tls.forEach(t => t.pause());  // 凍在當下位置
    returnTween = gsap.to(tracks.map(t => t.track), {
      x: 0, duration: 0.45, ease: 'cubic-bezier(0.25,0,0,1)',
      onComplete: () => { tls.forEach(t => t.kill()); tls = []; returnTween = null; },
    });
  };
  itemEl.addEventListener('mouseenter', enter);
  itemEl.addEventListener('mouseleave', leave);
  return () => {
    itemEl.removeEventListener('mouseenter', enter);
    itemEl.removeEventListener('mouseleave', leave);
    tls.forEach(t => t.kill());
    if (returnTween) returnTween.kill();
    itemEl._awardHmBound = false;
  };
}

// ── Awards refs（award row 右端 ref 鈕展開的 ref 列）──────────────────────────
// records.json item 可帶 references[]，三種型態：
//   { section, itemId }        → activities deep-link（同 activities list ref，label 自動查 SECTION_LABELS、title 查目標 JSON）
//   { type: 'document', id }   → library files 項目 → 點擊開 PDF viewer（同 files panel 點擊行為）
//   { type: 'press', id }      → library press 項目 → 點擊開 media lightbox / PDF viewer（同 press panel 點擊行為）
// press / files 資料獨立快取載入：awards 是預設 panel，點 ref 時 press/files panel 可能尚未 init 過

const AWARD_REF_TYPE_LABELS = {
  document: { en: 'Documents', zh: '文件' },
  press:    { en: 'Press',     zh: '報導' },
  album:    { en: 'Albums',    zh: '相簿' },
};

let _pressDataPromise = null;
function loadPressDataCached() {
  if (!_pressDataPromise) {
    _pressDataPromise = (async () => {
      try {
        const url = `${CMS_API_BASE}/library_press?fields=*,cover.filename_disk,pdf.filename_disk&sort=sort&limit=-1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('CMS ' + res.status);
        const rows = (await res.json())?.data;
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
        return rows.map(mapDirectusPressRow);
      } catch (_) {
        return fetch(sitePath('data/press.json')).then(r => r.json());
      }
    })();
  }
  return _pressDataPromise;
}

let _filesDataPromise = null;
function loadFilesDataCached() {
  if (!_filesDataPromise) _filesDataPromise = fetch(sitePath('data/library.json')).then(r => r.json());
  return _filesDataPromise;
}

// press / files item 手填 references 解析（給 PDF viewer / media lightbox 的 ref popover）：
//   { section, itemId }     → activities ref 原樣保留（popover chip 跳 activities）
//   { type: 'award', id }   → 解析成 href chip（label Awards/榮譽 + title 查 records）→ 跳 library.html#a-...
//     ＝awards ref 的「反向」：document/press 開啟時 ref 回得獎紀錄（2026-06-13 雙向 ref）
async function resolveLibManualRefs(item) {
  const manual = Array.isArray(item?.references) ? item.references : [];
  if (!manual.length) return [];
  return (await Promise.all(manual.map(async r => {
    if (!r) return null;
    if (r.type === 'award' && r.id) {
      const award = findAwardById(await getAwardRecords(), r.id);
      return {
        href: `${SITE_BASE_PATHNAME}pages/library.html#${r.id}`,
        labelEn: 'Awards', labelZh: '榮譽',
        titleEn: award?.competition_en || '', titleZh: award?.competition || '',
      };
    }
    return (r.section && r.itemId) ? r : null;
  }))).filter(Boolean);
}

// 自動反查（getPdfRefSources）+ 手填 refs union 去重（href ref 以 href 當 key）
function unionRefs(auto, manual) {
  const seen = new Set();
  return [...(auto || []), ...(manual || [])].filter(r => {
    if (!r) return false;
    const k = r.href ? `href::${r.href}` : (r.section && r.itemId) ? `${r.section}::${r.itemId}` : null;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// The CMS `pdf` field is a general document-file field: it may contain a PDF
// or a single image. Strip Directus query parameters before checking its type.
function isImageDocumentUrl(url, mimeType = '') {
  if (String(mimeType).toLowerCase().startsWith('image/')) return true;
  const path = String(url || '').split(/[?#]/, 1)[0].toLowerCase();
  return /\.(?:avif|gif|jpe?g|png|webp)$/.test(path);
}

function openLibraryDocument({ url, item, title, color, references, shareUrl, watermark = true }) {
  if (isImageDocumentUrl(url, item?.documentMimeType)) {
    document.dispatchEvent(new CustomEvent('sccd:open-lightbox', {
      detail: {
        media: [{ type: 'image', src: url, thumb: item?.cover || url }],
        index: 0, title, color, references, shareUrl, watermark,
      },
    }));
    return;
  }
  document.dispatchEvent(new CustomEvent('sccd:open-pdf', {
    detail: { pdfUrl: url, title, color, references, shareUrl, watermark, cover: (item && item.cover) || '' },
  }));
}

// 從某 host（award / activity item）點進 lightbox/PDF 時，popover 不該再 ref 回那個 host（避免循環）。
// 同 activities 的 getPdfRefSources({excludeSection,excludeItemId})，但統一處理 href(award) 與 section/itemId(activity) 兩種 ref。
// host = { awardId } 或 { section, itemId }；無 host（直接從 Files/Press panel 開）→ 不排除、ref 到所有來源。
function excludeHostFromRefs(refs, host) {
  if (!host || !Array.isArray(refs)) return refs || [];
  return refs.filter(r => {
    if (!r) return false;
    // award host：排除指向該 award 的 href chip（library.html#a-YYYY-NN）
    if (host.awardId && r.href && r.href.endsWith('#' + host.awardId)) return false;
    // activity host：排除指向該 section+itemId 的 ref
    if (host.section && host.itemId && r.section === host.section && r.itemId === host.itemId) return false;
    return true;
  });
}

// resolve 成渲染用統一 shape { kind, labelEn/Zh, titleEn/Zh, ...跳轉 payload }；目標不存在回 null（該 ref 不渲染）
async function resolveAwardRef(ref) {
  if (!ref) return null;
  if (ref.type === 'document') {
    const files = await loadFilesDataCached().catch(() => []);
    const t = (Array.isArray(files) ? files : []).find(f => String(f.id) === String(ref.id));
    if (!t || !t.pdfUrl) return null;
    return { kind: 'document', labelEn: AWARD_REF_TYPE_LABELS.document.en, labelZh: AWARD_REF_TYPE_LABELS.document.zh, titleEn: t.titleEn || '', titleZh: t.titleZh || '', pdfUrl: t.pdfUrl };
  }
  if (ref.type === 'press') {
    const press = await loadPressDataCached().catch(() => []);
    const t = (Array.isArray(press) ? press : []).find(p => String(p.id) === String(ref.id));
    if (!t) return null;
    return { kind: 'press', labelEn: AWARD_REF_TYPE_LABELS.press.en, labelZh: AWARD_REF_TYPE_LABELS.press.zh, titleEn: t.titleEn || '', titleZh: t.titleZh || '', pressId: t.id };
  }
  if (ref.type === 'album') {
    const albums = await loadAlbumItemsCached().catch(() => []);
    const t = (Array.isArray(albums) ? albums : []).find(a => String(a.id) === String(ref.id));
    if (!t || !t.media || !t.media.length) return null;
    return { kind: 'album', labelEn: AWARD_REF_TYPE_LABELS.album.en, labelZh: AWARD_REF_TYPE_LABELS.album.zh, titleEn: t.titleEn || '', titleZh: t.titleZh || '', albumId: t.id };
  }
  // award 不 ref 回 activities（user 2026-06-23）：activities 已單向不 ref award（見 reference_award_ref_direction_unidirectional），
  // award 也不反向 ref activities。section/itemId 類型一律不渲染（資料層若有殘留就前台過濾）；只保留 award → library content（document/press/album）。
  return null;
}

// ref row 點擊分派（同 activities ref 行為）：
//   document → PDF viewer（sccd:open-pdf，cross-ref 自動反查來源 — 同 files panel 點擊）
//   press    → media lightbox（sccd:open-lightbox）；只有 PDF 時退 PDF viewer — 同 press panel 點擊
//   activities → <a> click 走 router SPA 換頁到 activities deep-link（library 頁無 __sccdNavigateToItem）
function bindAwardRefRowClick(row) {
  row.addEventListener('click', async (e) => {
    e.stopPropagation();
    const color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    // 從本 award 點進 lightbox → popover 排除「ref 回本 award」的循環項（同 activities 的 host 排除；user 2026-06-15）
    const host = row.dataset.refHostAward ? { awardId: row.dataset.refHostAward } : null;

    const pdfUrl = row.dataset.refPdfUrl;
    if (pdfUrl) {
      const title = { en: row.dataset.refTitleEn || '', zh: row.dataset.refTitleZh || '' };
      // 該 file 自己的手填 references（含 award 反向 ref → viewer 內可 ref 回得獎紀錄）也 union 進去
      const files = await loadFilesDataCached().catch(() => []);
      const fileItem = (Array.isArray(files) ? files : []).find(f => f.pdfUrl === pdfUrl);
      const auto = isImageDocumentUrl(pdfUrl)
        ? []
        : await (await import('./pdf-cross-ref-index.js')).getPdfRefSources(pdfUrl);
      const references = excludeHostFromRefs(unionRefs(auto, await resolveLibManualRefs(fileItem)), host);
      const shareUrl = libShareUrl(fileItem && fileItem.id && `f-${fileItem.id}`);
      openLibraryDocument({ url: pdfUrl, item: fileItem, title, color, references, shareUrl });
      return;
    }

    const pressId = row.dataset.refPressId;
    if (pressId) {
      const press = await loadPressDataCached().catch(() => []);
      const item = (Array.isArray(press) ? press : []).find(p => String(p.id) === String(pressId));
      if (!item) return;
      const title = { en: item.titleEn || '', zh: item.titleZh || '' };
      // press 只吃 PDF + 影片（images 已移除 2026-08-20）：有影片→media lightbox、否則 PDF→viewer（同 press panel 點擊）
      const vidList = (item.videoUrls && item.videoUrls.length) ? item.videoUrls : (item.videoUrl ? [item.videoUrl] : []);
      const media = [];
      vidList.forEach(url => {
        const m = videoMediaFromUrl(url, '');
        if (m) media.push(m);
      });
      if (media.length) {
        const references = excludeHostFromRefs(await resolveLibManualRefs(item), host);
        document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media, index: 0, title, color, references } }));
      } else if (item.pdfUrl) {
        const { getPdfRefSources } = await import('./pdf-cross-ref-index.js');
        const auto = await getPdfRefSources(item.pdfUrl);
        const references = excludeHostFromRefs(unionRefs(auto, await resolveLibManualRefs(item)), host);
        // press 無浮水印 → 更高 canvas 上限＋裁頂封面當馬賽克墊圖（同 press panel 點擊）
        document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl, title, color, references, shareUrl: libShareUrl(item.id), cover: item.cover || '', maxCanvasDim: 16384, coverAspect: 1.5, autoRead: true } }));
      }
      return;
    }

    const albumId = row.dataset.refAlbumId;
    if (albumId) {
      const albums = await loadAlbumItemsCached().catch(() => []);
      const item = (Array.isArray(albums) ? albums : []).find(a => String(a.id) === String(albumId));
      if (!item || !item.media || !item.media.length) return;
      const title = { en: item.titleEn || '', zh: item.titleZh || '' };
      const references = excludeHostFromRefs(await resolveLibManualRefs(item), host);
      document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media: item.media, index: 0, title, color, references, shareUrl: libShareUrl(item.id && `album-${item.id}`) } }));
      return;
    }

    const section = row.dataset.refSection;
    if (!section) return;
    const itemId = row.dataset.refItem;
    const a = document.createElement('a');
    // ⚠️ href 要用 pathname 形式不能用 sitePath()（完整 http URL 會被 router 攔截器當外部連結放行 → 整頁重載、
    //    fromUserNav=false 導航動畫不播）；SITE_BASE_PATHNAME 前綴讓子路徑部署也成立
    a.href = `${SITE_BASE_PATHNAME}pages/activities.html?section=${encodeURIComponent(section)}${itemId ? `&item=${encodeURIComponent(itemId)}` : ''}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// ── Awards Panel ──────────────────────────────────────────────────────────────

// 點 award row → 點擊處冒一個隨機 award icon，scale pop-in 再 pop-out 消失（user 2026-06-22：消失走 scale 不是 opacity）
// position:fixed 貼點擊座標 + GSAP xPercent/yPercent 置中（與 scale 同 transform matrix，不另用 CSS translate）
const AWARD_ICON_COUNT = 5; // website-icons/Award_Icons/award_cursor_1..5.svg
let _lastAwardIconN = 0;     // 防連續同圖：下一個永遠不跟上一個一樣（user 2026-06-22）
function spawnAwardIcon(x, y) {
  if (typeof gsap === 'undefined') return;
  let n;
  do { n = Math.floor(Math.random() * AWARD_ICON_COUNT) + 1; } while (n === _lastAwardIconN);
  _lastAwardIconN = n;
  // CSS mask + background-color 跟「library 卡」走（非 page）：色由 .award-spawn-icon class 控（library.css）：
  // mode1/2 卡匹配 page → theme-fg（黑/白）；mode3 卡是反色島(深卡/淺卡與 page 相反) → theme-fg-inverse（亮 hue
  // 白/暗 hue 黑）＝卡的對比字色。元素 fixed 在 body 上吃不到 #library-card 的 --lib-fg，故走 class override。
  // 原本 inline bg-color:var(--theme-fg)＝跟 page，反色島深卡上冒黑圖看不見（user 2026-06-27）。
  const url = sitePath(`website-icons/Award_Icons/award_cursor_${n}.svg`);
  const el = document.createElement('span');
  el.className = 'award-spawn-icon';
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:30px;height:30px;display:block;pointer-events:none;z-index:10000;-webkit-mask:url('${url}') center/contain no-repeat;mask:url('${url}') center/contain no-repeat;`;
  document.body.appendChild(el);
  // 往四周直線飛出（user 2026-08-12：拋物線改直線放射，方向隨機 360° → 往四周散）：
  // scale 0→1 pop-in（back 過衝）再→0 收掉（不碰 opacity，消失效果保留）。
  const ang  = Math.random() * Math.PI * 2;             // 隨機方向 0~360°
  const dist = 40 + Math.random() * 30;                 // 飛出距離 40~70
  const dx   = Math.cos(ang) * dist;
  const dy   = Math.sin(ang) * dist;
  // 旋轉（user 2026-08-12）：起始就設好一個隨機傾角 ±0~30°，飛行途中不再轉（原本出現期間轉 30° 已移除）。
  // 走 GSAP rotation（與 xPercent/yPercent 同 transform compose，置中不被轉掉）。
  const rot = (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 30);
  gsap.timeline({ onComplete: () => el.remove() })
    .fromTo(el, { xPercent: -50, yPercent: -50, scale: 0, x: 0, y: 0, rotation: rot },
                { scale: 1, duration: 0.18, ease: 'back.out(1.8)' }, 0)
    .to(el, { x: dx, y: dy, duration: 0.66, ease: 'power2.out' }, 0)       // 直線射出、減速
    .to(el, { scale: 0, duration: 0.2, ease: 'power2.in' }, 0.46);         // 收掉
}

// Awards ticker 的獎項 logo：Directus singleton library_award_logos 的 logos（Files-multiple M2M）。
// 後台 junction（library_award_logos_files）有 sort 欄 → deep[logos][_sort]=sort 依後台拖曳順序回傳。
// 沿用 press panel 的「CMS 優先、失敗/空 fallback 本地」pattern：CMS 掛掉時用 records.json 的 awardsImages。
async function fetchAwardLogos(localFallback) {
  try {
    const url = `${CMS_API_BASE}/library_award_logos?fields=logos.directus_files_id.filename_disk&deep[logos][_sort]=sort`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('CMS ' + res.status);
    const logos = (await res.json())?.data?.logos;
    if (!Array.isArray(logos) || logos.length === 0) throw new Error('CMS empty');
    return logos.map(j => j?.directus_files_id?.filename_disk).filter(Boolean)
      .map(cdnImage);   // CloudFront：離線 webp 轉檔後即 webp、SVG 亦直接 serve；繞過弱機 /assets 逾時
  } catch (cmsErr) {
    console.warn('[awards] Directus logos 抓取失敗/無資料，fallback 本地 awardsImages：', cmsErr.message);
    return localFallback || [];
  }
}

// award 資料（records + Directus logos + 已 resolve 的 refs）module 快取，對齊 press/files/album：
// Directus M2A references 深取：library_awards 允許 ref documents/press/album，2026-08-03 起 album 也接了
// （library_album 已透過 loadOthersAlbum 接上 Directus，M2A 選的 row 跟前台 album 面板渲染的是同一顆 id）。
const AWARD_REF_FIELDS = [
  'references.collection',
  'references.item:library_documents.id', 'references.item:library_documents.titleEn', 'references.item:library_documents.titleZh', 'references.item:library_documents.pdf.filename_disk', 'references.item:library_documents.pdfLink',
  'references.item:library_press.id', 'references.item:library_press.titleEn', 'references.item:library_press.titleZh',
  'references.item:library_album.id', 'references.item:library_album.titleEn', 'references.item:library_album.titleZh', 'references.item:library_album.images.directus_files_id',
].join(',');

// 一筆 M2A ref {collection, item:{id,titleEn?,titleZh?,pdf?,images?}} → resolveAwardRef 認得的同一種 { kind, ... } shape。
// press 的 pressId 要補 `press-` 前綴，因為 loadPressDataCached()（下方點擊分派用）不管 Directus 或本地 fallback
// 產出的 press.id 都是 `press-<id>` 格式，沒補前綴會查不到目標（同 activities-source.js 的 press href 對齊問題）；
// album 的 albumId 不加前綴——loadAlbumItemsCached() pool 進來的各來源 item.id 本來就是裸值（同本地 album JSON 慣例）。
function remapAwardRef(r) {
  const it = (r && typeof r.item === 'object' && r.item) ? r.item : {};
  const id = it.id;
  if (!id) return null;
  switch (r.collection) {
    case 'library_documents': {
      const pdfUrl = pdfOpenUrl(it.pdfLink, it.pdf);   // pdfLink 優先，否則上傳檔走 CloudFront（見 pdf-url.js，與 mapDirectusFilesRow / cross-ref 共用）
      return pdfUrl ? { kind: 'document', labelEn: AWARD_REF_TYPE_LABELS.document.en, labelZh: AWARD_REF_TYPE_LABELS.document.zh, titleEn: it.titleEn || '', titleZh: it.titleZh || '', pdfUrl } : null;
    }
    case 'library_press':
      return { kind: 'press', labelEn: AWARD_REF_TYPE_LABELS.press.en, labelZh: AWARD_REF_TYPE_LABELS.press.zh, titleEn: it.titleEn || '', titleZh: it.titleZh || '', pressId: `press-${id}` };
    // 沒圖的相簿沒東西可開，比照 document 沒 pdf 的略過規則（同本地 resolveAwardRef 舊行為）
    case 'library_album':
      return Array.isArray(it.images) && it.images.length
        ? { kind: 'album', labelEn: AWARD_REF_TYPE_LABELS.album.en, labelZh: AWARD_REF_TYPE_LABELS.album.zh, titleEn: it.titleEn || '', titleZh: it.titleZh || '', albumId: id }
        : null;
    default: return null;
  }
}
const remapAwardRefs = (arr) => Array.isArray(arr) ? arr.map(remapAwardRef).filter(Boolean) : [];

// Directus library_awards row → renderItems 吃的 shape（欄位對齊 records.json 慣例的 xxx_en/xxx 雙語鍵）。
// 後台欄位叫 category（避免跟 collection 名 award 混淆）映射回前台既有的 award_en/award。
// id 加 `a-` 前綴＝ deep-link hash 需要（同 resolveInitialTabFromHash 的 #a-* 規則、對齊 press 面板 `press-${id}` 慣例）。
function mapDirectusAwardRow(row) {
  return {
    id: row.id != null ? `a-${row.id}` : undefined,
    flag: row.country || '',
    year: row.year,
    competition_en: row.competitionEn || '', competition: row.competitionZh || '',
    // 主辦單位／獎項類別／名次 2026-08-25 起改 repeater（可多筆 {en,zh}）；scalar 欄保留作舊資料 / records.json fallback。
    categories: Array.isArray(row.categories) ? row.categories.map(o => ({ en: o.en || '', zh: o.zh || '' })) : [],
    ranks: Array.isArray(row.ranks) ? row.ranks.map(o => ({ en: o.en || '', zh: o.zh || '' })) : [],
    organizers: Array.isArray(row.organizers) ? row.organizers.map(o => ({ en: o.en || '', zh: o.zh || '' })) : [],
    award_en: row.categoryEn || '', award: row.categoryZh || '',
    rank_en: row.rankEn || '', rank: row.rankZh || '',
    // winners repeater（可多人）→ normalizeWinners 認得的 {en,zh} 陣列；沒填時給空陣列，
    // normalizeWinners 會 fallback 用 winner_en/winner（這裡留空字串，等同無得獎人顯示空白，不會壞版面）。
    winners: Array.isArray(row.winners) ? row.winners.map(w => ({ en: w.nameEn || '', zh: w.nameZh || '' })) : [],
    organizer_en: row.organizerEn || '', organizer: row.organizerZh || '',
    _resolvedRefs: remapAwardRefs(row.references),
  };
}

// Directus 回的是扁平列表，awards 面板渲染吃 records.json 同款 year-grouped [{year,items}]（同 activities-source groupByYear）。
function groupAwardsByYear(items) {
  const byYear = new Map();
  items.forEach(it => {
    const y = it.year ?? '—';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(it);
  });
  return [...byYear.entries()]
    .sort((a, b) => (Number(b[0]) || -Infinity) - (Number(a[0]) || -Infinity))
    .map(([year, yearItems]) => ({ year, items: yearItems }));
}

// fetch + resolve 一次，之後切 panel / 跨 SPA 換頁回 library 都重用（原本每次 initAwardsPanel 都重 fetch）。
// 2026-08-03 起 Directus 優先（library_awards）、失敗/空 fallback 本地 records.json（同 press/summer-camp pattern）。
let _awardsDataPromise = null;
function loadAwardsDataCached() {
  if (_awardsDataPromise) return _awardsDataPromise;
  _awardsDataPromise = (async () => {
    // records.json 仍是 awardsImages（ticker logo 本地 fallback）的來源，不管主表走哪條路都要讀
    const localRes  = await fetch(sitePath('data/records.json'));
    const localData = await localRes.json();
    const localLogos   = Array.isArray(localData) ? [] : (localData.awardsImages || []);
    const awardsImages = await fetchAwardLogos(localLogos);

    let realRecords;
    try {
      const url = `${CMS_API_BASE}/library_awards?fields=*,${AWARD_REF_FIELDS}&sort=-year,sort&limit=-1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CMS ' + res.status);
      const rows = (await res.json())?.data;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
      realRecords = groupAwardsByYear(rows.map(mapDirectusAwardRow));
    } catch (cmsErr) {
      console.warn('[awards] Directus 抓取失敗/無資料，fallback 本地 records.json：', cmsErr.message);
      realRecords = Array.isArray(localData) ? localData : localData.records;
      // 本地 fallback 仍是舊格式（手動 references[]），走原本的 resolveAwardRef 逐筆查
      await Promise.all(realRecords.flatMap(yg => (yg.items || []).map(async item => {
        const refs = Array.isArray(item.references) ? item.references : [];
        item._resolvedRefs = refs.length ? (await Promise.all(refs.map(resolveAwardRef))).filter(Boolean) : [];
      })));
    }

    const records = [...realRecords].sort((a, b) => b.year - a.year).slice(0, 20);
    return { records, awardsImages };
  })();
  return _awardsDataPromise;
}

async function initAwardsPanel(onEntranceDoneCallback) {
  try {
    ensureFlagIconsCss();
    const { records, awardsImages } = await loadAwardsDataCached();

    const listEl = document.getElementById('library-awards-list');
    if (!listEl) return;

    // 點列上任何位置 → 冒隨機 award icon。capture 階段：ref toggle 的 stopPropagation 擋不到
    // listEl 在 #page-content 內，換頁 innerHTML swap 連 listener 一起換掉 → 不洩漏，免註冊 cleanup
    // ⚠️ 點「展開的 ref 區」(.award-ref-wrap) 不冒 award icon（user 2026-06-23：點 ref bar 不該出現 award icon）。
    //    capture 階段在 ref toggle stopPropagation 之前跑，故這裡要自己擋（同 toggle 的 .award-ref-wrap 排除）。
    listEl.addEventListener('click', (e) => {
      if (e.target.closest('.award-ref-wrap')) return;
      if (e.target.closest('.award-record-item')) spawnAwardIcon(e.clientX, e.clientY);
    }, true);

    const scrollEl = document.getElementById('library-awards-scroll');
    const countEl  = document.getElementById('library-awards-count');

    // list 下方計數：「目前 viewport 內第 first-last 個 / 總數」
    // total = 目前可見（未被年份篩選 / 搜尋隱藏）的 award 項目數；隱藏項 offsetParent 為 null 自動排除
    function updateAwardsCount() {
      if (!countEl || !scrollEl) return;
      const items = [...listEl.querySelectorAll('.award-record-item')].filter(el => el.offsetParent !== null);
      const total = items.length;
      if (!total) { countEl.textContent = ''; return; }
      const vTop    = scrollEl.getBoundingClientRect().top;
      const vBottom = vTop + scrollEl.clientHeight;
      let first = 0, last = 0;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > vTop && r.top < vBottom) { if (!first) first = i + 1; last = i + 1; }
      });
      if (!first) { countEl.textContent = `${total} / ${total}`; return; }
      countEl.textContent = first === last ? `${first} / ${total}` : `${first}-${last} / ${total}`;
    }
    // 元素級 listener：SPA 換頁時 scrollEl 隨 #page-content 一起銷毀，不會累積，免註冊 page-cleanup
    if (scrollEl) scrollEl.addEventListener('scroll', updateAwardsCount, { passive: true });

    // ── 渲染 ──
    // 每行包 .award-cell-line > .award-cell-inner：矮橫向窄欄 crop 時逐行 marquee 用
    //（applyMarqueeOverflow row/inner 結構；桌面/直向無對應 CSS＝純多一層 span 零視覺差）
    const cellLine = (txt, weight) =>
      `<span class="award-cell-line"${weight ? ` style="font-weight:${weight};"` : ''}><span class="award-cell-inner">${txt}</span></span>`;
    const bilingual     = (en, zh) => en ? cellLine(en) + cellLine(zh) : cellLine(zh);
    const bilingualBold = (en, zh) => en
      ? cellLine(en, 700) + cellLine(zh, 700)
      : cellLine(zh, 700);
    // 主辦單位／獎項類別／名次可為 repeater 陣列 [{en,zh}]（Directus）或舊 scalar（records.json）；
    // 統一成陣列，每筆各自 bilingual 疊放在同一 cell（獨立 repeater、不跟隔壁欄配對對齊，user 2026-08-25 定案）。
    const toBiList = (arr, en, zh) =>
      (Array.isArray(arr) && arr.length) ? arr.filter(o => o.en || o.zh)
        : (en || zh) ? [{ en, zh }] : [];

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

    // 水平 track marquee 內容（得獎人 + 主辦/類別/名次共用同結構＝同 CSS＋同 applyWinnersHMarquee 橫捲＋同 hover 回彈）：
    // 每筆＝一個 .award-winner-pair（EN 上 ZH 下，各含 .award-marquee-inner 供手機逐行 marquee）。桌面多筆整位橫捲、
    // 單筆靜態；手機直排。bold 只給得獎人（原本 700）。pairs 間 gap 由 CSS 撐開，避免文字黏一起。
    const buildHMarqueeTrack = (list, bold) => {
      const w = bold ? ' style="font-weight:700;"' : '';
      const pairs = list.map(o => {
        const enHtml = o.en ? `<div class="award-winner-en"${w}><span class="award-marquee-inner">${o.en}</span></div>` : '';
        const zhHtml = o.zh ? `<div class="award-winner-zh"${w}><span class="award-marquee-inner">${o.zh}</span></div>` : '';
        return `<div class="award-winner-pair">${enHtml}${zhHtml}</div>`;
      }).join('');
      return `<div class="award-winners-track">${pairs}</div>`;
    };
    const buildWinnersHtml = (winners) => buildHMarqueeTrack(winners, true);
    // 主表 marquee cell（主辦/類別/名次）：套 .award-winners viewport → 跟得獎人欄一模一樣的 marquee 行為
    const hmarqueeCell = (list) => `<div class="award-winners flex flex-col" style="min-width:0;">${buildHMarqueeTrack(list, false)}</div>`;

    // 多獲獎者水平 marquee：每位獲獎者佔滿整個 col 寬，整位整位滾（不會卡到一半）
    // viewport = grid col 寬 → 量 view.offsetWidth 當作 pair 寬，強制 set 到每個 pair
    // 滾動距離 = pairW × pairs.length（=複製前 track 寬），複製一份接合 seamless loop
    // 手機（< 768）：pair 不 viewport-wide（會異常慢），改自然寬度排列 + 純 CSS marquee
    //                CSS marquee keyframe = translateX(-50%) 配合複製一份 seamless；duration 依名字數線性放大
    function applyWinnersHMarquee(scope) {
      // 矮橫向欄寬同手機一樣窄 → 走手機分支（直排 + 個別 marquee，不整位橫排）
      const isMobile = window.innerWidth < 768 || isShortLandscape();
      const SECONDS_PER_WINNER = isMobile ? 3 : 2.5;
      scope.querySelectorAll('.award-winners').forEach(viewport => {
        const view = /** @type {HTMLElement} */ (viewport);
        const track = /** @type {HTMLElement | null} */ (view.querySelector('.award-winners-track'));
        if (!track) return;

        // idempotent：本函式可被 showLibPanel 重跑（window._awardsMarqueeInit）。
        // 首次 render 時若卡片尚未 sized（SPA 重訪 fetch cached 太快 resolve）→ 桌面 offsetWidth=0
        // → 下方 early-return 沒套 marquee → 多名得獎者擠成一團（user 2026-06-05「award 名稱卡住」）。
        // panel 顯示後再量一次才會對。首次記乾淨 track HTML（單份、無 inline width），
        // 重跑時先還原再重套，避免複製份疊加。
        if (view._hmOrig == null) {
          view._hmOrig = track.innerHTML;
        } else {
          track.innerHTML = view._hmOrig;
          view.classList.remove('is-hmarquee');
          view.style.removeProperty('--hmarquee-distance');
          view.style.removeProperty('--hmarquee-duration');
        }

        const pairs = /** @type {HTMLElement[]} */ ([...track.querySelectorAll('.award-winner-pair')]);
        if (pairs.length <= 1) return;

        if (isMobile) {
          // 手機 v5（2026-06-10）：award 改 3 欄版型，得獎人在第 3 欄垂直 stack（CSS .award-winners-track flex-column）。
          // 不橫向 marquee、不複製 track（複製會讓多得獎人各顯示兩次）。
          return;
        }

        // 桌面：量 viewport 寬（= grid col 寬）當作每位獲獎者佔的單位寬度
        const pairW = view.offsetWidth;
        if (!pairW) return;  // 卡片尚未 sized；showLibPanel 顯示後會再呼叫一次（window._awardsMarqueeInit）重量

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

        // 桌面 hover 放開平滑回彈：只綁一次（applyWinnersHMarquee 會重跑；enter lazy 讀當下 distance 故重量自動對）
        const item = /** @type {HTMLElement|null} */ (view.closest('.award-record-item'));
        if (item && !item._awardHmBound) registerPageCleanup(bindAwardWinnersReturn(item));
      });
    }

    // award row 與 ref 列共用同一組欄位模板，確保「ref label 對齊競賽名稱欄、ref title 對齊主辦單位欄」（user 2026-06-13 六輪）。
    // 7 欄：flag(1.5em) 競賽名稱(2.5fr) 主辦單位(2fr) 獎項(1.5fr) 名次(1fr) 得獎人(1fr) ref鈕(1.5em)
    // 主辦單位欄是把原 4.5fr 競賽欄拆成 2.5+2，其餘欄位比例不變。
    // cell gap 矮橫向縮 1rem（窄卡 2rem×6 吃掉太多欄寬）；gate 每次 init 判一次、跨 gate 轉向靠 orientation-reload
    const AWARD_GRID = `grid-template-columns: 1.5em 2.5fr 2.5fr 1.3fr 1fr 1fr 1.5em; gap: 0 ${isShortLandscape() ? '1rem' : '2rem'};`;
    // ref 展開列：版型沿用 list-ref-btn（hover 黑底），但 grid 改用 AWARD_GRID 對齊主表 —
    // 箭頭 icon 落國旗欄(col 1)、label/title 從「競賽名稱」欄(col 2)起算往右展開對齊 award 名稱。
    const escAttr = s => String(s || '').replace(/"/g, '&quot;');
    // hostAwardId = 此 ref row 所在的 award id → 點 document/press ref 開 lightbox 時當 host 排除（popover 不 ref 回本 award）
    const buildRefRowsHtml = (refs, hostAwardId) => refs.map(r => {
      const dataAttrs = r.kind === 'document'
        ? `data-ref-pdf-url="${escAttr(r.pdfUrl)}" data-ref-title-en="${escAttr(r.titleEn)}" data-ref-title-zh="${escAttr(r.titleZh)}"`
        : r.kind === 'press'
        ? `data-ref-press-id="${escAttr(r.pressId)}"`
        : r.kind === 'album'
        ? `data-ref-album-id="${escAttr(r.albumId)}"`
        : `data-ref-section="${escAttr(r.section)}" data-ref-item="${escAttr(r.itemId)}"`;
      return `
        <button class="list-ref-btn award-ref-row cursor-pointer border-none w-full text-left" style="display:grid;${AWARD_GRID}align-items:start;padding:var(--spacing-xs) var(--spacing-sm);" data-ref-host-award="${escAttr(hostAwardId)}" ${dataAttrs}>
          <div class="flex justify-start" style="grid-column:1;padding-top:0.25em;">
            <span class="icon icon-ref-list icon-xs"></span>
          </div>
          <div class="flex flex-col min-w-0" style="grid-column:2 / -2;">
            ${r.labelEn || r.labelZh ? `<div class="list-ref-label mb-en-zh-s">
              ${r.labelEn ? `<p class="text-xs">${r.labelEn}</p>` : ''}
              ${r.labelZh ? `<p class="text-xs">${r.labelZh}</p>` : ''}
            </div>` : ''}
            ${r.titleEn ? `<div class="list-title-marquee"><p class="text-xs font-bold">${r.titleEn}</p></div>` : ''}
            ${r.titleZh ? `<div class="list-title-marquee"><p class="text-xs font-bold">${r.titleZh}</p></div>` : ''}
          </div>
        </button>`;
    }).join('');

    // 收合單一 award ref 手風琴 + 清底色。instant=無動畫（切 panel reset 用）；動畫版＝開新項時先收其他項。
    function collapseAwardItem(item, { instant = false, matchOpen = false } = {}) {
      const wrap = /** @type {HTMLElement | null} */ (item.querySelector('.award-ref-wrap'));
      if (!wrap || wrap.dataset.open !== '1') return;
      wrap.dataset.open = '';
      const chevron = item.querySelector('.award-ref-toggle .icon');
      const cleanup = () => {
        delete item.dataset.refOpen;
        item.style.removeProperty('--item-color');
        item.style.removeProperty('--item-color-deep');
        item.style.background = '';
        delete item.dataset.accentHex;
      };
      if (instant || typeof gsap === 'undefined') {
        if (typeof gsap !== 'undefined') { gsap.killTweensOf(wrap); if (chevron) gsap.set(chevron, { rotation: -90 }); }
        wrap.style.height = '0';
        cleanup();
      } else {
        if (chevron) gsap.to(chevron, { rotation: -90, duration: DUR.fast, overwrite: true });
        // matchOpen＝「開新項同時收舊項」路徑：收合 ease/duration 必須跟開新 wrap 的 tween 完全一致（enterSoft），
        // 兩條 tween 逐幀高度互相抵銷、list 淨高度單調變化。原本收用 exitSoft（power2.in 慢起步）、開用 enterSoft
        // （power2.out 快起步）＝中段淨高度暫時多出 ~60px 再收回 → 固定高捲動框內 scroll anchoring 補償 scrollTop，
        // 視覺上整個 list 被推上去又彈回（user 2026-09-01 報「list 高度被縮小、定位後又恢復」）。自關維持 exitSoft 倒帶。
        gsap.to(wrap, { height: 0, duration: DUR.medium, ease: matchOpen ? EASE.enterSoft : EASE.exitSoft, overwrite: true, onComplete: cleanup });
      }
    }

    function renderItems(data) {
      listEl.innerHTML = '';
      let rowIdx = 0; // 跨 year-block 連續編號，給斑馬列交替（第一個=深格）
      data.forEach(yearGroup => {
        const itemsHtml = (yearGroup.items || []).map((item) => {
          const zebra = (rowIdx++ % 2 === 0) ? ' list-item-zebra' : ''; // 偶數序(0,2,4…)=深格，第一列即深（class 對齊 activities）
          const winners = normalizeWinners(item);
          const refs = item._resolvedRefs || [];
          const winnerSearch = winners.map(w => `${w.en} ${w.zh}`).join(' ');
          // 主辦單位／獎項類別／名次：repeater（可多筆）→ 統一成陣列（scalar 舊資料當單筆）。
          // 空資料也渲染空 cell 保持欄位結構（auto-flow 不錯位、各列對齊點一致）。user 2026-06-13 六輪。
          const organizers = toBiList(item.organizers, item.organizer_en, item.organizer);
          const categories = toBiList(item.categories, item.award_en, item.award);
          const ranks = toBiList(item.ranks, item.rank_en, item.rank);
          const flat = (arr) => arr.map(o => `${o.en} ${o.zh}`).join(' ');
          const searchText = [item.competition_en, item.competition, flat(categories), winnerSearch, flat(ranks), flat(organizers)]
            .filter(Boolean).join(' ').toLowerCase();
          const hasExpand = refs.length > 0;
          // 有 ref → pointer cursor（暗示可展開）；無 ref → default。JS inline 不能用 var(--cursor-*)
          // （variables.css 註明），且 library.css 動態載入會讓 var 內相對 url 404 → 用 sitePath 寫完整 url
          const cursorStyle = hasExpand
            ? `cursor:url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer;`
            : `cursor:url('${sitePath('custom-cursor/default.svg')}') 9 2, default;`;
          // ref 鈕：收合態下 chevron（user 2026-06-22）。chevron-list base 朝左：rotate(-90deg)=朝下、90=上（icon.css 註解上下標反了，以此為準）。
          // 整列可點開合（見下方 click handler），chevron 為視覺提示；點它 bubble 到 item 一樣觸發開合。
          const refBtnHtml = hasExpand ? `
            <button class="award-ref-toggle" aria-label="Show references"
                    style="background:none;border:none;padding:0.23em 0 0;color:inherit;cursor:url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer;line-height:1;">
              <span class="icon icon-chevron-list icon-s" style="transform:rotate(-90deg);"></span>
            </button>` : '';
          // ref 展開區：item 改 block 後，ref-wrap 是 item 的「滿寬 block child」(對齊 activities .list-content：
          // 乾淨 block、不是 grid-column 1/-1 的 fractional grid item)→ 不靠負 margin 逃逸 item padding，button w-full
          // 完全貼齊容器寬、右緣不再有 sub-pixel 縫。height 0 起始由 toggle 做 accordion 開合。
          // 間距全靜態（user 2026-09-01「padding 不該在 ref 開合時被調整」，對齊 activities 結構）：
          // item 底 padding 移到 .award-row 的 padding-bottom（library.css）→ wrap 貼 item 底邊＝分割線。
          // 開 ref：塊貼齊分割線、與主列文字的縫＝row 自己的 padding-bottom（恆定不動）；
          // 動畫只動 wrap height，無任何 margin/padding tween，list 總高＝原高＋ref 塊、除插入外零位移。
          const refWrapHtml = hasExpand ? `
            <div class="award-ref-wrap" style="height:0;overflow:hidden;">
              <div class="flex flex-col">${buildRefRowsHtml(refs, item.id)}</div>
            </div>` : '';
          // award-mid 桌面 display:contents → 內 4 cell 落 col 2-5（競賽名稱 / 主辦單位 / 獎項 / 名次）；
          // 手機 flex-column 內部直排。主辦單位插在競賽名稱與獎項之間 = 主表第 3 欄、對齊 ref title 欄。
          // item 改 block（非 grid）：主列 cells 包進 .award-row（grid，吃 padding-left/right:sm 內縮），ref-wrap 是
          // item 的 block child（滿寬、不靠負 margin）。zebra / open accent bg 仍掛 item → 滿格滿寬（item 無水平 padding）。
          return `
            <div class="award-record-item py-[0.5rem]${zebra}"
                 style="font-size: var(--font-size-xs);${cursorStyle}"
                 data-search="${searchText}"${item.id ? ` id="${item.id}"` : ''}>
              <div class="award-row" style="display:grid;${AWARD_GRID} align-items: start;">
                <div style="padding-top: 0.1em;">${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}</div>
                <div class="award-mid">
                  <div class="truncate flex flex-col" role="heading" aria-level="3">${bilingualBold(item.competition_en, item.competition)}</div>
                  ${hmarqueeCell(organizers)}
                  ${hmarqueeCell(categories)}
                  ${hmarqueeCell(ranks)}
                </div>
                <div class="award-winners flex flex-col" style="min-width:0;">${buildWinnersHtml(winners)}</div>
                <div class="award-ref-cell" style="display:flex;justify-content:flex-end;">${refBtnHtml}</div>
              </div>
              ${refWrapHtml}
            </div>`;
        }).join('');

        listEl.insertAdjacentHTML('beforeend', `
          <div class="year-block" data-year="${yearGroup.year}">
            <div class="press-year-label" style="font-size: var(--font-size-xs); font-weight: 700; padding: 0 0 0.25rem; position: sticky; top: -1px; background: var(--lib-bg); z-index: 2;"><span class="year-label-text">${yearGroup.year}</span></div>
            <div class="flex flex-col">${itemsHtml}</div>
          </div>`);
      });

      // hover：整列 accent 底色（user 2026-06-22 改：對齊 activities list-item；原本是文字變色 highlight）。
      // standard/inverse 隨機三原色 inline bg、mode-color 由 library.css [style*=background] 規則翻 theme-fg。
      // ⚠️ 只在桌面綁：手機 tap 會觸發 emulated mouseenter → 底色殘留（user 2026-06-10 #2：手機點 award 不變色）。
      // ref 展開中（data-ref-open）鎖定當下色：不重 roll、離開不清。
      if (window.innerWidth >= 768 && !isShortLandscape()) {
        listEl.querySelectorAll('.award-record-item').forEach(item => {
          item.addEventListener('mouseenter', () => {
            if (item.dataset.refOpen) return;
            const color = SCCDHelpers.getRandomAccentColor();
            item.style.background = color;
            item.dataset.accentHex = color;
          });
          item.addEventListener('mouseleave', () => {
            if (item.dataset.refOpen) return;
            item.style.background = '';
            delete item.dataset.accentHex;
          });
        });
      }

      // 整列可點開合（user 2026-06-22：不必點 chevron）+ ref row 點擊分派。
      // 開合對齊 activities：開啟時整列鎖 accent 底 + set --item-color-deep → ref 列底色＝deep accent
      // （共用 .list-ref-btn 規則接手，見 library.css 改後註解）。accordion height 0↔auto 手感不變。
      listEl.querySelectorAll('.award-record-item').forEach(item => {
        const wrap = /** @type {HTMLElement | null} */ (item.querySelector('.award-ref-wrap'));
        if (!wrap) return;  // 無 ref → 不可展開、不綁點擊（hover 底色仍套，但無內容可開）
        item.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
        item.addEventListener('click', (e) => {
          // 點在「展開的 ref 區」內一律不觸發開合（chevron 不跳、award 不收）——
          // 不只 ref row 本身，連 row 之間的 gap / wrap padding 也算（user 2026-06-22：點 award ref 不要觸發 chevron 跳）。
          // ref row 自身點擊照常開 PDF / lightbox / 跳頁（bindAwardRefRowClick）。
          if (/** @type {HTMLElement} */ (e.target).closest('.award-ref-wrap')) return;
          const isOpen = wrap.dataset.open === '1';
          wrap.dataset.open = isOpen ? '' : '1';
          // chevron 跟著開合轉（對齊 activities：開→朝上 90 / 合→朝下 -90；chevron-list base 朝左：90=上、-90=下）。
          // isOpen=展開前的狀態（true=本來開著、這次點是要收）→ 收回朝下 -90、展開朝上 90。
          const chevron = item.querySelector('.award-ref-toggle .icon');
          if (chevron && typeof gsap !== 'undefined') {
            gsap.to(chevron, { rotation: isOpen ? -90 : 90, duration: DUR.fast, overwrite: true });
          }
          if (!isOpen) {
            // 一次只開一個（比照 activities）：開新項前先收其他展開中的 ref
            listEl.querySelectorAll('.award-record-item').forEach(other => {
              if (other !== item) collapseAwardItem(other, { matchOpen: true });
            });
            // 開：立刻鎖 accent 底 + deep ref（同 activities proceedOpen）
            item.dataset.refOpen = '1';
            const color = item.dataset.accentHex || SCCDHelpers.getRandomAccentColor();
            item.dataset.accentHex = color;
            item.style.background = color;
            item.style.setProperty('--item-color', color);
            item.style.setProperty('--item-color-deep', ACCENT_TO_DEEP[color] || color);
          }
          // 收合的底色處理延到收合動畫「完成」才做（對齊 activities closeListHeader：收合期間維持當下色、
          // 不立即吃下一色；收完才清，還在 hover 上就重 roll 一個新色）。refOpen 留到收完才解除，避免收合
          // 期間 mouseleave 把底色清掉。
          const onCloseDone = () => {
            delete item.dataset.refOpen;
            item.style.removeProperty('--item-color');
            item.style.removeProperty('--item-color-deep');
            if (window.innerWidth >= 768 && !isShortLandscape() && item.matches(':hover')) {
              const color = SCCDHelpers.getRandomAccentColor();
              item.style.background = color;
              item.dataset.accentHex = color;
            } else {
              item.style.background = '';
              delete item.dataset.accentHex;
            }
          };
          // ⚠️2026-09-01 定案：無任何 margin/padding tween（見 refWrapHtml 註解）——舊「負 marginBottom 貼齊
          // 分割線」會在開啟過程漸進吃掉 item 底 padding＝user 報「ref 出來時 list 高度縮小一個 padding」；
          // 改為 padding 靜態搬到 .award-row、wrap 本就貼分割線，動畫只動 height。
          // ⚠️2026-09-01 撤掉 scroll-anchor（原試把 item 捲到 #library-awards-scroll 框頂、像 activities）：
          // user 要「固定 list 位置及高度、ref 從 list 裏面原地往下推出」，不要整個 list 捲動重定位
          // （會把 item 自己的標題捲到裁掉，見 user 截圖）→ 維持原地展開：item 不動、ref 往下推、下方列跟著下移。
          // list 外框（#library-awards-scroll）本就固定高（426px）、content 在框內捲，開 ref 不改外框。
          if (typeof gsap !== 'undefined') {
            gsap.to(wrap, {
              // ease 對齊 activities .list-content（開 enterSoft 快起步／收 exitSoft）：flex-end 往下推需快起步，
              // 否則慢起步（power2.inOut）讓盒子先露底部空隙、文字後到＝不同步（user 2026-08-31）。
              height: isOpen ? 0 : 'auto',
              duration: DUR.medium, ease: isOpen ? EASE.exitSoft : EASE.enterSoft, overwrite: true,
              onComplete: isOpen ? onCloseDone : undefined,
            });
          } else {
            wrap.style.height = isOpen ? '0' : 'auto';
            if (isOpen) onCloseDone();
          }
        });
        wrap.querySelectorAll('.award-ref-row').forEach(row => bindAwardRefRowClick(/** @type {HTMLElement} */ (row)));
      });

      // 多獲獎者自動水平 marquee（桌面，不需 hover）
      applyWinnersHMarquee(listEl);
      // 手機／矮橫向：得獎人名字太長 → 個別 marquee（固定欄寬下溢出才跑；桌面是整位橫排 marquee 不需這個）
      if (window.innerWidth < 768 || isShortLandscape()) runMarqueeOverflow(listEl, '.award-winner-en, .award-winner-zh', '.award-marquee-inner');
      // 矮橫向：主表 cell（競賽/主辦/獎項/名次）被窄欄 crop → 逐行 marquee（.award-cell-line 由 render 包好；
      // 動畫 CSS 只在 landscape gate）。直向也要跑：applyMarqueeOverflow 自帶 reset——轉向後把橫向留下的
      // 兩份 .marquee-copy 還原單份（直向 cell 換行不溢出＝重判後維持單份），否則文字顯示兩次。
      if (window.innerWidth < 768 || isShortLandscape()) runMarqueeOverflow(listEl, '.award-cell-line', '.award-cell-inner');
      // ref 展開列標題過長 → marquee（桌面 hover 才跑、手機沿用全站 .list-title-marquee 自動跑慣例；量測見上）
      initAwardRefTitleMarquees(listEl);

      updateAwardsCount();
    }

    renderItems(getSorted());

    // 年份＋search 複合篩選單一入口（user 2026-08-10：任何篩選歸零都要 No Result）。
    // 原本 search handler 只看 q、年份 updateList 只看年份，兩邊互蓋顯隱、複合零結果判不出來。
    const awardsEmptyState = ensureEmptyState(listEl);
    const selectedYears = new Set();
    const searchInput = document.getElementById('library-awards-search');
    const applyAwardsFilters = () => {
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      listEl.querySelectorAll('.year-block').forEach(block => {
        const yearMatch = selectedYears.size === 0 || selectedYears.has(block.dataset.year);
        let blockVisible = false;
        block.querySelectorAll('.award-record-item').forEach(item => {
          const visible = yearMatch && (!q || (item.dataset.search || '').includes(q));
          /** @type {HTMLElement} */ (item).style.display = visible ? '' : 'none';
          if (visible) blockVisible = true;
          // 不動 border（visible items 一致 default border-b-2 黑）；防禦性清掉舊邏輯可能殘留的 border-b-4
          item.classList.remove('border-b-4');
          item.classList.add('border-black');
        });
        /** @type {HTMLElement} */ (block).style.display = blockVisible ? '' : 'none';
      });
      restripeZebra(listEl, '.award-record-item'); // 篩後依可見順序重排斑馬
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.year-block')]).some(b => b.style.display !== 'none');
      awardsEmptyState.classList.toggle('hidden', anyVisible);
      updateAwardsCount();
    };

    // showLibPanel('awards') 顯示 panel 後重量一次 winners marquee（首次 render 時卡片可能尚未 sized →
    // offsetWidth=0 → 多名得獎者擠成一團）。對齊 press/files/album 的 _XMarqueeInit 重觸發 pattern。
    window._awardsMarqueeInit = () => {
      applyWinnersHMarquee(listEl);
      if (window.innerWidth < 768 || isShortLandscape()) runMarqueeOverflow(listEl, '.award-winner-en, .award-winner-zh', '.award-marquee-inner');
      if (window.innerWidth < 768 || isShortLandscape()) runMarqueeOverflow(listEl, '.award-cell-line', '.award-cell-inner');
      initAwardRefTitleMarquees(listEl);
      updateAwardsCount();
    };

    // showLibPanel 切走 awards 時呼叫：瞬間收合所有展開的 ref 手風琴，回到 awards 不殘留展開態
    window._awardsResetAccordions = () => {
      listEl.querySelectorAll('.award-record-item').forEach(item => collapseAwardItem(item, { instant: true }));
    };

    // 年份 Picker
    const yearPickerEl = document.getElementById('library-year-picker');
    if (yearPickerEl) {
      const dataYears   = new Set(records.map(g => String(g.year)));
      const currentYear = new Date().getFullYear();
      const allYears    = [];
      for (let y = currentYear; y >= 1997; y--) allYears.push(y);

      // selectedYears 宣告在 panel 層（applyAwardsFilters 共用）；年份顯隱走複合篩選單一入口
      const updateList = applyAwardsFilters;
      const updateBtns = () => {
        const hasSel = selectedYears.size > 0;
        resetBtn.style.display = hasSel ? '' : 'none';
        yearPickerEl.querySelectorAll('button[data-year]').forEach(b => {  // [data-year] 排除同在 picker 內的 reset 鈕（手機版位）
          b.style.color = (!hasSel || selectedYears.has(b.dataset.year)) ? 'var(--lib-fg)' : 'rgba(var(--lib-fg-rgb),0.3)';
        });
      };

      const resetBtn = attachYearReset(yearPickerEl, () => {
        const before = snapshotVisibleYears(listEl);
        selectedYears.clear();
        updateBtns();
        updateList();
        clipWipeChangedBlocks(listEl, before);
      });

      allYears.forEach(year => {
        if (!dataYears.has(String(year))) return;
        const btn = document.createElement('button');
        btn.textContent  = String(year);
        btn.dataset.year = String(year);
        btn.style.cssText = 'text-align:left;background:none;border:none;padding:0;font-family:inherit;font-size:var(--font-size-xs);cursor:pointer;font-weight:700;color:var(--lib-fg);';
        btn.addEventListener('click', () => {
          const before = snapshotVisibleYears(listEl); // 操作前可見年份順序
          const adding = !selectedYears.has(String(year));
          if (selectedYears.has(String(year))) { selectedYears.delete(String(year)); } else { selectedYears.add(String(year)); }
          updateBtns();
          updateList();
          clipWipeChangedBlocks(listEl, before); // 只 wipe 新出現/位置變的年份組
          // 歸零＝全部顯示＝Reset 語義 → 回頂；加選＝跳到該年份組；取消後仍有選取＝維持原位（同 createYearPicker）
          if (selectedYears.size === 0) yearPickerEl.closest('[id^="lib-panel-"]')?.querySelector('[id$="-scroll"]')?.scrollTo(0, 0);
          else if (adding) scrollToYearBlock(yearPickerEl, String(year));
        });
        yearPickerEl.appendChild(btn);
      });
    }

    // Search：與年份共用 applyAwardsFilters（border 不動的原則與防禦 cleanup 已併入該函式）
    if (searchInput) searchInput.addEventListener('input', applyAwardsFilters);

    // Sort
    const sortBtn = document.getElementById('library-awards-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-xs`;
        renderItems(getSorted());
        applyAwardsFilters();  // 重渲染的新 DOM 全可見 → 補套當前年份/search（對齊 press/files/album sort 慣例）
        clipWipeItems(visibleListItems(listEl));
      });
    }

    // Awards Ticker
    const tickerWrapper = document.querySelector('#library-awards-ticker .awards-ticker-wrapper');
    if (tickerWrapper && awardsImages.length > 0) {
      // 每次載入隨機洗牌（user 2026-06-09：ticker logo 順序隨機，不照後台 sort）。
      // 在建 track 前 shuffle 一次 → t1/t2 兩條 seamless loop 半段同序、接合處不斷層。
      // 複製再洗：awardsImages 現在是 module 快取共享 array，in-place 洗會跨換頁累積 mutate 快取。
      const shuffled = [...awardsImages];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const createTrack = () => {
        const track = document.createElement('div');
        track.style.cssText = 'display:flex;gap:var(--spacing-2xl);padding-right:var(--spacing-2xl);flex-shrink:0;align-items:center;';
        shuffled.forEach(src => {
          const img = document.createElement('img');
          img.src = src; img.alt = 'Award';
          img.style.cssText = 'height:60px;width:auto;object-fit:contain;filter:grayscale(1);flex-shrink:0;';
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

      // ticker 預設可見（跟其他內容一起 clip-reveal，桌面/手機一致，user 2026-06-10：不要 opacity 淡入，
      // 渲染卡片就看到 logo、tween 一就緒就跑）。進場完成後啟動 marquee，但要等 ticker 圖片載入完才量寬度：
      // 桌面靠進場動畫 ~1.5s 緩衝、圖多半已載；手機 timing 早很多（onEntranceDone fix 後 cb 在 render 後立刻跑），
      // 圖未載時 offsetWidth=0 → 量錯/ticker 不動。改成等所有 ticker img load/error 後才量 t1 寬 + 跑 tween（兩 viewport 都穩）。
      let tickerStarted = false;
      const startTicker = () => {
        if (tickerStarted) return;
        const trackW = t1.offsetWidth;
        // 從非 awards panel 進 library 時 awards 仍 display:none → 寬 0 → bail；
        // 切到 awards 顯示後由 window._awardsTickerStart 重試（armTicker 重量）。
        if (!trackW) return;
        tickerStarted = true;
        if (typeof gsap !== 'undefined') {
          gsap.to([t1, t2], { x: `-=${trackW}`, ease: 'none', duration: trackW / 80, repeat: -1 });
          // ticker 單純等速跑、無 hover 互動（user 2026-06-09 移除：hover 減速 + hover 圖片 dim 兩效果）
        } else {
          // Fallback: 環境沒讀到 GSAP 用 CSS 動畫
          const style = document.createElement('style');
          style.textContent = `@keyframes awards-ticker { from { transform: translateX(0); } to { transform: translateX(-${trackW}px); } }`;
          document.head.appendChild(style);
          tickerWrapper.style.animation = `awards-ticker ${Math.round(trackW / 80)}s linear infinite`;
        }
      };
      const armTicker = () => {
        // 手機：logo 已用 CSS aspect-ratio 預留寬度 → layout 一好（1 rAF）就量得到 trackW，不必等圖載入
        //   → ticker「一渲染就開始捲」（圖載好填進預留位）；不會「靜止 logo 卡一下才動」（user 2026-06-10）。
        // 桌面：logo width:auto 沒預留、trackW 要 naturalWidth → 維持等所有圖 load/error 才量（進場 ~1.5s 已遮掉）。
        if (window.innerWidth < 768) { requestAnimationFrame(startTicker); return; }
        const imgs = Array.from(tickerWrapper.querySelectorAll('img'));
        let pending = imgs.length;
        const ready = () => { if (--pending <= 0) requestAnimationFrame(startTicker); };
        if (!pending) { requestAnimationFrame(startTicker); return; }
        imgs.forEach(im => {
          if (im.complete) ready();
          else { im.addEventListener('load', ready, { once: true }); im.addEventListener('error', ready, { once: true }); }
        });
      };
      onEntranceDoneCallback(armTicker);
      // 從非 awards panel 進 library：進場時 awards 隱藏、startTicker 量寬=0 bail → ticker 不動。
      // showLibPanel('awards') 顯示後呼叫此 hook 重試；tickerStarted 旗標保證只啟動一次（直接進 awards 時 no-op）。
      window._awardsTickerStart = () => { if (!tickerStarted) armTicker(); };
    } else if (tickerWrapper) {
      document.getElementById('library-awards-ticker').style.display = 'none';
    }

  } catch (e) {
    console.error('Library awards load error:', e);
  }
}

// ── Press Panel ───────────────────────────────────────────────────────────────

// 媒體名 + 國家顯示：AAA（XX）。ZH 全形括號＋中文國名、EN 半形括號帶前導 &ensp;（一般 ASCII 空格在粗體小字級
// 太窄看起來像沒空格，改用 en space 加大間距，同 press-item-subtitle-wrap 舊版 EN+ZH 合併行的 &ensp; 慣例）＋
// 大寫 ISO2 碼（EN 顯示碼不顯示英文全名，對齊 guest country 慣例，見 reference_guest_country_field_iso_display
// 記憶）；country 是 ISO2 code，查不到中文名就不加括號。
function formatMediaWithCountry(media, countryCode, zh) {
  if (!media) return '';
  if (!countryCode) return media;
  const name = zh ? countryName(countryCode, 'zh') : String(countryCode).toUpperCase();
  if (!name) return media;
  return zh ? `${media}（${name}）` : `${media}&ensp;(${name})`;
}

// Directus library_press row → 前台 press item shape（對應 field-key 差異 + 組 asset URL）。
// 後台 field key 跟前台讀的不同：mediaEn/Zh=副標、country=報導單位國家(ISO2)、pdf(uuid)=單 PDF（原生上傳）、
// videoLinks(json)=影片自架 link、year(整數，同 documents)、id(uuid)→加 press- 前綴（deep-link hash 用）。
// ⚠️ press 只吃 PDF + 影片（user 2026-08-20 拿掉 images M2M 與 pdfLink 兩欄，後台亦已刪）。
// press 年內排序鍵：monthDay（Directus 新欄 "MM-DD"）優先，退 fallback press.json 的 date（"YYYY.MM"，只有月）。
// 缺值→0（latest-first 時排該年最後）。回 月*100+日 的整數，好比大小。
function pressMonthDayKey(item) {
  const raw = String(item.monthDay || '').trim();
  let m = raw.match(/(\d{1,2})\D+(\d{1,2})/);                    // "06-15" "6/15" "6.15"
  if (!m && /^\d{3,4}$/.test(raw)) m = [raw, raw.slice(0, -2), raw.slice(-2)]; // "0615" "615"
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  const d = String(item.date || '').match(/[.\-/](\d{1,2})/);   // fallback 只有月
  return d ? Number(d[1]) * 100 : 0;
}

function mapDirectusPressRow(row) {
  // videoLinks 是 Directus repeater → [{url}]，攤成純字串（videoMediaFromUrl 只吃 string；同 album/activities 慣例）
  const videoUrls = Array.isArray(row.videoLinks) ? row.videoLinks.map(v => (v && typeof v === 'object') ? v.url : v).filter(Boolean) : [];
  return {
    id: row.id != null ? `press-${row.id}` : undefined,           // deep-link hash 需 press- 前綴
    titleEn: row.titleEn || '', titleZh: row.titleZh || '',
    // mediaEn/Zh = 刊登媒體名 = 副標，country 有值時附加（國家）
    subtitleEn: formatMediaWithCountry(row.mediaEn || '', row.country, false),
    subtitleZh: formatMediaWithCountry(row.mediaZh || '', row.country, true),
    year: row.year != null ? String(row.year) : '',               // press 列表用 year 分組（同 documents 整數欄）
    monthDay: row.monthDay || '',                                 // 月日（MM-DD）：同年份內排序用，見 pressMonthDayKey
    videoUrls,     // 自架影片 link 陣列
    pdfUrl: pdfOpenUrl(null, row.pdf),                            // 上傳的單一 PDF（press 無 pdfLink 欄）→ CloudFront 繞過弱機 /assets（見 pdf-url.js）
    cover: cdnImage(row.cover?.filename_disk),                     // 預產封面(generate-library-covers.cjs 裁頂)：有就秒出、免現畫 pdf；圖走 CloudFront 繞過弱機 /assets
  };
}

async function initPressPanel() {
  try {
    // Directus 為主、空/失敗 fallback 本地 press.json（同 legal pattern；press 接 Directus 2026-06-08）
    let pressData;
    try {
      const url = `${CMS_API_BASE}/library_press?fields=*,cover.filename_disk,pdf.filename_disk&sort=sort&limit=-1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CMS ' + res.status);
      const rows = (await res.json())?.data;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
      pressData = rows.map(mapDirectusPressRow);
    } catch (cmsErr) {
      console.warn('[press] Directus 抓取失敗/無資料，fallback 本地 press.json：', cmsErr.message);
      pressData = await fetch(sitePath('data/press.json')).then(r => r.json());
    }

    const listEl      = document.getElementById('library-press-list');
    const yearPickerEl = document.getElementById('library-press-year-picker');
    const searchInput = document.getElementById('library-press-search');
    if (!listEl) return;

    let latestFirst = true;
    // 依「年月日」完整時序排（2026-08-23 起，取代原本年內 A-Z）：sort 箭頭翻整個時序方向
    // （latest-first：年降序、年內月日也降序＝最新在上；反向則全鏡像）；同月日再退英文標題 A-Z 當穩定 tiebreak。
    const byYearThenDate = yearDir => (a, b) =>
      yearDir * (Number(b.year) - Number(a.year)) ||
      yearDir * (pressMonthDayKey(b) - pressMonthDayKey(a)) ||
      String(a.titleEn || '').localeCompare(String(b.titleEn || ''), 'en', { sensitivity: 'base' });
    const sorted = [...pressData].sort(byYearThenDate(1));
    const getSorted = () => [...pressData].sort(byYearThenDate(latestFirst ? 1 : -1));

    // 縮圖懶載 observer：PDF 首頁封面 render / 自架影片抓幀，捲近視窗才做
    // （renderPdfCover / grabHlsFrame 皆自帶跨 session 快取＋併發閘門，同 files panel 封面那套；純前端零後端）
    const attr = s => String(s || '').replace(/"/g, '&quot;');
    const thumbIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = /** @type {HTMLElement} */ (e.target);
        thumbIO.unobserve(el);
        const img = /** @type {HTMLImageElement | null} */ (el.querySelector('.press-thumb-img'));
        if (!img) return;
        // maxAspectRatio 1.5：長頁 PDF（網頁長文）只取頂部裁成正常比例，免糊成一團＋容器右側露灰
        if (el.dataset.pdfCover) renderPdfCover(el.dataset.pdfCover, 280, 1.5).then(d => { if (d) img.src = d; }).catch(() => {});
        else if (el.dataset.videoFrame) grabHlsFrame(el.dataset.videoFrame).then(d => { if (d) img.src = d; }).catch(() => {});
      });
    }, { rootMargin: '300px' });
    registerPageCleanup(() => thumbIO.disconnect());

    function renderItems(items) {
      listEl.innerHTML = '';
      let rowIdx = 0; // 跨 year-block 連續編號，斑馬交替（同 award/activities）
      groupByYear(items).forEach(group => {
        const block = document.createElement('div');
        block.className  = 'press-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className = 'press-year-label';
        const labelText = document.createElement('span');
        labelText.className = 'year-label-text';
        labelText.textContent = group.year;
        label.appendChild(labelText);
        block.appendChild(label);

        group.items.forEach(item => {
          const div = document.createElement('div');
          div.className       = 'press-item' + (rowIdx++ % 2 === 0 ? ' list-item-zebra' : '');
          if (item.id) div.id = item.id; // 供 hash deep link 使用
          div.dataset.year    = String(item.year);
          div.dataset.search  = [item.titleEn, item.titleZh, item.subtitleEn, item.subtitleZh].filter(Boolean).join(' ').toLowerCase();
          // press 只吃 PDF + 影片（images 已移除 2026-08-20）；影片支援 Directus videoUrls[] 與本地 fallback videoUrl 單值
          const vidList = (item.videoUrls && item.videoUrls.length) ? item.videoUrls : (item.videoUrl ? [item.videoUrl] : []);
          // 副標 EN/ZH 拆成兩個獨立 span：桌面 CSS inline 視覺一行（中間 &ensp; 由 ::after 補），手機 block 拆兩行
          const subtitleEnHtml = item.subtitleEn ? `<span class="press-item-subtitle press-item-subtitle-en"><span class="press-subtitle-inner">${item.subtitleEn}</span></span>` : '';
          const subtitleZhHtml = item.subtitleZh ? `<span class="press-item-subtitle press-item-subtitle-zh"><span class="press-subtitle-inner">${item.subtitleZh}</span></span>` : '';
          const hasSubtitle = !!(item.subtitleEn || item.subtitleZh);
          const metaHtml = hasSubtitle ? `
            <div class="press-item-meta">
              <span class="press-item-subtitle-wrap">${subtitleEnHtml}${subtitleZhHtml}</span>
            </div>` : '';
          // 縮圖（album 風格，取代舊 media icon；user 2026-08-20）：縮圖來源＝影片抓幀 / PDF 首頁封面。
          // 圖片 slot 已移除（user 2026-08-20：press 列表只出 PDF cover 或影片縮圖，不再吃 images）。
          // PDF/自架影片走 async render，捲近視窗才由 thumbIO 補 src；純圖片 press → 無縮圖。
          let thumbHtml = '';
          let readySrc = '', pdfCover = '', videoFrame = '', isVid = false;
          if (vidList.length) {
            const vm = videoMediaFromUrl(vidList[0], '');
            if (vm) {
              isVid = true;
              if (vm.thumb) readySrc = vm.thumb;                    // YouTube 現成縮圖
              else if (vm.videoKind !== 'yt') videoFrame = vm.src;  // 自架 HLS/mp4 → grabHlsFrame 懶抓幀
            }
          } else if (item.cover) {
            readySrc = item.cover;                                  // 預產封面：秒出、免 pdf.js 現畫
          } else if (item.pdfUrl) {
            pdfCover = item.pdfUrl;                                 // 無預產 → PDF 首頁 render 懶載（fallback）
          }
          if (readySrc || pdfCover || videoFrame) {
            const sign = Math.random() < 0.4 ? -1 : 1;
            const deg  = (sign > 0 ? (Math.random() * 5.5 + 0.5) : -(Math.random() * 3.5 + 0.5)).toFixed(2);
            const accent = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            const lazyAttr = pdfCover ? ` data-pdf-cover="${attr(pdfCover)}"`
                           : videoFrame ? ` data-video-frame="${attr(videoFrame)}"` : '';
            thumbHtml = `
              <div class="press-item-thumb-wrap">
                <div class="press-item-thumb" data-init-deg="${deg}" style="transform: rotate(${deg}deg);"${lazyAttr}>
                  <img class="press-thumb-img"${readySrc ? ` src="${attr(readySrc)}" loading="lazy"` : ''} alt="">
                  <div class="album-thumb-overlay" style="background: ${accent};"></div>
                  ${isVid ? '<div class="album-thumb-play"></div>' : ''}
                </div>
              </div>`;
          }
          // 單語言 title：只渲有值的那行（空 <p> 會多一條空行）＋ list 高度靠縮圖撐、title 區塊置中（同 album）
          const titleEnHtml = item.titleEn ? `<p class="press-item-title-en"><span class="press-marquee-inner">${item.titleEn}</span></p>` : '';
          const titleZhHtml = item.titleZh ? `<p class="press-item-title-zh"><span class="press-marquee-inner">${item.titleZh}</span></p>` : '';
          const oneLang = !!(item.titleEn) !== !!(item.titleZh);
          div.innerHTML = `
            <div class="press-item-row">
              <div class="press-item-titles" role="heading" aria-level="3">
                <div class="press-item-titles-text${oneLang ? ' press-item-titles-text--center' : ''}">${titleEnHtml}${titleZhHtml}</div>
                ${metaHtml}
              </div>
              ${thumbHtml}
            </div>`;
          // 後台放圖/影片 → 開 media viewer(lightbox)；只放 PDF → 開 PDF viewer（圖/影片同時有時優先 lightbox）
          if (vidList.length) {
            div.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
            const media = [];
            vidList.forEach(url => {
              const m = videoMediaFromUrl(url, '');
              if (m) media.push(m);
            });
            if (media.length) {
              const lbTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
              const lbColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
              div.addEventListener('click', async () => {
                // 手填 refs 解析（含 award 反向 ref → href chip）
                const references = await resolveLibManualRefs(item);
                // shareUrl：press media lightbox 也要 share btn（user 2026-07-03；原本只有 press PDF / album 有帶）
                document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media, index: 0, title: lbTitle, color: lbColor, references, shareUrl: libShareUrl(item.id) } }));
              });
              makeActivatable(div, [item.titleEn, item.titleZh].filter(Boolean).join(' ')); // 無障礙：報導項可 Tab + Enter 開
            }
          } else if (item.pdfUrl) {
            div.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
            const pdfTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
            const pdfColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            // library 場景：references 反查所有 activity 中 ref 此 PDF 的來源（不 exclude，full list）
            // 手填 references（含 award 反向 ref）union 進去（自動反查 + 手填可並存）
            div.addEventListener('click', async () => {
              const { getPdfRefSources } = await import('./pdf-cross-ref-index.js');
              const auto = await getPdfRefSources(item.pdfUrl);
              const references = unionRefs(auto, await resolveLibManualRefs(item));
              // press 無浮水印 → 給更高 canvas 上限，高倍放大更清晰（16384＝Chrome 單邊實用上限）
              // cover＝預產封面(有則秒出當墊圖)；coverAspect 1.5＝無預產時 peek 縮圖裁頂封面當馬賽克墊圖
              document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl: item.pdfUrl, title: pdfTitle, color: pdfColor, references, shareUrl: libShareUrl(item.id), cover: item.cover || '', maxCanvasDim: 16384, coverAspect: 1.5, autoRead: true } }));
            });
            makeActivatable(div, [item.titleEn, item.titleZh].filter(Boolean).join(' ')); // 無障礙：報導(PDF)項可 Tab + Enter 開
          }
          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindListItemHover(listEl, '.press-item', '.album-thumb-overlay');
      // PDF 封面 / 自架影片抓幀縮圖懶載（捲近視窗才 render，sort 重渲的新 DOM 每次重新 observe）
      listEl.querySelectorAll('.press-item-thumb[data-pdf-cover], .press-item-thumb[data-video-frame]').forEach(el => thumbIO.observe(el));

      // marquee 溢出偵測（panel 顯示後才執行）
      // 不 self-null：tab 切回 / window resize 變寬度後需重算；applyMarqueeOverflow 內含 dual-copy → single
      // reset 邏輯所以重跑安全
      window._pressMarqueeInit = () => {
        runMarqueeOverflow(listEl,
          '.press-item-title-en, .press-item-title-zh, .press-item-subtitle',
          '.press-marquee-inner, .press-subtitle-inner', '.press-item');
      };
      // sort 重渲染的新 DOM 沒 marquee（user 2026-07-03 手機報）→ 每次 render 尾端重跑；
      // panel 隱藏時量寬 0 = 無害 no-op，showLibPanel 顯示時會再觸發補量
      requestAnimationFrame(window._pressMarqueeInit);
    }

    renderItems(getSorted());

    const pressEmptyState = ensureEmptyState(listEl);

    function applyFiltersWithRef() {
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      listEl.querySelectorAll('.press-year-block').forEach(block => {
        const yearMatch = selectedYears.size === 0 || selectedYears.has(block.dataset.year);
        let anyVisible  = false;
        block.querySelectorAll('.press-item').forEach(item => {
          const searchMatch = !q || item.dataset.search.includes(q);
          const visible = yearMatch && searchMatch;
          item.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      restripeZebra(listEl, '.press-item'); // 篩後依可見順序重排斑馬
      // Empty state：任何篩選組合（search / 年份）歸零都顯示（user 2026-08-10：不限 search）
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.press-year-block')]).some(b => b.style.display !== 'none');
      pressEmptyState.classList.toggle('hidden', anyVisible);
    }

    // 年份 Picker
    const years = [...new Set(sorted.map(p => String(p.year)))].sort((a, b) => Number(b) - Number(a));
    const selectedYears = createYearPicker(yearPickerEl, years, () => { const before = snapshotVisibleYears(listEl); applyFiltersWithRef(); clipWipeChangedBlocks(listEl, before); });

    // 排序
    const sortBtn = document.getElementById('library-press-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-xs`;
        renderItems(getSorted());
        applyFiltersWithRef();
        clipWipeItems(visibleListItems(listEl));
      });
    }

    if (searchInput) searchInput.addEventListener('input', applyFiltersWithRef);

    applyFiltersWithRef();

  } catch (e) {
    console.error('Library press load error:', e);
  }
}

// ── Files Panel ───────────────────────────────────────────────────────────────

// Directus library_documents row → 前台 files item shape
function mapDirectusFilesRow(row) {
  const images = Array.isArray(row.images)
    ? row.images.map(j => j?.directus_files_id?.filename_disk).filter(Boolean)
        .map(cdnImage)   // CloudFront 圖片 URL（繞過弱機 /assets）；即時 filename_disk＝離線 webp 轉檔自動跟上
    : [];
  const videoUrls = Array.isArray(row.videoUrls) ? row.videoUrls.filter(Boolean) : [];
  const documentFile = row.pdf;
  return {
    id: row.id,
    titleEn: row.titleEn || '',
    titleZh: row.titleZh || '',
    subtitleEn: row.subtitleEn || '',
    subtitleZh: row.subtitleZh || '',
    year: row.year || '',
    // 走 CloudFront（cdnImage）繞過弱機 /assets 逾時；封面沿用即時 filename_disk 組 CloudFront URL，跟其餘卡片圖
    // + 首頁浮動書卡（floating-items files 分類）用**同一個 URL** → 點浮卡跳進來時瀏覽器快取已 warm、封面秒出（user 2026-08-19）。
    cover: cdnImage(row.cover?.filename_disk),
    // pdfLink（貼的 CloudFront／S3 網址）優先；沒填才用上傳檔走 CloudFront（filename_disk，繞過弱機 /assets 逾時）。
    // 與 award ref / degree-show / activities / cross-ref key 共用 pdfOpenUrl → 開檔 URL 與反查 key 逐字元一致。
    pdfUrl: pdfOpenUrl(row.pdfLink, row.pdf),
    documentMimeType: typeof documentFile === 'object' ? documentFile?.type || '' : '',
    docType: row.docType || '',   // 文件分類 dropdown（books/contributions/booklets/other），空＝未分類
    categories: row.categories || [],
    references: row.references || [],
    images,
    videoUrls,
  };
}

// 封面本體（<img> 或 --empty div）從隨機方向平移滑入遮罩，底下 mask 灰卡透出＝看得到「圖在動」的位移
// （灰卡均勻色，讓灰卡動看起來像 wipe→動的是有紋理的圖才有位移感，user 2026-08-24）。guarded：一張只滑一次。
// 沿用 revealFilesCards 進場的同一組 pickCoverSlideDir / DUR.medium（手感一致）。
function slideCoverIn(card) {
  if (card.dataset.coverSlid) return;
  card.dataset.coverSlid = '1';
  const cover = /** @type {HTMLElement|null} */ (card.querySelector('.files-item-cover'));
  if (!cover) return;
  cover.style.transition = 'none';
  cover.style.transform  = pickCoverSlideDir();  // 同步設起點：圖第一次上色就在畫外、不閃 rest
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cover.style.transition = `transform ${DUR.medium}s ease-out`;
    cover.style.transform  = 'translate(0%, 0%)';
    const done = (e) => {
      if (e.propertyName !== 'transform') return;
      cover.removeEventListener('transitionend', done);
      cover.style.transition = ''; cover.style.transform = '';
    };
    cover.addEventListener('transitionend', done);
  }));
}

// 卡片目前是否落在 files 捲動容器的可視範圍（判「圖載好的當下卡片看不看得到」，決定滑入或直接就位）。
function coverCardVisible(card) {
  const r = card.getBoundingClientRect();
  const scroller = document.getElementById('library-files-scroll');
  if (scroller) { const s = scroller.getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom; }
  return r.bottom > 0 && r.top < (window.innerHeight || 0);
}

// 進場 gate＝「圖 ready 才滑」：沒 placeholder（封面框載入中留白）、圖畫好後才 clip-reveal 進場（user 2026-08-24）。
// ⚠️故意在 ready 才滑＝不滑一個空白框（延續 2026-08-16「不滑透明框」精神，只是等待期由灰卡改留白）。
// 仍守可視 gate：ready 當下卡在畫外（預載）就直接就位不動畫（效能定案）。
function maybeSlideCover(card) {
  if (card.dataset.coverReady && coverCardVisible(card)) slideCoverIn(card);
}

// 把 PDF 第一頁 render 成封面貼到卡片的 .files-item-cover--empty（原地轉背景圖，不 replaceWith：hover 旋轉 handler 已抓住此節點）
function applyPdfCoverTo(card, pdfUrl) {
  return renderPdfCover(pdfUrl).then(dataUrl => {
    const ph = card.querySelector('.files-item-cover--empty');
    if (!dataUrl || !ph) return;
    const probe = new Image();
    probe.onload = () => {
      // 照 PDF 頁面實際比例撐 mask（ph 本體恆填滿 mask，比例統一由 mask 的 --cover-ratio 管）
      const mask = /** @type {HTMLElement|null} */ (ph.closest('.files-item-cover-mask'));
      if (mask) mask.style.setProperty('--cover-ratio', String(probe.naturalWidth / probe.naturalHeight));
      ph.style.backgroundImage = `url(${dataUrl})`;
      ph.style.backgroundSize = 'cover';
      card.dataset.coverReady = '1';
      maybeSlideCover(card);   // ready＋可見才滑入（畫外預載的直接就位）
    };
    probe.src = dataUrl;
  });
}

async function initFilesPanel() {
  try {
    let filesData;
    try {
      // cover / images / pdf 都深取 filename_disk → 組 CloudFront URL（繞過弱機 /assets）；pdf.type 供 isImageDocumentUrl 判別。
      // library_documents 目前無 images M2M 欄，深取缺 relational 欄 Directus 回 200 忽略（不炸、為日後補圖預留；
      // 會 403 整包失敗的是缺「scalar」欄，非 relational — 見 memory reference_directus_m2a_ref_title_deepfetch）。
      const url = `${CMS_API_BASE}/library_documents?fields=*,pdf.id,pdf.type,pdf.filename_disk,cover.filename_disk,images.directus_files_id.filename_disk&sort=-year,sort&limit=-1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CMS ' + res.status);
      const rows = (await res.json())?.data;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('CMS empty');
      filesData = rows.map(mapDirectusFilesRow);
    } catch (cmsErr) {
      console.warn('[files] Directus 抓取失敗/無資料，fallback 本地 library.json：', cmsErr.message);
      filesData = await fetch(sitePath('data/library.json')).then(r => r.json());
    }

    const listEl       = document.getElementById('library-files-list');
    const yearPickerEl = document.getElementById('library-files-year-picker');
    const searchInput  = document.getElementById('library-files-search');
    if (!listEl) return;

    // 分類 tag 顯示文字：優先後台 ui_labels（可改），斷線退 DOCTYPE_FALLBACK。cached、快。
    const uiMap = await loadUiLabels().catch(() => ({}));
    const doctypeLabel = (dt) => {
      const row = uiMap[`lib.doctype.${dt}`] || {};
      const [fe, fz] = DOCTYPE_FALLBACK[dt] || ['', ''];
      return [row.en || fe, row.zh || fz].filter(Boolean).join(' ');
    };

    let latestFirst = true;
    // 年份 → 英文標題 A-Z（同 press，user 2026-08-08 指定；箭頭只翻年份方向、年內恆 A-Z）
    const byYearThenTitle = yearDir => (a, b) =>
      yearDir * (Number(b.year) - Number(a.year)) ||
      String(a.titleEn || '').localeCompare(String(b.titleEn || ''), 'en', { sensitivity: 'base' });
    const sorted = [...filesData].sort(byYearThenTitle(1));
    const getSorted = () => [...filesData].sort(byYearThenTitle(latestFirst ? 1 : -1));

    let coverPromises = [];   // 首批 eager render 的 PDF 封面工作（首載 reveal gate 用）
    let _coverIO = null;      // 其餘封面的懶載 observer（re-render / 離頁要 disconnect）

    // PDF 封面懶載（user 2026-08-11）：一頁幾十本掃描檔全開場 render＝點開 Files 卡頓。
    // 首 EAGER_COVERS 張直接 render（餵 reveal gate、pre-warm 首屏），其餘捲到近視窗（IO rootMargin）才 render。
    // renderPdfCover 本身有併發閘門 3 + sessionStorage 快取；懶載再砍掉「沒看到的也 render」那段。
    const EAGER_COVERS = 10;
    // needCover＝pdf.js fallback 現畫（沒 cover 的書）；lazyImgCards＝預產封面 <img> 視窗外延後補 src。
    // 同一個 IO 兼管兩種：card 上有 lazyPdfCover → 現畫；card 內有 img[data-lazy-src] → 補 src。
    function scheduleCovers(needCover, lazyImgCards = []) {
      if (_coverIO) { _coverIO.disconnect(); _coverIO = null; }
      needCover.slice(0, EAGER_COVERS).forEach(c => coverPromises.push(applyPdfCoverTo(c.card, c.pdfUrl)));
      const lazy = needCover.slice(EAGER_COVERS);
      const loadLazyImg = (card) => {
        const img = card.querySelector('img[data-lazy-src]');
        if (img) { img.src = img.dataset.lazySrc; delete img.dataset.lazySrc; }
      };
      if (!lazy.length && !lazyImgCards.length) return;
      const scroller = document.getElementById('library-files-scroll');
      if (!('IntersectionObserver' in window) || !scroller) {   // 無 IO 保底：全部直接載
        lazy.forEach(c => applyPdfCoverTo(c.card, c.pdfUrl));
        lazyImgCards.forEach(loadLazyImg);
        return;
      }
      _coverIO = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          obs.unobserve(e.target);
          const url = e.target.dataset.lazyPdfCover;
          if (url) applyPdfCoverTo(e.target, url);
          loadLazyImg(e.target);
        });
      }, { root: scroller, rootMargin: '400px 0px' });   // 提前 400px render，捲到時已就緒
      lazy.forEach(c => { c.card.dataset.lazyPdfCover = c.pdfUrl; _coverIO.observe(c.card); });
      lazyImgCards.forEach(card => _coverIO.observe(card));
      registerPageCleanup(() => { if (_coverIO) { _coverIO.disconnect(); _coverIO = null; } });
    }

    function renderItems(data) {
      coverPromises = [];
      const needCover = [];   // 待 render 封面的卡片：{ card, pdfUrl }；首批 eager、其餘懶載
      let eagerImgs = 0;      // 預產封面 <img>：首批直接 src、其餘視窗外延後（user 2026-08-18「只先載視窗內」）
      const lazyImgCards = [];
      // deep-link（#f-<id>）目標卡：即使排在 EAGER_COVERS 之後也 eager 載封面，點首頁浮動書卡跳進來時
      // 封面立刻出（不必等捲到才 IO 補 src）；cover 走 bare /assets URL＝跟浮卡同 URL 共用快取＝秒出。
      const deepLinkTargetId = (window.location.hash || '').slice(1).startsWith('f-') ? window.location.hash.slice(1) : '__none__';
      listEl.innerHTML = '';
      groupByYear(data).forEach(group => {
        const block = document.createElement('div');
        block.className    = 'files-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className   = 'press-year-label';
        const labelText = document.createElement('span');
        labelText.className = 'year-label-text';  // 原 files-year-label-text，08-10 四 panel 統一 text-only dim class
        labelText.textContent = group.year;
        label.appendChild(labelText);
        block.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'files-grid';

        group.items.forEach(item => {
          const div  = document.createElement('div');
          div.className  = 'files-item files-item-card';
          if (item.id) div.id = `f-${item.id}`;
          div.dataset.year   = String(item.year);
          div.dataset.cat    = item.docType || '';   // 分類篩選用（空＝未分類，任何 chip 都不選中）
          div.dataset.search = [item.titleEn, item.titleZh, item.subtitleEn, item.subtitleZh].filter(Boolean).join(' ').toLowerCase();

          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
          // 旋轉：sign 隨機 × magnitude 1~3，範圍 [-3,-1] ∪ [1,3]，排除 0 和近 0 避免卡片看起來都一樣
          const finalDeg = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2);
          // 2026-08-16 封面進場改 clip-reveal（同 faculty 卡）：rotation + 尺寸約束搬到 .files-item-cover-mask
          // （overflow:clip 遮罩），封面本體填滿 mask、進場在內滑動；mask 比例由 --cover-ratio 依圖實際比例設
          // （replicate 原 <img> max-w/h auto 的 contain 行為），clip 在旋轉後 local box 生效＝不切旋轉角。
          // 圖片型 document 沒有另外指定 cover 時，直接以檔案本身作為封面。
          const coverUrl = item.cover || (isImageDocumentUrl(item.pdfUrl, item.documentMimeType) ? item.pdfUrl : '');
          // ⚠️ 不能 loading="lazy"（原生判定圖被 clip 在視窗外＝永不載入，2026-08-18 實測）：
          // 懶載自己來——首批 EAGER_COVERS 張直接 src，其餘不設 src、IO 靠近視窗才補（見 scheduleCovers）
          // deep-link 目標卡先判（短路 → 不佔 eager 名額）；否則照首批 EAGER_COVERS
          const eagerImg = coverUrl && (div.id.startsWith(deepLinkTargetId) || eagerImgs++ < EAGER_COVERS);
          const coverContent = coverUrl
            ? `<img class="files-item-cover"${eagerImg ? ` src="${coverUrl}"` : ''} alt="">`
            : `<div class="files-item-cover files-item-cover--empty"></div>`;
          const coverHtml = `
            <div class="files-card-cover-wrap">
              <div class="files-item-cover-inner">
                <div class="files-item-cover-mask" data-init-deg="${finalDeg}" style="transform: rotate(${finalDeg}deg);">
                  ${coverContent}
                </div>
                <div class="files-thumb-overlay" style="background: ${accentColor};"></div>
              </div>
            </div>`;
          const titleEnHtml = item.titleEn ? `<p class="files-item-title-en"><span class="files-marquee-inner">${item.titleEn}</span></p>` : '';
          const titleZhHtml = item.titleZh ? `<p class="files-item-title-zh"><span class="files-marquee-inner">${item.titleZh}</span></p>` : '';
          const subEnHtml = item.subtitleEn ? `<p class="files-item-subtitle-en"><span class="files-marquee-inner">${item.subtitleEn}</span></p>` : '';
          const subZhHtml = item.subtitleZh ? `<p class="files-item-subtitle-zh"><span class="files-marquee-inner">${item.subtitleZh}</span></p>` : '';
          const subtitleHtml = (item.subtitleEn || item.subtitleZh) ? `<div class="files-item-subtitle-lines">${subEnHtml}${subZhHtml}</div>` : '';
          // 分類 tag（有 docType 才渲染，貼在副標下方；文字來自 ui_labels 可後台改，過長桌面 hover 跑 marquee）
          const catTag = item.docType && DOCTYPE_FALLBACK[item.docType]
            ? `<div class="files-item-subtitle-wrap"><span class="files-item-subtitle-tag"><span class="files-marquee-inner">${doctypeLabel(item.docType)}</span></span></div>`
            : '';
          div.innerHTML = `
            ${coverHtml}
            <div class="files-item-titles files-card-info">
              <div class="files-item-titles-text" role="heading" aria-level="3">${titleEnHtml}${titleZhHtml}</div>
              ${subtitleHtml}
              ${catTag}
            </div>`;

          // <img> 封面載入後把實際比例寫進 mask 的 --cover-ratio（載入前/placeholder 用預設 4/5）
          const coverImg = /** @type {HTMLImageElement|null} */ (div.querySelector('img.files-item-cover'));
          if (coverImg) {
            const maskEl = coverImg.parentElement;
            const onReady = () => {
              if (coverImg.naturalWidth && coverImg.naturalHeight && maskEl) {
                maskEl.style.setProperty('--cover-ratio', String(coverImg.naturalWidth / coverImg.naturalHeight));
              }
              div.dataset.coverReady = '1';
              maybeSlideCover(div);   // ready＋可見才 clip-reveal 進場（畫外預載直接就位）
            };
            // 沒 src 的 img「complete=true 但 naturalWidth=0」→ 懶載的也要掛 load listener 等日後補 src
            if (coverImg.complete && coverImg.naturalWidth) onReady();
            else coverImg.addEventListener('load', onReady, { once: true });
            if (!eagerImg) { coverImg.dataset.lazySrc = coverUrl; lazyImgCards.push(div); }
          }

          // 後台沒設 cover 時抓 PDF 第一頁當封面（cover 欄位＝選填覆蓋；同首頁 floating press 卡）。
          // 收集起來交給 scheduleCovers 懶載（首批 eager、其餘捲近視窗才 render，見上）。
          if (!coverUrl && item.pdfUrl) {
            needCover.push({ card: div, pdfUrl: item.pdfUrl });
          }

          // 同 Press panel：後台放圖/影片 → media lightbox；只放 PDF → PDF viewer（圖/影片優先）。
          // document 一律帶 watermark:true（PDF 與 media 都要浮水印）。
          const imgList = (item.images && item.images.length) ? item.images : (item.image ? [item.image] : []);
          const vidList = (item.videoUrls && item.videoUrls.length) ? item.videoUrls : (item.videoUrl ? [item.videoUrl] : []);
          if (imgList.length || vidList.length) {
            div.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
            const media = [];
            imgList.forEach(src => media.push({ type: 'image', src, thumb: src }));
            vidList.forEach(url => {
              const m = videoMediaFromUrl(url, imgList[0] || '');
              if (m) media.push(m);
            });
            if (media.length) {
              const lbTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
              div.addEventListener('click', async () => {
                const references = await resolveLibManualRefs(item);
                document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media, index: 0, title: lbTitle, color: accentColor, references, shareUrl: libShareUrl(item.id && `f-${item.id}`), watermark: true } }));
              });
              makeActivatable(div, [item.titleEn, item.titleZh].filter(Boolean).join(' ')); // 無障礙：文件項可 Tab + Enter 開
            }
          } else if (item.pdfUrl) {
            div.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
            const title = { en: item.titleEn || '', zh: item.titleZh || '' };
            div.addEventListener('click', async () => {
              const auto = isImageDocumentUrl(item.pdfUrl, item.documentMimeType)
                ? []
                : await (await import('./pdf-cross-ref-index.js')).getPdfRefSources(item.pdfUrl);
              const references = unionRefs(auto, await resolveLibManualRefs(item));
              openLibraryDocument({
                url: item.pdfUrl, item, title, color: accentColor, references,
                shareUrl: libShareUrl(item.id && `f-${item.id}`),
              });
            });
            makeActivatable(div, [item.titleEn, item.titleZh].filter(Boolean).join(' ')); // 無障礙：文件項可 Tab + Enter 開
          }

          grid.appendChild(div);
        });

        block.appendChild(grid);
        listEl.appendChild(block);
      });

      // 封面：首批 eager render、其餘捲到近視窗才懶載（卡片已在 DOM，可掛 IO）
      scheduleCovers(needCover, lazyImgCards);

      if (window.innerWidth >= 768) {
        listEl.querySelectorAll('.files-item-card').forEach(item => {
          // hover 轉回 0°：目標改 mask（旋轉載體 2026-08-16 搬到 mask；封面本體的 transform 留給進場滑動）
          const mask = /** @type {HTMLElement|null} */ (item.querySelector('.files-item-cover-mask'));
          if (!mask) return;
          item.addEventListener('mouseenter', () => {
            gsap.to(mask, { rotation: 0, duration: DUR.fast, ease: EASE.enterSoft });
          });
          item.addEventListener('mouseleave', () => {
            const deg = parseFloat(mask.dataset.initDeg) || 0;
            gsap.to(mask, { rotation: deg, duration: DUR.fast, ease: EASE.enterSoft });
          });
        });
      }

      bindListItemHover(listEl, '.files-item', '.files-thumb-overlay');

      window._filesMarqueeInit = () => {
        runMarqueeOverflow(listEl, '.files-item-title-en, .files-item-title-zh, .files-item-subtitle-en, .files-item-subtitle-zh, .files-item-subtitle-tag', '.files-marquee-inner', '.files-item');
      };
      // 同 press：sort 重渲染後重跑 marquee（隱藏時 no-op、顯示時 showLibPanel 補量）
      requestAnimationFrame(window._filesMarqueeInit);
    }

    renderItems(getSorted());

    // 首載揭卡：預產封面 <img> 不等載入、直接揭（user 2026-08-18「點 documents 直接出內容」；
    // 快取時瞬顯、未快取灰底先滑入、圖到自動補）。只剩 pdf.js fallback 現畫的（沒 cover 的新書）
    // 保留原 gate：等首屏前 8 張或 1s（08-08「半成品畫面」決策現僅適用這條慢路徑）。
    if (coverPromises.length) {
      listEl.style.opacity = '0';
      Promise.race([
        Promise.allSettled(coverPromises.slice(0, 8)),
        new Promise(r => setTimeout(r, 1000)),
      ]).then(() => {
        listEl.style.opacity = '';
        clipWipeItems(visibleFilesCards(listEl));
      });
    } else {
      clipWipeItems(visibleFilesCards(listEl));
    }

    const filesEmptyState = ensureEmptyState(listEl);

    // 分類篩選（多選 toggle，全不選＝全部；同 album panel）
    const selectedCats = new Set();

    // 年份 picker「配合分類」（user 2026-08-26）：選了分類 → 只列出該分類 item 有的年份（切分類即重建、年份選取重置）。
    const onYearFilter = () => { const before = snapshotVisibleYears(listEl); applyFilters(); clipWipeChangedBlocks(listEl, before); };  // 重播近視窗卡片進場＝對齊 album（user 2026-08-27；7s reflow thrash 根因已修故不卡）
    const availYears = () => {
      const isAll = selectedCats.size === 0;
      const set = new Set();
      listEl.querySelectorAll('.files-item').forEach(it => { if (isAll || selectedCats.has(it.dataset.cat)) set.add(it.dataset.year); });
      return [...set].sort((a, b) => Number(b) - Number(a));
    };
    let selYears;
    function rebuildYearPicker() {
      yearPickerEl.querySelectorAll('button[data-year]').forEach(b => b.remove());  // 清舊年份鈕（reset 鈕由 createYearPicker 內部自清）
      selYears = createYearPicker(yearPickerEl, availYears(), onYearFilter);
    }
    rebuildYearPicker();

    function applyFilters() {
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const isAll = selectedCats.size === 0;
      const singleCat = selectedCats.size === 1;   // 單選＝卡片下方分類 tag 冗餘（全同類）
      listEl.querySelectorAll('.files-year-block').forEach(block => {
        const yearMatch = selYears.size === 0 || selYears.has(block.dataset.year);
        let anyVisible  = false;
        block.querySelectorAll('.files-item').forEach(item => {
          const catMatch    = isAll || selectedCats.has(item.dataset.cat);
          const searchMatch = !q || item.dataset.search.includes(q);
          const visible = catMatch && yearMatch && searchMatch;
          item.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
          // 只選一個分類時 tag 全同類＝多餘 → display:none（user 2026-08-26：不渲染、**不占位**＝消除標題下方
          // 隱形空白；卡片隨之收短、交還 .files-grid 依「該行最高」重新等高）。2 類以上才顯示供區分。
          item.dataset.hideCatTag = singleCat ? '1' : '';
          const tagWrap = item.querySelector('.files-item-subtitle-wrap');
          if (tagWrap) {
            tagWrap.style.display = singleCat ? 'none' : '';
            tagWrap.style.transform = '';  // 清舊 yPercent 殘留；純寫入不讀 layout（⚠️改回逐項 gsap.set clearProps 會 reflow thrash＝篩選卡 7 秒，user 2026-08-26）
            // tag 若已被 revealFilesCards 包進 clip-reveal-wrapper，wrapper 也一起顯隱（否則 tag 藏時 wrapper 空殼仍占一格 flex gap＝標題下方留白）
            const w = tagWrap.parentElement;
            if (w && w.classList.contains('clip-reveal-wrapper')) w.style.display = singleCat ? 'none' : '';
          }
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      // chip dim（有選時未選的變淡）＋ 依 search 結果把「當前搜尋下無任何結果」的分類文字再壓淡（同 album）
      const hasSel = selectedCats.size > 0;
      const catsWithMatch = q
        ? new Set([...listEl.querySelectorAll('.files-item')].filter(i => i.dataset.search.includes(q)).map(i => i.dataset.cat))
        : null;
      document.querySelectorAll('.lib-files-cat-btn').forEach(b => {
        b.classList.toggle('dimmed', hasSel && !selectedCats.has(b.dataset.cat));
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(var(--lib-fg-rgb),0.3)' : '';
      });
      // Empty state：任何篩選組合（search / 年份 / 分類）歸零都顯示（user 2026-08-10：不限 search）
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.files-year-block')]).some(b => b.style.display !== 'none');
      filesEmptyState.classList.toggle('hidden', anyVisible);
    }

    const filesCatBtns = [...document.querySelectorAll('.lib-files-cat-btn')];
    filesCatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (selectedCats.has(cat)) { selectedCats.delete(cat); } else { selectedCats.add(cat); }
        if (selectedCats.size === filesCatBtns.length) selectedCats.clear();  // 全選＝全部（回到無篩選）
        rebuildYearPicker();   // 年份 picker 重建成「當前分類的年份」（user 2026-08-26；年份選取重置）
        applyFilters();
        clipWipeItems(visibleFilesCards(listEl));  // 重播近視窗卡片進場（含副標 clip-reveal）＝對齊 album（user 2026-08-27）
      });
    });

    const sortBtn = document.getElementById('library-files-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-xs`;
        renderItems(getSorted());
        applyFilters();
        clipWipeItems(visibleFilesCards(listEl));
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
  // 全數接 Directus＝單一 source of truth（user 2026-08-17 拍板；2026-09-02 起 Directus-only——本地 JSON fallback
  // 全退場，loader 失敗改讀 sessionStorage last-known-good、都沒有則 throw → 下方 .catch(()=>null) 該類相簿缺席）。
  // ⚠️album 過濾無圖項目 → 後台某類「有 row 但 0 圖」時該類相簿為空；等後台補圖才會顯示。
  //    degree-show/moment 走專用攤平/合併 loader（見各 source 檔）。
  { load: () => loadActivityCollection('activities_workshops', '/data/workshops.json'), cat: 'workshop', isDegreeShow: false },
  { load: loadDegreeShowAlbum,            cat: 'degree-show',      isDegreeShow: false },
  { load: loadSummerCamp,                 cat: 'summer-camp',      isDegreeShow: false },
  { load: () => loadActivityCollection('activities_students_present', '/data/students-present.json'), cat: 'students-present', isDegreeShow: false },
  { load: loadGeneralActivitiesAlbum,     cat: 'moment',           isDegreeShow: false },
  { load: () => loadActivityCollection('activities_lectures', '/data/lectures.json'), cat: 'lectures', isDegreeShow: false },
  { load: () => loadActivityCollection('activities_industry', '/data/industry.json'), cat: 'industry', isDegreeShow: false },
  // others（library 自己上傳、不對應任何活動的相簿）＝Directus library_album，同步讓 award→album 的 M2A ref 有東西可渲染。
  { load: loadOthersAlbum,                cat: 'others',           isDegreeShow: false },
];

function getCover(item) {
  return item.cover || item.poster || item.coverImage || (item.images && item.images[0]) || '';
}

function normalizeDegreeShow(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).map(([y, entry]) => ({ year: parseInt(y, 10), items: [entry] }));
}

// library deep-link 分享網址（library.html#<domId>）：domId = 列表項目的 DOM id（press-* / f-* / album-*），
// 跟 hash deep-link / highlight 用的 element id 一致。跑在 library 頁 → location.pathname 即正確路徑（含子路徑部署前綴）。
// 給 lightbox（album）與 PDF viewer（press/files）內的 share btn 用。
function libShareUrl(domId) {
  // uuid 截前 8 碼（與首頁浮卡共用 shortLibId，細節＋落地相容見 library-deeplink.js）
  return domId ? `${location.origin}${location.pathname}#${shortLibId(domId)}` : undefined;
}

// 相簿 item 組裝（cover/影片/圖片 → media、references 原樣帶上）抽成快取 loader：
// Album panel render 與「award ref 指向 album（{type:'album'}）開 lightbox」共用同一份 item 索引。
let _albumItemsPromise = null;
function loadAlbumItemsCached() {
  if (_albumItemsPromise) return _albumItemsPromise;
  _albumItemsPromise = (async () => {
    const results = await Promise.all(
      ALBUM_SOURCES.map(s => s.load
        ? s.load().catch(() => null)
        : fetch(sitePath(s.url)).then(r => r.json()).catch(() => null))
    );
    const allItems = [];
    results.forEach((data, i) => {
      const { cat, isDegreeShow } = ALBUM_SOURCES[i];
      const groups = isDegreeShow ? normalizeDegreeShow(data) : (Array.isArray(data) ? data : []);
      groups.forEach(({ year, items }) => {
        if (!Array.isArray(items)) return;
        // camp 取消梯次無 startDate → 年份組 key '—'（非數字）：album 依年份排序/分組，略過
        if (!Number.isFinite(Number(year))) return;
        items.forEach(item => {
          const cover   = getCover(item);
          const titleEn = item.title_en || item.titleEn || item.title || '';
          // 兩種資料慣例並存：workshops 系 title=EN+title_zh=ZH；lectures/students-present 系 title=ZH+title_en=EN
          const titleZh = item.title_zh || item.titleZh || item.title_cn || ((item.title_en || item.titleEn) ? item.title : '') || '';
          const images  = (item.images || []).filter(s => s && s !== cover);
          let videos = [];
          if (item.videoUrl) videos = [item.videoUrl];
          else if (Array.isArray(item.videos)) videos = item.videos;
          // Directus 新 schema 影片欄 [{url}]（camp 等遷移後 collection）；與 legacy 合併
          if (Array.isArray(item.videoLinks)) {
            videos = [...videos, ...item.videoLinks.map(v => (v && typeof v === 'object') ? v.url : v).filter(Boolean)];
          }
          const media = [
            ...(cover ? [{ type: 'image', src: cover, thumb: cover }] : []),
            ...videos.map(url => videoMediaFromUrl(url, cover)).filter(Boolean),
            ...images.map(src => ({ type: 'image', src, thumb: src })),
          ];
          // 無任何媒體的項目不進相簿（camp 真實資料照片未上傳前整類自然缺席，上傳後自動出現）
          if (!media.length) return;
          // moment 來源混 visits/exhibitions/competitions/conferences 多子類，各自對應相簿 chip（data-cat）→
          // 用 item 自己的 category 當 cat（否則全壓成 'moment'，Forums/Visits/… chip 篩不到）；其餘來源 item 無 category 欄，維持來源 cat。
          const itemCat = cat === 'moment' ? (item.category || cat) : cat;
          allItems.push({ id: item.id, year, cat: itemCat, titleEn, titleZh, cover, media, references: item.references });
        });
      });
    });
    allItems.sort((a, b) => b.year - a.year);
    return allItems;
  })();
  return _albumItemsPromise;
}

async function initAlbumPanel() {
  try {
    const sorted = await loadAlbumItemsCached();
    // 分類 tag / ref chip 顯示文字改吃 ui_labels（可後台改，與篩選鈕同源）；填模組級 _catUiMap 供 catLabel* 用
    _catUiMap = await loadUiLabels().catch(() => null);

    const listEl       = document.getElementById('library-album-list');
    const yearPickerEl = document.getElementById('library-album-year-picker');
    const searchInput  = document.getElementById('library-album-search');
    if (!listEl) return;

    let latestFirst = true;
    const getSorted = () => latestFirst ? sorted : [...sorted].reverse();

    // 點開 lightbox 時 overlay 蓋上會觸發 item 的 mouseleave → 縮回 stack。
    // user 要求：展開狀態點進 lightbox 維持展開，等 lightbox 關閉才做 stack 動畫。
    // 記住該 item 的 stack 動作，延到 sccd:close-lightbox 才執行。
    // 宣告在 initAlbumPanel 層、close listener 只註冊一次（renderItems 會因 sort 重跑，避免重複綁）。
    let pendingStack = null;
    const onLbClose = () => { if (pendingStack) { pendingStack(); pendingStack = null; } };
    document.addEventListener('sccd:close-lightbox', onLbClose);
    registerPageCleanup(() => document.removeEventListener('sccd:close-lightbox', onLbClose));

    function renderItems(data) {
      listEl.innerHTML = '';
      let rowIdx = 0; // 跨 year-block 連續編號，斑馬交替（同 award/activities）
      groupByYear(data).forEach(group => {
        const block = document.createElement('div');
        block.className    = 'album-year-block';
        block.dataset.year = group.year;

        const label = document.createElement('div');
        label.className   = 'press-year-label';
        const labelText = document.createElement('span');
        labelText.className = 'year-label-text';
        labelText.textContent = group.year;
        label.appendChild(labelText);
        block.appendChild(label);

        group.items.forEach(item => {
          const div = document.createElement('div');
          div.className      = 'files-item album-panel-item' + (rowIdx++ % 2 === 0 ? ' list-item-zebra' : '');
          if (item.id) div.id = `album-${item.id}`; // 供 hash deep link 使用
          div.dataset.year   = String(item.year);
          div.dataset.cat    = item.cat;
          div.dataset.search = [item.titleEn, item.titleZh].filter(Boolean).join(' ').toLowerCase();

          // random accent color per item (for hover overlay)
          const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];

          const catTagHtml = `<span class="files-item-subtitle-tag">${catLabelCombined(item.cat)}</span>`;

          // thumbnails: 預設只顯示前 3 張（2026-06-01 user 改：「預設 thumbnail 最多 3 張不會全部呈現」）
          // 點進 lightbox 後仍可看完整 media list（lightbox 取 item.media 不受此 slice 影響）
          // 桌面 CSS 仍套舊 absolute stack 視覺，手機 CSS 改 flex-wrap 排成自然 row（library.css album 手機 rule）
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
            div.style.cursor = `url('${sitePath('custom-cursor/pointer.svg')}') 14 1, pointer`;
            const lbTitle = { en: item.titleEn || '', zh: item.titleZh || '' };
            const lbColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            const shareUrl = libShareUrl(item.id && `album-${item.id}`);
            // 直接從 Album panel 點 → 無 host，ref 顯示全部（含 award 反向 ref）；resolveLibManualRefs 解析 award→href chip
            // （原本傳 raw item.references → award 反向 ref 因無 section/itemId/href 被 lightbox-ref-btn 過濾掉、不顯示）
            // 再 union 一顆「回到來源活動」的 back-ref：workshop/lecture… 相簿圖片點開 lightbox 後可跳回該活動（user 2026-08-19）。
            div.addEventListener('click', async () => {
              const references = unionRefs([albumSourceRef(item)], await resolveLibManualRefs(item));
              document.dispatchEvent(new CustomEvent('sccd:open-lightbox', { detail: { media: item.media, index: 0, title: lbTitle, color: lbColor, references, shareUrl } }));
            });
            makeActivatable(div, [item.titleEn, item.titleZh].filter(Boolean).join(' ')); // 無障礙：相簿項可 Tab + Enter 開
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

            // 自架影片縮圖升級：media 組裝的 thumb fallback=cover → strip 上海報出現兩次
            // （user 2026-08-10）。抓真實影格替換（同 lightbox 縮圖列 grabHlsFrame，
            // in-memory+localStorage 快取共用，首抓後零成本）；回寫 m.thumb 讓 lightbox 直接用。
            const m = thumbMedia[Number(img.parentElement?.dataset.thumbIndex)];
            if (m && isSelfHostedVideo(m.videoKind)) {
              grabHlsFrame(m.src).then(u => {
                if (!u || !img.isConnected) return; // sort 重 render 後的舊 img 略過
                m.thumb = u;
                img.addEventListener('load', applyRatio, { once: true });
                img.src = u;
              });
            }
          });

          block.appendChild(div);
        });

        listEl.appendChild(block);
      });

      bindCoverRatio(listEl);

      // GSAP hover：stack ↔ 展開（pendingStack / sccd:close-lightbox 在 initAlbumPanel 層處理）
      if (window.innerWidth >= 768) {
        listEl.querySelectorAll('.album-panel-item').forEach(item => {
          const strip  = item.querySelector('.album-thumb-strip');
          const thumbs = [...item.querySelectorAll('.album-thumb')];
          if (!strip || !thumbs.length) return;

          const stackThumbs = () => {
            thumbs.forEach(t => {
              const deg = parseFloat(t.dataset.initDeg) || 0;
              gsap.to(t, { x: 0, rotation: deg, duration: DUR.fast, ease: EASE.enterSoft });
            });
          };

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
                duration: DUR.fast,
                ease: EASE.enterSoft,
              });
            });
          });

          item.addEventListener('mouseleave', () => {
            if (item._albumLbOpen) return;  // lightbox 開著（mouseleave 由 overlay 觸發）→ 維持展開
            stackThumbs();
          });

          // 點擊開 lightbox：標記維持展開，並把 stack 排到關閉後
          item.addEventListener('click', () => {
            item._albumLbOpen = true;
            pendingStack = () => { item._albumLbOpen = false; stackThumbs(); };
          });
        });
      }

      bindListItemHover(listEl, '.files-item', '.album-thumb-overlay');

      window._albumMarqueeInit = () => {
        runMarqueeOverflow(listEl, '.files-item-title-en, .files-item-title-zh', '.files-marquee-inner', '.files-item');
      };
      // 同 press：sort 重渲染後重跑 marquee（隱藏時 no-op、顯示時 showLibPanel 補量）
      requestAnimationFrame(window._albumMarqueeInit);
    }

    renderItems(getSorted());

    const albumEmptyState = ensureEmptyState(listEl);

    const selectedCats = new Set();

    // 年份 picker「配合分類」（user 2026-08-26，同 Documents）：選了分類 → 只列出該分類 item 有的年份（切分類即重建、年份選取重置）。
    const onYearFilter = () => { const before = snapshotVisibleYears(listEl); applyFilters(); clipWipeChangedBlocks(listEl, before); };
    const availYears = () => {
      const isAll = selectedCats.size === 0;
      const set = new Set();
      listEl.querySelectorAll('.files-item').forEach(it => { if (isAll || selectedCats.has(it.dataset.cat)) set.add(it.dataset.year); });
      return [...set].sort((a, b) => Number(b) - Number(a));
    };
    let selYears;
    function rebuildYearPicker() {
      yearPickerEl.querySelectorAll('button[data-year]').forEach(b => b.remove());
      selYears = createYearPicker(yearPickerEl, availYears(), onYearFilter);
    }
    rebuildYearPicker();

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
          // 單選一個分類＝該分類 tag 全同類多餘 → display:none（user 2026-08-26：不渲染、不占位＝消除標題下方隱形空白，同 Documents）。
          if (tagWrap) {
            tagWrap.style.display = singleCat ? 'none' : '';
            tagWrap.style.transform = '';  // 清舊 yPercent 殘留；純寫入不讀 layout（避免逐項 reflow thrash）
          }
        });
        block.style.display = anyVisible ? '' : 'none';
      });
      restripeZebra(listEl, '.album-panel-item'); // 篩後依可見順序重排斑馬（clipWipe 隨後 reveal 帶入新底色）
      const hasSel = selectedCats.size > 0;
      const catsWithMatch = q
        ? new Set([...listEl.querySelectorAll('.files-item')].filter(i => i.dataset.search.includes(q)).map(i => i.dataset.cat))
        : null;
      document.querySelectorAll('.lib-album-cat-btn').forEach(b => {
        b.classList.toggle('dimmed', hasSel && !selectedCats.has(b.dataset.cat));
        b.style.color = (catsWithMatch && !catsWithMatch.has(b.dataset.cat)) ? 'rgba(var(--lib-fg-rgb),0.3)' : '';
      });
      // Empty state：任何篩選組合（search / 年份 / 分類）歸零都顯示（user 2026-08-10：不限 search）
      const anyVisible = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll('.album-year-block')]).some(b => b.style.display !== 'none');
      albumEmptyState.classList.toggle('hidden', anyVisible);
    }

    const albumCatBtns = [...document.querySelectorAll('.lib-album-cat-btn')];
    albumCatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (selectedCats.has(cat)) { selectedCats.delete(cat); } else { selectedCats.add(cat); }
        if (selectedCats.size === albumCatBtns.length) selectedCats.clear();
        rebuildYearPicker();   // 年份 picker 重建成「當前分類的年份」（user 2026-08-26）
        applyFilters();
        clipWipeItems(visibleListItems(listEl));
      });
    });

    const sortBtn = document.getElementById('library-album-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        latestFirst = !latestFirst;
        sortBtn.querySelector('.sort-arrow').className = `icon ${latestFirst ? 'icon-arrow-down' : 'icon-arrow-up'} sort-arrow text-xs`;
        renderItems(getSorted());
        applyFilters();
        clipWipeItems(visibleListItems(listEl));
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

// 灰卡底部標題整行連續 marquee（user 2026-08-26 改回整行）：box 寬＝整行（title padding 內），
// track 填滿整行寬 + 1 個 unit 的複製份、捲一個 unit 無縫循環（同 RGB 色卡 renderMarquee 的做法）。
// 首個 unit 保留原 data-label-key spans（CMS 可編＋SR 讀）、其餘複製份 aria-hidden。手機/矮橫向不跑（display:none）。
// unitW 為字寬（與卡當下寬無關）→ morph 前 onTabSwitchPre 量也準；idempotent（box 已建則只重量重設複製份）。
function buildTitleMarquee(titleEl) {
  if (!titleEl || window.innerWidth < 768 || isShortLandscape()) return;
  let box = titleEl.querySelector('.lib-title-box');
  if (!box) {
    box = document.createElement('span');
    box.className = 'lib-title-box';
    const track = document.createElement('span');
    track.className = 'lib-title-track';
    const unit = document.createElement('span');
    unit.className = 'lib-title-unit';
    while (titleEl.firstChild) unit.appendChild(titleEl.firstChild);  // 原 label spans 移入首個 unit
    track.appendChild(unit);
    box.appendChild(track);
    titleEl.appendChild(box);
  }
  const track = box.querySelector('.lib-title-track');
  const firstUnit = /** @type {HTMLElement|null} */ (track && track.querySelector('.lib-title-unit'));
  if (!track || !firstUnit) return;
  const label = (firstUnit.textContent || '').trim();
  if (!label) return;
  track.querySelectorAll('.lib-title-unit:not(:first-child)').forEach(n => n.remove());  // 移除舊複製份
  const unitW = firstUnit.getBoundingClientRect().width;
  if (!unitW) return;  // 未 sized（display:none / 未 layout）→ 下次 showLibPanel 再試
  const cs = getComputedStyle(titleEl);
  const rowW = titleEl.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const copies = Math.max(2, Math.ceil(rowW / unitW) + 1);        // 填滿整行 + 1 unit（捲一個 unit 無縫）
  box.style.width = '100%';                                        // box 吃整行寬（user 2026-08-26 改回整行）
  track.style.setProperty('--marquee-shift-x', `-${unitW}px`);    // 捲一個完整 unit（title+間距）接回下一份、無縫
  track.style.animationDuration = `${Math.max(4, unitW / 45)}s`;  // ~45px/s 可讀
  for (let i = 1; i < copies; i++) {                              // 補足複製份填滿整行
    const clone = document.createElement('span');
    clone.className = 'lib-title-unit';
    clone.setAttribute('aria-hidden', 'true');
    clone.textContent = label;
    track.appendChild(clone);
  }
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

// 篩選（年份 / 分類 / 排序）後讓 list 內容重新 clip wipe（user 2026-06-22：取代 instant 顯隱）。
// 逐 item 各自 clip wipe、同時起跑、每條隨機 4 向（user 2026-06-23：award/press/album 也改逐列、方向不一）。
// 每列在自己高度內 wipe → 即使 list 已往下捲仍看得到（不像整列 wipe 垂直方向會從畫面外揭露）。wipe 完各自清 clip-path
// （常駐 inset(0) 會裁掉 files 卡片旋轉封面溢出的 ~5px 邊角）。
function clipWipeItems(items) {
  if (!items || !items.length) return;
  // awards + album + press：對齊 activities list reveal（awards 2026-07-16 / album 2026-07-17 / press 2026-08-11）
  // ——box（.award-record-item / .album-panel-item / .press-item，斑馬列有可見底色）clip inset(100%)→0 由下往上揭；
  // 文字列（.award-row / .album-files-item-row / .press-item-row）per-item 隨機從上/下 translate 滑入。
  // item clip 同時當文字 translate 的剪裁窗。files 走 revealFilesCards（下）；rest 是保底的整列 4 向 clip wipe。
  const boxReveal   = items.filter(el => el.classList.contains('award-record-item') || el.classList.contains('album-panel-item') || el.classList.contains('press-item'));
  // files 卡（Documents）：圖片 clip-path、文字 clip-reveal（user 2026-08-11，做法同 faculty）→ 走 revealFilesCards，不進整卡 wipe
  const filesReveal = items.filter(el => el.classList.contains('files-item-card'));
  const rest        = items.filter(el => !boxReveal.includes(el) && !filesReveal.includes(el));
  if (boxReveal.length) revealAwardItems(boxReveal);
  if (filesReveal.length) revealFilesCards(filesReveal);
  if (!rest.length) return;
  markRevealBusy(DUR.medium + 0.3);
  rest.forEach(el => {
    el.style.transition = 'none';
    el.style.clipPath = pickRevealHideDir();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    rest.forEach(el => {
      el.style.transition = `clip-path ${DUR.medium}s ease-out`;
      el.style.clipPath = 'inset(0 0 0 0)';
      const clear = (e) => {
        if (e.propertyName !== 'clip-path') return;
        el.style.transition = '';
        el.style.clipPath = '';
        el.removeEventListener('transitionend', clear);
      };
      el.addEventListener('transitionend', clear);
    });
  }));
}

// files 卡進場（user 2026-08-11；2026-08-16 封面由 clip-path wipe 改 clip-reveal 滑入，同 faculty 卡）：
//   封面（.files-item-cover 本體）＝在 .files-item-cover-mask（overflow:clip、承載旋轉）內 4 方向隨機滑入
//   （GSAP 無涉、走 CSS transition 同 rest 分支；±110 過衝防 dpr hairline；clip 在旋轉後 local box 生效
//    → 滑動跟著旋轉角、不切角＝faculty mask 同原理，也延續 2026-08-11「clip 別掛軸對齊外框」的教訓）；
//   標題文字＝clip-reveal（yPercent 100→0 由下往上滑）。
// 揭完各自清（保持乾淨態；封面的 transition:filter 由 CSS 常駐規則恢復）。
const COVER_SLIDE_DIRS = ['translate(0%, 110%)', 'translate(0%, -110%)', 'translate(110%, 0%)', 'translate(-110%, 0%)'];
const pickCoverSlideDir = () => COVER_SLIDE_DIRS[(Math.random() * COVER_SLIDE_DIRS.length) | 0];

// 把一個容器包進貼身 clip 遮罩（overflow-y:clip / x:visible）供整組 yPercent 揭；idempotent。
// ⚠️不直接用 setupClipReveal：files 這幾組的父層 `.files-item-titles` 是 overflow:hidden，setupClipReveal 會
//   判定「父層已建 clip 結構」而跳過 wrap（改用父層當窗）→ 多組共用同一遮罩窗、揭時互相重疊。故強制逐組新包。
function ensureGroupClip(el) {
  if (!el || el.dataset.clipWrapped) return;
  const w = document.createElement('div');
  w.className = 'clip-reveal-wrapper';
  w.style.overflowY = 'clip';
  w.style.overflowX = 'visible';
  el.parentNode.insertBefore(w, el);
  w.appendChild(el);
  el.dataset.clipWrapped = '1';
}

function revealFilesCards(cards) {
  if (!cards || !cards.length) return;
  markRevealBusy(DUR.medium + 0.3);
  const hasGsap = typeof gsap !== 'undefined';
  // 三個獨立 group 各自「一起」揭（user 2026-08-27：title 英中一組、副標一組、分類一組，三者分開不混）：
  //   ①標題 EN/ZH＝`.files-item-titles-text` ②副標 EN/ZH＝`.files-item-subtitle-lines` ③分類 tag＝
  //   `.files-item-subtitle-wrap`（該顯示時）。各包貼身 clip 遮罩、yPercent:100→0 一起滑入，組內 EN/ZH 同動、組間分開。
  // tag 藏時（singleCat）display:none＝不占位（其 wrapper 由 applyFilters 一併顯隱、免留 flex gap），故排除出組。
  const revealSets = cards.map(card => {
    // 重播出場＝整卡刷新（封面也重滑、非只標題）：清掉 slideCoverIn 的「只滑一次」guard 讓它重跑。
    // guard 原意是防捲動/lazy-load 重滑；這裡是刻意的 filter/sort 重播，要跟 album 整卡進場一致（user 2026-08-25）。
    // 只影響 revealFilesCards 收到的近視窗卡片；lazy-load onReady 那條路仍走 guard、不受影響。
    card.dataset.coverSlid = '';
    maybeSlideCover(card);  // 圖 ready 才滑（沒 ready 留白、等 onReady 補滑）
    const groups = [
      card.querySelector('.files-item-titles-text'),
      card.querySelector('.files-item-subtitle-lines'),
      card.dataset.hideCatTag !== '1' ? card.querySelector('.files-item-subtitle-wrap') : null,
    ].filter(Boolean);
    if (hasGsap && groups.length) {
      groups.forEach(ensureGroupClip);       // 各組獨立遮罩（見 ensureGroupClip 註解）
      gsap.set(groups, { yPercent: 100 });   // 隱藏準備
    }
    return groups;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    revealSets.forEach(groups => {
      if (hasGsap && groups.length) {
        gsap.to(groups, { yPercent: 0, duration: DUR.medium, ease: EASE.enter, clearProps: 'transform' });
      }
    });
  }));
}

// press/album 的副標元素（awards 無副標 → null）。副標會在標題之上「再疊一層同向 translate」，
// 比標題晚 SUBTITLE_REVEAL_STAGGER 進場（user 2026-08-12「press/album 副標跟標題分開時間出場」，效果對齊 activities 逐段 stagger）。
// nested transform 與 row 的 translate 相乘；副標殘留滑動被 .press-item-titles / .files-item-titles 的 overflow:hidden 剪掉 → 不 spill、免動 HTML/CSS。
const SUBTITLE_REVEAL_STAGGER = 0.15;
function awardSubtitleEl(el) {
  if (el.classList.contains('press-item')) return el.querySelector('.press-item-meta');
  if (el.classList.contains('album-panel-item')) return el.querySelector('.files-item-subtitle-wrap');
  return null;
}

// award item 隱藏起點：box clip inset(100%)（由下往上揭的起點）＋文字（.award-row）隨機從上/下 translate。
// clip/transform 都不影響 layout → 之後量 getBoundingClientRect 判 in-view 仍準。
function hideAwardItem(el) {
  const row = /** @type {HTMLElement|null} */ (el.querySelector('.award-row, .album-files-item-row, .press-item-row'));
  el.style.transition = 'none';
  el.style.clipPath = 'inset(100% 0 0 0)';
  // 整筆同方向：副標疊同向 → 之後晚進場、殘留被容器 overflow:hidden 剪掉不 spill
  const dir = Math.random() < 0.5 ? -100 : 100;
  if (row) {
    row.style.transition = 'none';
    row.style.transform = `translateY(${dir}%)`;
  }
  const sub = awardSubtitleEl(el);
  if (sub) {
    sub.style.transition = 'none';
    sub.style.transform = `translateY(${dir}%)`;
  }
}
// 播放：box clip →inset(0)（由下往上，斑馬底色隨之揭、同時當文字剪裁窗）＋.award-row translateY→0。
// delay = stagger 起跑延遲。clip-path/transform 各自 transitionend 後清掉（常駐會裁 ref 展開 / 影響 sticky 年份標）。
// press/album 副標晚 SUBTITLE_REVEAL_STAGGER；e.target 守門避免子元素 transitionend 冒泡誤觸父層 clear。
function playAwardItem(el, dur, delay) {
  const sub = awardSubtitleEl(el);
  const subDelay = sub ? delay + SUBTITLE_REVEAL_STAGGER : delay;
  markRevealBusy(dur + subDelay + 0.2);
  const row = /** @type {HTMLElement|null} */ (el.querySelector('.award-row, .album-files-item-row, .press-item-row'));
  el.style.transition = `clip-path ${dur}s ease-out ${delay}s`;
  el.style.clipPath = 'inset(0 0 0 0)';
  const clearBox = (e) => {
    if (e.target !== el || e.propertyName !== 'clip-path') return;
    el.style.transition = ''; el.style.clipPath = '';
    el.removeEventListener('transitionend', clearBox);
  };
  el.addEventListener('transitionend', clearBox);
  if (row) {
    row.style.transition = `transform ${dur}s ease-out ${delay}s`;
    row.style.transform = 'translateY(0)';
    const clearTxt = (e) => {
      if (e.target !== row || e.propertyName !== 'transform') return;
      row.style.transition = ''; row.style.transform = '';
      row.removeEventListener('transitionend', clearTxt);
    };
    row.addEventListener('transitionend', clearTxt);
  }
  if (sub) {
    sub.style.transition = `transform ${dur}s ease-out ${subDelay}s`;
    sub.style.transform = 'translateY(0)';
    const clearSub = (e) => {
      if (e.target !== sub || e.propertyName !== 'transform') return;
      sub.style.transition = ''; sub.style.transform = '';
      sub.removeEventListener('transitionend', clearSub);
    };
    sub.addEventListener('transitionend', clearSub);
  }
}
const AWARD_REVEAL_STAGGER = 0.05; // 逐列起跑間隔（s）
let _awardRevealCleanup = null;    // 重播前先解上一輪 scroll listener，避免同頁多次 filter 累積

// 年份標籤（.press-year-label）clip 由下往上藏 / 揭（對齊列 box 的 inset 方向），delay 跟該年份第一列同步。
// 為何要藏：年份逐組序列化（user 2026-08-11）時標籤要跟自己那組一起出現，不能一開始所有年份都亮著。
function hideYearLabel(block) {
  const label = /** @type {HTMLElement|null} */ (block && block.querySelector(':scope > .press-year-label'));
  if (!label) return;
  label.style.transition = 'none';
  label.style.clipPath = 'inset(100% 0 0 0)';
}
function playYearLabel(block, dur, delay) {
  const label = /** @type {HTMLElement|null} */ (block && block.querySelector(':scope > .press-year-label'));
  if (!label) return;
  label.style.transition = `clip-path ${dur}s ease-out ${delay}s`;
  label.style.clipPath = 'inset(0 0 0 0)';
  const clear = (e) => {
    if (e.propertyName !== 'clip-path') return;
    label.style.transition = ''; label.style.clipPath = ''; // 常駐 clip 會干擾 sticky 標籤 → 揭完清掉
    label.removeEventListener('transitionend', clear);
  };
  label.addEventListener('transitionend', clear);
}

// awards 逐「年份組」進場（user 2026-08-11：下一年份等上一年份揭完才出現，取代原本跨年份連續逐列 stagger）：
//   同 year-block 的列一起揭（組內 stagger AWARD_REVEAL_STAGGER），年份標籤跟該組第一列同 delay 揭；
//   下一組 delay 接在前一組（含 dur 揭完）之後。且**只有捲進 scroll 容器視窗的才播**。
// 初始在視窗內的逐年 stagger；視窗外的先藏，捲動時（top 越過容器下緣）各自即揭（不 stagger、label 補揭）。
// 用 scroll listener 而非 IntersectionObserver：IO 對「瞬間/快速捲過」的列不可靠（fling 掠過 → 永久藏住看不見）；
// 這裡每次捲動把「top 已在容器下緣以上」的未播列全部補揭 → 快捲也保證揭完、不卡隱形（user 要保證修不 best-effort）。
function revealAwardItems(items, dur = DUR.medium, { skipInitial = false } = {}) {
  if (!items.length) return;
  const scroller = /** @type {HTMLElement|null} */ (items[0].closest('#library-awards-scroll, #library-album-scroll, #library-press-scroll'));
  if (_awardRevealCleanup) { _awardRevealCleanup(); _awardRevealCleanup = null; }
  const blockOf = el => /** @type {HTMLElement|null} */ (el.closest('[class$="year-block"]'));
  // skipInitial（切分頁「色塊掀開即見內容」，user 2026-08-23）：視窗內的不藏不動畫、
  // 只 gate 視窗下方的等捲入才進場（scroll-gate 照舊）。跨 fold 的年份 label 已可見 → 記進 preShown 別重播。
  const preShown = new Set();
  if (skipInitial) {
    const rb = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    const below = items.filter(el => el.getBoundingClientRect().top >= rb);
    const belowSet = new Set(below);
    items.forEach(el => { if (!belowSet.has(el)) { const b = blockOf(el); if (b) preShown.add(b); } });
    items = below;
    if (!items.length) return;
  }
  const hiddenLabels = new Set();
  items.forEach(el => {
    hideAwardItem(el);
    const block = blockOf(el);
    if (block && !hiddenLabels.has(block) && !preShown.has(block)) { hiddenLabels.add(block); hideYearLabel(block); }
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const pending = new Set(items);
    const shownLabels = new Set(preShown);
    // sequential=true：依 year-block 分組逐年（組內 stagger、組間等前組揭完）；false：捲入視窗即揭（delay 0）
    // 讀所有 rect（讀相）→ 再一次 play（寫相），避免 loop 內讀寫交錯 forced reflow
    const flush = (sequential) => {
      const rb = scroller ? scroller.getBoundingClientRect().bottom : Infinity;
      const due = [...pending].filter(el => el.getBoundingClientRect().top < rb);
      let delay = 0, lastBlock = null;
      due.forEach(el => {
        const block = blockOf(el);
        if (sequential && block !== lastBlock && lastBlock !== null) delay += dur; // 等前一年份揭完才接下一組
        lastBlock = block;
        const d = sequential ? delay : 0;
        if (block && !shownLabels.has(block)) { shownLabels.add(block); playYearLabel(block, dur, d); }
        playAwardItem(el, dur, d);
        if (sequential) delay += AWARD_REVEAL_STAGGER;
        pending.delete(el);
      });
    };
    flush(true); // 初始可見的逐年 stagger
    if (pending.size && scroller) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          flush(false);
          if (!pending.size && _awardRevealCleanup) { _awardRevealCleanup(); _awardRevealCleanup = null; }
        });
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      _awardRevealCleanup = () => scroller.removeEventListener('scroll', onScroll);
      registerPageCleanup(() => { if (_awardRevealCleanup) { _awardRevealCleanup(); _awardRevealCleanup = null; } });
    }
  }));
}
// 只取目前可見的卡片（被年份/分類篩掉的 display:none 卡 offsetParent=null，套 clip-path 後沒 transitionend 不會自清 → 排除）
// 只取「捲動視窗內＋200px buffer」的卡做進場動畫：offsetParent 只擋 display:none，
// 視窗下方 150+ 卡全進 setupClipReveal（每卡 2-4 標題包遮罩+GSAP set）＝主執行緒凍 7s
// （2026-08-18 CPU profile：scroll-animate 3.3s+gsap 4s）。下方卡不藏不動畫、捲到時已就位。
function visibleFilesCards(listEl) {
  const scroller = document.getElementById('library-files-scroll');
  const cut = (scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight) + 200;
  return [...listEl.querySelectorAll('.files-item-card')].filter(el =>
    el.offsetParent !== null && el.getBoundingClientRect().top < cut);
}
// award/press/album 各自的 list item（三 selector 通用：每個 listEl 只 match 自己那種）；同上排除 display:none
function visibleListItems(listEl) {
  return [...listEl.querySelectorAll('.award-record-item, .press-item, .album-panel-item')].filter(el => el.offsetParent !== null);
}
// year filter（多選累加）：只 wipe「新出現 或 可見位置 index 改變」的 year-block，位置完全沒動的不重跑（user 2026-06-23）。
// snapshotVisibleYears 在 filter「前」快照可見年份順序；clipWipeChangedBlocks 在 filter「後」比對：
//   選新年份加在最下面 → 上面的 index 不變、不 wipe；加在上面 / 取消年份 → 下面的往上移、index 變 → wipe；
//   取消到全顯示 → 重現的年份在 before 找不到（新出現）→ wipe。[class$=year-block] 通吃 4 panel 的 year-block class。
function snapshotVisibleYears(listEl) {
  return [...listEl.querySelectorAll('[class$="year-block"]')].filter(b => b.style.display !== 'none').map(b => b.dataset.year);
}
function clipWipeChangedBlocks(listEl, beforeYears) {
  const after = [...listEl.querySelectorAll('[class$="year-block"]')].filter(b => b.style.display !== 'none');
  const changed = after.filter((b, i) => { const k = beforeYears.indexOf(b.dataset.year); return k === -1 || k !== i; });
  const items = changed.flatMap(b => [...b.querySelectorAll('.award-record-item, .press-item, .album-panel-item, .files-item-card')]);
  // 分類篩選會讓下方 block 的可見 index 全體位移→幾乎全判為 changed；但畫外卡片重播進場沒人看到、白付成本
  // （files 卡尤重：setupClipReveal 包遮罩＋reflow＋GSAP＋封面滑入）＝點分類鈕卡頓。裁到近視窗，同 visibleFilesCards。
  const scroller = listEl.closest('[id^="lib-panel-"]')?.querySelector('[id$="-scroll"]');
  const cut = (scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight) + 200;
  clipWipeItems(items.filter(el => el.offsetParent !== null && el.getBoundingClientRect().top < cut));
}

// ── Reveal busy 訊號（供 library-card.js 延後重排輪詢）─────────────────────
// RO 延後重排（隨機重佈局＋0.6s TRANSITION glide）若落在 panel reveal 進行中，
// 揭露到一半的 chip／內容會騎著滑行中的卡片飛走（user 2026-08-10「從遠處飛進來」）。
// 各 reveal 起跑時把 busy 時窗撐到自己動畫結束＋margin；attemptRelayout 等窗過了才重排。
let _revealBusyUntil = 0;
function markRevealBusy(sec) {
  _revealBusyUntil = Math.max(_revealBusyUntil, performance.now() + sec * 1000);
}
export function isPanelRevealing() { return performance.now() < _revealBusyUntil; }

// ── Panel 標題 bar：hero clip-reveal（本體 translate 滑入＋同向 clip 同步收）──────
// 標題現為灰卡頂部 in-flow marquee bar（無 rotate；translate 是 CSS 位移不影響 flow → 佔位不受 reveal 干擾）。
// clip 與進入方向同側＝從該側滑入、該側 inset 同步開 → 視覺上「遮罩窗釘死版位、bar 滑進來」。⚠️2026-08-23
// user 澄清「clip reveal」＝要保留位移的招牌語彙、只要求「等定位完才揭」（awaitLayoutReady gate）——別再拆位移。
// 見 reference_gsap_translate_string_needs_matching_units / reference_rotated_element_in_clip_mask_slide。
const TITLE_ENTER_CLIP = {
  top:    'inset(100% 0% 0% 0%)',
  bottom: 'inset(0% 0% 100% 0%)',
  left:   'inset(0% 0% 0% 100%)',
  right:  'inset(0% 100% 0% 0%)',
};
// 沿「較短邊」隨機（chip 通常寬>高 → top/bottom，滑距=矮邊高 ~30px、小而穩）：避免抽到長邊(寬)那次
// 滑一整個寬度「從很遠飛進來」(user 2026-07-16)。位移=clip 全距鎖定→貼邊不浮中間（同三色卡 revealDir）。
const pickTitleDir = (el) => {
  const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
  const pair = w >= h ? ['top', 'bottom'] : ['left', 'right'];
  return pair[Math.random() < 0.5 ? 0 : 1];
};

// 沿「旋轉後自身軸」把 chip 推出版位的位移向量（雙值全 px，translate 字串插值才穩定）
function titleHiddenTranslate(el, dir) {
  const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
  const th = m ? parseFloat(m[1]) * Math.PI / 180 : 0;
  const c = Math.cos(th), s = Math.sin(th);
  const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
  const v = { top: [h*s, -h*c], bottom: [-h*s, h*c], left: [-w*c, -w*s], right: [w*c, w*s] }[dir];
  // 保險絲（正解＝caller 量測前 awaitLayoutReady stableFrames 濾過渡幀；此處僅擋漏網）：
  // 正常滑距 ~45px 不受影響；就算量測仍異常也不可能「從遠處飛入」
  const MAX_SLIDE = 80;
  const mag = Math.hypot(v[0], v[1]);
  if (mag > MAX_SLIDE) { v[0] *= MAX_SLIDE / mag; v[1] *= MAX_SLIDE / mag; }
  return `${v[0].toFixed(2)}px ${v[1].toFixed(2)}px`;
}

// 連點快速切換時 chip 的「單一寫入者」防護（user 2026-08-23「快速切換 chip 沒遮罩直接飛」）：
// gsap 預設不跨 tween overwrite——舊 reveal（1s）沒被殺就會跟新一輪 exit/hidePanelChildren 搶寫
// 同一顆 chip 的 clipPath/translate：舊 tween 每幀重開遮罩＋續插位移＝chip 裸奔騎卡飛。
// 每輪 reveal/exit 起跑前 killTweensOf(title)，並用序號作廢仍掛在 await 的舊 reveal。
const _titleAnimSeq = new WeakMap();
function bumpTitleSeq(title) {
  const seq = (_titleAnimSeq.get(title) || 0) + 1;
  _titleAnimSeq.set(title, seq);
  return seq;
}

// user 2026-08-26：標題「不進場動畫」——直接顯示（清 clipPath、無 tween）。
// tab 切換時標題在 z 低於離場色塊 veil，veil 掀開就把它露出＝「色塊離開就直接出現」；
// entrance 時隨灰卡 clip-reveal 就位後即刻現身。exit 仍走 playPanelTitleExit 的 hero 收場（未動）。
export function playPanelTitleReveal(title) {
  if (!title) return;
  bumpTitleSeq(title);  // 作廢仍掛在 await 的舊 exit tween 序號（連點防護，與 playPanelTitleExit 共用）
  if (typeof gsap !== 'undefined') gsap.killTweensOf(title);
  title.style.transition = 'none';
  title.style.translate = '';
  title.style.clipPath = '';
}

// title = hero clip-reveal（slide-in）；內容區維持原隨機方向 clip-path wipe（兩者視覺獨立）
// instant（user 2026-08-23 色塊 veil 流程）：內容「直接就位」不跑 wipe——色塊蓋著時已渲染好、
// veil 掀開即見內容；只有視窗下方的 list items 保留 scroll-gate 進場（skipInitial）。
// chip 標題仍走 hero reveal：它凸出灰卡邊界外、veil 蓋不到，instant 直接現身會早於 veil 掀開穿幫。
export function playPanelReveal(panelEl, { instant = false } = {}) {
  if (!panelEl) return;
  // 同步 tick 就撐起 busy（isSwitching 解鎖與本呼叫同 tick)→ 延後重排的 100ms 輪詢無縫接手；
  // title tween 起跑後會再各自延長時窗
  markRevealBusy(DUR.fast + 0.3);
  const title = panelEl.querySelector(':scope > .lib-panel-title');
  const others = [...panelEl.querySelectorAll(':scope > :not(.lib-panel-title)')];
  // 標題「不進場動畫」（user 2026-08-26）：一律即刻清 clipPath 直接顯示（instant/entrance 皆是）。
  // instant（veil 流程）此刻標題在離場色塊 veil 底下、z 低於 veil → veil 掀開就把它露出
  // ＝「色塊離開就直接出現」，不需 library-card.js 再特別揭。
  if (title) playPanelTitleReveal(title);
  // awards：list 逐列進場（box 下往上＋文字上下隨機＋stagger＋scroll-gate），同 filter/sort 路徑
  // （user 2026-07-16：進場也要，不只 filter 後）。外層內容區塊照舊整塊 wipe（year picker/search/ticker），
  // items 在塊內各自藏→stagger 揭，兩層動畫可疊。
  const awardsList = panelEl.querySelector('#library-awards-list');
  if (awardsList) revealAwardItems(visibleListItems(awardsList), DUR.medium, { skipInitial: instant });
  // album 同 awards：box 由下往上＋文字上下隨機＋stagger＋scroll-gate（user 2026-07-17）
  const albumListEl = panelEl.querySelector('#library-album-list');
  if (albumListEl) revealAwardItems(visibleListItems(albumListEl), DUR.medium, { skipInitial: instant });
  // press 同 awards/album：box 由下往上＋文字上下隨機＋逐年 stagger＋scroll-gate（user 2026-08-11）
  const pressListEl = panelEl.querySelector('#library-press-list');
  if (pressListEl) revealAwardItems(visibleListItems(pressListEl), DUR.medium, { skipInitial: instant });
  // files（Documents）：卡片圖片 clip-path＋文字 clip-reveal（同 filter/sort 路徑，user 2026-08-11）；外層容器仍整塊 wipe
  // instant：不跑（卡片本就未藏、veil 掀開即見；視窗下方 files 卡依既有效能定案本就不動畫）
  const filesListEl = panelEl.querySelector('#library-files-list');
  if (filesListEl && !instant) revealFilesCards(visibleFilesCards(filesListEl));
  if (!others.length) return;

  if (instant) {
    // 內容直接就位（veil 下已渲染完成）
    others.forEach(el => {
      /** @type {HTMLElement} */ (el).style.transition = 'none';
      /** @type {HTMLElement} */ (el).style.clipPath   = '';
    });
    return;
  }

  // 各自挑方向
  const dirs = others.map(() => pickRevealHideDir());

  // 設起點（transition:none 避免從上次 inset(0) 反向走全程）
  others.forEach((el, i) => {
    /** @type {HTMLElement} */ (el).style.transition = 'none';
    /** @type {HTMLElement} */ (el).style.clipPath   = dirs[i];
  });

  // 雙 rAF 確保起點 paint → 重設 transition → 設終點觸發 wipe
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      others.forEach(el => {
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
export function playPanelTitleExit(panelEl, dur = DUR.medium) {
  if (!panelEl) return;
  const title = /** @type {HTMLElement|null} */ (panelEl.querySelector(':scope > .lib-panel-title'));
  if (!title) return;
  bumpTitleSeq(title);  // 作廢仍掛在 await 的 pending reveal（連點防護）
  const dir = pickTitleDir(title);
  if (typeof gsap === 'undefined') { title.style.clipPath = TITLE_ENTER_CLIP[dir]; return; }
  gsap.killTweensOf(title);  // 殺掉跑到一半的 reveal，避免跨 tween 搶寫 clip/translate
  // 對稱 hero slide-out：translate 沿旋轉軸滑出 + 同向 clip 同步收。fromTo 顯式起點 inset(0)：
  // 進場 onComplete 已 clearProps → computed clipPath=none，gsap.to 從 none 補間不動會 snap
  // （見 feedback_clippath_exit_after_clearprops_use_fromto）
  gsap.fromTo(title,
    { clipPath: 'inset(0% 0% 0% 0%)', translate: '0px 0px' },
    { clipPath: TITLE_ENTER_CLIP[dir], translate: titleHiddenTranslate(title, dir), duration: dur, ease: EASE.exit });
}

export function playPanelBodyExit(panelEl, dur = 0.35) {
  if (!panelEl) return;
  const others = [...panelEl.querySelectorAll(':scope > :not(.lib-panel-title)')];
  if (!others.length) return;
  const dirs = others.map(() => pickRevealHideDir());
  // ⚠️明確 inset(0) 起點 + reflow 提交，才會真的跑出場 wipe：切分頁走 veil instant 流程收尾把內容
  // clipPath 設成 ''（=computed none），CSS `none → inset()` **不插值會 snap** → 內容「直接消失」不跑
  // clip 出場（user 2026-08-24）。title chip 用 gsap.fromTo 顯式起點故無此症，只有 body 這條要修。
  others.forEach(el => {
    /** @type {HTMLElement} */ (el).style.transition = 'none';
    /** @type {HTMLElement} */ (el).style.clipPath   = 'inset(0 0 0 0)';
  });
  void panelEl.offsetWidth;  // 一次 reflow 把 inset(0) 起點提交，下面轉 hideDir 才有基準可插值
  others.forEach((el, i) => {
    /** @type {HTMLElement} */ (el).style.transition = `clip-path ${dur}s ease-in`;
    /** @type {HTMLElement} */ (el).style.clipPath   = dirs[i];
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
// instant=true：內容直接就位不跑 wipe（色塊 veil 掀開流程，見 playPanelReveal）
function showLibPanel(tab, { reveal = true, instant = false } = {}) {
  Object.entries(PANEL_MAP).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === tab) {
      el.style.display = 'flex';
      const titleMq = el.querySelector('.lib-panel-title');
      if (titleMq) buildTitleMarquee(titleMq);  // 顯示後（可量字寬）建/重算頂部標題 marquee box
      if (reveal) {
        playPanelReveal(el, { instant });
      } else {
        // 預設隱藏，等之後 onTabSwitch / 手動 showPanel 再 reveal
        hidePanelChildren(el);
      }
      if (key === 'awards' && typeof window._awardsMarqueeInit === 'function') requestAnimationFrame(window._awardsMarqueeInit);
      if (key === 'awards' && typeof window._awardsTickerStart === 'function') window._awardsTickerStart();
      if (key === 'press'  && typeof window._pressMarqueeInit === 'function') requestAnimationFrame(window._pressMarqueeInit);
      if (key === 'files'  && typeof window._filesMarqueeInit === 'function') requestAnimationFrame(window._filesMarqueeInit);
      if (key === 'album'  && typeof window._albumMarqueeInit === 'function') requestAnimationFrame(window._albumMarqueeInit);
    } else {
      el.style.display = 'none';
      // 切走 awards → 重置 ref 手風琴，回來時不殘留展開態
      if (key === 'awards' && typeof window._awardsResetAccordions === 'function') window._awardsResetAccordions();
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
  let _entranceDoneFired = false;

  // Awards 需要在進場動畫完成後啟動 ticker，透過 registerEntranceDone 注入回呼。
  // ⚠️ initAwardsPanel 是 async：cb（ticker 動畫）在 await fetch+render 後才設。手機路徑（main-modular）
  // 會「同步」呼叫 onEntranceDone()（此時 cb 還沒設）→ 舊版手機 ticker 永不啟動。
  // 修：onEntranceDone 記 flag，cb 設好時若 flag 已亮就立刻補跑（桌面 cb 早已設好、行為不變）。
  initAwardsPanel(cb => { _entranceDoneCb = cb; if (_entranceDoneFired) cb(); });
  initPressPanel();
  initFilesPanel();
  initAlbumPanel();

  // 預設所有 panel 內 chip + 內容隱藏（等 grayEl 進場揭露完 onTabSwitch 才 reveal）
  // 不做的話 awards (HTML 預設 display:flex) chip 會在 grayEl clip wipe 時被一起揭出半身
  Object.values(PANEL_MAP).forEach(id => {
    hidePanelChildren(document.getElementById(id));
  });

  // 轉向（跨矮橫向 gate）時重量所有 marquee：橫向 runMarqueeOverflow 把文字換成兩份 .marquee-copy，
  // 轉直向後 cell 換行顯示 → 兩份全露出＝「文字出現兩次」；applyMarqueeOverflow 自帶 reset（重跑先還原
  // 單份再依當前寬度重判），四個 _XMarqueeInit 都 idempotent → 直接全部重觸發即自癒。
  const gateMq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
  const onGateChange = () => requestAnimationFrame(() => {
    ['_awardsMarqueeInit', '_pressMarqueeInit', '_filesMarqueeInit', '_albumMarqueeInit']
      .forEach(k => { if (typeof window[k] === 'function') window[k](); });
  });
  gateMq.addEventListener('change', onGateChange);
  registerPageCleanup(() => gateMq.removeEventListener('change', onGateChange));

  return {
    showPanel: showLibPanel,
    // library-card.js（桌面進場完）或 main-modular（手機）呼叫以觸發 ticker 動畫；只跑一次
    onEntranceDone: () => {
      if (_entranceDoneFired) return;
      _entranceDoneFired = true;
      if (typeof _entranceDoneCb === 'function') _entranceDoneCb();
    },
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
 * hash 是不是「item 級 deep-link」（指向某清單項目：award `#a-*` / files `#f-*` / album `#album-*` / press `#press-*`），
 * 而非純 tab 名（#awards/#press/#files/#album）或空。
 * 給 refresh/直開/popstate 判斷要不要清掉 hash 回 default：只清 item 級導航，純 tab hash 是使用者瀏覽時
 * 持久化的分頁狀態（onTabSwitch replaceState 寫的）要保留。
 */
export function isItemDeepLinkHash() {
  const hash = (window.location.hash || '').slice(1);
  if (!hash) return false;
  return !Object.prototype.hasOwnProperty.call(PANEL_MAP, hash);
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
  // user 2026-06-28：deep-link highlight 計時＝「捲動完成 + HIGHLIGHT_DELAY」(post-scroll)：
  //   - no-scroll（已對齊）：捲動完成＝立即 → HIGHLIGHT_DELAY 後 highlight = 0.4s。
  //   - 需捲：捲動「第一次停穩」(≈視覺捲完) 後 HIGHLIGHT_DELAY 才 highlight；album/files 後續補捲對齊不再拖 highlight。
  // SCROLL_DELAY＝等 panel 內容 clip-reveal 跑完才開始捲（user 2026-06-28 報「灰卡還沒揭露完就開始 item 對齊」）：
  //   handleHash 在 onEntranceDone 觸發，而 panel 內容 reveal（playPanelReveal：`[id^=lib-panel-] > *` 的
  //   CSS `transition: clip-path var(--dur-fast)`=0.3s）正好同一刻才起跑 → 不等的話捲動會疊在「內容還在 wipe 進場」時開始。
  //   等掉這段 reveal（0.3s + 雙 rAF 起步 + margin）再捲＝視覺上「卡片內容出齊 → 才對齊到目標」。
  //   ⚠️ clip-path 只遮罩不動 layout、awards 列高固定 → 不等也不會「對歪」，純粹是「太早開始捲」的觀感問題。
  //   async panel 還沒 render 到目標 → tryFindAndHandle 找不到仍每 100ms retry（最多 3s），不受此值影響正確性。
  // user 2026-06-28 拍板：兩個 delay 都統一 0.4s（highlight 原 0.6s 嫌久；scroll-wait 一併對齊同值）。
  const SCROLL_DELAY = 400;
  const HIGHLIGHT_DELAY = 400;

  function tryFindAndHandle() {
    // 分享網址的 uuid 已縮成前 8 碼（libShareUrl）→ 精確 getElementById 找不到時退回前綴比對；
    // 完整 uuid 舊連結仍走 getElementById 精確命中。hash 來自 URL（外部輸入）→ escape 引號/反斜線。
    const safeHash = hash.replace(/["\\]/g, '\\$&');
    const el = document.getElementById(hash) || document.querySelector(`[id^="${safeHash}"]`);
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

    // 只在目標 panel 還沒顯示時才切換 + reveal。
    // deep-link 常態：initialTab 由同一個 hash 推出 → 卡片進場 onTabSwitch 時就已 showLibPanel + reveal 過該 panel；
    // 若這裡再無條件 showLibPanel(tab)，playPanelReveal 會**重播一次 wipe 揭露** = user 看到的「像 refresh 一次再 scroll」。
    // 已顯示就跳過，直接讓內層清單平滑捲到該項目。
    if (panelEl.style.display === 'none') {
      showLibPanel(tab);
    }

    // 等 panel 顯示 + layout 完成後再 scroll + 觸發 hover
    requestAnimationFrame(() => {
      // ⚠️ 只捲動該 panel 內層的 scroll 容器（id 以 `-scroll` 結尾：library-awards-scroll 等），
      //    **不要用 el.scrollIntoView**：library 頁 body 是 `overflow-hidden h-screen`，但 overflow-hidden
      //    只擋「使用者捲動」、擋不住「程式捲動」；scrollIntoView({block:'start'}) 會為了把元素對齊 viewport 頂端
      //    連 body 一起捲（獎項在置中卡片裡、離頂 ~300px）→ 整張卡片被頂到 header 後面（user 2026-06-04 回報「整體往上位移」）。
      //    改用內層 scroller 的 scrollBy（getBoundingClientRect 差值）只在容器內捲，body 完全不動。
      // 對齊點：把目標捲到 sticky 年份標題「底緣」之下，依 panel 決定要不要多塞 overlap（user 2026-06-09）：
      //   - awards（.year-block）：-4px 是實測對齊補償（label 取 firstElementChild、offsetHeight 比 sticky 覆蓋高 ~4px）；列已斑馬無 border。
      //   - files（.files-year-block，卡片無分隔綫）：標題與第一排的留白已搬進 sticky 標題 padding-bottom（見 library.css），
      //     故對齊標題底緣即可、不再 overlap → 第一排卡片自然不位移（之前固定 32px 比卡片自然位置高、害第一排被多捲）。
      //   - album（.album-year-block）：手機標題（p1）比桌面（p3）高、固定 32 會被蓋 ~2px → 取 max(32, 標題高)，
      //     桌面標題 ~31px 仍是 32 不變。
      //   - 其他（press/找不到）：維持原本固定 32px。
      // 年份標題高度一律動態量（font/padding 改了也準）。
      const scroller = /** @type {HTMLElement|null} */ (el.closest('[id$="-scroll"]'));
      if (scroller) {
        const computeMargin = () => {
          const yb = /** @type {HTMLElement|null} */ (el.closest('.year-block, .press-year-block, .files-year-block, .album-year-block'));
          let margin = 32;
          if (yb) {
            const isAwards = yb.classList.contains('year-block');
            const isAlbum = yb.classList.contains('album-year-block');
            const label = /** @type {HTMLElement|null} */ (isAwards ? yb.firstElementChild : yb.querySelector(':scope > .press-year-label'));
            if (label) {
              // 對齊年份標題底緣（label 自己的 padding-bottom 當 gap）。awards 與 album 各多收 4px 往上塞：
              //   - awards：-4 是「實測對齊補償」，不是為了蓋 border（border 2026-06-22 改斑馬時已移除）。awards 的
              //     label 取 .year-block firstElementChild、量到的 offsetHeight 比 sticky 實際覆蓋高 ~4px → 不減 4 會
              //     低 4px（user 2026-06-28 抓到「移除 -4 後 award deep-link 往下 4px」）。故 -4 必須保留。
              //   - album：item overflow:visible + 縮圖旋轉「飄出 row」，上一筆縮圖下緣 + label top:-1px 的 1px 縫
              //     會露出上面 item（user 2026-06-27 桌面 album deep-link）；4px 把它收進 label bg 後緣。
              // album 不用 Math.max(32, labelHeight)：桌面 p3 label ~23px < 32 → 強制 32 → item 比標題底多掉 ~9px
              //「太低」（user 2026-06-25 桌面 album）；改吃 labelHeight 後兩端貼齊。
              margin = Math.max(0, label.offsetHeight - (isAwards || isAlbum ? 4 : 0));
            }
          }
          return margin;
        };
        const target = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - computeMargin();
        // 已對齊（不需捲）：捲動完成＝立即 → 等 HIGHLIGHT_DELAY(0.4s) 才 highlight（user 2026-06-28：no-scroll 只等 0.4s）。
        if (Math.abs(target) <= 2) { setTimeout(runHighlight, HIGHLIGHT_DELAY); return; }
        scroller.scrollBy({ top: target, behavior: 'smooth' });

        // 捲動量是「捲動當下」一次算好的，但 album/files 縮圖 loading=lazy + load 後才 applyRatio 設尺寸；
        // 手機縮圖 flex-wrap 自然排版佔 layout 高度（桌面 absolute stack 不佔 → 桌面一次就準），
        // smooth scroll 途中上方圖片陸續載入撐高內容、目標被推走 ~870px = 「捲了但沒捲到」（user 2026-06-12 手機 album）。
        // → 等 scrollTop 停穩後重量誤差、補捲（最多 3 次），對齊完成才閃 highlight（保證 item 在畫面內才看得到）。
        // highlight 與「補捲對齊」解耦（user 2026-06-28）：捲動「第一次停穩」(≈ 視覺捲完) 就排程 highlight＝捲完
        // + HIGHLIGHT_DELAY(0.4s)，不被 album/files 後續多次補捲拖到 ~3s。補捲仍照跑、只負責把 item 對齊到位
        // （在 highlight flash 持續 1s 內完成；桌面 album absolute stack 不撐高、第一次就準，幾乎不補捲）。
        let lastTop = /** @type {number|null} */ (null);
        let corrections = 0;
        let ticks = 0;
        let highlightScheduled = false;
        const scheduleHighlight = () => { if (!highlightScheduled) { highlightScheduled = true; setTimeout(runHighlight, HIGHLIGHT_DELAY); } };
        const settleTimer = setInterval(() => {
          if (!el.isConnected || ++ticks > 40) { clearInterval(settleTimer); scheduleHighlight(); return; }
          const cur = scroller.scrollTop;
          const stable = lastTop !== null && Math.abs(cur - lastTop) < 1;
          lastTop = cur;
          if (!stable) return;
          scheduleHighlight(); // 第一次停穩即排程 highlight（捲完 + 0.4s）；後續補捲不再延後 highlight
          const err = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - computeMargin();
          if (Math.abs(err) <= 2 || corrections >= 3) {
            clearInterval(settleTimer);
            return;
          }
          corrections++;
          lastTop = null; // 補捲後重新等停穩
          scroller.scrollBy({ top: err, behavior: 'smooth' });
        }, 150);
      } else {
        // 理論上四個 panel 都有內層 scroller；萬一沒有，退回 nearest（不對齊頂端 → 不會大幅捲 body）
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(runHighlight, HIGHLIGHT_DELAY);
      }

      // 觸發一次該項目的 highlight（1s，user 2026-06-12 比照 activities deep-link）：
      // - 桌面：只 dispatch mouseenter（原生 hover listener = 唯一顏色來源）。inline 不另套色——
      //   listener 自己會隨機抽色，inline 再抽一套會雙色（ring A + 底色 B，user 2026-06-13）
      // - 手機：hover listener 沒綁（tap 不該變色的設計）、dispatch 沒人接 → inline 套色替代：
      //   awards 文字變色（mode-color 用 var(--theme-bg) 跟 hue 流動、否則隨機 accent）；
      //   press/files/album 用 accent 底色 + 4px ring 一起閃（縮圖蓋滿 element 時底色看不到，
      //   ring（box-shadow 不佔 layout）才看得見，兩者並用）
      // - is-hovered class + mouseenter/leave 兩邊照舊 dispatch：桌面的 CSS :hover 樣式與 JS listener
      //   （files 封面轉正等）仍吃得到
      function runHighlight() {
        // 桌面：hover listener 已綁（awards 文字變色 / bindListItemHover 底色+overlay），只 dispatch
        // mouseenter 讓原生 hover 當「唯一」顏色來源——inline 再疊一套會跟 listener 各自隨機抽色，
        // 變成 ring 一色、底色一色的雙色（user 2026-06-13 桌面 deep-link 看到雙重顏色）。
        // 手機：listener 都沒綁（<768 不綁），dispatch 沒人接 → 維持 inline 單色那套。
        // ⚠️ 判準必須跟 hover 綁定 gate（bindListItemHover 等處的 >=768 && !isShortLandscape）一致：
        // 橫向手機寬 ≥768 但 listener 沒綁，只看寬度會 dispatch 給沒人接＝無 highlight（user 2026-07-10）。
        const desktopHover = window.innerWidth >= 768 && !isShortLandscape();
        const prevTransition = el.style.transition;
        if (!desktopHover) {
          if (tab === 'awards') {
            // 手機 awards 改 zebra 底後（2026-07-03），highlight 對齊桌面 hover＝整列 accent 底色
            // （不再文字變色）；mode-color 由 library.css [style*=background] 規則翻色，不必分支。
            el.style.transition = 'background 0.3s';
            el.style.background = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
          } else {
            const accent = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            el.style.transition = 'background 0.3s, box-shadow 0.3s';
            el.style.background = accent;
            el.style.boxShadow = `0 0 0 4px ${accent}`;
          }
        }
        el.classList.add('is-hovered');
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => {
          if (!desktopHover) {
            if (tab === 'awards') {
              el.style.background = '';
            } else {
              el.style.background = '';
              el.style.boxShadow = '';
            }
          }
          el.classList.remove('is-hovered');
          el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          // transition 等淡出跑完才還原（0.3s），避免殘留 inline transition 干擾之後的 hover
          setTimeout(() => { el.style.transition = prevTransition; }, 350);
        }, 1000);
      }
    });
  }

  setTimeout(tryFindAndHandle, SCROLL_DELAY);
}
