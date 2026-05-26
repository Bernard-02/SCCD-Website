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

export function animateHeaderHide(targets) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  targets.forEach(el => exitDirMap.set(el, Math.random() < 0.5 ? 'top' : 'bottom'));
  // fromTo：強制 from-state 確保第一次開啟也有完整起點（current 可能是 'none'，GSAP 會跳終值）
  // inset 四值統一用 %（atlas memory：混用單位 GSAP 直接跳終值不動畫）
  // ease 用 power2.out（fast 起手、smooth 收尾）讓 bars 在 lightbox 打開的瞬間立刻開始消失
  // 若用 power2.in 前半段幾乎沒動 → 視覺上會感覺「等一下才收」
  gsap.fromTo(targets,
    { clipPath: 'inset(0% 0% 0% 0%)' },
    {
      clipPath: i => exitDirMap.get(targets[i]) === 'top'
        ? 'inset(0% 0% 100% 0%)'
        : 'inset(100% 0% 0% 0%)',
      duration: 0.6,
      ease: 'power2.out',
      stagger: 0.06,
      overwrite: true,
    }
  );
}

export function animateHeaderShow(targets) {
  if (typeof gsap === 'undefined' || !targets.length) return;
  gsap.killTweensOf(targets);
  gsap.to(targets, {
    clipPath: 'inset(0% 0% 0% 0%)',
    duration: 0.6,
    ease: 'power2.out',
    stagger: 0.06,
    overwrite: true,
    onComplete: () => {
      targets.forEach(el => { el.style.clipPath = ''; });
    },
  });
}

// 多個 lightbox 同時/連續開關時保持 body state 一致
let openCount = 0;
let savedHeaderZ = null;

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

export function enterLightboxMode() {
  if (openCount === 0) {
    callResetFooterHide();
    // 不再 save/restore bodyOverflowBefore：cleanupPageModules 開頭 blanket reset body.style.overflow=''，
    // 加上 lightbox 開關情境下 body 預期就是 '' → 永遠存到 '' 又還原成 ''，純 no-op
    document.body.style.overflow = 'hidden';
    // logo 切換交給 theme-toggle MutationObserver 監聽 body.lightbox-open class：
    // add → switchHeaderLogo(inverse/wireframe-inverse)；remove → switchHeaderLogo(standard/inverse/wireframe)
    // caller 不應自己 call switchHeaderLogo，否則跟 Observer 撞 race（logoLoadGeneration +2 → 第一次 load stale）
    document.body.classList.add('lightbox-open');
    raiseHeaderZ();
    padLightboxTops();
    animateHeaderHide(getHeaderTargets());
  }
  openCount++;
}

export function exitLightboxMode() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    document.body.style.overflow = '';
    document.body.classList.remove('lightbox-open');
    animateHeaderShow(getHeaderTargets());
    restoreHeaderZ();
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
  restoreLightboxTops();
  restoreHeaderZ();
}
