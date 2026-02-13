/**
 * Activities Preview Module
 * 活動項目 Hover 預覽圖片功能
 */

export function initActivitiesPreview() {
  const activitiesItems = document.querySelectorAll('.activities-item');

  if (activitiesItems.length === 0) return;

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
  previewBlock.style.cssText = 'position:absolute;aspect-ratio:4/3;z-index:50;pointer-events:none;overflow:hidden;top:50%;width:300px;opacity:0;visibility:hidden;';

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

      // Calculate position to keep image within bounds
      const itemRect = this.getBoundingClientRect();
      const previewWidth = 300;
      const idealLeft = itemRect.width / 2 - previewWidth / 2;

      // Adjust if preview would go outside container
      let finalLeft = idealLeft;
      if (idealLeft < 0) {
        finalLeft = 10; // 10px padding from left
      } else if (idealLeft + previewWidth > itemRect.width) {
        finalLeft = itemRect.width - previewWidth - 10; // 10px padding from right
      }

      previewBlock.style.left = `${finalLeft}px`;

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
