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

  // 減少動態：跳過 Lottie loader + fade 過場，直接顯示內容與 header（header 進場時 opacity:0，要補回 1）。
  if (prefersReducedMotion()) {
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

  // 等待 header 載入完成後再執行過渡（header 是非同步 fetch 注入的）
  function runTransition() {
    const header = document.querySelector('header');

    anim.addEventListener('complete', () => {
      introDone();
      // overlay fade out，header 同步 fade in
      const tl = gsap.timeline({
        onComplete: () => { overlay.style.display = 'none'; }
      });

      tl.to(overlay, { opacity: 0, duration: DUR.medium, ease: EASE.enterSoft });

      // header＝logo／兩顆鈕 clip-reveal 滑入（header.js playHeaderEntrance，user 2026-10-26），跟 overlay 淡出同時起跑
      tl.call(() => { document.body.style.overflow = ''; playHeaderEntrance(); }, null, '<');
    });
  }

  // 若 header 已在 DOM，直接執行；否則等待 header:ready 事件
  if (document.querySelector('header')) {
    runTransition();
  } else {
    document.addEventListener('header:ready', runTransition, { once: true });
  }
  return done;
}
