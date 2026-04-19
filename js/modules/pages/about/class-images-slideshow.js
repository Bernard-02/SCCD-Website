/**
 * About Page - Class Section 圖片輪播
 *
 * 每個 .division-images container 初始 render 3 張 .class-img 到 slot 1/2/3；
 * 每 INTERVAL 秒 tick 一次：
 *   - slot 1 的 img 右→左 clip-path 消失
 *   - slot 2 的 img 平移到 slot 1 位置（保留自己的旋轉）
 *   - slot 3 的 img 平移到 slot 2 位置（保留自己的旋轉）
 *   - pool 下一張從 slot 3 位置以隨機 4 方向 clip-path reveal
 *
 * 切換 division 時流程：
 *   1. 舊 panel 的 3 張同步 clip-path 消失（右→左）
 *   2. 切 panel display（hidden toggle）
 *   3. 新 panel 的 3 張重新 render 並 clip-path reveal
 *   4. 新 panel 開始 loop
 */

const SLOT_LEFTS = ['0%', '32%', '64%'];
const ANIM_DUR   = 0.5;
const ANIM_EASE  = 'cubic-bezier(0.25, 0, 0, 1)';
const INTERVAL   = 3000;
const HOVER_DUR  = 0.3;

// 四值單位必須一致（全部 %），否則 GSAP 無法 tween clip-path
const HIDE_CLIP_LEAVE = 'inset(0% 100% 0% 0%)'; // 右邊裁 100%（右→左消失）
const HIDE_CLIPS = [
  'inset(0% 100% 0% 0%)',
  'inset(0% 0% 0% 100%)',
  'inset(100% 0% 0% 0%)',
  'inset(0% 0% 100% 0%)',
];
const SHOW_CLIP = 'inset(0% 0% 0% 0%)';

// hover screen-blend 用的三原色（同 timeline edge dim）
const ACCENT_COLORS = (() => {
  if (typeof getComputedStyle !== 'function') return ['#00FF80', '#FF448A', '#26BCFF'];
  const s = getComputedStyle(document.documentElement);
  const fallbacks = ['#00FF80', '#FF448A', '#26BCFF'];
  return ['--color-green', '--color-pink', '--color-blue'].map((v, i) =>
    s.getPropertyValue(v).trim() || fallbacks[i]
  );
})();
function randomAccent() { return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]; }

function randomHideClip() { return HIDE_CLIPS[Math.floor(Math.random() * HIDE_CLIPS.length)]; }
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

// 回傳 wrapper div（套 .class-img class），內含 img + screen-blend overlay
// 包 wrapper 是為了 hover 時 overlay 能用 mix-blend-mode:screen 蓋在 img 上
// wrapper 寬度在 img 載入後依 natural 尺寸（capped at max-width）明確設定，
// 避免 wrapper width:auto + img max-width:100% 的循環依賴造成尺寸不對
function buildImg(src) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'display:block; width:100%; height:auto;';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute; inset:0; mix-blend-mode:screen; opacity:0; pointer-events:none;';

  wrapper.appendChild(img);
  wrapper.appendChild(overlay);
  wrapper._img = img;
  wrapper._overlay = overlay;

  // 載入後依 natural 尺寸決定 wrapper 寬度（不會放大、不會超出 max-width）
  const sizeWrapper = () => {
    if (!img.naturalWidth) return;
    const isLandscape = img.naturalWidth > img.naturalHeight;
    if (isLandscape) wrapper.classList.add('class-img--landscape');
    const maxW = isLandscape ? 462 : 336; // 直立 320→336、橫向 440→462（+5%）
    wrapper.style.width = Math.min(img.naturalWidth, maxW) + 'px';
  };
  if (img.complete && img.naturalWidth) sizeWrapper();
  else img.addEventListener('load', sizeWrapper, { once: true });

  return wrapper;
}

function placeInSlot(img, slotIdx, extra = {}) {
  gsap.set(img, {
    left: SLOT_LEFTS[slotIdx],
    top: '70%',
    xPercent: 0,
    yPercent: -50,
    zIndex: 3 - slotIdx,
    ...extra,
  });
}

// ── 每個 container 的 slideshow 實例 ─────────────────────────────────────────

function initContainer(container, pool) {
  if (!container || typeof gsap === 'undefined') return null;

  // 同一個 panel 內的 text highlight 區塊（含底色），和 imgs 一起做 clip-path
  const panelEl = container.closest('.class-info-panel');
  const textHlEl = panelEl?.querySelector('[data-class-hl]') || null;

  let slots = [];
  let nextIdx = 0;
  let timer = null;
  let isShifting = false; // 移動中：禁用 hover、避免重複觸發

  function clearHoverState(wrapper) {
    if (wrapper._img) {
      gsap.killTweensOf(wrapper._img);
      gsap.set(wrapper._img, { filter: 'grayscale(0%)' });
    }
    if (wrapper._overlay) {
      gsap.killTweensOf(wrapper._overlay);
      gsap.set(wrapper._overlay, { opacity: 0 });
    }
  }

  function activateHover(wrapper) {
    if (wrapper._img) gsap.to(wrapper._img, { filter: 'grayscale(100%)', duration: HOVER_DUR });
    if (wrapper._overlay) {
      wrapper._overlay.style.background = randomAccent();
      gsap.to(wrapper._overlay, { opacity: 1, duration: HOVER_DUR });
    }
  }

  // shift 完成後呼叫：若游標仍停在某 slot 上（slot 1 或 2），立刻啟用 hover；
  // 不需要使用者移開再進入才觸發。
  function reapplyHoverIfPointerInside() {
    slots.forEach((s, i) => {
      if (i === 0) return; // slot 0 不 hover
      if (s.matches(':hover')) activateHover(s);
    });
  }

  // 依目前 slot 位置更新 cursor：slot 0 = default（不可點），其餘 = pointer
  function updateCursors() {
    slots.forEach((s, i) => {
      s.style.cursor = i === 0 ? 'default' : 'pointer';
    });
  }

  // 點擊第 2 或第 3 張：觸發一次 shift-left（行為等同 tick），整列 slot 往左移一格。
  // 第 1 張（slot 0）不動作。移動期間 hover 失效。
  // hover：圖片 grayscale + 隨機三原色 screen blend overlay（仿 timeline edge dim）；slot 0 不啟用。
  // cursor 由 updateCursors() 依 slot 位置動態設定（slot 0 = default，其餘 = pointer）。
  function attachInteractions(wrapper) {
    wrapper.addEventListener('click', () => {
      if (isShifting) return;
      const idx = slots.indexOf(wrapper);
      if (idx <= 0) return; // slot 0 或已移除：不動作
      tick();
      // 重置自動輪播計時，給用戶完整 INTERVAL 看新狀態
      if (timer) {
        clearInterval(timer);
        timer = setInterval(tick, INTERVAL);
      }
    });

    wrapper.addEventListener('mouseenter', () => {
      if (isShifting) return;
      if (slots.indexOf(wrapper) === 0) return; // slot 0（第 1 張）不啟用 hover
      activateHover(wrapper);
    });
    wrapper.addEventListener('mouseleave', () => {
      clearHoverState(wrapper);
    });
  }

  function renderFresh(startHidden) {
    container.innerHTML = '';
    slots = [];
    for (let i = 0; i < 3; i++) {
      const src = pool[nextIdx % pool.length];
      nextIdx++;
      const img = buildImg(src);
      container.appendChild(img);
      placeInSlot(img, i, {
        rotation: randomRotation(),
        clipPath: startHidden ? randomHideClip() : SHOW_CLIP,
      });
      slots.push(img);
      attachInteractions(img);
    }
    updateCursors();
    // Text highlight 和 imgs 同步 clip-path 狀態
    if (textHlEl) {
      gsap.set(textHlEl, { clipPath: startHidden ? randomHideClip() : SHOW_CLIP });
    }
  }

  function tick() {
    if (slots.length !== 3) return;
    if (isShifting) return;
    isShifting = true;

    // 移動前清掉所有 slot 的 hover 狀態（避免移動中還停留 grayscale/overlay）
    slots.forEach(clearHoverState);

    const leaving = slots[0];

    // 1. slot 1 消失（右→左）
    gsap.to(leaving, {
      clipPath: HIDE_CLIP_LEAVE,
      duration: ANIM_DUR,
      ease: ANIM_EASE,
      onComplete: () => leaving.remove(),
    });

    // 2/3. slot 2 → slot 1；slot 3 → slot 2（保留各自旋轉）
    gsap.to(slots[1], { left: SLOT_LEFTS[0], duration: ANIM_DUR, ease: ANIM_EASE });
    gsap.to(slots[2], { left: SLOT_LEFTS[1], duration: ANIM_DUR, ease: ANIM_EASE });

    // 4. 新圖 reveal 在 slot 3（與上面同時進行）
    const nextSrc = pool[nextIdx % pool.length];
    nextIdx++;
    const newImg = buildImg(nextSrc);
    container.appendChild(newImg);
    placeInSlot(newImg, 2, { rotation: randomRotation() });
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
    slots.forEach((img, i) => gsap.set(img, { zIndex: 3 - i }));
    updateCursors();
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, INTERVAL);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function collectTargets() {
    const targets = [...slots];
    if (textHlEl) targets.push(textHlEl);
    return targets;
  }

  function hideAll() {
    return new Promise(resolve => {
      const targets = collectTargets();
      if (targets.length === 0) { resolve(); return; }
      let done = 0;
      const onOne = () => { done++; if (done >= targets.length) resolve(); };
      targets.forEach(el => {
        gsap.to(el, {
          clipPath: HIDE_CLIP_LEAVE,
          duration: ANIM_DUR,
          ease: ANIM_EASE,
          onComplete: onOne,
        });
      });
    });
  }

  function showAll() {
    return new Promise(resolve => {
      const targets = collectTargets();
      if (targets.length === 0) { resolve(); return; }
      let done = 0;
      const onOne = () => { done++; if (done >= targets.length) resolve(); };
      targets.forEach(el => {
        gsap.to(el, {
          clipPath: SHOW_CLIP,
          duration: ANIM_DUR,
          ease: ANIM_EASE,
          onComplete: onOne,
        });
      });
    });
  }

  async function reset() {
    stop();
    renderFresh(true);
    await showAll();
    start();
  }

  return { renderFresh, start, stop, hideAll, showAll, reset };
}

// ── Module 全域：多個 division container 協調切換 ─────────────────────────────

const slideshowsByDivision = new Map();
let currentDivision = null;
let switching = false;
let revealed = false; // 初次 scroll 進 class section 前保持 HIDE，ScrollTrigger 觸發才 reveal

async function revealActive() {
  if (revealed) return;
  const api = currentDivision ? slideshowsByDivision.get(currentDivision) : null;
  if (!api) return; // 尚未 ready 時不 mark revealed，讓後續觸發可以重試
  revealed = true;
  await api.showAll();
  api.start();
}

async function switchTo(newDivision, animate = true) {
  if (switching || currentDivision === newDivision) return;
  switching = true;
  try {
    const allPanels = document.querySelectorAll('.class-info-panel');
    const oldApi = currentDivision ? slideshowsByDivision.get(currentDivision) : null;
    const newApi = slideshowsByDivision.get(newDivision);

    // 1. 舊 panel 的 imgs + text 一起 clip-path 消失
    if (animate && oldApi) {
      await oldApi.hideAll();
      oldApi.stop();
    } else if (oldApi) {
      oldApi.stop();
    }

    // 2. 新 panel 切 display 前先進 HIDE 狀態（避免 flash 看到完整 text）
    if (newApi) {
      newApi.stop();
      newApi.renderFresh(animate);
    }

    // 3. 切 panel display
    allPanels.forEach(el => {
      el.classList.toggle('hidden', el.getAttribute('data-division') !== newDivision);
    });

    // 4. 新 panel 的 imgs + text 一起 clip-path reveal，然後啟動 loop
    if (newApi) {
      if (animate) {
        await newApi.showAll();
      }
      newApi.start();
    }

    currentDivision = newDivision;
    // revealed flag 由 revealActive 獨立管理，這裡不動
  } finally {
    switching = false;
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────

export async function initClassImagesSlideshow() {
  // SPA 重新進入 about 時重置 module-level state（避免殘留舊 api / revealed flag）
  slideshowsByDivision.clear();
  currentDivision = null;
  switching = false;
  revealed = false;

  try {
    const res = await fetch('/data/about-class-images.json');
    const pool = await res.json();
    if (!Array.isArray(pool) || pool.length === 0) return;

    document.querySelectorAll('.division-images').forEach(container => {
      const division = container.dataset.division;
      if (!division) return;
      const api = initContainer(container, pool);
      if (api) slideshowsByDivision.set(division, api);
    });

    // 暴露給 bfa-division-toggle.js 和 class-buttons-sticky.js 呼叫
    window.SCCD_classSlideshow = { switchTo, revealActive };

    // 初始：active panel 的 imgs + text highlight 都進 HIDE 狀態（等 ScrollTrigger 觸發 revealActive）
    const activePanelEl = document.querySelector('.class-info-panel:not(.hidden)');
    const activeDiv = activePanelEl?.getAttribute('data-division');
    if (activeDiv) {
      const api = slideshowsByDivision.get(activeDiv);
      if (api) api.renderFresh(true);
      currentDivision = activeDiv;
    }
    // 確保等待 reveal（避免中間 switchTo(animate=false) 意外修改 state）
    revealed = false;

    // 若 slideshow init 完成前，使用者已 scroll 進 class section，ScrollTrigger 可能已觸發過，
    // 這裡自補 reveal 避免永遠停在 HIDE 狀態
    if (activePanelEl) {
      const rect = activePanelEl.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.88) revealActive();
    }
  } catch (err) {
    console.error('Class images slideshow load error:', err);
  }
}
