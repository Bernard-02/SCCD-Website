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

// 4 個 slot（桌面，user 2026-08-18「調整到 4 張、更大一些」）：slot-left 用 vw、寬度改「等面積 vw」（見 buildImg）。
// ⭐等面積(equal-area)取代舊 uniform-px-width：每張圖面積≈GALLERY_TARGET_AREA vw²、保留原始長寬比 → 直式變窄、
//   橫式變寬，但視覺份量接近（user「直橫比例不要差太多、維持平衡」），且不裁圖（維持「看檔案本身寬高」）。
// ⭐右緣 bleed：寬度改 vw 後整條 strip 隨 viewport 縮放，slot3(74vw)+橫式寬(~42vw)=116vw 於任何寬度都溢出右緣
//   （修舊 fixed-px 在 >1586px 才留右側空白的 bug）。窄直式(clamp 24vw)最壞 74+24=98vw≈貼齊右緣。
// overlap：橫式 42vw vs spacing ~25.7vw → 疊 ~16vw；直式較窄時疊量變小、極窄直式串可能留小縫（collage 可接受）。
const SLOT_LEFTS_DESKTOP = ['-3vw', '23vw', '49vw', '74vw'];
// 每張圖目標面積（vw²）：橫式 16:9 → √(920·1.78)=40.5vw 寬、直式 3:4 → √(920·0.75)=26.3vw 寬、1:1→30.3vw。
const GALLERY_TARGET_AREA = 920;
// 手機（<768）：3-slot/42vw 幾何（2026-07-09 起手機改走 class-images-slideshow 單圖輪播、
// 不再進本模組，此組值僅防禦性保留給 init 時的 isMobile 分支）
const SLOT_LEFTS_MOBILE = ['-3vw', '29vw', '61vw'];
const IMG_WIDTH_DESKTOP = '460px';
const IMG_WIDTH_MOBILE = '42vw';
const ANIM_DUR = 0.5;
const ANIM_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
const HOVER_DUR = 0.3;
const INTERVAL = 3500;

// clip-reveal 滑動藏定位（±110 過衝防 dpr hairline）：首次進場、tick 逐張離場/進場、hideAll 頁面退場全隨機 4 向
const SLIDE_DIRS = [
  { xPercent: -110, yPercent: 0 },
  { xPercent: 110, yPercent: 0 },
  { xPercent: 0, yPercent: -110 },
  { xPercent: 0, yPercent: 110 },
];
function randomSlide() { return SLIDE_DIRS[Math.floor(Math.random() * SLIDE_DIRS.length)]; }
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

// targetAreaVw 有值（桌面）→ 等面積：wrapper 寬 = √(area·aspect) vw、clamp[24,46]、height:auto 維持原始比例。
// targetAreaVw 空（手機防禦分支）→ 沿用固定 imgWidth。maxWidth 一律解除 .class-img 的 about cap(336/462)。
function buildImg(src, imgWidth, targetAreaVw) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';
  // wrapper＝滑動遮罩（本模組限定 inline，不動共用 .class-img class——about 的 slideshow 仍走 clip-path）
  wrapper.style.overflow = 'clip';
  // ⚠️maxWidth 解 about cap；width 先給 placeholder 避免載入前塌陷（等面積要等 natW/H 才定案，但寬度算好前先撐住）。
  wrapper.style.maxWidth = 'none';
  wrapper.style.width = targetAreaVw ? '38vw' : imgWidth;
  if (!targetAreaVw) wrapper.style.maxWidth = imgWidth;

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'display:block; width:100%; height:auto;';
  wrapper.appendChild(img);

  // 拿到 natW/H 後：加 landscape 語意 class + 定案等面積寬度（橫式較寬、直式較窄、面積接近＝視覺平衡、不裁圖）
  const onMeta = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    if (img.naturalWidth > img.naturalHeight) wrapper.classList.add('class-img--landscape');
    if (targetAreaVw) {
      const ar = img.naturalWidth / img.naturalHeight;
      const wVw = Math.min(46, Math.max(24, Math.sqrt(targetAreaVw * ar)));
      wrapper.style.width = wVw.toFixed(2) + 'vw';
    }
  };
  if (img.naturalWidth) onMeta();
  else {
    // 大圖(CORS)：naturalWidth(長寬比) 在 headers 解析後就有、早於 'load' 完整下載 → rAF 輪詢盡早定案等面積寬度，
    // 免長時間停在 38vw placeholder 到載完才跳。done guard 讓 poll / load 誰先到都只跑一次；cap ~10s 防破圖無限輪詢。
    let done = false, tries = 0;
    const run = () => { if (!done) { done = true; onMeta(); } };
    img.addEventListener('load', run, { once: true });
    const poll = () => { if (done) return; if (img.naturalWidth) run(); else if (++tries < 600) requestAnimationFrame(poll); };
    requestAnimationFrame(poll);
  }

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
  const TARGET_AREA = isMobile ? 0 : GALLERY_TARGET_AREA;   // 桌面走等面積、手機防禦分支維持固定寬
  const SLOT_COUNT = SLOT_LEFTS_VW.length;

  if (typeof gsap === 'undefined') {
    container.innerHTML = '';
    const img = buildImg(pool[0], IMG_WIDTH, TARGET_AREA);
    img.style.cssText += 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);';
    container.appendChild(img);
    return null;
  }

  let slots = [];
  let nextIdx = 0;
  let timer = null;
  let isShifting = false;
  let destroyed = false;
  let st = null;   // 首次進場 ScrollTrigger

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
    const img = buildImg(src, IMG_WIDTH, TARGET_AREA);
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

    const newImg = buildImg(pool[nextIdx % pool.length], IMG_WIDTH, TARGET_AREA);
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

  // 首次進場（user 2026-08-19）：初始 SLOT_COUNT 張各自隨機 4 向滑出遮罩藏好，gallery 首次捲進視窗才 stagger 滑入；
  // 進場後才起跑自動輪播（避免 off-screen 空轉、也讓「第一次看到」有進場動畫）。ScrollTrigger 缺席／已在視窗內 → 直接播。
  const inners = slots.map(s => s.firstElementChild);
  const revealDirs = inners.map(() => randomSlide());
  inners.forEach((el, i) => gsap.set(el, revealDirs[i]));
  let revealed = false;
  function revealInitial() {
    if (revealed || destroyed) return;
    revealed = true;
    inners.forEach((el, i) => gsap.fromTo(el, revealDirs[i],
      { xPercent: 0, yPercent: 0, duration: ANIM_DUR, ease: ANIM_EASE, delay: i * 0.08 }));
    // pool 至少 SLOT_COUNT+1 張才輪播；否則靜態（避免 tick 重複同一張）
    if (pool.length > SLOT_COUNT) timer = setInterval(tick, INTERVAL);
  }
  const alreadyInView = container.getBoundingClientRect().top < window.innerHeight * 0.9;
  if (typeof ScrollTrigger === 'undefined' || alreadyInView) {
    revealInitial();
  } else {
    st = ScrollTrigger.create({ trigger: container, start: 'top 90%', once: true, onEnter: revealInitial });
  }

  return {
    destroy() { destroyed = true; if (timer) clearInterval(timer); if (st) st.kill(); },
    // 離頁退場：停輪播 + 每張 slot 的 img 各自隨機 4 向滑出遮罩（user 2026-08-19：不再全張齊掃左滑）
    hideAll() {
      destroyed = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (typeof gsap === 'undefined' || slots.length === 0) return Promise.resolve();
      return new Promise(resolve => {
        let n = slots.length;
        slots.forEach(s => gsap.to(s.firstElementChild, {
          ...randomSlide(),
          duration: ANIM_DUR,
          ease: ANIM_EASE,
          overwrite: 'auto',
          onComplete: () => { if (--n <= 0) resolve(); },
        }));
      });
    },
  };
}
