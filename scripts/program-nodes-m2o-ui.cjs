// 學制樹後台：期程／學位／跳分頁三個下拉的介面整理（user 2026-10-21）：
//  - 選了之後不顯示鉛筆（選項文字改到左側 about 資料夾的設定表裡改）：Directus 11 的 M2O 鉛筆沒有選項可關，
//    只能用 settings.custom_css 針對這三個欄位藏（以 /* sccd:program-nodes-m2o */ 標記，重跑會覆蓋同一段、不動其他 CSS）。
//  - 沒選時不顯示「+」（不在這裡新增選項）：options.enableCreate=false（併入既有 options）。
//  - 欄位說明文字重寫（上一版用 Git Bash curl 送中文變亂碼）。
// 跑（repo 根目錄）：node scripts/program-nodes-m2o-ui.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 300) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const NOTES = {
  term: '這個班級的期程；選項的新增／改字／排序在左側 about 資料夾的「期程 Term」表。空＝不顯示',
  degree: '這個班級的學位；選項的新增／改字／排序在左側 about 資料夾的「學位 Degree」表。空＝不顯示',
  programTab: '選了＝這個方塊可以點，點了捲到 Programs 並切到這個分頁；空＝不可點',
};
const MARK = '/* sccd:program-nodes-m2o */';
const CSS = `${MARK}
.field[data-collection="program_nodes"]:is([data-field="term"], [data-field="degree"], [data-field="programTab"]) .item-actions .v-icon:has(> i[data-icon="edit"]) { display: none; }
/* /sccd:program-nodes-m2o */`;

(async () => {
  for (const [field, note] of Object.entries(NOTES)) {
    const meta = (await req('GET', `/fields/program_nodes/${field}`)).data.meta;
    console.log(`  ${field}`);
    await req('PATCH', `/fields/program_nodes/${field}`, { meta: { note, options: { ...(meta.options || {}), enableCreate: false } } });
  }
  const cur = (await req('GET', '/settings?fields=custom_css')).data.custom_css || '';
  const kept = cur.replace(/\/\* sccd:program-nodes-m2o \*\/[\s\S]*?\/\* \/sccd:program-nodes-m2o \*\//, '').trim();
  await req('PATCH', '/settings', { custom_css: (kept ? kept + '\n\n' : '') + CSS });
  console.log(`✅ 完成${DRY ? '（DRY，未寫入）' : ''}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
