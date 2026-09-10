// isAlumni 渲染打勾（user 2026-09-10）：清單 render template 只能吐原值 → 讓值本身＝「✓」。
//   1) guests repeater 的 isAlumni 子欄：boolean checkbox → select-dropdown「✓ 校友」（清空＝非校友）
//   2) 資料遷移：isAlumni true/'on' → '✓'；false/null → 移除 key
// 前台相容：activities-data-loader 兩處判斷都是 truthy（'✓' 照樣算校友），零前台改動。
// ⚠️ 打叉「✗」做不到：任何非空值前台都判為校友（'✗' 也是 truthy）→ 沒勾一律空白。
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/alumni-checkmark-value.cjs --dry
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

const NEW_SUB = {
  field: 'isAlumni', name: '校友', type: 'string',
  meta: { field: 'isAlumni', type: 'string', interface: 'select-dropdown', width: 'half',
          options: { choices: [{ text: '✓ 校友', value: '✓' }], allowNone: true, placeholder: '（非校友留空）' } },
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const targets = all.filter(f => f.field === 'guests' && f.meta?.interface === 'list' &&
    /^activities_|^admission_summer_camp$/.test(f.collection) &&
    (f.meta.options?.fields || []).some(s => s.field === 'isAlumni'));

  // 1) 子欄定義換成下拉
  for (const f of targets) {
    const subs = f.meta.options.fields;
    const idx = subs.findIndex(s => s.field === 'isAlumni');
    if (subs[idx]?.meta?.interface === 'select-dropdown') { console.log(`↷ ${f.collection} 子欄已是下拉`); continue; }
    subs[idx] = JSON.parse(JSON.stringify(NEW_SUB));
    await req('PATCH', `/fields/${f.collection}/guests`, { meta: f.meta });
    console.log(`✓ ${f.collection}.guests.isAlumni → ✓ 下拉`);
  }

  // 2) 資料遷移
  for (const f of targets) {
    const rows = (await req('GET', `/items/${f.collection}?limit=-1&fields=id,guests`)).data || [];
    let set = 0;
    for (const it of rows) {
      if (!Array.isArray(it.guests)) continue;
      let dirty = false;
      const guests = it.guests.map(g => {
        if (!g || !('isAlumni' in g)) return g;
        const v = g.isAlumni;
        if (v === '✓') return g;
        dirty = true;
        const { isAlumni, ...rest } = g;
        return (v === true || v === 'on') ? { ...rest, isAlumni: '✓' } : rest;   // falsy → 移除 key
      });
      if (dirty) { await req('PATCH', `/items/${f.collection}/${it.id}`, { guests }); set++; }
    }
    console.log(`  ${f.collection}：遷移 ${set}/${rows.length} 筆`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。清單/收合列的 {{ isAlumni }} 直接顯示 ✓；後台硬重整生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
