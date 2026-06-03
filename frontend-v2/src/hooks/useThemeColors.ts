/**
 * useThemeColors - theme-aware hex palette for the cases that can't use
 * Tailwind `dark:` classNames: icon `color=` props (Ionicons / SVG) and
 * inline `style={{ backgroundColor / color / borderColor }}` values.
 *
 * Values mirror the paired tokens in tailwind.config.js (surface/dark-surface,
 * typo/dark-typo). Prefer `dark:` classNames where possible; reach for this
 * only where a raw hex is required.
 *
 * Usage:
 *   const c = useThemeColors();
 *   <Ionicons name="chevron-forward" color={c.iconMuted} />
 *   <View style={{ backgroundColor: c.card, borderColor: c.border }} />
 */

import { useColorScheme } from 'nativewind';

export interface ThemeColors {
  /** App background (surface-50 / dark-surface-50) */
  background: string;
  /** Card / elevated surface (white / dark-surface-100) */
  card: string;
  /** Subtle filled surface (surface-100 / dark-surface-200) */
  surfaceMuted: string;
  /** Borders / dividers (surface-200 / dark-surface-300) */
  border: string;
  /** Primary text (typo / dark-typo) */
  text: string;
  /** Secondary text (typo-500 / dark-typo-500) */
  textMuted: string;
  /** Tertiary text + default icon color (typo-400 / dark-typo-400) */
  textFaint: string;
  /** Default icon tint — same as textMuted, named for call-site clarity */
  icon: string;
  /** Muted icon tint (chevrons, placeholders) */
  iconMuted: string;
  /** Brand purple — identical in both themes */
  brand: string;
  /** Brand pink — identical in both themes */
  brandPink: string;
  /** True when dark mode is active */
  isDark: boolean;
}

const LIGHT: ThemeColors = {
  background: '#F8F6FA',
  card: '#FFFFFF',
  surfaceMuted: '#F1EDF5',
  border: '#E2DCE8',
  text: '#1F1B29',
  textMuted: '#6B6280',
  textFaint: '#9A93A8',
  icon: '#6B6280',
  iconMuted: '#9A93A8',
  brand: '#6D469B',
  brandPink: '#EF597B',
  isDark: false,
};

const DARK: ThemeColors = {
  background: '#16162A',
  card: '#1E1E36',
  surfaceMuted: '#2A2A42',
  border: '#3A3A52',
  text: '#F3F0F6',
  textMuted: '#9A93A8',
  textFaint: '#6B6280',
  icon: '#9A93A8',
  iconMuted: '#6B6280',
  brand: '#8058AC',
  brandPink: '#EF597B',
  isDark: true,
};

export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? DARK : LIGHT;
}
