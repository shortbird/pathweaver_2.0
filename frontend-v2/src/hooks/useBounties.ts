/**
 * Bounty hooks - browse, claims, and posted bounties.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface Bounty {
  id: string;
  title: string;
  description: string;
  pillar: string;
  xp_reward: number;
  poster_id: string;
  poster_name?: string;
  rewards: Array<{ type: string; value: string; pillar?: string }>;
  deliverables: Array<{ id: string; text: string }>;
  status: string;
  claims_count?: number;
  created_at: string;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  student_id: string;
  status: 'claimed' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  evidence: any;
  bounty?: Bounty;
  created_at: string;
}

export function useBounties(pillarFilter?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBounties = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (pillarFilter) params.pillar = pillarFilter;
      const { data } = await api.get('/api/bounties', { params });
      setBounties(data.bounties || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, pillarFilter]);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);

  return { bounties, loading, refetch: fetchBounties };
}

export function useMyClaims() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [claims, setClaims] = useState<BountyClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClaims = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/bounties/my-claims');
      setClaims(data.claims || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  return { claims, loading, refetch: fetchClaims };
}

export function useMyPosted() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosted = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/bounties/my-posted');
      setBounties(data.bounties || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchPosted(); }, [fetchPosted]);

  return { bounties, loading, refetch: fetchPosted };
}
