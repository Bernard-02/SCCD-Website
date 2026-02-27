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
  const header = document.querySelector('header');

  if (!overlay || !container) return;

  // 1. 判斷是否第一次載入（同一個 session 只播一次）
  // TODO: 測試完成後取消這行的註解，並把下面的 return 恢復
  // if (sessionStorage.getItem('introPlayed')) {
  //   overlay.style.display = 'none';
  //   return;
  // }
  // sessionStorage.setItem('introPlayed', '1');

  // 2. 隱藏 header，鎖定 scroll（隱藏 scrollbar）
  if (header) gsap.set(header, { opacity: 0 });
  document.body.style.overflow = 'hidden';

  // 3. 播放 loader Lottie
  const anim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    path: 'data/SCCDLoader.json'
  });

  // 5. 動畫結束後執行過渡
  anim.addEventListener('complete', () => {
    const tl = gsap.timeline({
      onComplete: () => {
        overlay.style.display = 'none';
      }
    });

    // overlay fade out，同時 header 一起 fade in
    tl.to(overlay, {
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
    });

    tl.to(header, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out',
      onStart: () => { document.body.style.overflow = ''; },
    }, '<');
  });
}
