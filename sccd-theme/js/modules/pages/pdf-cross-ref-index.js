/**
 * PDF Cross-Reference Index
 * 反查「哪些 activity item ref 到指定的 PDF url」。
 *
 * 資料模型：activity item 的 references[] 內 pdfUrl ref（型態 1）是「我引用了某 PDF」。
 * 沒有反向欄位 → 此 helper 一次掃所有 activity source JSON，建 Map<pdfUrl, [{section, itemId, titleEn, titleZh}]>
 * 給 PDF viewer 開啟時 lookup「這份 PDF 被哪些 activity ref 到」。
 *
 * 用法：
 *   const refs = await getPdfRefSources(pdfUrl, { excludeSection, excludeItemId });
 *   // refs = [{ section, itemId, labelEn, labelZh, titleEn, titleZh }, ...]
 *   // 餵給 PDF viewer 的 sccd:open-pdf event detail.references
 *
 * Source → section mapping 注意事項：
 *  - general-activities.json 一檔內 4 個 category（exhibitions/competitions/conferences/visits），
 *    item 的真實 section 來自 item.category；其他 source 一個檔 = 一個 section
 *  - permanent-exhibitions.json → section='exhibitions'
 *  - workshops/industry/lectures/students-present/summer-camp → section = filename slug
 */

// 每個 source URL 唯一 fetch，section 從 item 推（general-activities 走 item.category；其他用 source 固定值）
const SOURCE_URLS = [
  { url: '/data/workshops.json',             section: 'workshop' },
  { url: '/data/industry.json',              section: 'industry' },
  { url: '/data/lectures.json',              section: 'lectures' },
  { url: '/data/students-present.json',      section: 'students-present' },
  { url: '/data/summer-camp.json',           section: 'summer-camp' },
  { url: '/data/permanent-exhibitions.json', section: 'exhibitions' },
  { url: '/data/general-activities.json',    section: null }, // section 從 item.category
];

const SECTION_LABELS = {
  workshop:           { en: 'Workshop',                      zh: '工作坊' },
  industry:           { en: 'Industry Partnerships',         zh: '產學合作' },
  lectures:           { en: 'Lectures',                      zh: '講座' },
  'students-present': { en: 'Students Present',              zh: '學生自主' },
  'summer-camp':      { en: 'Summer Camp',                   zh: '暑期體驗營' },
  exhibitions:        { en: 'Exhibitions',                   zh: '展演' },
  competitions:       { en: 'Competitions',                  zh: '競賽' },
  conferences:        { en: 'Conferences',                   zh: '研討會' },
  visits:             { en: 'Visits',                        zh: '參訪' },
};

let _indexPromise = null;

/**
 * 建立索引：Map<pdfUrl, Array<{ section, itemId, titleEn, titleZh }>>
 * Cache 一次；後續呼叫直接回 cached promise。
 */
function buildIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = (async () => {
    const index = new Map();
    const sources = await Promise.all(
      SOURCE_URLS.map(({ url, section }) =>
        fetch(url)
          .then(r => r.json())
          .then(data => ({ url, section, data }))
          .catch(e => { console.warn('[pdf-cross-ref-index] failed to load', url, e); return { url, section, data: null }; })
      )
    );

    sources.forEach(({ section: fixedSection, data }) => {
      if (!Array.isArray(data)) return;
      data.forEach(yg => {
        (yg.items || []).forEach(item => {
          const refs = item.references || (item.reference ? [item.reference] : []);
          if (!Array.isArray(refs) || refs.length === 0) return;
          // general-activities.json：section 從 item.category（exhibitions/competitions/conferences/visits）
          // 其他 source：固定 section
          const itemSection = fixedSection || item.category;
          if (!itemSection) return;
          // 兩種命名模式（對齊 activities-data-loader resolveRef）
          const isModeA = !!item.title_en;
          const titleEn = isModeA ? item.title_en : item.title;
          const titleZh = isModeA ? item.title    : item.title_zh;
          refs.forEach(ref => {
            const pdfUrl = ref && ref.pdfUrl;
            if (!pdfUrl) return;
            if (!index.has(pdfUrl)) index.set(pdfUrl, []);
            index.get(pdfUrl).push({
              section: itemSection,
              itemId: item.id || '',
              titleEn: titleEn || '',
              titleZh: titleZh || '',
            });
          });
        });
      });
    });

    return index;
  })();
  return _indexPromise;
}

/**
 * 給定 pdfUrl，回傳所有 ref 到此 PDF 的 activity 來源列表。
 * 可選 exclude：activities 場景傳當前 host item 過濾自己，library 場景不傳。
 *
 * @param {string} pdfUrl
 * @param {{ excludeSection?: string, excludeItemId?: string } | undefined} [opts]
 * @returns {Promise<Array<{section:string, itemId:string, labelEn:string, labelZh:string, titleEn:string, titleZh:string}>>}
 */
export async function getPdfRefSources(pdfUrl, opts = {}) {
  if (!pdfUrl) return [];
  const index = await buildIndex();
  const sources = index.get(pdfUrl) || [];
  const { excludeSection, excludeItemId } = opts;
  return sources
    .filter(s => !(excludeSection && excludeItemId && s.section === excludeSection && s.itemId === excludeItemId))
    .map(s => {
      const labelMap = SECTION_LABELS[s.section] || { en: '', zh: '' };
      return {
        section: s.section,
        itemId: s.itemId,
        labelEn: labelMap.en,
        labelZh: labelMap.zh,
        titleEn: s.titleEn,
        titleZh: s.titleZh,
      };
    });
}
