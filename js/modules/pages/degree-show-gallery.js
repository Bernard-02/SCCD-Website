/**
 * Degree Show Detail Gallery
 *
 * 沿用 about/class 的 .class-img 視覺與互動（位置/旋轉/clip-path 由 GSAP 控制），
 * 但容器是 .division-images 全寬橫跨頁面，使用 5 個 slot：slot 0 / 4 跨左右邊界，slot 1~3 在頁面內。
 *
 * 流程：
 *   - slot 0 右→左 clip-path 消失
 *   - slot 1~4 左移一格
 *   - 新圖在 slot 4 位置 clip-path reveal
 * 每 INTERVAL 自動 tick；hover：旋轉歸 0°（slot 0 不啟用）；click slot 1~4：手動觸發 tick。
 */

// 6 個 slot：spacing 17vw + 統一 wrapper 寬 400px（≈20.8vw），同時達成邊界溢出 + 保證每對 overlap：
// - 每對 overlap = 20.8 - 17 = 3.8vw（~19%）
// - Total span = 5 × 17 + 20.8 = 105.8vw → slot 0 / 5 各保留 ~3vw 對稱邊界溢出
// 5 slot 時數學塞不下（4 × spacing + image > 100 與 spacing < image 兩條件互斥），加到 6 slot 才同時成立。
const SLOT_LEFTS_VW = ['-3vw', '14vw', '31vw', '48vw', '65vw', '82vw'];
const SLOT_COUNT = SLOT_LEFTS_VW.length;
const ANIM_DUR = 0.5;
const ANIM_EASE = 'cubic-bezier(0.25, 0, 0, 1)';
const HOVER_DUR = 0.3;
const INTERVAL = 3500;

const HIDE_CLIP_LEAVE = 'inset(0% 100% 0% 0%)';
const HIDE_CLIPS = [
  'inset(0% 100% 0% 0%)',
  'inset(0% 0% 0% 100%)',
  'inset(100% 0% 0% 0%)',
  'inset(0% 0% 100% 0%)',
];
const SHOW_CLIP = 'inset(0% 0% 0% 0%)';

function randomHideClip() { return HIDE_CLIPS[Math.floor(Math.random() * HIDE_CLIPS.length)]; }
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

function buildImg(src) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'display:block; width:100%; height:auto;';
  wrapper.appendChild(img);

  const sizeWrapper = () => {
    if (!img.naturalWidth) return;
    const isLandscape = img.naturalWidth > img.naturalHeight;
    if (isLandscape) wrapper.classList.add('class-img--landscape');
    // 統一所有 wrapper 寬度為 400px（≈20.8vw on 1920），不分 landscape/portrait：
    // class about 用 panel-% 自動跟著縮放沒問題；degree-show 用 viewport-vw fixed slot，
    // 必須統一寬度才能保證每對 pair 都 overlap（否則 portrait pair 會比 spacing 短出現空隙）。
    // img 內部 width:100% height:auto 維持原始比例，差別只是 wrapper 框統一寬度。
    wrapper.style.width = '400px';
  };
  if (img.complete && img.naturalWidth) sizeWrapper();
  else img.addEventListener('load', sizeWrapper, { once: true });

  return wrapper;
}

function placeInSlot(img, slotIdx, extra = {}) {
  if (typeof gsap === 'undefined') return;
  gsap.set(img, {
    left: SLOT_LEFTS_VW[slotIdx],
    top: '50%',
    xPercent: 0,
    yPercent: -50,
    zIndex: SLOT_COUNT - slotIdx,
    ...extra,
  });
  if (extra.rotation !== undefined) img._rotation = extra.rotation;
}

export function initDegreeShowGallery(container, pool) {
  if (!container || !Array.isArray(pool) || pool.length === 0) return null;
  if (typeof gsap === 'undefined') {
    container.innerHTML = '';
    const img = buildImg(pool[0]);
    img.style.cssText += 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);';
    container.appendChild(img);
    return null;
  }

  let slots = [];
  let nextIdx = 0;
  let timer = null;
  let isShifting = false;

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
      s.style.cursor = i === 0 ? 'default' : 'pointer';
    });
  }

  // 點擊 slot 1~N-1：觸發一次 shift-left，整列往左移；slot 0 不動作
  // hover：旋轉歸 0°，leave 還原原始隨機角度；slot 0 不啟用
  function attachInteractions(wrapper) {
    wrapper.addEventListener('click', () => {
      if (isShifting) return;
      const idx = slots.indexOf(wrapper);
      if (idx <= 0) return;
      tick();
      if (timer) {
        clearInterval(timer);
        timer = setInterval(tick, INTERVAL);
      }
    });
    wrapper.addEventListener('mouseenter', () => {
      if (isShifting) return;
      if (slots.indexOf(wrapper) === 0) return;
      activateHover(wrapper);
    });
    wrapper.addEventListener('mouseleave', () => {
      clearHoverState(wrapper);
    });
  }

  // 初始 render SLOT_COUNT 張（pool 不足時循環取）
  container.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const src = pool[nextIdx % pool.length];
    nextIdx++;
    const img = buildImg(src);
    container.appendChild(img);
    placeInSlot(img, i, { rotation: randomRotation(), clipPath: SHOW_CLIP });
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
    gsap.to(leaving, {
      clipPath: HIDE_CLIP_LEAVE,
      duration: ANIM_DUR,
      ease: ANIM_EASE,
      onComplete: () => leaving.remove(),
    });

    // slot 1..N-1 → 各自往左一格
    for (let i = 1; i < SLOT_COUNT; i++) {
      gsap.to(slots[i], { left: SLOT_LEFTS_VW[i - 1], duration: ANIM_DUR, ease: ANIM_EASE });
    }

    const newImg = buildImg(pool[nextIdx % pool.length]);
    nextIdx++;
    container.appendChild(newImg);
    placeInSlot(newImg, SLOT_COUNT - 1, { rotation: randomRotation() });
    gsap.fromTo(newImg,
      { clipPath: randomHideClip() },
      { clipPath: SHOW_CLIP, duration: ANIM_DUR, ease: ANIM_EASE,
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
    destroy() { if (timer) clearInterval(timer); }
  };
}
