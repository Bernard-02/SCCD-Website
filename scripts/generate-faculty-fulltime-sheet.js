// Generate data-source/faculty-fulltime-input.xlsx — 11 sheet
// 每 sheet 結構：
//   Row 1-2: main info (類型 / 中文姓名 / 英文姓名)
//   Row 4+:  === 職稱 === 區塊 (sub-header + N data row + 留白)
//   Row N:   === 學歷 === 區塊
//   Row N:   === 經歷 === 區塊
//   Row N:   === 獲獎 === 區塊
// 每區塊預留 30 空 row 給 user 加資料
// Parser 不靠 sheet name 識別老師，靠每 sheet main row 的 nameZh

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'faculty-fulltime-input.xlsx');

const COUNTRIES = [
  'tw', 'jp', 'kr', 'cn', 'hk', 'sg', 'my', 'th', 'vn', 'ph', 'id', 'in',
  'au', 'nz', 'us', 'ca', 'mx', 'br', 'gb', 'fr', 'de', 'it', 'es', 'nl',
  'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'ru', 'tr', 'il',
  'ae', 'za', 'eg',
];

const NUM_SHEETS = 11;
const ROWS_PER_BLOCK = 30; // 每區塊留多少空 data row 給 user 加

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  for (let i = 1; i <= NUM_SHEETS; i++) {
    const ws = wb.addWorksheet(`faculty-${i}`);
    buildSheet(ws);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log(`  ${NUM_SHEETS} sheets，每 sheet: main + 4 blocks (職稱/學歷/經歷/獲獎)`);
  console.log(`  每區塊預留 ${ROWS_PER_BLOCK} 空 row`);
  console.log('  User 隨意 rename sheet name（parser 不依賴 sheet name，看 main row nameZh）');
}

function buildSheet(ws) {
  // ─── Row 1: main header ───
  ws.getCell('A1').value = '類型';
  ws.getCell('B1').value = '中文姓名（必填）';
  ws.getCell('C1').value = '英文姓名';
  styleSectionHeader(ws.getRow(1));

  // Row 2: main data placeholder（user 填）
  // Type dropdown
  ws.getCell('A2').dataValidation = {
    type: 'list', allowBlank: false, formulae: ['"fulltime"'],
    showErrorMessage: true, errorTitle: '類型錯誤', error: 'fulltime sheet 只接受 fulltime',
  };
  ws.getCell('A2').value = 'fulltime'; // 預填

  // Column width
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 24;

  let row = 4; // Row 3 空白

  // ─── 職稱區塊（EN 在前）───
  row = buildBlock(ws, row, '=== 職稱 ===', ['職稱英', '職稱中'], [24, 16], 5);

  // ─── 學歷區塊 ───
  row = buildBlock(ws, row, '=== 學歷 ===',
    ['國家', '學校英', '學校中', '專業英', '專業中', '學位英', '學位中'],
    [12, 22, 22, 22, 18, 14, 12],
    10, { countryCol: 1 });

  // ─── 經歷區塊 ───
  row = buildBlock(ws, row, '=== 經歷 ===',
    ['起始年', '結束年（單年留空）', '單位英', '單位中', '職務英', '職務中'],
    [10, 16, 32, 32, 20, 20],
    ROWS_PER_BLOCK, { yearCols: [1, 2] });

  // ─── 獲獎區塊 ───
  row = buildBlock(ws, row, '=== 獲獎 ===',
    ['起始年', '結束年（單年留空）', '名稱英', '名稱中', '獎項英', '獎項中', '獎別英', '獎別中'],
    [10, 16, 26, 26, 22, 18, 14, 14],
    ROWS_PER_BLOCK, { yearCols: [1, 2] });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// 寫一個區塊：marker row + sub-header row + N 空 data row + 1 空 row 分隔
// markerText: "=== 職稱 ==="
// subHeaders: ['職稱中', '職稱英', ...]
// colWidths: [16, 24, ...]
// dataRows: 預留幾 row 給 user 加
// opts: { countryCol?: idx (1-based), yearCols?: [idx, ...] } 套 data validation
// return: next row to write
function buildBlock(ws, startRow, markerText, subHeaders, colWidths, dataRows, opts = {}) {
  // marker row
  ws.getCell(`A${startRow}`).value = markerText;
  styleSectionMarker(ws.getRow(startRow));
  startRow += 1;

  // sub-header row
  for (let c = 0; c < subHeaders.length; c++) {
    ws.getCell(startRow, c + 1).value = subHeaders[c];
    // column width
    if (colWidths[c]) {
      const cur = ws.getColumn(c + 1);
      if (!cur.width || cur.width < colWidths[c]) cur.width = colWidths[c];
    }
  }
  styleSubHeader(ws.getRow(startRow));
  const subHeaderRow = startRow;
  startRow += 1;

  // dataRows：套 data validation 到 country / year cell
  const dataStartRow = startRow;
  const dataEndRow = startRow + dataRows - 1;
  if (opts.countryCol) {
    const countryList = '"' + COUNTRIES.join(',') + '"';
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      ws.getCell(r, opts.countryCol).dataValidation = {
        type: 'list', allowBlank: true, formulae: [countryList],
        showErrorMessage: true, errorTitle: '國家代碼無效',
        error: '請從 dropdown 選擇 ISO 國家代碼',
      };
    }
  }
  if (opts.yearCols) {
    const years = [];
    for (let y = 1950; y <= 2040; y++) years.push(String(y));
    const yearList = '"' + years.join(',') + '"';
    for (const yc of opts.yearCols) {
      for (let r = dataStartRow; r <= dataEndRow; r++) {
        ws.getCell(r, yc).dataValidation = {
          type: 'list', allowBlank: true, formulae: [yearList],
          showErrorMessage: true, errorTitle: '年份無效',
          error: '請選 1950-2040 之間的年份',
        };
      }
    }
  }

  // 區塊間留 1 空 row
  return dataEndRow + 2;
}

function styleSectionHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 24;
}

function styleSectionMarker(row) {
  row.font = { bold: true, color: { argb: 'FF000000' }, size: 14 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } }; // 黃底醒目
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 28;
}

function styleSubHeader(row) {
  row.font = { bold: true, color: { argb: 'FF000000' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }; // 灰底
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 20;
}

main().catch(e => { console.error(e); process.exit(1); });
