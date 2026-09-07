// 一次性 schema 遷移（2026-09-07，配合前台三功能）：
//   1. activities 所有 dates repeater 加 monthRange 勾選框（月到月；既有 monthOnly=只到月，兩欄並存）
//   2. activities_workshops / activities_visits_outbound 的 locations repeater 加 country 下拉（clone 既有國家 choices）
//   3. faculty.facultyType 加選項 founder（創辦人）＋把謝大立那筆改成 founder
// 前台已能吃這些欄位（monthRange / locations[].country / type==='founder'）。
// idempotent、可重跑；先看：node scripts/add-founder-loccountry-monthrange.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const MONTH_RANGE_SUB = {
  field: 'monthRange', name: '月到月', type: 'boolean',
  meta: { field: 'monthRange', type: 'boolean', interface: 'boolean', width: 'full',
          options: { label: '月到月範圍（勾選＋日期選 range → May 五月 - June 六月，忽略日）' } },
  schema: { default_value: false },
};
const LOC_COUNTRY_COLLECTIONS = ['activities_workshops', 'activities_visits_outbound'];

(async () => {
  const all = (await req('GET', '/fields')).data || [];

  // ── 1. dates repeater 加 monthRange（所有含 monthOnly 的 dates 欄）──
  console.log('\n【1】dates repeater → 加 monthRange');
  for (const f of all.filter(f => f.field === 'dates')) {
    const subs = f.meta?.options?.fields;
    if (!Array.isArray(subs) || !subs.some(s => s.field === 'monthOnly')) continue;
    if (subs.some(s => s.field === 'monthRange')) { console.log(`  ↷ ${f.collection} 已有 monthRange，跳過`); continue; }
    subs.push(JSON.parse(JSON.stringify(MONTH_RANGE_SUB)));
    await req('PATCH', `/fields/${f.collection}/dates`, { meta: f.meta });
    console.log(`  ＋ ${f.collection}.dates monthRange`);
  }

  // ── 2. locations repeater 加 country（僅 workshops / visits_outbound；clone 既有國家 choices）──
  console.log('\n【2】locations repeater → 加 country（workshops / visits_outbound）');
  // 找任一既有 country 子欄當範本（choices 完整）
  let countryTemplate = null;
  for (const f of all) {
    const c = f.meta?.options?.fields?.find?.(s => s.field === 'country');
    if (c) { countryTemplate = c; break; }
  }
  if (!countryTemplate) throw new Error('找不到既有 country 子欄範本');
  for (const col of LOC_COUNTRY_COLLECTIONS) {
    const f = all.find(f => f.collection === col && f.field === 'locations');
    if (!f) { console.log(`  ⚠ ${col} 無 locations 欄，跳過`); continue; }
    const subs = f.meta.options.fields;
    if (subs.some(s => s.field === 'country')) { console.log(`  ↷ ${col} locations 已有 country，跳過`); continue; }
    subs.push(JSON.parse(JSON.stringify(countryTemplate)));
    await req('PATCH', `/fields/${col}/locations`, { meta: f.meta });
    console.log(`  ＋ ${col}.locations country（${countryTemplate.meta.options.choices.length} 國）`);
  }

  // ── 3a. facultyType 加 founder 選項 ──
  console.log('\n【3】faculty 創辦人');
  const ft = all.find(f => f.collection === 'faculty' && f.field === 'facultyType');
  const choices = ft.meta.options.choices;
  if (choices.some(c => c.value === 'founder')) {
    console.log('  ↷ facultyType 已有 founder 選項，跳過');
  } else {
    choices.push({ text: '創辦人', value: 'founder', color: null });
    await req('PATCH', '/fields/faculty/facultyType', { meta: ft.meta });
    console.log('  ＋ facultyType 選項 founder（創辦人）');
  }

  // ── 3b. 謝大立 → founder ──
  const found = (await req('GET', '/items/faculty?limit=-1&fields=id,nameZh,facultyType&filter[nameZh][_eq]=謝大立')).data || [];
  if (found.length !== 1) {
    console.log(`  ⚠ 謝大立 命中 ${found.length} 筆（預期 1）→ 不自動改，請人工確認`);
  } else if (found[0].facultyType === 'founder') {
    console.log('  ↷ 謝大立 已是 founder，跳過');
  } else {
    await req('PATCH', `/items/faculty/${found[0].id}`, { facultyType: 'founder' });
    console.log(`  ✎ 謝大立（${found[0].id}）facultyType ${found[0].facultyType} → founder`);
  }

  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。前台硬重整即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
