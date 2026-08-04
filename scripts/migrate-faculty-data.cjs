// 把 faculty_fulltime / faculty_parttime / faculty_admin / faculty_former 四個 collection 的資料
// 併進新 collection `faculty`（facultyType + status 兩軸，2026-08-04）。
// 一次性遷移 script，資料已搬完；留著當這次遷移的紀錄，供之後同類調整參考。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-faculty-data.cjs [--dry] [--force]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

async function getRows(collection) {
  const res = await fetch(`${BASE}/items/${collection}?limit=-1&sort=sort`, { headers });
  const out = await res.json();
  if (!res.ok) throw new Error(`GET ${collection} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out.data || [];
}

// 只取要搬的欄位，去掉舊 collection 自己的 id（讓新 collection 產生新 id）
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

(async () => {
  console.log('讀取四個舊 collection...');
  const [fulltime, parttime, admin, former] = await Promise.all([
    getRows('faculty_fulltime'), getRows('faculty_parttime'), getRows('faculty_admin'), getRows('faculty_former'),
  ]);
  console.log(`fulltime=${fulltime.length} parttime=${parttime.length} admin=${admin.length} former=${former.length}`);

  const items = [];

  // 全職：欄位形狀不變，sort 保留原序（1..N）
  fulltime.forEach((r, i) => {
    items.push({
      ...pick(r, ['nameEn', 'nameZh', 'titles', 'educations', 'experiences', 'journey', 'awards', 'image', 'placeholderStandard', 'placeholderInverse', 'placeholderWireframeBlack']),
      facultyType: 'fulltime', status: 'active', sort: i + 1,
    });
  });

  // 兼職：舊 collection 沒有 educations/experiences/awards → 新增空陣列（後台之後補）；offset 1000 避免跟全職 sort 撞
  parttime.forEach((r, i) => {
    items.push({
      ...pick(r, ['nameEn', 'nameZh', 'titles', 'image', 'placeholderStandard', 'placeholderInverse', 'placeholderWireframeBlack']),
      educations: [], experiences: [], awards: [],
      facultyType: 'parttime', status: 'active', sort: 1000 + i + 1,
    });
  });

  // 行政：單一 titleEn/titleZh(+country) → 包成 titles repeater 一筆；offset 2000
  admin.forEach((r, i) => {
    const title = (r.titleEn || r.titleZh || r.country) ? [{ titleEn: r.titleEn || '', titleZh: r.titleZh || '', country: r.country || '' }] : [];
    items.push({
      ...pick(r, ['nameEn', 'nameZh', 'contact', 'image', 'placeholderStandard', 'placeholderInverse', 'placeholderWireframeBlack']),
      titles: title,
      facultyType: 'admin', status: 'active', sort: 2000 + i + 1,
    });
  });

  // 離職：單一 titleEn/titleZh(+country) → titles repeater 一筆；facultyType 留空（user 決定：atlas 不吃這欄，之後後台再分類）；offset 3000
  former.forEach((r, i) => {
    const title = (r.titleEn || r.titleZh || r.country) ? [{ titleEn: r.titleEn || '', titleZh: r.titleZh || '', country: r.country || '' }] : [];
    items.push({
      ...pick(r, ['nameEn', 'nameZh']),
      titles: title,
      facultyType: null, status: 'former', sort: 3000 + i + 1,
    });
  });

  console.log(`\n共 ${items.length} 筆待寫入 faculty（fulltime ${fulltime.length} + parttime ${parttime.length} + admin ${admin.length} + former ${former.length}）。`);

  if (DRY) {
    console.log('\n--dry 範例（各類 1 筆）：');
    console.log(JSON.stringify(items.find(i => i.facultyType === 'fulltime'), null, 2));
    console.log(JSON.stringify(items.find(i => i.facultyType === 'parttime'), null, 2));
    console.log(JSON.stringify(items.find(i => i.facultyType === 'admin'), null, 2));
    console.log(JSON.stringify(items.find(i => i.status === 'former'), null, 2));
    console.log('\n--dry：不寫入。');
    return;
  }

  // 防呆：faculty 非空中止
  const cur = await fetch(`${BASE}/items/faculty?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) {
    console.log(`⚠️ faculty 已有 ${count} 筆，為避免重複已中止。確定要清空重灌請先手動刪除再跑（或加 --force 直接疊加，不建議）。`);
    return;
  }

  const CHUNK = 25;
  let created = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK);
    const res = await fetch(`${BASE}/items/faculty`, { method: 'POST', headers, body: JSON.stringify(batch) });
    const out = await res.json();
    if (!res.ok) { console.log('❌ 批次失敗 @' + i, JSON.stringify(out).slice(0, 500)); return; }
    created += Array.isArray(out.data) ? out.data.length : 0;
    console.log(`  已建立 ${created}/${items.length}`);
  }
  console.log(`\n✅ 完成，faculty 共建立 ${created} 筆。舊 4 個 collection 保留未動，前端改完驗證無誤後再決定是否封存/刪除。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
