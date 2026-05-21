// Parse data-source/degree-show-input.xlsx → data-source/output/activities-degree-show.json
// 每 row 一筆畢業展，events 取第 1 筆（其他用後台手動加）

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'degree-show-input.xlsx');
const OUT = path.join(__dirname, '..', 'data-source', 'output', 'activities-degree-show.json');

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`找不到 ${SRC}，先跑 node scripts/generate-degree-show-sheet.js`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('degree-show');
  if (!ws) { console.error('Sheet degree-show 不存在'); process.exit(1); }

  const items = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return;
    const title = cellStr(row, 1);
    if (!title) return;
    const titleEn = cellStr(row, 2);
    const descriptionEn = cellStr(row, 3);
    const descriptionZh = cellStr(row, 4);
    const dateText = cellStr(row, 5);
    const eventNameEn = cellStr(row, 6);
    const eventNameZh = cellStr(row, 7);
    const eventLocEn = cellStr(row, 8);
    const eventLocZh = cellStr(row, 9);
    const eventCityEn = cellStr(row, 10);
    const eventCityZh = cellStr(row, 11);

    // events 取第 1 筆 — 如果 dateText 多段（逗號分隔），用第 1 段；其他段被忽略
    const datesArr = parseDateText(dateText);
    const firstDate = datesArr[0] || { startYear: '', startMonth: '', startDay: '', endYear: '', endMonth: '', endDay: '' };
    const events = [{
      ...firstDate,
      nameZh: eventNameZh,
      nameEn: eventNameEn,
      locationZh: eventLocZh,
      locationEn: eventLocEn,
      cityZh: eventCityZh,
      cityEn: eventCityEn,
    }];

    items.push({
      titleEn,
      coverImage: '',
      bannerImage: '',
      descriptionZh,
      descriptionEn,
      events,
      mainVideoUrl: '',
      albumImages: {},
      documentaryUrl: '',
      _post_title: title,
    });
  });

  // 依 events[0].startYear 降序（最新在上）
  items.sort((a, b) => {
    const ya = parseInt(a.events?.[0]?.startYear || 0, 10);
    const yb = parseInt(b.events?.[0]?.startYear || 0, 10);
    return yb - ya;
  });

  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✓ activities-degree-show: ${items.length} items`);
}

// ─── shared helpers ───

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
  console.warn(`  ⚠️ 無法解析日期段「${seg}」`);
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

main().catch(e => { console.error(e); process.exit(1); });
