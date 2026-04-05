/**
 * Index Page - Marquee + Poster
 * 首頁跑馬燈與海報展開邏輯
 */

import { applyNewsHover, removeNewsHover } from '../animations/floating-items.js';

export function initMarquee() {
  fetch('data/news.json')
    .then(r => r.json())
    .then(data => {
      const text    = data?.marquee || '';
      const newsUrl = data?.newsUrl || '#';

      const textEl    = document.getElementById('homepage-marquee-text');
      const cloneEl   = document.getElementById('homepage-marquee-clone');
      const inner     = document.querySelector('.homepage-marquee-inner');
      const wrap      = document.getElementById('homepage-marquee-wrap');
      const link      = document.getElementById('homepage-marquee-link');
      const poster    = document.getElementById('homepage-marquee-poster');
      const posterImg = document.getElementById('homepage-marquee-poster-img');
      if (!wrap || !textEl || !cloneEl) return;

      textEl.textContent  = text;
      cloneEl.textContent = text;
      const duration = Math.max(16, text.length * 0.36);
      if (inner) inner.style.animationDuration = `${duration}s`;
      if (link)  link.href = newsUrl;

      const LONG  = 600;
      const SHORT = 300;
      const isLandscape = Math.random() < 0.5;
      const marqueeW = isLandscape ? LONG : SHORT;

      const posterSrc = isLandscape
        ? 'images/Degree Show.jpg'
        : 'images/2021-動畫-Pitch-Bible-01.png';
      if (posterImg) posterImg.src = posterSrc;

      wrap.style.width = `${marqueeW}px`;

      const section = wrap.parentElement;
      const sW = section.clientWidth;
      const sH = section.clientHeight;
      const padding  = 48;
      const headerH  = document.querySelector('#site-header header')?.offsetHeight || 80;
      const topClear = headerH + 16;
      const maxX = sW - marqueeW - padding;
      const maxY = sH - topClear - 40 - padding;
      wrap.style.left      = `${padding + Math.random() * Math.max(0, maxX)}px`;
      wrap.style.top       = `${topClear + Math.random() * Math.max(0, maxY)}px`;
      wrap.style.transform = `rotate(${SCCDHelpers.getRandomRotation()}deg)`;

      if (poster) {
        const estimatedPosterH = isLandscape
          ? Math.round(marqueeW * (2 / 3))
          : Math.round(marqueeW * (4 / 3));

        posterImg.onload = () => {
          poster.dataset.posterH = Math.round(posterImg.naturalHeight / posterImg.naturalWidth * marqueeW);
        };

        wrap.addEventListener('mouseenter', () => {
          const wrapRect    = wrap.getBoundingClientRect();
          const sectionRect = section.getBoundingClientRect();
          const posterH     = parseInt(poster.dataset.posterH || estimatedPosterH);
          const spaceBelow  = sectionRect.bottom - wrapRect.bottom;

          if (spaceBelow >= posterH) {
            poster.style.top    = '100%';
            poster.style.bottom = '';
          } else {
            poster.style.bottom = '100%';
            poster.style.top    = '';
          }
          poster.style.width     = `${marqueeW}px`;
          poster.style.maxHeight = `${posterH + 20}px`;
          applyNewsHover();
        });

        wrap.addEventListener('mouseleave', () => {
          poster.style.maxHeight = '0';
          removeNewsHover();
        });

        poster.addEventListener('click', () => window.open(newsUrl, '_blank'));
        poster.style.cursor = 'pointer';
      }
    }).catch(() => {});
}
