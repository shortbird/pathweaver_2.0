/**
 * Buddy Store - Zustand store for buddy companion state and API calls.
 *
 * Manages buddy record, feeding, tapping, and wallet balance.
 */

import { create } from 'zustand';
import api from '../services/api';

export interface Buddy {
  id: string;
  user_id: string;
  name: string;
  vitality: number;
  bond: number;
  stage: number;
  highest_stage: number;
  last_interaction: string;
  food_journal: string[] | null;
  equipped: Record<string, string>;
  wallet: number;
  total_xp_fed: number;
  xp_fed_today: number;
  last_fed_date: string | null;
  created_at: string;
}

interface BuddyState {
  buddy: Buddy | null;
  isLoading: boolean;
  error: string | null;

  loadBuddy: () => Promise<void>;
  createBuddy: (name: string) => Promise<void>;
  updateBuddy: (updates: Partial<Buddy>) => Promise<void>;
  feedBuddy: (foodId: string, xpCost: number, newVitality: number, newBond: number, newTotalXpFed: number, newXpFedToday: number) => Promise<void>;
  tapBuddy: (newBond: number) => Promise<void>;
  clearError: () => void;
}

export const useBuddyStore = create<BuddyState>((set, get) => ({
  buddy: null,
  isLoading: false,
  error: null,

  loadBuddy: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/api/buddy');
      set({ buddy: response.data.buddy, isLoading: false });
    } catch {
      set({ buddy: null, isLoading: false });
    }
  },

  createBuddy: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/buddy', { name });
      set({ buddy: response.data.buddy, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to create buddy';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateBuddy: async (updates: Partial<Buddy>) => {
    set({ error: null });
    try {
      const response = await api.put('/api/buddy', updates);
      set({ buddy: response.data.buddy });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to update buddy';
      set({ error: message });
    }
  },

  feedBuddy: async (foodId: string, xpCost: number, newVitality: number, newBond: number, newTotalXpFed: number, newXpFedToday: number) => {
    set({ error: null });
    try {
      const response = await api.post('/api/buddy/feed', {
        food_id: foodId,
        xp_cost: xpCost,
        new_vitality: newVitality,
        new_bond: newBond,
        new_total_xp_fed: newTotalXpFed,
        new_xp_fed_today: newXpFedToday,
        last_interaction: new Date().toISOString(),
      });
      set({ buddy: response.data.buddy });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to feed buddy';
      set({ error: message });
      throw new Error(message);
    }
  },

  tapBuddy: async (newBond: number) => {
    set({ error: null });
    try {
      const response = await api.post('/api/buddy/tap', {
        new_bond: newBond,
        last_interaction: new Date().toISOString(),
      });
      set({ buddy: response.data.buddy });
    } catch {
      // Silent fail for taps - don't interrupt UX
    }
  },

  clearError: () => set({ error: null }),
}));
