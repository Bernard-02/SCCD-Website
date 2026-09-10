// program_nodes 加 wordmarkFile（標準字 SVG 上傳欄，directus_files）＋上傳現有 SCCD svg＋DCD/BPAIDC 兩 root 都指它。
// user 2026-09-09：wordmark 標準字改後台可上傳、預設兩個都用 sccd 的 svg（前台從檔案 URL 當 mask，見 program-nodes-source / about-structure）。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-program-node-wordmark-file.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const AUTH = { Authorization: 'Bearer ' + token };
const H = { ...AUTH, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'program_nodes';
const SVG = 'images/SCCD - Black.svg';
const FILE_TITLE = 'SCCD Wordmark (program tree)';   // idempotent 判斷用

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}`, body ? JSON.stringify(body).slice(0, 180) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  // 1) 欄位 wordmarkFile（已存在則 POST 400 → 容錯略過）
  console.log('欄位 wordmarkFile...');
  await req('POST', `/fields/${COL}`, {
    field: 'wordmarkFile', type: 'uuid',
    meta: { special: ['file'], interface: 'file-image', sort: 7, width: 'half',
      translations: [{ language: 'zh-TW', translation: '標準字 SVG（上傳）' }],
      note: '頂層黑底標準字圖；留空＝前台退 CSS 預設 SCCD。SVG 為實心單色圖（當 mask 上主題色）' },
    schema: {},
  }).catch(e => console.log(`  （略過：${e.message.slice(0, 90)}）`));

  // 2) relation wordmarkFile → directus_files（file 欄不會自動建 relation）
  const rel = DRY ? { data: [] } : await req('GET', `/relations/${COL}`).catch(() => ({ data: [] }));
  if (!(rel.data || []).some(r => r.field === 'wordmarkFile')) {
    console.log('補建 wordmarkFile relation...');
    await req('POST', '/relations', {
      collection: COL, field: 'wordmarkFile', related_collection: 'directus_files',
      meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    });
  }

  // 3) 上傳 SCCD svg（idempotent：先查同 title 的檔，有就重用）
  let fileId;
  const found = await req('GET', `/files?filter[title][_eq]=${encodeURIComponent(FILE_TITLE)}&fields=id&limit=1`).catch(() => ({ data: [] }));
  if ((found.data || []).length) { fileId = found.data[0].id; console.log(`✓ 檔已存在 ${fileId}，略過上傳`); }
  else if (DRY) { console.log(`[dry] POST /files（上傳 ${SVG}，title=${FILE_TITLE}）`); fileId = 'dry-file-id'; }
  else {
    console.log(`上傳 ${SVG}...`);
    const fd = new FormData();
    fd.append('title', FILE_TITLE);
    fd.append('file', new Blob([fs.readFileSync(SVG)], { type: 'image/svg+xml' }), path.basename(SVG));
    const res = await fetch(`${BASE}/files`, { method: 'POST', headers: AUTH, body: fd });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`上傳失敗 ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    fileId = out.data.id;
    console.log(`✓ 上傳完成 ${fileId}`);
  }

  // 4) 兩個 root（有 wordmark 的）都指這個檔
  const roots = await req('GET', `/items/${COL}?filter[parent][_null]=true&fields=id,labelKey,wordmark&limit=-1`).catch(() => ({ data: [] }));
  for (const r of (roots.data || [])) {
    if (!r.wordmark) continue;   // 只有頂層黑塊節點
    console.log(`  ${r.labelKey} → wordmarkFile=${fileId}`);
    await req('PATCH', `/items/${COL}/${r.id}`, { wordmarkFile: fileId });
  }

  console.log(`\n✅ 完成${DRY ? '（DRY，未寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
