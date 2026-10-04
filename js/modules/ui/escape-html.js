/**
 * 後台文字塞進 innerHTML 模板（文字節點與屬性值皆可）前的跳脫。null/undefined → ''（不渲染成 "null"）。
 */
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {unknown} s */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => HTML_ESC[c]);
}
