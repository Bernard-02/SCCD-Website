// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Mobile Menu Logic
 * 處理手機版漢堡選單的開關、圖示切換與手風琴效果
 */

import { setupClipReveal, clipRevealIconSwap } from './modules/ui/scroll-animate.js';
import { DUR, EASE } from './modules/ui/motion.js';

// 套 random rotation（user pattern：每次點開角度不一樣，跟 footer items / hero title 同款）
// 走 CSS transition 平滑切換而非 GSAP，避免跟 hidden toggle 時序競爭
function applyRandomRotation(el) {
  if (!el || !window.SCCDHelpers) return;
  const deg = SCCDHelpers.getRandomRotation(); // -4~6 排除 0
  el.style.transform = `rotate(${deg}deg)`;
}

// 桌面 menu（≥1200，2026-09-27）：同一個 .mobile-nav 面板，CSS 改成透明底＋靠右旋轉 btn（navigation.css）。
// gate 同 navigation.css ≥1200 段；min-height 排除矮橫向（走手機 header）
const DESKTOP_MENU_MQ = '(min-width: 1200px) and (min-height: 501px)';
const isDesktopMenu = () => window.matchMedia(DESKTOP_MENU_MQ).matches;
// 桌面實色 btn 藏起時多滑的 px：剛好 yPercent 100 貼遮罩邊，旋轉遮罩的反鋸齒會留一條縫（同 header.js BAR_HIDE_BUFFER）
const DESKTOP_HIDE_BUFFER = 12;
const randRot = () => `rotate(${SCCDHelpers.getRandomRotation()}deg)`;

// 給 header.js 用：footer-near 收起 header 鈕時，開著的桌面 menu 一起關（不然選項浮著、卻沒有鈕可關）
let closeIfOpen = null;
export function closeMobileMenu() { closeIfOpen?.(); }

export function initMobileMenu() {
  // 兩顆漢堡：手機 header 一顆＋桌面 #menu-btn 一顆（同時只顯示一顆），共用同一面板
  const btns = document.querySelectorAll('.mobile-menu-btn');
  const btn = btns[0];
  const nav = document.querySelector('.mobile-nav');
  // icon swap 兩態：open（漢堡 mask）/ close（arrow-right mask）— 兩者都走 .icon mask 系統（mode-aware currentColor）
  // 用 inline style.display 切換，避 Tailwind .hidden 跟 icon display:inline-block 的 cascade 競爭
  const iconOpen = document.querySelectorAll('[data-mobile-menu-icon="open"]');
  const iconClose = document.querySelectorAll('[data-mobile-menu-icon="close"]');
  // 桌面 #menu-btn 單一 glyph：換 class 走 clipRevealIconSwap（同 history 鈕舊做法：隨機四向滑出遮罩→換→同向滑入）
  // 每半段 DUR.fast 0.3 → 總長 0.6s，貼齊選項收起 0.61s／頁面退場 0.5~0.68s（原 0.4×2＝0.8s，鈕比選項晚換完；user 2026-09-28）
  const swapIcon = document.querySelector('[data-menu-swap-icon]');
  // 桌面漢堡鈕 hover 抽三原色（mode1/2；mode3 CSS 翻黑白）；開著不重抽＝open 態維持點下去那色（buttons.css .is-open）
  const deskMenuBtn = document.getElementById('menu-btn');
  deskMenuBtn?.addEventListener('mouseenter', () => {
    if (!deskMenuBtn.classList.contains('is-open')) deskMenuBtn.style.setProperty('--menu-btn-accent', SCCDHelpers.getRandomAccentColor());
  });
  const setIcons = (open) => {
    deskMenuBtn?.classList.toggle('is-open', open);
    iconOpen.forEach(i => { i.style.display = open ? 'none' : ''; });
    iconClose.forEach(i => { i.style.display = open ? '' : 'none'; });
    if (swapIcon) {
      const cls = open ? 'icon icon-arrow-right' : 'icon icon-menu';
      if (swapIcon.offsetParent) clipRevealIconSwap(swapIcon, cls, { duration: DUR.fast });
      else swapIcon.className = cls; // 桌面鈕沒顯示（<1200）：直接換、不跑動畫
    }
  };
  // 含 nav links + 底部 CREATE! link，整個面板所有 link 都進 stagger
  const menuItems = nav?.querySelectorAll('.mobile-nav-link');

  // btn random rotation 目標：兩個 mobile-header-btn 外殼（menu btn + mode btn 都套），icon 本身不旋轉
  const menuBtnBox = document.querySelector('.mobile-header-btn .mobile-menu-btn')?.closest('.mobile-header-btn');
  const modeBtnBox = document.getElementById('mode-btn-mobile');

  if (!btn || !nav) return;

  // 桌面 btn 角度＝nav btn 同款（user 2026-09-27）：初次開隨機、hover 抽新角、離開保持、click 沿用（不再每次開重抽）。
  // 角度掛在 clip wrapper（setupClipReveal 首次 open 才建）；手機/平板不旋轉。
  let activeAccentFor = null; // active 色跟著「哪一頁 active」走：換頁才重抽，同頁重開沿用
  // hover 色＝每次進入抽三原色（同舊 header bar hover），只在 :hover 時吃（navigation.css ≥1200 段）
  menuItems?.forEach(a => a.addEventListener('mouseenter', () => {
    const w = a.parentElement;
    if (isDesktopMenu() && w?.classList.contains('clip-reveal-wrapper')) w.style.transform = randRot();
    a.style.setProperty('--menu-hover', SCCDHelpers.getRandomAccentColor());
  }));

  // ── 開啟 / 關閉 helper（給 btn click + nav link click 共用）──
  // 進場節奏：nav slide-in (0.28) 完 → items clip-reveal (0.63 + stagger 0.084)；退場反向：items 倒序播完才 slide-out
  // ⚠️ reveal 掛 slide-in 的 onComplete 而非 delayedCall(0.105)（2026-09-08）：點擊瞬間的長幀（全屏面板首繪
  //   + 滑入 paint、剛換頁的主執行緒忙碌）原本落在 reveal tween 建立之後 → GSAP 補進度、前幾個 stagger 槽
  //   被吃掉「沒完全 stagger」。fromTo 等面板停穩才建立，卡幀只延後起跑不吃 stagger。
  //   pending 觸發器＝nav tween 本身，open/close 兩端的 killTweensOf(nav) 順帶取消（舊 revealCall 機制退役）。

  // ⚠️ 一勞永逸防 race（user 2026-06-22）：toggle btn 在「開合動畫進行中」一律不可點。
  //   過去 open/close 做成可中途反向（faculty 式），但每補一個中斷 edge 又冒新的殭屍殘態。
  //   改成 open 起 → 選項全 reveal 完才解鎖；close 起 → nav 滑出完才解鎖。期間點 btn no-op。
  //   只鎖 toggle btn，不鎖 nav link（點選單項目永遠即時可用，退場由換頁動畫蓋過）。
  let busy = false;

  // 捲動鎖：鎖 html 不鎖 body——body overflow:hidden 會讓 body 變 scroll container，
  // 頁內 position:sticky（釘住的 list header 等）改對 body 計算 → 開 menu 瞬間解除釘選、
  // list 視覺往上彈，關掉又彈回（user 2026-06-12 報）。html 本來就是頁面 scroll container，
  // 鎖它 sticky 不受影響。只動 overflow-y：about/activities 的 inline overflow-x:clip 要保留
  //（shorthand 設了再清會把 clip 一起洗掉）。
  // 桌面 menu 不鎖（user 2026-09-27「menu 出現時畫面還是可以 scroll」）→ scrollLocked 守衛：沒鎖就不還原，免蓋掉別人設的值
  let prevHtmlOverflowY = '';
  let scrollLocked = false;
  function lockScroll() {
    prevHtmlOverflowY = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'hidden';
    scrollLocked = true;
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    document.documentElement.style.overflowY = prevHtmlOverflowY;
    scrollLocked = false;
  }

  // menu 開著時暫停會逐幀重繪的頁面 loop（各頁暴露的 hook，不在該頁 = undefined no-op）：
  // 持續 jank 會把 menu 時間制 GSAP reveal 吃掉「選項直接跳出來」甚至卡死；overlay 全屏蓋住內容，暫停零損失。
  // /create = p5 draw loop、/atlas = 星雲 float loop。
  function setPageLoopsPaused(paused) {
    window.setCreateAppPaused?.(paused);
    window.setAtlasFloatPaused?.(paused);
  }

  // 桌面 menu 開著可捲（不鎖）→ 離開啟位置捲超過 1/3 視窗高就自動收（user 2026-09-28）。document capture 收全部 scroll
  // （window＋inner-scroll 盒：scroll 不冒泡但 capture 會經過 document），各捲動源記「開啟時位置」、比淨位移。
  // 不用位移絕對值累加：mandatory snap 頁滾一格會被吸回原位（淨 0），累加會把「下去＋吸回」算兩次、沒捲也收。
  // ponytail: 盒子沒有開啟時基準 → 第一次 scroll 的位置當起點（少算一幀位移）；要精確再改開 menu 時快照可捲盒
  const SCROLL_CLOSE_RATIO = 1 / 3;
  let scrollStart = new Map();
  const scrollPosOf = (t) => (t === document ? window.scrollY : t.scrollTop);
  function onOpenScroll(e) {
    const y = scrollPosOf(e.target);
    const start = scrollStart.get(e.target);
    if (start === undefined) { scrollStart.set(e.target, y); return; }
    if (Math.abs(y - start) > window.innerHeight * SCROLL_CLOSE_RATIO && nav.classList.contains('open')) closeMenu();
  }
  function watchScrollClose(on) {
    document.removeEventListener('scroll', onOpenScroll, { capture: true });
    if (!on) return;
    scrollStart = new Map([[document, window.scrollY]]);
    document.addEventListener('scroll', onOpenScroll, { capture: true, passive: true });
  }

  function openMenu() {
    const desktop = isDesktopMenu();
    if (desktop) watchScrollClose(true);
    // 桌面面板透明、頁面看得到 → 暫停 loop 會看到凍結，不停（close 端的 resume 呼叫無害）
    if (!desktop) setPageLoopsPaused(true);
    const hideY = desktop ? DESKTOP_HIDE_BUFFER : 0;
    // ⚠️ 先把選項藏好（clip wrapper + yPercent:100）再讓 nav 可見（user 2026-06-24 報「選項沒 stagger、閃一下出現」）：
    // 上次 reveal onComplete 的 clearProps:'transform' 讓選項停在全顯態 → 若先 .open 再 set hidden，
    // nav 一可見會閃一幀全顯選項才被壓回隱藏。把 hide 提到 .open 之前，這一幀不存在。
    if (typeof gsap !== 'undefined' && menuItems && menuItems.length) {
      setupClipReveal(menuItems);
      gsap.set(menuItems, { yPercent: 100, y: hideY });
      // 桌面 btn 旋轉掛在 clip wrapper（遮罩跟著轉 → 滑入不切旋轉凸角，同 header bar 收合做法）；已有角度就沿用
      menuItems.forEach(a => {
        const w = a.parentElement;
        if (w?.classList.contains('clip-reveal-wrapper')) {
          w.style.transform = desktop ? (w.style.transform || randRot()) : '';
        }
      });
    }
    if (desktop) {
      const cur = nav.querySelector('.mobile-nav-link.active')?.getAttribute('href') || '';
      if (cur !== activeAccentFor) {
        activeAccentFor = cur;
        nav.style.setProperty('--menu-accent', SCCDHelpers.getRandomAccentColor());
      }
    }
    nav.classList.add('open');
    // footer 讓位（手機/平板）：.footer-shell z-9999（贏 header 內的面板 z-40）→ 捲到 footer 再開 menu 時 footer
    // 畫在面板上。開著時掛 class 壓掉（footer.css html.mobile-menu-open 規則），關閉滑出完才移除。
    // 桌面反過來 footer 不讓位（menu 在 footer 後面收，footer.css 註解）；class 另給 atlas/mcp/scrollbar 判「menu 開著」
    document.documentElement.classList.add('mobile-menu-open');
    btns.forEach(b => b.setAttribute('aria-expanded', 'true'));
    if (typeof gsap !== 'undefined') {
      busy = true; // reveal 完成前鎖住 toggle（onComplete 解鎖）
      // 殺掉前一次 close 還掛著的「延遲滑出」tween（delay: itemsTotal）：
      // 不殺的話在 items 收合期間重開 menu，舊 tween 之後才 fire 會把開著的 menu 整個拉走，
      // state 卡在 open 但畫面上 menu 消失（user 2026-06-11 報「點箭頭後整個 menu 不見」）
      gsap.killTweensOf(nav);
      if (menuItems && menuItems.length) {
        setupClipReveal(menuItems);
        gsap.killTweensOf(menuItems);
      }
      gsap.to(nav, {
        x: '0%',
        // 桌面面板透明：不滑入（無位移），直接到位、選項 clip-reveal 進場
        duration: desktop ? 0 : DUR.fast,
        ease: EASE.enterSoft,
        onComplete: () => {
          if (!menuItems || !menuItems.length) { busy = false; return; }
          // fromTo 自帶起點 100：不依賴 open 前的外部 set 撐過滑入段，stagger 每次都確定從隱藏播（user 2026-06-24）
          gsap.fromTo(menuItems,
            { yPercent: 100, y: hideY },
            {
              yPercent: 0,
              y: 0,
              duration: DUR.slow,
              stagger: { each: 0.084, from: 'start' },
              ease: EASE.enter,
              overwrite: true,
              clearProps: 'transform',
              onComplete: () => { busy = false; }, // 選項全進場 → 解鎖 toggle
            }
          );
        },
      });
    } else {
      nav.style.transform = 'translateX(0%)';
    }
    setIcons(true);
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    if (!desktop) lockScroll();
    // 無障礙：開啟時把鍵盤焦點移入選單第一項（關閉時 Escape / 點按鈕還給漢堡按鈕）
    menuItems?.[0]?.focus?.();
  }

  // close: 回傳 Promise 在動畫完成後 resolve（nav link click 場景用來決定何時 navigate）
  // 退場語義 = 進場反向：items 倒序 yPercent 0→100 全部播完才 nav slide-out（不跟 nav 一起）
  function closeMenu() {
    const desktop = isDesktopMenu();
    watchScrollClose(false);
    nav.classList.remove('open');
    btns.forEach(b => b.setAttribute('aria-expanded', 'false'));
    setIcons(false);
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    unlockScroll();
    return new Promise(resolve => {
      if (typeof gsap !== 'undefined') {
        busy = true; // nav 滑出完成前鎖住 toggle（onComplete 解鎖）
        gsap.killTweensOf(nav); // 對稱保險：殺掉殘留的 open 滑入 tween（含其 onComplete 掛的 pending reveal）
        const itemCount = menuItems?.length || 0;
        const itemDur = DUR.base;
        // 總長對齊頁面退場（user 2026-09-28「menu 收起速度跟頁面出場一樣」）：hero 0.5+0.06×3≈0.68s、about logo
        // hero 0.5s、nav chips 0.4+0.05×(n-1)≈0.65s；8 顆 × 0.03 → 0.4+0.21≈0.61s（原 0.05 stagger 拖到 0.8s，menu 比頁面慢收）
        const itemStagger = 0.03;
        // 進場是 stagger from start（第一個先進）；退場語義反向 = 最後一個先退（from end）
        // items 全部退場結束時間 = duration + stagger×(N-1)；之後才 nav slide-out
        // 手機加 0.05s buffer 讓 items 真的完全收進去（視覺上看到才開始 slide）；桌面不滑出、buffer 只是死時間
        const itemsTotal = itemCount > 0 ? itemDur + itemStagger * (itemCount - 1) + (desktop ? 0 : 0.05) : 0;
        if (itemCount > 0) {
          gsap.killTweensOf(menuItems);
          gsap.to(menuItems, {
            yPercent: 100,
            y: desktop ? DESKTOP_HIDE_BUFFER : 0,
            duration: itemDur,
            stagger: { each: itemStagger, from: 'end' },
            ease: EASE.exitSoft,
            // 選項收完、nav 還全屏蓋著（0.05s buffer 才開始滑出）→ 此刻先恢復 p5：canvas 在被揭開前
            // 用「當前」hue 重繪好，mode3 wheel 跑著時 slide 露出的才不是暫停當下的舊色字（user 2026-07-03 報）。
            // 最脆弱的 items 收合仍全程無 p5 競爭；剩下的 nav 滑出是單一 transform，與 p5 並行可承受。
            onComplete: () => { setPageLoopsPaused(false); },
          });
        }
        gsap.to(nav, {
          x: '-100%',
          duration: desktop ? 0 : DUR.fast, // 桌面不滑出（同開啟）
          ease: EASE.exitSoft,
          delay: itemsTotal,
          // resume 保險（itemCount 0 / items tween 被 kill 的殘局；重複 loop() 無害）；離頁場景 _p5 已移除 = no-op
          onComplete: () => {
            document.documentElement.classList.remove('mobile-menu-open'); // 面板已滑出，footer z 復原
            busy = false; setPageLoopsPaused(false); resolve();
          },
        });
      } else {
        nav.style.transform = 'translateX(-100%)';
        document.documentElement.classList.remove('mobile-menu-open');
        setPageLoopsPaused(false);
        resolve();
      }
    });
  }

  // 1. 漢堡按鈕：toggle（動畫進行中 no-op，防 open/close 互相打斷的殭屍殘態）
  btns.forEach(b => b.addEventListener('click', () => {
    if (busy) return;
    if (nav.classList.contains('open')) closeMenu();
    else openMenu();
  }));

  // 桌面面板 pointer-events:none（滾輪/hover 直達底下頁面，navigation.css）→ 「點外面關閉」改掛 document：
  // capture 階段（頁面元素 stopPropagation 也收得到）、不攔截（點到的頁面元素照常作用）。
  // 排除選單項目、漢堡、mode 鈕（開著 menu 也能切 mode）。initMobileMenu 只跑一次，listener 不累積。
  document.addEventListener('click', (e) => {
    if (busy || !isDesktopMenu() || !nav.classList.contains('open')) return;
    if (e.target.closest?.('.mobile-nav-link, .mobile-menu-btn, .theme-toggle-btn')) return;
    closeMenu();
  }, true);
  closeIfOpen = () => { if (nav.classList.contains('open')) closeMenu(); };

  // 無障礙：Escape 關閉選單並把焦點還給漢堡按鈕（WCAG 2.1.1 鍵盤 / 2.4.3 焦點還原）。
  // initMobileMenu 只跑一次（header 載入時），listener 不會跨 SPA 累積。
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open') && !busy) {
      closeMenu();
      [...btns].find(b => b.offsetParent)?.focus();
    }
  });

  // 2. nav link 點擊：menu close 與 page exit 並行（不串行）
  // 串行版本（先 close 全跑完才 navigate）整體 2.5s+ 太久；改並行讓 menu 退場時 router 已開始 fetch + 跑 hero exit
  // 導航交給 router 的 document click 攔截（同下方 logo 慣例），這裡只收 menu、不自己呼叫 navigateTo：
  // ⚠️ 之前這裡 preventDefault + navigateTo，但 click 照樣冒泡到 router → 同一下點兩次 loadPage：第二次
  //   runPageExit 拿到空 handler 表立即 resolve、fetch 一回就 swap（實測 click 後 90~250ms），第一次的退場被
  //   navSeq 作廢＝全站從 menu 換頁退場動畫都被截斷（atlas 星雲瞬間消失、menu 來不及收）＋history 多推一筆。
  // 視覺：menu 收起的同時舊頁 hero 在後面也 exit，新頁進場無斷層
  if (menuItems) {
    menuItems.forEach(link => {
      link.addEventListener('click', () => {
        if (!nav.classList.contains('open')) return;
        // 桌面 active 色＝點下去那刻的 hover 色（同 nav btn：hover 預覽、click 定案；user 2026-09-28）。
        // 要當下寫：navigateTo 一進來就把 .active 移到這顆（router.js clearNavActive/setNavActive）→ 晚寫＝退場途中
        // 它先變舊頁的 accent。舊 active 同時已失去 .active，不受影響。activeAccentFor 同步＝下次開不重抽
        const accent = isDesktopMenu() && !link.classList.contains('active') && link.style.getPropertyValue('--menu-hover');
        if (accent) { nav.style.setProperty('--menu-accent', accent); activeAccentFor = link.getAttribute('href'); }
        closeMenu(); // 不 await，動畫獨立跑完；router 隨後（同一 click 冒泡）啟動 exit + fetch
      });
    });
  }

  // 3. header logo（Lottie 圓圈 + SCCD 文字兩個 anchor，z-50 蓋在面板上、開著也點得到）：
  // 點 logo 回首頁也是導航 → menu 同步收起。不 preventDefault，跳轉交給 router 的 click 攔截，
  // close 與 page exit 並行（同 nav link 慣例）。
  [...document.querySelectorAll('[data-mobile-logo-lottie-anchor], [data-mobile-logo-sccd-anchor]'), document.getElementById('header-logo')?.closest('a')].filter(Boolean).forEach(a => {
    a.addEventListener('click', () => {
      if (nav.classList.contains('open')) closeMenu();
    });
  });

  // mount 時兩個 btn 都先給隨機角度
  applyRandomRotation(menuBtnBox);
  applyRandomRotation(modeBtnBox);

}