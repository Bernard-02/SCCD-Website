// library_awards：把「主辦單位 / 獎項類別 / 名次」由 scalar 改成 repeater（可多筆），對齊已存在的 winners repeater。
// 固定不重複＝ country（國家）＋ competitionEn/Zh（競賽名稱）；其餘各自獨立 repeater（user 2026-08-25 定案）。
// 動作（idempotent，可重跑）：
//   1. 建 organizers / categories / ranks 三個 json repeater 欄（sub-fields {zh, en}，鏡像 winners）
//   2. 把每列既有 scalar（organizerEn/Zh…）搬進對應 repeater（單筆），只在 repeater 尚空時搬（不覆蓋後台編輯）
//   3. 把舊 scalar 欄（organizerEn/Zh、categoryEn/Zh、rankEn/Zh）設 hidden（保留 DB 資料、後台表單只顯示 repeater）
// 前台 mapDirectusAwardRow 已優先讀 repeater、scalar 當 fallback，故就算只跑到一半也不會壞版面。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-awards-repeaters.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'library_awards';
const DRY = process.argv.includes('--dry');

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// 一個 repeater 欄的建置設定，鏡像 winners（special cast-json + interface list + sub-fields zh/en）。
// zh 在前 en 在後（user 後台雙語順序定案：中文先）。display 顯示中文。
function repeaterField(field, sort, labelZh, note) {
  return {
    field, type: 'json',
    meta: {
      special: ['cast-json'], interface: 'list',
      options: { fields: [
        { field: 'zh', name: '中文',      type: 'string', meta: { interface: 'input' } },
        { field: 'en', name: 'English',  type: 'string', meta: { interface: 'input' } },
      ] },
      display: 'formatted-json-value', display_options: { format: '{{ zh }}' },
      sort, width: 'full', translations: [{ language: 'zh-TW', translation: labelZh }], note,
    },
    schema: { default_value: null },
  };
}

// repeater 欄 → 對應的舊 scalar (en, zh) 欄名 + 建欄設定
const PLAN = [
  { field: 'organizers', en: 'organizerEn', zh: 'organizerZh', label: '主辦單位（可多筆）', note: '主辦單位，可多筆。前台第 3 欄；空＝不顯示。' },
  { field: 'categories', en: 'categoryEn',  zh: 'categoryZh',  label: '獎項／類別（可多筆）', note: '獎項類別（如 Gold / 金獎），可多筆。' },
  { field: 'ranks',      en: 'rankEn',      zh: 'rankZh',      label: '名次（可多筆）',       note: '名次，可多筆。' },
];

(async () => {
  const fields = (await req('GET', `/fields/${COL}`)).data;
  const existing = new Set(fields.map(f => f.field));
  const sortOf = (f) => { const m = fields.find(x => x.field === f); return (m && m.meta && m.meta.sort) || 20; };

  // 1) 建 repeater 欄（sort 貼著舊 scalar，讓後台表單排在原位置）
  const haveNew = new Set();
  for (const p of PLAN) {
    if (existing.has(p.field)) { console.log(`  ${p.field} 已存在，跳過建欄`); haveNew.add(p.field); continue; }
    await req('POST', `/fields/${COL}`, repeaterField(p.field, sortOf(p.en), p.label, p.note));
    if (!DRY) haveNew.add(p.field);   // dry-run 沒真的建 → 別放進 GET 欄位（否則 403）
    console.log(`  ＋ ${p.field}（repeater：${p.label}）`);
  }

  // 2) 搬資料：scalar → repeater（只在 repeater 尚空時）。GET 只查已存在的欄，避免查不存在欄 → 403。
  const rowFields = ['id', ...PLAN.flatMap(p => haveNew.has(p.field) ? [p.field, p.en, p.zh] : [p.en, p.zh])].join(',');
  const rows = (await req('GET', `/items/${COL}?limit=-1&fields=${rowFields}`)).data;
  let migrated = 0;
  for (const row of rows) {
    const patch = {};
    for (const p of PLAN) {
      const cur = row[p.field];
      const already = Array.isArray(cur) && cur.length > 0;
      const en = (row[p.en] || '').trim();
      const zh = (row[p.zh] || '').trim();
      if (!already && (en || zh)) patch[p.field] = [{ zh, en }];
    }
    if (Object.keys(patch).length) {
      await req('PATCH', `/items/${COL}/${row.id}`, patch);
      migrated++;
    }
  }
  console.log(`  ↻ 搬移 scalar→repeater 的列數：${migrated} / ${rows.length}`);

  // 3) 隱藏舊 scalar 欄（保留 DB 資料，後台表單不再顯示，避免與 repeater 雙軌混淆）
  for (const p of PLAN) {
    for (const f of [p.en, p.zh]) {
      if (!existing.has(f)) continue;
      await req('PATCH', `/fields/${COL}/${f}`, { meta: { hidden: true } });
      console.log(`  ⨯ 隱藏舊欄 ${f}`);
    }
  }

  console.log(`✅ ${COL} repeater 化完成${DRY ? '（dry-run，未實際寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
