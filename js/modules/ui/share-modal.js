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
import { ensureCardMask } from './scroll-animate.js';

let initialized = false;
let shareOpen = false;
let closing = false;
// 已 prefetch 過的 URL — 避免同一個 share btn 被 hover/touch 多次重複 fetch
const prefetchedUrls = new Set();

// mode1/2 卡片底色隨機三原色，跟 list hover 共用同一 source（SCCDHelpers.getRandomAccentColor：
// 同三原色 + 不重複上次邏輯）確保永不 drift；mode3(color) 維持白底。fallback 防 helper 未載入。
const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
function randomAccent() {
  return window.SCCDHelpers?.getRandomAccentColor?.()
    ?? ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
}

// 4 向遮罩滑入：dir → 隱藏起點（xPercent/yPercent ±110，藏在該側遮罩外）
// 進場 fromTo 從隱藏起點→0；退場 to 同 dir 反推（來去同一側）。卡片與 QR 共用當次方向。
const REVEAL_DIRS = {
  bottom: { yPercent: 110 },
  top:    { yPercent: -110 },
  right:  { xPercent: 110 },
  left:   { xPercent: -110 },
};
const REVEAL_DIR_KEYS = Object.keys(REVEAL_DIRS);
let revealDir = 'bottom';

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
    <div id="share-lightbox-card" style="background:#fff; color:#000; width:320px; padding: var(--spacing-md); display:flex; flex-direction:column; gap: var(--spacing-md);">
      <!-- gap-sm + icon-m (20px) → title 起點 = 20+16 = 36px，對齊 QR (200px) 在內容寬 (320-48=272) 居中時的左 offset (272-200)/2=36px -->
      <div style="display:flex; align-items:center; gap: var(--spacing-sm);">
        <button id="share-lightbox-close" style="line-height:1; color:#000;" aria-label="關閉 Close">
          <span class="icon icon-arrow-left-thin icon-m"></span>
        </button>
        <p class="font-bold" style="font-size: 1rem; color:#000;">Share 分享</p>
      </div>
      <div class="flex justify-center">
        <!-- mix-blend-mode:multiply → 白底像素乘上卡片色 = 視覺透明；黑模組維持黑（白卡 mode3 也無害）。下載走 canvas 另存白底原圖，不受此影響 -->
        <img id="share-qr-img" src="" alt="QR Code" style="width:200px;height:200px;display:block;opacity:0;transition:opacity 0.25s ease;mix-blend-mode:multiply;">
      </div>
      <div style="display:flex; justify-content:center; gap: var(--spacing-xl);">
        <button id="share-copy-btn" aria-label="複製連結 Copy Link" style="line-height:1; color:#000;">
          <span class="icon icon-copy icon-xl"></span>
        </button>
        <button id="share-download-btn" aria-label="下載 QR Code Download QR Code" style="line-height:1; color:#000;">
          <span class="icon icon-download icon-xl"></span>
        </button>
      </div>
      <p id="share-url-text" style="display:none;"></p>
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
  revealDir = REVEAL_DIR_KEYS[Math.floor(Math.random() * REVEAL_DIR_KEYS.length)];

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
    gsap.set(qrImg, REVEAL_DIRS[revealDir]);
    qrImg.onload = () => gsap.fromTo(qrImg,
      REVEAL_DIRS[revealDir],
      { xPercent: 0, yPercent: 0, duration: DUR.slow, ease: EASE.enter, overwrite: true, clearProps: 'transform' });
  } else if (typeof gsap !== 'undefined') {
    gsap.set(qrImg, { clearProps: 'transform' }); // 命中快取：清掉上次殘留 transform，維持原位直接顯示
  }
  const MAX_URL_LEN = 50;
  const urlEl = /** @type {HTMLElement} */ (document.getElementById('share-url-text'));
  urlEl.textContent = url.length > MAX_URL_LEN ? url.slice(0, MAX_URL_LEN) : url;
  urlEl.dataset.fullUrl = url;

  lightbox.style.display = 'flex';
  // 背景遮罩 fade in：display:none→flex 會讓 rgba(0,0,0,0.9) 黑幕瞬間疊上（user 反映「instant 疊加」）。
  // 只 fade 遮罩底色（卡片另走 clip-path reveal，兩者獨立 → 卡片維持「不配 opacity fade」慣例）。
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(lightbox,
      { backgroundColor: 'rgba(0,0,0,0)' },
      { backgroundColor: 'rgba(0,0,0,0.9)', duration: DUR.slow, ease: EASE.enter, overwrite: true });
  }
  // 進場 clip-reveal：卡片沿當次隨機方向滑入貼身遮罩（4 向擇一）
  // fromTo 確保 from-state 強制套用（避 first-open 從殘留 transform 跳終值）
  if (typeof gsap !== 'undefined') {
    ensureCardMask(card);
    gsap.fromTo(card,
      REVEAL_DIRS[revealDir],
      { xPercent: 0, yPercent: 0, duration: DUR.slow, ease: EASE.enter, overwrite: true }
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
    // 背景遮罩同步 fade out（對稱進場）
    gsap.to(lightbox, { backgroundColor: 'rgba(0,0,0,0)', duration: DUR.medium, ease: EASE.exit, overwrite: true });
    gsap.to(card, {
      ...REVEAL_DIRS[revealDir],
      duration: DUR.medium,
      ease: EASE.exit,
      overwrite: true,
      onComplete: finish,
    });
  } else {
    finish();
  }
}

// 下載原始白底黑碼 QR PNG（顯示用 multiply 去背只影響畫面，存檔一律白底原設計）
// 跨網域直接 <a download> 不會強制存檔 → 走 canvas → blob 保留檔名與下載行為
async function downloadTransparentQr() {
  const img = /** @type {HTMLImageElement | null} */ (document.getElementById('share-qr-img'));
  if (!img?.src) return;
  // 顯示用 200×200，下載另抓 512×512 高解析版（同 URL data，不同 size 參數）
  const url = /** @type {HTMLElement | null} */ (document.getElementById('share-url-text'))?.dataset.fullUrl;
  if (!url) return;
  const imgEl = new Image();
  imgEl.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    imgEl.onload = resolve;
    imgEl.onerror = reject;
    imgEl.src = getQrEndpoint(url, 512);
  });
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `sccd-qrcode-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  }, 'image/png');
}

export function initShareModal() {
  // 一次 init：注入 DOM + 綁所有 listener（document delegation 已經 site-wide，重複 init 會疊監聽器）
  if (initialized) return;
  initialized = true;
  injectHtml();

  // 關閉：返回箭頭按鈕
  document.getElementById('share-lightbox-close')?.addEventListener('click', closeShareLightbox);

  // 關閉：點擊背景 overlay
  document.getElementById('share-lightbox')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeShareLightbox();
  });

  // 關閉：ESC 鍵
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareLightbox();
  });

  // 複製 URL 按鈕
  document.getElementById('share-copy-btn')?.addEventListener('click', () => {
    const urlEl = document.getElementById('share-url-text');
    const url = urlEl?.dataset.fullUrl || urlEl?.textContent;
    if (!url) return;
    navigator.clipboard.writeText(url);
  });

  // 下載按鈕 → 去背 QR PNG
  document.getElementById('share-download-btn')?.addEventListener('click', downloadTransparentQr);

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
