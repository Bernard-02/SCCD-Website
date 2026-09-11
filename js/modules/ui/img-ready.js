/**
 * 等 <img> 可繪製（decode 完）才 resolve；慢網/壞圖 timeout 保險放行，避免 reveal 動畫/promise 卡住。
 * 用途：進場/切換前 gate 圖片 reveal → 滑入的是「已載好的圖」，不是空框先滑入、內容才閃出。
 * 全站圖片 clip-reveal 共用（about class 區輪播 / about history timeline / …）。
 */
export function whenImgReady(imgEl, timeoutMs = 3000) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (!imgEl) { finish(); return; }
    const decode = () => (imgEl.decode ? imgEl.decode().then(finish, finish) : finish());
    if (imgEl.complete && imgEl.naturalWidth) decode();
    else { imgEl.addEventListener('load', decode, { once: true }); imgEl.addEventListener('error', finish, { once: true }); }
    setTimeout(finish, timeoutMs);
  });
}
