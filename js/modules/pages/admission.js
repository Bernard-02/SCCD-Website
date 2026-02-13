/**
 * Admission Page Module
 * 招生資訊頁面功能（Load More Pagination & Detail Navigation）
 */

/**
 * Initialize Load More Pagination
 * 招生資訊列表 - 顯示更多按鈕
 */
function initAdmissionPagination() {
  const loadMoreBtn = document.getElementById('load-more-btn');
  const admissionItems = document.querySelectorAll('.admission-item');

  if (!loadMoreBtn || admissionItems.length === 0) return;

  let currentIndex = 10; // 初始顯示前 10 個項目
  const itemsPerPage = 10; // 每次顯示 10 個

  // 檢查是否還有更多項目需要顯示
  function checkLoadMoreVisibility() {
    if (currentIndex >= admissionItems.length) {
      loadMoreBtn.style.display = 'none'; // 隱藏按鈕
    } else {
      loadMoreBtn.style.display = 'block'; // 顯示按鈕
    }
  }

  // 初始檢查
  checkLoadMoreVisibility();

  // Load More 按鈕點擊事件
  loadMoreBtn.addEventListener('click', () => {
    const endIndex = Math.min(currentIndex + itemsPerPage, admissionItems.length);

    // 顯示下一批項目
    for (let i = currentIndex; i < endIndex; i++) {
      admissionItems[i].style.display = 'flex';
    }

    currentIndex = endIndex;
    checkLoadMoreVisibility();
  });
}

/**
 * Initialize Admission Detail Navigation
 * 招生詳情頁面 - 上一篇/下一篇按鈕
 */
function initAdmissionDetailNavigation() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const prevPlaceholder = document.getElementById('prev-placeholder');

  if (!prevBtn && !nextBtn) return;

  // 從 URL 獲取文章 ID（例如：admission-detail.html?id=1）
  const urlParams = new URLSearchParams(window.location.search);
  const currentId = parseInt(urlParams.get('id')) || 1; // 預設為第 1 篇
  const totalPosts = 12; // 總共 12 篇文章（對應 admission.html 的列表）

  // 設定上一個按鈕
  if (prevBtn && prevPlaceholder) {
    if (currentId > 1) {
      prevBtn.href = `admission-detail.html?id=${currentId - 1}`;
      prevBtn.style.display = 'flex';
      prevPlaceholder.style.display = 'none';
    } else {
      prevBtn.style.display = 'none';
      prevPlaceholder.style.display = 'block';
    }
  }

  // 設定下一個按鈕
  if (nextBtn) {
    if (currentId < totalPosts) {
      nextBtn.href = `admission-detail.html?id=${currentId + 1}`;
      nextBtn.style.display = 'flex';
    } else {
      nextBtn.style.display = 'none';
    }
  }
}

/**
 * Main export function
 */
export function initAdmissionPage() {
  initAdmissionPagination();
  initAdmissionDetailNavigation();
}
