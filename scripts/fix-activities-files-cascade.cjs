// activities 系列附件 junction（*_files ＋ degree_show_poster）外鍵 RESTRICT → CASCADE。
// 原況：on_delete=RESTRICT → 圖片/附件欄有東西的活動後台刪不掉（MySQL FK error）。
// 改後：刪活動自動清 junction 關聯列；directus_files 檔案本身不動（檔案庫照片安全）。
// ⚠️弱機 Lightsail 做 ALTER 常 502（proxy 先斷、甚至只拆掉舊 FK 沒建回→schema:null）
//   → 逐條 PATCH 容忍失敗＋輪詢驗證＋最多重打 3 次；schema:null 的也視為待修。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fix-activities-files-cascade.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return out;
}

const getOnDelete = async (col, field) =>
  (await req('GET', `/relations/${col}/${field}`)).data?.schema?.on_delete ?? null;

(async () => {
  const rels = (await req('GET', '/relations')).data || [];
  const targets = rels.filter(r =>
    /^activities_/.test(r.collection) && /^activities_/.test(r.related_collection || '') &&
    (r.schema?.on_delete === 'RESTRICT' || r.schema == null));   // null＝上次 502 拆到一半
  console.log(`待修 ${targets.length} 條`);
  if (DRY) { targets.forEach(r => console.log(`  [dry] ${r.collection}.${r.field}（現況 ${r.schema?.on_delete ?? 'null'}）`)); return; }

  const failed = [];
  for (const r of targets) {
    const tag = `${r.collection}.${r.field}`;
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      await req('PATCH', `/relations/${r.collection}/${r.field}`, { schema: { on_delete: 'CASCADE' } })
        .catch(e => console.log(`  … ${tag} PATCH ${e.message.match(/\d+$/)?.[0] || '斷線'}（第 ${attempt} 次，輪詢確認中）`));
      for (let i = 0; i < 9 && !ok; i++) {                       // 最多 ~90s
        await sleep(10000);
        ok = await getOnDelete(r.collection, r.field).catch(() => null) === 'CASCADE';
      }
    }
    console.log(ok ? `  ✓ ${tag} → CASCADE` : `  ❌ ${tag} 三次未成`);
    if (!ok) failed.push(tag);
    await sleep(3000);                                           // 讓弱機喘口氣
  }
  console.log(failed.length ? `\n⚠️ 未完成：${failed.join(', ')}（重跑本 script 續修）` : '\n✅ 全部完成。後台可直接刪有圖的活動了。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
