/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        primary: '#6d469b',
        'primary-dark': '#5a3a82',
        'primary-light': '#8058ac',
        coral: '#ef597b',
        'coral-dark': '#e73862',
        'text-primary': '#003f5c',
        'text-secondary': '#4a5568',
        'text-muted': '#718096',
        secondary: '#FFCA3A',
        background: '#F8F9FA',
        text: '#212529',
        border: '#DEE2E6'
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        'xl': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      }
    },
  },
  plugins: [],
}