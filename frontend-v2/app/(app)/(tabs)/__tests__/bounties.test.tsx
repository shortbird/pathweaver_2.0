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
import { setAuthAsStudent, setAuthAsParent, setAuthAsObserver, setAuthState, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty, createMockClaim, createMockUser } from '@/src/__tests__/utils/mockFactories';

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
  it('renders bounty cards and shows the multi-tab switcher for advisors', () => {
    // Students see Browse-only; parents and observers see the poster review-
    // queue layout; advisors/org_admins still get the 3-tab layout.
    setAuthState({ user: createMockUser({ role: 'advisor', email: 'a@x.com', first_name: 'A', last_name: 'V' }) });

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

  it('shows the review-queue layout for observers (same as parents)', () => {
    // Observers post bounties for the students they follow + review the
    // submissions on those bounties. Same JTBD as parents.
    setAuthAsObserver();
    (useBounties as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });
    (useMyClaims as jest.Mock).mockReturnValue({ claims: [], loading: false, refetch: jest.fn() });

    const { getByText, queryByText } = render(<BountiesScreen />);

    expect(queryByText('Browse')).toBeNull();
    expect(queryByText('My Claims')).toBeNull();
    expect(getByText('Post a new bounty')).toBeTruthy();
    expect(getByText('Needs your review')).toBeTruthy();
    expect(getByText('Posted by you')).toBeTruthy();
    expect(getByText('Browse for ideas')).toBeTruthy();
  });

  it('hides the Posted and My Claims tabs for students (browse-only)', () => {
    // Student default — claimed bounties surface on Home, not in a tab here.
    const bounties = [createMockBounty()];
    (useBounties as jest.Mock).mockReturnValue({ bounties, loading: false, refetch: jest.fn() });

    const { queryByText } = render(<BountiesScreen />);

    expect(queryByText('My Claims')).toBeNull();
    expect(queryByText('Posted')).toBeNull();
  });

  it('shows the review-queue layout for parents (Post button + Needs your review + Posted by you)', () => {
    // Parents' JTBD is review + post, not browse + claim. The 3-tab layout is replaced
    // by a dedicated review-queue surface.
    setAuthAsParent();
    (useBounties as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });
    (useMyClaims as jest.Mock).mockReturnValue({ claims: [], loading: false, refetch: jest.fn() });

    const { getByText, queryByText } = render(<BountiesScreen />);

    // Browse / My Claims tabs gone for parents.
    expect(queryByText('Browse')).toBeNull();
    expect(queryByText('My Claims')).toBeNull();
    // Review-queue sections present.
    expect(getByText('Post a new bounty')).toBeTruthy();
    expect(getByText('Needs your review')).toBeTruthy();
    expect(getByText('Posted by you')).toBeTruthy();
  });

  it('shows empty state when no bounties returned', () => {
    (useBounties as jest.Mock).mockReturnValue({ bounties: [], loading: false, refetch: jest.fn() });

    const { getByText } = render(<BountiesScreen />);

    expect(getByText('No bounties yet')).toBeTruthy();
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

  it('shows deliverable progress in claim cards (advisor view)', () => {
    // Claims tab exists for advisors/admins (parents and observers see the
    // poster review-queue layout instead).
    setAuthState({ user: createMockUser({ role: 'advisor', email: 'a@x.com', first_name: 'A', last_name: 'V' }) });

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
