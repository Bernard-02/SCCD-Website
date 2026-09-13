// 建立「全站圖示與游標」分類資料夾 + site_icons / site_cursors 兩個 collection + Public read。
// user 2026-09-13：全站 icon 跟 cursor 集中後台一個分類、兩個 schema，可上傳更改。
// key = 檔名主幹（前台對照用，勿改）；檔案實體由 scripts/import-site-assets.cjs 匯入。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-site-assets.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}`, body ? JSON.stringify(body).slice(0, 180) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const FOLDER = 'site_assets'; // collection 分類資料夾（schema:null = folder）

async function buildCollection(col, label, note) {
  const exists = await req('GET', `/collections/${col}`).then(() => true).catch(() => false);
  if (exists) { console.log(`✓ ${col} 已存在，略過建立`); return; }
  console.log(`建立 ${col}...`);
  await req('POST', '/collections', {
    collection: col,
    meta: {
      translations: zh(label), group: FOLDER, note, icon: col === 'site_cursors' ? 'mouse' : 'interests',
      sort_field: 'sort', display_template: '{{key}}',
    },
    schema: {},
    fields: [
      { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
      { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 }, schema: {} },
      { field: 'key', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', readonly: true, translations: zh('代號 key'), note: '前台對照用識別碼，請勿修改；要換圖改下方檔案即可' }, schema: { is_nullable: false, is_unique: true } },
      { field: 'note', type: 'string', meta: { interface: 'input', sort: 4, width: 'half', translations: zh('用途說明') }, schema: {} },
    ],
  });
  // file 欄 + relation（file 欄不會自動建 relation）
  await req('POST', `/fields/${col}`, {
    field: 'file', type: 'uuid',
    meta: { special: ['file'], interface: 'file-image', sort: 5, width: 'full',
      translations: zh('圖檔（SVG）'), note: '要更換就上傳新檔取代；前台重新整理即生效' },
    schema: {},
  });
  await req('POST', '/relations', {
    collection: col, field: 'file', related_collection: 'directus_files',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  });
}

(async () => {
  // 1) 分類資料夾（schema:null 即 collection folder）
  const fExists = await req('GET', `/collections/${FOLDER}`).then(() => true).catch(() => false);
  if (fExists) console.log(`✓ 資料夾 ${FOLDER} 已存在`);
  else {
    console.log(`建立分類資料夾 ${FOLDER}...`);
    await req('POST', '/collections', {
      collection: FOLDER,
      meta: { translations: zh('全站圖示與游標'), icon: 'folder', note: '全站 UI 圖示與滑鼠游標（icons / cursors 兩個 collection）' },
      schema: null,
    });
  }

  // 2) 兩個 collection
  await buildCollection('site_icons', '全站圖示 Icons', '全站 UI 圖示（箭頭/播放鍵/mode 鈕等）；前台以 CSS mask 上色，請上傳單色黑 SVG');
  await buildCollection('site_cursors', '滑鼠游標 Cursors', '自訂滑鼠游標；熱點座標寫在前端程式，換圖建議維持相近圖形大小');

  // 3) Public read（沒開＝前台 401）
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) console.log('⚠️ 找不到 Public policy，請後台手動開讀權限');
  else for (const col of ['site_icons', 'site_cursors']) {
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${col}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log(`✓ ${col} Public read 已開`);
    else { console.log(`開 ${col} Public read...`); await req('POST', '/permissions', { policy: pub.id, collection: col, action: 'read', fields: ['*'] }); }
  }

  console.log(`\n✅ schema 完成${DRY ? '（DRY，未寫入）' : ''}。接著跑 import-site-assets.cjs 匯入檔案。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
