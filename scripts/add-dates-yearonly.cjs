// activities 所有 dates repeater 加 yearOnly 勾選框（只到年）。
// 勾選＝該活動只知年份 → 前台日期欄顯示「N/A 無記錄」、並排到該年最後（見 activities-source monthDayKey）。
// 與既有 monthOnly（只到月）/ monthRange（月到月）三欄並存。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-dates-yearonly.cjs --dry
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

const YEAR_ONLY_SUB = {
  field: 'yearOnly', name: '只到年', type: 'boolean',
  meta: { field: 'yearOnly', type: 'boolean', interface: 'boolean', width: 'full',
          options: { label: '只到年（勾選＝只知年份 → 前台顯示 N/A 無記錄，並排到該年最後）' } },
  schema: { default_value: false },
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  console.log('dates repeater → 加 yearOnly');
  for (const f of all.filter(f => f.field === 'dates')) {
    const subs = f.meta?.options?.fields;
    if (!Array.isArray(subs) || !subs.some(s => s.field === 'monthOnly')) continue;
    if (subs.some(s => s.field === 'yearOnly')) { console.log(`  ↷ ${f.collection} 已有 yearOnly，跳過`); continue; }
    subs.push(JSON.parse(JSON.stringify(YEAR_ONLY_SUB)));
    await req('PATCH', `/fields/${f.collection}/dates`, { meta: f.meta });
    console.log(`  ＋ ${f.collection}.dates yearOnly`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。前台硬重整即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
