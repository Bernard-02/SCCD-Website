// 在 library_documents 加 pdfLink（sort 9，緊接 pdf=8 後面）：讓編輯者貼 CloudFront／S3 的 PDF 網址，
// 前台有填就優先用它、取代 Directus 檔案代理（開檔從 ~7-22s → 1-2s，見 memory reference_pdf_move_to_video_cloudfront_bucket）。
// Public read 權限已是 fields:['*']，新欄位自動可讀，免補權限。idempotent：已存在就跳過。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-document-pdflink.cjs [--dry]
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
  const field = {
    field: 'pdfLink',
    type: 'string',
    meta: {
      interface: 'input',
      sort: 9,
      width: 'full',
      options: { placeholder: 'https://d2df28pyzslt2v.cloudfront.net/documents/xxx.pdf' },
      note: '貼 CloudFront／S3 的 PDF 網址。有填就優先用它（取代下方上傳的 PDF 檔），開檔更快。',
      translations: zh('PDF 連結（CloudFront）'),
    },
  };
  if (existing.has(field.field)) { console.log(`  ${field.field} 已存在，跳過`); }
  else { await req('POST', '/fields/library_documents', field); console.log(`  ＋ ${field.field}`); }
  console.log('✅ library_documents pdfLink 欄位建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
