/**
 * Hero Mobile Sync
 *
 * 4 頁共用 hero (faculty / courses / activities / admission) 手機版 layout 跟桌面差異過大：
 * - 桌面：hero-rand-grid 4 元素 absolute random 2×2 排版
 * - 手機：圖墊底 + title/desc stack 疊在圖上
 *
 * 兩套 DOM 並存（CSS @media display 切），內容單一來源（user 不接受 HTML 雙寫文案）。
 * 此 module 在 hero init 前同步從桌面 DOM clone 4 個文字 + banner img src 到手機 DOM。
 *
 * 設計選擇：
 * - 沒有 listener / interval / observer，純 init 時跑一次 → 不需要 page-cleanup register
 * - 桌面 DOM 仍是 source of truth（其他 hero-animation.js 邏輯都對它讀寫）
 * - 手機 DOM 是 mirror，sync 完才把 visibility 開起來避免首屏閃白
 */

export function initHeroMobileSync() {
  const desktop = document.querySelector('.hero-rand-grid');
  const mobile = document.querySelector('.hero-mobile');
  if (!desktop || !mobile) return;

  const SYNC_MAP = [
    { from: '.hero-title', to: '.hero-mobile-title' },
    { from: '.hero-title-cn', to: '.hero-mobile-title-cn' },
    { from: '.hero-text-en', to: '.hero-mobile-text-en' },
    { from: '.hero-text-cn', to: '.hero-mobile-text-cn' },
  ];

  SYNC_MAP.forEach(({ from, to }) => {
    const src = desktop.querySelector(from);
    const dst = mobile.querySelector(to);
    if (src && dst) {
      dst.textContent = src.textContent;
    }
  });

  // Banner img src 同步（桌面 .hero-banner > img → 手機 .hero-mobile-bg > img）
  const srcImg = desktop.querySelector('.hero-banner img');
  const dstImg = mobile.querySelector('.hero-mobile-bg img');
  if (srcImg && dstImg) {
    const srcAttr = srcImg.getAttribute('src');
    const altAttr = srcImg.getAttribute('alt');
    if (srcAttr) dstImg.setAttribute('src', srcAttr);
    if (altAttr) dstImg.setAttribute('alt', altAttr);
  }

  // 4 chip 各自隨機旋轉 ±5°：CSS 讀 --hero-mobile-rot var
  // 範圍比桌面（±4°）略大：手機段落 chip 寬，小角度視覺上太微弱
  SYNC_MAP.forEach(({ to }) => {
    const el = mobile.querySelector(to);
    if (el) {
      const deg = (Math.random() * 10 - 5).toFixed(2);
      el.style.setProperty('--hero-mobile-rot', `${deg}deg`);
    }
  });

  // Sync 完才 reveal，避免首屏空殼閃白（CSS 預設 visibility:hidden）
  mobile.style.visibility = 'visible';
}
