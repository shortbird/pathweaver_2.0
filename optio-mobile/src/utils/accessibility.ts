/**
 * Accessibility Utilities - WCAG 2.1 AA helpers for mobile.
 *
 * Provides consistent accessibility props for common patterns.
 */

import { AccessibilityProps } from 'react-native';

/** Standard accessible button props */
export function buttonA11y(label: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: 'button',
    accessibilityLabel: label,
  };
}

/** Standard accessible heading props */
export function headingA11y(label: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: 'header',
    accessibilityLabel: label,
  };
}

/** Standard accessible image props */
export function imageA11y(label: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: 'image',
    accessibilityLabel: label,
  };
}

/** Accessible progress bar */
export function progressA11y(label: string, value: number, max = 100): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: 'progressbar',
    accessibilityLabel: `${label}: ${Math.round(value)} of ${max}`,
    accessibilityValue: { min: 0, max, now: Math.round(value) },
  };
}

/** Accessible tab/toggle button */
export function tabA11y(label: string, selected: boolean): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: 'tab',
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

/** Accessible text input */
export function inputA11y(label: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: label,
  };
}

/** Minimum touch target size (44x44 per WCAG 2.1 AA) */
export const MIN_TOUCH_TARGET = 44;
