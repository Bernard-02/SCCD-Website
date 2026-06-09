import { DUR, EASE } from './motion.js';
/**
 * Video Player
 * Netflix 風格全螢幕播放器
 */

// Cache 防多次 init 累積 listener（同一個 overlay 元素上重綁多次 listener
// → 每次 click 觸發 N 次 togglePlay 偶數次就 net no-op → 「點 pause 不會 pause」成因之一）。
// 但 SPA 換頁時 main.innerHTML swap 會把 overlay 元素整個換成新的（同 id 不同 reference）→
// 舊 cached instance 指 detached 元素，openPlayer 對它 .style 無視覺效果。改用 _overlay
// reference 比對，元素更新時自動 re-init。
let _videoPlayerInstance = null;

// ── HLS (.m3u8) 支援 ──────────────────────────────────────────
// 首頁 watch 影片改用 CloudFront HLS 串流（.m3u8）。原生 <video> 只有 Safari 能直接吃 HLS，
// Chrome/Firefox/Edge 要靠 hls.js（CDN lazy load，只在遇到 .m3u8 且瀏覽器不原生支援時才載）。
// 非 HLS（mp4 等）維持原生 src 行為不變。
function isHlsUrl(url) { return /\.m3u8(\?|#|$)/i.test(url || ''); }

let _hlsLoading = null;
function ensureHls() {
  if (typeof window.Hls !== 'undefined') return Promise.resolve(window.Hls);
  if (_hlsLoading) return _hlsLoading;
  _hlsLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    s.onload = () => resolve(window.Hls);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _hlsLoading;
}

// 把來源掛到 video：HLS 在非 Safari 走 hls.js，其餘（Safari HLS / mp4）走原生 src。
// 用 video._srcUrl 記號避免重複掛（hls.js attach 後 video.src 變 blob:，不能拿 video.src 比對）。
async function attachVideoSource(video, url) {
  if (!url || video._srcUrl === url) return;
  detachVideoSource(video);
  video._srcUrl = url;
  if (isHlsUrl(url) && !video.canPlayType('application/vnd.apple.mpegurl')) {
    const Hls = await ensureHls();
    // 載入期間若已被換掉/清掉就放棄
    if (video._srcUrl !== url) return;
    if (Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      video._hls = hls;
      return;
    }
  }
  video.src = url;          // Safari HLS / mp4 / hls.js 不可用的退路
  video.preload = 'auto';
  video.load();
}

function detachVideoSource(video) {
  if (video._hls) { try { video._hls.destroy(); } catch (_) {} video._hls = null; }
  video.removeAttribute('src');
  video._srcUrl = null;
  try { video.load(); } catch (_) {}
}

/**
 * @param {string} videoUrl
 * @param {{ getCardRect?: () => DOMRect, onCloseAnimComplete?: () => void, freezeCard?: (frozen: boolean) => void, getCardBg?: () => string }} [opts]
 */
export function initVideoPlayer(videoUrl, { getCardRect, onCloseAnimComplete, freezeCard, getCardBg } = {}) {
  const overlay       = document.getElementById('video-player-overlay');
  if (_videoPlayerInstance && _videoPlayerInstance._overlay === overlay) return _videoPlayerInstance;
  const video         = /** @type {HTMLVideoElement | null} */ (document.getElementById('video-player'));
  const playBtn       = document.getElementById('video-play-btn');
  const muteBtn        = document.getElementById('video-mute-btn');
  const volumeWrap     = document.getElementById('video-volume-wrap');
  const volumeTrack    = document.getElementById('video-volume-track');
  const volumeFill     = document.getElementById('video-volume-fill');
  const volumeThumb    = document.getElementById('video-volume-thumb');
  const timeEl        = document.getElementById('video-time');
  const progressTrack = document.getElementById('video-progress-track');
  const progressFill  = document.getElementById('video-progress-fill');
  const progressThumb = document.getElementById('video-progress-thumb');
  const controls      = document.getElementById('video-controls');
  const closeBtn      = document.getElementById('video-close-btn');
  const fullscreenBtn = document.getElementById('video-fullscreen-btn');
  const seekBackBtn   = document.getElementById('video-seek-back');
  const seekFwdBtn    = document.getElementById('video-seek-fwd');
  const mobileCloseBtn = document.getElementById('video-mobile-close-btn');

  if (!overlay || !video) return;

  const isMobile = () => window.innerWidth < 768;

  const uiBlocks = [
    document.getElementById('video-block-close'),
    document.getElementById('video-block-center'),
    document.getElementById('video-block-fullscreen'),
  ].filter(Boolean);

  let iconColor = '#000';

  function applyIconColor(color) {
    iconColor = color;
    // 進度條/音量條 user 指定：track + fill + thumb 全部同色（單一連續黑線），
    // 位置由 thumb 上下伸出 5px 視覺呈現（thumb 14px 高，track 4px）
    if (progressFill)  progressFill.style.background  = color;
    if (progressThumb) progressThumb.style.background = color;
    if (progressTrack) progressTrack.style.background = color;
    if (volumeFill)    volumeFill.style.background    = color;
    if (volumeThumb)   volumeThumb.style.background   = color;
    if (volumeTrack)   volumeTrack.style.background   = color;
    [playBtn, muteBtn, seekBackBtn, seekFwdBtn, fullscreenBtn, closeBtn].forEach(btn => {
      if (btn) btn.style.color = color;
    });
    if (timeEl) timeEl.style.color = color;
  }

  applyIconColor('#000');

  // ── 預載入影片（不顯示 overlay、不播放）──────────────
  // 在 cover 動畫啟動時呼叫，讓 video 在 cover 期間 buffer 資料；
  // openPlayer 時 .play() 直接吃 buffered 資料，黑色過渡縮到 <100ms
  function preloadVideo() {
    // HLS 走 hls.js、其餘原生；attachVideoSource 內有 _srcUrl 記號，重複呼叫不會重掛
    attachVideoSource(video, videoUrl);
  }

  // ── 開啟播放器 ──────────────────────────────────────────
  function openPlayer({ accentColor = '#00FF80' } = {}) {
    // 全部三原色（綠/粉/藍）底色一律配黑色 icon
    const uiIconColor = '#000';
    attachVideoSource(video, videoUrl); // 萬一沒 preload 也 fallback（_srcUrl 記號避免重掛）
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // html { scrollbar-gutter: stable } 保留 10px gutter；overlay fixed inset:0 蓋不到，
    // 預設 track 白色會在 overlay 右側露出。把 html bg 染黑讓 gutter 條隱形
    document.documentElement.style.backgroundColor = '#000';

    // 手機：用瀏覽器原生 video UI、video 撐滿視窗寬、custom controls 隱藏、左上顯示返回鍵
    // 桌面：保留現有 custom controls 流程（accent 色塊 + 自定按鈕）
    if (isMobile()) {
      video.controls = true;
      video.style.width = '100vw';
      video.style.maxHeight = '100%';
      controls.style.display = 'none';
      if (mobileCloseBtn) {
        mobileCloseBtn.style.background = accentColor;
        // 同 footer / WATCH 卡片：getRandomRotation 範圍 -4~6 排除 0
        const rot = window.SCCDHelpers?.getRandomRotation?.() ?? 0;
        mobileCloseBtn.style.transform = `rotate(${rot}deg)`;
        mobileCloseBtn.style.display = 'flex';
      }
    } else {
      video.controls = false;
      video.style.width = '95%';
      video.style.maxHeight = '90%';
      // 不能寫 '' 清 inline style — HTML 原本就是 inline `display: flex`，
      // 清空會 fallback 成 block 讓三個 block 垂直堆疊
      controls.style.display = 'flex';
      if (mobileCloseBtn) mobileCloseBtn.style.display = 'none';
      // 三個矩形區塊各自設背景色
      uiBlocks.forEach(block => { if (block) block.style.background = accentColor; });
      applyIconColor(uiIconColor);
      updatePlayIcon();
      updateVolumeUI();
      hideControls();
    }
    video.play();
  }

  // ── 關閉播放器 ──────────────────────────────────────────
  function closePlayer() {
    video.pause();
    clearTimeout(hideTimer);
    if (document.fullscreenElement) document.exitFullscreen?.();
    // 手機原生 controls / 返回鍵還原
    video.controls = false;
    if (mobileCloseBtn) mobileCloseBtn.style.display = 'none';

    // 凍住卡片：收合期間卡片若繼續 float，黑圈會收到「收合開始那刻的舊位置」、卡片卻漂走 → 收完瞬移/重影
    // （user 2026-06-08）。凍在當前位置 → getCardRect 擷取的就是黑圈收合終點＝卡片實際位置，對齊不跳。
    freezeCard?.(true);
    const rect = getCardRect?.();
    if (!rect || typeof gsap === 'undefined') {
      detachVideoSource(video);
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      document.documentElement.style.backgroundColor = '';
      freezeCard?.(false);
      return;
    }

    gsap.set(controls, { opacity: 0 });
    controls.style.pointerEvents = 'none';
    isVisible = false;

    const vW = window.innerWidth, vH = window.innerHeight;
    const cardCx = rect.left + rect.width / 2;
    const cardCy = rect.top + rect.height / 2;
    const maxDist = Math.max(...[[0,0],[vW,0],[0,vH],[vW,vH]].map(([cx,cy]) => Math.hypot(cx - cardCx, cy - cardCy)));
    const fromScale = (maxDist / (rect.width / 2)) * 2.2;

    // 收合 clone 起始黑（影片底色），縮回時 fade 成卡片當前底色（inverse=白 / standard=黑 / mode3=theme-fg）
    // → user 要「回去時是卡片色」（mode2 白）。之前白收合會重影是因卡片收合期間仍 float、黑圈收到舊位置，
    // 已用上方 freezeCard 凍住卡片對齊解掉，故可安全 fade 回卡片色。
    const cardBg = getCardBg?.() || '#000';
    const clone = document.createElement('div');
    clone.style.cssText = `position:fixed; left:${cardCx}px; top:${cardCy}px; width:${rect.width}px; height:${rect.height}px; margin-left:${-rect.width/2}px; margin-top:${-rect.height/2}px; background:#000; border-radius:50%; z-index:10001; transform:scale(${fromScale}); transform-origin:center center;`;
    document.body.appendChild(clone);

    overlay.style.display = 'none';
    document.body.style.overflow = '';

    gsap.to(clone, {
      scale: 1, backgroundColor: cardBg, duration: DUR.medium, ease: EASE.enter,
      onComplete: () => {
        clone.remove();
        detachVideoSource(video);
        // 黑色 clone 完全縮回後才恢復 html bg，避免 gutter 條閃白
        document.documentElement.style.backgroundColor = '';
        freezeCard?.(false); // 收合完還原 float
        onCloseAnimComplete?.();
      }
    });
  }

  // ── 控制列自動隱藏 ──────────────────────────────────────
  function randRot(exclude = [], min = -4, max = 6) {
    let r;
    do { r = Math.round(Math.random() * (max - min) + min); }
    while (exclude.some(e => Math.abs(e - r) < 2));
    return r;
  }

  // clipPath reveal：從四個方向之一展開
  // inset(top right bottom left)，全遮 = inset(0 100% 0 0) 之類
  const CLIP_DIRS = {
    top:    { from: 'inset(0% 0% 100% 0%)', to: 'inset(0% 0% 0% 0%)' },
    bottom: { from: 'inset(100% 0% 0% 0%)', to: 'inset(0% 0% 0% 0%)' },
    left:   { from: 'inset(0% 100% 0% 0%)', to: 'inset(0% 0% 0% 0%)' },
    right:  { from: 'inset(0% 0% 0% 100%)', to: 'inset(0% 0% 0% 0%)' },
  };
  const ALL_DIRS   = ['top', 'bottom', 'left', 'right'];
  const VERT_DIRS  = ['top', 'bottom']; // 中間 bar 限制上下

  function randDir(dirs) { return dirs[Math.floor(Math.random() * dirs.length)]; }

  let isVisible = false;
  let hideTimer;

  function showControls() {
    clearTimeout(hideTimer);
    controls.style.pointerEvents = 'auto';
    gsap.set(controls, { opacity: 1 });

    if (!isVisible) {
      isVisible = true;
      const usedRots = [];
      uiBlocks.forEach((block, i) => {
        const dirs = i === 1 ? VERT_DIRS : ALL_DIRS;
        const dir  = randDir(dirs);
        const clip = CLIP_DIRS[dir];
        const rot  = i === 1 ? randRot(usedRots, -2, 2) : randRot(usedRots);
        usedRots.push(rot);
        // 記錄進場方向/旋轉 → hideControls 沿同方向反向收回（出場 = 進場反向動畫）
        block._enterDir = dir;
        block._enterRot = rot;
        gsap.fromTo(block,
          { clipPath: clip.from, rotation: rot },
          { clipPath: clip.to,   rotation: rot, duration: DUR.base, ease: EASE.enter, overwrite: true }
        );
      });
    }
    hideTimer = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    // 無操作隱藏：做進場 clip-reveal 的反向動畫（每個 block 沿進場方向收回），取代原本的 opacity fade。
    // 只在「目前是顯示中」才播收回動畫；初始 / reopen 時 isVisible 為 false → 不播（容器 opacity 已是 0）。
    if (isVisible) {
      uiBlocks.forEach(block => {
        const dir = block._enterDir;
        if (!dir) return;
        gsap.to(block, {
          clipPath: CLIP_DIRS[dir].from,
          rotation: block._enterRot ?? 0,
          duration: DUR.base, ease: EASE.exit, overwrite: true,
        });
      });
    }
    controls.style.pointerEvents = 'none';
    isVisible = false;
  }

  // 初始化
  gsap.set(controls, { opacity: 0 });
  gsap.set(uiBlocks, { clipPath: 'inset(0% 0% 0% 0%)', rotation: 0 });

  // 按鈕永遠可點擊（即使 controls 容器 pointer-events: none）
  [playBtn, muteBtn, seekBackBtn, seekFwdBtn, fullscreenBtn, closeBtn].forEach(btn => {
    if (btn) btn.style.pointerEvents = 'auto';
  });
  if (progressTrack) progressTrack.style.pointerEvents = 'auto';
  if (volumeTrack) volumeTrack.style.pointerEvents = 'auto';

  overlay.addEventListener('mousemove', showControls);
  overlay.addEventListener('touchstart', showControls);
  // click 時也觸發 showControls（避免靜止不動時 controls 消失後點不到）
  overlay.addEventListener('click', showControls);

  // ── 點擊影片本身 播放/暫停 ────────────────────────────
  video.addEventListener('click', togglePlay);

  // ── 播放/暫停 ──────────────────────────────────────────
  function togglePlay() {
    if (video.paused) { video.play(); } else { video.pause(); }
    updatePlayIcon();
    showControls();
  }

  function updatePlayIcon() {
    const icon = playBtn?.firstElementChild;
    if (!icon) return;
    // size 由 HTML 上 .icon-l class 控制（兩態同 tier，避免 toggle 時 container 高度跳動）
    icon.className = video.paused ? 'icon icon-play icon-l' : 'icon icon-pause icon-l';
  }

  playBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  video.addEventListener('play',  updatePlayIcon);
  video.addEventListener('pause', updatePlayIcon);

  // ── 往前/往後 10s ──────────────────────────────────────
  seekBackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    video.currentTime = Math.max(0, video.currentTime - 10);
    showControls();
  });
  seekFwdBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
    showControls();
  });

  // ── 進度條（YT-style drag：drag 期間只更新視覺，mouseup 才 seek video）─────
  let dragging = false;
  let dragPct = 0;
  let rafPending = false;
  video.addEventListener('timeupdate', () => {
    if (dragging) return; // drag 期間 timeupdate 不能跟 visual update 搶 progressFill width
    if (rafPending || !video.duration) return;
    rafPending = true;
    requestAnimationFrame(() => {
      const pct = (video.currentTime / video.duration) * 100;
      progressFill.style.width = `${pct}%`;
      const remaining = video.duration - video.currentTime;
      timeEl.textContent = formatTime(remaining);
      rafPending = false;
    });
  });

  function computePct(e, track) {
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  // drag 期間直接寫 progressFill width（不 seek video）→ 視覺即時、無 seek lag
  function visualUpdateProgress(pct) {
    progressFill.style.width = `${pct * 100}%`;
    if (video.duration && timeEl) {
      const remaining = (1 - pct) * video.duration;
      timeEl.textContent = formatTime(remaining);
    }
  }

  progressTrack.addEventListener('mousedown', (e) => {
    dragging = true;
    dragPct = computePct(e, progressTrack);
    visualUpdateProgress(dragPct);
    showControls();
  });

  // ── 音量 slider（hover expand + drag；thumb 預設 opacity:0，hover 才浮現）─────
  let volumeExpanded = false;
  volumeWrap?.addEventListener('mouseenter', () => {
    if (volumeTrack) volumeTrack.style.width = '80px';
    if (volumeThumb) volumeThumb.style.opacity = '1';
    volumeExpanded = true;
  });
  volumeWrap?.addEventListener('mouseleave', () => {
    if (volumeTrack && !volDragging) volumeTrack.style.width = '0';
    if (volumeThumb && !volDragging) volumeThumb.style.opacity = '0';
    volumeExpanded = false;
  });

  let volDragging = false;
  let volDragPct = 1;
  function visualUpdateVolume(pct) {
    if (volumeFill) volumeFill.style.width = `${pct * 100}%`;
  }

  volumeTrack?.addEventListener('mousedown', (e) => {
    volDragging = true;
    volDragPct = computePct(e, volumeTrack);
    visualUpdateVolume(volDragPct);
    showControls();
  });

  // 共用 mousemove / mouseup：drag 期間視覺更新；釋放才 commit 到 video.currentTime / video.volume
  document.addEventListener('mousemove', (e) => {
    if (dragging) {
      dragPct = computePct(e, progressTrack);
      visualUpdateProgress(dragPct);
    }
    if (volDragging) {
      volDragPct = computePct(e, volumeTrack);
      visualUpdateVolume(volDragPct);
    }
  });
  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      if (video.duration) video.currentTime = dragPct * video.duration;
    }
    if (volDragging) {
      volDragging = false;
      video.volume = volDragPct;
      video.muted = volDragPct === 0;
      updateMuteIcon();
      // mouseup 若已不在 wrap 內就收回 slider + thumb
      if (!volumeExpanded) {
        if (volumeTrack) volumeTrack.style.width = '0';
        if (volumeThumb) volumeThumb.style.opacity = '0';
      }
    }
  });

  muteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    updateMuteIcon();
    updateVolumeUI();
    showControls();
  });

  function updateVolumeUI() {
    const pct = video.muted ? 0 : video.volume * 100;
    if (volumeFill) volumeFill.style.width = `${pct}%`;
    updateMuteIcon();
  }

  function updateMuteIcon() {
    const icon = /** @type {HTMLElement | null | undefined} */ (muteBtn?.firstElementChild);
    if (!icon) return;
    // mute / volume-half / volume 三態自製 SVG（size 由 .icon-l 控）
    if (video.muted || video.volume === 0) {
      icon.className = 'icon icon-mute icon-l';
    } else if (video.volume < 0.5) {
      icon.className = 'icon icon-volume-half icon-l';
    } else {
      icon.className = 'icon icon-volume icon-l';
    }
    icon.style.fontSize = '';
  }

  // ── 全螢幕 ─────────────────────────────────────────────
  fullscreenBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      video.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    showControls();
  });

  document.addEventListener('fullscreenchange', () => {
    const icon = /** @type {HTMLElement | null | undefined} */ (fullscreenBtn?.firstElementChild);
    if (!icon) return;
    // expand 用自製 SVG；compress SVG 尚未做，先用 FA fallback
    // expand 走 .icon-l，FA compress fallback 用 inline 1.5rem 對齊
    if (document.fullscreenElement) {
      icon.className = 'fa-solid fa-compress';
      icon.style.fontSize = '1.5rem';
    } else {
      icon.className = 'icon icon-full-screen icon-l';
      icon.style.fontSize = '';
    }
  });

  // ── 關閉 ───────────────────────────────────────────────
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });
  mobileCloseBtn?.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });

  // ── 鍵盤 ───────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (overlay.style.display === 'none') return;
    if (e.key === 'Escape') closePlayer();
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowLeft')  { video.currentTime = Math.max(0, video.currentTime - 10); showControls(); }
    if (e.key === 'ArrowRight') { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); showControls(); }
  });

  // ── 影片結束 ───────────────────────────────────────────
  // 自動關閉 player 回首頁
  video.addEventListener('ended', () => {
    closePlayer();
  });

  // ── 格式化時間 ─────────────────────────────────────────
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  _videoPlayerInstance = { openPlayer, preloadVideo, _overlay: overlay };
  return _videoPlayerInstance;
}
