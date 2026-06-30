import { DUR, EASE } from '../ui/motion.js';
import { scrollWindowNoSnap, clampBelowFooter, lockSnapOff, unlockSnap } from '../ui/snap-scroll.js';
/**
 * Workshop Accordion Module
 * 工作營手風琴功能（包含 Year Toggle 和 Workshop Header）
 */

/**
 * Initialize Workshop Year Toggle (年份展開/收合)
 */
function initListYearToggle() {
  const workshopYearToggles = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.list-year-toggle'));

  if (workshopYearToggles.length === 0) return;

  // Initialize heights for all containers on page load
  workshopYearToggles.forEach(toggle => {
    const yearGrid = toggle.closest('.grid-12');
    if (yearGrid) {
      const itemsContainer = /** @type {HTMLElement | null} */ (yearGrid.querySelector('.list-year-items'));
      const chevron = yearGrid.querySelector('.icon-chevron-list');

      if (itemsContainer) {
        // 用 overflow:clip 不用 hidden — hidden 會把這層變成 sticky 的 scroll container，
        // 讓內部 .list-header.active 的 position:sticky 完全失效（黏不住）；clip 只剪裁不建立 scroll container
        itemsContainer.style.overflow = 'clip';

        // Check if chevron has rotate-90 class (indicates initially open)
        const isInitiallyOpen = chevron && chevron.classList.contains('rotate-90');

        if (isInitiallyOpen) {
          // Set initial height to auto for open state
          gsap.set(itemsContainer, { height: 'auto' });
          // 初始即展開 → chevron 朝下（270）；rotate-90 class 只當「初始展開」sentinel，實際角度由 GSAP 蓋過。user 2026-06-21
          if (chevron) gsap.set(chevron, { rotation: 270 });
        } else {
          // Set initial height to 0 and hide for closed state
          gsap.set(itemsContainer, { height: 0, display: 'none' });
        }
      }
    }
  });

  workshopYearToggles.forEach(toggle => {
    if (toggle.dataset.accordionInit) return;
    toggle.dataset.accordionInit = '1';
    // 無障礙：年份展開鈕是 <div>，補按鈕語義 + 鍵盤操作（WCAG 2.1.1 / 4.1.2）
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    const _yc = toggle.closest('.grid-12')?.querySelector('.list-year-items');
    toggle.setAttribute('aria-expanded', String(!!(_yc && _yc.style.height && _yc.style.height !== '0px')));
    toggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
    });
    toggle.addEventListener('click', function() {
      // Find the year group container (parent of the grid-12)
      const yearGrid = this.closest('.grid-12');

      if (!yearGrid) return;

      // Find the chevron and items container within this year group
      const chevron = yearGrid.querySelector('.icon-chevron-list');
      const itemsContainer = /** @type {HTMLElement | null} */ (yearGrid.querySelector('.list-year-items'));

      if (itemsContainer) {
        // Check if currently open (check if height is set and not 0)
        const isOpen = itemsContainer.style.height && itemsContainer.style.height !== '0px';
        this.setAttribute('aria-expanded', String(!isOpen)); // 無障礙：報讀切換後狀態

        if (isOpen) {
          // Close with GSAP animation
          gsap.to(itemsContainer, {
            height: 0,
            duration: DUR.base,
            ease: EASE.exitSoft,
            onComplete: () => {
              itemsContainer.style.display = 'none';
            }
          });
          if (chevron) gsap.to(chevron, { rotation: 180, duration: DUR.fast });  // close → 朝右
        } else {
          // Open with GSAP animation
          itemsContainer.style.display = 'flex';
          gsap.to(itemsContainer, {
            height: 'auto',
            duration: DUR.medium,
            ease: EASE.enterSoft
          });
          // open → chevron 朝下（270；base icon 朝左，90=上/180=右/270=下）。user 2026-06-21
          if (chevron) gsap.to(chevron, { rotation: 270, duration: DUR.fast });
        }
      }
    });
  });
}

/**
 * Initialize Workshop Header Accordion (個別工作營展開/收合)
 */
// accent → 對應的 ref deep color（ref bg 用 deep 版本，比三原色暗一階）
// 為什麼用 map 而非 color-mix：要的是「特定指定深色」不是純 accent×black 數學混合
// dataset.accentHex 保存 hex 字串，避免 element.style.background 讀出來的 'rgb(...)' 對不上 map
const ACCENT_TO_DEEP = {
  '#FF448A': '#f52d78', '#ff448a': '#f52d78',
  '#00FF80': '#23eb7d', '#00ff80': '#23eb7d',
  '#26BCFF': '#23a5ff', '#26bcff': '#23a5ff',
};

// 兩段式開合的序列鎖（2026-06-08 prototype）：開新 item 改成「先動畫收回舊的 → 收完才量測落點 + 展開」，
// 序列期間 (~0.9s) 鎖住 list-header 點擊避免連點 race。module 常駐記憶體 → 於 initListAccordion 與
// resetListAccordionsInPanel 重置，避免離頁或切 section 把 tween kill 掉、序列未完成殘留 true 卡死所有點擊。
let listAnimating = false;

// 清掉殘留的 dataset.opening（兩段式 open 標記）。正常由 proceedOpen 清；但 section 切換/離頁打斷 0.4s 收回
// 窗口時 proceedOpen 不會跑 → 該 header 卡 opening → hover handler 失效。於 reset 點 document-wide 清掉保險。
function clearStaleOpeningFlags() {
  document.querySelectorAll('.list-header[data-opening]').forEach((/** @type {any} */ h) => { delete h.dataset.opening; });
}

// 把副標 wrapper 的高度「瞬間定局」（transition:none + rAF 還原）。
// 用於量測落點前：移除 .active 會讓收起的副標走 0.3s grid-rows 重新展開（lectures 一 active 就收 / 其他頁
// .is-pinned 才收），量測搶在它長完前會差一個副標高（lecture 實測差 ~53px）。snap 後正常互動仍平滑。
// 用 .list-subtitles → closest 取 wrapper（不用 :has querySelector，避免舊瀏覽器丟 SyntaxError）
function snapSubtitleHeight(header) {
  const subEl = header.querySelector('.list-subtitles');
  const subWrap = /** @type {HTMLElement | null} */ (subEl ? subEl.closest('.clip-reveal-wrapper') : null);
  if (subWrap) {
    subWrap.style.transition = 'none';
    requestAnimationFrame(() => { subWrap.style.transition = ''; });
  }
}

/**
 * Instant 收合 panel 內所有打開的 list-header accordion（無動畫）
 * 用於 activities/admission section 切換時把 target panel 內遺留的 open state 清空，
 * 避免「打開 A → 切到 B → 切回 A 時 accordion 仍開」的殘留體驗
 * 重置範圍對齊 closeListHeader 的 onComplete cleanup（active class / inline bg / dataset / item color var / content height / chevron rotation）
 */
// 瞬間收合單一展開的 list-header（無動畫 + 完整 cleanup，對齊 closeListHeader 的 onComplete cleanup）。
// 用於：① section 切換清殘留 ② 開新 item 時瞬間關掉上方其他展開項（讓版面立即定局、量得到 header 真實落點）。
export function instantCloseListHeader(header) {
  const content = (header.nextElementSibling?.classList.contains('list-content')
    ? header.nextElementSibling
    : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
  const chevron = header.querySelector('.icon-chevron-list');
  const workshopItem = header.closest('.list-item');

  header.classList.remove('active');
  detachStickyPinObserver(header);
  header.style.background = '';
  delete header.dataset.accentHex;
  delete header.dataset.collapsing;

  snapSubtitleHeight(header);  // 移 .active 後副標會 0.3s 重新展開 → snap 定高，讓緊接的量測拿到真值

  if (workshopItem) {
    workshopItem.style.background = '';
    workshopItem.style.removeProperty('--item-color');
    workshopItem.style.removeProperty('--item-color-deep');
  }

  if (content && typeof gsap !== 'undefined') {
    gsap.killTweensOf(content);
    gsap.set(content, { height: 0, overflow: 'hidden' });
    content.style.background = '';
    content.setAttribute('inert', ''); // 無障礙：收合內容移出 tab 順序
  }

  if (chevron && typeof gsap !== 'undefined') {
    gsap.killTweensOf(chevron);
    gsap.set(chevron, { rotation: -90 });  // reset → list-header 收合態朝下（base 朝左：90=上 / -90=下）
  }

  resetBoxSpacer(header);  // 「一律對齊頂部」spacer：instant 收合（切 panel）也歸零（切換已 scrollTop=0，不跳）
}

/**
 * Instant 收合 panel 內所有打開的 list-header accordion（無動畫）
 * 用於 activities/admission section 切換時把 target panel 內遺留的 open state 清空，
 * 避免「打開 A → 切到 B → 切回 A 時 accordion 仍開」的殘留體驗
 */
export function resetListAccordionsInPanel(panel) {
  listAnimating = false;  // section 切換會 instantClose 掉序列中的 item（kill tween）→ 解鎖避免殘留卡死
  unlockSnap();  // 切 section → 前一 panel 開著的 item 被收掉 → 解鎖 snap 交回 mandatory
  clearStaleOpeningFlags();  // 若切 section 打斷兩段式 open 窗口，清掉殘留 dataset.opening（否則該 header hover 失效）
  if (!panel) return;
  const openHeaders = panel.querySelectorAll('.list-header.active');
  if (!openHeaders.length) return;
  openHeaders.forEach(header => instantCloseListHeader(header));
}

// list-header sticky 釘點（給「開啟捲動落點」與「is-pinned IO」共用，必須跟 CSS 實際釘點一致）。
//   手機（<768）：lists.css `@media(max-width:767px) .list-header.active { top: 6rem }` 寫死 6rem
//                 → 直接算 6rem，不讀 --list-header-sticky-top（那個 var 只在桌面 JS 設、手機沒設會 fallback 200）。
//   桌面 inner-scroll：--list-header-sticky-top（box 內偏移；activities=clearance+barH、admission 無 filter bar=0=box 頂，0 合法）；
//        window-path（alumni 等）：var 未設/0 → 200 fallback（對齊 fixed header band）。
// ⚠️ 不一致的後果（2026-06-10 user 報）：手機開 item 用 200 fallback 把 title 捲到 200，但 CSS 釘 96
//    → 往下捲 title 從 200「跳」到 96 才 sticky。統一走此 helper 後開啟落點＝釘點，無跳動。
function getListStickyTop(header) {
  if (window.innerWidth < 768) {
    return 8 * parseFloat(getComputedStyle(document.documentElement).fontSize); // = CSS top:8rem（清 logo，與 lists.css 同步）
  }
  const c = header.closest('[style*="--list-header-sticky-top"]');
  const v = c ? parseFloat(getComputedStyle(c).getPropertyValue('--list-header-sticky-top')) : NaN;
  // inner-scroll（box-relative）：var 是 box 內偏移，0（admission 無 filter bar = box 頂）為**合法**釘點 → 不套 200 fallback；
  //   否則 `0 || 200` 把合法的 0 誤當未設→回 200，害開 item 對齊到 box 頂下 200px（user 2026-06-30 報 admission 開 item 沒對齊頂）。
  // window-path（alumni 等對齊 fixed header band）：var 未設或 0 都回退 200（沿用原行為，別動）。
  if (header.closest('.inner-scroll-scroll-col')) return Number.isNaN(v) ? 0 : v;
  return (Number.isNaN(v) || v === 0) ? 200 : v;
}

// 桌面 inner-scroll「開的 item 一律對齊頂部」(user 2026-06-30)：短 list 內容填不滿 box → 開的 item 光靠捲動到不了頂。
// 在 box (.activities-scroll-col) 末尾放一個高度動態的 spacer，補足「讓這個 item 的 header 捲到 sticky 線」所需的捲動空間
// （下方留白）；長 list 夠捲時 height=0（不多出尾端空白）。開時重算、關時歸零（見 proceedOpen / closeListHeader / instantClose）。
function getBoxSpacer(scroller) {
  let sp = /** @type {HTMLElement | null} */ (scroller.querySelector(':scope > .box-scroll-spacer'));
  if (!sp) {
    sp = document.createElement('div');
    sp.className = 'box-scroll-spacer';
    sp.setAttribute('aria-hidden', 'true');
    sp.style.cssText = 'height:0;pointer-events:none;';
    scroller.appendChild(sp);
  }
  return sp;
}
function resetBoxSpacer(header) {
  const box = header.closest('.inner-scroll-scroll-col');  // 通用 inner-scroll 容器（activities/faculty/curriculum/admission/courses 共用）
  const sp = box && box.querySelector(':scope > .box-scroll-spacer');
  if (sp) /** @type {HTMLElement} */ (sp).style.height = '0px';
}

// Sticky-pinned 偵測：sentinel pattern — 在 list-header 上方塞 0 高度 sentinel div，IO 偵測 sentinel
// 是否還在 sticky-top 線之下。sentinel 是純 scroll-driven flow 元素（非 sticky），IO 行為完全穩定，
// 不會踩到「IO 對 sticky 元素 ratio 邊界 case 跨瀏覽器不穩」的坑。
//
// 原理：sentinel 位置 = list-header 自然位置上方。user 滾過 sticky-top 線時 sentinel 隨之消失到 root
// reduced top 之上 → isIntersecting = false → header pinned → 加 .is-pinned；反之 unpinned。
//
// CSS :stuck 偽類 spec proposed but not implemented (2026)，sentinel/IO 是 workaround 標準做法。
function attachStickyPinObserver(header) {
  if (header._stickyPinIO) return;
  // 手機/桌面釘點走共用 helper（手機 6rem、桌面 var/200），與開啟捲動落點一致
  const stickyTop = getListStickyTop(header);

  // Inject sentinel into list-item as first child (before list-header)
  const listItem = header.closest('.list-item');
  if (!listItem) return;
  let sentinel = /** @type {HTMLElement | null} */ (listItem.querySelector(':scope > .list-sticky-sentinel'));
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.className = 'list-sticky-sentinel';
    sentinel.style.cssText = 'height:1px;margin-bottom:-1px;pointer-events:none;';
    listItem.insertBefore(sentinel, listItem.firstChild);
  }

  const io = new IntersectionObserver(([entry]) => {
    // sentinel 滾過 sticky-top 線之上 = isIntersecting false → header pinned
    // ⚠️ panel 被 section-switch 藏起（display:none）時 IO 也 fire（rect 變空 → isIntersecting false），
    // 不能誤判成 pinned：旗標殘留會讓手機 header blocker 一直蓋頂部、把捲回 band 的 nav btn 裁掉
    const pinned = !entry.isIntersecting && header.offsetParent !== null;
    // is-pinned 驅動桌面副標 pinned-collapse；toggleSectionPinnedFlag 驅動手機 header blocker 顯隱（兩者同一 IO）
    header.classList.toggle('is-pinned', pinned);
    toggleSectionPinnedFlag(header, pinned);
  }, {
    // 桌面 inner-scroll：sentinel 對「右欄 .inner-scroll-scroll-col」的頂邊判 pinned（list 在 scroller 內捲、非 window）；
    //   手機（<768，無 frame）：root=null＝對 window viewport（原行為）。activities/admission 桌面皆有 scroll-col。
    root: (window.innerWidth >= 768) ? header.closest('.inner-scroll-scroll-col') : null,
    // +4px 容差：開啟捲動把 title 停在「正好釘線」（自然位置=釘點、尚未越過）→ 嚴格邊界下 IO 判未 pin →
    // blocker 不顯示 → 上方內容（如 description）溢出蓋到 logo（user 2026-06-10）。邊界往下挪 4px 讓
    // 「title 一抵釘線就算 pinned」→ blocker 開。4px 窗內 nav 不可能還在 band（item 釘住時 nav 已捲出畫面），不誤觸。
    rootMargin: `-${stickyTop + 4}px 0px 0px 0px`,
    threshold: 0,
  });
  io.observe(sentinel);
  header._stickyPinIO = io;
  header._stickyPinSentinel = sentinel;
}
function detachStickyPinObserver(header) {
  if (header._stickyPinIO) {
    header._stickyPinIO.disconnect();
    delete header._stickyPinIO;
  }
  if (header._stickyPinSentinel) {
    header._stickyPinSentinel.remove();
    delete header._stickyPinSentinel;
  }
  header.classList.remove('is-pinned');
  toggleSectionPinnedFlag(header, false);  // 關 item / 離開 pin 都收掉 blocker 顯示旗標
}

// 在 header 所屬的 content section 上開關 .list-has-pinned-header（驅動手機 header blocker 顯隱）。
// 只認 activities / admission 兩個 content section（其他 list 場景無透明 header 上方露出問題、無 blocker）。
function toggleSectionPinnedFlag(header, on) {
  const section = header.closest('#activities-content-section, #admission-content-section');
  if (section) section.classList.toggle('list-has-pinned-header', on);
}

// 收合單一 header（自關 + 「開新先關舊」共用）
// 收合順序：先 collapse content（保留 .active）→ onComplete 移除 .active 觸發 title 往左 transform transition
// 回傳 Promise（content 收合 tween onComplete 時 resolve）：開新 item 時 await 收回動畫跑完才量落點+展開（兩段式）。
// duration 可覆寫：自關用預設 DUR.medium；開新先關舊用較短 DUR.base 讓序列不拖。
function closeListHeader(header, { duration = DUR.medium, scrollFollow = false } = {}) {
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const content = (header.nextElementSibling?.classList.contains('list-content')
    ? header.nextElementSibling
    : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
  const chevron = header.querySelector('.icon-chevron-list');
  const workshopItem = header.closest('.list-item');

  // 標題（與手機國旗列）transform 在收合「開始」就反向滑回，與 content 收合並行 = 鏡像 open
  // （open 時 .active 一加，title 就跟 content 同步滑出）。原本這兩個位移綁 .active，而 .active 延到
  // onComplete 才移除 → 收起時 title 等 content 收完(~0.5s)才滑回(~0.3s 尾巴)＝開合不對稱（user 2026-06-15
  // probe 證 close 多 ~230ms 尾）。在此 inline 反向觸發同一條 CSS transition(DUR.fast) 提前並行；
  // .active 仍保留到 onComplete（背景 / sticky / 副標收合時序不變）。onComplete 清 inline，此時 .active
  // 已移除、CSS 同為原位（title translateX0 / meta padding0）→ 清 inline 不跳動。
  const titleEl = /** @type {HTMLElement|null} */ (header.querySelector(':scope > div:first-child'));
  const metaMobileEl = /** @type {HTMLElement|null} */ (header.querySelector('.list-header-meta-mobile'));
  if (titleEl) titleEl.style.transform = 'translateX(0)';
  if (metaMobileEl) metaMobileEl.style.paddingLeft = '0';

  header.dataset.collapsing = 'true';
  // 收合動畫開始前先把 overflow 切回 hidden — 否則 open 階段設的 overflow:visible 還在，
  // tween height:0 時子元素（如 album 縮圖、gallery 圖）會因 visible 飄在自然位置不被裁切，
  // 視覺上「容器縮起來但內容卡在原位」直到 onComplete 才瞬間消失
  content.style.overflow = 'hidden';

  // 收合「靠底部的 item」會跳：footer-safe 開著的 item 必停在 ≈maxScroll，content 縮 → 文件變矮 → 新 maxScroll < 現 scrollY
  //   → 瀏覽器把 scrollY clamp 到新 maxScroll → 整個 section「跳」上來（user 2026-06-28）。
  // 對策（mirror open 的「邊捲邊展開」）：self-close 時與收合**同步、同 duration/ease** 往上捲到「收合後的 maxScroll」，
  //   讓 footer 一路貼著視窗底、scrollY 全程 ≤ maxScroll → 不 clamp、section 不跳（視覺＝往下收、footer 不動）。
  //   只在「確實接近底部(postMax < 現 scrollY)」才捲；中段 item 收合在底部以上、postMax ≥ scrollY → 不捲。
  //   scrollFollow 只給 self-close（開新 item 的 close-others 不捲，落點由隨後的 proceedOpen 重算）。
  if (scrollFollow) {
    const collapseAmount = content.getBoundingClientRect().height;
    // 桌面 inner-scroll：收合靠底 item → scroller 變矮 → scroller.scrollTop 被 clamp → 跳；同步往上捲 scroller（footer/snap 不在
    //   scroller）。手機（<768，無 frame）：原 window scrollFollow（footer 在 window 文件底）。
    const scroller = /** @type {HTMLElement|null} */ ((window.innerWidth >= 768) ? header.closest('.inner-scroll-scroll-col') : null);
    if (scroller) {
      // postMax 須一併扣掉「一律對齊頂部」的底部 spacer（收合後 onComplete 會把 spacer 歸零）→ 捲到的落點 = 清掉 spacer 後的真 maxScroll，
      //   scrollTop 先到那 → onComplete 清 spacer 時 scrollTop ≤ 新 maxScroll、不 clamp 跳。
      const sp = /** @type {HTMLElement | null} */ (scroller.querySelector(':scope > .box-scroll-spacer'));
      const spacerH = sp ? sp.getBoundingClientRect().height : 0;
      const postMax = Math.max(0, scroller.scrollHeight - collapseAmount - spacerH - scroller.clientHeight);
      // 用 gsap（非 native scrollTo smooth）：native smooth 不受序列鎖（listAnimating）追蹤、會「活」過 onComplete →
      //   緊接的 re-open gsap 捲動跟殘留的 native smooth 互搶 → 內容「往上縮一下又突然正常」（只有觸發 scrollFollow 的
      //   靠底 item＝最後一筆中招，user 2026-06-30）。gsap 同 duration/ease + overwrite → 收進序列、re-open 前必被 overwrite。
      if (postMax < scroller.scrollTop - 1) gsap.to(scroller, { scrollTop: postMax, duration, ease: EASE.exitSoft, overwrite: true });
    } else {
      const postMax = Math.max(0, document.documentElement.scrollHeight - collapseAmount - window.innerHeight);
      if (postMax < window.scrollY - 1) scrollWindowNoSnap(postMax, { duration, ease: EASE.exitSoft });
    }
  }

  gsap.to(content, {
    height: 0,
    duration,
    ease: EASE.exitSoft,
    onComplete: () => {
      // collapse 完成才移除 .active（背景/sticky/副標收合的持久態都靠它）；title/meta 位移已在收合開始時
      // inline 反向滑回（與 content 並行，見上）→ 移除 .active 後 CSS 同為原位，清 inline 不跳動
      header.classList.remove('active');
      content.setAttribute('inert', ''); // 無障礙：收合完成 → 內容移出 tab 順序
      if (titleEl) titleEl.style.transform = '';
      if (metaMobileEl) metaMobileEl.style.paddingLeft = '';
      // title translateX 復位後 0.3s 才到位，等 transition 結束再 dispatch 讓 marquee 重新測寬
      setTimeout(() => workshopItem?.dispatchEvent(new Event('gallery:check')), 320);
      // sticky-pin observer 跟著 active state 走：close 後不需偵測 pinned（header 已不 sticky）
      detachStickyPinObserver(header);
      header.style.background = '';
      content.style.background = '';
      if (workshopItem) {
        workshopItem.style.background = '';
        workshopItem.style.removeProperty('--item-color');
        workshopItem.style.removeProperty('--item-color-deep');
      }
      delete header.dataset.accentHex;
      delete header.dataset.collapsing;
      // 「一律對齊頂部」spacer：self-close 收完才清（scrollFollow 已把 scrollTop 帶到 postMax ≤ 清掉後 maxScroll → 不跳）。
      //   close-others（scrollFollow=false）不清，交給隨後的 proceedOpen 重算（避免多一次 clamp）。
      if (scrollFollow) resetBoxSpacer(header);
      // cursor 若仍在 header 上補回 hover bg（mouseenter 不會 re-fire）
      if (header.matches(':hover')) {
        const refill = SCCDHelpers.getRandomAccentColor();
        header.style.background = refill;
        header.dataset.accentHex = refill;
      }
      resolveDone();
    }
  });
  if (chevron) gsap.to(chevron, { rotation: -90, duration: DUR.fast });  // close → 朝下（-90=下；90=上）
  return done;
}

function initListHeaderAccordion() {
  const workshopHeaders = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.list-header'));

  if (workshopHeaders.length === 0) return;

  workshopHeaders.forEach(header => {
    if (header.dataset.accordionInit) return;
    // 永遠展開的 list-item（如 permanent exhibitions）— 跳過所有 accordion 行為
    // 否則下方 gsap.set(content, height:0) 會把預設可見的 list-content 強制收起
    if (header.closest('.list-item')?.hasAttribute('data-no-accordion')) return;
    header.dataset.accordionInit = '1';

    // 無障礙：鍵盤展開觸發改用 header 內的 <button class="list-header-toggle">（template 產生、原生可鍵盤聚焦 +
    // 帶 aria-expanded/aria-label）。.list-header 本身維持普通 <div>（滑鼠點整列展開靠下方 click handler），
    // 刻意不設 role=button——否則它內含 share <button> 會變「按鈕內嵌按鈕」(nested-interactive + button-name fail,
    // axe 4.1.2)。toggle button 的 click 冒泡到此 header handler、共用同一條展開邏輯；aria-expanded 在 click
    // handler 內同步到 toggle button。

    // Initialization: Ensure content is hidden properly for GSAP
    // nextElementSibling may be the flex wrapper; fall back to .list-content in parent
    const content = (header.nextElementSibling?.classList.contains('list-content')
      ? header.nextElementSibling
      : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
    gsap.set(content, { height: 0, overflow: 'hidden' });
    // 無障礙：收合的 list-content 是 height:0 overflow:hidden（非 display:none）→ 內部 ref/share/gallery
    // 仍在 Tab 順序＝收合時 Tab 會落到看不見的元素。inert 把收合內容移出 tab 與 a11y 樹，open 時移除。
    if (content) content.setAttribute('inert', '');

    // Hover: 未展開時顯示隨機色，展開後 hover 不改色
    // collapsing flag 防止收合動畫期間 cursor 離開時清掉 inline bg → 字色 flicker
    // opening flag 同理：兩段式「先收舊的」期間 header 還沒 .active 但已選定要開，cursor 離開別清掉 hover bg
    header.addEventListener('mouseenter', function() {
      if (!this.classList.contains('active') && !this.dataset.collapsing && !this.dataset.opening) {
        const color = SCCDHelpers.getRandomAccentColor();
        this.style.background = color;
        this.dataset.accentHex = color;
      }
    });
    header.addEventListener('mouseleave', function() {
      if (!this.classList.contains('active') && !this.dataset.collapsing && !this.dataset.opening) {
        this.style.background = '';
        delete this.dataset.accentHex;
      }
    });

    header.addEventListener('click', function(e) {
      if (/** @type {HTMLElement} */ (e.target).closest('[data-share-btn]')) return;
      if (listAnimating) return;  // 兩段式收/開序列進行中，忽略點擊避免 race（連點不同 item）
      const content = /** @type {HTMLElement} */ ((this.nextElementSibling?.classList.contains('list-content')
        ? this.nextElementSibling
        : this.closest('.list-item')?.querySelector('.list-content')) || this.nextElementSibling);
      const chevron = this.querySelector('.icon-chevron-list');

      // 先判斷狀態再決定動作 — close path 不可在這裡先移除 .active
      // （否則 title transform transition 立刻啟動，違反「先收起再 title 左移」順序）
      // close: 由 closeListHeader 在 onComplete 移除 .active
      const wasActive = this.classList.contains('active');
      const isActive = !wasActive;
      this.querySelector('.list-header-toggle')?.setAttribute('aria-expanded', String(isActive)); // 無障礙：報讀展開狀態（在 toggle button 上）
      // open：.active 延到 proceedOpen（真正展開時）才加。兩段式「先收回舊的 ~0.4s」期間，若此刻就 add .active，
      // 副標會立刻收合（lectures：.active 即收）→ header 縮成矮的彩色短條、但內容還沒展開＝user 看到「click 當下
      // 彩色比 hover 矮一截」。改用 dataset.opening 標記，期間 header 維持 hover 樣子；proceedOpen 才 add .active
      // ＝副標收合與內容展開同時發生（連貫）。
      if (isActive) this.dataset.opening = '1';

      const workshopItem = /** @type {HTMLElement | null} */ (this.closest('.list-item'));
      if (isActive) {
        // chevron 立刻轉（鏡像 closeListHeader 的同步轉法）：原本寫在 proceedOpen 內 →
        // 開新 item 時 proceedOpen 要等「其他已展開 item 收回」(DUR.base) 才跑，chevron 因此延遲才轉，
        // 但收起是 click 當下就轉＝兩邊不對稱（user 2026-06-15）。內容兩段式展開邏輯不動，只把 chevron 提前。
        if (chevron) gsap.to(chevron, { rotation: 90, duration: DUR.fast });  // open → 朝上（90=上）
        // 預設一次只開一個：開啟前先關掉同 panel 內其他展開中的 accordion
        // 非 activities 頁面（如 admission detail）無 .activities-panel，fallback 到 document
        const scope = this.closest('.activities-panel') || document;
        const others = [...scope.querySelectorAll('.list-header.active')].filter(o => o !== this);

        // navigateToItem (ref/deep-link) 在 click 此 header 前已自己 scroll 對齊好 item → 標記 skipOpenScroll，
        // 跳過 proceedOpen 內的開啟捲動（deep-link 是全新 panel、上方無展開，已對齊好不要再動）。
        const skipOpenScroll = this.dataset.skipOpenScroll === '1';
        delete this.dataset.skipOpenScroll;

        // === 開 item 對齊 + search bar 處理（2026-06-09 重構）===
        // 兩段式：先「動畫收回」其他已展開 item → 收完才量 header 落點 → 捲到 pin 線 + 平滑收 search bar + 展開。
        //
        // search bar 改兩點（user 2026-06-09）：① 平滑收（走 CSS 0.3s transition，不再 transition:none 瞬間收）
        //   ② 不鎖死——開啟後 scroll-up 仍可由 activities-search.js 還原 search bar（捲動驅動，非永久鎖收）。
        // 對齊不變式：targetScrollY = headerDocTop − stickyTop 對 search bar 收合「不變」——收 bar 會讓 header 的
        //   doc 位置與 pin 線同步上移一個 searchInner 高，相減抵消。所以用「當前 bar 狀態」量測即正確，量完才收 bar，
        //   header 靠 document flow 自然滑到收合後 pin 線（不需 transition:none、不需凍結 pin 線、不需事後校正）。
        //   ⇒ 順序＝先量當前態 → 再平滑加 bar-hidden。
        // admission 無 .activities-filter-bar → activeFilterBar=null skip 收 bar，stickyTop 走 fallback 200。
        const activeFilterBar = /** @type {HTMLElement | null} */ (this.closest('.activities-panel')?.querySelector('.activities-filter-bar'));
        const self = this;
        listAnimating = true;  // 鎖住：兩段式序列期間忽略新點擊，避免連點 race

        const proceedOpen = () => {
          // 真正展開才轉 .active：副標收合（lectures .active 即收）與內容展開同時發生＝連貫，
          // 避免「先 active 收副標縮短 → 等收舊的 0.4s → 才展開」中間露出矮的彩色短條（見 click 處註解）。
          self.classList.add('active');
          content.removeAttribute('inert'); // 無障礙：展開 → 內容回到 tab 順序（gallery/ref 可聚焦）
          delete self.dataset.opening;
          // point 3 修：已收回的 others 副標剛移除 .active 正走 0.3s 重新展開 → snap 定高，否則量測差一個副標高
          others.forEach(snapSubtitleHeight);

          // 桌面 inner-scroll（2026-06-29）：捲動在右欄 .inner-scroll-scroll-col（snap 在 window、不在 scroller）→ **不** lockSnapOff、
          //   **不** clampBelowFooter（footer 在 frame 外、捲 scroller 不可能露）、**不** temp-expand 量 footer。
          //   手機（<768，無 frame）走原 window 邏輯：lockSnapOff + 真實量測 clampBelowFooter + scrollWindowNoSnap。
          const innerScroller = /** @type {HTMLElement|null} */ ((window.innerWidth >= 768) ? self.closest('.inner-scroll-scroll-col') : null);
          if (!innerScroller) lockSnapOff();  // 只有 window snap 頁(手機；桌面 frame 有 scroller)開 item 期間鎖 snap
          let openBoxTarget = null;  // 桌面：開合捲動目標，給 content 展開 onComplete 收齊對位（見下）用

          // Open - header / content 都保留 100% accent；ref 用對應 deep 色。**先上色**（兩段式 staged 捲動期間 header 已是
          // accent，不會「對齊捲動時還透明/hover、捲完才上色」閃一下）。content height:0 不可見，content/item 底色一起設無妨。
          // workshopItem 也染同色：sticky header 與 content 在 fractional pixel 位置會出現 1-2px paint 縫，父層 .list-item 連續底色蓋縫。
          const color = self.dataset.accentHex || SCCDHelpers.getRandomAccentColor();
          self.dataset.accentHex = color;
          self.style.background = color;
          content.style.background = color;
          const deep = ACCENT_TO_DEEP[color] || color;
          if (workshopItem) {
            workshopItem.style.background = color;
            workshopItem.style.setProperty('--item-color', color);
            workshopItem.style.setProperty('--item-color-deep', deep);
          }

          // === 對齊捲動 === alignDone：真的有捲時換成 tween 的 Promise，否則維持已 resolve（立即可展開）。
          let alignDone = Promise.resolve();
          if (!skipOpenScroll) {
            const stickyTop = getListStickyTop(self);  // = --list-header-sticky-top（桌面 = clearance+filterBarH，scroller 內偏移）
            if (innerScroller) {
              // ★「開的 item 一律對齊頂部」(user 2026-06-30)：捲 scroller 讓 header 對齊 sticky 線（filter bar 正下方）。短 list
              //   內容填不滿 box → 光捲動到不了頂 → box 末尾放 spacer 補捲動空間（下方留白）。**寬鬆策略**：開時 spacer 給足夠大
              //   (targetTop+clientHeight) → 保證展開動畫全程 maxScroll≥targetTop、GSAP 平滑捲到頂不被夾短；
              //   content onComplete 再把 spacer 修剪成「剛好」(長 list=0、短 list 留剛好) 並收齊對位（見下）。
              //   ⚠️ 不用「temp-expand 量精確 spacer」：開合當下其他 item 副標/圖還在 settle，量到的 maxScroll 不準 → spacer 偏小。
              const spacer = getBoxSpacer(innerScroller);
              const headerInScroller = self.getBoundingClientRect().top - innerScroller.getBoundingClientRect().top + innerScroller.scrollTop;
              const targetTop = Math.max(0, Math.round(headerInScroller - stickyTop));
              openBoxTarget = targetTop;                                       // 給 content onComplete 收齊 + 修剪 spacer 用
              spacer.style.height = (targetTop + innerScroller.clientHeight) + 'px';  // 寬鬆上限（onComplete 修剪成剛好）
              if (Math.abs(targetTop - innerScroller.scrollTop) > 1) {
                alignDone = new Promise(res => gsap.to(innerScroller, { scrollTop: targetTop, duration: DUR.medium, ease: EASE.enterSoft, overwrite: true, onComplete: res }));
              }
            } else {
              // 手機修正（user 2026-06-24）：手機 bar 非 sticky、pin 線(8rem)不隨 bar 動 → 預先扣掉「即將收起」的 searchInner 高。
              const barInner = activeFilterBar && !activeFilterBar.classList.contains('bar-hidden')
                ? (/** @type {HTMLElement | null} */ (activeFilterBar.querySelector('.activities-search-inner'))?.offsetHeight || 0)
                : 0;
              const barCollapseDelta = window.innerWidth < 768 ? barInner : 0;
              const headerDocTop = self.getBoundingClientRect().top + window.scrollY;
              const alignTop = Math.max(0, Math.round(headerDocTop - stickyTop - barCollapseDelta));
              // 真實量測：暫撐開 content 量「展開後」真 footer 再收回（不被 min-height:100vh 留白騙）；footerShift −barInner 補 bar 收合。
              gsap.set(content, { height: 'auto' });
              const targetScrollY = clampBelowFooter(alignTop, -barInner);
              gsap.set(content, { height: 0 });
              if (Math.abs(targetScrollY - window.scrollY) > 1) {
                alignDone = new Promise(res => scrollWindowNoSnap(targetScrollY, { duration: DUR.medium, ease: EASE.enterSoft, onComplete: res }));
              }
            }
          }

          // 量測「之後」才平滑收 search bar（走 CSS 0.3s transition）。不鎖死 → scroll-up 由 activities-search.js 還原。
          // 桌面 inner-scroll 也收（user 2026-06-30「開 item 就收起搜尋列、往上滑才叫回」）：bar 是 sticky，收合讓
          //   header flow 位置與 pin 線同步上移一個 searchInner 高 → 量測在前(line 524)的 targetTop 不變式仍成立、開的
          //   item 維持對齊（與手機 doc-flow 同理）。show 半邊由 colScrollHandler 只在 scroll-up 移除 bar-hidden 接管。
          if (activeFilterBar) activeFilterBar.classList.add('bar-hidden');

          // 展開內容（height 0→auto）。抽成函式以支援兩段式：開新 item 時等對齊捲完才跑。
          const doExpand = () => {
            gsap.to(content, {
              height: 'auto', duration: DUR.medium, ease: EASE.enterSoft,
              onComplete: () => {
                content.style.overflow = 'visible';
                // 桌面 inner-scroll：content 展開完 maxScroll 才定案 → 把寬鬆 spacer 修剪成「剛好」(長 list=0) 並收齊對位。
                if (innerScroller && openBoxTarget !== null) {
                  const sp = getBoxSpacer(innerScroller);
                  const maxNoSpacer = innerScroller.scrollHeight - sp.getBoundingClientRect().height - innerScroller.clientHeight;
                  sp.style.height = Math.max(0, Math.round(openBoxTarget - maxNoSpacer)) + 'px';
                  innerScroller.scrollTop = openBoxTarget;
                }
                workshopItem?.dispatchEvent(new Event('gallery:check'));
                listAnimating = false;  // 序列完成解鎖
              }
            });
            // sticky-pin observer: 開展瞬間就 attach（header 在自然位置 ratio=1 → 不 pinned）；之後滾過 sticky 線 IO 才加 .is-pinned
            attachStickyPinObserver(self);
          };

          // 兩段式（user 2026-06-30）：開新 item（剛動畫收回其他展開項）時「先捲對齊 → 捲完才展開」，不那麼 rush、較順；
          //   無其他展開項（自開 / 同一筆 re-open）維持「對齊捲動與展開並行」（原行為、較即時）。
          if (others.length) alignDone.then(doExpand);
          else doExpand();
        };

        // 先「動畫收回」其他已展開 item（DUR.base，比自關 DUR.medium 短，序列不拖）→ 全部收完才 proceedOpen。
        if (others.length) {
          Promise.all(others.map(other => closeListHeader(other, { duration: DUR.base }))).then(proceedOpen);
        } else {
          proceedOpen();
        }
      } else {
        listAnimating = true;
        // 自關 item → unlockSnap 交回 mandatory。開新 item 走的是上面「close others → proceedOpen」路徑、不經這裡
        // （proceedOpen 會重新 lockSnapOff），故只有「使用者自己關掉」才在這裡解鎖。
        closeListHeader(this, { scrollFollow: true }).then(() => { listAnimating = false; unlockSnap(); });
      }
    });
  });
}

/**
 * Main export function
 */
export function initListAccordion() {
  listAnimating = false;  // module 常駐記憶體：頁面 init 時重置鎖，避免上次離頁時序列未完成殘留 true 卡死
  clearStaleOpeningFlags();
  initListYearToggle();
  initListHeaderAccordion();
}
