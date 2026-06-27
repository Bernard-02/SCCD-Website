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
  // 進場 timing 比舊版縮 30%（user 2026-05-25），退場跟進場語義相反：items clip-out 倒序播完才 nav slide-out
  // 進場節奏：nav slide-in (0.28) → delay (0.105) → items clip-reveal (0.63 + stagger 0.084)
  // 退場節奏：items clip-out 倒序 (0.4 + stagger 0.05 from:end) → nav slide-out (0.28)
  //
  // ⚠️ Race 防護（user 2026-06-11 報「點太快下次打開 items 直接跳出來」）：
  //   reveal 的 delayedCall 不殺的話，快速 close 後它照樣 fire，把收合中的 items 又翻回來（殭屍 reveal），
  //   跑完 clearProps 留下「無 transform = 全顯」殘態。open/close 兩端都要 kill 它 + killTweensOf。
  let revealCall = null;

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

  function openMenu() {
    // ⚠️ 先把選項藏好（clip wrapper + yPercent:100）再讓 nav 可見（user 2026-06-24 報「選項沒 stagger、閃一下出現」）：
    // 上次 reveal onComplete 的 clearProps:'transform' 讓選項停在全顯態 → 若先 .open 再 set hidden，
    // nav 一可見會閃一幀全顯選項才被壓回隱藏。把 hide 提到 .open 之前，這一幀不存在。
    if (typeof gsap !== 'undefined' && menuItems && menuItems.length) {
      setupClipReveal(menuItems);
      gsap.set(menuItems, { yPercent: 100 });
    }
    nav.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (typeof gsap !== 'undefined') {
      busy = true; // reveal 完成前鎖住 toggle（onComplete 解鎖）
      // 殺掉前一次 close 還掛著的「延遲滑出」tween（delay: itemsTotal）：
      // 不殺的話在 items 收合期間重開 menu，舊 tween 之後才 fire 會把開著的 menu 整個拉走，
      // state 卡在 open 但畫面上 menu 消失（user 2026-06-11 報「點箭頭後整個 menu 不見」）
      gsap.killTweensOf(nav);
      gsap.to(nav, { x: '0%', duration: DUR.fast, ease: EASE.enterSoft });
      if (revealCall) { revealCall.kill(); revealCall = null; }
      if (menuItems && menuItems.length) {
        setupClipReveal(menuItems);
        gsap.killTweensOf(menuItems);
        // 一律：延遲 0.105s 後從「隱藏(100)」staggered reveal。busy(line 76) 已鎖住開合動畫中再點 toggle，
        // open 必從完全關閉開始 → 不再用 `nav.getBoundingClientRect().right<=0` 分支（舊「中途可反向」殘留、busy 後已不可達）。
        // ⚠️ 該 BCR 判斷對 sub-pixel 脆弱：nav 是 fixed inset-0 + translateX(-100%)、關閉時 right 恰好 ≈0，
        //    偶爾捨入成 >0 → 走 else 立即 revealTween(無 delay) → 選項在 nav 還在滑入時就 reveal、看起來「沒 stagger」
        //    （user 2026-06-24 報）。改用 fromTo 自帶起點 100：不依賴外部 set 撐過 delay，stagger 每次都確定從隱藏播。
        revealCall = gsap.delayedCall(0.105, () => {
          revealCall = null;
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
        });
      }
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
        gsap.killTweensOf(nav); // 對稱保險：殺掉殘留的 open 滑入 tween
        if (revealCall) { revealCall.kill(); revealCall = null; } // 殺掉 pending 的殭屍 reveal（見上）
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
          });
        }
        gsap.to(nav, {
          x: '-100%',
          duration: DUR.fast,
          ease: EASE.exitSoft,
          delay: itemsTotal,
          onComplete: () => { busy = false; resolve(); }, // 收完 → 解鎖 toggle
        });
      } else {
        nav.style.transform = 'translateX(-100%)';
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