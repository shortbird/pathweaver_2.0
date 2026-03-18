/**
 * Design Token System - Single source of truth for all design values.
 * Change once, updates everywhere.
 *
 * Based on Optio brand colors + Liquid Glass aesthetic (light mode).
 */

export const tokens = {
  colors: {
    primary: '#6D469B',       // optio-purple
    primaryDark: '#5A3A82',   // optio-purple hover
    accent: '#EF597B',        // optio-pink
    accentDark: '#E73862',    // optio-pink hover

    // Theme-dependent colors REMOVED -- use useThemeStore().colors instead:
    // background, surface, text, textSecondary, textMuted, border,
    // error, success, warning, glass.*

    touch: {
      glowColor: 'rgba(255, 255, 255, 0.3)',
      glowRadius: 60,
      glowDuration: 200,
      scalePressed: 0.97,
    },

    pillars: {
      stem: '#2469D1',
      art: '#AF56E5',
      communication: '#3DA24A',
      civics: '#FF9028',
      wellness: '#E65C5C',
    },

    // Blob colors - vivid shapes behind glass
    blobs: {
      purple: '#6D469B',
      pink: '#C74B8B',
      teal: '#2BA5A5',
      olive: '#8B9A3C',
      blue: '#3366CC',
    },

    reactions: {
      proud: '#FFD700',
      mind_blown: '#FF6B35',
      inspired: '#FFC107',
      love_it: '#EF597B',
      curious: '#6D469B',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    full: 9999,
  },

  blur: {
    light: 20,
    medium: 40,
    heavy: 80,
  },

  scroll: {
    edgeFadeHeight: 24,
  },

  materialization: {
    blurFrom: 20,
    blurTo: 0,
    duration: 250,
  },

  typography: {
    fontFamily: 'Poppins-Regular',
    fonts: {
      regular: 'Poppins-Regular',
      medium: 'Poppins-Medium',
      semiBold: 'Poppins-SemiBold',
      bold: 'Poppins-Bold',
    },
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 24,
      xxl: 32,
      hero: 40,
    },
    weights: {
      regular: '400' as const,
      medium: '500' as const,
      semiBold: '600' as const,
      bold: '700' as const,
    },
  },

  animation: {
    spring: {
      damping: 15,
      stiffness: 150,
    },
    timing: {
      fast: 200,
      normal: 300,
      slow: 500,
    },
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 6,
    },
    glow: (color: string) => ({
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
} as const;

export type PillarKey = keyof typeof tokens.colors.pillars;
export type ReactionType = keyof typeof tokens.colors.reactions;

/** Pre-built text styles with Poppins font applied */
export const textStyles = {
  hero: { fontFamily: tokens.typography.fonts.bold, fontSize: tokens.typography.sizes.hero },
  h1: { fontFamily: tokens.typography.fonts.bold, fontSize: tokens.typography.sizes.xxl },
  h2: { fontFamily: tokens.typography.fonts.bold, fontSize: tokens.typography.sizes.xl },
  h3: { fontFamily: tokens.typography.fonts.semiBold, fontSize: tokens.typography.sizes.lg },
  body: { fontFamily: tokens.typography.fonts.regular, fontSize: tokens.typography.sizes.md },
  bodySm: { fontFamily: tokens.typography.fonts.regular, fontSize: tokens.typography.sizes.sm },
  label: { fontFamily: tokens.typography.fonts.medium, fontSize: tokens.typography.sizes.sm },
  caption: { fontFamily: tokens.typography.fonts.regular, fontSize: tokens.typography.sizes.xs },
  button: { fontFamily: tokens.typography.fonts.semiBold, fontSize: tokens.typography.sizes.md },
  buttonSm: { fontFamily: tokens.typography.fonts.semiBold, fontSize: tokens.typography.sizes.sm },
} as const;
