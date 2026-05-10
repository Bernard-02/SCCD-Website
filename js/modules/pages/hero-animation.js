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
  // Hero highlight：所有 [data-hero-hl] 套同一個隨機 accent 色 + 固定 padding
  // padding 用 rem 而非 em，避免 h1（font-size 大）的 padding 被等比例放大成過大色塊
  // 跑在 gsap 早返回之前，確保無 gsap 也會套色
  const heroHls = document.querySelectorAll('[data-hero-hl]');
  if (heroHls.length > 0) {
    const cs = getComputedStyle(document.documentElement);
    const accentColors = [
      cs.getPropertyValue('--color-green').trim(),
      cs.getPropertyValue('--color-pink').trim(),
      cs.getPropertyValue('--color-blue').trim(),
    ];
    const color = accentColors[Math.floor(Math.random() * accentColors.length)];
    heroHls.forEach(el => {
      /** @type {HTMLElement} */ (el).style.background = color;
      /** @type {HTMLElement} */ (el).style.padding = '0.5rem 0.6rem';
    });
  }

  // hero-text-en / hero-text-cn 之間的 gap：兩個段落各自旋轉，bbox 高度會增加 = width × sin(angle)
  // 參考 history desc 的算法：gap = 兩 paragraph 的 rotation excursion 加總 + buffer
  // 動態算 because 寬度依 viewport 而變；只算一次，resize 不重算（避免 SPA listener 累積）
  const heroTextEn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-en'));
  const heroTextCn = /** @type {HTMLElement|null} */ (document.querySelector('.hero-text-cn'));
  let heroGapPx = 0;
  if (heroTextEn && heroTextCn) {
    const isDesktop = window.innerWidth >= 768;
    const enRotDeg = isDesktop ? 3 : 1;
    const cnRotDeg = isDesktop ? 2 : 1;
    const w = heroTextEn.offsetWidth;
    const enExcursion = w * Math.sin(enRotDeg * Math.PI / 180);
    const cnExcursion = w * Math.sin(cnRotDeg * Math.PI / 180);
    const buffer = 12;
    heroGapPx = Math.ceil(enExcursion + cnExcursion + buffer);
  }

  if (typeof gsap === 'undefined') {
    if (heroTextEn && heroGapPx > 0) heroTextEn.style.marginBottom = `${heroGapPx}px`;
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

  // 預先 wrap，避免動畫順序判斷影響 wrap 邏輯（wrapper 同時負責 rotate + clip overflow）
  if (title) wrapElement(title, 'hero-title-wrapper');
  if (textEn) {
    wrapElement(textEn, 'hero-text-en-wrapper');
    // Tailwind class（mb-lg/mb-xl）的 mb 在 wrap 後會在 wrapper 內部，浪費高度且讓 wrapper 變高 → 顯式清掉
    /** @type {HTMLElement} */ (textEn).style.marginBottom = '0';
    if (heroGapPx > 0 && textEn.parentElement) {
      // 旋轉 excursion gap 改套到 wrapper 上（wrapper 才是 flow 中影響後續元素的元素）
      textEn.parentElement.style.marginBottom = `${heroGapPx}px`;
    }
  }
  if (textCn) wrapElement(textCn, 'hero-text-cn-wrapper');

  const subtitles = [textEn, textCn].filter(Boolean);
  // opt-in：[data-hero-title-last] 存在時 → subtitles 先進場，title 最後
  // 用於 hero 結構為「年份 → 英文 → 中文標題」這種底部為主標的版面（如 degree-show-detail）
  const titleLast = document.querySelector('[data-hero-title-last]') !== null;

  // 為什麼 visibility:visible 用 tl.set 對齊動畫起點而非 gsap.set 立即打開：
  // 若 init 時就 visibility:visible + yPercent:100，sub-pixel rounding 會在 wrapper 底邊露出 ~0.5px 細綫，
  // 動畫前等待視覺上看得到。把可見性切換對齊動畫起點 = 露邊立刻被滑入動作蓋掉，視覺乾淨。

  if (titleLast) {
    // Subtitles 先（年份 → 英文 stagger），title 後 overlap 進場
    if (subtitles.length > 0) {
      gsap.set(subtitles, { yPercent: 100 });
      tl.set(subtitles, { visibility: 'visible' })
        .to(subtitles, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.15,
          clearProps: 'transform',
        });
    }
    if (title) {
      gsap.set(title, { yPercent: 100 });
      tl.set(title, { visibility: 'visible' }, '-=0.4')
        .to(title, {
          yPercent: 0,
          duration: 0.9,
          clearProps: 'transform',
        }, '<');
    }
  } else {
    // 預設：title 先，subtitles 後 overlap 進場
    if (title) {
      gsap.set(title, { visibility: 'visible', yPercent: 100 });
      tl.to(title, {
        yPercent: 0,
        duration: 0.9,
        clearProps: 'transform',
      });
    }
    if (subtitles.length > 0) {
      gsap.set(subtitles, { yPercent: 100 });
      tl.set(subtitles, { visibility: 'visible' }, '-=0.4')
        .to(subtitles, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.15,
          clearProps: 'transform',
        }, '<');
    }
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
