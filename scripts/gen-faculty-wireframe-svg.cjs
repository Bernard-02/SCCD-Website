// ========================================
// Faculty 線框 logo → SVG 產生器（離線批次）
// 重現 generate-app/js/draw-logo.js 的 drawLogo 靜態版幾何：
//   canvas 540（存檔前座標空間，中心 270,270）、textSize 367.5、
//   N 字母環狀、最後一個字母在 0°、'W' scale 0.85、黑描邊無填色透明底。
// 逐字元 charToGlyph 直取字形（繞過 opentype 對 Inter ccmp lookup 的崩潰）。
// 產物是向量：縮放永遠清晰、stroke 粗細一個屬性即可調（前台 <img> 顯示零改動）。
// ========================================
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONT_PATH = path.join(__dirname, '..', 'generate-app', 'Inter-Medium.ttf');
const SIZE = 540;          // = save-download.js saveSize/scaleFactor（存檔座標空間）
const CENTER = SIZE / 2;   // 270
const TEXTSIZE = 367.5;    // 桌面版固定值（draw-logo.js:88）

let _font = null;
function font() {
  if (!_font) _font = opentype.parse(fs.readFileSync(FONT_PATH).buffer);
  return _font;
}

// text → 純大寫字母陣列（同 input-handling.js：toUpperCase + 去空白）
function toLetters(text) {
  return String(text).toUpperCase().replace(/[\s\n]/g, '').split('');
}

// 產生單一 wireframe SVG 字串。strokeWidth 單位 = 540 座標空間（原 tool 用 5）。
function buildWireframeSVG(text, { strokeWidth = 3.5, stroke = '#000000' } = {}) {
  const f = font();
  const letters = toLetters(text);
  const N = letters.length;
  if (N === 0) throw new Error('empty text');
  const angleStep = 360 / N;

  const groups = letters.map((letter, i) => {
    const deg = i * angleStep - (N - 1) * angleStep; // 最後一個字母 → 0°
    const glyph = f.charToGlyph(letter);
    const adv = (glyph.advanceWidth / f.unitsPerEm) * TEXTSIZE;
    const gp = glyph.getPath(0, 0, TEXTSIZE);        // baseline 原點
    const bb = gp.getBoundingBox();
    const cx = adv / 2;                               // p5 textAlign CENTER 水平＝advance 中線
    const cyTight = (bb.y1 + bb.y2) / 2;              // = p5 offsetY（tight bbox 垂直中心）
    // 把字形錨點 (cx,cyTight) 平移到 (0,-offsetY)=(0,-cyTight)：T=(-cx, -2*cyTight)
    const tx = -cx;
    const ty = -2 * cyTight;
    const scale = letter === 'W' ? 'scale(0.85) ' : '';
    const d = gp.toPathData(2);
    return `<g transform="rotate(${deg.toFixed(3)}) ${scale}translate(${tx.toFixed(2)}, ${ty.toFixed(2)})"><path d="${d}"/></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
    `<g transform="translate(${CENTER}, ${CENTER})" fill="none" stroke="${stroke}" ` +
    `stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">${groups}</g></svg>`;
}

module.exports = { buildWireframeSVG, toLetters };

// CLI: node gen-faculty-wireframe-svg.cjs "TEXT" [strokeWidth] > out.svg
if (require.main === module) {
  const text = process.argv[2] || 'SCCD';
  const sw = parseFloat(process.argv[3] || '3.5');
  process.stdout.write(buildWireframeSVG(text, { strokeWidth: sw }));
}
