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
 *   2026-09-15 user：改接 atlas 專用扁平名單 atlas_workshops / atlas_industry（partnership.xlsx 匯入，
 *   scripts/build-atlas-partnership.cjs）；原 activities_workshops/industry 來源退場＝原資料先隱藏。
 *   扁平 rows（nameEn/nameZh/country ISO）→ flatToNested 映射成 atlas.js 既有的
 *   「年份 → items → guests」巢狀 shape（每單位一個 item＝hover 只亮自己＋國家線，同舊行為）。
 *   fallback＝data/atlas-partnership-*.json（build script 同步輸出的快照）。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { getFacultyData, getFormerFacultyData } from './faculty-source.js';
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
      // 工作營 / 產學：atlas 專用扁平名單（見檔頭說明）；guest shape 走本地欄名（name/name_zh/country）
      withFallback('atlas_workshops', 'atlas_workshops', '/data/atlas-partnership-workshops.json',
        r => ({ nameEn: r.nameEn || '', nameZh: r.nameZh || '', country: r.country || '' }))
        .then(rows => flatToNested(rows, 'atlas-wsg')),
      withFallback('atlas_industry', 'atlas_industry', '/data/atlas-partnership-industry.json',
        r => ({ nameEn: r.nameEn || '', nameZh: r.nameZh || '', country: r.country || '' }))
        .then(rows => flatToNested(rows, 'atlas-ind')),
    ]);

  return { facultyCurrent, facultyFormer, companies, employment, careers, workshops, industry };
}

// 扁平單位 rows → atlas.js 期望的「年份 → items → guests」巢狀 shape。
// 每個單位自成一個 item（一單位一 guest 一 group）＝hover 只高亮自己＋自己的國家線；
// guest 欄名用本地 shape（name/name_zh/country）→ atlas.js guestUnits() 原樣吃。
function flatToNested(rows, idPrefix) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [{
    year: 0,
    // any：atlas.js 消費端還會讀 descriptionZh/intro 等選填欄（此處不帶＝走預設文案），別讓 TS 推成窄型別
    items: rows.map((r, i) => /** @type {any} */ ({
      id: `${idPrefix}-${i + 1}`,
      guests: [{ name: r.nameEn || '', name_zh: r.nameZh || '', country: r.country || '' }],
    })),
  }];
}
