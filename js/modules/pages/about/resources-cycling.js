/**
 * Resources Cycling Module (About Page)
 * Resources 區塊：讀取 JSON 並渲染為 Horizontal Accordion
 */

import { initSingleAccordion } from '../../accordions/horizontal-accordion.js';

export function initResourcesCycling() {
  const container = document.getElementById('resources-accordion-container');
  if (!container) return;

  // Fetch data from JSON file
  fetch('../data/resources.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - Check if data/resources.json exists`);
      return response.json();
    })
    .then(resourcesContent => {
      renderResourcesAccordion(resourcesContent, container);
    })
    .catch(error => console.error('Error loading resources data:', error));
}

function renderResourcesAccordion(data, container) {
  // 建立 Accordion Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'accordion-wrapper colored-accordion h-auto md:h-[700px]';

  // 生成 HTML
  const html = data.map((item, index) => {
    // 拆分英文和中文標題（以第一個中文字元為界）
    const match = item.title.match(/^(.*?)\s+([\u4e00-\u9fff].*)$/);
    const titleEn = match ? match[1] : item.title;
    const titleZh = match ? match[2] : '';
    const labelInner = titleZh
      ? `<span class="accordion-label-en">${titleEn}</span><span class="accordion-label-sep">&ensp;</span><span class="accordion-label-zh">${titleZh}</span>`
      : item.title;

    return `
    <div class="accordion-item" data-index="${index}">
      <!-- A: Label -->
      <div class="accordion-label">
        <div class="accordion-label-inner">${labelInner}</div>
      </div>
      <!-- B: Body -->
      <div class="accordion-body">
        <div class="accordion-body-inner">
          <div class="accordion-img-wrap">
            <img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover">
          </div>
          <div class="accordion-text-wrap">
            <p class="text-white mb-sm">${item.textEn || item.descriptionEn}</p>
            <p class="text-white">${item.textZh || item.descriptionZh}</p>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  wrapper.innerHTML = html;
  container.appendChild(wrapper);

  // 初始化手風琴功能
  initSingleAccordion(wrapper);
}
