// Generate data-source/degree-show-input.xlsx
// 單 sheet：每 row 一筆畢業展（含第 1 筆 event inline，其他 events / 圖 / 影片後台補）
// columns: title / titleEn / descriptionZh / descriptionEn
//        / dateText / eventNameZh / eventNameEn / eventLocZh / eventLocEn / eventCityZh / eventCityEn

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'data-source');
const OUT_FILE = path.join(OUT_DIR, 'degree-show-input.xlsx');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCCD Website Generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('degree-show');
  ws.columns = [
    { header: 'title (中文標題, 必填)', key: 'title', width: 30 },
    { header: 'titleEn (英文標題)', key: 'titleEn', width: 30 },
    { header: 'descriptionEn (簡介 EN)', key: 'descriptionEn', width: 60 },
    { header: 'descriptionZh (簡介 中)', key: 'descriptionZh', width: 60 },
    { header: 'dateText (例: 2024.05.17-05.20)', key: 'dateText', width: 40 },
    { header: 'eventNameEn (活動名稱 EN)', key: 'eventNameEn', width: 30 },
    { header: 'eventNameZh (活動名稱 中)', key: 'eventNameZh', width: 30 },
    { header: 'eventLocEn (地點 EN)', key: 'eventLocEn', width: 30 },
    { header: 'eventLocZh (地點 中)', key: 'eventLocZh', width: 30 },
    { header: 'eventCityEn (城市 EN)', key: 'eventCityEn', width: 18 },
    { header: 'eventCityZh (城市 中)', key: 'eventCityZh', width: 18 },
  ];
  styleHeader(ws);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`✓ ${OUT_FILE}`);
  console.log('  1 sheet: degree-show (11 columns)');
  console.log('  每 row 一筆畢業展含第 1 筆 event；其他 events / 圖 / 影片後台補');
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
