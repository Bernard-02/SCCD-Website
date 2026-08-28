// 在 library_press 加 monthDay（單一字串欄，格式 MM-DD）。年份保留在 year 欄，這欄只 key 月日。
// 前台 press 列表排序改吃「year + monthDay」的年月日順序（見 library-panels.js mapDirectusPressRow / initPressPanel）。
// idempotent：已存在就跳過。跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-library-press-monthday.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const META = {
  interface: 'input',
  sort: 6,                 // 接在 year(=5) 之後
  width: 'half',
  options: { placeholder: '例：06/15' },
  note: '月/日（格式 MM/DD，例 06/15）。年份填在上方 year 欄；此欄只決定同年份內的排序，留空則排在該年最後。',
  translations: zh('月日'),
};

(async () => {
  const existing = new Set((await req('GET', '/fields/library_press')).data.map(f => f.field));
  if (existing.has('monthDay')) {
    await req('PATCH', '/fields/library_press/monthDay', { meta: META });
    console.log('  monthDay 已存在 → 更新 placeholder / note（月/日）');
    return;
  }

  await req('POST', '/fields/library_press', { field: 'monthDay', type: 'string', meta: META, schema: {} });
  console.log('  ＋ monthDay（string，MM/DD）');
  console.log('✅ library_press monthDay 欄位建置完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
