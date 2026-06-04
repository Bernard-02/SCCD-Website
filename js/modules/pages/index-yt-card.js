/**
 * Index Page - YT Card
 * 首頁 WATCH! 圓形卡片：隨機位置、漂浮動畫、p5 字母排版、點擊展開影片
 */

import { applyNewsHover, removeNewsHover } from '../animations/floating-items.js';
import { initVideoPlayer } from '../ui/video-player.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { EASE } from '../ui/motion.js';
import { CMS_API_BASE } from '../../config/api.js';

// ── p5 字母排版 ────────────────────────────────────────────────

function isChinese(ch) { return /[\u4e00-\u9fff]/.test(ch); }

function makeFont(enSize, zhSize) {
  return { en: '600 ' + enSize + 'px Inter', zh: '700 ' + zhSize + 'px "Noto Sans TC"' };
}

function getExactSize(ch, fontStr) {
  const sz = 300;
  const oc  = document.createElement('canvas');
  oc.width  = sz; oc.height = sz;
  const octx = oc.getContext('2d');
  octx.font = fontStr; octx.fillStyle = '#fff';
  octx.textAlign = 'center'; octx.textBaseline = 'middle';
  octx.fillText(ch, sz / 2, sz / 2);
  const data = octx.getImageData(0, 0, sz, sz).data;
  let minX = sz, maxX = 0, minY = sz, maxY = 0;
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      if (data[(y * sz + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { tw: maxX - minX + 1, th: maxY - minY + 1, offX: (minX + maxX) / 2 - sz / 2, offY: (minY + maxY) / 2 - sz / 2 };
}

function obbCorners(cx, cy, tw, th, angle) {
  const hw = tw / 2, hh = th / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([lx,ly]) => [cx + lx*cos - ly*sin, cy + lx*sin + ly*cos]);
}

function project(corners, axis) {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of corners) { const d = x*axis[0] + y*axis[1]; if (d < min) min = d; if (d > max) max = d; }
  return [min, max];
}

function obbOverlaps(a, b, gap) {
  const axes = [];
  for (const poly of [a.corners, b.corners]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1,y1] = poly[i], [x2,y2] = poly[(i+1) % poly.length];
      const len = Math.hypot(x2-x1, y2-y1);
      axes.push([-(y2-y1)/len, (x2-x1)/len]);
    }
  }
  for (const axis of axes) {
    const [minA,maxA] = project(a.corners, axis);
    const [minB,maxB] = project(b.corners, axis);
    if (maxA + gap < minB || maxB + gap < minA) return false;
  }
  return true;
}

function obbAABB(corners) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x,y] of corners) { if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
  return { x1: minX, y1: minY, x2: maxX, y2: maxY };
}

// p5 已不放 index.html head（移除 render-blocking CDN）；WATCH 卡第一次繪製時才 lazy-load
// 本地 generate-app/p5.min.js（與 /create 同一份、同源）；SPA 子頁切回 index 時 typeof p5 仍可能
// === 'undefined'，一樣靠這個 lazy-load，否則 initWatchChars 早退、WATCH 字母不繪
function ensureP5() {
  return new Promise(resolve => {
    if (typeof p5 !== 'undefined') { resolve(); return; }
    const existing = /** @type {HTMLScriptElement | null} */ (document.querySelector('script[data-p5-lazy]'));
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = '/generate-app/p5.min.js';
    s.dataset.p5Lazy = '1';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function initWatchChars(ytCharsEl) {
  if (!ytCharsEl) return;

  ensureP5().then(() => {
    if (typeof p5 === 'undefined') return;
    return Promise.all([
      document.fonts.load('600 16px Inter'),
      document.fonts.load('700 16px "Noto Sans TC"'),
    ]);
  }).then(() => {
    if (typeof p5 === 'undefined') return;
    new p5(function(p) {
      const chars = [...'WATCH!'];
      // GAP / PADDING 也在 setup 內按卡片寬比例算（基準 W=160），避免縮卡時 padding 吃掉太多 inner 空間
      let GAP = 2, PADDING = 8;

      p.setup = function() {
        const W = ytCharsEl.offsetWidth, H = ytCharsEl.offsetHeight;
        const cnv = p.createCanvas(W, H);
        cnv.parent(ytCharsEl);
        cnv.style('position', 'absolute');
        cnv.style('top', '0'); cnv.style('left', '0');
        p.noLoop(); p.clear();

        const rootPx    = parseFloat(getComputedStyle(document.documentElement).fontSize);
        // 字體跟卡片寬度等比例縮放：原設計基準卡片 W=160 時 enSize=2.8rem / zhSize=2.7rem
        // 卡片改 96 (60%) 後字也跟著 60% 縮；未來改卡片大小字會自動 fit 不必另調
        const sizeRatio = W / 160;
        const enSize    = Math.round(rootPx * 2.8 * sizeRatio);
        const zhSize    = Math.round(rootPx * 2.7 * sizeRatio);
        // GAP / PADDING 同步等比例縮（基準 W=160 時 GAP=2, PADDING=8）
        GAP     = Math.max(1, Math.round(2 * sizeRatio));
        PADDING = Math.max(3, Math.round(8 * sizeRatio));
        const f         = makeFont(enSize, zhSize);
        const charData  = chars.map(ch => { const fontStr = isChinese(ch) ? f.zh : f.en; return { ch, fontStr, ...getExactSize(ch, fontStr) }; });
        const circleCX  = W / 2, circleCY = H / 2;
        const circleR   = Math.min(W, H) / 2 - PADDING;
        const CACHE_KEY = `watch-layouts-${W}x${H}`;
        const TARGET    = 80;

        function tryLayout() {
          const placed = [];
          function inBounds(aabb) {
            return [[aabb.x1,aabb.y1],[aabb.x2,aabb.y1],[aabb.x1,aabb.y2],[aabb.x2,aabb.y2]].every(([x,y]) => {
              const dx = x - circleCX, dy = y - circleCY;
              return dx*dx + dy*dy <= circleR*circleR;
            });
          }
          for (let i = 0; i < chars.length; i++) {
            const { tw, th } = charData[i];
            for (let a = 0; a < 3000; a++) {
              const angle = p.random(-Math.PI/2, Math.PI/2);
              const cx = p.random(circleCX - circleR, circleCX + circleR);
              const cy = p.random(circleCY - circleR, circleCY + circleR);
              const corners = obbCorners(cx, cy, tw, th, angle);
              const obb = { corners, cx, cy, angle };
              if (inBounds(obbAABB(corners)) && !placed.some(b => obbOverlaps(obb, b, GAP))) {
                placed.push({ ...obb, charIdx: i }); break;
              }
            }
          }
          return placed;
        }

        let layouts = null;
        try { const c = sessionStorage.getItem(CACHE_KEY); if (c) layouts = JSON.parse(c); } catch (_) {}
        if (!layouts || layouts.length < TARGET) {
          layouts = [];
          for (let i = 0; i < TARGET * 3 && layouts.length < TARGET; i++) {
            const placed = tryLayout();
            if (placed.length === chars.length) layouts.push(placed.map(({ cx, cy, angle, charIdx }) => ({ cx, cy, angle, charIdx })));
          }
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(layouts)); } catch (_) {}
        }
        if (!layouts.length) return;

        const ctx = p.drawingContext;
        let lastPlaced = null;
        function getCharColor() {
          // standard/inverse: 卡片底色 = var(--theme-fg)（黑/白）→ 文字用反向 var(--theme-bg)
          // mode-color: 卡片底改為 var(--theme-fg) strict 對比 → 文字用 var(--theme-fg-inverse)
          // ⚠️ 必須讀 document.body 而非 documentElement：--theme-bg/fg 定義在 body.mode-* 上，
          //    從 <html> 讀永遠拿 :root 預設值（standard 的白），inverse 切換失效
          //    （--theme-fg-inverse 是 mode-color 由 theme-toggle.js 設在 documentElement，cascade 下來 body 也讀得到）
          const isColorMode = document.body.classList.contains('mode-color');
          const varName = isColorMode ? '--theme-fg-inverse' : '--theme-bg';
          const c = getComputedStyle(document.body).getPropertyValue(varName).trim();
          return c || (isColorMode ? '#fff' : '#fff');
        }
        function drawLayout(reuse = false) {
          p.clear();
          if (!reuse || !lastPlaced) {
            // 重新洗牌：copy 一份並重置 _scale=1，避免 fadeOut 後 reshuffle 拿到 scale:0 的 stale ref
            lastPlaced = layouts[Math.floor(Math.random() * layouts.length)].map(pos => ({ ...pos, _scale: 1 }));
          }
          const color = getCharColor();
          for (const pos of lastPlaced) {
            const cd = charData[pos.charIdx];
            const s = pos._scale ?? 1;
            if (s <= 0) continue; // scale=0 不畫，省 ctx 操作
            ctx.save();
            ctx.font = cd.fontStr; ctx.fillStyle = color;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.translate(pos.cx, pos.cy); ctx.rotate(pos.angle);
            if (s !== 1) ctx.scale(s, s);
            ctx.fillText(cd.ch, -cd.offX, -cd.offY);
            ctx.restore();
          }
        }
        drawLayout();
        // 每 3 秒重新洗牌 layout — 暴露 pause/resume 給 click 動畫期間用，
        // 否則 reshuffle 會把已 fade 的字母 reset _scale=1 重新畫出來，造成「卡畫面」
        let layoutInterval = setInterval(() => drawLayout(false), 3000);
        // theme 切換時即時重繪（保持當前 layout 不洗牌）— named ref 給 cleanup remove 用
        const onThemeChanged = () => drawLayout(true);
        window.addEventListener('theme:changed', onThemeChanged);
        // SPA 離開 index 時解綁 + 停 reshuffle interval，避免回 index 時新 p5 + 舊 listener 並存重繪 N 倍
        registerPageCleanup(() => {
          window.removeEventListener('theme:changed', onThemeChanged);
          clearInterval(layoutInterval);
        });

        // 暴露 fadeOut/reset hooks 給 click handler 用：
        // - fadeOutWatch：依 chars 順序 stagger 把每字 _scale 直接從 1 切到 0（瞬間不見，不縮小），onUpdate 每幀 redraw
        // - resetWatchAlpha：把所有 _scale 還原為 1（player 關閉後恢復顯示）
        ytCharsEl.__fadeOutWatch = function(opts = {}) {
          if (!lastPlaced || typeof gsap === 'undefined') return Promise.resolve();
          const stagger = opts.stagger ?? 0.06;
          return new Promise(resolve => {
            const tl = gsap.timeline({
              onUpdate: () => drawLayout(true),
              onComplete: resolve,
            });
            lastPlaced.forEach((pos, i) => {
              tl.set(pos, { _scale: 0 }, i * stagger);
            });
          });
        };
        ytCharsEl.__resetWatchAlpha = function() {
          if (!lastPlaced) return;
          lastPlaced.forEach(pos => { pos._scale = 1; });
          drawLayout(true);
        };
        // 關閉動畫完成後：先隱藏所有字，再依序 stagger 顯現
        ytCharsEl.__fadeInWatch = function(opts = {}) {
          if (!lastPlaced || typeof gsap === 'undefined') return;
          const stagger = opts.stagger ?? 0.06;
          lastPlaced.forEach(pos => { pos._scale = 0; });
          drawLayout(true);
          const tl = gsap.timeline({ onUpdate: () => drawLayout(true) });
          lastPlaced.forEach((pos, i) => {
            tl.set(pos, { _scale: 1 }, i * stagger);
          });
        };
        // click 動畫期間暫停 reshuffle interval，避免 fade 完的字母被 reshuffle reset _scale=1 重畫
        ytCharsEl.__pauseLayoutInterval = function() {
          if (layoutInterval) { clearInterval(layoutInterval); layoutInterval = null; }
        };
        ytCharsEl.__resumeLayoutInterval = function() {
          if (!layoutInterval) layoutInterval = setInterval(() => drawLayout(false), 3000);
        };
        // 總時長供 click handler 參考（不再對齊圓圈，圓圈獨立 0.8s）
        ytCharsEl.__getWatchFadeDuration = function(opts = {}) {
          const stagger = opts.stagger ?? 0.06;
          return (chars.length - 1) * stagger;
        };
      };
    });
  });
}

// ── 漂浮動畫 ──────────────────────────────────────────────────

function initYTCardFloat(ytCard) {
  const section  = ytCard.parentElement;
  const cardW    = ytCard.offsetWidth  || 96;
  const cardH    = ytCard.offsetHeight || 96;
  const rotation = SCCDHelpers.getRandomRotation();
  const speed    = 0.05 + Math.random() * 0.15;
  const angle    = Math.random() * Math.PI * 2;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  let x  = Math.random() * (section.clientWidth  - cardW);
  let y  = Math.random() * (section.clientHeight - cardH);
  let frozen = false;

  ytCard.style.left = '0'; ytCard.style.top = '0';
  ytCard.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;

  // rAF id 註冊 page-cleanup：SPA 離開 index 取消，否則 tick 永遠在 detached ytCard 上跑（CPU 浪費）
  let rafId;
  function tick() {
    if (!frozen) {
      x += vx; y += vy;
      const cw = section.clientWidth, ch = section.clientHeight;
      if (x > cw + 10) x = -cardW; else if (x < -cardW) x = cw + 10;
      if (y > ch + 10) y = -cardH; else if (y < -cardH) y = ch + 10;
      ytCard.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
  registerPageCleanup(() => cancelAnimationFrame(rafId));

  ytCard.addEventListener('mouseenter', () => { frozen = true; });
  ytCard.addEventListener('mouseleave', () => {
    // 點擊動畫期間保持 frozen，避免 mouseleave 讓 card 漂走影響 chars/clone 對齊
    if (ytCard.dataset.clickAnimating === '1') return;
    frozen = false;
  });
  // expose 給 click handler 強制鎖/解鎖 frozen
  ytCard.__setFrozen = (v) => { frozen = v; };
}

// ── 點擊展開影片 ──────────────────────────────────────────────

// playerRef = { player: null }；caller 之後 fetch resolve 才 set player；
// 這樣 click handler 能 sync 立刻掛在 init 開頭，fetch 沒 resolve 時 click 是 graceful no-op
// 不會發生「fetch 還沒回 / 失敗 → handler 永遠不掛 → user 點沒反應」
function initYTCardClick(ytCard, playerRef) {
  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

  ytCard.addEventListener('mouseenter', () => applyNewsHover());
  ytCard.addEventListener('mouseleave', () => {
    if (ytCard.dataset.clickAnimating === '1') return;
    removeNewsHover();
  });

  ytCard.addEventListener('click', () => {
    // player 還沒 ready（fetch 還沒 resolve / 失敗 / json 缺 videoUrl）→ silent no-op
    // 不要設 clickAnimating 也不要動 animation，user 再點一次（fetch 完成後）就能 work
    const player = playerRef.player;
    if (!player) {
      console.warn('[YT card] click ignored: player not ready (fetch news.json pending or failed)');
      return;
    }
    // click 鎖：動畫期間（~1.16s）擋掉重複觸發，並強制 card frozen 不浮動
    if (ytCard.dataset.clickAnimating === '1') return;
    ytCard.dataset.clickAnimating = '1';
    ytCard.__setFrozen?.(true);
    // Safety: 若 gsap onComplete 沒跑（被 kill / openPlayer 失敗 / fadePromise 卡），
    // 5s 後強制解鎖，避免下次 click 永久被擋掉
    const safetyClickRelease = setTimeout(() => {
      if (ytCard.dataset.clickAnimating === '1') {
        delete ytCard.dataset.clickAnimating;
        ytCard.__setFrozen?.(false);
      }
    }, 5000);

    // 暫停 chars layout reshuffle interval，避免 fade 期間被 reset 卡畫面
    document.getElementById('homepage-yt-chars')?.__pauseLayoutInterval?.();

    const rect    = ytCard.getBoundingClientRect();
    const cardCx  = rect.left + rect.width  / 2;
    const cardCy  = rect.top  + rect.height / 2;
    const vW = window.innerWidth, vH = window.innerHeight;
    const maxDist = Math.max(...[[0,0],[vW,0],[0,vH],[vW,vH]].map(([cx,cy]) => Math.hypot(cx - cardCx, cy - cardCy)));
    const targetScale = (maxDist / (rect.width / 2)) * 2.2;

    // 字母 fadeOut（短）+ 圓圈放大（長），同時起跑，圓圈放慢讓字母能完整消失。
    // ⚠️ ytCard 父層 <section> 有 position:relative + z:9998 形成 stacking context，
    //    ytCard 內的 z 怎麼調都被困在 section（9998），永遠在 body-level clone (z:10001) 之下。
    //    解法：把 chars 元素暫時 reparent 到 body，position:fixed 對齊 card 原位 + z:10002，
    //    這樣 chars 突破 section stacking 浮在 clone 之上，動畫期間可見。
    const ytCharsEl = document.getElementById('homepage-yt-chars');
    const fadeOpts = { stagger: 0.06 };
    const scaleDur = 0.5;

    // 取 ytCard 的 rotation 一起套到 reparented chars，避免 position:fixed 後失去 rotation 造成位置/角度跳動
    let rotDeg = 0;
    try {
      const t = getComputedStyle(ytCard).transform;
      if (t && t !== 'none') {
        const m = new DOMMatrix(t);
        rotDeg = Math.atan2(m.b, m.a) * 180 / Math.PI;
      }
    } catch (_) {}
    const cardW = ytCard.offsetWidth || rect.width;
    const cardH = ytCard.offsetHeight || rect.height;

    let charsOriginalParent = null;
    let charsOriginalCss = '';
    if (ytCharsEl) {
      charsOriginalParent = ytCharsEl.parentElement;
      charsOriginalCss = ytCharsEl.getAttribute('style') || '';
      // 用 card 原始 (未旋轉) size + center 對齊 + 套同 rotation，視覺位置與 ytCard 完全重疊
      ytCharsEl.style.cssText = `position:fixed; left:${cardCx - cardW/2}px; top:${cardCy - cardH/2}px; width:${cardW}px; height:${cardH}px; transform:rotate(${rotDeg}deg); transform-origin:center center; z-index:10002; pointer-events:none;`;
      document.body.appendChild(ytCharsEl);
    }

    // 字母依序瞬間消失先跑（拍 1~6），第 7 拍才啟動圓圈 → 等序節奏
    const fadePromise = /** @type {Promise<void>} */ (ytCharsEl?.__fadeOutWatch?.(fadeOpts) ?? Promise.resolve());
    fadePromise.then(() => {
      // 等一拍（stagger），讓圓圈在「第 7 拍」啟動接續字母節奏
      setTimeout(() => {
        const clone = document.createElement('div');
        clone.style.cssText = `position:fixed; left:${cardCx}px; top:${cardCy}px; width:${rect.width}px; height:${rect.height}px; margin-left:${-rect.width/2}px; margin-top:${-rect.height/2}px; background:#000; border-radius:50%; z-index:10001; transform:scale(1); transform-origin:center center;`;
        document.body.appendChild(clone);

        // clone start 時 preload video（buffer 資料但不顯示），cover 期間 buffer 完成。
        // 不能在這裡 openPlayer：clone 是「圓形」（border-radius:50%），scale 期間 viewport
        // 四角還沒被覆蓋，全螢幕 overlay 的 video 會從角落露出。等 onComplete 才 openPlayer。
        player?.preloadVideo?.();

        gsap.to(clone, {
          scale: targetScale, duration: scaleDur, ease: EASE.exit, // 持續加速衝滿，後段更陡
          onComplete: () => {
            // 先 openPlayer（overlay 顯示 + .play()），video 已 buffered → 黑屏 <100ms
            // 然後再 remove clone，確保「黑圈滿版時」才看到 video
            player?.openPlayer({ accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] });
            clone.remove();
            ytCard.__closeSpotlight?.();
            // 還原 chars：先 cssText reset 再搬回原 parent（同步 task 內 DOM 一次到位，paint 不閃）
            if (ytCharsEl && charsOriginalParent) {
              ytCharsEl.setAttribute('style', charsOriginalCss);
              charsOriginalParent.appendChild(ytCharsEl);
            }
            ytCharsEl?.__resetWatchAlpha?.();
            ytCharsEl?.__resumeLayoutInterval?.();
            // 解鎖 click 動畫狀態 + 依當下 hover 還原 frozen（player 蓋住 card hover 自然 false）
            clearTimeout(safetyClickRelease);
            delete ytCard.dataset.clickAnimating;
            ytCard.__setFrozen?.(ytCard.matches(':hover'));
          }
        });
      }, fadeOpts.stagger * 1000);
    });
  });
}

// ── 主入口 ────────────────────────────────────────────────────

export function initYTCard() {
  const ytCard    = document.getElementById('homepage-yt-card');
  const ytCharsEl = document.getElementById('homepage-yt-chars');
  if (!ytCard) return;
  // ytCard 在 main 內每次 SPA 回 index 都是 fresh 元素（dataset 空），guard 是無害 no-op；
  // 真正防累積靠 initVideoPlayer 的 module-level singleton 跟 initWatchHover 自清舊 overlay
  if (ytCard.dataset.ytInited === '1') return;
  ytCard.dataset.ytInited = '1';
  delete ytCard.dataset.clickAnimating;

  initYTCardFloat(ytCard);
  initWatchChars(ytCharsEl);

  // 立刻掛 click handler（不放在 fetch.then 內），player 用 mutable ref 後續 update
  // 避免「fetch 還沒回 / 失敗 / videoUrl 缺漏 / preloadVideo 寫錯 optional chain → handler 永遠不掛
  // → user 點 WATCH 沒反應 console 全乾淨」的 silent failure
  const playerRef = { player: null };
  initYTCardClick(ytCard, playerRef);

  // 影片來源改 Directus index_video（singleton，回 { data: { videoUrl: HLS m3u8 串流網址 } }）
  const fetchTheater = () =>
    fetch(`${CMS_API_BASE}/index_video`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(j => j.data || {});

  fetchTheater()
    .then(data => {
      if (!data?.videoUrl) {
        console.warn('[initYTCard] index-theater 缺 videoUrl，WATCH 按鈕將 no-op');
        return;
      }
      const player = initVideoPlayer(data.videoUrl, {
        // lazy DOM query：initVideoPlayer 是 module singleton，第二次 call 直接 return cached，
        // 新傳 lambda 被丟。closure 內若直接 close-capture ytCard reference，SPA back-nav 後 ytCard
        // 已 detached → getBoundingClientRect 變 {0,0,0,0} → close 動畫破。改 lazy query 每次 fresh
        getCardRect: () => document.getElementById('homepage-yt-card')?.getBoundingClientRect(),
        onCloseAnimComplete: () => {
          document.getElementById('homepage-yt-chars')?.__fadeInWatch?.();
        },
      });
      // ⚠️ 必須 player?.preloadVideo?.() — initVideoPlayer 若 element 缺漏會 return undefined，
      // 寫成 player.preloadVideo?.() 會 TypeError 被下面 .catch 吞掉 → playerRef.player 永遠 null
      player?.preloadVideo?.();
      playerRef.player = player;
    })
    .catch(err => console.warn('[initYTCard] index-theater load failed:', err));
}
