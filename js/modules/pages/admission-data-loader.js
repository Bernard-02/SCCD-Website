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
import { loadAdmissionAnnouncements } from './admission-source.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';

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
  // Directus admission_announcements 優先，本地 admission.json fallback（admission-source.js）
  let data;
  try {
    data = await loadAdmissionAnnouncements();
  } catch (error) {
    console.error('Error loading admission data:', error);
    return;
  }

  // 只顯示「最新 5 則」announcement（user 2026-06-28；後台照常累積，前台只露最新 5）。
  // 依日期 desc 排序後取前 5；日期解析不出的排最後（保留但優先序低）。取代原「近一年」篩選——那個淡季可能 <5。
  data = data
    .slice()
    .sort((a, b) => {
      const da = parseNewsDate(a.date), db = parseNewsDate(b.date);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;
      return 0;
    })
    .slice(0, 5);

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
export function setupAdmissionReveal(container, { hide = true, limit = 0 } = {}) {
  if (typeof gsap === 'undefined' || !container) return;
  // limit>0（activities 切換路徑）：只藏「前 limit 條會被看到的 row」，其餘完全不碰。
  // 為何能限縮：切換的 reveal 前 scroll 一律回頂（switchToSection step 7 / sub-filter instant scroll），
  // 只有第一屏 + cull MARGIN 內的 row 真的會播進場；但 setup 跑在 showPanel 前（display:none 量不到幾何），
  // 只能用「DOM 序＝垂直序」取前 N 近似，跳過收合年份組（display:none/height:0，不佔畫面）。
  // 沒藏的 row 本來就在終態（上輪 reveal 收尾 clearProps）＝跟 cull snap 後的樣子一致，零視覺差。
  // 為何要限縮：clearProps 後 GSAP transform cache 失效，整份 gsap.set 逐列重讀 computed style
  // ＝逐列全頁 recalc，535 row 實測凍 8~9s（reference_activities_switch_ro_recalc_storm）。
  let rows = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.list-reveal-row')]);
  let limitedItems = null;
  if (limit && rows.length > limit) {
    const eligible = [];
    for (const r of rows) {
      const yi = /** @type {HTMLElement | null} */ (r.closest('.list-year-items'));
      if (yi && (yi.style.display === 'none' || yi.style.height === '0px')) continue;
      eligible.push(r);
      if (eligible.length >= limit) break;
    }
    rows = eligible;
    limitedItems = new Set();
    rows.forEach(r => { const it = r.closest('.list-item'); if (it) limitedItems.add(it); });
  }
  setupClipReveal(rows, { hide });
  // 進場方向 per-item 隨機，但**整筆一致**：一半從上滑入（文字 yPercent:-100 ＋ 斑馬底色 box 由上往下揭），
  // 一半維持從下（setupClipReveal 預設 100 ＋ box 由下往上揭）。
  // ⚠️ 之前只翻「文字」列、box 恆由下 → 翻上的那筆變成「文字往下、底色 box 往上」一筆內兩個方向打架；
  //    副標貼近 box 下緣，讀起來像「副標跟 title 反方向」（user 2026-07-17 report，工作營 item 最明顯）。
  //    現在 box 跟文字同方向、整筆一起進場。結構列（meta/分享/chevron/分隔線）仍維持從下（非顯眼、保留原樣）。
  // ⚠️ box clip 無條件藏（即使 hide:false 的初次載入）：文字 row 一律被 bindInteractions 的 setupClipReveal
  //    藏起，底色不跟著藏 → 初次進場「灰底已在、只有文字滑入」（user 2026-06-22）；揭露一律由
  //    playAdmissionPanelReveal 的 revealZebraBg 接（→inset(0)，兩方向都適用）。
  const canFlip = hide && !prefersReducedMotion();
  // limit 時 flip/zebra 也只掃被藏的那些 item（同上，沒藏的不動＝維持終態）
  (limitedItems ? [...limitedItems] : [...container.querySelectorAll('.list-item')]).forEach(item => {
    const fromTop = canFlip && Math.random() < 0.5;
    if (fromTop) {
      item.querySelectorAll('.list-reveal-row').forEach(row => {
        if (row.querySelector('.text-lg') || row.classList.contains('list-subtitles')) {
          gsap.set(row, { yPercent: -100 });
        }
      });
    }
    if (item.classList.contains('list-item-zebra')) {
      // fromTop → inset 底 100%（由上往下揭）；否則 inset 頂 100%（由下往上），跟文字同方向
      gsap.set(item, { clipPath: fromTop ? 'inset(0% 0% 100% 0%)' : 'inset(100% 0% 0% 0%)' });
    }
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

// 追蹤 useScrollTrigger 分支建的 once ScrollTrigger，每次 reveal 前殺掉上一輪殘留。
// root：news 初載(useScrollTrigger:true)建的 once trigger 若沒 fire 就殘留；之後 camp→news 時
// 被 smooth-scroll 的 ScrollTrigger.refresh 喚醒 → 跟 master-timeline reveal 對同一批 rows 打架
// （= camp→news clip-reveal bug；camp 從不 isInitial 故無殘留、news→camp 才正常）。
// 對齊 activities-section-switch playFilterChipsReveal 的 _chipRevealSTs 清理。此 fn 為 activities/admission 共用，
// 一起受益。頁級殘留由 cleanupPageModules（kill #page-content 內 trigger）兜底。
let _panelRevealSTs = [];
function killPanelRevealSTs() {
  _panelRevealSTs.forEach(t => { try { t.kill(); } catch (_) {} });
  _panelRevealSTs = [];
}

// panel 的捲動框偵測：桌面清單在 .inner-scroll-scroll-col 內捲（window 幾乎不動），viewport cull 要對「框」
// 量可見而非 window；手機<768 / 矮橫向 gate 時框 overflow 被改回 visible → 回 null 走 window 判斷。
// 用 computed overflow-y 判定（不硬編 innerWidth，矮橫向寬≥768 但框已撕裂）。
function getPanelScroller(panel) {
  const box = panel && panel.closest('.inner-scroll-scroll-col');
  if (!box) return null;
  const oy = getComputedStyle(box).overflowY;
  return (oy === 'auto' || oy === 'scroll') ? box : null;
}

/**
 * 播放整個 panel 的進場動畫
 * - useScrollTrigger=true（初次載入）：intro + 每個 list-row group 各自一個 ScrollTrigger，捲入 viewport 才 reveal
 * - useScrollTrigger=false（panel 切換）：master timeline 立即 sequential 播放
 * 逐 item：先 clip-reveal 底色（zebra item）再進文字（user 2026-06-21：底色→文字→底色→文字 交錯）。
 */
export function playAdmissionPanelReveal(panel, { useScrollTrigger = false, viewportCull = false } = {}) {
  if (!panel || typeof gsap === 'undefined') return;
  killPanelRevealSTs();  // 殺掉上一輪殘留 trigger，免它被 refresh 喚醒跟本次 reveal 打架

  // 減少動態：所有 list rows + zebra 底色直接到位，不分組、不 ScrollTrigger、不滑入。
  if (prefersReducedMotion()) {
    gsap.set(panel.querySelectorAll('.list-reveal-row'), { clearProps: 'transform' });
    panel.querySelectorAll('.list-item.list-item-zebra').forEach(item => gsap.set(item, { clearProps: 'clipPath' }));
    panel.querySelectorAll('.list-item[data-pre-reveal]').forEach(it => it.removeAttribute('data-pre-reveal'));
    return;
  }

  // 分組策略：以 list-item-divider 為「list-row 群組」終止符，每組 = 年份(若有) + title + 副標/icons + chevron + divider
  // intro = list 結構之外的 rows（描述塊）；首個 list-item / yearGroup / list-reveal-group 之後皆視為 list phase
  // .list-reveal-group：無 CSS 的分組 hook，給「年份與內容是 grid 兄弟、外框非 list-year-group」的卡片
  //   （degree-show 卡片：年份欄 col-1 的 reveal-row 沒有 .list-item 祖先，靠此讓它跟該卡內容同組進場）。
  const allRows = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('.list-reveal-row')]);
  const intro = /** @type {HTMLElement[]} */ ([]);
  const groups = /** @type {HTMLElement[][]} */ ([]);
  let current = /** @type {HTMLElement[]} */ ([]);
  let inListPhase = false;
  for (const row of allRows) {
    if (!inListPhase) {
      if (row.closest('.list-item') || row.closest('.list-year-group') || row.closest('.list-reveal-group')) {
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
      _panelRevealSTs.push(ScrollTrigger.create({
        trigger: intro[0], start: 'top 90%', once: true,
        onEnter: () => gsap.to(intro, {
          yPercent: 0, duration: DUR.slow, stagger: { each: 0.06 },
          ease: EASE.enter, clearProps: 'transform',
        }),
      }));
    }
    groups.forEach(groupRows => {
      if (groupRows.length === 0) return;
      const triggerEl = groupRows[0].closest('.list-item') || groupRows[0];
      const bgItem = zebraBgTarget(groupRows);
      _panelRevealSTs.push(ScrollTrigger.create({
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
      }));
    });
  } else {
    // 切換時：master timeline 嚴格 sequential — intro 0s → list-row groups 從 0.3s 起每 0.18s 接力
    // ── viewport cull（user 2026-08-30）：清單越長，逐 group 建 tween + 動 clip-path 的成本越高（實測
    //    exhibitions 535 row 切一次 ~14 個 >50ms long task）。只對「當下在可視捲動框內」的 group 跑進場，
    //    框外的一次性 gsap.set snap 到終態（看不到、不 tween、也無 lazy re-trigger），成本降成 O(可見 group)。
    // ponytail: group 數 ≤20 的小 panel（degree-show 9 / admission / 其他 section）跳過 cull＝行為零改、免量測。
    const cull = viewportCull && groups.length > 20;
    const scroller = cull ? getPanelScroller(panel) : null;
    const boxRect = scroller ? scroller.getBoundingClientRect() : null;
    // scroller 存在但量到 0 高（罕見 display 撕裂）→ 放棄 cull 動全部，寧慢不空白
    const doCull = cull && (!scroller || (boxRect && boxRect.height > 0));

    let visibleGroups = groups.filter(g => g.length);
    const offGroups = [];
    if (doCull) {
      // PASS-1 純讀：框 rect/clientHeight/scrollTop 各讀一次，再逐 group 讀 anchor rect 分類（無寫、單次 reflow）
      const MARGIN = 240;                                   // >1 row 高：吸收 wrapper-skip row 一行位移 + 緩衝
      const boxClientH = scroller ? scroller.clientHeight : 0;
      const boxScrollTop = scroller ? scroller.scrollTop : 0;
      const innerH = window.innerHeight;
      visibleGroups = [];
      let below = false;  // 撞到第一個 fold 以下的 group 後其餘不再量測（DOM 序=垂直序）
      for (const groupRows of groups) {
        if (!groupRows.length) continue;
        if (below) { offGroups.push(groupRows); continue; }
        // anchor 用 layout-stable 的 .list-item（子 row 的 yPercent 不動 item 盒），非被 setup 位移的 .list-reveal-row
        const anchor = groupRows[0].closest('.list-item') || groupRows[0];
        // display:none（收合年份）→ offsetParent null：直接 snap、且不觸發 below-break
        //   （否則它夾在可見 group 之間會誤把後面還可見的年份也斷成 off＝空白）
        if (anchor.offsetParent === null) { offGroups.push(groupRows); continue; }
        const r = anchor.getBoundingClientRect();
        const inView = scroller
          ? (r.top - boxRect.top + boxScrollTop < boxClientH + MARGIN)  // scrollTop~0：上緣不會有東西
          : (r.bottom > -MARGIN && r.top < innerH + MARGIN);
        if (inView) visibleGroups.push(groupRows);
        else { offGroups.push(groupRows); below = true; }
      }
      // PASS-2A 寫：框外 group 一次性 snap 終態 + 解鎖 pointer（killTweensOf 防上一輪殘 tween 在 snap 後又寫＝裸奔）
      const offRows = [];
      const offZebra = [];
      offGroups.forEach(groupRows => {
        offRows.push(...groupRows);
        const bg = zebraBgTarget(groupRows);
        if (bg) offZebra.push(bg);
        unlockGroup(groupRows);
      });
      // 只 snap「setup 真的藏過」的（有 inline transform/clipPath）：setup limit 沒碰的本來就在終態，
      // 對它們 clearProps＝白付一次 GSAP touch（uncached parse＝逐列 recalc，見 setupAdmissionReveal 註解）
      const touchedRows = offRows.filter(r => r.style.transform);
      const touchedZebra = offZebra.filter(z => z.style.clipPath);
      if (touchedRows.length) { gsap.killTweensOf(touchedRows); gsap.set(touchedRows, { clearProps: 'transform' }); }
      if (touchedZebra.length) { gsap.killTweensOf(touchedZebra); gsap.set(touchedZebra, { clearProps: 'clipPath' }); }
    }

    // PASS-2B 寫：只對可見 group 建進場 timeline（原邏輯照舊，改吃 visibleGroups）
    const tl = gsap.timeline();
    if (intro.length) {
      tl.to(intro, {
        yPercent: 0, duration: DUR.medium, stagger: { each: 0.06 },
        ease: EASE.enter, clearProps: 'transform',
      }, 0);
    }
    let cursor = intro.length ? 0.3 : 0;
    visibleGroups.forEach((groupRows) => {
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
export async function playAdmissionPanelExit(panel, { viewportCull = false } = {}) {
  if (!panel || typeof gsap === 'undefined') return;
  // 離場一開頭就殺殘留 once trigger：比 reveal-start 殺更早，趕在 camp lazy-load 的 ScrollTrigger.refresh
  // 之前——否則那次 refresh 會喚醒 news 初載未 fire 的 once trigger → onEnter clearProps 把 news rows 還原成
  // yPercent:0（藏在 display:none 下），下次切回 news 時 show 那幀 rows 還在 0 → title 閃現。
  killPanelRevealSTs();
  if (prefersReducedMotion()) return;  // 減少動態：不跑退場，立即換頁/切換

  // 1. 先收起展開的 accordion（若有）
  await collapseOpenAccordionsInPanel(panel);

  // 2. 再跑 panel rows fade-out（load-more 按鈕已移除）
  return new Promise(resolve => {
    // data-pre-reveal 一律設在全部 .list-item（cheap 屬性寫、不 tween）：重新鎖 pointer，讓下次 reveal 的
    // unlockGroup 循環全程對稱，culling 退場 tween 不能連這個也 cull 掉。
    panel.querySelectorAll('.list-item').forEach(it => it.setAttribute('data-pre-reveal', ''));
    let rows = [...panel.querySelectorAll('.list-reveal-row')];
    let zebra = [...panel.querySelectorAll('.list-item.list-item-zebra')];

    // viewport cull（同 reveal，只在數百 row 的重 panel 開）：只讓可見的 row/zebra 跑退場滑出，框外的直接
    // 隨 panel display:none 消失（切回時 setupAdmissionReveal 重新藏全部＝不留殘態）。量可見用 layout-stable
    // 的 .list-item anchor（即使上一輪 reveal tween 還在跑，子 row 的 yPercent 不動 item 盒→仍量得準）。
    // filter 在 empty-guard 之前：全被 cull 掉時 rows 為空也要往下 resolve()，不能讓 router await 的 Promise 卡死。
    if (viewportCull && rows.length > 60) {
      const scroller = getPanelScroller(panel);
      const boxRect = scroller ? scroller.getBoundingClientRect() : null;
      if (!scroller || (boxRect && boxRect.height > 0)) {
        const MARGIN = 240;
        const innerH = window.innerHeight;
        const vis = (el) => {
          const a = el.closest('.list-item') || el;
          const r = a.getBoundingClientRect();
          return scroller
            ? (r.bottom > boxRect.top - MARGIN && r.top < boxRect.bottom + MARGIN)
            : (r.bottom > -MARGIN && r.top < innerH + MARGIN);
        };
        rows = rows.filter(vis);
        zebra = zebra.filter(vis);
      }
    }
    if (rows.length === 0) { resolve(); return; }

    // 灰底退場：clip-path inset(0)→inset(100%) 收回（鏡像進場揭露），與文字 yPercent 同步滑出。
    // 進場收尾 clearProps 後 inline clip-path 為空 → fromTo 顯式從 inset(0) 收（否則從 none 補間會 snap，
    // 見 [[feedback_clippath_exit_after_clearprops_use_fromto]]）；進場中(inline 仍有值)則直接 to 從當下收。
    zebra.forEach(item => {
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
