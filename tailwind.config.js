/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./js/**/*.js",
    "./data/**/*.json",
  ],
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

      // 字體大小 (使用 rem)
      fontSize: {
        'h1': 'var(--font-size-h1)',
        'h2': 'var(--font-size-h2)',
        'h3': 'var(--font-size-h3)',
        'h4': 'var(--font-size-h4)',
        'h5': 'var(--font-size-h5)',
        'h6': 'var(--font-size-h6)',
        'p1': 'var(--font-size-p1)',
      },

      // 字體粗細
      fontWeight: {
        'regular': 400,
        'semibold': 600,
        'bold': 700,
      },

      // 行高
      lineHeight: {
        'base': '1.5',
        'h1': '1.1',
      },

      // 間距
      spacing: {
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
