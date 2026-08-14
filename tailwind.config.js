/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./js/**/*.js",
    "./data/**/*.json",
  ],
  // js 裡的否定式 `!active`（如 `if (!active || ...)`）被 content scanner 當成 important 變體 candidate，
  // 害 Tailwind 對所有引用 `.active` 的 @layer components 規則生成 `\!active` 孿生版（含 `:not(.\!active)!important`）。
  // 那條 `[data-bar=about].has-active .nav-link:not(.\!active){color:50%!important}` 會誤匹配真 active link
  // （class 是 `active` 非 `!active`）→ 蓋過 `.nav-link.active` 的黑色 → 高亮失效（2026-06-08 實測）。blocklist 擋掉。
  blocklist: ['!active'],
  // 字級 utility 全自定義（值見 variables.css）。封鎖綫等改用裸標籤後，text-3xl / text-md 不再以 class 出現在
  // content，JIT 掃不到就不生成 → safelist 強制產出全套 7 階，保證任何地方用 class 套用都有效。
  safelist: ['text-xs', 'text-s', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'],
  theme: {
    extend: {
      // 顏色系統
      colors: {
        // 主要色
        'black': '#000000',
        'white': '#FFFFFF',

        // 次要色
        'green': '#00FF80',
        'pink': '#FF448A',
        'blue': '#26BCFF',

        // 灰階 (gray-0 到 gray-10)
        'gray': {
          0: '#000000',
          1: '#1A1A1A',
          2: '#333333',
          3: '#4D4D4D',
          4: '#666666',
          5: '#808080',
          6: '#999999',
          7: '#B3B3B3',
          8: '#CCCCCC',
          9: '#E6E6E6',
          10: '#FFFFFF',
        },
      },

      // 字體系統
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'noto': ['Noto Sans TC', 'sans-serif'],
        'sans': ['Inter', 'Noto Sans TC', 'system-ui', '-apple-system', 'sans-serif'],
      },

      // 字體大小 (使用 rem)：[字級, 行距] tuple → .text-* 自帶該階 line-height（size-based，2026-08-12）
      fontSize: {
        '3xl': ['var(--font-size-3xl)', 'var(--line-height-3xl)'],
        '2xl': ['var(--font-size-2xl)', 'var(--line-height-2xl)'],
        'xl': ['var(--font-size-xl)', 'var(--line-height-xl)'],
        'lg': ['var(--font-size-lg)', 'var(--line-height-lg)'],
        'md': ['var(--font-size-md)', 'var(--line-height-md)'],
        's': ['var(--font-size-s)', 'var(--line-height-s)'],
        'xs': ['var(--font-size-xs)', 'var(--line-height-xs)'],
      },

      // 字體粗細
      fontWeight: {
        'regular': 400,
        'semibold': 600,
        'bold': 700,
      },

      // 行高：字級行距已綁在 fontSize tuple 上；這裡只留 leading-base 給 <body> 預設與少數對齊消費者
      lineHeight: {
        'base': 'var(--line-height-base)',
      },

      // 間距
      spacing: {
        'en-zh': 'var(--space-en-zh)',  /* 疊放雙語 EN 元素的 margin-bottom（英中距），mb-en-zh */
        'en-zh-body': 'var(--space-en-zh-body)',  /* 段落內文英中距，mb-en-zh-body */
        'en-zh-s': 'var(--space-en-zh-s)',  /* text-s 疊放雙語 EN margin-bottom（2px），mb-en-zh-s */
        'en-zh-xl': 'var(--space-en-zh-xl)',  /* text-xl 疊放雙語 EN margin-bottom（2px），mb-en-zh-xl */
        'en-zh-lg': 'var(--space-en-zh-lg)',  /* text-lg 疊放雙語 EN margin-bottom（4px），mb-en-zh-lg */
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
        '4xl': 'var(--spacing-4xl)',
        '5xl': 'var(--spacing-5xl)',
        '6xl': 'var(--spacing-6xl)',
        '8xl': 'var(--spacing-8xl)',
        'gutter': 'var(--spacing-gutter)',
        'container-padding': 'var(--container-padding)',
      },

      // 容器最大寬度
      maxWidth: {
        'container': '1920px',  // Full width container
        'content': '1800px',    // Content max width (1920px - 60px * 2)
      },

      // Grid 系統
      gridTemplateColumns: {
        '12': 'repeat(12, minmax(0, 1fr))',
        '20': 'repeat(20, minmax(0, 1fr))',
      },

      // 20 欄 grid 用：Tailwind 預設 col-span 只到 12、col-start/end 只到 13，補滿到 20/21
      gridColumn: {
        'span-13': 'span 13 / span 13',
        'span-14': 'span 14 / span 14',
        'span-15': 'span 15 / span 15',
        'span-16': 'span 16 / span 16',
        'span-17': 'span 17 / span 17',
        'span-18': 'span 18 / span 18',
        'span-19': 'span 19 / span 19',
        'span-20': 'span 20 / span 20',
      },
      gridColumnStart: {
        '14': '14', '15': '15', '16': '16', '17': '17',
        '18': '18', '19': '19', '20': '20', '21': '21',
      },
      gridColumnEnd: {
        '14': '14', '15': '15', '16': '16', '17': '17',
        '18': '18', '19': '19', '20': '20', '21': '21',
      },

      gap: {
        'gutter': 'var(--spacing-gutter)',  // 20px，single source = variables.css
      },

      // 旋轉角度（常用於卡片和標題）
      rotate: {
        '-6': '-6deg',
        '-4': '-4deg',
        '-2': '-2deg',
        '3': '3deg',
        '4': '4deg',
        '12': '12deg',
        '15': '15deg',
        '18': '18deg',
      },

      // 高度
      height: {
        'works-container': '500px',  // Works section container height
        'toggle': '1.8rem',          // Toggle button height
      },

      // 寬高比
      aspectRatio: {
        'course': '4/5',   // Course card aspect ratio
        'video': '16/9',   // Video aspect ratio
      },

      // 過渡動畫
      transitionDuration: {
        'fast': '200ms',
        'base': '300ms',
        'slow': '500ms',
      },
    },
  },
  plugins: [],
}
