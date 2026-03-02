/**
 * Intro Animation Module
 * 網站進場動畫 - 使用 Lottie 播放 AE 動畫
 * 流程：
 * 1. sessionStorage 判斷是否第一次載入
 * 2. 播放 Lottie loader，header 隱藏
 * 3. 動畫結束 → overlay fade out → logo fade in → 0.5s 後 header fade in
 */

export function initIntroAnimation() {
  const overlay = document.getElementById('intro-overlay');
  const container = document.getElementById('intro-lottie');

  if (!overlay || !container) return;

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
      // overlay fade out，header 同步 fade in
      const tl = gsap.timeline({
        onComplete: () => { overlay.style.display = 'none'; }
      });

      tl.to(overlay, { opacity: 0, duration: 0.5, ease: 'power2.out' });

      if (header) {
        tl.to(header, {
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          onStart: () => { document.body.style.overflow = ''; },
        }, '<');
      } else {
        tl.call(() => { document.body.style.overflow = ''; }, null, '<');
      }
    });
  }

  // 若 header 已在 DOM，直接執行；否則等待 header:ready 事件
  if (document.querySelector('header')) {
    runTransition();
  } else {
    document.addEventListener('header:ready', runTransition, { once: true });
  }
}
