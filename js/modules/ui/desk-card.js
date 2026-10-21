/**
 * 真桌面「固定色卡」詳情（library 灰卡同款，取代右側 slide-in；user 2026-10-20）：faculty／curriculum 共用。
 * 幾何（col-4～col-18、上下同距 logo 中線、內距 lg、返回鍵釘左下角）在 cards.css 真桌面段；這裡只管進退場：
 *   進場＝色卡四向 clip-reveal → 內容逐類（blocks）同拍同方向進 → 返回鍵；同次造訪同一項目再開＝只做色卡揭露（內容跟著揭）
 *   退場＝返回鍵先收、色卡帶著內容再收
 * 不 dim：overlay 透明留著（點卡外關卡）、html.overlay-no-dim（theme-toggle 不換白線框 logo／navigation.css mode・menu 鈕放行／
 * cursor.css 卡外一般游標）。手機／矮橫向不走這裡（caller 判 SCCDHelpers.isDesktopLayout()）。
 */
import { DUR, EASE } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';
import { randomRevealDir, revealHidden, navChipHidden, NAV_CHIP_SHOWN, randomCardTilt } from './scroll-animate.js';
import { registerPageCleanup } from './page-cleanup.js';

// 返回鍵 inner clip-reveal：每次開隨機四向滑入、退場沿原方向滑回。
// 隱藏量用 revealHidden 的 ±110：±100＝內層邊緣剛好貼遮罩邊，鈕會旋轉 → 抗鋸齒留一條 1px（user 2026-10-21）
// 類與類之間錯開（user 2026-10-20：一類同拍整批進、類內不逐列錯開）
const BLOCK = 0.25;

const nums = (s) => (String(s).match(/-?[\d.]+/g) || []).map(Number);
// ⚠️ 退場起點從 el.style 讀回＝瀏覽器正規化過的縮寫（inset(0% 0% 0% 0%)→inset(0%)、"0px 0px"→"0px"）：
//   照 4 值／2 值硬解＝clip 變單值四邊等縮（縮小）或起訖同值不動（閃一下消失）、translate NaN 被丟（不滑）。一律展開
const xy = (s) => { const n = nums(s); return [n[0] || 0, n[1] || 0]; };
const inset4 = (s) => {   // [上 右 下 左]
  const n = nums(s);
  return n.length === 1 ? [n[0], n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0], n[1]] : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n.slice(0, 4);
};
const vDir = () => (Math.random() < 0.5 ? 'top' : 'bottom');
const clearClip = (el) => { el.style.clipPath = ''; el.style.translate = ''; };
function hideNow(el, dir) {
  el._clipDir = dir;
  el.style.translate = '';
  el.style.clipPath = navChipHidden(el, dir).clipPath;
}
// 模擬版 clip-reveal（translate＋clip-path 同步，navChipHidden 算隱藏態、旋轉元素沿自身軸滑）。
// 數字 proxy 自組字串：GSAP 直接補 translate 字串偶發起點 ×10＝飛進來（reference_gsap_translate_fromto_misparse_flight）。
// 起訖在第一次 onUpdate 才量（不用 onStart：GSAP lazy init 偶爾讓 onUpdate 先跑）：照片常開卡後才載入撐高；
// 藏著時 clip 已 100%，translate 跳到隱藏向量看不見。退場從當下值起跑：已完全顯示才重抽方向，進場中途被關＝沿原方向倒回
function clipSlide(tl, el, show, vars, pos) {
  if (!show && !el.style.clipPath) el._clipDir = randomRevealDir();
  const proxy = { p: 0 };
  let ft, tt, fc, tc;
  const init = () => {
    const h = navChipHidden(el, el._clipDir);
    const cur = { translate: el.style.translate || NAV_CHIP_SHOWN.translate, clipPath: el.style.clipPath || NAV_CHIP_SHOWN.clipPath };
    const [a, b] = show ? [h, NAV_CHIP_SHOWN] : [cur, h];
    ft = xy(a.translate); tt = xy(b.translate); fc = inset4(a.clipPath); tc = inset4(b.clipPath);
  };
  tl.to(proxy, {
    p: 1, ...vars,
    onUpdate: () => {
      if (!ft) init();
      const p = proxy.p;
      el.style.translate = `${(ft[0] + (tt[0] - ft[0]) * p).toFixed(2)}px ${(ft[1] + (tt[1] - ft[1]) * p).toFixed(2)}px`;
      el.style.clipPath = `inset(${fc.map((n, i) => (n + (tc[i] - n) * p).toFixed(3) + '%').join(' ')})`;
    },
  }, pos);
}

/**
 * caller 每次進頁建一個（enteredIds 隨之歸零＝換頁回來又會完整進場）。
 * @param {object} o
 * @param {HTMLElement} o.panel 色卡本體
 * @param {HTMLElement|null} o.backBtn 黑方塊返回鍵外層（.slide-in-back-square；arrow-spin 寫它的 transform）
 * @param {() => (Element|null)[][]} o.getBlocks 內容分批的類（依進場順序；每類同拍同方向）
 * @param {(el: Element) => boolean} [o.isFourWay] 四向進場的片（照片）；其餘文字只上下——左右位移會撐出捲動框 x 軸 scrollbar
 */
export function createDeskCard({ panel, backBtn, getBlocks, isFourWay = () => false }) {
  let tl = null;   // proxy tween 不在 DOM 上 → killTweensOf 殺不到，自留 ref 顯式 kill
  let backDir = 'bottom';
  const enteredIds = new Set();   // 本次造訪已完整進場過的項目
  const backInner = () => backBtn && /** @type {HTMLElement|null} */ (backBtn.querySelector('.slide-in-back-square-inner'));
  const kill = () => { if (tl) { tl.kill(); tl = null; } ro?.disconnect(); ro = null; };
  // 卡外連點只吃第一下（user 2026-10-21）：收卡後同一串連點（e.detail ≥ 2）穿到底下的卡片會又開一張、再被關＝像卡住
  // → 捕獲階段吞掉；下一次單擊（detail 1）才恢復
  let swallowBurst = false;
  const onClickCapture = (e) => {
    if (!swallowBurst) return;
    if (e.detail > 1) { e.stopPropagation(); e.preventDefault(); } else swallowBurst = false;
  };
  document.addEventListener('click', onClickCapture, true);
  registerPageCleanup(() => document.removeEventListener('click', onClickCapture, true));
  /** @type {ResizeObserver|null} */
  let ro = null;
  // 返回鍵中心＝色卡轉後的左下角：top 釘未旋轉的卡底（卡垂直置中、高隨內容）；translate 補旋轉位移
  // （offsetWidth/Height＝未旋轉尺寸）；寫 translate、不碰 arrow-spin 的 transform
  function placeBack(deg) {
    if (!backBtn) return;
    backBtn.style.top = `${panel.offsetTop + panel.offsetHeight - backBtn.offsetHeight / 2}px`;
    const t = deg * Math.PI / 180, hw = panel.offsetWidth / 2, hh = panel.offsetHeight / 2;
    backBtn.style.translate = `${(-hw * (Math.cos(t) - 1) - hh * Math.sin(t)).toFixed(2)}px ${(-hw * Math.sin(t) + hh * (Math.cos(t) - 1)).toFixed(2)}px`;
  }

  // 捲動框自製 thumb（cards.css 真桌面段藏原生）：原生 scrollbar 不能位移＝做不了 clip-reveal 進場（user 2026-10-21）。
  // 外層 .desk-scroll-thumb＝遮罩、跟捲動位置走；內層＝色條、做 clip-reveal。首次開卡才建（手機不走 open）
  const scroller = /** @type {HTMLElement|null} */ (panel.querySelector('.list-scroll'));
  /** @type {HTMLElement|null} */ let thumb = null;
  /** @type {HTMLElement|null} */ let thumbInner = null;
  let thumbH = 0;
  function placeThumb() {
    if (!thumb || !scroller) return;
    const ch = scroller.clientHeight, sh = scroller.scrollHeight;
    thumb.style.display = sh > ch + 1 ? '' : 'none';
    if (sh <= ch + 1) return;
    thumbH = Math.max(40, ch * ch / sh);
    let x = 0, y = 0;   // 捲動框在卡內的位置（offset 系＝未旋轉座標）
    for (let el = /** @type {HTMLElement|null} */ (scroller); el && el !== panel; el = /** @type {HTMLElement|null} */ (el.offsetParent)) { x += el.offsetLeft; y += el.offsetTop; }
    thumb.style.left = `${x + scroller.offsetWidth - thumb.offsetWidth}px`;
    thumb.style.top = `${y + scroller.scrollTop / (sh - ch) * (ch - thumbH)}px`;
    thumb.style.height = `${thumbH}px`;
  }
  function ensureThumb() {
    if (thumb || !scroller) return;
    thumb = document.createElement('div');
    thumb.className = 'desk-scroll-thumb';
    thumbInner = document.createElement('div');
    thumbInner.className = 'desk-scroll-thumb-inner';
    thumb.append(thumbInner);
    panel.append(thumb);
    scroller.addEventListener('scroll', placeThumb, { passive: true });
    // 拖拉＝原生 thumb 行為：位移換算成捲動量
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      thumb.setPointerCapture(e.pointerId);
      const y0 = e.clientY, s0 = scroller.scrollTop;
      const move = (ev) => {
        scroller.scrollTop = s0 + (ev.clientY - y0) * (scroller.scrollHeight - scroller.clientHeight) / (scroller.clientHeight - thumbH);
      };
      const up = () => ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => thumb.removeEventListener(t, i ? up : move));
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
      thumb.addEventListener('pointercancel', up);
    });
  }

  /** @param {{ id?: string, onOpened?: () => void }} [opts] */
  function open({ id, onOpened } = {}) {
    kill();
    SCCDHelpers.releaseHover(backBtn);   // 收到一半又開：上次退場凍的 hover 色放掉
    document.documentElement.classList.add('has-slide-in', 'overlay-no-dim');
    clearClip(panel);   // 上次退場留下的位移先清再量
    // 色卡微傾 ±0.5–1.5°、每次開重抽（user 2026-10-20）；文字跟卡平行不另轉。clip-reveal 從 transform 讀角度、沿傾斜軸滑
    const deg = randomCardTilt();
    panel.style.transform = `rotate(${deg}deg)`;
    placeBack(deg);
    ensureThumb();
    if (scroller) scroller.scrollTop = 0;   // caller 也會歸零；先歸零才量得到 thumb 頂位
    placeThumb();
    // 卡高＝內容高（cards.css）：照片／字型晚到、視窗高變＝卡底跟著動 → 返回鍵重釘；內文高變 → thumb 重算
    if (!ro && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { placeBack(deg); placeThumb(); });
      ro.observe(panel);
      if (panel.parentElement) ro.observe(panel.parentElement);
      if (scroller) [...scroller.children].forEach(c => ro.observe(c));
    }
    const blocks = getBlocks().map(b => /** @type {HTMLElement[]} */ (b.filter(Boolean))).filter(b => b.length);
    blocks.flat().forEach(clearClip);   // 進場中途被關留下的殘值
    const animate = typeof gsap !== 'undefined' && !prefersReducedMotion();
    const bi = backInner();
    backDir = randomRevealDir();   // 也是這次退場方向
    if (bi && typeof gsap !== 'undefined') gsap.set(bi, animate ? revealHidden(backDir) : { xPercent: 0, yPercent: 0 });
    // 內容逐類分批只在這次造訪「該項目」第一次開卡跑，之後內容已在卡裡、跟著色卡一起揭（user 2026-10-20）；
    // scrollbar 同理：再開＝跟著色卡揭、不另進場（user 2026-10-21）
    const firstOpen = !enteredIds.has(id);
    // thumb 不論現在要不要顯示都先藏好：內文晚到才需要捲時，它也是跟著這次的 tween 進來
    if (thumbInner && typeof gsap !== 'undefined') gsap.set(thumbInner, animate && firstOpen ? revealHidden() : { xPercent: 0, yPercent: 0 });
    if (!animate) { onOpened?.(); return; }

    const seq = firstOpen ? blocks : [];
    enteredIds.add(id);
    // 同 tick（paint 前）藏好：caller 剛拿掉 invisible。同一類的文字共用一個上下方向（整批像一塊進來）
    hideNow(panel, randomRevealDir());
    seq.forEach(b => { const v = vDir(); b.forEach(el => hideNow(el, isFourWay(el) ? randomRevealDir() : v)); });
    const enter = { duration: DUR.medium, ease: EASE.enter };
    const all = [panel, ...seq.flat()];
    // 完成才清 clip：留著 inset(0%…) 旋轉元素邊緣會失去抗鋸齒
    tl = gsap.timeline({ onComplete: () => {
      all.forEach(clearClip);
      tl = null;
      onOpened?.();
    } });
    clipSlide(tl, panel, true, enter, 0);
    let at = DUR.medium;   // 色卡揭完才進內容（非首開 seq 空＝返回鍵緊接色卡）
    seq.forEach(b => { b.forEach(el => clipSlide(tl, el, true, enter, at)); at += BLOCK; });
    // 返回鍵與 scrollbar 同拍最後進（scrollbar 等內容進完才現，user 2026-10-20）
    if (bi) tl.fromTo(bi, revealHidden(backDir), { xPercent: 0, yPercent: 0, ...enter, clearProps: 'transform' }, at);
    if (thumbInner && firstOpen) tl.to(thumbInner, { xPercent: 0, yPercent: 0, ...enter }, at);
  }

  /** @param {() => void} [onDone] 收完（caller 藏 slide-in、清底色、還焦點） */
  function close(onDone) {
    kill();
    swallowBurst = true;
    // 點返回鍵關＝它滑出游標底下時保持 hover 色（user 2026-10-21，同 header menu 鈕）；點卡外／ESC 關＝凍到的就是一般色
    SCCDHelpers.holdHover(backBtn);
    const done = () => {
      tl = null;
      SCCDHelpers.releaseHover(backBtn);
      panel.style.transform = '';               // 傾斜角下次開再抽（收完才清＝退場沿傾斜軸）
      if (backBtn) { backBtn.style.translate = ''; backBtn.style.top = ''; }
      document.documentElement.classList.remove('has-slide-in', 'overlay-no-dim');
      onDone?.();
    };
    if (typeof gsap === 'undefined' || prefersReducedMotion()) { done(); return; }
    // 返回鍵先收（同 library 凸出灰卡的標題 chip 先收），色卡再「帶著內容」一起 clip reveal 收走。
    // ⚠️內容別先收光：剩一片純色在遮罩裡滑＝看起來跟原地縮小／擦除一樣。
    // 色卡用 DUR.medium：power3.in 前半幾乎不動，DUR.fast 實際只動 ~0.2s＝像閃一下沒動畫
    const bi = backInner();
    tl = gsap.timeline({ onComplete: done });
    if (bi) tl.to(bi, { ...revealHidden(backDir), duration: DUR.fast, ease: EASE.exit, overwrite: true }, 0);
    clipSlide(tl, panel, false, { duration: DUR.medium, ease: EASE.exit }, DUR.fast);
  }

  return { open, close, kill };
}
