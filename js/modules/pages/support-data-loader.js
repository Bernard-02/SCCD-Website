/**
 * Support Data Loader
 * 負責讀取 Support JSON 資料並渲染捐款內容
 */

export async function loadSupportData() {
  try {
    const response = await fetch('/data/support.json');
    const data = await response.json();
    const container = document.getElementById('support-content');
    if (!container) return;

    container.innerHTML = data.sections.map(section => `
      <div class="support-section grid-12 mb-4xl">
        <div class="col-span-12 md:col-span-2 md:col-start-3">
          <h4>${section.titleEn} ${section.titleZh}</h4>
        </div>

        <div class="col-span-12 md:col-span-7 md:col-start-6 flex flex-col gap-2xl">
          ${section.subsections ? section.subsections.map((sub, i) => `
            <div class="${i > 0 ? 'mb-[0.25rem]' : ''}">
              <h5 class="${i === 0 ? 'mb-md' : 'mb-[0.25rem]'}">${sub.subtitleEn} ${sub.subtitleZh}</h5>

              ${sub.items ? `<div class="flex flex-col gap-md">
                ${sub.items.map((item, idx) => `
                  <div class="flex gap-sm">
                    <span class="text-p2 flex-shrink-0">${idx + 1}.</span>
                    <div>
                      <p class="text-p2">${item.en}</p>
                      <p class="text-p2">${item.zh}</p>
                      ${item.sub ? `<div class="flex flex-col gap-xs mt-xs">
                        ${item.sub.map((s, si) => `
                          <div class="flex gap-sm">
                            <span class="text-p2 flex-shrink-0">${String.fromCharCode(97 + si)}.</span>
                            <div>
                              <p class="text-p2">${s.en}</p>
                              <p class="text-p2">${s.zh}</p>
                            </div>
                          </div>
                        `).join('')}
                      </div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>` : ''}

              ${sub.note ? `<p class="text-p2">${sub.note.en} ${sub.note.zh}</p>` : ''}
              ${sub.contact ? `<p class="text-p2 mt-md">${sub.contact.en}<br>${sub.contact.zh}</p>` : ''}
            </div>
          `).join('') : ''}

          ${section.contact ? `<p class="text-p2">${section.contact.en}<br>${section.contact.zh}</p>` : ''}
        </div>
      </div>
    `).join('');

    const colors = ['var(--color-green)', 'var(--color-pink)', 'var(--color-blue)'];
    container.querySelectorAll('.support-link-plain').forEach(link => {
      link.addEventListener('mouseenter', () => {
        link.style.color = colors[Math.floor(Math.random() * colors.length)];
      });
      link.addEventListener('mouseleave', () => {
        link.style.color = '';
      });
    });

  } catch (error) {
    console.error('Error loading support data:', error);
  }
}
