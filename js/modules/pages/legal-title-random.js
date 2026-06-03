/**
 * Legal Title Random Layout
 * legal-page 左欄大標題 chip（privacy-policy / accessibility / regulations / support 共用）：
 * 每次進頁隨機傾角 + 在左欄水平空間內隨機推右，讓固定的左下角標題有變化感。
 *
 * 旋轉/位移都透過設在 .legal-title-block 上的 CSS var 驅動（規則見 legal.css），
 * 不必等 hero-animation.js 把 chip 包進 .hero-title-wrapper —— wrapper 之後生成時自然繼承讀 var。
 * 顏色仍由 hero-animation.js 對 [data-hero-hl] 隨機派（這裡不碰）。
 * 桌面限定：手機 legal-title-col 是 static stack，維持原樣（RWD 互不影響）。
 */

// 隨機傾角：magnitude 3~6°、方向隨機（避免太正＝呆板、太大＝破版/溢出右欄）
function randAngle() {
  const mag = 3 + Math.random() * 3;
  return Math.random() < 0.5 ? -mag : mag;
}

export function initLegalTitleRandom() {
  if (window.innerWidth < 768) return;

  const block = document.querySelector('.legal-title-block');
  if (!block) return;
  const col = block.closest('.legal-title-col');
  if (!col) return;

  const en = block.querySelector('.hero-title');
  const cn = block.querySelector('.hero-title-cn');

  const rotEn = randAngle();
  const rotCn = randAngle();

  // 水平可用空間 = 左欄寬 − chip 寬 − 右側 buffer（給旋轉投影 + 不貼欄邊）；不足則不位移
  const RIGHT_BUFFER = 40;
  const colW = col.clientWidth;
  const shiftFor = (el) => {
    if (!el) return 0;
    const avail = colW - el.offsetWidth - RIGHT_BUFFER;
    return avail > 0 ? Math.round(Math.random() * avail) : 0;
  };

  // 兩 chip 各自繞 left-center 旋轉，右端上下擺動 width×sin(θ)：上方(EN)底端下沉 + 下方(CN)頂端上抬，
  // 固定 8px flex gap 不夠 → 兩者相疊（user 反映）。依角度動態算垂直 gap 撐開（同 hero-animation heroGapPx 做法）。
  const excursion = (el, deg) => el ? el.offsetWidth * Math.sin(Math.abs(deg) * Math.PI / 180) : 0;
  const gap = Math.ceil(excursion(en, rotEn) + excursion(cn, rotCn) + 12);

  block.style.setProperty('--legal-rot-en', `${rotEn.toFixed(2)}deg`);
  block.style.setProperty('--legal-rot-cn', `${rotCn.toFixed(2)}deg`);
  block.style.setProperty('--legal-shift-en', `${shiftFor(en)}px`);
  block.style.setProperty('--legal-shift-cn', `${shiftFor(cn)}px`);
  block.style.setProperty('--legal-gap', `${gap}px`);
}
