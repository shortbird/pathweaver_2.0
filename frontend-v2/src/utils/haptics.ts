/**
 * Tiny wrapper around `expo-haptics` so the rest of the app can fire
 * platform-correct haptic feedback without per-callsite imports / try-catches.
 *
 * Why:
 *   - Web has no haptics; calls should no-op silently.
 *   - `expo-haptics` is only available on native — direct `require` would
 *     blow up the web bundle. We lazy-resolve once and cache.
 *   - We want the call sites to read like `haptic.light()` / `haptic.success()`
 *     instead of remembering `Haptics.NotificationFeedbackType.Success`.
 *
 * Cost: zero on web (no-op functions). On native: one bridge hop per call,
 * which is what the OS-level haptic engine expects.
 */

import { Platform } from 'react-native';

let Haptics: typeof import('expo-haptics') | null = null;
if (Platform.OS !== 'web') {
  try {
    Haptics = require('expo-haptics');
  } catch {
    Haptics = null;
  }
}

const safe = <T extends () => void | Promise<void>>(fn: T) => {
  return () => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).then === 'function') {
        (r as Promise<void>).catch(() => { /* haptics shouldn't ever throw out of band */ });
      }
    } catch {
      // ignore
    }
  };
};

/**
 * Public API. Naming favors *intent* over Expo's primitive types so callers
 * don't have to think about Impact vs Notification vs Selection.
 */
export const haptic = {
  /** Subtle tap. Use on small UI toggles (pill chips, switches). */
  light: safe(() => {
    if (Haptics) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }),
  /** Medium tap. Use on primary button press (Save, Send, Claim). */
  medium: safe(() => {
    if (Haptics) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }),
  /** Heavier tap. Use sparingly for destructive confirms. */
  heavy: safe(() => {
    if (Haptics) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }),
  /** Picker / selection-style tick. Use for inline list picking. */
  selection: safe(() => {
    if (Haptics) return Haptics.selectionAsync();
  }),
  /** Success notification (3-pulse). Use after a save / send completes. */
  success: safe(() => {
    if (Haptics) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }),
  /** Warning notification. Use when something needs the user's attention. */
  warning: safe(() => {
    if (Haptics) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }),
  /** Error notification. Use after a failed save / network error. */
  error: safe(() => {
    if (Haptics) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }),
};

export default haptic;
