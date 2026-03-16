/**
 * Auth Store - Zustand store for authentication state.
 *
 * Manages login/logout, token storage, and user profile.
 */

import { create } from 'zustand';
import { storage } from '../utils/storage';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  org_role: string | null;
  is_dependent: boolean;
  date_of_birth: string | null;
  organization_id: string | null;
  total_xp: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { access_token, refresh_token, user } = response.data;

      await storage.setItem('access_token', access_token);
      if (refresh_token) {
        await storage.setItem('refresh_token', refresh_token);
      }

      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: async () => {
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    set({ user: null, isAuthenticated: false, error: null });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const token = await storage.getItem('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }

      const response = await api.get('/api/auth/me');
      set({ user: response.data.user, isAuthenticated: true, isLoading: false });
    } catch {
      // Token expired or invalid
      await storage.deleteItem('access_token');
      await storage.deleteItem('refresh_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
