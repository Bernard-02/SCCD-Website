/**
 * About Programs 學制樹資料源：Directus `program_nodes`（自我參照 parent 表達層級）→ 扁平陣列。
 * Directus 優先、失敗/空 → 本地 /data/program-nodes.json fallback（同 shape）。
 *
 * 每筆＝{ id, parent(母節點 id 或 null), sort, labelKey(degree/BOX_MOD 對照用), divisionKey(可點目標或 null),
 *        wordmark(sccd/scaidc/null), nameEn/nameZh(獨立樹名，空退 ui_labels), termEn/termZh(期程，掛 degree 節點) }。
 * 2026-09-11：樹名改存這裡（nameEn/nameZh）＝與下方 division nav 的 ui_labels 解耦（老師可獨立改樹名）。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../../config/api.js';
import { sitePath } from '../../ui/site-base.js';

export async function loadProgramNodes() {
  try {
    // fields=parent 回 FK id（uuid 字串）／null；wordmarkFile 深取 filename_disk 組 CloudFront URL（當標準字 mask）
    const res = await fetch(`${CMS_API_BASE}/program_nodes?limit=-1&sort=sort&fields=id,parent,sort,labelKey,divisionKey,wordmark,nameEn,nameZh,termEn,termZh,wordmarkFile.filename_disk`);
    if (!res.ok) throw new Error('cms');
    const { data } = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    // 有上傳檔 → CloudFront URL 當 mask；無檔前台退 CSS 預設 SCCD mask（見 about-structure.css .prog-acronym-mark）
    return data.map(n => ({ ...n, wordmarkUrl: n.wordmarkFile?.filename_disk ? `${CMS_CDN_BASE}/${n.wordmarkFile.filename_disk}` : '' }));
  } catch {
    return fetch(sitePath('/data/program-nodes.json')).then(r => r.json());
  }
}
