// 建立 site_settings（全站設定 singleton）＋ favicon 上傳欄（directus_files）＋ Public read。
// user 2026-09-09：favicon 改後台可上傳、之後好改；老師自己上傳（本腳本不 seed 值）。
// 之後全站級設定（og-image 等）都加在這個 singleton。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-site-settings.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'site_settings';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}`, body ? JSON.stringify(body).slice(0, 180) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  // 1) collection（singleton，不存在才建）
  const exists = await req('GET', `/collections/${COL}`).then(() => true).catch(() => false);
  if (exists) console.log(`✓ ${COL} 已存在，略過建立`);
  else {
    console.log(`建立 ${COL}（singleton）...`);
    await req('POST', '/collections', {
      collection: COL,
      meta: { translations: zh('全站設定 Site Settings'), singleton: true, note: '全站級設定（favicon 等）；一筆', icon: 'settings' },
      schema: {},
      fields: [
        { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
      ],
    });
  }

  // 2) favicon 欄（已存在則 400 → 容錯略過）
  console.log('欄位 favicon...');
  await req('POST', `/fields/${COL}`, {
    field: 'favicon', type: 'uuid',
    meta: { special: ['file'], interface: 'file-image', sort: 2, width: 'half',
      translations: zh('網站圖示 favicon'), note: '瀏覽器分頁小圖示；建議 .svg 或 .png（正方）；改了前台硬重整生效' },
    schema: {},
  }).catch(e => console.log(`  （略過：${e.message.slice(0, 90)}）`));

  // 3) favicon relation → directus_files（file 欄不會自動建 relation）
  // （曾有 favicon_dark 深色欄，09-10 定案單張自帶底、已刪——tab 底色偵測不到，別加回）
  const rel = DRY ? { data: [] } : await req('GET', `/relations/${COL}`).catch(() => ({ data: [] }));
  if (!(rel.data || []).some(r => r.field === 'favicon')) {
    console.log('補建 favicon relation...');
    await req('POST', '/relations', {
      collection: COL, field: 'favicon', related_collection: 'directus_files',
      meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    });
  }

  // 4) Public read（沒開＝前台 401）
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) console.log('⚠️ 找不到 Public policy，請後台手動開 site_settings 讀權限');
  else {
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${COL}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log('✓ Public read 已開');
    else { console.log('開 Public read...'); await req('POST', '/permissions', { policy: pub.id, collection: COL, action: 'read', fields: ['*'] }); }
  }

  console.log(`\n✅ ${COL} 完成${DRY ? '（DRY，未寫入）' : ''}。老師到 Directus site_settings 上傳 favicon 即生效。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
