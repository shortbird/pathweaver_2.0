/**
 * Theme Store - Persists dark/light mode preference.
 *
 * Native: expo-secure-store
 * Web: localStorage
 *
 * The actual dark class toggling is handled by NativeWind's useColorScheme().
 * This store only manages persistence so the preference survives app restarts.
 */

import { Platform, Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativewindColorScheme } from 'nativewind';

const THEME_KEY = 'optio_theme';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Apply a theme to NativeWind, robust to the OTA reloadAsync path.
 *
 * Background: NativeWind renders its internal `systemColorScheme` observable.
 * `setColorScheme(mode)` only sets a native Appearance OVERRIDE and relies on an
 * `appearanceChanged` event to push the value into that observable — but RN's
 * `Appearance.setColorScheme` doesn't emit that event, and NativeWind's listener
 * is guarded on `AppState === 'active'`. After `Updates.reloadAsync()` the
 * observable re-initialises to the DEVICE scheme and is never corrected, so the
 * app stuck on the device theme (dark) and the toggle was dead — even though the
 * override said light. (Verified on a Release sim build: post-reload nw=dark while
 * the override read light; `setColorScheme` did nothing; setting systemColorScheme
 * fixed it.) So we set the override AND push the resolved value straight into the
 * observable NativeWind actually renders.
 */
export function applyColorScheme(mode: ThemeMode): void {
  nativewindColorScheme.set(mode);
  if (Platform.OS === 'web') return; // web colorScheme has no systemColorScheme observable
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { systemColorScheme } = require('react-native-css-interop/dist/runtime/native/appearance-observables');
    const resolved = mode === 'system' ? (Appearance.getColorScheme() ?? 'light') : mode;
    systemColorScheme.set(resolved);
  } catch {
    // NativeWind internal path changed in an upgrade — the override above still
    // applies on the next system read; we only lose the immediate push.
  }
}

async function persist(mode: ThemeMode): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private mode or storage full
    }
  } else {
    await SecureStore.setItemAsync(THEME_KEY, mode);
  }
}

export async function loadPersistedTheme(): Promise<ThemeMode> {
  try {
    let value: string | null = null;
    if (Platform.OS === 'web') {
      value = localStorage.getItem(THEME_KEY);
    } else {
      value = await SecureStore.getItemAsync(THEME_KEY);
    }
    if (value === 'dark' || value === 'light' || value === 'system') {
      return value;
    }
  } catch {
    // Fall through to default
  }
  return 'light';
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  await persist(mode);
}
