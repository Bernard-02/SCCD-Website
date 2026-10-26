/**
 * 螢幕浮水印（前臺視覺水印，後臺不用事先編輯檔案）
 * 英中各一行「整句連續重複」的斜 30° 文字，鋪滿目標元素。
 * PDF viewer 與 media lightbox 共用（只有 document 來源的內容才套用）。
 *
 * 目標元素需自帶 position（absolute/relative 皆可）、pointer-events:none、外層 overflow:hidden 裁邊。
 * 在「開啟時」呼叫：①字體必載好 → 水平 advance 量測準；②依當前 viewport 給手機較小較密版。
 *
 * ⚠️ 不要回退成「一句一句獨立擺＋整片 rotate 每個 text」：長英文 rotate 後會在 tile 接縫被切成半句。
 * ⚠️ 水平無縫關鍵＝每個 tile 寬必須＝「一句＋分隔」實際 advance 寬 → 即時量，寫死像素會在接縫跳位。
 */
export function applyScreenWatermark(wmEl) {
  if (!wmEl) return;
  const mob = window.innerWidth < 768;
  const FS = mob ? 14 : 24;                         // 手機字級縮小
  const WEIGHT = getComputedStyle(document.documentElement).getPropertyValue('--font-weight-bold').trim() || 700;
  const FAM = "Inter,'Noto Sans TC','Noto Sans JP','Noto Sans SC',sans-serif";
  const FONT = `${WEIGHT} ${FS}px ${FAM}`;
  const LH = Math.round(FS * (mob ? 4.4 : 5.6));    // 行距倍率：手機調小 → 垂直更密；tile 高 = 2*LH
  const SEP = '  ';                   // 2 個 em space(U+2003) 分隔 → 全站 marquee 統一 2em gap（同 index-marquee / library-card 色卡）；textContent 只能用字元不能用 &emsp;
  const EN_UNIT = 'Department of Communications Design, Shih Chien University' + SEP;
  const ZH_UNIT = '實踐大學媒體傳達設計學系' + SEP;
  // 用 canvas 畫不用 SVG data-URI：圖片 SVG 是隔離文件、讀不到頁面 webfont → 吃訪客系統字真 700；
  // canvas 吃頁面 @font-face → 跟全站一樣被 Google Fonts 400..600 夾住
  const dpr = window.devicePixelRatio || 1;
  const layer = (unit, baseY) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = FONT;
    const w = Math.ceil(ctx.measureText(unit).width);
    ctx.canvas.width = Math.round(w * dpr);
    ctx.canvas.height = Math.round(LH * 2 * dpr);   // 改 canvas 尺寸會重置 ctx 狀態 → 下面重設
    ctx.scale(dpr, dpr);
    ctx.font = FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillText(unit, 0, baseY);
    return { img: `url("${ctx.canvas.toDataURL()}")`, size: `${w}px ${LH * 2}px` };
  };
  const draw = () => {
    const en = layer(EN_UNIT, Math.round(LH * 0.72)), zh = layer(ZH_UNIT, Math.round(LH * 1.72));
    wmEl.style.backgroundImage = `${en.img},${zh.img}`;
    wmEl.style.backgroundSize = `${en.size},${zh.size}`;
  };
  draw();
  // 中文字子集可能還沒載（canvas 會先畫 fallback 字）→ 載完重畫；期間被 clear 就不畫回來
  if (!document.fonts.check(FONT, EN_UNIT + ZH_UNIT)) {
    document.fonts.load(FONT, EN_UNIT + ZH_UNIT).then(() => { if (wmEl.style.backgroundImage !== 'none') draw(); });
  }
  wmEl.style.backgroundRepeat = 'repeat, repeat';
  wmEl.style.inset = '-50%';                        // 放大 → rotate(-30) 後仍蓋滿；外層 overflow:hidden 裁邊
  wmEl.style.transform = 'rotate(-30deg)';
  repositionScreenWatermark(wmEl);
}

// Move the whole watermark layer when the displayed page changes. The repeated
// text itself keeps its original alignment; only the already-rotated layer moves.
export function repositionScreenWatermark(wmEl) {
  if (!wmEl) return;
  const width = wmEl.parentElement?.clientWidth || window.innerWidth;
  const offsetX = Math.round((Math.random() - 0.5) * Math.max(width * 0.35, 160));
  wmEl.style.backgroundPosition = '0 0, 0 0';
  wmEl.style.width = '200%';
  wmEl.style.right = 'auto';
  wmEl.style.left = `calc(-50% + ${offsetX}px)`;
}

export function clearScreenWatermark(wmEl) {
  if (!wmEl) return;
  wmEl.style.backgroundImage = 'none';
}
