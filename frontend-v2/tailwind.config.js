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
        'optio-purple-light': '#8058AC',
        'optio-pink': '#EF597B',
        'optio-pink-dark': '#E73862',

        // Surfaces (light) - warm purple-tinted neutrals
        surface: {
          DEFAULT: '#FFFFFF',
          50: '#F8F6FA',     // was #F9FAFB - now warm lavender tint
          100: '#F1EDF5',    // was #F3F4F6 - warm for input bgs, empty states
          200: '#E2DCE8',    // was #E5E7EB - warm for borders, dividers
          300: '#CEC6D6',    // was #D1D5DB - warm for stronger borders
        },

        // Surfaces (dark) - purple-tinted dark
        'dark-surface': {
          DEFAULT: '#1A1A2E',
          50: '#16162A',
          100: '#1E1E36',
          200: '#2A2A42',
          300: '#3A3A52',
        },

        // Typography (light) - warm gray
        typo: {
          DEFAULT: '#1F1B29',  // was #1F2937 - warmer
          700: '#352F41',      // was #374151 - warmer
          500: '#6B6280',      // was #6B7280 - purple tint
          400: '#9A93A8',      // was #9CA3AF - purple tint
          300: '#CEC6D6',      // was #D1D5DB - matches surface-300
        },

        // Typography (dark)
        'dark-typo': {
          DEFAULT: '#F3F0F6',
          700: '#E5E0EB',
          500: '#9A93A8',
          400: '#6B6280',
          300: '#4B4558',
        },

        // Brand accent surface - for highlighted cards, section bgs
        'brand-surface': {
          50: '#F3EFF8',     // very subtle purple bg
          100: '#EBE4F2',    // light purple bg for feature cards
          200: '#D9CEE6',    // medium purple bg
        },

        // Brand accent surface (dark) - purple-tinted dark cards/section bgs.
        // Pair with brand-surface via `bg-brand-surface-100 dark:bg-dark-brand-surface-100`.
        'dark-brand-surface': {
          50: '#241E33',     // subtle purple-dark bg
          100: '#2C2440',    // purple-dark for feature cards
          200: '#3A3052',    // medium purple-dark bg
        },

        // Pillars
        // Derived from shared/pillars.json so this file and the web app's
        // tailwind config cannot drift apart -- which is how civics and
        // wellness ended up swapped between the two. Not a plain object: a
        // hardcoded copy here would be the fifth one.
        pillar: Object.fromEntries(
          require('../shared/pillars.json').pillars.map((p) => [p.key, p.color]),
        ),
      },
      // Body text sizes, deliberately a step above Tailwind's web defaults.
      //
      // 77% of this app's sized text rendered at 12px or 14px against an iOS
      // body default of 17px, and families at iCreate's orientation reported it
      // as simply too small to read (2026-08-18). These are the sizes UIText
      // maps to; headings keep the standard scale, which was never the problem.
      //
      // Named rather than overriding text-xs/text-sm so the standard classes
      // still mean what they say wherever they are used directly.
      fontSize: {
        'body-xs': '13px',
        'body-sm': '15px',
        'body-md': '17px',
        'body-lg': '20px',
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
