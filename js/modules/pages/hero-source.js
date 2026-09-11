/**
 * Hero 資料源：Directus <page>_hero singleton → 覆蓋各頁 HTML 靜態 hero（標題/副標/banner）。
 * Directus 空（未填 singleton 回 {id:null}）或掛掉 → fallback sessionStorage LKG → 本地 /data/<page>-hero.json。
 * 全都拿不到 → 保留 HTML 靜態內容。
 *
 * Banner 圖「以後台為主、單次揭露」（user 2026-09-11，取代「先揭靜態圖再 decode-swap」——那樣後台圖
 * 與靜態/LKG 不同時仍會「舊圖跳新圖」）：loadHero 同步 prefix 先在 img 上標 data-hero-wait，
 * hero-animation 見旗標就不把 img 排進進場 timeline（img 維持藏在 overflow 遮罩外、容器透明＝什麼都看不到）；
 * 等「資料源落定（fetch 3s timeout → LKG → json fallback）＋新圖 decode 完（4s 上限）」才設 src 並
 * revealHeroBannerImg 滑入 ＝ 圖只出現一次、永不中途換圖。文字仍 LKG 先套（不跳圖、回訪即正確）。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { sitePath } from '../ui/site-base.js';
import { revealHeroBannerImg } from './hero-animation.js';

const HERO_MAP = {
  faculty:    { collection: 'faculty_hero',    json: '/data/faculty-hero.json' },
  curriculum: { collection: 'curriculum_hero', json: '/data/curriculum-hero.json' },
  activities: { collection: 'activities_hero', json: '/data/activities-hero.json' },
  admission:  { collection: 'admission_hero',  json: '/data/admission-hero.json' },
};

const FETCH_TIMEOUT = 3000;   // 後台等太久不無限扣住 banner：逾時走 LKG/json fallback（仍只揭一次）
const DECODE_TIMEOUT = 4000;  // 弱網大圖 decode 上限：到點就揭（src 已設，圖到了由瀏覽器補畫，非換圖）

function setText(sel, val) {
  if (val == null || val === '') return;
  document.querySelectorAll(sel).forEach(el => { if (el.textContent !== val) el.textContent = val; });
}

function applyHeroText(d) {
  setText('.hero-title', d.titleEn);
  setText('.hero-title-cn', d.titleZh);
  setText('.hero-text-en', d.subtitleEn);
  setText('.hero-text-cn', d.subtitleZh);
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

// 桌面 .hero-banner 與手機 .hero-mobile-bg 各一顆 img（同頁只顯示一顆，兩顆都要設 src＋揭露）
function bannerImgs() {
  return /** @type {HTMLImageElement[]} */ ([
    document.querySelector('.hero-banner img'),
    document.querySelector('.hero-mobile-bg img'),
  ].filter(Boolean));
}

// 最終圖落定 → decode 完才設 src → 揭露。src null＝後台/快取都沒圖 → 維持 HTML 靜態圖直接揭。
// finally 保證旗標必清、reveal 必發（任何錯誤路徑 banner 都不會卡在藏著）。
async function revealBanner(imgs, src) {
  try {
    if (src) {
      const abs = new URL(src, document.baseURI).href;
      if (imgs.some(img => img.src !== abs)) {
        const pre = new Image();
        pre.src = abs;
        await Promise.race([
          pre.decode().catch(() => { /* decode 失敗照設，交給瀏覽器 */ }),
          new Promise(r => setTimeout(r, DECODE_TIMEOUT)),
        ]);
        imgs.forEach(img => { if (img.src !== abs) img.src = abs; });
      }
    }
  } finally {
    imgs.forEach(img => { delete img.dataset.heroWait; revealHeroBannerImg(img); });
  }
}

export async function loadHero(pageKey) {
  const m = HERO_MAP[pageKey];
  if (!m) return;
  // ── 同步 prefix：必須趕在 hero timeline build 之前跑（main-modular 把 loadHero 移到 initHeroAnimation
  //    之前呼叫）——標了 wait，timeline 才會把 banner img 留在遮罩外等 revealBanner。
  const imgs = bannerImgs();
  imgs.forEach(img => { img.dataset.heroWait = '1'; });

  let lkg = null;
  try { lkg = JSON.parse(sessionStorage.getItem(`hero-lkg:${pageKey}`) || 'null'); } catch { /* 壞快取當沒有 */ }
  if (lkg) applyHeroText(lkg);   // 文字先套 LKG（回訪即正確；圖不先套＝永不換圖）

  let data = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(`${CMS_API_BASE}/${m.collection}?fields=*,bannerImage.filename_disk`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const d = (await res.json()).data;
      if (d && (d.titleEn || d.bannerImage)) data = d; // 空 singleton {id:null} → fallback；只填圖的半滿 singleton 也生效
    }
  } catch { /* CMS 掛掉/逾時 → fallback */ }
  if (data) {
    try { sessionStorage.setItem(`hero-lkg:${pageKey}`, JSON.stringify(data)); } catch { /* 存不進去無妨 */ }
  }

  let fallback = null;
  if (!data && !lkg) {
    try { fallback = await fetch(sitePath(m.json)).then(r => (r.ok ? r.json() : null)); } catch { /* 本地也沒 → 保留靜態 */ }
  }
  if (data || fallback) applyHeroText(data || fallback);

  // 圖：以後台為主，退而求其次 LKG → json fallback；全沒有＝null（揭 HTML 靜態圖）
  const src = [data, lkg, fallback].filter(Boolean).map(d => resolveBanner(d.bannerImage)).find(Boolean) || null;
  await revealBanner(imgs, src);
}
