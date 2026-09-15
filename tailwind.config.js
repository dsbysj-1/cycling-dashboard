/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * 语义化色彩 token:全部由 src/index.css 里的 CSS 变量驱动,昼夜两套值。
       * 组件里只用这些 token(bg-surface / text-t2 / border-line …),不要写死 slate/white/night,
       * 也不要写死具体色值 —— 任意 token 类都自动同时适配两套主题,无需再维护类名白名单。
       * 需要透明度时直接加修饰符(如 bg-surface/80、border-accent-sky/30);变量以 RGB 三元组形式提供。
       */
      colors: {
        /** 页面底色 */
        page: 'rgb(var(--page-rgb) / <alpha-value>)',
        /** 卡片/次级面板底色;surface-2 更深一档,用于输入框、内嵌区块 */
        surface: {
          DEFAULT: 'rgb(var(--surface-rgb) / <alpha-value>)',
          2: 'rgb(var(--surface-2-rgb) / <alpha-value>)',
        },
        /** 描边:line 常规,line-soft 更淡(分隔线、弱边框) */
        line: {
          DEFAULT: 'var(--line)',
          soft: 'var(--line-soft)',
        },
        /** 非描边填充:fill 常规,fill-strong 用于 hover 等强调态 */
        fill: {
          DEFAULT: 'var(--fill)',
          strong: 'var(--fill-strong)',
        },
        /** 文字层级:t1 最亮(标题)→ t6 最弱(装饰) */
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        t4: 'var(--t4)',
        t5: 'var(--t5)',
        t6: 'var(--t6)',
        /** 强调色:DEFAULT 用于图形与描边,text 用于文字(浅色主题下换更深一档以保证对比度) */
        accent: {
          sky: {
            DEFAULT: 'rgb(var(--c-sky-rgb) / <alpha-value>)',
            text: 'rgb(var(--c-sky-text-rgb) / <alpha-value>)',
          },
          emerald: {
            DEFAULT: 'rgb(var(--c-emerald-rgb) / <alpha-value>)',
            text: 'rgb(var(--c-emerald-text-rgb) / <alpha-value>)',
          },
          amber: {
            DEFAULT: 'rgb(var(--c-amber-rgb) / <alpha-value>)',
            text: 'rgb(var(--c-amber-text-rgb) / <alpha-value>)',
          },
          red: {
            DEFAULT: 'rgb(var(--c-red-rgb) / <alpha-value>)',
            text: 'rgb(var(--c-red-text-rgb) / <alpha-value>)',
          },
        },
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
