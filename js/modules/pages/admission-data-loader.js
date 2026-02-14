/**
 * Admission Data Loader
 * 負責讀取 Admission JSON 資料並渲染列表與詳情頁
 */

export async function loadAdmissionData() {
  try {
    const response = await fetch('../data/admission.json');
    const data = await response.json();

    // 判斷當前是列表頁還是詳情頁
    const listContainer = document.getElementById('admission-list');
    const detailContainer = document.getElementById('admission-detail-content');

    if (listContainer) {
      renderAdmissionList(data, listContainer);
    } else if (detailContainer) {
      renderAdmissionDetail(data);
    }

  } catch (error) {
    console.error('Error loading admission data:', error);
  }
}

// --- 列表頁邏輯 ---
function renderAdmissionList(data, container) {
  const ITEMS_PER_PAGE = 10;
  let visibleCount = ITEMS_PER_PAGE;
  const loadMoreBtn = document.getElementById('load-more-btn');
  const loadMoreContainer = document.getElementById('load-more-container');

  // 渲染函數
  const render = (count) => {
    container.innerHTML = '';
    const itemsToShow = data.slice(0, count);

    itemsToShow.forEach(item => {
      const html = `
        <div class="admission-item flex items-baseline">
          <h5 class="font-regular" style="flex: 0 0 20%;">${item.date}</h5>
          <a href="admission-detail.html?id=${item.id}" class="border-b border-gray-9 pb-sm block group" style="flex: 1;">
            <h5 class="font-regular group-hover:font-bold transition-all duration-fast">${item.title}</h5>
          </a>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });

    // 控制 Load More 按鈕顯示
    if (count >= data.length) {
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    } else {
      if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
    }
  };

  // 初始渲染
  render(visibleCount);

  // Load More 點擊事件
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      visibleCount += ITEMS_PER_PAGE; // 每次多顯示 10 筆 (或顯示剩餘全部)
      // 這裡簡單處理：直接顯示全部，或者您可以改為 visibleCount += 10
      // 根據您的原始 HTML 邏輯，似乎是點擊後顯示全部剩餘的
      visibleCount = data.length; 
      render(visibleCount);
    });
  }
}

// --- 詳情頁邏輯 ---
function renderAdmissionDetail(data) {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  
  // 找到對應的文章
  const currentIndex = data.findIndex(item => item.id === id);
  const item = data[currentIndex];

  if (!item) {
    window.location.href = 'admission.html'; // 找不到則導回列表
    return;
  }

  // 填入內容
  document.getElementById('admission-date').textContent = item.date;
  document.getElementById('admission-title').textContent = item.title;
  document.getElementById('admission-body').innerHTML = item.content; // 支援 HTML 標籤

  // 處理 Prev / Next 導航
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const prevPlaceholder = document.getElementById('prev-placeholder');
  const nextPlaceholder = document.getElementById('next-placeholder');

  // 上一篇 (Index - 1) - 注意：如果是按日期倒序，上一篇其實是 Index - 1 (較新的)
  // 這裡假設 JSON 順序即為顯示順序
  if (currentIndex > 0) {
    const prevItem = data[currentIndex - 1];
    prevBtn.href = `admission-detail.html?id=${prevItem.id}`;
    prevBtn.style.display = 'flex';
    if (prevPlaceholder) prevPlaceholder.style.display = 'none';
  } else {
    prevBtn.style.display = 'none';
    if (prevPlaceholder) prevPlaceholder.style.display = 'block';
  }

  // 下一篇 (Index + 1)
  if (currentIndex < data.length - 1) {
    const nextItem = data[currentIndex + 1];
    nextBtn.href = `admission-detail.html?id=${nextItem.id}`;
    nextBtn.style.display = 'flex';
    if (nextPlaceholder) nextPlaceholder.style.display = 'none';
  } else {
    nextBtn.style.display = 'none';
    if (nextPlaceholder) nextPlaceholder.style.display = 'block';
  }
}