/**
 * legal 後台整理（user 2026-10-04「乾淨清楚」＋support 改名 donate 防呆）：
 *   ① 後台介面預設語言 → 繁中（欄位的中文名稱才會顯示）
 *   ② 新 collection donate（捐贈 Donate）取代 support：頁面說明＋捐贈項目
 *   ③ regulations 改成「規章與政策」一筆：頁面說明＋① 學系規章（表格）＋② 政策（隱私權政策從 policy_and_statements 搬進來）
 *   所有「可展開的列」共用同一組欄位：標題／最後更新／內文（富文本）；文字列另有小節、規章列另有分類表格
 *   ④ 舊欄位、舊 collection（support、policy_and_statements）先藏起來不刪：線上前台（S3 包）還在讀
 *
 *   node scripts/migrate-legal-cms.cjs --dry       # 只看不寫
 *   node scripts/migrate-legal-cms.cjs             # 執行（可重跑：已存在的跳過、資料只在新欄位空時寫入）
 *   node scripts/migrate-legal-cms.cjs --cleanup   # 新版前台在 GitHub Pages＋S3 都上線後才跑：刪舊欄位與舊 collection
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const CLEANUP = process.argv.includes('--cleanup');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

function getToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN.trim();
  const f = path.join(__dirname, '.directus-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('✗ 找不到 token（scripts/.directus-token 或 DIRECTUS_TOKEN）');
  process.exit(1);
}
const H = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
async function req(method, url, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${url}`); return {}; }
  const res = await fetch(BASE + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${url} → HTTP ${res.status}\n${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}
const get = async (url) => (await req('GET', url)).data;

const zh = (t) => [{ language: 'zh-TW', translation: t }];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrapP = (t) => (t ? `<p>${esc(t)}</p>` : null);
const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

// ── 欄位定義 ────────────────────────────────────────────────────────────────
const half = (field, name, note) => ({ field, name, type: 'string', meta: { interface: 'input', width: 'half', ...(note ? { note } : {}) } });
const rich = (field, name, note) => ({ field, name, type: 'text', meta: { interface: 'input-rich-text-html', ...(note ? { note } : {}) } });
const list = (field, name, fields, { template = '{{ titleZh }}', addLabel = '新增', note } = {}) =>
  ({ field, name, type: 'json', meta: { interface: 'list', options: { template, addLabel, fields }, ...(note ? { note } : {}) } });

// 文字列（Donate 捐贈項目／Regulations 政策列共用）
const SECTION_FIELDS = [
  half('titleEn', '小節標題（英）'), half('titleZh', '小節標題（中）'),
  rich('bodyEn', '小節內文（英）'), rich('bodyZh', '小節內文（中）'),
];
const TEXT_ROW_FIELDS = [
  half('titleEn', '標題（英）'), half('titleZh', '標題（中）'),
  half('updatedEn', '最後更新（英）', '選填：顯示在標題下方，如 Last Updated: 2026/09/14'),
  half('updatedZh', '最後更新（中）', '選填，如 最後更新：2026/09/14'),
  rich('bodyEn', '內文（英）', '展開後最上方的內容；下面有小節時當開頭說明'),
  rich('bodyZh', '內文（中）'),
  list('sections', '小節', SECTION_FIELDS, { addLabel: '新增小節', note: '選填：內容要再分段、每段有小標時用（如 單次／定期、Cookie 之運用）' }),
];
// 規章表格：分類 → 規章
const REG_ITEM_FIELDS = [
  half('titleEn', '規章名稱（英）'), half('titleZh', '規章名稱（中）'),
  half('unitEn', '承辦單位（英）', '空白＝SCCD Office（系辦）'), half('unitZh', '承辦單位（中）', '空白＝系辦'),
  { field: 'url', name: '文件連結', type: 'string', meta: { interface: 'input', note: '選填：有填＝名稱可點、新分頁開啟' } },
];
const REG_CATEGORY_FIELDS = [
  half('titleEn', '分類名稱（英）'), half('titleZh', '分類名稱（中）'),
  list('items', '規章', REG_ITEM_FIELDS, { addLabel: '新增規章' }),
];

// 頂層欄位（Directus /fields 格式）
const topText = (field, label, sort, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-multiline', width: 'full', sort, translations: zh(label), ...extra }, schema: {} });
const topStr = (field, label, sort, extra = {}) => ({ field, type: 'string', meta: { interface: 'input', width: 'half', sort, translations: zh(label), ...extra }, schema: {} });
const topRich = (field, label, sort, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', sort, translations: zh(label), ...extra }, schema: {} });
const topList = (field, label, sort, fields, opts, extra = {}) => ({ field, type: 'json', meta: { interface: 'list', special: ['cast-json'], width: 'full', sort, translations: zh(label), options: { template: '{{ titleZh }}', ...opts, fields }, ...extra }, schema: {} });
const group = (field, label, sort) => ({ field, type: 'alias', meta: { interface: 'group-detail', special: ['alias', 'no-data', 'group'], options: { start: 'open' }, width: 'full', sort, translations: zh(label) } });
const PAGE_DESC_NOTE = '頁面最上方的粗體說明（桌面 3/4 寬）；空白＝不顯示';

const REG_FIELDS = [
  group('grp_reg', '① 學系規章（表格）', 3),
  topStr('regTitleEn', '標題（英）', 1, { group: 'grp_reg' }),
  topStr('regTitleZh', '標題（中）', 2, { group: 'grp_reg' }),
  topStr('regUpdatedEn', '最後更新（英）', 3, { group: 'grp_reg', note: '選填：顯示在標題下方' }),
  topStr('regUpdatedZh', '最後更新（中）', 4, { group: 'grp_reg' }),
  topRich('regBodyEn', '內文（英）', 5, { group: 'grp_reg', note: '展開後、表格上方的說明' }),
  topRich('regBodyZh', '內文（中）', 6, { group: 'grp_reg' }),
  topList('regCategories', '規章分類', 7, REG_CATEGORY_FIELDS, { addLabel: '新增分類' }, { group: 'grp_reg', note: '每個分類＝表格左欄一格，底下列出該類規章' }),
  group('grp_policy', '② 政策（隱私權等）', 4),
  topList('policyRows', '政策列', 1, TEXT_ROW_FIELDS, { addLabel: '新增政策' }, { group: 'grp_policy', note: '每一項＝頁面上一列可展開的政策（排在學系規章下面）' }),
];
const DONATE_FIELDS = [
  topText('pageDescEn', '頁面說明（英）', 1, { note: PAGE_DESC_NOTE }),
  topText('pageDescZh', '頁面說明（中）', 2, { note: PAGE_DESC_NOTE }),
  topList('rows', '捐贈項目', 3, TEXT_ROW_FIELDS, { addLabel: '新增項目' }, { note: '每一項＝頁面上一列可展開的項目' }),
];
const REG_OLD_FIELDS = ['titleZh', 'titleEn', 'overviewZh', 'overviewEn', 'points', 'lastUpdatedZh', 'lastUpdatedEn'];
const OLD_NOTE = '舊資料（內容已搬到新欄位／新 collection；新版前台上線後刪除）';

// 規章頁說明 mock-up（user 2026-10-04 要先寫一版，之後在後台改）
const REG_PAGE_DESC = {
  pageDescEn: 'This page brings together the department and university regulations relevant to SCCD students and faculty, along with the privacy and information security policy of this website. Select an item to view its details.',
  pageDescZh: '本頁彙整與本系師生相關的學系及校方規章辦法，以及本網站的隱私權與資訊安全政策；點選各項即可查看內容。',
};

async function ensureFields(col, defs) {
  const existing = new Set((await get(`/fields/${col}`)).map((f) => f.field));
  for (const d of defs) {
    if (existing.has(d.field)) { console.log(`  · ${col}.${d.field} 已存在`); continue; }
    await req('POST', `/fields/${col}`, d);
    console.log(`  ✓ ${col}.${d.field} 建立`);
  }
}
async function fillEmpty(col, current, data) {
  const patch = Object.fromEntries(Object.entries(data).filter(([k, v]) => empty(current?.[k]) && !empty(v)));
  if (!Object.keys(patch).length) { console.log(`  · ${col} 資料已有，不覆蓋`); return; }
  await req('PATCH', `/items/${col}`, patch);
  console.log(`  ✓ ${col} 寫入：${Object.keys(patch).join(', ')}`);
}

async function migrate() {
  console.log('① 後台介面預設語言 → zh-TW');
  await req('PATCH', '/settings', { default_language: 'zh-TW' });

  console.log('② donate（捐贈 Donate）');
  const collections = new Set((await get('/collections')).map((c) => c.collection));
  if (!collections.has('donate')) {
    await req('POST', '/collections', {
      collection: 'donate',
      meta: { singleton: true, group: 'Legal', sort: 2, icon: 'volunteer_activism', translations: zh('捐贈 Donate'), note: '前台 Donate 頁：頁面說明＋捐贈項目' },
      schema: {},
      fields: [{ field: 'id', type: 'integer', meta: { hidden: true, readonly: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: true } }],
    });
    console.log('  ✓ collection 建立');
  }
  if (!DRY || collections.has('donate')) await ensureFields('donate', DONATE_FIELDS);
  const perms = await get(`/permissions?filter[collection][_eq]=donate&filter[action][_eq]=read&limit=-1`).catch(() => []);
  if (!perms.some((p) => p.policy === PUBLIC_POLICY)) {
    await req('POST', '/permissions', { policy: PUBLIC_POLICY, collection: 'donate', action: 'read', fields: ['*'], permissions: {}, validation: {} });
    console.log('  ✓ Public 讀取權限');
  }
  const support = await get('/items/support');
  const donate = collections.has('donate') ? await get('/items/donate').catch(() => null) : null;
  await fillEmpty('donate', donate, {
    pageDescEn: support.overviewEn, pageDescZh: support.overviewZh,
    rows: (support.points || []).map((p) => ({
      titleEn: p.titleEn || null, titleZh: p.titleZh || null, updatedEn: null, updatedZh: null,
      bodyEn: p.desEn || null, bodyZh: p.desZh || null,
      sections: (p.sections || []).map((s) => ({ titleEn: s.titleEn || null, titleZh: s.titleZh || null, bodyEn: s.desEn || null, bodyZh: s.desZh || null })),
    })),
  });

  console.log('③ regulations（規章與政策）');
  await req('PATCH', '/collections/regulations', { meta: { sort: 1, translations: zh('規章與政策 Regulations & Policy'), note: '前台 Regulations 頁：頁面說明＋① 學系規章表格＋② 政策（隱私權等）' } });
  await ensureFields('regulations', REG_FIELDS);
  for (const [f, sort] of [['pageDescEn', 1], ['pageDescZh', 2]]) await req('PATCH', `/fields/regulations/${f}`, { meta: { sort, note: PAGE_DESC_NOTE } });
  const reg = await get('/items/regulations');
  const pol = await get('/items/policy_and_statements');
  await fillEmpty('regulations', reg, {
    ...REG_PAGE_DESC,
    regTitleEn: reg.titleEn, regTitleZh: reg.titleZh, regUpdatedEn: reg.lastUpdatedEn, regUpdatedZh: reg.lastUpdatedZh,
    regBodyEn: wrapP(reg.overviewEn), regBodyZh: wrapP(reg.overviewZh),
    regCategories: reg.points,
    policyRows: pol ? [{
      titleEn: pol.titleEn || null, titleZh: pol.titleZh || null, updatedEn: pol.lastUpdatedEn || null, updatedZh: pol.lastUpdatedZh || null,
      bodyEn: wrapP(pol.overviewEn), bodyZh: wrapP(pol.overviewZh),
      sections: (pol.points || []).map((p) => ({ titleEn: p.titleEn || null, titleZh: p.titleZh || null, bodyEn: p.desEn || null, bodyZh: p.desZh || null })),
    }] : [],
  });

  console.log('④ 舊欄位／舊 collection 藏起來（不刪）');
  for (const f of REG_OLD_FIELDS) await req('PATCH', `/fields/regulations/${f}`, { meta: { hidden: true, note: OLD_NOTE } });
  for (const c of ['support', 'policy_and_statements']) await req('PATCH', `/collections/${c}`, { meta: { hidden: true, note: OLD_NOTE } });
  await req('PATCH', '/collections/accessibility_statement', { meta: { sort: 3 } });
  console.log('完成');
}

async function cleanup() {
  console.log('刪舊欄位與舊 collection（新版前台必須已在 GitHub Pages＋S3 上線）');
  const existing = new Set((await get('/fields/regulations')).map((f) => f.field));
  for (const f of REG_OLD_FIELDS) if (existing.has(f)) { await req('DELETE', `/fields/regulations/${f}`); console.log(`  ✓ regulations.${f}`); }
  const collections = new Set((await get('/collections')).map((c) => c.collection));
  for (const c of ['support', 'policy_and_statements']) if (collections.has(c)) { await req('DELETE', `/collections/${c}`); console.log(`  ✓ collection ${c}`); }
}

(CLEANUP ? cleanup() : migrate()).catch((e) => { console.error('✗', e.message); process.exit(1); });
