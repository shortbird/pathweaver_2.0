/**
 * useProfile hook tests - parallel data fetch, profile editing.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useProfile } from '../useProfile';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useProfile', () => {
  it('fetches dashboard + completed quests + subject XP in parallel', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({ data: { xp_by_category: { stem: 500, art: 200 } } })
      .mockResolvedValueOnce({ data: { achievements: [{ id: 'a1', title: 'Math Quest' }] } })
      .mockResolvedValueOnce({ data: { subjects: [{ school_subject: 'Math', xp_amount: 300, pending_xp: 50 }] } });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/users/dashboard');
    expect(api.get).toHaveBeenCalledWith('/api/quests/completed');
    expect(api.get).toHaveBeenCalledWith('/api/users/subject-xp');

    expect(result.current.pillarXP).toHaveLength(2);
    expect(result.current.achievements).toHaveLength(1);
    expect(result.current.subjectXP).toHaveLength(1);
    expect(result.current.subjectXP[0].school_subject).toBe('Math');
  });

  it('edit profile: PUT /api/users/profile with updated fields', async () => {
    (api.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await api.put('/api/users/profile', { display_name: 'New Name', first_name: 'New' });

    expect(api.put).toHaveBeenCalledWith('/api/users/profile', {
      display_name: 'New Name',
      first_name: 'New',
    });
  });
});
