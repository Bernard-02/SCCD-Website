/**
 * generate-ids.js
 * 為所有 activities JSON 補上永久唯一 ID
 * 已有 id 的資料不會被動到
 *
 * 使用方式：node scripts/generate-ids.js
 *
 * ID 格式：{prefix}-{year}-{6位隨機英數字}
 *   et  展演特設 (exhibition, special)
 *   ep  展演常設 (exhibition, permanent) — 無年份：ep-{hash}
 *   vi  來訪 (visit, inbound)
 *   vo  出訪 (visit, outbound)
 *   c   競賽 (competition)
 *   dc  研討會 (conference)
 *   w   工作營 (workshop)
 *   sc  夏令營 (summer camp)
 *   l   講座 (lecture)
 *   s   學生自主 (students present)
 *   i   產學合作 (industry)
 */

const fs   = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '../data');

function genHash() {
  return Math.random().toString(36).slice(2, 8);
}

function processFile(filename, getPrefix) {
  const file = path.join(DATA, filename);
  const data = JSON.parse(fs.readFileSync(file));
  let count = 0;
  data.forEach(yg => {
    yg.items.forEach(item => {
      if (!item.id) {
        item.id = getPrefix(item, yg.year);
        count++;
      }
    });
  });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`${filename}: ${count} ID(s) generated`);
}

// general-activities.json
processFile('general-activities.json', (item, year) => {
  const cat = item.category;
  const et  = item.exhibitionType;
  const vt  = item.visitType;
  let prefix;
  if      (cat === 'exhibitions')  prefix = et === 'permanent' ? 'ep' : 'et';
  else if (cat === 'visits')       prefix = vt === 'inbound'   ? 'vi' : 'vo';
  else if (cat === 'competitions') prefix = 'c';
  else if (cat === 'conferences')  prefix = 'dc';
  else                             prefix = 'x';
  return prefix + '-' + year + '-' + genHash();
});

// permanent-exhibitions.json（常設展無年份）
processFile('permanent-exhibitions.json', () => 'ep-' + genHash());

// workshops.json
processFile('workshops.json', (_, year) => 'w-' + year + '-' + genHash());

// lectures.json
processFile('lectures.json', (_, year) => 'l-' + year + '-' + genHash());

// industry.json
processFile('industry.json', (_, year) => 'i-' + year + '-' + genHash());

// students-present.json
processFile('students-present.json', (_, year) => 's-' + year + '-' + genHash());

// summer-camp.json
processFile('summer-camp.json', (_, year) => 'sc-' + year + '-' + genHash());

console.log('Done.');
