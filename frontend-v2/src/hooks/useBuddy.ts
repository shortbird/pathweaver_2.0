/**
 * Buddy hooks - pet companion system.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface Buddy {
  id: string;
  user_id: string;
  name: string;
  vitality: number;
  bond: number;
  stage: number;
  highest_stage: number;
  last_interaction: string;
  last_fed_date: string;
  total_xp_fed: number;
  xp_fed_today: number;
  food_journal: string[];
  wallet: number;
  equipped: any;
}

export function useBuddy() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [buddy, setBuddy] = useState<Buddy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBuddy = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/buddy');
      setBuddy(data.buddy || data);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setBuddy(null);
      } else {
        setError('Failed to load buddy');
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const createBuddy = async (name: string) => {
    const { data } = await api.post('/api/buddy', { name });
    setBuddy(data.buddy || data);
    return data;
  };

  const feedBuddy = async () => {
    const { data } = await api.post('/api/buddy/feed', {});
    setBuddy(data.buddy || data);
    return data;
  };

  const tapBuddy = async () => {
    const { data } = await api.post('/api/buddy/tap', {});
    setBuddy(data.buddy || data);
    return data;
  };

  useEffect(() => { fetchBuddy(); }, [fetchBuddy]);

  return { buddy, loading, error, createBuddy, feedBuddy, tapBuddy, refetch: fetchBuddy };
}
