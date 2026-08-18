/**
 * About Page - Class Section 圖片輪播
 *
 * 每個 .division-images container 初始 render 3 張 .class-img 到 slot 1/2/3；
 * （2026-08-17 圖片由 clip-path 改 clip-reveal：.class-img wrapper＝遮罩 overflow:clip＋承載旋轉，img 在內滑動）
 * 每 INTERVAL 秒 tick 一次：
 *   - slot 1 的 img 往左滑出遮罩（與整列左移同向）
 *   - slot 2 的 img 平移到 slot 1 位置（保留自己的旋轉）
 *   - slot 3 的 img 平移到 slot 2 位置（保留自己的旋轉）
 *   - pool 下一張從 slot 3 位置以隨機 4 方向滑入
 *
 * 切換 division 時流程：
 *   1. 舊 panel 的 3 張圖各自隨機 4 向滑出遮罩（text 卡同步 clip-reveal 滑出）
 *   2. 切 panel display（hidden toggle）
 *   3. 新 panel 的 3 張重新 render 並隨機 4 向滑入
 *   4. 新 panel 開始 loop
 */

import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { sitePath } from '../../ui/site-base.js';
import { ensureCardMask, fitCardToText } from '../../ui/scroll-animate.js';

// slot 間距：slot 0 起始貼左、slot 1/2 各往右平移 ~28%（從 32% 縮小）
// 避免 slot 2 + landscape 圖寬度溢出 .division-images 容器右緣（container ~720px 在 1920w，slot2 64% + 462 = ~923 溢出 200px）
const SLOT_LEFTS = ['0%', '24%', '48%'];
const ANIM_DUR   = 0.5;
const ANIM_EASE  = 'cubic-bezier(0.25, 0, 0, 1)';
const INTERVAL   = 3000;
const HOVER_DUR  = 0.3;

// clip-path 常數只剩「textHlReveal=false 的 text 卡」在用（外部場景）；圖片滑動藏定位共用下方
// revealHiddenT / randRevealDir（±110 過衝防 dpr hairline），離場固定 'left'＝跟整列左移同向。
// 四值單位必須一致（全部 %），否則 GSAP 無法 tween clip-path
const HIDE_CLIPS = [
  'inset(0% 100% 0% 0%)',
  'inset(0% 0% 0% 100%)',
  'inset(100% 0% 0% 0%)',
  'inset(0% 0% 100% 0%)',
];
const SHOW_CLIP = 'inset(0% 0% 0% 0%)';

function randomHideClip() { return HIDE_CLIPS[Math.floor(Math.random() * HIDE_CLIPS.length)]; }

// text 卡 clip-reveal＝貼身靜止遮罩（ensureCardMask wrapper）內、整塊色卡 [data-class-hl]（含底色）純位移隨機 4 向
//（user 定義的 clip-reveal＝遮罩內平移升起，不帶 clip-path 擦除、不整塊飛入；色矩形必須跟文字一起動，不能留在原地）
const REVEAL_DIRS4 = ['top', 'bottom', 'left', 'right'];
const REVEAL_SHOWN = { xPercent: 0, yPercent: 0 };
function revealHiddenT(dir) {
  switch (dir) {
    case 'top':    return { xPercent: 0, yPercent: -110 };
    case 'bottom': return { xPercent: 0, yPercent: 110 };
    case 'left':   return { xPercent: -110, yPercent: 0 };
    default:       return { xPercent: 110, yPercent: 0 }; // right
  }
}
function randRevealDir() { return REVEAL_DIRS4[Math.floor(Math.random() * REVEAL_DIRS4.length)]; }
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

// wrapper 寬度在 img 載入後依 natural 尺寸（capped at max-width）明確設定，
// 避免 wrapper width:auto + img max-width:100% 的循環依賴造成尺寸不對
// fixedWidth（可選）：統一 wrapper 寬（degree-show 全寬 slot 幾何用，pair overlap 要靠統一寬度保證）
function buildImg(src, fixedWidth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';
  // wrapper＝滑動遮罩（inline 不動共用 .class-img class；桌面 timeline 照片另有自己的 clip 路線不受影響）
  wrapper.style.overflow = 'clip';

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'display:block; width:100%; height:auto;';

  wrapper.appendChild(img);

  // 載入後依 natural 尺寸決定 wrapper 寬度（不會放大、不會超出 max-width）
  const sizeWrapper = () => {
    if (!img.naturalWidth) return;
    const isLandscape = img.naturalWidth > img.naturalHeight;
    if (isLandscape) wrapper.classList.add('class-img--landscape');
    if (fixedWidth) { wrapper.style.width = fixedWidth; return; }
    const maxW = isLandscape ? 462 : 336; // 直立 320→336、橫向 440→462（+5%）
    wrapper.style.width = Math.min(img.naturalWidth, maxW) + 'px';
  };
  if (img.complete && img.naturalWidth) sizeWrapper();
  else img.addEventListener('load', sizeWrapper, { once: true });

  return wrapper;
}

function placeInSlot(img, slotIdx, slotLefts, extra = {}) {
  gsap.set(img, {
    left: slotLefts[slotIdx],
    top: '70%',
    xPercent: 0,
    yPercent: -50,
    zIndex: slotLefts.length - slotIdx,
    ...extra,
  });
  // 記錄原始旋轉，hover/leave 時用來還原
  if (extra.rotation !== undefined) img._rotation = extra.rotation;
}

// ── 每個 container 的 slideshow 實例 ─────────────────────────────────────────

// 也 export 給 degree-show-detail sub-event row 重用（同樣 slideshow 行為，但無 about 全域 state machine）
// opts.textHlEl：要跟 imgs 同步 clip-path 的 text highlight 元素；不傳則自動從 closest('.class-info-panel') 找
// opts.slotLefts / opts.imgWidth：自訂 slot 幾何 + 統一圖寬（degree-show 手機全寬 slideshow 用）；
// 不傳則維持 about 預設（3 slot % 定位 + natural 尺寸 capped）
// opts.manual：不綁內建 img 點擊/hover（呼叫端用回傳的 tick() 自行驅動；about history 手機箭頭切年用）
// opts.leaveRandom：tick 逐張離場改隨機 4 向（dshow-detail 子展覽用）；預設 false = 'left'（與整列左移同向，about/timeline 維持）
export function createClassImagesSlideshow(container, pool, opts = {}) {
  if (!container || typeof gsap === 'undefined') return null;

  const slotLefts = (Array.isArray(opts.slotLefts) && opts.slotLefts.length > 0) ? opts.slotLefts : SLOT_LEFTS;
  const slotCount = slotLefts.length;
  const imgWidth = opts.imgWidth || null;
  const manual = !!opts.manual;
  // textHlReveal：text highlight 卡走 hero clip-reveal（yPercent 遮罩滑動），圖片仍 clip-path
  //（about program 文字說明用）；false=text 跟圖片一起 clip-path（degree-show-detail 維持原樣）。
  const textHlReveal = !!opts.textHlReveal;
  // 單格置中用（timeline 手機單圖輪播：slotLefts ['50%'] + xPercent -50）；預設 0 = 原行為
  const slotXPercent = opts.slotXPercent ?? 0;
  // tick 離場方向：預設 'left'（與整列左移同向）；dshow-detail 子展覽傳 true → 隨機 4 向
  const leaveRandom = !!opts.leaveRandom;

  // 同一個 panel 內的 text highlight 區塊（含底色），和 imgs 一起做 clip-path
  // about 場景自動從 .class-info-panel 找 [data-class-hl]；degree-show 場景可顯式傳入 textHlEl
  const textHlEl = opts.textHlEl !== undefined
    ? opts.textHlEl
    : (container.closest('.class-info-panel')?.querySelector('[data-class-hl]') || null);

  // textHlReveal：包貼身遮罩 wrapper（fit-content overflow:clip），整塊色卡 [data-class-hl]（含底色）
  // 在遮罩內純位移滑動（隨機 4 向）＝乾淨 clip-reveal（無 clip-path 擦除、色矩形跟著動）
  if (textHlReveal && textHlEl) ensureCardMask(textHlEl);

  let slots = [];
  let nextIdx = 0;
  let timer = null;
  let isShifting = false; // 移動中：禁用 hover、避免重複觸發
  let running = false;    // start()/stop() 的意圖狀態；hover 暫停不改它 → 未 reveal / 切 panel 停用中不被 resume 誤啟動

  function clearHoverState(wrapper) {
    if (wrapper._rotation === undefined) return;
    gsap.to(wrapper, { rotation: wrapper._rotation, duration: HOVER_DUR, overwrite: 'auto' });
  }

  function activateHover(wrapper) {
    gsap.to(wrapper, { rotation: 0, duration: HOVER_DUR, overwrite: 'auto' });
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
      s.style.cursor = i === 0
        ? `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`
        : `url('${sitePath('custom-cursor/pointer.svg')}') 9 1, pointer`;
    });
  }

  // 自動輪播 hover pause/resume（2026-08-17 對齊 degree-show gallery）：hover 任一張暫停、
  // 離開後（無任何 slot 被 hover）恢復；running gate 避免 resume 誤啟動已 stop 的實例。
  function pauseAutoplay() { if (timer) { clearInterval(timer); timer = null; } }
  function resumeAutoplay() {
    if (!running || timer || pool.length <= 1) return;
    timer = setInterval(tick, INTERVAL);
  }

  // 點擊任一張（含 slot 0）：觸發一次 shift-left，整列往左移（2026-08-17 對齊 degree-show gallery）。
  // hover：暫停自動輪播 + 旋轉歸 0°（slot 0 不做旋轉但仍暫停）；leave 還原角度、無 slot 被 hover 才恢復。
  function attachInteractions(wrapper) {
    wrapper.addEventListener('click', () => {
      if (isShifting) return;
      tick();
      // 重置自動輪播計時，給用戶完整 INTERVAL 看新狀態（hover 暫停中 timer=null 則不動，離開後 resume 才起跑）
      if (timer) {
        clearInterval(timer);
        timer = setInterval(tick, INTERVAL);
      }
    });

    wrapper.addEventListener('mouseenter', () => {
      pauseAutoplay();
      if (isShifting) return;
      if (slots.indexOf(wrapper) === 0) return; // slot 0（第 1 張）不做旋轉 hover
      activateHover(wrapper);
    });
    wrapper.addEventListener('mouseleave', () => {
      clearHoverState(wrapper);
      if (!slots.some(s => s.matches(':hover'))) resumeAutoplay();
    });
  }

  function renderFresh(startHidden) {
    container.innerHTML = '';
    slots = [];
    for (let i = 0; i < slotCount; i++) {
      const src = pool[nextIdx % pool.length];
      nextIdx++;
      const img = buildImg(src, imgWidth);
      container.appendChild(img);
      placeInSlot(img, i, slotLefts, {
        rotation: randomRotation(),
        xPercent: slotXPercent,
      });
      // 圖片藏定位＝img 在 wrapper 遮罩內滑出畫面外（隨機 4 向）
      gsap.set(img.firstElementChild, startHidden ? revealHiddenT(randRevealDir()) : REVEAL_SHOWN);
      slots.push(img);
      if (!manual) attachInteractions(img);
    }
    if (!manual) updateCursors();
    // Text highlight 初始態：textHlReveal 走 clip-reveal（整塊色卡純位移，藏於貼身遮罩外/現），否則跟 imgs 一起 clip-path
    if (textHlReveal && textHlEl) {
      gsap.set(textHlEl, startHidden ? revealHiddenT(randRevealDir()) : REVEAL_SHOWN);
    } else if (textHlEl && !textHlReveal) {
      gsap.set(textHlEl, { clipPath: startHidden ? randomHideClip() : SHOW_CLIP });
    }
  }

  function tick() {
    if (slots.length !== slotCount) return;
    if (isShifting) return;
    isShifting = true;

    // 移動前清掉所有 slot 的 hover 狀態（旋轉還原）
    slots.forEach(clearHoverState);

    const leaving = slots[0];

    // 1. leaving img 滑出遮罩：預設 'left'（與整列左移同向）；leaveRandom（dshow-detail）改隨機 4 向
    gsap.to(leaving.firstElementChild, {
      ...revealHiddenT(leaveRandom ? randRevealDir() : 'left'),
      duration: ANIM_DUR,
      ease: ANIM_EASE,
      onComplete: () => leaving.remove(),
    });

    // 2/3. 其餘 slot 各往左移一格（保留各自旋轉）
    for (let i = 1; i < slotCount; i++) {
      gsap.to(slots[i], { left: slotLefts[i - 1], duration: ANIM_DUR, ease: ANIM_EASE });
    }

    // 4. 新圖在最後一個 slot 隨機 4 向滑入（與上面同時進行）
    const nextSrc = pool[nextIdx % pool.length];
    nextIdx++;
    const newImg = buildImg(nextSrc, imgWidth);
    container.appendChild(newImg);
    placeInSlot(newImg, slotCount - 1, slotLefts, { rotation: randomRotation(), xPercent: slotXPercent });
    gsap.fromTo(newImg.firstElementChild,
      revealHiddenT(randRevealDir()),
      { ...REVEAL_SHOWN, duration: ANIM_DUR, ease: ANIM_EASE,
        onComplete: () => {
          isShifting = false;
          if (!manual) reapplyHoverIfPointerInside();
        }
      }
    );
    if (!manual) attachInteractions(newImg);

    slots.shift();
    slots.push(newImg);
    slots.forEach((img, i) => gsap.set(img, { zIndex: slotCount - i }));
    if (!manual) updateCursors();
  }

  function start() {
    running = true;
    if (timer) return;
    if (pool.length <= 1) return; // 單張圖免輪播（單 slot 下 tick 會原地閃同一張）
    timer = setInterval(tick, INTERVAL);
  }
  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  // reveal 前把 text 卡寬度貼合最寬一行文字（見 fitCardToText）。必須在顯示動畫「之前」叫，
  // 否則揭露後才縮會看到寬度跳一下；textHlReveal 場景（about program 說明卡）才有此卡。
  function fitTextCard() {
    if (textHlReveal && textHlEl) fitCardToText(textHlEl);
  }

  // mode 'hide'：圖片各自「隨機 4 向」滑出遮罩 + text 卡「隨機 4 向」hero clip-reveal 滑出；'show'：都回顯示態。
  //（user 2026-08-10：切 tab 時圖片收合方向 random 4 向、文字也 random 4 向 clip-reveal）
  function animateGroup(mode) {
    return new Promise(resolve => {
      const imgWrappers = [...slots];
      const clipText = (textHlEl && !textHlReveal) ? textHlEl : null;  // 非 reveal（外部場景）：text 維持 clip-path
      const revealText = textHlReveal && !!textHlEl;
      const total = imgWrappers.length + (clipText ? 1 : 0) + (revealText ? 1 : 0);
      if (total === 0) { resolve(); return; }
      let done = 0;
      const onOne = () => { if (++done >= total) resolve(); };
      // 圖片：img 在 wrapper 遮罩內滑動。hide=每張獨立隨機 4 向、show=歸位
      imgWrappers.forEach(el => gsap.to(el.firstElementChild, { ...(mode === 'hide' ? revealHiddenT(randRevealDir()) : REVEAL_SHOWN), duration: ANIM_DUR, ease: ANIM_EASE, overwrite: 'auto', onComplete: onOne }));
      if (clipText) gsap.to(clipText, { clipPath: mode === 'hide' ? randomHideClip() : SHOW_CLIP, duration: ANIM_DUR, ease: ANIM_EASE, onComplete: onOne });
      // reveal text 卡：clip-reveal 隨機 4 向（整塊色卡在貼身遮罩內純位移，無 clip-path）
      if (revealText) {
        if (mode === 'show') fitTextCard(); // 揭露前貼合寬度（隱藏態量寬 OK，translate 不影響寬）
        const to = mode === 'hide' ? revealHiddenT(randRevealDir()) : REVEAL_SHOWN;
        gsap.to(textHlEl, { ...to, duration: ANIM_DUR, ease: ANIM_EASE, overwrite: 'auto', onComplete: onOne });
      }
    });
  }
  function hideAll() { return animateGroup('hide'); }
  function showAll() { return animateGroup('show'); }

  async function reset() {
    stop();
    renderFresh(true);
    await showAll();
    start();
  }

  return { renderFresh, start, stop, hideAll, showAll, reset, tick, fitText: fitTextCard };
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
  await api.showAll();  // showAll → animateGroup('show') 內部已 fitText（初次揭露也貼合寬度）
  api.start();
}

async function switchTo(newDivision, animate = true) {
  if (switching || currentDivision === newDivision) return;
  switching = true;
  try {
    const allPanels = document.querySelectorAll('.class-info-panel');
    const oldApi = currentDivision ? slideshowsByDivision.get(currentDivision) : null;
    const newApi = slideshowsByDivision.get(newDivision);

    // 1. 舊 panel 的 imgs（滑出遮罩）+ text（clip-reveal 滑出）一起消失
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

    // 4. 新 panel 的 imgs + text 一起 reveal 滑入，然後啟動 loop
    if (newApi) {
      if (animate) {
        await newApi.showAll();          // showAll → animateGroup('show') 內部已 fitText
      } else {
        newApi.fitText();                // instant 切換無 showAll → 顯示前自己貼合寬度
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
  // clear() 前先 stop() 舊 api，否則丟掉參考後它們的 setInterval 仍在跑（同頁重 init 殘留）
  slideshowsByDivision.forEach(api => api.stop());
  slideshowsByDivision.clear();
  currentDivision = null;
  switching = false;
  revealed = false;

  // 離頁退場：active panel 的 imgs + text highlight 一起 clip-path 收掉（= 進場 reveal 的反向，沿用 hideAll）。
  // 同步註冊（讀 module-level live state），即使 fetch 還沒回來也已掛上；未 reveal（沒捲到 class）則略過。
  registerPageExit(() => {
    const api = currentDivision ? slideshowsByDivision.get(currentDivision) : null;
    if (!api || !revealed || typeof gsap === 'undefined') return Promise.resolve();
    api.stop();
    return api.hideAll();
  });

  try {
    const res = await fetch(sitePath('data/about-class-images.json'));
    const pool = await res.json();
    if (!Array.isArray(pool) || pool.length === 0) return;

    // 手機＝單圖置中自動輪播（user 2026-07-07；同 timeline 手機單格 pattern）：單 slot 下 tick =
    // 舊圖 clip-out + 新圖隨機 4 向 clip-in 同格交疊，內建 INTERVAL timer 直接驅動反覆切換。
    // 桌面維持 3-slot 左移輪播。矮橫向（landscape gate）同走單圖（user 2026-07-07 wireframe：圖左文右單圖輪播）。
    const isMobileSlots = window.innerWidth < 768
      || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    // about program 文字說明卡（[data-class-hl]）走 clip-reveal、圖片維持 clip-path（user 2026-08-10）
    const slotOpts = isMobileSlots
      ? { slotLefts: ['50%'], slotXPercent: -50, textHlReveal: true }
      : { textHlReveal: true };
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.division-images')).forEach(container => {
      const division = container.dataset.division;
      if (!division) return;
      const api = createClassImagesSlideshow(container, pool, slotOpts);
      if (api) slideshowsByDivision.set(division, api);
    });

    // SPA 離開 about 時停掉所有 slideshow interval（避免對 detached DOM 跑 gsap、每訪累積）
    registerPageCleanup(() => slideshowsByDivision.forEach(api => api.stop()));

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

    // 手機版 reveal trigger：桌面的 reveal ScrollTrigger 在 class-buttons-sticky.js（手機直接 return），
    // 手機沒人觸發 revealActive → 圖文永遠停在 HIDE。這裡自建同 start 點的 trigger。
    if (window.innerWidth < 768 && activePanelEl && typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({
        trigger: activePanelEl,
        start: 'top 88%',
        onEnter: () => revealActive(),
      });
    }

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
