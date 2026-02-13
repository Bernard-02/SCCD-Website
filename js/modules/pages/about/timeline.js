/**
 * Timeline Module (About Page)
 * 處理大事記時間軸的滾動與切換邏輯
 */

export function initTimeline() {
  const timelineWrapper = document.querySelector('.timeline-wrapper');
  const timelineEra = document.getElementById('timeline-era');
  const timelineYearsContainer = document.getElementById('timeline-years-container');
  const timelineText = document.getElementById('timeline-text');
  const timelineImage = document.getElementById('timeline-image');

  if (!timelineWrapper || !timelineEra || !timelineYearsContainer) return;

  // Fetch data from JSON file
  // 注意：路徑是相對於 HTML 檔案 (pages/about.html)
  fetch('../data/timeline.json')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - Check if data/timeline.json exists`);
      }
      return response.json();
    })
    .then(timelineData => {
      initializeTimelineLogic(timelineData);
    })
    .catch(error => console.error('Error loading timeline data:', error));

  function initializeTimelineLogic(timelineData) {
    // Flatten all years into a single array
    const allYears = [];
    timelineData.forEach(eraData => {
      eraData.years.forEach(yearData => {
        allYears.push({
          ...yearData,
          era: eraData.era,
          eraLabel: eraData.label
        });
      });
    });

    let currentYearIndex = -1; // 設為 -1 確保第一次執行時會更新

    // Render all years initially
    function renderAllYears() {
      timelineYearsContainer.innerHTML = allYears.map((yearData, idx) => {
        return `<h2 class="timeline-year text-black transition-colors duration-700 ease-in-out flex-shrink-0" data-index="${idx}">${yearData.year}</h2>`;
      }).join('');
    }

    // Function to update timeline display
    function updateTimeline(index) {
      if (index === currentYearIndex) return; // 避免重複執行
      currentYearIndex = Math.max(0, Math.min(index, allYears.length - 1));
      const currentYear = allYears[currentYearIndex];

      // Update era label
      timelineEra.textContent = `${currentYear.era} Era ${currentYear.eraLabel}時期`;

      // Update year colors
      const yearElements = timelineYearsContainer.querySelectorAll('.timeline-year');
      yearElements.forEach((el, idx) => {
        if (idx === currentYearIndex) {
          el.classList.remove('text-black');
          el.classList.add('text-pink');

          // Align active year with Era label
          // 取得 Era 標籤的螢幕 X 座標，並將當前年份移動到該位置
          const eraRect = timelineEra.getBoundingClientRect();
          const targetX = eraRect.left;
          const x = targetX - el.offsetLeft;

          if (typeof gsap !== 'undefined') {
            gsap.to(timelineYearsContainer, {
              x: x,
              duration: 0.5,
              ease: "power2.out",
              overwrite: "auto"
            });
          }
        } else {
          el.classList.remove('text-pink');
          el.classList.add('text-black');
        }
      });

      // Update content
      if (timelineText) {
        timelineText.innerHTML = `<p class="text-p1 leading-base">${currentYear.description}</p>`;
      }

      // Update Image
      if (timelineImage && currentYear.image) {
        timelineImage.innerHTML = `<img src="${currentYear.image}" alt="${currentYear.year}" class="w-full h-full object-cover">`;
        
        // Simple fade in animation
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(timelineImage.querySelector('img'), 
            { opacity: 0 }, 
            { opacity: 1, duration: 0.5, ease: "power2.out" }
          );
        }
      }
    }

    // Initialize timeline
    renderAllYears();
    updateTimeline(0);

    // GSAP ScrollTrigger Implementation
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      ScrollTrigger.create({
        trigger: timelineWrapper,
        start: "top 100px",
        end: "bottom bottom",
        scrub: 0.5,
        onUpdate: (self) => {
          const extendedLength = allYears.length + 0.5;
          const index = Math.min(
            allYears.length - 1,
            Math.round(self.progress * extendedLength)
          );
          updateTimeline(index);
        }
      });
    }
  }
}