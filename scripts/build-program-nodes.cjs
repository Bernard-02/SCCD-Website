// 建立 about Programs 學制樹的後台 collection `program_nodes`（2026-09-08，user 指定）。
// 樹狀層級靠「自我參照 parent（M2O → program_nodes）」表達；文字不重複存、只存 labelKey 指向 ui_labels
// （tree 文字與 ui_labels 完全重複，見 memory project_about_programs_structure_tree）。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-program-nodes.cjs [--dry]
// 前置：需先跑 setup-ui-labels.cjs 灌入 about.program.dcd / about.program.bpaidc 兩 key（data/ui-labels.json 已加）。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'program_nodes';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 220) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 400)}`);
  return out;
}

(async () => {
  // 1) collection（不存在才建）
  const exists = await req('GET', `/collections/${COL}`).then(() => true).catch(() => false);
  if (exists) {
    console.log(`✓ collection ${COL} 已存在，略過建立`);
  } else {
    console.log(`建立 collection ${COL}...`);
    await req('POST', '/collections', {
      collection: COL,
      meta: {
        translations: zh('學制樹 Program Nodes'),
        note: 'about Programs 學制樹：一筆＝一個節點；parent 指母節點（空＝root）。文字走 labelKey 對應 ui_labels。',
        sort_field: 'sort', collapse: 'open', accountability: 'all', archive_app_filter: true,
      },
      schema: {},
      fields: [
        { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
      ],
    });
  }

  // 2) 欄位（已存在的 POST 會 400 → 容錯略過，維持冪等）
  const fields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'parent', type: 'uuid', meta: { interface: 'select-dropdown-m2o', sort: 3, width: 'half', special: ['m2o'], translations: zh('母節點（空＝root）'), note: '指向這個節點的上層；DCD / BPAIDC 留空＝頂層', options: { template: '{{ labelKey }}' } }, schema: {} },
    { field: 'labelKey', type: 'string', meta: { interface: 'input', sort: 4, width: 'half', required: true, translations: zh('文字來源 ui_labels key'), note: '如 about.program.animation；文字在 ui_labels 改、這裡只對位' } },
    { field: 'divisionKey', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', translations: zh('點擊指向 division（可空）'), note: 'animation / creative-media / mdes；空＝不可點' } },
    { field: 'wordmark', type: 'string', meta: { interface: 'select-dropdown', sort: 6, width: 'half', translations: zh('頂層標準字塊（可空）'), options: { allowNone: true, choices: [{ text: 'SCCD', value: 'sccd' }, { text: 'SCAIDC', value: 'scaidc' }] } } },
  ];
  for (const f of fields) {
    console.log(`  欄位 ${f.field}...`);
    await req('POST', `/fields/${COL}`, f).catch(e => console.log(`    （略過：${e.message.slice(0, 100)}）`));
  }

  // 3) 自我參照 relation（parent → program_nodes）；已存在則略過。one_field=children＝O2M 反向 alias（樹）
  const rel = DRY ? { data: [] } : await req('GET', `/relations/${COL}`).catch(() => ({ data: [] }));
  if (!(rel.data || []).some(r => r.field === 'parent')) {
    console.log('補建 parent 自我參照 relation...');
    await req('POST', '/relations', {
      collection: COL, field: 'parent', related_collection: COL,
      meta: { one_field: 'children', sort_field: 'sort', one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    });
  }

  // 4) Public read（沒開＝前台 401）
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) console.log('⚠️ 找不到 Public policy，請後台手動開 program_nodes 讀權限');
  else {
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${COL}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log('✓ Public read 已開');
    else { console.log('開 Public read...'); await req('POST', '/permissions', { policy: pub.id, collection: COL, action: 'read', fields: ['*'] }); }
  }

  // 5) seed 6 筆（冪等：依 labelKey 查現有；roots 先建拿 id，再建子）
  const cur = DRY ? { data: [] } : await req('GET', `/items/${COL}?limit=-1&fields=id,labelKey`);
  const idByKey = Object.fromEntries((cur.data || []).map(r => [r.labelKey, r.id]));
  async function upsertNode(n) {
    if (idByKey[n.labelKey]) { console.log(`  節點 ${n.labelKey} 已存在，略過`); return idByKey[n.labelKey]; }
    console.log(`  建節點 ${n.labelKey}${n.parent ? ` (parent=${n.parent})` : ''}...`);
    const r = await req('POST', `/items/${COL}`, n);
    const id = r.data?.id || `dry-${n.labelKey}`;
    idByKey[n.labelKey] = id;
    return id;
  }
  const dcd = await upsertNode({ sort: 1, labelKey: 'about.program.dcd', divisionKey: 'animation', wordmark: 'sccd', parent: null });
  await upsertNode({ sort: 2, labelKey: 'about.program.bpaidc', divisionKey: null, wordmark: 'scaidc', parent: null });
  const bfa = await upsertNode({ sort: 1, labelKey: 'about.group.bfa', divisionKey: 'animation', parent: dcd });
  await upsertNode({ sort: 2, labelKey: 'about.program.mdes', divisionKey: 'mdes', parent: dcd });
  await upsertNode({ sort: 1, labelKey: 'about.program.animation', divisionKey: 'animation', parent: bfa });
  await upsertNode({ sort: 2, labelKey: 'about.program.creative-media', divisionKey: 'creative-media', parent: bfa });

  console.log(`\n✅ ${COL} 建置完成${DRY ? '（DRY，未寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
