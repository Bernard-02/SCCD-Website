/**
 * Workshop Accordion Module
 * 工作營手風琴功能（包含 Year Toggle 和 Workshop Header）
 */

/**
 * Initialize Workshop Year Toggle (年份展開/收合)
 */
function initListYearToggle() {
  const workshopYearToggles = document.querySelectorAll('.list-year-toggle');

  if (workshopYearToggles.length === 0) return;

  // Initialize heights for all containers on page load
  workshopYearToggles.forEach(toggle => {
    const yearGrid = toggle.closest('.grid-12');
    if (yearGrid) {
      const itemsContainer = yearGrid.querySelector('.list-year-items');
      const chevron = yearGrid.querySelector('.fa-chevron-right');

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
      const chevron = yearGrid.querySelector('.fa-chevron-right');
      const itemsContainer = yearGrid.querySelector('.list-year-items');

      if (itemsContainer) {
        // Check if currently open (check if height is set and not 0)
        const isOpen = itemsContainer.style.height && itemsContainer.style.height !== '0px';

        if (isOpen) {
          // Close with GSAP animation
          gsap.to(itemsContainer, {
            height: 0,
            duration: 0.4,
            ease: "power2.in",
            onComplete: () => {
              itemsContainer.style.display = 'none';
            }
          });
          if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
        } else {
          // Open with GSAP animation
          itemsContainer.style.display = 'flex';
          gsap.to(itemsContainer, {
            height: 'auto',
            duration: 0.5,
            ease: "power2.out"
          });
          if (chevron) gsap.to(chevron, { rotation: 90, duration: 0.3 });
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

// 收合單一 header（從 click handler 與「開新時關舊」共用）
// 收合順序：先 collapse content（保留 .active）→ onComplete 移除 .active 觸發 title 往左 transform transition
function closeListHeader(header) {
  const content = (header.nextElementSibling?.classList.contains('list-content')
    ? header.nextElementSibling
    : header.closest('.list-item')?.querySelector('.list-content')) || header.nextElementSibling;
  const chevron = header.querySelector('.fa-chevron-down');
  const workshopItem = header.closest('.list-item');

  header.dataset.collapsing = 'true';
  // 收合動畫開始前先把 overflow 切回 hidden — 否則 open 階段設的 overflow:visible 還在，
  // tween height:0 時子元素（如 album 縮圖、gallery 圖）會因 visible 飄在自然位置不被裁切，
  // 視覺上「容器縮起來但內容卡在原位」直到 onComplete 才瞬間消失
  content.style.overflow = 'hidden';
  gsap.to(content, {
    height: 0,
    duration: 0.5,  // 與開啟動畫同 duration，確保「關舊+開新」同時開始同時結束
    ease: "power2.in",
    onComplete: () => {
      // collapse 完成才移除 .active → title transform 0.3s 往左滑（CSS transition 觸發）
      header.classList.remove('active');
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
  if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
}

function initListHeaderAccordion() {
  const workshopHeaders = document.querySelectorAll('.list-header');

  if (workshopHeaders.length === 0) return;

  workshopHeaders.forEach(header => {
    if (header.dataset.accordionInit) return;
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
      if (e.target.closest('[data-share-btn]')) return;
      const content = (this.nextElementSibling?.classList.contains('list-content')
        ? this.nextElementSibling
        : this.closest('.list-item')?.querySelector('.list-content')) || this.nextElementSibling;
      const chevron = this.querySelector('.fa-chevron-down');

      // 先判斷狀態再決定動作 — close path 不可在這裡先移除 .active
      // （否則 title transform transition 立刻啟動，違反「先收起再 title 左移」順序）
      // open: 直接 add；close: 由 closeListHeader 在 onComplete 移除
      const wasActive = this.classList.contains('active');
      const isActive = !wasActive;
      if (isActive) this.classList.add('active');

      const workshopItem = this.closest('.list-item');
      if (isActive) {
        // 預設一次只開一個：開啟前先關掉同 panel 內其他展開中的 accordion
        // 非 activities 頁面（如 admission detail）無 .activities-panel，fallback 到 document
        const scope = this.closest('.activities-panel') || document;
        const others = [...scope.querySelectorAll('.list-header.active')].filter(o => o !== this);

        // Scroll 對齊：點開時把 header 帶到 sticky 位置（與 close/open height tween 0.5s 同步）
        // 為什麼：A 收起時 document 縮短但 scrollY 不變 → B 自然位置被往上拉，sticky 規則只在 active
        // 啟用，動畫期間若 B 自然位置仍在 stickyTop 之下、collapse 過程又把整段往上推，B 可能整段
        // 飄出 viewport 上緣；點開前主動 tween scrollY 到「B 的最終 stickyTop 位置」確保收尾時對齊
        const headerRect = this.getBoundingClientRect();
        let collapseAbove = 0;
        others.forEach(other => {
          if (other.getBoundingClientRect().top < headerRect.top) {
            const c = (other.nextElementSibling?.classList.contains('list-content')
              ? other.nextElementSibling
              : other.closest('.list-item')?.querySelector('.list-content'));
            if (c) collapseAbove += c.offsetHeight;
          }
        });
        const stickyTopVar = getComputedStyle(this).getPropertyValue('--list-header-sticky-top').trim();
        const stickyTop = parseFloat(stickyTopVar) || (window.innerWidth >= 768 ? 200 : 100);
        const targetScrollY = Math.max(0, window.scrollY + headerRect.top - collapseAbove - stickyTop);
        if (Math.abs(targetScrollY - window.scrollY) > 1) {
          if (typeof window.ScrollToPlugin !== 'undefined') {
            gsap.to(window, {
              scrollTo: { y: targetScrollY, autoKill: false },
              duration: 0.5,
              ease: "power2.inOut",
            });
          } else {
            window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
          }
        }

        others.forEach(other => closeListHeader(other));
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
          height: 'auto', duration: 0.5, ease: "power2.out",
          onComplete: () => {
            content.style.overflow = 'visible';
            workshopItem?.dispatchEvent(new Event('gallery:check'));
          }
        });
        gsap.to(chevron, { rotation: 180, duration: 0.3 });
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
