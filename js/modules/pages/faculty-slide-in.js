/**
 * Faculty Slide-in Module
 * 處理師資頁面的側邊滑入詳情頁功能
 */

export function initFacultySlideIn() {
  const slideIn = document.getElementById('faculty-slide-in');
  const slideInPanel = document.getElementById('faculty-panel');
  const slideInOverlay = document.getElementById('faculty-overlay');
  const closeBtn = document.getElementById('faculty-close-btn');
  const backBtnMobile = document.getElementById('faculty-back-btn-mobile');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (!slideIn || facultyCards.length === 0) return;

  // Fetch faculty data from JSON
  fetch('/data/faculty.json')
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

  // 英文國名縮寫（中文保持原字）
  const COUNTRY_SHORT_EN = {
    'United States': 'US', 'United Kingdom': 'UK', 'Japan': 'JP',
    'France': 'FR', 'Germany': 'DE', 'Italy': 'IT', 'Netherlands': 'NL',
    'Spain': 'ES', 'Switzerland': 'CH', 'Australia': 'AU',
    'Canada': 'CA', 'South Korea': 'KR', 'China': 'CN', 'Taiwan': 'TW',
  };

  function shortCountry(name) {
    return COUNTRY_SHORT_EN[name] || name;
  }

  // 渲染 section 內容：grid 欄位版
  function renderSectionContent(section) {
    if (section.type === 'education' && section.items) {
      // 4 col: country | school | major | degree
      return section.items.map(item => {
        const hasBilingual = item.countryZh !== undefined;
        if (hasBilingual) {
          return `
            <div class="faculty-grid-row faculty-grid-4">
              <span>${shortCountry(item.countryZh)}<br>${shortCountry(item.countryEn)}</span>
              <span>${item.schoolZh}<br>${item.schoolEn}</span>
              <span>${item.majorZh}<br>${item.majorEn}</span>
              <span>${item.degreeZh}<br>${item.degreeEn}</span>
            </div>
          `;
        }
        return `
          <div class="faculty-grid-row faculty-grid-4">
            <span>${shortCountry(item.country || '')}</span>
            <span>${item.school || ''}</span>
            <span>${item.major || ''}</span>
            <span>${item.degree || ''}</span>
          </div>
        `;
      }).join('');
    }
    if (section.type === 'experience' && section.items) {
      // 3 col: year | organization | role
      return section.items.map(item => `
        <div class="faculty-grid-row faculty-grid-3">
          <span>${item.year || ''}</span>
          <span>${item.organization || ''}</span>
          <span>${item.role || ''}</span>
        </div>
      `).join('');
    }
    if (section.type === 'awards' && section.items) {
      // 3 col: year | name + work | award
      return section.items.map(item => {
        const nameWork = [item.name, item.work].filter(Boolean).join(' ');
        return `
          <div class="faculty-grid-row faculty-grid-3">
            <span>${item.year || ''}</span>
            <span>${nameWork}</span>
            <span>${item.award || ''}</span>
          </div>
        `;
      }).join('');
    }
    if (section.type === 'courses' && section.items) {
      return section.items.map(item => {
        const href = item.courseId && item.program
          ? `courses.html?program=${item.program}&item=${item.courseId}`
          : null;
        const inner = `<span>${item.titleEn}</span><span>${item.titleZh}</span>`;
        return href
          ? `<a href="${href}" class="faculty-grid-row faculty-grid-2 hover:underline">${inner}</a>`
          : `<div class="faculty-grid-row faculty-grid-2">${inner}</div>`;
      }).join('');
    }
    // fallback：純文字（parttime / admin）
    return `<p class="text-p2" style="white-space: pre-line;">${section.content || ''}</p>`;
  }

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
      if (nameEnElement) {
        nameEnElement.textContent = data.nameEn;
        const isDesktop = window.innerWidth >= 768;
        nameEnElement.style.transform = (data.type === 'fulltime' && isDesktop) ? 'rotate(4deg)' : '';
        nameEnElement.style.display = (data.type === 'fulltime' && isDesktop) ? 'inline-block' : '';
      }
      if (nameZhElement) {
        nameZhElement.textContent = data.nameZh;
        const isDesktop = window.innerWidth >= 768;
        nameZhElement.style.transform = (data.type === 'fulltime' && isDesktop) ? 'rotate(4deg)' : '';
        nameZhElement.style.display = (data.type === 'fulltime' && isDesktop) ? 'inline-block' : '';
      }

      // Update titles（支援單一 string 或多個 title 陣列）
      const titlesContainer = document.getElementById('faculty-detail-titles');
      if (titlesContainer) {
        const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const titlesEn = toArr(data.titleEn);
        const titlesZh = toArr(data.titleZh);
        const count = Math.max(titlesEn.length, titlesZh.length);
        let html = '';
        for (let i = 0; i < count; i++) {
          const en = titlesEn[i] || '';
          const zh = titlesZh[i] || '';
          // 多個 title 之間用 mb-sm 區隔；最後一個無 mb
          const isLast = i === count - 1;
          html += `<div${isLast ? '' : ' class="mb-sm"'}>` +
            `<h6 class="font-regular text-black">${en}</h6>` +
            `<h6 class="font-regular text-black">${zh}</h6>` +
            `</div>`;
        }
        titlesContainer.innerHTML = html;
      }

      // Update sections
      const sectionsContainer = document.getElementById('faculty-detail-sections');
      if (sectionsContainer) {
        sectionsContainer.innerHTML = '';
        data.sections.forEach(section => {
          if (section.type === 'courses') return; // 不渲染 courses 區塊
          const contentHTML = renderSectionContent(section);
          const sectionHTML = `
            <div class="flex flex-col md:flex-row gap-xs md:gap-gutter">
              <div class="w-full md:w-[25%] mb-xs md:mb-0">
                <h6 class="text-black">${section.titleEn} ${section.titleZh}</h6>
              </div>
              <div class="flex-1">
                ${contentHTML}
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
        card.addEventListener('click', function(e) {
          e.preventDefault();

          const facultyId = card.getAttribute('data-faculty-id');
          if (facultyId && slideIn) {
            // Load faculty data
            loadFacultyData(facultyId);

            // Apply card color to panel background
            const cardColor = getComputedStyle(card).getPropertyValue('--card-color').trim() || '#ffffff';
            slideInPanel.style.backgroundColor = cardColor;
            currentCardColor = cardColor;

            // Show container
            slideIn.classList.remove('invisible', 'pointer-events-none');
            slideIn.classList.add('pointer-events-auto');

            // Animation Sequence: Overlay first, then Panel and Button slide in together
            if (typeof gsap !== 'undefined') {
              cursorEnabled = false;
              const tl = gsap.timeline();
              tl.to(slideInOverlay, { opacity: 0.8, duration: 0.3 })
                .to(slideInPanel, { x: '0%', duration: 0.5, ease: 'power3.out', onComplete: () => { cursorEnabled = true; } }, '-=0');
            } else {
              // Fallback if GSAP is not loaded
              slideInOverlay.style.opacity = '0.8';
              slideInPanel.style.transform = 'translateX(0%)';
            }

            // Prevent body scroll
            document.body.style.overflow = 'hidden';
          }
        });
      }
    });
  }

  // Close functionality for Slide-in
  function closeSlideIn() {
    if (!slideIn) return;

    if (typeof gsap !== 'undefined') {
      gsap.to(slideInOverlay, { opacity: 0, duration: 0.4, delay: 0.1 });
      gsap.to(slideInPanel, {
        x: '110%',
        duration: 0.5,
        ease: 'power3.in',
        onComplete: () => {
          slideIn.classList.add('invisible', 'pointer-events-none');
          slideIn.classList.remove('pointer-events-auto');
          slideInPanel.style.backgroundColor = '';
          document.body.style.overflow = '';
        }
      });
    } else {
      // Fallback
      slideInOverlay.style.opacity = '0';
      slideInPanel.style.transform = 'translateX(110%)';
      // backBtn moves with panel
      setTimeout(() => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        document.body.style.overflow = '';
      }, 500);
    }
  }

  // Custom cursor on overlay (desktop only)
  const cursor = document.getElementById('faculty-cursor');
  let cursorEnabled = false;
  let currentCardColor = '#000000';

  function randRot() {
    // -4 到 6，排除 0
    let r;
    do { r = Math.floor(Math.random() * 11) - 4; } while (r === 0);
    return r;
  }

  function hideCursor(onComplete) {
    if (!cursor) { if (onComplete) onComplete(); return; }
    gsap.to(cursor, {
      opacity: 0,
      scale: 0,
      duration: 0.2,
      ease: 'power2.in',
      overwrite: true,
      onComplete: onComplete || null,
    });
  }

  function closeWithCursor() {
    cursorEnabled = false;
    hideCursor(() => closeSlideIn());
  }

  if (closeBtn) closeBtn.addEventListener('click', closeWithCursor);
  if (backBtnMobile) backBtnMobile.addEventListener('click', closeSlideIn);
  if (slideInOverlay) slideInOverlay.addEventListener('click', closeWithCursor);

  if (cursor && slideInOverlay && typeof gsap !== 'undefined') {
    // Track mouse position — 圓圈左上角貼在游標右下方
    slideInOverlay.addEventListener('mousemove', (e) => {
      gsap.to(cursor, {
        left: e.clientX + 6,
        top: e.clientY + 6,
        duration: 0.4,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    });

    // Show cursor on hover（只有 slide in 完成後才啟用）
    slideInOverlay.addEventListener('mouseenter', () => {
      if (!cursorEnabled) return;
      cursor.style.backgroundColor = currentCardColor;
      gsap.to(cursor, {
        opacity: 1,
        scale: 1,
        rotation: randRot(),
        duration: 0.3,
        ease: 'back.out(1.7)',
        overwrite: 'auto',
      });
    });

    // Hide cursor on leave
    slideInOverlay.addEventListener('mouseleave', () => {
      hideCursor();
    });
  }
}