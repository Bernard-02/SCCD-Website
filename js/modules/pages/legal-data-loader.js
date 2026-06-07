/**
 * Legal Data Loader
 * 讀取 legal 頁（privacy-policy / accessibility / regulations）的 JSON 並渲染。
 *
 * 資料只存「內容」不存樣式：overview（綜述）+ points[{ title, des }]，des 是富文本 HTML
 * （後台 WYSIWYG 產的乾淨 <p>/<ul>/<a>，無樣式 class）→ 老師可自由增減 bullet / 加連結粗體。
 * 編號與排版全由本檔 + legal.css 負責。尚未結構化的頁（accessibility / regulations）fallback 舊 content blob。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { setupClipReveal, playClipReveal, playRevealExit } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';

// 已遷移到 Directus 的頁面 → collection 名；未列入的讀本地 /data/*.json。
// 一頁一頁遷：遷一個就在這加一筆，其餘頁完全不受影響。
// （2026-06-04：CORS 已在 Directus 開啟並驗證，privacy-policy 改走 Directus 即時 fetch。）
const CMS_COLLECTIONS = {
  'privacy-policy': 'privacy_policy',
  'accessibility': 'accessibility',
  'regulations': 'regulations',
  'support': 'support',
};

// 這些頁的 points 是「分類」不是「編號條款」→ 不顯示前面的 1. 2.（support：Funds / Others）
const NO_NUMBER_PAGES = new Set(['support']);

export async function loadLegalData(pageName) {
  try {
    const collection = CMS_COLLECTIONS[pageName];
    let data;
    if (collection) {
      // CMS 優先；fetch 失敗（CORS / 斷網 / 5xx / 空資料）→ fallback 本地 /data/<page>.json，
      // 跟 degree-show-data-loader 同 pattern。CMS 掛掉時 legal 頁仍渲染（靜態 JSON 跟 CMS singleton 同 shape：
      // titleEn/Zh + overview + points），不會像之前直接 throw 留白頁（user 2026-06-05 CORS 掛掉回報）。
      try {
        const response = await fetch(`${CMS_API_BASE}/${collection}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = (await response.json()).data;   // singleton 回傳單一物件（非陣列），直接取 .data
        if (!data) throw new Error('empty data');
      } catch (err) {
        console.warn(`[legal] CMS fetch failed for ${pageName}, fallback to /data/${pageName}.json:`, err.message);
        data = await fetch(`/data/${pageName}.json`).then(r => r.json());
      }
    } else {
      const response = await fetch(`/data/${pageName}.json`);
      data = await response.json();
    }

    // title 元素可能由頁面直接 hardcode（如 privacy-policy 為了 chip 樣式 + <br> 斷行），此時 ID 不存在 → null guard
    const titleEn = document.getElementById('legal-title-en');
    const titleZh = document.getElementById('legal-title-zh');
    if (titleEn) titleEn.textContent = data.titleEn;
    if (titleZh) titleZh.textContent = data.titleZh;

    // 結構化（有 points）優先組裝；否則 fallback 舊的 content HTML blob
    const contentEl = document.getElementById('legal-content');
    if (contentEl) {
      contentEl.innerHTML = data.points ? renderStructured(data, !NO_NUMBER_PAGES.has(pageName)) : (data.content || '');
      setupLegalReveal(contentEl, pageName);  // 4 個 legal 頁共用；support 走專屬依序進場 + 一次過退場
    }

    const updatedEn = document.getElementById('legal-updated-en');
    const updatedZh = document.getElementById('legal-updated-zh');
    if (updatedEn) updatedEn.textContent = data.lastUpdatedEn;
    if (updatedZh) updatedZh.textContent = data.lastUpdatedZh;

  } catch (error) {
    console.error(`Error loading ${pageName} data:`, error);
  }
}

// clip-reveal mask wrapper：把單一可動行包進 overflow:clip 容器，讓進場 yPercent 滑入有遮罩、
// 退場反向沉出（樣式在 legal.css .legal-reveal）。內部元素才是 GSAP yPercent 目標（setupClipReveal 偵測
// 父層已是 overflow:clip 就不再 reparent → 不破壞 legal.css 的 class 選擇器）。
const reveal = (inner) => `<div class="legal-reveal">${inner}</div>`;
// 子區塊（support Funds 的 Single 單次 / Regular 定期）各自一個 reveal 單位 → 可分開依序進場（user 2026-06-07）。
// 多掛 .legal-sub-reveal class：供 setupSupportSequence 把每個子區塊當成獨立進場「拍」、並讓 legal.css 補相鄰子區塊上距。
const revealSub = (inner) => `<div class="legal-reveal legal-sub-reveal">${inner}</div>`;

// 結構化資料 → HTML（numbered=true 時編號依 index 自動產；class 都是語意標記，樣式在 legal.css）
// 每行用 reveal() 包 → title / 副標 / 說明各自獨立遮罩，可依序 clip-reveal 進場（setupLegalReveal）
function renderStructured(data, numbered = true) {
  let html = '';

  // overview 是純文字（後台 Textarea）→ esc 後包 <p>，每段各自 reveal 遮罩
  if (data.overviewEn || data.overviewZh) {
    const ps = [para(data.overviewEn), para(data.overviewZh)].filter(Boolean).map(reveal).join('');
    html += `<div class="legal-intro">${ps}</div>`;
  }

  (data.points || []).forEach((pt, i) => {
    // sections：點內可再分「雙語次標題 + 各自 EN/ZH 富文本」子區塊（如 support Funds 的 Single 單次 / Regular 定期）。
    // 次標題是結構化欄位（titleEn/Zh，前台組雙語），內文 desEn/desZh 仍是 WYSIWYG 富文本 → 老師可分別增減。
    // 每個子區塊各自包成一個 .legal-sub-reveal（獨立進場拍）；點層級 desEn/desZh 另成一個 reveal。
    // 點若無 sections 就只渲染點層級 desEn/desZh（privacy-policy / Others 等完全不受影響 = 單一 desc reveal）。
    const sections = pt.sections || [];
    const pointDesc = (pt.desEn || '') + (pt.desZh || '');
    const subRevealsHtml = sections.map(s =>
      revealSub(
        `<div class="legal-section-desc"><div class="legal-subsection">`
        + `<h5 class="legal-subsection-title-en">${esc(s.titleEn)}</h5>`
        + `<h5 class="legal-subsection-title-zh">${esc(s.titleZh)}</h5>`
        + (s.desEn || '')   // 富文本，直接注入不 esc
        + (s.desZh || '')
        + `</div></div>`
      )
    ).join('');

    // 不編號時省略 num 欄並加 modifier，legal.css 改單欄（body 撐滿）
    html += `<div class="legal-section${numbered ? '' : ' legal-section--no-num'}">`
      + (numbered ? reveal(`<div class="legal-section-num">${i + 1}.</div>`) : '')
      + `<div class="legal-section-body">`
      + reveal(`<h4 class="legal-section-title-en">${esc(pt.titleEn)}</h4>`)
      + reveal(`<h4 class="legal-section-title-zh">${esc(pt.titleZh)}</h4>`)
      + (pointDesc ? reveal(`<div class="legal-section-desc">${pointDesc}</div>`) : '')
      + subRevealsHtml
      + `</div></div>`;
  });

  return html;
}

// 進場：每個 .legal-intro / .legal-section 各自一個 ScrollTrigger（scroll-to-view），捲到才把內部
//   .legal-reveal 的滑動元素依 DOM 由上到下（num → title → 副標 → 說明）線性 stagger clip-reveal。
// 退場：所有 .legal-reveal 滑動元素反向 yPercent 沉出（playRevealExit 內建 viewportOnly + 自動補 wrapper no-op）。
function legalSlideTargets(scope) {
  return [...scope.querySelectorAll('.legal-reveal')]
    .map(w => /** @type {HTMLElement|null} */ (w.firstElementChild))
    .filter(Boolean);
}

function setupLegalReveal(contentEl, pageName) {
  if (typeof gsap === 'undefined') return;

  // support 走專屬編排（user 2026-06-07）：進場依序 cascade、退場説明文字一次過。
  if (pageName === 'support') { setupSupportSequence(contentEl); return; }

  contentEl.querySelectorAll('.legal-intro, .legal-section').forEach(block => {
    const targets = legalSlideTargets(block);
    if (!targets.length) return;
    setupClipReveal(targets);  // 父層 .legal-reveal 已 overflow:clip → 只 set yPercent:100 不 reparent
    const play = () => playClipReveal(targets, { stagger: { each: 0.12 } });
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: block, start: 'top 85%', once: true, onEnter: play });
    } else {
      play();
    }
  });

  registerPageExit(() => playRevealExit(legalSlideTargets(contentEl)));
}

// support 專屬進退場（user 2026-06-07）：
//   進場＝依序 4 拍 cascade「Funds 標題 → 單次 Single → 定期 Regular → 其他項目 Others」，
//         group 之間錯開 GROUP_STEP 起跑，組內維持 0.12 stagger（標題 EN→ZH）。
//   退場＝右欄説明文字全部「一次過」同時 clip-out（stagger 0）；左欄 SUPPORT 標題卡片由 hero
//         playHeroExit 另外註冊各自跑（兩者分開，不混在同一個 stagger）。
function setupSupportSequence(contentEl) {
  // 依 DOM 順序組「進場 group」：含子區塊的 section → 標題拍 + 每個子區塊各一拍；其餘 section 整塊一拍。
  const groups = [];
  contentEl.querySelectorAll('.legal-intro, .legal-section').forEach(section => {
    const subReveals = [...section.querySelectorAll('.legal-sub-reveal')];
    if (subReveals.length) {
      // 標題拍：section 內「非子區塊」的 reveal（群組標題 EN/ZH +（若有）點層級說明）
      const titleTargets = [...section.querySelectorAll('.legal-reveal')]
        .filter(r => !r.classList.contains('legal-sub-reveal'))
        .map(r => /** @type {HTMLElement|null} */ (r.firstElementChild))
        .filter(Boolean);
      if (titleTargets.length) groups.push(titleTargets);
      subReveals.forEach(sr => { if (sr.firstElementChild) groups.push([sr.firstElementChild]); });
    } else {
      const targets = legalSlideTargets(section);
      if (targets.length) groups.push(targets);
    }
  });

  const allTargets = groups.flat();
  if (!allTargets.length) return;
  setupClipReveal(allTargets);  // 全部 yPercent:100 藏好（父層 .legal-reveal 已 clip）

  const GROUP_STEP = 0.42;  // group 之間起跑間隔（秒）→ 4 拍清楚分開但仍連貫
  const play = () => {
    const tl = gsap.timeline();
    groups.forEach((targets, gi) => {
      tl.to(targets, {
        yPercent: 0,
        duration: DUR.reveal,
        ease: EASE.enter,
        stagger: { each: 0.12 },
        clearProps: 'transform',
      }, gi * GROUP_STEP);
    });
  };
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.create({ trigger: contentEl, start: 'top 85%', once: true, onEnter: play });
  } else {
    play();
  }

  // 退場：説明文字全部一次過（stagger 0）；title 卡片走 hero playHeroExit 分開跑。
  // duration 對齊 hero title 退場（playHeroExit EXIT_DURATION 0.5s = DUR.medium）+ 兩者同 EASE.exit(power3.in)
  // → 文字與 title 卡片用同一條 ease 曲線、同時長，鎖步離開（之前文字用 playRevealExit 預設 DUR.base 0.4s
  //   比 title 短 → 兩條曲線進度對不上，看起來文字離開節奏跟 title 不一致）。
  registerPageExit(() => playRevealExit(legalSlideTargets(contentEl), { stagger: 0, duration: DUR.medium }));
}

// 純文字 → 包成段落（標題用同樣 esc 邏輯避免 < > & 破版）
function para(text) {
  return text ? `<p>${esc(text)}</p>` : '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
