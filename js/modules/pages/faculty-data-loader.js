/**
 * Faculty Data Loader
 * 負責讀取師資 JSON 資料並根據 type (fulltime/parttime/admin) 自動分類渲染
 */

export async function loadFacultyData() {
  try {
    const response = await fetch('../data/faculty.json');
    const data = await response.json();

    // 分類資料
    const fulltime = data.filter(item => item.type === 'fulltime');
    const parttime = data.filter(item => item.type === 'parttime');
    const admin = data.filter(item => item.type === 'admin');

    // 渲染到對應容器
    renderFacultyList('faculty-fulltime-list', fulltime);
    renderFacultyList('faculty-parttime-list', parttime);
    renderFacultyList('faculty-admin-list', admin);

  } catch (error) {
    console.error('Error loading faculty data:', error);
  }
}

function renderFacultyList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 如果該分類沒有資料，可以選擇隱藏容器或顯示提示
  if (items.length === 0) {
    container.innerHTML = '<p class="text-gray-5 col-span-full">No data available.</p>';
    return;
  }

  // 生成 HTML
  container.innerHTML = items.map(item => `
    <div class="faculty-card group cursor-pointer" data-category="${item.type}" data-faculty-id="${item.id}">
      <div class="faculty-card-image-wrapper overflow-hidden mb-sm aspect-[4/5] bg-gray-2 relative">
        <img src="${item.image}" alt="${item.nameEn}" loading="lazy" class="faculty-card-image w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
      </div>
      <div class="text-left">
        <h5>${item.nameEn}</h5>
        <h5>${item.nameZh}</h5>
        <p class="text-p1 mt-xs">${item.titleEn}</p>
        <p class="text-p1">${item.titleZh}</p>
      </div>
    </div>
  `).join('');
}
