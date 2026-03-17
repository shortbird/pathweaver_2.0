/**
 * Bounty Store - Zustand store for bounty board state.
 */

import { create } from 'zustand';
import api from '../services/api';

export interface Bounty {
  id: string;
  poster_id: string;
  title: string;
  description: string;
  requirements: string;
  pillar: string;
  bounty_type: string;
  xp_reward: number;
  max_participants: number;
  deadline: string;
  status: string;
  sponsored_reward: string | null;
  organization_id: string | null;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  student_id: string;
  status: string;
  evidence: { text?: string; url?: string; title?: string } | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface BountyState {
  bounties: Bounty[];
  myClaims: BountyClaim[];
  myPosted: Bounty[];
  isLoading: boolean;
  error: string | null;

  loadBounties: (filters?: { pillar?: string; type?: string }) => Promise<void>;
  loadMyClaims: () => Promise<void>;
  loadMyPosted: () => Promise<void>;
  claimBounty: (bountyId: string) => Promise<BountyClaim>;
  submitEvidence: (bountyId: string, claimId: string, evidence: { text?: string; url?: string }) => Promise<void>;
  clearError: () => void;
}

export const useBountyStore = create<BountyState>((set, get) => ({
  bounties: [],
  myClaims: [],
  myPosted: [],
  isLoading: false,
  error: null,

  loadBounties: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, string> = {};
      if (filters?.pillar) params.pillar = filters.pillar;
      if (filters?.type) params.type = filters.type;
      const response = await api.get('/api/bounties', { params });
      set({ bounties: response.data.bounties || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadMyClaims: async () => {
    try {
      const response = await api.get('/api/bounties/my-claims');
      set({ myClaims: response.data.claims || [] });
    } catch {
      // Silent
    }
  },

  loadMyPosted: async () => {
    try {
      const response = await api.get('/api/bounties/my-posted');
      set({ myPosted: response.data.bounties || [] });
    } catch {
      // Silent
    }
  },

  claimBounty: async (bountyId: string) => {
    set({ error: null });
    try {
      const response = await api.post(`/api/bounties/${bountyId}/claim`, {});
      get().loadMyClaims();
      return response.data.claim;
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to claim bounty';
      set({ error: message });
      throw new Error(message);
    }
  },

  submitEvidence: async (bountyId: string, claimId: string, evidence) => {
    set({ error: null });
    try {
      await api.post(`/api/bounties/${bountyId}/submit`, { claim_id: claimId, evidence });
      get().loadMyClaims();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to submit evidence';
      set({ error: message });
      throw new Error(message);
    }
  },

  clearError: () => set({ error: null }),
}));
