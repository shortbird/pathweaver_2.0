/**
 * useClassSchedule's guardian reads and the classes module.
 *
 * /api/sis/parent/students/<id>/schedule is gated on 'classes'
 * (backend/routes/sis/parent.py); the module gate 404s it for a school that
 * does not run classes once enforcement is on. A school known to be without
 * the module gets no per-child reads at all.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useClassSchedule } from '../useClassSchedule';

jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());

const mockChildren = [{ id: 'kid-1', display_name: 'Madeleine' }];
jest.mock('../useParent', () => ({
  useMyChildren: () => ({ children: mockChildren, loading: false }),
}));

const setUser = (user: any) => {
  act(() => {
    useAuthStore.setState({ user, isAuthenticated: !!user, isLoading: false });
  });
};

const scheduleCalls = () => (api.get as jest.Mock).mock.calls
  .filter(([u]) => String(u).startsWith('/api/sis/parent/students/'));

beforeEach(() => {
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, classes: [] } });
});

afterEach(() => {
  setUser(null);
  jest.clearAllMocks();
});

describe('useClassSchedule and the classes module', () => {
  it('reads each child\'s schedule when nothing says classes is off', async () => {
    setUser({ id: 'p1', role: 'parent', organization_id: null, organization: null });
    const { result } = renderHook(() => useClassSchedule('org-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scheduleCalls()).toHaveLength(1);
    expect(scheduleCalls()[0][0]).toBe('/api/sis/parent/students/kid-1/schedule');
  });

  it('reads nothing when the caller knows the school runs no classes', async () => {
    setUser({ id: 'p1', role: 'parent', organization_id: null, organization: null });
    const { result } = renderHook(() => useClassSchedule('org-1', { classesOff: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scheduleCalls()).toHaveLength(0);
    expect(result.current.schedules).toEqual([]);
  });

  it('reads nothing when the user\'s own org lists its modules without classes', async () => {
    // An org-member parent on a child's page: no hub row there, so the org on
    // /me answers.
    setUser({
      id: 'p1', role: 'org_managed', org_role: 'parent', organization_id: 'org-1',
      organization: { id: 'org-1', effective_modules: ['sis', 'attendance'] },
    });
    const { result } = renderHook(() => useClassSchedule());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scheduleCalls()).toHaveLength(0);
  });

  it('still reads when the own org runs classes', async () => {
    setUser({
      id: 'p1', role: 'org_managed', org_role: 'parent', organization_id: 'org-1',
      organization: { id: 'org-1', effective_modules: ['sis', 'classes'] },
    });
    const { result } = renderHook(() => useClassSchedule());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scheduleCalls()).toHaveLength(1);
  });
});
