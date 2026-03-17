/**
 * Onboarding Store - Tracks whether the user has seen the onboarding flow.
 *
 * Persists to storage so onboarding only shows once per device.
 */

import { create } from 'zustand';
import { storage } from '../utils/storage';
import { captureEvent } from '../services/posthog';

const STORAGE_KEY = 'has_seen_onboarding';

interface OnboardingState {
  hasSeenOnboarding: boolean;
  isLoaded: boolean;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  hasSeenOnboarding: false,
  isLoaded: false,

  hydrate: async () => {
    const value = await storage.getItem(STORAGE_KEY);
    set({ hasSeenOnboarding: value === 'true', isLoaded: true });
  },

  complete: async () => {
    await storage.setItem(STORAGE_KEY, 'true');
    captureEvent('onboarding_completed');
    set({ hasSeenOnboarding: true });
  },
}));
