/**
 * Review bounty page tests - evidence preview, deliverable labels, review actions.
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
import ReviewBountyPage from '../../review/[id]';
import { bountyAPI } from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'bounty-1' });
});

afterEach(() => {
  clearAuthState();
});

describe('ReviewBountyPage', () => {
  it('renders bounty title and claim counts', async () => {
    const bounty = {
      ...createMockBounty({ poster_id: 'parent-1' }),
      claims: [
        {
          id: 'claim-1',
          student_id: 'student-1',
          status: 'submitted',
          created_at: '2026-03-20T10:00:00Z',
          student: { display_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe' },
          evidence: {
            completed_deliverables: ['d1'],
            deliverable_evidence: {
              d1: [{ type: 'text', content: { text: 'My evidence' } }],
            },
          },
        },
      ],
    };
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<ReviewBountyPage />);

    await waitFor(() => {
      expect(getByText('Build a Bird Feeder')).toBeTruthy();
    });
    expect(getByText('1 claimed | 1 awaiting review')).toBeTruthy();
  });

  it('shows student name and evidence text in review card', async () => {
    const bounty = {
      ...createMockBounty({
        poster_id: 'parent-1',
        deliverables: [{ id: 'd1', text: 'Photo of completed feeder' }],
      }),
      claims: [
        {
          id: 'claim-1',
          student_id: 'student-1',
          status: 'submitted',
          created_at: '2026-03-20T10:00:00Z',
          student: { display_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe' },
          evidence: {
            completed_deliverables: ['d1'],
            deliverable_evidence: {
              d1: [{ type: 'text', content: { text: 'Built it from recycled wood' } }],
            },
          },
        },
      ],
    };
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText, getAllByText } = render(<ReviewBountyPage />);

    await waitFor(() => {
      expect(getByText('Jane Doe')).toBeTruthy();
    });
    // Deliverable label appears in bounty info card + claim review card
    expect(getAllByText('Photo of completed feeder').length).toBeGreaterThanOrEqual(1);
    // Actual evidence text
    expect(getByText('Built it from recycled wood')).toBeTruthy();
  });

  it('shows review action buttons for submitted claims', async () => {
    const bounty = {
      ...createMockBounty({ poster_id: 'parent-1' }),
      claims: [
        {
          id: 'claim-1',
          student_id: 'student-1',
          status: 'submitted',
          created_at: '2026-03-20T10:00:00Z',
          student: { display_name: 'Jane', first_name: 'Jane', last_name: 'D' },
          evidence: { completed_deliverables: [], deliverable_evidence: {} },
        },
      ],
    };
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<ReviewBountyPage />);

    await waitFor(() => {
      expect(getByText('Approve')).toBeTruthy();
    });
    expect(getByText('Revise')).toBeTruthy();
  });

  it('shows no claims empty state', async () => {
    const bounty = {
      ...createMockBounty({ poster_id: 'parent-1' }),
      claims: [],
    };
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText } = render(<ReviewBountyPage />);

    await waitFor(() => {
      expect(getByText('No claims yet')).toBeTruthy();
    });
  });

  it('shows bounty not found on error', async () => {
    (bountyAPI.get as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

    const { getByText } = render(<ReviewBountyPage />);

    await waitFor(() => {
      expect(getByText('Bounty not found')).toBeTruthy();
    });
  });
});
