/**
 * Courses Grid Module
 * 課程表 inline 渲染（取代舊版 lightbox 課程地圖）
 *
 * Layout（每個 program panel 一張表）：
 *                              | 1年級 | 2年級 | 3年級 | 4年級
 *   上學期 | 必修               | cells...
 *           選修
 *   下學期 | 必修
 *           選修
 *
 * 互動：hover 卡片 → 右下角固定 desc panel 換成該卡片的描述 + 同色
 */

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

const SEMESTERS = [
  { key: 'upper', en: 'Fall',   zh: '上學期' },
  { key: 'lower', en: 'Spring', zh: '下學期' },
];

const TYPES = [
  { key: 'required', en: 'Required', zh: '必修' },
  { key: 'elective', en: 'Elective', zh: '選修' },
];

// 維持 layout 密度的 placeholder 池（真實課表寫進 WP 後可逐步取代）
const TARGET_REQUIRED_PER_CELL = 3;
const ELECTIVE_RANGE = [4, 8];
const PLACEHOLDER_POOL = [
  { titleEn: 'Visual Communication', titleZh: '視覺傳達' },
  { titleEn: 'Interactive Design',   titleZh: '互動設計' },
  { titleEn: 'Branding Workshop',    titleZh: '品牌工作坊' },
  { titleEn: 'Typography Studio',    titleZh: '字體實務' },
  { titleEn: 'Motion Graphics',      titleZh: '動態設計' },
  { titleEn: 'UI/UX Lab',            titleZh: '使用者介面實驗' },
  { titleEn: 'Photography',          titleZh: '攝影實務' },
  { titleEn: 'Editorial Design',     titleZh: '編輯設計' },
  { titleEn: 'Information Design',   titleZh: '資訊設計' },
  { titleEn: 'Creative Coding',      titleZh: '創意程式' },
  { titleEn: 'Service Design',       titleZh: '服務設計' },
  { titleEn: 'Packaging Studio',     titleZh: '包裝實務' },
  { titleEn: 'Illustration',         titleZh: '插畫' },
  { titleEn: 'Color Theory',         titleZh: '色彩學' },
  { titleEn: 'Design Research',      titleZh: '設計研究' },
  { titleEn: 'Generative Art',       titleZh: '生成藝術' },
  { titleEn: 'Sound Design',         titleZh: '聲音設計' },
  { titleEn: '3D Modeling',          titleZh: '3D 建模' },
  { titleEn: 'Speculative Design',   titleZh: '推測設計' },
  { titleEn: 'Critical Studies',     titleZh: '設計批評' },
];
const PLACEHOLDER_DESC_EN = 'Sample course description for layout preview.';
const PLACEHOLDER_DESC_ZH = '此為佈局預覽用之範例課程說明。';

let _coursesData = null;
async function loadData() {
  if (_coursesData) return _coursesData;
  const res = await fetch('/data/courses.json');
  _coursesData = await res.json();
  return _coursesData;
}

// 從課程名（中英）推測學期：II/二/下 → 下學期；I/一/上 → 上學期；不明默認上
function detectSemester(titleEn, titleZh) {
  const t = `${titleEn || ''} ${titleZh || ''}`;
  if (/\bII\b|（二）|\(二\)|（下）|\(下\)/.test(t)) return 'lower';
  if (/\bI\b(?!I)|（一）|\(一\)|（上）|\(上\)/.test(t)) return 'upper';
  return 'upper';
}

// 把 courses.json 攤成 chips（每個 part 各自一張）
// semester 優先順序：part.semester > course.semester > 從標題偵測
function flattenToChips(courses) {
  const chips = [];
  courses.forEach(course => {
    if (Array.isArray(course.parts) && course.parts.length > 0) {
      course.parts.forEach(part => {
        chips.push({
          titleEn: part.titleEn || course.titleEn,
          titleZh: part.titleZh || course.titleZh,
          descriptionEn: part.descriptionEn || course.descriptionEn || '',
          descriptionZh: part.descriptionZh || course.descriptionZh || '',
          type: course.type,
          grade: course.grade,
          semester: part.semester || course.semester || detectSemester(part.titleEn, part.titleZh),
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
        semester: course.semester || detectSemester(course.titleEn, course.titleZh),
      });
    }
  });
  return chips;
}

let _placeholderCursor = 0;
function takePlaceholders(n, gradeKey, semKey, type) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = PLACEHOLDER_POOL[_placeholderCursor % PLACEHOLDER_POOL.length];
    _placeholderCursor++;
    out.push({
      titleEn: p.titleEn,
      titleZh: p.titleZh,
      descriptionEn: PLACEHOLDER_DESC_EN,
      descriptionZh: PLACEHOLDER_DESC_ZH,
      type,
      grade: gradeKey,
      semester: semKey,
      _placeholder: true,
    });
  }
  return out;
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
  const rot = pickRotation();
  const descEn = escapeAttr(chip.descriptionEn);
  const descZh = escapeAttr(chip.descriptionZh);
  const titleEn = chip.titleEn || '';
  const titleZh = chip.titleZh || '';
  return `
    <div class="courses-grid-card"
         data-base-rot="${rot}"
         data-desc-en="${descEn}"
         data-desc-zh="${descZh}"
         style="transform: rotate(${rot}deg);">
      <span class="courses-grid-card-en"><span class="courses-marquee-inner">${titleEn}</span></span>
      <span class="courses-grid-card-zh"><span class="courses-marquee-inner">${titleZh}</span></span>
    </div>`;
}

// 永遠保留 4 個年級欄位置（對齊 BFA layout）；MDES 只填前 N 個有 grades 的 cell，剩下 emit 空 div 佔位
// 不能少 emit cell 否則 grid auto-flow 會把後續 sem-label/type-label 推到空欄位錯亂整張表
const TOTAL_YEAR_COLS = 4;

function buildHTML(program, courses) {
  _placeholderCursor = 0;
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
  coverInnerHtml += '<div class="courses-grid-corner courses-grid-corner--sem"></div>';
  coverInnerHtml += '<div class="courses-grid-corner courses-grid-corner--type"></div>';
  for (let i = 0; i < TOTAL_YEAR_COLS; i++) {
    const g = grades[i];
    if (g) {
      coverInnerHtml += `
        <div class="courses-grid-col-header ${yearCls(i)}">
          <span class="courses-grid-col-en">${g.en}</span>
          <span class="courses-grid-col-zh">${g.zh}</span>
        </div>`;
    } else {
      coverInnerHtml += `<div class="courses-grid-col-header ${yearCls(i)}"></div>`;
    }
  }
  html += `<div class="courses-grid-row-cover">${coverInnerHtml}</div>`;

  // 每 semester 包成 .courses-semester（subgrid 6 cols），裡面：
  //   - sem-label 在 col 1 跨 2 sub-row（required + elective）
  //   - .courses-required-row / .courses-elective-row 各包 col 2/-1 的 type-label + 4 cells（subgrid 5 cols）
  // 拆 nested subgrid 是為了讓 sem-label / type-label 的 sticky containing block 縮到自己學期/row，
  // row 到底時 label 自然跟著上去（vs. 原本一張 grid 共用 sticky 範圍黏到 grid 最後才釋放）
  // 第 2+ 個學期 wrapper 加 .courses-grid-sem-start 補學期間距（margin-top 2xl）
  SEMESTERS.forEach((sem, semIdx) => {
    const semStartCls = semIdx > 0 ? ' courses-grid-sem-start' : '';

    let semInner = '';

    // 學期 label（col 1 sem-col，跨 required + elective 2 sub-row）
    semInner += `
      <div class="courses-grid-sem-label" style="grid-row: span 2;">
        <span class="courses-grid-sem-en">${sem.en}</span>
        <span class="courses-grid-sem-zh">${sem.zh}</span>
      </div>`;

    // Required row（subgrid 5 cols：type-col + 4 year cols）
    let reqInner = `
      <div class="courses-grid-type-label">
        <span class="courses-grid-type-en">${TYPES[0].en}</span>
        <span class="courses-grid-type-zh">${TYPES[0].zh}</span>
      </div>`;
    for (let i = 0; i < TOTAL_YEAR_COLS; i++) {
      const g = grades[i];
      if (g) {
        const realInCell = realChips.filter(rc =>
          rc.grade === g.key && rc.semester === sem.key && rc.type === 'required'
        );
        let cellChips = [...realInCell];
        if (cellChips.length < TARGET_REQUIRED_PER_CELL) {
          cellChips = [
            ...cellChips,
            ...takePlaceholders(TARGET_REQUIRED_PER_CELL - cellChips.length, g.key, sem.key, 'required'),
          ];
        }
        reqInner += `<div class="courses-grid-cell ${yearCls(i)}">${cellChips.map(renderCard).join('')}</div>`;
      } else {
        reqInner += `<div class="courses-grid-cell ${yearCls(i)}"></div>`;
      }
    }
    semInner += `<div class="courses-required-row">${reqInner}</div>`;

    // Elective row（同 subgrid 結構）
    let elecInner = `
      <div class="courses-grid-type-label">
        <span class="courses-grid-type-en">${TYPES[1].en}</span>
        <span class="courses-grid-type-zh">${TYPES[1].zh}</span>
      </div>`;
    for (let i = 0; i < TOTAL_YEAR_COLS; i++) {
      const g = grades[i];
      if (g) {
        const realInCell = realChips.filter(rc =>
          rc.grade === g.key && rc.semester === sem.key && rc.type === 'elective'
        );
        const target = ELECTIVE_RANGE[0] + Math.floor(Math.random() * (ELECTIVE_RANGE[1] - ELECTIVE_RANGE[0] + 1));
        let cellChips = [...realInCell];
        if (cellChips.length < target) {
          cellChips = [
            ...cellChips,
            ...takePlaceholders(target - cellChips.length, g.key, sem.key, 'elective'),
          ];
        }
        elecInner += `<div class="courses-grid-cell ${yearCls(i)}">${cellChips.map(renderCard).join('')}</div>`;
      } else {
        elecInner += `<div class="courses-grid-cell ${yearCls(i)}"></div>`;
      }
    }
    semInner += `<div class="courses-elective-row">${elecInner}</div>`;

    html += `<div class="courses-semester${semStartCls}">${semInner}</div>`;
  });

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

  panel.style.backgroundColor = accent || 'white';

  // Show
  slideIn.classList.remove('invisible', 'pointer-events-none');
  slideIn.classList.add('pointer-events-auto');

  if (typeof gsap !== 'undefined') {
    gsap.timeline()
      .to(overlay, { opacity: 0.8, duration: 0.3 })
      .to(panel, { x: '0%', duration: 0.5, ease: 'power3.out' }, '-=0');
  } else {
    overlay.style.opacity = '0.8';
    panel.style.transform = 'translateX(0%)';
  }

  document.body.style.overflow = 'hidden';
}

export function closeCourseSlideIn() {
  const slideIn = getSlideIn();
  const panel = getSlidePanel();
  const overlay = getSlideOverlay();
  if (!slideIn || !panel || !overlay) return;

  if (typeof gsap !== 'undefined') {
    gsap.to(overlay, { opacity: 0, duration: 0.4, delay: 0.1 });
    gsap.to(panel, {
      x: '110%', duration: 0.5, ease: 'power3.in',
      onComplete: () => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        panel.style.backgroundColor = '';
        document.body.style.overflow = '';
      }
    });
  } else {
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(110%)';
    setTimeout(() => {
      slideIn.classList.add('invisible', 'pointer-events-none');
      slideIn.classList.remove('pointer-events-auto');
      panel.style.backgroundColor = '';
      document.body.style.overflow = '';
    }, 500);
  }

  // 清 active 卡片底色（給切 program 也呼叫到）
  if (activeCard) {
    activeCard.style.background = '';
    delete activeCard.dataset.currentColor;
    activeCard = null;
  }
}

let _slideInBound = false;
function ensureSlideInClose() {
  if (_slideInBound) return;
  _slideInBound = true;
  const overlay = getSlideOverlay();
  if (overlay) overlay.addEventListener('click', closeCourseSlideIn);
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
  const grid = /** @type {HTMLElement|null} */ (panelEl.querySelector('.courses-grid'));
  if (!grid || grid.dataset.clickBound) return;
  grid.dataset.clickBound = '1';

  grid.addEventListener('click', (e) => {
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
function runMarqueeOverflow(panelEl) {
  panelEl.querySelectorAll('.courses-grid-card-en, .courses-grid-card-zh').forEach(rowEl => {
    const row = /** @type {HTMLElement} */ (rowEl);
    const inner = /** @type {HTMLElement|null} */ (row.querySelector('.courses-marquee-inner'));
    if (!inner) return;
    const overflow = inner.scrollWidth - row.offsetWidth;
    if (overflow > 0) {
      row.classList.add('is-overflow');
      const html = inner.innerHTML;
      inner.innerHTML = `<span class="marquee-copy">${html}</span><span class="marquee-copy">${html}</span>`;
      const copy = /** @type {HTMLElement|null} */ (inner.querySelector('.marquee-copy'));
      if (!copy) return;
      const copyWidth = copy.getBoundingClientRect().width;
      row.style.setProperty('--marquee-distance', `-${copyWidth}px`);
      row.style.setProperty('--marquee-duration', `${Math.max(3, copyWidth / 80)}s`);
    }
  });
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

  const grid = panel.querySelector('.courses-grid');
  if (!grid) return;

  const grades = gradesOf(program);
  // 永遠 4 個年級欄保持 BFA layout 比例；MDES 只填前 2 cells（year1, year2），cols 5-6 留空
  // 這樣 MDES 的 1st/2nd year 欄寬跟 BFA 的 freshman/sophomore 對齊，視覺一致
  grid.style.setProperty('--year-cols', '4');
  grid.innerHTML = buildHTML(program, courses);

  bindCardClick(panel);
  bindCardHover(panel);
  // 偵測 marquee：render 後 panel 已 visible 才能量到正確 offsetWidth
  runMarqueeOverflow(panel);
}
