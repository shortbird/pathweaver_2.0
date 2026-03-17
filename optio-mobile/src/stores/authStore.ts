/**
 * Auth Store - Zustand store for authentication state.
 *
 * Manages login, register, Google OAuth, logout, and user profile.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { storage } from '../utils/storage';
import api from '../services/api';
import { supabase } from '../services/supabase';
import { captureEvent, resetUser as resetPostHogUser } from '../services/posthog';

interface User {
  id: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  org_role: string | null;
  is_dependent: boolean;
  date_of_birth: string | null;
  organization_id: string | null;
  total_xp: number;
  created_at: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Google OAuth TOS flow
  pendingTosToken: string | null;
  pendingTosUser: User | null;

  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) => Promise<{ emailVerificationRequired?: boolean }>;
  signInWithGoogle: () => Promise<void>;
  acceptTos: (promoCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  pendingTosToken: null,
  pendingTosUser: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { app_access_token, app_refresh_token, user } = response.data;

      await storage.setItem('access_token', app_access_token);
      if (app_refresh_token) {
        await storage.setItem('refresh_token', app_refresh_token);
      }

      captureEvent('login_completed', { method: 'email' });
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed';
      captureEvent('login_failed', { method: 'email' });
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/auth/register', {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        acceptedLegalTerms: true,
      });

      const { app_access_token, app_refresh_token, user, email_verification_required } =
        response.data;

      if (email_verification_required) {
        set({ isLoading: false });
        return { emailVerificationRequired: true };
      }

      await storage.setItem('access_token', app_access_token);
      if (app_refresh_token) {
        await storage.setItem('refresh_token', app_refresh_token);
      }

      captureEvent('registration_completed', { method: 'email' });
      set({ user, isAuthenticated: true, isLoading: false });
      return {};
    } catch (error: any) {
      const message = error.response?.data?.error || 'Registration failed';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      if (Platform.OS === 'web') {
        // Web: Use Supabase OAuth redirect
        const redirectTo = `${window.location.origin}`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: { access_type: 'offline', prompt: 'consent' },
          },
        });
        if (error) throw new Error(error.message);
        // User will be redirected -- loading state stays true
      } else {
        // Native: Use expo-web-browser to open OAuth URL
        const redirectTo = 'exp://localhost:8081'; // Expo dev

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: { access_type: 'offline', prompt: 'consent' },
            skipBrowserRedirect: true,
          },
        });
        if (error) throw new Error(error.message);
        if (data?.url) {
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (result.type === 'success' && result.url) {
            const params = new URLSearchParams(result.url.split('#')[1] || '');
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken) {
              await handleGoogleTokens(accessToken, refreshToken, set);
              return;
            }
          }
        }
        set({ isLoading: false, error: 'Google sign-in was cancelled' });
      }
    } catch (error: any) {
      set({ error: error.message || 'Google sign-in failed', isLoading: false });
    }
  },

  acceptTos: async (promoCode?: string) => {
    const { pendingTosToken } = get();
    if (!pendingTosToken) return;

    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/auth/google/accept-tos', {
        tos_acceptance_token: pendingTosToken,
        accepted_tos: true,
        accepted_privacy: true,
        promo_code: promoCode || undefined,
      });

      const { app_access_token, app_refresh_token, user } = response.data;

      await storage.setItem('access_token', app_access_token);
      if (app_refresh_token) {
        await storage.setItem('refresh_token', app_refresh_token);
      }

      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        pendingTosToken: null,
        pendingTosUser: null,
      });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to accept terms';
      set({ error: message, isLoading: false });
    }
  },

  logout: async () => {
    captureEvent('logout');
    resetPostHogUser();
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    set({ user: null, isAuthenticated: false, error: null });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const token = await storage.getItem('access_token');
      if (!token) {
        // Check for OAuth callback tokens in URL (web only)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window.location.hash;
          if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            // Clear hash from URL
            window.history.replaceState(null, '', window.location.pathname);
            if (accessToken) {
              await handleGoogleTokens(accessToken, refreshToken, set);
              return;
            }
          }
        }
        set({ isLoading: false });
        return;
      }

      const response = await api.get('/api/auth/me');
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch {
      await storage.deleteItem('access_token');
      await storage.deleteItem('refresh_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

/** Exchange Supabase OAuth tokens for app tokens via backend */
async function handleGoogleTokens(
  accessToken: string,
  refreshToken: string | null,
  set: any,
) {
  try {
    const response = await api.post('/api/auth/google/callback', {
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (response.data.requires_tos_acceptance) {
      set({
        isLoading: false,
        pendingTosToken: response.data.tos_acceptance_token,
        pendingTosUser: response.data.user,
      });
      return;
    }

    const { app_access_token, app_refresh_token, user } = response.data;

    await storage.setItem('access_token', app_access_token);
    if (app_refresh_token) {
      await storage.setItem('refresh_token', app_refresh_token);
    }

    captureEvent('login_completed', { method: 'google', is_new_user: response.data.is_new_user || false });
    set({ user, isAuthenticated: true, isLoading: false });
  } catch (error: any) {
    const message = error.response?.data?.message || 'Google sign-in failed';
    captureEvent('login_failed', { method: 'google' });
    set({ error: message, isLoading: false });
  }
}
