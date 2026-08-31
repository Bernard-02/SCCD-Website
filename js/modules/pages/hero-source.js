/**
 * Hero 資料源：Directus <page>_hero singleton → 覆蓋各頁 HTML 靜態 hero（標題/副標/banner）。
 * Directus 空（未填 singleton 回 {id:null}）或掛掉 → fallback 本地 /data/<page>-hero.json。
 * 兩邊都拿不到 → 不動，保留 HTML 靜態內容。
 *
 * 只改 textContent / img.src，不動 DOM 結構 → 不干擾 hero-animation 的 clip-reveal。
 * json 內容目前 = HTML 靜態內容 → 接上後無視覺變化，等後台填 singleton 才生效。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';

const HERO_MAP = {
  faculty:    { collection: 'faculty_hero',    json: '/data/faculty-hero.json' },
  curriculum: { collection: 'curriculum_hero', json: '/data/curriculum-hero.json' },
  activities: { collection: 'activities_hero', json: '/data/activities-hero.json' },
  admission:  { collection: 'admission_hero',  json: '/data/admission-hero.json' },
};

function setText(sel, val) {
  if (val == null || val === '') return;
  document.querySelectorAll(sel).forEach(el => { if (el.textContent !== val) el.textContent = val; });
}

function applyHero(d) {
  setText('.hero-title', d.titleEn);
  setText('.hero-title-cn', d.titleZh);
  setText('.hero-text-en', d.subtitleEn);
  setText('.hero-text-cn', d.subtitleZh);
  // banner：Directus 有填 bannerImage 才覆蓋，否則保留 HTML 靜態圖
  if (d.bannerImage) {
    const img = document.querySelector('.hero-banner img');
    const src = resolveBanner(d.bannerImage);
    if (img && src) img.src = src;
  }
}

// bannerImage：Directus 深取成 { filename_disk }（<uuid>.<副檔名>）→ 組 CloudFront URL 走 CDN 繞過弱機 /assets
// 逾時掉圖（見 memory reference_directus_s3_timeout_all_assets_down），且不寫死副檔名 → 離線 webp 轉檔自動跟上。
// fallback json 給的本地路徑/完整 URL 原樣回傳（不能被當成 filename_disk）。
function resolveBanner(v) {
  const disk = typeof v === 'string' ? v : v?.filename_disk;
  if (!disk) return null;
  if (/^(https?:)?\/\//.test(disk) || disk.startsWith('/') || disk.startsWith('../')) return disk;
  return `${CMS_CDN_BASE}/${disk}`;
}

export async function loadHero(pageKey) {
  const m = HERO_MAP[pageKey];
  if (!m) return;
  let data = null;
  try {
    const res = await fetch(`${CMS_API_BASE}/${m.collection}?fields=*,bannerImage.filename_disk`);
    if (res.ok) {
      const d = (await res.json()).data;
      if (d && d.titleEn) data = d;           // 空 singleton {id:null} → 視為無內容，往下 fallback
    }
  } catch { /* CMS 掛掉 → fallback */ }
  if (!data) {
    try { data = await fetch(sitePath(m.json)).then(r => (r.ok ? r.json() : null)); } catch { /* 本地也沒 → 保留靜態 */ }
  }
  if (data) applyHero(data);
}
