// 在 library_documents 加 subtitleZh / subtitleEn 兩個副標欄位（sort 6/7，落在 year=5 與 pdf=8 之間）。
// Public read 權限已是 fields:['*']，新欄位自動可讀，免補權限。idempotent：已存在的欄位跳過。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-document-subtitle.cjs [--dry]
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
  const fields = [
    { field: 'subtitleZh', type: 'string', meta: { interface: 'input', sort: 6, width: 'half', translations: zh('副標（中）') } },
    { field: 'subtitleEn', type: 'string', meta: { interface: 'input', sort: 7, width: 'half', translations: zh('副標（英）') } },
  ];
  for (const f of fields) {
    if (existing.has(f.field)) { console.log(`  ${f.field} 已存在，跳過`); continue; }
    await req('POST', '/fields/library_documents', f);
    console.log(`  ＋ ${f.field}`);
  }
  console.log('✅ library_documents 副標欄位建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
