// activities 各 collection（含 summer_camp）加根層級 year 整數欄＋從日期回填。
// 動機：Directus 後台搜尋框對數字查詢只比對根層級數字欄（實測 library_press?search=2025 命中）；
//       dates repeater 是 json 欄，搜尋/篩選都吃不到 → 編輯者打 2025 什麼都搜不到。
// year 值 = dates repeater 第一組 start 的年（同前台分組鍵 dates[0].startYear）→ 退 startDate 年。
// 偵測式選集：有 dates(json) 或 startDate 欄的 collection；已有 year 欄的（industry / degree_show 等）跳過建欄、仍補回填。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-activities-year-field.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}${body ? ' ' + JSON.stringify(body).slice(0, 120) : ''}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const YEAR_FIELD = {
  field: 'year', type: 'integer',
  meta: { interface: 'input', width: 'half',
          note: '年份（後台搜尋框輸入年份靠此欄命中）。既有資料已由日期自動回填；新增活動請順手填寫。' },
  schema: {},
};

const yearOf = (it) => {
  if (Array.isArray(it.dates)) {
    const d = it.dates.find(x => x && x.start);
    if (d) { const y = +String(d.start).slice(0, 4); if (y) return y; }
  }
  if (it.startDate) { const y = +String(it.startDate).slice(0, 4); if (y) return y; }
  return null;
};

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const byCol = {};
  for (const f of all) (byCol[f.collection] ||= new Set()).add(f.field);
  const targets = Object.keys(byCol)
    .filter(c => /^activities_|^admission_summer_camp$/.test(c))
    .filter(c => byCol[c].has('dates') || byCol[c].has('startDate'))
    .sort();
  console.log('目標 collections：', targets.join(', '));

  for (const col of targets) {
    // 1) 建欄（已有就跳過）＋輪詢驗證（弱機 schema 寫入要確認真的建成）
    if (byCol[col].has('year')) {
      console.log(`\n${col}：已有 year 欄`);
    } else {
      console.log(`\n${col}：建 year 欄`);
      await req('POST', `/fields/${col}`, YEAR_FIELD);
      if (!DRY) {
        let ok = false;
        for (let i = 0; i < 5 && !ok; i++) {
          await new Promise(r => setTimeout(r, 800));
          ok = !!(await req('GET', `/fields/${col}/year`).catch(() => null))?.data?.field;
        }
        if (!ok) throw new Error(`${col}.year 建欄後驗證不到，中止（勿繼續打弱機）`);
        console.log('  ✓ 建欄驗證通過');
      }
    }

    // 2) 回填：dates[0].start 年 → 退 startDate 年；已相同就跳過
    // fields 只帶該 collection 實有的欄（year 剛建/dry 沒建、部分表無 dates → 帶了就 403）
    const hasYear = byCol[col].has('year');
    const flds = ['id', byCol[col].has('dates') && 'dates', byCol[col].has('startDate') && 'startDate', hasYear && 'year'].filter(Boolean).join(',');
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=${flds}`)).data || [];
    let set = 0, skip = 0, none = 0;
    for (const it of rows) {
      const y = yearOf(it);
      if (!y) { none++; continue; }
      if (it.year === y) { skip++; continue; }
      await req('PATCH', `/items/${col}/${it.id}`, { year: y });
      set++;
    }
    console.log(`  回填 ${set} 筆、已同 ${skip}、無日期 ${none}（共 ${rows.length}）`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台搜尋框輸入年份（如 2025）即可命中該年資料。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
