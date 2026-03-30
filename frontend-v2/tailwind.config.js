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

        // Surfaces (light)
        surface: {
          DEFAULT: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
        },

        // Surfaces (dark)
        'dark-surface': {
          DEFAULT: '#1A1A2E',
          50: '#16162A',
          100: '#1E1E36',
          200: '#2A2A42',
          300: '#3A3A52',
        },

        // Typography (light)
        typo: {
          DEFAULT: '#1F2937',
          700: '#374151',
          500: '#6B7280',
          400: '#9CA3AF',
          300: '#D1D5DB',
        },

        // Typography (dark)
        'dark-typo': {
          DEFAULT: '#F3F4F6',
          700: '#E5E7EB',
          500: '#9CA3AF',
          400: '#6B7280',
          300: '#4B5563',
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
