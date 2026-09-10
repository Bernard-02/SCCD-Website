// guestCountryText 改 N items（user 2026-09-10）：text 欄（恆為串接字串）→ json 陣列欄
//   值＝[{name:"台灣 Taiwan"}, ...]＋display formatted-json-value {{ name }} → 1 國 inline、2 國以上收「N items」點開。
//   欄名不變（清單已勾的欄位免重選）。順序：先改 flow exec（吐陣列）→ 刪文字欄 → 建 json 欄 → 回填。
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/guest-countries-nitems.cjs --dry
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

// 國碼 → 中英名（單一事實來源＝本檔＋flow exec 內嵌同 map；補新代碼改這裡重跑）
const CMAP = {
  au: '澳洲 Australia', ca: '加拿大 Canada', ch: '瑞士 Switzerland', cn: '中國 China', de: '德國 Germany',
  fr: '法國 France', gb: '英國 UK', uk: '英國 UK', hk: '香港 Hong Kong', it: '義大利 Italy', jp: '日本 Japan',
  kr: '韓國 South Korea', mo: '澳門 Macau', my: '馬來西亞 Malaysia', nl: '荷蘭 Netherlands', se: '瑞典 Sweden',
  sg: '新加坡 Singapore', th: '泰國 Thailand', tw: '台灣 Taiwan', us: '美國 USA',
};
const countriesOf = gs => {
  const seen = new Set(); const out = [];
  (Array.isArray(gs) ? gs : []).forEach(g => {
    const c = (g?.country || '').trim().toLowerCase();
    if (!c || seen.has(c)) return;
    seen.add(c); out.push({ name: CMAP[c] || c.toUpperCase() });
  });
  return out.length ? out : null;   // 空＝null（display 顯空白，不留 [] 殘值）
};
const GUESTS_EXEC_V3 = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); var arr = Array.isArray(p.guests) ? p.guests : []; var aka = arr.map(function(g){ return g ? [g.akaZh, g.akaEn].filter(Boolean).join(" ") : ""; }).filter(Boolean).join(", "); var MAP = ' + JSON.stringify(CMAP) + '; var seen = {}; var cc = []; arr.forEach(function(g){ var c = (g && g.country ? String(g.country) : "").trim().toLowerCase(); if (!c || seen[c]) return; seen[c] = 1; cc.push({ name: MAP[c] || c.toUpperCase() }); }); return { key: key, akaText: aka, guestCountryText: cc.length ? cc : null }; };';

const JSON_FIELD = {
  field: 'guestCountryText', type: 'json',
  meta: { interface: 'input-code', readonly: true, width: 'half',
          display: 'formatted-json-value', display_options: { format: '{{ name }}' },
          note: '講者國家中英名（自動由 guests 產生；多國收 N items，勿手改）' },
  schema: {},
};

(async () => {
  const flows = (await req('GET', '/flows?fields=id,name,operations.id,operations.type')).data || [];
  const gFlow = flows.find(f => /guests→aka/.test(f.name));
  if (!gFlow) throw new Error('找不到 guests aka flow');
  const gExec = gFlow.operations.find(o => o.type === 'exec');
  await req('PATCH', `/operations/${gExec.id}`, { options: { code: GUESTS_EXEC_V3 } });
  console.log('✓ guests flow exec → 國家陣列版');

  const all = (await req('GET', '/fields')).data || [];
  const cols = [...new Set(all.filter(f => f.field === 'guestCountryText').map(f => f.collection))].sort();
  for (const col of cols) {
    const cur = all.find(f => f.collection === col && f.field === 'guestCountryText');
    if (cur.type === 'json') { console.log(`↷ ${col} 已是 json`); continue; }
    await req('DELETE', `/fields/${col}/guestCountryText`);
    await req('POST', `/fields/${col}`, JSON_FIELD);
    if (!DRY) {
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) { await new Promise(r => setTimeout(r, 700)); ok = (await req('GET', `/fields/${col}/guestCountryText`).catch(() => null))?.data?.type === 'json'; }
      if (!ok) throw new Error(`${col}.guestCountryText json 重建驗證失敗，中止`);
    }
    console.log(`↻ ${col}.guestCountryText → json`);
  }

  for (const col of cols) {
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=id,guests,guestCountryText`)).data || [];
    let set = 0;
    for (const it of rows) {
      const want = countriesOf(it.guests);
      if (JSON.stringify(it.guestCountryText ?? null) !== JSON.stringify(want)) {
        await req('PATCH', `/items/${col}/${it.id}`, { guestCountryText: want });
        set++;
      }
    }
    console.log(`  ${col}：回填 ${set}/${rows.length}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。多國的 item 會收「N items」點開看。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
