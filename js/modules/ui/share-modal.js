/**
 * Share Lightbox
 * 點擊 [data-share-btn] 後，置中彈出 lightbox，顯示 QR code + 可複製的分享連結
 */

function openShareLightbox(url) {
  const lightbox = document.getElementById('share-lightbox');
  if (!lightbox) return;

  // 填入 QR code 與 URL
  const encoded = encodeURIComponent(url);
  document.getElementById('share-qr-img').src =
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
  const MAX_URL_LEN = 50;
  const urlEl = document.getElementById('share-url-text');
  urlEl.textContent = url.length > MAX_URL_LEN ? url.slice(0, MAX_URL_LEN) : url;
  urlEl.dataset.fullUrl = url;

  const hint = document.getElementById('share-copy-hint');
  if (hint) hint.style.opacity = '0';

  // 顯示
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeShareLightbox() {
  const lightbox = document.getElementById('share-lightbox');
  if (!lightbox) return;
  lightbox.style.display = 'none';
  document.body.style.overflow = '';
}

function showCopyHint(msg) {
  const hint = document.getElementById('share-copy-hint');
  if (!hint) return;
  hint.textContent = msg;
  hint.style.opacity = '1';
  setTimeout(() => { hint.style.opacity = '0'; }, 2000);
}

export function initShareModal() {
  // 關閉：X 按鈕
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
    navigator.clipboard.writeText(url).then(() => {
      showCopyHint('已複製連結 Link Copied!');
    });
  });

  // 點擊 QR 圖片 → 複製圖片到 clipboard
  document.getElementById('share-qr-img')?.addEventListener('click', async () => {
    const img = document.getElementById('share-qr-img');
    if (!img?.src) return;
    try {
      const res = await fetch(img.src);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showCopyHint('已複製圖片 Image Copied!');
    } catch {
      // 瀏覽器不支援圖片寫入 clipboard 時，fallback 到複製連結
      const urlEl = document.getElementById('share-url-text');
      const url = urlEl?.dataset.fullUrl || urlEl?.textContent;
      if (url) navigator.clipboard.writeText(url).then(() => showCopyHint('已複製連結 Link Copied!'));
    }
  });

  // Share btn delegation（支援任何頁面的 [data-share-btn]）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share-btn]');
    if (!btn) return;

    const base = window.location.href.split('?')[0];

    // 嘗試從 DOM 取得 section + item id
    const listItem = btn.closest('.list-item');
    const itemId   = listItem?.id?.replace(/^item-/, '');
    const panel    = btn.closest('[id^="panel-"]');
    const section  = panel?.id?.replace(/^panel-/, '');

    let url;
    if (section && itemId) {
      url = `${base}?section=${section}&item=${itemId}`;
    } else {
      url = base;
    }

    openShareLightbox(url);
  });
}
