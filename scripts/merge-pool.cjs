// 合併人名庫／單位庫／職稱庫裡的重複（user 2026-11-17）：用到「併掉那筆」的地方全部改指到「留下那筆」，
// 留下那筆空著的欄位用併掉那筆補上，最後刪掉併掉那筆。
// 用到的地方從後台關聯自動找（M2O／M2M 連結表／師資的 M2A 混合清單）＝之後新增欄位也不用改這支。
// 同一筆資料兩個都連到（例：一場活動同時掛了兩種寫法）＝只留一個連結。
//
// 用法（名字寫「英文|中文」，英文不分大小寫；可以一次給好幾對）：
//   node scripts/merge-pool.cjs <people|organizations|job_titles> "<留下 英文|中文>" "<併掉 英文|中文>" [更多成對…] [--dry]
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN。

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // *.usc.edu.tw 萬用憑證對不上裸連線
const fs = require('fs');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = 'https://sccdadmin.usc.edu.tw';
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');
const [POOL, ...names] = process.argv.slice(2).filter(a => a !== '--dry');
if (!['people', 'organizations', 'job_titles'].includes(POOL) || !names.length || names.length % 2) {
  console.error('用法：node scripts/merge-pool.cjs <people|organizations|job_titles> "<留下 英文|中文>" "<併掉 英文|中文>" [更多成對…] [--dry]'); process.exit(1);
}
const api = async (method, p, body) => {
  if (DRY && method !== 'GET') return null;
  const res = await fetch(BASE + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j && j.data;
};
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const keyOf = (en, zh) => `${norm(en).toLowerCase()}|${norm(zh)}`;
const FILL = { people: ['nameEn', 'nameZh', 'akaEn', 'akaZh', 'country', 'isAlumni'], organizations: ['nameEn', 'nameZh', 'country'], job_titles: ['nameEn', 'nameZh'] }[POOL];

(async () => {
  const [rows, rels] = await Promise.all([api('GET', `/items/${POOL}?limit=-1&fields=id,${FILL.join(',')}`), api('GET', '/relations?limit=-1')]);
  const byKey = new Map(rows.map(r => [keyOf(r.nameEn, r.nameZh), r]));
  // 指到這個 pool 的地方：一般關聯（欄位直接存 id）＋ M2A（item 存 id、另一欄記是哪個 collection）
  const refs = [
    ...rels.filter(r => r.related_collection === POOL).map(r => ({ c: r.collection, f: r.field, jf: r.meta?.junction_field || null })),
    ...rels.filter(r => (r.meta?.one_allowed_collections || []).includes(POOL)).map(r => ({ c: r.collection, f: r.field, jf: r.meta.junction_field, cf: r.meta.one_collection_field })),
  ];
  const q = (ref, id, extra = '') => `/items/${ref.c}?limit=-1&fields=id${ref.jf ? ',' + ref.jf : ''}&filter[${ref.f}][_eq]=${id}${ref.cf ? `&filter[${ref.cf}][_eq]=${POOL}` : ''}${extra}`;

  for (let i = 0; i < names.length; i += 2) {
    const [keepName, dropName] = [names[i], names[i + 1]].map(s => s.split('|'));
    const keep = byKey.get(keyOf(...keepName)), drop = byKey.get(keyOf(...dropName));
    if (!keep || !drop) { console.log(`✗ 找不到：${!keep ? names[i] : names[i + 1]}`); continue; }
    if (keep.id === drop.id) { console.log(`· 同一筆：${names[i]}`); continue; }
    let moved = 0, deduped = 0;
    for (const ref of refs) {
      for (const row of await api('GET', q(ref, drop.id))) {
        // 同一個上層（同一場活動／同一位老師）已經連到留下那筆 → 只刪這條、不改指
        const twin = ref.jf && (await api('GET', q(ref, keep.id, `&filter[${ref.jf}][_eq]=${row[ref.jf]}`))).length;
        if (twin) { await api('DELETE', `/items/${ref.c}/${row.id}`); deduped++; }
        else { await api('PATCH', `/items/${ref.c}/${row.id}`, { [ref.f]: keep.id }); moved++; }
      }
    }
    const fill = {};
    for (const k of FILL) if (!keep[k] && drop[k]) fill[k] = drop[k];
    if (Object.keys(fill).length) await api('PATCH', `/items/${POOL}/${keep.id}`, fill);
    await api('DELETE', `/items/${POOL}/${drop.id}`);
    console.log(`${DRY ? '[dry] ' : '✓ '}${norm(dropName.join(' '))} → ${norm(keepName.join(' '))}：改指 ${moved}${deduped ? `、重複刪 ${deduped}` : ''}${Object.keys(fill).length ? `、補 ${JSON.stringify(fill)}` : ''}`);
  }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
