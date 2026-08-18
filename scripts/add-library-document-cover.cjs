// 在 library_documents 加 cover（單張封面圖，M2O → directus_files），照 pdf 欄位同結構建。
// 前台 mapDirectusFilesRow 已讀 row.cover：有值就直接當封面圖、不再 pdf.js 現畫第一頁（省掉 Documents 面板那 1s 揭示閘門）。
// 封面可手動上傳，或用 scripts/generate-library-covers.cjs 自動產。idempotent：已存在就跳過。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-document-cover.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  const existing = new Set((await req('GET', '/fields/library_documents')).data.map(f => f.field));
  if (existing.has('cover')) { console.log('  cover 已存在，跳過'); return; }

  // 1) 欄位（同 pdf：uuid + special file + file-image 介面）
  await req('POST', '/fields/library_documents', {
    field: 'cover',
    type: 'uuid',
    meta: { interface: 'file-image', special: ['file'], sort: 10, width: 'half',
            note: '封面圖。留空則前台自動用 PDF 第一頁（較慢）；可由 generate-library-covers.cjs 批次自動產。',
            translations: zh('封面圖') },
    schema: {},
  });
  // 2) 關聯到 directus_files（同 pdf 的 relation）
  await req('POST', '/relations', {
    collection: 'library_documents',
    field: 'cover',
    related_collection: 'directus_files',
  });
  console.log('  ＋ cover（M2O → directus_files）');
  console.log('✅ library_documents cover 欄位建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
