// user 2026-09-10：①locationsText 用不到刪掉（locations json 欄 N items 已足）②guestCountryText 改渲染中英名「台灣 Taiwan」。
//   1) 「locations→locationsText 同步」Flow：payload 改只寫 cityText、改名 → 再刪 locationsText 欄（順序反了編輯地點會炸）
//   2) 「guests→aka/國家欄同步」Flow exec：country 代碼 → 中英名（未知代碼 fallback 大寫代碼）＋回填
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/drop-locationstext-country-names.cjs --dry
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

// 全站 guests 實際用到的 19 碼＋uk 別名；新代碼出現＝fallback 大寫代碼、之後補進來重跑
const CMAP = {
  au: '澳洲 Australia', ca: '加拿大 Canada', ch: '瑞士 Switzerland', cn: '中國 China', de: '德國 Germany',
  fr: '法國 France', gb: '英國 UK', uk: '英國 UK', hk: '香港 Hong Kong', it: '義大利 Italy', jp: '日本 Japan',
  kr: '韓國 South Korea', mo: '澳門 Macau', my: '馬來西亞 Malaysia', nl: '荷蘭 Netherlands', se: '瑞典 Sweden',
  sg: '新加坡 Singapore', th: '泰國 Thailand', tw: '台灣 Taiwan', us: '美國 USA',
};
const countryOf = gs => {
  const seen = new Set(); const out = [];
  (Array.isArray(gs) ? gs : []).forEach(g => {
    const c = (g?.country || '').trim().toLowerCase();
    if (!c || seen.has(c)) return;
    seen.add(c); out.push(CMAP[c] || c.toUpperCase());
  });
  return out.join(', ');
};
const GUESTS_EXEC_V2 = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); var arr = Array.isArray(p.guests) ? p.guests : []; var aka = arr.map(function(g){ return g ? [g.akaZh, g.akaEn].filter(Boolean).join(" ") : ""; }).filter(Boolean).join(", "); var MAP = ' + JSON.stringify(CMAP) + '; var seen = {}; var cc = []; arr.forEach(function(g){ var c = (g && g.country ? String(g.country) : "").trim().toLowerCase(); if (!c || seen[c]) return; seen[c] = 1; cc.push(MAP[c] || c.toUpperCase()); }); return { key: key, akaText: aka, guestCountryText: cc.join(", ") }; };';

(async () => {
  const flows = (await req('GET', '/flows?fields=id,name,operations.id,operations.type,operations.key')).data || [];

  // ── 1) locations flow 改只寫 cityText → 刪 locationsText 欄 ──
  const lFlow = flows.find(f => /locations→/.test(f.name));
  if (!lFlow) throw new Error('找不到 locations flow');
  const lWrite = lFlow.operations.find(o => o.type === 'item-update');
  await req('PATCH', `/operations/${lWrite.id}`, { options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}',
    payload: { cityText: '{{extract.cityText}}' }, emitEvents: false, permissions: '$full' } });
  await req('PATCH', `/flows/${lFlow.id}`, { name: 'locations→cityText 同步' });
  console.log('✓ locations flow → 只寫 cityText');

  const all = (await req('GET', '/fields')).data || [];
  for (const f of all.filter(f => f.field === 'locationsText' && /^activities_|^admission_summer_camp$/.test(f.collection))) {
    await req('DELETE', `/fields/${f.collection}/locationsText`);
    console.log(`－ ${f.collection}.locationsText`);
  }

  // ── 2) guests flow exec 換中英名版＋回填 ──
  const gFlow = flows.find(f => /guests→aka/.test(f.name));
  if (!gFlow) throw new Error('找不到 guests aka flow');
  const gExec = gFlow.operations.find(o => o.type === 'exec');
  await req('PATCH', `/operations/${gExec.id}`, { options: { code: GUESTS_EXEC_V2 } });
  console.log('✓ guests flow 國家 → 中英名');

  const byCol = {};
  for (const f of all) (byCol[f.collection] ||= new Set()).add(f.field);
  const cols = Object.keys(byCol).filter(c => byCol[c].has('guestCountryText')).sort();
  for (const col of cols) {
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=id,guests,guestCountryText`)).data || [];
    let set = 0;
    for (const it of rows) {
      const want = countryOf(it.guests);
      if ((it.guestCountryText || '') !== want) { await req('PATCH', `/items/${col}/${it.id}`, { guestCountryText: want }); set++; }
    }
    console.log(`  ${col}：國家回填 ${set}/${rows.length}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台硬重整生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
