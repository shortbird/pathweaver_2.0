/**
 * Auth Store - Zustand store for authentication state.
 *
 * Handles login, register, logout, token persistence, and user loading.
 * Replaces the old AuthContext with a simpler, more testable pattern.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import { authAPI, api } from '../services/api';
import { tokenStore } from '../services/tokenStore';
import { supabase } from '../services/supabaseClient';
import { useActingAsStore } from './actingAsStore';

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
  loginWithUsername: (slug: string, username: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  handleGoogleCallback: (accessToken: string, refreshToken: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    acceptedLegalTerms?: boolean;
  }) => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
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
      // Native: tokens persist in SecureStore. Web: tokens are memory-only — try
      // minting a fresh access token from the httpOnly refresh cookie before giving up.
      let hasTokens = await tokenStore.restore();
      if (!hasTokens && Platform.OS === 'web') {
        try {
          const { data: refreshed } = await api.post('/api/auth/refresh', {});
          if (refreshed?.access_token && refreshed?.refresh_token) {
            await tokenStore.setTokens(refreshed.access_token, refreshed.refresh_token);
            hasTokens = true;
          }
        } catch {
          // No valid refresh cookie — fall through to unauthenticated state.
        }
      }
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

  loginWithUsername: async (slug, username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.loginWithUsername(slug, username, password);
      await tokenStore.setTokens(data.app_access_token, data.app_refresh_token);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.response?.data?.error || 'Login failed. Please check your username and password.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  googleLogin: async () => {
    if (Platform.OS !== 'web') return;
    set({ isLoading: true, error: null });
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        set({ isLoading: false, error: error.message });
      }
      // User will be redirected to Google, then back to /auth/callback
    } catch (err: any) {
      set({ isLoading: false, error: 'Failed to initiate Google sign-in' });
    }
  },

  handleGoogleCallback: async (accessToken: string, refreshToken: string) => {
    set({ isLoading: true, error: null });
    try {
      // Exchange Supabase token for our app session
      const { data } = await api.post('/api/auth/google/callback', {
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (data.requires_tos_acceptance) {
        // For now, auto-accept TOS (can add modal later)
        const tosRes = await api.post('/api/auth/google/accept-tos', {
          tos_acceptance_token: data.tos_acceptance_token,
          accepted_tos: true,
          accepted_privacy: true,
        });
        await tokenStore.setTokens(tosRes.data.app_access_token, tosRes.data.app_refresh_token);
        set({
          user: tosRes.data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return;
      }

      await tokenStore.setTokens(data.app_access_token, data.app_refresh_token);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.response?.data?.message || 'Google sign-in failed';
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
      const raw = err.response?.data?.error;
      const message =
        typeof raw === 'string' ? raw
        : raw?.message ? raw.message
        : 'Registration failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  forgotPassword: async (email: string) => {
    try {
      const { data } = await authAPI.forgotPassword(email);
      return data.message || 'If an account exists with this email, you will receive reset instructions.';
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to send reset email. Please try again.';
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore errors -- clear local state regardless
    }
    // Clear acting-as / masquerade state
    useActingAsStore.getState().clear();
    await tokenStore.clearTokens();
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
