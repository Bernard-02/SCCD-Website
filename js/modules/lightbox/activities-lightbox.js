/**
 * Activities Lightbox
 * 點擊海報或 gallery 媒體，以全螢幕 lightbox 顯示大圖/影片
 * 媒體順序：海報 → videos → images
 */

import { enterLightboxMode, exitLightboxMode } from './lightbox-shell.js';
import { createRefBtn } from './lightbox-ref-btn.js';
import { sitePath } from '../ui/site-base.js';

let lightboxEl = null;
// 防 double-open（user 2026-06-22 報「打開 press lightbox 有時 header 整個消失」）：openLightbox 是 async，
// enterLightboxMode 在 await(probeImage) 之後才呼叫；press item 圖還沒載完就被快速點兩下 → openLightbox 跑兩次
// → enterLightboxMode×2 但 close 只 exit×1 → lightbox-shell openCount 卡 1 → header bars 永久 clip 收起。
// 用同步 latch（在第一個 await「之前」就設 true）讓重複 open 只 enter 一次、close 只 exit 一次。
let lbOpen = false;
let mainEl = null;
let thumbsEl = null;
let titleEl = null;
let prevBtn = null;
let nextBtn = null;
let iframeEl = null;

let mediaList = [];   // [{ type: 'image'|'video', src: string, thumb: string }]
let currentIndex = 0;

let zoomControlsEl = null;
let zoomInBtn = null;
let zoomOutBtn = null;
let zoomPctEl = null;
let fitToggleBtn = null;
let closePillEl = null;
let mainContainerEl = null;
let refUi = null;  // { btnEl, popoverEl, setReferences, setColor, reset }
let shareBtnEl = null;   // album 分享按鈕（caller 帶 shareUrl 才顯示）
let sharePillEl = null;

// ── Zoom 狀態（仿 Windows Photos：滾輪游標中心縮放 + 拖曳平移）─────
// 只對 image 啟用。每次 renderMain 重置；mousemove/mouseup 綁 window 一次永久存活
// 內部 zoom.scale = 「相對 fit 的倍數」（clampPan/zoomAt 數學以此為基準乾淨）
// UI 顯示的 % = 「相對原圖 natural pixel」(zoom.scale × fitRatio × 100)
// 預設打開圖片 = actual size (顯示 100%) 即 scale = 1/fitRatio（user 指定 2026-06-01）
// 例：4000px 寬圖 fit 到 800px stage → fitRatio=0.2；預設 scale=5 顯示 100%；fit-toggle 切到 scale=1 顯示 20%
let zoom = { scale: 1, tx: 0, ty: 0 };
let zoomImg = null;
let zoomStage = null;
let fitDims = { w: 0, h: 0 };  // img 在 scale=1 時的 rendered fit 尺寸（object-fit:contain）
let naturalDims = { w: 0, h: 0 };  // img 原圖 pixel 尺寸（給 UI % 顯示 + ZOOM_STEPS 對齊用）
let isDragging = false;
let dragMoved = false;          // 用來避免 mouseup 在背景時誤觸 close
let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };
// +/- 按鈕 snap 到「相對原圖」的離散層級（仿 Windows Photos）：25/50/75/100/150/200/300/400%
// zoomToStep 把 % 換算成內部 scale = pct / fitRatio；滾輪維持平滑（factor 1.15 per tick）
const ZOOM_STEPS_PCT = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const MIN_PCT = ZOOM_STEPS_PCT[0];                       // 25% 原圖為下限
const MAX_PCT = ZOOM_STEPS_PCT[ZOOM_STEPS_PCT.length-1]; // 400% 原圖為上限

// ── 建立 DOM（只建一次）──────────────────────────────────────────
function ensureLightbox() {
  if (lightboxEl) return;

  lightboxEl = document.createElement('div');
  lightboxEl.id = 'activities-lightbox';
  // bg-black/90 半透明黑（user 偏好；不全黑，讓底下 page 微微透出但 chips 不會搶眼）
  // z-[9999] 與 header 同層，但 lightbox 後 append 到 body → 蓋在 header 之上
  // header 由 lightbox-shell 拉到 z=10000，logo 浮在 lightbox 黑底上、bars 用 clip-path 收掉
  lightboxEl.className = 'fixed inset-0 z-[9999] bg-black/90 flex flex-col opacity-0 transition-opacity duration-300';
  lightboxEl.style.display = 'none';

  lightboxEl.innerHTML = `
    <!-- Main display: flex-1 填滿，py-xl 限制上下空間；padding-top 在 openLightbox 動態 override
         讓 zoomStage 上邊緣對齊 logo 底邊（zoom 放大時影像被 overflow:hidden clip 不會蓋到 logo）
         px-16 md:px-32：desktop 加大 padding 讓 zoom mask 邊停在 chevron 內側（chevron right ≈ 68px，
         px-32 = 128px → 60px gap），避免高倍 zoom 時 image 視覺貼到 chevron 上。mobile 維持 px-16 -->
    <div class="alb-main-container flex items-center justify-center w-full px-16 md:px-32 pt-xl pb-md flex-1 min-h-0 relative">
      <!-- chevron 左右對齊 container-padding（= logo / back btn pill 的 viewport margin），絕對定位獨立元件不受 back btn 隨機旋轉影響
           z-index:30 必要：chevron 在 alb-main 之前的 DOM siblings，下層；alb-main / zoomStage w-full h-full 蓋在上面 → 不拉 z 點不到
           disabled 視覺：opacity-50 保留白色（user 要求：「到底了」的暗示，不是 disabled grey 感）+ cursor-not-allowed
           用 aria-disabled 不用原生 disabled：Chrome 對原生 disabled 表單元素強制顯示預設箭頭，CSS cursor 無效（同 create.css 用 class 不用 :disabled 的原因）；
           navigate() 本身有 clamp，到底時點擊本就是 no-op，不靠原生 disabled 擋 -->
      <button class="alb-prev absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 aria-disabled:opacity-50 aria-disabled:[cursor:var(--cursor-not-allowed)] aria-disabled:hover:opacity-50" style="left: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m"></span>
      </button>
      <div class="alb-main flex items-center justify-center w-full h-full"></div>
      <button class="alb-next absolute text-white w-[44px] h-[44px] flex items-center justify-center transition-opacity hover:opacity-60 aria-disabled:opacity-50 aria-disabled:[cursor:var(--cursor-not-allowed)] aria-disabled:hover:opacity-50" style="right: var(--container-padding, 1.5rem); z-index: 30;">
        <span class="icon icon-chevron-lightbox icon-m rotate-180"></span>
      </button>
    </div>

    <!-- Thumbnails: outer wrap 永遠 full-width 置中；inner 受 max-width 控制 + 超出時內部 scroll -->
    <!-- 用 wrapper 而非 .alb-thumbs 直接 max-width+margin:auto 是為了讓 justify-center 在 overflow 時不會 clip 左邊 -->
    <!-- relative + 左側絕對定位 topbar(back+title) + 右側絕對定位 zoom controls：不影響 thumbs 置中 -->
    <!-- pt-md/pb-md：上下對稱 padding（user 2026-06-03 指定）。
         （原為 pb-xl 補償 title pill 繞 left bottom 旋轉的 ~18px 下沉，user 改回對稱 md） -->
    <div class="alb-thumbs-wrap relative flex justify-center w-full pt-md pb-md flex-shrink-0">
      <!-- 左側：返回按鈕（arrow icon-only pill）+ title pill 並排，與 thumbs row 同高（vertically centered）
           transform-origin:left bottom 讓兩 pill 從 bottom-left 樞紐，避免旋轉時 bbox 溢出視窗左邊 -->
      <div class="alb-topbar absolute" style="left: var(--container-padding, 1.5rem); top: 50%; transform: translateY(-50%); z-index: 5; display: flex; align-items: flex-end; gap: 20px;">
        <button class="alb-close">
          <span class="alb-close-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;font-size:var(--font-size-p1);line-height:1;transform:rotate(0deg);transform-origin:left bottom;">
            <span class="icon icon-arrow-left icon-m"></span>
          </span>
        </button>
        <!-- 標題 pill：caller 帶入 list-item 名稱 + accent 底色 + 隨機旋轉 + max-width 超出 marquee -->
        <div class="alb-title" style="display: none;"></div>
        <!-- Share btn：排在 title 與（置中的）縮圖列之間。只有 caller 帶 opts.shareUrl（library album）才顯示；
             data-share-url 由 openLightbox 設、全站 share-modal.js 的 [data-share-btn] delegation 接管點擊（QR + 複製）。-->
        <button class="alb-share" data-share-btn aria-label="分享 Share" style="display: none;">
          <span class="alb-share-pill" style="display:inline-flex;align-items:center;justify-content:center;background:#00FF80;color:#000;width:44px;height:44px;transform-origin:left bottom;box-sizing:border-box;">
            <!-- 用返回鍵那顆粗箭頭（icon-arrow-left ←），旋轉 135° 指向右上 ↗ 當分享（比 icon-share 細箭頭粗，user 2026-06-15）-->
            <span class="icon icon-arrow-left icon-m" style="transform: rotate(135deg);"></span>
          </span>
        </button>
      </div>
      <!-- padding-y: 6px 給 active outline (2px width + 2px offset = 4px) 預留空間（規則移到 lightbox.css）-->
      <!-- overflow-x:auto 會讓 overflow-y 被瀏覽器隱式設成 auto，沒 padding 上下 outline 會被 clip 掉 -->
      <div class="alb-thumbs flex items-center gap-sm" style="max-width: min(80vw, 960px); overflow-x: auto;"></div>
      <div class="alb-zoom-controls absolute text-white" style="right: var(--container-padding, 1.5rem); top: 50%; transform: translateY(-50%); display: none; align-items: center; gap: 12px;">
        <button class="alb-zoom-out p-2 transition-opacity hover:opacity-60 disabled:opacity-30" aria-label="Zoom out">
          <span class="icon icon-zoom-out icon-m"></span>
        </button>
        <span class="alb-zoom-pct text-p2" style="font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center;">100%</span>
        <button class="alb-zoom-in p-2 transition-opacity hover:opacity-60 disabled:opacity-30" aria-label="Zoom in">
          <span class="icon icon-zoom-in icon-m"></span>
        </button>
        <!-- Fit-to-window 按鈕（user 2026-06-02）：點下去切到 fit；已在 fit 時 disabled -->
        <button class="alb-fit-toggle p-2 transition-opacity hover:opacity-60 disabled:opacity-30" aria-label="Fit to window">
          <span class="icon icon-fit-viewport icon-m"></span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(lightboxEl);

  mainEl   = lightboxEl.querySelector('.alb-main');
  thumbsEl = lightboxEl.querySelector('.alb-thumbs');
  titleEl  = lightboxEl.querySelector('.alb-title');
  prevBtn  = lightboxEl.querySelector('.alb-prev');
  nextBtn  = lightboxEl.querySelector('.alb-next');
  zoomControlsEl = lightboxEl.querySelector('.alb-zoom-controls');
  zoomInBtn      = lightboxEl.querySelector('.alb-zoom-in');
  zoomOutBtn     = lightboxEl.querySelector('.alb-zoom-out');
  zoomPctEl      = lightboxEl.querySelector('.alb-zoom-pct');
  fitToggleBtn   = lightboxEl.querySelector('.alb-fit-toggle');
  closePillEl    = lightboxEl.querySelector('.alb-close-pill');
  mainContainerEl = lightboxEl.querySelector('.alb-main-container');
  shareBtnEl     = lightboxEl.querySelector('.alb-share');
  sharePillEl    = lightboxEl.querySelector('.alb-share-pill');

  // Ref btn：插在 close btn 跟 title pill 之間（flex 順序）；popover append 到 lightbox root
  refUi = createRefBtn('#00FF80', () => closeLightboxAsync());
  refUi.btnEl.classList.add('alb-ref-btn');
  const topbarEl = lightboxEl.querySelector('.alb-topbar');
  if (topbarEl && titleEl) {
    topbarEl.insertBefore(refUi.btnEl, titleEl);
  }
  lightboxEl.appendChild(refUi.popoverEl);

  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));
  lightboxEl.querySelector('.alb-close').addEventListener('click', closeLightbox);
  zoomInBtn.addEventListener('click',  () => zoomToStep(+1));
  zoomOutBtn.addEventListener('click', () => zoomToStep(-1));
  fitToggleBtn.addEventListener('click', () => {
    // fit-toggle 單一行為（user 2026-06-02）：點下去切到 fit-to-window；已在 fit 由 disabled 擋下
    if (fitToggleBtn.disabled) return;
    resetZoom(true);
  });

  // 縮圖列拖曳已移除（user 2026-06-15）：改為「active 永遠置中」自動捲動（centerActiveThumb）＋
  // 桌面兩端 pseudo runway（lightbox.css ::before/::after）讓任一張都能捲到正中；觸控板/觸控仍可原生捲動。

  // 點擊背景關閉（圖片 pan 結束在背景時 dragMoved 抑制一次以免誤關）
  lightboxEl.addEventListener('click', e => {
    if (dragMoved) { dragMoved = false; return; }
    if (e.target === lightboxEl) closeLightbox();
  });

  // 鍵盤：
  //  - Esc / + - 0：縮放控制（0 = 回 fit-to-window）
  //  - Arrow keys 雙模式：
  //    · 圖未超出 stage (scale <= fit)：上/左 = 上一張、下/右 = 下一張（4 鍵都導航）
  //    · 圖已超出 stage (scale > fit)：pan — scroll direction（按右往右看 / 按下往下看，圖往反方向移）
  //      跟 PDF viewer / scroll convention 一致；mouse drag 仍維持「圖跟手」方向
  document.addEventListener('keydown', e => {
    if (lightboxEl.style.display === 'none') return;
    // share modal 疊在 lightbox 之上時（後 append、同 z-9999 在最上層），鍵盤交給它（避免 Esc 同時關兩層）
    if (document.getElementById('share-lightbox')?.style.display === 'flex') return;
    if (e.key === 'Escape') { closeLightbox(); return; }

    const canPan = zoomImg && zoom.scale > fitScale() + 0.001;
    const PAN_STEP = 80;
    if (e.key === 'ArrowLeft')  { if (canPan) { zoom.tx += PAN_STEP; clampPan(); applyZoom(true); } else navigate(-1); return; }
    if (e.key === 'ArrowRight') { if (canPan) { zoom.tx -= PAN_STEP; clampPan(); applyZoom(true); } else navigate(1);  return; }
    if (e.key === 'ArrowUp')    { if (canPan) { zoom.ty += PAN_STEP; clampPan(); applyZoom(true); } else navigate(-1); return; }
    if (e.key === 'ArrowDown')  { if (canPan) { zoom.ty -= PAN_STEP; clampPan(); applyZoom(true); } else navigate(1);  return; }

    if (!zoomImg) return;
    if (e.key === '+' || e.key === '=') zoomToStep(+1);
    if (e.key === '-' || e.key === '_') zoomToStep(-1);
    if (e.key === '0') resetZoom(true);
  });

  // Drag pan：mousemove/mouseup 綁 window 一次，永久存活
  // 用 isDragging gate；scale=1 時 mousedown 不啟動，所以也不會空跑
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    zoom.tx = dragStart.tx + (e.clientX - dragStart.x);
    zoom.ty = dragStart.ty + (e.clientY - dragStart.y);
    if (Math.abs(e.clientX - dragStart.x) > 5 || Math.abs(e.clientY - dragStart.y) > 5) {
      dragMoved = true;
    }
    clampPan();
    applyZoom(false);
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    if (zoomImg) zoomImg.style.cursor = zoom.scale > fitScale() + 0.001
      ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
      : `url('${sitePath('custom-cursor/zoom-in.svg')}') 6 6, zoom-in`;
  });

  // 手機左右 swipe 換上一張/下一張（取代 chevron，iPhone Photos 風格；桌面無 touch 不觸發）
  // 只認「水平為主」且位移 > 40px；垂直為主忽略（保留未來下滑關閉的手勢空間）
  let swipeX = 0, swipeY = 0, swipeActive = false;
  mainContainerEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { swipeActive = false; return; }
    swipeActive = true;
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  }, { passive: true });
  mainContainerEl.addEventListener('touchend', (e) => {
    if (!swipeActive) return;
    swipeActive = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - swipeX;
    const dy = t.clientY - swipeY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      navigate(dx < 0 ? 1 : -1);   // 左滑 → 下一張；右滑 → 上一張
    }
  }, { passive: true });
}

// ── Zoom helpers ────────────────────────────────────────────────
function applyZoom(animated = false) {
  if (!zoomImg) return;
  zoomImg.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
  zoomImg.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
  // cursor 跟 canPan 一致（圖填滿 stage 才顯示 grab）；其餘狀態給 zoom-in（暗示「可放大」）
  const canPan = zoom.scale > fitScale() + 0.001;
  zoomImg.style.cursor = isDragging
    ? `url('${sitePath('custom-cursor/drag_2.svg')}') 10 10, grabbing`
    : (canPan
        ? `url('${sitePath('custom-cursor/drag_1.svg')}') 10 10, grab`
        : `url('${sitePath('custom-cursor/zoom-in.svg')}') 6 6, zoom-in`);
  updateZoomUI();
}

// 同步 zoom % 顯示 + +/- 按鈕到極值時的 disabled 狀態 + fit-toggle 圖示
// UI % = 相對原圖 natural pixel 的比例（zoom.scale × fitRatio × 100）— 仿 Windows Photos
// load 前 naturalDims=0 用 fallback 顯示 internal scale*100（避免 0% 跳動）
function updateZoomUI() {
  if (!zoomPctEl) return;
  const fitRatio = getFitRatio();
  const displayPct = Math.round(zoom.scale * (fitRatio > 0 ? fitRatio : 1) * 100);
  zoomPctEl.textContent = `${displayPct}%`;
  zoomInBtn.disabled  = zoom.scale >= maxScale() - 0.001;
  zoomOutBtn.disabled = zoom.scale <= minScale() + 0.001;
  // fit-toggle 功能單一（切到 fit）；已在 fit 狀態時 disable（user 2026-06-02）
  // icon 用 CSS mask 系統 .icon-fit-viewport（HTML 寫死，不再 JS 切 className）
  if (fitToggleBtn) {
    fitToggleBtn.disabled = Math.abs(zoom.scale - fitScale()) < 0.001;
  }
}

// fitRatio = fitDims.w / naturalDims.w：把「fit 後的 rendered px」對應回「原圖 1 px」的比例
// 例：4000px 寬圖 fit 到 800px stage → fitRatio = 0.2（fit 顯示時 1 原圖 px = 0.2 stage px）
// naturalDims 未 load 完回 0；caller 自己決定 fallback 行為
function getFitRatio() {
  return naturalDims.w > 0 && fitDims.w > 0 ? fitDims.w / naturalDims.w : 0;
}

// fit 對應的內部 scale 永遠 = 1（這是 zoom.scale 的定義）；helper 只是給語意對齊
const fitScale = () => 1;
// actual-size (100% 原圖) 對應的內部 scale = 1/fitRatio；fitRatio=0 fallback 1
const actualScale = () => { const r = getFitRatio(); return r > 0 ? 1 / r : 1; };
// MIN_PCT/MAX_PCT 對應的內部 scale 下/上限；fit 比 MIN_PCT 還小（fit < 25%）時放寬下限到 fit
//（user 還是要能看到完整圖；fit > MIN_PCT 時鎖在 MIN_PCT 避免縮太小）
function minScale() {
  const r = getFitRatio();
  if (r <= 0) return 1;
  return Math.min(fitScale(), MIN_PCT / r);
}
function maxScale() {
  const r = getFitRatio();
  if (r <= 0) return 6; // load 前 fallback 內部 6x（同舊 MAX_SCALE）
  // 400% 原圖；fit > MAX_PCT (極小圖 fit 就放大超過 400%) 仍允許到 fit
  return Math.max(fitScale(), MAX_PCT / r);
}

function clampPan() {
  // 圖未填滿 stage 時不允許平移（scale <= fit 等於圖被 contain）
  if (zoom.scale <= fitScale() + 0.001) { zoom.tx = 0; zoom.ty = 0; return; }
  const stageRect = zoomStage.getBoundingClientRect();
  const scaledW = fitDims.w * zoom.scale;
  const scaledH = fitDims.h * zoom.scale;
  const maxTx = Math.max(0, (scaledW - stageRect.width) / 2);
  const maxTy = Math.max(0, (scaledH - stageRect.height) / 2);
  zoom.tx = Math.max(-maxTx, Math.min(maxTx, zoom.tx));
  zoom.ty = Math.max(-maxTy, Math.min(maxTy, zoom.ty));
}

// 在 (clientX, clientY) 為焦點縮放 factor 倍。Windows Photos 風格：游標下的像素保持不動
function zoomAt(clientX, clientY, factor, animated = false) {
  if (!zoomStage || !zoomImg) return;
  const stageRect = zoomStage.getBoundingClientRect();
  const cx = clientX - stageRect.left;
  const cy = clientY - stageRect.top;
  const sw = stageRect.width, sh = stageRect.height;
  // 游標下這個點在「img 自身、未縮放、相對 img 中心」的座標
  const imgX = (cx - sw / 2 - zoom.tx) / zoom.scale;
  const imgY = (cy - sh / 2 - zoom.ty) / zoom.scale;
  const newScale = Math.max(minScale(), Math.min(maxScale(), zoom.scale * factor));
  if (Math.abs(newScale - zoom.scale) < 0.0001) return;
  // 解出 newTx 使該點在 stage 中的位置不變
  zoom.tx = cx - sw / 2 - imgX * newScale;
  zoom.ty = cy - sh / 2 - imgY * newScale;
  zoom.scale = newScale;
  clampPan();
  applyZoom(animated);
}

function zoomAtStageCenter(factor, animated = false) {
  if (!zoomStage) return;
  const r = zoomStage.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor, animated);
}

// 直接 set scale 到指定 target（用於 fit-toggle / 預設 actual size）；以 stage center 為錨點
function zoomToScale(targetScale, animated = false) {
  if (!zoomStage) return;
  targetScale = Math.max(minScale(), Math.min(maxScale(), targetScale));
  if (Math.abs(targetScale - zoom.scale) < 0.0001) return;
  zoomAtStageCenter(targetScale / zoom.scale, animated);
}

// +/- 按鈕：以「相對原圖 %」為單位 snap 到 ZOOM_STEPS_PCT 下一/前一檔
// 內部 scale = displayPct / fitRatio；fitRatio 算不出時 fallback 走 1.5x 倍率 step
function zoomToStep(dir) {
  if (!zoomStage) return;
  const fitRatio = getFitRatio();
  if (fitRatio <= 0) {
    const target = dir > 0 ? zoom.scale * 1.5 : zoom.scale / 1.5;
    zoomToScale(target, true);
    return;
  }
  const currentPct = zoom.scale * fitRatio;
  let targetPct;
  if (dir > 0) {
    targetPct = ZOOM_STEPS_PCT.find(p => p > currentPct + 0.001);
  } else {
    targetPct = [...ZOOM_STEPS_PCT].reverse().find(p => p < currentPct - 0.001);
  }
  if (targetPct == null) return;
  zoomToScale(targetPct / fitRatio, true);
}

// 回 fit-to-window（scale = 1）— 給 fit-toggle 用
function resetZoom(animated = false) {
  zoomToScale(fitScale(), animated);
}

// 回 actual-size (100% 原圖) — 給打開圖片預設用
function setActualSize(animated = false) {
  zoomToScale(actualScale(), animated);
}

// 把第 index 個縮圖捲到「縮圖列水平中央」（仿 iPhone Photos scrubber）。
// 用 getBoundingClientRect delta 調 scrollLeft（不靠 offsetLeft：thumb 的 offsetParent 是 .alb-thumbs-wrap 非 thumbsEl）；
// 不用 el.scrollIntoView()：它會連帶捲動所有可捲祖先（可能動到整頁），這裡只想動 thumbsEl 自己。
function centerActiveThumb(index, smooth) {
  if (!thumbsEl) return;
  const active = thumbsEl.querySelectorAll('.alb-thumb')[index];
  if (!active) return;
  const cRect = thumbsEl.getBoundingClientRect();
  if (cRect.width === 0) return;   // display:none（rect 為 0）→ 跳過
  const tRect = active.getBoundingClientRect();
  const delta = (tRect.left + tRect.width / 2) - (cRect.left + cRect.width / 2);
  thumbsEl.scrollTo({ left: thumbsEl.scrollLeft + delta, behavior: smooth ? 'smooth' : 'auto' });
}

// ── 渲染指定 index ──────────────────────────────────────────────
function renderMain(index) {
  const item = mediaList[index];
  mainEl.innerHTML = '';
  // 切換媒體時重置 zoom 狀態（圖→影、影→圖、圖→圖 都要清）
  zoomImg = null; zoomStage = null; isDragging = false; dragMoved = false;
  zoom = { scale: 1, tx: 0, ty: 0 };
  // 切圖時 reset fitDims/naturalDims 避免新圖 load 前 UI 沿用上一張的 fitRatio 顯示錯誤 %
  fitDims = { w: 0, h: 0 };
  naturalDims = { w: 0, h: 0 };

  // zoom controls 只在 image 顯示（video iframe 無法 zoom）
  if (zoomControlsEl) zoomControlsEl.style.display = item.type === 'video' ? 'none' : 'flex';

  if (item.type === 'video') {
    iframeEl = document.createElement('iframe');
    iframeEl.src = item.src + '?autoplay=1';
    iframeEl.setAttribute('frameborder', '0');
    iframeEl.setAttribute('allowfullscreen', '');
    iframeEl.setAttribute('allow', 'autoplay; encrypted-media');
    iframeEl.style.cssText = 'width:100%;max-width:960px;aspect-ratio:16/9;max-height:100%;';
    mainEl.appendChild(iframeEl);
  } else {
    iframeEl = null;
    // zoomStage 充當 overflow:hidden 容器 + 滾輪/拖曳事件接收器
    zoomStage = document.createElement('div');
    zoomStage.className = 'alb-zoom-stage';
    zoomStage.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;';

    zoomImg = document.createElement('img');
    zoomImg.src = item.src;
    zoomImg.alt = '';
    // transform-origin:center 配合 zoomAt 的數學（以 img 自身中心為旋轉基準）
    // user-select / -webkit-user-drag 關閉避免拖曳時觸發瀏覽器原生 image drag
    zoomImg.style.cssText = `max-width:100%;max-height:100%;object-fit:contain;display:block;transform-origin:center;cursor:url('${sitePath('custom-cursor/zoom-in.svg')}') 9 9, zoom-in;user-select:none;-webkit-user-drag:none;will-change:transform;`;
    zoomImg.draggable = false;

    zoomStage.appendChild(zoomImg);
    mainEl.appendChild(zoomStage);

    // 量測 fit 尺寸（scale=1 時的 rendered bbox）給 clampPan 用 + naturalDims 給 UI % 顯示用
    // img 已 max-width/height:100% + object-fit:contain，load 完 offsetW/H 就是 fit 結果
    // 預設規則（仿 Windows Photos，user 2026-06-02）：
    //   原圖比 stage 大（fitRatio < 1）→ 套 fit（避免一打開就要拖曳找邊界）
    //   原圖比 stage 小或等於（fitRatio >= 1）→ 套 actual size 100%（避免小圖被拉糊或留大白邊）
    zoomImg.addEventListener('load', () => {
      fitDims = { w: zoomImg.offsetWidth, h: zoomImg.offsetHeight };
      naturalDims = { w: zoomImg.naturalWidth, h: zoomImg.naturalHeight };
      const r = getFitRatio();
      const target = r < 1 ? fitScale() : actualScale();
      zoom.scale = Math.max(minScale(), Math.min(maxScale(), target));
      zoom.tx = 0; zoom.ty = 0;
      applyZoom(false);
    });

    // 切換到 image 時同步 zoom UI 到 100%（不靠 applyZoom；首次未動 transform）
    updateZoomUI();

    // 滾輪：游標中心縮放（仿 Windows Photos，不需 Ctrl）
    zoomStage.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(e.clientX, e.clientY, factor, false);
    }, { passive: false });

    // 拖曳平移（只在圖填滿 stage 時啟動，scale > fit）
    zoomStage.addEventListener('mousedown', e => {
      if (zoom.scale <= fitScale() + 0.001 || e.button !== 0) return;
      isDragging = true;
      dragMoved = false;
      dragStart = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty };
      zoomImg.style.cursor = `url('${sitePath('custom-cursor/drag_2.svg')}') 15 15, grabbing`;
      e.preventDefault();
    });

    // 單擊 img：fit ↔ actual size 間切換（鎖游標位置）
    // 已在 fit → 跳到 actual size (100%)，以游標為焦點放大
    // 非 fit → 回 fit
    // 拖曳結束的 mouseup 也會 fire click，用 dragMoved gate 過濾
    zoomImg.addEventListener('click', e => {
      // 手機（iPhone Photos 風格）拿掉縮放：tap 不放大，換圖交給左右 swipe；避免 tap 誤觸放大
      if (window.innerWidth < 768) return;
      if (dragMoved) { dragMoved = false; return; }
      if (Math.abs(zoom.scale - fitScale()) < 0.001) {
        const factor = actualScale() / zoom.scale;
        zoomAt(e.clientX, e.clientY, factor, true);
      } else {
        resetZoom(true);
      }
    });
  }

  // 更新 thumbnails active 狀態
  // 用 outline + outline-offset 在圖片「外層」畫 2px 白 border（不佔 layout 空間，不會推擠相鄰 thumb）
  // outline-offset:2px 讓 border 跟圖邊緣有 2px gap，視覺上明顯獨立框出來
  thumbsEl.querySelectorAll('.alb-thumb').forEach((th, i) => {
    if (i === index) {
      th.style.outline = '2px solid #fff';
      th.style.outlineOffset = '2px';
    } else {
      th.style.outline = '';
      th.style.outlineOffset = '';
    }
  });

  // 縮圖列自動置中 active（仿 iPhone Photos：換圖時縮圖捲動跟著移）。
  // 初次 render 時 lightbox 還是 display:none（rect 量不到）→ 交給 openLightbox 顯示後 instant 定位；
  // 已開啟（swipe / chevron / thumb click）才在此 rAF 平滑置中。
  if (lightboxEl.style.display !== 'none') {
    requestAnimationFrame(() => centerActiveThumb(index, true));
  }

  // 更新 chevron 狀態：只 1 個 media 時整顆隱藏（disabled+opacity 視覺上仍可見會誤導點擊）
  const singleMedia = mediaList.length <= 1;
  prevBtn.style.display = singleMedia ? 'none' : '';
  nextBtn.style.display = singleMedia ? 'none' : '';
  // aria-disabled（非原生 disabled）：讓 disabled:[cursor:not-allowed] 真的顯示——Chrome 原生 disabled button 不吃 CSS cursor
  prevBtn.setAttribute('aria-disabled', String(index === 0));
  nextBtn.setAttribute('aria-disabled', String(index === mediaList.length - 1));
  // 即使 single media 也顯示 thumbs row（含單張 thumb）：thumbs-wrap 是 flex-shrink-0 + py-md，
  // 隱藏會讓 wrap 縮 60px → main flex:1 撐大 → image 變大、topbar/zoom controls 因 top:50% 跟著上移，
  // 跟 multi-media 版面對不上。chevron 仍隱藏（無處可導航）足以表達「只有一張」
  thumbsEl.style.display = '';
  currentIndex = index;
}

// ── 切換 ────────────────────────────────────────────────────────
function navigate(dir) {
  const next = Math.max(0, Math.min(mediaList.length - 1, currentIndex + dir));
  if (next !== currentIndex) {
    if (iframeEl) iframeEl.src = '';
    renderMain(next);
  }
}

// ── Image 可載入性 probe（檔案 404 / 跨域擋 → 不要進 mediaList）─────
// JSON 裡的 image path 可能對應到不存在的檔（user 還沒上傳 / 已刪除），純 string-non-empty 過濾不夠；
// user 反映「chevron 切下去看到不存在的圖」=lightbox 拿到不能 load 的 src。
// 此 cache 保存 src → boolean，避免每次開 lightbox 都重 probe（同一 src 重複下載）
const _imageProbeCache = new Map();
function probeImage(src) {
  if (_imageProbeCache.has(src)) return _imageProbeCache.get(src);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
  _imageProbeCache.set(src, promise);
  return promise;
}

// ── 開啟 ────────────────────────────────────────────────────────
// opts.title = { en, zh }   左下角標題（含英中兩行）；省略則不顯示
// opts.color = '#00FF80'    標題底色（建議帶入當前 section 的 accent 色）
// opts.references = [{ section, itemId, labelEn, labelZh, titleEn, titleZh }]
//                   為空 array 或省略 → ref btn 不顯示；點 ref chip 會關 lightbox 並 SPA 跳 activities
export async function openLightbox(media, startIndex = 0, opts = {}) {
  ensureLightbox();
  // 同步 latch：必須在第一個 await 之前設好，重複 open（含 await 視窗內的快速二次點擊）才會被 wasOpen 擋掉
  const wasOpen = lbOpen;
  lbOpen = true;
  const initial = media.filter(item => item && item.src && typeof item.src === 'string' && item.src.trim() !== '');
  if (initial.length === 0) {
    console.warn('openLightbox: no valid media items after filter, aborting');
    lbOpen = wasOpen;  // 中止 → 還原 latch（沒真的開）
    return;
  }

  // Probe 每個 image 是否真的能載入（video 預設通過，YouTube embed 無法 cross-origin probe）
  // Promise.all 跑完才往下：本地檔最壞情況 ~50ms（broken fire error 很快），cached 後續開 lightbox 是 sync
  const probed = await Promise.all(initial.map(async item => {
    if (item.type === 'video') return item;
    const ok = await probeImage(item.src);
    return ok ? item : null;
  }));
  mediaList = probed.filter(Boolean);
  if (mediaList.length === 0) {
    console.warn('openLightbox: all media failed to load, aborting');
    lbOpen = wasOpen;  // 中止 → 還原 latch
    return;
  }
  // startIndex 對應「過濾前」的原始 array。沒任何 item 被 probe 掉時 mediaList === initial → 直接用原 startIndex
  // (避免 findIndex(src===) 在 mediaList 有重複 src 時 collapse 到第一個 — 例如 item.poster 跟 images[0]
  // 是同一張圖，user 點 images[0] thumb 想開 mediaList[1] 結果落到 mediaList[0])
  // 有 item 被 probe 掉時 fallback 走 src 查找：壞掉的 startIndex 不在 mediaList 內就退一格
  if (mediaList.length !== initial.length) {
    const targetSrc = initial[startIndex]?.src;
    const found = mediaList.findIndex(m => m.src === targetSrc);
    startIndex = found >= 0 ? found : Math.max(0, Math.min(startIndex, mediaList.length - 1));
  } else {
    startIndex = Math.max(0, Math.min(startIndex, mediaList.length - 1));
  }

  // 建立 thumbnails：固定高度 + width:auto 自然比例；object-fit:contain 防裁切（避免 cover 把窄圖兩側切掉）
  thumbsEl.innerHTML = '';
  mediaList.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'alb-thumb flex-shrink-0 overflow-hidden transition-opacity';
    btn.style.height = '48px';
    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = '';
    img.draggable = false; // 防原生 image drag 干擾（拖選圖片）
    img.style.cssText = 'height:100%;width:auto;display:block;object-fit:contain;';
    // 縮圖 width:auto 依比例 → 載入後寬度才定；若這張是 active 需重新置中（active 永遠在正中）
    img.addEventListener('load', () => {
      if (lightboxEl.style.display !== 'none') centerActiveThumb(currentIndex, false);
    });
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      if (iframeEl) iframeEl.src = '';
      renderMain(i);
    });
    thumbsEl.appendChild(btn);
  });

  // album 版面（縮圖 1/3 寬置中 + title 縮窄）只在 caller 帶 shareUrl（library album）時套用；
  // activities 海報/gallery 維持原寬版。必須在 renderTitle 前設好 class，marquee 才量到正確 title 寬。
  lightboxEl.classList.toggle('alb-album', !!opts.shareUrl);

  // 標題 pill：仿 activities-section-btn active 樣式（vertical en+zh + 隨機旋轉 + accent bg）
  renderTitle(opts.title, opts.color);
  // 返回按鈕：底色用 caller 帶入 accent (與 title pill 同色)，隨機旋轉（每次開啟一個新角度）
  renderBackButton(opts.color);
  // Share btn：caller 帶 shareUrl（library album）才顯示，套同 accent 底色
  renderShareButton(opts.color, opts.shareUrl);
  // ref btn：跟 back btn 同 accent；無 references 時自動隱藏
  if (refUi) {
    refUi.setColor(resolvePillColor(opts.color));
    refUi.setReferences(opts.references);
  }
  // 量 logo 底邊位置 → 同步 close btn top + main padding-top（避免 zoom image 蓋到 logo）
  positionUIRelativeToLogo();

  renderMain(startIndex);

  lightboxEl.style.display = 'flex';
  requestAnimationFrame(() => {
    lightboxEl.style.opacity = '1';
    // 開啟即把起始縮圖定位到中央（instant，不動畫）；renderMain 當下 lightbox 還 display:none 量不到 rect
    centerActiveThumb(startIndex, false);
  });
  if (!wasOpen) enterLightboxMode();  // 只在「真的從關→開」時 enter，重複 open 不再多 enter（避免 openCount 卡死）
}

// 動態量 header logo bbox：main display 區 padding-top 推到 logo 底邊以下，
// zoomStage overflow:hidden clip 防止 image 蓋 logo。為何動態：header.js scroll 切 180/100。
// shell padLightboxTops 給 lightbox root 加 1.5rem(=24px) → main container padding-top = max(0, logoBottom + GAP - 24)
// （topbar 已搬到 bottom-left，不再依賴 logo 位置；保留只給 main container paddingTop 用）
function positionUIRelativeToLogo() {
  // 手機（iPhone Photos 風格）：topbar（返回+ref+標題）改放畫面最底（縮圖列下方，見 lightbox.css @media）。
  // 大圖區只需讓開頂部 header logo（不再為頂部 topbar 預留空間）；量手機 logo 底邊當 padding-top。
  if (window.innerWidth < 768) {
    const mlogo = document.querySelector('#header-logo-mobile');
    const mrect = mlogo ? mlogo.getBoundingClientRect() : null;
    const logoBottom = (mrect && mrect.height) ? mrect.bottom : 76; // fallback ≈ 手機 header 高
    if (mainContainerEl) mainContainerEl.style.paddingTop = `${logoBottom + 16}px`;
    return;
  }
  const logo = document.querySelector('#header-logo');
  if (!logo) return;
  const rect = logo.getBoundingClientRect();
  const logoBottom = rect.bottom;
  const ZOOM_GAP = 16;
  const SHELL_PT = 24;
  if (mainContainerEl) mainContainerEl.style.paddingTop = `${Math.max(0, logoBottom + ZOOM_GAP - SHELL_PT)}px`;
}

// mode3（彩色背景）：去掉三原色，pill 一律白底黑字（對比 lightbox 黑底，user 2026-06-03）
// mode1/mode2 維持 caller 帶入的 accent；lightbox 黑底永遠 → mode3 取白 pill 必定可見
function resolvePillColor(color) {
  if (document.body.classList.contains('mode-color')) return '#FFFFFF';
  return color || '#00FF80';
}

function renderBackButton(color) {
  if (!closePillEl) return;
  const bg = resolvePillColor(color);
  const rot = (window.SCCDHelpers && SCCDHelpers.getRandomRotation)
    ? SCCDHelpers.getRandomRotation()
    : ((Math.round(Math.random() * 10) - 4) || 3);
  closePillEl.style.background = bg;
  closePillEl.style.transform = `rotate(${rot}deg)`;
}

// Share btn（library album 專用）：caller 帶 shareUrl 才顯示，套全站 share modal（[data-share-btn] delegation）。
// data-share-url 讓 share-modal.computeShareUrl 直接用此網址（QR + 複製），不靠 .list-item / panel 推算。
// 底色同 close/ref accent（resolvePillColor 處理 mode3 白底）；不旋轉，跟 ref btn 一致保持端正。
function renderShareButton(color, shareUrl) {
  if (!shareBtnEl || !sharePillEl) return;
  if (!shareUrl) {
    shareBtnEl.style.display = 'none';
    delete shareBtnEl.dataset.shareUrl;
    return;
  }
  shareBtnEl.style.display = '';
  shareBtnEl.dataset.shareUrl = shareUrl;
  sharePillEl.style.background = resolvePillColor(color);
}

// close/ref pill 高度 follow title pill 自然撐高（同 PDF viewer syncBackBtnHeight 規格）
// rotation 不影響 offsetHeight 所以量 unrotated 套到 rotated pill 仍對齊
// width = min(44, h)：單行 title（h<44）→ 縮成正方形（以短邊 h 為主、砍左右 padding，user 2026-06-03）；
//   兩行（h≥44）→ 維持 44 寬。reset 顯式寫 '44px' 不用 ''（否則連 HTML inline 預設一起清掉）。
function syncCloseBtnHeight() {
  if (!closePillEl) return;
  const refPill = refUi && refUi.btnEl
    ? /** @type {HTMLElement | null} */ (refUi.btnEl.querySelector('.lightbox-ref-btn-pill'))
    : null;
  const pill = titleEl && titleEl.querySelector('.alb-title-pill');
  if (!pill || titleEl.style.display === 'none') {
    closePillEl.style.height = '44px'; closePillEl.style.width = '44px';
    if (refPill) { refPill.style.height = '44px'; refPill.style.width = '44px'; }
    if (sharePillEl) { sharePillEl.style.height = '44px'; sharePillEl.style.width = '44px'; }
    return;
  }
  const h = /** @type {HTMLElement} */ (pill).offsetHeight;
  if (h > 0) {
    const w = Math.min(44, h);   // 以短邊為主：單行縮成正方形、兩行維持 44 寬
    closePillEl.style.height = h + 'px'; closePillEl.style.width = w + 'px';
    if (refPill) { refPill.style.height = h + 'px'; refPill.style.width = w + 'px'; }
    if (sharePillEl) { sharePillEl.style.height = h + 'px'; sharePillEl.style.width = w + 'px'; }
  }
}

// title pill 專用旋轉幅度 ±3°（排除 0）— 比 SCCDHelpers.getRandomRotation(-4~6) 小，
// 寬 title pill 大角度看起來太歪（user 2026-06-03）
function getTitleRotation() {
  let r = 0;
  while (Math.round(r) === 0) r = Math.random() * 6 - 3;
  return r;
}

function renderTitle(title, color) {
  if (!title || (!title.en && !title.zh)) {
    titleEl.style.display = 'none';
    titleEl.innerHTML = '';
    syncCloseBtnHeight();
    return;
  }
  const bg = resolvePillColor(color);
  const rot = getTitleRotation();
  // 結構：pill > window(overflow:hidden) > track(inline-block nowrap) > unit(column-flex EN+ZH)
  // marquee 動畫 track translateX，dual-copy 時 unit 整組（EN+ZH）一起捲動 = 中英字 textbox 為一個單位
  // 不是兩行各自 marquee 害 EN/ZH 互不同步
  titleEl.innerHTML = `
    <span class="alb-title-pill" style="display:inline-block;background:${bg};color:#000;padding:6px 8px 5px;font-weight:700;font-size:var(--font-size-p1);line-height:1.2;transform:rotate(${rot}deg);transform-origin:left bottom;max-width:min(40vw, 360px);box-sizing:border-box;">
      <span class="alb-title-window" style="display:block;overflow:hidden;">
        <span class="alb-title-track" style="display:inline-block;white-space:nowrap;will-change:transform;">
          <span class="alb-title-unit" style="display:inline-flex;flex-direction:column;align-items:flex-start;white-space:nowrap;vertical-align:top;">
            ${title.en ? `<span>${title.en}</span>` : ''}
            ${title.zh ? `<span>${title.zh}</span>` : ''}
          </span>
        </span>
      </span>
    </span>
  `;
  titleEl.style.display = 'block';
  requestAnimationFrame(() => {
    syncCloseBtnHeight();
    setupTitleMarquee();
  });
}

// title 文字超出 pill max-width 時 GSAP 連續 marquee：以 EN+ZH unit 整組為單位 dual-copy seamless loop
function setupTitleMarquee() {
  if (!titleEl) return;
  const win   = /** @type {HTMLElement | null} */ (titleEl.querySelector('.alb-title-window'));
  const track = /** @type {HTMLElement | null} */ (titleEl.querySelector('.alb-title-track'));
  if (!win || !track) return;
  if (typeof gsap !== 'undefined') gsap.killTweensOf(track);
  track.style.transform = '';
  // reset dual-copy（caller 可能多次 renderTitle）
  while (track.children.length > 1) track.removeChild(track.lastElementChild);
  const unit = /** @type {HTMLElement | null} */ (track.querySelector('.alb-title-unit'));
  if (!unit) return;
  const unitWidth = unit.getBoundingClientRect().width;
  const winWidth  = win.clientWidth;
  if (unitWidth <= winWidth + 4) return;  // 4px tolerance
  // dual-copy seamless loop
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

// ── 關閉 ────────────────────────────────────────────────────────
function closeLightbox() {
  if (!lbOpen) return;  // 已關閉/關閉中 → 不重複 exit（避免 openCount 過度遞減把 header 提早顯示）
  lbOpen = false;
  if (iframeEl) iframeEl.src = '';
  lightboxEl.style.opacity = '0';
  exitLightboxMode();
  // 停 title marquee tween 避免關閉後仍在背景 rAF 跑
  if (typeof gsap !== 'undefined' && titleEl) {
    titleEl.querySelectorAll('.alb-title-track').forEach(el => gsap.killTweensOf(el));
  }
  setTimeout(() => {
    lightboxEl.style.display = 'none';
    mainEl.innerHTML = '';
    // 清 zoom refs（fit/drag flags 等下次 renderMain 會重置）
    zoomImg = null; zoomStage = null; isDragging = false;
    if (refUi) refUi.reset();
  }, 300);
  document.dispatchEvent(new CustomEvent('sccd:close-lightbox'));
}

// 給 ref btn 跳轉用：等 fadeout 完才 SPA 換頁，避免黑→新頁視覺斷層
function closeLightboxAsync() {
  return new Promise(resolve => {
    closeLightbox();
    setTimeout(resolve, 300);
  });
}
