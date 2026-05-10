/**
 * List Scroll Trigger Animation Module
 * 所有 list year-group 的進場動畫邏輯，供各 loader 共用
 * 採用 hero title clip-reveal pattern：per-row yPercent 100→0（無 fade）
 */

import { setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';

// 每個 group 對應的 ScrollTrigger instance，供 search/filter 重建動畫用
const groupScrollTriggers = new Map();
export function getGroupScrollTriggers() { return groupScrollTriggers; }

// 取得 group 內所有 .list-reveal-row（被 filter 隱藏的 list-item 子代排除）+ 緊接的 separator
function getGroupRows(group) {
  return [...group.querySelectorAll('.list-reveal-row')].filter(el => {
    const item = el.closest('.list-item');
    return !item || item.style.display !== 'none';
  });
}

// 初始載入：每個 group 滾到 viewport 才觸發（ScrollTrigger once）
export function buildInitialScrollTrigger(container) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  const groups = [...container.querySelectorAll('.list-year-group')];
  if (!groups.length) return;

  groups.forEach(group => {
    const rows = getGroupRows(group);
    if (!rows.length) return;
    setupClipReveal(rows);
    ScrollTrigger.create({
      trigger: group,
      start: 'top 90%',
      once: true,
      onEnter: () => playClipReveal(rows),
    });
  });
}

// 為單一 group 建立 ScrollTrigger（search/filter 重建後使用）
export function buildGroupScrollTrigger(group) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const rows = getGroupRows(group);
  if (!rows.length) return null;
  setupClipReveal(rows);
  return ScrollTrigger.create({
    trigger: group,
    start: 'top 90%',
    once: true,
    onEnter: () => playClipReveal(rows),
  });
}

// 直接依序播放所有 groups 動畫（search/filter 切換後立即播，不等 scroll）
export function playGroupsInSequence(groups) {
  if (typeof gsap === 'undefined') return;
  const sets = groups.map(g => getGroupRows(g)).filter(rows => rows.length > 0);
  sets.forEach(rows => setupClipReveal(rows));
  let delay = 0;
  sets.forEach(rows => {
    gsap.delayedCall(delay, () => playClipReveal(rows));
    delay += 0.3;
  });
}
