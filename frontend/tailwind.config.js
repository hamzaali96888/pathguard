/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        critical: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          border: '#fca5a5',
          dark: '#991b1b',
        },
        review: {
          DEFAULT: '#d97706',
          light: '#fffbeb',
          border: '#fcd34d',
          dark: '#92400e',
        },
      },
    },
  },
  plugins: [],
}
