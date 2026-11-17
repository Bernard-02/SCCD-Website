/**
 * Guest 單位（org）正規化 — 全站單一 precedence 來源。
 *
 * 一個 guest 可掛多個單位：新 `orgs[]` repeater（多單位，2026-09-07）優先；沒填才退回 legacy 單一
 * orgEn/orgZh/orgCountry（更舊的 fallback JSON 是 affiliation/affiliation_zh）。回傳 [{ en, zh, country }]，
 * country = ISO code（或空）。activities 清單 guest 渲染 + 標題國旗/搜尋聚合 + atlas 合作單位/國家推導三方共用，
 * 避免各自實作 precedence 走鐘（editor 只填 orgs[] 時 legacy 為空、三方都要看得到）。
 *
 * ⚠️ orgs「有實際內容」才用 orgs（忽略 legacy 單欄）→ 過渡期兩邊都填也不會重複計；
 *    但 orgs 只是誤加的空列（filter 後為空）→ 落回 legacy，不讓 legacy org 靜默消失。
 *    filter(Boolean) 先剔除 null 元素（JSON 陣列合法值）避免 map 解參爆 TypeError。
 */
// 人名庫（後台 people／organizations／job_titles，user 2026-11-17；先 lectures 試用）：活動的 people（M2M junction 列：
// person＝人、titles／orgs＝這一場的職稱／單位）攤回舊 guests repeater 的 shape → 下游渲染／搜尋／國旗照舊吃 guests。
// 職稱照舊排進 orgs（排在單位前、沒有國家）＝顯示位置跟搬家前一樣（舊資料本來就把職稱填在單位欄）。
// 深取欄位＝POOL_GUEST_FIELDS（前綴 people.）。
// POOL_COLLECTIONS＝已改從人名庫選的 collection（scripts/setup-people-pool.cjs 跑過的；跑完一個加一個）
export const POOL_COLLECTIONS = new Set(['activities_lectures']);
export const POOL_GUEST_FIELDS = 'people.sort,people.person.*,people.titles.sort,people.titles.title.*,people.orgs.sort,people.orgs.org.*';
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
const linked = (rows, key) => (rows || []).filter(r => r?.[key]).sort(bySort).map(r => r[key]);
export function poolGuests(rows) {
  return rows.filter(j => j?.person).sort(bySort).map(({ person: p, titles, orgs }) => ({
    nameEn: p.nameEn || '', nameZh: p.nameZh || '', akaEn: p.akaEn || '', akaZh: p.akaZh || '',
    country: p.country || '', isAlumni: !!p.isAlumni,
    orgs: [...linked(titles, 'title'), ...linked(orgs, 'org')].map(o => ({ orgEn: o.nameEn || '', orgZh: o.nameZh || '', orgCountry: o.country || '' })),
  }));
}

export function guestOrgs(g) {
  if (g && Array.isArray(g.orgs) && g.orgs.length) {
    const orgs = g.orgs
      .filter(Boolean)
      .map(o => ({ en: o.orgEn || o.en || '', zh: o.orgZh || o.zh || '', country: o.orgCountry || o.country || '' }))
      .filter(o => o.en || o.zh || o.country);
    if (orgs.length) return orgs;
  }
  const en = (g && (g.orgEn || g.affiliation)) || '';
  const zh = (g && (g.orgZh || g.affiliation_zh)) || '';
  const country = (g && g.orgCountry) || '';
  return (en || zh || country) ? [{ en, zh, country }] : [];
}
