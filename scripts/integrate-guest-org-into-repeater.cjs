// 把 guests 的「單一 org」（top-level orgEn/orgZh/orgCountry）整合進 orgs repeater，然後移除 top-level 三欄。
//   Phase 1（資料）：每個 guest 若有 legacy org → prepend 成 orgs[0]（dup-guard），並清掉 legacy 三 key。
//   Phase 2（schema）：從 guests repeater 的子欄移除 top-level orgEn/orgZh/orgCountry（orgs 內的同名子欄不動）。
// 前台 guest-orgs.js 讀 orgs（fallback JSON 舊 shape 仍走 legacy/affiliation 分支，不受影響）。
// idempotent、可重跑；先看：node scripts/integrate-guest-org-into-repeater.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

const req = async (method, path, body) => {
  if (DRY && method !== 'GET') { return { data: {}, _dry: true }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

const hasLegacy = g => !!(g && (g.orgEn || g.orgZh || g.orgCountry));
const sameOrg = (a, b) => (a.orgEn || '') === (b.orgEn || '') && (a.orgZh || '') === (b.orgZh || '') && (a.orgCountry || '') === (b.orgCountry || '');

(async () => {
  const allFields = (await req('GET', '/fields')).data || [];
  // 目標 collection：guests repeater 同時有 orgs（巢狀）與 top-level orgCountry
  const COLLS = allFields.filter(f => f.field === 'guests'
    && Array.isArray(f.meta?.options?.fields)
    && f.meta.options.fields.some(s => s.field === 'orgs')
    && f.meta.options.fields.some(s => s.field === 'orgCountry')
  ).map(f => f.collection);

  console.log(`【Phase 1｜資料遷移】${COLLS.length} collections`);
  let totItems = 0, totGuests = 0, sampleShown = 0;
  for (const col of COLLS) {
    const items = (await req('GET', `/items/${col}?limit=-1&fields=id,guests`)).data || [];
    for (const it of items) {
      if (!Array.isArray(it.guests) || !it.guests.length) continue;
      let changed = false, movedHere = 0;
      for (const g of it.guests) {
        if (!hasLegacy(g)) continue;
        const legacy = { orgEn: g.orgEn || '', orgZh: g.orgZh || '', orgCountry: g.orgCountry || '' };
        const orgs = Array.isArray(g.orgs) ? g.orgs.filter(Boolean) : [];
        if (!orgs.some(o => sameOrg(o, legacy))) orgs.unshift(legacy);  // prepend legacy 成 orgs[0]（未重複才加）
        g.orgs = orgs;
        delete g.orgEn; delete g.orgZh; delete g.orgCountry;   // legacy 清掉（值已複製進 orgs）
        changed = true; movedHere++;
      }
      if (changed) {
        totItems++; totGuests += movedHere;
        if (sampleShown < 3) { console.log(`  e.g. ${col}/${it.id}: 移 ${movedHere} 個 guest 的 org → 首筆 orgs=${JSON.stringify(it.guests.find(g => g.orgs?.length)?.orgs?.[0])}`); sampleShown++; }
        await req('PATCH', `/items/${col}/${it.id}`, { guests: it.guests });
      }
    }
  }
  console.log(`  ${DRY ? '[dry] 會' : '已'}更新 ${totItems} 個 item、${totGuests} 個 guest 的 org 併入 orgs。`);

  console.log(`\n【Phase 2｜schema 移除 top-level orgEn/orgZh/orgCountry】`);
  const LEGACY = new Set(['orgEn', 'orgZh', 'orgCountry']);
  for (const col of COLLS) {
    const f = allFields.find(x => x.collection === col && x.field === 'guests');
    const subs = f.meta.options.fields;
    const before = subs.length;
    f.meta.options.fields = subs.filter(s => !LEGACY.has(s.field));  // 只砍 top-level；orgs 內的同名子欄在 orgs.meta 裡、不受影響
    if (f.meta.options.fields.length === before) { console.log(`  ↷ ${col} 已無 top-level org 三欄，跳過`); continue; }
    await req('PATCH', `/fields/${col}/guests`, { meta: f.meta });
    console.log(`  ＋ ${col}.guests 移除 top-level orgEn/orgZh/orgCountry`);
  }

  console.log(DRY ? '\n[dry] 預覽，未寫入。' : '\n✅ 完成。前台硬重整即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
