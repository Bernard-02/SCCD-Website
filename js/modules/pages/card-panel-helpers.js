/**
 * Card Panel Helpers
 * 共用邏輯：年份分組卡片 panel 的 accordion、filter、search、hover、marquee
 * 被 album-data-loader 引用
 */

import { getCurrentSectionColor } from './activities-section-switch.js';

// ── 常數 ──────────────────────────────────────────────────────────────────────

export const CARD_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];

export const CATEGORY_LABELS = {
  'degree-show':      'Degree Show 畢業展',
  'workshop':         'Workshop 工作營',
  'lectures':         'Lectures 講座',
  'summer-camp':      'Summer Camp 暑期體驗營',
  'moment':           'Moment 動態',
  'students-present': 'Students Present 學生自主',
  'industry':         'Industry-Academia Cooperation 產學合作',
  'others':           'Others 其他',
};

// ── 年份分組（降序）──────────────────────────────────────────────────────────

export function groupByYear(data) {
  const map = new Map();
  data.forEach(item => {
    const y = item.year || 0;
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(item);
  });
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items }));
}

// ── 更新年份組分隔線（第一個不加 border-t）────────────────────────────────────

export function updateYearBorders(container) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  groups.forEach((g, i) => {
    if (i === 0) g.classList.remove('border-t-2', 'border-black');
    else         g.classList.add('border-t-2', 'border-black');
  });
}

// ── 依排序方向重排年份組 ───────────────────────────────────────────────────────

export function applySortOrder(container, direction) {
  const groups = [...container.querySelectorAll('.album-year-group')];
  if (!groups.length) return;
  groups.sort((a, b) => {
    const ya = parseInt(a.getAttribute('data-year'), 10);
    const yb = parseInt(b.getAttribute('data-year'), 10);
    return direction === 'oldest' ? ya - yb : yb - ya;
  });
  groups.forEach(g => container.appendChild(g));
  updateYearBorders(container);
}

// ── 渲染年份分組 HTML 到 container ────────────────────────────────────────────

export function renderYearGroups(container, yearGroups, buildCardFn) {
  container.innerHTML = '';
  yearGroups.forEach(({ year, items }) => {
    const cardsHtml = items.map((item, i) => buildCardFn(item, i)).join('');
    container.insertAdjacentHTML('beforeend', `
      <div class="album-year-group border-t-2 border-black" data-year="${year}">
        <div class="album-year-toggle cursor-pointer flex items-center justify-between py-md">
          <h5>${year}</h5>
          <i class="fa-solid fa-chevron-down text-p2 transition-all duration-fast"></i>
        </div>
        <div class="album-year-items">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-x-2xl gap-y-4xl pb-2xl">
            ${cardsHtml}
          </div>
        </div>
      </div>
    `);
  });
  updateYearBorders(container);
}

// ── Accordion（年份標題 toggle 展開/收合）─────────────────────────────────────

export function initAccordion(container) {
  container.querySelectorAll('.album-year-toggle').forEach(toggle => {
    const group = toggle.closest('.album-year-group');
    const items = group?.querySelector('.album-year-items');
    if (!items) return;
    const icon = toggle.querySelector('i');

    gsap.set(items, { height: 'auto', overflow: 'visible' });
    if (icon) icon.classList.add('rotate-180');
    group.dataset.open = 'true';

    toggle.addEventListener('click', () => {
      const isOpen = group.dataset.open === 'true';
      gsap.killTweensOf(items);
      if (isOpen) {
        group.dataset.open = 'false';
        gsap.set(items, { height: items.offsetHeight, overflow: 'hidden' });
        gsap.to(items, { height: 0, duration: 0.4, ease: 'power2.in' });
        if (icon) icon.classList.remove('rotate-180');
      } else {
        group.dataset.open = 'true';
        gsap.set(items, { overflow: 'hidden' });
        gsap.to(items, { height: 'auto', duration: 0.5, ease: 'power2.out',
          onComplete: () => gsap.set(items, { overflow: 'visible' }) });
        if (icon) icon.classList.add('rotate-180');
      }
    });
  });
}

// ── Card hover（桌面版：底色 + grayscale + overlay）──────────────────────────

export function bindCardHover(container) {
  if (window.innerWidth < 768) return;
  container.querySelectorAll('.album-card').forEach(card => {
    const img     = card.querySelector('.album-card-img');
    const overlay = card.querySelector('.album-card-overlay');
    const imgWrap = card.querySelector('.album-card-image');
    const color   = card.style.getPropertyValue('--card-color');

    // 計算 object-contain + object-bottom 實際渲染的圖片範圍
    const getRenderedImgRect = () => {
      if (!img || !imgWrap) return null;
      const containerW = imgWrap.clientWidth;
      const containerH = imgWrap.clientHeight;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      if (!natW || !natH) return null;
      const scale = Math.min(containerW / natW, containerH / natH);
      const rendW = natW * scale;
      const rendH = natH * scale;
      // object-bottom：水平置中，垂直靠底
      const left = (containerW - rendW) / 2;
      const top  = containerH - rendH;
      return { top, left, width: rendW, height: rendH };
    };

    card.addEventListener('mouseenter', () => {
      card.style.backgroundColor = color;
      if (img) img.style.filter = 'grayscale(100%)';
      if (overlay && imgWrap) {
        const r = getRenderedImgRect();
        if (r) {
          overlay.style.inset  = 'unset';
          overlay.style.top    = r.top    + 'px';
          overlay.style.left   = r.left   + 'px';
          overlay.style.width  = r.width  + 'px';
          overlay.style.height = r.height + 'px';
        }
        overlay.style.opacity = '1';
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = '';
      if (img) img.style.filter = '';
      if (overlay) {
        overlay.style.opacity = '0';
        // 等 opacity transition 結束後才還原 inset，避免閃爍
        setTimeout(() => {
          overlay.style.inset = '0';
          overlay.style.top = overlay.style.left = overlay.style.width = overlay.style.height = '';
        }, 350);
      }
    });
  });
}

// ── Marquee（overflow 時 hover 跑馬燈）───────────────────────────────────────

export function initMarquee(container) {
  container.querySelectorAll('.album-title-marquee').forEach(wrap => {
    const h = wrap.querySelector('h6');
    if (!h) return;
    const checkOverflow = () => {
      if (h.scrollWidth > wrap.offsetWidth) {
        wrap.classList.add('is-overflow');
        if (!wrap.dataset.marqueeInit) {
          wrap.dataset.marqueeInit = '1';
          const clone = h.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          h.style.paddingRight = '3rem';
          clone.style.paddingRight = '3rem';
          wrap.appendChild(clone);
        }
        const offset = h.offsetWidth;
        wrap.style.setProperty('--marquee-offset', `-${offset}px`);
        wrap.style.setProperty('--marquee-duration', `${Math.max(3, offset / 80)}s`);
      } else {
        wrap.classList.remove('is-overflow');
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
  });
}

// ── Filter 按鈕 active/inactive 樣式 ─────────────────────────────────────────

function sectionColor() {
  return getCurrentSectionColor() || SCCDHelpers.getRandomAccentColor();
}

export function setFilterActive(btn) {
  btn.classList.add('active');
  const inner = btn.querySelector('.anchor-nav-inner');
  if (inner) { inner.style.background = sectionColor(); inner.style.transform = ''; inner.style.color = 'black'; }
  else { btn.style.background = sectionColor(); }
}

export function setFilterInactive(btn) {
  btn.classList.remove('active');
  const inner = btn.querySelector('.anchor-nav-inner');
  if (inner) { inner.style.background = ''; inner.style.transform = ''; inner.style.color = 'rgba(0,0,0,0.5)'; }
  else { btn.style.background = ''; }
}

// ── 通用 filter 套用 ──────────────────────────────────────────────────────────
// catAttr：e.g. 'data-filter-files-cat'
// yearAttr：e.g. 'data-filter-files-year'
// cardCatAttr：e.g. 'data-category'（卡片上存 category 的 attribute）

export function applyFilter(container, panel, { catAttr, yearAttr, cardCatAttr = 'data-category', extraCheck = null }) {
  const activeCats  = new Set([...panel.querySelectorAll(`[${catAttr}].active`)].map(b => b.getAttribute(catAttr)));
  const activeYears = new Set([...panel.querySelectorAll(`[${yearAttr}].active`)].map(b => b.getAttribute(yearAttr)));

  container.querySelectorAll('.album-year-group').forEach(group => {
    const groupYear = group.getAttribute('data-year');
    if (activeYears.size > 0 && !activeYears.has(groupYear)) {
      group.style.display = 'none';
      return;
    }

    let hasVisible = false;
    group.querySelectorAll('.album-card').forEach(card => {
      const cat = card.getAttribute(cardCatAttr);
      const catMatch = activeCats.size === 0 || activeCats.has(cat);
      const extra = extraCheck ? extraCheck(card) : true;
      const filterHidden = !(catMatch && extra);
      card.dataset.filterHidden = filterHidden ? '1' : '';
      const searchHidden = card.dataset.searchHidden === '1';
      card.style.display = (!filterHidden && !searchHidden) ? '' : 'none';
      if (!filterHidden && !searchHidden) hasVisible = true;
    });

    group.style.display = hasVisible ? '' : 'none';
  });
}

// ── 通用 search ───────────────────────────────────────────────────────────────

export function initSearch(container, input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();

    container.querySelectorAll('.album-year-group').forEach(group => {
      const items = group.querySelector('.album-year-items');
      const icon  = group.querySelector('.album-year-toggle i');
      let hasVisible = false;

      group.querySelectorAll('.album-card').forEach(card => {
        const filterHidden = card.dataset.filterHidden === '1';
        if (query === '') {
          card.dataset.searchHidden = '';
          card.style.display = filterHidden ? 'none' : '';
          if (!filterHidden) hasVisible = true;
          return;
        }
        const titles = [...card.querySelectorAll('.album-title-marquee h6')].map(h => h.textContent.toLowerCase());
        const match = titles.some(t => t.includes(query))
          || (card.dataset.titleEn || '').includes(query)
          || (card.dataset.titleZh || '').includes(query);
        card.dataset.searchHidden = match ? '' : '1';
        card.style.display = (match && !filterHidden) ? '' : 'none';
        if (match && !filterHidden) hasVisible = true;
      });

      if (query === '') {
        group.style.display = '';
        if (group.dataset.open === 'true') {
          gsap.set(items, { height: 'auto', overflow: 'visible' });
          if (icon) icon.classList.add('rotate-180');
        }
      } else if (hasVisible) {
        group.style.display = '';
        group.dataset.open = 'true';
        gsap.set(items, { height: 'auto', overflow: 'visible' });
        if (icon) icon.classList.add('rotate-180');
      } else {
        group.style.display = 'none';
      }
    });
  });
}

// ── Sort dropdown toggle ───────────────────────────────────────────────────────

export function initSortToggle(panel, sortAttr, onSort) {
  const header = panel.querySelector('.album-filter-col-header');
  const list   = panel.querySelector('.album-filter-col-list');
  const icon   = header?.querySelector('i.fa-chevron-down');
  if (!header || !list) return;

  list.style.display = 'none';
  const activeBtn = list.querySelector('.album-filter-option.active');
  if (activeBtn) activeBtn.style.background = sectionColor();

  header.addEventListener('click', () => {
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : '';
    icon?.classList.toggle('rotate-180', !isOpen);
  });

  panel.querySelectorAll(`[${sortAttr}]`).forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll(`[${sortAttr}]`).forEach(b => { b.classList.remove('active'); b.style.background = ''; });
      btn.classList.add('active');
      btn.style.background = sectionColor();
      list.style.display = 'none';
      icon?.classList.remove('rotate-180');
      onSort(btn.getAttribute(sortAttr));
    });
  });
}

// ── Filter collapse toggle ─────────────────────────────────────────────────────

export function initFilterToggle(toggleBtn, rowsWrap, defaultOpen = true) {
  if (!toggleBtn || !rowsWrap) return;
  const icon = toggleBtn.querySelector('i');
  if (!defaultOpen) {
    gsap.set(rowsWrap, { height: 0 });
    gsap.set(icon, { rotation: 180 });
    toggleBtn.dataset.open = 'false';
  } else {
    toggleBtn.dataset.open = 'true';
  }
  toggleBtn.addEventListener('click', () => {
    const isOpen = toggleBtn.dataset.open !== 'false';
    if (isOpen) {
      gsap.to(rowsWrap, { height: 0, duration: 0.35, ease: 'power2.inOut' });
      gsap.to(icon, { rotation: 180, duration: 0.35, ease: 'power2.inOut' });
      toggleBtn.dataset.open = 'false';
    } else {
      gsap.to(rowsWrap, { height: 'auto', duration: 0.35, ease: 'power2.inOut' });
      gsap.to(icon, { rotation: 0, duration: 0.35, ease: 'power2.inOut' });
      toggleBtn.dataset.open = 'true';
    }
  });
}

// ── 初始化 filter 按鈕樣式 + 點擊事件 ────────────────────────────────────────
// filterGroups：[{ attr, yearOptions? }]
// onFilter：() => void

export function initFilterBtns(panel, filterGroups, onFilter) {
  filterGroups.forEach(({ attr, yearWrap }) => {
    // 初始樣式
    panel.querySelectorAll(`[${attr}]`).forEach(btn => {
      btn.classList.contains('active') ? setFilterActive(btn) : setFilterInactive(btn);
    });

    if (yearWrap) {
      // year：event delegation（動態產生）
      yearWrap.addEventListener('click', e => {
        const btn = e.target.closest(`[${attr}]`);
        if (!btn) return;
        if (btn.classList.contains('active')) {
          if (yearWrap.querySelectorAll(`[${attr}].active`).length <= 1) return;
          setFilterInactive(btn);
        } else {
          setFilterActive(btn);
        }
        onFilter();
      });
    } else {
      // cat/type：至少保留一個 active
      panel.querySelectorAll(`[${attr}]`).forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('active')) {
            if (panel.querySelectorAll(`[${attr}].active`).length <= 1) return;
            setFilterInactive(btn);
          } else {
            setFilterActive(btn);
          }
          onFilter();
        });
      });
    }
  });
}

// ── 填充 year filter 選項 ─────────────────────────────────────────────────────

export function populateYearOptions(yearWrap, yearGroups, yearAttr) {
  if (!yearWrap) return;
  yearWrap.innerHTML = yearGroups.map(({ year }) =>
    `<button class="activities-filter-btn active" ${yearAttr}="${year}"><span class="anchor-nav-inner">${year}</span></button>`
  ).join('');
}
