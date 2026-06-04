/**
 * Admission Data Loader
 * 採 list-item / list-header / list-content 結構（與 activities list 共用 list-accordion）
 * Header：title 點擊 active 後 padding-left 右移、sticky 在 top:200；date 為 subtitle（年/月/日）
 * Content：rich HTML body → gallery（videos+images，仿 workshop）→ attachments（list-ref-btn 樣式，連檔案 URL 不導頁）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { loadListInto } from './activities-data-loader.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { DUR, EASE } from '../ui/motion.js';

const ITEMS_PER_PAGE = 10;

// Module-level state for infinite scroll observer
let _admissionScrollObserver = null;
let _admissionAllData = null;
let _admissionVisibleCount = 0;
let _admissionLoading = false;

// 初次 reveal 完成追蹤：infinite scroll 要等舊 items 動畫全跑完才能 re-render，
// 否則 loadListInto 把 mid-tween DOM 砸掉、user 看到動畫被「強制中斷走完」。
// 由 playAdmissionPanelReveal 的 onAllComplete（已存在的 counter）resolve。
let _admissionInitialRevealDone = false;
let _admissionInitialRevealPromise = null;
let _admissionInitialRevealResolver = null;
function resetInitialRevealTracking() {
  _admissionInitialRevealDone = false;
  _admissionInitialRevealPromise = new Promise(resolve => {
    _admissionInitialRevealResolver = resolve;
  });
}
function signalInitialRevealDone() {
  if (_admissionInitialRevealDone) return;
  _admissionInitialRevealDone = true;
  if (_admissionInitialRevealResolver) {
    _admissionInitialRevealResolver();
    _admissionInitialRevealResolver = null;
  }
}

// admission news 走通用 loadListInto（canonical list template），靠 options 切變體：
//   - flatList: true             — data 是 flat array（非 year-grouped）
//   - bodyField: 'content'       — content rich HTML 放進 .admission-body（不走結構化 metadata）
//   - attachmentsField: 'attachments' — 附件清單以 paperclip + Attachment N 渲染
//   - dateInHeader: true         — date 顯示在 header 當 title 副標（自動 includeStartYear：完整日期含年份）
//   - hideYearHeader: true       — 無年份欄
//   - showShareBtn: false        — 不顯示 share 按鈕
//   - showAlumniIcon: false      — 不顯示畢業帽 icon

// ── Main ─────────────────────────────────────────────────────────────────

const ADMISSION_LIST_OPTIONS = {
  flatList:        true,            // admission.json 是 flat array 不是 [{year, items}]
  bodyField:       'content',       // rich HTML body 渲染到 .admission-body（不走結構化 metadata）
  attachmentsField: 'attachments',  // 附件 paperclip + Attachment N
  dateInHeader:    true,            // date 在 title 副標（含年份）
  hideYearHeader:  true,            // 無年份欄，list 靠齊左邊
  showShareBtn:    false,
  showAlumniIcon:  false,
  autoReveal:      false,           // reveal 由 admission-section-switch 接管（playAdmissionPanelReveal）
};

// 本機 dev 跳過 WP fetch 避免 WP 沒跑時 hang 3s（同 activities-data-loader._SKIP_WP）
// sessionStorage.wpDev='1' 可強制 dev 也測 WP
const _SKIP_WP = location.hostname !== 'sccd-website.local'
  && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|)$/.test(location.hostname)
  && sessionStorage.getItem('wpDev') !== '1';

export async function loadAdmissionData() {
  const container = document.getElementById('admission-list');
  if (!container) return;
  // WP endpoint + JSON fallback；空 list 也算 fail 走 fallback
  const WP_API_BASE = location.hostname === 'sccd-website.local' ? '' : 'http://sccd-website.local';
  try {
    if (_SKIP_WP) {
      _admissionAllData = await fetch('/data/admission.json').then(r => r.json());
    } else {
      _admissionAllData = await fetch(`${WP_API_BASE}/wp-json/sccd/v1/admission-announcement`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(arr => {
          if (!Array.isArray(arr) || arr.length === 0) throw new Error('endpoint returned 0 items');
          return arr;
        })
        .catch(err => {
          console.warn('[admission] WP endpoint failed, fallback to data/admission.json:', err.message);
          return fetch('/data/admission.json').then(r => r.json());
        });
    }
  } catch (error) {
    console.error('Error loading admission data:', error);
    return;
  }

  _admissionVisibleCount = ITEMS_PER_PAGE;
  _admissionLoading = false;
  resetInitialRevealTracking();

  // 初次：用 loadListInto 渲染前 N 筆（傳 data 跳過 fetch）
  await loadListInto('admission-list', '', { ...ADMISSION_LIST_OPTIONS, data: _admissionAllData.slice(0, _admissionVisibleCount) });
  initListAccordion();

  // 全部 data <= 一頁就不需 observer
  if (_admissionAllData.length <= _admissionVisibleCount) return;

  setupInfiniteScrollObserver(container);
}

// IntersectionObserver 監聽 sentinel：進 viewport 自動 load 下一頁
// data 全載完 → disconnect；user 離開 admission page → registerPageCleanup disconnect
function setupInfiniteScrollObserver(container) {
  const sentinel = document.getElementById('admission-scroll-sentinel');
  if (!sentinel || typeof IntersectionObserver === 'undefined') return;

  // 防舊 observer 殘留（SPA re-init / 重新進 admission panel 多次呼叫 loadAdmissionData）
  if (_admissionScrollObserver) {
    _admissionScrollObserver.disconnect();
    _admissionScrollObserver = null;
  }

  _admissionScrollObserver = new IntersectionObserver(async (entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    if (_admissionLoading) return;
    if (_admissionVisibleCount >= _admissionAllData.length) return;

    _admissionLoading = true;

    // 等舊 items 初次進場動畫全部跑完才 re-render：loadListInto 會 container.innerHTML='' 砸掉 DOM，
    // mid-tween 的 GSAP 對死掉的 element 失效，user 視覺上看到動畫被「強制中斷走完」。
    // playAdmissionPanelReveal 的 counter 全 hit 時 signalInitialRevealDone resolve 此 Promise。
    if (!_admissionInitialRevealDone && _admissionInitialRevealPromise) {
      await _admissionInitialRevealPromise;
    }

    const prevCount = _admissionVisibleCount;
    _admissionVisibleCount = Math.min(_admissionVisibleCount + ITEMS_PER_PAGE, _admissionAllData.length);

    // 全 re-render（loadListInto 內部 container.innerHTML=''；append mode 較複雜暫不做）
    await loadListInto('admission-list', '', { ...ADMISSION_LIST_OPTIONS, data: _admissionAllData.slice(0, _admissionVisibleCount) });
    initListAccordion();

    // loadListInto 內部 bindInteractions 不論 autoReveal 旗標都 call setupClipReveal(allRows, hide:true)
    // → re-render 後 12 個 items 全 wrap + yPercent:100 隱藏。
    // 對 infinite scroll 場景必須顯式還原舊 items（上次 reveal 已完成）：
    // - 舊 rows yPercent:0 + 解 data-pre-reveal 維持可見可互動（避免上方 10 個 items 變成空白卡）
    // - 新 items 走 setupClipReveal+playItemsReveal 跟 panel-switch 一樣 animate-in
    const allItems = Array.from(container.querySelectorAll('.list-item'));
    const oldItems = allItems.slice(0, prevCount);
    const newItems = allItems.slice(prevCount);
    if (typeof gsap !== 'undefined') {
      if (oldItems.length > 0) {
        const oldRows = oldItems.flatMap(item => [...item.querySelectorAll('.list-reveal-row')]);
        if (oldRows.length > 0) gsap.set(oldRows, { yPercent: 0, clearProps: 'transform' });
        oldItems.forEach(it => it.removeAttribute('data-pre-reveal'));
      }
      if (newItems.length > 0) {
        const newRows = newItems.flatMap(item => [...item.querySelectorAll('.list-reveal-row')]);
        setupClipReveal(newRows, { hide: true });
        // ScrollTrigger reveal：等新 items 各自捲入 viewport 才 animate（user 要求 scroll-in-view 動畫）；
        // pagination 觸發時新 items 通常在 viewport 下方，ScrollTrigger.create 立即偵測位置不在 viewport 內 → 等捲入
        playItemsReveal(newItems, { useScrollTrigger: true });
      }
    }

    _admissionLoading = false;

    // 全 load 完 → disconnect 避免後續 scroll 仍 trigger（雖然 length check 也擋，省事件）
    if (_admissionVisibleCount >= _admissionAllData.length && _admissionScrollObserver) {
      _admissionScrollObserver.disconnect();
      _admissionScrollObserver = null;
    }
  }, {
    rootMargin: '300px 0px',  // 提前 300px 觸發，user scroll 到 sentinel 前就開始 load
  });
  _admissionScrollObserver.observe(sentinel);

  // SPA 離開 admission 時清掉 observer
  registerPageCleanup(() => {
    if (_admissionScrollObserver) {
      _admissionScrollObserver.disconnect();
      _admissionScrollObserver = null;
    }
    _admissionAllData = null;
    _admissionVisibleCount = 0;
    _admissionLoading = false;
  });
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
      duration: DUR.slow,
      stagger: { each: 0.08 },  // DOM 順序 = title → date → chevron → divider
      ease: EASE.enter,
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
        duration: DUR.slow,
        stagger: { each: 0.06 },
        ease: EASE.enter,
        clearProps: 'transform',
        onComplete: () => item.removeAttribute('data-pre-reveal'),
      }, idx * 0.18);
    });
  }
}

/**
 * 播放整個 panel 的進場動畫（panel 切換時用，立即播放無 ScrollTrigger）
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

  // 初次 reveal 全部 tween 完成 → resolve module-level Promise，讓 infinite scroll handler 可以放行 re-render
  // 不 fire 不會卡住：observer handler 只有 sentinel 入 viewport 時觸發，而 sentinel 在 list 底部
  // → 觸發前 user 必先捲過所有 items → 所有 ScrollTrigger 已 onEnter → tween 進行中 → 收尾 onComplete 累計到 total
  const onAllComplete = signalInitialRevealDone;
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
          yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
          ease: EASE.enter, clearProps: 'transform',
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
          yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
          ease: EASE.enter, clearProps: 'transform',
          onComplete: () => { unlockGroup(groupRows); incComplete(); },
        }),
      });
    });
  } else {
    // 切換時：master timeline 嚴格 sequential — intro 0s → list-row groups 從 0.3s 起每 0.18s 接力
    const tl = gsap.timeline({ onComplete: onAllComplete });
    if (intro.length) {
      tl.to(intro, {
        yPercent: 0, duration: DUR.medium, stagger: { each: 0.06 },
        ease: EASE.enter, clearProps: 'transform',
      }, 0);
    }
    const groupStart = intro.length ? 0.3 : 0;
    groups.forEach((groupRows, idx) => {
      if (groupRows.length === 0) return;
      tl.to(groupRows, {
        yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
        ease: EASE.enter, clearProps: 'transform',
        onComplete: () => unlockGroup(groupRows),
      }, groupStart + idx * 0.18);
    });
  }
}

/**
 * 收起 panel 內所有展開的 list-header.active，回傳 Promise on 收合動畫完成
 * 用於 panel exit / section switch / sub-filter switch 前 — 確保「先收 accordion 再 clip-reveal hide」
 * 視覺層次（user 偏好）。沒展開的 accordion 立即 resolve。
 *
 * 動畫 + cleanup 對齊 list-accordion.js closeListHeader：
 *   - 收合動畫：content height:0 + chevron rotation:0
 *   - 完成後清除 .active + 所有 inline accent 樣式（header / content / list-item bg + --item-color）
 * 不清會看到「panel 已淡出但底下 header 還留 accent 色塊」的殘留視覺
 */
function collapseOpenAccordionsInPanel(panel) {
  return new Promise(resolve => {
    if (!panel || typeof gsap === 'undefined') { resolve(); return; }
    const openHeaders = [...panel.querySelectorAll('.list-header.active')];
    if (openHeaders.length === 0) { resolve(); return; }

    const tl = gsap.timeline({ onComplete: () => resolve(undefined) });
    let hasTween = false;
    openHeaders.forEach(header => {
      const content = (header.nextElementSibling?.classList.contains('list-content')
        ? header.nextElementSibling
        : header.closest('.list-item')?.querySelector('.list-content'));
      const chevron = header.querySelector('.icon-chevron-list');
      const item = header.closest('.list-item');

      /** @type {HTMLElement} */ (header).dataset.collapsing = 'true';

      if (content) {
        /** @type {HTMLElement} */ (content).style.overflow = 'hidden';
        tl.to(content, {
          height: 0,
          duration: DUR.medium,
          ease: EASE.exitSoft,
          onComplete: () => {
            header.classList.remove('active');
            /** @type {HTMLElement} */ (header).style.background = '';
            /** @type {HTMLElement} */ (content).style.background = '';
            if (item) {
              /** @type {HTMLElement} */ (item).style.background = '';
              /** @type {HTMLElement} */ (item).style.removeProperty('--item-color');
              /** @type {HTMLElement} */ (item).style.removeProperty('--item-color-deep');
            }
            delete /** @type {HTMLElement} */ (header).dataset.accentHex;
            delete /** @type {HTMLElement} */ (header).dataset.collapsing;
          },
        }, 0);
        hasTween = true;
      }
      if (chevron) tl.to(chevron, { rotation: 90, duration: DUR.fast }, 0);  // close → list-header 朝下
    });
    // 完全沒 tween 被加進去 → onComplete 不會 fire，手動 resolve
    if (!hasTween && tl.getChildren().length === 0) resolve(undefined);
  });
}

/**
 * 播放整個 panel 的退場動畫：先收起任何展開的 accordion（0.5s），再讓 reveal-row 一起 yPercent:100
 * 滑出（0.4s，無 stagger）。沒展開的 accordion 直接跳過 collapse 階段。
 * 退場期間鎖住 pointer-events（data-pre-reveal）；返回 Promise 在動畫完成時 resolve。
 *
 * 「先收 accordion 再 fade-out」是 user 視覺偏好：整段帶著展開內容一起滑出會看起來像
 * 「沒收就被推走」，分兩段做才有層次感。三個 caller（page exit / section switch / sub-filter switch）
 * 都從本函式統一受益，不必每個 caller 自己包一層 collapse 邏輯。
 */
export async function playAdmissionPanelExit(panel) {
  if (!panel || typeof gsap === 'undefined') return;

  // 1. 先收起展開的 accordion（若有）
  await collapseOpenAccordionsInPanel(panel);

  // 2. 再跑 panel rows fade-out（load-more 按鈕已移除）
  return new Promise(resolve => {
    panel.querySelectorAll('.list-item').forEach(it => it.setAttribute('data-pre-reveal', ''));
    const rows = panel.querySelectorAll('.list-reveal-row');
    if (rows.length === 0) { resolve(); return; }

    // rows 在 clip wrapper 內：用 yPercent:100 即可隱藏（不動 opacity）
    gsap.to(rows, {
      yPercent: 100,
      duration: DUR.base,
      ease: EASE.exit,
      overwrite: true,
      onComplete: resolve,
    });
  });
}

// bindGallery / bindLightbox / initMarquees 已由 loadListInto 內部 bindInteractions 統一處理，
// admission 改走 loadListInto 後不需要本地副本（2026-05-18 重構移除）。
