/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        steel: {
          850: '#151c28',
          900: '#0f172a',
          950: '#070b14',
        },
        medical: {
          50: '#EFF7FF',
          100: '#DCE8F5',
          200: '#BCD7F5',
          300: '#84B8F0',
          400: '#4B95EB',
          500: '#1473E6',
          600: '#1060C4',
          700: '#0E4F9F',
          800: '#12345A',
          900: '#0B223D',
          bg: '#F7FAFE',
          card: '#FFFFFF',
          border: '#DCE8F5',
          text: '#536780',
          navy: '#12345A',
          success: '#16865C',
          warning: '#E6A23C',
          error: '#D94848',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
