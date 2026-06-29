import { DUR, EASE } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';
/**
 * Scroll Animate Module
 * 通用卡片進場動畫，可搭配 ScrollTrigger 或直接執行
 */

/**
 * Clip reveal 模式：仿 hero title 進場（wrapper overflow:clip + yPercent 100→0）
 *
 * wrapper 用 overflow:clip 不用 hidden — hidden 會把 wrapper 變成 scroll container，
 * 讓內部 .list-header.active 等 position:sticky 元素失去原本的 sticky 範圍；clip 只剪裁不建立 scroll container
 */

// 為每個 element wrap 一個 overflow:clip 容器並 set yPercent:100 隱藏
// idempotent（dataset.clipWrapped 守衛）；render 後立即呼叫，避免在 ScrollTrigger 觸發前先閃現
//
// hide=true（預設）：wrap + 設 yPercent:100（隱藏準備 reveal）
// hide=false：只 wrap 不動 yPercent — 適合「初次載入 HTML 已可見描述塊，但仍需 clip-wrapper 讓未來 exit 能正確剪裁」
//             場景。沒 wrapper 時 exit yPercent:100 會把元素推出自然 flow 看起來「掉出去」而非乾淨剪裁
export function setupClipReveal(elements, { hide = true } = {}) {
  if (typeof gsap === 'undefined') return [];
  const items = Array.from(elements);
  if (items.length === 0) return [];

  items.forEach(el => {
    if (el.dataset.clipWrapped) return;
    // 父層已是 overflow:hidden/clip（caller 自己建好結構）就跳過動態 wrap
    // 必須查 overflowY 而非 overflow shorthand：Chromium 對 Tailwind .overflow-hidden 返回 "hidden hidden"
    // 不等於字串 "hidden"，會誤判為要動態 wrap，把 element 搬進新 div 而破壞 nextElementSibling 等關係
    const parent = el.parentElement;
    if (parent) {
      const overflowY = getComputedStyle(parent).overflowY;
      if (overflowY === 'hidden' || overflowY === 'clip') {
        el.dataset.clipWrapped = '1';
        return;
      }
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'clip-reveal-wrapper';
    // reveal 動畫 yPercent:100→0 只動 y 軸 → 縱向要 clip 才有 wipe。
    // 一般 row：overflow-y:clip + overflow-x:visible，橫向放行讓旋轉 chip 左右凸出不被裁
    //   （CSS spec：此組合兩值都保留，不像 hidden+visible 會強制 auto；修早期 activities-filter chip 左邊被切）。
    // 含旋轉 filter chip（.courses-filter-btn，active 時 .anchor-nav-inner 會 rotate）的 row：改 overflow:clip
    //   兩軸 + overflow-clip-margin，讓旋轉角「縱向也」凸出 clip 邊界不被切 —— 去掉 filter 的 pt-lg padding
    //   buffer 後（user 2026-06-05）縱向沒緩衝，靠這個 margin 容納旋轉（橫向凸 ~3px / 縱向 ~10px，20px 都夠）。
    if (el.querySelector(':scope > .courses-filter-btn')) {
      wrapper.style.overflow = 'clip';
      wrapper.style.overflowClipMargin = '1.25rem';
    } else {
      wrapper.style.overflowY = 'clip';
      wrapper.style.overflowX = 'visible';
    }
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    el.dataset.clipWrapped = '1';
  });

  // 減少動態：不隱藏（元素留在終態可見），下方 playClipReveal 也會 early-return 不跑滑入。
  if (hide && !prefersReducedMotion()) gsap.set(items, { yPercent: 100 });
  return items;
}

// 觸發 clip reveal 動畫（assumes setupClipReveal 已執行）
// 用於 ScrollTrigger.create 的 onEnter，或非 ScrollTrigger 立即播放
// stagger 可覆寫：預設用 grid-auto-y（卡片牆用）；要嚴格 DOM 順序「依序進場」(title→副標→內文) 傳 { each: 0.12 } 線性
export function playClipReveal(elements, { onComplete = null, stagger } = {}) {
  if (typeof gsap === 'undefined') return;
  const items = Array.from(elements);
  if (items.length === 0) return;
  gsap.killTweensOf(items);
  // 減少動態：直接到終態，不滑入（仍呼叫 onComplete，呼叫端可能依賴它接後續）。
  if (prefersReducedMotion()) {
    gsap.set(items, { yPercent: 0, clearProps: 'transform' });
    if (onComplete) onComplete();
    return;
  }
  gsap.to(items, {
    yPercent: 0,
    duration: DUR.reveal,
    stagger: stagger || { each: 0.12, grid: 'auto', axis: 'y' },
    ease: EASE.enter,
    overwrite: true,
    clearProps: 'transform',
    onComplete: onComplete || undefined,
  });
}

// 整合版：setup + ScrollTrigger.batch（每元素獨立進場），或 setup + 立即播放
// 適合 admission 之類「載入後 row 各自進 viewport 觸發」的場景；group 內統一觸發請用 setupClipReveal + playClipReveal
export function animateCardsClipReveal(elements, useScrollTrigger = true, { onLastEnter = null } = {}) {
  const items = setupClipReveal(elements);
  if (items.length === 0) return [];

  // 減少動態：跳過 ScrollTrigger 分批，直接 playClipReveal（內部 gated 成即時到位 + onLastEnter）。
  if (useScrollTrigger && typeof ScrollTrigger !== 'undefined' && !prefersReducedMotion()) {
    let enteredCount = 0;
    return ScrollTrigger.batch(items, {
      start: 'top 90%',
      onEnter: batch => {
        enteredCount += batch.length;
        const isLast = enteredCount >= items.length;
        playClipReveal(batch, { onComplete: isLast && onLastEnter ? onLastEnter : null });
      },
    });
  }
  playClipReveal(items, { onComplete: onLastEnter });
  return [];
}

// ════════════════════════════════════════════════════════════════
// 退場 helpers（進場的反向；給各頁 registerPageExit 用，回傳 Promise 讓 router 換頁前 await）
//
// 設計重點：
//   - 預設只動「視窗內」的元素（viewportOnly）。離頁退場 router 會 await，全頁每個 row 都跑
//     stagger 會拖慢換頁；使用者也只看得到視窗內的東西飄走，視窗外直接 swap 即可 → 又快又自然。
//   - 回傳 Promise，無元素 / 無 gsap 時 resolve()，呼叫端可安全 Promise.all。
// ════════════════════════════════════════════════════════════════

// 元素 bounding rect 是否與視窗相交（含 margin 緩衝）
function isInViewport(el, margin = 120) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return r.bottom > -margin && r.top < vh + margin && r.width > 0 && r.height > 0;
}

// 過濾出「可見（非 display:none）且（預設）在視窗內」的元素
function exitTargets(elements, viewportOnly) {
  return Array.from(elements).filter(el => {
    if (!el || el.offsetParent === null) return false;       // display:none / detached 跳過
    return viewportOnly ? isInViewport(el) : true;
  });
}

/**
 * clip-reveal 的反向退場：元素 yPercent 0→100 沉出 clip-wrapper 邊界。
 * 給「進場走 setupClipReveal/playClipReveal」的流式 block 內容用（list rows / 文字段落 / 描述塊 / 聯絡列）。
 * 會自動補 clip wrapper（idempotent；無 wrapper 時 yPercent:100 會掉出 flow 而非乾淨剪裁）。
 * ⚠️ 僅適用流式 block 元素；grid/flex 卡片請用 playClipPathExit（避免在 exit 當下 reparent 破壞排版）。
 */
export function playRevealExit(elements, { stagger = 0.06, fromEnd = false, duration = DUR.base, viewportOnly = true } = {}) {
  if (typeof gsap === 'undefined') return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();  // 減少動態：不跑退場，直接換頁
  const items = exitTargets(elements, viewportOnly);
  if (items.length === 0) return Promise.resolve();
  setupClipReveal(items, { hide: false });
  return new Promise(resolve => {
    gsap.killTweensOf(items);
    gsap.to(items, {
      yPercent: 100,
      duration,
      ease: EASE.exit,
      stagger: { each: stagger, from: fromEnd ? 'end' : 'start', grid: 'auto', axis: 'y' },
      overwrite: true,
      onComplete: resolve,
    });
  });
}

const _EXIT_CLIP_DIRS = [
  'inset(100% 0% 0% 0%)', // 收向上
  'inset(0% 0% 100% 0%)', // 收向下
  'inset(0% 100% 0% 0%)', // 收向左
  'inset(0% 0% 0% 100%)', // 收向右
];

/**
 * clip-path inset wipe 退場（不重組 DOM，安全給 grid/flex 子元素如卡片）。
 * 從 inset(0)（完全顯示）wipe 到隨機方向收掉。
 * ⚠️ 用 fromTo 顯式起點 inset(0)：進場 reveal 收尾常 clearProps clipPath → computed=none，
 *    gsap.to 從 none 補間不動會 snap（見 memory clippath-exit-after-clearprops-use-fromto）。
 */
export function playClipPathExit(elements, { stagger = 0.04, fromEnd = true, duration = DUR.base, viewportOnly = true } = {}) {
  if (typeof gsap === 'undefined') return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();  // 減少動態：不跑退場，直接換頁
  const items = exitTargets(elements, viewportOnly);
  if (items.length === 0) return Promise.resolve();
  const n = items.length;
  return new Promise(resolve => {
    let remaining = n;
    const done = () => { if (--remaining <= 0) resolve(); };
    items.forEach((el, i) => {
      gsap.killTweensOf(el);
      const to = {
        clipPath: _EXIT_CLIP_DIRS[Math.floor(Math.random() * _EXIT_CLIP_DIRS.length)],
        duration,
        ease: 'cubic-bezier(0.25, 0, 0, 1)',
        delay: (fromEnd ? n - 1 - i : i) * stagger,
        overwrite: true,
        onComplete: done,
      };
      // 起點態分流（見 feedback_clippath_exit_after_clearprops_use_fromto 2026-06-06 細化）：
      //   inline clipPath 空 = 已完整進場（reveal 收尾 clearProps → computed=none）→ fromTo 顯式 inset(0) 再收
      //     （否則 gsap.to 從 none 補不動會 snap）
      //   inline clipPath 仍有值 = 進場中／尚未進場（GSAP 寫的 partial / 起點 inset）→ 直接 to 從當下值收
      //     （用 fromTo 會把卡片先 flash 成全開再收 = 視覺 bug）
      if (el.style.clipPath) {
        gsap.to(el, to);
      } else {
        gsap.fromTo(el, { clipPath: 'inset(0% 0% 0% 0%)' }, to);
      }
    });
  });
}
