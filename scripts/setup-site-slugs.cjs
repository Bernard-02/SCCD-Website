// 後台「網址 slug」表（site_slugs）：建表＋開 Public 讀取＋補上還沒有的列。前台 js/config/slugs.js 讀它蓋過預設值。
// 安全版：只「新增」——表／欄位／權限已存在就跳過、列已存在就跳過，絕不改老師在後台填的 slug。
// 之後前台多了新的頁面或分頁（SLUG_DEFAULTS 加 key）→ 重跑本檔補列。
//
// 先看會做什麼：node scripts/setup-site-slugs.cjs --dry
// 真的做：      node scripts/setup-site-slugs.cjs
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線
const fs = require('fs');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdadmin.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const COLLECTION = 'site_slugs';
const DRY = process.argv.includes('--dry');

const api = async (method, path, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}${body && body.key ? '  ' + body.key + ' → ' + body.slug : ''}`); return { ok: true, status: 200, json: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
};

// 預設值的唯一來源＝前台 js/config/slugs.js 的 SLUG_DEFAULTS（純物件字面值，直接取出來）
const src = fs.readFileSync('js/config/slugs.js', 'utf8');
const m = src.match(/export const SLUG_DEFAULTS = (\{[\s\S]*?\n\});/);
if (!m) { console.error('✗ js/config/slugs.js 裡找不到 SLUG_DEFAULTS'); process.exit(1); }
const DEFAULTS = Function(`return (${m[1]});`)();

// 給後台看的說明（這一列是哪一頁／哪個分頁）。沒列到的 key 直接顯示 key
const NAMES = {
  'page.about': '頁面｜About 關於',
  'page.faculty': '頁面｜Faculty 師資',
  'page.curriculum': '頁面｜Curriculum 課程',
  'page.activities': '頁面｜Activities 動態',
  'page.admission': '頁面｜Admissions 入學',
  'page.degree-show-detail': '頁面｜Degree Show 畢業展（單屆）',
  'page.library': '頁面｜Library 檔案館',
  'page.atlas': '頁面｜World 世界',
  'page.generate': '頁面｜CREATE! 創造！',
  'page.alumni': '頁面｜Alumni Association 系友會',
  'page.support': '頁面｜Donate 捐贈',
  'page.regulations': '頁面｜Regulations & Policy 規章與政策',
  'page.sitemap': '頁面｜Site Map 網站導覽',
  'faculty.fulltime': 'Faculty 分頁｜Full-time Professors 專任教師',
  'faculty.parttime': 'Faculty 分頁｜Part-time Professors 兼任教師',
  'faculty.admin': 'Faculty 分頁｜Administrators 行政管理',
  'faculty.founder': 'Faculty 分頁｜Founder 創辦人',
  'curriculum.bfa-animation': 'Curriculum 分頁｜BFA Animation & Moving Image 動畫影像設計組',
  'curriculum.bfa-cmd': 'Curriculum 分頁｜BFA Creative Media Design 創意媒體設計組',
  'curriculum.mdes': 'Curriculum 分頁｜MDES 碩士班',
  'activities.exhibitions': 'Activities 分頁｜Exhibitions 展演',
  'activities.degree-show': 'Activities 分頁｜Degree Shows 畢業展（展演底下）',
  'activities.workshop': 'Activities 分頁｜Workshops 工作營',
  'activities.lectures': 'Activities 分頁｜Lectures 講座',
  'activities.visits': 'Activities 分頁｜Visits 參訪',
  'activities.competitions': 'Activities 分頁｜Competitions 競賽',
  'activities.conferences': 'Activities 分頁｜Forums 論壇',
  'activities.students-present': 'Activities 分頁｜Students Present 學生自主',
  'activities.industry': 'Activities 分頁｜Industry Partnerships 產學合作',
  'admission.news': 'Admissions 分頁｜Announcements 公告',
  'admission.summer-camp': 'Admissions 分頁｜Camps 體驗營',
  'library.awards': 'Library 分頁｜Awards 榮譽',
  'library.press': 'Library 分頁｜Press 報導',
  'library.files': 'Library 分頁｜Documents 文件',
  'library.album': 'Library 分頁｜Albums 相簿',
};

const FIELDS = [
  { field: 'id', type: 'integer', meta: { hidden: true, interface: 'input', readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
  { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} },
  { field: 'name', type: 'string', schema: {},
    meta: { interface: 'input', readonly: true, width: 'half', note: '這一列是哪一頁／哪個分頁（說明用，改了不影響網站）' } },
  { field: 'key', type: 'string', schema: { is_unique: true, is_nullable: false },
    meta: { interface: 'input', readonly: true, width: 'half', note: '程式用的代號，請勿更改' } },
  { field: 'slug', type: 'string', schema: { is_nullable: false },
    meta: { interface: 'input', width: 'full', required: true, options: { trim: true, font: 'monospace' },
      note: '網址上的用字。只能用小寫英文、數字、連字號（-）；頁面之間、同一頁的分頁之間不能重複。⚠️ 改了之後舊網址就失效（已分享的連結、QR code）。',
      validation: { _and: [{ slug: { _regex: '^[a-z0-9-]+$' } }] }, validation_message: '只能用小寫英文、數字、連字號（-）' } },
];

async function main() {
  console.log(DRY ? '── dry run：只讀取、不寫入 ──' : '── 寫入後台 ──');

  // 1) 表
  const col = await api('GET', `/collections/${COLLECTION}`);
  if (col.ok) console.log(`↷ 表已存在：${COLLECTION}`);
  else {
    const r = await api('POST', '/collections', {
      collection: COLLECTION, schema: {}, fields: FIELDS,
      meta: { icon: 'link', sort_field: 'sort', display_template: '{{name}}　→　{{slug}}',
        note: '網址 slug：每個頁面／分頁在網址上的用字。改了舊網址就失效。' },
    });
    if (!r.ok) { console.error('✗ 建表失敗', r.status, JSON.stringify(r.json).slice(0, 400)); process.exit(1); }
    console.log(`✓ 建表：${COLLECTION}（欄位 name／key／slug）`);
  }

  // 2) Public 讀取：照 ui_labels 現有的那筆公開讀取權限抄（policy／role 的寫法隨 Directus 版本不同，直接沿用同一個對象）
  const perms = await api('GET', `/permissions?limit=-1&filter[action][_eq]=read&filter[collection][_in]=ui_labels,${COLLECTION}`);
  if (!perms.ok) { console.error('✗ 讀不到權限清單', perms.status, JSON.stringify(perms.json).slice(0, 300)); process.exit(1); }
  const rows = perms.json.data || [];
  const targetOf = (p) => (p.policy !== undefined ? { policy: p.policy } : { role: p.role });
  const sameTarget = (a, b) => JSON.stringify(targetOf(a)) === JSON.stringify(targetOf(b));
  const publicReads = rows.filter(p => p.collection === 'ui_labels');
  if (!publicReads.length) { console.error('✗ 找不到 ui_labels 的讀取權限可以照抄，請到後台手動開 site_slugs 的 Public 讀取'); process.exit(1); }
  for (const ref of publicReads) {
    if (rows.some(p => p.collection === COLLECTION && sameTarget(p, ref))) { console.log(`↷ 讀取權限已存在（${JSON.stringify(targetOf(ref))}）`); continue; }
    const r = await api('POST', '/permissions', { collection: COLLECTION, action: 'read', fields: ['*'], permissions: {}, validation: {}, ...targetOf(ref) });
    if (!r.ok) { console.error('✗ 開讀取權限失敗', r.status, JSON.stringify(r.json).slice(0, 300)); process.exit(1); }
    console.log(`✓ 開讀取權限（同 ui_labels：${JSON.stringify(targetOf(ref))}）`);
  }

  // 3) 列：只補沒有的
  const cur = col.ok ? await api('GET', `/items/${COLLECTION}?limit=-1&fields=key,slug`) : { ok: true, json: { data: [] } };
  if (!cur.ok) { console.error('✗ 讀取現有列失敗', cur.status, JSON.stringify(cur.json).slice(0, 300)); process.exit(1); }
  const existing = new Map((cur.json.data || []).map(r => [r.key, r.slug]));
  let created = 0, skipped = 0;
  const keys = Object.keys(DEFAULTS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (existing.has(key)) { skipped++; continue; }
    const r = await api('POST', `/items/${COLLECTION}`, { key, name: NAMES[key] || key, slug: DEFAULTS[key], sort: i + 1 });
    if (!r.ok) { console.error(`✗ ${key}`, r.status, JSON.stringify(r.json).slice(0, 200)); continue; }
    if (!DRY) console.log(`✓ 新增：${key} → ${DEFAULTS[key]}`);
    created++;
  }
  const changed = [...existing].filter(([k, v]) => k in DEFAULTS && v !== DEFAULTS[k]);
  console.log(`\n完成：新增 ${created} 列、已存在跳過 ${skipped} 列。`);
  if (changed.length) console.log('後台已改過的（跟預設不同，沒動）：' + changed.map(([k, v]) => `${k}＝${v}`).join('、'));
}

main().catch(e => { console.error(e); process.exit(1); });
