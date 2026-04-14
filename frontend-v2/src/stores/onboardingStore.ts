/**
 * Onboarding Store - Tracks whether a user has seen first-run onboarding.
 *
 * Native: expo-secure-store
 * Web: localStorage
 *
 * Keyed per-user so different accounts on the same device each see it once.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'optio_onboarded_';

async function read(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // Non-fatal — onboarding will just show again
  }
}

export async function hasSeenOnboarding(userId: string): Promise<boolean> {
  const value = await read(KEY_PREFIX + userId);
  return value === '1';
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  await write(KEY_PREFIX + userId, '1');
}
