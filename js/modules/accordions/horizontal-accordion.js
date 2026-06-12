/**
 * Universal Accordion Module (Desktop Horizontal / Mobile Vertical)
 *
 * colored-accordion：旋轉卡片版（about 頁）
 * 其他 accordion：標準 width 展開版
 */

import { registerPageCleanup } from '../ui/page-cleanup.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';

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

// ── Hover 色：strict B/W（依 mode + 對比度）──────────────────────
// 舊版 hover 換黃/紫/橘 accent，已拿掉。現在 hover bg 一律設 var(--theme-fg)：
//   standard（mode1）= 黑底、inverse（mode2）= 白底；字色由 accordion.css 的
//   「非 mode-color hover」規則翻成 var(--theme-fg-inverse)（白/黑）。
// mode-color（mode3）：這裡設的 inline bg 只當 hover 偵測 trigger，實際翻色由
//   themes/color.css 的 .accordion-label[style*="background"] !important 規則接管。

// ── 旋轉卡片版（colored-accordion）──────────────────────────────
// 每張卡片結構：[label | 照片 | 說明]，label 在最右，卡片往左展開
// 收合：只露 label 條，展開：整張卡片顯示
// z-index 由 index 決定（遞增）；顏色 nth-child(3n+1/2/3) 循環粉/綠/藍
// Hover 時非展開的卡片換成循環 HOVER_COLORS
export function initRotatedAccordion(wrapper, { height = 600, animateEntry = false } = {}) {
  if (window.innerWidth < 768) {
    initColoredCardAccordion(wrapper);
    return;
  }

  const items = Array.from(wrapper.querySelectorAll('.accordion-item'));
  if (!items.length) return;

  // 每個 item 隨機旋轉 ±2°（排除接近 0°）
  const rotations = items.map(() => {
    let r = 0;
    while (Math.abs(r) < 0.5) r = (Math.random() * 4 - 2);
    return parseFloat(r.toFixed(2));
  });

  // wrapper：相對定位容器
  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'visible';
  wrapper.style.height = `${height}px`;

  // 進場動畫模式：所有 item 初始收合，進場完成後才打開 index 0
  let openIndex = animateEntry ? -1 : 0;

  function getLabelWidth(item) {
    return item.querySelector('.accordion-label').offsetWidth;
  }

  function applyLayout(animate = false) {
    // 清掉所有 inline hover 色：使用者在 entrance 動畫期間 hover 留下的 inline bg 會卡在那（mouseleave 因 i===openIndex 不清），openIndex 改變後變成 active item 仍是 hover 色
    resetColors();

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
      // top right：展開時向左延伸，右上角保持固定
      item.style.transformOrigin = 'top right';
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
  }

  applyLayout(false);

  // 進場動畫：一半從正右方、一半從正下方（畫面外）飛入
  // 最右（index N-1）先進場 → 最左（index 0）最後進場
  // 全部就位後，打開 index 0（教學空間）
  if (animateEntry && typeof ScrollTrigger !== 'undefined') {
    // 平均分配：half fromRight + half fromBottom，再 Fisher-Yates 洗牌
    const directions = /** @type {Array<'right' | 'bottom'>} */ (items.map((_, i) => i < Math.ceil(items.length / 2) ? 'right' : 'bottom'));
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 記下每張卡片的進場方向 offset，離頁退場時飛回同方向（見下方 registerPageExit）
    const entryOffsets = [];
    items.forEach((item, i) => {
      // 起始位置必須在 viewport 外（以 vw/vh 為基準，random 微調距離）
      const offsetX = directions[i] === 'right' ? vw * 0.8 + Math.random() * 200 : 0;
      const offsetY = directions[i] === 'bottom' ? vh * 0.9 + Math.random() * 200 : 0;
      entryOffsets[i] = { x: offsetX, y: offsetY };
      gsap.set(item, { x: offsetX, y: offsetY });
    });

    // 離頁退場：所有卡片「一次過」飛回各自進場方向（不 stagger，與進場逐張相反）。
    // 只在 resources 區在視窗內才跑（看不到就略過）；卡片帶 rotate，gsap x/y 疊在 rotate 上不影響角度。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const r = wrapper.getBoundingClientRect();
      if (!(r.width > 0 && r.bottom > 0 && r.top < window.innerHeight)) { resolve(); return; }
      gsap.killTweensOf(items);
      let done = 0;
      const onOne = () => { if (++done >= items.length) resolve(); };
      items.forEach((item, i) => {
        const off = entryOffsets[i] || { x: 0, y: window.innerHeight };
        gsap.to(item, { x: off.x, y: off.y, duration: DUR.medium, ease: EASE.exit, overwrite: true, onComplete: onOne });
      });
    }));

    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({
          onComplete: () => {
            openIndex = 0;
            applyLayout(true);
          }
        });

        for (let i = items.length - 1; i >= 0; i--) {
          const orderIdx = items.length - 1 - i;
          tl.to(items[i], {
            x: 0,
            y: 0,
            duration: DUR.reveal,
            ease: EASE.enter
          }, orderIdx * 0.12);
        }
      }
    });
  }

  function resetColors() {
    items.forEach((it) => {
      const lb = it.querySelector('.accordion-label');
      const tw = it.querySelector('.accordion-text-wrap');
      // 清除 inline style，讓 CSS nth-child 規則接管
      if (lb) lb.style.background = '';
      if (tw) tw.style.background = '';
    });
  }

  items.forEach((item, i) => {
    const label = item.querySelector('.accordion-label');
    const textWrap = item.querySelector('.accordion-text-wrap');
    if (!label) return;

    item.addEventListener('mouseenter', () => {
      if (i === openIndex) return;
      label.style.background = 'var(--theme-fg)';
      if (textWrap) textWrap.style.background = 'var(--theme-fg)';
    });
    item.addEventListener('mouseleave', () => {
      if (i === openIndex) return;
      label.style.background = '';
      if (textWrap) textWrap.style.background = '';
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
      resetColors();
      openIndex = i;
      applyLayout(true);
    });
  });

  wrapper.updateLayout = () => applyLayout(false);
  accordionWrappers.push(wrapper);
}

// ── 手機卡片版（colored-accordion，about resources）──────────────
// 一張張旋轉卡片（±1~2°），預設全收合；點標題向下展開，再點收合（單開互斥）。
// user 2026-06-11：取代舊的「全寬色塊 + 永遠開一個」單列版。
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
      if (openItem === item) closeCard(item);
      else openCard(item);
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
