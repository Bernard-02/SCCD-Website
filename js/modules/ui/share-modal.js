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

let initialized = false;
let shareOpen = false;
let closing = false;
// 已 prefetch 過的 URL — 避免同一個 share btn 被 hover/touch 多次重複 fetch
const prefetchedUrls = new Set();

// clip-path 進出場：4 方向隨機 inset reveal
// inset 四值全 %（記憶教訓：混用單位 GSAP 跳終值不動畫）
// 'top'    起點 inset(100% 0 0 0)   = 從下往上揭露
// 'right'  起點 inset(0 100% 0 0)   = 從左往右揭露
// 'bottom' 起點 inset(0 0 100% 0)   = 從上往下揭露
// 'left'   起點 inset(0 0 0 100%)   = 從右往左揭露
const DIR_FROM = {
  top:    'inset(100% 0% 0% 0%)',
  right:  'inset(0% 100% 0% 0%)',
  bottom: 'inset(0% 0% 100% 0%)',
  left:   'inset(0% 0% 0% 100%)',
};
const DIR_KEYS = Object.keys(DIR_FROM);
let lastDir = null;

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
    <div id="share-lightbox-card" style="background:#fff; color:#000; width:320px; padding: var(--spacing-md); display:flex; flex-direction:column; gap: var(--spacing-lg);">
      <!-- gap-sm + icon-m (20px) → title 起點 = 20+16 = 36px，對齊 QR (200px) 在內容寬 (320-48=272) 居中時的左 offset (272-200)/2=36px -->
      <div style="display:flex; align-items:center; gap: var(--spacing-sm);">
        <button id="share-lightbox-close" style="line-height:1; color:#000;" aria-label="關閉 Close">
          <span class="icon icon-arrow-left-thin icon-m"></span>
        </button>
        <p class="font-bold" style="font-size: 1rem; color:#000;">Share 分享</p>
      </div>
      <div class="flex justify-center" style="margin-top: var(--spacing-md);">
        <img id="share-qr-img" src="" alt="QR Code" style="width:200px;height:200px;display:block;opacity:0;transition:opacity 0.25s ease;">
      </div>
      <div style="display:flex; justify-content:center; gap: var(--spacing-xl); margin-top: var(--spacing-md);">
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

function pickDir() {
  // 不重複上一輪方向，避免「同向又跑一次」感覺單調
  const pool = lastDir ? DIR_KEYS.filter(d => d !== lastDir) : DIR_KEYS;
  const dir = pool[Math.floor(Math.random() * pool.length)];
  lastDir = dir;
  return dir;
}

function openShareLightbox(url) {
  const lightbox = document.getElementById('share-lightbox');
  const card = document.getElementById('share-lightbox-card');
  if (!lightbox || !card) return;

  // share-lightbox 在 boot 時就 inject（DOM 早於 lazy 建立的 album lightbox）→ 同 z-9999 下會被後者蓋住；
  // 開啟時 re-append 到 body 尾端，確保疊在已開的 lightbox 之上（從 lightbox 內 share btn 點開的情境）
  document.body.appendChild(lightbox);

  // 填入 QR code 與 URL — crossOrigin 給 download 走 canvas 去背用
  // hover/touch 預先 prefetchQr 過時，這裡 src 設同 URL → HTTP cache hit → onload 同步 fire = 即時
  // 沒 prefetch 命中時 opacity:0 → onload 後 fade-in 蓋掉等待空窗
  const qrImg = /** @type {HTMLImageElement} */ (document.getElementById('share-qr-img'));
  qrImg.crossOrigin = 'anonymous';
  qrImg.style.opacity = '0';
  qrImg.onload = () => { qrImg.style.opacity = '1'; };
  qrImg.src = getQrEndpoint(url);
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
  // 進場 clip-path：方向隨機，從一邊揭露整張卡片
  // fromTo 確保 from-state 強制套用（避 first-open 從 'none' 跳終值）
  if (typeof gsap !== 'undefined') {
    const dir = pickDir();
    card.dataset.enterDir = dir;
    gsap.fromTo(card,
      { clipPath: DIR_FROM[dir] },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: DUR.slow,
        ease: EASE.enter,
        overwrite: true,
        onComplete: () => { card.style.clipPath = ''; },
      }
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
    card.style.clipPath = '';
    if (shareOpen) {
      shareOpen = false;
      exitLightboxMode();
    }
  };

  // 退場 clip-path：用同一輪 enter 的方向收回去（對稱感）
  if (typeof gsap !== 'undefined') {
    closing = true;
    // 背景遮罩同步 fade out（對稱進場）
    gsap.to(lightbox, { backgroundColor: 'rgba(0,0,0,0)', duration: DUR.medium, ease: EASE.exit, overwrite: true });
    const dir = card.dataset.enterDir && DIR_FROM[card.dataset.enterDir] ? card.dataset.enterDir : pickDir();
    gsap.fromTo(card,
      { clipPath: 'inset(0% 0% 0% 0%)' },
      {
        clipPath: DIR_FROM[dir],
        duration: DUR.medium,
        ease: EASE.exit,
        overwrite: true,
        onComplete: finish,
      }
    );
  } else {
    finish();
  }
}

// 把 QR PNG 的白底像素改透明 → 下載成去背 PNG
// qrserver.com 不支援 transparent bgcolor 參數，必須 client-side canvas 處理
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
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  // RGBA 4-byte 一組；白色（亮度高）→ alpha=0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
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
    openShareLightbox(computeShareUrl(btn));
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
