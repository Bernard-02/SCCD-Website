// 後台清單顯示優化（純 meta、不動資料）：
// 1) guests：list view 欄＋repeater 收合列 帶出 isAlumni → 名字後有「true」＝有勾校友、空白＝沒勾（false＝勾過又取消）
// 2) locations：list view 欄從原始 JSON 改為「場館 城市」（formatted-json-value）；收合列補城市
// 對所有含 guests / locations（list interface）的 collection 生效（activities 全系列＋summer_camp＋sessions）。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/set-guests-locations-list-display.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const targets = all.filter(f =>
    (f.field === 'guests' || f.field === 'locations') &&
    f.meta?.interface === 'list' && /^activities_|^admission_summer_camp$/.test(f.collection));

  for (const f of targets) {
    const subs = (f.meta.options?.fields || []).map(s => s.field);
    const changes = [];
    f.meta.options ||= {};
    f.meta.display_options ||= {};

    if (f.field === 'guests' && subs.includes('isAlumni')) {
      // 收合列：名字後帶 isAlumni（true＝校友）
      const t = f.meta.options.template || '{{ nameZh }} {{ nameEn }}';
      if (!t.includes('isAlumni')) { f.meta.options.template = `${t} {{ isAlumni }}`; changes.push('row template + isAlumni'); }
      // list view 欄：同樣帶 isAlumni
      const d = f.meta.display_options.format || '{{ nameZh }}';
      if (!d.includes('isAlumni')) { f.meta.display_options.format = `${d} {{ isAlumni }}`; changes.push('display + isAlumni'); }
      f.meta.display = 'formatted-json-value';
    }

    if (f.field === 'locations') {
      const city = subs.includes('cityZh') ? ' {{ cityZh }}' : '';
      // list view 欄：原本無 display＝吐原始 JSON → 場館＋城市
      if (!f.meta.display) {
        f.meta.display = 'formatted-json-value';
        f.meta.display_options.format = `{{ nameZh }}${city}`;
        changes.push(`display「{{ nameZh }}${city}」`);
      }
      // 收合列補城市
      const t = f.meta.options.template || '{{ nameZh }} {{ nameEn }}';
      if (city && !t.includes('cityZh')) { f.meta.options.template = `${t}${city}`; changes.push('row template + cityZh'); }
    }

    if (!changes.length) { console.log(`↷ ${f.collection}.${f.field} 已符合，跳過`); continue; }
    await req('PATCH', `/fields/${f.collection}/${f.field}`, { meta: f.meta });
    if (!DRY) {
      const chk = (await req('GET', `/fields/${f.collection}/${f.field}`)).data;
      if (f.field === 'guests' && !(chk.meta?.display_options?.format || '').includes('isAlumni'))
        throw new Error(`${f.collection}.guests 寫入後驗證失敗`);
    }
    console.log(`✓ ${f.collection}.${f.field}：${changes.join('、')}`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台硬重整（Ctrl+F5）後生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
