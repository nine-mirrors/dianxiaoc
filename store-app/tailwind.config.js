/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // 主题色一律映射到 tokens.css 里的 CSS 变量，保证单一出处
        'mn-green': 'var(--mn-green)',
        'mn-green-dark': 'var(--mn-green-dark)',
        'mn-green-light': 'var(--mn-green-light)',
        'ai-purple': 'var(--ai-purple)',
        'ai-purple-2': 'var(--ai-purple-2)',
        'bg-page': 'var(--bg-page)',
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        btn: 'var(--radius-btn)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
}
