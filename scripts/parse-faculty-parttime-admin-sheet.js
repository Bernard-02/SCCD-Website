// Parse data-source/faculty-parttime-admin-input.xlsx
//   → data-source/output/faculty-parttime.json
//   → data-source/output/faculty-admin.json

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'faculty-parttime-admin-input.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-faculty-parttime-admin-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // ─── parttime: titleZh/En + subTitleZh/En → titles group 2 筆 ───
  const ws1 = wb.getWorksheet('parttime');
  const parttime = [];
  if (ws1) {
    ws1.eachRow({ includeEmpty: false }, (row, idx) => {
      if (idx === 1) return;
      const nameZh = cellStr(row, 1);
      if (!nameZh) return;
      const nameEn = cellStr(row, 2);
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

  // ─── admin: flat title + contact ───
  const ws2 = wb.getWorksheet('admin');
  const admin = [];
  if (ws2) {
    ws2.eachRow({ includeEmpty: false }, (row, idx) => {
      if (idx === 1) return;
      const nameZh = cellStr(row, 1);
      if (!nameZh) return;
      admin.push({
        image: '',
        nameZh,
        nameEn: cellStr(row, 2),
        titleEn: cellStr(row, 3),
        titleZh: cellStr(row, 4),
        contact: cellStr(row, 5),
        _post_title: nameZh,
      });
    });
  }
  fs.writeFileSync(path.join(OUT_DIR, 'faculty-admin.json'), JSON.stringify(admin, null, 2), 'utf8');
  console.log(`✓ faculty-admin: ${admin.length} entries`);
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
