// 給 library_awards 的 organizers repeater 子欄加一個「國家」下拉（每個主辦方各自帶國家）。
// 選項 clone 自既有 top-level country 欄的 choices（ISO code）。前台渲染成「主辦方（國家）」。
// idempotent（已有 country 子欄就跳過）；--dry 只印不寫。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-awards-organizer-country.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'library_awards';
const DRY = process.argv.includes('--dry');
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

(async () => {
  // 1) 取現成 country 下拉的 choices（ISO code）
  const cf = await (await fetch(`${BASE}/fields/${COL}/country`, { headers: H })).json();
  const choices = cf.data?.meta?.options?.choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error('讀不到 country 欄的 choices，無法 clone');

  // 2) 取 organizers repeater 現況
  const of = await (await fetch(`${BASE}/fields/${COL}/organizers`, { headers: H })).json();
  const meta = of.data?.meta;
  if (!meta || meta.interface !== 'list') throw new Error('organizers 不是 repeater(list interface)，中止');
  const sub = (meta.options && meta.options.fields) || [];

  if (sub.some(f => f.field === 'country')) {
    console.log('✅ organizers 已有 country 子欄，跳過（idempotent）');
    return;
  }

  // 3) 追加 country 子欄（half width、可留空、選項＝country choices）
  const newSub = [...sub, {
    field: 'country',
    name: '國家',
    type: 'string',
    meta: {
      field: 'country',
      type: 'string',
      interface: 'select-dropdown',
      width: 'half',
      options: { choices, allowNone: true },
    },
  }];
  const body = { meta: { ...meta, options: { ...meta.options, fields: newSub } } };

  if (DRY) {
    console.log('[dry] 將 PATCH', `/fields/${COL}/organizers`, '→ 子欄:', newSub.map(f => f.field).join(', '));
    console.log('[dry] country 選項數:', choices.length, '例:', choices.slice(0, 3).map(c => c.value).join('/'));
    return;
  }
  const res = await fetch(`${BASE}/fields/${COL}/organizers`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  console.log(res.ok ? '✅ organizers 已加 country 子欄（每個主辦方可選國家）' : `❌ ${res.status} ${(await res.text()).slice(0, 400)}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
