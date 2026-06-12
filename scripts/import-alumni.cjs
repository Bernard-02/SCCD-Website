// 匯入系友 atlas 資料：data-source/import/SCCD Alumni.xlsx（單分頁三段矩陣）→ Directus alumni_careers / alumni_hosting / alumni_employment。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-alumni.cjs [--dry] [--force]
// 結構：col1/col2=職業(中/英)；col3,col5=主持(公司名 中⏎英，無系友人名→alumniName 留空)；col7-17=就職(按國家分區)。
// 就職國家分區：列含國名表頭(美國/日本/中國/德國/新加坡/捷克/韓國/義大利/法國)→ 從該欄到下一表頭欄前都屬該國；
//   遇「台灣」後進入 taiwanMode：col7 是產業標籤(科技/公股…)跳過、col8-17 公司全算台灣。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const XLSX = 'data-source/import/SCCD Alumni.xlsx';
const SHEET = '系友';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

const COUNTRY_HEADERS = { '美國':'us','日本':'jp','中國':'cn','德國':'de','新加坡':'sg','捷克':'cz','韓國':'kr','義大利':'it','法國':'fr','台灣':'tw' };
const COUNTRY_ZH = { tw:'台灣',jp:'日本',kr:'韓國',cn:'中國',sg:'新加坡',us:'美國',fr:'法國',de:'德國',it:'義大利',cz:'捷克' };

const hasCJK = s => /[㐀-鿿豈-﫿]/.test(s);
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
function splitBilingual(raw) {
  const lines = cellText(raw).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  let zh = '', en = '';
  for (const ln of lines) {
    if (hasCJK(ln)) zh = zh ? zh + ' ' + ln : ln;
    else en = en ? en + ' ' + ln : ln;
  }
  return { zh, en };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet(SHEET);

  const careers = [], hosting = [], employment = [];
  let colCountry = {}, taiwanMode = false;
  const warns = [];

  ws.eachRow((row, i) => {
    if (i === 1) return; // 表頭「職業/主持/就職」
    const v = row.values;

    // 1) 職業 careers：col1/col2
    const cZh = cellText(v[1]).trim(), cEn = cellText(v[2]).trim();
    if (cZh || cEn) careers.push({ careerZh: cZh, careerEn: cEn });

    // 2) 主持 hosting：col3、col5（公司名，alumniName 留空）
    for (const c of [3, 5]) {
      const raw = cellText(v[c]).trim();
      if (!raw) continue;
      const { zh, en } = splitBilingual(v[c]);
      hosting.push({ companyZh: zh, companyEn: en, alumniNameEn: '', alumniNameZh: '' });
    }

    // 3) 就職 employment：col7-17 國家分區
    const headerCols = [];
    for (let c = 7; c <= 17; c++) {
      const t = cellText(v[c]).trim();
      if (COUNTRY_HEADERS[t]) headerCols.push({ c, country: COUNTRY_HEADERS[t] });
    }
    if (headerCols.length) {
      headerCols.sort((a, b) => a.c - b.c);
      for (let h = 0; h < headerCols.length; h++) {
        const startC = headerCols[h].c;
        const endC = h + 1 < headerCols.length ? headerCols[h + 1].c - 1 : 17;
        for (let c = startC; c <= endC; c++) colCountry[c] = headerCols[h].country;
      }
      if (headerCols.some(h => h.country === 'tw')) taiwanMode = true;
    }
    for (let c = 7; c <= 17; c++) {
      const raw = cellText(v[c]).trim();
      if (!raw || COUNTRY_HEADERS[raw]) continue;        // 空 或 國名表頭
      if (taiwanMode && c === 7) continue;               // 台灣產業標籤欄
      const country = colCountry[c];
      if (!country) { warns.push(`row${i} col${c} 無法判定國家: [${raw.replace(/\n/g,'/')}]`); continue; }
      const { zh, en } = splitBilingual(v[c]);
      employment.push({ companyZh: zh, companyEn: en, country });
    }
  });

  careers.forEach((it, i) => it.sort = i + 1);
  hosting.forEach((it, i) => it.sort = i + 1);
  employment.forEach((it, i) => it.sort = i + 1);

  // 預覽
  console.log(`\n=== 職業 careers（${careers.length}）===`);
  console.log(careers.map(c => `${c.careerZh}/${c.careerEn || '—'}`).join('  ｜  '));
  console.log(`\n=== 主持 hosting（${hosting.length}，公司名，系友人名留空）===`);
  console.log(hosting.map(h => `${h.companyZh || '—'}/${h.companyEn || '—'}`).join('  ｜  '));
  console.log(`\n=== 就職 employment（${employment.length}）按國家分組 ===`);
  const byC = {};
  employment.forEach(e => { (byC[e.country] = byC[e.country] || []).push(e); });
  for (const [code, arr] of Object.entries(byC)) {
    console.log(`\n  [${COUNTRY_ZH[code] || code} / ${code}] ${arr.length} 間:`);
    console.log('    ' + arr.map(e => `${e.companyZh || '—'}/${e.companyEn || '—'}`).join('  ｜  '));
  }
  if (warns.length) { console.log('\n⚠️ 注意:'); warns.forEach(w => console.log('  ' + w)); }

  fs.mkdirSync('data-source/output', { recursive: true });
  fs.writeFileSync('data-source/output/alumni-final.json', JSON.stringify({ careers, hosting, employment }, null, 2));
  console.log('\n已輸出 data-source/output/alumni-final.json');

  if (DRY) { console.log('--dry：不上傳。'); return; }

  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  async function postAll(collection, items) {
    const cur = await fetch(`${BASE}/items/${collection}?aggregate[count]=*`, { headers }).then(r => r.json());
    const count = Number(cur?.data?.[0]?.count || 0);
    if (count > 0 && !FORCE) { console.log(`⚠️ ${collection} 已有 ${count} 筆，跳過（--force 覆寫前請先清空）。`); return; }
    const res = await fetch(`${BASE}/items/${collection}`, { method: 'POST', headers, body: JSON.stringify(items) });
    const out = await res.json();
    if (!res.ok) { console.log(`❌ ${collection} 失敗:`, JSON.stringify(out).slice(0, 400)); return; }
    console.log(`✅ ${collection} 建立 ${Array.isArray(out.data) ? out.data.length : '?'} 筆。`);
  }
  await postAll('alumni_careers', careers);
  await postAll('alumni_hosting', hosting);
  await postAll('alumni_employment', employment);
})().catch(e => console.log('錯誤:', e.message, e.stack));
