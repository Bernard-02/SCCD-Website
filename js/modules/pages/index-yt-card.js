/**
 * Index Page - YT Card
 * 首頁 WATCH! 圓形卡片：隨機位置、漂浮動畫、p5 字母排版、點擊展開影片
 */

import { applyNewsHover, removeNewsHover } from '../animations/floating-items.js';
import { initVideoPlayer } from '../ui/video-player.js';

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

function initWatchChars(ytCharsEl) {
  if (!ytCharsEl || typeof p5 === 'undefined') return;

  Promise.all([
    document.fonts.load('600 16px Inter'),
    document.fonts.load('700 16px "Noto Sans TC"'),
  ]).then(() => {
    new p5(function(p) {
      const chars = [...'WATCH!'];
      const GAP = 2, PADDING = 8;

      p.setup = function() {
        const W = ytCharsEl.offsetWidth, H = ytCharsEl.offsetHeight;
        const cnv = p.createCanvas(W, H);
        cnv.parent(ytCharsEl);
        cnv.style('position', 'absolute');
        cnv.style('top', '0'); cnv.style('left', '0');
        p.noLoop(); p.clear();

        const rootPx    = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const enSize    = Math.round(rootPx * 2.8);
        const zhSize    = Math.round(rootPx * 2.7);
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
          // mode-color: 卡片底是 25% overlay 半透明隨機色，文字必須用 var(--theme-fg) 對比色
          //   否則 var(--theme-bg)=隨機色 ≈ overlay 底色 → 看不見
          // ⚠️ 必須讀 document.body 而非 documentElement：--theme-bg/fg 定義在 body.mode-* 上，
          //    從 <html> 讀永遠拿 :root 預設值（standard 的白），inverse 切換失效
          const isColorMode = document.body.classList.contains('mode-color');
          const varName = isColorMode ? '--theme-fg' : '--theme-bg';
          const c = getComputedStyle(document.body).getPropertyValue(varName).trim();
          return c || (isColorMode ? '#000' : '#fff');
        }
        function drawLayout(reuse = false) {
          p.clear();
          if (!reuse || !lastPlaced) {
            lastPlaced = layouts[Math.floor(Math.random() * layouts.length)];
          }
          const color = getCharColor();
          for (const pos of lastPlaced) {
            const cd = charData[pos.charIdx];
            ctx.save();
            ctx.font = cd.fontStr; ctx.fillStyle = color;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.translate(pos.cx, pos.cy); ctx.rotate(pos.angle);
            ctx.fillText(cd.ch, -cd.offX, -cd.offY);
            ctx.restore();
          }
        }
        drawLayout();
        setInterval(() => drawLayout(false), 3000);
        // theme 切換時即時重繪（保持當前 layout 不洗牌）
        window.addEventListener('theme:changed', () => drawLayout(true));
      };
    });
  });
}

// ── 漂浮動畫 ──────────────────────────────────────────────────

function initYTCardFloat(ytCard) {
  const section  = ytCard.parentElement;
  const cardW    = ytCard.offsetWidth  || 160;
  const cardH    = ytCard.offsetHeight || 160;
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

  function tick() {
    if (!frozen) {
      x += vx; y += vy;
      const cw = section.clientWidth, ch = section.clientHeight;
      if (x > cw + 10) x = -cardW; else if (x < -cardW) x = cw + 10;
      if (y > ch + 10) y = -cardH; else if (y < -cardH) y = ch + 10;
      ytCard.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  ytCard.addEventListener('mouseenter', () => { frozen = true; });
  ytCard.addEventListener('mouseleave', () => { frozen = false; });
}

// ── 點擊展開影片 ──────────────────────────────────────────────

function initYTCardClick(ytCard, player) {
  const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];

  ytCard.addEventListener('mouseenter', () => applyNewsHover());
  ytCard.addEventListener('mouseleave', () => removeNewsHover());

  ytCard.addEventListener('click', () => {
    const rect    = ytCard.getBoundingClientRect();
    const cardCx  = rect.left + rect.width  / 2;
    const cardCy  = rect.top  + rect.height / 2;
    const vW = window.innerWidth, vH = window.innerHeight;
    const maxDist = Math.max(...[[0,0],[vW,0],[0,vH],[vW,vH]].map(([cx,cy]) => Math.hypot(cx - cardCx, cy - cardCy)));
    const targetScale = (maxDist / (rect.width / 2)) * 2.2;

    const clone = document.createElement('div');
    clone.style.cssText = `position:fixed; left:${cardCx}px; top:${cardCy}px; width:${rect.width}px; height:${rect.height}px; margin-left:${-rect.width/2}px; margin-top:${-rect.height/2}px; background:#000; border-radius:50%; z-index:10001; transform:scale(1); transform-origin:center center;`;
    document.body.appendChild(clone);

    gsap.to(clone, {
      scale: targetScale, duration: 0.8, ease: 'expo.inOut',
      onComplete: () => {
        clone.remove();
        player?.openPlayer({ accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] });
      }
    });
  });
}

// ── 主入口 ────────────────────────────────────────────────────

export function initYTCard() {
  const ytCard    = document.getElementById('homepage-yt-card');
  const ytCharsEl = document.getElementById('homepage-yt-chars');
  if (!ytCard) return;

  initYTCardFloat(ytCard);
  initWatchChars(ytCharsEl);

  fetch('data/news.json')
    .then(r => r.json())
    .then(data => {
      if (!data?.videoUrl) return;
      const player = initVideoPlayer(data.videoUrl);
      initYTCardClick(ytCard, player);
    }).catch(() => {});
}
