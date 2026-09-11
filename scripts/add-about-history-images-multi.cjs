// about_history 照片改「多張一次拖上傳」：about_history_images 從「每列一張 image」改成 images（files M2M）。
// collection 目前 0 筆 → 直接刪舊 single image 欄、加 images M2M（junction PK 用 special uuid，避免 about_class_files 那個
// 「ID required」坑，見 reference_directus_files_m2m_junction_pk_uuid）。結構照抄現有可用的 about_class.images。
// idempotent；先 --dry 看步驟。跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-about-history-images-multi.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const B = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';
const PARENT = 'about_history_images';
const JUNC = 'about_history_images_files';

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(B + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}
const exists = (path) => req('GET', path).then(() => true).catch(() => false);
async function ensurePublicRead(col) {
  const q = `/permissions?filter[collection][_eq]=${col}&filter[policy][_eq]=${PUBLIC_POLICY}&filter[action][_eq]=read&limit=1`;
  const has = DRY ? false : ((await req('GET', q).catch(() => ({ data: [] }))).data || []).length > 0;
  if (has) { console.log(`  ${col} public read 已存在`); return; }
  console.log(`  開 ${col} public read...`);
  await req('POST', '/permissions', { collection: col, action: 'read', fields: ['*'], policy: PUBLIC_POLICY });
}

(async () => {
  // 1) alias field images（可多張）
  if (!(await exists(`/fields/${PARENT}/images`))) {
    console.log('建 alias field images...');
    await req('POST', `/fields/${PARENT}`, { field: 'images', type: 'alias', meta: { special: ['files'], interface: 'files', width: 'full', sort: 3, translations: [{ language: 'zh-TW', translation: '照片（可多張）' }], note: '沿革照片，可一次拖多張；順序＝拖曳順序' } });
  } else console.log('images field 已存在，略過');

  // 2) junction collection（id 用 special uuid ＝ 自動產生，避免上傳報 ID required）
  if (!(await exists(`/collections/${JUNC}`))) {
    console.log('建 junction collection...');
    await req('POST', '/collections', {
      collection: JUNC, meta: { hidden: true, icon: 'import_export' }, schema: {},
      fields: [
        { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
        { field: `${PARENT}_id`, type: 'uuid', schema: {}, meta: { hidden: true } },
        { field: 'directus_files_id', type: 'uuid', schema: {}, meta: { hidden: true } },
        { field: 'sort', type: 'integer', meta: { hidden: true } },
      ],
    });
  } else console.log('junction 已存在，略過');

  // 3) relations（照抄 about_class_files；weak server 可能 502→逐條 idempotent 重跑補）
  const rels = ((await req('GET', `/relations/${JUNC}`).catch(() => ({ data: [] }))).data) || [];
  if (!rels.some(r => r.field === `${PARENT}_id`)) {
    console.log('建 relation parent...');
    await req('POST', '/relations', { collection: JUNC, field: `${PARENT}_id`, related_collection: PARENT, meta: { one_field: 'images', junction_field: 'directus_files_id', sort_field: 'sort', one_deselect_action: 'nullify' }, schema: { on_delete: 'CASCADE' } });
  } else console.log('relation parent 已存在');
  if (!rels.some(r => r.field === 'directus_files_id')) {
    console.log('建 relation files...');
    await req('POST', '/relations', { collection: JUNC, field: 'directus_files_id', related_collection: 'directus_files', meta: { junction_field: `${PARENT}_id`, one_deselect_action: 'nullify' }, schema: { on_delete: 'CASCADE' } });
  } else console.log('relation files 已存在');

  // 4) public read（junction 必開否則前台讀不到 nested images；順手補 about_class_files 確保 class 圖也顯示）
  console.log('public read:');
  await ensurePublicRead(JUNC);
  await ensurePublicRead('about_class_files');

  // 5) 刪舊 single image 欄（0 筆，安全）
  if (await exists(`/fields/${PARENT}/image`)) {
    console.log('刪舊 single image 欄...');
    await req('DELETE', `/fields/${PARENT}/image`);
  } else console.log('舊 image 欄已無，略過');

  console.log('\n✅ done');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
