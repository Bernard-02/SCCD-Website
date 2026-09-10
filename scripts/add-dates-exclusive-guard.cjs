// activities dates repeater 三 checkbox（monthOnly／monthRange／yearOnly）互斥防呆：
// 勾了任一個 → 另外兩個 readonly；自身已勾不鎖（永遠可取消，壞資料不會卡死）。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-dates-exclusive-guard.cjs --dry
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

const FLAGS = ['monthOnly', 'monthRange', 'yearOnly'];
const condFor = (self) => [{
  name: 'exclusive-guard',
  rule: {
    _and: [
      { [self]: { _neq: true } },
      { _or: FLAGS.filter(f => f !== self).map(f => ({ [f]: { _eq: true } })) },
    ],
  },
  readonly: true,
}];

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  console.log('dates repeater → 三 checkbox 互斥 conditions');
  for (const f of all.filter(f => f.field === 'dates')) {
    const subs = f.meta?.options?.fields;
    if (!Array.isArray(subs) || !subs.some(s => s.field === 'monthOnly')) continue;
    const targets = subs.filter(s => FLAGS.includes(s.field));
    if (targets.every(s => s.meta?.conditions?.some(c => c.name === 'exclusive-guard'))) {
      console.log(`  ↷ ${f.collection} 已有 exclusive-guard，跳過`); continue;
    }
    for (const s of targets) (s.meta ||= {}).conditions = condFor(s.field);
    await req('PATCH', `/fields/${f.collection}/dates`, { meta: f.meta });
    console.log(`  ＋ ${f.collection}.dates 互斥（${targets.map(s => s.field).join('/')}）`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台重整編輯畫面即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
