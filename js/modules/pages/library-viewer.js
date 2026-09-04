// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Library Viewer
 * 初始化 lightbox listener 和 PDF viewer modal（供 SPA 路由呼叫）
 */

import { openLightbox } from '../lightbox/activities-lightbox.js';
import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { createRefBtn } from '../lightbox/lightbox-ref-btn.js';
import { applyScreenWatermark, repositionScreenWatermark } from '../lightbox/screen-watermark.js';
import { sitePath } from '../ui/site-base.js';
import { peekPdfCover } from '../ui/pdf-cover.js';
import { DUR, EASE } from '../ui/motion.js';

// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lightboxListenerAdded = false;

function ensureLightboxListener() {
  if (_lightboxListenerAdded) return;
  _lightboxListenerAdded = true;
  document.addEventListener('sccd:open-lightbox', e => {
    const { media, index, title, color, references, shareUrl } = e.detail;
    // title / color / references / shareUrl 由 caller (library-panels) 帶入；沒帶就 fallback 不顯示對應 UI
    openLightbox(media, index, { title, color, references, shareUrl });
  });
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────

let _pdfListenerAdded = false;
let _pdfjsLoadPromise = null;
// CID 字型用預定義外部 CMap 的 PDF（中文舊檔常見）→ 沒給 cMapUrl 就整段中文渲染成空白（缺字）；
// cdnjs 不供 cmaps（403）→ 用 jsdelivr pdfjs-dist cmaps（同 pdf-cover.js）。
const PDFJS_CMAPS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/cmaps/';
// 非嵌入標準字型（Helvetica/Times/Arial 等）→ pdf.js 沒 standardFontDataUrl 就整段畫成空白（掉字）；
// Acrobat 有系統/內建字型故看起來正常（user 2026-08-23「掃描檔內頁掉字、Acrobat 正常」；press 實測有此檔）。同 cmaps 走 jsdelivr。
const PDFJS_STD_FONTS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/standard_fonts/';
// pdf.js 6.x 把 CCITT/JBIG2/JPX 影像解碼移進 wasm 模組 → 沒給 wasmUrl 會「Jbig2 failed to initialize」
// 整張 XObject 被丟掉（MRC 壓縮掃描檔＝JPEG 背景＋CCITT 文字遮罩 → 文字層全消失只剩糊背景；
// user 2026-08-23 MINTS press 第 2 頁實測）。cdnjs 不供 wasm 目錄 → 同 cmaps 走 jsdelivr。
const PDFJS_WASM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/wasm/';

// pdfjsLib 不存在時動態 import 補載入（v4+ 只出 ESM build；import() 模組快取
// 與 pdf-cover.js 天然去重）。掛回 window.pdfjsLib 讓既有 typeof 檢查照用。
function ensurePdfjsLoaded() {
  if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
  if (!_pdfjsLoadPromise) {
    _pdfjsLoadPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.2.108/pdf.min.mjs')
      .then(m => { window.pdfjsLib = m; });
  }
  return _pdfjsLoadPromise;
}

function ensurePdfModal() {
  if (document.getElementById('pdf-viewer-modal')) return;

  const modal = document.createElement('div');
  modal.id        = 'pdf-viewer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'PDF 文件檢視器 PDF viewer');
  // 結構對齊 activities-lightbox：X 右上 + prev/next 主區域左右 absolute + 底部資訊條
  // scrollbar gutter 由 lightbox-shell 染 html bg 處理
  // 新增：左下角 title pill（鏡像 album）/ 底部右側 zoom controls / 中央 .pdf-zoom-stage 包 canvases
  modal.className = 'fixed inset-0 z-[9999] bg-black/90 flex flex-col opacity-0 transition-opacity duration-300';
  modal.style.display = 'none';
  modal.innerHTML = `
    <!-- back btn / title / ref btn 都改放到底部 .pdf-bottom-bar 內（見下），才能跟頁碼/zoom 同一水平線置中（user 2026-06-03）-->

    <!-- px-16 md:px-32：desktop padding 加大讓 stage（=zoom mask）邊緣停在 chevron 內側，
         避免 zoom 後 PDF/canvas 視覺貼到 chevron 上。chevron right edge ≈ container-padding + 44 = 68px，
         px-32 = 128px → mask 邊 60px gap。mobile 維持 px-16 -->
    <div class="pdf-main-row flex items-center justify-center w-full px-16 md:px-32 pt-xl pb-md flex-1 min-h-0 relative">
      <!-- chevron 對齊 logo 左/右邊（var(--container-padding)）= 跟 back btn 同 column -->
      <!-- 用 aria-disabled 不用原生 disabled：Chrome 對原生 disabled 強制預設箭頭、CSS cursor 無效
           （同 activities-lightbox chevron；到底時要顯示 not-allowed 游標，user 2026-08-23）。turnPage 有 guard，點擊本就 no-op -->
      <button id="pdf-prev-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 aria-disabled:opacity-20 aria-disabled:hover:opacity-20 aria-disabled:[cursor:var(--cursor-not-allowed)]" style="left: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m"></span>
      </button>
      <!-- zoom stage：overflow:hidden 容器，transform 套在 .pdf-canvas-row 上做 zoom + pan -->
      <div class="pdf-zoom-stage" style="position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <div class="pdf-canvas-row flex items-center justify-center gap-0 w-full h-full" style="transform-origin:center;will-change:transform;">
          <div class="pdf-rendered-content" style="position:relative;overflow:hidden;flex-shrink:0;">
            <canvas id="pdf-canvas-left" class="bg-white block" style="user-select:none;"></canvas>
          </div>
        </div>
        <!-- 載入色塊（取代舊 LQIP 馬賽克墊圖）：放 .pdf-zoom-stage 內（非 rendered-content）＝stage 絕對定位、
             開場依「頁面可視矩形」定尺寸一次、render 完全不碰 → 不再「先大後縮兩段跳」（user 2026-08-24）。
             仍是頁面大小（非蓋滿整個 stage，user 要求）；render 完成前每秒換三原色，完成後隨機四方向 clip-reveal 揭露 PDF。
             z-index:15＝蓋在 canvas-row 上、低於浮水印(z20，load 期間 opacity:0)與 minimap(z25，load 期間藏)。 -->
        <div class="pdf-color-loader" aria-hidden="true" style="position:absolute;left:0;top:0;pointer-events:none;display:none;z-index:15;">
          <!-- 換色 swipe 子層：新色從隨機一邊 clip-reveal 掃入蓋過舊色（user 2026-09-01，取代直接 snap 背景色） -->
          <div class="pdf-color-loader-swipe" style="position:absolute;inset:0;display:none;"></div>
        </div>
        <!-- 浮水印放在 zoom-stage（非 .pdf-canvas-row）→ 不吃 zoom 的 scale transform，放大 PDF 時水印字級不變（user 2026-08-20）。
             外層 .pdf-watermark-clip（未旋轉、inset:0）用 clip-path 把浮水印裁成「PDF 頁面在螢幕上的矩形」
             → 浮水印只蓋頁面、不蓋整個視窗（user 2026-08-23；updateWatermarkClip 跟著 zoom/pan 更新）。
             內層圖樣仍全幅+旋轉+repeat（字級恆定、不隨 pan 位移），只是被外層裁到頁框內。-->
        <div class="pdf-watermark-clip" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;z-index:20;">
          <div class="pdf-watermark" style="position:absolute;pointer-events:none;"></div>
        </div>
        <!-- 右上角 minimap（press + documents 全部開檔都有，user 2026-08-23）：當前頁縮圖＋壓暗標示目前可視範圍。
             只在「頁面被視窗裁切」時顯示（整頁可見時藏）；翻頁/縮放/拖曳都同步。
             放 zoom-stage 而非 canvas-row → 不吃 zoom/pan，始終固定。pointer-events:none 不擋拖曳 -->
        <div class="pdf-corner-thumb" style="position:absolute;top:0;right:0;width:clamp(56px,12vw,88px);z-index:25;pointer-events:none;display:none;overflow:hidden;">
          <!-- inner 做 clip-reveal 進出場（yPercent 滑動）；外層 .pdf-corner-thumb overflow:hidden = reveal clip 罩。
               ⚠️inner 也要 overflow:hidden：spotlight 是 rect 的 box-shadow 0 0 0 9999px，若只靠外層裁，滑動時
               巨大陰影會一直填滿「不動的外層」→ 縮圖主體滑走、黑色壓暗留在原地（拆成兩塊，user 2026-08-23）。
               裁在「會跟著滑」的 inner box → 陰影與主體整體一起進出場。-->
          <div class="pdf-corner-thumb-inner" style="position:relative;overflow:hidden;will-change:transform;">
            <canvas class="pdf-corner-thumb-canvas" style="display:block;width:100%;height:auto;background:#fff;"></canvas>
            <!-- 可視範圍標示：框外用大 box-shadow 疊 70% 黑（spotlight 技巧）＝「畫面內 100% 亮、畫面外壓暗」；
                 不用白框（user 2026-08-23 定案改暗區做法、同日調 70%） -->
            <div class="pdf-corner-thumb-rect" style="position:absolute;left:0;top:0;box-sizing:border-box;box-shadow:0 0 0 9999px rgba(0,0,0,0.7);"></div>
          </div>
        </div>
      </div>
      <button id="pdf-next-btn" class="absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 aria-disabled:opacity-20 aria-disabled:hover:opacity-20 aria-disabled:[cursor:var(--cursor-not-allowed)]" style="right: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m rotate-180"></span>
      </button>
    </div>

    <!-- PDF 無縮圖列，底部只放頁碼 + zoom controls → 不撐高，讓 PDF stage 盡量往下延伸（user 2026-06-02）。
         （曾為對齊 album .alb-thumbs-wrap 撐到 156px，但 PDF 那段是空的，user 要求拿掉讓 PDF 更高）-->
    <!-- min-height 108px：對齊 album .alb-thumbs-wrap 的 row 高度，讓底部 pill 的 breathing room 跟 album 一致。
         album row = thumb 48px + .alb-thumbs padding 6×2 + pt-md/pb-md 24×2 = 108px；PDF 無縮圖列、自然只 ~72px，
         pill（left bottom 旋轉、兩行 ~57px）在矮 bar 裡離底邊太近顯得比 album 低 → 補 min-height 拉到同高。
         （此處刻意 re-add 之前為衝 stage 高度而移除的 min-height；user 2026-06-03 要 pill 對齊 album，接受 stage 少 ~36px） -->
    <div class="pdf-bottom-bar relative flex items-center justify-center px-xl py-md flex-shrink-0 text-white" style="min-height: 108px;">
      <!-- back btn + title（ref btn 由 JS 插入此 bar）：absolute 靠左 + top:50% translateY(-50%)，
           與頁碼/zoom 同一水平線置中（user 2026-06-03；鏡像 album .alb-topbar 在 thumbs-wrap 內的做法）。
           translateY 套外層定位元素、rotate 套內層 pill → 兩 transform 不衝突。
           rotate 的 transform-origin = center（繞中心旋轉；原 left bottom 會讓寬 title 右端下沉 ~15-19px、把 share 拽得看起來低一截、跟 back 不在同一線，user 2026-08-20 改中心。
           media lightbox 同步改，見 activities-lightbox）-->
      <button class="pdf-back-btn absolute" style="top: 50%; transform: translateY(-50%); left: var(--container-padding, 1.5rem); z-index: 50;">
        <span class="pdf-back-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;font-size:var(--font-size-s);line-height:1;transform:rotate(0deg);transform-origin:center;box-sizing:border-box;">
          <span class="icon icon-arrow-left icon-m"></span>
        </span>
      </button>
      <div class="pdf-title absolute" style="top: 50%; transform: translateY(-50%); left: 4rem; z-index: 50; display: none;"></div>
      <!-- Share btn：排在 title 之後（鏡像 album lightbox）。caller 帶 shareUrl（library press/files）才顯示；
           data-share-url 由 open-pdf handler 設、全站 share-modal.js [data-share-btn] delegation 接管（QR + 複製）。
           圖示＝返回鍵那顆粗箭頭旋轉 135° 指右上 ↗（與 album share btn 一致，user 2026-06-15）。-->
      <button class="pdf-share-btn absolute" data-share-btn aria-label="分享 Share" style="top: 50%; transform: translateY(-50%); left: 4rem; z-index: 50; display: none;">
        <span class="pdf-share-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;transform-origin:center;box-sizing:border-box;">
          <span class="icon icon-arrow-left icon-m" style="transform: rotate(135deg);"></span>
        </span>
      </button>
      <span id="pdf-page-info" class="text-s"></span>
      <!-- 頁碼 justify-center 置中；zoom controls 靠右 absolute，top:50%+translateY(-50%) 與頁碼同一水平線
           （user 2026-06-03 澄清：頁碼置中、controls 靠右、兩者對齊在同一水平線，不是整組置中）-->
      <div class="pdf-zoom-controls absolute text-white" style="right: var(--container-padding, 1.5rem); top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 12px;">
        <button id="pdf-zoom-out" class="p-2 transition-opacity hover:opacity-60 aria-disabled:opacity-30 aria-disabled:hover:opacity-30 aria-disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Zoom out">
          <span class="icon icon-zoom-out icon-m"></span>
        </button>
        <span id="pdf-zoom-pct" class="text-s" style="font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center;">100%</span>
        <button id="pdf-zoom-in" class="p-2 transition-opacity hover:opacity-60 aria-disabled:opacity-30 aria-disabled:hover:opacity-30 aria-disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Zoom in">
          <span class="icon icon-zoom-in icon-m"></span>
        </button>
        <!-- Fit Page ↔ Fit Width 雙態 toggle；icon 顯示「下一個動作」：預設 Fit Page → 顯示 fit_width（點了切滿寬）-->
        <button id="pdf-fit-toggle" class="p-2 transition-opacity hover:opacity-60 aria-disabled:opacity-30 aria-disabled:hover:opacity-30 aria-disabled:[cursor:var(--cursor-not-allowed)]" aria-label="Fit / zoom toggle">
          <span class="icon icon-fit-width icon-m"></span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// 共用 PDF viewer：library + alumni（會議紀錄）都用，dispatch 'sccd:open-pdf' { detail: {pdfUrl} }
// idempotent：_pdfListenerAdded 防重複，listener / DOM 只建一次
export function initPdfViewer() {
  if (_pdfListenerAdded) return;

  ensurePdfModal();

  // pdf.js worker setup helper（idempotent；ensurePdfjsLoaded resolve 後 call 一次）
  function setupPdfjsWorker() {
    if (typeof pdfjsLib === 'undefined') return;
    if (pdfjsLib.GlobalWorkerOptions.workerSrc) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.2.108/pdf.worker.min.mjs';
  }
  setupPdfjsWorker();

  const modal     = document.getElementById('pdf-viewer-modal');
  const canvasL   = document.getElementById('pdf-canvas-left');
  const prevBtn   = document.getElementById('pdf-prev-btn');
  const nextBtn   = document.getElementById('pdf-next-btn');
  const pageInfo  = document.getElementById('pdf-page-info');
  const backBtn   = modal.querySelector('.pdf-back-btn');
  const backPill  = modal.querySelector('.pdf-back-pill');
  const stageEl   = modal.querySelector('.pdf-zoom-stage');
  const rowEl     = modal.querySelector('.pdf-canvas-row');
  const renderedContentEl = modal.querySelector('.pdf-rendered-content');
  const cornerThumbEl = modal.querySelector('.pdf-corner-thumb');
  const cornerThumbCanvas = /** @type {HTMLCanvasElement | null} */ (modal.querySelector('.pdf-corner-thumb-canvas'));
  const cornerThumbRect = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-corner-thumb-rect'));
  const cornerThumbInner = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-corner-thumb-inner'));
  const colorLoaderEl = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-color-loader'));
  const colorSwipeEl = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-color-loader-swipe'));
  const watermarkEl = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-watermark'));
  const watermarkClipEl = /** @type {HTMLElement | null} */ (modal.querySelector('.pdf-watermark-clip'));
  const mainRowEl = modal.querySelector('.pdf-main-row');
  const bottomBarEl = modal.querySelector('.pdf-bottom-bar');
  const titleEl   = modal.querySelector('.pdf-title');
  const shareBtnEl = modal.querySelector('.pdf-share-btn');
  const sharePillEl = modal.querySelector('.pdf-share-pill');
  const zoomInBtn  = document.getElementById('pdf-zoom-in');
  const zoomOutBtn = document.getElementById('pdf-zoom-out');
  const zoomPctEl  = document.getElementById('pdf-zoom-pct');
  const fitToggleBtn = document.getElementById('pdf-fit-toggle');
  if (!modal || !canvasL || !stageEl || !rowEl) return;

  // 翻頁 chevron 的 disabled 走 aria-disabled 不用原生 disabled：Chrome 對原生 disabled 元素
  // 強制預設箭頭游標、CSS cursor 蓋不過（同 activities-lightbox chevron / create.css）；
  // 到底時要顯示 not-allowed 游標（user 2026-08-23）。點擊由 turnPage 的 navDisabled guard 擋。
  const setNavDisabled = (btn, dis) => btn.setAttribute('aria-disabled', dis ? 'true' : 'false');
  const navDisabled = (btn) => btn.getAttribute('aria-disabled') === 'true';

  // ── 螢幕浮水印 + 禁右鍵下載（user 2026-06-08；2026-06-09 改連續重複斜向版）──────────
  // 浮水印排版（user 指定）：英文一行「整句連續重複」+ 中文一行「整句連續重複」、英中交替數行，整片斜 30°。
  //   作法＝兩個 background layer（EN / ZH 各一個水平 repeat 的 SVG tile）疊在同一 div、垂直交替，
  //   再把整個 div 放大 inset:-50% 後 rotate(-30deg) → 斜向連續文字、邊緣由外層 .pdf-zoom-stage overflow:hidden 裁掉。
  //   ⚠️ 不要回退成「一句一句獨立擺＋整片 rotate 每個 text」：那種長英文 rotate 後會在 tile 接縫被切成半句（踩過）。
  //   ⚠️ 水平無縫關鍵＝每個 tile 寬必須＝「一句＋分隔」實際 advance 寬 → 即時量（字體已載入），寫死像素會在接縫跳位。
  // 在「開啟時」呼叫（見 sccd:open-pdf handler）：字體必載好 → 量測準；依 viewport 給手機較小較密版。
  // 共用 helper（media lightbox 也用同一份）。
  function buildWatermark() {
    applyScreenWatermark(modal.querySelector('.pdf-watermark'));
  }
  // 禁右鍵：PDF 渲染在 <canvas>，右鍵「另存圖片」會存下當頁 → viewer 開著時整個 modal 禁 contextmenu。
  // ⚠️ 只嚇阻隨手下載／截圖；拿到原始 /assets PDF 網址仍是無浮水印原檔（要檔案級保護得後臺處理）。
  modal.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Ref btn（plug-in helper）─────────────────────────────────────
  // 提供「跳轉到 activities 對應 item」的 chip popover；close lightbox 後 SPA 換頁
  const refUi = createRefBtn('#00FF80', () => closeModal());
  refUi.btnEl.classList.add('pdf-ref-btn');
  refUi.btnEl.style.position = 'absolute';
  refUi.btnEl.style.top = '50%';
  refUi.btnEl.style.transform = 'translateY(-50%)';   // 垂直置中於 bar，跟 back/title/頁碼同一水平線
  refUi.btnEl.style.zIndex = '50';
  // left 由 positionRefBtn 動態算（anchor 到 back btn 右緣 + gap）；先給 fallback 避免閃位
  refUi.btnEl.style.left = '4rem';
  (bottomBarEl || modal).appendChild(refUi.btnEl);    // ref btn 進 bar → 跟 back/title/頁碼/zoom 同一水平線
  modal.appendChild(refUi.popoverEl);                 // popover 仍掛 modal（full overlay；positionPopover 用 viewport rect 算）

  let pdfDoc   = null;
  let curPage  = 1;
  let rendering = false;
  let wantWatermark = false;   // 只有 document/files 來源的 PDF 要浮水印（press / 會議紀錄 / charter 不用）
  let allowAutoRead = false;   // 首開「閱讀縮放」只給 press（detail.autoRead）；documents/其他一律 Fit Page 整頁（user 2026-08-23）
  let openToken = 0;             // 每次 open ++、close 也 ++：作廢慢到的開場（見 sccd:open-pdf handler）
  let curPdfUrl = '';            // 當前開檔 URL（頁面比例快取的 key，見 setCachedPdfDims）
  // 載入色塊（取代舊 LQIP 馬賽克墊圖）：render 完成前蓋住頁面（.pdf-color-loader 是 .pdf-zoom-stage 的
  // stage 絕對定位 overlay、開場依頁面可視矩形定尺寸一次、render 不碰＝不跳）、每秒切一個「不同的」三原色循環；
  // render 完成後等當前色塊 1s 走完再隨機四方向 clip-reveal 揭露頁面。
  const LOADER_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];   // 設計系統三原色（綠 / 粉 / 藍）
  let loaderTimer = 0;
  let loaderActive = false;
  let loaderReady  = false;   // render 完成、等當前色塊 1s 走完才揭露
  let lastColorIdx = -1;

  // ── Zoom 狀態（對齊 activities-lightbox album viewer 邏輯）────────────────
  // 內部 zoom.scale 恆以「fit-to-stage」為 1（同 album）。
  // 顯示 % = zoom.scale × fitRatio × 100；fitRatio = fitDims/naturalDims = canvas 顯示寬 / PDF 原寸寬
  // 預設打開 = Fit Page (zoom.scale=1 fit-to-stage)，仿 Acrobat「適合頁面」整頁撐滿視窗（user 2026-06-02）
  // actual size (100% PDF 原寸) = zoom.scale = 1/fitRatio，要 zoom out 才到（同 Acrobat Actual Size 是選項非預設）
  // fit-toggle = 回 zoom.scale=1（fit-to-stage / Fit Page）
  const MIN_PCT = 0.10;   // 10% 下限（百分比 = 相對 PDF 原寸）
  const MAX_PCT = 6;      // 600% 上限
  // 長頁自動「閱讀縮放」：首開仿 Acrobat，把偏窄（portrait）的頁面放大貼頂、往下捲即讀，免手動放大（user 2026-08-23）。
  // 桌面目標 = 頁面寬佔 stage 寬的一半（≈50% 螢幕；Fit Width 滿寬 ~200% user 覺得太大）；
  // 手機窄螢幕 50% 會太小 → 放滿寬。一律不小於 Fit Page，故 landscape / 近方形頁維持整頁不變。
  const READ_WIDTH_FRACTION_DESKTOP = 0.5;
  // 渲染品質：每次切換 scale 重渲（不靠 CSS 放大避免高倍模糊；同 album 但 album 用 img naturalDims+CSS scale）
  // PDF 不一樣：CSS scale 放大會糊文字，重渲較慢但清晰；採折衷 RENDER_QUALITY=2 平衡
  const RENDER_QUALITY = 2;
  // 放大後 canvas 是 CSS-transform 拉大固定點陣圖 → 超過緩衝解析度就糊（retina 更早）。
  // sharpenRender：縮放停下後依「zoom.scale × DPR」重渲當頁到對應解析度（幾何不變、只換清晰度）。
  const MAX_CANVAS_DIM = 8192;   // 預設上限，避免高倍 × 大頁超過瀏覽器 canvas 記憶體/尺寸限制
  // Chrome canvas 面積硬限 ~2^28(268M)px，超過整片變空白 → 留 buffer 當第二道保護（單邊 + 面積都要卡）
  const MAX_CANVAS_AREA = 240000000;
  let curMaxDim = MAX_CANVAS_DIM;   // 每次 open 可由 detail.maxCanvasDim 覆蓋（press 無浮水印 → 給更高清上限）
  let sharpenTimer = 0;
  let sharpenedQuality = RENDER_QUALITY;   // 目前 canvas 點陣圖的品質倍率（renderPage 後 = RENDER_QUALITY）
  let zoom = { scale: 1, tx: 0, ty: 0 };
  // fitDims / naturalDims（同 album 命名）：
  // - naturalDims = PDF 原寸 (PDF.js scale=1 的 viewport 寬高 = CSS px @96dpi)
  // - fitDims = 在 stage 內 contain 後的渲染顯示尺寸（CSS px）；永遠 ≤ naturalDims（小 PDF 不放大）
  let fitDims = { w: 0, h: 0 };
  let naturalDims = { w: 0, h: 0 };
  let isDragging = false;
  let dragStart  = { x: 0, y: 0, tx: 0, ty: 0 };
  // wheel 翻頁 debounce：touchpad 一次手勢會 burst 多 events
  let wheelPageLock = 0;
  const WHEEL_PAGE_COOLDOWN = 350;

  function getFitRatio() {
    return naturalDims.w > 0 && fitDims.w > 0 ? fitDims.w / naturalDims.w : 0;
  }
  const fitScale    = () => 1;
  const actualScale = () => { const r = getFitRatio(); return r > 0 ? 1 / r : 1; };
  function minScale() {
    const r = getFitRatio();
    if (r <= 0) return 1;
    return Math.min(fitScale(), MIN_PCT / r);
  }
  function maxScale() {
    const r = getFitRatio();
    if (r <= 0) return 6;
    return Math.max(actualScale(), MAX_PCT / r);
  }
  function isFit() { return Math.abs(zoom.scale - fitScale()) < 0.001; }

  // Fit Width（仿 Acrobat「適合寬度」）：頁面寬度填滿 availW 對應的 scale。
  // portrait 頁比 Fit Page 大（高度溢出 → 垂直 pan）；landscape 頁等於 Fit Page（Fit Page 已填滿寬）。
  function fitWidthScale() {
    if (fitDims.w <= 0) return fitScale();
    const availW = stageEl.clientWidth || window.innerWidth;  // 填滿整個 stage 寬（不再 *0.92；px-32 已留 chevron clearance，user 2026-06-03 要 Fit Width 頂到邊）
    return Math.max(fitScale(), availW / fitDims.w);
  }
  function isFitWidth() {
    const fw = fitWidthScale();
    return fw > fitScale() + 0.001 && Math.abs(zoom.scale - fw) < 0.001;
  }
  // Fit Width 進入時對齊「頁面頂端」（仿 Acrobat 適合寬度：頁高溢出時從頂部開始看，而非顯示中段）。
  // top-align ty = +maxTy（把頁面頂端貼到 stage 頂端）；頁面不溢出（landscape）時 maxTy=0 即整頁置中。
  // user 2026-06-03：點 Fit Width 預設要對齊頂部、不要從中間放大。
  function fitWidthTopTy(scale) {
    const scaledH = fitDims.h * scale;
    return Math.max(0, (scaledH - stageEl.getBoundingClientRect().height) / 2);
  }
  function applyFitWidth(animated = false) {
    zoom.scale = Math.max(minScale(), Math.min(maxScale(), fitWidthScale()));
    zoom.tx = 0;
    zoom.ty = fitWidthTopTy(zoom.scale);
    applyZoom(animated);
  }

  // 首開「閱讀縮放」目標 scale：桌面把頁寬放到 stage 寬的一半、手機放滿寬；不小於 Fit Page。
  function readingScale() {
    if (fitDims.w <= 0) return fitScale();
    const availW = stageEl.clientWidth || window.innerWidth;
    const frac = isMobile() ? 1 : READ_WIDTH_FRACTION_DESKTOP;
    return Math.max(fitScale(), (availW * frac) / fitDims.w);
  }
  // 觸發判準＝頁面「長:寬 ≥ 2:1」才放大貼頂（user 2026-08-23 定案；先前「Fit Page 下比閱讀寬窄就放」
  // 連 A4/報紙掃描頁 aspect ~1.4 也放大，user 嫌太激進）。近方形 / landscape / 一般 portrait 頁維持 Fit Page 整頁。
  function shouldAutoRead() {
    return allowAutoRead
      && naturalDims.w > 0 && naturalDims.h / naturalDims.w >= 2
      && readingScale() > fitScale() + 0.01;
  }
  function applyReading() {
    zoom.scale = Math.max(minScale(), Math.min(maxScale(), readingScale()));
    zoom.tx = 0;
    zoom.ty = fitWidthTopTy(zoom.scale);
  }

  // ── 右上角 minimap（所有 PDF 開檔）──────────────────────────────────────
  // 內容＝當前頁縮圖（renderPage 後從 canvasL 縮繪，翻頁自動跟）；白框＝目前 stage 可視範圍。
  // 只在「頁面被視窗裁切」（放大後溢出 stage）時顯示；整頁可見時藏（user 2026-08-23）。
  function updateCornerThumbPage() {
    if (!cornerThumbCanvas || !cornerThumbEl) return;
    if (fitDims.w <= 0 || !canvasL.width) return;
    cornerThumbCanvas.width  = 176;   // 2× 顯示寬（clamp 上限 88px）→ retina 不糊；內容小、成本可忽略
    cornerThumbCanvas.height = Math.max(1, Math.round(176 * fitDims.h / fitDims.w));
    cornerThumbCanvas.getContext('2d').drawImage(canvasL, 0, 0, cornerThumbCanvas.width, cornerThumbCanvas.height);
  }
  let thumbVisible = false;    // minimap 目前視覺狀態（進出場動畫的狀態機）
  let loaderVeilUp = false;    // 載入色塊蓋著期間 minimap 不准出現（色塊揭露完才進場，user 2026-08-23）
  // clip-reveal 進出場方向隨機四選一（user 2026-08-24，原本只上下）：inner 從該邊滑入/滑出、外層 overflow:hidden 當罩。
  // 螢幕上恆 (0,0)；離場端在該軸 ±100%（另一軸歸 0 避免對角殘留）。
  const THUMB_DIRS = [{ x: 0, y: -100 }, { x: 0, y: 100 }, { x: -100, y: 0 }, { x: 100, y: 0 }];
  const randThumbDir = () => THUMB_DIRS[Math.floor(Math.random() * THUMB_DIRS.length)];
  function updateCornerThumb() {
    if (!cornerThumbEl || !cornerThumbRect) return;
    if (fitDims.w <= 0) return;
    const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    const scaledW = fitDims.w * zoom.scale, scaledH = fitDims.h * zoom.scale;
    const cropped = scaledW > sw + 1 || scaledH > sh + 1;
    const want = cropped && !loaderVeilUp;
    if (want) {
      // 幾何即時更新（顯示中 pan/zoom 暗框直接跟、不重播進場）
      // 頁面在 stage 座標的位置（rowEl 撐滿 stage、transform-origin center → 頁中心 = stage 中心 + (tx,ty)）
      const left = (sw - scaledW) / 2 + zoom.tx;
      const top  = (sh - scaledH) / 2 + zoom.ty;
      // 寬對齊 CSS clamp(56px,12vw,88px)（JS 算免量測 reflow）＝直式/近方頁的基準寬。
      let tw = Math.max(56, Math.min(88, window.innerWidth * 0.12));
      // 橫式頁（寬>高）：把基準寬當「短邊（高）」、寬度依長寬比加寬 → minimap 不再又矮又小（user 2026-09-03）。
      if (fitDims.w > fitDims.h) tw = tw * fitDims.w / fitDims.h;
      let th = tw * fitDims.h / fitDims.w;
      // 超長直式頁高度 cap 在 stage 高 60%（太長改縮窄）；超寬橫式頁寬度 cap 176px（= thumb canvas 內建寬，超過會糊）。
      const maxH = sh * 0.6;
      if (th > maxH) { tw = maxH * fitDims.w / fitDims.h; th = maxH; }
      const maxW = 176;
      if (tw > maxW) { tw = maxW; th = tw * fitDims.h / fitDims.w; }
      cornerThumbEl.style.width = tw + 'px';
      const fl = Math.max(0, -left / scaledW),        ft = Math.max(0, -top / scaledH);
      const fr = Math.min(1, (sw - left) / scaledW),  fb = Math.min(1, (sh - top) / scaledH);
      cornerThumbRect.style.left   = (fl * tw) + 'px';
      cornerThumbRect.style.top    = (ft * th) + 'px';
      cornerThumbRect.style.width  = ((fr - fl) * tw) + 'px';
      cornerThumbRect.style.height = ((fb - ft) * th) + 'px';
    }
    if (want === thumbVisible) return;
    thumbVisible = want;
    const canTween = typeof gsap !== 'undefined' && cornerThumbInner;
    if (want) {
      cornerThumbEl.style.display = '';
      // clip-reveal 進場：inner 從隨機一邊滑入（fromTo 同時設 x/y → 清掉上次退場殘留的另一軸）
      if (canTween) {
        const d = randThumbDir();
        gsap.killTweensOf(cornerThumbInner);
        gsap.fromTo(cornerThumbInner, { xPercent: d.x, yPercent: d.y }, { xPercent: 0, yPercent: 0, duration: DUR.medium, ease: EASE.enter });
      }
    } else if (canTween) {
      // clip-reveal 退場：滑向隨機一邊、收完才藏（onComplete 檢查 thumbVisible 防退場中又進場）
      const d = randThumbDir();
      gsap.killTweensOf(cornerThumbInner);
      gsap.to(cornerThumbInner, { xPercent: d.x, yPercent: d.y, duration: DUR.base, ease: EASE.exitSoft,
        onComplete: () => { if (!thumbVisible) cornerThumbEl.style.display = 'none'; } });
    } else {
      cornerThumbEl.style.display = 'none';
    }
  }

  // 把浮水印裁切框對齊「PDF 頁面在螢幕上的矩形」→ 浮水印只蓋在頁面上、不蓋整個視窗（user 2026-08-23）。
  // clip-path 掛在未旋轉、inset:0 的外層 .pdf-watermark-clip（座標系＝stage px 好算）；內層圖樣不動＝字級恆定。
  function updateWatermarkClip() {
    if (!watermarkClipEl) return;
    if (fitDims.w <= 0) { watermarkClipEl.style.clipPath = ''; return; }
    const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    const scaledW = fitDims.w * zoom.scale, scaledH = fitDims.h * zoom.scale;
    const left = (sw - scaledW) / 2 + zoom.tx;
    const top  = (sh - scaledH) / 2 + zoom.ty;
    const l = Math.max(0, left), t = Math.max(0, top);
    const r = Math.min(sw, left + scaledW), b = Math.min(sh, top + scaledH);
    // inset(T R B L) 全 px：裁掉頁面矩形以外；頁面整個在視窗外就整片裁掉
    watermarkClipEl.style.clipPath =
      (r > l && b > t) ? `inset(${t}px ${sw - r}px ${sh - b}px ${l}px)` : 'inset(50%)';
  }

  function applyZoom(animated = false) {
    rowEl.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
    rowEl.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
    updateCornerThumb();
    updateWatermarkClip();
    const canPan = zoom.scale > fitScale() + 0.001;
    rowEl.style.cursor = isDragging
      ? `url('${sitePath('custom-cursor/drag_2.svg')}') 10 10, grabbing`
      : (canPan
          ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
          : `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`);
    updateZoomUI();
    scheduleSharpen();
  }

  // 縮放停下後把當頁重渲到「螢幕實際裝置像素」對應的解析度，避免高倍/retina 下 CSS 放大糊掉。
  // debounce：手勢/連點期間只做 CSS transform（即時但暫糊），停 160ms 後補一張清晰的。
  function scheduleSharpen() {
    // 需要更高解析度才排程（fit 或已足夠清晰就免重工）
    const dpr = window.devicePixelRatio || 1;
    const need = Math.max(RENDER_QUALITY, zoom.scale * dpr);
    if (need <= sharpenedQuality + 0.01) return;
    clearTimeout(sharpenTimer);
    sharpenTimer = setTimeout(sharpenRender, 160);
  }

  // canvas 上限保護：大頁 × 高倍會爆記憶體/超過瀏覽器限制（超過整片變空白）→ 依單邊 + 面積回退品質。
  // renderPage 首渲與 sharpenRender 共用（fitRatio/naturalDims 皆已備好時呼叫）。
  function cappedQuality(quality) {
    const fitRatio = getFitRatio();
    if (fitRatio <= 0) return quality;
    const bw = naturalDims.w * fitRatio, bh = naturalDims.h * fitRatio;
    const longSide = Math.max(bw, bh) * quality;
    if (longSide > curMaxDim) quality *= curMaxDim / longSide;
    const area = bw * quality * bh * quality;
    if (area > MAX_CANVAS_AREA) quality *= Math.sqrt(MAX_CANVAS_AREA / area);
    return quality;
  }

  async function sharpenRender() {
    if (!pdfDoc) return;
    if (rendering) { scheduleSharpen(); return; }   // 翻頁/初渲中 → 稍後重試
    const fitRatio = getFitRatio();
    if (fitRatio <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const quality = cappedQuality(Math.max(RENDER_QUALITY, zoom.scale * dpr));
    if (quality <= sharpenedQuality + 0.01) return;
    const pageNum = curPage;
    rendering = true;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: fitRatio * quality });
      const buf = document.createElement('canvas');
      buf.width = vp.width; buf.height = vp.height;
      await page.render({ canvasContext: buf.getContext('2d'), viewport: vp }).promise;
      // 翻頁/關閉搶先 → 放棄（別覆寫別頁）
      if (pageNum !== curPage || modal.style.display === 'none') return;
      // 只換點陣圖解析度；CSS 顯示尺寸(fitDims)與 rowEl transform 不動＝畫面幾何完全不變、只變清晰
      canvasL.width = vp.width; canvasL.height = vp.height;
      canvasL.style.width  = fitDims.w + 'px';
      canvasL.style.height = fitDims.h + 'px';
      canvasL.getContext('2d').drawImage(buf, 0, 0);
      sharpenedQuality = quality;
    } catch (_) {
    } finally {
      rendering = false;
      // sharpen 佔用 rendering 期間被擋掉的翻頁 → 補渲最新目標頁（同 renderPage 尾端 recovery）
      if (curPage !== pageNum && modal.style.display !== 'none') renderPage(curPage);
    }
  }

  function updateZoomUI() {
    if (!zoomPctEl) return;
    const fitRatio = getFitRatio();
    const displayPct = Math.round(zoom.scale * (fitRatio > 0 ? fitRatio : 1) * 100);
    zoomPctEl.textContent = `${displayPct}%`;
    // aria-disabled 同 chevron（Chrome 原生 disabled 吃不到自訂 not-allowed 游標）；zoomAt 有 no-op clamp
    setNavDisabled(zoomInBtn, zoom.scale >= maxScale() - 0.001);
    setNavDisabled(zoomOutBtn, zoom.scale <= minScale() + 0.001);
    // fit-toggle = Fit Page ↔ Fit Width 雙態切換（user 2026-06-02）；不 disable，icon 反映當前模式：
    // 在 Fit Width → fit_width icon；其他（Fit Page / 手動 zoom）→ fit_to_viewport icon
    if (fitToggleBtn) {
      const fitIcon = fitToggleBtn.querySelector('.icon');
      if (fitIcon) {
        // icon 顯示「下一個動作」（user 2026-06-03）：在 Fit Width → fit_to_viewport（點了回 Fit Page）；
        // 否則（Fit Page / 手動 zoom）→ fit_width（點了切 Fit Width）
        const w = isFitWidth();
        fitIcon.classList.toggle('icon-fit-viewport', w);
        fitIcon.classList.toggle('icon-fit-width', !w);
      }
    }
  }

  function clampPan() {
    if (zoom.scale <= fitScale() + 0.001) { zoom.tx = 0; zoom.ty = 0; return; }
    const sr = stageEl.getBoundingClientRect();
    const scaledW = fitDims.w * zoom.scale;
    const scaledH = fitDims.h * zoom.scale;
    const maxTx = Math.max(0, (scaledW - sr.width)  / 2);
    const maxTy = Math.max(0, (scaledH - sr.height) / 2);
    zoom.tx = Math.max(-maxTx, Math.min(maxTx, zoom.tx));
    zoom.ty = Math.max(-maxTy, Math.min(maxTy, zoom.ty));
  }

  // 在 (clientX, clientY) 為焦點縮放（zoom-button 用 stage 中心）— 完全比照 album zoomAt
  function zoomAt(clientX, clientY, factor, animated = false) {
    const sr = stageEl.getBoundingClientRect();
    const cx = clientX - sr.left;
    const cy = clientY - sr.top;
    const sw = sr.width, sh = sr.height;
    const imgX = (cx - sw / 2 - zoom.tx) / zoom.scale;
    const imgY = (cy - sh / 2 - zoom.ty) / zoom.scale;
    const newScale = Math.max(minScale(), Math.min(maxScale(), zoom.scale * factor));
    if (Math.abs(newScale - zoom.scale) < 0.0001) return;
    zoom.tx = cx - sw / 2 - imgX * newScale;
    zoom.ty = cy - sh / 2 - imgY * newScale;
    zoom.scale = newScale;
    clampPan();
    applyZoom(animated);
  }

  function zoomAtStageCenter(factor, animated = false) {
    const r = stageEl.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor, animated);
  }

  function zoomToScale(targetScale, animated = false) {
    targetScale = Math.max(minScale(), Math.min(maxScale(), targetScale));
    if (Math.abs(targetScale - zoom.scale) < 0.0001) return;
    zoomAtStageCenter(targetScale / zoom.scale, animated);
  }

  function resetToFit(animated = false)    { zoomToScale(fitScale(),    animated); }

  // ── 載入色塊（取代舊 LQIP 馬賽克墊圖）─────────────────────────────────────
  // 三原色隨機不重複；render 完成前每 1s 換色（新色從隨機一邊 clip-reveal 掃入），完成後隨機四方向 clip-reveal 揭露頁面。
  function pickLoaderColor() {
    let i;
    do { i = Math.floor(Math.random() * LOADER_COLORS.length); } while (i === lastColorIdx);
    lastColorIdx = i;
    return LOADER_COLORS[i];
  }
  // 隨機四方向 inset（全 % — 混單位 GSAP 會直接跳終值，見 lightbox-shell memory）。
  // 揭露用作「收往該邊」終值；換色 swipe 用作「從該邊掃入」起值。
  const LOADER_DIRS = ['inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
  // 換色不 snap：新色在 swipe 子層從隨機一邊 clip-reveal 掃入、掃完落定到底層背景（user 2026-09-01）
  function swipeLoaderColor() {
    const c = pickLoaderColor();
    // 色塊還沒顯示（等真尺寸）或無 gsap → 掃入沒人看得到，直接換底色
    if (!colorSwipeEl || typeof gsap === 'undefined' || colorLoaderEl.style.display === 'none') {
      colorLoaderEl.style.background = c;
      return;
    }
    gsap.killTweensOf(colorSwipeEl);
    if (colorSwipeEl.style.display !== 'none') colorLoaderEl.style.background = colorSwipeEl.style.background;   // 前一掃未完→先落定
    colorSwipeEl.style.background = c;
    colorSwipeEl.style.display = '';
    gsap.fromTo(colorSwipeEl,
      { clipPath: LOADER_DIRS[Math.floor(Math.random() * LOADER_DIRS.length)] },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.slow, ease: EASE.enter,
        onComplete: () => { colorLoaderEl.style.background = c; colorSwipeEl.style.display = 'none'; } });
  }
  // 頁面比例快取（localStorage）：無預產封面的 ref/會議紀錄 PDF，第一次 render 時記下第一頁真尺寸，
  // 之後再開同檔＝open 即真實比例（跟 documents 封面同邏輯、零跳動）；只有首次開才退 A4 猜（user 2026-08-28）。
  const PDF_DIMS_KEY = 'sccdPdfPageDims';
  function getCachedPdfDims(url) {
    try { return JSON.parse(localStorage.getItem(PDF_DIMS_KEY) || '{}')[url] || null; } catch { return null; }
  }
  function setCachedPdfDims(url, w, h) {
    if (!url || !(w > 0) || !(h > 0)) return;
    try {
      const m = JSON.parse(localStorage.getItem(PDF_DIMS_KEY) || '{}');
      m[url] = [Math.round(w), Math.round(h)];
      localStorage.setItem(PDF_DIMS_KEY, JSON.stringify(m));
    } catch { /* 隱私模式/quota 失敗＝下次照樣 A4 猜，無害 */ }
  }

  // render 算出真頁面 naturalDims/fitDims + fit/reading 決策後（bitmap render 之前）把載入色塊改成
  // 「真頁面在螢幕上的可視矩形」＝色塊必 == 頁面。修 open 時只能靠裁頂 1.5 封面猜 reading、真頁 aspect<2
  // 走 Fit Page 時的失配（色塊放大但頁面沒放大 / 色塊寬度不 fit press，user 2026-08-24）。
  // 用 render 自己的 shouldAutoRead/readingScale/fitDims 校準（跟 renderPage 同一套數字，保證一致）。
  // 只在載入色塊還蓋著時（loaderActive）做；翻頁時 loader 已收＝no-op。
  function sizeLoaderToPage() {
    if (!colorLoaderEl || !loaderActive) return;
    if (fitDims.w <= 0) return;
    setCachedPdfDims(curPdfUrl, naturalDims.w, naturalDims.h);   // loaderActive 期間必是第一頁＝封面尺寸
    const sw = stageEl.clientWidth || window.innerWidth;
    const sh = stageEl.clientHeight || window.innerHeight * 0.8;
    let vw, vh, left, top;
    if (shouldAutoRead()) {   // 閱讀縮放：寬 = fitDims.w×scale、貼頂、水平置中、溢出高度裁到 stage（鏡像 applyReading）
      const s = Math.max(minScale(), Math.min(maxScale(), readingScale()));
      const scaledH = fitDims.h * s;
      vw = fitDims.w * s;
      vh = Math.min(scaledH, sh);
      left = (sw - vw) / 2;
      top  = scaledH >= sh ? 0 : (sh - scaledH) / 2;
    } else {                  // Fit Page：整頁置中（scale 1）
      vw = fitDims.w; vh = fitDims.h;
      left = (sw - vw) / 2; top = (sh - vh) / 2;
    }
    colorLoaderEl.style.left   = left + 'px';
    colorLoaderEl.style.top    = top + 'px';
    colorLoaderEl.style.width  = vw + 'px';
    colorLoaderEl.style.height = vh + 'px';
    colorLoaderEl.style.display = '';   // 非 press 無封面時 open 先藏著 → 這裡確保顯示
  }

  function startColorLoader() {
    if (!colorLoaderEl) return;
    loaderActive = true;
    loaderReady = false;
    loaderVeilUp = true;   // 色塊蓋著期間 minimap 不出現（揭露完 hide() 才放行）
    lastColorIdx = -1;
    // loading 期間不顯示浮水印（user 2026-08-23）：浮水印是 .pdf-zoom-stage 全幅覆蓋(z20，蓋在色塊之上)，
    // 色塊只有頁面大小 → 不藏的話浮水印會蓋到色塊外圍看起來「跑到 pdf 外」。揭露時才 fade 回來。
    if (watermarkEl) { if (typeof gsap !== 'undefined') gsap.killTweensOf(watermarkEl); watermarkEl.style.opacity = '0'; }
    if (typeof gsap !== 'undefined') { gsap.killTweensOf(colorLoaderEl); if (colorSwipeEl) gsap.killTweensOf(colorSwipeEl); }
    colorLoaderEl.style.clipPath = '';
    if (colorSwipeEl) { colorSwipeEl.style.display = 'none'; colorSwipeEl.style.clipPath = ''; colorSwipeEl.style.background = ''; }
    colorLoaderEl.style.background = pickLoaderColor();   // 第一個色塊備好（尺寸未知前先藏）
    // ⭐尺寸一律等「真頁面可視矩形」算出才顯示，不在 open 時猜（press 裁頂 1.5 封面看不出真 aspect →
    // 猜 reading 對 <2 的頁會太大，user 2026-08-24「色塊太大、pdf 沒那麼大」）。誰負責顯示：
    //  • 非 press：cover onload 用真封面 fit 尺寸撐好才顯示（封面非裁頂＝準）。
    //  • press / 所有情況：renderPage 的 sizeLoaderToPage 用 render 真數字定尺寸才顯示（精準、恆不太大）。
    // 代價：press 在 getDocument 網路窗（通常很短）色塊還沒出現；modal 淡入 + chrome 已是「載入中」訊號（要精準勝過即時）。
    colorLoaderEl.style.display = 'none';
    scheduleColorTick();
  }
  // 每 1s 一 tick：render 未完成→換色續轉；已完成→在此 1s 邊界揭露（＝當前色塊必走滿 1s，user 要求）
  function scheduleColorTick() {
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(() => {
      if (!loaderActive) return;
      if (loaderReady) { revealColorLoader(); return; }
      swipeLoaderColor();
      scheduleColorTick();
    }, 1000);
  }
  function revealColorLoader() {
    if (!colorLoaderEl) return;
    loaderActive = false;
    clearTimeout(loaderTimer);
    // 頁面揭露時才把浮水印 fade 回來（loading 期間藏著；press/會議紀錄等無浮水印的 wantWatermark=false 就不動）
    if (wantWatermark && watermarkEl) {
      if (typeof gsap !== 'undefined') gsap.fromTo(watermarkEl, { opacity: 0 }, { opacity: 1, duration: DUR.slow, ease: EASE.enter });
      else watermarkEl.style.opacity = '1';
    }
    const hide = () => {
      colorLoaderEl.style.display = 'none'; colorLoaderEl.style.clipPath = ''; colorLoaderEl.style.background = '';
      if (colorSwipeEl) { colorSwipeEl.style.display = 'none'; colorSwipeEl.style.clipPath = ''; colorSwipeEl.style.background = ''; }
      loaderVeilUp = false;
      updateCornerThumb();   // 色塊揭露完 → minimap 若該出現（頁被裁切）此刻才 clip-reveal 進場
    };
    if (typeof gsap === 'undefined') { hide(); return; }
    // swipe 若還在掃（理論上 0.6s < 1s tick 已掃完，防萬一）：殺掉並落定其色再整塊揭露
    if (colorSwipeEl && colorSwipeEl.style.display !== 'none') {
      gsap.killTweensOf(colorSwipeEl);
      colorLoaderEl.style.background = colorSwipeEl.style.background;
      colorSwipeEl.style.display = 'none';
    }
    // 隨機四方向：色塊往該邊收
    gsap.fromTo(colorLoaderEl,
      { clipPath: 'inset(0% 0% 0% 0%)' },
      { clipPath: LOADER_DIRS[Math.floor(Math.random() * LOADER_DIRS.length)], duration: DUR.slow, ease: EASE.enter, onComplete: hide });
  }
  function stopColorLoader() {
    loaderActive = false;
    loaderReady = false;
    loaderVeilUp = false;
    clearTimeout(loaderTimer);
    if (!colorLoaderEl) return;
    if (typeof gsap !== 'undefined') { gsap.killTweensOf(colorLoaderEl); if (colorSwipeEl) gsap.killTweensOf(colorSwipeEl); }
    colorLoaderEl.style.display = 'none';
    colorLoaderEl.style.clipPath = '';
    colorLoaderEl.style.background = '';
    if (colorSwipeEl) { colorSwipeEl.style.display = 'none'; colorSwipeEl.style.clipPath = ''; colorSwipeEl.style.background = ''; }
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || rendering) return false;
    rendering = true;
    try {

    // 先對齊 logo 下緣（再讀 stageEl.clientHeight，下方讀取會強制 reflow 拿到正確高度）
    positionPdfStageRelativeToLogo();

    const totalPages = pdfDoc.numPages;
    const isFirstRender = naturalDims.w === 0;
    // 只有 Actual 這個「具名模式」跨頁維持；Fit Width / fit / 閱讀縮放 / 手動一律 per-page auto 重新決定（見下）。
    // ⭐Fit Width 不再跨頁維持（user 2026-08-24）：Fit Width 是「看近這一頁」的臨時動作，翻頁應 reset 回該頁預設 fit。
    // 用「舊」fitDims 判斷（此時尚未更新）。首開（isFirstRender）走 else 分支依 aspect 自動決定 fit / 閱讀縮放。
    const wasActual   = !isFirstRender && Math.abs(zoom.scale - actualScale()) < 0.001;

    const page = await pdfDoc.getPage(pageNum);
    const availH = stageEl.clientHeight || window.innerHeight * 0.8;
    const availW = stageEl.clientWidth || window.innerWidth;  // 填滿整個 stage 寬（不再 *0.92；px-32 已留 chevron clearance，user 2026-06-03 要 Fit Width 頂到邊）
    const base = page.getViewport({ scale: 1 });
    naturalDims = { w: base.width, h: base.height };
    // Fit Page（仿 Adobe Acrobat「適合頁面」）：整頁塞滿視窗，可放大可縮小，無「不放大」上限。
    // 跟 album 點陣圖不同 — PDF 是向量，放大是重新 render（crisp 不糊，配 RENDER_QUALITY=2）；
    // 小 PDF（A4 595×842 @96dpi）因此能撐滿，而非浮在大黑底中間（user 2026-06-02）。
    const fitFactor = Math.min(availH / base.height, availW / base.width);
    fitDims = { w: base.width * fitFactor, h: base.height * fitFactor };

    // 載入色塊校準到「真頁面可視矩形」（bitmap render 之前先做）：修 open 時 press 賭 reading、
    // 但真頁 aspect<2 走 Fit Page 造成的「色塊放大/寬度不符頁面」失配（user 2026-08-24）。
    sizeLoaderToPage();

    // 首渲品質：一般頁用 RENDER_QUALITY(2) 快出、再靠 sharpen 補；但**會自動閱讀縮放的頁**首渲就直接渲到
    // 閱讀縮放需要的解析度（= readingScale × DPR），避免「先糊一下再變清晰」那段空窗——低解析掃描長頁在
    // 該空窗被 CSS 放大特別糊、user 2026-08-23 反映「圖太糊看不清字」。sharpen 之後判 need<=已渲品質即免重工。
    const dpr = window.devicePixelRatio || 1;
    const initQuality = shouldAutoRead()
      ? cappedQuality(Math.max(RENDER_QUALITY, readingScale() * dpr))
      : RENDER_QUALITY;
    // 內部 buffer 多渲給 zoom 用；CSS 鎖在 fit 顯示尺寸
    const vp = page.getViewport({ scale: fitFactor * initQuality });
    // 雙緩衝：先渲到暫存 canvas、完成才換上。設 canvas 寬高會立刻清空畫面，
    // 大掃描 PDF 抓頁＋解碼要等，直接渲在可見 canvas 上會讓翻頁白一段（user 2026-08-08）
    const buf = document.createElement('canvas');
    buf.width  = vp.width;
    buf.height = vp.height;
    await page.render({ canvasContext: buf.getContext('2d'), viewport: vp }).promise;
    canvasL.width  = vp.width;
    canvasL.height = vp.height;
    canvasL.style.width  = fitDims.w + 'px';
    canvasL.style.height = fitDims.h + 'px';
    if (renderedContentEl) {
      renderedContentEl.style.width = fitDims.w + 'px';
      renderedContentEl.style.height = fitDims.h + 'px';
    }
    canvasL.getContext('2d').drawImage(buf, 0, 0);
    canvasL.style.visibility = '';        // 頁面已畫上 → 顯示（open 時暫藏避免 stale 白矩形，翻頁時已 visible 為 no-op）
    clearTimeout(sharpenTimer);           // 作廢上一頁的 sharpen 排程
    sharpenedQuality = initQuality;       // 首渲已到閱讀縮放解析度時，sharpen 判 need<=此值即免重工
    updateCornerThumbPage();              // minimap 縮圖跟當前頁同步（翻頁即換）

    // 跨頁 state：只有 Actual 跨頁「維持」；其餘（首開 / Fit Page / Fit Width / 閱讀縮放 / 任意手動 zoom）
    // 一律走 auto——**每頁依自己的 aspect 重新決定 fit vs 閱讀縮放**。翻頁即 reset（含 Fit Width，user 2026-08-24）。
    // ⚠️關鍵（user 2026-08-23）：press 多頁常混排（首頁 landscape banner + 內頁 portrait），
    // 若像以前把「首頁 fit」跨頁沿用，portrait 內頁會卡在 fit 不放大；per-page auto 才對。
    if (wasActual) {
      zoom.scale = actualScale();
      zoom.tx = 0; zoom.ty = 0;
    } else {
      // 偏長 / portrait 頁：仿 Acrobat「閱讀縮放」貼頂放大、往下捲即讀；近方形 / landscape 頁維持 Fit Page 整頁。
      if (shouldAutoRead()) applyReading();
      else { zoom.scale = fitScale(); zoom.tx = 0; zoom.ty = 0; }
    }
    applyZoom(false);

    pageInfo.textContent = `${pageNum} / ${totalPages}`;
    setNavDisabled(prevBtn, pageNum <= 1);
    setNavDisabled(nextBtn, pageNum >= totalPages);
    rendering = false;
    // 等新 canvas 已繪製後才換水印位置，避免翻頁時先動一次水印、再出新頁面。
    if (wantWatermark) {
      requestAnimationFrame(() => {
        if (curPage === pageNum) repositionScreenWatermark(modal.querySelector('.pdf-watermark'));
      });
    }
    // 渲染期間又翻了頁（該次 renderPage 被 rendering guard 擋掉、curPage 已前進）→ 補渲染最新目標頁
    if (curPage !== pageNum) renderPage(curPage);
    } catch (err) {
      // getPage / render 失敗（壞檔/損頁）：重置 rendering 並回報失敗讓 caller 收拾——否則 rendering 卡在 true，
      // 之後所有 render 被開頭 guard 擋掉、色塊 loader 的 loaderReady 永不設＝每秒換色卡死（soft-lock，2026-08-24 抓到）。
      console.error('PDF page render error:', err);
      rendering = false;
      return false;
    }
    // 成功：rendering 已在 try 內（recovery 之前）設回 false，這裡別再動，否則會在遞迴補渲染 in-flight 時誤清
    return true;
  }

  // 上一/下一頁（一頁一頁翻，邊界自動 clamp）
  function turnPage(dir) {
    if (!pdfDoc) return;
    if (dir > 0 && navDisabled(nextBtn)) return;
    if (dir < 0 && navDisabled(prevBtn)) return;
    curPage = Math.max(1, Math.min(pdfDoc.numPages, curPage + dir));
    renderPage(curPage);
  }

  // 旋轉角度範圍 ±1~±3°（user 偏好 PDF/album lightbox 標題 pill 比 section-btn 角度小）
  function smallRot() { return (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2); }

  // mode3（彩色背景）：去掉三原色，pill 一律白底黑字（對比 lightbox 黑底）。
  // 跟 activities-lightbox.js resolvePillColor 同款 — PDF viewer 也是黑遮罩 host，白 pill 必定可見。
  function resolvePillColor(color) {
    if (document.body.classList.contains('mode-color')) return '#FFFFFF';
    return color || '#00FF80';
  }

  function renderTitle(title, color) {
    if (!titleEl) return;
    if (!title || (!title.en && !title.zh)) {
      titleEl.style.display = 'none';
      titleEl.innerHTML = '';
      if (backPill) backPill.style.height = '';
      return;
    }
    const bg = resolvePillColor(color);
    // 結構：pill > window(overflow:hidden) > track > unit(EN+ZH column-stacked)
    // EN+ZH 為單一 marquee unit 同步捲動（不是兩行各自 marquee 失同步）；max-width 防 Press 長標題撐爆 layout
    titleEl.innerHTML = `
      <span class="pdf-title-pill" style="display:inline-block;background:${bg};color:#000;padding:6px 8px 5px;font-weight:700;font-size:var(--font-size-s);line-height:1.2;transform:rotate(${smallRot()}deg);transform-origin:center;max-width:min(40vw, 360px);box-sizing:border-box;">
        <span class="pdf-title-window" style="display:block;overflow:hidden;">
          <span class="pdf-title-track" style="display:inline-block;white-space:nowrap;will-change:transform;">
            <span class="pdf-title-unit" style="display:inline-flex;flex-direction:column;align-items:flex-start;white-space:nowrap;vertical-align:top;">
              ${title.en ? `<span>${title.en}</span>` : ''}
              ${title.zh ? `<span>${title.zh}</span>` : ''}
            </span>
          </span>
        </span>
      </span>`;
    titleEl.style.display = 'block';
    requestAnimationFrame(() => {
      syncBackBtnHeight();
      positionRefBtn();
      positionTitle();
      positionSharePdf();
      setupTitleMarquee();
    });
  }

  // EN+ZH 整組（unit）為單位 dual-copy seamless loop；同 activities-lightbox.setupTitleMarquee
  function setupTitleMarquee() {
    if (!titleEl) return;
    const win   = titleEl.querySelector('.pdf-title-window');
    const track = /** @type {HTMLElement | null} */ (titleEl.querySelector('.pdf-title-track'));
    if (!win || !track) return;
    if (typeof gsap !== 'undefined') gsap.killTweensOf(track);
    track.style.transform = '';
    while (track.children.length > 1) track.removeChild(track.lastElementChild);
    const unit = /** @type {HTMLElement | null} */ (track.querySelector('.pdf-title-unit'));
    if (!unit) return;
    const unitWidth = unit.getBoundingClientRect().width;
    const winWidth  = /** @type {HTMLElement} */ (win).clientWidth;
    if (unitWidth <= winWidth + 4) return;
    const clone = /** @type {HTMLElement} */ (unit.cloneNode(true));
    clone.style.marginLeft = '24px';
    track.appendChild(clone);
    const distance = unitWidth + 24;
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(track, { x: 0 }, {
        x: -distance, duration: Math.max(3, distance / 80), ease: 'none', repeat: -1,
      });
    }
  }

  function renderBackPill(color) {
    if (!backPill) return;
    const bg = resolvePillColor(color);
    backPill.style.background = bg;
    backPill.style.transform  = `rotate(${smallRot()}deg)`;
    // ref btn 共用同 accent；旋轉角度 0（避免兩 pill 同時亂轉視覺雜訊）
    refUi.setColor(bg);
  }

  // Share btn（library press/files PDF 專用）：caller 帶 shareUrl 才顯示，套全站 share modal（[data-share-btn] delegation）。
  // data-share-url 讓 share-modal.computeShareUrl 直接用此網址（QR + 複製）；底色同 back/ref accent，不旋轉保持端正。
  function renderSharePdf(color, shareUrl) {
    if (!shareBtnEl || !sharePillEl) return;
    if (!shareUrl) {
      shareBtnEl.style.display = 'none';
      delete shareBtnEl.dataset.shareUrl;
      return;
    }
    shareBtnEl.style.display = '';
    shareBtnEl.dataset.shareUrl = shareUrl;
    const pillBg = resolvePillColor(color);
    sharePillEl.style.background = pillBg;
    // 分享卡片底色跟 title 渲染色一致（mode-color 下 = 白，同 title）
    shareBtnEl.dataset.shareBg = pillBg;
  }

  // title pill 高度由 EN+ZH 兩行自然撐，back/ref pill follow title 高度（user 2026-06-01 拍板）
  // 之前曾嘗試 back/ref 鎖 44×44 但同 viewer 內 back 比 title 矮太多視覺不協調 → 改回 sync
  // width = min(44, h)：單行 title（h<44）→ 縮成正方形（以短邊 h 為主、砍左右 padding，user 2026-06-03）；
  //   兩行（h≥44）→ 維持 44 寬（高>寬、跟著 title 拉長）。避免單行時 44寬×33高 變橫向矩形被壓扁。
  // title 隱藏時 reset 回預設 44×44 正方形（顯式寫 '44px' 不用 ''，否則連 HTML inline 預設一起清掉 → 變 icon 高）
  function syncBackBtnHeight() {
    if (!backPill) return;
    const refPill = /** @type {HTMLElement | null} */ (refUi.btnEl.querySelector('.lightbox-ref-btn-pill'));
    const pill = titleEl && titleEl.querySelector('.pdf-title-pill');
    if (!pill || titleEl.style.display === 'none') {
      backPill.style.height = '44px'; backPill.style.width = '44px';
      if (refPill) { refPill.style.height = '44px'; refPill.style.width = '44px'; }
      if (sharePillEl) { sharePillEl.style.height = '44px'; sharePillEl.style.width = '44px'; }
      return;
    }
    // offsetHeight 含 padding，跟 visual bbox 一致（rotation 不影響 offsetHeight）
    const h = /** @type {HTMLElement} */ (pill).offsetHeight;
    if (h > 0) {
      const w = Math.min(44, h);   // 以短邊為主：單行縮成正方形、兩行維持 44 寬
      backPill.style.height = h + 'px'; backPill.style.width = w + 'px';
      if (refPill) { refPill.style.height = h + 'px'; refPill.style.width = w + 'px'; }
      if (sharePillEl) { sharePillEl.style.height = h + 'px'; sharePillEl.style.width = w + 'px'; }
    }
  }

  // 三 pill 統一 gap：back ↔ ref ↔ title 都 PILL_GAP 像素
  const PILL_GAP = 20;

  // ref btn 緊接 back btn 右邊
  function positionRefBtn() {
    if (!backBtn || refUi.btnEl.style.display === 'none') return;
    const backRect = backBtn.getBoundingClientRect();
    refUi.btnEl.style.left = (backRect.right + PILL_GAP) + 'px';
  }

  // title 跟「最右側 pill（ref btn 有就 ref，沒就 back）」固定 gap
  // 不對齊 PDF 本身，避免 PDF 寬度變化時 title 飄
  function positionTitle() {
    if (!titleEl || titleEl.style.display === 'none') return;
    if (!backBtn) return;
    const hasRef = refUi.btnEl.style.display !== 'none';
    const anchorRect = hasRef
      ? refUi.btnEl.getBoundingClientRect()
      : backBtn.getBoundingClientRect();
    titleEl.style.left = (anchorRect.right + PILL_GAP) + 'px';
  }

  // share btn 緊接 title 右邊；title 隱藏時退而錨到 ref / back（保持與 back/ref/title 同 gap）
  function positionSharePdf() {
    if (!shareBtnEl || shareBtnEl.style.display === 'none') return;
    let anchor = null;
    if (titleEl && titleEl.style.display !== 'none') anchor = titleEl;
    else if (refUi.btnEl.style.display !== 'none') anchor = refUi.btnEl;
    else anchor = backBtn;
    if (!anchor) return;
    shareBtnEl.style.left = (anchor.getBoundingClientRect().right + PILL_GAP) + 'px';
  }

  // 把 stage 上緣推到 header logo 底邊以下，鏡像 activities-lightbox positionUIRelativeToLogo
  // （讓 PDF fit 高度 == album fit 高度；user 2026-06-02 拍板「PDF 對齊 album」）。
  // SHELL_PT=24：lightbox-shell padLightboxTops 已給 modal root 加 1.5rem(24px)，這裡扣回避免雙重下推
  // → 淨 gap = logoBottom + ZOOM_GAP(36)。無 logo 時 early return，main row 維持原 py-xl 上緣。
  // ZOOM_GAP 36：對齊 atlas 歷屆教師 nav btn 與 logo 底邊的距離（user 2026-08-24 嫌太靠近 logo；實測 atlas 36px）。
  function positionPdfStageRelativeToLogo() {
    // 手機：單頁置中，padding-top 推到手機 logo 底邊下方（避免頁面上緣被 logo 蓋；控制列在底部 bar 不在此處理）
    if (isMobile()) {
      const mlogo = document.querySelector('#header-logo-mobile');
      const r = mlogo ? mlogo.getBoundingClientRect() : null;
      if (mainRowEl) mainRowEl.style.paddingTop = `${(r && r.height) ? r.bottom + 12 : 88}px`;
      return;
    }
    const logo = document.querySelector('#header-logo');
    if (!logo || !mainRowEl) return;
    const ZOOM_GAP = 36;
    const SHELL_PT = 24;
    mainRowEl.style.paddingTop = `${Math.max(0, logo.getBoundingClientRect().bottom + ZOOM_GAP - SHELL_PT)}px`;
  }

  // ══ 手機版觸控手勢（沿用桌面單頁引擎 renderPage / zoomAt / clampPan / turnPage，不另建渲染路徑）═══════════
  // user 2026-06-10：一次一頁、上下滑換頁、放大時單指拖曳平移、雙指 pinch 縮放（無縮放鈕）；控制列維持底部。
  // 桌面/手機都跑 renderPage（單頁 + transform 縮放），手機只多這層 touch → 既有 zoom/pan/turn 全 reuse。
  const isMobile = () => window.innerWidth < 768;
  const SWIPE_THRESHOLD = 50;   // 換頁所需垂直位移 px（小於此視為點按、不換頁）

  let touchMode = null;         // 'pinch' | 'pan' | 'swipe'（touchstart 依手指數 + 是否已放大決定）
  let pinchStartDist = 0, pinchStartScale = 1;
  let touchPanStart = { x: 0, y: 0, tx: 0, ty: 0 };
  let swipeStartX = 0, swipeStartY = 0;
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchMid  = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

  stageEl.addEventListener('touchstart', (e) => {
    if (!isMobile() || !pdfDoc) return;
    if (e.touches.length === 2) {
      touchMode = 'pinch';
      pinchStartDist = touchDist(e.touches);
      pinchStartScale = zoom.scale;
    } else if (e.touches.length === 1) {
      if (zoom.scale > fitScale() + 0.001) {           // 已放大 → 單指拖曳平移
        touchMode = 'pan';
        touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: zoom.tx, ty: zoom.ty };
      } else {                                          // fit → 記錄起點，touchend 判斷上下滑換頁
        touchMode = 'swipe';
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
      }
    }
  }, { passive: false });

  stageEl.addEventListener('touchmove', (e) => {
    if (!touchMode) return;
    if (touchMode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const target = Math.max(minScale(), Math.min(maxScale(), pinchStartScale * (touchDist(e.touches) / pinchStartDist)));
      const mid = touchMid(e.touches);
      zoomAt(mid.x, mid.y, target / zoom.scale, false);   // 以雙指中點為焦點縮放（沿用桌面 zoomAt 焦點數學）
    } else if (touchMode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      zoom.tx = touchPanStart.tx + (e.touches[0].clientX - touchPanStart.x);
      zoom.ty = touchPanStart.ty + (e.touches[0].clientY - touchPanStart.y);
      clampPan();
      applyZoom(false);
    } else if (touchMode === 'swipe') {
      e.preventDefault();   // 吞掉 iOS overscroll；換頁在 touchend 判定
    }
  }, { passive: false });

  stageEl.addEventListener('touchend', (e) => {
    if (touchMode === 'swipe' && e.changedTouches.length) {
      const dy = e.changedTouches[0].clientY - swipeStartY;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      // 垂直為主且超過門檻才換頁：上滑(dy<0)下一頁、下滑(dy>0)上一頁（同捲動方向，往下讀=往上滑）
      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) turnPage(dy < 0 ? 1 : -1);
    }
    if (e.touches.length === 0) touchMode = null;
    else if (touchMode === 'pinch' && e.touches.length === 1) touchMode = null;  // 雙指剩一指→結束 pinch（不接 pan 免跳動）
  }, { passive: false });

  function openModal() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
    // header bars hide + logo 切 inverse + footer-hide state 清零，全交給 enterLightboxMode
    enterLightboxMode();
  }

  // （2026-07-04 起 ref btn 跳轉不再 await 此函式：關閉 fadeout 與 SPA 換頁並行，統一 ref timing）
  function closeModal() {
    openToken++;   // 作廢還在路上的開場（close 後才回來的 getDocument 不得畫上）
    stopColorLoader();   // 停載入色塊循環 + 揭露 tween
    modal.style.opacity = '0';
    // exitLightboxMode：show bars + 移除 body.lightbox-open → theme-toggle MutationObserver
    // 自動把 logo 切回 standard/inverse/wireframe（依當前 mode）
    exitLightboxMode();
    // 停 title marquee tween（同 activities-lightbox cleanup）
    if (typeof gsap !== 'undefined' && titleEl) {
      titleEl.querySelectorAll('.pdf-title-track').forEach(el => gsap.killTweensOf(el));
    }
    return new Promise(resolve => {
      setTimeout(() => {
        modal.style.display = 'none';
        touchMode = null;        // 清手機觸控手勢狀態
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        rendering = false;               // 防「render 卡在 in-flight 就關閉」→ rendering 殘留 true 讓下次開檔 render 被 guard 擋掉
        clearTimeout(sharpenTimer);      // 停還沒跑的 sharpen 重渲
        sharpenedQuality = RENDER_QUALITY;
        pageInfo.textContent = '';   // 下次 open 等新總頁數，不殘留舊值
        canvasL.getContext('2d').clearRect(0, 0, canvasL.width, canvasL.height);
        // reset 內部狀態（下次 open 重新計 fitDims/naturalDims）
        zoom = { scale: 1, tx: 0, ty: 0 };
        fitDims = { w: 0, h: 0 };
        naturalDims = { w: 0, h: 0 };
        applyZoom(false);
        renderTitle(null);
        refUi.reset();
        resolve();
      }, 300);
    });
  }

  _pdfListenerAdded = true;

  document.addEventListener('sccd:open-pdf', async (e) => {
    const { pdfUrl, title, color, references, shareUrl, watermark, cover, maxCanvasDim, coverAspect, autoRead } = e.detail || {};
    if (!pdfUrl) return;
    wantWatermark = !!watermark;
    allowAutoRead = !!autoRead;   // 只有 press 帶 autoRead → 首開閱讀縮放；documents 等不帶 → 恆 Fit Page
    // 右上角 minimap：所有開檔都有（press + documents，user 2026-08-23；detail.cornerThumb 旗標已退役）。
    // 先藏並重置進出場狀態機，等色塊揭露完＋頁被裁切才 clip-reveal 進場。
    if (cornerThumbEl) {
      cornerThumbEl.style.display = 'none';
      thumbVisible = false;
      if (typeof gsap !== 'undefined' && cornerThumbInner) gsap.killTweensOf(cornerThumbInner);
    }
    curMaxDim = maxCanvasDim || MAX_CANVAS_DIM;   // press 帶更高上限 → 高倍更清晰；其他維持預設
    curPdfUrl = pdfUrl;
    curPage = 1;
    // 重置內部狀態：naturalDims=0 讓 renderPage 視為「初次 render」自動套 actual size
    zoom = { scale: 1, tx: 0, ty: 0 };
    fitDims = { w: 0, h: 0 };
    naturalDims = { w: 0, h: 0 };
    renderTitle(title, color);
    renderBackPill(color);
    // Share btn：caller 帶 shareUrl（library press/files）才顯示；同 accent 底色
    renderSharePdf(color, shareUrl);
    // ref 接口：references 為 array of { section, itemId, labelEn, labelZh, titleEn, titleZh }
    // 無 references 或空 array → ref btn 自動不渲染
    refUi.setReferences(references);
    openModal();
    if (wantWatermark) buildWatermark();   // 只有 document/files PDF 建浮水印（字體必載好 + 依當前 viewport 給手機較小較密版）
    // 等 modal 顯示 + back btn 量到 rect 才 position ref / share btn（與 title 用同一 rAF cadence 對齊）
    requestAnimationFrame(() => { positionRefBtn(); positionSharePdf(); });

    // 頁碼等 getDocument 拿到總頁數才顯示（先清空，避免「舊值→新值」跳兩次，user 2026-08-08）
    pageInfo.textContent = '';
    setNavDisabled(prevBtn, true);
    setNavDisabled(nextBtn, true);

    const myToken = ++openToken;
    // 先清掉上一本殘留頁面（載入色塊會蓋住，仍清掉以免揭露瞬間閃到舊頁）
    canvasL.getContext('2d').clearRect(0, 0, canvasL.width, canvasL.height);
    // canvas 先藏：非 press 又無封面時色塊整段藏著（等 renderPage 才知尺寸），此時 bg-white 的 canvas 會殘留
    // 上一本的 stale 尺寸＝黑底上閃一塊「錯尺寸白矩形」（2026-08-24 workflow 抓到）。renderPage 畫好頁面才顯示。
    canvasL.style.visibility = 'hidden';
    // 先把 stage 對齊 logo 下緣（renderPage 也會跑、idempotent）：cover onload / sizeLoaderToPage 讀
    // stageEl.clientHeight 才是「最終」高度，色塊尺寸不受 padding-top 之後變動影響（user 2026-08-24）。
    positionPdfStageRelativeToLogo();
    // 載入色塊：每秒換三原色蓋住頁面直到 render 完成（取代舊 LQIP 馬賽克墊圖）。open 時先藏——
    // 由 cover onload（有封面，真封面 fit）／A4 猜測（無封面文件）／sizeLoaderToPage（render 真數字）定尺寸才顯示。
    startColorLoader();
    // 色塊 Fit Page 置中矩形（stage 絕對定位 overlay、render 不碰＝零跳）；pw/ph 只取比例
    const showLoaderFitRect = (pw, ph) => {
      const availH = stageEl.clientHeight || window.innerHeight * 0.8;
      const availW = stageEl.clientWidth || window.innerWidth;
      const f = Math.min(availH / ph, availW / pw);
      const cw = pw * f, ch = ph * f;
      colorLoaderEl.style.left   = ((availW - cw) / 2) + 'px';
      colorLoaderEl.style.top    = ((availH - ch) / 2) + 'px';
      colorLoaderEl.style.width  = cw + 'px';
      colorLoaderEl.style.height = ch + 'px';
      colorLoaderEl.style.display = '';   // 尺寸定好才顯示（startColorLoader 先藏，避免閃 stale 尺寸）
    };
    // 非 press 封面校準：等真封面 onload 撐 fit 尺寸才顯示（封面非裁頂＝與真頁面 fit 一致、不閃）。
    // press 封面是裁頂 1.5、看不出真 aspect → 這裡不拿來定尺寸（早退），交給 sizeLoaderToPage 用
    // render 真數字精準定（避免 <2 頁色塊太大，user 2026-08-24）。
    // ⚠️只設色塊自己的 stage 座標尺寸、不碰 naturalDims/fitDims → renderPage 仍視為初次 render。
    const cachedCover = cover ? Promise.resolve(cover) : peekPdfCover(pdfUrl, coverAspect || 0);
    Promise.resolve(cachedCover).then(src => {
      if (myToken !== openToken || naturalDims.w > 0 || !colorLoaderEl || !loaderActive) return;   // render 已先到就不用墊
      if (!src) {
        // 無封面可量（activities/dshow ref、alumni 會議紀錄）：開過的檔用快取真實比例（跟 documents 封面
        // 同邏輯、零跳動）；首次開才退 A4 直式猜（並非所有書都 A4，user 2026-08-28），getDocument 網路窗
        // 就看得到色塊；renderPage 的 sizeLoaderToPage 拿真尺寸校正＋寫入快取。
        // press（autoRead）不猜：可能走 reading-fill，Fit Page 猜測會大跳（08-24 定案）→ 維持等 sizeLoaderToPage。
        if (!allowAutoRead) {
          const d = getCachedPdfDims(pdfUrl);
          showLoaderFitRect(d ? d[0] : 210, d ? d[1] : 297);
        }
        return;
      }
      const img = new Image();   // 不設 crossOrigin：panel 封面是 no-cors 載的，設了會重走網路（見舊 memory）；此處只讀尺寸不畫 canvas
      img.onload = () => {
        if (myToken !== openToken || naturalDims.w > 0 || !loaderActive) return;
        const imgAspect = img.naturalHeight / img.naturalWidth;
        const coverIsCropped = (coverAspect || 0) > 0 && imgAspect >= coverAspect - 0.02;
        // press 且封面確認長頁（裁頂 or aspect≥2）→ reading-fill 已正確，不動。
        // ponytail: 裁頂封面(=1.5)無法分辨真頁 aspect 落 [1.5,2)（render 走 Fit Page）還是 ≥2（reading）；此處賭 reading
        //   （本站 press 幾乎全是 ≥2 長文，見封面裁頂理由）。真頁若在 [1.5,2)（雜誌/報紙掃描）色塊會在揭露前縮一次（罕見）。
        //   render 的 ≥2 門檻是 user 定案不能降；要全消得把色塊移出 rendered-content、改 zoom-stage 絕對定位不隨 render 重算。
        if (allowAutoRead && (coverIsCropped || imgAspect >= 2)) return;
        // 其餘 → 封面 fit 尺寸置中（非 press，或 press 首頁橫幅/短頁）
        showLoaderFitRect(img.naturalWidth, img.naturalHeight);
      };
      img.src = src;
    });

    try {
      // SPA navigated 進 library 時若 pdfjsLib 沒被頁面 head 載入，動態 inject
      await ensurePdfjsLoaded();
      setupPdfjsWorker();
      // disableAutoFetch + disableStream：走 HTTP Range 只抓「當前頁需要的 chunk」，不整本下載——
      // 大掃描本「點開卡在封面（墊圖）很久」的主因（getDocument 預設會 auto-fetch 整本）。同 pdf-cover.js 封面渲染。
      // rangeChunkSize 16K：預設 64K 對散布全檔的 xref/page 物件過抓 3.4×（78MB 專刊實測 13.3→3.9MB）。
      // _r 唯一 query：封面先 range 抓過同 URL 會留 partial cache，Chrome 把 viewer probe 拼成
      // 「無 Accept-Ranges 的合成 200」→ pdf.js 誤判不支援 range 整本下載 78MB（＝點開等 10s 的真兇）。
      // CloudFront cache key 不含 query（實測首發即 Hit），edge 快取零損失。
      const bustUrl = pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + '_r=' + Date.now();
      const doc = await pdfjsLib.getDocument({ url: bustUrl, disableAutoFetch: true, disableStream: true, rangeChunkSize: 16384, cMapUrl: PDFJS_CMAPS, cMapPacked: true, standardFontDataUrl: PDFJS_STD_FONTS, wasmUrl: PDFJS_WASM }).promise;
      // 慢載大本時 user 可能已改開別本：這次開場過期就整段放棄——別讓晚到的 doc 覆寫共用 pdfDoc、
      // 也別 render 進共用 canvas，否則畫面變成「開到別的書」（user 2026-08-11）。
      if (myToken !== openToken) { doc.destroy?.(); return; }
      pdfDoc = doc;
      pageInfo.textContent = `${curPage} / ${pdfDoc.numPages}`;   // 總頁數已確定，一次到位
      // 桌面/手機同走單頁引擎（手機多 touch 手勢層：swipe 換頁 / pinch 縮放）
      renderPage(curPage).then(ok => {
        if (myToken !== openToken) return;
        if (!ok) { closeModal(); return; }   // 首頁 render 失敗（壞檔/損頁）→ 關閉，別讓色塊 loader 卡死不揭露
        // render 完成：頁面已在 canvas 上（雙緩衝 swap）。標記讓載入色塊在當前色塊 1s 走完後 clip-reveal 揭露
        loaderReady = true;
      });
    } catch (err) {
      console.error('PDF load error:', err);
      closeModal();
    }
  });

  prevBtn.addEventListener('click', () => turnPage(-1));
  nextBtn.addEventListener('click', () => turnPage( 1));
  if (backBtn) backBtn.addEventListener('click', closeModal);

  zoomInBtn.addEventListener('click',  () => zoomAtStageCenter(1.5, true));
  zoomOutBtn.addEventListener('click', () => zoomAtStageCenter(1 / 1.5, true));
  if (fitToggleBtn) {
    fitToggleBtn.addEventListener('click', () => {
      // 雙態切換（user 2026-06-02）：Fit Page（整頁）↔ Fit Width（滿寬）。
      // 在 Fit Width → 回 Fit Page；其他（Fit Page / 手動 zoom）→ 切 Fit Width。icon 由 updateZoomUI 換。
      if (isFitWidth()) resetToFit(true);
      else applyFitWidth(true);   // 切 Fit Width：對齊頁面頂端（非 stage 中心放大）
    });
  }

  // Wheel：在 fit 時翻頁；放大到「圖填滿 stage」後 pan within viewport
  // touchpad 一次手勢會丟多 events → 翻頁加 cooldown，pan 不需要（連續 delta 直接累加）
  stageEl.addEventListener('wheel', (e) => {
    if (!pdfDoc) return;
    e.preventDefault();
    const canPan = zoom.scale > fitScale() + 0.001;
    if (!canPan) {
      const now = Date.now();
      if (now < wheelPageLock) return;
      wheelPageLock = now + WHEEL_PAGE_COOLDOWN;
      turnPage(e.deltaY > 0 ? 1 : -1);
    } else {
      zoom.tx -= e.deltaX;
      zoom.ty -= e.deltaY;
      clampPan();
      applyZoom(false);
    }
  }, { passive: false });

  // Drag pan（只在 canPan 時啟動）
  stageEl.addEventListener('mousedown', (e) => {
    const canPan = zoom.scale > fitScale() + 0.001;
    if (!canPan || e.button !== 0) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty };
    rowEl.style.cursor = `url('${sitePath('custom-cursor/drag_2.svg')}') 15 15, grabbing`;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    zoom.tx = dragStart.tx + (e.clientX - dragStart.x);
    zoom.ty = dragStart.ty + (e.clientY - dragStart.y);
    clampPan();
    applyZoom(false);
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    const canPan = zoom.scale > fitScale() + 0.001;
    rowEl.style.cursor = canPan
      ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
      : `url('${sitePath('custom-cursor/default.svg')}') 6 1, default`;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!pdfDoc || modal.style.display === 'none') return;
    if (e.key === 'Escape') { closeModal(); return; }
    // 上下左右：圖未填滿 stage 時翻頁；可 pan 時 pan（scroll direction：按右=往右看，圖往左移）
    const isArrow = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const canPan = zoom.scale > fitScale() + 0.001;
    if (isArrow) {
      e.preventDefault();
      if (canPan) {
        const STEP = 80;
        if (e.key === 'ArrowRight') zoom.tx -= STEP;
        if (e.key === 'ArrowLeft')  zoom.tx += STEP;
        if (e.key === 'ArrowDown')  zoom.ty -= STEP;
        if (e.key === 'ArrowUp')    zoom.ty += STEP;
        clampPan();
        applyZoom(true);
      } else {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') turnPage( 1);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   turnPage(-1);
      }
    }
    if (e.key === '+' || e.key === '=') zoomAtStageCenter(1.5, true);
    if (e.key === '-' || e.key === '_') zoomAtStageCenter(1 / 1.5, true);
    if (e.key === '0') resetToFit(true);
  });

  // 手機橫豎切換 / 視窗寬度變化：重新 render 當前頁以重算 fit 尺寸（單頁引擎，renderPage 內會重算 fitDims）。
  // 只認「寬度」變化：手機捲動時 URL bar 顯隱會改高度但不該重渲。
  let _lastViewportW = window.innerWidth;
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    if (w === _lastViewportW) return;
    _lastViewportW = w;
    if (!pdfDoc || modal.style.display === 'none') return;
    if (wantWatermark) buildWatermark();   // 寬度跨過手機斷點時重建浮水印（手機↔桌面尺寸不同）
    renderPage(curPage);
  });
}

// ── 主要 export ───────────────────────────────────────────────────────────────

export function initLibraryViewer() {
  ensureLightboxListener();
  initPdfViewer();
}
