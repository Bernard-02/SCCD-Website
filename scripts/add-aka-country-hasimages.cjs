// 後台清單三欄（user 2026-09-10）：
//   1) akaText：guests 的 aka 單獨一欄、中英寫一起（「小王 Lil Wang, …」逐位逗號串）
//   2) guestCountryText：guests 的國家（country 代碼大寫、去重、逗號串，如「TW, JP」）
//   3) hasImages：images 有內容打 ✓、沒有空白
// 同步：1/2 掛「guests→aka/國家欄同步」Flow（condition→exec→item-update）；
//       3 掛「images→hasImages 同步」Flow（images 是關聯欄，payload 只有 diff → 多一步 item-read 讀存檔後實況再算）。
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-aka-country-hasimages.cjs --dry
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
async function ensureField(col, def, byCol) {
  if (byCol[col].has(def.field)) return;
  await req('POST', `/fields/${col}`, def);
  if (!DRY) {
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) { await new Promise(r => setTimeout(r, 700)); ok = !!(await req('GET', `/fields/${col}/${def.field}`).catch(() => null))?.data?.field; }
    if (!ok) throw new Error(`${col}.${def.field} 建欄後驗證不到，中止`);
  }
  console.log(`＋ ${col}.${def.field}`);
}
const tf = (field, note) => ({ field, type: 'text', meta: { interface: 'input', readonly: true, width: 'half', note }, schema: {} });

// 組字（flow exec 為同邏輯 ES5 版）
const akaOf = gs => (Array.isArray(gs) ? gs : []).map(g => g ? [g.akaZh, g.akaEn].filter(Boolean).join(' ') : '').filter(Boolean).join(', ');
const countryOf = gs => [...new Set((Array.isArray(gs) ? gs : []).map(g => (g?.country || '').trim().toUpperCase()).filter(Boolean))].join(', ');

const GUESTS_EXEC = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); var arr = Array.isArray(p.guests) ? p.guests : []; var aka = arr.map(function(g){ return g ? [g.akaZh, g.akaEn].filter(Boolean).join(" ") : ""; }).filter(Boolean).join(", "); var seen = {}; var cc = []; arr.forEach(function(g){ var c = (g && g.country ? String(g.country) : "").trim().toUpperCase(); if (c && !seen[c]) { seen[c] = 1; cc.push(c); } }); return { key: key, akaText: aka, guestCountryText: cc.join(", ") }; };';
const IMAGES_CALC = 'module.exports = function(data){ var r = data.read; if (Array.isArray(r)) r = r[0]; var imgs = r ? r.images : null; return { hasImages: (Array.isArray(imgs) && imgs.length) ? "\\u2713" : "" }; };';
const KEY_EXEC = 'module.exports = function(data){ var t = data["$trigger"] || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); return { key: key }; };';

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const byCol = {};
  for (const f of all) (byCol[f.collection] ||= new Map()).set(f.field, f);
  const isTarget = c => /^activities_|^admission_summer_camp$/.test(c);
  const subsOf = c => (byCol[c].get('guests')?.meta?.options?.fields || []).map(s => s.field);
  const guestCols = Object.keys(byCol).filter(c => isTarget(c) && byCol[c].get('guests')?.meta?.interface === 'list' && subsOf(c).includes('nameZh')).sort();
  const akaCols = guestCols.filter(c => subsOf(c).some(s => s === 'akaZh' || s === 'akaEn'));
  const ccCols = guestCols.filter(c => subsOf(c).includes('country'));
  const imgCols = Object.keys(byCol).filter(c => isTarget(c) && byCol[c].get('images')?.type === 'alias').sort();
  console.log('aka 表：', akaCols.join(', '));
  console.log('國家 表：', ccCols.join(', '));
  console.log('images 表：', imgCols.join(', '));

  // ── 建欄 ──
  // aka/國家兩欄建在「全部」guests 表（flow payload 固定兩鍵，缺欄的表寫入會炸；沒對應子欄的表恆空無妨）
  for (const col of guestCols) {
    await ensureField(col, tf('akaText', '講者別名 aka 中英（自動由 guests 產生，勿手改）'), byCol);
    await ensureField(col, tf('guestCountryText', '講者國家代碼（自動由 guests 產生，勿手改）'), byCol);
  }
  for (const col of imgCols) await ensureField(col, tf('hasImages', '有無圖片（✓＝images 有內容；自動產生，勿手改）'), byCol);

  const flows = (await req('GET', '/flows?fields=id,name')).data || [];

  // ── guests flow ──
  if (flows.some(f => /guests→aka/.test(f.name))) console.log('↷ guests aka flow 已存在');
  else if (DRY) console.log(`[dry] 建 Flow「guests→aka/國家欄同步」scope：${guestCols.join(', ')}`);
  else {
    const flow = (await req('POST', '/flows', { name: 'guests→aka/國家欄同步', icon: 'sync', status: 'active', trigger: 'event', accountability: 'all',
      options: { type: 'action', scope: ['items.create', 'items.update'], collections: guestCols } })).data;
    const w = (await req('POST', '/operations', { flow: flow.id, name: '寫入 aka/國家', key: 'write_text', type: 'item-update', position_x: 37, position_y: 1,
      options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}', payload: { akaText: '{{extract.akaText}}', guestCountryText: '{{extract.guestCountryText}}' }, emitEvents: false, permissions: '$full' } })).data;
    const x = (await req('POST', '/operations', { flow: flow.id, name: '算 aka/國家', key: 'extract', type: 'exec', position_x: 19, position_y: 1,
      options: { code: GUESTS_EXEC }, resolve: w.id })).data;
    const c = (await req('POST', '/operations', { flow: flow.id, name: 'guests 有變更才跑', key: 'has_src', type: 'condition', position_x: 1, position_y: 1,
      options: { filter: { $trigger: { payload: { guests: { _nnull: true } } } } }, resolve: x.id })).data;
    await req('PATCH', `/flows/${flow.id}`, { operation: c.id });
    console.log('✓ guests aka flow 建立');
  }
  // ── images flow（condition→取key→item-read→算→寫）──
  if (flows.some(f => /images→hasImages/.test(f.name))) console.log('↷ images flow 已存在');
  else if (DRY) console.log(`[dry] 建 Flow「images→hasImages 同步」scope：${imgCols.join(', ')}`);
  else {
    const flow = (await req('POST', '/flows', { name: 'images→hasImages 同步', icon: 'sync', status: 'active', trigger: 'event', accountability: 'all',
      options: { type: 'action', scope: ['items.create', 'items.update'], collections: imgCols } })).data;
    const w = (await req('POST', '/operations', { flow: flow.id, name: '寫入 hasImages', key: 'write_text', type: 'item-update', position_x: 55, position_y: 1,
      options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}', payload: { hasImages: '{{calc.hasImages}}' }, emitEvents: false, permissions: '$full' } })).data;
    const calc = (await req('POST', '/operations', { flow: flow.id, name: '算 hasImages', key: 'calc', type: 'exec', position_x: 37, position_y: 1,
      options: { code: IMAGES_CALC }, resolve: w.id })).data;
    const rd = (await req('POST', '/operations', { flow: flow.id, name: '讀存檔後 images', key: 'read', type: 'item-read', position_x: 19, position_y: 1,
      options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}', query: { fields: ['images'] }, permissions: '$full' }, resolve: calc.id })).data;
    const x = (await req('POST', '/operations', { flow: flow.id, name: '取 key', key: 'extract', type: 'exec', position_x: 10, position_y: 8,
      options: { code: KEY_EXEC }, resolve: rd.id })).data;
    const c = (await req('POST', '/operations', { flow: flow.id, name: 'images 有變更才跑', key: 'has_src', type: 'condition', position_x: 1, position_y: 1,
      options: { filter: { $trigger: { payload: { images: { _nnull: true } } } } }, resolve: x.id })).data;
    await req('PATCH', `/flows/${flow.id}`, { operation: c.id });
    console.log('✓ images flow 建立');
  }

  // ── 回填 ──
  for (const col of guestCols) {
    const hasA = byCol[col].has('akaText'), hasC = byCol[col].has('guestCountryText');
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=id,guests${hasA ? ',akaText' : ''}${hasC ? ',guestCountryText' : ''}`)).data || [];
    let set = 0;
    for (const it of rows) {
      const diff = {};
      const a = akaOf(it.guests), cc = countryOf(it.guests);
      if ((it.akaText || '') !== a) diff.akaText = a;
      if ((it.guestCountryText || '') !== cc) diff.guestCountryText = cc;
      if (Object.keys(diff).length) { await req('PATCH', `/items/${col}/${it.id}`, diff); set++; }
    }
    console.log(`  ${col}：aka/國家回填 ${set}/${rows.length}`);
  }
  for (const col of imgCols) {
    const hasF = byCol[col].has('hasImages');
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=id,images${hasF ? ',hasImages' : ''}`)).data || [];
    let set = 0;
    for (const it of rows) {
      const want = (Array.isArray(it.images) && it.images.length) ? '✓' : '';
      if ((it.hasImages || '') !== want) { await req('PATCH', `/items/${col}/${it.id}`, { hasImages: want }); set++; }
    }
    console.log(`  ${col}：hasImages 回填 ${set}/${rows.length}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台硬重整後把 akaText／guestCountryText／hasImages 勾進清單。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
