/**
 * 給 regulations.points.items（巢狀 repeater）的子欄補「中文顯示名」＋承辦單位加提示。
 *
 * 背景：titleEn/titleZh/unitEn/unitZh 四個子欄都沒有 name（後台抽屜只顯示原始欄名 unitEn/unitZh，
 *   老師易漏填 → 前台承辦單位一直是預設 SCCD Office/系辦；user 2026-09-12「後台改了前台沒變」的真因）。
 *   前台管線本身正確（legal-data-loader.regTableEntry 讀 points[].items[].unitEn/unitZh），只是欄位難找。
 *
 *   node scripts/label-regulations-item-fields.cjs --dry   # 只看不寫
 *   node scripts/label-regulations-item-fields.cjs         # 寫線上 test CMS（idempotent）
 *
 * 機制見 memory reference_directus_schema_api_scripts_token：改 repeater 子欄＝
 * GET /fields → 改 meta.options.fields → PATCH /fields/{col}/{field} 整包 meta 回寫。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

// 目標子欄的顯示名（idempotent：已一致就跳過）＋承辦單位補 placeholder 提示預設值
const LABELS = {
  titleEn: { name: '規章名稱（英）' },
  titleZh: { name: '規章名稱（中）' },
  unitEn: { name: '承辦單位（英）', placeholder: '留空＝前台顯示 SCCD Office' },
  unitZh: { name: '承辦單位（中）', placeholder: '留空＝前台顯示 系辦' },
};

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
  let changed = 0;
  subFields.forEach(sf => {
    const spec = LABELS[sf.field];
    if (!spec) return;
    if (sf.name !== spec.name) { sf.name = spec.name; changed++; }
    if (spec.placeholder) {
      sf.meta = sf.meta || {};
      sf.meta.options = sf.meta.options || {};
      if (sf.meta.options.placeholder !== spec.placeholder) { sf.meta.options.placeholder = spec.placeholder; changed++; }
    }
  });

  if (!changed) { console.log('✓ 顯示名已一致，無需變更'); return; }
  console.log((DRY ? '[dry] 將' : '') + `更新 ${changed} 項 → 子欄顯示名：`);
  subFields.forEach(sf => console.log(`   ${sf.field} → ${sf.name || '(無名)'}${sf.meta?.options?.placeholder ? '  · ' + sf.meta.options.placeholder : ''}`));
  if (DRY) return;

  const res = await fetch(`${BASE}/fields/regulations/points`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ meta: field.meta }),
  });
  console.log(res.ok ? '✓ 更新子欄顯示名成功' : `✗ HTTP ${res.status}\n${await res.text()}`);
})();
