// Parse data-source/faculty-fulltime-input.xlsx → data-source/output/faculty-fulltime.json
// 逐 sheet 解析：
//   - main row (row 2) 拿 type/nameZh/nameEn
//   - 區塊 marker row "=== 職稱 ===" / "=== 學歷 ===" / "=== 經歷 ===" / "=== 獲獎 ===" 切換 section
//   - sub-header row 跳過
//   - data row 依當前 section schema 讀對應 columns
//   - 空 data row 跳過
// Sheet name 不重要，靠 main row nameZh 識別老師
// Parser 跑完依 main row type 寫進 faculty-fulltime.json（admin/parttime 不在這檔）

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'faculty-fulltime-input.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 區塊定義：marker text → section key + columns mapping
const BLOCKS = {
  '職稱': {
    section: 'titles',
    cols: ['titleEn', 'titleZh'],
  },
  '學歷': {
    section: 'educations',
    cols: ['country', 'schoolEn', 'schoolZh', 'majorEn', 'majorZh', 'degreeEn', 'degreeZh'],
  },
  '經歷': {
    section: 'experiences',
    cols: ['startYear', 'endYear', 'organizationEn', 'organizationZh', 'roleEn', 'roleZh'],
  },
  '獲獎': {
    section: 'awards',
    cols: ['startYear', 'endYear', 'nameEn', 'nameZh', 'workEn', 'workZh', 'categoryEn', 'categoryZh'],
  },
};

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-faculty-fulltime-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const fulltime = [];
  wb.eachSheet((ws) => {
    const entry = parseSheet(ws);
    if (entry) fulltime.push(entry);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'faculty-fulltime.json'), JSON.stringify(fulltime, null, 2), 'utf8');
  console.log(`✓ faculty-fulltime: ${fulltime.length} entries`);
}

function parseSheet(ws) {
  // Main row = row 2 (row 1 是 header)
  const mainRow = ws.getRow(2);
  const type = cellStr(mainRow, 1).toLowerCase();
  const nameZh = cellStr(mainRow, 2);
  const nameEn = cellStr(mainRow, 3);
  if (!nameZh) return null; // 空 sheet（user 沒填）跳過
  if (type !== 'fulltime') {
    console.warn(`  sheet "${ws.name}" type=${type}（不是 fulltime）→ 跳過`);
    return null;
  }

  const entry = {
    image: '',
    nameZh,
    nameEn,
    titles: [],
    educations: [],
    experiences: [],
    awards: [],
    _post_title: nameZh,
  };

  let currentSection = null;
  let currentCols = null;
  let isSubHeader = false;

  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx <= 2) return; // skip header + main

    const first = cellStr(row, 1);

    // 偵測 section marker
    const markerMatch = first.match(/===\s*(.+?)\s*===/);
    if (markerMatch) {
      const key = markerMatch[1].trim();
      if (BLOCKS[key]) {
        currentSection = BLOCKS[key].section;
        currentCols = BLOCKS[key].cols;
        isSubHeader = true; // next row 是 sub-header 要跳過
        return;
      }
      console.warn(`  unknown section marker "${key}" 在 ${ws.name} row ${idx}`);
      return;
    }

    // sub-header row 跳過（marker 後第 1 row）
    if (isSubHeader) {
      isSubHeader = false;
      return;
    }

    if (!currentSection) return; // 還沒進區塊
    if (!currentCols) return;

    // data row：讀對應 columns
    const item = {};
    let hasAnyValue = false;
    for (let c = 0; c < currentCols.length; c++) {
      const v = cellStr(row, c + 1);
      item[currentCols[c]] = currentCols[c] === 'country' ? v.toLowerCase() : v;
      if (v) hasAnyValue = true;
    }
    if (!hasAnyValue) return; // 全空 row 跳過
    entry[currentSection].push(item);
  });

  return entry;
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
