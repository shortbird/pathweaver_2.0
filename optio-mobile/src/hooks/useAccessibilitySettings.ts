/**
 * useAccessibilitySettings - Reads system accessibility preferences.
 *
 * Provides booleans for:
 *   - reduceTransparency: Glass becomes frostier / opaque
 *   - reduceMotion: No springs, no glow, simple fades
 *   - boldText: System handles font weight
 *   - highContrast: Glass becomes solid with high-contrast borders
 *
 * Components read these values to adjust their rendering.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

interface AccessibilitySettings {
  reduceTransparency: boolean;
  reduceMotion: boolean;
  boldText: boolean;
  highContrast: boolean;
}

const defaults: AccessibilitySettings = {
  reduceTransparency: false,
  reduceMotion: false,
  boldText: false,
  highContrast: false,
};

export function useAccessibilitySettings(): AccessibilitySettings {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaults);

  useEffect(() => {
    // Initial read
    const load = async () => {
      const [reduceMotion, reduceTransparency, boldText] = await Promise.all([
        AccessibilityInfo.isReduceMotionEnabled(),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isReduceTransparencyEnabled()
          : Promise.resolve(false),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isBoldTextEnabled()
          : Promise.resolve(false),
      ]);

      setSettings({
        reduceMotion,
        reduceTransparency,
        boldText,
        highContrast: false, // No direct API; inferred from platform
      });
    };
    load();

    // Listeners
    const motionSub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => setSettings((prev) => ({ ...prev, reduceMotion: value })),
    );

    let transparencySub: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
    if (Platform.OS === 'ios') {
      transparencySub = AccessibilityInfo.addEventListener(
        'reduceTransparencyChanged',
        (value) => setSettings((prev) => ({ ...prev, reduceTransparency: value })),
      );
    }

    let boldSub: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
    if (Platform.OS === 'ios') {
      boldSub = AccessibilityInfo.addEventListener(
        'boldTextChanged',
        (value) => setSettings((prev) => ({ ...prev, boldText: value })),
      );
    }

    return () => {
      motionSub.remove();
      transparencySub?.remove();
      boldSub?.remove();
    };
  }, []);

  return settings;
}
