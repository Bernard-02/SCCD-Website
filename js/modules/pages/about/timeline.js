// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Timeline Module (About Page)
 * 卷軸概念：每年 5 張照片，第 1 張 = 上一年第 5 張，第 5 張 = 下一年第 1 張
 * 100vh 分成 5 個 bar（各 20vh），每張圖片佔一個 bar
 * 照片大小 15~40vw，clip-path 只做一次
 */

import { registerPageExit } from '../../ui/page-exit.js';
import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { bindArrowSpin } from '../../ui/arrow-spin.js';
import { whenImgReady } from '../../ui/img-ready.js';
import { loadHistory } from './history-source.js';
import { loadUiLabels, applyUiLabels } from '../../ui/ui-labels.js';

export function initTimeline() {
  const area = document.getElementById('timeline-area');
  const strip = document.getElementById('timeline-strip');
  const navLeft = document.getElementById('timeline-nav-left');
  const navRight = document.getElementById('timeline-nav-right');

  if (!area || !strip || !navLeft || !navRight) return;

  // --- 動畫時長 / easing 常數 ---
  const TIMING = {
    // 入場 reveal（clip-path 展開）
    revealDuration: 1.0,
    revealEase: 'power3.out',
    stagger: 0.08,
    // 退場（clip-path 收起）
    exitDuration: 0.5,
    exitEase: 'power2.in',
    // 字卡 reveal（切頁後入場）
    cardRevealDuration: 0.6,
    // 卷軸橫移
    stripSlideDuration: 0.8,
    stripSlideEase: 'power2.inOut',
    // Photo raise/lower clip 週期
    photoClipDuration: 0.5,
    photoClipEase: 'power2.inOut',
    // 邊界照片 dim/undim
    dimDuration: 0.3,
    // Reveal 完成後才開放 hover（= revealDuration + 5 * stagger）
    hoverEnableDelay: 1.4,
    // mouseleave → leaveAllHover 的 debounce（ms）
    leaveDebounceMs: 50,
    // resetTimeline 後第一年 reveal 的起始延遲
    firstRevealDelay: 0.3,
  };

  // --- 工具函數 ---
  const ACCENT_COLORS = (() => {
    const s = getComputedStyle(document.documentElement);
    return [
      s.getPropertyValue('--color-green').trim(),
      s.getPropertyValue('--color-pink').trim(),
      s.getPropertyValue('--color-blue').trim(),
    ];
  })();

  let lastColorIndex = -1;
  function randomColor() {
    let i;
    do { i = Math.floor(Math.random() * ACCENT_COLORS.length); } while (i === lastColorIndex);
    lastColorIndex = i;
    return ACCENT_COLORS[i];
  }

  function pickUniqueRotations(n, min, max) {
    const pool = [];
    for (let i = min; i <= max; i++) { if (i !== 0) pool.push(i); }
    const picked = [];
    const copy = [...pool];
    while (picked.length < n && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      picked.push(copy.splice(idx, 1)[0]);
    }
    return picked;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --- clip-path ---
  const CLIP_END = 'inset(0% 0% 0% 0%)';
  const ALL_DIRS = ['top', 'bottom', 'left', 'right'];
  function getClipStart(dir) {
    switch (dir) {
      case 'top':    return 'inset(0% 0% 100% 0%)';
      case 'bottom': return 'inset(100% 0% 0% 0%)';
      case 'left':   return 'inset(0% 100% 0% 0%)';
      case 'right':  return 'inset(0% 0% 0% 100%)';
      default:       return 'inset(0% 100% 0% 0%)';
    }
  }
  function randomDir4() { return ALL_DIRS[Math.floor(Math.random() * 4)]; }
  function randomDirLR() { return Math.random() < 0.5 ? 'left' : 'right'; }

  // 桌面照片條 clip-reveal 滑動藏定位（2026-08-17 由 clip-path 改；±110 過衝防 dpr hairline）：
  // rotateDiv（overflow:hidden＋承載旋轉）＝現成遮罩，滑動對象是其子 aspectDiv
  const SLIDE_HIDE = {
    top:    { xPercent: 0, yPercent: -110 },
    bottom: { xPercent: 0, yPercent: 110 },
    left:   { xPercent: -110, yPercent: 0 },
    right:  { xPercent: 110, yPercent: 0 },
  };

  // ── List view「黑卡」(.tl-list-chip) hero clip-reveal — 對齊 library 左上角 .lib-panel-title
  // 的 playPanelTitleReveal/Exit（library-panels.js），user 2026-08-04 指定改成同款。
  // chip 本體 translate 沿旋轉軸滑入 + 同向 clip-path inset 同步收，取代舊的「跟 rect 一起純 clip stagger」。
  // 見 reference_hero_clipreveal_translate_ok_with_transform_rotate / reference_gsap_translate_string_needs_matching_units。
  const CHIP_ENTER_CLIP = {
    top:    'inset(100% 0% 0% 0%)',
    bottom: 'inset(0% 0% 100% 0%)',
    left:   'inset(0% 0% 0% 100%)',
    right:  'inset(0% 100% 0% 0%)',
  };
  // 沿「較短邊」隨機（chip 寬>高 → top/bottom，滑距=矮邊高，小而穩，不會「從很遠飛進來」）
  function pickChipDir(el) {
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const pair = w >= h ? ['top', 'bottom'] : ['left', 'right'];
    return pair[Math.random() < 0.5 ? 0 : 1];
  }
  // 讀 computed transform matrix 取旋轉角（.tl-list-chip 的 rotate 寫死在 CSS，不是 inline style，
  // 用 getComputedStyle 才抓得到；跟 library titleHiddenTranslate 讀 el.style.transform 不同）。
  function chipHiddenTranslate(el, dir) {
    const cs = getComputedStyle(el).transform;
    let th = 0;
    if (cs && cs !== 'none') {
      const m = cs.match(/matrix\(([^,]+),([^,]+),/);
      if (m) th = Math.atan2(parseFloat(m[2]), parseFloat(m[1]));
    }
    const c = Math.cos(th), s = Math.sin(th);
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const v = { top: [h * s, -h * c], bottom: [-h * s, h * c], left: [-w * c, -w * s], right: [w * c, w * s] }[dir];
    return `${v[0].toFixed(2)}px ${v[1].toFixed(2)}px`;
  }
  function revealChip(el, dur, ease) {
    if (typeof gsap === 'undefined') { el.style.clipPath = ''; el.style.translate = ''; return; }
    const dir = pickChipDir(el);
    gsap.fromTo(el,
      { clipPath: CHIP_ENTER_CLIP[dir], translate: chipHiddenTranslate(el, dir) },
      { clipPath: CLIP_END, translate: '0px 0px', duration: dur, ease, overwrite: true,
        onComplete: () => { el.style.clipPath = ''; el.style.translate = ''; } });
  }
  function exitChip(el, dur, ease, onDone) {
    if (typeof gsap === 'undefined') { if (onDone) onDone(); return; }
    const dir = pickChipDir(el);
    // fromTo 顯式起點：reveal onComplete 已 clearProps，computed clipPath=none 時 gsap.to 從 none 補間會 snap
    gsap.fromTo(el,
      { clipPath: CLIP_END, translate: '0px 0px' },
      { clipPath: CHIP_ENTER_CLIP[dir], translate: chipHiddenTranslate(el, dir), duration: dur, ease, overwrite: true,
        onComplete: onDone });
  }

  // list 矩形 clip-reveal＝外層遮罩內純位移（隨機 4 向），非 clip-path 擦除、非整塊飛入（user 定義的 clip-reveal）
  const RSLIDE_DIRS = ['top', 'bottom', 'left', 'right'];
  const rslideShown = { xPercent: 0, yPercent: 0 };
  const rslideHidden = (dir) => dir === 'top' ? { xPercent: 0, yPercent: -110 }
    : dir === 'bottom' ? { xPercent: 0, yPercent: 110 }
    : dir === 'left' ? { xPercent: -110, yPercent: 0 }
    : { xPercent: 110, yPercent: 0 }; // right
  const randRslideDir = () => RSLIDE_DIRS[Math.floor(Math.random() * RSLIDE_DIRS.length)];

  // --- Fetch & Build ---
  // division 值＝ui_labels key（如 history.division.bfa，2026-09-11 由字面改成集中名稱）→ 渲染 en/zh 兩 span，
  // 由 applyUiLabels 填字＝改一個 ui_labels row 全年表跟著變（斷線退本地 ui-labels.json）；
  // 舊資料若還是字面（無 '.'）→ 原樣顯示，兼容未遷移狀態。
  function divisionHtml(div) {
    if (!div.includes('.')) return div;
    return `<span data-label-key="${div}" data-label-part="en"></span> <span data-label-key="${div}" data-label-part="zh"></span>`;
  }

  // 結構化資料（era → entries）→ 舊 per-year shape（descriptions HTML 陣列）：timeline 內部渲染沿用。
  // 中英說明一律 regular（h5 小標/年份維持粗體）
  function buildYearItems(eras) {
    const items = [];
    eras.forEach(era => {
      let cur = null;
      let curDivision = null;
      (era.entries || []).forEach(en => {
        if (!cur || cur.year !== en.year) {
          cur = { year: en.year, eraTitle: era.eraEn, eraLabel: era.eraZh, descriptions: [] };
          curDivision = null;
          items.push(cur);
        }
        const head = en.division && en.division !== curDivision
          ? `<h5 class="mb-sm">${divisionHtml(en.division)}</h5>` : '';
        if (en.division) curDivision = en.division;
        cur.descriptions.push(`${head}<div class="font-regular mb-en-zh-body">${en.en}</div><div class="font-regular" lang="zh-Hant">${en.zh}</div>`);
      });
    });
    return items;
  }

  loadHistory()
    .then(({ eras, images }) => {
      const items = buildYearItems(eras);
      if (items.length > 0 && images.length > 0) {
        // 全視口單一版本（2026-09-05：手機/矮橫向的 buildMobile 退役）：照片 marquee + list view
        // popup，手機開文字卡遮住 marquee、圖片照跑（buildStrip 本來就不暫停 marquee）。
        buildStrip(items, images);
      }
    })
    .catch(err => console.error('Timeline error:', err));

  // 桌面版：照片自動捲動 marquee（user 2026-08-06 改版）
  // 舊版是「左右分頁導航 + 疊加 era/年份字卡 + slot4 半透明預覽 + hover 抬升」，全部移除；
  // 現在照片無縫由右往左自動捲（速度對齊 awards ticker 80px/s），字卡改成左下角鈕開關的 list view popup。
  function buildStrip(items, images) {
    // 手機/矮橫向：整段塞進「anchor strip 落點(178) 以下的一屏」。178 = #history scroll-margin-top
    //（scroll-snap.css，讓出 sticky strip 底 179）；配 portrait #history padding 歸零（lists.css），
    // section=area 剛好 landing→viewport 底、控制鈕不出畫面。svh 免手機工具列高估溢出。
    // 矮橫向此值只當 flex-basis（landscape.css #history/#timeline-area flex 撐滿覆寫）。
    // ⚠️ 必須在讀 area.offsetHeight（下方 pageH）之前設，否則照片以舊高度算佈局。
    if (window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
      area.style.height = 'calc(100svh - 178px)';
    }
    const pageW = area.offsetWidth;
    const pageH = area.offsetHeight;
    const vw = pageW / 100;
    // 直向手機（<768）：照片放大近全幅（60~85vw、一屏至少一張）；垂直改「兩行」交替上下排（見下方
    // photoTopsVH），用滿高螢幕的上下空間（user 2026-09-06）。橫向鋪排「跨幅」SPAN 200vw（桌面 100）——
    // 兩行有垂直分離、可比一行密些而不疊成一坨。桌面（5-bar collage）原樣。
    const bigPhoto = window.innerWidth < 768;
    const SPAN = bigPhoto ? 200 : 100;      // 每個 item 的橫向鋪排跨幅（vw 單位）
    const itemW = pageW * SPAN / 100;       // 每 item 佔 px 寬＝marquee 步距（桌面 = pageW）
    // 手機 55~72：一輪 45~62 被 user 嫌太小（09-10 二輪「再大一點」）、原 60~85 又疊成坨——
    // 取中間值：夠大、相鄰仍只輕度交疊不成坨
    const PHOTO_MIN_VW = bigPhoto ? 55 : 30;
    const PHOTO_MAX_VW = bigPhoto ? 72 : 50;
    const totalW = items.length * itemW;

    // 自動捲動取代分頁導航：nav zones 停用
    navLeft.style.display = 'none';
    navRight.style.display = 'none';

    strip.style.width = `${totalW}px`;
    strip.style.height = '100%';

    const yPadVH = 8;
    const usableH_VH = 100 - yPadVH * 2;
    const BAR_H_VH = usableH_VH / 5;

    const allRotates = []; // 所有照片 rotateDiv，供進場 clip-reveal
    let imgIdx = 0; // 照片與年份脫鉤（2026-08-11）：每個 slot 依序取 about_history_images，不足循環

    items.forEach((item, index) => {
      const ox = index * itemW;
      const isFirst = index === 0;
      const isLast = index === items.length - 1;

      const photoRots = pickUniqueRotations(5, -4, 4);
      const edgeZs = shuffle([1, 2]);
      const middleZs = shuffle([3, 4, 5]);
      const photoZs = [edgeZs[0], middleZs[0], middleZs[1], middleZs[2], edgeZs[1]];

      let barAssign;
      for (let attempt = 0; attempt < 50; attempt++) {
        barAssign = shuffle([0, 1, 2, 3, 4]);
        let monotonic = false;
        for (let i = 0; i <= 2; i++) {
          const a = barAssign[i], b = barAssign[i+1], c = barAssign[i+2];
          if ((a < b && b < c) || (a > b && b > c)) { monotonic = true; break; }
        }
        if (!monotonic) break;
      }

      const photoSizes = [];
      for (let p = 0; p < 5; p++) {
        photoSizes.push(PHOTO_MIN_VW + Math.random() * (PHOTO_MAX_VW - PHOTO_MIN_VW));
      }

      const photoHsVH = photoSizes.map(w => (w * 9 / 16) * (pageW / pageH));

      const s0Left = -(photoSizes[0] * (0.3 + Math.random() * 0.3));
      const s4Right = SPAN + photoSizes[4] * (0.3 + Math.random() * 0.3);

      const chainSpan = s4Right - s0Left;
      const totalPhotoW = photoSizes.reduce((a, b) => a + b, 0);
      const totalOverlap = totalPhotoW - chainSpan;

      const overlaps = [];
      if (totalOverlap > 0) {
        let remaining = totalOverlap;
        for (let i = 0; i < 3; i++) {
          const avg = remaining / (4 - i);
          const ov = Math.max(1, avg * (0.5 + Math.random()));
          overlaps.push(ov);
          remaining -= ov;
        }
        overlaps.push(Math.max(1, remaining));
      } else {
        let deficit = -totalOverlap + 20;
        for (let i = 0; i < 5 && deficit > 0; i++) {
          const add = Math.min(deficit, PHOTO_MAX_VW - photoSizes[i]);
          photoSizes[i] += add;
          deficit -= add;
        }
        const newTotal = photoSizes.reduce((a, b) => a + b, 0);
        const newOverlap = newTotal - chainSpan;
        let rem = newOverlap;
        for (let i = 0; i < 3; i++) {
          const avg = rem / (4 - i);
          const ov = Math.max(1, avg * (0.5 + Math.random()));
          overlaps.push(ov);
          rem -= ov;
        }
        overlaps.push(Math.max(1, rem));
      }

      const photoLeftsVW = [];
      photoLeftsVW[0] = s0Left;
      for (let p = 1; p < 5; p++) {
        photoLeftsVW[p] = photoLeftsVW[p - 1] + photoSizes[p - 1] - overlaps[p - 1];
      }

      for (let p = 1; p <= 3; p++) {
        const minLeft = 5;
        const maxLeft = SPAN - 5 - photoSizes[p];
        photoLeftsVW[p] = Math.max(minLeft, Math.min(photoLeftsVW[p], maxLeft));
      }

      const photoTopsVH = [];
      if (bigPhoto) {
        // 手機兩行：照片交替上/下排。行心收攏 40/60（原 26/74 貼上下緣）＝整體集中在畫面中段、
        // 兩行偶爾輕碰（user 2026-09-10「兩 row 集中在畫面中間、可互相交曡」）。
        // 不跑下方桌面的「垂直觸碰連接」——那是把 collage 照片黏成一片，兩行要保持上下分離。
        const ROW_CENTER_VH = [40, 60];   // 上排 / 下排中心
        for (let p = 0; p < 5; p++) {
          const h = photoHsVH[p];
          const jitter = (Math.random() - 0.5) * 8;
          let top = ROW_CENTER_VH[p % 2] - h / 2 + jitter;
          top = Math.max(2, Math.min(top, 98 - h));
          photoTopsVH[p] = top;
        }
      } else {
        for (let p = 0; p < 5; p++) {
          const bar = barAssign[p];
          const barCenterVH = yPadVH + (bar + 0.5) * BAR_H_VH;
          const h = photoHsVH[p];
          const jitter = (Math.random() - 0.5) * BAR_H_VH * 0.6;
          let top = barCenterVH - h / 2 + jitter;
          top = Math.max(-0.7 * h, Math.min(top, 100 - h));
          photoTopsVH[p] = top;
        }

        for (let p = 1; p < 5; p++) {
          const prevTop = photoTopsVH[p - 1];
          const prevBottom = prevTop + photoHsVH[p - 1];
          const currTop = photoTopsVH[p];
          const currBottom = currTop + photoHsVH[p];
          const yOverlap = Math.min(prevBottom, currBottom) - Math.max(prevTop, currTop);
          if (yOverlap < 0) {
            const touchOverlap = 1 + Math.random() * 3;
            if (currTop > prevBottom) {
              photoTopsVH[p] = prevBottom - touchOverlap;
            } else {
              photoTopsVH[p] = prevTop - photoHsVH[p] + touchOverlap;
            }
            const h = photoHsVH[p];
            photoTopsVH[p] = Math.max(-0.7 * h, Math.min(photoTopsVH[p], 100 - h));
          }
        }
      }

      // 建立 DOM（照片 only；原疊加字卡/era badge 已移除）。
      // slot0 只在第一年建（其餘年 slot0 = 前一年 slot4，共用邊界照片不重複）；slot4 每年都建、
      // 含最後一年 → 其右邊界照片凸出 strip 尾端，跟 clone 首年 slot0 交疊 → 首尾接縫無縫、不留空格（user 2026-08-06）。
      for (let p = 0; p < 5; p++) {
        if (p === 0 && !isFirst) continue;

        const photoVW = photoSizes[p];
        const photoLeft = ox + photoLeftsVW[p] * vw;
        const topVH = photoTopsVH[p];

        const photo = document.createElement('div');
        photo.className = 'timeline-photo';
        photo.style.cssText = `position:absolute; width:${photoVW}vw; left:${photoLeft}px; top:${topVH}%; z-index:${photoZs[p]};`;

        const rotateDiv = document.createElement('div');
        rotateDiv.style.cssText = `overflow:hidden; transform:rotate(${photoRots[p]}deg);`;

        const aspectDiv = document.createElement('div');
        aspectDiv.style.cssText = 'aspect-ratio:16/9; overflow:hidden;';

        const img = document.createElement('img');
        img.decoding = 'async';   // 反射成 attribute → 下方 cloneNode(true) 會帶著
        img.src = images[imgIdx++ % images.length];
        img.alt = '';
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';

        aspectDiv.appendChild(img);
        rotateDiv.appendChild(aspectDiv);
        photo.appendChild(rotateDiv);
        strip.appendChild(photo);

        allRotates.push(rotateDiv);
      }
    });

    // ── 無縫自動捲動 marquee ──────────────────────────────────────
    // 複製整條 strip 接在尾端（left = totalW），兩份一起左移；modifier wrap 把 x 收在 [-totalW, 0]，
    // 兩份內容相同 → 任一時刻可見區都被其中一份覆蓋、交棒無縫。速度對齊 awards ticker（80px/s）。
    const clone = strip.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.left = `${totalW}px`;
    strip.parentNode.appendChild(clone);
    const cloneRotates = Array.from(clone.querySelectorAll('.timeline-photo > div'));

    // revealTargets＝各照片的 rotateDiv 遮罩；動畫對象是其子 aspectDiv（clip-reveal 滑動）
    const revealTargets = [...allRotates, ...cloneRotates];
    if (typeof gsap !== 'undefined') {
      revealTargets.forEach(el => gsap.set(el.firstElementChild, SLIDE_HIDE[randomDir4()]));
    }

    let marqueeStarted = false;
    let marqueeTween = null;
    let exited = false;   // 離頁旗標：擋仍在 pending 的 decode-gate reveal，免退場中又補揭一張
    function startMarquee() {
      if (typeof gsap === 'undefined' || marqueeStarted) return;
      marqueeStarted = true;
      const wrapX = gsap.utils.wrap(-totalW, 0);
      marqueeTween = gsap.to([strip, clone], {
        x: `-=${totalW}`, ease: 'none', duration: totalW / 80, repeat: -1,
        modifiers: { x: (x) => `${wrapX(parseFloat(x))}px` },
      });
    }

    function revealAll() {
      if (typeof gsap !== 'undefined') {
        revealTargets.forEach((el, i) => {
          const inner = el.firstElementChild;      // aspectDiv＝clip-reveal 滑動對象（rotateDiv 遮罩內平移）
          const img = el.querySelector('img');
          // 圖 decode 完才滑入（clip-reveal），不空框先滑入、圖再閃出（user 2026-09-11）；離頁後不補揭
          const run = () => { if (!exited) gsap.to(inner, { xPercent: 0, yPercent: 0, duration: TIMING.revealDuration, ease: TIMING.revealEase, delay: (i % 24) * TIMING.stagger }); };
          whenImgReady(img).then(run);
        });
      }
      startMarquee();
    }
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: area, start: 'top 80%', once: true, onEnter: revealAll });
    } else {
      revealAll();
    }

    // 離頁退場：freeze 當前 marquee 畫面（暫停無限捲動 tween）→ 可見照片各自隨機 4 向滑出遮罩
    //（2026-08-17 由 clip-path 改 clip-reveal，同全站圖片語彙）。遮罩 rect 不受子層滑動影響 → 可見性照量遮罩。
    registerPageExit(() => new Promise(resolve => {
      exited = true;   // 阻止仍 pending 的 decode-gate reveal 於退場中補揭
      if (typeof gsap === 'undefined' || !marqueeStarted) { resolve(); return; }
      if (marqueeTween) marqueeTween.pause();  // 凍結當前畫面
      const vh = window.innerHeight || 0;
      const visible = revealTargets.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < vh;
      });
      if (!visible.length) { resolve(); return; }
      let done = 0;
      const onOne = () => { if (++done >= visible.length) resolve(); };
      visible.forEach(el => {
        gsap.killTweensOf(el.firstElementChild);
        gsap.to(el.firstElementChild, { ...SLIDE_HIDE[randomDir4()], duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
      });
    }));

    // ── List View（era 卡片；桌機）── 背景照片持續捲動，list view 疊在上面可開關 ──
    const eraGroups = [];
    const eraIndexByKey = {};
    items.forEach(it => {
      const key = `${it.eraTitle}|${it.eraLabel}`;
      if (eraIndexByKey[key] === undefined) {
        eraIndexByKey[key] = eraGroups.length;
        eraGroups.push({ title: it.eraTitle, label: it.eraLabel, years: [] });
      }
      eraGroups[eraIndexByKey[key]].years.push(it);
    });

    let listMode = false;
    let listAnimating = false;

    const listBtn = document.createElement('button');
    listBtn.id = 'timeline-list-btn';
    listBtn.setAttribute('aria-label', '切換清單視圖');
    listBtn.innerHTML = '<span class="tl-icon-btn-inner"><span class="icon icon-atlas-list"></span></span>';
    // 放進與 list 卡同款 20-col grid → 對齊 col-5 左緣（list 卡從 col-6，見 lists.css .tl-list-cell）
    const btnGrid = document.createElement('div');
    btnGrid.className = 'tl-list-btn-grid';
    btnGrid.appendChild(listBtn);
    area.appendChild(btnGrid);
    // icon 固定三條線 icon-atlas-list、開/關不換 glyph（user 2026-09-10；舊 icon-atlas-view 互換＋clip-reveal swap 已撤）
    // hover/click 隨機角度（arrow-spin，全站箭頭統一 −4~+6；取代 lists.css 舊 :hover +8° 固定角）。
    // 轉 inner 黑方塊；鈕跨開合共用同一顆→定案角自然留住
    const listBtnInner = /** @type {HTMLElement|null} */ (listBtn.querySelector('.tl-icon-btn-inner'));
    if (listBtnInner) bindArrowSpin(listBtn, (/** @type {number} */ d) => { listBtnInner.style.transform = `rotate(${d}deg)`; });

    const listView = document.createElement('div');
    listView.id = 'timeline-list-view';
    listView.style.display = 'none';
    // 連續清單（2026-09-08 user 改版）：所有時期一路往下捲、無切換箭頭；era 移到左欄（.tl-era-label）＝
    // 「era｜年份｜說明」三欄，取代舊的「單一 era 標頭 + 右箭頭 loop」。
    listView.innerHTML =
      '<div class="tl-list-grid"><div class="tl-list-cell">' +
        '<div class="tl-list-rect timeline-card-inner"><div class="tl-list-content">' +
          '<div class="tl-list-years list-scroll"></div>' +
        '</div></div>' +
      '</div></div>';
    area.appendChild(listView);

    const listRect = listView.querySelector('.tl-list-rect');
    const listContent = listView.querySelector('.tl-list-content');
    const listYears = listView.querySelector('.tl-list-years');
    const rectEls = [listRect];

    // 矩形 clip-reveal 用外層遮罩：吃 rect 桌面定位 + overflow:clip；rect 填滿遮罩內部、退進場純位移滑動。
    // 桌面 buildStrip only。（next 鈕已移除 → 不再留 right:24 空位，卡片填滿整格）
    const rectMask = document.createElement('div');
    rectMask.style.cssText = 'position:absolute; top:0; bottom:0; left:0; right:0; overflow:clip;';
    listRect.parentNode.insertBefore(rectMask, listRect);
    rectMask.appendChild(listRect);
    listRect.style.cssText += ';top:0; bottom:0; left:0; right:0;'; // 填滿遮罩（蓋掉 CSS right:24px）

    const descParser = document.createElement('div');
    function splitDesc(d) {
      descParser.innerHTML = d;
      let heading = '';
      const divs = [];
      [...descParser.children].forEach(ch => {
        if (ch.tagName === 'H5') heading += ch.outerHTML;
        else divs.push(ch);
      });
      const en = divs[0] ? divs[0].innerHTML : '';
      const zh = divs.length > 1 ? divs.slice(1).map(x => x.innerHTML).join('<br>') : '';
      return { heading, en, zh };
    }

    // 全時期連續渲染：每個 era 一組（左欄 era 標籤 + 右側年份列）；年份不再 bold（user 2026-09-08）。
    function renderAllEras() {
      listYears.innerHTML = eraGroups.map(era => {
        const rows = era.years.map(y => {
          const descs = y.descriptions || (y.description ? [y.description] : []);
          const blocks = descs.map(d => {
            const { heading, en, zh } = splitDesc(d);
            return '<div class="tl-list-block">' + heading +
              '<div class="tl-list-cols">' +
                `<div class="tl-list-en">${en}</div>` +
                `<div class="tl-list-zh" lang="zh-Hant">${zh}</div>` +
              '</div></div>';
          }).join('');
          return '<div class="tl-list-year-row">' +
            `<div class="tl-list-year text-s font-regular">${y.year}</div>` +
            `<div class="tl-list-year-body text-s font-regular">${blocks}</div>` +
          '</div>';
        }).join('');
        return '<div class="tl-era-group">' +
          `<div class="tl-era-label text-s font-bold"><span class="tl-era-en">${era.title}</span><span class="tl-era-zh" lang="zh-Hant">${era.label}</span></div>` +
          `<div class="tl-era-body">${rows}</div>` +
        '</div>';
      }).join('');
      listYears.scrollTop = 0;
      // 學制 h5 的 data-label-key span 是這裡才建（async）→ page-init 的 applyUiLabels 抓不到，這裡補跑一次
      //（loadUiLabels single-flight 快取，共用頁面已載的 map；斷線退本地 ui-labels.json）
      loadUiLabels().then(map => applyUiLabels(map, listView));
    }

    // 手機兩層 sticky（era 標籤釘頂 + 年份釘標籤下方）：量每個 era 的標籤實高寫進該組 --tl-era-label-h，
    // 年份的 sticky top 用它 → 標籤長短不一時年份接得剛好（房規：多層 sticky offset 量高寫 var）。
    // 桌機清掉（era/年份各自成欄，走 CSS top:0）。需 display:block 後才量得到高度。
    function measureStickyOffsets() {
      const mobile = window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
      listView.querySelectorAll('.tl-era-group').forEach(g => {
        if (!mobile) { g.style.removeProperty('--tl-era-label-h'); return; }
        const label = g.querySelector('.tl-era-label');
        if (label) g.style.setProperty('--tl-era-label-h', `${Math.ceil(label.getBoundingClientRect().height)}px`);
      });
    }

    function showListView() {
      if (listAnimating || listMode || typeof gsap === 'undefined') return;
      listAnimating = true;
      listMode = true;
      const cardColor = randomColor();              // 整卡單一 accent（mode3 由 color.css 覆成 strict B/W）
      listRect.style.background = cardColor;
      listRect.style.setProperty('--tl-card-bg', cardColor);  // 手機 sticky 頭（era 標籤/年份）的不透明底（見 lists.css）
      renderAllEras();
      listView.style.display = 'block';
      requestAnimationFrame(measureStickyOffsets);            // 等 layout flush 才量得到標籤高
      if (document.fonts?.ready) document.fonts.ready.then(measureStickyOffsets);  // 中文字體晚載入會改高 → 重量
      gsap.set(rectEls, rslideHidden(randRslideDir()));
      gsap.to(rectEls, {
        ...rslideShown, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase,
        onComplete: () => { listAnimating = false; },
      });
    }

    function hideListView() {
      if (listAnimating || !listMode) return;
      listAnimating = true;
      gsap.to(rectEls, {
        ...rslideHidden(randRslideDir()), duration: TIMING.exitDuration, ease: TIMING.exitEase,
        onComplete: () => { listView.style.display = 'none'; listMode = false; listAnimating = false; },
      });
    }

    listBtn.addEventListener('click', () => { if (listMode) hideListView(); else showListView(); });

    // 離頁退場：list view 開著時收掉矩形（era 標籤/年份都在矩形內、隨矩形一起收）；否則直接放行（背景照片隨換頁 swap 掉）
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined' || !listMode) { resolve(); return; }
      gsap.killTweensOf(rectEls);
      gsap.to(listRect, { ...rslideHidden(randRslideDir()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: resolve });
    }));

    // 離頁退場：桌面 list 切換鈕（把說明叫出來的 btn）的黑方塊 inner 做出場
    //（hero clip-reveal，同 library 黑卡；exitChip 讀 CSS rotate 算沿自身軸位移）。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const inners = [listBtn]
        .map(b => b && b.querySelector('.tl-icon-btn-inner'))
        .filter(el => el && el.offsetParent !== null);
      if (!inners.length) { resolve(); return; }
      let done = 0;
      const onOne = () => { if (++done >= inners.length) resolve(); };
      inners.forEach(el => { gsap.killTweensOf(el); exitChip(el, TIMING.exitDuration, TIMING.exitEase, onOne); });
    }));

    // 預設展開左側 list（about history 一進頁即開，非等點擊）
    showListView();
  }
}
