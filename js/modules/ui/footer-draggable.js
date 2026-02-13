/**
 * Footer Draggable Module
 * Footer 可拖曳元素功能（GSAP Draggable + Collision Detection）
 */

/**
 * Helper: Collision Detection & Repulsion Logic
 */
function handleCollision(draggable, footerElements) {
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

/**
 * Initialize Footer Draggable Elements
 */
export function initFooterDraggable() {
  if (typeof Draggable === 'undefined') return;

  // Select footer elements with specific classes (desktop only: position: absolute via CSS)
  const footerElements = document.querySelectorAll('footer .footer-logo, footer .footer-fax, footer .footer-tel, footer .footer-office, footer .footer-email, footer .footer-links, footer .footer-social .footer-youtube, footer .footer-social .footer-instagram, footer .footer-social .footer-facebook');

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
        handleCollision(this, footerElements);
      },
      onThrowUpdate: function() {
        handleCollision(this, footerElements);
      }
    });

    // Set initial cursor style
    gsap.set(footerElements, { cursor: "grab" });
  }
}

/**
 * Load and initialize footer
 */
export function initFooterDraggableModule() {
  const footerContainer = document.getElementById('site-footer');
  if (footerContainer) {
    fetch('footer.html')
      .then(res => res.text())
      .then(html => {
        footerContainer.innerHTML = html;
        initFooterDraggable(); // Initialize draggable after fetch
      });
  }

  // Try initializing immediately (for pages with static footer like index.html)
  initFooterDraggable();
}
