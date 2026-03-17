/**
 * Theme Store - Manages light/dark mode preference.
 *
 * Persists choice via the shared storage abstraction (SecureStore native,
 * localStorage web) so it survives app restarts.
 */

import { create } from 'zustand';
import { storage } from '../utils/storage';

export type ThemeMode = 'light' | 'dark';
type BlurTint = 'light' | 'dark';

// ── Color palettes ────────────────────────────────────────────

const shared = {
  primary: '#6D469B',
  primaryDark: '#5A3A82',
  accent: '#EF597B',
  accentDark: '#E73862',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',

  pillars: {
    stem: '#2469D1',
    art: '#AF56E5',
    communication: '#3DA24A',
    civics: '#FF9028',
    wellness: '#E65C5C',
  },
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
};

interface ThemeColors {
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  error: string;
  success: string;
  warning: string;
  background: string;
  surface: string;
  surfaceOpaque: string; // Fully opaque fallback for a11y
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  glass: {
    background: string;
    backgroundHover: string;
    border: string;
    borderLight: string;
    highlight: string;
    shadow: string;
    thinBackground: string;
    thinBorder: string;
    clearDimming: string;
  };
  pillars: typeof shared.pillars;
  blobs: typeof shared.blobs;
  reactions: typeof shared.reactions;
  tabBar: string;
  blurTint: BlurTint;
  statBarBg: string;
  actionFill: string;
  inputBg: string;
  glassTint: string | null; // Per-screen glass tint color
}

export interface BlobColors {
  chevron: [string, string];
  rings: [string, string];
  wave1: [string, string];
  wave2: [string, string];
  wave3: [string, string];
}

const lightColors: ThemeColors = {
  ...shared,
  background: '#EEEAF4',
  surface: 'rgba(255, 255, 255, 0.45)',
  surfaceOpaque: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: 'rgba(30, 30, 50, 0.55)',
  textMuted: 'rgba(30, 30, 50, 0.3)',
  border: 'rgba(0, 0, 0, 0.06)',
  glass: {
    background: 'rgba(255, 255, 255, 0.18)',
    backgroundHover: 'rgba(255, 255, 255, 0.28)',
    border: 'rgba(255, 255, 255, 0.4)',
    borderLight: 'rgba(255, 255, 255, 0.2)',
    highlight: 'rgba(255, 255, 255, 0.5)',
    shadow: 'rgba(0, 0, 0, 0.08)',
    thinBackground: 'rgba(255, 255, 255, 0.12)',
    thinBorder: 'rgba(255, 255, 255, 0.2)',
    clearDimming: 'rgba(0, 0, 0, 0.35)',
  },
  tabBar: '#FFFFFF',
  blurTint: 'light',
  statBarBg: 'rgba(0, 0, 0, 0.06)',
  actionFill: 'rgba(255, 255, 255, 0.25)',
  inputBg: 'rgba(255, 255, 255, 0.5)',
  glassTint: null,
};

const darkColors: ThemeColors = {
  ...shared,
  background: '#0D0F1A',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceOpaque: '#1A1C2E',
  text: '#F5F5F7',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textMuted: 'rgba(255, 255, 255, 0.35)',
  border: 'rgba(255, 255, 255, 0.08)',
  glass: {
    background: 'rgba(255, 255, 255, 0.05)',
    backgroundHover: 'rgba(255, 255, 255, 0.09)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderLight: 'rgba(255, 255, 255, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.15)',
    shadow: 'rgba(0, 0, 0, 0.4)',
    thinBackground: 'rgba(255, 255, 255, 0.03)',
    thinBorder: 'rgba(255, 255, 255, 0.06)',
    clearDimming: 'rgba(0, 0, 0, 0.5)',
  },
  tabBar: '#0D0F1A',
  blurTint: 'dark',
  statBarBg: 'rgba(255, 255, 255, 0.08)',
  actionFill: 'rgba(255, 255, 255, 0.08)',
  inputBg: 'rgba(255, 255, 255, 0.06)',
  glassTint: null,
};

const lightBlobs: BlobColors = {
  chevron: ['rgba(109, 70, 155, 0.30)', 'rgba(239, 89, 123, 0.15)'],
  rings: ['rgba(109, 70, 155, 0.25)', 'rgba(90, 58, 130, 0.10)'],
  wave1: ['rgba(109, 70, 155, 0.20)', 'rgba(175, 86, 229, 0.08)'],
  wave2: ['rgba(199, 75, 139, 0.22)', 'rgba(109, 70, 155, 0.10)'],
  wave3: ['rgba(36, 105, 209, 0.18)', 'rgba(109, 70, 155, 0.08)'],
};

const darkBlobs: BlobColors = {
  chevron: ['rgba(109, 70, 155, 0.50)', 'rgba(239, 89, 123, 0.30)'],
  rings: ['rgba(109, 70, 155, 0.40)', 'rgba(90, 58, 130, 0.20)'],
  wave1: ['rgba(109, 70, 155, 0.35)', 'rgba(175, 86, 229, 0.18)'],
  wave2: ['rgba(199, 75, 139, 0.38)', 'rgba(109, 70, 155, 0.20)'],
  wave3: ['rgba(36, 105, 209, 0.30)', 'rgba(109, 70, 155, 0.15)'],
};

// ── Store ─────────────────────────────────────────────────────

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  blobColors: BlobColors;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
  setGlassTint: (tint: string | null) => void;
  hydrate: () => Promise<void>;
}

function colorsForMode(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}

function blobsForMode(mode: ThemeMode): BlobColors {
  return mode === 'dark' ? darkBlobs : lightBlobs;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'light',
  colors: lightColors,
  blobColors: lightBlobs,

  hydrate: async () => {
    const saved = await storage.getItem('theme-mode');
    if (saved === 'dark' || saved === 'light') {
      set({ mode: saved, colors: colorsForMode(saved), blobColors: blobsForMode(saved) });
    }
  },

  toggle: () =>
    set((state) => {
      const next: ThemeMode = state.mode === 'light' ? 'dark' : 'light';
      storage.setItem('theme-mode', next);
      return { mode: next, colors: colorsForMode(next), blobColors: blobsForMode(next) };
    }),

  setMode: (mode: ThemeMode) => {
    storage.setItem('theme-mode', mode);
    set({ mode, colors: colorsForMode(mode), blobColors: blobsForMode(mode) });
  },

  setGlassTint: (tint: string | null) =>
    set((state) => ({
      colors: { ...state.colors, glassTint: tint },
    })),
}));
