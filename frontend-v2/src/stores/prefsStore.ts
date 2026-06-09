/**
 * Prefs Store - Small "seen this once" flags persisted across launches.
 *
 * Native: expo-secure-store (we already use SecureStore for theme + tokens, no
 * need to pull in AsyncStorage just for booleans).
 * Web: localStorage.
 *
 * Use for flags like "user has dismissed the onboarding carousel" or
 * "observer has seen the welcome modal" — anything where re-showing on every
 * launch would be annoying. Don't put auth-sensitive data here.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export async function getFlag(key: string): Promise<boolean> {
  try {
    let value: string | null = null;
    if (Platform.OS === 'web') {
      value = localStorage.getItem(key);
    } else {
      value = await SecureStore.getItemAsync(key);
    }
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setFlag(key: string, value: boolean = true): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } else if (value) {
      await SecureStore.setItemAsync(key, 'true');
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // Private mode / storage full — losing a "seen" flag is non-fatal.
  }
}

export const PrefsKeys = {
  OnboardingSeen: 'optio_onboarding_seen',
  ObserverWelcomeSeen: 'optio_observer_welcome_seen',
  ParentWelcomeSeen: 'optio_parent_welcome_seen',
  // "How bounties work" explainer card on the Bounties screen — true once the
  // user has collapsed it, so it stays collapsed across launches (re-openable
  // by tapping the header again). Expanded by default on first visit.
  BountyGuideCollapsed: 'optio_bounty_guide_collapsed',
} as const;
