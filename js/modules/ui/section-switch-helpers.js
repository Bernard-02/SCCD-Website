/**
 * Section Switch Helpers
 * 3 個 section-switch 模組（activities/courses/admission）共用的按鈕/面板切換邏輯
 *
 * 用法範例：
 *   const btns = document.querySelectorAll('.activities-section-btn');
 *   setActiveNavBtn(btns, activeKey, 'data-section');
 *   showPanel('.activities-panel', `panel-${key}`);
 */
import { registerPageCleanup } from './page-cleanup.js';
import { fitCardToText } from './scroll-animate.js';
import { loadUiLabels } from './ui-labels.js';
import { isAccordionBusy } from '../accordions/list-accordion.js';

/**
 * 更新 nav 按鈕的 active 狀態和樣式
 * - 清除所有按鈕的 .active 和 inner 背景/旋轉
 * - 對匹配的按鈕（可能多個，如桌面+手機版）加 .active 並套用隨機色/旋轉
 *
 * @param {NodeList|Array} btns - 所有按鈕
 * @param {string} activeKey - 當前 active 的 key
 * @param {string} attrName - 識別用的 attribute（如 'data-section'）
 * @param {Object} [opts] - 選項
 * @param {string} [opts.color] - 指定顏色（否則隨機）
 * @param {number} [opts.rotation] - 指定旋轉（否則隨機）
 * @returns {{color: string, rotation: number}} 使用的顏色和旋轉角度
 */
export function setActiveNavBtn(btns, activeKey, attrName, opts = {}) {
  const color = opts.color || SCCDHelpers.getRandomAccentColor();
  const rotation = opts.rotation != null ? opts.rotation : SCCDHelpers.getRandomRotation();

  btns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false'); // 無障礙：分頁切換狀態（非僅靠顏色，WCAG 1.4.1 / 4.1.2）
    // 支援單 pill 或多 pill 結構（如 courses-program-btn--stacked）
    b.querySelectorAll('.anchor-nav-inner').forEach(inner => {
      inner.style.background = '';
      inner.style.transform = '';
    });
  });

  [...btns].filter(b => b.getAttribute(attrName) === activeKey).forEach(b => {
    b.classList.add('active');
    b.setAttribute('aria-pressed', 'true');
    const inners = b.querySelectorAll('.anchor-nav-inner');
    inners.forEach((inner, idx) => {
      inner.style.background = color;
      // 多 pill 時每個 pill 各自隨機 rotation（仿 about division btn 視覺）；
      // 第一個沿用 caller 指定（或既有）rotation 確保 returned 值與實際一致
      const r = idx === 0 ? rotation : SCCDHelpers.getRandomRotation();
      inner.style.transform = `rotate(${r}deg)`;
    });
  });

  return { color, rotation };
}

/**
 * 切換 panel 顯示：隱藏所有符合 selector 的 panel，顯示指定 ID 的
 *
 * @param {string} panelSelector - 如 '.activities-panel'
 * @param {string} targetId - 目標 panel 的 id
 * @returns {HTMLElement|null} 顯示的 panel 元素
 */
export function showPanel(panelSelector, targetId) {
  document.querySelectorAll(panelSelector).forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(targetId);
  if (target) target.classList.remove('hidden');
  // 清掉殘留的 pinned 旗標：被藏 panel 內「已釘住」的 list-header，IO 不會再 fire（isIntersecting 藏前藏後
  // 都 false 無狀態變化）→ .list-has-pinned-header 殘留會讓手機 header blocker 一直蓋頂部、把 nav btn 裁掉。
  // 新 panel 若有自己的釘住 header，display 切換會觸發它的 IO 重新把旗標掛回（list-accordion.js attachStickyPinObserver）。
  document.querySelectorAll('#activities-content-section.list-has-pinned-header, #admission-content-section.list-has-pinned-header')
    .forEach(s => s.classList.remove('list-has-pinned-header'));
  return target;
}

/**
 * nav btn 色塊寬度貼合文字（faculty/curriculum/activities/admission 左欄 nav 共用；user 2026-09-05 統一
 * 「nav 佔 cols 1-3、col 4 留白、內容 col-5 起；文字沒欄寬時盒以文字為主」）。
 * label 折行時 inline 盒會撐到欄軌寬、不 hug 折後最長行 → fitCardToText（Range 逐行量、寬=最寬行+padding）。
 * ⚠️fit 目標＝.anchor-nav-inner（視覺色塊、padding 在它；btn 本體 padding:0 會 shrink-wrap 跟縮），
 *   fit btn 本體會少算 inner padding 導致 rewrap。非桌面/矮橫向 helper 自動還原 fit-content（水平捲動列
 *   nowrap 場景本就 hug）。
 * 時機：init（HTML fallback 字）→ ui_labels 填完（同 main-modular 那顆 single-flight promise、它先註冊
 * 先跑 → 這裡 resolve 時 label 已寫入）→ fonts.ready → resize（欄軌變、折行點跟著變；rAF debounce）。
 * @param {NodeList|Element[]} btns
 */
export function bindNavBtnFit(btns) {
  const fit = () => [...btns].forEach(b =>
    fitCardToText(/** @type {HTMLElement|null} */ (/** @type {Element} */ (b).querySelector('.anchor-nav-inner'))));
  fit();
  loadUiLabels().then(fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  let raf = 0;
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
  window.addEventListener('resize', onResize);
  registerPageCleanup(() => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); });
}

/**
 * inner-scroll frame 桌面滾輪分區（user 2026-09-05「col 1-3 捲的是 window（可到 footer）、
 * col 4 之後都是內部捲動」；faculty/curriculum/activities/admission 四頁共用）：
 * - col 1-3（nav 欄）＝不攔 → window 原生捲（吃 mandatory snap → footer / hero）。
 * - box 本體＝原生捲；到頂/到底不外溢靠 CSS `overscroll-behavior: contain`（lists.css .inner-scroll-scroll-col）。
 * - col 4 留白帶（x > nav 欄右緣、target 不在 box 內）＝wheel 路由進 box（preventDefault，否則 chain 給
 *   window 被 mandatory snap 吃掉會抖/跳）。
 * - 短 panel（box 不可捲）＝整區放行給 window——沿用舊 activities initBoxSnapHandoff 的刻意設計：
 *   從 hero 進 section 當下 box 在底，不該被立刻帶去 footer。該 handoff（兩段手勢閘）已由本分區模型取代退役。
 * 手機/矮橫向（frame 拆掉、window 捲）不介入。
 * @param {HTMLElement|null} section
 */
export function bindFrameScrollSplit(section) {
  const box = /** @type {HTMLElement|null} */ (section && section.querySelector('.inner-scroll-scroll-col'));
  const navCol = section && section.querySelector('.inner-scroll-nav-col');
  if (!section || !box || !navCol) return;
  const onWheel = (/** @type {WheelEvent} */ e) => {
    if (window.innerWidth < 768
      || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return;
    if (e.ctrlKey) return;                                    // pinch / ctrl+wheel 縮放不攔
    if (box.scrollHeight <= box.clientHeight + 1) return;     // 短 panel：交回 window（見上）
    if (box.contains(/** @type {Node} */ (e.target))) return; // box 本體：原生捲＋CSS contain 擋外溢
    if (e.clientX <= navCol.getBoundingClientRect().right) return; // col 1-3：window 捲
    e.preventDefault();                                       // col 4 留白帶：路由進 box
    box.scrollTop += (e.deltaMode === 1 ? 33 : 1) * e.deltaY;
  };
  section.addEventListener('wheel', onWheel, { passive: false });
  registerPageCleanup(() => section.removeEventListener('wheel', onWheel));
}

/**
 * hover-dim「只在滑鼠真的移動後才 dim」guard（activities/admission 共用）。
 * 短 list 在下方時打開 accordion 會捲到頂 → 內容在靜止 cursor 底下位移 → 瀏覽器 re-eval :hover 命中下方
 * 別的 item → 誤觸半透明（user 2026-09-04）。解：捲動（含程式捲）一律先在 host 掛 .hover-dim-suppress，
 * 下一次「座標真的變」的 pointermove 才解除（scroll 觸發的合成 mousemove 座標不變、被擋掉；有些瀏覽器
 * 根本不發合成事件 → 更是維持 suppress）。CSS hover-dim 規則以 :where(:not(.hover-dim-suppress)) gate。
 * @param {HTMLElement|null} host  #activities-content-section / #admission-content-section
 */
export function initHoverDimMoveGuard(host) {
  if (!host) return;
  let lastX = -1, lastY = -1, suppressed = false, liftPending = false;
  const suppress = () => { if (!suppressed) { suppressed = true; host.classList.add('hover-dim-suppress'); } };
  const lift = () => {
    liftPending = false;
    if (!suppressed) return;
    suppressed = false;
    host.classList.remove('hover-dim-suppress');
    // 解除瞬間 CSS dim 立刻恢復（:has(:hover) 持續重算），但 cursor 若在 suppress 期間就停上某 header，
    // 當時的 mouseenter 已被跳過且不會 re-fire → hover 中的 header 沒 accent＝「別人淡了自己白的」
    // （user 2026-09-05）。補發合成 mouseenter 讓 list-accordion 的 listener 自跑（suppress 已解除、
    // active/collapsing/opening 各 gate 它自檢）——對齊收合路徑「cursor 仍在 header 補回 hover bg」既有補償。
    const h = host.querySelector('.list-header:hover');
    if (h) h.dispatchEvent(new MouseEvent('mouseenter'));
  };
  // 開/關序列結束才解除（rAF 輪詢 isAccordionBusy＝純時戳比較、零 layout 讀；只在「動畫中滑鼠有動」才啟動）
  const liftWhenIdle = () => {
    if (!liftPending) return;
    if (isAccordionBusy()) { requestAnimationFrame(liftWhenIdle); return; }
    lift();
  };
  const onMove = (/** @type {PointerEvent} */ e) => {
    if (e.clientX === lastX && e.clientY === lastY) return;   // 座標沒變＝scroll 合成事件、非真移動
    lastX = e.clientX; lastY = e.clientY;
    if (!suppressed) return;
    // ⭐accordion 開/關序列中滑鼠動「也不解除」（user 2026-09-05 二修「有的 list 被上色＋開合卡」）：
    // scrollFollow 讓內容在游標下滑動，此時解除 → 途經 header 被 mouseenter 上色、內容滑走 mouseleave
    // 沒跟上＝顏色卡住；dim 規則也在滑動下反覆進出＝整批 opacity transition 砸動畫幀。
    // 改為 liftPending＋rAF 等 isAccordionBusy 結束才 lift（補色補 dim 一次到位）。
    if (isAccordionBusy()) {
      if (!liftPending) { liftPending = true; requestAnimationFrame(liftWhenIdle); }
      return;
    }
    lift();
  };
  document.addEventListener('scroll', suppress, true);   // capture：inner-scroll-scroll-col 與 window 捲動都抓得到
  document.addEventListener('pointermove', onMove, { passive: true });
  registerPageCleanup(() => {
    document.removeEventListener('scroll', suppress, true);
    document.removeEventListener('pointermove', onMove);
  });
}

