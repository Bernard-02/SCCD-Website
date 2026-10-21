// 學制樹 Term／Degree 改成「後台兩張設定表＋班級下拉選」（user 2026-10-21）：
//  - 新表 program_terms（期程）／program_degrees（學位）：英／中各一欄，拖曳排序＝前台 Term／Degree 說明卡的上下順序。
//  - program_nodes 加 term／degree 兩個下拉（M2O），班級（學士班／碩士班…）各自選；舊文字欄 termEn/termZh/degreeEn/degreeZh 隱藏（資料保留、可逆）。
//  - 遷移：舊「有填學位名」的節點（bfa/mdes）→ 依文字找或建對應項目並掛上；animation/cm 殘留的 term 文字不搬（前台本來就不讀）。
// 跑（repo 根目錄）：node scripts/program-terms-degrees.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 160) : ''); return { data: { id: `dry-${Math.random().toString(36).slice(2, 6)}` } }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}
const exists = (path) => req('GET', path).then(() => true, () => false);

const TABLES = [
  { col: 'program_terms', label: '期程 Term', what: '期程', egEn: '4 Years', egZh: '4 年', nodeField: 'term', en: 'termEn', zh: 'termZh' },
  { col: 'program_degrees', label: '學位 Degree', what: '學位', egEn: 'Bachelor of Fine Arts (B.F.A.)', egZh: '設計學士', nodeField: 'degree', en: 'degreeEn', zh: 'degreeZh' },
];

(async () => {
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access');
  const pub = (pols.data || []).find((p) => p.name === '$t:public_label') || (pols.data || []).find((p) => !p.admin_access && !p.app_access);
  if (!pub) throw new Error('找不到 Public policy');

  // 1) 兩張設定表（不存在才建）＋Public read
  for (const t of TABLES) {
    if (await exists(`/collections/${t.col}`)) { console.log(`✓ ${t.col} 已存在`); continue; }
    console.log(`建立 ${t.col}...`);
    await req('POST', '/collections', {
      collection: t.col,
      meta: {
        translations: zh(t.label), group: 'about_folder', sort_field: 'sort', accountability: 'all', archive_app_filter: true,
        display_template: '{{ nameEn }} {{ nameZh }}',
        note: `學制樹右下「${t.label}」說明卡的列表：拖曳排序＝前台上下順序；沒有被任何班級選到的不顯示。`,
      },
      schema: {},
      fields: [
        { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
        { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true } },
        { field: 'nameEn', type: 'string', meta: { interface: 'input', width: 'half', required: true, translations: zh(`${t.what}（英）`), note: `如 ${t.egEn}` } },
        { field: 'nameZh', type: 'string', meta: { interface: 'input', width: 'half', translations: zh(`${t.what}（中）`), note: `如 ${t.egZh}` } },
      ],
    });
    await req('POST', '/permissions', { policy: pub.id, collection: t.col, action: 'read', fields: ['*'] });
  }

  // 2) program_nodes 加 term / degree 下拉（M2O）
  for (const [i, t] of TABLES.entries()) {
    if (await exists(`/fields/program_nodes/${t.nodeField}`)) { console.log(`✓ program_nodes.${t.nodeField} 已存在`); continue; }
    console.log(`加 program_nodes.${t.nodeField}...`);
    await req('POST', '/fields/program_nodes', {
      field: t.nodeField, type: 'uuid', schema: {},
      meta: {
        interface: 'select-dropdown-m2o', special: ['m2o'], sort: 6 + i, width: 'half',
        translations: zh(t.what), note: `這個班級的${t.what}；選項的新增／改字／排序在左側 about 資料夾的「${t.label}」表。空＝不顯示`,
        options: { template: '{{ nameEn }} {{ nameZh }}' }, display: 'related-values', display_options: { template: '{{ nameEn }} {{ nameZh }}' },
      },
    });
    await req('POST', '/relations', { collection: 'program_nodes', field: t.nodeField, related_collection: t.col, schema: { on_delete: 'SET NULL' } });
  }

  // 3) 遷移：有填學位名的節點 → 依文字找或建項目、掛上（已有選值的不動）
  const nodes = (await req('GET', '/items/program_nodes?limit=-1&sort=sort&fields=id,parent,sort,nameZh,termEn,termZh,degreeEn,degreeZh' + (DRY ? '' : ',term,degree'))).data || [];
  const byParent = (pid) => nodes.filter((n) => (n.parent || null) === pid).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const ordered = [];
  const walk = (pid) => byParent(pid).forEach((n) => { ordered.push(n); walk(n.id); });
  walk(null);
  for (const t of TABLES) {
    const items = DRY ? [] : ((await req('GET', `/items/${t.col}?limit=-1&fields=id,nameEn,nameZh,sort`)).data || []);
    for (const n of ordered.filter((x) => x.degreeEn || x.degreeZh)) {
      if (n[t.nodeField] || !(n[t.en] || n[t.zh])) continue;
      let it = items.find((x) => x.nameEn === (n[t.en] || '') && (x.nameZh || '') === (n[t.zh] || ''));
      if (!it) {
        console.log(`  ${t.col} 新增 ${n[t.en]} / ${n[t.zh]}`);
        it = (await req('POST', `/items/${t.col}`, { nameEn: n[t.en] || '', nameZh: n[t.zh] || '', sort: items.length + 1 })).data;
        items.push(it);
      }
      console.log(`  ${n.nameZh}.${t.nodeField} → ${it.nameEn}`);
      await req('PATCH', `/items/program_nodes/${n.id}`, { [t.nodeField]: it.id });
    }
  }

  // 4) 舊文字欄隱藏（資料保留）
  for (const f of ['termEn', 'termZh', 'degreeEn', 'degreeZh']) await req('PATCH', `/fields/program_nodes/${f}`, { meta: { hidden: true } });
  console.log(`✅ 完成${DRY ? '（DRY，未寫入）' : ''}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
