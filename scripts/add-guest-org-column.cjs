// guests 鏡射欄 canonical（user 2026-09-10；本檔＝guests flow exec 與 aka/國家/單位回填的唯一事實來源，改這裡重跑）：
//   guestOrgText json 陣列 [{name:"中文 English"}]——orgs[] repeater 優先（filter 空列）→ legacy orgEn/orgZh/affiliation（同前台 guest-orgs.js）。
//   guestCountryText＝講者**本人**國家；orgCountryText＝**單位**國家（user 09-10：兩者分開各一欄）。
//   各欄多值收 N items；同步＝「guests→aka/國家欄同步」Flow exec V6。
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-guest-org-column.cjs --dry
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

const CMAP = {
  au: '澳洲 Australia', ca: '加拿大 Canada', ch: '瑞士 Switzerland', cn: '中國 China', de: '德國 Germany',
  fr: '法國 France', gb: '英國 UK', uk: '英國 UK', hk: '香港 Hong Kong', it: '義大利 Italy', jp: '日本 Japan',
  kr: '韓國 South Korea', mo: '澳門 Macau', my: '馬來西亞 Malaysia', nl: '荷蘭 Netherlands', se: '瑞典 Sweden',
  sg: '新加坡 Singapore', th: '泰國 Thailand', tw: '台灣 Taiwan', us: '美國 USA',
};

// guest-orgs.js 同邏輯（backfill 用；含 country）
const orgsOf = g => {
  if (g && Array.isArray(g.orgs) && g.orgs.length) {
    const orgs = g.orgs.filter(Boolean)
      .map(o => ({ en: o.orgEn || o.en || '', zh: o.orgZh || o.zh || '', country: o.orgCountry || o.country || '' }))
      .filter(o => o.en || o.zh || o.country);
    if (orgs.length) return orgs;
  }
  const en = (g && (g.orgEn || g.affiliation)) || '';
  const zh = (g && (g.orgZh || g.affiliation_zh)) || '';
  const country = (g && g.orgCountry) || '';
  return (en || zh || country) ? [{ en, zh, country }] : [];
};
const orgListOf = gs => {
  const seen = new Set(); const out = [];
  (Array.isArray(gs) ? gs : []).forEach(g => orgsOf(g).forEach(o => {
    const name = [o.zh, o.en].filter(Boolean).join(' ');
    if (!name || seen.has(name)) return;
    seen.add(name); out.push({ name });
  }));
  return out.length ? out : null;
};
// 本人國家與單位國家分開聚合（user 09-10 拆兩欄）；uk→gb 等別名靠 CMAP
const collectCountries = codes => {
  const seen = new Set(); const out = [];
  codes.forEach(c => {
    c = (c || '').trim().toLowerCase();
    if (!c || seen.has(c)) return;
    seen.add(c); out.push({ name: CMAP[c] || c.toUpperCase() });
  });
  return out.length ? out : null;
};
const countryListOf = gs => collectCountries((Array.isArray(gs) ? gs : []).map(g => g?.country));
const orgCountryListOf = gs => collectCountries((Array.isArray(gs) ? gs : []).flatMap(g => orgsOf(g).map(o => o.country)));

const GUESTS_EXEC_V6 = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); var arr = Array.isArray(p.guests) ? p.guests : []; var aka = arr.map(function(g){ return g ? [g.akaZh, g.akaEn].filter(Boolean).join(" ") : ""; }).filter(Boolean).join(", "); var MAP = ' + JSON.stringify(CMAP) + '; function orgsOf(g){ if (g && Array.isArray(g.orgs) && g.orgs.length) { var os = g.orgs.filter(Boolean).map(function(o){ return { en: o.orgEn || o.en || "", zh: o.orgZh || o.zh || "", country: o.orgCountry || o.country || "" }; }).filter(function(o){ return o.en || o.zh || o.country; }); if (os.length) return os; } var en = (g && (g.orgEn || g.affiliation)) || ""; var zh = (g && (g.orgZh || g.affiliation_zh)) || ""; var country = (g && g.orgCountry) || ""; return (en || zh || country) ? [{ en: en, zh: zh, country: country }] : []; } function collect(codes){ var seen = {}; var out = []; codes.forEach(function(c){ c = (c ? String(c) : "").trim().toLowerCase(); if (!c || seen[c]) return; seen[c] = 1; out.push({ name: MAP[c] || c.toUpperCase() }); }); return out.length ? out : null; } var pc = []; var oc = []; var oseen = {}; var oo = []; arr.forEach(function(g){ pc.push(g && g.country); orgsOf(g).forEach(function(o){ oc.push(o.country); var name = [o.zh, o.en].filter(Boolean).join(" "); if (!name || oseen[name]) return; oseen[name] = 1; oo.push({ name: name }); }); }); return { key: key, akaText: aka, guestCountryText: collect(pc), orgCountryText: collect(oc), guestOrgText: oo.length ? oo : null }; };';

const ORG_COUNTRY_FIELD = {
  field: 'orgCountryText', type: 'json',
  meta: { interface: 'input-code', readonly: true, width: 'half',
          display: 'formatted-json-value', display_options: { format: '{{ name }}' },
          note: '單位國家中英名（自動由 guests 產生；多國收 N items，勿手改）' },
  schema: {},
};
const ORG_FIELD = {
  field: 'guestOrgText', type: 'json',
  meta: { interface: 'input-code', readonly: true, width: 'half',
          display: 'formatted-json-value', display_options: { format: '{{ name }}' },
          note: '講者單位中英（自動由 guests 產生；多單位收 N items，勿手改）' },
  schema: {},
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const byCol = {};
  for (const f of all) (byCol[f.collection] ||= new Map()).set(f.field, f);
  const cols = Object.keys(byCol).filter(c => byCol[c].has('guestCountryText')).sort();   // 與國家欄同一組（全 guests 表）
  console.log('目標：', cols.join(', '));

  for (const col of cols) {
    for (const def of [ORG_FIELD, ORG_COUNTRY_FIELD]) {
      if (byCol[col].has(def.field)) continue;
      await req('POST', `/fields/${col}`, def);
      if (!DRY) {
        let ok = false;
        for (let i = 0; i < 5 && !ok; i++) { await new Promise(r => setTimeout(r, 700)); ok = !!(await req('GET', `/fields/${col}/${def.field}`).catch(() => null))?.data?.field; }
        if (!ok) throw new Error(`${col}.${def.field} 建欄驗證失敗，中止`);
      }
      console.log(`＋ ${col}.${def.field}`);
    }
  }

  const flows = (await req('GET', '/flows?fields=id,name,operations.id,operations.type')).data || [];
  const gFlow = flows.find(f => /guests→aka/.test(f.name));
  if (!gFlow) throw new Error('找不到 guests aka flow');
  const gExec = gFlow.operations.find(o => o.type === 'exec');
  const gWrite = gFlow.operations.find(o => o.type === 'item-update');
  await req('PATCH', `/operations/${gExec.id}`, { options: { code: GUESTS_EXEC_V6 } });
  await req('PATCH', `/operations/${gWrite.id}`, { options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}',
    payload: { akaText: '{{extract.akaText}}', guestCountryText: '{{extract.guestCountryText}}', orgCountryText: '{{extract.orgCountryText}}', guestOrgText: '{{extract.guestOrgText}}' },
    emitEvents: false, permissions: '$full' } });
  console.log('✓ guests flow → V6（本人國家/單位國家分欄）');

  for (const col of cols) {
    const flds = ['id','guests','guestCountryText', byCol[col].has('guestOrgText') && 'guestOrgText', byCol[col].has('orgCountryText') && 'orgCountryText'].filter(Boolean).join(',');
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=${flds}`)).data || [];
    let set = 0;
    for (const it of rows) {
      const diff = {};
      const want = { guestOrgText: orgListOf(it.guests), guestCountryText: countryListOf(it.guests), orgCountryText: orgCountryListOf(it.guests) };
      for (const [k, v] of Object.entries(want)) if (JSON.stringify(it[k] ?? null) !== JSON.stringify(v)) diff[k] = v;
      if (Object.keys(diff).length) { await req('PATCH', `/items/${col}/${it.id}`, diff); set++; }
    }
    console.log(`  ${col}：回填 ${set}/${rows.length}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。把 guestOrgText 勾進清單即可。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
