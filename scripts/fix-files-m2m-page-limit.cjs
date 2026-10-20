// 後台 files（多圖 M2M）欄「沒有拖曳把手」真因（2026-10-20）：Directus files 介面
// allowDrag = 總筆數 <= 每頁筆數（預設 15）——超過一頁就關掉拖曳（不給跨頁拖），跟 sort_field 有沒有設無關。
// 這支把所有非 directus_* collection 的 files 欄每頁筆數一律設 200（idempotent，新增欄位後重跑即可）。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fix-files-m2m-page-limit.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const B = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const LIMIT = 200; // ponytail: 一頁 200 張夠用；相簿破 200 再加大

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${path}`, JSON.stringify(body)); return { data: {} }; }
  const res = await fetch(B + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  const fields = (await req('GET', '/fields')).data
    .filter(f => f.meta?.interface === 'files' && !f.collection.startsWith('directus_'));
  for (const f of fields) {
    const cur = f.meta.options?.limit ?? 15;
    if (cur >= LIMIT) { console.log(`= ${f.collection}.${f.field} limit=${cur}`); continue; }
    console.log(`→ ${f.collection}.${f.field} limit ${cur} → ${LIMIT}`);
    await req('PATCH', `/fields/${f.collection}/${f.field}`, { meta: { options: { ...(f.meta.options || {}), limit: LIMIT } } });
  }
  console.log('\n✅ done');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
