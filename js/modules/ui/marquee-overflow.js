/**
 * Marquee Overflow Utility
 *
 * 跑動的文字標題：若 inner 文字寬度 > row 容器寬度，把單份 inner 內容替換成兩份
 * `.marquee-copy`（seamless loop），設 CSS var `--marquee-distance` / `--marquee-duration`，
 * CSS hover 動畫從 translateX(0) → translateX(-copyWidth) 接到第二份無接縫。
 *
 * 之前 atlas / courses-map / library-panels 三檔幾乎一字不差地寫了三遍；
 * atlas 版多了「重 render 時 inner 已是 dual-copy 先還原成單份」reset 邏輯，
 * 是其他兩處的 strict 超集，這裡採用 atlas 版的安全行為。
 *
 * 效能（2026-07-10，user 報矮橫向 library 切分頁卡 18 秒）：
 * 1. 讀寫分段批次：舊版逐行「寫 → 讀 offsetWidth → 寫 innerHTML → 讀 rect」交錯，
 *    每行 ≥2 次 forced reflow；矮橫向 awards 1000+ 行 × 巨大 DOM ＝ 主執行緒鎖 18 秒。
 *    改成 5 段（全寫 reset → 全讀量測 → 全寫 dual-copy → 全讀 copy 寬 → 全寫 vars），
 *    整包固定 ~2 次 reflow，與行數無關。
 * 2. 離屏暫停：溢出行的 infinite 動畫改由 IntersectionObserver 控 animation-play-state，
 *    只有進 viewport 的行才跑（矮橫向 awards 曾同時 568 個動畫常駐 → 持續捲動 jank）。
 *    inline play-state 蓋 CSS shorthand 的 running；桌面 hover-gated marquee 不受影響
 *    （可見時 play-state=running，動畫仍由 :hover 規則決定掛不掛）。
 *
 * 用法：
 *   applyMarqueeOverflow(scope, '.row-selector', '.inner-selector');
 *
 * 動畫常數：speed=80px/s, minDuration=3s（與三檔原值一致）
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { registerPageCleanup } from './page-cleanup.js';

// 離屏暫停 observer：全 util 共用一顆，SPA 換頁 drain 時 disconnect（row 隨 #page-content 銷毀，
// 不 disconnect 會 strong-ref 整批舊 DOM）。row 進出 viewport → 切 inner 的 animation-play-state。
let _viewIO = null;
function viewIO() {
  if (_viewIO) return _viewIO;
  _viewIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      const inner = /** @type {any} */ (e.target)._marqueeInner;
      if (inner) inner.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
    });
  });
  registerPageCleanup(() => { if (_viewIO) { _viewIO.disconnect(); _viewIO = null; } });
  return _viewIO;
}

/**
 * @param {Element} scope - 容器（querySelectorAll 的根）
 * @param {string} rowSelector - 要 marquee 的「行」selector
 * @param {string} innerSelector - row 內部包文字的 inner span selector
 * @param {{speed?: number, minDuration?: number}} [opts]
 */
export function applyMarqueeOverflow(scope, rowSelector, innerSelector, opts = {}) {
  const speed = opts.speed ?? 80;
  const minDuration = opts.minDuration ?? 3;

  const pairs = [];
  scope.querySelectorAll(rowSelector).forEach((rowEl) => {
    const inner = /** @type {HTMLElement | null} */ (rowEl.querySelector(innerSelector));
    if (inner) pairs.push({ row: /** @type {HTMLElement} */ (rowEl), inner });
  });
  if (!pairs.length) return;

  // ① 全寫：reset — SPA 重 render / 轉向重跑時 inner 可能已是 dual-copy，先還原單份再重新偵測
  pairs.forEach(({ row, inner }) => {
    row.classList.remove('is-overflow');
    const first = inner.firstElementChild;
    if (inner.children.length === 2 && first && first.classList.contains('marquee-copy')) {
      inner.innerHTML = first.innerHTML;
    }
  });

  // 減少動態：不啟動跑馬燈循環，靜態顯示（reset 已還原單份，不再加 is-overflow / 不建第二份）
  if (prefersReducedMotion()) return;

  // ② 全讀：量測（本 pass 第一行觸發一次 reflow，之後同 pass 內讀取吃同一份 layout）
  const overflowing = [];
  pairs.forEach(({ row, inner }) => {
    // row.offsetWidth === 0：容器尚未 sized（SPA / deep-link 進場時卡片還沒排版完）→ scrollWidth - 0 必 > 0，
    // 會把沒真溢出的標題誤判溢出。0 寬無法可靠偵測，跳過；caller 的 _XMarqueeInit（panel show 後 rAF 重觸）會補量。
    const rowW = row.offsetWidth;
    if (!rowW) return;
    if (inner.scrollWidth - rowW > 0) overflowing.push({ row, inner, copyWidth: 0 });
  });
  if (!overflowing.length) return;

  // ③ 全寫：建 dual-copy + 掛離屏暫停 observer（先 paused，IO 首次 callback 把可見的翻 running）
  overflowing.forEach(({ row, inner }) => {
    row.classList.add('is-overflow');
    const html = inner.innerHTML;
    inner.innerHTML = `<span class="marquee-copy">${html}</span><span class="marquee-copy">${html}</span>`;
    inner.style.animationPlayState = 'paused';
    /** @type {any} */ (row)._marqueeInner = inner;
    viewIO().observe(row);
  });

  // ④ 全讀：量 copy 寬（第二次 reflow）。getBoundingClientRect 對 inline-block 準確；offsetWidth 某些情境回 0
  overflowing.forEach(o => {
    const copy = /** @type {HTMLElement | null} */ (o.inner.querySelector('.marquee-copy'));
    o.copyWidth = copy ? copy.getBoundingClientRect().width : 0;
  });

  // ⑤ 全寫：set CSS vars
  overflowing.forEach(({ row, copyWidth }) => {
    row.style.setProperty('--marquee-distance', `-${copyWidth}px`);
    row.style.setProperty('--marquee-duration', `${Math.max(minDuration, copyWidth / speed)}s`);
  });
}

/**
 * 建一個「配對同步」的 GSAP marquee timeline（2026-08-04，user 規格 v3 定案）：EN/ZH 等多條文字放在同一個
 * group 時，全部用**同一個速度**（px/s）各自跑自己的距離——距離長的自然跑比較久，距離短的先跑完；
 * 不是套同一個 duration（那樣短的會被拖慢，v2 誤解，已推翻）。
 * 短的跑完後 GSAP 預設停在終值不動（不用手寫 hold），等最長那條也跑完，整個 timeline 才進入 `gap` 秒的
 * 停頓（GSAP repeatDelay），停頓結束後**全部同時**歸零重播——下一輪一定是所有行對齊左邊（起點）一起出發，
 * 不會有人先偷跑。timeline 預設 paused，由呼叫端自己接 hover/其他觸發時機播放/暫停。
 * @param {{el: Element, distance: number}[]} items 這一組要同步的元素 + 各自要捲動的距離（正數 px）
 * @param {{speed?: number, minDuration?: number, gap?: number}} [opts]
 */
export function buildSyncedMarqueeTimeline(items, opts = {}) {
  const speed = opts.speed ?? 80;
  const minDuration = opts.minDuration ?? 3;
  const gap = opts.gap ?? 0.6;
  const tl = gsap.timeline({ repeat: -1, paused: true, repeatDelay: gap });
  items.forEach(({ el, distance }) => {
    const duration = Math.max(minDuration, distance / speed); // 各自的距離 ÷ 同一個速度 = 各自的時長
    tl.fromTo(el, { x: 0 }, { x: -distance, duration, ease: 'none' }, 0);
  });
  return tl;
}

/**
 * Hover marquee「放開平滑回彈」（泛化 faculty-slide-in.js bindFacultyMarqueeReturn，2026-08-19 user 定案 B）：
 * 把「hover 才捲」的單元從 CSS keyframe（放開瞬間 snap 回原點）改成 GSAP timeline 驅動——放開時從**當下位置**
 * 平滑補間回原點。**僅桌面呼叫**；手機無 hover、維持各元件 CSS `@media(max-width:767px)` 自動循環（本函式不碰）。
 *
 * 前置：呼叫端要先跑過 applyMarqueeOverflow（量寬 + 建 dual-copy + 設 --marquee-distance / is-overflow）。
 * 手法：bind 時對 hoverEl 內所有 inner 設 inline `animation:none`——蓋掉 CSS `.X:hover ...{animation}` keyframe
 *   （那些規則皆非 !important，inline 贏），改由 GSAP 獨佔 transform，兩邊不搶。timeline 於每次 enter lazy build
 *   （讀當下 --marquee-distance / is-overflow → resize / re-measure 後自動對；大列表零 init 成本，只有 hover 到才建）。
 * ⚠️ 絕不 `gsap.killTweensOf(inners)`：inners 同時是 timeline 自己 child tween 的 target，殺掉會讓 tl.play() 沒東西跑
 *   （faculty 踩過的坑）。只 kill 獨立的 returnTween。
 *
 * @param {HTMLElement} hoverEl 觸發 hover 的單元（卡片 / 欄）
 * @param {string} innerSelector hoverEl 內會捲動的 inner span selector（如 '.dsd-mq-inner'）
 * @param {string} lineSelector 帶 .is-overflow + --marquee-distance 的「行」selector（如 '.dsd-mq-line'）
 * @param {{returnDur?: number, ease?: string}} [opts]
 * @returns {() => void} cleanup（解綁 + kill；呼叫端接 registerPageCleanup）
 */
export function bindMarqueeReturn(hoverEl, innerSelector, lineSelector, opts = {}) {
  if (typeof gsap === 'undefined' || !hoverEl || /** @type {any} */ (hoverEl)._mqReturnBound) return () => {};
  // 自我 gate 桌面（同 isMobileView）：手機 / 矮橫向無 hover，維持各元件 CSS 自動循環，本函式不介入。
  // caller 可無條件呼叫、不必各自重複判斷（init 時決定一次；跨 gate 轉向由全站 orientation-reload 自癒）。
  if (window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return () => {};
  /** @type {any} */ (hoverEl)._mqReturnBound = true;
  const returnDur = opts.returnDur ?? 0.45;
  const ease = opts.ease ?? 'cubic-bezier(0.25,0,0,1)';

  // 桌面立刻關掉 CSS keyframe（inner 全設 animation:none），避免首次 hover 前/中 CSS 跟 GSAP 搶同一個 transform
  hoverEl.querySelectorAll(innerSelector).forEach((i) => { /** @type {HTMLElement} */ (i).style.animation = 'none'; });

  let tl = null, returnTween = null, inners = /** @type {Element[]} */ ([]);
  const build = () => {
    if (tl) { tl.kill(); tl = null; }
    const items = /** @type {{el: Element, distance: number}[]} */ ([]);
    hoverEl.querySelectorAll(lineSelector).forEach((line) => {
      if (!line.classList.contains('is-overflow')) return;
      const inner = line.querySelector(innerSelector);
      const dist = Math.abs(parseFloat(getComputedStyle(line).getPropertyValue('--marquee-distance'))) || 0;
      if (inner && dist) items.push({ el: inner, distance: dist });
    });
    inners = items.map((i) => i.el);
    tl = items.length ? buildSyncedMarqueeTimeline(items) : null;
  };
  const enter = () => {
    if (returnTween) { returnTween.kill(); returnTween = null; }
    build();                       // 每次 enter 重建：resize / re-measure 後 distance 也對
    if (tl) tl.play();
  };
  const leave = () => {
    if (!tl) return;
    tl.pause();                    // 凍在當下位置
    if (!inners.length) return;
    // 不用 overwrite:true（footgun）——tl 已 pause 不 tick、其 child tween 不會跟這條搶；re-enter 由 build() kill 舊 tl。
    // 同 faculty-slide-in 範本；別把 overwrite 帶進「會重用 tl」的 Family A handler（那裡會殺掉 tl 自己的 child tween）。
    returnTween = gsap.to(inners, {
      x: 0, duration: returnDur, ease,
      onComplete: () => { if (tl) tl.progress(0); returnTween = null; },   // 歸零供下次 play 乾淨起步
    });
  };
  hoverEl.addEventListener('mouseenter', enter);
  hoverEl.addEventListener('mouseleave', leave);
  return () => {
    hoverEl.removeEventListener('mouseenter', enter);
    hoverEl.removeEventListener('mouseleave', leave);
    if (tl) tl.kill();
    if (returnTween) returnTween.kill();
    /** @type {any} */ (hoverEl)._mqReturnBound = false;
  };
}
