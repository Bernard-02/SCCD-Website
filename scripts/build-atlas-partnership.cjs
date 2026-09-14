// atlas 合作名單後台化（user 2026-09-15）：開 atlas_workshops（工作營）＋ atlas_industry（產學合作）
// 兩個扁平 collection（只給 atlas 用），把 data-source/partnership.xlsx 的暫時名單 key 進去。
// 前台 atlas-source.js 改讀這兩個 collection（原 activities_workshops/industry 來源退場＝原資料先隱藏）。
// 欄位：nameZh（中文名，可空）/ nameEn（英文名）/ country（ISO 國碼，連 atlas D 國家節點）/ sort（拖曳排序）。
// 同時輸出本地 fallback 快照 data/atlas-partnership-workshops.json / -industry.json（mapped shape）。
// idempotent：collection/欄位/權限已存在會略過；已有 rows 不重複匯入。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-atlas-partnership.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}`, body ? JSON.stringify(body).slice(0, 160) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// xlsx 國家欄是中文名 → ISO（atlas D 節點 key）
const COUNTRY_ISO = {
  '台灣': 'TW', '臺灣': 'TW', '美國': 'US', '日本': 'JP', '荷蘭': 'NL', '泰國': 'TH',
  '中國': 'CN', '德國': 'DE', '丹麥': 'DK', '英國': 'GB', '韓國': 'KR', '義大利': 'IT',
};

function readXlsx() {
  const wb = XLSX.readFile(path.join(__dirname, '..', 'data-source', 'partnership.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const workshops = [], industry = [];
  rows.slice(1).forEach(r => {
    // 欄位：0 工作營中文 | 1 工作營英文 | 2 工作營國家 || 4 產學中文 | 5 產學英文 | 6 產學國家
    if (r[1] || r[0]) workshops.push({ nameZh: r[0] || '', nameEn: r[1] || '', countryZh: r[2] || '' });
    if (r[5] || r[4]) industry.push({ nameZh: r[4] || '', nameEn: r[5] || '', countryZh: r[6] || '' });
  });
  const toIso = (list, label) => list.map(u => {
    let iso = COUNTRY_ISO[String(u.countryZh).trim()] || '';
    if (!iso) {
      // 國立故宮博物院等漏填國家 → 預設台灣（atlas 無國碼＝不建 chip，寧可補 TW）
      iso = 'TW';
      console.log(`  ⚠️ ${label}「${u.nameZh || u.nameEn}」國家欄空/未知（${u.countryZh || '空'}）→ 預設 TW`);
    }
    return { nameZh: u.nameZh, nameEn: u.nameEn, country: iso };
  });
  return { workshops: toIso(workshops, '工作營'), industry: toIso(industry, '產學') };
}

async function buildCollection(col, labelZh, note) {
  const exists = await req('GET', `/collections/${col}`).then(() => true).catch(() => false);
  if (exists) { console.log(`✓ ${col} 已存在`); }
  else {
    console.log(`建立 ${col}...`);
    await req('POST', '/collections', {
      collection: col,
      meta: {
        translations: zh(labelZh), group: 'atlas_folder', note, icon: 'hub',
        sort_field: 'sort', display_template: '{{ nameZh }} {{ nameEn }}',
      },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, has_auto_increment: true } },
      ],
    });
  }
  const FIELDS = [
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, sort: 2 }, schema: {} },
    { field: 'nameZh', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', translations: zh('單位名（中）'), note: '可空＝前台只顯示英文' }, schema: {} },
    { field: 'nameEn', type: 'string', meta: { interface: 'input', sort: 4, width: 'half', translations: zh('單位名（英）') }, schema: {} },
    { field: 'country', type: 'string', meta: { interface: 'input', sort: 5, width: 'half', translations: zh('國家（ISO 代碼）'), note: '兩碼國碼（TW/US/JP…）；連到 atlas 國家節點，空＝不顯示' }, schema: {} },
  ];
  for (const f of FIELDS) {
    await req('POST', `/fields/${col}`, f)
      .then(() => console.log(`  欄位 ${f.field} ✓`))
      .catch(e => console.log(`  欄位 ${f.field}（略過：${e.message.slice(0, 60)}）`));
  }
}

(async () => {
  const { workshops, industry } = readXlsx();
  console.log(`xlsx：工作營 ${workshops.length} 筆、產學 ${industry.length} 筆`);

  await buildCollection('atlas_workshops', '星雲・工作營合作 Atlas Workshops', 'atlas 專用工作營合作單位名單（扁平；activities 頁不吃這裡）');
  await buildCollection('atlas_industry', '星雲・產學合作 Atlas Industry', 'atlas 專用產學合作單位名單（扁平；activities 頁不吃這裡）');

  // Public read
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  for (const col of ['atlas_workshops', 'atlas_industry']) {
    if (!pub) { console.log(`⚠️ 找不到 Public policy，請手動開 ${col} 讀權限`); continue; }
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${col}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log(`✓ ${col} Public read 已開`);
    else { console.log(`開 ${col} Public read...`); await req('POST', '/permissions', { policy: pub.id, collection: col, action: 'read', fields: ['*'] }); }
  }

  // 匯入（已有 rows 就跳過＝idempotent）
  const seed = async (col, rows) => {
    const cur = DRY ? [] : (await req('GET', `/items/${col}?limit=1`)).data || [];
    if (cur.length) { console.log(`✓ ${col} 已有資料，略過匯入`); return; }
    console.log(`匯入 ${col} ${rows.length} 筆...`);
    for (let i = 0; i < rows.length; i++) {
      await req('POST', `/items/${col}`, { ...rows[i], sort: i + 1 });
    }
  };
  await seed('atlas_workshops', workshops);
  await seed('atlas_industry', industry);

  // 本地 fallback 快照（mapped shape＝atlas-source withFallback 讀進來直接用）
  const outDir = path.join(__dirname, '..', 'data');
  fs.writeFileSync(path.join(outDir, 'atlas-partnership-workshops.json'), JSON.stringify(workshops, null, 2));
  fs.writeFileSync(path.join(outDir, 'atlas-partnership-industry.json'), JSON.stringify(industry, null, 2));
  console.log('fallback 快照已寫 data/atlas-partnership-{workshops,industry}.json');

  console.log(`\n✅ atlas partnership 完成${DRY ? '（DRY，未寫入後台）' : ''}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
