/**
 * BFA Division Toggle Module
 * Class 分組切換功能（Animation / Creative Media / MDES）
 */

export function initBFADivisionToggle() {
  const classDivisionButtons = document.querySelectorAll('.class-division-btn');
  const classDivisionContents = document.querySelectorAll('.class-division-content');
  
  // Mobile elements
  const mobilePrevBtn = document.getElementById('mobile-division-prev');
  const mobileNextBtn = document.getElementById('mobile-division-next');
  const mobileTitle = document.getElementById('mobile-division-title');

  if (classDivisionButtons.length === 0 || classDivisionContents.length === 0) return;

  const divisions = [
    { id: 'animation', titleEn: 'Division of Animation & Moving Image', titleZh: '動畫影像設計組' },
    { id: 'creative-media', titleEn: 'Division of Creative Media Design', titleZh: '創意媒體設計組' },
    { id: 'mdes', titleEn: 'MDES Class', titleZh: '碩士班' }
  ];

  let currentIndex = 0;

  function updateDisplay(index) {
    const division = divisions[index];

    // Update Content
    if (window.SCCDHelpers && window.SCCDHelpers.filterElements) {
      window.SCCDHelpers.filterElements(classDivisionContents, division.id, 'block', 'data-division');
    }

    // Update Desktop Buttons
    if (window.SCCDHelpers && window.SCCDHelpers.setActive) {
      const targetBtn = Array.from(classDivisionButtons).find(btn => btn.getAttribute('data-division') === division.id);
      if (targetBtn) {
        window.SCCDHelpers.setActive(targetBtn, classDivisionButtons);
      }
    }

    // Update Mobile Title
    if (mobileTitle) {
      mobileTitle.innerHTML = `
        <div class="text-h5 font-bold leading-tight">${division.titleEn}</div>
        <div class="text-h5 font-bold mt-1">${division.titleZh}</div>
      `;
    }
  }

  classDivisionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const id = this.getAttribute('data-division');
      const dataIndex = divisions.findIndex(d => d.id === id);
      if (dataIndex !== -1) {
        currentIndex = dataIndex;
        updateDisplay(currentIndex);
      }
    });
  });

  // Mobile Click Events
  if (mobilePrevBtn && mobileNextBtn) {
    mobilePrevBtn.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + divisions.length) % divisions.length;
      updateDisplay(currentIndex);
    });

    mobileNextBtn.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % divisions.length;
      updateDisplay(currentIndex);
    });
  }
}
