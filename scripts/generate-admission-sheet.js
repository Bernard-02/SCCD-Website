// Generate data-source/admission-input.xlsx 給 user 填文字
// User 工作流：
//   1. node scripts/generate-admission-sheet.js  → 產空白模板 .xlsx
//   2. user 開 Excel 一格一格貼文字（country column 是 dropdown）
//   3. 存檔
//   4. node scripts/parse-admission-sheet.js     → 產 data-source/output/admission-*.json
//   5. wp sccd import admission-announcement / summer-camp --reset
//
// Sheet 結構：
//   announcement: title / titleEn / dateText / content
//   summer-camp:  title / titleEn / dateText / loc1NameZh / loc1NameEn / loc1Country
//                 / loc2NameZh / loc2NameEn / loc2Country / ... 5 組 / descriptionZh / descriptionEn

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'admission-input.xlsx');

// Country options 對齊 cmb2-register sccd_country_options（39 國）
const COUNTRIES = [
  'tw', 'jp', 'kr', 'cn', 'hk', 'sg', 'my', 'th', 'vn', 'ph', 'id', 'in',
  'au', 'nz', 'us', 'ca', 'mx', 'br', 'gb', 'fr', 'de', 'it', 'es', 'nl',
  'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'ru', 'tr', 'il',
  'ae', 'za', 'eg',
];

const LOC_SLOTS = 5;

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  // ─── Sheet 1: announcement ───
  const ws1 = wb.addWorksheet('announcement');
  ws1.columns = [
    { header: 'title (中文標題, 必填)', key: 'title', width: 40 },
    { header: 'titleEn (英文標題)', key: 'titleEn', width: 40 },
    { header: 'dateText (例: 2026.02.04 或 2026.05.25-05.26, 05.29)', key: 'dateText', width: 50 },
    { header: 'content (內文)', key: 'content', width: 80 },
  ];
  styleHeader(ws1);

  // ─── Sheet 2: summer-camp ───
  const ws2 = wb.addWorksheet('summer-camp');
  const sc2Cols = [
    { header: 'title (中文標題, 必填)', key: 'title', width: 40 },
    { header: 'titleEn (英文標題)', key: 'titleEn', width: 40 },
    { header: 'dateText (例: 2025.07.14-07.18)', key: 'dateText', width: 50 },
  ];
  for (let i = 1; i <= LOC_SLOTS; i++) {
    sc2Cols.push({ header: `loc${i}NameEn`, key: `loc${i}NameEn`, width: 30 });
    sc2Cols.push({ header: `loc${i}NameZh`, key: `loc${i}NameZh`, width: 30 });
    sc2Cols.push({ header: `loc${i}Country (dropdown)`, key: `loc${i}Country`, width: 18 });
  }
  sc2Cols.push({ header: 'descriptionEn (簡介 EN)', key: 'descriptionEn', width: 60 });
  sc2Cols.push({ header: 'descriptionZh (簡介 中)', key: 'descriptionZh', width: 60 });
  ws2.columns = sc2Cols;
  styleHeader(ws2);

  // ─── Country dropdown data validation 套在 summer-camp 每個 locXCountry column ───
  // ExcelJS data validation: dataValidation = { type: 'list', formulae: ['"tw,jp,kr,..."'] }
  // 限 255 char，39 國拼起來 ~117 char OK
  const countryList = '"' + COUNTRIES.join(',') + '"';
  for (let i = 1; i <= LOC_SLOTS; i++) {
    const colName = `loc${i}Country`;
    const colIdx = ws2.columns.findIndex(c => c.key === colName) + 1; // 1-based
    if (colIdx === 0) continue;
    const colLetter = ws2.getColumn(colIdx).letter;
    // 套到 2-100 row（header row 1 跳過；100 應該夠 admission summer-camp 用）
    for (let r = 2; r <= 100; r++) {
      ws2.getCell(`${colLetter}${r}`).dataValidation = {
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

  // ─── 加入範例 row 給 user 參考（淺灰底，user 自行刪除） ───
  ws1.addRow({
    title: '113學年度大學申請入學第二階段指定項目甄試注意事項',
    titleEn: '',
    dateText: '2026.02.04',
    content: '<p>一、術科注意事項<br>文字書寫與圖像繪製...</p><p>二、作品集面試注意事項：</p>',
  });
  ws2.addRow({
    title: '談一場平凡無奇的戀愛',
    titleEn: 'An Ordinary Love Story',
    dateText: '2025.07.14-07.18',
    loc1NameZh: '實踐大學設計學院',
    loc1NameEn: '',
    loc1Country: 'tw',
    descriptionZh: '這個沉浸式的暑期營隊帶領高中生認識設計思考的基礎...',
    descriptionEn: 'This immersive summer camp introduces high school students...',
  });
  // 範例 row styling
  [ws1, ws2].forEach(ws => {
    const row = ws.getRow(2);
    row.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      c.font = { color: { argb: 'FF888888' }, italic: true };
    });
    row.commit();
  });

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log('  Sheet 1: announcement (4 cols)');
  console.log(`  Sheet 2: summer-camp (3 + ${LOC_SLOTS}×3 + 2 cols, country dropdown)`);
  console.log('  範例 row 2 是 placeholder（灰底斜體），user 自行刪除');
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
