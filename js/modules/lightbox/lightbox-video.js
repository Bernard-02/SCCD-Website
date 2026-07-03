/**
 * Lightbox HLS 影片播放器（.m3u8 自架影片）
 * YouTube 維持 iframe（yt 自家 UI）；後台連結是 m3u8 走這裡。
 * UI 對齊首頁 WATCH 播放器（index.html #video-controls）：
 *   - 兩個獨立 accent 色塊：中央 control bar（play/進度/時間/音量）+ 全螢幕鈕（lightbox 有自己的返回鈕故無 close 塊）
 *   - 進度條 = track/fill/thumb 全黑連續線，位置靠 4×14px thumb 上下突出標示（非半透明 track）
 *   - 每次顯示各塊隨機小旋轉 + clip reveal 進出場；閒置 3s 自動收
 *   - 全螢幕 = 原生 controls（user 指定）；手機 = 原生 controls（同首頁手機策略）
 */

import { attachVideoSource, detachVideoSource } from '../ui/video-player.js';
import { DUR, EASE } from '../ui/motion.js';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// 回傳 { el, toggle, destroy }：caller（activities-lightbox renderMain）append el、
// 換張/關閉時必須呼叫 destroy（解 document listeners + hls.js instance）
export function createLightboxVideo(url, accent = '#00FF80') {
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:100%;max-width:960px;aspect-ratio:16/9;max-height:100%;background:#000;';
  const video = document.createElement('video');
  video.playsInline = true;
  video.style.cssText = 'width:100%;height:100%;display:block;';
  root.appendChild(video);
  attachVideoSource(video, url);
  // autoplay 被瀏覽器擋下就停在 paused，等 user 按 play
  const tryPlay = () => { const p = video.play(); if (p) p.catch(() => {}); };
  tryPlay();

  if (window.innerWidth < 768) {
    video.controls = true;
    return {
      el: root,
      toggle() { video.paused ? tryPlay() : video.pause(); },
      destroy() { detachVideoSource(video); },
    };
  }

  // ── 桌面：兩個獨立色塊（同 WATCH #video-block-center / #video-block-fullscreen）──
  // 寬度 70% 置中（user 2026-07-03：不要滿版貼齊影片兩側）
  const controls = document.createElement('div');
  controls.style.cssText = 'position:absolute;left:0;right:0;bottom:20px;margin:0 auto;width:70%;display:flex;align-items:center;opacity:0;pointer-events:none;';
  root.appendChild(controls);

  const mkIconBtn = (icon, label) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', label);
    b.style.cssText = 'color:#000;background:none;border:none;padding:0;line-height:1;flex-shrink:0;';
    b.innerHTML = `<span class="icon ${icon} icon-l"></span>`;
    return b;
  };

  // 中央 control bar（規格同 WATCH 區塊 2）
  const centerBlock = document.createElement('div');
  centerBlock.style.cssText = `background:${accent};padding:0 1.25rem;height:3rem;display:flex;align-items:center;gap:1.25rem;flex:1;min-width:0;margin-right:1rem;`;
  controls.appendChild(centerBlock);

  const playBtn = mkIconBtn('icon-pause', '播放／暫停 Play/Pause');
  playBtn.style.width = '1.5rem';
  centerBlock.appendChild(playBtn);

  // 時間軸：track 全黑 + fill 全黑（連續黑線）；thumb = 4px 寬黑直線上下伸出 5px 標位置（同 WATCH）
  const progTrack = document.createElement('div');
  progTrack.style.cssText = 'flex:1;height:4px;background:#000;position:relative;min-width:0;cursor:pointer;';
  const progFill = document.createElement('div');
  progFill.style.cssText = 'height:100%;width:0%;pointer-events:none;position:relative;background:#000;';
  const progThumb = document.createElement('div');
  progThumb.style.cssText = 'position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:4px;height:14px;background:#000;pointer-events:none;';
  progFill.appendChild(progThumb);
  progTrack.appendChild(progFill);
  centerBlock.appendChild(progTrack);

  const timeEl = document.createElement('span');
  timeEl.className = 'text-p2';
  timeEl.style.cssText = 'color:#000;white-space:nowrap;flex-shrink:0;';
  timeEl.textContent = '0:00';
  centerBlock.appendChild(timeEl);

  // 音量：mute 鈕 + hover 展開 slider（全黑線 + thumb，同 WATCH）
  const volWrap = document.createElement('div');
  volWrap.style.cssText = 'display:flex;align-items:center;gap:0.75rem;flex-shrink:0;';
  const muteBtn = mkIconBtn('icon-volume', '靜音／取消靜音 Mute/Unmute');
  volWrap.appendChild(muteBtn);
  const volTrack = document.createElement('div');
  volTrack.style.cssText = 'width:0;overflow:visible;transition:width 0.25s cubic-bezier(0.25,0,0,1);height:4px;background:#000;position:relative;flex-shrink:0;cursor:pointer;';
  const volFill = document.createElement('div');
  volFill.style.cssText = 'height:100%;width:100%;background:#000;pointer-events:none;position:relative;';
  const volThumb = document.createElement('div');
  volThumb.style.cssText = 'position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:4px;height:14px;background:#000;pointer-events:none;opacity:0;transition:opacity 0.25s;';
  volFill.appendChild(volThumb);
  volTrack.appendChild(volFill);
  volWrap.appendChild(volTrack);
  centerBlock.appendChild(volWrap);

  // 全螢幕（獨立色塊，同 WATCH 區塊 3）
  const fsBlock = document.createElement('div');
  fsBlock.style.cssText = `background:${accent};padding:0 1rem;height:3rem;display:flex;align-items:center;flex-shrink:0;`;
  const fsBtn = mkIconBtn('icon-full-screen', '全螢幕 Fullscreen');
  fsBlock.appendChild(fsBtn);
  controls.appendChild(fsBlock);

  // document 級 listener 集中登記，destroy 統一解綁（lightbox 換張/關閉不留殘）
  const docListeners = [];
  const onDoc = (type, fn) => { document.addEventListener(type, fn); docListeners.push([type, fn]); };

  // ── 顯隱：每塊隨機方向 clip reveal + 隨機旋轉（同 WATCH showControls/hideControls）──
  const CLIP_DIRS = {
    top:    { from: 'inset(0% 0% 100% 0%)', to: 'inset(0% 0% 0% 0%)' },
    bottom: { from: 'inset(100% 0% 0% 0%)', to: 'inset(0% 0% 0% 0%)' },
    left:   { from: 'inset(0% 100% 0% 0%)', to: 'inset(0% 0% 0% 0%)' },
    right:  { from: 'inset(0% 0% 0% 100%)', to: 'inset(0% 0% 0% 0%)' },
  };
  const ALL_DIRS  = ['top', 'bottom', 'left', 'right'];
  const VERT_DIRS = ['top', 'bottom'];   // 中央 bar 限上下（同 WATCH）
  const randDir = dirs => dirs[Math.floor(Math.random() * dirs.length)];
  function randRot(exclude = [], min = -4, max = 6) {
    let r;
    do { r = Math.round(Math.random() * (max - min) + min); }
    while (exclude.some(e => Math.abs(e - r) < 2));
    return r;
  }
  // [中央 bar（限上下、±2°）, 全螢幕塊（四向、-4~6°）]
  const uiBlocks = [centerBlock, fsBlock];

  let isVisible = false;
  let hideTimer = null;

  function showControls() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideControls, 3000);
    controls.style.pointerEvents = 'auto';
    if (typeof gsap === 'undefined') { controls.style.opacity = '1'; return; }
    gsap.set(controls, { opacity: 1 });
    if (isVisible) return;
    isVisible = true;
    const usedRots = [];
    uiBlocks.forEach((block, i) => {
      const dirs = i === 0 ? VERT_DIRS : ALL_DIRS;
      const dir  = randDir(dirs);
      const clip = CLIP_DIRS[dir];
      const rot  = i === 0 ? randRot(usedRots, -2, 2) : randRot(usedRots);
      usedRots.push(rot);
      // 記錄進場方向/旋轉 → hideControls 沿同方向反向收回（出場 = 進場反向）
      block._enterDir = dir;
      block._enterRot = rot;
      gsap.fromTo(block,
        { clipPath: clip.from, rotation: rot },
        { clipPath: clip.to,   rotation: rot, duration: DUR.base, ease: EASE.enter, overwrite: true }
      );
    });
  }

  function hideControls() {
    if (isVisible && typeof gsap !== 'undefined') {
      uiBlocks.forEach(block => {
        const dir = block._enterDir;
        if (!dir) return;
        gsap.to(block, {
          clipPath: CLIP_DIRS[dir].from,
          rotation: block._enterRot ?? 0,
          duration: DUR.base, ease: EASE.exit, overwrite: true,
        });
      });
    } else if (typeof gsap === 'undefined') {
      controls.style.opacity = '0';
    }
    controls.style.pointerEvents = 'none';
    isVisible = false;
  }

  root.addEventListener('mousemove', showControls);
  root.addEventListener('click', showControls);

  // ── 播放/暫停 ────────────────────────────────────────────────
  function updatePlayIcon() {
    playBtn.firstElementChild.className = `icon ${video.paused ? 'icon-play' : 'icon-pause'} icon-l`;
  }
  const toggle = () => { video.paused ? tryPlay() : video.pause(); };
  video.addEventListener('click', toggle);
  playBtn.addEventListener('click', e => { e.stopPropagation(); toggle(); showControls(); });
  video.addEventListener('play', updatePlayIcon);
  video.addEventListener('pause', updatePlayIcon);
  video.addEventListener('ended', updatePlayIcon);

  // ── 進度（同 WATCH YT-style：drag 期間只動視覺，mouseup 才 seek）──
  let rafPending = false;
  video.addEventListener('timeupdate', () => {
    if (dragging || rafPending || !video.duration) return;
    rafPending = true;
    requestAnimationFrame(() => {
      progFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
      timeEl.textContent = formatTime(video.duration - video.currentTime);
      rafPending = false;
    });
  });

  const pctFromEvent = (e, track) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  let dragging = false;
  let dragPct = 0;
  progTrack.addEventListener('mousedown', e => {
    dragging = true;
    dragPct = pctFromEvent(e, progTrack);
    progFill.style.width = `${dragPct * 100}%`;
    showControls();
    e.preventDefault();
  });

  // ── 音量（hover 展開 80px；drag 即時生效）────────────────────
  let volDragging = false;
  let volHover = false;
  function updateMuteIcon() {
    const cls = (video.muted || video.volume === 0) ? 'icon-mute' : video.volume < 0.5 ? 'icon-volume-half' : 'icon-volume';
    muteBtn.firstElementChild.className = `icon ${cls} icon-l`;
  }
  function setVolume(p) {
    video.volume = p;
    video.muted = p === 0;
    volFill.style.width = `${p * 100}%`;
    updateMuteIcon();
  }
  const collapseVol = () => { volTrack.style.width = '0'; volThumb.style.opacity = '0'; };
  volWrap.addEventListener('mouseenter', () => {
    volHover = true;
    volTrack.style.width = '80px';
    volThumb.style.opacity = '1';
  });
  volWrap.addEventListener('mouseleave', () => {
    volHover = false;
    if (!volDragging) collapseVol();
  });
  volTrack.addEventListener('mousedown', e => {
    volDragging = true;
    setVolume(pctFromEvent(e, volTrack));
    e.preventDefault();
  });
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    video.muted = !video.muted;
    volFill.style.width = video.muted ? '0' : `${video.volume * 100}%`;
    updateMuteIcon();
    showControls();
  });

  onDoc('mousemove', e => {
    if (dragging) {
      dragPct = pctFromEvent(e, progTrack);
      progFill.style.width = `${dragPct * 100}%`;
      if (video.duration) timeEl.textContent = formatTime((1 - dragPct) * video.duration);
    }
    if (volDragging) setVolume(pctFromEvent(e, volTrack));
  });
  onDoc('mouseup', () => {
    if (dragging) {
      dragging = false;
      if (video.duration) video.currentTime = dragPct * video.duration;
    }
    if (volDragging) {
      volDragging = false;
      if (!volHover) collapseVol();
    }
  });

  // ── 全螢幕：fullscreen element = video 本體 → 原生 controls 接手 ──
  fsBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!document.fullscreenElement) video.requestFullscreen?.();
    else document.exitFullscreen?.();
    showControls();
  });
  onDoc('fullscreenchange', () => {
    video.controls = document.fullscreenElement === video;
  });

  // 開啟先亮一次 controls（暗示可操作），3s 沒動自動收
  showControls();

  return {
    el: root,
    toggle,
    destroy() {
      clearTimeout(hideTimer);
      docListeners.forEach(([t, f]) => document.removeEventListener(t, f));
      if (typeof gsap !== 'undefined') gsap.killTweensOf([controls, ...uiBlocks]);
      if (document.fullscreenElement === video) document.exitFullscreen?.();
      detachVideoSource(video);
    },
  };
}
