/**
 * Anchor Navigation Module
 * 處理 About 頁面的左側錨點導航與 Scroll Spy
 */

export function initAnchorNav() {
  const navButtons = document.querySelectorAll('.anchor-nav-btn');
  // 只選取有 id 的 section，避免選到其他無關元素
  const sections = document.querySelectorAll('section[id]');
  
  if (navButtons.length === 0 || sections.length === 0) return;

  // 1. 點擊滾動功能
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        // 使用 helper 的平滑滾動，或者原生 scrollIntoView
        if (window.SCCDHelpers && window.SCCDHelpers.scrollToElement) {
          window.SCCDHelpers.scrollToElement(targetSection);
        } else {
          targetSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // 2. Scroll Spy (滾動監聽)
  // 使用 IntersectionObserver 監聽區塊是否進入視窗中間
  const observerOptions = {
    root: null,
    // rootMargin 設定為 '-50% 0px -50% 0px' 表示只偵測視窗正中間的一條線
    // 這樣可以精確判斷當前視窗中心位於哪個區塊，解決區塊重疊或高度過高導致的誤判
    rootMargin: '-50% 0px -50% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        // 更新按鈕狀態
        navButtons.forEach(btn => {
          if (btn.getAttribute('data-target') === id) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    observer.observe(section);
  });
}