import { DUR, EASE } from '../ui/motion.js';
/**
 * Lightbox Shell（共用 utility）
 * 提供所有全螢幕 lightbox/modal 統一的 enter/exit 行為：
 *   - body.lightbox-open class + overflow:hidden
 *   - header bars clip-path 退場/進場動畫（logo 不動）
 *   - 拉高 header z (10000) 讓 logo 浮在 lightbox z-[9999] 上
 *
 * **原則：lightbox 不 mutate 底下 page 渲染**
 *   - 不染 html bg / 不碰 body bg / 不 toggle scrollbar-gutter（會讓 page/header 抖 10px）
 *   - 2026-05-17 後 custom JS scrollbar 不再有 gutter，gutter 一致性顧慮已消除
 *
 * **header 區域處理**：
 *   - lightbox `fixed inset-0` 從 top:0 蓋滿 viewport（含 header 區）
 *   - header bars 由 clip-path 收掉、logo z=10000 浮在 lightbox 之上 → 視覺只剩 logo + X 浮在黑底
 *   - 容器加 inline `padding-top: 1.5rem` 把內部 flex 子元素（image / canvas / thumbs）下推一點，避免貼到浮在上方的 logo / X；數值對齊內部 main `py-xl`(3rem) + thumbs `py-md`(1.5rem) → 上方 gap ≈ poster 到 thumbnail gap 都 4.5rem 對稱；X 按鈕 absolute 相對 padding box top edge → padding 不影響 X 位置
 *   - （舊版曾把 lightbox top 偏移 header-height 露出 page bg，2026-05-17 移除：mode-color 下 page bg 跟 lightbox 黑底色差太大、使用者覺得「沒蓋到 header」）
 *
 * 視覺規範（與 activities-lightbox 對齊）：
 *   - lightbox 容器：`fixed inset-0 z-[9999]`
 *   - bg-black/90：讓底下 page 微透
 */

export function getHeaderTargets() {
  const header = document.querySelector('#site-header header');
  if (!header) return [];
  // 桌面 (≥768)：抓桌面 md:flex 內的 [data-bar] + #mode-btn（hidden md:flex 區，手機 display:none 抓不到）
  // 手機 (<768)：抓手機 .grid-12 區內的 .mobile-header-btn 兩顆（mode-btn-mobile + menu-btn 外殼），logo 不收
  // 兩邊都 include 也安全（手機 viewport 桌面元素 display:none 不影響 GSAP 動畫但會浪費 tween；分流更乾淨）
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    return /** @type {HTMLElement[]} */ (
      Array.from(header.querySelectorAll(':scope > .site-container > .grid-12 .mobile-header-btn'))
    );
  }
  return /** @type {HTMLElement[]} */ ([
    ...header.querySelectorAll(':scope > .site-container > .md\\:flex > [data-bar]'),
    header.querySelector(':scope > .site-container > .md\\:flex > #mode-btn'),
  ].filter(Boolean));
}

// per-element 隨機方向快取（同一輪 hide/show 必須一致）
// 'top' = bottom→top 收（從底往上消）；'bottom' = top→bottom 收（從頂往下消）
const exitDirMap = new WeakMap();

// opts（duration/ease/stagger）可覆寫：header bars 用預設（power2.out fast 起手、立刻收）；
// 其他 caller（如 footer 離頁，user 2026-06-08 要 footer 各元素出場時長一致）可傳自己的 timing 對齊別組動畫。
export function animateHeaderHide(targets, { duration = DUR.slow, ease = EASE.enterSoft, stagger = 0.06 } = {}) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  targets.forEach(el => exitDirMap.set(el, Math.random() < 0.5 ? 'top' : 'bottom'));
  // fromTo：強制 from-state 確保第一次開啟也有完整起點（current 可能是 'none'，GSAP 會跳終值）
  // inset 四值統一用 %（atlas memory：混用單位 GSAP 直接跳終值不動畫）
  gsap.fromTo(targets,
    { clipPath: 'inset(0% 0% 0% 0%)' },
    {
      clipPath: i => exitDirMap.get(targets[i]) === 'top'
        ? 'inset(0% 0% 100% 0%)'
        : 'inset(100% 0% 0% 0%)',
      duration,
      ease,
      stagger,
      overwrite: true,
    }
  );
}

export function animateHeaderShow(targets, { duration = DUR.slow, ease = EASE.enterSoft, stagger = 0.06 } = {}) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  gsap.to(targets, {
    clipPath: 'inset(0% 0% 0% 0%)',
    duration,
    ease,
    stagger,
    overwrite: true,
    onComplete: () => {
      targets.forEach(el => { el.style.clipPath = ''; });
    },
  });
}

// 多個 lightbox 同時/連續開關時保持 body state 一致
let openCount = 0;
let savedHeaderZ = null;
// 無障礙：記住開啟 lightbox 前的焦點元素，關閉時還原（WCAG 2.4.3 焦點順序）
let savedFocusEl = null;
// 底層 scroll freeze 的解除函式（見 installScrollLock）
let scrollLockCleanup = null;

// lightbox 容器 z-[9999] + 後 append 到 body → DOM order 比 header 後 → 同 z 下 lightbox 蓋過 header
// 要 logo 浮在 lightbox 上必須把 header z 拉到 > 9999；bars 由 clip-path 收掉所以拉高不會視覺穿幫
// 10000 留給 lightbox 用，idle-standby 用 10001 仍在最上
const HEADER_Z_ABOVE_LIGHTBOX = 10000;

function raiseHeaderZ() {
  const header = /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
  if (!header) return;
  savedHeaderZ = header.style.zIndex || '';
  header.style.setProperty('z-index', String(HEADER_Z_ABOVE_LIGHTBOX), 'important');
}

function restoreHeaderZ() {
  const header = /** @type {HTMLElement | null} */ (document.querySelector('#site-header header'));
  if (!header) return;
  if (savedHeaderZ) {
    header.style.setProperty('z-index', savedHeaderZ);
  } else {
    header.style.removeProperty('z-index');
  }
  savedHeaderZ = null;
}

// modal 開著時，logo（raiseHeaderZ 後浮在 modal 之上）要「完全不是連結」，不只是擋 click：
// 拔掉 href → ① 不導航 ② 無 pointer 游標（cursor.css 規則是 `body a[href]`，無 href 即回 default）
// ③ 無瀏覽器連結預覽 tooltip。<a> 仍 pointer-events:auto 接住點擊 → 不會穿透到 overlay 誤關面板。
// （user 2026-06-07：「不能點擊」要連 hover 游標 + 左下角連結預覽都沒有；router.js 另有 header 連結 guard 兜底）
let savedLogoHrefs = null;
function getLogoLinks() {
  return [
    document.querySelector('#header-logo')?.closest('a'),
    document.querySelector('#header-logo-mobile')?.closest('a'),
    document.getElementById('header-logo-mobile-sccd'),
  ].filter(Boolean);
}
function disableLogoLinks() {
  savedLogoHrefs = getLogoLinks().map(a => {
    const href = a.getAttribute('href');
    if (href !== null) a.removeAttribute('href');
    return [a, href];
  });
}
function restoreLogoLinks() {
  if (!savedLogoHrefs) return;
  savedLogoHrefs.forEach(([a, href]) => { if (href !== null) a.setAttribute('href', href); });
  savedLogoHrefs = null;
}

// 找全螢幕 lightbox modal：選 `fixed inset-0 z-[9999]` 三件套（activities, library-viewer, pdf-viewer 等）
// 排除 slide-in（z-[150]）— slide-in 本來就要蓋 header 區，做 dim overlay 效果
function getLightboxModals() {
  return /** @type {HTMLElement[]} */ (
    Array.from(document.querySelectorAll('.fixed.inset-0[class*="z-[9999]"]'))
  );
}

const savedPaddingTopMap = new WeakMap();

function padLightboxTops() {
  // 加 padding-top: 1.5rem，把內部 flex 子元素（main image / canvas / thumbs）稍微下推
  // 避免貼到浮在上方的 logo / X
  // 數值選 1.5rem 對齊「上方 gap = 1.5rem (shell) + 3rem (main py-xl) = 4.5rem」與
  // 「poster 到 thumbnail gap = 3rem (main py-xl) + 1.5rem (thumbs py-md) = 4.5rem」對稱
  // 之前用 var(--header-height, 80px) ≈ 5rem 太大，user 反映「内容會太接近 header 有壓迫感」
  // 之後又反映「再大一點，頂部 gap 跟 thumbnail-to-poster gap 差不多高」→ 降到 1.5rem 達成對稱
  // X 按鈕是 absolute（相對 padding box top edge）→ 不被 padding 影響，仍貼 viewport 頂
  getLightboxModals().forEach(el => {
    if (!savedPaddingTopMap.has(el)) savedPaddingTopMap.set(el, el.style.paddingTop || '');
    el.style.paddingTop = '1.5rem';
  });
}

function restoreLightboxTops() {
  getLightboxModals().forEach(el => {
    if (savedPaddingTopMap.has(el)) {
      el.style.paddingTop = savedPaddingTopMap.get(el) || '';
      savedPaddingTopMap.delete(el);
    }
  });
}

// 可 scroll 頁（activities）user 滾到 footer 區時 header bars+logo 已被 footer-near scroll listener
// clip 收起；body lock 後 listener 不再 fire → 殘留 hide state 蓋掉 lightbox 的 hide/show 動畫。
// 用 window 全域 hook 解耦：header.js 載入時 set window.__sccdResetFooterHide，
// shell 在 enterLightboxMode 時 call 一下；對 library 等 h-screen 頁是 no-op（barsHidden false）。
// 不用 import header.js 避免循環依賴。
function callResetFooterHide() {
  if (typeof window !== 'undefined' && typeof window.__sccdResetFooterHide === 'function') {
    window.__sccdResetFooterHide();
  }
}

// ── 底層 scroll freeze：擋捲動「輸入」而非鎖 overflow ──────────────────────────────
// 為什麼不用 html overflow:hidden 來 freeze（前兩版的做法，已棄）：
//   對 <html> 設任何 overflow（hidden / 兩軸 hidden）都會讓它變成自身 scroll container，
//   頁內 position:sticky 元素（faculty filter rail / courses 三組 sticky bar）失去「viewport 當
//   scrollport」的依據 → 開啟瞬間整批 un-stick 跳掉（實測 barTop 200→-300，捲到一半開特別明顯，
//   courses panel 只佔 40% 露出左側 60% 更刺眼）。scroll 位置其實有保住，跳的是 sticky。
// 改法：完全不碰 overflow / 不動 layout，純擋「捲動輸入」——
//   wheel / touchmove / 捲動鍵 在底層一律 preventDefault；但 target 在 modal panel 的可捲區
//   （overflow-y:auto 且還沒到邊）就放行 → panel 內文照常可捲。
//   零 layout 變動 → sticky 原封不動、也不跳頂部。站上原生 scrollbar 已被 custom-scrollbar 隱藏
//   （slide-in 時 thumb 也 display:none）→ 無 scrollbar-drag 漏洞，wheel/touch/鍵即全部捲動來源。

// el 在 axis('x'/'y') 方向、往 dir(<0 起點側 / >0 終點側 / 0 不論)還能不能捲
function canScroll(el, axis, dir) {
  const s = getComputedStyle(el);
  if (axis === 'y') {
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 1) return false;
    const atStart = el.scrollTop <= 0;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    return !((dir < 0 && atStart) || (dir > 0 && atEnd));
  }
  if (!/(auto|scroll)/.test(s.overflowX) || el.scrollWidth <= el.clientWidth + 1) return false;
  const atStart = el.scrollLeft <= 0;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
  return !((dir < 0 && atStart) || (dir > 0 && atEnd));
}

// target 往上是否有「該 axis/dir 還能捲」的祖先（到 body 為止）——有的話該捲動歸 modal 內容，不擋
function hasScrollableAncestor(target, axis, dir) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (canScroll(el, axis, dir)) return true;
    el = el.parentElement;
  }
  return false;
}

const SCROLL_KEYS = new Set([' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

function installScrollLock() {
  const onWheel = (e) => {
    // 以主要捲動軸判斷（橫向 thumb 列也算可捲 → 不誤擋 lightbox 內捲動）；找不到可捲祖先才擋底層
    const axis = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y';
    const dir = axis === 'x' ? Math.sign(e.deltaX) : Math.sign(e.deltaY);
    if (!hasScrollableAncestor(e.target, axis, dir)) e.preventDefault();
  };
  let touchStartY = 0;
  const onTouchStart = (e) => { if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : touchStartY;
    // 手指上滑（startY > y）= 內容往下捲 dir>0；下滑反之。用真實方向判斷 → panel 捲到邊界時不會 chain 到底層
    const dir = touchStartY - y >= 0 ? 1 : -1;
    if (!hasScrollableAncestor(e.target, 'y', dir)) e.preventDefault();
  };
  const onKeydown = (e) => {
    if (!SCROLL_KEYS.has(e.key)) return;
    const t = /** @type {HTMLElement} */ (e.target);
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    const up = e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home';
    if (!hasScrollableAncestor(t, 'y', up ? -1 : 1)) e.preventDefault();
  };
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  window.addEventListener('keydown', onKeydown, { capture: true });
  return () => {
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('touchstart', onTouchStart, { capture: true });
    window.removeEventListener('touchmove', onTouchMove, { capture: true });
    window.removeEventListener('keydown', onKeydown, { capture: true });
  };
}

// slide-in（faculty / courses，z-[150]）與全螢幕 lightbox（activities / library / share，z-[9999]）
// 共用同一套行為：① freeze 底層捲動 ② 凍結在當下畫面、不跳頂部、頁內 sticky 不動 ③ 關閉還原。統一不分流。
export function enterLightboxMode() {
  if (openCount === 0) {
    savedFocusEl = document.activeElement; // 無障礙：存開啟 lightbox 的觸發元素，exit 時還焦
    callResetFooterHide();
    // freeze 底層捲動：純擋輸入，完全不碰 body/html overflow（保住頁內 sticky 不跳、也不跳頂部）。
    // ⚠️ 連 body.overflow:hidden 都不能設：clip 頁（faculty/activities，html inline overflow-x:clip）html overflow
    //    非 visible → body overflow 不會傳播到 viewport，body 自己變 scroll container → 頁內 sticky 改以 body 為
    //    scrollport → 開啟瞬間 un-stick 跳掉（實測 faculty rail barTop 200→-288）。非 clip 頁雖會傳播沒事，
    //    但為了統一、且 input-block 已足夠 freeze，一律不動 overflow。
    scrollLockCleanup = installScrollLock();
    // logo 切換交給 theme-toggle MutationObserver 監聽 body.lightbox-open class：
    // add → switchHeaderLogo(wireframe-inverse 白色 wireframe)；remove → switchHeaderLogo(standard/inverse/wireframe)
    // caller 不應自己 call switchHeaderLogo，否則跟 Observer 撞 race（logoLoadGeneration +2 → 第一次 load stale）
    document.body.classList.add('lightbox-open');
    raiseHeaderZ();
    disableLogoLinks();
    padLightboxTops();
    animateHeaderHide(getHeaderTargets());
  }
  openCount++;
}

export function exitLightboxMode() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    if (scrollLockCleanup) { scrollLockCleanup(); scrollLockCleanup = null; }
    document.body.classList.remove('lightbox-open');
    animateHeaderShow(getHeaderTargets());
    restoreHeaderZ();
    restoreLogoLinks();
    // 無障礙：把焦點還給開啟 lightbox 的元素（preventScroll：別把頁面捲走）
    if (savedFocusEl && typeof savedFocusEl.focus === 'function') savedFocusEl.focus({ preventScroll: true });
    savedFocusEl = null;
    // 延後到 fade-out 結束（300ms 對齊 activities/library 的 opacity transition）：
    // 立即還原 padding 會讓內容在 fade-out 期間瞬間往上跳，視覺割裂
    setTimeout(() => {
      if (openCount === 0) restoreLightboxTops();
    }, 300);
  }
}

// SPA 換頁時呼叫（main-modular.js cleanupPageModules）：強制歸零，避免任何 modal 沒走 exit 流程時 state 殘留
export function resetLightboxMode() {
  openCount = 0;
  savedFocusEl = null; // SPA 換頁清掉，不把焦點還到舊頁元素
  restoreLightboxTops();
  restoreHeaderZ();
  restoreLogoLinks();  // SPA 換頁時 modal 還開著（如返回鍵）→ 把 logo href 還回去，否則下一頁 logo 變死連結
  // 解除底層 scroll freeze（若 lightbox 沒走正規 exit 流程退出時兜底）
  if (scrollLockCleanup) { scrollLockCleanup(); scrollLockCleanup = null; }
}
