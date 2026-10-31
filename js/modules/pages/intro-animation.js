import { DUR, EASE } from '../ui/motion.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { playHeaderEntrance } from '../../header.js';
/**
 * Intro Animation Module
 * 網站進場動畫 - 使用 Lottie 播放 AE 動畫
 * 流程：
 * 1. sessionStorage 判斷是否第一次載入
 * 2. 播放 Lottie loader，header 隱藏
 * 3. 動畫結束 → overlay fade out → logo fade in → 0.5s 後 header fade in
 * 回傳 Promise：loader 播完（overlay 開始淡出）＝首頁 news／WATCH／floating 進場起點（見 main-modular）
 */

export function initIntroAnimation() {
  const overlay = document.getElementById('intro-overlay');
  const container = document.getElementById('intro-lottie');

  if (!overlay || !container) return Promise.resolve();

  // 減少動態（或 lottie CDN 沒載到）：跳過 Lottie loader + fade 過場，直接顯示內容與 header（header 進場時 opacity:0，要補回 1）。
  if (prefersReducedMotion() || typeof lottie === 'undefined') {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    const showHeader = () => playHeaderEntrance();   // reduced-motion＝header.js 沒預藏 → 只開 opacity／互動
    if (document.querySelector('header')) showHeader();
    else document.addEventListener('header:ready', showHeader, { once: true });
    return Promise.resolve();
  }

  let introDone;
  const done = new Promise(r => { introDone = r; });

  // 鎖定 scroll（隱藏 scrollbar）
  document.body.style.overflow = 'hidden';

  // 播放 loader Lottie
  const anim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    path: 'data/SCCDLoader.json'
  });

  // header＝logo／兩顆鈕 clip-reveal 滑入（header.js playHeaderEntrance，user 2026-10-26），跟 overlay 淡出同時起跑；
  // header 是非同步 fetch 注入的：還沒到就等 header:ready 再播，不擋白幕淡出。
  // ⚠️ 白幕淡出不能等 header：Lottie 的 complete 只發一次，監聽晚於 header:ready 掛上＝header 比 loader（3.7s）慢到
  //    或載入失敗時事件已過、白幕永遠停在最後一格（user 2026-10-31「intro 跑完卡在畫面上」）
  const enterHeader = () => {
    const header = document.querySelector('header');
    if (!header) { document.addEventListener('header:ready', enterHeader, { once: true }); return; }
    // 淡出期間 header 暫提到 overlay(10000) 之上：不然滑入隔著半透明白幕＝看起來是淡入（user 2026-10-27「去掉 fade」）；
    // navigation.css header 是 9999 !important → inline 也要 important。白幕已收就不用提
    if (overlay.style.display !== 'none') header.style.setProperty('z-index', '10001', 'important');
    playHeaderEntrance();
  };
  const finish = () => {
    introDone();
    const tl = gsap.timeline({
      onComplete: () => { overlay.style.display = 'none'; document.querySelector('header')?.style.removeProperty('z-index'); }
    });
    tl.to(overlay, { opacity: 0, duration: DUR.medium, ease: EASE.enterSoft });
    tl.call(() => { document.body.style.overflow = ''; enterHeader(); }, null, '<');
  };
  anim.addEventListener('complete', finish);
  anim.addEventListener('data_failed', finish);   // loader JSON 載不到＝直接收白幕，不卡站
  return done;
}
