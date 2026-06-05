/**
 * Legal Data Loader
 * 讀取 legal 頁（privacy-policy / accessibility / regulations）的 JSON 並渲染。
 *
 * 資料只存「內容」不存樣式：overview（綜述）+ points[{ title, des }]，des 是富文本 HTML
 * （後台 WYSIWYG 產的乾淨 <p>/<ul>/<a>，無樣式 class）→ 老師可自由增減 bullet / 加連結粗體。
 * 編號與排版全由本檔 + legal.css 負責。尚未結構化的頁（accessibility / regulations）fallback 舊 content blob。
 */

import { CMS_API_BASE } from '../../config/api.js';

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
    if (contentEl) contentEl.innerHTML = data.points ? renderStructured(data, !NO_NUMBER_PAGES.has(pageName)) : (data.content || '');

    const updatedEn = document.getElementById('legal-updated-en');
    const updatedZh = document.getElementById('legal-updated-zh');
    if (updatedEn) updatedEn.textContent = data.lastUpdatedEn;
    if (updatedZh) updatedZh.textContent = data.lastUpdatedZh;

  } catch (error) {
    console.error(`Error loading ${pageName} data:`, error);
  }
}

// 結構化資料 → HTML（numbered=true 時編號依 index 自動產；class 都是語意標記，樣式在 legal.css）
function renderStructured(data, numbered = true) {
  let html = '';

  // overview 是純文字（後台 Textarea）→ esc 後包 <p>
  if (data.overviewEn || data.overviewZh) {
    html += `<div class="legal-intro">${para(data.overviewEn)}${para(data.overviewZh)}</div>`;
  }

  (data.points || []).forEach((pt, i) => {
    // sections：點內可再分「雙語次標題 + 各自 EN/ZH 富文本」子區塊（如 support Funds 的 Single 單次 / Regular 定期）。
    // 次標題是結構化欄位（titleEn/Zh，前台組雙語），內文 desEn/desZh 仍是 WYSIWYG 富文本 → 老師可分別增減。
    // 點若無 sections 就只渲染點層級 desEn/desZh（privacy-policy / Others 等完全不受影響）。
    const sectionsHtml = (pt.sections || []).map(s =>
      `<div class="legal-subsection">`
      + `<h5 class="legal-subsection-title-en">${esc(s.titleEn)}</h5>`
      + `<h5 class="legal-subsection-title-zh">${esc(s.titleZh)}</h5>`
      + (s.desEn || '')   // 富文本，直接注入不 esc
      + (s.desZh || '')
      + `</div>`
    ).join('');

    // 不編號時省略 num 欄並加 modifier，legal.css 改單欄（body 撐滿）
    html += `<div class="legal-section${numbered ? '' : ' legal-section--no-num'}">`
      + (numbered ? `<div class="legal-section-num">${i + 1}.</div>` : '')
      + `<div class="legal-section-body">`
      + `<h4 class="legal-section-title-en">${esc(pt.titleEn)}</h4>`
      + `<h4 class="legal-section-title-zh">${esc(pt.titleZh)}</h4>`
      + (pt.desEn || '')   // des 是富文本 HTML（WYSIWYG 產）→ 直接注入，不 esc
      + (pt.desZh || '')
      + sectionsHtml
      + `</div></div>`;
  });

  return html;
}

// 純文字 → 包成段落（標題用同樣 esc 邏輯避免 < > & 破版）
function para(text) {
  return text ? `<p>${esc(text)}</p>` : '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
