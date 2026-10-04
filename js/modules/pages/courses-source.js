/**
 * Curriculum 課程資料源（共用）
 * Directus curriculum_courses（扁平陣列）→ 依 program 分組成 { 'bfa-animation':[], 'bfa-cmd':[], 'mdes':[] }，
 * （courses-map / floating-items 都吃這形狀，靠 flattenToChips 展開）。
 * courses-map（課表）與首頁 floating-items（課程導航 chip）共用本檔 → deep-link slug 兩邊一致。
 *
 * 後台是唯一來源：失敗 → {}（課表空；不再退本地 JSON，user 2026-10-04），不快取失敗＝下次重抓。
 */

import { CMS_API_BASE } from '../../config/api.js';

const CMS_COLLECTION = 'curriculum_courses';
// 2026-06-09 起課表不再分上下學期 → semester 不再使用（後台該欄保留但前端忽略）

// single-flight：cache 的是 Promise 不是結果 → 「prefetch-on-intent」與頁面 init 的並發呼叫共用同一個
// in-flight 請求（只打一次 Directus）；resolve 後 _promise 留著當 cache，同 session 再進 curriculum 即時。
// 失敗才清掉 _promise，允許下次重試。
let _promise = null;

export function loadCourses() {
  if (!_promise) {
    _promise = _fetchCourses().catch(err => {
      console.warn('[courses] CMS fetch failed:', err.message);
      _promise = null;
      return {};
    });
  }
  return _promise;
}

async function _fetchCourses() {
  const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()).data;
  if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
  return groupByProgram(rows);
}

function groupByProgram(rows) {
  const out = {};
  rows.forEach(r => {
    if (!r.program) return;
    (out[r.program] || (out[r.program] = [])).push({
      titleEn: r.titleEn || '',
      titleZh: r.titleZh || '',
      descriptionEn: r.descriptionEn || '',
      descriptionZh: r.descriptionZh || '',
      type: r.type,
      grade: r.grade,
    });
  });
  return out;
}
