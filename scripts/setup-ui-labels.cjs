// 一次性建立 Directus `ui_labels` collection（全站 nav / 分頁按鈕文字的後台來源）+ 開 Public 讀 + 灌初始資料。
// 冪等：collection / 欄位 / row 已存在則跳過或更新，可重跑。
//
// 跑（repo 根目錄）：node scripts/setup-ui-labels.cjs
// token：本機讀 scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。
//
// 建完後：老師在 Directus 後台開 ui_labels，改 en / zh / group 欄即可，前台 refresh 生效。
// 前台已在跑（斷線 / 尚未建時吃 data/ui-labels.json fallback），此步驟只是把來源切到後台。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線，比照 generate-library-covers.cjs
const fs = require('fs');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const COLLECTION = 'ui_labels';

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const body = await res.text();
  let json; try { json = JSON.parse(body); } catch { json = body; }
  return { ok: res.ok, status: res.status, json };
};

async function main() {
  // 1) collection（不存在才建；id 自增 PK）
  const exists = await api(`/collections/${COLLECTION}`);
  if (exists.ok) {
    console.log(`✓ collection ${COLLECTION} 已存在，略過建立`);
  } else {
    const r = await api('/collections', {
      method: 'POST',
      body: JSON.stringify({
        collection: COLLECTION,
        meta: { note: '全站 nav / 分頁按鈕文字（curriculum 組別 / about / faculty）', sort_field: 'sort' },
        schema: {},
        fields: [
          { field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
          { field: 'key',   type: 'string',  meta: { interface: 'input', note: '程式對位用的固定鍵，勿改（唯讀）', width: 'half', readonly: true }, schema: { is_unique: true } },
          { field: 'en',    type: 'string',  meta: { interface: 'input', note: '英文', width: 'half' } },
          { field: 'zh',    type: 'string',  meta: { interface: 'input', note: '中文' } },
          { field: 'sort',  type: 'integer', meta: { interface: 'input', hidden: true } },
        ],
      }),
    });
    if (!r.ok) { console.error('✗ 建 collection 失敗', r.status, r.json); process.exit(1); }
    console.log(`✓ 建立 collection ${COLLECTION}`);
  }

  // 2) Public read 權限。Directus 11 permission 掛在 policy 不掛 role → 先找 Public policy
  //    （name 是 i18n key "$t:public_label"、admin_access:false、app_access:false 那顆）。
  const pols = await api('/policies?limit=100&fields=id,name,admin_access,app_access');
  const pub = (pols.json?.data || []).find(p => p.name === '$t:public_label')
    || (pols.json?.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) {
    console.error('✗ 找不到 Public policy，請去後台 Settings > Access Policies > Public 手動加 ui_labels 讀權限');
  } else {
    const perms = await api(`/permissions?filter[collection][_eq]=${COLLECTION}&filter[action][_eq]=read`);
    const has = (perms.json?.data || []).some(p => p.policy === pub.id);
    if (has) {
      console.log('✓ Public read 已開，略過');
    } else {
      const r = await api('/permissions', {
        method: 'POST',
        body: JSON.stringify({ policy: pub.id, collection: COLLECTION, action: 'read', fields: ['*'] }),
      });
      if (!r.ok) { console.error('✗ 開 Public read 失敗（可去後台 Public policy 手動開）', r.status, r.json); }
      else console.log('✓ 開 Public read');
    }
  }

  // 3) 灌 / 更新資料（依 key upsert）
  const rows = JSON.parse(fs.readFileSync('data/ui-labels.json', 'utf8')).data;
  const cur = await api(`/items/${COLLECTION}?limit=-1&fields=id,key`);
  const idByKey = Object.fromEntries((cur.json?.data || []).map(r => [r.key, r.id]));

  let created = 0, updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = { ...rows[i], sort: i };
    const id = idByKey[row.key];
    const r = id
      ? await api(`/items/${COLLECTION}/${id}`, { method: 'PATCH', body: JSON.stringify(row) })
      : await api(`/items/${COLLECTION}`, { method: 'POST', body: JSON.stringify(row) });
    if (!r.ok) { console.error(`✗ ${row.key}`, r.status, r.json); continue; }
    id ? updated++ : created++;
  }
  console.log(`✓ 資料：新增 ${created}、更新 ${updated}（共 ${rows.length}）`);
  console.log('完成。前台會優先讀後台 ui_labels，斷線退 data/ui-labels.json。');
}

main().catch(e => { console.error(e); process.exit(1); });
