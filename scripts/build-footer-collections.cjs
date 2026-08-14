// 建 Directus footer 內容 collections（footer_tabs + footer_items，2026-08-11）
// footer 散佈區 tab 名稱與 tab 內項目（電話/傳真/信箱/地址/連結卡/社群 icon）改後台管理，
// 順序 = 後台 sort 拖曳（tabs 在 collection 內拖；items 在所屬 tab 的 O2M 清單內拖）。
// 一次性 schema+seed script；留著當紀錄供同類調整參考。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-footer-collections.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17'; // 同 build-faculty-collection.cjs

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 160) + '…' : ''); return { data: { id: 'dry-id' } }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 400)}`);
  return out;
}

(async () => {
  // ── 1) footer_tabs ─────────────────────────────────────────
  console.log('建立 collection footer_tabs...');
  await req('POST', '/collections', {
    collection: 'footer_tabs',
    meta: {
      translations: [{ language: 'zh-TW', translation: '頁尾分頁（tab）' }],
      sort_field: 'sort',
      note: '網站頁尾左上的分頁按鈕；拖曳排序＝前台顯示順序，第一個＝預設顯示的分頁',
      accountability: 'all',
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });
  const tabFields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'key', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', required: true, translations: [{ language: 'zh-TW', translation: '代號（英文小寫）' }], note: '前台識別用，如 dept / aa / units；建立後勿隨意更改' } },
    {
      field: 'mark', type: 'string', meta: {
        interface: 'select-dropdown', sort: 4, width: 'half',
        translations: [{ language: 'zh-TW', translation: '標誌圖' }],
        note: 'tab 上方的 wordmark 圖；「無」則以文字對齊其他 tab。新增其他標誌需前端配合',
        options: { choices: [{ text: '無', value: 'none' }, { text: 'SCCD', value: 'sccd' }, { text: 'SCCDAA', value: 'sccdaa' }] },
      },
      schema: { default_value: 'none' },
    },
    { field: 'nameZh', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', required: true, translations: [{ language: 'zh-TW', translation: '名稱（中）' }] } },
    { field: 'nameEn', type: 'string', meta: { interface: 'input', sort: 6, width: 'half', required: true, translations: [{ language: 'zh-TW', translation: '名稱（英）' }] } },
    {
      field: 'items', type: 'alias', meta: {
        special: ['o2m'], interface: 'list-o2m', sort: 7,
        translations: [{ language: 'zh-TW', translation: '分頁內項目（可拖曳排序）' }],
        options: { template: '{{ labelEn }} {{ labelZh }} {{ type }}', enableSelect: false },
      },
    },
  ];
  for (const f of tabFields) await req('POST', '/fields/footer_tabs', f);

  // ── 2) footer_items ────────────────────────────────────────
  console.log('建立 collection footer_items...');
  await req('POST', '/collections', {
    collection: 'footer_items',
    meta: {
      translations: [{ language: 'zh-TW', translation: '頁尾項目' }],
      sort_field: 'sort',
      note: '頁尾各分頁內的資訊卡／連結卡／社群 icon；請從「頁尾分頁」的項目清單內新增與拖曳排序',
      accountability: 'all',
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });
  const HIDE_WHEN_SOCIAL = [{ name: '社群 icon 不需此欄', rule: { type: { _eq: 'social' } }, hidden: true, options: {} }];
  const HIDE_WHEN_SOCIAL_OR_LINK = [
    { name: '社群 icon 不需此欄', rule: { type: { _eq: 'social' } }, hidden: true, options: {} },
    { name: '連結卡不需此欄', rule: { type: { _eq: 'link' } }, hidden: true, options: {} },
  ];
  const itemFields = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'tab', type: 'uuid', meta: { interface: 'select-dropdown-m2o', sort: 3, width: 'half', required: true, translations: [{ language: 'zh-TW', translation: '所屬分頁' }], options: { template: '{{ nameEn }} {{ nameZh }}' } }, schema: {} },
    {
      field: 'type', type: 'string', meta: {
        interface: 'select-dropdown', sort: 4, width: 'half', required: true,
        translations: [{ language: 'zh-TW', translation: '類型' }],
        options: { choices: [{ text: '資訊卡（標題＋內文）', value: 'info' }, { text: '連結卡（中英兩行整卡連結）', value: 'link' }, { text: '社群 icon', value: 'social' }] },
      },
      schema: { default_value: 'info' },
    },
    { field: 'labelZh', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', conditions: HIDE_WHEN_SOCIAL, translations: [{ language: 'zh-TW', translation: '標題（中）' }], note: '資訊卡＝粗體標題列；連結卡＝第二行中文' } },
    { field: 'labelEn', type: 'string', meta: { interface: 'input', sort: 6, width: 'half', conditions: HIDE_WHEN_SOCIAL, translations: [{ language: 'zh-TW', translation: '標題（英）' }], note: '資訊卡＝粗體標題列；連結卡＝第一行英文' } },
    { field: 'textZh', type: 'text', meta: { interface: 'input-multiline', sort: 7, width: 'half', conditions: HIDE_WHEN_SOCIAL_OR_LINK, translations: [{ language: 'zh-TW', translation: '內文（中）' }], note: '資訊卡的中文內文行（如中文地址）；沒有可留空' } },
    { field: 'textEn', type: 'text', meta: { interface: 'input-multiline', sort: 8, width: 'half', conditions: HIDE_WHEN_SOCIAL_OR_LINK, translations: [{ language: 'zh-TW', translation: '內文（英）' }], note: '資訊卡的英文/數字內文行（電話號碼、Email、英文地址）' } },
    {
      field: 'icon', type: 'string', meta: {
        interface: 'select-dropdown', sort: 9, width: 'half',
        conditions: [{ name: '僅社群 icon 需要', rule: { type: { _neq: 'social' } }, hidden: true, options: {} }],
        translations: [{ language: 'zh-TW', translation: '社群平台' }],
        options: { choices: [{ text: 'YouTube', value: 'youtube' }, { text: 'Instagram', value: 'instagram' }, { text: 'Facebook', value: 'facebook' }] },
      },
    },
    { field: 'url', type: 'string', meta: { interface: 'input', sort: 10, translations: [{ language: 'zh-TW', translation: '連結網址' }], note: '連結卡/社群 icon 必填；資訊卡選填（填了內文會變成可點連結，如 mailto: 或地圖）' } },
    {
      field: 'key', type: 'string', meta: {
        interface: 'input', sort: 11, width: 'half',
        translations: [{ language: 'zh-TW', translation: '版面代號（進階）' }],
        note: '特殊排版對應用（tel / fax / email / office 有既定版面位置），一般新項目留空即可',
      },
    },
  ];
  for (const f of itemFields) await req('POST', '/fields/footer_items', f);

  // ── 3) relation（footer_items.tab → footer_tabs，O2M 清單可拖排序）──
  console.log('建立 relation...');
  await req('POST', '/relations', {
    collection: 'footer_items', field: 'tab', related_collection: 'footer_tabs',
    meta: { one_field: 'items', sort_field: 'sort', one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  });

  // ── 4) Public read permissions ─────────────────────────────
  console.log('開 Public read...');
  await req('POST', '/permissions', { collection: 'footer_tabs', action: 'read', fields: ['*'], policy: PUBLIC_POLICY });
  await req('POST', '/permissions', { collection: 'footer_items', action: 'read', fields: ['*'], policy: PUBLIC_POLICY });

  // ── 5) seed 現有內容 ────────────────────────────────────────
  console.log('匯入現有內容...');
  const mkTab = async (sort, key, mark, nameZh, nameEn) =>
    (await req('POST', '/items/footer_tabs', { sort, key, mark, nameZh, nameEn })).data.id;
  const dept = await mkTab(1, 'dept', 'sccd', '學系', 'Department');
  const aa = await mkTab(2, 'aa', 'sccdaa', '系友會', 'Alumni Association');
  const units = await mkTab(3, 'units', 'none', '關聯單位', 'Affiliated Units');

  const items = [
    // dept：social 先（手機 DOM 順序＝icons 靠上）、再 tel/fax/email/office
    { tab: dept, sort: 1, type: 'social', icon: 'youtube', url: 'https://www.youtube.com/@communicationsdesign' },
    { tab: dept, sort: 2, type: 'social', icon: 'instagram', url: 'https://www.instagram.com/communications.design_sccd' },
    { tab: dept, sort: 3, type: 'social', icon: 'facebook', url: 'https://www.facebook.com/communications.design' },
    { tab: dept, sort: 4, type: 'info', key: 'tel', labelZh: '電話', labelEn: 'TEL', textEn: '+886 2 2538 1111 #7211' },
    { tab: dept, sort: 5, type: 'info', key: 'fax', labelZh: '傳真', labelEn: 'FAX', textEn: '+886 2 2538 1111 #7050' },
    { tab: dept, sort: 6, type: 'info', key: 'email', labelZh: '電子郵件', labelEn: 'E-Mail', textEn: 'sccd@g2.usc.edu.tw', url: 'mailto:sccd@g2.usc.edu.tw' },
    { tab: dept, sort: 7, type: 'info', key: 'office', labelZh: '學系辦公室', labelEn: 'Office', textEn: '5F, Building A, No.70, Dazhi Street, Zhongshan District, Taipei City 104336, Taiwan', textZh: '104336 台灣台北市中山區大直街 70 號 A 棟 5 樓', url: 'https://maps.app.goo.gl/tj6auGPM9EwoBvBU7' },
    // aa：單一 FB
    { tab: aa, sort: 1, type: 'social', icon: 'facebook', url: 'https://www.facebook.com/groups/445872492110612' },
    // units：6 張連結卡
    { tab: units, sort: 1, type: 'link', labelEn: 'Department of Architecture', labelZh: '建築設計學系', url: 'https://www.arch.usc.edu.tw/' },
    { tab: units, sort: 2, type: 'link', labelEn: 'Bachelor Program in Architectural Craftsmanship', labelZh: '建築職人學士學位學程', url: 'https://www.arch.usc.edu.tw/' },
    { tab: units, sort: 3, type: 'link', labelEn: 'Department of Fashion Design', labelZh: '服裝設計學系', url: 'https://scfd.usc.edu.tw/' },
    { tab: units, sort: 4, type: 'link', labelEn: 'Department of Industrial Design', labelZh: '工業設計學系', url: 'https://scid.usc.edu.tw/' },
    { tab: units, sort: 5, type: 'link', labelEn: 'College of Design', labelZh: '設計學院', url: 'https://www.scdesign.usc.edu.tw/' },
    { tab: units, sort: 6, type: 'link', labelEn: 'Shih Chien University', labelZh: '實踐大學', url: 'https://www.usc.edu.tw/' },
  ];
  for (const it of items) await req('POST', '/items/footer_items', it);

  console.log('\n✅ footer_tabs + footer_items 建置＋匯入完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
