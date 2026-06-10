/**
 * Atlas 圖譜資料源（共用）
 * 把圖譜需要的多個 Directus collection 整合成 atlas.js 期望的形狀，
 * 對齊 faculty-source / courses-source 的 pattern：Directus 優先，失敗/空 → 本地 JSON fallback。
 *
 * ── 已上後台、直接接 Directus（皆有 fallback，CMS 掛掉仍渲染）──
 *   facultyCurrent ← faculty_fulltime + faculty_parttime + faculty_admin（共用 faculty-source.getFacultyData）
 *   facultyFormer  ← faculty_former
 *   companies (co) ← alumni_hosting      （系友任職企業 → 中央橢圓 ring，保留真名）
 *   employment(em) ← alumni_employment   （系友就職企業 → 浮動 chip，帶 country 對到國家 D 節點）
 *   careers        ← alumni_careers      （filter 下方職業輪播）
 *
 * ── 尚未上後台 → 仍讀本地 ──
 *   workshops / industry：Directus collection（activities_workshops / activities_industry）已建但 0 筆，
 *   且為扁平 shape，與 atlas 需要的「年份 → items → guests」巢狀結構不符；待後台補資料 + 對齊 shape 再接。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { getFacultyData } from './faculty-source.js';
import { sitePath } from '../ui/site-base.js';

// 抓 collection 全部 rows（依後台 sort）；空陣列視為「沒資料」往 fallback 走
async function cmsRows(collection) {
  const res = await fetch(`${CMS_API_BASE}/${collection}?limit=-1&sort=sort`);
  if (!res.ok) throw new Error(`${collection} HTTP ${res.status}`);
  const rows = (await res.json()).data;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${collection} empty`);
  return rows;
}

// Directus 優先；失敗/空 → 本地 JSON（fallbackPath 為 null 時回 null，由呼叫端用內建 mock 兜底）
async function withFallback(label, collection, fallbackPath, mapFn) {
  try {
    const rows = await cmsRows(collection);
    return mapFn ? rows.map(mapFn) : rows;
  } catch (err) {
    console.warn(`[atlas] ${label} CMS 取得失敗${fallbackPath ? '，fallback ' + fallbackPath : ''}:`, err.message);
    if (!fallbackPath) return null;
    return fetch(sitePath(fallbackPath)).then(r => r.json()).catch(() => null);
  }
}

export async function loadAtlasData() {
  const [facultyCurrent, facultyFormer, companies, employment, careers, workshops, industry] =
    await Promise.all([
      // 在職教師（合併三 collection，與 faculty 卡片頁同源 + 同 cache）；getFacultyData 內含本地 fallback
      getFacultyData().catch(() => null),
      // 離職教師
      withFallback('faculty_former', 'faculty_former', '/data/faculty-former.json'),
      // co 環：系友任職企業（companyEn/Zh → nameEn/Zh，對齊 atlas-companies.json 形狀）
      withFallback('alumni_hosting', 'alumni_hosting', '/data/atlas-companies.json',
        r => ({ nameEn: r.companyEn || '', nameZh: r.companyZh || '' })),
      // em 浮動：系友就職企業（保留 country，atlas 內對到 canonical 國家）；無 fallback → 失敗時用內建 mock
      withFallback('alumni_employment', 'alumni_employment', null,
        r => ({ textEn: r.companyEn || '', textZh: r.companyZh || '', country: r.country || '' })),
      // 職業輪播；無 fallback → 失敗時用內建 ALUMNI_CAREERS
      withFallback('alumni_careers', 'alumni_careers', null,
        r => ({ en: r.careerEn || '', zh: r.careerZh || '' })),
      // 工作營 / 產學：暫讀本地（見檔頭說明）
      fetch(sitePath('data/workshops.json')).then(r => r.json()).catch(() => null),
      fetch(sitePath('data/industry.json')).then(r => r.json()).catch(() => null),
    ]);

  return { facultyCurrent, facultyFormer, companies, employment, careers, workshops, industry };
}
