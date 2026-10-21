/**
 * About Programs 學制樹資料源：Directus `program_nodes`（自我參照 parent 表達層級）＋ `program_terms` / `program_degrees`
 * （Term／Degree 說明卡的項目，sort＝後台拖曳順序）。
 * 後台是唯一來源：nodes 失敗/空 → nodes []（樹不渲染）；terms/degrees 失敗 → []（說明卡只剩標題，樹照常）。
 *
 * nodes 每筆＝{ id, parent(母節點 id 或 null), sort, labelKey(後台隱藏，只剩 BOX_MOD 斷行微調用), nameEn/nameZh(樹名),
 *        term/degree(班級選的期程/學位 id，空＝null), tab(點擊跳到的 Programs 分頁 divisionKey，空＝不可點),
 *        wordmarkUrl(頂層標準字，沒上傳＝不畫) }。
 * terms/degrees 每筆＝{ id, nameEn, nameZh }。
 */
import { CMS_API_BASE, cdnUrl, fetchCmsJson } from '../../../config/api.js';

const rows = (path) => fetchCmsJson(`${CMS_API_BASE}/${path}`).catch((err) => {
  console.warn(`[about] ${path.split('?')[0]} CMS 失敗:`, err.message);
  return [];
});

export async function loadProgramNodes() {
  // fields=parent/term/degree 回 FK id（uuid 字串）／null；programTab 深取 divisionKey（＝前台 data-division）；
  // wordmarkFile 深取 filename_disk 組 CloudFront URL（當標準字 mask）
  const [nodes, terms, degrees] = await Promise.all([
    rows('program_nodes?limit=-1&sort=sort&fields=id,parent,sort,labelKey,nameEn,nameZh,term,degree,programTab.divisionKey,wordmarkFile.filename_disk'),
    rows('program_terms?limit=-1&sort=sort&fields=id,nameEn,nameZh'),
    rows('program_degrees?limit=-1&sort=sort&fields=id,nameEn,nameZh'),
  ]);
  return {
    nodes: (nodes || []).map((n) => ({ ...n, tab: n.programTab?.divisionKey || null, wordmarkUrl: cdnUrl(n.wordmarkFile) })),
    terms: terms || [], degrees: degrees || [],
  };
}
