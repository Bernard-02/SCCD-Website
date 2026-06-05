// Parse data-source/faculty-parttime-template.xlsx → data-source/output/faculty-parttime.json
//
// 單一 sheet「parttime」，欄位「英文在前」（與職稱欄一致，全 EN-first）：
//   col1 nameEn / col2 nameZh / col3 titleEn / col4 titleZh / col5 subTitleEn(選填) / col6 subTitleZh(選填)
// titleEn/titleZh + subTitleEn/subTitleZh → titles group（最多 2 筆）。
// _post_title = nameZh（中文姓名 = 後台 post title，與 faculty-fulltime parser 同慣例）。
// admin 不在此檔處理（user：admin 不管）—— 本 parser 只產 faculty-parttime.json。

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'faculty-parttime-template.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const ws = wb.getWorksheet('parttime');
  const parttime = [];
  if (ws) {
    ws.eachRow({ includeEmpty: false }, (row, idx) => {
      if (idx === 1) return; // header
      const nameEn = cellStr(row, 1);
      const nameZh = cellStr(row, 2);
      if (!nameZh) return;   // 中文姓名 = post title 的 key，沒填視為空 row 跳過
      const titleEn = cellStr(row, 3);
      const titleZh = cellStr(row, 4);
      const subTitleEn = cellStr(row, 5);
      const subTitleZh = cellStr(row, 6);
      const titles = [];
      if (titleZh || titleEn) titles.push({ titleZh, titleEn });
      if (subTitleZh || subTitleEn) titles.push({ titleZh: subTitleZh, titleEn: subTitleEn });
      parttime.push({
        image: '',
        nameZh,
        nameEn,
        titles,
        _post_title: nameZh,
      });
    });
  }
  fs.writeFileSync(path.join(OUT_DIR, 'faculty-parttime.json'), JSON.stringify(parttime, null, 2), 'utf8');
  console.log(`✓ faculty-parttime: ${parttime.length} entries`);
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

main().catch(e => { console.error(e); process.exit(1); });
