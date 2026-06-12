// 匯入離職教師（用於 atlas）：讀 data-source/import/SCCD Former Faculty.xlsx → Directus faculty_former。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-faculty-former.cjs [--dry] [--force]
// 來源是網格：一列最多 4 位，每位佔 2 欄＝[姓名格, 職稱格]，欄組 (2,3)(4,5)(6,7)(8,9)。
// 每格內含兩行「中文 / 英文」（順序不定，有的英文在前）→ 用語言自動判斷拆 zh/en。
// 職稱有時是單語公司名（in house / 天工開物 …）→ 有什麼存什麼、另一語留空。「/」與空格跳過。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'faculty_former';
const XLSX = 'data-source/import/SCCD Former Faculty.xlsx';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

const PAIRS = [[2, 3], [4, 5], [6, 7], [8, 9]]; // [姓名欄, 職稱欄]
const hasCJK = s => /[㐀-鿿豈-﫿]/.test(s);

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}
// 把「中文/英文」雙行格拆成 {zh,en}；單行依語言歸位；順序不定靠語言判斷
function splitBilingual(raw) {
  const lines = cellText(raw).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  let zh = '', en = '';
  for (const ln of lines) {
    if (hasCJK(ln)) { if (!zh) zh = ln; else zh += ' ' + ln; }
    else { if (!en) en = ln; else en += ' ' + ln; }
  }
  return { zh, en, lineCount: lines.length, raw: lines.join(' / ') };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet('教師表');

  const items = [];
  const warns = [];
  ws.eachRow((row, i) => {
    const v = row.values;
    for (const [nc, tc] of PAIRS) {
      const nameRaw = cellText(v[nc]).trim();
      if (!nameRaw || nameRaw === '/') continue; // 空位/分隔
      const name = splitBilingual(v[nc]);
      const title = splitBilingual(v[tc]);
      const item = { nameEn: name.en, nameZh: name.zh, titleEn: title.en, titleZh: title.zh };
      items.push(item);
      // 警示：姓名缺一語 / 職稱整個空 / 某格三行以上
      if (!name.zh || !name.en) warns.push(`row${i} 姓名缺一語: [${name.raw}]`);
      if (!title.zh && !title.en) warns.push(`row${i} ${name.raw} 無職稱`);
      if (name.lineCount > 2 || title.lineCount > 2) warns.push(`row${i} ${name.raw} 某格>2行（姓名${name.lineCount}/職稱${title.lineCount}）`);
    }
  });

  // 去重：完全相同姓名（中+英）留第一筆，再重編 sort
  const seen = new Set();
  const deduped = [];
  let removed = 0;
  for (const it of items) {
    const k = it.nameZh + '|' + it.nameEn;
    if (seen.has(k)) { removed++; continue; }
    seen.add(k); deduped.push(it);
  }
  items.length = 0; items.push(...deduped);
  items.forEach((it, i) => { it.sort = i + 1; });
  if (removed) console.log('· 去重移除', removed, '筆完全重複姓名。');

  console.log('=== 完整清單（' + items.length + ' 位）===');
  items.forEach(it => console.log(
    `${String(it.sort).padStart(3)}. ${it.nameZh || '—'} / ${it.nameEn || '—'}  ｜  ${it.titleZh || '—'} / ${it.titleEn || '—'}`
  ));

  // 單語職稱（公司名只有一種語言）單獨列出供確認
  const singleLangTitle = items.filter(it => !it.titleZh || !it.titleEn);
  console.log('\n=== 職稱只有單一語言（' + singleLangTitle.length + ' 位，另一語留空，正常）===');
  singleLangTitle.forEach(it => console.log(`  ${it.nameZh || it.nameEn}: [${it.titleZh || it.titleEn}]`));

  if (warns.length) { console.log('\n⚠️ 需注意:'); warns.forEach(w => console.log('  ' + w)); }
  else console.log('\n✅ 無異常（姓名都齊中英、職稱都有值）。');

  fs.mkdirSync('data-source/output', { recursive: true });
  fs.writeFileSync('data-source/output/faculty-former-final.json', JSON.stringify(items, null, 2));
  console.log('\n已輸出 data-source/output/faculty-former-final.json（' + items.length + ' 位）。');

  if (DRY) { console.log('--dry：不上傳。'); return; }

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
  console.log('✅ 完成，建立', created, '位離職教師。');
})().catch(e => console.log('錯誤:', e.message, e.stack));
