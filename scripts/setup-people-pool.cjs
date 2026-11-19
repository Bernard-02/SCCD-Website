// 人名庫／單位庫／職稱庫（user 2026-11-17）：後台 people（人名）、organizations（單位）、job_titles（職稱）三個 pool＝
// 全站人名／單位／職稱的唯一來源，其他地方一律從 pool 選（user「只有那三個資料庫的 data 才是選取，剩下的都是 key 的」）。
// 本腳本把一個 collection 的舊欄位（JSON repeater／打字欄）搬成「從 pool 選」，形狀看 SPEC：
//   credits＝講者類（人＋這一場的職稱／單位）：<col>.people → <col>_people（item／person／sort／titles／orgs）
//            ＋ <col>_people_titles（credit／title）、<col>_people_orgs（credit／org）＝同一人每場可掛不同職稱、單位
//   people ＝只有人（得獎人）：<col>.people → <col>_people（item／person／sort）
//   orgs   ＝只有單位、可多個（主辦單位）：<col>.orgs → <col>_orgs（item／org／sort）
//   org    ＝一列就是一個單位（world 四張表）：<col>.org（M2O）；給 pool／field＝改指別的庫
//            （報導的媒體：library_press.media → 媒體庫 media_outlets，user 2026-11-19）
//   person ＝一列就是一個人（師資）：<col>.person（M2O）
//   mixed  ＝職稱、單位混在同一個有順序的清單（師資的職稱／職級、現職）：<col>.<alias>（M2A → 職稱庫或單位庫）
//            → <junction>（parent／collection／item／sort）；職稱庫有的當職稱，其餘當單位
// 舊 guests 的 orgs 裡混著職稱（Artist／Designer…）：名字跟職稱庫裡某一筆一樣的就當職稱搬，其餘當單位。
// 先 --dry：「沒有國家的新單位」多半是職稱 → 先在後台職稱庫加上再真的跑。
// 安全版：表／欄位／關聯／權限已存在就跳過；已搬過的列不重搬；pool 已有同名的直接沿用、不改它。
// 舊欄位只藏不刪（前台上線新版前舊站還在讀）；確定上線後 --drop-legacy 刪掉（先自動備份成 JSON）。
//
// 先看會做什麼：node scripts/setup-people-pool.cjs <collection> --dry
// 真的做：      node scripts/setup-people-pool.cjs <collection>
// 刪舊欄位：    node scripts/setup-people-pool.cjs <collection> --drop-legacy
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線
const fs = require('fs');
const path = require('path');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdadmin.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');
const DROP = process.argv.includes('--drop-legacy');
const COL = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!COL) { console.error('用法：node scripts/setup-people-pool.cjs <collection> [--dry|--drop-legacy]'); process.exit(1); }

const GUEST_HIDE = ['guests', 'akaText', 'guestCountryText', 'guestOrgText', 'orgCountryText'];  // 後三個是 Flow 從 guests 產的搜尋欄
const worldOrg = (en, zh) => ({ kind: 'org', label: '單位', org: r => ({ en: r[en], zh: r[zh], country: r.country }), hide: [en, zh, 'country'] });
const SPEC = {
  library_awards: [  // 得獎人都是學生＝照打字、不進人名庫（user 2026-11-17）
    { kind: 'orgs', src: 'organizers', label: '主辦單位', org: o => ({ en: o.en, zh: o.zh, country: o.country }), hide: ['organizers', 'organizerEn', 'organizerZh'] },
  ],
  admission_summer_camp: [{ kind: 'orgs', src: 'organizers', label: '主辦單位', org: o => ({ en: o.organizerEn, zh: o.organizerZh }), hide: ['organizers'] }],
  library_press: [{ kind: 'org', pool: 'media_outlets', field: 'media', label: '媒體', org: r => ({ en: r.mediaEn, zh: r.mediaZh, country: r.country }), hide: ['mediaEn', 'mediaZh', 'country'] }],
  alumni_hosting: [worldOrg('companyEn', 'companyZh')],
  alumni_employment: [worldOrg('companyEn', 'companyZh')],
  atlas_workshops: [worldOrg('nameEn', 'nameZh')],
  atlas_industry: [worldOrg('nameEn', 'nameZh')],
  faculty: [
    { kind: 'person', label: '老師', hide: ['nameEn', 'nameZh', 'akaEn', 'akaZh', 'country'] },
    { kind: 'mixed', src: 'titles', alias: 'titleItems', junction: 'faculty_title_items', label: '職稱／職級', en: 'titleEn', zh: 'titleZh', hide: ['titles'] },
    { kind: 'mixed', src: 'occupations', alias: 'occupationItems', junction: 'faculty_occupation_items', label: '現職', en: 'occupationEn', zh: 'occupationZh', hide: ['occupations'] },
  ],
}[COL] || [{ kind: 'credits', src: 'guests', label: '講者／來賓', hide: GUEST_HIDE }];

const api = async (method, p, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${p}`); return null; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json && json.data;
};
const get = p => api('GET', p).catch(() => null);
const zh = t => [{ language: 'zh-TW', translation: t }];
// kind 'org' 指到哪個庫、欄位叫什麼（預設＝單位庫的 org）
const POOL_ZH = { organizations: '單位庫', media_outlets: '媒體庫' };
const poolOf = s => s.pool || 'organizations', fieldOf = s => s.field || 'org';

// ── schema 小工具（存在就跳過）──
const uuidPk = { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } };
const fk = (field, label) => ({ field, type: 'uuid', meta: { hidden: true, interface: 'select-dropdown-m2o', special: null, translations: zh(label) }, schema: { is_nullable: true } });
const sortField = { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} };
const text = (field, label, width = 'half') => ({ field, type: 'string', meta: { interface: 'input', width, translations: zh(label) }, schema: {} });
const m2m = (field, label, tpl, extra = {}) => ({ field, type: 'alias', meta: { special: ['m2m'], interface: 'list-m2m', width: 'full', translations: zh(label), options: { template: tpl, enableCreate: true, enableSelect: true }, ...extra } });
const PICK_NOTE = (pool) => `按「Add Existing」從${pool}搜尋；找不到才按「Create New」新增（會自動加進${pool}）`;

async function ensureCollection(collection, meta, fields) {
  if (await get(`/collections/${collection}`)) { /* 已存在 */ }
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
// pool 那邊「出現在哪裡」：反向清單收進一個摺起來的群組（合併重複時看得到誰在用；RESTRICT＝還有人用就刪不掉）
const usedInGroup = { field: 'usedIn', type: 'alias', meta: { special: ['alias', 'no-data', 'group'], interface: 'group-detail', options: { start_open: false }, width: 'full', sort: 99, translations: zh('出現在哪裡') } };
const reverse = (field, label, special, tpl) => ({ field, type: 'alias', meta: { special: [special], interface: special === 'o2m' ? 'list-o2m' : 'list-m2m', readonly: true, group: 'usedIn', width: 'full', translations: zh(label), options: { template: tpl, enableCreate: false, enableSelect: false } } });

// ── 比對同一個人／單位：英文不分大小寫、空白收斂；中英都一樣才算同一個 ──
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const keyOf = (en, zhName) => `${norm(en).toLowerCase()}|${norm(zhName)}`;
const cc = c => norm(c).toLowerCase();  // 國家代碼一律小寫（atlas 表存大寫）
const truthy = v => v === true || (typeof v === 'string' && v !== '' && v !== 'off' && v !== 'false');
// 一場的單位：orgs[] 有內容用它，否則退舊單欄（同前台 guestOrgs 的優先序）
const orgsOf = g => {
  const list = (Array.isArray(g.orgs) ? g.orgs : []).filter(Boolean).map(o => ({ en: o.orgEn || o.en || '', zh: o.orgZh || o.zh || '', country: o.orgCountry || o.country || '' })).filter(o => o.en || o.zh);
  if (list.length) return list;
  return (g.orgEn || g.orgZh) ? [{ en: g.orgEn || '', zh: g.orgZh || '', country: g.orgCountry || '' }] : [];
};
const asPerson = g => ({ nameEn: norm(g.nameEn), nameZh: norm(g.nameZh), akaEn: norm(g.akaEn), akaZh: norm(g.akaZh), country: cc(g.country), isAlumni: truthy(g.isAlumni) });

(async () => {
  const colInfo = await get(`/collections/${COL}`);
  if (!colInfo) throw new Error(`沒有 ${COL} 這個 collection`);
  const colLabel = (colInfo.meta?.translations || []).find(t => t.language === 'zh-TW')?.translation || COL;
  const itemTpl = (colInfo.meta?.display_template || '{{id}}').replace(/{{\s*([\w.]+)\s*}}/g, '{{item.$1}}');
  const legacy = SPEC.flatMap(s => s.hide);

  if (DROP) return dropLegacy(legacy);

  const countryOpts = (await get('/fields/people/country'))?.meta?.options || (await get('/fields/faculty/country'))?.meta?.options || {};
  const country = { field: 'country', type: 'string', meta: { interface: 'select-dropdown', options: { choices: countryOpts.choices || [], allowNone: true }, display: 'labels', width: 'half', translations: zh('國家') }, schema: {} };
  const poolNote = n => `全站${n}的唯一來源：其他地方都從這裡選，沒有才新增（新增的會自動加進這裡）`;

  console.log('1) 人名庫／單位庫／職稱庫');
  await ensureCollection('people', { icon: 'person', translations: zh('人名庫'), display_template: '{{nameZh}} {{nameEn}}', note: poolNote('人名') }, [
    text('nameEn', '英文名'), text('nameZh', '中文名'), text('akaEn', 'AKA（英）'), text('akaZh', 'AKA（中）'), country,
    { field: 'isAlumni', type: 'boolean', meta: { interface: 'boolean', width: 'half', translations: zh('系友') }, schema: { default_value: false } }, usedInGroup,
  ]);
  await ensureCollection('organizations', { icon: 'domain', translations: zh('單位庫'), display_template: '{{nameZh}} {{nameEn}}', note: poolNote('單位') }, [text('nameEn', '英文名'), text('nameZh', '中文名'), country, usedInGroup]);
  await ensureCollection('media_outlets', { icon: 'newspaper', translations: zh('媒體庫'), display_template: '{{nameZh}} {{nameEn}}', note: poolNote('媒體') }, [text('nameEn', '英文名'), text('nameZh', '中文名'), country, usedInGroup]);
  await ensureCollection('job_titles', { icon: 'badge', translations: zh('職稱庫'), display_template: '{{nameZh}} {{nameEn}}', note: poolNote('職稱') }, [text('nameEn', '英文名'), text('nameZh', '中文名')]);

  console.log(`2) ${COL}（${colLabel}）改從 pool 選`);
  const sortOf = async f => (await get(`/fields/${COL}/${f}`))?.meta?.sort;  // 新欄位放在舊欄位的位置
  const publicCols = ['people', 'organizations', 'job_titles', 'media_outlets'];
  for (const s of SPEC) {
    if (s.kind === 'credits' || s.kind === 'people') {
      const J = `${COL}_people`;
      await ensureCollection(J, { hidden: true, group: COL, icon: 'import_export' }, [fk('item', colLabel), fk('person', '人名'), sortField]);
      await ensureField(COL, m2m('people', s.label, '{{person.nameZh}} {{person.nameEn}}', { sort: await sortOf(s.src), note: PICK_NOTE('人名庫') + (s.kind === 'credits' ? '。點一下某個人可以填這一場的職稱、單位' : '') }));
      await ensureField('people', reverse(COL, colLabel, 'm2m', itemTpl));
      await ensureRelation({ collection: J, field: 'item', related_collection: COL, meta: { one_field: 'people', junction_field: 'person', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
      // RESTRICT：pool 裡還有地方在用的刪不掉（要先改指到別人＝合併），不會悄悄從頁面上消失
      await ensureRelation({ collection: J, field: 'person', related_collection: 'people', meta: { one_field: COL, junction_field: 'item', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
      publicCols.push(J);
      if (s.kind === 'credits') {
        for (const [sub, pool, f, label, n] of [['titles', 'job_titles', 'title', '這一場的職稱', 5], ['orgs', 'organizations', 'org', '這一場的單位', 6]]) {
          const JX = `${J}_${sub}`;
          await ensureCollection(JX, { hidden: true, group: COL, icon: 'import_export' }, [fk('credit', '出場紀錄'), fk(f, label), sortField]);
          await ensureField(J, m2m(sub, label, `{{${f}.nameZh}} {{${f}.nameEn}}`, { sort: n, note: PICK_NOTE(pool === 'job_titles' ? '職稱庫' : '單位庫') }));
          await ensureRelation({ collection: JX, field: 'credit', related_collection: J, meta: { one_field: sub, junction_field: f, sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
          await ensureRelation({ collection: JX, field: f, related_collection: pool, meta: { one_field: null, junction_field: 'credit', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
          publicCols.push(JX);
        }
      }
    } else if (s.kind === 'orgs') {
      const J = `${COL}_orgs`;
      await ensureCollection(J, { hidden: true, group: COL, icon: 'import_export' }, [fk('item', colLabel), fk('org', '單位'), sortField]);
      await ensureField(COL, m2m('orgs', s.label, '{{org.nameZh}} {{org.nameEn}}', { sort: await sortOf(s.src), note: PICK_NOTE('單位庫') }));
      await ensureField('organizations', reverse(COL, colLabel, 'm2m', itemTpl));
      await ensureRelation({ collection: J, field: 'item', related_collection: COL, meta: { one_field: 'orgs', junction_field: 'org', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
      await ensureRelation({ collection: J, field: 'org', related_collection: 'organizations', meta: { one_field: COL, junction_field: 'item', one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
      publicCols.push(J);
    } else if (s.kind === 'org') {
      const pool = poolOf(s), f = fieldOf(s);
      await ensureField(COL, { field: f, type: 'uuid', schema: { is_nullable: true }, meta: {
        interface: 'select-dropdown-m2o', special: ['m2o'], sort: await sortOf(s.hide[0]), width: 'full', translations: zh(s.label),
        note: `點一下從${POOL_ZH[pool]}搜尋；找不到可以直接新增（會自動加進${POOL_ZH[pool]}）`,
        options: { template: '{{nameZh}} {{nameEn}}', enableCreate: true, enableSelect: true }, display: 'related-values', display_options: { template: '{{nameZh}} {{nameEn}}' },
      } });
      // 反向清單：world 的列沒有自己的名字＝顯示單位名；報導有標題＝照它自己的顯示樣板
      await ensureField(pool, reverse(COL, colLabel, 'o2m', s.pool ? (colInfo.meta?.display_template || '{{id}}') : '{{org.nameZh}} {{org.nameEn}}'));
      await ensureRelation({ collection: COL, field: f, related_collection: pool, meta: { one_field: COL, one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
    } else if (s.kind === 'person') {
      await ensureField(COL, { field: 'person', type: 'uuid', schema: { is_nullable: true }, meta: {
        interface: 'select-dropdown-m2o', special: ['m2o'], sort: await sortOf(s.hide[0]), width: 'full', translations: zh(s.label),
        note: '點一下從人名庫搜尋；找不到可以直接新增（會自動加進人名庫）。名字、AKA、國家改在人名庫（點右邊的編輯鈕）',
        options: { template: '{{nameZh}} {{nameEn}}', enableCreate: true, enableSelect: true }, display: 'related-values', display_options: { template: '{{nameZh}} {{nameEn}}' },
      } });
      await ensureField('people', reverse(COL, colLabel, 'o2m', '{{person.nameZh}} {{person.nameEn}}'));
      await ensureRelation({ collection: COL, field: 'person', related_collection: 'people', meta: { one_field: COL, one_deselect_action: 'nullify' }, schema: { on_delete: 'RESTRICT' } });
    } else if (s.kind === 'mixed') {
      // M2A：一個有順序的清單，每一筆是職稱庫或單位庫的一筆（舊資料兩種混填、順序有意義）
      const pkType = (await get(`/fields/${COL}/id`))?.type || 'uuid';
      await ensureCollection(s.junction, { hidden: true, group: COL, icon: 'import_export' }, [
        { field: 'parent', type: pkType, meta: { hidden: true }, schema: { is_nullable: true } },
        { field: 'collection', type: 'string', meta: { hidden: true }, schema: {} },
        { field: 'item', type: 'string', meta: { hidden: true }, schema: {} },
        sortField,
      ]);
      await ensureField(COL, { field: s.alias, type: 'alias', meta: {
        special: ['m2a'], interface: 'list-m2a', sort: await sortOf(s.src), width: 'full', translations: zh(s.label),
        note: '按「Add Existing」選職稱庫或單位庫再搜尋；找不到才「Create New」（會自動加進那個庫）。可拖曳排順序',
        options: { enableCreate: true, enableSelect: true },
      } });
      await ensureRelation({ collection: s.junction, field: 'item', related_collection: null, meta: { one_allowed_collections: ['job_titles', 'organizations'], one_collection_field: 'collection', junction_field: 'parent' }, schema: null });
      await ensureRelation({ collection: s.junction, field: 'parent', related_collection: COL, meta: { one_field: s.alias, junction_field: 'item', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } });
      publicCols.push(s.junction);
    }
  }
  await ensurePublicRead(publicCols);

  console.log('3) 搬資料');
  const aliases = SPEC.map(s => s.alias || s.field || ({ credits: 'people', people: 'people', orgs: 'orgs', org: 'org', person: 'person' })[s.kind]);
  const haveAlias = [];
  for (const a of aliases) if (await get(`/fields/${COL}/${a}`)) haveAlias.push(a);  // dry 跑在建欄之前＝還沒有，帶上會 400
  const srcFields = [...new Set(SPEC.flatMap(s => s.src ? [s.src] : s.hide))];
  const [pool, orgPool, titlePool, outletPool, rows] = await Promise.all([
    get('/items/people?limit=-1&fields=id,nameEn,nameZh,akaEn,akaZh,country,isAlumni'),
    get('/items/organizations?limit=-1&fields=id,nameEn,nameZh,country'),
    get('/items/job_titles?limit=-1&fields=id,nameEn,nameZh'),
    get('/items/media_outlets?limit=-1&fields=id,nameEn,nameZh,country'),
    get(`/items/${COL}?limit=-1&fields=id,${[...srcFields, ...haveAlias].join(',')}`),
  ]);
  // 已在 pool 的：cur＝pool 現值（空著的欄位舊資料有填就補進去＝fill，已填的不蓋）
  const people = new Map((pool || []).map(p => [keyOf(p.nameEn, p.nameZh), { id: p.id, cur: p }]));
  const orgs = new Map((orgPool || []).map(o => [keyOf(o.nameEn, o.nameZh), { id: o.id, cur: o }]));
  const outlets = new Map((outletPool || []).map(o => [keyOf(o.nameEn, o.nameZh), { id: o.id, cur: o }]));
  const mapOf = s => s.pool === 'media_outlets' ? outlets : orgs;
  const titles = new Map((titlePool || []).map(t => [keyOf(t.nameEn, t.nameZh), { id: t.id }]));
  const isTitle = o => titles.has(keyOf(o.en, o.zh));  // 舊資料裡混在單位欄的職稱：只認職稱庫已有的，其餘一律當單位
  const conflicts = [];
  const want = (map, key, data, label) => {
    const hit = map.get(key);
    if (!hit) { map.set(key, { data }); return; }
    const cur = hit.data || hit.cur;
    for (const k of Object.keys(data)) {
      if (!data[k] || data[k] === cur[k]) continue;
      if (!cur[k] || k === 'isAlumni') { cur[k] = data[k]; if (hit.cur) (hit.fill ||= {})[k] = data[k]; }
      else conflicts.push(`${label}「${key}」${k}：用 ${cur[k]}，另一筆寫 ${data[k]}`);
    }
  };
  const wantOrg = (o, map = orgs, label = '單位') => want(map, keyOf(o.en, o.zh), { nameEn: norm(o.en), nameZh: norm(o.zh), country: cc(o.country) }, label);
  const done = (r, s) => { const v = r[aliases[SPEC.indexOf(s)]]; return Array.isArray(v) ? v.length > 0 : !!v; };
  // 每個 spec 要搬的列＋那列的來源清單（已搬過的跳過）
  const work = SPEC.map(s => (rows || []).filter(r => !done(r, s)).map(r => {
    if (s.kind === 'org') { const o = s.org(r); return { r, list: (o.en || o.zh) ? [o] : [] }; }
    if (s.kind === 'person') return { r, list: (r.nameEn || r.nameZh) ? [r] : [] };
    const raw = (Array.isArray(r[s.src]) ? r[s.src] : []).filter(Boolean);
    if (s.kind === 'orgs') return { r, list: raw.map(s.org).filter(o => o.en || o.zh) };
    if (s.kind === 'mixed') return { r, list: raw.map(x => ({ en: x[s.en], zh: x[s.zh], country: x.country })).filter(o => o.en || o.zh) };
    return { r, list: raw.filter(g => g.nameEn || g.nameZh) };
  }).filter(w => w.list.length));
  SPEC.forEach((s, i) => work[i].forEach(({ list }) => list.forEach(x => {
    if (s.kind === 'org') return wantOrg(x, mapOf(s), s.label);
    if (s.kind === 'orgs') return wantOrg(x);
    if (s.kind === 'mixed') return isTitle(x) ? null : wantOrg(x);
    want(people, keyOf(x.nameEn, x.nameZh), asPerson(x), '人');
    if (s.kind === 'credits') orgsOf(x).filter(o => !isTitle(o)).forEach(o => wantOrg(o));   // 不直接傳 wantOrg：forEach 的 index 會變成第二個參數
  })));
  const newPeople = [...people.values()].filter(v => v.data), newOrgs = [...orgs.values()].filter(v => v.data), newOutlets = [...outlets.values()].filter(v => v.data);
  console.log(`  要搬 ${SPEC.map((s, i) => `${s.label} ${work[i].length} 列`).join('、')}；人名庫新增 ${newPeople.length}（已有 ${(pool || []).length}）、單位庫新增 ${newOrgs.length}（已有 ${(orgPool || []).length}）、職稱庫 ${(titlePool || []).length}（只沿用）${newOutlets.length ? `、媒體庫新增 ${newOutlets.length}（已有 ${(outletPool || []).length}）` : ''}`);
  const fills = [[people, 'people'], [orgs, 'organizations'], [outlets, 'media_outlets']].flatMap(([m, c]) => [...m.values()].filter(v => v.fill).map(v => ({ ...v, c })));
  if (fills.length) console.log(`  pool 已有、空欄位補上 ${fills.length} 筆：\n    ${fills.map(v => `${v.cur.nameEn} ${v.cur.nameZh} ${JSON.stringify(v.fill)}`).join('\n    ')}`);
  const noCountry = newOrgs.filter(v => !v.data.country);
  if (noCountry.length) console.log(`  ⚠️ 沒有國家的新單位（多半是職稱；是的話先在後台職稱庫加上再跑）：\n    ${noCountry.map(v => `${v.data.nameEn} ${v.data.nameZh}`).join('\n    ')}`);
  if (conflicts.length) console.log(`  ⚠️ 同一個人／單位在不同地方寫法不同（pool 只能留一個，用第一次出現的）：\n    ${conflicts.join('\n    ')}`);
  const near = (map, label) => {  // 疑似同一個卻拼法不同（英文同中文不同或反之）＝合併候選
    const byEn = new Map(), byZh = new Map();
    for (const k of map.keys()) { const [en, z] = k.split('|'); if (en && z) { (byEn.get(en) || byEn.set(en, []).get(en)).push(k); (byZh.get(z) || byZh.set(z, []).get(z)).push(k); } }
    const dup = [...byEn.values(), ...byZh.values()].filter(v => v.length > 1);
    if (dup.length) console.log(`  ⚠️ 疑似重複的${label}（中英其中一邊一樣）：\n    ${dup.map(v => v.join('  ／  ')).join('\n    ')}`);
  };
  near(people, '人'); near(orgs, '單位'); near(outlets, '媒體');
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
  await createAll('media_outlets', outlets, newOutlets);
  for (const v of fills) await api('PATCH', `/items/${v.c}/${v.id}`, v.fill);
  const idOf = (map, en, zhName) => map.get(keyOf(en, zhName)).id;
  const postAll = async (collection, list) => { for (let i = 0; i < list.length; i += 100) await api('POST', `/items/${collection}`, list.slice(i, i + 100)); };
  for (const [i, s] of SPEC.entries()) {
    if (s.kind === 'org' || s.kind === 'person') {
      const patch = work[i].map(({ r, list }) => s.kind === 'org'
        ? { id: r.id, [fieldOf(s)]: idOf(mapOf(s), list[0].en, list[0].zh) }
        : { id: r.id, person: idOf(people, list[0].nameEn, list[0].nameZh) });
      for (let k = 0; k < patch.length; k += 100) await api('PATCH', `/items/${COL}`, patch.slice(k, k + 100));
      console.log(`  ✓ ${s.label}：${patch.length} 列指到${s.kind === 'org' ? POOL_ZH[poolOf(s)] : '人名庫'}`);
    } else if (s.kind === 'mixed') {
      const links = work[i].flatMap(({ r, list }) => list.map((o, j) => isTitle(o)
        ? { parent: r.id, collection: 'job_titles', item: idOf(titles, o.en, o.zh), sort: j + 1 }
        : { parent: r.id, collection: 'organizations', item: idOf(orgs, o.en, o.zh), sort: j + 1 }));
      await postAll(s.junction, links);
      console.log(`  ✓ ${s.label}：${links.length} 筆（職稱 ${links.filter(l => l.collection === 'job_titles').length}、單位 ${links.filter(l => l.collection === 'organizations').length}）`);
    } else if (s.kind === 'orgs') {
      const links = work[i].flatMap(({ r, list }) => list.map((o, j) => ({ item: r.id, org: idOf(orgs, o.en, o.zh), sort: j + 1 })));
      await postAll(`${COL}_orgs`, links);
      console.log(`  ✓ ${s.label}：${links.length} 筆連結`);
    } else {
      const links = work[i].flatMap(({ r, list }) => list.map((g, j) => ({
        item: r.id, person: idOf(people, g.nameEn, g.nameZh), sort: j + 1,
        ...(s.kind === 'credits' ? {
          titles: orgsOf(g).filter(isTitle).map((o, k) => ({ title: idOf(titles, o.en, o.zh), sort: k + 1 })),
          orgs: orgsOf(g).filter(o => !isTitle(o)).map((o, k) => ({ org: idOf(orgs, o.en, o.zh), sort: k + 1 })),
        } : {}),
      })));
      await postAll(`${COL}_people`, links);
      console.log(`  ✓ ${s.label}：${links.length} 筆出場紀錄`);
    }
  }

  // 舊欄位藏起來（資料留著：前台新版上線前舊站還在讀）；一列一個單位的表，清單顯示改看單位
  for (const f of legacy) {
    const m = (await get(`/fields/${COL}/${f}`))?.meta;
    if (m && !m.hidden) { console.log(`  · 藏起 ${COL}.${f}`); await api('PATCH', `/fields/${COL}/${f}`, { meta: { hidden: true } }); }
  }
  if (SPEC.some(s => s.kind === 'org' && !s.pool)) await api('PATCH', `/collections/${COL}`, { meta: { display_template: '{{org.nameZh}} {{org.nameEn}}' } });
  if (SPEC.some(s => s.kind === 'person')) await api('PATCH', `/collections/${COL}`, { meta: { display_template: '{{person.nameZh}} {{person.nameEn}}' } });

  // 自驗：讀回來跟舊欄位比（只會差在上面列的「寫法不同」）；職稱排在單位前＝同前台 poolGuests
  const backFields = ['id', ...srcFields];
  if (aliases.includes('people')) backFields.push('people.sort', 'people.person.*');
  if (SPEC.some(s => s.kind === 'credits')) backFields.push('people.titles.sort', 'people.titles.title.*', 'people.orgs.sort', 'people.orgs.org.*');
  if (aliases.includes('orgs')) backFields.push('orgs.sort', 'orgs.org.*');
  for (const s of SPEC) if (s.kind === 'org') backFields.push(`${fieldOf(s)}.*`);
  if (aliases.includes('person')) backFields.push('person.*');
  for (const s of SPEC) if (s.kind === 'mixed') backFields.push(`${s.alias}.sort`, `${s.alias}.collection`, `${s.alias}.item:job_titles.*`, `${s.alias}.item:organizations.*`);
  const back = await get(`/items/${COL}?limit=-1&fields=${backFields.join(',')}`);
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
  const names = list => list.map(x => norm(x.en).toLowerCase() + '/' + norm(x.zh)).join(';');
  let diff = 0;
  for (const r of back) for (const s of SPEC) {
    let was, now;
    if (s.kind === 'org') { const o = s.org(r); was = (o.en || o.zh) ? names([o]) : ''; const v = r[fieldOf(s)]; now = v ? names([{ en: v.nameEn, zh: v.nameZh }]) : ''; }
    else if (s.kind === 'person') {
      const p = r.person || {}, sig = x => [norm(x.nameEn).toLowerCase(), norm(x.nameZh), norm(x.akaEn), norm(x.akaZh), cc(x.country)].join('|');
      was = (r.nameEn || r.nameZh) ? sig(r) : ''; now = r.person ? sig(p) : '';
    }
    else if (s.kind === 'mixed') {
      was = names((r[s.src] || []).filter(Boolean).map(x => ({ en: x[s.en], zh: x[s.zh] })).filter(o => o.en || o.zh));
      now = names((r[s.alias] || []).filter(j => j?.item).sort(bySort).map(j => ({ en: j.item.nameEn, zh: j.item.nameZh })));
    }
    else if (s.kind === 'orgs') { was = names((r[s.src] || []).filter(Boolean).map(s.org).filter(o => o.en || o.zh)); now = names((r.orgs || []).sort(bySort).map(j => ({ en: j.org.nameEn, zh: j.org.nameZh }))); }
    else {
      const src = (r[s.src] || []).filter(g => g && (g.nameEn || g.nameZh));
      was = src.map(g => `${norm(g.nameEn).toLowerCase()}|${norm(g.nameZh)}|${s.kind === 'credits' ? names([...orgsOf(g).filter(isTitle), ...orgsOf(g).filter(o => !isTitle(o))]) : ''}`).join(' ; ');
      now = (r.people || []).sort(bySort).map(j => `${norm(j.person.nameEn).toLowerCase()}|${j.person.nameZh}|${s.kind === 'credits' ? names([...(j.titles || []).sort(bySort).map(t => ({ en: t.title.nameEn, zh: t.title.nameZh })), ...(j.orgs || []).sort(bySort).map(o => ({ en: o.org.nameEn, zh: o.org.nameZh }))]) : ''}`).join(' ; ');
    }
    if (was !== now) { diff++; if (diff <= 8) console.log(`  ✗ ${r.id} ${s.label}\n     舊 ${was}\n     新 ${now}`); }
  }
  console.log(diff ? `  ✗ ${diff} 處對不上` : `  ✓ ${back.length} 列讀回比對全對`);
})().catch(e => { console.error('✗', e.message); process.exit(1); });

// 前台新版上線後：舊欄位備份成 JSON（repo 外）再刪
async function dropLegacy(legacy) {
  const have = [];
  for (const f of legacy) if (await get(`/fields/${COL}/${f}`)) have.push(f);
  if (!have.length) { console.log('· 舊欄位都已刪'); return; }
  const rows = await get(`/items/${COL}?limit=-1&fields=id,${have.join(',')}`);
  const dir = path.resolve('..', 'SCCD-後台舊欄位備份');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${COL}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 1));
  console.log(`  備份 ${rows.length} 列 → ${file}`);
  for (const f of have) { console.log(`  - 刪 ${COL}.${f}`); await api('DELETE', `/fields/${COL}/${f}`); }
}
