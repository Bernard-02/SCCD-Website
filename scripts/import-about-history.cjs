// 匯入 about 沿革 → Directus about_history（era items + entries repeater）與
// about_history_images（上傳本地佔位圖檔 → file uuid rows，sort 依 fallback 順序）。
// 來源 data/about-history.json（2026-08-11 新 shape：{ images:[], eras:[{eraEn,eraZh,entries:[{year,division,en,zh}]}] }）。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-about-history.cjs [--dry] [--force]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const BASE = 'https://sccdtest.usc.edu.tw';
const SRC = 'data/about-history.json';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

(async () => {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const eraItems = src.eras.map((e, i) => ({
    eraZh: e.eraZh, eraEn: e.eraEn, sort: i + 1,
    entries: e.entries.map(en => ({ year: en.year, division: en.division || null, descriptionZh: en.zh, descriptionEn: en.en })),
  }));

  console.log('=== 預覽 ===');
  eraItems.forEach(e => console.log(`  ${e.sort}. ${e.eraEn} ${e.eraZh}｜${e.entries.length} 筆年表`));
  console.log('  照片：', src.images.join(', '));
  if (DRY) { console.log('--dry：不上傳。'); return; }

  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const auth = { Authorization: 'Bearer ' + token };
  const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

  for (const col of ['about_history', 'about_history_images']) {
    const cnt = await fetch(`${BASE}/items/${col}?aggregate[count]=*`, { headers: auth }).then(r => r.json());
    const n = Number(cnt?.data?.[0]?.count || 0);
    if (n > 0 && !FORCE) { console.log(`⚠️ ${col} 已有 ${n} 筆，中止避免重複。`); return; }
  }

  // 1) 上傳圖檔（fallback 路徑 ../images/X → 本地 images/X）→ 建 about_history_images rows
  const imageRows = [];
  for (let i = 0; i < src.images.length; i++) {
    const local = src.images[i].replace(/^\.\.\//, '');
    const buf = fs.readFileSync(local);
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(local).toLowerCase()] || 'application/octet-stream';
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime }), path.basename(local));
    const up = await fetch(`${BASE}/files`, { method: 'POST', headers: auth, body: fd }).then(r => r.json());
    if (!up?.data?.id) { console.log('❌ 圖檔上傳失敗:', local, JSON.stringify(up).slice(0, 300)); return; }
    console.log(`  上傳 ${local} → ${up.data.id}`);
    imageRows.push({ image: up.data.id, sort: i + 1 });
  }
  const imgRes = await fetch(`${BASE}/items/about_history_images`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(imageRows) });
  if (!imgRes.ok) { console.log('❌ images rows 失敗:', (await imgRes.text()).slice(0, 300)); return; }
  console.log(`✅ about_history_images ${imageRows.length} 筆。`);

  // 2) era items
  const res = await fetch(`${BASE}/items/about_history`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(eraItems) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.log('❌ eras 匯入失敗:', JSON.stringify(out).slice(0, 400)); return; }
  console.log(`✅ about_history ${Array.isArray(out.data) ? out.data.length : '?'} 筆時期。`);
})().catch(e => console.log('錯誤:', e.message));
