/**
 * Admission Data Loader
 * 採 list-item / list-header / list-content 結構（與 activities list 共用 list-accordion）
 * Header：title 點擊 active 後 padding-left 右移、sticky 在 top:200；date 為 subtitle（年/月/日）
 * Content：rich HTML body → gallery（videos+images，仿 workshop）→ attachments（list-ref-btn 樣式，連檔案 URL 不導頁）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { loadListInto } from './activities-data-loader.js';

const ITEMS_PER_PAGE = 10;

// admission news 走通用 loadListInto（canonical list template），靠 options 切變體：
//   - flatList: true             — data 是 flat array（非 year-grouped）
//   - bodyField: 'content'       — content rich HTML 放進 .admission-body（不走結構化 metadata）
//   - attachmentsField: 'attachments' — 附件清單以 paperclip + Attachment N 渲染
//   - dateInHeader: true         — date 顯示在 header 當 title 副標
//   - fullDate: true             — 完整日期格式 "2026 / 02 / 04"
//   - hideYearHeader: true       — 無年份欄
//   - showShareBtn: false        — 不顯示 share 按鈕
//   - showAlumniIcon: false      — 不顯示畢業帽 icon

// ── Main ─────────────────────────────────────────────────────────────────

const ADMISSION_LIST_OPTIONS = {
  flatList:        true,            // admission.json 是 flat array 不是 [{year, items}]
  bodyField:       'content',       // rich HTML body 渲染到 .admission-body（不走結構化 metadata）
  attachmentsField: 'attachments',  // 附件 paperclip + Attachment N
  dateInHeader:    true,            // date 在 title 副標
  fullDate:        true,            // "2026 / 02 / 04" 完整格式
  hideYearHeader:  true,            // 無年份欄，list 靠齊左邊
  showShareBtn:    false,
  showAlumniIcon:  false,
  autoReveal:      false,           // reveal 由 admission-section-switch 接管（playAdmissionPanelReveal）
};

export async function loadAdmissionData() {
  const container = document.getElementById('admission-list');
  if (!container) return;
  let allData;
  try {
    const response = await fetch('/data/admission.json');
    allData = await response.json();
  } catch (error) {
    console.error('Error loading admission data:', error);
    return;
  }

  let visibleCount = ITEMS_PER_PAGE;
  const loadMoreContainer = document.getElementById('load-more-container');
  const loadMoreBtn = document.getElementById('load-more-btn');

  // 初次：用 loadListInto 渲染前 N 筆（傳 data 跳過 fetch）
  await loadListInto('admission-list', '', { ...ADMISSION_LIST_OPTIONS, data: allData.slice(0, visibleCount) });
  initListAccordion();

  // load-more-container 預設 invisible，等 panel reveal 顯示；無更多 data 時直接隱藏
  if (loadMoreContainer) {
    if (allData.length <= visibleCount) {
      loadMoreContainer.style.display = 'none';
    } else if (typeof gsap !== 'undefined') {
      gsap.set(loadMoreContainer, { opacity: 0, display: 'flex' });
    }
  }

  if (loadMoreBtn && allData.length > visibleCount) {
    loadMoreBtn.addEventListener('click', async () => {
      visibleCount = allData.length;
      // 重 render 全部 data：loadListInto 內部 container.innerHTML='' 會清舊 items
      // append 模式較複雜（reveal 動畫只跑新 items），4 items 級資料用 full re-render 體感差異不大
      await loadListInto('admission-list', '', { ...ADMISSION_LIST_OPTIONS, data: allData });
      initListAccordion();
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      // 新 items reveal：用既有 playItemsReveal 對全部 items（無 ScrollTrigger，user 已在 panel）
      const allItems = container.querySelectorAll('.list-item');
      playItemsReveal(Array.from(allItems), { useScrollTrigger: false });
    });
  }
}

// ── Reveal Helpers (給 admission-section-switch 用) ────────────────────────

/**
 * 為 container 內所有 reveal-row（包括 list-item 外的年份/separator）套 clip-reveal init
 *
 * hide=true（預設）：wrap + 推 yPercent:100 隱藏準備 reveal
 * hide=false：只 wrap 不隱藏 — 初次載入時描述塊在 HTML 已可見，但需 clip-wrapper 讓首次 exit 能乾淨剪裁
 */
export function setupAdmissionReveal(container, { hide = true } = {}) {
  if (typeof gsap === 'undefined' || !container) return;
  const rows = container.querySelectorAll('.list-reveal-row');
  setupClipReveal(rows, { hide });
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

// bindGallery / bindLightbox / initMarquees 已由 loadListInto 內部 bindInteractions 統一處理，
// admission 改走 loadListInto 後不需要本地副本（2026-05-18 重構移除）。
