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

  // works panels 預設隱藏（桌面版）
  gsap.set(worksPanels, { opacity: 0, pointerEvents: 'none' });

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

  // ─── 同步 info panel 與目前 active 的 division（無動畫） ──
  function syncInfoPanelToActive() {
    const activeBtn = document.querySelector('.class-division-btn.active');
    if (!activeBtn) return;
    const divisionId = activeBtn.getAttribute('data-division');
    document.querySelectorAll('.class-info-panel').forEach(el => {
      el.classList.toggle('hidden', el.getAttribute('data-division') !== divisionId);
    });
  }

  // ─── ScrollTrigger：圖文 → works 過渡 ────────────────────────
  ScrollTrigger.create({
    trigger: infoArea,
    start: 'bottom 55%',   // 圖文底部到達視窗 55% 時觸發

    onEnter: () => {
      // 進入 works context
      window.SCCD_classContext = 'works';
      // 圖文取消互動，自然往上滾
      infoArea.style.pointerEvents = 'none';
      // works playlist 直接顯示（無 fade）
      gsap.set(worksPanels, { opacity: 1, pointerEvents: 'auto' });
    },

    onLeaveBack: () => {
      // 回到 info context
      window.SCCD_classContext = 'info';
      // 圖文恢復互動
      infoArea.style.pointerEvents = 'auto';
      // 把 info panel 同步成目前 active 的 division，避免使用者在 works 切過後上來看到舊的
      syncInfoPanelToActive();
      // works playlist 直接隱藏（無 fade）
      gsap.set(worksPanels, { opacity: 0, pointerEvents: 'none' });
    }
  });

  // ─── 初始進場動畫（圖文第一次進入視窗）─────────────────────────
  const initialPanel = infoArea.querySelector('.class-info-panel[data-division="animation"]');
  if (initialPanel) {
    ScrollTrigger.create({
      trigger: initialPanel,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        const imgs  = initialPanel.querySelectorAll('.division-images img');
        const texts = initialPanel.querySelectorAll('.division-text');
        gsap.from(imgs,  { y: 40, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
        gsap.from(texts, { y: 24, opacity: 0, duration: 0.6, stagger: 0.1,  ease: 'power3.out', clearProps: 'transform,opacity' });
      }
    });
  }
}
