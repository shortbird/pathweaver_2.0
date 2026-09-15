/**
 * Peer-connection approvals, the parent's side: one read, decide and
 * revoke refetch it, and forChild slices it per card.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { forChild, useConnectionApprovals } from '../useConnectionApprovals';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const payload = {
  pending: [{ id: 'r-1', connection_id: 'c-1', child: { id: 'kid-a', display_name: 'Romney' }, peer: { id: 'p', display_name: 'Tyler' } }],
  approved: [{ connection_id: 'c-0', child: { id: 'kid-b', display_name: 'Hope' }, peer: { id: 'p2', display_name: 'Banks' } }],
};

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: payload } });
});
afterEach(() => clearAuthState());

describe('useConnectionApprovals', () => {
  it('reads the approvals list once', async () => {
    const { result } = renderHook(() => useConnectionApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/connections/approvals');
    expect(result.current.data.pending).toHaveLength(1);
    expect(result.current.data.approved).toHaveLength(1);
  });

  it('decide posts, then refetches', async () => {
    const { result } = renderHook(() => useConnectionApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.decide('c-1', true); });
    expect(api.post).toHaveBeenCalledWith('/api/connections/c-1/approve', { approve: true });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('forChild', () => {
  it('keeps only the rows about that child', () => {
    expect(forChild(payload as any, 'kid-a')).toEqual({ pending: payload.pending, approved: [] });
    expect(forChild(payload as any, 'kid-b')).toEqual({ pending: [], approved: payload.approved });
    expect(forChild(null, 'kid-a')).toEqual({ pending: [], approved: [] });
  });
});
