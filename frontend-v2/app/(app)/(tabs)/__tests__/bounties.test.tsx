/**
 * Bounties screen tests - renders cards, tab switcher, empty state,
 * reward labels (XP vs custom), claim progress bars.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useBounties', () => ({
  useBounties: jest.fn(),
  useMyClaims: jest.fn(),
  useMyPosted: jest.fn(),
  deleteBounty: jest.fn(),
}));

jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BountiesScreen from '../bounties';
import { useBounties, useMyClaims, useMyPosted } from '@/src/hooks/useBounties';
import { setAuthAsStudent, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty, createMockClaim } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useMyClaims as jest.Mock).mockReturnValue({ claims: [], loading: false, refetch: jest.fn() });
  (useMyPosted as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });
});

afterEach(() => {
  clearAuthState();
});

describe('BountiesScreen', () => {
  it('renders bounty cards from hook data and shows tab switcher', () => {
    const bounties = [
      createMockBounty(),
      createMockBounty({ id: 'b2', title: 'Write a Poem' }),
    ];
    (useBounties as jest.Mock).mockReturnValue({ bounties, loading: false, refetch: jest.fn() });

    const { getByText } = render(<BountiesScreen />);

    expect(getByText('Browse')).toBeTruthy();
    expect(getByText('My Claims')).toBeTruthy();
    expect(getByText('Posted')).toBeTruthy();
    expect(getByText('Build a Bird Feeder')).toBeTruthy();
    expect(getByText('Write a Poem')).toBeTruthy();
  });

  it('shows empty state when no bounties returned', () => {
    (useBounties as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });

    const { getByText } = render(<BountiesScreen />);

    expect(getByText('No bounties available')).toBeTruthy();
  });

  it('shows XP reward for bounties with xp_reward > 0', () => {
    (useBounties as jest.Mock).mockReturnValue({
      bounties: [createMockBounty({ xp_reward: 100 })],
      loading: false,
      refetch: jest.fn(),
    });

    const { getByText } = render(<BountiesScreen />);

    expect(getByText('100 XP')).toBeTruthy();
  });

  it('shows custom reward text for bounties with xp_reward = 0 and custom reward', () => {
    (useBounties as jest.Mock).mockReturnValue({
      bounties: [createMockBounty({
        xp_reward: 0,
        rewards: [{ type: 'custom', value: '0', text: 'Pizza night' }],
      })],
      loading: false,
      refetch: jest.fn(),
    });

    const { getByText } = render(<BountiesScreen />);

    expect(getByText('Pizza night')).toBeTruthy();
  });

  it('shows deliverable progress in claim cards', () => {
    (useBounties as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });
    (useMyClaims as jest.Mock).mockReturnValue({
      claims: [createMockClaim({
        status: 'claimed',
        evidence: { completed_deliverables: ['d1'], deliverable_evidence: {} },
        bounty: createMockBounty({
          deliverables: [
            { id: 'd1', text: 'First' },
            { id: 'd2', text: 'Second' },
          ],
        }),
      })],
      loading: false,
      refetch: jest.fn(),
    });

    const { getByText } = render(<BountiesScreen />);

    // Switch to claims tab
    fireEvent.press(getByText('My Claims'));

    expect(getByText('1/2 deliverables')).toBeTruthy();
  });
});
