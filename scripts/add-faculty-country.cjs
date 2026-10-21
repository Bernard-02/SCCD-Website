// 給 faculty 加頂層「國家」下拉（老師本人的國家；World/atlas 頁名字後以（國家）顯示，user 2026-10-21）。
// 選項 clone 自 occupations repeater 的 country 子欄（ISO 小寫，同全站）；排在別名（中）後面。
// idempotent（已有 country 欄就只補排序）；--dry 只印不寫。
// 跑：node scripts/add-faculty-country.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'faculty';
const AFTER = 'akaZh';
const DRY = process.argv.includes('--dry');
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

(async () => {
  const fields = (await (await fetch(`${BASE}/fields/${COL}`, { headers: H })).json()).data;
  if (!Array.isArray(fields)) throw new Error('讀不到 faculty 欄位');
  const occ = fields.find(f => f.field === 'occupations');
  const choices = occ?.meta?.options?.fields?.find(s => s.field === 'country')?.meta?.options?.choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error('讀不到 occupations.country 的 choices，無法 clone');
  const after = fields.find(f => f.field === AFTER);
  if (!after) throw new Error(`找不到 ${AFTER} 欄`);
  const pos = after.meta.sort + 1;

  const exists = fields.some(f => f.field === 'country');
  const body = {
    field: 'country',
    type: 'string',
    schema: { is_nullable: true },
    meta: {
      interface: 'select-dropdown',
      options: { choices, allowNone: true },
      display: 'formatted-value',
      width: 'half',
      sort: pos,
      note: '老師本人的國家：World 頁 hover 卡與清單在名字後面以（國家）顯示；留空＝不顯示',
      translations: [{ language: 'zh-TW', translation: '國家' }, { language: 'en-US', translation: 'Country' }],
    },
  };
  // 後面的欄位往後挪一格，新欄才排得進別名後面
  const bump = fields
    .filter(f => f.field !== 'country' && (f.meta?.sort ?? 0) >= pos)
    .map(f => ({ field: f.field, meta: { sort: f.meta.sort + 1 } }));

  if (DRY) {
    console.log(exists ? '[dry] country 欄已存在 → 只會重排' : `[dry] 將新增 ${COL}.country（sort ${pos}，選項 ${choices.length} 個，例 ${choices[0].value}）`);
    console.log('[dry] 往後挪:', bump.map(b => `${b.field}→${b.meta.sort}`).join(', '));
    return;
  }
  if (!exists) {
    const r = await fetch(`${BASE}/fields/${COL}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`新增失敗 ${r.status} ${(await r.text()).slice(0, 400)}`);
    console.log('✅ 已新增 faculty.country');
  } else console.log('✅ faculty.country 已存在（idempotent）');
  if (bump.length && !(exists && fields.find(f => f.field === 'country').meta.sort === pos)) {
    const r = await fetch(`${BASE}/fields/${COL}`, { method: 'PATCH', headers: H, body: JSON.stringify(bump) });
    if (!r.ok) throw new Error(`排序失敗 ${r.status} ${(await r.text()).slice(0, 400)}`);
    console.log('✅ 已重排：國家排在別名（中）後面');
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
