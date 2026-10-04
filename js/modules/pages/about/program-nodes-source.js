/**
 * About Programs 學制樹資料源：Directus `program_nodes`（自我參照 parent 表達層級）→ 扁平陣列。
 * 後台是唯一來源：失敗/空 → []（樹不渲染；不再退本地 JSON，user 2026-10-04）。
 *
 * 每筆＝{ id, parent(母節點 id 或 null), sort, labelKey(degree/BOX_MOD 對照用), divisionKey(可點目標或 null),
 *        wordmark(sccd/scaidc/null), nameEn/nameZh(獨立樹名，空退 ui_labels),
 *        termEn/termZh(期程) / degreeEn/degreeZh(學位)：兩者都掛 degree 節點、Term/Degree 說明卡各自 render }。
 * 2026-09-11：樹名改存這裡（nameEn/nameZh）＝與下方 division nav 的 ui_labels 解耦（老師可獨立改樹名）。
 */
import { CMS_API_BASE, cdnUrl } from '../../../config/api.js';

export async function loadProgramNodes() {
  try {
    // fields=parent 回 FK id（uuid 字串）／null；wordmarkFile 深取 filename_disk 組 CloudFront URL（當標準字 mask）
    const res = await fetch(`${CMS_API_BASE}/program_nodes?limit=-1&sort=sort&fields=id,parent,sort,labelKey,divisionKey,wordmark,nameEn,nameZh,termEn,termZh,degreeEn,degreeZh,wordmarkFile.filename_disk`);
    if (!res.ok) throw new Error('cms');
    const { data } = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    // 有上傳檔 → CloudFront URL 當 mask；無檔前台退 CSS 預設 SCCD mask（見 about-structure.css .prog-acronym-mark）
    return data.map(n => ({ ...n, wordmarkUrl: cdnUrl(n.wordmarkFile) }));
  } catch (err) {
    console.warn('[about] program_nodes CMS 失敗:', err.message);
    return [];
  }
}
