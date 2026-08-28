// 在 library_documents 加 docType（文件分類下拉選單：書籍 / 收錄 / 冊頁 / 其他）。
// 前台 Documents 面板用它做分類篩選 + 副標下方顯示分類；顯示文字走 ui_labels（lib.doctype.*）可後台改，
// 故此欄只存穩定 key（books/contributions/booklets/other），下拉選項文字給後台編輯者辨識用。
// idempotent：已存在就跳過。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-document-type.cjs [--dry]
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
  if (existing.has('docType')) { console.log('  docType 已存在，跳過'); return; }

  await req('POST', '/fields/library_documents', {
    field: 'docType',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      special: null,
      options: {
        allowNone: true,               // 可留空＝未分類（前台不顯示 tag、任何 chip 都篩不到）
        choices: [
          { text: '書籍 Books',                value: 'books' },
          { text: '收錄 Contributions',        value: 'contributions' },
          { text: '冊頁 Booklets & Leaflets',  value: 'booklets' },
          { text: '其他 Other',                value: 'other' },
        ],
      },
      sort: 12,
      width: 'half',
      note: '文件分類。前台副標下方顯示＋分類篩選用；顯示文字在 ui_labels（lib.doctype.*）可改。留空＝未分類。',
      translations: zh('分類'),
    },
    schema: { default_value: null },
  });
  console.log('  ＋ docType（select-dropdown：書籍 / 收錄 / 冊頁 / 其他）');
  console.log('✅ library_documents docType 欄位建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
