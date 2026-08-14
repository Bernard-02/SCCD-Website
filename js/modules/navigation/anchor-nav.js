// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Anchor Navigation Module
 * 處理 About 頁面的左側錨點導航與 Scroll Spy
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';

/**
 * @param {{ reveal?: boolean }} [opts] reveal:true 啟用左側 nav 的 hero clip-reveal 進場/退場
 *   （about + alumni 皆套，2026-07-17 起 alumni 一併開啟）
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
        // 手機水平 strip 置中由 setActiveBtn 統一處理（點擊/scroll-spy 同一路徑）
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

  // 左側 nav 進場/退場（about + alumni；比照 faculty/activities/admission nav）：
  // hero 式 clip-reveal＝translate（獨立屬性，與 inner 的 inline rotate 共存）＋同步 clip-path 滑動揭露
  // （navChipHidden，見 scroll-animate.js）、每顆固定一個隨機方向（2026-07-17 user 定全站 nav btn 四方向隨機）、
  // 第一個內容區進視窗時 once、離頁且已 reveal 才反向；transition:'none' 解 navigation.css .anchor-nav-inner 的
  // `transition: all`（含 clip/translate）對 GSAP 每幀寫的接管卡頓，跑完還原。只取桌面 #anchor-nav（mobile 選單另一容器、不套）。
  // 矮橫向 gate 交給下方雙向分支接管（同一組 inner 不能雙驅動）。
  const NAV_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
  const isLandscapeGate = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  if (reveal && typeof gsap !== 'undefined' && window.innerWidth >= 768 && !isLandscapeGate) {
    const inners = Array.from(document.querySelectorAll('#anchor-nav .anchor-nav-inner'));
    if (inners.length) {
      let navRevealed = false;
      const navDir = new Map(inners.map(el => [el, pickNavDir(el)]));
      inners.forEach(el => { el.style.transition = 'none'; gsap.set(el, navChipHidden(el, navDir.get(el))); });

      const play = () => {
        if (navRevealed) return;
        navRevealed = true;
        gsap.to(inners, {
          ...NAV_CHIP_SHOWN, duration: DUR.base, ease: NAV_EASE, stagger: 0.05, clearProps: 'clipPath,translate',
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
        const hid = inners.map(el => navChipHidden(el, navDir.get(el)));
        gsap.fromTo(inners,
          { ...NAV_CHIP_SHOWN },
          { clipPath: (i) => hid[i].clipPath, translate: (i) => hid[i].translate, duration: DUR.base, ease: NAV_EASE, stagger: { each: 0.05, from: 'end' }, overwrite: true, onComplete: resolve });
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
        // 手機水平 strip：active btn 捲到 strip 置中（點擊與 scroll-spy 共用；桌面 nav 無 strip → no-op）
        const strip = btn.closest('#mobile-anchor-strip');
        if (strip) {
          const b = btn.getBoundingClientRect();
          const s = strip.getBoundingClientRect();
          strip.scrollTo({ left: strip.scrollLeft + (b.left + b.width / 2) - (s.left + s.width / 2), behavior: 'smooth' });
        }
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

    // about 浮動多邊形層掛 section 切換 morph（無 strip 的頁面走事件；alumni 等無人監聽時 no-op）
    // click=force：點擊導航（含同顆重點）每次都 morph；scroll-spy 連環 activation 由監聽端 coalesce
    document.dispatchEvent(new CustomEvent('anchornav:active', { detail: { id, click: force } }));
  }

  // 手機直向：捲動讓某 anchor 變 active（scroll spy）時，停手後把該 section 拉到落點——
  // 與點擊 nav btn 同一 scrollIntoView + scroll-margin-top 落點（user 2026-07-13「不只點擊時對齊」）。
  // 桌面不套（CSS proximity snap 已對齊）；只在 active「切換」那一次對齊，之後區內自由捲不再拉回。
  // 手勢閘：touch 按住/滑動中不動作（scrollIntoView 會跟手勢打架），放手 + 捲動靜止 220ms 才對齊；
  // 已在落點 ±6px 內不動（避免微跳）。init 後 600ms 內不對齊：refresh 恢復捲動位置時 IO 初始 delivery
  // 也會 setActiveBtn，那不是使用者捲動、載入當下不能自己捲頁。
  // reveal（= about 專用旗標）gate：alumni 共用本模組但未指定此行為、其 section 多為長列表不適合拉回。
  const spyAlign = reveal && window.innerWidth < 768 && window.matchMedia('(orientation: portrait)').matches;
  const spyInitTs = performance.now();
  let pendingAlignId = null;
  let alignIdleTimer = null;
  let touching = false;
  const alignPending = () => {
    const id = pendingAlignId;
    pendingAlignId = null;
    if (!id || clickScrolling) return;
    const target = document.getElementById(id);
    if (!target) return;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    if (Math.abs(target.getBoundingClientRect().top - margin) < 6) return;
    // 對齊捲動期間關 spy（同 click 路徑），免中途又觸發別的 activation
    clickScrolling = true;
    clearTimeout(clickScrollTimer);
    clickScrollTimer = setTimeout(() => { clickScrolling = false; }, 1200);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const kickAlign = () => {
    clearTimeout(alignIdleTimer);
    alignIdleTimer = setTimeout(() => { if (!touching) alignPending(); }, 220);
  };
  if (spyAlign) {
    const onScroll = () => { if (pendingAlignId !== null) kickAlign(); };
    const onTouchStart = () => { touching = true; clearTimeout(alignIdleTimer); };
    const onTouchEnd = () => { touching = false; if (pendingAlignId !== null) kickAlign(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    registerPageCleanup(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      clearTimeout(alignIdleTimer);
    });
  }

  const observer = new IntersectionObserver((entries) => {
    if (clickScrolling) return; // 點擊滾動中，暫停 scroll spy
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = sectionMap.get(entry.target) || entry.target.id;
        const changed = id !== currentActiveId;
        setActiveBtn(id);
        if (spyAlign && changed && performance.now() - spyInitTs > 600) {
          pendingAlignId = id;
          kickAlign();
        }
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    observer.observe(section);
  });
  // SPA 離開 about 時 disconnect，否則 observer 持續 hold 已被 router.innerHTML swap 掉的 section refs
  registerPageCleanup(() => observer.disconnect());

  // 矮橫向（landscape gate）：nav 是 fixed 在 header 帶（landscape.css 5i）→ hero 區間藏（about）、
  // footer 進視窗前收起（user 2026-07-07「nav btn 不要出現在 footer 上」）。進出場＝clip-path 雙向
  // setNav（user 2026-07-10 定為全站 nav btn 原則、不用 opacity/translateY，同 curriculum/faculty/admission）：
  // 每顆 inner 固定隨機方向來回一致、stagger:0 同時、隱藏時 nav pointer-events 一併關。
  // rootMargin 底部 -25%：footer 頂過視窗 75% 線才算「到底部」——history 是末段一屏，
  // footer 剛在底緣露頭就收會讓 nav 在 history 視圖就消失（過早）。
  // 兩顆 IO 各記各的 flag、統一 applyHide：直接在 callback 各自 setNav 的話，初始 delivery 順序
  // 決定最終狀態（footer 的 false 蓋掉 hero 的 true），載入在 hero 上 nav 會露出。
  // reveal 是 about 專屬旗標（alumni 不傳）→ hero 收起只掛 about；alumni 只掛 footer 收起（初始可見）。
  if (isLandscapeGate && typeof gsap !== 'undefined') {
    const navEl = document.getElementById('anchor-nav');
    const inners = navEl ? Array.from(navEl.querySelectorAll('.anchor-nav-inner')) : [];
    const footerEl = document.getElementById('site-footer');
    const heroEl = reveal ? document.querySelector('#page-content > section') : null;
    if (navEl && inners.length && (footerEl || heroEl)) {
      // about 載入在 hero 上 → 初始就藏（不等 IO 首發，免閃現）；alumni 無 hero 收起 → 初始可見。
      // 可見側也寫顯式 inset(0%)/translate 0：computed 'none' GSAP 無法補間（同 clearProps 後 exit 的陷阱），
      // 否則 alumni 第一次 footer 收起會直接跳掉沒動畫。
      let hidden = !!heroEl;
      const navDir = new Map(inners.map(el => [el, pickNavDir(el)]));  // 每顆固定隨機方向、reveal/hide 來回一致
      inners.forEach(el => { el.style.transition = 'none'; gsap.set(el, hidden ? navChipHidden(el, navDir.get(el)) : { ...NAV_CHIP_SHOWN }); });
      if (hidden) navEl.style.pointerEvents = 'none';
      else inners.forEach(el => { el.style.transition = ''; });  // 可見側單次寫入無視覺變化，還原 hover transition
      const setNav = (hide) => {
        if (hidden === hide) return;
        hidden = hide;
        gsap.killTweensOf(inners);
        inners.forEach(el => { el.style.transition = 'none'; });
        navEl.style.pointerEvents = hide ? 'none' : '';
        const hid = hide ? inners.map(el => navChipHidden(el, navDir.get(el))) : null;
        gsap.to(inners, {
          clipPath: hide ? (i) => hid[i].clipPath : NAV_CHIP_SHOWN.clipPath,
          translate: hide ? (i) => hid[i].translate : NAV_CHIP_SHOWN.translate,
          duration: DUR.base, ease: NAV_EASE, stagger: 0, overwrite: true,
          onComplete: () => { if (!hide) inners.forEach(el => { el.style.transition = ''; }); },
        });
      };
      let footerVis = false;
      let heroVis = !!heroEl;
      const applyHide = () => setNav(footerVis || heroVis);
      if (footerEl) {
        const footerIO = new IntersectionObserver(([e]) => {
          footerVis = e.isIntersecting;
          applyHide();
        }, { rootMargin: '0px 0px -25% 0px' });
        footerIO.observe(footerEl);
        registerPageCleanup(() => footerIO.disconnect());
      }
      if (heroEl) {
        // rootMargin 頂部 -120：overview 落點時 hero 底邊在 104（scroll-margin），留 16px buffer
        // 讓落點處 nav 一定是「已現身」狀態、不會在 snap 邊緣抖動。
        const heroIO = new IntersectionObserver(([e]) => {
          heroVis = e.isIntersecting;
          applyHide();
        }, { rootMargin: '-120px 0px 0px 0px' });
        heroIO.observe(heroEl);
        registerPageCleanup(() => heroIO.disconnect());
      }
    }
  }

  // 3.（2026-07-07 移除）舊手機 floating 圓鈕選單（mobile-anchor-toggle/wrapper/menu/overlay/container）——
  //    about.html 已改為 hero 下方水平 strip（#mobile-anchor-strip，行為走上面共用 click/scroll-spy），
  //    floating DOM 已刪、此段邏輯純 delete（alumni 無此結構、無其他消費者）。
}