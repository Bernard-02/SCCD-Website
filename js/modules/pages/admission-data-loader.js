/**
 * Admission Data Loader
 * 採 list-item / list-header / list-content 結構（與 activities list 共用 list-accordion）
 * Header：title 點擊 active 後 padding-left 右移、sticky 在 top:200；date 為 subtitle（年/月/日）
 * Content：rich HTML body → gallery（videos+images，仿 workshop）→ attachments（list-ref-btn 樣式，連檔案 URL 不導頁）
 */

import { setupClipReveal } from '../ui/scroll-animate.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { loadListInto } from './activities-data-loader.js';
import { DUR, EASE } from '../ui/motion.js';
import { sitePath } from '../ui/site-base.js';

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

// "2026.02.04" / "2026-02-04" / "2026/2/4" → Date；解析不出回 null
function parseNewsDate(s) {
  const m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export async function loadAdmissionData() {
  const container = document.getElementById('admission-list');
  if (!container) return;
  // 讀本地 JSON（WP-headless 邏輯已移除 2026-06-05）；之後 flip 接 Directus 時改 Directus 為主 + 本地 fallback。
  let data;
  try {
    data = await fetch(sitePath('data/admission.json')).then(r => r.json());
  } catch (error) {
    console.error('Error loading admission data:', error);
    return;
  }

  // 只顯示近一年的 news（後台照常累積，前台依日期自動篩）。日期解析不出的保留不藏。
  // ponytail: 以「今天」為錨點的滾動 12 個月；若淡季完全沒新貼文會整列空 → 改錨「最新一筆的日期」再回推一年即可
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  data = data.filter(item => {
    const d = parseNewsDate(item.date);
    return !d || d >= cutoff;
  });

  // 一次 render 全部 items（不分頁）；逐一進場由 playAdmissionPanelReveal 的 ScrollTrigger 接管
  // （每個 item 捲入 viewport 才 reveal）。資料量小（~12 筆），全 render 成本可忽略。
  await loadListInto('admission-list', '', { ...ADMISSION_LIST_OPTIONS, data });
  initListAccordion();
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
  // 斑馬底色（zebra item 才有可見底色）進場用 clip-path 揭露：先藏起，避免進場前底色閃出。
  // 逐 item 揭由 playAdmissionPanelReveal 接（底色先、文字後，item 間接力）。inset(100%)=從下往上揭。
  // ⚠️ 無條件藏（即使 hide:false 的初次載入）：list-item 的文字 row 一律被 bindInteractions 的
  //    setupClipReveal(hide:true) 藏起，底色不跟著藏 → 初次進場「灰底已在、只有文字滑入」（user 2026-06-22）。
  //    hide:false 只為了不藏「描述塊」（非 zebra item，不受這行影響）；揭露一律由 playAdmissionPanelReveal 接管。
  container.querySelectorAll('.list-item.list-item-zebra').forEach(item => {
    gsap.set(item, { clipPath: 'inset(100% 0% 0% 0%)' });
  });
}

// 斑馬底色進場 clip-reveal helper（兩條 reveal 路徑共用）。
// 只有 .list-item-zebra（有可見底色）才回傳 item；白底/admission item 回 null → 走純文字 reveal（原行為）。
// ⚠️ 不能只看 groupRows[0]：每個「年份的第一個 item」的 group 開頭是年份 toggle row（在年份欄、不在任何 .list-item 內），
//    closest('.list-item') 會是 null → 偵測不到該 item → 它 setup 時設的 clip-path:inset(100%) 永遠不揭 → 整個 item 被裁成空白。
//    改成找「組內第一個真的在 .list-item 內的 row」。
function zebraBgTarget(groupRows) {
  let item = null;
  for (const r of groupRows) { const it = r.closest('.list-item'); if (it) { item = it; break; } }
  return item && item.classList.contains('list-item-zebra') ? item : null;
}
// clip-path inset(100%→0)：底色由下往上揭。reveal 完 clearProps 移除 clip-path（避免殘留 clip 影響 sticky header）。
function revealZebraBg(item, tl, at) {
  const to = { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.base, ease: EASE.enter, clearProps: 'clipPath' };
  if (tl) tl.to(item, to, at); else gsap.to(item, to);
}

/**
 * 播放整個 panel 的進場動畫
 * - useScrollTrigger=true（初次載入）：intro + 每個 list-row group 各自一個 ScrollTrigger，捲入 viewport 才 reveal
 * - useScrollTrigger=false（panel 切換）：master timeline 立即 sequential 播放
 * 逐 item：先 clip-reveal 底色（zebra item）再進文字（user 2026-06-21：底色→文字→底色→文字 交錯）。
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

  // 解鎖 group 內所有 list-item 的 pointer-events（rows 動畫完成後）
  const unlockGroup = /** @param {HTMLElement[]} groupRows */ (groupRows) => {
    groupRows.forEach(r => {
      const item = r.closest('.list-item');
      if (item) item.removeAttribute('data-pre-reveal');
    });
  };

  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined') {
    // 初次載入：intro 一個 trigger，每個 list-row group 各自一個 trigger（per-item 捲入 viewport 才 reveal）
    if (intro.length) {
      ScrollTrigger.create({
        trigger: intro[0], start: 'top 90%', once: true,
        onEnter: () => gsap.to(intro, {
          yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
          ease: EASE.enter, clearProps: 'transform',
        }),
      });
    }
    groups.forEach(groupRows => {
      if (groupRows.length === 0) return;
      const triggerEl = groupRows[0].closest('.list-item') || groupRows[0];
      const bgItem = zebraBgTarget(groupRows);
      ScrollTrigger.create({
        trigger: triggerEl, start: 'top 90%', once: true,
        onEnter: () => {
          if (bgItem) revealZebraBg(bgItem);          // 底色先 clip-reveal
          gsap.to(groupRows, {
            yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
            ease: EASE.enter, clearProps: 'transform',
            delay: bgItem ? 0.2 : 0,                   // 文字晚底色 0.2s 進
            onComplete: () => unlockGroup(groupRows),
          });
        },
      });
    });
  } else {
    // 切換時：master timeline 嚴格 sequential — intro 0s → list-row groups 從 0.3s 起每 0.18s 接力
    const tl = gsap.timeline();
    if (intro.length) {
      tl.to(intro, {
        yPercent: 0, duration: DUR.medium, stagger: { each: 0.06 },
        ease: EASE.enter, clearProps: 'transform',
      }, 0);
    }
    let cursor = intro.length ? 0.3 : 0;
    groups.forEach((groupRows) => {
      if (groupRows.length === 0) return;
      const bgItem = zebraBgTarget(groupRows);
      if (bgItem) revealZebraBg(bgItem, tl, cursor);   // 底色先 clip-reveal
      const textAt = cursor + (bgItem ? 0.2 : 0);       // 文字晚底色 0.2s
      tl.to(groupRows, {
        yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
        ease: EASE.enter, clearProps: 'transform',
        onComplete: () => unlockGroup(groupRows),
      }, textAt);
      cursor = textAt + 0.18;  // 下一 item 起步：底色→文字→底色→文字 接力
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

    // 灰底退場：clip-path inset(0)→inset(100%) 收回（鏡像進場揭露），與文字 yPercent 同步滑出。
    // 進場收尾 clearProps 後 inline clip-path 為空 → fromTo 顯式從 inset(0) 收（否則從 none 補間會 snap，
    // 見 [[feedback_clippath_exit_after_clearprops_use_fromto]]）；進場中(inline 仍有值)則直接 to 從當下收。
    panel.querySelectorAll('.list-item.list-item-zebra').forEach(item => {
      const to = { clipPath: 'inset(100% 0% 0% 0%)', duration: DUR.base, ease: EASE.exit, overwrite: true };
      if (item.style.clipPath) gsap.to(item, to);
      else gsap.fromTo(item, { clipPath: 'inset(0% 0% 0% 0%)' }, to);
    });

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
