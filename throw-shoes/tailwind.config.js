import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', ...defaultTheme.fontFamily.sans],
        display: ['"Inter Tight"', ...defaultTheme.fontFamily.sans],
        bubble: ['"Inter Tight"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        ink: {
          50: '#f4f7fb',
          100: '#e3eaf4',
          200: '#cad7eb',
          300: '#a0b8d9',
          400: '#7090c3',
          500: '#4f72ab',
          600: '#405c8d',
          700: '#364b71',
          800: '#2f3f5d',
          900: '#2a354f',
        },
      },
    },
  },
  plugins: [],
}
