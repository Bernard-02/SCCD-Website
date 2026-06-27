/**
 * Curriculum 課程資料源（共用）
 * Directus curriculum_courses（扁平陣列）→ 依 program 分組成 { 'bfa-animation':[], 'bfa-cmd':[], 'mdes':[] }，
 * 對齊舊 /data/courses.json 的 shape（courses-map / floating-items 都吃這形狀，靠 flattenToChips 展開）。
 * courses-map（課表）與首頁 floating-items（課程導航 chip）共用本檔 → deep-link slug 兩邊一致。
 *
 * Directus 失敗 → fallback 本地 /data/courses.json（舊 parts-based 結構，flattenToChips 同樣能吃）。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const CMS_COLLECTION = 'curriculum_courses';
const FALLBACK_JSON = '/data/courses.json';
// 2026-06-09 起課表不再分上下學期 → semester 不再使用（後台該欄保留但前端忽略）

// single-flight：cache 的是 Promise 不是結果 → 「prefetch-on-intent」與頁面 init 的並發呼叫共用同一個
// in-flight 請求（只打一次 Directus）；resolve 後 _promise 留著當 cache，同 session 再進 curriculum 即時。
// 失敗才清掉 _promise，允許下次重試（避免 cache 住 rejected promise）。
let _promise = null;

export function loadCourses() {
  if (!_promise) _promise = _fetchCourses().catch(err => { _promise = null; throw err; });
  return _promise;
}

async function _fetchCourses() {
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return groupByProgram(rows);
  } catch (err) {
    console.warn('[courses] CMS fetch failed, fallback to /data/courses.json:', err.message);
    return fetch(sitePath(FALLBACK_JSON)).then(r => r.json());
  }
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
