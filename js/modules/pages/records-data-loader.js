/**
 * Records Data Loader
 * 負責讀取 Records JSON 資料並渲染到頁面上
 */

export async function loadRecords() {
  try {
    const response = await fetch('../data/records.json');
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
          const isFirst = i === 0;
          const isLast = i === yearGroup.items.length - 1;

          // Layout adjustments:
          // 1. First item: smaller pt (using pt-[4px] instead of py-xs which has top padding)
          // 2. Last item: no border
          const paddingClass = isFirst ? 'pb-xs pt-[4px]' : 'py-xs';
          const borderClass = isLast ? '' : 'border-b border-gray-9';

          return `
            <div class="grid grid-cols-12 md:grid-cols-9 gap-y-1 md:gap-y-0 items-center ${paddingClass} ${borderClass} text-xs md:text-p1">
              
              <!-- Mobile Row 1: Competition + Rank -->
              <div class="col-span-12 flex justify-between md:contents">
                <p class="md:col-span-4 truncate md:order-2">${item.competition}</p>
                <p class="md:col-span-1 text-right md:text-left truncate md:order-4">${item.rank}</p>
              </div>

              <!-- Mobile Row 2: Winner + Award + Location (Flex layout for compact left alignment) -->
              <div class="col-span-12 flex gap-xs md:contents">
                <p class="md:col-span-1 text-left truncate md:order-5">${item.winner}</p>
                <p class="md:col-span-2 text-left truncate md:order-3">${item.award}</p>
                <p class="md:col-span-1 text-left truncate md:order-1">${item.location}</p>
              </div>
            </div>
          `;
        }).join('');
      }

      const html = `
        <div class="col-span-12 ${isLastYear ? '' : 'mb-xl'}">
          <div class="grid-12 items-start pb-xl">
            
            <!-- Year: Mobile Left (Col 1-10), Desktop Col 3 -->
            <div class="col-span-10 md:col-span-1 md:col-start-3 activities-year-toggle cursor-pointer flex items-center order-1 md:order-2">
              <h5>${yearGroup.year}</h5>
            </div>

            <!-- Chevron: Mobile Right (Col 11-12), Desktop Col 2 -->
            <div class="col-span-2 md:col-span-1 md:col-start-2 flex justify-end items-center activities-year-toggle cursor-pointer h-toggle order-2 md:order-1">
              <i class="fa-solid fa-chevron-right text-p1 transition-all duration-fast rotate-90"></i>
            </div>

            <!-- Records List: Mobile Full Width (Col 1-12), Desktop Col 4-12 -->
            <div class="col-span-12 md:col-span-9 md:col-start-4 activities-year-items flex flex-col order-3 mt-md md:mt-0">
              ${itemsHtml}
            </div>
          </div>
          ${isLastYear ? '' : '<div class="grid-12"><div class="col-span-12 md:col-start-3 md:col-span-10 border-b border-gray-9"></div></div>'}
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

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
      img.className = 'h-[50px] md:h-[100px] w-auto object-contain grayscale hover:grayscale-0 transition-all duration-300'; 
      
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
  // 讓兩個 track 一起向左移動
  if (typeof gsap !== 'undefined') {
    // 計算單個 track 的寬度可能需要等待圖片載入，
    // 但使用 xPercent: -100 可以相對簡單地處理
    gsap.to([track1, track2], {
      xPercent: -100,
      repeat: -1,
      duration: 120, // 調整速度
      ease: "none"
    });
  }
}