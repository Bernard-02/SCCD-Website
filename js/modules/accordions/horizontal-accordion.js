/**
 * Universal Accordion Module (Desktop Horizontal / Mobile Vertical)
 *
 * colored-accordion：旋轉卡片版（about 頁）
 * 其他 accordion：標準 width 展開版
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { playClipPathExit, navChipHidden, navChipTween, NAV_CHIP_SHOWN, randomRevealDir } from '../ui/scroll-animate.js';

let accordionWrappers = [];

export function initHorizontalAccordion() {
  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
    if (wrapper.classList.contains('colored-accordion')) {
      initRotatedAccordion(wrapper);
    } else {
      initSingleAccordion(wrapper);
    }
  });

  let resizeTimer;
  function onAccordionResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      accordionWrappers.forEach(wrapper => {
        if (wrapper.updateLayout) wrapper.updateLayout();
      });
    }, 150);
  }
  window.addEventListener('resize', onAccordionResize);
  // SPA 離開時解綁 resize + 清掉 detached wrapper 參考（否則每訪 about 累積 listener + DOM leak）
  registerPageCleanup(() => {
    window.removeEventListener('resize', onAccordionResize);
    clearTimeout(resizeTimer);
    accordionWrappers.length = 0;
  });
}

// ── 旋轉卡片版（colored-accordion）──────────────────────────────
// 每張卡片結構：[label | 照片 | 說明]，label 在最右，卡片往左展開
// 收合：只露 label 條，展開：整張卡片顯示
// z-index 由 index 決定（遞增）；顏色 nth-child(3n+1/2/3) 循環粉/綠/藍
// Hover（非展開卡）翻 strict B/W：底＋字全在 CSS 同一條 :hover:not(.active)（accordion.css／color.css）。
//   ⚠️ 別改回 JS inline 上底色：字靠 CSS :hover、底靠 mouseenter 兩套判定會脫鉤（applyLayout 清色時游標還在卡上
//   ＝白字配原 accent 底，user 2026-10-26 回報）
//   JS 只管 hover 抽新角
export function initRotatedAccordion(wrapper, { animateEntry = false } = {}) {
  if (window.innerWidth < 768) {
    initColoredCardAccordion(wrapper);
    return;
  }

  const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
  if (!items.length) return;

  // 每個 item 隨機旋轉 ±2°（排除接近 0°）
  const randomRot = () => {
    let r = 0;
    while (Math.abs(r) < 0.5) r = (Math.random() * 4 - 2);
    return parseFloat(r.toFixed(2));
  };
  const rotations = items.map(randomRot);

  // wrapper：相對定位容器（高度改由 accordion.css `.colored-accordion` min() 控制＝矮螢幕自動封頂、
  // resize 免重算；items height:100% 依 CSS 定高撐開）
  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'visible';

  let openIndex = 0;

  function getLabelWidth(item) {
    return item.querySelector('.accordion-label').offsetWidth;
  }

  function applyLayout(animate = false) {
    const wrapperW = wrapper.offsetWidth;
    const dur = animate ? 0.6 : 0;

    const labelWidths = items.map(item => getLabelWidth(item));
    const totalLabelW = labelWidths.reduce((s, w) => s + w, 0);

    // N 項通用：展開 body 寬度 = wrapper 寬扣掉全部 label
    const openBodyW = Math.max(0, wrapperW - totalLabelW);
    const openBodyWidths = items.map(() => openBodyW);

    // N 項通用 right 錨點：等同自身右側所有 label 寬總和
    const anchorRights = items.map((_, i) => {
      return labelWidths.slice(i + 1).reduce((s, w) => s + w, 0);
    });

    items.forEach((item, i) => {
      const body = item.querySelector('.accordion-body');
      const inner = item.querySelector('.accordion-body-inner');
      const rot = rotations[i];
      const isOpen = i === openIndex;

      item.style.position = 'absolute';
      item.style.top = '0';
      item.style.left = 'auto';
      item.style.height = '100%';
      item.style.display = 'flex';
      item.style.flexDirection = 'row';
      item.style.alignItems = 'stretch';
      // 繞 item 中心（全站旋轉一律中心，user 2026-10-03 撤 top right）：收合時 item＝標題 box → 標題中心；
      // 展開時 item＝整張卡 → 卡中心。展收中 width tween 時錨點跟著移屬預期
      item.style.transformOrigin = 'center';
      item.style.transform = `rotate(${rot}deg)`;
      item.style.zIndex = i + 1;
      item.style.overflow = 'hidden';

      const targetRight = anchorRights[i];
      // i <= openIndex 都展開 body（前面的被「推出來」，z-index 由 i+1 決定層疊）
      const targetBodyW = (i <= openIndex) ? openBodyWidths[i] : 0;

      if (inner) gsap.set(inner, { width: openBodyWidths[i] });

      if (animate) {
        gsap.to(item, { right: targetRight, duration: dur, ease: EASE.move });
        gsap.to(body, { width: targetBodyW, duration: dur, ease: EASE.move });
      } else {
        gsap.set(item, { right: targetRight });
        gsap.set(body, { width: targetBodyW });
      }

      item.classList.toggle('active', isOpen);
    });

    // history list 卡寬＝說明文字最大寬（accordion.css max-width 80%；scroll-snap.css #history .tl-list-cell 讀）
    const resText = /** @type {HTMLElement | null} */ (items[0].querySelector('[data-resources-text]'));
    if (resText) document.getElementById('history')?.style.setProperty('--res-text-w', `${resText.offsetWidth}px`);
  }

  applyLayout(false);

  // 進場：每張卡在自己的 box 內 clip-reveal（user 2026-10-26 取代「畫面外飛入→再展開第一張」）；
  // 卡片出生就是終態排版（第一張已展開），方向每張上下隨機（user 2026-10-26 撤左右）、跨卡 stagger 0.08。做法同下方退場（navChipHidden 反向）
  if (animateEntry && typeof ScrollTrigger !== 'undefined') {
    const hidden = items.map(item => navChipHidden(item, Math.random() < 0.5 ? 'top' : 'bottom'));
    items.forEach((item, i) => { item.style.clipPath = hidden[i].clipPath; item.style.translate = hidden[i].translate; });
    // 進退場走 navChipTween（proxy，非 GSAP 直接 tween translate 字串，見 scroll-animate.js）；proxy 不在 item 上 → 自留 ref 收
    let entryTweens = [];
    const killEntry = () => { entryTweens.forEach(t => t.kill()); entryTweens = []; };
    registerPageCleanup(killEntry);

    // 離頁退場：clip-reveal（user 2026-10-19，取代「飛回進場方向」）。卡片帶旋轉、沒有外層遮罩 →
    // 走 navChipHidden 模擬版：整張卡（含本體底色）沿自身旋轉軸滑出＋clip-path 把可見窗釘在原位＝遮罩是卡片自己的形狀；
    // 方向每張四向隨機、全部同時出場（user 2026-10-19：不要依序，手機版同）。只在 resources 區在視窗內才跑（看不到就略過）。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const r = wrapper.getBoundingClientRect();
      if (!(r.width > 0 && r.bottom > 0 && r.top < window.innerHeight)) { resolve(); return; }
      killEntry();
      gsap.killTweensOf(items);
      let left = items.length;
      items.forEach(item => navChipTween(item, NAV_CHIP_SHOWN, navChipHidden(item, randomRevealDir()), {
        duration: DUR.base, ease: EASE.exit, onComplete: () => { if (--left === 0) resolve(); },
      }));
    }));

    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        // anchor 跳轉飛掠中（如 vision 直跳 history）：飛入卡的畫面外 offset 會落到下個 section 的
        // 視圖裡（時間差），直接就定位不播（once 已消耗，之後捲回來卡片已在原位）。
        // 目的地就是本 section（點 resources 直達）→ 照常播進場
        const jumpTarget = document.body.dataset.anchorTarget;
        if (document.body.classList.contains('anchor-jumping') && jumpTarget !== wrapper.closest('section[id]')?.id) {
          gsap.set(items, { clearProps: 'clipPath,translate' });
          return;
        }
        entryTweens = items.map((item, i) => navChipTween(item, hidden[i], NAV_CHIP_SHOWN, {
          duration: DUR.reveal, ease: EASE.enter, delay: i * 0.08,
          onComplete: () => { item.style.clipPath = ''; item.style.translate = ''; },
        }));
      }
    });
  }

  items.forEach((item, i) => {
    const label = item.querySelector('.accordion-label');
    if (!label) return;

    item.addEventListener('mouseenter', () => {
      if (i === openIndex) return;
      // 進退場中（inline clip-path 在＝navChipTween 正在寫 translate）不抽角：GSAP 動 rotation 會把元素的 translate 屬性寫成 none
      // ＝卡片丟掉滑移量、clip 照收＝露在 box 外（user 2026-10-26）。clip-path 不擋 hit-test，還沒揭的卡也會被 hover 到
      if (item.style.clipPath) return;
      // hover 抽新角、離開保持（全站 hover 旋轉定案；user 2026-10-03 resources 補上）；寫回 rotations＝applyLayout／點開沿用。
      // 走 GSAP rotation（不直接寫 style.transform）：GSAP 快取同步，離頁飛回退場才不跳回舊角
      let r;
      do r = randomRot(); while (Math.abs(r - rotations[i]) < 1);
      rotations[i] = r;
      gsap.to(item, { rotation: r, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
    });

    label.addEventListener('mouseenter', () => {
      if (openIndex !== 0 || i === openIndex) return;
      item.style.zIndex = items.length + 1;
    });
    label.addEventListener('mouseleave', () => {
      if (openIndex !== 0 || i === openIndex) return;
      item.style.zIndex = i + 1;
    });

    item.addEventListener('click', () => {
      if (i === openIndex) return;
      openIndex = i;
      applyLayout(true);
    });
  });

  wrapper.updateLayout = () => applyLayout(false);
  accordionWrappers.push(wrapper);
}

// ── 手機卡片版（colored-accordion，about resources）──────────────
// 一張張旋轉卡片（±1~2°），單開互斥；點標題切換到那張（永遠保持 ≥1 張展開，不能全收 — user 2026-06-15）。
// user 2026-06-11：取代舊的「全寬色塊 + 永遠開一個」單列版（保留「永遠開一個」不變式）。
// animateEntry：卡片 clip-path 由第一到最後依序揭露，全部就位後自動展開第一張（簡化版桌面 entry）。
export function initColoredCardAccordion(wrapper, { animateEntry = false } = {}) {
  if (!wrapper || accordionWrappers.includes(wrapper)) return;
  accordionWrappers.push(wrapper);

  const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
  if (!items.length) return;

  let openItem = null;

  function closeCard(item) {
    gsap.to(item.querySelector('.accordion-body'), { height: 0, duration: DUR.medium, ease: EASE.move, overwrite: true });
    item.classList.remove('active');
    if (openItem === item) openItem = null;
  }

  function openCard(item) {
    if (openItem && openItem !== item) closeCard(openItem);
    gsap.to(item.querySelector('.accordion-body'), { height: 'auto', duration: DUR.medium, ease: EASE.move, overwrite: true });
    item.classList.add('active');
    openItem = item;
  }

  items.forEach(item => {
    const mag = 1 + Math.random(); // 1~2°
    item.style.transform = `rotate(${(Math.random() < 0.5 ? -mag : mag).toFixed(2)}deg)`;

    gsap.set(item.querySelector('.accordion-body'), { height: 0 });
    item.classList.remove('active');

    // 綁 label 不綁整張卡：展開後點內文/圖片不應誤觸收合
    const label = item.querySelector('.accordion-label');
    (label || item).addEventListener('click', () => {
      // 手機至少保持一張展開（user 2026-06-15）：點已開的那張 = no-op（不收合），只能切換到別張
      // （openCard 內會自動收掉前一張）→ 永遠 ≥1 張開。對齊桌面 initRotatedAccordion（點 active 不會回到全收）。
      if (openItem === item) return;
      openCard(item);
    });
  });

  // 進場：clip-path 擦除（設在卡片本體 = local space 跟著旋轉，角不被切）第一→最後 stagger，
  // 完成後若使用者還沒自己點開任何一張，自動展開第一張（user 2026-06-11「至少會打開一個」）。
  // 無進場路徑（或 ScrollTrigger 缺席）也直接開第一張兜底，保證任何情況都至少開一張。
  if (animateEntry && typeof ScrollTrigger !== 'undefined') {
    gsap.set(items, { clipPath: 'inset(0% 100% 0% 0%)' });
    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(items, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: DUR.slow,
          ease: EASE.enter,
          stagger: 0.1,
          onComplete: () => { if (!openItem && items[0]) openCard(items[0]); },
        });
      },
    });
    // 離頁退場：clip-path wipe 收掉（桌面版 initRotatedAccordion 有飛回退場，手機版原本漏 → 卡片不退場）。
    // playClipPathExit 內建 viewportOnly + 「inline clipPath 有值走 to / 空走 fromTo」分流（未進場不閃）。
    registerPageExit(() => playClipPathExit(items));
  } else if (items[0]) {
    openCard(items[0]);
  }
}

// ── 標準版（其他 accordion）──────────────────────────────────────
export function initSingleAccordion(wrapper) {
  if (!wrapper || accordionWrappers.includes(wrapper)) return;

  accordionWrappers.push(wrapper);
  const items = wrapper.querySelectorAll('.accordion-item');
  if (items.length === 0) return;

  let activeItem = items[0];
  const isMobile = () => window.innerWidth < 768;

  function getExpandedContentWidth() {
    const wrapperW = wrapper.offsetWidth;
    let totalLabelW = 0;
    const gapPx = parseFloat(window.getComputedStyle(wrapper).gap) || 0;
    items.forEach(i => {
      totalLabelW += i.querySelector('.accordion-label').offsetWidth;
    });
    const totalGap = gapPx * (items.length - 1);
    return wrapperW - totalLabelW - totalGap;
  }

  function updateLayout() {
    const mobile = isMobile();
    const expandedW = !mobile ? getExpandedContentWidth() : 0;
    const currentActive = wrapper.querySelector('.accordion-item.active') || items[0];
    activeItem = currentActive;

    items.forEach((item) => {
      const body = item.querySelector('.accordion-body');
      const inner = item.querySelector('.accordion-body-inner');
      const isActive = item === activeItem;

      gsap.set(item, { clearProps: 'width,flex-shrink' });
      gsap.set(body, { clearProps: 'width,height' });
      if (inner) gsap.set(inner, { clearProps: 'width' });

      if (mobile) {
        item.style.width = '100%';
        if (isActive) {
          gsap.set(body, { height: 'auto', width: '100%' });
          item.classList.add('active');
        } else {
          gsap.set(body, { height: 0, width: '100%' });
          item.classList.remove('active');
        }
      } else {
        item.style.width = 'auto';
        if (inner) gsap.set(inner, { width: expandedW });
        if (isActive) {
          gsap.set(body, { width: expandedW });
          item.classList.add('active');
        } else {
          gsap.set(body, { width: 0 });
          item.classList.remove('active');
        }
      }
    });
  }

  updateLayout();

  items.forEach(item => {
    item.addEventListener('click', function () {
      if (this === activeItem) return;
      const prevItem = activeItem;
      const nextItem = this;
      const prevBody = prevItem.querySelector('.accordion-body');
      const nextBody = nextItem.querySelector('.accordion-body');

      if (isMobile()) {
        gsap.to(prevBody, { height: 0, duration: DUR.medium, ease: EASE.move });
        gsap.to(nextBody, { height: 'auto', duration: DUR.medium, ease: EASE.move });
      } else {
        const expandedW = getExpandedContentWidth();
        gsap.to(prevBody, { width: 0, duration: DUR.medium, ease: EASE.move });
        gsap.to(nextBody, { width: expandedW, duration: DUR.medium, ease: EASE.move });
      }

      prevItem.classList.remove('active');
      nextItem.classList.add('active');
      activeItem = nextItem;
    });
  });

  wrapper.updateLayout = updateLayout;
}
