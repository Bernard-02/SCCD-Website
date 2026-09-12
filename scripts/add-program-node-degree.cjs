// program_nodes 加「學位 degreeEn/degreeZh」＝Degree 說明卡的學位名改吃後台（老師可編，同 termEn/termZh 手法）。
// 原本 degree 名硬編在 about.html；改成掛在 degree 節點（bfa/mdes/bpaidc）、前台 render（見 about-structure.js buildLegendBars）。
// bdes（Bachelor of Design）掛在 bpaidc 節點（DEGREE_BY_LABELKEY: about.program.bpaidc → bdes）。
// 跑（repo 根目錄，需 scripts/.directus-token）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-program-node-degree.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'program_nodes';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// 學位名 seed（依 labelKey；= about.html 原硬編值）
const DEGREE = {
  'about.group.bfa':      { en: 'Bachelor of Fine Arts (B.F.A.)', zh: '設計學士' },
  'about.program.mdes':   { en: 'Master of Design (M.Des.)',      zh: '設計碩士' },
  'about.program.bpaidc': { en: 'Bachelor of Design (B.Des.)',    zh: '設計學士' },
};

(async () => {
  // 1) 加兩個字串欄（已存在 POST 400 → 略過，維持冪等）
  const fields = [
    { field: 'degreeEn', type: 'string', meta: { interface: 'input', sort: 12, width: 'half', translations: zh('學位（英，可空）'), note: '如 Bachelor of Fine Arts (B.F.A.)；掛在 degree 節點（bfa/mdes/bpaidc），Degree 說明卡顯示' } },
    { field: 'degreeZh', type: 'string', meta: { interface: 'input', sort: 13, width: 'half', translations: zh('學位（中，可空）'), note: '如 設計學士／設計碩士' } },
  ];
  console.log('1) 加欄位 degreeEn/degreeZh...');
  for (const f of fields) await req('POST', `/fields/${COL}`, f).catch(e => console.log(`   （略過 ${f.field}：${e.message.slice(0, 80)}）`));

  // 2) 取節點 + 現值（欄未建則當空＝首跑）；冪等：degreeEn 已有值就不覆蓋
  const nodes = (await req('GET', `/items/${COL}?limit=-1&fields=id,labelKey`)).data || [];
  const vals = await req('GET', `/items/${COL}?limit=-1&fields=id,degreeEn`).then(r => r.data || []).catch(() => []);
  const valById = Object.fromEntries(vals.map(v => [v.id, v]));

  // 3) seed 學位名（只在 degreeEn 空時，不覆蓋日後手動編輯）
  console.log('\n2) seed 學位名 degreeEn/degreeZh（= about.html 原硬編，空才寫）...');
  for (const n of nodes) {
    const d = DEGREE[n.labelKey];
    if (!d) continue;
    if ((valById[n.id] || {}).degreeEn) { console.log(`   ${n.labelKey}：已有 degreeEn，略過`); continue; }
    console.log(`   ${n.labelKey} → degreeEn=${JSON.stringify(d.en)} degreeZh=${JSON.stringify(d.zh)}`);
    await req('PATCH', `/items/${COL}/${n.id}`, { degreeEn: d.en, degreeZh: d.zh });
  }

  console.log(`\n✅ 完成${DRY ? '（DRY，未寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
