// Generate data-source/faculty-parttime-admin-input.xlsx — 2 sheet
//   - parttime: nameZh / nameEn / titleZh / titleEn
//   - admin:    nameZh / nameEn / titleZh / titleEn / contact

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'faculty-parttime-admin-input.xlsx');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  // ─── Sheet 1: parttime ───
  const ws1 = wb.addWorksheet('parttime');
  ws1.columns = [
    { header: '中文姓名 (必填)', key: 'nameZh', width: 16 },
    { header: '英文姓名', key: 'nameEn', width: 28 },
    { header: '職稱英', key: 'titleEn', width: 24 },
    { header: '職稱中', key: 'titleZh', width: 18 },
    { header: '副職稱英 (選填)', key: 'subTitleEn', width: 24 },
    { header: '副職稱中 (選填)', key: 'subTitleZh', width: 18 },
  ];
  styleHeader(ws1);

  // ─── Sheet 2: admin ───
  const ws2 = wb.addWorksheet('admin');
  ws2.columns = [
    { header: '中文姓名 (必填)', key: 'nameZh', width: 16 },
    { header: '英文姓名', key: 'nameEn', width: 28 },
    { header: '職稱英', key: 'titleEn', width: 24 },
    { header: '職稱中', key: 'titleZh', width: 18 },
    { header: '聯絡資訊', key: 'contact', width: 50 },
  ];
  styleHeader(ws2);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log('  Sheet 1: parttime (6 cols)');
  console.log('  Sheet 2: admin (5 cols)');
}

function styleHeader(ws) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 32;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

main().catch(e => { console.error(e); process.exit(1); });
