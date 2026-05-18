/**
 * Create Page SPA Module
 *
 * 把 generate-app（原本跑在 iframe 內）整合進 site SPA。
 * 由 main-modular.js 在 page === 'generate' 時 call initCreatePage，
 * cleanupPageModules 時 call cleanupCreatePage。
 *
 * 設計：
 * - generate-app 的 9 個 .js 是 classic script（不是 ES6 module），靠 global function/var 互通；
 *   首次進 /create 時用 <script> tag append 順序載入；之後切頁不會 unload，第二次進來時用
 *   `<script src=...>` 重複 append 也會被 browser 跳過（同源 cache），但檢查 DOM 確認更穩
 * - sketch.js 內部用 `window.initCreateApp` / `window.cleanupCreateApp` 暴露生命週期 API；
 *   本 module 載完 script 後 call window.initCreateApp() 建立 p5 instance；
 *   離開頁面時 call window.cleanupCreateApp() → 內部 `_p5.remove()` 釋放 canvas / RAF / listeners
 * - 注意：generate-app 內 module-scope state（mode / targetMode / wireframeColor 等）會跨切頁殘留；
 *   re-init 後 setup() 重新 select DOM 元素（DOM 已被 SPA innerHTML 重建），但 state vars 仍是舊值。
 */

import {
  setSiteMode,
  getColorHue,
  setColorHue,
  startSiteColorLoop,
  stopSiteColorLoop,
  isColorLoopRunning,
  getStoredMode,
} from '../ui/theme-toggle.js';
import { registerPageExit } from '../ui/page-exit.js';
import { setupClipReveal } from '../ui/scroll-animate.js';
import { killGenerateLogoTimeline, GEN_LOGO_LAYOUT } from '../../header.js';

const ASSET_BASE = '/generate-app';

// 把 site theme-toggle 的 API 暴露到 window，給 generate-app classic scripts 用。
// generate-app .js 不是 ES6 module，不能 `import` — 必須透過 window 全域才存取得到 site state。
// 統一用 `sccd*` prefix 避免跟其他 site code 撞名。
// colormode btn click → site applyMode；/create 內切到 color 不自動啟動 colorTick RAF（user 須手動點 Play）。
// 從外面進 /create（applyModeForPage 走 setSiteMode default）才會 auto-play 背景
window.sccdSetMode = (mode) => setSiteMode(mode, { autoStartColorLoop: false });
window.sccdGetColorHue = getColorHue;              // wireframe 每幀讀現用 hue
window.sccdSetColorHue = setColorHue;              // color wheel drag → 寫回 site（不然 draw 下幀就覆蓋）
window.sccdStartColorLoop = startSiteColorLoop;    // Play btn
window.sccdStopColorLoop = stopSiteColorLoop;      // Pause btn
window.sccdIsColorLoopRunning = isColorLoopRunning; // Play/Pause icon 切換判斷

// 載入順序不能改，後面檔案依賴前面定義的 global var/function
const SCRIPTS = [
  `${ASSET_BASE}/p5.min.js`,
  `${ASSET_BASE}/js/variables.js`,
  `${ASSET_BASE}/js/utils.js`,
  `${ASSET_BASE}/js/mobile.js`,
  `${ASSET_BASE}/js/color-picker.js`,
  `${ASSET_BASE}/js/easter-eggs.js`,
  `${ASSET_BASE}/js/save-download.js`,
  `${ASSET_BASE}/js/draw-logo.js`,
  `${ASSET_BASE}/js/input-handling.js`,
  `${ASSET_BASE}/js/ui-state.js`,
  `${ASSET_BASE}/sketch.js`,
];

let scriptsLoaded = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // 已存在同 src 的 <script>：跳過 append（重複 append 也會被 browser 跳過 execute，但保險起見）
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // 保持插入順序執行
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error(`Failed to load ${src}: ${e?.message || e}`));
    document.head.appendChild(s);
  });
}

async function loadAllScripts() {
  if (scriptsLoaded) return;
  for (const src of SCRIPTS) {
    await loadScript(src);
  }
  scriptsLoaded = true;
}

/**
 * /create 退場動畫：router 在切頁前 await，destinationRoute 由 runPageExit 傳入
 *
 * 三種狀態（依 #header-logo 內是否還有 svg = Lottie 是否活著 + 可見 SCCD 字母數決定）：
 *
 * State A — Lottie 已 destroy，**至少 1 letter 可見**：
 *   1. SCCD reverse typewriter（backspace）— 完整 4 letter 走 cursor D→C→C→S 刪；1-3 letter 從右 stagger fade
 *      ⚠️ 不能改 clip-reveal 整段滑掉（user 否決過：「sccd 是要逐個刪除」）
 *   2. snap #header-logo 尺寸到下一頁應有大小（不動畫）
 *   3. #header-logo opacity:0 → 下一頁 switchHeaderLogo 偵測 needsReveal 跑 clip-path 左→右 reveal
 *
 * State B — Lottie 還在 #header-logo（typewriter 還沒跑到 destroy 步驟就被 kill）：
 *   1. 不 backspace（沒 SCCD 可刪）、不 snap、不設 opacity:0
 *   2. 只 fade cursor
 *   3. → 下一頁 updateNavActive 對 Lottie 平滑 fromTo resize（180/100）+ switchHeaderLogo 走 skip path
 *   4. user 看到 logo 不 fade 不 reveal，平順 resize 帶過去
 *
 * State C — Lottie 已 destroy 但 **SCCD 一個都還沒顯示**（cursor 在跳左 / blink 階段的窄窗口）：
 *   1. 不 backspace（沒可刪的字，刪不存在的視覺很怪）
 *   2. 只 fade cursors
 *   3. snap + opacity:0 仍要做（Lottie 不在了，下一頁要載新 Lottie + reveal）
 *   4. → user 看到 logo 直接走下一頁 reveal，不過 backspace 動畫
 *
 * ⚠️ 狀態判斷不能用 `sccdPaths.length === 4`：typewriter init 就建好 4 個 opacity:0 paths，
 *    length 永遠 4。要看 `visibleSccdCount = paths.filter(opacity > 0.5)` 才區分 A vs C
 *
 * Layout items（三 state 都跑）：logo / 輸入框 / control bar 全部走 clip-reveal（y-reveal）pattern：
 *   parent 設 overflow-y:clip + overflow-x:visible 當 mask，child yPercent 0→±110 overshoot
 *   相鄰 item 上下交替方向（[+,-,+] 或 [-,+,-]），起始正負隨機翻
 *   layoutItems stagger 0.1s（大元素慢）、controlBarItems stagger 0.05s 接近同時
 *
 * 全段約 0.9s。必須先 killGenerateLogoTimeline 切斷 typewriter，否則 .set 跟退場 anim 競爭。
 *
 * Memory 重點：
 *   - feedback_exit_anim_must_mirror_entry_pattern：SCCD typewriter entry → backspace exit
 *   - feedback_exit_anim_must_branch_on_entity_state：依 entity 狀態分支，不假設動畫完成
 *   - feedback_skip_if_intact_must_still_recover_caller_state：switchHeaderLogo skip path 已加 opacity recovery
 *   - feedback_clip_reveal_hidden_overshoot_to_110：yPercent 110 over-shoot 防 sub-pixel 殘影
 *   - feedback_clip_reveal_parent_overflow_alternative：flex child 不能 wrap 時用 parent overflowY:clip 替代
 */
function playCreateExitAnimation(destinationRoute) {
  if (typeof gsap === 'undefined') return Promise.resolve();

  if (typeof killGenerateLogoTimeline === 'function') killGenerateLogoTimeline();

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const destPage = destinationRoute?.page;
  // library / atlas 用 100px 小 logo；其他頁（含 alumni / about / index）皆 180px 大 logo
  const isSmallDestLogo = destPage === 'library' || destPage === 'atlas';

  // ── 偵測 logo 當前狀態 ──
  //   State A：typewriter 已跑到 Lottie destroy 步驟（SCCD letters 顯示，Lottie 不在 #header-logo 內）
  //   State B：Lottie 還在（typewriter 沒跑或被 kill 在 destroy 之前）
  const headerLogo = document.getElementById('header-logo');
  const lottieStillAlive = !!headerLogo?.querySelector('svg');

  // ── SCCD letters + cursor refs（typewriter entry 把 path/cursor 掛在 logo.parentNode）──
  const sccdPaths = Array.from(document.querySelectorAll('#gen-logo-svg path'));
  const typewriterCursor = document.querySelector('[data-gen-cursor][data-gen-cursor-role="typewriter"]');
  const indicatorCursor = document.querySelector('[data-gen-cursor][data-gen-cursor-role="indicator"]');
  const allCursors = Array.from(document.querySelectorAll('[data-gen-cursor]'));

  // ── State A only：snap header-logo 尺寸 + 之後設 opacity:0 觸發下一頁 reveal ──
  //   State B (Lottie 還在) 不 snap、不 opacity:0：讓下一頁的 updateNavActive 跑 fromTo 平滑 resize，
  //   switchHeaderLogo 走 skip path（dataset.logoType 相符 + svg 在）+ needsReveal=false → 不跑 reveal
  if (!lottieStillAlive && headerLogo && !isMobile) {
    const targetLogoSize = isSmallDestLogo ? 100 : 180;
    gsap.set(headerLogo, { width: targetLogoSize, height: targetLogoSize });
  }

  // ── Layout items 分兩組，全部走 clip-reveal（y-reveal）pattern（與 hero title 同形）：
  //   layoutItems = logo + 輸入框，較大元素 → stagger 0.1s 依序收
  //     mask 用 setupClipReveal **per-item wrapper**（wrapper 自動貼合元素實際寬高）
  //     好處：mask 邊界 = 元素 bbox，yPercent ±110 一定剪乾淨；不會像 parent overflow:clip
  //     那樣讓元素在 parent 多餘空間裡「飄出去後才被剪」
  //   controlBarItems = control bar 拆成獨立元素，小幅 stagger 0.05s 視覺上接近同時收起
  //     mask 用 parent overflow-y:clip（control box 本身大小跟 parent 接近、items 多用 wrap 較囉嗦）
  let layoutItems, controlBarItems, controlBarParent;
  if (isMobile) {
    layoutItems = [
      document.querySelector('.mobile-logo-container'),  // 繪製的 logo
      document.querySelector('.mobile-input-area'),      // 輸入框
    ];
    // mobile-bottom-bar 三個按鈕（mode / rotation-group / save）
    controlBarParent = document.querySelector('.mobile-bottom-bar');
    controlBarItems = controlBarParent
      ? Array.from(controlBarParent.children)
      : [];
  } else {
    layoutItems = [
      document.querySelector('.input-container'),          // 輸入框
      document.querySelector('#desktop-canvas-container'), // 繪製的 logo
    ];
    // control-panel 內 .control-box，filter 掉非 wireframe mode 隱藏的 #colorpicker-box
    controlBarParent = document.querySelector('.control-panel');
    controlBarItems = controlBarParent
      ? Array.from(controlBarParent.querySelectorAll(':scope > .control-box'))
          .filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null)
      : [];
  }
  layoutItems = layoutItems.filter(Boolean);

  // layoutItems 每個 wrap 成 overflow-y:clip 容器（reuse hero title pattern helper）
  // 接著把 wrapper 的可視區用 clip-path:inset() 從 container 範圍縮到「實際內容 bbox」：
  //   textarea → mirror div 量真實 wrap 後文字 bbox
  //   canvas   → pixel scan 量真實繪圖 bbox
  // 換算成相對 wrapper 的 inset(top right bottom left) 後設在 wrapper 上（wrapper 不動，
  // 元素 yPercent 移動時內容會滑出這個 clip window → 看起來像「內容剛好被剪在自己邊界」）
  // 量不到（canvas 還沒畫好 / textarea 空字串）就 fallback wrapper 原本大小（= container bbox）
  if (layoutItems.length > 0) {
    setupClipReveal(layoutItems, { hide: false });
    layoutItems.forEach(item => {
      const wrapper = /** @type {HTMLElement | null} */ (item.parentElement);
      if (!wrapper || !wrapper.classList.contains('clip-reveal-wrapper')) return;
      const bbox = measureLayoutItemBbox(/** @type {HTMLElement} */ (item));
      if (!bbox) return;
      const ww = wrapper.offsetWidth, wh = wrapper.offsetHeight;
      const top = Math.max(0, bbox.top);
      const left = Math.max(0, bbox.left);
      const right = Math.max(0, ww - bbox.left - bbox.width);
      const bottom = Math.max(0, wh - bbox.top - bbox.height);
      wrapper.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    });
  }

  // controlBar mask：parent overflow-y:clip 攔截 yPercent 移出 box 的部分
  // overflow-x:visible 保留 rotation-group 等 x 軸 expand 元素（Custom 區展開橫向超出 control-box）
  // SPA 隨即 innerHTML 替換 → inline 樣式自動清掉，不需手動 restore
  if (controlBarParent && controlBarItems.length > 0) {
    /** @type {HTMLElement} */ (controlBarParent).style.overflowY = 'clip';
    /** @type {HTMLElement} */ (controlBarParent).style.overflowX = 'visible';
  }

  // 防退場 anim 期間 user 還能點 control panel 觸發 sketch.js handler
  const createApp = document.getElementById('create-app');
  if (createApp) createApp.style.pointerEvents = 'none';

  // y-reveal 方向：±110 overshoot（memory feedback_clip_reveal_hidden_overshoot_to_110
  // sub-pixel 殘影防護）；y 軸只有 up/down 兩方向，N items 不可能完全 distinct，
  // 以「相鄰 item 不同方向」原則排（[+,-,+] 或 [-,+,-]），起始正負隨機翻
  const alternatingYPercent = (n) => {
    const startSign = Math.random() < 0.5 ? 1 : -1;
    return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? startSign : -startSign) * 110);
  };

  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    const safety = setTimeout(done, 1400);

    const tl = gsap.timeline({ onComplete: () => { clearTimeout(safety); done(); } });

    // 1a. controlBarItems（control bar 拆元素）y-reveal pattern（與 hero title 同形）：
    //    yPercent 0 → ±110 overshoot，相鄰 item 上下交替方向，parent overflow-y:clip 當 mask
    //    先退場：stagger 0.05s（接近同時）、dur 0.55s → 最後一個約 0.65s 結束
    if (controlBarItems.length > 0) {
      const yDirs = alternatingYPercent(controlBarItems.length);
      tl.fromTo(controlBarItems,
        { yPercent: 0 },
        {
          yPercent: i => yDirs[i],
          duration: 0.55,
          ease: 'power3.in',
          stagger: 0.05,
          overwrite: 'auto',
        },
        0
      );
    }

    // 1b. layoutItems（logo + 輸入框）y-reveal pattern：yPercent 0 → ±110 alternating
    //    後退場：距 controlBar start 0.2s（control bar 才剛起步、視覺上接著進來）、stagger 0.1s
    //    總結束時間：0.2 + 0.1 + 0.55 ≈ 0.85s
    if (layoutItems.length > 0) {
      const layoutYDirs = alternatingYPercent(layoutItems.length);
      tl.fromTo(layoutItems,
        { yPercent: 0 },
        {
          yPercent: i => layoutYDirs[i],
          duration: 0.55,
          ease: 'power3.in',
          stagger: 0.1,
          overwrite: 'auto',
        },
        0.2
      );
    }

    // 2. Lottie 還在的 State B：只 fade 掉 cursor（沒 SCCD 可刪），不動 headerLogo
    //    讓下一頁的 updateNavActive 對 Lottie 直接 resize（180/100）+ switchHeaderLogo 走 skip path
    if (lottieStillAlive) {
      if (allCursors.length > 0) {
        tl.to(allCursors, { opacity: 0, duration: 0.15, overwrite: 'auto' }, 0);
      }
      return; // State B 結束：不 backspace、不 opacity:0
    }

    // ── 以下為 State A/C（Lottie 已被 typewriter destroy）──
    //   sccdPaths.length === 4 在 typewriter init 就成立（paths 都 opacity:0 預建），
    //   要看「可見」字母數而非 length 才能分 State A（≥1 letter 顯示）vs State C（全沒顯示）
    const visibleSccdCount = sccdPaths.filter(
      p => parseFloat(/** @type {HTMLElement} */ (p).style.opacity || '1') > 0.5
    ).length;

    // 3. Indicator cursor 快速 fade（typewriter 完成後 cursor.visibility:hidden，保險）
    if (indicatorCursor) {
      tl.to(indicatorCursor, { opacity: 0, duration: 0.15, overwrite: 'auto' }, 0);
    }

    // 4. SCCD backspace 分三狀況：
    if (visibleSccdCount === 0) {
      // State C：Lottie 已 destroy 但 SCCD 還沒任何字母顯示（cursor 在跳左 / blink 階段）
      //   沒可刪的字 → 跳過 backspace，只 fade cursors。下一頁靠 opacity:0 trigger reveal 即可
      if (allCursors.length > 0) {
        tl.to(allCursors, { opacity: 0, duration: 0.15, overwrite: 'auto' }, 0);
      }
    } else if (visibleSccdCount === 4 && typewriterCursor) {
      // State A full：完整 SCCD 顯示 → cursor 跳到最右、D→C→C→S 反向刪
      const { LETTER_X, SCALE, GAP } = GEN_LOGO_LAYOUT;
      const START_T = 0.1;
      const PER = 0.08;

      tl.set(typewriterCursor, {
        left: LETTER_X[3] * SCALE + GAP,
        opacity: 1,
        visibility: 'visible',
      }, START_T);

      [3, 2, 1, 0].forEach((idx, step) => {
        const tStep = START_T + step * PER;
        tl.set(typewriterCursor, { left: LETTER_X[idx] * SCALE + GAP }, tStep);
        tl.set(sccdPaths[idx], { opacity: 0 }, tStep + PER * 0.4);
      });

      const tEnd = START_T + 4 * PER;
      tl.set(typewriterCursor, { left: -GAP }, tEnd);
      tl.to(typewriterCursor, { opacity: 0, duration: 0.12, ease: 'power2.out' }, tEnd);
    } else {
      // State A partial：1-3 個 letter 顯示 → 從右 stagger fade（只 fade 真的顯示的）
      const visiblePaths = sccdPaths.filter(
        p => parseFloat(/** @type {HTMLElement} */ (p).style.opacity || '1') > 0.5
      );
      tl.to(visiblePaths, {
        opacity: 0,
        duration: 0.3,
        stagger: { each: 0.06, from: 'end' },
        overwrite: 'auto',
      }, 0.1);
      if (allCursors.length > 0) {
        tl.to(allCursors, { opacity: 0, duration: 0.15 }, 0);
      }
    }

    // 5. #header-logo opacity:0 → 下一頁 switchHeaderLogo 偵測 opacity<0.5 跑 clip-path 左→右 reveal
    //    State A/C only：Lottie 不在了，下一頁需要載新 Lottie + reveal 動畫；State B 跳出已 early return
    if (headerLogo) {
      tl.to(headerLogo, { opacity: 0, duration: 0.15, ease: 'power2.out' }, 0.55);
    }
  });
}

function applyModeClass() {
  // SPA 切頁時 pages/create.html 內的 inline first-paint script 不會跑（router 用 innerHTML
  // 替換，<script> 不執行），需在這裡補設 #create-app 的 mode class，避免無 class 渲染白底
  // 再被 sketch.js setup() 切到目標 mode 造成閃爍
  const el = document.getElementById('create-app');
  if (!el) return;
  const clsMap = { standard: 'standard-mode', inverse: 'inverse-mode', color: 'wireframe-mode' };
  el.className = clsMap[getStoredMode()] || 'standard-mode';
}

export async function initCreatePage() {
  // ⚠️ Stale-init guard：initCreatePage 是 async，user 在 loadAllScripts await 期間切走，
  // 此函數 resume 時 #create-app DOM 已被 router 換掉。若繼續呼叫 window.initCreateApp()：
  //   - p5 setup() select 不到 #desktop-canvas-container → 拋錯 / 卡半成品
  //   - zombie p5 instance 跑 draw loop 在錯的 DOM 上、註冊 window listeners、不會被下一頁 cleanup
  //   - 副作用：scrollbar 卡 / body.overflow-hidden 失序 / 下一頁 router state 亂
  // 兩道防線：
  //   1. scripts 已 cached 時走 sync path，**完全沒 await**，user 沒機會切走
  //   2. scripts 還沒 cached 走 await path，resume 後檢查 #create-app 是否還在 DOM
  applyModeClass();
  registerPageExit(playCreateExitAnimation);

  // Fast path：scripts 已載過 → sync init，user 沒微任務縫切走
  if (scriptsLoaded) {
    runCreateApp();
    return;
  }

  // Slow path（首次載入）：await scripts + DOM 還在才 init
  try {
    await loadAllScripts();
  } catch (err) {
    console.error('[create-app] script load failed:', err);
    return;
  }
  if (!document.getElementById('create-app')) {
    console.warn('[create-app] aborted: #create-app no longer in DOM (user navigated away during init)');
    return;
  }
  runCreateApp();
}

function runCreateApp() {
  if (typeof window.initCreateApp === 'function') {
    window.initCreateApp();
  } else {
    console.error('[create-app] window.initCreateApp not defined after scripts loaded');
  }
}

export function cleanupCreatePage() {
  if (typeof window.cleanupCreateApp === 'function') {
    window.cleanupCreateApp();
  }
}

// ============================================================
// Content bbox 量測 helpers — 退場動畫對 layoutItems wrapper 套 clip-path:inset() 用
//   textarea → 量真實打的字 bbox（含 auto-wrap）
//   canvas    → pixel scan 找非背景區域 bbox
// 不是「container 整個 box」，這樣 yPercent 動畫剛好把實際內容剪在自己邊界
// ============================================================

// 量 textarea 真實打的字 bbox（含 auto-wrap）
//   - 建 hidden mirror div：同步 textarea 的 font / line-height / max-width / white-space 規則
//   - inline-block 讓 mirror 自己 shrink-to-fit width，但 max-width 限制觸發 wrap
//   - offsetWidth = 真實最寬行寬；offsetHeight = wrap 後總高度
//   - 不能只用 split('\n')：textarea 是 word-wrap:break-word + pre-wrap，
//     user 不按 enter 也會自動 wrap → value 無 \n 但視覺多行
function measureTextareaContent(ta) {
  const text = ta.value || ta.placeholder || '';
  if (!text) return null;
  const cs = getComputedStyle(ta);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const contentW = ta.clientWidth - padL - padR;  // textarea content box 寬度
  const mirror = document.createElement('div');
  mirror.style.cssText = [
    'position:absolute', 'visibility:hidden', 'top:-9999px', 'left:-9999px',
    'display:inline-block',
    `max-width:${contentW}px`,
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `font-weight:${cs.fontWeight}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    'white-space:pre-wrap',
    'word-wrap:break-word',
    'overflow-wrap:break-word',
  ].join(';');
  mirror.textContent = text;
  document.body.appendChild(mirror);
  const w = mirror.offsetWidth, h = mirror.offsetHeight;
  mirror.remove();
  return { top: padT, left: padL, width: w, height: h };
}

// 量 canvas 真實繪圖 bbox（pixel scan）
//   - 從 (0,0) 取 bg sample（RGBA 4 通道）；判定有內容：RGB 差距大於 TOL 或 alpha 差距大
//   - alpha 判定：p5 _p5.clear() 後 canvas 透明 → bg.a=0；只要繪過 1px 該位置 alpha 必 >0 → 抓 wireframe 細綫不會漏
//   - STEP=2 平衡效能 vs 1-2px 細綫漏 detect 風險
//   - 回傳 CSS px 座標
function measureCanvasContent(canvas) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return null;
  let ctx;
  try { ctx = canvas.getContext('2d'); }
  catch (e) { return null; }
  if (!ctx) return null;
  let imgData;
  try { imgData = ctx.getImageData(0, 0, w, h); }
  catch (e) { console.warn('[create-app] canvas bbox getImageData failed (tainted?):', e); return null; }
  const d = imgData.data;
  const bgR = d[0], bgG = d[1], bgB = d[2], bgA = d[3];
  const TOL = 15, STEP = 2;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(d[i] - bgR);
      const dg = Math.abs(d[i+1] - bgG);
      const db = Math.abs(d[i+2] - bgB);
      const da = Math.abs(d[i+3] - bgA);
      if (dr > TOL || dg > TOL || db > TOL || da > TOL) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const rect = canvas.getBoundingClientRect();
  const ratioX = rect.width / w, ratioY = rect.height / h;
  return {
    top: minY * ratioY,
    left: minX * ratioX,
    width: (maxX - minX) * ratioX,
    height: (maxY - minY) * ratioY,
  };
}

// 統一入口：給定 layoutItem (.input-container / #desktop-canvas-container / mobile 對應)，
// 找內部 textarea 或 canvas，呼叫對應 measure，回傳「相對 layoutItem 自己 box」的 bbox
// 給退場動畫用（換算 wrapper clip-path inset）
function measureLayoutItemBbox(layoutItem) {
  const ta = layoutItem.querySelector('textarea');
  const cv = layoutItem.querySelector('canvas');
  const inner = ta || cv;
  if (!inner) return null;
  const bbox = ta
    ? measureTextareaContent(/** @type {HTMLTextAreaElement} */ (ta))
    : measureCanvasContent(/** @type {HTMLCanvasElement} */ (cv));
  if (!bbox) return null;
  const ir = inner.getBoundingClientRect();
  const cr = layoutItem.getBoundingClientRect();
  return {
    top: bbox.top + (ir.top - cr.top),
    left: bbox.left + (ir.left - cr.left),
    width: bbox.width,
    height: bbox.height,
  };
}

// ============================================================
// /Content bbox 量測 helpers
// ============================================================
