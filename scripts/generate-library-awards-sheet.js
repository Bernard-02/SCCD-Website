// Generate data-source/library-awards-input.xlsx (1 sheet)
// columns: title / titleEn / year / country (dropdown) / categoryEn / categoryZh / rankEn / rankZh / winnerEn / winnerZh

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'library-awards-input.xlsx');

const COUNTRIES = [
  'tw', 'jp', 'kr', 'cn', 'hk', 'sg', 'my', 'th', 'vn', 'ph', 'id', 'in',
  'au', 'nz', 'us', 'ca', 'mx', 'br', 'gb', 'fr', 'de', 'it', 'es', 'nl',
  'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'ru', 'tr', 'il',
  'ae', 'za', 'eg',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('awards');
  ws.columns = [
    { header: 'title (中文標題, 必填)', key: 'title', width: 36 },
    { header: 'titleEn (英文標題)', key: 'titleEn', width: 36 },
    { header: 'year (年份)', key: 'year', width: 10 },
    { header: 'country (dropdown)', key: 'country', width: 14 },
    { header: 'categoryEn (類別 英)', key: 'categoryEn', width: 22 },
    { header: 'categoryZh (類別 中)', key: 'categoryZh', width: 18 },
    { header: 'rankEn (獎別 英)', key: 'rankEn', width: 18 },
    { header: 'rankZh (獎別 中)', key: 'rankZh', width: 14 },
    { header: 'winnerEn (得主 英)', key: 'winnerEn', width: 22 },
    { header: 'winnerZh (得主 中)', key: 'winnerZh', width: 14 },
  ];

  // header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 32;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // country dropdown row 2-500
  const countryList = '"' + COUNTRIES.join(',') + '"';
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [countryList],
      showErrorMessage: true, errorTitle: '國家代碼無效',
      error: '請從 dropdown 選擇 ISO 國家代碼（如 tw / jp / us）',
    };
  }

  // year dropdown 1950-2040 row 2-500
  const years = [];
  for (let y = 1950; y <= 2040; y++) years.push(String(y));
  const yearList = '"' + years.join(',') + '"';
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [yearList],
      showErrorMessage: true, errorTitle: '年份無效',
    };
  }

  // 範例 row
  ws.addRow({
    title: '紅點設計獎',
    titleEn: 'Red Dot Design Award',
    year: '2026',
    country: 'de',
    categoryEn: 'Design Award',
    categoryZh: '設計獎',
    rankEn: 'Gold',
    rankZh: '金獎',
    winnerEn: 'Chen Wei',
    winnerZh: '陳偉',
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
  console.log('  Sheet: awards (10 cols, country + year dropdown)');
  console.log('  範例 row 2 灰底斜體，user 自行刪除');
}

main().catch(e => { console.error(e); process.exit(1); });
