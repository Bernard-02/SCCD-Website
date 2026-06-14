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

// 手機版改成年級為外層分組（一年級從上到下到四年級），每個年級內列出
// 必修/選修 兩列 chips（不分學期）。桌面版維持 buildHTML 的橫排年級結構。
// 兩種 DOM 結構共存（CSS media query 切顯示），同 program 的卡片各自存在 → 點擊兩邊都能觸發
// slide-in（bindCardClick 走 panel 級 grid，兩個 grid 都會綁）
function buildMobileHTML(program, courses) {
  const grades = gradesOf(program);
  const realChips = flattenToChips(courses);

  let html = '';
  grades.forEach(g => {
    let blockInner = `
      <div class="courses-mobile-grade-header">
        <span class="courses-mobile-grade-en">${g.en}</span>
        <span class="courses-mobile-grade-zh">${g.zh}</span>
      </div>`;

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

    html += `<div class="courses-mobile-grade-block">${blockInner}</div>`;
  });

  return html;
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

  const panelBg = accent || 'white';
  panel.style.backgroundColor = panelBg;

  // Show
  slideIn.classList.remove('invisible', 'pointer-events-none');
  slideIn.classList.add('pointer-events-auto');

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
    gsap.timeline()
      .to(overlay, { opacity: 0.8, duration: DUR.fast }, 0)
      .to(htmlEl, { '--slide-bg-color': dimBg, duration: DUR.fast }, 0)
      .to(panel, { x: '0%', duration: DUR.medium, ease: EASE.enter }, 0.3)
      .to(htmlEl, { '--slide-bg-color': panelBg, duration: DUR.medium, ease: EASE.enter }, 0.3);
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

  // header bars clip-path 進場（logo 不動）+ 解除 body.lightbox-open
  exitLightboxMode();

  const htmlEl = document.documentElement;
  
  // 預先取得還原後的目標背景色
  htmlEl.classList.remove('has-slide-in');
  let targetBg = getComputedStyle(htmlEl).backgroundColor;
  if (targetBg === 'rgba(0, 0, 0, 0)' || targetBg === 'transparent') {
    targetBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#ffffff';
  }
  const dimBg = htmlEl.classList.contains('mode-inverse') ? '#000000' : '#333333';
  htmlEl.classList.add('has-slide-in');

  if (typeof gsap !== 'undefined') {
    gsap.timeline()
      .to(panel, { x: '110%', duration: DUR.medium, ease: EASE.exit }, 0)
      .to(htmlEl, { '--slide-bg-color': dimBg, duration: DUR.medium, ease: EASE.exit }, 0)
      .to(overlay, { opacity: 0, duration: DUR.fast }, 0.5)
      .to(htmlEl, { '--slide-bg-color': targetBg, duration: DUR.fast }, 0.5)
      .call(() => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        panel.style.backgroundColor = '';
        htmlEl.classList.remove('has-slide-in');
        htmlEl.style.removeProperty('--slide-bg-color');
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
    const isBackBtn = !!t.closest('#courses-back-btn-mobile');
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

  bindCardClick(panel);
  bindCardHover(panel);
  // 偵測 marquee：render 後 panel 已 visible 才能量到正確 offsetWidth
  runMarqueeOverflow(panel);
}
