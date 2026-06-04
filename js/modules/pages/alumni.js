/**
 * Alumni Page Module
 *   1. Vision     精神   — 雙語 highlight
 *   2. Activities 活動   — loadListInto + initListAccordion（不顯示 share btn）
 *   3. Members    系友   — faculty-card 樣式
 *   4. Sponsors   贊助   — 3×3 grid <a> 連官網（旋轉 + hover 三原色）
 *   5. Organization 組織 — loadListInto (flatList + bodyField:'term' + hideYearHeader)；
 *                        sticky charter 在 list 底部
 *   6. Gatherings 召集   — 城市 tab（class-division-btn 自製，未走 setActiveNavBtn — HTML 結構未對齊 anchor-nav-inner）
 *                        + loadListInto (categoryFilter + hideYearHeader)；會議紀錄 ref href 攔截開 PDF lightbox
 *   7. Contact    聯絡   — name + email 兩欄純文字（全黑）
 */

import { initAnchorNav } from '../navigation/anchor-nav.js';
import { loadListInto } from './activities-data-loader.js';
import { initListAccordion } from '../accordions/list-accordion.js';
import { setupClipReveal, playClipReveal } from '../ui/scroll-animate.js';
import { initPdfViewer } from './library-viewer.js';
import { initSectionBannerReveal } from './about/section-banner-reveal.js';
import { registerPageExit } from '../ui/page-exit.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { DUR, EASE } from '../ui/motion.js';

// 共用：courses-card 風 4 方向 clip-path 隨機選一個
const CARD_CLIP_DIRS = [
  'inset(100% 0% 0% 0%)',
  'inset(0% 0% 100% 0%)',
  'inset(0% 100% 0% 0%)',
  'inset(0% 0% 0% 100%)',
];
function pickCardClipDir() { return CARD_CLIP_DIRS[Math.floor(Math.random() * CARD_CLIP_DIRS.length)]; }

// 共用：對 container 內所有 .list-reveal-row 跑 ScrollTrigger 進場（admission/activities 用 setupClipReveal+playClipReveal 同 pattern）
function setupListEntryReveal(container) {
  if (!container || typeof gsap === 'undefined') return;
  const rows = [...container.querySelectorAll('.list-reveal-row')];
  if (!rows.length) return;
  const wrapped = setupClipReveal(rows);
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.batch(wrapped, {
      start: 'top 90%',
      onEnter: batch => playClipReveal(batch),
    });
  } else {
    playClipReveal(wrapped);
  }
}

const DATA_URL = '/data/alumni.json';
const ACTIVITIES_URL = '/data/alumni-activities.json';
const ORGANIZATION_URL = '/data/alumni-organization.json';
const GATHERINGS_URL = '/data/alumni-gatherings.json';

const SAMPLE_PDF_URL = '/assets/sample.pdf';

const ACCENT_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
function randAccent() { return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]; }
function randDeg(min = 3, max = 6) {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return +(sign * (min + Math.random() * (max - min))).toFixed(2);
}
function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Vision ────────────────────────────────────────────────────
function renderVision(data) {
  const en = document.getElementById('alumni-vision-en');
  const zh = document.getElementById('alumni-vision-zh');
  if (en) en.textContent = data.vision?.en || '';
  if (zh) zh.textContent = data.vision?.zh || '';
  const style = getComputedStyle(document.documentElement);
  const colors = [
    style.getPropertyValue('--color-green').trim() || '#00FF80',
    style.getPropertyValue('--color-pink').trim()  || '#FF448A',
    style.getPropertyValue('--color-blue').trim()  || '#26BCFF',
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  document.querySelectorAll('[data-overview-hl]').forEach(el => {
    /** @type {HTMLElement} */ (el).style.background = color;
  });
}

// ── Members（.faculty-card 共用樣式 + clip-reveal 進場） ─────
const CLIP_DIRS = {
  top:    'inset(0% 0% 100% 0%)',
  right:  'inset(0% 0% 0% 100%)',
  bottom: 'inset(100% 0% 0% 0%)',
  left:   'inset(0% 100% 0% 0%)',
};
const CLIP_REVEALED = 'inset(0% 0% 0% 0%)';
const IMG_DIRS = ['top', 'right', 'bottom', 'left'];

function renderMembers(data) {
  const container = document.getElementById('alumni-members-list');
  if (!container) return;
  container.innerHTML = (data.members || []).map((m, i) => {
    const color = ACCENT_COLORS[i % ACCENT_COLORS.length];
    const initDeg = randDeg(3, 6);
    const imgDir = IMG_DIRS[Math.floor(Math.random() * IMG_DIRS.length)];
    return `
      <div class="faculty-card p-[6px] cursor-default" data-img-dir="${imgDir}" style="--card-color: ${color}; --init-deg: ${initDeg}deg">
        <div class="faculty-card-image-wrapper overflow-hidden mb-md aspect-[4/5] bg-gray-2 relative">
          <img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.nameEn)}" loading="lazy" class="faculty-card-image w-full h-full object-cover">
        </div>
        <div class="text-left">
          <div class="faculty-card-name">
            <h5>${escapeHtml(m.nameEn)}</h5>
            <h5>${escapeHtml(m.nameZh)}</h5>
          </div>
          <div class="faculty-card-title mt-xs">
            <p class="text-p2">${escapeHtml(m.titleEn)}</p>
            <p class="text-p2">${escapeHtml(m.titleZh)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof gsap === 'undefined') return;
  const cards = container.querySelectorAll('.faculty-card');
  cards.forEach(card => {
    const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
    const name  = card.querySelector('.faculty-card-name');
    const title = card.querySelector('.faculty-card-title');
    const dir = card.getAttribute('data-img-dir') || 'bottom';
    if (imgWrapper) gsap.set(imgWrapper, { clipPath: CLIP_DIRS[dir] });
    if (name)  setupClipReveal([name]);
    if (title) setupClipReveal([title]);
  });
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.create({
      trigger: cards[0],
      start: 'top 90%',
      once: true,
      onEnter: () => playMemberCards(cards),
    });
  } else {
    playMemberCards(cards);
  }
}

function playMemberCards(cards) {
  const CARD_ADVANCE = 0.18;
  cards.forEach((card, i) => {
    const t = i * CARD_ADVANCE;
    const imgWrapper = card.querySelector('.faculty-card-image-wrapper');
    const name  = card.querySelector('.faculty-card-name');
    const title = card.querySelector('.faculty-card-title');
    if (imgWrapper) gsap.to(imgWrapper, { clipPath: CLIP_REVEALED, duration: DUR.reveal, ease: EASE.enter, delay: t, clearProps: 'clipPath' });
    if (name)  gsap.to(name,  { yPercent: 0, duration: DUR.slow, ease: EASE.enter, delay: t + 0.4, clearProps: 'transform' });
    if (title) gsap.to(title, { yPercent: 0, duration: DUR.slow, ease: EASE.enter, delay: t + 0.5, clearProps: 'transform' });
  });
}

// ── Sponsors（<a> 連官網 + 隨機旋轉 + hover 三原色） ─────────
function renderSponsors(data) {
  const container = document.getElementById('alumni-sponsors-grid');
  if (!container) return;
  container.innerHTML = (data.sponsors || []).map(s => {
    const deg = randDeg(2, 4);
    const url = s.url || '#';
    return `
      <a class="alumni-sponsor-card" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="--init-deg: ${deg}deg">
        <div class="sponsor-inner">
          <div class="sponsor-en">${escapeHtml(s.en)}</div>
          <div class="sponsor-zh">${escapeHtml(s.zh)}</div>
        </div>
      </a>
    `;
  }).join('');

  const cards = container.querySelectorAll('.alumni-sponsor-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      /** @type {HTMLElement} */ (card).style.background = randAccent();
    });
    card.addEventListener('mouseleave', () => {
      /** @type {HTMLElement} */ (card).style.background = '';
    });
  });

  // 進場：courses-card 風 4 方向隨機 clip-path inset reveal（每張各自 random direction + 小 stagger）
  if (typeof gsap === 'undefined' || !cards.length) return;
  gsap.killTweensOf(cards);
  cards.forEach(card => gsap.set(card, { clipPath: pickCardClipDir() }));
  const playReveal = () => {
    gsap.to(cards, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: DUR.base,
      ease: 'cubic-bezier(0.25, 0, 0, 1)',
      stagger: 0.04,
      overwrite: true,
      clearProps: 'clipPath',
    });
  };
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.create({
      trigger: container,
      start: 'top 90%',
      once: true,
      onEnter: playReveal,
    });
  } else {
    playReveal();
  }
}

// ── Gatherings 城市 tabs ───────────────────────────────────────
let _currentGatheringCity = null;
let _gatheringsData = null;

function colorizeCityTab(btn, color) {
  /** @type {HTMLElement} */ (btn).style.background = color;
  /** @type {HTMLElement} */ (btn).style.color = '#000';
}
function resetCityTab(btn) {
  /** @type {HTMLElement} */ (btn).style.background = '';
  /** @type {HTMLElement} */ (btn).style.color = '';
}

async function renderGatherings(data) {
  _gatheringsData = data;
  // SPA 切回 alumni 頁時 module-scope 的 _currentGatheringCity 會殘留上次的值，
  // 導致 showGatheringCity(預設第一個城市) 因 early return 不渲染。每次 render 先 reset
  _currentGatheringCity = null;
  const tagRow = document.getElementById('alumni-city-tags');
  if (!tagRow || !data.gatheringCities?.length) return;

  // 一次性 load gatherings JSON 並 cache（year-grouped 結構；loadListInto categoryFilter 處理城市篩選 + hideYearHeader 隱藏年份）
  try {
    const res = await fetch(GATHERINGS_URL);
    _gatheringsData.yearGroups = await res.json();
  } catch (e) {
    console.error('[Alumni] gatherings load failed', e);
    _gatheringsData.yearGroups = [];
  }

  // 城市 tab：class-division-btn 樣式 + 隨機旋轉 + 一級小（text-p1）
  tagRow.innerHTML = data.gatheringCities.map((c, i) => {
    const deg = randDeg(2, 4);
    return `
      <button class="class-division-btn alumni-city-btn font-bold text-left ${i === 0 ? 'active' : ''}" data-city="${escapeHtml(c.id)}" style="transform: rotate(${deg}deg); transform-origin: center center;">
        <div class="text-p1 font-bold whitespace-nowrap">${escapeHtml(c.cityEn)}</div>
        <div class="text-p1 font-bold whitespace-nowrap">${escapeHtml(c.cityZh)}</div>
      </button>
    `;
  }).join('');

  const tabs = tagRow.querySelectorAll('.alumni-city-btn');

  // 初始 active 給三原色
  const firstActive = tagRow.querySelector('.alumni-city-btn.active');
  if (firstActive) colorizeCityTab(firstActive, randAccent());

  tabs.forEach(btn => {
    // Hover：所有 btn（包括 active）都會隨機換三原色，離開 active 保持原色、inactive 清回去
    btn.addEventListener('mouseenter', () => {
      colorizeCityTab(btn, randAccent());
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.classList.contains('active')) {
        // active 維持當前三原色 — 不重置（避免 hover 後再變回原 active 色看起來閃）
        // 但若 hover 前未設色（剛載入），不要清空 — 已在初始給過
      } else {
        resetCityTab(btn);
      }
    });
    btn.addEventListener('click', () => {
      tabs.forEach(b => { b.classList.remove('active'); resetCityTab(b); });
      btn.classList.add('active');
      colorizeCityTab(btn, randAccent());
      const city = btn.getAttribute('data-city');
      showGatheringCity(city);
    });
  });

  showGatheringCity(data.gatheringCities[0].id);
}

// ── Gatherings list（loadListInto + categoryFilter + hideYearHeader） ──
// City tab 切換時 re-render：loadListInto 內部 container.innerHTML='' + categoryFilter 過濾、
// hideYearHeader 隱藏年份欄（city 為主軸不是 year）
async function showGatheringCity(cityId) {
  if (!_gatheringsData || _currentGatheringCity === cityId) return;
  _currentGatheringCity = cityId;

  const container = document.getElementById('alumni-gatherings-list');
  if (!container) return;

  // 空 city：顯示 placeholder 提示
  const cityItems = (_gatheringsData.yearGroups || []).flatMap(yg => yg.items || [])
    .filter(it => it.category === cityId);
  if (!cityItems.length) {
    container.innerHTML = '<p class="text-p2 opacity-60 py-md">No gatherings yet 尚無聚會紀錄</p>';
    return;
  }

  await loadListInto('alumni-gatherings-list', '', {
    data:             _gatheringsData.yearGroups,
    categoryFilter:   cityId,
    hideYearHeader:   true,
    showShareBtn:     false,
    showPoster:       false,
    showAlumniIcon:   false,
    autoReveal:       false,  // setupListEntryReveal 接管 ScrollTrigger reveal
  });
  initListAccordion();
  bindMeetingMinutesPdf();
  setupListEntryReveal(container);
}

// 會議紀錄 ref：loadListInto 渲染的 <a href> 會被 SPA router document click 攔截走 404。
// 攔截 click 並 dispatch sccd:open-pdf 讓 library-viewer initPdfViewer 接管 PDF canvas 渲染。
// title 從 closest .list-item 的兩行 .list-title-marquee p 取（line1=en line2=zh）餵給 lightbox 左下 pill。
function bindMeetingMinutesPdf() {
  const list = document.getElementById('alumni-gatherings-list');
  if (!list) return;
  /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.list-ref-btn[href]')).forEach(btn => {
    if (btn.dataset.pdfBound) return;
    btn.dataset.pdfBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const pdfUrl = btn.getAttribute('href') || SAMPLE_PDF_URL;
      const item = btn.closest('.list-item');
      const titleLines = item ? item.querySelectorAll('.list-title-marquee p') : [];
      const title = titleLines.length
        ? { en: titleLines[0]?.textContent?.trim() || '', zh: titleLines[1]?.textContent?.trim() || '' }
        : null;
      document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl, title, color: randAccent() } }));
    });
  });
}

// ── Organization（loadListInto + flatList + bodyField='term' + hideYearHeader） ──
// term 是純文字「Term 2024 - 2026」，bodyField 渲染需 pre-wrap 成 <p class="text-p2 font-bold"> 保持原視覺
async function renderOrganization(terms) {
  const container = document.getElementById('alumni-org-list');
  if (!container) return;

  // 映射欄位給 loadListInto：titleEn → title_en、titleZh → title；term 包成 <p> HTML 供 bodyField 渲染
  const data = terms.map(t => ({
    ...t,
    title_en: t.titleEn,
    title:    t.titleZh,
    term:     t.term ? `<p class="text-p2 font-bold">${escapeHtml(t.term)}</p>` : '',
  }));

  await loadListInto('alumni-org-list', '', {
    data,
    flatList:        true,
    bodyField:       'term',
    hideYearHeader:  true,
    showShareBtn:    false,
    showAlumniIcon:  false,
    autoReveal:      false,
  });
  initListAccordion();
  setupListEntryReveal(container);

  // Charter 章程：永久 sticky 在 list 底部（黑底白字），點擊開 PDF lightbox
  // loadListInto 渲染後 append 到 container（loadListInto 內部清 innerHTML，所以必須 render 完才 append）
  container.insertAdjacentHTML('beforeend', `
    <a class="alumni-charter-sticky" href="${escapeHtml(SAMPLE_PDF_URL)}" data-pdf-href="${escapeHtml(SAMPLE_PDF_URL)}">
      <span class="charter-en">Charter</span>
      <span class="charter-zh">章程</span>
    </a>
  `);

  // Charter click → 開 PDF lightbox（同會議紀錄機制，需 stopImmediatePropagation 擋 SPA router）
  const charter = container.querySelector('.alumni-charter-sticky');
  if (charter) {
    charter.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const pdfUrl = charter.getAttribute('data-pdf-href') || SAMPLE_PDF_URL;
      document.dispatchEvent(new CustomEvent('sccd:open-pdf', { detail: { pdfUrl, title: { en: 'Charter', zh: '章程' }, color: randAccent() } }));
    });

    // 用 IntersectionObserver 控 visibility：只有 org section 進 viewport 才顯示 charter（sticky 仍永久 on）
    // 否則 sticky:bottom:0 從 page 載入時就把 charter pin 在 viewport 底部，user 在 hero/activities 也看得到
    const orgSection = document.getElementById('organization');
    if (orgSection && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(([entry]) => {
        charter.classList.toggle('is-visible', entry.isIntersecting);
      }, { threshold: 0 });
      observer.observe(orgSection);
      // SPA 離開 alumni 時 disconnect（比照 anchor-nav.js，否則 observer 持有被 swap 掉的 section）
      registerPageCleanup(() => observer.disconnect());
    } else {
      // fallback：直接顯示
      charter.classList.add('is-visible');
    }
  }
}

// ── Contact（name + email 兩欄全黑）─────────────────────────
function renderContact(data) {
  const container = document.getElementById('alumni-contact-list');
  if (!container) return;
  container.innerHTML = (data.contacts || []).map(c => `
    <div class="alumni-contact-row">
      <div class="role">${escapeHtml(c.roleEn)}</div>
      <div class="name">${escapeHtml(c.nameEn || '')}<br>${escapeHtml(c.nameZh || '')}</div>
      <a class="email" href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>
    </div>
  `).join('');
}

// ── Exit Animation ════════════════════════════════════════════
// alumni-full bar 退場：mirror entry（header.js 進場 inset(0 100% 0 0)→inset(0)）
// 反向 collapse inset(0)→inset(0 100% 0 0)：右邊往左收
// 跑完才 page swap，下一頁 updateNavActive 再跑 other bars reveal
function playAlumniExit() {
  return new Promise(resolve => {
    const el = /** @type {HTMLElement | null} */ (document.querySelector('[data-bar="alumni-full"]'));
    if (!el || typeof gsap === 'undefined') { resolve(); return; }
    gsap.killTweensOf(el);
    gsap.to(el, {
      clipPath: 'inset(0% 100% 0% 0%)',
      duration: DUR.medium,
      ease: EASE.exit,
      onComplete: resolve,
    });
  });
}

// ── Entry ─────────────────────────────────────────────────────
export async function initAlumni() {
  registerPageExit(playAlumniExit);
  let data;
  try {
    const res = await fetch(DATA_URL);
    data = await res.json();
  } catch (e) {
    console.error('[Alumni] failed to load', e);
    return;
  }

  renderVision(data);
  renderMembers(data);
  renderSponsors(data);
  renderContact(data);
  await renderGatherings(data);  // await: 內部 fetch gatherings JSON，否則初次城市可能 show 空

  // Activities — 無 share btn
  await loadListInto('alumni-activities-list', ACTIVITIES_URL, {
    showYearToggle: false,
    showAlumniIcon: false,
    showShareBtn: false,
  });

  // Organization — admission-news pattern：無左年份欄、EN/ZH title 兩行、term 寫進展開內容
  try {
    const orgRes = await fetch(ORGANIZATION_URL);
    const orgData = await orgRes.json();
    renderOrganization(orgData);
    // 進場 clip-reveal：同 admission/activities list
    setupListEntryReveal(document.getElementById('alumni-org-list'));
  } catch (e) {
    console.error('[Alumni] failed to load organization', e);
  }

  initListAccordion();
  // PDF viewer 共用 library 那套（DOM auto-create + sccd:open-pdf 事件 listener）— idempotent，多次呼叫安全
  initPdfViewer();
  // 封鎖綫 reveal：每 section .section-title-strip 由 anchor-nav active 切換觸發 clip-reveal
  initSectionBannerReveal();
  initAnchorNav();

  if (typeof ScrollTrigger !== 'undefined') {
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }
}
