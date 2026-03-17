/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#13daec',
        'background-light': '#f6f8f8',
        'background-dark': '#0f172a'
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')],
}

