// data-source/Untitled spreadsheet.xlsx（sheet「award sos 1.0」）→ Directus library_awards 批量匯入。
// 對應（user 2026-09-13 拍板）：
//   年→year、國旗(中文國名)→country(ISO)、獎名(中\n英)→competitionZh/En、
//   主辦方(中\n英×N)＋主辦方國欄→organizers repeater [{zh,en,country}]、
//   獎別中/英→ranks（全進名次；categories 留空——前台獎項分類欄 2026-09-12 已移除）、
//   人(中文名\n×N)→winners [{nameEn:'', nameZh}]（英文名之後有名單再批次 PATCH 補）。
// sort＝表內順序（前台 -year,sort → 同年內保持表序）。
// 跑法：node scripts/import-library-awards.cjs           → dry：只印統計＋樣本＋警告，不動線上
//       node scripts/import-library-awards.cjs --write   → 先刪線上 Test 假資料，再分批寫入
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = process.argv.find(a => a.endsWith('.xlsx')) ||
  path.join(__dirname, '..', 'data-source', 'Untitled spreadsheet.xlsx');
const WRITE = process.argv.includes('--write');
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'library_awards';

// 表上出現過的中文國名 → ISO（對齊後台 country 下拉 choices）；缺漏會印警告、country 留空
const COUNTRY = {
  台灣: 'tw', 台北: 'tw', 日本: 'jp', 中國: 'cn', 香港: 'hk', 澳門: 'mo', 泰國: 'th',
  美國: 'us', 加拿大: 'ca', 墨西哥: 'mx', 巴西: 'br', 烏拉圭: 'uy',
  英國: 'gb', 法國: 'fr', 德國: 'de', 荷蘭: 'nl', 比利時: 'be', 瑞士: 'ch', 奧地利: 'at',
  西班牙: 'es', 瑞典: 'se', 捷克: 'cz', 匈牙利: 'hu', 羅馬尼亞: 'ro', 克羅埃西亞: 'hr',
  烏克蘭: 'ua', 澳洲: 'au', 紐西蘭: 'nz', 不丹: 'bt',
};
const cjk = s => /[一-鿿]/.test(s);
const lines = v => String(v).split('\n').map(s => s.trim()).filter(Boolean);
const warnings = [];

function parseSheet() {
  const wb = XLSX.readFile(SRC);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const items = [];
  let prevYear = 0;
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2; // xlsx 1-based＋header
    let year = parseInt(String(r[0]).trim(), 10);
    if (!year) {
      if (!r.some(c => String(c).trim())) return; // 空白分隔列
      // 有內容但漏填年份（如 row 228 BUtiful Film Festival）→ 沿用上一列年份
      year = prevYear;
      warnings.push(`row ${rowNo}: 缺年份，沿用上一列 ${year}（${lines(r[2])[0] || ''}）`);
      if (!year) return;
    }
    prevYear = year;
    // 國旗：country 已改 csv 多選（patch-library-awards-country-multi.cjs）→ 多國全收、逗號串接
    const flagNames = lines(r[1]);
    flagNames.forEach(n => { if (!COUNTRY[n]) warnings.push(`row ${rowNo}: 國名「${n}」無 ISO 對應，略過`); });
    const country = flagNames.map(n => COUNTRY[n]).filter(Boolean).join(',');

    const nameLines = lines(r[2]);
    const competitionZh = nameLines.filter(cjk).join(' ');
    const competitionEn = nameLines.filter(l => !cjk(l)).join(' ');

    // 主辦方：中文行開新 org、後接的英文行補 en、獨立英文行＝en-only org；再依序配主辦方國欄
    const orgs = [];
    for (const l of lines(r[3])) {
      const last = orgs[orgs.length - 1];
      if (cjk(l)) orgs.push({ zh: l, en: '' });
      else if (last && last.zh && !last.en) last.en = l;
      else orgs.push({ zh: '', en: l });
    }
    const orgCountries = lines(r[4]).map(n => {
      const c = COUNTRY[n] || '';
      if (n && !c) warnings.push(`row ${rowNo}: 主辦方國「${n}」無 ISO 對應`);
      return c;
    });
    if (orgCountries.length && orgs.length !== orgCountries.length && orgCountries.length !== 1)
      warnings.push(`row ${rowNo}: 主辦方 ${orgs.length} 個 vs 國家 ${orgCountries.length} 個，依序配對`);
    orgs.forEach((o, k) => { o.country = orgCountries[k] ?? orgCountries[0] ?? ''; });

    // 獎別多行＝多筆 ranks（如 row 525 兩機構），中英逐行配對
    const rankZh = lines(r[5]), rankEn = lines(r[6]);
    const ranks = Array.from({ length: Math.max(rankZh.length, rankEn.length) },
      (_, k) => ({ zh: rankZh[k] || '', en: rankEn[k] || '' })).filter(o => o.zh || o.en);
    // 得獎人：col7 中文＋col8 英文（14 列有填：整班「Class of 2020, BFA, DCD」等）逐行配對——
    // ⚠️ col8 有前導空行（同列前幾位無英文、末位才有）→ 不能先濾空行再配，要 raw split 按行序 zip
    const wZh = String(r[7]).split('\n').map(s => s.trim());
    const wEn = String(r[8]).split('\n').map(s => s.trim());
    const winners = Array.from({ length: Math.max(wZh.length, wEn.length) },
      (_, k) => ({ nameEn: wEn[k] || '', nameZh: wZh[k] || '' })).filter(w => w.nameEn || w.nameZh);
    items.push({
      sort: items.length + 1,
      year, country, competitionEn, competitionZh,
      organizers: orgs,
      ranks,
      winners,
    });
  });
  return items;
}

async function main() {
  const items = parseSheet();
  const years = [...new Set(items.map(i => i.year))];
  console.log(`解析：${items.length} 筆、${years.length} 個年份（${Math.min(...years)}–${Math.max(...years)}）`);
  warnings.forEach(w => console.log('⚠️ ', w));
  if (!WRITE) {
    console.log('\n[dry] 樣本（前 3 筆＋最後 1 筆）：');
    console.log(JSON.stringify([...items.slice(0, 3), items[items.length - 1]], null, 2));
    console.log('\n[dry] 未寫入。確認無誤後跑：node scripts/import-library-awards.cjs --write');
    return;
  }

  const token = fs.readFileSync(path.join(__dirname, '.directus-token'), 'utf8').trim();
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 1) 清測試假資料（只刪 competitionEn 以 Test Design Award 開頭的）
  const testRes = await fetch(`${BASE}/items/${COL}?filter[competitionEn][_starts_with]=Test Design Award&fields=id&limit=-1`, { headers: H });
  const testIds = ((await testRes.json()).data || []).map(d => d.id);
  if (testIds.length) {
    const del = await fetch(`${BASE}/items/${COL}`, { method: 'DELETE', headers: H, body: JSON.stringify(testIds) });
    if (!del.ok) throw new Error(`刪測試資料失敗 ${del.status}: ${(await del.text()).slice(0, 300)}`);
    console.log(`✓ 已刪 ${testIds.length} 筆測試資料`);
  } else console.log('（無測試資料可刪）');

  // 2) 分批寫入（弱機：50 筆/批、失敗重試一次）
  const CHUNK = 50;
  let done = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    let res = await fetch(`${BASE}/items/${COL}`, { method: 'POST', headers: H, body: JSON.stringify(chunk) });
    if (!res.ok) {
      console.log(`批 ${i / CHUNK + 1} 失敗 ${res.status}，重試…`);
      res = await fetch(`${BASE}/items/${COL}`, { method: 'POST', headers: H, body: JSON.stringify(chunk) });
      if (!res.ok) throw new Error(`批 ${i / CHUNK + 1} 重試仍失敗 ${res.status}: ${(await res.text()).slice(0, 300)}（已寫入 ${done} 筆，重跑前先清空 collection）`);
    }
    done += chunk.length;
    console.log(`  …${done}/${items.length}`);
  }

  // 3) 驗證總數
  const cnt = await fetch(`${BASE}/items/${COL}?aggregate[count]=id`, { headers: H });
  console.log(`✅ 完成。線上總數：${JSON.stringify((await cnt.json()).data)}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
