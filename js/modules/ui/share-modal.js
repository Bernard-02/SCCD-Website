/**
 * Share Lightbox（site-wide component）
 * 任何頁面只要按鈕加 [data-share-btn] 就會自動彈出 QR code + 可複製連結
 * URL 規則：頁面 .list-item#item-<id> + [id^="panel-"] → ?section=X&item=Y；否則用 base URL
 *
 * 用法：app boot 時 `initShareModal()` 一次（main-modular.js 全域 init 區段）
 * 之後加新頁面/新按鈕完全不用改這個檔
 */

import { enterLightboxMode, exitLightboxMode } from './../lightbox/lightbox-shell.js';
import { DUR, EASE } from './motion.js';
import { ensureCardMask, revealHidden, randomRevealDir } from './scroll-animate.js';
import { bindArrowSpin } from './arrow-spin.js';

let initialized = false;
let shareOpen = false;
let closing = false;
// 已 prefetch 過的 URL — 避免同一個 share btn 被 hover/touch 多次重複 fetch
const prefetchedUrls = new Set();

// mode1/2 卡片底色隨機三原色，跟 list hover 共用同一 source（SCCDHelpers.getRandomAccentColor：
// 同三原色 + 不重複上次邏輯）確保永不 drift；mode3(color) 維持白底。
function randomAccent() {
  return SCCDHelpers.getRandomAccentColor();
}

// 4 向遮罩滑入：dir → 隱藏起點 revealHidden(dir)（xPercent/yPercent ±110，藏在該側遮罩外）
// 進場 fromTo 從隱藏起點→0；退場 to 同 dir 反推（來去同一側）。卡片與 QR 共用當次方向。
// ⚠️兩軸都要寫：只寫單軸時，上次左右退場留在 xPercent 的 ±110 不會被歸零 → 下次換上下進場從 (∓110, ±110)
// 斜著滑入＝「卡片從角落進來」（user 2026-10-01 報，headless 重現 open#2 首幀 x=-85% y=85%）
let revealDir = 'bottom';
let backDir = 'bottom';   // 角上返回鍵自己的 clip-reveal 方向（同 slide-in 返回鍵：跟卡片各抽各的）


function getQrEndpoint(url, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

// 從 [data-share-btn] 推算 share URL — 跟 click handler 用同一份邏輯（必須產生同 URL 才能 cache hit）
function computeShareUrl(btn) {
  // 顯式 data-share-url（如 lightbox 內 album 分享按鈕）優先：caller 已算好完整網址，不靠 .list-item / panel 推算
  if (btn.dataset && btn.dataset.shareUrl) return btn.dataset.shareUrl;
  const base = window.location.href.split('?')[0];
  const listItem = btn.closest('.list-item');
  const itemId   = listItem?.id?.replace(/^item-/, '');
  const panel    = btn.closest('[id^="panel-"]');
  const section  = panel?.id?.replace(/^panel-/, '');
  if (section && itemId) return `${base}?section=${section}&item=${itemId}`;
  return base;
}

// Hover / touchstart 預載 QR 進瀏覽器 HTTP cache
// click 時 qrImg.src 設同一 URL → 命中快取 → onload 同步 fire → 視覺即時顯示
// 不命中時 fallback：opacity:0 fade-in 蓋掉「modal 開 + QR 還沒到」的時間窗
function prefetchQr(url) {
  if (prefetchedUrls.has(url)) return;
  prefetchedUrls.add(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = getQrEndpoint(url);
}

// HTML markup 注入 body —— 取代過往寫死在 pages/activities.html
// SPA router 只替換 <main> 內容；HTML 寫在 main 外的 component 永遠不會被 swap 過去，
// 改由 JS 注入到 document.body 一次（idempotent），所有頁面共用同一份 DOM
// 內層卡片 color:#000 強制黑字，避免 body.mode-inverse / .mode-color 下全域 p/icon 變白色
// 卡片背景寫死白色，跟著 mode 變白字 = 白底白字消失
const LIGHTBOX_HTML = `
  <div id="share-lightbox" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.9); align-items:center; justify-content:center;">
    <!-- stage＝卡片（ensureCardMask 包遮罩）＋角上返回鍵共用的傾斜層：隨機傾角套這層（見 openShareLightbox），
         返回鍵在卡片遮罩之外＝凸出卡片的半顆不被裁 -->
    <div id="share-lightbox-stage" style="position:relative; display:flex;"><!-- flex：遮罩 inline-block 在 block 裡會多出基線空白、stage 比卡高、旋轉中心偏 -->
    <!-- 版面（user 2026-10-01 截圖＋二改＋三改）：QR ／ 複製圖片・下載 ／ 網址＋小複製鈕（標題列已撤，返回鍵改騎卡片左上角）。
         上下 padding＝各列間距＝同一個 lg 值（user「上下一致、內容 gap 也用這個 padding」）；
         網址列寬＝QR 寬 200 置中＝左右緣對齊 QR，網址過長 CSS 省略號截斷 -->
    <div id="share-lightbox-card" style="background:#fff; color:#000; width:320px; padding: var(--spacing-lg) var(--spacing-md); display:flex; flex-direction:column; gap: var(--spacing-lg);">
      <div class="flex justify-center">
        <!-- mix-blend-mode:multiply → 白底像素乘上卡片色 = 視覺透明；黑模組維持黑（白卡 mode3 也無害）。下載走 canvas 另存白底原圖，不受此影響 -->
        <img id="share-qr-img" src="" alt="QR Code" style="width:200px;height:200px;display:block;opacity:0;transition:opacity 0.25s ease;mix-blend-mode:multiply;">
      </div>
      <div style="display:flex; justify-content:center; gap: var(--spacing-xl);">
        <button id="share-copy-qr-btn" aria-label="複製 QR Code 圖片 Copy QR Code image" style="line-height:1; color:#000;">
          <span class="icon icon-copy icon-xl"></span>
        </button>
        <button id="share-download-btn" aria-label="下載 QR Code Download QR Code" style="line-height:1; color:#000;">
          <span class="icon icon-download icon-xl"></span>
        </button>
      </div>
      <div style="display:flex; align-items:center; gap: var(--spacing-sm); width:200px; margin: 0 auto;">
        <p id="share-url-text" class="text-s" style="flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#000;"></p>
        <button id="share-url-copy-btn" aria-label="複製連結 Copy Link" style="flex:none; line-height:1; color:#000;">
          <span class="icon icon-copy icon-l"></span>
        </button>
      </div>
    </div>
    <!-- 返回鍵（user 2026-10-01 三改）：全站黑方塊箭頭鈕（同 slide-in .slide-in-back-square）騎在卡片左上角——中心＝角
         （margin 拉回半顆，不用 translate＝transform 留給 hover 抽角）。外層＝遮罩（overflow:clip）、內層 #share-back-inner
         平移做四向 clip-reveal。黑底白箭頭＝同 slide-in 返回鍵（user 2026-10-01 四改；原反色白底黑箭頭已撤） -->
    <button id="share-lightbox-close" aria-label="關閉 Close" style="position:absolute; top:0; left:0; width:48px; height:48px; margin:-24px 0 0 -24px; padding:0; border:0; background:none; overflow:clip; transition:transform var(--dur-fast) var(--ease-standard);">
      <span id="share-back-inner" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:#000; color:#fff;">
        <span class="icon icon-arrow-left icon-l"></span>
      </span>
    </button>
    </div>
  </div>
`;

function injectHtml() {
  if (document.getElementById('share-lightbox')) return;
  document.body.insertAdjacentHTML('beforeend', LIGHTBOX_HTML);
}

function openShareLightbox(url, bg) {
  const lightbox = document.getElementById('share-lightbox');
  const card = document.getElementById('share-lightbox-card');
  if (!lightbox || !card) return;

  // 本次開啟隨機挑一個滑入方向；卡片 + QR 共用，close 反推同方向出場
  revealDir = randomRevealDir();

  // 卡片底色（文字始終黑）：
  //   bg 明確帶入（library share btn 帶 title 渲染色）→ 直接用，讓卡片跟 title 同色
  //   否則 mode3(color) 維持白；mode1/2 隨機三原色（同 list hover source）
  card.style.background = bg
    || (document.body.classList.contains('mode-color') ? '#fff' : randomAccent());

  // share-lightbox 在 boot 時就 inject（DOM 早於 lazy 建立的 album lightbox）→ 同 z-9999 下會被後者蓋住；
  // 開啟時 re-append 到 body 尾端，確保疊在已開的 lightbox 之上（從 lightbox 內 share btn 點開的情境）
  document.body.appendChild(lightbox);

  // 填入 QR code 與 URL — crossOrigin 給 download 走 canvas 去背用
  // hover/touch 預先 prefetchQr 過時，這裡 src 設同 URL → HTTP cache hit → 即時（complete=true）直接顯示
  // 沒命中（有 delay）→ 遮罩滑入蓋掉等待空窗（跟卡片同方向、統一站上 clip-reveal 慣例，取代舊 clip-path wipe）
  const qrImg = /** @type {HTMLImageElement} */ (document.getElementById('share-qr-img'));
  qrImg.crossOrigin = 'anonymous';
  qrImg.style.opacity = '1';
  qrImg.onload = null;
  if (typeof gsap !== 'undefined') ensureCardMask(qrImg); // 貼身遮罩，讓 ±110 平移藏得掉
  qrImg.src = getQrEndpoint(url);
  if (typeof gsap !== 'undefined' && !(qrImg.complete && qrImg.naturalWidth)) {
    // 有 delay：先藏在遮罩外，onload 後滑入（同卡片方向）
    gsap.set(qrImg, revealHidden(revealDir));
    qrImg.onload = () => gsap.fromTo(qrImg,
      revealHidden(revealDir),
      { xPercent: 0, yPercent: 0, duration: DUR.slow, ease: EASE.enter, overwrite: true, clearProps: 'transform' });
  } else if (typeof gsap !== 'undefined') {
    gsap.set(qrImg, { clearProps: 'transform' }); // 命中快取：清掉上次殘留 transform，維持原位直接顯示
  }
  // 網址列：顯示去掉 https://（截圖版），過長交給 CSS 省略號；複製／下載一律讀 dataset.fullUrl 完整網址
  const urlEl = /** @type {HTMLElement} */ (document.getElementById('share-url-text'));
  urlEl.textContent = url.replace(/^https?:\/\//, '');
  urlEl.dataset.fullUrl = url;

  lightbox.style.display = 'flex';
  // 背景遮罩 fade in：display:none→flex 會讓 rgba(0,0,0,0.9) 黑幕瞬間疊上（user 反映「instant 疊加」）。
  // 只 fade 遮罩底色（卡片另走 clip-path reveal，兩者獨立 → 卡片維持「不配 opacity fade」慣例）。
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(lightbox,
      { backgroundColor: 'rgba(0,0,0,0)' },
      { backgroundColor: 'rgba(0,0,0,0.9)', duration: DUR.slow, ease: EASE.enter, overwrite: true });
  }
  // 卡片停定是斜的、進退場本身不轉（user 2026-10-01 二改「先旋轉再進場」）：先把 stage（卡片遮罩＋角上返回鍵的
  // 共同外層）set 到隨機角（全站卡片角度 helper，同左下當前頁卡），卡片再沿當次方向滑入遮罩——遮罩跟著斜、卡角不被切。
  // fromTo 確保 from-state 強制套用（避 first-open 從殘留 transform 跳終值）
  if (typeof gsap !== 'undefined') {
    ensureCardMask(card);
    const stage = document.getElementById('share-lightbox-stage');
    if (stage) gsap.set(stage, { rotation: SCCDHelpers.getRandomRotation() });
    gsap.fromTo(card,
      revealHidden(revealDir),
      { xPercent: 0, yPercent: 0, duration: DUR.slow, ease: EASE.enter, overwrite: true }
    );
    // 角上返回鍵：每次開重抽微傾角＋隨機四向，卡片滑到一半（0.3s，同 slide-in 返回鍵跟 panel 的 offset）自己 clip-reveal 進場；
    // fromTo 兩軸都寫＝洗掉上次退場殘留的另一軸
    const closeBtn = document.getElementById('share-lightbox-close');
    /** @type {any} */ (closeBtn)?._arrowSpin?.reroll();
    backDir = randomRevealDir();
    gsap.fromTo('#share-back-inner',
      revealHidden(backDir),
      { xPercent: 0, yPercent: 0, duration: DUR.medium, ease: EASE.enter, delay: 0.3, overwrite: true }
    );
  }

  if (!shareOpen) {
    shareOpen = true;
    enterLightboxMode();
  }
}

function closeShareLightbox() {
  const lightbox = document.getElementById('share-lightbox');
  const card = document.getElementById('share-lightbox-card');
  if (!lightbox || !card) return;
  if (closing) return;

  const finish = () => {
    closing = false;
    lightbox.style.display = 'none';
    lightbox.style.backgroundColor = ''; // 還原 HTML inline 預設 0.9，下次開再 fromTo
    if (shareOpen) {
      shareOpen = false;
      exitLightboxMode();
    }
  };

  // 退場 clip-reveal：卡片沿進場方向反向滑出遮罩（同 dir、來去同一側）
  if (typeof gsap !== 'undefined') {
    closing = true;
    // 背景遮罩同步 fade out（對稱進場）；角上返回鍵沿自己的進場方向滑回
    gsap.to(lightbox, { backgroundColor: 'rgba(0,0,0,0)', duration: DUR.medium, ease: EASE.exit, overwrite: true });
    gsap.to('#share-back-inner', { ...revealHidden(backDir), duration: DUR.medium, ease: EASE.exit, overwrite: true });
    gsap.to(card, {
      ...revealHidden(revealDir),
      duration: DUR.medium,
      ease: EASE.exit,
      overwrite: true,
      onComplete: finish,
    });
  } else {
    finish();
  }
}

// 原始白底黑碼 QR PNG（顯示用 multiply 去背只影響畫面，下載／複製一律白底原設計）：
// 顯示用 200×200，這裡另抓 512×512 高解析版（同 URL data，不同 size 參數）→ canvas → blob。
// 跨網域圖不能直接 <a download>／寫剪貼簿 → 經 canvas（crossOrigin anonymous，qrserver 有 CORS）
function qrPngBlob() {
  const url = /** @type {HTMLElement | null} */ (document.getElementById('share-url-text'))?.dataset.fullUrl;
  if (!url) return Promise.reject(new Error('share: no url'));
  return new Promise((resolve, reject) => {
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      canvas.getContext('2d')?.drawImage(imgEl, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('share: toBlob failed'))), 'image/png');
    };
    imgEl.onerror = reject;
    imgEl.src = getQrEndpoint(url, 512);
  });
}

async function downloadQr() {
  const blob = await qrPngBlob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `sccd-qrcode-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// 複製 QR 圖片（user 2026-10-01：QR 下方大複製鈕＝圖片、網址列小鈕＝連結）。
// write() 必須在 click 當下同步呼叫、blob 以 Promise 傳入 ClipboardItem（Safari 的 user-activation 限制；Chrome 也吃）
function copyQrImage() {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
  navigator.clipboard.write([new ClipboardItem({ 'image/png': qrPngBlob() })]).catch(() => {});
}

export function initShareModal() {
  // 一次 init：注入 DOM + 綁所有 listener（document delegation 已經 site-wide，重複 init 會疊監聽器）
  if (initialized) return;
  initialized = true;
  injectHtml();

  // 關閉：角上返回鍵。hover 抽角（arrow-spin，同 slide-in 返回鍵；角度寫外層遮罩、HTML inline transition 補間）
  // ＋ hover 隨機三原色底黑箭頭（同 slide-in 返回鍵 cards.css .slide-in-back-square 段；mode3 無 rgb → 同款翻 fg-inverse 底），桌面 hover 裝置才綁
  const closeBtn = document.getElementById('share-lightbox-close');
  const backInner = document.getElementById('share-back-inner');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeShareLightbox);
    bindArrowSpin(closeBtn, (d) => { closeBtn.style.transform = `rotate(${d}deg)`; });
    if (backInner && window.matchMedia('(hover: hover) and (min-width: 768px)').matches) {
      closeBtn.addEventListener('mouseenter', () => {
        const m3 = document.body.classList.contains('mode-color');
        backInner.style.background = m3 ? 'var(--theme-fg-inverse)' : randomAccent();
        backInner.style.color = m3 ? 'var(--theme-fg)' : '#000';
      });
      closeBtn.addEventListener('mouseleave', () => { backInner.style.background = '#000'; backInner.style.color = '#fff'; });
    }
  }

  // 關閉：點擊背景 overlay
  document.getElementById('share-lightbox')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeShareLightbox();
  });

  // 關閉：ESC 鍵
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareLightbox();
  });

  // QR 下方大鈕＝複製 QR 圖片；網址列小鈕＝複製連結
  document.getElementById('share-copy-qr-btn')?.addEventListener('click', copyQrImage);
  document.getElementById('share-url-copy-btn')?.addEventListener('click', () => {
    const url = document.getElementById('share-url-text')?.dataset.fullUrl;
    if (url) navigator.clipboard.writeText(url);
  });

  // 下載按鈕 → 白底 QR PNG
  document.getElementById('share-download-btn')?.addEventListener('click', () => { downloadQr().catch(() => {}); });

  // Share btn delegation（支援任何頁面的 [data-share-btn]）
  document.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-share-btn]');
    if (!btn) return;
    // 卡片底色優先序：① data-share-bg（library viewer / album 帶 title 渲染色）
    // ② list-item 當前 hover/open 色（.list-header 或 degree-show 卡的 dataset.accentHex）→ 卡片跟 hover 同色
    // ③ 都沒有走 openShareLightbox 內 mode 隨機規則。mode-color 下 list 視覺是 strict B/W（非 accentHex），
    //    不讀 accentHex，交回既有白卡邏輯。
    const listBg = document.body.classList.contains('mode-color')
      ? undefined
      : /** @type {HTMLElement | null} */ (btn.closest('.list-header, .degree-show-card-content'))?.dataset.accentHex;
    openShareLightbox(computeShareUrl(btn), btn.dataset.shareBg || listBg);
  });

  // Hover prefetch — 桌面 user hover 過後 QR 已在 HTTP cache，點擊瞬間 onload 即觸發
  // mouseover (bubbles) 而非 mouseenter (不 bubble) 才能 document-level delegate；e.target.closest 過濾子元素重複觸發
  document.addEventListener('mouseover', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest?.('[data-share-btn]');
    if (!btn) return;
    prefetchQr(computeShareUrl(btn));
  });

  // Touch prefetch — 手機沒 hover；touchstart 在 click 前 ~300ms（含 tap delay）觸發，足以塞滿 cache
  document.addEventListener('touchstart', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest?.('[data-share-btn]');
    if (!btn) return;
    prefetchQr(computeShareUrl(btn));
  }, { passive: true });
}
