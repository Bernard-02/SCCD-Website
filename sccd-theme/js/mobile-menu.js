// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Mobile Menu Logic
 * 處理手機版漢堡選單的開關、圖示切換與手風琴效果
 */

import { setupClipReveal } from './modules/ui/scroll-animate.js';
import { navigateTo } from './router.js';

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
  // icon swap 兩態：open（漢堡 mask）/ close（FA xmark）
  // 用 inline style.display 切換，避 Tailwind .hidden 跟 FA .fa-solid display:inline-block 的 cascade 競爭
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
  function openMenu() {
    nav.classList.add('open');
    if (typeof gsap !== 'undefined') {
      gsap.to(nav, { x: '0%', duration: 0.28, ease: 'power2.out' });
      // 進場：clip-reveal 下往上（hero title 同款）
      // 縮 30% 後不能呼叫 playClipReveal helper（它寫死 0.9s + stagger 0.12），inline 寫
      // 修「Faculty/Curriculum 沒進場」bug：
      //   1) setupClipReveal 先跑（wrap + set yPercent:100），但因為 setupClipReveal 內部 gsap.set 跟接下來的
      //      tween 之間若 GSAP 對「同 prop 連續 set + to」做優化會略過部分 item 的初始值
      //   2) killTweensOf 先清掉所有 menuItems 上的舊 tween（前次 close 的 yPercent:100 tween 可能還沒完全 settle）
      //   3) gsap.set 強制重設 yPercent:100（在 killTweensOf 之後執行才不會被舊 tween 蓋）
      //   4) delayedCall 0.105s 後跑 reveal
      if (menuItems && menuItems.length) {
        setupClipReveal(menuItems);
        gsap.killTweensOf(menuItems);
        gsap.set(menuItems, { yPercent: 100 });
        gsap.delayedCall(0.105, () => {
          gsap.to(menuItems, {
            yPercent: 0,
            duration: 0.63,
            stagger: { each: 0.084, from: 'start' },
            ease: 'power3.out',
            overwrite: true,
            clearProps: 'transform',
          });
        });
      }
    } else {
      nav.style.transform = 'translateX(0%)';
    }
    if (iconOpen) iconOpen.style.display = 'none';
    if (iconClose) iconClose.style.display = '';
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    document.body.style.overflow = 'hidden';
  }

  // close: 回傳 Promise 在動畫完成後 resolve（nav link click 場景用來決定何時 navigate）
  // 退場語義 = 進場反向：items 倒序 yPercent 0→100 全部播完才 nav slide-out（不跟 nav 一起）
  function closeMenu() {
    nav.classList.remove('open');
    if (iconOpen) iconOpen.style.display = '';
    if (iconClose) iconClose.style.display = 'none';
    applyRandomRotation(menuBtnBox);
    applyRandomRotation(modeBtnBox);
    document.body.style.overflow = '';
    return new Promise(resolve => {
      if (typeof gsap !== 'undefined') {
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
            ease: 'power2.in',
          });
        }
        gsap.to(nav, {
          x: '-100%',
          duration: 0.28,
          ease: 'power2.in',
          delay: itemsTotal,
          onComplete: resolve,
        });
      } else {
        nav.style.transform = 'translateX(-100%)';
        resolve();
      }
    });
  }

  // 1. 漢堡按鈕：toggle
  btn.addEventListener('click', () => {
    if (nav.classList.contains('open')) closeMenu();
    else openMenu();
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
                duration: 0.3, 
                ease: 'power2.out', 
                onComplete: () => {
                  otherSubmenu.classList.add('hidden');
                  otherSubmenu.style.height = '';
                  otherSubmenu.style.opacity = '';
                  otherSubmenu.style.overflow = '';
                }
              });
              gsap.to(otherChevron, { rotation: 0, duration: 0.3 });
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
              duration: 0.4, 
              ease: 'power2.out',
              onComplete: () => {
                submenu.style.overflow = '';
                submenu.style.height = '';
              }
            }
          );
          gsap.to(chevron, { rotation: 180, duration: 0.3 });
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
            duration: 0.3, 
            ease: 'power2.out', 
            onComplete: () => {
              submenu.classList.add('hidden');
              submenu.style.height = '';
              submenu.style.opacity = '';
              submenu.style.overflow = '';
            }
          });
          gsap.to(chevron, { rotation: 0, duration: 0.3 });
        } else {
          submenu.classList.add('hidden');
          chevron.style.transform = 'rotate(0deg)';
        }
      }
    });
  });
}