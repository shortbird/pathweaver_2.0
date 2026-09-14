/**
 * Family scope on the dashboard hooks: a parent reads the CHILD's rows from
 * the same route the child uses, and trusts the answer only when the backend
 * says whose it is (the `scope` marker). A backend that ignored the parameter
 * would have answered with the PARENT's rows under the child's name.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useDashboard, useGlobalEngagement, scopedTo } from '../useDashboard';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('../useRefetchOnForeground', () => ({ useRefetchOnForeground: jest.fn() }));

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
});
afterEach(() => clearAuthState());

describe('scopedTo', () => {
  it('is always true for an unscoped read', () => {
    expect(scopedTo({ anything: 1 }, null)).toBe(true);
  });
  it('needs the marker to name the child asked for', () => {
    expect(scopedTo({ scope: { delegated: true, student_id: 'kid-1' } }, 'kid-1')).toBe(true);
    expect(scopedTo({ scope: { delegated: true, student_id: 'kid-2' } }, 'kid-1')).toBe(false);
    expect(scopedTo({ active_quests: [] }, 'kid-1')).toBe(false);
  });
});

describe('useDashboard in family scope', () => {
  it('asks for the child and keeps a scoped answer', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { active_quests: [{ id: 'q1' }], scope: { delegated: true, student_id: 'kid-1' } },
    });
    const { result } = renderHook(() => useDashboard('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/users/dashboard', { params: { student_id: 'kid-1' } });
    expect(result.current.data?.active_quests).toHaveLength(1);
    expect(result.current.unsupported).toBe(false);
  });

  it('refuses an unmarked answer rather than show the parent\'s rows', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { active_quests: [{ id: 'parents-own' }] } });
    const { result } = renderHook(() => useDashboard('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.unsupported).toBe(true);
  });

  it('sends no parameter and trusts the answer when unscoped', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { active_quests: [] } });
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/users/dashboard', { params: undefined });
    expect(result.current.unsupported).toBe(false);
  });
});

describe('useGlobalEngagement in family scope', () => {
  it('reads the child\'s rhythm from the student route', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { engagement: { rhythm: { state: 'steady' } }, scope: { delegated: true, student_id: 'kid-1' } },
    });
    const { result } = renderHook(() => useGlobalEngagement('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/users/me/engagement', { timeout: 30000, params: { student_id: 'kid-1' } });
    expect(result.current.data?.rhythm?.state).toBe('steady');
  });

  it('falls back to the parent endpoint against a backend that ignored the scope', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({ data: { engagement: { rhythm: { state: 'parents-own' } } } })
      .mockResolvedValueOnce({ data: { engagement: { rhythm: { state: 'childs' } } } });
    const { result } = renderHook(() => useGlobalEngagement('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenLastCalledWith('/api/parent/kid-1/engagement', { timeout: 30000 });
    expect(result.current.data?.rhythm?.state).toBe('childs');
  });
});
