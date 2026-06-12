// 匯入課程表：讀 data-source/import/SCCD Curriculum.xlsx（二維矩陣）→ 建到 Directus curriculum_courses。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-curriculum.cjs [--dry] [--force]
//   --dry  只解析、輸出 data-source/output/curriculum-final.json，不上傳
//   --force collection 非空時仍灌（預設防呆中止避免重複）
// 矩陣結構（2026-06-09 改版：不再分上下學期）：
//   欄=年級區塊（每 3 欄一組：[類別標記][中名⏎英名][中說⏎英說]），row1 學制 row2 年級，row4+ 為資料。
//   標記欄：col 1/4/7/10 = 學士班 一~四年級；col 13/16 = 碩士班 一~二年級。
// 類別標記 → program 對應（甲=動畫組 bfa-animation、乙=創媒組 bfa-cmd；以四下畢業設計課名與課表分頁 label 推定）：
//   甲乙必 → 必修，bfa-animation + bfa-cmd 各一筆
//   甲必   → 必修，只 bfa-animation
//   乙必   → 必修，只 bfa-cmd
//   必     → 必修，碩士欄 = mdes（學士欄理論上不會出現裸「必」，出現則當甲乙必並警告）
//   選     → 選修：學士欄兩組各一筆、碩士欄 mdes 一筆
// 標題/說明同一格內「中文在第一行、英文在第二行」（皆單行），split 換行後 [zh, en]。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'curriculum_courses';
const XLSX = 'data-source/import/SCCD Curriculum.xlsx';
const SHEET = '課程表';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

// 標記欄號 → 學制(kind) / 年級
const BLOCKS = {
  1:  { kind: 'bfa',  grade: 'freshman'  },
  4:  { kind: 'bfa',  grade: 'sophomore' },
  7:  { kind: 'bfa',  grade: 'junior'    },
  10: { kind: 'bfa',  grade: 'senior'    },
  13: { kind: 'mdes', grade: 'year1'     },
  16: { kind: 'mdes', grade: 'year2'     },
};
const GRADE_ORDER = { freshman: 0, sophomore: 1, junior: 2, senior: 3, year1: 4, year2: 5 };
const PROG_ORDER = { 'bfa-animation': 0, 'bfa-cmd': 1, 'mdes': 2 };
const TYPE_ORDER = { required: 0, elective: 1 };

// 剔除控制字元（曾見 \b backspace 殘留），保留 \n \t 與一般可見字元；用 charCode 篩免在原始碼塞控制字元
const stripCtrl = s => Array.from(s).filter(ch => {
  const c = ch.charCodeAt(0);
  return c >= 32 || ch === '\n' || ch === '\t';
}).join('');
const cellText = cell => {
  let v = cell == null ? '' : cell.value;
  if (v && typeof v === 'object' && v.richText) v = v.richText.map(t => t.text).join('');
  return stripCtrl((v == null ? '' : v.toString()).replace(/\r/g, ''));
};
const cleanDesc = s => s.trim();
const cleanTitle = s => s.replace(/\s+/g, ' ').trim();
// 同格「中⏎英」→ [zh, en]（皆單行；只取前兩個非空行，多餘行併進對應語言）
const splitZhEn = txt => {
  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
  return [lines[0] || '', lines.slice(1).join(' ')];
};

// 標記 + 學制 → { type, progs }
function resolve(marker, kind) {
  if (marker === '選') {
    return { type: 'elective', progs: kind === 'mdes' ? ['mdes'] : ['bfa-animation', 'bfa-cmd'] };
  }
  if (marker === '甲乙必') return { type: 'required', progs: ['bfa-animation', 'bfa-cmd'] };
  if (marker === '甲必')   return { type: 'required', progs: ['bfa-animation'] };
  if (marker === '乙必')   return { type: 'required', progs: ['bfa-cmd'] };
  if (marker === '必') {
    if (kind === 'mdes') return { type: 'required', progs: ['mdes'] };
    console.log('⚠️ 學士欄出現裸「必」（無甲/乙），暫當甲乙必處理:', marker);
    return { type: 'required', progs: ['bfa-animation', 'bfa-cmd'] };
  }
  return null; // 非課程標記（年級表頭等）
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet(SHEET);

  // 1) 解析矩陣 → base 課程（含 rowIdx 供穩定排序）
  let rowIdx = 0;
  const base = [];
  ws.eachRow((row, rn) => {
    if (rn < 4) return; // row1 學制 / row2 年級 / row3 空
    for (const c of Object.keys(BLOCKS).map(Number)) {
      const marker = cellText(row.getCell(c)).trim();
      if (!marker) continue;
      const r = resolve(marker, BLOCKS[c].kind);
      if (!r) continue;
      const [titleZh, titleEn] = splitZhEn(cellText(row.getCell(c + 1)));
      if (!titleZh && !titleEn) continue;
      const [descZh, descEn] = splitZhEn(cellText(row.getCell(c + 2)));
      base.push({
        rowIdx: rowIdx++,
        grade: BLOCKS[c].grade,
        type: r.type,
        progs: r.progs,
        titleZh: cleanTitle(titleZh),
        titleEn: cleanTitle(titleEn),
        descriptionZh: cleanDesc(descZh),
        descriptionEn: cleanDesc(descEn),
      });
    }
  });

  // 2) 展開 program（甲乙必 / 學士選修 → 兩筆）
  // semester: '' ＝ 不再分上下學期；前端已不讀此欄，但 Directus 該欄仍是 required(非空) →
  //   填空字串滿足 not-null 驗證（非 fake「上/下」值）。日後在後台把 semester 改非必填或刪欄即可拿掉。
  const items = [];
  base.forEach(b => {
    b.progs.forEach(p => items.push({
      program: p, grade: b.grade, semester: '', type: b.type,
      titleEn: b.titleEn, titleZh: b.titleZh,
      descriptionEn: b.descriptionEn, descriptionZh: b.descriptionZh,
      _rowIdx: b.rowIdx,
    }));
  });

  // 3) 排序 → 指派 sort（program → grade → 必修先於選修 → 原始列序）
  items.sort((a, b) =>
    PROG_ORDER[a.program] - PROG_ORDER[b.program] ||
    GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
    a._rowIdx - b._rowIdx
  );
  items.forEach((it, i) => { it.sort = i + 1; delete it._rowIdx; });

  const byProg = {};
  items.forEach(it => byProg[it.program] = (byProg[it.program] || 0) + 1);
  const noDesc = items.filter(it => !it.descriptionEn && !it.descriptionZh).length;
  console.log(`最終 ${items.length} 筆 | 各 program: ${JSON.stringify(byProg)} | 無說明(防空) ${noDesc} 筆`);

  fs.mkdirSync('data-source/output', { recursive: true });
  fs.writeFileSync('data-source/output/curriculum-final.json', JSON.stringify(items, null, 2));
  console.log('已輸出 data-source/output/curriculum-final.json');

  if (DRY) { console.log('--dry：不上傳。'); return; }

  // 防呆 + 上傳
  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cur = await fetch(`${BASE}/items/${COLLECTION}?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) { console.log(`⚠️ 已有 ${count} 筆，中止避免重複（--force 覆寫前請先清空）。`); return; }

  const CHUNK = 50;
  let created = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK);
    const res = await fetch(`${BASE}/items/${COLLECTION}`, { method: 'POST', headers, body: JSON.stringify(batch) });
    const out = await res.json();
    if (!res.ok) { console.log('❌ 批次失敗 @' + i, JSON.stringify(out).slice(0, 400)); return; }
    created += Array.isArray(out.data) ? out.data.length : 0;
    console.log(`  已建立 ${created}/${items.length}`);
  }
  console.log('✅ 完成，建立', created, '筆課程。');
})().catch(e => console.log('錯誤:', e.message, e.stack));
