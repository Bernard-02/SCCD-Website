// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Mobile Menu Logic
 * 處理手機版漢堡選單的開關、圖示切換與手風琴效果
 */

import { setupClipReveal } from './modules/ui/scroll-animate.js';
import { navigateTo } from './router.js';
import { DUR, EASE } from './modules/ui/motion.js';

// 套 random rotation（user pattern：每次點開角度不一樣，跟 footer items / hero title 同款）
// 走 CSS transition 平滑切換而非 GSAP，避免跟 hidden toggle 時序競爭
function applyRandomRotation(el) {
  if (!el || !window.SCCDHelpers) return;
  const deg = SCCDHelpers.getRandomRotation(); // -4~6 排除 0
  el.style.transform = `rotate(${deg}deg)`;
}

export function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('.mobile-nav');
  // icon swap 兩態：open（漢堡 mask）/ close（arrow-right mask）— 兩者都走 .icon mask 系統（mode-aware currentColor）
  // 用 inline style.display 切換，避 Tailwind .hidden 跟 icon display:inline-block 的 cascade 競爭
  const iconOpen = btn?.querySelector('[data-mobile-menu-icon="open"]');
  const iconClose = btn?.querySelector('[data-mobile-menu-icon="close"]');
  const toggles = document.querySelectorAll('.mobile-submenu-toggle');
  // 含 nav links + 底部 CREATE! link，整個面板所有 link 都進 stagger
  const menuItems = nav?.querySelectorAll('.mobile-nav-link');

  // btn random rotation 目標：兩個 mobile-header-btn 外殼（menu btn + mode btn 都套），icon 本身不旋轉
  const menuBtnBox = btn?.closest('.mobile-header-btn');
  const modeBtnBox = document.getElementById('mode-btn-mobile');

  if (!btn || !nav) return;

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
  let prevHtmlOverflowY = '';
  function lockScroll() {
    prevHtmlOverflowY = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflowY = prevHtmlOverflowY;
  }

  // menu 開著時暫停會逐幀重繪的頁面 loop（各頁暴露的 hook，不在該頁 = undefined no-op）：
  // 持續 jank 會把 menu 時間制 GSAP reveal 吃掉「選項直接跳出來」甚至卡死；overlay 全屏蓋住內容，暫停零損失。
  // /create = p5 draw loop、/atlas = 星雲 float loop。
  function setPageLoopsPaused(paused) {
    window.setCreateAppPaused?.(paused);
    window.setAtlasFloatPaused?.(paused);
  }

  function openMenu() {
    setPageLoopsPaused(true);
    // ⚠️ 先把選項藏好（clip wrapper + yPercent:100）再讓 nav 可見（user 2026-06-24 報「選項沒 stagger、閃一下出現」）：
    // 上次 reveal onComplete 的 clearProps:'transform' 讓選項停在全顯態 → 若先 .open 再 set hidden，
    // nav 一可見會閃一幀全顯選項才被壓回隱藏。把 hide 提到 .open 之前，這一幀不存在。
    if (typeof gsap !== 'undefined' && menuItems && menuItems.length) {
      setupClipReveal(menuItems);
      gsap.set(menuItems, { yPercent: 100 });
    }
    nav.classList.add('open');
    // footer 讓位：.footer-shell z-9999（贏 header 內的面板 z-40）→ 捲到 footer 再開 menu 時 footer
    // 畫在面板上。開著時掛 class 壓掉（footer.css html.mobile-menu-open 規則），關閉滑出完才移除
    document.documentElement.classList.add('mobile-menu-open');
    btn.setAttribute('aria-expanded', 'true');
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
        duration: DUR.fast,
        ease: EASE.enterSoft,
        onComplete: () => {
          if (!menuItems || !menuItems.length) { busy = false; return; }
          // fromTo 自帶起點 100：不依賴 open 前的外部 set 撐過滑入段，stagger 每次都確定從隱藏播（user 2026-06-24）
          gsap.fromTo(menuItems,
            { yPercent: 100 },
            {
              yPercent: 0,
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
    if (iconOpen) iconOpen.style.display = 'none';
    if (iconClose) iconClose.style.display = '';
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    lockScroll();
    // 無障礙：開啟時把鍵盤焦點移入選單第一項（關閉時 Escape / 點按鈕還給漢堡按鈕）
    menuItems?.[0]?.focus?.();
  }

  // close: 回傳 Promise 在動畫完成後 resolve（nav link click 場景用來決定何時 navigate）
  // 退場語義 = 進場反向：items 倒序 yPercent 0→100 全部播完才 nav slide-out（不跟 nav 一起）
  function closeMenu() {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (iconOpen) iconOpen.style.display = '';
    if (iconClose) iconClose.style.display = 'none';
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    unlockScroll();
    return new Promise(resolve => {
      if (typeof gsap !== 'undefined') {
        busy = true; // nav 滑出完成前鎖住 toggle（onComplete 解鎖）
        gsap.killTweensOf(nav); // 對稱保險：殺掉殘留的 open 滑入 tween（含其 onComplete 掛的 pending reveal）
        const itemCount = menuItems?.length || 0;
        const itemDur = 0.4;
        const itemStagger = 0.05;
        // 進場是 stagger from start（第一個先進）；退場語義反向 = 最後一個先退（from end）
        // items 全部退場結束時間 = duration + stagger×(N-1)；之後才 nav slide-out
        // 加 0.05s buffer 讓 items 真的完全收進去（視覺上看到才開始 slide）
        const itemsTotal = itemCount > 0 ? itemDur + itemStagger * (itemCount - 1) + 0.05 : 0;
        if (itemCount > 0) {
          gsap.killTweensOf(menuItems);
          gsap.to(menuItems, {
            yPercent: 100,
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
          duration: DUR.fast,
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
  btn.addEventListener('click', () => {
    if (busy) return;
    if (nav.classList.contains('open')) closeMenu();
    else openMenu();
  });

  // 無障礙：Escape 關閉選單並把焦點還給漢堡按鈕（WCAG 2.1.1 鍵盤 / 2.4.3 焦點還原）。
  // initMobileMenu 只跑一次（header 載入時），listener 不會跨 SPA 累積。
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open') && !busy) {
      closeMenu();
      btn.focus();
    }
  });

  // 2. nav link 點擊：menu close 與 page exit 並行（不串行）
  // 串行版本（先 close 全跑完才 navigate）整體 2.5s+ 太久；改並行讓 menu 退場時 router 已開始 fetch + 跑 hero exit
  // navigateTo 內部 runPageExit + fetch 並行（router.js:110），menu close 跟它們三股一起跑
  // 視覺：menu 收起的同時舊頁 hero 在後面也 exit，新頁進場無斷層
  if (menuItems) {
    menuItems.forEach(link => {
      link.addEventListener('click', (e) => {
        if (!nav.classList.contains('open')) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        closeMenu(); // 不 await，動畫獨立跑完
        if (href) navigateTo(href); // 立刻啟動 router exit + fetch
      });
    });
  }

  // 3. header logo（Lottie 圓圈 + SCCD 文字兩個 anchor，z-50 蓋在面板上、開著也點得到）：
  // 點 logo 回首頁也是導航 → menu 同步收起。不 preventDefault，跳轉交給 router 的 click 攔截，
  // close 與 page exit 並行（同 nav link 慣例）。
  document.querySelectorAll('[data-mobile-logo-lottie-anchor], [data-mobile-logo-sccd-anchor]').forEach(a => {
    a.addEventListener('click', () => {
      if (nav.classList.contains('open')) closeMenu();
    });
  });

  // mount 時兩個 btn 都先給隨機角度
  applyRandomRotation(menuBtnBox);
  applyRandomRotation(modeBtnBox);

  // 2. Accordion Logic (Submenu)
  toggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const submenu = toggle.nextElementSibling;
      const chevron = toggle.querySelector('.fa-chevron-down');
      const isClosed = submenu.classList.contains('hidden');

      // 先關閉所有其他的子選單
      toggles.forEach(otherToggle => {
        if (otherToggle !== toggle) {
          const otherSubmenu = otherToggle.nextElementSibling;
          const otherChevron = otherToggle.querySelector('.fa-chevron-down');
          
          if (!otherSubmenu.classList.contains('hidden')) {
            if (typeof gsap !== 'undefined') {
              otherSubmenu.style.overflow = 'hidden';
              gsap.to(otherSubmenu, { 
                height: 0, 
                opacity: 0,
                duration: DUR.fast, 
                ease: EASE.enterSoft, 
                onComplete: () => {
                  otherSubmenu.classList.add('hidden');
                  otherSubmenu.style.height = '';
                  otherSubmenu.style.opacity = '';
                  otherSubmenu.style.overflow = '';
                }
              });
              gsap.to(otherChevron, { rotation: 0, duration: DUR.fast });
            } else {
              otherSubmenu.classList.add('hidden');
              otherChevron.style.transform = 'rotate(0deg)';
            }
          }
        }
      });

      // 切換當前子選單
      if (isClosed) {
        if (typeof gsap !== 'undefined') {
          submenu.classList.remove('hidden');
          submenu.style.overflow = 'hidden';
          gsap.fromTo(submenu, 
            { height: 0, opacity: 0 }, 
            { 
              height: 'auto', 
              opacity: 1, 
              duration: DUR.base, 
              ease: EASE.enterSoft,
              onComplete: () => {
                submenu.style.overflow = '';
                submenu.style.height = '';
              }
            }
          );
          gsap.to(chevron, { rotation: 180, duration: DUR.fast });
        } else {
          submenu.classList.remove('hidden');
          chevron.style.transform = 'rotate(180deg)';
        }
      } else {
        if (typeof gsap !== 'undefined') {
          submenu.style.overflow = 'hidden';
          gsap.to(submenu, { 
            height: 0, 
            opacity: 0,
            duration: DUR.fast, 
            ease: EASE.enterSoft, 
            onComplete: () => {
              submenu.classList.add('hidden');
              submenu.style.height = '';
              submenu.style.opacity = '';
              submenu.style.overflow = '';
            }
          });
          gsap.to(chevron, { rotation: 0, duration: DUR.fast });
        } else {
          submenu.classList.add('hidden');
          chevron.style.transform = 'rotate(0deg)';
        }
      }
    });
  });
}