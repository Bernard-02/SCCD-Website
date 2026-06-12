// 匯入專任老師：讀 data-source/faculty-fulltime-template.xlsx（多分頁 + facultyKey 連結）→ 建到 Directus faculty_fulltime。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-faculty-fulltime.cjs [--dry] [--force]
// 分頁：faculty(主檔) + titles/educations/experiences/journey/awards（用同一 facultyKey 連到老師、一筆一列可多列）。
// 轉換：country 中文名/英文名/ISO2 皆可 → ISO2 小寫；isPresent 'Y'→true；startYear/endYear 數字、空→null；image 不碰（之後上傳）。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'faculty_fulltime';
const XLSX = 'data-source/faculty-fulltime-template.xlsx';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

// ISO2 → 中英名（對齊 js/data/country-names.js）
const COUNTRY_NAMES = {
  tw:{zh:'台灣',en:'Taiwan'}, jp:{zh:'日本',en:'Japan'}, kr:{zh:'韓國',en:'South Korea'}, cn:{zh:'中國',en:'China'},
  hk:{zh:'香港',en:'Hong Kong'}, sg:{zh:'新加坡',en:'Singapore'}, my:{zh:'馬來西亞',en:'Malaysia'}, th:{zh:'泰國',en:'Thailand'},
  vn:{zh:'越南',en:'Vietnam'}, ph:{zh:'菲律賓',en:'Philippines'}, id:{zh:'印尼',en:'Indonesia'}, in:{zh:'印度',en:'India'},
  au:{zh:'澳洲',en:'Australia'}, nz:{zh:'紐西蘭',en:'New Zealand'}, us:{zh:'美國',en:'United States'}, ca:{zh:'加拿大',en:'Canada'},
  mx:{zh:'墨西哥',en:'Mexico'}, br:{zh:'巴西',en:'Brazil'}, gb:{zh:'英國',en:'United Kingdom'}, fr:{zh:'法國',en:'France'},
  de:{zh:'德國',en:'Germany'}, it:{zh:'義大利',en:'Italy'}, es:{zh:'西班牙',en:'Spain'}, nl:{zh:'荷蘭',en:'Netherlands'},
  be:{zh:'比利時',en:'Belgium'}, ch:{zh:'瑞士',en:'Switzerland'}, at:{zh:'奧地利',en:'Austria'}, se:{zh:'瑞典',en:'Sweden'},
  no:{zh:'挪威',en:'Norway'}, dk:{zh:'丹麥',en:'Denmark'}, fi:{zh:'芬蘭',en:'Finland'}, pl:{zh:'波蘭',en:'Poland'},
  cz:{zh:'捷克',en:'Czechia'}, ru:{zh:'俄羅斯',en:'Russia'}, tr:{zh:'土耳其',en:'Turkey'}, il:{zh:'以色列',en:'Israel'},
  ae:{zh:'阿聯',en:'UAE'}, za:{zh:'南非',en:'South Africa'}, eg:{zh:'埃及',en:'Egypt'},
};
const ZH2CODE = {}, EN2CODE = {};
for (const [code, n] of Object.entries(COUNTRY_NAMES)) { ZH2CODE[n.zh] = code; EN2CODE[n.en.toLowerCase()] = code; }
// 別名修正（系辦慣用寫法 → 正確 ISO2）：sp/esp=西班牙 es、阿聯酋=阿聯 ae
const ALIASES = { sp: 'es', esp: 'es', '阿聯酋': 'ae' };
const warnCountries = new Set();
function resolveCountry(raw) {
  const s = cellText(raw).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (ALIASES[s]) return ALIASES[s];
  if (ALIASES[lower]) return ALIASES[lower];
  if (COUNTRY_NAMES[lower]) return lower;     // 已是 ISO2
  if (ZH2CODE[s]) return ZH2CODE[s];          // 中文名
  if (EN2CODE[lower]) return EN2CODE[lower];  // 英文名
  warnCountries.add(s);
  return lower;                                // 找不到 → 原樣（之後人工修）
}

// exceljs 儲存格可能回傳物件（richText / hyperlink / formula）→ 取純文字
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
const str = v => cellText(v).replace(/\r/g, '').trim();
function intOrNull(v) {
  const s = cellText(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
const isYes = v => /^(y|yes|true|是|1)$/i.test(cellText(v).trim());

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);

  // 讀某分頁 → 以 facultyKey 分組的 map，row 由 cols(欄號→鍵 + 轉換) 組出
  function groupBy(sheetName, cols) {
    const ws = wb.getWorksheet(sheetName);
    const map = new Map();
    if (!ws) return map;
    ws.eachRow((row, i) => {
      if (i === 1) return; // 表頭
      const v = row.values;
      const key = str(v[1]);
      if (!key) return;
      const obj = {};
      let hasContent = false;
      for (const [field, colIdx, conv] of cols) {
        const val = conv ? conv(v[colIdx]) : str(v[colIdx]);
        obj[field] = val;
        if (val !== '' && val !== null && val !== false) hasContent = true;
      }
      if (!hasContent) return; // 整列空略過
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(obj);
    });
    return map;
  }

  const titles = groupBy('titles', [['titleEn',2],['titleZh',3]]);
  const educations = groupBy('educations', [['country',2,resolveCountry],['schoolEn',3],['schoolZh',4],['majorEn',5],['majorZh',6],['degreeEn',7],['degreeZh',8]]);
  const expCols = [['startYear',2,intOrNull],['endYear',3,intOrNull],['isPresent',4,isYes],['organizationEn',5],['organizationZh',6],['roleEn',7],['roleZh',8]];
  const experiences = groupBy('experiences', expCols);
  const journey = groupBy('journey', expCols);
  const awards = groupBy('awards', [['startYear',2,intOrNull],['endYear',3,intOrNull],['country',4,resolveCountry],['nameEn',5],['nameZh',6],['categoryEn',7],['categoryZh',8]]);

  // 主檔 faculty → 巢狀組裝
  const ws = wb.getWorksheet('faculty');
  const items = [];
  const seenKeys = new Set();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = row.values;
    const key = str(v[1]);
    if (!key) return;
    seenKeys.add(key);
    items.push({
      nameEn: str(v[2]), nameZh: str(v[3]),
      titles: titles.get(key) || [],
      educations: educations.get(key) || [],
      experiences: experiences.get(key) || [],
      journey: journey.get(key) || [],
      awards: awards.get(key) || [],
      sort: items.length + 1,
    });
  });

  // orphan 檢查：子分頁有 facultyKey 但 faculty 主檔沒有
  const orphans = new Set();
  [titles, educations, experiences, journey, awards].forEach(m => m.forEach((_, k) => { if (!seenKeys.has(k)) orphans.add(k); }));

  // 統計
  console.log('=== 解析結果（每位老師子項數）===');
  items.forEach(it => console.log(
    `  ${it.nameZh} (${it.nameEn}) | 職稱${it.titles.length} 學歷${it.educations.length} 經歷${it.experiences.length} 歷程${it.journey.length} 獲獎${it.awards.length}`
  ));
  console.log(`\n共 ${items.length} 位專任老師。`);
  if (orphans.size) console.log('⚠️ 有 facultyKey 在子分頁但 faculty 主檔找不到:', [...orphans].join(', '));
  if (warnCountries.size) console.log('⚠️ 無法辨識的 country（已原樣保留，請人工確認）:', [...warnCountries].join(', '));

  fs.mkdirSync('data-source/output', { recursive: true });
  fs.writeFileSync('data-source/output/faculty-fulltime-final.json', JSON.stringify(items, null, 2));
  console.log('已輸出 data-source/output/faculty-fulltime-final.json');

  if (DRY) { console.log('--dry：不上傳。'); return; }

  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cur = await fetch(`${BASE}/items/${COLLECTION}?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) { console.log(`⚠️ 已有 ${count} 筆，中止避免重複（--force 覆寫前請先清空）。`); return; }

  const res = await fetch(`${BASE}/items/${COLLECTION}`, { method: 'POST', headers, body: JSON.stringify(items) });
  const out = await res.json();
  if (!res.ok) { console.log('❌ 匯入失敗:', JSON.stringify(out).slice(0, 600)); return; }
  console.log(`✅ 完成，建立 ${Array.isArray(out.data) ? out.data.length : '?'} 位專任老師。`);
})().catch(e => console.log('錯誤:', e.message, e.stack));
