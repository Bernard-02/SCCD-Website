/**
 * Legal Data Loader
 * 讀取 legal 頁（regulations / support / sitemap）的後台資料並渲染。
 *
 * 資料只存「內容」不存樣式：overview（綜述）+ points[{ title, des }]，des 是富文本 HTML
 * （後台 WYSIWYG 產的乾淨 <p>/<ul>/<a>，無樣式 class）→ 老師可自由增減 bullet / 加連結粗體。
 * 編號與排版全由本檔 + legal.css 負責。
 * regulations / support 各讀自己的 singleton；規章頁另併 policy_and_statements（隱私政策）。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { normalizeBodyHtml } from './activities-data-loader.js';  // 富文本比照 admission-body：自動補 lang="zh-Hant" → ZH 區塊吃 ZH 行距
import { navChipHidden, pickNavDir, NAV_CHIP_SHOWN } from '../ui/scroll-animate.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { registerPageExit } from '../ui/page-exit.js';
import { initListAccordion, refreshStickyPinObservers } from '../accordions/list-accordion.js';  // zebra 手風琴（Regulations & Policy / Support 共用 admission 那套）
import { revealRows, hideRow } from '../ui/list-row-reveal.js';  // rows 進場（CSS transition，同 activities）；hideRow＝per-item 翻上
import { playAdmissionPanelExit } from './admission-data-loader.js';  // 離頁退場整套沿用 activities（先收 accordion → zebra clip 收 + rows 滑出）
import { loadUiLabels, applyUiLabels } from '../ui/ui-labels.js';  // sitemap 卡片名稱吃 ui_labels（後台改 nav 名稱如 Atlas→World 同步跟上）
import { DUR, EASE } from '../ui/motion.js';
import { applyMarqueeOverflow, bindMarqueeReturn } from '../ui/marquee-overflow.js';  // reg 列英中單行過長 marquee（桌面 hover 回彈）
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { sitePath } from '../ui/site-base.js';
import { escapeHtml as esc } from '../ui/escape-html.js';

// 已遷移到 Directus 的頁面 → collection 名；未列入的讀本地 /data/*.json。
// 一頁一頁遷：遷一個就在這加一筆，其餘頁完全不受影響。
// （2026-06-09：privacy_policy + accessibility 已合併成單一 collection policy_and_statements 並刪除，
//   政策及聲明改由 loadPolicyAndStatements 直接讀新 collection，不再經這張表。）
const CMS_COLLECTIONS = {
  'regulations': 'regulations',
  'support': 'support',
};

// 後台是唯一來源：fetch 失敗（CORS / 斷網 / 5xx / 空資料）→ null（頁面只剩標題，不再退本地 JSON，user 2026-10-04）
async function fetchLegalData(pageName) {
  try {
    const response = await fetch(`${CMS_API_BASE}/${CMS_COLLECTIONS[pageName]}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()).data;   // singleton 回傳單一物件（非陣列），直接取 .data
    if (!data) throw new Error('empty data');
    return data;
  } catch (err) {
    console.warn(`[legal] CMS fetch failed for ${pageName}:`, err.message);
    return null;
  }
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
  // 進場＝完全比照 activities/admission（user 2026-09-12「直接參考 activities 的、別再自己做」）：title 與副標
  //   拆成各自 reveal row（可分拍 stagger），出生都由下（translateY 110%）；per-item 交替方向由 mountZebra 翻
  //   （整筆一致：半數 title+副標一起由上滑入＋底色 box 由上往下揭，半數維持由下）。chevron 結構列維持由下。
  const row = (inner) => `<div class="legal-reveal"><div class="list-reveal-row" style="transform: translateY(110%)">${inner}</div></div>`;
  const sub = zebraSub(entry);
  return `<div class="list-item${zebra}" style="clip-path: inset(100% 0% 0% 0%)">`
    + `<div class="list-header cursor-pointer group flex items-stretch justify-between gap-sm px-sm py-sm">`
    +   `<div class="legal-zebra-titlecol">`
    +     row(
            `<h3 class="legal-zebra-title-en">${esc(entry.titleEn)}</h3>`
            + (entry.titleZh ? `<h3 class="legal-zebra-title-zh" lang="zh-Hant">${esc(entry.titleZh)}</h3>` : '')
          )
    +     (sub ? row(sub) : '')
    +   `</div>`
    +   `<div class="legal-zebra-chevron flex items-start pt-[0.25rem] md:pt-[0.55rem]">`  // chevron 貼英文標題那行（同 activities 右上 icon 群組）
    +     row(
            `<button type="button" class="list-header-toggle flex-shrink-0 self-start" aria-expanded="false" aria-label="展開或收合詳情 Toggle details" style="overflow:clip;height:1.5em;width:1.5em;">`
            + `<div class="flex justify-center items-start w-full h-full"><span class="icon icon-chevron-list icon-s -rotate-90"></span></div>`
            + `</button>`
          )
    +   `</div>`
    + `</div>`
    + `<div class="list-content"><div class="legal-zebra-card">${entry.bodyHtml}</div></div>`
    + `</div>`;
}

// legal 三頁頂部說明段（user 2026-10-04）：粗體 text-s（.legal-page-desc／.legal-map-desc p），桌面 3/4 寬＝admission
// 說明段同一套 grid（grid-12 → min-[1024px]:col-span-9）。來源：Donate＝support.overview、Regulations＝regulations.pageDesc、
// Site Map＝accessibility_statement.overview。空＝不渲染。
function pageDescInner(en, zh) {
  if (!en && !zh) return '';
  return `<div class="grid-12"><div class="col-span-12 min-[1024px]:col-span-9">`
    + (en ? `<p>${esc(en)}</p>` : '') + (zh ? `<p lang="zh-Hant">${esc(zh)}</p>` : '')
    + `</div></div>`;
}
// zebra 頁版：包成出生藏的 reveal row → mountZebra 的 revealRows／離頁 playAdmissionPanelExit 自動帶到（DOM 最前＝最先進場）。
// 外層 .legal-page-desc＝桌面 sticky＋底色＋下留白；遮罩 .legal-reveal 另包一層（留白若在遮罩內，藏起的 row 會露在留白裡）
function zebraPageDesc(en, zh) {
  const inner = pageDescInner(en, zh);
  return inner ? `<div class="legal-page-desc"><div class="legal-reveal"><div class="list-reveal-row" style="transform: translateY(110%)">${inner}</div></div></div>` : '';
}

function renderZebraRows(entries, startIdx = 0) {
  return entries.map((e, i) => zebraRow(e, startIdx + i)).join('');
}

function mountZebra(contentEl, html) {
  contentEl.classList.add('legal-zebra');
  contentEl.innerHTML = html;
  initListAccordion();
  requestAnimationFrame(() => setRegCatStickyTop(contentEl));
  // reg 列 marquee：量寬＋dual-copy（收合態 height 0 但寬已排版、量得到；fonts swap 後寬會變 → ready 再重量，
  // helper 自帶 reset 可重跑）；桌面逐 hover 單元（.legal-reg-item）綁放開回彈，只綁一次（重量不重綁）。
  const measureRegMarquee = () => {
    const table = contentEl.querySelector('.legal-reg-table');
    if (table) applyMarqueeOverflow(table, '.legal-reg-line', '.legal-reg-mq-inner');
  };
  requestAnimationFrame(() => {
    measureRegMarquee();
    // hover 單元＝逐欄（name/unit 各自），hover 誰只捲誰（user 2026-09-15；同 marquee 單元粒度慣例）
    contentEl.querySelectorAll('.legal-reg-name, .legal-reg-unit').forEach((cellEl) => {
      registerPageCleanup(bindMarqueeReturn(/** @type {HTMLElement} */ (cellEl), '.legal-reg-mq-inner', '.legal-reg-line'));
    });
  });
  if (document.fonts?.ready) document.fonts.ready.then(() => { if (contentEl.isConnected) measureRegMarquee(); });
  // 頁面說明 sticky 貼框頂（桌面，legal.css）→ 展開標題列釘點＝說明段高：寫 inline var（getListStickyTop 讀它＝開 item
  // 捲動落點同步；規章類別 sticky 也疊這個值）。非桌面說明段不 sticky → 移除、交回 CSS 值（user 2026-10-04）
  const pageDesc = /** @type {HTMLElement|null} */ (contentEl.querySelector('.legal-page-desc'));
  if (pageDesc && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (SCCDHelpers.isDesktopLayout()) contentEl.style.setProperty('--list-header-sticky-top', `${pageDesc.offsetHeight}px`);
      else contentEl.style.removeProperty('--list-header-sticky-top');
      refreshStickyPinObservers(contentEl);
    });
    ro.observe(pageDesc);
    registerPageCleanup(() => ro.disconnect());
  }
  // 欄寬依內容隨視窗變（legal.css .legal-reg-table）→ resize 後重量，否則縮小被切的字沒標 is-overflow、hover 不捲（user 2026-10-03）
  if (contentEl.querySelector('.legal-reg-table')) {
    let rzTimer = 0;
    const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(measureRegMarquee, 150); };
    window.addEventListener('resize', onResize);
    registerPageCleanup(() => { clearTimeout(rzTimer); window.removeEventListener('resize', onResize); });
  }
  const items = Array.from(contentEl.querySelectorAll('.list-item'));
  const rows = Array.from(contentEl.querySelectorAll('.list-reveal-row'));
  // per-item 交替方向（比照 admission-data-loader）：整筆一致——半數 title+副標由上滑入（translateY -110%）＋
  //   底色 box 由上往下揭（clip inset 底 100%），半數維持由下。chevron 結構列不翻（維持由下、admission 同）。
  const canFlip = !prefersReducedMotion();
  items.forEach(it => {
    if (canFlip && Math.random() < 0.5) {
      it.dataset.fromTop = '1';
      it.querySelectorAll('.legal-zebra-titlecol .list-reveal-row').forEach(r => hideRow(/** @type {HTMLElement} */ (r), true));
      it.style.clipPath = 'inset(0% 0% 100% 0%)';   // 底色 box 由上往下揭（跟文字同向）
    }
  });
  void contentEl.offsetHeight;  // 隱藏態 commit（painted，含剛翻上的 -110%）才會 transition 而非 snap
  // 進場＝activities reveal-IO 那套（activities-data-loader revealIo body）：zebra 底 clip 揭（跟該筆文字同向）
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
  // 全部 title rows 揭完（onDone）才自動展開——只開第一個（user 2026-10-03，原依序全開）
  revealRows(rows, { dur: DUR.reveal, stagger: 0.12, onDone: () => autoOpenZebra(items.slice(0, 1)) });
  // 離頁退場＝activities 同一套（admission-data-loader）：先收展開的 accordion → zebra 底 clip 收回 + rows 滑出
  registerPageExit(() => playAdmissionPanelExit(contentEl));
}

// 依序自動展開 zebra 列：走 list-accordion 正常 click 路徑（上色/sticky observer/aria 全現成）。
//   skipOpenScroll＝跳過 proceedOpen 的對齊捲動（進場不該捲頁）；點擊被 listAnimating 鎖吞掉
//   （前一項還在展開/user 搶先點了別項）→ 短輪詢重試。現只傳第一列（一次只開一個，user 2026-10-03）。
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
      + [para(g.overviewEn), para(g.overviewZh, 'zh-Hant')].filter(Boolean).join('')
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
// name/unit 版：英中各一行（nowrap），過長 marquee（user 2026-09-15）——行＋inner 結構同 courses 卡，
// 量測/dual-copy 由 mountZebra 的 applyMarqueeOverflow 跑。類別欄仍用 regSpans（自然折行）。
function regMqSpans(en, zh) {
  const line = (txt, isZh) => txt
    ? `<span class="legal-reg-line"${isZh ? ' lang="zh-Hant"' : ''}><span class="legal-reg-mq-inner">${esc(txt)}</span></span>`
    : '';
  return line(en, false) + line(zh, true);
}
function regTableEntry(reg) {
  const groups = (reg.points || []).map(cat => {
    const items = cat.items || [];
    const rows = items.map(item => {
      let uEn = item.unitEn, uZh = item.unitZh;
      if (!uEn && !uZh) { uEn = 'SCCD Office'; uZh = '系辦'; }  // 都預設 SCCD Office（後台 unit 欄填了才覆蓋）
      const nameInner = regMqSpans(item.titleEn, item.titleZh);
      // 後台有規章文件 URL → 名稱＋承辦單位兩欄都是連結（外開；hover 走下方 ref 深色規則）
      const cell = (cls, inner) => item.url
        ? `<a class="${cls} legal-reg-link" href="${esc(item.url)}" target="_blank" rel="noopener">${inner}</a>`
        : `<div class="${cls}">${inner}</div>`;
      // .legal-reg-item = display:contents hover 單元（讓第二/三欄一起變色、類別欄不變）
      return `<div class="legal-reg-item">${cell('legal-reg-name', nameInner)}${cell('legal-reg-unit', regMqSpans(uEn, uZh))}</div>`;
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

// ── 網站導覽卡片（user 2026-09-09d 捨 accordion outline；10-03 改首頁 news banner 款，見 mapCardHtml）──────
//   每卡英中兩行、出生隨機小旋轉、hover 配色對調＋re-roll 角度、點擊＝<a> 由 router 攔截 SPA 跳轉
//   （分頁 deep-link fromUserNav 生效）。
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
// 卡片＝首頁 news banner 同款（user 2026-10-03）：編號 box 吃 accent（--map-accent，同組同色）、標題區黑底白字；
// hover 兩區配色對調（.is-swap），三 mode 規則見 legal.css / inverse.css / color.css
function mapCardHtml(item, num, accent) {
  const rot = pickCardRot();
  const dir = pickNavDir();   // 無 el＝純 4 方向隨機（同 curriculum 卡片 pickCardDir：要多樣性）
  // 進場＝curriculum 卡同款（user 2026-09-10）：卡片「自身」clip-path＋translate 同步（navChipHidden，
  //   遮罩在旋轉後 local box 上跟著轉→旋轉角不被裁、也不需外層 .legal-reveal 遮罩＝不再「被切到再還原」；
  //   translate 用獨立屬性、與 inline rotate 共存）。出生先烙單邊 100% clip 全藏，reveal 前才量尺寸補 translate。
  // 卡內兩欄：左＝編號（1. / 1-1. / 1-1-1.）｜右＝英中標題直排；全部靠左對齊（user 2026-09-10 撤深度縮排）。
  // 名稱吃 ui_labels（labelKey 對應 row.key；json 文字＝最終 fallback），loadSitemap 渲染後 applyUiLabels 填入。
  // prefixKey（curriculum BFA 子項）＝前綴另一個 ui_labels key（如 curriculum.group.bfa「BFA」；faculty 的 DCD 前綴 10-03 撤）：前綴與名稱各自
  // 獨立 key span，applyUiLabels 逐 span 換字＝後台改任一邊都跟上、不 hardcode 組合字串。
  const enInner = (item.prefixKey ? labelSeg(item.prefixKey, 'en', item.prefixEn || '') + ' ' : '')
    + labelSeg(item.labelKey, 'en', item.labelEn);
  const zhInner = (item.prefixKey ? labelSeg(item.prefixKey, 'zh', item.prefixZh || '') + ' ' : '')
    + labelSeg(item.labelKey, 'zh', item.labelZh);
  return `<a class="legal-map-card" href="${esc(item.url)}" data-base-rot="${rot}" data-reveal-dir="${dir}"`
    + ` style="--map-accent: ${accent}; transform: rotate(${rot}deg); clip-path: ${MAP_HIDE_CLIP[dir]};">`
    +   `<span class="legal-map-num">${num}</span>`
    +   `<span class="legal-map-txt">`
    +     `<span class="courses-grid-card-en">${enInner}</span>`
    +     (item.labelZh ? `<span class="courses-grid-card-zh" lang="zh-Hant">${zhInner}</span>` : '')
    +   `</span>`
    + `</a>`;
}
// 同一主頁自成一組（.legal-map-pgroup＝主卡＋.legal-map-subs 分頁卡；桌面主卡 col1、分頁卡 col2，見 legal.css）；
// 編號遞迴支援任意深度（1-1-1…，全攤平進 subs）
function mapGroupHtml(pg, n) {
  // 以頁面分色：第 n 組依全站 rgb 順序（粉/綠/藍，同首頁 news）往下輪，分頁卡跟主卡同色
  const accent = SCCDHelpers.ACCENT_COLORS[(n - 1) % SCCDHelpers.ACCENT_COLORS.length];
  let subs = '';
  const walk = (list, prefix) => {
    // hidden＝這版還沒上線的分頁（coming soon）先不列卡；恢復＝拿掉 json 的 hidden
    (list || []).filter(s => !s.hidden).forEach((s, i) => {
      const num = `${prefix}-${i + 1}`;
      subs += mapCardHtml(s, num, accent);
      walk(s.subs, num);
    });
  };
  walk(pg.subs, String(n));
  return `<div class="legal-map-pgroup">${mapCardHtml(pg, String(n), accent)}`
    + (subs ? `<div class="legal-map-subs">${subs}</div>` : '')
    + `</div>`;
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

// 分頁卡等寬欄自動排（user 2026-10-03）：桌面 .legal-map-subs＝3 欄 grid（欄數以 CSS 為準），每張卡依貼字寬佔 N 欄
// （N＝裝得下它的最少欄數，上限＝欄數）；本列剩下的欄裝不下＝grid 自動換下一列（sparse 不回填＝順序不亂）。
// 先讓卡全寬（1 / -1）再量貼字寬＝量到不被單欄擠折的自然寬，才回寫 span。手機 subs 是 flex＝不分欄。
function layoutMapCards(root) {
  const subsList = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.legal-map-subs')));
  subsList.forEach(s => s.querySelectorAll('.legal-map-card').forEach(c => { /** @type {HTMLElement} */ (c).style.gridColumn = '1 / -1'; }));
  fitMapCardsToText(root);
  // 讀寫分離：subs 欄寬只看外層 col2、不受 span 影響 → 先全讀再全寫
  const metrics = subsList.map(s => {
    const cs = getComputedStyle(s);
    if (cs.display !== 'grid') return null;
    const cols = cs.gridTemplateColumns.split(' ').length;
    const gap = parseFloat(cs.columnGap) || 0;
    return { cols, gap, colW: (s.clientWidth - gap * (cols - 1)) / cols };
  });
  subsList.forEach((s, i) => {
    const m = metrics[i];
    if (!m) return;
    s.querySelectorAll('.legal-map-card').forEach(c => {
      const card = /** @type {HTMLElement} */ (c);
      const w = parseFloat(card.style.width) || card.offsetWidth;
      card.style.gridColumn = `span ${Math.min(m.cols, Math.ceil((w + m.gap) / (m.colW + m.gap)))}`;
    });
  });
}

// hover：編號 box 與標題區配色對調（.is-swap，同首頁 news，user 2026-10-03）＋角度重抽（user 2026-09-12）
function bindMapCardHover(root) {
  root.querySelectorAll('.legal-map-card').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.classList.add('is-swap');
      card.style.transform = `rotate(${pickCardRot()}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('is-swap');
      card.style.transform = `rotate(${card.dataset.baseRot || 0}deg)`;
    });
  });
}

// 編號欄等寬（user 2026-09-12「以最寬的那個為主」）：量所有 .legal-map-num 最寬者，回寫成統一 width →
//   各卡編號欄同寬、標題左緣對齊。⚠️ 在 fitMapCardsToText 之前跑（卡寬量測含 num 欄）；卡片出生帶 inline
//   rotate 不影響水平量寬（getBoundingClientRect width 在小角度誤差可忽略，且量的是同一批一致偏差）。
function equalizeMapNumWidth(root) {
  const nums = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.legal-map-num')));
  if (!nums.length) return;
  nums.forEach(n => { n.style.width = ''; });   // 先清（重量）
  let max = 0;
  nums.forEach(n => { const w = n.getBoundingClientRect().width; if (w > max) max = w; });
  if (max > 0) {
    nums.forEach(n => { n.style.width = Math.ceil(max) + 'px'; });
    root.style.setProperty('--map-num-w', Math.ceil(max) + 'px');   // 黑區 ::before 起點（legal.css .legal-map-card）
  }
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
    mountZebra(contentEl, zebraPageDesc(reg?.pageDescEn, reg?.pageDescZh) + renderZebraRows(entries));
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
    mountZebra(contentEl, zebraPageDesc(data?.overviewEn, data?.overviewZh) + renderZebraRows(entries));
  } catch (error) {
    console.error('Error loading support:', error);
  }
}

// Site Map（sitemap.html，user 2026-09-09d 改版；10-03 slug accessibility→sitemap）：無 accordion ——
//   ①無障礙聲明＝普通粗體文字（只留說明段 overview，英中兩段）②地圖＝curriculum 卡片 2 欄
//   （全部主頁與分頁攤平，點擊 SPA 跳轉）。地圖資料＝本地 data/accessibility.json。
export async function loadSitemap() {
  const contentEl = document.getElementById('legal-content');
  if (!contentEl) return;
  try {
    const [a11yStmt, mapData, labels] = await Promise.all([
      // 無障礙聲明＝獨立 singleton accessibility_statement（2026-09-15 拆出）；失敗＝不顯示聲明段
      fetchAccessibilityStatement().catch(() => null),
      fetch(sitePath('data/accessibility.json')).then(r => r.json()).catch(() => ({ pages: [] })),
      loadUiLabels().catch(() => ({})),   // 卡片名稱來源（header 已載過＝single-flight cache，通常即時）
    ]);
    const a11y = a11yStmt;
    let html = '';
    if (a11y && (a11y.overviewEn || a11y.overviewZh)) {
      // 聲明段同走自遮罩 clip+translate（滿寬文字塊＝只挑上下短邊，同 pickNavDir 短邊邏輯）
      const descDir = Math.random() < 0.5 ? 'top' : 'bottom';
      html += `<div class="legal-map-desc" data-reveal-dir="${descDir}" style="clip-path: ${MAP_HIDE_CLIP[descDir]}">`
        + pageDescInner(a11y.overviewEn, a11y.overviewZh)   // 外框 sticky 底色仍滿寬、文字 3/4（同另兩頁說明段）
        + `</div>`;
    }
    // hidden 過濾在編號前＝序號連續不跳號（這版沒上線的頁面卡先藏，恢復拿掉 json 的 hidden 即可）
    const groups = (mapData.pages || []).filter(pg => !pg.hidden).map((pg, i) => mapGroupHtml(pg, i + 1)).join('');
    html += `<div class="legal-map-grid">${groups}</div>`;
    contentEl.innerHTML = html;
    applyUiLabels(labels, contentEl);   // 換上後台名稱（在 reveal 前＝不會揭到一半換字）
    equalizeMapNumWidth(contentEl);     // 編號欄等寬（以最寬者為主）→ 標題左緣對齊；須在貼字寬前
    layoutMapCards(contentEl);          // 貼字寬＋分頁卡佔欄；換完字才量＝量到最終文字
    document.fonts?.ready?.then(() => { equalizeMapNumWidth(contentEl); layoutMapCards(contentEl); });   // 冷載入字體晚到字寬會變 → 補量一次（函式自清 width 重量）
    // 欄寬隨視窗變 → 佔欄數重算（rAF 合批）
    let layoutRaf = 0;
    const onResize = () => { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(() => layoutMapCards(contentEl)); };
    window.addEventListener('resize', onResize);
    registerPageCleanup(() => { window.removeEventListener('resize', onResize); cancelAnimationFrame(layoutRaf); });
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
        ease: EASE.wipe,   // 同 curriculum 灰卡
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

// 無障礙聲明 singleton（2026-09-15 拆自 policy_and_statements）：回傳 {titleEn/Zh, overviewEn/Zh, points, ...}；
// 空（尚未填）→ throw（caller 不顯示聲明段）。singleton → .data 是物件非陣列。
async function fetchAccessibilityStatement() {
  const res = await fetch(`${CMS_API_BASE}/accessibility_statement`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()).data;
  if (!data || (!data.overviewEn && !data.overviewZh)) throw new Error('empty');
  return data;
}

// 隱私政策（policy_and_statements singleton；2026-09-15 無障礙拆出後只剩隱私一段）→ 包成陣列沿用群組渲染；失敗＝[]
async function fetchPolicyGroups() {
  try {
    const res = await fetch(`${CMS_API_BASE}/policy_and_statements`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).data;
    const groups = Array.isArray(data) ? data : (data ? [data] : []);
    if (!groups.length || !(groups[0].titleEn || groups[0].titleZh)) throw new Error('empty data');
    return groups;
  } catch (err) {
    console.warn('[legal] CMS fetch failed for policy_and_statements:', err.message);
    return [];
  }
}

// 純文字 → 包成段落（標題用同樣 esc 邏輯避免 < > & 破版）
// lang：中文段傳 'zh-Hant' → legal.css 的 p:not([lang]):has(+ p[lang="zh-Hant"]) 英中距規則才會 match
//（2026-09-15 user：privacy overview 英中之間沒空行＝這裡沒帶 lang）
function para(text, lang) {
  return text ? `<p${lang ? ` lang="${lang}"` : ''}>${esc(text)}</p>` : '';
}

