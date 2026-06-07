// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Anchor Navigation Module
 * 處理 About 頁面的左側錨點導航與 Scroll Spy
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';

/**
 * @param {{ reveal?: boolean }} [opts] reveal:true 啟用左側 nav 的 clip-path 進場/退場（about 專用；
 *   alumni 共用同一 nav 結構但暫不套，手感逐頁驗）
 */
export function initAnchorNav({ reveal = false } = {}) {
  const navButtons = document.querySelectorAll('.anchor-nav-btn');

  // Build sectionMap: observed element → button target id
  // Observe section[id] + any non-section nav targets (e.g. div#works)
  // For zero-height anchor divs, observe their next sibling with content instead
  // OBSERVE_OVERRIDES：某些 anchor 的觀察對象不是 section/anchor 本身，而是該 anchor 的內容區
  // - 'class' 觀察 class-info-area（Class 的內容區），否則整個 #class section 會一直 intersecting，蓋過 works 偵測
  // - 'works' 觀察 class-works-panels（Works 的內容區），因為 #works 是零高度 wrapper
  const OBSERVE_OVERRIDES = {
    'class': 'class-info-area',
    'works': 'class-works-panels',
  };
  const sectionMap = new Map();

  document.querySelectorAll('section[id]').forEach(el => {
    if (OBSERVE_OVERRIDES[el.id]) return; // 由下面 navButtons 迴圈透過 override 補登
    sectionMap.set(el, el.id);
  });

  navButtons.forEach(btn => {
    const id = btn.getAttribute('data-target');
    if (!id) return;
    const overrideId = OBSERVE_OVERRIDES[id];
    let observeEl;
    if (overrideId) {
      observeEl = document.getElementById(overrideId);
    } else {
      const el = document.getElementById(id);
      if (!el || sectionMap.has(el)) return;
      // Zero-height anchor divs: observe next sibling with actual content
      observeEl = (el.offsetHeight < 2 && el.nextElementSibling) ? el.nextElementSibling : el;
    }
    if (observeEl && !sectionMap.has(observeEl)) {
      sectionMap.set(observeEl, id);
    }
  });

  const sections = [...sectionMap.keys()];

  if (navButtons.length === 0 || sections.length === 0) return;

  // 1. 點擊滾動功能
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        // 點擊時立即 active，並暫停 scroll spy 避免滾動過程中被覆蓋
        // force: true 讓即使已是 active 也會重新選色 + 重跑封鎖線動畫
        setActiveBtn(targetId, { force: true });
        clickScrolling = true;
        clearTimeout(clickScrollTimer);
        clickScrollTimer = setTimeout(() => { clickScrolling = false; }, 1200);

        // 使用 scrollIntoView，由各 section 的 scroll-margin-top 決定對齊位置
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 2. Scroll Spy (滾動監聽)
  // 使用 IntersectionObserver 監聽區塊是否進入視窗中間
  const observerOptions = {
    root: null,
    // rootMargin 設定為 '-50% 0px -50% 0px' 表示只偵測視窗正中間的一條線
    // 這樣可以精確判斷當前視窗中心位於哪個區塊，解決區塊重疊或高度過高導致的誤判
    rootMargin: '-50% 0px -50% 0px',
    threshold: 0
  };

  const NAV_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
  let lastNavColorIndex = -1;

  // Programs 區封鎖綫換色時排除「當前 active division tab」顏色，避免兩者撞色
  // 讀 dataset.accentHex 不讀 style.background：瀏覽器把 inline style 的顏色序列化成
  // rgb(...) 回吐（'#00FF80' 讀回變 'rgb(0, 255, 128)'），跟 NAV_COLORS hex 比永遠不相等 →
  // exclude 默默失效。寫色那端（bfa-division-toggle setActive）會同步把原始 hex 存進 dataset。
  function getActiveDivisionColor() {
    const el = /** @type {HTMLElement | null} */ (document.querySelector('.class-division-btn.active'));
    if (!el) return null;
    const c = (el.dataset.accentHex || '').trim().toLowerCase();
    return c || null;
  }

  function getNavColor(excludeColor) {
    const excludeIdx = excludeColor
      ? NAV_COLORS.findIndex(c => c.toLowerCase() === excludeColor.toLowerCase())
      : -1;
    let index;
    let safety = 0;
    do {
      index = Math.floor(Math.random() * NAV_COLORS.length);
      safety++;
    } while ((index === lastNavColorIndex || index === excludeIdx) && safety < 20);
    lastNavColorIndex = index;
    return NAV_COLORS[index];
  }

  function getNavRotation() {
    let deg;
    do { deg = Math.round(Math.random() * 6) - 3; } while (Math.abs(deg) < 0.5);
    return deg;
  }

  // 初始化每個 btn 的 base rotation
  navButtons.forEach(btn => {
    btn._baseRot = getNavRotation();
    const inner = btn.querySelector('.anchor-nav-inner');
    if (inner) inner.style.transform = `rotate(${btn._baseRot}deg)`;

    // Hover：記錄新角度
    inner && inner.addEventListener('mouseenter', () => {
      if (btn.classList.contains('active')) return;
      const rot = getNavRotation();
      btn._pendingRot = rot;
      inner.style.transform = `rotate(${rot}deg)`;
    });
    inner && inner.addEventListener('mouseleave', () => {
      if (btn.classList.contains('active')) return;
      inner.style.transform = `rotate(${btn._baseRot}deg)`;
      btn._pendingRot = null;
    });
  });

  // 左側 nav clip-path 進場/退場（about 專用，比照 faculty/activities/admission nav）：
  // clip-path 套 .anchor-nav-inner 自身（旋轉角不裁、原地揭露）、4 方向隨機、第一個內容區進視窗時 once、
  // 離頁且已 reveal 才反向；transition:'none' 解 navigation.css .anchor-nav-inner 的 `transition: all`（含 clip-path）
  // 對 GSAP 每幀寫的接管卡頓，跑完還原。只取桌面 #anchor-nav（mobile 選單另一容器、不套）。
  if (reveal && typeof gsap !== 'undefined' && window.innerWidth >= 768) {
    const NAV_CLIP_DIRS = ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 100% 0% 0%)'];
    const NAV_REVEALED = 'inset(0% 0% 0% 0%)';
    const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
    const pickClip = () => NAV_CLIP_DIRS[Math.floor(Math.random() * NAV_CLIP_DIRS.length)];
    const inners = Array.from(document.querySelectorAll('#anchor-nav .anchor-nav-inner'));
    if (inners.length) {
      let navRevealed = false;
      inners.forEach(el => { el.style.transition = 'none'; gsap.set(el, { clipPath: pickClip() }); });

      const play = () => {
        if (navRevealed) return;
        navRevealed = true;
        gsap.to(inners, {
          clipPath: NAV_REVEALED, duration: DUR.base, ease: NAV_EASE, stagger: 0.05, clearProps: 'clipPath',
          onComplete: () => inners.forEach(el => { el.style.transition = ''; }),
        });
      };
      const trigger = sections[0];
      const inView = trigger && trigger.getBoundingClientRect().top < window.innerHeight * 0.9;
      if (!trigger || inView || typeof ScrollTrigger === 'undefined') {
        play();
      } else {
        ScrollTrigger.create({ trigger, start: 'top 90%', once: true, onEnter: play });
      }

      registerPageExit(() => new Promise(resolve => {
        if (typeof gsap === 'undefined' || !navRevealed) { resolve(); return; }
        gsap.killTweensOf(inners);
        inners.forEach(el => { el.style.transition = 'none'; });
        gsap.fromTo(inners,
          { clipPath: NAV_REVEALED },
          { clipPath: () => pickClip(), duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.05, from: 'end' }, overwrite: true, onComplete: resolve });
      }));
    }
  }

  let currentActiveId = null;
  let clickScrolling = false; // 點擊導航時暫停 scroll spy
  let clickScrollTimer = null;

  function setActiveBtn(id, { force = false } = {}) {
    if (!force && id === currentActiveId) return;
    currentActiveId = id;
    // Programs(class) 與 Works 兩條封鎖綫都排除當前 active division tab 色（共用同排 sticky btn）；其他 anchor 不限
    const color = getNavColor((id === 'class' || id === 'works') ? getActiveDivisionColor() : null);
    navButtons.forEach(btn => {
      const isActive = btn.getAttribute('data-target') === id;
      const inner = btn.querySelector('.anchor-nav-inner');
      btn.classList.toggle('active', isActive);
      if (!inner) return;
      if (isActive) {
        const rot = btn._pendingRot ?? getNavRotation();
        btn._baseRot = rot;
        btn._pendingRot = null;
        inner.style.background = color;
        inner.style.transform = `rotate(${rot}deg)`;
      } else {
        inner.style.background = '';
        // 保持各自 base rot，不歸零
        inner.style.transform = `rotate(${btn._baseRot}deg)`;
      }
    });

    // 觸發對應 anchor 的封鎖綫 replay（顏色跟 nav 同步）
    // 每個 anchor 有自己的 strip（透過 data-anchor="xxx" 對應），不共用
    // 如果顏色跟上次一樣，則不重跑動畫（避免無意義閃動）
    const strip = document.querySelector(`.section-title-strip[data-anchor="${id}"]`);
    if (strip && typeof strip._replayReveal === 'function') {
      if (strip._lastReplayColor !== color) {
        strip._lastReplayColor = color;
        strip._replayReveal(color);
      }
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if (clickScrolling) return; // 點擊滾動中，暫停 scroll spy
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = sectionMap.get(entry.target) || entry.target.id;
        setActiveBtn(id);
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    observer.observe(section);
  });
  // SPA 離開 about 時 disconnect，否則 observer 持續 hold 已被 router.innerHTML swap 掉的 section refs
  registerPageCleanup(() => observer.disconnect());

  // 3. Mobile Menu Toggle Logic
  const mobileToggle = document.getElementById('mobile-anchor-toggle');
  const mobileWrapper = document.getElementById('mobile-anchor-wrapper');
  const mobileMenu = document.getElementById('mobile-anchor-menu');
  const mobileOverlay = document.getElementById('mobile-anchor-overlay');
  const mobileContainer = document.getElementById('mobile-anchor-container');
  const footer = document.getElementById('site-footer');

  if (mobileToggle && mobileWrapper && mobileMenu && mobileContainer) {
    let isOpen = false;
    const icon = mobileToggle.querySelector('i');

    const toggleMenu = () => {
      isOpen = !isOpen;
      
      // 使用 GSAP 處理動畫
      if (typeof gsap === 'undefined') return;

      if (isOpen) {
        // Open State
        // 1. Show Overlay
        if (mobileOverlay) {
          mobileOverlay.classList.remove('pointer-events-none');
          gsap.to(mobileOverlay, { opacity: 1, duration: DUR.fast });
        }

        // 2. Prepare Menu (Show but invisible so height can be calculated)
        mobileMenu.classList.remove('hidden');

        // 3. Expand Wrapper (Circle -> Rounded Rect)
        gsap.to(mobileWrapper, {
          width: 160, // w-40
          height: 'auto',
          borderRadius: 24,
          duration: DUR.medium,
          ease: EASE.enterSoft
        });
        
        // 4. Show Menu Items
        gsap.to(mobileMenu, { opacity: 1, duration: DUR.fast });
        
        const menuItems = mobileMenu.querySelectorAll('.anchor-nav-btn');
        gsap.fromTo(menuItems, 
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: DUR.base, stagger: 0.05, ease: EASE.enterSoft }
        );

        // 5. Icon Change (Rotate & Swap)
        if (icon) icon.classList.replace('fa-list', 'fa-xmark');
      } else {
        // Closed State
        // 1. Hide Overlay
        if (mobileOverlay) {
          mobileOverlay.classList.add('pointer-events-none');
          gsap.to(mobileOverlay, { opacity: 0, duration: DUR.fast });
        }
        
        // 2. Collapse Wrapper
        gsap.to(mobileWrapper, {
          width: 48, // w-12
          height: 48, // h-12
          borderRadius: 24, // 使用 24px (48px的一半) 保持圓形，避免使用 % 造成動畫變形
          duration: DUR.fast,
          ease: EASE.move
        });

        // 3. Hide Menu Items
        gsap.to(mobileMenu, { opacity: 0, duration: DUR.micro, onComplete: () => mobileMenu.classList.add('hidden') });

        // 4. Icon Change
        if (icon) icon.classList.replace('fa-xmark', 'fa-list');
      }
    };

    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (isOpen && !mobileWrapper.contains(/** @type {Node} */ (e.target))) {
        toggleMenu();
      }
    });
    
    // Close when clicking overlay
    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        if (isOpen) toggleMenu();
      });
    }

    // Close when clicking a link inside the mobile menu
    const mobileLinks = mobileMenu.querySelectorAll('.anchor-nav-btn');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (isOpen) toggleMenu();
      });
    });

    // 4. Scroll Visibility Logic (Mobile)
    const handleScroll = () => {
      const footerRect = footer ? footer.getBoundingClientRect() : null;
      const isFooterVisible = footerRect ? (footerRect.top < window.innerHeight) : false;
      const isPastHero = window.scrollY > window.innerHeight * 0.8;

      // Mobile: Visibility of the button container
      if (isPastHero && !isFooterVisible) {
        mobileContainer.classList.remove('opacity-0', 'pointer-events-none');
        mobileContainer.classList.add('pointer-events-auto');
      } else {
        mobileContainer.classList.add('opacity-0', 'pointer-events-none');
        mobileContainer.classList.remove('pointer-events-auto');
      }

      // Auto-close if open and footer is visible
      if (isFooterVisible && isOpen) {
        toggleMenu();
      }
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    // SPA 離開 about 時解綁，避免下一頁 scroll 持續觸發 query about 專屬 DOM
    registerPageCleanup(() => window.removeEventListener('scroll', handleScroll));
  }
}