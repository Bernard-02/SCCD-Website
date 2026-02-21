/**
 * Timeline Module (About Page)
 * 處理大事記時間軸的滾動與切換邏輯
 */

export function initTimeline() {
  const timelineWrapper = document.querySelector('.timeline-wrapper');
  const stickyContainer = document.querySelector('.timeline-sticky-container');
  const timelineEra = document.getElementById('timeline-era');
  const timelineYearMobile = document.getElementById('timeline-year-mobile');
  const timelineYearsContainer = document.getElementById('timeline-years-container');
  const timelineText = document.getElementById('timeline-text');
  const timelineImage = document.getElementById('timeline-image');

  if (!timelineWrapper || !timelineEra || !stickyContainer) return;

  // Fetch Data from JSON
  fetch('../data/timeline.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load timeline.json');
      return response.json();
    })
    .then(data => {
      // Flatten the nested structure into a single array of years
      const allYears = [];
      data.forEach(eraGroup => {
        eraGroup.years.forEach(yearItem => {
          allYears.push({
            ...yearItem,
            eraTitle: eraGroup.era,
            eraLabel: eraGroup.label
          });
        });
      });

      initTimelineInteraction(allYears);
    })
    .catch(error => console.error('Error initializing timeline:', error));

  function initTimelineInteraction(items) {
    // Render Years List (Desktop)
    if (timelineYearsContainer) {
      timelineYearsContainer.innerHTML = items.map((item, i) => 
        `<div class="timeline-year-item text-h2 font-bold text-black transition-colors duration-300 cursor-pointer flex-shrink-0" data-index="${i}">${item.year}</div>`
      ).join('');
    }

    const yearElements = document.querySelectorAll('.timeline-year-item');

    // Helper: Update Content based on index
    const updateContent = (index) => {
      const item = items[index];
      if (!item) return;

      // Update Era
      timelineEra.innerHTML = `${item.eraTitle} Era ${item.eraLabel}時期`;
      
      // Update Mobile Year
      if (timelineYearMobile) {
        timelineYearMobile.textContent = item.year;
        timelineYearMobile.style.color = 'var(--color-pink)';
      }

      // Update Image (with fade transition)
      if (timelineImage) {
        const img = timelineImage.querySelector('img');
        if (img) {
          // Only animate if source changes
          if (img.getAttribute('src') !== item.image) {
            gsap.to(img, { opacity: 0, duration: 0.2, onComplete: () => {
              img.src = item.image;
              gsap.to(img, { opacity: 1, duration: 0.2 });
            }});
          }
        }
      }

      // Update Text (with fade transition)
      if (timelineText) {
        if (timelineText.innerHTML !== item.description) {
          gsap.to(timelineText, { opacity: 0, duration: 0.2, onComplete: () => {
            timelineText.innerHTML = item.description;
            gsap.to(timelineText, { opacity: 1, duration: 0.2 });
          }});
        }
      }

      // Highlight Active Year (Desktop)
      yearElements.forEach((el, i) => {
        if (i === index) {
          el.style.color = 'var(--color-pink)';
          
          // Align active year with Era label
          const eraRect = timelineEra.getBoundingClientRect();
          const targetX = eraRect.left - el.offsetLeft;

          gsap.to(timelineYearsContainer, {
            x: targetX,
            duration: 0.5,
            ease: "power2.out",
            overwrite: "auto"
          });
        } else {
          el.style.color = '';
        }
      });
    };

    // Initial Render
    updateContent(0);

    // Setup ScrollTrigger
    ScrollTrigger.matchMedia({
      // Desktop Logic
      "(min-width: 768px)": function() {
        // Calculate scroll distance based on number of items
        const scrollDistance = items.length * 400; // 400px per item
        gsap.set(timelineWrapper, { height: scrollDistance + window.innerHeight });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: timelineWrapper,
            start: "top 100px",
            end: "bottom bottom",
            scrub: 0.5,
            pin: stickyContainer,
            onUpdate: (self) => {
              const index = Math.min(Math.floor(self.progress * items.length), items.length - 1);
              updateContent(index);
            }
          }
        });
      },

      // Mobile Logic
      "(max-width: 767px)": function() {
        const scrollDistance = items.length * 600; // More scroll space for mobile
        gsap.set(timelineWrapper, { height: scrollDistance + window.innerHeight });

        ScrollTrigger.create({
          trigger: timelineWrapper,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
          onUpdate: (self) => {
            const index = Math.min(
              Math.floor(self.progress * items.length),
              items.length - 1
            );
            updateContent(index);
          }
        });
      }
    });
  }
}