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

// nav btn 隨機角互動的桌面 gate（同 arrow-spin：桌面且非矮橫向才有 hover）
export function isNavSpinDesktop() {
  return window.innerWidth >= 768
    && !window.matchMedia('(orientation: landscape) and (max-height: 500px), (min-width: 768px) and (max-width: 1023px)').matches;
}

const readInlineRot = (el) => {
  const m = el.style.transform.match(/rotate\((-?[\d.]+)deg\)/);
  return m ? parseFloat(m[1]) : null;
};

/**
 * 更新 nav 按鈕的 active 狀態和樣式
 * - 清除所有按鈕的 .active 和 inner 背景（⚠️ 不清旋轉：角度常駐 inline，hover 抽角後保持，
 *   user 2026-09-15 全站定案「hover 抽新角、離開保持、click 沿用」）
 * - 對匹配的按鈕（可能多個，如桌面+手機版）加 .active 並套用隨機色；旋轉桌面沿用 inline 當前角
 *   （＝hover 預覽角），手機/矮橫向無 hover → 現抽新角
 *
 * @param {NodeList|Array} btns - 所有按鈕
 * @param {string} activeKey - 當前 active 的 key
 * @param {string} attrName - 識別用的 attribute（如 'data-section'）
 * @param {Object} [opts] - 選項
 * @param {string} [opts.color] - 指定顏色（否則隨機）
 * @param {number} [opts.rotation] - 指定旋轉（否則桌面沿用當前角／手機隨機）
 * @returns {{color: string, rotation: number}} 使用的顏色和旋轉角度
 */
export function setActiveNavBtn(btns, activeKey, attrName, opts = {}) {
  const incoming = [...btns].filter(b => b.getAttribute(attrName) === activeKey);
  // 點下去時的 hover 色＝active 色（user 2026-09-28「hover 預覽、click 定案」同 menu；退場動畫後才 activate 也沿用）
  const color = opts.color || incoming.map(navHoverColor).find(Boolean) || SCCDHelpers.getRandomAccentColor();
  incoming.forEach(b => { delete b.dataset.navPicked; });
  const keepCurrent = isNavSpinDesktop();
  const pickRot = (inner) => (keepCurrent ? readInlineRot(inner) : null) ?? SCCDHelpers.getRandomRotation();
  let rotation = opts.rotation != null ? opts.rotation : null;

  btns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false'); // 無障礙：分頁切換狀態（非僅靠顏色，WCAG 1.4.1 / 4.1.2）
    // 支援單 pill 或多 pill 結構（如 courses-program-btn--stacked）
    b.querySelectorAll('.anchor-nav-inner').forEach(inner => {
      inner.style.background = '';
    });
  });

  incoming.forEach(b => {
    b.classList.add('active');
    b.setAttribute('aria-pressed', 'true');
    const inners = b.querySelectorAll('.anchor-nav-inner');
    inners.forEach((inner, idx) => {
      inner.style.background = color;
      // 多 pill 時每個 pill 各自處理；第一個沿用 caller 指定（或解析出的）rotation 確保 returned 值與實際一致
      const r = idx === 0 ? (rotation = rotation ?? pickRot(inner)) : pickRot(inner);
      inner.style.transform = `rotate(${r}deg)`;
    });
  });

  return { color, rotation };
}

/**
 * nav btn 隨機角互動（user 2026-09-15 全站定案；09-29 改 active 不轉）：初始各自隨機角；桌面 hover 抽新角（active 不轉不變色）、
 * 離開保持不還原；click 不再另抽——setActiveNavBtn 桌面沿用 inline 當前角、手機/矮橫向 click 才現抽。
 * 排除：atlas（自綁，maskFlyChrome 吃顯式 srcRot/dstRot，morph 期間不能抽）與已自帶同款互動的組
 * （anchor-nav / courses program / bfa-division / DSD event chips——各自維持自家 range）。
 * 元素級 listener 隨 #page-content swap 一起消失，不需 registerPageCleanup。
 * @param {NodeList|Element[]} btns
 */
export function bindNavBtnSpin(btns) {
  const hoverOn = isNavSpinDesktop();
  [...btns].forEach(btn => {
    const b = /** @type {HTMLElement} */ (btn);
    if (b.dataset.spinBound) return;
    b.dataset.spinBound = '1';
    const inners = /** @type {NodeListOf<HTMLElement>} */ (b.querySelectorAll('.anchor-nav-inner'));
    inners.forEach(inner => {
      if (readInlineRot(inner) == null) inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;
    });
    if (hoverOn) b.addEventListener('mouseenter', () => {
      if (b.classList.contains('active')) return;   // active 不轉（user 2026-09-29 全站）
      inners.forEach(inner => { inner.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`; });
    });
    bindNavBtnHover(b);
  });
}

/**
 * nav btn hover＝隨機三原色（user 2026-09-28 全站規則）：桌面 mouseenter 抽色 → btn 掛 data-nav-hover（色值兼 CSS gate）
 * ＋ --nav-hover（上色 var，掛 varHost：預設 btn；curriculum 掛 group 讓 sibling 的 BFA label 同吃）；mouseleave 即拆。
 * 上色規則在 navigation.css（[data-nav-hover] … .anchor-nav-inner:hover，壓 mode2/3 的 !important；mode3 走黑白不吃此色）。
 * 只在桌面綁（isNavSpinDesktop）＝手機/矮橫向 tap 不黏色。active 也照抽（CSS :not(.active) 不顯示；atlas 例外連 active 顯示）
 * ——scroll-spy 在游標底下把 active 換走時才有色可顯。點「已 active」的鈕別沿用 hover 色（caller 判斷，見 anchor-nav / DSD）。
 * click 當下的 hover 色記進 data-nav-picked：active 延到退場動畫後才寫、游標可能已離開，照樣沿用（見 navHoverColor）。
 * 元素級 listener 隨 #page-content swap 一起消失，不需 registerPageCleanup。
 * @param {HTMLElement} btn
 * @param {{ varHost?: HTMLElement, hoverEl?: HTMLElement, pick?: () => string }} [opts]
 *   hoverEl：進出哪個元素算 hover（curriculum＝group，hover BFA 小標題也算）；pick：自訂抽色（DSD 避開標題色）
 */
export function bindNavBtnHover(btn, { varHost = btn, hoverEl = btn, pick } = {}) {
  if (!isNavSpinDesktop() || btn.dataset.navHoverBound) return;
  btn.dataset.navHoverBound = '1';
  hoverEl.addEventListener('mouseenter', () => {
    const c = pick ? pick() : SCCDHelpers.getRandomAccentColor();
    btn.dataset.navHover = c;
    varHost.style.setProperty('--nav-hover', c);
  });
  hoverEl.addEventListener('mouseleave', () => { delete btn.dataset.navHover; });
  btn.addEventListener('click', () => { if (btn.dataset.navHover) btn.dataset.navPicked = btn.dataset.navHover; });
}

/** 這顆 btn 被點時看到的 hover 色（還在 hover 或剛點過；都沒有＝''）：非 atlas 的 active 沿用它＝點下去不跳色
 * @param {HTMLElement | null | undefined} btn */
export function navHoverColor(btn) {
  return (btn && (btn.dataset.navHover || btn.dataset.navPicked)) || '';
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
 * 「文字沒欄寬時盒以文字為主」；2026-09-27 起 ≥1200 nav 佔 cols 1-3、內容 col 4-18（平板維持 col 4 留白、內容 5-20）——curriculum ≥1200
 * 另把 btn 收在 cols 1-2，courses.css）。
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
 * - col 4 起（box 本體 ＋ box 外留白帶：nav 欄與 box 間的 gutter、col 20）＝內容區三態（user 2026-09-09 二改「正常滾動留在 box、快滑或停頓後
 *   再滾才去 footer/hero」，取代同日稍早的「一律鎖死」）：
 *   · box 吸收得了（可捲、非邊界）→ box 本體放行原生捲；留白帶 preventDefault 路由進 box。
 *   · 觸邊但慢（含 trackpad 慣性尾巴——密集事件不斷刷新 lastHit 冷卻，動量再大也衝不出去）→ 鎖住。
 *   · 觸邊且「快」（近 FLING_WIN 累積位移 > FLING_PX＝抵達邊界那一刻還有勁）或「停頓 PAUSE_MS 後
 *     再起手」＝刻意離開 → 放行 → 原生 chain 給 window → mandatory snap 去 footer/hero。
 *     放行後同方向、短間隔的後續事件整段放行（releasedDir latch），免得 snap 飛到一半被自己鎖住。
 * ⚠️box 不掛 CSS `overscroll-behavior:contain`（fling 手勢 latch 在 box 上，contain 會把放行的 chain
 *   擋死）——邊界攔截全靠這裡的 preventDefault，JS 是唯一守門員。
 * 手機/矮橫向（frame 拆掉、window 捲）不介入。
 * @param {HTMLElement|null} section
 */
export function bindFrameScrollSplit(section) {
  const box = /** @type {HTMLElement|null} */ (section && section.querySelector('.inner-scroll-scroll-col'));
  const navCol = section && section.querySelector('.inner-scroll-nav-col');
  if (!section || !box || !navCol) return;
  const PAUSE_MS = 500;                   // 邊界停頓多久後再滾＝刻意離開（手感鈕）
  const FLING_WIN = 150, FLING_PX = 250;  // 近 150ms 累積 250px＝快速滑動（手感鈕：越大越難甩出去）
  let lastHit = 0;                        // 上次「吸收或鎖住」的時間（停頓冷卻基準）
  let recent = [];                        // 近 FLING_WIN 的事件位移
  let releasedDir = 0, lastRelease = 0;
  const onWheel = (/** @type {WheelEvent} */ e) => {
    if (window.innerWidth < 768
      || window.matchMedia('(orientation: landscape) and (max-height: 500px), (min-width: 768px) and (max-width: 1023px)').matches) return;
    if (e.ctrlKey) return;                                    // pinch / ctrl+wheel 縮放不攔
    if (e.clientX <= navCol.getBoundingClientRect().right) return; // col 1-3（nav 欄）：window 捲（去 footer/hero）
    // frame 未對齊（在 hero/footer/過渡中）：不攔，讓 window 捲＋mandatory snap 收尾。缺這個 gate 時，
    // hero→section 過渡中 section 一滑到游標下 delta 就被吃進 box → window 凍在半途＝「畫面沒 100vh」
    // （user 2026-09-09；footer 側同機制鏡像）。2px 容差＝Win11 顯示縮放 sub-pixel（footer snap 同款坑）。
    if (Math.abs(section.getBoundingClientRect().top) > 2) return;
    const now = e.timeStamp;
    const px = (e.deltaMode === 1 ? 33 : 1) * e.deltaY;       // Firefox 滾輪 line 制換算
    const dir = Math.sign(px);
    recent = recent.filter(r => now - r.t < FLING_WIN);
    recent.push({ t: now, d: Math.abs(px) });
    if (releasedDir !== 0 && releasedDir === dir && now - lastRelease < 250) { lastRelease = now; return; }
    releasedDir = 0;
    const canScroll = box.scrollHeight > box.clientHeight + 1;
    const atTop = box.scrollTop <= 0;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    if (canScroll && !((atTop && dir < 0) || (atBottom && dir > 0))) {
      lastHit = now;                                          // box 吸收得了：內部捲
      if (box.contains(/** @type {Node} */ (e.target))) return; // box 本體：原生捲
      e.preventDefault();                                     // box 外留白帶（gutter / col 20）：路由進 box
      box.scrollTop += px;
      return;
    }
    const flung = recent.reduce((s, r) => s + r.d, 0) > FLING_PX;
    if (flung || now - lastHit >= PAUSE_MS) { releasedDir = dir; lastRelease = now; return; } // 放行 → footer/hero
    e.preventDefault(); lastHit = now;                        // 慢速觸邊：鎖住
  };
  section.addEventListener('wheel', onWheel, { passive: false });
  registerPageCleanup(() => section.removeEventListener('wheel', onWheel));
  bindNavOverflow(/** @type {HTMLElement} */ (navCol));   // 四頁 frame 共用掛載點＝call site 不用各自補
}

/**
 * 視窗矮、nav 清單放不下時：清單變成可上下捲的盒＋底部「下一批」chevron（user 2026-10-01；同 library 年份欄 chevron）。
 * 盒高由 CSS 定（lists.css：host＝flex column、底部讓出左下當前頁卡 --page-indicator-top）＝nav 與當前頁卡共用左欄不互疊。
 * 這裡做的事：
 *   ① 清單有沒有溢出 → host 掛 .nav-overflowing。沒溢出＝完全沿用原樣（overflow 不開、旋轉角不裁、沒有 chevron）
 *   ② chevron 點擊＝第一個沒完整露出的項目捲到頂（整批換）；到底 disabled；chevron 水平置中於最寬那顆 btn
 *   ③ active btn 不在可視範圍（deep-link 進後段分頁、about scroll-spy 換段）時捲進來
 *   ④ 清單比 host 窄時（curriculum bar 只佔 2 欄）把右側裁切界補到 host 右緣（--nav-clip-extra），長 label 才不被切
 * 滾輪：游標在清單上＝原生先捲清單、到邊界才 chain 給 window（四頁 nav 欄本來就不被 bindFrameScrollSplit 攔）。
 * 桌面限定：手機/矮橫向清單是橫向 strip，CSS gate 外 chevron display:none、.nav-overflowing 無對應規則。
 * 用的頁：四頁 inner-scroll frame（bindFrameScrollSplit 代掛）＋ about #anchor-nav（anchor-nav.js，清單是 JS 包的一層）。
 * @param {HTMLElement} host  限高的容器（四頁＝.inner-scroll-nav-col；about＝#anchor-nav）
 * @param {HTMLElement|null} [list]  btn 清單（預設 host 第一個子元素）
 */
export function bindNavOverflow(host, list = /** @type {HTMLElement|null} */ (host.firstElementChild)) {
  if (!list || host.querySelector('.nav-more-btn')) return;
  host.classList.add('nav-overflow-host');
  list.classList.add('nav-scroll-list');
  const more = document.createElement('button');
  more.className = 'nav-more-btn';
  more.setAttribute('aria-label', '下一批分頁 More sections');
  more.innerHTML = '<span class="icon icon-chevron-list icon-xs" style="transform:rotate(-90deg);"></span>';  // base 朝左，-90＝朝下
  host.appendChild(more);
  const pad = () => parseFloat(getComputedStyle(list).paddingTop) || 0;   // 溢出態的旋轉角 clearance（lists.css）
  const syncEnd = () => { more.disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 1; };
  const update = () => {
    // 比「項目自然總高」vs「host 內可用高」（版面值、與目前是否溢出態無關＝不會來回翻）。
    // ⚠️不能比 scrollHeight/clientHeight：旋轉的末顆 btn 角會算進 scrollHeight → 放得下也永遠判溢出
    const kids = /** @type {HTMLElement[]} */ ([...list.children]);
    if (!kids.length) return;
    const last = kids[kids.length - 1];
    const natural = last.offsetTop + last.offsetHeight - kids[0].offsetTop;
    const cs = getComputedStyle(host), ls = getComputedStyle(list);
    const avail = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const over = natural > avail + 1;
    host.classList.toggle('nav-overflowing', over);
    if (!over) return;
    // ④ 右側裁切界補到 host 右緣（兩者都取 content 寬＝溢出態的 padding 不影響結果）
    const extra = (host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
      - (list.clientWidth - parseFloat(ls.paddingLeft) - parseFloat(ls.paddingRight));
    list.style.setProperty('--nav-clip-extra', `${Math.max(0, extra)}px`);
    // ② chevron 盒＝疊在最寬那顆 btn 正下方（同寬、同左緣；未旋轉版面值）→ CSS justify-content:center 讓箭頭落在它的中線。
    //    左緣取 button 的 rect（旋轉在 inner、button 本身不轉；curriculum 的 MDES 往左凸 12 也跟得到）
    const widest = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('.anchor-nav-inner')]).reduce((a, b) => (b.offsetWidth > a.offsetWidth ? b : a));
    more.style.width = `${widest.offsetWidth}px`;
    more.style.marginLeft = `${(widest.closest('button') || widest).getBoundingClientRect().left - host.getBoundingClientRect().left - parseFloat(cs.paddingLeft)}px`;
    const a = list.querySelector('.active');
    if (a) {
      const lr = list.getBoundingClientRect(), ar = a.getBoundingClientRect();
      if (ar.bottom > lr.bottom - pad()) list.scrollTop += ar.bottom - lr.bottom + pad();
      else if (ar.top < lr.top + pad()) list.scrollTop -= lr.top + pad() - ar.top;
    }
    syncEnd();
  };
  more.addEventListener('click', () => {
    const box = list.getBoundingClientRect();
    // 項目＝清單直接子層（curriculum 是「BFA 標籤＋鈕」的 group，以 group 為單位才不會切掉標籤）
    const next = /** @type {HTMLElement[]} */ ([...list.children]).find(c => c.getBoundingClientRect().bottom > box.bottom - pad() + 1);
    const max = list.scrollHeight - list.clientHeight;
    list.scrollTo({ top: next ? Math.min(max, list.scrollTop + next.getBoundingClientRect().top - box.top - pad()) : max, behavior: 'smooth' });
  });
  list.addEventListener('scroll', syncEnd, { passive: true });
  // host 高（視窗 resize）或項目高（ui_labels 填字後折行、字型載入）一變就重判；
  // active 換顆（about scroll-spy 邊捲邊換、四頁點擊）也重跑＝把 active 帶進可視範圍
  let raf = 0;
  const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
  const ro = new ResizeObserver(queue);
  ro.observe(host);
  [...list.children].forEach(c => ro.observe(c));
  const mo = new MutationObserver(queue);
  mo.observe(list, { subtree: true, attributes: true, attributeFilter: ['class'] });
  registerPageCleanup(() => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); });
}

/**
 * deep-link 落地 highlight 期間其餘列半透明（user 2026-09-11，對齊 library deep-link dim）：
 * 對目標 .list-item 掛 .is-hovered、lists.css 的 class 版 dim 規則接手（全 viewport；
 * 合成 mouseenter/inline flash 觸不到 CSS :hover state，故 :hover 版 dim 接不到 deep-link）。
 * @param {HTMLElement|null} itemEl
 */
export function flashDeepLinkDim(itemEl, ms = 1200) {
  if (!itemEl) return;
  itemEl.classList.add('is-hovered');
  setTimeout(() => itemEl.classList.remove('is-hovered'), ms);
}

/**
 * hover-dim「只在滑鼠真的移動後才 dim」guard（activities/admission 共用）。
 * 短 list 在下方時打開 accordion 會捲到頂 → 內容在靜止 cursor 底下位移 → 瀏覽器 re-eval :hover 命中下方
 * 別的 item → 誤觸半透明（user 2026-09-04）。解：捲動（含程式捲）一律先在 host 掛 .hover-dim-suppress，
 * 下一次「座標真的變」的 pointermove 才解除（scroll 觸發的合成 mousemove 座標不變、被擋掉；有些瀏覽器
 * 根本不發合成事件 → 更是維持 suppress）。
 * 2026-10-01 起 hover 不再 dim（user：除 atlas 外 hover 卡片不調不透明度、CSS 規則已撤）——class 名沿用，
 * 現在擋的是 list-accordion.js 的 hover 上 accent 色（捲動中途經 header 不上色，見該處 .hover-dim-suppress 判斷）。
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

