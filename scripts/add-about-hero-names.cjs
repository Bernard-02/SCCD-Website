// about hero 中英系名改後台可編（user 2026-10-27）：about_vision（singleton）加兩個 repeater `heroNamesEn`／`heroNamesZh`（每筆一個 text）。
//   筆數不限；兩筆以上前台每隔幾秒依拖曳順序輪播、循環回第一筆，中英同一拍換（about-data-loader.js initHeroNameCycle）。
//   換行＝畫面上換行；清空＝前台顯示 about.html 寫的預設系名。
// 非破壞：只新增欄位＋空著時預填目前的系名；Public 權限若是明列欄位就補上新欄（fields:* 則不用動）。idempotent、可重跑。
// 跑（repo 根目錄）：node --use-system-ca scripts/add-about-hero-names.cjs [--dry]
//   （主機沒送中繼憑證、Node 內建 CA 驗不過；--use-system-ca 吃 Windows 憑證庫，不必關 TLS 驗證）
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const C = 'about_vision';

const FIELDS = [
  { field: 'heroNamesEn', sort: 1, label: '頁面最上方英文系名（輪播）', side: '左半邊的英文系名',
    seed: 'Department of\nCommunications Design,\nShih Chien University' },
  { field: 'heroNamesZh', sort: 2, label: '頁面最上方中文系名（輪播）', side: '右半邊的中文系名',
    seed: '實踐大學媒體傳達設計學系' },
];

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 260) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  for (const F of FIELDS) {
    const { data: fields } = await req('GET', `/fields/${C}`);
    if (fields.some((f) => f.field === F.field)) { console.log(`${F.field} 已存在，略過建立`); continue; }
    // 新欄排在指定位置（hero 在頁面最上方），位置之後的欄位往後挪一格
    for (const f of fields.filter((f) => f.meta && f.meta.sort != null && f.meta.sort >= F.sort)) {
      await req('PATCH', `/fields/${C}/${f.field}`, { meta: { sort: f.meta.sort + 1 } });
    }
    await req('POST', `/fields/${C}`, {
      field: F.field,
      type: 'json',
      meta: {
        interface: 'list', sort: F.sort, width: 'full',
        translations: [{ language: 'zh-TW', translation: F.label }],
        note: `關於頁最上方${F.side}。每筆一個，換行＝畫面上換行；兩筆以上每 5 秒自動換下一筆、依拖曳順序循環（中英同一拍換）。全部清空＝顯示預設系名`,
        options: {
          template: '{{text}}',
          addLabel: '新增一個系名',
          fields: [{
            field: 'text', type: 'text', name: '系名',
            meta: { interface: 'input-multiline', width: 'full', translations: [{ language: 'zh-TW', translation: '系名' }] },
          }],
        },
      },
      schema: { is_nullable: true },
    });
    console.log(`已建立 ${C}.${F.field}`);
  }

  // Public 讀取權限：明列欄位（非 *）才需要補
  const { data: perms } = await req('GET', `/permissions?filter[collection][_eq]=${C}&filter[action][_eq]=read&limit=-1&fields=id,fields,policy`);
  for (const p of perms) {
    const have = p.fields || [];
    const missing = FIELDS.map((F) => F.field).filter((f) => !have.includes('*') && !have.includes(f));
    if (!missing.length) continue;
    await req('PATCH', `/permissions/${p.id}`, { fields: [...have, ...missing] });
    console.log(`權限 ${p.id}（policy ${p.policy}）補上 ${missing.join(', ')}`);
  }

  if (!DRY) {
    const { data: item } = await req('GET', `/items/${C}?fields=${FIELDS.map((F) => F.field).join(',')}`);
    for (const F of FIELDS) {
      if (Array.isArray(item?.[F.field]) && item[F.field].length) { console.log(`${F.field} 已有系名，不覆蓋`); continue; }
      await req('PATCH', `/items/${C}`, { [F.field]: [{ text: F.seed }] });
      console.log(`${F.field} 已預填目前的系名`);
    }
  }
  console.log(DRY ? '\n（dry run：以上 POST/PATCH 未實際送出）' : '\n✅ 完成');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
