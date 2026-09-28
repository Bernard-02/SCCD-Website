// 建立 redirects（短網址）collection ＋ Public read。
// user 2026-09-27：後台填 slug → sccd.usc.edu.tw/<slug> 就跳到 target_url。
// 前台在 router.js 找不到路由時查這張表（前端跳轉，非 server 302；見 router.js tryShortLink）。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-redirects.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'redirects';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}\n${JSON.stringify(body, null, 2)}\n`); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  // 1) collection（不存在才建）
  const exists = await req('GET', `/collections/${COL}`).then(() => true).catch(() => false);
  if (exists) console.log(`✓ ${COL} 已存在，略過建立`);
  else {
    console.log(`建立 ${COL}...`);
    await req('POST', '/collections', {
      collection: COL,
      meta: {
        translations: zh('短網址 Redirects'), icon: 'link', display_template: '/{{slug}} → {{target_url}}',
        note: 'sccd.usc.edu.tw/短網址 → 跳到目標網址；存檔後即生效',
      },
      schema: {},
      fields: [
        { field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
        // 前台只認小寫英數與 -（router.js 同規則）；後台先擋，免得存了一個永遠連不到的
        { field: 'slug', type: 'string', meta: {
            interface: 'input', sort: 2, width: 'half', required: true, translations: zh('短網址'),
            note: '只能用小寫英文、數字、- ；例：openhouse → sccd.usc.edu.tw/openhouse。不可與現有頁面同名（about、faculty…，同名時頁面優先）',
            validation: { slug: { _regex: '^[a-z0-9-]+$' } }, validation_message: '只能用小寫英文、數字、-',
          }, schema: { is_nullable: false, is_unique: true } },
        { field: 'target_url', type: 'string', meta: {
            interface: 'input', sort: 3, width: 'full', required: true, translations: zh('目標網址'),
            note: '要跳去的完整網址，須以 https:// 或 http:// 開頭',
            validation: { target_url: { _regex: '^https?://' } }, validation_message: '須以 https:// 或 http:// 開頭',
          }, schema: { is_nullable: false, length: 2000 } },
      ],
    });
  }

  // 2) Public read（沒開＝前台 401）
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) console.log(`⚠️ 找不到 Public policy，請後台手動開 ${COL} 讀權限`);
  else {
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${COL}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log('✓ Public read 已開');
    else { console.log('開 Public read...'); await req('POST', '/permissions', { policy: pub.id, collection: COL, action: 'read', fields: ['slug', 'target_url'] }); }
  }

  console.log(`\n✅ ${COL} 完成${DRY ? '（DRY，未寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
