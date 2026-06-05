// 匯入兼任老師：讀 data-source/faculty-parttime-template.xlsx → 建到 Directus faculty_parttime。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-faculty-parttime.cjs
//   （Directus 現為 https + 自簽憑證 → 忽略 TLS 驗證；正式上網域+有效憑證後可移除該 env）
// 需要 scripts/.directus-token（static token，已 gitignore）。
// 防呆：collection 非空時中止（避免重複），確定要再灌加 --force。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'faculty_parttime';
const XLSX = 'data-source/faculty-parttime-template.xlsx';
const SHEET = 'parttime';
const FORCE = process.argv.includes('--force');

(async () => {
  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet(SHEET);
  const items = [];
  ws.eachRow((row, i) => {
    if (i === 1) return; // 表頭
    const v = row.values;
    const nameEn = (v[1] || '').toString().trim();
    if (!nameEn || nameEn.includes('範例')) return;
    const nameZh = (v[2] || '').toString().trim();
    const titleEn = (v[3] || '').toString().trim();
    const titleZh = (v[4] || '').toString().trim();
    // titles 是 repeater → 一筆職稱（沒填就不放）
    const titles = (titleEn || titleZh) ? [{ titleEn, titleZh }] : [];
    items.push({ nameEn, nameZh, titles });
  });
  console.log(`讀到 ${items.length} 筆 part-time。`);

  // 防呆：非空中止
  const cur = await fetch(`${BASE}/items/${COLLECTION}?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) {
    console.log(`⚠️ faculty_parttime 已有 ${count} 筆，為避免重複已中止。確定要再灌請加 --force。`);
    return;
  }

  // 批次建立（POST 陣列）
  const res = await fetch(`${BASE}/items/${COLLECTION}`, { method: 'POST', headers, body: JSON.stringify(items) });
  const out = await res.json();
  if (!res.ok) { console.log('❌ 匯入失敗:', JSON.stringify(out).slice(0, 500)); return; }
  console.log(`✅ 成功建立 ${Array.isArray(out.data) ? out.data.length : '?'} 筆 part-time。`);
})().catch(e => console.log('錯誤:', e.message));
