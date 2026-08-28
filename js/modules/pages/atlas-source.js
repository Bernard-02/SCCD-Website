/**
 * Atlas 圖譜資料源（共用）
 * 把圖譜需要的多個 Directus collection 整合成 atlas.js 期望的形狀，
 * 對齊 faculty-source / courses-source 的 pattern：Directus 優先，失敗/空 → 本地 JSON fallback。
 *
 * ── 已上後台、直接接 Directus（皆有 fallback，CMS 掛掉仍渲染）──
 *   facultyCurrent ← faculty（status=active，共用 faculty-source.getFacultyData）
 *   facultyFormer  ← faculty（status=former，faculty-source.getFormerFacultyData；
 *                    2026-08-04 起 former 併進同一個 faculty collection，不再是獨立的 faculty_former）
 *   companies (co) ← alumni_hosting      （系友任職企業 → 中央橢圓 ring，保留真名）
 *   employment(em) ← alumni_employment   （系友就職企業 → 浮動 chip，帶 country 對到國家 D 節點）
 *   careers        ← alumni_careers      （filter 下方職業輪播）
 *
 * ── workshops / industry ──
 *   接 activities_workshops / activities_industry（＝activities 頁同源）。loadActivityCollection
 *   已 groupByYear + 保留 guests(含 country)＝正好是 atlas 要的「年份 → items → guests」巢狀 shape，
 *   直接沿用（Directus 優先、失敗/空 fallback 本地 workshops.json / industry.json）。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { getFacultyData, getFormerFacultyData } from './faculty-source.js';
import { loadActivityCollection } from './activities-source.js';
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
      // 在職教師（與 faculty 卡片頁同源 + 同 cache）；getFacultyData 內含本地 fallback
      getFacultyData().catch(() => null),
      // 離職教師（同一個 faculty collection，status=former；失敗 → 本地 fallback）
      getFormerFacultyData().catch(async () => {
        console.warn('[atlas] faculty(former) CMS 取得失敗，fallback /data/faculty-former.json');
        return fetch(sitePath('/data/faculty-former.json')).then(r => r.json()).catch(() => null);
      }),
      // co 環：系友任職企業（companyEn/Zh → nameEn/Zh，對齊 atlas-companies.json 形狀；country 2026-08-03 加）
      withFallback('alumni_hosting', 'alumni_hosting', '/data/atlas-companies.json',
        r => ({ nameEn: r.companyEn || '', nameZh: r.companyZh || '', country: r.country || '' })),
      // em 浮動：系友就職企業（保留 country，atlas 內對到 canonical 國家）
      // fallback 必要：D 國家節點從 em/guest 的 country 動態生成，em 沒 fallback 時 CMS 一掛
      // （待機 overlay 每次 mount 重抓，長時間掛機斷網最常見）國家就只剩 workshops.json 的 TW/SG 兩顆
      //（user 2026-07-16 報「放很久國家 chip 剩兩個」真相；fallback 檔已是 mapped shape，見 withFallback）
      withFallback('alumni_employment', 'alumni_employment', '/data/alumni-employment.json',
        r => ({ textEn: r.companyEn || '', textZh: r.companyZh || '', country: r.country || '' })),
      // 職業輪播；無 fallback → 失敗時用內建 ALUMNI_CAREERS
      withFallback('alumni_careers', 'alumni_careers', null,
        r => ({ en: r.careerEn || '', zh: r.careerZh || '' })),
      // 工作營 / 產學：接 activities collection（同 activities 頁；含本地 fallback，見檔頭說明）
      loadActivityCollection('activities_workshops', '/data/workshops.json').catch(() => null),
      loadActivityCollection('activities_industry', '/data/industry.json').catch(() => null),
    ]);

  return { facultyCurrent, facultyFormer, companies, employment, careers, workshops, industry };
}
