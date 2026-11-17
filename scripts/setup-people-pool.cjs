// 人名庫／單位庫／職稱庫（user 2026-11-17）：後台建 people（人名）、organizations（單位）、job_titles（職稱）三個 pool，
// 再把指定活動 collection 的 guests repeater（JSON）轉成「從 pool 選」：
//   <collection>.people（M2M）→ junction <collection>_people（item／person／sort／titles／orgs）
//   每一場的職稱／單位＝junction 上的 titles／orgs（M2M）→ <collection>_people_titles（credit／title）、_people_orgs（credit／org）
//   ＝同一個人在不同場次可以掛不同職稱、單位（user 定案「每次出場各自選」）。
// 舊 guests 的 orgs 裡混著職稱（Artist／Designer…）：名字跟職稱庫裡某一筆一樣的就當職稱搬，其餘當單位。
// 新 collection 搬之前先 --dry：「沒有國家的新單位」多半是職稱，先在後台職稱庫加上再真的跑。
// 舊 guests 欄只藏起來不刪＝回退用；前台改讀 people（activities-source.js／guest-orgs.js poolGuests）。
// 安全版：表／欄位／關聯／權限已存在就跳過；collection 裡已經有 people 的列不重搬；pool 已有同名的人／單位直接沿用、不改它。
//
// 先看會做什麼：node scripts/setup-people-pool.cjs activities_lectures --dry
// 真的做：      node scripts/setup-people-pool.cjs activities_lectures
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線
const fs = require('fs');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdadmin.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');
const COL = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!COL) { console.error('用法：node scripts/setup-people-pool.cjs <collection> [--dry]'); process.exit(1); }
const J = `${COL}_people`;          // 出場紀錄（哪一場、哪個人、當時的職稱／單位）
const JO = `${COL}_people_orgs`;    // 出場紀錄 ↔ 單位
const JT = `${COL}_people_titles`;  // 出場紀錄 ↔ 職稱

const api = async (method, path, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return null; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json && json.data;
};
const get = path => api('GET', path).catch(() => null);
const zh = t => [{ language: 'zh-TW', translation: t }];

// ── schema 小工具（存在就跳過）──
const uuidPk = { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } };
const fk = (field, label) => ({ field, type: 'uuid', meta: { hidden: true, interface: 'select-dropdown-m2o', special: null, translations: zh(label) }, schema: { is_nullable: true } });
const sortField = { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} };
const text = (field, label, width = 'half') => ({ field, type: 'string', meta: { interface: 'input', width, translations: zh(label) }, schema: {} });

async function ensureCollection(collection, meta, fields) {
  if (await get(`/collections/${collection}`)) { console.log(`· ${collection} 已存在`); }
  else { console.log(`+ 建 ${collection}`); await api('POST', '/collections', { collection, meta, schema: {}, fields: [uuidPk] }); }
  const have = DRY ? new Set() : new Set(((await get(`/fields/${collection}`)) || []).map(f => f.field));
  for (const f of fields) if (!have.has(f.field)) { console.log(`  + 欄位 ${collection}.${f.field}`); await api('POST', `/fields/${collection}`, f); }
}
async function ensureField(collection, f) {
  if (await get(`/fields/${collection}/${f.field}`)) return;
  console.log(`  + 欄位 ${collection}.${f.field}`); await api('POST', `/fields/${collection}`, f);
}
async function ensureRelation(r) {
  if (await get(`/relations/${r.collection}/${r.field}`)) return;
  console.log(`  + 關聯 ${r.collection}.${r.field} → ${r.related_collection}`); await api('POST', '/relations', r);
}
async function ensurePublicRead(collections) {
  // 照 ui_labels 現有的公開讀取權限抄（同 setup-site-slugs.cjs）
  const perms = (await get(`/permissions?limit=-1&filter[action][_eq]=read&filter[collection][_in]=ui_labels,${collections.join(',')}`)) || [];
  const ref = perms.find(p => p.collection === 'ui_labels');
  if (!ref) throw new Error('找不到 ui_labels 的公開讀取權限可以抄');
  const target = ref.policy !== undefined ? { policy: ref.policy } : { role: ref.role };
  for (const c of collections) {
    if (perms.some(p => p.collection === c)) continue;
    console.log(`  + Public 讀取 ${c}`);
    await api('POST', '/permissions', { collection: c, action: 'read', fields: ['*'], permissions: {}, validation: {}, ...target });
  }
}

// ── 比對同一個人／單位：英文不分大小寫、空白收斂；中英都一樣才算同一個 ──
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const keyOf = (en, zhName) => `${norm(en).toLowerCase()}|${norm(zhName)}`;
const truthy = v => v === true || (typeof v === 'string' && v !== '' && v !== 'off' && v !== 'false');
// 一場的單位：orgs[] 有內容用它，否則退舊單欄（同前台 guestOrgs 的優先序）
const orgsOf = g => {
  const list = (Array.isArray(g.orgs) ? g.orgs : []).filter(Boolean).map(o => ({ en: o.orgEn || o.en || '', zh: o.orgZh || o.zh || '', country: o.orgCountry || o.country || '' })).filter(o => o.en || o.zh);
  if (list.length) return list;
  return (g.orgEn || g.orgZh) ? [{ en: g.orgEn || '', zh: g.orgZh || '', country: g.orgCountry || '' }] : [];
};

(async () => {
  const colInfo = await get(`/collections/${COL}`);
  if (!colInfo) throw new Error(`沒有 ${COL} 這個 collection`);
  const colLabel = (colInfo.meta?.translations || []).find(t => t.language === 'zh-TW')?.translation || COL;
  const guestsMeta = (await get(`/fields/${COL}/guests`))?.meta;
  if (!guestsMeta) throw new Error(`${COL} 沒有 guests 欄`);
  const countryOpts = (await get('/fields/faculty/country'))?.meta?.options || {};  // 國家選單沿用 faculty 那份（同一套 ISO 代碼）
  const country = { field: 'country', type: 'string', meta: { interface: 'select-dropdown', options: { choices: countryOpts.choices || [], allowNone: true }, display: 'labels', width: 'half', translations: zh('國家') }, schema: {} };

  console.log('1) 人名庫／單位庫');
  await ensureCollection('people', { icon: 'person', translations: zh('人名庫'), display_template: '{{nameZh}} {{nameEn}}', note: '全站人名的唯一來源：其他地方都從這裡選，沒有才新增（新增的會自動加進這裡）' }, [
    text('nameEn', '英文名'), text('nameZh', '中文名'), text('akaEn', 'AKA（英）'), text('akaZh', 'AKA（中）'), country,
    { field: 'isAlumni', type: 'boolean', meta: { interface: 'boolean', width: 'half', translations: zh('系友') }, schema: { default_value: false } },
  ]);
  await ensureCollection('organizations', { icon: 'domain', translations: zh('單位庫'), display_template: '{{nameZh}} {{nameEn}}', note: '全站單位的唯一來源：其他地方都從這裡選，沒有才新增（新增的會自動加進這裡）' }, [
    text('nameEn', '英文名'), text('nameZh', '中文名'), country,
  ]);
  await ensureCollection('job_titles', { icon: 'badge', translations: zh('職稱庫'), display_template: '{{nameZh}} {{nameEn}}', note: '全站職稱的唯一來源：其他地方都從這裡選，沒有才新增（新增的會自動加進這裡）' }, [
    text('nameEn', '英文名'), text('nameZh', '中文名'),
  ]);

  console.log(`2) ${COL}（${colLabel}）改從 pool 選`);
  await ensureCollection(J, { hidden: true, group: COL, icon: 'import_export' }, [fk('item', colLabel), fk('person', '人名'), sortField]);
  await ensureCollection(JO, { hidden: true, group: COL, icon: 'import_export' }, [fk('credit', '出場紀錄'), fk('org', '單位'), sortField]);
  await ensureCollection(JT, { hidden: true, group: COL, icon: 'import_export' }, [fk('credit', '出場紀錄'), fk('title', '職稱'), sortField]);
  await ensureField(COL, { field: 'people', type: 'alias', meta: {
    special: ['m2m'], interface: 'list-m2m', sort: guestsMeta.sort, width: 'full', translations: zh('講者／來賓'),
    note: '按「Add Existing」從人名庫搜尋；找不到才按「Create New」新增（會自動加進人名庫）。點一下某個人可以填這一場的職稱、單位',
    options: { template: '{{person.nameZh}} {{person.nameEn}}', enableCreate: true, enableSelect: true },
    display: 'related-values', display_options: { template: '{{person.nameZh}} {{person.nameEn}}' },
  } });
  await ensureField(J, { field: 'titles', type: 'alias', meta: {
    special: ['m2m'], interface: 'list-m2m', sort: 5, width: 'full', translations: zh('這一場的職稱'),
    note: '從職稱庫搜尋（Add Existing）；找不到才 Create New',
    options: { template: '{{title.nameZh}} {{title.nameEn}}', enableCreate: true, enableSelect: true },
  } });
  await ensureField(J, { field: 'orgs', type: 'alias', meta: {
    special: ['m2m'], interface: 'list-m2m', sort: 6, width: 'full', translations: zh('這一場的單位'),
    note: '從單位庫搜尋（Add Existing）；找不到才 Create New',
    options: { template: '{{org.nameZh}} {{org.nameEn}}', enableCreate: true, enableSelect: true },
  } });
  // 人名庫那邊看得到這個人出現在哪些場次（合併重複的人時用；唯讀）
  await ensureField('people', { field: COL, type: 'alias', meta: {
    special: ['m2m'], interface: 'list-m2m', readonly: true, width: 'full', translations: zh(`出現在：${colLabel}`),
    options: { template: '{{item.titleZh}} {{item.titleEn}}', enableCreate: false, enableSelect: false },
  } });
  await ensureRelation({ collection: J, field: 'item', related_collection: COL, meta: { one_field: 'people', junction_field: 'person', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
  // RESTRICT：人名庫裡還有場次在用的人刪不掉（要先把場次改指到別人＝合併），不會悄悄從活動裡消失
  await ensureRelation({ collection: J, field: 'person', related_collection: 'people', meta: { one_field: COL, junction_field: 'item', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
  await ensureRelation({ collection: JO, field: 'credit', related_collection: J, meta: { one_field: 'orgs', junction_field: 'org', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
  await ensureRelation({ collection: JO, field: 'org', related_collection: 'organizations', meta: { one_field: null, junction_field: 'credit', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
  await ensureRelation({ collection: JT, field: 'credit', related_collection: J, meta: { one_field: 'titles', junction_field: 'title', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
  await ensureRelation({ collection: JT, field: 'title', related_collection: 'job_titles', meta: { one_field: null, junction_field: 'credit', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
  await ensurePublicRead(['people', 'organizations', 'job_titles', J, JO, JT]);

  console.log('3) 搬資料');
  const hasPeople = !!(await get(`/fields/${COL}/people`));  // dry 跑在建欄之前＝還沒有這欄，帶上會 400
  const [pool, orgPool, titlePool, rows] = await Promise.all([
    get('/items/people?limit=-1&fields=id,nameEn,nameZh'),
    get('/items/organizations?limit=-1&fields=id,nameEn,nameZh'),
    get('/items/job_titles?limit=-1&fields=id,nameEn,nameZh'),
    get(`/items/${COL}?limit=-1&fields=id,guests${hasPeople ? ',people' : ''}`),
  ]);
  const people = new Map((pool || []).map(p => [keyOf(p.nameEn, p.nameZh), { id: p.id }]));
  const orgs = new Map((orgPool || []).map(o => [keyOf(o.nameEn, o.nameZh), { id: o.id }]));
  const titles = new Map((titlePool || []).map(t => [keyOf(t.nameEn, t.nameZh), { id: t.id }]));
  const isTitle = o => titles.has(keyOf(o.en, o.zh));  // 舊 orgs 裡混的職稱：只認職稱庫已有的，其餘一律當單位
  const conflicts = [];
  const want = (map, key, data, label) => {
    const hit = map.get(key);
    if (!hit) { map.set(key, { data }); return; }
    if (!hit.data) return;  // pool 本來就有＝沿用、不改
    for (const k of Object.keys(data)) {
      if (!data[k] || data[k] === hit.data[k]) continue;
      if (!hit.data[k] || k === 'isAlumni') hit.data[k] = data[k];
      else conflicts.push(`${label}「${key}」${k}：用 ${hit.data[k]}，另一場寫 ${data[k]}`);
    }
  };
  const todo = (rows || []).filter(r => !(Array.isArray(r.people) && r.people.length) && Array.isArray(r.guests) && r.guests.length);
  for (const r of todo) for (const g of r.guests) {
    if (!g || !(g.nameEn || g.nameZh)) continue;
    want(people, keyOf(g.nameEn, g.nameZh), { nameEn: norm(g.nameEn), nameZh: norm(g.nameZh), akaEn: norm(g.akaEn), akaZh: norm(g.akaZh), country: g.country || '', isAlumni: truthy(g.isAlumni) }, '人');
    for (const o of orgsOf(g)) if (!isTitle(o)) want(orgs, keyOf(o.en, o.zh), { nameEn: norm(o.en), nameZh: norm(o.zh), country: o.country }, '單位');
  }
  const newPeople = [...people.values()].filter(v => v.data), newOrgs = [...orgs.values()].filter(v => v.data);
  console.log(`  要搬 ${todo.length} 筆活動；人名庫新增 ${newPeople.length} 人（已有 ${(pool || []).length}）、單位庫新增 ${newOrgs.length} 個（已有 ${(orgPool || []).length}）；職稱庫已有 ${(titlePool || []).length} 個（只沿用、不新增）`);
  const noCountry = newOrgs.filter(v => !v.data.country);
  if (noCountry.length) console.log(`  ⚠️ 沒有國家的新單位（多半是職稱；是的話先在後台職稱庫加上再跑）：\n    ${noCountry.map(v => `${v.data.nameEn} ${v.data.nameZh}`).join('\n    ')}`);
  if (conflicts.length) console.log(`  ⚠️ 同一個人／單位在不同場次寫法不同（pool 只能留一個，用第一次出現的）：\n    ${conflicts.join('\n    ')}`);
  // 疑似同一個人卻拼法不同（英文同、中文不同或反之）＝merge 候選，給 user 在後台手動合併
  const near = (map, label) => {
    const byEn = new Map(), byZh = new Map();
    for (const k of map.keys()) { const [en, z] = k.split('|'); if (en) (byEn.get(en) || byEn.set(en, []).get(en)).push(k); if (z) (byZh.get(z) || byZh.set(z, []).get(z)).push(k); }
    const dup = [...byEn.values(), ...byZh.values()].filter(v => v.length > 1);
    if (dup.length) console.log(`  ⚠️ 疑似重複的${label}（中英其中一邊一樣）：\n    ${dup.map(v => v.join('  ／  ')).join('\n    ')}`);
  };
  near(people, '人'); near(orgs, '單位');
  if (DRY) { console.log('\n[dry] 沒有真的寫入。'); return; }

  // ⚠️ 批次新增的回傳順序≠送出順序（UUID 主鍵依 id 排序回來）→ 一律用回傳的名字對回去，別用索引
  const createAll = async (collection, map, list) => {
    for (let i = 0; i < list.length; i += 100) {
      const made = await api('POST', `/items/${collection}`, list.slice(i, i + 100).map(v => v.data));
      made.forEach(m => { map.set(keyOf(m.nameEn, m.nameZh), { id: m.id }); });
    }
  };
  await createAll('people', people, newPeople);
  await createAll('organizations', orgs, newOrgs);
  const credits = todo.flatMap(r => r.guests.filter(g => g && (g.nameEn || g.nameZh)).map((g, i) => ({
    item: r.id, person: people.get(keyOf(g.nameEn, g.nameZh)).id, sort: i + 1,
    titles: orgsOf(g).filter(isTitle).map((o, j) => ({ title: titles.get(keyOf(o.en, o.zh)).id, sort: j + 1 })),
    orgs: orgsOf(g).filter(o => !isTitle(o)).map((o, j) => ({ org: orgs.get(keyOf(o.en, o.zh)).id, sort: j + 1 })),
  })));
  for (let i = 0; i < credits.length; i += 100) await api('POST', `/items/${J}`, credits.slice(i, i + 100));
  console.log(`  ✓ 建了 ${credits.length} 筆出場紀錄`);

  // 舊 guests 與自動產生的 aka／國家欄（來源是 guests）藏起來；資料留著＝回退用
  for (const f of ['guests', 'akaText', 'guestCountryText', 'orgCountryText']) {
    const m = (await get(`/fields/${COL}/${f}`))?.meta;
    if (m && !m.hidden) { console.log(`  · 藏起 ${COL}.${f}`); await api('PATCH', `/fields/${COL}/${f}`, { meta: { hidden: true } }); }
  }

  // 自驗：用前台同一組欄位讀回來，跟舊 guests 比（只會差在上面列的「寫法不同」）；職稱排在單位前＝同前台 poolGuests
  const back = await get(`/items/${COL}?limit=-1&fields=id,guests,people.sort,people.person.*,people.titles.sort,people.titles.title.*,people.orgs.sort,people.orgs.org.*`);
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
  const names = list => list.map(x => norm(x.en) + '/' + norm(x.zh)).join(';');
  let diff = 0;
  for (const r of back) {
    const was = (r.guests || []).filter(g => g && (g.nameEn || g.nameZh)).map(g => `${norm(g.nameEn)}|${norm(g.nameZh)}|${names([...orgsOf(g).filter(isTitle), ...orgsOf(g).filter(o => !isTitle(o))])}`);
    const now = (r.people || []).sort(bySort).map(j => `${j.person.nameEn}|${j.person.nameZh}|${names([...(j.titles || []).sort(bySort).map(t => ({ en: t.title.nameEn, zh: t.title.nameZh })), ...(j.orgs || []).sort(bySort).map(o => ({ en: o.org.nameEn, zh: o.org.nameZh }))])}`);
    if (JSON.stringify(was) !== JSON.stringify(now)) { diff++; if (diff <= 5) console.log('  ✗', r.id, was, now); }
  }
  console.log(diff ? `  ✗ ${diff} 筆對不上` : `  ✓ ${back.length} 筆讀回比對全對（人名、順序、每場單位）`);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
