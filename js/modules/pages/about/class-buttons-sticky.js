// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Class Buttons Sticky + Works Reveal
 * 桌面版：
 *   1. #class-buttons-sticky 用 CSS sticky 貼頂（純 CSS，此 JS 不重複設定）
 *      sticky 範圍涵蓋圖文（class-info-area）+ works（class-works-panels）
 *      容器永遠透明，不加白底（封鎖綫可穿過）
 *   2. 圖文區塊底部到達視窗中線時，works playlist 直接顯示
 *   3. 同時切換 scroll context（'info' / 'works'），供 BFA toggle 判斷
 *      讓使用者在 works 區塊點按鈕時不觸發圖文進場動畫
 *   4. #class / #works anchor 的 scroll-margin-top 由 HTML inline style 決定
 *      (var(--header-height)) — JS 不再覆蓋
 * 手機版：不執行（直接 return）
 */

import { registerPageExit } from '../../ui/page-exit.js';
import { DUR } from '../../ui/motion.js';
import { navChipHidden, NAV_CHIP_SHOWN, pickNavDir } from '../../ui/scroll-animate.js';

export function initClassButtonsSticky() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.innerWidth < 768) return;

  const infoArea          = document.getElementById('class-info-area');
  const worksPanels       = document.getElementById('class-works-panels');
  const classButtonsEl    = document.getElementById('class-buttons-sticky');
  const worksAnchor       = document.getElementById('works');
  const stickyWrapper     = document.getElementById('class-info-sticky-wrapper');

  if (!infoArea || !worksPanels || !classButtonsEl || !worksAnchor || !stickyWrapper) return;

  // ─── 初始狀態 ──────────────────────────────────────────────
  // 預設 scroll context = 'info'，BFA toggle 可透過 window.SCCD_classContext 讀取
  window.SCCD_classContext = 'info';
  // works panels 不再用 opacity 隱藏；natural scroll 揭露
  // #works 的 scroll-margin-top 由 inline style var(--header-height) 決定，不再動態覆蓋
  // btn 永遠透明，不再隨封鎖綫可見性切換白底（避免裁掉經過的封鎖綫）

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

  // ─── ScrollTrigger：btn 滑出（在 100px sticky 線被裁切、像滑進隱藏窗）──────
  // 高視窗（100vh sections 模式，門檻同 scroll-snap.css 的 min-height:900px）：
  //   btn 全程 sticky 到 works 視圖結尾；位移交給 CSS sticky 自然釋放（wrapper 底把 btn 推走），
  //   這裡只補 clip 同步裁切（釋放起點 = wrapper 底到達 100px 線 + btn 高，與釋放 1:1 同速）→
  //   落到 works 時 btn 完整停在 100px 線（鏡像 class 佈局），離開 works 才滑出（user 2026-07-03）。
  // 矮視窗 fallback：維持舊邏輯（works anchor 過 100px 線 → y+clip 一起滑出）。
  // 門檻以 init 當下為準，跨頁重 init 會重新判定；同頁 resize 跨門檻不重算（可接受）。
  gsap.set(classButtonsEl, { clipPath: 'inset(0px 0px 0px 0px)' });

  // 矮橫向手機：不掛滑出 scrub——works 落點 92 在 start(top 100px) 之後，一到 works tabs 就被
  // scrub 藏掉，但 works 視圖必須留著 tabs 切 playlist（landscape.css 用 grid-row 1/3 +
  // #works min-height 讓 CSS sticky 全程涵蓋 works）。works context 切換的 ST 照常掛。
  const isLandscapeMobile = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;

  const tallViewport = window.matchMedia('(min-height: 900px)').matches;
  if (isLandscapeMobile) {
    /* CSS sticky 全權處理，這裡不做事 */
  } else if (tallViewport) {
    gsap.timeline({
      scrollTrigger: {
        trigger: stickyWrapper,
        start: () => `bottom ${100 + classButtonsEl.offsetHeight}px`,
        end: () => `+=${classButtonsEl.offsetHeight}`,
        scrub: true,
        invalidateOnRefresh: true
      }
    })
    .to(classButtonsEl, {
      clipPath: () => `inset(${classButtonsEl.offsetHeight}px 0px 0px 0px)`,
      ease: 'none'
    }, 0);
  } else {
    gsap.timeline({
      scrollTrigger: {
        trigger: worksAnchor,
        start: 'top 100px',
        end: () => `+=${classButtonsEl.offsetHeight}`,
        scrub: true,
        invalidateOnRefresh: true
      }
    })
    .to(classButtonsEl, { y: () => -classButtonsEl.offsetHeight, ease: 'none' }, 0)
    .to(classButtonsEl, {
      clipPath: () => `inset(${classButtonsEl.offsetHeight}px 0px 0px 0px)`,
      ease: 'none'
    }, 0);
  }

  // ─── ScrollTrigger：圖文 → works 過渡 ────────────────────────
  // 首次進入 works（本次 About 訪問）時自動 active BFA；之後保留使用者選擇
  let hasEnteredWorks = false;

  // works 內容進場（每次 About 訪問一次）：setDivisionActive('bfa',false) 已 instant 顯示 active panel，
  // 這裡把它先藏起、待 works panels 進視窗才 clip-reveal（比照 class slideshow 的 revealActive）。
  // 進 works context 時 panels 常仍在視窗下方；若已在視窗內（矮視窗）則立即播（ST 已過 start 不會 onEnter）。
  let worksEntranceDone = false;
  function armWorksEntrance() {
    if (worksEntranceDone || typeof window.SCCD_hideWorksActive !== 'function') return;
    worksEntranceDone = true;
    window.SCCD_hideWorksActive();
    const inZone = worksPanels.getBoundingClientRect().top <= window.innerHeight * 0.88;
    if (inZone || typeof ScrollTrigger === 'undefined') {
      window.SCCD_revealWorksActive();
    } else {
      ScrollTrigger.create({ trigger: worksPanels, start: 'top 88%', once: true,
        onEnter: () => window.SCCD_revealWorksActive() });
    }
  }

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
        armWorksEntrance();  // 字卡+影片改成進場（原本 setDivisionActive 是 instant 顯示）
      } else if (typeof window.SCCD_recolorActiveDivision === 'function') {
        // 之後每次滑進 works 都重新換色（保留當前 active division，只換色+旋轉，避開 works 封鎖綫）
        window.SCCD_recolorActiveDivision();
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

  // ─── class tab / label：hero clip-reveal 進退場（user 2026-08-10 一致化：文字字卡/tab 一律 clip-reveal）──
  // 改用與 courses nav chip 同套「translate + clip-path 同步滑動」(navChipHidden / NAV_CHIP_SHOWN)：
  // 原本進場瞬間出現、退場 clip-path 擦除 → 現在進退場都滑動+遮罩。旋轉在 btn/label 自身 inline transform
  //（desktop tab 無 .anchor-nav-inner，paintTargetOf 就是 btn 本體），navChipHidden 讀 inline rotate 算出沿
  // 自身軸的位移向量；translate 是獨立屬性、與 bfa-division-toggle 每幀重寫的 transform:rotate 疊加共存不打架。
  const CHIP_SEL = '#class-buttons-sticky .class-division-btn, #class-buttons-sticky .class-group-label';
  const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
  const chipDir = new Map();  // 每 chip 固定方向 → 進退場同向一致
  const dirFor = (el) => { let d = chipDir.get(el); if (!d) { d = pickNavDir(el); chipDir.set(el, d); } return d; };
  const classChips = () => Array.from(document.querySelectorAll(CHIP_SEL))
    .filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null);

  // 進場：先藏（navChipHidden）再滑入。双 rAF 等 bfa-division-toggle initRotations 先套好旋轉，
  // navChipHidden 的位移向量才吃到正確角度；section 已在視窗內就直接播，否則 ScrollTrigger once 觸發。
  // 藏起在 rAF（#class 在 hero 下方、初載不在視窗 → 使用者捲到前早已藏好，無閃現）。
  let chipsRevealed = false;
  function revealChips() {
    if (chipsRevealed) return;
    chipsRevealed = true;
    const chips = classChips();
    if (!chips.length) return;
    gsap.to(chips, {
      ...NAV_CHIP_SHOWN, duration: DUR.base, ease: NAV_EASE, stagger: 0.04,
      clearProps: 'clipPath,translate',
      onComplete: () => chips.forEach(el => { /** @type {HTMLElement} */ (el).style.transition = ''; }),
    });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    classChips().forEach(el => {
      /** @type {HTMLElement} */ (el).style.transition = 'none';
      gsap.set(el, navChipHidden(el, dirFor(el)));
    });
    const inView = infoArea.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (inView || typeof ScrollTrigger === 'undefined') revealChips();
    else ScrollTrigger.create({ trigger: infoArea, start: 'top 90%', once: true, onEnter: revealChips });
  }));

  // 離頁退場：與進場對稱，chip/label 從顯示態滑回 navChipHidden 藏起（同向）。沒進場過（沒捲到）就不收、免閃。
  // 不要動 #class-buttons-sticky 本身（它的 clipPath 被上方 scroll-linked scrub 佔用）→ 只動各 chip/label。
  registerPageExit(() => new Promise(resolve => {
    if (typeof gsap === 'undefined' || !chipsRevealed) { resolve(); return; }
    const chips = classChips();
    if (!chips.length) { resolve(); return; }
    let done = 0;
    const onOne = () => { if (++done >= chips.length) resolve(); };
    chips.forEach(el => {
      gsap.killTweensOf(el);
      // Tailwind transition-all duration-fast 會追著 GSAP 每幀值 → 退場期間關掉才同步（頁面即將 swap 不必還原）
      /** @type {HTMLElement} */ (el).style.transition = 'none';
      gsap.fromTo(el,
        { ...NAV_CHIP_SHOWN },
        { ...navChipHidden(el, dirFor(el)), duration: DUR.base, ease: NAV_EASE, overwrite: true, onComplete: onOne });
    });
  }));
}
