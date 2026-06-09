/**
 * Curriculum 課程資料源（共用）
 * Directus curriculum_courses（扁平陣列）→ 依 program 分組成 { 'bfa-animation':[], 'bfa-cmd':[], 'mdes':[] }，
 * 對齊舊 /data/courses.json 的 shape（courses-map / floating-items 都吃這形狀，靠 flattenToChips 展開）。
 * courses-map（課表）與首頁 floating-items（課程導航 chip）共用本檔 → deep-link slug 兩邊一致。
 *
 * Directus 失敗 → fallback 本地 /data/courses.json（舊 parts-based 結構，flattenToChips 同樣能吃）。
 */

import { CMS_API_BASE } from '../../config/api.js';

const CMS_COLLECTION = 'curriculum_courses';
const FALLBACK_JSON = '/data/courses.json';
// 2026-06-09 起課表不再分上下學期 → semester 不再使用（後台該欄保留但前端忽略）

let _cache = null;

export async function loadCourses() {
  if (_cache) return _cache;
  try {
    const res = await fetch(`${CMS_API_BASE}/${CMS_COLLECTION}?limit=-1&sort=sort`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    _cache = groupByProgram(rows);
  } catch (err) {
    console.warn('[courses] CMS fetch failed, fallback to /data/courses.json:', err.message);
    _cache = await fetch(FALLBACK_JSON).then(r => r.json());
  }
  return _cache;
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
