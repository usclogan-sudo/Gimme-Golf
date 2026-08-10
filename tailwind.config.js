/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:  '#16263B',
        cream: '#F2ECDD',
        brass: '#C2A24C',
        slate: { brand: '#2E4257' },
        // Surface grays read from CSS vars so dark mode can become brand-navy without
        // editing 400 call sites. Tailwind defaults in light; navy shades under .dark.
        // (UX v2.1 §14, Option A — see index.css :root / .dark)
        gray: {
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          800: 'rgb(var(--gray-800) / <alpha-value>)',
          900: 'rgb(var(--gray-900) / <alpha-value>)',
        },
        forest: {
          50:  '#f0faf3',
          100: '#d8f0de',
          200: '#b4e0c0',
          300: '#7ec99a',
          400: '#4aab6f',
          500: '#288f52',
          600: '#1a7241',
          700: '#155c36',
          800: '#0f4526',
          900: '#0a2e19',
          950: '#051a0e',
        },
        gold: {
          300: '#fde68a',
          400: '#fbbf24',
          500: '#d97706',
          600: '#b45309',
        },
        charcoal: {
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        serif:   ['"Playfair Display"', 'Georgia', 'serif'],
        sans:    ['Inter',  'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
