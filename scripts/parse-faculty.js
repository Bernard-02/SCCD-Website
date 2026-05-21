// Parse data/faculty.json → data-source/output/faculty-{fulltime,parttime,admin}.json
//
// 對應 3 個 CPT schema：sccd-theme/schemas/faculty-{fulltime,parttime,admin}.json
// 每筆輸出物件僅含 schema fields，由 WP import 工具（CMB2 + sccd CLI）批次匯入。
//
// 為何走 json→json：faculty 沒有 xlsx 來源工作表（xlsx 只有 Courses 一個 sheet），
// 現有 data/faculty.json 直接就是 source of truth。

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'faculty.json');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
const OUT_FULLTIME = path.join(OUT_DIR, 'faculty-fulltime.json');
const OUT_PARTTIME = path.join(OUT_DIR, 'faculty-parttime.json');
const OUT_ADMIN = path.join(OUT_DIR, 'faculty-admin.json');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const data = JSON.parse(fs.readFileSync(SRC, 'utf-8'));

const fulltime = [];
const parttime = [];
const admin = [];

for (const item of data) {
  if (item.type === 'fulltime') {
    fulltime.push({
      id: item.id,
      image: item.image || '',
      nameZh: item.nameZh || '',
      nameEn: item.nameEn || '',
      titles: (item.titles || []).map(t => ({
        titleZh: t.titleZh || '',
        titleEn: t.titleEn || '',
      })),
      educations: (item.educations || []).map(e => ({
        country: (e.country || '').toLowerCase(),
        schoolZh: e.schoolZh || '',
        schoolEn: e.schoolEn || '',
        majorZh: e.majorZh || '',
        majorEn: e.majorEn || '',
        degreeZh: e.degreeZh || '',
        degreeEn: e.degreeEn || '',
      })),
      experiences: (item.experiences || []).map(x => ({
        startYear: x.startYear || '',
        endYear: x.endYear || '',
        organizationZh: x.organizationZh || '',
        organizationEn: x.organizationEn || '',
        roleZh: x.roleZh || '',
        roleEn: x.roleEn || '',
      })),
      awards: (item.awards || []).map(a => ({
        startYear: a.startYear || '',
        endYear: a.endYear || '',
        nameZh: a.nameZh || '',
        nameEn: a.nameEn || '',
        workZh: a.workZh || '',
        workEn: a.workEn || '',
        categoryZh: a.categoryZh || '',
        categoryEn: a.categoryEn || '',
      })),
    });
  } else if (item.type === 'parttime') {
    parttime.push({
      id: item.id,
      image: item.image || '',
      nameZh: item.nameZh || '',
      nameEn: item.nameEn || '',
      titles: (item.titles || []).map(t => ({
        titleZh: t.titleZh || '',
        titleEn: t.titleEn || '',
      })),
    });
  } else if (item.type === 'admin') {
    admin.push({
      id: item.id,
      image: item.image || '',
      nameZh: item.nameZh || '',
      nameEn: item.nameEn || '',
      titleZh: item.titleZh || '',
      titleEn: item.titleEn || '',
      contact: item.contact || '',
    });
  }
}

fs.writeFileSync(OUT_FULLTIME, JSON.stringify(fulltime, null, 2), 'utf-8');
fs.writeFileSync(OUT_PARTTIME, JSON.stringify(parttime, null, 2), 'utf-8');
fs.writeFileSync(OUT_ADMIN, JSON.stringify(admin, null, 2), 'utf-8');

console.log(`✓ Wrote ${fulltime.length} fulltime → ${path.relative(process.cwd(), OUT_FULLTIME)}`);
console.log(`✓ Wrote ${parttime.length} parttime → ${path.relative(process.cwd(), OUT_PARTTIME)}`);
console.log(`✓ Wrote ${admin.length} admin → ${path.relative(process.cwd(), OUT_ADMIN)}`);
