// 一次性 schema 遷移（配合前台功能）：faculty collection 加 akaEn / akaZh 別名欄（string input，同 guest aka）。
// 值在職/離職都可填，但前台只在 atlas 「離職教師」以括號顯示（在職不渲染）——見 atlas.js / faculty-source.js。
// idempotent、可重跑；先看：node scripts/add-faculty-aka.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path} ${body ? JSON.stringify(body) : ''}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// 半寬 string input，label 繁中；hint 提醒只在 atlas 離職者顯示。
const AKA_FIELDS = [
  { field: 'akaEn', name: 'AKA（英）', note: '別名／舊名（英）。僅 atlas 離職教師以括號顯示；在職教師不顯示。' },
  { field: 'akaZh', name: 'AKA（中）', note: '別名／舊名（中）。僅 atlas 離職教師以括號顯示；在職教師不顯示。' },
];

(async () => {
  const existing = ((await req('GET', '/fields/faculty')).data || []).map(f => f.field);
  console.log('faculty 別名欄 akaEn / akaZh');
  for (const f of AKA_FIELDS) {
    if (existing.includes(f.field)) { console.log(`  ↷ ${f.field} 已存在，跳過`); continue; }
    await req('POST', '/fields/faculty', {
      field: f.field, type: 'string',
      meta: { interface: 'input', width: 'half', name: f.name, note: f.note },
      schema: {},
    });
    console.log(`  ＋ faculty.${f.field}（${f.name}）`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。老師逐筆填別名後，前台硬重整即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
