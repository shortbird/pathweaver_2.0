/**
 * Auth Store - Zustand store for authentication state.
 *
 * Handles login, register, logout, token persistence, and user loading.
 * Replaces the old AuthContext with a simpler, more testable pattern.
 */

import { create } from 'zustand';
import { authAPI } from '../services/api';
import { tokenStore } from '../services/tokenStore';

export interface User {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  role: string;
  org_role: string | null;
  organization_id: string | null;
  total_xp: number;
  avatar_url: string | null;
  date_of_birth: string | null;
  is_dependent: boolean;
  managed_by_parent_id: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  loadUser: async () => {
    try {
      // Restore tokens from secure storage
      const hasTokens = await tokenStore.restore();
      if (!hasTokens) {
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      // Fetch current user (/me returns user data directly, not wrapped)
      const { data } = await authAPI.me();
      set({
        user: data,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      // Token expired or invalid
      await tokenStore.clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.login(email, password);
      await tokenStore.setTokens(data.app_access_token, data.app_refresh_token);

      // Login response includes user data directly
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.response?.data?.error || 'Login failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (regData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.register(regData);
      if (data.access_token) {
        await tokenStore.setTokens(data.access_token, data.refresh_token);
        const { data: meData } = await authAPI.me();
        set({
          user: meData.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        // Email verification required
        set({ isLoading: false });
      }
    } catch (err: any) {
      const message =
        err.response?.data?.error || 'Registration failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore errors -- clear local state regardless
    }
    await tokenStore.clearTokens();
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
