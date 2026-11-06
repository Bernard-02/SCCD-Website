/**
 * Hero 資料源：Directus <page>_hero singleton → 覆蓋各頁 HTML 靜態 hero（標題/副標/banner）。
 * Directus 空（未填 singleton 回 {id:null}）或掛掉 → fallback LKG（localStorage：跨分頁／隔天回訪也即出，背景照樣重抓，
 * 後台改過就換新字，user 2026-11-05「更快看到文案」）。進站第一次就 prefetchHeroes 把 4 頁抓好存 LKG（本頁那筆跟 ui_labels 閘門並行）。
 * HTML 不放佔位字（user 2026-11-05：後台斷線整站走 COMING SOON，不需要假的）→ 首訪沒 LKG＝hero 等後台字回來才排版進場
 *（loadHero 回傳的 promise；隨機版面量字卡大小、不能拿空字卡排），後台慢／錯＝hero 不出現、頁面其他照常。
 * banner 不顯示同理（後台是唯一圖片來源，不放本地佔位圖，user 2026-10-04）。
 *
 * Banner 圖「以後台為主、單次揭露」（user 2026-09-11，取代「先揭靜態圖再 decode-swap」——那樣後台圖
 * 與靜態/LKG 不同時仍會「舊圖跳新圖」）：loadHero 同步 prefix 先在 img 上標 data-hero-wait，
 * hero-animation 見旗標就不把 img 排進進場 timeline（img 維持藏在 overflow 遮罩外、容器透明＝什麼都看不到）；
 * 等「資料源落定（fetch 3s timeout → LKG）＋新圖 decode 完（4s 上限）」才設 src 並
 * revealHeroBannerImg 滑入 ＝ 圖只出現一次、永不中途換圖。文字仍 LKG 先套（不跳圖、回訪即正確）。
 */
import { CMS_API_BASE, cdnUrl } from '../../config/api.js';
import { revealHeroBannerImg, retightenHeroParagraphs } from './hero-animation.js';
import { refreshHeroMobileText } from './hero-mobile-sync.js';

const HERO_MAP = {
  faculty:    { collection: 'faculty_hero' },
  curriculum: { collection: 'curriculum_hero' },
  activities: { collection: 'activities_hero' },
  admission:  { collection: 'admission_hero' },
};

const FETCH_TIMEOUT = 3000;   // 後台等太久不無限扣住 banner：逾時走 LKG（仍只揭一次）
const lkgKey = (pageKey) => `hero-lkg:${pageKey}`;

// 同一次載入共用一支請求（prefetch 跟進頁 loadHero 不重打）；失敗不快取＝下次重抓。不 abort：逾時只是 loadHero 不再等它，
// 晚回來照樣存 LKG（下次更新）
/** @type {Map<string, Promise<any>>} */
const inflight = new Map();
function heroFetch(pageKey) {
  if (!inflight.has(pageKey)) {
    const p = fetch(`${CMS_API_BASE}/${HERO_MAP[pageKey].collection}?fields=*,bannerImage.filename_disk`)
      .then(res => (res.ok ? res.json() : null))
      .then(j => {
        const d = j?.data;
        if (!d || !(d.titleEn || d.bannerImage)) return null;   // 空 singleton {id:null} → fallback；只填圖的半滿 singleton 也生效
        try { localStorage.setItem(lkgKey(pageKey), JSON.stringify(d)); } catch { /* 存不進去無妨 */ }
        return d;
      })
      .catch(() => null);   // CMS 掛掉 → fallback
    p.then(d => { if (!d) inflight.delete(pageKey); });
    inflight.set(pageKey, p);
  }
  return /** @type {Promise<any>} */ (inflight.get(pageKey));
}

// 進站一次：本頁那筆立刻抓（不等 main-modular 的 ui_labels 閘門）、其他 3 頁閒下來再抓＝站內點進去第一次也有 LKG 即出
export function prefetchHeroes(currentPage) {
  if (HERO_MAP[currentPage]) heroFetch(currentPage);
  const rest = () => Object.keys(HERO_MAP).forEach(k => heroFetch(k));
  if ('requestIdleCallback' in window) requestIdleCallback(rest, { timeout: 3000 });
  else setTimeout(rest, 1500);
}
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

/** @returns {Promise<void>|null} null＝字已就緒（LKG 同步套上／不是這 4 頁）＝hero 照常起跑；
 *  promise＝首訪沒 LKG，後台字套上才 resolve（後台出錯＝永不 resolve＝hero 不出現） */
export function loadHero(pageKey) {
  const m = HERO_MAP[pageKey];
  if (!m) return null;
  // ── 同步 prefix：必須趕在 hero timeline build 之前跑（main-modular 把 loadHero 移到 initHeroAnimation
  //    之前呼叫）——標了 wait，timeline 才會把 banner img 留在遮罩外等 revealBanner。
  const imgs = bannerImgs();
  imgs.forEach(img => { img.dataset.heroWait = '1'; });

  let lkg = null;
  try { lkg = JSON.parse(localStorage.getItem(lkgKey(pageKey)) || 'null'); } catch { /* 壞快取／存取被擋當沒有 */ }
  if (lkg) applyHeroText(lkg);   // 文字先套 LKG（回訪即正確；圖不先套＝永不換圖）

  /** @type {() => void} */
  let textReady = () => {};
  const ready = lkg?.titleEn ? null : new Promise(r => { textReady = () => r(undefined); });
  fetchAndApply(pageKey, imgs, lkg, textReady);
  return ready;
}

async function fetchAndApply(pageKey, imgs, lkg, textReady) {
  // 逾時只在有 LKG 可退時才設（banner 不無限扣住）；首訪沒得退＝等到後台回來（user 2026-11-05「等 ok 之後再出現」）
  const data = await (lkg
    ? Promise.race([heroFetch(pageKey), new Promise(r => setTimeout(() => r(null), FETCH_TIMEOUT))])
    : heroFetch(pageKey));
  // 等的期間換頁（banner img 跟著舊 <main> 被換掉）＝別把這頁的字寫進新頁的 hero；LKG 已在 heroFetch 存好
  if (!imgs.every(img => img.isConnected)) return;

  // 換到字（LKG 跟後台不同＝後台改過文案）＝hero layout 已用 LKG 字 build、tighten 的 inline width 鎖死 → 重收 chip 寬到新字實寬
  //（user 2026-09-16 box 比字寬一大截）；手機卡是開頁時從桌面抄的（hero-mobile-sync）→ 一起重抄＋重收寬（11-05）。
  // LKG 同字→ changed=false 不重收；首訪沒 LKG＝hero 還沒 build（等下面 textReady）＝重收無害、之後 build 量的就是這份字
  if (data && applyHeroText(data)) { retightenHeroParagraphs(); refreshHeroMobileText(); }
  if (data?.titleEn) textReady();

  // 圖：以後台為主，退而求其次 LKG；都沒有＝null（不顯示）
  const src = [data, lkg].filter(Boolean).map(d => cdnUrl(d.bannerImage)).find(Boolean) || null;
  await revealBanner(imgs, src);
}
