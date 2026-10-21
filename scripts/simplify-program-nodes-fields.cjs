// program_nodes 後台欄位簡化（user 2026-10-21「後台設定可以簡化輸入的 slot」）。
//  - 隱藏前台已不讀／老師不需碰的欄：labelKey（只剩前台斷行微調用、取消必填）、divisionKey（點擊跳轉 09-09 已撤）、
//    wordmark（改成「有上傳標準字圖＝顯示」，下拉選單多餘）。只改 meta、不刪欄＝資料保留、可逆。
//  - 剩下的欄位重排＋改白話標籤：名稱（英/中）→ 上一層 → 期程 → 學位 → 標準字圖；上一層下拉改顯示中文名。
// 跑（repo 根目錄）：node scripts/simplify-program-nodes-fields.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'program_nodes';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, JSON.stringify(body)); return; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const META = {
  labelKey:     { hidden: true, required: false },
  divisionKey:  { hidden: true },
  wordmark:     { hidden: true },
  nameEn:       { sort: 3, width: 'half', translations: zh('名稱（英）'), note: '方塊上顯示的英文' },
  nameZh:       { sort: 4, width: 'half', translations: zh('名稱（中）'), note: '方塊上顯示的中文' },
  parent:       { sort: 5, width: 'full', translations: zh('上一層'), note: '這個方塊接在哪一個方塊下面；最上層留空', options: { template: '{{ nameZh }}' } },
  termEn:       { sort: 6, width: 'half', translations: zh('期程（英）'), note: '只填在「學位」那一層，如 4 Years；空＝不顯示' },
  termZh:       { sort: 7, width: 'half', translations: zh('期程（中）'), note: '如 4 年' },
  degreeEn:     { sort: 8, width: 'half', translations: zh('學位（英）'), note: '有填＝這一層是一個學位：Term／Degree 說明卡各列一行，hover 時與樹同色' },
  degreeZh:     { sort: 9, width: 'half', translations: zh('學位（中）'), note: '如 設計學士' },
  wordmarkFile: { sort: 10, width: 'full', translations: zh('標準字圖（只有最上層用）'), note: '實心單色 SVG；沒上傳＝不顯示標準字塊' },
};

(async () => {
  for (const [field, meta] of Object.entries(META)) {
    console.log(`  ${field}`);
    await req('PATCH', `/fields/${COL}/${field}`, { meta });
  }
  await req('PATCH', `/collections/${COL}`, { meta: {
    display_template: '{{ nameZh }}',
    note: '學制樹：一筆＝一個方塊。「上一層」決定樹的層級；同一層的左右順序用拖曳排序。',
  } });
  console.log(`✅ 完成${DRY ? '（DRY，未寫入）' : ''}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
