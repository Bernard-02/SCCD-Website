// 在 guests repeater 內加一個巢狀 `orgs` repeater（每筆 orgEn/orgZh/orgCountry），支援一個 guest 掛多個單位。
// 加在既有單一 orgCountry 之後；legacy 單欄 orgEn/orgZh/orgCountry 保留（前台 guest-orgs.js：orgs 優先、退 legacy）。
// 只套「完整 guest 形狀」的 collection（sub-field 含 orgCountry）→ activities_degree_show_events（只有 name）自動跳過。
// orgCountry 下拉 clone 既有國家 choices。idempotent、可重跑；先看：node scripts/add-guest-orgs-repeater.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

const req = async (method, path, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];

  // 既有國家 choices 範本（有 tw+jp 的下拉）
  const looksCountry = ch => Array.isArray(ch) && ch.some(c => c?.value === 'tw') && ch.some(c => c?.value === 'jp');
  let countryChoices = null;
  for (const f of all) {
    const subs = f.meta?.options?.fields;
    const c = Array.isArray(subs) && subs.find(s => looksCountry(s.meta?.options?.choices));
    if (c) { countryChoices = c.meta.options.choices; break; }
  }
  if (!countryChoices) throw new Error('找不到既有國家 choices 範本');

  const orgsSub = () => ({
    field: 'orgs', type: 'json',
    meta: {
      interface: 'list',
      note: '多個所屬單位（每筆各自英文/中文/國家）。填了這裡就以此為準；上面單一 Org En/Zh/Country 可留空。',
      options: { fields: [
        { field: 'orgEn', type: 'string', meta: { interface: 'input', width: 'half' } },
        { field: 'orgZh', type: 'string', meta: { interface: 'input', width: 'half' } },
        { field: 'orgCountry', type: 'string', meta: { interface: 'select-dropdown', options: { choices: countryChoices } } },
      ] },
    },
  });

  let done = 0;
  for (const f of all.filter(f => f.field === 'guests')) {
    const subs = f.meta?.options?.fields;
    if (!Array.isArray(subs) || !subs.some(s => s.field === 'orgCountry')) { console.log(`  ↷ ${f.collection}（無 orgCountry，非完整 guest 形狀）跳過`); continue; }
    if (subs.some(s => s.field === 'orgs')) { console.log(`  ↷ ${f.collection} 已有 orgs，跳過`); continue; }
    const at = subs.findIndex(s => s.field === 'orgCountry');
    subs.splice(at + 1, 0, orgsSub());   // 插在單一 orgCountry 之後
    await req('PATCH', `/fields/${f.collection}/guests`, { meta: f.meta });
    console.log(`  ＋ ${f.collection}.guests → orgs（巢狀 repeater：orgEn/orgZh/orgCountry ${countryChoices.length} 國）`);
    done++;
  }
  console.log(DRY ? `\n[dry] 預覽：會加 orgs 到 ${done} 個 collection。` : `\n✅ 完成，加了 ${done} 個。前台硬重整即生效。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
