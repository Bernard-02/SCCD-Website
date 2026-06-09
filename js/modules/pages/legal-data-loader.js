/**
 * Legal Data Loader
 * 讀取 legal 頁（policy-and-statements / regulations / support）的 JSON 並渲染。
 *
 * 資料只存「內容」不存樣式：overview（綜述）+ points[{ title, des }]，des 是富文本 HTML
 * （後台 WYSIWYG 產的乾淨 <p>/<ul>/<a>，無樣式 class）→ 老師可自由增減 bullet / 加連結粗體。
 * 編號與排版全由本檔 + legal.css 負責。
 * policy-and-statements 讀單一 collection policy_and_statements（每列一段）；regulations / support 各讀自己的 singleton。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { setupClipReveal, playClipReveal, playRevealExit } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';

// 已遷移到 Directus 的頁面 → collection 名；未列入的讀本地 /data/*.json。
// 一頁一頁遷：遷一個就在這加一筆，其餘頁完全不受影響。
// （2026-06-09：privacy_policy + accessibility 已合併成單一 collection policy_and_statements 並刪除，
//   政策及聲明改由 loadPolicyAndStatements 直接讀新 collection，不再經這張表。）
const CMS_COLLECTIONS = {
  'regulations': 'regulations',
  'support': 'support',
};

// 這些頁的 points 是「分類」不是「編號條款」→ 不顯示前面的 1. 2.
//   support：Funds / Others；regulations：學則 / 修業 / 資源 / 組織 / 法規（5 大類，每類列規章名當內文）
const NO_NUMBER_PAGES = new Set(['support', 'regulations']);

// CMS 優先；fetch 失敗（CORS / 斷網 / 5xx / 空資料）→ fallback 本地 /data/<page>.json，
// 跟 degree-show-data-loader 同 pattern。CMS 掛掉時 legal 頁仍渲染（靜態 JSON 跟 CMS singleton 同 shape：
// titleEn/Zh + overview + points），不會像之前直接 throw 留白頁（user 2026-06-05 CORS 掛掉回報）。
async function fetchLegalData(pageName) {
  const collection = CMS_COLLECTIONS[pageName];
  if (collection) {
    try {
      const response = await fetch(`${CMS_API_BASE}/${collection}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()).data;   // singleton 回傳單一物件（非陣列），直接取 .data
      if (!data) throw new Error('empty data');
      return data;
    } catch (err) {
      console.warn(`[legal] CMS fetch failed for ${pageName}, fallback to /data/${pageName}.json:`, err.message);
      return fetch(`/data/${pageName}.json`).then(r => r.json());
    }
  }
  return fetch(`/data/${pageName}.json`).then(r => r.json());
}

export async function loadLegalData(pageName) {
  try {
    const data = await fetchLegalData(pageName);

    // title 元素可能由頁面直接 hardcode（如 privacy-policy 為了 chip 樣式 + <br> 斷行），此時 ID 不存在 → null guard
    const titleEn = document.getElementById('legal-title-en');
    const titleZh = document.getElementById('legal-title-zh');
    if (titleEn) titleEn.textContent = data.titleEn;
    if (titleZh) titleZh.textContent = data.titleZh;

    // 結構化（有 points）優先組裝；否則 fallback 舊的 content HTML blob
    const contentEl = document.getElementById('legal-content');
    if (contentEl) {
      contentEl.innerHTML = data.points ? renderStructured(data, !NO_NUMBER_PAGES.has(pageName)) : (data.content || '');
      if (pageName === 'regulations') decorateRegulationItems(contentEl);  // 每筆規章右邊加 share icon
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

// regulations 專屬：每筆規章（.legal-section-desc 內每個 <p>，內容是「EN<br>ZH」）右邊加 share icon。
// icon 是站上既有 .icon-share（CSS mask、繼承 currentColor）＝真 DOM 元素，user 之後要掛 link 直接把 .reg-share
// 包進 <a>（或加 click handler）即可，比 CSS ::after 偽元素好接。
// ⚠️ 文字（EN<br>ZH）必須先包進 .reg-line-text 當「單一」flex item，否則 <p> 設 flex 後 <br> 不換行、EN/ZH 擠成一行。
// 樣式（flex row + fit-content）在 legal.css `.legal-regulations .reg-line`。
function decorateRegulationItems(scope) {
  scope.querySelectorAll('.legal-section-desc > p').forEach(p => {
    if (p.querySelector('.reg-share')) return;   // 防重入（保險）
    const text = document.createElement('span');
    text.className = 'reg-line-text';
    while (p.firstChild) text.appendChild(p.firstChild);
    const icon = document.createElement('span');
    icon.className = 'icon icon-share icon-s reg-share';
    icon.setAttribute('aria-hidden', 'true');
    p.append(text, icon);
    p.classList.add('reg-line');
  });
}

// 政策及聲明（policy-and-statements）：讀單一 collection policy_and_statements（每列一段，sort 排序），
// 渲染成多段一頁。2026-06-09 起取代原本分別抓 privacy_policy + accessibility 兩個 singleton（已合併刪除）。
// 每段（隱私 / 無障礙）開頭放 .legal-group-title（＝原編號 section 標題大小），下接該段的 overview + 編號條款；
// 編號條款標題在 .legal-combined 變體下縮到內文大小（樣式見 legal.css）。
// CMS 優先、fail → fallback 本地 /data/policy-and-statements.json（同 shape：陣列，每段 titleEn/Zh + overview + points）。
async function fetchPolicyGroups() {
  try {
    const res = await fetch(`${CMS_API_BASE}/policy_and_statements?sort=sort`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).data;   // 非 singleton → .data 是陣列（每列一段）
    if (!Array.isArray(data) || !data.length) throw new Error('empty data');
    return data;
  } catch (err) {
    console.warn('[legal] CMS fetch failed for policy_and_statements, fallback to local:', err.message);
    return fetch('/data/policy-and-statements.json').then(r => r.json());
  }
}

export async function loadPolicyAndStatements() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const parts = (await fetchPolicyGroups()).filter(Boolean);

    contentEl.innerHTML = parts.map(renderGroup).join('');
    setupLegalReveal(contentEl, 'policy-and-statements');

    // 兩段同更新日期 → 取第一段顯示一次（頁尾共用 #legal-updated）
    const updated = parts[0] || {};
    const updatedEn = document.getElementById('legal-updated-en');
    const updatedZh = document.getElementById('legal-updated-zh');
    if (updatedEn) updatedEn.textContent = updated.lastUpdatedEn || '';
    if (updatedZh) updatedZh.textContent = updated.lastUpdatedZh || '';
  } catch (error) {
    console.error('Error loading policy-and-statements data:', error);
  }
}

// 單段：大標題（EN/ZH 各自 reveal 遮罩，包在 .legal-group-head 供 setupLegalReveal 掛 ScrollTrigger）+ 該段內容。
function renderGroup(data) {
  const head =
    `<div class="legal-group-head">`
    + reveal(`<h3 class="legal-group-title-en">${esc(data.titleEn)}</h3>`)
    + reveal(`<h3 class="legal-group-title-zh">${esc(data.titleZh)}</h3>`)
    + `</div>`;
  // 條款標題用 <p>（合併頁已是 p2 內文大小、非 heading），其餘 legal 頁仍 h4。
  return `<div class="legal-group">${head}${renderStructured(data, true, 'p')}</div>`;
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
// titleTag：條款標題的 tag。預設 h4（regulations/support 的標題是 32px 大標＝語意上是 heading）；
//   合併頁（政策及聲明）的條款標題已縮到 p2 內文大小＝改用 <p> 較貼切（user 2026-06-09）。樣式全走 class 不受 tag 影響。
// regulations 規章項目（結構化 {titleEn,titleZh,url}）→ 一條 .reg-line：文字（EN<br>ZH，缺一語不留空行）+ share icon。
// 有 url 時「整列」是 <a target=_blank>（整列可點/hover，連結文字＝規章名故免 aria-label；router.js 忽略 http/外連/_blank 不攔截）；
// 無 url 時是 <p>。icon 一律 <span>，用 currentColor → CSS `a.reg-line` 補 color:inherit 才黑。取代舊 decorateRegulationItems 拆 desEn。
function renderRegLine(it) {
  const text  = [esc(it.titleEn), esc(it.titleZh)].filter(Boolean).join('<br>');
  const inner = `<span class="reg-line-text">${text}</span>`
    + `<span class="icon icon-share icon-s reg-share" aria-hidden="true"></span>`;
  return it.url
    ? `<a class="reg-line" href="${esc(it.url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<p class="reg-line">${inner}</p>`;
}

function renderStructured(data, numbered = true, titleTag = 'h4') {
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
    // regulations：點內 items（結構化規章清單 {titleEn,titleZh,url}）→ 組成 .reg-line（含連結 icon）；其他頁無 items → 用 pointDesc
    const regItems = Array.isArray(pt.items) ? pt.items : null;
    const descInner = regItems ? regItems.map(renderRegLine).join('') : pointDesc;
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
      + reveal(`<${titleTag} class="legal-section-title-en">${esc(pt.titleEn)}</${titleTag}>`)
      + reveal(`<${titleTag} class="legal-section-title-zh">${esc(pt.titleZh)}</${titleTag}>`)
      + (descInner ? reveal(`<div class="legal-section-desc">${descInner}</div>`) : '')
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

  // .legal-group-head 只出現在合併頁（政策及聲明）的兩段大標題；其他頁 selector 不中、不受影響。
  contentEl.querySelectorAll('.legal-group-head, .legal-intro, .legal-section').forEach(block => {
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
