// Parse data-source/admission-input.xlsx → data-source/output/admission-{announcement,summer-camp}.json
// User 工作流：產 template → 填 → 跑此 parser → wp sccd import
//
// dateText 格式（支援 base-year 繼承）：
//   "2026.02.04"                  → 1 筆單日
//   "2026.02.04-02.10"            → 1 筆同年跨日（end 自動繼承 start year）
//   "2025.12.28-2026.01.05"       → 1 筆跨年（end 明確寫年）
//   "2023.05.25-05.26, 05.29"     → 2 筆，第二段省年繼承 2023（變單日 2023.05.29）
//   "2025.07.14-07.18, 2026.07.20-07.24" → 2 筆各自明確年

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'admission-input.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const LOC_SLOTS = 5;

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-admission-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // ─── Sheet 1: announcement ───
  const ws1 = wb.getWorksheet('announcement');
  if (!ws1) { console.error('Sheet announcement 不存在'); process.exit(1); }
  const announcement = [];
  ws1.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return; // skip header
    const title = cellStr(row, 1);
    if (!title) return; // 空 title 視為空 row 跳過
    if (isExampleRow(row)) return;
    const titleEn = cellStr(row, 2);
    const dateText = cellStr(row, 3);
    const content = cellStr(row, 4);
    announcement.push({
      titleEn,
      dates: parseDateText(dateText),
      content,
      images: {},
      videos: [],
      attachments: [],
      _post_title: title,
    });
  });
  writeJson('admission-announcement', announcement);

  // ─── Sheet 2: summer-camp ───
  const ws2 = wb.getWorksheet('summer-camp');
  if (!ws2) { console.error('Sheet summer-camp 不存在'); process.exit(1); }
  const summerCamp = [];
  ws2.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return;
    const title = cellStr(row, 1);
    if (!title) return;
    if (isExampleRow(row)) return;
    const titleEn = cellStr(row, 2);
    const dateText = cellStr(row, 3);
    // loc1..5：每組 3 cell（NameEn / NameZh / Country）從 col 4 起算（EN 先 ZH 後）
    const locations = [];
    for (let i = 0; i < LOC_SLOTS; i++) {
      const baseCol = 4 + i * 3;
      const nameEn = cellStr(row, baseCol);
      const nameZh = cellStr(row, baseCol + 1);
      const country = cellStr(row, baseCol + 2).toLowerCase();
      if (nameZh || nameEn || country) {
        locations.push({ nameZh, nameEn, country });
      }
    }
    const descBaseCol = 4 + LOC_SLOTS * 3;
    const descriptionEn = cellStr(row, descBaseCol);
    const descriptionZh = cellStr(row, descBaseCol + 1);
    summerCamp.push({
      titleEn,
      dates: parseDateText(dateText),
      locations,
      descriptionZh,
      descriptionEn,
      poster: '',
      images: {},
      videos: [],
      _post_title: title,
    });
  });
  writeJson('admission-summer-camp', summerCamp);

  console.log(`✓ admission-announcement: ${announcement.length} items`);
  console.log(`✓ admission-summer-camp: ${summerCamp.length} items`);
}

// ─── helpers ───

// cell idx 1-based；handle null / object cell value（hyperlink / formula 等）
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

// 偵測「範例 row」(灰底斜體 placeholder) — 看 cell font color 是否灰
function isExampleRow(row) {
  const c = row.getCell(1);
  const argb = c.font?.color?.argb;
  return argb && argb.toUpperCase() === 'FF888888';
}

// dateText parser，支援 base-year 繼承
function parseDateText(s) {
  if (!s) return [];
  const segments = String(s).split(',').map(x => x.trim()).filter(Boolean);
  const out = [];
  let baseYear = null;
  for (const seg of segments) {
    const parsed = parseSegment(seg, baseYear);
    if (!parsed) continue;
    out.push(parsed);
    baseYear = parsed.startYear; // 後續省年段落繼承此 year
  }
  return out;
}

// 一段：
//   "2026.02.04"                  → single
//   "2026.02.04-02.10"            → same year span (end month-day only)
//   "2025.12.28-2026.01.05"       → cross year
//   "05.29"                       → single day relative to baseYear
//   "05.25-05.26"                 → span relative to baseYear
function parseSegment(seg, baseYear) {
  // Normalize separators: . / -ish
  // 接受 . / - 作為 date separator；接受 - 作為起迄
  const norm = seg.replace(/\s+/g, '').replace(/\//g, '.');

  // 跨年明確：YYYY.MM.DD-YYYY.MM.DD
  let m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})-(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return {
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[4], endMonth: pad(m[5]), endDay: pad(m[6]),
  };

  // 同年跨日：YYYY.MM.DD-MM.DD
  m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
  if (m) return {
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[1], endMonth: pad(m[4]), endDay: pad(m[5]),
  };

  // 單日明確年：YYYY.MM.DD
  m = norm.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return {
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[1], endMonth: pad(m[2]), endDay: pad(m[3]),
  };

  // 省年跨日：MM.DD-MM.DD（用 baseYear）
  if (baseYear) {
    m = norm.match(/^(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
    if (m) return {
      startYear: baseYear, startMonth: pad(m[1]), startDay: pad(m[2]),
      endYear: baseYear, endMonth: pad(m[3]), endDay: pad(m[4]),
    };

    // 省年單日：MM.DD
    m = norm.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (m) return {
      startYear: baseYear, startMonth: pad(m[1]), startDay: pad(m[2]),
      endYear: baseYear, endMonth: pad(m[1]), endDay: pad(m[2]),
    };
  }

  console.warn(`  ⚠️ 無法解析日期段「${seg}」(baseYear=${baseYear || 'none'})`);
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

function writeJson(endpoint, data) {
  const out = path.join(OUT_DIR, endpoint + '.json');
  fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf8');
}

main().catch(e => { console.error(e); process.exit(1); });
