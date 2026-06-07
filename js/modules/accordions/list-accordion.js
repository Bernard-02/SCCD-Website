import { DUR, EASE } from '../ui/motion.js';
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
          if (chevron) gsap.to(chevron, { rotation: 90, duration: DUR.fast });
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

  // 副標 wrapper：移 .active 會讓「收起的副標」重新展開（lectures 一 active 就收 / 其他頁 .is-pinned 才收）。
  // instant close 要讓它「瞬間」展開（不走 0.3s grid-rows transition），否則開新 item 量上方位置時副標還在長、
  // 落點會差一個副標高（lecture 實測差 ~53px）。transition:none 瞬間定高，rAF 後還原讓正常互動仍平滑。
  // 用 .list-subtitles → closest 取 wrapper（不用 :has querySelector，避免舊瀏覽器丟 SyntaxError）
  const subEl = header.querySelector('.list-subtitles');
  const subWrap = /** @type {HTMLElement | null} */ (subEl ? subEl.closest('.clip-reveal-wrapper') : null);
  if (subWrap) {
    subWrap.style.transition = 'none';
    requestAnimationFrame(() => { subWrap.style.transition = ''; });
  }

  if (workshopItem) {
    workshopItem.style.background = '';
    workshopItem.style.removeProperty('--item-color');
    workshopItem.style.removeProperty('--item-color-deep');
  }

  if (content && typeof gsap !== 'undefined') {
    gsap.killTweensOf(content);
    gsap.set(content, { height: 0, overflow: 'hidden' });
    content.style.background = '';
  }

  if (chevron && typeof gsap !== 'undefined') {
    gsap.killTweensOf(chevron);
    gsap.set(chevron, { rotation: 90 });  // reset → list-header close state 朝下
  }
}

/**
 * Instant 收合 panel 內所有打開的 list-header accordion（無動畫）
 * 用於 activities/admission section 切換時把 target panel 內遺留的 open state 清空，
 * 避免「打開 A → 切到 B → 切回 A 時 accordion 仍開」的殘留體驗
 */
export function resetListAccordionsInPanel(panel) {
  if (!panel) return;
  const openHeaders = panel.querySelectorAll('.list-header.active');
  if (!openHeaders.length) return;
  openHeaders.forEach(header => instantCloseListHeader(header));
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
  // 計算 stickyTop：activities 頁是設在 container（不是 header）上，所以從 closest ancestor 找該 var
  // closest 找不到走 header.computed → fallback 200 (admission 預設)
  const container = header.closest('[style*="--list-header-sticky-top"]') || header;
  const stickyTopVar = getComputedStyle(container).getPropertyValue('--list-header-sticky-top').trim();
  const stickyTop = parseFloat(stickyTopVar) || 200;

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
    header.classList.toggle('is-pinned', !entry.isIntersecting);
  }, {
    root: null,
    rootMargin: `-${stickyTop}px 0px 0px 0px`,
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
}

// 收合單一 header（從 click handler 與「開新時關舊」共用）
// 收合順序：先 collapse content（保留 .active）→ onComplete 移除 .active 觸發 title 往左 transform transition
function closeListHeader(header) {
  const content = (header.nextElementSibling?.classList.contains('list-content')
    ? header.nextElementSibling
    : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
  const chevron = header.querySelector('.icon-chevron-list');
  const workshopItem = header.closest('.list-item');

  header.dataset.collapsing = 'true';
  // 收合動畫開始前先把 overflow 切回 hidden — 否則 open 階段設的 overflow:visible 還在，
  // tween height:0 時子元素（如 album 縮圖、gallery 圖）會因 visible 飄在自然位置不被裁切，
  // 視覺上「容器縮起來但內容卡在原位」直到 onComplete 才瞬間消失
  content.style.overflow = 'hidden';
  gsap.to(content, {
    height: 0,
    duration: DUR.medium,  // 與開啟動畫同 duration，確保「關舊+開新」同時開始同時結束
    ease: EASE.exitSoft,
    onComplete: () => {
      // collapse 完成才移除 .active → title transform 0.3s 往左滑（CSS transition 觸發）
      header.classList.remove('active');
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
      // cursor 若仍在 header 上補回 hover bg（mouseenter 不會 re-fire）
      if (header.matches(':hover')) {
        const refill = SCCDHelpers.getRandomAccentColor();
        header.style.background = refill;
        header.dataset.accentHex = refill;
      }
    }
  });
  if (chevron) gsap.to(chevron, { rotation: 90, duration: DUR.fast });  // close → 朝下
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

    // Initialization: Ensure content is hidden properly for GSAP
    // nextElementSibling may be the flex wrapper; fall back to .list-content in parent
    const content = (header.nextElementSibling?.classList.contains('list-content')
      ? header.nextElementSibling
      : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
    gsap.set(content, { height: 0, overflow: 'hidden' });

    // Hover: 未展開時顯示隨機色，展開後 hover 不改色
    // collapsing flag 防止收合動畫期間 cursor 離開時清掉 inline bg → 字色 flicker
    header.addEventListener('mouseenter', function() {
      if (!this.classList.contains('active') && !this.dataset.collapsing) {
        const color = SCCDHelpers.getRandomAccentColor();
        this.style.background = color;
        this.dataset.accentHex = color;
      }
    });
    header.addEventListener('mouseleave', function() {
      if (!this.classList.contains('active') && !this.dataset.collapsing) {
        this.style.background = '';
        delete this.dataset.accentHex;
      }
    });

    header.addEventListener('click', function(e) {
      if (/** @type {HTMLElement} */ (e.target).closest('[data-share-btn]')) return;
      const content = /** @type {HTMLElement} */ ((this.nextElementSibling?.classList.contains('list-content')
        ? this.nextElementSibling
        : this.closest('.list-item')?.querySelector('.list-content')) || this.nextElementSibling);
      const chevron = this.querySelector('.icon-chevron-list');

      // 先判斷狀態再決定動作 — close path 不可在這裡先移除 .active
      // （否則 title transform transition 立刻啟動，違反「先收起再 title 左移」順序）
      // open: 直接 add；close: 由 closeListHeader 在 onComplete 移除
      const wasActive = this.classList.contains('active');
      const isActive = !wasActive;
      if (isActive) this.classList.add('active');

      const workshopItem = /** @type {HTMLElement | null} */ (this.closest('.list-item'));
      if (isActive) {
        // 預設一次只開一個：開啟前先關掉同 panel 內其他展開中的 accordion
        // 非 activities 頁面（如 admission detail）無 .activities-panel，fallback 到 document
        const scope = this.closest('.activities-panel') || document;
        const others = [...scope.querySelectorAll('.list-header.active')].filter(o => o !== this);

        // navigateToItem (ref/deep-link) 在 click 此 header 前已自己 scroll 對齊好 item → 標記 skipOpenScroll，
        // 跳過下面 step(3) 的開啟捲動（deep-link 是全新 panel、上方無展開，已對齊好不要再動）。
        const skipOpenScroll = this.dataset.skipOpenScroll === '1';
        delete this.dataset.skipOpenScroll;

        // === 開 item 對齊（2026-06-08 重寫，workflow 收斂 + user 拍板）===
        // 原理：把版面先變成「展開後的定局」（收搜尋列凍結 pin 線 + 瞬間關掉上方其他 item），量到 header 真實
        // 位置，再唯一一次捲到「該 header 落在固定 pin 線」。精準完全由 CSS position:sticky 接管（已 playwright
        // 實測 pixel 級準）— JS 不再預測落點，根治舊版「有的準有的差幾 px」。
        // 取代了舊的 collapseAbove 預測 + settle 二次校正兩段（都刪了，那是「差幾 px」的殘餘來源）。
        // user 拍板：① 只收 search bar、type-filter 留著 ② 上方其他 item 瞬間收合（落點 100% 準）。
        // admission 也用 .activities-panel class 但無 .activities-filter-bar → 下面 null skip，走 fallback 200，更單純。
        const stickyContainer = this.closest('[style*="--list-header-sticky-top"]');
        let stickyTop = stickyContainer
          ? (parseFloat(getComputedStyle(stickyContainer).getPropertyValue('--list-header-sticky-top')) || 200)
          : 200;

        // (1) 收起搜尋列（保留 type-filter）+ 同步把 pin 線凍結成「收起後」固定值（不等 ResizeObserver 慢一拍）。
        //     收起用「瞬間」(transition:none)：避免 ①bar 0.3s 收合期間 header 從仍展開的 bar 下緣冒出來
        //     ②ResizeObserver 在收合中途用 intermediate 高回寫 var 造成 pin 線抖。rAF 後還原 transition，全關時平滑滑回。
        const activeFilterBar = /** @type {HTMLElement | null} */ (this.closest('.activities-panel')?.querySelector('.activities-filter-bar'));
        if (activeFilterBar && !activeFilterBar.classList.contains('bar-hidden')) {
          const searchInner = /** @type {HTMLElement | null} */ (activeFilterBar.querySelector('.activities-search-inner'));
          if (searchInner) {
            stickyTop -= searchInner.offsetHeight;       // 收起搜尋列後 bar 變矮 → pin 線上移到收起後的值
            searchInner.style.transition = 'none';        // 瞬間收（layout 立即定局，量得到真值）
            requestAnimationFrame(() => { searchInner.style.transition = ''; });  // 還原 → 全關時平滑滑回
          }
          activeFilterBar.classList.add('bar-hidden');    // type-filter 不在 .activities-search-inner 內 → 保留
          if (stickyContainer) stickyContainer.style.setProperty('--list-header-sticky-top', stickyTop + 'px');
        }

        // (2) 瞬間關掉上方其他已展開的 item（無動畫）→ 版面立刻定局，取代 collapseAbove 預測。
        others.forEach(other => instantCloseListHeader(other));

        // (3) 強制 reflow 後量 header 真實 doc 位置 → 唯一一次捲到「落在 pin 線」。GSAP 保全站手感。
        //     getBoundingClientRect 讀取本身觸發 reflow，拿到 (1)(2) 都套用後的真值，落點精準、不需事後校正。
        if (!skipOpenScroll) {
          const headerDocTop = this.getBoundingClientRect().top + window.scrollY;
          const targetScrollY = Math.max(0, Math.round(headerDocTop - stickyTop));
          if (Math.abs(targetScrollY - window.scrollY) > 1) {
            if (typeof window.ScrollToPlugin !== 'undefined') {
              gsap.to(window, { scrollTo: { y: targetScrollY, autoKill: false }, duration: DUR.medium, ease: EASE.move });
            } else {
              window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
            }
          }
        }
        // Open - header / content 都保留 100% accent；ref 用對應 deep 色
        // workshopItem 也染同色：sticky header 與 content 在 fractional pixel 位置會出現 1-2px paint 縫，
        // 父層 .list-item 連續底色蓋住該縫；header 自己仍須保留 bg 用於 sticky 飄到別 item 上方時的覆蓋
        const color = this.dataset.accentHex || SCCDHelpers.getRandomAccentColor();
        this.dataset.accentHex = color;
        this.style.background = color;
        content.style.background = color;
        const deep = ACCENT_TO_DEEP[color] || color;
        if (workshopItem) {
          workshopItem.style.background = color;
          workshopItem.style.setProperty('--item-color', color);
          workshopItem.style.setProperty('--item-color-deep', deep);
        }
        gsap.to(content, {
          height: 'auto', duration: DUR.medium, ease: EASE.enterSoft,
          onComplete: () => {
            content.style.overflow = 'visible';
            workshopItem?.dispatchEvent(new Event('gallery:check'));
          }
        });
        gsap.to(chevron, { rotation: -90, duration: DUR.fast });  // open → 朝上
        // sticky-pin observer: 開展瞬間就 attach（user 還沒滾，header 在自然位置 ratio=1 → 不 pinned）
        // 之後 user 滾過 sticky-top 線時 IO 才 fire 加上 .is-pinned 收起副標
        attachStickyPinObserver(this);
      } else {
        closeListHeader(this);
      }
    });
  });
}

/**
 * Main export function
 */
export function initListAccordion() {
  initListYearToggle();
  initListHeaderAccordion();
}
