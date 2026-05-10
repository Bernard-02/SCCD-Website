/**
 * Video Player
 * Netflix 風格全螢幕播放器
 */

export function initVideoPlayer(videoUrl, { getCardRect, onCloseAnimComplete } = {}) {
  const overlay       = document.getElementById('video-player-overlay');
  const video         = document.getElementById('video-player');
  const playBtn       = document.getElementById('video-play-btn');
  const muteBtn        = document.getElementById('video-mute-btn');
  const volumeWrap     = document.getElementById('video-volume-wrap');
  const volumeTrack    = document.getElementById('video-volume-track');
  const volumeFill     = document.getElementById('video-volume-fill');
  const timeEl        = document.getElementById('video-time');
  const progressTrack = document.getElementById('video-progress-track');
  const progressFill  = document.getElementById('video-progress-fill');
  const progressThumb = document.getElementById('video-progress-thumb');
  const controls      = document.getElementById('video-controls');
  const closeBtn      = document.getElementById('video-close-btn');
  const fullscreenBtn = document.getElementById('video-fullscreen-btn');
  const seekBackBtn   = document.getElementById('video-seek-back');
  const seekFwdBtn    = document.getElementById('video-seek-fwd');

  if (!overlay || !video) return;

  const uiBlocks = [
    document.getElementById('video-block-close'),
    document.getElementById('video-block-center'),
    document.getElementById('video-block-fullscreen'),
  ].filter(Boolean);

  let iconColor = '#000';

  function applyIconColor(color) {
    iconColor = color;
    const trackColor = color === '#fff' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
    if (progressFill)  progressFill.style.background  = color;
    if (progressThumb) progressThumb.style.background = color;
    if (progressTrack) progressTrack.style.background = trackColor;
    if (volumeFill)    volumeFill.style.background    = color;
    if (volumeTrack)   volumeTrack.style.background   = trackColor;
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
    if (video.src !== videoUrl) {
      video.src = videoUrl;
      video.preload = 'auto';
      video.load();
    }
  }

  // ── 開啟播放器 ──────────────────────────────────────────
  function openPlayer({ accentColor = '#00FF80' } = {}) {
    // 全部三原色（綠/粉/藍）底色一律配黑色 icon
    const uiIconColor = '#000';
    if (video.src !== videoUrl) video.src = videoUrl; // 萬一沒 preload 也 fallback
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // 三個矩形區塊各自設背景色
    uiBlocks.forEach(block => { if (block) block.style.background = accentColor; });
    applyIconColor(uiIconColor);
    video.play();
    updatePlayIcon();
    updateVolumeUI();
    hideControls();
  }

  // ── 關閉播放器 ──────────────────────────────────────────
  function closePlayer() {
    video.pause();
    clearTimeout(hideTimer);
    if (document.fullscreenElement) document.exitFullscreen?.();

    const rect = getCardRect?.();
    if (!rect || typeof gsap === 'undefined') {
      video.src = '';
      overlay.style.display = 'none';
      document.body.style.overflow = '';
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

    const clone = document.createElement('div');
    clone.style.cssText = `position:fixed; left:${cardCx}px; top:${cardCy}px; width:${rect.width}px; height:${rect.height}px; margin-left:${-rect.width/2}px; margin-top:${-rect.height/2}px; background:#000; border-radius:50%; z-index:10001; transform:scale(${fromScale}); transform-origin:center center;`;
    document.body.appendChild(clone);

    overlay.style.display = 'none';
    document.body.style.overflow = '';

    gsap.to(clone, {
      scale: 1, duration: 0.5, ease: 'power3.out',
      onComplete: () => {
        clone.remove();
        video.src = '';
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
        gsap.fromTo(block,
          { clipPath: clip.from, rotation: rot },
          { clipPath: clip.to,   rotation: rot, duration: 0.4, ease: 'power3.out', overwrite: true }
        );
      });
    }
    hideTimer = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    gsap.to(controls, { opacity: 0, duration: 0.25, ease: 'power2.in', overwrite: true });
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
    const icon = playBtn.querySelector('i');
    if (!icon) return;
    // fa-pause 比 fa-play 窄，用固定寬度避免影響右邊元素位置
    icon.className = video.paused ? 'fa-solid fa-play fa-fw' : 'fa-solid fa-pause fa-fw';
    icon.style.fontSize = '1.75rem';
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

  // ── 進度條 ─────────────────────────────────────────────
  let rafPending = false;
  video.addEventListener('timeupdate', () => {
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

  function seekTo(e) {
    const rect = progressTrack.getBoundingClientRect();
    const pct  = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
    showControls();
  }

  progressTrack.addEventListener('click', seekTo);

  let dragging = false;
  progressTrack.addEventListener('mousedown', (e) => { dragging = true; seekTo(e); });
  document.addEventListener('mousemove', (e) => { if (dragging) seekTo(e); });
  document.addEventListener('mouseup', () => { dragging = false; });

  // ── 音量 ───────────────────────────────────────────────
  // Hover to expand volume track
  let volumeExpanded = false;
  volumeWrap?.addEventListener('mouseenter', () => {
    if (volumeTrack) volumeTrack.style.width = '80px';
    volumeExpanded = true;
  });
  volumeWrap?.addEventListener('mouseleave', () => {
    if (volumeTrack) volumeTrack.style.width = '0';
    volumeExpanded = false;
  });

  // Click on volume track to set volume
  let volDragging = false;
  function seekVolume(e) {
    const rect = volumeTrack.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.volume = pct;
    video.muted = pct === 0;
    updateVolumeUI();
    showControls();
  }
  volumeTrack?.addEventListener('click', seekVolume);
  volumeTrack?.addEventListener('mousedown', (e) => { volDragging = true; seekVolume(e); });
  document.addEventListener('mousemove', (e) => { if (volDragging) seekVolume(e); });
  document.addEventListener('mouseup', () => { volDragging = false; });

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
    const icon = muteBtn?.querySelector('i');
    if (!icon) return;
    icon.className = (video.muted || video.volume === 0)
      ? 'fa-solid fa-volume-xmark'
      : video.volume < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
    icon.style.fontSize = '1.25rem';
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
    const icon = fullscreenBtn?.querySelector('i');
    if (!icon) return;
    icon.className = document.fullscreenElement ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    icon.style.fontSize = '1.25rem';
  });

  // ── 關閉 ───────────────────────────────────────────────
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });

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

  return { openPlayer, preloadVideo };
}
