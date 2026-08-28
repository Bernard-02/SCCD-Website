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
  const WEIGHT = 700, FAM = "Inter,'Noto Sans TC','Noto Sans JP','Noto Sans SC',sans-serif";
  const LH = Math.round(FS * (mob ? 4.4 : 5.6));    // 行距倍率：手機調小 → 垂直更密；tile 高 = 2*LH
  const SEP = '  ';                   // 2 個 em space(U+2003) 分隔 → 全站 marquee 統一 2em gap（同 index-marquee / library-card 色卡）；textContent 只能用字元不能用 &emsp;
  const EN_UNIT = 'Department of Communications Design, Shih Chien University' + SEP;
  const ZH_UNIT = '實踐大學媒體傳達設計學系' + SEP;
  const measure = (s) => {
    const sp = document.createElement('span');
    sp.textContent = s;
    sp.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${WEIGHT} ${FS}px ${FAM}`;
    document.body.appendChild(sp);
    const w = Math.ceil(sp.getBoundingClientRect().width);
    sp.remove();
    return w;
  };
  const layer = (unit, baseY) => {
    const w = measure(unit);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LH * 2}"><text x="0" y="${baseY}" xml:space="preserve" fill="rgba(0,0,0,0.08)" font-size="${FS}" font-weight="${WEIGHT}" font-family="${FAM}" text-anchor="start">${unit.replace(/&/g, '&amp;')}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };
  wmEl.style.backgroundImage = `${layer(EN_UNIT, Math.round(LH * 0.72))},${layer(ZH_UNIT, Math.round(LH * 1.72))}`;
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
