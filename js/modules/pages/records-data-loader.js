/**
 * Records Data Loader
 * 負責讀取 Records JSON 資料並渲染到頁面上
 */

export async function loadRecords() {
  try {
    const response = await fetch('/data/records.json');
    const data = await response.json();
    const container = document.getElementById('records-list-container');
    const tickerSection = document.getElementById('awards-ticker-section');
    const tickerContainer = document.querySelector('.awards-ticker-wrapper');

    if (!container) return;

    // 處理資料結構相容性 (支援舊版 Array 或新版 Object)
    const recordsData = Array.isArray(data) ? data : data.records;
    const awardsImages = Array.isArray(data) ? [] : data.awardsImages;

    // 1. Render Records List
    container.innerHTML = '';

    recordsData.forEach((yearGroup, index) => {
      const isLastYear = index === recordsData.length - 1;
      
      // Generate items HTML
      let itemsHtml = '';
      if (yearGroup.items && yearGroup.items.length > 0) {
        itemsHtml = yearGroup.items.map((item, i) => {
          const isLast = i === yearGroup.items.length - 1;
          const borderClass = isLast ? '' : 'border-b-4 border-black';

          const bilingual = (en, zh) => en
            ? `<p>${en}</p><p>${zh}</p>`
            : `<p>${zh}</p>`;
          const bilingualBold = (en, zh) => en
            ? `<p style="font-weight:700;">${en}</p><p style="font-weight:700;">${zh}</p>`
            : `<p style="font-weight:700;">${zh}</p>`;

          const searchText = [item.competition_en, item.competition, item.award_en, item.award, item.winner_en, item.winner, item.rank_en, item.rank]
            .filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');

          return `
            <div class="award-record-item grid grid-cols-12 md:grid-cols-9 gap-y-1 md:gap-y-0 items-center py-[0.75rem] ml-md ${borderClass} text-xs md:text-p2" data-search="${searchText}"${item.id ? ` id="${item.id}"` : ''}>

              <!-- Mobile Row 1: Competition + Rank -->
              <div class="col-span-12 flex justify-between md:contents">
                <div class="md:col-span-4 truncate md:order-2">${bilingualBold(item.competition_en, item.competition)}</div>
                <div class="md:col-span-1 text-right md:text-left truncate md:order-4">${bilingual(item.rank_en, item.rank)}</div>
              </div>

              <!-- Mobile Row 2: Winner + Award + Location (Flex layout for compact left alignment) -->
              <div class="col-span-12 flex gap-xs items-start md:contents">
                <div class="md:col-span-1 text-left truncate md:order-5">${bilingual(item.winner_en, item.winner)}</div>
                <div class="md:col-span-2 text-left truncate md:order-3">${bilingual(item.award_en, item.award)}</div>
                <div class="md:col-span-1 text-left md:order-1 self-start" style="padding-top:0.3rem;">${item.flag ? `<span class="fi fi-${item.flag}" style="width:1.5em;height:1em;display:inline-block;"></span>` : ''}</div>
              </div>
            </div>
          `;
        }).join('');
      }

      const html = `
        <div class="year-block grid-12 items-start">

          <!-- Year + Chevron: Mobile Full (Col 1-12), Desktop Col 3 -->
          <div class="col-span-12 md:col-span-1 md:col-start-3 md:sticky md:self-start activities-year-toggle cursor-pointer flex items-center gap-sm pt-xs" style="top: 224px; padding-bottom: 0.75rem">
            <i class="fa-solid fa-chevron-right text-p2 transition-all duration-fast rotate-90"></i>
            <h6>${yearGroup.year}</h6>
          </div>

          <!-- Records List: Mobile Full Width (Col 1-12), Desktop Col 4-12 -->
          <div class="col-span-12 md:col-span-9 md:col-start-4 activities-year-items flex flex-col md:mt-0">
            ${itemsHtml}
          </div>
        </div>
        ${isLastYear ? '' : '<div class="records-divider grid-12"><div class="col-span-12 md:col-span-10 md:col-start-3 border-b-4 border-black"></div></div>'}
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // 動態計算年份 sticky top（nav 160px + search bar 高度）
    const searchBar = document.querySelector('#panel-awards .activities-filter-bar');
    if (searchBar) {
      const top = 160 + searchBar.offsetHeight;
      container.querySelectorAll('.activities-year-toggle').forEach(el => {
        el.style.top = `${top}px`;
      });
    }

    // Award item hover：文字變隨機三原色，離開恢復黑色
    const ACCENT_COLORS = ['#00FF80', '#FF448A', '#26BCFF'];
    container.querySelectorAll('.award-record-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      });
      item.addEventListener('mouseleave', () => {
        item.style.color = '';
      });
    });

    // 預設所有 year items 為展開狀態（給 activities-year-toggle.js 正確判斷）
    if (typeof gsap !== 'undefined') {
      container.querySelectorAll('.activities-year-items').forEach(el => {
        gsap.set(el, { height: 'auto', overflow: 'visible', display: 'flex' });
      });
      container.querySelectorAll('.activities-year-toggle .fa-chevron-right').forEach(el => {
        gsap.set(el, { rotation: 90 });
      });
    }

    // 年份 block 進場動畫：每個 year block 進入視窗時，內部 item 逐條 stagger 出現，分割線最後進場
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      const yearBlocks = container.querySelectorAll(':scope > .year-block');

      yearBlocks.forEach(block => {
        // 年份標題（chevron + year h5）與每一條 record item
        const yearHeader = block.querySelectorAll('.activities-year-toggle');
        const recordItems = block.querySelectorAll('.activities-year-items > div');
        // 緊接在 block 後的分割線（若有）
        const divider = block.nextElementSibling?.classList.contains('records-divider')
          ? block.nextElementSibling
          : null;
        const allItems = [...yearHeader, ...recordItems, ...(divider ? [divider] : [])];

        if (allItems.length === 0) return;

        gsap.set(allItems, { y: 40, opacity: 0 });

        ScrollTrigger.create({
          trigger: block,
          start: 'top 90%',
          once: true,
          onEnter: () => {
            gsap.to(allItems, {
              y: 0,
              opacity: 1,
              duration: 0.4,
              stagger: { each: 0.05 },
              ease: 'power2.out',
              clearProps: 'transform,opacity',
            });
          },
        });
      });
    }

    // Search
    const searchInput = document.getElementById('awards-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        container.querySelectorAll('.year-block').forEach(block => {
          const items = [...block.querySelectorAll('.award-record-item')];
          const visible = items.filter(item => !q || (item.dataset.search || '').includes(q));
          items.forEach(item => { item.style.display = visible.includes(item) ? '' : 'none'; });
          // 重建 border（只有最後一個 visible item 沒有 border）
          visible.forEach((item, i) => {
            item.classList.toggle('border-b-4', i < visible.length - 1);
            item.classList.toggle('border-black', i < visible.length - 1);
          });
          block.style.display = visible.length ? '' : 'none';
          const divider = block.nextElementSibling?.classList.contains('records-divider') ? block.nextElementSibling : null;
          if (divider) divider.style.display = visible.length ? '' : 'none';
        });
        // 隱藏最後一個 visible year-block 後面的 divider
        const visibleBlocks = [...container.querySelectorAll('.year-block')].filter(b => b.style.display !== 'none');
        visibleBlocks.forEach((block, i) => {
          const divider = block.nextElementSibling?.classList.contains('records-divider') ? block.nextElementSibling : null;
          if (divider) divider.style.display = i < visibleBlocks.length - 1 ? '' : 'none';
        });

        // Empty state
        let emptyState = container.parentElement?.querySelector('.search-empty-state');
        if (!emptyState) {
          emptyState = document.createElement('div');
          emptyState.className = 'search-empty-state hidden py-xl text-center w-full';
          emptyState.innerHTML = '<p class="text-p1">Nothing here</p><p class="text-p1">這裡什麼都沒有</p>';
          container.insertAdjacentElement('afterend', emptyState);
        }
        emptyState.classList.toggle('hidden', !q || visibleBlocks.length > 0);
      });
    }

    // 2. Render Awards Ticker
    if (tickerContainer && awardsImages && awardsImages.length > 0) {
      initAwardsTicker(tickerContainer, awardsImages);
    } else if (tickerSection) {
      // 如果沒有設定圖片，則隱藏整個 Ticker 區塊，避免留白
      tickerSection.style.display = 'none';
    }

  } catch (error) {
    console.error('Error loading records data:', error);
  }
}

function initAwardsTicker(container, images) {
  // 建立圖片 HTML
  // 為了無縫滾動，我們需要複製足夠多的圖片來填滿寬度，這裡簡單複製兩份列表
  // 實際 GSAP 處理時，通常會建立兩個相同的 track 進行交替
  
  const createTrack = () => {
    const track = document.createElement('div');
    track.className = 'flex gap-xl md:gap-3xl px-2xl flex-shrink-0 items-center'; // gap-4xl (128px) for spacing
    
    images.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Award';
      // 固定大小設定：高度固定，寬度自適應 (或根據需求設定固定寬高)
      img.style.cssText = 'height: 60px; width: auto; object-fit: contain; filter: grayscale(1); flex-shrink: 0;';
      
      // 加入錯誤處理：如果圖片載入失敗（例如檔名錯誤），在 Console 顯示警告並隱藏該圖片
      img.onerror = () => {
        console.warn('Awards Ticker: Failed to load image', src);
        img.style.display = 'none';
      };

      track.appendChild(img);
    });
    return track;
  };

  // 清空容器
  container.innerHTML = '';

  // 建立兩個 Track 以實現無縫滾動
  const track1 = createTrack();
  const track2 = createTrack();
  
  container.appendChild(track1);
  container.appendChild(track2);

  // GSAP Ticker Animation
  if (typeof gsap !== 'undefined') {
    const tween = gsap.to([track1, track2], {
      xPercent: -100,
      repeat: -1,
      duration: 120,
      ease: "none"
    });

    // hover ticker 區域時速度降 50%，離開後恢復
    container.addEventListener('mouseenter', () => tween.timeScale(0.5));
    container.addEventListener('mouseleave', () => tween.timeScale(1));
  }

  // hover 圖片時，其他圖片降至 0.3 不透明度（桌面版）
  // 使用 mousemove + elementFromPoint 即時偵測，避免 ticker 移動時殘留高亮
  if (SCCDHelpers.isDesktop()) {
    let rafId = null;
    let lastMouseX = 0, lastMouseY = 0;
    let isInsideContainer = false;

    const updateHighlight = () => {
      const el = document.elementFromPoint(lastMouseX, lastMouseY);
      const hovered = el ? el.closest('img') : null;
      const allImgs = container.querySelectorAll('img');
      allImgs.forEach(img => {
        img.style.opacity = (!hovered || img === hovered) ? '1' : '0.3';
      });
      if (isInsideContainer) rafId = requestAnimationFrame(updateHighlight);
    };

    container.addEventListener('mouseenter', (e) => {
      isInsideContainer = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      rafId = requestAnimationFrame(updateHighlight);
    });

    container.addEventListener('mousemove', (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    container.addEventListener('mouseleave', () => {
      isInsideContainer = false;
      cancelAnimationFrame(rafId);
      const allImgs = container.querySelectorAll('img');
      allImgs.forEach(img => { img.style.opacity = '1'; });
    });
  }
}