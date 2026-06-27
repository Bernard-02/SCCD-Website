/**
 * Faculty Data Loader
 * 讀取師資資料（Directus 三 collection 合併，見 faculty-source.js）並依
 * type (fulltime/parttime/admin) 分類渲染。
 *
 * 資料結構（對齊 Directus faculty_fulltime / faculty_parttime / faculty_admin）：
 *   - fulltime/parttime: titles[]（repeater，至少 1 筆）
 *   - admin: titleEn/titleZh 單字段
 * Card 顯示「所有」職稱（fulltime/parttime 跑完 titles[]；admin 用 titleEn/titleZh）；
 * 單行職稱超出卡片寬時 hover marquee（見 cards.css）。
 */

import { getFacultyData, resetFacultyCache } from './faculty-source.js';
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';

export async function loadFacultyData() {
  try {
    // resetFacultyCache 改在「離開 faculty 時」跑（registerPageCleanup），不再每次進頁先清：
    //   ① prefetch-on-intent 抓的資料進頁時 cache hit、不被 enter-reset 清掉重抓（否則 prefetch 白做）
    //   ② 同一次進頁內 slide-in / atlas 共用同一 in-flight/cache
    //   ③ 離開後才清 → 下次（prefetch 或進頁）重抓最新，維持「後台更新站內導航回來即生效」
    registerPageCleanup(resetFacultyCache);
    const data = await getFacultyData();

    const fulltime = data.filter(item => item.type === 'fulltime');
    const parttime = data.filter(item => item.type === 'parttime');
    const admin = data.filter(item => item.type === 'admin');

    _phCards = []; // 重抓重渲染前清空，避免站內導航回來累積舊卡片 ref
    // fulltime 是第一個 list（上半屏）→ 前 4 張 eager+high priority 先載；parttime/admin 在下方維持 lazy
    renderFacultyList('faculty-fulltime-list', fulltime, 4);
    renderFacultyList('faculty-parttime-list', parttime);
    renderFacultyList('faculty-admin-list', admin);

    // 代用 logo 卡片：依當前 mode 套對應圖 + 底色（首次不做 fade），並綁 theme:changed 之後切換時 cross-fade
    applyPlaceholderMode(false);
    bindPlaceholderThemeListener();

  } catch (error) {
    console.error('Error loading faculty data:', error);
  }
}

// ===== 無真實照片兼任老師的「代用 logo 依背景切換」=====
// generator 四個輸出對應四種背景；缺某變體時的 fallback 順序（盡量挑對比仍正確的替補）。
const PH_FALLBACK = {
  standard:       ['standard', 'inverse', 'wireframeBlack', 'wireframeWhite'],
  inverse:        ['inverse', 'standard', 'wireframeWhite', 'wireframeBlack'],
  wireframeBlack: ['wireframeBlack', 'standard', 'inverse', 'wireframeWhite'],
  wireframeWhite: ['wireframeWhite', 'inverse', 'standard', 'wireframeBlack'],
};

let _phCards = [];           // [{ img, fadeImg, wrapper, ph, defaultUrl, _curUrl, _fadeTimer }]
let _phThemeHandler = null;  // theme:changed listener（registerPageCleanup 解綁）

const PH_FADE_MS = 400; // 對齊 theme-toggle MODE_FADE_MS：圖片變體 cross-fade 時長

function isModePlaceholder(item) {
  // fulltime / parttime / admin 皆可（2026-06-11 起不再限 parttime）；!item.placeholders 自動排除沒設代用圖的型別。
  if (item.hasRealPhoto || !item.placeholders) return false;
  const p = item.placeholders;
  return !!(p.standard || p.inverse || p.wireframeBlack || p.wireframeWhite);
}

// 當前 site mode → 要用哪個變體（只回 key）。
// mode3 固定回 'wireframeBlack'（黑線框圖）：黑↔白對比改由 CSS `filter: var(--theme-invert-filter)` 每幀驅動
//   （見 color.css），跟頁面文字吃同一個 var、同一幀翻色＝零延遲（解決「mode3 自轉時 logo 翻色比文字慢」）；
//   theme-toggle 已對該 var 加遲滯故不閃。JS 不再算亮度/換白圖、不再 cross-fade 黑白（白圖上傳變備援/可略）。
// ⚠️ 卡片底色「不」由 JS 追色：wrapper 設 transparent、頁面背景(平滑/每幀)透過來＝同步無階梯閃（見回報 #6）。
function currentPlaceholderVariantKey() {
  const cl = document.body.classList;
  if (cl.contains('mode-inverse')) return 'inverse';
  if (cl.contains('mode-color')) return 'wireframeBlack';
  return 'standard';
}

function pickVariantUrl(ph, key) {
  for (const k of PH_FALLBACK[key]) { if (ph[k]) return ph[k]; }
  return null;
}

// 給 slide-in / hover 等外部用：回傳 item 該顯示的代用 logo URL。
// forceKey 指定變體（如 'wireframeBlack'）；省略則依當前 site mode 挑。
// 非代用圖 item（有真實照片 / 無 placeholders）回 null → caller 退回 item.image。
export function modePlaceholderUrl(item, forceKey) {
  if (!isModePlaceholder(item)) return null;
  return pickVariantUrl(item.placeholders, forceKey || currentPlaceholderVariantKey());
}

// 只處理「圖片變體」：animate=true（theme:changed）變體真的換才 cross-fade；animate=false（首次）直接套。
// 卡片底色不在這裡動（wrapper 已設 transparent，頁面背景透過來＝平滑同步、無階梯閃爍）。
function applyPlaceholderMode(animate = false) {
  if (!_phCards.length) return;
  const key = currentPlaceholderVariantKey();
  for (const c of _phCards) {
    const url = pickVariantUrl(c.ph, key) || c.defaultUrl;
    if (url && c._curUrl !== url) {
      c._curUrl = url;
      if (animate && c.fadeImg) crossFadeTo(c, url);
      else { c.img.setAttribute('src', url); applyNaturalAspect(c.img); }
    }
  }
}

// 圖片 cross-fade：舊圖(base)淡出 1→0 + 新圖(overlay)淡入 0→1「同時」進行，0.4s 後 base 接手新圖。
// 為何兩層都動：變體有 standard(填色) 與 wireframe(透明挖空) 兩類。若只「新圖淡入、舊圖維持滿」，
//   切到 wireframe 時舊填色會「透過 wireframe 透明處」殘留到最後 src swap 才 snap（user 報「填色殘留才變 wireframe」）。
//   真 cross-fade（舊淡出）讓填色平滑溶解掉。新圖已 preload→無額外網路。
function crossFadeTo(c, url) {
  const { img, fadeImg } = c;
  if (c._fadeTimer) { clearTimeout(c._fadeTimer); c._fadeTimer = null; }
  // 起點：overlay=新圖 opacity 0；base=舊圖 opacity 1
  fadeImg.style.transition = 'none';
  fadeImg.style.opacity = '0';
  fadeImg.setAttribute('src', url);
  applyNaturalAspect(fadeImg); // 依新變體比例校正 wrapper（base/overlay 同在 wrapper 內）
  img.style.transition = 'none';
  img.style.opacity = '1';
  void fadeImg.offsetWidth;    // force reflow 讓起點生效
  const tr = `opacity ${PH_FADE_MS}ms ease`; // 跟 background fade 同 ease/時長
  img.style.transition = tr;      fadeImg.style.transition = tr;
  img.style.opacity = '0';        fadeImg.style.opacity = '1'; // 舊淡出 + 新淡入
  c._fadeTimer = setTimeout(() => {
    img.setAttribute('src', url); // base 接手新圖（此刻 base 不可見、overlay 顯示同一新圖→無縫）
    img.style.transition = '';    // 還原 cards.css 的 filter/transform transition（opacity 不在內→下行設不透明不會 transition）
    img.style.opacity = '';       // 還原預設不透明
    fadeImg.style.transition = 'none';
    fadeImg.style.opacity = '0';  // overlay 歸零（不留 GPU 層）
    c._fadeTimer = null;
  }, PH_FADE_MS);
}

function bindPlaceholderThemeListener() {
  if (_phThemeHandler) return; // 已綁（同一進頁不重綁；cleanup 後 null 才會重綁）
  _phThemeHandler = () => applyPlaceholderMode(true);
  window.addEventListener('theme:changed', _phThemeHandler);
  registerPageCleanup(() => {
    window.removeEventListener('theme:changed', _phThemeHandler);
    _phThemeHandler = null;
    _phCards.forEach(c => { if (c._fadeTimer) clearTimeout(c._fadeTimer); });
    _phCards = [];
  });
}

const CARD_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
// 圖片進場用：4 個方向 random 抽，filter 用 setupFacultyCardAnim 讀 data-img-dir
const IMG_ENTRY_DIRS = ['top', 'right', 'bottom', 'left'];

function randomImgDir() {
  return IMG_ENTRY_DIRS[Math.floor(Math.random() * IMG_ENTRY_DIRS.length)];
}

// 卡片圖片依「實際上傳比例」自適應（不鎖死 4:5、不裁切）：
// 圖載入後把 wrapper 的 aspect-ratio 設成圖片自然比例 → object-cover 等比填滿 = 完整不裁切。
// HTML 預設的 aspect-[4/5] 只當「載入中 / 進場 clip 動畫」的佔位 fallback（避免 wrapper 0 高度、reveal 不可見）。
// 後台改上傳比例（如 1:1 → 4:3）前台自動跟著變，不用改 code。
function applyNaturalAspect(img) {
  const apply = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const wrap = img.closest('.faculty-card-image-wrapper');
    if (wrap) wrap.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
  };
  if (img.complete) apply();
  else img.addEventListener('load', apply, { once: true });
}

/**
 * 取得 card 顯示用的「所有」 title pair（中英）
 * fulltime/parttime: titles[] 全部；admin: 單筆 titleEn/titleZh
 */
function pickCardTitles(item) {
  if (item.type === 'admin') {
    return [{ en: item.titleEn || '', zh: item.titleZh || '' }];
  }
  return (item.titles || []).map(t => ({ en: t.titleEn || '', zh: t.titleZh || '' }));
}

// 多職稱 → 每 pair 一組（組間留 xs 間距）；en/zh 各一行，包 marquee inner 供溢出時 hover 跑動。
// 缺一語不渲染該空行（避免空白行，比照 bilingual cell 規範）。
function renderCardTitles(item) {
  const line = (text) => text
    ? `<p class="faculty-marquee-line text-p2"><span class="faculty-marquee-inner">${text}</span></p>`
    : '';
  return pickCardTitles(item).map((p) => {
    const lines = line(p.en) + line(p.zh);
    return lines ? `<div class="faculty-card-title-group">${lines}</div>` : '';
  }).join('');
}

function renderFacultyList(containerId, items, eagerCount = 0) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<p class="text-gray-5 col-span-full">No data available.</p>';
    return;
  }

  container.innerHTML = items.map((item, index) => {
    // 上半屏前幾張：eager + fetchpriority high → 第一屏照片優先載，不被 lazy 降權、也不跟其餘卡搶頻寬輸掉
    // （user 2026-06-24 報「前兩張一直先灰再變照片」＝它們 render 當下就要、但跟 ~50 張同優先序搶頻寬）
    const eager = index < eagerCount;
    const color = CARD_COLORS[index % CARD_COLORS.length];
    const sign = Math.random() < 0.5 ? -1 : 1;
    const initDeg = (sign * (3 + Math.random() * 3)).toFixed(2);
    const imgDir = randomImgDir();
    return `
    <div class="faculty-card group ${item.type === 'parttime' ? 'cursor-default' : 'cursor-pointer'} p-[6px]" data-category="${item.type}" data-faculty-id="${item.id}" data-img-dir="${imgDir}" style="--card-color: ${color}; --init-deg: ${initDeg}deg">
      <div class="faculty-card-image-wrapper overflow-hidden mb-md aspect-[4/5] bg-gray-2 relative">
        <img src="${item.image}" alt="${item.nameEn}" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} class="faculty-card-image w-full h-full object-cover">
      </div>
      <div class="text-left">
        <div class="faculty-card-name">
          <h5>${item.nameEn}</h5>
          <h5>${item.nameZh}</h5>
        </div>
        <div class="faculty-card-title mt-xs">
          ${renderCardTitles(item)}
        </div>
      </div>
    </div>
  `;
  }).join('');

  // 每張卡圖：真實照片 → 依自然比例調框（覆蓋 aspect-[4/5] fallback）；
  // 代用 logo（透明去背）→ 維持 4:5 框 + object-contain 完整顯示（不裁切），登記給 applyPlaceholderMode 依 mode 切圖/底色
  container.querySelectorAll('.faculty-card').forEach((cardEl, i) => {
    const item = items[i];
    const img = cardEl.querySelector('.faculty-card-image');
    if (!img) return;
    if (isModePlaceholder(item)) {
      cardEl.classList.add('faculty-card-placeholder'); // CSS 用：mode3 hover 時 logo 反色（真實照片卡不加、不反）
      const wrapper = cardEl.querySelector('.faculty-card-image-wrapper');
      // 預設方形（代用 logo 通常方形、避免載入前 HTML 的 4:5 閃一下）；
      // 實際比例由 applyPlaceholderMode 換 src 後 applyNaturalAspect 校正＝跟真實照片同原則「上傳什麼比例吃什麼」
      if (wrapper) {
        wrapper.style.aspectRatio = '1 / 1';
        // 底色設透明（蓋掉 HTML 的 bg-gray-2）→ 透明 logo 直接襯頁面背景：mode3 跟頁面 hue 完美同步無階梯閃、
        // standard/inverse 透出白/黑也正好是各變體設計底色；JS 不再追色。
        wrapper.style.backgroundColor = 'transparent';
      }
      img.style.objectFit = 'contain'; // inline 覆蓋 class object-cover（logo 不裁切）
      // cross-fade overlay 層：mode 切換時新變體在這層淡入蓋住舊圖（同 background fade timing）
      let fadeImg = null;
      if (wrapper) {
        fadeImg = document.createElement('img');
        fadeImg.className = img.className;
        fadeImg.setAttribute('aria-hidden', 'true');
        fadeImg.alt = '';
        Object.assign(fadeImg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', opacity: '0', pointerEvents: 'none' });
        wrapper.appendChild(fadeImg);
      }
      // preload 4 個變體 → 切 mode 時 src 換成已快取圖、不再每次 network 重抓（消除換色延遲）
      Object.values(item.placeholders).forEach(u => { if (u) { const im = new Image(); im.src = u; } });
      _phCards.push({ img, fadeImg, wrapper, ph: item.placeholders, defaultUrl: item.image, _curUrl: null, _fadeTimer: null });

      // hover → 露出線框 wireframe 版（user 2026-06-11；平常顯示 mode 對應變體，hover 切線框）。
      // 桌面限定（手機無 hover）；變體已 preload→swap 即時不閃。離開還原當前 mode 變體。
      // 黑線對比：hover 時卡片底翻成 accent 色（standard/inverse 都變亮綠底→黑線可見）、mode-color 另有 :hover filter，
      // 故各 mode hover 下線框都對比可見，不需額外反色（user 說「黑白則反過來這個做好了」即此既有 hover 底色機制）。
      if (window.matchMedia('(min-width: 768px)').matches) {
        const wfUrl = pickVariantUrl(item.placeholders, 'wireframeBlack') || item.image;
        cardEl.addEventListener('mouseenter', () => { img.setAttribute('src', wfUrl); applyNaturalAspect(img); });
        cardEl.addEventListener('mouseleave', () => {
          img.setAttribute('src', pickVariantUrl(item.placeholders, currentPlaceholderVariantKey()) || item.image);
          applyNaturalAspect(img);
        });
      }
    } else {
      applyNaturalAspect(img); // 真實照片依自然比例調框
    }
  });

  // 職稱單行超出卡片寬 → hover marquee（桌面限定；手機無 hover、保留自然換行）。
  // 量測前等字型載入：fallback 字寬偏窄會誤判溢出（見 memory feedback_measure_text_layout_wait_fonts_ready）。
  if (window.innerWidth >= 768) {
    const runMarquee = () => applyMarqueeOverflow(container, '.faculty-marquee-line', '.faculty-marquee-inner');
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(runMarquee);
    } else {
      runMarquee();
    }
  }
}
