/**
 * Bounty hooks - browse, claims, posted, detail, and mutation helpers.
 */

import { useEffect, useState, useCallback } from 'react';
import api, { bountyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export interface Bounty {
  id: string;
  title: string;
  description: string;
  pillar: string;
  xp_reward: number;
  poster_id: string;
  poster_name?: string;
  // Two shapes, both from bounty_service.create/update:
  //   xp     -> { id, type: 'xp', value: number, pillar }
  //   custom -> { id, type: 'custom', text }
  // `value` was typed as a string and `text` was missing entirely, so a custom
  // reward could not be described at all (found by the typecheck, 2026-08-18).
  rewards: {
    id?: string;
    type: string;
    value?: string | number;
    pillar?: string;
    text?: string;
  }[];
  deliverables: { id: string; text: string }[];
  status: string;
  claims_count?: number;
  // The detail/review endpoint (useBountyDetail) embeds the full claim list;
  // list endpoints omit it. Optional so both response shapes fit one type.
  claims?: BountyClaim[];
  created_at: string;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  student_id: string;
  status: 'claimed' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  evidence: any;
  bounty?: Bounty;
  // Most recent review decision + feedback, attached by the backend so the
  // student can actually read why a revision was requested.
  latest_review?: { decision: string; feedback?: string | null; created_at?: string } | null;
  created_at: string;
}

export function useBounties(pillarFilter?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  // Surfaced, not swallowed: a network failure used to render as the
  // "No bounties yet" empty state, which reads as "there is nothing for you".
  const [error, setError] = useState(false);

  const fetchBounties = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (pillarFilter) params.pillar = pillarFilter;
      const { data } = await api.get('/api/bounties', { params });
      setBounties(data.bounties || data || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, pillarFilter]);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);
  useRefetchOnForeground(fetchBounties);

  return { bounties, loading, error, refetch: fetchBounties };
}

/**
 * `enabled=false` skips the fetch entirely. my-claims is student-only on the
 * backend; calling it for a parent fired a guaranteed 403 on every focus.
 */
export function useMyClaims(enabled: boolean = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [claims, setClaims] = useState<BountyClaim[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  const fetchClaims = useCallback(async () => {
    if (!isAuthenticated || !enabled) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/bounties/my-claims');
      setClaims(data.claims || data || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enabled]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);
  useRefetchOnForeground(fetchClaims);

  return { claims, loading, error, refetch: fetchClaims };
}

/** my-posted is poster-only on the backend; see useMyClaims on `enabled`. */
export function useMyPosted(enabled: boolean = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  const fetchPosted = useCallback(async () => {
    if (!isAuthenticated || !enabled) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/bounties/my-posted');
      setBounties(data.bounties || data || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enabled]);

  useEffect(() => { fetchPosted(); }, [fetchPosted]);
  useRefetchOnForeground(fetchPosted);

  return { bounties, loading, error, refetch: fetchPosted };
}

/**
 * Coerce a bounty's `deliverables` to an array. Some rows store it as a
 * JSON-encoded string instead of a JSON array; the detail/review screens call
 * `.forEach`/`.map` on it and crash with a render error ("forEach is not a
 * function") when it isn't already an array. Normalising here means every
 * consumer of useBountyDetail gets a guaranteed array.
 */
export function normalizeBounty(bounty: any): Bounty | null {
  if (!bounty) return null;
  let deliverables = bounty.deliverables;
  if (typeof deliverables === 'string') {
    try {
      const parsed = JSON.parse(deliverables);
      deliverables = Array.isArray(parsed) ? parsed : [];
    } catch {
      deliverables = [];
    }
  }
  if (!Array.isArray(deliverables)) deliverables = [];
  return { ...bounty, deliverables };
}

export function useBountyDetail(bountyId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  // A 500/timeout is not "this bounty was deleted" — callers render a retry
  // for `error` and "not found" only for a real 404.
  const [error, setError] = useState(false);

  const fetchBounty = useCallback(async () => {
    if (!isAuthenticated || !bountyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await bountyAPI.get(bountyId);
      setBounty(normalizeBounty(data.bounty || data));
      setError(false);
    } catch (err: any) {
      setBounty(null);
      setError(err?.response?.status !== 404);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, bountyId]);

  useEffect(() => { fetchBounty(); }, [fetchBounty]);
  useRefetchOnForeground(fetchBounty);

  return { bounty, loading, error, refetch: fetchBounty };
}

// ── Mutation helpers (imperative, not hooks) ──

export async function claimBounty(bountyId: string) {
  const { data } = await bountyAPI.claim(bountyId);
  return data;
}

export async function abandonBounty(bountyId: string, claimId: string) {
  const { data } = await bountyAPI.abandon(bountyId, claimId);
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
