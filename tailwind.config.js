/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./js/**/*.js",
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
        'h1': '8rem',      // 128px
        'h2': '6rem',      // 96px
        'h3': '3.125rem',  // 50px
        'h4': '2rem',      // 32px
        'h5': '1.35rem',   // 21.6px
        'h6': '1.25rem',   // 20px
        'p1': '1rem',      // 16px
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
        'xs': '0.5rem',   // 8px
        'sm': '1rem',     // 16px
        'md': '1.5rem',   // 24px
        'lg': '2rem',     // 32px
        'xl': '3rem',     // 48px
        '2xl': '4rem',    // 64px
        '3xl': '6rem',    // 96px
        '4xl': '8rem',    // 128px
        '5xl': '10rem',   // 160px
        '6xl': '12rem',   // 192px
        'gutter': '1.25rem',  // 20px - Grid gutter
        'container-padding': '3.75rem',  // 60px - Container padding
      },

      // 容器最大寬度
      maxWidth: {
        'container': '1920px',  // Full width container
        'content': '1800px',    // Content max width (1920px - 60px * 2)
      },

      // Grid 系統
      gridTemplateColumns: {
        '12': 'repeat(12, minmax(0, 1fr))',
      },

      gap: {
        'gutter': '1.25rem',  // 20px
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
