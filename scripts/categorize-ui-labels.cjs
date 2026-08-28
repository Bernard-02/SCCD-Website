// 給 ui_labels 加一個「分類（category）」欄＋把每筆 row 標上所屬資料夾，方便後台分組瀏覽。
// category 純後台整理用，前台不吃（前台只認 key）→ 不進 data/ui-labels.json，重跑 setup 也不會清掉。
// 冪等，可重跑。跑：node scripts/categorize-ui-labels.cjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const api = async (p, o = {}) => { const r = await fetch(BASE + p, { ...o, headers: { ...H, ...(o.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { ok: r.ok, status: r.status, j }; };

// 資料夾清單（含之後才要填的空資料夾）
const CHOICES = [
  'header', 'about', 'about programs tree', 'about programs detail', 'about works',
  'curriculum programs', 'faculty programs', 'faculty types',
  'activities', 'activities exhibitions', 'activities visits', 'admissions',
  'library', 'atlas', 'atlas alumni', 'alumni',
];

// key → 資料夾
function catOf(k) {
  // 組別/BFA 已照頁面拆開（curriculum ↔ about 各一份、內容相同、獨立編輯）
  if (k === 'curriculum.group.bfa' || k.startsWith('curriculum.program.')) return 'curriculum programs';
  if (k === 'about.group.bfa' || k.startsWith('about.program.')) return 'about programs detail';
  if (k.startsWith('nav.')) return 'header';
  if (k.startsWith('about.')) return 'about';
  if (k.startsWith('faculty.dept.')) return 'faculty programs';
  if (k.startsWith('faculty.')) return 'faculty types';
  if (k === 'act.type.special' || k === 'act.type.permanent') return 'activities exhibitions';
  if (k === 'act.type.outbound' || k === 'act.type.inbound') return 'activities visits';
  if (k.startsWith('act.')) return 'activities';
  if (k.startsWith('adm.')) return 'admissions';
  if (k.startsWith('lib.')) return 'library';
  if (k === 'atlas.host' || k === 'atlas.employ') return 'atlas alumni';
  if (k.startsWith('atlas.')) return 'atlas';
  if (k.startsWith('alumni.')) return 'alumni';   // 系友會頁 nav（非 atlas 的 alumni chip）
  return null;
}

async function main() {
  // 1) category 欄（下拉 + 允許自訂）。已存在則同步 choices，讓下拉清單保持最新。
  const meta = { interface: 'select-dropdown', width: 'half', note: '後台分組（哪一頁/哪一區）；純整理、前台不吃',
    options: { allowOther: true, choices: CHOICES.map(c => ({ text: c, value: c })) } };
  const has = await api('/fields/ui_labels/category');
  if (has.ok) {
    const r = await api('/fields/ui_labels/category', { method: 'PATCH', body: JSON.stringify({ meta }) });
    console.log('同步 category choices:', r.status, r.ok ? 'OK' : JSON.stringify(r.j).slice(0, 150));
  } else {
    const r = await api('/fields/ui_labels', { method: 'POST', body: JSON.stringify({ field: 'category', type: 'string', meta, schema: {} }) });
    console.log('建 category 欄:', r.status, r.ok ? 'OK' : JSON.stringify(r.j).slice(0, 200));
  }

  // 2) 逐 row 標 category
  const rows = (await api('/items/ui_labels?limit=-1&fields=id,key,category')).j.data || [];
  let done = 0, skip = 0;
  for (const row of rows) {
    const cat = catOf(row.key);
    if (!cat) { console.warn('  ? 無對應資料夾:', row.key); skip++; continue; }
    if (row.category === cat) { skip++; continue; }
    const r = await api('/items/ui_labels/' + row.id, { method: 'PATCH', body: JSON.stringify({ category: cat }) });
    if (r.ok) done++; else console.error('  ✗', row.key, r.status);
  }
  console.log(`✓ 分類：更新 ${done}、略過 ${skip}（共 ${rows.length}）`);

  // 3) 預設清單視圖依 category 排序（讓同資料夾的 row 聚在一起）；已存在則略過
  const pre = await api('/presets?filter[collection][_eq]=ui_labels&filter[role][_null]=true&filter[user][_null]=true');
  if ((pre.j.data || []).length) console.log('✓ 預設視圖已存在');
  else {
    const r = await api('/presets', { method: 'POST', body: JSON.stringify({
      collection: 'ui_labels', role: null, user: null,
      layout: 'tabular',
      layout_query: { tabular: { sort: ['category', 'sort'], fields: ['category', 'key', 'en', 'zh'] } },
      layout_options: { tabular: { widths: {}, spacing: 'compact' } },
    }) });
    console.log('建預設視圖:', r.status, r.ok ? 'OK（依 category 排序）' : JSON.stringify(r.j).slice(0, 200));
  }
  console.log('完成。');
}
main().catch(e => { console.error(e); process.exit(1); });
