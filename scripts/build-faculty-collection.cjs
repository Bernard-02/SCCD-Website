// 建 Directus 新 collection `faculty`（合併 faculty_fulltime/parttime/admin/former，2026-08-04）
// 一次性 schema script，faculty collection 已建好；留著當這次遷移的紀錄，供之後同類調整參考。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-faculty-collection.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17'; // 從 faculty_fulltime 既有 read permission 取得

const COUNTRY_CHOICES = [
  { text: '台灣 Taiwan', value: 'tw' }, { text: '日本 Japan', value: 'jp' }, { text: '韓國 South Korea', value: 'kr' },
  { text: '中國 China', value: 'cn' }, { text: '香港 Hong Kong', value: 'hk' }, { text: '新加坡 Singapore', value: 'sg' },
  { text: '馬來西亞 Malaysia', value: 'my' }, { text: '泰國 Thailand', value: 'th' }, { text: '越南 Vietnam', value: 'vn' },
  { text: '菲律賓 Philippines', value: 'ph' }, { text: '印尼 Indonesia', value: 'id' }, { text: '印度 India', value: 'in' },
  { text: '澳洲 Australia', value: 'au' }, { text: '紐西蘭 New Zealand', value: 'nz' }, { text: '美國 United States', value: 'us' },
  { text: '加拿大 Canada', value: 'ca' }, { text: '墨西哥 Mexico', value: 'mx' }, { text: '巴西 Brazil', value: 'br' },
  { text: '英國 United Kingdom', value: 'gb' }, { text: '法國 France', value: 'fr' }, { text: '德國 Germany', value: 'de' },
  { text: '義大利 Italy', value: 'it' }, { text: '西班牙 Spain', value: 'es' }, { text: '荷蘭 Netherlands', value: 'nl' },
  { text: '比利時 Belgium', value: 'be' }, { text: '瑞士 Switzerland', value: 'ch' }, { text: '奧地利 Austria', value: 'at' },
  { text: '瑞典 Sweden', value: 'se' }, { text: '挪威 Norway', value: 'no' }, { text: '丹麥 Denmark', value: 'dk' },
  { text: '芬蘭 Finland', value: 'fi' }, { text: '波蘭 Poland', value: 'pl' }, { text: '捷克 Czechia', value: 'cz' },
  { text: '俄羅斯 Russia', value: 'ru' }, { text: '土耳其 Turkey', value: 'tr' }, { text: '以色列 Israel', value: 'il' },
  { text: '阿聯 UAE', value: 'ae' }, { text: '南非 South Africa', value: 'za' }, { text: '埃及 Egypt', value: 'eg' },
];

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) + '…' : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 500)}`);
  return out;
}

(async () => {
  // 1) collection + primary key
  console.log('建立 collection faculty...');
  await req('POST', '/collections', {
    collection: 'faculty',
    meta: {
      translations: [{ language: 'zh-TW', translation: '教師（專任／兼任／行政）' }],
      group: 'faculty_folder',
      sort_field: 'sort',
      collapse: 'open',
      accountability: 'all',
      archive_app_filter: true,
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });

  // 2) 其餘欄位（依序，sort 值＝顯示順序）
  const fields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'image', type: 'uuid', meta: { special: ['file'], interface: 'file-image', sort: 3, translations: [{ language: 'zh-TW', translation: '照片' }] } },
    { field: 'placeholderStandard', type: 'uuid', meta: { special: ['file'], interface: 'file-image', sort: 4, translations: [{ language: 'zh-TW', translation: '代用圖（標準）' }] } },
    { field: 'placeholderInverse', type: 'uuid', meta: { special: ['file'], interface: 'file-image', sort: 5, translations: [{ language: 'zh-TW', translation: '代用圖（反白）' }] } },
    { field: 'placeholderWireframeBlack', type: 'uuid', meta: { special: ['file'], interface: 'file-image', sort: 6, translations: [{ language: 'zh-TW', translation: '代用圖（線框）' }] } },
    {
      field: 'facultyType', type: 'string', meta: {
        interface: 'select-dropdown', sort: 7, width: 'half', required: false,
        translations: [{ language: 'zh-TW', translation: '種類' }],
        note: '專任／兼任／行政管理；離職教師若尚未分類可留空',
        options: { choices: [{ text: '專任', value: 'fulltime' }, { text: '兼任', value: 'parttime' }, { text: '行政管理', value: 'admin' }] },
      },
    },
    {
      field: 'status', type: 'string', meta: {
        interface: 'select-dropdown', sort: 8, width: 'half', required: true,
        translations: [{ language: 'zh-TW', translation: '狀態' }],
        options: { choices: [{ text: '在職', value: 'active' }, { text: '離職', value: 'former' }] },
      },
      schema: { default_value: 'active' },
    },
    { field: 'nameEn', type: 'string', meta: { interface: 'input', sort: 9, width: 'half', translations: [{ language: 'zh-TW', translation: '姓名（英）' }] } },
    { field: 'nameZh', type: 'string', meta: { interface: 'input', sort: 10, width: 'half', translations: [{ language: 'zh-TW', translation: '姓名（中）' }] } },
    {
      field: 'titles', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 11,
        translations: [{ language: 'zh-TW', translation: '職稱（可多筆）' }],
        options: {
          template: '{{ titleEn }} {{ titleZh }}',
          fields: [
            { field: 'titleZh', type: 'string', meta: { interface: 'input', translations: [{ language: 'zh-TW', translation: '職稱中' }] } },
            { field: 'titleEn', type: 'string', meta: { interface: 'input', translations: [{ language: 'zh-TW', translation: '職稱英' }] } },
            { field: 'country', type: 'string', meta: { interface: 'select-dropdown', options: { choices: COUNTRY_CHOICES }, translations: [{ language: 'zh-TW', translation: '國家' }], note: '單位/機構名稱才填國家（前台會在名稱後面加註「（國家）」）；純職稱（如：藝術家）留空不填' } },
          ],
        },
      },
    },
    {
      field: 'educations', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 12,
        translations: [{ language: 'zh-TW', translation: '學歷（可多筆）' }],
        conditions: [{ name: '行政管理不顯示', rule: { facultyType: { _eq: 'admin' } }, hidden: true, options: {} }],
        options: {
          template: '{{ schoolEn }} {{ schoolZh }}',
          fields: [
            { field: 'country', type: 'string', meta: { interface: 'select-dropdown', options: { choices: COUNTRY_CHOICES }, note: '存 ISO2 國碼小寫', translations: [{ language: 'zh-TW', translation: '國家/國碼' }] } },
            { field: 'schoolZh', type: 'string', meta: { interface: 'input' } },
            { field: 'schoolEn', type: 'string', meta: { interface: 'input' } },
            { field: 'majorZh', type: 'string', meta: { interface: 'input' } },
            { field: 'majorEn', type: 'string', meta: { interface: 'input' } },
            { field: 'degreeZh', type: 'string', meta: { interface: 'input' } },
            { field: 'degreeEn', type: 'string', meta: { interface: 'input' } },
          ],
        },
      },
    },
    {
      field: 'experiences', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 13,
        translations: [{ language: 'zh-TW', translation: '經歷（可多筆）' }],
        conditions: [{ name: '行政管理不顯示', rule: { facultyType: { _eq: 'admin' } }, hidden: true, options: {} }],
        options: {
          template: '{{ organizationEn }} {{ organizationZh }}',
          fields: [
            { field: 'startYear', type: 'string', meta: { interface: 'input' }, name: '開始年份' },
            { field: 'endYear', type: 'integer', meta: { interface: 'input' }, name: '結束年份' },
            { field: 'isPresent', type: 'boolean', meta: { interface: 'boolean', note: '勾選=這個經歷至今仍持續（endYear 留空），前台會顯示「起始年-」如 2020-' }, name: '至今' },
            { field: 'organizationZh', type: 'string', meta: { interface: 'input' }, name: '組織（中）' },
            { field: 'organizationEn', type: 'string', meta: { interface: 'input' }, name: '組織（英）' },
            { field: 'roleZh', type: 'string', meta: { interface: 'input' }, name: '職位（中）' },
            { field: 'roleEn', type: 'string', meta: { interface: 'input' }, name: '職位（英）' },
          ],
        },
      },
    },
    {
      field: 'journey', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 14,
        translations: [{ language: 'zh-TW', translation: '歷程（可多筆，只有專任老師才需要）' }],
        conditions: [{ name: '只有專任顯示', rule: { facultyType: { _neq: 'fulltime' } }, hidden: true, options: {} }],
        options: {
          template: '{{ organizationEn }} {{ organizationZh }}',
          fields: [
            { field: 'startYear', type: 'string', meta: { interface: 'input' }, name: '開始年份' },
            { field: 'endYear', type: 'integer', meta: { interface: 'input' }, name: '結束年份' },
            { field: 'isPresent', type: 'boolean', meta: { interface: 'boolean' }, name: '至今' },
            { field: 'organizationZh', type: 'string', meta: { interface: 'input' }, name: '組織（中）' },
            { field: 'organizationEn', type: 'string', meta: { interface: 'input' }, name: '組織（英）' },
            { field: 'roleZh', type: 'string', meta: { interface: 'input' }, name: '職位（中）' },
            { field: 'roleEn', type: 'string', meta: { interface: 'input' }, name: '職位（英）' },
          ],
        },
      },
    },
    {
      field: 'awards', type: 'json', meta: {
        special: ['cast-json'], interface: 'list', sort: 15,
        translations: [{ language: 'zh-TW', translation: '獲獎（可多筆）' }],
        conditions: [{ name: '行政管理不顯示', rule: { facultyType: { _eq: 'admin' } }, hidden: true, options: {} }],
        options: {
          template: '{{ nameEn }} {{ nameZh }}',
          fields: [
            { field: 'startYear', type: 'string', meta: { interface: 'input' } },
            { field: 'endYear', type: 'integer', meta: { interface: 'input' } },
            { field: 'country', type: 'string', meta: { interface: 'select-dropdown', options: { choices: COUNTRY_CHOICES }, note: '存 ISO2 國碼小寫', translations: [{ language: 'zh-TW', translation: '國家/國碼' }] } },
            { field: 'nameZh', type: 'string', meta: { interface: 'input' } },
            { field: 'nameEn', type: 'string', meta: { interface: 'input' } },
            { field: 'categoryZh', type: 'string', meta: { interface: 'input' } },
            { field: 'categoryEn', type: 'string', meta: { interface: 'input' } },
          ],
        },
      },
    },
    {
      field: 'contact', type: 'text', meta: {
        interface: 'input-multiline', sort: 16, hidden: true,
        translations: [{ language: 'zh-TW', translation: '聯絡資訊' }],
        note: '純文字、可多行，例 Email / 電話（只有行政管理用）',
        conditions: [{ name: '只有行政管理顯示', rule: { facultyType: { _eq: 'admin' } }, hidden: false, options: {} }],
      },
    },
  ];

  for (const f of fields) {
    console.log(`建立欄位 ${f.field}...`);
    await req('POST', '/fields/faculty', f);
  }

  // 3) file 欄位的 relation（POST /fields 對 uuid+special:file 通常會自動建 relation；保險起見檢查並補建）
  console.log('檢查 file 欄位 relation...');
  const existingRelFields = new Set();
  if (!DRY) {
    const relRes = await req('GET', '/relations/faculty');
    (relRes.data || []).forEach(r => existingRelFields.add(r.field));
  }
  for (const field of ['image', 'placeholderStandard', 'placeholderInverse', 'placeholderWireframeBlack']) {
    if (existingRelFields.has(field)) { console.log(`  ${field} 已有 relation`); continue; }
    console.log(`  補建 ${field} relation...`);
    await req('POST', '/relations', {
      collection: 'faculty', field, related_collection: 'directus_files',
      meta: { one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    });
  }

  // 4) Public role read permission（比照 faculty_fulltime）
  console.log('開 Public read 權限...');
  await req('POST', '/permissions', {
    collection: 'faculty', action: 'read', fields: ['*'], policy: PUBLIC_POLICY,
  });

  console.log('\n✅ faculty collection 建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
