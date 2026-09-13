// library_awards.country 單選 → 多選（user 2026-09-13：一筆得獎可跨多國、前台渲染多面國旗）。
// type string → csv（欄值 'tw' 不動照樣有效＝單國；多國存 'au,nz'，API 回陣列）＋
// interface select-dropdown → select-multiple-dropdown（choices 原封保留）。
// 附帶修資料：2005 藝術與設計菁英海外培訓計畫（洪于程）＝匯入時多國取首（au）→ 補回 au,nz、
// ranks 兩機構拆成兩筆（xlsx row 525 獎別兩行、import script 舊版沒拆）。
// idempotent；--dry 只印不寫。跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/patch-library-awards-country-multi.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'library_awards';
const DRY = process.argv.includes('--dry');
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

(async () => {
  // 1) country 欄 → csv 多選
  const cf = await (await fetch(`${BASE}/fields/${COL}/country`, { headers: H })).json();
  const meta = cf.data?.meta;
  if (!meta) throw new Error('讀不到 country 欄');
  if (cf.data.type === 'csv' && meta.interface === 'select-multiple-dropdown') {
    console.log('✅ country 已是 csv 多選，跳過（idempotent）');
  } else if (DRY) {
    console.log(`[dry] 將 PATCH country：type ${cf.data.type}→csv、interface ${meta.interface}→select-multiple-dropdown、choices ${meta.options?.choices?.length} 項保留`);
  } else {
    const body = {
      type: 'csv',
      meta: { ...meta, interface: 'select-multiple-dropdown', special: ['cast-csv'] },
    };
    const res = await fetch(`${BASE}/fields/${COL}/country`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PATCH country 欄失敗 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    // 弱機防裸奔：改完立刻 GET 驗證
    const chk = await (await fetch(`${BASE}/fields/${COL}/country`, { headers: H })).json();
    if (chk.data?.type !== 'csv') throw new Error('驗證失敗：type 不是 csv，請檢查後台');
    console.log('✅ country 欄已改 csv 多選（驗證通過）');
  }

  // 2) 修 2005 洪于程那筆
  const q = `filter[year][_eq]=2005&filter[competitionZh][_eq]=${encodeURIComponent('藝術與設計菁英海外培訓計畫')}&fields=id,country,ranks,winners`;
  const items = (await (await fetch(`${BASE}/items/${COL}?${q}`, { headers: H })).json()).data || [];
  const target = items.find(it => (it.winners || []).some(w => w.nameZh === '洪于程'));
  if (!target) { console.log('⚠️ 找不到 2005 洪于程那筆，資料修正跳過'); return; }
  const patch = {
    country: ['au', 'nz'],
    ranks: [
      { zh: '數位動畫組 - 戈登技術學院', en: 'Gordon Institute TAFE' },
      { zh: '數位動畫組 - 奧克蘭理工大學', en: 'Auckland University of Technology' },
    ],
  };
  if (DRY) { console.log('[dry] 將 PATCH item', target.id, '現值 country=', JSON.stringify(target.country)); return; }
  const res = await fetch(`${BASE}/items/${COL}/${target.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) });
  console.log(res.ok ? `✅ item ${target.id} 已補 au,nz 雙國＋ranks 拆兩筆` : `❌ ${res.status} ${(await res.text()).slice(0, 300)}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
