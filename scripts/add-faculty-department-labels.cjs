// 一次性：把 faculty slide-in 系所全名的兩個 ui_labels key 建進 Directus（讓老師能在後台 GUI 改 en/zh）。
// 安全版：只 POST 這兩個 key、已存在則跳過，絕不 PATCH/覆蓋其他 row（不像 setup-ui-labels.cjs 會重推全部）。
// en/zh 取自 data/ui-labels.json（單一來源），要改預設值改那份即可。
//
// 跑（repo 根目錄）：node scripts/add-faculty-department-labels.cjs
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線（同 setup-ui-labels.cjs）
const fs = require('fs');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdtest.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const COLLECTION = 'ui_labels';
const TARGET_KEYS = ['faculty.department.dcd', 'faculty.department.bpaidc'];

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const body = await res.text();
  let json; try { json = JSON.parse(body); } catch { json = body; }
  return { ok: res.ok, status: res.status, json };
};

async function main() {
  const all = JSON.parse(fs.readFileSync('data/ui-labels.json', 'utf8')).data;
  const rows = TARGET_KEYS.map(k => all.find(r => r.key === k)).filter(Boolean);
  if (rows.length !== TARGET_KEYS.length) {
    console.error('✗ data/ui-labels.json 缺少目標 key，請確認：', TARGET_KEYS);
    process.exit(1);
  }

  const cur = await api(`/items/${COLLECTION}?limit=-1&fields=key`);
  if (!cur.ok) { console.error('✗ 讀取現有 ui_labels 失敗', cur.status, cur.json); process.exit(1); }
  const existing = new Set((cur.json?.data || []).map(r => r.key));

  let created = 0, skipped = 0;
  for (const row of rows) {
    if (existing.has(row.key)) { console.log(`↷ 已存在，跳過：${row.key}`); skipped++; continue; }
    const r = await api(`/items/${COLLECTION}`, { method: 'POST', body: JSON.stringify({ key: row.key, en: row.en, zh: row.zh }) });
    if (!r.ok) { console.error(`✗ ${row.key}`, r.status, r.json); continue; }
    console.log(`✓ 新增：${row.key}  |  ${row.en} / ${row.zh}`);
    created++;
  }
  console.log(`\n完成：新增 ${created}、跳過 ${skipped}。之後可在 Directus 後台 ui_labels 改這兩筆的 en/zh（key 唯讀）。`);
}

main().catch(e => { console.error(e); process.exit(1); });
