/**
 * UI Labels（全站 nav / 分頁按鈕文字的單一來源）
 *
 * curriculum 組別、about section pill、about 組別切換、faculty 篩選＋系所 tab 的按鈕文字
 * 全部由 Directus `ui_labels` collection 供應（斷線退本地 data/ui-labels.json）。
 * 老師在後台改一個 row，前台 refresh 即生效；HTML 內原文字保留為最終 fallback。
 *
 * 用法：按鈕文字元素標 data-label-key（對應 row.key）+ data-label-part（en|zh|group，預設 en），
 *       頁面 init 時呼叫 applyUiLabels() 一次填入。
 *
 * 之後 about 內容整批上 Directus 時：組別按鈕已在此、about-class 那邊只留段落內容即可。
 */

import { CMS_API_BASE } from '../../config/api.js';
import { sitePath } from './site-base.js';

let cache;

function indexRows(rows) {
  const map = {};
  for (const r of rows || []) if (r && r.key) map[r.key] = r;
  return map;
}

// Directus 優先、失敗（斷網 / 5xx / 空資料）退本地 JSON（比照全站 *-source.js fallback 慣例）
// single-flight：cache 存 Promise，同頁多個消費者共用一次請求
export function loadUiLabels() {
  if (cache) return cache;
  cache = (async () => {
    try {
      const res = await fetch(`${CMS_API_BASE}/ui_labels?limit=-1`);
      if (!res.ok) throw new Error('cms');
      const { data } = await res.json();
      if (!data || !data.length) throw new Error('empty');
      return indexRows(data);
    } catch {
      const res = await fetch(sitePath('/data/ui-labels.json'));
      const { data } = await res.json();
      return indexRows(data);
    }
  })();
  return cache;
}

// 把 root 內帶 data-label-key 的元素文字換成後台值。
// textContent（非 innerHTML）→ 後台文字不可能注入 HTML。
export function applyUiLabels(map, root = document) {
  root.querySelectorAll('[data-label-key]').forEach(el => {
    const row = map[el.getAttribute('data-label-key')];
    if (!row) return;
    const val = row[el.getAttribute('data-label-part') || 'en'];
    if (val != null && val !== '') el.textContent = val;
  });
}

export function resetUiLabels() { cache = undefined; }
