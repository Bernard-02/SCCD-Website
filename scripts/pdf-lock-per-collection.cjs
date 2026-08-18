// documents 只能用網址、press 只能上傳：取消原本的「上傳 vs 網址」2 選 1 互鎖，
// 改成每個 collection 只留一種方式（另一欄 hidden + 清掉條件，避免殘留 readonly 卡住可用欄）。
// 前台仍是 pdfLink || pdf，資料不動、只改後台編輯 UI。
// idempotent。跑：node scripts/pdf-lock-per-collection.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// hidden=true 藏起來禁用、hidden=false 留著可用；兩者都清掉 conditions（單一方式不需要互鎖）
async function setField(collection, field, hidden) {
  const cur = (await req('GET', `/fields/${collection}/${field}`)).data;
  await req('PATCH', `/fields/${collection}/${field}`, { meta: { ...cur.meta, hidden, conditions: null } });
  console.log(`  ⚙︎ ${collection}.${field} → hidden:${hidden}, 條件清除`);
}

(async () => {
  // documents 只能用網址：藏上傳欄、留網址欄
  await setField('library_documents', 'pdf', true);
  await setField('library_documents', 'pdfLink', false);
  // press 只能上傳：藏網址欄、留上傳欄
  await setField('library_press', 'pdfLink', true);
  await setField('library_press', 'pdf', false);
  console.log('✅ 完成：documents 只用網址、press 只用上傳。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
