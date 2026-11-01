/**
 * 觸控裝置（iPad 橫向桌面排版）的內捲框捲軸：iOS 不畫 ::-webkit-scrollbar、原生 overlay 捲軸只在捲動時閃現 →
 * user 2026-10-31「iPad 上沒看到 scrollbar」。每個 .list-scroll 框（about Vision／Programs／Works 文字盒、resources、history、
 * DSD events／說明盒…＝桌面有細黑原生捲軸的那些）框內放一支自繪 thumb，樣式同桌面原生（scrollbar.css .touch-thumb）。
 * 做法：0 高 sticky holder 釘在框可視區頂、thumb 依 scrollTop 比例 translateY＝只聽框自己的 scroll，不掛 window 監聽
 * （about 一頁六個框、window scroll 逐框量 rect 會每幀 forced layout）。原生 scrollbar 畫在 padding 外側＝thumb right 退 padding-right。
 * 只在 pointer: coarse＋桌面排版啟用（main-modular.js；手機排版不畫，user 2026-11-01）；faculty／curriculum 色卡已有 desk-card.js 自製 thumb、不重複。
 */
const SKIP = '#faculty-panel, #courses-detail-panel';
/** @type {WeakMap<Element, {holder: HTMLElement, place: () => void}>} */
const bound = new WeakMap();

export function attachTouchBoxThumb(scroller) {
  if (scroller.closest(SKIP)) return;
  const prev = bound.get(scroller);
  if (prev) {
    // loader 之後 innerHTML 重寫（about 文字盒等 Directus 回來才填字）把 holder 洗掉 → 同一支放回去，不重綁監聽
    if (!prev.holder.isConnected) { scroller.prepend(prev.holder); prev.place(); }
    return;
  }
  const holder = document.createElement('div');
  holder.className = 'touch-thumb-holder';
  const thumb = document.createElement('div');
  thumb.className = 'touch-thumb';
  holder.appendChild(thumb);
  scroller.prepend(holder);
  const place = () => {
    const sh = scroller.scrollHeight, ch = scroller.clientHeight;
    if (sh <= ch + 1) { thumb.style.display = 'none'; return; }
    const h = Math.max(24, ch * ch / sh);
    thumb.style.display = '';
    thumb.style.right = `-${parseFloat(getComputedStyle(scroller).paddingRight) || 0}px`;
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${(scroller.scrollTop / (sh - ch) * (ch - h)).toFixed(1)}px)`;
  };
  bound.set(scroller, { holder, place });
  scroller.addEventListener('scroll', place, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(place);   // 框高變（視窗）／內容高變（文字晚到）都重量
    ro.observe(scroller);
    [...scroller.children].forEach(c => { if (c !== holder) ro.observe(c); });
  }
  place();
}

// 掃現有 + 之後動態建的（resources／history／DSD 的框都是 loader 之後才建）；框自己的 children 被換掉也要補 holder。
// MO 跨 SPA 換頁常駐，holder 隨頁面 DOM 一起被換掉
export function initTouchBoxThumbs() {
  const scan = (root) => {
    if (!(root instanceof Element)) return;
    if (root.matches('.list-scroll')) attachTouchBoxThumb(root);
    root.querySelectorAll('.list-scroll').forEach(attachTouchBoxThumb);
  };
  scan(document.body);
  new MutationObserver((muts) => muts.forEach(m => {
    m.addedNodes.forEach(scan);
    if (m.target instanceof Element && m.target.matches('.list-scroll')) attachTouchBoxThumb(m.target);
  })).observe(document.body, { childList: true, subtree: true });
}
