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
 * @returns {Promise<boolean>} true = ready，false = timeout
 */
export async function awaitLayoutReady(el, opts = {}) {
  const {
    minWidth    = 100,
    minHeight   = 100,
    maxAttempts = 60,
    awaitFonts  = true,
  } = opts;

  if (awaitFonts && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  for (let i = 0; i < maxAttempts; i++) {
    const rect = el.getBoundingClientRect();
    if (rect.width > minWidth && rect.height > minHeight) return true;
    await new Promise(r => requestAnimationFrame(r));
  }
  return false;
}
