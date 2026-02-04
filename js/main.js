/**
 * Main JavaScript for SCCD Website
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

  // Set header height CSS variable for mega menu positioning
  function setHeaderHeight() {
    const header = document.querySelector('header');
    if (header) {
      const headerHeight = header.offsetHeight;
      document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    }
  }

  // Set on load and on resize
  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);

  // Header hide on scroll down, show on scroll up
  let lastScrollTop = 0;
  const header = document.querySelector('header');

  function handleHeaderScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > lastScrollTop && scrollTop > 100) {
      // Scrolling down & past 100px
      header.classList.add('header-hidden');
    } else {
      // Scrolling up or at top
      header.classList.remove('header-hidden');
    }

    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  }

  window.addEventListener('scroll', handleHeaderScroll);

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
    previewBlock.style.cssText = 'position:absolute;aspect-ratio:4/3;z-index:50;pointer-events:none;overflow:hidden;top:50%;transform-origin:center center;';

    function randomRotation() {
      return (Math.random() * 6 - 3).toFixed(1); // -3 to +3
    }

    activitiesItems.forEach(item => {
      item.style.position = 'relative';

      item.addEventListener('mouseenter', function() {
        const category = this.getAttribute('data-category');
        previewBlock.style.backgroundColor = categoryColors[category] || '#E6E6E6';

        // Measure actual text end of the name using Range
        const itemRect = this.getBoundingClientRect();
        const nameEl = this.querySelector('p');
        const infoEl = this.querySelector('div');

        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const nameTextRect = range.getBoundingClientRect();
        const nameTextEnd = nameTextRect.right - itemRect.left;

        const infoStart = infoEl.getBoundingClientRect().left - itemRect.left;

        // Available space between name text end and location text start
        const space = infoStart - nameTextEnd;
        const previewWidth = 160; // px

        let previewLeft;
        if (space >= previewWidth) {
          // Enough room: center preview in the available space
          previewLeft = nameTextEnd + (space - previewWidth) / 2;
        } else {
          // Not enough room: center preview around the name/info boundary
          previewLeft = infoStart - previewWidth / 2;
        }

        previewBlock.style.width = previewWidth + 'px';
        previewBlock.style.left = previewLeft + 'px';
        previewBlock.style.transform = 'translateY(-50%) rotate(' + randomRotation() + 'deg)';

        this.appendChild(previewBlock);
      });

      item.addEventListener('mouseleave', function() {
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

});
