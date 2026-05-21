// Generate data-source/activities-input.xlsx
//   - 9 sheet（每個 list CPT 一個），columns 一致：
//     title / titleEn / subtitleZh / subtitleEn / dateText
//     loc1NameZh / loc1NameEn / loc1Country ~ loc5NameZh / loc5NameEn / loc5Country
//     descriptionZh / descriptionEn
//   - country column 數據驗證下拉
// User workflow：填 → node scripts/parse-activities-sheet.js → wp sccd import activities-* --reset

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'activities-input.xlsx');

const COUNTRIES = [
  'tw', 'jp', 'kr', 'cn', 'hk', 'sg', 'my', 'th', 'vn', 'ph', 'id', 'in',
  'au', 'nz', 'us', 'ca', 'mx', 'br', 'gb', 'fr', 'de', 'it', 'es', 'nl',
  'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'ru', 'tr', 'il',
  'ae', 'za', 'eg',
];

const LOC_SLOTS = 5;

// Sheet name = endpoint name 對應；parser 用此 mapping 找 output JSON 名
const SHEETS = [
  'exhibition-special',
  'workshop',
  'lecture',
  'visit-outbound',
  'visit-inbound',
  'competition',
  'conference',
  'students-present',
  'industry',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  const countryList = '"' + COUNTRIES.join(',') + '"';

  for (const sheetName of SHEETS) {
    const ws = wb.addWorksheet(sheetName);
    const cols = [
      { header: 'title (中文標題, 必填)', key: 'title', width: 40 },
      { header: 'titleEn (英文標題)', key: 'titleEn', width: 40 },
      { header: 'subtitleEn (副標題 EN)', key: 'subtitleEn', width: 30 },
      { header: 'subtitleZh (副標題 中)', key: 'subtitleZh', width: 30 },
      { header: 'dateText (例: 2026.02.04 或 2025.07.14-07.18, 07.20)', key: 'dateText', width: 50 },
    ];
    for (let i = 1; i <= LOC_SLOTS; i++) {
      cols.push({ header: `loc${i}NameEn`, key: `loc${i}NameEn`, width: 25 });
      cols.push({ header: `loc${i}NameZh`, key: `loc${i}NameZh`, width: 25 });
      cols.push({ header: `loc${i}Country (dropdown)`, key: `loc${i}Country`, width: 18 });
    }
    cols.push({ header: 'descriptionEn (簡介 EN)', key: 'descriptionEn', width: 60 });
    cols.push({ header: 'descriptionZh (簡介 中)', key: 'descriptionZh', width: 60 });
    ws.columns = cols;
    styleHeader(ws);

    // Country dropdown 套到每組 locXCountry column row 2-200
    for (let i = 1; i <= LOC_SLOTS; i++) {
      const colName = `loc${i}Country`;
      const colIdx = ws.columns.findIndex(c => c.key === colName) + 1;
      if (colIdx === 0) continue;
      const colLetter = ws.getColumn(colIdx).letter;
      for (let r = 2; r <= 200; r++) {
        ws.getCell(`${colLetter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [countryList],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: '國家代碼無效',
          error: '請從 dropdown 選擇 ISO 國家代碼（如 tw / jp / us）',
        };
      }
    }
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log(`  ${SHEETS.length} sheets：${SHEETS.join(' / ')}`);
  console.log(`  每 sheet: 5 text + ${LOC_SLOTS}×3 loc + 2 desc = ${5 + LOC_SLOTS * 3 + 2} columns`);
  console.log('  Country column 設 dropdown');
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
