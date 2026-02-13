/**
 * Horizontal Accordion Module
 * 水平手風琴功能（About 頁面 - BFA Division 圖片展示）
 */

export function initHorizontalAccordion() {
  const accordionPanels = document.querySelectorAll('.accordion-panel');

  if (accordionPanels.length === 0) return;

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
