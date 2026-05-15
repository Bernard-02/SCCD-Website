/**
 * Parent Activity Ping
 *
 * generate-app iframe 內的使用者操作（mousemove / touch / key）父層 window 收不到，
 * 會讓 idle-standby 誤判閒置。這裡偵測 iframe 內的 activity 並用 postMessage 通知父層
 * reset idle timer。
 *
 * 訊息格式：{ idleActivity: true }
 * Throttle 1s 一則，避免 mousemove 高頻 flood
 */
(function () {
  // 不在 iframe 裡（直接打開 generate-app/index.html）就不啟動
  if (window.parent === window) return;

  const THROTTLE_MS = 1000;
  let lastPing = 0;

  function ping() {
    const now = Date.now();
    if (now - lastPing < THROTTLE_MS) return;
    lastPing = now;
    window.parent.postMessage({ idleActivity: true }, '*');
  }

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  events.forEach(evt => {
    window.addEventListener(evt, ping, { passive: true });
  });
})();
