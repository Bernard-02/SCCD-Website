// Parse data-source/library-press-input.xlsx → data-source/output/library-press.json
// dateText 拆 year/month/day 3 個獨立 meta；空段留空字串對齊 schema 「可不選」

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'library-press-input.xlsx');
const OUT = path.join(__dirname, '..', 'data-source', 'output', 'library-press.json');

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-library-press-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('press');
  if (!ws) { console.error('Sheet "press" 不存在'); process.exit(1); }

  const items = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return;
    const title = cellStr(row, 1);
    if (!title) return;
    if (isExampleRow(row)) return;
    const { year, month, day } = parseDateText(cellStr(row, 3));
    items.push({
      titleEn: cellStr(row, 2),
      year,
      month,
      day,
      mediaEn: cellStr(row, 4),
      mediaZh: cellStr(row, 5),
      pdf: '',
      _post_title: title,
    });
  });

  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✓ library-press: ${items.length} items`);
}

// "2024.06.15" → {2024, 06, 15}
// "2024.06"    → {2024, 06, ''}
// "2024"       → {2024, '', ''}
// 空           → {'', '', ''}
function parseDateText(s) {
  if (!s) return { year: '', month: '', day: '' };
  const norm = String(s).trim().replace(/\s+/g, '').replace(/\//g, '.');
  let m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return { year: m[1], month: pad(m[2]), day: pad(m[3]) };
  m = norm.match(/^(\d{4})\.(\d{1,2})$/);
  if (m) return { year: m[1], month: pad(m[2]), day: '' };
  m = norm.match(/^(\d{4})$/);
  if (m) return { year: m[1], month: '', day: '' };
  console.warn(`  ⚠️ 無法解析日期「${s}」→ 全留空`);
  return { year: '', month: '', day: '' };
}
function pad(n) { return String(n).padStart(2, '0'); }

function cellStr(row, idx) {
  const v = row.getCell(idx).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result);
    if (v.richText) return v.richText.map(t => t.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

function isExampleRow(row) {
  const c = row.getCell(1);
  const argb = c.font?.color?.argb;
  return argb && argb.toUpperCase() === 'FF888888';
}

main().catch(e => { console.error(e); process.exit(1); });
