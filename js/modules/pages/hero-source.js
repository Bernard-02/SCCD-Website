/**
 * Hero 資料源：Directus <page>_hero singleton → 覆蓋各頁 HTML 靜態 hero（標題/副標/banner）。
 * Directus 空（未填 singleton 回 {id:null}）或掛掉 → fallback sessionStorage LKG。
 * 都拿不到 → 文字保留 HTML 靜態內容、banner 不顯示（後台是唯一圖片來源，不放本地佔位圖，user 2026-10-04）。
 *
 * Banner 圖「以後台為主、單次揭露」（user 2026-09-11，取代「先揭靜態圖再 decode-swap」——那樣後台圖
 * 與靜態/LKG 不同時仍會「舊圖跳新圖」）：loadHero 同步 prefix 先在 img 上標 data-hero-wait，
 * hero-animation 見旗標就不把 img 排進進場 timeline（img 維持藏在 overflow 遮罩外、容器透明＝什麼都看不到）；
 * 等「資料源落定（fetch 3s timeout → LKG）＋新圖 decode 完（4s 上限）」才設 src 並
 * revealHeroBannerImg 滑入 ＝ 圖只出現一次、永不中途換圖。文字仍 LKG 先套（不跳圖、回訪即正確）。
 */
import { CMS_API_BASE, cdnUrl } from '../../config/api.js';
import { revealHeroBannerImg, retightenHeroParagraphs } from './hero-animation.js';

const HERO_MAP = {
  faculty:    { collection: 'faculty_hero' },
  curriculum: { collection: 'curriculum_hero' },
  activities: { collection: 'activities_hero' },
  admission:  { collection: 'admission_hero' },
};

const FETCH_TIMEOUT = 3000;   // 後台等太久不無限扣住 banner：逾時走 LKG（仍只揭一次）
const DECODE_TIMEOUT = 4000;  // 弱網大圖 decode 上限：到點就揭（src 已設，圖到了由瀏覽器補畫，非換圖）

function setText(sel, val) {
  if (val == null || val === '') return false;
  let changed = false;
  document.querySelectorAll(sel).forEach(el => {
    if (el.textContent !== val) { el.textContent = val; changed = true; }
  });
  return changed;
}

// 回傳「有沒有真的改到字」：layout build 後才改到 → caller 要重收 chip 寬（見 loadHero 內註解）
function applyHeroText(d) {
  let changed = false;
  changed = setText('.hero-title', d.titleEn) || changed;
  changed = setText('.hero-title-cn', d.titleZh) || changed;
  changed = setText('.hero-text-en', d.subtitleEn) || changed;
  changed = setText('.hero-text-cn', d.subtitleZh) || changed;
  // 同 singleton 的頁內其他文字（admission 分頁說明）：元素標 data-hero-field="<欄位名>"；不算 hero chip、不觸發重收
  document.querySelectorAll('[data-hero-field]').forEach(el => {
    const v = d[/** @type {HTMLElement} */ (el).dataset.heroField];
    if (v) el.textContent = v;
  });
  return changed;
}

// 桌面 .hero-banner 與手機 .hero-mobile-bg 各一顆 img（同頁只顯示一顆，兩顆都要設 src＋揭露）
function bannerImgs() {
  return /** @type {HTMLImageElement[]} */ ([
    document.querySelector('.hero-banner img'),
    document.querySelector('.hero-mobile-bg img'),
  ].filter(Boolean));
}

// 最終圖落定 → decode 完才設 src → 揭露。src null＝後台/快取都沒圖 → 不揭（img 留在遮罩外＝不顯示）。
// finally 保證旗標必清（任何錯誤路徑都不會卡住 timeline）。
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
    imgs.forEach(img => { delete img.dataset.heroWait; if (src) revealHeroBannerImg(img); });
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

  // 換到字＝hero layout 多半已 build（tighten 用舊文字量的 inline width 已鎖死）→ 重收 chip 寬到新文字實寬。
  // 後台文案比 HTML 靜態佔位短時（activities 首訪實測差 ~500px）box 才不會比字寬一大截（user 2026-09-16）。
  // LKG 回訪（上面已套同字）→ changed=false 不重收；標題 h1 inline-block 本就 hug、只有段落需要。
  if (data && applyHeroText(data)) retightenHeroParagraphs();

  // 圖：以後台為主，退而求其次 LKG；都沒有＝null（不顯示）
  const src = [data, lkg].filter(Boolean).map(d => cdnUrl(d.bannerImage)).find(Boolean) || null;
  await revealBanner(imgs, src);
}
