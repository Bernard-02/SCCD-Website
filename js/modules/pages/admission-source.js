/**
 * Admission 公告資料源：Directus admission_announcement（單數，正式 collection）→ loadAdmissionData 期望的 shape。
 * Directus 優先，失敗/空 → 本地 admission.json fallback。
 * 欄位：titleZh/En、startDate/endDate、content(HTML)、images(files M2M)、attachments(o2m: titleZh/En/file/link)。
 * startDate（YYYY-MM-DD）→ 'YYYY.MM.DD' 顯示字串（loadListInto dateInHeader 無 dates group 時直接吃 item.date）。
 */
import { CMS_API_BASE, CMS_ASSETS_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const asset = (u) => (u ? `${CMS_ASSETS_BASE}/${typeof u === 'string' ? u : u.id}` : '');
function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => {
    if (typeof x === 'string') return asset(x);
    if (x?.directus_files_id) { const f = x.directus_files_id; return asset(typeof f === 'string' ? f : f?.id); }
    return asset(x?.id);
  }).filter(Boolean);
}

export async function loadAdmissionAnnouncements() {
  try {
    const res = await fetch(`${CMS_API_BASE}/admission_announcement?limit=-1&sort=sort&fields=*,images.directus_files_id,attachments.*`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
    return rows.map(r => ({
      id: r.id,
      title: r.titleZh || '',
      title_en: r.titleEn || '',
      date: r.startDate ? String(r.startDate).slice(0, 10).replace(/-/g, '.') : '',
      content: r.content || '',
      images: normalizeFiles(r.images),
      // 附件：外部連結 link 優先、否則上傳檔 file → assets URL（loadListInto 附件渲染吃 link/url/titleEn/Zh）
      attachments: (Array.isArray(r.attachments) ? r.attachments : []).map(a => ({
        titleEn: a.titleEn || '', titleZh: a.titleZh || '',
        link: a.link || '', url: a.file ? asset(a.file) : '',
      })),
    }));
  } catch (err) {
    console.warn('[admission] 公告 CMS 失敗 → 本地 admission.json:', err.message);
    return fetch(sitePath('data/admission.json')).then(r => r.json());
  }
}
