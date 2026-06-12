// 匯入暑期體驗營：data-source/import/SCCD Camp.xlsx → Directus admission_summer_camp。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-summer-camp.cjs [--dry] [--force]
// 欄位對應：col2 年 / col3 日期(MM/DD-MM/DD 或「取消」) / col4 主題→title / col5 營隊名→subtitle /
//   col6,7 主辦單位(中/英、可多行多個)→organizers repeater / col8 國家 / col9 校內外 /
//   col10,11 地點(中/英) / col12,13 城市(中/英，僅校外)。locations 用 col10/11 + country(預設 tw)。
// ⚠️ subtitleZh/En 與 organizers 是新欄位，user 在 Directus 開好後才能成功 POST（否則 Directus 報未知欄位）。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const ExcelJS = require('exceljs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'admission_summer_camp';
const XLSX = 'data-source/import/SCCD Camp.xlsx';
const SHEET = '體驗營';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

const COUNTRY_ZH2CODE = { '台灣':'tw','日本':'jp','美國':'us','韓國':'kr','中國':'cn','法國':'fr','德國':'de','義大利':'it','新加坡':'sg','捷克':'cz' };
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
const lines = v => cellText(v).replace(/\r/g, '').split('\n').map(s => s.trim());
function splitBilingual(raw) {
  let zh = '', en = '';
  for (const ln of lines(raw).filter(Boolean)) {
    if (hasCJK(ln)) zh = zh ? zh + ' ' + ln : ln;
    else en = en ? en + ' ' + ln : ln;
  }
  return { zh, en };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet(SHEET);

  const items = [];
  ws.eachRow((row, i) => {
    if (i <= 2) return; // r1 空 / r2 表頭
    const v = row.values;
    const year = parseInt(cellText(v[2]).trim(), 10);
    if (!Number.isFinite(year)) return;

    const title = splitBilingual(v[4]);
    const subtitle = splitBilingual(v[5]);

    // 日期：MM/DD-MM/DD → startDate/endDate；「取消」或無 → null
    const dateRaw = cellText(v[3]).trim();
    let startDate = null, endDate = null, cancelled = false;
    const m = dateRaw.match(/(\d{1,2})\/(\d{1,2})\s*[-~]\s*(\d{1,2})\/(\d{1,2})/);
    if (m) {
      const pad = n => n.padStart(2, '0');
      startDate = `${year}-${pad(m[1])}-${pad(m[2])}`;
      endDate = `${year}-${pad(m[3])}-${pad(m[4])}`;
    } else if (/取消/.test(dateRaw)) cancelled = true;

    // 主辦單位 organizers：col6 中文行 / col7 英文行，逐行配對
    const zhOrg = lines(v[6]), enOrg = lines(v[7]);
    const orgN = Math.max(zhOrg.length, enOrg.length);
    const organizers = [];
    for (let k = 0; k < orgN; k++) {
      const oz = (zhOrg[k] || '').trim(), oe = (enOrg[k] || '').trim();
      if (oz || oe) organizers.push({ organizerZh: oz, organizerEn: oe });
    }

    // 地點 locations：用 col10/11（校內已是「台北校區/Taipei Campus」），country 取 col8 首個、預設 tw
    const venueZh = cellText(v[10]).trim(), venueEn = cellText(v[11]).trim();
    const ctyRaw = lines(v[8]).find(Boolean) || '';
    const country = COUNTRY_ZH2CODE[ctyRaw] || 'tw';
    const locations = (venueZh || venueEn) ? [{ nameZh: venueZh, nameEn: venueEn, country }] : [];

    items.push({
      titleZh: title.zh, titleEn: title.en,
      subtitleZh: subtitle.zh, subtitleEn: subtitle.en,
      startDate, endDate,
      organizers,
      locations,
      descriptionZh: '', descriptionEn: '',
      _year: year, _locType: cellText(v[9]).trim(), _cancelled: cancelled,
    });
  });

  items.forEach((it, i) => it.sort = i + 1);

  // 預覽
  console.log('=== 預覽（' + items.length + ' 筆）===');
  items.forEach(it => {
    const dates = it.startDate ? `${it.startDate}~${it.endDate}` : (it._cancelled ? '取消(無日期)' : '無日期');
    const loc = it.locations[0] ? `${it.locations[0].nameZh}/${it.locations[0].nameEn}(${it.locations[0].country})` : '—';
    const org = it.organizers.length ? it.organizers.map(o => o.organizerZh || o.organizerEn).join('、') : '—';
    console.log(`  ${it._year} [${it._locType}] ${it.titleZh} / ${it.titleEn}`);
    console.log(`        副標: ${it.subtitleZh} / ${it.subtitleEn}`);
    console.log(`        日期: ${dates} ｜ 地點: ${loc} ｜ 主辦: ${org}`);
  });

  // 出 JSON（去掉 _ 開頭暫存欄）
  const clean = items.map(({ _year, _locType, _cancelled, ...rest }) => rest);
  fs.mkdirSync('data-source/output', { recursive: true });
  fs.writeFileSync('data-source/output/summer-camp-final.json', JSON.stringify(clean, null, 2));
  console.log('\n已輸出 data-source/output/summer-camp-final.json');

  if (DRY) { console.log('--dry：不上傳。'); return; }

  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cur = await fetch(`${BASE}/items/${COLLECTION}?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) { console.log(`⚠️ 已有 ${count} 筆，中止避免重複（--force 覆寫前請先清空）。`); return; }

  const res = await fetch(`${BASE}/items/${COLLECTION}`, { method: 'POST', headers, body: JSON.stringify(clean) });
  const out = await res.json();
  if (!res.ok) { console.log('❌ 匯入失敗:', JSON.stringify(out).slice(0, 600)); return; }
  console.log(`✅ 完成，建立 ${Array.isArray(out.data) ? out.data.length : '?'} 筆暑期營。`);
})().catch(e => console.log('錯誤:', e.message, e.stack));
