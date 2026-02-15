/**
 * Support Data Loader
 * 負責讀取 Support JSON 資料並渲染捐款方式列表
 */

export async function loadSupportData() {
  try {
    const response = await fetch('../data/support.json');
    const data = await response.json();
    const container = document.getElementById('donation-methods-list');

    if (!container) return;

    container.innerHTML = data.map(item => `
      <div class="course-item overflow-hidden border-b border-gray-9">
        <div class="course-header flex items-center justify-between py-md cursor-pointer">
          <h5>${item.title}</h5>
          <i class="fa-solid fa-chevron-down text-p1 transition-transform duration-300"></i>
        </div>
        <div class="course-content h-0 overflow-hidden">
          <div class="pt-xs pb-md">
            ${item.content}
          </div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading support data:', error);
  }
}