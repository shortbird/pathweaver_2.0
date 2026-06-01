/**
 * useBreakpoint - Single source of truth for responsive width tiers.
 *
 * Replaces the per-file `const DESKTOP_BREAKPOINT = 768` constants that used to
 * live in the tabs layout and MobileHeader. Centralizing makes tablet support a
 * first-class tier instead of a hardcoded magic number scattered around.
 *
 * - `isDesktop` preserves the existing chrome cutover (web + >= 768px swaps the
 *   bottom tab bar for the desktop sidebar). Keep using this for navigation chrome.
 * - `isTablet` / `isWide` / `isLargeScreen` are platform-agnostic so content
 *   layout (max-width centering, multi-column grids) also behaves on a native
 *   tablet, not just the web build.
 */

import { useWindowDimensions, Platform } from 'react-native';

export const BREAKPOINTS = {
  /** >= this width (web) swaps bottom tabs for the desktop sidebar chrome. */
  desktop: 768,
  /** >= this width is a roomy layout: large desktop or landscape tablet. */
  wide: 1024,
} as const;

export interface Breakpoint {
  width: number;
  height: number;
  isWeb: boolean;
  /** Web at >= 768px. Drives sidebar-vs-tabs chrome. Existing behavior preserved. */
  isDesktop: boolean;
  /** Any platform, 768–1023px (e.g. tablet portrait). */
  isTablet: boolean;
  /** Any platform, >= 1024px (large desktop / landscape tablet). */
  isWide: boolean;
  /** Any platform, >= 768px: "not a phone". Use for content centering + grids. */
  isLargeScreen: boolean;
}

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  return {
    width,
    height,
    isWeb,
    isDesktop: isWeb && width >= BREAKPOINTS.desktop,
    isTablet: width >= BREAKPOINTS.desktop && width < BREAKPOINTS.wide,
    isWide: width >= BREAKPOINTS.wide,
    isLargeScreen: width >= BREAKPOINTS.desktop,
  };
}
