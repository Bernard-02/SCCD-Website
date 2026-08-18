/**
 * Courses Grid Module
 * 課程表 inline 渲染（取代舊版 lightbox 課程地圖）
 *
 * Layout（每個 program panel 一張表）：
 *                              | 1年級 | 2年級 | 3年級 | 4年級
 *   第一學期 | 必修               | cells...
 *             選修
 *   第二學期 | 必修
 *           選修
 *
 * 互動：hover 卡片 → 右下角固定 desc panel 換成該卡片的描述 + 同色
 *
 * Slide-in header 處理：透過 lightbox-shell 把 header bars 用 clip-path 收掉
 * （logo 不動），確保 overlay 上只剩 logo 浮在最上
 */

import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { setActiveNavBtn } from '../ui/section-switch-helpers.js';
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { DUR, EASE } from '../ui/motion.js';
import { loadCourses } from './courses-source.js';

const PRIMARY_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

const BFA_GRADES = [
  { key: 'freshman',  en: 'Freshman',  zh: '一年級' },
  { key: 'sophomore', en: 'Sophomore', zh: '二年級' },
  { key: 'junior',    en: 'Junior',    zh: '三年級' },
  { key: 'senior',    en: 'Senior',    zh: '四年級' },
];
const MDES_GRADES = [
  { key: 'year1', en: '1st Year', zh: '一年級' },
  { key: 'year2', en: '2nd Year', zh: '二年級' },
];
function gradesOf(program) {
  return program === 'mdes' ? MDES_GRADES : BFA_GRADES;
}

const TYPES = [
  { key: 'required', en: 'Required', zh: '必修' },
  { key: 'elective', en: 'Elective', zh: '選修' },
];

// 課程資料：Directus curriculum_courses（依 program 分組）為主 + 本地 fallback，見 courses-source.js
async function loadData() {
  return loadCourses();
}

// 與 floating-items.js 一致的 slug 規則；給 deep-link `?item=slug` 比對用
function slugify(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// 把 courses.json 攤成 chips（每個 part 各自一張）
// slug 由「母 course.titleEn」decide 並透傳到所有 parts，配合 floating-items.js 同算法
// 2026-06-09 起不分學期，chip 不再帶 semester（只用 grade + type 分格）
function flattenToChips(courses) {
  const chips = [];
  courses.forEach(course => {
    const parentSlug = slugify(course.titleEn);
    if (Array.isArray(course.parts) && course.parts.length > 0) {
      course.parts.forEach(part => {
        chips.push({
          titleEn: part.titleEn || course.titleEn,
          titleZh: part.titleZh || course.titleZh,
          descriptionEn: part.descriptionEn || course.descriptionEn || '',
          descriptionZh: part.descriptionZh || course.descriptionZh || '',
          type: course.type,
          grade: course.grade,
          slug: parentSlug,
        });
      });
    } else {
      chips.push({
        titleEn: course.titleEn,
        titleZh: course.titleZh,
        descriptionEn: course.descriptionEn || '',
        descriptionZh: course.descriptionZh || '',
        type: course.type,
        grade: course.grade,
        slug: parentSlug,
      });
    }
  });
  return chips;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function pickAccent() {
  return PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)];
}
function pickRotation() {
  // -2 ~ 2 deg，排除 ±0.5；±2° 對 ~232px 寬卡片 corner protrusion ≈ 4px，
  // 兩張上下鄰居共凸 8px，留 16px(cell gap) - 8px = 8px 視覺淨距，不會貼
  let r = 0;
  while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 4 - 2).toFixed(2));
  return r;
}

function renderCard(chip) {
  // 卡片底色不在 render 時固定 — 改由 hover/click 即時挑三原色（applyHoverColor）
  // rotation 同思路：render 時的 rot 存為 dataset.baseRot 當「resting」角度，
  // hover 時 re-roll（applyHoverRot）→ click 時 promote 為新 baseRot → deselect 還原 baseRot
  // data-slug：母 course.titleEn 的 slug，供 `?item=slug` deep-link 比對；
  // 有 parts 的課程兩張卡共用同一 slug（點任一張都會 highlight + 開 slide-in）
  const rot = pickRotation();
  const descEn = escapeAttr(chip.descriptionEn);
  const descZh = escapeAttr(chip.descriptionZh);
  const titleEn = chip.titleEn || '';
  const titleZh = chip.titleZh || '';
  const slugAttr = chip.slug ? ` data-slug="${escapeAttr(chip.slug)}"` : '';
  return `
    <div class="courses-grid-card"
         role="button" tabindex="0"
         aria-label="${escapeAttr((titleEn + ' ' + titleZh).trim())}"
         data-base-rot="${rot}"
         data-desc-en="${descEn}"
         data-desc-zh="${descZh}"${slugAttr}
         style="transform: rotate(${rot}deg);">
      <span class="courses-grid-card-en"><span class="courses-marquee-inner">${titleEn}</span></span>
      <span class="courses-grid-card-zh"><span class="courses-marquee-inner">${titleZh}</span></span>
    </div>`;
}

// 永遠保留 4 個年級欄位置（對齊 BFA layout）；MDES 只填前 N 個有 grades 的 cell，剩下 emit 空 div 佔位
// 不能少 emit cell 否則 grid auto-flow 會把後續 type-label 推到空欄位錯亂整張表
const TOTAL_YEAR_COLS = 4;

// 手機版（2026-07-09 改版）：頂部「年級 btn bar」直接切換（排在 program nav 下方），
// 每個年級一個 block、同時只顯示一個；block 內必修/選修 label 在卡片上方、卡片滿寬直排。
// 年級 btn 沿用 .courses-filter-btn（activities 子濾鏡同款 pill，buttons.css + 三 mode themes 現成）。
// 兩種 DOM 結構共存（CSS media query 切顯示），同 program 的卡片各自存在 → 點擊兩邊都能觸發
// slide-in（bindCardClick 走 panel 級 grid，兩個 grid 都會綁）
function buildMobileHTML(program, courses) {
  const grades = gradesOf(program);
  const realChips = flattenToChips(courses);

  const bar = `
    <div class="courses-mobile-grade-bar">
      ${grades.map((g, i) => `
        <button class="courses-mobile-grade-btn courses-filter-btn whitespace-nowrap${i === 0 ? ' active' : ''}" data-grade="${g.key}">
          <span class="anchor-nav-inner">${g.en} ${g.zh}</span>
        </button>`).join('')}
    </div>`;

  const blocks = grades.map((g, i) => {
    let blockInner = '';
    TYPES.forEach(t => {
      const cellChips = realChips.filter(rc => rc.grade === g.key && rc.type === t.key);
      if (cellChips.length === 0) return;
      blockInner += `
        <div class="courses-mobile-row">
          <div class="courses-mobile-row-label">
            <div class="courses-mobile-row-label-type">
              <span class="courses-mobile-type-en">${t.en}</span>
              <span class="courses-mobile-type-zh">${t.zh}</span>
            </div>
          </div>
          <div class="courses-mobile-cells">${cellChips.map(renderCard).join('')}</div>
        </div>`;
    });
    return `<div class="courses-mobile-grade-block${i === 0 ? '' : ' hidden'}" data-grade="${g.key}">${blockInner}</div>`;
  }).join('');

  return bar + blocks;
}

// ── 手機年級切換 ──
// setActiveNavBtn 共用 helper（accent 底 + 隨機旋轉，與 program btn / activities 濾鏡一致）；
// 灰卡 + 必修/選修 label 比照「桌面切 program」的過場：舊卡 hero clip-reveal 反向收場 → 新卡 clip-reveal 進場
// （translate 獨立屬性＋同步 clip，與全站卡片統一；user 2026-07-09：卡片要保留切換動畫；pill 本身不動）。
// 隱藏 block 的卡片 render 時量不到寬（offsetWidth=0 → marquee bail）→ 每次露出重跑量測
/** @param {HTMLElement} mobileGrid @param {string} gradeKey */
async function activateGrade(mobileGrid, gradeKey, { animate = true } = {}) {
  const doAnim = animate && typeof gsap !== 'undefined' && !prefersReducedMotion();
  // 動畫進行中忽略連點（exit await 期間再切會兩條序列交錯亂 toggle）
  if (doAnim && mobileGrid.dataset.gradeSwitching) return;

  const prev = /** @type {HTMLElement|null} */ (mobileGrid.querySelector('.courses-mobile-grade-block:not(.hidden)'));
  if (doAnim && prev && prev.getAttribute('data-grade') !== gradeKey) {
    // label 各年級文字相同（Required/Elective）且 sticky 釘同位置：跟著收再進會看成「同一個 tag 渲染兩次」
    // → 切年級只動卡片，label 原地不動（user 2026-07-21）
    const prevItems = [...prev.querySelectorAll('.courses-grid-card')];
    if (prevItems.length) {
      mobileGrid.dataset.gradeSwitching = '1';
      await new Promise(resolve => {
        gsap.killTweensOf(prevItems);
        // hero 式 clip-reveal 反向：fromTo 顯式起點 NAV_CHIP_SHOWN（reveal 後 translate/clip 已 none，直接 to 會 snap）
        // → 各自四方向隨機（pickNavDir() 無 el）滑出＋同步 clip
        const hid = prevItems.map(el => navChipHidden(el, pickNavDir()));
        gsap.fromTo(prevItems,
          { ...NAV_CHIP_SHOWN },
          { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.fast, ease: 'cubic-bezier(0.25, 0, 0, 1)', overwrite: true, onComplete: resolve }
        );
      });
      delete mobileGrid.dataset.gradeSwitching;
    }
  }

  setActiveNavBtn(mobileGrid.querySelectorAll('.courses-mobile-grade-btn'), gradeKey, 'data-grade');
  /** @type {HTMLElement|null} */ let shown = null;
  mobileGrid.querySelectorAll('.courses-mobile-grade-block').forEach(b => {
    const on = b.getAttribute('data-grade') === gradeKey;
    b.classList.toggle('hidden', !on);
    if (on) shown = /** @type {HTMLElement} */ (b);
  });
  if (doAnim && shown) {
    // 保險：entrance 的 gsap.set 可能把這個 block 的 label 留在 hidden 態（reveal 未播就切年級）→ 直接清成可見
    gsap.set(shown.querySelectorAll('.courses-mobile-row-label'), { clearProps: 'clipPath,translate' });
    const items = [...shown.querySelectorAll('.courses-grid-card')];
    if (items.length) {
      gsap.killTweensOf(items);
      // 同 program 切換 reveal：每張四方向隨機（pickNavDir() 無 el）的 hidden 態 → 無 stagger 同時收到 NAV_CHIP_SHOWN
      const hid = items.map(el => navChipHidden(el, pickNavDir()));
      gsap.fromTo(items,
        { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate },
        { ...NAV_CHIP_SHOWN, duration: DUR.base, ease: 'cubic-bezier(0.25, 0, 0, 1)', overwrite: true, clearProps: 'clipPath,translate' }
      );
    }
  }
  const panel = mobileGrid.closest('.courses-panel');
  if (panel) requestAnimationFrame(() => runMarqueeOverflow(/** @type {HTMLElement} */ (panel)));
}

// deep-link（?item=slug）目標卡片可能在非 active 年級 block 內（隱藏 → 量測/highlight 找不到可見卡）
// → 先把該年級切成 active。桌面 mobile grid display:none，切了無視覺影響、無害。
export function ensureMobileGradeForSlug(program, slug) {
  if (!slug) return;
  const panel = document.getElementById(`panel-${program}`);
  const mobileGrid = /** @type {HTMLElement|null} */ (panel ? panel.querySelector('.courses-grid-mobile') : null);
  if (!mobileGrid) return;
  const card = mobileGrid.querySelector(`.courses-grid-card[data-slug="${CSS.escape(slug)}"]`);
  const block = card ? card.closest('.courses-mobile-grade-block') : null;
  if (!block || !block.classList.contains('hidden')) return;
  activateGrade(mobileGrid, block.getAttribute('data-grade') || '', { animate: false });
}

function buildHTML(program, courses) {
  const grades = gradesOf(program);
  const realChips = flattenToChips(courses);

  let html = '';

  // year cell index 1-based class（保留以便日後重啟 is-active gap reduction trick；目前 v9 沒用）
  const yearCls = (idx) => `courses-grid-col-year-${idx + 1}`;

  // Row 0: 全列 sticky cover bar 包住 corners + 年級表頭。Cover 是 outer grid item
  // (col 1/-1 row 1)，內部自己跑 inner grid（同 template 對齊 outer cols）。
  // Cover 提供整列 bg + ::before 向上 200px 蓋住 cards/labels scroll 過 sticky 後的露出。
  // year-header 不再各自 sticky，純粹當 cover 內的文字佔位
  let coverInnerHtml = '';
  // 只剩一個 label 欄（type-col：必修/選修 + 學期分隔 label）；原 sem-col 已移除
  coverInnerHtml += '<div class="courses-grid-corner courses-grid-corner--type"></div>';
  for (let i = 0; i < TOTAL_YEAR_COLS; i++) {
    const g = grades[i];
    if (g) {
      // header 外層 overflow:hidden 當 yPercent slide-in 遮罩；inner 是 yPercent 動畫目標（仿 hero-title-wrapper pattern）
      coverInnerHtml += `
        <div class="courses-grid-col-header ${yearCls(i)}">
          <div class="courses-grid-col-header-inner">
            <span class="courses-grid-col-en">${g.en}</span>
            <span class="courses-grid-col-zh">${g.zh}</span>
          </div>
        </div>`;
    } else {
      coverInnerHtml += `<div class="courses-grid-col-header ${yearCls(i)}"></div>`;
    }
  }
  html += `<div class="courses-grid-row-cover">${coverInnerHtml}</div>`;

  // 2026-06-09 起不分學期 → 一個 program 只有一條必修列 + 一條選修列（直接當 .courses-grid 子項，
  // subgrid 繼承外層欄）。type-label sticky containing block = 該 row，row 到底時 label 跟著上去。
  // 每列：col 1 type-label（必修/選修）+ 4 個年級 cell（grade × type filter）。
  const buildTypeRow = (typeMeta, rowClass) => {
    let inner = `
      <div class="courses-grid-type-label">
        <div class="courses-grid-type-label-inner">
          <span class="courses-grid-type-en">${typeMeta.en}</span>
          <span class="courses-grid-type-zh">${typeMeta.zh}</span>
        </div>
      </div>`;
    for (let i = 0; i < TOTAL_YEAR_COLS; i++) {
      const g = grades[i];
      const cellChips = g
        ? realChips.filter(rc => rc.grade === g.key && rc.type === typeMeta.key)
        : [];
      inner += `<div class="courses-grid-cell ${yearCls(i)}">${cellChips.map(renderCard).join('')}</div>`;
    }
    return `<div class="${rowClass}">${inner}</div>`;
  };

  html += buildTypeRow(TYPES[0], 'courses-required-row');
  html += buildTypeRow(TYPES[1], 'courses-elective-row');

  return html;
}

// ===== Slide-in modal（v9 取代 desc-column；仿 #faculty-slide-in pattern） =====
// 點卡片 → 從右滑入 panel + dim overlay；overlay/close-btn/Esc 關閉。
// body.overflow:hidden 鎖捲動，close 還原。GSAP timeline 控動畫。

// 無障礙 modal：記住開啟課程詳情的觸發元素，關閉時把焦點還回去
let coursesReturnFocus = /** @type {HTMLElement|null} */ (null);
function getSlideIn()      { return document.getElementById('courses-slide-in'); }
function getSlidePanel()   { return document.getElementById('courses-detail-panel'); }
function getSlideOverlay() { return document.getElementById('courses-overlay'); }

function openCourseSlideIn(card) {
  const slideIn = getSlideIn();
  const panel = getSlidePanel();
  const overlay = getSlideOverlay();
  if (!slideIn || !panel || !overlay) return;

  // Populate（從 marquee inner 讀 textContent，避免拿到雙 .marquee-copy 的串接版本）
  const titleEnSrc = card.querySelector('.courses-grid-card-en .courses-marquee-inner .marquee-copy')
                  || card.querySelector('.courses-grid-card-en .courses-marquee-inner');
  const titleZhSrc = card.querySelector('.courses-grid-card-zh .courses-marquee-inner .marquee-copy')
                  || card.querySelector('.courses-grid-card-zh .courses-marquee-inner');
  const titleEn = titleEnSrc ? titleEnSrc.textContent || '' : '';
  const titleZh = titleZhSrc ? titleZhSrc.textContent || '' : '';
  const descEn  = card.dataset.descEn || '';
  const descZh  = card.dataset.descZh || '';
  // panel 主色 = 卡片當下底色（hover 留下的隨機色 → click 後同色 active + slide-in，視覺連續）
  const accent  = card.dataset.currentColor || '';

  const enT = document.getElementById('courses-detail-title-en');
  const zhT = document.getElementById('courses-detail-title-zh');
  const enD = document.getElementById('courses-detail-desc-en');
  const zhD = document.getElementById('courses-detail-desc-zh');
  if (enT) enT.textContent = titleEn;
  if (zhT) zhT.textContent = titleZh;
  if (enD) enD.textContent = descEn;
  if (zhD) zhD.textContent = descZh;

  // 標題旋轉：比照 faculty slide-in 名字（faculty-slide-in.js）——±2~4° 隨機（課程名長、旋轉太多不好看，
  // user 2026-08-12 收斂）、每次開重隨機、EN/ZH 共用同一角當一體；left center + fit-content 讓 rotate 繞 content 寬度不撐父寬
  const titleDeg = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
  [enT, zhT].forEach(el => {
    if (!el) return;
    el.style.transform = `rotate(${titleDeg}deg)`;
    el.style.transformOrigin = 'left center';
    el.style.display = 'block';
    el.style.width = 'fit-content';
  });

  // desc 貼「旋轉後 title 實際底邊」而非未旋轉 layout 底：正角旋轉讓 ZH 標題右下角下沉、吃掉桌面 flex gap（md:gap-lg 2rem）。
  // 量 ZH 旋轉後 bbox 底 − sticky 容器 layout 底 = 下沉量，補進 desc margin-top → 視覺 gap 仍 = 旋轉底 + 該 flex gap。
  // 只桌面（gap-lg 生效）；手機/矮橫向 title 自帶 padding-bottom，且 inline margin 會蓋掉 landscape override → 清空。
  const descWrap = panel.querySelector('.courses-detail-desc-wrapper');
  if (descWrap) {
    const isDesktopLayout = window.innerWidth >= 768
      && !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    const sticky = zhT && zhT.closest('.courses-detail-title-sticky');
    if (isDesktopLayout && sticky) {
      const dip = zhT.getBoundingClientRect().bottom - sticky.getBoundingClientRect().bottom;
      descWrap.style.marginTop = dip > 0.5 ? `${dip}px` : '';
    } else {
      descWrap.style.marginTop = '';
    }
  }

  const panelBg = accent || 'white';
  panel.style.backgroundColor = panelBg;

  // Show
  coursesReturnFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  slideIn.classList.remove('invisible', 'pointer-events-none');
  slideIn.classList.add('pointer-events-auto');
  // 桌面黑方塊返回鍵：每次開重隨機旋轉（角度套外層遮罩）+ inner 平移做 hero clip-reveal（比照 header bars：外層 overflow:clip 當遮罩、inner 從下方滑入被剪裁）
  const backBtn = document.getElementById('courses-back-btn-desktop');
  let backInner = null;
  if (backBtn) {
    backBtn.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
    if (typeof gsap !== 'undefined' && !prefersReducedMotion() && window.innerWidth >= 768) {
      backInner = backBtn.querySelector('.slide-in-back-square-inner');
      if (backInner) gsap.set(backInner, { yPercent: 100 });
    }
  }
  requestAnimationFrame(() => panel.focus({ preventScroll: true }));

  // freeze 底層捲動 + 凍結在原位（不跳頂部）+ header bars clip-path 收掉，全由 lightbox-shell 統一處理
  // （內含 save/restore scrollTop，對付本頁 html overflow-x:clip 被 overflow-y:hidden 重算成 hidden
  //   導致的 scroll reset；slide-in 與全螢幕 lightbox 共用同一套，不分流）
  enterLightboxMode();
  const htmlEl = document.documentElement;

  // 取得初始背景色與暗化目標色，讓 GSAP 分段接管 --slide-bg-color 的漸變
  let startBg = getComputedStyle(htmlEl).backgroundColor;
  if (startBg === 'rgba(0, 0, 0, 0)' || startBg === 'transparent') {
    startBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#ffffff';
  }
  const dimBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#333333';

  htmlEl.style.setProperty('--slide-bg-color', startBg);
  htmlEl.classList.add('has-slide-in');

  if (typeof gsap !== 'undefined') {
    const tl = gsap.timeline()
      .to(overlay, { opacity: 0.8, duration: DUR.fast }, 0)
      .to(htmlEl, { '--slide-bg-color': dimBg, duration: DUR.fast }, 0)
      .to(panel, { x: '0%', duration: DUR.medium, ease: EASE.enter }, 0.3)
      .to(htmlEl, { '--slide-bg-color': panelBg, duration: DUR.medium, ease: EASE.enter }, 0.3);
    // 返回鍵跟 panel 同步 clip-reveal
    if (backInner) {
      tl.fromTo(backInner, { yPercent: 100 },
        { yPercent: 0, duration: DUR.medium, ease: EASE.enter, clearProps: 'transform' }, 0.3);
    }
  } else {
    overlay.style.opacity = '0.8';
    htmlEl.style.setProperty('--slide-bg-color', panelBg);
    panel.style.transform = 'translateX(0%)';
  }
}

export function closeCourseSlideIn() {
  // 確保關閉時清除 activeCard 狀態與角度（處理 ESC 或點擊 overlay 關閉的情境）
  if (activeCard) {
    activeCard.style.background = '';
    delete activeCard.dataset.currentColor;
    const baseRot = activeCard.dataset.baseRot || '0';
    activeCard.style.transform = `rotate(${baseRot}deg)`;
    activeCard = null;
  }

  const slideIn = getSlideIn();
  const panel = getSlidePanel();
  const overlay = getSlideOverlay();
  if (!slideIn || !panel || !overlay) return;

  // 如果面板已經是隱藏狀態，直接 return，避免切換 program 分頁時觸發多餘的 CSS 變化
  if (slideIn.classList.contains('invisible')) return;

  // header bars clip-path 進場（logo 不動）+ 解除 body.lightbox-open。
  // deferHeaderShow：slide-in 是往右滑出，header bars 立即揭露會白 bar 冒在頂部蓋住離場中的 panel → 延後到 panel 走完
  exitLightboxMode({ deferHeaderShow: true });

  const htmlEl = document.documentElement;
  
  // 預先取得還原後的目標背景色
  htmlEl.classList.remove('has-slide-in');
  let targetBg = getComputedStyle(htmlEl).backgroundColor;
  if (targetBg === 'rgba(0, 0, 0, 0)' || targetBg === 'transparent') {
    targetBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#ffffff';
  }
  const dimBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#333333';
  htmlEl.classList.add('has-slide-in');

  const backInner = document.querySelector('#courses-back-btn-desktop .slide-in-back-square-inner');
  if (typeof gsap !== 'undefined') {
    const tl = gsap.timeline()
      .to(panel, { x: '110%', duration: DUR.medium, ease: EASE.exit }, 0)
      .to(htmlEl, { '--slide-bg-color': dimBg, duration: DUR.medium, ease: EASE.exit }, 0)
      .to(overlay, { opacity: 0, duration: DUR.fast }, 0.5)
      .to(htmlEl, { '--slide-bg-color': targetBg, duration: DUR.fast }, 0.5);
    // 返回鍵跟 panel 同步 clip-reveal 退場（inner 滑回下方被遮罩剪掉；panel 退場 offset 0）
    if (backInner && !prefersReducedMotion() && window.innerWidth >= 768) {
      tl.to(backInner, { yPercent: 100, duration: DUR.medium, ease: EASE.exit }, 0);
    }
    tl.call(() => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        panel.style.backgroundColor = '';
        htmlEl.classList.remove('has-slide-in');
        htmlEl.style.removeProperty('--slide-bg-color');
        if (coursesReturnFocus) { coursesReturnFocus.focus({ preventScroll: true }); coursesReturnFocus = null; }
      });
  } else {
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(110%)';
    setTimeout(() => {
      slideIn.classList.add('invisible', 'pointer-events-none');
      slideIn.classList.remove('pointer-events-auto');
      panel.style.backgroundColor = '';
      htmlEl.classList.remove('has-slide-in');
      htmlEl.style.removeProperty('--slide-bg-color');
    }, 500);
  }
}

let _slideInBound = false;
function ensureSlideInClose() {
  if (_slideInBound) return;
  _slideInBound = true;
  // overlay 點擊用 document delegation：SPA 切頁時 <main> 會被換掉，原本綁在
  // overlay element 上的 listener 隨 element 一起消失，flag 又設過 true → 切回來時
  // 新 overlay 沒監聽 = 點空白關不掉。改 document 級 + e.target.id 比對才能跨 SPA 存活
  // 手機返回鍵 #courses-back-btn-mobile 同 pattern（closest 兜 icon 點到 span 的情況）
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const isOverlay = t.id === 'courses-overlay';
    const isBackBtn = !!t.closest('#courses-back-btn-mobile') || !!t.closest('#courses-back-btn-desktop');
    if (!isOverlay && !isBackBtn) return;
    const slideIn = getSlideIn();
    if (!slideIn || slideIn.classList.contains('invisible')) return;
    closeCourseSlideIn();
  });
  document.addEventListener('keydown', (e) => {
    const slideIn = getSlideIn();
    if (e.key === 'Escape' && slideIn && !slideIn.classList.contains('invisible')) {
      closeCourseSlideIn();
    }
  });
}

// ===== Card click → 選取狀態 + 開 slide-in =====
/** @type {HTMLElement|null} */
let activeCard = null;

// hover/click 共用：隨機挑三原色之一套到卡片底色 + 存到 dataset.currentColor
// dataset.currentColor 是 hover→click 視覺連續的單一 source of truth：
//   hover 時 set，click 時讀（給 slide-in panel 同色），mouseleave/deselect 時清
function applyHoverColor(card) {
  const color = pickAccent();
  card.style.background = color;
  card.dataset.currentColor = color;
}

// hover 時挑新隨機 rotation，存到 dataset.hoverRot
function applyHoverRot(card) {
  const rot = pickRotation();
  card.style.transform = `rotate(${rot}deg)`;
  card.dataset.hoverRot = String(rot);
}

// mouseleave / deselect 還原到 baseRot（render 時設定，click 時更新為 hover-rot）
function restoreBaseRot(card) {
  const baseRot = card.dataset.baseRot || '0';
  card.style.transform = `rotate(${baseRot}deg)`;
  delete card.dataset.hoverRot;
}

function selectCard(card) {
  if (activeCard && activeCard !== card) {
    activeCard.style.background = '';
    delete activeCard.dataset.currentColor;
    // 之前 active 卡片離開 active state — 把當下角度（hover-rot 或 baseRot）保留為新 baseRot
    if (activeCard.dataset.hoverRot) {
      activeCard.dataset.baseRot = activeCard.dataset.hoverRot;
      delete activeCard.dataset.hoverRot;
    }
  }
  activeCard = card;
  // 沿用 hover 留下的色/角度；無則即時挑（mobile tap、無 hover 進入直接點等情境）
  if (!card.dataset.currentColor) applyHoverColor(card);
  if (!card.dataset.hoverRot) applyHoverRot(card);
  // promote hover-rot → baseRot：click 鎖在 hover 當下角度，deselect 後還原此角度
  card.dataset.baseRot = card.dataset.hoverRot;
  delete card.dataset.hoverRot;
  openCourseSlideIn(card);
}

// SPA 離開 courses 時呼叫：清掉 activeCard ref（避免下次回 courses 時 ref 還指向已被
// router.innerHTML swap 掉的 detached node，後續 deselectActiveCard 對 dead element 操作邏輯混亂）
export function resetCoursesMapState() {
  activeCard = null;
}

// deep-link 找卡：同 slug 在桌面 .courses-grid 與手機 .courses-grid-mobile 各有一張（桌面在前），
// querySelector 永遠拿桌面那張 → 手機上 highlight 套在 display:none 的卡上看不見（user 2026-06-12
// 報「沒先 highlight 就出 slider」）。改挑「可見」那張（offsetParent≠null，同 section-switch 判法）。
function visibleCardBySlug(panel, slug) {
  let first = null;
  for (const c of panel.querySelectorAll(`.courses-grid-card[data-slug="${CSS.escape(slug)}"]`)) {
    const el = /** @type {HTMLElement} */ (c);
    if (!first) first = el;
    if (el.offsetParent !== null) return el;
  }
  return first;
}

// 給 `?item=slug` deep-link 用：在指定 program panel 內找 data-slug 相符的卡片並 selectCard
// 有 parts 的課程兩張卡共用 slug → 取可見 grid 內的第一張即可
// 找不到回傳 false 讓呼叫端可 fallback（例如該 slug 在別的 program）
export function selectCardBySlugInPanel(program, slug) {
  if (!slug) return false;
  const panel = document.getElementById(`panel-${program}`);
  if (!panel) return false;
  const card = visibleCardBySlug(panel, slug);
  if (!card) return false;
  selectCard(card);
  return true;
}

// deep-link 用：只 highlight 卡片（套 accent 底色 + hover 角度），不開 slide-in。
// 給「等卡片 reveal 完 → highlight → 隔一拍才開 slide-in」序列用（dataset.currentColor 會被隨後的
// selectCardBySlugInPanel 沿用 → highlight 色 = slide-in panel 色，視覺連續）。回傳卡片或 null。
export function highlightCardBySlugInPanel(program, slug) {
  if (!slug) return null;
  const panel = document.getElementById(`panel-${program}`);
  if (!panel) return null;
  const card = visibleCardBySlug(panel, slug);
  if (!card) return null;
  applyHoverColor(card);
  applyHoverRot(card);
  return card;
}

export function deselectActiveCard() {
  if (activeCard) {
    const card = activeCard;
    const wasHovered = card.matches(':hover');
    card.style.background = '';
    delete card.dataset.currentColor;
    activeCard = null;
    // 點 active 收回時 cursor 還在卡片上 → 立即重 roll hover 色 + 角度
    // 否則還原 baseRot（= 上次 click 時的 rot，rotation 鎖在那邊）
    if (wasHovered) {
      applyHoverColor(card);
      applyHoverRot(card);
    } else {
      restoreBaseRot(card);
    }
  }
  closeCourseSlideIn();
}

function bindCardClick(panelEl) {
  // 綁在 panel 級而非 .courses-grid，這樣 desktop grid + mobile grid 兩個 sibling 都涵蓋
  if (panelEl.dataset.clickBound) return;
  panelEl.dataset.clickBound = '1';

  panelEl.addEventListener('click', (e) => {
    const t = e.target;
    const card = /** @type {HTMLElement|null} */ (
      t instanceof Element ? t.closest('.courses-grid-card') : null
    );
    if (!card) return;
    // 點同一張 → 收回 + close；點別張 → swap content
    if (card === activeCard) {
      deselectActiveCard();
    } else {
      selectCard(card);
    }
  });

  // 無障礙：卡片是 role=button tabindex=0 的 <div>（template），Enter/Space 觸發 → 走上面同一條 click delegation
  panelEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    const card = t instanceof Element ? t.closest('.courses-grid-card') : null;
    if (!card) return;
    e.preventDefault();
    /** @type {HTMLElement} */ (card).click();
  });

  ensureSlideInClose();
}

// 卡片 hover：每次進入隨機挑三原色 + 隨機旋轉，離開還原 baseRot
// active card（已點開）不參與 hover 變色/旋轉，保留 click 時 promote 的 baseRot
function bindCardHover(panelEl) {
  /** @type {NodeListOf<HTMLElement>} */
  const cards = panelEl.querySelectorAll('.courses-grid-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      if (card === activeCard) return;
      applyHoverColor(card);
      applyHoverRot(card);
    });
    card.addEventListener('mouseleave', () => {
      if (card === activeCard) return;
      card.style.background = '';
      delete card.dataset.currentColor;
      restoreBaseRot(card);
    });
  });
}

// 卡片標題 hover marquee — 仿 library.css runMarqueeOverflow pattern：
//   1) 量 .courses-marquee-inner.scrollWidth 超出父層 row.offsetWidth 多少
//   2) 超出 → row 加 .is-overflow + inner 內容換成兩份 .marquee-copy（seamless loop）
//   3) 量 copyWidth + 設 --marquee-distance / --marquee-duration（80px/s, min 3s）
//   4) CSS hover 時 animation translateX(0) → translateX(-copyWidth) 無接縫接到第二份
// 偵測一次性，render 後跑（panel 已 visible 才量得到正確寬度，所以 panel hidden 不能跑）
// 使用共用 utility applyMarqueeOverflow（取代 atlas/courses-map/library-panels 三處重複實作）
function runMarqueeOverflow(panelEl) {
  applyMarqueeOverflow(panelEl, '.courses-grid-card-en, .courses-grid-card-zh', '.courses-marquee-inner');
}

/**
 * 渲染指定 program 的課程表（idempotent；同一 panel 只跑一次）。
 * 由 courses-section-switch.js 在切換到該 program 時呼叫。
 */
export async function renderCoursesGrid(program) {
  const panel = document.getElementById(`panel-${program}`);
  if (!panel) return;
  if (panel.dataset.gridRendered) return;
  panel.dataset.gridRendered = '1';

  const data = await loadData();
  const courses = data[program];
  if (!courses) return;

  const grid = /** @type {HTMLElement|null} */ (panel.querySelector('.courses-grid'));
  if (!grid) return;

  // 永遠 4 個年級欄保持 BFA layout 比例；MDES 只填前 2 cells（year1, year2），cols 5-6 留空
  // 這樣 MDES 的 1st/2nd year 欄寬跟 BFA 的 freshman/sophomore 對齊，視覺一致
  grid.style.setProperty('--year-cols', '4');
  grid.innerHTML = buildHTML(program, courses);

  // Mobile-only structure：年級為外層分組（從上到下排列），由 CSS 控制顯示
  // 渲染進 .courses-grid 的 sibling .courses-grid-mobile，bindCardClick/Hover 對 panel 級綁定會涵蓋
  let mobileGrid = /** @type {HTMLElement|null} */ (panel.querySelector('.courses-grid-mobile'));
  if (!mobileGrid) {
    mobileGrid = document.createElement('div');
    mobileGrid.className = 'courses-grid-mobile';
    grid.parentElement?.insertBefore(mobileGrid, grid.nextSibling);
  }
  mobileGrid.innerHTML = buildMobileHTML(program, courses);

  // 年級 bar：初始 active 套 accent 樣式 + 點擊切換（delegation，一次性）
  const firstGradeBtn = mobileGrid.querySelector('.courses-mobile-grade-btn');
  if (firstGradeBtn) {
    const mg = mobileGrid;
    // 初始不動畫（進場 reveal 由 section-switch 統一跑）
    activateGrade(mg, firstGradeBtn.getAttribute('data-grade') || '', { animate: false });
    if (!mg.dataset.gradeBound) {
      mg.dataset.gradeBound = '1';
      mg.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('.courses-mobile-grade-btn') : null);
        if (!btn || btn.classList.contains('active')) return;
        // 年級 bar 是水平 scroll strip：點到的 btn 可能被捲到部分出界 → 捲回讓它靠左對齊頁面內容左緣
        // （同 program bar 的對齊，courses-section-switch.js）。只動 bar 自己 scrollLeft，不連帶垂直捲動。
        const bar = /** @type {HTMLElement|null} */ (btn.closest('.courses-mobile-grade-bar'));
        if (bar) {
          const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
          const delta = btn.getBoundingClientRect().left - (bar.getBoundingClientRect().left + pad);
          bar.scrollTo({ left: bar.scrollLeft + delta, behavior: 'smooth' });
        }
        activateGrade(mg, btn.getAttribute('data-grade') || '');
      });
    }
  }

  bindCardClick(panel);
  bindCardHover(panel);
  // 偵測 marquee：render 後 panel 已 visible 才能量到正確 offsetWidth
  runMarqueeOverflow(panel);

  // 轉向重量（user 2026-07-04 轉向自癒）：桌面/手機兩套 grid 並存、只有 render 當下「可見」那套被量過
  // （隱藏套 row offsetWidth=0 → applyMarqueeOverflow bail）。轉向後換另一套顯示 → 沒 marquee 或帶舊 dual-copy
  // → 跨矮橫向 gate 時重跑（自帶 reset + 0 寬 bail，兩套各自收斂到正確態）。cleanup 由 page-cleanup 統一解綁。
  const rotateGateMq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
  const onRotateGate = () => requestAnimationFrame(() => {
    if (!panel.isConnected) return;
    // 表頭 slide 殘留：直向時 program 切換動畫照樣對「隱藏的桌面表頭」跑，inner 停在 ±100%
    // → 轉向後年級/必修選修標籤偏移或被遮罩切掉（實測 Elective 左移 -100% 被切）→ 清掉
    if (typeof gsap !== 'undefined') {
      const headersInner = panel.querySelectorAll('.courses-grid-col-header-inner, .courses-grid-type-label-inner');
      if (headersInner.length) {
        gsap.killTweensOf(headersInner);
        gsap.set(headersInner, { clearProps: 'transform' });
      }
    }
    runMarqueeOverflow(panel);
  });
  rotateGateMq.addEventListener('change', onRotateGate);
  registerPageCleanup(() => rotateGateMq.removeEventListener('change', onRotateGate));
}
