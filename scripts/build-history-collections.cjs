// 重建 about 沿革兩個 collections（2026-08-11，user 指定新結構、舊「年份綁圖片」邏輯作廢）：
// - about_history        一筆＝一個時期（era），年表在 entries repeater（年份/學制/中英說明）
// - about_history_images 純圖片，sort 拖曳決定輪播先後（與年份脫鉤、無 caption）
// 舊版兩個 collection（year item + O2M 圖片 + caption）皆 0 筆 → 直接砍掉重建。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-history-collections.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17'; // 同 build-faculty-collection.cjs

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) + '…' : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 500)}`);
  return out;
}

(async () => {
  // 0) 安全檢查：兩個舊 collection 必須是空的才砍
  for (const col of ['about_history_images', 'about_history']) {
    const cnt = await req('GET', `/items/${col}?aggregate[count]=*`).catch(() => null);
    const n = Number(cnt?.data?.[0]?.count || 0);
    if (n > 0) { console.log(`⚠️ ${col} 有 ${n} 筆資料，中止（不砍非空 collection）。`); process.exit(1); }
    console.log(`刪除舊 ${col}（0 筆）...`);
    await req('DELETE', `/collections/${col}`).catch(e => console.log(`  （略過：${e.message.slice(0, 120)}）`));
  }

  // 1) about_history：一筆＝一個時期
  console.log('建立 about_history...');
  await req('POST', '/collections', {
    collection: 'about_history',
    meta: {
      translations: [{ language: 'zh-TW', translation: '沿革年表 History' }],
      group: 'about_folder', sort_field: 'sort', collapse: 'open', accountability: 'all', archive_app_filter: true,
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });
  const historyFields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'eraZh', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', translations: [{ language: 'zh-TW', translation: '時期名稱（中）' }], note: '例：專科學校／學院／大學' } },
    { field: 'eraEn', type: 'string', meta: { interface: 'input', sort: 4, width: 'half', translations: [{ language: 'zh-TW', translation: '時期名稱（英）' }], note: '例：(Junior) College / College / University' } },
    {
      field: 'entries', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 5,
        translations: [{ language: 'zh-TW', translation: '年表（可多筆）' }],
        note: '一列＝一條記事；同一年多條就填同一個年份，會自動歸在同一年底下',
        options: {
          template: '{{ year }}｜{{ descriptionZh }}',
          fields: [
            { field: 'year', type: 'integer', meta: { interface: 'input', width: 'half', translations: [{ language: 'zh-TW', translation: '年份' }] } },
            {
              field: 'division', type: 'string', meta: {
                interface: 'select-dropdown', width: 'half',
                translations: [{ language: 'zh-TW', translation: '學制' }],
                note: '大學時期用；留空＝不分學制',
                options: { choices: [{ text: '學士班 BFA', value: 'bfa' }, { text: '碩士班 MDES', value: 'mdes' }], allowNone: true },
              },
            },
            { field: 'descriptionZh', type: 'text', meta: { interface: 'input-multiline', translations: [{ language: 'zh-TW', translation: '說明（中）' }] } },
            { field: 'descriptionEn', type: 'text', meta: { interface: 'input-multiline', translations: [{ language: 'zh-TW', translation: '說明（英）' }] } },
          ],
        },
      },
    },
  ];
  for (const f of historyFields) {
    console.log(`  欄位 ${f.field}...`);
    await req('POST', '/fields/about_history', f);
  }

  // 2) about_history_images：純圖片 + sort
  console.log('建立 about_history_images...');
  await req('POST', '/collections', {
    collection: 'about_history_images',
    meta: {
      translations: [{ language: 'zh-TW', translation: '沿革照片 History Photos' }],
      group: 'about_folder', sort_field: 'sort', collapse: 'open', accountability: 'all', archive_app_filter: true,
      note: '照片輪播順序＝清單拖曳順序；與年份無關',
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });
  const imageFields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'image', type: 'uuid', meta: { special: ['file'], interface: 'file-image', sort: 3, translations: [{ language: 'zh-TW', translation: '照片' }] } },
  ];
  for (const f of imageFields) {
    console.log(`  欄位 ${f.field}...`);
    await req('POST', '/fields/about_history_images', f);
  }

  // 3) image file relation（保險補建，同 build-faculty pattern）
  const relRes = DRY ? { data: [] } : await req('GET', '/relations/about_history_images');
  if (!(relRes.data || []).some(r => r.field === 'image')) {
    console.log('補建 image relation...');
    await req('POST', '/relations', {
      collection: 'about_history_images', field: 'image', related_collection: 'directus_files',
      meta: { one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    });
  }

  // 4) Public read（沒開＝前台 fetch 401）
  for (const col of ['about_history', 'about_history_images']) {
    console.log(`開 ${col} Public read...`);
    await req('POST', '/permissions', { collection: col, action: 'read', fields: ['*'], policy: PUBLIC_POLICY });
  }

  console.log('\n✅ history collections 重建完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
