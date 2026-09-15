/**
 * A child's Friends policy, the parent's side: one read, a write that
 * returns how many friendships it ended, and the count the off confirm
 * names before that happens.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { useFriendPolicy } from '../useFriendPolicy';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const POLICY = { student_id: 'kid-1', enabled: true, approval_mode: 'auto', request_sources: ['classmates', 'code', 'link'], friends_can: ['see', 'comment'], origin: 'child', reason: null, who_can_enable: null };

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(
    url.endsWith('/friends-count')
      ? { data: { success: true, data: { active: 3 } } }
      : { data: { success: true, data: { policy: POLICY, can_set: true } } },
  ));
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { policy: { ...POLICY, enabled: false }, revoked_count: 3 } } });
});
afterEach(() => clearAuthState());

describe('useFriendPolicy', () => {
  it('reads the policy and whether this adult may set it', async () => {
    const { result } = renderHook(() => useFriendPolicy('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/connections/children/kid-1/policy');
    expect(result.current.policy?.enabled).toBe(true);
    expect(result.current.canSet).toBe(true);
  });

  it('writes a patch and reports how many friendships it ended', async () => {
    const { result } = renderHook(() => useFriendPolicy('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let revoked = 0;
    await act(async () => { revoked = await result.current.save({ enabled: false }); });
    expect(api.put).toHaveBeenCalledWith('/api/connections/children/kid-1/policy', { enabled: false });
    expect(revoked).toBe(3);
    expect(result.current.policy?.enabled).toBe(false);
  });

  it('counts the friends the off confirm will name', async () => {
    const { result } = renderHook(() => useFriendPolicy('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(await result.current.friendsCount()).toBe(3);
    expect(api.get).toHaveBeenCalledWith('/api/connections/children/kid-1/friends-count');
  });

  it('is idle without a child', async () => {
    const { result } = renderHook(() => useFriendPolicy(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).not.toHaveBeenCalled();
  });
});
