/**
 * Bounty detail screen tests - rendering, evidence display, status banners.
 */

jest.mock('@/src/services/api', () => {
  const base = require('@/src/__tests__/utils/mockApi').mockApiModule();
  base.bountyAPI = {
    get: jest.fn().mockResolvedValue({ data: {} }),
    claim: jest.fn().mockResolvedValue({ data: {} }),
    toggleDeliverable: jest.fn().mockResolvedValue({ data: {} }),
    turnIn: jest.fn().mockResolvedValue({ data: {} }),
    uploadEvidence: jest.fn().mockResolvedValue({ data: {} }),
    list: jest.fn().mockResolvedValue({ data: {} }),
    create: jest.fn().mockResolvedValue({ data: {} }),
    update: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    myClaims: jest.fn().mockResolvedValue({ data: { claims: [] } }),
    myPosted: jest.fn().mockResolvedValue({ data: { bounties: [] } }),
    deleteEvidence: jest.fn().mockResolvedValue({ data: {} }),
    review: jest.fn().mockResolvedValue({ data: {} }),
  };
  return base;
});
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import BountyDetailPage from '../[id]';
import { bountyAPI } from '@/src/services/api';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty, createMockClaim } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'bounty-1' });
  (api.get as jest.Mock).mockResolvedValue({ data: { claims: [] } });
});

afterEach(() => {
  clearAuthState();
});

describe('BountyDetailPage', () => {
  it('renders bounty title when loaded', async () => {
    const bounty = createMockBounty({ poster_id: 'someone-else' });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText('Build a Bird Feeder')).toBeTruthy();
    });
  });

  it('shows deliverables section', async () => {
    const bounty = createMockBounty({ poster_id: 'someone-else' });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText('Deliverables')).toBeTruthy();
    });
  });

  it('shows bounty not found on fetch error', async () => {
    (bountyAPI.get as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText('Bounty not found')).toBeTruthy();
    });
  });

  it('shows revision requested banner when claim has that status', async () => {
    const bounty = createMockBounty({ poster_id: 'someone-else' });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });
    // Return a claim with revision_requested status
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        claims: [createMockClaim({
          bounty_id: 'bounty-1',
          status: 'revision_requested',
          evidence: { completed_deliverables: ['d1'], deliverable_evidence: {} },
        })],
      },
    });

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText(/Revision requested/)).toBeTruthy();
    });
  });

  it('displays text evidence inline under deliverables', async () => {
    const bounty = createMockBounty({
      poster_id: 'someone-else',
      deliverables: [{ id: 'd1', text: 'Take a photo' }],
    });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        claims: [createMockClaim({
          bounty_id: 'bounty-1',
          status: 'claimed',
          evidence: {
            completed_deliverables: ['d1'],
            deliverable_evidence: {
              d1: [{ type: 'text', content: { text: 'Here is my evidence description' } }],
            },
          },
        })],
      },
    });

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText('Here is my evidence description')).toBeTruthy();
    });
  });

  it('shows Claim Bounty button for unclaimed bounty', async () => {
    const bounty = createMockBounty({ poster_id: 'someone-else' });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<BountyDetailPage />);

    await waitFor(() => {
      expect(getByText('Claim Bounty')).toBeTruthy();
    });
  });
});
