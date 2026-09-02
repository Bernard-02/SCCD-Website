/**
 * PDF Cross-Reference Index
 * 反查「哪些 activity item ref 到指定的 PDF url」。
 *
 * 資料模型：activity（母）透過 M2A `references` 欄 ref 到 library_documents（子）。
 * M2A 是**單向**（只有母的後台看得到），沒有反向欄位 → 此 helper 一次掃所有母 collection，
 * 建 Map<pdfUrl, [chipObj]>，給 PDF viewer 開啟時 lookup「這份 PDF 被哪些 activity ref 到」。
 *
 * ⚠️ 2026-08-19 改由 **Directus 為主**（原本只讀本地 /data/*.json）：activity 與 ref 都在 Directus，
 *    本地 JSON 是舊快照（ref.pdfUrl 是 ../assets/sample.pdf 之類、跟 Directus/CloudFront 文件網址永遠對不上）→
 *    反查一定 miss、document lightbox 不顯示活動 back-ref。改成掃 Directus 母 collection 的 references M2A，
 *    key 用「跟 library files 面板同一條計算」的 pdfUrl（pdfLink 優先），才跟開檔 url 對得上。
 *    Directus 全掛才 fallback 本地（此時 document 也 fallback 本地、pdfUrl 一致，仍能對上）。
 *
 * 用法：
 *   const refs = await getPdfRefSources(pdfUrl, { excludeSection, excludeItemId });
 *   // refs = [{ section, itemId, labelEn, labelZh, titleEn, titleZh } | { href, labelEn, ... }, ...]
 *   // 餵給 PDF viewer / media lightbox 的 references（createRefBtn setReferences 吃 section+itemId 或 href）
 */

import { SITE_BASE_PATHNAME } from '../ui/site-base.js';
import { CMS_API_BASE } from '../../config/api.js';
import { pdfOpenUrl } from './pdf-url.js';

const SECTION_LABELS = {
  workshop:           { en: 'Workshop',                      zh: '工作坊' },
  industry:           { en: 'Industry Partnerships',         zh: '產學合作' },
  lectures:           { en: 'Lectures',                      zh: '講座' },
  'students-present': { en: 'Students Present',              zh: '學生自主' },
  'summer-camp':      { en: 'Summer Camp',                   zh: '暑期體驗營' },
  exhibitions:        { en: 'Exhibitions',                   zh: '展演' },
  competitions:       { en: 'Competitions',                  zh: '競賽' },
  conferences:        { en: 'Forums',                        zh: '論壇' },
  visits:             { en: 'Visits',                        zh: '參訪' },
};

// ── Directus 反查（主路徑）───────────────────────────────────
// 母 collection → chip。section 型 → activities.html?section=X&item=Y（在 activities 頁時走 __sccdNavigateToItem in-page 跳）；
// href 型（自己的頁、非 activities section）→ 直接導航該 URL。只列**有 references 欄且能 ref 文件**的母（見 ref 矩陣）。
const CMS_HOST_COLLECTIONS = [
  { collection: 'activities_workshops',           section: 'workshop' },
  { collection: 'activities_competitions',        section: 'competitions' },
  { collection: 'activities_exhibitions_special', section: 'exhibitions' },
  { collection: 'activities_conferences',         section: 'conferences' },
  { collection: 'activities_industry',            section: 'industry' },
  { collection: 'activities_degree_show', label: { en: 'Degree Show', zh: '畢業展' }, extraFields: 'year',
    href: row => `${SITE_BASE_PATHNAME}pages/degree-show-detail.html?year=${row.year}` },
  { collection: 'admission_summer_camp',  label: { en: 'Summer Camp', zh: '暑期體驗營' },
    href: row => `${SITE_BASE_PATHNAME}pages/admission.html?section=summer-camp&item=${row.id}` },
];

// 反查 key 必須跟「開檔時的 item.pdfUrl」逐字元相同才對得上 → 與所有開檔處共用 pdfOpenUrl（見 pdf-url.js）。
function docPdfUrl(it) {
  return it ? pdfOpenUrl(it.pdfLink, it.pdf) : '';
}

function toChip(host, row) {
  const base = { titleEn: row.titleEn || '', titleZh: row.titleZh || '' };
  if (host.section) {
    const lbl = SECTION_LABELS[host.section] || { en: '', zh: '' };
    return { ...base, section: host.section, itemId: row.id || '', labelEn: lbl.en, labelZh: lbl.zh };
  }
  return { ...base, href: host.href(row), labelEn: host.label.en, labelZh: host.label.zh };
}

async function buildIndexFromDirectus() {
  const results = await Promise.all(CMS_HOST_COLLECTIONS.map(async (host) => {
    const fields = [
      'id', 'titleEn', 'titleZh', host.extraFields || null,
      'references.collection',
      'references.item:library_documents.pdf.filename_disk',
      'references.item:library_documents.pdfLink',
    ].filter(Boolean).join(',');
    try {
      const res = await fetch(`${CMS_API_BASE}/${host.collection}?fields=${fields}&limit=-1`);
      if (!res.ok) throw new Error(String(res.status));
      return { host, rows: (await res.json())?.data || [] };
    } catch (e) {
      // 單一 collection 失敗（欄位不存在 / 該母未接 Directus）→ 只略過它，別拖垮整個反查
      console.warn('[pdf-cross-ref-index] skip', host.collection, e.message);
      return null;
    }
  }));
  // 全部失敗（Directus 整個掛）→ 丟出去讓 caller fallback 本地
  if (results.every(r => r === null)) throw new Error('all Directus host fetches failed');

  const index = new Map();
  results.filter(Boolean).forEach(({ host, rows }) => {
    rows.forEach(row => {
      (row.references || []).forEach(ref => {
        if (!ref || ref.collection !== 'library_documents') return;
        const pdfUrl = docPdfUrl(ref.item);
        if (!pdfUrl) return;
        if (!index.has(pdfUrl)) index.set(pdfUrl, []);
        index.get(pdfUrl).push(toChip(host, row));
      });
    });
  });
  return index;
}

let _indexPromise = null;

/**
 * 建立索引：Map<pdfUrl, Array<chipObj>>。Directus 為單一來源；失敗回空 index（chip 不顯示，不查本地假資料）。Cache 一次。
 */
function buildIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = buildIndexFromDirectus().catch(e => {
    // P1-5：Directus 全掛 → 空 index（cross-ref chip 不顯示即可）；不快取失敗 → 下次開 PDF 重試
    console.warn('[pdf-cross-ref-index] Directus 反查失敗，chip 不顯示：', e.message);
    _indexPromise = null;
    return new Map();
  });
  return _indexPromise;
}

/**
 * 給定 pdfUrl，回傳所有 ref 到此 PDF 的 activity 來源 chip。
 * 可選 exclude：activities 場景傳當前 host item 過濾自己（避免自我引用循環）；library 場景不傳。
 *
 * @param {string} pdfUrl
 * @param {{ excludeSection?: string, excludeItemId?: string } | undefined} [opts]
 * @returns {Promise<Array<{section?:string, itemId?:string, href?:string, labelEn:string, labelZh:string, titleEn:string, titleZh:string}>>}
 */
export async function getPdfRefSources(pdfUrl, opts = {}) {
  if (!pdfUrl) return [];
  const index = await buildIndex();
  const sources = index.get(pdfUrl) || [];
  const { excludeSection, excludeItemId } = opts;
  return sources.filter(s =>
    !(excludeSection && excludeItemId && s.section === excludeSection && s.itemId === excludeItemId)
  );
}
