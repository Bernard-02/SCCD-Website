// @ts-nocheck — querySelector 密集，全為 TS2339 Element vs HTMLElement 雜訊
/**
 * Timeline Module (About Page)
 * 卷軸概念：每年 5 張照片，第 1 張 = 上一年第 5 張，第 5 張 = 下一年第 1 張
 * 100vh 分成 5 個 bar（各 20vh），每張圖片佔一個 bar
 * 照片大小 15~40vw，clip-path 只做一次
 */

import { registerPageExit } from '../../ui/page-exit.js';
import { registerPageCleanup } from '../../ui/page-cleanup.js';
import { createClassImagesSlideshow } from './class-images-slideshow.js';
import { loadHistory } from './history-source.js';

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
  // 結構化資料（era → entries）→ 舊 per-year shape（descriptions HTML 陣列）：timeline 內部渲染沿用。
  // division 存的就是顯示字串（如「BFA 學士班」，2026-08-11 二改）→ h5 照字面渲染，
  // 之後後台學制下拉加新選項前台零改碼；中英說明一律 regular（h5 小標/年份維持粗體）
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
          ? `<h5 class="mb-sm">${en.division}</h5>` : '';
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
        // 手機與矮橫向（landscape gate，同 landscape.css）走簡化視圖（卡片 + slideshow + 箭頭切年 + list 鈕），
        // 桌面 strip 整套不建構；矮橫向的四欄 grid 佈局由 landscape.css 5i++ 覆蓋（user 2026-07-07）
        if (window.innerWidth < 768 || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) buildMobile(items, images);
        else buildStrip(items, images);
      }
    })
    .catch(err => console.error('Timeline error:', err));

  // ── 手機版（user 2026-06-11）─────────────────────────────────────
  // 排列參考 class slideshow：era chip + 年份說明卡在「圖片上方」、圖片用 3-slot slideshow 排列；
  // 右箭頭（或點圖片區）切下一年 = 文字卡 clip 換內容 + slideshow tick 同步左移；
  // list 鈕切換 era 清單視圖（沿用桌面 #timeline-list-view 結構/CSS，行為簡化版）。
  function buildMobile(items, images) {
    area.style.height = 'auto';
    navLeft.style.display = 'none';
    navRight.style.display = 'none';

    // era 分組（list view 用；同 buildStrip 的分組邏輯）
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

    const wrap = document.createElement('div');
    wrap.id = 'timeline-mobile';
    // 順序：圖片在上、文字（era chip + 年份卡）在下（user 2026-07-07 改版；原文字上圖下）
    wrap.innerHTML =
      '<div class="tl-m-images"></div>' +
      // 直式：era 左（EN/ZH 兩行）、年份卡右（user 2026-07-09）；矮橫向 wrapper display:contents 拆回 grid items
      '<div class="tl-m-text-row">' +
        '<div class="tl-m-era timeline-card-inner bg-black text-white"><div class="text-s font-bold"></div></div>' +
        '<div class="tl-m-card timeline-card-inner"><div class="tl-m-card-body text-s font-bold"></div></div>' +
      '</div>' +
      '<div class="tl-m-controls">' +
        '<button class="tl-m-list-btn" aria-label="切換清單視圖"><span class="tl-icon-btn-inner"><span class="icon icon-atlas-list"></span></span></button>' +
        '<button class="tl-m-next-btn" aria-label="下一年"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div>';
    area.appendChild(wrap);

    const eraEl = wrap.querySelector('.tl-m-era');
    const eraText = eraEl.querySelector('div');
    const cardEl = wrap.querySelector('.tl-m-card');
    const cardBody = cardEl.querySelector('.tl-m-card-body');
    const imagesEl = wrap.querySelector('.tl-m-images');
    const listBtn = wrap.querySelector('.tl-m-list-btn');
    const nextBtn = wrap.querySelector('.tl-m-next-btn');
    const listIcon = listBtn.querySelector('.icon');

    let mIdx = 0;
    let switching = false;
    let listMode = false;
    let listAnimating = false;

    // skipEra（user 2026-07-13）：下一年同 era 時 chip 內容/旋轉不動（nextYear 也不 clip 它）
    function renderYear(i, skipEra = false) {
      const it = items[i];
      // 兩個 span＋空白：直式 CSS 轉 block 成 EN/ZH 兩行，矮橫向維持 inline 單行（空白節點在 block 間不渲染）
      if (!skipEra) {
        eraText.innerHTML = `<span class="tl-m-era-en">${it.eraTitle}</span> <span class="tl-m-era-zh">${it.eraLabel}</span>`;
      }
      const descs = it.descriptions || (it.description ? [it.description] : []);
      // .tl-m-descs wrapper：直式卡內兩欄 grid 用（年份左欄 / 文字右欄，user 2026-07-13）；
      // 矮橫向不吃 grid、wrapper 是透明 block 無影響。
      // section 分組（user 2026-07-13 二改）：h5 小標 hoist 成 .tl-m-desc-group 直接子層——
      // sticky 的 containing block 從單一 .tl-m-desc 擴大到整組（含後續無標題段落），
      // BFA/MDES 標題釘到下一個 h5 接棒或整卡結束，不再在自己段落結尾被收走一半。
      const parser = document.createElement('div');
      const groups = [];
      descs.forEach(d => {
        parser.innerHTML = d;
        const h5 = parser.querySelector('h5');
        if (h5 || !groups.length) groups.push({ head: h5 ? h5.outerHTML : '', body: [] });
        if (h5) h5.remove();
        groups[groups.length - 1].body.push(`<div class="tl-m-desc">${parser.innerHTML}</div>`);
      });
      cardBody.innerHTML =
        `<h3 class="font-bold tl-m-year">${it.year}</h3>` +
        `<div class="tl-m-descs">` +
        groups.map(g => `<div class="tl-m-desc-group">${g.head}${g.body.join('')}</div>`).join('') +
        `</div>`;
      cardEl.style.background = randomColor();
      // 字卡寬 = 文字實際寬（user 2026-07-04）：長文在 max-width 內換行後，max-content 會把卡撐滿容器寬、
      // 右側留大片空底色 → 逐「文字節點」用 Range 量每一行 rect 的右緣，卡寬收到 最寬行 + 左右 padding。
      // ⚠️ 不能對整個 cardBody selectNodeContents 一次量：Range 對完整包含的區塊元素（.tl-m-desc div）
      //   回傳元素 border box（= 撐滿容器的寬），量到的永遠是容器寬。只有 text node 的 rects 才是真的逐行字寬。
      // 先清 inline width/transform 讓文字自然換行再量（旋轉會虛增 rect 寬，量完才設新角度）；+1px 防 sub-pixel 再折行。
      cardEl.style.width = '';
      cardEl.style.transform = 'none';
      // 量寬只給矮橫向（grid 第 3 欄卡片貼文字寬）；直式 2026-07-09 改 era 上/卡下、卡片吃滿容器寬，
      // inline 定寬會擋住 CSS width:100% → 直式跳過量測。
      if (window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
        const baseL = cardBody.getBoundingClientRect().left;
        const walker = document.createTreeWalker(cardBody, NodeFilter.SHOW_TEXT);
        let maxLine = 0;
        for (let n; (n = walker.nextNode()); ) {
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) maxLine = Math.max(maxLine, r.right - baseL);
        }
        if (maxLine) {
          const cs = getComputedStyle(cardEl);
          cardEl.style.width = `${Math.ceil(maxLine + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 1}px`;
        }
      }
      if (!skipEra) eraEl.style.transform = `rotate(${pickUniqueRotations(1, -4, 4)[0]}deg)`;
      cardEl.style.transform = `rotate(${pickUniqueRotations(1, -2, 2)[0]}deg)`;
      cardEl.scrollTop = 0; // 切年份時捲回頂部（上一年捲到中段，新年份要頂對齊；同 list view renderListEra）
      cardBody.scrollTop = 0; // 直式內捲層（padding 留外盒）也歸零
      // 直式：末段 h5 區塊（如 2004 MDES）不足一屏時，捲到底 h5 會卡在半途頂不到年份列（user 2026-07-13）
      // → .tl-m-descs 補 padding-bottom = 盒高 − 末段高，捲到底恰好末段頂 = 盒頂、h5 與年份同列釘住。
      // 只在「內容本來就超框」時補（內容整卡放得下就不製造多餘捲動）；矮橫向無 grid/sticky 不適用。
      if (!window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
        const descsWrap = cardBody.querySelector('.tl-m-descs');
        if (descsWrap) {
          descsWrap.style.paddingBottom = '';
          const lastDesc = descsWrap.lastElementChild;
          if (lastDesc && lastDesc.querySelector('h5') && cardBody.scrollHeight > cardBody.clientHeight) {
            const pad = cardBody.clientHeight - lastDesc.offsetHeight;
            if (pad > 0) descsWrap.style.paddingBottom = `${pad}px`;
          }
        }
      }
    }
    renderYear(0);

    // slideshow：單格置中一次一張（user 2026-07-07 改版，原 3-slot collage）；manual 模式
    //（內建點擊/hover 不綁），tick 由「自動輪播計時」與「箭頭切年」共同驅動——同一 tick、
    // isShifting 自帶互斥。舊圖 clip-out + 新圖隨機 4 向 clip-in 同格交疊＝clip-path 切換。
    // 照片與年份脫鉤（2026-08-11 後台重構）：輪播吃 about_history_images 的 sort 順序
    const slide = createClassImagesSlideshow(imagesEl, images, {
      textHlEl: null, manual: true, slotLefts: ['50%'], slotXPercent: -50,
    });
    if (slide) slide.renderFresh(true); // 先隱藏，等 ScrollTrigger reveal

    // 自動輪播：3.5s 一張；list view 開著時跳過（tick 會把新圖 reveal 進被 hideAll 的區域）。
    // SPA 換頁 interval 要清（page-cleanup registry）。
    let autoTimer = null;
    function startAuto() {
      if (autoTimer || !slide) return;
      autoTimer = setInterval(() => { if (!listMode && !document.hidden) slide.tick(); }, 3500);
    }
    registerPageCleanup(() => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } });

    const textEls = [eraEl, cardEl];

    function nextYear() {
      if (switching || listMode || listAnimating || !slide) return;
      switching = true;
      slide.tick(); // 圖片左移一格 + 下一年圖片進場，與文字卡換頁同時跑
      // 同 era 的下一年：era chip 不參與 clip 進退場、內容/旋轉不動（user 2026-07-13）
      const nextIdx = (mIdx + 1) % items.length;
      const sameEra = items[nextIdx].eraTitle === items[mIdx].eraTitle
        && items[nextIdx].eraLabel === items[mIdx].eraLabel;
      const els = sameEra ? [cardEl] : textEls;
      gsap.to(els, {
        clipPath: getClipStart(randomDirLR()), duration: TIMING.exitDuration, ease: TIMING.exitEase,
        onComplete: () => {
          mIdx = nextIdx;
          renderYear(mIdx, sameEra);
          gsap.set(els, { clipPath: getClipStart(randomDirLR()) });
          gsap.to(els, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { switching = false; },
          });
        },
      });
    }
    nextBtn.addEventListener('click', nextYear);
    imagesEl.addEventListener('click', nextYear); // 點圖片區也切年（對應桌面 slot 點擊往前）

    // ── list view（結構/class 同桌面版，mobile CSS 覆蓋佈局）──
    const listView = document.createElement('div');
    listView.id = 'timeline-list-view';
    listView.style.display = 'none';
    listView.innerHTML =
      '<div class="tl-list-grid"><div class="tl-list-cell">' +
        '<div class="tl-list-rect timeline-card-inner"><div class="tl-list-content list-scroll"></div></div>' +
        '<div class="tl-list-chip timeline-card-inner bg-black text-white"><div class="text-s font-bold"></div></div>' +
        '<button class="tl-list-next-btn" aria-label="下一個時期"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div></div>';
    area.appendChild(listView);

    const listChip = listView.querySelector('.tl-list-chip');
    const listChipText = listChip.querySelector('div');
    const listRect = listView.querySelector('.tl-list-rect');
    const listContent = listView.querySelector('.tl-list-content');
    const listNextBtn = listView.querySelector('.tl-list-next-btn');
    const rectEls = [listRect]; // chip 獨立走 revealChip/exitChip（hero clip-reveal，同 library 左上角黑卡）

    let listEraIndex = 0;
    let listEraColors = [];

    // 同 buildStrip 的 splitDesc / renderListEra（手機自帶一份；桌面那份在 buildStrip closure 內）
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

    function renderListEra(idx) {
      const era = eraGroups[idx];
      // 兩 span＋空白：直式手機 CSS 轉 block 成 EN/ZH 兩行（左欄），桌面/矮橫向維持 inline 單行
      listChipText.innerHTML = `<span class="tl-list-era-en">${era.title}</span> <span class="tl-list-era-zh">${era.label}</span>`;
      listRect.style.background = listEraColors[idx];
      listContent.innerHTML = era.years.map(y => {
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
          `<div class="tl-list-year text-s font-bold">${y.year}</div>` +
          `<div class="tl-list-year-body text-s font-regular">${blocks}</div>` +
        '</div>';
      }).join('');
      listContent.scrollTop = 0;
    }

    // icon wipe swap（同桌面 wipeToggleIcon）
    function wipeListIcon(newClass) {
      if (typeof gsap === 'undefined') { listIcon.className = newClass; return; }
      const dirs = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'];
      const dir = dirs[Math.floor(Math.random() * 4)];
      gsap.killTweensOf(listIcon);
      gsap.to(listIcon, {
        clipPath: dir, duration: 0.4, ease: 'power2.out', overwrite: true,
        onComplete: () => {
          listIcon.className = newClass;
          gsap.fromTo(listIcon, { clipPath: dir },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'power2.out', clearProps: 'clipPath', overwrite: true });
        },
      });
    }

    function showList() {
      if (listAnimating || switching || listMode) return;
      listAnimating = true;
      listMode = true;
      wipeListIcon('icon icon-atlas-view');
      nextBtn.style.visibility = 'hidden'; // list 模式下年份箭頭無作用，先藏
      const pool = shuffle(ACCENT_COLORS);
      listEraColors = eraGroups.map((_, i) => pool[i % pool.length]);
      listEraIndex = eraIndexByKey[`${items[mIdx].eraTitle}|${items[mIdx].eraLabel}`] ?? 0;
      if (slide) slide.hideAll();
      gsap.to(textEls, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase });
      gsap.delayedCall(TIMING.exitDuration, () => {
        renderListEra(listEraIndex);
        listView.style.display = 'block';
        gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
        gsap.to(rectEls, {
          clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
          onComplete: () => { listAnimating = false; },
        });
        revealChip(listChip, TIMING.cardRevealDuration, TIMING.revealEase);
        revealChip(listNextBtn.querySelector('.tl-icon-btn-inner'), TIMING.cardRevealDuration, TIMING.revealEase);
      });
    }

    function hideList() {
      if (listAnimating || !listMode) return;
      listAnimating = true;
      wipeListIcon('icon icon-atlas-list');
      gsap.to(rectEls, {
        clipPath: getClipStart(randomDirLR()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listView.style.display = 'none';
          listMode = false;
          nextBtn.style.visibility = '';
          if (slide) slide.showAll();
          gsap.to(textEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { listAnimating = false; },
          });
        },
      });
      exitChip(listChip, TIMING.exitDuration, TIMING.exitEase);
      // 右箭頭鈕跟著 clip 收起（user 2026-08-11）
      exitChip(listNextBtn.querySelector('.tl-icon-btn-inner'), TIMING.exitDuration, TIMING.exitEase);
    }

    function nextListEra() {
      if (listAnimating || eraGroups.length <= 1) return;
      listAnimating = true;
      gsap.to(rectEls, {
        clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, stagger: TIMING.stagger,
        onComplete: () => {
          listEraIndex = (listEraIndex + 1) % eraGroups.length;
          renderListEra(listEraIndex);
          gsap.set(rectEls, { clipPath: getClipStart(randomDirLR()) });
          gsap.to(rectEls, {
            clipPath: CLIP_END, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger,
            onComplete: () => { listAnimating = false; },
          });
          revealChip(listChip, TIMING.cardRevealDuration, TIMING.revealEase);
        },
      });
      exitChip(listChip, TIMING.exitDuration, TIMING.exitEase);
    }

    listBtn.addEventListener('click', () => { if (listMode) hideList(); else showList(); });
    listNextBtn.addEventListener('click', nextListEra);

    // ── 初始 reveal（文字卡 + slideshow 一起 clip-in）──
    gsap.set(textEls, { clipPath: getClipStart(randomDirLR()) });
    const revealMobile = () => {
      gsap.to(textEls, { clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, stagger: TIMING.stagger });
      if (slide) slide.showAll();
      startAuto(); // 進場後才起自動輪播（藏著空轉沒意義）
    };
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: area, start: 'top 80%', once: true, onEnter: revealMobile });
    } else {
      revealMobile();
    }

    // 離頁退場：依模式收掉可見元素（同桌面語義的簡化版）
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const r = area.getBoundingClientRect();
      if (!(r.width > 0 && r.bottom > 0 && r.top < window.innerHeight)) { resolve(); return; }
      const slots = Array.from(imagesEl.querySelectorAll('.class-img'));
      const exitEls = listMode ? rectEls : [...textEls, ...slots];
      const total = exitEls.length + (listMode ? 1 : 0); // list 模式下黑卡另外走 exitChip，算一份
      if (!total) { resolve(); return; }
      gsap.killTweensOf(exitEls);
      let done = 0;
      const onOne = () => { if (++done >= total) resolve(); };
      exitEls.forEach(el => {
        gsap.to(el, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
      });
      if (listMode) { gsap.killTweensOf(listChip); exitChip(listChip, TIMING.exitDuration, TIMING.exitEase, onOne); }
    }));

    // 離頁退場：手機 list 鈕（把說明叫出來的 btn）+ 下一年鈕 + list view 下一時期鈕的黑方塊 inner 也做出場
    //（hero clip-reveal，同 .tl-list-chip；exitChip 讀 CSS rotate 算沿自身軸位移）。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const inners = [listBtn, nextBtn, listNextBtn]
        .map(b => b && b.querySelector('.tl-icon-btn-inner'))
        .filter(el => el && el.offsetParent !== null);
      if (!inners.length) { resolve(); return; }
      let done = 0;
      const onOne = () => { if (++done >= inners.length) resolve(); };
      inners.forEach(el => { gsap.killTweensOf(el); exitChip(el, TIMING.exitDuration, TIMING.exitEase, onOne); });
    }));
  }

  // 桌面版：照片自動捲動 marquee（user 2026-08-06 改版）
  // 舊版是「左右分頁導航 + 疊加 era/年份字卡 + slot4 半透明預覽 + hover 抬升」，全部移除；
  // 現在照片無縫由右往左自動捲（速度對齊 awards ticker 80px/s），字卡改成左下角鈕開關的 list view popup。
  function buildStrip(items, images) {
    const pageW = area.offsetWidth;
    const pageH = area.offsetHeight;
    const totalW = items.length * pageW;
    const vw = pageW / 100;

    // 自動捲動取代分頁導航：nav zones 停用
    navLeft.style.display = 'none';
    navRight.style.display = 'none';

    strip.style.width = `${totalW}px`;
    strip.style.height = '100%';

    // 照片大小 range（vw）
    const PHOTO_MIN_VW = 30;
    const PHOTO_MAX_VW = 50;

    const yPadVH = 8;
    const usableH_VH = 100 - yPadVH * 2;
    const BAR_H_VH = usableH_VH / 5;

    const allRotates = []; // 所有照片 rotateDiv，供進場 clip-reveal
    let imgIdx = 0; // 照片與年份脫鉤（2026-08-11）：每個 slot 依序取 about_history_images，不足循環

    items.forEach((item, index) => {
      const ox = index * pageW;
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
      const s4Right = 100 + photoSizes[4] * (0.3 + Math.random() * 0.3);

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
        const maxLeft = 95 - photoSizes[p];
        photoLeftsVW[p] = Math.max(minLeft, Math.min(photoLeftsVW[p], maxLeft));
      }

      const photoTopsVH = [];
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

    const revealTargets = [...allRotates, ...cloneRotates];
    if (typeof gsap !== 'undefined') {
      revealTargets.forEach(el => gsap.set(el, { clipPath: getClipStart(randomDir4()) }));
    }

    let marqueeStarted = false;
    let marqueeTween = null;
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
          gsap.to(el, { clipPath: CLIP_END, duration: TIMING.revealDuration, ease: TIMING.revealEase, delay: (i % 24) * TIMING.stagger });
        });
      }
      startMarquee();
    }
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({ trigger: area, start: 'top 80%', once: true, onEnter: revealAll });
    } else {
      revealAll();
    }

    // 離頁退場：freeze 當前 marquee 畫面（暫停無限捲動 tween）→ 可見照片各自 clip-path 收場
    //（user 2026-08-10：圖片離場走 clip-path、非滑動）。照片以 inline clipPath inset(0) 顯示 → gsap.to 直接收、無 fromTo snap。
    registerPageExit(() => new Promise(resolve => {
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
        gsap.killTweensOf(el);
        gsap.to(el, { clipPath: getClipStart(randomDir4()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
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
    let listEraIndex = 0;
    let listEraColors = [];

    const listBtn = document.createElement('button');
    listBtn.id = 'timeline-list-btn';
    listBtn.setAttribute('aria-label', '切換清單視圖');
    listBtn.innerHTML = '<span class="tl-icon-btn-inner"><span class="icon icon-atlas-list"></span></span>';
    // 放進與 list 卡同款 20-col grid → 對齊 col-5 左緣（list 卡從 col-6，見 lists.css .tl-list-cell）
    const btnGrid = document.createElement('div');
    btnGrid.className = 'tl-list-btn-grid';
    btnGrid.appendChild(listBtn);
    area.appendChild(btnGrid);
    const listIcon = listBtn.querySelector('.icon');

    const TL_ICON_DIRS = [
      'inset(0% 100% 0% 0%)',
      'inset(0% 0% 0% 100%)',
      'inset(100% 0% 0% 0%)',
      'inset(0% 0% 100% 0%)',
    ];
    // 通用 icon glyph wipe：隨機四方向 clip-out → 換 class(可略) → 同方向 clip-in（reveal = hide 時間反向、連續不跳）
    function wipeIconGlyph(iconEl, newClass) {
      if (typeof gsap === 'undefined') { if (newClass) iconEl.className = newClass; return; }
      const dir = TL_ICON_DIRS[Math.floor(Math.random() * 4)];
      gsap.killTweensOf(iconEl);
      gsap.to(iconEl, {
        clipPath: dir, duration: 0.4, ease: 'power2.out', overwrite: true,
        onComplete: () => {
          if (newClass) iconEl.className = newClass;
          gsap.fromTo(iconEl, { clipPath: dir },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'power2.out', clearProps: 'clipPath', overwrite: true });
        },
      });
    }
    const wipeToggleIcon = (newClass) => wipeIconGlyph(listIcon, newClass);

    const listView = document.createElement('div');
    listView.id = 'timeline-list-view';
    listView.style.display = 'none';
    listView.innerHTML =
      '<div class="tl-list-grid"><div class="tl-list-cell">' +
        '<div class="tl-list-rect timeline-card-inner"><div class="tl-list-content list-scroll"></div></div>' +
        '<div class="tl-list-chip timeline-card-inner bg-black text-white"><div class="text-s font-bold"></div></div>' +
        '<button class="tl-list-next-btn" aria-label="下一個時期"><span class="tl-icon-btn-inner"><span class="icon icon-arrow-right"></span></span></button>' +
      '</div></div>';
    area.appendChild(listView);

    const listChip = listView.querySelector('.tl-list-chip');
    const listChipText = listChip.querySelector('div');
    const listRect = listView.querySelector('.tl-list-rect');
    const listContent = listView.querySelector('.tl-list-content');
    const listNextBtn = listView.querySelector('.tl-list-next-btn');
    const rectEls = [listRect];

    // 矩形 clip-reveal 用外層遮罩：吃 rect 桌面定位（right:24 給 next 鈕留位）+ overflow:clip；
    // rect 填滿遮罩內部、退進場純位移滑動（chip/next 鈕是遮罩外 sibling，不被裁）。桌面 buildStrip only。
    const rectMask = document.createElement('div');
    rectMask.style.cssText = 'position:absolute; top:0; bottom:0; left:0; right:24px; overflow:clip;';
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

    function renderListEra(idx) {
      const era = eraGroups[idx];
      listChipText.innerHTML = `<span class="tl-list-era-en">${era.title}</span> <span class="tl-list-era-zh">${era.label}</span>`;
      listRect.style.background = listEraColors[idx];
      listContent.innerHTML = era.years.map(y => {
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
          `<div class="tl-list-year text-s font-bold">${y.year}</div>` +
          `<div class="tl-list-year-body text-s font-regular">${blocks}</div>` +
        '</div>';
      }).join('');
      listContent.scrollTop = 0;
    }

    function showListView() {
      if (listAnimating || listMode || typeof gsap === 'undefined') return;
      listAnimating = true;
      listMode = true;
      wipeToggleIcon('icon icon-atlas-view');
      const pool = shuffle(ACCENT_COLORS);
      listEraColors = eraGroups.map((_, i) => pool[i % pool.length]);
      renderListEra(listEraIndex);
      listView.style.display = 'block';
      gsap.set(rectEls, rslideHidden(randRslideDir()));
      gsap.to(rectEls, {
        ...rslideShown, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase,
        onComplete: () => { listAnimating = false; },
      });
      revealChip(listChip, TIMING.cardRevealDuration, TIMING.revealEase);
      revealChip(listNextBtn.querySelector('.tl-icon-btn-inner'), TIMING.cardRevealDuration, TIMING.revealEase);
    }

    function hideListView() {
      if (listAnimating || !listMode) return;
      listAnimating = true;
      wipeToggleIcon('icon icon-atlas-list');
      gsap.to(rectEls, {
        ...rslideHidden(randRslideDir()), duration: TIMING.exitDuration, ease: TIMING.exitEase,
        onComplete: () => { listView.style.display = 'none'; listMode = false; listAnimating = false; },
      });
      exitChip(listChip, TIMING.exitDuration, TIMING.exitEase);
      // 右箭頭鈕跟著 clip 收起（user 2026-08-11：關閉說明時箭頭不能原地消失）
      exitChip(listNextBtn.querySelector('.tl-icon-btn-inner'), TIMING.exitDuration, TIMING.exitEase);
    }

    function nextListEra() {
      if (listAnimating || !listMode || eraGroups.length <= 1) return;
      listAnimating = true;
      // 箭頭 icon 不做 glyph wipe（user 2026-08-11：點擊時箭頭不要 clip 動畫），鈕本身不動
      gsap.to(rectEls, {
        ...rslideHidden(randRslideDir()), duration: TIMING.exitDuration, ease: TIMING.exitEase,
        onComplete: () => {
          listEraIndex = (listEraIndex + 1) % eraGroups.length;
          renderListEra(listEraIndex);
          gsap.set(rectEls, rslideHidden(randRslideDir()));
          gsap.to(rectEls, {
            ...rslideShown, duration: TIMING.cardRevealDuration, ease: TIMING.revealEase,
            onComplete: () => { listAnimating = false; },
          });
          revealChip(listChip, TIMING.cardRevealDuration, TIMING.revealEase);
        },
      });
      exitChip(listChip, TIMING.exitDuration, TIMING.exitEase);
    }

    listBtn.addEventListener('click', () => { if (listMode) hideListView(); else showListView(); });
    listNextBtn.addEventListener('click', nextListEra);

    // 離頁退場：list view 開著時收掉矩形 + chip；否則直接放行（背景照片隨換頁 swap 掉）
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined' || !listMode) { resolve(); return; }
      gsap.killTweensOf(rectEls);
      let done = 0;
      const onOne = () => { if (++done >= 2) resolve(); };
      gsap.to(listRect, { ...rslideHidden(randRslideDir()), duration: TIMING.exitDuration, ease: TIMING.exitEase, overwrite: true, onComplete: onOne });
      exitChip(listChip, TIMING.exitDuration, TIMING.exitEase, onOne);
    }));

    // 離頁退場：桌面 list 切換鈕（把說明叫出來的 btn）+ list view 內「下一時期」鈕的黑方塊 inner 也做出場
    //（hero clip-reveal，同 .tl-list-chip / library 黑卡；exitChip 讀 CSS rotate(-8deg) 算沿自身軸位移）。
    registerPageExit(() => new Promise(resolve => {
      if (typeof gsap === 'undefined') { resolve(); return; }
      const inners = [listBtn, listNextBtn]
        .map(b => b && b.querySelector('.tl-icon-btn-inner'))
        .filter(el => el && el.offsetParent !== null);
      if (!inners.length) { resolve(); return; }
      let done = 0;
      const onOne = () => { if (++done >= inners.length) resolve(); };
      inners.forEach(el => { gsap.killTweensOf(el); exitChip(el, TIMING.exitDuration, TIMING.exitEase, onOne); });
    }));
  }
}
