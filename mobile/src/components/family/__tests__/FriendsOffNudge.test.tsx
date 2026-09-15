/**
 * FriendsOffNudge - the one line that brings the Friends switch to the
 * child's Family card. Shows only when a parent can turn it on; one tap does.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FriendsOffNudge } from '../FriendsOffNudge';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const policy = (over: Record<string, unknown>) => ({
  student_id: 's1', enabled: false, approval_mode: 'auto', request_sources: ['classmates'],
  friends_can: ['see'], origin: 'none', reason: null, who_can_enable: 'parent', ...over,
});

describe('FriendsOffNudge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAuthAsParent({ id: 'p1' });
  });
  afterEach(() => clearAuthState());

  it('turns Friends on with one tap', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: { policy: policy({}), can_set: true } } });
    (api.put as jest.Mock).mockResolvedValue({ data: { data: { policy: policy({ enabled: true }), revoked_count: 0 } } });
    const { findByTestId } = render(<FriendsOffNudge childId="s1" childFirstName="Robin" />);
    fireEvent.press(await findByTestId('friends-turn-on-s1'));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy', { enabled: true });
    });
  });

  it('renders nothing once Friends is on, or when this adult may not set it', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: { policy: policy({ enabled: true }), can_set: true } } });
    const on = render(<FriendsOffNudge childId="s1" childFirstName="Robin" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(on.queryByTestId('friends-off-nudge-s1')).toBeNull();

    (api.get as jest.Mock).mockResolvedValue({ data: { data: { policy: policy({}), can_set: false } } });
    const cannot = render(<FriendsOffNudge childId="s2" childFirstName="Sam" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(cannot.queryByTestId('friends-off-nudge-s2')).toBeNull();
  });
});
