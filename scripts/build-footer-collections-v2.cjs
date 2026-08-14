// footer 內容 collections v2（2026-08-11 user 回饋重構）：
//   - footer 集合資料夾（group）內含 footer_tabs / footer_items（sidebar 隱藏，tab-first）；Legal 資料夾也嵌在其下
//     （法務連結前台寫死，不建 footer_legal collection）
//   - 項目類型 info / phone(國碼+號碼+分機) / address(前台自動生 map link) / link / social
//   - 圖示資料庫：Directus Files「Site Icons」資料夾，tab 標誌與社群 icon 都從此夾選（file UUID）
// schema 破壞性重建（footer_tabs/items 是 08-11 新建、無正式資料）：先刪再建。icons 資料夾/檔案 idempotent 重用。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-footer-collections-v2.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const authH = { Authorization: 'Bearer ' + token };
const jsonH = { ...authH, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

async function req(method, urlPath, body, { ignoreMissing } = {}) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 140) + '…' : ''); return { data: { id: 'dry-id' } }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  if ((res.status === 404 || res.status === 403) && ignoreMissing) return null;   // Directus 對不存在的 collection 回 403
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// ── 圖示上傳（idempotent：Site Icons 資料夾 + 依 title 重用既有檔）──
async function ensureIconsFolder() {
  const existing = await req('GET', '/folders?filter[name][_eq]=Site%20Icons&limit=1');
  if (existing && existing.data && existing.data.length) return existing.data[0].id;
  const created = await req('POST', '/folders', { name: 'Site Icons' });
  return created.data.id;
}
async function uploadIcon(folderId, filePath, title) {
  if (DRY) { console.log(`[dry] upload ${title} ← ${filePath}`); return 'dry-file-' + title; }
  const found = await req('GET', `/files?filter[folder][_eq]=${folderId}&filter[title][_eq]=${encodeURIComponent(title)}&limit=1`);
  if (found && found.data && found.data.length) { console.log(`  重用既有檔 ${title}`); return found.data[0].id; }
  const form = new FormData();
  form.append('folder', folderId);
  form.append('title', title);
  form.append('file', new Blob([fs.readFileSync(filePath)], { type: 'image/svg+xml' }), path.basename(filePath));
  const res = await fetch(`${BASE}/files`, { method: 'POST', headers: authH, body: form });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`upload ${title} → ${res.status} ${JSON.stringify(out).slice(0, 200)}`);
  console.log(`  上傳 ${title} → ${out.data.id}`);
  return out.data.id;
}

const PK = (sort) => ({ field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: sort || 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } });
const zh = (t) => [{ language: 'zh-TW', translation: t }];
// 圖示 file 欄（限定 Site Icons 資料夾、只給 SVG）
const iconField = (name, label, sort, conditions) => ({
  field: name, type: 'uuid', meta: {
    special: ['file'], interface: 'file', sort, width: 'half', translations: zh(label),
    options: { folder: '__ICONS_FOLDER__' }, conditions,
    note: '從「Site Icons」資料夾選；請上傳單色 SVG（前台以 mask 依 mode 自動上色）',
  },
});

(async () => {
  // 0) 圖示資料夾 + 上傳 5 個 SVG
  console.log('圖示資料庫...');
  const iconsFolder = await ensureIconsFolder();
  const ICON = {
    sccd:      await uploadIcon(iconsFolder, 'images/SCCD - Black.svg', 'SCCD wordmark'),
    sccdaa:    await uploadIcon(iconsFolder, 'images/SCCDAA Logo 20260810.svg', 'SCCDAA wordmark'),
    youtube:   await uploadIcon(iconsFolder, 'website-icons/youtube.svg', 'YouTube'),      // badge 版（實心方塊+鏤空，非 _glyph 裸圖示）
    instagram: await uploadIcon(iconsFolder, 'website-icons/instagram.svg', 'Instagram'),
    facebook:  await uploadIcon(iconsFolder, 'website-icons/facebook.svg', 'Facebook'),
  };
  const withFolder = (obj) => JSON.parse(JSON.stringify(obj).replace('__ICONS_FOLDER__', iconsFolder));

  // 1) 刪舊（items 先，含 relation）
  console.log('刪舊 collections...');
  await req('DELETE', '/collections/footer_items', null, { ignoreMissing: true });
  await req('DELETE', '/collections/footer_tabs', null, { ignoreMissing: true });

  // 2) footer 集合資料夾（group divider：schema null）
  console.log('建 footer 集合資料夾...');
  await req('POST', '/collections', { collection: 'footer', meta: { translations: zh('頁尾 Footer'), icon: 'call_to_action', collapse: 'open' }, schema: null });

  // 3) footer_tabs
  console.log('建 footer_tabs...');
  await req('POST', '/collections', {
    collection: 'footer_tabs',
    meta: { translations: zh('頁尾分頁'), group: 'footer', sort_field: 'sort', note: '頁尾左上的分頁按鈕；拖曳排序＝顯示順序，第一個＝預設分頁', accountability: 'all' },
    schema: {}, fields: [PK(1)],
  });
  for (const f of [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'key', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', required: true, translations: zh('代號（英文小寫）'), note: '前台識別用，如 dept / aa / units；建立後勿隨意更改' } },
    { field: 'nameZh', type: 'string', meta: { interface: 'input', sort: 4, width: 'half', required: true, translations: zh('名稱（中）') } },
    { field: 'nameEn', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', required: true, translations: zh('名稱（英）') } },
    withFolder(iconField('markIcon', '分頁標誌（wordmark，選填）', 6)),
    { field: 'items', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', sort: 7, translations: zh('分頁內項目（拖曳排序）'), options: { template: '{{ type }}｜{{ labelEn }} {{ labelZh }}', enableSelect: false } } },
  ]) await req('POST', '/fields/footer_tabs', f);

  // 4) footer_items（sidebar 隱藏＝tab-first；type 分流欄位）
  console.log('建 footer_items...');
  await req('POST', '/collections', {
    collection: 'footer_items',
    meta: { translations: zh('頁尾項目'), group: 'footer', hidden: true, sort_field: 'sort', note: '請從「頁尾分頁」的項目清單內新增與拖曳', accountability: 'all' },
    schema: {}, fields: [PK(1)],
  });
  const showWhen = (types) => [{ name: '此類型隱藏', rule: { type: { _nin: types } }, hidden: true, options: {} }];
  for (const f of [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 } },
    { field: 'tab', type: 'uuid', meta: { interface: 'select-dropdown-m2o', sort: 3, width: 'half', required: true, translations: zh('所屬分頁'), options: { template: '{{ nameEn }} {{ nameZh }}' } }, schema: {} },
    {
      field: 'type', type: 'string', meta: {
        interface: 'select-dropdown', sort: 4, width: 'half', required: true, translations: zh('類型'),
        options: { choices: [
          { text: '資訊（標題＋內文）', value: 'info' },
          { text: '電話／傳真（國碼＋號碼＋分機）', value: 'phone' },
          { text: '地址（自動產生地圖連結）', value: 'address' },
          { text: '連結卡（整卡連結，中英兩行）', value: 'link' },
          { text: '社群圖示', value: 'social' },
        ] },
      }, schema: { default_value: 'info' },
    },
    { field: 'labelZh', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', conditions: showWhen(['info', 'phone', 'address', 'link']), translations: zh('標題（中）'), note: '資訊/電話/地址＝粗體標題；連結卡＝第二行中文' } },
    { field: 'labelEn', type: 'string', meta: { interface: 'input', sort: 6, width: 'half', conditions: showWhen(['info', 'phone', 'address', 'link']), translations: zh('標題（英）'), note: '資訊/電話/地址＝粗體標題；連結卡＝第一行英文' } },
    { field: 'textEn', type: 'text', meta: { interface: 'input-multiline', sort: 7, width: 'half', conditions: showWhen(['info', 'address']), translations: zh('內文／地址（英）'), note: '資訊內文，或英文地址（地址類型會據此自動產生 Google 地圖連結）' } },
    { field: 'textZh', type: 'text', meta: { interface: 'input-multiline', sort: 8, width: 'half', conditions: showWhen(['info', 'address']), translations: zh('內文／地址（中）') } },
    { field: 'phoneCountry', type: 'string', meta: { interface: 'input', sort: 9, width: 'half', conditions: showWhen(['phone']), translations: zh('國碼'), note: '如 +886' } },
    { field: 'phoneNumber', type: 'string', meta: { interface: 'input', sort: 10, width: 'half', conditions: showWhen(['phone']), translations: zh('號碼'), note: '如 2 2538 1111' } },
    { field: 'phoneExt', type: 'string', meta: { interface: 'input', sort: 11, width: 'half', conditions: showWhen(['phone']), translations: zh('分機（選填）'), note: '如 7211' } },
    withFolder(iconField('iconFile', '社群圖示', 12, showWhen(['social']))),
    { field: 'url', type: 'string', meta: { interface: 'input', sort: 13, conditions: showWhen(['info', 'link', 'social']), translations: zh('連結網址'), note: '連結卡／社群必填；資訊選填（如 mailto:）。地址類型免填＝自動生成地圖連結' } },
    { field: 'itemKey', type: 'string', meta: { interface: 'input', sort: 14, width: 'half', conditions: showWhen(['info', 'phone', 'address']), translations: zh('版面代號（進階，選填）'), note: 'tel/fax/email/office 有既定版面位置；一般新項目留空' } },
  ]) await req('POST', '/fields/footer_items', f);

  // 法務連結（Donate/規章/政策）＝前台寫死 3 個固定站內頁（footer-content.js LEGAL const），不建 collection。

  // 5) relation + permissions
  console.log('relation + 權限...');
  await req('POST', '/relations', { collection: 'footer_items', field: 'tab', related_collection: 'footer_tabs', meta: { one_field: 'items', sort_field: 'sort', one_deselect_action: 'nullify' }, schema: { on_delete: 'SET NULL' } });
  // ⚠️file 欄（special:['file']）不會自動建 relation → 後台 file interface 顯示「No File Selected」且選檔存不進；必須補 relation 到 directus_files
  for (const [c, f] of [['footer_items', 'iconFile'], ['footer_tabs', 'markIcon']])
    await req('POST', '/relations', { collection: c, field: f, related_collection: 'directus_files', meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' }, schema: { on_delete: 'SET NULL' } });
  for (const c of ['footer_tabs', 'footer_items']) await req('POST', '/permissions', { collection: c, action: 'read', fields: ['*'], policy: PUBLIC_POLICY });

  // 7) seed
  console.log('匯入內容...');
  const mkTab = async (sort, key, mark, nameZh, nameEn) => (await req('POST', '/items/footer_tabs', { sort, key, nameZh, nameEn, markIcon: mark })).data.id;
  const dept = await mkTab(1, 'dept', ICON.sccd, '學系', 'Department');
  const aa = await mkTab(2, 'aa', ICON.sccdaa, '系友會', 'Alumni Association');
  const units = await mkTab(3, 'units', null, '關聯單位', 'Affiliated Units');
  const items = [
    { tab: dept, sort: 1, type: 'social', iconFile: ICON.youtube, url: 'https://www.youtube.com/@communicationsdesign' },
    { tab: dept, sort: 2, type: 'social', iconFile: ICON.instagram, url: 'https://www.instagram.com/communications.design_sccd' },
    { tab: dept, sort: 3, type: 'social', iconFile: ICON.facebook, url: 'https://www.facebook.com/communications.design' },
    { tab: dept, sort: 4, type: 'phone', itemKey: 'tel', labelZh: '電話', labelEn: 'TEL', phoneCountry: '+886', phoneNumber: '2 2538 1111', phoneExt: '7211' },
    { tab: dept, sort: 5, type: 'phone', itemKey: 'fax', labelZh: '傳真', labelEn: 'FAX', phoneCountry: '+886', phoneNumber: '2 2538 1111', phoneExt: '7050' },
    { tab: dept, sort: 6, type: 'info', itemKey: 'email', labelZh: '電子郵件', labelEn: 'E-Mail', textEn: 'sccd@g2.usc.edu.tw', url: 'mailto:sccd@g2.usc.edu.tw' },
    { tab: dept, sort: 7, type: 'address', itemKey: 'office', labelZh: '學系辦公室', labelEn: 'Office', textEn: '5F, Building A, No.70, Dazhi Street, Zhongshan District, Taipei City 104336, Taiwan', textZh: '104336 台灣台北市中山區大直街 70 號 A 棟 5 樓' },
    { tab: aa, sort: 1, type: 'social', iconFile: ICON.facebook, url: 'https://www.facebook.com/groups/445872492110612' },
    { tab: units, sort: 1, type: 'link', labelEn: 'Department of Architecture', labelZh: '建築設計學系', url: 'https://www.arch.usc.edu.tw/' },
    { tab: units, sort: 2, type: 'link', labelEn: 'Bachelor Program in Architectural Craftsmanship', labelZh: '建築職人學士學位學程', url: 'https://www.arch.usc.edu.tw/' },
    { tab: units, sort: 3, type: 'link', labelEn: 'Department of Fashion Design', labelZh: '服裝設計學系', url: 'https://scfd.usc.edu.tw/' },
    { tab: units, sort: 4, type: 'link', labelEn: 'Department of Industrial Design', labelZh: '工業設計學系', url: 'https://scid.usc.edu.tw/' },
    { tab: units, sort: 5, type: 'link', labelEn: 'College of Design', labelZh: '設計學院', url: 'https://www.scdesign.usc.edu.tw/' },
    { tab: units, sort: 6, type: 'link', labelEn: 'Shih Chien University', labelZh: '實踐大學', url: 'https://www.usc.edu.tw/' },
  ];
  for (const it of items) await req('POST', '/items/footer_items', it);

  console.log('\n✅ footer v2（folder + tabs + items + 圖示資料庫）建置＋匯入完成。');
  console.log('   ICON UUIDs:', JSON.stringify(ICON));
})().catch(e => { console.error('❌', e.message); process.exit(1); });
