// Parse data-source/SCCD Index Website Info.xlsx → data-source/output/courses.json
// 對應 Excel layout：A=semester / 每 5 cols = 1 grade-block [必選, 中名, 英名, 中說, 英說]

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data-source', 'SCCD Index Website Info.xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
// 3 個獨立 CPT 對應 3 個 json：BFA 動畫 + BFA 創意媒體（共用同份內容）+ MDES
const OUT_BFA_ANIMATION = path.join(OUT_DIR, 'bfa-animation.json');
const OUT_BFA_CMD = path.join(OUT_DIR, 'bfa-cmd.json');
const OUT_MDES = path.join(OUT_DIR, 'mdes.json');
// MDES grade key 用 year1/year2（前端 MDES_GRADES 期望），跟 BFA 的 freshman/sophomore 不同 namespace
const MDES_GRADE_REMAP = { 'freshman': 'year1', 'sophomore': 'year2' };

const GRADE_MAP = { '一年級': 'freshman', '二年級': 'sophomore', '三年級': 'junior', '四年級': 'senior' };
const TYPE_MAP = { '必': 'required', '選': 'elective' };
const SEMESTER_MAP = { '上學期': 'upper', '下學期': 'lower' };

const wb = XLSX.readFile(SRC);
const sh = wb.Sheets['Courses 課程'];
const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, blankrows: true });

// Row 0 = program header (col index → program key)
// Row 1 = grade header (col index → grade key)
// Each grade block = 5 cols [type, titleZh, titleEn, descZh, descEn]
// Col A (idx 0) = semester label

// 掃 row 0 找 program 起始 col
const programs = []; // [{ startCol, programKey }]
for (let c = 0; c < rows[0].length; c++) {
  const cell = rows[0][c];
  if (!cell) continue;
  const txt = String(cell);
  let key = null;
  if (/BFA/i.test(txt) || /學士班/.test(txt)) key = 'bfa';
  else if (/MDES/i.test(txt) || /碩士班/.test(txt)) key = 'mdes';
  if (key) programs.push({ startCol: c, programKey: key });
}

// 掃 row 1 找 grade 起始 col
const grades = []; // [{ startCol, gradeKey }]
for (let c = 0; c < rows[1].length; c++) {
  const cell = rows[1][c];
  if (!cell) continue;
  const gk = GRADE_MAP[String(cell).trim()];
  if (gk) grades.push({ startCol: c, gradeKey: gk });
}

// 每個 grade block 起始 col = grades[i].startCol，5 cols 寬
// 推 program：grade.startCol 屬於哪個 program 區（>= program.startCol 且 < 下一個 program.startCol）
function resolveProgram(col) {
  let cur = programs[0].programKey;
  for (const p of programs) {
    if (col >= p.startCol) cur = p.programKey;
    else break;
  }
  return cur;
}

// 掃資料行：track current semester（由 col A）
const out = { bfa: [], mdes: [] };
let semester = null;
for (let r = 2; r < rows.length; r++) {
  const row = rows[r];
  if (!row) continue;
  const semCell = row[0];
  if (semCell && SEMESTER_MAP[String(semCell).trim()]) {
    semester = SEMESTER_MAP[String(semCell).trim()];
    continue;
  }
  // 對每個 grade block 抽該 row 5 cells
  for (const g of grades) {
    const type = row[g.startCol];
    const titleZh = row[g.startCol + 1];
    const titleEn = row[g.startCol + 2];
    const descZh = row[g.startCol + 3];
    const descEn = row[g.startCol + 4];
    if (!type && !titleZh && !titleEn) continue; // 空格
    const entry = {};
    if (titleEn) entry.titleEn = String(titleEn).trim();
    if (titleZh) entry.titleZh = String(titleZh).trim();
    if (type && TYPE_MAP[String(type).trim()]) entry.type = TYPE_MAP[String(type).trim()];
    entry.grade = g.gradeKey;
    if (semester) entry.semester = semester;
    if (descEn) entry.descriptionEn = String(descEn).trim();
    if (descZh) entry.descriptionZh = String(descZh).trim();
    const program = resolveProgram(g.startCol);
    out[program].push(entry);
  }
}

// 拆 3 個 CPT：BFA 內容 duplicate 到 animation + cmd；MDES 內容 remap grade
const mdesOut = out.mdes.map(e => ({
  ...e,
  ...(MDES_GRADE_REMAP[e.grade] ? { grade: MDES_GRADE_REMAP[e.grade] } : {}),
}));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_BFA_ANIMATION, JSON.stringify(out.bfa, null, 2), 'utf8');
fs.writeFileSync(OUT_BFA_CMD, JSON.stringify(out.bfa, null, 2), 'utf8');
fs.writeFileSync(OUT_MDES, JSON.stringify(mdesOut, null, 2), 'utf8');

console.log(`Parsed →`);
console.log(`  ${OUT_BFA_ANIMATION} (${out.bfa.length} entries)`);
console.log(`  ${OUT_BFA_CMD} (${out.bfa.length} entries, duplicate)`);
console.log(`  ${OUT_MDES} (${mdesOut.length} entries, grade remapped to year1/year2)`);
