/**
 * The family tab shows ONE child's week under their name, so it asks the
 * guardian schedule endpoint for that child directly rather than fetching the
 * whole family and throwing away the siblings.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useStudentSchedule } from '../useClassSchedule';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
});
afterEach(() => clearAuthState());

describe('useStudentSchedule', () => {
  it('asks for just this student, scoped to the org', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { classes: [{ id: 'c1', name: 'Pottery', meetings: [{ day_of_week: 2, start_time: '10:30', end_time: '11:30' }] }] },
    });

    const { result } = renderHook(() => useStudentSchedule('kid-1', 'org-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/parent/students/kid-1/schedule',
      { params: { organization_id: 'org-1' } },
    );
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.classes[0].name).toBe('Pottery');
  });

  it('asks for nothing without a student', async () => {
    const { result } = renderHook(() => useStudentSchedule(null, 'org-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.classes).toEqual([]);
  });

  it('treats a failure as "no schedule", not as an error to render', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useStudentSchedule('kid-1', 'org-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.classes).toEqual([]);
  });
});
