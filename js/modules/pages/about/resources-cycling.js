/**
 * Resources Cycling Module (About Page)
 * Resources 循環動畫功能（7 個 Segments）
 */

export function initResourcesCycling() {
  const resourcesSegments = document.querySelectorAll('.resources-segment');
  const resourcesTitle = document.getElementById('resources-title');
  const resourcesTextEn = document.getElementById('resources-text-en');
  const resourcesTextZh = document.getElementById('resources-text-zh');
  const resourcesImage = document.getElementById('resources-image');

  if (resourcesSegments.length === 0 || !resourcesTitle || !resourcesTextEn || !resourcesTextZh) return;

  // Fetch data from JSON file
  fetch('../data/resources.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - Check if data/resources.json exists`);
      return response.json();
    })
    .then(resourcesContent => {
      initializeResourcesLogic(resourcesContent);
    })
    .catch(error => console.error('Error loading resources data:', error));

  function initializeResourcesLogic(resourcesContent) {
    let currentIndex = 0;
    let animationFrame = null;

    // Function to animate current segment
    function animateCurrentSegment() {
      const content = resourcesContent[currentIndex];

      // Update text content
      resourcesTitle.textContent = content.title;
      resourcesTextEn.textContent = content.textEn;
      resourcesTextZh.textContent = content.textZh;

      // Update Image with Fade Animation
      if (resourcesImage && content.image) {
        resourcesImage.innerHTML = `<img src="${content.image}" alt="${content.title}" class="w-full h-full object-cover">`;
        
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(resourcesImage.querySelector('img'), 
            { opacity: 0 }, 
            { opacity: 1, duration: 0.5, ease: "power2.out" }
          );
        }
      }

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
}
