// 上傳包壓縮（make-upload-package.ps1 最後一步呼叫；user 2026-10-04「進哪頁載哪頁＋壓縮，只要確保能 function」）。
// 只動「上傳包」那份拷貝，repo 原始碼（含註解）不變；GitHub Pages 預覽仍是原始碼。
//   JS：esbuild transform 逐檔壓（不 bundle、不改 import 路徑；不指定 format＝頂層名稱不改名 → generate-app 的
//       classic script 全域變數照常互通）。charset utf8＝中文字串不轉 \uXXXX（轉了反而變大）。
//   CSS：output.css 已是 Tailwind minify，其餘（library/create/atlas/alumni 等 router 動態載入的頁面 CSS）壓掉註解空白。
//   JSON：重新序列化去縮排（Lottie / alumni / accessibility）。
// 用法：node scripts/minify-package.cjs <上傳包目錄>
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) { console.error('✗ 用法：node scripts/minify-package.cjs <上傳包目錄>'); process.exit(1); }

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

let before = 0, after = 0, count = 0;
function minifyFile(file, loader) {
  const src = fs.readFileSync(file, 'utf8');
  let out;
  if (loader === 'json') out = JSON.stringify(JSON.parse(src));
  else out = esbuild.transformSync(src, { loader, minify: true, charset: 'utf8', legalComments: 'none' }).code;
  // JS 樣板字串裡的 HTML 註解（開發筆記）esbuild 不碰字串內容 → 另外拿掉。
  // ponytail: 純 regex，前提＝程式不靠 comment node（firstChild 等）、註解內不夾 ${}；哪天有例外再改成逐檔排除
  if (loader === 'js') out = out.replace(/<!--[\s\S]*?-->/g, '');
  if (out.length >= src.length) return;   // 已經是壓縮檔（*.min.js / output.css）
  fs.writeFileSync(file, out);
  before += Buffer.byteLength(src); after += Buffer.byteLength(out); count++;
}

const files = [...walk(path.join(root, 'js')), ...walk(path.join(root, 'generate-app')), ...walk(path.join(root, 'css')), ...walk(path.join(root, 'data'))];
for (const f of files) {
  const base = path.basename(f);
  if (/\.min\.(js|css)$/.test(base) || f.includes(`${path.sep}vendor${path.sep}`)) continue;
  try {
    if (base.endsWith('.js')) minifyFile(f, 'js');
    else if (base.endsWith('.css')) minifyFile(f, 'css');
    else if (base.endsWith('.json')) minifyFile(f, 'json');
  } catch (err) {
    // 壓縮失敗＝保留原檔（能跑優先），印出來給人看
    console.warn(`! 略過 ${path.relative(root, f)}：${err.message.split('\n')[0]}`);
  }
}
console.log(`壓縮 ${count} 檔：${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
