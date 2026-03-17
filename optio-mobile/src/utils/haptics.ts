/**
 * Haptics - Centralized haptic feedback utilities.
 *
 * Wraps expo-haptics with platform safety (no-op on web).
 * All haptic calls are fire-and-forget; errors are silently caught.
 */

import { Platform } from 'react-native';

async function getHaptics() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-haptics');
  } catch {
    return null;
  }
}

/** Light tap -- for glass button presses, tab switches */
export async function lightTap() {
  const Haptics = await getHaptics();
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium impact -- for tab switches, bounty claims */
export async function mediumImpact() {
  const Haptics = await getHaptics();
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Selection feedback -- for segmented controls, filter chips */
export async function selectionFeedback() {
  const Haptics = await getHaptics();
  Haptics?.selectionAsync();
}

/** Success notification -- for completed actions */
export async function successNotification() {
  const Haptics = await getHaptics();
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error notification -- for failed actions */
export async function errorNotification() {
  const Haptics = await getHaptics();
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
