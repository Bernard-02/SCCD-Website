// Parse data-source/activities-input.xlsx → data-source/output/activities-{sheet}.json × 9
// Sheet name 對應 endpoint name；output 檔名 prefix 'activities-'

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'activities-input.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const LOC_SLOTS = 5;
const SHEETS = [
  'exhibition-special', 'workshop', 'lecture', 'visit-outbound', 'visit-inbound',
  'competition', 'conference', 'students-present', 'industry',
];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-activities-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  for (const sheetName of SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) { console.warn(`  skip ${sheetName}: sheet 不存在`); continue; }
    const items = [];
    ws.eachRow({ includeEmpty: false }, (row, idx) => {
      if (idx === 1) return; // header
      const title = cellStr(row, 1);
      if (!title) return;
      const titleEn = cellStr(row, 2);
      const subtitleEn = cellStr(row, 3);
      const subtitleZh = cellStr(row, 4);
      const dateText = cellStr(row, 5);
      const locations = [];
      for (let i = 0; i < LOC_SLOTS; i++) {
        const baseCol = 6 + i * 3;
        const nameEn = cellStr(row, baseCol);
        const nameZh = cellStr(row, baseCol + 1);
        const country = cellStr(row, baseCol + 2).toLowerCase();
        if (nameZh || nameEn || country) {
          locations.push({ nameZh, nameEn, country });
        }
      }
      const descBaseCol = 6 + LOC_SLOTS * 3;
      const descriptionEn = cellStr(row, descBaseCol);
      const descriptionZh = cellStr(row, descBaseCol + 1);
      items.push({
        titleEn,
        subtitleZh,
        subtitleEn,
        dates: parseDateText(dateText),
        locations,
        guests: [],
        descriptionZh,
        descriptionEn,
        poster: '',
        images: {},
        videos: [],
        _post_title: title,
      });
    });
    const outName = 'activities-' + sheetName;
    fs.writeFileSync(path.join(OUT_DIR, outName + '.json'), JSON.stringify(items, null, 2), 'utf8');
    console.log(`✓ ${outName}: ${items.length} items`);
  }
}

// ─── shared helpers (與 parse-admission-sheet.js 同邏輯) ───

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

function parseDateText(s) {
  if (!s) return [];
  const segments = String(s).split(',').map(x => x.trim()).filter(Boolean);
  const out = [];
  let baseYear = null;
  for (const seg of segments) {
    const parsed = parseSegment(seg, baseYear);
    if (!parsed) continue;
    out.push(parsed);
    baseYear = parsed.startYear;
  }
  return out;
}

function parseSegment(seg, baseYear) {
  const norm = seg.replace(/\s+/g, '').replace(/\//g, '.');
  let m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})-(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return { startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]), endYear: m[4], endMonth: pad(m[5]), endDay: pad(m[6]) };
  m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
  if (m) return { startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]), endYear: m[1], endMonth: pad(m[4]), endDay: pad(m[5]) };
  m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return { startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]), endYear: m[1], endMonth: pad(m[2]), endDay: pad(m[3]) };
  if (baseYear) {
    m = norm.match(/^(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
    if (m) return { startYear: baseYear, startMonth: pad(m[1]), startDay: pad(m[2]), endYear: baseYear, endMonth: pad(m[3]), endDay: pad(m[4]) };
    m = norm.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (m) return { startYear: baseYear, startMonth: pad(m[1]), startDay: pad(m[2]), endYear: baseYear, endMonth: pad(m[1]), endDay: pad(m[2]) };
  }
  console.warn(`  ⚠️ 無法解析日期段「${seg}」(baseYear=${baseYear || 'none'})`);
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

main().catch(e => { console.error(e); process.exit(1); });
