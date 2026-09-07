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
