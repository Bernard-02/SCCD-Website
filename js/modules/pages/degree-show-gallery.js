/**
 * Degree Show Detail Gallery
 *
 * 沿用 about/class 的 .class-img 視覺與互動（位置/旋轉/clip-path 由 GSAP 控制），
 * 但容器是 .division-images 全寬橫跨頁面，使用 5 個 slot：slot 0 / 4 跨左右邊界，slot 1~3 在頁面內。
 *
 * 流程（2026-08-16 由 clip-path 改 clip-reveal：wrapper=遮罩 overflow:clip＋承載旋轉，img 在內滑動）：
 *   - slot 0 圖片隨機 4 向滑出遮罩消失（tick 逐張離場；hideAll 頁面退場則全張同向左滑）
 *   - slot 1~4 左移一格
 *   - 新圖在 slot 4 位置隨機 4 向滑入
 * 每 INTERVAL 自動 tick；hover：旋轉歸 0°（slot 0 不啟用）；click slot 1~4：手動觸發 tick。
 */

import { sitePath } from '../ui/site-base.js';

// 6 個 slot（桌面）：spacing 17vw + 統一 wrapper 寬 400px（≈20.8vw），同時達成邊界溢出 + 保證每對 overlap：
// - 每對 overlap = 20.8 - 17 = 3.8vw（~19%）
// - Total span = 5 × 17 + 20.8 = 105.8vw → slot 0 / 5 各保留 ~3vw 對稱邊界溢出
// 5 slot 時數學塞不下（4 × spacing + image > 100 與 spacing < image 兩條件互斥），加到 6 slot 才同時成立。
const SLOT_LEFTS_DESKTOP = ['-3vw', '14vw', '31vw', '48vw', '65vw', '82vw'];
// 手機（<768）：3-slot/42vw 幾何（2026-07-09 起手機改走 class-images-slideshow 單圖輪播、
// 不再進本模組，此組值僅防禦性保留給 init 時的 isMobile 分支）
const SLOT_LEFTS_MOBILE = ['-3vw', '29vw', '61vw'];
const IMG_WIDTH_DESKTOP = '400px';
const IMG_WIDTH_MOBILE = '42vw';
const ANIM_DUR = 0.5;
const ANIM_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
const HOVER_DUR = 0.3;
const INTERVAL = 3500;

// clip-reveal 滑動藏定位（±110 過衝防 dpr hairline）：進場與 tick 逐張離場都隨機 4 向；
// hideAll 頁面退場另用 LEAVE_SLIDE 全張同向左滑（unison sweep，跟整列左移同向）
const SLIDE_DIRS = [
  { xPercent: -110, yPercent: 0 },
  { xPercent: 110, yPercent: 0 },
  { xPercent: 0, yPercent: -110 },
  { xPercent: 0, yPercent: 110 },
];
const LEAVE_SLIDE = SLIDE_DIRS[0]; // 頁面退場 unison 左滑
function randomSlide() { return SLIDE_DIRS[Math.floor(Math.random() * SLIDE_DIRS.length)]; }
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

function buildImg(src, imgWidth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';
  // wrapper＝滑動遮罩（本模組限定 inline，不動共用 .class-img class——about 的 slideshow 仍走 clip-path）
  wrapper.style.overflow = 'clip';

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'display:block; width:100%; height:auto;';
  wrapper.appendChild(img);

  const sizeWrapper = () => {
    if (!img.naturalWidth) return;
    const isLandscape = img.naturalWidth > img.naturalHeight;
    if (isLandscape) wrapper.classList.add('class-img--landscape');
    // 統一所有 wrapper 寬度（桌面 400px ≈ 20.8vw on 1920 / 手機 34vw），不分 landscape/portrait：
    // class about 用 panel-% 自動跟著縮放沒問題；degree-show 用 viewport-vw fixed slot，
    // 必須統一寬度才能保證每對 pair 都 overlap（否則 portrait pair 會比 spacing 短出現空隙）。
    // img 內部 width:100% height:auto 維持原始比例，差別只是 wrapper 框統一寬度。
    wrapper.style.width = imgWidth;
  };
  if (img.complete && img.naturalWidth) sizeWrapper();
  else img.addEventListener('load', sizeWrapper, { once: true });

  return wrapper;
}

function placeInSlot(img, slotIdx, slotLefts, extra = {}) {
  if (typeof gsap === 'undefined') return;
  gsap.set(img, {
    left: slotLefts[slotIdx],
    top: '50%',
    xPercent: 0,
    yPercent: -50,
    zIndex: slotLefts.length - slotIdx,
    ...extra,
  });
  if (extra.rotation !== undefined) img._rotation = extra.rotation;
}

export function initDegreeShowGallery(container, pool) {
  if (!container || !Array.isArray(pool) || pool.length === 0) return null;
  // about 用同 .division-images class min-height:440px 對窄欄夠用；
  // degree-show 跨全寬 + 統一 400px wrapper → portrait 高度可達 ~533px，旋轉後再 +30 → 需 ~650px
  // （手機容器高由 variables.css mobile 規則收成 280px 配 34vw 圖）
  container.classList.add('division-images--degree-show');

  // 幾何依 viewport 選（init 時定案，與全站 isMobile 慣例一致）
  const isMobile = window.innerWidth < 768;
  const SLOT_LEFTS_VW = isMobile ? SLOT_LEFTS_MOBILE : SLOT_LEFTS_DESKTOP;
  const IMG_WIDTH = isMobile ? IMG_WIDTH_MOBILE : IMG_WIDTH_DESKTOP;
  const SLOT_COUNT = SLOT_LEFTS_VW.length;

  if (typeof gsap === 'undefined') {
    container.innerHTML = '';
    const img = buildImg(pool[0], IMG_WIDTH);
    img.style.cssText += 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);';
    container.appendChild(img);
    return null;
  }

  let slots = [];
  let nextIdx = 0;
  let timer = null;
  let isShifting = false;
  let destroyed = false;

  // 自動輪播 pause/resume：hover 任一張時暫停、離開後（無任何 slot 被 hover）恢復。
  // pool 不足 SLOT_COUNT+1 張時本就不輪播（同 init 判斷），resume 也不啟動。
  function pauseAutoplay() { if (timer) { clearInterval(timer); timer = null; } }
  function resumeAutoplay() {
    if (destroyed || timer || pool.length <= SLOT_COUNT) return;
    timer = setInterval(tick, INTERVAL);
  }

  function clearHoverState(wrapper) {
    if (wrapper._rotation === undefined) return;
    gsap.to(wrapper, { rotation: wrapper._rotation, duration: HOVER_DUR, overwrite: 'auto' });
  }
  function activateHover(wrapper) {
    gsap.to(wrapper, { rotation: 0, duration: HOVER_DUR, overwrite: 'auto' });
  }
  function reapplyHoverIfPointerInside() {
    slots.forEach((s, i) => {
      if (i === 0) return;
      if (s.matches(':hover')) activateHover(s);
    });
  }
  function updateCursors() {
    slots.forEach((s, i) => {
      s.style.cursor = i === 0
        ? `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`
        : `url('${sitePath('custom-cursor/pointer.svg')}') 9 1, pointer`;
    });
  }

  // 點擊任一張（含 slot 0）：觸發一次 shift-left，整列往左移（user 2026-08-17「點任何一張都往左推、不限第幾張」）
  // hover：暫停自動輪播 + 旋轉歸 0°（slot 0 不做旋轉但仍暫停）；leave 還原角度、無 slot 被 hover 才恢復輪播
  function attachInteractions(wrapper) {
    wrapper.addEventListener('click', () => {
      if (isShifting) return;
      tick();
      // 手動 tick 後重置間隔避免緊接著自動 tick；hover-pause 期間 timer=null 則不動（離開後 resume 才起跑）
      if (timer) { clearInterval(timer); timer = setInterval(tick, INTERVAL); }
    });
    wrapper.addEventListener('mouseenter', () => {
      pauseAutoplay();
      if (isShifting) return;
      if (slots.indexOf(wrapper) === 0) return;
      activateHover(wrapper);
    });
    wrapper.addEventListener('mouseleave', () => {
      clearHoverState(wrapper);
      if (!slots.some(s => s.matches(':hover'))) resumeAutoplay();
    });
  }

  // 初始 render SLOT_COUNT 張（pool 不足時循環取）
  container.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const src = pool[nextIdx % pool.length];
    nextIdx++;
    const img = buildImg(src, IMG_WIDTH);
    container.appendChild(img);
    placeInSlot(img, i, SLOT_LEFTS_VW, { rotation: randomRotation() });
    slots.push(img);
    attachInteractions(img);
  }
  updateCursors();

  function tick() {
    if (slots.length !== SLOT_COUNT || isShifting) return;
    isShifting = true;

    // 移動前清掉所有 slot 的 hover 狀態（旋轉還原）
    slots.forEach(clearHoverState);

    const leaving = slots[0];
    gsap.to(leaving.firstElementChild, {
      ...randomSlide(),
      duration: ANIM_DUR,
      ease: ANIM_EASE,
      onComplete: () => leaving.remove(),
    });

    // slot 1..N-1 → 各自往左一格
    for (let i = 1; i < SLOT_COUNT; i++) {
      gsap.to(slots[i], { left: SLOT_LEFTS_VW[i - 1], duration: ANIM_DUR, ease: ANIM_EASE });
    }

    const newImg = buildImg(pool[nextIdx % pool.length], IMG_WIDTH);
    nextIdx++;
    container.appendChild(newImg);
    placeInSlot(newImg, SLOT_COUNT - 1, SLOT_LEFTS_VW, { rotation: randomRotation() });
    gsap.fromTo(newImg.firstElementChild,
      { ...randomSlide() },
      { xPercent: 0, yPercent: 0, duration: ANIM_DUR, ease: ANIM_EASE,
        onComplete: () => {
          isShifting = false;
          reapplyHoverIfPointerInside();
        }
      }
    );
    attachInteractions(newImg);

    slots.shift();
    slots.push(newImg);
    slots.forEach((img, i) => gsap.set(img, { zIndex: SLOT_COUNT - i }));
    updateCursors();
  }

  // pool 至少 SLOT_COUNT+1 張才需要輪播；否則靜態（避免 tick 重複同一張）
  if (pool.length > SLOT_COUNT) {
    timer = setInterval(tick, INTERVAL);
  }

  return {
    destroy() { destroyed = true; if (timer) clearInterval(timer); },
    // 離頁退場：停輪播 + 每張 slot 的 img 同步往左滑出遮罩（unison sweep；tick 逐張離場改隨機 4 向，此處刻意維持同向齊掃）
    hideAll() {
      destroyed = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (typeof gsap === 'undefined' || slots.length === 0) return Promise.resolve();
      return new Promise(resolve => {
        let n = slots.length;
        slots.forEach(s => gsap.to(s.firstElementChild, {
          ...LEAVE_SLIDE,
          duration: ANIM_DUR,
          ease: ANIM_EASE,
          overwrite: 'auto',
          onComplete: () => { if (--n <= 0) resolve(); },
        }));
      });
    },
  };
}
