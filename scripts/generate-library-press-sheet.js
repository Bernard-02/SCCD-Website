// Generate data-source/library-press-input.xlsx
// columns: title (post_title 中) / titleEn / dateText / mediaEn / mediaZh

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'library-press-input.xlsx');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('press');
  ws.columns = [
    { header: 'title (中文標題, 必填)', key: 'title', width: 50 },
    { header: 'titleEn (英文標題)', key: 'titleEn', width: 50 },
    { header: 'dateText (例: 2024.06.15 / 2024.06 / 2024，可空)', key: 'dateText', width: 30 },
    { header: 'mediaEn (媒體 英)', key: 'mediaEn', width: 24 },
    { header: 'mediaZh (媒體 中)', key: 'mediaZh', width: 20 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 32;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // 範例 row
  ws.addRow({
    title: '《妖怪森林》原創動畫電影 凝聚媒體傳達設計學系校友的創作能量 / 王世偉',
    titleEn: '"Monster Forest": An Original Animated Film Channeling the Creative Energy of Communications Design Alumni / Vick Wang',
    dateText: '2024.06',
    mediaEn: 'ETtoday Star Cloud',
    mediaZh: 'ETtoday星光雲',
  });
  const exampleRow = ws.getRow(2);
  exampleRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    c.font = { color: { argb: 'FF888888' }, italic: true };
  });
  exampleRow.commit();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log('  Sheet: press (5 cols)');
  console.log('  dateText 接受：2024.06.15 / 2024.06 / 2024 / 空白');
  console.log('  PDF 後台手動上傳');
}

main().catch(e => { console.error(e); process.exit(1); });
