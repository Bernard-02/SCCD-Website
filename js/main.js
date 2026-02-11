/**
 * Main JavaScript for SCCD Website
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

  // --- Header: fetch shared header.html and initialise after insert ---
  function initHeader() {
    const header = document.querySelector('header');
    if (!header) return;

    // Set --header-height CSS variable for mega menu positioning
    function setHeaderHeight() {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
    setHeaderHeight();
    window.addEventListener('resize', setHeaderHeight);

    // Nav active state: highlight parent nav-link + matching submenu-link
    let currentPage = window.location.pathname.split('/').pop();

    // Handle detail pages: map them to their parent navigation item
    const pageMappings = {
      'admission-detail.html': 'admission.html',
      'degree-show-detail.html': 'degree-show.html',
      'faculty-detail.html': 'faculty.html'
    };

    if (pageMappings[currentPage]) {
      currentPage = pageMappings[currentPage];
    }

    document.querySelectorAll('nav > ul > li').forEach(li => {
      const parentLink = li.querySelector(':scope > a.nav-link');
      const subLinks = li.querySelectorAll('.submenu-link');

      // Top-level link（無 submenu）直接比對
      if (subLinks.length === 0 && parentLink && parentLink.getAttribute('href') === currentPage) {
        parentLink.classList.add('active');
      }

      // Submenu link 比對，順便標記上層
      subLinks.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
          parentLink.classList.add('active');
          link.classList.add('active');
        }
      });
    });

    // Header Hide on Footer Reveal
    const mainContent = document.querySelector('main');
    if (mainContent) {
      window.addEventListener('scroll', () => {
        const mainRect = mainContent.getBoundingClientRect();
        // 當 Main 內容的底部進入視窗一半時（Footer 露出一半時）才隱藏 Header
        if (mainRect.bottom < window.innerHeight * 0.5) {
          header.classList.add('header-hidden');
        } else {
          header.classList.remove('header-hidden');
        }
      });
    }
  }

  const headerContainer = document.getElementById('site-header');
  if (headerContainer) {
    // Header loaded via fetch (shared header.html)
    fetch('header.html')
      .then(res => res.text())
      .then(html => {
        headerContainer.innerHTML = html;
        initHeader();
      });
  } else {
    // Fallback: header already in the page (e.g. index.html)
    initHeader();
  }

  // --- Footer: fetch shared footer.html ---
  const footerContainer = document.getElementById('site-footer');
  if (footerContainer) {
    fetch('footer.html')
      .then(res => res.text())
      .then(html => {
        footerContainer.innerHTML = html;
        initFooterDraggable(); // Initialize draggable after fetch
      });
  }

  // Initialize Footer Draggable Elements
  function initFooterDraggable() {
    if (typeof Draggable === 'undefined') return;

    // Select absolute positioned elements inside the footer's main column
    // This selector works for both static (index.html) and dynamic (site-footer) footers
    const footerElements = document.querySelectorAll('footer .col-span-12 > .absolute');

    if (footerElements.length > 0) {
      Draggable.create(footerElements, {
        type: "x,y",
        edgeResistance: 0.65,
        bounds: "footer", // Keep elements within the footer area
        inertia: true,
        onPress: function() {
          this.target.style.cursor = "grabbing";
        },
        onRelease: function() {
          this.target.style.cursor = "grab";
        },
        // Add collision detection during drag and inertia
        onDrag: function() {
          handleCollision(this);
        },
        onThrowUpdate: function() {
          handleCollision(this);
        }
      });

      // Set initial cursor style
      gsap.set(footerElements, { cursor: "grab" });
    }

    // Helper: Collision Detection & Repulsion Logic
    function handleCollision(draggable) {
      const footer = document.querySelector('footer');
      const bounds = footer ? footer.getBoundingClientRect() : null;

      footerElements.forEach(el => {
        // Skip the element currently being dragged
        if (el === draggable.target) return;

        // Check if they overlap
        if (draggable.hitTest(el)) {
          // Calculate center points to determine push direction
          const r1 = draggable.target.getBoundingClientRect();
          const r2 = el.getBoundingClientRect();
          const c1x = r1.left + r1.width / 2;
          const c1y = r1.top + r1.height / 2;
          const c2x = r2.left + r2.width / 2;
          const c2y = r2.top + r2.height / 2;

          // Calculate vector
          let dx = c2x - c1x;
          let dy = c2y - c1y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 12; // Repulsion force (pixels per update)

          let pushX = (dx / dist) * force;
          let pushY = (dy / dist) * force;

          // Boundary checks to keep elements inside footer
          if (bounds) {
            // Left
            if (r2.left + pushX < bounds.left) {
              pushX = bounds.left - r2.left;
            }
            // Right
            if (r2.right + pushX > bounds.right) {
              pushX = bounds.right - r2.right;
            }
            // Top
            if (r2.top + pushY < bounds.top) {
              pushY = bounds.top - r2.top;
            }
            // Bottom
            if (r2.bottom + pushY > bounds.bottom) {
              pushY = bounds.bottom - r2.bottom;
            }
          }

          // Push the other element away
          gsap.to(el, {
            x: `+=${pushX}`,
            y: `+=${pushY}`,
            duration: 0.1,
            overwrite: "auto",
            ease: "power1.out"
          });
        }
      });
    }
  }

  // Try initializing immediately (for pages with static footer like index.html)
  initFooterDraggable();

  // Faculty filter functionality
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');
  const facultyCardsGrid = document.getElementById('faculty-cards-grid');

  console.log('Filter buttons found:', filterButtons.length);
  console.log('Faculty cards found:', facultyCards.length);

  if (filterButtons.length > 0 && facultyCards.length > 0) {
    filterButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent default button behavior
        console.log('Button clicked:', this.getAttribute('data-filter'));

        // Remove active class from all buttons
        filterButtons.forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        this.classList.add('active');

        // Get filter value
        const filterValue = this.getAttribute('data-filter');

        // Adjust grid columns based on filter
        if (facultyCardsGrid) {
          if (filterValue === 'fulltime') {
            // Fulltime: 3 columns
            facultyCardsGrid.classList.remove('grid-cols-4');
            facultyCardsGrid.classList.add('grid-cols-3');
          } else {
            // Parttime and Admin: 4 columns
            facultyCardsGrid.classList.remove('grid-cols-3');
            facultyCardsGrid.classList.add('grid-cols-4');
          }
        }

        // Filter cards
        facultyCards.forEach(card => {
          const cardCategory = card.getAttribute('data-category');

          if (cardCategory === filterValue) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });

        // Scroll to the anchor with smooth behavior
        const anchor = document.getElementById('faculty-cards');
        if (anchor) {
          anchor.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }

        // Blur the button to prevent focus scroll
        this.blur();
      });
    });

    // Initialize: show only fulltime cards on page load (3 columns)
    facultyCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      if (cardCategory === 'fulltime') {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Faculty Data
  const facultyData = {
    1: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Ta-Lih Shieh',
      nameZh: '謝大立',
      titleEn: 'Founder',
      titleZh: '創辦人',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Pratt Institute Industrial Design, US | MID
美國普瑞特藝術學院工業設計研究所 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學 | 校董事
實踐大學時尚與媒體設計研究所 | 副教授兼所長
實踐大學媒體傳達設計學系 | 副教授兼系主任
實踐大學工業設計研究所 | 專任副教授
實踐大學視覺傳達設計學系 | 副教授兼系主任
實踐設計管理學院工業產品設計學系 | 專任講師
實踐設計管理學院室內空間設計學系 | 專任講師
實踐大學應用美術學系 | 專任講師
實踐大學校園規劃興建 | 委員
中華民國工業設計學會 | 理事
中華民國外貿協會設計處 | 設計專員
中華民國平面設計協會 TOP STAR | 作品評審委員
行政院文建會國家藝術村方向研究計劃 | 諮詢委員
全國工業類技職教育一貫課程規劃 | 設計組委員
經濟部工業局98年度文化創意產業優惠貸款計畫設計業 | 技術審查委員
教育部文藝獎設計類 | 評審委員
國家工藝獎綜合決審會 | 評審委員
臺北市立美術館美術品典藏審議委員會 | 審議委員會委員
ELLE STYLE AWARDS 風格人物大賞 | 專業評審團
財團法人臺北市學學文創教育基金會 | 兼任董事
美國現代美術館「創新媒材與當代設計」巡迴展台灣站 | 空間展場與視覺形象規劃設計`
        },
        {
          titleEn: 'Awards',
          titleZh: '獲獎',
          content: `德國紅點設計獎 | 最佳品質設計教育獎 | 獲獎
德國 Design Kalender 設計年鑑 | 收錄德國 Output 設計年鑑 |收錄
義大利 MISURA EMUE 傢具公司國際設計競賽 | 創意作品
日本大阪國際設計競賽 | 銅牌大賞
日本大阪國際設計競賽 | 傑出作品
日本名古屋國際設計大賽指導 | 銀獎、評審團大賞
日本福岡亞洲數位藝術大賽 | 動態影像類組 | 入圍賞
國際 Swarovski 水晶設計競賽 | 首獎`
        }
      ]
    },
    2: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Rex Takeshi Chen',
      nameZh: '陳威志',
      titleEn: 'Associate Professor',
      titleZh: '副教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `National Taiwan University | PhD in Design
國立臺灣大學設計學系 | 博士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 副教授
台北市立美術館 | 策展人
台灣設計協會 | 理事`
        }
      ]
    },
    3: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 3',
      nameZh: '教授名字 3',
      titleEn: 'Assistant Professor',
      titleZh: '助理教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Royal College of Art, UK | MA in Communication Design
英國皇家藝術學院傳達設計系 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 助理教授
自由設計師 | 平面設計與品牌顧問`
        }
      ]
    },
    4: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 4',
      nameZh: '教授名字 4',
      titleEn: 'Assistant Professor',
      titleZh: '助理教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Parsons School of Design, US | MFA
美國帕森設計學院 | 藝術碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 助理教授
國際設計競賽 | 評審委員`
        }
      ]
    },
    5: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 5',
      nameZh: '教授名字 5',
      titleEn: 'Lecturer',
      titleZh: '講師',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `實踐大學媒體傳達設計學系 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 講師
數位媒體設計工作室 | 創意總監`
        }
      ]
    },
    6: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 6',
      nameZh: '教授名字 6',
      titleEn: 'Lecturer',
      titleZh: '講師',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `國立台北科技大學設計學院 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 講師
品牌設計顧問公司 | 資深設計師`
        }
      ]
    },
    7: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 7',
      nameZh: '教授名字 7',
      titleEn: 'Lecturer',
      titleZh: '講師',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `實踐大學時尚與媒體設計研究所 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 講師
動態影像設計工作室 | 設計總監`
        }
      ]
    },
    8: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 8',
      nameZh: '教授名字 8',
      titleEn: 'Assistant Professor',
      titleZh: '助理教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Savannah College of Art and Design | MFA
美國薩凡納藝術設計學院 | 藝術碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 助理教授
互動媒體設計 | 專業顧問`
        }
      ]
    },
    9: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 9',
      nameZh: '教授名字 9',
      titleEn: 'Associate Professor',
      titleZh: '副教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `國立台灣師範大學設計學系 | 博士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 副教授
台灣平面設計協會 | 常務理事`
        }
      ]
    },
    10: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 10',
      nameZh: '教授名字 10',
      titleEn: 'Professor',
      titleZh: '教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Tokyo University of the Arts | PhD
日本東京藝術大學 | 博士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 教授
亞洲設計聯盟 | 理事長`
        }
      ]
    },
    11: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 11',
      nameZh: '教授名字 11',
      titleEn: 'Lecturer',
      titleZh: '講師',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `實踐大學媒體傳達設計學系 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 講師
包裝設計工作室 | 創意總監`
        }
      ]
    },
    12: {
      image: '../images/S__6742028.jpg',
      nameEn: 'Professor Name 12',
      nameZh: '教授名字 12',
      titleEn: 'Assistant Professor',
      titleZh: '助理教授',
      sections: [
        {
          titleEn: 'Education',
          titleZh: '學歷',
          content: `Goldsmiths, University of London | MA in Design
英國倫敦大學金匠學院設計系 | 碩士`
        },
        {
          titleEn: 'Experience',
          titleZh: '經歷',
          content: `實踐大學媒體傳達設計學系 | 助理教授
UI/UX 設計顧問 | 使用者經驗設計專家`
        }
      ]
    },
    'admin-1': {
      image: '../images/S__6742028.jpg',
      nameEn: 'Secretary Name 1',
      nameZh: '執行秘書 1',
      titleEn: 'Secretary',
      titleZh: '執行秘書',
      sections: [
        {
          titleEn: 'Contact',
          titleZh: '聯絡資訊',
          content: `Email: secretary1@sccd.edu.tw
Phone: +886-2-1234-5678`
        }
      ]
    },
    'admin-2': {
      image: '../images/S__6742028.jpg',
      nameEn: 'Secretary Name 2',
      nameZh: '執行秘書 2',
      titleEn: 'Secretary',
      titleZh: '執行秘書',
      sections: [
        {
          titleEn: 'Contact',
          titleZh: '聯絡資訊',
          content: `Email: secretary2@sccd.edu.tw
Phone: +886-2-1234-5679`
        }
      ]
    }
  };

  // Slide-in elements
  const slideIn = document.getElementById('faculty-slide-in');
  const slideInPanel = document.getElementById('faculty-panel');
  const slideInOverlay = document.getElementById('faculty-overlay');
  const closeBtn = document.getElementById('faculty-close-btn');
  const backBtn = document.getElementById('faculty-back-btn');

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
            const tl = gsap.timeline();
            tl.to(slideInOverlay, { opacity: 0.8, duration: 0.3 })
              .to([slideInPanel, backBtn], { x: '0%', duration: 0.5, ease: 'power3.out' }, '-=0');

            // Prevent body scroll
            document.body.style.overflow = 'hidden';
          }
        });
      }
    }
  });

  // Close functionality for Slide-in
  function closeSlideIn() {
    if (!slideIn) return;

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
  }

  if (closeBtn) closeBtn.addEventListener('click', closeSlideIn);
  if (backBtn) backBtn.addEventListener('click', closeSlideIn);
  if (slideInOverlay) slideInOverlay.addEventListener('click', closeSlideIn);

  // Courses filter functionality
  const coursesFilterButtons = document.querySelectorAll('.courses-filter-btn');
  const coursesYearGroups = document.querySelectorAll('.courses-year-group');

  if (coursesFilterButtons.length > 0 && coursesYearGroups.length > 0) {
    coursesFilterButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault();

        coursesFilterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        const filterValue = this.getAttribute('data-filter');

        coursesYearGroups.forEach(group => {
          group.style.display = group.getAttribute('data-year') === filterValue ? 'block' : 'none';
        });

        // Scroll to the courses section
        const coursesSection = document.querySelector('.courses-content-section');
        if (coursesSection) {
          coursesSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }

        this.blur();
      });
    });
  }

  // Activities: dynamically apply first/last/middle styles per year group
  function updateActivitiesItemStyles() {
    document.querySelectorAll('.activities-year-items').forEach(yearGroup => {
      const visible = [];
      yearGroup.querySelectorAll('.activities-item').forEach(item => {
        if (item.style.display !== 'none') visible.push(item);
      });

      visible.forEach((item, idx) => {
        item.classList.remove('pt-xs', 'pt-md', 'pb-xs', 'pb-md', 'py-md');

        if (visible.length === 1) {
          item.classList.add('pt-xs', 'pb-xs');
        } else if (idx === 0) {
          item.classList.add('pt-xs', 'pb-md');
        } else if (idx === visible.length - 1) {
          item.classList.add('pt-md', 'pb-xs');
        } else {
          item.classList.add('py-md');
        }

        if (idx === visible.length - 1) {
          item.classList.remove('border-b', 'border-gray-9');
        } else {
          item.classList.add('border-b', 'border-gray-9');
        }
      });
    });
  }

  // Activities filter functionality
  const activitiesFilterButtons = document.querySelectorAll('.activities-filter-btn');
  const activitiesItems = document.querySelectorAll('.activities-item');

  if (activitiesFilterButtons.length > 0 && activitiesItems.length > 0) {
    activitiesFilterButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault();

        activitiesFilterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        const filterValue = this.getAttribute('data-filter');

        activitiesItems.forEach(item => {
          if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
            item.style.display = 'grid';
          } else {
            item.style.display = 'none';
          }
        });

        updateActivitiesItemStyles();

        // Scroll to the activities section
        const activitiesSection = document.querySelector('.activities-content-section');
        if (activitiesSection) {
          activitiesSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }

        this.blur();
      });
    });

    // Initialize styles on page load
    updateActivitiesItemStyles();
  }

  // Activities item hover → preview image (absolute, between name and location)
  if (activitiesItems.length > 0) {
    const categoryColors = {
      'seminars':    '#C8E6C9',
      'visits':      '#BBDEFB',
      'exhibitions': '#FFE0B2',
      'conferences': '#E1BEE7',
      'competitions':'#F8BBD0',
    };

    // Create a single reusable preview element
    const previewBlock = document.createElement('div');
    // Initial styles: hidden, centered vertically (top: 50%), fixed width
    previewBlock.style.cssText = 'position:absolute;aspect-ratio:4/3;z-index:50;pointer-events:none;overflow:hidden;top:50%;left:calc(50% - 150px);width:300px;opacity:0;visibility:hidden;';

    const previewImg = document.createElement('img');
    previewImg.alt = 'Activity Preview';
    previewImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    previewBlock.appendChild(previewImg);

    activitiesItems.forEach(item => {
      item.style.position = 'relative';

      item.addEventListener('mouseenter', function() {
        const category = this.getAttribute('data-category');
        previewBlock.style.backgroundColor = categoryColors[category] || '#E6E6E6';
        previewImg.src = '../images/SCCD-1-4-0.jpg';

        // Append to current item if not already there
        if (previewBlock.parentNode !== this) {
          this.appendChild(previewBlock);
        }

        // Random rotation (-3 to +3 deg)
        const rot = Math.random() * 6 - 3;

        // GSAP Set (Instant Appear, No Fade)
        gsap.set(previewBlock, {
          autoAlpha: 1,
          scale: 1,
          yPercent: -50,
          rotation: rot,
          overwrite: true
        });
      });

      item.addEventListener('mouseleave', function() {
        // Instant Disappear (No Fade)
        gsap.set(previewBlock, { autoAlpha: 0, overwrite: true });
        if (previewBlock.parentNode === this) {
          this.removeChild(previewBlock);
        }
      });
    });
  }

  // Activities year toggle functionality
  const activitiesYearToggles = document.querySelectorAll('.activities-year-toggle');

  activitiesYearToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      // Find the year group container (parent of the grid)
      const yearGrid = this.closest('.grid.grid-cols-11');

      if (!yearGrid) return;

      // Find the chevron and items container within this year group
      const chevron = yearGrid.querySelector('.fa-chevron-right');
      const itemsContainer = yearGrid.querySelector('.activities-year-items');

      if (itemsContainer) {
        // Check if currently open (either no style.display set, or set to 'flex')
        const isOpen = itemsContainer.style.display !== 'none';

        if (isOpen) {
          itemsContainer.style.display = 'none';
          if (chevron) chevron.classList.remove('rotate-90');
        } else {
          itemsContainer.style.display = 'flex';
          if (chevron) chevron.classList.add('rotate-90');
        }
      }
    });
  });

  // Works filter functionality
  const worksFilterButtons = document.querySelectorAll('.works-filter-btn');
  const worksContents = document.querySelectorAll('.works-content');

  if (worksFilterButtons.length > 0 && worksContents.length > 0) {
    // Set all buttons to the same width as the widest button
    let maxWidth = 0;
    worksFilterButtons.forEach(button => {
      const width = button.offsetWidth;
      if (width > maxWidth) {
        maxWidth = width;
      }
    });
    worksFilterButtons.forEach(button => {
      button.style.width = `${maxWidth}px`;
    });

    worksFilterButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault();

        worksFilterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        const filterValue = this.getAttribute('data-filter');

        worksContents.forEach(content => {
          if (content.getAttribute('data-category') === filterValue) {
            content.style.display = 'block';
          } else {
            content.style.display = 'none';
          }
        });

        // Scroll to the works section
        const worksSection = document.getElementById('works-section');
        if (worksSection) {
          worksSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }

        this.blur();
      });
    });
  }

  // About page anchor navigation
  const anchorNav = document.getElementById('anchor-nav');
  const anchorNavButtons = document.querySelectorAll('.anchor-nav-btn');

  if (anchorNav && anchorNavButtons.length > 0) {
    // Handle anchor navigation clicks
    anchorNavButtons.forEach(button => {
      button.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);

        if (targetSection) {
          // Get the section's position and scroll with offset
          const yOffset = 0; // Align to top of section
          const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;

          window.scrollTo({
            top: y,
            behavior: 'smooth'
          });
        }

        this.blur();
      });
    });

    // Highlight active anchor based on scroll position
    window.addEventListener('scroll', function() {
      const sections = ['overview', 'bfa-class', 'mdes-class', 'resources', 'alumni'];
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      let activeSection = null;

      sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
          const rect = section.getBoundingClientRect();

          // Check if the section's top is at or above the viewport top (y = 0)
          // Use a small threshold to account for rounding
          if (rect.top <= 50 && rect.bottom > 50) {
            activeSection = sectionId;
          }
        }
      });

      if (activeSection) {
        anchorNavButtons.forEach(btn => {
          if (btn.getAttribute('data-target') === activeSection) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      }
    });
  }

  // About page timeline
  const timelineWrapper = document.querySelector('.timeline-wrapper');
  const timelineEra = document.getElementById('timeline-era');
  const timelineYearsContainer = document.getElementById('timeline-years-container');
  const timelineImage = document.getElementById('timeline-image');
  const timelineText = document.getElementById('timeline-text');

  if (timelineWrapper && timelineEra && timelineYearsContainer) {
    // Timeline data structure
    const timelineData = [
      { era: '(Junior) College', label: '專科學校', years: [
        { year: 1958, description: '<div>Shih Chien College of Home Economics established</div><div class="mt-xs">實踐家政專科學校成立</div>' },
        { year: 1971, description: '<div>Department of Arts and Crafts established</div><div class="mt-xs">設立 美術工藝科</div>' },
        { year: 1979, description: '<div>Shih Chien College of Home Economics renamed as Shih Chien College of Home Economics and Economics</div><div class="mt-xs">實踐家政專科學校 更名為 實踐家政經濟專科學校</div>' },
        { year: 1984, description: '<div>• Department of Arts and Crafts renamed as Department of Applied Arts</div><div class="mt-xs">美術工藝科 更名為 應用美術科</div><div class="mt-lg">• Division of Visual Communication Design established</div><div class="mt-xs">設立 視覺傳達設計組</div>' }
      ]},
      { era: 'College', label: '學院', years: [
        { year: 1991, description: '<div>Shih Chien College of Home Economics and Economics upgraded to & renamed as Shih Chien College of Design and Management</div><div class="mt-xs">實踐家政經濟專科學校 改制並更名為 實踐設計管理學院</div>' }
      ]},
      { era: 'University', label: '大學', years: [
        { year: 1997, description: '<h5 class="mb-md">BFA 學士班</h5><div>• Shih Chien College of Design and Management renamed as <strong>Shih Chien University</strong></div><div class="mt-xs">實踐設計管理學院 更名為 <strong>實踐大學</strong></div><div class="mt-lg">• College of Design established</div><div class="mt-xs">設立 設計學院</div><div class="mt-lg">• Department of Visual Communication Design established</div><div class="mt-xs">設立 視覺傳達設計學系</div>' },
        { year: 2000, description: '<h5 class="mb-md">BFA 學士班</h5><div>Department of Visual Communication Design renamed as <strong>Department of Communications Design</strong></div><div class="mt-xs">視覺傳達設計學系 更名為 <strong>媒體傳達設計學系</strong></div>' },
        { year: 2004, description: '<h5 class="mb-md">BFA 學士班</h5><div>• Division of Digital 3D Animation Design established</div><div class="mt-xs">設立 數位 3D 動畫設計組</div><div class="mt-lg">• Division of Digital Creative Game Design established</div><div class="mt-xs">設立 數位遊戲創意設計組</div><h5 class="mb-md mt-2xl">MDES 碩士班</h5><div>Institute of Fashion and Communications Design established (with Institute of Fashion Design)</div><div class="mt-xs">設立 時尚與媒體設計研究所（與服裝設計研究所）</div>' },
        { year: 2009, description: '<h5 class="mb-md">MDES 碩士班</h5><div>Division of Digital Media Design established</div><div class="mt-xs">設立 數位媒體設計組</div>' },
        { year: 2011, description: '<h5 class="mb-md">MDES 碩士班</h5><div>Division of Digital Media Design, IFCD merged into (Merge Department and Institute Into One) Master Class & <strong>Master Class for Working Professionals, SCCD</strong></div><div class="mt-xs">時尚與媒體設計研究所數位媒體設計組 整併（系所合一）為 <strong>媒體傳達設計學系碩士班與碩士在職專班</strong></div>' },
        { year: 2012, description: '<h5 class="mb-md">BFA 學士班</h5><div>Division of Digital Creative Game Design renamed as Division of Innovative Media Design</div><div class="mt-xs">數位遊戲創意設計組 更名為 創新媒體設計組</div>' },
        { year: 2013, description: '<h5 class="mb-md">MDES 碩士班</h5><div>Master Class for Working Professionals stop enrollment</div><div class="mt-xs">碩士在職專班 停招</div>' },
        { year: 2017, description: '<h5 class="mb-md">BFA 學士班</h5><div>Division of Innovative Media Design renamed as Division of Creative Media Design</div><div class="mt-xs">創新媒體設計組 更名為 創意媒體設計組</div>' },
        { year: 2023, description: '<h5 class="mb-md">BFA 學士班</h5><div>Division of Digital 3D Animation Design renamed as Division of Animation & Moving Image</div><div class="mt-xs">數位 3D 動畫設計組 更名為 動畫影像設計組</div>' }
      ]}
    ];

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
        } else {
          el.classList.remove('text-pink');
          el.classList.add('text-black');
        }
      });

      // Position update: Snap current year to the left
      if (yearElements[currentYearIndex]) {
        const currentYearElement = yearElements[currentYearIndex];
        const offsetLeft = currentYearElement.offsetLeft;

        gsap.to(timelineYearsContainer, {
          x: -offsetLeft,
          duration: 0.6,
          ease: "power2.out",
          overwrite: true
        });
      }

      // Update content
      timelineText.innerHTML = `<p class="text-p1 leading-base">${currentYear.description}</p>`;
    }

    // Initialize timeline
    renderAllYears();
    updateTimeline(0);

    // GSAP ScrollTrigger Implementation
    gsap.registerPlugin(ScrollTrigger);

    ScrollTrigger.create({
      trigger: timelineWrapper,
      start: "top 100px",
      end: "bottom bottom",
      scrub: 0.5, // 輕微的緩衝，讓進度計算更自然
      onUpdate: (self) => {
        // 使用之前的邏輯：增加 0.5 的緩衝長度，讓最後一年停留久一點
        const extendedLength = allYears.length + 0.5;
        const index = Math.min(
          allYears.length - 1,
          Math.round(self.progress * extendedLength)
        );
        updateTimeline(index);
      }
    });
  }

  // Horizontal Accordion functionality
  const accordionPanels = document.querySelectorAll('.accordion-panel');

  if (accordionPanels.length > 0) {
    let activePanel = null;

    accordionPanels.forEach((panel, index) => {
      const isFirst = index === 0;
      const overlay = panel.querySelector('.accordion-overlay');
      const content = panel.querySelector('.accordion-content');
      const img = panel.querySelector('img');

      // 1. Initialization
      // Reset GSAP states
      gsap.killTweensOf([panel, overlay, content, img]);

      if (isFirst) {
        activePanel = panel;
        gsap.set(panel, { flexGrow: 8, flexBasis: "0%" }); // Expanded ratio (8)
        gsap.set(overlay, { opacity: 1 });
        gsap.set(content, { opacity: 1 });
      } else {
        gsap.set(panel, { flexGrow: 1 }); // Collapsed ratio (1)
        gsap.set(overlay, { opacity: 0 });
        gsap.set(content, { opacity: 0 });
      }
      // Ensure image is standard scale (no zoom effect)
      gsap.set(img, { scale: 1 });

      // 2. Click Event
      panel.addEventListener('click', function() {
        // If clicking the already active panel, do nothing
        if (this === activePanel) return;

        const prevPanel = activePanel;
        const nextPanel = this;
        activePanel = nextPanel;

        // 關鍵修正：強制停止所有正在進行的動畫，避免 onComplete 在錯誤時間觸發
        if (prevPanel) {
          gsap.killTweensOf([prevPanel, prevPanel.querySelector('.accordion-overlay'), prevPanel.querySelector('.accordion-content')]);
        }
        gsap.killTweensOf([nextPanel, nextPanel.querySelector('.accordion-overlay'), nextPanel.querySelector('.accordion-content')]);

        // --- Animate Previous Panel (Shrink) ---
        // Immediately hide content/overlay
        gsap.to([prevPanel.querySelector('.accordion-overlay'), prevPanel.querySelector('.accordion-content')], {
          opacity: 0,
          duration: 0.3,
          ease: "power2.out"
        });

        // Shrink width
        gsap.to(prevPanel, {
          flexGrow: 1,
          duration: 0.6,
          ease: "power2.inOut"
        });

        // --- Animate Next Panel (Expand) ---
        // Show overlay immediately (during expansion)
        gsap.to(nextPanel.querySelector('.accordion-overlay'), {
          opacity: 1,
          duration: 0.6,
          ease: "power2.inOut"
        });

        // Expand width
        gsap.to(nextPanel, {
          flexGrow: 8,
          duration: 0.6,
          ease: "power2.inOut",
          onComplete: () => {
            // Show content AFTER expansion finishes
            // 雙重保險：確認目前這個面板還是 Active 狀態才顯示文字
            if (activePanel === nextPanel) {
              gsap.to(nextPanel.querySelector('.accordion-content'), {
                opacity: 1,
                duration: 0.4,
                ease: "power2.out"
              });
            }
          }
        });
      });
    });
  }

  // BFA Division Toggle functionality
  const bfaDivisionButtons = document.querySelectorAll('.bfa-division-btn');
  const bfaDivisionContents = document.querySelectorAll('.bfa-division-content');

  if (bfaDivisionButtons.length > 0 && bfaDivisionContents.length > 0) {
    bfaDivisionButtons.forEach(button => {
      button.addEventListener('click', function() {
        const targetDivision = this.getAttribute('data-division');

        // Update button states
        bfaDivisionButtons.forEach(btn => {
          btn.classList.remove('active');
        });
        this.classList.add('active');

        // Update content visibility
        bfaDivisionContents.forEach(content => {
          if (content.getAttribute('data-division') === targetDivision) {
            content.style.display = 'block';
          } else {
            content.style.display = 'none';
          }
        });
      });
    });
  }

  // Resources Section - Cycling Content with 7 Segments
  const resourcesSegments = document.querySelectorAll('.resources-segment');
  const resourcesTitle = document.getElementById('resources-title');
  const resourcesTextEn = document.getElementById('resources-text-en');
  const resourcesTextZh = document.getElementById('resources-text-zh');

  if (resourcesSegments.length > 0 && resourcesTitle && resourcesTextEn && resourcesTextZh) {
    // Content data for 7 sections
    const resourcesContent = [
      {
        title: 'Teaching Space 教學空間',
        textEn: 'The main teaching area of the department is located in the Tung-Min Memorial Building, and the entire Taipei campus is used as an extended learning and creative space. Tung-Min Memorial Building is different from the closed structure of traditional colleges. It embodies the simple texture of “Less is More” with open design combined with modern craftsmanship aesthetics. Experience the journey of free creation and self-exploration in a learning environment that can be multiplied and amplified by thinking.',
        textZh: '學系主要教學場域位於東閔紀念大樓，並以整個台北校園為延伸學習與創作空間。東閔紀念大樓有別於傳統學院封閉式結構，以開放性設計結合現代工藝美學體現 “Less is More” 之簡約質感，摒除傳統建築裝飾性以清水模設計施作，將學生置放於把五感與思維都能加乘放大之學習環境中，經歷自由創作與探索自我的旅程。'
      },
      {
        title: 'Academic Library 學術圖書館',
        textEn: 'Shih Chien University Library has a collection of 490,000 volumes, more than 2,000 kinds of periodicals, and a large number of design and art-related books. E-books, audio-visual materials and electronic materials are also extremely rich and complete, which can be accessed by students anytime. In addition to the on-campus collections, Shih Chien University has also joined the “Excellent Long-Established University Consortium of Taiwan”, where teachers and students can borrow books from off-campus cooperative libraries and share resources with each other.',
        textZh: '實踐大學圖書館藏書 49 萬冊，期刊 2 千餘種，擁有大量的設計類與藝術類相關書冊，電子書、視聽資料與電子資料也極為豐富齊全，可供學生隨時取閱。除校內館藏外，實踐大學亦加入「優久大學聯盟圖書委員會」，師生可至校外合作館借閱書籍，分享彼此資源。'
      },
      {
        title: 'Factory 工廠',
        textEn: 'The college of design has a “practice factory” that includes woodworking, metalworking, welding, plastic injection molding and other types of equipment, allowing students to receive factory practice courses at the introductory stage to understand the construction of materials and details. Based on this, students are trained to combine their thinking with practice and imagination. Students of the department will simultaneously implement safety education and training on the operation of factory machinery when taking the “Design Fundamental” course in freshman year.',
        textZh: '設計學院設有含木工、金工、焊接、塑膠射出成型等多類機具之「實習工廠」，可讓學生於入門階段接受工廠實習課程，了解材料及細節的構造方式。藉由此為基礎培養與訓練學生實作與想像的結合思維。學系學生將於一年級修習「創作基礎」課程時同步實施工廠機具操作之安全教育訓練。'
      },
      {
        title: 'Professional Classroom 專業教室',
        textEn: 'The department has a number of professional classrooms for one-to-many and group teaching. All of them are equipped with projection, broadcasting and multimedia imaging equipment. They are also open to students for flexible use in creation or performance.',
        textZh: '學系內設有多間專業教室以供一對多及團體式課程教學使用，均設有投影、廣播與多媒體影像設備，另可開放學生於創作或展演靈活使用。'
      },
      {
        title: 'Student Studio 工作室',
        textEn: 'The department has set up professional studios based on student’s works’ types and needs, giving students personal working space and creating opportunities to discuss with their peers and collide with creative thinking.',
        textZh: '學系根據學生創作類型及需求設有專業工作室，給予學生個人創作空間及營造學生同儕間討論氛圍與創造思維碰撞的契機。'
      },
      {
        title: 'Computer Lab & Media Library 電腦教室與複合媒體圖書館',
        textEn: 'In response to the high-frequency computer drawing and image rendering needs of students, the department has a computer classroom for students to use freely. There is also a multimedia library within the department, which provides a large number of professional-related books and multimedia resources for students to borrow and use.',
        textZh: '因應在學生高頻的電腦繪製與影像渲染等需求，學系內設有電腦教室以供學生自由使用。另設有學系內專用多媒體圖書館，提供大量專業相關書籍與多媒體資源開放學生借閱與使用。'
      },
      {
        title: 'Open Space 開放空間',
        textEn: 'The open spaces managed by the department are available for students to use, and the architectural design and space planning featured by the practice provide a platform for students to create with a high degree of freedom.',
        textZh: '由學系管理之開放空間場地均可供在學生創作使用，為實踐所特色的建築設計與空間規劃為學生創作提供了高自由度平台可能。'
      }
    ];

    let currentIndex = 0;
    let animationFrame = null;

    // Function to animate current segment
    function animateCurrentSegment() {
      const content = resourcesContent[currentIndex];

      // Update text content
      resourcesTitle.textContent = content.title;
      resourcesTextEn.textContent = content.textEn;
      resourcesTextZh.textContent = content.textZh;

      // Animate the current segment from left to right
      const startTime = performance.now();
      const duration = 5000; // 5 seconds

      function animateSegment(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Update all segments based on current state
        resourcesSegments.forEach((segment, index) => {
          if (index < currentIndex) {
            // Previous segments: fully black
            segment.style.background = '#000000';
          } else if (index === currentIndex) {
            // Current segment: animate with gradient from left to right
            segment.style.background = `linear-gradient(to right, #000000 ${progress * 100}%, #E6E6E6 ${progress * 100}%)`;
          } else {
            // Future segments: gray
            segment.style.background = '#E6E6E6';
          }
        });

        if (progress < 1) {
          animationFrame = requestAnimationFrame(animateSegment);
        } else {
          // Animation complete, set current segment to fully black
          resourcesSegments[currentIndex].style.background = '#000000';

          // Move to next index (loop back to 0 after 6)
          currentIndex = (currentIndex + 1) % resourcesContent.length;

          // If looping back to 0, reset all segments
          if (currentIndex === 0) {
            resourcesSegments.forEach(segment => {
              segment.style.background = '#E6E6E6';
            });
          }

          // Start next segment animation after completing current one
          setTimeout(animateCurrentSegment, 0);
        }
      }

      // Cancel any existing animation
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      // Start animation
      animationFrame = requestAnimationFrame(animateSegment);
    }

    // Add click event listeners to segments
    resourcesSegments.forEach((segment, index) => {
      segment.addEventListener('click', function() {
        // Cancel any existing animation
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }

        // Jump to clicked segment
        currentIndex = index;

        // Update all segments to show state up to clicked segment
        resourcesSegments.forEach((seg, idx) => {
          if (idx < currentIndex) {
            seg.style.background = '#000000';
          } else if (idx === currentIndex) {
            seg.style.background = '#E6E6E6';
          } else {
            seg.style.background = '#E6E6E6';
          }
        });

        // Start animation from clicked segment
        animateCurrentSegment();
      });
    });

    // Initialize with first content
    animateCurrentSegment();
  }

  // Workshop Accordion (List Layout)
  const workshopHeaders = document.querySelectorAll('.workshop-header');
  
  if (workshopHeaders.length > 0) {
    workshopHeaders.forEach(header => {
      // Initialization: Ensure content is hidden properly for GSAP
      const content = header.nextElementSibling;
      gsap.set(content, { height: 0, overflow: 'hidden' });

      header.addEventListener('click', function() {
        const content = this.nextElementSibling;
        const chevron = this.querySelector('.fa-chevron-down');
        
        // Toggle active state
        this.classList.toggle('active');
        const isActive = this.classList.contains('active');
        
        if (isActive) {
          // Open
          gsap.to(content, { height: 'auto', duration: 0.5, ease: "power2.out" });
          gsap.to(chevron, { rotation: 180, duration: 0.3 });
        } else {
          // Close
          gsap.to(content, { height: 0, duration: 0.4, ease: "power2.in" });
          gsap.to(chevron, { rotation: 0, duration: 0.3 });
        }
      });
    });
  }

  // Courses Accordion (BFA & MDES pages)
  const courseHeaders = document.querySelectorAll('.course-header');
  
  if (courseHeaders.length > 0) {
    courseHeaders.forEach(header => {
      // Initialization: Ensure content is hidden properly for GSAP
      const content = header.nextElementSibling;
      gsap.set(content, { height: 0, overflow: 'hidden' });

      header.addEventListener('click', function() {
        const content = this.nextElementSibling;
        const chevron = this.querySelector('.fa-chevron-down');
        const isFirstItem = this.closest('.course-item').matches('.course-item:first-child');

        this.classList.toggle('active');
        const isActive = this.classList.contains('active');

        if (isActive) {
          // Open - 先改變 padding，然後展開內文
          this.classList.remove('py-md');
          this.classList.add('pb-xs');
          // 第一個 item 使用 pt-sm，其他使用 pt-md
          if (isFirstItem) {
            this.classList.add('pt-sm');
          } else {
            this.classList.add('pt-md');
          }
          gsap.to(content, { height: 'auto', duration: 0.5, ease: "power2.out" });
          if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.3 });
        } else {
          // Close - 先收起內文，等動畫完成後再恢復 padding
          gsap.to(content, {
            height: 0,
            duration: 0.4,
            ease: "power2.in",
            onComplete: () => {
              // 動畫完成後才恢復 py-md，這樣看起來更自然
              this.classList.remove('pb-xs', 'pt-md', 'pt-sm');
              this.classList.add('py-md');
            }
          });
          if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.3 });
        }
      });
    });
  }

  // Summer Camp Read More/Less Functionality
  const campItems = document.querySelectorAll('.summer-camp-item');
  
  if (campItems.length > 0) {
    campItems.forEach(item => {
      const textGroup = item.querySelector('.camp-text-group');
      const desc = item.querySelector('.camp-desc');
      const posterWrapper = item.querySelector('.camp-poster-wrapper');
      const posterImg = item.querySelector('img');
      const btn = item.querySelector('.read-more-btn');
      const chevron = btn.querySelector('.fa-chevron-down');
      const btnText = btn.querySelector('span');

      // Initial State Configuration
      const collapsedTextHeight = 100; // Approx 4 lines height
      gsap.set(desc, { height: collapsedTextHeight });

      // Function to sync poster height with text group
      function initPosterHeight() {
        // Calculate the height of the text group in its collapsed state
        // textGroup height = Title height + margin + collapsed desc height
        // We can simply measure the textGroup's current offsetHeight since desc is already set
        const initialHeight = textGroup.offsetHeight;
        gsap.set(posterWrapper, { height: initialHeight });
      }

      // Run initialization (use timeout to ensure layout is rendered)
      setTimeout(initPosterHeight, 100);
      // Also run on window resize to stay responsive
      window.addEventListener('resize', initPosterHeight);

      // Click Event
      btn.addEventListener('click', () => {
        const isExpanded = btn.classList.contains('expanded');

        if (!isExpanded) {
          // --- EXPAND ---
          btn.classList.add('expanded');

          const fullTextHeight = desc.scrollHeight;
          const fullPosterHeight = posterImg.offsetHeight;

          // Animate Text to full height
          gsap.to(desc, { height: fullTextHeight, duration: 0.5, ease: "power2.out" });

          // Animate Poster to full image height
          gsap.to(posterWrapper, { height: fullPosterHeight, duration: 0.5, ease: "power2.out" });

          // UI Updates
          gsap.to(chevron, { rotation: 180, duration: 0.3 });
          btnText.textContent = "Read Less 閱讀更少";

        } else {
          // --- COLLAPSE ---
          btn.classList.remove('expanded');

          // Animate Text back to collapsed height
          gsap.to(desc, { height: collapsedTextHeight, duration: 0.5, ease: "power2.out" });

          // Animate Poster back to match the collapsed text group
          // We calculate the target height: (Current TextGroup Height - Current Desc Height) + Collapsed Desc Height
          const titleAndMarginHeight = textGroup.offsetHeight - desc.offsetHeight;
          const targetPosterHeight = titleAndMarginHeight + collapsedTextHeight;

          gsap.to(posterWrapper, { height: targetPosterHeight, duration: 0.5, ease: "power2.out" });

          // UI Updates
          gsap.to(chevron, { rotation: 0, duration: 0.3 });
          btnText.textContent = "Read More 閱讀更多";
        }
      });
    });
  }

  // Mobile menu toggle (to be implemented)
  console.log('SCCD Website loaded successfully');

  // Add smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Brand Trail Area Mouse Trail Effect (About Page)
  const brandTrailArea = document.getElementById('brand-trail-area');

  if (brandTrailArea) {
    let lastX = 0;
    let lastY = 0;
    const distThreshold = 80; // 改用距離判斷 (px)，增加間距讓圖片不會太密集
    const maxTrailImages = 15; // 最多同時顯示 15 張圖片
    let trailImages = []; // 追蹤目前存在的圖片

    brandTrailArea.addEventListener('mousemove', (e) => {
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (dist < distThreshold) return;

      lastX = e.clientX;
      lastY = e.clientY;

      // 如果已達上限，移除最舊的圖片
      if (trailImages.length >= maxTrailImages) {
        const oldestImg = trailImages.shift();
        oldestImg.remove();
      }

      // 動態建立圖片元素
      const img = document.createElement('img');
      img.src = '../images/SCCD-1-4-0.jpg'; // 這裡可以改成隨機選取不同的品牌 Logo
      img.classList.add('brand-trail-img');

      // 設定位置在滑鼠座標
      img.style.left = `${e.pageX}px`;
      img.style.top = `${e.pageY}px`;

      document.body.appendChild(img);
      trailImages.push(img); // 加入追蹤陣列

      // GSAP Animation: Pop in
      gsap.fromTo(img,
        {
          scale: 0.5, // 初始大小
          opacity: 1,
          rotation: Math.random() * 30 - 15 // 隨機旋轉 -15 ~ 15 度
        },
        {
          duration: 0.5, // 快速彈出
          scale: 1, // 回復到正常大小
          ease: "power2.out"
        }
      );

      // 1秒後直接移除 (不淡出)
      gsap.delayedCall(1, () => {
        img.remove();
        // 從追蹤陣列中移除
        const index = trailImages.indexOf(img);
        if (index > -1) {
          trailImages.splice(index, 1);
        }
      });
    });
  }

  // Admission Page - Load More Pagination
  const loadMoreBtn = document.getElementById('load-more-btn');
  const admissionItems = document.querySelectorAll('.admission-item');

  if (loadMoreBtn && admissionItems.length > 0) {
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

  // Admission Detail Page - Previous/Next Navigation
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const prevPlaceholder = document.getElementById('prev-placeholder');

  if (prevBtn || nextBtn) {
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

});
