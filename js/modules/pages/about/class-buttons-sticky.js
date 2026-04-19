/**
 * Class Buttons Sticky + Works Reveal
 * 桌面版：
 *   1. #class-buttons-sticky 用 CSS sticky 貼頂（純 CSS，此 JS 不重複設定）
 *      sticky 範圍涵蓋圖文（class-info-area）+ works（class-works-panels）
 *   2. 圖文區塊底部到達視窗中線時，works playlist 直接顯示
 *   3. 同時切換 scroll context（'info' / 'works'），供 BFA toggle 判斷
 *      讓使用者在 works 區塊點按鈕時不觸發圖文進場動畫
 *   4. #works anchor 動態設定 scroll-margin-top，剛好停在 sticky btn 下方
 * 手機版：不執行（直接 return）
 */

export function initClassButtonsSticky() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.innerWidth < 768) return;

  const infoArea          = document.getElementById('class-info-area');
  const worksPanels       = document.getElementById('class-works-panels');
  const classButtonsEl    = document.getElementById('class-buttons-sticky');
  const worksAnchor       = document.getElementById('works');

  if (!infoArea || !worksPanels || !classButtonsEl) return;

  // ─── 初始狀態 ──────────────────────────────────────────────
  // 預設 scroll context = 'info'，BFA toggle 可透過 window.SCCD_classContext 讀取
  window.SCCD_classContext = 'info';
  // works panels 不再用 opacity 隱藏；natural scroll 揭露

  // ─── 動態設定 #works 的 scroll-margin-top ─────────────────
  // 讓 anchor 跳轉時剛好停在 sticky btn 下方（btn 上緣 + btn 高度 + 些許 buffer）
  function updateWorksScrollMargin() {
    if (!worksAnchor) return;
    const topOffset = parseFloat(getComputedStyle(classButtonsEl).top) || 0;
    const btnHeight = classButtonsEl.getBoundingClientRect().height || 0;
    worksAnchor.style.scrollMarginTop = `${topOffset + btnHeight + 16}px`;
  }
  // 等 layout 穩定後再量
  requestAnimationFrame(updateWorksScrollMargin);
  window.addEventListener('resize', updateWorksScrollMargin);

  // ─── 封鎖綫可見性 → 切換 btn 白底遮罩 ─────────────────────
  // 封鎖綫在視窗內：btn 透明（讓封鎖綫顯示）
  // 封鎖綫離開視窗：btn 加白底 + ::before 補白（遮擋往上滾的內容）
  const titleStrip = document.querySelector('#class .section-title-strip');
  if (titleStrip) {
    const stripObserver = new IntersectionObserver(
      ([entry]) => {
        classButtonsEl.classList.toggle('is-stuck', !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    stripObserver.observe(titleStrip);
  }

  // ─── 同步 info panel 與目前 active 的 division（無動畫） ──
  // 透過 slideshow.switchTo 進行切換，確保新 panel 的 images 會被 renderFresh
  // （單純 toggle hidden 會讓 panel 顯示但 images container 為空）
  function syncInfoPanelToActive() {
    const activeBtn = document.querySelector('.class-division-btn.active');
    if (!activeBtn) return;
    const divisionId = activeBtn.getAttribute('data-division');
    // BFA 在 info ctx 沒有對應 panel → fallback 到 animation
    const infoId = divisionId === 'bfa' ? 'animation' : divisionId;
    if (window.SCCD_classSlideshow?.switchTo) {
      window.SCCD_classSlideshow.switchTo(infoId, false);
    } else {
      document.querySelectorAll('.class-info-panel').forEach(el => {
        el.classList.toggle('hidden', el.getAttribute('data-division') !== infoId);
      });
    }
  }

  // ─── ScrollTrigger：圖文 → works 過渡 ────────────────────────
  // 首次進入 works（本次 About 訪問）時自動 active BFA；之後保留使用者選擇
  let hasEnteredWorks = false;

  ScrollTrigger.create({
    trigger: infoArea,
    start: 'bottom 55%',   // 圖文底部到達視窗 55% 時觸發

    onEnter: () => {
      // 進入 works context
      window.SCCD_classContext = 'works';
      classButtonsEl.classList.add('is-works-context');
      // 讓 wrapper 也標記，供 CSS descendant 選到 class-info-panel 內的 imgs + text 淡出
      const stickyWrapper = document.getElementById('class-info-sticky-wrapper');
      if (stickyWrapper) stickyWrapper.classList.add('is-works-active');
      // 圖文取消互動，自然往上滾
      infoArea.style.pointerEvents = 'none';
      // works panels 不再做 opacity，永遠 visible；natural scroll 過渡
      // 首次進入：強制 active BFA（顯示 design fundamental 內容）
      // animate=false：直接 instant 顯示 bfa，避免出現「animation → bfa」切換動畫
      if (!hasEnteredWorks) {
        hasEnteredWorks = true;
        if (typeof window.SCCD_setDivisionActive === 'function') {
          window.SCCD_setDivisionActive('bfa', false);
        }
      }
    },

    onLeaveBack: () => {
      // 回到 info context
      window.SCCD_classContext = 'info';
      const activeBtn = document.querySelector('.class-division-btn.active');
      const wasBfaActive = activeBtn?.getAttribute('data-division') === 'bfa';

      // 移除 is-works-context，CSS transition 自然 reverse clip-path（左→右揭露的反向）
      classButtonsEl.classList.remove('is-works-context');
      const stickyWrapper = document.getElementById('class-info-sticky-wrapper');
      if (stickyWrapper) stickyWrapper.classList.remove('is-works-active');
      // 圖文恢復互動
      infoArea.style.pointerEvents = 'auto';
      // works panels 維持 visible（不再 opacity 操作）

      if (wasBfaActive) {
        // BFA 在 class mode 沒有 info panel，改顯示 animation 的
        document.querySelectorAll('.class-info-panel').forEach(el => {
          el.classList.toggle('hidden', el.getAttribute('data-division') !== 'animation');
        });
        // 等 wrap 完全收起後（CSS transition 0.5s）才重置 BFA 按鈕的 active 狀態，
        // 避免使用者看到 BFA 顏色在收起過程中跳變
        setTimeout(() => {
          if (window.SCCD_classContext === 'info' &&
              typeof window.SCCD_setDivisionActive === 'function') {
            window.SCCD_setDivisionActive('animation');
          }
        }, 500);
      } else {
        // 把 info panel 同步成目前 active 的 division，避免使用者在 works 切過後上來看到舊的
        syncInfoPanelToActive();
      }
    }
  });

  // ─── 初始進場動畫（圖文第一次進入視窗）─────────────────────────
  const initialPanel = infoArea.querySelector('.class-info-panel[data-division="animation"]');
  if (initialPanel) {
    // 不用 once:true，因為 slideshow 是 async init，ScrollTrigger 首次觸發時 slideshow 可能尚未 ready。
    // slideshow.revealActive 內部用 revealed flag 自行控制只 reveal 一次，這裡允許重複觸發以重試。
    ScrollTrigger.create({
      trigger: initialPanel,
      start: 'top 88%',
      onEnter: () => {
        if (window.SCCD_classSlideshow?.revealActive) {
          window.SCCD_classSlideshow.revealActive();
        }
      }
    });
  }
}
