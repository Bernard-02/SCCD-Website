// 撤銷 guest 拆欄（user 2026-09-10 翻案）：回到原本 guests json 欄顯示（formatted-json-value），
// display format 補英文名 → 「{{ nameZh }} {{ nameEn }} {{ isAlumni }}」。
//   1) 刪 guest1Text..guestNText 鏡射欄（全 collection）
//   2) 刪「guests→guest 欄同步」Flow（operations 隨 flow 一併刪）
//   3) guests 欄 display format 加 nameEn（收合列 template 本來就有，不動）
// cityText／locationsText／locations flow 不動。idempotent；--dry 預覽。
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

(async () => {
  const all = (await req('GET', '/fields')).data || [];

  // 1) 刪拆欄
  for (const f of all.filter(f => /^guest\d+Text$/.test(f.field) && /^activities_|^admission_summer_camp$/.test(f.collection))) {
    await req('DELETE', `/fields/${f.collection}/${f.field}`);
    console.log(`－ ${f.collection}.${f.field}`);
  }

  // 2) 刪 flow
  const flows = (await req('GET', '/flows?fields=id,name')).data || [];
  const gFlow = flows.find(f => /guests→guest/.test(f.name));
  if (gFlow) { await req('DELETE', `/flows/${gFlow.id}`); console.log(`－ Flow「${gFlow.name}」`); }
  else console.log('↷ guests flow 不存在');

  // 3) display format 補 nameEn
  for (const f of all.filter(f => f.field === 'guests' && f.meta?.interface === 'list' && /^activities_|^admission_summer_camp$/.test(f.collection))) {
    const fmt = f.meta.display_options?.format || '{{ nameZh }}';
    if (fmt.includes('nameEn')) { console.log(`↷ ${f.collection}.guests format 已含 nameEn`); continue; }
    f.meta.display = 'formatted-json-value';
    (f.meta.display_options ||= {}).format = fmt.replace('{{ nameZh }}', '{{ nameZh }} {{ nameEn }}');
    await req('PATCH', `/fields/${f.collection}/guests`, { meta: f.meta });
    console.log(`✓ ${f.collection}.guests format → ${f.meta.display_options.format}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 撤銷完成。後台硬重整生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
