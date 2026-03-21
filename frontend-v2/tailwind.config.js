const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand
        'optio-purple': '#6D469B',
        'optio-purple-dark': '#5A3A82',
        'optio-pink': '#EF597B',
        'optio-pink-dark': '#E73862',

        // Surfaces
        surface: {
          DEFAULT: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
        },

        // Typography
        typo: {
          DEFAULT: '#1F2937',
          700: '#374151',
          500: '#6B7280',
          400: '#9CA3AF',
          300: '#D1D5DB',
        },

        // Pillars
        pillar: {
          stem: '#2469D1',
          art: '#AF56E5',
          communication: '#3DA24A',
          civics: '#FF9028',
          wellness: '#E65C5C',
        },
      },
      fontFamily: {
        poppins: ['Poppins_400Regular'],
        'poppins-medium': ['Poppins_500Medium'],
        'poppins-semibold': ['Poppins_600SemiBold'],
        'poppins-bold': ['Poppins_700Bold'],
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [],
};
