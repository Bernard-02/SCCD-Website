/**
 * Section Banner Reveal Animation
 * About 頁面各 section banner 的放大進場動畫
 *
 * 效果：
 * - 初始：圖片容器寬度 50%，居中，overflow hidden
 * - 隨著 viewport 進入 section，寬度從 50% → 100%（scrub）
 * - 到達 100% 時，overlay 從 opacity:0 → 0.3，文字從 opacity:0 → 1
 * - 文字出場參考 hero-animation：第一行 h1 clip reveal（yPercent），第二行 stagger
 */

export function initSectionBannerReveal() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const banners = document.querySelectorAll('[data-section-banner]');
  if (!banners.length) return;

  banners.forEach((banner) => {
    const overlay = banner.querySelector('.section-banner-overlay');
    // titleWrap 已移至 banner 外層（section 的直接子層），避免被 overflow-hidden 裁切
    const section = banner.closest('section');
    const titleWrap = section ? section.querySelector('.section-banner-title') : null;
    const titles = titleWrap ? titleWrap.querySelectorAll('h1') : [];

    // 手機版：直接顯示，不做動畫
    if (window.innerWidth < 768) {
      gsap.set(banner, { width: '100%' });
      if (overlay) gsap.set(overlay, { opacity: 0.3 });
      if (titleWrap) gsap.set(titleWrap, { opacity: 1 });
      return;
    }

    if (!section) return;

    // --- Phase 1: Width expand (scrub) ---
    // viewport 進入 section top 時開始，到 section center 時結束
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',   // section 進入 viewport 底部時開始
        end: 'top 20%',        // section 頂部到達 viewport 20% 時結束
        scrub: 1,
      },
    });

    tl.fromTo(banner,
      { width: '50%' },
      { width: '100%', ease: 'power2.inOut' }
    );

    // --- Phase 2: Overlay + title reveal (once, triggered after expand) ---
    // 寬度展開完成後，移除 overflow-hidden 再播文字動畫（避免 translate-x 被裁切）
    ScrollTrigger.create({
      trigger: section,
      start: 'top 15%',  // Phase 1 結束（top 20%）之後才觸發
      once: true,
      onEnter: () => {
        // 強制確保 width 已到 100%，再移除 clip wrapper 的 overflow-hidden
        gsap.set(banner, { width: '100%' });
        const clipWrap = banner.closest('.section-banner-clip');
        if (clipWrap) clipWrap.classList.remove('overflow-hidden');

        const tl2 = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // Overlay fade in
        if (overlay) {
          tl2.to(overlay, { opacity: 0.3, duration: 0.6 });
        }

        // Title reveal: 第一個 h1 clip reveal（yPercent），第二個 stagger
        if (titles.length > 0) {
          // 顯示 titleWrap
          tl2.set(titleWrap, { opacity: 1 }, 0);

          // 兩個 h1 都用 y + opacity 淡入，stagger 錯開
          gsap.set(titles, { y: 40, opacity: 0 });
          tl2.to(titles, {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.15,
            clearProps: 'y,opacity',
          }, 0.2);
        }
      },
    });
  });
}
