// activities_degree_show_events.guests repeater 只有 nameZh/nameEn → 補 akaZh/akaEn/country
// （比照其他 activities guests；前台 renderEventGuests 渲染「人名（AKA）（國家）」）。
// 子欄定義從既有「完整 guest 形狀」的 collection clone（country 下拉 349 國同源、免寫死）。
// 插在 nameEn 之後、idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-degree-show-guest-aka-country.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const TARGET = 'activities_degree_show_events';
const ADD = ['akaZh', 'akaEn', 'country'];

const req = async (method, path, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];

  // 範本＝已有全部 akaZh/akaEn/country 子欄的 guests 欄（clone 其定義，含 country 下拉 choices）
  const tmpl = all.find(f => f.field === 'guests'
    && ADD.every(name => (f.meta?.options?.fields || []).some(s => s.field === name)));
  if (!tmpl) throw new Error('找不到含 akaZh/akaEn/country 的 guests 範本');
  const defs = Object.fromEntries(tmpl.meta.options.fields.filter(s => ADD.includes(s.field)).map(s => [s.field, s]));

  const f = all.find(x => x.collection === TARGET && x.field === 'guests');
  if (!f) throw new Error(`找不到 ${TARGET}.guests`);
  const subs = f.meta.options.fields;

  let at = subs.findIndex(s => s.field === 'nameEn');   // 插在 nameEn 之後（順序：name → aka → country）
  const added = [];
  for (const name of ADD) {
    if (subs.some(s => s.field === name)) { console.log(`  ↷ 已有 ${name}，跳過`); continue; }
    subs.splice(++at, 0, JSON.parse(JSON.stringify(defs[name])));
    added.push(name);
  }
  if (!added.length) { console.log('\n✅ 已是最新，無需變更。'); return; }

  await req('PATCH', `/fields/${TARGET}/guests`, { meta: f.meta });
  if (!DRY) {
    const chk = (await req('GET', `/fields/${TARGET}/guests`)).data;
    const now = (chk.meta?.options?.fields || []).map(s => s.field);
    if (!ADD.every(n => now.includes(n))) throw new Error(`寫入後驗證失敗，現有子欄：${now.join(', ')}`);
  }
  console.log(`\n${DRY ? '[dry] 會加' : '✅ 已加'} ${TARGET}.guests → ${added.join('、')}（後台 Ctrl+F5 生效）`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
