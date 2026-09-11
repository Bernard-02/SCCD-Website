import { registerPageCleanup } from './page-cleanup.js';

/**
 * 影片離開視窗就自動暫停：捲出畫面、或被切成 display:none（about works 換學制／換 section）都算「離開」。
 * 原生 <video> → .pause()；YouTube iframe → postMessage pauseVideo（需 src 帶 enablejsapi=1，這裡自動補）。
 * IntersectionObserver isIntersecting=false 同時涵蓋「捲出視窗」與「display:none」兩種離開，一條解決。
 * SPA 換頁 innerHTML swap 已移除元素、再加 page-cleanup disconnect 兜底避免跨頁殘留。
 */
export function pauseVideosOffscreen(els) {
  const list = Array.from(els || []).filter(Boolean);
  if (!list.length || !('IntersectionObserver' in window)) return;

  // YT iframe 靠 postMessage 暫停，src 必須帶 enablejsapi=1；沒有就補（會 reload iframe，但只在 init／未播放時，無感）
  list.forEach(el => {
    if (el.tagName === 'IFRAME' && /youtube\.com/.test(el.src) && !/[?&]enablejsapi=1\b/.test(el.src)) {
      el.src += (el.src.includes('?') ? '&' : '?') + 'enablejsapi=1';
    }
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) return;   // 只在完全離開視窗（或被 hidden）時暫停
      const el = e.target;
      if (el.tagName === 'VIDEO') el.pause();
      else el.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
    });
  }, { threshold: 0 });

  list.forEach(el => io.observe(el));
  registerPageCleanup(() => io.disconnect());
}
