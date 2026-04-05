/**
 * List Scroll Trigger Animation Module
 * 所有 list year-group 的進場動畫邏輯，供各 loader 共用
 */

// 每個 group 對應的 ScrollTrigger instance，供 search/filter 重建動畫用
const groupScrollTriggers = new Map();
export function getGroupScrollTriggers() { return groupScrollTriggers; }

// 取得 group 內要動畫的元素（year header + visible items + 緊接的 separator）
function getGroupItems(group) {
  // .list-year-toggle（可收合）或第一個直接子 div（summer camp 靜態年份）
  const yearHeader = group.querySelector('.list-year-toggle') ?? group.querySelector(':scope > div:first-child');
  const items = [...group.querySelectorAll('.list-item')].filter(el => el.style.display !== 'none');
  const divider = group.nextElementSibling?.classList.contains('activities-separator')
    ? group.nextElementSibling : null;
  return [...(yearHeader ? [yearHeader] : []), ...items, ...(divider ? [divider] : [])];
}

// 初始載入：每個 group 滾到 viewport 才觸發（ScrollTrigger once）
export function buildInitialScrollTrigger(container) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  const groups = [...container.querySelectorAll('.list-year-group')];
  if (!groups.length) return;

  groups.forEach(group => {
    const items = getGroupItems(group);
    if (!items.length) return;
    gsap.set(items, { y: 100, opacity: 0 });
    ScrollTrigger.create({
      trigger: group,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(items, {
          y: 0, opacity: 1,
          duration: 0.6,
          stagger: { each: 0.1, grid: 'auto', axis: 'y' },
          ease: 'power2.out',
          overwrite: true,
          clearProps: 'transform,opacity',
        });
      },
    });
  });
}

// 為單一 group 建立 ScrollTrigger（search/filter 重建後使用）
export function buildGroupScrollTrigger(group) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return null;
  const allItems = getGroupItems(group);
  if (!allItems.length) return null;

  gsap.set(allItems, { y: 100, opacity: 0 });
  return ScrollTrigger.create({
    trigger: group,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.to(allItems, {
        y: 0, opacity: 1,
        duration: 0.6,
        stagger: { each: 0.1, grid: 'auto', axis: 'y' },
        ease: 'power2.out',
        overwrite: true,
        clearProps: 'transform,opacity',
      });
    },
  });
}

// 直接依序播放所有 groups 動畫（search/filter 切換後立即播，不等 scroll）
export function playGroupsInSequence(groups) {
  if (typeof gsap === 'undefined') return;
  const sets = groups.map(g => getGroupItems(g)).filter(items => items.length > 0);
  sets.forEach(items => gsap.set(items, { y: 100, opacity: 0 }));
  let delay = 0;
  sets.forEach(items => {
    gsap.to(items, {
      y: 0, opacity: 1,
      duration: 0.6,
      delay,
      stagger: { each: 0.1, grid: 'auto', axis: 'y' },
      ease: 'power2.out',
      overwrite: true,
      clearProps: 'transform,opacity',
    });
    delay += items.length * 0.1 + 0.1;
  });
}
