/**
 * Yeti Store - Zustand store for Yeti pet state, shop, and inventory.
 *
 * Manages pet data, shop items, inventory, and spendable XP balance.
 */

import { create } from 'zustand';
import api from '../services/api';

export interface YetiPet {
  id: string;
  user_id: string;
  name: string;
  hunger: number;
  happiness: number;
  energy: number;
  spendable_xp: number;
  total_xp_spent: number;
  accessories: string[];
  last_fed_at: string | null;
  last_interaction_at: string | null;
}

export interface ShopItem {
  id: string;
  name: string;
  category: 'food' | 'toy' | 'accessory';
  xp_cost: number;
  effect: {
    hunger?: number;
    happiness?: number;
    energy?: number;
  };
  image_url: string | null;
  rarity: 'common' | 'rare' | 'legendary';
  is_active: boolean;
}

export interface InventoryEntry {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
}

interface YetiState {
  pet: YetiPet | null;
  shopItems: ShopItem[];
  inventory: InventoryEntry[];
  spendableXp: number;
  isLoading: boolean;
  error: string | null;

  loadPet: () => Promise<void>;
  createPet: (name: string) => Promise<void>;
  renamePet: (name: string) => Promise<void>;
  feedPet: (itemId: string) => Promise<void>;
  playWithPet: () => Promise<void>;
  loadShop: (category?: string) => Promise<void>;
  buyItem: (itemId: string) => Promise<void>;
  loadInventory: () => Promise<void>;
  loadBalance: () => Promise<void>;
  equipAccessory: (itemId: string) => Promise<void>;
  unequipAccessory: (itemId: string) => Promise<void>;
  clearError: () => void;
}

export const useYetiStore = create<YetiState>((set, get) => ({
  pet: null,
  shopItems: [],
  inventory: [],
  spendableXp: 0,
  isLoading: false,
  error: null,

  loadPet: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/api/yeti/my-pet');
      set({ pet: response.data.pet, isLoading: false });
    } catch {
      set({ pet: null, isLoading: false });
    }
  },

  createPet: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/api/yeti/my-pet', { name });
      set({ pet: response.data.pet, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to create Yeti';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  renamePet: async (name: string) => {
    set({ error: null });
    try {
      const response = await api.put('/api/yeti/my-pet/name', { name });
      set({ pet: response.data.pet });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to rename Yeti';
      set({ error: message });
      throw new Error(message);
    }
  },

  feedPet: async (itemId: string) => {
    set({ error: null });
    try {
      const response = await api.post('/api/yeti/my-pet/feed', { item_id: itemId });
      set({ pet: response.data.pet });
      // Refresh inventory after feeding (quantity decremented)
      get().loadInventory();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to feed Yeti';
      set({ error: message });
      throw new Error(message);
    }
  },

  playWithPet: async () => {
    set({ error: null });
    try {
      const response = await api.post('/api/yeti/my-pet/play', {});
      set({ pet: response.data.pet });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to play with Yeti';
      set({ error: message });
      throw new Error(message);
    }
  },

  loadShop: async (category?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = category ? `?category=${category}` : '';
      const response = await api.get(`/api/yeti/shop${params}`);
      set({ shopItems: response.data.items, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to load shop';
      set({ error: message, isLoading: false });
    }
  },

  buyItem: async (itemId: string) => {
    set({ error: null });
    try {
      await api.post('/api/yeti/shop/buy', { item_id: itemId });
      // Refresh balance and inventory after purchase
      await Promise.all([get().loadBalance(), get().loadInventory()]);
    } catch (error: any) {
      const message = error.response?.data?.error || 'Not enough XP';
      set({ error: message });
      throw new Error(message);
    }
  },

  loadInventory: async () => {
    try {
      const response = await api.get('/api/yeti/inventory');
      set({ inventory: response.data.inventory });
    } catch {
      // Silent fail
    }
  },

  loadBalance: async () => {
    try {
      const response = await api.get('/api/yeti/my-pet/balance');
      set({ spendableXp: response.data.spendable_xp });
    } catch {
      // Silent fail
    }
  },

  equipAccessory: async (itemId: string) => {
    set({ error: null });
    try {
      const response = await api.post('/api/yeti/my-pet/equip', { item_id: itemId });
      set({ pet: response.data.pet });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to equip';
      set({ error: message });
      throw new Error(message);
    }
  },

  unequipAccessory: async (itemId: string) => {
    set({ error: null });
    try {
      const response = await api.post('/api/yeti/my-pet/unequip', { item_id: itemId });
      set({ pet: response.data.pet });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to unequip';
      set({ error: message });
      throw new Error(message);
    }
  },

  clearError: () => set({ error: null }),
}));
