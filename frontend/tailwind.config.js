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
        'poppins': ['Poppins', 'sans-serif'],
        'inter': ['Inter', 'sans-serif'],
      },
      fontWeight: {
        'normal': '400',
        'medium': '600',
        'semibold': '600',
        'bold': '600',
      },
      colors: {
        // Design System: Brand colors (PRIMARY)
        'optio-purple': '#6D469B',
        'optio-purple-dark': '#5A3A82',
        'optio-purple-light': '#8058AC',
        'optio-pink': '#EF597B',
        'optio-pink-dark': '#E73862',

        // Legacy aliases (backward compatibility - point to new design system)
        primary: '#6D469B',           // → optio-purple
        'primary-dark': '#5A3A82',    // → optio-purple-dark
        'primary-light': '#8058AC',   // → optio-purple-light
        coral: '#EF597B',             // → optio-pink
        'coral-dark': '#E73862',      // → optio-pink-dark

        // Design System: Pillar colors
        'pillar-stem': '#2469D1',
        'pillar-stem-light': '#DDF1FC',
        'pillar-stem-dark': '#1B4FA3',

        'pillar-art': '#AF56E5',
        'pillar-art-light': '#F2E7F9',
        'pillar-art-dark': '#9945D1',

        'pillar-communication': '#3DA24A',
        'pillar-communication-light': '#E3F6E5',
        'pillar-communication-dark': '#2E8A3A',

        'pillar-wellness': '#FF9028',
        'pillar-wellness-light': '#FFF0E1',
        'pillar-wellness-dark': '#E67A1A',

        'pillar-civics': '#E65C5C',
        'pillar-civics-light': '#FBE5E5',
        'pillar-civics-dark': '#D43F3F',

        // Legacy nested pillar object (backward compatibility)
        'pillar': {
          'stem': '#2469D1',
          'art': '#AF56E5',
          'communication': '#3DA24A',
          'wellness': '#FF9028',
          'civics': '#E65C5C',
        },

        // Design System: Neutral palette
        'neutral': {
          50: '#F3EFF4',
          100: '#EEEBEF',
          300: '#BAB4BB',
          400: '#908B92',
          500: '#605C61',
          700: '#3B383C',
          900: '#1B191B',
        },

        // Design System: Text colors
        'text-primary': '#003f5c',
        'text-secondary': '#4a5568',
        'text-muted': '#718096',

        // Legacy colors (keep for backward compatibility)
        secondary: '#FFCA3A',
        background: '#F8F9FA',
        text: '#212529',
        border: '#DEE2E6',
      },
      backgroundImage: {
        // Brand gradients
        'gradient-primary': 'linear-gradient(135deg, #6D469B 0%, #EF597B 100%)',

        // Pillar gradients
        'gradient-pillar-stem': 'linear-gradient(135deg, #2469D1 0%, #1B4FA3 100%)',
        'gradient-pillar-art': 'linear-gradient(135deg, #AF56E5 0%, #9945D1 100%)',
        'gradient-pillar-communication': 'linear-gradient(135deg, #3DA24A 0%, #2E8A3A 100%)',
        'gradient-pillar-wellness': 'linear-gradient(135deg, #FF9028 0%, #E67A1A 100%)',
        'gradient-pillar-civics': 'linear-gradient(135deg, #E65C5C 0%, #D43F3F 100%)',
      },
      screens: {
        'xs': '475px',
        'touch': { 'raw': '(hover: none)' },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        'touch': '44px',
        'touch-sm': '40px',
        'touch-lg': '48px',
      },
      borderRadius: {
        'xl': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        // Touch and mobile utilities
        '.touch-manipulation': {
          'touch-action': 'manipulation',
        },
        '.scroll-smooth-mobile': {
          '-webkit-overflow-scrolling': 'touch',
          'scroll-behavior': 'smooth',
        },
        '.no-scroll-on-mobile': {
          '@media (max-width: 640px)': {
            'overflow': 'hidden',
          },
        },

        // Line clamp utilities
        '.line-clamp-1': {
          'display': '-webkit-box',
          '-webkit-line-clamp': '1',
          '-webkit-box-orient': 'vertical',
          'overflow': 'hidden',
        },
        '.line-clamp-2': {
          'display': '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
          'overflow': 'hidden',
        },
        '.line-clamp-3': {
          'display': '-webkit-box',
          '-webkit-line-clamp': '3',
          '-webkit-box-orient': 'vertical',
          'overflow': 'hidden',
        },
        '.line-clamp-4': {
          'display': '-webkit-box',
          '-webkit-line-clamp': '4',
          '-webkit-box-orient': 'vertical',
          'overflow': 'hidden',
        },

        // Brand gradient backgrounds with borders (centralized patterns)
        '.bg-gradient-subtle': {
          'background': 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)',
          'border': '1px solid rgba(109,70,155,0.08)',
        },
        '.bg-gradient-subtle-strong': {
          'background': 'linear-gradient(135deg, rgba(239,89,123,0.05) 0%, rgba(109,70,155,0.05) 100%)',
          'border': '1px solid rgba(109,70,155,0.1)',
        },

        // Border utilities
        '.border-optio-subtle': {
          'border': '1px solid rgba(109,70,155,0.15)',
        },

        // Shadow utilities
        '.shadow-optio': {
          'box-shadow': '0 2px 8px rgba(109,70,155,0.25)',
        },
      });
    },
  ],
}