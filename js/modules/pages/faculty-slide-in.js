/**
 * Faculty Slide-in Module
 * 處理師資頁面的側邊滑入詳情頁功能
 */

export function initFacultySlideIn() {
  const slideIn = document.getElementById('faculty-slide-in');
  const slideInPanel = document.getElementById('faculty-panel');
  const slideInOverlay = document.getElementById('faculty-overlay');
  const closeBtn = document.getElementById('faculty-close-btn');
  const backBtn = document.getElementById('faculty-back-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (!slideIn || facultyCards.length === 0) return;

  // Fetch faculty data from JSON
  fetch('../data/faculty.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - Check if data/faculty.json exists`);
      return response.json();
    })
    .then(data => {
      // Convert array to object for O(1) lookup (mapping ID to data)
      const facultyData = data.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      initializeFacultyInteractions(facultyData);
    })
    .catch(error => console.error('Error loading faculty data:', error));

  function initializeFacultyInteractions(facultyData) {
    // Function to load faculty data into slide-in panel
    function loadFacultyData(facultyId) {
      const data = facultyData[facultyId];
      if (!data) return;

      // Update image
      const imgElement = document.getElementById('faculty-detail-image');
      if (imgElement) imgElement.src = data.image;

      // Update name
      const nameEnElement = document.getElementById('faculty-detail-name-en');
      const nameZhElement = document.getElementById('faculty-detail-name-zh');
      if (nameEnElement) nameEnElement.textContent = data.nameEn;
      if (nameZhElement) nameZhElement.textContent = data.nameZh;

      // Update title
      const titleEnElement = document.getElementById('faculty-detail-title-en');
      const titleZhElement = document.getElementById('faculty-detail-title-zh');
      if (titleEnElement) titleEnElement.textContent = data.titleEn;
      if (titleZhElement) titleZhElement.textContent = data.titleZh;

      // Update sections
      const sectionsContainer = document.getElementById('faculty-detail-sections');
      if (sectionsContainer) {
        sectionsContainer.innerHTML = '';
        data.sections.forEach(section => {
          const sectionHTML = `
            <div class="flex gap-gutter">
              <div style="flex: 0 0 25%;">
                <h6 class="text-black">${section.titleEn} ${section.titleZh}</h6>
              </div>
              <div class="flex-1">
                <p class="text-p1" style="white-space: pre-line;">${section.content}</p>
              </div>
            </div>
          `;
          sectionsContainer.insertAdjacentHTML('beforeend', sectionHTML);
        });
      }
    }

    // Add click event to fulltime and admin faculty cards
    facultyCards.forEach(card => {
      const category = card.getAttribute('data-category');
      // Add click event to fulltime and admin cards
      if (category === 'fulltime' || category === 'admin') {
        const imageWrapper = card.querySelector('.faculty-card-image-wrapper');
        if (imageWrapper) {
          imageWrapper.addEventListener('click', function(e) {
            e.preventDefault();

            const facultyId = card.getAttribute('data-faculty-id');
            if (facultyId && slideIn) {
              // Load faculty data
              loadFacultyData(facultyId);

              // Show container
              slideIn.classList.remove('invisible', 'pointer-events-none');
              slideIn.classList.add('pointer-events-auto');

              // Animation Sequence: Overlay first, then Panel and Button slide in together
              if (typeof gsap !== 'undefined') {
                const tl = gsap.timeline();
                tl.to(slideInOverlay, { opacity: 0.8, duration: 0.3 })
                  .to([slideInPanel, backBtn], { x: '0%', duration: 0.5, ease: 'power3.out' }, '-=0');
              } else {
                // Fallback if GSAP is not loaded
                slideInOverlay.style.opacity = '0.8';
                slideInPanel.style.transform = 'translateX(0%)';
                if (backBtn) backBtn.style.transform = 'translateX(0%)';
              }

              // Prevent body scroll
              document.body.style.overflow = 'hidden';
            }
          });
        }
      }
    });
  }

  // Close functionality for Slide-in
  function closeSlideIn() {
    if (!slideIn) return;

    if (typeof gsap !== 'undefined') {
      gsap.to(slideInOverlay, { opacity: 0, duration: 0.4, delay: 0.1 });
      gsap.to([slideInPanel, backBtn], {
        x: '100%',
        duration: 0.5,
        ease: 'power3.in',
        onComplete: () => {
          slideIn.classList.add('invisible', 'pointer-events-none');
          slideIn.classList.remove('pointer-events-auto');
          document.body.style.overflow = '';
        }
      });
    } else {
      // Fallback
      slideInOverlay.style.opacity = '0';
      slideInPanel.style.transform = 'translateX(100%)';
      if (backBtn) backBtn.style.transform = 'translateX(100%)';
      setTimeout(() => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        document.body.style.overflow = '';
      }, 500);
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeSlideIn);
  if (backBtn) backBtn.addEventListener('click', closeSlideIn);
  if (slideInOverlay) slideInOverlay.addEventListener('click', closeSlideIn);
}