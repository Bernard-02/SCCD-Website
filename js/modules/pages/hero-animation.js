/**
 * Hero Animation Module
 * 為所有內頁的 Hero Section 文字加上進場動畫
 *
 * 架構：
 * - JS 動態為每個元素加一個 wrapper（帶 CSS class），wrapper 負責 rotate
 * - 元素本身做 yPercent: 100 → 0 的 clip reveal（從 wrapper 底部滑入）
 * - visibility: hidden 定義在 hero.css，CSS 載入後立即生效，防止閃爍
 */

function wrapElement(el, wrapperClass) {
  const wrapper = document.createElement('div');
  wrapper.className = wrapperClass;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

export function initHeroAnimation() {
  if (typeof gsap === 'undefined') {
    document.querySelectorAll('.hero-title, .hero-text-en, .hero-text-cn, [data-hero-logo]')
      .forEach(el => { el.style.visibility = 'visible'; });
    return;
  }

  // --- Logo-only hero（如 about 頁）：y 軸位移到原位進場 ---
  const heroLogo = document.querySelector('[data-hero-logo]');
  if (heroLogo) {
    gsap.fromTo(heroLogo,
      { y: 120, opacity: 0, visibility: 'visible' },
      { y: 0, opacity: 1, duration: 1.5, delay: 0.3, ease: 'power3.out', clearProps: 'transform' }
    );
  }

  const title = document.querySelector('.hero-title');
  const textEn = document.querySelector('.hero-text-en');
  const textCn = document.querySelector('.hero-text-cn');

  if (!title && !textEn && !textCn) return;

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // --- 1. Hero Title: clip reveal ---
  if (title) {
    wrapElement(title, 'hero-title-wrapper');
    // title 設為可見，從 yPercent: 100（在 wrapper 外底部）滑入
    gsap.set(title, { visibility: 'visible', yPercent: 100 });
    tl.to(title, {
      yPercent: 0,
      duration: 0.9,
      clearProps: 'transform',
    });
  }

  // --- 2. 英文 / 中文副標：y + opacity 淡入 ---
  const subtitles = [textEn, textCn].filter(Boolean);
  if (subtitles.length > 0) {
    gsap.set(subtitles, { visibility: 'visible', y: 40, opacity: 0 });
    tl.to(subtitles, {
      y: 0,
      opacity: 1,
      duration: 0.7,
      stagger: 0.15,
      clearProps: 'y,opacity',
    }, '-=0.4');
  }

  // --- 3. Hero 背景圖：往下 scroll 時放大 + parallax；main section 蓋上來 ---
  if (typeof ScrollTrigger !== 'undefined') {
    const heroSection = title
      ? title.closest('section')
      : document.querySelector('section');
    const heroImg = heroSection ? heroSection.querySelector('img') : null;
    const mainSection = heroSection ? heroSection.nextElementSibling : null;

    if (mainSection) {
      // main section 蓋在 hero 上方，背景要不透明才能蓋住 hero 文字
      mainSection.style.position = 'relative';
      mainSection.style.zIndex = '1';
    }

    if (heroSection && heroImg) {
      // 放大 + parallax：往下 scroll 時圖片同時放大並向上位移
      gsap.fromTo(heroImg,
        { scale: 1, yPercent: 0 },
        {
          scale: 1.15,
          yPercent: 20,
          ease: 'none',
          scrollTrigger: {
            trigger: heroSection,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    }
  }
}
