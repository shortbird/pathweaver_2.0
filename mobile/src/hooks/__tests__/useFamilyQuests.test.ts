/**
 * Family quests: the read, and the three writes the Family tab makes.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { createFamilyQuest, useFamilyQuests } from '../useFamilyQuests';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { quests: [{ id: 'q-1', title: 'NZ 101', members: [] }] } });
});
afterEach(() => clearAuthState());

describe('useFamilyQuests', () => {
  it('reads /api/family/quests', async () => {
    const { result } = renderHook(() => useFamilyQuests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/family/quests');
    expect(result.current.quests[0].title).toBe('NZ 101');
  });

  it('adds a child to a quest and refetches', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { enrolled: [{ child_id: 'kid-b' }], failed: [] } });
    const { result } = renderHook(() => useFamilyQuests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.enrollChildren('q-1', ['kid-b']); });
    expect(api.post).toHaveBeenCalledWith('/api/family/quests/q-1/enroll-children', { child_ids: ['kid-b'] });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("ends a child's run with student_id, and the parent's own without", async () => {
    const { result } = renderHook(() => useFamilyQuests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.endMemberQuest('q-1', 'kid-a'); });
    expect(api.post).toHaveBeenCalledWith('/api/quests/q-1/end', { student_id: 'kid-a' });
    await act(async () => { await result.current.endMemberQuest('q-1', null); });
    expect(api.post).toHaveBeenCalledWith('/api/quests/q-1/end', {});
  });
});

describe('createFamilyQuest', () => {
  it('creates on the parent account, then enrolls the picked children', async () => {
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { quest_id: 'q-new' } })
      .mockResolvedValueOnce({ data: { enrolled: [{ child_id: 'kid-a' }], failed: [{ child_id: 'kid-b', error: 'already enrolled' }] } });
    const res = await createFamilyQuest({ title: 'Garden' }, ['kid-a', 'kid-b']);
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/family/quests/create', { title: 'Garden' });
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/family/quests/q-new/enroll-children', { child_ids: ['kid-a', 'kid-b'] });
    expect(res).toEqual({ questId: 'q-new', failed: [{ child_id: 'kid-b', error: 'already enrolled' }] });
  });

  it('skips the enroll call when nobody was picked', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { quest_id: 'q-new' } });
    await createFamilyQuest({ title: 'Garden' }, []);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
