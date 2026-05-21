// Parse data-source/library-awards-input.xlsx → data-source/output/library-awards.json

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'library-awards-input.xlsx');
const OUT = path.join(__dirname, '..', 'data-source', 'output', 'library-awards.json');

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-library-awards-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('awards');
  if (!ws) { console.error('Sheet "awards" 不存在'); process.exit(1); }

  const items = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return; // header
    const title = cellStr(row, 1);
    if (!title) return;
    if (isExampleRow(row)) return; // 灰底斜體範例 row 跳過
    items.push({
      titleEn: cellStr(row, 2),
      year: cellStr(row, 3),
      country: cellStr(row, 4).toLowerCase(),
      categoryEn: cellStr(row, 5),
      categoryZh: cellStr(row, 6),
      rankEn: cellStr(row, 7),
      rankZh: cellStr(row, 8),
      winnerEn: cellStr(row, 9),
      winnerZh: cellStr(row, 10),
      _post_title: title,
    });
  });

  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✓ library-awards: ${items.length} items`);
}

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
