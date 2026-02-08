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
      });
  }

  // Faculty filter functionality
  const filterButtons = document.querySelectorAll('.faculty-filter-btn');
  const facultyCards = document.querySelectorAll('.faculty-card');

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

    // Initialize: show only fulltime cards on page load
    facultyCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      if (cardCategory === 'fulltime') {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Faculty card click functionality (only for fulltime)
  const facultyCardImages = document.querySelectorAll('.faculty-card[data-category="fulltime"] .faculty-card-image-wrapper');

  facultyCardImages.forEach((imageWrapper, index) => {
    imageWrapper.addEventListener('click', function() {
      // 未來會從 data-id 屬性取得教師 ID
      // 現在先用 index + 1 作為 ID
      const teacherId = index + 1;
      window.location.href = `faculty-detail.html?id=${teacherId}`;
    });
  });

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
            item.style.display = 'flex';
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
    previewBlock.style.cssText = 'position:absolute;aspect-ratio:4/3;z-index:50;pointer-events:none;overflow:hidden;top:50%;left:calc(50% - 120px);width:240px;opacity:0;visibility:hidden;';

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
      const chevron = this.querySelector('.fa-chevron-right');
      const itemsContainer = this.nextElementSibling; // .activities-year-items

      if (itemsContainer) {
        const isOpen = itemsContainer.style.display !== 'none';

        if (isOpen) {
          itemsContainer.style.display = 'none';
          chevron.classList.remove('rotate-90');
        } else {
          itemsContainer.style.display = 'flex';
          chevron.classList.add('rotate-90');
        }
      }
    });
  });

  // Works filter functionality
  const worksFilterButtons = document.querySelectorAll('.works-filter-btn');
  const worksContents = document.querySelectorAll('.works-content');

  if (worksFilterButtons.length > 0 && worksContents.length > 0) {
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
        { year: 1958, description: '<div>Shih Chien College of Home Economics established</div><div class="mt-sm">實踐家政專科學校成立</div>' },
        { year: 1971, description: '<div>Department of Arts and Crafts established</div><div class="mt-sm">設立 美術工藝科</div>' },
        { year: 1979, description: '<div>Shih Chien College of Home Economics renamed as Shih Chien College of Home Economics and Economics</div><div class="mt-sm">實踐家政專科學校 更名為 實踐家政經濟專科學校</div>' },
        { year: 1984, description: '<div>• Department of Arts and Crafts renamed as Department of Applied Arts</div><div class="mt-sm">美術工藝科 更名為 應用美術科</div><div class="mt-lg">• Division of Visual Communication Design established</div><div class="mt-sm">設立 視覺傳達設計組</div>' }
      ]},
      { era: 'College', label: '學院', years: [
        { year: 1991, description: '<div>Shih Chien College of Home Economics and Economics upgraded to & renamed as Shih Chien College of Design and Management</div><div class="mt-sm">實踐家政經濟專科學校 改制並更名為 實踐設計管理學院</div>' }
      ]},
      { era: 'University', label: '大學', years: [
        { year: 1997, description: 'Content for 1997...' },
        { year: 2000, description: 'Content for 2000...' },
        { year: 2004, description: 'Content for 2004...' },
        { year: 2009, description: 'Content for 2009...' },
        { year: 2011, description: 'Content for 2011...' },
        { year: 2012, description: 'Content for 2012...' },
        { year: 2013, description: 'Content for 2013...' },
        { year: 2017, description: 'Content for 2017...' },
        { year: 2023, description: 'Content for 2023...' }
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
        return `<h1 class="timeline-year text-black transition-colors duration-700 ease-in-out flex-shrink-0" data-index="${idx}">${yearData.year}</h1>`;
      }).join('');
    }

    // Function to update timeline display
    function updateTimeline(index) {
      if (index === currentYearIndex) return; // 避免重複執行
      currentYearIndex = Math.max(0, Math.min(index, allYears.length - 1));
      const currentYear = allYears[currentYearIndex];

      // Update era label
      timelineEra.textContent = `${currentYear.era} ${currentYear.eraLabel}`;

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
        gsap.set(panel, { flexGrow: 5, flexBasis: "0%" }); // Expanded ratio (5)
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
          flexGrow: 5,
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

  // Brand Text Area Mouse Trail Effect (About Page)
  const brandTextArea = document.getElementById('brand-text-area');

  if (brandTextArea) {
    let lastX = 0;
    let lastY = 0;
    const distThreshold = 40; // 改用距離判斷 (px)，解決快速移動時的斷層問題

    brandTextArea.addEventListener('mousemove', (e) => {
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (dist < distThreshold) return;
      
      lastX = e.clientX;
      lastY = e.clientY;

      // 動態建立圖片元素
      const img = document.createElement('img');
      img.src = '../images/SCCD-1-4-0.jpg'; // 這裡可以改成隨機選取不同的品牌 Logo
      img.classList.add('brand-trail-img');
      
      // 設定位置在滑鼠座標
      img.style.left = `${e.pageX}px`;
      img.style.top = `${e.pageY}px`;

      document.body.appendChild(img);

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
      gsap.delayedCall(1, () => img.remove());
    });
  }

});
