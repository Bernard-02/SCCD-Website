/**
 * Index Page - News Marquee Stack
 * 3 個 news banner 左對齊堆疊在左下角，每個 bar 前綴一個隨機三原色色塊（原本帶後臺順序數字，2026-10-26 拿掉）；
 * url 是影片（.m3u8／.mp4）的那則點了開首頁播放器（openWatch）、不開新分頁——後台 index_video 併進 news
 * （user 2026-10-26，取代同日的最底固定 WATCH 條）；播放期間暫停 cycle，關閉時黑底才收得回那條 banner；
 * items > 3 時每 5s 依序 cycle：
 * - slot 0（最上方 / 第一個 / 最舊）→ yPercent up clip-reveal 收起退場（duration 0.35s，先於 survivor 平移完成避免 overlap）
 * - slot 1, 2 → 往上平移一個 slot，duration 0.6s power2.inOut（同 about resources accordion）；
 *   中間 banner（slot 1）位移到第一個（slot 0），slot 2 跟著上來填 slot 1；每個 banner 帶著自己的 rotation + 色塊跟著走
 * - 新 item 從 slot 2（最後一個）→ clip-path top-down wipe 展開進場
 * 任一 banner 被 hover 時暫停 cycle；hoverCount 歸 0 後若有 pending 立即 advance
 * Banner 寬度依 poster orientation：landscape=400 / portrait=300（poster 自然尺寸 preload 判定）
 */

import { applyNewsHover, removeNewsHover } from '../animations/floating-items.js';
import { initVideoPlayer, isHlsUrl, isDirectVideoUrl } from '../ui/video-player.js';
import { makeActivatable } from '../ui/a11y.js';
import { DUR, EASE } from '../ui/motion.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { CMS_API_BASE, cdnUrl } from '../../config/api.js';
import { marqueeSpeed } from '../ui/marquee-overflow.js';

const SLOT_COUNT = 3;
const CYCLE_INTERVAL = 5000;
// 桌面 banner 寬度：依 poster orientation
// 原本 bar 400/300＋前綴色塊 40；色塊拿掉（user 2026-10-26）後 bar 吃下那 40＝整條（含 hover 海報）寬不變
const WIDTH_LANDSCAPE = 440;
const WIDTH_PORTRAIT  = 340;
// 手機統一寬度：full width 扣左右 padding＝全站 --container-padding（手機／矮橫向 1.5rem＝24，user 2026-10-27 對齊 logo／header 鈕；原 16）
// WIDTH_MOBILE() 是 banner 整條寬（＝bar 寬）的目標值
const MOBILE_PADDING_X = 24;
// 手機寬上限（user 2026-07-10「不需要整個畫面那麼寬」）：矮橫向視窗寬 ~670-930 吃滿太長 → cap 480；
// 直向手機 375-430 扣 padding 後本來就 < cap、不受影響。
const WIDTH_MOBILE_MAX = 480;
const WIDTH_MOBILE = () => Math.min(window.innerWidth - MOBILE_PADDING_X * 2, WIDTH_MOBILE_MAX);
const BAR_HEIGHT = 40;        // 單行 bar 高度（h5 font 1.4rem + 預設 line-height + padding 上下 --card-pad-lg ≈ 40）
// 色塊配色：專案三原色固定一輪，順序＝全站「rgb」慣例 粉/綠/藍（同 helpers.js ACCENT_COLORS）；
// cycle 時消失的 banner 顏色由新進場 banner 繼承 → 同時始終保有三色各一個
// hover WATCH 卡時整條 news 被遮蔽：色塊蓋回自己的 rgb、黑條蓋黑 → 內容變抽象色塊（同浮卡池 news hover 語彙）。
// clip-path wipe（跟浮卡 newsOverlay 同款 0.5s cubic-bezier）。四個藏起方向（上/下/右/左）；進場一律 wipe 到滿版，
// 退場改抽一個新隨機方向 wipe 出去 → 下次進場自然從那個新方向進來，四方向輪替（user 2026-09-04）。
const ENTER_DELAY = 0.5;      // 新進場 banner 在 cycle 觸發後 delay 0.5s 才走 reveal
// hover 時 poster 展開 與 上方 banner 被推開 共用同一組 duration/ease（同一 GSAP 時鐘）→ 看起來才是「被頂上去」；
// 舊版 poster 走 CSS transition 0.4s cubic-bezier、push 走 0.5s power2.inOut，兩條曲線對不上（user 2026-09-28）
const PUSH_DUR = DUR.base;
const PUSH_EASE = EASE.enterSoft;
// 海報頂端離畫面頂的最小距離（同桌面 hero 圖上界 48）：矮螢幕放不下原尺寸 → banner 整條等比收窄、海報寬＝banner 寬
// （user 2026-10-19；字級不動，放不下的字照跑馬燈）。收窄下限 MIN_BANNER_W，再矮就只縮海報（比 bar 窄）保底
const POSTER_TOP_GAP = 48;
const MIN_BANNER_W = 200;
// 矮橫向（gate）：bar 上方沒高度放海報 → 海報改出現在畫面右半（user 2026-10-27）。畫面扣三道 padding 對分兩欄：
// 左欄 banner（寬封頂欄寬）、右欄海報（貼右 padding、底對齊最底 slot）。海報掛 stack 不掛 banner（banner 有 transform＝定位基準會跟著跑）
const sideColW = () => (window.innerWidth - MOBILE_PADDING_X * 3) / 2;
let closeOpenPoster = null;   // 全站一次只開一張海報：桌面 hover 天生如此，手機點開要同步（user 2026-10-29）；側邊海報同位置本來就得先收

// 全部 slot 同 x（左對齊），y 階梯排列；rotation 由 item 自帶
// index 0 = 最上方（第一個 / 最舊），index 2 = 最下方（最後一個 / 最新）
// 桌面 SLOT_X 60（user 2026-05-25 拍板，不動）
// 手機 SLOT_X = MOBILE_PADDING_X（user 2026-05-26 要求 full width 但留左右 padding，
//   配合 WIDTH_MOBILE=innerWidth-2*padding 讓 banner 在 viewport 內居中對稱貼邊）
const SLOT_X_DESKTOP = 60;
const SLOT_X_MOBILE = MOBILE_PADDING_X;
// bar 實高（中英兩行後 > BAR_HEIGHT）：首個 banner 進 DOM 後量一次覆蓋（runMarqueeStack），
// slot y 差 = 實高 + SLOT_GAP 視覺 gap；最底 slot 底邊維持原 -70（單行時代 bar 40 + 底邊距 30）
const SLOT_GAP = 20;          // 10 → 20（user 2026-09-28「gap 再大一點」）；順帶給 ±1° rotation 右緣 ~8px 位移更多餘裕
let measuredBarH = BAR_HEIGHT;
// 直向手機底邊距＝header 列 pt-lg（32）＝上下同距（user 2026-10-27，hero 改 100svh 後底部不再被工具列吃掉）；矮橫向／桌面維持 70
const BOTTOM_PORTRAIT = 32;
function slotConfigs() {
  const mobile = SCCDHelpers.isMobileLayout();
  const x = mobile ? SLOT_X_MOBILE : SLOT_X_DESKTOP;
  const bottom = mobile && !SCCDHelpers.isLandscapeGate() ? BOTTOM_PORTRAIT : 70;
  const step = measuredBarH + SLOT_GAP;
  return [
    { x, y: -bottom - step * 2 },
    { x, y: -bottom - step },
    { x, y: -bottom },
  ];
}

// 旋轉角度刻意壓在 ±0.3° ~ ±1°：bar 寬 ~450px、中心旋轉下 1° 兩端各垂直位移 ~4px，
// 上下相鄰反向時合計 ~8px < SLOT_GAP；超過就會跟上下 banner 互相遮蓋
// 不沿用 SCCDHelpers.getRandomRotation（範圍到 ±6° 太大）
function randomRotation() {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * (0.3 + Math.random() * 0.7);
}

// gate＝首訪 intro loader 播完才建（否則在白幕底下就進場完）；回傳 Promise＝news 開始進場（或沒 news）那刻，
// main-modular 拿它當 header／WATCH 同時進場的起點
export function initMarquee(gate = Promise.resolve()) {
  const stack = document.getElementById('homepage-marquee-stack');
  if (!stack) return;

  // news 來源改 Directus index_news（一般 collection，依後台 sort 排序）。
  // 每筆：titleZh — titleEn 串成跑馬燈文字；poster 深取 filename_disk → 走 CloudFront（cdnUrl）。
  const fetchNews = () =>
    fetch(`${CMS_API_BASE}/index_news?sort=sort&fields=*,poster.filename_disk`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(j => {
        const rows = Array.isArray(j.data) ? j.data : [];
        const items = rows.map(row => ({
          // 中英分兩行（user 2026-09-15，英上中下）；各行行尾 em space＝無縫 loop 接縫分隔（textContent 渲染，
          // 只能用 U+2003 字元，不能用 &emsp; 實體；不用破折號）
          textEn: row.titleEn ? row.titleEn + '  ' : '',
          textZh: row.titleZh ? row.titleZh + '  ' : '',
          url: row.url || '',
          poster: cdnUrl(row.poster),
        }));
        return { items };
      })
      // 後台是唯一來源：CMS 掛掉（CORS / 斷網 / 5xx）→ 不顯示跑馬燈（不再退本地 JSON，user 2026-10-04）
      .catch(err => {
        console.warn('[marquee] CMS index_news 失敗:', err.message);
        return { items: [] };
      });

  return fetchNews()
    .then(async data => {
      const items = Array.isArray(data?.items) ? data.items.filter(it => it && (it.textEn || it.textZh || it.text)) : [];
      if (items.length === 0) return;
      // 第一則影片進頁就預載（同舊 index_video）：S3 首段實測 ~3s，點了才抓＝黑幕乾等
      // ponytail: 只預載第一則；多則影片時其餘點了才緩衝
      const firstVideo = items.find(it => isVideoUrl(it.url));
      if (firstVideo) videoPlayer(firstVideo.url)?.preloadVideo(firstVideo.url);
      await Promise.all([preloadOrientations(items), gate]);
      if (!stack.isConnected) return;
      let disposeStack = runMarqueeStack(stack, items);
      // 轉向（跨矮橫向 gate）重建 banner stack（user 2026-07-04「轉向重 run」）：
      // banner 寬 / slot 座標是 create 時以當時 viewport 算的（SCCDHelpers.isMobileLayout()/WIDTH_MOBILE()），
      // 轉向後不重建會殘留舊寬度與座標 → dispose（清 timer + 殺 tween + 拔 DOM）再以新參數重跑
      const rotateGateMq = window.matchMedia(SCCDHelpers.LANDSCAPE_GATE);
      const onRotateGate = () => requestAnimationFrame(() => {
        if (!stack.isConnected) return;
        disposeStack?.();
        disposeStack = runMarqueeStack(stack, items);
      });
      rotateGateMq.addEventListener('change', onRotateGate);
      registerPageCleanup(() => rotateGateMq.removeEventListener('change', onRotateGate));
      // menu 開＝開著的海報跑收合退場（手機點開的會留著；桌面 hover 到 menu 鈕時已 mouseleave 收掉）。
      // 退場在 menu 底下跑：navigation.css html.mobile-menu-open header 抬到 10001 > 海報 10000（user 2026-10-29）
      const onMenuOpen = () => closeOpenPoster?.();
      document.addEventListener('menu:open', onMenuOpen);
      registerPageCleanup(() => document.removeEventListener('menu:open', onMenuOpen));
    })
    .catch(() => {});
}

// Poster 自然尺寸 → orientation；banner 寬度需在 create 時就決定，避免後續 image load 後 width snap
async function preloadOrientations(items) {
  await Promise.all(items.map(item => {
    if (!item.poster) { item.orientation = 'landscape'; return Promise.resolve(); }
    if (item.orientation) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        item.orientation = (img.naturalWidth >= img.naturalHeight) ? 'landscape' : 'portrait';
        item.ratio = img.naturalHeight / img.naturalWidth;   // fitBannerToRoom 用
        resolve();
      };
      img.onerror = () => { item.orientation = 'landscape'; resolve(); };
      img.src = item.poster;
    });
  }));
}

// ── Banner builder ──────────────────────────────────────────

function createBanner(item, squareColor) {
  // 手機統一寬度（max-width 視 viewport），桌面依 poster orientation
  const side = SCCDHelpers.isLandscapeGate();
  const totalWidth = SCCDHelpers.isMobileLayout()
    ? (side ? Math.min(WIDTH_MOBILE(), sideColW()) : WIDTH_MOBILE())
    : (item.orientation === 'portrait' ? WIDTH_PORTRAIT : WIDTH_LANDSCAPE);
  // rotation 樞紐＝中心（同全站 nav btn；user 2026-09-28，原 left center 是錯的錨點）：兩端各擺 (w/2)·sinθ、
  // 左緣在 1° 內只飄 ~4px。手機加了 MOBILE_PADDING_X 後左右有 buffer，桌面手機都套隨機 rotation
  const rotation = randomRotation();

  const wrap = document.createElement('div');
  wrap.className = 'hm-banner';
  wrap.style.cssText = `
    position: absolute;
    left: 0; bottom: 0;
    width: ${totalWidth}px;
    pointer-events: none;
    will-change: transform;
  `;
  // 沒海報＝寬度沒東西要配（固定寬是給海報的）→ 貼字寬、上限照原寬（放不下照跑馬燈；user 2026-10-26 WATCH 那則）。
  // gateMarqueeScroll 量的時候 clone 還在＝兩份字撐到上限才量，不會有 max-content 小數寬 vs clientWidth 整數的誤判
  if (!item.poster) { wrap.style.width = 'max-content'; wrap.style.maxWidth = `${totalWidth}px`; }

  // Clip wrapper 包覆 row → 提供 entry/exit 動畫的 overflow:clip
  const clipWrap = document.createElement('div');
  clipWrap.className = 'hm-banner-clip';
  clipWrap.style.cssText = `
    overflow: clip;
    position: relative;
    pointer-events: auto;
  `;

  // Row：包 bar（＋watch 遮蔽層）；動畫套在 row 上
  const row = document.createElement('div');
  row.className = 'hm-banner-row';
  row.style.cssText = `
    display: flex;
    flex-direction: row;
    align-items: stretch;
    will-change: transform;
  `;
  row.style.setProperty('--hm-accent', squareColor);   // hover 對調（.is-swap）時 bar 吃這個色，見 lists.css

  // 沒 url（或舊資料 '#'）＝純公告：不給 href、cursor 維持 default、不跳轉（user 2026-09-28）
  const hasLink = !!item.url && item.url !== '#';
  // url 是影片＝開播放器的鈕（不給 href、Tab＋Enter 可開）；點擊在 bindBannerInteraction 綁（要暫停 cycle）
  const isVideo = isVideoUrl(item.url);
  const link = document.createElement('a');
  link.className = 'homepage-marquee-link';
  if (hasLink && !isVideo) {
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.style.cssText = `
    display: block;
    flex: 1;
    min-width: 0;
    background: var(--color-black);
    padding: var(--card-pad-lg);   /* 字級 lg 的字卡內距（variables.css） */
    text-decoration: none;
  `;
  if (isVideo) {
    link.style.cursor = 'var(--cursor-pointer)';
    makeActivatable(link);
  }

  // marquee viewport：overflow:hidden 掛在這層（不在 link）→ 裁切邊 = link 內容框 = 左右各縮字卡內距，
  // 對齊 library 色塊 marquee 的 axisPad inset（padding 直接放 link 會被 overflow 的 padding-box 裁切邊漏出文字）
  // 中英各一行堆疊（英上中下；舊單行 text 照渲染單行）；
  // duration 不在此設（需量寬）——掛載後 gateMarqueeScroll 依全域 marqueeSpeed() 像素制計算
  const lineTexts = [item.textEn, item.textZh].filter(Boolean);
  if (!lineTexts.length && item.text) lineTexts.push(item.text);
  const lines = lineTexts.map((txt, i) => {
    const viewport = document.createElement('div');
    viewport.className = 'hm-banner-viewport';   // mode 切換時這個裁切窗（字一直在捲）只顯示即時畫面（theme-toggle.js MODE_VT_LIVE_LAYERS）
    // 英中距＝lg 字級全域 token（text-lg → --space-en-zh-lg，同 faculty/alumni 卡人名慣例）
    viewport.style.cssText = `overflow: hidden;${i > 0 ? ' margin-top: var(--space-en-zh-lg);' : ''}`;
    const inner = document.createElement('div');
    inner.className = 'homepage-marquee-inner';
    const mkSpan = (cls) => {
      const s = document.createElement('span');
      s.className = `${cls} text-lg`;
      s.style.cssText = 'color: var(--color-white); font-weight: var(--font-weight-bold); font-size: var(--font-size-lg);';
      s.textContent = txt;
      return s;
    };
    const textEl = mkSpan('homepage-marquee-text');
    const cloneEl = mkSpan('homepage-marquee-clone');
    inner.appendChild(textEl);
    inner.appendChild(cloneEl);
    viewport.appendChild(inner);
    link.appendChild(viewport);
    return { viewport, inner, textEl, cloneEl };
  });

  row.appendChild(link);
  // 手機：bar 右邊正方形鈕（user 2026-10-29）——有海報＝↑ 點開海報、開著改 ↗ 跳連結；沒海報＝↗ 跳連結（不開 share 卡）。
  // 影片／既無連結也無海報＝不給鈕。寬＝icon＋左右 padding（lists.css），從 marquee 扣、banner 總寬不變
  let btn = null;
  if (SCCDHelpers.isMobileLayout() && !isVideo && (hasLink || item.poster)) {
    btn = document.createElement('button');
    btn.className = 'hm-banner-btn';
    btn.innerHTML = '<span class="icon"></span>';
    const btnClip = document.createElement('div');   // 換 icon 時整顆鈕在這裡面左進左出（setBtnState）
    btnClip.className = 'hm-banner-btn-clip';
    btnClip.appendChild(btn);
    row.appendChild(btnClip);
    link.style.paddingRight = '0';   // 字的裁切邊直接貼鈕（鈕自帶左右 padding）
  }
  clipWrap.appendChild(row);
  wrap.appendChild(clipWrap);

  let posterEl = null;
  if (item.poster) {
    posterEl = document.createElement('div');
    posterEl.className = 'hm-poster';
    posterEl.style.cssText = `
      position: absolute;
      ${side
        ? `right: ${MOBILE_PADDING_X}px; bottom: ${-slotConfigs()[SLOT_COUNT - 1].y}px; width: ${sideColW()}px; z-index: 10000; transform: rotate(${rotation}deg);`
        : 'left: 0; bottom: 100%; width: 100%;'}
      overflow: hidden;
      max-height: 0;
      pointer-events: auto;
      cursor: ${hasLink ? 'var(--cursor-pointer)' : 'var(--cursor-default)'};
    `;
    const img = document.createElement('img');
    img.src = item.poster;
    img.alt = '';
    img.style.cssText = 'display: block; width: 100%; height: auto;';
    posterEl.appendChild(img);
    (side ? document.getElementById('homepage-marquee-stack') : wrap).appendChild(posterEl);
    if (hasLink && !isVideo) posterEl.addEventListener('click', () => window.open(item.url, '_blank'));
  }

  const b = { el: wrap, row, link, btn, lines, posterEl, item, isVideo, hasLink: hasLink && !isVideo, rotation, side, width: totalWidth, color: squareColor, _posterH: 0 };
  setBtnState(b, !posterEl);
  return b;
}

// 手機右邊鈕三態（點擊在 bindBannerInteraction）：open ↑ 開海報／link ↗ 跳連結（海報開著或沒海報）／close ↓ 收合（有海報沒連結）
const BTN_STATES = {
  open:  ['icon-arrow-up',   '展開海報 Show poster'],
  link:  ['icon-share',      '前往連結 Open link'],
  close: ['icon-arrow-down', '收合海報 Hide poster'],
};
function setBtnState(b, posterOpen, animate = false) {
  if (!b.btn) return;
  const state = !posterOpen ? 'open' : b.hasLink ? 'link' : 'close';
  const [icon, label] = BTN_STATES[state];
  b.btn.dataset.state = state;   // 點擊判斷立刻換；icon 等藏好才換
  b.btn.setAttribute('aria-label', label);
  const iconEl = /** @type {HTMLElement} */ (b.btn.firstChild);
  if (!animate || typeof gsap === 'undefined') { iconEl.className = `icon ${icon}`; return; }
  // 換 icon＝整顆鈕往左出去、換好從左邊回來（遮罩＝.hm-banner-btn-clip 貼鈕大小；user 2026-10-29「是 btn 不是 icon」）；
  // 每半段 DUR.base 同 header 鈕換 icon；多滑 12 防貼邊留縫（同 header BAR_HIDE_BUFFER）
  const btn = b.btn;
  const off = -(btn.offsetWidth + 12);
  gsap.killTweensOf(btn);
  gsap.to(btn, {
    x: off, duration: DUR.base, ease: EASE.exit,
    onComplete: () => {
      iconEl.className = `icon ${icon}`;
      gsap.fromTo(btn, { x: off }, { x: 0, duration: DUR.base, ease: EASE.enter, clearProps: 'transform' });
    },
  });
}

// 海報寬＝marquee 寬（手機扣掉右邊鈕）；側邊海報在右欄、不跟 banner
const posterWidth = (b) => (b.side ? sideColW() : b.width - (b.btn?.offsetWidth || 0));

// 文字放得下 banner 時停掉橫向捲動（否則單則短 news 也一直滑，看起來像一直刷新）；
// 需 banner 已進 DOM 才能量寬。clone 是為無縫 loop 準備的第二份，靜態時藏起來避免看到兩份。逐行獨立 gate。
// 海報（寬＝banner 寬）在 room 內放不下 → banner 整條等比收窄。需在 gateMarqueeScroll（量寬）與 bind（算 _posterH）之前呼叫。
// ponytail: 視窗高只在建立 banner 時量（同寬度決定時機）；resize 後新進場的 banner 才吃新高度，舊的由 openPoster 保底
function fitBannerToRoom(b, room) {
  const r = b.item.ratio;
  if (b.side || !b.posterEl || !r || posterWidth(b) * r <= room) return;
  b.width = Math.max(MIN_BANNER_W, Math.floor(room / r) + (b.width - posterWidth(b)));
  b.el.style.width = `${b.width}px`;
}

function gateMarqueeScroll(b) {
  // duration＝像素制（全域 marqueeSpeed()，桌面 80/手機 60）；loop 一輪位移 = -50% = 一份 copy 寬。
  // 兩行共用同一 duration（取較長行）＝同拍循環、loop 接縫不脫節（短行等比慢，同 buildSyncedMarqueeTimeline 慣例）
  const widths = (b.lines || []).map(line => line.textEl.getBoundingClientRect().width);
  const duration = Math.max(3, Math.max(0, ...widths) / marqueeSpeed());
  (b.lines || []).forEach((line, i) => {
    const fits = widths[i] <= line.viewport.clientWidth;
    line.inner.style.animationName = fits ? 'none' : '';
    line.cloneEl.style.display = fits ? 'none' : '';
    if (fits) line.textEl.textContent = line.textEl.textContent.trimEnd();   // 行尾 em space 是 loop 接縫用；不捲時留著＝貼字寬的框右邊多一截空白
    line.inner.style.animationDuration = `${duration}s`;
  });
}

function applySlotTransform(b, slotIndex, animate) {
  const cfg = slotConfigs()[slotIndex];
  // rotation 取 banner 自帶（item-bound）；slot 只決定 (x, y) 同 left x → 左對齊
  const props = { x: cfg.x, y: cfg.y, rotation: b.rotation };
  if (animate) {
    // 沿用 about resources accordion 的平移節奏：power2.inOut 0.6s
    gsap.to(b.el, { ...props, duration: DUR.slow, ease: EASE.move });
  } else {
    gsap.set(b.el, props);
  }
}

function enterBanner(b) {
  // 新進場：clip-reveal — row 從 clip-wrap 底邊 yPercent:100→0 滑入原地揭露（hero 式，取代原 clip-path wipe）。
  // rotation 掛在外層 b.el（已 item-bound）＝打破 slot 視覺連續性、不會再「跟著往上」（見 memory
  // feedback_clip_reveal_context_overrides_ypercent：clip-path 曾是 slot-bound rotation 的治標，現已可回 yPercent）。
  // delay ENTER_DELAY → 等前面的 exit + 平移先進行一陣子才開始 reveal
  gsap.fromTo(b.row,
    { yPercent: 110 },
    { yPercent: 0, duration: DUR.reveal, ease: EASE.enter, delay: ENTER_DELAY }
  );
}

function exitBanner(b) {
  // 退場期間 disable 互動
  if (b.posterEl) {
    gsap.killTweensOf(b.posterEl);
    b.posterEl.style.maxHeight = '0';
    b.posterEl.style.pointerEvents = 'none';
  }
  const clipWrap = b.el.querySelector('.hm-banner-clip');
  if (clipWrap) clipWrap.style.pointerEvents = 'none';
  // 第一個 row 整列 yPercent 上滑出 clip-wrap；duration 短於 survivor 0.6s 平移 → 不 overlap
  gsap.to(b.row, {
    yPercent: -110,
    duration: DUR.fast,
    ease: EASE.enterSoft,
    onComplete: () => { b.el.remove(); b.posterEl?.remove(); },
  });
}

function bindBannerInteraction(b, onEnter, onLeave, pushAbove, restoreAbove) {
  const img = b.posterEl?.querySelector('img');
  const posterW = () => posterWidth(b);
  if (img) {
    const calc = () => {
      if (img.naturalWidth) {
        b._posterH = Math.round(img.naturalHeight / img.naturalWidth * posterW());
      }
    };
    if (img.complete && img.naturalWidth) calc();
    else img.addEventListener('load', calc, { once: true });
  }

  // ── 開展 / 收合 helper（hover 跟 click 共用）──
  // poster 展收與 pushAbove/restoreAbove 同 PUSH_DUR/PUSH_EASE（同一 GSAP tick 推進）→ 兩者每幀等距
  const openPoster = () => {
    onEnter();
    if (b.posterEl && b._posterH) {
      // 先收另一張（onEnter 在前＝hover 計數不歸零、不閃）；側邊海報再移到 stack 最後＝長出來時蓋在收合中那張上面
      if (closeOpenPoster !== closePoster) closeOpenPoster?.();
      closeOpenPoster = closePoster;
      if (b.side) b.posterEl.parentNode.appendChild(b.posterEl);
      // 保底：banner 已收窄到 MIN_BANNER_W 仍放不下（極矮視窗）／resize 變矮 → 海報再縮、比 bar 窄（靠左）。
      // 側邊海報底固定＝可長的高是它的底到上界
      const anchorY = b.side ? b.posterEl.getBoundingClientRect().bottom : b.row.getBoundingClientRect().top;
      const room = Math.max(0, anchorY - POSTER_TOP_GAP);
      b._openH = Math.min(b._posterH, room);
      b.posterEl.style.width = `${b._openH / b._posterH * posterW()}px`;
      b.el.classList.add('is-poster-open');   // 抬過 header logo（lists.css .hm-banner）；也是開合狀態
      setBtnState(b, true, true);
      // 只長到圖高（舊 +20 是 max-height 超過內容高的空跑段、視覺不變，但 push 也 +20 → 海報上方多出 20px 假 gap）
      gsap.to(b.posterEl, { maxHeight: b._openH, duration: PUSH_DUR, ease: PUSH_EASE, overwrite: 'auto' });
      if (!b.side) pushAbove(b);
    }
  };
  const closePoster = () => {
    if (b.posterEl) {
      if (closeOpenPoster === closePoster) closeOpenPoster = null;
      b.el.classList.remove('is-poster-open');
      setBtnState(b, false, true);
      gsap.to(b.posterEl, { maxHeight: 0, duration: PUSH_DUR, ease: PUSH_EASE, overwrite: 'auto' });
      if (!b.side) restoreAbove(b);
    }
    onLeave();
  };

  // 影片 news：點 bar 開播放器（手機有海報時 bar 照舊 toggle 海報、點海報才開）；播放中算一次 hover＝暫停 cycle，收完才放
  if (b.isVideo) {
    const play = (e) => { e.preventDefault(); e.stopPropagation(); if (openWatch(b, onLeave)) onEnter(); };
    b.posterEl?.addEventListener('click', play);
    if (!b.posterEl || !SCCDHelpers.isMobileLayout()) b.link.addEventListener('click', play);
  }

  // 手機右邊鈕（createBanner 只在手機建）：↑ 開海報、↗ 跳連結、↓ 收合（setBtnState 三態）
  b.btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = b.btn.dataset.state;
    if (s === 'link') window.open(b.item.url, '_blank');
    else if (s === 'close') closePoster();
    else openPoster();
  });

  if (!b.posterEl && SCCDHelpers.isMobileLayout()) {
    // 手機沒海報：沒東西可 toggle，點 bar＝直接跳連結／開影片
  } else if (SCCDHelpers.isMobileLayout()) {
    // 手機：點 title (link / row) toggle poster 展開；poster 自己有 click → 跳轉（保留）
    // link <a> 預設 click 會跳轉，preventDefault 改成 toggle
    const toggleHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.el.classList.contains('is-poster-open')) closePoster();
      else openPoster();
    };
    b.link.addEventListener('click', toggleHandler);
    // poster 自己點 = 跳轉（在 createBanner 已綁，stopPropagation 避免冒泡到 toggle）
    if (b.posterEl) {
      b.posterEl.addEventListener('click', (e) => e.stopPropagation());
    }
  } else {
    // 桌面：hover 開展 + 抽新角（全站卡片 hover 語彙），離開收合、角度保持（user 2026-09-28）。
    // 角度仍走本檔小範圍 randomRotation（不用 arrow-spin 的 −4~+6：離開保持後大角會永久疊到上下 banner）；
    // 翻到相反符號＝小範圍內最明顯的變化。寫回 b.rotation 讓之後 cycle 平移沿用新角、不彈回舊角。
    // 同時色塊與 bar 配色對調（user 2026-10-03：bar 吃方塊的 rgb、方塊變 bar 色），瞬間切換
    b.el.addEventListener('mouseenter', () => {
      openPoster();
      b.row.classList.add('is-swap');
      let deg = randomRotation();
      if (Math.sign(deg) === Math.sign(b.rotation)) deg = -deg;
      b.rotation = deg;
      gsap.to(b.el, { rotation: deg, duration: DUR.fast, ease: EASE.enterSoft, overwrite: 'auto' });
    });
    b.el.addEventListener('mouseleave', () => {
      b.row.classList.remove('is-swap');
      closePoster();
    });
  }
}

// ── 影片 news → 首頁播放器 ─────────────────────────────────
// initVideoPlayer 是 module singleton（第一次傳的 opts 一直被用）→ 當前這則的框／收完回呼放模組變數、lambda 讀它
let watchLink = null;
let watchOnClosed = null;
let watchOpening = false;
const isVideoUrl = (url) => isHlsUrl(url) || isDirectVideoUrl(url);

// 關閉時 video-player 把黑底收回當前這條 banner（getCardRect／getCardBg／getCardRadius）；首頁 overlay 不在＝undefined
const videoPlayer = (url) => initVideoPlayer(url, {
  getCardRect: () => watchLink?.getBoundingClientRect(),
  getCardBg: () => (watchLink ? getComputedStyle(watchLink).backgroundColor : '#000'),
  getCardRadius: () => '0',
  onCloseAnimComplete: () => watchOnClosed?.(),
});

// 同色方塊從 banner 框放大蓋滿（底色同步 fade 成黑）→ 黑滿版才 openPlayer（不然全螢幕 overlay 的 video 會從角落露出）。
// 回傳 false＝沒開成
function openWatch(b, onClosed) {
  const player = videoPlayer(b.item.url);
  if (!player || watchOpening || typeof gsap === 'undefined') return false;
  watchOpening = true;
  watchLink = b.link;
  watchOnClosed = onClosed;
  player.preloadVideo(b.item.url);
  const rect = b.link.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const vW = window.innerWidth, vH = window.innerHeight;
  const maxDist = Math.max(...[[0, 0], [vW, 0], [0, vH], [vW, vH]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const targetScale = (maxDist / (Math.min(rect.width, rect.height) / 2)) * 1.1;   // 方塊：短邊的一半撐到最遠角
  const clone = document.createElement('div');
  clone.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; width:${rect.width}px; height:${rect.height}px; margin-left:${-rect.width / 2}px; margin-top:${-rect.height / 2}px; background:${getComputedStyle(b.link).backgroundColor || '#000'}; z-index:10001; transform-origin:center center;`;
  document.body.appendChild(clone);
  gsap.to(clone, {
    scale: targetScale, backgroundColor: '#000', duration: DUR.medium, ease: EASE.exit,
    onComplete: () => {
      player.openPlayer({ accentColor: b.color, url: b.item.url });   // 播放器 UI 色＝這條的 hover 色
      clone.remove();
      watchOpening = false;
    },
  });
  return true;
}

// ── Stack runner ────────────────────────────────────────────

function runMarqueeStack(stack, items) {
  const banners = []; // index 0 = 第一個（最上方 / 最舊），index 2 = 最後一個（最下方 / 最新）
  let cursor = 0;
  let hoverCount = 0;

  // 可見則數 + 貼底偏移：不足 SLOT_COUNT 則時靠底排，第 i 則 → slot (slotOffset + i)。
  // 滿 3 則時 slotOffset=0（行為與舊版完全一致）。pushAbove/restoreAbove 也用 slotOffset 校正。
  const visibleCount = Math.min(SLOT_COUNT, items.length);
  const slotOffset = SLOT_COUNT - visibleCount;
  // 最上層 slot（banner 會輪到那裡）上方可放海報的高：stack 底＝slot y 基準、banner 頂再扣 bar 高與上界
  // （−4＝±1° 旋轉讓 banner 頂角上翹的量，不扣的話 hover 時 openPoster 保底會再縮 1–2px）
  const posterRoom = () => stack.clientHeight + slotConfigs()[slotOffset].y - measuredBarH - POSTER_TOP_GAP - 4;

  // setTimeout-based pause/resume：hover 期間真的「凍結倒數」，離開後用剩餘秒數重排
  // （舊版 setInterval + pending 在 hover 跨 tick 時離開瞬間立刻 advance，視覺上像「沒等夠」）
  let timeoutId = null;
  let scheduledAt = 0;        // Date.now() of current setTimeout 排程時間
  let scheduledDuration = 0;  // 該次 setTimeout 排定的 ms
  let pausedRemaining = 0;    // pause 那一刻剩多少 ms 才該 fire

  function scheduleAdvance(ms) {
    // items ≤ SLOT_COUNT 永不 cycle：line 506 的 early-return 只擋「初始排程」，但 hover 離開的
    // resumeCycle() 仍會呼到這裡 → advance() 是 hoisted function 照樣跑 → 單則 news 被 hover 一下就開始
    // cycle/消失（user 2026-08-19 實測「hover 才發生」）。在唯一啟動點擋掉最保險。
    if (items.length <= SLOT_COUNT) return;
    if (timeoutId) clearTimeout(timeoutId);
    scheduledAt = Date.now();
    scheduledDuration = ms;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      // SPA 離開 index 後 stack 從 DOM 消失，停止自我重排（沿用舊版 isConnected guard）
      if (!stack.isConnected) return;
      advance();
      scheduleAdvance(CYCLE_INTERVAL);
    }, ms);
  }

  function pauseCycle() {
    if (!timeoutId) return;
    const elapsed = Date.now() - scheduledAt;
    pausedRemaining = Math.max(0, scheduledDuration - elapsed);
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function resumeCycle() {
    if (timeoutId) return;
    // 有剩餘就用剩餘排（連續性），無剩餘代表 hover 期間完全沒在排程 → 走完整週期
    scheduleAdvance(pausedRemaining > 0 ? pausedRemaining : CYCLE_INTERVAL);
    pausedRemaining = 0;
  }

  const onEnter = () => {
    hoverCount++;
    if (hoverCount === 1) {
      applyNewsHover();
      pauseCycle();
    }
  };
  const onLeave = () => {
    hoverCount = Math.max(0, hoverCount - 1);
    if (hoverCount === 0) {
      removeNewsHover();
      resumeCycle();
    }
  };

  // hover banner B：把 banners 陣列裡位置在 B 上方的所有 banner 往上推 posterH（仿 about resources accordion 的 push 效果）
  // overwrite: 'auto' 讓 push tween 蓋掉 cycling 平移 tween，避免疊衝突
  function pushAbove(hovered) {
    const idx = banners.indexOf(hovered);
    if (idx <= 0) return; // 最上面 (slot 0) 沒有東西在上方
    const pushAmount = hovered._openH || 0;   // 推開量＝海報展開高（矮螢幕已縮）→ 海報頂到上方 banner 的距離維持 SLOT_GAP
    for (let i = 0; i < idx; i++) {
      const above = banners[i];
      const cfg = slotConfigs()[slotOffset + i];
      gsap.to(above.el, {
        y: cfg.y - pushAmount,
        duration: PUSH_DUR,
        ease: PUSH_EASE,
        overwrite: 'auto',
      });
    }
  }
  function restoreAbove(hovered) {
    const idx = banners.indexOf(hovered);
    if (idx <= 0) return;
    for (let i = 0; i < idx; i++) {
      const above = banners[i];
      const cfg = slotConfigs()[slotOffset + i];
      gsap.to(above.el, {
        y: cfg.y,
        duration: PUSH_DUR,
        ease: PUSH_EASE,
        overwrite: 'auto',
      });
    }
  }

  // 初始排列：靠底（slotOffset 已在上方算好）→ 單則落最底 slot，不懸在 slot 0 留空白
  for (let i = 0; i < visibleCount; i++) {
    // 顏色仍依 item 順序 R/G/B（不足 3 個用前 N 個顏色）
    const b = createBanner(items[i], SCCDHelpers.ACCENT_COLORS[i % SCCDHelpers.ACCENT_COLORS.length]);
    stack.appendChild(b.el);
    // 首個 banner 進 DOM 後量 bar 實高（中英兩行 > 舊常數 40）→ slotConfigs 以實高排 slot 間距
    if (i === 0) {
      measuredBarH = b.el.offsetHeight || BAR_HEIGHT;
    }
    fitBannerToRoom(b, posterRoom());
    gateMarqueeScroll(b);
    applySlotTransform(b, slotOffset + i, false);
    bindBannerInteraction(b, onEnter, onLeave, pushAbove, restoreAbove);
    banners.push(b);
    // 進場前先藏在 clip-wrap 底邊下（clip-reveal 起點；initial banner 原本 instant 顯示、無進場）
    if (typeof gsap !== 'undefined') gsap.set(b.row, { yPercent: 110 });   // 藏起量 110 非 100：banner 帶旋轉，row 剛好貼齊遮罩邊會留 1px 反鋸齒縫（全站 revealHidden ±110 慣例；user 2026-10-26 離頁退場看到縫）
  }
  cursor = visibleCount % items.length;

  // 進場：initial banner clip-reveal（yPercent:100→0）stagger 揭露（同 enterBanner）。
  // 首頁進場順序（user 2026-10-21）：news 與 logo／header 同時（delay 0）、floating 最後。
  if (typeof gsap !== 'undefined') {
    banners.forEach((b, i) => gsap.to(b.row, {
      yPercent: 0, duration: DUR.reveal, ease: EASE.enter, delay: i * 0.12,
    }));
  }

  // 離頁退場：停 cycle + 當前 banner clip-reveal 收回（yPercent:0→100 沉回底邊，reveal 的反向）。
  // fromTo 顯式起點避免 to-from-none snap。
  registerPageExit(() => new Promise(resolve => {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (typeof gsap === 'undefined' || !banners.length) { resolve(); return; }
    let done = 0;
    const onOne = () => { if (++done >= banners.length) resolve(); };
    banners.forEach((b, i) => gsap.fromTo(b.row,
      { yPercent: 0 },
      { yPercent: 110, duration: DUR.medium, ease: EASE.exit, delay: i * 0.06, overwrite: true, onComplete: onOne }));
  }));

  // 轉向重建用：清 timer、殺 tween、拔 banner DOM、還原 hover 態；呼叫後本 closure 全部退役
  //（舊 registerPageExit handler 留著無害：banners 已空 → 立即 resolve）
  function dispose() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (typeof gsap !== 'undefined') banners.forEach(b => gsap.killTweensOf([b.el, b.row]));
    banners.forEach(b => { b.el.remove(); b.posterEl?.remove(); });
    banners.length = 0;
    closeOpenPoster = null;
    hoverCount = 0;
    removeNewsHover();
  }

  if (items.length <= SLOT_COUNT) return dispose;

  function advance() {
    if (!stack.isConnected) return;

    const exiting = banners.shift();
    const inheritedColor = exiting.color;  // 新進場 banner 補上消失那個的顏色
    exitBanner(exiting);

    for (let i = 0; i < banners.length; i++) {
      applySlotTransform(banners[i], i, true);
    }

    const newItem = items[cursor];
    cursor = (cursor + 1) % items.length;
    const nb = createBanner(newItem, inheritedColor);
    stack.appendChild(nb.el);
    fitBannerToRoom(nb, posterRoom());
    gateMarqueeScroll(nb);
    applySlotTransform(nb, SLOT_COUNT - 1, false);
    bindBannerInteraction(nb, onEnter, onLeave, pushAbove, restoreAbove);
    enterBanner(nb);
    banners.push(nb);
  }

  scheduleAdvance(CYCLE_INTERVAL);
  return dispose;
}
