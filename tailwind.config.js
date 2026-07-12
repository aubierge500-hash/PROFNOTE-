/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF3F8', 100: '#D4E1EC', 200: '#A9C3D9', 300: '#7EA5C6',
          400: '#5387B3', 500: '#2E699E', 600: '#1E3A5F', 700: '#182F4D',
          800: '#12243B', 900: '#0C1929'
        },
        accent: {
          DEFAULT: '#E8A33D',
          light: '#F5C878'
        },
        success: '#2F9E5B',
        danger: '#D64545',
        warning: '#E8A33D'
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif']
      }
    }
  },
  plugins: []
}
