/**
 * Auth store test helper - directly sets Zustand store state.
 * Bypasses API calls for tests that need a specific auth state.
 */

import { useAuthStore } from '@/src/stores/authStore';
import type { User } from '@/src/stores/authStore';
import { createMockUser, createMockParent, createMockObserver } from './mockFactories';

export function setAuthState(overrides: {
  user?: User | null;
  isAuthenticated?: boolean;
  isLoading?: boolean;
  error?: string | null;
} = {}) {
  useAuthStore.setState({
    user: overrides.user ?? createMockUser(),
    isAuthenticated: overrides.isAuthenticated ?? true,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
  });
}

export function setAuthAsStudent(overrides: Partial<User> = {}) {
  setAuthState({ user: createMockUser(overrides) });
}

export function setAuthAsParent(overrides: Partial<User> = {}) {
  setAuthState({ user: createMockParent(overrides) });
}

export function setAuthAsObserver(overrides: Partial<User> = {}) {
  setAuthState({ user: createMockObserver(overrides) });
}

export function clearAuthState() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}
