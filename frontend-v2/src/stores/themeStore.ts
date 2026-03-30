/**
 * Theme Store - Persists dark/light mode preference.
 *
 * Native: expo-secure-store
 * Web: localStorage
 *
 * The actual dark class toggling is handled by NativeWind's useColorScheme().
 * This store only manages persistence so the preference survives app restarts.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'optio_theme';

export type ThemeMode = 'light' | 'dark' | 'system';

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
