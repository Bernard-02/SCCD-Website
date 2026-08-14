// 2026-08-13：country 子欄從 titles（職級 Rank）搬到 occupations（職稱 Title）——
//   職級（兼任講師/教授）不會有國家；會在國外的是兼任的職稱/公司 → 國家欄該掛 occupations。
//   只搬欄位定義、不動資料：唯一有 titles[].country 的是離職 1 筆（曲家林，公司名放 titles），
//   JSON 值留著、前台 former 攤平照舊讀 t.country。idempotent、可重跑。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/faculty-country-move-to-occupations.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) + '…' : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 400)}`);
  return out;
}

(async () => {
  const fields = (await req('GET', '/fields/faculty')).data || [];
  const titles = fields.find(f => f.field === 'titles');
  const occupations = fields.find(f => f.field === 'occupations');
  if (!titles || !occupations) throw new Error('titles/occupations 欄位不在，先確認 collection');

  const tFields = (titles.meta?.options?.fields) || [];
  const oFields = (occupations.meta?.options?.fields) || [];
  const countryDef = tFields.find(f => f.field === 'country');
  const occHasCountry = oFields.some(f => f.field === 'country');

  // 1) occupations 加 country（沿用 titles 的定義＝同一份 39 國 choices）
  if (!occHasCountry) {
    if (!countryDef) throw new Error('titles 已無 country 定義、occupations 也沒有——無來源可搬');
    const def = JSON.parse(JSON.stringify(countryDef));
    def.meta = def.meta || {};
    def.meta.note = '公司/機構所在國家（atlas 副標用）；在台灣或純身份（如：藝術家）留空';
    occupations.meta.options.fields = [...oFields, def];
    console.log('occupations 加 country 子欄...');
    await req('PATCH', '/fields/faculty/occupations', { meta: occupations.meta });
  } else {
    console.log('occupations 已有 country，略過。');
  }

  // 2) titles 移除 country
  if (countryDef) {
    console.log('titles 移除 country 子欄...');
    titles.meta.options.fields = tFields.filter(f => f.field !== 'country');
    await req('PATCH', '/fields/faculty/titles', { meta: titles.meta });
  } else {
    console.log('titles 已無 country，略過。');
  }

  console.log('\n✅ 完成。資料未動（曲家林 titles[].country=tw 保留，前台 former 照舊讀）。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
