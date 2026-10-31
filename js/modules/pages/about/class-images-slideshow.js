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
import { ensureCardMask, fitCardToText, revealHidden } from '../../ui/scroll-animate.js';
import { whenImgReady } from '../../ui/img-ready.js';
import { loadAboutClasses } from './about-source.js';
import { EASE } from '../../ui/motion.js';

// slot 間距：slot 0 起始貼左、slot 1/2 各往右平移 ~28%（從 32% 縮小）
// 避免 slot 2 + landscape 圖寬度溢出 .division-images 容器右緣（container ~720px 在 1920w，slot2 64% + 462 = ~923 溢出 200px）
const SLOT_LEFTS = ['0%', '24%', '48%'];
const ANIM_DUR   = 0.5;
const INTERVAL   = 3000;
const HOVER_DUR  = 0.3;
// 手機疊放：每張從上一張底下露出自己寬的比例（調疊多疊少改這個）。原直 0.5／橫 0.75，user 2026-10-29「橫圖太靠近」→
// 2026-10-30「直圖也太靠近、再放寬」＝兩種都 0.75；about／DSD 共用
const PEEK_RATIO = 0.75;
// 手機容器高 cap 綁住時直／橫圖會被壓成等高＝排起來單調（user 2026-10-30）→ 橫圖高上限只給直圖的 8 成，
// 直圖照樣比橫圖高（同桌面寬 cap 下直 336×448／橫 520×390 的比例感）；about／DSD 共用，桌面不吃
const LANDSCAPE_H_RATIO = 0.8;

// clip-path 常數只剩「textHlReveal=false 的 text 卡」在用（外部場景）；圖片滑動藏定位共用下方
// revealHidden（scroll-animate.js，±110 過衝防 dpr hairline），離場固定 'left'＝跟整列左移同向。
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
const REVEAL_SHOWN = { xPercent: 0, yPercent: 0 };
function randomRotation() { return parseFloat(((Math.random() * 2 - 1) * 4).toFixed(2)); }

// wrapper 寬度在 img 載入後依 natural 尺寸（capped at max-width）明確設定，
// 避免 wrapper width:auto + img max-width:100% 的循環依賴造成尺寸不對
// fixedWidth（可選）：統一 wrapper 寬（degree-show 全寬 slot 幾何用，pair overlap 要靠統一寬度保證）
function buildImg(src, fixedWidth, onSized) {
  const wrapper = document.createElement('div');
  wrapper.className = 'class-img';
  // wrapper＝滑動遮罩（inline 不動共用 .class-img class；桌面 timeline 照片另有自己的 clip 路線不受影響）
  wrapper.style.overflow = 'clip';

  const img = document.createElement('img');
  img.decoding = 'async';
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
    let maxW = isLandscape ? 520 : 336; // 直立 336；橫向放大 462→520（user 2026-09-11「橫式圖放大一點」）
    // about 手機（<768、class 面板）：圖高不得超出容器（圖/文對半分後容器高隨 svh 縮，user 2026-09-15
    // 「圖片不能被切」）——寬另受「容器高 × 圖比例」cap ＝ 等比縮小到剛好塞進半屏、不裁切不溢出。
    // CSS 的 170/250 max-width 仍生效（此處只會更小不會更大）。
    const panel = wrapper.closest ? wrapper.closest('.class-info-panel') : null;
    // ≥1200 桌面同理：圖容器＝上下同錨框內剩餘高（scroll-snap.css，2026-09-29），扁螢幕圖等比縮、不戳出 98 線
    const phone = window.innerWidth < 768;
    const capByBox = phone || window.matchMedia('(min-width: 1024px) and (min-height: 501px)').matches;
    if (panel && capByBox) {
      const box = wrapper.parentElement;
      // --class-img-fill（CSS，預設 1）：只用容器高的幾成＝圖上下留白（DSD 直向 0.9：直圖別貼上方 92 線／說明 box，user 2026-10-29→30）
      const fill = box ? parseFloat(getComputedStyle(box).getPropertyValue('--class-img-fill')) || 1 : 1;
      const availH = box ? box.clientHeight * fill * (phone && isLandscape ? LANDSCAPE_H_RATIO : 1) : 0;
      // 含 ±4° 隨機旋轉的 bbox 高：W·sinθ + (W/ratio)·cosθ ≤ availH → 解 W（純用圖比例會差 ~9px 旋角外溢）
      if (availH > 0) {
        const SIN4 = Math.sin(4 * Math.PI / 180), COS4 = Math.cos(4 * Math.PI / 180);
        maxW = Math.min(maxW, Math.floor(availH / (SIN4 + COS4 * img.naturalHeight / img.naturalWidth)));
      }
    }
    wrapper.style.width = Math.min(img.naturalWidth, maxW) + 'px';
    if (onSized) onSized();
  };
  // 快取圖延到 microtask 才量：呼叫端 appendChild 在 buildImg 回傳之後，同步量＝wrapper 還是 detached、
  // closest('.class-info-panel') 找不到＝不吃容器高 cap → tick 換進來的（池子循環／瀏覽器快取）比首批大一號（user 2026-10-29 DSD 直向）
  if (img.complete && img.naturalWidth) queueMicrotask(sizeWrapper);
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
  // 依「位置」自訂 z-index（非預設 slotCount-idx 左高右低）：dshow 手機主圖置中要中間 slot 最高、左右 peek 低
  //（user 2026-09-11）。長度須 = slotCount，否則忽略（about 不傳＝維持原行為）。
  const slotZ = (Array.isArray(opts.slotZ) && opts.slotZ.length === slotLefts.length) ? opts.slotZ : null;
  // tick 離場方向：預設 'left'（與整列左移同向）；dshow-detail 子展覽傳 true → 隨機 4 向
  const leaveRandom = !!opts.leaveRandom;
  // hover 轉正 0°、離開換新角（user 2026-10-19）；hoverAll（about class 圖）＝含 slot 0 都轉正，
  // 預設 slot 0 不轉（degree-show 維持）
  const hoverAll = !!opts.hoverAll;
  // peekNav（about 直向手機，user 2026-10-27→29）：中心張置中、左右依實寬疊放往外接（同桌面步距；中心圖窄就多露幾張）；
  // 點任一張非中心圖＝整列移到那張置中，中心張不可點。觸控不綁 hover（tap 會發 mouseenter 卻等不到 leave＝自動輪播永遠暫停）
  const peekNav = !!opts.peekNav;
  const center = Math.floor(slotCount / 2);
  // alignTop（user 2026-09-15，about 桌面用）：圖頂對齊容器頂＝說明 box 頂（grid items-start 同列同頂）；
  // 預設維持 top:70% + yPercent:-50 垂直置中（degree-show / timeline 等共用者不變）
  const slotPos = opts.alignTop ? { top: 0, yPercent: 0 } : {};
  // adaptiveSlots（about 桌面，user 2026-09-28）：左高右低疊放下，直式接在橫式後會被前一張整片蓋住（520 寬蓋過 336）
  // → 每張再往右補「前一張比自己寬的差」，每張露出寬恆＝固定步距（24% 容器寬）；其他組合（直直/橫橫/直→橫）位置不變。
  // 寬度要等 img 載入（sizeWrapper）才知道 → 載入後重排；tick 推移也照同規則算新位置。
  const adaptive = !!opts.adaptiveSlots;
  const stepRatio = parseFloat(SLOT_LEFTS[1]) / 100;

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

  // adaptive 位置（px）：寬度未知（還沒載入）的那張不補差
  function adaptiveLefts(list) {
    const step = container.clientWidth * stepRatio;
    const w = (el) => parseFloat(el.style.width) || 0;
    let x = 0;
    return list.map((el, i) => {
      if (i > 0) {
        const pw = w(list[i - 1]), cw = w(el);
        x += step + (pw && cw ? Math.max(0, pw - cw) : 0);
      }
      return `${x.toFixed(1)}px`;
    });
  }
  // peekNav 位置（px；slotXPercent -50＝left 即中心點）：同桌面疊放（user 2026-10-29「跟 pc 一樣疊在一起」），
  // 中心張最上、往外一張壓一張，每張從上一張外緣再露出「自己寬 × PEEK_RATIO」；左側鏡像。
  // 不用桌面的固定步距：橫圖 250 只露 82 太滿（user 10-29），按自寬比例＝直圖露 ~85、橫圖 ~125。
  // 讀 offsetWidth 不讀 style.width：手機 CSS max-width 170/250 會再壓 JS 定的寬
  function stripLefts(list) {
    const w = list.map(el => el.offsetWidth);
    const xs = [];
    xs[center] = container.clientWidth / 2;
    for (let i = center + 1; i < list.length; i++) xs[i] = xs[i - 1] + w[i - 1] / 2 + (PEEK_RATIO - 0.5) * w[i];
    for (let i = center - 1; i >= 0; i--) xs[i] = xs[i + 1] - w[i + 1] / 2 - (PEEK_RATIO - 0.5) * w[i];
    return xs.map(x => `${x.toFixed(1)}px`);
  }
  const layoutLefts = peekNav ? stripLefts : adaptive ? adaptiveLefts : null;
  // 載入定寬 / resize 後重排；推移中不插手（tick 自己算好推移終點、新圖揭露前另定位）
  function relayout() {
    // 面板 display:none（switchTo 在切顯示前就 renderFresh）＝寬 0 量不準 → 跳過，顯示後 switchTo 再叫一次
    if (!layoutLefts || isShifting || slots.length !== slotCount || !container.clientWidth) return;
    const lefts = layoutLefts(slots);
    slots.forEach((s, i) => gsap.set(s, { left: lefts[i] }));
  }
  if (layoutLefts) {
    window.addEventListener('resize', relayout);
    registerPageCleanup(() => window.removeEventListener('resize', relayout));
  }

  // reroll（滑鼠離開）：轉正過的那張換新角（user 2026-10-19）；tick 移位前的清除只還原、不換
  function clearHoverState(wrapper, reroll = false) {
    if (wrapper._rotation === undefined) return;
    if (reroll && wrapper._straight) wrapper._rotation = SCCDHelpers.rerollAngle(randomRotation, wrapper._rotation);
    wrapper._straight = false;
    gsap.to(wrapper, { rotation: wrapper._rotation, duration: HOVER_DUR, overwrite: 'auto' });
  }

  function activateHover(wrapper) {
    wrapper._straight = true;
    gsap.to(wrapper, { rotation: 0, duration: HOVER_DUR, overwrite: 'auto' });
  }

  // shift 完成後呼叫：若游標仍停在某 slot 上，立刻啟用 hover；
  // 不需要使用者移開再進入才觸發。
  function reapplyHoverIfPointerInside() {
    slots.forEach((s, i) => {
      if (i === 0 && !hoverAll) return; // 預設：slot 0 不 hover
      if (s.matches(':hover')) activateHover(s);
    });
  }

  // 全部 slot 一律 pointer：click 是「含 slot 0」都觸發 shift（見 attachInteractions），
  // 舊版 slot 0 = default 是「第一張不可點」時代的殘留（user 2026-09-12 指正）
  function updateCursors() {
    slots.forEach((s, i) => {
      s.style.cursor = peekNav && i === center ? '' : 'var(--cursor-pointer)';
    });
  }

  // 自動輪播 hover pause/resume（2026-08-17 對齊 degree-show gallery）：hover 任一張暫停、
  // 離開後（無任何 slot 被 hover）恢復；running gate 避免 resume 誤啟動已 stop 的實例。
  function pauseAutoplay() { if (timer) { clearInterval(timer); timer = null; } }
  function resumeAutoplay() {
    if (!running || timer || pool.length <= 1) return;
    timer = setInterval(() => tick(), INTERVAL);
  }

  // 點擊任一張（含 slot 0）：觸發一次 shift-left，整列往左移（2026-08-17 對齊 degree-show gallery）。
  // hover：暫停自動輪播 + 旋轉歸 0°（預設 slot 0 不做旋轉但仍暫停；hoverAll 含 slot 0）；leave 換新角、無 slot 被 hover 才恢復。
  function attachInteractions(wrapper) {
    wrapper.addEventListener('click', () => {
      if (isShifting) return;
      if (peekNav) {
        const i = slots.indexOf(wrapper);
        if (i < 0 || i === center) return;
        tick(i - center);
      } else tick();
      // 重置自動輪播計時，給用戶完整 INTERVAL 看新狀態（hover 暫停中 timer=null 則不動，離開後 resume 才起跑）
      if (timer) {
        clearInterval(timer);
        timer = setInterval(() => tick(), INTERVAL);
      }
    });
    if (peekNav) return;

    wrapper.addEventListener('mouseenter', () => {
      pauseAutoplay();
      if (isShifting) return;
      if (!hoverAll && slots.indexOf(wrapper) === 0) return; // 預設 slot 0（第 1 張）不做旋轉 hover
      activateHover(wrapper);
    });
    wrapper.addEventListener('mouseleave', () => {
      clearHoverState(wrapper, true);
      if (!slots.some(s => s.matches(':hover'))) resumeAutoplay();
    });
  }

  function renderFresh(startHidden) {
    container.innerHTML = '';
    slots = [];
    for (let i = 0; i < slotCount; i++) {
      const src = pool[nextIdx % pool.length];
      const img = buildImg(src, imgWidth, relayout);
      img._poolIdx = nextIdx % pool.length;   // tick 前後都從兩端那張的池位置往外取（往回退也接得上）
      nextIdx++;
      container.appendChild(img);
      placeInSlot(img, i, slotLefts, {
        rotation: randomRotation(),
        xPercent: slotXPercent,
        ...slotPos,
        ...(slotZ ? { zIndex: slotZ[i] } : {}),
      });
      // 圖片藏定位＝img 在 wrapper 遮罩內滑出畫面外（隨機 4 向）
      gsap.set(img.firstElementChild, startHidden ? revealHidden() : REVEAL_SHOWN);
      slots.push(img);
      if (!manual) attachInteractions(img);
    }
    relayout();   // 圖定寬（含快取圖的 microtask）各自再叫 onSized → relayout；這裡先把未定寬的排一次
    if (!manual) updateCursors();
    // Text highlight 初始態：textHlReveal 走 clip-reveal（整塊色卡純位移，藏於貼身遮罩外/現），否則跟 imgs 一起 clip-path
    if (textHlReveal && textHlEl) {
      gsap.set(textHlEl, startHidden ? revealHidden() : REVEAL_SHOWN);
    } else if (textHlEl && !textHlReveal) {
      gsap.set(textHlEl, { clipPath: startHidden ? randomHideClip() : SHOW_CLIP });
    }
  }

  // dir 1＝整列左移（預設，自動輪播）；-1＝整列右移（peekNav 點左邊那張：最右離場、左端補前一張）；
  // |dir|>1＝一次移多張（peekNav 點離中心 n 張的圖）
  function tick(dir = 1) {
    if (slots.length !== slotCount) return;
    if (isShifting) return;
    isShifting = true;
    const back = dir < 0;
    const n = Math.min(Math.abs(dir), slotCount);

    // 移動前清掉所有 slot 的 hover 狀態（旋轉還原）
    slots.forEach(s => clearHoverState(s));   // 別直接傳 clearHoverState：forEach 的 index 會被當成 reroll

    // 1. leaving img 滑出遮罩：預設順著整列移動方向；leaveRandom（dshow-detail）改隨機 4 向
    (back ? slots.slice(slotCount - n) : slots.slice(0, n)).forEach(leaving => gsap.to(leaving.firstElementChild, {
      ...(leaveRandom ? revealHidden() : revealHidden(back ? 'right' : 'left')),
      duration: ANIM_DUR,
      ease: EASE.wipe,
      onComplete: () => leaving.remove(),
    }));

    // 4. 新圖（先建：adaptive 推移終點要看新排列）；從端點那張的池位置往外接
    const len = pool.length;
    const edge = back ? slots[0]._poolIdx : slots[slotCount - 1]._poolIdx;
    const newImgs = [];
    for (let j = 1; j <= n; j++) {
      const idx = ((edge + (back ? -j : j)) % len + len) % len;
      const el = buildImg(pool[idx], imgWidth, relayout);
      el._poolIdx = idx;
      newImgs.push(el);
    }
    if (back) newImgs.reverse();
    const rest = back ? slots.slice(0, slotCount - n) : slots.slice(n);
    const order = back ? [...newImgs, ...rest] : [...rest, ...newImgs];
    const shifted = layoutLefts ? layoutLefts(order) : null;

    // 2/3. 其餘 slot 各移 n 格（保留各自旋轉）
    rest.forEach((s) => {
      const to = order.indexOf(s);
      gsap.to(s, { left: shifted ? shifted[to] : slotLefts[to], duration: ANIM_DUR, ease: EASE.wipe });
    });

    // 新圖在空出的端點 slot 隨機 4 向滑入（與上面同時進行）
    newImgs.forEach(el => {
      const i = order.indexOf(el);
      container.appendChild(el);
      placeInSlot(el, i, slotLefts, { rotation: randomRotation(), xPercent: slotXPercent, ...slotPos, ...(slotZ ? { zIndex: slotZ[i] } : {}), ...(shifted ? { left: shifted[i] } : {}) });
      gsap.set(el.firstElementChild, revealHidden());
      if (!manual) attachInteractions(el);
    });
    // 新圖先藏定位、等 decode 完才滑入（同進場 gate）；壞/慢圖 3s 保險放行（whenImgReady）
    const inners = newImgs.map(el => el.firstElementChild);
    Promise.all(inners.map(im => whenImgReady(im))).then(() => {
      // 依寬排：寬度此時才定 → 揭露前（仍藏在遮罩外）補到正確位置
      if (layoutLefts) {
        const lefts = layoutLefts(slots);
        newImgs.forEach(el => gsap.set(el, { left: lefts[slots.indexOf(el)] }));
      }
      gsap.to(inners, { ...REVEAL_SHOWN, duration: ANIM_DUR, ease: EASE.wipe,
        onComplete: () => { isShifting = false; if (!manual) reapplyHoverIfPointerInside(); } });
    });

    slots = order;
    slots.forEach((img, i) => gsap.set(img, { zIndex: slotZ ? slotZ[i] : slotCount - i }));
    if (!manual) updateCursors();
  }

  function start() {
    running = true;
    if (timer) return;
    if (pool.length <= 1) return; // 單張圖免輪播（單 slot 下 tick 會原地閃同一張）
    timer = setInterval(() => tick(), INTERVAL);
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
      // 圖片：img 在 wrapper 遮罩內滑動。hide=每張獨立隨機 4 向、show=歸位。
      // show 先 gate 到 decode 完才滑入（whenImgReady），避免還沒載完就滑進空框、圖再閃出（user 2026-09-11）。
      // peekNav 等全部到齊才一起揭：外圈位置吃內圈寬，先揭的會被晚到的內圈推一下
      const allReady = peekNav && mode === 'show' ? Promise.all(imgWrappers.map(el => whenImgReady(el.firstElementChild))) : null;
      imgWrappers.forEach(el => {
        const inner = el.firstElementChild;
        const run = () => gsap.to(inner, { ...(mode === 'hide' ? revealHidden() : REVEAL_SHOWN), duration: ANIM_DUR, ease: EASE.wipe, overwrite: 'auto', onComplete: onOne });
        if (mode === 'show') (allReady || whenImgReady(inner)).then(run); else run();
      });
      if (clipText) gsap.to(clipText, { clipPath: mode === 'hide' ? randomHideClip() : SHOW_CLIP, duration: ANIM_DUR, ease: EASE.wipe, onComplete: onOne });
      // reveal text 卡：clip-reveal 隨機 4 向（整塊色卡在貼身遮罩內純位移，無 clip-path）
      if (revealText) {
        if (mode === 'show') fitTextCard(); // 揭露前貼合寬度（隱藏態量寬 OK，translate 不影響寬）
        const to = mode === 'hide' ? revealHidden() : REVEAL_SHOWN;
        gsap.to(textHlEl, { ...to, duration: ANIM_DUR, ease: EASE.wipe, overwrite: 'auto', onComplete: onOne });
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

  return { renderFresh, start, stop, hideAll, showAll, reset, tick, fitText: fitTextCard, relayout };
}

// ── Module 全域：多個 division container 協調切換 ─────────────────────────────

const slideshowsByDivision = new Map();
let currentDivision = null;
let switching = false;
let pendingDivision = null; // 切換動畫進行中的「最新請求」：快速連點 A→B 時 B 記在這、A 切完補跑（防 btn active=B 但內容=A）
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
  if (switching) { pendingDivision = newDivision; return; }  // 進行中：記最新請求，當前切完再補（latest-wins）
  if (currentDivision === newDivision) return;
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
    if (newApi) newApi.relayout();   // 顯示後才量得到容器寬（adaptiveSlots 位置）

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
  // 切換期間有更新請求（快速連點）→ 補切到最新，確保內容＝最後點的 active btn（其內部再判 ===current 則 no-op）
  if (pendingDivision !== null) {
    const next = pendingDivision;
    pendingDivision = null;
    await switchTo(next, animate);
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
  pendingDivision = null;
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
    // 圖片池：每學制自己的 about_class.images（Directus 唯一來源；某學制沒上圖＝該組不輪播，user 2026-10-04 拿掉本地佔位圖）
    const classes = await loadAboutClasses().catch(() => []);
    const imagesByDivision = {};
    (classes || []).forEach(c => { if (c.divisionKey && c.images?.length) imagesByDivision[c.divisionKey] = c.images; });
    const poolFor = (division) => imagesByDivision[division] || [];
    if (!Object.keys(imagesByDivision).length) return;

    // 直向手機＝主圖置中、左右依實寬疊放接下去（user 2026-10-27→29：同桌面疊法、窄圖就多露幾張；7 張＝中心＋各 3 張，蓋到 767 寬），
    // 自動往左輪播、點哪張整列移到那張置中（peekNav）。
    // 矮橫向（landscape gate）維持單圖置中（user 2026-07-07 wireframe：圖左文右單圖輪播）；桌面 3-slot 左移輪播。
    const isMobileSlots = SCCDHelpers.isMobileLayout();
    const isPeekSlots = isMobileSlots && !SCCDHelpers.isLandscapeGate();
    // about program 文字說明卡（[data-class-hl]）走 clip-reveal、圖片維持 clip-path（user 2026-08-10）
    const slotOpts = isPeekSlots
      ? { slotLefts: Array(7).fill('50%'), slotXPercent: -50, slotZ: [1, 2, 3, 4, 3, 2, 1], peekNav: true, textHlReveal: true }
      : isMobileSlots
      ? { slotLefts: ['50%'], slotXPercent: -50, textHlReveal: true }
      : { textHlReveal: true, hoverAll: true, alignTop: true, adaptiveSlots: true };   // 桌面 hover 轉正含 slot 0（10-19）＋圖頂對齊說明 box 頂（09-15）＋直式接橫式往右補（09-28）；手機置中不帶
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.division-images')).forEach(container => {
      const division = container.dataset.division;
      if (!division) return;
      // 每組獨立洗牌，每次進頁重洗（user 2026-09-11「program 圖片每次都 shuffle、三組不要同序」）；先 copy 免就地打亂來源
      const pool = SCCDHelpers.shuffle([...poolFor(division)]);
      if (!pool.length) return;
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
