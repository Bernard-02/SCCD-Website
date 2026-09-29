/* global gsap */
/**
 * Idle Standby — 無操作後進入 Atlas 待機畫面
 *
 * 概念：純「蓋一張紙」邏輯 — atlas overlay 在 z:10000 覆蓋整個 viewport，把整條 header（含 logo）自然蓋掉；
 * **不動 header 本身**（不改 z-index、不 clip-path 收起），離開待機原頁原樣回來。
 * 待機不顯示 logo（user 2026-09-29）：舊制把 logo 抽到 body z:10001 浮在 atlas 上＋縮小＋切非反色版，已整套拆除。
 *
 * 實作：複用 initAtlas 模組，傳 root container 讓它 render 到 overlay 內
 *   - atlas 視覺、資料、動畫完全同正式 atlas 頁
 *   - body.idle-standby CSS 自帶 atlas 內部 UI 隱藏 + atlas 元素 pointer-events:none
 *   - 離開時 cleanupAtlas + 清空 overlay，底下原頁完整保留（無 SPA 切換）
 *
 * 邊界（2b）：使用者本來在 atlas 頁時不蓋 overlay，僅切 body.idle-standby class（header 照常可見）
 *
 * 進入順序：
 *   1. add body.idle-standby
 *   2. (非 atlas 頁) 空白底 fade in → initAtlas 分批點燈 intro（同 atlas 頁進場；user 2026-07-15）
 *
 * 離開順序：
 *   1. (非 atlas 頁) 整個 atlas 單純 fade out（09-10 起；舊制 playOverlayAtlasExit 覆蓋色塊退場已撤）→ unmount atlas
 *   2. remove body.idle-standby
 *
 * 過場期間 isTransitioning flag 擋掉 activity reset 避免 race，結束後主動 reset 一次
 */

// atlas 改動態載入（223KB）：待機觸發（idle 3 分鐘）才 import——待機期間下載對使用者零感。
// module cache 與 atlas 頁共用同一份；atlasApi 存 namespace 供 unmount 的 cleanupAtlas 用。
let atlasApi = null;
import { DUR, EASE } from './motion.js';

const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 分鐘
const PHASE_DURATION = DUR.reveal;    // 星雲 / 背景 fade 每階段秒數

const ATLAS_MAIN_HTML = `
  <section id="atlas-main">
    <div id="atlas-stage">
      <div id="atlas-zoom">
        <div id="atlas-content"></div>
      </div>
    </div>
    <aside id="atlas-detail" aria-live="polite">
      <div class="atlas-detail-name" data-atlas-detail-name></div>
      <div class="atlas-detail-desc" data-atlas-detail-desc></div>
    </aside>
    <div id="atlas-filter" aria-label="Atlas filter">
      <button class="atlas-filter-btn w-fit text-left" data-filter="faculty">
        <span class="anchor-nav-inner">Professors 教師</span>
      </button>
      <button class="atlas-filter-btn w-fit text-left" data-filter="alumni">
        <span class="anchor-nav-inner">Alumni 系友</span>
      </button>
      <button class="atlas-filter-btn w-fit text-left" data-filter="partners">
        <span class="anchor-nav-inner">Partners 合作單位</span>
      </button>
    </div>
    <button id="atlas-layout-btn" aria-label="切換視圖">
      <span class="atlas-layout-inner">
        <span class="icon icon-atlas-list"></span>
      </span>
    </button>
  </section>
`;

let timerId = null;
let isStandby = false;
let isTransitioning = false;
let initialized = false;
let atlasMounted = false;
/** @type {(() => void) | null} 背景分頁進待機時掛的一次性 visibilitychange listener（見 armMountOnVisible） */
let pendingMountOnVisible = null;

function getPageKey() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '' || path === '/index.html') return 'index';
  const last = path.split('/').pop().replace('.html', '');
  return last || 'index';
}

function isOnAtlas() {
  return getPageKey() === 'atlas';
}

function ensureOverlay() {
  let overlay = document.getElementById('idle-standby-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'idle-standby-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

async function mountStandbyAtlas(instant) {
  const overlay = ensureOverlay();
  overlay.innerHTML = ATLAS_MAIN_HTML;
  overlay.style.pointerEvents = 'auto';
  // 上一輪退場切片把 overlay 設了 display:none；若新一輪在 idle 收尾跑完前進場（收尾有 isStandby guard
  // 會跳過還原）display 會殘留 none＝待機隱形 → mount 時一律重置（09-25 切片收尾的配套）
  overlay.style.display = '';

  const main = /** @type {HTMLElement|null} */ (overlay.querySelector('#atlas-main'));
  if (main) main.style.opacity = '0';

  // 非 instant：先把空白底 fade in（骨架 #atlas-main 只有 bg、還沒內容＝「先 fade 成空白」），
  // 內容進場交給 initAtlas 自己的「分批點燈」intro（同 atlas 頁，user 2026-07-15：不另外製作動畫）。
  // 之前把 #atlas-content 壓 opacity:0、intro 在看不見時播完、再普通 fade 蓋上去＝浪費現成動畫。
  if (!instant) await fadeAtlasMain(1);

  // instant（背景分頁）：跳過 atlas intro，掛上來就是定態
  atlasApi = await import('../pages/atlas.js');
  await atlasApi.initAtlas({ root: overlay, instant });
  atlasMounted = true;
}

function unmountStandbyAtlas() {
  if (!atlasMounted) return;
  atlasApi.cleanupAtlas();   // atlasMounted=true 必經 mount 的 await import → atlasApi 必已就緒
  const overlay = document.getElementById('idle-standby-overlay');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.style.pointerEvents = 'none';
  }
  atlasMounted = false;
}

function fadeEl(el, to, duration = PHASE_DURATION) {
  return new Promise(resolve => {
    if (!el) return resolve();
    if (typeof gsap === 'undefined') {
      el.style.opacity = String(to);
      return resolve();
    }
    gsap.to(el, {
      opacity: to,
      duration,
      ease: EASE.move,
      onComplete: resolve,
    });
  });
}

function fadeAtlasMain(to) {
  const main = document.querySelector('#idle-standby-overlay #atlas-main');
  return fadeEl(main, to);
}

// 背景分頁瞬間定態：直接設 opacity:1（rAF 暫停時 gsap tween 不會跑、切回本 tab 才補播 = 不要的「切回才 fade」）
function setStandbyAtlasVisible() {
  const main = /** @type {HTMLElement|null} */ (document.querySelector('#idle-standby-overlay #atlas-main'));
  if (main) main.style.opacity = '1';
}

// 背景分頁進待機（09-25）：不在隱藏期間真 mount——隱藏分頁不跑 rendering pipeline，
// ~7500 節點＋431 顆 will-change 合成層的首繪/光柵化/GPU 上傳會全欠到「切回分頁的第一幀」一次付清
// ＝user 報「回到畫面非常卡」的主因。改成：立旗標，切回可見的**下一幀**才 mount（instant 定態、
// 無 fade/intro）——底頁先便宜地畫出來、standby 首繪落在後續幀，「切回來已是待機」體驗幾乎不變。
function armMountOnVisible() {
  if (pendingMountOnVisible) return;
  const onVisible = () => {
    if (document.hidden) return;   // 只認 hidden→visible
    disarmMountOnVisible();
    requestAnimationFrame(async () => {
      if (!isStandby || isTransitioning || atlasMounted || isOnAtlas()) return;
      await mountStandbyAtlas(true);
      setStandbyAtlasVisible();
    });
  };
  pendingMountOnVisible = onVisible;
  document.addEventListener('visibilitychange', onVisible);
}

function disarmMountOnVisible() {
  if (!pendingMountOnVisible) return;
  document.removeEventListener('visibilitychange', pendingMountOnVisible);
  pendingMountOnVisible = null;
}

async function enterStandby() {
  if (isStandby || isTransitioning) return;
  // 手機不進待機畫面（user 2026-06-12）；guard 放進場時點而非 init，視窗大小變了也準
  if (window.innerWidth < 768) return;
  // 矮橫向（橫向手機）也不進（user 2026-07-04「橫向自然不該有待機」）：atlas 星雲在 <500px 高是文字湯，
  // gate 同 landscape.css（orientation:landscape + max-height:500px）
  if (window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return;
  // 背景分頁進待機：rAF 暫停＋沒人在看 → 直接定態（不 fade），使用者切回本 tab 時「已經是待機」，
  // 不是「當著面才 fade 進待機」。fade 只在停在本 tab 不動才跑。user 2026-06-24。
  const instant = document.hidden;
  isTransitioning = true;
  isStandby = true;

  document.body.classList.add('idle-standby');

  if (!isOnAtlas()) {
    if (instant) {
      // 背景分頁：不真 mount，切回可見的下一幀才掛（09-25，見 armMountOnVisible 註解）
      armMountOnVisible();
    } else {
      // mount overlay atlas：先空白底 fade in（header 連 logo 隨之被蓋掉）、內容走 atlas 分批點燈 intro（mount 內處理）
      await mountStandbyAtlas(false);
    }
  }

  isTransitioning = false;
}

async function exitStandby() {
  if (!isStandby || isTransitioning) return;
  isTransitioning = true;
  disarmMountOnVisible();   // 背景進待機、還沒切回就退出（防禦）：撤掉待掛的 mount

  // 待機離場時原頁內容也 fade in（user 2026-09-12）：此刻仍被不透明 overlay 蓋住 → 同步壓 opacity:0
  // 不會閃，再與 overlay fade out 同時 crossfade 回來（背景色都是 --theme-bg → 底不破）。
  const pageContent = /** @type {HTMLElement|null} */ (document.getElementById('page-content'));
  if (!isOnAtlas() && pageContent) pageContent.style.opacity = '0';

  // 只 fade out，先不拆 atlas DOM。拆除（cleanupAtlas + overlay.innerHTML=''）跟 ScrollTrigger.refresh
  // 改到下方 reveal 之後 defer，否則它們全壓在 index 重新露出的那一幀同步跑、卡住 index 的漂浮 rAF
  // （frame-based tick 被主執行緒 block → 卡片「停一下才繼續跑」；user 2026-06-30）。
  const atlasFadeOutPromise = (async () => {
    if (isOnAtlas()) return;
    // 09-10（user）：退場改單純 fade out——撤 playOverlayAtlasExit（cover wipe + span 四方向 clip 收，
    // 07-15 舊制），整個 #atlas-main 連內容直接淡出露回原頁
    await fadeAtlasMain(0);
  })();

  // 原頁內容 0→1，與 overlay 1→0 同步 crossfade（fadeEl 同 DUR.reveal / ease）
  const pageFadeInPromise = (async () => {
    if (isOnAtlas() || !pageContent) return;
    await fadeEl(pageContent, 1);
  })();

  await Promise.all([atlasFadeOutPromise, pageFadeInPromise]);
  if (pageContent) pageContent.style.opacity = '';   // 清掉 inline opacity，不殘留干擾後續換頁/主題過場

  // ── overlay 先脫離 render tree（09-25）：已 opacity:0，display:none 是最便宜的一步——
  // 讓下一步摘 body class 的全文件 style recalc 不再掃 7500 節點的 atlas 子樹，
  // 殘留 DOM 也保證不吃點擊、不被看到。
  const overlay = document.getElementById('idle-standby-overlay');
  if (overlay) {
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
  }

  document.body.classList.remove('idle-standby');

  isStandby = false;
  isTransitioning = false;
  // 過場期間 activity event 被 isTransitioning 擋掉沒重置 timer → 主動 reset 一次保證新一輪倒數從現在起算
  resetTimer();

  // 重收尾切片（09-25）：原本 cleanupAtlas＋innerHTML=''（拆 ~7500 節點）＋ScrollTrigger.refresh（全頁
  // forced layout）擠在同一個 double-rAF callback＝喚醒後第 3 幀必吃一根長幀（06-30 只把這批「延後兩幀」、
  // 沒切片）。拆成三個獨立 task：隔兩幀 cleanupAtlas（殺 tween/listener）→ idle 拆 DOM → 再 idle 跑 refresh。
  // rIC 必帶 timeout：index 動畫（floating/lottie）恢復後每幀都忙＝無 timeout 的 idle callback 會餓死，
  // 拆 DOM / ST.refresh 永遠不跑（headless 實測 +900ms 未執行）→ 500ms 保底、仍避開喚醒頭幾幀
  const ric = /** @type {(fn: () => void) => void} */ (
    window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 500 })
      : (fn) => setTimeout(fn, 200)
  );
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (isStandby) return;   // 防禦：期間又進了待機（3 分鐘計時下理論不可能）
    if (atlasMounted) atlasApi.cleanupAtlas();
    ric(() => {
      if (isStandby) return;
      const ov = document.getElementById('idle-standby-overlay');
      if (ov) { ov.innerHTML = ''; ov.style.display = ''; ov.style.pointerEvents = 'none'; }
      atlasMounted = false;
      ric(() => {
        // ScrollTrigger.refresh：standby overlay (fixed z:10000) 進過 body 可能改變 layout → 不 refresh 的話
        // degree-show-detail sticky title group / branch chip 會用過時 trigger 位置（延後可、刪不可）。
        if (typeof window !== 'undefined' && /** @type {any} */ (window).ScrollTrigger) {
          /** @type {any} */ (window).ScrollTrigger.refresh();
        }
      });
    });
  }));
}

function resetTimer() {
  if (isTransitioning) return; // 過場中忽略，避免 race
  if (timerId) clearTimeout(timerId);
  if (isStandby) {
    exitStandby();
    return;
  }
  timerId = setTimeout(enterStandby, IDLE_TIMEOUT);
}

export function initIdleStandby() {
  if (initialized) return;
  initialized = true;

  // mousemove 特別處理：視窗重新取得焦點（alt-tab / 點回分頁）時，OS 會補送一個「座標沒變」的 mousemove，
  // 原本任何 mousemove 都算活動 → 一回到頁面就自動退出待機（user 2026-06-28 報「不是回來就取消、要真的移動或點擊」）。
  // 只在座標真的改變時才算活動 → 純粹切回視窗（沒動滑鼠）維持待機，真的移動滑鼠才取消。
  let lastX = null, lastY = null;
  window.addEventListener('mousemove', (e) => {
    if (e.clientX === lastX && e.clientY === lastY) return; // 焦點補送的假 move（座標沒變）→ 忽略
    lastX = e.clientX; lastY = e.clientY;
    resetTimer();
  }, { passive: true });

  // 其餘都是明確操作（按下 / 鍵盤 / 觸控 / 滾輪 / 捲動）→ 直接算活動
  const events = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  events.forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  // 待機中視窗尺寸變了（換螢幕 / 拉視窗 / 投影）：overlay atlas 佈局是 mount 時尺寸算死的
  // （atlas 慣例不隨 resize 重排）→ debounce 後整份重掛（instant 定態），永遠 fit 當下視窗。
  // 縮到手機 / 矮橫向（enterStandby 本來就不進的尺寸）直接退出待機。
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!isStandby) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      if (!isStandby || isTransitioning) return;
      if (window.innerWidth < 768
        || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
        exitStandby();
        return;
      }
      if (isOnAtlas() || !atlasMounted) return;
      isTransitioning = true;   // 重掛期間擋 exitStandby，避免拆一半被 fade-out 撞上
      unmountStandbyAtlas();
      await mountStandbyAtlas(true);
      setStandbyAtlasVisible();
      isTransitioning = false;
    }, 300);
  });

  resetTimer();
}
