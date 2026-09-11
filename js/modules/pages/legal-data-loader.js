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
import { setupClipReveal, playClipReveal, playRevealExit, navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { registerPageExit } from '../ui/page-exit.js';
import { initListAccordion } from '../accordions/list-accordion.js';  // zebra 手風琴（Regulations & Policy / Support 共用 admission 那套）
import { revealRows } from '../ui/list-row-reveal.js';  // title rows 進場（CSS transition，同 activities）
import { playAdmissionPanelExit } from './admission-data-loader.js';  // 離頁退場整套沿用 activities（先收 accordion → zebra clip 收 + rows 滑出）
import { loadUiLabels, applyUiLabels } from '../ui/ui-labels.js';  // sitemap 卡片名稱吃 ui_labels（後台改 nav 名稱如 Atlas→World 同步跟上）
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

// ══════════════════════════════════════════════════════════════════════════
// Zebra 手風琴（Regulations & Policy / Support / Site Map）— 2026-09-09
//   三頁改成 admission announcement 那種「灰白斑馬 + 點開卡片」樣式：手工組最小
//   list-item / list-header / list-content DOM，重用 initListAccordion（hover 隨機
//   accent、點開上色、ref 用 --item-color-deep）＋ 斑馬底色（legal.css .legal-zebra 規則）。
//   副標＝最後更新（user req 7），無國旗、無 share。樣式全走 lists.css 既有基底 + legal.css .legal-zebra。
//
//   entry = { titleEn, titleZh, subtitleEn?, subtitleZh?, bodyHtml }
// ══════════════════════════════════════════════════════════════════════════

function zebraSub(entry) {
  if (!entry.subtitleEn && !entry.subtitleZh) return '';
  return `<div class="legal-zebra-sub">`
    + (entry.subtitleEn ? `<p class="text-s">${esc(entry.subtitleEn)}</p>` : '')
    + (entry.subtitleZh ? `<p class="text-s" lang="zh-Hant">${esc(entry.subtitleZh)}</p>` : '')
    + `</div>`;
}

// 單一 zebra 手風琴列。idx 決定灰白 parity（連續跨區塊）。title col 是 header 第一子 → list-accordion
// 開啟時對它 translateX（比照 admission）；右側只有 chevron toggle（無 share／國旗）。
// 出生「收合態」（user 2026-09-10）：無 .active、無 inline accent/height——initListAccordion 對非 active
//   header 補 height:0+inert。進出場結構照 activities（user 2026-09-10「先渲染 zebra 再讓 title 出場」）＝
//   兩層分拍：①item 自身 clip-path inset(100%) 藏 zebra 底（進場由下往上揭）②title/chevron 各包
//   .legal-reveal 遮罩＋.list-reveal-row（translateY 110% 藏，revealRows 滑入）；.list-reveal-row class
//   同時讓離頁退場直接吃 playAdmissionPanelExit（activities 同一套）。
function zebraRow(entry, idx) {
  const zebra = idx % 2 === 0 ? ' list-item-zebra' : '';
  const row = (inner) => `<div class="legal-reveal"><div class="list-reveal-row" style="transform: translateY(110%)">${inner}</div></div>`;
  return `<div class="list-item${zebra}" style="clip-path: inset(100% 0% 0% 0%)">`
    + `<div class="list-header cursor-pointer group transition-colors duration-fast flex items-stretch justify-between gap-sm px-sm py-sm">`
    +   `<div class="legal-zebra-titlecol">`
    +     row(
            `<h3 class="legal-zebra-title-en">${esc(entry.titleEn)}</h3>`
            + (entry.titleZh ? `<h3 class="legal-zebra-title-zh" lang="zh-Hant">${esc(entry.titleZh)}</h3>` : '')
            + zebraSub(entry)
          )
    +   `</div>`
    +   `<div class="legal-zebra-chevron flex items-center">`
    +     row(
            `<button type="button" class="list-header-toggle flex-shrink-0 self-start" aria-expanded="false" aria-label="展開或收合詳情 Toggle details" style="overflow:clip;height:1.5em;width:1.5em;">`
            + `<span class="icon icon-chevron-list icon-s -rotate-90"></span>`
            + `</button>`
          )
    +   `</div>`
    + `</div>`
    + `<div class="list-content"><div class="legal-zebra-card">${entry.bodyHtml}</div></div>`
    + `</div>`;
}

function renderZebraRows(entries, startIdx = 0) {
  return entries.map((e, i) => zebraRow(e, startIdx + i)).join('');
}

function mountZebra(contentEl, html) {
  contentEl.classList.add('legal-zebra');
  contentEl.innerHTML = html;
  initListAccordion();
  requestAnimationFrame(() => setRegCatStickyTop(contentEl));
  const items = Array.from(contentEl.querySelectorAll('.list-item'));
  const rows = Array.from(contentEl.querySelectorAll('.list-reveal-row'));
  void contentEl.offsetHeight;  // 隱藏態 commit（painted）才會 transition 而非 snap
  // 進場＝activities reveal-IO 那套（activities-data-loader revealIo body）：zebra 底 clip 由下往上揭
  // （DUR.base ease-out、item 間 0.16s cascade、揭完 transitionend 清 inline→sticky/負 margin 不受 clip 影響）
  // ＋ title rows 同拍 revealRows（DUR.reveal、stagger 0.12）＝底色先到位、title 隨後滑入。
  if (!prefersReducedMotion()) {
    items.forEach((it, i) => {
      it.style.transition = `clip-path ${DUR.base}s ease-out ${(i * 0.16).toFixed(2)}s`;
      it.style.clipPath = 'inset(0% 0% 0% 0%)';
      const clr = (e) => {
        if (e.target !== it || e.propertyName !== 'clip-path') return;
        it.style.transition = ''; it.style.clipPath = '';
        it.removeEventListener('transitionend', clr);
      };
      it.addEventListener('transitionend', clr);
    });
  } else {
    items.forEach(it => { it.style.clipPath = ''; });
  }
  // 全部 title rows 揭完（onDone）才依序自動展開（user：list 完全 ready 再開，先第一個、再第二個）
  revealRows(rows, { dur: DUR.reveal, stagger: 0.12, onDone: () => autoOpenZebra(items) });
  // 離頁退場＝activities 同一套（admission-data-loader）：先收展開的 accordion → zebra 底 clip 收回 + rows 滑出
  registerPageExit(() => playAdmissionPanelExit(contentEl));
}

// 依序自動展開 zebra 列：走 list-accordion 正常 click 路徑（上色/sticky observer/aria 全現成）。
//   skipOpenScroll＝跳過 proceedOpen 的對齊捲動（進場不該捲頁）；點擊被 listAnimating 鎖吞掉
//   （前一項還在展開/user 搶先點了別項）→ 短輪詢重試。legal-zebra 多開不互關 → 依序點開全部即「全開」。
function autoOpenZebra(rows, firstDelay = 100) {
  const headers = rows
    .map(r => /** @type {HTMLElement|null} */ (r.querySelector('.list-header')))
    .filter(Boolean);
  let i = 0;
  const tryOpen = () => {
    if (i >= headers.length) return;
    const h = /** @type {any} */ (headers[i]);
    if (!h.isConnected) return;   // 已換頁 → 整串放棄
    if (h.classList.contains('active') || h.dataset.opening) { i++; setTimeout(tryOpen, 300); return; }  // user 搶先開了
    h.dataset.skipOpenScroll = '1';
    h.click();
    if (h.dataset.opening || h.classList.contains('active')) {
      // _preOpenScroll（proceedOpen 同步記的進場頂位）保留：自關比照一般開關邏輯捲回「打開前位置」＝頁頂
      //（user 2026-09-10「捲到 footer 點 title 關閉應回到頂部、不是留在 footer」；撤掉先前「原地收合」決策）
      i++;
      setTimeout(tryOpen, 300);
    } else {
      delete h.dataset.skipOpenScroll;   // 沒吃到 click（listAnimating 鎖中）→ 清旗標稍後重試
      setTimeout(tryOpen, 150);
    }
  };
  setTimeout(tryOpen, firstDelay);
}

// 規章卡類別欄 sticky offset ＝所屬 accordion header 高度（sticky header 釘捲動框 top:0，類別要釘它正下方）。
// ⚠️ 別硬編 px（header 高隨字級/字型變，見 curriculum sticky memory）→ 量高寫 var。
// ponytail: 量一次即可——desktop resize header 高幾乎不變；跨 768 斷點手機無 sticky（reg 表轉直排）故免 resize 監聽。
function setRegCatStickyTop(root) {
  root.querySelectorAll('.legal-reg-table').forEach(tbl => {
    const header = tbl.closest('.list-item')?.querySelector(':scope > .list-header');
    if (header) tbl.style.setProperty('--legal-reg-cat-top', header.offsetHeight + 'px');
  });
}

// ── 富文本卡片 body（policy / support / 無障礙聲明共用）──────────────────────
// 一個「點」的內文：可能有 sections（support Funds 的 Single/Regular）或 desEn/desZh 富文本。
function pointBodyHtml(pt) {
  let html = '';
  (pt.sections || []).forEach(s => {
    html += `<div class="legal-zebra-subsection">`
      + `<h5 class="legal-zebra-sub-title-en">${esc(s.titleEn)}</h5>`
      + `<h5 class="legal-zebra-sub-title-zh" lang="zh-Hant">${esc(s.titleZh)}</h5>`
      + normalizeBodyHtml(s.desEn) + normalizeBodyHtml(s.desZh)
      + `</div>`;
  });
  html += normalizeBodyHtml(pt.desEn) + normalizeBodyHtml(pt.desZh);
  return html;
}

// 整個 group（policy 隱私 / 無障礙聲明）→ 一列：overview + 每個點（小標＋內文）都在同一張卡。
function richGroupEntry(g) {
  let body = '';
  if (g.overviewEn || g.overviewZh) {
    body += `<div class="legal-zebra-overview">`
      + [para(g.overviewEn), para(g.overviewZh)].filter(Boolean).join('')
      + `</div>`;
  }
  (g.points || []).forEach(pt => {
    body += `<div class="legal-zebra-section">`;
    if (pt.titleEn) body += `<h4 class="legal-zebra-sec-title-en">${esc(pt.titleEn)}</h4>`;
    if (pt.titleZh) body += `<h4 class="legal-zebra-sec-title-zh" lang="zh-Hant">${esc(pt.titleZh)}</h4>`;
    body += pointBodyHtml(pt) + `</div>`;
  });
  return { titleEn: g.titleEn, titleZh: g.titleZh, subtitleEn: g.lastUpdatedEn, subtitleZh: g.lastUpdatedZh, bodyHtml: body };
}

// ── 規章表格（一個 accordion 內含全部規章）──────────────────────────────────
// user 2026-09-09b/c：reg 頁只兩個 accordion（全部規章一個、隱私政策一個）。
//   桌面＝3 欄（類別側欄 grid-row 跨組＋sticky ｜ 規章名 ｜ 承辦單位）；手機＝ref 式直排（類別整列小標、
//   規章名上／承辦單位下；user 2026-09-11「桌面手機分開、手機看 ref 區的設定」）。排版全在 legal.css .legal-reg-*。
//   規章名有 url 時當連結；列＝ref 色帶（deep 底黑字、hover/:active 黑底白字）。
function regSpans(en, zh) {
  return (en ? `<span>${esc(en)}</span>` : '')
    + (zh ? `<span lang="zh-Hant">${esc(zh)}</span>` : '');
}
function regTableEntry(reg) {
  const groups = (reg.points || []).map(cat => {
    const items = cat.items || [];
    const rows = items.map(item => {
      let uEn = item.unitEn, uZh = item.unitZh;
      if (!uEn && !uZh) { uEn = 'SCCD Office'; uZh = '系辦'; }  // 都預設 SCCD Office（後台 unit 欄填了才覆蓋）
      const nameInner = regSpans(item.titleEn, item.titleZh);
      // 後台有規章文件 URL → 名稱＋承辦單位兩欄都是連結（外開；hover 走下方 ref 深色規則）
      const cell = (cls, inner) => item.url
        ? `<a class="${cls} legal-reg-link" href="${esc(item.url)}" target="_blank" rel="noopener">${inner}</a>`
        : `<div class="${cls}">${inner}</div>`;
      // .legal-reg-item = display:contents hover 單元（讓第二/三欄一起變色、類別欄不變）
      return `<div class="legal-reg-item">${cell('legal-reg-name', nameInner)}${cell('legal-reg-unit', regSpans(uEn, uZh))}</div>`;
    }).join('');
    return `<div class="legal-reg-group" style="--reg-rows:${items.length || 1}">`
      + `<div class="legal-reg-cat">${regSpans(cat.titleEn, cat.titleZh)}</div>`
      + rows + `</div>`;
  }).join('');
  // 表格上方說明段（user 2026-09-10）：黑字直接坐在展開 accent 底上（同 ref 上方段落的定位）。
  // 後台 overview 欄有填就用後台的；空（現況）→ 前台預設文案。
  const ovEn = reg.overviewEn || 'Regulations and guidelines governing academic affairs and departmental administration. Click an item to view the full document.';
  const ovZh = reg.overviewZh || '以下彙整學系與校方相關規章辦法，點擊項目可查看完整文件。';
  return {
    titleEn: reg.titleEn || 'Department Regulations',
    titleZh: reg.titleZh || '學系規章',
    subtitleEn: reg.lastUpdatedEn, subtitleZh: reg.lastUpdatedZh,  // req7：最後更新寫在副標
    bodyHtml: `<div class="legal-zebra-overview"><p>${esc(ovEn)}</p><p lang="zh-Hant">${esc(ovZh)}</p></div>`
      + `<div class="legal-reg-table">${groups}</div>`,
  };
}

// ── 網站導覽卡片（user 2026-09-09d：捨 accordion outline、改 curriculum 卡片設計）──────
// 沿用 .courses-grid-card class（courses.css 樣式 + inverse/color.css 三 mode 規則全現成）：
//   2 欄 grid、每卡英中兩行、出生隨機小旋轉、hover 隨機 accent 底＋re-roll 角度（同 courses-map
//   applyHoverColor/applyHoverRot）、點擊＝<a> 由 router 攔截 SPA 跳轉（分頁 deep-link fromUserNav 生效）。
function pickCardRot() {
  // ±2° 排除 ±0.5（同 courses-map pickRotation：小角度、卡片間不貼）
  let r = 0;
  while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 4 - 2).toFixed(2));
  return r;
}
// 進場方向的完全隱藏 clip（單邊 100% inset＝不用量尺寸就能烙 HTML 出生即藏；translate 向量等 layout 好才由
// navChipHidden 量寬高補上）。與 scroll-animate _NAV_SLIDE 的 clip 定義同步。
const MAP_HIDE_CLIP = {
  top: 'inset(100% 0% 0% 0%)', bottom: 'inset(0% 0% 100% 0%)',
  left: 'inset(0% 0% 0% 100%)', right: 'inset(0% 100% 0% 0%)',
};
// ui_labels 佔位 span（applyUiLabels 逐 span 換字；無 key＝純文字 fallback）
const labelSeg = (key, part, text) => key
  ? `<span data-label-key="${esc(key)}" data-label-part="${part}">${esc(text)}</span>`
  : esc(text);
function mapCardHtml(item, num) {
  const rot = pickCardRot();
  const dir = pickNavDir();   // 無 el＝純 4 方向隨機（同 curriculum 卡片 pickCardDir：要多樣性）
  // 進場＝curriculum 卡同款（user 2026-09-10）：卡片「自身」clip-path＋translate 同步（navChipHidden，
  //   遮罩在旋轉後 local box 上跟著轉→旋轉角不被裁、也不需外層 .legal-reveal 遮罩＝不再「被切到再還原」；
  //   translate 用獨立屬性、與 inline rotate 共存）。出生先烙單邊 100% clip 全藏，reveal 前才量尺寸補 translate。
  // 卡內兩欄：左＝編號（1. / 1-1. / 1-1-1.）｜右＝英中標題直排；全部靠左對齊（user 2026-09-10 撤深度縮排）。
  // 名稱吃 ui_labels（labelKey 對應 row.key；json 文字＝最終 fallback），loadSitemap 渲染後 applyUiLabels 填入。
  // prefixKey（faculty 子項）＝前綴另一個 ui_labels key（如 faculty.dept.sccd「DCD」）：前綴與名稱各自
  // 獨立 key span，applyUiLabels 逐 span 換字＝後台改任一邊都跟上、不 hardcode 組合字串。
  const enInner = (item.prefixKey ? labelSeg(item.prefixKey, 'en', item.prefixEn || '') + ' ' : '')
    + labelSeg(item.labelKey, 'en', item.labelEn);
  const zhInner = (item.prefixKey ? labelSeg(item.prefixKey, 'zh', item.prefixZh || '') + ' ' : '')
    + labelSeg(item.labelKey, 'zh', item.labelZh);
  return `<a class="courses-grid-card legal-map-card" href="${esc(item.url)}" data-base-rot="${rot}" data-reveal-dir="${dir}"`
    + ` style="transform: rotate(${rot}deg); clip-path: ${MAP_HIDE_CLIP[dir]};">`
    +   `<span class="legal-map-num">${num}.</span>`
    +   `<span class="legal-map-txt">`
    +     `<span class="courses-grid-card-en">${enInner}</span>`
    +     (item.labelZh ? `<span class="courses-grid-card-zh" lang="zh-Hant">${zhInner}</span>` : '')
    +   `</span>`
    + `</a>`;
}
// 同一主頁自成一組（.legal-map-pgroup：主卡+其分頁卡直排一起，組間才有大距）；編號遞迴支援任意深度（1-1-1…）
function mapGroupHtml(pg, n) {
  let html = mapCardHtml(pg, String(n));
  const walk = (subs, prefix) => {
    (subs || []).forEach((s, i) => {
      const num = `${prefix}-${i + 1}`;
      html += mapCardHtml(s, num);
      walk(s.subs, num);
    });
  };
  walk(pg.subs, String(n));
  return `<div class="legal-map-pgroup">${html}</div>`;
}
// 卡片貼字寬（user 2026-09-11「卡片根據文字寬度調整」，同 about 說明卡 hug 精神）：
// 長標題折行後 box 仍佔滿欄寬＝右側留一段空底（hover 色帶特別明顯）→ 量實際 line boxes 的最寬右緣、
// 把卡寬收到貼字。收窄不會重折行（既有每行寬 ≤ 最寬行 ≤ 新寬）＝單次量測即定案（勿迭代）。
// ⚠️ 卡片出生帶 inline rotate：rects 會被旋轉失真 → 量測前暫清 transform、寫回時復原（讀寫分離批次）。
function fitMapCardsToText(root) {
  const cards = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.legal-map-card')));
  if (!cards.length) return;
  const prevT = cards.map(c => { const t = c.style.transform; c.style.transform = 'none'; c.style.width = ''; return t; });
  const widths = cards.map(card => {
    const left = card.getBoundingClientRect().left;
    let maxRight = -Infinity;
    card.querySelectorAll('.legal-map-num, .courses-grid-card-en, .courses-grid-card-zh').forEach(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) if (r.width && r.right > maxRight) maxRight = r.right;
    });
    if (maxRight === -Infinity) return 0;
    return Math.ceil(maxRight - left + (parseFloat(getComputedStyle(card).paddingRight) || 0)) + 1;
  });
  cards.forEach((c, i) => {
    if (widths[i]) c.style.width = widths[i] + 'px';   // border-box：含 padding；.legal-map-card max-width:100% 保險封頂
    c.style.transform = prevT[i];
  });
}

function bindMapCardHover(root) {
  root.querySelectorAll('.legal-map-card').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.style.background = SCCDHelpers.getRandomAccentColor();
      card.style.transform = `rotate(${pickCardRot()}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = '';
      card.style.transform = `rotate(${card.dataset.baseRot || 0}deg)`;
    });
  });
}

// policy_and_statements 內的「無障礙聲明」段判定（合併頁去掉它、導覽頁只留它）。
// ⚠️ 用標題比對（非 sort/index）＝後台重排也不會錯認；改標題文字才需同步。
function isAccessibilityGroup(g) {
  return /accessibility/i.test(g.titleEn || '') || (g.titleZh || '').includes('無障礙');
}

// ── Public loaders ─────────────────────────────────────────────────────────

// Regulations & Policy（regulations.html）：兩個 accordion —— 全部規章（3 欄表格）＋ 隱私政策（policy_and_statements 去掉無障礙段）。
export async function loadRegAndPolicy() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const [reg, policyGroups] = await Promise.all([
      fetchLegalData('regulations'),
      fetchPolicyGroups().catch(() => []),
    ]);
    const entries = [
      regTableEntry(reg || {}),
      ...(policyGroups || []).filter(Boolean).filter(g => !isAccessibilityGroup(g)).map(richGroupEntry),
    ];
    mountZebra(contentEl, renderZebraRows(entries));
  } catch (error) {
    console.error('Error loading regulations & policy:', error);
  }
}

// Support / Donate（donate.html）：每個「點」一列 zebra（Funds / Others），卡片＝該點 sections/內文。
export async function loadSupport() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const data = await fetchLegalData('support');
    const entries = ((data && data.points) || []).map(pt => ({
      titleEn: pt.titleEn, titleZh: pt.titleZh, bodyHtml: pointBodyHtml(pt),
    }));
    mountZebra(contentEl, renderZebraRows(entries));
  } catch (error) {
    console.error('Error loading support:', error);
  }
}

// Site Map（accessibility.html，user 2026-09-09d 改版）：無 accordion ——
//   ①無障礙聲明＝普通粗體文字（只留說明段 overview，英中兩段）②地圖＝curriculum 卡片 2 欄
//   （全部主頁與分頁攤平，點擊 SPA 跳轉）。地圖資料＝本地 data/accessibility.json。
export async function loadSitemap() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const [policyGroups, mapData, labels] = await Promise.all([
      fetchPolicyGroups().catch(() => []),
      fetch(sitePath('data/accessibility.json')).then(r => r.json()).catch(() => ({ pages: [] })),
      loadUiLabels().catch(() => ({})),   // 卡片名稱來源（header 已載過＝single-flight cache，通常即時）
    ]);
    const a11y = (policyGroups || []).filter(Boolean).find(isAccessibilityGroup);
    let html = '';
    if (a11y && (a11y.overviewEn || a11y.overviewZh)) {
      // 聲明段同走自遮罩 clip+translate（滿寬文字塊＝只挑上下短邊，同 pickNavDir 短邊邏輯）
      const descDir = Math.random() < 0.5 ? 'top' : 'bottom';
      html += `<div class="legal-map-desc" data-reveal-dir="${descDir}" style="clip-path: ${MAP_HIDE_CLIP[descDir]}">`
        + (a11y.overviewEn ? `<p class="text-s">${esc(a11y.overviewEn)}</p>` : '')
        + (a11y.overviewZh ? `<p class="text-s" lang="zh-Hant">${esc(a11y.overviewZh)}</p>` : '')
        + `</div>`;
    }
    const groups = (mapData.pages || []).map((pg, i) => mapGroupHtml(pg, i + 1)).join('');
    html += `<div class="legal-map-grid">${groups}</div>`;
    contentEl.innerHTML = html;
    applyUiLabels(labels, contentEl);   // 換上後台名稱（在 reveal 前＝不會揭到一半換字）
    fitMapCardsToText(contentEl);       // 換完字才量＝量到最終文字
    document.fonts?.ready?.then(() => fitMapCardsToText(contentEl));   // 冷載入字體晚到字寬會變 → 補量一次（函式自清 width 重量）
    bindMapCardHover(contentEl);
    // 進退場＝curriculum 卡片同款「自身 clip-path＋translate 同步」（user 2026-09-10：四方向隨機；
    //   遮罩在卡片自己的 local box 上跟著旋轉走＝角不被裁、無外層遮罩＝不再「被切到再還原」；
    //   translate 與 clip 抵消＝動畫全程不畫出最終框外、不掃到鄰卡）。
    const targets = Array.from(contentEl.querySelectorAll('.legal-map-desc, .legal-map-card'));
    if (typeof gsap !== 'undefined' && targets.length && !prefersReducedMotion()) {
      // 出生已烙單邊 100% clip 全藏；layout 好才量寬高補 translate 向量（clip/translate 不動 layout → 迴圈讀寫不 thrash）
      targets.forEach(el => gsap.set(el, navChipHidden(el, el.dataset.revealDir)));
      gsap.to(targets, {
        ...NAV_CHIP_SHOWN,
        duration: DUR.base,
        ease: 'cubic-bezier(0.25, 0, 0, 1)',   // 同 curriculum 灰卡
        stagger: { amount: 0.25 },
        overwrite: true,
        clearProps: 'clipPath,translate',
      });
      registerPageExit(() => new Promise(res => {
        const alive = targets.filter(el => el.isConnected);
        if (!alive.length) { res(); return; }
        // ⚠️ hidden 向量依「當下」尺寸/角度重算（navChipHidden 勿 cache）；fromTo 顯式起點：
        //   reveal 收尾 clearProps 後 computed clipPath=none，用 to() 補間不動會 snap
        const hid = alive.map(el => navChipHidden(el, el.dataset.revealDir));
        gsap.fromTo(alive, NAV_CHIP_SHOWN, {
          clipPath: (i) => hid[i].clipPath,
          translate: (i) => hid[i].translate,
          duration: DUR.base, ease: EASE.exit, overwrite: true, onComplete: res,
        });
        setTimeout(res, DUR.base * 1000 + 200);   // 保險：tween 被殺也不卡換頁
      }));
    } else {
      targets.forEach(el => { el.style.clipPath = ''; });   // 無 gsap／減少動態：直接全顯
    }
  } catch (error) {
    console.error('Error loading site map:', error);
  }
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
// （2026-09-08：url 選填欄回歸——有填則規章名變外部連結、無填維持純文字；share icon 仍不用。）
function renderRegLine(it) {
  const nameSpans = [it.titleEn, it.titleZh].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
  // 有 url（後台選填）→ 規章名變外部連結（新分頁；router 見 http/target=_blank 放行）；無 url 維持純文字。
  const name = it.url
    ? `<a class="reg-line-text reg-line-link" href="${esc(it.url)}" target="_blank" rel="noopener">${nameSpans}</a>`
    : `<span class="reg-line-text">${nameSpans}</span>`;
  // 承辦單位（去哪裡找）：有值就用；後台 unit 欄尚未建（CMS 無此欄）時用預設 placeholder 文字佔位
  //   （user 2026-07-15：直接寫文字、不用 box），後台補 unitEn/unitZh 後自動改真值。EN<br>ZH，缺一語不留空行。
  let uEn = it.unitEn, uZh = it.unitZh;
  if (!uEn && !uZh) { uEn = 'SCCD Office'; uZh = '系辦'; }
  const unit = `<span class="reg-line-unit">${[uEn, uZh].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</span>`;
  return `<div class="reg-line">${name}${unit}</div>`;
}

function renderStructured(data, numbered = true, titleTag = 'h2', lineRenderer = renderRegLine) {
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
    const descInner = regItems ? regItems.map(lineRenderer).join('') : pointDesc;
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
