#!/usr/bin/env node
// 一次遷移：把 data/*.json 內 item.date 字串 → item.dates 結構化 array
// 支援格式：
//   - "YYYY.MM.DD"                       → 單日，帶年份
//   - "YYYY.MM.DD - YYYY.MM.DD"          → 跨日，帶年份（可能跨年）
//   - "MM.DD" / "MM / DD"                → 單日，年份 = yearGroup.year（admission flat array 走 itemYear）
//   - "MM.DD - MM.DD" / "MM / DD - MM / DD" → 跨日，年份 = yearGroup.year
//   - 自由文字（無數字） → 保留原 date 欄位，不產生 dates 結構化
// 不改：dateText、自由文字 date、原 date 欄位（保留向下相容 fallback）
const fs = require('fs');
const path = require('path');

const files = [
  'data/workshops.json',
  'data/general-activities.json',
  'data/lectures.json',
  'data/permanent-exhibitions.json',
  'data/admission.json',
  'data/summer-camp.json',
  'data/students-present.json',
  'data/alumni-gatherings.json',
  'data/industry.json',
];

// 把單一 date 字串解析成 dates array（1 筆）
// fallbackYear: 字串沒帶年時用這個
function parseDateStr(s, fallbackYear) {
  if (!s || typeof s !== 'string') return null;
  // normalize: 把 ' / ' → '.'，' - ' → '-'
  const norm = s.replace(/\s*\/\s*/g, '.').replace(/\s+/g, '');
  // 試跨日 (含 '-')
  if (norm.includes('-')) {
    const [left, right] = norm.split('-');
    const lp = parsePart(left, fallbackYear);
    const rp = parsePart(right, lp?.y || fallbackYear);
    if (!lp || !rp) return null;
    return [{
      startYear: lp.y, startMonth: lp.m, startDay: lp.d,
      endYear: rp.y, endMonth: rp.m, endDay: rp.d,
    }];
  }
  // 單日
  const p = parsePart(norm, fallbackYear);
  if (!p) return null;
  return [{
    startYear: p.y, startMonth: p.m, startDay: p.d,
    endYear: p.y, endMonth: p.m, endDay: p.d,
  }];
}

// 解析 YYYY.MM.DD 或 MM.DD
function parsePart(s, fallbackYear) {
  const parts = s.split('.').filter(Boolean).map(x => parseInt(x, 10));
  if (parts.some(n => !Number.isFinite(n))) return null;
  if (parts.length === 3) return { y: parts[0], m: parts[1], d: parts[2] };
  if (parts.length === 2) return { y: parseInt(fallbackYear, 10) || null, m: parts[0], d: parts[1] };
  return null;
}

function migrateFile(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) { console.log('SKIP (not found):', file); return; }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  let touched = 0, skipped = 0;
  // 處理 flat array of items（admission）vs year-grouped（其他）
  const isFlat = !Array.isArray(raw) ? false : raw.length > 0 && !raw[0].items;
  if (isFlat) {
    // flat array：每筆 item 的 date 字串自帶年份才能 parse
    raw.forEach(item => {
      if (typeof item.date === 'string' && item.date && !item.dates) {
        const dates = parseDateStr(item.date, null);
        if (dates) { item.dates = dates; touched++; }
        else { skipped++; }
      }
    });
  } else {
    raw.forEach(group => {
      const fallbackYear = group.year || null;
      (group.items || []).forEach(item => {
        if (typeof item.date === 'string' && item.date && !item.dates) {
          const dates = parseDateStr(item.date, fallbackYear);
          if (dates) { item.dates = dates; touched++; }
          else { skipped++; }
        }
      });
    });
  }
  fs.writeFileSync(abs, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  console.log(`${file}: migrated=${touched}, skipped(free-text)=${skipped}`);
}

files.forEach(migrateFile);
console.log('\nDone. 舊 date 欄位保留作 fallback。');
