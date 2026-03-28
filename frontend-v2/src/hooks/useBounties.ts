/**
 * Bounty hooks - browse, claims, posted, detail, and mutation helpers.
 */

import { useEffect, useState, useCallback } from 'react';
import api, { bountyAPI } from '../services/api';
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

export function useBountyDetail(bountyId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBounty = useCallback(async () => {
    if (!isAuthenticated || !bountyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await bountyAPI.get(bountyId);
      setBounty(data.bounty || data);
    } catch {
      setBounty(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, bountyId]);

  useEffect(() => { fetchBounty(); }, [fetchBounty]);

  return { bounty, loading, refetch: fetchBounty };
}

// ── Mutation helpers (imperative, not hooks) ──

export async function claimBounty(bountyId: string) {
  const { data } = await bountyAPI.claim(bountyId);
  return data;
}

export async function toggleDeliverable(
  bountyId: string,
  claimId: string,
  deliverableId: string,
  completed: boolean,
  evidence?: any[],
) {
  const { data } = await bountyAPI.toggleDeliverable(bountyId, claimId, {
    deliverable_id: deliverableId,
    completed,
    evidence,
  });
  return data;
}

export async function turnInBounty(bountyId: string, claimId: string) {
  const { data } = await bountyAPI.turnIn(bountyId, claimId);
  return data;
}

export async function createBounty(bountyData: Record<string, unknown>) {
  const { data } = await bountyAPI.create(bountyData);
  return data;
}

export async function updateBounty(bountyId: string, bountyData: Record<string, unknown>) {
  const { data } = await bountyAPI.update(bountyId, bountyData);
  return data;
}

export async function deleteBounty(bountyId: string) {
  const { data } = await bountyAPI.delete(bountyId);
  return data;
}

export async function reviewSubmission(
  bountyId: string,
  claimId: string,
  decision: string,
  feedback?: string,
) {
  const { data } = await bountyAPI.review(bountyId, claimId, { decision, feedback });
  return data;
}

export async function deleteEvidence(
  bountyId: string,
  claimId: string,
  deliverableId: string,
  evidenceIndex: number,
) {
  const { data } = await bountyAPI.deleteEvidence(bountyId, claimId, deliverableId, evidenceIndex);
  return data;
}

export async function uploadEvidenceFiles(formData: FormData) {
  const { data } = await bountyAPI.uploadEvidence(formData);
  return data;
}
