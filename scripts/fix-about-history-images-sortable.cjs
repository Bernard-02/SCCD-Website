// about_history_images 改成「側欄點一下直接進、照片可拖曳排序」（2026-09-11）：
// - files interface 不給拖曳把手 → images 欄 interface 換 list-m2m（有 ⠿ 把手；代價=失去多張拖上傳）
// - collection 實際只有 1 筆（照片池）→ 設 singleton，側欄點一下直接進表單、免點 record
// - 清 13 筆孤兒 junction row（about_history_images_id=null；只移除連結，檔案留在媒體庫）
// ⚠️ singleton 後前台 /items/about_history_images 回「物件非陣列」→ history-source.js 已加 Array.isArray 判斷
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fix-about-history-images-sortable.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const B = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(B + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  // 1) singleton（側欄點一下直接進該筆）
  console.log('① 設 about_history_images 為 singleton...');
  await req('PATCH', '/collections/about_history_images', { meta: { singleton: true } });

  // 2) images 欄 interface files → list-m2m（拖曳把手）；保留 special:['files'] 不動
  console.log('② images 欄 interface files → list-m2m...');
  await req('PATCH', '/fields/about_history_images/images', { meta: { interface: 'list-m2m' } });

  // 3) 清孤兒 junction row（只斷連結，directus_files 檔案保留）
  const orphans = ((await req('GET', '/items/about_history_images_files?filter[about_history_images_id][_null]=true&fields=id&limit=-1')).data) || [];
  console.log(`③ 孤兒 junction row: ${orphans.length} 筆`);
  if (orphans.length) {
    if (DRY) console.log('   [dry] 會刪這些 junction row（檔案留在媒體庫）');
    else { await req('DELETE', '/items/about_history_images_files', orphans.map(o => o.id)); console.log('   已刪（檔案保留在媒體庫）'); }
  }

  console.log('\n✅ done');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
