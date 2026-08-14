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
import { normalizeBodyHtml } from './activities-data-loader.js';  // 富文本比照 admission-body：自動補 lang="zh-Hant" → ZH 區塊吃 ZH 行距
import { setupClipReveal, playClipReveal, playRevealExit } from '../ui/scroll-animate.js';
import { registerPageExit } from '../ui/page-exit.js';
import { DUR, EASE } from '../ui/motion.js';
import { sitePath } from '../ui/site-base.js';

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
      return fetch(sitePath(`data/${pageName}.json`)).then(r => r.json());
    }
  }
  return fetch(sitePath(`data/${pageName}.json`)).then(r => r.json());
}

export async function loadLegalData(pageName) {
  try {
    const data = await fetchLegalData(pageName);

    // regulations 頂部說明文字 placeholder（user 2026-07-15，比照 admission 頁的說明文字）：CMS overview 欄已存在但還沒填
    //   → 給預設佔位文字，後台填 overviewEn/Zh 後自動覆蓋（同 unit placeholder 機制）。scope regulations、不影響 policy。
    if (pageName === 'regulations' && !data.overviewEn && !data.overviewZh) {
      data.overviewEn = "Below are the department's regulations and guidelines. The unit shown beside each entry is where you can obtain or enquire about the document.";
      data.overviewZh = '以下為本系各項規章與辦法。每筆右側所示為其承辦單位，可前往索取或洽詢相關文件。';
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

// regulations 專屬：每筆規章（.legal-section-desc 內每個 <p>，內容是「EN<br>ZH」）加粗（樣式在 legal.css `.reg-line`）。
// （原本右側掛 share icon 當外部連結 hook，user 2026-07-14 要求全部移除。）
function decorateRegulationItems(scope) {
  scope.querySelectorAll('.legal-section-desc > p').forEach(p => p.classList.add('reg-line'));
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
    return fetch(sitePath('data/policy-and-statements.json')).then(r => r.json());
  }
}

export async function loadPolicyAndStatements() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const parts = (await fetchPolicyGroups()).filter(Boolean);

    contentEl.innerHTML = parts.map(renderGroup).join('');
    setupLegalReveal(contentEl, 'policy-and-statements');
    // 更新日期已改「每段各一份」渲染在各 accordion panel 底（renderGroup），不再用頁尾單一 #legal-updated。
  } catch (error) {
    console.error('Error loading policy-and-statements data:', error);
  }
}

// 單段：大標題（EN/ZH 各自 reveal 遮罩，包在 .legal-group-head 當 accordion header）+ 該段內容 + 該段自己的更新日期。
// 更新日期改「每段各一份」（user 2026-07-14，取代原頁尾單一份）：收在該段 accordion panel 底、展開才見。
function renderGroup(data) {
  const head =
    `<div class="legal-group-head">`
    + reveal(`<h2 class="legal-group-title-en">${esc(data.titleEn)}</h2>`)
    + reveal(`<h2 class="legal-group-title-zh">${esc(data.titleZh)}</h2>`)
    + `</div>`;
  const updated = (data.lastUpdatedEn || data.lastUpdatedZh)
    ? `<div class="legal-group-updated">`
      + `<p class="text-s">${esc(data.lastUpdatedEn || '')}</p>`
      + `<p class="text-s">${esc(data.lastUpdatedZh || '')}</p>`
      + `</div>`
    : '';
  // 條款標題＝群組(h2)底下一層 → h3（尺寸仍由 .legal-combined class 縮到內文大小,不受 tag 影響）。
  return `<div class="legal-group">${head}${renderStructured(data, true, 'h3')}${updated}</div>`;
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
// regulations 規章項目（結構化 {titleEn, titleZh, unitEn, unitZh}）→ 一條 .reg-line：
//   左＝規章名（EN<br>ZH，缺一語不留空行、粗體）；右＝承辦單位（去哪裡找該規章，EN<br>ZH，如 SCCD Office / 系辦）。
// 單位目前是 placeholder（本地 JSON 示意值），之後接後台 unit 欄位再由編輯者填真值（見 memory
//   project_regulations_page_and_legal_page_recipe）。缺 unit 就只渲染左側規章名（graceful）。
// （原 url 連結欄位與 <a>／share icon 已移除，user 2026-07-14/15：規章列不再是連結。）
function renderRegLine(it) {
  const name = `<span class="reg-line-text">${[it.titleEn, it.titleZh].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</span>`;
  // 承辦單位（去哪裡找）：有值就用；後台 unit 欄尚未建（CMS 無此欄）時用預設 placeholder 文字佔位
  //   （user 2026-07-15：直接寫文字、不用 box），後台補 unitEn/unitZh 後自動改真值。EN<br>ZH，缺一語不留空行。
  let uEn = it.unitEn, uZh = it.unitZh;
  if (!uEn && !uZh) { uEn = 'SCCD Office'; uZh = '系辦'; }
  const unit = `<span class="reg-line-unit">${[uEn, uZh].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</span>`;
  return `<div class="reg-line">${name}${unit}</div>`;
}

function renderStructured(data, numbered = true, titleTag = 'h2') {
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
    const pointDesc = normalizeBodyHtml(pt.desEn) + normalizeBodyHtml(pt.desZh);
    // regulations：點內 items（結構化規章清單 {titleEn,titleZh,unitEn,unitZh}）→ 組成 .reg-line（左規章名／右承辦單位）；其他頁無 items → 用 pointDesc
    const regItems = Array.isArray(pt.items) ? pt.items : null;
    const descInner = regItems ? regItems.map(renderRegLine).join('') : pointDesc;
    const subRevealsHtml = sections.map(s =>
      revealSub(
        `<div class="legal-section-desc"><div class="legal-subsection">`
        + `<h3 class="legal-subsection-title-en">${esc(s.titleEn)}</h3>`
        + `<h3 class="legal-subsection-title-zh">${esc(s.titleZh)}</h3>`
        + normalizeBodyHtml(s.desEn)   // 富文本，直接注入不 esc；normalize 自動補 lang（比照 admission-body）
        + normalizeBodyHtml(s.desZh)
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

  // support / regulations：手風琴**預設展開**→ 內文可見 → 用通用 per-section reveal（每個 .legal-section 依 DOM 順序
  //   reveal 內部所有 .legal-reveal：標題在 DOM 前→先進場，內文後進；退場整段一起沉出）＝user 2026-07-15「標題先出、內文後、切頁要退場」。
  //   （只需先 buildSupportAccordions 把 DOM 組成 header+panel、內文才排在標題後。）
  //   （只需先 build*Accordions 把 DOM 組成 header+panel、內文才排在標題後。）
  // 三頁都預設展開（policy 2026-07-15 起也是）＝內文可見 → 都走 revealLegalBlocks；差別只在 build*Accordions（support/regulations 是
  //   `.legal-section` 結構、policy 是 `.legal-group` 結構、標題兩行不併行）。
  // scrollGated:false＝載入即全部 reveal（不等捲到）。原因＝**收合上面的 list 會把下面 section 往上帶進視窗，但 ScrollTrigger 只認捲動、
  //   不認 layout 變動 → 下方標題卡在藏著（yPercent:100）不 render**（user 2026-07-15 bug）。全部先 reveal 就沒有「藏著等 trigger」狀態。
  //   非手風琴 legal 頁維持 scroll-gate（scrollGated 預設 true）。
  if (pageName === 'support' || pageName === 'regulations') { buildSupportAccordions(contentEl); revealLegalBlocks(contentEl, { scrollGated: false }); return; }
  if (pageName === 'policy-and-statements') { buildPolicyAccordions(contentEl); revealLegalBlocks(contentEl, { scrollGated: false }); return; }

  revealLegalBlocks(contentEl);
}

// 通用 legal 進退場：每個 block（.legal-group-head / .legal-intro / .legal-section）把內部所有 .legal-reveal 依 DOM 順序
// stagger clip-reveal（標題在 DOM 前→先進、內文後進）；退場整頁 .legal-reveal 一起沉出。
//   scrollGated=true（預設，非手風琴頁）：各 block 捲到 top 85% 才 reveal（as-you-scroll）。
//   scrollGated=false（展開態手風琴）：載入即全部 reveal，加 blockIndex 小延遲維持由上而下 cascade 感（見上方 bug 說明）。
function revealLegalBlocks(contentEl, { scrollGated = true } = {}) {
  const blocks = [...contentEl.querySelectorAll('.legal-group-head, .legal-intro, .legal-section')];
  blocks.forEach((block, i) => {
    const targets = legalSlideTargets(block);
    if (!targets.length) return;
    setupClipReveal(targets);  // 父層 .legal-reveal 已 overflow:clip → 只 set yPercent:100 不 reparent
    const play = () => playClipReveal(targets, { stagger: { each: 0.12 } });
    if (scrollGated && typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: block, start: 'top 85%', once: true, onEnter: play });
    } else {
      gsap.delayedCall(i * 0.12, play);
    }
  });
  // 退場排除「收合手風琴 panel（[inert]）內」的 reveal：收合後 panel height:0 clip 掉，但內部 reveal 仍佔自然高
  // （getBoundingClientRect≠0）→ 會被 playRevealExit 的 viewportOnly 收進來，且撐開 y-axis stagger 範圍、
  // 把可見標題彼此拉出時間間隔＝user 報「收合後切 header 分頁，accordion 那排延遲才消失、非一次過離開」。
  // 只收可見的（標題在 header 不在 panel、展開內容照收）→ 可見元素一起沉出。
  registerPageExit(() => playRevealExit(
    legalSlideTargets(contentEl).filter(el => !el.closest('.support-acc-panel[inert]'))
  ));
}

// 手風琴共用線路（support / regulations / policy 共用）：把 header（可點列，需已含標題內容）與 panel（收合內容）接起來——
// append chevron（flex space-between 排右）、補 a11y 屬性、GSAP height 0↔auto toggle。
// opts.open：預設展開態（donate/regulations 要，user 2026-07-15）；policy 省略＝預設收合。
function wireAccordion(header, panel, { open = false } = {}) {
  header.classList.add('support-acc-header');
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(open));

  const chevron = document.createElement('span');
  chevron.className = 'icon icon-chevron-list icon-m support-acc-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  header.appendChild(chevron);

  panel.classList.add('support-acc-panel');
  if (!open) panel.setAttribute('inert', '');   // 無障礙：收合內容移出 tab 順序
  gsap.set(panel, { height: open ? 'auto' : 0, overflow: 'hidden' });
  gsap.set(chevron, { rotation: open ? 90 : 270 });   // 展開態朝上 90 / 收合態朝下 270（base 朝左）

  // 由下往上 clip 收起（內容不動、panel 底邊上移貼到 sticky 標題）＝純 height:0（overflow:hidden、內容釘頂）。
  // 但面板比可視區高很多時，height 從全高→0 整段時長都在縮「螢幕外空高度」、可視內容只在最後幾 frame 啪一下；
  // 修法：收合前把起始高 cap 到可視裁切高（多的都在螢幕外看不到）→ wipe 全發生在可視範圍內、看得到收起感。
  // 可視裁切高：桌面＝inner-scroll box 的 clientHeight、手機＝viewport。
  const clipH = () => {
    const box = panel.closest('.legal-content-col');
    return box && getComputedStyle(box).overflowY === 'auto' ? box.clientHeight : window.innerHeight;
  };

  const toggle = () => {
    const open = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!open));
    if (open) {
      panel.setAttribute('inert', '');
      gsap.set(panel, { height: Math.min(panel.scrollHeight, clipH()) });
      gsap.to(panel, { height: 0, duration: DUR.base, ease: EASE.exitSoft });
      gsap.to(chevron, { rotation: 270, duration: DUR.fast });
    } else {
      panel.removeAttribute('inert');
      gsap.to(panel, { height: 'auto', duration: DUR.medium, ease: EASE.enterSoft });
      gsap.to(chevron, { rotation: 90, duration: DUR.fast });
    }
  };
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
}

// support（Funds/Others）+ regulations（5 大類）做成手風琴：標題列一行 EN+ZH + chevron，**預設展開**（user 2026-07-15）。
// 內文搬進 panel（不參與 clip-reveal cascade——避免內文卡在 yPercent:100）。
function buildSupportAccordions(contentEl) {
  contentEl.querySelectorAll('.legal-section').forEach(section => {
    const body = section.querySelector('.legal-section-body');
    if (!body || body.querySelector('.support-acc-panel')) return;   // 防重入
    const reveals = [...body.children].filter(c => c.classList.contains('legal-reveal'));
    const titleReveals = reveals.filter(r => r.querySelector('.legal-section-title-en, .legal-section-title-zh'));
    const panelReveals = reveals.filter(r => !titleReveals.includes(r));
    if (!titleReveals.length || !panelReveals.length) return;

    const header = document.createElement('div');
    const titles = document.createElement('div');
    titles.className = 'support-acc-titles';   // support 標題 EN+ZH 併一行（見 support.css）
    titleReveals.forEach(t => titles.appendChild(t));
    header.appendChild(titles);

    const panel = document.createElement('div');
    panelReveals.forEach(p => panel.appendChild(p));

    body.append(header, panel);
    wireAccordion(header, panel, { open: true });   // donate/regulations 預設展開
  });
}

// policy-and-statements 兩大段（隱私 / 無障礙）做成手風琴（user 2026-07-14）：header = .legal-group-head（EN/ZH 兩行標題，
// 保留堆疊、不併行）+ chevron；panel = 該段其餘內容（overview + 編號條款 + 該段自己的更新日期）。
function buildPolicyAccordions(contentEl) {
  contentEl.querySelectorAll('.legal-group').forEach(group => {
    const head = group.querySelector('.legal-group-head');
    if (!head || group.querySelector('.support-acc-panel')) return;   // 防重入

    const header = document.createElement('div');
    group.insertBefore(header, head);
    header.appendChild(head);   // 標題區塊移進 header（兩行保留）

    const panel = document.createElement('div');
    while (header.nextSibling) panel.appendChild(header.nextSibling);   // header 之後全部 = 段內容
    group.appendChild(panel);

    wireAccordion(header, panel, { open: true });   // policy 也預設展開（user 2026-07-15）
  });
}

// 純文字 → 包成段落（標題用同樣 esc 邏輯避免 < > & 破版）
function para(text) {
  return text ? `<p>${esc(text)}</p>` : '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
