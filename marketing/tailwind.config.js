/**
 * Brand tokens copied from frontend/tailwind.config.js so the marketing site
 * and the app read as one product. If a token changes there, change it here.
 * (The two projects build independently; a shared preset would couple their
 * dependency trees for six lines of color.)
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,md,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      // Real weight scale (see docs/design/DESIGN_SYSTEM.md section 2).
      // Poppins loads 500/600/700 only; never use lighter weights.
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      colors: {
        'optio-purple': '#6D469B',
        'optio-purple-dark': '#5A3A82',
        'optio-purple-light': '#8058AC',
        'optio-pink': '#EF597B',
        'optio-pink-dark': '#E73862',
        neutral: {
          50: '#F3EFF4',
          100: '#EEEBEF',
          300: '#BAB4BB',
          400: '#908B92',
          500: '#605C61',
          700: '#3B383C',
          900: '#1B191B',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #6D469B 0%, #EF597B 100%)',
        'gradient-hero-accent': 'linear-gradient(180deg, #E7ABF3 0%, #BE84C9 100%)',
      },
      screens: {
        xs: '475px',
      },
      borderRadius: {
        xl: '12px',
      },
    },
  },
  plugins: [],
}
