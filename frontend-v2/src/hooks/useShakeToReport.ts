/**
 * useShakeToReport - opens the bug reporter when the device is shaken.
 *
 * Uses expo-sensors Accelerometer (an Expo module — no custom native code, and
 * unlike the dev-menu shake it works in release builds too). We watch the
 * acceleration magnitude and fire when it crosses a threshold, debounced so one
 * shake doesn't open the sheet repeatedly.
 */

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

// Magnitude in g's. At rest magnitude ≈ 1 (gravity); a deliberate shake spikes
// well above this. 1.8 is high enough to avoid accidental triggers from walking.
export const SHAKE_THRESHOLD = 1.8;
const DEBOUNCE_MS = 1500;
const UPDATE_INTERVAL_MS = 100;

export function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Pure shake detector: returns true if this sample is a fresh shake given the
 * last-trigger timestamp. Exposed for unit testing the trigger logic.
 */
export function isShake(
  sample: { x: number; y: number; z: number },
  now: number,
  lastTriggerAt: number,
  threshold: number = SHAKE_THRESHOLD,
): boolean {
  if (magnitude(sample.x, sample.y, sample.z) < threshold) return false;
  return now - lastTriggerAt >= DEBOUNCE_MS;
}

export function useShakeToReport(onShake: () => void, enabled: boolean = true): void {
  const lastTriggerAt = useRef(0);
  // Keep the latest callback in a ref so the effect (and the live accelerometer
  // subscription) doesn't tear down/rebuild every time `onShake`'s identity
  // changes — only `enabled` should drive (re)subscription.
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    // Accelerometer isn't meaningful on web; skip to avoid noisy permission paths.
    if (!enabled || Platform.OS === 'web') return;

    let sub: { remove: () => void } | null = null;

    const subscribe = () => {
      if (sub) return;
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
      sub = Accelerometer.addListener((sample) => {
        const now = Date.now();
        if (isShake(sample, now, lastTriggerAt.current)) {
          lastTriggerAt.current = now;
          onShakeRef.current();
        }
      });
    };

    const unsubscribe = () => {
      sub?.remove();
      sub = null;
    };

    subscribe();

    // Re-arm on foreground. The accelerometer stream can stop delivering samples
    // after the app is backgrounded, leaving shake-to-report dead until the app
    // is killed and reopened (bug report). Drop the listener on background and
    // re-add it when the app becomes active again.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') subscribe();
      else unsubscribe();
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [enabled]);
}
