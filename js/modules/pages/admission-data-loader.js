/**
 * Admission Data Loader
 * 負責讀取 Admission JSON 資料並渲染列表與詳情頁
 */

import { animateCards } from '../ui/scroll-animate.js';

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

  // 將單筆資料轉成 HTML 字串
  const itemHTML = (item) => `
    <div class="admission-item grid grid-cols-12 gap-y-xs md:gap-x-lg items-baseline border-b border-gray-9 pb-md">
      <h5 class="col-span-12 md:col-span-3 font-regular">${item.date}</h5>
      <a href="admission-detail.html?id=${item.id}" class="col-span-12 md:col-span-9 block group w-full">
        <h5 class="font-regular group-hover:font-bold transition-all duration-fast">${item.title}</h5>
      </a>
    </div>
  `;

  // 初始渲染：渲染前 N 筆，用 ScrollTrigger 進場，按鈕等最後一個進場後 fade in
  data.slice(0, visibleCount).forEach(item => container.insertAdjacentHTML('beforeend', itemHTML(item)));
  const initialItems = container.querySelectorAll('.admission-item');

  if (loadMoreContainer) gsap.set(loadMoreContainer, { opacity: 0, display: 'flex' });
  animateCards(initialItems, true, {
    fadeIn: true,
    onLastEnter: loadMoreContainer
      ? () => gsap.to(loadMoreContainer, { opacity: 1, duration: 0.3, ease: 'power2.out' })
      : null,
  });

  // Load More：只 append 新的 item，直接 stagger 進場，按鈕隱藏（已全部顯示）
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const prevCount = visibleCount;
      visibleCount = data.length;
      data.slice(prevCount, visibleCount).forEach(item => container.insertAdjacentHTML('beforeend', itemHTML(item)));
      const allItems = container.querySelectorAll('.admission-item');
      const newElements = Array.from(allItems).slice(prevCount);
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      animateCards(newElements, false, { fadeIn: true });
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
    window.location.href = '404.html'; // 找不到則導向 404
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