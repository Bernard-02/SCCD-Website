// 把 about/curriculum 的 BFA 學制相關 ui_labels 的 EN 改成「完整名稱」（對齊 about 學制樹狀圖硬編全名）。
// zh 已是完整（學士班/動畫影像設計組…）不動；只改 en。local json + Directus 同步。
// idempotent、可重跑；先看：node scripts/update-bfa-labels-fullname.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

// 短名 → 完整名（EN）。套用到 about.* 與 curriculum.* 同名 key。
const FULL_EN = {
  'group.bfa':              'Bachelor of Fine Art (BFA)',
  'program.animation':      'Division of Animation & Moving Image',
  'program.creative-media': 'Division of Creative Media Design',
  'program.mdes':           'Master of Design (MDES)',
};
const PREFIXES = ['about.', 'curriculum.'];
const TARGETS = {};
for (const p of PREFIXES) for (const [k, en] of Object.entries(FULL_EN)) TARGETS[p + k] = en;

const api = async (method, path, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path} ${body ? JSON.stringify(body) : ''}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

(async () => {
  // 本地 data/ui-labels.json 由 Edit 直接改（保留對齊格式）；此腳本只同步 Directus。
  console.log('【Directus ui_labels】（依 key 找 id 再 PATCH en）');
  const rows = (await api('GET', '/items/ui_labels?limit=-1&fields=id,key,en')).data || [];
  for (const [key, en] of Object.entries(TARGETS)) {
    const r = rows.find(x => x.key === key);
    if (!r) { console.log(`  ⚠ 後台無此 key，跳過：${key}`); continue; }
    if (r.en === en) { console.log(`  ↷ ${key} 已是完整名，跳過`); continue; }
    await api('PATCH', `/items/ui_labels/${r.id}`, { en });
    console.log(`  ✎ ${key}: "${r.en}" → "${en}"`);
  }
  console.log(DRY ? '\n[dry] 預覽，未寫入。' : '\n✅ 完成。前台硬重整即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
