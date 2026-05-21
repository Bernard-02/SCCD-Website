// 一次性 helper：對所有 schema 設 menu_group.position 對齊網站 nav 順序
// Index(25) → About(26) → Faculty(27) → Courses(28) → Activities(29) → Admission(30) → Library(31) → Atlas(32)

const fs = require('fs');
const path = require('path');

const SCHEMAS_DIR = path.join(__dirname, '..', 'sccd-theme', 'schemas');

// WP admin menu position 慣例：30+ 留給自訂 CPT；25 是 Comments；4/5/6 dashboard 之間
// 用小數讓 position 之間有空隙以後好插入（WP add_menu_page 接受 float）
const POSITIONS = {
  'sccd-index':      30.1,
  'sccd-about':      30.2,
  'sccd-faculty':    30.3,
  'sccd-courses':    30.4,
  'sccd-activities': 30.5,
  'sccd-admission':  30.6,
  'sccd-library':    30.7,
  'sccd-atlas':      30.8,
};

let updated = 0;
for (const f of fs.readdirSync(SCHEMAS_DIR)) {
  if (!f.endsWith('.json')) continue;
  const fpath = path.join(SCHEMAS_DIR, f);
  const schema = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  if (!schema.menu_group?.slug) continue;
  const pos = POSITIONS[schema.menu_group.slug];
  if (!pos) {
    console.warn(`  ⚠️ ${f}: unknown menu_group slug "${schema.menu_group.slug}"`);
    continue;
  }
  schema.menu_group.position = pos;
  fs.writeFileSync(fpath, JSON.stringify(schema, null, 2), 'utf8');
  updated++;
}
console.log(`✓ updated ${updated} schemas with menu_group.position`);
