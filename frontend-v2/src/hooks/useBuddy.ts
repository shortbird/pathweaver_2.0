/**
 * Buddy hooks - pet companion system API.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface BuddyData {
  id: string;
  user_id: string;
  name: string;
  vitality: number;
  bond: number;
  stage: number;
  highest_stage: number;
  last_interaction: string;
  last_fed_date: string | null;
  total_xp_fed: number;
  xp_fed_today: number;
  food_journal: string[] | null;
  wallet: number;
  equipped: Record<string, string>;
}

export function useBuddy() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [buddy, setBuddy] = useState<BuddyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBuddy = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/buddy');
      setBuddy(data.buddy || null);
    } catch {
      setBuddy(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const createBuddy = async (name: string) => {
    const { data } = await api.post('/api/buddy', { name });
    const b = data.buddy || data;
    setBuddy(b);
    return b;
  };

  const feedBuddy = async (payload: Record<string, any>) => {
    const { data } = await api.post('/api/buddy/feed', payload);
    const b = data.buddy || data;
    setBuddy(b);
    return b;
  };

  const tapBuddy = async (payload: Record<string, any>) => {
    const { data } = await api.post('/api/buddy/tap', payload);
    const b = data.buddy || data;
    setBuddy(b);
    return b;
  };

  const updateBuddy = async (payload: Partial<BuddyData>) => {
    const { data } = await api.put('/api/buddy', payload);
    const b = data.buddy || data;
    setBuddy(b);
    return b;
  };

  useEffect(() => { fetchBuddy(); }, [fetchBuddy]);

  return { buddy, loading, createBuddy, feedBuddy, tapBuddy, updateBuddy, refetch: fetchBuddy };
}
