/**
 * Design Token System - Single source of truth for all design values.
 * Change once, updates everywhere.
 *
 * Based on Optio brand colors + Liquid Glass aesthetic.
 */

export const tokens = {
  colors: {
    primary: '#6D469B',       // optio-purple
    primaryDark: '#5A3A82',   // optio-purple hover
    accent: '#EF597B',        // optio-pink
    accentDark: '#E73862',    // optio-pink hover

    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',

    glass: {
      background: 'rgba(255, 255, 255, 0.12)',
      backgroundSolid: 'rgba(255, 255, 255, 0.85)',
      border: 'rgba(255, 255, 255, 0.2)',
      shadow: 'rgba(0, 0, 0, 0.1)',
    },

    pillars: {
      stem: '#2469D1',
      art: '#AF56E5',
      communication: '#3DA24A',
      civics: '#FF9028',
      wellness: '#E65C5C',
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
    full: 9999,
  },

  blur: {
    light: 10,
    medium: 20,
    heavy: 40,
  },

  typography: {
    fontFamily: 'System',  // Will use Poppins when loaded
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
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
  },
} as const;

export type PillarKey = keyof typeof tokens.colors.pillars;
export type ReactionType = keyof typeof tokens.colors.reactions;
