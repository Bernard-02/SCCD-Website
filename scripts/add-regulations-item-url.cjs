/**
 * 給 regulations.points.items（巢狀 repeater）加一個選填 `url` 子欄。
 * 老師在後台每筆規章可填連結 → 前台規章名變外部連結（見 legal-data-loader.renderRegLine）。
 *
 *   node scripts/add-regulations-item-url.cjs --dry   # 只看不寫
 *   node scripts/add-regulations-item-url.cjs         # 寫線上 test CMS
 *
 * 機制見 memory reference_directus_schema_api_scripts_token：改 repeater 子欄＝
 * GET /fields → 改 meta.options.fields → PATCH /fields/{col}/{field} 整包 meta 回寫。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

function getToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN.trim();
  const f = path.join(__dirname, '.directus-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('✗ 找不到 token（scripts/.directus-token 或 DIRECTUS_TOKEN）');
  process.exit(1);
}

(async () => {
  const H = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  const field = await fetch(`${BASE}/fields/regulations/points`, { headers: H }).then(r => r.json()).then(j => j.data);
  const itemsField = (field.meta?.options?.fields || []).find(f => f.field === 'items');
  if (!itemsField) { console.error('✗ 找不到 points.items 子欄'); process.exit(1); }

  const subFields = itemsField.meta.options.fields;
  if (subFields.some(f => f.field === 'url')) {
    console.log('✓ points.items.url 已存在，跳過');
    return;
  }

  subFields.push({
    field: 'url',
    type: 'string',
    name: '連結 URL（選填）',
    meta: { field: 'url', type: 'string', interface: 'input', width: 'full',
            options: { placeholder: 'https://…（填了前台規章名就可點擊跳轉）' } },
  });

  console.log(DRY ? '[dry] 將 PATCH points，items 子欄改為：' : 'PATCH points…');
  console.log(subFields.map(f => f.field).join(', '));
  if (DRY) return;

  const res = await fetch(`${BASE}/fields/regulations/points`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ meta: field.meta }),
  });
  console.log(res.ok ? '✓ 加入 url 子欄成功' : `✗ HTTP ${res.status}\n${await res.text()}`);
})();
