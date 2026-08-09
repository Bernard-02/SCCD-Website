/**
 * Await Layout Ready
 *
 * 等元素「真的有 layout」才回 promise — 必要時等 fonts.ready + rAF 輪詢，直到 size > threshold。
 *
 * 為何：DOMContentLoaded 或 SPA inject 完成 tick 內 `getBoundingClientRect` 可能量到 0，
 * 因為（a）fonts 還沒 load 影響 height（b）flex 計算未完成（c）display:none 容器永遠回 0。
 * 沒 gate 直接量會把 layout-dependent init（scatter / typewriter / measurement-based init）
 * 算在錯的尺寸上，items 全堆原點 / 卡 opacity:0。
 *
 * 已有 caller：
 *   - js/modules/ui/footer-draggable.js waitForLayoutReady — 早期實作，可遷移
 *   - js/modules/pages/error-404.js randomizeAllPlacements — 沒 gate
 *   - js/modules/pages/hero-animation.js randomizeHeroLayout — 沒 gate
 *
 * 限制：display:none 容器永遠不會 ready（rect 永遠 0×0），retry 用完返 false。
 * Caller 拿到 false 該決定是 silent skip 還是 fallback；display:none 是 visibility-gated
 * init 場景，配 feedback_visibility_gated_init_needs_external_recovery 看 recovery hook。
 *
 * @param {HTMLElement} el - 要量的元素
 * @param {object} [opts]
 * @param {number} [opts.minWidth=100]  - rect.width 至少要 > 這個才算 ready
 * @param {number} [opts.minHeight=100] - rect.height 至少要 > 這個才算 ready
 * @param {number} [opts.maxAttempts=60] - rAF 輪詢上限（60 frames ≈ 1s @ 60fps）
 * @param {boolean} [opts.awaitFonts=true] - 是否先 await document.fonts.ready
 * @param {number} [opts.stableFrames=0] - 額外要求連續 N 幀 rect（x/y/w/h）不變（±0.5px）才算 ready。
 *   「有尺寸」≠「尺寸對」：resize 殘留佈局的過渡幀（文字暫時換行變高、容器 relayout/展開途中）
 *   有尺寸但幾何錯，量測型動畫拿到就做錯、或在容器還在移動時揭露元素（元素跟著容器飛）。
 *   ⚠️持續動畫中的元素（marquee/漂浮）永遠不穩定，會等滿 maxAttempts 才返 false——別對這類元素開
 * @returns {Promise<boolean>} true = ready，false = timeout
 */
export async function awaitLayoutReady(el, opts = {}) {
  const {
    minWidth     = 100,
    minHeight    = 100,
    maxAttempts  = 60,
    awaitFonts   = true,
    stableFrames = 0,
  } = opts;

  if (awaitFonts && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  let prev = null, stableRun = 0;
  for (let i = 0; i < maxAttempts; i++) {
    const rect = el.getBoundingClientRect();
    if (rect.width > minWidth && rect.height > minHeight) {
      if (stableFrames <= 0) return true;
      if (prev && Math.abs(rect.width - prev.w) < 0.5 && Math.abs(rect.height - prev.h) < 0.5
               && Math.abs(rect.x - prev.x) < 0.5 && Math.abs(rect.y - prev.y) < 0.5) {
        if (++stableRun >= stableFrames) return true;
      } else {
        stableRun = 0;
      }
      prev = { w: rect.width, h: rect.height, x: rect.x, y: rect.y };
    } else {
      prev = null; stableRun = 0;
    }
    await new Promise(r => requestAnimationFrame(r));
  }
  return false;
}
