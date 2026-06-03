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
// ⚠️ 暫時切回讀本地：Directus 跨源需 CORS，但 server 修改權限待釐清（模式 1 即時 fetch vs 模式 2 匯出靜態）。
// 確定走即時 fetch + CORS 開好後，再把下行取消註解。
const CMS_COLLECTIONS = {
  // 'privacy-policy': 'privacy_policy',
};

export async function loadLegalData(pageName) {
  try {
    const collection = CMS_COLLECTIONS[pageName];
    let data;
    if (collection) {
      const response = await fetch(`${CMS_API_BASE}/${collection}`);
      data = (await response.json()).data;   // singleton 回傳單一物件（非陣列），直接取 .data
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
    if (contentEl) contentEl.innerHTML = data.points ? renderStructured(data) : (data.content || '');

    const updatedEn = document.getElementById('legal-updated-en');
    const updatedZh = document.getElementById('legal-updated-zh');
    if (updatedEn) updatedEn.textContent = data.lastUpdatedEn;
    if (updatedZh) updatedZh.textContent = data.lastUpdatedZh;

  } catch (error) {
    console.error(`Error loading ${pageName} data:`, error);
  }
}

// 結構化資料 → HTML（編號依 index 自動產，老師不用維護；class 都是語意標記，樣式在 legal.css）
function renderStructured(data) {
  let html = '';

  // overview 是純文字（後台 Textarea）→ esc 後包 <p>
  if (data.overviewEn || data.overviewZh) {
    html += `<div class="legal-intro">${para(data.overviewEn)}${para(data.overviewZh)}</div>`;
  }

  (data.points || []).forEach((pt, i) => {
    html += `<div class="legal-section">`
      + `<div class="legal-section-num">${i + 1}.</div>`
      + `<div class="legal-section-body">`
      + `<h4 class="legal-section-title-en">${esc(pt.titleEn)}</h4>`
      + `<h4 class="legal-section-title-zh">${esc(pt.titleZh)}</h4>`
      + (pt.desEn || '')   // des 是富文本 HTML（WYSIWYG 產）→ 直接注入，不 esc
      + (pt.desZh || '')
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
